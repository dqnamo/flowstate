import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";
import adminDb, { id } from "@/lib/server/admin-db";
import { requireUser } from "@/lib/server/auth";
import { requireProjectForUser } from "@/lib/server/projects";
import type { processRunTask } from "@/trigger/process-run";

type RouteContext = {
  params: Promise<{ projectId: string; runId: string; changeId: string }>;
};

type ReviewAction = "commented" | "reviewed";

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { projectId, runId, changeId } = await context.params;
    const project = await requireProjectForUser(projectId, user.id);
    const run = project.runs?.find((item) => item.id === runId);
    const change = run?.codeChanges?.find((item) => item.id === changeId);
    const body = (await req.json()) as {
      action?: ReviewAction;
      comment?: string;
    };
    const action = body.action;
    const comment = body.comment?.trim() ?? "";

    if (!run || !change) {
      return NextResponse.json(
        { message: "Change not found" },
        { status: 404 },
      );
    }

    if (action !== "reviewed" && action !== "commented") {
      return NextResponse.json(
        { message: "Review action must be reviewed or commented" },
        { status: 400 },
      );
    }

    if (action === "commented" && !comment) {
      return NextResponse.json(
        { message: "Comment is required" },
        { status: 400 },
      );
    }

    const now = new Date();
    await adminDb.transact([
      adminDb.tx.codeChanges[changeId].update(
        action === "reviewed"
          ? {
              status: "reviewed",
              comment: "",
              reviewedAt: now,
            }
          : {
              status: "commented",
              comment,
              commentedAt: now,
            },
      ),
      await createRunEvent(runId, user.id, `change.${action}`, {
        changeId,
        title: change.title,
        comment: action === "commented" ? comment : undefined,
      }),
    ]);

    const submission = await maybeSubmitReviewFeedback({
      projectId,
      runId,
      ownerId: user.id,
    });

    return NextResponse.json({ ok: true, ...submission });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to review change",
      },
      { status: 500 },
    );
  }
}

async function maybeSubmitReviewFeedback({
  projectId,
  runId,
  ownerId,
}: {
  projectId: string;
  runId: string;
  ownerId: string;
}) {
  const run = await getReviewRun(runId, ownerId);

  if (!run || run.reviewSubmittedAt) {
    return { submitted: false };
  }

  const changes = run.codeChanges ?? [];
  const allResolved =
    changes.length > 0 &&
    changes.every(
      (change) => change.status === "reviewed" || change.status === "commented",
    );

  if (!allResolved) {
    return { submitted: false };
  }

  const commentedChanges = changes.filter(
    (change) => change.status === "commented" && change.comment?.trim(),
  );
  const now = new Date();

  if (commentedChanges.length === 0) {
    await adminDb.transact([
      adminDb.tx.runs[runId].update({
        status: "review_complete",
        reviewSubmittedAt: now,
      }),
      await createRunEvent(runId, ownerId, "feedback.submitted", {
        mode: "approved",
      }),
    ]);

    return { submitted: true, feedbackRunId: undefined };
  }

  const feedbackRunId = id();
  const sequence = await getNextEventSequence(runId, ownerId);
  await adminDb.transact([
    adminDb.tx.runs[runId].update({
      status: "feedback_queued",
      reviewSubmittedAt: now,
      feedbackRunId,
    }),
    adminDb.tx.runs[feedbackRunId]
      .create({
        ownerId,
        prompt: buildFeedbackPrompt(commentedChanges),
        status: "queued",
        parentRunId: runId,
        createdAt: now,
      })
      .link({ project: projectId }),
    createRunEventTx(runId, ownerId, sequence, "feedback.submitted", {
      mode: "comments",
      comments: commentedChanges.length,
    }),
    createRunEventTx(runId, ownerId, sequence + 1, "feedback.run_created", {
      feedbackRunId,
    }),
  ]);

  const handle = await tasks.trigger<typeof processRunTask>(
    "process-run",
    { runId: feedbackRunId },
    { idempotencyKey: `process-run-${feedbackRunId}` },
  );

  return { submitted: true, feedbackRunId, triggerRunId: handle.id };
}

async function getReviewRun(runId: string, ownerId: string) {
  const { runs } = await adminDb.query({
    runs: {
      $: {
        where: {
          id: runId,
          ownerId,
        },
      },
      codeChanges: {},
      events: {},
    },
  });

  return runs[0];
}

async function createRunEvent(
  runId: string,
  ownerId: string,
  type: string,
  payload: unknown,
) {
  const sequence = await getNextEventSequence(runId, ownerId);

  return createRunEventTx(runId, ownerId, sequence, type, payload);
}

function createRunEventTx(
  runId: string,
  ownerId: string,
  sequence: number,
  type: string,
  payload: unknown,
) {
  return adminDb.tx.events[id()]
    .create({
      ownerId,
      scope: "run",
      sequence,
      type,
      payload,
      createdAt: new Date(),
    })
    .link({ run: runId });
}

async function getNextEventSequence(runId: string, ownerId: string) {
  const run = await getReviewRun(runId, ownerId);
  const sequences =
    run?.events
      ?.map((event) => event.sequence)
      .filter((sequence): sequence is number => typeof sequence === "number") ??
    [];

  return sequences.length > 0 ? Math.max(...sequences) + 1 : 0;
}

function buildFeedbackPrompt(
  changes: {
    title: string;
    summary?: string | null;
    files?: unknown;
    comment?: string | null;
  }[],
) {
  const feedback = changes
    .map((change, index) => {
      const files = Array.isArray(change.files)
        ? change.files.filter((file) => typeof file === "string").join(", ")
        : "";

      return [
        `${index + 1}. ${change.title}`,
        change.summary ? `Summary: ${change.summary}` : undefined,
        files ? `Files: ${files}` : undefined,
        `Engineer feedback: ${change.comment?.trim()}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    "Continue from the previous Flowstate run and address the engineer feedback below.",
    "Only change what is needed to satisfy the feedback. Keep accepted/reviewed changes intact.",
    "",
    feedback,
  ].join("\n");
}

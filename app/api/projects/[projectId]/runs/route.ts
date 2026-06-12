import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";
import adminDb, { id } from "@/lib/server/admin-db";
import { requireUser } from "@/lib/server/auth";
import {
  getPrimaryCodexAgent,
  requireProjectForUser,
} from "@/lib/server/projects";
import type { processRunTask } from "@/trigger/process-run";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { projectId } = await context.params;
    const project = await requireProjectForUser(projectId, user.id);
    const agent = getPrimaryCodexAgent(project);
    const body = (await req.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json(
        { message: "Prompt is required" },
        { status: 400 },
      );
    }

    if (!project.githubRepositoryFullName || !project.githubInstallationId) {
      return NextResponse.json(
        { message: "Project repository is not connected" },
        { status: 400 },
      );
    }

    if (agent?.status !== "ready") {
      return NextResponse.json(
        { message: "Codex agent is not ready" },
        { status: 400 },
      );
    }

    const runId = id();
    await adminDb.transact(
      adminDb.tx.runs[runId]
        .create({
          ownerId: user.id,
          prompt,
          status: "queued",
          createdAt: new Date(),
        })
        .link({ project: projectId }),
    );

    const handle = await tasks.trigger<typeof processRunTask>(
      "process-run",
      { runId },
      { idempotencyKey: `process-run-${runId}` },
    );

    return NextResponse.json({ runId, triggerRunId: handle.id });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to create run",
      },
      { status: 500 },
    );
  }
}

"use client";

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { FileDiff } from "@pierre/diffs/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
import CornerCubes from "@/components/CornerCubes";
import DitheredWaves from "@/components/DitheredWaves";
import { InputBrackets } from "@/components/Input";
import SetupSteps from "@/components/SetupSteps";
import SignOutButton from "@/components/SignOutButton";
import db from "@/lib/db";

type WorkspaceMode = "overview" | "new-run" | "run";

const DEFAULT_PREVIEW_SIZE = 520;
const MIN_PREVIEW_SIZE = 320;
const MAX_PREVIEW_SIZE = 860;

type Repository = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
};

type Run = {
  id: string;
  status?: string | null;
  prompt?: string | null;
  createdAt?: Date | string | number | null;
  responseText?: string | null;
  previewBaseUrl?: string | null;
  branchName?: string | null;
  pullRequestUrl?: string | null;
  pullRequestNumber?: number | null;
  error?: string | null;
  events?: {
    id: string;
    scope?: string | null;
    sequence?: number | null;
    type?: string | null;
    raw?: string | null;
    payload?: unknown;
    createdAt?: Date | string | number | null;
  }[];
  codeChanges?: {
    id: string;
    title: string;
    summary?: string | null;
    files?: unknown;
    previewPath?: string | null;
    diff?: string | null;
    status?: string | null;
    comment?: string | null;
    reviewedAt?: Date | string | number | null;
    commentedAt?: Date | string | number | null;
  }[];
};

function ShortcutBadge({ children }: { children: string }) {
  return (
    <kbd className="ml-1 inline-flex h-5 min-w-5 items-center justify-center bg-black/10 px-1 font-mono text-xs leading-none">
      {children}
    </kbd>
  );
}

export default function ProjectWorkspace({ mode }: { mode: WorkspaceMode }) {
  return (
    <AuthGate>
      <ProjectView mode={mode} />
    </AuthGate>
  );
}

function ProjectView({ mode }: { mode: WorkspaceMode }) {
  const { projectId, runId } = useParams<{
    projectId: string;
    runId?: string;
  }>();
  const { user } = db.useAuth();
  const { data, isLoading, error } = db.useQuery(
    user
      ? {
          projects: {
            $: {
              where: {
                id: projectId,
                ownerId: user.id,
              },
            },
            codingAgents: {},
            runs: {
              codeChanges: {},
              events: {},
            },
          },
        }
      : null,
  );
  const project = data?.projects?.[0];
  const agent = project?.codingAgents?.find(
    (item) => item.provider === "codex",
  );
  const runs = useMemo(
    () =>
      [...((project?.runs ?? []) as Run[])].sort(
        (first, second) =>
          new Date(second.createdAt ?? 0).getTime() -
          new Date(first.createdAt ?? 0).getTime(),
      ),
    [project?.runs],
  );
  const currentRun =
    mode === "run" ? runs.find((run) => run.id === runId) : undefined;
  const currentRunIndex = currentRun
    ? runs.findIndex((run) => run.id === currentRun.id)
    : -1;
  const previousRun =
    currentRunIndex >= 0 ? runs[currentRunIndex + 1] : undefined;
  const nextRun = currentRunIndex > 0 ? runs[currentRunIndex - 1] : undefined;
  const activeStep = getActiveSetupStep(project?.status, agent?.status);

  return (
    <main
      className={
        mode === "run"
          ? "flex h-dvh min-h-0 flex-col overflow-hidden"
          : "flex min-h-full flex-col"
      }
    >
      {mode !== "new-run" ? (
        <ProjectHeader
          project={project}
          previousHref={
            previousRun ? getRunHref(projectId, previousRun.id) : undefined
          }
          nextHref={nextRun ? getRunHref(projectId, nextRun.id) : undefined}
        />
      ) : null}

      {isLoading ? (
        <p className="text-sm text-grayscale-10">Loading...</p>
      ) : null}
      {error ? (
        <p className="text-sm text-grayscale-10">{error.message}</p>
      ) : null}
      {!isLoading && !project ? (
        <p className="text-sm text-grayscale-10">Project not found.</p>
      ) : null}

      {project && activeStep < 5 ? (
        <SetupSteps activeStep={activeStep} />
      ) : null}

      {project?.status === "selecting_repo" ? (
        <RepositoryPicker projectId={project.id} token={user?.refresh_token} />
      ) : null}

      {project &&
      project.status !== "selecting_repo" &&
      agent?.status !== "ready" ? (
        <AgentSetup
          agent={agent}
          projectId={project.id}
          projectStatus={project.status}
          token={user?.refresh_token}
        />
      ) : null}

      {project?.status === "ready" && agent?.status === "ready" ? (
        <ReadyProject
          mode={mode}
          projectId={project.id}
          run={currentRun}
          runs={runs}
          token={user?.refresh_token}
        />
      ) : null}
    </main>
  );
}

function ProjectHeader({
  project,
  previousHref,
  nextHref,
}: {
  project?: {
    name?: string | null;
    githubRepositoryFullName?: string | null;
    githubRepositoryUrl?: string | null;
    branch?: string | null;
  };
  previousHref?: string;
  nextHref?: string;
}) {
  const router = useRouter();

  useHotkeys(
    "left",
    () => {
      if (previousHref) {
        router.push(previousHref);
      }
    },
    { enabled: Boolean(previousHref), preventDefault: true },
  );

  useHotkeys(
    "right",
    () => {
      if (nextHref) {
        router.push(nextHref);
      }
    },
    { enabled: Boolean(nextHref), preventDefault: true },
  );

  const repoName =
    project?.githubRepositoryFullName ?? project?.name ?? "Project";
  const branch = project?.branch ?? "main";

  return (
    <header className="flex items-center justify-between gap-3 border-b border-grayscale-4 px-3 py-2">
      <div className="min-w-0">
        {project?.githubRepositoryUrl ? (
          <a
            href={project.githubRepositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium text-grayscale-12"
          >
            {repoName}
          </a>
        ) : (
          <h1 className="truncate text-sm font-medium text-grayscale-12">
            {repoName}
          </h1>
        )}
        <p className="text-xs text-grayscale-10">{branch}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NavButton href={previousHref} label="Previous" shortcut="←" />
        <NavButton href={nextHref} label="Next" shortcut="→" />
        <SignOutButton />
      </div>
    </header>
  );
}

function NavButton({
  href,
  label,
  shortcut,
}: {
  href?: string;
  label: string;
  shortcut: string;
}) {
  const content = (
    <Button
      type="button"
      disabled={!href}
      className={!href ? "opacity-40 hover:scale-100" : undefined}
    >
      {label}
      <ShortcutBadge>{shortcut}</ShortcutBadge>
    </Button>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function ReadyProject({
  mode,
  projectId,
  run,
  runs,
  token,
}: {
  mode: WorkspaceMode;
  projectId: string;
  run?: Run;
  runs: Run[];
  token?: string;
}) {
  const router = useRouter();
  const newRunHref = `/app/projects/${projectId}/runs/new`;

  useHotkeys(
    "n",
    () => {
      router.push(newRunHref);
    },
    { preventDefault: true },
  );

  if (mode === "new-run") {
    return <PromptBox projectId={projectId} token={token} />;
  }

  if (mode === "run") {
    return run ? (
      <RunReview projectId={projectId} run={run} runs={runs} token={token} />
    ) : (
      <p className="text-sm text-grayscale-10">Run not found.</p>
    );
  }

  return (
    <section className="flex max-w-2xl flex-col gap-3">
      <div>
        <Link href={newRunHref}>
          <Button type="button">
            New run
            <ShortcutBadge>N</ShortcutBadge>
          </Button>
        </Link>
      </div>
      <div className="flex flex-col divide-y divide-grayscale-4 border border-grayscale-4 bg-white">
        {runs.length > 0 ? (
          runs.map((run) => (
            <Link
              key={run.id}
              href={getRunHref(projectId, run.id)}
              className="flex items-center justify-between gap-3 p-3 text-sm text-grayscale-12"
            >
              <span className="min-w-0 truncate">
                {run.prompt ?? `Run ${run.id.slice(0, 8)}`}
              </span>
              <span className="shrink-0 text-xs text-grayscale-10">
                {run.status}
              </span>
            </Link>
          ))
        ) : (
          <p className="p-3 text-sm text-grayscale-10">No runs yet.</p>
        )}
      </div>
    </section>
  );
}

function getActiveSetupStep(
  projectStatus?: string | null,
  agentStatus?: string | null,
) {
  if (projectStatus === "ready" && agentStatus === "ready") {
    return 5;
  }

  if (projectStatus === "selecting_repo") {
    return 3;
  }

  if (projectStatus === "connecting_github") {
    return 2;
  }

  return 4;
}

function getRunHref(projectId: string, runId: string) {
  return `/app/projects/${projectId}/runs/${runId}`;
}

function getNextHumanInputHref(
  projectId: string,
  runs: Run[],
  currentRunId: string,
) {
  const nextRun = runs.find(
    (run) =>
      run.id !== currentRunId &&
      run.status === "ready_for_review" &&
      (run.codeChanges ?? []).some((change) => !isChangeResolved(change)),
  );

  return nextRun ? getRunHref(projectId, nextRun.id) : undefined;
}

function RepositoryPicker({
  projectId,
  token,
}: {
  projectId: string;
  token?: string;
}) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    fetch(`/api/projects/${projectId}/repositories`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          repositories?: Repository[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(body.message ?? "Failed to load repositories");
        }

        setRepositories(body.repositories ?? []);
      })
      .catch((error) => {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to load repositories",
        );
      })
      .finally(() => setIsLoading(false));
  }, [projectId, token]);

  const saveRepository = async () => {
    if (!token || !selectedRepositoryId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/repositories`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repositoryId: selectedRepositoryId }),
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? "Failed to save repository");
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to save repository",
      );
      setIsSubmitting(false);
    }
  };

  useHotkeys(
    "c",
    () => {
      void saveRepository();
    },
    {
      enabled: Boolean(selectedRepositoryId) && !isSubmitting,
      preventDefault: true,
    },
  );

  return (
    <section className="flex max-w-xl flex-col gap-3 border border-grayscale-4 bg-white p-3">
      <h2 className="text-sm font-medium text-grayscale-12">
        Select repository
      </h2>
      {isLoading ? (
        <p className="text-sm text-grayscale-10">Loading repos...</p>
      ) : null}
      {repositories.length > 0 ? (
        <select
          className="bg-grayscale-2 p-2 text-sm text-grayscale-12"
          value={selectedRepositoryId ?? ""}
          onChange={(event) =>
            setSelectedRepositoryId(Number(event.target.value))
          }
        >
          <option value="">Choose repo</option>
          {repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.fullName}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <p className="text-xs text-grayscale-10">{error}</p> : null}
      <div>
        <Button
          type="button"
          disabled={!selectedRepositoryId || isSubmitting}
          onClick={() => {
            void saveRepository();
          }}
        >
          {isSubmitting ? "Saving..." : "Connect Codex"}
          <ShortcutBadge>C</ShortcutBadge>
        </Button>
      </div>
    </section>
  );
}

function AgentSetup({
  agent,
  projectId,
  projectStatus,
  token,
}: {
  agent?: {
    id: string;
    status?: string | null;
    deviceAuthUrl?: string | null;
    deviceAuthCode?: string | null;
    setupError?: string | null;
  };
  projectId: string;
  projectStatus: string;
  token?: string;
}) {
  const [error, setError] = useState<string>();
  const [isStarting, setIsStarting] = useState(false);
  const status = agent?.status ?? projectStatus;
  const hasDeviceAuth = Boolean(agent?.deviceAuthUrl && agent.deviceAuthCode);
  const statusMessage = getAgentStatusMessage(status, hasDeviceAuth);
  const canRetry =
    status === "creating" ||
    status === "setup_queued" ||
    status === "setup_failed" ||
    status === "requesting_login" ||
    (status === "awaiting_login" && !hasDeviceAuth);

  const startSetup = async () => {
    if (!token || isStarting) {
      return;
    }

    setIsStarting(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/agents/setup`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message ?? "Failed to start Codex setup");
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to start Codex setup",
      );
      setIsStarting(false);
    }
  };

  useHotkeys(
    "r",
    () => {
      void startSetup();
    },
    { enabled: canRetry && !isStarting, preventDefault: true },
  );

  return (
    <section className="flex max-w-xl flex-col gap-3 border border-grayscale-4 bg-white p-3">
      <div>
        <h2 className="text-sm font-medium text-grayscale-12">Codex setup</h2>
        <p className="text-sm text-grayscale-10">{statusMessage}</p>
      </div>
      {agent?.deviceAuthUrl && agent.deviceAuthCode ? (
        <div className="flex flex-col gap-2">
          <a
            href={agent.deviceAuthUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent-11"
          >
            Open Codex device login
          </a>
          <p className="font-mono text-lg text-grayscale-12">
            {agent.deviceAuthCode}
          </p>
        </div>
      ) : null}
      {agent?.setupError ? (
        <p className="text-xs text-grayscale-10">{agent.setupError}</p>
      ) : null}
      {error ? <p className="text-xs text-grayscale-10">{error}</p> : null}
      {canRetry ? (
        <div>
          <Button
            type="button"
            disabled={isStarting}
            onClick={() => {
              void startSetup();
            }}
          >
            {isStarting ? "Starting..." : "Retry setup"}
            <ShortcutBadge>R</ShortcutBadge>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function getAgentStatusMessage(status?: string | null, hasDeviceAuth = false) {
  if (status === "setup_queued") {
    return "Setup is queued. Waiting for the Trigger worker.";
  }

  if (status === "creating") {
    return "Setup was queued, but the worker has not reported progress yet.";
  }

  if (status === "setting_up") {
    return "Creating an E2B sandbox and installing Codex.";
  }

  if (status === "requesting_login") {
    return "Waiting for Codex to print a device login code.";
  }

  if (status === "awaiting_login") {
    if (!hasDeviceAuth) {
      return "Codex login started, but no device code was captured yet.";
    }

    return "Open the device login link and enter the code.";
  }

  if (status === "setup_failed") {
    return "Codex setup failed. Retry after checking Trigger and E2B env vars.";
  }

  return status ?? "Waiting for Codex setup.";
}

function PromptBox({
  projectId,
  token,
}: {
  projectId: string;
  token?: string;
}) {
  const router = useRouter();
  const promptId = useId();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRun = async () => {
    if (!token || !prompt.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt }),
      });
      const body = (await response.json()) as {
        runId?: string;
        message?: string;
      };

      if (!response.ok || !body.runId) {
        throw new Error(body.message ?? "Failed to start run");
      }

      router.push(getRunHref(projectId, body.runId));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to start run");
      setIsSubmitting(false);
    }
  };

  useHotkeys(
    "mod+enter",
    () => {
      void submitRun();
    },
    {
      enabled: Boolean(prompt.trim()) && !isSubmitting,
      enableOnFormTags: ["INPUT", "TEXTAREA"],
      preventDefault: true,
    },
  );

  return (
    <form
      className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 overflow-hidden px-4 md:px-0"
      onSubmit={(event) => {
        event.preventDefault();
        void submitRun();
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <DitheredWaves
          height="100%"
          colors={[
            "#fcfcfd",
            "#f9f9fb",
            "#f0f0f3",
            "#e8e8ec",
            "#e0e1e6",
            "#d9d9e0",
            "#cdced6",
            "#b9bbc6",
            "#8b8d98",
          ]}
        />
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center gap-px">
        <h1 className="text-lg font-medium text-grayscale-12">
          What do you want Codex to do?
        </h1>
      </div>
      <div className="relative z-10 flex w-full max-w-xl flex-col rounded-[8px] border border-grayscale-4 bg-white">
        <CornerCubes
          placement="outside"
          spacing={3}
          translate={12}
          size={8}
          color="var(--color-grayscale-6)"
          className="rounded-[2px]"
          active={true}
        />
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col">
            <label htmlFor={promptId} className="text-xs text-grayscale-11">
              Instructions
            </label>
            <p className="text-xs text-grayscale-10">
              The instructions for this run.
            </p>
          </div>
          <div className="group relative flex w-full">
            <textarea
              id={promptId}
              value={prompt}
              disabled={isSubmitting}
              placeholder="Ask Codex to change the app"
              className="min-h-32 w-full resize-none rounded-[8px] bg-grayscale-2 px-2 py-1.5 text-sm text-grayscale-12 outline-none transition-colors duration-150 placeholder:text-grayscale-10 focus:bg-grayscale-3"
              onChange={(event) => setPrompt(event.target.value)}
            />
            <InputBrackets />
          </div>
        </div>
        {error ? (
          <p className="px-3 text-xs text-grayscale-10">{error}</p>
        ) : null}
        <div className="flex flex-row items-center justify-end p-3">
          <Button type="submit" disabled={!prompt.trim() || isSubmitting}>
            {isSubmitting ? "Starting..." : "Run Codex"}
            <ShortcutBadge>⌘↵</ShortcutBadge>
          </Button>
        </div>
      </div>
    </form>
  );
}

function RunReview({
  projectId,
  run,
  runs,
  token,
}: {
  projectId: string;
  run: Run;
  runs: Run[];
  token?: string;
}) {
  const router = useRouter();
  const changes = run.codeChanges ?? [];
  const newRunHref = `/app/projects/${projectId}/runs/new`;
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [previewSize, setPreviewSize] = useState(DEFAULT_PREVIEW_SIZE);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [pendingChangeId, setPendingChangeId] = useState<string>();
  const [reviewError, setReviewError] = useState<string>();
  const commentRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const events = useMemo(
    () =>
      [...(run.events ?? [])].sort(
        (first, second) => (first.sequence ?? 0) - (second.sequence ?? 0),
      ),
    [run.events],
  );
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  const selectedChange =
    changes.find((change) => change.id === selectedChangeId) ?? changes[0];
  const previewUrl =
    run.previewBaseUrl && selectedChange?.previewPath
      ? `${run.previewBaseUrl}${selectedChange.previewPath}`
      : run.previewBaseUrl;
  const togglePreview = () => setIsPreviewCollapsed((collapsed) => !collapsed);
  const selectedChangeIndex = selectedChange
    ? changes.findIndex((change) => change.id === selectedChange.id)
    : -1;
  const resolvedChanges = changes.filter(isChangeResolved).length;
  const focusChange = (changeId?: string) => {
    if (!changeId) {
      return;
    }

    setSelectedChangeId(changeId);
    window.setTimeout(() => commentRefs.current[changeId]?.focus(), 0);
  };
  const focusNextChange = (fromChangeId: string) => {
    const fromIndex = changes.findIndex((change) => change.id === fromChangeId);
    const orderedChanges = [
      ...changes.slice(fromIndex + 1),
      ...changes.slice(0, Math.max(fromIndex, 0)),
    ];
    const nextUnresolved = orderedChanges.find(
      (change) => !isChangeResolved(change),
    );
    const fallback = changes[fromIndex + 1] ?? changes[fromIndex - 1];

    focusChange(nextUnresolved?.id ?? fallback?.id);
  };
  const reviewChange = async (
    change: NonNullable<Run["codeChanges"]>[number],
    action: "commented" | "reviewed",
  ) => {
    if (!token || pendingChangeId) {
      return;
    }

    const comment = (commentDrafts[change.id] ?? change.comment ?? "").trim();

    if (action === "commented" && !comment) {
      return;
    }

    setPendingChangeId(change.id);
    setReviewError(undefined);

    try {
      const now = new Date();
      await db.transact(
        db.tx.codeChanges[change.id].update(
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
      );

      const response = await fetch(
        `/api/projects/${projectId}/runs/${run.id}/changes/${change.id}/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, comment }),
        },
      );
      const body = (await response.json()) as {
        message?: string;
        submitted?: boolean;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Failed to save review");
      }

      if (body.submitted) {
        router.push(
          getNextHumanInputHref(projectId, runs, run.id) ?? newRunHref,
        );
      } else {
        focusNextChange(change.id);
      }
    } catch (error) {
      await db.transact(
        db.tx.codeChanges[change.id].update({
          status: change.status ?? "pending",
          comment: change.comment ?? "",
          reviewedAt: change.reviewedAt ?? undefined,
          commentedAt: change.commentedAt ?? undefined,
        }),
      );
      setReviewError(
        error instanceof Error ? error.message : "Failed to save review",
      );
    } finally {
      setPendingChangeId(undefined);
    }
  };

  useHotkeys(
    "p",
    () => {
      togglePreview();
    },
    { preventDefault: true },
  );

  useHotkeys(
    "r",
    () => {
      if (selectedChange && !isChangeResolved(selectedChange)) {
        void reviewChange(selectedChange, "reviewed");
      }
    },
    {
      enabled: Boolean(selectedChange) && !pendingChangeId,
      preventDefault: true,
    },
  );

  useHotkeys(
    "j",
    () => {
      if (changes.length === 0) {
        return;
      }

      const nextChange =
        changes[Math.min(changes.length - 1, selectedChangeIndex + 1)] ??
        changes[0];
      focusChange(nextChange.id);
    },
    { enabled: changes.length > 1, preventDefault: true },
  );

  useHotkeys(
    "k",
    () => {
      if (changes.length === 0) {
        return;
      }

      const previousChange =
        changes[Math.max(0, selectedChangeIndex - 1)] ?? changes[0];
      focusChange(previousChange.id);
    },
    { enabled: changes.length > 1, preventDefault: true },
  );

  const startPreviewResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isPreviewCollapsed) {
      return;
    }

    event.preventDefault();
    const separator = event.currentTarget;
    const pointerId = event.pointerId;
    separator.setPointerCapture(pointerId);
    const startX = event.clientX;
    const startSize = previewSize;

    const handleMove = (moveEvent: PointerEvent) => {
      const nextSize = Math.min(
        MAX_PREVIEW_SIZE,
        Math.max(MIN_PREVIEW_SIZE, startSize + (startX - moveEvent.clientX)),
      );
      setPreviewSize(nextSize);
    };

    const stopResize = () => {
      if (separator.hasPointerCapture(pointerId)) {
        separator.releasePointerCapture(pointerId);
      }

      separator.removeEventListener("pointermove", handleMove);
      separator.removeEventListener("pointerup", stopResize);
    };

    separator.addEventListener("pointermove", handleMove);
    separator.addEventListener("pointerup", stopResize);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-grayscale-4 bg-white md:flex-row">
      <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-grayscale-4 p-3 md:flex">
        <div>
          <h2 className="text-sm font-medium text-grayscale-12">Run</h2>
          <p className="text-xs text-grayscale-10">
            {run.status}
            {events.length > 0 ? ` · ${events.length} events` : ""}
          </p>
        </div>
        {run.responseText ? (
          <p className="text-sm text-grayscale-11">{run.responseText}</p>
        ) : null}
        {run.pullRequestUrl ? (
          <a
            href={run.pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent-11"
          >
            Pull request #{run.pullRequestNumber ?? ""}
          </a>
        ) : run.branchName ? (
          <p className="text-xs text-grayscale-10">{run.branchName}</p>
        ) : null}
        {run.error ? (
          <p className="text-sm text-grayscale-10">{run.error}</p>
        ) : null}
        <div>
          <h3 className="mb-2 text-xs font-medium text-grayscale-12">
            Changes
          </h3>
          <div className="flex flex-col divide-y divide-grayscale-4 border border-grayscale-4">
            {changes.length > 0 ? (
              changes.map((change) => (
                <button
                  key={change.id}
                  type="button"
                  className={[
                    "p-2 text-left text-sm text-grayscale-12 transition-colors hover:bg-grayscale-2",
                    selectedChange?.id === change.id ? "bg-grayscale-2" : "",
                  ].join(" ")}
                  onClick={() => focusChange(change.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{change.title}</span>
                    <span className="shrink-0 text-[10px] uppercase text-grayscale-10">
                      {getChangeStatusLabel(change)}
                    </span>
                  </span>
                  {change.summary ? (
                    <span className="block text-xs text-grayscale-10">
                      {change.summary}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="p-2 text-xs text-grayscale-10">No changes yet.</p>
            )}
          </div>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-grayscale-1">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-grayscale-4 bg-white p-3">
          <div>
            <h2 className="text-sm font-medium text-grayscale-12">
              Review timeline
            </h2>
            <p className="text-xs text-grayscale-10">
              {resolvedChanges}/{changes.length} changes resolved
              {events.length > 0 ? ` · ${events.length} events` : ""}
            </p>
          </div>
          {isPreviewCollapsed ? (
            <button
              type="button"
              className="bg-grayscale-2 px-2 py-1 text-xs text-grayscale-12 hover:bg-grayscale-3"
              onClick={togglePreview}
            >
              Preview
              <ShortcutBadge>P</ShortcutBadge>
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
            {reviewError ? (
              <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {reviewError}
              </p>
            ) : null}
            {changes.length > 0 ? (
              <div className="flex flex-col">
                {changes.map((change) => (
                  <ChangeReviewCard
                    change={change}
                    commentDraft={
                      commentDrafts[change.id] ?? change.comment ?? ""
                    }
                    isPending={pendingChangeId === change.id}
                    isSelected={selectedChange?.id === change.id}
                    key={change.id}
                    onCommentDraftChange={(value) =>
                      setCommentDrafts((drafts) => ({
                        ...drafts,
                        [change.id]: value,
                      }))
                    }
                    onFocus={() => setSelectedChangeId(change.id)}
                    onReview={() => {
                      void reviewChange(change, "reviewed");
                    }}
                    onSubmitComment={() => {
                      void reviewChange(change, "commented");
                    }}
                    setCommentRef={(node) => {
                      commentRefs.current[change.id] = node;
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-grayscale-4 bg-white p-3">
                <p className="text-sm text-grayscale-12">No changes yet</p>
                <p className="text-xs text-grayscale-10">
                  Codex change groups will appear here when the run completes.
                </p>
              </div>
            )}
            {events.length > 0 ? (
              <details className="border border-grayscale-4 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-grayscale-12">
                  Run events
                </summary>
                <div className="border-t border-grayscale-4 px-3 py-2">
                  <Timeline events={events} />
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </main>
      <button
        type="button"
        aria-label="Resize timeline and preview"
        onPointerDown={startPreviewResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setPreviewSize((size) => Math.min(MAX_PREVIEW_SIZE, size + 24));
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            setPreviewSize((size) => Math.max(MIN_PREVIEW_SIZE, size - 24));
          }
        }}
        className={[
          "hidden shrink-0 cursor-col-resize bg-grayscale-4 transition-[background-color,opacity,width] duration-200 hover:bg-accent-8 md:block",
          isPreviewCollapsed ? "w-0 opacity-0" : "w-px opacity-100",
        ].join(" ")}
      />
      <aside
        className="hidden shrink-0 overflow-hidden border-l border-grayscale-4 bg-white transition-[width] duration-300 ease-out md:flex md:flex-col"
        style={{ width: isPreviewCollapsed ? 0 : previewSize }}
      >
        <div
          className={[
            "flex h-full min-w-80 flex-col transition-opacity duration-200",
            isPreviewCollapsed ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-grayscale-4 p-2">
            <div className="min-w-0">
              <h2 className="truncate text-xs font-medium text-grayscale-12">
                Preview
              </h2>
              {run.previewBaseUrl ? (
                <p className="truncate text-xs text-grayscale-10">
                  {run.previewBaseUrl}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Collapse preview"
              className="shrink-0 bg-grayscale-2 px-2 py-1 text-xs text-grayscale-12 hover:bg-grayscale-3"
              onClick={togglePreview}
            >
              ×<ShortcutBadge>P</ShortcutBadge>
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {previewUrl ? (
              <iframe
                title="Preview"
                src={previewUrl}
                className="h-full w-full"
              />
            ) : (
              <p className="p-3 text-sm text-grayscale-10">
                Preview not ready.
              </p>
            )}
          </div>
        </div>
      </aside>
      <div className="flex border-t border-grayscale-4 bg-white md:hidden">
        {previewUrl ? (
          <iframe
            title="Preview"
            src={previewUrl}
            className="h-[420px] w-full"
          />
        ) : (
          <p className="p-3 text-sm text-grayscale-10">Preview not ready.</p>
        )}
      </div>
    </section>
  );
}

function ChangeReviewCard({
  change,
  commentDraft,
  isPending,
  isSelected,
  onCommentDraftChange,
  onFocus,
  onReview,
  onSubmitComment,
  setCommentRef,
}: {
  change: NonNullable<Run["codeChanges"]>[number];
  commentDraft: string;
  isPending: boolean;
  isSelected: boolean;
  onCommentDraftChange: (value: string) => void;
  onFocus: () => void;
  onReview: () => void;
  onSubmitComment: () => void;
  setCommentRef: (node: HTMLTextAreaElement | null) => void;
}) {
  const resolved = isChangeResolved(change);

  return (
    <article
      className={[
        "relative flex gap-3 py-2 before:absolute before:top-10 before:bottom-[-0.5rem] before:left-3.5 before:w-px before:bg-grayscale-4 last:before:hidden",
        isSelected ? "scroll-mt-4" : "",
      ].join(" ")}
      onFocus={onFocus}
    >
      <div
        className={[
          "relative z-10 flex size-7 shrink-0 items-center justify-center font-mono text-[10px] font-semibold",
          resolved
            ? "bg-emerald-50 text-emerald-700"
            : isSelected
              ? "bg-accent-3 text-accent-11"
              : "bg-grayscale-3 text-grayscale-11",
        ].join(" ")}
      >
        CH
      </div>
      <div
        className={[
          "min-w-0 flex-1 border bg-white",
          isSelected ? "border-accent-7" : "border-grayscale-4",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-grayscale-4 px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-grayscale-12">
                {change.title}
              </h3>
              <span className="bg-grayscale-2 px-1.5 py-0.5 text-[11px] uppercase text-grayscale-10">
                {getChangeStatusLabel(change)}
              </span>
            </div>
            {change.summary ? (
              <p className="mt-1 text-sm text-grayscale-10">{change.summary}</p>
            ) : null}
            <p className="mt-1 break-words font-mono text-[11px] text-grayscale-10">
              {formatChangeFiles(change.files)}
            </p>
          </div>
          <Button
            type="button"
            disabled={resolved || isPending}
            className={resolved ? "opacity-40 hover:scale-100" : undefined}
            onClick={onReview}
          >
            {resolved ? "Resolved" : isPending ? "Saving..." : "Reviewed"}
            <ShortcutBadge>R</ShortcutBadge>
          </Button>
        </div>
        <div className="flex flex-col gap-3 px-3 py-3">
          <ChangeDiff diff={change.diff} />
          <div className="flex flex-col gap-2">
            <textarea
              ref={setCommentRef}
              value={commentDraft}
              disabled={isPending || change.status === "reviewed"}
              placeholder={
                change.status === "reviewed"
                  ? "Reviewed with no feedback"
                  : "Add feedback and press Enter"
              }
              className="min-h-20 w-full resize-y bg-grayscale-2 px-2 py-1.5 text-sm text-grayscale-12 outline-none placeholder:text-grayscale-10 focus:bg-grayscale-3 disabled:opacity-60"
              onChange={(event) => onCommentDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) {
                  return;
                }

                event.preventDefault();
                onSubmitComment();
              }}
            />
            {change.comment && change.status === "commented" ? (
              <p className="text-xs text-grayscale-10">
                Feedback saved. Follow-up will run when every change is
                resolved.
              </p>
            ) : (
              <p className="text-xs text-grayscale-10">
                Enter saves feedback. Shift+Enter adds a new line.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ChangeDiff({ diff }: { diff?: string | null }) {
  const parsedFiles = useMemo(() => {
    if (!diff?.trim()) {
      return [];
    }

    try {
      return parsePatchFiles(diff, "flowstate-change").flatMap(
        (patch) => patch.files,
      );
    } catch {
      return [];
    }
  }, [diff]);

  if (!diff?.trim()) {
    return (
      <p className="border border-grayscale-4 bg-grayscale-1 p-3 text-sm text-grayscale-10">
        No diff was captured for this change.
      </p>
    );
  }

  if (parsedFiles.length === 0) {
    return (
      <pre className="max-h-[520px] overflow-auto border border-grayscale-4 bg-grayscale-1 p-3 text-xs leading-5 text-grayscale-12">
        <code>{diff}</code>
      </pre>
    );
  }

  return (
    <div className="flex max-h-[640px] flex-col gap-3 overflow-auto border border-grayscale-4 bg-grayscale-1 p-2">
      {parsedFiles.map((fileDiff) => (
        <RenderedFileDiff
          fileDiff={fileDiff}
          key={`${fileDiff.prevName ?? ""}:${fileDiff.name}`}
        />
      ))}
    </div>
  );
}

function RenderedFileDiff({ fileDiff }: { fileDiff: FileDiffMetadata }) {
  return (
    <FileDiff
      disableWorkerPool={true}
      fileDiff={fileDiff}
      options={{
        diffStyle: "unified",
        overflow: "wrap",
        lineDiffType: "word-alt",
        diffIndicators: "classic",
        hunkSeparators: "metadata",
      }}
    />
  );
}

function isChangeResolved(change: NonNullable<Run["codeChanges"]>[number]) {
  return change.status === "reviewed" || change.status === "commented";
}

function getChangeStatusLabel(change: NonNullable<Run["codeChanges"]>[number]) {
  if (change.status === "reviewed") {
    return "reviewed";
  }

  if (change.status === "commented") {
    return "commented";
  }

  return "pending";
}

function formatChangeFiles(files: unknown) {
  if (!Array.isArray(files)) {
    return "No files listed";
  }

  const fileNames = files.filter(
    (file): file is string => typeof file === "string",
  );
  return fileNames.length > 0 ? fileNames.join(", ") : "No files listed";
}

function Timeline({ events }: { events: NonNullable<Run["events"]> }) {
  return (
    <div className="flex flex-col">
      {events.map((event) => (
        <TimelineEvent event={event} key={event.id} />
      ))}
    </div>
  );
}

type RunEvent = NonNullable<Run["events"]>[number];
type TimelineTone = "neutral" | "accent" | "success" | "warning" | "danger";
type TimelineDetail = [label: string, value: number | string | undefined];
type TimelineEventSummary = {
  glyph: string;
  title: string;
  subtitle?: string;
  body?: string;
  details: TimelineDetail[];
  timestamp?: string;
  tone: TimelineTone;
};

const timelineToneClasses: Record<TimelineTone, string> = {
  neutral: "bg-grayscale-3 text-grayscale-11",
  accent: "bg-accent-3 text-accent-11",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

function TimelineEvent({ event }: { event: RunEvent }) {
  const summary = describeRunEvent(event);

  return (
    <article className="relative flex gap-3 py-2 before:absolute before:top-10 before:bottom-[-0.5rem] before:left-3.5 before:w-px before:bg-grayscale-4 last:before:hidden">
      <div
        className={[
          "relative z-10 flex size-7 shrink-0 items-center justify-center font-mono text-[10px] font-semibold",
          timelineToneClasses[summary.tone],
        ].join(" ")}
      >
        {summary.glyph}
      </div>
      <div className="min-w-0 flex-1 border border-grayscale-4 bg-white">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-grayscale-4 px-3 py-2">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-grayscale-12">
                {summary.title}
              </h3>
              {summary.timestamp ? (
                <span className="text-[11px] text-grayscale-10">
                  {summary.timestamp}
                </span>
              ) : null}
            </div>
            {summary.subtitle ? (
              <p className="break-words font-mono text-[11px] text-grayscale-10">
                {summary.subtitle}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-[10px] text-grayscale-9">
            #{event.sequence ?? 0}
          </span>
        </div>
        <div className="flex flex-col gap-2 px-3 py-2">
          {summary.body ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-grayscale-12">
              {summary.body}
            </p>
          ) : null}
          <DetailGrid items={summary.details} />
          <details className="group bg-grayscale-2">
            <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-grayscale-11">
              Payload
            </summary>
            <pre className="max-h-64 overflow-auto p-2 text-[11px] leading-5 text-grayscale-12">
              <code>{formatPayload(event.payload ?? event.raw ?? "")}</code>
            </pre>
          </details>
        </div>
      </div>
    </article>
  );
}

function describeRunEvent(event: RunEvent): TimelineEventSummary {
  const type = event.type ?? "event";
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const error = payload ? recordField(payload, "error") : undefined;
  const status = payload ? numberField(payload, "status") : undefined;
  const item = payload ? recordField(payload, "item") : undefined;
  const itemType = item ? stringField(item, "type") : undefined;
  const fallbackText = summarizeRunEvent(event);
  const timestamp = formatEventTime(event.createdAt);

  if (type === "stderr") {
    return {
      glyph: "IO",
      title: "Stderr",
      subtitle: type,
      body: fallbackText,
      details: [],
      timestamp,
      tone: "warning" as const,
    };
  }

  if (type === "stdout") {
    return {
      glyph: "IO",
      title: "Stdout",
      subtitle: type,
      body: fallbackText,
      details: [],
      timestamp,
      tone: "neutral" as const,
    };
  }

  if (type === "error" || type.endsWith(".failed")) {
    const errorMessage = getNestedErrorMessage(error) ?? fallbackText;

    return {
      glyph: "ER",
      title: type === "error" ? "Request error" : formatEventType(type),
      subtitle: stringField(error ?? payload ?? {}, "code") ?? type,
      body: errorMessage,
      details: [
        ["status", status],
        ["param", stringField(error ?? {}, "param")],
      ],
      timestamp,
      tone: "danger" as const,
    };
  }

  if (type === "turn.started") {
    return {
      glyph: "AI",
      title: "Turn started",
      subtitle: type,
      body: undefined,
      details: [],
      timestamp,
      tone: "accent" as const,
    };
  }

  if (type === "turn.completed") {
    return {
      glyph: "AI",
      title: "Turn completed",
      subtitle: type,
      body: undefined,
      details: [],
      timestamp,
      tone: "success" as const,
    };
  }

  if (type === "thread.started") {
    return {
      glyph: "CD",
      title: "Codex thread started",
      subtitle: stringField(payload ?? {}, "thread_id") ?? type,
      body: undefined,
      details: [],
      timestamp,
      tone: "accent" as const,
    };
  }

  if (itemType === "agent_message") {
    return {
      glyph: "AI",
      title: "Agent message",
      subtitle: type,
      body:
        stringField(item ?? {}, "text") ??
        stringField(item ?? {}, "message") ??
        fallbackText,
      details: [],
      timestamp,
      tone: "accent" as const,
    };
  }

  if (itemType === "command_execution") {
    return {
      glyph: "$",
      title: "Command",
      subtitle: stringField(item ?? {}, "status") ?? type,
      body: stringField(item ?? {}, "command") ?? fallbackText,
      details: [
        ["exit", numberField(item ?? {}, "exit_code")],
        ["output", stringField(item ?? {}, "aggregated_output")],
      ],
      timestamp,
      tone: toneForStatus(stringField(item ?? {}, "status")),
    };
  }

  if (itemType === "file_change") {
    const changes = arrayField(item ?? {}, "changes");

    return {
      glyph: "FS",
      title: "File changes",
      subtitle: changes.length ? `${changes.length} changes` : type,
      body: summarizeFileChanges(changes),
      details: [],
      timestamp,
      tone: "accent" as const,
    };
  }

  return {
    glyph: "EV",
    title: formatEventType(type),
    subtitle: type,
    body: fallbackText,
    details: [],
    timestamp,
    tone: "neutral" as const,
  };
}

function summarizeRunEvent(event: { raw?: string | null; payload?: unknown }) {
  const payload = event.payload;

  if (isRecord(payload)) {
    const directText =
      stringField(payload, "message") ??
      stringField(payload, "text") ??
      stringField(payload, "summary") ??
      stringField(payload, "delta");

    if (directText) {
      return directText;
    }
  }

  return event.raw ?? "";
}

function DetailGrid({ items }: { items: TimelineDetail[] }) {
  const visibleItems = items.filter(
    ([, value]) => value !== undefined && value !== "",
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {visibleItems.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="font-medium text-grayscale-10">{label}</dt>
          <dd className="min-w-0 break-words text-grayscale-12">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatEventType(type: string) {
  return type
    .replace(/^codex\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEventTime(value?: Date | string | number | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPayload(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function getNestedErrorMessage(error?: Record<string, unknown>) {
  const message = error ? stringField(error, "message") : undefined;

  if (!message) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message) as unknown;
    if (isRecord(parsed)) {
      const parsedError = recordField(parsed, "error");
      return stringField(parsedError ?? parsed, "message") ?? message;
    }
  } catch {
    return message;
  }

  return message;
}

function summarizeFileChanges(changes: unknown[]) {
  const lines = changes
    .slice(0, 6)
    .map((change) => {
      if (!isRecord(change)) {
        return undefined;
      }

      const kind = stringField(change, "kind") ?? "change";
      const path = stringField(change, "path") ?? "unknown path";
      return `${kind}: ${path}`;
    })
    .filter(Boolean);

  if (changes.length > 6) {
    lines.push(`+${changes.length - 6} more`);
  }

  return lines.join("\n");
}

function toneForStatus(status?: string) {
  if (status === "failed" || status === "error") {
    return "danger" as const;
  }

  if (status === "completed" || status === "success") {
    return "success" as const;
  }

  return "accent" as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return isRecord(value) ? value : undefined;
}

function numberField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function arrayField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return Array.isArray(value) ? value : [];
}

function stringField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

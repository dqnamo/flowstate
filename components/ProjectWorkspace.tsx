"use client";

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { FileDiff } from "@pierre/diffs/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
import CornerCubes from "@/components/CornerCubes";
import DitheredWaves from "@/components/DitheredWaves";
import { InputBrackets } from "@/components/Input";
import SetupSteps from "@/components/SetupSteps";
import { cn } from "@/helpers/classname-helper";
import db from "@/lib/db";

type WorkspaceMode = "overview" | "new-run" | "run";

const DEFAULT_PREVIEW_SIZE = 520;
const MIN_PREVIEW_SIZE = 320;
const MAX_PREVIEW_SIZE = 860;
const DEFAULT_RUN_SIDEBAR_SIZE = 320;
const MIN_RUN_SIDEBAR_SIZE = 240;
const MAX_RUN_SIDEBAR_SIZE = 520;
const RUN_NAV_HOTKEYS = [
  "meta+1",
  "meta+2",
  "meta+3",
  "meta+4",
  "meta+5",
  "meta+6",
  "meta+7",
  "meta+8",
  "meta+9",
];
const RUN_SIDEBAR_HOTKEY = "meta+b";

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
  reviewSubmittedAt?: Date | string | number | null;
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
    <kbd className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-grayscale-11 px-1 font-mono text-xs leading-none text-grayscale-1">
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
  const router = useRouter();
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
  const newRunHref = `/app/projects/${projectId}/runs/new`;
  const projectRootRedirectHref =
    mode === "overview" &&
    !isLoading &&
    project?.status === "ready" &&
    agent?.status === "ready"
      ? (getLatestHumanInputHref(projectId, runs) ?? newRunHref)
      : undefined;

  useEffect(() => {
    if (projectRootRedirectHref) {
      router.replace(projectRootRedirectHref);
    }
  }, [projectRootRedirectHref, router]);

  if (project && activeStep < 5) {
    return (
      <SetupWizardShell activeStep={activeStep}>
        {project.status === "connecting_github" ? (
          <SetupStatus
            title="Connect GitHub"
            message="Complete the GitHub App installation to continue."
          />
        ) : project.status === "selecting_repo" ? (
          <RepositoryPicker
            projectId={project.id}
            token={user?.refresh_token}
          />
        ) : (
          <AgentSetup
            agent={agent}
            projectId={project.id}
            projectStatus={project.status}
            token={user?.refresh_token}
          />
        )}
      </SetupWizardShell>
    );
  }

  return (
    <main
      className={
        mode === "run" || mode === "new-run"
          ? "flex h-dvh min-h-0 flex-col overflow-hidden bg-grayscale-1"
          : "flex min-h-full flex-col bg-grayscale-1"
      }
    >
      {project ? (
        <ProjectHeader
          project={project}
          newRunHref={
            project.status === "ready" && agent?.status === "ready"
              ? newRunHref
              : undefined
          }
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

      {project?.status === "ready" && agent?.status === "ready" ? (
        projectRootRedirectHref ? (
          <p className="p-4 text-sm text-grayscale-10">Opening project...</p>
        ) : (
          <ReadyProject
            mode={mode}
            projectId={project.id}
            run={currentRun}
            runs={runs}
            token={user?.refresh_token}
          />
        )
      ) : null}
    </main>
  );
}

function SetupWizardShell({
  activeStep,
  children,
}: {
  activeStep: number;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-grayscale-1 p-4">
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
        <div className="flex flex-col gap-4 p-3">
          <SetupSteps activeStep={activeStep} />
          {children}
        </div>
      </div>
    </main>
  );
}

function SetupStatus({ title, message }: { title: string; message: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-grayscale-12">{title}</h2>
      <p className="text-xs text-grayscale-10">{message}</p>
    </section>
  );
}

function ProjectHeader({
  project,
  newRunHref,
  previousHref,
  nextHref,
}: {
  project?: {
    name?: string | null;
    githubRepositoryFullName?: string | null;
    githubRepositoryUrl?: string | null;
    branch?: string | null;
  };
  newRunHref?: string;
  previousHref?: string;
  nextHref?: string;
}) {
  const router = useRouter();

  useHotkeys(
    "k",
    () => {
      if (previousHref) {
        router.push(previousHref);
      }
    },
    { enabled: Boolean(previousHref), preventDefault: true },
  );

  useHotkeys(
    "l",
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
        <NavButton
          href={newRunHref}
          label="New run"
          shortcut="N"
          variant="primary"
        />
        <NavButton href={previousHref} label="Previous" shortcut="K" />
        <NavButton href={nextHref} label="Next" shortcut="L" />
      </div>
    </header>
  );
}

function NavButton({
  href,
  label,
  shortcut,
  variant = "secondary",
}: {
  href?: string;
  label: string;
  shortcut: string;
  variant?: "primary" | "secondary";
}) {
  const content = (
    <Button
      type="button"
      variant={variant}
      disabled={!href}
      className={["py-1.5", !href ? "opacity-40 hover:scale-100" : ""].join(
        " ",
      )}
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

function getLatestHumanInputHref(projectId: string, runs: Run[]) {
  const latestRun = runs.find(
    (run) =>
      run.status === "ready_for_review" &&
      (run.codeChanges ?? []).some((change) => !isChangeResolved(change)),
  );

  return latestRun ? getRunHref(projectId, latestRun.id) : undefined;
}

function RepositoryPicker({
  projectId,
  token,
}: {
  projectId: string;
  token?: string;
}) {
  const router = useRouter();
  const repositorySelectRef = useRef<HTMLSelectElement | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(() => Boolean(token));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

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

  useEffect(() => {
    if (repositories.length > 0) {
      repositorySelectRef.current?.focus();
    }
  }, [repositories.length]);

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
    "enter",
    () => {
      void saveRepository();
    },
    {
      enabled: Boolean(selectedRepositoryId) && !isSubmitting,
      preventDefault: true,
    },
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-grayscale-12">
        Select repository
      </h2>
      {isLoading ? (
        <p className="text-xs text-grayscale-10">Loading repos...</p>
      ) : null}
      {repositories.length > 0 ? (
        <select
          ref={repositorySelectRef}
          className="rounded-[8px] bg-grayscale-2 px-2 py-1.5 text-xs text-grayscale-12 outline-none"
          value={selectedRepositoryId ?? ""}
          onChange={(event) =>
            setSelectedRepositoryId(Number(event.target.value))
          }
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              !selectedRepositoryId ||
              isSubmitting
            ) {
              return;
            }

            event.preventDefault();
            void saveRepository();
          }}
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
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={() => router.back()}
        >
          Previous
        </Button>
        <Button
          type="button"
          disabled={!selectedRepositoryId || isSubmitting}
          onClick={() => {
            void saveRepository();
          }}
        >
          {isSubmitting ? "Next..." : "Next"}
          <ShortcutBadge>↵</ShortcutBadge>
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
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-grayscale-12">Codex setup</h2>
        <p className="text-xs text-grayscale-10">{statusMessage}</p>
      </div>
      {agent?.deviceAuthUrl && agent.deviceAuthCode ? (
        <div className="flex flex-col gap-2">
          <a
            href={agent.deviceAuthUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent-11"
          >
            Open Codex device login
          </a>
          <p className="font-mono text-base text-grayscale-12">
            {agent.deviceAuthCode}
          </p>
        </div>
      ) : null}
      {agent?.setupError ? (
        <p className="text-xs text-grayscale-10">{agent.setupError}</p>
      ) : null}
      {error ? <p className="text-xs text-grayscale-10">{error}</p> : null}
      {canRetry ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
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
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    promptRef.current?.focus({ preventScroll: true });
  }, []);

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
      className="relative flex min-h-0 flex-1 w-full flex-col items-center justify-center gap-4 overflow-hidden px-4 md:px-0"
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
              ref={promptRef}
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
  const changes = useMemo(() => run.codeChanges ?? [], [run.codeChanges]);
  const newRunHref = `/app/projects/${projectId}/runs/new`;
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [previewSize, setPreviewSize] = useState(DEFAULT_PREVIEW_SIZE);
  const [isRunSidebarCollapsed, setIsRunSidebarCollapsed] = useState(false);
  const [runSidebarSize, setRunSidebarSize] = useState(
    DEFAULT_RUN_SIDEBAR_SIZE,
  );
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [pendingChangeId, setPendingChangeId] = useState<string>();
  const [reviewError, setReviewError] = useState<string>();
  const finalizingRunIdRef = useRef<string | undefined>(undefined);
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
  const timelineItems = useMemo(
    () => buildUnifiedTimelineItems(changes, events),
    [changes, events],
  );
  const previewUrl =
    run.previewBaseUrl && selectedChange?.previewPath
      ? `${run.previewBaseUrl}${selectedChange.previewPath}`
      : run.previewBaseUrl;
  const selectedPreviewPath = selectedChange?.previewPath ?? "/";
  const togglePreview = () => setIsPreviewCollapsed((collapsed) => !collapsed);
  const toggleRunSidebar = useCallback(() => {
    setIsRunSidebarCollapsed((collapsed) => !collapsed);
  }, []);
  const selectedChangeIndex = selectedChange
    ? changes.findIndex((change) => change.id === selectedChange.id)
    : -1;
  const resolvedChanges = changes.filter(isChangeResolved).length;
  const isReviewFullyResolved =
    changes.length > 0 && resolvedChanges === changes.length;
  const focusChange = useCallback((changeId?: string) => {
    if (!changeId) {
      return;
    }

    setSelectedChangeId(changeId);
    window.setTimeout(() => {
      const comment = commentRefs.current[changeId];

      comment?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      comment?.focus({ preventScroll: true });
    }, 0);
  }, []);
  const focusNextChange = useCallback(
    (fromChangeId: string) => {
      const fromIndex = changes.findIndex(
        (change) => change.id === fromChangeId,
      );
      const orderedChanges = [
        ...changes.slice(fromIndex + 1),
        ...changes.slice(0, Math.max(fromIndex, 0)),
      ];
      const nextUnresolved = orderedChanges.find(
        (change) => !isChangeResolved(change),
      );
      const fallback = changes[fromIndex + 1] ?? changes[fromIndex - 1];

      focusChange(nextUnresolved?.id ?? fallback?.id);
    },
    [changes, focusChange],
  );
  const reviewChange = useCallback(
    async (
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
    },
    [
      commentDrafts,
      focusNextChange,
      newRunHref,
      pendingChangeId,
      projectId,
      router,
      run.id,
      runs,
      token,
    ],
  );

  useEffect(() => {
    if (
      !token ||
      run.status !== "ready_for_review" ||
      run.reviewSubmittedAt ||
      !isReviewFullyResolved ||
      finalizingRunIdRef.current === run.id ||
      pendingChangeId
    ) {
      return;
    }

    const finalChange =
      changes.find(
        (change) => change.status === "commented" && change.comment?.trim(),
      ) ?? changes.find(isChangeResolved);

    if (!finalChange) {
      return;
    }

    finalizingRunIdRef.current = run.id;
    queueMicrotask(() => {
      void reviewChange(
        finalChange,
        finalChange.status === "commented" ? "commented" : "reviewed",
      );
    });
  }, [
    changes,
    isReviewFullyResolved,
    pendingChangeId,
    reviewChange,
    run.id,
    run.reviewSubmittedAt,
    run.status,
    token,
  ]);

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

  useHotkeys(
    RUN_NAV_HOTKEYS,
    (event) => {
      const index = Number(event.key) - 1;
      const targetRun = runs[index];

      if (targetRun) {
        router.push(getRunHref(projectId, targetRun.id));
      }
    },
    {
      enabled: runs.length > 0,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [projectId, router, runs],
  );

  useHotkeys(
    RUN_SIDEBAR_HOTKEY,
    () => {
      toggleRunSidebar();
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
    },
    [toggleRunSidebar],
  );

  const startRunSidebarResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (isRunSidebarCollapsed) {
      return;
    }

    event.preventDefault();
    const separator = event.currentTarget;
    const pointerId = event.pointerId;
    separator.setPointerCapture(pointerId);
    const startX = event.clientX;
    const startSize = runSidebarSize;

    const handleMove = (moveEvent: PointerEvent) => {
      const nextSize = Math.min(
        MAX_RUN_SIDEBAR_SIZE,
        Math.max(
          MIN_RUN_SIDEBAR_SIZE,
          startSize + (moveEvent.clientX - startX),
        ),
      );
      setRunSidebarSize(nextSize);
    };

    const stopResize = () => {
      if (separator.hasPointerCapture(pointerId)) {
        separator.releasePointerCapture(pointerId);
      }

      separator.removeEventListener("pointermove", handleMove);
      separator.removeEventListener("pointerup", stopResize);
      separator.removeEventListener("pointercancel", stopResize);
    };

    separator.addEventListener("pointermove", handleMove);
    separator.addEventListener("pointerup", stopResize);
    separator.addEventListener("pointercancel", stopResize);
  };

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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-grayscale-1 md:flex-row">
      <aside
        className="hidden shrink-0 overflow-hidden bg-grayscale-1 transition-[width] duration-200 ease-out md:flex md:flex-col"
        style={{ width: isRunSidebarCollapsed ? 0 : runSidebarSize }}
      >
        <div
          className={cn(
            "flex h-full min-w-60 flex-col transition-opacity duration-150",
            isRunSidebarCollapsed ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-grayscale-4 p-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-grayscale-12">Runs</h2>
              <p className="text-xs text-grayscale-10">
                {runs.length} total · ⌘1-9 opens · ⌘B toggles
              </p>
            </div>
            <button
              type="button"
              aria-label="Collapse runs sidebar"
              className="shrink-0 bg-grayscale-2 px-2 py-1 text-xs text-grayscale-12 hover:bg-grayscale-3"
              onClick={toggleRunSidebar}
            >
              ←<ShortcutBadge>⌘B</ShortcutBadge>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <RunNavigator
              currentRunId={run.id}
              projectId={projectId}
              runs={runs}
            />
          </div>
        </div>
      </aside>
      <button
        type="button"
        aria-label="Resize runs sidebar"
        onPointerDown={startRunSidebarResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setRunSidebarSize((size) =>
              Math.max(MIN_RUN_SIDEBAR_SIZE, size - 24),
            );
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            setRunSidebarSize((size) =>
              Math.min(MAX_RUN_SIDEBAR_SIZE, size + 24),
            );
          }
        }}
        className={cn(
          "hidden shrink-0 cursor-col-resize bg-grayscale-4 transition-[background-color,opacity,width] duration-200 hover:bg-accent-8 md:block",
          isRunSidebarCollapsed ? "w-0 opacity-0" : "w-px opacity-100",
        )}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-grayscale-1">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-grayscale-4 bg-grayscale-1 p-3">
          <div className="flex min-w-0 items-center gap-2">
            {isRunSidebarCollapsed ? (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 px-2 py-1 text-xs"
                onClick={toggleRunSidebar}
              >
                Runs
                <ShortcutBadge>⌘B</ShortcutBadge>
              </Button>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-grayscale-12">
                Review timeline
              </h2>
              <p className="text-xs text-grayscale-10">
                {resolvedChanges}/{changes.length} changes resolved
                {events.length > 0 ? ` · ${events.length} events` : ""}
                {isReviewFullyResolved && run.status === "ready_for_review"
                  ? " · submitting"
                  : ""}
              </p>
            </div>
          </div>
          {isPreviewCollapsed ? (
            <Button
              type="button"
              variant="secondary"
              className="px-2 py-1 text-xs"
              onClick={togglePreview}
            >
              Preview
              <ShortcutBadge>P</ShortcutBadge>
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-grayscale-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
            {reviewError ? (
              <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {reviewError}
              </p>
            ) : null}
            {timelineItems.length > 0 ? (
              <div className="flex flex-col gap-3">
                {timelineItems.map((item) =>
                  item.kind === "change" ? (
                    <ChangeReviewCard
                      change={item.change}
                      commentDraft={
                        commentDrafts[item.change.id] ??
                        item.change.comment ??
                        ""
                      }
                      isPending={pendingChangeId === item.change.id}
                      isSelected={selectedChange?.id === item.change.id}
                      key={`change:${item.change.id}`}
                      onCommentDraftChange={(value) =>
                        setCommentDrafts((drafts) => ({
                          ...drafts,
                          [item.change.id]: value,
                        }))
                      }
                      onFocus={() => setSelectedChangeId(item.change.id)}
                      onReview={() => {
                        void reviewChange(item.change, "reviewed");
                      }}
                      onSubmitComment={() => {
                        void reviewChange(item.change, "commented");
                      }}
                      setCommentRef={(node) => {
                        commentRefs.current[item.change.id] = node;
                      }}
                    />
                  ) : (
                    <TimelineEvent
                      event={item.event}
                      key={`event:${item.event.id}`}
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="border border-grayscale-4 bg-white p-3">
                <p className="text-sm text-grayscale-12">No changes yet</p>
                <p className="text-xs text-grayscale-10">
                  Codex change groups will appear here when the run completes.
                </p>
              </div>
            )}
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
        className="hidden shrink-0 overflow-hidden bg-grayscale-1 transition-[width] duration-300 ease-out md:flex md:flex-col"
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
                {selectedPreviewPath}
              </h2>
              {previewUrl ? (
                <p className="truncate text-xs text-grayscale-10">
                  {previewUrl}
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
      <div className="flex border-t border-grayscale-4 bg-grayscale-1 md:hidden">
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

function RunNavigator({
  currentRunId,
  projectId,
  runs,
}: {
  currentRunId: string;
  projectId: string;
  runs: Run[];
}) {
  return (
    <div className="flex flex-col divide-y divide-grayscale-4">
      {runs.length > 0 ? (
        runs.map((item, index) => {
          const isCurrent = item.id === currentRunId;
          const shortcut = index < 9 ? `⌘${index + 1}` : undefined;

          return (
            <Link
              key={item.id}
              href={getRunHref(projectId, item.id)}
              className={cn(
                "flex flex-col gap-1 px-3 py-2 text-sm text-grayscale-12 transition-colors hover:bg-grayscale-2",
                isCurrent && "bg-grayscale-2",
              )}
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {item.prompt ?? `Run ${item.id.slice(0, 8)}`}
                </span>
                {shortcut ? (
                  <span className="shrink-0 font-mono text-[10px] text-grayscale-10">
                    {shortcut}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-grayscale-10">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      getRunStatusDotClass(item.status),
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {formatRunStatus(item.status)}
                  </span>
                </span>
                <span className="shrink-0 text-tiny text-grayscale-10">
                  {item.codeChanges?.length ?? 0} changes ·{" "}
                  {item.events?.length ?? 0} events
                </span>
              </span>
            </Link>
          );
        })
      ) : (
        <p className="p-3 text-xs text-grayscale-10">No runs yet.</p>
      )}
    </div>
  );
}

function formatRunStatus(status?: string | null) {
  return status?.replaceAll("_", " ") ?? "unknown";
}

function getRunStatusDotClass(status?: string | null) {
  if (status === "failed" || status === "error") {
    return "bg-red-500";
  }

  if (status === "completed" || status === "review_complete") {
    return "bg-green-500";
  }

  if (status === "ready_for_review") {
    return "bg-accent-9";
  }

  if (
    status === "queued" ||
    status === "running" ||
    status === "feedback_queued"
  ) {
    return "bg-amber-500";
  }

  return "bg-grayscale-7";
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
        "border bg-white",
        isSelected ? "scroll-mt-4" : "",
        isSelected ? "border-accent-7" : "border-grayscale-4",
      ].join(" ")}
      onFocus={onFocus}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-grayscale-4 px-3 py-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-grayscale-12">
                {change.title}
              </h3>
              <span className="bg-grayscale-2 px-1.5 py-0.5 text-[11px] uppercase text-grayscale-10">
                {getChangeStatusLabel(change)}
              </span>
              <span className="bg-emerald-50 px-1.5 py-0.5 text-[11px] uppercase text-emerald-700">
                change
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
            variant="secondary"
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

type RunEvent = NonNullable<Run["events"]>[number];
type CodeChange = NonNullable<Run["codeChanges"]>[number];
type UnifiedTimelineItem =
  | { kind: "change"; change: CodeChange; sequence: number }
  | { kind: "event"; event: RunEvent; sequence: number };

function buildUnifiedTimelineItems(
  changes: CodeChange[],
  events: RunEvent[],
): UnifiedTimelineItem[] {
  const changesById = new Map(changes.map((change) => [change.id, change]));
  const renderedChangeIds = new Set<string>();
  const items: UnifiedTimelineItem[] = [];

  for (const event of events) {
    if (event.type === "change.ready") {
      const payload = isRecord(event.payload) ? event.payload : undefined;
      const changeId = payload ? stringField(payload, "changeId") : undefined;
      const change = changeId ? changesById.get(changeId) : undefined;

      if (change) {
        renderedChangeIds.add(change.id);
        items.push({
          kind: "change",
          change,
          sequence: event.sequence ?? Number.MAX_SAFE_INTEGER,
        });
        continue;
      }
    }

    if (event.type === "change.reviewed" || event.type === "change.commented") {
      continue;
    }

    items.push({
      kind: "event",
      event,
      sequence: event.sequence ?? Number.MAX_SAFE_INTEGER,
    });
  }

  changes.forEach((change, index) => {
    if (renderedChangeIds.has(change.id)) {
      return;
    }

    items.push({
      kind: "change",
      change,
      sequence: Number.MAX_SAFE_INTEGER - changes.length + index,
    });
  });

  return items.sort((first, second) => first.sequence - second.sequence);
}

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
  neutral: "text-grayscale-10",
  accent: "text-accent-11",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-red-700",
};

const timelineAccentClasses: Record<TimelineTone, string> = {
  neutral: "bg-grayscale-6",
  accent: "bg-accent-8",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
};

function TimelineEvent({ event }: { event: RunEvent }) {
  const summary = describeRunEvent(event);

  return (
    <article className="relative py-3 pl-5 pr-2">
      <span
        aria-hidden="true"
        className={[
          "absolute left-1 top-4 h-[calc(100%-2rem)] w-px rounded-full opacity-70",
          timelineAccentClasses[summary.tone],
        ].join(" ")}
      />
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-grayscale-12">
              {summary.title}
            </h3>
            <span
              className={[
                "font-mono text-[10px] font-semibold uppercase",
                timelineToneClasses[summary.tone],
              ].join(" ")}
            >
              {summary.glyph}
            </span>
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
      <div className="mt-2 flex flex-col gap-2">
        {summary.body ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-grayscale-12">
            {summary.body}
          </p>
        ) : null}
        <DetailGrid items={summary.details} />
        <details>
          <summary className="inline-flex cursor-pointer items-center text-xs font-medium text-grayscale-10 hover:text-grayscale-12">
            Payload
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-5 text-grayscale-12">
            <code>{formatPayload(event.payload ?? event.raw ?? "")}</code>
          </pre>
        </details>
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

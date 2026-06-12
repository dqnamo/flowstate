import { task } from "@trigger.dev/sdk";
import { Sandbox } from "e2b";
import adminDb, { id } from "@/lib/server/admin-db";
import { parseCodexJsonEventLine } from "@/lib/server/codex-events";
import {
  CODEX_RUN_OUTPUT_SCHEMA,
  parseCodexRunOutput,
} from "@/lib/server/codex-parsing";
import { decryptSecret } from "@/lib/server/encryption";
import { requireEnv } from "@/lib/server/env";
import { getInstallationToken } from "@/lib/server/github";
import { shellQuote } from "@/lib/server/shell";

const CODEX_AUTH_PATH = "~/.codex/auth.json";
const CODEX_OUTPUT_SCHEMA_PATH = "/tmp/flowstate-codex-output-schema.json";
const CODEX_OUTPUT_PATH = "/tmp/flowstate-codex-output.json";
const WORKSPACE_PATH = "/home/user/project";

export const processRunTask = task({
  id: "process-run",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: { runId: string }) => {
    await updateRun(payload.runId, { status: "running" });

    let sandbox: Sandbox | undefined;
    let shouldKillSandboxOnFailure = false;

    try {
      const run = await getRun(payload.runId);
      const project = run?.project;
      const parentRun = run?.parentRunId
        ? await getRun(run.parentRunId)
        : undefined;
      const agent = project?.codingAgents?.find(
        (item) => item.provider === "codex",
      );
      const authSecret = agent?.authSecret;

      if (!run || !project) {
        throw new Error("Run or project not found");
      }

      if (!project.githubInstallationId || !project.githubRepositoryFullName) {
        throw new Error("Project repository is not connected");
      }

      if (agent?.status !== "ready" || !authSecret) {
        throw new Error("Project Codex agent is not ready");
      }

      const githubToken = await getInstallationToken(
        project.githubInstallationId,
      );

      if (parentRun?.sandboxId) {
        sandbox = await Sandbox.connect(parentRun.sandboxId);
      } else {
        shouldKillSandboxOnFailure = true;
        sandbox = await Sandbox.create("codex", {
          timeoutMs: 60 * 60 * 1000,
          lifecycle: {
            onTimeout: "pause",
            autoResume: true,
          },
          network: {
            allowPublicTraffic: true,
          },
        });

        await installBaseTools(sandbox);
        await writeCodexAuth(sandbox, authSecret.valueEncrypted);
        await cloneRepository(
          sandbox,
          githubToken,
          project.githubRepositoryFullName,
        );
        await configureGithubAuth(sandbox, githubToken);
        await sandbox.files.write(
          CODEX_OUTPUT_SCHEMA_PATH,
          JSON.stringify(CODEX_RUN_OUTPUT_SCHEMA, null, 2),
        );
      }

      if (!sandbox) {
        throw new Error("Sandbox was not initialized");
      }

      const activeSandbox = sandbox;

      await updateRun(payload.runId, {
        sandboxId: activeSandbox.sandboxId,
      });

      const eventWriter = createRunEventWriter(payload.runId, run.ownerId);

      await activeSandbox.commands.run(
        buildCodexCommand(run.prompt, Boolean(parentRun)),
        {
          timeoutMs: 0,
          cwd: WORKSPACE_PATH,
          envs: getGithubEnvs(githubToken),
          onStdout: eventWriter.onStdout,
          onStderr: eventWriter.onStderr,
        },
      );
      await eventWriter.flush();

      const rawOutput = await activeSandbox.files.read(CODEX_OUTPUT_PATH);
      const output = parseCodexRunOutput(rawOutput);
      const preview =
        parentRun?.previewBaseUrl &&
        parentRun.previewCommand &&
        parentRun.previewPort
          ? {
              command: parentRun.previewCommand,
              port: parentRun.previewPort,
              baseUrl: parentRun.previewBaseUrl,
              pid: undefined,
            }
          : await startPreview(
              activeSandbox,
              output.preview.command,
              output.preview.port,
            );
      const codeChangesWithDiffs = await Promise.all(
        output.codeChanges.map(async (change) => ({
          ...change,
          id: id(),
          diff: await getChangeDiff(activeSandbox, change.files),
        })),
      );

      console.log("Started preview", {
        runId: payload.runId,
        pid: preview.pid,
        previewBaseUrl: preview.baseUrl,
      });

      const nextSequence = await getNextEventSequence(payload.runId);
      await adminDb.transact([
        adminDb.tx.runs[payload.runId].update({
          status: "ready_for_review",
          completedAt: new Date(),
          responseText: output.responseText,
          previewCommand: preview.command,
          previewPort: preview.port,
          previewBaseUrl: preview.baseUrl,
          branchName: output.branchName,
          pullRequestUrl: output.pullRequestUrl,
          pullRequestNumber: output.pullRequestNumber,
          sandboxId: activeSandbox.sandboxId,
        }),
        ...codeChangesWithDiffs.map((change) =>
          adminDb.tx.codeChanges[change.id]
            .create({
              ownerId: run.ownerId,
              title: change.title,
              summary: change.summary,
              files: change.files,
              previewPath: normalizePreviewPath(change.previewPath),
              diff: change.diff,
              status: "pending",
              createdAt: new Date(),
            })
            .link({ run: payload.runId }),
        ),
        ...codeChangesWithDiffs.map((change, index) =>
          adminDb.tx.events[id()]
            .create({
              ownerId: run.ownerId,
              scope: "run",
              sequence: nextSequence + index,
              type: "change.ready",
              payload: {
                changeId: change.id,
                title: change.title,
                files: change.files,
                previewPath: normalizePreviewPath(change.previewPath),
              },
              createdAt: new Date(),
            })
            .link({ run: payload.runId }),
        ),
      ]);
    } catch (error) {
      await updateRun(payload.runId, {
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (sandbox && shouldKillSandboxOnFailure) {
        await sandbox.kill().catch(() => undefined);
      }

      throw error;
    }
  },
});

const getRun = async (runId: string) => {
  const { runs } = await adminDb.query({
    runs: {
      $: {
        where: {
          id: runId,
        },
      },
      project: {
        codingAgents: {
          authSecret: {},
        },
      },
      events: {},
    },
  });

  return runs[0];
};

const updateRun = async (
  runId: string,
  data: Record<string, string | number | Date | undefined>,
) => {
  await adminDb.transact(adminDb.tx.runs[runId].update(data));
};

const installBaseTools = async (sandbox: Sandbox) => {
  await sandbox.commands.run(
    [
      "mkdir -p ~/.codex",
      "printf 'cli_auth_credentials_store = \"file\"\\n' > ~/.codex/config.toml",
      "npm install -g @openai/codex@latest --no-audit --no-fund || codex --version",
      "codex --version",
    ].join("\n"),
    { timeoutMs: 120_000 },
  );
};

const writeCodexAuth = async (sandbox: Sandbox, encryptedAuth: string) => {
  const rawAuth = await decryptSecret(
    encryptedAuth,
    requireEnv("SECRET_ENCRYPTION_KEY"),
  );
  await sandbox.files.write(CODEX_AUTH_PATH, rawAuth);
};

const cloneRepository = async (
  sandbox: Sandbox,
  githubToken: string,
  repositoryFullName: string,
) => {
  const cloneUrl = `https://github.com/${repositoryFullName}.git`;

  await sandbox.commands.run(
    [
      'GITHUB_AUTH_HEADER="$(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 | tr -d "\\n")"',
      "git -c 'http.https://github.com/.extraheader=Authorization: Basic '\"$GITHUB_AUTH_HEADER\" clone --branch main --single-branch " +
        `${shellQuote(cloneUrl)} ${shellQuote(WORKSPACE_PATH)}`,
    ].join("\n"),
    {
      timeoutMs: 120_000,
      envs: {
        ...getGithubEnvs(githubToken),
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );
};

const configureGithubAuth = async (sandbox: Sandbox, githubToken: string) => {
  await sandbox.commands.run(
    [
      'GITHUB_AUTH_HEADER="$(printf "x-access-token:%s" "$GITHUB_TOKEN" | base64 | tr -d "\\n")"',
      "git config --global http.https://github.com/.extraheader " +
        "'Authorization: Basic '\"$GITHUB_AUTH_HEADER\"",
      'git config --global user.name "flowstate-agent"',
      'git config --global user.email "flowstate-agent@users.noreply.github.com"',
    ].join("\n"),
    {
      timeoutMs: 30_000,
      envs: getGithubEnvs(githubToken),
    },
  );
};

const getGithubEnvs = (githubToken: string) => ({
  GITHUB_TOKEN: githubToken,
  GH_TOKEN: githubToken,
  GIT_TERMINAL_PROMPT: "0",
});

const buildCodexCommand = (prompt: string, resumeLast = false) =>
  [
    "codex exec",
    resumeLast ? "resume --last" : undefined,
    "--json",
    "--color never",
    "--yolo",
    "--model gpt-5.5",
    `--output-schema ${shellQuote(CODEX_OUTPUT_SCHEMA_PATH)}`,
    `--output-last-message ${shellQuote(CODEX_OUTPUT_PATH)}`,
    shellQuote(buildPrompt(prompt)),
  ]
    .filter(Boolean)
    .join(" ");

const buildPrompt = (prompt: string) =>
  [
    prompt,
    "",
    "Return structured output that matches the provided schema.",
    "For preview.command, provide the command Flowstate should run from the repository root to start the app preview.",
    "For preview.port, provide the local port exposed by that preview command.",
    "For each codeChanges item, include files changed and previewPath for the most relevant in-app URL path.",
    "You have GITHUB_TOKEN and GH_TOKEN for this repository. If you push changes or create a PR, use a branch named flowstate/run-<short-id>, and include branchName, pullRequestUrl, and pullRequestNumber in the structured output.",
  ].join("\n");

const normalizePreviewPath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const startPreview = async (
  sandbox: Sandbox,
  command: string,
  port: number,
) => {
  const previewProcess = await sandbox.commands.run(command, {
    background: true,
    timeoutMs: 0,
    cwd: WORKSPACE_PATH,
  });

  return {
    command,
    port,
    baseUrl: `https://${sandbox.getHost(port)}`,
    pid: previewProcess.pid,
  };
};

const getChangeDiff = async (sandbox: Sandbox, files: string[]) => {
  if (files.length === 0) {
    return "";
  }

  const result = await sandbox.commands.run(
    [
      `git add -N -- ${files.map(shellQuote).join(" ")} || true`,
      `git diff --binary HEAD -- ${files.map(shellQuote).join(" ")}`,
    ].join("\n"),
    {
      timeoutMs: 30_000,
      cwd: WORKSPACE_PATH,
    },
  );

  return result.stdout.trim();
};

const getNextEventSequence = async (runId: string) => {
  const run = await getRun(runId);
  const sequences =
    run?.events
      ?.map((event) => event.sequence)
      .filter((sequence): sequence is number => typeof sequence === "number") ??
    [];

  return sequences.length > 0 ? Math.max(...sequences) + 1 : 0;
};

const createRunEventWriter = (runId: string, ownerId: string) => {
  let sequence = 0;
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const saveEvent = async (type: string, raw: string, payload?: unknown) => {
    const currentSequence = sequence;
    sequence += 1;

    await adminDb.transact(
      adminDb.tx.events[id()]
        .create({
          ownerId,
          scope: "run",
          sequence: currentSequence,
          type,
          raw,
          payload,
          createdAt: new Date(),
        })
        .link({ run: runId }),
    );
  };

  const drainStdout = async (chunk: string, flush = false) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = flush ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      try {
        const event = parseCodexJsonEventLine(trimmed);
        await saveEvent(event.type, event.raw, event.payload);
      } catch {
        await saveEvent("stdout", trimmed, { text: trimmed });
      }
    }
  };

  const drainStderr = async (chunk: string, flush = false) => {
    stderrBuffer += chunk;
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = flush ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed) {
        await saveEvent("stderr", trimmed, { text: trimmed });
      }
    }
  };

  return {
    onStdout: (chunk: string) => drainStdout(chunk),
    onStderr: (chunk: string) => drainStderr(chunk),
    flush: async () => {
      if (stdoutBuffer) {
        await drainStdout("\n", true);
      }

      if (stderrBuffer) {
        await drainStderr("\n", true);
      }
    },
  };
};

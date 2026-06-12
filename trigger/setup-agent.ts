import { task } from "@trigger.dev/sdk";
import { Sandbox } from "e2b";
import adminDb, { id } from "@/lib/server/admin-db";
import { parseCodexDeviceAuthOutput } from "@/lib/server/codex-parsing";
import { encryptSecret } from "@/lib/server/encryption";
import { requireEnv } from "@/lib/server/env";

const CODEX_AUTH_PATH = "~/.codex/auth.json";
const DEVICE_CODE_TIMEOUT_MS = 90_000;
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g",
);

export const setupCodexAgentTask = task({
  id: "setup-codex-agent",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: { projectId: string; agentId: string }) => {
    await updateAgent(payload.agentId, { status: "setting_up" });

    let sandbox: Sandbox | undefined;

    try {
      const project = await getProject(payload.projectId);
      const agent = project?.codingAgents?.find(
        (item) => item.id === payload.agentId,
      );

      if (!project || !agent) {
        throw new Error("Project or agent not found");
      }

      sandbox = await Sandbox.create("codex", {
        timeoutMs: 10 * 60 * 1000,
        lifecycle: {
          onTimeout: "pause",
          autoResume: true,
        },
        network: {
          allowPublicTraffic: false,
        },
      });

      await sandbox.commands.run(
        [
          "mkdir -p ~/.codex",
          "printf 'cli_auth_credentials_store = \"file\"\\n' > ~/.codex/config.toml",
          "npm install -g @openai/codex@latest --no-audit --no-fund || codex --version",
          "codex --version",
        ].join("\n"),
        { timeoutMs: 120_000 },
      );

      await updateAgent(payload.agentId, {
        status: "requesting_login",
        deviceAuthStartedAt: new Date(),
      });

      let combinedOutput = "";
      let published = false;
      const publishDeviceAuth = async (chunk: string) => {
        combinedOutput += chunk;
        const parsed = parseCodexDeviceAuthOutput(combinedOutput);

        if (published || !parsed.verificationUrl || !parsed.userCode) {
          return;
        }

        published = true;
        await updateAgent(payload.agentId, {
          status: "awaiting_login",
          deviceAuthUrl: parsed.verificationUrl,
          deviceAuthCode: parsed.userCode,
        });
      };

      const loginHandle = await sandbox.commands.run(
        "codex login --device-auth",
        {
          background: true,
          timeoutMs: 10 * 60 * 1000,
          onStdout: publishDeviceAuth,
          onStderr: publishDeviceAuth,
        },
      );

      const startedWaitingForCodeAt = Date.now();
      let stdoutLength = 0;
      let stderrLength = 0;

      while (!published) {
        if (loginHandle.stdout.length > stdoutLength) {
          await publishDeviceAuth(loginHandle.stdout.slice(stdoutLength));
          stdoutLength = loginHandle.stdout.length;
        }

        if (loginHandle.stderr.length > stderrLength) {
          await publishDeviceAuth(loginHandle.stderr.slice(stderrLength));
          stderrLength = loginHandle.stderr.length;
        }

        if (published) {
          break;
        }

        if (loginHandle.exitCode !== undefined) {
          throw new Error(
            `Codex login exited before printing a device code. Output: ${formatLoginOutput(
              combinedOutput || `${loginHandle.stdout}\n${loginHandle.stderr}`,
            )}`,
          );
        }

        if (Date.now() - startedWaitingForCodeAt > DEVICE_CODE_TIMEOUT_MS) {
          await loginHandle.kill().catch(() => false);
          throw new Error(
            `Codex did not print a device code within ${
              DEVICE_CODE_TIMEOUT_MS / 1000
            } seconds. Device code login may not be enabled for this ChatGPT account/workspace, or Codex may have fallen back to browser login. Output: ${formatLoginOutput(
              combinedOutput || `${loginHandle.stdout}\n${loginHandle.stderr}`,
            )}`,
          );
        }

        await wait(1_000);
      }

      await loginHandle.wait();

      const rawAuth = await sandbox.files.read(CODEX_AUTH_PATH);
      const encryptedAuth = await encryptSecret(
        rawAuth,
        requireEnv("SECRET_ENCRYPTION_KEY"),
      );
      const authSecretId = agent.authSecret?.id ?? id();

      await adminDb.transact([
        agent.authSecret
          ? adminDb.tx.agentAuthSecrets[authSecretId].update({
              valueEncrypted: encryptedAuth,
            })
          : adminDb.tx.agentAuthSecrets[authSecretId]
              .create({
                ownerId: project.ownerId,
                valueEncrypted: encryptedAuth,
                createdAt: new Date(),
              })
              .link({ codingAgent: payload.agentId }),
        adminDb.tx.codingAgents[payload.agentId].update({
          status: "ready",
          deviceAuthCompletedAt: new Date(),
        }),
        adminDb.tx.projects[payload.projectId].update({
          status: "ready",
        }),
      ]);
    } catch (error) {
      await adminDb.transact([
        adminDb.tx.codingAgents[payload.agentId].update({
          status: "setup_failed",
          setupError: error instanceof Error ? error.message : String(error),
        }),
        adminDb.tx.projects[payload.projectId].update({
          status: "setup_failed",
        }),
      ]);

      throw error;
    } finally {
      if (sandbox) {
        await sandbox.kill().catch(() => undefined);
      }
    }
  },
});

const getProject = async (projectId: string) => {
  const { projects } = await adminDb.query({
    projects: {
      $: {
        where: {
          id: projectId,
        },
      },
      codingAgents: {
        authSecret: {},
      },
    },
  });

  return projects[0];
};

const updateAgent = async (
  agentId: string,
  data: Record<string, string | Date | undefined>,
) => {
  await adminDb.transact(adminDb.tx.codingAgents[agentId].update(data));
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatLoginOutput = (output: string) => {
  const trimmed = output
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/g, "[device-code]")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) {
    return "(no output captured)";
  }

  return trimmed.slice(0, 1_000);
};

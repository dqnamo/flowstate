import { randomUUID } from "node:crypto";
import { tasks } from "@trigger.dev/sdk";
import adminDb from "@/lib/server/admin-db";
import type { setupCodexAgentTask } from "@/trigger/setup-agent";

export async function startCodexAgentSetup(projectId: string, agentId: string) {
  try {
    return await tasks.trigger<typeof setupCodexAgentTask>(
      "setup-codex-agent",
      { projectId, agentId },
      { idempotencyKey: `setup-codex-agent-${agentId}-${randomUUID()}` },
    );
  } catch (error) {
    await adminDb.transact([
      adminDb.tx.codingAgents[agentId].update({
        status: "setup_failed",
        setupError:
          error instanceof Error ? error.message : "Failed to enqueue setup",
      }),
      adminDb.tx.projects[projectId].update({
        status: "setup_failed",
      }),
    ]);

    throw error;
  }
}

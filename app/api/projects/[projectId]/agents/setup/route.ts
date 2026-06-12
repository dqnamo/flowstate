import { NextResponse } from "next/server";
import adminDb, { id } from "@/lib/server/admin-db";
import { startCodexAgentSetup } from "@/lib/server/agent-setup";
import { requireUser } from "@/lib/server/auth";
import {
  getPrimaryCodexAgent,
  requireProjectForUser,
} from "@/lib/server/projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { projectId } = await context.params;
    const project = await requireProjectForUser(projectId, user.id);

    if (!project.githubRepositoryFullName) {
      return NextResponse.json(
        { message: "Select a repository before setting up Codex" },
        { status: 400 },
      );
    }

    const existingAgent = getPrimaryCodexAgent(project);
    const agentId = existingAgent?.id ?? id();

    await adminDb.transact([
      adminDb.tx.projects[projectId].update({
        status: "setting_up_agent",
      }),
      existingAgent
        ? adminDb.tx.codingAgents[agentId].update({
            status: "setup_queued",
            setupError: "",
            deviceAuthUrl: "",
            deviceAuthCode: "",
          })
        : adminDb.tx.codingAgents[agentId]
            .create({
              ownerId: user.id,
              provider: "codex",
              status: "setup_queued",
              createdAt: new Date(),
            })
            .link({ project: projectId }),
    ]);

    const handle = await startCodexAgentSetup(projectId, agentId);

    return NextResponse.json({ agentId, runId: handle.id });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to start setup",
      },
      { status: 500 },
    );
  }
}

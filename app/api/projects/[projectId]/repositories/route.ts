import { NextResponse } from "next/server";
import adminDb, { id } from "@/lib/server/admin-db";
import { startCodexAgentSetup } from "@/lib/server/agent-setup";
import { requireUser } from "@/lib/server/auth";
import {
  type GithubRepository,
  listInstallationRepositories,
} from "@/lib/server/github";
import {
  getPrimaryCodexAgent,
  requireProjectForUser,
} from "@/lib/server/projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { projectId } = await context.params;
    const project = await requireProjectForUser(projectId, user.id);

    if (!project.githubInstallationId) {
      return NextResponse.json(
        { message: "Project has no GitHub installation" },
        { status: 400 },
      );
    }

    const repositories = await listInstallationRepositories(
      project.githubInstallationId,
    );

    return NextResponse.json({ repositories });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to load repositories",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { projectId } = await context.params;
    const project = await requireProjectForUser(projectId, user.id);
    const body = (await req.json()) as { repositoryId?: number };

    if (!project.githubInstallationId) {
      return NextResponse.json(
        { message: "Project has no GitHub installation" },
        { status: 400 },
      );
    }

    if (!body.repositoryId) {
      return NextResponse.json(
        { message: "repositoryId is required" },
        { status: 400 },
      );
    }

    const repositories = await listInstallationRepositories(
      project.githubInstallationId,
    );
    const repository = repositories.find(
      (item) => item.id === body.repositoryId,
    );

    if (!repository) {
      return NextResponse.json(
        { message: "Repository is not available to this installation" },
        { status: 400 },
      );
    }

    const existingAgent = getPrimaryCodexAgent(project);
    const agentId = existingAgent?.id ?? id();
    const createdAt = new Date();

    await adminDb.transact([
      adminDb.tx.projects[projectId].update({
        githubRepositoryId: String(repository.id),
        githubRepositoryName: repository.name,
        githubRepositoryFullName: repository.fullName,
        githubRepositoryUrl: repository.htmlUrl,
        branch: "main",
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
              createdAt,
            })
            .link({ project: projectId }),
    ]);

    const handle = await startCodexAgentSetup(projectId, agentId);

    return NextResponse.json({ agentId, runId: handle.id, repository });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to save repository",
      },
      { status: 500 },
    );
  }
}

export type { GithubRepository };

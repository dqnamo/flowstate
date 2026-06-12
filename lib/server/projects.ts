import adminDb from "@/lib/server/admin-db";

export async function getProjectForUser(projectId: string, ownerId: string) {
  const { projects } = await adminDb.query({
    projects: {
      $: {
        where: {
          id: projectId,
          ownerId,
        },
      },
      codingAgents: {
        authSecret: {},
      },
      runs: {
        codeChanges: {},
      },
    },
  });

  return projects[0];
}

export async function requireProjectForUser(
  projectId: string,
  ownerId: string,
) {
  const project = await getProjectForUser(projectId, ownerId);

  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  return project;
}

export function getPrimaryCodexAgent<
  TProject extends {
    codingAgents?: {
      id: string;
      provider?: string | null;
      status?: string | null;
    }[];
  },
>(project: TProject) {
  return project.codingAgents?.find((agent) => agent.provider === "codex");
}

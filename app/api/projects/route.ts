import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import adminDb, { id } from "@/lib/server/admin-db";
import { requireUser } from "@/lib/server/auth";
import { getGithubInstallUrl } from "@/lib/server/github";
import { getLatestGithubInstallationForUser } from "@/lib/server/github-installations";
import { signGithubState } from "@/lib/server/github-state";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { message: "Project name is required" },
        { status: 400 },
      );
    }

    const githubInstallation = await getLatestGithubInstallationForUser(
      user.id,
    );
    const projectId = id();
    const createdAt = new Date();
    await adminDb.transact(
      adminDb.tx.projects[projectId]
        .create({
          ownerId: user.id,
          name,
          status: githubInstallation ? "selecting_repo" : "connecting_github",
          branch: "main",
          createdAt,
          githubInstallationId: githubInstallation?.installationId,
        })
        .link({ owner: user.id }),
    );

    if (githubInstallation) {
      const nextUrl = `/app/projects/${projectId}`;
      return NextResponse.json({
        projectId,
        installUrl: nextUrl,
        nextUrl,
      });
    }

    const state = signGithubState({
      projectId,
      ownerId: user.id,
      nonce: randomUUID(),
    });
    const installUrl = getGithubInstallUrl(state);

    return NextResponse.json({
      projectId,
      installUrl,
      nextUrl: installUrl,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to create project",
      },
      { status: 500 },
    );
  }
}

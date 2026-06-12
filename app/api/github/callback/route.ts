import { NextResponse } from "next/server";
import adminDb from "@/lib/server/admin-db";
import { saveGithubInstallationForUser } from "@/lib/server/github-installations";
import { verifyGithubState } from "@/lib/server/github-state";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const installationId = url.searchParams.get("installation_id");

    if (!state || !installationId) {
      return NextResponse.json(
        { message: "Missing GitHub installation callback parameters" },
        { status: 400 },
      );
    }

    const verifiedState = verifyGithubState(state);
    await saveGithubInstallationForUser(verifiedState.ownerId, installationId);
    await adminDb.transact(
      adminDb.tx.projects[verifiedState.projectId].update({
        githubInstallationId: installationId,
        status: "selecting_repo",
      }),
    );

    return NextResponse.redirect(
      new URL(`/app/projects/${verifiedState.projectId}`, req.url),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to connect GitHub",
      },
      { status: 400 },
    );
  }
}

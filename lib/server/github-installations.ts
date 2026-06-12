import adminDb, { id } from "@/lib/server/admin-db";

type GithubInstallation = {
  id: string;
  ownerId: string;
  installationId: string;
  ownerInstallationKey: string;
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
};

type ProjectWithGithubInstallation = {
  githubInstallationId?: string | null;
  createdAt?: Date | string | number | null;
};

export async function getLatestGithubInstallationForUser(ownerId: string) {
  const { githubInstallations } = await adminDb.query({
    githubInstallations: {
      $: {
        where: {
          ownerId,
        },
      },
    },
  });

  const savedInstallation = [...(githubInstallations as GithubInstallation[])]
    .sort(
      (first, second) =>
        getRecordTime(second.updatedAt ?? second.createdAt) -
        getRecordTime(first.updatedAt ?? first.createdAt),
    )
    .at(0);

  if (savedInstallation) {
    return savedInstallation;
  }

  const { projects } = await adminDb.query({
    projects: {
      $: {
        where: {
          ownerId,
        },
      },
    },
  });
  const projectInstallation = [...(projects as ProjectWithGithubInstallation[])]
    .sort(
      (first, second) =>
        getRecordTime(second.createdAt) - getRecordTime(first.createdAt),
    )
    .find((project) => project.githubInstallationId);

  if (!projectInstallation?.githubInstallationId) {
    return undefined;
  }

  return {
    installationId: projectInstallation.githubInstallationId,
  };
}

export async function saveGithubInstallationForUser(
  ownerId: string,
  installationId: string,
) {
  const ownerInstallationKey = getOwnerInstallationKey(ownerId, installationId);
  const { githubInstallations } = await adminDb.query({
    githubInstallations: {
      $: {
        where: {
          ownerInstallationKey,
        },
      },
    },
  });
  const existing = githubInstallations[0] as GithubInstallation | undefined;
  const now = new Date();

  await adminDb.transact(
    existing
      ? adminDb.tx.githubInstallations[existing.id].update({
          updatedAt: now,
        })
      : adminDb.tx.githubInstallations[id()].create({
          ownerId,
          installationId,
          ownerInstallationKey,
          createdAt: now,
          updatedAt: now,
        }),
  );
}

function getOwnerInstallationKey(ownerId: string, installationId: string) {
  return `${ownerId}:${installationId}`;
}

function getRecordTime(value: Date | string | number | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

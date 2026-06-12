import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { requireEnv } from "@/lib/server/env";

export type GithubRepository = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
};

export function getGithubInstallUrl(state: string) {
  const slug = requireEnv("GITHUB_APP_SLUG");
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
}

export async function getInstallationOctokit(installationId: string) {
  const auth = createAppAuth({
    appId: requireEnv("GITHUB_APP_ID"),
    privateKey: normalizePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY")),
  });
  const installationAuthentication = await auth({
    type: "installation",
    installationId: Number(installationId),
  });

  return new Octokit({ auth: installationAuthentication.token });
}

export async function getInstallationToken(installationId: string) {
  const auth = createAppAuth({
    appId: requireEnv("GITHUB_APP_ID"),
    privateKey: normalizePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY")),
  });
  const installationAuthentication = await auth({
    type: "installation",
    installationId: Number(installationId),
  });

  return installationAuthentication.token;
}

export async function listInstallationRepositories(installationId: string) {
  const octokit = await getInstallationOctokit(installationId);
  const repos = await octokit.paginate("GET /installation/repositories", {
    per_page: 100,
  });

  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
  })) satisfies GithubRepository[];
}

const normalizePrivateKey = (value: string) => value.replaceAll("\\n", "\n");

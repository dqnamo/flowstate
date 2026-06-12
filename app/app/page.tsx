"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
import SignOutButton from "@/components/SignOutButton";
import db from "@/lib/db";

export default function AppPage() {
  return (
    <AuthGate>
      <ProjectsHome />
    </AuthGate>
  );
}

function ProjectsHome() {
  const { user } = db.useAuth();
  const { data, isLoading, error } = db.useQuery(
    user
      ? {
          projects: {
            $: {
              where: {
                ownerId: user.id,
              },
            },
            codingAgents: {},
          },
        }
      : null,
  );
  const projects = [...(data?.projects ?? [])].sort(
    (first, second) =>
      new Date(second.createdAt ?? 0).getTime() -
      new Date(first.createdAt ?? 0).getTime(),
  );

  return (
    <main className="flex min-h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-grayscale-12">Flowstate</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/new">
            <Button type="button">New project</Button>
          </Link>
          <SignOutButton />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-grayscale-10">Loading...</p>
      ) : null}
      {error ? (
        <p className="text-sm text-grayscale-10">{error.message}</p>
      ) : null}

      <div className="flex flex-col divide-y divide-grayscale-4 border border-grayscale-4 bg-white">
        {projects.length > 0 ? (
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/app/projects/${project.id}`}
              className="flex items-center justify-between gap-3 p-3 text-sm text-grayscale-12"
            >
              <span>{project.name}</span>
              <span className="text-xs text-grayscale-10">
                {project.status}
              </span>
            </Link>
          ))
        ) : (
          <p className="p-3 text-sm text-grayscale-10">No projects yet.</p>
        )}
      </div>
    </main>
  );
}

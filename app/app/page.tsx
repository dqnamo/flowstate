"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
import SignOutButton from "@/components/SignOutButton";
import { cn } from "@/helpers/classname-helper";
import db from "@/lib/db";

const PROJECT_NAV_HOTKEYS = [
  "meta+1",
  "meta+2",
  "meta+3",
  "meta+4",
  "meta+5",
  "meta+6",
  "meta+7",
  "meta+8",
  "meta+9",
];

export default function AppPage() {
  return (
    <AuthGate>
      <ProjectsHome />
    </AuthGate>
  );
}

function ProjectsHome() {
  const router = useRouter();
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

  useHotkeys(
    PROJECT_NAV_HOTKEYS,
    (event) => {
      const index = Number(event.key) - 1;
      const project = projects[index];

      if (project) {
        router.push(getProjectHref(project.id));
      }
    },
    {
      enabled: projects.length > 0,
      preventDefault: true,
    },
    [projects, router],
  );

  useHotkeys(
    "n",
    () => {
      router.push("/app/new");
    },
    {
      preventDefault: true,
    },
    [router],
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-grayscale-1 p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-medium text-grayscale-12">Your projects</h1>
        <p className="text-sm text-grayscale-10">Pick up where you left off.</p>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-grayscale-10">Loading...</p>
      ) : null}
      {error ? (
        <p className="text-center text-sm text-grayscale-10">{error.message}</p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        {projects.length > 0 ? (
          projects.map((project, index) => {
            const runningAgents = project.codingAgents.filter(
              (agent) => agent.status === "ready",
            ).length;
            const shortcut = index < 9 ? `⌘${index + 1}` : undefined;

            return (
              <Link
                key={project.id}
                href={getProjectHref(project.id)}
                className="group flex min-h-36 w-full max-w-72 flex-col justify-between rounded-[8px] border border-grayscale-4 bg-white p-4 text-grayscale-12 transition-colors hover:border-grayscale-7 hover:bg-grayscale-2 sm:w-72"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-base font-medium">
                      {project.name}
                    </span>
                    {shortcut ? (
                      <ProjectShortcutBadge>{shortcut}</ProjectShortcutBadge>
                    ) : null}
                  </span>
                  <span className="w-fit rounded-[8px] bg-grayscale-3 px-2 py-1 text-tiny font-medium uppercase text-grayscale-10">
                    {formatStatus(project.status)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-grayscale-10">Running agents</span>
                  <span className="flex items-center gap-2 font-medium text-grayscale-12">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-grayscale-7",
                        runningAgents > 0 && "bg-green-500",
                      )}
                      aria-hidden="true"
                    />
                    {runningAgents}
                  </span>
                </div>
              </Link>
            );
          })
        ) : (
          <p className="rounded-[8px] border border-grayscale-4 bg-white p-4 text-sm text-grayscale-10">
            No projects yet.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/app/new">
          <Button type="button">
            New project
            <ButtonShortcutBadge>N</ButtonShortcutBadge>
          </Button>
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}

function ProjectShortcutBadge({ children }: { children: string }) {
  return (
    <kbd className="shrink-0 rounded-[4px] bg-grayscale-3 px-1.5 py-1 font-mono text-[10px] leading-none text-grayscale-10">
      {children}
    </kbd>
  );
}

function ButtonShortcutBadge({ children }: { children: string }) {
  return (
    <kbd className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-grayscale-11 px-1 font-mono text-xs leading-none text-grayscale-1">
      {children}
    </kbd>
  );
}

function getProjectHref(projectId: string) {
  return `/app/projects/${projectId}`;
}

function formatStatus(status?: string | null) {
  return status?.replaceAll("_", " ") ?? "unknown";
}

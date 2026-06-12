"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
import CornerCubes from "@/components/CornerCubes";
import DitheredWaves from "@/components/DitheredWaves";
import { Input } from "@/components/Input";
import SetupSteps from "@/components/SetupSteps";
import db from "@/lib/db";

export default function NewProjectPage() {
  return (
    <AuthGate>
      <NewProjectForm />
    </AuthGate>
  );
}

function NewProjectForm() {
  const router = useRouter();
  const { user } = db.useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const createProject = async () => {
    if (!user || isSubmitting || !name.trim()) {
      return;
    }

    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${user.refresh_token}`,
        },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as {
        installUrl?: string;
        nextUrl?: string;
        message?: string;
      };
      const nextUrl = body.nextUrl ?? body.installUrl;

      if (!response.ok || !nextUrl) {
        throw new Error(body.message ?? "Failed to create project");
      }

      router.push(nextUrl);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to create project",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-grayscale-1 p-4">
      <div className="pointer-events-none absolute inset-0 z-0">
        <DitheredWaves
          height="100%"
          colors={[
            "#fcfcfd",
            "#f9f9fb",
            "#f0f0f3",
            "#e8e8ec",
            "#e0e1e6",
            "#d9d9e0",
            "#cdced6",
            "#b9bbc6",
            "#8b8d98",
          ]}
        />
      </div>
      <form
        ref={formRef}
        className="relative z-10 flex w-full max-w-xl flex-col rounded-[8px] border border-grayscale-4 bg-white"
        onSubmit={(event) => {
          event.preventDefault();
          void createProject();
        }}
      >
        <CornerCubes
          placement="outside"
          spacing={3}
          translate={12}
          size={8}
          color="var(--color-grayscale-6)"
          className="rounded-[2px]"
          active={true}
        />
        <div className="flex flex-col gap-4 p-3">
          <SetupSteps activeStep={1} />
          <div>
            <h1 className="text-sm font-medium text-grayscale-12">
              New project
            </h1>
            <p className="text-xs text-grayscale-10">
              Name it, then connect GitHub.
            </p>
          </div>
          <label
            htmlFor={nameId}
            className="flex flex-col gap-1 text-xs text-grayscale-11"
          >
            Name
            <Input
              id={nameId}
              required
              value={name}
              disabled={isSubmitting}
              placeholder="Flowstate"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        {error ? (
          <p className="px-3 text-xs text-grayscale-10">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 p-3">
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => router.push("/app")}
          >
            Previous
          </Button>
          <Button type="submit" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Next..." : "Next"}
            <WizardShortcutBadge>↵</WizardShortcutBadge>
          </Button>
        </div>
      </form>
    </main>
  );
}

function WizardShortcutBadge({ children }: { children: string }) {
  return (
    <kbd className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-grayscale-11 px-1 font-mono text-xs leading-none text-grayscale-1">
      {children}
    </kbd>
  );
}

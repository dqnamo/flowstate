"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/Button";
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
  const nameId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createProject = async () => {
    if (!user || isSubmitting) {
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
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        className="flex w-full max-w-md flex-col gap-3 border border-grayscale-4 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void createProject();
        }}
      >
        <SetupSteps activeStep={1} />
        <div>
          <h1 className="text-lg font-medium text-grayscale-12">New project</h1>
          <p className="text-xs text-grayscale-10">
            Name it, then install the GitHub App.
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
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? <p className="text-xs text-grayscale-10">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Creating..." : "Connect GitHub"}
          </Button>
        </div>
      </form>
    </main>
  );
}

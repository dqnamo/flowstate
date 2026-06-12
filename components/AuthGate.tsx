"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import db from "@/lib/db";

type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const { isLoading, user, error: authError } = db.useAuth();
  const emailId = useId();
  const codeId = useId();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmedEmail = email.trim();
  const trimmedCode = code.trim();
  const canSubmit =
    trimmedEmail.length > 0 && (!isCodeSent || trimmedCode.length > 0);

  const submitAuth = async () => {
    if (isSubmitting || !canSubmit) {
      return;
    }

    setError(undefined);
    setIsSubmitting(true);

    try {
      if (isCodeSent) {
        await db.auth.signInWithMagicCode({
          email: trimmedEmail,
          code: trimmedCode,
        });
      } else {
        await db.auth.sendMagicCode({ email: trimmedEmail });
        setIsCodeSent(true);
      }
    } catch (error) {
      setError(getErrorMessage(error, "Auth failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <main className="p-4">Loading...</main>;
  }

  if (authError) {
    return <main className="p-4">{authError.message}</main>;
  }

  if (user) {
    return children;
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        className="flex w-full max-w-sm flex-col gap-3 rounded-[12px] border border-grayscale-4 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submitAuth();
        }}
      >
        <h1 className="text-lg font-medium text-grayscale-12">Sign in</h1>
        <label
          htmlFor={emailId}
          className="flex flex-col gap-1 text-xs text-grayscale-11"
        >
          Email
          <Input
            id={emailId}
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={isSubmitting || isCodeSent}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {isCodeSent ? (
          <label
            htmlFor={codeId}
            className="flex flex-col gap-1 text-xs text-grayscale-11"
          >
            Magic code
            <Input
              id={codeId}
              required
              autoComplete="one-time-code"
              placeholder="Code"
              value={code}
              disabled={isSubmitting}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        ) : null}

        {error ? <p className="text-xs text-grayscale-11">{error}</p> : null}

        <div className="flex items-center justify-between gap-3">
          {isCodeSent ? (
            <button
              type="button"
              className="text-xs text-grayscale-10"
              disabled={isSubmitting}
              onClick={() => {
                setIsCodeSent(false);
                setCode("");
                setError(undefined);
              }}
            >
              Use a different email
            </button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting
              ? "Submitting..."
              : isCodeSent
                ? "Verify code"
                : "Send code"}
          </Button>
        </div>
      </form>
    </main>
  );
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isRecord(error)) {
    const body = error.body;

    if (isRecord(body) && typeof body.message === "string") {
      return body.message;
    }

    if (typeof error.message === "string") {
      return error.message;
    }
  }

  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

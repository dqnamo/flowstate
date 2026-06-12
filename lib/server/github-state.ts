import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/server/env";

type GithubState = {
  projectId: string;
  ownerId: string;
  nonce: string;
};

export function signGithubState(state: GithubState): string {
  const payload = toBase64Url(JSON.stringify(state));
  const signature = createSignature(payload);
  return `${payload}.${signature}`;
}

export function verifyGithubState(value: string): GithubState {
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    throw new Error("Invalid GitHub state");
  }

  const expected = createSignature(payload);
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);

  if (
    expectedBytes.length !== signatureBytes.length ||
    !timingSafeEqual(expectedBytes, signatureBytes)
  ) {
    throw new Error("Invalid GitHub state signature");
  }

  return JSON.parse(fromBase64Url(payload)) as GithubState;
}

const createSignature = (payload: string) =>
  toBase64Url(
    createHmac("sha256", requireEnv("APP_STATE_SECRET"))
      .update(payload)
      .digest(),
  );

const toBase64Url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url").replaceAll("=", "");

const fromBase64Url = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

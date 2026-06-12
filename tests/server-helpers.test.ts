import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexJsonEventLine } from "@/lib/server/codex-events";
import {
  CODEX_RUN_OUTPUT_SCHEMA,
  parseCodexDeviceAuthOutput,
  parseCodexRunOutput,
} from "@/lib/server/codex-parsing";
import { decryptSecret, encryptSecret } from "@/lib/server/encryption";

test("github state round trips and rejects tampering", async () => {
  process.env.APP_STATE_SECRET = "test-secret";
  const { signGithubState, verifyGithubState } = await import(
    "@/lib/server/github-state"
  );
  const state = {
    projectId: "project-id",
    ownerId: "owner-id",
    nonce: "nonce",
  };
  const signed = signGithubState(state);

  assert.deepEqual(verifyGithubState(signed), state);
  assert.throws(() => verifyGithubState(`${signed}x`));
});

test("parses codex device auth output", () => {
  assert.deepEqual(
    parseCodexDeviceAuthOutput(
      "Open https://auth.openai.com/codex/device and enter ABCD-1234",
    ),
    {
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234",
    },
  );
});

test("parses colored codex device auth output with 4-5 code", () => {
  assert.deepEqual(
    parseCodexDeviceAuthOutput(
      "\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m code \u001b[94mIQOI-J9VE9\u001b[0m",
    ),
    {
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "IQOI-J9VE9",
    },
  );
});

test("parses codex run output", () => {
  const output = parseCodexRunOutput(
    JSON.stringify({
      responseText: "Done",
      branchName: "flowstate/run-test",
      pullRequestUrl: "https://github.com/acme/app/pull/1",
      pullRequestNumber: 1,
      preview: {
        command: "pnpm dev",
        port: 3000,
      },
      codeChanges: [
        {
          title: "Home page",
          summary: "Updated copy",
          files: ["app/page.tsx"],
          previewPath: "/",
        },
      ],
    }),
  );

  assert.equal(output.responseText, "Done");
  assert.equal(output.branchName, "flowstate/run-test");
  assert.equal(output.pullRequestNumber, 1);
  assert.equal(output.preview.command, "pnpm dev");
  assert.equal(output.codeChanges[0]?.files[0], "app/page.tsx");
});

test("codex run output schema marks nullable fields as required", () => {
  assert.deepEqual(CODEX_RUN_OUTPUT_SCHEMA.required, [
    "responseText",
    "branchName",
    "pullRequestUrl",
    "pullRequestNumber",
    "preview",
    "codeChanges",
  ]);
  assert.deepEqual(CODEX_RUN_OUTPUT_SCHEMA.properties.branchName.type, [
    "string",
    "null",
  ]);
  assert.deepEqual(CODEX_RUN_OUTPUT_SCHEMA.properties.pullRequestUrl.type, [
    "string",
    "null",
  ]);
  assert.deepEqual(CODEX_RUN_OUTPUT_SCHEMA.properties.pullRequestNumber.type, [
    "number",
    "null",
  ]);
});

test("parses codex run output with null optional fields", () => {
  const output = parseCodexRunOutput(
    JSON.stringify({
      responseText: "Done",
      branchName: null,
      pullRequestUrl: null,
      pullRequestNumber: null,
      preview: {
        command: "pnpm dev",
        port: 3000,
      },
      codeChanges: [],
    }),
  );

  assert.equal(output.branchName, undefined);
  assert.equal(output.pullRequestUrl, undefined);
  assert.equal(output.pullRequestNumber, undefined);
});

test("parses codex json event lines", () => {
  const event = parseCodexJsonEventLine(
    JSON.stringify({ type: "agent_message", message: "Working" }),
  );

  assert.equal(event.type, "agent_message");
  assert.equal((event.payload as { message?: string }).message, "Working");
});

test("encrypts and decrypts secrets", async () => {
  const encrypted = await encryptSecret("secret-value", "test-key");

  assert.notEqual(encrypted, "secret-value");
  assert.equal(await decryptSecret(encrypted, "test-key"), "secret-value");
});

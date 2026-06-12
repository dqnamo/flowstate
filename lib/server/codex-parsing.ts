export type CodexDeviceAuth = {
  verificationUrl?: string;
  userCode?: string;
};

export type CodexRunOutput = {
  responseText: string;
  branchName?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  preview: {
    command: string;
    port: number;
  };
  codeChanges: {
    title: string;
    summary: string;
    files: string[];
    previewPath: string;
  }[];
};

const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g",
);

export const CODEX_RUN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "responseText",
    "branchName",
    "pullRequestUrl",
    "pullRequestNumber",
    "preview",
    "codeChanges",
  ],
  properties: {
    responseText: { type: "string" },
    branchName: { type: ["string", "null"] },
    pullRequestUrl: { type: ["string", "null"] },
    pullRequestNumber: { type: ["number", "null"] },
    preview: {
      type: "object",
      additionalProperties: false,
      required: ["command", "port"],
      properties: {
        command: { type: "string" },
        port: { type: "number" },
      },
    },
    codeChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "files", "previewPath"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          files: {
            type: "array",
            items: { type: "string" },
          },
          previewPath: { type: "string" },
        },
      },
    },
  },
};

export function parseCodexDeviceAuthOutput(output: string): CodexDeviceAuth {
  const cleanOutput = output.replace(ANSI_ESCAPE_PATTERN, "");
  const verificationUrl = cleanOutput.match(
    /https:\/\/auth\.openai\.com\/codex\/device/i,
  )?.[0];
  const userCode =
    cleanOutput.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0] ??
    cleanOutput.match(/\b[A-Z0-9]{8,10}\b/)?.[0];

  return { verificationUrl, userCode };
}

export function parseCodexRunOutput(raw: string): CodexRunOutput {
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Codex output must be an object");
  }

  const responseText = stringValue(parsed.responseText, "responseText");
  const branchName = optionalStringValue(parsed.branchName, "branchName");
  const pullRequestUrl = optionalStringValue(
    parsed.pullRequestUrl,
    "pullRequestUrl",
  );
  const pullRequestNumber = optionalNumberValue(
    parsed.pullRequestNumber,
    "pullRequestNumber",
  );
  const preview = recordValue(parsed.preview, "preview");
  const command = stringValue(preview.command, "preview.command");
  const port = numberValue(preview.port, "preview.port");
  const codeChangesRaw = arrayValue(parsed.codeChanges, "codeChanges");
  const codeChanges = codeChangesRaw.map((change, index) => {
    const item = recordValue(change, `codeChanges.${index}`);
    return {
      title: stringValue(item.title, `codeChanges.${index}.title`),
      summary: stringValue(item.summary, `codeChanges.${index}.summary`),
      files: arrayValue(item.files, `codeChanges.${index}.files`).map(
        (file, fileIndex) =>
          stringValue(file, `codeChanges.${index}.files.${fileIndex}`),
      ),
      previewPath: stringValue(
        item.previewPath,
        `codeChanges.${index}.previewPath`,
      ),
    };
  });

  return {
    responseText,
    branchName,
    pullRequestUrl,
    pullRequestNumber,
    preview: { command, port },
    codeChanges,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordValue = (value: unknown, field: string) => {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value;
};

const arrayValue = (value: unknown, field: string) => {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  return value;
};

const stringValue = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  return value;
};

const optionalStringValue = (value: unknown, field: string) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return stringValue(value, field);
};

const numberValue = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }

  return value;
};

const optionalNumberValue = (value: unknown, field: string) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return numberValue(value, field);
};

export type CodexJsonEvent = {
  type: string;
  raw: string;
  payload?: unknown;
};

export function parseCodexJsonEventLine(line: string): CodexJsonEvent {
  const raw = line.trim();

  if (!raw) {
    throw new Error("Codex event line is empty");
  }

  const payload = JSON.parse(raw) as unknown;
  const type =
    isRecord(payload) && typeof payload.type === "string"
      ? payload.type
      : "event";

  return { type, raw, payload };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

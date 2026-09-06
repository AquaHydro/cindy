import { redactSensitiveText } from "@cindy/maker-shared/error-redaction";

export type CodexForkStage =
  | "source-prepare"
  | "host-create"
  | "host-start"
  | "thread-fork"
  | "thread-rollback"
  | "child-cleanup"
  | "host-retire"
  | "child-sanitize";

/** Carries the original failure without confusing an uncertain fork with safe startup retry. */
export class CodexForkError extends Error {
  cleanupFailed = false;
  constructor(
    readonly stage: CodexForkStage,
    cause: unknown,
  ) {
    super(
      `Codex fork ${stage} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "CodexForkError";
  }

  get retryable(): boolean {
    return (
      !this.cleanupFailed &&
      (this.stage === "host-create" || this.stage === "host-start") &&
      this.transportCode !== null
    );
  }

  get transportCode(): string | null {
    const signals: string[] = [];
    const seen = new Set<unknown>();
    let error: unknown = this.cause;
    for (let depth = 0; error && depth < 5 && !seen.has(error); depth += 1) {
      seen.add(error);
      if (typeof error !== "object") {
        signals.push(String(error));
        break;
      }
      if ("message" in error)
        signals.push(redactSensitiveText(String(error.message)));
      if ("name" in error) signals.push(String(error.name));
      if ("code" in error) signals.push(String(error.code));
      if ("status" in error) signals.push(`HTTP ${String(error.status)}`);
      if ("statusCode" in error)
        signals.push(`HTTP ${String(error.statusCode)}`);
      error = "cause" in error ? error.cause : undefined;
    }
    const text = signals.join("\n");
    if (
      /\b(?:HTTP(?:\/\d(?:\.\d)?)?|status(?: code)?)\s*[:=]?\s*40[13]\b/i.test(
        text,
      ) ||
      /\b(?:unauthorized|forbidden|authentication|abort(?:ed|error|_err)?|cancel(?:led|ed)?)\b/i.test(
        text,
      )
    )
      return null;
    return (
      /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT)\b/i
        .exec(text)?.[0]
        .toUpperCase() ??
      (/\b(?:timeout|timed out)\b/i.test(text) ? "TIMEOUT" : null) ??
      (/\b(?:HTTP|status(?: code)?)\s*[:=]?\s*50[234]\b|\b502 Bad Gateway\b/i.test(
        text,
      )
        ? "UPSTREAM_UNAVAILABLE"
        : null)
    );
  }
}

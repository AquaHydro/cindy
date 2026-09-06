import { describe, expect, it } from "vitest";
import { CodexForkError } from "./fork-error.js";

describe("CodexForkError retry boundary", () => {
  it.each([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "HTTP 502",
    "status=503",
    "HTTP 504",
    "request timed out",
  ])("recognizes an explicit startup failure: %s", (message) => {
    expect(new CodexForkError("host-start", new Error(message)).retryable).toBe(
      true,
    );
  });
  it.each([
    "401 network timeout",
    "403 EPIPE",
    "AbortError timeout",
    "cancelled ECONNRESET",
    "thread 50242 not found",
    "unsupported transport",
    "network policy denied",
    "Authorization: Bearer ENOTFOUND",
  ])("does not infer transient failure from %s", (message) => {
    expect(new CodexForkError("host-start", new Error(message)).retryable).toBe(
      false,
    );
  });
  it("recognizes nested structured causes and terminates cyclic chains", () => {
    const cause = Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    expect(new CodexForkError("host-create", cause).retryable).toBe(true);
    const cyclic = { cause: {} };
    cyclic.cause = cyclic;
    expect(new CodexForkError("host-start", cyclic).retryable).toBe(false);
    const cancelled = Object.assign(new Error("request timeout"), {
      name: "AbortError",
    });
    expect(new CodexForkError("host-start", cancelled).retryable).toBe(false);
  });
});

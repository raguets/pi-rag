import { describe, expect, it } from "vitest";
import { diagnosticReason } from "../../src/core/errors.js";

describe("diagnosticReason", () => {
  it("includes nested network causes and redacts bearer tokens", () => {
    const cause = new Error("connect ECONNREFUSED 127.0.0.1:11434");
    const error = new Error("fetch failed", { cause });
    expect(diagnosticReason(error)).toBe("fetch failed; connect ECONNREFUSED 127.0.0.1:11434");
    expect(diagnosticReason(new Error("Bearer super-secret"))).toBe("Bearer [redacted]");
  });
});

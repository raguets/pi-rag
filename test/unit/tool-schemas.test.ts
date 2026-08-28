import { describe, expect, it } from "vitest";
import { RagSearchParameters } from "../../src/tools/schemas.js";

describe("RagSearchParameters", () => {
  it("does not emit JSON Schema references unsupported by strict providers", () => {
    const schema = JSON.stringify(RagSearchParameters);
    expect(schema).not.toContain('"$ref"');
    expect(schema).not.toContain('"$id":"T0"');
  });
});

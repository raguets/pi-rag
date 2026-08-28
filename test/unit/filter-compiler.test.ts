import { describe, expect, it } from "vitest";
import { compileQdrantFilter } from "../../src/stores/qdrant/filter-compiler.js";
import { RagError } from "../../src/core/errors.js";
describe("compileQdrantFilter", () => {
  it("compiles nested expressions", () => expect(compileQdrantFilter({ and: [{ field: "year", op: "gte", value: 2022 }, { not: { field: "customer", op: "eq", value: "X" } }] }, ["year", "customer"])).toEqual({ must: [{ key: "year", range: { gte: 2022 } }, { must_not: [{ key: "customer", match: { value: "X" } }] }] }));
  it("rejects fields outside the allow-list", () => expect(() => compileQdrantFilter({ field: "secret", op: "eq", value: 1 }, [])).toThrow(RagError));
});

import { describe, expect, it } from "vitest";
import { compileChromaFilter } from "../../src/stores/chroma/filter-compiler.js";
import { compilePgvectorFilter } from "../../src/stores/pgvector/filter-compiler.js";

describe("backend filter compilers", () => {
  const expression = { and: [{ field: "year", op: "gte" as const, value: 2024 }, { field: "kind", op: "in" as const, value: ["a", "b"] }] };
  it("compiles Chroma where syntax", () => expect(compileChromaFilter(expression, ["year", "kind"])).toEqual({
    $and: [{ year: { $gte: 2024 } }, { kind: { $in: ["a", "b"] } }]
  }));
  it("parameterizes pgvector values", () => expect(compilePgvectorFilter(expression, ["year", "kind"], 2)).toEqual({
    sql: '("year" >= $2 AND "kind" IN ($3, $4))', values: [2024, "a", "b"]
  }));
  it("never interpolates a filter value into SQL", () => {
    const compiled = compilePgvectorFilter({ field: "kind", op: "eq", value: "' OR true --" }, ["kind"]);
    expect(compiled.sql).toBe('"kind" = $1'); expect(compiled.values).toEqual(["' OR true --"]);
  });
  it("rewrites Chroma negation using supported inverse operators", () => {
    expect(compileChromaFilter({ not: { field: "year", op: "gte", value: 2024 } }, ["year"])).toEqual({ year: { $lt: 2024 } });
  });
});

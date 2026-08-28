import { RagError } from "../../core/errors.js";
import type { FilterExpression } from "../../core/types.js";
type QdrantCondition = Record<string, unknown>;
export interface QdrantFilter { must?: QdrantCondition[]; should?: QdrantCondition[]; must_not?: QdrantCondition[] }

export function compileQdrantFilter(expression: FilterExpression | undefined, allowed: string[]): QdrantFilter | undefined {
  if (!expression) return undefined;
  const compile = (node: FilterExpression): QdrantCondition => {
    if ("field" in node) {
      if (!allowed.includes(node.field)) throw new RagError("RAG_FILTER_NOT_ALLOWED", `filtre interdit: ${node.field}`);
      const key = node.field;
      switch (node.op) {
        case "eq": return { key, match: { value: node.value } };
        case "ne": return { must_not: [{ key, match: { value: node.value } }] };
        case "in": if (!Array.isArray(node.value)) throw new RagError("RAG_FILTER_NOT_ALLOWED", `in exige un tableau (${key})`); return { key, match: { any: node.value } };
        case "gt": case "gte": case "lt": case "lte": return { key, range: { [node.op]: node.value } };
      }
    }
    if ("and" in node) return { must: node.and.map(compile) };
    if ("or" in node) return { should: node.or.map(compile) };
    return { must_not: [compile(node.not)] };
  };
  const result = compile(expression);
  if ("and" in expression) return { must: result.must as QdrantCondition[] };
  if ("or" in expression) return { should: result.should as QdrantCondition[] };
  if ("not" in expression) return { must_not: result.must_not as QdrantCondition[] };
  if (expression.op === "ne") return { must_not: (result.must_not as QdrantCondition[]) };
  return { must: [result] };
}

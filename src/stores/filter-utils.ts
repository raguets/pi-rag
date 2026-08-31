import { RagError } from "../core/errors.js";
import type { FilterExpression } from "../core/types.js";

export function assertFilterField(field: string, allowed: string[]): void {
  if (!allowed.includes(field)) throw new RagError("RAG_FILTER_NOT_ALLOWED", `filtre interdit: ${field}`);
}

export function assertInValue(field: string, value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new RagError("RAG_FILTER_NOT_ALLOWED", `in exige un tableau non vide (${field})`);
}

export function visitFilter(expression: FilterExpression | undefined, visit: (field: string) => void): void {
  if (!expression) return;
  if ("field" in expression) return visit(expression.field);
  if ("not" in expression) return visitFilter(expression.not, visit);
  for (const child of "and" in expression ? expression.and : expression.or) visitFilter(child, visit);
}

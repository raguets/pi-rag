import type { FilterExpression } from "../../core/types.js";
import { assertFilterField, assertInValue } from "../filter-utils.js";

export interface SqlFilter { sql: string; values: unknown[] }
export function quoteIdentifier(value: string): string { return `"${value.replace(/"/g, '""')}"`; }

export function compilePgvectorFilter(expression: FilterExpression | undefined, allowed: string[], startIndex = 1): SqlFilter {
  const values: unknown[] = [];
  const compile = (node: FilterExpression): string => {
    if ("field" in node) {
      assertFilterField(node.field, allowed); const field = quoteIdentifier(node.field);
      if (node.op === "in") {
        assertInValue(node.field, node.value);
        const params = node.value.map(value => { values.push(value); return `$${startIndex + values.length - 1}`; });
        return `${field} IN (${params.join(", ")})`;
      }
      values.push(node.value); const param = `$${startIndex + values.length - 1}`;
      const op = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[node.op];
      return `${field} ${op} ${param}`;
    }
    if ("not" in node) return `NOT (${compile(node.not)})`;
    const children = "and" in node ? node.and : node.or;
    return `(${children.map(compile).join("and" in node ? " AND " : " OR ")})`;
  };
  return expression ? { sql: compile(expression), values } : { sql: "", values };
}

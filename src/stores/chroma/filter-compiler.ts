import type { FilterExpression } from "../../core/types.js";
import { assertFilterField, assertInValue } from "../filter-utils.js";

export function compileChromaFilter(expression: FilterExpression | undefined, allowed: string[]): Record<string, unknown> | undefined {
  if (!expression) return undefined;
  const compile = (node: FilterExpression, negate = false): Record<string, unknown> => {
    if ("field" in node) {
      assertFilterField(node.field, allowed);
      if (node.op === "in") assertInValue(node.field, node.value);
      const operators = negate
        ? { eq: "$ne", ne: "$eq", in: "$nin", gt: "$lte", gte: "$lt", lt: "$gte", lte: "$gt" }
        : { eq: "$eq", ne: "$ne", in: "$in", gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte" };
      const operator = operators[node.op];
      return { [node.field]: { [operator]: node.value } };
    }
    if ("not" in node) return compile(node.not, !negate);
    const children = "and" in node ? node.and : node.or;
    const conjunction = "and" in node;
    return { [conjunction !== negate ? "$and" : "$or"]: children.map(child => compile(child, negate)) };
  };
  return compile(expression);
}

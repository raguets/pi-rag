import { Type } from "typebox";
import type { FilterExpression } from "../core/types.js";

// Keep the tool schema free of $ref: some OpenAI-compatible providers reject
// TypeBox's recursive T0 references while converting function schemas.
const Scalar = Type.Union([Type.String(), Type.Number(), Type.Boolean()]);
const Value = Type.Union([Scalar, Type.Array(Scalar)]);
const Leaf = Type.Object({
  field: Type.String(),
  op: Type.Union(["eq", "ne", "in", "gt", "gte", "lt", "lte"].map((op) => Type.Literal(op))),
  value: Value,
});
const FirstLevel = Type.Union([
  Leaf,
  Type.Object({ and: Type.Array(Leaf) }),
  Type.Object({ or: Type.Array(Leaf) }),
  Type.Object({ not: Leaf }),
]);
const Filter = Type.Unsafe<FilterExpression>(Type.Union([
  FirstLevel,
  Type.Object({ and: Type.Array(FirstLevel) }),
  Type.Object({ or: Type.Array(FirstLevel) }),
  Type.Object({ not: FirstLevel }),
]));
export const RagSearchParameters = Type.Object({ query: Type.String({ minLength: 1 }), knowledge_base: Type.Optional(Type.String()), top_k: Type.Optional(Type.Integer({ minimum: 1 })), filters: Type.Optional(Filter) });
export const KnowledgeBaseParameters = Type.Object({ knowledge_base: Type.Optional(Type.String()) });

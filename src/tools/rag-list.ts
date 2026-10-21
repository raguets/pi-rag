import type { RagService } from "../core/rag-service.js";
import { Type } from "typebox";
export function ragListTool(getService: (cwd: string) => Promise<RagService>) { return {
  name: "rag_list", label: "RAG Knowledge Bases", description: "Liste les bases de connaissances accessibles sans exposer leur configuration interne.", parameters: Type.Object({}),
  async execute(_id: string, _params: unknown, _signal: AbortSignal | undefined, _update: unknown, ctx: { cwd: string }) { const value = { knowledge_bases: (await getService(ctx.cwd)).list() }; return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value }; }
}; }

import type { RagService } from "../core/rag-service.js";
import { KnowledgeBaseParameters } from "./schemas.js";
export function ragStatusTool(getService: (cwd: string) => Promise<RagService>) { return {
  name: "rag_status", label: "RAG Status", description: "Diagnostique une base de connaissances sans afficher de secret.", parameters: KnowledgeBaseParameters,
  async execute(_id: string, params: { knowledge_base?: string }, signal: AbortSignal | undefined, _update: unknown, ctx: { cwd: string }) { const s = await (await getService(ctx.cwd)).status(params.knowledge_base, signal); const text = [`${s.knowledgeBase}`, `  vector store: ${s.vectorStore.ok ? "OK" : "ERROR"}`, `  collection: ${s.collection.ok ? "OK" : "ERROR"}`, `  embedding provider: ${s.embeddingProvider.ok ? "OK" : "ERROR"}`, `  query dimensions: ${s.queryDimensions ?? "unknown"}`, `  index dimensions: ${s.indexDimensions ?? "unknown"}`, `  distance: ${s.distance ?? "unknown"}`].join("\n"); return { content: [{ type: "text" as const, text }], details: s }; }
}; }

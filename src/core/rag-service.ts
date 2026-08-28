import type { RagConfig } from "../config/schema.js";
import { RagError } from "./errors.js";
import type { EmbeddingProvider } from "../embeddings/embedding-provider.js";
import type { VectorStoreAdapter } from "../stores/vector-store-adapter.js";
import type { KnowledgeBaseConfig, RagSearchInput, RagSearchOutput, RetrievedChunk } from "./types.js";
import { formatResults } from "./result-formatter.js";

export class RagService {
  constructor(private readonly config: RagConfig, private readonly providers: Record<string, EmbeddingProvider>, private readonly stores: Record<string, VectorStoreAdapter>) {}
  list() { return Object.entries(this.config.knowledgeBases).map(([name, kb]) => ({ name, description: kb.description })); }
  resolve(name?: string): KnowledgeBaseConfig {
    const names = Object.keys(this.config.knowledgeBases);
    const selected = name ?? (names.length === 1 ? names[0] : undefined);
    if (!selected || !this.config.knowledgeBases[selected]) throw new RagError("RAG_UNKNOWN_KNOWLEDGE_BASE", `base inconnue; disponibles: ${names.join(", ")}`);
    return { ...this.config.knowledgeBases[selected], name: selected } as KnowledgeBaseConfig;
  }
  async search(input: RagSearchInput, signal?: AbortSignal): Promise<RagSearchOutput> {
    const started = Date.now(); const query = input.query.trim();
    if (!query) throw new RagError("RAG_CONFIG_ERROR", "la requête est vide");
    const kb = this.resolve(input.knowledge_base); const provider = this.providers[kb.embeddingProvider]; const store = this.stores[kb.vectorStore];
    const topK = Math.min(Math.max(1, input.top_k ?? kb.search.topK), kb.search.maxTopK);
    const embedding = await provider.embedQuery(query, signal); const index = await store.describe(kb, signal);
    if (embedding.dimensions !== index.dimensions) throw new RagError("RAG_VECTOR_DIMENSION_MISMATCH", `requête ${embedding.dimensions}, index ${index.dimensions}`);
    let hits = await store.search({ knowledgeBase: kb, vector: embedding.vector, topK, filters: input.filters }, signal);
    hits = applyBudget(hits.filter(h => kb.search.scoreThreshold === undefined || h.score >= kb.search.scoreThreshold).slice(0, topK), kb.search.maxCharsPerChunk, kb.search.maxTotalChars);
    return { query, knowledgeBase: kb.name, hits, latencyMs: Date.now() - started, embeddingModel: embedding.model, dimensions: embedding.dimensions, text: formatResults(kb.name, query, hits) };
  }
  async status(name?: string, signal?: AbortSignal) {
    const kb = this.resolve(name); const provider = this.providers[kb.embeddingProvider]; const store = this.stores[kb.vectorStore];
    const [embeddingHealth, storeHealth] = await Promise.all([provider.healthCheck(signal), store.healthCheck(kb, signal)]);
    let queryDimensions: number | undefined; let index;
    if (embeddingHealth.ok) queryDimensions = (await provider.embedQuery("status", signal)).dimensions;
    try { index = await store.describe(kb, signal); } catch { index = undefined; }
    return { knowledgeBase: kb.name, vectorStore: storeHealth, collection: storeHealth, embeddingProvider: embeddingHealth, queryDimensions, indexDimensions: index?.dimensions, distance: index?.distance };
  }
}
export function applyBudget(hits: RetrievedChunk[], maxChunk: number, maxTotal: number): RetrievedChunk[] {
  const result: RetrievedChunk[] = []; let remaining = maxTotal;
  for (const hit of hits) { if (remaining <= 0) break; const content = hit.content.slice(0, Math.min(maxChunk, remaining)); if (!content) break; result.push({ ...hit, content }); remaining -= content.length; }
  return result;
}

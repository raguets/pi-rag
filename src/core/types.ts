export type HealthStatus = { ok: boolean; message?: string };
export type Distance = "cosine" | "dot" | "euclid" | "manhattan";

export type FilterExpression =
  | { field: string; op: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte"; value: unknown }
  | { and: FilterExpression[] } | { or: FilterExpression[] } | { not: FilterExpression };

export interface EmbeddingResult { vector: number[]; model: string; dimensions: number }
export interface RetrievedChunk {
  id: string; knowledgeBase: string; score: number; content: string; title?: string;
  source?: string; page?: number; section?: string; chunkIndex?: number;
  metadata: Record<string, unknown>;
}
export interface SearchConfig {
  topK: number; maxTopK: number; scoreThreshold?: number;
  maxCharsPerChunk: number; maxTotalChars: number;
}
export interface PayloadConfig {
  content: string; title?: string; source?: string; page?: string; section?: string;
  metadata: string[];
}
export interface KnowledgeBaseConfig {
  name: string; description: string; vectorStore: string; embeddingProvider: string;
  collection: string; vectorName?: string; dimensions?: number; distance: Distance; payload: PayloadConfig;
  filterableFields: string[]; search: SearchConfig; ingestion?: Record<string, unknown>;
}
export interface VectorIndexInfo { dimensions: number; distance: Distance; vectorName?: string }
export interface VectorSearchRequest {
  knowledgeBase: KnowledgeBaseConfig; vector: number[]; topK: number; filters?: FilterExpression;
}
export interface RagSearchInput { query: string; knowledge_base?: string; top_k?: number; filters?: FilterExpression }
export interface RagSearchOutput {
  query: string; knowledgeBase: string; hits: RetrievedChunk[]; latencyMs: number;
  embeddingModel: string; dimensions: number; text: string;
}

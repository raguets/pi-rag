import { secretFromEnv } from "../../config/env.js";
import type { VectorStoreConfig } from "../../config/schema.js";
import { diagnosticReason, RagError } from "../../core/errors.js";
import type { Distance, HealthStatus, KnowledgeBaseConfig, RetrievedChunk, VectorIndexInfo, VectorSearchRequest } from "../../core/types.js";
import type { VectorStoreAdapter } from "../vector-store-adapter.js";
import { mapRecord } from "../payload-mapper.js";
import { compileChromaFilter } from "./filter-compiler.js";

type ChromaConfig = Extract<VectorStoreConfig, { type: "chroma" }>;
export class ChromaAdapter implements VectorStoreAdapter {
  readonly type = "chroma";
  constructor(private readonly config: ChromaConfig, private readonly fetcher: typeof fetch = fetch) {}
  private basePath(): string { return `/api/v2/tenants/${encodeURIComponent(this.config.tenant)}/databases/${encodeURIComponent(this.config.database)}`; }
  private async request(path: string, init: RequestInit = {}): Promise<any> {
    try {
      const token = this.config.apiKeyEnv ? secretFromEnv(this.config.apiKeyEnv) : undefined;
      const response = await this.fetcher(`${this.config.url.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { [this.config.apiKeyHeader]: token } : {}), ...init.headers } });
      if (response.status === 404) throw new RagError("RAG_COLLECTION_NOT_FOUND", "collection Chroma introuvable");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof RagError) throw error;
      if (init.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new RagError("RAG_SEARCH_ABORTED", "recherche annulée", { cause: error });
      throw new RagError("RAG_VECTOR_STORE_UNAVAILABLE", `Chroma indisponible (${diagnosticReason(error)})`, { cause: error });
    }
  }
  private collectionPath(kb: KnowledgeBaseConfig): string { return `${this.basePath()}/collections/${encodeURIComponent(kb.collection)}`; }
  private async collection(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<any> { return this.request(this.collectionPath(kb), { signal }); }
  async healthCheck(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<HealthStatus> { try { await this.collection(kb, signal); return { ok: true }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } }
  async describe(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<VectorIndexInfo> {
    const collection = await this.collection(kb, signal);
    if (!kb.dimensions) throw new RagError("RAG_CONFIG_ERROR", `knowledgeBases.${kb.name}.dimensions est requis avec Chroma`);
    const rawDistance = collection.metadata?.["hnsw:space"] ?? collection.configuration_json?.hnsw?.space ?? kb.distance;
    const distance = rawDistance === "l2" ? "euclid" : rawDistance === "ip" ? "dot" : rawDistance as Distance;
    return { dimensions: kb.dimensions, distance };
  }
  async search(request: VectorSearchRequest, signal?: AbortSignal): Promise<RetrievedChunk[]> {
    const kb = request.knowledgeBase; const collection = await this.collection(kb, signal);
    const response = await this.request(`${this.basePath()}/collections/${encodeURIComponent(String(collection.id))}/query`, {
      method: "POST", signal, body: JSON.stringify({ query_embeddings: [request.vector], n_results: request.topK,
        where: compileChromaFilter(request.filters, kb.filterableFields), include: ["documents", "metadatas", "distances"] })
    });
    const ids = response.ids?.[0] ?? []; const documents = response.documents?.[0] ?? [];
    const metadatas = response.metadatas?.[0] ?? []; const distances = response.distances?.[0] ?? [];
    return ids.map((id: string, index: number) => mapRecord(id, distanceToScore(Number(distances[index]), kb.distance), metadatas[index], kb, documents[index]));
  }
}

function distanceToScore(distance: number, metric: Distance): number {
  if (!Number.isFinite(distance)) return 0;
  return metric === "euclid" || metric === "manhattan" ? 1 / (1 + Math.max(0, distance)) : 1 - distance;
}

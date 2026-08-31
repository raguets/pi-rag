import { secretFromEnv } from "../../config/env.js";
import type { VectorStoreConfig } from "../../config/schema.js";
import { diagnosticReason, RagError } from "../../core/errors.js";
import type { Distance, HealthStatus, KnowledgeBaseConfig, RetrievedChunk, VectorIndexInfo, VectorSearchRequest } from "../../core/types.js";
import type { VectorStoreAdapter } from "../vector-store-adapter.js";
import { compileQdrantFilter } from "./filter-compiler.js";
import { mapPayload } from "./payload-mapper.js";

type QdrantConfig = Extract<VectorStoreConfig, { type: "qdrant" }>;
export class QdrantAdapter implements VectorStoreAdapter {
  readonly type = "qdrant";
  constructor(private readonly config: QdrantConfig, private readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, init: RequestInit = {}): Promise<any> {
    try {
      const response = await this.fetcher(`${this.config.url.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", ...(this.config.apiKeyEnv ? { "api-key": secretFromEnv(this.config.apiKeyEnv)! } : {}), ...init.headers } });
      if (response.status === 404) throw new RagError("RAG_COLLECTION_NOT_FOUND", "collection Qdrant introuvable");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof RagError) throw error;
      if (init.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new RagError("RAG_SEARCH_ABORTED", "recherche annulée", { cause: error });
      throw new RagError("RAG_VECTOR_STORE_UNAVAILABLE", `Qdrant indisponible (${diagnosticReason(error)})`, { cause: error });
    }
  }
  async healthCheck(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<HealthStatus> { try { await this.describe(kb, signal); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } }
  async describe(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<VectorIndexInfo> {
    const body = await this.request(`/collections/${encodeURIComponent(kb.collection)}`, { signal });
    const vectors = body.result?.config?.params?.vectors;
    const params = kb.vectorName ? vectors?.[kb.vectorName] : vectors;
    if (!params && kb.vectorName) throw new RagError("RAG_VECTOR_NAME_MISMATCH", `vecteur ${kb.vectorName} introuvable`);
    if (!params?.size) throw new RagError("RAG_VECTOR_NAME_MISMATCH", "configuration vectorielle illisible");
    return { dimensions: params.size, distance: String(params.distance).toLowerCase() as Distance, vectorName: kb.vectorName };
  }
  async search(request: VectorSearchRequest, signal?: AbortSignal): Promise<RetrievedChunk[]> {
    const kb = request.knowledgeBase;
    const body = { query: request.vector, ...(kb.vectorName ? { using: kb.vectorName } : {}), limit: request.topK,
      with_payload: true, score_threshold: kb.search.scoreThreshold, filter: compileQdrantFilter(request.filters, kb.filterableFields) };
    const response = await this.request(`/collections/${encodeURIComponent(kb.collection)}/points/query`, { method: "POST", signal, body: JSON.stringify(body) });
    const points = response.result?.points ?? response.result ?? [];
    return points.map((p: any) => mapPayload(p.id, p.score, p.payload, kb));
  }
}

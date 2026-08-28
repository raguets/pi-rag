import type { EmbeddingProviderConfig } from "../config/schema.js";
import { diagnosticReason, RagError } from "../core/errors.js";
import type { EmbeddingResult, HealthStatus } from "../core/types.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly type = "ollama";
  constructor(private readonly config: EmbeddingProviderConfig, private readonly fetcher: typeof fetch = fetch) {}
  async embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
    try {
      const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/api/embed`, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ model: this.config.model, input: this.config.queryTemplate.replaceAll("{{query}}", text) }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { embeddings?: number[][]; model?: string }; const vector = body.embeddings?.[0];
      if (!vector?.length) throw new Error("réponse d'embedding invalide");
      if (this.config.expectedDimensions && vector.length !== this.config.expectedDimensions) throw new RagError("RAG_VECTOR_DIMENSION_MISMATCH", `dimension provider ${vector.length}, attendue ${this.config.expectedDimensions}`);
      return { vector, model: body.model ?? this.config.model, dimensions: vector.length };
    } catch (error) {
      if (error instanceof RagError) throw error;
      if (signal?.aborted) throw new RagError("RAG_SEARCH_ABORTED", "recherche annulée", { cause: error });
      throw new RagError("RAG_EMBEDDING_ERROR", `échec du provider ${this.config.model} (${diagnosticReason(error)})`, { cause: error });
    }
  }
  async healthCheck(signal?: AbortSignal): Promise<HealthStatus> { try { await this.embedQuery("health check", signal); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } }
}

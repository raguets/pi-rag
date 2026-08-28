import type { EmbeddingProviderConfig } from "../config/schema.js";
import { secretFromEnv } from "../config/env.js";
import { diagnosticReason, RagError } from "../core/errors.js";
import type { EmbeddingResult, HealthStatus } from "../core/types.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly type = "openai-compatible";
  constructor(private readonly config: EmbeddingProviderConfig, private readonly fetcher: typeof fetch = fetch) {}
  async embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
    const input = this.config.queryTemplate.replaceAll("{{query}}", text);
    try {
      const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/embeddings`, { method: "POST", signal,
        headers: { "content-type": "application/json", ...(this.config.apiKeyEnv ? { authorization: `Bearer ${secretFromEnv(this.config.apiKeyEnv)}` } : {}) },
        body: JSON.stringify({ model: this.config.model, input }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { data?: Array<{ embedding?: number[] }>; model?: string };
      const vector = body.data?.[0]?.embedding;
      if (!vector?.length || vector.some(v => !Number.isFinite(v))) throw new Error("réponse d'embedding invalide");
      if (this.config.expectedDimensions && vector.length !== this.config.expectedDimensions) throw new RagError("RAG_VECTOR_DIMENSION_MISMATCH", `dimension provider ${vector.length}, attendue ${this.config.expectedDimensions}`);
      return { vector, model: body.model ?? this.config.model, dimensions: vector.length };
    } catch (error) {
      if (error instanceof RagError) throw error;
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new RagError("RAG_SEARCH_ABORTED", "recherche annulée", { cause: error });
      throw new RagError("RAG_EMBEDDING_ERROR", `échec du provider ${this.config.model} (${diagnosticReason(error)})`, { cause: error });
    }
  }
  async healthCheck(signal?: AbortSignal): Promise<HealthStatus> { try { await this.embedQuery("health check", signal); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } }
}

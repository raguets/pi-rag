import type { EmbeddingResult, HealthStatus } from "../core/types.js";
export interface EmbeddingProvider { readonly type: string; embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingResult>; healthCheck(signal?: AbortSignal): Promise<HealthStatus> }

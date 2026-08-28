import type { HealthStatus, RetrievedChunk, VectorIndexInfo, VectorSearchRequest, KnowledgeBaseConfig } from "../core/types.js";
export interface VectorStoreAdapter {
  readonly type: string;
  healthCheck(config: KnowledgeBaseConfig, signal?: AbortSignal): Promise<HealthStatus>;
  describe(config: KnowledgeBaseConfig, signal?: AbortSignal): Promise<VectorIndexInfo>;
  search(request: VectorSearchRequest, signal?: AbortSignal): Promise<RetrievedChunk[]>;
  close?(): Promise<void>;
}

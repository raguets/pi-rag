import type { KnowledgeBaseConfig, RetrievedChunk } from "../../core/types.js";
import { mapRecord } from "../payload-mapper.js";

export function mapPayload(id: string | number, score: number, payload: Record<string, unknown> | null | undefined, kb: KnowledgeBaseConfig): RetrievedChunk {
  return mapRecord(id, score, payload, kb);
}

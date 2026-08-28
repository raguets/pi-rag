import { RagError } from "../../core/errors.js";
import type { KnowledgeBaseConfig, RetrievedChunk } from "../../core/types.js";

export function mapPayload(id: string | number, score: number, payload: Record<string, unknown> | null | undefined, kb: KnowledgeBaseConfig): RetrievedChunk {
  const p = payload ?? {};
  const content = p[kb.payload.content];
  if (typeof content !== "string") throw new RagError("RAG_PAYLOAD_MAPPING_ERROR", `contenu absent pour le point ${id}`);
  const optionalString = (key?: string): string | undefined => key && typeof p[key] === "string" ? p[key] as string : undefined;
  const optionalNumber = (key?: string): number | undefined => key && typeof p[key] === "number" ? p[key] as number : undefined;
  return { id: String(id), knowledgeBase: kb.name, score, content,
    title: optionalString(kb.payload.title), source: optionalString(kb.payload.source), page: optionalNumber(kb.payload.page),
    section: optionalString(kb.payload.section), chunkIndex: typeof p.chunk_index === "number" ? p.chunk_index : undefined,
    metadata: Object.fromEntries(kb.payload.metadata.filter(k => p[k] !== undefined).map(k => [k, p[k]])) };
}

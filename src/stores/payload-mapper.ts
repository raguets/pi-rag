import { RagError } from "../core/errors.js";
import type { KnowledgeBaseConfig, RetrievedChunk } from "../core/types.js";

/** Map a backend-neutral record using the payload contract shared by every store. */
export function mapRecord(id: string | number, score: number, record: Record<string, unknown> | null | undefined, kb: KnowledgeBaseConfig, document?: unknown): RetrievedChunk {
  const values = record ?? {};
  const content = typeof document === "string" ? document : values[kb.payload.content];
  if (typeof content !== "string") throw new RagError("RAG_PAYLOAD_MAPPING_ERROR", `contenu absent pour le point ${id}`);
  const optionalString = (key?: string): string | undefined => key && typeof values[key] === "string" ? values[key] as string : undefined;
  const optionalNumber = (key?: string): number | undefined => key && typeof values[key] === "number" ? values[key] as number : undefined;
  return { id: String(id), knowledgeBase: kb.name, score, content,
    title: optionalString(kb.payload.title), source: optionalString(kb.payload.source), page: optionalNumber(kb.payload.page),
    section: optionalString(kb.payload.section), chunkIndex: typeof values.chunk_index === "number" ? values.chunk_index : undefined,
    metadata: Object.fromEntries(kb.payload.metadata.filter(key => values[key] !== undefined).map(key => [key, values[key]])) };
}

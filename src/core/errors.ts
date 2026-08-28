export type RagErrorCode =
  | "RAG_CONFIG_ERROR" | "RAG_UNKNOWN_KNOWLEDGE_BASE" | "RAG_EMBEDDING_UNAVAILABLE"
  | "RAG_EMBEDDING_ERROR" | "RAG_VECTOR_STORE_UNAVAILABLE" | "RAG_COLLECTION_NOT_FOUND"
  | "RAG_VECTOR_DIMENSION_MISMATCH" | "RAG_VECTOR_NAME_MISMATCH" | "RAG_FILTER_NOT_ALLOWED"
  | "RAG_PAYLOAD_MAPPING_ERROR" | "RAG_CONTEXT_BUDGET_EXCEEDED" | "RAG_SEARCH_ABORTED";

export class RagError extends Error {
  constructor(public readonly code: RagErrorCode, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options); this.name = "RagError";
  }
}
/** Return a bounded diagnostic chain without serializing request data or headers. */
export function diagnosticReason(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    if (current.message && !messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return messages.join("; ").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300) || "erreur inconnue";
}
export function safeMessage(error: unknown): string {
  if (error instanceof RagError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "RAG_SEARCH_ABORTED: recherche annulée";
  return "RAG_EMBEDDING_ERROR: une erreur interne est survenue";
}

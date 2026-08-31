import { Pool, type PoolConfig } from "pg";
import { secretFromEnv } from "../../config/env.js";
import type { VectorStoreConfig } from "../../config/schema.js";
import { diagnosticReason, RagError } from "../../core/errors.js";
import type { Distance, HealthStatus, KnowledgeBaseConfig, RetrievedChunk, VectorIndexInfo, VectorSearchRequest } from "../../core/types.js";
import type { VectorStoreAdapter } from "../vector-store-adapter.js";
import { mapRecord } from "../payload-mapper.js";
import { compilePgvectorFilter, quoteIdentifier } from "./filter-compiler.js";

type PgvectorConfig = Extract<VectorStoreConfig, { type: "pgvector" }>;
export class PgvectorAdapter implements VectorStoreAdapter {
  readonly type = "pgvector"; private pool?: Pool;
  constructor(private readonly config: PgvectorConfig, pool?: Pool) {
    this.pool = pool;
  }
  private getPool(): Pool {
    if (this.pool) return this.pool;
    const connectionString = this.config.connectionStringEnv ? secretFromEnv(this.config.connectionStringEnv) : undefined;
    const options: PoolConfig = connectionString ? { connectionString } : { host: this.config.host, port: this.config.port, database: this.config.database, user: this.config.user, password: secretFromEnv(this.config.passwordEnv) };
    return this.pool = new Pool({ ...options, ssl: this.config.ssl, max: this.config.maxConnections, idleTimeoutMillis: this.config.idleTimeoutSeconds * 1000 });
  }
  private async query(text: string, values: unknown[] = [], signal?: AbortSignal): Promise<any> {
    try { return await this.getPool().query({ text, values, signal } as any); }
    catch (error) {
      if ((error as any)?.code === "42P01") throw new RagError("RAG_COLLECTION_NOT_FOUND", "table pgvector introuvable", { cause: error });
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new RagError("RAG_SEARCH_ABORTED", "recherche annulée", { cause: error });
      throw new RagError("RAG_VECTOR_STORE_UNAVAILABLE", `PostgreSQL/pgvector indisponible (${diagnosticReason(error)})`, { cause: error });
    }
  }
  async healthCheck(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<HealthStatus> { try { await this.describe(kb, signal); return { ok: true }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } }
  async describe(kb: KnowledgeBaseConfig, signal?: AbortSignal): Promise<VectorIndexInfo> {
    const vectorColumn = kb.vectorName ?? "embedding";
    const result = await this.query(`SELECT a.atttypmod AS dimensions FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3 AND NOT a.attisdropped`, [this.config.schema, kb.collection, vectorColumn], signal);
    if (!result.rows[0]) throw new RagError("RAG_VECTOR_NAME_MISMATCH", `colonne vectorielle ${vectorColumn} introuvable`);
    const dimensions = Number(result.rows[0].dimensions);
    if (dimensions <= 0 && !kb.dimensions) throw new RagError("RAG_CONFIG_ERROR", `dimensions requis pour une colonne vector sans dimension fixe`);
    return { dimensions: dimensions > 0 ? dimensions : kb.dimensions!, distance: kb.distance, vectorName: vectorColumn };
  }
  async search(request: VectorSearchRequest, signal?: AbortSignal): Promise<RetrievedChunk[]> {
    const kb = request.knowledgeBase; const vectorColumn = kb.vectorName ?? "embedding";
    const operator = ({ cosine: "<=>", dot: "<#>", euclid: "<->", manhattan: "<+>" } as const)[kb.distance];
    const filter = compilePgvectorFilter(request.filters, kb.filterableFields, 2);
    const table = `${quoteIdentifier(this.config.schema)}.${quoteIdentifier(kb.collection)}`;
    const distance = `${quoteIdentifier(vectorColumn)} ${operator} $1::vector`;
    const columns = [...new Set([this.config.idColumn, kb.payload.content, kb.payload.title, kb.payload.source, kb.payload.page, kb.payload.section, "chunk_index", ...kb.payload.metadata].filter((value): value is string => Boolean(value)))];
    const selection = columns.map(quoteIdentifier).join(", ");
    const result = await this.query(`SELECT ${selection}, ${distance} AS __rag_distance FROM ${table}${filter.sql ? ` WHERE ${filter.sql}` : ""} ORDER BY ${distance} LIMIT ${Number(request.topK)}`, [`[${request.vector.join(",")}]`, ...filter.values], signal);
    return result.rows.map((row: Record<string, unknown>) => mapRecord(String(row[this.config.idColumn]), distanceToScore(Number(row.__rag_distance), kb.distance), row, kb));
  }
  async close(): Promise<void> { await this.pool?.end(); }
}

function distanceToScore(distance: number, metric: Distance): number {
  if (!Number.isFinite(distance)) return 0;
  if (metric === "dot") return -distance;
  return metric === "cosine" ? 1 - distance : 1 / (1 + Math.max(0, distance));
}

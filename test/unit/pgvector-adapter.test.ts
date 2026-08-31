import { expect, it, vi } from "vitest";
import { PgvectorAdapter } from "../../src/stores/pgvector/pgvector-adapter.js";

it("builds a safe pgvector nearest-neighbour query and maps rows", async () => {
  const pool: any = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7, body: "hello", year: 2026, __rag_distance: 0.25 }] }), end: vi.fn() };
  const adapter = new PgvectorAdapter({ type: "pgvector", host: "localhost", port: 5432, database: "rag", user: "rag", ssl: false, schema: "docs", idColumn: "id", maxConnections: 10, idleTimeoutSeconds: 30 }, pool);
  const kb: any = { name: "kb", collection: "chunks", vectorName: "embedding", distance: "cosine", payload: { content: "body", metadata: ["year"] }, filterableFields: ["year"], search: {} };
  const hits = await adapter.search({ knowledgeBase: kb, vector: [0.1, 0.2], topK: 3, filters: { field: "year", op: "gte", value: 2025 } });
  const query = pool.query.mock.calls[0][0];
  expect(query.text).toContain('FROM "docs"."chunks" WHERE "year" >= $2');
  expect(query.text).toContain('"embedding" <=> $1::vector');
  expect(query.values).toEqual(["[0.1,0.2]", 2025]);
  expect(hits[0]).toMatchObject({ id: "7", content: "hello", score: 0.75 });
});

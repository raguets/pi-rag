import { describe, expect, it } from "vitest";
import { configSchema } from "../../src/config/schema.js";

const base = { version: 1 as const, embeddingProviders: { e: { type: "ollama", baseUrl: "http://localhost:11434", model: "m" } }, knowledgeBases: {
  kb: { vectorStore: "s", embeddingProvider: "e", collection: "chunks" }
} };

describe("vector store configuration", () => {
  it("keeps the existing Qdrant configuration valid", () => {
    const result = configSchema.parse({ ...base, vectorStores: { s: { type: "qdrant", url: "http://localhost:6333" } } });
    expect(result.knowledgeBases.kb).toMatchObject({ distance: "cosine", payload: { content: "content" } });
  });
  it("accepts pgvector through an environment connection string", () => {
    const result = configSchema.parse({ ...base, vectorStores: { s: { type: "pgvector", connectionStringEnv: "DATABASE_URL" } } });
    expect(result.vectorStores.s).toMatchObject({ type: "pgvector", schema: "public", idColumn: "id" });
  });
  it("accepts Chroma and applies v2 defaults", () => {
    const result = configSchema.parse({ ...base, vectorStores: { s: { type: "chroma", url: "http://localhost:8000" } } });
    expect(result.vectorStores.s).toMatchObject({ type: "chroma", tenant: "default_tenant", database: "default_database" });
  });
});

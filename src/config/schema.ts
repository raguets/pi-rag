import { z } from "zod";

const envName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const providerSchema = z.object({
  type: z.enum(["openai-compatible", "ollama"]), baseUrl: z.string().url(), model: z.string().min(1),
  apiKeyEnv: envName.optional(), expectedDimensions: z.number().int().positive().optional(),
  queryTemplate: z.string().default("{{query}}"), timeoutSeconds: z.number().positive().default(60), maxRetries: z.number().int().min(0).default(3)
});
export const storeSchema = z.object({ type: z.literal("qdrant"), url: z.string().url(), apiKeyEnv: envName.optional() });
export const kbSchema = z.object({
  description: z.string().default(""), vectorStore: z.string(), embeddingProvider: z.string(), collection: z.string().min(1), vectorName: z.string().optional(),
  payload: z.object({ content: z.string().default("content"), title: z.string().optional(), source: z.string().optional(), page: z.string().optional(), section: z.string().optional(), metadata: z.array(z.string()).default([]) }).default({ content: "content", metadata: [] }),
  filterableFields: z.array(z.string()).default([]),
  search: z.object({ topK: z.number().int().positive().default(8), maxTopK: z.number().int().positive().default(30), scoreThreshold: z.number().optional(), maxCharsPerChunk: z.number().int().positive().default(4000), maxTotalChars: z.number().int().positive().default(20000) }).default({ topK: 8, maxTopK: 30, maxCharsPerChunk: 4000, maxTotalChars: 20000 }),
  ingestion: z.record(z.string(), z.unknown()).optional()
});
export const configSchema = z.object({ version: z.literal(1), embeddingProviders: z.record(z.string(), providerSchema), vectorStores: z.record(z.string(), storeSchema), knowledgeBases: z.record(z.string(), kbSchema) });
export type RagConfig = z.infer<typeof configSchema>;
export type EmbeddingProviderConfig = z.infer<typeof providerSchema>;
export type VectorStoreConfig = z.infer<typeof storeSchema>;

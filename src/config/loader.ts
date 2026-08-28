import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { configSchema, type RagConfig } from "./schema.js";
import { RagError } from "../core/errors.js";

export async function loadConfig(cwd = process.cwd(), explicit?: string): Promise<RagConfig> {
  const candidates = explicit || process.env.PI_RAG_CONFIG
    ? [resolve(cwd, explicit ?? process.env.PI_RAG_CONFIG!)]
    : [resolve(cwd, ".pi/rag.json"), resolve(homedir(), ".pi/agent/rag.json")];
  for (const file of candidates) {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      const config = configSchema.parse(parsed);
      validateReferences(config); return config;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" && candidates.length > 1) continue;
      throw new RagError("RAG_CONFIG_ERROR", `configuration invalide (${file}): ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  throw new RagError("RAG_CONFIG_ERROR", `aucune configuration trouvée: ${candidates.join(", ")}`);
}
function validateReferences(config: RagConfig): void {
  for (const [name, kb] of Object.entries(config.knowledgeBases)) {
    if (!config.embeddingProviders[kb.embeddingProvider]) throw new Error(`knowledgeBases.${name}: embeddingProvider inconnu`);
    if (!config.vectorStores[kb.vectorStore]) throw new Error(`knowledgeBases.${name}: vectorStore inconnu`);
    if (kb.search.topK > kb.search.maxTopK) throw new Error(`knowledgeBases.${name}: topK dépasse maxTopK`);
  }
}

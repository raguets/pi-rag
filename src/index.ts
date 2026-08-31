import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config/loader.js";
import { OpenAICompatibleEmbeddingProvider } from "./embeddings/openai-compatible.js";
import { OllamaEmbeddingProvider } from "./embeddings/ollama.js";
import type { EmbeddingProvider } from "./embeddings/embedding-provider.js";
import { QdrantAdapter } from "./stores/qdrant/qdrant-adapter.js";
import { PgvectorAdapter } from "./stores/pgvector/pgvector-adapter.js";
import { ChromaAdapter } from "./stores/chroma/chroma-adapter.js";
import type { VectorStoreAdapter } from "./stores/vector-store-adapter.js";
import { RagService } from "./core/rag-service.js";
import { ragSearchTool } from "./tools/rag-search.js";
import { ragListTool } from "./tools/rag-list.js";
import { ragStatusTool } from "./tools/rag-status.js";

export function createService(config: Awaited<ReturnType<typeof loadConfig>>): RagService {
  const providers: Record<string, EmbeddingProvider> = {};
  for (const [name, cfg] of Object.entries(config.embeddingProviders)) {
    providers[name] = cfg.type === "openai-compatible" ? new OpenAICompatibleEmbeddingProvider(cfg) : new OllamaEmbeddingProvider(cfg);
  }
  const stores: Record<string, VectorStoreAdapter> = {};
  for (const [name, cfg] of Object.entries(config.vectorStores)) {
    switch (cfg.type) {
      case "qdrant": stores[name] = new QdrantAdapter(cfg); break;
      case "pgvector": stores[name] = new PgvectorAdapter(cfg); break;
      case "chroma": stores[name] = new ChromaAdapter(cfg); break;
    }
  }
  return new RagService(config, providers, stores);
}
export default function (pi: ExtensionAPI) {
  const cache = new Map<string, Promise<RagService>>();
  const getService = (cwd: string) => { let service = cache.get(cwd); if (!service) { service = loadConfig(cwd).then(createService); cache.set(cwd, service); } return service; };
  pi.registerTool(ragSearchTool(getService));
  pi.registerTool(ragListTool(getService));
  pi.registerTool(ragStatusTool(getService));
  pi.registerCommand("rag", {
    description: "Rechercher dans les bases de connaissances RAG",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) {
        try {
          const bases = (await getService(ctx.cwd)).list();
          const names = bases.map(base => `- ${base.name}${base.description ? ` : ${base.description}` : ""}`).join("\n");
          ctx.ui.notify(`Bases RAG disponibles :\n${names || "(aucune)"}\n\nUsage : /rag <question>`, "info");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("L’agent est occupé. Réessayez lorsque sa réponse est terminée.", "warning");
        return;
      }
      pi.sendUserMessage(`Utilise l’outil rag_search pour répondre à cette question à partir de la base de connaissances, en citant les sources : ${query}`);
    },
  });
}
export * from "./core/types.js";
export * from "./core/errors.js";
export * from "./core/rag-service.js";

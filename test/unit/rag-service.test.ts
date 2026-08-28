import { describe, expect, it, vi } from "vitest";
import { RagService, applyBudget } from "../../src/core/rag-service.js";
const config: any = { version: 1, embeddingProviders: { e: {} }, vectorStores: { s: {} }, knowledgeBases: { kb: { description: "docs", embeddingProvider: "e", vectorStore: "s", collection: "c", payload: { content: "content", metadata: [] }, filterableFields: [], search: { topK: 2, maxTopK: 3, scoreThreshold: .5, maxCharsPerChunk: 4, maxTotalChars: 6 } } } };
describe("RagService", () => {
  it("caps topK, threshold and text budget", async () => {
    const provider: any = { embedQuery: vi.fn().mockResolvedValue({ vector: [1, 2], dimensions: 2, model: "m" }) };
    const store: any = { describe: vi.fn().mockResolvedValue({ dimensions: 2, distance: "cosine" }), search: vi.fn().mockResolvedValue([{ id: "1", knowledgeBase: "kb", score: .9, content: "abcdef", metadata: {} }, { id: "2", knowledgeBase: "kb", score: .4, content: "zzz", metadata: {} }]) };
    const result = await new RagService(config, { e: provider }, { s: store }).search({ query: " q ", top_k: 99 });
    expect(store.search.mock.calls[0][0].topK).toBe(3); expect(result.hits).toHaveLength(1); expect(result.hits[0].content).toBe("abcd");
  });
  it("budgets across chunks", () => expect(applyBudget([{ id:"1",knowledgeBase:"k",score:1,content:"abcd",metadata:{} },{ id:"2",knowledgeBase:"k",score:1,content:"efgh",metadata:{} }], 3, 5).map(x => x.content)).toEqual(["abc", "ef"]));
});

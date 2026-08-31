import { expect, it, vi } from "vitest";
import { ChromaAdapter } from "../../src/stores/chroma/chroma-adapter.js";

it("queries Chroma v2 and maps native documents plus metadata", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "uuid", name: "chunks" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ids: [["1"]], documents: [["hello"]], metadatas: [[{ title: "Doc", year: 2026 }]], distances: [[0.2]] }), { status: 200 }));
  const adapter = new ChromaAdapter({ type: "chroma", url: "http://chroma", tenant: "default_tenant", database: "default_database", apiKeyHeader: "x-chroma-token" }, fetcher);
  const kb: any = { name: "kb", collection: "chunks", dimensions: 3, distance: "cosine", vectorName: undefined, payload: { content: "content", title: "title", metadata: ["year"] }, filterableFields: [], search: {} };
  const hits = await adapter.search({ knowledgeBase: kb, vector: [1, 2, 3], topK: 2 });
  expect(hits[0]).toMatchObject({ id: "1", content: "hello", title: "Doc", score: 0.8, metadata: { year: 2026 } });
  expect(fetcher.mock.calls[1][0]).toContain("/collections/uuid/query");
});

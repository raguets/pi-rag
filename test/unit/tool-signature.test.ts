import { describe, expect, it, vi } from "vitest";
import type { RagService } from "../../src/core/rag-service.js";
import { ragSearchTool } from "../../src/tools/rag-search.js";

describe("Pi 0.84 tool signature", () => {
  it("passes the third argument as the abort signal and the fifth as context", async () => {
    const search = vi.fn().mockResolvedValue({
      query: "test", knowledgeBase: "kb", hits: [], latencyMs: 1,
      embeddingModel: "model", dimensions: 3, text: "no results",
    });
    const getService = vi.fn().mockResolvedValue({ search } as unknown as RagService);
    const tool = ragSearchTool(getService);
    const controller = new AbortController();

    await tool.execute("call", { query: "test" }, controller.signal, undefined, { cwd: "C:/project" });

    expect(getService).toHaveBeenCalledWith("C:/project");
    expect(search).toHaveBeenCalledWith({ query: "test" }, controller.signal);
  });
});

import { expect, it } from "vitest";
import { mapPayload } from "../../src/stores/qdrant/payload-mapper.js";
const kb: any = { name: "kb", payload: { content: "body", title: "name", page: "page", metadata: ["year"] } };
it("maps configured provenance", () => expect(mapPayload("x", .8, { body: "hello", name: "Doc", page: 2, year: 2026 }, kb)).toMatchObject({ content: "hello", title: "Doc", page: 2, metadata: { year: 2026 } }));
it("requires content", () => expect(() => mapPayload("x", 1, {}, kb)).toThrow(/RAG_PAYLOAD_MAPPING_ERROR/));

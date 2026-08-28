import type { RetrievedChunk } from "./types.js";
export function formatResults(kb: string, query: string, hits: RetrievedChunk[]): string {
  const lines = [`Knowledge base: ${kb}`, `Query: ${query}`, `Results: ${hits.length}`, ""];
  hits.forEach((hit, index) => {
    lines.push(`[RAG-${index + 1}]`);
    if (hit.title) lines.push(`Title: ${hit.title}`);
    if (hit.source) lines.push(`Source: ${hit.source}`);
    if (hit.page !== undefined) lines.push(`Page: ${hit.page}`);
    if (hit.section) lines.push(`Section: ${hit.section}`);
    lines.push(`Score: ${hit.score.toFixed(4)}`, "", hit.content);
    const metadata = Object.entries(hit.metadata);
    if (metadata.length) lines.push("", "Metadata:", ...metadata.map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`));
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

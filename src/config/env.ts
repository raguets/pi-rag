import { RagError } from "../core/errors.js";
export function secretFromEnv(name?: string): string | undefined {
  if (!name) return undefined;
  const value = process.env[name];
  if (!value) throw new RagError("RAG_CONFIG_ERROR", `la variable d'environnement ${name} est absente`);
  return value;
}

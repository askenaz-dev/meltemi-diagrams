// CLI-only compatibility for the official provider's unused WorkerEntrypoint class check.
// This module does not import, emulate or expose any product Worker handler.
import { register } from "node:module";

export function registerFixtureNodeRuntime(): void {
  const stub =
    "export class WorkerEntrypoint { constructor() { throw new Error('Worker handlers cannot run in the OAuth fixture CLI'); } }";
  const loader = `export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {url: ${JSON.stringify("data:text/javascript," + encodeURIComponent(stub))}, shortCircuit: true};
    return nextResolve(specifier, context);
  }`;
  register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
}

// What the Node tests give for `cloudflare:workers`, which `@cloudflare/workers-oauth-provider`
// imports for one check: whether a handler is a class that extends `WorkerEntrypoint`. The
// service's handlers are objects with a `fetch`, so a class that nothing extends is enough.
//
// The runtime's compatibility flags are what `wrangler.jsonc` sets (`global_fetch_strictly_public`,
// which the library looks for before it fetches a client-id metadata document); this module is
// evaluated before the library, as the runtime's own module would be.

const runtime = globalThis as { Cloudflare?: { compatibilityFlags?: Record<string, boolean> } };
runtime.Cloudflare ??= { compatibilityFlags: { global_fetch_strictly_public: true } };

export class WorkerEntrypoint {}

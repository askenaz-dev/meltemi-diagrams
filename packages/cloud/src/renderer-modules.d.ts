// ELK's worker module as the renderer object imports it (`renderer-runtime.ts`): a CommonJS file
// without types, whose default export is the worker class of `elkjs`. Only the Workers program sees
// this file; the Node program leaves the runtime out.

declare module "elkjs/lib/elk-worker.min.js" {
  const worker: unknown;
  export default worker;
}

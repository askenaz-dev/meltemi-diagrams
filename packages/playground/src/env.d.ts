/** The playground's version, set by the build. */
declare const __PLAYGROUND_VERSION__: string;

/**
 * The origin of the identity service the page was built for (`PLAYGROUND_IDENTITY`, default
 * `https://id.meltemi.dev`), set by the build. The page signs in there.
 */
declare const PLAYGROUND_IDENTITY: string;

declare module "elkjs/lib/elk-worker.min.js" {
  /** The worker module's exports: `{ default: FakeWorker, Worker: FakeWorker }`. */
  const exports: unknown;
  export default exports;
}

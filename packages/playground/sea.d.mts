/** The most the chunks that carry the sea may weigh, gzipped: 25 KB. */
export const SEA_BUDGET: number;

/** The entry the editor starts from: `src/main.ts`. */
export const EDITOR_ENTRY: string;

/**
 * The agent setup pages' picture, `sea-diagrams.svg` (light) and `sea-diagrams-dark.svg`: the
 * `diagrams` sea at rest in the brand's colours. Throws, naming the file, when one is not an SVG.
 */
export function seaStills(): Record<string, string>;

/** Whether an input of the build is the sea's: `@meltemi/ocean`, `src/sea.ts` or `src/boot-sea.ts`. */
export function isSeaInput(input: string): boolean;

/** The parts of esbuild's metafile the weight is read from. */
export interface SeaMetafile {
  readonly outputs: Readonly<
    Record<
      string,
      {
        readonly entryPoint?: string;
        readonly inputs: Readonly<Record<string, unknown>>;
        readonly imports: readonly {
          readonly path: string;
          readonly kind: string;
          readonly external?: boolean;
        }[];
      }
    >
  >;
}

/**
 * The chunks that carry the sea and their weight gzipped. Throws, naming the chunk, when one is in
 * the bundle the editor starts with, or when together they weigh more than `budget`.
 */
export function seaWeight(
  metafile: SeaMetafile,
  workingDir: string,
  budget?: number,
): { readonly chunks: readonly { file: string; gzip: number }[]; readonly gzip: number };

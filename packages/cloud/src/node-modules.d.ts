// The Workers program (`tsconfig.json`) compiles the sources of the workspace packages the renderer
// object imports, without Node's types. Two of them reach Node's modules on paths the Worker never
// takes: `@meltemi/diagrams-capture` starts a browser (the editor imports its types only), and
// `@meltemi/diagrams-layout-elk` reads the installed ELK when no loader is given (the renderer gives
// one). Those modules are declared here as untyped, so that the program compiles; the Node program
// (`tsconfig.test.json`) leaves this file out and has the real ones.

declare module "node:child_process";
declare module "node:fs";
declare module "node:module";
declare module "node:url";

interface ImportMeta {
  readonly url: string;
}

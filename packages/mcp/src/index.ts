// `@meltemi/diagrams-mcp`: the Model Context Protocol tools of Meltemi Diagrams, defined once and
// served by the hosted endpoint (`https://diagrams.meltemi.dev/mcp`) and by the command line's local
// server (`mdg mcp`). The catalogue, the call wrapper, the stateless Streamable HTTP handler and the
// shapes are here; `./preview` holds the drawing engine and `./node` loads it under Node.

export * from "./catalogue/index.js";
export * from "./http.js";
export * from "./serve.js";
export * from "./shapes.js";

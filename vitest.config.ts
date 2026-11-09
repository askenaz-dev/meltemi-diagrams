import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

// One root configuration runs the tests of every workspace package.
// Workspace packages resolve to their TypeScript sources, so no build is needed to test.
export default defineConfig({
  resolve: {
    alias: {
      "@meltemi/diagrams-language": pkg("language"),
      "@meltemi/diagrams-model": pkg("model"),
      "@meltemi/diagrams-editor/canvas": fileURLToPath(
        new URL("./packages/editor/src/canvas/index.ts", import.meta.url),
      ),
      "@meltemi/diagrams-editor/node": fileURLToPath(
        new URL("./packages/editor/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-editor": pkg("editor"),
      "@meltemi/diagrams-edit/starters": fileURLToPath(
        new URL("./packages/edit/src/starter-catalog.ts", import.meta.url),
      ),
      "@meltemi/diagrams-edit": pkg("edit"),
      "@meltemi/diagrams-layout-elk": pkg("layout-elk"),
      "@meltemi/diagrams-layout/shapes": fileURLToPath(
        new URL("./packages/layout/src/shapes.ts", import.meta.url),
      ),
      "@meltemi/diagrams-layout/viewport": fileURLToPath(
        new URL("./packages/layout/src/viewport.ts", import.meta.url),
      ),
      "@meltemi/diagrams-layout": pkg("layout"),
      "@meltemi/diagrams-render": pkg("render"),
      "@meltemi/diagrams-cli": pkg("cli"),
      "@meltemi/diagrams-import": pkg("import"),
      "@meltemi/diagrams-assist": pkg("assist"),
      "@meltemi/diagrams-motion": pkg("motion"),
      "@meltemi/diagrams-mcp/preview": fileURLToPath(
        new URL("./packages/mcp/src/preview/index.ts", import.meta.url),
      ),
      "@meltemi/diagrams-mcp/node": fileURLToPath(
        new URL("./packages/mcp/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-mcp": pkg("mcp"),
      "@meltemi/diagrams-i18n": pkg("i18n"),
      "@meltemi/diagrams-capture/page": fileURLToPath(
        new URL("./packages/capture/src/page.mjs", import.meta.url),
      ),
      "@meltemi/diagrams-capture": pkg("capture"),
      "@meltemi/diagrams-catalog/node": fileURLToPath(
        new URL("./packages/catalog/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-catalog": pkg("catalog"),
      "@meltemi/diagrams-player/node": fileURLToPath(
        new URL("./packages/player/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-player": pkg("player"),
      "@meltemi/diagrams-project/node": fileURLToPath(
        new URL("./packages/project/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-project": pkg("project"),
      "@meltemi/diagrams-fonts/node": fileURLToPath(
        new URL("./packages/fonts/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-fonts": pkg("fonts"),
      "@meltemi/diagrams-assets/node": fileURLToPath(
        new URL("./packages/assets/src/node.ts", import.meta.url),
      ),
      "@meltemi/diagrams-assets": pkg("assets"),
      "@meltemi/diagrams-canvas": pkg("canvas"),
      // The Workers runtime's module, which the cloud's OAuth library imports: a stand-in in Node.
      "cloudflare:workers": fileURLToPath(
        new URL("./packages/cloud/test/support/cloudflare-workers.ts", import.meta.url),
      ),
    },
  },
  // The OAuth library is transformed like the sources, so that its import of `cloudflare:workers`
  // reaches the stand-in above instead of Node's loader.
  ssr: { noExternal: ["@cloudflare/workers-oauth-provider"] },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});

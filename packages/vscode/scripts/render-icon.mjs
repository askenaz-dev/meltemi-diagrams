// Renders the extension icon (a 256 px PNG) from the brand glyph. Usage: node scripts/render-icon.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserPath } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(
  join(here, "..", "..", "..", "brand", "meltemi-diagrams-glyph.svg"),
  "utf8",
);
const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg style="display:block" ')}</body></html>`,
  );
  await page
    .locator("svg")
    .screenshot({ path: join(here, "..", "media", "icon.png"), omitBackground: true });
  console.log("Wrote media/icon.png");
} finally {
  await browser.close();
}

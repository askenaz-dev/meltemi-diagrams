// PNG and PDF captures of SVG pictures with a headless Chromium browser. Plain JavaScript, so a
// plain `node` (the worker of `captureSync`) can run it.
import { findBrowser, NO_BROWSER } from "./browser.mjs";
import { PipeSession } from "./cdp.mjs";
import { capturePage, cssColor } from "./page.mjs";

export { capturePage };

/** Waits until the fonts and images of the page are ready and two frames have been drawn. */
const READY = `(async () => {
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll("image")].map((image) => {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href");
    if (!href) return null;
    const img = new Image();
    img.src = href;
    return img.decode().catch(() => null);
  }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
})()`;

async function captureOne(session, job) {
  const { targetId } = await session.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await session.send("Target.attachToTarget", { targetId, flatten: true });
  const transparent = cssColor(job.background) === "transparent";
  try {
    await session.send("Page.enable", {}, sessionId);
    await session.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: Math.ceil(job.width),
        height: Math.ceil(job.height),
        deviceScaleFactor: job.kind === "png" ? (job.scale ?? 1) : 1,
        mobile: false,
      },
      sessionId,
    );
    if (transparent) {
      await session.send(
        "Emulation.setDefaultBackgroundColorOverride",
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        sessionId,
      );
    }
    const { frameTree } = await session.send("Page.getFrameTree", {}, sessionId);
    await session.send(
      "Page.setDocumentContent",
      { frameId: frameTree.frame.id, html: capturePage(job) },
      sessionId,
    );
    await session.send(
      "Runtime.evaluate",
      { expression: READY, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (job.kind === "png") {
      const { data } = await session.send(
        "Page.captureScreenshot",
        {
          format: "png",
          clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 },
          fromSurface: true,
          captureBeyondViewport: false,
        },
        sessionId,
      );
      return Buffer.from(data, "base64");
    }
    const { data } = await session.send(
      "Page.printToPDF",
      {
        printBackground: !transparent,
        preferCSSPageSize: true,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        displayHeaderFooter: false,
        generateTaggedPDF: true,
      },
      sessionId,
    );
    return Buffer.from(data, "base64");
  } finally {
    await session.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
}

/**
 * Captures each job (`{ kind: "png" | "pdf", svg, width, height, scale?, background? }`) in one
 * browser session; resolves to the browser's name and version and the files' bytes.
 */
export async function capture(jobs, options = {}) {
  const executable = options.browser ?? findBrowser();
  if (!executable) throw new Error(NO_BROWSER);
  const session = await PipeSession.launch(executable, { timeout: options.timeout ?? 30_000 });
  try {
    const { product } = await session.started();
    const results = [];
    for (const job of jobs) results.push(await captureOne(session, job));
    return { browser: product, results };
  } finally {
    await session.close();
  }
}

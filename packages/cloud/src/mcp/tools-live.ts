// The Worker's answers to the live-session and publishing tools (`mcp-server`, "Live sessions and
// publishing through the tools"), over `operations/live.ts` and `operations/publish.ts`: the owner's,
// with the `live` or the `publish` scope. `publish` has the project's renderer object build the
// catalog the page and the command line publish (the same build), stores it, and reads the public
// address back once before it answers, so that the address it gives is one that served.

import { TOOLS } from "@meltemi/diagrams-mcp";
import { requireProjectAccess } from "../access.js";
import type { OpCtx } from "../context.js";
import { fail } from "../errors.js";
import { endLive, getLive, startLive } from "../operations/live.js";
import {
  accountPublications,
  getPublications,
  publish,
  readSlug,
  requireHandle,
  unpublish,
} from "../operations/publish.js";
import { drawingBinaries, renderersOf } from "./shapes.js";
import { implement, type AnyImplementation } from "./tool.js";

const getLiveTool = implement(TOOLS.get_live, async (session, { project }) => {
  return { structured: { live: await getLive(session.op, project) } };
});

const startLiveTool = implement(TOOLS.start_live, async (session, { project, guestsEdit }) => {
  return { structured: await startLive(session.op, project, { guestsEdit }) };
});

const endLiveTool = implement(TOOLS.end_live, async (session, { project }) => {
  await endLive(session.op, project);
  return { structured: { ended: true as const } };
});

const listPublicationsTool = implement(TOOLS.list_publications, async (session, { project }) => {
  if (project === undefined) return { structured: await accountPublications(session.op) };
  return { structured: await getPublications(session.op, project) };
});

/** The catalog's runtime script, the page's `assets/catalog.js`, from the assets of this deployment. */
async function catalogScript(op: OpCtx): Promise<string> {
  const response = await op.deps.assets.fetch(
    new Request(new URL("/assets/catalog.js", op.config.origin)),
  );
  if (!response.ok) {
    console.error(`cloud: assets/catalog.js answered ${response.status}`);
    throw fail("internal");
  }
  return response.text();
}

/** Whether the publish host serves the address now: one `HEAD`, a `200` and nothing else. */
async function servedAt(op: OpCtx, url: string): Promise<boolean> {
  const fetcher = op.deps.publicFetch;
  if (!fetcher) return false;
  try {
    const response = await fetcher(url, { method: "HEAD", redirect: "manual" });
    return response.status === 200;
  } catch {
    return false;
  }
}

const publishTool = implement(TOOLS.publish, async (session, { project, slug }) => {
  const { op } = session;
  // What would refuse the publication is asked before the catalog is built.
  await requireProjectAccess(op, project, "manage");
  await requireHandle(op);
  readSlug(slug);
  const renderers = renderersOf(op);
  const latest = await op.deps.rooms.read(project);
  const [binaries, script, version] = await Promise.all([
    drawingBinaries(op, latest),
    catalogScript(op),
    productVersion(op),
  ]);
  const built = await renderers.catalog(project, {
    files: latest.files,
    binaries,
    script,
    generator: `Meltemi Diagrams ${version}`,
  });
  if (!built.ok) {
    throw fail(
      built.code,
      built.message,
      built.diagnostics ? { diagnostics: built.diagnostics } : undefined,
    );
  }
  const published = await publish(op, project, { slug, html: built.html });
  if (!(await servedAt(op, published.url))) {
    throw fail(
      "publish.unverified",
      `The page was published, but ${published.url} did not answer yet; try the address again in a moment.`,
      { url: published.url },
    );
  }
  return {
    structured: {
      ...published,
      entries: built.entries,
      skipped: [...built.skipped],
      diagnostics: [...built.diagnostics],
    },
  };
});

const unpublishTool = implement(TOOLS.unpublish, async (session, { project, slug }) => {
  await unpublish(session.op, project, slug);
  return { structured: { unpublished: true as const, slug } };
});

let version: string | undefined;

/**
 * The product's version, as the page's build writes it in `templates.json`: what the catalog's
 * generator and the server's name give. Kept once read; a build that does not say is `unknown`, and
 * asked again next time.
 */
export async function productVersion(op: Pick<OpCtx, "deps" | "config">): Promise<string> {
  if (version !== undefined) return version;
  try {
    const response = await op.deps.assets.fetch(
      new Request(new URL("/templates.json", op.config.origin)),
    );
    if (!response.ok) return "unknown";
    const read = (JSON.parse(await response.text()) as { version?: unknown } | null)?.version;
    if (typeof read !== "string") return "unknown";
    version = read;
    return read;
  } catch {
    return "unknown";
  }
}

export const LIVE_TOOLS: readonly AnyImplementation[] = [getLiveTool, startLiveTool, endLiveTool];
export const PUBLISH_TOOLS: readonly AnyImplementation[] = [
  listPublicationsTool,
  publishTool,
  unpublishTool,
];

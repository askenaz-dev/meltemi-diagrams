// The live-session and publishing tools (`mcp-server`, "Live sessions and publishing through the
// tools"), over `operations/live.ts` and `operations/publish.ts`: the owner's, with the `live` or the
// `publish` scope. `publish` has the project's renderer object build the catalog the page and the
// command line publish (the same build), stores it, and reads the public address back once before it
// answers, so that the address it gives is one that served.

import * as z from "zod";
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
import { diagnosticSchema, drawingBinaries, projectArg } from "./shapes.js";
import { tool, type AnyTool } from "./tool.js";

const liveSchema = z.object({
  id: z.string(),
  link: z.string().describe("The session's link: whoever opens it joins, without an account."),
  guestsEdit: z.boolean(),
  startedAt: z.string(),
  until: z.string().describe("When the session ends by itself."),
  guests: z.number(),
});

const getLiveTool = tool({
  name: "get_live",
  title: "Get the live session",
  description:
    "The project's live session, with its link and its end, or null when none is on (the owner's).",
  scope: "live",
  input: z.object({ project: projectArg }),
  output: z.object({ live: liveSchema.nullable() }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project }) {
    return { structured: { live: await getLive(session.op, project) } };
  },
});

const startLiveTool = tool({
  name: "start_live",
  title: "Start a live session",
  description:
    "Starts the project's live session for 24 hours, or answers the one that is on (the owner's): anybody with its link joins without an account, editing when guestsEdit is true (the default) and looking otherwise. Changing guestsEdit reconnects the guests with the new role.",
  scope: "live",
  input: z.object({ project: projectArg, guestsEdit: z.boolean().optional() }),
  output: liveSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, guestsEdit }) {
    return { structured: await startLive(session.op, project, { guestsEdit }) };
  },
});

const endLiveTool = tool({
  name: "end_live",
  title: "End the live session",
  description:
    "Ends the project's live session (the owner's): every guest is disconnected and its link stops working.",
  scope: "live",
  input: z.object({ project: projectArg }),
  output: z.object({ ended: z.literal(true) }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project }) {
    await endLive(session.op, project);
    return { structured: { ended: true as const } };
  },
});

const publicationSchema = z.object({
  project: z.string().optional(),
  slug: z.string(),
  url: z.string().describe("The public address, served to anybody."),
  published_at: z.string(),
  bytes: z.number(),
});

const listPublicationsTool = tool({
  name: "list_publications",
  title: "List publications",
  description:
    "The account's published catalogs, each with its project and public address, and its handle; with project, that project's publications and the ones the service took down.",
  scope: "publish",
  input: z.object({ project: projectArg.optional() }),
  output: z.object({
    handle: z.string().nullable(),
    publications: z.array(publicationSchema),
    takedowns: z
      .array(z.object({ slug: z.string(), at: z.string(), reason: z.string() }))
      .optional(),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project }) {
    if (project === undefined) return { structured: await accountPublications(session.op) };
    return { structured: await getPublications(session.op, project) };
  },
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

const publishTool = tool({
  name: "publish",
  title: "Publish",
  description:
    "Publishes the project's catalog (every diagram and story, as `meltemi-diagrams build catalog` builds it) as a public page at https://<publish host>/<handle>/<slug>/, replacing the page the project published under that slug (the owner's; the account needs a handle, chosen in the app). Answers the address once it has served it.",
  scope: "publish",
  input: z.object({
    project: projectArg,
    slug: z.string().describe("The page's name: 1 to 60 lowercase letters, digits or hyphens."),
  }),
  output: z.object({
    url: z.string(),
    handle: z.string(),
    slug: z.string(),
    bytes: z.number(),
    published_at: z.string(),
    entries: z.number().describe("The diagrams and stories the page holds."),
    skipped: z
      .array(z.string())
      .describe("What was left out because it cannot be drawn, as path#id."),
    diagnostics: z.array(diagnosticSchema),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, slug }) {
    const { op } = session;
    // What would refuse the publication is asked before the catalog is built.
    await requireProjectAccess(op, project, "manage");
    await requireHandle(op);
    readSlug(slug);
    const renderers = op.deps.renderers;
    if (!renderers) throw fail("internal");
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
  },
});

const unpublishTool = tool({
  name: "unpublish",
  title: "Unpublish",
  description:
    "Removes the project's publication under a slug (the owner's); its address stops serving. The others stay.",
  scope: "publish",
  input: z.object({ project: projectArg, slug: z.string() }),
  output: z.object({ unpublished: z.literal(true), slug: z.string() }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, slug }) {
    await unpublish(session.op, project, slug);
    return { structured: { unpublished: true as const, slug } };
  },
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

export const LIVE_TOOLS: readonly AnyTool[] = [getLiveTool, startLiveTool, endLiveTool];
export const PUBLISH_TOOLS: readonly AnyTool[] = [listPublicationsTool, publishTool, unpublishTool];

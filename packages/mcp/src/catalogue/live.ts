// The live-session and publishing tools (`mcp-server`, "Live sessions and publishing through the
// tools"): the owner's, with the `live` or the `publish` scope. `publish` builds the catalog the page
// and the command line publish (the same build), stores it, and reads the public address back once
// before it answers, so that the address it gives is one that served.

import * as z from "zod";
import { define } from "../serve.js";
import { diagnosticSchema, projectArg } from "../shapes.js";

const liveSchema = z.object({
  id: z.string(),
  link: z.string().describe("The session's link: whoever opens it joins, without an account."),
  guestsEdit: z.boolean(),
  startedAt: z.string(),
  until: z.string().describe("When the session ends by itself."),
  guests: z.number(),
});

const publicationSchema = z.object({
  project: z.string().optional(),
  slug: z.string(),
  url: z.string().describe("The public address, served to anybody."),
  published_at: z.string(),
  bytes: z.number(),
});

/** The live-session tools, by name, in the catalogue's order. */
export const LIVE_TOOLS = {
  get_live: define({
    name: "get_live",
    title: "Get the live session",
    description:
      "The project's live session, with its link and its end, or null when none is on (the owner's).",
    scope: "live",
    input: z.object({ project: projectArg }),
    output: z.object({ live: liveSchema.nullable() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  start_live: define({
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
  }),
  end_live: define({
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
  }),
} as const;

/** The publishing tools, by name, in the catalogue's order. */
export const PUBLISH_TOOLS = {
  list_publications: define({
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
  }),
  publish: define({
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
  }),
  unpublish: define({
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
  }),
} as const;

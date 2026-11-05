// The tools of the account, its projects, their files and versions (`mcp-server`, "Projects through
// the tools" and "Files through the tools"), as both servers list them: the Worker answers them with
// the operations its HTTP routes call, the command line's local server through those routes.

import * as z from "zod";
import { define } from "../serve.js";
import {
  diagnosticSchema,
  idempotencyKeyArg,
  pathArg,
  projectArg,
  projectSchema,
} from "../shapes.js";

const usageSchema = z.object({ projects: z.number(), storageBytes: z.number() });
const limitsSchema = z.object({
  projects: z.number(),
  storageBytes: z.number(),
  files: z.number(),
  documentBytes: z.number(),
  binaryBytes: z.number(),
  versions: z.number(),
});

/** A version as the tools answer it. */
export const versionSchema = z.object({
  number: z.number(),
  label: z.string().nullable(),
  auto: z.boolean(),
  created_at: z.string(),
  created_by: z.string(),
  changed: z.array(z.string()),
});

/** The tools of this file, by name, in the catalogue's order. */
export const PROJECT_TOOLS = {
  whoami: define({
    name: "whoami",
    title: "Who am I",
    description:
      "The Meltemi account these tools act as: its name, email and publishing handle, the scopes this connection was granted, and its usage and limits.",
    scope: "projects:read",
    input: z.object({}),
    output: z.object({
      sub: z.string(),
      name: z.string(),
      email: z.string(),
      handle: z.string().nullable(),
      scopes: z.array(z.string()),
      usage: usageSchema,
      limits: limitsSchema,
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  list_projects: define({
    name: "list_projects",
    title: "List projects",
    description:
      "The account's projects and the ones it is a member of, the most recently updated first, each with the role the account has in it and its address in the app.",
    scope: "projects:read",
    input: z.object({}),
    output: z.object({ projects: z.array(projectSchema) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  create_project: define({
    name: "create_project",
    title: "Create a project",
    description:
      "Creates a project in the account, empty, from a template (flow, c4, sequence, free or purchase) or from files, and answers it with its address. Give an idempotencyKey so that a retry never creates a second project.",
    scope: "projects:write",
    input: z.object({
      name: z.string().describe("1 to 100 characters."),
      description: z.string().optional().describe("At most 500 characters."),
      template: z.enum(["flow", "c4", "sequence", "free", "purchase"]).optional(),
      files: z
        .record(z.string(), z.string())
        .optional()
        .describe('Text by path, such as { "checkout.meltemi": "diagram checkout: flow { … }" }.'),
      binaries: z
        .record(z.string(), z.string())
        .optional()
        .describe("The SHA-256 of an image or font the account's projects already hold, by path."),
      idempotencyKey: idempotencyKeyArg,
    }),
    output: projectSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  get_project: define({
    name: "get_project",
    title: "Get a project",
    description:
      "A project's name, description, the account's role in it, its current revision, the paths of its files and its address. Use the revision as ifRevision when writing.",
    scope: "projects:read",
    input: z.object({ project: projectArg }),
    output: projectSchema.extend({
      revision: z.number(),
      files: z.array(z.string()).describe("The paths of its text files."),
      binaries: z.array(z.string()).describe("The paths of its images and fonts."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  rename_project: define({
    name: "rename_project",
    title: "Rename a project",
    description:
      "Renames a project or changes its description (the owner's). A field left out stays.",
    scope: "projects:write",
    input: z.object({
      project: projectArg,
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    output: projectSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  read_files: define({
    name: "read_files",
    title: "Read files",
    description:
      "The project's files as they are now, with the revision they are at: the texts by path, and the SHA-256 of each image or font by path. Give paths to read only those; what a person changed in the app is here.",
    scope: "projects:read",
    input: z.object({
      project: projectArg,
      paths: z.array(pathArg).max(2000).optional(),
    }),
    output: z.object({
      revision: z.number(),
      files: z.record(z.string(), z.string()),
      binaries: z.record(z.string(), z.string()),
      missing: z
        .array(z.string())
        .optional()
        .describe("The paths asked for that the project does not hold."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  write_files: define({
    name: "write_files",
    title: "Write files",
    description:
      "Writes files of a project in one change that every open page receives at once: text by path (null deletes), and images or fonts by the hash upload_image answered. ifRevision is the revision read_files or get_project gave: a project that changed since is refused (revision.mismatch, with the current revision), so read again and merge. Every .meltemi file written is compiled with the project first: a push with an error is refused whole (diagram.invalid, with the diagnostics). Warnings are answered.",
    scope: "projects:write",
    input: z.object({
      project: projectArg,
      files: z
        .record(z.string(), z.string().nullable())
        .describe("Text by path; null deletes the file."),
      binaries: z
        .record(z.string(), z.string().nullable())
        .optional()
        .describe("An uploaded image or font's SHA-256 by path; null removes it."),
      ifRevision: z.number().int().min(0).describe("The revision the change is made on."),
      idempotencyKey: idempotencyKeyArg,
    }),
    output: z.object({
      revision: z.number(),
      diagnostics: z.array(diagnosticSchema).describe("The warnings of the files written."),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  validate: define({
    name: "validate",
    title: "Validate",
    description:
      "The diagnostics of a file of the project, or of the whole project, as `meltemi-diagrams validate` prints them (the layout's warnings included), at the revision it is at now. Images and fonts are checked by preview.",
    scope: "projects:read",
    input: z.object({ project: projectArg, path: pathArg.optional() }),
    output: z.object({
      revision: z.number(),
      errors: z.number(),
      warnings: z.number(),
      diagnostics: z.array(diagnosticSchema).describe("The first fifty."),
      truncated: z.boolean(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  upload_image: define({
    name: "upload_image",
    title: "Upload an image",
    description:
      'Uploads the bytes of an image (PNG, JPEG, GIF, WebP, SVG) or a font (woff2, ttf, otf), as base64, to a path of the project, and answers its SHA-256. The file is in the project at once; a .meltemi file shows it by its path (`image "assets/logo.png"`).',
    scope: "projects:write",
    input: z.object({
      project: projectArg,
      path: pathArg,
      data: z.string().describe("The file's bytes, base64. At most 10 MiB of bytes."),
    }),
    output: z.object({ hash: z.string(), path: z.string() }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  list_versions: define({
    name: "list_versions",
    title: "List versions",
    description: "The project's versions, the newest first, each with the paths it changed.",
    scope: "projects:read",
    input: z.object({ project: projectArg }),
    output: z.object({ versions: z.array(versionSchema) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  create_version: define({
    name: "create_version",
    title: "Create a version",
    description:
      "Records the project's files as they are now as a version, with an optional label of at most 80 characters, so that they can be restored later.",
    scope: "projects:write",
    input: z.object({ project: projectArg, label: z.string().optional() }),
    output: versionSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }),
  restore_version: define({
    name: "restore_version",
    title: "Restore a version",
    description:
      "Puts the files of a version back in the project, for everybody at once; the state it replaces is kept as a new version first.",
    scope: "projects:write",
    input: z.object({ project: projectArg, number: z.number().int().min(1) }),
    output: z.object({
      revision: z.number(),
      restored: z.number(),
      saved: versionSchema,
      skipped: z.array(z.string()).optional(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }),
  open_url: define({
    name: "open_url",
    title: "Open in the app",
    description:
      "The address that opens the project in Meltemi Diagrams in the browser, to give the person. It opens for whoever the project's sharing lets in.",
    scope: "projects:read",
    input: z.object({ project: projectArg }),
    output: z.object({ url: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
} as const;

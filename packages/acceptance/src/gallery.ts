// The gallery of the four profiles and the reference purchase example, with their exports: what
// the README and the launch material show, generated from the product so that it stays true.
// Usage: pnpm gallery
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { templateManifest } from "@meltemi/diagrams-project";
import { mdg } from "./cli.js";
import { REPO_ROOT, TOOL_VERSION } from "./corpus.js";
import { writeMarkdown } from "./markdown.js";

export const GALLERY = join(REPO_ROOT, "gallery");
export const EXAMPLE = join(REPO_ROOT, "examples", "purchase");
export const EXAMPLE_EXPORTS = join(EXAMPLE, "exports");
export const TEMPLATE = join(REPO_ROOT, "packages", "cli", "templates", "purchase");

/** The gallery's sheets, one per profile and a sketch, in the order the README shows them. */
export const GALLERY_SHEETS = [
  {
    profile: "flow",
    file: "flow/delivery-pipeline.meltemi",
    title: "Flow: a delivery pipeline",
    about:
      "Laid out automatically from the relations alone: groups, a decision, parallel branches, icons from the built-in Tabler pack and a flow effect on the release.",
  },
  {
    profile: "sequence",
    file: "sequence/passkey-sign-in.meltemi",
    title: "Sequence: sign-in with a passkey",
    about:
      "Participants of three kinds, activations, replies and an `alt` fragment; each outcome is a scenario that exports on its own.",
  },
  {
    profile: "c4",
    file: "c4/ride-sharing.meltemi",
    title: "C4: the containers of a ride-sharing platform",
    about:
      "One model of people, containers and external systems, and a container view placed by hand; other views of the model share every entity and relation.",
  },
  {
    profile: "free",
    file: "free/roadmap.meltemi",
    title: "Free: a roadmap slide",
    about:
      "A 16:9 slide composed freely: measured text, groups placed by their interiors, icons and connectors between columns.",
  },
  {
    profile: "free",
    file: "free/sketch.meltemi",
    title: "Free: a whiteboard sketch",
    about:
      "The `sketch.light` theme paints every stroke by hand in two passes while the text stays crisp; a dashed free line divides what runs today from what comes next.",
  },
] as const;

/** The example's exports, by what they show. */
export const EXAMPLE_FILES = {
  context: "architecture.context.svg",
  containers: "architecture.containers.svg",
  payment: "payment.svg",
  executive: "executive.svg",
  slidePng: "executive.png",
  slidePdf: "executive.pdf",
  player: "purchase-story.html",
  mp4: "purchase-story.mp4",
  gif: "purchase-story.gif",
  catalog: "catalog/index.html",
} as const;

const posix = (path: string) => path.replaceAll("\\", "/");

/** Writes the gallery's SVG, PNG and PDF beside each sheet, and the gallery's README. */
export async function writeGallery(): Promise<string[]> {
  const written: string[] = [];
  for (const format of ["svg", "png", "pdf"]) {
    const printed = mdg("export", GALLERY, ...(format === "svg" ? [] : ["--format", format]));
    written.push(...[...printed.matchAll(/^Wrote (\S+)/gm)].map((m) => m[1]!));
  }
  const sections = GALLERY_SHEETS.flatMap((sheet) => {
    const stem = sheet.file.replace(/\.meltemi$/, "");
    return [
      `## ${sheet.title}`,
      "",
      sheet.about,
      "",
      `![${sheet.title}](${stem}.svg)`,
      "",
      `[Source](${sheet.file}) · [SVG](${stem}.svg) · [PNG](${stem}.png) · [PDF](${stem}.pdf)`,
      "",
    ];
  });
  await writeMarkdown(
    join(GALLERY, "README.md"),
    [
      "# Gallery",
      "",
      "One sheet of each profile of Meltemi Diagrams, with its exports. Every picture is the",
      "command line's export of the source beside it; `pnpm gallery` writes them again, and a test",
      "checks that each SVG is what the source exports today.",
      "",
      "The reference example, a purchase drawn in every profile with its story, video and",
      `catalog, is in [examples/purchase](../examples/purchase/README.md).`,
      "",
      ...sections,
    ].join("\n"),
  );
  written.push(posix(relative(REPO_ROOT, join(GALLERY, "README.md"))));
  return written;
}

/** Writes the purchase example: the template's sources, every export and the README. */
export async function writeExample(): Promise<string[]> {
  rmSync(EXAMPLE, { recursive: true, force: true });
  mkdirSync(EXAMPLE_EXPORTS, { recursive: true });
  cpSync(TEMPLATE, EXAMPLE, { recursive: true });
  writeFileSync(
    join(EXAMPLE, "project.json"),
    templateManifest("purchase", "purchase", { toolVersion: TOOL_VERSION, languageVersion: "0.2" }),
  );
  const out = (name: string) => join(EXAMPLE_EXPORTS, name);
  const slide = join(EXAMPLE, "diagrams", "executive.meltemi");
  const story = join(EXAMPLE, "stories", "purchase.meltemi");
  const printed = [
    mdg("export", join(EXAMPLE, "diagrams"), "--out", EXAMPLE_EXPORTS),
    mdg("export", slide, "--format", "png", "--out", out(EXAMPLE_FILES.slidePng)),
    mdg("export", slide, "--format", "pdf", "--out", out(EXAMPLE_FILES.slidePdf)),
    mdg(
      "export",
      story,
      "--story",
      "purchase",
      "--format",
      "html",
      "--out",
      out(EXAMPLE_FILES.player),
    ),
    ...(findFfmpeg()
      ? [
          mdg(
            "export",
            story,
            "--story",
            "purchase",
            "--format",
            "mp4",
            "--out",
            out(EXAMPLE_FILES.mp4),
          ),
          mdg(
            "export",
            story,
            "--story",
            "purchase",
            "--format",
            "gif",
            "--out",
            out(EXAMPLE_FILES.gif),
          ),
        ]
      : []),
    mdg("build", "catalog", EXAMPLE, "--out", out("catalog")),
  ];
  const written = printed.flatMap((p) => [...p.matchAll(/^Wrote (\S+)/gm)].map((m) => m[1]!));
  await writeMarkdown(join(EXAMPLE, "README.md"), exampleReadme());
  written.push(posix(relative(REPO_ROOT, join(EXAMPLE, "README.md"))));
  return written;
}

function exampleReadme(): string {
  const f = EXAMPLE_FILES;
  return [
    "# The purchase example",
    "",
    "The reference example of Meltemi Diagrams: one purchase, from the customer's click to the",
    "confirmed order, drawn in every profile from one model. A customer, the web store, the API",
    "gateway, orders, payments, an event bus, the orders database and an external payment provider",
    "keep the same identity in every view, the sequence, the slide and the story.",
    "",
    "It is the `purchase` template: `meltemi-diagrams init my-shop --template purchase` writes the",
    "same project. The exports below are written by `pnpm gallery`.",
    "",
    "## The model",
    "",
    "[models/commerce.meltemi](models/commerce.meltemi) declares the people, systems, containers and",
    "relations once. Views, the sequence and the slide refer to its entities, so a rename in the",
    "model reaches all of them.",
    "",
    "## Architecture",
    "",
    "[diagrams/architecture.meltemi](diagrams/architecture.meltemi) holds two C4 views of the model:",
    "the shop in its context, laid out automatically, and its containers, placed by hand.",
    "",
    `![The shop in context](exports/${f.context})`,
    "",
    `![Inside the shop](exports/${f.containers})`,
    "",
    "## Payment sequence",
    "",
    "[diagrams/payment.meltemi](diagrams/payment.meltemi) follows the payment between the",
    "containers, with an approved and a declined scenario.",
    "",
    `![Payment sequence](exports/${f.payment})`,
    "",
    "## Executive slide",
    "",
    "[diagrams/executive.meltemi](diagrams/executive.meltemi) is a free 16:9 composition whose boxes",
    `are entities of the model: [SVG](exports/${f.executive}), [PNG](exports/${f.slidePng}) at twice`,
    `the pixels, [PDF](exports/${f.slidePdf}) with selectable text.`,
    "",
    `![From click to confirmed order](exports/${f.executive})`,
    "",
    "## The story",
    "",
    "[stories/purchase.meltemi](stories/purchase.meltemi) walks from the context to the containers:",
    "it reveals the participants, morphs into the container view and traces the order and the",
    `payment. It plays in the [HTML player](exports/${f.player}), and is exported as a 1080p`,
    `[MP4 video](exports/${f.mp4}) and a [GIF](exports/${f.gif}).`,
    "",
    `![The story as a GIF](exports/${f.gif})`,
    "",
    "## The catalog",
    "",
    `[exports/${f.catalog}](exports/${f.catalog}) is the project's browsable catalog in one offline`,
    "file: every diagram and the story, search, and links through the model's entities.",
    "",
    "## Making it again",
    "",
    "```bash",
    "pnpm gallery",
    "```",
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const written = [...(await writeGallery()), ...(await writeExample())];
  for (const file of written) console.log(`  ${file}`);
  console.log(`\nWrote ${written.length} files.`);
  if (!findFfmpeg()) console.log("FFmpeg is not installed: the example has no MP4 or GIF.");
}

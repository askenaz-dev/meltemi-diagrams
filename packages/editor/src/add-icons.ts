import {
  PACK_PREFIX,
  geometrySvg,
  humanise,
  isIconName,
  sanitizeSvg,
  slugifyIconName,
  type IconPack,
  type IconRegistry,
} from "@meltemi/diagrams-assets";
import type { EditOperation } from "@meltemi/diagrams-edit";
import type { FlowDiagram } from "@meltemi/diagrams-model";
import {
  ICONS_FOLDER,
  LICENSES_FILE,
  PROJECT_LIBRARY_FILE,
  iconFilePath,
} from "@meltemi/diagrams-project";
import { libraryCategoryId } from "./asset-files.js";
import type {
  AddedIconInfo,
  IconFileCheck,
  IconFileInput,
  IconPrefixCheck,
} from "./canvas/protocol.js";
import { takesIcon } from "./icons.js";
import { messages } from "./messages/index.js";
import type { AssetSteps, ProjectStep } from "./projects.js";

/** The prefix the Add icon dialog offers first. */
export const DEFAULT_ICON_PREFIX = "project";

/** What a licence may be written as: an SPDX identifier or a `LicenseRef-` name. */
const LICENCE = /^(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.+-]*)$/;

/** Whether a pack is one of the project's own, read from a folder or a file under `assets/icons`. */
function projectPack(pack: IconPack): boolean {
  return pack.metadata.source.startsWith(`${ICONS_FOLDER}/`);
}

/**
 * What the Add icon dialog may do with a prefix: put the icons in a new pack, or in a pack of the
 * project read from a folder; never in a built-in pack, a plugin's, an Iconify file of the
 * project (the dialog writes SVG files) or an alias of `project.json`.
 */
export function checkIconPrefix(
  registry: IconRegistry | undefined,
  prefix: string,
): IconPrefixCheck {
  const words = messages().addIcons;
  const fail = (problem: string): IconPrefixCheck => ({
    prefix,
    problem,
    existing: false,
    licensed: false,
  });
  if (prefix === "") return fail(words.prefixEmpty);
  if (!PACK_PREFIX.test(prefix)) return fail(words.prefixInvalid(prefix));
  const alias = registry?.aliasList()[prefix];
  if (alias !== undefined) return fail(words.prefixAlias(prefix, alias));
  const pack = registry?.list().find((p) => p.prefix === prefix);
  if (!pack) return { prefix, existing: false, licensed: false };
  if (pack.metadata.source === "built-in") return fail(words.prefixBuiltIn(prefix));
  if (!projectPack(pack)) return fail(words.prefixPlugin(prefix));
  if (pack.metadata.source.endsWith(".json")) {
    return fail(words.prefixIconify(prefix, pack.metadata.source));
  }
  return { prefix, existing: true, licensed: pack.metadata.license !== null };
}

/** The names a pack has, lower case: a file system may not tell `Logo.svg` from `logo.svg`. */
function takenNames(registry: IconRegistry | undefined, prefix: string): Set<string> {
  const pack = registry?.list().find((p) => p.prefix === prefix);
  return new Set((pack?.names() ?? []).map((n) => n.toLowerCase()));
}

/**
 * Each file of the Add icon dialog as the dialog shows it: the name it gets (the one asked for, or
 * one made of the file's name and free in the pack), a preview through the sanitiser, and what
 * keeps it from being added: an SVG the sanitiser refuses, a name a reference cannot write, a name
 * the pack or an earlier file has.
 */
export function checkIconFiles(
  registry: IconRegistry | undefined,
  prefix: string,
  files: readonly IconFileInput[],
): IconFileCheck[] {
  const words = messages().addIcons;
  const taken = takenNames(registry, prefix);
  const used = new Set<string>();
  return files.map((file) => {
    let name = file.name?.trim() ?? "";
    let problem: string | undefined;
    if (file.name === undefined) {
      // A name is offered: the file's own, made writable, then `-2`, `-3`… while it is taken.
      const slug = slugifyIconName(file.file);
      name = slug;
      for (
        let n = 2;
        slug !== "" && (taken.has(name.toLowerCase()) || used.has(name.toLowerCase()));
        n++
      ) {
        name = `${slug}-${n}`;
      }
    }
    if (name === "") problem = words.nameEmpty;
    else if (!isIconName(name)) problem = words.nameInvalid(name);
    else if (taken.has(name.toLowerCase())) problem = words.nameTaken(`${prefix}:${name}`);
    else if (used.has(name.toLowerCase())) problem = words.nameTwice(name);
    if (name !== "") used.add(name.toLowerCase());
    let svg: string | null = null;
    if (!/<svg[\s>]/i.test(file.svg)) {
      problem = words.notSvg;
    } else {
      const result = sanitizeSvg(file.svg);
      if (result.ok) svg = geometrySvg(result.icon, 48, 48);
      else problem = words.unsafe(result.problem.message);
    }
    return { file: file.file, name, svg, ...(problem !== undefined ? { problem } : {}) };
  });
}

/** What `addIcons` gives: the icons added, the files refused, and what to write. */
export interface AddedIcons {
  readonly added: readonly AddedIconInfo[];
  readonly refused: readonly { readonly file: string; readonly reason: string }[];
  /** The files of the assets, and the statements that give the first icon to the targets. */
  readonly assets: AssetSteps;
  readonly steps: readonly ProjectStep[];
}

/**
 * The files and statements that add icons to the project: one `assets/icons/<prefix>/<name>.svg`
 * per file that can be added, the pack's licence in `assets/licenses.json` when it has none, an
 * item per icon in the project's library (`assets/libraries/project.json`, a category per
 * prefix), and `style <id> { icon }` of the first icon on the targets that take one. A prefix the
 * icons cannot go into, or a licence missing or malformed, refuses every file.
 */
export function addIcons(
  registry: IconRegistry | undefined,
  diagram: FlowDiagram | undefined,
  request: {
    readonly prefix: string;
    readonly licence?: string;
    readonly files: readonly IconFileInput[];
    readonly targets: readonly string[];
  },
): AddedIcons {
  const words = messages().addIcons;
  const none = { create: [], json: [] };
  const refuseAll = (reason: string): AddedIcons => ({
    added: [],
    refused: request.files.map((f) => ({ file: f.file, reason })),
    assets: none,
    steps: [],
  });
  const prefix = checkIconPrefix(registry, request.prefix);
  if (prefix.problem !== undefined) return refuseAll(prefix.problem);
  const licence = request.licence?.trim() ?? "";
  if (!prefix.licensed) {
    if (licence === "") return refuseAll(words.licenceMissing);
    if (!LICENCE.test(licence)) return refuseAll(words.licenceInvalid(licence));
  }
  const checks = checkIconFiles(
    registry,
    request.prefix,
    request.files.map((f) => ({ ...f, name: f.name ?? slugifyIconName(f.file) })),
  );
  const added: AddedIconInfo[] = [];
  const refused: { file: string; reason: string }[] = [];
  const create: { path: string; text: string }[] = [];
  checks.forEach((check, i) => {
    if (check.problem !== undefined) {
      refused.push({ file: check.file, reason: check.problem });
      return;
    }
    const reference = `${request.prefix}:${check.name}`;
    create.push({ path: iconFilePath(request.prefix, check.name), text: request.files[i]!.svg });
    const icon = sanitizeSvg(request.files[i]!.svg);
    added.push({
      file: check.file,
      reference,
      label: humanise(check.name),
      svg: icon.ok ? geometrySvg(icon.icon, 24, 24) : null,
    });
  });
  if (added.length === 0) return { added, refused, assets: none, steps: [] };
  const json: AssetSteps["json"][number][] = [];
  if (!prefix.licensed) {
    json.push({
      path: LICENSES_FILE,
      change: { kind: "licence", prefix: request.prefix, licence },
    });
  }
  json.push({
    path: PROJECT_LIBRARY_FILE,
    change: {
      kind: "libraryItems",
      category: libraryCategoryId(request.prefix),
      title: request.prefix,
      items: added.map((icon) => ({ icon: icon.reference, label: icon.label })),
    },
  });
  const steps: ProjectStep[] = [];
  if (diagram) {
    for (const target of request.targets) {
      const element = diagram.elementsById.get(target);
      if (!element || !takesIcon(diagram, element)) continue;
      const operation: EditOperation = {
        kind: "setStyleProperty",
        diagram: diagram.id,
        target,
        targetKind: "element",
        property: "icon",
        value: added[0]!.reference,
      };
      steps.push({ file: null, operation });
    }
  }
  return { added, refused, assets: { create, json }, steps };
}

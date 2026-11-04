/**
 * Converts the vendors' icon downloads into the built-in Iconify packs of `@meltemi/diagrams-assets`:
 * `packages/assets/vendor/{aws,azure,gcp,kubernetes}.json`, each with the vendor's categories, a
 * label per icon, and `info` with the version, the licence and the vendor's terms. Icons keep the
 * vendor's geometry and colours: `<style>` rules are inlined into attributes, editor metadata is
 * dropped, and every icon goes through the sanitiser; the ones it refuses are left out and listed.
 *
 * Usage (the downloads unzipped first; every option is optional, a set is skipped without it):
 *   pnpm vendor:icons --aws <folder> --azure <folder> --gcp <folder> --kubernetes <folder> \
 *     [--gcp-table <json>] [--date 2026-10-14] [--out packages/assets/vendor]
 *
 * Sources: https://aws.amazon.com/architecture/icons/ (the "Asset package" zip),
 * https://learn.microsoft.com/azure/architecture/icons/ (the SVG zip), https://cloud.google.com/icons
 * (the icons zip) and https://github.com/kubernetes/community/tree/master/icons (the `svg` folder).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeBody, type IconifyJson } from "../packages/assets/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

// ---------------------------------------------------------------------------------------------
// Arguments

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]!;
  if (arg.startsWith("--")) args.set(arg.slice(2), process.argv[++i] ?? "");
}
const out = join(repo, args.get("out") ?? "packages/assets/vendor");
const date = args.get("date") ?? new Date().toISOString().slice(0, 10);
mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------------------------------------
// SVG to Iconify

/** An icon of a set before it is written: where it came from and what it is. */
interface Source {
  readonly file: string;
  readonly name: string;
  readonly label: string;
  readonly category: string;
}

interface Converted {
  readonly body: string;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

/** The content of an SVG file as an Iconify icon, or the reason it cannot be one. */
function convert(svg: string): Converted | string {
  const open = svg.match(/<svg\b([^>]*)>/);
  if (!open) return "no <svg> element";
  const attributes = open[1]!;
  const viewBox = attributes.match(/\bviewBox="([^"]+)"/)?.[1];
  let left = 0;
  let top = 0;
  let width: number;
  let height: number;
  if (viewBox) {
    const numbers = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) return "bad viewBox";
    [left, top, width, height] = numbers as [number, number, number, number];
  } else {
    width = Number.parseFloat(attributes.match(/\bwidth="([^"]+)"/)?.[1] ?? "");
    height = Number.parseFloat(attributes.match(/\bheight="([^"]+)"/)?.[1] ?? "");
    if (!Number.isFinite(width) || !Number.isFinite(height)) return "no size";
  }
  const close = svg.lastIndexOf("</svg>");
  if (close < 0) return "no </svg>";
  let body = svg.slice(open.index! + open[0].length, close);
  // Editor metadata, titles and comments go; the drawing stays.
  body = body
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<(sodipodi:namedview|inkscape:[a-z]+)\b[^>]*\/>/g, "")
    .replace(/<(sodipodi:namedview)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/\s+(inkscape|sodipodi|xml):[a-zA-Z-]+="[^"]*"/g, "")
    .replace(/\s+xmlns:[a-zA-Z-]+="[^"]*"/g, "")
    .replace(/\s+data-name="[^"]*"/g, "");
  body = inlineStyles(body);
  body = body.replace(/\s+class="[^"]*"/g, "");
  // Labels drawn as text go (the library labels the element); links around the drawing go too.
  body = body.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, "").replace(/<\/?a\b[^>]*>/g, "");
  // Clip paths are cosmetic in these sets and the sanitiser refuses them: the drawing stays.
  body = body
    .replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/g, "")
    .replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/g, "")
    .replace(/\s+(clip-path|filter)="[^"]*"/g, "")
    .replace(/(clip-path|filter):[^;"]*;?/g, "");
  body = simpleIds(body);
  body = body.replace(/<defs\b[^>]*>\s*<\/defs>/g, "");
  body = body.replace(/>\s+</g, "><").trim();
  return { body, width, height, left, top };
}

/** Gives every id of an icon a simple name and follows the references, as the sanitiser wants. */
function simpleIds(body: string): string {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
  if (ids.length === 0) return body;
  const renamed = new Map<string, string>();
  ids.forEach((id, i) => renamed.set(id, `g${i + 1}`));
  return body
    .replace(/\sid="([^"]+)"/g, (whole, id: string) => ` id="${renamed.get(id) ?? id}"`)
    .replace(/url\(#([^)]+)\)/g, (whole, id: string) => `url(#${renamed.get(id) ?? id})`)
    .replace(/url\("#([^"]+)"\)/g, (whole, id: string) => `url(#${renamed.get(id) ?? id})`)
    .replace(/href="#([^"]+)"/g, (whole, id: string) => `href="#${renamed.get(id) ?? id}"`);
}

/** Moves the rules of `<style>` elements onto the elements that carry their classes. */
function inlineStyles(body: string): string {
  const rules = new Map<string, string>();
  const styled = body.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, (_, css: string) => {
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const declarations = rule[2]!.trim().replace(/;\s*$/, "");
      for (const selector of rule[1]!.split(",")) {
        const name = selector.trim();
        if (!name.startsWith(".")) continue;
        const existing = rules.get(name.slice(1));
        rules.set(name.slice(1), existing ? `${existing};${declarations}` : declarations);
      }
    }
    return "";
  });
  if (rules.size === 0) return styled;
  return styled.replace(
    /<([a-zA-Z]+)([^>]*?)\sclass="([^"]+)"([^>]*?)(\/?)>/g,
    (whole, tag, before, classes, after, slash) => {
      const declarations = (classes as string)
        .split(/\s+/)
        .map((c) => rules.get(c))
        .filter((d): d is string => d !== undefined)
        .join(";");
      if (declarations === "") return whole;
      const rest = `${before}${after}`;
      const own = rest.match(/\sstyle="([^"]*)"/);
      // The element's own style wins over the class rules, as in CSS.
      const merged = own ? `${declarations};${own[1]}` : declarations;
      const without = own ? rest.replace(own[0], "") : rest;
      return `<${tag}${without} style="${merged}"${slash}>`;
    },
  );
}

const kebab = (text: string) =>
  text
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const titleCase = (text: string) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

function files(folder: string, filter: (path: string) => boolean): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (extname(entry).toLowerCase() === ".svg" && filter(path)) found.push(path);
    }
  };
  walk(folder);
  return found.sort();
}

const relativeOf = (folder: string, path: string) => relative(folder, path).split(sep).join("/");

// ---------------------------------------------------------------------------------------------
// The sets

interface SetInfo {
  readonly prefix: string;
  readonly title: string;
  readonly version: string;
  readonly author: string;
  readonly authorUrl: string;
  readonly license: string;
  readonly licenseTitle: string;
  readonly licenseUrl: string;
  readonly terms: string;
  readonly redistribute: boolean;
}

const AWS_CATEGORIES: Readonly<Record<string, string>> = {
  Analytics: "Analytics",
  "Application-Integration": "Application Integration",
  "Artificial-Intelligence": "Artificial Intelligence",
  Blockchain: "Blockchain",
  "Business-Applications": "Business Applications",
  "Cloud-Financial-Management": "Cloud Financial Management",
  Compute: "Compute",
  Containers: "Containers",
  "Customer-Enablement": "Customer Enablement",
  Databases: "Databases",
  "Developer-Tools": "Developer Tools",
  "End-User-Computing": "End User Computing",
  "Front-End-Web-Mobile": "Front-End Web & Mobile",
  Games: "Games",
  "General-Icons": "General",
  "Internet-of-Things": "Internet of Things",
  "Management-Tools": "Management & Governance",
  "Media-Services": "Media Services",
  "Migration-Modernization": "Migration & Modernization",
  "Networking-Content-Delivery": "Networking & Content Delivery",
  "Quantum-Technologies": "Quantum Technologies",
  Satellite: "Satellite",
  "Security-Identity": "Security, Identity & Compliance",
  Storage: "Storage",
};

function awsSources(folder: string): Source[] {
  const sources: Source[] = [];
  const taken = new Set<string>();
  const unique = (name: string, fallback: string) => {
    let candidate = name;
    if (taken.has(candidate)) candidate = fallback;
    let n = 2;
    while (taken.has(candidate)) candidate = `${fallback}-${n++}`;
    taken.add(candidate);
    return candidate;
  };
  // Service icons at 64: Architecture-Service-Icons_*/Arch_<Category>/64/Arch_<Name>_64.svg
  for (const file of files(folder, (p) =>
    /Architecture-Service-Icons[^/\\]*[/\\]Arch_[^/\\]+[/\\]64[/\\]Arch_.*_64\.svg$/.test(p),
  )) {
    const category = basename(dirname(dirname(file))).replace(/^Arch_/, "");
    const raw = basename(file, ".svg")
      .replace(/^Arch_/, "")
      .replace(/_64$/, "");
    const label = raw.replace(/-/g, " ");
    const short = raw.replace(/^(AWS|Amazon)-/, "");
    sources.push({
      file,
      name: unique(kebab(short), kebab(raw)),
      label,
      category: AWS_CATEGORIES[category] ?? titleCase(category.replace(/-/g, " ")),
    });
  }
  // General resource icons, light: Resource-Icons_*/Res_General-Icons/Res_48_Light/Res_<Name>_48_Light.svg
  for (const file of files(folder, (p) =>
    /Resource-Icons[^/\\]*[/\\]Res_General-Icons[/\\]Res_48_Light[/\\]Res_.*_48_Light\.svg$/.test(
      p,
    ),
  )) {
    const raw = basename(file, ".svg")
      .replace(/^Res_/, "")
      .replace(/_48_Light$/, "");
    sources.push({
      file,
      name: unique(kebab(raw), `${kebab(raw)}-resource`),
      label: raw.replace(/-/g, " "),
      category: "General Resources",
    });
  }
  // Group icons: Architecture-Group-Icons_*/<Name>_32.svg (the light variants only).
  for (const file of files(folder, (p) =>
    /Architecture-Group-Icons[^/\\]*[/\\][^/\\]+_32\.svg$/.test(p),
  )) {
    const raw = basename(file, ".svg").replace(/_32$/, "");
    sources.push({
      file,
      name: unique(`group-${kebab(raw)}`, `group-${kebab(raw)}-2`),
      label: raw.replace(/-/g, " "),
      category: "Groups",
    });
  }
  return sources;
}

const AZURE_TITLES: Readonly<Record<string, string>> = {
  "ai + machine learning": "AI + Machine Learning",
  iot: "IoT",
  devops: "DevOps",
  "hybrid + multicloud": "Hybrid + Multicloud",
  "management + governance": "Management + Governance",
  "app services": "App Services",
  "azure ecosystem": "Azure Ecosystem",
  "mixed reality": "Mixed Reality",
  "developer tools": "Developer Tools",
  "new icons": "New Icons",
};

function azureSources(folder: string): Source[] {
  const sources: Source[] = [];
  const seen = new Map<string, string>();
  for (const file of files(folder, (p) =>
    /[/\\]Icons[/\\][^/\\]+[/\\]\d+-icon-service-.*\.svg$/.test(p),
  )) {
    const category = basename(dirname(file));
    const raw = basename(file, ".svg").replace(/^\d+-icon-service-/, "");
    const label = raw.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    let name = kebab(raw);
    const content = readFileSync(file, "utf8");
    const previous = seen.get(name);
    if (previous !== undefined) {
      // The same service listed twice (new icons, menu): keep one copy of identical files.
      if (previous === content) continue;
      let n = 2;
      while (seen.has(`${name}-${n}`)) n++;
      name = `${name}-${n}`;
    }
    seen.set(name, content);
    sources.push({
      file,
      name,
      label,
      category: AZURE_TITLES[category] ?? titleCase(category),
    });
  }
  return sources;
}

interface GcpTable {
  readonly categories: Readonly<
    Record<string, { readonly title: string; readonly services: readonly string[] }>
  >;
  readonly labels: Readonly<Record<string, string>>;
}

function gcpSources(folder: string, table: GcpTable): Source[] {
  const categoryOf = new Map<string, string>();
  for (const category of Object.values(table.categories)) {
    for (const service of category.services) categoryOf.set(service, category.title);
  }
  const sources: Source[] = [];
  for (const file of files(folder, (p) => basename(dirname(p)) === basename(p, ".svg"))) {
    const id = basename(file, ".svg");
    sources.push({
      file,
      name: kebab(id),
      label: table.labels[id] ?? titleCase(id.replace(/[_-]+/g, " ")),
      category: categoryOf.get(id) ?? "Other",
    });
  }
  return sources;
}

const KUBERNETES_LABELS: Readonly<Record<string, string>> = {
  api: "API server",
  "c-c-m": "Cloud controller manager",
  "c-m": "Controller manager",
  "k-proxy": "kube-proxy",
  kubelet: "kubelet",
  sched: "Scheduler",
  "control-plane": "Control plane",
  etcd: "etcd",
  node: "Node",
  "c-role": "ClusterRole",
  cm: "ConfigMap",
  crb: "ClusterRoleBinding",
  crd: "CustomResourceDefinition",
  cronjob: "CronJob",
  deploy: "Deployment",
  ds: "DaemonSet",
  ep: "Endpoints",
  group: "Group",
  hpa: "HorizontalPodAutoscaler",
  ing: "Ingress",
  job: "Job",
  limits: "LimitRange",
  netpol: "NetworkPolicy",
  ns: "Namespace",
  pod: "Pod",
  psp: "PodSecurityPolicy",
  pv: "PersistentVolume",
  pvc: "PersistentVolumeClaim",
  quota: "ResourceQuota",
  rb: "RoleBinding",
  role: "Role",
  rs: "ReplicaSet",
  sa: "ServiceAccount",
  sc: "StorageClass",
  secret: "Secret",
  sts: "StatefulSet",
  svc: "Service",
  user: "User",
  vol: "Volume",
};
const KUBERNETES_CATEGORIES: Readonly<Record<string, string>> = {
  control_plane_components: "Control plane",
  infrastructure_components: "Infrastructure",
  resources: "Resources",
};

function kubernetesSources(folder: string): Source[] {
  const sources: Source[] = [];
  for (const file of files(folder, () => true)) {
    const parts = relativeOf(folder, file).split("/");
    const group = parts[0]!;
    const id = basename(file, ".svg");
    sources.push({
      file,
      name: kebab(id),
      label: KUBERNETES_LABELS[id] ?? id,
      category: KUBERNETES_CATEGORIES[group] ?? titleCase(group.replace(/_/g, " ")),
    });
  }
  return sources;
}

// ---------------------------------------------------------------------------------------------
// Writing

function writeSet(info: SetInfo, sources: Source[]): void {
  const icons: Record<
    string,
    { body: string; width: number; height: number; left?: number; top?: number }
  > = {};
  const categories: Record<string, string[]> = {};
  const labels: Record<string, string> = {};
  const refused: string[] = [];
  for (const source of sources) {
    const converted = convert(readFileSync(source.file, "utf8"));
    if (typeof converted === "string") {
      refused.push(`${basename(source.file)}: ${converted}`);
      continue;
    }
    const check = sanitizeBody(converted.body, {
      x: converted.left,
      y: converted.top,
      width: converted.width,
      height: converted.height,
    });
    if (!check.ok) {
      refused.push(`${basename(source.file)}: ${check.problem.message}`);
      continue;
    }
    icons[source.name] = {
      body: converted.body,
      width: converted.width,
      height: converted.height,
      ...(converted.left !== 0 ? { left: converted.left } : {}),
      ...(converted.top !== 0 ? { top: converted.top } : {}),
    };
    (categories[source.category] ??= []).push(source.name);
    labels[source.name] = source.label;
  }
  const sortedIcons = Object.fromEntries(
    Object.entries(icons).sort(([a], [b]) => a.localeCompare(b)),
  );
  const sortedCategories = Object.fromEntries(
    Object.entries(categories)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, names]) => [title, names.sort()]),
  );
  const json: IconifyJson & { labels: Record<string, string> } = {
    prefix: info.prefix,
    info: {
      name: info.title,
      version: info.version,
      author: { name: info.author, url: info.authorUrl },
      license: { title: info.licenseTitle, spdx: info.license, url: info.licenseUrl },
      palette: true,
      terms: info.terms,
      redistribute: info.redistribute,
      converted: date,
    } as IconifyJson["info"],
    icons: sortedIcons,
    categories: sortedCategories,
    labels: Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))),
  };
  const target = join(out, `${info.prefix}.json`);
  writeFileSync(target, `${JSON.stringify(json)}\n`);
  const size = Math.round(statSync(target).size / 1024);
  console.log(
    `${info.prefix}: ${Object.keys(icons).length} icons in ${Object.keys(categories).length} categories, ${size} KB${refused.length > 0 ? `; ${refused.length} left out` : ""}`,
  );
  for (const line of refused) console.log(`  - ${line}`);
}

const aws = args.get("aws");
if (aws) {
  writeSet(
    {
      prefix: "aws",
      title: "AWS Architecture Icons",
      version:
        basename(files(aws, (p) => /Architecture-Service-Icons/.test(p))[0] ?? "").match(
          /_(\d{8})\b/,
        )?.[1] ?? date,
      author: "Amazon Web Services",
      authorUrl: "https://aws.amazon.com/architecture/icons/",
      license: "LicenseRef-AWS-Architecture-Icons",
      licenseTitle: "AWS Architecture Icons terms",
      licenseUrl: "https://aws.amazon.com/architecture/icons/",
      terms:
        "AWS allows customers and partners to use these toolkits and assets to create architecture diagrams, and in whitepapers, presentations, data sheets and posters. The icons are used unmodified; AWS and the service names are trademarks of Amazon.com, Inc. or its affiliates.",
      redistribute: false,
    },
    awsSources(aws),
  );
}

const azure = args.get("azure");
if (azure) {
  writeSet(
    {
      prefix: "azure",
      title: "Azure architecture icons",
      version: args.get("azure-version") ?? "V24",
      author: "Microsoft",
      authorUrl: "https://learn.microsoft.com/azure/architecture/icons/",
      license: "LicenseRef-Microsoft-Azure-Icons",
      licenseTitle: "Azure icon terms",
      licenseUrl: "https://learn.microsoft.com/azure/architecture/icons/",
      terms:
        "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights. Do not crop, flip, rotate or distort the icons, and do not use them to represent your own product or service.",
      redistribute: false,
    },
    azureSources(azure),
  );
}

const gcp = args.get("gcp");
if (gcp) {
  const tablePath = args.get("gcp-table") ?? join(here, "vendor-icons", "gcp-table.json");
  const table = existsSync(tablePath)
    ? (JSON.parse(readFileSync(tablePath, "utf8")) as GcpTable)
    : { categories: {}, labels: {} };
  writeSet(
    {
      prefix: "gcp",
      title: "Google Cloud icons",
      version: args.get("gcp-version") ?? date,
      author: "Google",
      authorUrl: "https://cloud.google.com/icons",
      license: "LicenseRef-Google-Cloud-Icons",
      licenseTitle: "Google Cloud icon library terms",
      licenseUrl: "https://cloud.google.com/icons",
      terms:
        "Google publishes these product icons for use in architecture diagrams, presentations and documentation under the terms of its icon library page; the icons are used unmodified, and Google Cloud and the product names are trademarks of Google LLC.",
      redistribute: false,
    },
    gcpSources(gcp, table),
  );
}

const kubernetes = args.get("kubernetes");
if (kubernetes) {
  writeSet(
    {
      prefix: "kubernetes",
      title: "Kubernetes icons",
      version: args.get("kubernetes-version") ?? date,
      author: "The Kubernetes Authors",
      authorUrl: "https://github.com/kubernetes/community/tree/master/icons",
      license: "Apache-2.0",
      licenseTitle: "Apache License 2.0",
      licenseUrl: "https://github.com/kubernetes/community/blob/master/LICENSE",
      terms:
        "The Kubernetes icons are published by the Kubernetes Authors in the kubernetes/community repository under the Apache License 2.0; Kubernetes is a trademark of The Linux Foundation.",
      redistribute: true,
    },
    kubernetesSources(kubernetes),
  );
}

if (!aws && !azure && !gcp && !kubernetes) {
  console.log("Nothing to convert: give --aws, --azure, --gcp or --kubernetes folders.");
}

// The index: the metadata and the category sizes of every built-in pack, so hosts list packs and
// libraries without reading the packs themselves. The logos come from the installed package.
const index: Record<string, { info: unknown; categories: Record<string, number> }> = {};
for (const file of readdirSync(out).sort()) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const json = JSON.parse(readFileSync(join(out, file), "utf8")) as IconifyJson;
  index[json.prefix] = {
    info: json.info ?? {},
    categories: Object.fromEntries(
      Object.entries(json.categories ?? {}).map(([title, names]) => [title, names.length]),
    ),
  };
}
try {
  const require = createRequire(join(repo, "packages", "assets", "package.json"));
  const logos = JSON.parse(readFileSync(require.resolve("@iconify-json/logos/info.json"), "utf8"));
  index.logos = { info: { ...logos, terms: undefined }, categories: {} };
} catch {
  console.log("logos: @iconify-json/logos is not installed; its info is left out of the index.");
}
writeFileSync(join(out, "index.json"), `${JSON.stringify(index)}\n`);
console.log(`index: ${Object.keys(index).join(", ")}`);

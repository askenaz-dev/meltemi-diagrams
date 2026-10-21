import { describe, expect, it } from "vitest";
import {
  IconRegistry,
  IconifyPack,
  SvgFolderPack,
  TablerPack,
  compareLocks,
  drawScale,
  drawable,
  drawableNames,
  folderIntegrity,
  formatLock,
  integrityOf,
  packRatio,
  searchIcons,
  sha256,
  toHex,
  type AssetLock,
  type AssetMetadata,
} from "../src/index.js";
import { createNodeIconPacks, createNodeTablerReader } from "../src/node.js";

const tabler = createNodeIconPacks()[0]!;
const metadata = (source: string): AssetMetadata => ({
  title: "t",
  version: "1",
  source,
  license: "CC0-1.0",
  author: null,
  url: null,
  redistribute: false,
});

describe("Tabler pack", () => {
  it("resolves outline and filled icons with Tabler's metadata", () => {
    const registry = new IconRegistry([tabler]);
    const server = registry.lookup("tabler:server");
    expect(server.status).toBe("found");
    if (server.status !== "found") return;
    expect(server.icon.geometry.viewBox).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    expect(server.icon.pack.metadata).toMatchObject({
      license: "MIT",
      version: "3.48.0",
      redistribute: true,
    });
    const star = registry.resolve("tabler:star-filled")!;
    const outline = registry.resolve("tabler:star")!;
    expect(star.geometry.paths[0]!.fill).toEqual({ kind: "current" });
    expect(outline.geometry.paths[0]!.stroke).toEqual({ kind: "current" });
    expect(outline.geometry.paths[0]!.fill).toEqual({ kind: "none" });
  });

  it("has an optical ratio of 20 in 24 and draws at the icon size", () => {
    const ratio = packRatio(tabler)!;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.87);
    expect(drawScale(ratio)).toBeCloseTo(1, 1);
  });

  it("reads the same icons from a reader over memory", () => {
    const read = createNodeTablerReader();
    const files = new Map(
      ["tabler-nodes-outline.json", "tabler-nodes-filled.json", "icons.json", "package.json"].map(
        (f) => [f, read(f)],
      ),
    );
    const memory = new TablerPack((path) => files.get(path));
    expect(memory.names()).toEqual(tabler.names());
    expect(memory.icon("server")).toEqual(tabler.icon("server"));
    expect(memory.loaded).toBe(true);
    // Before its files arrive, the pack says so: an icon it lacks may still come.
    expect(new TablerPack(() => undefined).loaded).toBe(false);
  });

  it("suggests close names for misspelt icons", () => {
    const found = new IconRegistry([tabler]).lookup("tabler:servr");
    expect(found.status).toBe("unknown-icon");
    if (found.status === "unknown-icon") expect(found.suggestions).toContain("tabler:server");
  });
});

describe("project packs", () => {
  const iconify = new IconifyPack(
    {
      prefix: "brand",
      width: 24,
      height: 24,
      icons: {
        logo: { body: '<path fill="currentColor" d="M2 2h20v20H2z"/>' },
        mark: { body: '<circle cx="12" cy="12" r="10"/>' },
      },
      aliases: { symbol: { parent: "mark" } },
      categories: { Brand: ["logo"] },
      info: {
        name: "Brand",
        version: "2.0.0",
        license: { spdx: "CC-BY-4.0", title: "CC BY 4.0" },
        author: { name: "Acme" },
      },
    },
    "assets/icons/brand.json",
  );

  it("takes Iconify metadata, aliases and categories", () => {
    expect(iconify.metadata).toMatchObject({
      license: "CC-BY-4.0",
      version: "2.0.0",
      author: "Acme",
      title: "Brand",
    });
    expect(iconify.names()).toEqual(["logo", "mark", "symbol"]);
    expect(iconify.icon("symbol")).toEqual(iconify.icon("mark"));
    expect(iconify.keywords("logo")).toEqual(["Brand"]);
  });

  it("lets licence entries override metadata", () => {
    const pack = new IconifyPack(
      { prefix: "p", icons: {}, info: { license: { spdx: "MIT" } } },
      "x",
      {
        license: "LicenseRef-Other",
        redistribute: false,
        opticalScale: 0.9,
      },
    );
    expect(pack.metadata).toMatchObject({ license: "LicenseRef-Other", redistribute: false });
    expect(packRatio(pack)).toBe(0.9);
  });

  it("scales edge-to-edge packs down to Tabler's share", () => {
    const full = new SvgFolderPack(
      "full",
      new Map([["a", '<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#f00"/></svg>']]),
      metadata("assets/icons/full"),
    );
    const registry = new IconRegistry([full]);
    expect(registry.resolve("full:a")!.scale).toBeCloseTo(20 / 24, 3);
    expect(registry.resolve("full:a")!.geometry.monochrome).toBe(false);
  });

  it("reports unusable icons and unknown packs", () => {
    const bad = new SvgFolderPack(
      "bad",
      new Map([["x", "<svg viewBox='0 0 1 1'><script/></svg>"]]),
      metadata("b"),
    );
    const registry = new IconRegistry([bad, tabler], { cloud: "bad" });
    expect(registry.lookup("cloud:x").status).toBe("unusable");
    const unknown = registry.lookup("azure:vm");
    expect(unknown).toMatchObject({
      status: "unknown-pack",
      prefix: "azure",
      packs: ["bad", "cloud", "tabler"],
    });
  });
});

describe("search", () => {
  const registry = new IconRegistry([tabler]);

  it("puts exact names first and matches tags", () => {
    const found = searchIcons(registry, "database");
    expect(found[0]).toBe("tabler:database");
    expect(found.length).toBe(50);
  });

  it("needs every word and honours the limit", () => {
    const found = searchIcons(registry, "cloud upload", 3);
    expect(found[0]).toBe("tabler:cloud-upload");
    expect(found.length).toBeLessThanOrEqual(3);
    expect(searchIcons(registry, "   ")).toEqual([]);
  });

  it("leaves out the icons the sanitiser refuses, and still fills the limit", () => {
    const pack = new IconifyPack(
      {
        prefix: "mixed",
        width: 24,
        height: 24,
        icons: {
          "cloud-masked": {
            body: '<mask id="m"><rect width="24" height="24" fill="#fff"/></mask><path mask="url(#m)" d="M2 2h20v20H2z"/>',
          },
          "cloud-clipped": {
            body: '<clipPath id="c"><rect width="12" height="12"/></clipPath><path clip-path="url(#c)" d="M2 2h20v20H2z"/>',
          },
          "cloud-reused": { body: '<path id="p" d="M2 2h20v20H2z"/><use href="#p"/>' },
          "cloud-plain": { body: '<path d="M2 2h20v20H2z"/>' },
          "cloud-round": { body: '<circle cx="12" cy="12" r="10"/>' },
        },
      },
      "assets/icons/mixed.json",
    );
    const mixed = new IconRegistry([pack]);
    expect(searchIcons(mixed, "cloud")).toEqual(["mixed:cloud-plain", "mixed:cloud-round"]);
    expect(searchIcons(mixed, "cloud", 1)).toEqual(["mixed:cloud-plain"]);
    expect(drawableNames(pack, 5)).toEqual(["cloud-plain", "cloud-round"]);
    expect(drawable(pack, "cloud-masked")).toBe(false);
    expect(drawable(pack, "no-such-icon")).toBe(false);
    // A misspelt name is not pointed at an icon that cannot be drawn either.
    expect(mixed.lookup("mixed:cloud-plan")).toMatchObject({ suggestions: ["mixed:cloud-plain"] });
    expect(mixed.lookup("mixed:cloud-maskd")).toMatchObject({ suggestions: [] });
  });

  it("never offers a logo drawn with a mask, a clip path or a reuse", () => {
    const all = new IconRegistry(createNodeIconPacks());
    const refused = {
      "google drive": "logos:google-drive",
      apache: "logos:apache-camel",
      github: "logos:github-octocat",
      react: "logos:react-styleguidist",
      "microsoft teams": "logos:microsoft-teams",
      less: "logos:less",
    };
    for (const [query, reference] of Object.entries(refused)) {
      expect(all.lookup(reference).status, reference).toBe("unusable");
      const found = searchIcons(all, query, 60);
      expect(found, query).not.toContain(reference);
      expect(found.length, query).toBeGreaterThan(0);
      for (const offered of found) expect(all.lookup(offered).status, offered).toBe("found");
    }
    const google = searchIcons(all, "google", 60);
    expect(google).toHaveLength(60);
    expect(google.filter((r) => all.lookup(r).status !== "found")).toEqual([]);
    const misspelt = all.lookup("logos:google-drivee");
    expect(misspelt.status).toBe("unknown-icon");
    if (misspelt.status === "unknown-icon") {
      expect(misspelt.suggestions).not.toContain("logos:google-drive");
    }
  });
});

describe("hashes and locks", () => {
  it("computes SHA-256 test vectors", () => {
    const hex = (text: string) => toHex(sha256(new TextEncoder().encode(text)));
    expect(hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
    expect(integrityOf(new TextEncoder().encode("abc"))).toBe(
      "sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
    );
  });

  it("hashes folders independently of listing order", () => {
    const a = new Map([
      ["b.svg", new Uint8Array([2])],
      ["a.svg", new Uint8Array([1])],
    ]);
    const b = new Map([...a].reverse());
    expect(folderIntegrity(a)).toBe(folderIntegrity(b));
  });

  it("formats locks with sorted keys and lists changes", () => {
    const lock: AssetLock = {
      lockVersion: 1,
      icons: {
        z: { version: "1", source: "s", license: "MIT", integrity: "x" },
        a: { version: null, source: "built-in", license: "MIT" },
      },
      fonts: {},
    };
    const text = formatLock(lock);
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"z"'));
    expect(text.endsWith("}\n")).toBe(true);
    expect(formatLock(JSON.parse(text))).toBe(text);
    const changed: AssetLock = {
      ...lock,
      icons: { ...lock.icons, z: { ...lock.icons.z!, integrity: "y" }, n: lock.icons.a! },
    };
    expect(compareLocks(lock, changed)).toEqual([
      "icon pack `n` is not in the lock",
      "icon pack `z` changed content",
    ]);
  });
});

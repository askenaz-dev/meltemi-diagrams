import { describe, expect, it } from "vitest";
import {
  IconRegistry,
  IconifyPack,
  LazyIconifyPack,
  builtInPacks,
  librariesOf,
  packLibrary,
  parseLibrary,
  searchIcons,
  searchLibraries,
} from "../src/index.js";
import { createNodeAssetReader, createNodeIconPacks, createNodeLibraries } from "../src/node.js";

const SQUARE = { body: '<rect width="16" height="16" fill="#0f0"/>', width: 16, height: 16 };

describe("library files", () => {
  it("read a library with its categories and items", () => {
    const parsed = parseLibrary(
      JSON.stringify({
        id: "shapes",
        title: "Shapes",
        categories: [
          { id: "basic", title: "Basic", items: [{ icon: "tabler:server", label: "Server" }] },
          { title: "Data stores", items: [{ icon: "tabler:database", label: "DB", kind: "data" }] },
        ],
      }),
      "assets/libraries/shapes.json",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.library.categories.map((c) => c.id)).toEqual(["basic", "data-stores"]);
    expect(parsed.library.categories[1]!.items[0]).toEqual({
      icon: "tabler:database",
      label: "DB",
      kind: "data",
    });
    expect(parsed.library.source).toBe("assets/libraries/shapes.json");
  });

  it("refuse what is not a library, naming the reason", () => {
    const reason = (text: string) => {
      const parsed = parseLibrary(text, "x.json");
      return parsed.ok ? "ok" : parsed.reason;
    };
    expect(reason("{")).toMatch(/not JSON/);
    expect(reason('{"id":"Shapes","title":"S","categories":[]}')).toMatch(/`id`/);
    expect(reason('{"id":"s","title":"S"}')).toMatch(/`categories`/);
    expect(
      reason(
        '{"id":"s","title":"S","categories":[{"id":"a","title":"A","items":[{"icon":"nope","label":"x"}]}]}',
      ),
    ).toMatch(/needs an icon/);
    expect(
      reason(
        '{"id":"s","title":"S","categories":[{"id":"a","title":"A","items":[]},{"id":"a","title":"B","items":[]}]}',
      ),
    ).toMatch(/unique/);
  });
});

describe("libraries of packs", () => {
  const pack = new IconifyPack(
    {
      prefix: "shapes",
      icons: { "api-gateway": SQUARE, lambda: SQUARE, bucket: SQUARE },
      categories: { Compute: ["lambda"], Networking: ["api-gateway"] },
      labels: { lambda: "AWS Lambda" },
      info: { name: "Shapes" },
    },
    "assets/icons/shapes.json",
  );

  it("come from the pack's categories, with its labels", () => {
    const library = packLibrary(pack)!;
    expect(library.id).toBe("shapes");
    expect(library.title).toBe("Shapes");
    expect(library.categories.map((c) => [c.id, c.title, c.items])).toEqual([
      ["compute", "Compute", [{ icon: "shapes:lambda", label: "AWS Lambda" }]],
      ["networking", "Networking", [{ icon: "shapes:api-gateway", label: "Api Gateway" }]],
    ]);
    expect(pack.label("api-gateway")).toBe("Api Gateway");
    // Icons outside every category are reachable through search and the picker only.
    expect(pack.categories().get("Compute")).toEqual(["lambda"]);
  });

  it("list files first, then packs with categories that have no file", () => {
    const file = parseLibrary(
      '{"id":"tech","title":"Technology","categories":[{"id":"db","title":"Databases","items":[{"icon":"shapes:bucket","label":"Bucket"}]}]}',
      "built-in",
    );
    if (!file.ok) throw new Error(file.reason);
    const registry = new IconRegistry([pack]);
    expect(librariesOf(registry, [file.library]).map((l) => l.id)).toEqual(["tech", "shapes"]);
    // A file named as a pack replaces the pack's own library.
    const own = { ...file.library, id: "shapes" };
    expect(librariesOf(registry, [own]).map((l) => l.id)).toEqual(["shapes"]);
  });

  it("search labels and names across libraries", () => {
    const registry = new IconRegistry([pack]);
    const libraries = librariesOf(registry, []);
    const found = searchLibraries(libraries, registry, "lamb");
    expect(found.map((m) => m.item.label)).toEqual(["AWS Lambda"]);
    expect(searchLibraries(libraries, registry, "gateway api").map((m) => m.item.icon)).toEqual([
      "shapes:api-gateway",
    ]);
    expect(searchLibraries(libraries, registry, "")).toEqual([]);
  });
});

describe("built-in packs", () => {
  it("resolve the provider icons with their labels and categories under Node", () => {
    const registry = new IconRegistry(createNodeIconPacks());
    expect(registry.list().map((p) => p.prefix)).toEqual([
      "aws",
      "azure",
      "gcp",
      "kubernetes",
      "logos",
      "tabler",
    ]);
    for (const reference of [
      "aws:lambda",
      "azure:virtual-machine",
      "gcp:cloud-run",
      "kubernetes:pod",
      "logos:postgresql",
      "tabler:server",
    ]) {
      expect(registry.lookup(reference).status, reference).toBe("found");
    }
    const aws = registry.pack("aws")!;
    expect(aws.label("lambda")).toBe("AWS Lambda");
    expect(aws.categories().get("Compute")).toContain("lambda");
    expect(aws.metadata).toMatchObject({
      title: "AWS Architecture Icons",
      license: "LicenseRef-AWS-Architecture-Icons",
      redistribute: false,
    });
    expect(aws.metadata.terms).toMatch(/architecture diagrams/);
    expect(registry.pack("kubernetes")!.metadata).toMatchObject({
      license: "Apache-2.0",
      redistribute: true,
    });
    expect(registry.pack("kubernetes")!.label("sts")).toBe("StatefulSet");
    expect(registry.pack("gcp")!.label("cloud-run")).toBe("Cloud Run");
    expect(registry.pack("tabler")!.categories().get("Devices")).toContain("server");
  });

  it("keep the vendor's colours in the icons", () => {
    const registry = new IconRegistry(createNodeIconPacks());
    const lambda = registry.lookup("aws:lambda");
    expect(lambda.status).toBe("found");
    if (lambda.status !== "found") return;
    const paints = lambda.icon.geometry.paths.map((p) => JSON.stringify(p.fill));
    expect(paints.some((p) => /#ED7100|#ed7100/i.test(p))).toBe(true);
  });

  it("read a pack the first time it is used, and again until it is there", () => {
    const read = createNodeAssetReader();
    let available = false;
    const lazy = new LazyIconifyPack("kubernetes", () =>
      available ? read("icons/kubernetes.json") : undefined,
    );
    expect(lazy.loaded).toBe(false);
    expect(lazy.has("pod")).toBe(false);
    expect(lazy.metadata.title).toBe("kubernetes");
    available = true;
    expect(lazy.has("pod")).toBe(true);
    expect(lazy.loaded).toBe(true);
    expect(lazy.metadata.title).toBe("Kubernetes icons");
    const packs = builtInPacks(read);
    expect(packs.map((p) => p.prefix)).toEqual([
      "tabler",
      "aws",
      "azure",
      "gcp",
      "kubernetes",
      "logos",
    ]);
  });

  it("keep a built-in pack's name and licence once it is read, when its file has none", () => {
    const read = createNodeAssetReader();
    const logos = builtInPacks(read).find((p) => p.prefix === "logos")!;
    const known = { title: "SVG Logos", license: "CC0-1.0", author: "Gil Barbara" };
    expect(logos.metadata).toMatchObject(known);
    expect(logos.loaded).toBe(false);
    // The logos' file carries no `info`: the index's stands in for it.
    expect(logos.has("react")).toBe(true);
    expect(logos.loaded).toBe(true);
    expect(logos.metadata).toMatchObject(known);
    // A file that says more keeps its own words.
    const index = { info: { name: "Old name", version: "0" } };
    const lazy = new LazyIconifyPack("kubernetes", () => read("icons/kubernetes.json"), index);
    expect(lazy.metadata.title).toBe("Old name");
    expect(lazy.has("pod")).toBe(true);
    expect(lazy.metadata).toMatchObject({ title: "Kubernetes icons", version: "2026-10-14" });
  });

  it("put the general-purpose icon first when a provider has one of the same name", () => {
    const registry = new IconRegistry(createNodeIconPacks());
    const found = searchIcons(registry, "server", 5);
    expect(found[0]).toBe("tabler:server");
    expect(found).toContain("aws:server");
  });

  it("ship the Technology library over the logos", () => {
    const libraries = createNodeLibraries();
    expect(libraries.map((l) => l.id)).toEqual(["tech"]);
    const registry = new IconRegistry(createNodeIconPacks());
    const databases = libraries[0]!.categories.find((c) => c.id === "databases")!;
    expect(databases.items.some((i) => i.icon === "logos:postgresql")).toBe(true);
    for (const category of libraries[0]!.categories) {
      for (const item of category.items) {
        expect(registry.lookup(item.icon).status, item.icon).toBe("found");
      }
    }
    const all = librariesOf(registry, libraries).map((l) => l.id);
    expect(all).toEqual(["tech", "aws", "azure", "gcp", "kubernetes", "tabler"]);
  });
});

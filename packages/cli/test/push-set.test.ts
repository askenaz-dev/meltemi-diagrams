import { createHash } from "node:crypto";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readManifest, toProjectPath } from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import {
  collisionLosers,
  insideFolder,
  pathProblem,
  printablePath,
  setProblems,
} from "../src/cloud-paths.js";
import { withCloudField } from "../src/cloud-manifest.js";
import {
  compareWithCloud,
  kindOfPath,
  limitError,
  planPush,
  readPushSet,
  type CloudState,
} from "../src/push-set.js";
import { MANIFEST, Scratch, png, sheet } from "./cloud-fixtures.js";

const scratch = new Scratch();
afterAll(() => rmSync(scratch.root, { recursive: true, force: true }));

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** The push set of a folder, with its manifest read as the command reads it. */
function read(files: Record<string, string | Buffer>) {
  const folder = scratch.folder(files);
  const manifest = readManifest(createNodeHost(), toProjectPath(folder), {
    toolVersion: "1.7.0",
  }).manifest;
  return { folder, set: readPushSet(folder, manifest) };
}

describe("the path rule for a cloud path", () => {
  it("accepts what the cloud keeps and refuses everything the rule names", () => {
    for (const ok of ["diagrams/flow.meltemi", "a b/c (1)+d@e-f_g.md", "console.md", "lpt10.md"]) {
      expect(pathProblem(ok), ok).toBeUndefined();
    }
    for (const bad of [
      "../secrets.meltemi",
      ".git/hooks/post-checkout",
      "a\\b.meltemi",
      "a//b",
      "./a",
      "a:b",
      "/etc/passwd",
      "a\u0001b",
      "café",
      "a/b/c/d/e/f/g/h/i/j/k/l/m",
      "~tilde",
      "x~k4c2w7x5q3y6m2n5",
    ]) {
      expect(pathProblem(bad), bad).toBe("rule");
    }
  });

  it("refuses the names Windows cannot keep", () => {
    for (const name of [
      "con",
      "CON.txt",
      "prn.md",
      "aux",
      "nul.tar.gz",
      "com1",
      "LPT9.x",
      "dir/Nul",
    ]) {
      expect(pathProblem(name), name).toBe("windows-name");
    }
    for (const name of ["a.", "dir./x", "a ", "dir /x"]) {
      expect(pathProblem(name), name).toBe("windows-dot");
    }
  });

  it("finds the paths of a set that cannot sit beside the others", () => {
    const problems = setProblems([
      "B.md",
      "a.md",
      "b.md",
      "docs",
      "Docs/x.md",
      "docs/y.md",
      "ok.md",
    ]);
    expect([...problems]).toEqual([
      ["b.md", "letter-case"],
      ["docs", "file-and-folder"],
    ]);
    expect(setProblems(["a.md", "a/b.md"]).get("a.md")).toBeUndefined();
    expect(setProblems(["a.md", "a.md/b.md"]).get("a.md")).toBe("file-and-folder");
  });

  it("resolves inside the folder or says it does not", () => {
    const folder = join(scratch.root, "inside");
    expect(insideFolder(folder, "a/b.md")).toBe(join(folder, "a", "b.md"));
    expect(insideFolder(folder, "../x.meltemi")).toBeUndefined();
    expect(insideFolder(folder, "a/../../x")).toBeUndefined();
    expect(insideFolder(folder, "a/..")).toBeUndefined();
    expect(insideFolder(folder, ".")).toBeUndefined();
    expect(insideFolder(folder, "..hidden/file")).toBe(join(folder, "..hidden", "file"));
  });

  it("knows the losers of a name collision, listed or shaped like one, and writes control characters escaped", () => {
    const losers = collisionLosers(
      [
        "a.md",
        "a.md~k4c2w7x5q3y6m2n5",
        "x/y.md~abcdefghijklmnop",
        "../z.md~abcdefghijklmnop",
        "b~short",
      ],
      [{ path: "q.md", shown: "q.md~zzzzzzzzzzzzzzzz" }, "not an object", null, { shown: 3 }],
    );
    expect([...losers].sort()).toEqual([
      "a.md~k4c2w7x5q3y6m2n5",
      "q.md~zzzzzzzzzzzzzzzz",
      "x/y.md~abcdefghijklmnop",
    ]);
    expect(printablePath("a\u001b[2Jb\u0085c\nd")).toBe("a\\u001b[2Jb\\u0085c\\u000ad");
    expect(printablePath("plain/é.md")).toBe("plain/é.md");
  });
});

describe("the manifest's cloud field", () => {
  it("is one line in the file's own style, replaced when it is there, and keeps a byte order mark", () => {
    const crlf = '{\r\n    "name": "Shop"\r\n}\r\n';
    expect(withCloudField(crlf, "http://127.0.0.1:1", "a".repeat(20))).toBe(
      `{\r\n    "name": "Shop",\r\n    "cloud": { "host": "http://127.0.0.1:1", "project": "${"a".repeat(20)}" }\r\n}\r\n`,
    );
    const once = withCloudField(MANIFEST, "http://127.0.0.1:1", "a".repeat(20));
    expect(withCloudField(once, "http://127.0.0.1:1", "a".repeat(20))).toBe(once);
    expect(withCloudField(once, "http://127.0.0.1:2", "b".repeat(20))).toBe(
      `{\n  "name": "Shop",\n  "language": "0.2",\n  "cloud": { "host": "http://127.0.0.1:2", "project": "${"b".repeat(20)}" }\n}\n`,
    );
    const bom = String.fromCharCode(0xfeff);
    expect(withCloudField(`${bom}${MANIFEST}`, "http://x.test", "c".repeat(20))).toBe(
      `${bom}${withCloudField(MANIFEST, "http://x.test", "c".repeat(20))}`,
    );
    expect(() => withCloudField("[1]", "http://x.test", "c".repeat(20))).toThrow();
    expect(() => withCloudField("{ not json", "http://x.test", "c".repeat(20))).toThrow();
  });
});

describe("the kinds of file the cloud keeps", () => {
  it("keeps text by content (SVG too), images and fonts by hash, and nothing else", () => {
    for (const path of ["a.meltemi", "project.json", "n.md", "n.TXT", "s.svg", "c.css"]) {
      expect(kindOfPath(path), path).toBe("text");
    }
    for (const path of [
      "a.png",
      "a.PNG",
      "a.jpg",
      "a.jpeg",
      "a.gif",
      "a.webp",
      "f.woff2",
      "f.ttf",
      "f.otf",
    ]) {
      expect(kindOfPath(path), path).toBe("binary");
    }
    for (const path of ["a.pdf", "f.woff", "noextension", "dir.v2/file", "a.zip"]) {
      expect(kindOfPath(path), path).toBeUndefined();
    }
  });
});

describe("the push set of a folder", () => {
  it("is the project's files: text by content, images and fonts by hash, in path order", () => {
    const logo = png("logo");
    const { set } = read({
      "project.json": MANIFEST,
      "b/two.meltemi": sheet("Two"),
      "a/one.meltemi": sheet("One"),
      "notes.md": "# Notes\r\nwith CRLF\r\n",
      "assets/logo.png": logo,
      "fonts/Body.woff2": Buffer.from("wOF2"),
    });
    expect([...set.texts.keys()].sort()).toEqual([
      "a/one.meltemi",
      "b/two.meltemi",
      "notes.md",
      "project.json",
    ]);
    // Content is exact: line endings included.
    expect(set.texts.get("notes.md")).toBe("# Notes\r\nwith CRLF\r\n");
    expect([...set.binaries.keys()].sort()).toEqual(["assets/logo.png", "fonts/Body.woff2"]);
    expect(set.binaries.get("assets/logo.png")).toMatchObject({
      hash: sha(logo),
      size: logo.length,
    });
    expect(set.notSent).toEqual([]);
    expect(set.ignored).toEqual([]);
    expect(limitError(set)).toBeUndefined();
  });

  it("leaves out hidden names, node_modules, the manifest's exclude and the catalog output", () => {
    const manifest =
      '{\n  "name": "S",\n  "language": "0.2",\n  "exclude": ["old", "x/skip.md"],\n  "catalog": { "out": "site" }\n}\n';
    const { set } = read({
      "project.json": manifest,
      "keep.meltemi": sheet(),
      ".git/config": "x",
      ".env": "x",
      "node_modules/a/b.json": "{}",
      "deep/node_modules/c.md": "x",
      "old/a.meltemi": sheet(),
      "x/skip.md": "x",
      "x/keep.md": "x",
      "site/index.md": "x",
      "catalog/kept.md": "x",
    });
    expect([...set.texts.keys()].sort()).toEqual([
      "catalog/kept.md",
      "keep.meltemi",
      "project.json",
      "x/keep.md",
    ]);
    expect(set.holds("old/a.meltemi")).toBe(true);
    expect(set.holds("site/anything.md")).toBe(true);
    expect(set.holds(".github/workflows/x.md")).toBe(true);
    expect(set.holds("keep.meltemi")).toBe(false);
  });

  it("does not follow a link out of the folder, and lists it as not kept", () => {
    const outside = scratch.folder({ "secret.md": "outside" });
    const { folder, set: before } = read({ "a.meltemi": sheet() });
    expect(before.ignored).toEqual([]);
    try {
      symlinkSync(outside, join(folder, "linked"), "junction");
      symlinkSync(join(outside, "secret.md"), join(folder, "secret.md"), "file");
    } catch {
      return;
    }
    const set = readPushSet(folder, null);
    expect([...set.texts.keys()]).toEqual(["a.meltemi"]);
    expect(set.ignored.sort()).toEqual(["linked", "secret.md"]);
    expect(set.holds("secret.md")).toBe(true);
  });

  it("holds everything under a linked folder, so the cloud's copies of it are never deleted", () => {
    const outside = scratch.folder({ "secret.md": "outside" });
    const { folder } = read({ "a.meltemi": sheet() });
    try {
      symlinkSync(outside, join(folder, "shared"), "junction");
    } catch {
      return;
    }
    const set = readPushSet(folder, null);
    expect(set.ignored).toEqual(["shared"]);
    expect(set.holds("shared")).toBe(true);
    expect(set.holds("shared/overview.meltemi")).toBe(true);
    expect(set.holds("shared/deep/x.md")).toBe(true);
    // A name that merely starts the same is another path.
    expect(set.holds("shared-two/overview.meltemi")).toBe(false);
    expect(set.holds("a.meltemi")).toBe(false);
  });

  it("reports what it cannot send, and lists what the cloud does not keep", () => {
    const { folder, set } = read({
      "ok.meltemi": sheet(),
      "Café.md": "x",
      "Ñ/inside.md": "x",
      "a~b.md": "x",
      "report.pdf": "x",
      "f.woff": "x",
    });
    writeFileSync(join(folder, "latin1.md"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    const again = readPushSet(folder, null);
    expect(again.notSent.map((item) => `${item.path}:${item.reason}`).sort()).toEqual(
      ["Café.md:path", "a~b.md:path", "latin1.md:encoding", "Ñ/:path"].sort(),
    );
    expect(again.ignored.sort()).toEqual(["f.woff", "report.pdf"]);
    expect([...again.texts.keys()]).toEqual(["ok.meltemi"]);
    // The same set, read before latin1.md existed, has one problem less.
    expect(set.notSent).toHaveLength(3);
    expect(again.holds("latin1.md")).toBe(true);
    expect(again.holds("Ñ/inside.md")).toBe(true);
  });

  it("keeps a byte order mark and decodes nothing it cannot", () => {
    const bom = String.fromCharCode(0xfeff);
    const { set } = read({ "with-bom.md": `${bom}hello` });
    expect(set.texts.get("with-bom.md")).toBe(`${bom}hello`);
  });

  it("refuses over a limit before anything is sent, with the service's code and the path", () => {
    const text = read({ "big.md": "a".repeat(2 * 1024 * 1024 + 1) }).set;
    expect(limitError(text)).toMatchObject({ code: "doc.too-large", details: { path: "big.md" } });
    const huge = read({ "dump.md": Buffer.alloc(8 * 1024 * 1024 + 1, 97) }).set;
    expect(huge.overLimit).toEqual([{ path: "dump.md", code: "doc.too-large" }]);
    const image = read({ "a/huge.png": Buffer.alloc(10 * 1024 * 1024 + 1) }).set;
    expect(limitError(image)).toMatchObject({
      code: "quota.binary",
      details: { path: "a/huge.png" },
    });
    const exact = read({ "a/limit.png": Buffer.alloc(10 * 1024 * 1024) }).set;
    expect(limitError(exact)).toBeUndefined();
    const folder = scratch.folder();
    for (let i = 0; i < 2001; i++) writeFileSync(join(folder, `f${i}.md`), "x");
    expect(limitError(readPushSet(folder, null))).toMatchObject({ code: "quota.files" });
    const two = scratch.folder();
    mkdirSync(join(two, "d"));
    for (let i = 0; i < 2000; i++) writeFileSync(join(two, "d", `f${i}.md`), "x");
    expect(limitError(readPushSet(two, null))).toBeUndefined();
    const parts: Record<string, string> = {};
    for (let i = 0; i < 9; i++) parts[`p${i}.md`] = "b".repeat(1_900_000);
    expect(limitError(read(parts).set)).toMatchObject({ code: "doc.too-large" });
  });
});

describe("comparing a push set with the cloud", () => {
  const cloud = (
    files: Record<string, string>,
    binaries: Record<string, string> = {},
    collisions: unknown[] = [],
  ): CloudState => ({ files, binaries, collisions });

  it("compares text by content and binaries by hash, and takes cloud-only paths as deletions", () => {
    const a = png("a");
    const { set } = read({
      "same.md": "same",
      "changed.md": "new",
      "added.md": "added",
      "same.png": a,
      "changed.png": png("new"),
      "added.png": png("added"),
    });
    const comparison = compareWithCloud(
      set,
      cloud(
        { "same.md": "same", "changed.md": "old", "gone.md": "gone" },
        { "same.png": sha(a), "changed.png": sha(png("old")), "gone.png": sha(png("gone")) },
      ),
    );
    expect(comparison.differences).toEqual([
      { path: "added.md", kind: "text", change: "added" },
      { path: "added.png", kind: "binary", change: "added" },
      { path: "changed.md", kind: "text", change: "changed" },
      { path: "changed.png", kind: "binary", change: "changed" },
      { path: "gone.md", kind: "text", change: "deleted" },
      { path: "gone.png", kind: "binary", change: "deleted" },
    ]);
    expect(comparison.left).toEqual([]);
    expect(compareWithCloud(set, cloud({}, {})).differences).toHaveLength(6);
  });

  it("reports a manifest that differs only by its cloud field as one changed path, and nothing else", () => {
    const { set } = read({ "project.json": MANIFEST, "a.meltemi": sheet() });
    const comparison = compareWithCloud(
      set,
      cloud({
        "project.json": withCloudField(MANIFEST, "http://x.test", "a".repeat(20)),
        "a.meltemi": sheet(),
      }),
    );
    expect(comparison.differences).toEqual([
      { path: "project.json", kind: "text", change: "changed" },
    ]);
  });

  it("is identical when the cloud holds exactly the set", () => {
    const { set } = read({ "a.meltemi": sheet(), "x.png": png("x") });
    const comparison = compareWithCloud(
      set,
      cloud({ "a.meltemi": sheet() }, { "x.png": sha(png("x")) }),
    );
    expect(comparison.differences).toEqual([]);
  });

  it("leaves alone the cloud's losers, what the folder leaves out and what it could not send; never a path the rule refuses", () => {
    const { folder } = read({});
    const manifest = readManifest(
      createNodeHost(),
      toProjectPath(
        scratch.folder({
          "project.json": '{ "name": "S", "language": "0.2", "exclude": ["drafts"] }',
        }),
      ),
      { toolVersion: "1.7.0" },
    ).manifest;
    writeFileSync(join(folder, "notes.md"), Buffer.from([0xe9]));
    writeFileSync(join(folder, "a.meltemi"), sheet());
    const set = readPushSet(folder, manifest);
    const comparison = compareWithCloud(
      set,
      cloud(
        {
          "a.meltemi": sheet(),
          "a.meltemi~k4c2w7x5q3y6m2n5": sheet("Loser"),
          "drafts/x.meltemi": sheet(),
          "notes.md": "from the page",
          "../x.meltemi": "evil",
          "removed.md": "bye",
        },
        {},
        [
          {
            path: "a.meltemi",
            keeper: "a",
            id: "k4c2w7x5q3y6m2n5",
            shown: "a.meltemi~k4c2w7x5q3y6m2n5",
          },
        ],
      ),
    );
    expect(comparison.differences).toEqual([
      { path: "removed.md", kind: "text", change: "deleted" },
    ]);
    expect(comparison.left).toEqual([
      { path: "../x.meltemi", why: "kept-out" },
      { path: "a.meltemi~k4c2w7x5q3y6m2n5", why: "collision" },
      { path: "drafts/x.meltemi", why: "kept-out" },
      { path: "notes.md", why: "kept-out" },
    ]);
  });

  it("plans only what differs: texts, hashes, deletions, and the other kind of a path that changed kind", () => {
    const fresh = png("fresh");
    const { set } = read({
      "same.md": "same",
      "edit.md": "new",
      "fresh.png": fresh,
      "was-binary.md": "now text",
      "was-text.png": png("now binary"),
    });
    const state = cloud(
      { "same.md": "same", "edit.md": "old", "gone.md": "gone", "was-text.png": "text before" },
      { "gone.png": sha("gone"), "was-binary.md": sha("binary before") },
    );
    const comparison = compareWithCloud(set, state);
    const plan = planPush(set, comparison, state);
    expect(plan.texts).toEqual({
      "edit.md": "new",
      "gone.md": null,
      "was-binary.md": "now text",
      "was-text.png": null,
    });
    expect(plan.binaries).toEqual({
      "fresh.png": sha(fresh),
      "gone.png": null,
      "was-binary.md": null,
      "was-text.png": sha(png("now binary")),
    });
    expect(plan.uploads.map((u) => u.path)).toEqual(["fresh.png", "was-text.png"]);
    expect(plan.uploads[0]!.binary.file).toBe(join(set.folder, "fresh.png"));
  });
});

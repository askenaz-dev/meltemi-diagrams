import { describe, expect, it } from "vitest";
import type { Outcome } from "../src/cloud/client.js";
import {
  HTML_MAX_BYTES,
  type Publication,
  type PublishApi,
  type PublishInfo,
  type Published,
  type Takedown,
} from "../src/cloud/publish-api.js";
import {
  HANDLE_MAX,
  HANDLE_MIN,
  PublishModel,
  SLUG_MAX,
  byteLength,
  checkHandle,
  checkSlug,
  defaultSlug,
  explainPublishing,
  slugify,
  type BuiltCatalog,
  type PublishHost,
  type PublishState,
} from "../src/cloud/publish-model.js";
import { shareView, type ShareState } from "../src/cloud/share-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const ID = "abcdefghij0123456789";
const HOST = "https://meltemi.page";

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code: string, message = "No."): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, code, message },
});

const CATALOG: BuiltCatalog = {
  html: '<!doctype html><meta charset="utf-8"><title>Purchase</title>',
  entries: 2,
  skipped: 0,
};

/** What the service holds, and how each call answers: a test changes either. */
class FakeService {
  handle: string | null = null;
  /** Handles other accounts hold. */
  taken = new Set<string>(["bob"]);
  publications: Publication[] = [];
  takedowns: Takedown[] = [];
  /** What each call was sent, in order. */
  log: string[] = [];
  sentHtml: string[] = [];
  override: Record<string, () => Outcome<unknown>> = {};
  clock = 0;

  private forced<T>(name: string): Outcome<T> | undefined {
    this.log.push(name);
    return this.override[name]?.() as Outcome<T> | undefined;
  }

  info = async (): Promise<Outcome<PublishInfo>> =>
    this.forced<PublishInfo>("info") ??
    ok({ handle: this.handle, publications: this.publications, takedowns: this.takedowns });

  setHandle = async (handle: string): Promise<Outcome<{ readonly handle: string }>> => {
    const forced = this.forced<{ readonly handle: string }>(`setHandle ${handle}`);
    if (forced) return forced;
    if (this.taken.has(handle)) return refused(409, "handle.taken");
    this.handle = handle;
    return ok({ handle });
  };

  publish = async (_id: string, slug: string, html: string): Promise<Outcome<Published>> => {
    const forced = this.forced<Published>(`publish ${slug}`);
    if (forced) return forced;
    if (this.handle === null) return refused(409, "handle.required");
    this.sentHtml.push(html);
    const at = `2026-10-14T1${this.clock++}:00:00.000Z`;
    const url = `${HOST}/${this.handle}/${slug}/`;
    this.publications = [
      ...this.publications.filter((p) => p.slug !== slug),
      { slug, url, publishedAt: at, bytes: byteLength(html) },
    ];
    return ok({ url, handle: this.handle, slug, bytes: byteLength(html), publishedAt: at });
  };

  unpublish = async (_id: string, slug: string): Promise<Outcome<null>> => {
    const forced = this.forced<null>(`unpublish ${slug}`);
    if (forced) return forced;
    if (!this.publications.some((p) => p.slug === slug)) return refused(404, "not-found");
    this.publications = this.publications.filter((p) => p.slug !== slug);
    return ok(null);
  };
}

interface Rig {
  readonly model: PublishModel;
  readonly service: FakeService;
  readonly states: PublishState[];
  readonly reports: string[];
  readonly copied: string[];
  readonly clipboard: { works: boolean };
  readonly builder: { catalog: () => Promise<BuiltCatalog>; built: number };
}

function rig(
  setup: (service: FakeService) => void = () => {},
  words: () => typeof en.cloud = () => en.cloud,
): Rig {
  const service = new FakeService();
  setup(service);
  const reports: string[] = [];
  const copied: string[] = [];
  const clipboard = { works: true };
  const builder = { catalog: async () => CATALOG, built: 0 };
  const api: PublishApi = {
    info: service.info,
    setHandle: service.setHandle,
    publish: service.publish,
    unpublish: service.unpublish,
  };
  const host: PublishHost = {
    api,
    build: () => {
      service.log.push("build");
      builder.built++;
      return builder.catalog();
    },
    copy: async (text) => {
      if (clipboard.works) copied.push(text);
      return clipboard.works;
    },
    report: (message) => reports.push(message),
  };
  const states: PublishState[] = [];
  const model = new PublishModel(host, ID, words, (state) => states.push(state));
  return { model, service, states, reports, copied, clipboard, builder };
}

describe("a handle", () => {
  it("is 3 to 30 lowercase letters, digits and hyphens, trimmed", () => {
    expect(checkHandle("  ana-2  ")).toEqual({ ok: true, value: "ana-2" });
    expect(checkHandle("abc")).toEqual({ ok: true, value: "abc" });
    expect(checkHandle("a".repeat(HANDLE_MAX))).toEqual({
      ok: true,
      value: "a".repeat(HANDLE_MAX),
    });
    expect([HANDLE_MIN, HANDLE_MAX]).toEqual([3, 30]);
  });

  it("is refused when empty, too short, too long or holding anything else", () => {
    expect(checkHandle("")).toEqual({ ok: false, reason: "empty" });
    expect(checkHandle("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkHandle("ab")).toEqual({ ok: false, reason: "short" });
    expect(checkHandle("a".repeat(HANDLE_MAX + 1))).toEqual({ ok: false, reason: "long" });
    for (const bad of ["Ana", "ana_b", "ana b", "ana.b", "ánaa", "ana/b", "ana!"]) {
      expect(checkHandle(bad)).toEqual({ ok: false, reason: "chars" });
    }
  });
});

describe("a slug", () => {
  it("is 1 to 60 lowercase letters, digits and hyphens, trimmed", () => {
    expect(checkSlug(" purchase-flow ")).toEqual({ ok: true, value: "purchase-flow" });
    expect(checkSlug("a")).toEqual({ ok: true, value: "a" });
    expect(checkSlug("-a-")).toEqual({ ok: true, value: "-a-" });
    expect(checkSlug("a".repeat(SLUG_MAX))).toEqual({ ok: true, value: "a".repeat(SLUG_MAX) });
  });

  it("is refused when empty, too long or holding anything else", () => {
    expect(checkSlug("")).toEqual({ ok: false, reason: "empty" });
    expect(checkSlug("a".repeat(SLUG_MAX + 1))).toEqual({ ok: false, reason: "long" });
    for (const bad of ["Purchase", "my page", "a_b", "a/b", "a.b", "pág"]) {
      expect(checkSlug(bad)).toEqual({ ok: false, reason: "chars" });
    }
  });

  it("is the project's name by default, as a slug", () => {
    expect(slugify("Purchase flow")).toBe("purchase-flow");
    expect(slugify("  Compra de la Gestión (v2)! ")).toBe("compra-de-la-gestion-v2");
    expect(slugify("---a---b---")).toBe("a-b");
    expect(slugify("Ünïcödé Ñandú")).toBe("unicode-nandu");
    expect(slugify("😀 🎉")).toBe("");
    // Cut at 60 without a hyphen left at the end.
    const long = slugify(`${"a".repeat(59)} b`);
    expect(long).toBe("a".repeat(59));
    expect(slugify("a".repeat(100))).toHaveLength(SLUG_MAX);
    for (const name of ["Purchase flow", "Gestión", "x y z", "a".repeat(80)]) {
      expect(checkSlug(slugify(name)).ok).toBe(true);
    }
  });

  it("falls back on the words' own name for a project whose name holds nothing to keep", () => {
    expect(defaultSlug("Purchase flow", en.cloud)).toBe("purchase-flow");
    expect(defaultSlug("😀", en.cloud)).toBe("project");
    expect(defaultSlug("😀", es.cloud)).toBe("proyecto");
    expect(checkSlug(es.cloud.publishing.defaultSlug).ok).toBe(true);
  });
});

describe("what is published", () => {
  it("is read: the handle, the pages and the takedowns", async () => {
    const r = rig((service) => {
      service.handle = "ana";
      service.publications = [
        { slug: "purchase", url: `${HOST}/ana/purchase/`, publishedAt: "", bytes: 10 },
      ];
      service.takedowns = [{ slug: "old", at: "2026-10-13T09:00:00.000Z", reason: "Spam" }];
    });
    expect(r.model.state.list).toBe("loading");
    await r.model.load();
    expect(r.model.state.list).toBe("ready");
    expect(r.model.state.handle).toBe("ana");
    expect(r.model.state.publications.map((p) => p.slug)).toEqual(["purchase"]);
    expect(r.model.state.takedowns).toEqual([
      { slug: "old", at: "2026-10-13T09:00:00.000Z", reason: "Spam" },
    ]);
  });

  it("says when it cannot be read, and reads again on request", async () => {
    const r = rig();
    r.service.override["info"] = () => ({ ok: false, failure: { kind: "unreachable", status: 0 } });
    await r.model.load();
    expect(r.model.state.list).toBe("failed");
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
    delete r.service.override["info"];
    await r.model.load();
    expect(r.model.state.list).toBe("ready");
    expect(r.model.state.problem).toBe("");
  });

  it("shows a takedown as removed by the service, with the reason when there is one", async () => {
    const r = rig((service) => {
      service.handle = "ana";
      service.takedowns = [
        { slug: "a", at: "2026-10-13T09:00:00.000Z", reason: "Spam" },
        { slug: "b", at: "", reason: null },
      ];
    });
    await r.model.load();
    const m = en.cloud.publishing;
    expect(m.removedTitle).toBe("Removed by the service");
    expect(m.removedByService("b", "")).toBe("b: removed by the service.");
    expect(m.removedByService("a", "Oct 13")).toBe("a: removed by the service on Oct 13.");
    expect(m.removedReason("Spam")).toBe("Reason: Spam");
    expect(r.model.state.takedowns.map((t) => [t.slug, t.reason])).toEqual([
      ["a", "Spam"],
      ["b", null],
    ]);
    expect(es.cloud.publishing.removedByService("a", "13 oct")).toBe(
      "a: retirada por el servicio el 13 oct.",
    );
  });
});

describe("publishing for the first time", () => {
  it("builds the page, chooses the handle, sends the HTML exactly as built and shows the address", async () => {
    const r = rig();
    await r.model.load();
    expect(r.model.state.handle).toBeNull();
    expect(await r.model.publish({ slug: "purchase", handle: "ana" })).toBe(true);
    // The order: the page is built and checked, then the handle is chosen, then the page is sent.
    expect(r.service.log).toEqual(["info", "build", "setHandle ana", "publish purchase"]);
    // The HTML is the builder's, byte for byte.
    expect(r.service.sentHtml).toEqual([CATALOG.html]);
    const state = r.model.state;
    expect(state.handle).toBe("ana");
    expect(state.published).toEqual({
      url: `${HOST}/ana/purchase/`,
      handle: "ana",
      slug: "purchase",
      bytes: byteLength(CATALOG.html),
      publishedAt: "2026-10-14T10:00:00.000Z",
    });
    expect(state.publications.map((p) => [p.slug, p.url])).toEqual([
      ["purchase", `${HOST}/ana/purchase/`],
    ]);
    expect(state.status).toBe("Published purchase.");
    expect(r.reports.at(-1)).toBe("Published purchase.");
    expect(state.busy).toBe(false);
    expect(state.problem).toBe("");
  });

  it("asks nothing of the service for a handle that breaks the rule, and says why", async () => {
    const r = rig();
    await r.model.load();
    for (const [typed, text] of [
      ["", en.cloud.publishing.handleEmpty],
      ["ab", en.cloud.publishing.handleShort(3)],
      ["Ana", en.cloud.publishing.handleChars],
      ["a".repeat(31), en.cloud.publishing.handleLong(30)],
    ] as const) {
      expect(await r.model.publish({ slug: "purchase", handle: typed })).toBe(false);
      expect(r.model.state.handleProblem).toBe(text);
    }
    expect(r.service.log).toEqual(["info"]);
    expect(r.builder.built).toBe(0);
    expect(r.model.state.busy).toBe(false);
  });

  it("says a handle that is taken is already taken, and publishes nothing", async () => {
    const r = rig();
    await r.model.load();
    expect(await r.model.publish({ slug: "purchase", handle: "bob" })).toBe(false);
    expect(r.model.state.handleProblem).toBe("That handle is already taken. Try another.");
    expect(r.service.log).toEqual(["info", "build", "setHandle bob"]);
    expect(r.model.state.handle).toBeNull();
    expect(r.model.state.published).toBeUndefined();
    expect(r.model.state.busy).toBe(false);
    // Another handle goes through.
    expect(await r.model.publish({ slug: "purchase", handle: "ana" })).toBe(true);
    expect(r.model.state.handleProblem).toBe("");
  });

  it("says a handle the service finds invalid, and one that is locked", async () => {
    const r = rig();
    await r.model.load();
    r.service.override["setHandle new-one"] = () => refused(400, "handle.invalid");
    await r.model.publish({ slug: "purchase", handle: "new-one" });
    expect(r.model.state.handleProblem).toBe(en.cloud.publishing.handleInvalid);
    r.service.override["setHandle new-one"] = () => refused(409, "handle.locked");
    await r.model.publish({ slug: "purchase", handle: "new-one" });
    expect(r.model.state.handleProblem).toBe(en.cloud.publishing.handleLocked);
  });

  it("goes back to asking for the handle when the service says it is missing", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(409, "handle.required");
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.handle).toBeNull();
    expect(r.model.state.handleProblem).toBe(en.cloud.publishing.errors.handleRequired);
  });

  it("keeps a handle it chose when the page then could not be sent", async () => {
    const r = rig();
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(429, "publish.rate");
    expect(await r.model.publish({ slug: "purchase", handle: "ana" })).toBe(false);
    expect(r.model.state.handle).toBe("ana");
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.rate);
    // The second try needs no handle.
    delete r.service.override["publish purchase"];
    r.service.log.length = 0;
    expect(await r.model.publish({ slug: "purchase" })).toBe(true);
    expect(r.service.log).toEqual(["build", "publish purchase"]);
  });
});

describe("the slug", () => {
  it("is checked before anything is built, and the form stays as it was", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    for (const [typed, text] of [
      ["", en.cloud.publishing.slugEmpty],
      ["My Page", en.cloud.publishing.slugChars],
      ["a".repeat(61), en.cloud.publishing.slugLong(60)],
    ] as const) {
      expect(await r.model.publish({ slug: typed })).toBe(false);
      expect(r.model.state.slugProblem).toBe(text);
    }
    expect(r.service.log).toEqual(["info"]);
    expect(r.model.state.busy).toBe(false);
    expect(r.model.state.published).toBeUndefined();
  });

  it("is told while it is typed: what is wrong at once, nothing for an empty field", () => {
    const r = rig();
    expect(r.model.typedSlug("My Page")).toBe(false);
    expect(r.model.state.slugProblem).toBe(en.cloud.publishing.slugChars);
    expect(r.model.typedSlug("my-page")).toBe(true);
    expect(r.model.state.slugProblem).toBe("");
    expect(r.model.typedSlug("")).toBe(false);
    expect(r.model.state.slugProblem).toBe("");
    expect(r.model.typedHandle("A")).toBe(false);
    expect(r.model.state.handleProblem).toBe(en.cloud.publishing.handleChars);
    expect(r.model.typedHandle("ab")).toBe(false);
    expect(r.model.state.handleProblem).toBe(en.cloud.publishing.handleShort(3));
    expect(r.model.typedHandle("abc")).toBe(true);
    expect(r.model.state.handleProblem).toBe("");
  });
});

describe("a page that cannot be published", () => {
  const owner = (service: FakeService) => {
    service.handle = "ana";
  };

  it("is not sent, and takes no handle, when it is over 16 MiB", async () => {
    const r = rig();
    await r.model.load();
    // 8 Mi + 1 characters of two bytes each: the limit is on bytes, as sent.
    const html = "é".repeat(HTML_MAX_BYTES / 2 + 1);
    expect(html.length).toBeLessThan(HTML_MAX_BYTES);
    expect(byteLength(html)).toBe(HTML_MAX_BYTES + 2);
    r.builder.catalog = async () => ({ html, entries: 1, skipped: 0 });
    expect(await r.model.publish({ slug: "purchase", handle: "ana" })).toBe(false);
    expect(r.service.log).toEqual(["info", "build"]);
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.tooLarge(16));
    expect(r.model.state.problem).toContain("16 MiB");
    expect(r.model.state.handle).toBeNull();
    expect(r.model.state.busy).toBe(false);
    expect(r.model.state.publications).toEqual([]);
  });

  it("is sent when it is exactly 16 MiB", async () => {
    const r = rig(owner);
    await r.model.load();
    const html = "a".repeat(HTML_MAX_BYTES);
    r.builder.catalog = async () => ({ html, entries: 1, skipped: 0 });
    expect(await r.model.publish({ slug: "purchase" })).toBe(true);
    expect(r.service.sentHtml[0]).toHaveLength(HTML_MAX_BYTES);
  });

  it("is explained when the service says it is over the limit, and nothing changes", async () => {
    const r = rig(owner);
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(413, "publish.too-large");
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.problem).toBe(
      "The page is over 16 MiB, the most the service takes. Remove some images or diagrams and try again.",
    );
    expect(r.model.state.publications).toEqual([]);
    expect(r.model.state.published).toBeUndefined();
  });

  it("is explained when publications come too often", async () => {
    const r = rig(owner);
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(429, "publish.rate");
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.problem).toBe(
      "This project was published too many times in the last hour. Try again later.",
    );
    expect(r.reports.at(-1)).toBe(r.model.state.problem);
  });

  it("is explained when the service does not accept it, or the person is not the owner", async () => {
    const r = rig(owner);
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(400, "publish.invalid");
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.invalid);
    r.service.override["publish purchase"] = () => refused(403, "access.denied");
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.accessDenied);
  });

  it("says an answer it cannot read, and reads what the service holds", async () => {
    const r = rig(owner);
    await r.model.load();
    r.service.override["publish purchase"] = () => ({
      ok: false,
      failure: { kind: "unexpected", status: 200 },
    });
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.unexpected);
    expect(r.service.log.filter((entry) => entry === "info")).toHaveLength(2);
  });

  it("is not built into a page when the build fails or there is nothing to show", async () => {
    const r = rig(owner);
    await r.model.load();
    r.builder.catalog = async () => {
      throw new Error("the catalog script could not be fetched");
    };
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.buildFailed);
    r.builder.catalog = async () => ({ html: "<p>", entries: 0, skipped: 3 });
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.nothing);
    expect(r.service.log.filter((entry) => entry.startsWith("publish"))).toEqual([]);
    expect(r.model.state.busy).toBe(false);
  });

  it("says under the page name that another of the person's projects already publishes it, and a new name publishes", async () => {
    const r = rig(owner);
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(409, "publish.taken");
    expect(await r.model.publish({ slug: "purchase" })).toBe(false);
    expect(r.model.state.slugProblem).toBe(en.cloud.publishing.errors.taken);
    expect(r.model.state.problem).toBe("");
    expect(r.model.state.handleProblem).toBe("");
    expect(r.model.state.busy).toBe(false);
    expect(r.model.state.published).toBeUndefined();
    expect(r.model.state.publications).toEqual([]);
    expect(r.reports.at(-1)).toBe(en.cloud.publishing.errors.taken);
    // Typing another name takes the sentence away, and that name goes through.
    expect(r.model.typedSlug("purchase-two")).toBe(true);
    expect(r.model.state.slugProblem).toBe("");
    delete r.service.override["publish purchase"];
    expect(await r.model.publish({ slug: "purchase-two" })).toBe(true);
    expect(r.model.state.publications.map((p) => p.slug)).toEqual(["purchase-two"]);
  });

  it("keeps the handle it chose when the page name it asked for was taken", async () => {
    const r = rig();
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(409, "publish.taken");
    expect(await r.model.publish({ slug: "purchase", handle: "ana" })).toBe(false);
    expect(r.model.state.handle).toBe("ana");
    expect(r.model.state.handleProblem).toBe("");
    expect(r.model.state.slugProblem).toBe(en.cloud.publishing.errors.taken);
  });

  it("is explained in Spanish too", async () => {
    const r = rig(owner, () => es.cloud);
    await r.model.load();
    r.service.override["publish purchase"] = () => refused(413, "publish.too-large");
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.problem).toContain("16 MiB");
    expect(r.model.state.problem).toContain("supera");
    await r.model.publish({ slug: "Mala" });
    expect(r.model.state.slugProblem).toBe(es.cloud.publishing.slugChars);
    r.service.override["publish compra"] = () => refused(409, "publish.taken");
    await r.model.publish({ slug: "compra" });
    expect(r.model.state.slugProblem).toBe(es.cloud.publishing.errors.taken);
    expect(es.cloud.publishing.errors.taken).toContain("Otro de tus proyectos");
  });

  it("is told apart by code, and any other refusal is the service's own words", () => {
    const f = (status: number, code?: string, message?: string) =>
      explainPublishing(
        {
          kind: "refused",
          status,
          ...(code ? { code } : {}),
          ...(message ? { message } : {}),
        },
        en.cloud,
      );
    expect(f(413, "publish.too-large")).toBe(en.cloud.publishing.errors.tooLarge(16));
    expect(f(429, "publish.rate")).toBe(en.cloud.publishing.errors.rate);
    expect(f(409, "publish.taken")).toBe(en.cloud.publishing.errors.taken);
    expect(f(409, "publish.taken")).toBe(
      "Another of your projects already publishes a page with that name. Choose another name.",
    );
    expect(f(403)).toBe(en.cloud.publishing.errors.accessDenied);
    expect(f(404, "project.not-found")).toBe(en.cloud.errors.notFound);
    expect(f(500, "internal", "Oops")).toBe("Oops (internal)");
  });
});

describe("a skipped diagram", () => {
  it("is said after publishing, as the export says it", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    r.builder.catalog = async () => ({ ...CATALOG, skipped: 1 });
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.status).toBe(
      "Published purchase. 1 diagram could not be drawn and is left out.",
    );
    r.builder.catalog = async () => ({ ...CATALOG, skipped: 2 });
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.status).toBe(
      "Published purchase. 2 diagrams could not be drawn and are left out.",
    );
  });
});

describe("publishing again", () => {
  const published = (service: FakeService) => {
    service.handle = "ana";
    service.publications = [
      { slug: "purchase", url: `${HOST}/ana/purchase/`, publishedAt: "2026-10-01", bytes: 5 },
      { slug: "other", url: `${HOST}/ana/other/`, publishedAt: "2026-10-02", bytes: 6 },
    ];
  };

  it("replaces the page that has the slug, with no handle to ask", async () => {
    const r = rig(published);
    await r.model.load();
    expect(await r.model.publish({ slug: "purchase" })).toBe(true);
    expect(r.service.log).toEqual(["info", "build", "publish purchase"]);
    expect(r.model.state.publications.map((p) => p.slug).sort()).toEqual(["other", "purchase"]);
    expect(r.model.state.publications.find((p) => p.slug === "purchase")?.publishedAt).toBe(
      "2026-10-14T10:00:00.000Z",
    );
  });

  it("ignores a handle typed by someone who already has one", async () => {
    const r = rig(published);
    await r.model.load();
    await r.model.publish({ slug: "other", handle: "somebody-else" });
    expect(r.service.log.some((entry) => entry.startsWith("setHandle"))).toBe(false);
    expect(r.model.state.handle).toBe("ana");
  });

  it("clears a takedown of the slug it published", async () => {
    const r = rig((service) => {
      published(service);
      service.takedowns = [{ slug: "purchase", at: "2026-10-13", reason: null }];
    });
    await r.model.load();
    expect(r.model.state.takedowns).toHaveLength(1);
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.takedowns).toEqual([]);
  });
});

describe("unpublishing", () => {
  const published = (service: FakeService) => {
    service.handle = "ana";
    service.publications = [
      { slug: "purchase", url: `${HOST}/ana/purchase/`, publishedAt: "", bytes: 5 },
      { slug: "other", url: `${HOST}/ana/other/`, publishedAt: "", bytes: 6 },
    ];
  };

  it("removes the page and says so", async () => {
    const r = rig(published);
    await r.model.load();
    expect(await r.model.unpublish("purchase")).toBe(true);
    expect(r.service.log.at(-1)).toBe("unpublish purchase");
    expect(r.model.state.publications.map((p) => p.slug)).toEqual(["other"]);
    expect(r.model.state.status).toBe("Unpublished purchase.");
    expect(r.model.state.busy).toBe(false);
  });

  it("forgets the address that was just shown for it", async () => {
    const r = rig(published);
    await r.model.load();
    await r.model.publish({ slug: "purchase" });
    expect(r.model.state.published?.slug).toBe("purchase");
    await r.model.unpublish("purchase");
    expect(r.model.state.published).toBeUndefined();
  });

  it("treats a page that is gone already as unpublished", async () => {
    const r = rig(published);
    await r.model.load();
    r.service.publications = [];
    expect(await r.model.unpublish("purchase")).toBe(true);
    expect(r.model.state.publications.map((p) => p.slug)).toEqual(["other"]);
    expect(r.model.state.status).toBe(en.cloud.publishing.gone("purchase"));
    expect(r.model.state.problem).toBe("");
  });

  it("keeps the page when the service refuses, and says why", async () => {
    const r = rig(published);
    await r.model.load();
    r.service.override["unpublish purchase"] = () => refused(403, "access.denied");
    expect(await r.model.unpublish("purchase")).toBe(false);
    expect(r.model.state.publications).toHaveLength(2);
    expect(r.model.state.problem).toBe(en.cloud.publishing.errors.accessDenied);
  });

  it("asks nothing about a page the dialog does not hold", async () => {
    const r = rig(published);
    await r.model.load();
    const calls = r.service.log.length;
    expect(await r.model.unpublish("nope")).toBe(false);
    expect(r.service.log).toHaveLength(calls);
  });
});

describe("copying an address", () => {
  it("copies the address of a page the dialog holds, exactly", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    await r.model.publish({ slug: "purchase" });
    expect(await r.model.copy(`${HOST}/ana/purchase/`)).toBe(true);
    expect(r.copied).toEqual([`${HOST}/ana/purchase/`]);
    expect(r.model.state.status).toBe("The address was copied.");
  });

  it("copies nothing it was not given, and says to select it by hand when the clipboard refuses", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    await r.model.publish({ slug: "purchase" });
    expect(await r.model.copy("https://evil.example/")).toBe(false);
    expect(r.copied).toEqual([]);
    r.clipboard.works = false;
    expect(await r.model.copy(`${HOST}/ana/purchase/`)).toBe(false);
    expect(r.model.state.status).toBe(en.cloud.publishing.selectIt);
  });
});

describe("who is offered publishing", () => {
  const stateFor = (role: "owner" | "editor" | "viewer"): ShareState => ({
    project: ID,
    list: "ready",
    sharing: {
      linkAccess: "view",
      role,
      members: role === "owner" ? [] : undefined,
      invitations: role === "owner" ? [] : undefined,
    },
    busy: false,
    status: "",
    problem: "",
    emailProblem: "",
    invited: undefined,
    left: false,
    live: undefined,
  });
  const context = {
    words: en.cloud,
    link: `https://diagrams.example/p/${ID}`,
    me: undefined,
    locale: "en",
    canPublish: true,
  };

  it("is the owner of a cloud project, and nobody else", () => {
    expect(shareView(stateFor("owner"), context).publish).toBe(true);
    expect(shareView(stateFor("editor"), context).publish).toBe(false);
    expect(shareView(stateFor("viewer"), context).publish).toBe(false);
    // Before the person's role is known there is nothing to offer.
    expect(shareView({ ...stateFor("owner"), sharing: undefined }, context).publish).toBe(false);
  });
});

describe("one action at a time", () => {
  it("ignores another while the page is being built, and says nothing after the dialog closed", async () => {
    const r = rig((service) => {
      service.handle = "ana";
    });
    await r.model.load();
    let release!: (value: BuiltCatalog) => void;
    r.builder.catalog = () => new Promise((resolve) => (release = resolve));
    const first = r.model.publish({ slug: "purchase" });
    expect(r.model.state.busy).toBe(true);
    expect(r.model.state.status).toBe(en.cloud.publishing.building);
    expect(await r.model.publish({ slug: "other" })).toBe(false);
    expect(await r.model.unpublish("purchase")).toBe(false);
    r.model.dispose();
    const seen = r.states.length;
    release(CATALOG);
    await first;
    expect(r.states).toHaveLength(seen);
  });

  it("publishes nothing, and takes no handle, when the dialog was closed while the page was being built", async () => {
    for (const handle of [null, "ana"]) {
      const r = rig((service) => {
        service.handle = handle;
      });
      await r.model.load();
      let release!: (value: BuiltCatalog) => void;
      r.builder.catalog = () => new Promise((resolve) => (release = resolve));
      const pending = r.model.publish(
        handle === null ? { slug: "purchase", handle: "carla" } : { slug: "purchase" },
      );
      // Close is not Cancel on the dialog, but a page nobody is looking at is not made public.
      r.model.dispose();
      release(CATALOG);
      expect(await pending).toBe(false);
      expect(r.service.log.filter((call) => /^(publish|setHandle)/.test(call))).toEqual([]);
      expect(r.service.publications).toEqual([]);
      expect(r.service.handle).toBe(handle);
      expect(r.reports).toEqual([]);
    }
  });
});

// What the publish dialog knows and does, without a DOM: the person's handle, what the project has
// published and what the service took down, the address just made, what is going on and what went wrong,
// and the actions (choose a handle, publish, unpublish, copy an address). The dialog draws it and calls
// these methods; a test drives them with a fake host.
//
// Publishing builds the HTML on the page, by the host's `build` (the same build as the catalog export,
// so a published page is the page `mdg build catalog` writes), checks its size before sending and then
// sends it. The first time it also chooses the handle, after the build and before the upload, so that a
// project that cannot be published never takes a handle. Nothing is offered to anyone but the owner of
// a cloud project: that is the share dialog's rule, which opens this one.

import { explainFailure, type CloudWords } from "./explain.js";
import {
  HTML_MAX_BYTES,
  type Publication,
  type PublishApi,
  type Published,
  type Takedown,
} from "./publish-api.js";
import type { ApiFailure } from "./tokens.js";

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const SLUG_MAX = 60;

const HANDLE_CHARACTERS = /^[a-z0-9-]*$/;

export type PartCheck<K extends string> =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: K };

export type HandleProblem = "empty" | "short" | "long" | "chars";
export type SlugProblem = "empty" | "long" | "chars";

/** The handle a person typed, as the service reads it: `[a-z0-9-]{3,30}`, trimmed. */
export function checkHandle(raw: string): PartCheck<HandleProblem> {
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "empty" };
  if (!HANDLE_CHARACTERS.test(value)) return { ok: false, reason: "chars" };
  if (value.length < HANDLE_MIN) return { ok: false, reason: "short" };
  if (value.length > HANDLE_MAX) return { ok: false, reason: "long" };
  return { ok: true, value };
}

/** The slug a person typed, as the service reads it: `[a-z0-9-]{1,60}`, trimmed. */
export function checkSlug(raw: string): PartCheck<SlugProblem> {
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "empty" };
  if (!HANDLE_CHARACTERS.test(value)) return { ok: false, reason: "chars" };
  if (value.length > SLUG_MAX) return { ok: false, reason: "long" };
  return { ok: true, value };
}

/**
 * A name as a slug: accents dropped, lower case, every run of anything else a single hyphen, no
 * hyphen at either end, at most 60 characters. Empty when the name holds nothing to keep.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug;
}

/** The slug to offer for a project: its name's, or the words' own when the name holds nothing to keep. */
export function defaultSlug(name: string, words: CloudWords): string {
  return slugify(name) || words.publishing.defaultSlug;
}

/** Why a handle was refused, in words. */
export function handleText(reason: HandleProblem, words: CloudWords): string {
  const m = words.publishing;
  switch (reason) {
    case "empty":
      return m.handleEmpty;
    case "short":
      return m.handleShort(HANDLE_MIN);
    case "long":
      return m.handleLong(HANDLE_MAX);
    case "chars":
      return m.handleChars;
  }
}

/** Why a slug was refused, in words. */
export function slugText(reason: SlugProblem, words: CloudWords): string {
  const m = words.publishing;
  switch (reason) {
    case "empty":
      return m.slugEmpty;
    case "long":
      return m.slugLong(SLUG_MAX);
    case "chars":
      return m.slugChars;
  }
}

/** The size of a text in bytes, as it is sent (UTF-8). */
export function byteLength(html: string): number {
  return new TextEncoder().encode(html).byteLength;
}

/** The catalog the page built: the HTML, and how many entries it holds and how many could not be drawn. */
export interface BuiltCatalog {
  readonly html: string;
  readonly entries: number;
  readonly skipped: number;
}

/** What the dialog needs of the page: the calls, and the parts only the page can do. */
export interface PublishHost {
  readonly api: PublishApi;
  /** Builds the project's HTML catalog exactly as the catalog export does. */
  build(): Promise<BuiltCatalog>;
  /** Writes text to the clipboard; false when it cannot. */
  copy(text: string): Promise<boolean>;
  /** Says something in the status line. */
  report(message: string): void;
}

export interface PublishState {
  /** The project the dialog is about. */
  readonly project: string;
  /** Whether what the project has published has been read. */
  readonly list: "loading" | "ready" | "failed";
  /** The person's handle; null until they chose one: the form then asks for it. */
  readonly handle: string | null;
  readonly publications: readonly Publication[];
  readonly takedowns: readonly Takedown[];
  /** An action is on its way: the form and the buttons wait. */
  readonly busy: boolean;
  /** Something going on or done, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
  /** What is wrong with the handle, in words; empty when nothing is. */
  readonly handleProblem: string;
  /** What is wrong with the slug, in words; empty when nothing is. */
  readonly slugProblem: string;
  /** The page just published, with its address, until the next action or the dialog's end. */
  readonly published: Published | undefined;
}

/** What publishing asks of the form: the slug, and the handle when the person has none yet. */
export interface PublishRequest {
  readonly slug: string;
  readonly handle?: string;
}

/** Whether a refusal says there is no such publication (it is gone already). */
function isGone(failure: ApiFailure): boolean {
  return (
    failure.kind === "refused" && failure.status === 404 && failure.code !== "project.not-found"
  );
}

/** A failed call in words: what publishing adds to what every cloud call says (`explainFailure`). */
export function explainPublishing(failure: ApiFailure, words: CloudWords): string {
  const m = words.publishing.errors;
  if (failure.kind === "refused") {
    if (failure.code === "publish.too-large") return m.tooLarge(HTML_MAX_BYTES / (1024 * 1024));
    if (failure.code === "publish.rate") return m.rate;
    if (failure.code === "publish.taken") return m.taken;
    if (failure.code === "publish.invalid") return m.invalid;
    if (failure.code === "access.denied" || failure.status === 403) return m.accessDenied;
  }
  return explainFailure(failure, words.errors);
}

const upsert = (held: readonly Publication[], one: Publication): Publication[] => [
  ...held.filter((publication) => publication.slug !== one.slug),
  one,
];

export class PublishModel {
  private current: PublishState;
  private disposed = false;

  constructor(
    private readonly host: PublishHost,
    readonly project: string,
    private readonly words: () => CloudWords,
    private readonly changed: (state: PublishState) => void,
  ) {
    this.current = {
      project,
      list: "loading",
      handle: null,
      publications: [],
      takedowns: [],
      busy: false,
      status: "",
      problem: "",
      handleProblem: "",
      slugProblem: "",
      published: undefined,
    };
  }

  get state(): PublishState {
    return this.current;
  }

  /** The dialog was closed: what a call in the air brings is nobody's now. */
  dispose(): void {
    this.disposed = true;
  }

  private update(patch: Partial<PublishState>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    this.changed(this.current);
  }

  private refuse(failure: ApiFailure): string {
    const problem = explainPublishing(failure, this.words());
    this.update({ busy: false, status: "", problem });
    this.host.report(problem);
    return problem;
  }

  /** Reads the handle, the publications and the takedowns. */
  async load(): Promise<void> {
    this.update({ list: "loading", status: this.words().publishing.loading, problem: "" });
    const read = await this.host.api.info(this.project);
    if (!read.ok) {
      const problem = explainPublishing(read.failure, this.words());
      this.update({ list: "failed", status: "", problem });
      this.host.report(problem);
      return;
    }
    this.update({
      list: "ready",
      handle: read.value.handle,
      publications: read.value.publications,
      takedowns: read.value.takedowns,
      status: "",
      problem: "",
    });
  }

  /**
   * Checks a handle as it is typed: what is wrong with it is said at once; nothing is said of one
   * that is still empty (the person has not started), and `submit` says it. True when it is usable.
   */
  typedHandle(raw: string): boolean {
    const checked = checkHandle(raw);
    if (checked.ok) {
      this.update({ handleProblem: "" });
      return true;
    }
    this.update({
      handleProblem: checked.reason === "empty" ? "" : handleText(checked.reason, this.words()),
    });
    return false;
  }

  /** Checks a slug as it is typed, as `typedHandle` does a handle. True when it is usable. */
  typedSlug(raw: string): boolean {
    const checked = checkSlug(raw);
    if (checked.ok) {
      this.update({ slugProblem: "" });
      return true;
    }
    this.update({
      slugProblem: checked.reason === "empty" ? "" : slugText(checked.reason, this.words()),
    });
    return false;
  }

  /**
   * Publishes the project's catalog under `slug` (a new page, or the page that has it already,
   * which is replaced). A person with no handle gives one first, which is chosen once the page is
   * built and small enough to send. Nothing is sent for a slug or a handle that breaks the rules, or
   * for a page over 16 MiB. True when the page is published.
   */
  async publish(request: PublishRequest): Promise<boolean> {
    if (this.current.busy) return false;
    const m = this.words().publishing;
    const slug = checkSlug(request.slug);
    const needsHandle = this.current.handle === null;
    const handle = needsHandle ? checkHandle(request.handle ?? "") : undefined;
    if (!slug.ok || (handle !== undefined && !handle.ok)) {
      this.update({
        status: "",
        problem: "",
        slugProblem: slug.ok ? "" : slugText(slug.reason, this.words()),
        handleProblem:
          handle !== undefined && !handle.ok ? handleText(handle.reason, this.words()) : "",
      });
      return false;
    }

    this.update({
      busy: true,
      status: m.building,
      problem: "",
      handleProblem: "",
      slugProblem: "",
      published: undefined,
    });
    let built: BuiltCatalog;
    try {
      built = await this.host.build();
    } catch {
      this.update({ busy: false, status: "", problem: m.errors.buildFailed });
      this.host.report(m.errors.buildFailed);
      return false;
    }
    // The dialog was closed while the page was being built: whoever closed it did not ask for a
    // public page (or a handle) to be made after all, so nothing is sent. What is already on its
    // way (the upload itself) cannot be taken back.
    if (this.disposed) return false;
    if (built.entries === 0) {
      this.update({ busy: false, status: "", problem: m.errors.nothing });
      this.host.report(m.errors.nothing);
      return false;
    }
    if (byteLength(built.html) > HTML_MAX_BYTES) {
      const problem = m.errors.tooLarge(HTML_MAX_BYTES / (1024 * 1024));
      this.update({ busy: false, status: "", problem });
      this.host.report(problem);
      return false;
    }

    if (handle?.ok) {
      this.update({ status: m.choosingHandle });
      const chosen = await this.host.api.setHandle(handle.value);
      if (!chosen.ok) {
        const f = chosen.failure;
        const code = f.kind === "refused" ? f.code : undefined;
        if (code === "handle.taken") return this.handleRefused(m.handleTaken);
        if (code === "handle.invalid") return this.handleRefused(m.handleInvalid);
        if (code === "handle.locked") return this.handleRefused(m.handleLocked);
        this.refuse(f);
        return false;
      }
      this.update({ handle: chosen.value.handle });
      // Closed while the handle was being chosen: the handle is theirs now, the page is not sent.
      if (this.disposed) return false;
    }

    this.update({ status: m.uploading });
    const sent = await this.host.api.publish(this.project, slug.value, built.html);
    if (!sent.ok) {
      const f = sent.failure;
      if (f.kind === "refused" && f.code === "handle.required") {
        this.update({ handle: null });
        return this.handleRefused(m.errors.handleRequired);
      }
      // The name is another of the person's pages already: said under the page name, to change it.
      if (f.kind === "refused" && f.code === "publish.taken")
        return this.slugRefused(m.errors.taken);
      this.refuse(f);
      // An answer the page cannot read may still have published: read what the service holds.
      if (f.kind === "unexpected") await this.reread();
      return false;
    }
    const page = sent.value;
    const status =
      built.skipped > 0
        ? `${m.published(page.slug)} ${m.skipped(built.skipped)}`
        : m.published(page.slug);
    this.update({
      busy: false,
      published: page,
      handle: page.handle,
      publications: upsert(this.current.publications, {
        slug: page.slug,
        url: page.url,
        publishedAt: page.publishedAt,
        bytes: page.bytes,
      }),
      // A page that is published again is not "removed by the service" any more.
      takedowns: this.current.takedowns.filter((takedown) => takedown.slug !== page.slug),
      status,
      problem: "",
    });
    this.host.report(status);
    return true;
  }

  /** A handle the service refused: said under the handle field, the form stays as it was. */
  private handleRefused(problem: string): boolean {
    this.update({ busy: false, status: "", problem: "", handleProblem: problem });
    this.host.report(problem);
    return false;
  }

  /** A page name the service refused: said under the page name, the form stays as it was. */
  private slugRefused(problem: string): boolean {
    this.update({ busy: false, status: "", problem: "", slugProblem: problem });
    this.host.report(problem);
    return false;
  }

  private async reread(): Promise<void> {
    const read = await this.host.api.info(this.project);
    if (read.ok) {
      this.update({
        handle: read.value.handle,
        publications: read.value.publications,
        takedowns: read.value.takedowns,
      });
    }
  }

  /** Unpublishes a page (the dialog asked first). True when it is no longer published. */
  async unpublish(slug: string): Promise<boolean> {
    if (this.current.busy) return false;
    if (!this.current.publications.some((publication) => publication.slug === slug)) return false;
    const m = this.words().publishing;
    this.update({ busy: true, status: m.unpublishing, problem: "" });
    const done = await this.host.api.unpublish(this.project, slug);
    if (!done.ok && !isGone(done.failure)) {
      this.refuse(done.failure);
      return false;
    }
    const status = done.ok ? m.unpublished(slug) : m.gone(slug);
    this.update({
      busy: false,
      status,
      problem: "",
      publications: this.current.publications.filter((publication) => publication.slug !== slug),
      published: this.current.published?.slug === slug ? undefined : this.current.published,
    });
    this.host.report(status);
    return true;
  }

  /** Copies the address of a published page. False when it is not one the dialog holds, or the clipboard refused. */
  async copy(url: string): Promise<boolean> {
    const known =
      this.current.published?.url === url ||
      this.current.publications.some((publication) => publication.url === url);
    if (!known) return false;
    const m = this.words().publishing;
    const copied = await this.host.copy(url);
    const status = copied ? m.copied : m.selectIt;
    this.update({ status, problem: "" });
    this.host.report(status);
    return copied;
  }
}

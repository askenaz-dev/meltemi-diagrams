import type {
  AddedIconInfo,
  IconFileCheck,
  IconFileInput,
  IconPrefixCheck,
} from "@meltemi/diagrams-editor/canvas";
import { ICONS, clear, h, icon } from "./dom.js";
import { messages } from "./messages/index.js";

/** The licences the dialog offers for a new pack, then Other…, which takes one typed. */
export const LICENCES = [
  "LicenseRef-Project",
  "CC-BY-4.0",
  "CC0-1.0",
  "MIT",
  "Apache-2.0",
] as const;
/** The choice of the licence select that takes a licence typed in its field. */
export const OTHER_LICENCE = "other";
/** An SPDX identifier or a `LicenseRef-` name, as `assets/licenses.json` holds them. */
const LICENCE_ID = /^(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.+-]*)$/;
/** The largest SVG file an icon may be, in kilobytes: the sanitiser's limit. */
export const ICON_FILE_KB = 256;
/** How long typing rests before the dialog checks again, in milliseconds. */
export const CHECK_DEBOUNCE = 120;
/** How many rows fade in one after the other. */
const STAGGERED = 8;

/** A file the person picked: its name, its text, and why the canvas leaves it out before asking. */
export interface PickedIcon {
  readonly file: string;
  readonly svg: string;
  /** Set when the file is no icon whatever its name: a raster image, a file too large. */
  readonly refused?: string;
}

/**
 * Why a picked file is left out before it is read: a picture that is not an SVG (`photo.png`) is
 * added as an image; an SVG larger than an icon may be is refused. Undefined for an SVG file.
 */
export function pickedRefusal(name: string, type: string, size: number): string | undefined {
  const words = messages().addIcons;
  const svg = /\.svg$/i.test(name) || type === "image/svg+xml";
  if (!svg) return words.raster;
  if (size > ICON_FILE_KB * 1024) return words.tooLarge(ICON_FILE_KB);
  return undefined;
}

/** The answer of the session the dialog shows: the prefix and the files it was sent, in order. */
export interface IconsCheck {
  readonly prefix: IconPrefixCheck;
  readonly files: readonly IconFileCheck[];
}

/** A row of the dialog: a file, the name it gets, its preview and what is wrong with it. */
export interface DialogRow {
  readonly file: string;
  readonly name: string;
  readonly svg: string | null;
  readonly problem?: string;
  /** The file is no icon (refused by the canvas or the sanitiser): it is left out, not blocking. */
  readonly leftOut: boolean;
}

/** What the dialog shows and allows, from what was picked, typed and checked. */
export interface DialogState {
  readonly rows: readonly DialogRow[];
  /** The prefix's problem, if any. */
  readonly prefixProblem?: string;
  /** The pack is new and has no licence: the dialog asks for one. */
  readonly licenceAsked: boolean;
  /** The licence the dialog would send, when it is asked for and well formed. */
  readonly licence?: string;
  readonly licenceProblem?: string;
  /** How many icons the confirm button adds. */
  readonly count: number;
  /** Whether confirming would add icons: nothing blocks and at least one file is not left out. */
  readonly canAdd: boolean;
}

/**
 * The files the dialog sends to the session: the picked ones the canvas does not refuse, each
 * with the name typed for it (none until something is typed, so the session offers one). Answers
 * the indexes of the picked files they stand for.
 */
export function sentFiles(
  picked: readonly PickedIcon[],
  names: ReadonlyMap<number, string>,
): { readonly files: IconFileInput[]; readonly indexes: number[] } {
  const files: IconFileInput[] = [];
  const indexes: number[] = [];
  picked.forEach((p, i) => {
    if (p.refused !== undefined) return;
    const name = names.get(i);
    files.push({ file: p.file, svg: p.svg, ...(name !== undefined ? { name } : {}) });
    indexes.push(i);
  });
  return { files, indexes };
}

/**
 * The state of the dialog: a row per picked file (with the session's name, preview and problem
 * once it has answered), the prefix's problem, the licence asked for a new pack, and whether
 * confirming adds anything. A file the canvas or the sanitiser refuses is left out; a name taken
 * or malformed, a bad prefix or a missing licence keeps the dialog from confirming until fixed.
 */
export function dialogState(
  picked: readonly PickedIcon[],
  names: ReadonlyMap<number, string>,
  check: IconsCheck | undefined,
  licence: { readonly choice: string; readonly other: string },
): DialogState {
  const words = messages().addIcons;
  const { indexes } = sentFiles(picked, names);
  const rows = picked.map((p, i): DialogRow => {
    if (p.refused !== undefined) {
      return { file: p.file, name: "", svg: null, problem: p.refused, leftOut: true };
    }
    const checked = check?.files[indexes.indexOf(i)];
    if (!checked) return { file: p.file, name: names.get(i) ?? "", svg: null, leftOut: false };
    return {
      file: p.file,
      name: checked.name,
      svg: checked.svg,
      ...(checked.problem !== undefined ? { problem: checked.problem } : {}),
      // A name can be fixed in the dialog; a file whose drawing is refused cannot.
      leftOut: checked.problem !== undefined && checked.svg === null,
    };
  });
  const prefixProblem = check?.prefix.problem;
  const licenceAsked = check !== undefined && prefixProblem === undefined && !check.prefix.licensed;
  const typed = licence.choice === OTHER_LICENCE ? licence.other.trim() : licence.choice;
  const licenceOk = LICENCE_ID.test(typed);
  const count = rows.filter((r) => !r.leftOut).length;
  const blocked =
    check === undefined ||
    check.files.length !== indexes.length ||
    prefixProblem !== undefined ||
    (licenceAsked && !licenceOk) ||
    rows.some((r) => !r.leftOut && r.problem !== undefined);
  return {
    rows,
    ...(prefixProblem !== undefined ? { prefixProblem } : {}),
    licenceAsked,
    ...(licenceAsked && licenceOk ? { licence: typed } : {}),
    ...(licenceAsked && !licenceOk && licence.choice === OTHER_LICENCE
      ? { licenceProblem: words.otherInvalid }
      : {}),
    count,
    canAdd: !blocked && count > 0,
  };
}

/** What the Add icon dialog asks of the canvas. */
export interface AddIconsActions {
  /** Sends `checkIcons`; `checked` takes the answer. */
  check(prefix: string, files: readonly IconFileInput[], token: number): void;
  /** Sends `addIcons`; `added` takes the answer. */
  add(
    request: {
      readonly prefix: string;
      readonly licence?: string;
      readonly files: readonly IconFileInput[];
    },
    token: number,
  ): void;
  /** The dialog closed, with the icons it added (none when cancelled). */
  closed(added: readonly AddedIconInfo[]): void;
}

/**
 * The Add icon dialog over the canvas: the pack's prefix, the licence of a new pack, and a row per
 * picked file with its preview, the name it gets (editable) and what is wrong, checked by the
 * session as it is typed. Escape and Cancel close it; the confirm button adds the files that can
 * be added, in one step.
 */
export class AddIconsDialog {
  readonly element = h("div", {
    class: "icon-dialog add-icons",
    hidden: true,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "mdg-add-icons-title",
  });
  private picked: PickedIcon[] = [];
  private readonly names = new Map<number, string>();
  private check: IconsCheck | undefined;
  private token = 0;
  private timer: number | undefined;
  private adding = false;
  private returnFocus: HTMLElement | null = null;
  private readonly prefixInput: HTMLInputElement;
  private readonly prefixHint = h("div", { class: "hint", id: "mdg-add-icons-prefix-hint" });
  private readonly licenceRow = h("div", { class: "licence", hidden: true });
  private readonly licenceSelect: HTMLSelectElement;
  private readonly licenceOther: HTMLInputElement;
  private readonly licenceHint = h("div", { class: "hint", id: "mdg-add-icons-licence-hint" });
  private readonly list = h("ul", { class: "icon-rows" });
  private readonly status = h("div", { class: "hint add-status", "aria-live": "polite" });
  private readonly confirm: HTMLButtonElement;
  private readonly rowInputs = new Map<number, HTMLInputElement>();

  constructor(private readonly actions: AddIconsActions) {
    const words = messages().addIcons;
    this.prefixInput = h("input", {
      type: "text",
      id: "mdg-add-icons-prefix",
      spellcheck: "false",
      autocomplete: "off",
      "aria-describedby": "mdg-add-icons-prefix-hint",
    });
    this.prefixInput.addEventListener("input", () => {
      this.check = undefined;
      this.schedule();
    });
    this.licenceSelect = h(
      "select",
      { id: "mdg-add-icons-licence", "aria-describedby": "mdg-add-icons-licence-hint" },
      ...LICENCES.map((id) =>
        h("option", { value: id }, id === "LicenseRef-Project" ? words.own : id),
      ),
      h("option", { value: OTHER_LICENCE }, words.other),
    );
    this.licenceOther = h("input", {
      type: "text",
      class: "licence-other",
      spellcheck: "false",
      autocomplete: "off",
      placeholder: words.otherPlaceholder,
      "aria-label": words.otherPlaceholder,
      hidden: true,
    });
    this.licenceSelect.addEventListener("change", () => {
      this.licenceOther.hidden = this.licenceSelect.value !== OTHER_LICENCE;
      if (!this.licenceOther.hidden) this.licenceOther.focus();
      this.draw();
    });
    this.licenceOther.addEventListener("input", () => this.draw());
    this.licenceRow.append(
      h("label", { for: "mdg-add-icons-licence" }, words.licence),
      h("div", { class: "row" }, this.licenceSelect, this.licenceOther),
      this.licenceHint,
    );
    const cancel = h("button", { type: "button" }, words.cancel);
    cancel.addEventListener("click", () => this.close());
    this.confirm = h("button", { type: "button", class: "primary", disabled: true }, words.add(0));
    this.confirm.addEventListener("click", () => this.submit());
    const box = h(
      "div",
      { class: "box" },
      h("div", { id: "mdg-add-icons-title", class: "title" }, words.title),
      h("label", { for: "mdg-add-icons-prefix" }, words.prefix),
      this.prefixInput,
      this.prefixHint,
      this.licenceRow,
      h("div", { class: "rows-title", id: "mdg-add-icons-files" }, words.files),
      this.list,
      this.status,
      h("div", { class: "buttons" }, cancel, this.confirm),
    );
    this.list.setAttribute("aria-labelledby", "mdg-add-icons-files");
    this.element.append(box);
    this.element.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Tab") this.trap(e);
    });
    // A press on the backdrop, outside the box, cancels.
    this.element.addEventListener("pointerdown", (e) => {
      if (e.target === this.element) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** The prefix typed last, which the canvas offers the next time. */
  get prefix(): string {
    return this.prefixInput.value.trim();
  }

  /** Opens the dialog on the picked files, with `prefix` offered; checks them at once. */
  open(picked: readonly PickedIcon[], prefix: string): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.picked = [...picked];
    this.names.clear();
    this.rowInputs.clear();
    this.check = undefined;
    this.adding = false;
    this.prefixInput.value = prefix;
    this.licenceSelect.value = LICENCES[0];
    this.licenceOther.value = "";
    this.licenceOther.hidden = true;
    clear(this.list);
    this.picked.forEach((p, i) => this.list.append(this.row(p, i)));
    this.element.hidden = false;
    this.draw();
    this.send();
    this.prefixInput.focus();
    this.prefixInput.select();
  }

  close(added: readonly AddedIconInfo[] = []): void {
    if (this.element.hidden) return;
    window.clearTimeout(this.timer);
    this.element.hidden = true;
    // Answers on their way are for a dialog that is gone.
    this.token++;
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.actions.closed(added);
  }

  /** The session's answer to a check: shown when it is the last one asked for. */
  checked(token: number, check: IconsCheck): void {
    if (token !== this.token || this.element.hidden) return;
    this.check = check;
    this.draw();
  }

  /**
   * The session's answer to the addition: the dialog closes with the icons added; when none could
   * be, it stays with the reasons.
   */
  added(
    token: number,
    added: readonly AddedIconInfo[],
    refused: readonly { readonly file: string; readonly reason: string }[],
  ): void {
    if (token !== this.token || this.element.hidden) return;
    this.adding = false;
    if (added.length > 0) {
      this.close(added);
      return;
    }
    this.status.textContent = refused[0]?.reason ?? messages().addIcons.none;
    this.status.classList.add("error");
    this.draw();
  }

  private row(picked: PickedIcon, index: number): HTMLElement {
    const words = messages().addIcons;
    const thumb = h("span", { class: "thumb loading", "aria-hidden": "true" });
    const input = h("input", {
      type: "text",
      class: "icon-name",
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": words.name(picked.file),
      "aria-describedby": `mdg-add-icon-${index}-problem`,
      disabled: picked.refused !== undefined,
    });
    input.addEventListener("input", () => {
      this.names.set(index, input.value.trim());
      this.check = undefined;
      this.schedule();
    });
    this.rowInputs.set(index, input);
    const remove = h(
      "button",
      {
        type: "button",
        class: "remove",
        title: words.remove(picked.file),
        "aria-label": words.remove(picked.file),
      },
      icon(ICONS.close),
    );
    remove.addEventListener("click", () => this.leaveOut(index));
    const item = h(
      "li",
      { class: "icon-row", "data-index": index, style: `--i:${Math.min(index, STAGGERED)}` },
      thumb,
      h(
        "div",
        { class: "fields" },
        h("div", { class: "file", title: picked.file }, picked.file),
        input,
        h("div", { class: "problem", id: `mdg-add-icon-${index}-problem` }),
      ),
      remove,
    );
    return item;
  }

  /** Takes a file out of the dialog. */
  private leaveOut(index: number): void {
    const item = this.list.querySelector<HTMLElement>(`li[data-index="${index}"]`);
    this.picked[index] = { ...this.picked[index]!, refused: messages().addIcons.leftOut };
    this.names.delete(index);
    item?.classList.add("gone");
    this.check = undefined;
    this.send();
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.status.textContent = messages().addIcons.checking;
    this.status.classList.remove("error");
    this.confirm.disabled = true;
    this.timer = window.setTimeout(() => this.send(), CHECK_DEBOUNCE);
  }

  private send(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    const { files } = sentFiles(this.picked, this.names);
    this.token++;
    if (files.length === 0) {
      // Nothing to ask: every file is left out.
      this.check = { prefix: { prefix: this.prefix, existing: false, licensed: true }, files: [] };
      this.draw();
      return;
    }
    this.actions.check(this.prefix, files, this.token);
    this.draw();
  }

  private state(): DialogState {
    return dialogState(this.picked, this.names, this.check, {
      choice: this.licenceSelect.value,
      other: this.licenceOther.value,
    });
  }

  private draw(): void {
    const words = messages().addIcons;
    const state = this.state();
    const check = this.check;
    this.prefixHint.textContent = state.prefixProblem
      ? state.prefixProblem
      : check?.prefix.existing
        ? words.prefixExisting(this.prefix)
        : words.prefixNew(this.prefix || "…");
    this.prefixHint.classList.toggle("error", state.prefixProblem !== undefined);
    this.prefixInput.setAttribute("aria-invalid", String(state.prefixProblem !== undefined));
    this.licenceRow.hidden = !state.licenceAsked;
    this.licenceHint.textContent = state.licenceProblem ?? "";
    this.licenceHint.classList.toggle("error", state.licenceProblem !== undefined);
    state.rows.forEach((row, i) => {
      const item = this.list.querySelector<HTMLElement>(`li[data-index="${i}"]`);
      if (!item) return;
      const input = this.rowInputs.get(i)!;
      // The field keeps what is being typed; the name offered fills an untouched one.
      if (document.activeElement !== input && !this.names.has(i)) input.value = row.name;
      input.disabled = row.leftOut;
      // A file left out before it was read has no name to show.
      input.hidden = row.leftOut && row.name === "";
      input.setAttribute("aria-invalid", String(!row.leftOut && row.problem !== undefined));
      const thumb = item.querySelector<HTMLElement>(".thumb")!;
      const waiting = !row.leftOut && check === undefined;
      thumb.classList.toggle("loading", waiting);
      thumb.classList.toggle("refused", row.leftOut);
      if (row.svg) thumb.innerHTML = row.svg;
      else if (row.leftOut) thumb.replaceChildren(icon(ICONS.missing));
      else if (!waiting) clear(thumb);
      const problem = item.querySelector<HTMLElement>(".problem")!;
      problem.textContent = row.leftOut
        ? `${words.leftOut}: ${row.problem ?? ""}`
        : (row.problem ?? (row.name ? words.reference(`${this.prefix}:${row.name}`) : ""));
      problem.classList.toggle("error", !row.leftOut && row.problem !== undefined);
      item.classList.toggle("left-out", row.leftOut);
    });
    if (this.timer === undefined && !this.status.classList.contains("error")) {
      this.status.textContent =
        check === undefined ? words.checking : state.count === 0 ? words.none : "";
    }
    this.confirm.textContent = words.add(state.count);
    this.confirm.disabled = !state.canAdd || this.adding || this.timer !== undefined;
  }

  private submit(): void {
    const state = this.state();
    if (!state.canAdd || this.adding || this.timer !== undefined) return;
    const { files, indexes } = sentFiles(this.picked, this.names);
    const kept = files
      .map((f, j) => ({ ...f, name: state.rows[indexes[j]!]!.name }))
      .filter((_, j) => !state.rows[indexes[j]!]!.leftOut);
    this.adding = true;
    this.confirm.disabled = true;
    this.token++;
    this.actions.add(
      { prefix: this.prefix, ...(state.licence ? { licence: state.licence } : {}), files: kept },
      this.token,
    );
  }

  /** Keeps the focus inside the dialog. */
  private trap(e: KeyboardEvent): void {
    e.preventDefault();
    const stops = [
      ...this.element.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled])",
      ),
    ].filter((el) => el.offsetParent !== null);
    const index = stops.indexOf(document.activeElement as HTMLElement);
    const step = e.shiftKey ? -1 : 1;
    stops[(index + step + stops.length) % stops.length]?.focus();
  }
}

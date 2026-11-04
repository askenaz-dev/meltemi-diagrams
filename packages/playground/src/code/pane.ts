import {
  codeActions,
  completions,
  hover,
  prepareRename,
  type CodeAction,
  type CompletionItem,
  type DocumentAnalysis,
} from "@meltemi/diagrams-editor";
import type { Diagnostic, TextEdit } from "@meltemi/diagrams-language";
import type { OverlayHost } from "../cloud/presence-overlay.js";
import type { Selection } from "../history.js";
import { messages } from "../messages/index.js";
import { h } from "../ui.js";
import { lexicalSpans, mergeSpans, paint, semanticSpans, type Span } from "./highlight.js";
import { markdown } from "./markdown.js";

/** What the code pane asks of the page. */
export interface CodeHost {
  /** Typing (or indentation) changed the text. */
  typed(text: string, before: Selection, after: Selection): void;
  /** Edits of the open file as one step: a completion, a fix. */
  edit(edits: readonly TextEdit[], after?: Selection): void;
  caret(offset: number): void;
  /** The analysis of the open file as its text is now. */
  analysis(): DocumentAnalysis | undefined;
  format(): void;
  /** Renames the id at an offset across the project; a message when it cannot. */
  rename(offset: number, newId: string): string | undefined;
  definition(offset: number): void;
}

export type CodeLanguage = "meltemi" | "json" | "plain";

const WORD = /[A-Za-z0-9_]/;
const TAB = 2;

/** A snippet's text with `${1:placeholder}` resolved, and the range of its first placeholder. */
export function expandSnippet(snippet: string): { text: string; select?: [number, number] } {
  let text = "";
  let first: [number, number] | undefined;
  let firstIndex = Infinity;
  let final: number | undefined;
  let at = 0;
  for (const match of snippet.matchAll(/\$\{(\d+)(?::([^}]*))?\}|\$(\d+)/g)) {
    text += snippet.slice(at, match.index);
    const index = Number(match[1] ?? match[3]);
    const placeholder = match[2] ?? "";
    if (index === 0) final = text.length;
    else if (index < firstIndex) {
      firstIndex = index;
      first = [text.length, text.length + placeholder.length];
    }
    text += placeholder;
    at = match.index + match[0].length;
  }
  text += snippet.slice(at);
  const select = first ?? (final !== undefined ? [final, final] : undefined);
  return select ? { text, select } : { text };
}

/** JSON: strings, numbers and constants. */
function jsonSpans(text: string): Span[] {
  const spans: Span[] = [];
  const pattern =
    /"(?:[^"\\\n]|\\.)*"(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  for (const match of text.matchAll(pattern)) {
    const cls = match[0].startsWith('"')
      ? match[1]
        ? "hl-property"
        : "hl-string"
      : /\d/.test(match[0][0] === "-" ? match[0][1]! : match[0][0]!)
        ? "hl-number"
        : "hl-constant";
    const end = match.index + (match[1] ? match[0].length - match[1].length : match[0].length);
    spans.push({ start: match.index, end, cls });
  }
  return spans;
}

/**
 * The code pane: a text area over a highlighted copy of the text and a layer of diagnostic
 * underlines, with line numbers, completion, hover, quick fixes, rename and go to definition.
 * The text area keeps the browser's caret, selection, input methods and accessibility.
 */
export class CodePane {
  readonly element = h("div", { class: "code" });
  readonly input = h("textarea", {
    class: "code-input",
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    autocorrect: "off",
    wrap: "off",
    "aria-label": messages().code.source,
    "aria-multiline": "true",
    "aria-autocomplete": "list",
    "aria-describedby": "code-help",
  });
  private readonly highlight = h("pre", {
    class: "code-layer code-highlight",
    "aria-hidden": "true",
  });
  private readonly marks = h("pre", { class: "code-layer code-marks", "aria-hidden": "true" });
  private readonly gutter = h("div", { class: "code-gutter", "aria-hidden": "true" });
  private readonly lines = h("div", { class: "code-lines" });
  private readonly body = h("div", { class: "code-body" });
  private readonly probe = h("span", { class: "code-probe", "aria-hidden": "true" });
  private readonly popup = h("div", {
    class: "code-popup",
    id: "code-completion",
    role: "listbox",
    "aria-label": messages().code.suggestions,
    hidden: true,
  });
  private readonly tooltip = h("div", { class: "code-tooltip", role: "tooltip", hidden: true });
  private readonly renameBox = h("input", {
    class: "code-rename",
    type: "text",
    "aria-label": messages().code.newName,
    hidden: true,
  });

  private language: CodeLanguage = "meltemi";
  private diagnostics: readonly Diagnostic[] = [];
  private semantic: readonly Span[] = [];
  private lineCount = 0;
  private lastSelection: Selection = { start: 0, end: 0 };
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private caretTimer: ReturnType<typeof setTimeout> | undefined;
  private hoverAt = -1;
  /** Tab leaves the text area after Escape, so keyboard users are not trapped. */
  private tabMovesFocus = false;
  /** View mode: the text area is read-only and nothing here edits (`setReadOnly`). */
  private readOnly = false;
  private metrics: { char: number; line: number; left: number; top: number } | undefined;
  /** What other people draw over the text; made when first asked for (`presenceLayer`). */
  private presence: HTMLElement | undefined;

  /** The open completion list: its items, where the word starts and which item is active. */
  private completion:
    { items: CompletionItem[]; shown: CompletionItem[]; start: number; active: number } | undefined;
  private fixes: { actions: CodeAction[]; active: number } | undefined;

  constructor(private readonly host: CodeHost) {
    this.body.append(this.highlight, this.marks, this.input, this.probe);
    this.gutter.append(this.lines);
    this.element.append(this.gutter, this.body, this.popup, this.tooltip, this.renameBox);
    this.probe.textContent = "0".repeat(100);

    this.input.addEventListener("beforeinput", () => (this.lastSelection = this.selection()));
    this.input.addEventListener("input", (e) => this.onInput(e as InputEvent));
    this.input.addEventListener("keydown", (e) => this.onKey(e));
    this.input.addEventListener("scroll", () => this.syncScroll());
    this.input.addEventListener("mousemove", (e) => this.onMouse(e));
    this.input.addEventListener("mouseleave", () => this.hideHover());
    this.input.addEventListener("mousedown", (e) => {
      this.closePopups();
      if ((e.ctrlKey || e.metaKey) && e.button === 0) {
        const offset = this.offsetAtPoint(e.clientX, e.clientY);
        if (offset !== undefined) {
          e.preventDefault();
          this.host.definition(offset);
        }
      }
    });
    this.input.addEventListener("blur", () => {
      // Clicking the list keeps it open; anything else closes it.
      setTimeout(() => {
        if (!this.element.contains(document.activeElement)) this.closePopups();
      }, 120);
    });
    document.addEventListener("selectionchange", () => {
      if (document.activeElement !== this.input) return;
      clearTimeout(this.caretTimer);
      this.caretTimer = setTimeout(() => this.host.caret(this.input.selectionStart), 80);
    });
    this.renameBox.addEventListener("keydown", (e) => this.onRenameKey(e));
    this.renameBox.addEventListener("blur", () => this.closeRename());
    new ResizeObserver(() => (this.metrics = undefined)).observe(this.body);
  }

  get text(): string {
    return this.input.value;
  }

  selection(): Selection {
    return { start: this.input.selectionStart, end: this.input.selectionEnd };
  }

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  /**
   * View mode (`project-sharing`, "Viewing by link"): the text area becomes read-only (the browser
   * refuses typing, pasting and cutting, and the caret, the selection, copying and scrolling stay),
   * and the pane's own edits (a new line, indentation, accepting a completion, a quick fix, rename,
   * format) do nothing. Hover, the completion and fix lists open as they do, for reading, and Tab
   * moves focus on, so the keyboard is not trapped.
   */
  setReadOnly(on: boolean): void {
    this.readOnly = on;
    this.input.readOnly = on;
    if (on) this.closePopups();
  }

  /** Shows another file's text, or the same file changed elsewhere (canvas, undo, fixes). */
  setText(text: string, selection?: Selection): void {
    const scroll = { top: this.input.scrollTop, left: this.input.scrollLeft };
    if (this.input.value !== text) this.input.value = text;
    if (selection) this.input.setSelectionRange(selection.start, selection.end);
    this.input.scrollTop = scroll.top;
    this.input.scrollLeft = scroll.left;
    this.closePopups();
    this.repaint();
  }

  /** A file to edit: its text, language and accessible name. */
  open(text: string, language: CodeLanguage, label: string): void {
    this.language = language;
    this.diagnostics = [];
    this.semantic = [];
    this.input.setAttribute("aria-label", messages().code.sourceOf(label));
    this.input.value = text;
    this.input.setSelectionRange(0, 0);
    this.input.scrollTop = 0;
    this.input.scrollLeft = 0;
    this.closePopups();
    this.repaint();
  }

  /** Diagnostics and semantic colours of an analysis of exactly this text. */
  setAnalysis(text: string, diagnostics: readonly Diagnostic[], document?: DocumentAnalysis): void {
    if (text !== this.input.value) return;
    this.diagnostics = diagnostics;
    this.semantic = document && this.language === "meltemi" ? semanticSpans(document) : [];
    this.repaint();
  }

  /**
   * What the overlay of other people's carets and selections needs (`presence-overlay.ts`): a
   * layer over the text that takes no pointer, the pane's measures and its scroll. The layer is
   * made the first time this is called, so a page that has no collaborators has none of it.
   */
  overlayHost(): OverlayHost {
    if (!this.presence) {
      this.presence = h("div", { class: "code-presence", "aria-hidden": "true" });
      this.body.append(this.presence);
    }
    return {
      layer: this.presence,
      metrics: () => ({ ...this.measure(), tab: TAB }),
      scroll: () => ({ left: this.input.scrollLeft, top: this.input.scrollTop }),
      size: () => ({ width: this.input.clientWidth, height: this.input.clientHeight }),
    };
  }

  /** Selects a range and scrolls it into view; focuses the text when asked. */
  reveal(start: number, end: number, focus: boolean): void {
    this.input.setSelectionRange(start, end);
    const { line } = this.position(start);
    const metrics = this.measure();
    const top = line * metrics.line;
    if (
      top < this.input.scrollTop ||
      top > this.input.scrollTop + this.input.clientHeight - 2 * metrics.line
    ) {
      this.input.scrollTop = Math.max(0, top - this.input.clientHeight / 3);
    }
    if (focus) this.focus();
    this.syncScroll();
  }

  // Painting ----------------------------------------------------------------------------------

  private repaint(): void {
    const text = this.input.value;
    const spans =
      this.language === "meltemi"
        ? mergeSpans(
            lexicalSpans(text),
            this.semantic.filter((s) => s.end <= text.length),
          )
        : this.language === "json"
          ? jsonSpans(text)
          : [];
    paint(this.highlight, text, spans);
    const marks = this.diagnostics
      .filter((d) => d.range.start.offset <= text.length)
      .map((d) => {
        let start = d.range.start.offset;
        let end = Math.min(d.range.end.offset, text.length);
        // An empty range marks the character after it, or the one before at the end of a line.
        if (end <= start) {
          if (start < text.length && text[start] !== "\n") end = start + 1;
          else if (start > 0) start = start - 1;
          end = Math.max(end, start + 1);
        }
        return { start, end, cls: `mark-${d.severity}` };
      })
      .sort((a, b) => a.start - b.start);
    paint(this.marks, text, marks);
    this.paintGutter(text);
    this.syncScroll();
  }

  private paintGutter(text: string): void {
    let count = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) count++;
    const severities = new Map<number, string>();
    for (const d of this.diagnostics) {
      const line = d.range.start.line;
      if (d.severity === "error" || !severities.has(line)) severities.set(line, d.severity);
    }
    if (count !== this.lineCount) {
      const fragment = document.createDocumentFragment();
      for (let i = 1; i <= count; i++) fragment.append(h("div", { class: "code-line" }, String(i)));
      this.lines.replaceChildren(fragment);
      this.lineCount = count;
    }
    const children = this.lines.children;
    for (let i = 0; i < children.length; i++) {
      const severity = severities.get(i + 1);
      children[i]!.className = severity ? `code-line has-${severity}` : "code-line";
    }
  }

  private syncScroll(): void {
    const transform = `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
    this.highlight.style.transform = transform;
    this.marks.style.transform = transform;
    this.lines.style.transform = `translateY(${-this.input.scrollTop}px)`;
  }

  // Positions ---------------------------------------------------------------------------------

  private measure(): { char: number; line: number; left: number; top: number } {
    if (!this.metrics) {
      const style = getComputedStyle(this.input);
      const line = parseFloat(style.lineHeight) || 20;
      this.metrics = {
        char: this.probe.getBoundingClientRect().width / 100 || 7.8,
        line,
        left: parseFloat(style.paddingLeft) || 0,
        top: parseFloat(style.paddingTop) || 0,
      };
    }
    return this.metrics;
  }

  /** The line (from 0) and visual column of an offset; tabs advance to the next stop. */
  private position(offset: number): { line: number; column: number } {
    const text = this.input.value;
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    let line = 0;
    for (let i = 0; i < lineStart; i++) if (text.charCodeAt(i) === 10) line++;
    let column = 0;
    for (let i = lineStart; i < offset; i++)
      column = text[i] === "\t" ? (Math.floor(column / TAB) + 1) * TAB : column + 1;
    return { line, column };
  }

  /** Where an offset is drawn, relative to the pane. */
  private coordinates(offset: number): { x: number; y: number; height: number } {
    const metrics = this.measure();
    const { line, column } = this.position(offset);
    const body = this.body.getBoundingClientRect();
    const pane = this.element.getBoundingClientRect();
    return {
      x: body.left - pane.left + metrics.left + column * metrics.char - this.input.scrollLeft,
      y: body.top - pane.top + metrics.top + line * metrics.line - this.input.scrollTop,
      height: metrics.line,
    };
  }

  /** The offset under a point of the screen, or undefined beyond the text. */
  private offsetAtPoint(clientX: number, clientY: number): number | undefined {
    const metrics = this.measure();
    const rect = this.input.getBoundingClientRect();
    const y = clientY - rect.top - metrics.top + this.input.scrollTop;
    const x = clientX - rect.left - metrics.left + this.input.scrollLeft;
    if (y < 0 || x < 0) return undefined;
    const lineIndex = Math.floor(y / metrics.line);
    const text = this.input.value;
    let start = 0;
    for (let i = 0; i < lineIndex; i++) {
      const next = text.indexOf("\n", start);
      if (next < 0) return undefined;
      start = next + 1;
    }
    const end = text.indexOf("\n", start) < 0 ? text.length : text.indexOf("\n", start);
    const target = x / metrics.char;
    let column = 0;
    for (let i = start; i < end; i++) {
      const next = text[i] === "\t" ? (Math.floor(column / TAB) + 1) * TAB : column + 1;
      if (target < next) return i;
      column = next;
    }
    return undefined;
  }

  // Typing ------------------------------------------------------------------------------------

  private onInput(event: InputEvent): void {
    const before = this.lastSelection;
    const after = this.selection();
    this.repaint();
    this.host.typed(this.input.value, before, after);
    this.lastSelection = after;
    const typed = event.data ?? "";
    if (this.completion) this.filterCompletion();
    else if (
      this.language === "meltemi" &&
      event.inputType === "insertText" &&
      typed.length === 1 &&
      /[A-Za-z]/.test(typed) &&
      !WORD.test(this.input.value[after.start - 2] ?? "")
    ) {
      // A new word: suggest what may be written here.
      this.openCompletion(false);
    }
  }

  /** Replaces the selection with text, as typing does (one step of typing). */
  private type(text: string, select?: [number, number]): void {
    const before = this.selection();
    this.input.setRangeText(text, before.start, before.end, "end");
    if (select) this.input.setSelectionRange(select[0], select[1]);
    const after = this.selection();
    this.repaint();
    this.host.typed(this.input.value, before, after);
    this.lastSelection = after;
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (
      this.completion &&
      this.listKey(e, this.completion.shown.length, (i) => this.acceptCompletion(i))
    )
      return;
    if (this.fixes && this.listKey(e, this.fixes.actions.length, (i) => this.applyFix(i))) return;
    if (e.key === "Escape") {
      if (this.closePopups()) e.preventDefault();
      else this.tabMovesFocus = true;
      return;
    }
    if (e.key === "Tab" && !mod && !e.altKey) {
      // A pane that edits nothing has no use for Tab but to move on.
      if (this.tabMovesFocus || this.readOnly) {
        this.tabMovesFocus = false;
        return;
      }
      e.preventDefault();
      this.indent(e.shiftKey);
      return;
    }
    this.tabMovesFocus = false;
    if (e.key === "Enter" && !mod && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      this.newline();
    } else if (mod && (e.key === " " || e.code === "Space")) {
      e.preventDefault();
      this.openCompletion(true);
    } else if (mod && e.key === ".") {
      e.preventDefault();
      this.openFixes();
    } else if (e.shiftKey && e.altKey && (e.key === "F" || e.key === "f" || e.code === "KeyF")) {
      e.preventDefault();
      if (!this.readOnly) this.host.format();
    } else if (e.key === "F2") {
      e.preventDefault();
      this.openRename();
    } else if (e.key === "F12") {
      e.preventDefault();
      this.host.definition(this.input.selectionStart);
    }
  }

  /** Arrow keys, Enter, Tab and Escape in an open list; true when the key was used. */
  private listKey(e: KeyboardEvent, count: number, accept: (index: number) => void): boolean {
    const state = this.completion ?? this.fixes;
    if (!state) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (count === 0) return true;
      state.active = (state.active + (e.key === "ArrowDown" ? 1 : count - 1)) % count;
      this.drawList();
      return true;
    }
    if (e.key === "Enter" || (e.key === "Tab" && this.completion)) {
      if (count === 0) return false;
      e.preventDefault();
      accept(state.active);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.closePopups();
      return true;
    }
    return false;
  }

  /** Enter: a line break that keeps the indentation, one level deeper after `{`. */
  private newline(): void {
    if (this.readOnly) return;
    const text = this.input.value;
    const at = this.input.selectionStart;
    const lineStart = text.lastIndexOf("\n", at - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart, at))![0];
    const before = text.slice(lineStart, at).trimEnd();
    const after = text.slice(this.input.selectionEnd).match(/^[ \t]*(.)?/)?.[1];
    const opens = before.endsWith("{") || before.endsWith("(") || before.endsWith("[");
    if (opens && (after === "}" || after === ")" || after === "]")) {
      const inner = `\n${indent}${" ".repeat(TAB)}`;
      this.type(`${inner}\n${indent}`, [at + inner.length, at + inner.length]);
      return;
    }
    this.type(`\n${indent}${opens ? " ".repeat(TAB) : ""}`);
  }

  /** Tab and Shift+Tab: indents or unindents the selected lines, or inserts spaces. */
  private indent(back: boolean): void {
    if (this.readOnly) return;
    const text = this.input.value;
    const { start, end } = this.selection();
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    if (!back && start === end) {
      const column = start - lineStart;
      this.type(" ".repeat(TAB - (column % TAB)));
      return;
    }
    const blockEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const lines = text.slice(lineStart, blockEnd).split("\n");
    let removedFirst = 0;
    const changed = lines.map((line, i) => {
      if (!back) return line.length > 0 ? " ".repeat(TAB) + line : line;
      const remove = /^( {1,2}|\t)?/.exec(line)![0].length;
      if (i === 0) removedFirst = remove;
      return line.slice(remove);
    });
    const replacement = changed.join("\n");
    const before = this.selection();
    this.input.setRangeText(replacement, lineStart, blockEnd, "preserve");
    const delta = replacement.length - (blockEnd - lineStart);
    const newStart = back
      ? Math.max(lineStart, start - removedFirst)
      : start + (lines[0]!.length > 0 ? TAB : 0);
    this.input.setSelectionRange(
      start === end ? newStart : lineStart,
      Math.max(newStart, end + delta),
    );
    const after = this.selection();
    this.repaint();
    this.host.typed(this.input.value, before, after);
    this.lastSelection = after;
  }

  // Completion ----------------------------------------------------------------------------------

  private openCompletion(explicit: boolean): void {
    if (this.language !== "meltemi") return;
    const analysis = this.host.analysis();
    if (!analysis || analysis.text !== this.input.value) return;
    const offset = this.input.selectionStart;
    const items = completions(analysis, offset);
    if (items.length === 0) {
      if (explicit) this.showTooltip(offset, [h("p", {}, messages().code.noSuggestions)]);
      return;
    }
    const start = Math.min(...items.map((i) => i.range.start), offset);
    this.completion = { items, shown: items, start, active: 0 };
    this.filterCompletion();
  }

  private filterCompletion(): void {
    const state = this.completion;
    if (!state) return;
    const caret = this.input.selectionStart;
    if (caret < state.start) {
      this.closePopups();
      return;
    }
    const prefix = this.input.value.slice(state.start, caret).toLowerCase();
    if (/[^A-Za-z0-9_.:@-]/.test(prefix)) {
      this.closePopups();
      return;
    }
    state.shown = state.items
      .filter((item) => item.label.toLowerCase().startsWith(prefix))
      .concat(
        prefix.length > 1
          ? state.items.filter(
              (item) =>
                !item.label.toLowerCase().startsWith(prefix) &&
                item.label.toLowerCase().includes(prefix),
            )
          : [],
      );
    if (state.shown.length === 0) {
      this.closePopups();
      return;
    }
    state.active = Math.min(state.active, state.shown.length - 1);
    this.drawList();
  }

  private acceptCompletion(index: number): void {
    // The list can be read in view mode; choosing from it changes nothing and closes it.
    if (this.readOnly) {
      this.closePopups();
      return;
    }
    const state = this.completion;
    const item = state?.shown[index];
    if (!state || !item) return;
    const caret = this.input.selectionEnd;
    const start = Math.min(item.range.start, state.start);
    const end = Math.max(caret, Math.min(item.range.end, caret));
    const insert = item.insertText ?? item.label;
    const { text, select } = item.snippet
      ? expandSnippet(insert)
      : { text: insert, select: undefined };
    this.closePopups();
    const after = select
      ? { start: start + select[0], end: start + select[1] }
      : { start: start + text.length, end: start + text.length };
    this.host.edit([{ start, end, newText: text }], after);
  }

  // Quick fixes -------------------------------------------------------------------------------

  private openFixes(): void {
    if (this.readOnly) return;
    const analysis = this.host.analysis();
    if (!analysis || analysis.text !== this.input.value) return;
    const { start, end } = this.selection();
    const actions = codeActions(analysis, { start, end });
    if (actions.length === 0) {
      this.showTooltip(start, [h("p", {}, messages().code.noFixes)]);
      return;
    }
    const preferred = Math.max(
      0,
      actions.findIndex((a) => a.preferred),
    );
    this.fixes = { actions, active: preferred };
    this.drawList();
  }

  private applyFix(index: number): void {
    if (this.readOnly) {
      this.closePopups();
      return;
    }
    const action = this.fixes?.actions[index];
    this.closePopups();
    if (action) this.host.edit(action.edits);
  }

  /** Quick fixes at an offset, for the problems list. */
  fixesAt(start: number, end: number): CodeAction[] {
    const analysis = this.host.analysis();
    return analysis && analysis.text === this.input.value
      ? codeActions(analysis, { start, end })
      : [];
  }

  // Lists -------------------------------------------------------------------------------------

  private drawList(): void {
    const options: { label: string; detail?: string }[] = this.completion
      ? this.completion.shown.map((i) => ({
          label: i.label,
          ...(i.detail ? { detail: i.detail } : {}),
        }))
      : (this.fixes?.actions.map((a) => ({ label: a.title })) ?? []);
    const active = (this.completion ?? this.fixes)?.active ?? 0;
    const m = messages().code;
    this.popup.setAttribute("aria-label", this.completion ? m.suggestions : m.quickFixes);
    const children = options.slice(0, 200).map((option, i) => {
      const node = h(
        "div",
        {
          class: i === active ? "code-option active" : "code-option",
          role: "option",
          id: `code-option-${i}`,
          "aria-selected": i === active ? "true" : "false",
        },
        h("span", { class: "code-option-label" }, option.label),
      );
      if (option.detail) node.append(h("span", { class: "code-option-detail" }, option.detail));
      node.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (this.completion) this.acceptCompletion(i);
        else this.applyFix(i);
      });
      return node;
    });
    this.popup.replaceChildren(...children);
    this.popup.hidden = false;
    const anchor = this.completion?.start ?? this.input.selectionStart;
    const at = this.coordinates(anchor);
    this.place(this.popup, at.x, at.y + at.height);
    this.input.setAttribute("aria-controls", "code-completion");
    this.input.setAttribute("aria-expanded", "true");
    this.input.setAttribute("aria-activedescendant", `code-option-${active}`);
    children[active]?.scrollIntoView({ block: "nearest" });
  }

  /** Places a floating element at a point of the pane, kept inside it. */
  private place(element: HTMLElement, x: number, y: number): void {
    const pane = this.element.getBoundingClientRect();
    element.style.left = "0px";
    element.style.top = "0px";
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = Math.max(4, Math.min(x, pane.width - width - 4));
    const top = y + height > pane.height - 4 && y - height - 24 > 0 ? y - height - 24 : y;
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(4, top)}px`;
  }

  /** Closes the lists, the tooltip and the rename box; true when one was open. */
  closePopups(): boolean {
    const open = !this.popup.hidden || !this.tooltip.hidden || !this.renameBox.hidden;
    this.completion = undefined;
    this.fixes = undefined;
    this.popup.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.hideHover();
    if (!this.renameBox.hidden) this.closeRename();
    return open;
  }

  // Hover -------------------------------------------------------------------------------------

  private onMouse(e: MouseEvent): void {
    const offset = this.offsetAtPoint(e.clientX, e.clientY);
    if (offset === this.hoverAt) return;
    this.hoverAt = offset ?? -1;
    clearTimeout(this.hoverTimer);
    if (!this.tooltip.hidden && this.popup.hidden) this.tooltip.hidden = true;
    if (offset === undefined || !this.popup.hidden) return;
    this.hoverTimer = setTimeout(() => this.showHover(offset), 450);
  }

  private showHover(offset: number): void {
    const content: Node[] = [];
    for (const d of this.diagnostics) {
      const start = d.range.start.offset;
      const end = Math.max(d.range.end.offset, start + 1);
      if (offset < start || offset >= end) continue;
      const block = h(
        "div",
        { class: `code-diagnostic is-${d.severity}` },
        h("p", {}, d.message, " ", h("code", {}, d.code)),
      );
      for (const hint of d.hints ?? []) block.append(h("p", { class: "hint" }, hint));
      content.push(block);
    }
    if (this.language === "meltemi") {
      const analysis = this.host.analysis();
      const found =
        analysis && analysis.text === this.input.value ? hover(analysis, offset) : undefined;
      if (found) content.push(markdown(found.markdown));
    }
    if (content.length > 0) this.showTooltip(offset, content);
  }

  private showTooltip(offset: number, content: Node[]): void {
    this.tooltip.replaceChildren(...content);
    this.tooltip.hidden = false;
    const at = this.coordinates(offset);
    this.place(this.tooltip, at.x, at.y + at.height + 2);
  }

  private hideHover(): void {
    clearTimeout(this.hoverTimer);
    this.tooltip.hidden = true;
  }

  // Rename ------------------------------------------------------------------------------------

  private renameAt = -1;

  private openRename(): void {
    if (this.readOnly) return;
    const analysis = this.host.analysis();
    if (!analysis || analysis.text !== this.input.value) return;
    const offset = this.input.selectionStart;
    const prepared = prepareRename(analysis, offset);
    if (!prepared.ok) {
      this.showTooltip(offset, [h("p", {}, prepared.reason)]);
      return;
    }
    this.renameAt = offset;
    this.renameBox.value = prepared.placeholder;
    this.renameBox.hidden = false;
    const at = this.coordinates(prepared.range.start.offset);
    this.place(this.renameBox, at.x - 4, at.y + at.height + 2);
    this.renameBox.focus();
    this.renameBox.select();
  }

  private onRenameKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      this.closeRename();
      this.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const value = this.renameBox.value.trim();
      const offset = this.renameAt;
      this.closeRename();
      this.focus();
      const problem = value === "" ? messages().code.giveName : this.host.rename(offset, value);
      if (problem) this.showTooltip(offset, [h("p", {}, problem)]);
    }
  }

  private closeRename(): void {
    this.renameBox.hidden = true;
  }
}

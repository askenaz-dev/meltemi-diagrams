// What the page adds for live sessions (`live-sessions`, "The page as a guest" and "The owner's
// controls"): the guest bar under the header, for a person without an account in a project's room
// (the session or the project they follow, the name others see, "Make a copy" and sign-in), and the
// owner's "Live · N guests" chip in the header, which opens the share dialog. Both follow the open
// project; a name is always set as text, never as markup.

import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { announce, h, icon } from "../ui.js";
import type { CloudController } from "./controller.js";
import { cleanGuestName } from "./guest.js";
import { DUPLICATE_ICON } from "./icons.js";
import { leftText, liveApi } from "./live.js";
import { openShareDialog } from "./share.js";

/** A person without an account on the page: their name, and how to change it. */
export interface GuestName {
  name(): string;
  /** Keeps a new name (already checked) for this browser. */
  setName(name: string): void;
}

/** How often the time a session has left is written again. */
const TICK_MS = 30_000;

/** The guests in the open project now, from presence: people the room marks as having no account. */
export function guestsIn(controller: CloudController | undefined): number {
  return controller?.presence?.people().filter((person) => person.guest).length ?? 0;
}

/**
 * The bar under the header for a person without an account in a project's room: "You are in the
 * live session of Together as [Guest 37]" (or "following Together live" for a visitor of a link),
 * the name field (a new name reconnects with it, since the room names people by their connection),
 * the time the session has left, "Make a copy" and "Sign in".
 */
export function mountGuestBar(
  playground: Playground,
  controller: CloudController,
  guest: GuestName,
  signIn: string | undefined,
): void {
  const m = () => messages().cloud.live.bar;
  const unique = Math.random().toString(36).slice(2, 8);
  const text = h("span", { class: "guest-bar-text" });
  const input = h("input", {
    type: "text",
    id: `guest-name-${unique}`,
    class: "guest-name-input",
    maxlength: 80,
    autocomplete: "nickname",
    spellcheck: "false",
    "aria-describedby": `guest-name-hint-${unique}`,
  }) as HTMLInputElement;
  const rename = h(
    "button",
    { type: "submit", class: "button with-text guest-rename", hidden: true },
    h("span", {}, m().rename),
  );
  const form = h(
    "form",
    { class: "guest-name", novalidate: true },
    h("label", { class: "sr-only", for: input.id }, m().nameLabel),
    input,
    rename,
    h("span", { class: "sr-only", id: `guest-name-hint-${unique}` }, m().nameHint),
  );
  const ends = h("span", { class: "guest-bar-ends" });
  const copy = h(
    "button",
    { type: "button", class: "button with-text guest-copy", title: m().copyTitle },
    icon(DUPLICATE_ICON),
    h("span", {}, m().copy),
  );
  copy.addEventListener("click", () => void playground.viewing.makeCopy());
  const actions = h("span", { class: "guest-bar-actions" }, copy);
  if (signIn !== undefined) {
    actions.append(
      h(
        "a",
        { class: "button with-text primary guest-sign-in", href: signIn, title: m().signInTitle },
        h("span", {}, m().signIn),
      ),
    );
  }
  const bar = h(
    "div",
    { class: "guest-bar", role: "region", "aria-label": m().label, hidden: true },
    h("span", { class: "guest-bar-dot", "aria-hidden": "true" }),
    text,
    form,
    ends,
    actions,
  );
  playground.root.querySelector(".topbar")?.after(bar);

  input.value = guest.name();
  input.addEventListener("input", () => {
    rename.hidden = input.value.trim() === guest.name();
    input.removeAttribute("aria-invalid");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = cleanGuestName(input.value);
    if (name === undefined) {
      input.setAttribute("aria-invalid", "true");
      playground.status(m().nameInvalid);
      return;
    }
    rename.hidden = true;
    input.value = name;
    if (name === guest.name()) return;
    guest.setName(name);
    controller.guestRenamed();
    playground.status(m().renamed(name));
  });

  const draw = (): void => {
    const project = controller.openProject;
    bar.hidden = project === undefined;
    playground.root.dataset.guest = project === undefined ? "none" : "in";
    if (!project) return;
    const session = controller.session;
    text.textContent = session ? m().guest(project.name) : m().visitor(project.name);
    bar.classList.toggle("in-session", session !== undefined);
    const left = session ? leftText(session.until, Date.now(), messages().cloud.live) : "";
    ends.textContent = left === "" ? "" : m().ends(left);
    ends.hidden = left === "";
    // A guest who edits copies from here; a viewer has the header's view controls.
    copy.hidden = controller.role === "viewer";
    if (document.activeElement !== input) input.value = guest.name();
  };
  controller.subscribe(draw);
  controller.watchSession(draw);
  setInterval(draw, TICK_MS);
  draw();
}

/**
 * The owner's chip while a live session the page knows of is on: "Live · 2 guests", in the header's
 * cloud slot, opening the share dialog. The page learns of the session from the dialog that started
 * it, and by reading it when the owner opens the project (one started on another device shows).
 */
export function mountLiveChip(playground: Playground, controller: CloudController): void {
  const label = h("span", { class: "live-chip-label" });
  const chip = h(
    "button",
    {
      type: "button",
      class: "live-chip",
      hidden: true,
      "aria-haspopup": "dialog",
    },
    h("span", { class: "live-chip-dot", "aria-hidden": "true" }),
    label,
  );
  chip.addEventListener("click", () => openShareDialog(playground));
  playground.cloudSlot.prepend(chip);

  let shown = "";
  const draw = (): void => {
    const project = controller.openProject;
    const session = playground.live.of(project?.id) ?? undefined;
    const on =
      session !== undefined &&
      controller.role === "owner" &&
      Date.parse(session.until) > Date.now();
    chip.hidden = !on;
    if (!on) {
      shown = "";
      return;
    }
    const words = messages().cloud.live;
    const text = words.chip(guestsIn(controller));
    chip.title = words.chipTitle;
    if (text === shown) return;
    // The first time it shows, it is said: the owner learns the session is on.
    if (shown === "") announce(text);
    shown = text;
    label.textContent = text;
  };
  const read = async (id: string): Promise<void> => {
    const env = playground.options.cloud;
    if (!env) return;
    const answer = await liveApi(env.fetch, { href: env.location.href() }).read(id);
    if (answer.ok && controller.openProject?.id === id) playground.live.set(id, answer.value);
  };
  let follow: (() => void) | undefined;
  controller.subscribe((project) => {
    follow?.();
    follow = undefined;
    if (!project) {
      playground.live.forget();
      draw();
      return;
    }
    // The guests come and go: the chip counts them from presence.
    follow = controller.presence?.listen(draw);
    if (controller.role === "owner") void read(project.id);
    draw();
  });
  playground.live.listen(draw);
  setInterval(draw, TICK_MS);
}

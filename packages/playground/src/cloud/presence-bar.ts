// The header's "who is here" (`live-collaboration`, "Presence"): an avatar and a name in the colour
// of each person who has the project open, with the file they are in; clicking a person opens that
// file. A list a screen reader reads, one button per person; the people beyond the first few are in
// a menu. Everything a person gave, the name above all, reaches the page as text, never as markup,
// and the avatar passes the account control's rule.

import { menuButton } from "../menu.js";
import { messages } from "../messages/index.js";
import { h } from "../ui.js";
import { avatar } from "./avatar.js";
import type { Person } from "./presence-model.js";

/** The people listed in the header itself; the others are in a menu. */
export const LISTED = 4;

export interface PresenceBarActions {
  /** Opens a file of the project (a person was clicked). */
  open(path: string): void;
}

export interface PresenceBar {
  /** For the header's cloud slot. Hidden while nobody else is here. */
  readonly element: HTMLElement;
  /** Draws these people. */
  update(people: readonly Person[]): void;
}

/** The last part of a path: the name of a file without its folders. */
const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export function presenceBar(actions: PresenceBarActions): PresenceBar {
  const list = h("ul", {
    class: "presence-list",
    role: "list",
    "aria-label": messages().presence.group,
  });
  const element = h("div", { class: "presence-bar", hidden: true }, list);
  let overflow: HTMLElement | undefined;

  const person = (who: Person): HTMLElement => {
    const m = messages().presence;
    const name = who.name === "" ? m.unnamed : who.name;
    const where = who.file?.path;
    const button = h(
      "button",
      {
        type: "button",
        class: "presence-person",
        title: where === undefined ? m.noFile : m.go(where),
        "aria-label": m.person(name, where),
        ...(where === undefined ? { "aria-disabled": "true" } : {}),
      },
      avatar(who.picture),
      h("span", { class: "presence-name" }, name),
      ...(where === undefined ? [] : [h("span", { class: "presence-file" }, fileName(where))]),
    );
    button.style.setProperty("--presence", who.colour);
    button.addEventListener("click", () => {
      if (where !== undefined) actions.open(where);
    });
    return h("li", { class: "presence-item" }, button);
  };

  return {
    element,
    update(people) {
      element.hidden = people.length === 0;
      list.replaceChildren(...people.slice(0, LISTED).map(person));
      overflow?.remove();
      overflow = undefined;
      const rest = people.slice(LISTED);
      if (rest.length === 0) return;
      const m = messages().presence;
      overflow = h(
        "li",
        { class: "presence-item presence-more" },
        menuButton(
          {
            id: "presence-more",
            label: m.more(rest.length),
            icon: "person",
            name: m.moreName(rest.length),
            menu: m.moreMenu,
          },
          () =>
            rest.map((who) => ({
              label: who.name === "" ? m.unnamed : who.name,
              ...(who.file ? { detail: who.file.path } : {}),
              disabled: who.file === undefined,
              run: () => {
                if (who.file) actions.open(who.file.path);
              },
            })),
        ),
      );
      list.append(overflow);
    },
  };
}

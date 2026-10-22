// A person's picture, shared by the account control, the account panel and the presence bar.

import { ICONS, h, icon } from "../ui.js";

/** A person's picture, or a person's outline when they have none or it cannot be loaded. */
export function avatar(picture: string | undefined, size = 20): HTMLElement {
  const outline = () => h("span", { class: "account-avatar outline" }, icon(ICONS.person));
  if (picture === undefined) return outline();
  const image = h("img", {
    class: "account-avatar",
    src: picture,
    alt: "",
    width: size,
    height: size,
    referrerpolicy: "no-referrer",
    decoding: "async",
  });
  image.addEventListener("error", () => image.replaceWith(outline()), { once: true });
  return image;
}

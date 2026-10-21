/** A page of the catalog, as its hash names it (decision 0027). */
export type Route =
  | { readonly page: "home" }
  | {
      readonly page: "diagram";
      readonly key: string;
      readonly scenario: string | null;
      readonly element: string | null;
    }
  | { readonly page: "story"; readonly key: string }
  | { readonly page: "entities" }
  | { readonly page: "entity"; readonly key: string }
  | { readonly page: "search"; readonly query: string }
  | { readonly page: "missing" };

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** The hash of a route, such as `#/diagram/diagrams/checkout/checkout?scenario=ok`. */
export function href(route: Route): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "diagram": {
      const params = [
        ...(route.scenario !== null ? [`scenario=${encodeURIComponent(route.scenario)}`] : []),
        ...(route.element !== null ? [`element=${encodeURIComponent(route.element)}`] : []),
      ];
      return `#/diagram/${encodeKey(route.key)}${params.length > 0 ? `?${params.join("&")}` : ""}`;
    }
    case "story":
      return `#/story/${encodeKey(route.key)}`;
    case "entities":
      return "#/entities";
    case "entity":
      return `#/entity/${encodeKey(route.key)}`;
    case "search":
      return `#/search?q=${encodeURIComponent(route.query)}`;
    case "missing":
      return "#/missing";
  }
}

/** The route a hash names; null for hashes that are not routes, such as `#main`. */
export function parseRoute(hash: string): Route | null {
  if (hash === "" || hash === "#") return { page: "home" };
  if (!hash.startsWith("#/")) return null;
  const [path = "", query = ""] = hash.slice(2).split("?", 2);
  const params = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const [name = "", value = ""] = pair.split("=", 2);
    const decoded = decode(value.replace(/\+/g, " "));
    if (decoded !== null) params.set(name, decoded);
  }
  const slash = path.indexOf("/");
  const page = slash < 0 ? path : path.slice(0, slash);
  const key = slash < 0 ? "" : decode(path.slice(slash + 1));
  switch (page) {
    case "":
      return { page: "home" };
    case "entities":
      return { page: "entities" };
    case "search":
      return { page: "search", query: params.get("q") ?? "" };
    case "diagram":
      return key
        ? {
            page: "diagram",
            key,
            scenario: params.get("scenario") ?? null,
            element: params.get("element") ?? null,
          }
        : { page: "missing" };
    case "story":
      return key ? { page: "story", key } : { page: "missing" };
    case "entity":
      return key ? { page: "entity", key } : { page: "missing" };
    default:
      return { page: "missing" };
  }
}

import { plural } from "@meltemi/diagrams-i18n";

/**
 * The catalog's words in English: the page around the content, navigation, headings, tables and
 * search. Sentences with values are functions, so each language builds its own grammar; values
 * written into HTML arrive escaped.
 */
export const en = {
  /** The parts of every page: the header, the search box, the navigation and the footer. */
  page: {
    skip: "Skip to content",
    /** The search box's label, for screen readers. */
    searchLabel: "Search the catalog",
    searchPlaceholder: "Search (press /)",
    /** What search looks at, for screen readers. */
    searchHint: "Titles, elements, technology, descriptions and entities.",
    /** The name of the navigation. */
    navigation: "Catalog",
    noScript: "The drawings, the player and search need JavaScript; the lists work without it.",
    /** The footer, with the generator and its version: "Built with Meltemi Diagrams 1.3.0." */
    builtWith: (generator: string) => `Built with ${generator}.`,
    /** Shown instead of the catalog when its data is missing or in another format. */
    unreadable: "This catalog cannot read its data.",
  },
  /** The navigation and the breadcrumb. */
  nav: {
    /** The first page, which lists every diagram and story by folder. */
    overview: "Overview",
    entities: "Entities",
    folders: "Folders",
    breadcrumb: "Breadcrumb",
    /** The folder of the files at the project's root. */
    root: "Project root",
  },
  /** How diagram types, stories and entities read on badges and in search. */
  kinds: {
    flow: "Flow",
    free: "Free",
    sequence: "Sequence",
    c4: "C4",
    story: "Story",
    entity: "Entity",
  },
  /** The overview's counts: "7 diagrams · 1 story · 8 entities". */
  counts: {
    diagrams: (n: number) => `${n} ${plural("en", n, { one: "diagram", other: "diagrams" })}`,
    stories: (n: number) => `${n} ${plural("en", n, { one: "story", other: "stories" })}`,
    entities: (n: number) => `${n} ${plural("en", n, { one: "entity", other: "entities" })}`,
    scenes: (n: number) => `${n} ${plural("en", n, { one: "scene", other: "scenes" })}`,
  },
  /** A diagram's or a story's page. */
  entry: {
    /** Where something is, as HTML: "`id` in `file`". */
    place: (what: string, where: string) => `${what} in ${where}`,
    downloadSvg: "Download SVG",
    downloadSource: "Download source",
    source: "Source",
    scenario: "Scenario",
    /** The view of a sequence diagram as written, before its scenarios. */
    asWritten: "As written",
    elements: "Elements",
    relations: "Relations",
    /** An element drawn from outside the system. */
    external: "external",
    /** Where an element leads, as HTML: "Entity <a>API</a>". */
    entity: (link: string) => `Entity ${link}`,
    /** What an element opens, as HTML: "Opens <a>containers</a>". */
    opens: (link: string) => `Opens ${link}`,
    openLink: "Open link",
    /** The badge of a relation inferred and not confirmed. */
    assumption: "Assumption",
    related: "Related",
    storiesShowing: "Stories that show it",
    linksTo: "Links to",
    linkedFrom: "Linked from",
    scenes: "Scenes",
    /** When a scene starts: "at 1.8 s". */
    startsAt: (time: string) => `at ${time}`,
    shows: "Diagrams it shows",
  },
  /** The headers of the tables of elements, relations and entities. */
  columns: {
    element: "Element",
    entity: "Entity",
    kind: "Kind",
    technology: "Technology",
    description: "Description",
    leadsTo: "Leads to",
    from: "From",
    to: "To",
    label: "Label",
    shownIn: "Shown in",
  },
  /** The entities' pages. */
  entities: {
    lead: "The entities of the architecture models that catalogued views draw.",
    /** An entity outside the system. */
    external: "external",
    partOf: "Part of",
    link: "Link",
    model: "Model",
    /** The C4 views scoped to an entity. */
    views: "Views scoped to it",
    contains: "Contains",
    shownIn: "Shown in",
  },
  /** The search page, and where each result matched besides its title. */
  search: {
    title: "Search",
    prompt: "Type to search titles, elements, technology and descriptions.",
    /** The count of results: "3 results for “pedidos”.". */
    results: (n: number, query: string) => {
      const results = plural("en", n, { one: "result", other: "results" });
      return `${n === 0 ? "No" : n} ${results} for “${query}”.`;
    },
    file: (file: string) => `file ${file}`,
    description: "description",
    scene: (title: string) => `scene “${title}”`,
    element: (label: string) => `element “${label}”`,
    technologyOf: (label: string, text: string) => `technology of “${label}”: “${text}”`,
    descriptionOf: (label: string, text: string) => `description of “${label}”: “${text}”`,
    relation: (label: string) => `relation “${label}”`,
    technology: (text: string) => `technology “${text}”`,
  },
  /** The page of an address that leads nowhere. */
  missing: {
    title: "Not found",
    text: "Nothing in this catalog has this address.",
    home: "Go to the overview",
  },
};

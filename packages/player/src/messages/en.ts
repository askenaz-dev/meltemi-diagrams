import { plural } from "@meltemi/diagrams-i18n";

/**
 * The player's words in English: its controls, what it announces and its text summaries. Sentences
 * with values are functions, so each language builds its own grammar; times arrive formatted.
 */
export const en = {
  /** The buttons, slider and scene picker, with the keys their tooltips name. */
  controls: {
    /** The name of the group of controls. */
    group: "Player controls",
    play: "Play",
    pause: "Pause",
    /** The play button's tooltip, with its label: "Play (Space)". */
    playTitle: (label: string) => `${label} (Space)`,
    previous: "Previous scene",
    previousTitle: "Previous scene (Page Up)",
    next: "Next scene",
    nextTitle: "Next scene (Page Down)",
    /** The time slider. */
    progress: "Progress",
    /** The scene picker. */
    scene: "Scene",
    staticView: "Static view",
    staticTitle: "Static view (S)",
    /** The slider's value as screen readers say it: "1.8 s of 7.4 s". */
    position: (time: string, duration: string) => `${time} of ${duration}`,
    /** The name of the zoom buttons' group. */
    zoomGroup: "Zoom",
    zoomIn: "Zoom in",
    zoomInTitle: "Zoom in (+)",
    zoomOut: "Zoom out",
    zoomOutTitle: "Zoom out (−)",
    fit: "Fit the drawing",
    fitTitle: "Fit the drawing (0)",
    actualSizeTitle: "Actual size (1)",
    /** The zoom level button, with its percentage: "Zoom 150%. Actual size (1)". */
    zoomLevel: (percent: string) => `Zoom ${percent}. Actual size (1)`,
  },
  /** The path of views above the one on screen, and the way back up. */
  trail: {
    label: "Path",
    up: (view: string) => `Up to ${view}`,
    upTitle: (view: string) => `Up to ${view} (Backspace)`,
  },
  /** Hover cards and the detail panel. */
  details: {
    /** The panel's name: "Details of API". */
    region: (label: string) => `Details of ${label}`,
    close: "Close details",
    closeTitle: "Close (Escape)",
    kind: "Kind",
    technology: "Technology",
    description: "Description",
    link: "Link",
    openLink: "Open link",
    external: "external",
    relations: "Relations",
    outgoing: "Outgoing",
    incoming: "Incoming",
    noRelations: "No relations.",
    from: "From",
    to: "To",
    assumption: "Assumption",
    /** A relation's assumption on its card: "Assumption: read from the logs". */
    assumed: (why: string) => `Assumption: ${why}`,
    /** C4: how many model relations a drawn relation stands for. */
    standsFor: (n: number) =>
      `Stands for ${n} model ${plural("en", n, { one: "relation", other: "relations" })}`,
    lifted: "lifted",
    async: "Asynchronous",
    /** The button that opens what an element holds: "Open containers". */
    open: (view: string) => `Open ${view}`,
    openTitle: "Open (double click or Enter)",
    /** What an element opens, in the elements list: "opens containers". */
    opens: (view: string) => `opens ${view}`,
    /** The list of elements under the text summary. */
    elements: "Elements",
  },
  /** What the player says of its document. */
  player: {
    /** The accessible name of a story's player: "Story: A purchase". */
    story: (title: string) => `Story: ${title}`,
    /** The accessible name of a diagram's player: "Diagram: Checkout". */
    diagram: (title: string) => `Diagram: ${title}`,
    /** The scene on screen, announced when it changes: "Scene 2 of 2: processing". */
    scene: (n: number, count: number, id: string, title: string | null) =>
      `Scene ${n} of ${count}: ${id}${title ? `, ${title}` : ""}`,
    /** Shown instead of a player whose data is missing or in another format. */
    unreadable: "This player cannot read its data.",
    /** The drawing's name when it takes input: "Commerce. Interactive drawing". */
    interactive: (title: string) => `${title}. Interactive drawing`,
    /** How to use the drawing from the keyboard, read with its name. */
    hint: "Up and Down walk the elements, Enter shows their details, Escape clears.",
    /** After a key or button zoom: "Zoom 150%". */
    zoom: (percent: string) => `Zoom ${percent}`,
    /** After fitting: "Whole drawing, 62%". */
    fitted: (percent: string) => `Whole drawing, ${percent}`,
    /** An element or relation selected: "Selected: API". */
    selected: (label: string) => `Selected: ${label}`,
    cleared: "Selection cleared",
    /** The item the keyboard walk reached: "API, Container". */
    focused: (label: string, type: string | null) => (type ? `${label}, ${type}` : label),
    /** A relation's name when it has no label: "Web → API". */
    relation: (from: string, to: string) => `${from} → ${to}`,
    /** After a drill-down: "Opened containers". */
    opened: (view: string) => `Opened ${view}`,
    /** After going up: "Back in context". */
    wentUp: (view: string) => `Back in ${view}`,
  },
  /** The text summary of a story: its scenes, and their actions with the elements' labels. */
  story: {
    /** The summary's title. */
    summary: "Text summary",
    /** A scene's heading: "Scene 1: overview (0 s to 1.8 s)". */
    scene: (n: number, name: string, start: string, end: string) =>
      `Scene ${n}: ${name} (${start} to ${end})`,
    /** Names joined as the language writes a list: "a, b and c". */
    list: (items: readonly string[]) =>
      items.length <= 1
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`,
    /** A change of view: "Fade to Containers over 800 ms"; null when it takes no time. */
    transition: (kind: "cut" | "fade" | "morph", view: string, time: string | null) => {
      const verb = { cut: "Cut", fade: "Fade", morph: "Morph" }[kind];
      return `${verb} to ${view}${time === null ? "" : ` over ${time}`}`;
    },
    reveal: (targets: string, time: string) => `Reveal ${targets} over ${time}`,
    hide: (targets: string, time: string) => `Hide ${targets} over ${time}`,
    highlight: (targets: string, time: string) => `Highlight ${targets} for ${time}`,
    focus: (targets: string) => `Focus on ${targets}`,
    /** `focus all`. */
    clearFocus: "Clear the focus",
    /** `camera`: "Frame API and DB". */
    frame: (targets: string) => `Frame ${targets}`,
    /** `camera all`. */
    frameAll: "Frame the whole view",
    /** A trace along a relation, from one end to the other when the view knows them. */
    trace: (relation: string, ends: readonly [string, string] | null, time: string) =>
      `Trace “${relation}”${ends ? ` from ${ends[0]} to ${ends[1]}` : ""} over ${time}`,
    hold: (time: string) => `Hold ${time}`,
    /** Actions that start together, already joined with semicolons. */
    parallel: (actions: string) => `At the same time: ${actions}`,
  },
  /** The text summary of a diagram's effects. */
  effects: {
    none: "No effects.",
    flow: (target: string) => `Flow particles along “${target}”`,
    dash: (target: string) => `A moving dash along “${target}”`,
    trace: (target: string) => `A trace along “${target}”`,
    pulse: (target: string) => `A pulse on “${target}”`,
    /** How often an effect that never stops plays. */
    forever: "without end",
    /** How often an effect plays: "4 times". */
    times: (n: number) => `${n} ${plural("en", n, { one: "time", other: "times" })}`,
    /**
     * An effect in words: "A pulse on “API”: 1 s a cycle, 2 times after 300 ms"; the delay is null
     * when the effect starts at once.
     */
    cycle: (what: string, cycle: string, repeat: string, delay: string | null) =>
      `${what}: ${cycle} a cycle, ${repeat}${delay === null ? "" : ` after ${delay}`}`,
  },
};

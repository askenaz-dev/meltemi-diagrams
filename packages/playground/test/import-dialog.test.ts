// The import dialog can stay open while the page turns read-only (an editor demoted, the room's
// hello naming the viewer role). Its button must then add nothing and must not say it did.
import { beforeEach, describe, expect, it, vi } from "vitest";

/** What `openDialog` was given by the last dialog opened. */
const opened: {
  actions: { label: string; run?: () => boolean | void | Promise<boolean | void> }[];
  body: unknown[];
} = { actions: [], body: [] };

// The page's DOM helpers are replaced by plain objects: this test is about what the button does.
vi.mock("../src/ui.js", () => {
  interface Fake {
    tag: string;
    value: string;
    children: unknown[];
    focus(): void;
    addEventListener(): void;
    replaceChildren(...children: unknown[]): void;
  }
  const h = (
    tag: string,
    attributes: Record<string, unknown> = {},
    ...children: unknown[]
  ): Fake => ({
    tag,
    value: typeof attributes["value"] === "string" ? attributes["value"] : "",
    children,
    focus: () => undefined,
    addEventListener: () => undefined,
    replaceChildren(...next: unknown[]) {
      this.children = next;
    },
  });
  return {
    announce: () => undefined,
    chooseFiles: () => Promise.resolve([]),
    download: () => undefined,
    field: (_label: string, control: unknown) => control,
    h,
    openDialog: (_title: string, body: unknown[], actions: typeof opened.actions) => {
      opened.body = body;
      opened.actions = actions;
      return {};
    },
  };
});

const { importDialog } = await import("../src/dialogs.js");
const { en } = await import("../src/messages/en.js");

/** The parts of the page the dialog uses. */
function playground(readOnly: boolean) {
  const calls: string[] = [];
  const page = {
    studio: {
      readOnly,
      host: { has: () => false },
      addFiles: (files: Iterable<readonly [string, unknown]>) =>
        void calls.push(`add ${[...files].map(([path]) => path).join(",")}`),
    },
    keepNow: () => void calls.push("keep"),
    status: (message: string) => void calls.push(`status ${message}`),
  };
  return { page, calls };
}

/** Types into the source field and presses the dialog's import button. */
async function importWith(readOnly: boolean, text: string) {
  const { page, calls } = playground(readOnly);
  importDialog(page as unknown as Parameters<typeof importDialog>[0]);
  const source = (opened.body[1] as { value: string; children: unknown[] }) ?? undefined;
  source.value = text;
  const button = opened.actions.find((action) => action.label === en.import.import);
  const result = await button?.run?.();
  return { calls, result };
}

describe("the import dialog", () => {
  beforeEach(() => {
    opened.actions = [];
    opened.body = [];
  });

  it("adds the diagram and says so on a page that can be edited", async () => {
    const { calls, result } = await importWith(false, "graph TD\n  A --> B\n");
    expect(calls[0]).toBe("add diagrams/imported.meltemi");
    expect(calls).toContain("keep");
    expect(calls.some((call) => call.startsWith("status "))).toBe(true);
    expect(result).not.toBe(undefined);
  });

  it("adds nothing and says nothing was added once the page is read-only", async () => {
    const { calls, result } = await importWith(true, "graph TD\n  A --> B\n");
    expect(calls).toEqual([]);
    // The dialog stays open, with the reason in it.
    expect(result).toBe(false);
  });
});

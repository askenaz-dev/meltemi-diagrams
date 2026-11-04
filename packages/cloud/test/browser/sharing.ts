/**
 * What the scenarios of sharing, viewing and publishing share: the owner's calls from Node (the link
 * level, invitations, members), what each kind of person is observed to be able to do over plain HTTP,
 * and the page's own parts that those scenarios drive (the share dialog, view mode). Selectors and
 * words come from the page's own code (`src/cloud/share.ts`, `view-*.ts`, `publish.ts`).
 */
import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import { PNG, makeProject, readRoom } from "./cloud.js";
import type { Person } from "./scenario.js";
import { ask, expectOpen, revealFile, until, type Answer } from "./support.js";

export type LinkLevel = "private" | "view" | "edit";
export type MemberRole = "viewer" | "editor";

/** The link to a project as the page copies it. */
export const projectLink = (origin: string, id: string): string => `${origin}/p/${id}`;

// ---------------------------------------------------------------------------------------------
// The calls of the owner, from Node

/** An invitation as the owner's calls answer it. */
export interface InvitationRow {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly link: string;
}

/** The owner changes who the link admits. */
export async function setLinkLevel(owner: Person, id: string, level: LinkLevel): Promise<void> {
  const changed = await owner.api("PATCH", `/api/projects/${id}/sharing`, { linkAccess: level });
  assert.equal(changed.status, 200, changed.text.slice(0, 300));
}

/** The owner invites an email; the invitation, with its link. */
export async function invite(
  owner: Person,
  id: string,
  email: string,
  role: MemberRole,
): Promise<InvitationRow> {
  const made = await owner.api("POST", `/api/projects/${id}/members`, { email, role });
  assert.ok(
    made.status === 200 || made.status === 201,
    `${made.status} ${made.text.slice(0, 300)}`,
  );
  return made.json() as unknown as InvitationRow;
}

/** The token an invitation's link carries. */
export const tokenOf = (link: string): string => new URL(link).searchParams.get("invite") ?? "";

/** The pending invitations, as the owner reads them. */
export async function pendingInvitations(owner: Person, id: string): Promise<InvitationRow[]> {
  const listed = await owner.api("GET", `/api/projects/${id}/invitations`);
  assert.equal(listed.status, 200, listed.text.slice(0, 300));
  return (listed.json()["invitations"] ?? []) as InvitationRow[];
}

/** The person opens an invitation link's token (what the page does): the project, with their role. */
export function accept(person: Person, token: string): Promise<Answer> {
  return person.api("POST", `/api/invitations/${token}/accept`);
}

/** Makes `person` a member of the project, as the owner and the person would: an invitation, accepted. */
export async function addMember(
  owner: Person,
  id: string,
  person: Person,
  role: MemberRole,
  email = `invited-${person.sub}@example.org`,
): Promise<void> {
  const invitation = await invite(owner, id, email, role);
  const accepted = await accept(person, tokenOf(invitation.link));
  assert.equal(accepted.status, 200, accepted.text.slice(0, 300));
}

/** The members as the owner reads them. */
export interface MemberRow {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

export async function membersOf(owner: Person, id: string): Promise<MemberRow[]> {
  const read = await owner.api("GET", `/api/projects/${id}/sharing`);
  assert.equal(read.status, 200, read.text.slice(0, 300));
  return (read.json()["members"] ?? []) as MemberRow[];
}

/** The image `showcase` holds, where it holds it. */
export const SHOWCASE_IMAGE = "assets/dot.png";

/**
 * A project with what the viewing scenarios need: a story (the purchase template), a slide placed by
 * hand, and an image the project keeps by its hash.
 */
export async function showcase(owner: Person, name: string): Promise<{ id: string; name: string }> {
  const free = await makeProject(owner, `${name} (slide)`, { template: "free" });
  const slide = (await readRoom(owner, free.id)).files["diagrams/slide.meltemi"];
  assert.ok(slide, "the free template has its slide");
  const project = await makeProject(owner, name, { template: "purchase" });
  const pushed = await owner.api("PUT", `/api/projects/${project.id}/files`, {
    files: { "diagrams/slide.meltemi": slide },
  });
  assert.equal(pushed.status, 200, pushed.text.slice(0, 300));
  const image = await owner.api(
    "PUT",
    `/api/projects/${project.id}/binaries/${SHOWCASE_IMAGE}`,
    PNG,
    {
      "Content-Type": "image/png",
    },
  );
  assert.equal(image.status, 200, image.text.slice(0, 300));
  const removed = await owner.api("DELETE", `/api/projects/${free.id}`);
  assert.equal(removed.status, 204, removed.text);
  return { id: project.id, name };
}

// ---------------------------------------------------------------------------------------------
// What a person is observed to be able to do

/** What asking the project's routes as one person got: the statuses, and the role the project named. */
export interface Observed {
  /** `GET /api/projects/:id`. */
  readonly project: number;
  /** The role the project named, or null when it did not answer. */
  readonly role: string | null;
  /** `GET /api/projects/:id/files`. */
  readonly files: number;
  /** `PUT /api/projects/:id/files` with an empty push: the status says whether a write is allowed. */
  readonly write: number;
  /** The code of the refusal of the write, when it was one. */
  readonly refusal: string | null;
}

/**
 * Asks three routes of a project as a person, or as nobody (`undefined`): reading its row, reading its
 * files, and an empty push, which changes nothing where it is allowed and is refused where it is not.
 */
export async function observe(
  origin: string,
  id: string,
  who: Person | undefined,
): Promise<Observed> {
  const call = (method: string, path: string, body?: unknown): Promise<Answer> =>
    who
      ? who.api(method, path, body)
      : ask(`${origin}${path}`, {
          method,
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
  const project = await call("GET", `/api/projects/${id}`);
  const files = await call("GET", `/api/projects/${id}/files`);
  const write = await call("PUT", `/api/projects/${id}/files`, {});
  const role = project.status === 200 ? project.json()["role"] : null;
  const refusal = write.status === 200 ? null : write.json()["code"];
  return {
    project: project.status,
    role: typeof role === "string" ? role : null,
    files: files.status,
    write: write.status,
    refusal: typeof refusal === "string" ? refusal : null,
  };
}

/** What the project's link is observed to give when it reads `view`, `edit` or nothing. */
export const NOTHING: Observed = {
  project: 404,
  role: null,
  files: 404,
  write: 404,
  refusal: "project.not-found",
};
export const VIEWER: Observed = {
  project: 200,
  role: "viewer",
  files: 200,
  write: 403,
  refusal: "access.denied",
};
export const EDITOR: Observed = {
  project: 200,
  role: "editor",
  files: 200,
  write: 200,
  refusal: null,
};

// ---------------------------------------------------------------------------------------------
// The page: view mode

/** What the page says it is viewing: `snapshot` (nobody signed in), `live`, or null (not in view mode). */
export const viewing = (page: Page): Promise<string | null> =>
  page.locator("#playground").getAttribute("data-viewing");

/** Whether the Studio refuses edits. */
export const readOnly = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      (window as unknown as { meltemiPlayground: { studio: { readOnly: boolean } } })
        .meltemiPlayground.studio.readOnly,
  );

/** Waits until the status line holds a text. */
export async function statusHas(page: Page, text: string): Promise<void> {
  await until(
    page,
    `the status line to say "${text}"`,
    (wanted) => document.querySelector(".status-text")?.textContent?.includes(wanted) ?? false,
    text,
  );
}

/** Waits until the page is, or is no longer, in view mode (`state`: `snapshot`, `live` or null). */
export async function viewingIs(page: Page, state: string | null): Promise<void> {
  await until(
    page,
    `view mode to be ${state}`,
    (wanted) => document.querySelector("#playground")?.getAttribute("data-viewing") === wanted,
    state,
  );
}

/**
 * Opens a file of the project from the explorer's tree (Show all files on for a file it hides), and
 * waits until it is the open one.
 */
export async function showFile(page: Page, path: string): Promise<void> {
  await revealFile(page, path);
  await page.locator(`.tree li[data-key="f:${path}"] > .tree-row .tree-name`).click();
  await expectOpen(page, path);
}

// ---------------------------------------------------------------------------------------------
// The page: the share dialog

/** The Share button of the header. */
export const shareButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Share", exact: true }).first();

/** Opens the share dialog of the page and gives it. */
export async function openShare(page: Page): Promise<Locator> {
  await shareButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Share", exact: true });
  await dialog.waitFor();
  return dialog;
}

/** Waits until the dialog has read the sharing and no action is on its way. */
export async function settled(dialog: Locator): Promise<void> {
  const page = dialog.page();
  await until(page, "the share dialog to be at rest", () => {
    const open = [...document.querySelectorAll("dialog[open]")].find((d) =>
      d.querySelector(".share-link"),
    );
    const body = open?.querySelector(".dialog-body");
    return (
      body !== null &&
      body !== undefined &&
      body.getAttribute("aria-busy") !== "true" &&
      (open?.querySelector(".share-status")?.textContent ?? "") !== "Loading who has access…"
    );
  });
}

/** The link level radio with this label. */
export const levelRadio = (dialog: Locator, level: LinkLevel): Locator =>
  dialog.getByRole("radio", {
    name: {
      private: /Only the people listed/,
      view: /Anyone with the link can view/,
      edit: /Anyone signed in with the link can edit/,
    }[level],
  });

/** The people the dialog lists, by their rows. */
export const peopleRows = (dialog: Locator): Locator => dialog.locator(".share-person");

/** The pending invitations the dialog lists. */
export const pendingRows = (dialog: Locator): Locator => dialog.locator(".share-invitation-item");

/**
 * Waits until a list of the dialog has this many rows. An action that asks first (a removal) is on
 * its way for a moment in which the dialog is at rest, so what it did is waited for, not guessed.
 */
export async function rowsAre(rows: Locator, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await rows.count()) === expected) return;
    await rows.page().waitForTimeout(100);
  }
  assert.equal(await rows.count(), expected, "the rows of the list");
}

/** Asks the dialog to invite an email with a role, and waits for the invitation to be shown. */
export async function inviteInDialog(
  dialog: Locator,
  email: string,
  role: MemberRole,
): Promise<string> {
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Role", { exact: true }).selectOption(role);
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  const reveal = dialog.locator(".share-reveal");
  await reveal.waitFor({ state: "visible" });
  await settled(dialog);
  return reveal.locator("input").inputValue();
}

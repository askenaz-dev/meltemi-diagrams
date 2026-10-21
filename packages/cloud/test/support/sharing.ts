// Test support for sharing: a project of an owner that other people hold in every way a person can
// (a member editor, a member viewer, a signed-in stranger, nobody), made through the API as the
// page makes it (an invitation, the link opened by the invitee), and the shorthands the sharing
// tests share.

import type { LinkAccess } from "../../src/store/types.js";
import { jsonOf } from "./index.js";
import { JSON_TYPE, pngBytes, projects, svgOf, type Projects } from "./projects.js";

export const OWNER = "u-owner";
export const EDITOR = "u-editor";
export const VIEWER = "u-viewer";
export const STRANGER = "u-stranger";
/** Asks as nobody (see `World.ask`). */
export const NOBODY = "nobody";

export const emailOf = (sub: string): string => `${sub}@example.com`;

/** An invitation as the owner's answers show it. */
export interface InvitationBody {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  link: string;
}

/** The token an invitation's link carries. */
export function tokenOf(link: string): string {
  const token = new URL(link).searchParams.get("invite");
  if (!token) throw new Error(`the link carries no invitation: ${link}`);
  return token;
}

export interface World extends Projects {
  /** The project of `OWNER`. */
  readonly id: string;
  /** The link level the world was made with. */
  readonly link: LinkAccess;
  /** The hash of the image the project holds, and the files it was made with. */
  readonly hash: string;
  /**
   * Asks as `who`: a sub (the page's own request, with a cookie and an `Origin`) or `NOBODY` (no
   * credentials at all). A JSON body is given as a value; raw bytes with their own headers.
   */
  ask(
    who: string,
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** The project's own path with a suffix: `/api/projects/<id>/files`. */
  url(rest?: string, id?: string): string;
  /** Sets the project's link level, as the owner. */
  setLink(level: LinkAccess, id?: string): Promise<void>;
  /** Invites an email as the owner would, and answers the invitation. */
  invite(email: string, role: string, id?: string): Promise<InvitationBody>;
  /** Makes `sub` a member by an invitation they open, as the page does. */
  join(sub: string, role: "viewer" | "editor", id?: string): Promise<void>;
}

const FILES = { "a.meltemi": "one\n", "notes.md": "# notes\n" };

/**
 * A project of `OWNER` with two files, an image, a version and a thumbnail; `EDITOR` and `VIEWER`
 * are members of it with those roles; `STRANGER` has signed in and is nothing to it; the link is
 * `link` (private by default).
 */
export async function world(
  link: LinkAccess = "private",
  options: Parameters<typeof projects>[0] = {},
): Promise<World> {
  const p = await projects(options);
  for (const sub of [OWNER, EDITOR, VIEWER, STRANGER]) {
    p.profile(sub, { email: emailOf(sub), emailVerified: true });
  }
  const ask: World["ask"] = (who, method, path, body, headers = {}) => {
    const raw = body === undefined || typeof body === "string" || body instanceof Uint8Array;
    const init = raw ? (body as BodyInit | undefined) : JSON.stringify(body);
    const type = raw ? headers : { ...JSON_TYPE, ...headers };
    return who === NOBODY
      ? p.anonymous(method, path, init, type)
      : p.send(who, method, path, init, type);
  };

  const id = await p.create(OWNER, { name: "Shared", files: FILES });
  const url: World["url"] = (rest = "", project = id) => `/api/projects/${project}${rest}`;
  const png = pngBytes();
  const uploaded = await ask(OWNER, "PUT", url("/binaries/logo.png"), png, {
    "Content-Type": "image/png",
  });
  const hash = (await jsonOf<{ hash: string }>(uploaded)).hash;
  await ask(OWNER, "PUT", url("/thumbnail"), svgOf(), { "Content-Type": "image/svg+xml" });
  await ask(OWNER, "POST", url("/versions"), { label: "first" });

  const setLink: World["setLink"] = async (level, project = id) => {
    const response = await ask(OWNER, "PATCH", url("/sharing", project), { linkAccess: level });
    if (response.status !== 200) throw new Error(`the link was not set: ${response.status}`);
  };
  const invite: World["invite"] = async (email, role, project = id) => {
    const response = await ask(OWNER, "POST", url("/members", project), { email, role });
    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`the invitation was not made: ${response.status} ${await response.text()}`);
    }
    return jsonOf<InvitationBody>(response);
  };
  const join: World["join"] = async (sub, role, project = id) => {
    const invitation = await invite(emailOf(sub), role, project);
    const response = await ask(sub, "POST", `/api/invitations/${tokenOf(invitation.link)}/accept`);
    if (response.status !== 200) throw new Error(`${sub} did not join: ${response.status}`);
  };

  const made: World = { ...p, id, link, hash, ask, url, setLink, invite, join };
  await join(EDITOR, "editor");
  await join(VIEWER, "viewer");
  // The stranger has asked for something: they have a row, and are no one to the project.
  await ask(STRANGER, "GET", "/api/session");
  if (link !== "private") await setLink(link);
  return made;
}

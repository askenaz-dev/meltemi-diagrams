// A cloud project's address in the page: `/?project=<id>` (and `invite`, the invitation to accept)
// in `location.search`, `<origin>/p/<id>` as the link a person copies. What the page does with an
// address on load is decided here, without a DOM, so that a test can walk every case.

/** The shape of a project id in an address: the service's own (20 lowercase letters and digits). */
export const PROJECT_ID = /^[0-9a-z]{20}$/;

/** Whether text can be a project id: it is checked before anything is asked of the service. */
export function isProjectId(value: string): boolean {
  return PROJECT_ID.test(value);
}

/** What an address asks for, as written. */
export interface AddressQuery {
  /** The `project` parameter as written (the first one), or undefined when there is none. */
  readonly project: string | undefined;
  /** The `invite` parameter as written: the page accepts it, and drops it once it has. */
  readonly invite: string | undefined;
}

/** The project and the invitation `location.search` carries. */
export function readAddress(search: string): AddressQuery {
  const params = new URLSearchParams(search);
  return { project: params.get("project") ?? undefined, invite: params.get("invite") ?? undefined };
}

/**
 * What the page does with its address on load, whoever is there (the mode follows the person's
 * role in the project, `project-sharing`, and nobody has a role until the service says so):
 * - `none`: nothing is asked; the page opens its anonymous project.
 * - `open`: the address names a project: accept the invitation if there is one and the person is
 *   signed in, ask the service what the person is to the project, open it in the mode that gives.
 *   The address stays as it is.
 * - `missing`: the address names something that cannot be a project: say so, open the anonymous
 *   project, keep the address (and the invitation, if any, for the sign-in that follows).
 */
export type OpenPlan =
  | { readonly kind: "none" }
  | { readonly kind: "open"; readonly id: string; readonly invite: string | undefined }
  | {
      readonly kind: "missing";
      readonly project: string;
      readonly invite: string | undefined;
    };

/** The plan for a `location.search`. Reads nothing else and changes nothing. */
export function planOpen(search: string): OpenPlan {
  const { project, invite } = readAddress(search);
  if (project === undefined) return { kind: "none" };
  return isProjectId(project)
    ? { kind: "open", id: project, invite }
    : { kind: "missing", project, invite };
}

/** The page's address without its `invite` (the invitation was accepted); the rest is kept. */
export function withoutInvite(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  url.searchParams.delete("invite");
  return url.href;
}

/**
 * The page's address with another project open: `project` set (or removed with undefined), the
 * `invite` of the project left behind dropped, the rest of the query and the fragment kept. A
 * well-formed address in, a well-formed address out; anything else comes back as it was.
 */
export function addressFor(href: string, project: string | undefined): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (project === undefined) url.searchParams.delete("project");
  else url.searchParams.set("project", project);
  url.searchParams.delete("invite");
  return url.href;
}

/** The link to a project that a person copies: `<origin>/p/<id>`, which redirects to the page. */
export function projectLink(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, "")}/p/${id}`;
}

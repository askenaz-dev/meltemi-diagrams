// The one call the page makes for a link that the projects client does not: accepting an invitation
// (`POST /api/invitations/:token/accept`). It answers the project with the role the person now has,
// and never throws, like every call of the page.

import { projectOf, type ApiFailure, type CloudProject, type Outcome } from "./client.js";
import { inPage, parseObject, send, type Fetch } from "./http.js";

export interface InvitationApi {
  /** Accepts an invitation as the signed-in person; the project, with their role, when it works. */
  accept(token: string): Promise<Outcome<CloudProject>>;
}

/** The service's `{ code, message }` as a failure (a body that is not one gives the status only). */
function refusalOf(status: number, text: string): ApiFailure {
  const body = parseObject(text);
  const code = body?.["code"];
  const message = body?.["message"];
  return {
    kind: "refused",
    status,
    ...(typeof code === "string" && code !== "" ? { code: code.slice(0, 80) } : {}),
    ...(typeof message === "string" && message !== "" ? { message: message.slice(0, 300) } : {}),
  };
}

/** The invitation call, relative to the page. */
export function invitationApi(fetchFn: Fetch, location: Pick<Location, "href">): InvitationApi {
  const page = location.href.replace(/#.*$/, "");
  return {
    accept: async (token) => {
      const answer = await send(
        fetchFn,
        inPage(page, `api/invitations/${encodeURIComponent(token)}/accept`),
        { method: "POST", headers: { Accept: "application/json" } },
      );
      if (!answer) return { ok: false, failure: { kind: "unreachable", status: 0 } };
      if (answer.status < 200 || answer.status > 299) {
        return { ok: false, failure: refusalOf(answer.status, answer.text) };
      }
      const project = projectOf(parseObject(answer.text), page);
      return project
        ? { ok: true, value: project }
        : { ok: false, failure: { kind: "unexpected", status: answer.status } };
    },
  };
}

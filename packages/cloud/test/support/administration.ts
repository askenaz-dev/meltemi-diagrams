import { administrationFetch } from "../../src/administration-service.js";
import { createAdministrationVerifier } from "../../src/verifier.js";
import { harness } from "./index.js";

export const BRIDGE_OWNER = "owner-central";

/** Real signed JWTs and the real business router, with fake persistence and identity transport. */
export async function administrationHarness(options: Parameters<typeof harness>[0] = {}) {
  const h = await harness({ ...options, env: { ADMIN_SUBS: BRIDGE_OWNER, ...options.env } });
  const deps = { ...h.deps, verifier: createAdministrationVerifier(h.env, h.identity.fetch) };
  const credentials = async (sub: string, emailVerified = true) => {
    const person = await h.signedIn({ sub, email: `${sub}@example.com`, emailVerified, name: sub });
    return { ...person, token: person.cookie.slice("meltemi_session=".length) };
  };
  const send = (
    token: string,
    method: string,
    path: string,
    body?: unknown,
    headers?: HeadersInit,
  ) => {
    const own = new Headers(headers);
    own.set("Authorization", `Bearer ${token}`);
    if (body !== undefined) own.set("Content-Type", "application/json");
    return administrationFetch(
      new Request(path.startsWith("http") ? path : `${h.env.ORIGIN}${path}`, {
        method,
        headers: own,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      h.env,
      deps,
    );
  };
  const owner = await credentials(BRIDGE_OWNER);
  return { h, deps, credentials, send, owner };
}

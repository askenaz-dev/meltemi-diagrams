/** The local Worker's wiring. No remote identity verifier or provider credentials exist here. */
import { ConfigError } from "./config.js";
import { ApiError, errorResponse, fail } from "./errors.js";
import { cloud } from "./handler.js";
import { json } from "./http.js";
import { newProjectId } from "./ids.js";
import { guardLocalRequest, localConfig } from "./local-policy.js";
import { d1OAuthStore } from "./oauth/store.js";
import { durableRenderers } from "./renderer-client.js";
import { durableRooms } from "./room-client.js";
import { d1Store } from "./store/d1.js";
import { templateFiles } from "./templates.js";
import type { D1Like, Env } from "./env.js";
import type { Deps, LocalInstance } from "./types.js";

interface InstanceRow {
  owner_sub: string;
  project_id: string;
  origin: string;
  ready: number;
}

const initializing = new WeakMap<D1Like, Promise<LocalInstance>>();
const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

/** One persisted identity/default, independent of process restarts and concurrent first requests. */
export async function initializeLocalInstance(env: Env): Promise<LocalInstance> {
  const config = localConfig(env.ORIGIN);
  const existing = initializing.get(env.DB);
  if (existing) {
    const instance = await existing;
    if (instance.origin !== config.origin)
      throw new ConfigError("ORIGIN differs from the persisted instance");
    if (await d1Store(env.DB).project(instance.principal.sub, instance.defaultProject.id)) {
      return instance;
    }
    // Deleting the initial project is valid. A live isolate must choose another existing
    // project (or seed a new default when none remain) without waiting for a restart.
    if (initializing.get(env.DB) === existing) initializing.delete(env.DB);
    return initializeLocalInstance(env);
  }
  const pending = bootstrap(env, config.origin);
  initializing.set(env.DB, pending);
  try {
    return await pending;
  } catch (error) {
    initializing.delete(env.DB);
    throw error;
  }
}

async function bootstrap(env: Env, origin: string): Promise<LocalInstance> {
  const db = env.DB;
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS local_instance (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), owner_sub TEXT NOT NULL, project_id TEXT NOT NULL, origin TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0) STRICT",
    )
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO local_instance (singleton, owner_sub, project_id, origin) VALUES (1, ?, ?, ?)",
    )
    .bind(`local-${newProjectId(randomBytes)}`, newProjectId(randomBytes), origin)
    .run();
  const row = await db
    .prepare("SELECT owner_sub, project_id, origin, ready FROM local_instance WHERE singleton = 1")
    .first<InstanceRow>();
  if (!row || row.origin !== origin)
    throw new ConfigError("ORIGIN differs from the persisted instance");
  const store = d1Store(db);
  const profile = {
    sub: row.owner_sub,
    name: "Local workspace",
    picture: "",
    email: "",
    emailVerified: false,
  };
  await store.upsertUser(profile, new Date().toISOString());
  let project = await store.project(row.owner_sub, row.project_id);
  if (!project && row.ready) {
    const [remaining] = await store.projectIdsOf(row.owner_sub);
    if (remaining) {
      row.project_id = remaining;
      await db
        .prepare("UPDATE local_instance SET project_id = ? WHERE singleton = 1")
        .bind(remaining)
        .run();
      project = await store.project(row.owner_sub, remaining);
    } else {
      await db
        .prepare(
          "UPDATE local_instance SET project_id = ?, ready = 0 WHERE singleton = 1 AND project_id = ?",
        )
        .bind(newProjectId(randomBytes), row.project_id)
        .run();
      const changed = await db
        .prepare("SELECT project_id, ready FROM local_instance WHERE singleton = 1")
        .first<{ project_id: string; ready: number }>();
      if (!changed) throw new Error("Local instance metadata is missing");
      row.project_id = changed.project_id;
      row.ready = changed.ready;
    }
  }
  if (!project) {
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT OR IGNORE INTO projects (id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, deleted_at) VALUES (?, ?, 'Local workspace', '', ?, ?, 0, NULL, NULL)",
      )
      .bind(row.project_id, row.owner_sub, now, now)
      .run();
  }
  const rooms = durableRooms(env.ROOMS);
  const snapshot = await rooms.read(row.project_id);
  if (!row.ready && snapshot.revision === 0 && Object.keys(snapshot.files).length === 0) {
    const files = await templateFiles(env.ASSETS, origin, "flow");
    try {
      await rooms.push(row.project_id, { files, ifRevision: 0 });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "revision.mismatch") throw error;
    }
  }
  if (!row.ready) await rooms.materialise(row.project_id);
  if (!row.ready) await db.prepare("UPDATE local_instance SET ready = 1 WHERE singleton = 1").run();
  return {
    origin,
    principal: { via: "local", sub: profile.sub, profile },
    defaultProject: { id: row.project_id, url: `${origin}/?project=${row.project_id}` },
  };
}

/** Local dependencies use only local bindings. A remote fetch is always a programming error. */
export function localDependencies(env: Env, local: LocalInstance): Deps {
  return {
    local,
    store: d1Store(env.DB),
    oauthStore: d1OAuthStore(env.DB),
    rooms: durableRooms(env.ROOMS),
    assets: env.ASSETS,
    verifier: { verifySession: async () => undefined },
    now: () => new Date(),
    randomBytes,
    fetch: async () => {
      throw new Error("The local instance does not contact an identity provider");
    },
    renderers: durableRenderers(env.RENDERERS),
  };
}

export async function localFetch(request: Request, env: Env): Promise<Response> {
  try {
    guardLocalRequest(request, localConfig(env.ORIGIN));
    const local = await initializeLocalInstance(env);
    const deps = localDependencies(env, local);
    if (new URL(request.url).pathname === "/healthz" && ["GET", "HEAD"].includes(request.method)) {
      const { productVersion } = await import("./mcp/tools-live.js");
      return json({
        ready: true,
        version: await productVersion({ deps, config: localConfig(local.origin) }),
        mode: "local-single-user",
        defaultProject: local.defaultProject,
      });
    }
    return cloud(request, env, deps);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    console.error(
      "local: initialization failed:",
      error instanceof ConfigError ? error.message : "storage is unavailable",
    );
    return errorResponse(fail("internal"));
  }
}

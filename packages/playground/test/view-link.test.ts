// Opening a project by its link (`project-sharing`, "Viewing by link"; `playground-cloud`, "Opening a
// project by address"): who is on the page, what the service says they are, and what the invitation
// in the address did, decide the mode and the status line. Everything the page holds is a fake here,
// but the Studio, the mode and the snapshot, which are real.
import { describe, expect, it } from "vitest";
import { planOpen } from "../src/cloud/address.js";
import type { CloudApi, CloudProject, Outcome } from "../src/cloud/client.js";
import { LinkOpener, type LinkCloud } from "../src/cloud/link.js";
import type { OpenOutcome } from "../src/cloud/projects-model.js";
import { SnapshotViewer } from "../src/cloud/snapshot.js";
import type { InvitationApi } from "../src/cloud/view-api.js";
import { ViewMode } from "../src/cloud/view-mode.js";
import type { Role } from "../src/cloud/view-model.js";
import { en } from "../src/messages/en.js";
import { ManualTimers } from "./support/clock.js";
import { newStudio } from "./support/cloud.js";

const ID = "abcdefghij0123456789";
const TOKEN = "t0k3n";
const A = "diagrams/a.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const PAGE = `https://diagrams.example/?project=${ID}&invite=${TOKEN}#frag`;

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code?: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, ...(code ? { code } : {}) },
});
const unreachable: Outcome<never> = { ok: false, failure: { kind: "unreachable", status: 0 } };

const project = (role: Role, name = "Purchase"): CloudProject => ({
  id: ID,
  name,
  description: "",
  updatedAt: "",
  thumbnail: undefined,
  role,
});

interface Options {
  /** What `GET /api/projects/:id` answers. */
  readonly described?: Outcome<CloudProject>;
  readonly files?: Outcome<{
    revision: number;
    files: Record<string, string>;
    binaries: Record<string, string>;
    collisions: unknown[];
  }>;
  /** Signed in: what the cloud controller does, and what the person turns out to be. */
  readonly cloud?: { outcome: OpenOutcome; notice?: string; role?: Role; name?: string };
  readonly accept?: Outcome<CloudProject>;
  /** What `GET /api/projects` answers: the person's own projects and those they are a member of. */
  readonly projects?: Outcome<CloudProject[]>;
  readonly href?: string;
}

function rig(options: Options = {}) {
  const log: string[] = [];
  const studio = newStudio();
  const mode = new ViewMode(studio);
  const timers = new ManualTimers();
  const reports: string[] = [];
  const replaced: string[] = [];
  let href = options.href ?? PAGE;
  const api: Pick<CloudApi, "get" | "list" | "files" | "blob"> = {
    list: () => {
      log.push("GET projects");
      return Promise.resolve(options.projects ?? ok([]));
    },
    get: (id) => {
      log.push(`GET project ${id}`);
      return Promise.resolve(options.described ?? ok(project("viewer")));
    },
    files: (id) => {
      log.push(`GET files ${id}`);
      return Promise.resolve(
        options.files ??
          ok({ revision: 1, files: { [A]: SOURCE_A }, binaries: {}, collisions: [] }),
      );
    },
    blob: () => Promise.resolve(unreachable),
  };
  const invitations: InvitationApi = {
    accept: (token) => {
      log.push(`POST accept ${token}`);
      return Promise.resolve(options.accept ?? ok(project("editor")));
    },
  };
  const opened: { role?: Role; name?: string } = {};
  const cloud: LinkCloud | undefined = options.cloud
    ? {
        openAddress: (plan) => {
          log.push(`openAddress ${plan.kind}`);
          return Promise.resolve(en.cloud.open.notFound);
        },
        openLink: (id) => {
          log.push(`openLink ${id}`);
          const done = options.cloud!;
          if (done.outcome === "opened") {
            opened.role = done.role ?? "owner";
            opened.name = done.name ?? "Purchase";
          }
          return Promise.resolve({ outcome: done.outcome, notice: done.notice });
        },
        get role() {
          return opened.role;
        },
        get openProject() {
          return opened.name === undefined ? undefined : { id: ID, name: opened.name };
        },
      }
    : undefined;
  const snapshot = new SnapshotViewer({ studio, api, timers, stale: () => undefined });
  const opener = new LinkOpener({
    cloud,
    api,
    invitations,
    snapshot,
    mode,
    address: {
      href: () => href,
      replace: (url) => {
        href = url;
        replaced.push(url);
      },
    },
    words: () => ({ viewing: en.viewing, cloud: en.cloud }),
    report: (message) => reports.push(message),
  });
  return {
    opener,
    studio,
    mode,
    log,
    reports,
    replaced,
    get href() {
      return href;
    },
  };
}

const plan = (search: string) => planOpen(search);

describe("nobody is signed in", () => {
  it("shows a project its link admits, as a snapshot in view mode, and keeps the address", async () => {
    const r = rig({ href: `https://diagrams.example/?project=${ID}` });
    const notice = await r.opener.open(plan(`?project=${ID}`));
    expect(notice).toBeUndefined();
    expect(r.log).toEqual([`GET project ${ID}`, `GET files ${ID}`]);
    expect(r.mode.state).toMatchObject({ id: ID, name: "Purchase", live: false, signedIn: false });
    expect(r.studio.readOnly).toBe(true);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(r.reports).toEqual([en.viewing.opened("Purchase")]);
    expect(r.replaced).toEqual([]);
  });

  it("asks nothing but reads: no write, no invitation, nothing of an account", async () => {
    const r = rig();
    await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(r.log.every((line) => line.startsWith("GET"))).toBe(true);
  });

  it("is a viewer whatever the service says, as nobody signed in cannot write", async () => {
    for (const role of ["viewer", "editor", "owner"] as const) {
      const r = rig({ described: ok(project(role)) });
      expect(await r.opener.open(plan(`?project=${ID}`))).toBeUndefined();
      expect(r.studio.readOnly).toBe(true);
      expect(r.mode.state?.live).toBe(false);
    }
  });

  it("says a private project was not found, offers sign-in, and enters no mode", async () => {
    const r = rig({ described: refused(404, "project.not-found") });
    const notice = await r.opener.open(plan(`?project=${ID}`));
    expect(notice).toBe(en.viewing.notFoundSignIn);
    expect(r.reports).toEqual([en.viewing.notFoundSignIn]);
    expect(r.log).toEqual([`GET project ${ID}`]);
    expect(r.mode.active).toBe(false);
    expect(r.studio.readOnly).toBe(false);
    expect(r.studio.host.paths()).toEqual([]);
  });

  it("says the same of what cannot be a project, without asking the service", async () => {
    const r = rig();
    const notice = await r.opener.open(plan("?project=nonsense"));
    expect(notice).toBe(en.viewing.notFoundSignIn);
    expect(r.log).toEqual([]);
  });

  it("keeps an invitation in the address and says to sign in to accept it, whatever the link shows", async () => {
    const shown = rig();
    expect(await shown.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
    expect(shown.reports).toEqual([en.viewing.signInToAccept]);
    expect(shown.replaced).toEqual([]);
    expect(shown.href).toBe(PAGE);

    const hidden = rig({ described: refused(404, "project.not-found") });
    const notice = await hidden.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(notice).toBe(en.viewing.signInToAccept);
    expect(hidden.replaced).toEqual([]);
    expect(hidden.log).toEqual([`GET project ${ID}`]);
  });

  it("says why when the service cannot be reached or answers badly, and enters no mode", async () => {
    const down = rig({ described: unreachable });
    expect(await down.opener.open(plan(`?project=${ID}`))).toBe(en.cloud.errors.unreachable);
    expect(down.mode.active).toBe(false);

    const broken = rig({ files: unreachable });
    expect(await broken.opener.open(plan(`?project=${ID}`))).toBe(en.cloud.errors.unreachable);
    // View mode was entered to load, and left again when the files did not come.
    expect(broken.mode.active).toBe(false);
    expect(broken.studio.readOnly).toBe(false);
  });

  it("says an image could not be downloaded, when one could not", async () => {
    const r = rig({
      files: ok({
        revision: 1,
        files: { [A]: SOURCE_A },
        binaries: { "logo.png": "a".repeat(64) },
        collisions: [],
      }),
    });
    await r.opener.open(plan(`?project=${ID}`));
    expect(r.reports).toEqual([en.cloud.project.binaryFetch("logo.png")]);
    expect(r.mode.active).toBe(true);
  });
});

describe("a person signed in", () => {
  it("opens the project in the mode the controller gives, saying a viewer's page is live", async () => {
    const viewer = rig({ cloud: { outcome: "opened", role: "viewer" } });
    expect(await viewer.opener.open(plan(`?project=${ID}`))).toBeUndefined();
    expect(viewer.log).toEqual([`openLink ${ID}`]);
    expect(viewer.reports).toEqual([en.viewing.openedLive("Purchase")]);

    // An editor or an owner opens as they always did: the controller has said what it had to.
    for (const role of ["editor", "owner"] as const) {
      const r = rig({ cloud: { outcome: "opened", role } });
      expect(await r.opener.open(plan(`?project=${ID}`))).toBeUndefined();
      expect(r.reports).toEqual([]);
    }
  });

  it("accepts the invitation first, drops it from the address, and says what the person is now", async () => {
    const r = rig({ cloud: { outcome: "opened", role: "editor", name: "Purchase" } });
    expect(await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
    expect(r.log).toEqual([`POST accept ${TOKEN}`, `openLink ${ID}`]);
    expect(r.replaced).toEqual([`https://diagrams.example/?project=${ID}#frag`]);
    expect(r.reports).toEqual([en.viewing.inviteAccepted("Purchase", "editor")]);
    // As a viewer, the same, in view mode.
    const viewer = rig({ cloud: { outcome: "opened", role: "viewer", name: "Purchase" } });
    await viewer.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(viewer.reports).toEqual(["Invitation accepted: you can view Purchase."]);
  });

  it("follows an invitation that names another project than the address does, and names it in the address", async () => {
    const other = "zyxwvutsrq9876543210";
    const r = rig({
      accept: ok({ ...project("editor", "Other"), id: other }),
      cloud: { outcome: "opened", role: "editor", name: "Other" },
    });
    expect(await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
    expect(r.log).toEqual([`POST accept ${TOKEN}`, `openLink ${other}`]);
    expect(r.replaced).toEqual([`https://diagrams.example/?project=${other}#frag`]);
  });

  it("says the invitation is not valid and goes on with the normal open", async () => {
    const r = rig({
      accept: refused(404, "invite.invalid"),
      cloud: { outcome: "opened", role: "owner" },
    });
    expect(await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
    expect(r.log).toEqual([`POST accept ${TOKEN}`, "GET projects", `openLink ${ID}`]);
    expect(r.reports).toEqual([en.viewing.inviteInvalid]);
    // The address is left as it was: nothing was accepted.
    expect(r.replaced).toEqual([]);
  });

  it("takes an invitation that is spent for one that did its work when the project is already in the person's list", async () => {
    // The session turned the invitation for the person's email into a membership when it loaded,
    // so accepting the link they were sent finds it used; the project is theirs all the same.
    for (const role of ["editor", "viewer"] as const) {
      const r = rig({
        accept: refused(404, "invite.invalid"),
        projects: ok([project(role)]),
        cloud: { outcome: "opened", role, name: "Purchase" },
      });
      expect(await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
      expect(r.log).toEqual([`POST accept ${TOKEN}`, "GET projects", `openLink ${ID}`]);
      expect(r.reports).toEqual([en.viewing.inviteAccepted("Purchase", role)]);
      // The spent invitation leaves the address, as an accepted one does.
      expect(r.replaced).toEqual([`https://diagrams.example/?project=${ID}#frag`]);
    }
  });

  it("does not take a spent invitation for accepted when only some other project is in the person's list", async () => {
    const r = rig({
      accept: refused(404, "invite.invalid"),
      projects: ok([{ ...project("editor"), id: "zyxwvutsrq9876543210" }]),
      cloud: { outcome: "opened", role: "viewer" },
    });
    await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(r.reports).toEqual([en.viewing.inviteInvalid]);
    expect(r.replaced).toEqual([]);
  });

  it("says the invitation is not valid when the list cannot be read", async () => {
    for (const projects of [unreachable, refused(500, "internal")]) {
      const r = rig({
        accept: refused(404, "invite.invalid"),
        projects,
        cloud: { outcome: "opened", role: "viewer" },
      });
      await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
      expect(r.reports).toEqual([en.viewing.inviteInvalid]);
    }
  });

  it("says both when the invitation is not valid and the project is not found, and the anonymous project opens", async () => {
    const r = rig({
      accept: refused(404, "invite.invalid"),
      cloud: { outcome: "not-found", notice: en.cloud.open.notFound },
    });
    const notice = await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(notice).toBe(`${en.viewing.inviteInvalid} ${en.cloud.open.notFound}`);
  });

  it("is told to sign in when the invitation finds the session gone", async () => {
    const r = rig({
      accept: refused(401, "auth.required"),
      cloud: { outcome: "opened", role: "viewer" },
    });
    await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`));
    expect(r.reports).toEqual([en.viewing.signInToAccept]);
    expect(r.replaced).toEqual([]);
  });

  it("opens anyway and says why when accepting failed for another reason", async () => {
    const r = rig({ accept: unreachable, cloud: { outcome: "opened", role: "viewer" } });
    expect(await r.opener.open(plan(`?project=${ID}&invite=${TOKEN}`))).toBeUndefined();
    expect(r.log).toEqual([`POST accept ${TOKEN}`, `openLink ${ID}`]);
    expect(r.reports).toEqual([en.cloud.errors.unreachable]);
  });

  it("leaves the invitation alone when there is none, and asks nothing of the invitations", async () => {
    const r = rig({ cloud: { outcome: "opened", role: "owner" } });
    await r.opener.open(plan(`?project=${ID}`));
    expect(r.log.some((line) => line.startsWith("POST"))).toBe(false);
  });

  it("says what the controller said when the project was not found, and the anonymous project opens", async () => {
    const r = rig({ cloud: { outcome: "not-found", notice: en.cloud.open.notFound } });
    expect(await r.opener.open(plan(`?project=${ID}`))).toBe(en.cloud.open.notFound);
    const failed = rig({ cloud: { outcome: "failed", notice: en.cloud.open.failed } });
    expect(await failed.opener.open(plan(`?project=${ID}`))).toBe(en.cloud.open.failed);
  });

  it("hands what cannot be a project to the controller, which says it as it always did", async () => {
    const r = rig({ cloud: { outcome: "opened" } });
    expect(await r.opener.open(plan("?project=nonsense"))).toBe(en.cloud.open.notFound);
    expect(r.log).toEqual(["openAddress missing"]);
  });
});

describe("an address that names nothing", () => {
  it("opens nothing and asks nothing, for a person and for nobody", async () => {
    for (const cloud of [undefined, { outcome: "opened" as const }]) {
      const r = rig(cloud ? { cloud } : {});
      expect(await r.opener.open(plan(""))).toBeUndefined();
      expect(r.log).toEqual([]);
      expect(r.reports).toEqual([]);
      expect(r.mode.active).toBe(false);
    }
  });
});

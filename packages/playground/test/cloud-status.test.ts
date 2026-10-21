import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { codeText, explainFailure, explainRefusal } from "../src/cloud/explain.js";
import {
  announcement,
  connectionStatus,
  sameStatus,
  statusText,
  type ConnectionInputs,
  type ConnectionState,
} from "../src/cloud/status.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const base: ConnectionInputs = {
  socket: "open",
  everOpen: true,
  online: true,
  saving: false,
  kept: true,
};

describe("the connection's state", () => {
  it("is saved when the room has answered and nothing is on its way", () => {
    expect(connectionStatus(base)).toEqual({ state: "connected", kept: true });
  });

  it("is saving while the person's changes are on their way", () => {
    expect(connectionStatus({ ...base, saving: true }).state).toBe("saving");
  });

  it("is connecting before the room has answered once", () => {
    expect(connectionStatus({ ...base, socket: "connecting", everOpen: false }).state).toBe(
      "connecting",
    );
  });

  it("is reconnecting when a socket that worked is gone and the browser is online", () => {
    expect(connectionStatus({ ...base, socket: "waiting" }).state).toBe("reconnecting");
    // A new attempt after a drop is still reconnecting, not connecting.
    expect(connectionStatus({ ...base, socket: "connecting" }).state).toBe("reconnecting");
    // So is a project the room never answered, once its first socket failed.
    expect(connectionStatus({ ...base, socket: "waiting", everOpen: false }).state).toBe(
      "reconnecting",
    );
  });

  it("is offline when the browser says it is, whatever the socket is doing", () => {
    for (const socket of ["connecting", "waiting"] as const) {
      expect(connectionStatus({ ...base, socket, online: false }).state).toBe("offline");
    }
    expect(
      connectionStatus({ ...base, socket: "connecting", everOpen: false, online: false }).state,
    ).toBe("offline");
  });

  it("ignores saving when the socket is not open", () => {
    expect(connectionStatus({ ...base, socket: "waiting", saving: true }).state).toBe(
      "reconnecting",
    );
  });

  it("says whether the browser keeps the project", () => {
    expect(connectionStatus({ ...base, kept: false })).toEqual({ state: "connected", kept: false });
  });

  it("is gone for a project that was deleted, whatever the socket is doing", () => {
    for (const socket of ["open", "connecting", "waiting"] as const) {
      for (const online of [true, false]) {
        expect(connectionStatus({ ...base, socket, online, saving: true, gone: true })).toEqual({
          state: "gone",
          kept: true,
        });
      }
    }
    expect(connectionStatus({ ...base, gone: false }).state).toBe("connected");
  });
});

describe("the status line's text", () => {
  const states: ConnectionState[] = [
    "connecting",
    "connected",
    "saving",
    "reconnecting",
    "offline",
    "gone",
  ];

  it("has words for every state, in both languages", () => {
    for (const words of [en.cloud.status, es.cloud.status]) {
      for (const state of states) {
        for (const kept of [true, false]) {
          expect(statusText({ state, kept }, words)).not.toBe("");
        }
      }
    }
  });

  it("says in English what is going on", () => {
    const text = (state: ConnectionState, kept = true) =>
      statusText({ state, kept }, en.cloud.status);
    expect(text("connected")).toBe("Saved to the cloud");
    expect(text("saving")).toBe("Saving…");
    expect(text("connecting")).toBe("Connecting to the cloud…");
    expect(text("reconnecting")).toMatch(/^Reconnecting/);
    expect(text("offline")).toMatch(/^Offline: your changes are kept in this browser/);
    // A deleted project says so whether or not this browser keeps the page's copy.
    expect(text("gone")).toBe("Deleted from the cloud");
    expect(text("gone", false)).toBe("Deleted from the cloud");
  });

  it("says in Spanish what is going on", () => {
    const text = (state: ConnectionState, kept = true) =>
      statusText({ state, kept }, es.cloud.status);
    expect(text("connected")).toBe("Guardado en la nube");
    expect(text("saving")).toBe("Guardando…");
    expect(text("reconnecting")).toMatch(/^Reconectando/);
    expect(text("offline")).toMatch(/^Sin conexión: tus cambios se conservan en este navegador/);
    expect(text("gone")).toBe("Eliminado de la nube");
  });

  it("says when this browser will not keep the project offline", () => {
    const text = (state: ConnectionState) => statusText({ state, kept: false }, en.cloud.status);
    expect(text("connected")).toBe("Saved to the cloud Not kept offline in this browser.");
    // Offline, the words of keeping the changes here would be untrue: they say to keep the page.
    expect(text("offline")).not.toMatch(/are kept in this browser/);
    expect(text("offline")).toMatch(/keep this page open/);
    expect(text("reconnecting")).toMatch(/keep this page open/);
  });

  it("compares statuses", () => {
    expect(sameStatus({ state: "connected", kept: true }, { state: "connected", kept: true })).toBe(
      true,
    );
    expect(sameStatus({ state: "connected", kept: true }, { state: "saving", kept: true })).toBe(
      false,
    );
    expect(
      sameStatus({ state: "connected", kept: true }, { state: "connected", kept: false }),
    ).toBe(false);
    expect(sameStatus(undefined, { state: "connected", kept: true })).toBe(false);
    expect(sameStatus(undefined, undefined)).toBe(true);
  });
});

describe("what a screen reader hears", () => {
  const status = (state: ConnectionState) => ({ state, kept: true });
  const words = en.cloud.status;

  it("hears nothing of the flicker between saving and saved", () => {
    expect(announcement(status("saving"), status("connected"), words)).toBeUndefined();
    expect(announcement(status("connected"), status("saving"), words)).toBeUndefined();
    expect(announcement(undefined, status("connected"), words)).toBeUndefined();
  });

  it("hears the connection drop, and what it means for the changes", () => {
    expect(announcement(status("connected"), status("offline"), words)).toMatch(/^Offline/);
    expect(announcement(status("saving"), status("reconnecting"), words)).toMatch(/^Reconnecting/);
  });

  it("hears that the project was deleted, once, whatever it was doing", () => {
    for (const before of ["connected", "saving", "reconnecting", "offline"] as const) {
      expect(announcement(status(before), status("gone"), words)).toBe(words.gone);
    }
    expect(announcement(status("gone"), status("gone"), words)).toBeUndefined();
  });

  it("hears it come back, once", () => {
    expect(announcement(status("offline"), status("connected"), words)).toBe(words.synced);
    expect(announcement(status("reconnecting"), status("saving"), words)).toBe(words.synced);
    expect(announcement(status("reconnecting"), status("offline"), words)).toBeUndefined();
    expect(announcement(status("offline"), status("connecting"), words)).toBeUndefined();
  });
});

describe("what the service and the room refuse", () => {
  const words = en.cloud.errors;

  it("names the limit of each quota", () => {
    expect(codeText("quota.projects", words)).toBe(words.quotaProjects(CLOUD_LIMITS.projects));
    expect(codeText("quota.projects", words)).toContain("100 projects");
    expect(codeText("quota.storage", words)).toContain("200 MiB");
    expect(codeText("quota.files", words)).toContain("2000 files");
    expect(codeText("quota.binary", words)).toContain("10 MiB");
    expect(codeText("quota.versions", words)).toContain("200 versions");
    expect(codeText("doc.too-large", words)).toContain("16 MiB");
    expect(codeText("doc.too-large", words)).toContain("2 Mi characters");
    expect(codeText("message.too-large", words)).toContain("512 KiB");
    expect(codeText("room.full", words)).toContain("20 people");
  });

  it("words every other code of the contract", () => {
    for (const code of [
      "auth.required",
      "project.not-found",
      "version.not-found",
      "path.invalid",
      "blob.unknown",
      "doc.invalid",
      "binary.invalid",
      "versions.rate",
      "thumbnail.rate",
      "access.denied",
    ]) {
      expect(codeText(code, words), code).toBeDefined();
      expect(codeText(code, es.cloud.errors), code).toBeDefined();
    }
    expect(codeText("something.new", words)).toBeUndefined();
  });

  it("puts a failed call in words", () => {
    expect(explainFailure({ kind: "unreachable", status: 0 }, words)).toBe(words.unreachable);
    expect(explainFailure({ kind: "unexpected", status: 200 }, words)).toBe(words.unexpected);
    expect(explainFailure({ kind: "refused", status: 413, code: "quota.projects" }, words)).toBe(
      words.quotaProjects(100),
    );
    expect(explainFailure({ kind: "refused", status: 401 }, words)).toBe(words.signedOut);
    expect(explainFailure({ kind: "refused", status: 404 }, words)).toBe(words.notFound);
    expect(
      explainFailure({ kind: "refused", status: 400, code: "odd.code", message: "Odd." }, words),
    ).toBe("Odd. (odd.code)");
    expect(explainFailure({ kind: "refused", status: 500 }, words)).toBe(words.failedStatus(500));
  });

  it("tells what the room refused and that the change did not stay", () => {
    expect(explainRefusal("doc.too-large", en.cloud)).toBe(
      en.cloud.refusal.undone(en.cloud.errors.docTooLarge(16, "2 Mi")),
    );
    expect(explainRefusal("doc.too-large", en.cloud)).toMatch(/16 MiB.*not kept/);
    expect(explainRefusal("odd.code", en.cloud)).toContain("(odd.code)");
    expect(explainRefusal("path.invalid", es.cloud)).toMatch(/no se conservó/);
  });
});

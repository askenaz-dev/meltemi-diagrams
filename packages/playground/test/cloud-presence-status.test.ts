import { describe, expect, it } from "vitest";
import {
  announcement,
  connectionStatus,
  sameStatus,
  statusText,
  type ConnectionInputs,
} from "../src/cloud/status.js";
import { viewerStatusWords } from "../src/cloud/view-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const base: ConnectionInputs = {
  socket: "waiting",
  everOpen: false,
  online: true,
  saving: false,
  kept: true,
};

describe("a room that is full, in the connection's state", () => {
  it("is full when the room turned the socket away and the browser is online", () => {
    expect(connectionStatus({ ...base, full: true })).toEqual({ state: "full", kept: true });
    // Still full while the next attempt is being made.
    expect(connectionStatus({ ...base, socket: "connecting", full: true }).state).toBe("full");
    expect(connectionStatus({ ...base, everOpen: true, full: true }).state).toBe("full");
  });

  it("ends when the room lets the socket in, and yields to offline and to a deleted project", () => {
    expect(connectionStatus({ ...base, socket: "open", full: true }).state).toBe("connected");
    expect(connectionStatus({ ...base, online: false, full: true }).state).toBe("offline");
    expect(connectionStatus({ ...base, gone: true, full: true }).state).toBe("gone");
  });

  it("says the room is full, with how many people it holds, and that the page is trying again", () => {
    expect(statusText({ state: "full", kept: true }, en.cloud.status)).toBe(
      "Room full: 20 people are in this project. Trying again…",
    );
    expect(statusText({ state: "full", kept: false }, en.cloud.status)).toBe(
      statusText({ state: "full", kept: true }, en.cloud.status),
    );
    expect(statusText({ state: "full", kept: true }, es.cloud.status)).toMatch(/^Sala llena/);
    expect(en.cloud.status.retry).toBe("Try again");
  });

  it("is worded for a viewer too", () => {
    const words = viewerStatusWords(en.viewing.status);
    expect(statusText({ state: "full", kept: true }, words)).toBe(en.viewing.status.full(20));
    expect(words.retry).toBe(en.viewing.status.retry);
    expect(statusText({ state: "full", kept: true }, viewerStatusWords(es.viewing.status))).toMatch(
      /^Sala llena/,
    );
  });

  it("is a state of its own when statuses are compared", () => {
    expect(sameStatus({ state: "full", kept: true }, { state: "full", kept: true })).toBe(true);
    expect(sameStatus({ state: "full", kept: true }, { state: "reconnecting", kept: true })).toBe(
      false,
    );
  });

  it("is said once, by the refusal, and being let in is told to a screen reader", () => {
    const full = { state: "full", kept: true } as const;
    const connected = { state: "connected", kept: true } as const;
    const reconnecting = { state: "reconnecting", kept: true } as const;
    const connecting = { state: "connecting", kept: true } as const;
    expect(announcement(reconnecting, full, en.cloud.status)).toBeUndefined();
    expect(announcement(connecting, full, en.cloud.status)).toBeUndefined();
    expect(announcement(full, full, en.cloud.status)).toBeUndefined();
    expect(announcement(full, connected, en.cloud.status)).toBe(en.cloud.status.synced);
    // Still not in: nothing more to say.
    expect(announcement(full, connecting, en.cloud.status)).toBeUndefined();
  });
});

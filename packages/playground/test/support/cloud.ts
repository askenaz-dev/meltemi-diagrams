// Devices for the tests of the binding: each is a Studio (the real one, in memory), a stand-in for
// the code pane, a Yjs document and the binding between them. Two devices are synced by handing
// each the updates the other lacks, as the room would. Nothing here touches a network.

import * as Y from "yjs";
import {
  createBinding,
  type Binding,
  type BindingError,
  type BindingOptions,
} from "../../src/cloud/binding.js";
import { REMOTE, type Collision } from "../../src/cloud/doc.js";
import type { Selection } from "../../src/history.js";
import { LazyFiles } from "../../src/lazy.js";
import { Studio, type StudioChange } from "../../src/studio.js";

const nothing = async () => undefined;

/** The real studio with no fonts, icons or layout engine: enough to hold and analyse files. */
export function newStudio(): Studio {
  return new Studio({
    toolVersion: "test",
    fonts: new LazyFiles("fonts/", nothing),
    assets: new LazyFiles("assets/", nothing),
    elk: () => ({}),
  });
}

/**
 * What the code pane does with the studio: shows the open file's text, keeps a caret, resets the
 * caret when a file is opened and moves it to the end when the text changes without one. `type`
 * and `backspace` are the person typing.
 */
export class FakePane {
  text = "";
  selection: Selection = { start: 0, end: 0 };
  /** How many times the pane was reopened by a file operation. */
  reopened = 0;

  constructor(private readonly studio: Studio) {
    studio.listen({
      files: () => {
        this.text = studio.text(studio.open);
        this.selection = { start: 0, end: 0 };
        this.reopened++;
      },
      text: (path, text, selection) => {
        if (path !== studio.open) return;
        if (this.text !== text) this.selection = { start: text.length, end: text.length };
        this.text = text;
        if (selection) this.selection = selection;
      },
    });
  }

  /** Puts the caret at an offset, or selects a range. */
  select(start: number, end = start): void {
    this.selection = { start, end };
  }

  /** Types characters at the caret, as the person does. */
  type(chars: string): void {
    const { start, end } = this.selection;
    const next = this.text.slice(0, start) + chars + this.text.slice(end);
    const caret = start + chars.length;
    this.text = next;
    this.selection = { start: caret, end: caret };
    this.studio.setText(this.studio.open, next, {
      typing: true,
      before: { start, end },
      after: this.selection,
    });
  }

  /** Deletes the character before the caret, or the selection. */
  backspace(): void {
    const { start, end } = this.selection;
    const from = start === end ? Math.max(0, start - 1) : start;
    const next = this.text.slice(0, from) + this.text.slice(end);
    this.text = next;
    this.selection = { start: from, end: from };
    this.studio.setText(this.studio.open, next, {
      typing: true,
      before: { start, end },
      after: this.selection,
    });
  }
}

export interface Device {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly studio: Studio;
  readonly pane: FakePane;
  readonly binding: Binding;
  /** The merged updates the binding handed to `send`, in order. */
  readonly sent: Uint8Array[];
  /** Every local transaction's update, as `onLocalUpdate` got it. */
  readonly local: Uint8Array[];
  readonly errors: BindingError[];
  /** What `onCollisions` was called with, in order. */
  readonly collisions: (readonly Collision[])[];
  /** The changes the studio reported, for tests that look at them. */
  readonly changes: StudioChange[];
}

export interface DeviceOptions {
  /** A document state to start from (another device's `Y.encodeStateAsUpdate`). */
  readonly state?: Uint8Array;
  readonly open?: string;
  readonly fetchBlob?: BindingOptions["fetchBlob"];
  readonly uploadBinary?: BindingOptions["uploadBinary"];
  readonly removeBinary?: BindingOptions["removeBinary"];
  readonly random?: BindingOptions["random"];
  /** Studio files present before the document is bound (the anonymous project, say). */
  readonly files?: [string, string | Uint8Array][];
  /** The person is a viewer: the binding only receives. */
  readonly readOnly?: boolean;
}

/** A device whose binding has been made on a document holding `state`. */
export function device(name: string, options: DeviceOptions = {}): Device {
  const doc = new Y.Doc();
  if (options.state) Y.applyUpdate(doc, options.state, REMOTE);
  const studio = newStudio();
  if (options.files) studio.load(options.files);
  const pane = new FakePane(studio);
  const sent: Uint8Array[] = [];
  const local: Uint8Array[] = [];
  const errors: BindingError[] = [];
  const collisions: (readonly Collision[])[] = [];
  const changes: StudioChange[] = [];
  studio.listen({ change: (change) => changes.push(change) });
  const binding = createBinding({
    doc,
    studio,
    send: (update) => sent.push(update),
    onLocalUpdate: (update) => local.push(update),
    selection: () => pane.selection,
    onCollisions: (list) => collisions.push(list),
    onError: (error) => errors.push(error),
    ...(options.open ? { open: options.open } : {}),
    ...(options.fetchBlob ? { fetchBlob: options.fetchBlob } : {}),
    ...(options.uploadBinary ? { uploadBinary: options.uploadBinary } : {}),
    ...(options.removeBinary ? { removeBinary: options.removeBinary } : {}),
    ...(options.random ? { random: options.random } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
  });
  // The pane shows the file the binding opened.
  pane.text = studio.text(studio.open);
  return { name, doc, studio, pane, binding, sent, local, errors, collisions, changes };
}

/** What each device lacks of the other's document, handed over as remote updates. */
export function sync(a: Device, b: Device): void {
  const toB = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const toA = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  b.binding.apply(toB);
  a.binding.apply(toA);
}

/** The text of every file the studio holds, by path. */
export function texts(device: Device): Record<string, string> {
  return Object.fromEntries(
    device.studio.host
      .paths()
      .filter((path) => typeof device.studio.host.get(path) === "string")
      .map((path) => [path, device.studio.text(path)]),
  );
}

/** Deterministic random bytes: each call gives the next number, spread over the ten bytes. */
export function counter(start = 1): (length: number) => Uint8Array {
  let next = start;
  return (length) => {
    const bytes = new Uint8Array(length);
    bytes[length - 1] = next & 255;
    bytes[length - 2] = (next >> 8) & 255;
    next++;
    return bytes;
  };
}

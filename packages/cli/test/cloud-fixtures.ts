/**
 * What the tests of `push` and `pull` share: a scratch folder, a home of its own with a token the
 * stub knows, folders made from a list of files, and a way to run the command line against the stub
 * service with a terminal (or without one).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CredentialsStore } from "../src/credentials.js";
import type { CloudHooks } from "../src/cloud-context.js";
import { run } from "../src/index.js";
import { CloudStub } from "./cloud-stub.js";

export const MANIFEST = '{\n  "name": "Shop",\n  "language": "0.2"\n}\n';

/** A sheet with two elements, `start` and `done`, and the relation between them. */
export function sheet(label = "Start", extra = ""): string {
  return `language "0.2"\n\ndiagram flow: flow {\n  start["${label}"]\n  done["Done"]\n  start -> done\n${extra}}\n`;
}

/** The bytes of a small PNG-looking file, different for each `seed`. */
export function png(seed: string): Buffer {
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(seed)]);
}

export class Scratch {
  readonly root = mkdtempSync(join(tmpdir(), "mdg-cloud-"));
  private counter = 0;

  /** A folder of its own with these files (text, or bytes), made under the scratch folder. */
  folder(files: Readonly<Record<string, string | Buffer>> = {}, name?: string): string {
    const folder = join(this.root, name ?? `folder-${this.counter++}`);
    mkdirSync(folder, { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      const file = join(folder, ...path.split("/"));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    return folder;
  }

  /** A home of its own: its configuration folder is the only one the commands see. */
  home(stub: CloudStub, extra: Record<string, string> = {}) {
    const root = join(this.root, `home-${this.counter++}`);
    mkdirSync(root, { recursive: true });
    const env: Record<string, string> = {
      APPDATA: join(root, "AppData"),
      XDG_CONFIG_HOME: join(root, "config"),
      HOME: root,
      USERPROFILE: root,
      MELTEMI_HOST: stub.url,
      ...extra,
    };
    return { root, env, store: new CredentialsStore({ env }) };
  }
}

/** Signs a person in the way `login` leaves them: a token the stub knows, kept for the host. */
export function signIn(stub: CloudStub, store: CredentialsStore, host = stub.url) {
  const { token, id } = stub.mint("CLI");
  store.save(host, { token, id, user: { sub: "u_7d3f", name: "Ana" } });
  return { token, id };
}

export interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** The questions the command asked, in order. */
  readonly asked: readonly string[];
}

/**
 * Runs the command line in `cwd` against the stub. `answers` are the replies of a person at a
 * terminal, one for each question (a function can do something at the moment of the question, as
 * somebody else changing the cloud would); without `answers` nobody can be asked.
 */
export async function mdg(
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    answers?: ReadonlyArray<string | (() => string)>;
    hooks?: CloudHooks;
  },
): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const asked: string[] = [];
  const answers = options.answers;
  const code = await run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd: options.cwd,
    env: options.env,
    ...(answers
      ? {
          ask: async (question: string) => {
            asked.push(question);
            const answer = answers[asked.length - 1];
            if (answer === undefined) throw new Error(`unexpected question: ${question}`);
            return typeof answer === "function" ? answer() : answer;
          },
        }
      : {}),
    ...(options.hooks ? { cloud: options.hooks } : {}),
  });
  return { code, stdout, stderr, asked };
}

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CloudError } from "../src/cloud-errors.js";
import {
  CredentialsStore,
  DEFAULT_HOST,
  checkManifestHost,
  configurationFolder,
  credentialsPath,
  environmentToken,
  resolveHost,
  type StoredEntry,
} from "../src/credentials.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-credentials-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** A temporary home whose configuration folder is its own, on whatever platform this runs on. */
function home() {
  const root = join(scratch, `home-${counter++}`);
  mkdirSync(root, { recursive: true });
  const env = { APPDATA: join(root, "AppData"), XDG_CONFIG_HOME: join(root, "config") };
  const store = new CredentialsStore({ env, home: root });
  return { root, env, store };
}

const ENTRY: StoredEntry = {
  token: "mdg_fake0123456789",
  id: "5f0c2a9e",
  user: { sub: "u_7d3f", name: "Ana" },
};
const HOST = "https://diagrams.meltemi.dev";

function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof CloudError) return error.code;
    throw error;
  }
  return "none";
}

describe("the configuration folder", () => {
  it("is %APPDATA%\\meltemi-diagrams on Windows, from the profile without APPDATA", () => {
    expect(
      configurationFolder({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\ana\\AppData\\Roaming" },
      }),
    ).toBe("C:\\Users\\ana\\AppData\\Roaming\\meltemi-diagrams");
    expect(
      credentialsPath({ platform: "win32", env: { APPDATA: "C:\\Users\\ana\\AppData\\Roaming" } }),
    ).toBe("C:\\Users\\ana\\AppData\\Roaming\\meltemi-diagrams\\credentials.json");
    expect(configurationFolder({ platform: "win32", env: { USERPROFILE: "C:\\Users\\bo" } })).toBe(
      "C:\\Users\\bo\\AppData\\Roaming\\meltemi-diagrams",
    );
    expect(
      configurationFolder({ platform: "win32", env: { APPDATA: "" }, home: "C:\\Users\\cy" }),
    ).toBe("C:\\Users\\cy\\AppData\\Roaming\\meltemi-diagrams");
  });

  it("is $XDG_CONFIG_HOME/meltemi-diagrams elsewhere, else ~/.config/meltemi-diagrams", () => {
    for (const platform of ["linux", "darwin"] as const) {
      expect(
        configurationFolder({ platform, env: { XDG_CONFIG_HOME: "/cfg", HOME: "/home/ana" } }),
      ).toBe("/cfg/meltemi-diagrams");
      expect(configurationFolder({ platform, env: { HOME: "/home/ana" } })).toBe(
        "/home/ana/.config/meltemi-diagrams",
      );
      expect(credentialsPath({ platform, env: { HOME: "/home/ana" } })).toBe(
        "/home/ana/.config/meltemi-diagrams/credentials.json",
      );
    }
    // A relative XDG_CONFIG_HOME is not a place (the specification says to ignore it).
    expect(
      configurationFolder({
        platform: "linux",
        env: { XDG_CONFIG_HOME: "cfg", HOME: "/home/ana" },
      }),
    ).toBe("/home/ana/.config/meltemi-diagrams");
    expect(
      configurationFolder({ platform: "linux", env: { XDG_CONFIG_HOME: "", HOME: "/home/ana" } }),
    ).toBe("/home/ana/.config/meltemi-diagrams");
  });
});

describe("the host", () => {
  it("is --host, else MELTEMI_HOST, else the service", () => {
    expect(DEFAULT_HOST).toBe("https://diagrams.meltemi.dev");
    expect(resolveHost({ env: {} })).toBe("https://diagrams.meltemi.dev");
    expect(resolveHost({ env: { MELTEMI_HOST: "http://localhost:8788" } })).toBe(
      "http://localhost:8788",
    );
    expect(
      resolveHost({
        flag: "https://staging.example/",
        env: { MELTEMI_HOST: "http://localhost:8788" },
      }),
    ).toBe("https://staging.example");
    // An unset variable that expands to nothing (CI) is not a host.
    expect(resolveHost({ env: { MELTEMI_HOST: "" } })).toBe(DEFAULT_HOST);
    expect(resolveHost({ env: { MELTEMI_HOST: "  " } })).toBe(DEFAULT_HOST);
  });

  it("is an origin, and http: only on the loopback", () => {
    expect(code(() => resolveHost({ flag: "http://diagrams.example", env: {} }))).toBe(
      "cloud.insecure-host",
    );
    expect(code(() => resolveHost({ env: { MELTEMI_HOST: "http://10.0.0.5:8788" } }))).toBe(
      "cloud.insecure-host",
    );
    for (const ok of ["http://localhost:8788", "http://127.0.0.1:8788", "http://[::1]:8788"]) {
      expect(resolveHost({ flag: ok, env: {} })).toBe(ok);
    }
    for (const bad of ["", "diagrams.meltemi.dev", "https://a.example/app", "ftp://a.example"]) {
      expect(
        code(() => resolveHost({ flag: bad, env: {} })),
        bad,
      ).toBe("cloud.host-invalid");
    }
    // The text of the host is in the error, for the message that names it.
    try {
      resolveHost({ flag: "http://diagrams.example", env: {} });
    } catch (error) {
      expect((error as CloudError).message).toContain("http://diagrams.example");
      expect((error as CloudError).details["host"]).toBe("http://diagrams.example");
      expect((error as CloudError).exitCode).toBe(1);
    }
  });

  it("fails with cloud.host-mismatch, naming both hosts and --host, when a manifest names another", () => {
    let caught: CloudError | undefined;
    try {
      checkManifestHost("https://diagrams.meltemi.dev", "https://evil.example");
    } catch (error) {
      caught = error as CloudError;
    }
    expect(caught?.code).toBe("cloud.host-mismatch");
    expect(caught?.message).toContain("https://evil.example");
    expect(caught?.message).toContain("https://diagrams.meltemi.dev");
    expect(caught?.message).toContain("--host");
    expect(caught?.details).toEqual({
      manifestHost: "https://evil.example",
      host: "https://diagrams.meltemi.dev",
    });
    expect(caught?.exitCode).toBe(1);
  });

  it("lets a manifest agree with the host in any spelling of the same origin", () => {
    expect(() => checkManifestHost(DEFAULT_HOST, DEFAULT_HOST)).not.toThrow();
    expect(() => checkManifestHost(DEFAULT_HOST, "https://Diagrams.Meltemi.dev/")).not.toThrow();
    expect(() => checkManifestHost(DEFAULT_HOST, undefined)).not.toThrow();
    expect(() => checkManifestHost(DEFAULT_HOST, null)).not.toThrow();
    expect(code(() => checkManifestHost(DEFAULT_HOST, "http://diagrams.meltemi.dev"))).toBe(
      "cloud.host-mismatch",
    );
    expect(code(() => checkManifestHost("http://localhost:8788", DEFAULT_HOST))).toBe(
      "cloud.host-mismatch",
    );
  });
});

describe("the credentials file", () => {
  it("is empty until something is saved, and holds one entry per host", () => {
    const { store } = home();
    expect(store.entry(HOST)).toBeUndefined();
    expect(store.hosts()).toEqual([]);
    store.save(HOST, ENTRY);
    const other: StoredEntry = { ...ENTRY, token: "mdg_other0123456789", id: "aa" };
    store.save("http://localhost:8788", other);
    expect(store.entry(HOST)).toEqual(ENTRY);
    expect(store.entry("http://localhost:8788")).toEqual(other);
    expect(store.hosts().sort()).toEqual([HOST, "http://localhost:8788"].sort());
    expect(JSON.parse(readFileSync(store.path, "utf8"))).toEqual({
      hosts: { [HOST]: ENTRY, "http://localhost:8788": other },
    });
  });

  it("replaces the entry of a host and keeps the others and fields it does not know", () => {
    const { store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(
      store.path,
      JSON.stringify({ version: 2, hosts: { "https://old.example": { token: "x", extra: 1 } } }),
    );
    store.save(HOST, ENTRY);
    store.save(HOST, { ...ENTRY, id: "new" });
    const written = JSON.parse(readFileSync(store.path, "utf8"));
    expect(written.version).toBe(2);
    expect(written.hosts["https://old.example"]).toEqual({ token: "x", extra: 1 });
    expect(written.hosts[HOST].id).toBe("new");
  });

  it("forgets one host and the file goes with the last", () => {
    const { store } = home();
    store.save(HOST, ENTRY);
    store.save("http://localhost:8788", ENTRY);
    expect(store.remove(HOST)).toBe(true);
    expect(store.entry(HOST)).toBeUndefined();
    expect(store.entry("http://localhost:8788")).toEqual(ENTRY);
    expect(store.remove(HOST)).toBe(false);
    expect(store.remove("http://localhost:8788")).toBe(true);
    expect(existsSync(store.path)).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "is written with mode 0o600 in a folder of 0o700, replacing a looser file",
    () => {
      const { store } = home();
      mkdirSync(store.folder, { recursive: true });
      writeFileSync(store.path, "{}", { mode: 0o644 });
      store.save(HOST, ENTRY);
      expect(statSync(store.path).mode & 0o777).toBe(0o600);
      expect(statSync(store.folder).mode & 0o777).toBe(0o700);
    },
  );

  it("is written through a temporary file that does not stay behind", () => {
    const { store } = home();
    store.save(HOST, ENTRY);
    store.save("http://localhost:8788", ENTRY);
    store.remove("http://localhost:8788");
    expect(readdirSync(store.folder)).toEqual(["credentials.json"]);
  });

  it("reports a file that cannot be read, and writes nothing beside it", () => {
    const { store } = home();
    // A folder where the file should be.
    mkdirSync(store.path, { recursive: true });
    expect(code(() => store.entry(HOST))).toBe("credentials.unreadable");
    expect(code(() => store.save(HOST, ENTRY))).toBe("credentials.unreadable");
    expect(readdirSync(store.folder)).toEqual(["credentials.json"]);
  });

  it("reports a folder it cannot make", () => {
    const { store, root } = home();
    // A file where the folder should be.
    writeFileSync(join(root, "config"), "in the way");
    writeFileSync(join(root, "AppData"), "in the way");
    expect(code(() => store.prepare())).toBe("credentials.unwritable");
    expect(code(() => store.save(HOST, ENTRY))).toBe("credentials.unwritable");
  });

  it("reports a file that is not credentials, never crashes and never writes over it", () => {
    const bad: [string, string][] = [
      ["not json", "{ broken"],
      ["an empty file", ""],
      ["an array", "[]"],
      ["a string", '"hosts"'],
      ["hosts that is not an object", '{ "hosts": [] }'],
    ];
    for (const [what, content] of bad) {
      const { store } = home();
      mkdirSync(store.folder, { recursive: true });
      writeFileSync(store.path, content);
      for (const action of [
        () => store.entry(HOST),
        () => store.hosts(),
        () => store.prepare(),
        () => store.save(HOST, ENTRY),
        () => store.remove(HOST),
        () => store.resolveToken(HOST, {}),
      ]) {
        expect(code(action), what).toBe("credentials.corrupt");
      }
      expect(readFileSync(store.path, "utf8"), what).toBe(content);
    }
  });

  it("names the file and why in the error", () => {
    const { store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(store.path, "{ broken");
    try {
      store.entry(HOST);
      expect.unreachable();
    } catch (error) {
      const caught = error as CloudError;
      expect(caught.code).toBe("credentials.corrupt");
      expect(caught.details["path"]).toBe(store.path);
      expect(caught.message).toContain(store.path);
      expect(caught.exitCode).toBe(1);
    }
  });

  it("reports an entry that is not an entry, only when that host is asked about", () => {
    const { store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(
      store.path,
      JSON.stringify({
        hosts: {
          [HOST]: { token: "mdg_x", id: "1" },
          "http://localhost:8788": ENTRY,
          "https://b.example": { token: "has space", id: "1", user: { sub: "u", name: "n" } },
          "https://c.example": { token: "mdg_x", id: "", user: { sub: "u", name: "n" } },
        },
      }),
    );
    expect(code(() => store.entry(HOST))).toBe("credentials.corrupt");
    expect(store.entry("http://localhost:8788")).toEqual(ENTRY);
    expect(code(() => store.entry("https://b.example"))).toBe("credentials.corrupt");
    expect(code(() => store.entry("https://c.example"))).toBe("credentials.corrupt");
    expect(store.entry("https://none.example")).toBeUndefined();
  });

  it("reads a file with a byte order mark and refuses one that is far too large", () => {
    const { store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(store.path, `\uFEFF${JSON.stringify({ hosts: { [HOST]: ENTRY } })}`);
    expect(store.entry(HOST)).toEqual(ENTRY);
    writeFileSync(store.path, `{ "hosts": {}, "pad": "${"x".repeat(1024 * 1024)}" }`);
    expect(code(() => store.entry(HOST))).toBe("credentials.corrupt");
  });
});

describe("the token a command uses", () => {
  it("is MELTEMI_TOKEN when it is set, without reading the file", () => {
    const { store } = home();
    mkdirSync(store.folder, { recursive: true });
    writeFileSync(store.path, "{ not even json");
    expect(store.resolveToken(HOST, { MELTEMI_TOKEN: "mdg_fromenv0123" })).toEqual({
      token: "mdg_fromenv0123",
      source: "environment",
    });
    expect(environmentToken({ MELTEMI_TOKEN: "  mdg_padded0123 " })).toBe("mdg_padded0123");
  });

  it("is the file's entry for the host otherwise, and nothing when there is none", () => {
    const { store } = home();
    expect(store.resolveToken(HOST, {})).toBeUndefined();
    store.save(HOST, ENTRY);
    expect(store.resolveToken(HOST, {})).toEqual({
      token: ENTRY.token,
      source: "file",
      entry: ENTRY,
    });
    expect(store.resolveToken("http://localhost:8788", {})).toBeUndefined();
    for (const empty of ["", "   ", undefined]) {
      expect(environmentToken({ MELTEMI_TOKEN: empty })).toBeUndefined();
      expect(store.resolveToken(HOST, { MELTEMI_TOKEN: empty })?.source).toBe("file");
    }
  });

  it("is never one host's token for another", () => {
    const { store } = home();
    store.save(HOST, ENTRY);
    expect(store.resolveToken("https://diagrams.example", {})).toBeUndefined();
    expect(store.resolveToken("http://localhost:8788", {})).toBeUndefined();
  });
});

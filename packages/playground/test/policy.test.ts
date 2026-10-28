import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSession } from "../src/cloud/session.js";
import {
  ANONYMOUS_SESSION,
  AVATAR_HOSTS,
  PAGE_HEADERS,
  DEFAULT_IDENTITY,
  agentSetupPolicy,
  contentSecurityPolicy,
  identityOrigin,
} from "../policy.mjs";

/** The policy as a map from directive to the sources it lists. */
function directives(policy: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const directive of policy.split("; ")) {
    const [name, ...sources] = directive.split(" ");
    expect(found.has(name!), `${name} is listed once`).toBe(false);
    found.set(name!, sources);
  }
  return found;
}

describe("identityOrigin", () => {
  it("is the family's identity service unless the build says another", () => {
    expect(DEFAULT_IDENTITY).toBe("https://id.meltemi.dev");
    for (const nothing of [undefined, "", " ", "\n", " \t\n "]) {
      expect(identityOrigin(nothing), JSON.stringify(nothing)).toBe("https://id.meltemi.dev");
    }
  });

  it("takes an origin, with or without a slash after it, and gives it back without", () => {
    expect(identityOrigin("https://id.meltemi.dev")).toBe("https://id.meltemi.dev");
    expect(identityOrigin("https://id.meltemi.dev/")).toBe("https://id.meltemi.dev");
    expect(identityOrigin("  https://id.meltemi.dev/ \n")).toBe("https://id.meltemi.dev");
    expect(identityOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(identityOrigin("http://localhost:8787/")).toBe("http://localhost:8787");
    expect(identityOrigin("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(identityOrigin("http://[::1]:8787/")).toBe("http://[::1]:8787");
    expect(identityOrigin("https://id.staging.example.org:8443")).toBe(
      "https://id.staging.example.org:8443",
    );
  });

  it("gives the origin the way a browser writes it", () => {
    expect(identityOrigin("HTTPS://ID.Meltemi.DEV")).toBe("https://id.meltemi.dev");
    expect(identityOrigin("https://id.meltemi.dev:443")).toBe("https://id.meltemi.dev");
    expect(identityOrigin("http://localhost:80/")).toBe("http://localhost");
    expect(identityOrigin("https://ID.MÉLTEMI.dev")).toBe("https://id.xn--mltemi-bva.dev");
    // A browser reads a backslash as a slash, so this is the origin and a root path.
    expect(identityOrigin("https://id.meltemi.dev\\")).toBe("https://id.meltemi.dev");
  });

  it.each([
    ["a path", "https://id.meltemi.dev/login"],
    ["a path of one folder", "https://id.meltemi.dev/a/"],
    ["a query", "https://id.meltemi.dev?x=1"],
    ["a query after a slash", "https://id.meltemi.dev/?x=1"],
    ["an empty query", "https://id.meltemi.dev/?"],
    ["a fragment", "https://id.meltemi.dev/#x"],
    ["an empty fragment", "https://id.meltemi.dev#"],
    ["credentials", "https://user:secret@id.meltemi.dev"],
    ["a user name", "https://user@id.meltemi.dev"],
    ["a password", "https://:secret@id.meltemi.dev"],
  ])("refuses %s", (_what, value) => {
    expect(() => identityOrigin(value)).toThrow(
      /^PLAYGROUND_IDENTITY must be the origin of the identity service, such as https:\/\/id\.meltemi\.dev/,
    );
  });

  it.each([
    ["ftp", "ftp://id.meltemi.dev"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,x"],
    ["file:", "file:///etc/passwd"],
    ["a websocket", "wss://id.meltemi.dev"],
    ["no scheme", "id.meltemi.dev"],
    ["no scheme but a slash pair", "//id.meltemi.dev"],
    ["garbage", "not a url"],
    ["a scheme only", "https://"],
    ["a port out of range", "http://localhost:99999"],
    ["a space in the host", "https://id meltemi.dev"],
    ["two origins", "https://id.meltemi.dev https://evil.example"],
  ])("refuses %s", (_what, value) => {
    expect(() => identityOrigin(value)).toThrow(/^PLAYGROUND_IDENTITY must be/);
  });

  it("says what it got and why it refused", () => {
    expect(() => identityOrigin("ftp://id.meltemi.dev")).toThrow(
      'it must start with http:// or https://); got "ftp://id.meltemi.dev".',
    );
    expect(() => identityOrigin("https://id.meltemi.dev/login")).toThrow(
      "it must have no credentials, path, query or fragment",
    );
    expect(() => identityOrigin("nonsense")).toThrow("it is not an address");
  });

  it.each([
    ["a double quote", 'https://id.meltemi.dev"'],
    ["a double quote and more policy", 'https://id.meltemi.dev"; script-src *'],
    ["a quote that closes the attribute", 'https://id.meltemi.dev" onload="alert(1)'],
    ["a single quote", "https://id.meltemi.dev'"],
    ["a semicolon", "https://id.meltemi.dev;"],
    ["a semicolon and a directive", "https://id.meltemi.dev;script-src"],
    ["a comma", "https://id.meltemi.dev,evil.example"],
    ["an asterisk", "https://id.meltemi.dev*"],
    ["a wildcard host", "https://*.meltemi.dev"],
    ["a dollar sign", "https://id.meltemi.dev$"],
    ["an exclamation mark", "https://id.meltemi.dev!"],
    ["parentheses", "https://id.meltemi.dev(x)"],
    ["an equals sign", "https://id.meltemi.dev="],
    ["a plus sign", "https://id.meltemi.dev+"],
    ["a tilde", "https://id.meltemi.dev~"],
    ["a percent sign", "https://id.meltemi.dev%22"],
    ["a backtick", "https://id.meltemi.dev`"],
    ["an angle bracket", "https://id.meltemi.dev<"],
  ])("refuses %s, which could break out of the policy or its attribute", (_what, value) => {
    expect(() => identityOrigin(value)).toThrow(/^PLAYGROUND_IDENTITY must be/);
  });

  it("only ever gives back an origin made of letters, digits and the marks of an address", () => {
    const odd = [
      "https://id.melt\nemi.dev",
      "https://id.melt\temi.dev",
      "https://ID.MELTEMI.DEV/",
      "http://LOCALHOST:8787",
      "https://xn--mltemi-dxa.dev",
      "https://id.meltemi.dev.",
    ];
    for (const value of odd) {
      const origin = identityOrigin(value);
      expect(origin, JSON.stringify(value)).toMatch(/^https?:\/\/[A-Za-z0-9.:[\]-]+$/);
    }
  });
});

describe("contentSecurityPolicy", () => {
  it("is exactly this for the default identity service", () => {
    expect(contentSecurityPolicy(identityOrigin(undefined))).toBe(
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
        "font-src 'self' data: blob:",
        "connect-src 'self'",
        "frame-src 'self'",
        "base-uri 'none'",
        "form-action 'self' https://id.meltemi.dev",
      ].join("; "),
    );
  });

  it("is exactly this for an identity service running locally", () => {
    expect(contentSecurityPolicy(identityOrigin("http://localhost:8787"))).toBe(
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
        "font-src 'self' data: blob:",
        "connect-src 'self'",
        "frame-src 'self'",
        "base-uri 'none'",
        "form-action 'self' http://localhost:8787",
      ].join("; "),
    );
  });

  it("lets a form post to the page itself and to the identity service, nowhere else", () => {
    for (const identity of ["https://id.meltemi.dev", "http://localhost:8787"]) {
      expect(directives(contentSecurityPolicy(identity)).get("form-action")).toEqual([
        "'self'",
        identity,
      ]);
    }
  });

  it("draws avatars from the providers' hosts and the page's own, and from data and blobs", () => {
    expect(AVATAR_HOSTS).toEqual([
      "https://avatars.githubusercontent.com",
      "https://*.googleusercontent.com",
    ]);
    const images = directives(contentSecurityPolicy(DEFAULT_IDENTITY)).get("img-src")!;
    expect(images).toEqual(["'self'", "data:", "blob:", ...AVATAR_HOSTS]);
  });

  it("keeps the page's connections to its own origin and its scripts to its own files", () => {
    const policy = directives(contentSecurityPolicy("http://localhost:8787"));
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("default-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("frame-src")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("allows no eval, no inline script and no wildcard for scripts or connections", () => {
    const policy = contentSecurityPolicy(DEFAULT_IDENTITY);
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("wasm-unsafe-eval");
    expect(policy).not.toContain("strict-dynamic");
    const parsed = directives(policy);
    // The only inline allowance is the styles the drawn SVG carries.
    expect(
      [...parsed]
        .filter(([, sources]) => sources.includes("'unsafe-inline'"))
        .map(([name]) => name),
    ).toEqual(["style-src"]);
    for (const name of ["script-src", "connect-src", "default-src", "frame-src", "form-action"]) {
      expect(
        parsed.get(name)!.filter((source) => source.includes("*")),
        name,
      ).toEqual([]);
    }
    // The one wildcard is the subdomain of the providers' picture host.
    expect([...policy.matchAll(/[^\s;]*\*[^\s;]*/g)].map((match) => match[0])).toEqual([
      "https://*.googleusercontent.com",
    ]);
  });

  it("says nothing the browser ignores in a meta element", () => {
    // `frame-ancestors`, `report-uri` and `sandbox` do not work in a <meta> policy.
    const policy = contentSecurityPolicy(DEFAULT_IDENTITY);
    for (const name of ["frame-ancestors", "report-uri", "report-to", "sandbox"]) {
      expect(policy).not.toContain(name);
    }
  });

  it("sits in the page's attribute without breaking out of it", () => {
    const template = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(template.split("{{policy}}")).toHaveLength(2);
    for (const identity of [
      "https://id.meltemi.dev",
      "http://localhost:8787",
      "http://[::1]:8787",
    ]) {
      const policy = contentSecurityPolicy(identity);
      expect(policy).not.toMatch(/["<>\n\r\\`]/);
      const page = template.replace("{{policy}}", policy);
      const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/.exec(page);
      expect(meta?.[1]).toBe(policy);
    }
  });

  it("is what the build gives the page for the identity service it is told", () => {
    // The build runs `identityOrigin` on the text of PLAYGROUND_IDENTITY, then this.
    expect(contentSecurityPolicy(identityOrigin("http://localhost:8787/"))).toContain(
      "form-action 'self' http://localhost:8787",
    );
    expect(contentSecurityPolicy(identityOrigin(undefined))).toContain(
      "form-action 'self' https://id.meltemi.dev",
    );
  });
});

describe("PAGE_HEADERS", () => {
  it("gives every path exactly the two headers the page needs from its server", () => {
    const lines = PAGE_HEADERS.split("\n").filter((line) => line.trim() !== "");
    expect(lines).toEqual([
      "/*",
      "  Content-Security-Policy: frame-ancestors 'self'",
      "  X-Content-Type-Options: nosniff",
    ]);
  });

  it("is written by the build beside api/session", () => {
    const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");
    expect(build).toContain('writeFileSync(join(dist, "_headers"), PAGE_HEADERS);');
  });
});

describe("agentSetupPolicy", () => {
  it("allows the agent setup page its stylesheet and icon, and nothing else", () => {
    expect(agentSetupPolicy()).toBe(
      "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'",
    );
  });

  it("is what the build writes into the two pages, beside the stylesheet and the prompt", () => {
    const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");
    for (const write of [
      'writeFileSync(join(dist, "agent-setup", "index.html"), agentSetupPage("en.html"));',
      'writeFileSync(join(dist, "es", "agent-setup", "index.html"), agentSetupPage("es.html"));',
      'copy(join(agentSetup, "agent-setup.css"), join(dist, "agent-setup", "agent-setup.css"));',
      'join(dist, "agent-setup", "prompt.md"),',
    ]) {
      expect(build).toContain(write);
    }
    expect(build).toContain('.replace("{{policy}}", agentSetupPolicy())');
  });
});

describe("ANONYMOUS_SESSION", () => {
  it("is exactly nobody, written the way the build writes it", () => {
    expect(ANONYMOUS_SESSION).toBe('{"user":null}');
    expect(JSON.parse(ANONYMOUS_SESSION)).toEqual({ user: null });
  });

  it("makes the page offer the sign-in link it builds itself", () => {
    const page = "http://127.0.0.1:4173/index.html";
    expect(parseSession(ANONYMOUS_SESSION, page, DEFAULT_IDENTITY)).toEqual({
      kind: "anonymous",
      signIn: `https://id.meltemi.dev/login?return_to=${encodeURIComponent(page)}`,
    });
  });
});

/** A `major.minor.patch` version. Pre-release and build suffixes are not used by the tool. */
export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseVersion(text: string): Version | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

type Comparator = { readonly op: "<" | "<=" | ">" | ">=" | "="; readonly version: Version };

/**
 * Parses a range into comparator sets: exact versions, `^x.y.z`, `~x.y.z`, space-separated
 * comparators (`>=0.3.0 <1.0.0`), alternatives with `||`, and `*`. Returns undefined when the
 * range cannot be read.
 */
export function parseRange(range: string): Comparator[][] | undefined {
  const alternatives: Comparator[][] = [];
  for (const alternative of range.split("||")) {
    const parts = alternative.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return undefined;
    const set: Comparator[] = [];
    for (const part of parts) {
      if (part === "*") continue;
      const match = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(part)!;
      const version = parseVersion(match[2]!);
      if (!version) return undefined;
      const op = match[1];
      if (op === "^") {
        const upper =
          version.major > 0
            ? { major: version.major + 1, minor: 0, patch: 0 }
            : version.minor > 0
              ? { major: 0, minor: version.minor + 1, patch: 0 }
              : { major: 0, minor: 0, patch: version.patch + 1 };
        set.push({ op: ">=", version }, { op: "<", version: upper });
      } else if (op === "~") {
        set.push(
          { op: ">=", version },
          { op: "<", version: { major: version.major, minor: version.minor + 1, patch: 0 } },
        );
      } else {
        set.push({ op: (op ?? "=") as Comparator["op"], version });
      }
    }
    alternatives.push(set);
  }
  return alternatives;
}

/** True when `version` satisfies `range`; false when either cannot be read. */
export function satisfiesRange(version: string, range: string): boolean {
  const parsed = parseVersion(version);
  const sets = parseRange(range);
  if (!parsed || !sets) return false;
  return sets.some((set) =>
    set.every(({ op, version: bound }) => {
      const c = compare(parsed, bound);
      switch (op) {
        case "<":
          return c < 0;
        case "<=":
          return c <= 0;
        case ">":
          return c > 0;
        case ">=":
          return c >= 0;
        case "=":
          return c === 0;
      }
    }),
  );
}

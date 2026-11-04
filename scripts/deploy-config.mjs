// The Workers' configurations as the deploy workflow uploads them: the committed `wrangler.jsonc`
// and `wrangler.publish.jsonc` with the ids the family's Terraform gave written in. The committed
// files keep placeholders (all zeros), which `wrangler dev` accepts locally; Terraform writes the
// real ids as variables of this repository's `production` environment (decision 0046), and this
// script fills them in, so nobody copies an id.
//
//   node scripts/deploy-config.mjs <path/to/wrangler.jsonc> [<path/to/wrangler.publish.jsonc> ...]
//
// It writes `<name>.deploy.json` beside each file (`wrangler.deploy.json`,
// `wrangler.publish.deploy.json`; paths in it stay relative to that folder), from D1_DATABASE_ID
// and SECRETS_STORE_ID in the environment, and refuses to leave a placeholder.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DATABASE_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
export const STORE_PLACEHOLDER = "00000000000000000000000000000000";

/** The file written beside `file`: `wrangler.jsonc` becomes `wrangler.deploy.json`. */
export function outputFor(file) {
  return `${file.replace(/\.jsonc?$/, "")}.deploy.json`;
}

/** JSON with comments and trailing commas, as Wrangler and Prettier write `.jsonc`, read as JSON. */
export function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) throw new Error("unterminated comment");
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The configuration with the ids in place. `ids` gives `database` (the D1 database's id) and
 * `store` (the Secrets Store's id); a placeholder with no id to replace it is an error naming the
 * variable, and so is a placeholder left anywhere.
 */
export function deployConfig(config, ids) {
  const out = structuredClone(config);
  for (const database of out.d1_databases ?? []) {
    if (database.database_id !== DATABASE_PLACEHOLDER) continue;
    if (!ids.database) {
      throw new Error(
        "D1_DATABASE_ID is not set: the production environment's variable comes from Terraform",
      );
    }
    database.database_id = ids.database;
  }
  for (const secret of out.secrets_store_secrets ?? []) {
    if (secret.store_id !== STORE_PLACEHOLDER) continue;
    if (!ids.store) {
      throw new Error(
        "SECRETS_STORE_ID is not set: the production environment's variable comes from Terraform",
      );
    }
    secret.store_id = ids.store;
  }
  const text = JSON.stringify(out);
  if (text.includes(DATABASE_PLACEHOLDER) || text.includes(STORE_PLACEHOLDER)) {
    throw new Error("a placeholder id is left in the configuration");
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: deploy-config.mjs <path/to/wrangler.jsonc> [...]");
    process.exit(1);
  }
  try {
    for (const file of files) {
      const config = deployConfig(parseJsonc(readFileSync(file, "utf8")), {
        database: process.env.D1_DATABASE_ID?.trim() || undefined,
        store: process.env.SECRETS_STORE_ID?.trim() || undefined,
      });
      const target = outputFor(file);
      writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
      console.log(`wrote ${target} for ${config.name}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// The Workers' configurations as the deploy workflow uploads them: the committed `wrangler.jsonc`
// and `wrangler.publish.jsonc` with the ids the family's Terraform gave written in. The committed
// files keep placeholders (all zeros), which `wrangler dev` accepts locally; Terraform writes the
// real ids as variables of this repository's `production` and `staging` environments (decision
// 0046, and Meltemi Web's decision 0008 for staging), and this script fills them in, so nobody copies
// an id.
//
//   node scripts/deploy-config.mjs [--environment production|staging] <path/to/wrangler.jsonc> [...]
//
// It writes `<name>.deploy.json` beside each file (`wrangler.deploy.json`,
// `wrangler.publish.deploy.json`; paths in it stay relative to that folder). Each environment's job
// runs on its own runner, so both write the same names. From the environment's variables:
// D1_DATABASE_ID, SECRETS_STORE_ID, OAUTH_KV_ID (once a configuration binds `OAUTH_KV`),
// R2_BUCKET_NAME and SECRETS_SUFFIX. It refuses to leave a placeholder.
//
// Production (the default) is the committed file with the ids in place and nothing else changed.
// Staging is production's twin (change agent-mcp, design decision 8): the staging Workers' names, the
// staging database's name, the staging bucket, the staging hosts, the product name the identity
// service knows staging by, and the Store secrets that staging holds apart (`FORMS_SECRET` and
// `IDENTITY_EVENTS_SECRET` with SECRETS_SUFFIX; `ADMIN_SUBS` and `SPONSORS_WEBHOOK_SECRET` are
// shared). The variables must agree with the environment named: a suffix in production, or none in
// staging, is the other environment's configuration and is refused before anything is written.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DATABASE_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
export const STORE_PLACEHOLDER = "00000000000000000000000000000000";
/** A KV namespace's id in the committed file: zeros, as the Store's. */
export const KV_PLACEHOLDER = /^0+$/;

/** The names and hosts of the staging twin, which Meltemi Web's Terraform declares (`diagrams-staging`). */
export const STAGING = Object.freeze({
  workers: Object.freeze({
    "meltemi-diagrams-cloud": "meltemi-diagrams-staging",
    "meltemi-diagrams-publish": "meltemi-diagrams-publish-staging",
  }),
  database: "meltemi-diagrams-staging",
  origin: "https://staging.diagrams.meltemi.dev",
  publishHost: "staging.meltemi.page",
  productName: "diagrams-staging",
  /** The Store secrets staging binds with its suffix; the others are shared with production. */
  suffixed: Object.freeze(["FORMS_SECRET", "IDENTITY_EVENTS_SECRET"]),
});

export const ENVIRONMENTS = Object.freeze(["production", "staging"]);

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

/** The error of a variable the environment's Terraform should have set. */
function unset(name, environment) {
  return new Error(
    `${name} is not set: the ${environment} environment's variable comes from Terraform`,
  );
}

/**
 * The configuration with the ids in place, for `environment` (`production` by default). `ids` gives
 * `database` (the D1 database's id), `store` (the Secrets Store's id), `kv` (the `OAUTH_KV`
 * namespace's id), `bucket` (the R2 bucket's name) and `suffix` (the suffix of staging's own Store
 * secrets). A placeholder with no id to replace it is an error naming the variable, and so is a
 * placeholder left anywhere.
 */
export function deployConfig(config, ids, environment = "production") {
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`unknown environment ${environment}: production or staging`);
  }
  const staging = environment === "staging";
  const suffix = ids.suffix ?? "";
  if (!staging && suffix !== "") {
    throw new Error(
      "SECRETS_SUFFIX is set: that is the staging environment's configuration (--environment staging)",
    );
  }
  if (staging && suffix === "") throw unset("SECRETS_SUFFIX", environment);

  const out = structuredClone(config);
  if (staging) {
    const name = STAGING.workers[out.name];
    if (!name) throw new Error(`staging has no twin of the Worker ${out.name}`);
    out.name = name;
  }
  for (const database of out.d1_databases ?? []) {
    if (staging) database.database_name = STAGING.database;
    if (database.database_id !== DATABASE_PLACEHOLDER) {
      if (staging) throw new Error("staging's database id must come from D1_DATABASE_ID");
      continue;
    }
    if (!ids.database) throw unset("D1_DATABASE_ID", environment);
    database.database_id = ids.database;
  }
  for (const bucket of out.r2_buckets ?? []) {
    if (staging) {
      if (!ids.bucket) throw unset("R2_BUCKET_NAME", environment);
      if (ids.bucket === bucket.bucket_name) {
        throw new Error(`R2_BUCKET_NAME ${ids.bucket} is production's bucket`);
      }
      bucket.bucket_name = ids.bucket;
    } else if (ids.bucket && ids.bucket !== bucket.bucket_name) {
      // Production binds the committed bucket; a different name is a variable of another setup.
      throw new Error(
        `R2_BUCKET_NAME ${ids.bucket} is not the committed bucket ${bucket.bucket_name}`,
      );
    }
  }
  for (const namespace of out.kv_namespaces ?? []) {
    if (!KV_PLACEHOLDER.test(String(namespace.id ?? ""))) {
      if (staging) throw new Error(`staging's ${namespace.binding} id must come from OAUTH_KV_ID`);
      continue;
    }
    if (namespace.binding !== "OAUTH_KV") {
      throw new Error(`no variable gives the id of the KV namespace ${namespace.binding}`);
    }
    if (!ids.kv) throw unset("OAUTH_KV_ID", environment);
    namespace.id = ids.kv;
  }
  for (const secret of out.secrets_store_secrets ?? []) {
    if (staging && STAGING.suffixed.includes(secret.secret_name)) {
      secret.secret_name = `${secret.secret_name}${suffix}`;
    }
    if (secret.store_id !== STORE_PLACEHOLDER) continue;
    if (!ids.store) throw unset("SECRETS_STORE_ID", environment);
    secret.store_id = ids.store;
  }
  if (staging && out.vars) {
    out.vars = {
      ...out.vars,
      ORIGIN: STAGING.origin,
      PUBLISH_HOST: STAGING.publishHost,
      PRODUCT_NAME: STAGING.productName,
    };
  }
  const text = JSON.stringify(out);
  if (text.includes(DATABASE_PLACEHOLDER) || text.includes(STORE_PLACEHOLDER)) {
    throw new Error("a placeholder id is left in the configuration");
  }
  return out;
}

/** The arguments: `--environment <name>` (or `--environment=<name>`) and the files. */
export function readArguments(argv) {
  let environment = "production";
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--environment") environment = argv[++i] ?? "";
    else if (arg.startsWith("--environment=")) environment = arg.slice("--environment=".length);
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else files.push(arg);
  }
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`unknown environment ${environment || "(none)"}: production or staging`);
  }
  return { environment, files };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { environment, files } = readArguments(process.argv.slice(2));
    if (files.length === 0) {
      console.error(
        "usage: deploy-config.mjs [--environment production|staging] <path/to/wrangler.jsonc> [...]",
      );
      process.exit(1);
    }
    const read = (name) => process.env[name]?.trim() || undefined;
    const ids = {
      database: read("D1_DATABASE_ID"),
      store: read("SECRETS_STORE_ID"),
      kv: read("OAUTH_KV_ID"),
      bucket: read("R2_BUCKET_NAME"),
      suffix: read("SECRETS_SUFFIX"),
    };
    // Every file is checked before any is written, so a refusal leaves no half-written pair.
    const configs = files.map((file) => ({
      target: outputFor(file),
      config: deployConfig(parseJsonc(readFileSync(file, "utf8")), ids, environment),
    }));
    for (const { target, config } of configs) {
      writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
      console.log(`wrote ${target} for ${config.name} (${environment})`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

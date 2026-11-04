/**
 * The real command line against the real Worker (`cli-cloud`, task 3.3, done by a program instead
 * of by hand): `mdg` is run from its sources as a child process (`mdg.ts`), on a computer of its own
 * (a temporary home and configuration folders, `MELTEMI_HOST` at the Worker's origin, no
 * `MELTEMI_TOKEN`), with the Worker as `wrangler dev` runs it (a real D1, R2 and Durable Object room)
 * and browsers that do what the person does: approve the sign-in, edit in the page.
 *
 * - signing in: the six characters the terminal prints are the ones the approval page shows, the
 *   browser lands on the command line's listener, `whoami` agrees, the credentials file is where the
 *   platform keeps it, and `logout` revokes the token at the Worker and forgets it;
 * - the folder made by `init --template purchase`: `push --create` records the project in
 *   `project.json` and the room equals the folder; a page edits a file; `review --base cloud` names
 *   the difference by element id; `push` refuses without `--force`, `--check` reports, `--force`
 *   overwrites; `pull` makes the same files in another folder, and a second one does not overwrite
 *   what changed there; a version of the project is read back by `review --base cloud:<n>` and
 *   `pull --version`;
 * - `publish --handle … --slug …` prints an address that the Worker serves under `/_published/`
 *   with its exact headers, a folder that differs is not published without `--force`, `--unpublish`
 *   removes the page, and `projects --json` lists the project as the person's;
 * - in every scenario no `mdg_` token is in anything a command printed, nor in the Worker's log.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Device, Person, Run, Scenario } from "./scenario.js";
import {
  PNG,
  THUMBNAIL_RATE_LOGGED,
  codeIs,
  openByLink,
  readRoom,
  roomHolds,
  sha256,
} from "./cloud.js";
import { Cli, describe, tokensIn, type Finished } from "./mdg.js";
import { PAGE_HEADERS } from "./scenarios-publishing.js";
import { TOKEN_SHAPE, assertError, bearer, expectedCheck, openFile, until } from "./support.js";

const PAYMENT = "diagrams/payment.meltemi";
const PROJECT_ID = /[a-z0-9]{20}/;

// ---------------------------------------------------------------------------------------------
// What a command did

/** A command that ended with code 0, and nothing on its standard error. */
function ok(done: Finished): Finished {
  assert.equal(done.code, 0, describe(done));
  assert.equal(done.stderr, "", describe(done));
  return done;
}

/** A command that failed with `code`, and said `pattern` on its standard error. */
function refused(done: Finished, code: number, pattern: RegExp): Finished {
  assert.equal(done.code, code, describe(done));
  assert.match(done.stderr, pattern, describe(done));
  return done;
}

/** Whether a line is among those a command printed. */
const printsLine = (done: Finished, line: string): boolean =>
  done.stdout.split("\n").includes(line);

// ---------------------------------------------------------------------------------------------
// Folders

const BINARY = /\.(png|jpe?g|gif|webp|woff2|ttf|otf)$/i;

/** The files of a folder as the cloud keeps them: text by content, images and fonts by the hash of their bytes. */
function folderOf(folder: string): {
  readonly files: Record<string, string>;
  readonly binaries: Record<string, string>;
} {
  const files: Record<string, string> = {};
  const binaries: Record<string, string> = {};
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(folder, absolute).split(sep).join("/");
    if (BINARY.test(path)) binaries[path] = sha256(readFileSync(absolute));
    else files[path] = readFileSync(absolute, "utf8");
  }
  return { files, binaries };
}

/** The `cloud` field of a folder's `project.json`. */
function cloudOf(folder: string): unknown {
  return (JSON.parse(readFileSync(join(folder, "project.json"), "utf8")) as { cloud?: unknown })
    .cloud;
}

/** A folder made by `init --template purchase`, with a picture added: texts and an image to push. */
async function makeShop(cli: Cli, name = "Corner shop"): Promise<string> {
  const folder = join(cli.work, name);
  const made = ok(await cli.run(["init", folder, "--template", "purchase", "--name", name]));
  assert.match(made.stdout, /project\.json/, describe(made));
  mkdirSync(join(folder, "assets"), { recursive: true });
  writeFileSync(join(folder, "assets", "dot.png"), PNG);
  const { files, binaries } = folderOf(folder);
  assert.deepEqual(Object.keys(binaries), ["assets/dot.png"]);
  assert.ok(Object.keys(files).includes(PAYMENT), "the template has the payment sequence");
  return folder;
}

/** The count of files as `push` says it: `1 file`, `7 files`. */
const files = (n: number): string => `${n} ${n === 1 ? "file" : "files"}`;

// ---------------------------------------------------------------------------------------------
// Signing in

/** The entry the command line keeps for the Worker, as the credentials file holds it. */
interface Entry {
  readonly token: string;
  readonly id: string;
  readonly user: { readonly sub: string; readonly name: string };
}

/** The credentials file's entry for the Worker, or undefined when the file or the entry is not there. */
function storedEntry(cli: Cli, origin: string): Entry | undefined {
  if (!existsSync(cli.credentialsFile)) return undefined;
  const text = readFileSync(cli.credentialsFile, "utf8");
  return (JSON.parse(text) as { hosts?: Record<string, Entry> }).hosts?.[origin];
}

/**
 * `mdg login --no-browser` as a person does it: the terminal prints a check and an address, the
 * browser of the person (a device of their own) opens the address, shows the same check and is
 * approved, the browser lands on the command line's listener, and the command ends signed in.
 */
async function signIn(t: Run, cli: Cli, person: Person, name: string): Promise<Entry> {
  const browser = await t.device({ as: person });
  const login = cli.start(["login", "--no-browser"]);
  const printed = (await login.waitFor(/^check: ([A-Z2-7]{6})$/m, "the check line"))[1]!;
  await login.waitFor(/^Waiting for the approval/m, "the wait for the approval");
  const address = /^ {2}(http:\/\/\S+)$/m.exec(login.stdout)?.[1];
  assert.ok(address, `the approval address\n${login.report()}`);

  // The address is the Worker's approval page, for a port of this computer and the request's state.
  const url = new URL(address);
  assert.equal(url.origin, t.origin);
  assert.equal(url.pathname, "/cli-auth");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["port", "state"]);
  const port = Number(url.searchParams.get("port"));
  assert.ok(Number.isInteger(port) && port > 1023 && port < 65536, `port ${port}`);
  const state = url.searchParams.get("state") ?? "";
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(printed, expectedCheck(state), "the terminal prints the check of its state");

  // The page shows the same check: the person compares the two before they approve.
  const { page } = browser;
  const listener = `http://127.0.0.1:${port}`;
  t.allow(listener);
  const response = await page.goto(address);
  assert.equal(response?.status(), 200);
  assert.equal(await page.locator("h1").textContent(), "Allow the command line on this computer?");
  assert.equal(await page.locator("code.check").textContent(), printed);
  assert.match(await page.locator("main").innerText(), new RegExp(`port ${port} of this computer`));

  // Approving sends the browser to the command line's listener, which answers once it is done.
  await Promise.all([
    page.waitForURL((landed) => landed.origin === listener),
    page.getByRole("button", { name: "Approve", exact: true }).click(),
  ]);
  const landed = new URL(page.url());
  assert.deepEqual([...landed.searchParams.keys()].sort(), ["code", "state"]);
  assert.equal(landed.searchParams.get("state"), state);
  assert.match(
    (await page.locator("body").textContent()) ?? "",
    /Done\. You can close this window and go back to the terminal\./,
  );

  const done = ok(await login.finished);
  assert.ok(printsLine(done, `Signed in as ${name} (${t.origin})`), describe(done));

  // What the command line kept: the token, its id at the Worker and who it is for.
  const entry = storedEntry(cli, t.origin);
  assert.ok(entry, `an entry for ${t.origin} in ${cli.credentialsFile}`);
  assert.match(entry.token, TOKEN_SHAPE);
  assert.deepEqual(entry.user, { sub: person.sub, name });
  const me = await t.ask("/api/session", { headers: bearer(entry.token) });
  const held = me.json()["token"] as { id: string; name: string };
  assert.equal(held.id, entry.id);
  assert.match(held.name, /^CLI \(\d{4}-\d{2}-\d{2}\)$/);
  // The browser was handed a code, never the token.
  assert.deepEqual(
    browser.seen.requests.filter((address) => address.includes(entry.token)),
    [],
  );
  return entry;
}

// ---------------------------------------------------------------------------------------------
// The edit of a second person's browser

/**
 * A page of the person open on a project, editing the payment sequence as a person does: the label
 * of the first message is selected and typed over. Answers the text the room then holds.
 */
async function editInThePage(t: Run, device: Device, person: Person, id: string): Promise<string> {
  const { page } = device;
  await openByLink(page, t.origin, id);
  await openFile(page, PAYMENT);
  await until(page, "the payment sequence in the code pane", () =>
    (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
      "diagram payment",
    ),
  );
  await page.locator(".code-input").evaluate((area: HTMLTextAreaElement) => {
    const at = area.value.indexOf('"Pay" as checkout');
    if (at < 0) throw new Error("the first message is not in the code");
    area.focus();
    area.setSelectionRange(at + 1, at + 4);
  });
  await page.keyboard.type("Pay now", { delay: 12 });
  const room = await roomHolds(person, id, "the page's edit in the room", (read) =>
    (read.files[PAYMENT] ?? "").includes('"Pay now" as checkout'),
  );
  return room.files[PAYMENT] ?? "";
}

// ---------------------------------------------------------------------------------------------
// Nothing secret in anything printed

/** No token in what the commands printed, nor in the Worker's log; and the pattern is not blind. */
function assertNoTokens(t: Run, cli: Cli, token: string): void {
  assert.equal(tokensIn([`a ${token} b`]).length, 1, "the pattern finds a token when there is one");
  assert.ok(cli.finishedCommands.length > 0, "commands were run");
  assert.deepEqual(tokensIn(cli.printed()), [], "no token in anything a command printed");
  assert.deepEqual(tokensIn([t.worker.output()]), [], "no token in the Worker's log");
  for (const text of [...cli.printed(), t.worker.output()]) {
    assert.equal(text.includes(token), false, "the token is nowhere that was printed or logged");
  }
}

// ---------------------------------------------------------------------------------------------
// The scenarios

export const cliScenarios: Scenario[] = [
  {
    name: "mdg login: the check the terminal prints is the one on the approval page, approving lands on the command line, whoami agrees, the credentials are in the configuration folder, and logout revokes the token",
    async run(t) {
      const person = await t.person("u-cli-login", { name: "Marta Núñez" });
      const cli = Cli.create(t.origin);
      try {
        // Nobody is signed in yet, and the command line says to run login (exit code 3).
        refused(await cli.run(["whoami"]), 3, /cloud\.not-signed-in/);
        assert.equal(existsSync(cli.credentialsFile), false);

        const entry = await signIn(t, cli, person, "Marta Núñez");
        if (process.platform !== "win32") {
          assert.equal(statSync(cli.credentialsFile).mode & 0o777, 0o600, "owner-only file");
        }
        const whoami = ok(await cli.run(["whoami"]));
        assert.equal(whoami.stdout, `Marta Núñez (no handle yet)\nhost: ${t.origin}\n`);

        // The Worker lists the token the command line holds, and it is the only one.
        const listed = await person.api("GET", "/api/tokens");
        const rows = (listed.json()["tokens"] ?? []) as { id: string; name: string }[];
        assert.deepEqual(
          rows.map((row) => row.id),
          [entry.id],
        );
        assert.match(rows[0]?.name ?? "", /^CLI \(\d{4}-\d{2}-\d{2}\)$/);

        // Logout revokes it at the Worker and forgets it here.
        const out = ok(await cli.run(["logout"]));
        assert.ok(
          printsLine(out, `Signed out of ${t.origin}: the token was revoked and forgotten.`),
          describe(out),
        );
        assert.equal(existsSync(cli.credentialsFile), false, "the credentials file is gone");
        assert.deepEqual((await person.api("GET", "/api/tokens")).json(), { tokens: [] });
        assertError(
          await t.ask("/api/session", { headers: bearer(entry.token) }),
          401,
          "token.invalid",
        );
        refused(await cli.run(["whoami"]), 3, /cloud\.not-signed-in/);
        // Signed out twice is no failure.
        const again = ok(await cli.run(["logout"]));
        assert.ok(printsLine(again, `Not signed in to ${t.origin}; nothing to do.`));

        assertNoTokens(t, cli, entry.token);
      } finally {
        await cli.dispose();
      }
    },
  },

  {
    name: "mdg push --create of the purchase template, a page's edit shown by review --base cloud by id, push refused without --force, reported by --check and made with --force, pull into another folder, and a version read back by review and pull",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const person = await t.person("u-cli-sync");
      const cli = Cli.create(t.origin);
      try {
        const entry = await signIn(t, cli, person, "Ana");

        // The folder: what `init --template purchase` makes, and a picture.
        const shop = await makeShop(cli);
        const local = folderOf(shop);
        const sheets = Object.keys(local.files).length;

        // Created: the project is recorded in project.json and the room holds the folder.
        const created = ok(await cli.run(["push", "--create", shop]));
        const id = new RegExp(
          `^Created the cloud project (${PROJECT_ID.source}) \\(Corner shop\\)\\.$`,
          "m",
        ).exec(created.stdout)?.[1];
        assert.ok(id, describe(created));
        assert.match(created.stdout, /^Recorded the cloud project in .*project\.json\.$/m);
        assert.ok(
          printsLine(
            created,
            `Pushed to the cloud project ${id}: ${files(sheets + 1)} written, 1 image or font uploaded.`,
          ),
          describe(created),
        );
        assert.ok(printsLine(created, `Open it at ${t.origin}/p/${id}`), describe(created));
        assert.deepEqual(cloudOf(shop), { host: t.origin, project: id });
        // The folder gained the `cloud` field of project.json and nothing else.
        const recorded = folderOf(shop);
        assert.deepEqual(recorded.binaries, local.binaries);
        assert.deepEqual(
          Object.keys(recorded.files).sort(),
          Object.keys(local.files).sort(),
          "no file was added or removed",
        );
        for (const [path, text] of Object.entries(local.files)) {
          if (path !== "project.json") assert.equal(recorded.files[path], text, path);
        }
        const room = await readRoom(person, id);
        assert.deepEqual({ files: room.files, binaries: room.binaries }, recorded);
        assert.deepEqual(room.collisions, []);
        const same = ok(await cli.run(["push", "--check", shop]));
        assert.ok(
          printsLine(same, `The cloud project ${id} already matches the folder; nothing to push.`),
        );
        // The Worker lists it as the person's own.
        const projects = (await person.api("GET", "/api/projects")).json()["projects"] as {
          id: string;
          name: string;
          role: string;
        }[];
        assert.deepEqual(
          projects.map((p) => [p.id, p.name, p.role]),
          [[id, "Corner shop", "owner"]],
        );

        // Somebody else changes a message's label in the page: the room has a text the folder lacks.
        const device = await t.device({ as: person });
        const edited = await editInThePage(t, device, person, id);
        assert.notEqual(edited, local.files[PAYMENT]);

        // The review compares the cloud with the folder and names the difference by id.
        const review = await cli.run(["review", "--base", "cloud", shop, "--exit-code"]);
        assert.equal(review.code, 1, describe(review));
        assert.equal(review.stderr, "", describe(review));
        assert.match(review.stdout, new RegExp(`^~ ${PAYMENT}$`, "m"), describe(review));
        assert.match(review.stdout, /checkout/, describe(review));
        assert.match(review.stdout, /^1 file changed/m, describe(review));
        const asJson = ok(await cli.run(["review", "--base", "cloud", shop, "--json"]));
        const reviewed = JSON.parse(asJson.stdout) as {
          compared: string;
          files: { path: string; status: string; changes: { id: string }[] }[];
        };
        assert.equal(reviewed.compared, `Compared the cloud project ${id} with the working tree`);
        assert.deepEqual(
          reviewed.files.map((file) => [file.path, file.status]),
          [[PAYMENT, "changed"]],
        );
        assert.ok(reviewed.files[0]?.changes.some((change) => change.id === "checkout"));
        // The review changed nothing, in the cloud or in the folder.
        assert.equal((await readRoom(person, id)).files[PAYMENT], edited);
        assert.deepEqual(folderOf(shop), recorded);

        // Push without --force: the cloud differs, nobody can answer, nothing is overwritten.
        const declined = refused(await cli.run(["push", shop]), 1, /push\.differs/);
        assert.ok(
          printsLine(declined, "The cloud project differs from the folder in 1 path:"),
          describe(declined),
        );
        assert.ok(printsLine(declined, `  ${PAYMENT} differs`), describe(declined));
        assert.ok(printsLine(declined, "By id, what pushing changes in the diagrams:"));
        assert.equal(
          (await readRoom(person, id)).files[PAYMENT],
          edited,
          "nothing was overwritten",
        );

        // --check reports the same and writes nothing; it fails, as a check should.
        const checked = await cli.run(["push", "--check", shop]);
        assert.equal(checked.code, 1, describe(checked));
        assert.ok(
          printsLine(checked, "1 path differs; pushing would change the cloud project."),
          describe(checked),
        );
        assert.equal((await readRoom(person, id)).files[PAYMENT], edited, "--check wrote nothing");

        // --force overwrites: the room, and the page that is open on it, have the folder's text.
        const forced = ok(await cli.run(["push", "--force", shop]));
        assert.ok(
          printsLine(forced, `Pushed to the cloud project ${id}: 1 file written.`),
          describe(forced),
        );
        assert.deepEqual(
          (await readRoom(person, id)).files[PAYMENT],
          local.files[PAYMENT],
          "the folder's text is the cloud's",
        );
        await codeIs(device.page, local.files[PAYMENT] ?? "", "the page to show the pushed text");
        const settled = ok(await cli.run(["push", "--check", shop]));
        assert.ok(
          printsLine(
            settled,
            `The cloud project ${id} already matches the folder; nothing to push.`,
          ),
        );

        // Pull into a folder that does not exist: the same files, and project.json says where from.
        const copy = join(cli.work, "shop copy");
        const pulled = ok(await cli.run(["pull", id, copy]));
        assert.ok(
          printsLine(
            pulled,
            `Pulled the latest files of the cloud project ${id} into shop copy: ${sheets + 1} written, 0 already identical, 0 kept.`,
          ),
          describe(pulled),
        );
        assert.deepEqual(folderOf(copy), folderOf(shop));
        assert.deepEqual(cloudOf(copy), { host: t.origin, project: id });
        const room2 = await readRoom(person, id);
        assert.deepEqual({ files: room2.files, binaries: room2.binaries }, folderOf(copy));
        // The folder knows its project: pulling again, from inside, changes nothing.
        const nothing = ok(await cli.run(["pull"], { cwd: copy }));
        assert.match(
          nothing.stdout,
          /0 written, \d+ already identical, 0 kept\./,
          describe(nothing),
        );

        // A file changed in the folder is kept, and said so, unless --force.
        const mine = `// my own note\n${folderOf(copy).files[PAYMENT]}`;
        writeFileSync(join(copy, ...PAYMENT.split("/")), mine);
        const kept = await cli.run(["pull"], { cwd: copy });
        assert.equal(kept.code, 1, describe(kept));
        assert.equal(kept.stderr, "", describe(kept));
        assert.ok(
          printsLine(kept, `  kept ${PAYMENT} (it differs from the cloud)`),
          describe(kept),
        );
        assert.ok(printsLine(kept, "Pass --force to overwrite the files that differ."));
        assert.equal(folderOf(copy).files[PAYMENT], mine, "the local change is still there");
        const restored = ok(await cli.run(["pull", "--force"], { cwd: copy }));
        assert.ok(printsLine(restored, `  wrote ${PAYMENT}`), describe(restored));
        assert.deepEqual(folderOf(copy), folderOf(shop));

        // A version is the files at a moment (the page makes one with a click; here, its route).
        // The project moves on, and the command line reads the version back: review and pull alike.
        const pushed = folderOf(shop);
        const made = await person.api("POST", `/api/projects/${id}/versions`, {
          label: "as pushed",
        });
        assert.equal(made.status, 201, made.text);
        const number = Number(made.json()["number"]);
        assert.ok(Number.isInteger(number) && number >= 1, made.text);
        const later = (pushed.files[PAYMENT] ?? "").replace(
          '"Pay" as checkout',
          '"Pay later" as checkout',
        );
        assert.notEqual(later, pushed.files[PAYMENT]);
        writeFileSync(join(shop, ...PAYMENT.split("/")), later);
        ok(await cli.run(["push", "--force", shop]));
        assert.equal((await readRoom(person, id)).files[PAYMENT], later);

        const since = await cli.run(["review", "--base", `cloud:${number}`, shop, "--exit-code"]);
        assert.equal(since.code, 1, describe(since));
        assert.equal(since.stderr, "", describe(since));
        assert.match(
          since.stdout,
          /relation checkout .*label "Pay" → "Pay later"/,
          describe(since),
        );
        const unchanged = ok(await cli.run(["review", "--base", "cloud", shop, "--exit-code"]));
        assert.equal(unchanged.stdout.split("\n")[0], "No changes.", describe(unchanged));

        const old = join(cli.work, "shop as pushed");
        const fromVersion = ok(await cli.run(["pull", "--version", String(number), id, old]));
        assert.ok(
          printsLine(
            fromVersion,
            `Pulled version ${number} of the cloud project ${id} into shop as pushed: ${sheets + 1} written, 0 already identical, 0 kept.`,
          ),
          describe(fromVersion),
        );
        assert.deepEqual(folderOf(old), pushed, "the files of the version, images included");
        assert.deepEqual(cloudOf(old), { host: t.origin, project: id });
        refused(
          await cli.run(["review", "--base", "cloud:99", shop]),
          1,
          /version\.not-found.*no version 99/,
        );
        refused(await cli.run(["pull", "--version", "99", id, old]), 1, /version\.not-found/);

        assertNoTokens(t, cli, entry.token);
        assert.deepEqual(
          device.seen.requests.filter((address) => address.includes(entry.token)),
          [],
        );
      } finally {
        await cli.dispose();
      }
    },
  },

  {
    name: "mdg publish --handle … --slug …: the address it prints is served under /_published/ with the exact headers, a folder that differs is not published without --force, --unpublish removes the page, and projects --json lists the project as the person's",
    async run(t) {
      const person = await t.person("u-cli-publish");
      const cli = Cli.create(t.origin);
      const handle = "cli-publish";
      const slug = "purchase";
      try {
        const entry = await signIn(t, cli, person, "Ana");
        const shop = await makeShop(cli);
        const created = ok(await cli.run(["push", "--create", shop]));
        const id = new RegExp(`Created the cloud project (${PROJECT_ID.source}) `).exec(
          created.stdout,
        )?.[1];
        assert.ok(id, describe(created));

        // No handle yet and nobody to ask: it is refused before anything is built or published.
        refused(await cli.run(["publish", "--slug", slug, shop]), 1, /handle\.required/);
        assertError(await t.ask(`/_published/${handle}/${slug}/`), 404, "not-found");

        // A token may set the handle: the first publication does, and the address is the last line.
        const address = `${t.origin}/_published/${handle}/${slug}/`;
        const published = ok(await cli.run(["publish", "--handle", handle, "--slug", slug, shop]));
        assert.ok(printsLine(published, `Handle set: ${handle}`), describe(published));
        assert.match(published.stdout, /^Published \d+ diagrams?, \d+ stor(?:y|ies).*\)\.$/m);
        assert.equal(published.stdout.trimEnd().split("\n").at(-1), address, describe(published));
        const page = await t.ask(`/_published/${handle}/${slug}/`);
        assert.equal(page.status, 200, page.text.slice(0, 200));
        for (const [name, value] of Object.entries(PAGE_HEADERS)) {
          assert.equal(page.headers.get(name), value, name);
        }
        assert.equal(page.headers.get("set-cookie"), null);
        assert.match(page.text, /^<!doctype html>/i);
        assert.ok(page.text.includes("Purchase"), "the catalog of the project's manifest");
        const listed = (await person.api("GET", `/api/projects/${id}/publish`)).json() as {
          handle: string;
          publications: { slug: string; url: string }[];
        };
        assert.equal(listed.handle, handle);
        assert.deepEqual(
          listed.publications.map((p) => [p.slug, p.url]),
          [[slug, address]],
        );
        assert.equal(ok(await cli.run(["whoami"])).stdout, `Ana (@${handle})\nhost: ${t.origin}\n`);

        // A folder that differs from the cloud is not published without being pushed, and a push
        // that nobody can answer for is refused: the page stays as it was.
        const text = readFileSync(join(shop, ...PAYMENT.split("/")), "utf8");
        writeFileSync(join(shop, ...PAYMENT.split("/")), `${text}\n// changed here\n`);
        refused(await cli.run(["publish", "--slug", slug, shop]), 1, /push\.differs/);
        assert.equal((await t.ask(`/_published/${handle}/${slug}/`)).text, page.text);
        assert.equal((await readRoom(person, id)).files[PAYMENT], text, "nothing was pushed");
        const forced = ok(await cli.run(["publish", "--force", "--slug", slug, shop]));
        assert.equal(forced.stdout.trimEnd().split("\n").at(-1), address, describe(forced));
        assert.equal((await readRoom(person, id)).files[PAYMENT], `${text}\n// changed here\n`);

        // projects --json: one object, the project is the person's own.
        const asJson = ok(await cli.run(["projects", "--json"]));
        const parsed = JSON.parse(asJson.stdout) as {
          host: string;
          projects: {
            id: string;
            name: string;
            description: string;
            role: string;
            updated_at: string;
          }[];
        };
        assert.equal(parsed.host, t.origin);
        assert.equal(parsed.projects.length, 1);
        assert.equal(parsed.projects[0]?.id, id);
        assert.equal(parsed.projects[0]?.name, "Corner shop");
        assert.equal(parsed.projects[0]?.role, "owner");
        assert.match(parsed.projects[0]?.updated_at ?? "", /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
        const table = ok(await cli.run(["projects"]));
        assert.match(table.stdout, /^ID +NAME +ROLE +LAST CHANGE$/m, describe(table));
        assert.match(
          table.stdout,
          new RegExp(`^${id} +Corner shop +owner +\\d{4}-`, "m"),
          describe(table),
        );

        // Unpublished: the address answers 404, and a second time there is nothing to remove.
        const gone = ok(await cli.run(["publish", "--unpublish", "--slug", slug, shop]));
        assert.ok(printsLine(gone, `Unpublished ${slug}.`), describe(gone));
        assertError(await t.ask(`/_published/${handle}/${slug}/`), 404, "not-found");
        refused(
          await cli.run(["publish", "--unpublish", "--slug", slug, shop]),
          1,
          /publish\.not-published/,
        );

        assertNoTokens(t, cli, entry.token);
      } finally {
        await cli.dispose();
      }
    },
  },
];

/**
 * Sharing through the real Worker, D1 and room, driven from the page: the share dialog as the owner
 * and as somebody who may only look, invitations made in the dialog and accepted in other browsers,
 * the invitation that waits for a sign-in, the limit of members, and what each kind of person is
 * observed to be able to do over plain HTTP after the owner changes the link. What the page showed is
 * checked against what the Worker holds, read through calls from Node.
 */
import assert from "node:assert/strict";
import type { Locator } from "playwright-core";
import type { Scenario } from "./scenario.js";
import {
  code,
  connected,
  listProjects,
  makeProject,
  noDialog,
  openByLink,
  openSwitcher,
  roomHolds,
  statusLine,
  studioState,
  switcherNames,
  textHas,
  typeAtEnd,
} from "./cloud.js";
import {
  EDITOR,
  NOTHING,
  VIEWER,
  accept,
  addMember,
  inviteInDialog,
  invite,
  levelRadio,
  membersOf,
  observe,
  openShare,
  pendingInvitations,
  pendingRows,
  rowsAre,
  peopleRows,
  projectLink,
  readOnly,
  setLinkLevel,
  settled,
  showcase,
  statusHas,
  tokenOf,
  viewing,
  viewingIs,
  type LinkLevel,
} from "./sharing.js";
import { assertError, ask, ready, sessionCookie, until } from "./support.js";

/** The browser's note that a request answered 404, 403 or 413: what a page logs for a refusal it shows in words. */
const NOT_FOUND_LOGGED = /status of 404/;
const QUOTA_LOGGED = /status of 413/;

/** What the dialog's status line says. */
const statusOf = (dialog: Locator): Promise<string> => dialog.locator(".share-status").innerText();

export const sharingScenarios: Scenario[] = [
  {
    name: "sharing: the owner changes who the link admits in the share dialog, and what nobody signed in, a stranger and the members can then do is observed over HTTP: private, view, edit, and back",
    signedIn: "u-ana-levels",
    async run(t) {
      const { origin, page, context } = t;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const sam = await t.person("u-sam-levels", { name: "Sam" });
      const vic = await t.person("u-vic-levels", { name: "Vic" });
      const eda = await t.person("u-eda-levels", { name: "Eda" });
      const project = await makeProject(t.me, "Levels", { template: "flow" });
      await addMember(t.me, project.id, vic, "viewer");
      await addMember(t.me, project.id, eda, "editor");
      await openByLink(page, origin, project.id);
      const dialog = await openShare(page);
      await settled(dialog);

      // The link the dialog shows and copies is the project's, `<origin>/p/<id>`, whatever the level.
      const link = projectLink(origin, project.id);
      assert.equal(await dialog.locator("input.share-link").first().inputValue(), link);
      await dialog.getByRole("button", { name: "Copy the link to the project" }).click();
      await until(
        page,
        "the link to be copied",
        () =>
          document.querySelector(".share-status")?.textContent ===
          "The link to the project was copied.",
      );
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);

      // What each person is observed to be able to do, for each level the link can have.
      const matrix: Record<LinkLevel, Record<string, unknown>> = {
        private: { nobody: NOTHING, sam: NOTHING, vic: VIEWER, eda: EDITOR },
        view: { nobody: VIEWER, sam: VIEWER, vic: VIEWER, eda: EDITOR },
        edit: {
          nobody: { ...VIEWER, write: 401, refusal: "auth.required" },
          sam: EDITOR,
          vic: EDITOR,
          eda: EDITOR,
        },
      };
      const words: Record<LinkLevel, string> = {
        private: "Only the people listed can open the project now.",
        view: "Anyone with the link can view the project now.",
        edit: "Anyone signed in with the link can edit the project now.",
      };
      const observed = async (level: LinkLevel) => {
        assert.deepEqual(
          {
            nobody: await observe(origin, project.id, undefined),
            sam: await observe(origin, project.id, sam),
            vic: await observe(origin, project.id, vic),
            eda: await observe(origin, project.id, eda),
          },
          matrix[level],
          `what each person can do at ${level}`,
        );
      };
      assert.equal(
        await levelRadio(dialog, "private").isChecked(),
        true,
        "a new project is private",
      );
      await observed("private");
      for (const level of ["view", "edit", "view", "private", "edit", "private"] as const) {
        await levelRadio(dialog, level).check();
        await settled(dialog);
        assert.equal(await statusOf(dialog), words[level]);
        assert.equal(await levelRadio(dialog, level).isChecked(), true);
        const held = await t.me.api("GET", `/api/projects/${project.id}/sharing`);
        assert.equal(held.json()["linkAccess"], level, "the Worker holds the level");
        await observed(level);
      }

      // The level is the project's, not the dialog's: another dialog finds it as it was left.
      await levelRadio(dialog, "view").check();
      await settled(dialog);
      await page.keyboard.press("Escape");
      await noDialog(page);
      const again = await openShare(page);
      await settled(again);
      assert.equal(await levelRadio(again, "view").isChecked(), true);
      assert.deepEqual(
        (await t.me.api("GET", `/api/projects/${project.id}`)).json()["role"],
        "owner",
      );
    },
  },

  {
    name: "sharing: the owner invites in the dialog and copies the link, a second browser opens it signed in and is accepted: the project opens with the role, the person edits and the owner sees it live, the invitation is spent and the dialog lists the person",
    signedIn: "u-ana-invite",
    async run(t) {
      const { origin, page, context } = t;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const bob = await t.person("u-bob-invite", { name: "Bob" });
      const project = await makeProject(t.me, "Invited", { template: "flow" });
      await openByLink(page, origin, project.id);
      const file = (await studioState(page)).open;

      // The owner invites an address that is not Bob's: the link is the proof, whatever the email.
      const dialog = await openShare(page);
      await settled(dialog);
      const link = await inviteInDialog(dialog, "guest@example.org", "editor");
      assert.match(link, new RegExp(`^${origin}/p/${project.id}\\?invite=[0-9a-f]{32}$`));
      assert.match(
        await statusOf(dialog),
        /Invitation created for guest@example\.org\. No email was sent/,
      );
      await dialog
        .locator(".share-reveal")
        .getByRole("button", { name: /Copy the link of the invitation for guest@example.org/ })
        .click();
      await until(
        page,
        "the invitation link to be copied",
        () =>
          document.querySelector(".share-status")?.textContent ===
          "The invitation link was copied.",
      );
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);
      // It waits in the list the owner reads, with its link and its day of expiry.
      const waiting = await pendingInvitations(t.me, project.id);
      assert.deepEqual(
        waiting.map((row) => [row.email, row.role, row.link]),
        [["guest@example.org", "editor", link]],
      );
      await page.keyboard.press("Escape");
      await noDialog(page);
      const reopened = await openShare(page);
      await settled(reopened);
      assert.equal(await pendingRows(reopened).count(), 1);
      assert.match(
        await pendingRows(reopened).innerText(),
        /guest@example\.org[\s\S]*Can edit[\s\S]*Expires/,
      );
      assert.equal(await pendingRows(reopened).locator("input").inputValue(), link);
      await page.keyboard.press("Escape");
      await noDialog(page);

      // Bob opens it signed in, in a browser of his own.
      const device = await t.device({ as: bob });
      const guest = device.page;
      await guest.goto(link);
      await ready(guest);
      await connected(guest);
      assert.equal(
        new URL(guest.url()).searchParams.get("invite"),
        null,
        "the spent invitation leaves the address",
      );
      assert.equal(guest.url(), `${origin}/?project=${project.id}`);
      await statusHas(guest, "Invitation accepted: you can edit Invited.");
      assert.equal(await viewing(guest), null);
      assert.equal(await readOnly(guest), false);
      assert.equal((await studioState(guest)).bound, true);
      assert.equal((await bob.api("GET", `/api/projects/${project.id}`)).json()["role"], "editor");

      // His edit is in the room and on the owner's page, as it is made.
      await typeAtEnd(guest, "\n// bob accepted and edited");
      await roomHolds(t.me, project.id, "Bob's edit", (read) =>
        (read.files[file] ?? "").endsWith("// bob accepted and edited"),
      );
      await textHas(page, file, "// bob accepted and edited");

      // The invitation is spent, and the dialog lists Bob with his role instead.
      assert.deepEqual(await pendingInvitations(t.me, project.id), []);
      assertError(
        await accept(await t.person("u-cy-invite"), tokenOf(link)),
        404,
        "invite.invalid",
      );
      const people = await openShare(page);
      await settled(people);
      assert.equal(await peopleRows(people).count(), 1);
      assert.match(await peopleRows(people).innerText(), /Bob/);
      assert.equal(
        await people.getByRole("combobox", { name: "Role of Bob" }).inputValue(),
        "editor",
      );
      assert.equal(await pendingRows(people).count(), 0);
      assert.match(await people.innerText(), /No pending invitations\./);
      assert.deepEqual(
        (await membersOf(t.me, project.id)).map((member) => [member.sub, member.role]),
        [["u-bob-invite", "editor"]],
      );
    },
  },

  {
    name: "sharing: somebody who opens an invitation link while signed out keeps the address and is told to sign in; once the session is there the invitation applies and the project opens with the invited role",
    signedIn: "u-ana-late",
    allowedErrors: [NOT_FOUND_LOGGED],
    async run(t) {
      const { origin } = t;
      const dee = await t.person("u-dee-late", { name: "Dee" });
      const project = await makeProject(t.me, "Waiting", { template: "flow" });
      const invitation = await invite(t.me, project.id, "dee.late@example.org", "editor");
      const token = tokenOf(invitation.link);

      const device = await t.device({ as: null });
      const { page, context } = device;
      await page.goto(invitation.link);
      await page.waitForFunction(() => "meltemiPlayground" in window, undefined, {
        timeout: 30_000,
      });
      await statusHas(page, "Sign in to accept the invitation to this project.");
      // The address keeps the project and the invitation, and the link to sign in comes back to it.
      assert.equal(page.url(), `${origin}/?project=${project.id}&invite=${token}`);
      const signIn = await page.locator(".topbar a.sign-in").getAttribute("href");
      assert.ok(signIn, "there is a way to sign in");
      const back = new URL(new URL(signIn).searchParams.get("return_to") ?? "");
      assert.equal(back.origin + back.pathname, `${origin}/`);
      assert.equal(back.searchParams.get("project"), project.id);
      assert.equal(back.searchParams.get("invite"), token);
      assert.equal(await viewing(page), null);
      assert.equal(await readOnly(page), false, "the anonymous project of this browser");
      assert.deepEqual(
        (await pendingInvitations(t.me, project.id)).map((row) => row.email),
        ["dee.late@example.org"],
        "nothing was accepted by looking",
      );

      // The person signs in (the identity service sets the cookie and sends them back to the address).
      await context.addCookies([sessionCookie(dee.token)]);
      await page.reload();
      await ready(page);
      await connected(page);
      await statusHas(page, "Invitation accepted: you can edit Waiting.");
      assert.equal(page.url(), `${origin}/?project=${project.id}`);
      assert.equal(await readOnly(page), false);
      assert.equal((await studioState(page)).bound, true);
      assert.deepEqual(await pendingInvitations(t.me, project.id), []);
      assert.equal((await dee.api("GET", `/api/projects/${project.id}`)).json()["role"], "editor");
    },
  },

  {
    name: "sharing: an invitation that is not valid says so, a person signed in keeps their own project, and a link whose invitation was already spent by the signed-in email still opens the project",
    signedIn: "u-ana-dead",
    allowedErrors: [NOT_FOUND_LOGGED],
    async run(t) {
      const { origin } = t;
      const bob = await t.person("u-bob-dead", { name: "Bob" });
      const project = await makeProject(t.me, "Dead link", { template: "flow" });

      // A token nobody made: not valid, the project is not Bob's to see, and his own project opens.
      const device = await t.device({ as: bob });
      const { page } = device;
      await page.goto(`${origin}/p/${project.id}?invite=${"0".repeat(32)}`);
      await page.waitForFunction(() => "meltemiPlayground" in window, undefined, {
        timeout: 30_000,
      });
      await statusHas(page, "This invitation is not valid.");
      assert.match(await statusLine(page), /not found/);
      assert.equal(await viewing(page), null);
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.equal((await studioState(page)).bound, false);
      assert.match(await code(page), /diagram overview: flow/);
      assert.equal((await bob.api("GET", `/api/projects/${project.id}`)).status, 404);

      // A revoked invitation is the same: it cannot be accepted any more.
      const revoked = await invite(t.me, project.id, "revoked@example.org", "editor");
      assert.equal(
        (await t.me.api("DELETE", `/api/projects/${project.id}/invitations/${revoked.id}`)).status,
        204,
      );
      assertError(await accept(bob, tokenOf(revoked.link)), 404, "invite.invalid");
      const second = await t.device({ as: bob });
      await second.page.goto(revoked.link);
      await second.page.waitForFunction(() => "meltemiPlayground" in window, undefined, {
        timeout: 30_000,
      });
      await statusHas(second.page, "This invitation is not valid.");
      assert.equal((await bob.api("GET", `/api/projects/${project.id}`)).status, 404);

      // An invitation for the address the person signs in with is turned into a membership by the
      // session itself, before the page asks to accept it: the link they were sent must still open it.
      const email = "u-eve-dead@example.com";
      const eve = await t.person("u-eve-dead", { name: "Eve", email });
      const mailed = await invite(t.me, project.id, email, "editor");
      const third = await t.device({ as: eve });
      await third.page.goto(mailed.link);
      await ready(third.page);
      await connected(third.page);
      assert.equal(third.page.url(), `${origin}/?project=${project.id}`);
      assert.equal(
        await readOnly(third.page),
        false,
        "Eve edits: the invitation made her an editor",
      );
      await statusHas(third.page, "Invitation accepted: you can edit Dead link.");
      assert.doesNotMatch(await statusLine(third.page), /not valid/);
      assert.equal((await eve.api("GET", `/api/projects/${project.id}`)).json()["role"], "editor");
    },
  },

  {
    name: "sharing: invitations resolve at sign-in for the email the provider verified and for no other: an unverified address stays pending, a verified one becomes a member of every project that invited it",
    signedIn: "u-ana-session",
    async run(t) {
      const { origin } = t;
      const first = await makeProject(t.me, "First", { template: "flow" });
      const second = await makeProject(t.me, "Second", { template: "flow" });
      const email = "carla.session@example.org";
      await invite(t.me, first.id, email, "editor");
      await invite(t.me, second.id, "Carla.Session@Example.org", "viewer");

      // Somebody whose session carries that address, but not verified by the provider, resolves nothing.
      const impostor = await t.person("u-mallory-session", {
        name: "Mallory",
        email,
        emailVerified: false,
      });
      assert.equal((await impostor.api("GET", "/api/session")).status, 200);
      assert.equal((await observe(origin, first.id, impostor)).project, 404);
      assert.deepEqual(
        (await pendingInvitations(t.me, first.id)).map((row) => row.email),
        [email],
        "the invitation is still pending",
      );

      // The person it was for signs in: the session resolves both invitations before it answers.
      const carla = await t.person("u-carla-session", { name: "Carla", email });
      const session = await carla.api("GET", "/api/session");
      assert.equal(session.status, 200);
      assert.deepEqual((session.json()["user"] as { sub: string; handle: unknown }).handle, null);
      assert.deepEqual(await pendingInvitations(t.me, first.id), []);
      assert.deepEqual(await pendingInvitations(t.me, second.id), []);
      assert.deepEqual(await observe(origin, first.id, carla), EDITOR);
      assert.deepEqual(await observe(origin, second.id, carla), VIEWER);
      assert.deepEqual(
        (await membersOf(t.me, first.id)).map((member) => [member.sub, member.email, member.role]),
        [["u-carla-session", email, "editor"]],
      );
      // Her projects list shows them, and the switcher's panel says what she is to each.
      const listed = await listProjects(carla);
      assert.deepEqual(listed.map((row) => [row.name, row.role]).sort(), [
        ["First", "editor"],
        ["Second", "viewer"],
      ]);
      const device = await t.device({ as: carla });
      await device.page.goto(`${origin}/`);
      await ready(device.page);
      const panel = await openSwitcher(device.page);
      assert.deepEqual((await switcherNames(device.page)).sort(), ["First", "Second"]);
      const rows = (await panel.locator(".project-row").allInnerTexts()).join("\n");
      assert.match(rows, /Shared with you: you can edit/);
      assert.match(rows, /Shared with you: view only/);
      assert.equal(await panel.locator('button[data-action="delete"]').count(), 0);
      assert.equal(await panel.locator('button[data-action="rename"]').count(), 0);
    },
  },

  {
    name: "sharing: in the dialog the owner invites (an invalid address is refused and nothing is sent), changes a role, removes a person after a confirmation and revokes invitations, and the Worker holds each change",
    signedIn: "u-ana-manage",
    async run(t) {
      const { origin, page } = t;
      const eve = await t.person("u-eve-manage", { name: "Eve" });
      const fay = await t.person("u-fay-manage", { name: "Fay" });
      const gus = await t.person("u-gus-manage", { name: "Gus" });
      const project = await makeProject(t.me, "Managed", { template: "flow" });
      await openByLink(page, origin, project.id);
      let dialog = await openShare(page);
      await settled(dialog);

      // An address that is not one is refused in the dialog, and nothing reaches the Worker.
      const email = dialog.getByLabel("Email address");
      await email.fill("ana@");
      await dialog.getByRole("button", { name: "Invite", exact: true }).click();
      await until(
        page,
        "the refusal",
        () =>
          document.querySelector(".share-invite .field-problem")?.textContent ===
          "That is not an email address.",
      );
      assert.equal(await email.getAttribute("aria-invalid"), "true");
      assert.deepEqual(await pendingInvitations(t.me, project.id), []);
      await email.fill("");
      await dialog.getByRole("button", { name: "Invite", exact: true }).click();
      await until(
        page,
        "the refusal of nothing",
        () =>
          document.querySelector(".share-invite .field-problem")?.textContent ===
          "Enter the person's email address.",
      );
      assert.deepEqual(await pendingInvitations(t.me, project.id), []);

      // Two invitations, with the roles chosen; the same address again changes the role of the one that waits.
      const toEve = await inviteInDialog(dialog, "eve.manage@example.org", "viewer");
      const toFay = await inviteInDialog(dialog, "fay.manage@example.org", "editor");
      assert.deepEqual(
        (await pendingInvitations(t.me, project.id)).map((row) => [row.email, row.role]),
        [
          ["eve.manage@example.org", "viewer"],
          ["fay.manage@example.org", "editor"],
        ],
      );
      await inviteInDialog(dialog, "Eve.Manage@example.org", "editor");
      await until(
        page,
        "the same invitation changed",
        () =>
          document
            .querySelector(".share-status")
            ?.textContent?.includes("already had an invitation") ?? false,
      );
      assert.deepEqual(
        (await pendingInvitations(t.me, project.id)).map((row) => [row.email, row.role]),
        [
          ["eve.manage@example.org", "editor"],
          ["fay.manage@example.org", "editor"],
        ],
      );
      assert.equal((await accept(eve, tokenOf(toEve))).status, 200);
      assert.equal((await accept(fay, tokenOf(toFay))).status, 200);

      // Reopened, the dialog lists them as people, with their emails, and the count.
      await page.keyboard.press("Escape");
      await noDialog(page);
      dialog = await openShare(page);
      await settled(dialog);
      assert.equal(await peopleRows(dialog).count(), 2);
      assert.match(await dialog.innerText(), /2 of 50 people and invitations/);
      assert.match(
        await peopleRows(dialog).nth(0).innerText(),
        /Eve[\s\S]*u-eve-manage@example\.com/,
      );
      assert.equal(
        await dialog.getByRole("combobox", { name: "Role of Eve" }).inputValue(),
        "editor",
      );

      // A role changed in the dialog is the Worker's, and Eve is observed to have it.
      await dialog.getByRole("combobox", { name: "Role of Eve" }).selectOption("viewer");
      await settled(dialog);
      assert.match(await statusOf(dialog), /Changed the role of Eve to “Can view”\./);
      assert.deepEqual(await observe(origin, project.id, eve), VIEWER);
      assert.deepEqual(await observe(origin, project.id, fay), EDITOR);

      // Removing asks first: cancelled, Fay stays; confirmed, she is gone and the project is not hers.
      await dialog.getByRole("button", { name: "Remove Fay" }).click();
      const sure = page.getByRole("dialog", { name: "Remove this person?" });
      await sure.waitFor();
      await sure.getByRole("button", { name: "Cancel" }).click();
      await sure.waitFor({ state: "detached" });
      assert.deepEqual(await observe(origin, project.id, fay), EDITOR);
      await dialog.getByRole("button", { name: "Remove Fay" }).click();
      await sure.waitFor();
      await sure.getByRole("button", { name: "Remove", exact: true }).click();
      await sure.waitFor({ state: "detached" });
      await settled(dialog);
      await rowsAre(peopleRows(dialog), 1);
      assert.deepEqual(await observe(origin, project.id, fay), NOTHING);
      assert.deepEqual(await observe(origin, project.id, eve), VIEWER, "only Fay went");

      // An invitation revoked from the list that shows it cannot be accepted any more.
      const toGus = await inviteInDialog(dialog, "gus.manage@example.org", "viewer");
      await dialog
        .locator(".share-reveal")
        .getByRole("button", { name: /Revoke the invitation for gus.manage@example.org/ })
        .click();
      await settled(dialog);
      assert.equal(await dialog.locator(".share-reveal").isVisible(), false);
      assertError(await accept(gus, tokenOf(toGus)), 404, "invite.invalid");
      // ...and so is one revoked from the list of the pending ones, after the dialog is opened again.
      const toGus2 = await inviteInDialog(dialog, "gus.manage@example.org", "viewer");
      await page.keyboard.press("Escape");
      await noDialog(page);
      dialog = await openShare(page);
      await settled(dialog);
      assert.equal(await pendingRows(dialog).count(), 1);
      await pendingRows(dialog)
        .getByRole("button", { name: /Revoke the invitation for gus.manage@example.org/ })
        .click();
      await settled(dialog);
      await rowsAre(pendingRows(dialog), 0);
      assertError(await accept(gus, tokenOf(toGus2)), 404, "invite.invalid");
      assert.deepEqual(await pendingInvitations(t.me, project.id), []);
      assert.deepEqual(await observe(origin, project.id, gus), NOTHING);
    },
  },

  {
    name: "sharing: a member's dialog shows the link, their role, the people by name and Leave, and a link-only viewer's the link and their role, neither ever an invitation, an email or a control that changes the level, and the Worker refuses them the invitations; Leave asks first and lets go of the project",
    signedIn: "u-ana-viewer-dialog",
    async run(t) {
      const { origin } = t;
      const cy = await t.person("u-cy-viewer-dialog", { name: "Cy" });
      const dot = await t.person("u-dot-viewer-dialog", { name: "Dot" });
      const ed = await t.person("u-ed-viewer-dialog", { name: "Ed" });
      // A private project with two members and an invitation that waits, and one open to view by its link.
      const private_ = await makeProject(t.me, "Members only", { template: "flow" });
      await addMember(t.me, private_.id, cy, "editor");
      await addMember(t.me, private_.id, ed, "viewer");
      const secret = await invite(t.me, private_.id, "secret.waiting@example.org", "editor");
      const open = await makeProject(t.me, "Open to look", { template: "flow" });
      await setLinkLevel(t.me, open.id, "view");
      await invite(t.me, open.id, "other.waiting@example.org", "editor");

      // The member: link, role, people by name, Leave.
      const member = await t.device({ as: cy });
      const page = member.page;
      await openByLink(page, origin, private_.id);
      const dialog = await openShare(page);
      await settled(dialog);
      const text = await dialog.innerText();
      assert.match(text, /You can edit this project\./);
      assert.equal(
        await dialog.locator("input.share-link").first().inputValue(),
        projectLink(origin, private_.id),
      );
      assert.equal(await peopleRows(dialog).count(), 2, "the members, by name");
      assert.match(
        await peopleRows(dialog)
          .allInnerTexts()
          .then((all) => all.join("|")),
        /Cy[\s\S]*\(you\)[\s\S]*\|Ed/,
      );
      assert.equal(await dialog.getByRole("radio").count(), 0, "no control changes the level");
      assert.equal(await dialog.getByRole("combobox").count(), 0, "no role to change");
      assert.equal(await dialog.getByLabel("Email address").isVisible(), false);
      assert.equal(
        await dialog.getByRole("button", { name: "Invite", exact: true }).isVisible(),
        false,
      );
      assert.equal(await dialog.getByRole("button", { name: "Publish…" }).isVisible(), false);
      assert.equal(await dialog.getByRole("button", { name: /^Remove / }).count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "Leave" }).isVisible(), true);
      assert.equal(await pendingRows(dialog).count(), 0);
      // Nothing of an invitation, or of anybody's email, is in the page; and none was asked for.
      const everything = await page.content();
      for (const secretThing of [secret.link, tokenOf(secret.link), "secret.waiting", "@example"]) {
        assert.ok(!everything.includes(secretThing), `the page does not hold ${secretThing}`);
        assert.ok(!text.includes(secretThing), `the dialog does not show ${secretThing}`);
      }
      assert.deepEqual(
        member.seen.requests.filter((address) => /\/invitations/.test(address)),
        [],
        "the invitations were never asked for",
      );
      // The Worker refuses them as well, and answers a member only what a member may see.
      assertError(
        await cy.api("GET", `/api/projects/${private_.id}/invitations`),
        403,
        "access.denied",
      );
      const seen = await cy.api("GET", `/api/projects/${private_.id}/sharing`);
      assert.deepEqual(Object.keys(seen.json()).sort(), ["linkAccess", "members", "role"]);
      for (const row of seen.json()["members"] as Record<string, unknown>[]) {
        assert.deepEqual(Object.keys(row).sort(), ["name", "picture", "role", "sub"], "no email");
      }
      assertError(
        await cy.api("PATCH", `/api/projects/${private_.id}/sharing`, { linkAccess: "edit" }),
        403,
        "access.denied",
      );

      // Leave asks first; then the project is not Cy's, and the page lets go of it.
      await dialog.getByRole("button", { name: "Leave" }).click();
      const sure = page.getByRole("dialog", { name: "Leave the project?" });
      await sure.waitFor();
      await sure.getByRole("button", { name: "Cancel" }).click();
      await sure.waitFor({ state: "detached" });
      assert.deepEqual(await observe(origin, private_.id, cy), EDITOR, "still a member");
      await dialog.getByRole("button", { name: "Leave" }).click();
      await sure.waitFor();
      await sure.getByRole("button", { name: "Leave the project" }).click();
      await dialog.waitFor({ state: "detached" });
      assert.deepEqual(await observe(origin, private_.id, cy), NOTHING);
      assert.deepEqual(await observe(origin, private_.id, ed), VIEWER, "only Cy went");
      await until(
        page,
        "the address to stop naming the project",
        () => !location.search.includes("project="),
      );
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.deepEqual(
        (await listProjects(cy)).map((row) => row.name),
        [],
      );

      // The viewer by the link alone: the link and the role, no one else.
      const looker = await t.device({ as: dot });
      const lookPage = looker.page;
      await openByLink(lookPage, origin, open.id);
      assert.equal(await viewing(lookPage), "live");
      const lookDialog = await openShare(lookPage);
      await settled(lookDialog);
      assert.match(await lookDialog.innerText(), /You can view this project but not change it\./);
      assert.equal(
        await lookDialog.locator("input.share-link").first().inputValue(),
        projectLink(origin, open.id),
      );
      assert.equal(await peopleRows(lookDialog).count(), 0);
      assert.equal(await lookDialog.getByRole("radio").count(), 0);
      assert.equal(await lookDialog.getByLabel("Email address").isVisible(), false);
      assert.equal(await lookDialog.getByRole("button", { name: "Leave" }).isVisible(), false);
      assert.equal(await lookDialog.getByRole("button", { name: "Publish…" }).isVisible(), false);
      assert.ok(!(await lookPage.content()).includes("other.waiting"));
      assert.deepEqual(
        looker.seen.requests.filter((address) => /\/(invitations|members)/.test(address)),
        [],
      );
      assert.deepEqual((await dot.api("GET", `/api/projects/${open.id}/sharing`)).json(), {
        linkAccess: "view",
        role: "viewer",
      });
      assertError(
        await dot.api("GET", `/api/projects/${open.id}/invitations`),
        403,
        "access.denied",
      );
      assertError(await dot.api("DELETE", `/api/projects/${open.id}/members/me`), 404, "not-found");
      // Nobody signed in is refused the same, with nothing said of who the people are.
      assertError(await ask(`${origin}/api/projects/${open.id}/invitations`), 403, "access.denied");
      assertError(
        await ask(`${origin}/api/projects/${private_.id}/invitations`),
        404,
        "project.not-found",
      );
      assert.deepEqual((await ask(`${origin}/api/projects/${open.id}/sharing`)).json(), {
        linkAccess: "view",
        role: "viewer",
      });
    },
  },

  {
    name: "sharing: somebody who looks at a project through its link and presses Share, signed in or not, gets the project's link and their role from the sharing dialog, and the anonymous page asks nothing else of the service",
    signedIn: "u-ana-share-link",
    async run(t) {
      const { origin } = t;
      const project = await showcase(t.me, "Linked");
      await setLinkLevel(t.me, project.id, "view");
      const link = projectLink(origin, project.id);

      const anon = await t.device({ as: null });
      await anon.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await anon.page.goto(link);
      await ready(anon.page);
      await viewingIs(anon.page, "live");
      await connected(anon.page);
      const before = anon.seen.requests.length;
      const dialog = await openShare(anon.page);
      await settled(dialog);
      // The project's own link, and what the person is to it: not the `#p=` link that carries the files.
      assert.equal(await dialog.locator("input.share-link").first().inputValue(), link);
      assert.match(await dialog.innerText(), /You can view this project but not change it\./);
      assert.equal(await dialog.getByRole("radio").count(), 0);
      assert.equal(await dialog.getByLabel("Email address").isVisible(), false);
      assert.equal(await peopleRows(dialog).count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "Leave" }).isVisible(), false);
      assert.equal(await dialog.getByRole("button", { name: "Publish…" }).isVisible(), false);
      await dialog.getByRole("button", { name: "Copy the link to the project" }).click();
      await until(
        anon.page,
        "the link to be copied",
        () =>
          document.querySelector(".share-status")?.textContent ===
          "The link to the project was copied.",
      );
      assert.equal(await anon.page.evaluate(() => navigator.clipboard.readText()), link);
      // The one call the dialog needs: the sharing of the project, which a link that admits may read.
      assert.deepEqual(
        anon.seen.requests
          .slice(before)
          .map((address) => new URL(address).pathname)
          .filter((path) => path.startsWith("/api/")),
        [`/api/projects/${project.id}/sharing`],
      );
      assert.equal(await anon.page.evaluate(() => location.hash), "", "no #p= link was made");

      // Signed in, the same dialog, with the same words.
      const bob = await t.person("u-bob-share-link", { name: "Bob" });
      const signed = await t.device({ as: bob });
      await signed.page.goto(link);
      await ready(signed.page);
      await connected(signed.page);
      const own = await openShare(signed.page);
      await settled(own);
      assert.equal(await own.locator("input.share-link").first().inputValue(), link);
      assert.match(await own.innerText(), /You can view this project but not change it\./);
      assert.equal(await own.getByRole("button", { name: "Leave" }).isVisible(), false);
    },
  },

  {
    name: "sharing: the limit of fifty people and pending invitations is shown in the dialog and holds: the fifty-first invitation, made in the page, says why, keeps what was typed and records nothing",
    signedIn: "u-ana-members",
    allowedErrors: [QUOTA_LOGGED],
    async run(t) {
      const { origin, page } = t;
      const project = await makeProject(t.me, "Crowded", { template: "flow" });
      for (let batch = 0; batch < 5; batch++) {
        await Promise.all(
          Array.from({ length: 10 }, (_, position) =>
            invite(t.me, project.id, `person${batch * 10 + position + 1}@example.org`, "viewer"),
          ),
        );
      }
      assert.equal((await pendingInvitations(t.me, project.id)).length, 50);
      const refused = await t.me.api("POST", `/api/projects/${project.id}/members`, {
        email: "one.too.many@example.org",
        role: "viewer",
      });
      assertError(refused, 413, "quota.members");

      await openByLink(page, origin, project.id);
      const dialog = await openShare(page);
      await settled(dialog);
      assert.match(await dialog.innerText(), /50 of 50 people and invitations/);
      assert.equal(await pendingRows(dialog).count(), 50);

      await dialog.getByLabel("Email address").fill("one.too.many@example.org");
      await dialog.getByRole("button", { name: "Invite", exact: true }).click();
      await until(
        page,
        "the limit to be said",
        () =>
          document
            .querySelector(".share-messages .field-problem")
            ?.textContent?.includes("at most 50 people and pending invitations") ?? false,
      );
      assert.match(
        await dialog.locator(".share-messages .field-problem").innerText(),
        /A project holds at most 50 people and pending invitations together\. Remove someone or revoke an invitation first\./,
      );
      assert.equal(
        await dialog.getByLabel("Email address").inputValue(),
        "one.too.many@example.org",
        "what was typed stays",
      );
      assert.equal(await dialog.locator(".share-reveal").isVisible(), false);
      // Nothing was recorded; revoking one makes room for it.
      const held = await pendingInvitations(t.me, project.id);
      assert.equal(held.length, 50);
      assert.ok(!held.some((row) => row.email === "one.too.many@example.org"));
      await pendingRows(dialog)
        .first()
        .getByRole("button", { name: /^Revoke the invitation for / })
        .click();
      await settled(dialog);
      await dialog.getByRole("button", { name: "Invite", exact: true }).click();
      await dialog.locator(".share-reveal").waitFor({ state: "visible" });
      assert.equal((await pendingInvitations(t.me, project.id)).length, 50);
      assert.ok(
        (await pendingInvitations(t.me, project.id)).some(
          (row) => row.email === "one.too.many@example.org",
        ),
      );
    },
  },
];

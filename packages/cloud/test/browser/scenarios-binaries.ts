/**
 * The scenarios of images and fonts: uploaded from the page and fetched by the other device, and
 * the safety of a script inside an SVG that someone uploaded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario } from "./scenario.js";
import {
  PNG,
  blobOf,
  connected,
  drawerRow,
  makeProject,
  openByLink,
  openDrawer,
  readRoom,
  roomHolds,
  sha256,
} from "./cloud.js";
import { until } from "./support.js";
import { SITE } from "./worker.js";

/** A real WOFF2 font: the page's own, served by the Worker. */
const FONT = readFileSync(join(SITE, "assets", "fonts", "inter-ui", "web", "Inter-Regular.woff2"));

/** The headers every answer of a blob carries (`cloud-projects`, "Images and fonts by hash"). */
function assertBlobHeaders(headers: Headers, hash: string, type: string): void {
  assert.equal(headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(headers.get("content-security-policy"), "sandbox");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("content-disposition"), `attachment; filename="${hash}"`);
  assert.equal(headers.get("content-type"), type);
}

export const binaryScenarios: Scenario[] = [
  {
    name: "images and fonts added in the page are uploaded by hash, served with their headers, and shown on the other device",
    signedIn: "u-ana-binaries",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const second = await t.device();
      await openByLink(page, t.origin, flow.id);
      await openByLink(second.page, t.origin, flow.id);

      // An image chosen from a file, as a person does.
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
      // A font added the way an imported archive adds it: a file of the project that is not text.
      await page.evaluate((base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        (
          window as unknown as {
            meltemiPlayground: {
              studio: { addFiles(files: [string, Uint8Array][], open?: string): void };
            };
          }
        ).meltemiPlayground.studio.addFiles([["fonts/title.woff2", bytes]]);
      }, FONT.toString("base64"));

      // Both are in the room by hash, and the Worker serves the bytes with the sandbox headers.
      const room = await roomHolds(
        t.me,
        flow.id,
        "the image and the font in the room",
        (read) =>
          read.binaries["diagrams/logo.png"] !== undefined &&
          read.binaries["fonts/title.woff2"] !== undefined,
      );
      assert.equal(room.binaries["diagrams/logo.png"], sha256(PNG));
      assert.equal(room.binaries["fonts/title.woff2"], sha256(FONT));
      for (const [hash, bytes, type] of [
        [sha256(PNG), PNG, "image/png"],
        [sha256(FONT), FONT, "font/woff2"],
      ] as const) {
        const got = await blobOf(t.origin, t.me, flow.id, hash);
        assert.equal(got.status, 200);
        assertBlobHeaders(got.headers, hash, type);
        assert.deepEqual(Buffer.from(got.bytes), bytes);
        const head = await blobOf(t.origin, t.me, flow.id, hash, "HEAD");
        assert.equal(head.status, 200);
        assertBlobHeaders(head.headers, hash, type);
        assert.equal(head.bytes.length, 0);
      }

      // The other device fetched both by hash: the font's bytes and the image, drawn.
      await until(
        second.page,
        "the font on the second device",
        (size) => {
          const studio = (
            window as unknown as {
              meltemiPlayground: { studio: { host: { get(p: string): unknown } } };
            }
          ).meltemiPlayground.studio;
          const font = studio.host.get("fonts/title.woff2");
          return font instanceof Uint8Array && font.length === size;
        },
        FONT.length,
      );
      await second.page.locator("#file-select").selectOption("diagrams/logo.png");
      const preview = second.page.locator(".image-preview img");
      await preview.waitFor();
      const size = await preview.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      });
      assert.deepEqual(size, [1, 1], "the one-pixel image is drawn");

      // And the first device keeps its own copies: the same project, the same files.
      const again = await readRoom(t.me, flow.id);
      assert.deepEqual(Object.keys(again.binaries).sort(), [
        "diagrams/logo.png",
        "fonts/title.woff2",
      ]);
      await connected(page);
    },
  },

  {
    name: "a script in an SVG executes nothing: opened top-level at its blob address it is a download that runs no script, and an <img> on the page still shows it",
    signedIn: "u-ana-svg",
    async run(t) {
      const { page, context, seen } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      // A script that would give itself away to the Worker, and take the session for its own.
      const evil = (probe: string) =>
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<rect width="40" height="40" fill="#cc0000"/>' +
        `<script>fetch("/api/projects/${flow.id}/${probe}").then(r=>r.text()).then(t=>{document.title="LEAK "+t});window.__ran=true;</script></svg>`;
      const svg = evil("leak-blob");
      const hash = sha256(svg);
      const upload = await t.me.api(
        "PUT",
        `/api/projects/${flow.id}/binaries/assets/evil.svg`,
        svg,
        {
          "Content-Type": "image/svg+xml",
        },
      );
      assert.equal(upload.status, 200, upload.text);
      assert.equal(upload.json()["hash"], hash);
      // Its thumbnail too: the other address of an SVG the Worker serves.
      const picture = evil("leak-thumbnail");
      const put = await t.me.api("PUT", `/api/projects/${flow.id}/thumbnail`, picture, {
        "Content-Type": "image/svg+xml",
      });
      assert.equal(put.status, 204, put.text);

      // The Worker's answers: the bytes as they were, and the headers that stop them running.
      const blob = await blobOf(t.origin, t.me, flow.id, hash);
      assert.equal(blob.status, 200);
      assert.equal(Buffer.from(blob.bytes).toString("utf8"), svg);
      assertBlobHeaders(blob.headers, hash, "image/svg+xml");
      const thumbnail = await t.me.api("GET", `/api/projects/${flow.id}/thumbnail`);
      assert.equal(thumbnail.headers.get("content-security-policy"), "sandbox");
      assert.equal(thumbnail.headers.get("content-type"), "image/svg+xml");

      // The project open in the page: the SVG is fetched as bytes and read as text, not run.
      await openByLink(page, t.origin, flow.id);
      await until(page, "the svg in the project", () =>
        [...document.querySelectorAll("#file-select option")].some(
          (option) => (option as HTMLOptionElement).value === "assets/evil.svg",
        ),
      );
      await page.locator("#file-select").selectOption("assets/evil.svg");
      await until(page, "the svg's source in the code pane", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes("<script>"),
      );

      // Opened top-level at the blob's address: the answer is an attachment, so the browser saves
      // it and shows no document of this origin: nothing runs, and /api/session is out of reach.
      const top = await context.newPage();
      const download = top.waitForEvent("download", { timeout: 10_000 });
      await top
        .goto(`${t.origin}/api/projects/${flow.id}/blobs/${hash}`)
        .catch((error: Error) => assert.match(error.message, /Download is starting/));
      const saved = await download;
      assert.equal(saved.suggestedFilename(), hash);
      const path = await saved.path();
      assert.equal(readFileSync(path, "utf8"), svg);
      assert.equal(top.url(), "about:blank", "no document was made of it");
      const thumbTop = await context.newPage();
      const thumbDownload = thumbTop.waitForEvent("download", { timeout: 10_000 });
      await thumbTop.goto(`${t.origin}/api/projects/${flow.id}/thumbnail`).catch(() => undefined);
      assert.equal((await thumbDownload).suggestedFilename(), "thumbnail.svg");
      assert.equal(thumbTop.url(), "about:blank");

      // An <img> on the page still shows it: an image runs no script, and the cookie goes with it.
      const shown = await page.evaluate(async (source) => {
        const image = document.createElement("img");
        image.src = source;
        document.body.append(image);
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, `/api/projects/${flow.id}/blobs/${hash}`);
      assert.deepEqual(shown, [40, 40]);
      // So does the drawer's thumbnail <img>, from the SVG that was uploaded as the picture.
      await openDrawer(page);
      const thumb = drawerRow(page, "Flow").locator("img.project-thumb");
      await thumb.waitFor();
      const drawn = await thumb.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      });
      assert.deepEqual(drawn, [40, 40]);

      // Nothing ran anywhere: the script's request never came, from any page or image.
      await page.waitForTimeout(600);
      assert.deepEqual(
        seen.requests.filter((address) => address.includes("/leak-")),
        [],
        "no script of the SVG ran",
      );
      assert.equal(
        await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran),
        undefined,
      );
      assert.equal(await page.title().then((title) => title.includes("LEAK")), false);
      // The room is as the upload left it.
      assert.equal((await readRoom(t.me, flow.id)).binaries["assets/evil.svg"], hash);
    },
  },
];

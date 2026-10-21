import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findBrowser, findFfmpeg, pngInfo } from "@meltemi/diagrams-capture";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-capture-cli-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
  });
  return { code, stdout, stderr };
}

const SHEET = [
  'language "0.2"',
  "diagram checkout: flow {",
  "  layout manual",
  '  api["API"] { url "https://docs.example.com/api" }',
  '  db[("DB")]',
  "  api -> db as save",
  "  placement {",
  "    place api at (100, 80)",
  "    place db at (400, 80)",
  "  }",
  "}",
  "",
  "export slide for checkout {",
  "  format png",
  "  scale 1",
  "  background transparent",
  '  file "out/slide.png"',
  "}",
  "",
  "export sheet for checkout {",
  "  format pdf",
  '  link "https://example.com/walkthrough.html"',
  "}",
  "",
  "export page for checkout {",
  "  format svg",
  "  background accent",
  "}",
  "",
].join("\n");
writeFileSync(join(scratch, "sheet.meltemi"), SHEET);

describe("export usage", () => {
  it("refuses options that do not apply to the format", () => {
    const cases: [string[], string][] = [
      [["--scale", "2"], "--scale sets the pixels of PNG exports"],
      [["--size", "800x600"], "--size sets the output of PNG, PDF and video exports"],
      [["--format", "png", "--stdout"], "--stdout prints text formats only"],
      [["--format", "png", "--scale", "9"], "--scale takes 1 to 8"],
      [["--format", "pdf", "--size", "10x10"], "--size takes WIDTHxHEIGHT"],
      [["--background", "url(x)"], "--background takes transparent"],
      [["--link", "javascript:alert(1)"], "--link takes an https:"],
      [["--format", "png", "--link", "https://x.example"], "--link applies to SVG and PDF"],
      [["--profiles", "--format", "png"], "profiles set their own options; --format"],
      [["--profile", "nope"], 'no profile named "nope"'],
      [["--profiles", "--out", "missing-folder"], "--out is an existing directory"],
    ];
    for (const [extra, message] of cases) {
      const result = mdg("export", "sheet.meltemi", ...extra);
      expect(result.code, extra.join(" ")).toBe(2);
      expect(result.stderr).toContain(message);
    }
  });

  it("writes SVG profiles with a token background", () => {
    const { code, stdout } = mdg("export", "sheet.meltemi", "--profile", "page");
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote sheet.page.svg\n");
    const svg = readFileSync(join(scratch, "sheet.page.svg"), "utf8");
    expect(svg).toMatch(
      /<rect x="0" y="0" width="[\d.]+" height="[\d.]+" fill="#[0-9A-Fa-f]{6}"\/>/,
    );
    expect(svg).toContain('<a href="https://docs.example.com/api">');
  });
});

describe.skipIf(!findBrowser())("PNG and PDF with the installed browser", () => {
  it("writes PNG at a scale, a size and a transparent background", () => {
    const plain = mdg("export", "sheet.meltemi", "--format", "png", "--fonts", "system");
    expect(plain.code).toBe(0);
    expect(plain.stdout).toMatch(
      /^Wrote sheet\.png \((Edg|Chrome|HeadlessChrome|Chromium)\/[\d.]+\)\n$/,
    );
    const info = pngInfo(readFileSync(join(scratch, "sheet.png")));
    const sized = mdg(
      "export",
      "sheet.meltemi",
      "--format",
      "png",
      "--scale",
      "1",
      "--size",
      "800x600",
      "--background",
      "transparent",
      "--out",
      "sized.png",
    );
    expect(sized.code).toBe(0);
    expect(pngInfo(readFileSync(join(scratch, "sized.png")))).toEqual({
      width: 800,
      height: 600,
      alpha: true,
    });
    // The default scale is 2.
    expect(info.width % 2).toBe(0);
  }, 60_000);

  it("writes PDF with the links of elements and of the picture", () => {
    const { code } = mdg(
      "export",
      "sheet.meltemi",
      "--format",
      "pdf",
      "--link",
      "https://example.com/all",
    );
    expect(code).toBe(0);
    const pdf = readFileSync(join(scratch, "sheet.pdf")).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("/URI (https://docs.example.com/api)");
    expect(pdf).toContain("/URI (https://example.com/all)");
  }, 60_000);

  it("runs every profile of the file, into their files or a folder", () => {
    const { code, stdout } = mdg("export", "sheet.meltemi", "--profiles");
    expect(code).toBe(0);
    expect(stdout).toContain("Wrote sheet.page.svg\n");
    expect(stdout).toMatch(/Wrote out\/slide\.png \(/);
    expect(stdout).toMatch(/Wrote sheet\.sheet\.pdf \(/);
    expect(pngInfo(readFileSync(join(scratch, "out", "slide.png"))).alpha).toBe(true);
    expect(readFileSync(join(scratch, "sheet.sheet.pdf")).toString("latin1")).toContain(
      "/URI (https://example.com/walkthrough.html)",
    );
    mkdirSync(join(scratch, "delivery"));
    expect(mdg("export", "sheet.meltemi", "--profile", "sheet", "--out", "delivery").code).toBe(0);
    expect(existsSync(join(scratch, "delivery", "sheet.sheet.pdf"))).toBe(true);
  }, 120_000);
});

const ffmpeg = findFfmpeg();
const ffprobe = ffmpeg
  ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
  : null;

function probe(file: string): Record<string, string> {
  const result = spawnSync(
    ffprobe!,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=duration",
      "-of",
      "default=noprint_wrappers=1",
      file,
    ],
    { encoding: "utf8" },
  );
  return Object.fromEntries(
    result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=") as [string, string]),
  );
}

describe("video usage", () => {
  it("refuses options that do not apply to videos", () => {
    const cases: [string[], string][] = [
      [["--format", "png", "--fps", "10"], "--fps sets the frames per second"],
      [["--duration", "2s"], "--duration sets the length"],
      [["--format", "mp4", "--background", "transparent"], "MP4 has no transparency"],
      [["--format", "mp4", "--stdout"], "--stdout prints text formats only"],
      [["--format", "gif", "--fps", "90"], "--fps takes a whole number from 1 to 60"],
      [["--format", "webm", "--at", "1s"], "writes a video; it cannot be combined with --at"],
    ];
    for (const [extra, message] of cases) {
      const result = mdg("export", "sheet.meltemi", ...extra);
      expect(result.code, extra.join(" ")).toBe(2);
      expect(result.stderr).toContain(message);
    }
  });
});

describe.skipIf(!findBrowser() || !ffprobe || !existsSync(ffprobe))(
  "videos with the browser and FFmpeg",
  () => {
    it("records a story frame by frame for its whole length", () => {
      copyFileSync(
        join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"),
        join(scratch, "purchase.meltemi"),
      );
      const { code, stdout } = mdg(
        "export",
        "purchase.meltemi",
        "--story",
        "purchase",
        "--format",
        "mp4",
        "--size",
        "320x180",
        "--fps",
        "10",
      );
      expect(code).toBe(0);
      expect(stdout).toMatch(/^Wrote purchase\.purchase\.mp4 \(.+, FFmpeg [\d.]+, 74 frames\)\n$/);
      const info = probe(join(scratch, "purchase.purchase.mp4"));
      expect(info).toMatchObject({
        codec_name: "h264",
        width: "320",
        height: "180",
        nb_read_frames: "74",
      });
      expect(Number(info.duration)).toBeCloseTo(7.4, 1);
    }, 180_000);

    it("needs a duration for effects that repeat forever, and runs video profiles", () => {
      writeFileSync(
        join(scratch, "video.meltemi"),
        SHEET.replace("  placement {", "  animate save { effect flow }\n  placement {").replace(
          "export page for checkout {",
          'export clip for checkout {\n  format gif\n  size (160, 90)\n  fps 5\n  duration 1s\n  file "clip.gif"\n}\n\nexport page for checkout {',
        ),
      );
      const endless = mdg("export", "video.meltemi", "--format", "gif");
      expect(endless.code).toBe(1);
      expect(endless.stderr).toContain("repeat forever; give the video a duration");
      const { code, stdout } = mdg("export", "video.meltemi", "--profile", "clip");
      expect(code).toBe(0);
      expect(stdout).toMatch(/Wrote clip\.gif \(.+, 5 frames\)/);
      expect(probe(join(scratch, "clip.gif"))).toMatchObject({ codec_name: "gif", width: "160" });
    }, 180_000);
  },
);

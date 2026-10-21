// Finds an installed Edge, Chrome or Chromium. Plain JavaScript, so a plain `node` can run it.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Where the usual Chromium browsers install, by platform. */
function candidates(env, platform) {
  const local = env.LOCALAPPDATA ?? "";
  const programs = [
    env["PROGRAMFILES(X86)"],
    env.PROGRAMFILES,
    "C:/Program Files (x86)",
    "C:/Program Files",
  ]
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
  if (platform === "win32") {
    return [
      ...programs.map((p) => join(p, "Microsoft/Edge/Application/msedge.exe")),
      ...programs.map((p) => join(p, "Google/Chrome/Application/chrome.exe")),
      ...(local ? [join(local, "Google/Chrome/Application/chrome.exe")] : []),
      ...(local ? [join(local, "Chromium/Application/chrome.exe")] : []),
    ];
  }
  if (platform === "darwin") {
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

/**
 * The executable of an installed Chromium browser: `MELTEMI_BROWSER` when it is set, otherwise the
 * first of the usual Edge, Chrome and Chromium locations that exists; null when there is none.
 */
export function findBrowser(env = process.env, platform = process.platform) {
  const chosen = env.MELTEMI_BROWSER;
  if (chosen) return existsSync(chosen) ? chosen : null;
  return candidates(env, platform).find((path) => existsSync(path)) ?? null;
}

/** What to say when no browser is found. */
export const NO_BROWSER =
  "PNG and PDF exports need Edge, Chrome or Chromium installed; set MELTEMI_BROWSER to the browser's executable if it is somewhere else.";

// Finds an installed Edge or Chrome for playwright-core, which downloads no browser of its own.
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.MELTEMI_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function browserPath() {
  const found = CANDIDATES.find((path) => path && existsSync(path));
  if (!found) {
    throw new Error("No Edge or Chrome found; set MELTEMI_BROWSER to the browser's executable.");
  }
  return found;
}

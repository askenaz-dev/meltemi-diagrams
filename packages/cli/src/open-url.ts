import { spawn } from "node:child_process";

/** The program that opens an address in the user's browser on a platform, with its arguments. */
export function browserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): { readonly command: string; readonly args: readonly string[] } {
  // Only web addresses, which the command line builds itself: never what a server or a file says.
  const protocol = new URL(url).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`Refusing to open ${protocol} addresses.`);
  }
  // No shell on any platform, so that `&` and quotes in the address mean nothing: `cmd /c start`
  // would read them as its own syntax.
  if (platform === "win32") {
    return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
  }
  return { command: platform === "darwin" ? "open" : "xdg-open", args: [url] };
}

/**
 * Opens a web address in the default browser, without a shell. Resolves once the opener started and
 * rejects when it could not (no `xdg-open`, say), so that the caller can print the address.
 */
export function openUrl(url: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const { command, args } = browserCommand(url, platform);
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

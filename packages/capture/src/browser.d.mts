/** The executable of an installed Chromium browser, or null when there is none. */
export function findBrowser(
  env?: Record<string, string | undefined>,
  platform?: string,
): string | null;
/** What to say when no browser is found. */
export const NO_BROWSER: string;

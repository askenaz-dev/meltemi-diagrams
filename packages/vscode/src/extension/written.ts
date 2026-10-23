/**
 * The message after an export: the files written, then what the export chose because nothing
 * said (a video's duration, a background, a size), as `produceExport` words it.
 */
export function writtenMessage(
  wrote: (names: readonly string[]) => string,
  names: readonly string[],
  notices: readonly string[],
): string {
  return [wrote(names), ...notices].join(" ");
}

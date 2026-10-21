// The clipboard, as the dialogs of the cloud projects use it: writing text, and saying whether it
// worked. Without the clipboard (a page that is not secure, or a refusal) the person copies by hand,
// so the dialogs always show what they copy in a field they can select.

/** Writes text to the clipboard; false when the browser refuses or has none. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

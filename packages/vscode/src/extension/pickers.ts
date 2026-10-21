import { isInside, relativePath, toProjectPath } from "@meltemi/diagrams-project";
import * as vscode from "vscode";
import { messages } from "./messages/index.js";

/**
 * Asks for an image file of the project and returns its path relative to the document, with `/`.
 * Files outside the project are refused with the reason.
 */
export async function pickImage(
  document: vscode.TextDocument,
  projectRoot: string,
): Promise<string | undefined> {
  const t = messages().pickers;
  const folder = vscode.Uri.joinPath(document.uri, "..");
  const chosen = await vscode.window.showOpenDialog({
    canSelectMany: false,
    defaultUri: folder,
    openLabel: t.useImage,
    filters: { [t.images]: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
  });
  const file = chosen?.[0];
  if (!file) return undefined;
  const path = toProjectPath(file.fsPath);
  if (!isInside(projectRoot, path)) {
    void vscode.window.showWarningMessage(t.imageOutside(projectRoot));
    return undefined;
  }
  return relativePath(toProjectPath(folder.fsPath), path);
}

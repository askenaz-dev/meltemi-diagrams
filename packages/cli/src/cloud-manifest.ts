/**
 * The `cloud` field of `project.json` (`cli-cloud`, "Push" and "Pull"): `{ "host": …, "project": … }`,
 * written by `push --create` and `pull` through `setJsonObjectField`, which keeps the file's
 * indentation, line endings and everything else byte for byte.
 */

import { setJsonObjectField } from "@meltemi/diagrams-editor";
import { applyTextEdits } from "@meltemi/diagrams-language";

/** The byte order mark, which a Windows editor may put in front of a JSON file. */
const BYTE_ORDER_MARK = 0xfeff;

/**
 * The text of a manifest with its `cloud` field set to the service and the cloud project: replaced
 * when it is there (and unchanged when it is already these values), else added after the last field.
 * A byte order mark stays. Throws when the text is not a JSON object.
 */
export function withCloudField(text: string, host: string, project: string): string {
  const bom = text.charCodeAt(0) === BYTE_ORDER_MARK;
  const body = bom ? text.slice(1) : text;
  const edited = applyTextEdits(body, setJsonObjectField(body, "cloud", { host, project }));
  return bom ? String.fromCharCode(BYTE_ORDER_MARK) + edited : edited;
}

// Code notes (decision 0078): the text a code note's Copy code puts on the clipboard.
import { StyleResolver } from "@meltemi/diagrams-layout";
import { diagramView, type DocumentAnalysis } from "./analysis.js";
import { effectiveTheme } from "./themes.js";

/**
 * The text of a code note of a diagram as it is written, with its spaces, tabs and line feeds: a
 * `note` element or a note of a sequence diagram (by its key) that `textFormat code` draws as a
 * code block. Undefined when `id` names anything else, a plain note included.
 */
export function codeNoteText(
  analysis: DocumentAnalysis,
  diagramId: string,
  id: string,
): string | undefined {
  const view = diagramView(analysis, diagramId);
  if (!view) return undefined;
  const diagram = view.diagram;
  const styles = new StyleResolver(effectiveTheme(analysis, view), diagram);
  const element = diagram.elementsById.get(id);
  if (element) {
    return element.kind === "note" && styles.element(element).textFormat === "code"
      ? element.label
      : undefined;
  }
  const event = diagram.eventsByKey.get(id);
  if (event?.kind !== "note") return undefined;
  return styles.event(event.id ?? event.key, "note").textFormat === "code" ? event.text : undefined;
}

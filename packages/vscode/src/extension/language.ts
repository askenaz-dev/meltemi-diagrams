import { getLocale, isLocale, resolveLocale, setLocale, type Locale } from "@meltemi/diagrams-i18n";
import * as vscode from "vscode";

/**
 * The interface language `meltemi.language` asks for: `en` or `es`, or with `auto`, VS Code's
 * display language (Spanish for any Spanish, English for every other language).
 */
export function interfaceLocale(): Locale {
  const chosen = vscode.workspace.getConfiguration("meltemi").get<string>("language", "auto");
  return isLocale(chosen) ? chosen : resolveLocale(vscode.env.language);
}

/**
 * Keeps the interface language of the extension host in step with `meltemi.language`: it is set
 * when this is created, before anything builds words for people, and again when the setting
 * changes, after which the listeners refresh what shows words.
 */
export class InterfaceLanguage implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<Locale>();
  private readonly listener: vscode.Disposable;

  /** Fires once the interface language changed; `getLocale()` gives the new one. */
  readonly onDidChange = this.changed.event;

  constructor() {
    setLocale(interfaceLocale());
    this.listener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("meltemi.language")) return;
      const locale = interfaceLocale();
      if (locale === getLocale()) return;
      setLocale(locale);
      this.changed.fire(locale);
    });
  }

  dispose(): void {
    this.listener.dispose();
    this.changed.dispose();
  }
}

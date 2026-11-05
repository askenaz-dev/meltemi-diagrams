// The local workspace is an explicit product mode, not a hosted account or a fabricated session.
import { messages } from "../messages/index.js";
import { field, h, openDialog } from "../ui.js";
import { addressFor, planOpen } from "./address.js";
import { copyText } from "./clipboard.js";
import type { CloudWords } from "./explain.js";
import type { Session } from "./session.js";

/** A default never replaces an explicit address, a shared document or this browser's saved work. */
export function localStartupProject(
  session: Session,
  search: string,
  hasSavedWork: boolean,
  hasSharedWork: boolean,
): string | undefined {
  return session.kind === "local" &&
    planOpen(search).kind === "none" &&
    !hasSavedWork &&
    !hasSharedWork
    ? session.defaultProject.id
    : undefined;
}

/** The same project id and host-visible address survive plugin activation in another session. */
export function localAgentPrompt(page: string, project: string): string {
  const origin = new URL(page).origin;
  return messages().localWorkspace.prompt(
    `${origin}/agent-setup/local/prompt.md?project=${encodeURIComponent(project)}`,
    project,
    addressFor(`${origin}/`, project),
  );
}

/** Local storage has the cloud project's contracts, with words that name where the data lives. */
export function localCloudWords(): CloudWords {
  const cloud = messages().cloud;
  const local = messages().localWorkspace;
  return {
    ...cloud,
    projects: {
      ...cloud.projects,
      none: local.noProjects,
      saveTitle: local.save,
      saveLabel: local.saveLabel,
      saving: local.saving,
      saved: local.saved,
    },
    status: {
      ...cloud.status,
      label: local.label,
      connecting: local.connecting,
      connected: local.connected,
      gone: local.gone,
      synced: local.synced,
    },
  };
}

/** Always show a selectable prompt, including when the clipboard is unavailable. */
export function openLocalAgentSetup(page: string, project: string): HTMLDialogElement {
  const m = messages().localWorkspace;
  const prompt = localAgentPrompt(page, project);
  const input = h("textarea", {
    class: "local-agent-prompt",
    readonly: true,
    rows: 7,
    spellcheck: "false",
  });
  input.value = prompt;
  const status = h("p", { role: "status" });
  return openDialog(
    m.setUpAgent,
    [
      h("p", {}, m.intro),
      field(m.promptLabel, input),
      h("p", { class: "field-hint" }, m.activation),
      status,
    ],
    [
      { label: messages().dialog.close },
      {
        label: m.copy,
        primary: true,
        run: async () => {
          const copied = await copyText(prompt);
          status.textContent = copied ? m.copied : m.select;
          if (!copied) {
            input.focus();
            input.select();
          }
          return false;
        },
      },
    ],
  );
}

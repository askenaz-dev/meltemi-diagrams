import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import {
  localAgentPrompt,
  localCloudWords,
  localStartupProject,
} from "../src/cloud/local-workspace.js";
import { parseSession, type Session } from "../src/cloud/session.js";

const PAGE = "http://127.0.0.1:8899/";
const ID = "abcdefghij0123456789";
const OTHER = "zyxwvutsrq9876543210";
const answer = {
  mode: "local-single-user",
  user: { sub: "local-owner", name: "Local workspace", picture: "" },
  defaultProject: { id: ID, url: `${PAGE}?project=${ID}` },
};
const local = () => parseSession(JSON.stringify(answer), PAGE, "https://id.meltemi.dev");
afterEach(() => setLocale("en"));

describe("the explicit local workspace", () => {
  it("recognizes a local actor without any credential or provider field", () => {
    const session = local();
    expect(session.kind).toBe("local");
    expect(session).not.toHaveProperty("signIn");
    expect(session).not.toHaveProperty("token");
    expect(session).not.toHaveProperty("account");
    expect(session).not.toHaveProperty("signOut");
    expect(session).toMatchObject({
      defaultProject: answer.defaultProject,
      user: { sub: "local-owner" },
    });
  });

  it.each([
    { id: "invalid", url: `${PAGE}?project=invalid` },
    { id: ID, url: `https://outside.example/?project=${ID}` },
    { id: ID, url: `${PAGE}?project=${OTHER}` },
    { id: ID, url: "javascript:alert(1)" },
  ])("does not follow malformed or foreign default project %j", (defaultProject) => {
    expect(
      parseSession(JSON.stringify({ ...answer, defaultProject }), PAGE, "https://id.meltemi.dev")
        .kind,
    ).toBe("anonymous");
  });

  it("opens the default only when there is no address, shared document or saved work to preserve", () => {
    expect(localStartupProject(local(), "", false, false)).toBe(ID);
    expect(localStartupProject(local(), "?theme=dark", false, false)).toBe(ID);
    expect(localStartupProject(local(), `?project=${OTHER}`, false, false)).toBeUndefined();
    expect(localStartupProject(local(), "?project=invalid", false, false)).toBeUndefined();
    expect(localStartupProject(local(), "", true, false)).toBeUndefined();
    expect(localStartupProject(local(), "", false, true)).toBeUndefined();
    const anonymous: Session = { kind: "anonymous", signIn: "https://id.meltemi.dev/login" };
    expect(localStartupProject(anonymous, "", false, false)).toBeUndefined();
  });

  it("keeps the selected project and configured port through plugin setup in both languages", () => {
    for (const language of ["en", "es"] as const) {
      setLocale(language);
      const prompt = localAgentPrompt(`${PAGE}?project=${ID}#ignored`, OTHER);
      expect(prompt).toContain(`${PAGE}agent-setup/local/prompt.md?project=${OTHER}`);
      expect(prompt).toContain(`${PAGE}?project=${OTHER}`);
      expect(prompt).toContain(OTHER);
      expect(prompt).not.toContain(ID);
      expect(prompt).not.toMatch(/Bearer|MELTEMI_TOKEN|MELTEMI_MCP_KEY|npx/);
    }
  });

  it("describes workspace persistence without changing hosted words", () => {
    expect(localCloudWords().status.connected).toBe("Saved to the local workspace");
    setLocale("es");
    expect(localCloudWords().status.connected).toBe("Guardado en el espacio de trabajo local");
  });
});

// The setup page's only enhancement. The prompt remains readable and selectable without it.
import { copyText } from "./cloud/clipboard.js";

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-prompt]")) {
  const box = button.closest<HTMLElement>(".prompt-box");
  const code = box?.querySelector<HTMLElement>("pre.prompt code");
  const status = box?.querySelector<HTMLElement>('[role="status"]');
  const label = button.getAttribute("aria-label");
  const copied = button.dataset["copied"];
  const failed = button.dataset["copyFailed"];
  if (!box || !code || !status || !label || !copied || !failed) continue;

  let pending = false;
  let reset: ReturnType<typeof setTimeout> | undefined;
  const restore = () => {
    delete button.dataset["state"];
    button.setAttribute("aria-label", label);
    button.title = label;
  };

  button.addEventListener("click", async () => {
    if (pending) return;
    pending = true;
    button.setAttribute("aria-busy", "true");
    if (reset !== undefined) clearTimeout(reset);
    status.textContent = "";
    status.classList.remove("copy-status-error");
    restore();

    const success = await copyText(code.textContent ?? "");
    pending = false;
    button.removeAttribute("aria-busy");
    if (success) {
      button.dataset["state"] = "copied";
      button.setAttribute("aria-label", copied);
      button.title = copied;
      status.textContent = copied;
      reset = setTimeout(() => {
        restore();
        status.textContent = "";
      }, 2500);
    } else {
      code.tabIndex = -1;
      code.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.classList.add("copy-status-error");
      status.textContent = failed;
    }
  });

  button.hidden = false;
  box.classList.add("copy-enabled");
}

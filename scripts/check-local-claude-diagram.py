"""Opt-in, bounded real Claude Code diagramming check, using its existing native authentication.

No credential file is read or copied. Only the image's explicit --plugin-dir is loaded;
host-file tools are disabled. A dedicated test project is removed at the end.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("local-agent-install.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    origin = installer.local_origin(args.origin)
    client = shutil.which("claude")
    state = subprocess.run([client, "auth", "status", "--json"], capture_output=True, text=True, timeout=15)
    authenticated = state.returncode == 0 and json.loads(state.stdout).get("loggedIn") is True
    if not authenticated:
        print(json.dumps({"authenticated": False, "modelCheck": "skipped; no login was attempted"}))
        return
    manifest = json.loads(installer.download(origin + "/agent-setup/local/manifest.json", origin))
    data = installer.download(manifest["bundles"]["claude"]["url"], origin)
    import hashlib
    assert hashlib.sha256(data).hexdigest() == manifest["bundles"]["claude"]["sha256"]
    evidence = Path(tempfile.mkdtemp(prefix="meltemi-claude-diagram-"))
    bundle = evidence / "bundle"
    bundle.mkdir()
    installer.extract_bundle(data, bundle)
    plugin = bundle / "plugins/meltemi-diagrams-local"
    workspace = evidence / "workspace"
    workspace.mkdir()
    marker = "Claude native acceptance " + str(uuid.uuid4())
    prompt = "/meltemi-diagrams-local:meltemi-diagrams\n" + f"""This is a bounded native-plugin acceptance check.
Use ONLY this plugin's native MCP tools. Create exactly one empty project named {marker!r},
with an idempotencyKey; never touch any pre-existing project or host file. In the new project,
write native.meltemi at its current revision with an idempotencyKey and this valid source:
language "0.2"
diagram native: flow {{
 person["Person"]
 agent["Agent"]
 person -> agent
}}
Call validate (zero errors), preview with format svg, and open_url. Report the new project id,
revision, validation error count, SVG result and URL. Do not use shell/HTTP/host-file tools,
do not authenticate to Meltemi, and do not create any other project. Finish after this flow.
"""
    allowed = "mcp__plugin_meltemi-diagrams-local_meltemi__*"
    command = [client, "--print", "--output-format", "stream-json", "--verbose",
               "--no-session-persistence", "--setting-sources", "",
               "--mcp-config", '{"mcpServers":{}}', "--plugin-dir", str(plugin), "--tools", "",
               "--permission-mode", "dontAsk", "--allowedTools", allowed,
               "--max-turns", "12", "--max-budget-usd", "1.50", "--model", "sonnet", prompt]
    env = os.environ.copy()
    # Keep the normal CLI's own authentication. Only nonessential background traffic is disabled.
    env.update({"DISABLE_AUTOUPDATER": "1", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"})
    print("Claude diagram evidence: " + str(evidence), file=sys.stderr, flush=True)
    completed = subprocess.run(command, cwd=workspace, env=env, capture_output=True, text=True, timeout=180)
    events = []
    tool_names = []
    project_id = None
    summary = None
    for line in completed.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get("type") in ("assistant", "user"):
            content = item.get("message", {}).get("content", [])
            for block in content if isinstance(content, list) else []:
                if block.get("type") == "tool_use":
                    tool_names.append(block["name"])
                if block.get("type") in ("tool_use", "tool_result"):
                    events.append(block)
        if item.get("type") == "result":
            summary = {key: item.get(key) for key in ("is_error", "subtype", "result", "num_turns", "total_cost_usd", "errors")}
    # Find only the dedicated test project for cleanup, regardless of whether the model finished.
    with urllib.request.urlopen(origin + "/api/projects", timeout=10) as response:
        listed = json.load(response)
    projects = listed.get("projects", []) if isinstance(listed, dict) else listed
    owned = [row for row in projects if row.get("name") == marker]
    try:
        assert len(owned) == 1, "The native Claude flow did not create exactly its dedicated project"
        project_id = owned[0]["id"]
        expected = ("create_project", "write_files", "validate", "preview", "open_url")
        assert all(any(name.endswith("__" + required) for name in tool_names) for required in expected), "A native tool step was absent"
        assert completed.returncode == 0 and summary and summary["is_error"] is False, "Claude did not complete the flow"
        result = {"authenticated": True, "nativePlugin": "meltemi-diagrams-local", "toolsCalled": tool_names,
                  "project": project_id, "modelResult": summary, "events": events, "testProjectRemoved": True}
        (evidence / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps({"evidence": str(evidence), "nativeTools": tool_names, "project": project_id,
                          "costUsd": summary["total_cost_usd"], "testProjectRemoved": True}, indent=2))
    finally:
        for project in owned:
            cleanup = urllib.request.Request(origin + "/api/projects/" + project["id"], method="DELETE", headers={"Origin": origin})
            with urllib.request.urlopen(cleanup, timeout=10) as response:
                assert response.status == 204
        if not (evidence / "result.json").exists():
            (evidence / "failure.json").write_text(json.dumps({"returncode": completed.returncode,
                "toolsCalled": tool_names, "modelResult": summary, "events": events,
                "testProjectsRemoved": [row["id"] for row in owned], "stderr": completed.stderr[-3000:]}, indent=2))


if __name__ == "__main__":
    main()

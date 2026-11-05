"""Prove installed plugins initialize/discover real MCP tools in the native clients, without a model.

Usage: python scripts/check-local-agent-activation.py --origin http://127.0.0.1:8879
Requires the running local image, installed Claude Code/Codex, and Python 3. No SDK dependency.
Codex's app-server and Claude's documented SDK control transport do the connection themselves.
"""

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import uuid


async def start_native(command, workspace, env):
    return await asyncio.create_subprocess_exec(
        *command, cwd=workspace, env=env, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        limit=4 * 1024 * 1024)


async def close_native(process):
    if process.stdin:
        process.stdin.close()
    try:
        await asyncio.wait_for(process.wait(), 4)
    except asyncio.TimeoutError:
        process.terminate()
        await process.wait()


async def codex_check(workspace, env, manifest):
    process = await start_native([shutil.which("codex"), "app-server", "--stdio"], workspace, env)
    stderr = asyncio.create_task(process.stderr.read())
    events = []
    sequence = 0

    async def rpc(method, params):
        nonlocal sequence
        sequence += 1
        request_id = sequence
        process.stdin.write((json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method,
                                        "params": params}) + "\n").encode())
        await process.stdin.drain()
        while True:
            line = await asyncio.wait_for(process.stdout.readline(), 45)
            if not line:
                raise RuntimeError("Codex exited before " + method)
            item = json.loads(line)
            events.append(item)
            if item.get("id") == request_id and "method" not in item:
                if "error" in item:
                    raise RuntimeError(method + ": " + json.dumps(item["error"]))
                return item["result"]
            if "id" in item and "method" in item:
                process.stdin.write((json.dumps({"jsonrpc": "2.0", "id": item["id"], "error": {
                    "code": -32601, "message": "No model/auth/UI operation is part of this probe"}}) + "\n").encode())
                await process.stdin.drain()

    try:
        initialized = await rpc("initialize", {"clientInfo": {"name": "meltemi-native-check", "version": "1.0.0"},
                                               "capabilities": {"experimentalApi": True}})
        process.stdin.write(b'{"jsonrpc":"2.0","method":"initialized"}\n')
        thread = await rpc("thread/start", {"cwd": str(workspace), "ephemeral": True})
        thread_id = thread["thread"]["id"]
        skills = await rpc("skills/list", {"cwds": [str(workspace)], "forceReload": True})
        loaded_skill = next((skill for row in skills["data"] for skill in row["skills"]
                             if skill.get("name", "").endswith("meltemi-diagrams") and
                             "meltemi-diagrams-local" in str(skill.get("path", ""))), None)
        assert loaded_skill, "Codex did not load the plugin's canonical diagramming skill"
        deadline = asyncio.get_running_loop().time() + 30
        while True:
            inventory = await rpc("mcpServerStatus/list", {"threadId": thread_id, "detail": "full"})
            servers = inventory.get("data", inventory.get("servers", []))
            server = next((row for row in servers if row.get("name") == "meltemi"), None)
            if (server and len(server.get("tools", {})) == 27) or asyncio.get_running_loop().time() >= deadline:
                break
            await asyncio.sleep(0.5)
        if not server or len(server.get("tools", {})) != 27 or server.get("toolsError"):
            raise RuntimeError("Codex did not discover the 27 native MCP tools: " + json.dumps(inventory))

        async def call(name, arguments=None):
            result = await rpc("mcpServer/tool/call", {"threadId": thread_id, "server": "meltemi",
                                                       "tool": name, "arguments": arguments or {}})
            if result.get("isError"):
                raise RuntimeError(name + ": " + json.dumps(result))
            return result

        identity = await call("whoami")
        default = await call("get_project", {"project": manifest["defaultProject"]["id"]})
        created = await call("create_project", {"name": "Native plugin verification", "idempotencyKey": "native-" + str(uuid.uuid4())})
        project_id = created["structuredContent"]["id"]
        try:
            written = await call("write_files", {"project": project_id, "ifRevision": 0,
                "idempotencyKey": "write-" + str(uuid.uuid4()), "files": {"native.meltemi":
                'language "0.2"\ndiagram native: flow {\n a["Person"]\n b["Agent"]\n a -> b\n}\n'}})
            checked = await call("validate", {"project": project_id})
            assert checked["structuredContent"]["errors"] == 0
            preview = await call("preview", {"project": project_id, "path": "native.meltemi", "format": "svg"})
            assert any(item.get("text", "").startswith("<svg") for item in preview["content"])
            opened = await call("open_url", {"project": project_id})
        finally:
            # Cleanup only the explicitly named test project; this is not a substitute for native calls.
            cleanup = urllib.request.Request(manifest["origin"] + "/api/projects/" + project_id,
                                             method="DELETE", headers={"Origin": manifest["origin"]})
            with urllib.request.urlopen(cleanup, timeout=10) as response:
                assert response.status == 204
        result = {"client": "codex", "initialized": initialized, "nativeServer": server, "loadedSkill": loaded_skill,
                  "whoami": identity, "defaultProject": default, "write": written,
                  "validate": checked, "preview": {"svg": True}, "open": opened,
                  "modelCalls": 0, "testProjectRemoved": True}
        (workspace / "activation.json").write_text(json.dumps(result, indent=2))
        return {"client": "codex", "nativeConnected": True, "tools": 27,
                "skillLoaded": True, "writeValidatePreview": True, "modelCalls": 0}
    finally:
        await close_native(process)
        (workspace / "app-server-stderr.txt").write_bytes(await stderr)
        (workspace / "app-server-events.json").write_text(json.dumps(events, indent=2))


async def claude_check(workspace, env):
    process = await start_native([shutil.which("claude"), "--print", "--input-format", "stream-json",
                                  "--output-format", "stream-json", "--verbose", "--no-session-persistence"], workspace, env)
    stderr = asyncio.create_task(process.stderr.read())
    events = []
    sequence = 0

    async def control(subtype):
        nonlocal sequence
        sequence += 1
        request_id = "native-check-" + str(sequence)
        process.stdin.write((json.dumps({"type": "control_request", "request_id": request_id,
                                        "request": {"subtype": subtype}}) + "\n").encode())
        await process.stdin.drain()
        while True:
            line = await asyncio.wait_for(process.stdout.readline(), 45)
            if not line:
                raise RuntimeError("Claude exited before " + subtype)
            item = json.loads(line)
            events.append(item)
            response = item.get("response", {})
            if item.get("type") == "control_response" and response.get("request_id") == request_id:
                if response.get("subtype") == "error":
                    raise RuntimeError(subtype + ": " + str(response))
                return response.get("response", {})

    try:
        initialized = await control("initialize")
        assert any(command.get("name") == "meltemi-diagrams-local:meltemi-diagrams"
                   for command in initialized["commands"]), "Claude did not load the plugin's diagramming skill"
        deadline = asyncio.get_running_loop().time() + 30
        while True:
            status = await control("mcp_status")
            server = next((row for row in status.get("mcpServers", []) if "meltemi" in row.get("name", "")), None)
            if (server and server.get("status") == "connected" and len(server.get("tools", [])) == 27) or asyncio.get_running_loop().time() >= deadline:
                break
            await asyncio.sleep(0.5)
        if not server or server.get("status") != "connected" or len(server.get("tools", [])) != 27:
            raise RuntimeError("Claude did not discover 27 connected native MCP tools: " + json.dumps(status))
        (workspace / "activation.json").write_text(json.dumps({"initialized": initialized, "mcp": status,
                                                              "modelCalls": 0}, indent=2))
        return {"client": "claude", "nativeConnected": True, "tools": 27, "skillLoaded": True,
                "modelCalls": 0, "toolInvocation": "The SDK exposes native discovery, not remote native tool dispatch"}
    finally:
        await close_native(process)
        (workspace / "claude-stderr.txt").write_bytes(await stderr)
        (workspace / "claude-events.json").write_text(json.dumps(events, indent=2))


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    if not origin.startswith("http://127.0.0.1:"):
        raise ValueError("This test only accepts the local loopback instance")
    evidence = Path(tempfile.mkdtemp(prefix="meltemi-native-activation-"))
    print("Native activation evidence: " + str(evidence), file=sys.stderr, flush=True)
    with urllib.request.urlopen(origin + "/agent-setup/local/manifest.json", timeout=10) as response:
        manifest = json.load(response)
    with urllib.request.urlopen(manifest["installer"]["url"], timeout=10) as response:
        installer = response.read()
    assert hashlib.sha256(installer).hexdigest() == manifest["installer"]["sha256"]
    installer_path = evidence / "install.py"
    installer_path.write_bytes(installer)
    results = []
    for client in ("codex", "claude"):
        workspace = evidence / client
        workspace.mkdir()
        env = os.environ.copy()
        env.update({"CODEX_HOME": str(workspace / "codex-home"),
                    "CLAUDE_CONFIG_DIR": str(workspace / "claude-home"),
                    "DISABLE_AUTOUPDATER": "1", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"})
        for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"):
            env.pop(name, None)
        Path(env["CODEX_HOME"]).mkdir()
        Path(env["CLAUDE_CONFIG_DIR"]).mkdir()
        installed = subprocess.run([sys.executable, str(installer_path), "--client", client,
            "--origin", origin, "--workspace", str(workspace)], env=env, capture_output=True, text=True, timeout=120)
        (workspace / "install.txt").write_text(installed.stdout + installed.stderr)
        if installed.returncode:
            raise RuntimeError(installed.stderr)
        config = workspace / "codex-home/config.toml" if client == "codex" else workspace / ".claude/settings.local.json"
        before = config.read_bytes()
        repeated = subprocess.run([sys.executable, str(installer_path), "--client", client,
            "--origin", origin, "--workspace", str(workspace)], env=env, capture_output=True, text=True, timeout=120)
        (workspace / "install-repeat.txt").write_text(repeated.stdout + repeated.stderr)
        assert repeated.returncode == 0, repeated.stderr
        assert config.read_bytes() == before, "Repeating setup changed the native client configuration"
        if client == "codex":
            results.append(await codex_check(workspace, env, manifest))
        else:
            results.append(await claude_check(workspace, env))
    (evidence / "summary.json").write_text(json.dumps({"origin": origin, "results": results}, indent=2))
    print(json.dumps({"evidence": str(evidence), "results": results}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

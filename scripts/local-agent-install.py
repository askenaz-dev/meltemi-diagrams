"""Install the image's native skill+MCP plugin using the selected agent's own plugin CLI.

Python 3's standard library only. No credentials, package registry, Node installation or
direct MCP fallback. A receipt protects a prior installation and a different local instance.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

MAX_DOWNLOAD = 4 * 1024 * 1024


def local_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or
            parsed.username or parsed.password or parsed.path not in ("", "/") or
            parsed.query or parsed.fragment):
        raise ValueError("The instance must be http://127.0.0.1:<port>")
    port = parsed.port or 80
    return "http://127.0.0.1:" + str(port)


def download(url, origin):
    if not url.startswith(origin + "/"):
        raise ValueError("Refusing a download outside the local instance")
    # Redirects are never followed: even a loopback response cannot send setup elsewhere.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(
            url, timeout=20) as response:
        data = response.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError("The local plugin download is too large")
    return data


def extract_bundle(data, target):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        total = 0
        seen = set()
        entries = []
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            total += entry.file_size
            if (entry.filename.casefold() in seen or "\\" in entry.filename or path.is_absolute() or
                    not path.parts or any(p in (".", "..") or ":" in p for p in entry.filename.split("/")) or
                    (entry.external_attr >> 16) & 0o170000 == 0o120000 or
                    total > MAX_DOWNLOAD):
                raise ValueError("Unsafe local plugin archive")
            seen.add(entry.filename.casefold())
            entries.append((entry, path))
        # Validate the entire archive before writing anything.
        for entry, path in entries:
            output = target.joinpath(*path.parts)
            if entry.is_dir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.read(entry))


def run(client, arguments, workspace):
    executable = shutil.which(client)
    if not executable:
        raise ValueError(client + " is not installed; keep the handoff and install the client first")
    result = subprocess.run([executable] + arguments, cwd=workspace, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if result.returncode:
        raise ValueError(client + " " + " ".join(arguments[:3]) + " failed:\n" +
                         result.stdout[-6000:] + result.stderr[-6000:])
    return result.stdout


def installed_plugins(client, marketplace, workspace):
    arguments = ["plugin", "list", "--json"]
    if client == "codex":
        arguments += ["--marketplace", marketplace]
    result = json.loads(run(client, arguments, workspace))
    return result if isinstance(result, list) else result.get("installed", [])


def selected_plugin(plugins, selector):
    return next((row for row in plugins if row.get("id", row.get("pluginId")) == selector), None)


def normalized_path(value):
    path = str(value).replace("\\", "/").removeprefix("//?/").rstrip("/")
    return path.casefold() if sys.platform == "win32" else path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", choices=("claude", "codex"), required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--workspace", default=".")
    parser.add_argument("--project", help="The selected existing project id, otherwise the default")
    args = parser.parse_args()
    origin = local_origin(args.origin)
    workspace = Path(args.workspace).resolve(strict=True)
    manifest = json.loads(download(origin + "/agent-setup/local/manifest.json", origin))
    if manifest["origin"] != origin or manifest["mcpUrl"] != origin + "/mcp":
        raise ValueError("The instance metadata names another origin")
    project = args.project or manifest["defaultProject"]["id"]
    if len(project) != 20 or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789" for c in project):
        raise ValueError("Invalid selected project id")
    bundle = manifest["bundles"][args.client]
    data = download(bundle["url"], origin)
    digest = hashlib.sha256(data).hexdigest()
    if digest != bundle["sha256"]:
        raise ValueError("Local plugin SHA-256 mismatch")
    base = workspace / ".meltemi" / "agent-plugins" / args.client
    if not base.resolve().is_relative_to(workspace):
        raise ValueError("The plugin destination leaves the workspace through a link")
    receipt_path = base / "installed.json"
    if receipt_path.is_symlink():
        raise ValueError("The setup receipt is a link and was preserved")
    previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else None
    expected = {"origin": origin, "sha256": digest, "plugin": manifest["plugin"],
                "marketplace": manifest["marketplace"]}
    if previous and any(previous.get(k) != v for k, v in expected.items()):
        raise ValueError("A different Meltemi plugin/instance is already registered here. "
                         "It was preserved; review it before replacing it.")
    installation = base / digest[:16]
    if not installation.exists():
        temporary = base / (digest[:16] + ".partial")
        if temporary.exists():
            raise ValueError("An incomplete setup exists; inspect " + str(temporary))
        temporary.mkdir(parents=True)
        try:
            extract_bundle(data, temporary)
            temporary.rename(installation)
        except BaseException:
            shutil.rmtree(temporary)
            raise
    elif not (installation / "bundle.json").exists():
        raise ValueError("The existing plugin directory is unrecognized and was preserved")
    else:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            expected_paths = {entry.filename for entry in archive.infolist()}
            actual_paths = set()
            for installed in installation.rglob("*"):
                if installed.is_symlink():
                    raise ValueError("An installed plugin path is a link; it was preserved")
                if installed.is_file():
                    actual_paths.add(installed.relative_to(installation).as_posix())
            if actual_paths != expected_paths:
                raise ValueError("The installed plugin has added or missing files; it was preserved")
            for entry in archive.infolist():
                installed = installation.joinpath(*PurePosixPath(entry.filename).parts)
                if installed.is_symlink() or not installed.is_file() or installed.read_bytes() != archive.read(entry):
                    raise ValueError("An installed plugin file was modified; it was preserved: " + str(installed))
    selector = manifest["plugin"] + "@" + manifest["marketplace"]
    marketplace_list = json.loads(run(args.client, ["plugin", "marketplace", "list", "--json"], workspace))
    marketplaces = marketplace_list if isinstance(marketplace_list, list) else marketplace_list.get("marketplaces", [])
    registered = next((row for row in marketplaces if row.get("name") == manifest["marketplace"]), None)
    if registered is None:
        command = ["plugin", "marketplace", "add", str(installation)]
        if args.client == "claude":
            command += ["--scope", "local"]
        run(args.client, command, workspace)
    elif normalized_path(installation) != normalized_path(registered.get("root", registered.get("path", ""))):
        raise ValueError("A marketplace with the same name points elsewhere; it was preserved")
    before = selected_plugin(installed_plugins(args.client, manifest["marketplace"], workspace), selector)
    if before and before.get("enabled") is not True:
        raise ValueError("The existing Meltemi plugin is disabled; its setting was preserved")
    if before and before.get("version") != manifest["version"]:
        raise ValueError("Another Meltemi plugin version is installed; it was preserved")
    if args.client == "codex":
        connections = json.loads(run("codex", ["mcp", "list", "--json"], workspace))
        for connection in connections:
            transport = connection.get("transport", {})
            if connection.get("name") == "meltemi" and (
                    transport.get("url") != manifest["mcpUrl"] or
                    connection.get("enabled") is not True or
                    any(transport.get(key) for key in ("bearer_token_env_var", "http_headers",
                                                       "env_http_headers", "http_headers_helper"))):
                raise ValueError("An existing meltemi MCP connection conflicts; it was preserved")
    if args.client == "claude":
        if not before:
            run("claude", ["plugin", "install", selector, "--scope", "local", "--json"], workspace)
        # Installation enables the plugin. An explicit disable is a conflict, never silently undone.
        plugins = installed_plugins("claude", manifest["marketplace"], workspace)
    else:
        if not before:
            run("codex", ["plugin", "add", selector, "--json"], workspace)
        plugins = installed_plugins("codex", manifest["marketplace"], workspace)
    native = selected_plugin(plugins, selector)
    if not native or native.get("enabled") is not True:
        raise ValueError("The client did not report the plugin enabled; setup is incomplete")
    if args.client == "claude":
        connection = native.get("mcpServers", {}).get("meltemi", {})
        if connection.get("url") != manifest["mcpUrl"] or connection.get("type") != "http":
            raise ValueError("The installed Claude plugin's native MCP connection does not match")
    else:
        connections = json.loads(run("codex", ["mcp", "list", "--json"], workspace))
        connection = next((row for row in connections if row.get("name") == "meltemi"), {})
        if connection.get("transport", {}).get("url") != manifest["mcpUrl"] or connection.get("enabled") is not True:
            raise ValueError("The installed Codex plugin's native MCP connection does not match")
    handoff = {**expected, "version": manifest["version"], "revision": manifest["revision"],
               "project": project, "mcpUrl": manifest["mcpUrl"],
               "openUrl": origin + "/?project=" + project,
               "activation": "native-tools-must-be-checked-in-the-agent"}
    base.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(handoff, indent=2) + "\n")
    print(json.dumps({"installed": True, "receipt": str(receipt_path), "nativeClientState": native,
                      "continuation": "Load/reload the installed plugin in the agent. Verify its native MCP tools; "
                      "then get_project/read_files for " + project + ". No diagram has been changed."}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError, zipfile.BadZipFile,
            subprocess.TimeoutExpired) as error:
        print("local.plugin-setup: " + str(error), file=sys.stderr)
        sys.exit(1)

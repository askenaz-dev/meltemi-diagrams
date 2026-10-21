// The integration suite, run inside VS Code by test-electron. No test framework: each test is an
// async function, failures are collected and reported, and `run` rejects when any test fails.
const assert = require("node:assert/strict");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const vscode = require("vscode");

const workspace = process.env.MELTEMI_TEST_WORKSPACE;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `check` returns a truthy value, or fails after `timeout` ms. */
async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

const file = (name) => vscode.Uri.file(join(workspace, name));
const canvasTabs = () =>
  vscode.window.tabGroups.all.flatMap((g) =>
    g.tabs.filter(
      (t) => t.input instanceof vscode.TabInputCustom && t.input.viewType === "meltemi.canvas",
    ),
  );
const canvasFor = (uri) => canvasTabs().find((t) => t.input.uri.toString() === uri.toString());
let api;

async function open(name) {
  const document = await vscode.workspace.openTextDocument(file(name));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  return { document, editor };
}

test("activates for .meltemi files", async () => {
  const { document } = await open("checkout.meltemi");
  assert.equal(document.languageId, "meltemi");
  const extension = vscode.extensions.getExtension("meltemi.meltemi-diagrams");
  assert.ok(extension, "the extension is installed");
  api = await extension.activate();
  assert.ok(api.analyses && api.host, "the extension exposes its analyses");
});

test("opens the canvas beside the code", async () => {
  const { document, editor } = await open("checkout.meltemi");
  const tab = await until(() => canvasFor(document.uri), "the canvas beside the text");
  assert.notEqual(tab.group.viewColumn, editor.viewColumn);
  await until(
    () => api.host.panels.get(document.uri)?.session.current === "checkout",
    "the first render",
  );
});

test("publishes diagnostics as you type and clears them", async () => {
  const uri = file("manual.meltemi");
  writeFileSync(
    uri.fsPath,
    'diagram m: flow {\n  layout manual\n  a["A"]\n  placement { place a at (0, 0) }\n}\n',
  );
  const { document, editor } = await open("manual.meltemi");
  await editor.edit((e) => e.insert(new vscode.Position(2, 8), "\n  a -> ghost"));
  await until(
    () =>
      vscode.languages
        .getDiagnostics(document.uri)
        .some((d) => d.code === "layout.missing-placement"),
    "layout.missing-placement",
  );
  await vscode.commands.executeCommand("undo");
  await until(
    () => vscode.languages.getDiagnostics(document.uri).length === 0,
    "the diagnostic to clear",
  );
});

test("answers every language provider", async () => {
  const { document } = await open("checkout.meltemi");
  const at = (text, delta = 0) => document.positionAt(document.getText().indexOf(text) + delta);
  const completions = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    document.uri,
    at("layout assisted", 7),
  );
  assert.ok(
    completions.items.some((i) => i.label === "manual"),
    "layout values",
  );
  const hovers = await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    document.uri,
    at("api -> orders"),
  );
  const hoverText = hovers
    .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
    .join(" ");
  assert.ok(hoverText.includes("API Gateway"), `element hover: ${hoverText}`);
  const symbols = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    document.uri,
  );
  assert.equal(symbols[0].name, "checkout");
  const definition = await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    document.uri,
    at("api -> orders"),
  );
  assert.equal(definition[0].range.start.line, at('api["API').line);
  const references = await vscode.commands.executeCommand(
    "vscode.executeReferenceProvider",
    document.uri,
    at("api -> orders"),
  );
  assert.ok(references.length >= 4, "references to api");
  const rename = await vscode.commands.executeCommand(
    "vscode.executeDocumentRenameProvider",
    document.uri,
    at("api -> orders"),
    "gateway",
  );
  assert.ok(rename.get(document.uri).length >= 4, "rename edits");
  const formatting = await vscode.commands.executeCommand(
    "vscode.executeFormatDocumentProvider",
    document.uri,
    { tabSize: 2, insertSpaces: true },
  );
  assert.ok(Array.isArray(formatting ?? []), "formatting answers");
  const tokens = await vscode.commands.executeCommand(
    "vscode.provideDocumentSemanticTokens",
    document.uri,
  );
  assert.ok(tokens.data.length > 0, "semantic tokens");
  const actions = await vscode.commands.executeCommand(
    "vscode.executeCodeActionProvider",
    document.uri,
    new vscode.Range(at("client -> api"), at("client -> api")),
  );
  assert.ok(
    actions.some((a) => a.title.startsWith("Arrange diagram")),
    `refactors: ${actions.map((a) => a.title).join(", ")}`,
  );
});

test("applies a canvas edit as one undo step of the text", async () => {
  const { document } = await open("checkout.meltemi");
  const panel = await until(() => api.host.panels.get(document.uri), "the canvas");
  await until(() => panel.session.current === "checkout", "a render");
  const before = document.getText();
  const probe = panel.session.receive({
    type: "action",
    revision: document.version,
    action: { kind: "move", ids: ["api"], delta: { x: 14, y: 0 } },
  });
  const problems = api.analyses
    .get(document)
    .diagnostics.map((d) => `${d.code}: ${d.message}`)
    .join("; ");
  assert.ok(probe.plan, `a plan for the move: ${JSON.stringify(probe.messages)} — ${problems}`);
  await panel.receive({
    type: "action",
    revision: document.version,
    action: { kind: "move", ids: ["api"], delta: { x: 14, y: 0 } },
  });
  await until(() => document.getText().includes("place api at (374, 180)"), "the move in the text");
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  await vscode.commands.executeCommand("undo");
  await until(() => document.getText() === before, "the undo");
});

test("remembers that the canvas was closed", async () => {
  const { document } = await open("checkout.meltemi");
  const tab = await until(() => canvasFor(document.uri), "the canvas");
  await vscode.window.tabGroups.close(tab);
  await sleep(900);
  const { document: other } = await open("annotations.meltemi");
  await sleep(1500);
  assert.equal(canvasFor(other.uri), undefined, "no canvas after the user closed one");
  await vscode.commands.executeCommand("meltemi.openCanvasToSide");
  await until(() => canvasFor(other.uri), "the canvas after Open Canvas to the Side");
});

test("exports, arranges and formats from commands", async () => {
  const { document } = await open("annotations.meltemi");
  await vscode.commands.executeCommand("meltemi.exportSvg");
  const svg = join(workspace, "annotations.svg");
  await until(() => existsSync(svg), "annotations.svg");
  assert.ok(readFileSync(svg, "utf8").startsWith("<svg"));

  const uri = file("unplaced.meltemi");
  writeFileSync(
    uri.fsPath,
    'diagram u: flow {\n  layout manual\n  a["A"]\n  b["B"]\n  a -> b\n  placement { place a at (100, 100) }\n}\n',
  );
  const { document: unplaced } = await open("unplaced.meltemi");
  await vscode.window.showTextDocument(unplaced, vscode.ViewColumn.One);
  const arranged = await vscode.commands.executeCommand("meltemi.arrangeUnplaced", unplaced.uri);
  assert.equal(arranged, "arranged");
  await until(
    () => /place b at \(/.test(unplaced.getText()),
    `a place for b in
${unplaced.getText()}`,
  );

  const messy = file("messy.meltemi");
  writeFileSync(messy.fsPath, 'diagram x: flow {\n      a["A"]\n}\n');
  const { document: formatted } = await open("messy.meltemi");
  await vscode.commands.executeCommand("meltemi.formatDocument");
  await until(() => formatted.getText().includes('\n  a["A"]\n'), "the formatted text");
  assert.ok(document.getText().length > 0);
});

test("exports PNG and PDF through the browser and runs export profiles", async () => {
  const uri = file("profiles.meltemi");
  writeFileSync(
    uri.fsPath,
    'diagram d: flow {\n  layout manual\n  a["A"] { url "https://example.com/a" }\n  b["B"]\n  a -> b\n  placement {\n    place a at (100, 80)\n    place b at (360, 80)\n  }\n}\n\nexport slide for d {\n  format png\n  scale 1\n  background transparent\n  file "out/slide.png"\n}\n',
  );
  const { document } = await open("profiles.meltemi");
  const pngs = await vscode.commands.executeCommand("meltemi.exportPng", document.uri);
  assert.equal(pngs.length, 1);
  const png = readFileSync(pngs[0].fsPath);
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
  const pdfs = await vscode.commands.executeCommand("meltemi.exportPdf", document.uri);
  assert.ok(
    readFileSync(pdfs[0].fsPath).toString("latin1").includes("/URI (https://example.com/a)"),
  );
  const written = await vscode.commands.executeCommand(
    "meltemi.runExportProfile",
    document.uri,
    "slide",
  );
  assert.ok(written[0].fsPath.replace(/\\/g, "/").endsWith("out/slide.png"));
  // 1 × the drawing: the PNG header holds its width.
  assert.ok(readFileSync(written[0].fsPath).readUInt32BE(16) > 0);
});

test("records a video of a diagram", async () => {
  const { document } = await open("profiles.meltemi");
  const written = await vscode.commands.executeCommand(
    "meltemi.exportVideo",
    document.uri,
    "gif",
    "d",
    1000,
  );
  assert.equal(written.length, 1);
  assert.ok(written[0].fsPath.endsWith("profiles.d.gif"));
  assert.equal(readFileSync(written[0].fsPath).subarray(0, 6).toString("latin1"), "GIF89a");
});

test("builds the catalog of a project", async () => {
  const root = join(workspace, "catalogued");
  require("node:fs").mkdirSync(join(root, "views"), { recursive: true });
  writeFileSync(
    join(root, "project.json"),
    '{ "name": "catalogued", "language": "0.2", "catalog": { "title": "Shop views" } }',
  );
  writeFileSync(
    join(root, "views", "shop.meltemi"),
    'language "0.2"\n\n// not for the catalog\ndiagram shop: flow {\n  title "Shop"\n  web["Web"]\n  api["API"]\n  web -> api: "HTTPS" as call\n}\n',
  );
  const written = await vscode.commands.executeCommand(
    "meltemi.buildCatalog",
    vscode.Uri.file(root),
  );
  assert.ok(written.fsPath.endsWith(join("catalogued", "catalog", "index.html")));
  const html = readFileSync(written.fsPath, "utf8");
  assert.ok(html.includes("<title>Shop views</title>"));
  assert.ok(html.includes('"key":"views/shop/shop"'));
  assert.ok(!html.includes("not for the catalog"));
  assert.ok(html.includes('id="meltemi-catalog"') && html.includes("meltemiCatalog"));
});

test("changes a file with AI as one undo step, and adds relations as assumptions", async () => {
  const http = require("node:http");
  const answers = [];
  const bodies = [];
  const server = http.createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      bodies.push(JSON.parse(text));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: answers.shift() ?? "{}" }, finish_reason: "stop" }],
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const config = vscode.workspace.getConfiguration("meltemi.assist");
  await config.update("provider", "openai-compatible", vscode.ConfigurationTarget.Workspace);
  await config.update("model", "local", vscode.ConfigurationTarget.Workspace);
  await config.update(
    "baseUrl",
    `http://127.0.0.1:${server.address().port}/v1`,
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    const original = 'diagram shop: flow {\n  web["Web"]\n  api["API"]\n  web -> api as call\n}\n';
    writeFileSync(join(workspace, "assisted.meltemi"), original);
    const { document } = await open("assisted.meltemi");
    answers.push(
      JSON.stringify({
        summary: "Adds a cache",
        changes: [
          {
            action: "replace",
            block: "diagram shop",
            text: 'diagram shop: flow {\n  web["Web"]\n  api["API"]\n  cache[("Cache")]\n  web -> api as call\n  api -> cache as read\n}',
            reason: "Reads are cached",
          },
        ],
      }),
    );
    const applied = await vscode.commands.executeCommand("meltemi.assistModify", document.uri, {
      instruction: "Add a cache",
      accept: "all",
      confirm: true,
    });
    assert.deepEqual(applied, [1]);
    assert.ok(document.getText().includes('cache[("Cache")]'));
    assert.ok(bodies[0].messages[1].content.includes('<file path="assisted.meltemi">'));
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("undo");
    assert.equal(document.getText(), original);

    answers.push(
      JSON.stringify({
        relations: [
          {
            block: "diagram shop",
            from: "api",
            to: "web",
            label: "Answers",
            reason: "Calls get answers",
          },
        ],
      }),
    );
    const suggested = await vscode.commands.executeCommand(
      "meltemi.assistRelations",
      document.uri,
      {
        accept: "all",
        confirm: true,
      },
    );
    assert.deepEqual(suggested, [1]);
    assert.ok(
      document.getText().includes('api -> web: "Answers" { assumption "Calls get answers" }'),
    );
    await vscode.commands.executeCommand("workbench.action.files.save");

    answers.push(
      JSON.stringify({
        summary: "A flow",
        file: 'language "0.2"\n\ndiagram fresh: flow {\n  a -> b\n}\n',
      }),
    );
    const created = await vscode.commands.executeCommand(
      "meltemi.assistGenerate",
      file("fresh.meltemi"),
      {
        instruction: "Two boxes",
        profile: "flow",
        accept: "all",
        confirm: true,
      },
    );
    assert.deepEqual(created, [1]);
    assert.ok(
      readFileSync(join(workspace, "fresh.meltemi"), "utf8").includes("diagram fresh: flow"),
    );
  } finally {
    await config.update("provider", undefined, vscode.ConfigurationTarget.Workspace);
    await config.update("model", undefined, vscode.ConfigurationTarget.Workspace);
    await config.update("baseUrl", undefined, vscode.ConfigurationTarget.Workspace);
    server.close();
  }
});

test("exports a scenario of a sequence diagram after asking for it", async () => {
  const uri = file("payment.meltemi");
  writeFileSync(
    uri.fsPath,
    'diagram payment: sequence {\n  customer -> api: "Pay" as pay\n  alt result "Approved" {\n    api --> customer: "OK" as ok\n  } else "Declined" {\n    api --> customer: "No" as no\n  }\n  scenario approved "Approved" {\n    choose result "Approved"\n  }\n}\n',
  );
  const { document } = await open("payment.meltemi");
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  // The user picks the scenario in the quick pick.
  const original = vscode.window.showQuickPick;
  let offered;
  vscode.window.showQuickPick = async (items) => {
    offered = (await items).map((i) => i.label);
    return (await items).find((i) => i.label === "approved");
  };
  try {
    await vscode.commands.executeCommand("meltemi.exportSvg");
  } finally {
    vscode.window.showQuickPick = original;
  }
  assert.deepEqual(offered, ["All events", "approved"]);
  const svg = join(workspace, "payment.approved.svg");
  await until(() => existsSync(svg), "payment.approved.svg");
  const written = readFileSync(svg, "utf8");
  assert.ok(written.includes("OK"));
  assert.ok(!written.includes(">No<"));
});

test("follows and renames model entities across the files of a project", async () => {
  const { mkdirSync } = require("node:fs");
  const root = join(workspace, "arch");
  mkdirSync(join(root, "models"), { recursive: true });
  mkdirSync(join(root, "diagrams"), { recursive: true });
  writeFileSync(join(root, "project.json"), '{ "name": "arch", "language": "0.2" }\n');
  writeFileSync(
    join(root, "models", "commerce.meltemi"),
    'model commerce {\n  person customer "Cliente"\n  system shop "Commerce" {\n    container web "Web"\n    container api "API"\n  }\n  customer -> shop.web as visit\n  shop.web -> shop.api as request\n}\n',
  );
  writeFileSync(
    join(root, "diagrams", "containers.meltemi"),
    'import commerce from "../models/commerce.meltemi"\n\ndiagram containers: c4 using commerce {\n  level container\n  scope shop\n  label shop.api "Orders"\n}\n',
  );
  const view = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(root, "diagrams", "containers.meltemi")),
  );
  await vscode.window.showTextDocument(view, vscode.ViewColumn.One);
  const at = view.getText().indexOf("shop.api") + "shop.".length + 1;
  const locations = await until(async () => {
    const found = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      view.uri,
      view.positionAt(at),
    );
    return found && found.length > 0 ? found : undefined;
  }, "the definition in the model");
  assert.ok(locations[0].uri.fsPath.endsWith("commerce.meltemi"));
  const edit = await vscode.commands.executeCommand(
    "vscode.executeDocumentRenameProvider",
    view.uri,
    view.positionAt(at),
    "orders",
  );
  assert.ok(edit.entries().length >= 2, "the rename edits the model and the view");
  assert.ok(await vscode.workspace.applyEdit(edit));
  const model = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(root, "models", "commerce.meltemi")),
  );
  assert.ok(model.getText().includes('container orders "API"'));
  assert.ok(model.getText().includes("shop.web -> shop.orders"));
  assert.ok(view.getText().includes('label shop.orders "Orders"'));
  await vscode.window.showTextDocument(view, vscode.ViewColumn.One);
  const opened = await vscode.commands.executeCommand("meltemi.openModel", view.uri);
  assert.ok(String(opened).endsWith("commerce.meltemi"));
  assert.ok(vscode.window.activeTextEditor.document.uri.fsPath.endsWith("commerce.meltemi"));
});

test("follows, finds and renames story targets across the files of a project", async () => {
  const { mkdirSync } = require("node:fs");
  const root = join(workspace, "tour");
  mkdirSync(join(root, "diagrams"), { recursive: true });
  mkdirSync(join(root, "stories"), { recursive: true });
  writeFileSync(join(root, "project.json"), '{ "name": "tour", "language": "0.2" }\n');
  writeFileSync(
    join(root, "diagrams", "checkout.meltemi"),
    'language "0.2"\ndiagram checkout: flow {\n  node api\n  node db\n  api -> db as save\n}\n',
  );
  writeFileSync(
    join(root, "stories", "tour.meltemi"),
    'language "0.2"\nimport checkout from "../diagrams/checkout.meltemi"\n\nstory tour for checkout {\n  scene one {\n    reveal api, db\n    trace save\n  }\n}\n',
  );
  const story = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(root, "stories", "tour.meltemi")),
  );
  await vscode.window.showTextDocument(story, vscode.ViewColumn.One);
  const at = story.getText().indexOf("db");
  const locations = await until(async () => {
    const found = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      story.uri,
      story.positionAt(at),
    );
    return found && found.length > 0 ? found : undefined;
  }, "the definition in the diagram's file");
  assert.ok(locations[0].uri.fsPath.endsWith("checkout.meltemi"));
  const uses = await vscode.commands.executeCommand(
    "vscode.executeReferenceProvider",
    story.uri,
    story.positionAt(at),
  );
  assert.deepEqual(uses.map((u) => u.uri.fsPath.split(/[\\/]/).pop()).sort(), [
    "checkout.meltemi",
    "checkout.meltemi",
    "tour.meltemi",
  ]);
  const symbols = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    story.uri,
  );
  assert.deepEqual(
    symbols.map((s) => [s.name, s.children.map((c) => c.name)]),
    [["tour", ["one"]]],
  );
  const edit = await vscode.commands.executeCommand(
    "vscode.executeDocumentRenameProvider",
    story.uri,
    story.positionAt(at),
    "store",
  );
  assert.ok(await vscode.workspace.applyEdit(edit));
  const diagram = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(root, "diagrams", "checkout.meltemi")),
  );
  assert.ok(diagram.getText().includes("node store"));
  assert.ok(diagram.getText().includes("api -> store as save"));
  assert.ok(story.getText().includes("reveal api, store"));
  // The story plays in an HTML page written beside it.
  await vscode.workspace.saveAll();
  const written = await vscode.commands.executeCommand("meltemi.exportPlayer", story.uri, "tour");
  assert.ok(written.fsPath.endsWith("tour.tour.html"));
  const page = readFileSync(written.fsPath, "utf8");
  assert.ok(page.startsWith("<!doctype html>"));
  assert.ok(page.includes('"format":"meltemi-player"'));
  assert.ok(page.includes("customElements"));
  // A project without a `locale` writes English pages.
  assert.ok(page.includes('<html lang="en">'));
});

test("converts to a free composition and follows links", async () => {
  const uri = file("convert.meltemi");
  writeFileSync(uri.fsPath, readFileSync(file("checkout.meltemi").fsPath, "utf8"));
  const { document } = await open("convert.meltemi");
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const id = await vscode.commands.executeCommand("meltemi.convertToFree", document.uri);
  assert.equal(id, "checkout_free");
  await until(() => document.getText().includes("diagram checkout_free: free {"), "the copy");
  const panel = api.host.panels.get(document.uri);
  if (panel) await until(() => panel.session.current === "checkout_free", "the canvas on the copy");
  const text = document.getText();
  const link = text.indexOf("link checkout.api") + "link checkout.".length;
  const locations = await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    document.uri,
    document.positionAt(link + 1),
  );
  assert.equal(locations.length, 1);
  assert.equal(
    document.offsetAt(locations[0].range.start),
    text.indexOf('api["API Gateway"]'),
    "the definition of a link is the linked element",
  );
});

test("converts a Mermaid file and shows its findings on the source", async () => {
  const source = file("checkout-flow.mmd");
  writeFileSync(
    source.fsPath,
    "flowchart LR\n  cart[Cart] --> pay{Paid?}\n  pay --> retry[\\Retry\\]\n  retry --> hold{{Hold}}\n",
  );
  const outcome = await vscode.commands.executeCommand("meltemi.convertToMeltemi", source);
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.written, true);
  const target = file("checkout-flow.meltemi");
  assert.equal(outcome.target, target.toString());
  const imported = readFileSync(target.fsPath, "utf8");
  assert.ok(imported.includes("diagram checkout_flow: flow {"));
  assert.ok(imported.includes("style hold { shape hexagon }"), "the hexagon is kept");
  await until(() => canvasFor(target), "the canvas of the imported sheet");
  const problems = vscode.languages
    .getDiagnostics(source)
    .filter((d) => d.source === "meltemi-import");
  assert.equal(problems.length, 1, "the mirrored parallelogram is approximated");
  assert.equal(problems[0].range.start.line, 2);
  assert.equal(problems[0].severity, vscode.DiagnosticSeverity.Information);
});

test("re-imports into an existing sheet, keeping its placement", async () => {
  const source = file("checkout-flow.mmd");
  const target = file("checkout-flow.meltemi");
  const document = await vscode.workspace.openTextDocument(target);
  const adjusted = document
    .getText()
    .replace("layout auto", "layout assisted")
    .replace(/\n}\n$/, "\n  placement {\n    place cart at (100, 100)\n  }\n}\n");
  const edit = new vscode.WorkspaceEdit();
  edit.replace(target, new vscode.Range(0, 0, document.lineCount, 0), adjusted);
  await vscode.workspace.applyEdit(edit);
  await document.save();
  writeFileSync(source.fsPath, "flowchart LR\n  cart[Cart] --> pay{Paid?}\n  pay --> done[Done]\n");
  const outcome = await vscode.commands.executeCommand(
    "meltemi.importDiagram",
    source,
    target,
    "merge",
  );
  assert.equal(outcome.merged, true);
  const text = await until(() => {
    const t = readFileSync(target.fsPath, "utf8");
    return t.includes("node done") ? t : null;
  }, "the merged sheet");
  assert.ok(text.includes("place cart at (100, 100)"), "the placement is kept");
  assert.ok(text.includes("layout assisted"), "the layout mode is kept");
  assert.ok(!text.includes("retry"), "the removed node is gone");
  const cancelled = await vscode.commands.executeCommand(
    "meltemi.importDiagram",
    source,
    target,
    "cancel",
  );
  assert.equal(cancelled.status, "cancelled");
});

test("imports a selection of a Markdown file", async () => {
  const markdown = file("notes.md");
  writeFileSync(markdown.fsPath, "# Notes\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n");
  const document = await vscode.workspace.openTextDocument(markdown);
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  editor.selection = new vscode.Selection(3, 0, 5, 0);
  const target = file("notes-sequence.meltemi");
  const outcome = await vscode.commands.executeCommand(
    "meltemi.importSelection",
    target,
    "replace",
  );
  assert.equal(outcome.status, "complete");
  assert.ok(readFileSync(target.fsPath, "utf8").includes("diagram notes: sequence {"));
});

test("speaks the language of meltemi.language in messages and canvases", async () => {
  const extension = vscode.extensions.getExtension("meltemi.meltemi-diagrams");
  const setting = extension.packageJSON.contributes.configuration.properties["meltemi.language"];
  assert.deepEqual(setting.enum, ["auto", "en", "es"]);
  assert.equal(setting.default, "auto");
  assert.equal(vscode.workspace.getConfiguration("meltemi").get("language"), "auto");
  // The contributions read their words from package.nls.json in an English VS Code.
  const command = extension.packageJSON.contributes.commands.find(
    (c) => c.command === "meltemi.openCanvasToSide",
  );
  assert.equal(command.title, "Open Canvas to the Side");

  const { document } = await open("checkout.meltemi");
  await vscode.commands.executeCommand("meltemi.openCanvasToSide", document.uri);
  const canvas = await until(() => api.host.panels.get(document.uri), "the canvas");
  const lang = (code) => canvas.panel.webview.html.includes(`<html lang="${code}">`);
  assert.ok(lang("en"), "an English page");
  // Without a C4 view, Open the Model says why, and returns what it said.
  const english = "Show a C4 view whose model resolves to open the model.";
  assert.equal(await vscode.commands.executeCommand("meltemi.openModel", document.uri), english);

  // The page the canvas loads again posts `ready`, which the session answers with a drawing.
  const posted = [];
  const webview = canvas.panel.webview;
  const post = webview.postMessage;
  webview.postMessage = (message) => {
    posted.push(message);
    return post.call(webview, message);
  };
  const config = vscode.workspace.getConfiguration("meltemi");
  try {
    await config.update("language", "es", vscode.ConfigurationTarget.Workspace);
    await until(() => lang("es"), "the canvas page in Spanish");
    assert.ok(canvas.panel.webview.html.includes("<title>Lienzo de Meltemi</title>"));
    assert.equal(
      await vscode.commands.executeCommand("meltemi.openModel", document.uri),
      "Para abrir el modelo, muestra una vista C4 cuyo modelo se pueda resolver.",
    );
    await until(
      () => posted.some((m) => m.type === "settings") && posted.some((m) => m.type === "render"),
      "the settings and a drawing for the new page",
      20000,
    );
  } finally {
    webview.postMessage = post;
    await config.update("language", undefined, vscode.ConfigurationTarget.Workspace);
  }
  await until(() => lang("en"), "the canvas page in English again");
  assert.equal(await vscode.commands.executeCommand("meltemi.openModel", document.uri), english);
});

test("makes the diagnostics of open documents again in the language of meltemi.language", async () => {
  writeFileSync(
    file("words.meltemi").fsPath,
    'diagram words: flow {\n  layout auto\n  x["X"]\n  style x { colour red }\n}\n',
  );
  const { document } = await open("words.meltemi");
  const problems = () => vscode.languages.getDiagnostics(document.uri);
  const where = (d) => `${d.code}@${d.range.start.line}:${d.range.start.character}`;
  const unknown = () => problems().find((d) => d.code === "prop.unknown");
  await until(unknown, "prop.unknown");
  const english = new Map(problems().map((d) => [where(d), d.message]));
  const colour = document.positionAt(document.getText().indexOf("colour"));
  const titles = async () =>
    (
      await vscode.commands.executeCommand(
        "vscode.executeCodeActionProvider",
        document.uri,
        new vscode.Range(colour, colour),
      )
    ).map((a) => a.title);
  const layout = document.positionAt(document.getText().indexOf("layout"));
  const hoverText = async () =>
    (await vscode.commands.executeCommand("vscode.executeHoverProvider", document.uri, layout))
      .flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)))
      .join(" ");
  assert.ok((await titles()).includes("Change to `color`"), (await titles()).join(", "));
  assert.ok((await hoverText()).includes("ELK arranges everything"));

  const config = vscode.workspace.getConfiguration("meltemi");
  try {
    await config.update("language", "es", vscode.ConfigurationTarget.Workspace);
    // Made again, not published again: the words change, the codes and ranges do not.
    await until(
      () => unknown() && unknown().message !== english.get(where(unknown())),
      "the diagnostics in Spanish",
    );
    const spanish = problems();
    assert.deepEqual(spanish.map(where).sort(), [...english.keys()].sort());
    for (const d of spanish) assert.notEqual(d.message, english.get(where(d)), where(d));
    assert.ok(unknown().message.includes("`colour`"), unknown().message);
    // Hovers and code actions follow too.
    assert.ok((await titles()).includes("Cambiar a `color`"), (await titles()).join(", "));
    assert.ok((await hoverText()).includes("ELK organiza todo"));
  } finally {
    await config.update("language", undefined, vscode.ConfigurationTarget.Workspace);
  }
  await until(
    () =>
      problems().length === english.size &&
      problems().every((d) => d.message === english.get(where(d))),
    "the diagnostics in English again",
  );
  assert.ok((await titles()).includes("Change to `color`"));
});

test("writes the HTML player in the language of its project", async () => {
  const { mkdirSync } = require("node:fs");
  const root = join(workspace, "espanol");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "project.json"),
    '{ "name": "espanol", "language": "0.2", "locale": "es" }\n',
  );
  writeFileSync(
    join(root, "pulse.meltemi"),
    'language "0.2"\ndiagram pulse: flow {\n  a -> b as r\n  animate r { effect flow }\n}\n',
  );
  const uri = vscode.Uri.file(join(root, "pulse.meltemi"));
  await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(uri),
    vscode.ViewColumn.One,
  );
  // The interface stays English: the page takes the project's content language.
  assert.equal(vscode.workspace.getConfiguration("meltemi").get("language"), "auto");
  const written = await vscode.commands.executeCommand("meltemi.exportPlayer", uri);
  assert.ok(written.fsPath.endsWith("pulse.html"), written.fsPath);
  const page = readFileSync(written.fsPath, "utf8");
  assert.ok(page.includes('<html lang="es">'), page.slice(0, 120));
});

exports.run = async function run() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed++;
      console.log(
        `  ✗ ${name}\n    ${String(error && error.stack ? error.stack : error)
          .split("\n")
          .join("\n    ")}`,
      );
    }
  }
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} VS Code test${failed === 1 ? "" : "s"} failed`);
};

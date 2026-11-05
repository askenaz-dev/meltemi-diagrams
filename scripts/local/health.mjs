import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "node:http";

try {
  const data = process.env.MELTEMI_DATA ?? "/data";
  const ready = JSON.parse(await readFile(join(data, "ready.json"), "utf8"));
  // fetch does not let callers replace Host. The external port can differ from the private one.
  const body = await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: ready.port,
        path: "/healthz",
        headers: { Host: new URL(ready.origin).host },
      },
      (response) => {
        let content = "";
        response.setEncoding("utf8");
        response.on("data", (part) => {
          content += part;
        });
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) throw new Error("Not ready");
            resolve(JSON.parse(content));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(4000, () => req.destroy(new Error("Readiness timed out")));
    req.on("error", reject);
    req.end();
  });
  if (!body.ready || body.mode !== "local-single-user" || !body.defaultProject?.id)
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
}

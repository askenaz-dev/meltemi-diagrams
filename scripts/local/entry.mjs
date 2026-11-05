const operation = process.argv[2] ?? "start";
try {
  if (operation === "start") {
    const { startLocal } = await import("./runtime.mjs");
    const app = await startLocal();
    process.once("SIGINT", () => void app.stop());
    process.once("SIGTERM", () => void app.stop());
  } else if (operation === "backup" || operation === "restore") {
    const { operate } = await import("./operations.mjs");
    await operate(operation, process.argv.slice(3));
  } else throw new Error("Expected start, backup <archive> or restore <archive>.");
} catch (error) {
  console.error(`Meltemi local: ${error.message}`);
  process.exitCode = 1;
}

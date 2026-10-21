#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { CLI_NAME, run } from "./cli.js";
import { messages } from "./messages/index.js";
import { redactSecrets } from "./redact.js";

const redact = (message: string) => redactSecrets(message, process.env);

/** The most standard input is read for: a token is a few dozen characters. */
const MAX_INPUT = 8 * 1024;

/**
 * What a person or a pipe gives `login --token`: one line typed at a terminal, else the first
 * kilobytes of standard input. The token never comes from an argument.
 */
async function readStandardInput(): Promise<string> {
  if (process.stdin.isTTY) {
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await terminal.question(messages().cloud.login.tokenPrompt);
    } finally {
      terminal.close();
    }
  }
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > MAX_INPUT) break;
  }
  return text.slice(0, MAX_INPUT);
}

process.on("uncaughtException", (error) => {
  process.stderr.write(`${messages().common.internalError(CLI_NAME, redact(error.message))}\n`);
  if (process.env.MELTEMI_DEBUG) process.stderr.write(`${redact(error.stack ?? "")}\n`);
  process.exit(70);
});

process.exitCode = await run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  env: process.env,
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  stdin: readStandardInput,
  // Only a person at a terminal can answer.
  ...(process.stdin.isTTY
    ? {
        ask: async (question: string) => {
          const terminal = createInterface({ input: process.stdin, output: process.stderr });
          try {
            return await terminal.question(question);
          } finally {
            terminal.close();
          }
        },
      }
    : {}),
});

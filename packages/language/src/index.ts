export const PACKAGE_NAME = "@meltemi/diagrams-language";
/** Version of the `.meltemi` language implemented by this package. */
export const LANGUAGE_VERSION = "0.2";

export * from "./positions.js";
export * from "./diagnostics.js";
export * from "./tokens.js";
export * from "./lexer.js";
export * from "./cst.js";
export * from "./parser.js";
export * from "./text-edits.js";
export * from "./diff.js";
export * from "./format.js";

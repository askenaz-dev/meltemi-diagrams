import type { BlockKind } from "../program.js";

const code = (value: string) => `\`${value}\``;
/** A reason that follows a colon, started in lower case. */
const lower = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** A part of Meltemi Diagrams a plugin declares compatibility with, and what it needs of it. */
export interface PluginFailure {
  readonly part: "model" | "renderer";
  /** The version this tool has. */
  readonly version: string;
  /** The range the plugin declares. */
  readonly needs: string;
}

/**
 * The words of projects in English: what the tool says about `project.json`, plugins, imports,
 * references across files, assets and the bounds of a project. They are written in the interface
 * language when a diagnostic or a refusal is made, so they are read at that moment, never at
 * module load. Sentences with values are functions, so each language builds its own grammar; code
 * in them (fields, keywords, ids, paths, samples) stays as written.
 */
export const en = {
  /** The messages of diagnostics; the code of each is in its comment or its group's. */
  diagnostics: {
    /** `project.json`: `project.invalid-value` unless the comment says otherwise. */
    manifest: {
      /** `limit.too-large`. */
      tooLarge: (characters: number, max: number) =>
        `project.json has ${characters} characters; it may have at most ${max}.`,
      /** `project.invalid-json`, with the parser's reason. */
      invalidJson: (reason: string) => `project.json is not valid JSON: ${reason}`,
      notAnObject: "project.json must contain a JSON object.",
      /** `sources` or `exclude` that is not an array. */
      pathList: (field: string) => `${code(field)} must be an array of relative paths.`,
      emptyPath: (field: string) => `Each entry of ${code(field)} must be a non-empty path.`,
      outsidePath: (value: string) =>
        `${code(value)} is not a path inside the project; use a path relative to project.json.`,
      catalogObject: '`catalog` must be an object such as `{ "title": "Architecture" }`.',
      catalogText: (setting: "title" | "description") =>
        `${code(setting)} must be ${setting === "title" ? "a non-empty string" : "a string"}.`,
      catalogOut:
        "`out` must be a folder or a .html file inside the project, relative to project.json.",
      catalogExcludeList: "`exclude` must be an array of relative paths or `<file>#<id>` entries.",
      catalogExcludeEntry:
        "Each entry of `exclude` is a folder or file inside the project, or `<file>.meltemi#<id>`.",
      catalogSource: "`source` must be true or false.",
      /** `project.unknown-field`. */
      unknownCatalogSetting: (setting: string) => `Unknown catalog setting ${code(setting)}.`,
      /** `cloud` that is not an object, or lacks `host` or `project`: both keys are named. */
      cloudObject:
        '`cloud` must be an object with `host` and `project`, such as `{ "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }`.',
      cloudHost:
        "`host` must be the address of the service: an https: origin such as `https://diagrams.meltemi.dev` (http: only for 127.0.0.1, localhost or [::1]).",
      cloudProject:
        "`project` must be the id of a cloud project: 20 lower-case letters and digits.",
      /** `project.unknown-field`. */
      unknownCloudSetting: (setting: string) => `Unknown cloud setting ${code(setting)}.`,
      setTwice: (field: string) => `${code(field)} is set twice.`,
      schema: "`$schema` must be a string.",
      name: "`name` must be a non-empty string.",
      languageText: "`language` must be a version string.",
      languageUnsupported: (written: string, implemented: string) =>
        `Language "${written}" is not supported; this tool implements ${implemented}.`,
      toolsObject: "`tools` must be an object of version ranges.",
      /** `project.unknown-field`. */
      unknownTool: (tool: string, only: string) =>
        `Unknown tool ${code(tool)}; the only tool is ${code(only)}.`,
      versionRange: "The version range cannot be read.",
      /** `project.tool-version`: the tool, the range the project requires, this version. */
      toolVersion: (tool: string, range: string, version: string) =>
        `The project requires ${tool} ${range}, but this is version ${version}.`,
      formatObject: '`format` must be an object such as `{ "indent": 2 }`.',
      /** `project.unknown-field`. */
      unknownFormatSetting: (setting: string) =>
        `Unknown format setting ${code(setting)}; the only setting is \`indent\`.`,
      indent: '`indent` must be a whole number of spaces from 1 to 8, or "tab".',
      themeText: "`theme` must be a string.",
      themeName: (value: string) =>
        `"${value}" is neither a built-in theme nor \`<path>#<theme id>\`.`,
      themeId: (id: string) => `"${id}" is not a theme id.`,
      themeFile: (path: string) => `"${path}" is not a .meltemi file.`,
      themeOutside: (path: string) =>
        `"${path}" is not a path inside the project; use a path relative to project.json.`,
      /** The theme of `theme` whose file does not declare it. */
      themeNotDeclared: (path: string, id: string) =>
        `${code(path)} does not declare a theme ${code(id)}.`,
      /** The file of `theme` that does not exist. */
      themeFileMissing: (path: string) => `${code(path)} does not exist.`,
      /** The languages `locale` accepts. */
      locale: (locales: readonly string[]) =>
        `\`locale\` must be ${locales.map((l) => `"${l}"`).join(" or ")}.`,
      iconsObject: '`icons` must be an object of aliases such as `{ "cloud": "aws" }`.',
      aliasName: (alias: string) =>
        `Alias ${code(alias)} must use lower-case letters, digits and hyphens.`,
      aliasTarget: "An alias names an icon pack prefix.",
      /** `project.unknown-field`. */
      unknownField: (field: string) => `Unknown field ${code(field)} in project.json.`,
      /** `project.missing-field`. */
      missingField: (field: string) => `project.json has no ${code(field)} field.`,
      /** `project.language-mismatch`: the language of a file and the project's. */
      languageMismatch: (written: string, expected: string) =>
        `This file declares language "${written}" but the project uses "${expected}".`,
    },
    /** The plugins `project.json` installs (`plugins`) and their manifests. */
    plugins: {
      /** `project.invalid-value` of `plugins`. */
      settingsObject:
        '`plugins` must be an object such as `{ "erd": { "path": "plugins/erd", "version": "1.0.0", "permissions": ["diagram-types"] } }`.',
      name: (name: string) =>
        `${code(name)} is not a plugin name; use lower-case letters, digits and hyphens.`,
      pathAndVersion: (name: string) => `The plugin ${code(name)} needs "path" and "version".`,
      folder: (path: string) => `${code(path)} is not a folder inside the project.`,
      exactVersion: (version: string) =>
        `Install an exact version such as "1.0.0", not "${version}".`,
      permissionsList: "`permissions` must be a list.",
      networkNotGrantable:
        "`network` cannot be granted: nothing a project installs fetches anything.",
      permissions: (permissions: readonly string[]) =>
        `Permissions are ${permissions.join(" and ")}.`,
      /** `plugin.not-found`: the plugin, its manifest's name, its folder. */
      notFound: (name: string, manifest: string, path: string) =>
        `The plugin ${code(name)} has no ${manifest} in ${code(path)}.`,
      /** `limit.too-large` of a plugin's manifest. */
      tooLarge: (manifest: string, characters: number, max: number) =>
        `${manifest} has ${characters} characters; it may have at most ${max}.`,
      /** `plugin.invalid-manifest`. */
      notAnObject: (manifest: string) => `${manifest} must contain a JSON object.`,
      /** `plugin.invalid-manifest`, with the parser's reason. */
      invalidJson: (manifest: string, reason: string) => `${manifest} is not valid JSON: ${reason}`,
      /** `plugin.name-mismatch`. */
      nameMismatch: (declared: string, installed: string) =>
        `The manifest names the plugin ${code(declared)}; project.json installs ${code(installed)}.`,
      /** `plugin.invalid-manifest`. */
      version: "`version` must be a version such as 1.0.0.",
      /** `plugin.version-mismatch`: the plugin, the version installed, the one found. */
      versionMismatch: (name: string, installed: string, found: string) =>
        `project.json installs ${code(name)} ${installed}, but its folder holds ${found}.`,
      /** `plugin.incompatible`. */
      compatibilityMissing:
        "The manifest must declare `compatibility` with `model` and `renderer` version ranges.",
      /** `plugin.incompatible`: what the plugin needs and this tool does not have. */
      incompatible: (name: string, version: string, failures: readonly PluginFailure[]) =>
        `${code(name)} ${version} is not compatible with ${failures
          .map((f) => `the ${f.part} ${f.version} (it needs ${f.needs})`)
          .join(" and ")}.`,
      /** `plugin.code-ignored`. */
      codeIgnored: (key: string) =>
        `${code(key)} is ignored: plugins are data, and Meltemi Diagrams never runs their code.`,
      /** `plugin.permission-denied`. */
      networkNeverGranted:
        "`network` is never granted: nothing a project installs fetches anything.",
      /** `plugin.permission-denied`: an unknown permission and the ones there are. */
      notAPermission: (permission: string, permissions: readonly string[]) =>
        `${code(permission)} is not a permission; plugins may ask for ${permissions.join(" and ")}.`,
      /** `plugin.permission-denied`. */
      notGranted: (name: string, permission: string) =>
        `${code(name)} asks for ${code(permission)}, which project.json does not grant; what needs it is not loaded.`,
      /** `plugin.permission-denied`. */
      notRequested: (name: string, permission: string) =>
        `project.json grants ${code(name)} ${code(permission)}, which it does not ask for.`,
      /** `plugin.duplicate-type`. */
      duplicateType: (type: string, owner: string) =>
        `The diagram type ${code(type)} is already declared by ${code(owner)}.`,
      /** `plugin.invalid-manifest`. */
      iconsPath: "`icons` must be a path inside the plugin's folder.",
      librariesPath: "`libraries` must list paths inside the plugin's folder.",
      /** `plugin.invalid-manifest` and `asset.invalid-library`: a library file that is not one. */
      invalidLibrary: (reason: string) => `Not a library file: ${reason}.`,
    },
    /** Imports between files: `module.*`. */
    modules: {
      duplicateImport: (path: string) => `${code(path)} is already imported in this file.`,
      importPosition: "Imports go before the first block of the file.",
      /** `module.invalid-path`: the path written and why it is refused. */
      invalidPath: (path: string, reason: string) =>
        `${code(path)} is not a valid import path. ${reason}`,
      outsideProject: (path: string) => `${code(path)} resolves outside the project.`,
      /** `module.not-found`. */
      notFound: (path: string) => `No file at ${code(path)}.`,
      /** `module.not-found` of a file that exists but cannot be read. */
      unreadable: (path: string) => `${code(path)} cannot be read.`,
      /** `module.cycle`: the files of the cycle, the first one again at the end. */
      cycle: (chain: readonly string[]) => `Import cycle: ${chain.join(" → ")}.`,
      reservedName: (name: string) =>
        `${code(name)} is reserved for built-in themes such as ${code(`${name}.light`)}.`,
      unknownMember: (path: string, member: string) =>
        `${code(path)} does not define ${code(member)}.`,
      unusedImport: (name: string) => `${code(name)} is imported but never used.`,
    },
    /** References across files: models, links, themes and classes. */
    references: {
      /** `ref.unknown-model` of a namespace written without a model. */
      namespaceModel: (namespace: string) =>
        `${code(namespace)} is a namespace; write \`using ${namespace}.<model>\`.`,
      /** `ref.unknown-model`. */
      unknownModel: (model: string, file: string) =>
        `${code(model)} does not name a model of ${code(file)}.`,
      /** `theme.unknown-base`. */
      unknownBase: (name: string) => `"${name}" does not name a theme in the imported files.`,
      /** `layout.unknown-theme` of a theme the imports do not define. */
      unknownTheme: (name: string) =>
        `Theme "${name}" is not defined in the imported files; the default theme is used.`,
      /** `theme.unknown-class`. */
      unknownClass: (name: string) =>
        `Class ${code(name)} is not declared in the diagram, its theme or the built-in classes.`,
      /** `ref.unknown-link`. */
      linkSingleBlock: (name: string) =>
        `${code(name)} imports a single block; write \`link ${name}.<element>\`.`,
      /** `ref.unknown-link`. */
      linkNamespace: (name: string) =>
        `${code(name)} is a namespace; write \`link ${name}.<diagram>.<element>\`.`,
      /** `ref.unknown-link`. */
      linkUnknownDiagram: (file: string, id: string) =>
        `${code(file)} has no diagram or model ${code(id)}.`,
      /** `ref.unknown-link`: what the link writes before the element. */
      linkOneElement: (prefix: string) =>
        `A link to a diagram names one element: \`${prefix}<element>\`.`,
      /** `ref.unknown-link`. */
      linkUnknownElement: (diagram: string, file: string, element: string) =>
        `${code(diagram)} in ${code(file)} has no element ${code(element)}.`,
    },
    /** Icon packs, fonts, licences, the lock and images: `asset.*`. */
    assets: {
      unknownPack: (prefix: string) => `There is no icon pack or alias ${code(prefix)}.`,
      unknownIcon: (pack: string, name: string) =>
        `The pack ${code(pack)} has no icon ${code(name)}.`,
      /** `asset.unsafe-svg`, `asset.too-large` or `asset.invalid-file` of an icon. */
      unusableIcon: (reference: string, reason: string) =>
        `Icon ${code(reference)} cannot be used: ${reason}`,
      /** `asset.unknown-image`. */
      unknownImage: (path: string) => `There is no image file ${code(path)}.`,
      /** `asset.unsupported-image`: the path written and why the file cannot be read. */
      unsupportedImage: (path: string, reason: string) =>
        `${code(path)} cannot be used: ${lower(reason)}`,
      /** `asset.invalid-file`. */
      packName: (path: string) =>
        `${code(path)} is not a pack name; use lower-case letters, digits and hyphens.`,
      /** `asset.duplicate-pack`: the owner is a pack's path, or null for the built-in packs. */
      duplicatePack: (prefix: string, owner: string | null) =>
        `The pack ${code(prefix)} is already defined by ${owner === null ? "the built-in packs" : code(owner)}.`,
      /** `asset.duplicate-pack` of a plugin's pack. */
      duplicatePluginPack: (prefix: string, owner: string | null) =>
        `The pack ${code(prefix)} of the plugin is already defined by ${owner === null ? "the built-in packs" : code(owner)}.`,
      /** `asset.missing-license`. */
      packWithoutLicense: (prefix: string) => `The icon pack ${code(prefix)} has no licence.`,
      /** `asset.invalid-file` of a licence for a pack that is not there. */
      noPack: (prefix: string, folder: string) =>
        `There is no icon pack ${code(prefix)} in ${folder}.`,
      /** `project.invalid-value` of an alias. */
      aliasIsPack: (alias: string) =>
        `The alias ${code(alias)} is already the name of an icon pack.`,
      /** `project.invalid-value` of an alias. */
      aliasTarget: (alias: string, target: string) =>
        `The alias ${code(alias)} names ${code(target)}, which is not an icon pack.`,
      /** `asset.too-large`. */
      tooLarge: (path: string, megabytes: number) =>
        `${code(path)} is larger than ${megabytes} MB.`,
      /** `asset.font-restricted`. */
      fontRestricted: (family: string) =>
        `The licence of ${code(family)} forbids embedding; it is used to measure text, and exports name it without embedding or outlining it.`,
      /** `asset.missing-license`. */
      fontWithoutLicense: (family: string) => `The font ${code(family)} has no licence.`,
      /** `asset.invalid-file` of a licence for a font that is not there. */
      noFont: (family: string, folder: string) =>
        `There is no font of family ${code(family)} in ${folder}.`,
      /** `asset.lock-mismatch`: the lock's name and one change. */
      lockMismatch: (lock: string, change: string) => `The assets differ from ${lock}: ${change}.`,
      /** `asset.invalid-file`, with the parser's reason. */
      invalidJson: (reason: string) => `Not valid JSON: ${reason}`,
      iconSetIcons: "An Iconify icon set needs an `icons` object.",
      iconSetPrefix: (prefix: string) =>
        `The icon set's \`prefix\` must be ${code(prefix)}, the name of the file.`,
      emptyFolder: (path: string) => `${code(path)} holds no SVG icons.`,
      licensesObject: (file: string) => `${file} must hold an object.`,
      licensesKey: (key: string, file: string) =>
        `Unknown key ${code(key)}; ${file} holds \`icons\` and \`fonts\`.`,
      sectionObject: (key: string) => `${code(key)} must be an object.`,
      entryObject: (key: string) => `The entry ${code(key)} must be an object.`,
      unknownLicenseField: (field: string, entry: string) =>
        `Unknown field ${code(field)} in the entry ${code(entry)}.`,
      redistribute: "`redistribute` must be true or false.",
      opticalScale: "`opticalScale` must be a number from 0.5 to 1.5.",
      licenseText: (field: string) => `${code(field)} must be a non-empty string.`,
      noLicense: (entry: string) => `The entry ${code(entry)} has no \`license\`.`,
      licenseId: (license: string) =>
        `${code(license)} is not an SPDX identifier or a \`LicenseRef-\` name.`,
      lockVersion: (lock: string, version: number) =>
        `${lock} must be an object with \`"lockVersion": ${version}\`.`,
      lockSections: (lock: string) => `${lock} needs \`icons\` and \`fonts\` objects.`,
    },
    /** The bounds of a project: `limit.*`. */
    limits: {
      /** `limit.too-many-files`. */
      tooManyFiles: (files: number, compiled: number) =>
        `The project has ${files} .meltemi files; ${compiled} are compiled.`,
    },
  },
  /** The hints of the diagnostics, by the same groups. */
  hints: {
    /** The names a field or setting accepts. */
    fields: (fields: readonly string[]) => `Fields: ${fields.join(", ")}.`,
    manifest: {
      catalogSettings: (settings: readonly string[]) => `Settings: ${settings.join(", ")}.`,
      cloudSettings: (settings: readonly string[]) => `Settings: ${settings.join(", ")}.`,
      /** What `cloud` is, naming its two keys. */
      cloud:
        "`cloud` names the service (`host`) and the cloud project (`project`) a folder mirrors; `mdg push --create` and `mdg pull` write it.",
      language: (version: string) => `Set \`"language": "${version}"\`.`,
      versionRange:
        "Use an exact version, `^x.y.z`, `~x.y.z`, comparators such as `>=0.3.0 <1.0.0`, or `*`.",
      theme: (builtIn: readonly string[]) =>
        `Use a built-in theme (${builtIn.join(", ")}) or "<path>#<theme id>", such as "themes/company.meltemi#corporate".`,
      /** What `locale` is for. */
      locale: "The language of the words the tool adds to exported drawings, players and catalogs.",
      addLanguage: (version: string) => `Add \`"language": "${version}"\`.`,
      addName: 'Add `"name": "<project name>"`.',
      /** The themes a file declares. */
      themesDeclared: (themes: readonly string[]) =>
        themes.length > 0 ? `It declares ${themes.join(", ")}.` : "It declares no themes.",
      relativeToManifest: "Use a path relative to project.json.",
      languageHeader: (expected: string) =>
        `Change the header to \`language "${expected}"\` or remove it.`,
    },
    plugins: {
      versionMismatch:
        "Install the version project.json names, or update project.json after reviewing the plugin.",
      grant: (permission: string) =>
        `Add "${permission}" to the plugin's "permissions" in project.json after reviewing it.`,
    },
    modules: {
      duplicateImport: "Import every name you need from it in one statement.",
      importPosition: "Move this import below the `language` header and above the blocks.",
      relativePath: 'Write a relative path such as `"../themes/company.meltemi"`.',
      outsideProject:
        "Imports stay inside the folder that holds project.json, or the file's folder without one.",
      caseMismatch: (actual: string) => `${code(actual)} exists; import paths are case-sensitive.`,
      cycle: "Move the shared blocks to a file that both import, or remove one import.",
      reservedName: "Choose another name for this import.",
      /** The top-level blocks a file defines. */
      defines: (ids: readonly string[]) =>
        ids.length > 0 ? `It defines ${ids.join(", ")}.` : "It defines no top-level blocks.",
    },
    references: {
      models: (file: string, models: readonly string[]) =>
        models.length > 0
          ? `Models of ${code(file)}: ${models.join(", ")}.`
          : `${code(file)} declares no model.`,
      themes: (themes: readonly string[]) => `Themes in scope: ${themes.join(", ")}.`,
      classes: (classes: readonly string[]) => `Classes in scope: ${classes.join(", ")}.`,
      linkTargets: (ids: readonly string[]) =>
        ids.length > 0
          ? `Diagrams and models: ${ids.join(", ")}.`
          : "It defines no compiled diagrams.",
      elements: (diagram: string, elements: readonly string[]) =>
        `Elements of ${code(diagram)}: ${elements.join(", ")}.`,
    },
    assets: {
      packs: (packs: readonly string[]) => `Icon packs: ${packs.join(", ")}.`,
      didYouMean: (candidates: readonly string[]) =>
        `Did you mean ${candidates.map(code).join(", ")}?`,
      searchIcons: "Search icons with `meltemi-diagrams assets icons <words>`.",
      imagesInside: "Keep images inside the project folder, next to the diagrams that use them.",
      lookedFor: (path: string) => `Looked for ${code(path)} in the project.`,
      imageFormats: "Images are PNG, JPEG, GIF, WebP or SVG files of at most 8 MB.",
      renamePack:
        "Rename the file or folder; the prefix is the name diagrams write before the colon.",
      packLicense: (prefix: string, file: string) =>
        `Add \`"${prefix}": { "license": "<SPDX id or LicenseRef-name>" }\` under \`"icons"\` in ${file}.`,
      fontLicense: (family: string, file: string) =>
        `Add \`"${family}": { "license": "<SPDX id or LicenseRef-name>" }\` under \`"fonts"\` in ${file}.`,
      lock: "Run `meltemi-diagrams assets lock` after reviewing the change.",
      spdx: "Use an SPDX identifier such as `MIT`, or a `LicenseRef-` name for other terms.",
      writeLock: "Run `meltemi-diagrams assets lock` to write it again.",
    },
    limits: {
      tooManyFiles: "Split it into several projects, or leave folders out with `exclude`.",
    },
  },
  /** Why JSON text cannot be read; `found` is "the end of the file" or a character as code. */
  json: {
    endOfFile: "the end of the file",
    unterminatedString: "Unterminated string.",
    invalidEscape: "Invalid escape sequence in string.",
    controlCharacter: "Control characters must be escaped in strings.",
    propertyName: (found: string) => `Expected a property name in quotes but found ${found}.`,
    colon: (found: string) => `Expected \`:\` after the property name but found ${found}.`,
    trailingComma: (bracket: "}" | "]") => `Trailing comma before \`${bracket}\`.`,
    commaOrBrace: (found: string) => `Expected \`,\` or \`}\` but found ${found}.`,
    commaOrBracket: (found: string) => `Expected \`,\` or \`]\` but found ${found}.`,
    value: (found: string) => `Expected a JSON value but found ${found}.`,
    afterValue: (found: string) => `Unexpected ${found} after the JSON value.`,
  },
  /** Why an import path or an image path is refused. */
  paths: {
    importUrl: "URLs and drive paths are not allowed; network references are disabled.",
    absolute: "Absolute paths are not allowed.",
    separator: "Use `/` as the path separator.",
    relative: "Paths start with `./` or `../`.",
    extension: "Imported files end in `.meltemi`.",
    emptySegment: "The path has an empty segment (`//`).",
    imageUrl: "URLs and drive paths are not allowed; images are project files.",
    leavesProject: (path: string) => `${code(path)} leaves the project folder.`,
  },
  /** Why a reference to a top-level block does not resolve (`resolveReference`). */
  lookup: {
    notFound: (name: string, kinds: readonly BlockKind[], available: readonly string[]) =>
      `${code(name)} does not name a ${kinds.join(" or ")} in this file or its imports.` +
      (available.length > 0 ? ` Available: ${available.join(", ")}.` : ""),
    wrongKind: (name: string, kind: BlockKind, kinds: readonly BlockKind[]) =>
      `${code(name)} is a ${kind}, not a ${kinds.join(" or ")}.`,
  },
  /** Why an entity rename across the project is refused. */
  rename: {
    noEntity: (model: string, path: string) =>
      `The model ${code(model)} has no entity ${code(path)}.`,
    invalidId: (id: string) => `${code(id)} is not a valid id; use letters, digits and \`_\`.`,
    taken: (path: string, model: string) =>
      `${code(path)} is already an entity of the model ${code(model)}.`,
  },
};

const code = (value: string) => `\`${value}\``;

/**
 * The words of assets in English: why an SVG file, an icon or an image cannot be used, and what
 * changed since the asset lock was written. They are written in the interface language when a
 * problem is found, so they are read at that moment, never at module load. Sentences with values
 * are functions, so each language builds its own grammar; code in them (elements, attributes,
 * values, ids, paths) stays as written.
 */
export const en = {
  /** Why the XML of an SVG file cannot be read (`parseXml`). */
  xml: {
    textAfterRoot: "Text after the root element.",
    unterminatedComment: "Unterminated comment.",
    unterminatedInstruction: "Unterminated processing instruction.",
    unterminatedCdata: "Unterminated CDATA section.",
    declarations: "DTDs and entity declarations (`<!DOCTYPE`, `<!ENTITY`) are not allowed.",
    malformedClosingTag: "Malformed closing tag.",
    /** A closing tag, by its element's name, that closes another element. */
    closingTag: (name: string) =>
      `Closing tag ${code(`</${name}>`)} does not match its opening tag.`,
    malformedTag: "Malformed tag.",
    secondRoot: "The document has more than one root element.",
    unterminatedTag: (name: string) => `Unterminated tag ${code(`<${name}`)}.`,
    malformedAttribute: (element: string) => `Malformed attribute in ${code(`<${element}>`)}.`,
    noValue: (attribute: string) => `Attribute ${code(attribute)} has no value.`,
    unquotedValue: (attribute: string) => `The value of ${code(attribute)} is not quoted.`,
    unterminatedValue: (attribute: string) => `Unterminated value of ${code(attribute)}.`,
    lessThanInValue: (attribute: string) => `\`<\` in the value of ${code(attribute)}.`,
    /** An entity as written, such as `&custom;`. */
    entity: (entity: string) => `The entity ${code(entity)} is not allowed.`,
    repeatedAttribute: (attribute: string) => `Attribute ${code(attribute)} is repeated.`,
    tooManyElements: (max: number) => `More than ${max} elements.`,
    tooDeep: (max: number) => `Elements nested more than ${max} levels deep.`,
    unclosedElement: (name: string) => `Unclosed element ${code(`<${name}>`)}.`,
    noRoot: "The document has no root element.",
  },
  /** Why an icon cannot be used: the `message` of an `IconProblem`. */
  icons: {
    /** An element that icons may not have. */
    element: (name: string) => `${code(`<${name}>`)} is not allowed in icons.`,
    stopOutsideGradient: "`<stop>` outside a gradient.",
    /** A shape with elements inside it. */
    children: (name: string) => `${code(`<${name}>`)} cannot contain elements.`,
    eventAttribute: (name: string) => `Event attribute ${code(name)} is not allowed.`,
    /** A link attribute and its value, as written. */
    link: (name: string, value: string) => `Link \`${name}="${value}"\` is not allowed in icons.`,
    /** An attribute and the `url(…)` it refers to. */
    reference: (name: string, value: string) =>
      `${code(name)} refers to ${code(value)}; only gradients of the same file may be referenced.`,
    colour: (value: string) => `Colour ${code(value)} cannot be read.`,
    number: (value: string) => `Number ${code(value)} cannot be read.`,
    opacity: (value: string) => `Opacity ${code(value)} cannot be read.`,
    transform: (value: string) => `Transform ${code(value)} cannot be read.`,
    points: (element: string) => `The points of ${code(`<${element}>`)} cannot be read.`,
    /** `too-large`: the most path data an icon may have. */
    pathDataSize: (kilobytes: number) => `More than ${kilobytes} KB of path data.`,
    pathData: "Path data cannot be read.",
    gradientId: "A gradient needs a simple `id`.",
    /** A coordinate of a gradient and its value, as written. */
    gradientCoordinate: (key: string, value: string) =>
      `Gradient coordinate \`${key}="${value}"\` cannot be read.`,
    gradientElement: (name: string) => `${code(`<${name}>`)} is not allowed in a gradient.`,
    stopColour: (value: string) => `Stop colour ${code(value)} cannot be read.`,
    gradientTwice: (id: string) => `Gradient ${code(id)} is defined twice.`,
    /** `too-large`: the largest SVG file. */
    fileSize: (kilobytes: number) => `The file is larger than ${kilobytes} KB.`,
    root: "The root element is not `<svg>`.",
    viewBox: "The icon has no readable `viewBox`, `width` or `height`.",
    /** An alias of an Iconify icon set whose chain of parents ends nowhere. */
    aliasWithoutParent: (name: string) => `Alias ${code(name)} has no parent icon.`,
    noBody: (name: string) => `Icon ${code(name)} has no body.`,
  },
  /** Why an image file cannot be used: the `message` of a failed `readImage`. */
  images: {
    fileSize: (megabytes: number) => `The file is larger than ${megabytes} MB.`,
    format: "The file is not a PNG, JPEG, GIF, WebP or SVG image.",
    /** The format's name as it is written: `PNG`, `JPEG`, `GIF`, `WebP`. */
    brokenHeader: (format: string) => `The ${format} header is broken or truncated.`,
    /** An SVG image that the icon sanitiser refuses, with its reason. */
    unsafeSvg: (reason: string) => `Its SVG cannot be sanitised: ${reason}`,
  },
  /**
   * What changed since the lock was written (`compareLocks`): clauses that follow a colon, without
   * a capital or a full stop. A version of `null` is a pack without one.
   */
  lock: {
    packAdded: (prefix: string) => `icon pack ${code(prefix)} is not in the lock`,
    packRemoved: (prefix: string) => `icon pack ${code(prefix)} is locked but no longer exists`,
    packVersion: (prefix: string, before: string | null, after: string | null) =>
      `icon pack ${code(prefix)} changed version from ${before ?? "none"} to ${after ?? "none"}`,
    packContent: (prefix: string) => `icon pack ${code(prefix)} changed content`,
    packLicense: (prefix: string) => `icon pack ${code(prefix)} changed licence`,
    fontAdded: (path: string) => `font ${code(path)} is not in the lock`,
    fontRemoved: (path: string) => `font ${code(path)} is locked but no longer exists`,
    fontContent: (path: string) => `font ${code(path)} changed content`,
    fontLicense: (path: string) => `font ${code(path)} changed licence`,
    pluginAdded: (name: string) => `plugin ${code(name)} is not in the lock`,
    pluginRemoved: (name: string) => `plugin ${code(name)} is locked but no longer installed`,
    pluginVersion: (name: string, before: string, after: string) =>
      `plugin ${code(name)} changed version from ${before} to ${after}`,
    pluginContent: (name: string) => `plugin ${code(name)} changed content`,
    /** The plugin's new folder, relative to the project. */
    pluginMoved: (name: string, path: string) => `plugin ${code(name)} moved to ${path}`,
  },
};

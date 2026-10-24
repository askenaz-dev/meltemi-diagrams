import type { en } from "./en.js";

/** Code inside a sentence: `text`. */
const code = (text: string) => `\`${text}\``;

/** The body of each top-level block, for "`{` para abrir el cuerpo …". */
const BODIES: Readonly<Record<string, string>> = {
  diagram: "del diagrama",
  model: "del modelo",
  theme: "del tema",
  story: "de la historia",
  export: "del perfil de exportación",
};

export const es: typeof en = {
  diagnostics: {
    bom: "El archivo empieza con una marca de orden de bytes; se conserva tal cual.",
    unterminatedComment:
      "El comentario de bloque no se cierra con `*/` antes del final del archivo.",
    mixedLineEndings: (line, first) =>
      `Esta línea termina con ${line}, pero el archivo empezó con ${first}.`,
    invalidEscape: (escape) => `Secuencia de escape desconocida ${code(escape)} en la cadena.`,
    unterminatedString: 'La cadena no se cierra con `"` antes del final de la línea.',
    unexpectedCharacter: (chars) => `Carácter inesperado ${code(chars)}.`,
    unexpectedCharacters: (chars) => `Caracteres inesperados ${code(chars)}.`,
    expectedToken: (what, found) => `Se esperaba ${what}, pero se encontró ${found}.`,
    unclosedBlock: (line) =>
      `Se esperaba \`}\` para cerrar el bloque abierto en la línea ${line}, pero se encontró el final del archivo.`,
    expectedEndOfStatement: (found) =>
      `No se esperaba ${found}; se esperaba el final de la instrucción.`,
    unexpectedAtStatementStart: (found) =>
      `No se esperaba ${found} al comienzo de una instrucción.`,
    chainedRelations:
      "Las relaciones encadenadas no se admiten; escribe una relación por instrucción.",
    unexpectedTopLevel: (found) => `No se esperaba ${found} en el nivel superior del archivo.`,
    headerNotFirst: "El encabezado `language` debe ser la primera instrucción del archivo.",
    nestingTooDeep: (depth) =>
      `Los bloques, las tuplas y las listas están anidados en más de ${depth} niveles.`,
    invalidIndent: (written) => `La sangría debe ser de 1 a 8 espacios o "tab", no ${written}.`,
  },

  expected: {
    versionString: 'una cadena de versión como `"0.2"` después de `language`',
    namespaceAfterAs: "un espacio de nombres después de `as`",
    asAndNamespace: "`as` y un espacio de nombres después de la ruta",
    aliasAfterAs: "un alias después de `as`",
    idAfterComma: "un id que importar después de `,`",
    pathOrIds: "una cadena con la ruta o los ids que importar después de `import`",
    pathAfterFrom: "una cadena con la ruta después de `from`",
    fromAndPath: "`from` y una ruta después de los ids importados",
    openBody: (block) =>
      `\`{\` para abrir el cuerpo ${Object.hasOwn(BODIES, block) ? BODIES[block] : `de ${code(block)}`}`,
    diagramId: "un id de diagrama después de `diagram`",
    colonAfterId: "`:` después del id del diagrama",
    diagramType: "un tipo de diagrama (`flow`, `sequence`, `c4` o `free`)",
    modelReference: "una referencia a un modelo después de `using`",
    idAfter: (keyword) => `un id después de ${code(keyword)}`,
    forAndTarget: "`for` seguido del destino",
    targetAfterFor: "un destino después de `for`",
    arrowAfter: (ref) => `una flecha (\`->\`, \`-->\`, \`<->\` o \`<-->\`) después de ${code(ref)}`,
    identifierAfterDot: "un identificador después de `.`",
    relationTarget: (arrow) => `un destino de relación después de ${code(arrow)}`,
    labelAfterColon: "una cadena de etiqueta después de `:`",
    relationId: "un id de relación después de `as`",
    labelString: "una cadena de etiqueta",
    blockAfter: (word) => `\`{\` después de ${code(word)}`,
  },

  tokens: {
    endOfLine: "el final de la línea",
    endOfFile: "el final del archivo",
    string: (text) => `la cadena ${text}`,
  },

  hints: {
    bom: "La codificación canónica es UTF-8 sin marca de orden de bytes.",
    lineEndings: "Usa un solo estilo de fin de línea por archivo; las ediciones siguen el primero.",
    escapes: 'Las secuencias de escape admitidas son \\", \\\\, \\n y \\t.',
    multilineString:
      "Las cadenas no pueden ocupar varias líneas; usa \\n para un salto de línea dentro de una etiqueta.",
    arrows: "Los símbolos de relación son `->`, `-->`, `--`, `---`, `<->` y `<-->`.",
    identifiers:
      "Los identificadores usan letras ASCII, dígitos y `_`; escribe otros textos en una etiqueta entre comillas.",
    minus: "Un signo menos debe ir seguido de un dígito, de `-` o de `>`.",
    separateStatements: "Separa las instrucciones con un salto de línea o `;`.",
    topLevel:
      "Las instrucciones de nivel superior son `language`, `import`, `model`, `diagram`, `story`, `export` y `theme`.",
    insideDiagram:
      "Los elementos y las relaciones van dentro de un bloque `diagram <id>: flow { ... }`.",
    headerFirst: "Muévelo por encima de cada `import` y de cada bloque.",
    importNamespace: 'Escribe `import "<path>" as <namespace>`.',
    importMembers: 'Escribe `import <id>, <id> as <alias> from "<path>"`.',
    diagramShape:
      "Escribe `diagram <id>: <type> { ... }`, por ejemplo `diagram checkout: flow { ... }`.",
    targetedShape: (keyword) => `Escribe \`${keyword} <id> for <target> { ... }\`.`,
    labelledElement: 'Declara un elemento con etiqueta con `id["Label"]`.',
    blockAfterWord:
      "Un bloque debe seguir a una palabra de instrucción, por ejemplo `placement { ... }`.",
    quotedRelationLabel: 'Las etiquetas van entre comillas: `a -> b: "Label"`.',
    quotedShorthandLabel: 'Las etiquetas van entre comillas: `id["Label"]` o `id[("Label")]`.',
  },

  related: {
    blockOpened: "El bloque se abrió aquí.",
  },
};

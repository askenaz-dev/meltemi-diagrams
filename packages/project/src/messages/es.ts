import { decimal, list } from "@meltemi/diagrams-i18n";
import type { BlockKind } from "../program.js";
import type { en } from "./en.js";

const code = (value: string) => `\`${value}\``;
/** A number in prose, with the decimal comma. */
const n = (value: number) => decimal("es", value, 6);
/** A reason that follows a colon: Spanish starts it in lower case. */
const lower = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** The kinds of top-level blocks, with their article. */
const BLOCKS: Readonly<Record<BlockKind, string>> = {
  diagram: "un diagrama",
  theme: "un tema",
  model: "un modelo",
  story: "una historia",
  export: "una exportación",
};
const blocks = (kinds: readonly BlockKind[]) =>
  list(
    "es",
    kinds.map((kind) => BLOCKS[kind]),
    "disjunction",
  );

/** What a pack's prefix is already taken by. */
const takenBy = (owner: string | null) =>
  owner === null ? "lo definen los paquetes integrados" : `lo define ${code(owner)}`;

/** The words of projects in Spanish. */
export const es: typeof en = {
  diagnostics: {
    manifest: {
      tooLarge: (characters, max) =>
        `\`project.json\` tiene ${characters} caracteres; puede tener como máximo ${max}.`,
      invalidJson: (reason) => `\`project.json\` no es JSON válido: ${lower(reason)}`,
      notAnObject: "`project.json` debe contener un objeto JSON.",
      pathList: (field) => `${code(field)} debe ser una lista de rutas relativas.`,
      emptyPath: (field) => `Cada entrada de ${code(field)} debe ser una ruta no vacía.`,
      outsidePath: (value) =>
        `${code(value)} no es una ruta dentro del proyecto; usa una ruta relativa a \`project.json\`.`,
      catalogObject: '`catalog` debe ser un objeto como `{ "title": "Architecture" }`.',
      catalogText: (setting) =>
        `${code(setting)} debe ser ${setting === "title" ? "una cadena no vacía" : "una cadena"}.`,
      catalogOut:
        "`out` debe ser una carpeta o un archivo `.html` dentro del proyecto, relativo a `project.json`.",
      catalogExcludeList:
        "`exclude` debe ser una lista de rutas relativas o de entradas `<file>#<id>`.",
      catalogExcludeEntry:
        "Cada entrada de `exclude` es una carpeta o un archivo dentro del proyecto, o `<file>.meltemi#<id>`.",
      catalogSource: "`source` debe ser `true` o `false`.",
      unknownCatalogSetting: (setting) => `${code(setting)} no es un ajuste de \`catalog\`.`,
      cloudObject:
        '`cloud` debe ser un objeto con `host` y `project`, como `{ "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }`.',
      cloudHost:
        "`host` debe ser la dirección del servicio: un origen https: como `https://diagrams.meltemi.dev` (http: solo para 127.0.0.1, localhost o [::1]).",
      cloudProject:
        "`project` debe ser el id de un proyecto de la nube: 20 letras minúsculas y dígitos.",
      unknownCloudSetting: (setting) => `${code(setting)} no es un ajuste de \`cloud\`.`,
      setTwice: (field) => `${code(field)} aparece dos veces.`,
      schema: "`$schema` debe ser una cadena.",
      name: "`name` debe ser una cadena no vacía.",
      languageText: "`language` debe ser una cadena de versión.",
      languageUnsupported: (written, implemented) =>
        `La versión de lenguaje "${written}" no se admite; esta herramienta implementa la ${implemented}.`,
      toolsObject: "`tools` debe ser un objeto de rangos de versiones.",
      unknownTool: (tool, only) =>
        `Herramienta desconocida ${code(tool)}; la única herramienta es ${code(only)}.`,
      versionRange: "No se puede leer el rango de versiones.",
      toolVersion: (tool, range, version) =>
        `El proyecto requiere ${tool} ${range}, pero esta es la versión ${version}.`,
      formatObject: '`format` debe ser un objeto como `{ "indent": 2 }`.',
      unknownFormatSetting: (setting) =>
        `Ajuste de formato desconocido ${code(setting)}; el único ajuste es \`indent\`.`,
      indent: '`indent` debe ser un número entero de espacios del 1 al 8, o "tab".',
      themeText: "`theme` debe ser una cadena.",
      themeName: (value) => `"${value}" no es un tema integrado ni \`<path>#<theme id>\`.`,
      themeId: (id) => `"${id}" no es un id de tema.`,
      themeFile: (path) => `"${path}" no es un archivo .meltemi.`,
      themeOutside: (path) =>
        `"${path}" no es una ruta dentro del proyecto; usa una ruta relativa a \`project.json\`.`,
      themeNotDeclared: (path, id) => `${code(path)} no declara un tema ${code(id)}.`,
      themeFileMissing: (path) => `${code(path)} no existe.`,
      locale: (locales) =>
        `\`locale\` debe ser ${list(
          "es",
          locales.map((l) => `"${l}"`),
          "disjunction",
        )}.`,
      iconsObject: '`icons` debe ser un objeto de alias como `{ "cloud": "aws" }`.',
      aliasName: (alias) =>
        `El alias ${code(alias)} debe usar letras minúsculas, dígitos y guiones.`,
      aliasTarget: "Un alias nombra el prefijo de un paquete de iconos.",
      unknownField: (field) => `Campo desconocido ${code(field)} en \`project.json\`.`,
      missingField: (field) => `\`project.json\` no tiene el campo ${code(field)}.`,
      languageMismatch: (written, expected) =>
        `Este archivo declara el lenguaje "${written}", pero el proyecto usa "${expected}".`,
    },
    plugins: {
      settingsObject:
        '`plugins` debe ser un objeto como `{ "erd": { "path": "plugins/erd", "version": "1.0.0", "permissions": ["diagram-types"] } }`.',
      name: (name) =>
        `${code(name)} no es un nombre de plugin; usa letras minúsculas, dígitos y guiones.`,
      pathAndVersion: (name) => `El plugin ${code(name)} necesita "path" y "version".`,
      folder: (path) => `${code(path)} no es una carpeta dentro del proyecto.`,
      exactVersion: (version) => `Instala una versión exacta como "1.0.0", no "${version}".`,
      permissionsList: "`permissions` debe ser una lista.",
      networkNotGrantable:
        "`network` no se puede conceder: nada de lo que instala un proyecto accede a la red.",
      permissions: (permissions) => `Los permisos son ${list("es", permissions)}.`,
      notFound: (name, manifest, path) =>
        `El plugin ${code(name)} no tiene ${code(manifest)} en ${code(path)}.`,
      tooLarge: (manifest, characters, max) =>
        `${code(manifest)} tiene ${characters} caracteres; puede tener como máximo ${max}.`,
      notAnObject: (manifest) => `${code(manifest)} debe contener un objeto JSON.`,
      invalidJson: (manifest, reason) => `${code(manifest)} no es JSON válido: ${lower(reason)}`,
      nameMismatch: (declared, installed) =>
        `El manifiesto llama al plugin ${code(declared)}; \`project.json\` instala ${code(installed)}.`,
      version: "`version` debe ser una versión como 1.0.0.",
      versionMismatch: (name, installed, found) =>
        `\`project.json\` instala ${code(name)} ${installed}, pero su carpeta contiene la ${found}.`,
      compatibilityMissing:
        "El manifiesto debe declarar `compatibility` con rangos de versiones de `model` y `renderer`.",
      incompatible: (name, version, failures) =>
        `${code(name)} ${version} no es compatible con ${failures
          .map(
            (f) =>
              `${f.part === "model" ? "el modelo" : "el renderizador"} ${f.version} (necesita ${f.needs})`,
          )
          .join(" ni con ")}.`,
      codeIgnored: (key) =>
        `Se ignora ${code(key)}: los plugins son datos y Meltemi Diagrams nunca ejecuta su código.`,
      networkNeverGranted:
        "`network` nunca se concede: nada de lo que instala un proyecto accede a la red.",
      notAPermission: (permission, permissions) =>
        `${code(permission)} no es un permiso; los plugins pueden pedir ${list("es", permissions)}.`,
      notGranted: (name, permission) =>
        `${code(name)} pide ${code(permission)}, que \`project.json\` no concede; lo que lo necesita no se carga.`,
      notRequested: (name, permission) =>
        `\`project.json\` concede ${code(permission)} a ${code(name)}, que no lo pide.`,
      duplicateType: (type, owner) =>
        `El tipo de diagrama ${code(type)} ya lo declara ${code(owner)}.`,
      iconsPath: "`icons` debe ser una ruta dentro de la carpeta del plugin.",
      librariesPath: "`libraries` debe listar rutas dentro de la carpeta del plugin.",
      invalidLibrary: (reason) => `No es un archivo de biblioteca: ${reason}.`,
    },
    modules: {
      duplicateImport: (path) => `${code(path)} ya se importa en este archivo.`,
      importPosition: "Las importaciones van antes del primer bloque del archivo.",
      invalidPath: (path, reason) =>
        `${code(path)} no es una ruta de importación válida. ${reason}`,
      outsideProject: (path) => `${code(path)} apunta fuera del proyecto.`,
      notFound: (path) => `No hay ningún archivo en ${code(path)}.`,
      unreadable: (path) => `No se puede leer ${code(path)}.`,
      cycle: (chain) => `Ciclo de importaciones: ${chain.join(" → ")}.`,
      reservedName: (name) =>
        `${code(name)} está reservado para los temas integrados, como ${code(`${name}.light`)}.`,
      unknownMember: (path, member) => `${code(path)} no define ${code(member)}.`,
      unusedImport: (name) => `${code(name)} se importa, pero nunca se usa.`,
    },
    references: {
      namespaceModel: (namespace) =>
        `${code(namespace)} es un espacio de nombres; escribe \`using ${namespace}.<model>\`.`,
      unknownModel: (model, file) => `${code(model)} no nombra un modelo de ${code(file)}.`,
      unknownBase: (name) => `"${name}" no nombra un tema de los archivos importados.`,
      unknownTheme: (name) =>
        `El tema "${name}" no está definido en los archivos importados; se usa el tema predeterminado.`,
      unknownClass: (name) =>
        `La clase ${code(name)} no está declarada en el diagrama, en su tema ni en las clases integradas.`,
      linkSingleBlock: (name) =>
        `${code(name)} importa un solo bloque; escribe \`link ${name}.<element>\`.`,
      linkNamespace: (name) =>
        `${code(name)} es un espacio de nombres; escribe \`link ${name}.<diagram>.<element>\`.`,
      linkUnknownDiagram: (file, id) =>
        `${code(file)} no tiene ningún diagrama ni modelo ${code(id)}.`,
      linkOneElement: (prefix) =>
        `Un enlace a un diagrama nombra un solo elemento: \`${prefix}<element>\`.`,
      linkUnknownElement: (diagram, file, element) =>
        `${code(diagram)} de ${code(file)} no tiene el elemento ${code(element)}.`,
    },
    assets: {
      unknownPack: (prefix) => `No hay ningún paquete de iconos ni alias ${code(prefix)}.`,
      unknownIcon: (pack, name) => `El paquete ${code(pack)} no tiene el icono ${code(name)}.`,
      unusableIcon: (reference, reason) =>
        `No se puede usar el icono ${code(reference)}: ${lower(reason)}`,
      unknownImage: (path) => `No hay ningún archivo de imagen ${code(path)}.`,
      unsupportedImage: (path, reason) => `No se puede usar ${code(path)}: ${lower(reason)}`,
      packName: (path) =>
        `${code(path)} no es un nombre de paquete; usa letras minúsculas, dígitos y guiones.`,
      duplicatePack: (prefix, owner) => `El paquete ${code(prefix)} ya ${takenBy(owner)}.`,
      duplicatePluginPack: (prefix, owner) =>
        `El paquete ${code(prefix)} del plugin ya ${takenBy(owner)}.`,
      packWithoutLicense: (prefix) => `El paquete de iconos ${code(prefix)} no tiene licencia.`,
      noPack: (prefix, folder) =>
        `No hay ningún paquete de iconos ${code(prefix)} en ${code(folder)}.`,
      aliasIsPack: (alias) => `El alias ${code(alias)} ya es el nombre de un paquete de iconos.`,
      aliasTarget: (alias, target) =>
        `El alias ${code(alias)} nombra ${code(target)}, que no es un paquete de iconos.`,
      tooLarge: (path, megabytes) => `${code(path)} ocupa más de ${n(megabytes)} MB.`,
      fontRestricted: (family) =>
        `La licencia de ${code(family)} prohíbe incrustar la fuente; se usa para medir el texto, y las exportaciones la nombran sin incrustarla ni convertirla en contornos.`,
      fontWithoutLicense: (family) => `La fuente ${code(family)} no tiene licencia.`,
      noFont: (family, folder) =>
        `No hay ninguna fuente de la familia ${code(family)} en ${code(folder)}.`,
      lockMismatch: (lock, change) => `Los recursos difieren de ${code(lock)}: ${change}.`,
      invalidJson: (reason) => `No es JSON válido: ${lower(reason)}`,
      iconSetIcons: "Un conjunto de iconos de Iconify necesita un objeto `icons`.",
      iconSetPrefix: (prefix) =>
        `El \`prefix\` del conjunto de iconos debe ser ${code(prefix)}, el nombre del archivo.`,
      emptyFolder: (path) => `${code(path)} no contiene iconos SVG.`,
      unusableName: (path) =>
        `${code(path)} se deja fuera: el nombre de un icono solo lleva letras, dígitos, \`_\`, \`.\` y \`-\`.`,
      licensesObject: (file) => `${code(file)} debe contener un objeto.`,
      licensesKey: (key, file) =>
        `Clave desconocida ${code(key)}; ${code(file)} contiene \`icons\` y \`fonts\`.`,
      sectionObject: (key) => `${code(key)} debe ser un objeto.`,
      entryObject: (key) => `La entrada ${code(key)} debe ser un objeto.`,
      unknownLicenseField: (field, entry) =>
        `Campo desconocido ${code(field)} en la entrada ${code(entry)}.`,
      redistribute: "`redistribute` debe ser `true` o `false`.",
      opticalScale: "`opticalScale` debe ser un número de 0,5 a 1,5.",
      licenseText: (field) => `${code(field)} debe ser una cadena no vacía.`,
      noLicense: (entry) => `La entrada ${code(entry)} no tiene \`license\`.`,
      licenseId: (license) =>
        `${code(license)} no es un identificador SPDX ni un nombre \`LicenseRef-\`.`,
      lockVersion: (lock, version) =>
        `${code(lock)} debe ser un objeto con \`"lockVersion": ${version}\`.`,
      lockSections: (lock) => `${code(lock)} necesita los objetos \`icons\` y \`fonts\`.`,
    },
    limits: {
      tooManyFiles: (files, compiled) =>
        `El proyecto tiene ${files} archivos .meltemi; se compilan ${compiled}.`,
    },
  },
  hints: {
    fields: (fields) => `Campos: ${fields.join(", ")}.`,
    manifest: {
      catalogSettings: (settings) => `Ajustes: ${settings.join(", ")}.`,
      cloudSettings: (settings) => `Ajustes: ${settings.join(", ")}.`,
      cloud:
        "`cloud` nombra el servicio (`host`) y el proyecto de la nube (`project`) que refleja una carpeta; `mdg push --create` y `mdg pull` lo escriben.",
      language: (version) => `Usa \`"language": "${version}"\`.`,
      versionRange:
        "Usa una versión exacta, `^x.y.z`, `~x.y.z`, comparadores como `>=0.3.0 <1.0.0`, o `*`.",
      theme: (builtIn) =>
        `Usa un tema integrado (${builtIn.join(", ")}) o "<path>#<theme id>", como "themes/company.meltemi#corporate".`,
      locale:
        "El idioma de las palabras que la herramienta agrega a los dibujos, reproductores y catálogos exportados.",
      addLanguage: (version) => `Agrega \`"language": "${version}"\`.`,
      addName: 'Agrega `"name": "<project name>"`.',
      themesDeclared: (themes) =>
        themes.length > 0 ? `Declara ${themes.join(", ")}.` : "No declara ningún tema.",
      relativeToManifest: "Usa una ruta relativa a `project.json`.",
      languageHeader: (expected) => `Cambia la cabecera a \`language "${expected}"\` o quítala.`,
    },
    plugins: {
      versionMismatch:
        "Instala la versión que indica `project.json`, o actualiza `project.json` después de revisar el plugin.",
      grant: (permission) =>
        `Agrega "${permission}" a los "permissions" del plugin en \`project.json\` después de revisarlo.`,
    },
    modules: {
      duplicateImport: "Importa en una sola instrucción todos los nombres que necesites de él.",
      importPosition:
        "Mueve esta importación debajo de la cabecera `language` y encima de los bloques.",
      relativePath: 'Escribe una ruta relativa como `"../themes/company.meltemi"`.',
      outsideProject:
        "Las importaciones se quedan dentro de la carpeta que contiene `project.json` o, si no lo hay, dentro de la carpeta del archivo.",
      caseMismatch: (actual) =>
        `${code(actual)} existe; las rutas de importación distinguen mayúsculas de minúsculas.`,
      cycle:
        "Mueve los bloques compartidos a un archivo que importen los dos, o quita una importación.",
      reservedName: "Elige otro nombre para esta importación.",
      defines: (ids) =>
        ids.length > 0 ? `Define ${ids.join(", ")}.` : "No define bloques de nivel superior.",
    },
    references: {
      models: (file, models) =>
        models.length > 0
          ? `Modelos de ${code(file)}: ${models.join(", ")}.`
          : `${code(file)} no declara ningún modelo.`,
      themes: (themes) => `Temas disponibles: ${themes.join(", ")}.`,
      classes: (classes) => `Clases disponibles: ${classes.join(", ")}.`,
      linkTargets: (ids) =>
        ids.length > 0
          ? `Diagramas y modelos: ${ids.join(", ")}.`
          : "No define diagramas compilados.",
      elements: (diagram, elements) => `Elementos de ${code(diagram)}: ${elements.join(", ")}.`,
    },
    assets: {
      packs: (packs) => `Paquetes de iconos: ${packs.join(", ")}.`,
      didYouMean: (candidates) =>
        `¿Quisiste decir ${list("es", candidates.map(code), "disjunction")}?`,
      searchIcons: "Busca iconos con `meltemi-diagrams assets icons <words>`.",
      imagesInside:
        "Guarda las imágenes dentro de la carpeta del proyecto, junto a los diagramas que las usan.",
      lookedFor: (path) => `Se buscó ${code(path)} en el proyecto.`,
      imageFormats: "Las imágenes son archivos PNG, JPEG, GIF, WebP o SVG de 8 MB como máximo.",
      renameIcon: (file) => `Cámbiale el nombre a ${code(file)}.`,
      nameIcon: "Cámbiale el nombre con letras o dígitos.",
      renamePack:
        "Cambia el nombre del archivo o de la carpeta; el prefijo es el nombre que los diagramas escriben antes de los dos puntos.",
      packLicense: (prefix, file) =>
        `Agrega \`"${prefix}": { "license": "<SPDX id or LicenseRef-name>" }\` dentro de \`"icons"\` en ${code(file)}.`,
      fontLicense: (family, file) =>
        `Agrega \`"${family}": { "license": "<SPDX id or LicenseRef-name>" }\` dentro de \`"fonts"\` en ${code(file)}.`,
      lock: "Ejecuta `meltemi-diagrams assets lock` después de revisar el cambio.",
      spdx: "Usa un identificador SPDX como `MIT`, o un nombre `LicenseRef-` para otras condiciones.",
      writeLock: "Ejecuta `meltemi-diagrams assets lock` para escribirlo de nuevo.",
    },
    limits: {
      tooManyFiles: "Divídelo en varios proyectos o deja carpetas fuera con `exclude`.",
    },
  },
  json: {
    endOfFile: "el final del archivo",
    unterminatedString: "Cadena sin terminar.",
    invalidEscape: "Secuencia de escape no válida en una cadena.",
    controlCharacter: "Los caracteres de control deben ir escapados en las cadenas.",
    propertyName: (found) =>
      `Se esperaba un nombre de propiedad entre comillas, pero se encontró ${found}.`,
    colon: (found) =>
      `Se esperaba \`:\` después del nombre de la propiedad, pero se encontró ${found}.`,
    trailingComma: (bracket) => `Sobra una coma antes de \`${bracket}\`.`,
    commaOrBrace: (found) => `Se esperaba \`,\` o \`}\`, pero se encontró ${found}.`,
    commaOrBracket: (found) => `Se esperaba \`,\` o \`]\`, pero se encontró ${found}.`,
    value: (found) => `Se esperaba un valor JSON, pero se encontró ${found}.`,
    afterValue: (found) => `Sobra ${found} después del valor JSON.`,
  },
  paths: {
    importUrl: "No se permiten URL ni rutas con unidad; las referencias de red están desactivadas.",
    absolute: "No se permiten rutas absolutas.",
    separator: "Usa `/` como separador de rutas.",
    relative: "Las rutas empiezan por `./` o `../`.",
    extension: "Los archivos importados terminan en `.meltemi`.",
    emptySegment: "La ruta tiene un segmento vacío (`//`).",
    imageUrl: "No se permiten URL ni rutas con unidad; las imágenes son archivos del proyecto.",
    leavesProject: (path) => `${code(path)} sale de la carpeta del proyecto.`,
  },
  lookup: {
    notFound: (name, kinds, available) =>
      `${code(name)} no nombra ${blocks(kinds)} en este archivo ni en sus importaciones.` +
      (available.length > 0 ? ` Disponibles: ${available.join(", ")}.` : ""),
    wrongKind: (name, kind, kinds) => `${code(name)} es ${BLOCKS[kind]}, no ${blocks(kinds)}.`,
  },
  rename: {
    noEntity: (model, path) => `El modelo ${code(model)} no tiene la entidad ${code(path)}.`,
    invalidId: (id) => `${code(id)} no es un id válido; usa letras, dígitos y \`_\`.`,
    taken: (path, model) => `${code(path)} ya es una entidad del modelo ${code(model)}.`,
  },
};

/**
 * Las palabras de `push` y `pull` en español (`cli-cloud`), con la misma forma que
 * `push-pull-en.ts`; `es.ts` las cuelga de `help` y `cloud`.
 */

import { plural } from "@meltemi/diagrams-i18n";
import type { pushPullEn } from "./push-pull-en.js";

/** A count with its word: "1 archivo", "3 archivos". */
const count = (n: number, one: string, other: string) => `${n} ${plural("es", n, { one, other })}`;

export const pushPullEs: typeof pushPullEn = {
  help: {
    push: `Uso: push [carpeta] [opciones]

Hace que el proyecto de la nube coincida con la carpeta (por defecto, la carpeta de trabajo):
project.json, las hojas, los temas y los demás archivos de texto viajan por su contenido, las
imágenes y las fuentes por su hash, y lo que le falta a la carpeta se borra en la nube, todo en
una sola transacción. Los archivos con punto, node_modules, lo que project.json excluye y la
carpeta de salida del catálogo nunca se envían. El proyecto de la nube es el que nombra
--project, si no el "cloud" de project.json.

Antes de cambiar nada compara cada ruta con la de la nube y lista las que difieren, junto a la
revisión por id de los diagramas. Solo una nube que ya coincide con la carpeta se actualiza sin
preguntar; si no, a una terminal se le pregunta "¿Sobrescribir estos cambios en la nube?", y sin
terminal el push se rechaza salvo con --force. Un cambio hecho en la nube mientras se envía nunca
se sobrescribe sin esa pregunta (o --force).

Opciones:
  --create          Crear un proyecto nuevo en la nube con la carpeta y anotarlo en project.json
  --name <nombre>   Con --create, el nombre del proyecto; el de project.json por defecto
  --project <id>    El proyecto de la nube, en vez del "cloud" de project.json
  --force           Sobrescribir sin preguntar lo que difiere en la nube
  --check           No escribir nada; listar lo que difiere (sale con 1 si algo difiere)
  --strict          No enviar si la validación encuentra errores
  --host <url>      El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev

Códigos de salida: 0 enviado, o nada que enviar, 1 rechazado o fallido (o --check encontró
diferencias), 2 error de uso, 3 sin sesión iniciada o el servicio rechazó el token.
`,
    pull: `Uso: pull [<id>] [carpeta] [opciones]

Escribe los archivos de un proyecto de la nube en la carpeta (por defecto, la carpeta de trabajo).
El proyecto es <id> (20 letras y dígitos), si no el que nombra el "cloud" de project.json. Los
archivos que ya coinciden se dejan; un archivo que existe y difiere se lista y se conserva salvo
con --force; los archivos que solo están en la carpeta se quedan. Las imágenes y las fuentes se
traen por su hash y se comprueban. project.json recibe "cloud" si no lo tiene, y nada más de él
cambia.

Cada ruta de la nube se comprueba antes de escribir nada: una que no sea una ruta relativa simple
dentro de la carpeta (o que Windows no pudiera guardar) rechaza todo el pull con
pull.unsafe-path.

Opciones:
  --version <n>  Traer esta versión del proyecto en vez de sus últimos archivos
  --force        Sobrescribir los archivos que difieren
  --host <url>   El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev

Códigos de salida: 0 hecho, 1 rechazado, fallido o con archivos conservados, 2 error de uso,
3 sin sesión iniciada o el servicio rechazó el token.
`,
  },
  push: {
    nameNeedsCreate: "--name va con --create.",
    nameEmpty: "--name necesita un nombre.",
    createWithProject: "--create crea un proyecto nuevo, así que no se combina con --project.",
    checkWithCreate: "--check solo informa, así que no se combina con --create.",
    oneFolder: "push lleva una sola carpeta.",
    notAFolder: (path) => `${path} no es una carpeta.`,
    differs: (n) => `El proyecto de la nube difiere de la carpeta en ${count(n, "ruta", "rutas")}:`,
    pathAdded: (path) => `  ${path} todavía no está en la nube`,
    pathChanged: (path) => `  ${path} difiere`,
    pathDeleted: (path) => `  ${path} solo está en la nube (el push la borra)`,
    review: "Por id, lo que el push cambia en los diagramas:",
    identical: (id) =>
      `El proyecto ${id} de la nube ya coincide con la carpeta; no hay nada que enviar.`,
    overwrite: "¿Sobrescribir estos cambios en la nube? [s/N] ",
    retrying: "El proyecto de la nube cambió mientras se enviaba; se compara de nuevo.",
    checkDiffers: (n) =>
      `${n === 1 ? "difiere 1 ruta" : `difieren ${n} rutas`}; el push cambiaría el proyecto de la nube.`,
    created: (id, name) => `Se creó el proyecto ${id} en la nube (${name}).`,
    recorded: (path) => `Se anotó el proyecto de la nube en ${path}.`,
    pushed: (id, written, deleted, uploaded) => {
      const parts = [`${count(written, "archivo escrito", "archivos escritos")}`];
      if (deleted > 0) parts.push(count(deleted, "archivo borrado", "archivos borrados"));
      if (uploaded > 0)
        parts.push(count(uploaded, "imagen o fuente subida", "imágenes o fuentes subidas"));
      return `Enviado al proyecto ${id} de la nube: ${parts.join(", ")}.`;
    },
    open: (url) => `Ábrelo en ${url}`,
    notSent: (path, reason) => `advertencia: ${path} no se envía: ${reason}`,
    reasons: {
      path: "su nombre no es de los que guarda la nube (letras ASCII, dígitos, espacios y . _ ( ) + @ -, ningún nombre que empiece por punto, a lo sumo 12 nombres de 100 caracteres).",
      encoding: "no es texto UTF-8.",
      unreadable: (why) => `no se puede leer (${why}).`,
    },
    ignored: (n, examples) =>
      `${count(n, "archivo no se guarda", "archivos no se guardan")} en la nube (guarda diagramas, texto, imágenes y fuentes): ${examples}`,
    collision: (path) =>
      `${path} es una copia que dos personas hicieron a la vez en la nube; el push la deja como está. Resuélvelo en la página.`,
  },
  pull: {
    tooMany: "pull lleva como máximo un id y una carpeta.",
    version: (text) => `--version lleva un número de versión, como 3, no "${text}".`,
    wrote: (path) => `  se escribió ${path}`,
    kept: (path) => `  se conservó ${path} (difiere de la nube)`,
    inTheWay: (path) => `  se conservó ${path} (hay una carpeta en su lugar)`,
    keptHint: "Pasa --force para sobrescribir los archivos que difieren.",
    loser: (path) =>
      `  se omitió ${path}: una copia que dos personas hicieron a la vez en la nube; resuélvelo en la página`,
    recorded: (path) => `Se anotó el proyecto de la nube en ${path}.`,
    noManifest:
      "El proyecto no tiene project.json, así que nada en la carpeta anota qué proyecto de la nube refleja; da el id la próxima vez.",
    pulled: (id, version, folder, written, identical, kept) =>
      `${version === null ? "Se trajeron los últimos archivos" : `Se trajo la versión ${version}`} del proyecto ${id} de la nube a ${folder}: ${written} escritos, ${identical} ya idénticos, ${kept} conservados.`,
  },
  errors: {
    revisionMismatch:
      "el proyecto de la nube volvió a cambiar mientras se enviaba, así que no se sobrescribió nada. Ejecuta push otra vez.",
    quotaFiles: "un proyecto guarda como máximo 2000 archivos.",
    quotaBinary: (path) =>
      path === ""
        ? "una imagen o fuente puede pesar como máximo 10 MiB."
        : `${path} pesa más de los 10 MiB que puede tener una imagen o fuente.`,
    quotaStorage: "esta cuenta superaría sus 200 MiB de almacenamiento.",
    quotaProjects: "esta cuenta ya tiene 100 proyectos.",
    docTooLarge: (path) =>
      path === ""
        ? "los textos de la carpeta superan los 16 MiB que guarda el documento de un proyecto."
        : `${path} supera los 2 Mi caracteres que puede tener un archivo de texto.`,
    pathInvalid: (path) =>
      path === ""
        ? "una ruta no es de las que guarda la nube."
        : `${path} no es una ruta de las que guarda la nube.`,
    binaryInvalid: (path) =>
      `${path === "" ? "una subida" : path} no es un PNG, JPEG, GIF, WebP, woff2, ttf u otf según sus bytes.`,
    pushDiffers: (n) =>
      `el proyecto de la nube difiere de la carpeta en ${count(n, "ruta", "rutas")}, así que no se envió nada. Ejecuta push en una terminal para que te pregunte, o pasa --force.`,
    pushDeclined: "no se envió nada.",
    pushLinked: (project) =>
      `project.json ya nombra el proyecto ${project} de la nube: haz push sin --create, o quita su ajuste "cloud" para crear otro.`,
    pushStrict: (errors, unsent) => {
      const parts: string[] = [];
      if (errors > 0) parts.push(count(errors, "error de validación", "errores de validación"));
      if (unsent > 0) {
        parts.push(
          count(unsent, "archivo que no se puede enviar", "archivos que no se pueden enviar"),
        );
      }
      return `${parts.join(" y ")}, y se pasó --strict, así que no se envió nada.`;
    },
    pushManifestInvalid: (reason) =>
      `project.json no es un objeto JSON que se pueda editar (${reason}); corrígelo antes de --create. No se creó nada.`,
    pushManifestNotWritten: (project, host, reason) =>
      `el proyecto ${project} de la nube se creó con los archivos de texto de la carpeta, pero no se pudo actualizar project.json (${reason}). Añádele tú "cloud": { "host": "${host}", "project": "${project}" } y ejecuta push.`,
    pushFileChanged: (path) =>
      `${path} cambió mientras se enviaba; no se guardó nada de él. Ejecuta push otra vez.`,
    pullNoProject:
      "no se nombra ningún proyecto de la nube: da su id, o ejecuta pull en una carpeta cuyo project.json tenga un ajuste cloud.",
    pullOtherProject: (project, linked) =>
      `project.json ya nombra el proyecto ${linked} de la nube; traer ${project} aquí mezclaría los dos. Trae el proyecto a otra carpeta.`,
    pullNotAFolder: (path) => `${path} existe y no es una carpeta.`,
    pullManifestNotUpdated: (reason) =>
      `no se pudo actualizar project.json con el proyecto de la nube (${reason}); los demás archivos se escribieron.`,
    pullWrite: (path, reason) => `no se puede escribir ${path}: ${reason}`,
  },
};

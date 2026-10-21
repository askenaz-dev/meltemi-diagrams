import { decimal } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

const code = (value: string) => `\`${value}\``;
/** A number in prose, with the decimal comma. */
const n = (value: number) => decimal("es", value, 6);
/** A reason that follows a colon: Spanish starts it in lower case. */
const lower = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
/** A version of the lock, or none. */
const version = (value: string | null) => (value === null ? "ninguna" : value);

/** The words of assets in Spanish. */
export const es: typeof en = {
  xml: {
    textAfterRoot: "Hay texto después del elemento raíz.",
    unterminatedComment: "Comentario sin terminar.",
    unterminatedInstruction: "Instrucción de procesamiento sin terminar.",
    unterminatedCdata: "Sección CDATA sin terminar.",
    declarations: "No se permiten DTD ni declaraciones de entidades (`<!DOCTYPE`, `<!ENTITY`).",
    malformedClosingTag: "Etiqueta de cierre mal formada.",
    closingTag: (name) =>
      `La etiqueta de cierre ${code(`</${name}>`)} no coincide con su etiqueta de apertura.`,
    malformedTag: "Etiqueta mal formada.",
    secondRoot: "El documento tiene más de un elemento raíz.",
    unterminatedTag: (name) => `Etiqueta ${code(`<${name}`)} sin terminar.`,
    malformedAttribute: (element) => `Atributo mal formado en ${code(`<${element}>`)}.`,
    noValue: (attribute) => `El atributo ${code(attribute)} no tiene valor.`,
    unquotedValue: (attribute) => `El valor de ${code(attribute)} no está entre comillas.`,
    unterminatedValue: (attribute) => `Valor de ${code(attribute)} sin terminar.`,
    lessThanInValue: (attribute) => `Hay un \`<\` en el valor de ${code(attribute)}.`,
    entity: (entity) => `No se permite la entidad ${code(entity)}.`,
    repeatedAttribute: (attribute) => `El atributo ${code(attribute)} está repetido.`,
    tooManyElements: (max) => `Hay más de ${n(max)} elementos.`,
    tooDeep: (max) => `Hay elementos anidados en más de ${n(max)} niveles.`,
    unclosedElement: (name) => `Elemento ${code(`<${name}>`)} sin cerrar.`,
    noRoot: "El documento no tiene elemento raíz.",
  },
  icons: {
    element: (name) => `${code(`<${name}>`)} no se permite en los iconos.`,
    stopOutsideGradient: "`<stop>` está fuera de un degradado.",
    children: (name) => `${code(`<${name}>`)} no puede contener elementos.`,
    eventAttribute: (name) => `No se permite el atributo de evento ${code(name)}.`,
    link: (name, value) => `No se permite el enlace \`${name}="${value}"\` en los iconos.`,
    reference: (name, value) =>
      `${code(name)} hace referencia a ${code(value)}; solo se puede hacer referencia a degradados del mismo archivo.`,
    colour: (value) => `No se puede leer el color ${code(value)}.`,
    number: (value) => `No se puede leer el número ${code(value)}.`,
    opacity: (value) => `No se puede leer la opacidad ${code(value)}.`,
    transform: (value) => `No se puede leer la transformación ${code(value)}.`,
    points: (element) => `No se pueden leer los puntos de ${code(`<${element}>`)}.`,
    pathDataSize: (kilobytes) => `Hay más de ${n(kilobytes)} KB de datos de trazado.`,
    pathData: "No se pueden leer los datos del trazado.",
    gradientId: "Un degradado necesita un `id` simple.",
    gradientCoordinate: (key, value) =>
      `No se puede leer la coordenada de degradado \`${key}="${value}"\`.`,
    gradientElement: (name) => `${code(`<${name}>`)} no se permite en un degradado.`,
    stopColour: (value) => `No se puede leer el color de parada ${code(value)}.`,
    gradientTwice: (id) => `El degradado ${code(id)} está definido dos veces.`,
    fileSize: (kilobytes) => `El archivo ocupa más de ${n(kilobytes)} KB.`,
    root: "El elemento raíz no es `<svg>`.",
    viewBox: "El icono no tiene `viewBox`, `width` ni `height` legibles.",
    aliasWithoutParent: (name) => `El alias ${code(name)} no tiene un icono padre.`,
    noBody: (name) => `El icono ${code(name)} no tiene \`body\`.`,
  },
  images: {
    fileSize: (megabytes) => `El archivo ocupa más de ${n(megabytes)} MB.`,
    format: "El archivo no es una imagen PNG, JPEG, GIF, WebP o SVG.",
    brokenHeader: (format) => `La cabecera ${format} está dañada o incompleta.`,
    unsafeSvg: (reason) => `No se puede sanear su SVG: ${lower(reason)}`,
  },
  lock: {
    packAdded: (prefix) => `el paquete de iconos ${code(prefix)} no está en el archivo de bloqueo`,
    packRemoved: (prefix) =>
      `el paquete de iconos ${code(prefix)} está en el archivo de bloqueo, pero ya no existe`,
    packVersion: (prefix, before, after) =>
      `el paquete de iconos ${code(prefix)} cambió de versión, de ${version(before)} a ${version(after)}`,
    packContent: (prefix) => `el contenido del paquete de iconos ${code(prefix)} cambió`,
    packLicense: (prefix) => `la licencia del paquete de iconos ${code(prefix)} cambió`,
    fontAdded: (path) => `la fuente ${code(path)} no está en el archivo de bloqueo`,
    fontRemoved: (path) =>
      `la fuente ${code(path)} está en el archivo de bloqueo, pero ya no existe`,
    fontContent: (path) => `el contenido de la fuente ${code(path)} cambió`,
    fontLicense: (path) => `la licencia de la fuente ${code(path)} cambió`,
    pluginAdded: (name) => `el plugin ${code(name)} no está en el archivo de bloqueo`,
    pluginRemoved: (name) =>
      `el plugin ${code(name)} está en el archivo de bloqueo, pero ya no está instalado`,
    pluginVersion: (name, before, after) =>
      `el plugin ${code(name)} cambió de versión, de ${before} a ${after}`,
    pluginContent: (name) => `el contenido del plugin ${code(name)} cambió`,
    pluginMoved: (name, path) => `el plugin ${code(name)} se movió a ${code(path)}`,
  },
};

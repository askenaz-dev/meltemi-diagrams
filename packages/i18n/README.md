# @meltemi/diagrams-i18n

The languages of Meltemi Diagrams: the supported locales (English and Spanish), the resolution of
language tags, the interface language of a process or a page, typed catalogs, and formatting of
counts, lists and decimals by language.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-i18n
```

Node 22.12.0 or later. The package is an ES module with type declarations and no dependencies.

## Use

```ts
import { catalog, list, resolveLocale, setLocale } from "@meltemi/diagrams-i18n";

// A catalog per package: the Spanish object has the English one's type.
const en = { saved: (n: number) => `Saved ${n} file${n === 1 ? "" : "s"}.` };
const es: typeof en = {
  saved: (n: number) => `${n === 1 ? "Guardado" : "Guardados"} ${n} archivo${n === 1 ? "" : "s"}.`,
};
const t = catalog(en, es);

setLocale(resolveLocale("es_CL.UTF-8"));
console.log(t().saved(2) === "Guardados 2 archivos."); // true
console.log(t("en").saved(1) === "Saved 1 file."); // true
console.log(list("es", ["SVG", "PNG", "PDF"]) === "SVG, PNG y PDF"); // true
```

- `resolveLocale(tag)` maps `es`, `es-CL`, `es-419` or `es_ES.UTF-8` to `"es"` and anything else to
  `"en"`; `localeFromEnv(env)` reads `MELTEMI_LANG`, `LC_ALL`, `LC_MESSAGES` and `LANG`.
- `getLocale()` and `setLocale()` hold the interface language of a process or a page. Content
  written to files (drawings, HTML players, catalogs) passes an explicit locale instead, so exports
  do not depend on the machine.
- `catalog(en, es)` returns a function of the locale; without one it uses the interface language.
- `plural`, `list`, `decimal`, `seconds` and `percent` format with `Intl` and an explicit locale.
- `untranslated(en, es, same)` lists the strings a Spanish catalog leaves in English, for tests.

## Writing Spanish

Neutral Spanish, the same terms everywhere:

- Commands and buttons are infinitives ("Exportar SVG", "Abrir el lienzo al lado"); sentences that
  address the person use "tú" ("Elige un elemento").
- Code stays as written and in backticks: keywords, values, ids, paths and property names
  (`` `arrowhead` ``, `` `layout manual` ``). The product name, "Meltemi Diagrams", and UML fragment
  operators (`alt`, `loop`) are not translated.
- Numbers use the comma for decimals in prose ("1,2 s"); values written in the language keep the
  dot (`place a at (10.5, 20)`).

| English          | Español                 | English          | Español                  |
| ---------------- | ----------------------- | ---------------- | ------------------------ |
| diagram          | diagrama                | canvas           | lienzo                   |
| node             | nodo                    | decision         | decisión                 |
| data store       | almacén de datos        | note             | nota                     |
| tag              | marca                   | group            | grupo                    |
| box              | caja                    | text             | texto                    |
| icon             | icono                   | image            | imagen                   |
| relation         | relación                | message          | mensaje                  |
| participant      | participante            | actor            | actor                    |
| fragment         | fragmento               | scenario         | escenario                |
| label            | etiqueta                | description      | descripción              |
| arrowhead, head  | punta                   | line             | línea                    |
| route            | ruta                    | waypoint         | punto de paso            |
| port             | puerto                  | corner           | esquina                  |
| layout           | disposición             | grid             | cuadrícula               |
| inspector        | inspector               | strip            | barra de estilo          |
| theme            | tema                    | token            | token                    |
| style            | estilo                  | class            | clase                    |
| rule             | regla                   | effect           | efecto                   |
| flow particles   | partículas              | moving dash      | trazo en movimiento      |
| pulse            | pulso                   | trace            | recorrido                |
| story            | historia                | scene            | escena                   |
| timeline         | línea de tiempo         | player           | reproductor              |
| catalog          | catálogo                | export           | exportar                 |
| project          | proyecto                | file             | archivo                  |
| model            | modelo                  | view             | vista                    |
| entity           | entidad                 | container        | contenedor               |
| component        | componente              | software system  | sistema de software      |
| person           | persona                 | boundary         | límite                   |
| free composition | composición libre       | playground       | playground               |
| warning          | advertencia             | error            | error                    |
| hint             | pista                   | quick fix        | corrección rápida        |
| undo, redo       | deshacer, rehacer       | selection        | selección                |
| lifeline         | línea de vida           | activation       | activación               |
| toolbar          | barra de herramientas   | palette          | paleta                   |
| minimap          | minimapa                | guides           | guías                    |
| snap to grid     | ajustar a la cuadrícula | zoom to fit      | ajustar a la vista       |
| shortcut         | atajo                   | swatch           | muestra                  |
| fill             | relleno                 | stroke (outline) | borde                    |
| width, height    | ancho, alto             | font, size       | fuente, tamaño           |
| opacity          | opacidad                | layer            | capa                     |
| link             | enlace                  | direction        | dirección                |
| duration         | duración                | speed            | velocidad                |
| delay            | retraso                 | repeat           | repetir                  |
| default          | predeterminado          | inherited        | heredado                 |
| mixed            | mixto                   | none             | ninguno                  |
| light, dark      | claro, oscuro           | preview          | vista previa             |
| play, pause      | reproducir, pausar      | loop             | repetir en bucle         |
| search           | buscar                  | settings         | ajustes                  |
| add              | agregar                 | remove           | quitar                   |
| delete           | eliminar                | video            | video                    |
| arrange          | organizar               | recompute        | recalcular               |
| open             | abrir                   | show the source  | mostrar el código fuente |
| whiteboard       | pizarra                 | board            | tablero                  |
| pen              | lápiz                   | stroke (drawn)   | trazo                    |
| highlighter      | marcador                | eraser           | borrador                 |
| sticky           | nota adhesiva           | list             | lista                    |
| column           | columna                 | row              | fila                     |

## Documentation

- [The repository's documentation](https://github.com/askenaz-dev/meltemi-diagrams/tree/main/docs#readme)

## Licence

MIT.

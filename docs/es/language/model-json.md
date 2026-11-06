# JSON del modelo 0.1

[English](../../language/model-json.md)

`toJson(compile(text))` de `@meltemi/diagrams-model` convierte una compilación en JSON para otras
herramientas: `meltemi-diagrams convert <file> --to json` lo escribe (`docs/cli.md`), la app web
lo descarga, y los motores de disposición y otras aplicaciones lo leen. El nombre del formato es
`model-json` y esta página describe la versión `0.1`. Un cambio incompatible aumenta la versión.

## Reglas

- Las claves se emiten en el orden en que aparecen en esta página, así que la salida es estable y
  fácil de comparar con un diff.
- Los diagramas con algún error quedan fuera de `diagrams`; sus problemas están en `diagnostics`.
- Cada elemento, relación e instrucción lleva el `range` de su instrucción en el código fuente.
- Las relaciones anónimas aparecen con su `key` sintética (`<from>-><to>#<n>`) e `id: null`.
- Dentro de una versión las claves se agregan, nunca cambian: `heads` en las relaciones y `line`
  en los elementos llegaron en 1.10.0, `pen` y `list` en los elementos, `tags` en los elementos y
  las relaciones, `spacing`, `side`, `returns` y los `events` de los mensajes, y `scenes` en los
  perfiles de exportación en 1.11.0, `task` en los elementos y `gantt` en los diagramas en 1.11.16,
  y la versión sigue siendo `0.1`.
- Todos los perfiles de diagrama se compilan; `stories` y `exports`, en el nivel superior,
  contienen los bloques correspondientes.

## Documento

```json
{
  "format": "model-json",
  "version": "0.1",
  "language": "0.2",
  "ok": true,
  "imports": [],
  "diagrams": [],
  "themes": [],
  "models": [],
  "stories": [],
  "exports": [],
  "diagnostics": []
}
```

| Clave         | Tipo          | Significado                                                                       |
| ------------- | ------------- | --------------------------------------------------------------------------------- |
| `format`      | cadena        | Siempre `model-json`.                                                             |
| `version`     | cadena        | Versión de este formato.                                                          |
| `language`    | cadena o null | Versión del encabezado `language`; null si no hay encabezado.                     |
| `ok`          | booleano      | Verdadero cuando ningún diagnóstico tiene la gravedad `error`.                    |
| `imports`     | lista         | Instrucciones `import` del archivo, en el orden del código fuente.                |
| `diagrams`    | lista         | Diagramas compilados sin errores, en el orden del código fuente.                  |
| `themes`      | lista         | Definiciones de temas del archivo, en el orden del código fuente.                 |
| `models`      | lista         | Bloques `model`, en el orden del código fuente (véase Vistas C4 y modelos).       |
| `stories`     | lista         | Bloques `story`, en el orden del código fuente (véase Historias).                 |
| `exports`     | lista         | Perfiles `export`, en el orden del código fuente (véase Perfiles de exportación). |
| `diagnostics` | lista         | Todos los diagnósticos, ordenados por posición.                                   |

## Importación

```json
{
  "form": "members",
  "path": "../themes/company.meltemi",
  "bindings": [{ "name": "corp", "member": "corporate" }],
  "range": {
    "start": { "offset": 15, "line": 2, "column": 1 },
    "end": { "offset": 70, "line": 2, "column": 56 }
  }
}
```

| Clave      | Tipo          | Significado                                                                                      |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `form`     | cadena        | `namespace` (`import "<path>" as <ns>`) o `members` (`import <id> from "<path>"`).               |
| `path`     | cadena o null | La ruta tal como se escribió; null si falta.                                                     |
| `bindings` | lista         | Nombres vinculados; `member` es el id importado, null en una importación con espacio de nombres. |
| `range`    | rango         | La instrucción completa.                                                                         |

Las rutas y los nombres se resuelven en la compilación de proyectos (`docs/language/projects.md`).

## Rango

```json
{
  "start": { "offset": 167, "line": 9, "column": 3 },
  "end": { "offset": 184, "line": 9, "column": 20 }
}
```

Este es el rango de `client["Cliente"]` en `corpus/valid/checkout.meltemi`. Los desplazamientos
cuentan unidades de código UTF-16 desde el principio del archivo. Las líneas y las columnas empiezan
en 1. `end` es exclusivo.

## Diagrama

| Clave        | Tipo   | Significado                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | cadena | Id del diagrama.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `type`       | cadena | `flow`, `free`, `sequence`, `c4` o `gantt`.                                                                                                                                                                                                                                                                                                                                                                          |
| `range`      | rango  | El bloque `diagram` completo.                                                                                                                                                                                                                                                                                                                                                                                        |
| `properties` | objeto | `direction`, `layout` (con los valores predeterminados aplicados), `theme`, `title`, `description`, `preset` (`document`, `slide`, `board` o null), `canvas` (`{ "width", "height" }` o null), `routing`, `layers` (de atrás hacia adelante; `["main"]` en los diagramas de flujo), `autonumber` (el primer número, o null), `spacing` (la distancia entre las cabeceras de secuencia tal como se escribió, o null). |
| `classes`    | lista  | Declaraciones `class <id> { }`, en el orden del código fuente.                                                                                                                                                                                                                                                                                                                                                       |
| `rules`      | lista  | Instrucciones `rule <kind> { }`, en el orden del código fuente.                                                                                                                                                                                                                                                                                                                                                      |
| `elements`   | lista  | Elementos en el orden del código fuente.                                                                                                                                                                                                                                                                                                                                                                             |
| `relations`  | lista  | Relaciones en el orden del código fuente.                                                                                                                                                                                                                                                                                                                                                                            |
| `placement`  | lista  | Instrucciones `place`, `size`, `route` y `label` en el orden del código fuente.                                                                                                                                                                                                                                                                                                                                      |
| `styles`     | lista  | Una entrada por cada instrucción `style`.                                                                                                                                                                                                                                                                                                                                                                            |
| `animations` | lista  | Una entrada por cada instrucción `animate`.                                                                                                                                                                                                                                                                                                                                                                          |

### Elemento

| Clave         | Tipo          | Significado                                                                                                                                                                                                                      |
| ------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | cadena        | Id del elemento.                                                                                                                                                                                                                 |
| `kind`        | cadena        | `node`, `decision`, `data`, `group`, `note` o `tag`; en las composiciones libres, `box`, `text`, `icon`, `image`, `note`, `sticky`, `line`, `pen` o `group`; en los diagramas de secuencia, los tipos de participante o `group`. |
| `label`       | cadena        | Texto visible; de forma predeterminada, el id.                                                                                                                                                                                   |
| `implicit`    | booleano      | Verdadero cuando solo una relación menciona el elemento.                                                                                                                                                                         |
| `description` | cadena o null | De un bloque de elemento o de grupo.                                                                                                                                                                                             |
| `url`         | cadena o null | La `url` del bloque, o la de la entidad en las vistas C4.                                                                                                                                                                        |
| `classes`     | lista         | Nombres de las clases aplicadas en el bloque de la declaración, en orden.                                                                                                                                                        |
| `tags`        | lista         | Las instrucciones `tag "Text"` del bloque de un participante de secuencia en el orden del código fuente, cada una `{ "text", "range" }` con el rango de su instrucción; vacía en todos los demás elementos.                      |
| `ports`       | lista         | Puertos con nombre: `{ "name", "side", "position" }`.                                                                                                                                                                            |
| `layer`       | cadena o null | La `layer` del bloque (composiciones libres).                                                                                                                                                                                    |
| `link`        | objeto o null | `{ "binding", "diagram", "element" }`; `binding` es null en los enlaces dentro del mismo archivo.                                                                                                                                |
| `source`      | cadena o null | La referencia del icono o la ruta de la imagen de los objetos `icon` e `image`.                                                                                                                                                  |
| `shape`       | cadena o null | La forma que implica la declaración: `cylinder` para `id[("…")]`, null en los demás casos. Una `shape` escrita en un estilo queda en `styles`.                                                                                   |
| `line`        | objeto o null | Los puntos de un objeto `line` libre, en el interior de su grupo: `{ "from": { "x", "y" }, "to": { "x", "y" }, "via": [ { "x", "y" }, … ] }`; null en todos los demás tipos.                                                     |
| `pen`         | objeto o null | Los puntos de un trazo `pen` tal como se escribieron, con los decimales, en el interior de su grupo: `{ "points": [ { "x", "y" }, … ] }`; null en todos los demás tipos.                                                         |
| `list`        | objeto o null | Cómo una lista coloca a sus hijos: `{ "layout", "spacing", "align" }`, `layout` `column` o `row`, `spacing` y `align` null cuando no se escriben; null en todos los demás elementos.                                             |
| `attachedTo`  | cadena o null | El elemento al que está adjunta una `note` (`on <elemento>`; la ruta de la entidad en una vista C4); null en los demás tipos y en una nota sin `on`.                                                                             |
| `task`        | objeto o null | Diagramas de Gantt: las cláusulas escritas y la programación resuelta de una tarea, un hito o una marca (véase Diagramas de Gantt); null en los demás elementos.                                                                 |
| `groupPath`   | lista         | Ids de los grupos que lo contienen, primero el más externo.                                                                                                                                                                      |
| `range`       | rango         | La instrucción que lo declara, o la primera mención en los elementos implícitos.                                                                                                                                                 |
| `idRange`     | rango         | El token del identificador.                                                                                                                                                                                                      |

### Relación

| Clave         | Tipo          | Significado                                                                                                                                                                              |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`         | cadena        | El id, o `<from>-><to>#<n>` si es anónima.                                                                                                                                               |
| `id`          | cadena o null | El nombre de `as <id>`.                                                                                                                                                                  |
| `from`, `to`  | cadena        | Ids de elementos.                                                                                                                                                                        |
| `line`        | cadena        | `solid` (`->`, `--`, `<->`) o `dashed` (`-->`, `---`, `<-->`).                                                                                                                           |
| `twoWay`      | booleano      | Escrita con `<->` o `<-->`.                                                                                                                                                              |
| `heads`       | cadena        | `end` (`->`, `-->`), `both` (`<->`, `<-->`) o `none` (`--`, `---`), en todos los perfiles.                                                                                               |
| `async`       | booleano      | `kind async` en un mensaje de secuencia.                                                                                                                                                 |
| `returns`     | cadena o null | La clave de la llamada a la que responde un `return` de secuencia; null en las demás relaciones.                                                                                         |
| `label`       | cadena o null | Texto después de `:`.                                                                                                                                                                    |
| `description` | cadena o null | Del bloque de la relación.                                                                                                                                                               |
| `classes`     | lista         | Nombres de las clases aplicadas en el bloque de la relación.                                                                                                                             |
| `tags`        | lista         | Las instrucciones `tag "Text"` del bloque de un mensaje de secuencia (también de un `return`) en el orden del código fuente, como en los elementos; vacía en todas las demás relaciones. |
| `layer`       | cadena o null | La `layer` del bloque (composiciones libres).                                                                                                                                            |
| `groupPath`   | lista         | Grupos que contienen la instrucción de la relación.                                                                                                                                      |
| `range`       | rango         | La instrucción de la relación.                                                                                                                                                           |
| `idRange`     | rango o null  | El identificador de `as <id>`.                                                                                                                                                           |

### Entradas de colocación

Cada entrada tiene `statement`, `target`, `range` y `targetRange`, además de:

| `statement` | Claves adicionales                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `place`     | `x`, `y`: centro del elemento en unidades lógicas.                                                                                                                                |
| `size`      | `width`, `height`.                                                                                                                                                                |
| `route`     | `from` y `to` como `{ "element", "port" }`, con `"position"` (un porcentaje) cuando el extremo está fijado en un punto de su lado; `via` como una lista de puntos `{ "x", "y" }`. |
| `label`     | `at`: porcentaje a lo largo de la ruta; `offset` como `{ "x", "y" }`.                                                                                                             |
| `space`     | `amount`: espacio adicional encima de un mensaje, una nota o un fragmento de secuencia, o debajo; `side`: `before` (encima) o `after` (debajo).                                   |
| `gap`       | `amount`: espacio adicional a la izquierda de un participante de secuencia, o a su derecha, negativo para acercarlo; `side`: `before` (izquierda) o `after` (derecha).            |

En `route` y `label`, `target` es la clave de la relación; en `space`, el id del evento. `side` es
`before` cuando la instrucción no escribe ninguno.

### Entradas de estilo y de animación

| Clave         | Tipo                       | Significado                                                                  |
| ------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `target`      | cadena                     | Id de elemento, id de relación, o el id de una nota o de un fragmento.       |
| `targetKind`  | cadena                     | `element`, `relation` o `event`.                                             |
| `properties`  | objeto                     | Solo estilos: propiedades explícitas ordenadas por nombre (véase más abajo). |
| `classes`     | lista                      | Solo estilos: nombres de las clases que aplica la instrucción, en orden.     |
| `effect`      | cadena o null              | Solo animaciones: `flow`, `pulse`, `dash` o `trace`.                         |
| `durationMs`  | número o null              | Solo animaciones: duración en milisegundos.                                  |
| `repeat`      | número, `"forever"` o null | Solo animaciones.                                                            |
| `delayMs`     | número o null              | Solo animaciones: retraso en milisegundos.                                   |
| `direction`   | cadena o null              | Solo animaciones: `forward` o `reverse`.                                     |
| `particles`   | número o null              | Solo animaciones: partículas de un efecto `flow`.                            |
| `color`       | cadena o null              | Solo animaciones: un color, o `@<token>` para un token del tema.             |
| `range`       | rango                      | La instrucción.                                                              |
| `targetRange` | rango                      | El identificador del destino.                                                |

Las propiedades de estilo conservan sus tipos: `width` es un número, las palabras como `dashed` o
`hatch` son cadenas, y un color escrito como nombre de un token del tema (`stroke danger`) es la
cadena `@danger`. Un color entre comillas se conserva tal como se escribió, así que nunca empieza por
`@`. `verticalAlign top` es la cadena `top`, igual que `textAlign left` es `left`, y
`opacity 0.35` es el número `0.35`. `font "Roboto"` es la cadena `Roboto`, y `fontSize 16` el
número `16`.

### Entradas de clase y de regla

| Clave        | Tipo   | Significado                                                                          |
| ------------ | ------ | ------------------------------------------------------------------------------------ |
| `id`         | cadena | Solo clases: el id de la clase.                                                      |
| `kind`       | cadena | Solo reglas: un tipo de elemento del perfil, `relation` o `fragment`.                |
| `properties` | objeto | Propiedades de estilo ordenadas por nombre, con los tipos de las entradas de estilo. |
| `range`      | rango  | La instrucción.                                                                      |

### Vistas C4 y modelos

Las vistas C4 agregan un objeto `c4` después de `scenarios` (null en los demás diagramas): `model`
(tal como se escribió), `level`, `scope`, `includes` (null cuando la vista dibuja su conjunto
predeterminado), `excludes`, `labels` (`{ "target", "targetKind", "text", "range" }`) y `combined`
(las claves de las combinaciones). Sus elementos llevan `entity` (`{ "model", "path", "file" }`, con
`file` null para un modelo del mismo archivo), `technology` y `external`; sus relaciones llevan
`technology`, `sources` (las claves de las relaciones del modelo que representan) y `derived`. Los
demás diagramas tienen `entity: null`, `technology: null`, `external: false`, `sources: []` y
`derived: false`.

El documento lista `models` después de `themes`:

| Clave       | Tipo   | Significado                                                                                                                                        |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | cadena | Id del modelo.                                                                                                                                     |
| `range`     | rango  | El bloque `model`.                                                                                                                                 |
| `entities`  | lista  | `{ "path", "id", "kind", "label", "description", "technology", "external", "url", "parent", "range", "idRange" }`, los padres antes que los hijos. |
| `relations` | lista  | `{ "key", "id", "from", "to", "label", "technology", "description", "range" }`; `from` y `to` son rutas.                                           |

### Eventos y escenarios de secuencia

Los diagramas de secuencia agregan `events` y `scenarios` después de `animations`; en los demás
diagramas, los dos están vacíos. Los eventos están en orden; los fragmentos contienen los eventos
de sus ramas, y los mensajes, los eventos de los bloques de sus llamadas.

| `kind`                                        | Claves además de `kind`, `key` y `range`                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`                                     | `relation`: la clave de la relación, que también es la clave del evento; `events`: los eventos del bloque de su llamada, vacío si no lo tiene. Un `return` también es un mensaje. |
| `activate`, `deactivate`, `create`, `destroy` | `participant`.                                                                                                                                                                    |
| `note`                                        | `id` (o null), `position` (`over`, `left`, `right`), `participants`, `text`.                                                                                                      |
| `fragment`                                    | `id` (o null), `operator`, `branches`: `{ "condition" (or null), "events", "range" }`.                                                                                            |
| `divider`                                     | `label`.                                                                                                                                                                          |
| `delay`                                       | `label` (o null).                                                                                                                                                                 |

Los eventos sin id tienen la clave `<kind>#<n>` (`activate#1`, `note#2`; los fragmentos usan su
operador, `alt#1`).

| Clave     | Tipo   | Significado                                                                                                         |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `id`      | cadena | Id del escenario.                                                                                                   |
| `label`   | cadena | La etiqueta, o el id.                                                                                               |
| `choices` | lista  | `{ "kind" (choose, repeat, skip, take), "fragment", "branch" (0-based or null), "iterations" (or null), "range" }`. |
| `range`   | rango  | El bloque `scenario`.                                                                                               |

### Diagramas de Gantt

Un diagrama de Gantt tiene `type` `gantt`. Sus secciones, tareas, hitos y marcas son elementos de los
tipos `section`, `task`, `milestone` y `marker`, en el orden en que se escribieron, y el `groupPath`
de una tarea es su sección; cada id de una cláusula `after` es una relación con `derived` verdadero,
con la clave `<pred>-><task>#<n>` y el rango del id en la cláusula
([gantt.md](gantt.md#dependencias)). Dos claves van después de todas las demás: `task` en cada
elemento y `gantt` en cada diagrama.

`task` es null en todos los elementos salvo una tarea, un hito o una marca:

| Clave         | Tipo          | Significado                                                                                                                                                |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`        | cadena o null | La fecha escrita después de `from` (después de `at` en un hito o una marca), tal como se escribió.                                                         |
| `after`       | lista         | Los ids escritos en `after`, en orden.                                                                                                                     |
| `end`         | objeto o null | `{ "kind": "for", "amount", "unit" }`, `{ "kind": "to", "date" }` o `{ "kind": "until", "ids" }`; null cuando la instrucción no escribe un final.          |
| `status`      | cadena o null | `done` o `active`; null para una planificada.                                                                                                              |
| `critical`    | booleano      | Si se escribe `critical`.                                                                                                                                  |
| `start`       | cadena o null | El inicio resuelto como texto ISO sin zona horaria (`2026-06-08T00:00`); null cuando nada lo fecha: un ciclo, nada a lo que seguir.                        |
| `finish`      | cadena o null | El final resuelto: la medianoche siguiente al último día de una tarea que termina al final de un día; el inicio de un hito o una marca; null como `start`. |
| `workingDays` | número o null | El tiempo hábil entre `start` y `finish` en días, con fracciones para las horas; null como `start`.                                                        |

`gantt` es null en todos los diagramas salvo un diagrama de Gantt, y contiene sus ajustes con los
valores predeterminados aplicados:

| Clave                                       | Tipo          | Significado                                                                                                                              |
| ------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `axisFormat`, `ticks`                       | cadena o null | Tal como se escribieron.                                                                                                                 |
| `weekStart`                                 | cadena        | `monday` a `sunday`; `monday` sin la instrucción.                                                                                        |
| `axis`, `labels`, `display`, `dependencies` | cadena        | Los valores escritos, o `bottom`, `bar`, `normal` y `shown`.                                                                             |
| `dayWidth`                                  | número o null | Tal como se escribió.                                                                                                                    |
| `exclude`                                   | objeto        | `{ "weekdays", "dates" }`: los días de la semana en el orden de la semana (`weekends` es `saturday` y `sunday`) y las fechas, ordenadas. |
| `include`                                   | lista         | Las fechas que se trabajan a pesar de una exclusión, ordenadas.                                                                          |
| `today`                                     | objeto o null | `{ "date" }`, la fecha escrita o null cuando `today` no escribe ninguna; null sin la instrucción.                                        |
| `span`                                      | objeto o null | `{ "start", "end" }` como texto ISO: del primer inicio al último final; null cuando nada tiene fecha.                                    |

`corpus/valid/gantt/roadmap.model.json` es el JSON del plan de [gantt.md](gantt.md#un-ejemplo-completo).

### Historias

El documento lista `stories` después de `models`, en el orden del código fuente, con los tiempos en
milisegundos desde el inicio de la historia ([stories.md](stories.md)):

| Clave         | Tipo          | Significado                                                                             |
| ------------- | ------------- | --------------------------------------------------------------------------------------- |
| `id`          | cadena        | Id de la historia.                                                                      |
| `target`      | cadena        | El diagrama después de `for`, tal como se escribió.                                     |
| `title`       | cadena o null | El `title`.                                                                             |
| `description` | cadena o null | La `description`.                                                                       |
| `durationMs`  | número        | Cuánto dura la historia.                                                                |
| `scenes`      | lista         | `{ "id", "title", "view", "transition", "startMs", "durationMs", "actions", "range" }`. |
| `range`       | rango         | El bloque `story`.                                                                      |

El `view` de una escena es el diagrama que muestra, tal como se escribió; `transition` es
`{ "kind", "startMs", "durationMs" }` o null. Las acciones son
`{ "kind", "targets", "all", "startMs", "durationMs", "children", "range" }`, con los valores
predeterminados aplicados; una acción `parallel` contiene sus acciones en `children` y dura tanto
como la más larga. Una acción `draw` se lleva como un `trace`: sus destinos en orden y su tiempo,
800 ms cuando no se escribe.

### Perfiles de exportación

El documento lista `exports` después de `stories`, en el orden del código fuente:
`{ "id", "target", "targetKind" ("diagram", "story" or null), "format", "size", "scale", "background", "atMs", "motion", "theme", "fonts", "scenario", "link", "fps", "durationMs", "file", "autoplay", "loop", "embed", "scenes", "range" }`,
con null en las opciones que no se escriben ([export.md](export.md)).

## Tema

| Clave     | Tipo          | Significado                                                                                                                                                                                                                          |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`      | cadena        | Id del tema.                                                                                                                                                                                                                         |
| `extends` | cadena o null | Nombre del tema base, o null para `technical.light`.                                                                                                                                                                                 |
| `tokens`  | objeto        | Valores de los tokens ordenados por nombre, tal como se escribieron (entre ellos `highlight`, `sticky` y `stickyText`); los tamaños y los anchos son números, y las palabras como `sketch rough`, cadenas (`{ "sketch": "rough" }`). |
| `classes` | lista         | Entradas de clase del bloque del tema.                                                                                                                                                                                               |
| `rules`   | lista         | Entradas de regla del bloque del tema.                                                                                                                                                                                               |
| `range`   | rango         | El bloque `theme`.                                                                                                                                                                                                                   |

## Diagnóstico

```json
{
  "code": "ref.unknown-element",
  "severity": "error",
  "message": "Unknown element `gateway`.",
  "range": {
    "start": { "offset": 76, "line": 6, "column": 11 },
    "end": { "offset": 83, "line": 6, "column": 18 }
  },
  "hints": ["Declare it first, for example `gateway[\"Label\"]`."],
  "related": []
}
```

`hints` y `related` siempre están presentes, aunque pueden estar vacíos. Cada entrada relacionada
tiene `message` y `range`. Los códigos se listan en [diagnostics.md](diagnostics.md).

## Ejemplo

`corpus/valid/checkout.model.json` es el JSON de `corpus/valid/checkout.meltemi`.

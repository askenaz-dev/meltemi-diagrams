# JSON del modelo 0.1

[English](../../language/model-json.md)

`toJson(compile(text))` de `@meltemi/diagrams-model` convierte una compilación en JSON para otras
herramientas: `meltemi-diagrams convert <file> --to json` lo escribe (`docs/cli.md`), el playground
lo descarga, y los motores de disposición y las pruebas lo leen. El nombre del formato es
`model-json` y esta página describe la versión `0.1`. Un cambio incompatible aumenta la versión.

## Reglas

- Las claves se emiten en el orden en que aparecen en esta página, así que la salida es estable y
  fácil de comparar con un diff.
- Los diagramas con algún error quedan fuera de `diagrams`; sus problemas están en `diagnostics`.
- Cada elemento, relación e instrucción lleva el `range` de su instrucción en el código fuente.
- Las relaciones anónimas aparecen con su `key` sintética (`<from>-><to>#<n>`) e `id: null`.
- Dentro de una versión las claves se agregan, nunca cambian: `heads` en las relaciones y `line`
  en los elementos llegaron en 1.10.0, `pen` y `list` en los elementos y `spacing`, `side`,
  `returns` y los `events` de los mensajes en 1.11.0, y la versión sigue siendo `0.1`.
- Todos los perfiles de diagrama se compilan; los bloques `story` y `export` todavía no están en el
  JSON.

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
| `type`       | cadena | `flow`, `free`, `sequence` o `c4`.                                                                                                                                                                                                                                                                                                                                                                                   |
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
| `ports`       | lista         | Puertos con nombre: `{ "name", "side", "position" }`.                                                                                                                                                                            |
| `layer`       | cadena o null | La `layer` del bloque (composiciones libres).                                                                                                                                                                                    |
| `link`        | objeto o null | `{ "binding", "diagram", "element" }`; `binding` es null en los enlaces dentro del mismo archivo.                                                                                                                                |
| `source`      | cadena o null | La referencia del icono o la ruta de la imagen de los objetos `icon` e `image`.                                                                                                                                                  |
| `shape`       | cadena o null | La forma que implica la declaración: `cylinder` para `id[("…")]`, null en los demás casos. Una `shape` escrita en un estilo queda en `styles`.                                                                                   |
| `line`        | objeto o null | Los puntos de un objeto `line` libre, en el interior de su grupo: `{ "from": { "x", "y" }, "to": { "x", "y" }, "via": [ { "x", "y" }, … ] }`; null en todos los demás tipos.                                                     |
| `pen`         | objeto o null | Los puntos de un trazo `pen` tal como se escribieron, con los decimales, en el interior de su grupo: `{ "points": [ { "x", "y" }, … ] }`; null en todos los demás tipos.                                                         |
| `list`        | objeto o null | Cómo una lista coloca a sus hijos: `{ "layout", "spacing", "align" }`, `layout` `column` o `row`, `spacing` y `align` null cuando no se escriben; null en todos los demás elementos.                                             |
| `attachedTo`  | cadena o null | El elemento al que está adjunta una `note` (`on <elemento>`; la ruta de la entidad en una vista C4); null en los demás tipos y en una nota sin `on`.                                                                             |
| `groupPath`   | lista         | Ids de los grupos que lo contienen, primero el más externo.                                                                                                                                                                      |
| `range`       | rango         | La instrucción que lo declara, o la primera mención en los elementos implícitos.                                                                                                                                                 |
| `idRange`     | rango         | El token del identificador.                                                                                                                                                                                                      |

### Relación

| Clave         | Tipo          | Significado                                                                                      |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `key`         | cadena        | El id, o `<from>-><to>#<n>` si es anónima.                                                       |
| `id`          | cadena o null | El nombre de `as <id>`.                                                                          |
| `from`, `to`  | cadena        | Ids de elementos.                                                                                |
| `line`        | cadena        | `solid` (`->`, `--`, `<->`) o `dashed` (`-->`, `---`, `<-->`).                                   |
| `twoWay`      | booleano      | Escrita con `<->` o `<-->`.                                                                      |
| `heads`       | cadena        | `end` (`->`, `-->`), `both` (`<->`, `<-->`) o `none` (`--`, `---`), en todos los perfiles.       |
| `async`       | booleano      | `kind async` en un mensaje de secuencia.                                                         |
| `returns`     | cadena o null | La clave de la llamada a la que responde un `return` de secuencia; null en las demás relaciones. |
| `label`       | cadena o null | Texto después de `:`.                                                                            |
| `description` | cadena o null | Del bloque de la relación.                                                                       |
| `classes`     | lista         | Nombres de las clases aplicadas en el bloque de la relación.                                     |
| `layer`       | cadena o null | La `layer` del bloque (composiciones libres).                                                    |
| `groupPath`   | lista         | Grupos que contienen la instrucción de la relación.                                              |
| `range`       | rango         | La instrucción de la relación.                                                                   |
| `idRange`     | rango o null  | El identificador de `as <id>`.                                                                   |

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
`opacity 0.35` es el número `0.35`.

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
`{ "id", "target", "targetKind" ("diagram", "story" or null), "format", "size", "scale", "background", "atMs", "motion", "theme", "fonts", "scenario", "link", "fps", "durationMs", "file", "autoplay", "loop", "embed", "range" }`,
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

`corpus/valid/checkout.model.json` es el JSON de `corpus/valid/checkout.meltemi` y lo comprueba la
batería de pruebas.

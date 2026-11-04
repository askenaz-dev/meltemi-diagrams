import { BOX_SHAPES } from "@meltemi/diagrams-model";

/**
 * The Spanish words of the coverage tables, by the English text of each cell: section names, and
 * the sources and targets that are prose. Cells that are only code are the same in both languages;
 * the notes are in the catalogs (`coverage`).
 */
export const COVERAGE_ES: Readonly<Record<string, string>> = {
  // A `node` that keeps its shape, for every shape.
  ...Object.fromEntries(
    BOX_SHAPES.map((shape) => [
      `\`node\` with \`shape ${shape}\``,
      `\`node\` con \`shape ${shape}\``,
    ]),
  ),

  // Sections that are not diagram keywords.
  Common: "Común",
  Preprocessor: "Preprocesador",
  "Component, deployment and use case": "Componentes, despliegue y casos de uso",
  Sequence: "Secuencia",

  // Sources.
  "front matter `title:`": "front matter `title:`",
  "front matter `config:`": "front matter `config:`",
  "other front matter": "otro front matter",
  "HTML in labels (`<b>`, `<i>`)": "HTML en las etiquetas (`<b>`, `<i>`)",
  'Markdown strings ``"`**bold**`"``': 'cadenas Markdown ``"`**bold**`"``',
  "`fa:fa-name` in labels": "`fa:fa-name` en las etiquetas",
  "an unknown diagram keyword": "una palabra clave de diagrama desconocida",
  "a source without a diagram": "un texto sin diagrama",
  "a malformed header": "una cabecera mal formada",
  "`@{ shape: das }`, `lin-cyl`, `bow-rect` and other stored-data shapes":
    "`@{ shape: das }`, `lin-cyl`, `bow-rect` y otras formas de datos almacenados",
  "other `@{ shape: … }` names": "otros nombres de `@{ shape: … }`",
  "`subgraph id [title] … end`, nested": "`subgraph id [title] … end`, anidados",
  "`direction` inside a subgraph": "`direction` dentro de un subgrafo",
  "other `e1@{ … }` attributes": "otros atributos `e1@{ … }`",
  "CSS other than `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray`":
    "CSS distinto de `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray`",
  "`end` without `subgraph`": "`end` sin `subgraph`",
  "unreadable lines": "líneas ilegibles",
  "other participant types": "otros tipos de participante",
  "box colours": "colores de `box`",
  "`A->B` (no arrowhead)": "`A->B` (sin punta)",
  "`A-->B` (no arrowhead)": "`A-->B` (sin punta)",
  "`end` without a block": "`end` sin bloque",
  "`BiRel(…)` and its directions": "`BiRel(…)` y sus direcciones",
  "`$descr` of a relation": "`$descr` de una relación",
  "a level without its scope": "un nivel sin su ámbito",
  "dynamic diagrams": "diagramas dinámicos",
  "persons or systems inside a boundary": "personas o sistemas dentro de un límite",
  "components outside a container boundary": "componentes fuera de un límite de contenedor",
  "containers outside a system boundary": "contenedores fuera de un límite de sistema",
  "other macros": "otras macros",
  "unbalanced `{` `}`": "`{` `}` desequilibradas",
  "an alias declared twice": "un alias declarado dos veces",
  "the sides `L`, `R`, `T`, `B`": "los lados `L`, `R`, `T`, `B`",
  "`in` naming something that is not a group": "`in` que nombra algo que no es un grupo",
  "other CSS properties": "otras propiedades CSS",
  "`end` without `block`": "`end` sin `block`",
  "unreadable items": "elementos ilegibles",
  "`!$x = v`, `!$x ?= v`, `!global`, `!local`, `$x` in lines":
    "`!$x = v`, `!$x ?= v`, `!global`, `!local`, `$x` en las líneas",
  "`!procedure`, `!unquoted procedure`, defaults, keyword arguments":
    "`!procedure`, `!unquoted procedure`, valores predeterminados, argumentos con nombre",
  "`!function … !return … !endfunction`, one-line `!function $f($a) !return …`":
    "`!function … !return … !endfunction`, `!function $f($a) !return …` en una línea",
  "`%date`, `%now`, `%random`, `%getenv`, `%filename`, `%dirpath`, `%version`, colour functions":
    "`%date`, `%now`, `%random`, `%getenv`, `%filename`, `%dirpath`, `%version`, funciones de color",
  "`!include <C4/C4_Container>` and the C4-PlantUML files by URL":
    "`!include <C4/C4_Container>` y los archivos de C4-PlantUML por URL",
  "`!include <aws/…>` and other standard libraries":
    "`!include <aws/…>` y otras bibliotecas estándar",
  "`!includeurl`, `!include https://…`, absolute paths, paths outside the folder, missing files, `!import`":
    "`!includeurl`, `!include https://…`, rutas absolutas, rutas fuera de la carpeta, archivos que faltan, `!import`",
  "errors, more than 100 nested expansions or 100 000 lines":
    "errores, más de 100 expansiones anidadas o 100 000 líneas",
  "class diagrams": "diagramas de clases",
  "activity diagrams": "diagramas de actividad",
  "state diagrams": "diagramas de estados",
  "object diagrams": "diagramas de objetos",
  "timing diagrams": "diagramas de tiempos",
  "data diagrams": "diagramas de datos",
  "an empty block": "un bloque vacío",
  "`-left->`, `-up->`, `-l->` and other direction hints":
    "`-left->`, `-up->`, `-l->` y otras indicaciones de dirección",
  "a declaration without a name": "una declaración sin nombre",
  "participant colours": "colores de participante",
  "participant stereotypes": "estereotipos de participante",
  "`->x`, `->o`, `-\\`, `-//` and other heads": "`->x`, `->o`, `-\\`, `-//` y otras puntas",
  "`note left: text` after a message": "`note left: text` después de un mensaje",
  "`end` without a fragment": "`end` sin fragmento",

  // Targets.
  "`title`, and the diagram's id": "`title`, y el id del diagrama",
  "`// text` before the next statement": "`// text` antes de la siguiente instrucción",
  "plain text": "texto sin formato",
  "the text without the icon": "el texto sin el icono",
  "a flow diagram": "un diagrama de flujo",
  "the line `--` for `---` and `===` (with `width 3`), the dashed line `---` for `-.-`":
    "la línea `--` para `---` y `===` (con `width 3`), la línea discontinua `---` para `-.-`",
  "`->` with `width 3`": "`->` con `width 3`",
  "the relation's label": "la etiqueta de la relación",
  "`arrowhead circle`; `<->` with it for `o--o`": "`arrowhead circle`; `<->` con ella para `o--o`",
  "`arrowhead cross`; `<->` with it for `x--x`": "`arrowhead cross`; `<->` con ella para `x--x`",
  "`<->`, `<-->`, `<->` with `width 3`": "`<->`, `<-->`, `<->` con `width 3`",
  "`routing polyline` (`linear`), `orthogonal` (`step…`) or `bezier` (other curves)":
    "`routing polyline` (`linear`), `orthogonal` (`step…`) o `bezier` (otras curvas)",
  "one relation per pair": "una relación por par",
  "`class name { … }`; `classDef default` becomes `rule node`, `rule decision`, `rule data`":
    "`class name { … }`; `classDef default` pasa a ser `rule node`, `rule decision`, `rule data`",
  "`class name` in the element's block": "`class name` en el bloque del elemento",
  "`routing polyline`, `orthogonal` or `bezier`, as for `curve`":
    "`routing polyline`, `orthogonal` o `bezier`, como para `curve`",
  "`destroy b` after B's next message": "`destroy b` después del siguiente mensaje de B",
  "`region` with a `fill` style": "`region` con un estilo `fill`",
  "the view's `title`": "el `title` de la vista",
  "`person` with `external`": "`person` con `external`",
  "`system` with `external`": "`system` con `external`",
  "flattened: its elements are kept": "aplanado: se conservan sus elementos",
  "the `system` holding its containers; the view's scope":
    "el `system` que contiene sus contenedores; el ámbito de la vista",
  "the `container` holding its components; the view's scope":
    "el `container` que contiene sus componentes; el ámbito de la vista",
  "a model relation with `technology`": "una relación del modelo con `technology`",
  "the reversed relation": "la relación invertida",
  "a relation": "una relación",
  "two relations": "dos relaciones",
  "the next level up": "el nivel inmediatamente superior",
  "a container view": "una vista de contenedores",
  "top-level entities": "entidades de primer nivel",
  "a container that holds them": "un contenedor que los contiene",
  "the scope's system, or one named after the diagram":
    "el sistema del ámbito, o uno con el nombre del diagrama",
  "`group` with an `icon` style": "`group` con un estilo `icon`",
  "`node` with an `icon` style": "`node` con un estilo `icon`",
  "a `node` without text": "un `node` sin texto",
  "`tabler:cloud`, `tabler:database`, `tabler:device-floppy`, `tabler:world`, `tabler:server`; `pack:name` when the project has the pack":
    "`tabler:cloud`, `tabler:database`, `tabler:device-floppy`, `tabler:world`, `tabler:server`; `pack:name` cuando el proyecto tiene el paquete",
  "the named line `a -- b` with its route": "la línea con nombre `a -- b` con su ruta",
  "a relation in the arrow's direction": "una relación en el sentido de la flecha",
  "a relation from `a`'s group": "una relación desde el grupo de `a`",
  "a grid of 168 × 84 cells": "una cuadrícula de celdas de 168 × 84",
  "`box` with `place` and `size`": "`box` con `place` y `size`",
  "a box across two cells": "una caja que ocupa dos celdas",
  "empty cells": "celdas vacías",
  'an untitled `group ""` with its own columns':
    'un `group ""` sin título con sus propias columnas',
  "`shape arrow`, pointing right": "`shape arrow`, apuntando a la derecha",
  relations: "relaciones",
  "the class in the box's block": "la clase en el bloque de la caja",
  expanded: "expandido",
  substituted: "sustituido",
  evaluated: "evaluado",
  "the selected lines": "las líneas seleccionadas",
  "the repeated lines": "las líneas repetidas",
  "stable values": "valores estables",
  "checked or ignored": "comprobado o ignorado",
  "the file's lines": "las líneas del archivo",
  "the C4 level": "el nivel C4",
  "one diagram per block; `name` is its id": "un diagrama por bloque; `name` es su id",
  "as their keywords": "como sus palabras clave",
  "id and label": "id y etiqueta",
  "description `«stereotype»`": "descripción `«stereotype»`",
  "relations; dotted is `-->`; no head is the line `--` (`---` when dotted); colours and widths become styles":
    "relaciones; la punteada es `-->`; sin punta es la línea `--` (`---` si es punteada); los colores y anchos pasan a ser estilos",
  "`triangleOutline`, `diamond`, `diamondOutline`, `cross` and the crow's-foot heads at their end":
    "`triangleOutline`, `diamond`, `diamondOutline`, `cross` y las puntas de pata de gallo en su extremo",
  "plain arrowheads": "puntas simples",
  "`<->`, `<-->`, with the head at both ends": "`<->`, `<-->`, con la punta en ambos extremos",
  "a relation without end labels": "una relación sin etiquetas en los extremos",
  "`note` joined to its element by the dashed line `---`":
    "`note` unida a su elemento por la línea discontinua `---`",
  "plain messages": "mensajes simples",
  "`<->`, `<-->`; two different heads are approximated as one way":
    "`<->`, `<-->`; dos puntas distintas se aproximan como un solo sentido",
  "messages through a participant `outside`": "mensajes a través de un participante `outside`",
  "sequential messages": "mensajes en secuencia",
  "a reply to the caller and `deactivate`": "una respuesta a quien llama y `deactivate`",
  '`} else "text" {` (`and` in `par`)': '`} else "text" {` (`and` en `par`)',
  "a note over every participant": "una nota sobre todos los participantes",
  "a note beside its participant": "una nota junto a su participante",
};

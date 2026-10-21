# Importar Mermaid

[English](../../import/mermaid.md)

<!-- Generado por `pnpm import:docs` a partir de packages/import/src/coverage.ts; no editar. -->

Escrito para Mermaid 11. `meltemi-diagrams import` y los comandos de VS Code informan de cada
construcción que no se convierte exactamente: las **aproximadas** conservan su significado con
otro dibujo; las **descartadas** se omiten. Una importación que descarta una construcción
esencial (un elemento, una relación, un mensaje, una entidad o una línea que no puede leer) es
`partial`.

## Común

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| front matter `title:` | `title`, y el id del diagrama | convertido |  |
| front matter `config:` | — | descartado |  |
| otro front matter | — | descartado |  |
| `%%{init: …}%%` | — | descartado |  |
| `%% text` | `// text` antes de la siguiente instrucción | convertido |  |
| `accTitle: text` | `title` | convertido |  |
| `accDescr: text`, `accDescr { … }` | `description` | convertido | Las vistas C4 no tienen descripción; allí se descarta. |
| HTML en las etiquetas (`<b>`, `<i>`) | texto sin formato | aproximado | `<br>` se convierte en un salto de línea. |
| cadenas Markdown ``"`**bold**`"`` | texto sin formato | aproximado |  |
| `fa:fa-name` en las etiquetas | el texto sin el icono | aproximado |  |
| `classDiagram` | — | descartado | `import.unsupported-diagram`. |
| `classDiagram-v2` | — | descartado | `import.unsupported-diagram`. |
| `stateDiagram` | — | descartado | `import.unsupported-diagram`. |
| `stateDiagram-v2` | — | descartado | `import.unsupported-diagram`. |
| `erDiagram` | — | descartado | `import.unsupported-diagram`. |
| `journey` | — | descartado | `import.unsupported-diagram`. |
| `gantt` | — | descartado | `import.unsupported-diagram`. |
| `pie` | — | descartado | `import.unsupported-diagram`. |
| `quadrantChart` | — | descartado | `import.unsupported-diagram`. |
| `requirementDiagram` | — | descartado | `import.unsupported-diagram`. |
| `gitGraph` | — | descartado | `import.unsupported-diagram`. |
| `mindmap` | — | descartado | `import.unsupported-diagram`. |
| `timeline` | — | descartado | `import.unsupported-diagram`. |
| `sankey-beta` | — | descartado | `import.unsupported-diagram`. |
| `sankey` | — | descartado | `import.unsupported-diagram`. |
| `xychart-beta` | — | descartado | `import.unsupported-diagram`. |
| `xychart` | — | descartado | `import.unsupported-diagram`. |
| `packet-beta` | — | descartado | `import.unsupported-diagram`. |
| `packet` | — | descartado | `import.unsupported-diagram`. |
| `kanban` | — | descartado | `import.unsupported-diagram`. |
| `radar-beta` | — | descartado | `import.unsupported-diagram`. |
| `treemap-beta` | — | descartado | `import.unsupported-diagram`. |
| `treemap` | — | descartado | `import.unsupported-diagram`. |
| `C4Deployment` | — | descartado | `import.unsupported-diagram`. |
| `zenuml` | — | descartado | `import.unsupported-diagram`. |
| `info` | — | descartado | `import.unsupported-diagram`. |
| una palabra clave de diagrama desconocida | — | descartado | `import.unsupported-diagram`. |
| un texto sin diagrama | — | descartado | `import.unsupported-diagram`. |

## flowchart

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `flowchart TB\|TD\|BT\|LR\|RL`, `graph …`, `direction` | `direction`; `layout auto` | convertido |  |
| `flowchart-elk` | un diagrama de flujo | aproximado |  |
| una cabecera mal formada | — | descartado | `import.syntax`. |
| `A[text]` | `node` | convertido |  |
| `A(text)` | `node` | convertido |  |
| `A{text}` | `decision` | convertido |  |
| `A[(text)]` | `data` | convertido |  |
| `A([text])` | `node` con `shape pill` | convertido |  |
| `A[[text]]` | `node` con `shape framed` | convertido |  |
| `A((text))` | `node` con `shape circle` | convertido |  |
| `A(((text)))` | `node` con `shape circle` | aproximado | El doble anillo no se dibuja. |
| `A>text]` | `node` con `shape flag` | convertido |  |
| `A{{text}}` | `node` con `shape hexagon` | convertido |  |
| `A[/text/]` | `node` con `shape parallelogram` | convertido |  |
| `A[\text\]` | `node` con `shape parallelogram` | aproximado | La forma reflejada no se dibuja. |
| `A[/text\]` | `node` con `shape trapezoid` | convertido |  |
| `A[\text/]` | `node` con `shape trapezoid` | aproximado | La forma reflejada no se dibuja. |
| `A@{ shape: doc }`, `document` | `node` con `shape document` | convertido |  |
| `A@{ shape: tri }`, `extract`, `triangle` | `node` con `shape triangle` | convertido |  |
| `@{ shape: das }`, `lin-cyl`, `bow-rect` y otras formas de datos almacenados | `data` | aproximado |  |
| `@{ shape: text }`, `comment`, `brace` | `note` | aproximado |  |
| otros nombres de `@{ shape: … }` | `node` | aproximado | Los nombres de las formas clásicas se convierten como en las filas anteriores. |
| `@{ icon, img, pos, w, h, form, constraint }` | — | descartado |  |
| `subgraph id [title] … end`, anidados | `group` | convertido | Un nodo pertenece al subgrafo más interno que lo menciona. |
| `direction` dentro de un subgrafo | — | descartado |  |
| `-->`, `--->` | `->` | convertido |  |
| `---`, `-.-`, `===` | una relación con `arrowhead none` | convertido |  |
| `-.->` | `-->` | convertido |  |
| `==>` | `->` con `width 3` | convertido |  |
| `-->\|text\|`, `-- text -->` | la etiqueta de la relación | convertido |  |
| `--o`, `o--o` | `arrowhead circle`; `<->` con ella para `o--o` | convertido |  |
| `--x`, `x--x` | `arrowhead cross`; `<->` con ella para `x--x` | convertido |  |
| `<-->`, `<-.->`, `<==>` | `<->`, `<-->`, `<->` con `width 3` | convertido |  |
| `~~~` | — | descartado |  |
| `A e1@--> B` | `as e1` | convertido |  |
| `e1@{ animate: true }`, `animation: fast\|slow` | `animate e1 { effect flow }` | convertido |  |
| `e1@{ curve: … }` | `routing polyline` (`linear`), `orthogonal` (`step…`) o `bezier` (otras curvas) | convertido |  |
| otros atributos `e1@{ … }` | — | descartado |  |
| `A --> B --> C`, `A & B --> C` | una relación por par | convertido |  |
| `classDef name …` | `class name { … }`; `classDef default` pasa a ser `rule node`, `rule decision`, `rule data` | convertido |  |
| `class a,b name`, `a:::name` | `class name` en el bloque del elemento | convertido |  |
| `style id …` | `style id { … }` | convertido |  |
| `linkStyle 0,1 …`, `linkStyle default …` | `style e<n> { … }`, `rule relation { … }` | convertido |  |
| `linkStyle … interpolate` | `routing polyline`, `orthogonal` o `bezier`, como para `curve` | convertido |  |
| CSS distinto de `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray` | — | descartado |  |
| `click`, `callback`, `href` | — | descartado |  |
| `end` sin `subgraph` | — | descartado | `import.syntax`. |
| líneas ilegibles | — | descartado | `import.syntax`, esencial; se conserva como comentario. |

## sequenceDiagram

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `participant A as Label` | `participant` | convertido |  |
| `actor A as Label` | `actor` | convertido |  |
| `participant A@{ "type": "boundary" }` | `boundary` | convertido |  |
| `participant A@{ "type": "control" }` | `control` | convertido |  |
| `participant A@{ "type": "entity" }` | `entity` | convertido |  |
| `participant A@{ "type": "database" }` | `database` | convertido |  |
| `participant A@{ "type": "collections" }` | `collections` | convertido |  |
| `participant A@{ "type": "queue" }` | `queue` | convertido |  |
| otros tipos de participante | `participant` | aproximado |  |
| `box [colour] title … end` | `group` | convertido |  |
| colores de `box` | — | descartado |  |
| `create participant B` | `create b` | convertido |  |
| `destroy B` | `destroy b` después del siguiente mensaje de B | convertido |  |
| `activate A` | `activate a` | convertido |  |
| `deactivate A` | `deactivate a` | convertido |  |
| `A->>+B`, `B-->>-A` | `activate b`, `deactivate b` | convertido |  |
| `A->>B: text` | `a -> b: "text"` | convertido |  |
| `A-->>B` | `a --> b` | convertido |  |
| `A-)B` | `a -> b { kind async }` | convertido |  |
| `A--)B` | `a --> b { kind async }` | convertido |  |
| `A->B` (sin punta) | `a -> b` | aproximado |  |
| `A-->B` (sin punta) | `a --> b` | aproximado |  |
| `A-xB` | `a -> b` | aproximado |  |
| `A--xB` | `a --> b` | aproximado |  |
| `A<<->>B` | `a <-> b` | convertido |  |
| `A<<-->>B` | `a <--> b` | convertido |  |
| `Note left of\|right of\|over A[,B]: text` | `note … "text"` | convertido |  |
| `loop text` | `loop loop1 "text" { … }` | convertido |  |
| `alt text` | `alt alt1 "text" { … }` | convertido |  |
| `else text` | `} else "text" {` | convertido |  |
| `opt text` | `opt opt1 "text" { … }` | convertido |  |
| `par text` | `par par1 "text" { … }` | convertido |  |
| `and text` | `} and "text" {` | convertido |  |
| `critical text` | `critical critical1 "text" { … }` | convertido |  |
| `option text` | `} option "text" {` | convertido |  |
| `break text` | `break break1 "text" { … }` | convertido |  |
| `rect rgb(…) … end` | `region` con un estilo `fill` | convertido |  |
| `autonumber [start]` | `autonumber` | convertido |  |
| `autonumber start step` | `autonumber start` | aproximado |  |
| `autonumber off` | — | descartado |  |
| `title text` | `title` | convertido |  |
| `link`, `links` | — | descartado |  |
| `properties`, `details` | — | descartado |  |
| `end` sin bloque | — | descartado | `import.syntax`. |
| líneas ilegibles | — | descartado | `import.syntax`, esencial; se conserva como comentario. |

## C4

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `title text` | el `title` de la vista | convertido |  |
| `Person(alias, label, …)` | `person` | convertido |  |
| `Person_Ext(alias, label, …)` | `person` con `external` | convertido |  |
| `System(alias, label, …)` | `system` | convertido |  |
| `System_Ext(alias, label, …)` | `system` con `external` | convertido |  |
| `SystemDb(alias, label, …)` | `system` | aproximado | Un sistema de base de datos se dibuja como un sistema. |
| `SystemDb_Ext(alias, label, …)` | `system` con `external` | aproximado | Un sistema de base de datos se dibuja como un sistema. |
| `SystemQueue(alias, label, …)` | `system` | aproximado | Un sistema de cola se dibuja como un sistema. |
| `SystemQueue_Ext(alias, label, …)` | `system` con `external` | aproximado | Un sistema de cola se dibuja como un sistema. |
| `Container(alias, label, …)` | `container` | convertido |  |
| `ContainerDb(alias, label, …)` | `datastore` | convertido |  |
| `ContainerQueue(alias, label, …)` | `container` | aproximado | Un contenedor de cola se dibuja como un contenedor. |
| `Container_Ext(alias, label, …)` | `container` | aproximado | Solo las personas y los sistemas se marcan como externos. |
| `ContainerDb_Ext(alias, label, …)` | `datastore` | aproximado | Solo las personas y los sistemas se marcan como externos. |
| `ContainerQueue_Ext(alias, label, …)` | `container` | aproximado | Un contenedor de cola se dibuja como un contenedor; solo las personas y los sistemas se marcan como externos. |
| `Component(alias, label, …)` | `component` | convertido |  |
| `ComponentDb(alias, label, …)` | `component` | aproximado | Un componente de base de datos se dibuja como un componente. |
| `ComponentQueue(alias, label, …)` | `component` | aproximado | Un componente de cola se dibuja como un componente. |
| `Component_Ext(alias, label, …)` | `component` | aproximado | Solo las personas y los sistemas se marcan como externos. |
| `ComponentDb_Ext(alias, label, …)` | `component` | aproximado | Un componente de base de datos se dibuja como un componente; solo las personas y los sistemas se marcan como externos. |
| `ComponentQueue_Ext(alias, label, …)` | `component` | aproximado | Un componente de cola se dibuja como un componente; solo las personas y los sistemas se marcan como externos. |
| `Boundary(alias, label) { … }` | aplanado: se conservan sus elementos | aproximado | Con `$type="system"` o `"container"` se lee como ese límite. |
| `Enterprise_Boundary(alias, label) { … }` | aplanado: se conservan sus elementos | aproximado |  |
| `System_Boundary(alias, label) { … }` | el `system` que contiene sus contenedores; el ámbito de la vista | convertido |  |
| `Container_Boundary(alias, label) { … }` | el `container` que contiene sus componentes; el ámbito de la vista | convertido | Alrededor de contenedores sin componentes se lee como el límite de su sistema (aproximado). |
| `Rel(from, to, label, techn)` | una relación del modelo con `technology` | convertido |  |
| `Rel_Back(…)`, `Rel_Back_Neighbor(…)` | la relación invertida | convertido |  |
| `Rel_U`, `Rel_D`, `Rel_L`, `Rel_R`, `Rel_Up`… `Rel_Neighbor` | una relación | aproximado | Las direcciones quedan a cargo de la disposición. |
| `BiRel(…)` y sus direcciones | dos relaciones | aproximado |  |
| `RelIndex(n, from, to, …)` | una relación | aproximado | Los números de paso no se dibujan. |
| `$descr` de una relación | — | descartado |  |
| `$tags` | — | descartado |  |
| `$sprite` | — | descartado |  |
| `$link` | — | descartado |  |
| `LAYOUT_LEFT_RIGHT()` | `direction LR` | convertido |  |
| `LAYOUT_LANDSCAPE()` | `direction LR` | convertido |  |
| `LAYOUT_TOP_DOWN()` | `direction TB` | convertido |  |
| un nivel sin su ámbito | el nivel inmediatamente superior | aproximado |  |
| diagramas dinámicos | una vista de contenedores | aproximado | Los números de paso no se dibujan. |
| personas o sistemas dentro de un límite | entidades de primer nivel | aproximado |  |
| componentes fuera de un límite de contenedor | un contenedor que los contiene | aproximado |  |
| contenedores fuera de un límite de sistema | el sistema del ámbito, o uno con el nombre del diagrama | aproximado |  |
| `Container(…)` | `container` | convertido | Fuera de un límite de sistema va al sistema del alcance o a uno con el nombre del diagrama (aproximado). |
| `Deployment_Node`, `Node`, `Node_L`, `Node_R` | — | descartado | Esencial: los diagramas de despliegue no se importan. |
| `Node(…)` | — | descartado | Esencial. |
| otras macros | — | descartado | Esencial. |
| líneas ilegibles | — | descartado | `import.syntax`, esencial. |
| `{` `}` desequilibradas | — | descartado | `import.syntax`. |
| un alias declarado dos veces | — | descartado | `import.syntax`; se conserva la primera declaración. |
| `AddElementTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddRelTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddBoundaryTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddPersonTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddSystemTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddContainerTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddComponentTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddExternalPersonTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddExternalSystemTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddExternalContainerTag(…)` | — | descartado | Solo afecta al dibujo. |
| `AddExternalComponentTag(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateElementStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateRelStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateBoundaryStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateContainerBoundaryStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateSystemBoundaryStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateEnterpriseBoundaryStyle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateLayoutConfig(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateLegendTitle(…)` | — | descartado | Solo afecta al dibujo. |
| `UpdateSkinparamsAndLegendEntry(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_LEGEND(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_FLOATING_LEGEND(…)` | — | descartado | Solo afecta al dibujo. |
| `LAYOUT_WITH_LEGEND(…)` | — | descartado | Solo afecta al dibujo. |
| `LAYOUT_AS_SKETCH(…)` | — | descartado | Solo afecta al dibujo. |
| `HIDE_STEREOTYPE(…)` | — | descartado | Solo afecta al dibujo. |
| `HIDE_PERSON_SPRITE(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_PERSON_SPRITE(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_PERSON_PORTRAIT(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_PERSON_OUTLINE(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_ELEMENT_DESCRIPTIONS(…)` | — | descartado | Solo afecta al dibujo. |
| `SHOW_INDEX(…)` | — | descartado | Solo afecta al dibujo. |
| `HIDE_LEGEND(…)` | — | descartado | Solo afecta al dibujo. |
| `SetDefaultLegendEntries(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_U(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_Up(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_D(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_Down(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_L(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_Left(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_R(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_Right(…)` | — | descartado | Solo afecta al dibujo. |
| `Lay_Distance(…)` | — | descartado | Solo afecta al dibujo. |
| `increment(…)` | — | descartado | Solo afecta al dibujo. |
| `setIndex(…)` | — | descartado | Solo afecta al dibujo. |

## architecture-beta

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `group id(icon)[Label] [in parent]` | `group` con un estilo `icon` | convertido |  |
| `service id(icon)[Label] [in group]` | `node` con un estilo `icon` | convertido |  |
| `junction id [in group]` | un `node` sin texto | aproximado |  |
| `cloud`, `database`, `disk`, `internet`, `server`, `pack:name` | `tabler:cloud`, `tabler:database`, `tabler:device-floppy`, `tabler:world`, `tabler:server`; `pack:name` cuando el proyecto tiene el paquete | convertido | Los iconos de paquetes que el proyecto no tiene se descartan. |
| `a:R -- L:b` | una relación con nombre y `arrowhead none` | convertido |  |
| `a:R --> L:b`, `a:R <-- L:b` | una relación en el sentido de la flecha | convertido |  |
| `a:R <--> L:b` | `a <-> b` | convertido |  |
| los lados `L`, `R`, `T`, `B` | `route e<n> from a.east to b.west` | convertido | Las posiciones quedan a cargo de ELK; los lados se conservan como puertos. |
| `a{group}:R -- L:b` | una relación desde el grupo de `a` | convertido |  |
| `in` que nombra algo que no es un grupo | — | descartado |  |
| `in` que nombra algo que no es un grupo | — | descartado |  |
| `in` que nombra algo que no es un grupo | — | descartado |  |
| `title text` | `title` | convertido |  |
| líneas ilegibles | — | descartado | `import.syntax`, esencial. |

## block-beta

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `columns n` | una cuadrícula de celdas de 168 × 84 | convertido |  |
| `a` | `box` con `place` y `size` | convertido |  |
| `a[text]` | `shape rectangle` | convertido |  |
| `a(text)` | `shape rounded` | convertido |  |
| `a{text}` | `shape diamond` | convertido |  |
| `a[(text)]` | `shape cylinder` | convertido |  |
| `a([text])` | `shape pill` | convertido |  |
| `a[[text]]` | `shape framed` | convertido |  |
| `a((text))` | `shape circle` | convertido |  |
| `a(((text)))` | `shape circle` | aproximado | El doble anillo no se dibuja. |
| `a>text]` | `shape flag` | convertido |  |
| `a{{text}}` | `shape hexagon` | convertido |  |
| `a[/text/]` | `shape parallelogram` | convertido |  |
| `a[\text\]` | `shape parallelogram` | aproximado | La forma reflejada no se dibuja. |
| `a[/text\]` | `shape trapezoid` | convertido |  |
| `a[\text/]` | `shape trapezoid` | aproximado | La forma reflejada no se dibuja. |
| `a:2` | una caja que ocupa dos celdas | convertido |  |
| `space`, `space:n` | celdas vacías | convertido |  |
| `block:id:n … end` | un `group ""` sin título con sus propias columnas | convertido |  |
| `a<["text"]>(right)` | `shape arrow` | convertido |  |
| `a<["text"]>(left)`, `(up)`, `(down)`, `(x)`, `(y)` | `shape arrow`, apuntando a la derecha | aproximado |  |
| `a --> b`, `a -- text --> b` | relaciones | convertido |  |
| `classDef` | `class` | convertido |  |
| `class a name` | la clase en el bloque de la caja | convertido |  |
| `style a …` | `style a { … }` | convertido |  |
| otras propiedades CSS | — | descartado |  |
| `end` sin `block` | — | descartado | `import.syntax`. |
| elementos ilegibles | — | descartado | `import.syntax`, esencial. |

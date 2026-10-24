# Importar PlantUML

[English](../../import/plantuml.md)

<!-- Generado por `pnpm import:docs` a partir de packages/import/src/coverage.ts; no editar. -->

Escrito para PlantUML 1.2025 y C4-PlantUML 2. `meltemi-diagrams import` y los comandos de VS Code informan de cada
construcción que no se convierte exactamente: las **aproximadas** conservan su significado con
otro dibujo; las **descartadas** se omiten. Una importación que descarta una construcción
esencial (un elemento, una relación, un mensaje, una entidad o una línea que no puede leer) es
`partial`.

## Preprocesador

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `!define NAME value`, `!define NAME(a, b) body`, `##` | expandido | convertido |  |
| `!definelong NAME(a) … !enddefinelong`, `!undef` | expandido | convertido |  |
| `!$x = v`, `!$x ?= v`, `!global`, `!local`, `$x` en las líneas | sustituido | convertido |  |
| `!procedure`, `!unquoted procedure`, valores predeterminados, argumentos con nombre | expandido | convertido |  |
| `!function … !return … !endfunction`, `!function $f($a) !return …` en una línea | evaluado | convertido |  |
| `!if`, `!elseif`, `!else`, `!endif`, `!ifdef`, `!ifndef` | las líneas seleccionadas | convertido |  |
| `!while … !endwhile`, `!foreach $x in [ … ] … !endfor` | las líneas repetidas | convertido | Como máximo 1000 pasadas. |
| `%strlen`, `%substr`, `%strpos`, `%upper`, `%lower`, `%string`, `%intval`, `%boolval`, `%true`, `%false`, `%not`, `%newline`, `%chr`, `%ord`, `%mod`, `%dec2hex`, `%hex2dec`, `%variable_exists`, `%function_exists`, `%get_variable_value`, `%set_variable_value`, `%call_user_func`, `%size`, `%splitstr`, `%str2json`, `%json_key_exists` | evaluado | convertido |  |
| `%date`, `%now`, `%random`, `%getenv`, `%filename`, `%dirpath`, `%version`, funciones de color | valores estables | aproximado | Las importaciones son deterministas: las fechas y el entorno quedan vacíos. |
| `!assert`, `!log`, `!dump_memory` | comprobado o ignorado | convertido |  |
| `!include path`, `!include_once`, `!include_many`, `!includesub path!ID`, `!include path!n` | las líneas del archivo | convertido | Relativa al archivo que la incluye, dentro de la carpeta o el proyecto importados. |
| `!include <C4/C4_Container>` y los archivos de C4-PlantUML por URL | el nivel C4 | convertido | Se reconoce, nunca se lee. |
| `!include <aws/…>` y otras bibliotecas estándar | — | descartado | Sus macros no se importan. |
| `!includeurl`, `!include https://…`, rutas absolutas, rutas fuera de la carpeta, archivos que faltan, `!import` | — | descartado | `import.include`, esencial: el importador nunca descarga archivos. |
| errores, más de 100 expansiones anidadas o 100 000 líneas | — | descartado | `import.preprocessor`, esencial. |
| `!theme` | — | descartado |  |
| `!pragma` | — | descartado |  |

## Común

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `title text`, `title … end title` | `title` | convertido |  |
| `' text`, `/' … '/` | `// text` | convertido |  |
| `@startuml name … @enduml` | un diagrama por bloque; `name` es su id | convertido | Un bloque sin cerrar es `import.syntax`. |
| `skinparam` | — | descartado |  |
| `<style> … </style>` | — | descartado |  |
| `legend` | — | descartado |  |
| `header` | — | descartado |  |
| `footer` | — | descartado |  |
| `caption` | — | descartado |  |
| `hide`, `show`, `remove`, `restore` | — | descartado |  |
| `scale` | — | descartado |  |
| `newpage` | — | descartado |  |
| `allowmixing` | — | descartado |  |
| `allow_mixing` | — | descartado |  |
| `mainframe` | — | descartado |  |
| `set` | — | descartado |  |
| `page` | — | descartado |  |
| `sprite` | — | descartado |  |
| diagramas de clases | — | descartado | `import.unsupported-diagram`. |
| diagramas de actividad | — | descartado | `import.unsupported-diagram`. |
| diagramas de estados | — | descartado | `import.unsupported-diagram`. |
| diagramas de objetos | — | descartado | `import.unsupported-diagram`. |
| diagramas de tiempos | — | descartado | `import.unsupported-diagram`. |
| diagramas de datos | — | descartado | `import.unsupported-diagram`. |
| `@startgantt` | — | descartado | `import.unsupported-diagram`. |
| `@startmindmap` | — | descartado | `import.unsupported-diagram`. |
| `@startwbs` | — | descartado | `import.unsupported-diagram`. |
| `@startjson` | — | descartado | `import.unsupported-diagram`. |
| `@startyaml` | — | descartado | `import.unsupported-diagram`. |
| `@startsalt` | — | descartado | `import.unsupported-diagram`. |
| `@startditaa` | — | descartado | `import.unsupported-diagram`. |
| `@startdot` | — | descartado | `import.unsupported-diagram`. |
| `@startmath` | — | descartado | `import.unsupported-diagram`. |
| `@startlatex` | — | descartado | `import.unsupported-diagram`. |
| `@startchen` | — | descartado | `import.unsupported-diagram`. |
| `@startchronology` | — | descartado | `import.unsupported-diagram`. |
| `@startfiles` | — | descartado | `import.unsupported-diagram`. |
| `@startregex` | — | descartado | `import.unsupported-diagram`. |
| `@startebnf` | — | descartado | `import.unsupported-diagram`. |
| `@startboard` | — | descartado | `import.unsupported-diagram`. |
| `@startcreole` | — | descartado | `import.unsupported-diagram`. |
| `@startdef` | — | descartado | `import.unsupported-diagram`. |
| `@startflow` | — | descartado | `import.unsupported-diagram`. |
| `@startgit` | — | descartado | `import.unsupported-diagram`. |
| `@startnwdiag` | — | descartado | `import.unsupported-diagram`. |
| `@startproject` | — | descartado | `import.unsupported-diagram`. |
| `@startwire` | — | descartado | `import.unsupported-diagram`. |
| `C4_Deployment` | — | descartado | `import.unsupported-diagram`. |
| `C4_Sequence` | — | descartado | `import.unsupported-diagram`. |
| un bloque vacío | — | descartado | `import.unsupported-diagram`. |

## Componentes, despliegue y casos de uso

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `component` | `node` | convertido |  |
| `node` | `node` | convertido |  |
| `rectangle` | `node` | convertido |  |
| `card` | `node` con `shape document` | convertido |  |
| `agent` | `node` | convertido |  |
| `artifact` | `node` | convertido |  |
| `file` | `node` con `shape document` | convertido |  |
| `folder` | `node` con `shape document` | convertido |  |
| `frame` | `node` | convertido |  |
| `package` | `node` | convertido |  |
| `cloud` | `node` con `shape cloud` | convertido |  |
| `hexagon` | `node` con `shape hexagon` | convertido |  |
| `stack` | `node` | convertido |  |
| `label` | `node` | convertido |  |
| `action` | `node` | convertido |  |
| `process` | `node` | convertido |  |
| `boundary` | `node` | convertido |  |
| `control` | `node` | convertido |  |
| `entity` | `node` | convertido |  |
| `collections` | `node` | convertido |  |
| `database` | `data` | convertido |  |
| `storage` | `data` | convertido |  |
| `queue` | `data` | convertido |  |
| `interface` | `node` con `shape circle` | convertido |  |
| `circle` | `node` con `shape circle` | convertido |  |
| `actor` | `node` con `shape person` | convertido |  |
| `person` | `node` con `shape person` | convertido |  |
| `usecase` | `node` con `shape ellipse` | convertido |  |
| `[Component]`, `()`, `(Use case)`, `:Actor:` | como sus palabras clave | convertido |  |
| `component name { … }` | `group` | aproximado |  |
| `node name { … }` | `group` | convertido |  |
| `rectangle name { … }` | `group` | convertido |  |
| `card name { … }` | `group` | convertido |  |
| `agent name { … }` | `group` | aproximado |  |
| `artifact name { … }` | `group` | aproximado |  |
| `file name { … }` | `group` | aproximado |  |
| `folder name { … }` | `group` | convertido |  |
| `frame name { … }` | `group` | convertido |  |
| `package name { … }` | `group` | convertido |  |
| `cloud name { … }` | `group` | convertido |  |
| `hexagon name { … }` | `group` | aproximado |  |
| `stack name { … }` | `group` | aproximado |  |
| `label name { … }` | `group` | aproximado |  |
| `action name { … }` | `group` | aproximado |  |
| `process name { … }` | `group` | aproximado |  |
| `boundary name { … }` | `group` | aproximado |  |
| `control name { … }` | `group` | aproximado |  |
| `entity name { … }` | `group` | aproximado |  |
| `collections name { … }` | `group` | aproximado |  |
| `database name { … }` | `group` | aproximado |  |
| `storage name { … }` | `group` | aproximado |  |
| `queue name { … }` | `group` | aproximado |  |
| `interface name { … }` | `group` | aproximado |  |
| `circle name { … }` | `group` | aproximado |  |
| `actor name { … }` | `group` | aproximado |  |
| `person name { … }` | `group` | aproximado |  |
| `usecase name { … }` | `group` | aproximado |  |
| `"Label" as a`, `a as "Label"`, `[Label] as a` | id y etiqueta | convertido |  |
| `<<stereotype>>` | descripción `«stereotype»` | aproximado |  |
| `#colour`, `#line:c`, `#line.dashed`, `#text:c` | `fill`, `stroke`, `line dashed`, `color` | convertido |  |
| `-->`, `->`, `..>`, `--`, `<--`, `-[#red]->`, `-[bold]->`, `-[thickness=n]->` | relaciones; la punteada es `-->`; sin punta es la línea `--` (`---` si es punteada); los colores y anchos pasan a ser estilos | convertido |  |
| `--\|>`, `<\|--`, `*--`, `o--`, `--x`, `}\|--\|\|`, `}o--o\|` | `triangleOutline`, `diamond`, `diamondOutline`, `cross` y las puntas de pata de gallo en su extremo | convertido |  |
| `--#`, `--+`, `--^`, `-(0-` | puntas simples | aproximado |  |
| `<-->`, `<..>`, `*--*` | `<->`, `<-->`, con la punta en ambos extremos | convertido |  |
| `-left->`, `-up->`, `-l->` y otras indicaciones de dirección | una relación | aproximado | Las direcciones quedan a cargo de la disposición. |
| `a "1" --> "*" b` | una relación sin etiquetas en los extremos | aproximado |  |
| `-[hidden]->` | — | descartado |  |
| `note left\|right\|top\|bottom of x : text`, `note … end note`, `note "text" as N` | `note` unida a su elemento por la línea discontinua `---` | convertido |  |
| `note on link` | — | descartado |  |
| `left to right direction`, `top to bottom direction` | `direction LR`, `direction TB` | convertido |  |
| `together { … }` | — | descartado | Sus elementos se conservan. |
| `port`, `portin`, `portout` | — | descartado |  |
| `{` `}` desequilibradas | — | descartado | `import.syntax`. |
| una declaración sin nombre | — | descartado | `import.syntax`. |
| líneas ilegibles | — | descartado | `import.syntax`, esencial; se conserva como comentario. |

## Secuencia

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `participant "Label" as a` | `participant` | convertido |  |
| `actor "Label" as a` | `actor` | convertido |  |
| `boundary "Label" as a` | `boundary` | convertido |  |
| `control "Label" as a` | `control` | convertido |  |
| `entity "Label" as a` | `entity` | convertido |  |
| `database "Label" as a` | `database` | convertido |  |
| `collections "Label" as a` | `collections` | convertido |  |
| `queue "Label" as a` | `queue` | convertido |  |
| colores de participante | — | descartado |  |
| estereotipos de participante | — | descartado |  |
| `box "title" … end box` | `group` | convertido |  |
| colores de `box` | — | descartado |  |
| `a -> b : text` | `a -> b: "text"` | convertido |  |
| `a --> b` | `a --> b` | convertido |  |
| `a ->> b`, `a -->> b` | `{ kind async }` | convertido |  |
| `->x`, `->o`, `-\`, `-//` y otras puntas | mensajes simples | aproximado |  |
| `<->`, `<-->` | `<->`, `<-->`; dos puntas distintas se aproximan como un solo sentido | convertido |  |
| `-[#red]>` | — | descartado |  |
| `[-> a`, `a ->]`, `?-> a` | mensajes a través de un participante `outside` | aproximado |  |
| `& a -> b` | mensajes en secuencia | aproximado |  |
| `a -> b ++`, `a -> b --` | `activate b`, `deactivate a` | convertido |  |
| `create b`, `**` | `create b` | convertido |  |
| `destroy b`, `!!` | `destroy b` | convertido |  |
| `activate b` | `activate b` | convertido |  |
| `deactivate b` | `deactivate b` | convertido |  |
| `return text` | una respuesta a quien llama y `deactivate` | convertido |  |
| `autonumber [start]` | `autonumber` | convertido |  |
| `autonumber start step "format"` | `autonumber start` | aproximado |  |
| `autonumber stop\|resume\|inc` | — | descartado |  |
| `alt text` | `alt alt1 "text" { … }` | convertido |  |
| `else text` | `} else "text" {` (`and` en `par`) | convertido |  |
| `opt text` | `opt opt1 "text" { … }` | convertido |  |
| `loop text` | `loop loop1 "text" { … }` | convertido |  |
| `par text` | `par par1 "text" { … }` | convertido |  |
| `break text` | `break break1 "text" { … }` | convertido |  |
| `critical text` | `critical critical1 "text" { … }` | convertido |  |
| `group text` | `region region1 "text" { … }` | convertido |  |
| `note left\|right\|over a[, b] : text`, `note … end note` | `note` | convertido |  |
| `hnote`, `rnote` | `note` | aproximado |  |
| `note across` | una nota sobre todos los participantes | aproximado |  |
| `note left: text` después de un mensaje | una nota junto a su participante | aproximado |  |
| `ref over a, b : text` | `note over a, b "ref: text"` | aproximado |  |
| `== text ==` | `divider "text"` | convertido |  |
| `...`, `...text...` | `delay` | convertido |  |
| `\|\|\|`, `\|\|45\|\|` | — | descartado |  |
| `hide footbox` | — | descartado |  |
| `end` sin fragmento | — | descartado | `import.syntax`. |
| líneas ilegibles | — | descartado | `import.syntax`, esencial; se conserva como comentario. |

## C4-PlantUML

| Origen | Meltemi | Estado | Notas |
| --- | --- | --- | --- |
| `left to right direction` | `direction LR` | convertido |  |
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

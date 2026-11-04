# Si vienes de Mermaid

[English](../../tracks/from-mermaid.md)

Ya escribes diagramas como texto junto a tu código, y una herramienta los dibuja. Meltemi Diagrams
mantiene eso: los archivos `.meltemi` son texto plano en tu repositorio, se revisan en las pull
requests y los dibujan la línea de comandos, el editor y el playground. Esta página muestra qué
cambia, cómo traer tus diagramas de Mermaid y qué probar primero.

## Lo que no cambia

- Los diagramas son texto, versionado junto con el código, y nada necesita una cuenta ni un
  servidor.
- Un archivo declara nodos y flechas; el motor de disposición organiza lo que no colocas.
- Las etiquetas, los grupos (`subgraph`), las clases y los estilos tienen equivalentes directos.

## Lo que es distinto

- **Los ids y las relaciones tienen nombre.** Cada elemento tiene un id, y una relación puede tener
  uno (`a -> b: "calls" as call`). Los nombres son aquello a lo que apuntan las rutas, los estilos,
  las historias y los enlaces, y los cambios de nombre llegan a cada uso.
- **La colocación se escribe en el archivo.** Arrastra una caja en el lienzo y aparece una
  instrucción `place` en el código; `layout assisted` conserva lo que colocaste y organiza el resto.
  Mermaid vuelve a calcular el dibujo entero cada vez.
- **Un modelo, muchas vistas.** La arquitectura es un `model` de personas, sistemas y contenedores,
  y las vistas C4 dibujan partes de él; la misma entidad conserva su identidad en cada vista, en el
  diagrama de secuencia y en la diapositiva ([C4](../language/c4.md)).
- **Movimiento y entrega.** Efectos, historias con escenas y una cámara, el reproductor HTML, PNG,
  PDF vectorial, MP4, WebM y GIF, y un catálogo sin conexión de todo el proyecto
  ([funciones](../features.md)).

## Importa tus diagramas

```bash
meltemi-diagrams import docs/architecture.mmd
```

El importador lee archivos `.mmd` y `.mermaid` y los bloques de Mermaid de los archivos Markdown,
escribe una hoja `.meltemi` junto a cada uno y nunca cambia el origen. También funciona con una
carpeta entera (`meltemi-diagrams import docs --out diagrams`). En VS Code,
**Importar desde Mermaid o PlantUML…** hace lo mismo, e
**Importar la selección como diagrama de Meltemi** convierte un bloque delimitado de un archivo
Markdown.

Este diagrama de flujo:

```text
flowchart LR
  shop[Web shop] -->|places order| api(Orders API)
  api --> db[(Orders)]
  api -.-> mail[Email service]
  subgraph payments [Payments]
    psp[Payment provider]
  end
  api ==> psp
```

se convierte en esta hoja, con el informe `14 mapped, 0 approximated, 0 dropped`:

```text
language "0.2"

diagram checkout: flow {
  direction LR
  layout auto

  node shop "Web shop"
  node api "Orders API"
  data db "Orders"
  node mail "Email service"
  group payments "Payments" {
    node psp "Payment provider"
  }

  shop -> api: "places order"
  api -> db
  api --> mail
  api -> psp as e1

  style e1 { width 3 }
}
```

### Cómo leer el informe

Cada construcción queda **convertida** (mismo significado, mismo dibujo), **aproximada** (mismo
significado, otro dibujo) o **descartada** (se omite, con un hallazgo en su línea). Una importación
que descarta una construcción esencial (un elemento, una relación, un mensaje, una entidad o una
línea que no puede leer) es **parcial** y termina con el código 1. La tabla completa está en
[Importar Mermaid](../import/mermaid.md).

### Volver a importar

Cuando el origen de Mermaid sigue cambiando, vuelve a importar con `--merge`: la hoja nueva conserva
la colocación, los estilos y los demás ajustes hechos desde entonces, emparejados por id
([CLI](../cli.md)).

## Construcciones equivalentes

| Mermaid                                 | Meltemi                                              | Importación                                 |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `flowchart LR`, `graph TD`              | `diagram id: flow { direction LR }`                  | convertido (`flowchart.direction`)          |
| `A[Label]`, `A(Label)`                  | `node a "Label"`, `a["Label"]`                       | convertido (`flowchart.shape.rect`)         |
| `A[(Label)]`                            | `data a "Label"`, `a[("Label")]`                     | convertido (`flowchart.shape.cylinder`)     |
| `A{Label}`                              | `decision a "Label"`                                 | convertido (`flowchart.shape.rhombus`)      |
| `A{{Label}}`                            | `node a "Label"`, `style a { shape hexagon }`        | convertido (`flowchart.shape.hexagon`)      |
| `A[/Label/]`, `A[/Label\]`              | `shape parallelogram`, `shape trapezoid`             | convertido (`flowchart.shape.lean_right`)   |
| `A([Label])`, `A[[Label]]`              | `shape pill`, `shape framed`                         | convertido (`flowchart.shape.stadium`)      |
| `A((Label))`, `A>Label]`                | `shape circle`, `shape flag`                         | convertido (`flowchart.shape.circle`)       |
| `A[\Label\]`, `A(((Label)))`            | la forma más cercana: `parallelogram`, `circle`      | aproximado (`flowchart.shape.lean_left`)    |
| `A --> B`                               | `a -> b`                                             | convertido (`flowchart.link.arrow`)         |
| `A -.-> B`                              | `a --> b` (discontinua)                              | convertido (`flowchart.link.dotted`)        |
| `A -->\|text\| B`                       | `a -> b: "text"`                                     | convertido (`flowchart.link.label`)         |
| `A ==> B`                               | `a -> b` con `style { width 3 }`                     | convertido (`flowchart.link.thick`)         |
| `A <--> B`                              | `a <-> b`                                            | convertido (`flowchart.link.bidirectional`) |
| `A --o B`, `A o--o B`                   | `arrowhead circle`, `a <-> b` con esa punta          | convertido (`flowchart.link.circle`)        |
| `subgraph id [title] … end`             | `group id "title" { … }`                             | convertido (`flowchart.subgraph`)           |
| `classDef name …`, `A:::name`           | `class name { … }`, `{ class name }`                 | convertido (`flowchart.classDef`)           |
| `style A fill:#…`                       | `style a { fill "#…" }`                              | convertido (`flowchart.style`)              |
| `e1@{ animate: true }`                  | `animate e1 { effect flow }`                         | convertido (`flowchart.link.animation`)     |
| `sequenceDiagram`, `participant A as L` | `diagram id: sequence { participant a "L" }`         | convertido (`sequence.participant`)         |
| `A->>B: text`                           | `a -> b: "text"`                                     | convertido (`sequence.message.->>`)         |
| `A-->>B: text`                          | `a --> b: "text"`                                    | convertido (`sequence.message.-->>`)        |
| `alt … else … end`                      | `alt id "…" { … } else "…" { … }`                    | convertido (`sequence.alt`)                 |
| `loop text … end`                       | `loop id "text" { … }`                               | convertido (`sequence.loop`)                |
| `Note over A,B: text`                   | `note over a, b "text"`                              | convertido (`sequence.note`)                |
| `autonumber`                            | `autonumber`                                         | convertido (`sequence.autonumber`)          |
| `C4Container`, `Person(…)`              | `model` con `person`, una vista `c4`                 | convertido (`mermaid.c4.Person`)            |
| `Container(…)`, `ContainerDb(…)`        | `container`, `datastore`                             | convertido (`mermaid.c4.ContainerDb`)       |
| `System_Boundary(…) { … }`              | el `system` y el `scope` de la vista                 | convertido (`mermaid.c4.System_Boundary`)   |
| `Rel(from, to, label, techn)`           | una relación del modelo con `technology`             | convertido (`mermaid.c4.Rel`)               |
| `architecture-beta`, `service id(icon)` | `node` con un estilo `icon`                          | convertido (`architecture.service`)         |
| `block-beta`, `columns n`               | cajas colocadas en una cuadrícula                    | convertido (`blockbeta.columns`)            |
| `block:id … end`                        | un `group id ""` sin título alrededor de sus bloques | convertido (`blockbeta.block`)              |
| `a<["text"]>(right)`                    | una caja con `shape arrow`                           | convertido (`blockbeta.arrow`)              |

Los diagramas de clases, de estados, de entidad-relación, de Gantt, de sectores y los demás tipos de
diagrama de Mermaid no se importan (`import.unsupported-diagram`); consulta la página de
[compatibilidad](../compatibility.md).

## Primeras cosas que probar

1. Abre la hoja importada en VS Code con **Abrir el lienzo al lado**: arrastra una caja y mira cómo
   aparece una instrucción `place`; luego cambia `layout auto` por `layout assisted` para que el
   resto se siga organizando solo ([editor](../editor.md)).
2. Convierte un diagrama C4 en un modelo con dos vistas: la importación ya escribió el modelo;
   agrega una vista de contexto con `diagram context: c4 using <model> { level context }`.
3. Exporta lo que Mermaid no puede: `meltemi-diagrams export sheet.meltemi --format pdf` para una
   página vectorial con texto seleccionable, o una historia como MP4
   ([historias](../language/stories.md)).

# Si vienes de PlantUML

[English](../../tracks/from-plantuml.md)

Describes arquitecturas e interacciones como texto y dejas que un motor de renderizado las dibuje.
Meltemi Diagrams conserva el texto, agrega un lienzo donde cada gesto edita ese texto y dibuja a
partir de un modelo compartido para que las vistas concuerden. Esta página muestra qué cambia, cómo
traer tus archivos de PlantUML (incluidos el preprocesador y C4-PlantUML) y qué probar primero.

## Lo que no cambia

- Los diagramas son archivos de texto en tu repositorio; los bloques `@startuml` se convierten en
  hojas `.meltemi`.
- Los diagramas de componentes, de despliegue, de casos de uso y de secuencia tienen equivalentes en
  los perfiles `flow` y `sequence`, y C4-PlantUML se convierte en modelos y vistas C4.
- Las inclusiones, las macros y los procedimientos siguen funcionando al importar: el importador
  ejecuta el preprocesador.

## Lo que es distinto

- **Sin Java ni servidor.** Todo se ejecuta en local, en Node, en el editor o en una pestaña del
  navegador; PNG, PDF y video usan el navegador y el FFmpeg que tengas instalados.
- **La colocación es tuya.** En lugar de indicaciones de dirección (`-left->`) y enlaces ocultos,
  arrastra las cajas en el lienzo o escribe instrucciones `place`; `layout assisted` las conserva y
  organiza el resto.
- **Un modelo, muchas vistas.** Las vistas de C4-PlantUML vuelven a declarar sus elementos; en
  Meltemi Diagrams, un `model` los declara una sola vez y cada vista, secuencia y diapositiva hace
  referencia a ellos, así que los cambios de nombre y los enlaces siguen siendo correctos
  ([C4](../language/c4.md)).
- **Los diagramas de secuencia conocen sus escenarios.** Las ramas de `alt` pueden tener nombre y
  elegirse, y cada escenario se exporta por separado ([secuencia](../language/sequence.md)).

## Importa tus diagramas

```bash
meltemi-diagrams import architecture/checkout.puml
```

El importador lee archivos `.puml`, `.plantuml`, `.pu`, `.iuml` y `.wsd` y los bloques de PlantUML
de los archivos Markdown, una hoja por cada bloque `@startuml`, y nunca cambia el origen. Los
archivos incluidos con `!include` se leen en relación con el archivo; la biblioteca estándar de
C4-PlantUML se reconoce por su nombre o su URL.

Este diagrama de componentes:

```text
@startuml checkout
title Checkout
actor Customer as customer
component "Web shop" as shop
component "Orders API" as api
database "Orders" as db
node "Payments" {
  component "Payment provider" as psp
}
customer --> shop : browses
shop --> api : places order
api --> db
api ..> psp : charges
@enduml
```

se convierte en esta hoja, con el informe `11 mapped, 0 approximated, 0 dropped` (el actor es un
nodo dibujado como una persona):

```text
language "0.2"

diagram checkout: flow {
  title "Checkout"
  layout auto

  node customer "Customer"
  node shop "Web shop"
  node api "Orders API"
  data db "Orders"
  group Payments {
    node psp "Payment provider"
  }

  customer -> shop: "browses"
  shop -> api: "places order"
  api -> db
  api --> psp: "charges"

  style customer { shape person }
}
```

Cada construcción se informa como convertida, aproximada o descartada, con su línea; la tabla
completa está en [Importar PlantUML](../import/plantuml.md). Vuelve a importar con `--merge` para
conservar la colocación y los estilos que agregaste después ([CLI](../cli.md)).

## Construcciones equivalentes

| PlantUML                                | Meltemi                                        | Importación                               |
| --------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| `component "Label" as a`                | `node a "Label"`                               | convertido (`description.component`)      |
| `database "Label" as a`                 | `data a "Label"`                               | convertido (`description.database`)       |
| `node name { … }`, `package name { … }` | `group id "name" { … }`                        | convertido (`description.container.node`) |
| `a --> b : text`                        | `a -> b: "text"`                               | convertido (`description.arrow`)          |
| `a ..> b`                               | `a --> b` (discontinua)                        | convertido (`description.arrow`)          |
| `a --\|> b`, `a *-- b`, `a }o--\|\| b`  | el triángulo hueco, el rombo, la pata de gallo | convertido (`description.arrow.head`)     |
| `a <--> b`                              | `a <-> b`                                      | convertido (`description.arrow.both`)     |
| `note right of a : text`                | `note` enlazada a su elemento                  | convertido (`description.note`)           |
| `left to right direction`               | `direction LR`                                 | convertido (`description.direction`)      |
| `actor`, `person`, `:Actor:`            | `node` con `style { shape person }`            | convertido (`description.actor`)          |
| `usecase`, `(Use case)`                 | `node` con `style { shape ellipse }`           | convertido (`description.usecase`)        |
| `cloud`, `hexagon`                      | `node` con `shape cloud`, `shape hexagon`      | convertido (`description.cloud`)          |
| `card`, `file`, `folder`                | `node` con `shape document`                    | convertido (`description.file`)           |
| `interface`, `()`, `circle`             | `node` con `shape circle`                      | convertido (`description.interface`)      |
| `<<stereotype>>`                        | la descripción `«stereotype»`                  | aproximado (`description.stereotype`)     |
| `participant "Label" as a`              | `participant a "Label"`                        | convertido (`sequence.participant`)       |
| `a -> b : text`, `a --> b`              | `a -> b: "text"`, `a --> b`                    | convertido (`sequence.message.call`)      |
| `a -> b ++`, `return text`              | `activate b`, una respuesta y `deactivate`     | convertido (`sequence.return`)            |
| `alt … else … end`                      | `alt id "…" { … } else "…" { … }`              | convertido (`sequence.alt`)               |
| `group text … end`                      | `region id "text" { … }`                       | convertido (`sequence.group`)             |
| `== text ==`, `...`                     | `divider "text"`, `delay`                      | convertido (`sequence.divider`)           |
| `ref over a, b : text`                  | `note over a, b "ref: text"`                   | aproximado (`sequence.ref`)               |
| `!include`, `!define`, `!procedure`     | se expanden antes de la importación            | convertido (`plantuml.include`)           |
| `!include <C4/C4_Container>`            | un modelo y una vista de contenedores          | convertido (`plantuml.include.c4`)        |
| `Person(…)`, `System_Ext(…)`            | `person`, `system` con `external`              | convertido (`plantuml.c4.Person`)         |
| `Container(…)`, `ContainerDb(…)`        | `container`, `datastore`                       | convertido (`plantuml.c4.ContainerDb`)    |

Los diagramas de clases, de estados, de actividades, de tiempos, de Gantt, los mapas mentales y los
demás tipos de diagrama de PlantUML no se importan; consulta la página de
[compatibilidad](../compatibility.md).

## Primeras cosas que probar

1. Importa una carpeta de C4-PlantUML: cada archivo se convierte en un modelo con su vista, y
   `meltemi-diagrams validate` comprueba que la vista y el modelo concuerdan.
2. Cambia las indicaciones de dirección por colocación: abre el lienzo, arrastra las cajas adonde
   las quieras y pasa a `layout assisted`.
3. Dale escenarios a un diagrama de secuencia (`scenario approved { choose result "Approved" }`) y
   exporta cada uno con `--scenario` ([secuencia](../language/sequence.md)).

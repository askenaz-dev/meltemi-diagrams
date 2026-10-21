# Plugins y tipos de diagrama

[English](../plugins.md)

Un plugin agrega **tipos de diagrama** y un **paquete de iconos** a un proyecto. Los plugins son
datos: una carpeta con un manifiesto `meltemi-plugin.json`, que se lee y se comprueba como cualquier
otro archivo del proyecto. Abrir un diagrama nunca ejecuta código (decisión 0030).

## Instalar un plugin

Un proyecto instala un plugin de forma explícita en `project.json`: dónde está su carpeta (dentro
del proyecto), la versión exacta y qué puede aportar.

```json
{
  "name": "data",
  "language": "0.2",
  "plugins": {
    "erd": { "path": "plugins/erd", "version": "1.0.0", "permissions": ["diagram-types", "icons"] }
  }
}
```

| Permiso         | Permite al plugin                                                         |
| --------------- | ------------------------------------------------------------------------- |
| `diagram-types` | declarar tipos de diagrama, que puede usar cualquier archivo del proyecto |
| `icons`         | agregar su paquete de iconos, con el nombre del plugin (`erd:key`)        |

No hay ningún permiso `network`: nada que instale un proyecto descarga nada. Un plugin aporta solo
lo que pide **y** project.json concede; pedir más es una advertencia, y lo demás no se carga.
`meltemi-diagrams assets lock` registra en `assets.lock.json` la versión, la carpeta y el SHA-256
del manifiesto de cada plugin; un manifiesto que cambia después se informa hasta que se vuelve a
escribir el archivo de bloqueo, así que un cambio en un plugin aparece en la revisión como cualquier
otro cambio del proyecto.

`pnpm mdg plugins <project>` enumera los plugins, lo que agregan, su origen y sus problemas;
`--json` muestra lo mismo como un solo objeto.

## El manifiesto

```json
{
  "name": "erd",
  "version": "1.0.0",
  "description": "Entity-relationship diagrams and organisation charts",
  "license": "MIT",
  "homepage": "https://example.com/meltemi-erd",
  "compatibility": { "model": "^1.0.0", "renderer": "^1.0.0" },
  "permissions": ["diagram-types", "icons"],
  "icons": "icons",
  "diagramTypes": [ … ]
}
```

| Campo                                | Significado                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `name`                               | El nombre del plugin, tal como lo instala project.json                                                                     |
| `version`                            | Su versión exacta, que debe ser la que nombra project.json                                                                 |
| `compatibility`                      | Los rangos de versiones del **modelo** intermedio (1.0.0) y del **renderizador** (1.0.0) con los que funciona; obligatorio |
| `permissions`                        | Lo que pide                                                                                                                |
| `icons`                              | Una carpeta de archivos SVG o un archivo `.json` de Iconify dentro del plugin; el SVG se sanea como en cualquier paquete   |
| `libraries`                          | Archivos de biblioteca dentro del plugin ([assets.md](language/assets.md#bibliotecas)); se leen con `icons`                |
| `diagramTypes`                       | Los tipos de diagrama que declara                                                                                          |
| `license`, `homepage`, `description` | Su licencia y su origen, que muestra `plugins`; la página de inicio nunca se descarga                                      |

`main`, `module`, `exports`, `scripts` y `bin` se ignoran con una advertencia: no hay código que
ejecutar.

## Declarar un tipo de diagrama

Un tipo registra su **esquema** (tipos de elemento y propiedades), su **validación** (propiedades
obligatorias y relaciones permitidas), su **disposición** (modo, algoritmo, dirección), sus
**herramientas de edición** (la paleta del lienzo) y su **conversión a primitivas** (la forma y el
estilo de cada tipo de elemento):

```json
{
  "type": "erd",
  "title": "Entity relationship",
  "description": "Tables of a database and how they relate",
  "layout": { "mode": "auto", "algorithm": "layered", "direction": "LR" },
  "elements": {
    "entity": {
      "label": "Entity",
      "description": "A table",
      "style": { "shape": "rectangle", "fill": "@surface", "stroke": "@accent", "width": 2 },
      "properties": { "owner": "string", "rows": "number", "archived": "boolean" },
      "required": ["owner"]
    },
    "view": {
      "label": "View",
      "style": { "shape": "rounded", "line": "dashed", "stroke": "@muted" }
    }
  },
  "relations": {
    "allowed": [
      ["entity", "entity"],
      ["view", "entity"]
    ],
    "properties": { "cardinality": { "kind": "enum", "values": ["one_to_one", "one_to_many"] } }
  },
  "tools": [
    { "kind": "entity", "label": "Entity" },
    { "kind": "view", "label": "View" }
  ]
}
```

| Parte                     | Reglas                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`, tipos de elemento | Palabras en minúsculas que no sean palabras del lenguaje (`flow`, `story`, `group`, `text` y similares)                                                                                                                                                                                                                                                 |
| `layout`                  | `mode` auto, assisted o manual; `algorithm` `layered` o `tree` (los padres centrados sobre sus hijos); `direction` LR, RL, TB o BT                                                                                                                                                                                                                      |
| `style`                   | `shape` (cualquiera de las veinticuatro formas de las [composiciones libres](language/free.md#texto-y-formas)), `radius` (de 0 a 64), `fill`, `stroke`, `color`, `iconColor` (tokens como `@accent` o colores CSS), `line`, `width`, `pattern`, `icon`, `iconPosition`, `labelPosition`, `iconSize`, `fontSize`, `fontWeight`, `textAlign`, `arrowhead` |
| `properties`              | `"string"`, `"number"`, `"boolean"` o `{ "kind": "enum", "values": [...] }`; los nombres no pueden ser los del propio lenguaje (`description`, `url`, `class`…)                                                                                                                                                                                         |
| `allowed`                 | Los pares de tipos de elemento que puede unir una relación, `*` para cualquiera; todos los pares si falta                                                                                                                                                                                                                                               |
| `tools`                   | La paleta; de forma predeterminada, todos los tipos de elemento                                                                                                                                                                                                                                                                                         |

## Escribir diagramas de un tipo declarado

```text
diagram schema: erd {
  title "Orders schema"

  entity customer "Customer" { owner "Sales" }
  entity orders "Orders" { owner "Sales"; rows 120000 }
  view open_orders "Open orders"

  customer -> orders: "places" { cardinality one_to_many }
  open_orders -> orders: "reads"

  style orders { icon "erd:key" }
  rule view { color muted }
}
```

Un tipo declarado se compila con el perfil libre: sus tipos de elemento son cajas dibujadas con el
estilo de cada tipo, y todo lo que aceptan los diagramas libres también funciona (`text`, `icon`,
`image`, `group`, `layers`, `placement`, `style`, `rule <kind>`, `animate`, las historias, las
exportaciones y el catálogo). El tipo comprueba las propiedades obligatorias
(`type.missing-property`) y los tipos de elemento que une una relación
(`type.relation-not-allowed`); los valores se comprueban según el tipo con el que se declararon. En
VS Code, el autocompletado ofrece los tipos de elemento, sus propiedades y los valores de las
enumeraciones, al pasar el puntero se muestran la descripción y el plugin de un tipo de elemento, y
la paleta del lienzo ofrece las herramientas del tipo.

En el JSON del modelo, los elementos de un tipo declarado son `"kind": "box"` con `"typeKind"` y
`"data"`, y el diagrama lleva `"declaredType"` con el nombre y la versión del plugin.

## Para aplicaciones que integran las bibliotecas

`readDiagramType(json, plugin)` comprueba una definición y `compile(text, { types })` compila con
ella, así que una aplicación puede registrar tipos propios con el mismo formato. Los proyectos nunca
cargan código; una aplicación que integra las bibliotecas decide por sí misma qué importa.

# Diagnósticos y códigos de rechazo

[English](../../language/diagnostics.md)

Cada problema de un archivo fuente es un diagnóstico con un código estable, una gravedad, un mensaje
de una frase, un rango y, opcionalmente, pistas y rangos relacionados. El análisis y la compilación
nunca lanzan excepciones ante lo que escribe el usuario. Los códigos no cambian una vez publicados;
un tipo de problema nuevo recibe un código nuevo.

Cada código tiene un ejemplo en `corpus/invalid/<code>.meltemi`, con su salida esperada en
`corpus/invalid/<code>.diagnostics.json`.

Los mensajes, las pistas y las notas relacionadas están en el idioma de la interfaz: inglés, o
español cuando el editor, el playground o la línea de comandos hablan español. Las plantillas de
esta página son las del español; los códigos, las gravedades y los rangos son los mismos en los dos
idiomas. Las herramientas leen los `data` de un diagnóstico (los ids que nombra, las alternativas
que puede escribir una corrección, el tamaño en el que cabe un texto), nunca sus palabras.

## Sintaxis

Los informa `parse()` de `@meltemi/diagrams-language`. El analizador informa un diagnóstico por cada instrucción que falla.

| Código                        | Gravedad | Plantilla del mensaje                                                           |
| ----------------------------- | -------- | ------------------------------------------------------------------------------- |
| `syntax.unexpected-character` | error    | Carácter inesperado `<c>`. (pistas para `=>`, `>` y el texto no ASCII)          |
| `syntax.unterminated-string`  | error    | La cadena no se cierra con `"` antes del final de la línea.                     |
| `syntax.invalid-escape`       | error    | Secuencia de escape desconocida `\<c>` en la cadena.                            |
| `syntax.unterminated-comment` | error    | El comentario de bloque no se cierra con `*/` antes del final del archivo.      |
| `syntax.bom`                  | info     | El archivo empieza con una marca de orden de bytes; se conserva tal cual.       |
| `syntax.mixed-line-endings`   | warning  | Esta línea termina con `<LF/CRLF>`, pero el archivo empezó con `<CRLF/LF>`.     |
| `syntax.header-not-first`     | error    | El encabezado `language` debe ser la primera instrucción del archivo.           |
| `syntax.unexpected-top-level` | error    | No se esperaba `<token>` en el nivel superior del archivo.                      |
| `syntax.expected-token`       | error    | Se esperaba `<what>`, pero se encontró `<token>`.                               |
| `syntax.unexpected-token`     | error    | No se esperaba `<token>`; se esperaba el final de la instrucción. (y variantes) |
| `syntax.nesting-too-deep`     | error    | Los bloques, las tuplas y las listas están anidados en más de 100 niveles.      |

Una `}` que falta es un `syntax.expected-token` que se informa una sola vez, al final del archivo,
con un rango relacionado en la `{` que abrió el bloque.

## Lenguaje y perfiles

Los informa `compile()` de `@meltemi/diagrams-model`.

| Código                         | Gravedad | Plantilla del mensaje                                                                                           |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| `language.unsupported-version` | error    | La versión del lenguaje "`<v>`" no es compatible; este compilador implementa la versión 0.2.                    |
| `profile.unknown`              | error    | Tipo de diagrama desconocido `<type>`; se esperaba uno de estos: flow, sequence, c4, free.                      |
| `theme.unknown-base`           | error    | El tema `<id>` extiende \"<name>\", que no es un tema integrado ni está definido en este archivo (o importado). |
| `theme.cycle`                  | error    | El tema `<id>` hereda de sí mismo a través de `extends`.                                                        |

## Referencias, propiedades y colocación

Los informa `compile()` para los diagramas `flow`, `free`, `sequence` y `c4`, los bloques `model` y
las historias. Un diagrama con algún error queda fuera del JSON; los demás diagramas del archivo se
compilan igualmente.

| Código                     | Gravedad | Plantilla del mensaje                                                                                                                                                                                |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref.duplicate-id`         | error    | `<id>` ya está declarado en este diagrama. (relacionado: la primera declaración)                                                                                                                     |
| `ref.unknown-element`      | error    | Elemento desconocido `<id>`. (también: extremos calificados, relaciones usadas como elementos)                                                                                                       |
| `ref.unknown-relation`     | error    | Relación desconocida `<id>`. (pista: las relaciones anónimas necesitan `as <id>`)                                                                                                                    |
| `ref.unknown-layer`        | error    | Capa desconocida `<name>`. (pista: las capas declaradas y la instrucción `layers` que escribir)                                                                                                      |
| `ref.unknown-link`         | error    | `<diagram>` no tiene ningún elemento `<id>`. (también: un diagrama, un modelo, una entidad o una importación desconocidos, o un enlace a su propio diagrama)                                         |
| `ref.unknown-model`        | error    | Modelo desconocido `<name>`. (pista: los modelos del archivo y las importaciones)                                                                                                                    |
| `ref.unknown-entity`       | error    | Entidad desconocida `<path>` en el modelo `<id>`. (pista: rutas parecidas)                                                                                                                           |
| `animate.missing-effect`   | error    | Un bloque `animate` necesita un `effect`: `flow`, `pulse`, `dash` o `trace`.                                                                                                                         |
| `animate.invalid-target`   | error    | El efecto no se aplica a este destino: partículas o un recorrido en una caja, un trazo en movimiento en un elemento sin contorno, o cualquier efecto que no sea un pulso en un evento.               |
| `animate.conflict`         | error    | `<target>` ya tiene un efecto `<effect>`. (relacionado: el primer efecto)                                                                                                                            |
| `story.unknown-diagram`    | error    | No hay ningún diagrama `<name>` sobre el que contar una historia. (pista: los diagramas del archivo y las importaciones)                                                                             |
| `story.invalid-target`     | error    | `trace` sigue una relación; `<id>` es un elemento (o una nota o un fragmento).                                                                                                                       |
| `story.missing-transition` | error    | La escena cambia a `<view>`; indica cómo con `transition cut`, `fade` o `morph`.                                                                                                                     |
| `story.conflict`           | error    | `<action>` se superpone a una acción anterior sobre el mismo `<channel>` de `<target>`. (relacionado: la acción anterior)                                                                            |
| `story.empty-scene`        | warning  | La escena `<id>` no tiene acciones y no dura nada.                                                                                                                                                   |
| `export.unknown-target`    | error    | No hay ningún diagrama ni historia `<name>` que exportar. (pista: los diagramas y las historias del archivo)                                                                                         |
| `export.missing-format`    | error    | El perfil `<id>` necesita un `format`: svg, png, pdf, html, mp4, webm, gif.                                                                                                                          |
| `export.invalid-option`    | error    | `<option>` no se aplica a las exportaciones `<format>` (también: `motion` o `scenario` en historias, `at` después del final de una historia).                                                        |
| `model.invalid-nesting`    | error    | No se puede declarar un `<kind>` aquí; las personas y los sistemas van en la raíz, los contenedores y los almacenes de datos en sistemas, los componentes en contenedores.                           |
| `model.invalid-relation`   | error    | Una relación de una entidad consigo misma, o entre una entidad y su ancestro.                                                                                                                        |
| `c4.invalid-level`         | error    | Una vista necesita `level context`, `level container` o `level component`.                                                                                                                           |
| `c4.scope-required`        | error    | Una vista de contenedores o de componentes necesita su ámbito: un sistema o un contenedor.                                                                                                           |
| `c4.invalid-scope`         | error    | El ámbito de una vista `<level>` es un `<kind>`; `<path>` es un `<kind>`. (también: los almacenes de datos no tienen componentes)                                                                    |
| `c4.out-of-level`          | error    | Una vista `<level>` no dibuja el `<kind>` `<path>`. (también: el ámbito en `include`)                                                                                                                |
| `c4.unsupported-relation`  | error    | Ninguna relación del modelo va de `<a>` a `<b>`; una vista no dibuja flechas por conveniencia.                                                                                                       |
| `prop.unknown`             | error    | Instrucción o propiedad desconocida `<word>` en un `<context>`. (pista: las palabras aceptadas)                                                                                                      |
| `prop.invalid-value`       | error    | Valor no válido para `<property>`, o una instrucción que no se ajusta a su forma. (también: `shape` en un tipo que no es `node` ni `box`, un valor fuera de rango como `radius 99` o `iconSize 200`) |
| `prop.duplicate`           | error    | `<property>` se asigna más de una vez. (relacionado: la primera)                                                                                                                                     |
| `sequence.activation`      | error    | `<participant>` no está activo aquí. (un `deactivate` sin su `activate`)                                                                                                                             |
| `sequence.lifecycle`       | error    | Un evento después de `destroy`, `create` después de que apareciera el participante o dos veces, o `destroy` dos veces.                                                                               |
| `sequence.scenario`        | error    | Un escenario nombra un fragmento o una rama desconocidos, un operador que no admite la elección, o iteraciones fuera del rango de 1 a 100.                                                           |
| `placement.route-mismatch` | error    | La ruta de `<relation>` debe empezar en `<from>` (o terminar en `<to>`).                                                                                                                             |
| `placement.duplicate`      | error    | `<target>` ya tiene una instrucción `<statement>`. (relacionado: la primera)                                                                                                                         |
| `placement.unknown-port`   | error    | `<element>` no tiene ningún puerto `<name>`. (pista: los puertos con nombre del elemento y los puertos cardinales)                                                                                   |

## Disposición y exportación

Los informan `layoutDiagram()` de `@meltemi/diagrams-layout` y `meltemi-diagrams export`, no `compile()`. Los
ejemplos de `corpus/invalid/layout.*.meltemi` los comprueba el paquete de disposición, y
`corpus/invalid/export.no-diagram.meltemi`, las pruebas de la CLI. `layout.engine-failed` no tiene
ejemplo en el corpus, porque ELK no falla con diagramas válidos; lo cubre una prueba unitaria con un
motor que falla. Los modos de disposición, las restricciones y las comprobaciones de composición se
describen en [layout.md](layout.md).

| Código                          | Gravedad | Plantilla del mensaje                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.missing-placement`      | error    | `<id>` no tiene una instrucción `place`; `layout manual` necesita una posición para cada elemento. (también: un grupo con `place` pero sin `size`, o sin hijos colocados)                                                                                                                                                                                                                                                                                  |
| `layout.mode-unsupported`       | error    | `layout <mode>` necesita un motor de disposición para colocar `<ids>`. (pista: las aplicaciones anfitrionas pasan `LayoutOptions.engine`; la línea de comandos usa ELK)                                                                                                                                                                                                                                                                                    |
| `layout.engine-failed`          | error    | Falló el motor de disposición `<engine>`: `<message>`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `layout.placement-ignored`      | warning  | `layout auto` organiza todos los elementos, así que se ignoran las instrucciones `place` y los puntos de paso de las rutas. (en la primera; pista: `layout assisted`)                                                                                                                                                                                                                                                                                      |
| `layout.constraint-conflict`    | error    | `<constraint>` no se puede cumplir para `<ids>`: `<what is off, in px>`. La escena se dibuja de todos modos.                                                                                                                                                                                                                                                                                                                                               |
| `layout.overlap`                | warning  | `<a>` y `<b>` se superponen. (también: una caja que cruza el borde de su grupo, o que está sobre un grupo que no la declara; una caja estrictamente dentro de otra declarada antes es una pila y no se informa; una pila declarada de dentro hacia fuera recibe una pista que pide declarar primero la caja exterior)                                                                                                                                      |
| `layout.label-under-connector`  | warning  | La etiqueta de `<relation>` queda sobre el conector de `<other>`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `layout.container-margin`       | warning  | `<id>` está demasiado cerca del borde o de la banda del título de su grupo `<group>`.                                                                                                                                                                                                                                                                                                                                                                      |
| `layout.connector-overlap`      | warning  | Los conectores de `<a>` y `<b>` se superponen a lo largo de `<n>` px.                                                                                                                                                                                                                                                                                                                                                                                      |
| `layout.text-overflow`          | warning  | `<id>` mide `<w>` px de ancho, pero su texto "`<text>`" necesita `<n>` px. (pista: un `size` en el que quepa); para una forma de icono: `<id>` mide `<w>` × `<h>` px, demasiado poco para dibujar su icono: necesita `<w>` × `<h>` px.                                                                                                                                                                                                                     |
| `layout.connector-crossing`     | warning  | El conector de `<relation>` atraviesa `<id>`. (una caja de su capa que no une y que no contiene ninguno de sus extremos)                                                                                                                                                                                                                                                                                                                                   |
| `layout.label-cut`              | warning  | El texto "`<text>`" de `<id>` sobresale `<n>` px de su forma. (también: de su etiqueta o del dibujo; una forma se mide por su área de texto)                                                                                                                                                                                                                                                                                                               |
| `layout.label-overlap`          | warning  | El texto "`<text>`" de `<id>` se superpone al texto "`<other>`" de `<id>`. (también: a la caja de `<id>`, al conector de `<relation>`)                                                                                                                                                                                                                                                                                                                     |
| `layout.unmeasured-font`        | info     | Parte del texto se mide con estimaciones: una fuente del tema no está incluida, o hay caracteres que las fuentes incluidas no cubren.                                                                                                                                                                                                                                                                                                                      |
| `layout.image-unavailable`      | warning  | La imagen `<path>` de `<id>` no se puede dibujar; en su lugar se dibuja un marcador de posición. (no hay resolvedor de imágenes, o no se puede leer el archivo)                                                                                                                                                                                                                                                                                            |
| `layout.icon-missing`           | warning  | `<id>` se dibuja como su icono, pero no tiene `icon`; en su lugar se dibuja un marcador de posición. (sobre la propiedad `shape`, una vez por instrucción; pista: el estilo `icon` que escribir, u otra forma)                                                                                                                                                                                                                                             |
| `layout.label-position-ignored` | warning  | El `labelPosition` de `<id>` no tiene efecto: su icono no ocupa el centro. (sobre la propiedad, una vez por instrucción; desde una regla o una clase, solo cuando ningún elemento al que da estilo tiene un icono centrado o `shape icon`; desde un tema, una vez, sobre el `theme` del diagrama; pista: `iconPosition center` o `shape icon`, o, en los grupos, las marcas, las notas, los textos, los iconos, las imágenes y las entidades C4, quitarla) |
| `layout.unknown-theme`          | warning  | Tema desconocido "`<name>`"; se dibuja con technical.light.                                                                                                                                                                                                                                                                                                                                                                                                |
| `layout.too-large`              | warning  | El contenido mide `<w>` × `<h>` px; una diapositiva mide 1920 × 1080 px. (también: más de 1200 px de ancho con `preset document`, más grande que un `canvas`; pista: dividir en vistas)                                                                                                                                                                                                                                                                    |
| `export.no-diagram`             | error    | No hay ningún diagrama que exportar. (pista: una historia con `--story`, los perfiles del archivo con `--profiles`, o los tipos de diagrama que se dibujan)                                                                                                                                                                                                                                                                                                |

## Formato

Los informan `formatSource()` de `@meltemi/diagrams-language` y `meltemi-diagrams format`
(`docs/language/formatting.md`).

| Código                  | Gravedad | Plantilla del mensaje                                        |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `format.syntax-errors`  | error    | El archivo tiene errores de sintaxis y no se le dio formato. |
| `format.invalid-option` | error    | La sangría debe ser de 1 a 8 espacios o "tab", no `<value>`. |

## Proyectos y módulos

Los informa la compilación de proyectos de `@meltemi/diagrams-project` (`Workspace`), que usan
`meltemi-diagrams validate` y `export`, no `compile()`. Cada código tiene un proyecto de ejemplo en
`corpus/projects/invalid/<code>/` con su salida esperada en `expected.json`.

| Código                      | Gravedad | Plantilla del mensaje                                                                                                                                                                                                                                          |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.invalid-path`       | error    | `<path>` no es una ruta de importación válida. (motivo: URL, absoluta, separador, extensión, `//`)                                                                                                                                                             |
| `module.outside-project`    | error    | `<path>` apunta fuera del proyecto.                                                                                                                                                                                                                            |
| `module.not-found`          | error    | No hay ningún archivo en `<path>`. (pista: un archivo con otras mayúsculas y minúsculas)                                                                                                                                                                       |
| `module.unknown-member`     | error    | `<file>` no define `<id>`. (pista: los ids que define)                                                                                                                                                                                                         |
| `module.reserved-name`      | error    | `<name>` está reservado para los temas integrados, como `<name>.light`.                                                                                                                                                                                        |
| `module.cycle`              | error    | Ciclo de importaciones: `a.meltemi → b.meltemi → a.meltemi`.                                                                                                                                                                                                   |
| `module.duplicate-import`   | warning  | `<file>` ya se importa en este archivo.                                                                                                                                                                                                                        |
| `module.import-position`    | warning  | Las importaciones van antes del primer bloque del archivo.                                                                                                                                                                                                     |
| `module.unused-import`      | info     | `<name>` se importa, pero nunca se usa.                                                                                                                                                                                                                        |
| `project.invalid-json`      | error    | project.json no es JSON válido: `<reason>`.                                                                                                                                                                                                                    |
| `project.missing-field`     | error    | project.json no tiene el campo `<field>`.                                                                                                                                                                                                                      |
| `project.unknown-field`     | warning  | Campo desconocido `<field>` en project.json. (también: herramientas desconocidas, ajustes de `cloud` desconocidos)                                                                                                                                             |
| `project.invalid-value`     | error    | Un campo tiene un tipo incorrecto, un lenguaje no admitido, un rango de versiones que no se puede leer, o un `theme` mal formado, inexistente o no declarado en su archivo, o un `cloud` que no es un objeto con un origen como `host` y un id como `project`. |
| `project.tool-version`      | error    | El proyecto requiere meltemi-diagrams `<range>`, pero esta es la versión `<version>`.                                                                                                                                                                          |
| `project.language-mismatch` | error    | Este archivo declara el lenguaje "`<v>`", pero el proyecto usa "`<w>`".                                                                                                                                                                                        |

Los fallos de los comandos de la nube (`login`, `push`, `pull`, `publish` y los demás) no son
diagnósticos de un archivo: tienen códigos estables propios, como `cloud.host-mismatch` y
`pull.unsafe-path`, listados en [la línea de comandos](../cli.md#fallos-y-códigos-de-salida).

La compilación de proyectos también informa, en el archivo que escribió el nombre,
`theme.unknown-base` para un `extends` y `layout.unknown-theme` para un `theme` de diagrama cuyo
nombre empieza por un vínculo de importación pero no se resuelve en nada. Los nombres de una
importación que no se resolvió no se vuelven a informar.

También comprueba las clases aplicadas, porque solo el proyecto conoce toda la cadena de temas de un
diagrama:

| Código                | Gravedad | Plantilla del mensaje                                                                                                       |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `theme.unknown-class` | warning  | La clase `<name>` no está declarada en el diagrama, en su tema ni en las clases integradas. (pista: las clases disponibles) |

### Recursos

Los informa la compilación de proyectos sobre los archivos de recursos, project.json o el valor del
icono en un diagrama, una clase de tema o una regla ([assets.md](assets.md)).

| Código                    | Gravedad | Plantilla del mensaje                                                                                                                                            |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset.unknown-pack`      | error    | No hay ningún paquete de iconos ni alias `<prefix>`. (pista: los paquetes)                                                                                       |
| `asset.unknown-icon`      | error    | El paquete `<prefix>` no tiene el icono `<name>`. (pista: nombres parecidos, o `assets icons`)                                                                   |
| `asset.missing-license`   | error    | El paquete de iconos o la fuente `<name>` no tiene licencia. (pista: la entrada de `assets/licenses.json` que agregar)                                           |
| `asset.invalid-file`      | error    | No se puede leer un paquete, una fuente, un archivo de licencias o un archivo de bloqueo, o un campo tiene un tipo incorrecto (advertencia: claves desconocidas) |
| `asset.unsafe-svg`        | error    | No se puede usar el icono `<ref>`: `<element or attribute>` no está permitido en los iconos.                                                                     |
| `asset.too-large`         | error    | Un archivo o un icono supera un límite de tamaño o de complejidad.                                                                                               |
| `asset.duplicate-pack`    | error    | El paquete `<prefix>` ya lo define `<file>` o los paquetes integrados.                                                                                           |
| `asset.unusable-name`     | warning  | El nombre de un archivo de icono SVG lleva caracteres que una referencia no puede escribir; se deja fuera. (sugerencia: el nombre que darle)                     |
| `asset.font-restricted`   | warning  | La licencia de `<family>` prohíbe incrustar la fuente; se usa solo para medir el texto.                                                                          |
| `asset.lock-mismatch`     | warning  | Los recursos difieren de assets.lock.json: `<change>`. (pista: `assets lock`)                                                                                    |
| `asset.outside-project`   | error    | La ruta de una imagen es una URL, es absoluta, usa barras invertidas o sale de la raíz del proyecto. (el modelo comprueba la forma)                              |
| `asset.unknown-image`     | error    | No hay ningún archivo de imagen `<path>`.                                                                                                                        |
| `asset.unsupported-image` | error    | `<path>` no es una imagen PNG, JPEG, GIF, WebP o SVG, está dañada o ocupa más de 8 MB.                                                                           |

Un alias de project.json que no nombra ningún paquete, o que es el nombre de un paquete, es
`project.invalid-value`.

## Plugins y tipos declarados

Los plugins se instalan en project.json y se describen en su meltemi-plugin.json
([plugins.md](../plugins.md)).

| Código                      | Gravedad | Plantilla del mensaje                                                                                                         |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `plugin.not-found`          | error    | El plugin `<name>` no tiene meltemi-plugin.json en `<path>`.                                                                  |
| `plugin.invalid-manifest`   | error    | El manifiesto no es JSON, o un campo o un tipo de diagrama es incorrecto (el mensaje dice cuál).                              |
| `plugin.name-mismatch`      | error    | El manifiesto llama al plugin `<name>`; project.json instala `<name>`.                                                        |
| `plugin.version-mismatch`   | error    | project.json instala `<name>` `<version>`, pero su carpeta contiene la `<version>`.                                           |
| `plugin.incompatible`       | error    | El manifiesto no declara compatibilidad, o no acepta esta versión del modelo o del renderizador.                              |
| `plugin.code-ignored`       | warning  | Se ignora `main`, `module`, `exports`, `scripts` o `bin`: los plugins son datos y su código nunca se ejecuta.                 |
| `plugin.permission-denied`  | error    | Un permiso es desconocido o es `network`, que nunca se concede (advertencia: pedido y no concedido, o concedido y no pedido). |
| `plugin.duplicate-type`     | error    | El tipo de diagrama `<type>` ya lo declara `<plugin>`.                                                                        |
| `type.missing-property`     | error    | `<Kind>` `<id>` necesita `<property>`, que el tipo exige.                                                                     |
| `type.relation-not-allowed` | error    | Los diagramas `<Type>` no permiten relaciones de `<kind>` a `<kind>`. (pista: los pares permitidos)                           |

## Límites

Cotas que impiden que un repositorio no confiable agote un editor o un trabajo (`docs/security.md`).

| Código                 | Gravedad | Plantilla del mensaje                                                                                          |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `limit.too-large`      | error    | El archivo (un archivo fuente, project.json o un manifiesto de plugin) tiene más caracteres de los permitidos. |
| `limit.too-complex`    | error    | `<diagram>` tiene más elementos, relaciones o eventos de los que puede tener un diagrama.                      |
| `limit.too-many-files` | error    | El proyecto tiene más archivos `.meltemi` de los que se compilan.                                              |

## Importación

Los informan `importText()` y `mergeImport()` de `@meltemi/diagrams-import`, `meltemi-diagrams import`
y los comandos de importación de VS Code. Los rangos están en el origen que se importa (el archivo
Markdown, en los bloques delimitados); los rangos de `import.merge` están en la hoja existente. Cada
hallazgo nombra además su construcción y si es esencial; las construcciones se listan en
[docs/es/import/mermaid.md](../import/mermaid.md) y [docs/es/import/plantuml.md](../import/plantuml.md).

| Código                         | Gravedad | Plantilla del mensaje                                                                                   |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `import.unknown-format`        | error    | El origen no se reconoce como Mermaid, PlantUML ni Markdown. (pista: `--from`)                          |
| `import.unsupported-diagram`   | error    | Los diagramas `<type>` no se importan. (pista: los tipos admitidos)                                     |
| `import.syntax`                | warning  | No se puede leer `<line>`. Esencial; la línea se conserva como comentario en la hoja.                   |
| `import.unsupported-construct` | warning  | `<construct>` no se importa. Esencial cuando nombra un elemento, una relación o un mensaje.             |
| `import.approximated`          | info     | La construcción conserva su significado con otro dibujo, como un círculo doble dibujado como círculo.   |
| `import.renamed-id`            | info     | `<id>` no es un id válido; se escribe como `<new id>`.                                                  |
| `import.partial`               | warning  | `<n>` construcciones esenciales no se importaron; la hoja está incompleta.                              |
| `import.include`               | warning  | Una inclusión de PlantUML es remota, absoluta, está fuera de la carpeta o no existe; nunca se descarga. |
| `import.preprocessor`          | error    | El preprocesador de PlantUML se detuvo: directiva o función desconocida, recursión, límites.            |
| `import.merge`                 | info     | Se descartó o se redujo una instrucción de la hoja existente, o se conserva un bloque.                  |

## Rechazos de edición

Los devuelven `planEdit()` y `applyEdits()` de `@meltemi/diagrams-edit` como `{ ok: false, rejection }`. No
son diagnósticos del código fuente: el documento no cambia y el motivo explica qué hacer.

| Código                    | Significado                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit.unsafe-target`      | El diagrama tiene un error de sintaxis, no es un diagrama de flujo o el destino no existe (también: una historia, una escena o una acción de historia, o un id de la vista de una escena; mover un elemento dentro de sí mismo, dentro de un grupo que contiene o dentro de algo que no es un grupo, o entre grupos de un diagrama de secuencia o de una vista C4). |
| `edit.anonymous-relation` | La relación no tiene id; ejecuta antes `materializeRelationId`.                                                                                                                                                                                                                                                                                                     |
| `edit.invalid-value`      | No se puede escribir un valor de coordenada, tamaño, puerto, porcentaje, estilo o propiedad, o la edición agregaría un error de compilación, que el mensaje nombra (también: una forma desconocida, una forma para un tipo que no es `box` ni `node`, una flecha bidireccional en una vista C4).                                                                    |
| `edit.invalid-id`         | El nuevo id no es un identificador válido.                                                                                                                                                                                                                                                                                                                          |
| `edit.id-conflict`        | El nuevo id ya lo usa un elemento o una relación del diagrama, o un fragmento pegado declara uno que ya existe.                                                                                                                                                                                                                                                     |
| `edit.already-named`      | `materializeRelationId` sobre una relación que ya tiene id.                                                                                                                                                                                                                                                                                                         |
| `edit.has-dependents`     | Eliminar sin cascada un elemento al que hacen referencia otras instrucciones o un puerto que usan las rutas, o desagrupar un grupo que es extremo de una relación; `dependents` los lista.                                                                                                                                                                          |
| `edit.stale-revision`     | El plan se calculó para otra revisión del documento.                                                                                                                                                                                                                                                                                                                |
| `edit.unsafe-result`      | Red de seguridad: el texto planificado se analizaría con más errores que antes.                                                                                                                                                                                                                                                                                     |

Un lote (`planEdit` con `{ kind: "batch", operations }`) se rechaza entero con el código de la
primera operación rechazada y su `operationIndex`.

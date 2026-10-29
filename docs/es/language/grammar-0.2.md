# Lenguaje `.meltemi` 0.2

[English](../../language/grammar-0.2.md)

Esta es la referencia de la sintaxis que implementa `@meltemi/diagrams-language` y de los
vocabularios `flow`, `free`, `sequence` y `c4` y los bloques `model` que valida
`@meltemi/diagrams-model`. Sigue la propuesta del 9 de octubre de 2026 y las decisiones 0001 a 0004
y 0018 a 0020. Los cambios en el lenguaje siguen la [política de cambios del lenguaje](policy.md), y
el [conjunto de pruebas de conformidad](conformance.md) fija lo que significan los archivos.

Un archivo puede empezar con un encabezado de versión. Cada ejemplo de abajo es un archivo completo
y válido.

```text
language "0.2"

diagram example: flow {
  A -> B
}
```

## Texto y codificación

- Los archivos son UTF-8. Se acepta y se conserva una marca de orden de bytes inicial (`syntax.bom`,
  informativo).
- Los saltos de línea son LF o CRLF. Mezclar ambos es una advertencia
  (`syntax.mixed-line-endings`); las ediciones usan el estilo del primer salto de línea.
- Los desplazamientos cuentan unidades de código UTF-16. Las líneas y las columnas de los
  diagnósticos empiezan en 1.

## Reglas léxicas

| Elemento             | Regla                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificador        | `[A-Za-z_][A-Za-z0-9_]*`. No se admiten guiones.                                                                                                               |
| Cadena               | `"..."` en una sola línea. Secuencias de escape: `\"`, `\\`, `\n`, `\t`. Las demás secuencias de escape son errores.                                           |
| Número               | `-` opcional, dígitos, `.digits` opcional y, después, un sufijo de unidad opcional.                                                                            |
| Unidad               | Letras justo después de un número (`1200ms`, `1s`) o `%` (`50%`).                                                                                              |
| Símbolos de relación | `->` (continua o llamada), `-->` (discontinua o respuesta), las bidireccionales `<->` y `<-->`, y las líneas sin puntas `--` (continua) y `---` (discontinua). |
| Puntuación           | `{ } ( ) [ ] : ; , .`                                                                                                                                          |
| Salto de línea       | `\n` o `\r\n`. Es un token, porque termina las instrucciones.                                                                                                  |
| Trivia               | Espacios, tabulaciones, `// line comments`, `/* block comments */`, marca de orden de bytes.                                                                   |

La trivia se adjunta al token siguiente, así que el árbol conserva cada carácter. Una secuencia de
caracteres que no inicia ningún token (por ejemplo `=>` o `#`) es un único error
`syntax.unexpected-character`.

Una secuencia de `-` y `>` toma el token más largo con el que empieza: `---`, luego `-->`, luego
`--` y luego `->`; `-` delante de un dígito empieza un número. Un guion más es discontinuo, y las
líneas dejan la punta: `a -- b` y `a --- b` son líneas, `a --5` es `--` seguido del número `5`, y
`a ---> b` es `---` seguido de un `>` inesperado, cuya pista nombra los seis símbolos de relación.

## Gramática

```ebnf
source-file   = { separator | top-level } EOF ;
separator     = NEWLINE | ";" ;

top-level     = header | import | model-block | diagram-block | story-block | export-block | theme-block ;
header        = "language" STRING ;                       (* only as the first statement *)
import        = "import" ( STRING "as" IDENT                    (* namespace import *)
                         | member { "," member } "from" STRING ) ; (* member import *)
member        = IDENT [ "as" IDENT ] ;
model-block   = "model" IDENT block ;
theme-block   = "theme" IDENT block ;
diagram-block = "diagram" IDENT ":" IDENT [ "using" ref ] block ;
story-block   = "story" IDENT "for" ref block ;
export-block  = "export" IDENT "for" ref block ;

block         = "{" { separator | statement } "}" ;
statement     = relation | shorthand | keyword-stmt ;

relation      = ref arrow ref [ ":" STRING ] [ "as" IDENT ] [ block ] ;
arrow         = "->" | "-->" | "--" | "---" | "<->" | "<-->" ;
shorthand     = IDENT "[" ( STRING | "(" STRING ")" ) "]" [ block ] ;
keyword-stmt  = IDENT args [ block { IDENT args block } ] ;   (* chained clauses stay on one line *)
args          = { arg | "," } ;
arg           = ref | STRING | NUMBER | tuple | list ;
tuple         = "(" { arg | "," } ")" ;
list          = "[" { arg | "," } "]" ;
ref           = IDENT { "." IDENT } ;
```

Reglas que la EBNF no muestra:

- Una instrucción termina en un salto de línea, en `;` o antes de la `}` que cierra su bloque.
- Dentro de `( )` y `[ ]`, un salto de línea continúa la instrucción cuando la línea termina con el
  signo de apertura o con una coma, o cuando la línea siguiente empieza con una coma o con el signo
  de cierre. Si no, la tupla o la lista se informa como no cerrada al final de su línea.
- Las palabras son palabras clave solo según su posición. `label`, `theme` o `node` pueden ser ids
  de elementos.
- `as`, `from`, `using` y `for` solo se reconocen donde la gramática los espera.
- Un identificador seguido directamente de `[` es una declaración abreviada.
- Las cláusulas encadenadas, como `alt "A" { ... } else "B" { ... }`, deben empezar en la línea de
  la `}` anterior.
- Los bloques, las tuplas y las listas se anidan como máximo 100 niveles
  (`syntax.nesting-too-deep`).

## Recuperación de errores

El analizador sintáctico nunca lanza excepciones. Por cada instrucción que falla informa un
diagnóstico, salta hasta el siguiente salto de línea, `;` o `}` que la encierra, y continúa. Los
nodos `Missing` de ancho cero marcan lo que se esperaba. Una `}` que falta se informa una sola vez,
al final del archivo. Los tokens que el analizador léxico ya informó, como una cadena sin terminar,
no producen un segundo diagnóstico.

## Bloques de nivel superior

| Bloque                           | Estado en 0.2                                                         |
| -------------------------------- | --------------------------------------------------------------------- |
| `language "0.2"`                 | Se comprueba. Las demás versiones son `language.unsupported-version`. |
| `diagram <id>: flow { }`         | Se compila y se valida.                                               |
| `diagram <id>: sequence { }`     | Se compila y se valida ([sequence.md](sequence.md)).                  |
| `diagram <id>: c4 using <m> { }` | Se compila y se valida contra el modelo ([c4.md](c4.md)).             |
| `diagram <id>: free { }`         | Se compila y se valida ([free.md](free.md)).                          |
| `theme <id> { }`                 | Se compila en una definición de tema (consulta Bloques de tema).      |
| `model <id> { }`                 | Se compila ([c4.md](c4.md)).                                          |
| `story <id> for <diagram> { }`   | Se compila y se valida ([stories.md](stories.md)).                    |
| `export <id> for <target> { }`   | Se compila y se valida ([export.md](export.md)).                      |

## Importaciones

```text
import "../themes/company.meltemi" as company        // company.corporate, company.base
import corporate as corp, base from "./themes.meltemi" // corp, base
```

Las importaciones van después del encabezado `language` y antes del primer bloque. Las rutas son
relativas al archivo que importa, empiezan con `./` o `../`, usan `/` y terminan en `.meltemi`. Los
nombres vinculados comparten el espacio de nombres de nivel superior del archivo. Un espacio de
nombres no puede ser `technical`, `editorial`, `stage` ni `sketch`, los prefijos de los temas
integrados. Los
temas importados se usan por su nombre: `theme "corp"`, `theme "company.corporate"`,
`extends "company.base"`. La resolución, los ciclos y las raíces de proyecto se describen en
[projects.md](projects.md).

## Vocabulario `flow`

### Instrucciones del diagrama

| Instrucción     | Forma                                                                                   | Notas                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| forma abreviada | `id["Label"]`, `id[("Label")]`                                                          | tipos `node` y `data`                                                                                   |
| `node`          | `node <id> ["Label"] [{ ... }]`                                                         |                                                                                                         |
| `decision`      | `decision <id> ["Label"] [{ ... }]`                                                     |                                                                                                         |
| `data`          | `data <id> ["Label"] [{ ... }]`                                                         |                                                                                                         |
| `group`         | `group <id> ["Label"] [{ ... }]`                                                        | contiene declaraciones y relaciones; con `""`, un contenedor simple sin banda del título                |
| `note`          | `note <id> "Text\nmore text" [on <element>]`                                            | texto libre; `\n` empieza una línea nueva; `on` la adjunta a un elemento (una guía punteada)            |
| `tag`           | `tag <id> "PKCE"`                                                                       | una píldora pequeña, colocada sobre una caja o junto a ella                                             |
| relación        | `a -> b`, `a --> b`, `a <-> b`, `a <--> b`, `a -- b`, `a --- b`, `: "Label"`, `as <id>` | continua o discontinua, en un sentido, bidireccional o una línea sin puntas; los extremos son elementos |
| `direction`     | `direction LR`                                                                          | `LR` (predeterminado), `RL`, `TB`, `BT`                                                                 |
| `layout`        | `layout assisted`                                                                       | `auto` (predeterminado), `assisted`, `manual`                                                           |
| `routing`       | `routing orthogonal`                                                                    | `auto` (predeterminado), `orthogonal`, `polyline`, `bezier`                                             |
| `layers`        | `layers back, main, front`                                                              | orden de pintado, de atrás hacia adelante; `main` siempre existe ([free.md](free.md#capas-y-orden))     |
| `theme`         | `theme "editorial.light"`                                                               |                                                                                                         |
| `title`         | `title "Checkout"`                                                                      |                                                                                                         |
| `description`   | `description "..."`                                                                     |                                                                                                         |
| `preset`        | `preset slide`                                                                          | `document`, `slide` o `board`                                                                           |
| `canvas`        | `canvas (1280, 720)`                                                                    | de 100 a 10 000 px; no va con `preset`                                                                  |
| `placement`     | `placement { ... }`                                                                     | puede aparecer más de una vez                                                                           |
| `style`         | `style <target>[, <target>...] { ... }`                                                 | destinos: elementos o relaciones con nombre                                                             |
| `animate`       | `animate <target>[, <target>...] { ... }`                                               | destinos: elementos, relaciones con nombre, notas, fragmentos                                           |
| `class`         | `class <id> { ... }`                                                                    | propiedades de estilo reutilizables                                                                     |
| `rule`          | `rule <kind> { ... }`                                                                   | da estilo a todos los elementos de un tipo                                                              |

Un identificador usado como extremo de una relación sin declaración declara un `node` cuya etiqueta
es su id. De forma predeterminada, la etiqueta es el id. Una relación registra su `line`
(`solid` o `dashed`) y sus `heads`: `end` para `->` y `-->`, `both` para `<->` y `<-->`, `none`
para `--` y `---`. Una línea no dibuja punta en ningún extremo salvo que se escriba `arrowhead` o
`arrowtail`, igual que el `arrowhead` del tema es solo el valor predeterminado de `->`
([styles.md](styles.md#puntas-de-flecha)). Los diagramas de secuencia aceptan las cuatro flechas y
las vistas C4, `->` y `-->`; otro símbolo es `prop.invalid-value` sobre el símbolo, que nombra los
que acepta el perfil. `note` y `tag` son anotaciones: participan
en la colocación y en el dibujo como cualquier elemento (consulta [svg-export.md](svg-export.md)) y
rara vez son extremos de relaciones. La cláusula `on <element>` de una nota la adjunta a un elemento
del diagrama (la ruta de la entidad en una vista C4): el modelo la registra como `attachedTo`, dibuja
una guía punteada de la nota al elemento y hace que la disposición de `layout auto` los mantenga
cerca. `note` es también una declaración de los diagramas libres y de las vistas C4
([free.md](free.md#notas), [c4.md](c4.md#notas-en-las-vistas)). Un bloque `style` o `animate` con varios destinos se aplica a
cada uno de ellos; volver a asignar la misma propiedad de estilo a un destino en una instrucción
posterior es `prop.duplicate`, y un segundo efecto del mismo tipo sobre un destino es
`animate.conflict` ([motion.md](motion.md)). Las clases, las reglas, los preajustes y el orden en
que se aplican los estilos se describen en [styles.md](styles.md). Los modos de disposición, los
puertos, las restricciones y los tipos de ruta se describen en [layout.md](layout.md).

### Bloques

| Bloque             | Instrucciones                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bloque de elemento | `description "<text>"`, `class <id>[, <id>...]`, `layer <nombre>`, `port <name> north\|south\|east\|west [<n>%]`, `link <d>.<e>`, `url "<url>"`                                                                                 |
| bloque de grupo    | declaraciones, relaciones, grupos anidados, `description "<text>"`, `class <id>[, <id>...]`, `layer <nombre>`, `link <d>.<e>`, `url "<url>"`; en las composiciones libres, `layout column\|row`, `spacing <n>`, `align <where>` |
| bloque de relación | `description "<text>"`, `assumption "<why>"` (una relación inferida, que se dibuja discontinua y atenuada hasta que se confirma), `class <id>[, <id>...]`, `layer <nombre>`                                                     |
| `placement`        | `place`, `size`, `route`, `label` y las restricciones `align`, `row`, `column`, `order`, `distance` (más abajo)                                                                                                                 |
| `style`            | las propiedades de estilo de más abajo, y `class <id>[, <id>...]`                                                                                                                                                               |
| `class`            | las propiedades de estilo de más abajo                                                                                                                                                                                          |
| `rule`             | las propiedades de estilo de más abajo                                                                                                                                                                                          |
| `animate`          | `effect`, `duration`, `repeat`, `delay`, `direction`, `particles`, `color` ([motion.md](motion.md))                                                                                                                             |

| Propiedad de estilo | Valor                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`              | `"<pack>:<name>"`, tomado de los paquetes integrados o de los del proyecto ([assets.md](assets.md))                                                                                                                                                                                                                                               |
| `iconColor`         | un color entre comillas o el nombre de un token de color; el color de los iconos monocromos                                                                                                                                                                                                                                                       |
| `iconPosition`      | `left`, `right`, `top`, `bottom` o `center`; solo nodos, decisiones, almacenes de datos y cajas                                                                                                                                                                                                                                                   |
| `labelPosition`     | `top`, `bottom`, `left` o `right`, el borde de la etiqueta cuando el icono ocupa el centro (`iconPosition center`, `shape icon`); solo nodos, decisiones, almacenes de datos y cajas                                                                                                                                                              |
| `iconSize`          | `auto` o un número de 8 a 128, con o sin `px`; solo nodos, decisiones, almacenes de datos y cajas                                                                                                                                                                                                                                                 |
| `fill`              | un color entre comillas (`"none"` no dibuja fondo) o el nombre de un token de color, como `surface`                                                                                                                                                                                                                                               |
| `stroke`            | un color entre comillas o el nombre de un token de color, como `danger`                                                                                                                                                                                                                                                                           |
| `color`             | un color entre comillas o el nombre de un token de color; el color del texto                                                                                                                                                                                                                                                                      |
| `line`              | `solid`, `dashed` o `dotted`                                                                                                                                                                                                                                                                                                                      |
| `width`             | ancho del contorno, del conector o del trazo de un lápiz, de 0 a 64; de 1 a 64 en un lápiz                                                                                                                                                                                                                                                        |
| `opacity`           | de 0 a 1; solo elementos, grupos, líneas y lápices de las composiciones libres                                                                                                                                                                                                                                                                    |
| `radius`            | radio de las esquinas, de 0 a 64, con o sin `px`, sobre el `radius` o el `groupRadius` del tema; solo elementos y grupos                                                                                                                                                                                                                          |
| `shape`             | `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent` o `icon`; solo `node` (flujo) y `box` (libre)                                              |
| `pattern`           | `none`, `hatch`, `dots` o `cross`; solo elementos                                                                                                                                                                                                                                                                                                 |
| `arrowhead`         | la punta en el destino: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `onlyOne`, `zeroOrOne` o `zeroOrMany`; la del tema de forma predeterminada, ninguna en `--`, `---`, las líneas libres y los lápices; solo relaciones, líneas libres y lápices |
| `arrowtail`         | la punta en el origen, con los mismos valores; ninguna de forma predeterminada, o la del destino en `<->`; solo relaciones, líneas libres y lápices                                                                                                                                                                                               |
| `routing`           | `auto`, `orthogonal`, `polyline` o `bezier`; solo relaciones y líneas libres (`polyline` de forma predeterminada en una línea)                                                                                                                                                                                                                    |
| `corners`           | codos `sharp` o `rounded` de las rutas rectas y en codo; solo relaciones y líneas libres                                                                                                                                                                                                                                                          |

### Colocación

| Instrucción | Forma                                                                                | Reglas                                                  |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `place`     | `place <element> at (x, y)`                                                          | centro de la caja, en unidades lógicas                  |
| `size`      | `size <element> (w, h)`                                                              | números positivos                                       |
| `route`     | `route <relation> from <el>.<port> [<n>%] to <el>.<port> [<n>%] [via [(x, y), ...]]` | los extremos coinciden con los de la relación, en orden |
| `label`     | `label <relation> at <n>% [offset (dx, dy)]`                                         | `n` de 0 a 100                                          |
| `align`     | `align <el>, <el>... top\|middle\|bottom\|left\|center\|right`                       | dos o más elementos                                     |
| `row`       | `row <el>, <el>...`                                                                  | centros verticales iguales                              |
| `column`    | `column <el>, <el>...`                                                               | centros horizontales iguales                            |
| `order`     | `order <el>, <el>... [horizontal\|vertical]`                                         | de forma predeterminada, el eje es el de la dirección   |
| `distance`  | `distance <el>, <el> <n>`                                                            | al menos `n` px entre las cajas                         |

Los puertos son `north`, `south`, `east`, `west`, `auto` y los que un elemento declara con `port` en
su bloque; `from api` significa `from api.auto`. Un porcentaje después de un lado de la brújula
fija el extremo en ese punto del lado (`from api.east 50%`). Un nombre de puerto que el elemento no
declara es `placement.unknown-port`. `route` y `label` necesitan una relación con nombre (`as <id>`). Cada
elemento tiene como máximo un `place` y un `size`, y cada relación como máximo un `route` y un
`label`. Las restricciones se aplican a cajas, notas y marcas, no a grupos; un elemento aparece
como máximo una vez en cada una.

Las relaciones sin `as <id>` reciben la clave `<from>-><to>#<n>` en el modelo y en el JSON
(decisión 0004).

`link <diagram>.<element>` en un bloque de elemento o de grupo registra que el elemento representa
un elemento de otro diagrama: del mismo archivo, o a través de una importación, como
`link <member>.<element>` o `link <namespace>.<diagram>.<element>`. Es solo identidad; un destino
desconocido es `ref.unknown-link`.

## Vocabulario `free`

Una composición libre coloca los objetos a mano ([free.md](free.md)). Comparte con los diagramas de
flujo las relaciones, `placement`, `style`, `class`, `rule` y `animate`, y `layout manual` es su
valor predeterminado.

| Instrucción | Forma                                                                         | Notas                                                                                                       |
| ----------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `box`       | `box <id> ["Label"] [{ ... }]`                                                | también `id["Label"]`; `id[("Label")]` es una caja con forma de cilindro                                    |
| `text`      | `text <id> "Text\nmore text"`                                                 | texto medido sin recuadro                                                                                   |
| `icon`      | `icon <id> "<pack>:<name>"`                                                   | un icono de los paquetes, de 48 × 48 de forma predeterminada                                                |
| `image`     | `image <id> "<path>"`                                                         | un archivo PNG, JPEG, GIF, WebP o SVG del proyecto                                                          |
| `note`      | `note <id> "Text" [on <element>] [{ ... }]`                                   | una anotación con una guía punteada hasta el elemento ([free.md](free.md#notas))                            |
| `sticky`    | `sticky <id> "Text" [{ ... }]`                                                | una tarjeta de 160 × 160 cuyo texto se reparte y se encoge para caber ([free.md](free.md#notas-adhesivas))  |
| `group`     | `group <id> ["Label"] { ... }`                                                | sus hijos se colocan dentro de su interior, o los coloca el grupo con `layout column\|row`                  |
| `line`      | `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]] [{ ... }]`     | una línea que no une ningún elemento, con sus puntos en el interior de su padre ([free.md](free.md#líneas)) |
| `pen`       | `pen <id> [(x, y), (x, y), ...] [{ ... }]`                                    | un trazo a mano alzada, con sus puntos en el interior de su padre ([free.md](free.md#trazos-de-lápiz))      |
| `layers`    | `layers back, main, front`                                                    | de atrás hacia adelante; `main` es la última si no se lista                                                 |
| relación    | como en los diagramas de flujo, incluidos `--` y `---`                        |                                                                                                             |
| propiedades | como en los diagramas de flujo, con `layout manual` como valor predeterminado |                                                                                                             |

Los bloques de elemento, de grupo y de relación también aceptan `layer <name>`. Las propiedades de
estilo de las composiciones libres son `fontSize` (de 6 a 160), `fontWeight` (400, 500, 600, 700),
`textAlign` (`left`, `center`, `right`), `verticalAlign` (`top`, `middle`, `bottom`) y `opacity`
(de 0 a 1, no en las relaciones); los diagramas de flujo las rechazan. `shape` admite las
veinticuatro formas en las cajas igual que en los nodos de flujo
([free.md](free.md#texto-y-formas)); los textos, los iconos, las imágenes, las notas, las notas
adhesivas, las líneas y los lápices la rechazan. Las reglas aceptan los tipos de las composiciones
libres: `rule box { ... }`, `rule sticky { ... }`, `rule line { ... }`, `rule pen { ... }`.

Una `line` no acepta `place`, `size` ni `rotation`: sus puntos se escriben en su instrucción.
Acepta los estilos de una relación (`stroke`, `line`, `width`, `color`, `fill` e `icon` para la
píldora de su etiqueta, `arrowhead`, `arrowtail`, `routing`, `corners`) y `opacity`, y rechaza los
de una caja; `label <id> at <n>% [offset (dx, dy)]` mueve su etiqueta igual que la de una relación
con nombre. Los diagramas de flujo, de secuencia y C4 rechazan `line` con `prop.unknown`.

Un `pen` enumera al menos un punto `(x, y)`, con los decimales conservados, y no tiene etiqueta; no
acepta `place`, `size` ni `rotation`. Sus estilos son `stroke` (`ink` de forma predeterminada),
`width` (de 1 a 64, 3 de forma predeterminada), `line`, `opacity`, `arrowhead` y `arrowtail`;
cualquier otro es `prop.invalid-value`. Un `sticky` necesita su texto y acepta los estilos de una
caja salvo `shape`, `pattern`, `iconPosition` y `labelPosition`. Los diagramas de flujo, de
secuencia y C4 rechazan `pen` y `sticky` con `prop.unknown`.

El bloque de un grupo de una composición libre también acepta `layout column` o `layout row`, que
convierte el grupo en una lista que coloca a sus hijos en el orden del código, `spacing <n>` (de 0
a 400) y `align start|center|end|stretch` ([free.md](free.md#listas)). `spacing` o `align` sin
`layout` es `prop.invalid-value`; los diagramas de flujo rechazan los tres.

El `place` de un hijo de un grupo es relativo al interior del grupo: su esquina superior izquierda
más `groupPadding` en horizontal y, en vertical, `groupHeader` en un grupo con título o
`groupPadding` en uno sin título (`group <id> ""` sin `description` ni icono). Los grupos necesitan
un `place`; su tamaño se escribe o se deriva de sus hijos.

## Vocabulario `sequence`

Un diagrama de secuencia ordena los eventos de arriba abajo ([sequence.md](sequence.md)). Comparte
con los demás perfiles las relaciones, `style`, `class`, `rule`, `animate`, `link` y las propiedades
de diagrama `theme`, `title`, `description`, `preset` y `canvas`; `autonumber`, `spacing` y `tag`
en los bloques de los mensajes y los participantes son suyas.

| Instrucción   | Forma                                                                                                                  | Notas                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| participantes | `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` `<id> ["Label"] [{ ... }]` | también `id["Label"]` y `id[("Label")]`                                                                                                                                                               |
| `group`       | `group <id> ["Label"] { participants }`                                                                                | una caja alrededor de participantes                                                                                                                                                                   |
| mensaje       | `a -> b: "L" as id { kind async }`, `a --> b`, `a <-> b`                                                               | llamada, respuesta; bidireccional; `kind async`; `a -> a` es una autollamada; el bloque de una llamada contiene propiedades y eventos; la etiqueta se ajusta entre las líneas de vida y `\n` la parte |
| `return`      | `return ["L"] [as id] [{ ... }]`                                                                                       | en el bloque de una llamada: la respuesta discontinua del receptor a quien llama, la última de su lista                                                                                               |
| `tag`         | `tag "T"` en el bloque de un mensaje (también un `return`) o de un participante                                        | una píldora sobre la flecha del mensaje o una insignia sobre la cabecera; una línea, sin id, varias en orden                                                                                          |
| activación    | `activate <p>`, `deactivate <p>`                                                                                       | barras anidadas; el bloque de una llamada con eventos también es una                                                                                                                                  |
| ciclo de vida | `create <p>`, `destroy <p>`                                                                                            | la cabecera en su fila; una cruz termina la línea de vida                                                                                                                                             |
| `note`        | `note [<id>] over <p>[, <q>] "T"`, `left of <p>`, `right of <p>`                                                       |                                                                                                                                                                                                       |
| fragmentos    | `alt`/`else`, `opt`, `loop`, `par`/`and`, `break`, `critical`/`option`, `region` `[<id>] ["c"] { ... }`                | las ramas encadenadas van en la línea de la `}`                                                                                                                                                       |
| `divider`     | `divider "L"`                                                                                                          |                                                                                                                                                                                                       |
| `delay`       | `delay ["L"]`                                                                                                          |                                                                                                                                                                                                       |
| `autonumber`  | `autonumber [n]`                                                                                                       | numera los mensajes desde `n` (1)                                                                                                                                                                     |
| `spacing`     | `spacing n`                                                                                                            | la distancia entre cabeceras vecinas, de 0 a 400 (40)                                                                                                                                                 |
| `scenario`    | `scenario <id> ["L"] { choose <f> "c" \| <n>; repeat <loop> <n>; skip <f>; take <f> }`                                 | un camino para las exportaciones                                                                                                                                                                      |
| `placement`   | `space <event> n [before\|after]`, `gap <participant> [-]n [before\|after]`, `label <message> at n% offset (dx, dy)`   | `before` por defecto; un `gap` puede ser negativo salvo en el lado exterior                                                                                                                           |

Las reglas que se comprueban según el orden (`sequence.activation`, `sequence.return`,
`sequence.lifecycle`) y las comprobaciones de escenarios (`sequence.scenario`) se enumeran en
[diagnostics.md](diagnostics.md).

## Bloques `model` y vocabulario `c4`

Un modelo declara entidades y relaciones; las vistas C4 lo dibujan ([c4.md](c4.md)).

| Instrucción | Forma                                                                                | Notas                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| entidades   | `person`, `system`, `container`, `datastore`, `component` `<id> ["Label"] [{ ... }]` | los sistemas contienen contenedores y almacenes de datos; los contenedores contienen componentes                  |
| propiedades | `description "…"`, `technology "…"`, `external`, `url "…"`                           | `external` en personas y sistemas                                                                                 |
| relación    | `a -> b: "Label" as id { technology "…"; description "…"; assumption "…" }`          | los extremos son rutas, que se buscan desde la entidad que las contiene; `assumption` marca una relación inferida |
| vista       | `diagram <id>: c4 using <model> { ... }`                                             | un modelo del archivo o de una importación                                                                        |
| `level`     | `level context` \| `container` \| `component`                                        | obligatorio                                                                                                       |
| `scope`     | `scope <path>`                                                                       | un sistema, o un contenedor en el nivel de componentes                                                            |
| listas      | `include <path>, …`, `exclude <path>, …`                                             | sin `include`, el conjunto predeterminado del nivel                                                               |
| `label`     | `label <path-or-relation> "Text"`                                                    | una etiqueta local                                                                                                |
| combinación | `<a> -> <b>: "Label" as id`                                                          | una flecha para las relaciones del modelo entre `a` y `b`                                                         |

Las vistas también aceptan `title`, `description`, `direction`, `layout`, `routing`, `theme`,
`preset`, `canvas`, `placement`, `style`, `class`, `rule` y `animate`; los destinos son rutas de
entidades (`place shop.api at (…)`, `route request from shop.web.east to shop.api`).

## Bloques de tema

`theme <id> { }` define tokens de diseño en el nivel superior de un archivo. Los tokens son
instrucciones planas `name value`; un diagrama elige un tema con `theme "<id>"`, un proyecto puede
fijar un tema predeterminado en `project.json`, y `meltemi-diagrams export --theme <name>` se impone
a ambos. Temas integrados: `technical.light` (predeterminado), `technical.dark`, `editorial.light`,
`editorial.dark`, `stage.light`, `stage.dark`, `sketch.light` y `sketch.dark`.

```text
theme konfio {
  extends "technical.light"
  accent "#6a4fd0"
  accentEnd "#a594f0"
  brand "Konfío · Meltemi Diagrams"
  frame footer

  class partner { line dashed; stroke accent }
  rule data { pattern dots }
}
```

| Token                                                                                                                                                                                                  | Valor                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extends`                                                                                                                                                                                              | nombre entre comillas de un tema integrado o de un archivo                                                                                                                                   |
| `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`, `success`, `warning`, `danger`, `info`, `highlight`, `sticky`, `stickyText` | color entre comillas                                                                                                                                                                         |
| `font`, `mono`                                                                                                                                                                                         | lista de fuentes entre comillas                                                                                                                                                              |
| `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize`                                                                                              | número, de 6 a 48                                                                                                                                                                            |
| `iconSize`                                                                                                                                                                                             | número, de 8 a 64                                                                                                                                                                            |
| `iconPosition`                                                                                                                                                                                         | `left`, `right`, `top`, `bottom` o `center`                                                                                                                                                  |
| `labelWeight`                                                                                                                                                                                          | 400, 500, 600 o 700                                                                                                                                                                          |
| `padding`, `groupPadding`, `groupHeader`, `margin`                                                                                                                                                     | número, de 0 a 200                                                                                                                                                                           |
| `radius`, `groupRadius`                                                                                                                                                                                | número, de 0 a 64                                                                                                                                                                            |
| `strokeWidth`, `connectorWidth`                                                                                                                                                                        | número, de 0 a 8                                                                                                                                                                             |
| `arrowhead`                                                                                                                                                                                            | una punta: `triangle`, `open`, `none`, `triangleOutline`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `onlyOne`, `zeroOrOne` o `zeroOrMany` |
| `corners`                                                                                                                                                                                              | `sharp` (temas integrados salvo `sketch.*`) o `rounded` (`sketch.*`)                                                                                                                         |
| `sketch`                                                                                                                                                                                               | `none` (temas integrados salvo `sketch.*`), `light` (`sketch.*`) o `rough`: cómo se pintan los trazos ([svg-export.md](svg-export.md#trazos-a-mano))                                         |
| `arrowSize`                                                                                                                                                                                            | número, de 0 a 32                                                                                                                                                                            |
| `frame`                                                                                                                                                                                                | `none`, `footer` o `header`                                                                                                                                                                  |
| `brand`                                                                                                                                                                                                | texto del logotipo entre comillas                                                                                                                                                            |
| `mark`                                                                                                                                                                                                 | `meltemi` o `none`                                                                                                                                                                           |

Los números se escriben sin unidad o con `px`. Los bloques de tema también aceptan `class <id> { }` y
`rule <kind> { }`, que heredan los temas que los extienden ([styles.md](styles.md)).

Un tema sin `extends` hereda de `technical.light`. Un destino de `extends` que no es integrado ni
está definido en el archivo es `theme.unknown-base`; una cadena que vuelve a un tema es
`theme.cycle`. Los ids de tema comparten el espacio de nombres del archivo con los ids de diagrama.

## Bloques de historia

| Bloque     | Instrucciones                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `story`    | `title`, `description`, `scene <id> ["Title"] { }`                                                           |
| `scene`    | `view <diagram>`, `transition cut\|fade\|morph [over <time>]` y, después, acciones                           |
| acciones   | `reveal`, `hide`, `highlight`, `focus`, `camera`, `trace`, `draw` (destinos, `[over <time>]`), `hold <time>` |
| `parallel` | acciones que empiezan a la vez                                                                               |

Los tiempos llevan `ms` o `s`, de `0ms` a `600s`; `focus` y `camera` aceptan `all`
([stories.md](stories.md)).

## Perfiles de exportación

`export <id> for <diagram-or-story> { … }` contiene las opciones de una entrega: `format`
(obligatoria), `size`, `scale`, `background`, `at`, `motion`, `theme`, `fonts`, `scenario`, `link`,
`fps`, `duration`, `file`, y `autoplay`, `loop` y `embed` para HTML. Cada opción se aplica solo a
algunos formatos ([export.md](export.md)).

## Aún sin decidir

Se aplaza a una decisión de la gramática 0.3, después de los prototipos de la etapa 2:

- La semántica de los grupos: si los grupos crean espacios de nombres y cómo interactúan las
  referencias calificadas con el cambio de nombre.
- Si las cláusulas encadenadas pueden empezar en la línea siguiente a la `}` de cierre.

# Estilos, temas y preajustes

[English](../../language/styles.md)

El aspecto de un diagrama viene de su tema y de un pequeño conjunto de instrucciones de estilo. Todo
se escribe en el archivo `.meltemi`, así que el mismo código fuente se dibuja igual en la CLI, en el
editor y en cada formato de exportación. No hay CSS.

## Temas

Un tema es un conjunto de tokens de diseño. Hay ocho temas integrados:

| Tema                                                 | Para                       | Carácter                                                                                                       |
| ---------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `technical.light` (predeterminado), `technical.dark` | revisión de arquitectura   | Inter, la paleta de Meltemi, un marco al pie con el símbolo                                                    |
| `editorial.light`, `editorial.dark`                  | documentos y lectura larga | IBM Plex Sans, grises discretos, puntas abiertas, sin marco                                                    |
| `stage.light`, `stage.dark`                          | presentaciones y video     | Inter, alto contraste, tipografía más grande y bordes más gruesos, márgenes amplios, un marco en el encabezado |
| `sketch.light`, `sketch.dark`                        | pizarras y primeras ideas  | los temas técnicos con los trazos pintados a mano (`sketch light`) y los codos redondeados; Patrick Hand       |

Un diagrama elige un tema con `theme "<name>"`. Sin él, usa el tema predeterminado del proyecto
(`"theme"` en `project.json`; consulta [projects.md](projects.md)) o `technical.light`.
`meltemi-diagrams export --theme <name>` se impone a ambos.

### Bloques de tema

`theme <id> { }` define un tema en el nivel superior de un archivo. Extiende un tema integrado u otro
tema y fija solo los tokens que cambia:

```text
theme company {
  extends "technical.light"
  accent "#6a4fd0"
  labelSize 14
  brand "Company · Meltemi Diagrams"

  class partner { line dashed; stroke accent }
  rule data { pattern dots }
}
```

Un tema sin `extends` extiende `technical.light`. Los temas se importan como cualquier bloque
([projects.md](projects.md)).

### Tokens

| Grupo      | Tokens                                                                                                                                 | Valor                                                                 | `technical.*`                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Colores    | `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`              | color entre comillas                                                  | consulta [svg-export.md](svg-export.md#temas)                                       |
| Señales    | `success`, `warning`, `danger`, `info`                                                                                                 | color entre comillas                                                  | `#15803D`, `#B45309`, `#B91C1C`, `#0369A1` en el tema claro                         |
| Fuentes    | `font`, `mono`                                                                                                                         | lista de fuentes CSS entre comillas                                   | Inter, Cascadia Mono                                                                |
| Tipografía | `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize`                              | número, de 6 a 48                                                     | 13; 11; 13; 11; 10,5; 11; 12                                                        |
|            | `labelWeight`                                                                                                                          | 400, 500, 600 o 700                                                   | 600                                                                                 |
| Espaciado  | `padding` (del texto al borde de la caja), `groupPadding`, `groupHeader` (banda del título del grupo), `margin` (alrededor del lienzo) | número, de 0 a 200                                                    | 16, 16, 40, 20                                                                      |
| Forma      | `radius` (cajas, notas), `groupRadius`: valores predeterminados que el `radius` de un elemento sustituye                               | número, de 0 a 64                                                     | 8, 14                                                                               |
| Bordes     | `strokeWidth` (contornos), `connectorWidth`                                                                                            | número, de 0 a 8                                                      | 1; 1,3                                                                              |
| Flechas    | `arrowhead`, `arrowSize`, `corners`                                                                                                    | una punta (más abajo); número, de 0 a 32; `sharp` o `rounded`         | `triangle`, 8, `sharp` (`sketch.*`: `rounded`)                                      |
| Boceto     | `sketch`                                                                                                                               | `none`, `light` o `rough`                                             | `none` (`sketch.*`: `light`)                                                        |
| Iconos     | `iconSize`, `iconPosition`                                                                                                             | número, de 8 a 64; `left`, `right`, `top`, `bottom` o `center`        | 18, `left` (stage: 24, `top`)                                                       |
| Marco      | `frame`, `brand`, `mark`                                                                                                               | `none`, `footer` o `header`; texto entre comillas; `meltemi` o `none` | `footer`, `Meltemi Diagrams`, `meltemi`                                             |
| Movimiento | `flowDuration`, `dashDuration`, `pulseDuration`, `traceDuration`                                                                       | un tiempo, de `100ms` a `60s`                                         | ninguno: 1200 ms para las partículas, 1500 ms para el recorrido, 1 s para los demás |
| Lienzo     | `selection`, `guide`                                                                                                                   | color entre comillas                                                  | ninguno: el lienzo usa `accent`                                                     |

Los tokens del lienzo solo dan color al editor: `selection` a su selección, a sus tiradores y al
punto que toma el extremo de un conector, y `guide` a sus guías de alineación y al contorno y los
imanes de la caja sobre la que se arrastra un extremo. Las exportaciones nunca los usan, y los
estilos no pueden nombrarlos.

`sketch` pinta cada trazo como si estuviera dibujado a mano: los contornos, los conectores, las
puntas, las píldoras de las etiquetas, las bandas de los grupos y el marco se dibujan dos veces
sobre un relleno limpio, y cada pasada tiembla un poco (`light`) o más (`rough`), mientras que el
texto, los iconos y las imágenes siguen nítidos. La disposición no cambia, y todas las
exportaciones y el lienzo muestran el mismo temblor para el mismo texto
([svg-export.md](svg-export.md#trazos-a-mano)). Es un token del tema, no una propiedad de estilo:
un diagrama se dibuja a mano entero o no se dibuja así, y `style a { sketch rough }` es
`prop.unknown`.

```text
theme whiteboard {
  extends "technical.light"
  sketch rough
}
```

Los números se escriben sin unidad o con `px`; las duraciones, con `ms` o `s`, como en `animate`. Un
token de duración es la velocidad predeterminada de su efecto en todos los diagramas que usan el
tema: una instrucción `animate` sin `duration` la toma ([movimiento](motion.md)). Las alturas de
línea, las alturas de las píldoras, la franja del marco y los tamaños predeterminados de las cajas
escalan con los tamaños de letra, y las cajas sin `size` crecen hasta que cabe su texto, así que un
`labelSize` mayor nunca hace que el texto se desborde.

## Instrucciones de estilo

Tres instrucciones dan estilo a un diagrama, de la más general a la más específica:

```text
diagram checkout: flow {
  theme "company"

  rule data { pattern dots }                  // cada almacén de datos
  class hot { stroke danger; width 2 }        // un conjunto reutilizable de propiedades

  api["API"] { class hot, partner }           // clases aplicadas donde se declara un elemento
  api -> db as save { class proposed }        // y donde se escribe una relación
  style db { class critical; fill "#fff" }    // clases y propiedades explícitas para destinos
}
```

| Propiedad                | Valor                                                                                                 | Se aplica a                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `fill`                   | color entre comillas (`"none"` para no tener fondo) o nombre de un token de color                     | elementos, etiquetas de relación             |
| `stroke`                 | color entre comillas o nombre de un token de color                                                    | contornos y conectores                       |
| `color`                  | color entre comillas o nombre de un token de color                                                    | texto                                        |
| `line`                   | `solid`, `dashed` o `dotted`                                                                          | contornos y conectores                       |
| `width`                  | número, de 0 a 16                                                                                     | contornos y conectores                       |
| `radius`                 | número, de 0 a 64: el radio de las esquinas, sobre el `radius` o el `groupRadius` del tema            | solo elementos y grupos                      |
| `rotation`               | número, de 0 a 360: los grados que gira el elemento, en el sentido del reloj                          | elementos de flujo y libres                  |
| `shape`                  | una de las veinticuatro formas de [free.md](free.md#texto-y-formas)                                   | nodos de flujo y cajas libres                |
| `pattern`                | `none`, `hatch`, `dots` o `cross`                                                                     | solo elementos                               |
| `arrowhead`              | la punta en el destino (más abajo)                                                                    | relaciones y líneas libres                   |
| `arrowtail`              | la punta en el origen (más abajo)                                                                     | relaciones y líneas libres                   |
| `routing`                | `auto`, `orthogonal`, `polyline` o `bezier` ([disposición](layout.md))                                | relaciones y líneas libres                   |
| `corners`                | codos `sharp` o `rounded` de las rutas rectas y en codo                                               | relaciones y líneas libres                   |
| `icon`                   | `"<pack>:<name>"` ([assets.md](assets.md))                                                            | elementos y relaciones                       |
| `iconColor`              | color entre comillas o nombre de un token de color                                                    | iconos monocromos                            |
| `iconPosition`           | `left`, `right`, `top`, `bottom` o `center` ([iconos en las cajas](#iconos-en-las-cajas))             | nodos, decisiones, almacenes de datos, cajas |
| `labelPosition`          | `top`, `bottom`, `left` o `right`: el borde de la etiqueta alrededor de un icono centrado             | nodos, decisiones, almacenes de datos, cajas |
| `iconSize`               | `auto`, o un número de 8 a 128: el lado del icono                                                     | nodos, decisiones, almacenes de datos, cajas |
| `fontSize`, `fontWeight` | el tamaño del texto, de 6 a 160, y su grosor, 400, 500, 600 o 700 ([free.md](free.md#texto-y-formas)) | cajas y textos libres                        |
| `textAlign`              | `left`, `center` o `right`: dónde va el texto a lo ancho de su caja                                   | cajas y textos libres                        |
| `verticalAlign`          | `top`, `middle` o `bottom`: dónde va el texto a lo alto de su forma                                   | cajas libres                                 |
| `class`                  | uno o más ids de clase, en instrucciones `style` y en bloques de declaración                          | elementos y relaciones                       |

- Un nombre de token de color (`danger`, `accent`, `muted`, …) sigue al tema: `stroke danger` es rojo
  en todos los temas, con el rojo de cada tema. Una palabra sin comillas que no es un token de color
  es `prop.invalid-value`; escribe los colores CSS entre comillas, como en `fill "red"`.
- `pattern` superpone a la forma un rayado, puntos o una cuadrícula en el color del borde del
  elemento (o en `muted`) con un 35 % de opacidad, así que el significado nunca depende solo del
  color.
- `pattern`, `iconPosition`, `labelPosition`, `iconSize`, `radius` y `rotation` en una relación,
  `arrowhead`, `arrowtail`, `routing` o `corners` en un elemento que no sea una línea libre, y
  `shape` en algo que no sea un `node` de flujo o una `box` libre, son `prop.invalid-value` en las
  instrucciones `style` y en las reglas. Una línea libre acepta las propiedades de una relación y
  rechaza las de una caja ([free.md](free.md#líneas)). `fontSize`, `fontWeight`, `textAlign` y
  `verticalAlign` son solo de las composiciones libres: los diagramas de flujo las rechazan. Una
  clase puede contenerlos todos; cada destino toma lo que se le aplica.
- `radius` redondea las esquinas de todas las formas que las tienen, limitado a la mitad del lado
  más corto: los nodos y las cajas `rounded` (con el `radius` del tema por defecto), las cajas y
  los nodos `rectangle`, `square` y `framed` (rectos por defecto), los vértices de los polígonos y
  de las decisiones (agudos por defecto; cada uno se corta `radius` a lo largo de sus dos lados, como
  mucho la mitad de cada uno, y se une con una curva), los cuerpos de `person` y `agent`, las notas,
  los textos, iconos e imágenes con recuadro y los grupos: `style api { radius 0 }` hace cuadrado
  un nodo, `style h { shape hexagon; radius 10 }` suaviza un hexágono y `rule group { radius 0 }`
  hace cuadrados todos los grupos. Los conectores, los imanes y el área del texto siguen el contorno
  redondeado. Las elipses, los círculos, las píldoras, los cilindros, las nubes, los documentos, los
  almacenes de datos, las marcas y los tipos de los diagramas de secuencia no tienen esquinas que
  redondear.
- `rotation` gira un elemento de un diagrama de flujo o de una composición libre ese número de
  grados en el sentido de las agujas del reloj, alrededor del centro de su caja, con su texto, su
  icono y su etiqueta exterior: `style api { rotation 90 }`, `rule text { rotation 270 }`.
  `place` y `size` siguen describiendo la caja sin girar. Los conectores llegan al contorno girado;
  un puerto o un punto fijado (`api.north 30%`) gira con el elemento y conserva el nombre de su
  lado. El motor de disposición, los grupos que se dibujan alrededor de sus hijos y las
  comprobaciones de composición usan el rectángulo que envuelve el dibujo girado. Los grupos, los
  diagramas de secuencia y las vistas C4 la rechazan con `prop.invalid-value`; 0 y 360 se dibujan
  rectos.
- `shape` dibuja un nodo o una caja con una de veinticuatro formas, cada una con su tamaño
  predeterminado, su área de texto y un contorno en el que terminan los conectores
  ([free.md](free.md#texto-y-formas)): `style api { shape hexagon }`,
  `style planner { shape agent }` para un agente de IA, o
  `style fn { icon "aws:lambda"; shape icon }` para un elemento dibujado como su icono. Las
  decisiones, los almacenes de datos, las notas, las marcas, los grupos, los textos, iconos e
  imágenes libres, los participantes de secuencia y las entidades C4 la rechazan, porque su tipo
  decide su dibujo.
- `line dotted` dibuja puntos redondos separados según el ancho de la línea; `-->`, `---` y
  `line dashed` dibujan guiones.

### Puntas de flecha

Una relación tiene una punta en su destino (`arrowhead` o, si no, la del tema) y, opcionalmente, en
su origen (`arrowtail`). Sin `arrowtail`, el origen no tiene punta, o tiene la del destino cuando la
relación se escribe `<->` o `<-->`. Una relación escrita `--` (una línea) o `---` (una línea
discontinua) no tiene punta en ningún extremo salvo que se escriba `arrowhead` o `arrowtail`: la
punta del tema es solo el valor predeterminado de las flechas.

```text
api <-> cache                                  // la punta del tema en ambos extremos
api -- db as link                              // una línea: sin punta en ningún extremo
style link { arrowhead circle }                // salvo que un estilo la escriba
customer -> order as places
style places { arrowtail onlyOne; arrowhead zeroOrMany }
```

| Punta                          | Se dibuja como                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `triangle`, `triangleOutline`  | un triángulo relleno o hueco (generalización UML)              |
| `open`                         | una V                                                          |
| `diamond`, `diamondOutline`    | un rombo relleno o hueco (composición y agregación UML)        |
| `circle`, `circleOutline`      | un círculo relleno o hueco                                     |
| `bar`, `cross`                 | una barra que cruza la línea, una X                            |
| `many`, `oneOrMany`, `onlyOne` | pata de gallo, pata de gallo y barra, dos barras (notación ER) |
| `zeroOrOne`, `zeroOrMany`      | una barra o una pata de gallo, con un círculo hueco detrás     |
| `none`                         | sin punta                                                      |

Las puntas toman el tamaño de `arrowSize` del tema; las formas huecas no se rellenan, y la línea se
detiene en su parte trasera, así que nada se ve a través de ellas. `corners rounded` reemplaza cada
codo de una ruta `auto`, `orthogonal` o `polyline` por una curva a 10 px de él; las rutas Bézier ya
son suaves.

### Iconos en las cajas

El `icon` de un nodo, una decisión, un almacén de datos o una caja va donde dice `iconPosition`,
con el tamaño que le da `iconSize`:

```text
diagram icons: flow {
  layout manual

  api["API"]
  orders["Orders"]
  fn["Checkout"]
  api -> orders
  orders -> fn

  placement {
    place api at (120, 80)
    place orders at (360, 80)
    place fn at (600, 80)
  }

  style api { icon "tabler:server"; iconPosition right; iconSize 32 }
  style orders { icon "tabler:database"; iconPosition center; labelPosition top }
  style fn { icon "aws:lambda"; shape icon }
}
```

| `iconPosition`                   | Dibujo                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `left` (predeterminado), `right` | junto al texto: el icono y el texto forman una fila, centrada en el área de texto de la forma                                                                  |
| `top`, `bottom`                  | encima o debajo del texto, en una columna                                                                                                                      |
| `center`                         | el dibujo de la caja: la etiqueta y la descripción ocupan una franja dentro de la caja, en el borde que dice `labelPosition`, y el icono se centra en el resto |

- **Tamaño.** `iconSize` es el lado del icono, de 8 a 128 (con o sin `px`), o `auto`. Junto al
  texto toma por defecto el `iconSize` del tema (18 en los temas técnicos). Una caja sin `size`
  crece hasta contener el número escrito junto con su texto, y se hace más alta si un icono grande
  va a su lado. Una caja con un `size` escrito lo conserva: el número se limita al espacio que deja
  el texto, sin recortarse nunca, y `auto` llena ese espacio, a medio margen interior de los
  bordes. Sin `size`, `auto` junto al texto es el tamaño del tema.
- **Centrado.** Con `center`, el icono es tan grande como quepa con el margen interior alrededor, o
  el `iconSize` escrito cuando es menor. Un nodo, una decisión, un almacén de datos o una caja sin
  `size` empieza en 120 × 120 (con la etiqueta de 13 px, y escala con ella), más ancho para una
  etiqueta larga y más grande para un `iconSize` escrito. Las decisiones, los almacenes de datos, y
  los nodos y las cajas dibujados con una forma distinta de `rounded`, `rectangle` o `square`
  colocan la etiqueta y el icono en el rectángulo inscrito en su contorno, y crecen hasta que este
  los contiene. En una caja con un `size` escrito, el icono ocupa el espacio que deja la etiqueta,
  con medio margen interior alrededor cuando el espacio es escaso, hasta un mínimo de 8 px; un
  `size` sin espacio para eso es `layout.text-overflow`, cuya pista da un tamaño que contiene el
  icono y la etiqueta.
- **Posición de la etiqueta.** `labelPosition` (`top`, `bottom` por defecto, `left` o `right`) es
  el borde en el que va la etiqueta cuando el icono ocupa el centro: dentro de la caja con
  `iconPosition center`, fuera del icono con `shape icon` ([free.md](free.md#iconos-como-formas)).
  En cualquier otro caso no cambia nada, y la disposición informa `layout.label-position-ignored`
  (advertencia) sobre la propiedad, con la pista de poner `iconPosition center` o `shape icon`;
  escrita en una regla o una clase, solo cuando ninguno de los elementos a los que da estilo tiene
  el icono en el centro, y desde una regla o una clase de un tema, una sola vez, sobre el `theme`
  del diagrama. En los grupos, las marcas, las notas, los textos libres, los iconos, las imágenes y
  las entidades C4, cuyo icono nunca ocupa el centro, la pista es quitarla.
- **El icono como forma.** `shape icon` dibuja un nodo o una caja solo con su icono, con la
  etiqueta fuera; `iconPosition` no se le aplica, e `iconSize` fija su cuadrado
  ([free.md](free.md#iconos-como-formas)).
- Las entidades C4 colocan su icono a la izquierda (`left`), a la derecha (`right`), encima
  (`top`) o debajo (`bottom`) de su texto, como los nodos, y dibujan `center` como `top`, porque
  su tipo decide su dibujo.
- Los grupos, las marcas y las notas dibujan su icono antes del texto, a 1,3 veces el tamaño del
  texto, digan lo que digan `iconPosition` e `iconSize`. El `iconPosition` del tema también admite
  las cinco posiciones.
- Los iconos se toman de los paquetes integrados o de los paquetes del proyecto, con el tamaño
  normalizado; consulta [assets.md](assets.md).

### Clases

`class <id> { <properties> }` se declara en el nivel superior de un diagrama o dentro de un bloque de
tema. Las clases tienen su propio espacio de nombres, no pueden aplicar otras clases y no se pueden
declarar dentro de grupos. Se aplican con `class a, b` en un bloque de elemento, de grupo o de
relación, o en una instrucción `style`. Un nombre de clase se resuelve a una clase del diagrama,
luego a una de su tema o de las bases del tema (primero la más específica) y, por último, a una
clase integrada:

| Clase        | Propiedades                                |
| ------------ | ------------------------------------------ |
| `highlight`  | `stroke accent; width 2`                   |
| `critical`   | `stroke danger; width 2`                   |
| `proposed`   | `line dashed; stroke warning`              |
| `deprecated` | `pattern hatch; stroke muted; color muted` |
| `external`   | `line dashed; stroke muted`                |

Un nombre que no se resuelve a nada es `theme.unknown-class` (advertencia), que informa la
compilación del proyecto, porque es ahí donde se conoce toda la cadena de temas; entonces, la clase
se ignora.

### Reglas

`rule <kind> { <properties> }` da estilo a todos los elementos de un tipo (`node`, `decision`,
`data`, `group`, `note`, `tag`; en las composiciones libres `box`, `text`, `icon`, `image`, `group`
y `line`) o a todas las relaciones (`relation`). `rule line { line dashed }` se lee raro, pero es
correcto: primero el tipo, luego la propiedad. Las reglas se escriben en los
diagramas y en los bloques de tema, donde llegan a todos los diagramas que usan el tema; por eso,
una regla para todo el proyecto vive en el tema predeterminado del proyecto. Una propiedad asignada
dos veces para el mismo tipo es `prop.duplicate`. Solo `rule node` y `rule box` pueden fijar
`shape`; `rule group { radius 0 }` hace cuadrados todos los grupos.

## Precedencia

Cada propiedad de un elemento o de una relación toma el último valor asignado en este orden:

1. los tokens del tema (el tema predeterminado del proyecto cuando el diagrama no tiene `theme`);
2. las reglas del tema, del tema base al más específico;
3. las reglas del diagrama;
4. las clases aplicadas: las del bloque de declaración y luego las de las instrucciones `style`, en
   el orden del código fuente;
5. las propiedades explícitas de las instrucciones `style`.

El estado de la animación, que agrega el motor de movimiento, se aplica sobre el resultado.

## Preajustes y lienzo

| Instrucción       | Lienzo                                                    | `layout.too-large` (advertencia)             |
| ----------------- | --------------------------------------------------------- | -------------------------------------------- |
| (ninguna)         | el contenido más `margin`, más el marco                   | nunca                                        |
| `preset document` | como arriba                                               | más ancho que 1200 px                        |
| `preset slide`    | como arriba, ampliado a 16:9 con el contenido centrado    | más ancho que 1920 px o más alto que 1080 px |
| `canvas (w, h)`   | `w × h` con el contenido centrado; crece donde hace falta | cuando el contenido no cabe                  |

`preset` y `canvas` no se pueden combinar. La franja del marco ocupa el lienzo de lado a lado en su
borde superior o inferior. El texto nunca se reduce para que quepa en un lienzo: cuando aparezca la
advertencia, divide el diagrama en vistas o en escenas de una historia.

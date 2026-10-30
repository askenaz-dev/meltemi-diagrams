# Composiciones libres

[English](../../language/free.md)

Una composición libre es una diapositiva, una pizarra o una explicación que no encaja en una
notación estricta. Colocas cajas, textos, iconos, imágenes, notas adhesivas, líneas, trazos de
lápiz y grupos donde quieras, los conectas, pones tarjetas en columnas y filas, y los ordenas en
capas. Cada ajuste es código, y las mismas reglas se aplican en la línea de comandos, en el editor
y en cada exportación.

```text
language "0.2"

diagram overview: free {
  canvas (1600, 900)
  theme "editorial.dark"

  text heading "Arquitectura de eventos"
  box api "API"
  box events "Event bus"

  api -> events: "Publica" as publish

  placement {
    place heading at (800, 90)
    place api at (400, 420)
    size api (240, 120)
    place events at (1080, 420)
    size events (240, 120)
    route publish from api.east to events.west via [(740, 420)]
  }

  animate publish {
    effect flow
    duration 1600ms
    repeat forever
  }
}
```

Las composiciones libres se compilan en el mismo modelo que los diagramas de flujo (decisión 0018).
Las relaciones, `placement`, las restricciones, `style`, `class`, `rule`, `animate`, los temas, los
preajustes y los lienzos funcionan como en los diagramas de flujo. `layout manual` es el valor
predeterminado: cada objeto tiene un `place`.

## Objetos

| Declaración                                                   | Objeto                                                                                                                                                         | Tamaño predeterminado                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `box <id> ["Label"] [{ … }]`                                  | una forma (más abajo) con una etiqueta y una descripción opcional                                                                                              | el de su forma, ampliado hasta que cabe el texto medido                         |
| `id["Label"]`, `id[("Label")]`                                | una caja; la segunda variante tiene la forma `cylinder`                                                                                                        | como arriba                                                                     |
| `text <id> "Text"`                                            | texto medido sin recuadro; `\n` parte las líneas                                                                                                               | lo que ocupa el texto                                                           |
| `icon <id> "<pack>:<name>"`                                   | un icono de los paquetes ([assets.md](assets.md)), sin texto; un icono con etiqueta es una caja con `shape icon` ([más abajo](#iconos-como-formas))            | 48 × 48                                                                         |
| `image <id> "<path>"`                                         | un archivo de imagen del proyecto; `description` es su texto alternativo                                                                                       | su tamaño en píxeles, con un ancho máximo de 640; 160 × 120 cuando no se conoce |
| `note <id> "Text" [on <element>] [{ … }]`                     | una anotación: unas líneas de texto, con contorno solo cuando se le da estilo, y una guía punteada hasta el elemento al que está adjunta ([más abajo](#notas)) | la extensión de su texto                                                        |
| `sticky <id> "Text" [{ … }]`                                  | una nota adhesiva: una tarjeta cuadrada cuyo texto se reparte en líneas y se encoge hasta caber en ella ([más abajo](#notas-adhesivas))                        | 160 × 160                                                                       |
| `group <id> ["Label"] { … }`                                  | una banda con un título, o un contenedor simple si no tiene título, que contiene hijos; una columna o una fila de ellos con `layout` ([más abajo](#listas))    | escrito, o derivado de sus hijos (más abajo)                                    |
| `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), …]]` | una línea que no une ningún elemento: un separador, un corchete, un subrayado ([más abajo](#líneas))                                                           | el rectángulo que envuelve sus puntos                                           |
| `pen <id> [(x, y), (x, y), …] [{ … }]`                        | un trazo a mano alzada por sus puntos: una palabra, una flecha o una marca de marcador dibujadas a mano ([más abajo](#trazos-de-lápiz))                        | el rectángulo que envuelve sus puntos, ampliado la mitad de su ancho            |

`node`, `decision`, `data` y `tag` pertenecen a los diagramas de flujo; en una composición
libre son `prop.unknown`, con una pista que lista los tipos libres, `note`, `sticky` y `pen` entre
ellos. Un elemento que solo menciona una relación es una caja. Las relaciones aceptan los seis
símbolos de los diagramas de flujo, entre ellos las líneas sin puntas `--` y `---`
([gramática](grammar-0.2.md#reglas-léxicas)).

### Texto y formas

`shape` se aplica a las cajas y a los nodos de los diagramas de flujo; los textos, los iconos, las
imágenes, las notas, las notas adhesivas, las líneas y los lápices la rechazan con
`prop.invalid-value`. `radius` se aplica a los elementos y los grupos de ambos perfiles
([styles.md](styles.md)); `font`, `fontSize` y `fontWeight`, a lo que dibuja texto en todos los
perfiles ([fonts.md](fonts.md#la-fuente-el-tamaño-y-el-peso-de-un-texto), decisión 0067); y
`textAlign`, `verticalAlign` y `opacity`, solo a las composiciones libres, y los diagramas de flujo
los rechazan con `prop.invalid-value` (decisiones 0043, 0058 y 0064).

| Propiedad       | Valores                                 | Predeterminado                                                                                                     |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `shape`         | una de las veinticuatro formas de abajo | `rounded`                                                                                                          |
| `radius`        | de 0 a 64, el radio de las esquinas     | el `radius` del tema; `groupRadius` para los grupos (8 y 14); 2 para las notas adhesivas                           |
| `fontSize`      | de 6 a 160                              | el tamaño de etiqueta del tema; 1,6 veces ese tamaño para `text` y 1,2 veces para una nota adhesiva, que se encoge |
| `fontWeight`    | 400, 500, 600, 700                      | el grosor de etiqueta del tema; 400 para una nota adhesiva                                                         |
| `textAlign`     | `left`, `center`, `right`               | `center` para las cajas y las notas adhesivas, `left` para el texto                                                |
| `verticalAlign` | `top`, `middle`, `bottom`               | `middle`; solo cajas y notas adhesivas                                                                             |
| `opacity`       | de 0 (invisible) a 1 (opaco), un número | 1; elementos, grupos, líneas y lápices, no relaciones                                                              |

`opacity` atenúa un objeto, un grupo con todo lo que contiene, una línea o un lápiz:
`style draft { opacity 0.5 }`. Se multiplica por la visibilidad de una historia, así que una caja
atenuada sigue atenuada cuando una escena la revela. En una relación es `prop.invalid-value`, con
la pista de que se aplica a los elementos, los grupos, las líneas y los lápices; fuera del rango de
0 a 1 es `prop.invalid-value` y nombra el rango.

| Forma           | Tamaño predeterminado               | Texto                                        | Los conectores terminan en        |
| --------------- | ----------------------------------- | -------------------------------------------- | --------------------------------- |
| `rounded`       | 160 × 56                            | centrado, a lo ancho de la caja              | la caja                           |
| `rectangle`     | 160 × 56                            | centrado, a lo ancho de la caja              | la caja                           |
| `square`        | 120 × 120                           | centrado, a lo ancho de la caja              | la caja                           |
| `ellipse`       | 160 × 72                            | centrado, dentro de la curva                 | la curva                          |
| `circle`        | 120 × 120                           | centrado, dentro de la curva                 | la curva                          |
| `diamond`       | 160 × 80                            | centrado, dentro de los cuatro lados         | los lados                         |
| `cylinder`      | 160 × 64                            | en el cuerpo, bajo el borde superior         | los bordes y los lados            |
| `pill`          | 160 × 56                            | centrado, entre los extremos redondos        | los extremos redondos y los lados |
| `triangle`      | 160 × 96                            | a dos tercios de la altura, hacia la base    | el contorno                       |
| `parallelogram` | 160 × 56                            | centrado, entre los lados inclinados         | el contorno                       |
| `trapezoid`     | 160 × 64                            | centrado, entre los lados inclinados         | el contorno                       |
| `pentagon`      | 160 × 96                            | un poco por debajo del centro                | el contorno                       |
| `hexagon`       | 160 × 64                            | centrado, entre los extremos en punta        | el contorno                       |
| `octagon`       | 160 × 72                            | centrado, dentro de las esquinas cortadas    | el contorno                       |
| `star`          | 120 × 120                           | en el centro de la estrella                  | el contorno                       |
| `cloud`         | 180 × 100                           | centrado, dentro de las ondas                | el contorno                       |
| `document`      | 160 × 72                            | en la hoja, por encima del borde ondulado    | el contorno                       |
| `callout`       | 160 × 72                            | en el cuerpo, por encima del rabillo         | el contorno                       |
| `arrow`         | 160 × 56                            | en el cuerpo de la flecha, lejos de la punta | el contorno                       |
| `framed`        | 160 × 56                            | entre las dos líneas interiores              | la caja                           |
| `flag`          | 160 × 56                            | lejos de la muesca                           | el contorno                       |
| `person`        | 160 × 104                           | en el cuerpo, bajo la cabeza                 | la cabeza y el cuerpo             |
| `agent`         | 160 × 120                           | en el cuerpo, bajo la cabeza                 | la cabeza (al norte) y el cuerpo  |
| `icon`          | 64 × 64, o `iconSize`, más un marco | fuera del icono, en `labelPosition`          | el cuadrado del icono             |

- **Tamaños.** Los tamaños son los de los temas `technical.*` y escalan con `labelSize`. Una caja
  sin `size` toma el tamaño de su forma y crece, primero a lo ancho y después a lo alto, hasta que
  su etiqueta, su descripción y su icono caben en el área de texto de la forma, así que un hexágono
  con una etiqueta larga es más ancho que una caja `rounded` con la misma etiqueta. Un `size`
  demasiado estrecho es `layout.text-overflow`, cuya pista da un ancho en el que el texto cabe en la
  forma. `square` y `circle` son un rectángulo y una elipse con un tamaño predeterminado cuadrado;
  un `size` escrito los estira. Los detalles (los bordes de un cilindro, la onda de un documento,
  las puntas de una estrella) escalan con el lado más corto, así que una caja de 24 px todavía los
  dibuja. `arrow` apunta a la derecha.
- **Personas y agentes.** `person` es una cabeza redonda sobre un cuerpo redondeado. `agent`
  dibuja un agente de IA: una cabeza de robot, un cuadrado redondeado con dos ojos, una boca y una
  antena que termina en un punto, sobre un cuerpo redondeado. Ambas llevan el texto en el
  cuerpo. La cabeza y la antena del agente ocupan como mucho un tercio de su altura, así que los
  conectores repartidos a lo largo de un lado llegan al cuerpo; un extremo en el lado norte toca la
  parte de arriba de la cabeza, no la antena.
- **Esquinas.** `radius` redondea las cajas `rounded` (con el radio del tema por defecto) y, cuando
  se escribe, las esquinas de las cajas `rectangle`, `square` y `framed` y los vértices de los
  polígonos (`diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`,
  `star`, `arrow`, `flag`, `callout`), y fija el radio del cuerpo de `person` y `agent`. `pill`
  mantiene sus extremos redondos, y las formas sin esquinas lo ignoran.
- **Giro.** `rotation <grados>` gira cualquier objeto salvo un grupo en el sentido de las agujas
  del reloj, alrededor del centro de su caja, con su texto y su icono; su `place` y su `size`
  siguen siendo los de la caja sin girar, y el grupo que lo rodea crece para contener el dibujo
  girado.
- **Conectores.** Un extremo hallado en un lado de la caja (por las reglas de anclaje, un
  porcentaje, un puerto con nombre, un carril o el motor) se desliza por la perpendicular del lado
  hasta el primer punto del contorno, o hasta el punto del contorno más cercano cuando la
  perpendicular no lo encuentra (entre las puntas de una estrella, junto al rabillo de un globo de
  diálogo) o cuando el extremo está en una esquina de la caja. Un extremo fijado como `d.north 5%`
  conserva su lado y su porcentaje en el texto y se
  dibuja sobre el contorno. `layout.connector-crossing` y la auditoría de etiquetas miden las
  formas por su contorno y su área de texto, no por su rectángulo.
- **Alineación vertical.** `verticalAlign` sube o baja el bloque de texto de una caja (su
  etiqueta, su descripción y un icono junto a ellas, encima o debajo) dentro de la franja de texto
  de la forma. `middle` es el sitio de la tabla de arriba. `top` pone el bloque en la primera
  franja, desde el borde superior de la franja de texto más el `padding` del tema, cuyo ancho lo
  contiene; `bottom`, en la última, desde el borde inferior menos el `padding`. En una forma que se
  estrecha hacia su borde, como una elipse, un bloque ancho vuelve hacia el centro hasta que una
  franja lo contiene, y un bloque más alto que la forma se queda en el centro. La franja de texto
  es la caja en `rounded`, `rectangle`, `square`, `framed`, `pill`, `hexagon`, `octagon`,
  `parallelogram` y `trapezoid`; el interior de la curva en `ellipse` y `circle`; el interior de
  los lados en `diamond` y de las ondas en `cloud`; el espacio entre los bordes en `cylinder`; lo
  que queda por encima de la onda en `document` y por encima del rabillo en `callout`; el cuerpo de
  la flecha en `arrow`; lo que queda lejos de la muesca en `flag`. `textAlign` conserva su sentido
  a lo ancho de la franja, así que `textAlign left; verticalAlign top` pone el texto en la esquina
  superior izquierda. La auditoría de etiquetas y `layout.text-overflow` miden el bloque donde se
  dibuja, y el editor lo escribe ahí.
- **Alineación que no mueve nada.** `triangle`, `pentagon`, `star`, `person`, `agent` e `icon`
  dibujan su texto en un sitio fijo, y una caja con `iconPosition center` mantiene la franja de su
  etiqueta en `labelPosition`; en ellas, y en los textos, los iconos, las imágenes, los grupos y
  las líneas, `verticalAlign` es `layout.vertical-align-ignored` (advertencia), una vez por cada
  instrucción que lo escribe, con la pista de elegir una forma con franja de texto, de fijar
  `labelPosition` o de quitarlo. Una regla o una clase se informa solo cuando ninguno de los
  elementos a los que da estilo usa el valor, y la de un tema, una sola vez, sobre el `theme` del
  diagrama.

```text
box card "Orders" { description "Top left" }
style card { shape rectangle; textAlign left; verticalAlign top }
```

Las líneas de texto están separadas 1,25 veces el tamaño de la fuente, y `\n` empieza una línea
nueva en un texto y en la etiqueta de una caja o de un nodo de flujo. Un texto, un icono o una
imagen con `fill`, `stroke` o `pattern` recibe un recuadro con la mitad del margen interior del tema
por dentro. Los iconos toman `iconColor` y, si no, `color`. Las reglas aceptan los tipos de las
composiciones libres: `rule box { shape pill }`, `rule text { color muted }`,
`rule pen { width 4 }`; solo `rule box` y `rule node` pueden fijar `shape`.

### Iconos como formas

`shape icon` dibuja una caja, o un nodo de flujo, solo con su icono y con la etiqueta fuera, como se
dibujan los iconos de los proveedores en los diagramas de arquitectura:

```text
diagram serverless: free {
  box gateway "API Gateway"
  box fn "Checkout"
  box orders "Orders"

  gateway -> fn
  fn -> orders

  placement {
    place gateway at (100, 100)
    place fn at (300, 100)
    place orders at (500, 100)
  }

  style gateway { icon "aws:api-gateway"; shape icon }
  style fn { icon "aws:lambda"; shape icon; labelPosition top }
  style orders { icon "aws:dynamodb"; shape icon; fill surface; stroke line }
}
```

- **El cuadrado.** La caja es el cuadrado del icono: 64 × 64 con la etiqueta de 13 px, y escala con
  ella, o el lado que le da un número en `iconSize`. Un `size` escrito manda, y el icono se ajusta
  a él sin perder sus proporciones. El icono llena su cuadrado; detrás de él no se dibuja nada salvo
  que haya `fill`, `stroke` o `pattern`, que lo enmarcan con la mitad del margen interior del tema
  por dentro. El marco agranda el cuadrado eso mismo por cada lado, así que el icono conserva su
  tamaño: `orders` arriba mide 80 × 80 alrededor de su icono de 64 px. En un `size` escrito, el
  icono se ajusta dentro del marco, y un `size` cuyo marco no deja espacio para un icono de 8 px es
  `layout.text-overflow`.
- **La etiqueta.** La etiqueta y la descripción se dibujan fuera del cuadrado, en `labelPosition`:
  `bottom` por defecto, `top`, `left` o `right`, a medio margen interior del tema, alineadas según
  `textAlign` (centradas por defecto).
- **Conectores.** Los anclajes, los imanes, los puertos, la selección y el cambio de tamaño usan el
  cuadrado: `to fn.south` termina en su borde inferior, por encima de una etiqueta dibujada debajo.
  Un conector que sale o entra por el lado de la etiqueta y pasa recto junto a ella se dibuja
  desde más allá de la etiqueta, con la punta lejos del texto; cualquier otra ruta que cruzaría la
  etiqueta propia del elemento la rodea. El motor, los márgenes de los grupos, los grupos derivados
  y el tamaño del lienzo cuentan el cuadrado y su etiqueta juntos; `layout.overlap` comprueba el
  cuadrado y la etiqueta como dos partes, así que una caja en la esquina vacía junto al icono no
  molesta y una caja sobre la etiqueta sí; y la auditoría de etiquetas trata la etiqueta como el
  texto propio del elemento.
- **Sin icono.** `shape icon` sin un estilo `icon` es `layout.icon-missing` (advertencia, sobre la
  propiedad `shape`), y se dibuja un marcador de posición discontinuo con el id.
- **Iconos centrados.** Para conservar la caja alrededor del icono, escribe `iconPosition center` en
  lugar de `shape icon`: el icono es el dibujo de la caja y la etiqueta va dentro, en el borde de
  `labelPosition` ([styles.md](styles.md#iconos-en-las-cajas)).

### Notas

`note <id> "Text" [on <element>] [{ … }]` es una anotación. Su texto es obligatorio y `\n` parte las
líneas. Se dibuja como una nota de flujo: alineada a la izquierda, con el `noteSize` del tema, peso
400 y el color `muted`, sin marco; solo tiene contorno (`radius`, `fill`, `stroke`, `width`, `line`)
cuando un estilo, una clase o una regla fija `fill`, `stroke` o `pattern`, y un icono antes de la
primera línea cuando se le da `icon`. Su tamaño predeterminado es su línea más larga por su número de
líneas por la altura de línea de las notas más 4; un `size` más estrecho que la línea más larga es
`layout.text-overflow`. El bloque acepta `description`, `class`, `layer`, `link` y `url`; las
propiedades de estilo son `fill`, `stroke`, `pattern`, `line`, `width`, `color`, `radius`, `icon`,
`iconColor`, `iconSize`, `rotation`, `fontSize`, `fontWeight` y `textAlign`; `shape` es
`prop.invalid-value`, igual que en un texto. Una nota se pinta en su capa en el orden del código y
participa en `place`, en el orden z, en la selección y en el giro como cualquier objeto.

```text
note remark "Checked at the gateway" on gateway { layer front }
style remark { fill "#fff7d6"; stroke warning; line dashed }
```

La cláusula `on` adjunta la nota a otro elemento del diagrama, de cualquier tipo y dentro o fuera de
cualquier grupo; el elemento es una referencia, así que renombrarlo reescribe la cláusula. La
adjunción es un dibujo: una guía punteada va del borde de la nota al del elemento, y nada más depende
de ella (una nota se queda donde se coloca). `on` con un id desconocido es `ref.unknown-element`; una
nota sobre sí misma es `prop.invalid-value`. Borrar el elemento pregunta antes, lista las adjunciones
y conserva las notas. En `layout auto`, y para una nota sin `place` en `layout assisted`, la
disposición mantiene la nota cerca de su elemento. Una nota con contorno acepta un trazo en movimiento
(`animate remark { effect dash }`); una sin contorno solo acepta un pulso.

### Notas adhesivas

`sticky <id> "Text" [{ … }]` es una nota adhesiva: una tarjeta de papel cuadrada con unas pocas
palabras, la tarjeta de una lluvia de ideas o de un tablero kanban. Su texto es obligatorio y `\n`
parte las líneas. A diferencia de una caja, una nota adhesiva nunca crece por su texto: el texto se
reparte en líneas y se encoge hasta caber en la tarjeta.

```text
diagram ideas: free {
  sticky cache "Cache the catalogue at the edge before the sale"
  sticky retry "Retry payments\nonce"
  sticky metrics "Measure checkout time"

  cache -> metrics

  placement {
    place cache at (120, 120)
    place retry at (320, 120)
    place metrics at (120, 340)
    size metrics (240, 120)
  }

  style retry { fill "#f8bbd0"; rotation 4 }
  style metrics { fill "#c8e6c9"; textAlign left; verticalAlign top }
}
```

- **Tamaño.** 160 × 160 con la etiqueta de 13 px, y escala con `labelSize`, o su `size` escrito.
- **Texto.** El texto se parte en líneas por los espacios al ancho interior de la tarjeta (su ancho
  menos dos veces el `padding` del tema); una palabra más larga que ese ancho se corta, y `\n`
  conserva sus saltos. Las líneas están separadas 1,25 veces el tamaño de la fuente. El tamaño de
  la fuente es `fontSize` o, si no, 1,2 veces el tamaño de etiqueta (15,6 px en los temas
  técnicos), con `fontWeight` 400 salvo que se le dé estilo. Cuando el texto repartido es más alto
  que el alto interior, el tamaño baja de 1 en 1 px hasta que cabe, hasta un mínimo de 8 px. Un
  texto que no cabe ni a 8 px es `layout.text-overflow` (advertencia), cuya pista da un tamaño de
  las mismas proporciones en el que cabe, y se dibuja desde arriba, recortado a la tarjeta.
- **Colores.** La tarjeta toma el color `sticky` del tema y el texto su color `stickyText`
  (`#fff59d` y `#1f2328` en los temas claros; `fill` y `color` los sustituyen). El texto sigue
  casi negro también en los temas oscuros: una nota adhesiva es papel, no una superficie del tema.
  Una sombra suave queda 3 px debajo de la tarjeta, negra al 15 %; la tarjeta solo tiene contorno
  cuando se le da `stroke` (con `width` y `line`), y esquinas de `radius` 2.
- **Alineación.** `textAlign` (`center` de forma predeterminada) y `verticalAlign` (`middle`)
  colocan el texto en la tarjeta, dentro del margen interior. Un `icon` va arriba a la izquierda,
  dentro del margen, en una fila propia encima del texto (`iconColor`, `iconSize`).
- **Estilos.** Una nota adhesiva acepta `fill`, `stroke`, `color`, `line`, `width`, `fontSize`,
  `fontWeight`, `textAlign`, `verticalAlign`, `radius`, `rotation`, `opacity`, `icon`, `iconColor`
  e `iconSize`. `shape` es `prop.invalid-value`, y nombra `node` y `box`, igual que `pattern`,
  `iconPosition`, `labelPosition` y las propiedades de las relaciones. `rule sticky { … }` da
  estilo a todas las notas adhesivas; el bloque acepta `description`, `class`, `layer`, `link` y
  `url`.
- **Como objeto.** Una nota adhesiva acepta `place`, `size`, puertos, las restricciones, el orden z
  y el giro como una caja. Es un extremo de relaciones: los conectores, los imanes, los puertos,
  `layout.overlap` y la auditoría de etiquetas tratan la tarjeta como un rectángulo. Es un elemento
  de las historias y acepta un pulso, y un trazo en movimiento sobre su tarjeta cuando un `style`,
  una clase o una `rule` del diagrama le dan un `stroke` (su relleno no es un contorno; sin él, el
  trazo es `animate.invalid-target`). Con un tema de boceto, su texto se dibuja con la fuente
  manuscrita, y un contorno con estilo se pinta a mano como el de una caja.

`sticky s` sin su texto es `prop.invalid-value` con la pista `sticky <id> "Text"`. Los diagramas
de flujo, de secuencia y C4 rechazan `sticky` con `prop.unknown`. En el editor, la herramienta de
nota adhesiva crea una con su editor abierto, y al escribir el texto se reparte como lo hará en la
tarjeta ([el editor](../editor.md#herramientas-de-pizarra)).

## Grupos y coordenadas interiores

El `place` de un objeto dentro de un grupo es relativo al **interior** del grupo: la esquina superior
izquierda del grupo más `groupPadding` en horizontal y su cabecera en vertical. La cabecera es
`groupHeader`, la banda del título, en un grupo con título, y `groupPadding` en uno sin título
(`groupPadding` mide 16 y `groupHeader` 40 en `technical.light`). Mover un grupo mueve su contenido
sin reescribirlo.

```text
group backend "Backend" {
  box api "API"
}
placement {
  place backend at (300, 200)   // coordenadas del diagrama
  size backend (400, 240)
  place api at (60, 40)         // dentro de backend: se dibuja en (176, 160)
}
```

- Un grupo necesita un `place`, salvo que lo coloque una lista ([más abajo](#listas)). Sin `size`,
  mide `groupPadding + rightmost child edge + groupPadding` por
  `header + lowest child edge + groupPadding`, medido desde el interior; un grupo con título nunca
  es más estrecho que su título.
- Los objetos de nivel superior y los puntos de paso de las rutas usan coordenadas del diagrama.
- `LayoutResult.origins` da el origen interior de cada hijo, para que las aplicaciones anfitrionas
  conviertan entre las posiciones dibujadas y las escritas.

### Contenedores simples

Un grupo cuya etiqueta es `""`, sin `description` ni estilo `icon`, **no tiene título**. No reserva
la banda del título, dibuja solo su contorno (sin título, icono ni descripción), no abre ningún
hueco en los conectores que lo cruzan y pide a sus hijos la mitad de `groupPadding` arriba, igual
que en los demás lados (`layout.container-margin`). Con `fill`, `stroke` y `radius 0` es un
rectángulo simple, así que los grupos sin título anidados dibujan los rectángulos anidados de un
editor visual:

```text
diagram nested: free {
  group blue "" {
    group pink "" {
      group yellow "" {
        box core "Core"
      }
    }
  }

  placement {
    place blue at (300, 200)
    size blue (360, 280)
    place pink at (164, 124)      // en el interior de blue, a 16 px de su esquina superior izquierda
    size pink (280, 200)
    place yellow at (124, 84)
    size yellow (200, 120)
    place core at (84, 44)
  }

  style blue { fill "#dae8fc"; stroke "#6c8ebf"; radius 0 }
  style pink { fill "#f8cecc"; stroke "#b85450"; radius 0 }
  style yellow { fill "#fff2cc"; stroke "#d6b656"; radius 0 }
}
```

Los diagramas de flujo dibujan igual los grupos sin título, en todos los modos de disposición; el
motor deja `groupPadding` encima de sus hijos. Una etiqueta vacía con una `description` o un icono
conserva la banda, que entonces los contiene.

### Listas

Un grupo cuyo bloque escribe `layout column` o `layout row` es una **lista**: coloca a sus hijos
por sí mismo, uno tras otro en el orden del código, como las columnas de un tablero kanban
contienen sus tarjetas. Una fila de columnas es el tablero:

```text
diagram board: free {
  preset board

  group kanban "" {
    layout row
    spacing 24
    align stretch

    group todo "To do" {
      layout column
      spacing 12
      sticky cache "Cache the catalogue"
      sticky retry "Retry payments once"
    }
    group doing "Doing" {
      layout column
      spacing 12
      sticky search "Search by SKU"
    }
    group done "Done" {
      layout column
      spacing 12
      sticky login "Sign in with passkeys"
      sticky orders "Export orders as CSV"
      sticky audit "Keep an audit log"
    }
  }

  placement {
    place kanban at (360, 300)
  }

  style retry, orders { fill "#f8bbd0" }
}
```

El `layout` del bloque del grupo es la disposición propia del grupo; el
`layout manual|assisted|auto` del diagrama es otra instrucción.

- **Orden.** La lista coloca sus elementos y sus grupos en el orden del código a lo largo de su
  eje, desde su origen interior: una columna de arriba abajo, una fila de izquierda a derecha, cada
  hijo donde termina el anterior más `spacing`. Mover una declaración en el archivo mueve la
  tarjeta.
- **Separación.** `spacing <n>` es la distancia entre dos hijos, de 0 a 400; la mitad de
  `groupPadding` (8 en los temas técnicos) cuando no se escribe.
- **Alineación.** `align` coloca a los hijos en sentido transversal al eje: `start` (el valor
  predeterminado) al principio del interior, `center` en su centro, `end` al final, y `stretch`
  hace que un hijo sin `size` escrito sea tan ancho como el interior en una columna, o tan alto en
  una fila. `align stretch` en una fila de columnas dibuja las columnas a la misma altura.
- **Tamaños.** Cada hijo conserva su `size` escrito o su tamaño predeterminado. Sin `size`, una
  lista se deriva de sus hijos como cualquier grupo; un `size` escrito es su tamaño mínimo, y la
  lista crece cuando sus hijos necesitan más, así que una columna de diez tarjetas nunca esconde
  ocho.
- **Posiciones.** Un `place` en un hijo de una lista es `layout.place-ignored` (advertencia), sobre
  la instrucción `place`, con la pista de quitarlo o de quitar el `layout` del grupo; el hijo se
  dibuja donde lo pone la lista. Una lista dentro de una lista no necesita `place`. Un grupo que no
  es una lista, dentro de una lista, coloca a sus propios hijos con `place` como siempre.
- **Líneas y lápices.** Una línea o un lápiz dentro de una lista conserva sus puntos escritos en el
  interior de la lista: la lista no lo coloca, y su caja cuenta para el tamaño de la lista.
- **Modos de disposición.** El motor de disposición trata una lista como una sola caja de su
  tamaño en todos los modos y nunca organiza a sus hijos. En `layout auto` organiza la lista con
  las demás cajas, y `meltemi-diagrams layout` y los comandos Organizar escriben un `place` para la
  lista, nada para sus hijos y ningún `size` para la lista, cuyo tamaño sigue derivándose de sus
  hijos.
- **Errores.** `spacing` o `align` sin `layout` es `prop.invalid-value`, con la pista de escribir
  `layout column` o `layout row`. Otro valor (`layout grid`) es `prop.invalid-value` y enumera los
  valores, y `layout auto` en el bloque de un grupo dice que es una instrucción del diagrama. En el
  bloque de un elemento, los tres son `prop.unknown`; los diagramas de flujo los rechazan con
  `prop.invalid-value` y nombran las composiciones libres.

En el editor, una tarjeta arrastrada sobre una lista muestra dónde quedará y las demás le hacen
sitio; al soltarla se mueve su declaración ([el editor](../editor.md#herramientas-de-pizarra)).

## Líneas

Una `line` es una línea que no une ningún elemento: un separador entre fases, un corchete, un
subrayado, un trazo en una diapositiva. Sus puntos están en la instrucción, después de `from`, `to`
y una lista opcional de codos tras `via`, así que no necesita `place`:

```text
diagram phases: free {
  box web "Web"
  box api "API"
  web -> api

  line divider "Phase 2" from (40, 160) to (520, 160)
  line bracket from (40, 220) to (520, 280) via [(280, 220)]

  group notes "Notes" {
    text remark "Read first"
    line underline from (0, 22) to (120, 22)
  }

  placement {
    place web at (120, 80)
    place api at (440, 80)
    place notes at (280, 400)
    size notes (240, 120)
    place remark at (60, 6)
    label divider at 20% offset (0, -14)
  }

  style divider { line dashed; stroke muted }
  style bracket { routing orthogonal; corners rounded; arrowhead triangle }
  animate bracket { effect flow }
}
```

- **Puntos.** Dos tuplas de números sin unidades después de `from` y de `to`, y una lista de
  tuplas después de `via`, que continúa en varias líneas como la de una ruta. Están en las
  coordenadas interiores del grupo de la línea, igual que `place`
  ([más arriba](#grupos-y-coordenadas-interiores)): `underline` se dibuja bajo `remark` y se mueve
  con `notes`. Una instrucción a la que le faltan los puntos o cuyos puntos no son tuplas es
  `prop.invalid-value`, con la forma en la pista. `place`, `size` y `rotation` se rechazan en una
  línea, con la pista de que sus puntos se escriben en su instrucción.
- **Etiqueta.** El segundo argumento, vacío de forma predeterminada. Se dibuja como la etiqueta de
  una relación, en una píldora en el centro de la línea, y `label <id> at <n>% [offset (dx, dy)]`
  la mueve.
- **Estilos.** Una línea acepta las propiedades de una relación: `stroke` (el `connector` del tema
  de forma predeterminada), `width` (`connectorWidth`), `line` (`dashed`, `dotted`), `arrowhead` y
  `arrowtail` (ninguna de forma predeterminada), `routing` (`polyline` de forma predeterminada,
  `orthogonal`, `bezier`), `corners`, `color`, `fill` e `icon` para su píldora, y `opacity`. Las
  propiedades de una caja (`shape`, `radius`, `pattern`, `iconPosition`, `labelPosition`,
  `iconSize`, las propiedades del texto) son `prop.invalid-value`. `rule line { … }` da estilo a
  todas las líneas; su bloque acepta `description`, `class`, `layer` y `url`.
- **Trazado.** Los puntos son los anclajes y los puntos de paso de la línea; cómo pasan
  `orthogonal` y `bezier` por ellos se explica en [layout.md](layout.md#conectores). Una línea no
  tiene carriles ni desvíos y no participa en las comprobaciones de composición entre cajas.
- **Orden.** Una línea es un objeto: en su capa se pinta en el orden del código fuente con las
  cajas, así que una línea declarada después de una caja se dibuja encima. Su caja, el rectángulo
  que envuelve sus puntos dibujados, cuenta para la selección con un rectángulo, para un grupo que
  se deriva de sus hijos y para el tamaño del lienzo.
- **Efectos.** `flow`, `dash`, `pulse` y `trace` recorren una línea igual que una relación
  ([motion.md](motion.md)).
- **Puntos que coinciden.** Una línea sin longitud se dibuja como un punto de su ancho y se informa
  como `layout.degenerate-line` (advertencia), con la pista de mover un extremo o darle un codo.
- **En el editor.** La herramienta de relación arrastrada sobre el lienzo vacío dibuja una línea;
  una línea seleccionada muestra un tirador en cada extremo y en cada codo y en el centro de cada
  tramo, y arrastrarlos reescribe los puntos, ajustados a la cuadrícula
  ([el editor](../editor.md#composiciones-libres)).

Los diagramas de flujo, de secuencia y C4 rechazan `line` con `prop.unknown`; ahí, una línea entre
dos cajas es una relación escrita `--` o `---`.

## Trazos de lápiz

Un `pen` es un trazo a mano alzada: una palabra escrita a mano, una flecha dibujada en una pizarra,
un círculo alrededor de una caja, una marca de marcador bajo un título. Sus puntos están en la
instrucción, así que no necesita `place`:

```text
diagram explain: free {
  preset board
  theme "sketch.light"

  pen marker [(40, 70), (280, 70)]
  text heading "Why the cache helps"
  box api "API"
  box db "Orders DB"

  pen arrow [(216, 140), (250, 128.5), (290, 130), (336, 140)]
  pen dot [(400, 60)]

  group notes "Notes" {
    text remark "Reads hit the cache first"
    pen underline [(0, 24), (90, 27.5), (180, 25)]
  }

  placement {
    place heading at (160, 60)
    place api at (120, 140)
    place db at (440, 140)
    place notes at (280, 300)
    size notes (260, 120)
    place remark at (100, 8)
  }

  style marker { stroke highlight; width 20; opacity 0.35 }
  style arrow { width 4; arrowhead triangle }
  style dot { width 8; stroke danger }
  style remark { fontSize 14 }
  animate arrow { effect trace }
}
```

- **Puntos.** `pen <id> [(x, y), (x, y), …]` enumera al menos una tupla de dos números sin
  unidades; los decimales se conservan (`128.5`), y la lista continúa en varias líneas como una
  lista `via`. Los puntos están en las coordenadas interiores del grupo del lápiz, igual que los de
  una línea: `underline` se dibuja bajo `remark` y se mueve con `notes`. Una lista que falta o está
  vacía, o un elemento que no es una tupla así (`pen p [10, 20, 30]`), es `prop.invalid-value` con
  la forma en la pista. Un lápiz no tiene etiqueta: una cadena después de su id es
  `prop.invalid-value`. `place`, `size` y `rotation` se rechazan en un lápiz, con la pista de que
  sus puntos se escriben en su instrucción.
- **La curva.** Un trazo es un solo trazado: desde el primer punto, una curva cuadrática hasta el
  punto medio de cada par de puntos consecutivos, con el punto que comparten como control, y luego
  en línea recta hasta el último punto, con extremos y uniones redondeados y sin relleno. Dos
  puntos son un segmento; un punto, o puntos que coinciden todos, un punto tan ancho como el
  trazo. El lienzo, `export`, el reproductor y el video dibujan la misma curva. La caja de un lápiz
  es el rectángulo que envuelve sus puntos, ampliado la mitad de su ancho por cada lado.
- **Estilos.** `stroke` (el `ink` del tema de forma predeterminada), `width` (de 1 a 64, 3 de forma
  predeterminada; `width 0` es `prop.invalid-value`), `line` (`dashed`, `dotted`), `opacity` (de 0
  a 1), y `arrowhead` y `arrowtail` (ninguna de forma predeterminada), que se recortan del trazo y
  se dibujan a lo largo de sus tramos finales como las puntas de una línea. Cualquier otra
  propiedad de estilo (`fill`, `shape`, `radius`, `pattern`, `routing`, `corners`, las propiedades
  de los iconos y del texto) es `prop.invalid-value` y nombra las que acepta un lápiz.
  `rule pen { … }` da estilo a todos los lápices, también a sus puntas; el bloque acepta
  `description`, `class`, `layer`, `link` y `url`.
- **El marcador.** Una marca de marcador es un lápiz con
  `stroke highlight; width 20; opacity 0.35`: el color `highlight` del tema (`#ffe600` en los temas
  claros, `#ffd600` en los oscuros) al 35 %. Es un solo trazado, así que un trazo que se cruza
  consigo mismo no se oscurece donde se superpone, y el texto que tiene debajo sigue legible.
  Decláralo antes del texto que marca, como `mark` arriba, o ponlo en una capa del fondo, para que
  el texto se pinte encima.
- **Efectos.** `flow`, `dash`, `pulse` y `trace` recorren un lápiz igual que una línea, desde su
  primer punto hasta el último ([motion.md](motion.md)); la acción `draw` de una historia lo vuelve
  a dibujar ([stories.md](stories.md)).
- **Orden y comprobaciones.** Un lápiz es un objeto: en su capa se pinta en el orden del código con
  las cajas. Su caja cuenta para la selección con un rectángulo, para un grupo que se deriva de sus
  hijos y para el tamaño del lienzo, pero un lápiz no participa en las comprobaciones de
  composición (`layout.overlap`, `layout.connector-crossing`, la auditoría de etiquetas), así que
  un trazo puede cruzar cajas y etiquetas. Una lista no lo coloca: un lápiz dentro de una lista
  conserva sus puntos ([más arriba](#listas)).
- **Temas de boceto.** `sketch light` y `sketch rough` pintan un lápiz tal como está escrito, sin
  sus dos pasadas: un trazo ya dibujado a mano, con dos pasadas de temblor, sería otro dibujo.
- **Formato.** `meltemi-diagrams format` imprime la lista de un lápiz en una línea cuando la
  instrucción cabe en 100 columnas y, si no, rellenada en varias líneas, así que un trazo de
  cuarenta puntos ocupa unas pocas líneas ([formatting.md](formatting.md)).
- **En el editor.** El lápiz y el marcador dibujan trazos en el lienzo y los escriben como
  instrucciones `pen`, simplificados y redondeados a la décima, y el borrador quita los trazos que
  cruza ([el editor](../editor.md#herramientas-de-pizarra)).

Los diagramas de flujo, de secuencia y C4 rechazan `pen` con `prop.unknown`, con la pista de que
los lápices pertenecen a las composiciones libres.

## Capas y orden

```text
layers back, main, front
box card "Card" { layer back }
text label "Front" { layer front }
```

`layers` enumera las capas de atrás hacia adelante. `main` siempre existe y va la última cuando no
se lista; los objetos y las relaciones sin `layer` están en ella. Una capa no declarada es
`ref.unknown-layer`. La escena se pinta capa por capa; dentro de una capa, primero los grupos (los
exteriores antes que los interiores), luego los demás objetos en el orden del código fuente, también
las líneas y los lápices, y luego las relaciones. Las cajas y los grupos de capas distintas no se
comprueban entre sí, y un conector ni rodea ni se informa como que atraviesa una caja de una capa
distinta de la suya. En el editor,
Traer al frente y Enviar al fondo mueven la declaración dentro de su bloque, y el panel Capas
agrega, renombra, oculta y quita capas. Los diagramas de flujo admiten `layers` y `layer` con las
mismas reglas; los diagramas de secuencia y las vistas C4 los rechazan.

**Pilas.** Una caja declarada después de otra caja de su capa que la contiene, estrictamente
dentro de ella, se pinta encima y no es `layout.overlap`: una pila se escribe de fuera hacia
dentro. Declarada al revés, la pila se informa en la caja posterior, con una pista que pide
declarar primero la caja exterior; una superposición parcial siempre se informa, y también dos
cajas que coinciden. Los
conectores entre cajas apiladas dentro de otra caja la cruzan en línea recta. La etiqueta de una
caja puede quedar sobre las cajas que contiene, pero dos etiquetas dibujadas en el mismo punto son
`layout.label-overlap`, así que deja vacías las etiquetas exteriores o sepáralas (`textAlign left`,
o un `text` como rótulo):

```text
box outer ""
box middle ""
box inner "Core"

placement {
  place outer at (300, 200)
  size outer (260, 240)
  place middle at (300, 200)
  size middle (210, 180)
  place inner at (300, 200)
  size inner (150, 130)
}
```

**Bandas.** Un grupo sin título, colocado y con tamaño, en una capa del fondo es una banda detrás
de las cajas: el motor no lo organiza ni empuja fuera de él las cajas que organiza, así que en
`layout assisted` las cajas que coloca quedan encima. En `layout auto` se ignora el `place` de un
grupo; ahí la banda es un grupo que contiene sus cajas.

```text
diagram platform: free {
  direction LR
  layout assisted
  layers back, main

  group band "" { layer back }
  box web "Web"
  box api "API"
  db[("Orders")]

  web -> api
  api -> db

  placement {
    place web at (140, 120)
    place band at (400, 120)
    size band (720, 140)
  }

  style band { fill "#f5f5f5"; stroke "#d0d0d0"; radius 0 }
}
```

## Imágenes

Las rutas de las imágenes son relativas al archivo `.meltemi`, usan `/` y quedan dentro del
proyecto:

- una URL, una ruta absoluta o las barras invertidas son `asset.outside-project` (desde el modelo),
  y también lo es una ruta que sale de la raíz del proyecto (desde el proyecto);
- un archivo que no existe es `asset.unknown-image`;
- un archivo que no es una imagen PNG, JPEG, GIF, WebP o SVG, que está dañado o que pesa más de
  8 MB es `asset.unsupported-image`.

Los tamaños de PNG, JPEG, GIF y WebP salen de sus cabeceras. Las imágenes SVG se sanean como los
iconos y se vuelven a escribir como trazados simples; su tamaño sale de `width` y `height`, o del
`viewBox`. Las exportaciones incrustan las imágenes como URI `data:` dentro de `<image>` con
`preserveAspectRatio="xMidYMid meet"`, así que el SVG sigue siendo portátil. Las aplicaciones
anfitrionas pasan `LayoutOptions.images`; sin esa opción, o cuando el archivo no se puede leer, se
dibuja un marcador de posición discontinuo y se informa `layout.image-unavailable` (advertencia).

## Enlaces de identidad

`link <diagram>.<element>` en un bloque indica que un objeto representa un elemento de otro
diagrama. Funciona en los diagramas de flujo y en las composiciones libres:

```text
import "./views.meltemi" as views

diagram slide: free {
  box api "API Gateway" { link views.checkout.api }
}
```

| Forma                     | Destino                                                 |
| ------------------------- | ------------------------------------------------------- |
| `link checkout.api`       | el elemento `api` de `diagram checkout` en este archivo |
| `link co.api`             | a través de `import checkout as co from "…"`            |
| `link views.checkout.api` | a través de `import "…" as views`                       |

Un diagrama o un elemento desconocido, o un enlace al propio diagrama del objeto, es
`ref.unknown-link`. Cambiar el nombre del elemento reescribe los enlaces que apuntan a él; quitarlo
enumera esos enlaces, y quitarlo en cascada los elimina. Ir a la definición sigue un enlace. Un
enlace es solo identidad: nada se mantiene sincronizado entre las vistas.

## Modos

| Modo                      | Composiciones libres                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual` (predeterminado) | Cada objeto y cada grupo tiene un `place`, salvo lo que coloca una lista.                                                                                            |
| `assisted`                | Los objetos colocados se quedan; ELK organiza los demás. Un grupo con hijos colocados necesita un `place`; un grupo colocado y con tamaño ni se organiza ni estorba. |
| `auto`                    | ELK organiza todo; los grupos se ajustan a sus hijos, y una lista es una sola caja. Al escribir las posiciones, los grupos reciben una posición y un tamaño.         |

En todos los modos, las líneas y los lápices conservan sus puntos escritos y las listas colocan a
sus hijos ([Listas](#listas)). `meltemi-diagrams layout` y los comandos Organizar del editor
escriben los hijos relativos a su grupo y dan a cada grupo un `place` y un `size`, pero no
escriben ningún `place` para lo que coloca una lista ni ningún `size` para una lista.

## Convertir un diagrama de flujo

Un diagrama de flujo se puede copiar, tal como se dibuja, en una nueva composición libre del mismo
archivo:

```bash
meltemi-diagrams convert sheet.meltemi --to free
```

| Opción           | Efecto                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| `--diagram <id>` | el diagrama de flujo que se copia; hace falta cuando el archivo tiene varios |
| `--id <id>`      | el id de la copia; `<diagram>_free` (`_2`, `_3`…) de forma predeterminada    |
| `--check`        | no escribe nada, dice lo que se agregaría y sale con 1                       |
| `--stdout`       | imprime el texto convertido en lugar de escribirlo                           |

En el editor, **Convertir en composición libre** (menú Organizar, menú contextual y paleta de
comandos) hace lo mismo y muestra la copia. La copia contiene:

- `title`, `description`, `theme`, `preset` o `canvas`, `direction`, `routing` y `layers` cuando
  están definidos, y `layout manual`;
- un objeto por elemento, con su id, su etiqueta, su descripción, sus clases, sus puertos, su
  `layer` y un enlace a su origen, anidado en grupos copiados con sus relaciones;
- un `place` y un `size` para cada objeto tal como se dibuja, con los hijos dentro de su grupo,
  medidos desde su cabecera (el margen interior en un grupo sin título);
- las rutas y las etiquetas, y las instrucciones `class`, `style` y `animate` tal como están
  escritas;
- una clase `from_<kind>` por cada tipo de los diagramas de flujo que la necesita, aplicada primero
  a los objetos convertidos:

| Flujo            | Libre | Clase                                                                                               |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------- |
| nodo             | caja  | solo cuando el diagrama tiene `rule node`                                                           |
| decisión         | caja  | `from_decision { shape diamond }`                                                                   |
| almacén de datos | caja  | `from_data { shape cylinder }`                                                                      |
| nota             | nota  | — (una nota sigue siendo nota, con su cláusula `on`)                                                |
| marca            | caja  | `from_tag { shape pill; fill tag; stroke tag; color tagText; fontSize <tag size>; fontWeight 500 }` |
| grupo            | grupo | —                                                                                                   |

Las propiedades de `rule <kind>` del diagrama para un tipo de los diagramas de flujo se suman a esa
clase, así que las reglas se siguen aplicando antes que las clases; las reglas de los grupos y de las
relaciones se copian. Los estilos `shape` y `radius` propios de un nodo se copian tal como están
escritos y, por tanto, se imponen a la clase. El diagrama de origen no cambia, y la conversión no es reversible. La copia
difiere del origen en algunos detalles:

- las marcas usan la fuente del cuerpo, no la monoespaciada, y se pintan debajo de los conectores;
- las reglas de los temas de archivo para los tipos de los diagramas de flujo no llegan a la copia;
- los conectores se vuelven a trazar entre las mismas cajas; los puntos de paso de los orígenes con
  `layout auto`, que no se dibujaban, se omiten.

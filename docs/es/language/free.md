# Composiciones libres

[English](../../language/free.md)

Una composición libre es una diapositiva o una explicación que no encaja en una notación estricta.
Colocas cajas, textos, iconos, imágenes y grupos donde quieras, los conectas y los ordenas en capas.
Cada ajuste es código, y las mismas reglas se aplican en la línea de comandos, en el editor y en
cada exportación.

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

| Declaración                    | Objeto                                                                                                                                              | Tamaño predeterminado                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `box <id> ["Label"] [{ … }]`   | una forma (más abajo) con una etiqueta y una descripción opcional                                                                                   | el de su forma, ampliado hasta que cabe el texto medido                         |
| `id["Label"]`, `id[("Label")]` | una caja; la segunda variante tiene la forma `cylinder`                                                                                             | como arriba                                                                     |
| `text <id> "Text"`             | texto medido sin recuadro; `\n` parte las líneas                                                                                                    | lo que ocupa el texto                                                           |
| `icon <id> "<pack>:<name>"`    | un icono de los paquetes ([assets.md](assets.md)), sin texto; un icono con etiqueta es una caja con `shape icon` ([más abajo](#iconos-como-formas)) | 48 × 48                                                                         |
| `image <id> "<path>"`          | un archivo de imagen del proyecto; `description` es su texto alternativo                                                                            | su tamaño en píxeles, con un ancho máximo de 640; 160 × 120 cuando no se conoce |
| `group <id> ["Label"] { … }`   | una banda con un título, o un contenedor simple si no tiene título, que contiene hijos                                                              | escrito, o derivado de sus hijos (más abajo)                                    |

`node`, `decision`, `data`, `note` y `tag` pertenecen a los diagramas de flujo; en una composición
libre son `prop.unknown`. Un elemento que solo menciona una relación es una caja.

### Texto y formas

`shape` se aplica a las cajas y a los nodos de los diagramas de flujo; los textos, los iconos y las
imágenes la rechazan con `prop.invalid-value`. `radius` se aplica a los elementos y los grupos de
ambos perfiles ([styles.md](styles.md)); `fontSize`, `fontWeight` y `textAlign`, solo a las
composiciones libres, y los diagramas de flujo los rechazan con `prop.invalid-value` (decisión
0043).

| Propiedad    | Valores                                 | Predeterminado                                                   |
| ------------ | --------------------------------------- | ---------------------------------------------------------------- |
| `shape`      | una de las veinticuatro formas de abajo | `rounded`                                                        |
| `radius`     | de 0 a 64, el radio de las esquinas     | el `radius` del tema; `groupRadius` para los grupos (8 y 14)     |
| `fontSize`   | de 6 a 160                              | el tamaño de etiqueta del tema; 1,6 veces ese tamaño para `text` |
| `fontWeight` | 400, 500, 600, 700                      | el grosor de etiqueta del tema                                   |
| `textAlign`  | `left`, `center`, `right`               | `center` para las cajas, `left` para el texto                    |

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

Las líneas de texto están separadas 1,25 veces el tamaño de la fuente, y `\n` empieza una línea
nueva en un texto y en la etiqueta de una caja o de un nodo de flujo. Un texto, un icono o una
imagen con `fill`, `stroke` o `pattern` recibe un recuadro con la mitad del margen interior del tema
por dentro. Los iconos toman `iconColor` y, si no, `color`. Las reglas aceptan los tipos de las
composiciones libres: `rule box { shape pill }`, `rule text { color muted }`; solo `rule box` y
`rule node` pueden fijar `shape`.

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

- Un grupo necesita un `place`. Sin `size`, mide
  `groupPadding + rightmost child edge + groupPadding` por
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

## Capas y orden

```text
layers back, main, front
box card "Card" { layer back }
text label "Front" { layer front }
```

`layers` enumera las capas de atrás hacia adelante. `main` siempre existe y va la última cuando no
se lista; los objetos y las relaciones sin `layer` están en ella. Una capa no declarada es
`ref.unknown-layer`. La escena se pinta capa por capa; dentro de una capa, primero los grupos (los
exteriores antes que los interiores), luego los demás objetos en el orden del código fuente y luego
las relaciones. Las cajas y los grupos de capas distintas no se comprueban entre sí, y un conector
ni rodea ni se informa como que atraviesa una caja de una capa distinta de la suya. En el editor,
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
| `manual` (predeterminado) | Cada objeto y cada grupo tiene un `place`.                                                                                                                           |
| `assisted`                | Los objetos colocados se quedan; ELK organiza los demás. Un grupo con hijos colocados necesita un `place`; un grupo colocado y con tamaño ni se organiza ni estorba. |
| `auto`                    | ELK organiza todo; los grupos se ajustan a sus hijos. Al escribir las posiciones, los grupos reciben una posición y un tamaño.                                       |

`meltemi-diagrams layout` y los comandos Organizar del editor escriben los hijos relativos a su
grupo y dan a cada grupo un `place` y un `size`.

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
| nota             | texto | `from_note { textAlign left; fontSize <note size>; fontWeight 400; color muted }`                   |
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

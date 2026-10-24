# Exportación SVG

[English](../../language/svg-export.md)

`meltemi-diagrams export <file.meltemi>` dibuja en SVG cada diagrama `flow` y `free` de un archivo.
Esta página describe lo que dibuja el exportador, cómo elige las posiciones que no se le dieron y lo
que contiene el SVG. El proceso es `compile()` en `@meltemi/diagrams-model`, `layoutDiagram()` en
`@meltemi/diagrams-layout` (del modelo a la escena vectorial) y `renderSvg()` en
`@meltemi/diagrams-render` (de la escena al texto).

```bash
pnpm mdg export examples/konfio-agent-platform/konfio-agent-platform.meltemi
```

Opciones: `--diagram <id>` exporta un diagrama, `--out <path>` nombra el archivo (un diagrama) o un
directorio existente, `--stdout` imprime un diagrama, `--format svg` es el único formato por ahora.
La salida se llama `<file>.svg`, o `<file>.<diagram-id>.svg` cuando el archivo contiene varios
diagramas. Con `--stdout`, los diagnósticos van a stderr para que stdout contenga solo el SVG. Los
códigos de salida siguen a `meltemi-diagrams validate`: 0, 1 con diagnósticos de error, 2 para
errores de uso.

## Qué se dibuja

Todos los diagramas de flujo, composiciones libres, diagramas de secuencia y vistas C4 sin errores.
El exportador organiza con ELK los diagramas `layout auto` y `layout assisted`
([layout.md](layout.md)); `layout manual` informa cada elemento sin `place` como
`layout.missing-placement`. Las aplicaciones anfitrionas que llaman a `layoutDiagram()` sin motor
dibujan los diagramas `auto` y `assisted` solo cuando todos los elementos están colocados, y si no,
informan `layout.mode-unsupported`. Un archivo sin ningún diagrama que se pueda dibujar informa
`export.no-diagram`. Las composiciones libres, sus objetos, sus imágenes y sus capas se describen en
[free.md](free.md). Los diagramas de secuencia se disponen sin motor a partir del orden de sus
eventos, y `--scenario <id>` exporta un camino ([sequence.md](sequence.md)). Las vistas C4 se
disponen como los diagramas de flujo, con formas C4 ([c4.md](c4.md)).

Los grupos nunca necesitan un `place`: sin `place` ni `size`, un grupo se ajusta a sus hijos con el
`groupPadding` del tema a los lados y abajo (16 px en `technical.*`) y su `groupHeader` arriba para
el título (40 px), o de nuevo `groupPadding` cuando no tiene título (etiqueta `""`, sin descripción
ni icono). Con ambas instrucciones, se dibuja exactamente ahí. Una instrucción sin la otra es
`layout.missing-placement`.

En los diagramas de flujo, las coordenadas son coordenadas del diagrama para todos los elementos,
también dentro de los grupos. En las composiciones libres, los hijos de un grupo se colocan
relativos a su interior ([free.md](free.md)). `place` es el centro de la caja y `size`, su ancho y
su alto.

## Tamaños predeterminados

Los tamaños salen de los tokens del tema ([styles.md](styles.md)). Los valores de abajo son los de
los temas `technical.*`; otros tamaños de letra los escalan.

| Tipo                                                 | Sin `size`                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node`                                               | 160 x 56, más ancho cuando lo necesita la etiqueta o una línea de la descripción (+`padding`, 16 px, a cada lado), y más ancho o más alto para un icono junto al texto, encima o debajo, con su `iconSize`           |
| `node` con `shape`                                   | el tamaño de la forma ([free.md](free.md#texto-y-formas)), ampliado hasta que el texto cabe en el área de texto de la forma; `shape icon` mide 64 x 64, o el `iconSize` escrito, más su marco, con la etiqueta fuera |
| `node`, `decision`, `data` con `iconPosition center` | 120 x 120, ensanchado para su etiqueta; una decisión o un almacén de datos crece hasta que su contorno contiene la etiqueta y el icono                                                                               |
| `decision`                                           | 160 x 80, ampliado hasta que el texto cabe dentro del rombo                                                                                                                                                          |
| `data`                                               | 160 x 64, ensanchado como un nodo                                                                                                                                                                                    |
| `group`                                              | la caja de los hijos + `groupPadding` a los lados y abajo, `groupHeader` arriba (`groupPadding` sin título), ensanchado para su título; un hijo dibujado con `shape icon` cuenta con su etiqueta                     |
| `tag`                                                | ancho del texto medido + 18, por 18                                                                                                                                                                                  |
| `note`                                               | ancho medido de la línea más larga, por 18 por línea más 4                                                                                                                                                           |

Las cajas base escalan con `labelSize` (160 x 56 a 13 px). Además, una caja es al menos tan alta
como su etiqueta y sus líneas de descripción más cuatro quintos de `padding` arriba y abajo, así que
varias líneas de descripción la hacen crecer.

El texto se mide con las fuentes incluidas antes de la disposición (consulta [fonts.md](fonts.md)),
así que en las cajas sin `size` el texto siempre cabe. Un `size` explícito que deja menos de 6 px
entre el texto y un borde (en un rombo o en otra forma, el borde de su área de texto) se informa
como `layout.text-overflow`, con una pista que da un ancho en el que cabe; el texto nunca se reduce.
Las píldoras de las etiquetas de relación son tan anchas como su texto medido más 12 px.

## Formas y texto

| Tipo       | Dibujo (tamaños de `technical.*`)                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node`     | rectángulo redondeado (`radius` 8, o su propio `radius`); etiqueta de `labelSize` 13 px con `labelWeight` 600; líneas de descripción de 11 px; con `shape`, esa forma, con el texto en su área de texto |
| `data`     | cilindro (cuerpo y elipse superior); texto como en un nodo, desplazado hacia abajo la mitad de la altura de la elipse                                                                                   |
| `decision` | rombo; texto como en un nodo, dentro del rombo                                                                                                                                                          |
| `group`    | banda redondeada (`groupRadius` 14, o su propio `radius`) con el título (`groupTitleSize` 13 px) arriba a la izquierda y la descripción debajo; un grupo sin título dibuja solo su contorno             |
| `note`     | texto atenuado alineado a la izquierda de `noteSize` 11 px, 18 px por línea, sin borde salvo que se fije `fill`, `stroke` o `pattern`                                                                   |
| `tag`      | píldora con texto monoespaciado de `tagSize` 10,5 px; de forma predeterminada, relleno `tag` y texto `tagText`                                                                                          |

Las veinticuatro formas que admiten los nodos y las cajas libres, con sus tamaños, sus áreas de
texto y sus contornos, se enumeran en [free.md](free.md#texto-y-formas); `shape icon` dibuja solo
el icono con la etiqueta fuera ([free.md](free.md#iconos-como-formas)), e `iconPosition` coloca un
icono junto al texto, encima, debajo o en el centro ([styles.md](styles.md#iconos-en-las-cajas)).

Los contornos tienen el ancho de `strokeWidth` (1 px). La etiqueta y la descripción de un nodo, una
decisión, un almacén de datos, una caja o una entidad C4 pueden contener saltos de línea `\n`, y
cada línea se dibuja bajo la anterior. Las etiquetas de relación son píldoras (relleno surface,
borde line) con texto de `relationLabelSize` 11 px, centradas en el punto de la ruta que da
`label <relation> at <n>% offset (dx, dy)`, o al 50 % sin desplazamiento cuando no hay instrucción
`label`.

## Conectores

Una relación es una polilínea de ancho `connectorWidth` (1,3 px en `technical.*`) que termina en la
punta `arrowhead` del tema, de largo `arrowSize` y de ancho siete octavos de ese largo:

- `triangle` (technical y stage): un triángulo relleno; la línea se detiene en su base;
- `open` (editorial): un chevrón sin relleno del color y el ancho del conector; la línea llega hasta
  el vértice;
- `none`: sin punta; la línea llega hasta la caja.

Los estilos `arrowhead` y `arrowtail` eligen cualquiera de las puntas de
[styles.md](styles.md#puntas-de-flecha) en el destino y en el origen; una relación bidireccional (`<->`,
`<-->`) dibuja la punta del destino en ambos extremos. Una línea (`--`, `---`) no dibuja punta en
ningún extremo, sea cual sea el `arrowhead` del tema, y llega hasta las dos cajas; un `arrowhead` o
un `arrowtail` escrito se sigue dibujando, así que `a -- b` con `arrowhead circle` termina en un
círculo. Una `line` libre se dibuja con el mismo código a partir de sus puntos, sin punta salvo
que se escriba una ([free.md](free.md#líneas)). Las puntas se dibujan después de la línea y
antes de la etiqueta, con el color y el ancho del conector; las formas rellenas detienen la línea en
su base, y las huecas, en su parte trasera. Un conector Bézier se recorta en ambos extremos.

`-->`, `---` y `line dashed` usan un patrón de guiones `5 4`; `line dotted` dibuja puntos redondos: un
guion de 0 y un hueco de `1.5 × width + 3` con extremos redondeados.

El anclaje en cada caja sigue la decisión 0006:

1. Con puntos de paso, cada lado se ancla en la proyección de su punto de paso vecino, limitada al
   lado. `route ext from clients.east to gateway.north via [(1035, 48)]` sale de `clients` en
   y = 48 y entra en `gateway` en x = 1035.
2. Los lados paralelos enfrentados sin un punto de paso entre ellos se unen en el centro de la
   superposición de sus extensiones. Una caja que abarca x 260..460 encima de una caja que abarca
   x 240..700 recibe un conector vertical en x = 360. Cuando las extensiones no se superponen, cada
   lado usa su propio centro.
3. Los lados que no se enfrentan salen desde sus centros; los lados perpendiculares se unen con un
   codo.
4. Un puerto `auto` (el predeterminado, también `from api` sin puerto) elige el lado que mira hacia
   el punto vecino, juzgado según las proporciones de la caja, así que una banda ancha prefiere su
   lado este u oeste para una caja que está a su lado.

Los puntos de paso explícitos siempre se imponen a estas reglas. Un puerto con nombre, o un punto
cardinal con un porcentaje (`api.east 50%`), se ancla en su propio punto, que los puntos de paso no
mueven, y los extremos libres que llegan a un lado de una caja a menos de 16 px toman carriles a
lo largo de él ([layout.md](layout.md#conectores)). La
propiedad `routing` elige conectores ortogonales, rectos o curvos; consulta [layout.md](layout.md).

**Anclajes en los contornos.** Estas reglas hallan puntos en el rectángulo de una caja. En una caja
dibujada con otra forma (el rombo de una decisión, el cilindro de un almacén de datos, la píldora
de una marca, un nodo o una caja con una `shape` distinta de `rounded`, `rectangle`, `square` o
`framed`), cada uno de esos puntos, incluidos los extremos de las rutas del motor, se desliza luego
por la perpendicular hacia dentro de su lado hasta el primer punto del contorno, o hasta el punto
del contorno más cercano cuando la perpendicular no lo encuentra; un punto en una esquina del
rectángulo (un carril empujado al final de su lado) va al punto del contorno más cercano. Las puntas y las curvas siguen al
extremo final, y el texto conserva el lado y el porcentaje. Una ruta que termina `to d.north 5%` en
un rombo de 160 × 80 centrado en (280, 200) termina en (208, 196), sobre su lado superior
izquierdo, no en la esquina del rectángulo.

## Estilos

| Propiedad   | Elemento                                                                  | Relación                                       |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| `fill`      | fondo; `"none"` no dibuja fondo                                           | fondo de la píldora de la etiqueta             |
| `stroke`    | color del contorno                                                        | color del conector y de la punta               |
| `color`     | texto de la etiqueta y de la descripción                                  | texto de la píldora de la etiqueta             |
| `line`      | contorno `dashed` o `dotted`                                              | se impone al estilo de la flecha (`->`, `-->`) |
| `width`     | ancho del contorno                                                        | ancho del conector                             |
| `radius`    | radio de las esquinas de los rectángulos redondeados y de los grupos      | no se permite                                  |
| `shape`     | el dibujo de un nodo o de una caja libre                                  | no se permite                                  |
| `pattern`   | `hatch`, `dots` o `cross` sobre la forma, con un 35 % de opacidad         | no se permite                                  |
| `arrowhead` | no se permite                                                             | la punta en el destino                         |
| `arrowtail` | no se permite                                                             | la punta en el origen                          |
| `corners`   | no se permite                                                             | codos `rounded`                                |
| `icon`      | un icono a la izquierda del texto o encima de él ([assets.md](assets.md)) | un icono en la píldora de la etiqueta          |
| `iconColor` | color de un icono monocromo                                               | color de un icono monocromo                    |

Los colores pueden ser nombres de tokens (`stroke danger`), que siguen al tema. Los patrones se
dibujan en el color del borde del elemento, o en `muted` si no tiene, así que el significado nunca
depende solo del color. Las clases, las reglas por tipo y el orden en que se aplican están en
[styles.md](styles.md).

Una píldora de etiqueta sin `stroke` toma prestado el color de `fill`, así que
`style r1 { fill "#1b1f23"; color "#fff" }` da un círculo oscuro para una etiqueta de un carácter.
Los estilos con varios destinos (`style a, b, c { ... }`) son la forma habitual de marcar con
`line dashed` cada pieza propuesta.

## Temas

El tema decide la paleta, la tipografía, el espaciado, los bordes, las puntas y el marco con el
logotipo. Temas integrados:

| Nombre                             | Fondo     | Superficie | Tinta     | Atenuado  | Línea     | Fuente        | Marco  |
| ---------------------------------- | --------- | ---------- | --------- | --------- | --------- | ------------- | ------ |
| `technical.light` (predeterminado) | `#F7FBFF` | `#FFFFFF`  | `#0B1830` | `#526579` | `#DCE5ED` | Inter         | footer |
| `technical.dark`                   | `#07111F` | `#0F1B2D`  | `#F7FBFF` | `#88A0B9` | `#183149` | Inter         | footer |
| `editorial.light`                  | `#ffffff` | `#ffffff`  | `#1b1f23` | `#5b6570` | `#c7cdd2` | IBM Plex Sans | none   |
| `editorial.dark`                   | `#13161a` | `#1b1f24`  | `#e5e8eb` | `#9aa4ad` | `#3b434b` | IBM Plex Sans | none   |
| `stage.light`                      | `#FFFFFF` | `#FFFFFF`  | `#0A0F1A` | `#3D4A5C` | `#9AA8B8` | Inter         | header |
| `stage.dark`                       | `#05080F` | `#0E1626`  | `#FFFFFF` | `#A9B8CC` | `#2B3B52` | Inter         | header |
| `sketch.light`                     | `#F7FBFF` | `#FFFFFF`  | `#0B1830` | `#526579` | `#DCE5ED` | Inter         | footer |
| `sketch.dark`                      | `#07111F` | `#0F1B2D`  | `#F7FBFF` | `#88A0B9` | `#183149` | Inter         | footer |

`Line` contornea las cajas de los diagramas de flujo, libres y C4; los diagramas de secuencia
dibujan sus cabeceras, barras, notas y líneas de vida en `Muted` ([sequence.md](sequence.md#disposición)).

- **Technical**, para la revisión de arquitectura: marcas azul Egeo (`#2563EB`, cian en el tema
  oscuro), el degradado de Meltemi para el símbolo (de `#1D4ED8` a `#0891B2` en el claro, de
  `#3B82F6` a `#22D3EE` en el oscuro) y los tamaños de las tablas de arriba.
- **Editorial**, para documentos y lectura larga: grises discretos, marcas del color de la tinta,
  radios más pequeños, conectores de 1 px con puntas abiertas y sin marco.
- **Stage**, para presentaciones y video: más contraste, etiquetas de 16 px, descripciones y
  etiquetas de relación de 13 px, conectores de 2 px, puntas de 10 px, márgenes de 48 px y un marco
  en el encabezado.
- **Sketch**, para pizarras y primeras ideas: las paletas, los tamaños y el marco de los temas
  technical, con los codos redondeados (`corners rounded`) y los trazos pintados a mano
  (`sketch light`, más abajo). Su texto va en Patrick Hand, una fuente manuscrita, con Inter para
  los caracteres que no tiene.

Todos los temas integrados tienen los colores de señal `success`, `warning`, `danger` e `info`, y
las clases integradas ([styles.md](styles.md)).

Un archivo puede definir su propio tema con un bloque `theme <id> { }` (tokens en
[grammar-0.2.md](grammar-0.2.md#bloques-de-tema)) y elegirlo con `theme "<id>"`. Un proyecto puede
fijar un tema predeterminado en `project.json` ([projects.md](projects.md)).
`meltemi-diagrams export --theme <name>` se impone a la elección del diagrama. Cualquier nombre
desconocido se dibuja con `technical.light` e informa `layout.unknown-theme` como advertencia. Los
colores explícitos de los estilos se mantienen tal como están escritos en todos los temas; los
nombres de tokens de color siguen al tema.

### Marco

`frame footer` (el valor predeterminado de los temas technical) agrega debajo de la hoja una franja
con una línea fina del color `line`, el símbolo de Meltemi dibujado con el degradado de `accent` a
`accentEnd`, el texto de `brand` (en seminegrita) y el `title` del diagrama alineado a la derecha.
Sus medidas siguen a `frameSize`: a 12 px, la franja mide 44 px de alto, el símbolo 24 px y el
título 11 px. `frame header` (los temas stage) pone la franja arriba. `mark none` quita el símbolo;
`brand ""` quita el logotipo; `frame none` elimina la franja, que es como se comportan los temas
editorial. La franja ocupa todo el lienzo, es un grupo de la escena con el rol `frame`, fuera de los
elementos del diagrama, y el lienzo crece para que quepan el logotipo y el título.

### Trazos a mano

Cuando el `sketch` del tema es `light` o `rough` (los temas `sketch.*` son `light`), `renderSvg`
pinta cada rectángulo, trazado y polilínea con borde de los grupos de elementos, relaciones,
etiquetas, el marco, las líneas de vida y los eventos, incluidas las puntas y las píldoras de las
etiquetas, en tres piezas:

- solo el relleno, limpio, con `stroke="none"` (cuando la forma tiene relleno);
- encima, dos pasadas `<path fill="none">` que solo llevan el borde, con el ancho, el patrón de
  guiones, el desplazamiento de los guiones, la clase, la opacidad y la transformación de la pieza.
  Un rectángulo se convierte antes en cuatro lados unidos por cuartos de arco según su radio;
  después el contorno se muestrea cada 16 px (`light`) o 12 px (`rough`), y cada muestra se mueve
  a lo largo de la normal del contorno como mucho 0,6 px o 1,4 px.

Los desplazamientos salen de una secuencia pseudoaleatoria cuya semilla son el id del grupo y la
pasada, así que el mismo texto siempre produce los mismos bytes, y una edición en otro sitio no
cambia el temblor de una forma. La clave de una relación anónima (`a->b#1`) y un id generado
cambian cuando se reordenan las instrucciones, y su temblor cambia con ellos; nombra lo que deba
quedarse quieto. El texto, las imágenes, los iconos, el símbolo de la marca, los degradados y los
patrones no se tocan, y los rellenos siguen limpios. Solo cambia la pintura: las cajas, los
recorridos y los límites de la disposición, la detección de clics, los contornos de selección y
los tiradores del lienzo y el editor de texto usan la geometría limpia. Todas las exportaciones
(SVG, PNG, PDF, los reproductores, el video) y el lienzo dibujan con `renderSvg`, así que todos
muestran los mismos trazos; un guion en movimiento se mueve en las dos pasadas. Una imagen
dibujada a mano pesa más: la pizarra de la galería ocupa 6,5 KB limpia y 35,6 KB a mano con
`--fonts system` (decisión 0058).

### Preajustes y lienzo

`preset document` advierte (`layout.too-large`) cuando el lienzo es más ancho que 1200 px.
`preset slide` amplía el lienzo a 16:9 con el contenido centrado y advierte cuando el contenido
supera 1920 × 1080 px. `canvas (w, h)` fija el lienzo y centra el contenido; una dimensión que el
contenido supera crece, con la misma advertencia. El texto nunca se reduce: divide los diagramas
densos en vistas.

## El SVG

- Un `<svg>` con `xmlns`, `width`, `height` y `viewBox`; el lienzo es el rectángulo que delimita la
  escena más el `margin` del tema (20 px en `technical.*`), redondeado hacia arriba a píxeles
  enteros, y luego dimensionado por el preajuste o por `canvas`.
- `<title>` y `<desc>` llevan el `title` y la `description` del diagrama cuando existen.
- Un rectángulo de fondo del color de fondo del tema, de otro color, o ninguno con
  `--background transparent` ([export.md](export.md)).
- Los elementos con `url` se dibujan dentro de un `<a href>` en su grupo; un `link` para todo el
  dibujo envuelve todo lo dibujado en un único `<a href>`.
- Cada elemento y cada relación es un `<g data-id="..." data-role="element|relation">`; las
  etiquetas de relación son un `<g data-role="label">` anidado. Los editores pueden relacionar los
  clics con los ids gracias a estos atributos. Una línea libre es un grupo de elemento cuya
  etiqueta se anida del mismo modo. Un grupo en una capa distinta de `main` lleva además
  `data-layer="<nombre>"`.
- Las imágenes de las composiciones libres son
  `<image href="data:…" preserveAspectRatio="xMidYMid meet">` dentro del grupo de su elemento, con
  la descripción como hijo `<title>`. No se hace referencia a ningún archivo ni URL.
- Aparece un bloque `<defs>` cuando la escena usa el símbolo de Meltemi (`<linearGradient>`),
  patrones (mosaicos `<pattern>` a los que una forma superpuesta hace referencia como
  `fill="url(#…)"`) o incrusta fuentes (`<style>` con reglas `@font-face`). El grupo del símbolo
  lleva un `transform`. Por lo demás, la presentación va en línea (`fill`, `stroke`,
  `stroke-dasharray`, `font-size`, `font-weight`): sin variables CSS, sin `<marker>`, sin
  `dominant-baseline`, sin fuentes externas.
- Las líneas base salen de la disposición: el centro del texto más la mitad de la altura de las
  mayúsculas de la fuente medida, así que el texto queda centrado ópticamente con cualquier fuente.
- Las fuentes siguen la política de fuentes de la exportación: `embedded` (predeterminada en
  `meltemi-diagrams export`: los archivos de subconjuntos incluidos como URI de datos), `outlined`
  (el texto como trazados con `aria-label`) o `system` (solo los nombres de las fuentes; se usa la
  primera fuente instalada). Consulta [fonts.md](fonts.md).
- Dibujar dos veces el mismo código fuente da archivos idénticos byte a byte, que es lo que
  comprueban las pruebas de instantáneas de `corpus/` y `examples/`.
- Los efectos (`animate`) no se dibujan de forma predeterminada. `--at <time>` dibuja la imagen en
  ese instante, con las partículas, los trazos y los halos como formas comunes en un último
  `<g data-role="motion">`. `--motion animated` escribe el perfil animado: un `<style>` con
  fotogramas clave CSS, clases en las formas animadas y superposiciones que son invisibles fuera de
  sus animaciones, así que el dibujo estático sigue siendo la alternativa ([motion.md](motion.md)).

El navegador instalado dibuja PNG y PDF a partir de este SVG ([export.md](export.md)).

# Disposición

[English](../../language/layout.md)

Un diagrama de flujo se organiza en uno de tres modos. Puedes mezclar posiciones escritas con la
organización automática, agregar restricciones que alinean cajas, nombrar puertos en las cajas y
elegir cómo se dibujan los conectores. Las mismas reglas se aplican en la línea de comandos, en el
editor y en cada exportación. Las composiciones libres usan los mismos modos con `layout manual` como
valor predeterminado, y colocan los hijos de un grupo dentro de su grupo ([free.md](free.md)). Los
diagramas de secuencia tienen su propia disposición, que sale del orden de sus eventos
([sequence.md](sequence.md)); las vistas C4 usan la disposición de los diagramas de flujo
([c4.md](c4.md)). Cuando el motor organiza un diagrama, deja espacio para las etiquetas de las
relaciones entre las cajas.

## Modos

```text
diagram checkout: flow {
  direction LR
  layout assisted
  ...
}
```

| Modo                    | Posiciones                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `auto` (predeterminado) | El motor de disposición organiza todas las cajas. Se ignoran las instrucciones `place` y los puntos de paso de las rutas. |
| `assisted`              | Las cajas colocadas se quedan exactamente donde están; el motor organiza las demás a su alrededor.                        |
| `manual`                | Cada caja necesita un `place`; si falta, es `layout.missing-placement`.                                                   |

- **`auto`**:
  - Se organizan todas las cajas, las notas y las marcas. Los grupos se ajustan a sus hijos, y
    también se ignora el `place` propio de un grupo. El `size` escrito de un grupo es el tamaño
    mínimo que le da el motor, con sus hijos centrados, así que un contenedor dibujado más grande
    que su contenido conserva su tamaño.
  - Un grupo del nivel superior con `place` y `size` y nada dentro, una banda, se queda donde está
    escrito, fuera del camino del motor, como en `assisted`; su `place` no se informa. Una banda
    dentro de un grupo que organiza el motor no tiene posición que conservar y es
    `layout.missing-placement`.
  - El primer `place` ignorado, o el primer `route` con puntos de paso, se informa una sola vez como
    `layout.placement-ignored`, con la pista de usar `layout assisted`.
  - `size`, `label`, los puertos de las instrucciones `route`, las restricciones y los estilos se
    aplican como siempre.
  - En las composiciones libres, una lista se organiza como una sola caja y conserva a sus hijos en
    su orden, y las líneas y los lápices conservan sus puntos escritos
    ([free.md](free.md#listas)).
  - Los conectores siguen las rutas ortogonales del motor.
- **`assisted`**:
  - El motor organiza todo el grafo.
  - Cada caja sin colocar mantiene su desplazamiento respecto de la caja colocada más cercana en
    esa organización.
  - Una caja que entonces se superpondría a otra ya posicionada se aleja de esa caja colocada, en la
    dirección de la disposición, hasta quedar libre.
  - Un grupo con `place` y `size` ni se organiza ni estorba a las cajas organizadas, así que un
    grupo sin título en una capa del fondo es una banda detrás de ellas
    ([free.md](free.md#capas-y-orden)).
  - Los conectores usan las reglas de anclaje de [svg-export.md](svg-export.md).
- **`manual`**: las posiciones son solo las que están escritas.

`direction` (`LR`, `RL`, `TB`, `BT`) fija el sentido de la organización. Las relaciones principales
(`->`) pesan más que las secundarias (`-->`) cuando el motor endereza las aristas.

### El motor

La línea de comandos, el editor y cada exportación usan el algoritmo por capas de ELK (`elkjs`
0.12.0, en `@meltemi/diagrams-layout-elk`; consulta la decisión 0015). La organización es
determinista:

- el mismo código fuente da el mismo dibujo;
- las cajas mantienen el orden del código fuente dentro de cada capa;
- agregar una caja no relacionada no reordena las que ya existen.

Las aplicaciones anfitrionas pasan un motor a `layoutDiagram(compilation, diagram, { engine })`. Sin
él, los diagramas `auto` y `assisted` solo se dibujan cuando todas las cajas están colocadas, y si
no, informan `layout.mode-unsupported`. Un motor es cualquier objeto con un `arrange(request)`
síncrono:

- la solicitud enumera las cajas con sus tamaños, sus grupos padre, sus puertos y, en `assisted`, los
  centros fijos; los grupos con sus márgenes interiores, cuyo margen superior es la banda del
  título en un grupo con título y `groupPadding` en uno sin título; y las relaciones con sus
  puertos y su tipo;
- el motor devuelve el centro de cada caja y los puntos de cada relación.

Un motor que lanza una excepción se informa como `layout.engine-failed`.

### Escribir las posiciones

`meltemi-diagrams layout <file.meltemi>` ejecuta el motor y escribe lo que dibujaría:

- **sin opciones**: un `place` para cada caja sin colocar, alrededor de las colocadas, tal como las
  dibuja `layout assisted`;
- **`--all`**: organiza todo de nuevo, reescribe cada `place` (y el `place` y el `size` de los
  grupos colocados) y devuelve al motor los puntos de conexión: se van los lados y los puntos de
  las rutas y los puertos con nombre se quedan. Los codos de los conectores que dibuja el motor se
  escriben como puntos de paso, con los extremos libres
  (`route store from api to db via [(860, 120)]`), y una relación anónima se nombra antes
  `<origen>_<destino>`; una ruta que queda sin nada se quita. Los conectores exportados después
  tienen los codos que tenían antes, cada uno a menos de 1 px.

En las composiciones libres, ambos escriben también un `place` y un `size` para cada grupo
organizado, y las posiciones de los hijos de los grupos relativas al interior del grupo. Una lista
(`layout column|row` en el bloque de un grupo) se organiza como una sola caja: recibe un `place` y
conserva su tamaño derivado, y no se escribe nada para los hijos que coloca
([free.md](free.md#listas)).

Ambos convierten `layout auto` en `layout assisted`, así que el archivo conserva el dibujo. Otras
opciones:

| Opción           | Efecto                                             |
| ---------------- | -------------------------------------------------- |
| `--diagram <id>` | organiza un diagrama                               |
| `--check`        | no escribe nada y sale con 1 cuando algo cambiaría |
| `--stdout`       | imprime el resultado en lugar de escribirlo        |

Arrastrar una caja en el editor escribe su `place` y también convierte `layout auto` en
`layout assisted`. Los editores llaman a `planEdit()` con la operación `arrange`, que es la misma
edición que hace el comando.

## Puertos con nombre

Una caja puede declarar puertos en su bloque. Luego las rutas se conectan a ellos por su nombre:

```text
bus["Event bus"] {
  port in west
  port out east 30%
}
placement {
  route publish from api.east to bus.in
}
```

- `port <name> <side> [<n>%]` pone un puerto en `north`, `south`, `east` o `west`. El porcentaje
  recorre el lado, de izquierda a derecha o de arriba abajo, y es 50 % de forma predeterminada.
- Los nombres de puerto son identificadores distintos de los puntos cardinales y de `auto`. Un
  duplicado es `ref.duplicate-id`.
- Una ruta que nombra un puerto que la caja no declara es `placement.unknown-port`, con los puertos
  de la caja en la pista.
- Un puerto con nombre es un punto: los conectores empiezan o terminan exactamente ahí y salen
  perpendiculares al lado. Los puertos cardinales solo eligen el lado; las reglas de anclaje eligen
  el punto.
- Un porcentaje después de un punto cardinal fija el extremo de una ruta en ese punto del lado,
  leído como en `port`: `route publish from api.east 50% to bus.in` sale del centro del lado este de
  `api`. El extremo se ancla entonces como un puerto con nombre, en cualquier modo de disposición, y
  los puntos de paso no lo mueven. Después de `auto`, de un elemento sin puerto o de un puerto con
  nombre, o fuera de 0 a 100, el porcentaje es `prop.invalid-value`.
- En una caja dibujada con una forma que no es un rectángulo (el rombo de una decisión, el
  cilindro de un almacén de datos, un nodo con `shape hexagon`), un puerto o un punto fijado se
  dibuja donde la perpendicular al lado que pasa por él toca el contorno; el texto conserva el lado
  y el porcentaje ([free.md](free.md#texto-y-formas)).

## Restricciones

Las restricciones van en bloques `placement` y se cumplen en todos los modos:

| Instrucción                            | Significado                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `align a, b, c top`                    | bordes superiores iguales; también `bottom`, `left`, `right`                     |
| `align a, b, c middle`                 | centros verticales iguales; `center` da centros horizontales iguales             |
| `row a, b, c`                          | lo mismo que `align a, b, c middle`                                              |
| `column a, b, c`                       | lo mismo que `align a, b, c center`                                              |
| `order a, b, c [horizontal\|vertical]` | centros estrictamente crecientes en el orden escrito; el eje sale de `direction` |
| `distance a, b 80`                     | al menos 80 px entre las dos cajas, de borde a borde                             |

- **Quién se mueve.** Las cajas colocadas nunca se mueven. Las cajas sin colocar se mueven hasta
  que se cumplen todas las restricciones:
  - las cajas alineadas toman como referencia el primer miembro colocado o, si no lo hay, la media
    de las que no están colocadas;
  - las cajas ordenadas se empujan más allá de su predecesora más 40 px;
  - una caja más cercana que `distance` se aleja.
- **Conflictos.** Lo que sigue sin cumplirse después de 20 rondas es `layout.constraint-conflict`
  (error) en la instrucción, que nombra las cajas y cuánto se desvían. El dibujo se hace de todos
  modos.
- **`manual`.** Todas las cajas están colocadas, así que las restricciones solo comprueban las
  posiciones.
- **Errores del modelo.** Las restricciones se aplican a cajas, notas y marcas, no a grupos. El
  modelo informa:
  - una caja desconocida (`ref.unknown-element`);
  - una caja listada dos veces;
  - un `align`, `row` o `column` con una sola caja;
  - un `distance` sin exactamente dos cajas y una separación positiva.

## Conectores

```text
routing orthogonal          // valor predeterminado del diagrama
style notify { routing bezier }
```

`routing` es una propiedad del diagrama y una propiedad de estilo de las relaciones (también a
través de clases y de `rule relation`):

| Valor                   | Conector                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (predeterminado) | las reglas de anclaje de [svg-export.md](svg-export.md), o las rutas del motor en el modo `auto`                                      |
| `orthogonal`            | segmentos horizontales y verticales que pasan por los anclajes y los puntos de paso, y que salen y entran perpendiculares a los lados |
| `polyline`              | segmentos rectos entre los anclajes y los puntos de paso                                                                              |
| `bezier`                | una curva suave que pasa por los anclajes y los puntos de paso, y que sale y entra perpendicular a los lados                          |

Las rutas del motor son ortogonales, así que en el modo `auto` los conectores `polyline` y `bezier`
unen sus anclajes directamente.

**Esquinas redondeadas.** `corners rounded` (un estilo de relación, o el token del tema para todas
las relaciones) reemplaza cada codo de un conector `auto`, `orthogonal` o `polyline` por una curva
que empieza a 10 px del codo, o a la mitad del segmento más corto cuando eso es menos. Los temas
integrados mantienen las esquinas `sharp`, salvo el par `sketch.*`, que las redondea; los
conectores `bezier` ya son suaves.

**Líneas sin puntas.** Una relación escrita `--` o `---` se traza exactamente como una flecha: se
aplican las reglas de anclaje, los carriles, los desvíos y los huecos bajo los títulos de grupo, y
la línea llega a las dos cajas, porque no hay punta en la que detenerse.

**Líneas libres.** Una `line` de un diagrama libre ([free.md](free.md#líneas)) es un conector
cuyos anclajes y puntos de paso son los puntos escritos, desplazados por el origen del interior de
su padre. Es `polyline` de forma predeterminada, y también con `auto`, porque no tiene ninguna caja
a la que anclarse: segmentos rectos entre sus puntos. `routing orthogonal` pone un codo entre dos
puntos consecutivos que difieren en los dos ejes, con el primer segmento en el eje del paso más
largo (`from (0, 0) to (200, 100)` pasa por (200, 0)); `routing bezier` traza una curva que pasa por
todos los puntos; `corners rounded` redondea sus codos. Sus puntas son `arrowtail` y `arrowhead`,
ninguna de forma predeterminada, recortadas de la línea como las de una relación. Una línea no
toma carriles, desvíos ni huecos bajo el título de un grupo, y las comprobaciones de composición
entre cajas la dejan fuera: sus puntos están donde los escribiste. Una línea cuyos puntos coinciden
se dibuja como un punto de su ancho y se informa como `layout.degenerate-line` (advertencia).

**Trazos de lápiz.** Un `pen` ([free.md](free.md#trazos-de-lápiz)) se dibuja junto a las líneas,
pero no se traza como un conector: sus puntos escritos, desplazados por el origen del interior de
su padre, se unen con un solo trazado suave por los puntos medios de los puntos consecutivos, sea
cual sea el `routing`. No toma carriles, desvíos ni huecos, ningún motor lo mueve, y las
comprobaciones de composición lo dejan fuera. Un punto, o puntos que coinciden, dibujan un punto,
sin advertencia. Sus puntas son `arrowtail` y `arrowhead`, recortadas a lo largo de sus tramos
finales como las de una línea.

**Listas.** Un grupo que escribe `layout column` o `layout row` coloca a sus propios hijos en el
orden del código ([free.md](free.md#listas)) antes de que se dibuje ningún conector: un conector
entre dos tarjetas de una lista termina donde la lista las pone. El motor ve una lista como una
sola caja de su tamaño derivado en todos los modos, con las relaciones hacia lo que contiene
terminando en ella, y nunca organiza nada dentro de ella.

**Elementos girados.** Un conector llega a un elemento girado con `rotation` por su contorno
girado. Un extremo libre se dirige al rectángulo que envuelve el dibujo girado, como a cualquier
caja, y se desliza desde el lado de ese rectángulo hasta el contorno. Un puerto con nombre o un
punto fijado (`api.north 30%`) se halla en el elemento sin girar y gira con él: `api.north` de un
nodo girado 90 grados mira al este, y el conector sale de él hacia el este. Con `layout auto` el
motor organiza el rectángulo que envuelve el dibujo girado, y la caja del elemento se centra en él.

**Alrededor de otras cajas.** En todos los modos, un conector `auto` u `orthogonal` sin puntos de
paso y sin carril paralelo cuya ruta —la del motor o la de las reglas de anclaje— atravesaría otra
caja la rodea. Con ambos extremos libres toma primero, entre los puntos medios de dos lados, la ruta
en forma de L o de Z que cruza menos cajas y, a igualdad, la más corta. Si aun así cruza una caja,
o si un extremo está fijado (`api.south`, `api.south 30%` o un puerto con nombre), toma el desvío
ortogonal más corto que sale y entra por donde lo hacía el conector, perpendicular a esos lados y
con los menos codos posibles. Un conector que no tiene nada en su camino mantiene su ruta. Una caja
o un grupo que contiene uno de los extremos del conector (un grupo que lo rodea, una caja dentro de
la que está apilado) no está en su camino, ni tampoco una caja de una capa distinta de la de la
relación, así que los conectores cruzan en línea recta los contenedores y las bandas.

**Etiquetas que coloca la disposición.** La etiqueta de una relación sin instrucción `label` se
sitúa en el medio de su conector cuando ese lugar está libre; si no, se desliza a lo largo del
conector, desde el medio hacia afuera, hasta el primer lugar donde no cubre ninguna caja, ningún
título de grupo, ninguna otra etiqueta ni ningún otro conector. `label <relation> at <n>%` la coloca
a mano.

**Títulos de grupo.** Un conector recto que cruza el título de un grupo (y su descripción) se dibuja
con un hueco ahí, así que pasa por debajo del título en lugar de por encima. Los grupos sin título
no tienen banda del título, así que no abren ningún hueco y las etiquetas pueden quedar en su parte
superior.

**Carriles.** Los extremos libres de los conectores que dibujan las reglas de anclaje (sin puntos
de paso, sin puerto con nombre, sin punto de un lado) que llegan al mismo lado de una caja a menos
de un carril se separan un carril: 16 px, o la altura de una etiqueta más 4 px en un lado con
relaciones etiquetadas. Los extremos de un tramo se ordenan a lo largo del lado según dónde está el
otro extremo de cada conector, para que no se crucen, y se centran en el medio de sus anclajes. Un
conector recto que se mueve en un extremo se mueve también en el otro, así que sigue recto. Las
relaciones entre las mismas dos cajas, en cualquier sentido, son extremos así en las dos cajas, de
modo que van en carriles paralelos separados 16 px.

## Comprobaciones de composición

Después de cada disposición se comprueba la escena. Cada hallazgo es una advertencia en la
instrucción del elemento que aparece después:

| Código                         | Hallazgo                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.overlap`               | dos cajas de una capa se intersecan, salvo que la posterior quede estrictamente dentro de la anterior; una caja cruza el borde de un grupo o queda sobre un grupo que no es el suyo    |
| `layout.label-under-connector` | la etiqueta de una relación queda sobre el conector de otra relación                                                                                                                   |
| `layout.container-margin`      | una caja de un grupo de su capa, colocado y con tamaño, está a menos de la mitad del margen interior del grupo de su borde, o en su banda del título (un grupo sin título no la tiene) |
| `layout.connector-overlap`     | dos conectores corren uno junto al otro a lo largo de más de 24 px                                                                                                                     |
| `layout.connector-crossing`    | un conector atraviesa una caja de su capa que no une y que no contiene ninguno de sus extremos; una caja con forma, según su contorno                                                  |
| `layout.label-cut`             | un texto sobresale del área de texto de su forma, del fondo de su etiqueta o del dibujo                                                                                                |
| `layout.label-overlap`         | un texto se superpone a otro texto, a la caja de un elemento al que no pertenece o a otro conector                                                                                     |

`layout.connector-overlap` también mantiene el flujo principal (`->`) separado de las dependencias
secundarias (`-->`); ELK ya traza más rectas las relaciones principales. Las notas y las marcas son
anotaciones que colocas sobre las cajas a propósito, así que sus cajas no se comprueban; aun así, su
texto no debe tapar otros textos. En las composiciones libres, los textos, los iconos y las imágenes
también son anotaciones, y las líneas y los lápices quedan fuera de las comprobaciones: un trazo
puede cruzar cajas y etiquetas. Una nota adhesiva se comprueba como una caja.

- **Pilas.** Una caja declarada después de otra caja de su capa que la contiene, estrictamente
  dentro de ella, es una pila hecha a propósito, que se dibuja encima, y no se informa; una
  superposición parcial, sí, y también dos cajas que coinciden. Una pila declarada de dentro hacia
  fuera se informa en la caja exterior, nombrando a las dos, con una pista que pide declarar
  primero la caja exterior. Por eso, enviar al fondo una caja interior convierte una pila correcta
  en un hallazgo.
- **Capas.** Las cajas y los grupos de capas distintas no se comprueban entre sí, y un conector no
  se comprueba frente a las cajas de otra capa, así que una banda en una capa del fondo puede
  quedar debajo de cajas y conectores.
- **Contenedores.** Un conector no atraviesa el grupo o la caja que contiene uno de sus extremos, y
  el texto propio de un contenedor puede quedar sobre las cajas que contiene; dos textos dibujados
  en el mismo punto siguen siendo `layout.label-overlap`, así que las cajas apiladas necesitan
  etiquetas vacías o separadas.
- **Formas.** Un conector que pasa por la esquina vacía de un rombo no lo atraviesa:
  `layout.connector-crossing` sigue el contorno de las cajas con forma, y `layout.label-cut` mide
  su texto frente al área de texto de la forma. `layout.overlap` compara los rectángulos.

Las comprobaciones de etiquetas (`label-cut`, `label-overlap`) miran el propio dibujo: cada texto,
medido con las fuentes del tema, frente al área de texto de su propia forma, los demás textos, las cajas y los
conectores dibujados, en todos los perfiles. Un texto que ya nombra otro hallazgo (un `size` que se
desborda, cajas superpuestas, una etiqueta sobre un conector, un conector que atraviesa una caja) no
se vuelve a informar. El corpus de aceptación mantiene todos los perfiles en cero
(`docs/quality.md`).

`meltemi-diagrams validate` y `export` imprimen los hallazgos, tal como los muestra el editor.

# El reproductor HTML

[English](../player.md)

El reproductor reproduce una historia, varias historias de un mismo dibujo, o un diagrama y sus
efectos, en cualquier navegador: sin
conexión, desde un solo archivo HTML, con los controles que pide la propuesta (pausa, progreso,
selección de escena, movimiento reducido y una vista estática) y compatibilidad completa con el
teclado y los lectores de pantalla. Dibuja cada fotograma con las mismas funciones que
`meltemi-diagrams export` y el lienzo, así que la imagen en un instante dado es la misma en todas
partes (decisión 0024). Alrededor del fotograma, nunca dentro, el reproductor deja explorar el
dibujo: zoom y desplazamiento, tarjetas al pasar el puntero, un panel de detalles, y abrir lo que
contiene una caja con un doble clic o su signo más (decisión 0047).

## Generar un reproductor

| Comando                                                                   | Resultado                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm mdg export purchase.meltemi --format html --story purchase`         | `purchase.purchase.html`, una página completa         |
| `pnpm mdg export purchase.meltemi --format html --story purchase --embed` | un fragmento para pegar en una página                 |
| `pnpm mdg export checkout.meltemi --format html`                          | `checkout.html`, el diagrama y sus efectos `animate`  |
| `pnpm mdg export flows.meltemi --format html --stories`                   | `flows.stories.html`, todas las historias del archivo |

La página de un diagrama también lleva todas las vistas que alcanza un desglose desde él en el
proyecto (la vista de contenedores de un sistema, la de componentes de un contenedor, los diagramas
que enlazan sus elementos), así que se explora sin conexión; el comando dice cuántas vistas
incluyó: `Wrote commerce.context.html (3 views)`. Las fuentes se incrustan de forma predeterminada, así que la página se ve igual sin las fuentes
instaladas; `--fonts system` las deja en manos del espectador. `--at`, `--motion animated` y
`--fonts outlined` no se aplican a un reproductor. En VS Code, **Meltemi Diagrams: Exportar el
reproductor HTML** pregunta qué historia o diagrama escribir (o **Todas las historias**, cuando el
archivo tiene más de una) y escribe la misma página que la línea de comandos, y la línea de tiempo
del lienzo tiene un botón **Exportar HTML** para la historia que reproduce.

## Varias historias

Un archivo puede contar varios flujos de un mismo dibujo, cada uno una `story` del mismo diagrama
([historias](language/stories.md)). `--stories` los escribe en un solo reproductor, en el orden del
archivo, o los que enumera en ese orden (`--stories refund,purchase`); las vistas que comparten se
incrustan una sola vez, y el comando dice cuántas historias lleva la página:
`Wrote flows.stories.html (2 stories)`. Una historia cuyas vistas no se pueden dibujar se deja fuera
y se nombra, y la página reproduce las demás.

El reproductor de varias historias tiene un selector **Historia** en su barra de controles, antes
del selector de escena. Elegir un flujo muestra su primer fotograma en 0 s, en pausa (en la vista
estática, el estado final de su primera escena), conserva el zoom, llena el selector de escena con
sus escenas y dice "Historia: Refund". La página lleva el nombre de la primera historia; el atributo
`story` del elemento elige la que se muestra primero. Con una sola historia no hay selector.

## Controles

| Control                            | Teclas                                                            | Qué hace                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Reproducir / Pausar                | Espacio, K                                                        | Reproduce desde el tiempo actual, o desde el principio si está al final; pausa               |
| Progreso                           | Izquierda / Derecha (un segundo), `,` / `.` (100 ms), Inicio, Fin | Un control deslizante con el tiempo; arrastrarlo pausa                                       |
| Escena anterior / Escena siguiente | Re Pág / Av Pág, P / N                                            | El inicio de una escena (Re Pág va primero al inicio de la escena actual)                    |
| Historia                           |                                                                   | Una página de varias historias: las historias por título; elegir una va a su inicio          |
| Escena                             |                                                                   | Una lista de las escenas de la historia que se muestra, con sus títulos                      |
| Vista estática                     | S                                                                 | El estado final de cada escena, sin animación; para un diagrama, el dibujo sin efectos       |
| Alejar / Acercar                   | `-` / `+` (o `=`)                                                 | El paso de zoom anterior o siguiente, alrededor del elemento con el foco o del centro        |
| Nivel de zoom                      | `1`                                                               | Muestra el zoom; al pulsarlo, tamaño real                                                    |
| Ajustar el dibujo                  | `0`                                                               | El dibujo completo, nunca por encima del tamaño real                                         |
|                                    | Mayús y una flecha                                                | Desplaza un octavo de la ventana del dibujo                                                  |
|                                    | Arriba / Abajo                                                    | Recorre los elementos y las relaciones, y dice cada uno                                      |
|                                    | Entrar                                                            | Muestra los detalles del elemento alcanzado; en uno seleccionado que abre una vista, la abre |
|                                    | Retroceso                                                         | Sube a la vista de arriba                                                                    |
|                                    | Esc                                                               | Cierra la tarjeta, luego el panel, luego borra la selección                                  |

Las teclas funcionan dondequiera que esté el foco dentro del reproductor, salvo en las listas de
historias y de escenas, y el control deslizante conserva sus propias flechas. Cada control tiene un nombre, una
descripción emergente con su tecla y un anillo de foco visible.

- **Movimiento reducido.** Cuando el sistema pide movimiento reducido, el reproductor empieza en la
  vista estática y nunca se reproduce solo; aun así, el espectador puede desactivar la vista
  estática.
- **Anuncios.** Los cambios de escena se anuncian de forma no intrusiva
  ("Escena 2 de 2: processing"), y también la historia elegida ("Historia: Refund"); el nombre
  accesible de la imagen indica la historia y la escena.
- **Resumen en texto.** Debajo del reproductor, un resumen lista cada escena con sus tiempos y sus
  acciones en palabras, con las etiquetas de los elementos: "Mostrar Cliente, API Gateway, Pedidos y
  PostgreSQL en 800 ms", "Recorrer “HTTPS” de Cliente a API Gateway en 1,2 s". Una página de varias
  historias lista cada historia bajo su título, con la que se muestra marcada como actual.
- **Los efectos que se repiten sin fin** se reproducen hasta que se pausan, sin control deslizante
  de progreso.
- **Dibujo interactivo.** El nombre de la imagen dice que admite interacción ("A purchase. Dibujo
  interactivo"); las selecciones, las vistas que se abren y el zoom con teclas se anuncian
  ("Seleccionado: API", "Se abrió containers", "Zoom 150 %"); el resumen lista los elementos como
  botones que los seleccionan, con lo que abre cada uno.
- **Idioma.** Los controles, los anuncios, los tiempos y el resumen están en inglés o en español
  ("Reproducir", "Escena 1: …", "1,2 s"), en el idioma de la exportación: `--lang`, si no el
  `"locale"` del proyecto, si no el inglés
  ([proyectos](language/projects.md#idioma-de-las-exportaciones)), nunca el del espectador.

## Explorar un dibujo

- **Zoom y desplazamiento.** Ctrl o Cmd con la rueda (y el pellizco de un panel táctil) acerca o
  aleja alrededor del puntero, del 10 % al 800 %. La rueda sola desplaza un dibujo más grande que
  su ventana y, si no, queda para la página, así que las páginas siguen desplazándose sobre un
  dibujo. Arrastrar desplaza; en una pantalla táctil, dos dedos pellizcan y uno desplaza un dibujo
  ampliado. El dibujo se muestra primero completo, nunca por encima del tamaño real, y conserva el
  zoom mientras se reproduce una historia; Ajustar es la única forma de volver. El zoom nunca forma
  parte del fotograma: **Descargar SVG** y todas las exportaciones dibujan el diagrama tal como está
  escrito.
- **Tarjetas al pasar el puntero.** Dejar el puntero 400 ms sobre un elemento muestra su etiqueta,
  su tipo C4 y su tecnología, su descripción (tres líneas) y su enlace; sobre una relación, su
  etiqueta, sus extremos, su tecnología, su descripción y su supuesto. Las tarjetas nunca tapan lo
  que describen y no aparecen en pantallas táctiles.
- **Selección y panel de detalles.** Un clic o un toque selecciona un elemento o una relación (un
  anillo a su alrededor) y abre un panel junto al dibujo, o debajo en pantallas estrechas: tipo,
  tecnología, la descripción completa, el enlace como **Abrir el enlace**, las relaciones entrantes
  y salientes (cada una la selecciona) y lo que añade quien aloja el reproductor (las historias, la
  entidad y las vistas del catálogo). Un clic en un elemento con `url` lo selecciona; Ctrl o Cmd y
  un clic siguen el enlace. Esc o Cerrar cierran el panel.
- **Diagramas de Gantt.** En un diagrama de Gantt ([gantt.md](language/gantt.md#en-el-reproductor)) la
  tarjeta de una tarea muestra su etiqueta, su sección, su estado (no cuando solo está planificada)
  y "Crítica", sus fechas (`8 jun 2026 → 19 jun 2026`) y sus días hábiles, `Después de: …` con las
  tareas a las que sigue, su descripción y el host de su `url`; la tarjeta de un hito o de una marca
  muestra su única fecha, la de una sección, su intervalo, y la de una flecha, "predecesora →
  sucesora". El panel enumera Sección, Inicio y Fin (Fecha en un hito o una marca), Tiempo hábil y
  Estado. El eje de tiempo no recibe eventos del puntero, así que nada en él tiene tarjeta.

## Abrir lo que contiene una caja

Un signo más en la esquina de una caja indica que abre una vista: un sistema cuya vista de
contenedores existe, un contenedor cuya vista de componentes existe, o un elemento cuyo `link`
nombra un diagrama de la página. Un doble clic, el signo más o Entrar sobre la caja seleccionada la
abren: la cámara se acerca a la caja y luego la vista se transforma en la que abre (un fundido
cuando las cajas son distintas), con el reloj del reproductor; con movimiento reducido es un corte.
Una ruta encima del dibujo nombra las vistas de arriba, **Subir** y Retroceso vuelven por el mismo
camino, y una miga salta varias vistas a la vez. Las cajas que no abren nada solo se seleccionan con
un doble clic. Las historias conservan su propia cámara y sus transiciones: sus elementos tienen
tarjetas y panel, no signos más.

## Insertar en una página

Una página o un fragmento contiene un elemento `<meltemi-player>` con su documento en un hijo
`<script type="application/json">`, y el script del entorno de ejecución una sola vez:

```html
<meltemi-player autoplay loop>
  <script type="application/json">
    {"format":"meltemi-player","version":3, …}
  </script>
</meltemi-player>
<script>
  /* the runtime, written by the exporter */
</script>
```

| Atributo              | Significado                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `autoplay`            | Se reproduce de inmediato, salvo que el espectador pida movimiento reducido      |
| `loop`                | Vuelve a empezar al final                                                        |
| `static`              | Empieza en la vista estática                                                     |
| `controls="false"`    | Oculta los controles; el teclado y el resumen se mantienen                       |
| `interactive="false"` | Dibuja el fotograma y los controles de reproducción: sin zoom, tarjetas ni panel |
| `lang`                | El idioma de los controles: `es` o `en`                                          |
| `story`               | Una página de varias historias: el id de la historia que se muestra primero      |

Una página completa lleva su idioma como `<html lang>`; un fragmento en español lleva `lang="es"`
en su elemento, y uno en inglés, nada. Un reproductor usa el `lang` más cercano (el suyo y, si no,
el de su página), así que fragmentos en inglés y en español pueden compartir una página. Los
fragmentos se pueden pegar más de una vez en una página; el elemento se define una sola vez, con
el primer entorno de ejecución de la página, que reproduce todos sus reproductores. Un entorno lee
los documentos de su versión y de la versión 2; uno más antiguo dice que no puede leer un documento
más nuevo, así que una página que mezcla fragmentos toma el entorno del más nuevo: pega ese
fragmento primero. Los controles viven en un shadow root, así que los estilos de la página no los alcanzan, y las fuentes
van una sola vez al head de la página. Los scripts también pueden llamar a
`MeltemiPlayer.mountPlayer(element, document, options)`, cuyas opciones admiten
`locale: "en" | "es"`, `interactive` y `story`, y que devuelve un manejador con `play`, `pause`,
`seek(ms)`, `goToScene(index)`, `goToStory(index)`, la historia `story` que se muestra,
`setStatic(on)`, el `svg` en pantalla, el `viewport`, `zoomIn()`,
`zoomOut()`, `fit()`, `actualSize()`, `setZoom(zoom)`, `panBy(dx, dy)`, `select(id)`,
`showDetails(id)`, `closeDetails()`, `open(id)` y `up()`. Quien aloja el reproductor pasa
`targets`, `onNavigate`, `sections` y `trail` para abrir sus propias páginas; el elemento emite los
eventos `meltemi-select`, `meltemi-navigate`, `meltemi-view` y `meltemi-story`. La página puede fijar los tokens de
movimiento en el elemento (`meltemi-player { --meltemi-motion: 0ms }`); valen cero con movimiento
reducido.

## El documento

| Clave                        | Significado                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `version`          | `meltemi-player` y `3` (el entorno también lee `2`, cuya única historia es su `timeline`)                                                                                                               |
| `kind`                       | `story` o `effects`                                                                                                                                                                                     |
| `id`, `title`, `description` | El diagrama, o la primera historia                                                                                                                                                                      |
| `stories`, `views`           | Historias: el id, el título, la descripción y la línea de tiempo de cada una, en orden; por id de diagrama, la escena, los efectos y los extremos de las relaciones de cada vista que muestran, una vez |
| `key`, `views`               | Efectos: la vista propia del diagrama y cada vista que alcanza un desglose, con cuándo terminan sus efectos                                                                                             |
| `names`                      | Por vista, su título y las etiquetas de sus elementos, relaciones, notas y fragmentos                                                                                                                   |
| `details`                    | Por vista, lo que dicen las tarjetas y lo que abre cada elemento; su nivel y alcance C4; su vista de arriba                                                                                             |
| `accent`                     | El color de los resaltados y los recorridos                                                                                                                                                             |
| `fontFaces`                  | Reglas `@font-face` para el texto, o ninguna                                                                                                                                                            |

Los datos se escapan para que nada en ellos pueda cerrar su elemento script, y no se carga nada de
la red.

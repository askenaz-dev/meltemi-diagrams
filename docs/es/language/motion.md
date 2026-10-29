# Efectos de movimiento

[English](../../language/motion.md)

Las instrucciones `animate` dan a los elementos y a las relaciones un efecto local: partículas que
fluyen a lo largo de un conector, un trazo que se mueve a lo largo de una línea o de un contorno, un
pulso que atrae la atención hacia una caja, o un recorrido que llena un conector desde su inicio
hasta su final.
Los efectos nunca mueven ni cambian el tamaño de nada; se dibujan encima del dibujo estático. Todos
los efectos se ejecutan con un único reloj determinista, así que una exportación animada, un
fotograma en un instante elegido y, más adelante, las historias y los videos muestran el mismo
estado en el mismo instante (decisión 0022).

```text
diagram checkout: flow {
  api -> orders as create
  orders --> events: "OrderCreated" as publish

  animate create { effect flow; particles 2 }
  animate publish { effect dash; direction reverse; delay 300ms }
  animate orders { effect pulse; duration 1500ms; repeat 3; color accent }
  animate create { effect trace; delay 600ms }
}
```

## Propiedades

| Propiedad   | Valores                                                | Predeterminado                                                                                                                                       | Efectos            |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `effect`    | `flow`, `pulse`, `dash`, `trace`                       | obligatorio (`animate.missing-effect`)                                                                                                               | todos              |
| `duration`  | un ciclo, de `100ms` a `60s`                           | el `flowDuration`, `dashDuration`, `pulseDuration` o `traceDuration` del tema; si no, 1200 ms para flow, 1500 ms para trace y 1 s en los demás casos | todos              |
| `repeat`    | `forever` o de 1 a 1000 ciclos                         | `forever`                                                                                                                                            | todos              |
| `delay`     | tiempo antes del primer ciclo, de `0ms` a `60s`        | ninguno                                                                                                                                              | todos              |
| `direction` | `forward` (del origen al destino) o `reverse`          | `forward`                                                                                                                                            | flow, dash, trace  |
| `particles` | de 1 a 8, espaciadas uniformemente                     | 1                                                                                                                                                    | flow               |
| `color`     | un color entre comillas o un token de color (`accent`) | el `accent` del tema, que se ve sobre cualquier línea o contorno                                                                                     | flow, pulse, trace |

Una propiedad que no se aplica al efecto del bloque es `prop.invalid-value`.

Una partícula del flujo es un disco de radio `max(4, 1,5 × ancho)` sobre una línea de ese ancho (4
en el conector predeterminado de 1,3), así que se ve en un GIF de 960 × 540; un trazo en movimiento
conserva el color de su línea, porque anima la línea misma.

## Destinos y canales

| Efecto  | Dibuja                                                                                              | Destinos                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `flow`  | partículas a lo largo del conector, bajo su etiqueta                                                | relaciones con nombre, líneas libres, lápices, mensajes de secuencia y relaciones C4                                 |
| `dash`  | un trazo de 8 y un hueco de 6 que se mueven a lo largo de la línea o del contorno                   | relaciones con nombre, líneas libres, lápices y elementos con contorno, notas, textos y notas adhesivas con contorno |
| `pulse` | un halo que crece un 15 % y se desvanece, o un resplandor a lo largo de una relación o de una línea | elementos, relaciones con nombre, líneas libres, lápices, y notas y fragmentos con nombre                            |
| `trace` | un resaltado que llena el conector desde su inicio y luego se desvanece                             | relaciones con nombre, líneas libres, lápices, mensajes de secuencia y relaciones C4                                 |

Una `line` libre ([free.md](free.md#líneas)) o un lápiz ([free.md](free.md#trazos-de-lápiz)) se
anima como una relación: las partículas, el trazo, el resplandor y el recorrido avanzan por su
línea dibujada, desde su primer punto hasta el último (al revés con `direction reverse`); en un
lápiz siguen la curva suavizada, no los tramos rectos entre sus puntos. Cualquier otro destino es
`animate.invalid-target`: partículas o un recorrido en una caja o en un texto, cuyo mensaje dice
que recorren relaciones, líneas y lápices, un trazo en movimiento en un icono o en una nota, un
texto o una nota adhesiva sin contorno. Cada efecto controla un canal, así que un destino puede
tener a la vez partículas, un trazo en movimiento, un pulso y un recorrido, pero un segundo
efecto del mismo tipo en el mismo destino es `animate.conflict`, dondequiera que esté escrito. Una
nota o un texto tiene contorno para un trazo en movimiento cuando un `style`, una clase o una `rule`
del diagrama fija su `fill`, `stroke` o `pattern`, y una nota adhesiva, siempre rellena, cuando
fijan su `stroke`; los iconos, las imágenes y las figuras de palitos de los diagramas de secuencia
nunca lo tienen.

Las animaciones son la última capa de la precedencia de estilos: mientras un efecto se ejecuta, su
trazo reemplaza el estilo de línea escrito del destino; fuera de su ventana de tiempo, el destino se
dibuja exactamente con su estilo.

## El reloj

El tiempo empieza en 0. En un efecto con retraso `d`, duración `D` y `repeat n`, el destino se dibuja
sin el efecto antes de `d` y a partir de `d + n·D`; entre medias, la fase es `((t − d) mod D) / D`,
y todas las curvas son lineales.

| Efecto | En la fase `p`                                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flow   | la partícula `i` de `k` en `(p + i/k)` de la longitud del trayecto (`1 −` eso, en sentido inverso)                                                                                                                                                                           |
| dash   | desplazamiento del trazo `−14·p` (`+14·p` en sentido inverso)                                                                                                                                                                                                                |
| pulse  | halo escalado `1 + 0.15·p` con opacidad `0.7·(1 − p)`; en una relación, un resplandor 6 px más ancho con opacidad `0.5·(1 − p)`                                                                                                                                              |
| trace  | fracción recorrida `g = min(1, p / 0.8)` del trayecto (desde su final, en sentido inverso): el trayecto 2 px más ancho con un trazo tan largo como el trayecto en el desplazamiento `L·(1 − g)`, y un punto en `g`; opacidad 1, y luego `(1 − p) / 0.2` después de `p = 0.8` |

Un recorrido se dibuja dentro del grupo de su relación, debajo de la etiqueta, para que la etiqueta
siga siendo legible; las demás superposiciones se dibujan encima de todo.

## Exportaciones

| Comando                                           | Resultado                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm mdg export sheet.meltemi`                   | el dibujo estático, sin efectos                                                                             |
| `pnpm mdg export sheet.meltemi --motion animated` | el perfil de SVG animado, descrito más abajo                                                                |
| `pnpm mdg export sheet.meltemi --at 1.5s`         | el dibujo a los 1,5 s: partículas, trazos, halos y recorridos donde estén en ese instante                   |
| `pnpm mdg export sheet.meltemi --format html`     | un reproductor HTML de los efectos, con reproducir, pausar y una vista estática ([player.md](../player.md)) |

El perfil de SVG animado es un subconjunto explícito: un elemento `<style>` con fotogramas clave CSS
sobre `opacity`, `offset-path`/`offset-distance`, `stroke-dasharray`/`stroke-dashoffset` y
`transform: scale`, temporización lineal, y sin scripts ni SMIL. Las superposiciones son invisibles
fuera de sus fotogramas clave, así que lo que se ve es el dibujo estático antes de un retraso,
después del último ciclo, donde no se admiten la animación CSS ni las trayectorias de movimiento, y
cuando quien lo ve pide movimiento reducido (`prefers-reduced-motion`). Está pensado para
navegadores y páginas web; los documentos y las diapositivas deberían usar la exportación estática
o un fotograma.

## En el editor

El inspector lista los efectos que admite un elemento, una relación, un mensaje, una nota o un
fragmento seleccionado (Partículas, Trazo en movimiento, Pulso, Recorrido) con sus propiedades; un
objetivo sin id, como una relación que escribió una importación o una relación del modelo de una
vista C4, se nombra primero en la misma edición. **Reproducir los efectos**, en la barra de
herramientas del lienzo, los ejecuta en el lienzo hasta que se vuelve a pulsar
([editor.md](../editor.md)).

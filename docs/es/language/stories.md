# Historias

[English](../../language/stories.md)

Una `story` cuenta un diagrama paso a paso: escenas que revelan, resaltan, recorren y dibujan
partes de él, mueven la cámara y cambian a otra vista del mismo sistema. Una historia nunca cambia
sus diagramas; los dibuja fotograma a fotograma con el mismo reloj determinista que los efectos
de movimiento ([motion.md](motion.md)), así que el lienzo, los fotogramas exportados, el
reproductor y los videos muestran el mismo estado en el mismo instante.

```text
story purchase for checkout {
  title "A purchase"

  scene overview {
    reveal client, api, orders, db over 800ms
    hold 1s
  }

  scene processing {
    trace request over 1200ms
    trace create over 1200ms
    parallel {
      trace save over 1200ms
      highlight db over 1200ms
    }
    hold 2s
  }
}
```

La historia dura 7,4 s: `overview` ocupa 0,8 + 1 s, y `processing`, 1,2 + 1,2 + 1,2 + 2 s.

Un archivo puede tener varias historias del mismo diagrama: los flujos de un mismo dibujo, cada uno
con sus escenas sobre la misma imagen (una compra, una devolución, una caída). El lienzo reproduce
cualquiera desde su selector de historias, `--stories` las escribe en un reproductor HTML cuyo
selector **Historia** ofrece cada flujo ([player.md](../player.md#varias-historias)), y
**Nueva historia** en el lienzo empieza la siguiente sin escribir su bloque a mano.

## Estructura

| Instrucción                                 | Dónde                         | Significado                                                                                 |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `story <id> for <diagram> { ... }`          | nivel superior                | una historia sobre un diagrama del archivo o uno importado (`checkout`, `views.containers`) |
| `title "..."`, `description "..."`          | historia                      | los muestran el reproductor y el lienzo                                                     |
| `scene <id> ["Title"] { ... }`              | historia                      | un paso; secuencial salvo que declares un solapamiento                                      |
| `view <diagram>`                            | lo primero de la escena       | el diagrama que muestra esta escena; las escenas siguientes lo conservan                    |
| `overlap <time>`                            | escena, antes de las acciones | empieza antes de que termine la anterior                                                    |
| `transition cut\|fade\|morph [over <time>]` | escena, antes de las acciones | cómo la vista de la escena reemplaza a la anterior                                          |
| `parallel { ... }`                          | escena, parallel              | acciones que empiezan a la vez; el bloque dura tanto como su acción más larga               |

Los tiempos se escriben `800ms` o `1.5s`, de `0ms` a `600s`.

## Escenas solapadas

Las escenas son secuenciales por defecto. Agrega `overlap 2s` antes de las acciones de una escena
para iniciarla dos segundos antes de que termine la anterior. Ambas se ejecutan durante ese
intervalo compartido. No puede superar la duración de ninguna; la primera escena solo admite
cero. Omitirlo o escribir `overlap 0ms` restaura la colocación secuencial. Tres escenas de diez
segundos con solapamientos entrantes de ocho empiezan a los 0, 2 y 4 segundos y terminan a los 14.

```text
story shared for checkout {
  scene development "Development" {
    camera client, api over 1s
    highlight api over 4s
  }
  scene production "Production" {
    overlap 2s
    transition fade over 500ms
    camera db over 1s
    highlight db over 4s
  }
}
```

La segunda escena empieza a los 3 s y la historia termina a los 8 s. Su transición se mezcla
mientras se ejecutan sus acciones: la duración es el mayor de ambos tiempos. Las escenas
secuenciales conservan la transición antes de las acciones. Los destinos distintos se animan
de forma independiente; si dos escenas controlan el mismo canal, tiene prioridad la acción ya
iniciada de la escena posterior. Cámara y visibilidad interpolan desde el estado existente al
inicio de esa acción. Los conflictos dentro de una escena, incluido un bloque paralelo, siguen
produciendo `story.conflict`.

Las imágenes por escena muestran el cierre de la escena solicitada, excluyendo las posteriores
que solapan su final. Los fotogramas normales, videos y reproductor usan el calendario global.
Eliminar o insertar una escena borra el solapamiento entrante de la siguiente al cambiar su predecesora.

## Acciones

| Acción                      | Tiempo predeterminado | Efecto                                                                                                                                     |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `reveal a, b [over <time>]` | 600 ms                | hace aparecer los destinos con un fundido; un destino cuya primera acción de visibilidad es `reveal` empieza oculto                        |
| `hide a, b [over <time>]`   | 600 ms                | hace desaparecer los destinos con un fundido                                                                                               |
| `highlight a [over <time>]` | 1000 ms               | contornea los destinos con el color de acento, con una entrada y una salida graduales de min(200 ms, un cuarto del tiempo)                 |
| `focus a, b [over <time>]`  | 600 ms                | atenúa al 25 % todo salvo los destinos y las relaciones entre ellos, hasta el final de la escena; `focus all` lo anula                     |
| `camera a, b [over <time>]` | 800 ms                | mueve el encuadre a los límites de los destinos más 40 px, con la relación de aspecto del dibujo; `camera all` encuadra la vista completa  |
| `trace r [over <time>]`     | 1200 ms               | dibuja una relación desde su origen hasta su destino con el color de acento, 2 px más ancha, con un punto en el extremo que avanza         |
| `draw a, b [over <time>]`   | 800 ms                | vuelve a dibujar lápices, líneas libres y relaciones con nombre desde su primer punto hasta el último, uno tras otro, y los deja dibujados |
| `hold <time>`               | —                     | espera                                                                                                                                     |

Los destinos son los ids de la vista de la escena: elementos, relaciones con nombre, y notas y
fragmentos con nombre de los diagramas de secuencia; en una vista C4, rutas de entidades como
`shop.api`. Las acciones sucesivas se suman; la escena siguiente empieza cuando termina la anterior.
Todas las curvas son lineales. Una relación se dibuja con la opacidad de su extremo menos visible,
así que revelar dos cajas revela las flechas entre ellas. Un recorrido suspende los efectos
`animate` propios de la relación mientras dura; los demás efectos de las vistas se ejecutan con el
reloj de la historia.

`draw` vuelve a dibujar lo que se dibujó en una pizarra ([free.md](free.md#trazos-de-lápiz)): una
explicación escrita con lápices se convierte en una historia, en un SVG animado y en un video.

```text
diagram whiteboard: free {
  theme "sketch.light"

  sticky idea "Ship it"
  pen title [(40, 40), (80, 30), (120, 44), (160, 36)]
  pen arrow [(40, 120), (120, 110), (200, 124)]

  placement {
    place idea at (340, 120)
  }

  style arrow { arrowhead triangle }
}

story explain for whiteboard {
  scene strokes {
    draw title, arrow over 2s
    reveal idea
  }
}
```

- **Orden y tiempo.** Los destinos se dibujan uno tras otro en el orden escrito, cada uno durante
  una parte del tiempo proporcional a la longitud de su línea, así que una palabra larga toma la
  mayor parte y un punto aparece en su turno; cuando ninguno tiene longitud, se reparten el tiempo
  por igual. Cada uno crece desde su primer punto hasta el último con su propio color, ancho, línea
  y opacidad, y sus puntas y su etiqueta aparecen cuando está completo.
- **Visibilidad.** Un destino cuya primera acción de visibilidad es `draw` empieza oculto, como con
  `reveal`, y sigue dibujado después de su parte. `draw` usa los canales de visibilidad y de
  recorrido de sus destinos, así que un `reveal` o un `trace` del mismo destino al mismo tiempo en una escena es
  `story.conflict`.
- **Efectos.** Mientras un destino se dibuja, sus propios efectos `animate` quedan suspendidos, como
  durante un recorrido.
- **Destinos.** Lápices, líneas libres y relaciones con nombre; cualquier otra cosa es
  `story.invalid-target`, que dice que `draw` admite trazos de lápiz, líneas y relaciones.

En un diagrama de Gantt ([gantt.md](gantt.md#efectos-e-historias)) las secciones, las tareas, los
hitos y las marcas son elementos, así que `reveal`, `hide`, `highlight`, `focus` y `camera` los
aceptan, y una sección se oculta y se enfoca con sus tareas y sus flechas. Dos acciones conocen los
diagramas de Gantt:

- `draw <task>[, <task>…]` hace crecer cada barra desde su inicio hasta su final como un recorte que
  se ensancha de izquierda a derecha, una tarea tras otra en partes del tiempo proporcionales al
  ancho de las barras, y la deja dibujada; una tarea cuya primera acción es `draw` empieza oculta.
  En una sección, un hito o una marca es `story.invalid-target`, que dice que `draw` admite trazos de
  lápiz, líneas, relaciones y tareas de Gantt.
- `trace <task>` (o un hito) ilumina las flechas de la cadena que lo determina: desde él, la
  predecesora que termina última, y así hasta el comienzo, la más temprana primero, una tras otra, cada
  una en una parte del tiempo proporcional a su longitud, hasta que la acción termina. Una tarea o un
  hito sin flechas, una sección o una marca es `story.invalid-target`.

Ninguna acción atenúa ni oculta el eje, su cuadrícula ni sus etiquetas.

## Transiciones

Una escena cuya vista difiere de la vista de la escena anterior necesita una transición
(`story.missing-transition`):

| Transición | Tiempo predeterminado | Efecto                                                                                                                         |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cut`      | 0                     | cambia de inmediato                                                                                                            |
| `fade`     | 800 ms                | hace un fundido cruzado entre los dos dibujos                                                                                  |
| `morph`    | 800 ms                | mueve cada elemento que dibujan las dos vistas (mismo id) de su caja antigua a la nueva y hace un fundido cruzado con el resto |

En las escenas secuenciales, la transición abre la escena y sus acciones van después. Con
solapamiento positivo, transición y acciones empiezan juntas. Una cámara fijada en una vista no
se traslada a otra.

## Reglas

| Código                     | Cuándo                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `story.unknown-diagram`    | el diagrama después de `for` o `view` no está en el archivo ni se importa; la pista lista los diagramas                                 |
| `ref.unknown-element`      | un destino no es un id de la vista de la escena; se sugieren ids parecidos                                                              |
| `story.invalid-target`     | `trace` nombra algo que no es una relación, o `draw` algo que no es un lápiz, una línea libre ni una relación                           |
| `story.missing-transition` | la vista cambia sin una `transition`                                                                                                    |
| `story.conflict`           | dos acciones dentro de una escena se superponen sobre el mismo canal del mismo destino (`reveal db` y `hide db` en un mismo `parallel`) |
| `story.empty-scene`        | advertencia: una escena sin acciones ni transición no dura nada                                                                         |
| `prop.invalid-value`       | un tiempo mal formado o fuera de rango, o una instrucción en el lugar equivocado                                                        |

Los canales son la visibilidad (`reveal`, `hide`), el resaltado y el recorrido, por destino
(`draw` toma la visibilidad y el recorrido), y el foco y la cámara, por vista. Una historia de un
diagrama importado cuya importación no se resuelve la informa la importación, no la historia.

## Exportaciones

| Comando                                                              | Resultado                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `mdg export purchase.meltemi --story purchase`                       | `purchase.purchase.svg`, el final de la historia            |
| `mdg export purchase.meltemi --story purchase --at 500ms`            | el fotograma a los 500 ms                                   |
| `mdg export purchase.meltemi --story purchase --format html`         | `purchase.purchase.html`, el reproductor HTML               |
| `mdg export purchase.meltemi --story purchase --at 3s --format png`  | el fotograma a los 3 s en PNG (o `pdf`)                     |
| `mdg export purchase.meltemi --story purchase --format mp4`          | la historia completa como video de 1080p (o `webm`, `gif`)  |
| `mdg export purchase.meltemi --story purchase --scenes`              | `purchase.purchase.overview.svg` y uno por escena           |
| `mdg export purchase.meltemi --story purchase --scenes --format pdf` | `purchase.purchase.pdf`, una página por escena              |
| `mdg export flows.meltemi --stories`                                 | `flows.stories.html`, todas las historias en un reproductor |

`--story` escribe un fotograma, así que no se puede combinar con `--diagram`, `--scenario` ni
`--motion animated`; `--out` admite un archivo o una carpeta existente, y `--stdout` imprime el SVG.
`--scenes` escribe en cambio el estado final de cada escena, el fotograma que muestra la vista
estática del reproductor: justo antes de que empiece la escena siguiente, y el final para la última.
SVG y PNG dan un archivo por escena, `<stem>.<story>.<scene>.<ext>`, junto al archivo o en la carpeta
que nombra `--out`; PDF da un archivo con una página por escena, todas del tamaño del fotograma más
grande, con cada fotograma ajustado y centrado. `--scenes` no admite `--at`, `--stdout`, `html` ni un
formato de video. `--stories` escribe todas las historias del archivo en un reproductor HTML en el
orden del código, o las que enumera en ese orden (`--stories refund,purchase`), también como
fragmento con `--embed`; una historia que no se puede dibujar se deja fuera y se nombra. Los
perfiles admiten `scenes true` ([export.md](export.md#perfiles)).
`validate` informa los diagnósticos de las historias como cualquier otro. El reproductor HTML
reproduce la historia con pausa, progreso, escenas, movimiento reducido, una vista estática y un
resumen en texto ([player.md](../player.md)); el video y el GIF la graban fotograma a fotograma
([export.md](export.md)).

## Proyectos

Una historia puede contar un diagrama de otro archivo del proyecto mediante una importación:

```text
import context from "../diagrams/context.meltemi"
import "../diagrams/containers.meltemi" as views

story tour for context {
  scene who { reveal customer, shop, bank }
  scene inside {
    view views.containers
    transition morph over 900ms
    reveal shop.web, shop.api, shop.db
  }
}
```

Cambiar el nombre de un elemento, una relación o una entidad lo cambia en las historias de todos los
archivos que lo nombran, y eliminar uno lista las acciones de historia que lo nombran antes de
eliminarlas.

## En el editor

El autocompletado ofrece las instrucciones de historia, las acciones, los tipos de transición y los
ids de la vista de la escena; la información al pasar el puntero da el lugar de cada acción en el
reloj; el esquema lista las historias y las escenas; ir a la definición, las referencias y el cambio
de nombre llevan de un destino de la historia al elemento, también en archivos importados. El lienzo
reproduce una historia en modo de solo lectura con una línea de tiempo: reproducir, pausar,
desplazarse por ella, arrastrar el final de una barra para cambiar su tiempo, y
**Agregar a la escena** para la selección ([editor.md](../editor.md)). **Nueva historia**, junto al
selector de historias, escribe `story story1 for <diagram> { scene scene1 { } }` para el diagrama
que se muestra (o el de la historia que se reproduce) y la reproduce de inmediato, para que
**Agregar a la escena** y el botón de escena la llenen; **Exportar escenas** de la línea de tiempo
escribe una imagen de cada escena, y **Exportar HTML** el reproductor. En el diálogo de exportación
de la aplicación web y en **Exportar el reproductor HTML** de VS Code, **Todas las historias**
escribe el reproductor de todas las historias de un archivo que tiene más de una.

Seleccionar otro diagrama o archivo en el explorador sale del modo historia de inmediato;
**Editar diagrama** en el selector de historias hace lo mismo. Abrir una historia explícitamente
inicia su reproducción otra vez. Si una edición vuelve inválida una historia que sigue presente,
su último fotograma válido permanece hasta poder dibujarla otra vez; eliminarla termina la reproducción.

**Eliminar historia** junto al selector superior, o en el menú del explorador y con la tecla Suprimir,
pide confirmación antes de eliminar esa historia. La confirmación nombra los perfiles de exportación
que deben eliminarse con ella. Conserva sus diagramas, las otras historias y los comentarios ajenos.
Deshacer restaura el texto exacto como una sola edición, sin iniciar la reproducción. Un proyecto de
solo lectura ofrece reproducción y exportación, con los controles de edición ocultos.

Selecciona el nombre de una escena para editar **Duración de la escena (s)**. Es su tiempo total:
transición más acciones secuenciales, con la acción más larga determinando el tiempo de cada bloque
paralelo. Cambiar el total solo ajusta el `hold` final de primer nivel, o agrega uno. Por ejemplo,
`reveal a over 2s` seguido de `hold 1s` suma 3 s; indicar 4 s cambia la pausa a 2 s. Indicar 1 s se
rechaza porque el contenido ya necesita 2 s, y el campo conserva el borrador con el mínimo y una
indicación para corregirlo. No se reescalan acciones. Indicar el mínimo deja un `hold 0ms` final
existente, conservando sus comentarios. Selecciona la barra de una acción o transición fade/morph
para editar **Duración de la acción seleccionada (s)**; los totales paralelos se calculan y las
transiciones cut siguen siendo instantáneas. También puedes arrastrar el final de una barra.
Entrar o salir del campo confirma una sola vez; Escape o cancelar el arrastre no escribe cambios.

Arrastra el cuerpo de una acción de primer nivel para insertarla antes o después de otra de la
misma escena. Su duración se conserva y los inicios secuenciales se recalculan. La vista previa
del destino indica el nuevo inicio. **Mover antes** / **Mover después** y Alt+Izquierda/Derecha
permiten la misma edición de una posición sin arrastrar. La cabecera **En paralelo** mueve todo su
bloque; los hijos siguen simultáneos y sus controles de duración funcionan igual. Las sentencias
de vista y las transiciones permanecen al inicio. Reordenar no inventa inicios de acciones ni
bloques paralelos. El extremo derecho sigue editando la duración. Escape, soltar fuera,
una actualización del texto o navegar cancela el movimiento; soltar correctamente produce una
edición con Deshacer exacto, conservando comentarios y contenido ajeno.

**Escena seleccionada** elige explícitamente qué se edita; su fila conserva la selección y las
filas activas en reproducción se marcan por separado. **Nombre de la historia** y **Nombre de la
escena** cambian títulos visibles sin modificar identificadores. Ajusta la altura desde el
separador superior con ratón o teclado. **Eliminar escena** pertenece al panel inferior y conserva
su historia; la historia se elimina arriba o en el explorador. Una historia vacía ofrece **Nueva escena**.

En **Inicio de la escena**, elige Secuencial/Solapar y el tiempo compartido en segundos; después
configura la transición y su duración. Los campos muestran los tiempos calculados y rechazan
valores fuera de los límites de ambas escenas. **Exportar HTML** abre el selector para esa historia;
sus opciones controlan encabezado, resumen, detalles y reproducción. El reproductor exportado
permite pantalla completa.

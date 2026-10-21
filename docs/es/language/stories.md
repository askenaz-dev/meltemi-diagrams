# Historias

[English](../../language/stories.md)

Una `story` cuenta un diagrama paso a paso: escenas que revelan, resaltan y recorren partes de él,
mueven la cámara y cambian a otra vista del mismo sistema. Una historia nunca cambia sus diagramas;
los dibuja fotograma a fotograma con el mismo reloj determinista que los efectos de movimiento
([motion.md](motion.md), decisión 0023), así que el lienzo, un fotograma exportado en un instante y,
más adelante, el reproductor y los videos muestran el mismo estado en el mismo instante.

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

## Estructura

| Instrucción                                 | Dónde                         | Significado                                                                                 |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `story <id> for <diagram> { ... }`          | nivel superior                | una historia sobre un diagrama del archivo o uno importado (`checkout`, `views.containers`) |
| `title "..."`, `description "..."`          | historia                      | los muestran el reproductor y el lienzo                                                     |
| `scene <id> ["Title"] { ... }`              | historia                      | un paso; las escenas se ejecutan una después de otra                                        |
| `view <diagram>`                            | lo primero de la escena       | el diagrama que muestra esta escena; las escenas siguientes lo conservan                    |
| `transition cut\|fade\|morph [over <time>]` | escena, antes de las acciones | cómo la vista de la escena reemplaza a la anterior                                          |
| `parallel { ... }`                          | escena, parallel              | acciones que empiezan a la vez; el bloque dura tanto como su acción más larga               |

Los tiempos se escriben `800ms` o `1.5s`, de `0ms` a `600s`.

## Acciones

| Acción                      | Tiempo predeterminado | Efecto                                                                                                                                    |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `reveal a, b [over <time>]` | 600 ms                | hace aparecer los destinos con un fundido; un destino cuya primera acción de visibilidad es `reveal` empieza oculto                       |
| `hide a, b [over <time>]`   | 600 ms                | hace desaparecer los destinos con un fundido                                                                                              |
| `highlight a [over <time>]` | 1000 ms               | contornea los destinos con el color de acento, con una entrada y una salida graduales de min(200 ms, un cuarto del tiempo)                |
| `focus a, b [over <time>]`  | 600 ms                | atenúa al 25 % todo salvo los destinos y las relaciones entre ellos, hasta el final de la escena; `focus all` lo anula                    |
| `camera a, b [over <time>]` | 800 ms                | mueve el encuadre a los límites de los destinos más 40 px, con la relación de aspecto del dibujo; `camera all` encuadra la vista completa |
| `trace r [over <time>]`     | 1200 ms               | dibuja una relación desde su origen hasta su destino con el color de acento, 2 px más ancha, con un punto en el extremo que avanza        |
| `hold <time>`               | —                     | espera                                                                                                                                    |

Los destinos son los ids de la vista de la escena: elementos, relaciones con nombre, y notas y
fragmentos con nombre de los diagramas de secuencia; en una vista C4, rutas de entidades como
`shop.api`. Las acciones sucesivas se suman; la escena siguiente empieza cuando termina la anterior.
Todas las curvas son lineales. Una relación se dibuja con la opacidad de su extremo menos visible,
así que revelar dos cajas revela las flechas entre ellas. Un recorrido suspende los efectos
`animate` propios de la relación mientras dura; los demás efectos de las vistas se ejecutan con el
reloj de la historia.

## Transiciones

Una escena cuya vista difiere de la vista de la escena anterior necesita una transición
(`story.missing-transition`):

| Transición | Tiempo predeterminado | Efecto                                                                                                                         |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cut`      | 0                     | cambia de inmediato                                                                                                            |
| `fade`     | 800 ms                | hace un fundido cruzado entre los dos dibujos                                                                                  |
| `morph`    | 800 ms                | mueve cada elemento que dibujan las dos vistas (mismo id) de su caja antigua a la nueva y hace un fundido cruzado con el resto |

La transición abre la escena; sus acciones van después. Una cámara fijada en una vista no se
traslada a otra.

## Reglas

| Código                     | Cuándo                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `story.unknown-diagram`    | el diagrama después de `for` o `view` no está en el archivo ni se importa; la pista lista los diagramas                         |
| `ref.unknown-element`      | un destino no es un id de la vista de la escena; se sugieren ids parecidos                                                      |
| `story.invalid-target`     | `trace` nombra algo que no es una relación                                                                                      |
| `story.missing-transition` | la vista cambia sin una `transition`                                                                                            |
| `story.conflict`           | dos acciones sobre el mismo canal del mismo destino se superponen en el tiempo (`reveal db` y `hide db` en un mismo `parallel`) |
| `story.empty-scene`        | advertencia: una escena sin acciones ni transición no dura nada                                                                 |
| `prop.invalid-value`       | un tiempo mal formado o fuera de rango, o una instrucción en el lugar equivocado                                                |

Los canales son la visibilidad (`reveal`, `hide`), el resaltado y el recorrido, por destino, y el
foco y la cámara, por vista. Una historia de un diagrama importado cuya importación no se resuelve
la informa la importación, no la historia.

## Exportaciones

| Comando                                                                  | Resultado                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm mdg export purchase.meltemi --story purchase`                      | `purchase.purchase.svg`, el final de la historia           |
| `pnpm mdg export purchase.meltemi --story purchase --at 500ms`           | el fotograma a los 500 ms                                  |
| `pnpm mdg export purchase.meltemi --story purchase --format html`        | `purchase.purchase.html`, el reproductor HTML              |
| `pnpm mdg export purchase.meltemi --story purchase --at 3s --format png` | el fotograma a los 3 s en PNG (o `pdf`)                    |
| `pnpm mdg export purchase.meltemi --story purchase --format mp4`         | la historia completa como video de 1080p (o `webm`, `gif`) |

`--story` escribe un fotograma, así que no se puede combinar con `--diagram`, `--scenario` ni
`--motion animated`; `--out` admite un archivo o una carpeta existente, y `--stdout` imprime el SVG.
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
**Agregar a la escena** para la selección ([editor.md](../editor.md)).

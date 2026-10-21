# Si vienes de un editor visual

[English](../../tracks/from-visual-editors.md)

Dibujas con el mouse en herramientas como draw.io, Lucidchart, Visio o Excalidraw, y te importa
cómo se ve la imagen. Meltemi Diagrams tiene un lienzo que funciona como esperas (arrastrar, cambiar
el tamaño, ajustar a la cuadrícula, alinear, agrupar, trazar la ruta de un conector), y cada gesto
escribe un cambio pequeño y limpio en un archivo de texto. Ese archivo es lo que permite revisar,
reutilizar y animar los diagramas.

## Lo que no cambia

- Un lienzo con una cuadrícula de 14 px, guías, zoom, desplazamiento, un minimapa, una paleta, un
  inspector y manejo completo con el teclado ([editor](../editor.md)).
- Formas, iconos, grupos, capas, temas y exportaciones a SVG, PNG y PDF.
- Composiciones libres para diapositivas: coloca cada cosa exactamente donde la quieras
  ([composiciones libres](../language/free.md)).

## Lo que es distinto

- **El archivo es el código fuente.** Cada movimiento, cambio de tamaño, ruta o cambio de etiqueta
  es una edición del texto `.meltemi`, que se muestra junto al lienzo. Deshacer funciona en ambos.
  Los comentarios y el formato del archivo se conservan.
- **Primero el significado, después el aspecto.** Una caja en una vista C4 es una entidad de un
  modelo; un mensaje en un diagrama de secuencia tiene un orden. El lienzo mantiene intacto el
  significado: mover un mensaje nunca reordena la conversación, y cambiar el nombre de una entidad
  la renombra en todas partes.
- **Los estilos vienen de los temas y las clases.** En lugar de dar formato a cada forma, dale una
  clase o confía en el tema; un solo cambio cambia el estilo de todos los diagramas
  ([estilos](../language/styles.md)).
- **Los diagramas se mueven.** Los efectos a lo largo de los conectores y las historias con escenas,
  cámara y transiciones se exportan como reproductor HTML, MP4, WebM o GIF
  ([historias](../language/stories.md)).

## Para empezar

No hay importador para los archivos de draw.io, Lucidchart o Visio: la importación universal queda
fuera de la 1.0 ([compatibilidad](../compatibility.md)). En su lugar, empieza desde una plantilla,
en el [playground](../playground.md) sin instalar nada, o en local:

```bash
meltemi-diagrams init my-diagrams --template free
```

Luego abre la hoja en VS Code con el lienzo junto al código, y dibuja. La paleta agrega cajas,
texto, iconos y grupos; el inspector establece etiquetas, formas, colores y efectos. Mira el código:
es la misma imagen, puesta por escrito.

## Tus costumbres, aquí

| En un editor visual                   | En Meltemi Diagrams                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Arrastrar una forma                   | arrastra en el lienzo; el archivo recibe `place id at (x, y)`                             |
| Cambiar el tamaño                     | arrastra un tirador; el archivo recibe `size id (w, h)`                                   |
| Conectar dos formas                   | arrastra desde los puntos junto a una caja seleccionada hasta otra; `a -> b`              |
| Doblar un conector                    | arrastra su codo; el archivo recibe `route r from a.east to b.west via [...]`             |
| Mover la etiqueta de un conector      | arrastra la etiqueta; el archivo recibe `label r at 40% offset (dx, dy)`                  |
| Alinear y distribuir                  | Ctrl+Mayús+flechas, o las restricciones `align`, `row` y `column`                         |
| Agrupar formas                        | selecciónalas y presiona Alt+G; el archivo recibe `group group1 "Group" { ... }`          |
| Elegir una forma del panel            | la flecha del botón de caja, o F; el archivo recibe `style box1 { shape hexagon }`        |
| Soltar una forma en un contenedor     | arrástrala sobre un grupo; su declaración pasa al bloque del grupo                        |
| Rectángulos simples anidados          | grupos sin título, `group g "" { ... }`, con `fill` y `radius 0`                          |
| Una banda detrás de una fila de cajas | un grupo sin título con `place`, `size` y `layer back`                                    |
| Radio de las esquinas                 | el control deslizante **Radio de las esquinas**; el archivo recibe `style a { radius 4 }` |
| Seleccionar la forma de debajo        | Alt+clic, o **Seleccionar la forma de debajo** en el menú contextual                      |
| Traer al frente, enviar al fondo      | las teclas de orden mueven la declaración; las capas, con el campo **Capa**               |
| Copiar formato                        | clases: `class highlight { fill accent }` y `{ class highlight }`                         |
| Exportar PNG con fondo transparente   | `--format png --background transparent`                                                   |
| Presentar                             | una historia reproducida en el reproductor HTML o exportada como video                    |

## Primeras cosas que probar

1. Abre la diapositiva de la plantilla `free`, mueve las cajas y cambia una etiqueta en el
   inspector; lee el diff del archivo.
2. Cambia el tema en una línea (`theme "editorial.dark"`) y vuelve a exportar la diapositiva.
3. Agrega `animate <relation> { effect flow }` a un conector y exporta un SVG animado
   (`--motion animated`) o un GIF.

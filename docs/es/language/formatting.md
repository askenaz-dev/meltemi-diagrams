# Formato

[English](../../language/formatting.md)

`meltemi-diagrams format` reescribe los archivos `.meltemi` con una forma canónica. Dar formato es
una acción aparte: las ediciones visuales del editor solo cambian los tokens que necesitan y nunca
vuelven a dar formato a un archivo.

```bash
pnpm mdg format diagrams/checkout.meltemi
```

```bash
pnpm mdg format --check architecture/
```

## Reglas

| Situación               | Forma canónica                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sangría                 | dos espacios por nivel de bloque, o el `format.indent` del proyecto (de 1 a 8 espacios, o `"tab"`)                                       |
| Tokens en una línea     | un espacio entre ellos                                                                                                                   |
| Sin espacio             | antes de `,` `;` `:` `.` `)` `]`, después de `(` `[` `.`, y entre un id y su `[` abreviado (`api["API"]`)                                |
| Bloque en una línea     | se queda en una línea: `api["API"] { description "REST" }`, `{ }`                                                                        |
| Bloque en varias líneas | `{` termina la línea, una instrucción por línea un nivel más adentro, `}` en su propia línea; `} else "B" {` sigue unido                 |
| `;`                     | las instrucciones unidas con `;` se quedan en una línea: `place a at (1, 2); size a (160, 56)`                                           |
| Lista en varias líneas  | `via [` termina la línea, un elemento por línea un nivel más adentro, `]` en su propia línea                                             |
| Puntos de un lápiz      | una línea cuando la instrucción `pen` cabe en 100 columnas; si no, rellenada, como abajo                                                 |
| Líneas en blanco        | como máximo una seguida; ninguna justo después de `{` ni antes de `}`; exactamente una entre bloques de nivel superior                   |
| Comentarios             | se conservan en su lugar y en su orden; un espacio antes de un comentario `//` al final de la línea; los comentarios de bloque, tal cual |
| Finales de línea        | sin espacios al final, el primer fin de línea del archivo en todas partes, un salto de línea final, y se conserva la BOM                 |

El formateador nunca cambia el texto ni el orden de los tokens, nunca descarta un comentario y da el
mismo resultado si se ejecuta dos veces. Los archivos con errores de sintaxis se rechazan y quedan
sin cambios (`format.syntax-errors`).

### Instrucciones `pen`

Una instrucción `pen` ([free.md](free.md#trazos-de-lápiz)) contiene los puntos de un trazo, a
menudo cuarenta o más, así que su lista se rellena en lugar de imprimirse con un elemento por
línea. Se haya escrito como se haya escrito, la lista va en una línea cuando la instrucción entera,
con su bloque, cabe en 100 columnas con su sangría. Si no, `[` termina la primera línea de la
instrucción, las tuplas siguen un nivel más adentro, tantas en cada línea como quepan en 100
columnas, separadas por `, `, y `]` va en su propia línea, seguido del bloque cuando lo hay:

```text
diagram notes: free {
  pen tick [(0, 0), (10, 10), (20, 0)]
  pen word [
    (12, 40), (14.5, 31), (18, 24), (23, 21), (28, 24), (30, 32), (29.5, 41), (33, 47), (39, 45),
    (44, 38), (47, 29), (50, 22), (55, 21), (58, 27), (58.5, 36), (62, 44), (68, 46), (74, 41)
  ] { layer main }
}
```

- La coma que sigue a la última tupla de una línea se queda al final de esa línea. El formateador
  conserva los tokens que recibe, así que no agrega ni quita ninguna coma: la última línea termina
  con una solo cuando el código fuente tiene una antes de `]`.
- Un tabulador cuenta como 4 columnas al medir una línea, con `format.indent` en `"tab"`.
- Un comentario de línea dentro de la lista, o un comentario de bloque en una línea propia, hace
  que la lista se rellene; el comentario se conserva.
- La decisión depende solo de los tokens y la profundidad de la instrucción, nunca de los saltos de
  línea del código fuente, así que volver a dar formato al resultado no cambia nada. Las listas
  `via` siguen la regla de arriba.

## Ajuste del proyecto

```json
{ "name": "commerce", "language": "0.2", "format": { "indent": 4 } }
```

## Comando

| Opción     | Efecto                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| (ninguna)  | reescribe los archivos que cambian e imprime `Formatted <path>` y `Formatted N of M files.` |
| `--check`  | no escribe nada; imprime `Would format <path>`; sale con 1 cuando un archivo cambiaría      |
| `--stdout` | imprime el texto con formato de exactamente un archivo                                      |

A las carpetas se les da formato como proyectos, a través de sus archivos fuente. Códigos de salida: 0 al
terminar, 1 cuando se rechaza un archivo o `--check` encuentra cambios, 2 ante errores de uso.

## Para herramientas

`formatSource(text, { indent })` de `@meltemi/diagrams-language` devuelve el texto, `changed` y
`edits` por rangos de líneas (a partir de un diff de líneas de Myers). Los editores aplican las
ediciones para que los cursores y los plegados fuera de las líneas modificadas no se muevan.

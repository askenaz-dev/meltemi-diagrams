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
| Líneas en blanco        | como máximo una seguida; ninguna justo después de `{` ni antes de `}`; exactamente una entre bloques de nivel superior                   |
| Comentarios             | se conservan en su lugar y en su orden; un espacio antes de un comentario `//` al final de la línea; los comentarios de bloque, tal cual |
| Finales de línea        | sin espacios al final, el primer fin de línea del archivo en todas partes, un salto de línea final, y se conserva la BOM                 |

El formateador nunca cambia el texto ni el orden de los tokens, nunca descarta un comentario y da el
mismo resultado si se ejecuta dos veces. Los archivos con errores de sintaxis se rechazan y quedan
sin cambios (`format.syntax-errors`).

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

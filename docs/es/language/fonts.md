# Fuentes y medición del texto

[English](../../language/fonts.md)

Meltemi Diagrams mide el texto con fuentes reales antes de disponer un diagrama, así que las cajas
se ajustan a sus etiquetas y el archivo exportado se ve igual en todas las máquinas.

## Fuentes incluidas

| Familia       | La usan                                                   | Se mide con                              | Se incrusta desde                        |
| ------------- | --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Inter         | el texto principal de los temas `technical.*` y `stage.*` | la fuente completa (`inter-ui`)          | subconjuntos por escritura de Fontsource |
| IBM Plex Sans | el texto principal de los temas `editorial.*`             | la fuente completa (`@ibm/plex-sans`)    | subconjuntos por escritura de Fontsource |
| Cascadia Mono | las marcas y el texto monoespaciado de todos los temas    | subconjuntos por escritura de Fontsource | subconjuntos por escritura de Fontsource |

Se incluyen los pesos 400, 500, 600 y 700. Todas las fuentes usan la SIL Open Font License 1.1, que
permite incluirlas e incrustarlas en documentos (`THIRD_PARTY_LICENSES.md`).

Los tokens `font` y `mono` de un tema son pilas de fuentes CSS. Para medir se usa la primera familia
de la pila que está incluida (`"Inter", "Segoe UI", sans-serif` mide con Inter). Un carácter que le
falta a la familia se mide con la siguiente familia incluida que lo tiene, como hacen los
navegadores; las flechas como `→` en un texto en Cascadia Mono usan Inter.

## Qué hace la disposición con las medidas

- Las cajas sin `size` crecen para que quepan su etiqueta y sus líneas de descripción, con el
  `padding` del tema a cada lado (16 px en `technical.*`), y crecen en altura para que quepan varias
  líneas de descripción.
- Los grupos sin `size` crecen para que quepa su título.
- Las marcas, las notas y las cápsulas de las etiquetas de las relaciones son tan anchas como su
  texto medido más su margen interior.
- La línea base del texto es el centro del texto más la mitad de la altura de las mayúsculas de la
  fuente, así que el texto queda centrado ópticamente.
- Un `size` explícito que deja menos de 6 px entre el texto y un borde es `layout.text-overflow`
  (advertencia), con una pista que da un ancho en el que cabe. El texto nunca se reduce.
- Una fuente del tema sin ninguna familia incluida, o caracteres que no tiene ninguna fuente incluida
  (emoji, CJK), dan un `layout.unmeasured-font` (información) por diagrama. Ese texto se mide con
  estimaciones.

Las aplicaciones anfitrionas sin fuentes, como una prueba o un script mínimo, pueden disponer los
diagramas con `estimateMeasurer`, que estima los anchos a partir de clases de caracteres.

## Fuentes del proyecto

Las fuentes de `assets/fonts/` de un proyecto (WOFF2, WOFF, TrueType u OpenType) se suman a las
incluidas para las exportaciones de ese proyecto, con la familia, el peso y el estilo que declara
cada fuente, y necesitan una licencia en `assets/licenses.json`. Un tema las usa por su nombre
(`font "'Company Sans', sans-serif"`). La política `embedded` escribe el archivo completo, sin
`unicode-range`. Una fuente cuyo permiso de incrustación (`OS/2 fsType`) está restringido mide el
texto, pero nunca se incrusta ni se convierte en contornos: las exportaciones la nombran, y
`asset.font-restricted` (advertencia) lo indica. Véase [assets.md](assets.md).

## Políticas de fuentes en las exportaciones

| Política   | Qué contiene el SVG                                                                                                                     | Úsala para                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `embedded` | reglas `@font-face` con los archivos de subconjuntos incluidos como URI de datos, limitadas por `unicode-range` a los caracteres usados | documentación, páginas web, GitHub (predeterminada)            |
| `outlined` | cada texto como un `<path>` a partir de los contornos de los glifos, con `aria-label`                                                   | presentaciones y aplicaciones de ofimática                     |
| `system`   | solo los nombres de las fuentes; los visores usan la primera fuente instalada                                                           | los archivos más pequeños, cuando las fuentes están instaladas |

```bash
pnpm mdg export sheet.meltemi --fonts outlined
```

En los archivos `embedded`, los caracteres que solo tienen las fuentes completas (las flechas, por
ejemplo) no forman parte de los subconjuntos pequeños, así que los visores los dibujan con una fuente
de reserva. Aun así, su ancho se mide con exactitud. Los archivos `outlined` dibujan cada carácter
con los contornos incluidos.

## Para herramientas

`@meltemi/diagrams-fonts` proporciona `FontLibrary`, que se construye a partir de un lector de los
archivos de los paquetes de fuentes; `addFont(data, source)` registra una fuente del proyecto y
`embeddable(family)` indica si su texto se puede incrustar o convertir en contornos.
`createNodeFontLibrary()` los lee desde `node_modules`. Implementa el `TextMeasurer` de la
disposición (`width`, `capHeight`, `knows`, `uncovered`) y el `FontProvider` del renderizador
(`family`, `faces`, `outline`).

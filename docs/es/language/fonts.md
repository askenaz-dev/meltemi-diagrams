# Fuentes y medición del texto

[English](../../language/fonts.md)

Meltemi Diagrams mide el texto con fuentes reales antes de disponer un diagrama, así que las cajas
se ajustan a sus etiquetas y el archivo exportado se ve igual en todas las máquinas.

## Fuentes incluidas

| Familia       | La usan                                                   | Se mide con                              | Se incrusta desde                        |
| ------------- | --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Inter         | el texto principal de los temas `technical.*` y `stage.*` | la fuente completa (`inter-ui`)          | subconjuntos por escritura de Fontsource |
| IBM Plex Sans | el texto principal de los temas `editorial.*`             | la fuente completa (`@ibm/plex-sans`)    | subconjuntos por escritura de Fontsource |
| Patrick Hand  | el texto principal de los temas `sketch.*`                | subconjuntos por escritura de Fontsource | subconjuntos por escritura de Fontsource |
| Cascadia Mono | las marcas y el texto monoespaciado de todos los temas    | subconjuntos por escritura de Fontsource | subconjuntos por escritura de Fontsource |

Inter, IBM Plex Sans y Cascadia Mono se incluyen en los pesos 400, 500, 600 y 700. Patrick Hand,
una fuente manuscrita, tiene un solo peso (400) y las escrituras latina, latina extendida y
vietnamita: todos los pesos se miden, se pasan a contornos y se incrustan con ella, y la regla
incrustada cubre de 400 a 700 para que el navegador dibuje una etiqueta más gruesa con el mismo
archivo, sin fabricar una negrita. Todas las fuentes usan la SIL Open Font License 1.1, que permite
incluirlas e incrustarlas en documentos (`THIRD_PARTY_LICENSES.md`).

Los temas `sketch.*` pintan sus trazos a mano y escriben su texto en Patrick Hand, con Inter detrás
en la pila: un carácter que Patrick Hand no tiene, como el griego o el cirílico, se mide con
Inter y, en las exportaciones `outlined`, se dibuja con sus contornos (una exportación
incrustada lo deja al reemplazo del visor). Su texto nunca se dibuja con los trazos a mano, así que se sigue leyendo bien
al tamaño de las etiquetas.

## Familias populares

Se incluyen trece familias más para el texto que elige cada persona, de modo que un título, una
nota o una caja de código pueda tomar una cara conocida de las presentaciones y la web. Vienen de
sus paquetes de Fontsource bajo la SIL Open Font License 1.1 y se miden, incrustan y pasan a
contornos como las cuatro de arriba, desde sus subconjuntos por escritura.

| Grupo       | Familias                                             | Pesos                                     |
| ----------- | ---------------------------------------------------- | ----------------------------------------- |
| Sin serifa  | Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito | de 400 a 700; Lato 400 y 700              |
| Con serifa  | Merriweather, Lora, Playfair Display                 | de 400 a 700                              |
| Monoespacio | Roboto Mono, Source Code Pro                         | de 400 a 700                              |
| Manuscritas | Caveat, Comic Neue                                   | Caveat de 400 a 700; Comic Neue 400 y 700 |

Un peso que le falta a una familia se mide, se pasa a contornos y se incrusta con su peso más
cercano (el más grueso en un empate), y la regla incrustada cubre los pesos pedidos, así que el
navegador nunca fabrica una negrita. Las familias monoespaciadas no tienen ligaduras, así que el
ancho medido con los avances es el ancho dibujado. `meltemi-diagrams assets list` muestra cada
familia incluida con su grupo, sus pesos y su licencia.

## La fuente, el tamaño y el peso de un texto

Tres propiedades de estilo fijan el texto de todo lo que dibuja texto, en todos los perfiles:
nodos, decisiones, almacenes de datos, grupos (su título), notas, etiquetas, relaciones y líneas
libres (su etiqueta), cajas, textos y notas adhesivas libres, participantes, mensajes, notas y
fragmentos de secuencia, y entidades y relaciones C4. Los iconos, las imágenes y los trazos de
lápiz no dibujan texto y las rechazan.

```text
style api { font "Roboto"; fontSize 16; fontWeight 500 }
rule note { font "Caveat" }
```

- `font "<pila>"` es una pila de fuentes CSS entre comillas. El texto se mide solo con la primera
  familia incluida o del proyecto de la pila; una pila sin ninguna (`font "Comic Sans MS"`) se mide
  con estimaciones y se informa una vez por diagrama como `layout.unmeasured-font`. El texto
  exportado nombra la pila escrita seguida de la del tema, así que un visor sin la familia la
  reemplaza como lo hace el tema.
- `fontSize` es un número de 6 a 160 y `fontWeight` uno de 400, 500, 600 y 700. Sin ellas un texto
  conserva el tamaño y el peso de su tema: las etiquetas `labelSize` con `labelWeight`, los textos
  libres 1,6 veces eso, las notas adhesivas 1,2 veces con 400, los títulos de grupo
  `groupTitleSize`, las notas `noteSize` con 400, las etiquetas `tagSize` con 500 en la fuente
  monoespaciada, las etiquetas de relación `relationLabelSize` con 500 (400 en los mensajes de
  secuencia) y el operador de un fragmento con 600.
- Un tamaño escrito escala lo que escala el token del tema: la descripción de una caja con la
  proporción del tema entre descripción y etiqueta, el alto y el relleno de una píldora, la píldora
  de una etiqueta, las líneas de una nota y la banda del título de un grupo. Las cajas, cabeceras,
  notas y píldoras sin `size` crecen para que quepa su texto; un `size` escrito que se queda corto
  es `layout.text-overflow` con un tamaño que cabe.

El lienzo las fija desde el grupo Texto de la tira y su selector de fuentes, y Ctrl+Mayús+. y
Ctrl+Mayús+, cambian un paso el tamaño de la selección ([guía del editor](../editor.md)).

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

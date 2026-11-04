# Exportaciones

[English](../../language/export.md)

Cada diagrama, historia y conjunto de efectos se puede escribir como SVG, PNG, PDF o un reproductor
HTML, desde la línea de comandos o desde el editor. Un perfil `export` describe una entrega de forma
reproducible: qué exporta, el formato y cada opción, así que
`meltemi-diagrams export sheet.meltemi --profiles` escribe los mismos archivos en todas las máquinas
con las mismas herramientas (decisión 0025).

## Desde la línea de comandos

| Comando                                                                         | Resultado                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm mdg export sheet.meltemi`                                                 | `sheet.svg` (véase [svg-export.md](svg-export.md))        |
| `pnpm mdg export sheet.meltemi --format png`                                    | `sheet.png` al doble de tamaño, con el fondo del tema     |
| `pnpm mdg export sheet.meltemi --format png --scale 4 --background transparent` | un PNG a 4 ×, sobre fondo transparente                    |
| `pnpm mdg export sheet.meltemi --format png --size 1920x1080`                   | un PNG de 1920 × 1080 con el dibujo ajustado y centrado   |
| `pnpm mdg export sheet.meltemi --format pdf`                                    | `sheet.pdf`, una página vectorial del tamaño del dibujo   |
| `pnpm mdg export sheet.meltemi --story tour --at 2s --format pdf`               | el fotograma de la historia a los 2 s                     |
| `pnpm mdg export sheet.meltemi --format html --story tour`                      | el reproductor de la historia ([player.md](../player.md)) |
| `pnpm mdg export sheet.meltemi --diagram context --format html`                 | `sheet.context.html`, con todas las vistas que abre       |
| `pnpm mdg export sheet.meltemi --story tour --format mp4`                       | `sheet.tour.mp4`, 1920 × 1080 a 30 fps                    |
| `pnpm mdg export sheet.meltemi --format gif`                                    | un GIF de una vuelta de los efectos del diagrama          |
| `pnpm mdg export sheet.meltemi --format gif --duration 4s`                      | el mismo GIF, de 4 s                                      |
| `pnpm mdg export sheet.meltemi --profile slide`                                 | lo que describe el perfil `slide`                         |
| `pnpm mdg export sheet.meltemi --profiles`                                      | todos los perfiles del archivo                            |

`--background` admite `transparent`, un token de color (`accent`, `canvas`, …) o un color CSS, en
SVG, PNG y PDF; `--link <url>` convierte todo el dibujo SVG o PDF en un enlace. Con perfiles, se
rechazan las demás opciones de salida (las tiene el perfil) y `--out` nombra una carpeta existente.

## PNG y PDF

Los PNG y los PDF los dibuja el Edge, Chrome o Chromium instalado, controlado sin interfaz gráfica
mediante el protocolo DevTools: no se descarga nada y no se abre ninguna ventana. El navegador se
busca en su ubicación habitual, o lo indica `MELTEMI_BROWSER` (y, en VS Code, el ajuste
`meltemi.export.browser`). Cada línea de exportación nombra el navegador y su versión, como
`Wrote sheet.png (Edg/155.0.4283.45)`, porque la propuesta garantiza la reproducibilidad dentro de
un entorno con versiones fijas, no entre navegadores.

- **PNG.** El SVG con las fuentes incrustadas se dibuja una vez cargadas las fuentes y las imágenes,
  a una escala de píxeles (2 de forma predeterminada, de 1 a 8) o con un `size` fijo, con el fondo
  del tema, otro color o un fondo transparente (con canal alfa). Cada lado tiene como mucho 16384
  píxeles: una escala o un tamaño que lo superaría se reduce a lo más grande que cabe, con las
  mismas proporciones, y un aviso nombra los píxeles usados (`Hecho a 16384 × 3641 píxeles, lo más
grande que cabe en el límite de 16384 por lado.`). Una página PDF que supera el límite se reduce
  igual.
- **PDF.** Una página del tamaño del dibujo (o de `size`), impresa como vectores: con las fuentes
  incrustadas, el texto seleccionable y etiquetado, los enlaces `url` como anotaciones de enlace y
  el fondo, salvo que sea transparente.

## Video y GIF

`--format mp4`, `webm` y `gif` graban una historia (`--story`) o los efectos de un diagrama
fotograma a fotograma: cada fotograma `i` se dibuja en el instante `i × 1000 / fps` ms con las
propias funciones del reproductor, en una página del tamaño de salida, después de que carguen sus
fuentes e imágenes; luego el navegador lo captura y lo envía a FFmpeg. La velocidad de la máquina
nunca cambia los tiempos: una historia de 7,4 s a 30 fps tiene 222 fotogramas y dura 7,4 s. FFmpeg
es el del sistema (en el PATH, o `MELTEMI_FFMPEG`; nunca viene incluido); cada línea de exportación
nombra el navegador, la versión de FFmpeg y el número de fotogramas.

| Formato | Predeterminado      | Codificador (decisión 0026)                                                |
| ------- | ------------------- | -------------------------------------------------------------------------- |
| MP4     | 1920 × 1080, 30 fps | H.264 (libx264), CRF 18, yuv420p, inicio rápido; siempre opaco             |
| WebM    | 1920 × 1080, 30 fps | VP9 (libvpx-vp9), CRF 32; con canal alfa cuando `--background transparent` |
| GIF     | 960 × 540, 15 fps   | una paleta hecha para el clip, tramado de Bayer, en bucle                  |

`--size`, `--fps` (de 1 a 60) y `--background` los cambian; un `size` con un lado de más de 16384
píxeles se reduce con las mismas proporciones. Una historia mantiene su propia duración; los efectos
de un diagrama duran hasta que termina el último, o `--duration` indica cuánto. Sin él, los efectos
que se repiten indefinidamente (lo predeterminado) duran una vuelta sin cortes de todos sus ciclos:
el mínimo común múltiplo de sus duraciones después del retraso más largo, 6 s con los valores del
motor (flujo 1,2 s, trazo y pulso 1 s, recorrido 1,5 s); cuando pasaría de 10 s, el ciclo más largo.
Un diagrama sin efectos que se muevan dura 1 s. La exportación dice lo que eligió después de la
línea `Wrote`, en stderr:

```text
Wrote sheet.gif (Edg/155.0.4283.62, FFmpeg 6.1.1, 90 frames)
sheet.gif: The effects of `checkout` repeat forever: the video lasts 6 s, one loop of them.
```

MP4 no admite transparencia: `--background transparent` lo dibuja sobre el fondo del tema y lo
dice. `--at`, `--motion animated` y `--link` no se aplican.

## Perfiles

```text
export slide for checkout {
  format png
  scale 2
  background transparent
  file "slides/checkout.png"
}

export frame for purchase {
  format pdf
  at 4.8s
  link "purchase.purchase.html"   // the frame leads to the story's player
}

export presentation for purchase {
  format mp4
  size (1920, 1080)
  fps 30
}
```

| Opción                      | Formatos                 | Valores                                                                                                                      |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `format`                    | todos                    | `svg`, `png`, `pdf`, `html`, `mp4`, `webm`, `gif`; obligatorio                                                               |
| `size`                      | png, pdf, mp4, webm, gif | `(w, h)`, de 16 a 16384; el dibujo se ajusta y se centra                                                                     |
| `scale`                     | png                      | de 1 a 8; 2 de forma predeterminada                                                                                          |
| `background`                | todos menos html         | `transparent`, un color entre comillas o un token de color; un MP4 toma el fondo del tema en lugar de transparente           |
| `at`                        | svg, png, pdf            | un tiempo; sin él, la vista estática de un diagrama o el final de una historia                                               |
| `motion`                    | svg                      | `static` o `animated`; solo diagramas                                                                                        |
| `theme`                     | todos                    | un nombre de tema                                                                                                            |
| `fonts`                     | svg, html                | `embedded` (predeterminado), `outlined`, `system`                                                                            |
| `scenario`                  | todos                    | un escenario del diagrama de secuencia                                                                                       |
| `link`                      | svg, pdf                 | una URL `https:`, `http:` o `mailto:`, o una relativa                                                                        |
| `fps`                       | mp4, webm, gif           | de 1 a 60; 30 de forma predeterminada                                                                                        |
| `duration`                  | mp4, webm, gif           | un tiempo; sin él, una vuelta de los efectos (o 1 s sin efectos que se muevan)                                               |
| `file`                      | todos                    | una ruta relativa al archivo, sin `..`, que termina en la extensión del formato; `<stem>.<id>.<ext>` de forma predeterminada |
| `autoplay`, `loop`, `embed` | html                     | opciones del reproductor ([player.md](../player.md))                                                                         |

El destino es un diagrama del archivo, un diagrama importado o una historia del archivo. Los ids de
los perfiles comparten el espacio de nombres del archivo.

| Código                  | Cuándo                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `export.unknown-target` | el destino no es un diagrama ni una historia del archivo ni de una importación                                                         |
| `export.missing-format` | el perfil no tiene `format`                                                                                                            |
| `export.invalid-option` | una opción de otro formato; `motion` o `scenario` en una historia; `at` después del final de la historia; un `file` con otra extensión |
| `prop.invalid-value`    | un valor mal formado, un enlace inseguro o un `file` fuera de la carpeta                                                               |

## Enlaces

Los elementos de todos los perfiles, los grupos y las entidades de los modelos admiten
`url "https://…"` (también URL `http:`, `mailto:` y relativas; cualquier otro esquema se rechaza).
El SVG envuelve el dibujo del elemento en `<a href>`; el PDF lo conserva como anotación de enlace y
el reproductor HTML, como enlace. En el reproductor HTML un clic selecciona el elemento y su panel
ofrece **Abrir el enlace**; Ctrl o Cmd y un clic lo siguen. El lienzo nunca los sigue: un clic allí
selecciona.

## En el editor

VS Code tiene **Exportar SVG**, **Exportar PNG**, **Exportar PDF**, **Exportar el reproductor HTML**
y **Ejecutar un perfil de exportación** (todos los perfiles, o uno); el autocompletado, la
información al pasar el puntero y el esquema conocen los perfiles y sus opciones, y el inspector
edita `url` ([editor.md](../editor.md)).

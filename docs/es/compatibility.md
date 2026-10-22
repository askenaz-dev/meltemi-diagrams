# Compatibilidad y limitaciones conocidas

[English](../compatibility.md)

Dónde funciona Meltemi Diagrams 1.0, qué lee y escribe, y qué no hace. "Verificado" significa
comprobado por las pruebas del repositorio o por ejecuciones de verificación en la máquina de
referencia ([decisión 0032](../decisions/0032-reference-machine-and-quality-gates.md)); los
resultados están en [quality/results.md](../quality/results.md).

## Entorno de ejecución

| Componente           | Compatible                                        | Verificado                                                                                               |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Node.js              | 22.12 o posterior (módulos ES)                    | Node 24.15 en Windows 11                                                                                 |
| Sistemas operativos  | Windows, macOS y Linux                            | Windows 11; consulta las limitaciones más abajo                                                          |
| Gestores de paquetes | npm, pnpm y Yarn instalan los paquetes publicados | pnpm 10 (instalación sin conexión de la comprobación de la versión)                                      |
| CI                   | GitHub Actions y GitLab CI (`init --ci`), Node 22 | los archivos de flujo de trabajo se generan y se prueban; aún no se han ejecutado en un servicio alojado |

Nada necesita un servidor ni una cuenta. La red solo se usa para la asistencia de IA opcional, con
el proveedor y la clave que configures ([asistencia](assist.md)), y para la cuenta opcional que
ofrece el playground cuando lo sirve el [servicio en la nube](cloud.md).

## Navegadores y FFmpeg

PNG, PDF y video los captura un navegador instalado en la máquina, que se encuentra automáticamente
o se indica con `MELTEMI_BROWSER`; el video lo codifica un FFmpeg instalado, que se encuentra en el
PATH o se indica con `MELTEMI_FFMPEG`. No se descarga nada.

| Uso                                                                       | Compatible                                               | Verificado                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Capturas (PNG, PDF, fotogramas de video)                                  | Microsoft Edge, Google Chrome, Chromium                  | Edge 155, Chrome 154                                                           |
| Codificación de video                                                     | FFmpeg con libx264 (MP4), libvpx-vp9 (WebM), GIF         | FFmpeg 6.1.1                                                                   |
| Abrir las exportaciones (SVG, PNG, reproductor, catálogo, MP4, WebM, GIF) | las versiones actuales de Edge, Chrome, Firefox y Safari | Edge 155, Chrome 154, Firefox 157 ([navegadores](../verification/browsers.md)) |
| El playground                                                             | las versiones actuales de Edge, Chrome, Firefox y Safari | Edge 155, Chrome 154, Firefox 157; Safari sin verificar                        |

El playground graba WebM y MP4 con los codificadores WebCodecs del navegador; un navegador que no
los tenga desactiva el formato y muestra el comando que lo genera. GIF no necesita codificador.

## Editores

| Editor                                                    | Compatible                                                                                                                   | Verificado                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Visual Studio Code                                        | 1.95 o posterior                                                                                                             | 1.141 (`pnpm vscode:test`) |
| Derivados de VS Code (VSCodium, Cursor, Windsurf y otros) | mediante Open VSX o el `.vsix`, con el mismo motor                                                                           | sin verificar              |
| Otros editores                                            | la línea de comandos y `meltemi-diagrams preview`; los servicios de lenguaje son una biblioteca (`@meltemi/diagrams-editor`) | —                          |

## Archivos

| Formato              | Se lee                                                       | Se escribe                                                                            |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `.meltemi`           | lenguaje 0.2, UTF-8, LF o CRLF                               | lo mismo; las ediciones conservan los comentarios y el formato                        |
| `project.json`       | el [esquema del proyecto](../../schemas/project.schema.json) | lo escriben `init` y el editor                                                        |
| JSON del modelo      | —                                                            | `convert --to json` ([JSON del modelo](language/model-json.md))                       |
| SVG                  | iconos e imágenes de los proyectos (saneados)                | estático o animado, con las fuentes incrustadas, convertidas en contornos o nombradas |
| PNG, JPEG, WebP, GIF | imágenes de los proyectos                                    | PNG, y animaciones GIF                                                                |
| PDF                  | —                                                            | páginas vectoriales con fuentes, texto y enlaces                                      |
| MP4, WebM            | —                                                            | 1080p a 30 fps de forma predeterminada; WebM puede ser transparente                   |
| HTML                 | —                                                            | el reproductor (página o fragmento) y el catálogo                                     |
| Mermaid, PlantUML    | consulta más abajo                                           | —                                                                                     |

## Cobertura de la importación

| Origen        | Se importa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mermaid       | `flowchart` y `graph`, `sequenceDiagram`, los diagramas `C4*`, `architecture-beta`, `block-beta`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PlantUML      | los diagramas de componentes, de despliegue y de casos de uso (diagramas de descripción), los diagramas de secuencia, C4-PlantUML; el preprocesador y las inclusiones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Markdown      | los bloques de Mermaid y de PlantUML de un archivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Formas        | Meltemi dibuja veinticuatro valores de `shape` ([composiciones libres](language/free.md#texto-y-formas)). El hexágono, el paralelogramo, el trapecio, el círculo, el estadio, la subrutina, la forma asimétrica, el documento y el triángulo de Mermaid conservan su dibujo, y sus variantes reflejadas y de doble anillo se dibujan con la forma más cercana; `cloud`, `hexagon`, `usecase`, `interface`, `circle`, `actor`, `person`, `card`, `file` y `folder` de PlantUML conservan un dibujo propio. Los archivos de draw.io no se importan; sus rectángulos, rectángulos redondeados, cuadrados, elipses, círculos, rombos, paralelogramos, trapecios, hexágonos, octógonos, cilindros, nubes, documentos, globos de diálogo, estrellas y triángulos que apuntan hacia arriba tienen una forma con el mismo dibujo; un triángulo que apunta hacia otro lado y un actor dibujado como figura de palitos se dibujan con la forma más cercana (`triangle` apunta hacia arriba, y `person` es una cabeza sobre un cuerpo), y sus contenedores anidados son grupos sin título |
| No se importa | de Mermaid, los diagramas de clases, de estados, de entidad-relación, de recorrido de usuario, de Gantt, de sectores, de cuadrantes, de requisitos y de Git, los mapas mentales, las líneas de tiempo y los gráficos Sankey y XY; de PlantUML, los diagramas de clases, de actividades, de estados, de objetos, de tiempos, de Gantt, los mapas mentales, los WBS y los demás diagramas que no son de descripción; los archivos de draw.io, Lucidchart, Visio y otros editores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Cada construcción de un diagrama importado se informa como convertida, aproximada o descartada:
consulta [Importar Mermaid](import/mermaid.md) e [Importar PlantUML](import/plantuml.md).

## Aplicaciones de diapositivas y de oficina

Las exportaciones se comprueban a mano en PowerPoint, Keynote y Google Slides con el kit de
verificación; el propietario registra los resultados por aplicación, versión y formato en
[aplicaciones de oficina](../verification/office-apps.md). Lo que cabe esperar de los propios
formatos:

- Google Slides acepta imágenes PNG y GIF, y video solo desde Google Drive o YouTube.
- Ninguna aplicación de diapositivas ejecuta el reproductor HTML dentro de una diapositiva;
  compártelo como archivo o como enlace, o inserta el fragmento en una página web.

## Limitaciones conocidas

Fuera de la 1.0, como decide la propuesta:

- la voz sintética y el video generado por IA;
- la importación universal (archivos de draw.io, Lucidchart, Visio y otros editores);
- la exportación a PPTX y la conversión a formas editables de PowerPoint.

La colaboración en tiempo real (varias personas que editan el mismo archivo a la vez) también
quedaba fuera de la 1.0 y ya no es una limitación: los proyectos en la nube del playground la tienen
([trabajar juntos](playground.md#trabajar-juntos)). Lo que no hace:

- Necesita el servicio en la nube, y un proyecto en una cuenta. Quienes se unen no necesitan
  ninguna: quien visita un enlace compartido lo sigue en vivo, y el invitado de la sesión en vivo del
  propietario edita sin cuenta ([sesiones en vivo](playground.md#sesiones-en-vivo)). La extensión de
  VS Code y la línea de comandos no muestran presencia, aunque un push mediante la API o la línea de
  comandos llega en vivo a las personas de una sala.
- Una sala admite veinte conexiones, y diez sin cuenta desde una misma red; la número veintiuno
  espera y lo intenta de nuevo. Una sesión en vivo dura un día como máximo.
- Un invitado no puede añadir imágenes ni fuentes, crear versiones, compartir ni publicar: eso
  requiere una cuenta.
- No se puede seguir la vista de otra persona, y no hay comentarios, chat ni voz.

En la 1.0:

- macOS y Linux ejecutan el mismo código que Windows (incluida la detección del navegador y de
  FFmpeg), pero no se han verificado en una máquina; los resultados de referencia vienen de
  Windows 11.
- El PDF desde el playground pasa por el diálogo de impresión del navegador (elige
  **Guardar como PDF**); la línea de comandos escribe el PDF directamente.
- El video transparente (WebM con canal alfa) solo lo genera la línea de comandos.
- GIF usa una sola paleta de 256 colores para toda la animación.
- El catálogo y el reproductor muestran lo que se exportó; no editan.
- La asistencia de IA necesita una clave de un proveedor y envía el contexto que antes te muestra;
  todo lo demás funciona sin conexión.
- Las capturas de video y PNG necesitan un navegador basado en Chromium instalado; Firefox está
  verificado para ver las exportaciones, no para capturarlas.

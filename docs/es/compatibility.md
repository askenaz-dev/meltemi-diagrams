# Compatibilidad y limitaciones conocidas

[English](../compatibility.md)

Entornos compatibles, formatos de archivo y limitaciones actuales. Estos requisitos describen el
producto; los informes fechados de rendimiento y verificación se conservan aparte en el repositorio.

## Entorno de ejecución

| Componente           | Requisitos                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Node.js              | 22.12 o posterior para la CLI y los paquetes JavaScript (módulos ES)                                     |
| Sistemas operativos  | Windows, macOS y Linux con un entorno Node compatible                                                    |
| Gestores de paquetes | Los paquetes publicados se pueden instalar con npm, pnpm o Yarn; los ejemplos de primeros pasos usan npm |
| CI                   | `init --ci github` e `init --ci gitlab` generan flujos de validación y exportación para tu proyecto      |

La validación, la disposición y la exportación SVG locales funcionan sin servidor ni cuenta de
Meltemi después de instalar. Guardar en la nube, colaborar, publicar y conectar MCP a una cuenta
usan el servicio; la [asistencia de IA](assist.md) opcional conecta al proveedor que configures.
La app web carga su código, fuentes e iconos desde su host. El uso local con Docker se explica en
[la guía del espacio de trabajo local](local-compose.md).

## Navegadores y FFmpeg

Las exportaciones PNG, PDF y de video de la CLI usan un Edge, Chrome o Chromium instalado, que
se encuentra automáticamente o se elige con `MELTEMI_BROWSER`. El video usa además un FFmpeg
instalado, que se encuentra en el PATH o se elige con `MELTEMI_FFMPEG`. Exportar no instala estas
herramientas por ti.

| Uso                                                       | Requisitos                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Capturas de la CLI (PNG, PDF y fotogramas de video)       | Microsoft Edge, Google Chrome o Chromium                                                                 |
| Codificación de video de la CLI                           | FFmpeg con libx264 para MP4, libvpx-vp9 para WebM y soporte de GIF                                       |
| Ver exportaciones SVG, PNG, reproductor, catálogo y video | Un navegador actual que admita ese formato multimedia                                                    |
| La app web                                                | Edge, Chrome, Firefox o Safari actuales; los formatos de video disponibles dependen de sus codificadores |

La app web graba WebM y MP4 con los codificadores WebCodecs del navegador. Cuando falta un
codificador, desactiva ese formato y muestra el comando de la CLI que puede generarlo. GIF no
necesita un codificador de video.

## Editores

| Editor               | Requisitos                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Visual Studio Code   | 1.95 o posterior; instala `meltemi.meltemi-diagrams-vscode`                                                                               |
| Derivados de VS Code | Una API de extensiones compatible; instala desde Open VSX o el VSIX de la versión publicada. La compatibilidad también depende del editor |
| Otros editores       | Edita texto `.meltemi` y usa `mdg validate`, `mdg export` y `mdg preview`; otras herramientas pueden integrar `@meltemi/diagrams-editor`  |

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
| Mermaid       | `flowchart` y `graph`, `sequenceDiagram`, los diagramas `C4*`, `architecture-beta`, `block-beta`, `gantt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PlantUML      | los diagramas de componentes, de despliegue y de casos de uso (diagramas de descripción), los diagramas de secuencia, C4-PlantUML; el preprocesador y las inclusiones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Markdown      | los bloques de Mermaid y de PlantUML de un archivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Formas        | Meltemi dibuja veinticuatro valores de `shape` ([composiciones libres](language/free.md#texto-y-formas)). El hexágono, el paralelogramo, el trapecio, el círculo, el estadio, la subrutina, la forma asimétrica, el documento y el triángulo de Mermaid conservan su dibujo, y sus variantes reflejadas y de doble anillo se dibujan con la forma más cercana; `cloud`, `hexagon`, `usecase`, `interface`, `circle`, `actor`, `person`, `card`, `file` y `folder` de PlantUML conservan un dibujo propio. Los archivos de draw.io no se importan; sus rectángulos, rectángulos redondeados, cuadrados, elipses, círculos, rombos, paralelogramos, trapecios, hexágonos, octógonos, cilindros, nubes, documentos, globos de diálogo, estrellas y triángulos que apuntan hacia arriba tienen una forma con el mismo dibujo; un triángulo que apunta hacia otro lado y un actor dibujado como figura de palitos se dibujan con la forma más cercana (`triangle` apunta hacia arriba, y `person` es una cabeza sobre un cuerpo), y sus contenedores anidados son grupos sin título |
| No se importa | de Mermaid, los diagramas de clases, de estados, de entidad-relación, de recorrido de usuario, de sectores, de cuadrantes, de requisitos y de Git, los mapas mentales, las líneas de tiempo y los gráficos Sankey y XY; de PlantUML, los diagramas de clases, de actividades, de estados, de objetos, de tiempos, de Gantt, los mapas mentales, los WBS y los demás diagramas que no son de descripción; los archivos de draw.io, Lucidchart, Visio y otros editores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Cada construcción de un diagrama importado se informa como convertida, aproximada o descartada:
consulta [Importar Mermaid](import/mermaid.md) e [Importar PlantUML](import/plantuml.md).

## Aplicaciones de diapositivas y de oficina

Elige un formato que admita la aplicación de destino. PNG sirve para una imagen con aspecto
fijo; SVG y PDF conservan formas y texto vectoriales donde el destino los admita. Conserva el
archivo `.meltemi` para revisar el diagrama y volver a exportarlo.

El reproductor HTML es una página web: comparte su archivo o enlace, o integra su fragmento en
una página web. Meltemi no lo convierte en un objeto interactivo de una diapositiva.

## Limitaciones conocidas

- Meltemi no ofrece voz sintética, video generado por IA, exportación PPTX ni formas editables de PowerPoint.
- Las importaciones cubren las construcciones documentadas de Mermaid y PlantUML. No hay
  importador de archivos de draw.io, Lucidchart ni Visio; consulta las
  [tablas de cobertura](#cobertura-de-la-importación).
- La edición colaborativa funciona en proyectos con backend: proyectos de la nube alojada o el
  [espacio de trabajo Docker local](local-compose.md). No agrega presencia en vivo a una carpeta
  independiente en VS Code o la CLI, aunque un envío por CLI/API llega a un proyecto en la nube abierto.
- Una sala alojada admite hasta 20 conexiones, con un máximo de 10 anónimas desde una red.
  Una sesión en vivo del propietario deja editar a invitados sin cuenta y dura como máximo un día.
  Los invitados no pueden subir imágenes/fuentes, crear versiones, compartir ni publicar.
- No hay seguimiento de la vista de otra persona, comentarios, chat ni voz.
- El PDF de la app web usa el diálogo de impresión del navegador (**Guardar como PDF**); la CLI escribe PDF directamente.
- El video transparente (WebM con alfa) está disponible mediante la CLI.
- Si el renderizador MCP alojado responde `renderer.unavailable`, usa el
  [servidor MCP local](agents.md#a-través-del-servidor-local) para proyectos de tu cuenta o el espacio de trabajo Docker.

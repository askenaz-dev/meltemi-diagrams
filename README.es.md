# Meltemi Diagrams

[English](README.md)

Diagramas profesionales escritos como código, ajustados en un lienzo, animados y exportados, parte
de la familia Meltemi. Escribes archivos de texto `.meltemi`; el editor los dibuja junto al código,
y cada arrastre, cambio de tamaño o cambio de etiqueta en el lienzo se convierte en una pequeña
edición del mismo texto. El código, la disposición y el movimiento viven en archivos que revisas y
versionas como el resto de tu trabajo.

![Edición de un diagrama: el código y el lienzo uno junto al otro](docs/media/editing-demo.gif)

- **Cuatro perfiles**: diagramas de flujo, diagramas de secuencia con escenarios, vistas C4 de un
  modelo compartido y composiciones libres para diapositivas.
- **Código y lienzo**: servicios de lenguaje y un lienzo con cuadrícula, guías, trazado de rutas e
  inspector, en VS Code y en un [playground](docs/es/playground.md) en el navegador.
- **Movimiento**: efectos a lo largo de los conectores e historias con escenas, cámara y
  transiciones.
- **Entrega**: SVG, PNG, PDF vectorial, un reproductor HTML sin conexión, MP4, WebM, GIF y un
  catálogo navegable de todo un proyecto.
- **Si vienes de otra herramienta**: importadores de Mermaid y PlantUML que informan de cada
  construcción.
- **Local y abierto**: licencia MIT, sin cuenta, nada sale de tu máquina; la asistencia de IA es
  opcional.

## Instalación

```bash
npm install --global @meltemi/diagrams-cli
```

El comando es `meltemi-diagrams`, o `mdg`. Necesita Node 22.12 o posterior; PNG, PDF y video usan un
Edge o un Chrome instalado, y el video, un FFmpeg instalado. El editor es la extensión
**Meltemi Diagrams** para VS Code, y el playground, en
[diagrams.meltemi.dev](https://diagrams.meltemi.dev), no necesita ninguna instalación
([playground](docs/es/playground.md), [primeros pasos](docs/es/getting-started.md)).

## Un primer diagrama

```bash
meltemi-diagrams init shop
```

```text
language "0.2"

diagram overview: flow {
  title "Overview"
  direction LR

  client["Client"]
  api["API"] { description "Handles requests" }
  db[("Database")]

  client -> api: "HTTPS" as request
  api -> db: "Reads and writes" as store
}
```

```bash
meltemi-diagrams export shop --format png
```

Abre el archivo en VS Code para arrastrar las cajas en el lienzo, o ejecuta
`meltemi-diagrams preview shop --open` para ver cada cambio al guardar.

## Probarlo desde este repositorio

Todo se puede probar desde una copia del repositorio, antes de publicar nada o sin publicar nada.
Necesitas Node 22.12 o posterior y pnpm 10; PNG, PDF y video usan un Edge o un Chrome instalado, y
el video, un FFmpeg instalado.

### Preparación, una sola vez

```bash
pnpm install
```

```bash
pnpm build
```

### La línea de comandos

`pnpm mdg` ejecuta el comando desde el código fuente; las rutas son relativas a la raíz del
repositorio.

```bash
pnpm mdg init try-it --template purchase
```

```bash
pnpm mdg validate try-it
```

```bash
pnpm mdg preview try-it --open
```

`preview` sirve el catálogo del proyecto en `http://127.0.0.1:4317/` y lo vuelve a dibujar cada vez
que se guarda un archivo `.meltemi`: edita un archivo de `try-it/diagrams/` en cualquier editor y
míralo cambiar. Después expórtalo:

```bash
pnpm mdg export try-it --format png
```

```bash
pnpm mdg export try-it/stories/purchase.meltemi --story purchase --format mp4
```

```bash
pnpm mdg build catalog try-it
```

Para usar el comando desde cualquier carpeta, como si estuviera instalado, apunta una función del
shell al comando compilado (después de `pnpm build`), con la ruta de tu copia en lugar de la del
ejemplo. En PowerShell:

```powershell
function mdg { node C:\path\to\meltemi-diagrams\packages\cli\dist\bin.js @args }
```

En Bash:

```bash
mdg() { node /path/to/meltemi-diagrams/packages/cli/dist/bin.js "$@"; }
```

### El editor en VS Code

Empaqueta la extensión e instálala:

```bash
pnpm vscode:package
```

```bash
code --install-extension packages/vscode/meltemi-diagrams.vsix
```

Abre la carpeta `try-it` en VS Code y cualquier archivo `.meltemi` que contenga: el lienzo se abre
junto al código. Arrastra una caja, haz doble clic en una etiqueta o conecta dos cajas desde los
puntos que aparecen junto a una caja seleccionada, y mira cómo cambia el texto. Sin instalar nada,
abre este repositorio en VS Code y presiona F5 con **Run Meltemi Diagrams**: se abre un Host de
desarrollo de extensiones sobre `examples/` ([editor](docs/es/editor.md)).

### El playground

```bash
pnpm playground:build
```

```bash
pnpm preview
```

Luego abre `http://localhost:4173/packages/playground/dist/`. `pnpm preview` sirve todo el
repositorio en el puerto 4173, así que desde ahí también se pueden abrir los archivos exportados
([playground](docs/es/playground.md)).

### Lo que ya está generado

No hace falta ningún comando para ver esto:

- [gallery/README.md](gallery/README.md): los cuatro perfiles con sus exportaciones SVG, PNG y PDF;
- [examples/purchase/exports/catalog/index.html](examples/purchase/exports/catalog/index.html): el
  catálogo del ejemplo de compra, que se abre desde el disco y funciona sin conexión;
- [examples/purchase/exports/purchase-story.html](examples/purchase/exports/purchase-story.html):
  la historia en el reproductor HTML;
- [docs/media/editing-demo.mp4](docs/media/editing-demo.mp4): la demostración de edición.

### Comprobarlo todo

```bash
pnpm test
```

```bash
pnpm acceptance
```

```bash
pnpm release:check
```

`pnpm test` ejecuta las pruebas de todos los paquetes. `pnpm acceptance` ejecuta todos los criterios
de aceptación en unos doce minutos y registra los resultados en
[docs/quality/results.md](docs/quality/results.md). `pnpm release:check` compila y empaqueta todos
los paquetes, instala el comando desde los archivos empaquetados en una carpeta vacía, nunca desde el
registro, y lo ejecuta allí: lo más parecido a una versión publicada
([publicación de versiones](RELEASING.md)).

## Galería

| Flujo                                                                                                                                  | Secuencia                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [![Una canalización de entrega](gallery/flow/delivery-pipeline.svg)](gallery/README.md#flow-a-delivery-pipeline)                       | [![Inicio de sesión con una llave de acceso](gallery/sequence/passkey-sign-in.svg)](gallery/README.md#sequence-sign-in-with-a-passkey) |
| **C4**                                                                                                                                 | **Libre**                                                                                                                              |
| [![Una plataforma de viajes compartidos](gallery/c4/ride-sharing.svg)](gallery/README.md#c4-the-containers-of-a-ride-sharing-platform) | [![Una diapositiva con una hoja de ruta](gallery/free/roadmap.svg)](gallery/README.md#free-a-roadmap-slide)                            |

Cada imagen enlaza con su código fuente y sus exportaciones SVG, PNG y PDF. El
[ejemplo de compra](examples/purchase/README.md) dibuja una misma compra en cada perfil, con una
historia, un video y un catálogo.

## Documentación

- [Primeros pasos](docs/es/getting-started.md), [funciones](docs/es/features.md) y
  [compatibilidad](docs/es/compatibility.md)
- Si vienes de [Mermaid](docs/es/tracks/from-mermaid.md), de
  [PlantUML](docs/es/tracks/from-plantuml.md) o de un
  [editor visual](docs/es/tracks/from-visual-editors.md)
- La [referencia del lenguaje](docs/es/language/grammar-0.2.md), la
  [línea de comandos](docs/es/cli.md) y el [editor](docs/es/editor.md)
- [Todo lo demás](docs/es/README.md)

## Estado

Versión 1.9.0, la primera publicada: el producto completo descrito en `propuesta-detallada-diagramas-como-codigo.pdf` (en
español), construido mediante los cambios de la [hoja de ruta de la 1.0](docs/roadmap-1.0.md), con
la edición de estilos y de temas personalizados en el lienzo desde la 1.1.0, las puntas de flecha
en ambos extremos, las formas de conector y el efecto de recorrido desde la 1.2.0, inglés y
español en todo el producto desde la 1.3.0, los extremos de conector fijados en puntos de los
lados desde la 1.4.0, los conectores que tocan las cajas en cualquier punto de su borde desde la
1.5.0, los conectores que rodean las cajas con los colores del lienzo tomados del tema desde la
1.6.0, las bibliotecas de elementos con los iconos de los proveedores de nube y las capas en los
diagramas de flujo desde la 1.7.0, y los contenedores simples, las pilas, los radios de esquina y
las veinticuatro formas, con iconos en cualquier lugar de una caja o dibujados como la forma,
desde la 1.8.0, y los dibujos HTML que se acercan, muestran tarjetas y paneles y abren lo que
contiene una caja desde la 1.9.0, como recoge el [registro de cambios](CHANGELOG.md). Todos los criterios de
aceptación se cumplen en la máquina de referencia ([resultados](docs/quality/results.md)). El
trabajo se planifica con OpenSpec en `openspec/`.

## Rendimiento

En la máquina de referencia (decisión 0032), el análisis que recibe un archivo tras una edición y un
arrastre en el lienzo, desde el mensaje hasta el nuevo dibujo, quedan muy por debajo de sus
objetivos para vistas de 30 elementos en todos los perfiles:

| Objetivo (p95)                                     | Límite | Medido, peor perfil |
| -------------------------------------------------- | -----: | ------------------: |
| análisis tras una edición                          | 500 ms |               56 ms |
| arrastre en el lienzo, del mensaje al nuevo dibujo | 100 ms |               19 ms |
| primera exportación desde una plantilla (CLI)      |   60 s |                35 s |

`pnpm bench` muestra los tiempos de análisis sintáctico, compilación, exportación y organización, y
`pnpm bench --write` los registra en la página de [rendimiento](docs/es/performance.md). Cómo se
comprueba cada criterio de aceptación, y los últimos resultados, están en
[docs/quality.md](docs/quality.md) y [docs/quality/results.md](docs/quality/results.md).

## Estructura del repositorio

| Ruta                  | Contenido                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/language`   | `@meltemi/diagrams-language`: analizador léxico, analizador sintáctico, CST, diagnósticos, ediciones de texto                                                 |
| `packages/model`      | `@meltemi/diagrams-model`: modelo intermedio, validación de `flow`, `free` y `sequence`, escenarios, JSON                                                     |
| `packages/edit`       | `@meltemi/diagrams-edit`: de operaciones estructuradas a ediciones mínimas del texto                                                                          |
| `packages/layout`     | `@meltemi/diagrams-layout`: disposición de los diagramas de flujo, libres y de secuencia en una escena vectorial, restricciones, rutas y comprobaciones       |
| `packages/layout-elk` | `@meltemi/diagrams-layout-elk`: el motor de disposición ELK (elkjs, EPL-2.0)                                                                                  |
| `packages/render`     | `@meltemi/diagrams-render`: de escena vectorial a SVG portable                                                                                                |
| `packages/project`    | `@meltemi/diagrams-project`: proyectos, manifiestos, importaciones, espacio de trabajo incremental                                                            |
| `packages/fonts`      | `@meltemi/diagrams-fonts`: fuentes OFL incluidas, medición de texto, incrustación, contornos                                                                  |
| `packages/assets`     | `@meltemi/diagrams-assets`: paquetes de iconos, saneamiento de SVG, licencias, el archivo de bloqueo de recursos                                              |
| `packages/motion`     | `@meltemi/diagrams-motion`: efectos con un reloj determinista, fotogramas en cualquier instante y el perfil de SVG animado                                    |
| `packages/i18n`       | `@meltemi/diagrams-i18n`: los dos idiomas, catálogos tipados y formato según el idioma                                                                        |
| `packages/import`     | `@meltemi/diagrams-import`: importadores de Mermaid y PlantUML, el preprocesador, tablas de cobertura, reimportación                                          |
| `packages/player`     | `@meltemi/diagrams-player`: el reproductor HTML de historias y efectos, y sus documentos                                                                      |
| `packages/capture`    | `@meltemi/diagrams-capture`: capturas PNG, PDF y de video mediante el navegador instalado y FFmpeg                                                            |
| `packages/catalog`    | `@meltemi/diagrams-catalog`: el catálogo HTML sin conexión de un proyecto                                                                                     |
| `packages/assist`     | `@meltemi/diagrams-assist`: asistencia de IA opcional, sus adaptadores y propuestas revisables                                                                |
| `packages/cli`        | `@meltemi/diagrams-cli`: el comando `meltemi-diagrams`                                                                                                        |
| `packages/editor`     | `@meltemi/diagrams-editor`: servicios de lenguaje, sesiones de proyecto, exportaciones, la sesión del lienzo, independiente del entorno                       |
| `packages/canvas`     | `@meltemi/diagrams-canvas`: la aplicación del lienzo, compartida por la extensión y el playground                                                             |
| `packages/vscode`     | la extensión Meltemi Diagrams para VS Code: soporte del lenguaje y el lienzo                                                                                  |
| `packages/playground` | el playground: una página web estática con plantillas, código, el lienzo y todas las exportaciones                                                            |
| `packages/cloud`      | el servicio en la nube: un Worker con la cuenta opcional, los tokens de API y los proyectos en la nube ([cloud](docs/es/cloud.md))                            |
| `packages/acceptance` | la suite de aceptación: condiciones del corpus, regresión visual, determinismo, medición del rendimiento y los ejecutores de la verificación de exportaciones |
| `gallery/`            | una hoja de cada perfil con sus exportaciones SVG, PNG y PDF                                                                                                  |
| `corpus/`             | archivos y proyectos `.meltemi` de referencia, instantáneas y casos de edición; `corpus/acceptance/` para los criterios de aceptación                         |
| `schemas/`            | esquemas JSON, como `project.schema.json` para `project.json`                                                                                                 |
| `examples/`           | el ejemplo de referencia de compra con todas las exportaciones, y hojas reales convertidas a `.meltemi`                                                       |
| `skills/`             | la Agent Skill `meltemi-diagrams` para Claude Code, Codex y otros agentes                                                                                     |
| `scripts/`            | utilidades de desarrollo, como el servidor de vista previa                                                                                                    |
| `docs/language/`      | referencias de la gramática, los diagnósticos, los estilos, los recursos, las fuentes, los proyectos y el JSON del modelo                                     |
| `docs/import/`        | lo que los importadores de Mermaid y PlantUML convierten, aproximan y descartan, generado a partir de las tablas de cobertura                                 |
| `docs/roadmap-1.0.md` | los cambios ordenados que construyen la 1.0 completa                                                                                                          |
| `docs/decisions/`     | notas de decisión con criterios, alternativas y consecuencias                                                                                                 |
| `docs/quality.md`     | los criterios de aceptación y cómo se comprueba cada uno; los resultados en `docs/quality/`, las comprobaciones de exportación en `docs/verification/`        |
| `openspec/`           | propuestas, especificaciones, diseños y tareas                                                                                                                |

## Scripts

| Script                         | Propósito                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm test`                    | ejecutar las pruebas de todos los paquetes con vitest                                  |
| `pnpm typecheck`               | comprobar los tipos de todos los paquetes                                              |
| `pnpm lint`                    | comprobaciones de eslint y prettier                                                    |
| `pnpm build`                   | compilar todos los paquetes en `dist/`                                                 |
| `pnpm mdg`                     | ejecutar la CLI desde el código fuente                                                 |
| `pnpm bench`                   | tiempos y objetivos del editor; `--write` los registra                                 |
| `pnpm import:docs`             | regenerar `docs/import/` a partir de las tablas de cobertura                           |
| `pnpm preview`                 | servir el repositorio en el puerto 4173 para ver las exportaciones                     |
| `pnpm vscode:package`          | compilar la extensión de VS Code y comprobar el `.vsix`                                |
| `pnpm vscode:test-webview`     | probar el lienzo en un Edge o un Chrome sin interfaz gráfica                           |
| `pnpm vscode:test`             | probar la extensión dentro de VS Code                                                  |
| `pnpm playground:build`        | compilar el sitio estático del playground                                              |
| `pnpm playground:test-browser` | probar el playground en un Edge o un Chrome sin interfaz gráfica                       |
| `pnpm cloud:dev`               | compilar la página y ejecutar el servicio en la nube en el puerto 8788                 |
| `pnpm cloud:migrate`           | aplicar las migraciones de la base de datos del servicio en la nube                    |
| `pnpm cloud:test`              | probar el servicio en la nube en Node                                                  |
| `pnpm cloud:test-browser`      | probar el servicio en la nube en un Edge o un Chrome sin interfaz gráfica              |
| `pnpm cloud:dev-session`       | preparar .dev.vars y cookies de inicio de sesión para desarrollar en local             |
| `pnpm acceptance`              | ejecutar todos los criterios de aceptación y registrar los resultados                  |
| `pnpm acceptance:visual`       | comparar los dibujos con sus referencias de píxeles                                    |
| `pnpm acceptance:determinism`  | exportar cada formato dos veces y comparar el contenido                                |
| `pnpm acceptance:first-export` | medir cuánto tarda una plantilla en llegar a archivos exportados                       |
| `pnpm verification:browsers`   | abrir cada exportación en Edge, Chrome y Firefox                                       |
| `pnpm verification:kit <dir>`  | escribir los archivos y la lista de comprobación para las aplicaciones de diapositivas |
| `pnpm conformance`             | ejecutar la suite de conformidad del lenguaje                                          |
| `pnpm gallery`                 | escribir las exportaciones de la galería y del ejemplo de compra                       |
| `pnpm demo`                    | grabar la demostración de edición con el código y el lienzo                            |
| `pnpm pilot:summary <dir>`     | resumir las plantillas de medición del piloto ya rellenadas                            |
| `pnpm release:version <x.y.z>` | establecer la versión del producto en todas partes                                     |
| `pnpm release:check`           | compilar, empaquetar, instalar y ejecutar la versión sin publicarla                    |

## Para agentes

Los agentes de programación dibujan con la skill `meltemi-diagrams` (flujo de trabajo, plantilla,
reglas, referencias del lenguaje y de la disposición, ejemplos completos). Un prompt pegado en
Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI o Devin Desktop hace que el agente lea
`https://diagrams.meltemi.dev/agent-setup/prompt.md`, instale la skill y demuestre que dibuja: el
prompt y los agentes están en
[la página de configuración para agentes](https://diagrams.meltemi.dev/es/agent-setup/) y en
[dibujar con agentes de programación](docs/es/agents.md). En tu proyecto, `mdg skill install`
escribe la skill en `.claude/skills/` y `.agents/skills/`. En este repositorio vive en `skills/`,
`pnpm skills:sync` la copia en `.claude/skills/`, `.agents/skills/` y el paquete de la línea de
comandos, y `AGENTS.md` remite a ella a los demás agentes.

## Marca

Las exportaciones llevan de forma predeterminada la identidad de la familia Meltemi: el tema
`technical.light` dibuja un pie con el símbolo de Meltemi, el logotipo `Meltemi Diagrams` y el
título del diagrama, y los temas `stage.*`, un encabezado. `theme "editorial.light"` mantiene una
hoja neutra, y un bloque `theme <id> { }` puede derivar cualquier paleta. Los recursos de la
submarca (lockups, glifo, icono de archivo, lámina de marca) están en `brand/`.

## Nombres

El producto es Meltemi Diagrams (`docs/decisions/0009-product-name.md`). Los archivos de diagramas
usan la extensión `.meltemi`, el comando es `meltemi-diagrams` con el alias `mdg`, y los paquetes de
npm son `@meltemi/diagrams-*` (`docs/decisions/0002-package-and-command-names.md`).

## Licencia

MIT para el código de este repositorio. Las dependencias, las fuentes y los paquetes de iconos
conservan sus propias licencias.

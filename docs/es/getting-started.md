# Primeros pasos

[English](../getting-started.md)

De no tener nada instalado a un diagrama dibujado en el lienzo y exportado, en unos diez minutos. No
hace falta ninguna cuenta, y nada de lo que escribes sale de tu máquina.

## Probarlo sin instalar nada

El [playground](playground.md) ejecuta todo el producto en una pestaña del navegador: empieza un
proyecto desde la tarjeta de una plantilla, cambia el código o arrastra en el lienzo, y exporta. El
explorador de la izquierda lista las carpetas y los diagramas del proyecto. Cuando quieras seguir en
local, **Exportar proyecto**, en el panel Proyectos (el nombre del proyecto arriba del explorador),
lo descarga como archivo comprimido; la línea de comandos y el editor lo abren tal cual.

## Instalación

La línea de comandos necesita Node 22.12 o posterior:

```bash
npm install --global @meltemi/diagrams-cli
```

```bash
meltemi-diagrams --version
```

El comando también está disponible como `mdg`. Las exportaciones PNG, PDF y de video usan un Edge,
un Chrome o un Chromium instalado, y el video, además, un FFmpeg instalado
([compatibilidad](compatibility.md)).

El editor es la extensión **Meltemi Diagrams** para Visual Studio Code 1.95 o posterior, desde
Visual Studio Marketplace u Open VSX, o desde un archivo `.vsix`:

```bash
code --install-extension meltemi-diagrams-1.0.0.vsix
```

Si trabajas desde este repositorio, ejecuta `pnpm install` una vez y usa `pnpm mdg` donde esta guía
dice `meltemi-diagrams`;
[probarlo desde el repositorio](../../README.es.md#probarlo-desde-este-repositorio) explica también
el editor y el playground.

## Un primer proyecto

```bash
meltemi-diagrams init shop
```

`init` escribe `shop/project.json` y `shop/diagrams/overview.meltemi`, un pequeño diagrama de flujo:

```text
language "0.2"

diagram overview: flow {
  title "Overview"
  description "How a request reaches the data"
  direction LR

  client["Client"]
  api["API"] { description "Handles requests" }
  db[("Database")]

  client -> api: "HTTPS" as request
  api -> db: "Reads and writes" as store
}
```

Otras plantillas parten de un modelo C4, un diagrama de secuencia, una diapositiva o el ejemplo de
compra completo: `meltemi-diagrams init --list`.

Compruébalo y luego expórtalo:

```bash
meltemi-diagrams validate shop
```

```bash
meltemi-diagrams export shop
```

`validate` muestra cada problema como `path:line:column: severity code message` y termina con el
código 1 si hay errores ([diagnósticos](language/diagnostics.md)). `export` escribe
`shop/diagrams/overview.svg` junto al código fuente: un solo archivo con sus fuentes, listo para un
documento o una página web.

## Míralo mientras escribes

```bash
meltemi-diagrams preview shop --open
```

`preview` sirve el catálogo del proyecto en `http://127.0.0.1:4317/` y lo vuelve a dibujar cada vez
que cambia un archivo. Edita `overview.meltemi` en cualquier editor: agrega `cache[("Cache")]` y
`api -> cache`, y guarda.

## Dibuja en el lienzo

Abre la carpeta `shop` en VS Code y, dentro de ella, `overview.meltemi`. El lienzo se abre junto al
código (**Abrir el lienzo al lado** lo vuelve a mostrar después de cerrarlo).

1. Arrastra la caja **Cache**. El código gana un bloque `placement` con un `place` para cada caja y
   la línea `layout assisted`: lo que está colocado se queda donde está, y las cajas nuevas se
   organizan a su alrededor.
2. Haz doble clic en la etiqueta de la flecha, **HTTPS**, y escribe `HTTPS and JSON`. Cambia la
   cadena en el código, y nada más.
3. Selecciona **Client** y arrastra desde uno de los puntos que aparecen a su lado hasta
   **Database**: aparece una nueva línea `client -> db`.
4. Deshacer (Ctrl+Z) en el código revierte cada paso, y el lienzo lo acompaña.

Cada gesto es una pequeña edición del texto, así que el diff de tu cambio muestra exactamente qué se
movió ([editor](editor.md)).

## Exporta para tu público

```bash
meltemi-diagrams export shop --format png
```

```bash
meltemi-diagrams export shop/diagrams/overview.meltemi --format pdf
```

PNG se dibuja de forma predeterminada al doble de píxeles (`--scale`), con un fondo transparente
opcional; PDF es una página vectorial con texto seleccionable. Los diagramas con efectos o historias
también se exportan como SVG animado, reproductor HTML, MP4, WebM o GIF; un bloque `export` en el
archivo recuerda una entrega para que `--profiles` las escriba todas
([exportación](language/export.md)).

El proyecto entero, con todos sus diagramas e historias, se convierte en una sola página sin
conexión:

```bash
meltemi-diagrams build catalog shop
```

## Adónde seguir

- Si vienes de otra herramienta: [Mermaid](tracks/from-mermaid.md),
  [PlantUML](tracks/from-plantuml.md) o un [editor visual](tracks/from-visual-editors.md).
- Qué más hace el producto: las [funciones](features.md), la [galería](../../gallery/README.md) y el
  [ejemplo de compra](../../examples/purchase/README.md).
- El lenguaje: [gramática](language/grammar-0.2.md), [disposición](language/layout.md),
  [estilos](language/styles.md), [historias](language/stories.md).
- Todo lo demás: el [índice de la documentación](README.md).

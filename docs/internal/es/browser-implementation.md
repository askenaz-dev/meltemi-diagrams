# Implementación de la app web

[English](../browser-implementation.md)

Notas para mantener e implementar el servicio; no son instrucciones de uso. La guía de producto está en [la documentación pública](../../es/web-app.md).

## Compilarlo y servirlo

```bash
pnpm playground:build
```

La compilación escribe un sitio estático en `packages/playground/dist/`: `index.html`, los scripts,
las hojas de estilo, `templates.json`, las fuentes, los datos de Tabler, los entornos de ejecución
que se escriben en las exportaciones HTML, `NOTICES.md`, `api/session`, la respuesta que da un
servidor estático a la única solicitud que la página hace a una API (`{"user":null}`: nadie ha
iniciado sesión), y `_headers`, las dos cabeceras que la plataforma de recursos del servicio en la
nube da a cada archivo de la página (`frame-ancestors 'self'` y `nosniff`; un servidor estático lo
sirve como un archivo más), y `agent-setup/` con `es/agent-setup/`, la página estática que explica
cómo dar la skill a los agentes de programación
([dibujar con agentes de programación](../../es/agents.md)), junto a su hoja de estilo y a
`agent-setup/prompt.md`, el prompt de configuración de la línea de comandos. Cualquier servidor
estático lo sirve; durante el desarrollo,
`pnpm preview` sirve el repositorio en `http://localhost:4173/packages/playground/dist/`. La página
alojada es `https://diagrams.meltemi.dev`: el [servicio en la nube](../../es/cloud.md) sirve la misma
compilación con una cuenta encima (`pnpm cloud:dev` en local), desplegada desde `main` por el flujo
de despliegue. La página inicia la sesión en
`https://id.meltemi.dev`; al compilar, fija `PLAYGROUND_IDENTITY` al origen de otro servicio de
identidad para cambiarlo, y el `form-action` de la política lo sigue.

```bash
pnpm playground:test-browser
```

compila el sitio, lo sirve en `127.0.0.1` y lo maneja en el Edge o el Chrome instalado.

## Cómo está construido

- El lienzo es `@meltemi/diagrams-canvas`, compartido con la webview de la extensión; la página
  hace el papel de la extensión (aplica los planes, lleva las revisiones, responde a las solicitudes
  del lienzo).
- El explorador es `src/explorer/`: `tree-model.ts` (el árbol, las filas que recorren las teclas y
  las reglas de los nombres, los movimientos y las copias, sin DOM), `tree.ts` (el árbol WAI-ARIA,
  redibujado por clave para que el foco, el desplazamiento y una carpeta que se abre sobrevivan a los
  cambios del proyecto), `explorer.ts` (el panel y sus acciones), `switcher.ts` (la cabecera y el
  panel Proyectos), `new-project.ts`, `import.ts` y `dialogs.ts`. Un movimiento pasa por
  `Studio.moveFiles`, que reescribe las importaciones con `moveFileEdits` de
  `@meltemi/diagrams-editor` y anota el movimiento en la pila propia del historial; los dibujos de las
  tarjetas de plantillas se hacen al compilar el sitio (`thumbnails.mjs`).
- Los proyectos viven en memoria (`MemoryHost`, un `ProjectHost` bajo `/playground`) y se compilan
  con `ProjectSessions` de `@meltemi/diagrams-editor`, con los lectores de fuentes y de Tabler de la
  página y el worker de ELK incluido.
- Las fuentes y los datos de iconos se obtienen del propio origen de la página la primera vez que se
  leen; la página vuelve a analizar cuando llegan, y las exportaciones esperan a todos los archivos
  que leen.
- El codificador de GIF, los generadores de WebM y MP4 y el lector y el generador de ZIP forman
  parte de la página (`packages/playground/src/encode/`, `src/zip.ts`); no se descarga nada más.
- La cuenta es `src/cloud/`: la sesión que la página pide una vez (`session.ts`), el enlace de
  inicio de sesión y el menú de la cuenta de la cabecera (`account.ts`) y el diálogo de tokens de
  API (`tokens-dialog.ts`, sobre `tokens-model.ts` y `tokens.ts`, que no necesitan DOM). La página
  funciona igual diga lo que diga el servicio; nunca falla por su respuesta.
- Los proyectos en la nube también están en `src/cloud/`. `client.ts` hace las llamadas al servicio y
  ninguna lanza un error. `projects-model.ts` es la lista en la nube del panel del explorador, y
  `versions.ts` el
  panel de versiones sobre `versions-model.ts`; ninguno de los dos modelos necesita DOM.
  `project.ts` es un proyecto abierto: su documento Yjs (`doc.ts`), el binding que ata el documento
  al `Studio` (`binding.ts`), el socket a la sala (`room.ts`), su copia en IndexedDB
  (`persistence.ts`) y el estado de la conexión (`status.ts`). `thumbnails.ts` y
  `thumbnail-render.ts` hacen y envían la vista previa, `address.ts` lee y escribe `?project=`, y
  `controller.ts` lo mantiene todo junto para el panel y el shell. El `Studio` gana un listener
  `change`, `replaceText` para los cambios que llegan de fuera y `canUndo` y `canRedo`, y delega
  deshacer en el binding mientras hay un proyecto en la nube abierto. La única dependencia en tiempo
  de ejecución que añaden los proyectos en la nube es `yjs` (MIT, en `NOTICES.md`); la página
  mantiene el navegador, el socket, IndexedDB y el reloj detrás de interfaces pequeñas, así que las
  pruebas simulan todos ellos.
- Compartir, ver y publicar también están en `src/cloud/`. `share.ts` dibuja el diálogo de compartir
  sobre `share-model.ts`, cuyo `shareView` es el único lugar que decide qué se muestra a cada rol (un
  control que una persona no puede usar no se dibuja), y `share-api.ts`, las llamadas; `publish.ts`,
  `publish-model.ts` y `publish-api.ts` hacen lo mismo con la publicación, construyendo la página con
  `projectCatalog` (`src/exports/files.ts`), la compilación que comparte la descarga del catálogo.
  Ver es `view-mode.ts` (el modo), `snapshot.ts` (la lectura de quien no ha iniciado sesión),
  `link.ts` (abrir una dirección y aceptar una invitación), `view-actions.ts` (las copias y la
  recarga), `view-bar.ts` (la insignia de la cabecera y el aviso de recarga) y `view-page.ts`, que
  los une. `Studio.setReadOnly` rechaza toda edición en el único lugar por el que pasan las
  ediciones, `CodePane.setReadOnly` y el shell protegen el resto, el binding no envía ninguna
  actualización como lector, y `canvas-settings.ts` da al lienzo `readOnly` en su mensaje `settings`
  ([la guía del editor](../../es/editor.md)).
- La presencia también está en `src/cloud/`. `presence.ts` es lo que un proyecto cuenta a la sala
  sobre su persona (el archivo abierto, el cursor como posiciones relativas de Yjs, la selección del
  lienzo) con la limitación (throttle) de 250 ms y el latido, y lo que la sala dice de los demás;
  `presence-wire.ts` es el formato de los mensajes de tipo 2 ([presencia](../../es/cloud.md#presencia-awareness))
  y el único lugar que lee el contenido de un par; `presence-model.ts` decide, contra el documento
  tal como está ahora, a quién lista la cabecera, qué cursores dibuja el panel de código y qué se le
  cuenta al lienzo; `presence-geometry.ts` dice dónde está una posición en el panel. Ninguno de esos
  cuatro necesita DOM. `presence-bar.ts` dibuja la lista de la cabecera, `presence-overlay.ts` los
  cursores y selecciones sobre el código, y `presence-mount.ts` los une al shell; `room.ts` lleva
  los mensajes de tipo 2 en ambos sentidos, y el lienzo dibuja el resto a partir de un mensaje
  `presence` ([la guía del editor](../../es/editor.md)).

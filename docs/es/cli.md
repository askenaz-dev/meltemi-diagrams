# La línea de comandos

[English](../cli.md)

`meltemi-diagrams` (alias `mdg`; `pnpm mdg` desde el código fuente) cubre la vida de un proyecto:
crearlo, verlo en vista previa, validarlo, darle formato, importar, exportar, publicar un catálogo,
revisar los cambios y guardar una copia en la nube. Todos los comandos admiten `--help`. Las rutas
de los mensajes son relativas a la carpeta de trabajo; nada de lo que un comando imprime o escribe
nombra las rutas absolutas de la máquina, salvo que se pida.

| Comando                     | Qué hace                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `init [folder]`             | Crea un proyecto a partir de una plantilla; `--ci` agrega un flujo de trabajo de CI, `--cloud` un trabajo que hace push  |
| `validate <path>...`        | Comprueba archivos, proyectos y la composición de sus diagramas ([diagnósticos](language/diagnostics.md))                |
| `preview [path]`            | Sirve el catálogo del proyecto y lo vuelve a generar cuando cambian los archivos                                         |
| `format <path>...`          | Reescribe los archivos con el formato canónico ([formato](language/formatting.md))                                       |
| `import <path>`             | Importa archivos de Mermaid, PlantUML y Markdown ([importación](import/))                                                |
| `export <path>`             | Genera diagramas, historias y perfiles ([exportación](language/export.md))                                               |
| `layout <file>`             | Escribe la organización de ELK como instrucciones `place` ([disposición](language/layout.md))                            |
| `convert <file>`            | Copia un diagrama de flujo en uno libre, o escribe el JSON del modelo (`--to free\|json`)                                |
| `build catalog [path]`      | Escribe el catálogo HTML sin conexión ([catálogo](catalog.md))                                                           |
| `review [path]`             | Lista lo que cambió por id, con imágenes del antes y el después, desde una revisión de Git o la nube                     |
| `assets <subcommand>`       | Lista los paquetes de iconos y las fuentes, busca iconos, escribe el archivo de bloqueo ([recursos](language/assets.md)) |
| `assist <operation>`        | Ayuda opcional de IA en forma de propuestas que se aceptan en parte ([asistencia](assist.md))                            |
| `plugins [path]`            | Lista los plugins que instala un proyecto, lo que agregan y sus problemas ([plugins](plugins.md))                        |
| `login`, `logout`, `whoami` | Inician sesión en el servicio de la nube, revocan y olvidan el token, dicen para quién es el token                       |
| `push [folder]`             | Hace que un proyecto de la nube coincida con la carpeta                                                                  |
| `pull [id] [folder]`        | Escribe los archivos de un proyecto de la nube en una carpeta                                                            |
| `publish [folder]`          | Publica el catálogo como una página web del servicio de la nube                                                          |
| `projects`                  | Lista tus proyectos de la nube                                                                                           |
| `skill install [carpeta]`   | Da a los agentes de programación de un proyecto la skill que dibuja diagramas de Meltemi ([agentes](agents.md))          |
| `skill prompt`              | Imprime el prompt que sigue un agente para instalar la skill y demostrar que funciona ([agentes](agents.md))             |

Las cinco filas antes de las dos últimas son [los comandos de la nube](#los-comandos-de-la-nube).

Procesar repositorios que no son de confianza es seguro: nada de un proyecto se ejecuta, lee fuera
de él ni accede a la red, y los tamaños están acotados ([seguridad](security.md)). Los comandos que
usan la red lo hacen solo cuando los ejecutas: `assist` y los comandos de la nube, que hablan con un
solo servicio y le envían un token solo a él. Un error inesperado imprime su mensaje sin secretos
(un token de API se muestra como `mdg_…`) y termina con el código 70 (`MELTEMI_DEBUG=1` agrega la
pila).

Códigos de salida: 0 cuando todo fue bien, 1 cuando hubo hallazgos (errores, importaciones
parciales, diagramas omitidos, cambios con `review --exit-code`) o un comando de la nube fue
rechazado o falló, 2 ante errores de uso y rutas ilegibles, y 3 cuando un comando de la nube
necesita que inicies sesión: nadie ha iniciado sesión, o el servicio rechazó el token (ejecuta
`login`).

## Idiomas

Todos los comandos admiten `--lang en|es`, en cualquier lugar entre sus argumentos. Fija el idioma
de la ayuda, los mensajes, los resúmenes, las preguntas y los diagnósticos del comando, y el de las
palabras que agrega a los archivos que escribe (las líneas de tipo de las entidades C4, los
controles de los reproductores HTML, los encabezados y la búsqueda del catálogo, el informe de
revisión), por encima del `"locale"` del proyecto
([proyectos](language/projects.md#idioma-de-las-exportaciones)). Cualquier otro valor es un error de uso
(código 2).

Sin `--lang`, los mensajes siguen `MELTEMI_LANG`, luego la primera de `LC_ALL`, `LC_MESSAGES` y
`LANG` que nombre un idioma (`C` y `POSIX` no lo nombran), luego el idioma del sistema y, si no, el
inglés. Los archivos siguen al proyecto, o el inglés cuando el proyecto no dice nada, y nunca el
idioma de la máquina, así que el mismo código fuente da los mismos archivos en todas partes. Los
códigos, los códigos de salida y las claves de `--format json` son iguales en los dos idiomas. Las
confirmaciones aceptan `y` y `yes`, además de `s`, `si` y `sí`.

```bash
pnpm mdg export architecture --lang es --out site
```

## Empezar: `init`

```bash
pnpm mdg init architecture --template purchase
```

`init` escribe `project.json` (el nombre de la carpeta, o `--name`; la versión del lenguaje; el
rango de versiones de esta CLI) y las hojas de la plantilla, e imprime los siguientes comandos.
Nunca reemplaza un archivo: si alguno ya existe, no se escribe nada.

| Plantilla  | Hojas                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `flow`     | `diagrams/overview.meltemi`: un primer diagrama de flujo (la predeterminada)                                                                                                                     |
| `c4`       | `models/system.meltemi` y `diagrams/views.meltemi`: un modelo, una vista de contexto y una de contenedores                                                                                       |
| `sequence` | `diagrams/sign-in.meltemi`: una secuencia con un escenario para cada resultado                                                                                                                   |
| `free`     | `diagrams/slide.meltemi`: una diapositiva 16:9 con texto, cajas, un icono y un grupo                                                                                                             |
| `purchase` | El ejemplo de referencia: modelo, vistas de contexto y de contenedores, secuencia de pago con escenarios, diapositiva ejecutiva, historia animada, perfiles PDF, PNG y MP4, ajustes del catálogo |

`--list` imprime cada una con su título, para qué sirve y lo que contiene, como las muestra Nuevo
proyecto en el playground, por ejemplo `Modelo C4 — Un modelo de arquitectura con una vista de
contexto y una vista de contenedores (1 modelo, 2 vistas)`.

`--ci github` o `--ci gitlab` también escribe un flujo de trabajo de CI (más abajo); en un proyecto
existente, `init --ci <service>` solo escribe el flujo de trabajo.

## Vista previa: `preview`

```bash
pnpm mdg preview architecture --open
```

El catálogo del proyecto se sirve en `http://127.0.0.1:4317/` (`--port`, o `0` para un puerto
libre) y se vuelve a generar cada vez que cambia una hoja, `project.json`, el archivo de bloqueo o un
recurso; las páginas abiertas se recargan en la misma página y la misma posición de desplazamiento,
y la terminal muestra los diagnósticos de cada generación. Un archivo se abre en su primer
diagrama. El servidor escucha solo en esta máquina y solo responde a solicitudes dirigidas a
`127.0.0.1` o `localhost`. Ctrl+C lo detiene. En VS Code, el lienzo junto al código es la vista en
vivo de un archivo ([editor.md](editor.md)).

## Proyectos completos

`validate`, `format`, `import`, `export` y `build catalog` admiten una carpeta:

| Comando                                              | Hace                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm mdg validate architecture --strict`            | todos los archivos del proyecto, `project.json` y los recursos                 |
| `pnpm mdg format architecture --check`               | lista los archivos que cambiarían                                              |
| `pnpm mdg import legacy --out architecture/imported` | todos los `.mmd`, `.puml` y `.md` dentro de `legacy`, conservando las carpetas |
| `pnpm mdg export architecture --out site`            | todos los diagramas de todos los archivos, como `site/<folders>/<file>.svg`    |
| `pnpm mdg export architecture --format png`          | lo mismo en PNG, junto a cada archivo, en una sola sesión del navegador        |
| `pnpm mdg export architecture --profiles`            | todos los perfiles `export` de todos los archivos                              |

En una carpeta, los archivos sin diagramas (modelos, temas, historias) se pasan por alto, y
`--diagram`, `--story`, `--scenario` y `--stdout` se rechazan: eligen dentro de un solo archivo. Al
importar una carpeta, los archivos `.iuml` de PlantUML se leen a través de los archivos que los
incluyen y los archivos Markdown sin bloques de diagramas se pasan por alto; el resumen cuenta las
hojas completas, parciales, fallidas y ya existentes.

## JSON del modelo: `convert --to json`

```bash
pnpm mdg convert diagrams/overview.meltemi --to json
```

escribe `diagrams/overview.model.json`, el modelo del archivo en el formato de intercambio
([JSON del modelo](language/model-json.md)): todos los diagramas sin errores, los temas, los
modelos y las historias, y los diagnósticos. `--out <file>` lo escribe en otro lugar y `--stdout`
lo imprime. Un archivo con errores también obtiene su JSON, con los errores listados, y el comando
termina con el código 1. `convert --to free` copia un diagrama de flujo, tal como está dibujado, en
uno libre ([libre](language/free.md)).

## Revisión: `review`

```bash
pnpm mdg review architecture --base main --out review
```

`review` compara un proyecto, una carpeta o un archivo con una versión anterior y lista lo que
cambió por id: diagramas, elementos, relaciones, entidades, historias, escenas, temas y perfiles de
exportación.

```text
~ diagrams/containers.meltemi
    diagram containers
        ~ element shop.api "Pedidos API": label "API de pedidos" → "Pedidos API"
        ~ element shop.db "Pedidos": moved
~ diagrams/purchase.meltemi
    diagram purchase
        > element bank → issuer "Banco"
+ diagrams/overview.meltemi
    + diagram overview: flow
> stories/tour.meltemi → stories/walkthrough.meltemi
4 files changed: 1 added, 0 removed, 1 renamed, 2 changed.
```

`+` agregado, `-` quitado, `>` renombrado, `~` cambiado. Como los ids son explícitos, un elemento
cuyo id cambió pero que conservó su tipo y su etiqueta, posición, descripción o relaciones es un
cambio de nombre, no una eliminación y una adición; las relaciones y los destinos de las historias
siguen los cambios de nombre. Cada cambio dice qué cambió: etiquetas, tipos, descripciones,
tecnología, URL, enlaces, clases, grupos, posiciones, tamaños, rutas, posiciones de las etiquetas,
estilos, efectos, ajustes del diagrama, escenarios, tiempos y acciones de las historias. Los
comentarios y el formato no son cambios.

| Opción               | Significado                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--base <revision>`  | La versión anterior, desde Git: un commit, una rama o un tag (`HEAD` de forma predeterminada)                     |
| `--base cloud[:<n>]` | La versión anterior, desde el proyecto de la nube: sus archivos de ahora (`cloud`) o su versión `n` (`cloud:3`)   |
| `--project <id>`     | Con `--base cloud`: el proyecto de la nube, en vez del que nombra `project.json`                                  |
| `--host <url>`       | Con `--base cloud`: el servicio, como en [los comandos de la nube](#el-host-y-el-token)                           |
| `--before <path>`    | La versión anterior, desde otra carpeta u otro archivo, sin Git                                                   |
| `--out <folder>`     | Escribe `index.html` con los cambios y, para cada diagrama cambiado, `<file>/<diagram>.before.svg` y `.after.svg` |
| `--json`             | Un solo objeto JSON: los archivos, sus cambios y un resumen                                                       |
| `--exit-code`        | Terminar con el código 1 cuando algo cambió                                                                       |

En las imágenes, los elementos y las relaciones que cambiaron se resaltan con un contorno: los
agregados en verde, los quitados en rojo, los renombrados en azul y los cambiados en ámbar. La
página nombra las versiones comparadas, nunca rutas locales.

`--base cloud` compara la carpeta con los archivos que tiene ahora el proyecto de la nube, y
`--base cloud:3` con su versión 3: es la forma de ver qué cambió alguien en la página antes de que
lo sobrescribas con un push. La revisión es la misma, por id, y `--out`, `--json` y `--exit-code`
funcionan como antes. El proyecto de la nube es el que nombra `project.json`, o `--project`; el
servicio y el inicio de sesión son los de los [comandos de la nube](#los-comandos-de-la-nube).
`--project` y `--host` solo valen con `--base cloud` (si no, son un error de uso), y `--base` no se
puede combinar con `--before`. El proyecto de la nube se lee una vez antes de comparar nada: una
ruta suya que no se queda dentro de la carpeta falla con `pull.unsafe-path` y no compara nada, y un
proyecto o una versión que no existe falla con el código de salida 1. Si nadie ha iniciado sesión,
el código de salida es 3.

## Asistencia: `assist`

`assist generate`, `modify`, `relations` y `explain` consultan a un proveedor de IA opcional y
convierten la respuesta en una propuesta que aceptas en parte (`--save` y luego
`assist apply <proposal> --items 1,3`, o `--apply` de inmediato). Lo que se envía se imprime
primero y necesita tu sí, o `--yes`; las claves solo vienen del entorno. Consulta
[assist.md](assist.md).

## Skill de agentes

`skill install [carpeta]` escribe la skill `meltemi-diagrams` en la carpeta (la de trabajo por
defecto), en las carpetas de las que los agentes leen las skills: `.claude/skills/meltemi-diagrams/`
para Claude Code, `.agents/skills/meltemi-diagrams/` para Codex, Cursor, GitHub Copilot, Gemini
CLI, Devin Desktop (antes Windsurf) y cualquier otro agente que lea `.agents/skills`. `--agent`
acepta `claude`, `codex`, `cursor`, `copilot`, `gemini`, `windsurf`, `devin`, `agents` o `all` (el
valor por defecto), varios en una lista separada por comas o repitiendo la opción, y escribe cada
carpeta una vez; un nombre desconocido o vacío es un error de uso que los enumera. `--user` la
instala en tus propias carpetas (`~/.claude/skills`, `~/.agents/skills`), y `--force` reemplaza
una copia que ya está (solo la carpeta de la skill; sin él, el comando se niega con el código de
salida 2 y no escribe nada). El comando escribe solo carpetas de skills, nunca un archivo de
instrucciones del proyecto, y el texto instalado nombra esta línea de comandos (`mdg validate`,
`mdg preview`).

`skill prompt` imprime el prompt de configuración para agentes, el texto que un agente de
programación lee y sigue para instalar la skill y demostrar que dibuja, que también sirve
`https://diagrams.meltemi.dev/agent-setup/prompt.md`; no recibe argumentos. Consulta
[agents.md](agents.md).

## Los comandos de la nube

El [servicio en la nube](cloud.md) guarda proyectos en línea, para abrirlos en la página,
compartirlos y publicarlos. Para quien desarrolla, el repositorio es la verdad y la nube su reflejo,
así que estos comandos envían una carpeta, traen de vuelta lo que alguien dibujó en la página y
publican el catálogo, mediante la API que usa la página, con un token de API. Ningún otro comando
habla con el servicio, salvo `review --base cloud`.

### El ciclo del desarrollador

```bash
pnpm mdg login                              # una vez por equipo y servicio
pnpm mdg push architecture --create         # crea el proyecto de la nube y lo anota en project.json
pnpm mdg push architecture                  # después: lista lo que difiere, pregunta, envía
pnpm mdg review architecture --base cloud   # lo que alguien cambió en la página, por id
pnpm mdg pull architecture                  # trae esos archivos a la carpeta
pnpm mdg publish architecture --slug shop   # genera el catálogo y lo publica
```

`push --create` escribe un ajuste `cloud` en `project.json`
([proyectos](language/projects.md#el-proyecto-de-la-nube)). Haz commit de ese archivo, y cada clon y cada trabajo de CI sabrán qué proyecto refleja la carpeta. Haz
push desde la CI cuando se fusione una rama ([más abajo](#enviar-a-la-nube-en-cada-fusión)) y la
nube sigue al repositorio: la página, los enlaces para compartir y el catálogo publicado muestran lo
que contiene `main`. Cuando alguien dibuja en la página, `review --base cloud` muestra lo que difiere
por id y `pull` lo trae a la carpeta, para subirlo como cualquier otro cambio. En la carpeta no se
esconde nada más que ese ajuste, y nada de la nube se sobrescribe sin que te lo hayan mostrado antes,
o sin forzarlo.

### Iniciar sesión: `login`, `logout` y `whoami`

```bash
pnpm mdg login
```

`login` crea un token de API para este equipo en cuatro pasos:

1. Escucha en `127.0.0.1`, en un puerto libre, una sola solicitud, y genera un `state` aleatorio.
2. Imprime una comprobación de seis caracteres y luego abre `<host>/cli-auth?port=<port>&state=<state>`
   en tu navegador. La página de aprobación muestra los mismos seis caracteres: aprueba solo si
   coinciden, porque eso te dice que la solicitud es la que hizo esta terminal. Con `--no-browser`
   imprime la dirección y la abres tú, en este mismo equipo, porque la aprobación vuelve al listener
   de `127.0.0.1`.
3. Cuando apruebas, la página envía el navegador al listener con un código de un solo uso. El
   listener toma un `GET /` que lleve un `code` y un `state` y esté dirigido a `127.0.0.1` y a su
   propio puerto, y deja de escuchar. Un `state` que no es el de esta solicitud se rechaza
   (`login.state-mismatch`).
4. El comando cambia el código una sola vez, en `POST /cli-auth/token`, pregunta con
   `GET /api/session` para quién es el token y guarda el token, su id y el nombre en
   [el archivo de credenciales](#el-host-y-el-token). Al navegador se le muestra una página que dice
   que ya puedes volver a usar la terminal, en su idioma, y el comando imprime
   `Sesión iniciada como Ana (https://diagrams.meltemi.dev)`.

El token no aparece nunca en una dirección y el código no se imprime nunca. La espera termina a los
cinco minutos (`login.timeout`). Un código que el servicio rechaza (`cli.invalid`: desconocido, ya
usado o de más de cinco minutos), demasiados intentos fallidos (`cli.rate`), una cuenta que ya tiene
20 tokens (`quota.tokens`: revoca uno en la página) y un token que no se pudo guardar
(`login.not-stored`: se revoca de nuevo) fallan con el código de salida 1 y no guardan nada.

En un equipo sin navegador, crea un token en el diálogo de **Tokens de API** de la página y envíalo
por una tubería:

```bash
printf '%s' "$TOKEN" | pnpm mdg login --token
```

`--token` lee el token de la entrada estándar, nunca de un argumento, así que no queda en el
historial del shell ni en la lista de procesos. En una terminal te pide que lo pegues. Comprueba que
el texto tenga forma de token (`mdg_` y caracteres base64url), pregunta con `GET /api/session` por su
id y su propietario, y los guarda como lo hace el inicio de sesión con el navegador.

`MELTEMI_TOKEN` en el entorno tiene prioridad sobre cualquier token guardado, que es lo que usa la
CI. Mientras está definido, `login` se niega (`login.environment-token`), porque nada de lo que
guardara se usaría.

`logout` revoca el token guardado en el servicio (`DELETE /api/tokens/<id>`) y lo olvida. Solo una
respuesta que zanja el asunto deja ir la entrada: el token revocado, o `401 token.invalid`, que dice
que el servicio ya no lo conoce. Cuando no se puede llegar al servicio, o falla, no se olvida nada
(`logout.not-revoked`, código de salida 1, con el nombre del archivo), para poder revocar el token
más tarde, con otro `logout` o en la página. Si nadie ha iniciado sesión no hace nada y termina con 0. `MELTEMI_TOKEN` nunca se revoca ni se cambia.

`whoami` pregunta al servicio para quién es el token e imprime el nombre y el alias (`handle`:
`Ana (@ana)`, o `Ana (sin handle todavía)`) y el host, y avisa cuando el token vino de
`MELTEMI_TOKEN`. Nunca imprime el token. También te dice si el token sigue funcionando.

### El host y el token

Cada comando de la nube habla con un solo host: `--host`, si no `MELTEMI_HOST` (vacío cuenta como no
definido), si no `https://diagrams.meltemi.dev`. Un host es un origen: `https:`, o `http:` solo para
`127.0.0.1`, `localhost` o `[::1]` (el servicio de desarrollo es `http://localhost:8788`). Cualquier
otra cosa falla antes de hacer ninguna solicitud (`cloud.host-invalid`, `cloud.insecure-host`).

El `cloud.host` de `project.json` nombra el servicio que refleja un proyecto, pero nunca decide
adónde va un token. Cuando es otro host que el que resolvió el comando, este falla con
`cloud.host-mismatch`, nombrando los dos hosts y `--host`, antes de cualquier solicitud; así, un
repositorio que clonaste no puede hacer que tu token viaje a ningún sitio.

El token es `MELTEMI_TOKEN`, si no la entrada guardada para el host. Sin ninguno, el comando dice que
ejecutes `login` y termina con 3 (`cloud.not-signed-in`); un token que el servicio rechaza, porque no
lo conoce o fue revocado, recibe el mismo consejo y el mismo código de salida (`token.invalid`). Un
token va solo al host resuelto, nunca por `http:` salvo al loopback, y nunca adonde apunte una
redirección (`cloud.redirect`: no se siguen las redirecciones). Cada solicitud tiene un límite de
tiempo y cada respuesta se lee con un límite de tamaño
([seguridad](security.md#la-línea-de-comandos-y-la-nube)).

`login` guarda el token en `credentials.json`, en tu carpeta de configuración, con una entrada por
host:

| Sistema        | Archivo                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Windows        | `%APPDATA%\meltemi-diagrams\credentials.json`                                                                                         |
| Otros sistemas | `$XDG_CONFIG_HOME/meltemi-diagrams/credentials.json` cuando es una ruta absoluta, si no `~/.config/meltemi-diagrams/credentials.json` |

Una entrada contiene el token, su id en el servicio (el que revoca `logout`) y el `sub` y el nombre
de la cuenta. Donde el sistema tiene modos de archivo, el archivo es `0600` en una carpeta `0700`;
Windows conserva los permisos que le da tu carpeta de perfil, y el comando no cambia nada ahí. El
archivo se escribe mediante un archivo temporal y un renombrado, así que un fallo nunca deja medio
archivo, y las entradas de otros hosts y los campos que no conoce se conservan tal como estaban. Un
archivo que no contiene credenciales válidas se informa con su ruta (`credentials.corrupt`) y nunca se
sobrescribe. Es el único lugar donde se escribe un token.

### Reflejar una carpeta: `push`

```bash
pnpm mdg push architecture --create
```

`push [folder] [--create [--name <n>]] [--project <id>] [--force] [--check] [--strict] [--host <url>]`
hace que el proyecto de la nube coincida con la carpeta, en una sola transacción.

**Qué se envía.** El proyecto de la carpeta tal como lo lee `validate`: `project.json`, las fuentes,
los temas y los demás archivos de texto (`.meltemi`, `.json`, `.md`, `.txt`, `.svg`, `.css`) viajan
por su contenido; las imágenes y las fuentes (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.woff2`,
`.ttf`, `.otf`, hasta 10 MiB cada una), por su hash. Nunca se envían: `.git` y cualquier otro nombre
que empiece por punto, `node_modules`, lo que nombra el `exclude` de `project.json`, la carpeta de
salida del catálogo (`catalog.out`) y los enlaces, que nunca se siguen. Un archivo de otro tipo (un
PDF, una exportación) no se guarda en la nube, y el push dice cuántos hay, con ejemplos. Un archivo
que la nube rechazaría (un nombre que no cumple [la regla de los paths](cloud.md#la-regla-de-los-paths),
un texto que no es UTF-8, un archivo que no se puede leer) se lista como
`advertencia: <ruta> no se envía`, no se envía nunca, y nunca hace que el push borre el archivo de la
nube con ese nombre. Los límites de la nube ([cuotas](cloud.md#cuotas-y-límites)) se comprueban antes
de cualquier solicitud y se rechazan con los códigos propios del servicio, nombrando la ruta cuando
la hay: un texto de más de 2 Mi caracteres o textos que suman más de los 16 MiB de un documento
(`doc.too-large`), una imagen o una fuente de más de 10 MiB (`quota.binary`), más de 2000 archivos
(`quota.files`).

**Qué proyecto.** `--project <id>`, si no el `cloud.project` de `project.json`. Una carpeta que no
nombra ninguno, sin `--project` ni `--create`, falla con `cloud.no-project`, que nombra las dos
opciones.

**Comparar, y luego preguntar o rechazar.** Antes de cambiar nada, `push` trae una sola vez los
archivos y la revisión del proyecto de la nube y compara cada ruta del conjunto que se envía: el
texto por su contenido, las imágenes y las fuentes por su hash, y las rutas que solo tiene la nube
como borrados. Las rutas que difieren se listan, con la revisión por id de los diagramas al lado:

```text
The cloud project differs from the folder in 2 paths:
  diagrams/containers.meltemi differs
  project.json differs
By id, what pushing changes in the diagrams:
~ diagrams/containers.meltemi
    diagram containers
        ~ element shop.api "Pedidos API": label "API de pedidos" → "Pedidos API"
1 file changed: 0 added, 0 removed, 0 renamed, 1 changed.
Overwrite these changes in the cloud? [y/N]
```

La revisión solo ve los diagramas, así que una diferencia en `project.json`, en un comentario o en
una imagen está en la lista de rutas y no en la revisión. Cuando la nube ya coincide con la carpeta
no hay nada que enviar ni que preguntar. Si no, en una terminal,
`push` hace la pregunta de arriba (`y`, `yes`, `s`, `si` y `sí` son un sí); sin terminal se rechaza
con el código de salida 1 (`push.differs`) salvo que pases `--force`. Un proyecto creado en la página
no tiene ajuste `cloud` en su `project.json`, así que tras un `pull` el primer push lista
`project.json` como distinto, porque `pull` agregó el ajuste a la copia de la carpeta; di que sí una
vez y los dos coinciden.

**Una transacción.** Primero se suben las imágenes y las fuentes que difieren (una subida se omite
cuando el proyecto ya tiene esos bytes: `HEAD …/blobs/<hash>` responde 200), y luego un solo
`PUT …/files` lleva los textos que difieren, los hashes y los borrados con `ifRevision`, la revisión
que trajo `push`. Si alguien cambió el proyecto entretanto (`409 revision.mismatch`), no se aplica
nada: `push` vuelve a traer, vuelve a comparar y vuelve a preguntar, una vez. Un segundo desajuste
termina con `revision.mismatch` y el código de salida 1, sin haber sobrescrito nada. `--force` vale
por la respuesta sí, así que con él también se envía la segunda comparación.

**`--check`** hace la misma comparación, la imprime, no escribe nada y termina con 1 cuando algo
difiere y con 0 cuando nada difiere. No se puede combinar con `--create`.

**Validación.** La carpeta se valida como lo hace `validate`, y sus diagnósticos se imprimen antes de
la comparación. Los errores no detienen el push, porque la página también los muestra y un diagrama
a medio hacer en la nube es mejor que uno desactualizado; `--strict` lo detiene cuando hay errores o
archivos que no se pueden enviar (`push.strict`, código de salida 1, no se envía nada). A diferencia
de `validate --strict`, las advertencias no cuentan.

**`--create`** crea primero el proyecto de la nube, con los archivos de texto de la carpeta, con el
nombre de `--name`, si no el `name` de `project.json`, si no el de la carpeta. Anota
`cloud: { host, project }` en `project.json`, conservando la sangría, los finales de línea y todos
los demás bytes del archivo (una carpeta sin `project.json` recibe uno mínimo), y luego envía lo que
falta, las imágenes y las fuentes y el manifiesto con su nuevo ajuste, sin preguntar, porque el
proyecto nuevo no tiene nada que la carpeta no haya mostrado. Imprime
`Se creó el proyecto <id> en la nube (<name>).` y, al final, `Ábrelo en <host>/p/<id>`. Un `project.json`
que ya nombra un proyecto de la nube es `push.already-linked`; `--create` con `--project` o `--check`
es un error de uso. Si el proyecto se creó pero `project.json` no se pudo actualizar
(`push.manifest-not-written`), el mensaje nombra el proyecto y las líneas que hay que agregar.

Cambiar archivos necesita el rol de editor en el proyecto, o ser el propietario (si no,
`access.denied`); un proyecto que no existe, o que no puedes abrir, es `project.not-found`, la misma
respuesta para los dos casos.

### Traer un proyecto de vuelta: `pull`

```bash
pnpm mdg pull k4c2w7x5q3y6m2n5r7d4 architecture
```

`pull [<id>] [folder] [--version <n>] [--force] [--host <url>]` escribe los archivos de un proyecto
de la nube en una carpeta. El proyecto es `<id>` (20 letras minúsculas y dígitos) o el que nombra
`project.json`; con un solo argumento, es el id cuando tiene esa forma y la carpeta si no. La carpeta
es la de trabajo de forma predeterminada y se crea si falta. Un id que no es el `cloud.project` del
`project.json` de la carpeta se rechaza (`pull.other-project`): traerlo mezclaría dos proyectos.

**Cada ruta se comprueba antes de escribir nada.** Una ruta que responde la nube debe tener la forma
que guarda la nube ([la regla de los paths](cloud.md#la-regla-de-los-paths): relativa, separada por
`/`, nada oculto, sin `..`), ser un nombre que Windows pudiera guardar (sin punto ni espacio al
final, sin nombres de dispositivo como `con`, `nul` o `com1`), no diferir de otra ruta solo en las
mayúsculas, no ser un archivo donde otra ruta necesita una carpeta, resolverse dentro de la carpeta
y no pasar por un enlace de la carpeta. Una sola ruta que falle rechaza todo el pull con
`pull.unsafe-path`, nombrándola, con el código de salida 1 y sin escribir nada, ni siquiera la
carpeta. La nube ya rechaza esas rutas; la línea de comandos no lo da por hecho, porque un proyecto
puede escribirlo cualquiera que lo edite y la carpeta es tuya.

Después, archivo por archivo. Un archivo que le falta a la carpeta se escribe, y las imágenes y las
fuentes se traen por su hash y se comprueban contra él. Un archivo idéntico se deja como está. Un
archivo que existe y difiere se lista (`se conservó <ruta> (difiere de la nube)`) y no se escribe
salvo con `--force`, y el código de salida es 1; una carpeta donde debería ir un archivo también se
conserva. Los archivos que solo tiene la carpeta se quedan: `pull` nunca
borra. Cada archivo se escribe mediante un archivo temporal y un renombrado. Las copias que dos
personas hicieron a la vez en la nube (`<path>~<id>`) se omiten con una nota: resuélvelas en la
página.

`--version <n>` trae la versión `n` del proyecto en vez de sus últimos archivos (`version.not-found`
cuando no tiene esa versión). `project.json` recibe `cloud: { host, project }` cuando no lo tiene, y
nada más de él cambia; un proyecto sin `project.json` deja la carpeta sin uno, y el comando te pide
que des el id la próxima vez. Termina con un resumen como
`Se trajeron los últimos archivos del proyecto <id> de la nube a <carpeta>: 5 escritos, 0 ya idénticos, 0 conservados.`

### Publicar: `publish`

```bash
pnpm mdg publish architecture --slug shop --handle ana
```

`publish [folder] [--slug <name>] [--handle <name>] [--project <id>] [--force] [--strict]` y
`publish --unpublish [--slug <name>]` publican el catálogo del proyecto de la carpeta como una página
web pública del servicio, en `https://<publish host>/<handle>/<slug>/`
([publicación](cloud.md#publicación)). Es el catálogo que escribe `build catalog`, enviado para el
proyecto de la nube que nombra `project.json`, o `--project`, que debe ser tuyo: publicar es del
propietario. Los pasos, en orden:

1. El proyecto y la sesión: el host, `cloud.host-mismatch` y el token fallan antes de cualquier
   solicitud.
2. `--unpublish` termina aquí: un `DELETE` para la página que nombra `--slug`, sin generar ni enviar
   nada (`publish.not-published` cuando el proyecto no publica nada con ese nombre). No se puede
   combinar con `--handle`, `--force` ni `--strict`.
3. La ruta del propietario `GET …/publish`: un proyecto que no puedes publicar (`access.denied`,
   `project.not-found`) falla antes de generar el catálogo, y la respuesta dice si tienes un alias.
4. El catálogo se genera en memoria exactamente como lo genera `build catalog`, y se imprimen sus
   diagnósticos. Un proyecto sin nada que dibujar (`publish.empty`), con errores bajo `--strict`
   (`publish.errors`) o con un catálogo de más de los 16 MiB que puede tener una página
   (`publish.too-large`: deja cosas fuera con `catalog.exclude`) falla sin enviar ni publicar nada.
5. El alias (`handle`). La primera publicación necesita uno, la primera parte de cada dirección que
   publicas, y es público: da `--handle`, o responde la pregunta en una terminal (tres intentos); si
   no, `handle.required`. Con `--handle` el comando lo fija primero (`Handle elegido: ana`). El
   servicio deja que un token de API lo elija. Si un servicio responde
   `403`, el comando lo dice (`publish.handle-in-page`): elígelo una vez en el diálogo de
   publicación del proyecto, en la página, y vuelve a ejecutar `publish`. `handle.taken`,
   `handle.invalid` y `handle.locked` (un alias no puede cambiar mientras haya páginas publicadas
   con él: despublícalas antes) se muestran tal cual.
6. La carpeta se envía cuando difiere del proyecto de la nube, como lo hace `push`, con la misma
   comparación y la misma pregunta (`--force` la responde y `--strict` se aplica), de modo que lo
   que se publica es lo que tiene la nube.
7. `PUT …/publish` envía la página. El comando imprime una línea de resumen y luego la dirección
   pública en una línea propia, la última que imprime.

El nombre de la página (`slug`) tiene de 1 a 60 letras minúsculas, dígitos y guiones: `--slug`, si no
el nombre del proyecto simplificado (`diagrams` cuando no queda nada). Un proyecto puede publicar
varias páginas, una por cada `slug`; otro proyecto tuyo que publique ese `slug` es `publish.taken`.
Un proyecto puede publicarse diez veces por hora (`publish.rate`, con los segundos que hay que
esperar). Las páginas publicadas son públicas.

### Listar: `projects`

`projects [--json] [--host <url>]` lista los proyectos de la nube que puedes abrir, los tuyos y los
que comparten contigo, empezando por el que cambió más recientemente:

```text
ID                    NAME  ROLE    LAST CHANGE
k4c2w7x5q3y6m2n5r7d4  shop  owner   2026-10-15T09:41:02Z
```

El rol es propietario, editor o lector (`owner`, `editor` o `viewer` en el JSON y en la tabla en
inglés). Un nombre que contiene caracteres de control se muestra con espacios. Si no hay ninguno, el comando
sugiere `push --create`. `--json` imprime un objeto cuyas claves son estables:

```json
{
  "host": "https://diagrams.meltemi.dev",
  "projects": [
    {
      "id": "k4c2w7x5q3y6m2n5r7d4",
      "name": "shop",
      "description": "",
      "role": "owner",
      "updated_at": "2026-10-15T09:41:02.118Z"
    }
  ]
}
```

### Fallos y códigos de salida

Un comando de la nube termina con 0 cuando hizo lo que pediste, 1 cuando fue rechazado o falló, 3
cuando tienes que iniciar sesión y 2 ante un error de uso (una opción que no conoce, una carpeta que
`push` o `publish` no encuentran). Un fallo imprime una línea en la salida de error estándar,
formada por el comando, un código y una frase en el idioma de la interfaz:
`meltemi-diagrams push: push.differs: …`. Los códigos son estables y los mismos en los dos idiomas.
Estos son los propios de la línea de comandos:

| Código                         | Salida | Qué pasó                                                                                                           |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `cloud.host-mismatch`          | 1      | `project.json` nombra otro servicio que el que resolvió el comando; pasa `--host` con él para usarlo               |
| `cloud.host-invalid`           | 1      | El host no es un origen como `https://diagrams.meltemi.dev`                                                        |
| `cloud.insecure-host`          | 1      | El host es `http:` y no es el loopback: un token solo viaja por `https:`                                           |
| `cloud.not-signed-in`          | 3      | No hay `MELTEMI_TOKEN` ni token guardado para el host: ejecuta `login`                                             |
| `cloud.no-project`             | 1      | La carpeta no nombra ningún proyecto de la nube y no se dio `--project`: `push --create` crea uno                  |
| `cloud.unreachable`            | 1      | No se puede llegar al host (sigue el motivo del sistema)                                                           |
| `cloud.timeout`                | 1      | El host no respondió a tiempo                                                                                      |
| `cloud.response-too-large`     | 1      | El host envió más de lo que acepta la línea de comandos                                                            |
| `cloud.redirect`               | 1      | El host respondió con una redirección; un token nunca se envía adonde lleva                                        |
| `cloud.bad-response`           | 1      | La respuesta no es del servicio                                                                                    |
| `credentials.corrupt`          | 1      | El archivo de credenciales no se puede usar; corrígelo o bórralo, no se escribió nada sobre él                     |
| `credentials.unreadable`       | 1      | El archivo de credenciales no se puede leer                                                                        |
| `credentials.unwritable`       | 1      | El archivo de credenciales no se puede escribir, o no se puede crear su carpeta                                    |
| `login.timeout`                | 1      | No llegó ninguna aprobación en 5 minutos; no se guardó nada                                                        |
| `login.state-mismatch`         | 1      | La aprobación no traía el `state` de esta solicitud; no se cambió ni se guardó nada                                |
| `login.environment-token`      | 1      | `MELTEMI_TOKEN` está definido, así que nada de lo que guardara `login` se usaría                                   |
| `login.token-input`            | 2      | `--token` lee la entrada estándar y no hay ninguna: envía el token por una tubería                                 |
| `login.no-token`               | 1      | No se dio nada en la entrada estándar                                                                              |
| `login.not-a-token`            | 1      | Eso no es un token de API (empiezan por `mdg_`)                                                                    |
| `login.not-stored`             | 1      | El token no se pudo guardar, así que se revocó de nuevo                                                            |
| `login.not-stored-not-revoked` | 1      | El token no se pudo guardar ni revocar: revócalo en la página                                                      |
| `login.listener`               | 1      | El comando no puede escuchar la aprobación en este equipo                                                          |
| `logout.not-revoked`           | 1      | El token no se pudo revocar, así que se conservó (se nombra el archivo): ejecuta `logout` otra vez o usa la página |
| `push.differs`                 | 1      | El proyecto de la nube difiere de la carpeta, sin terminal para preguntar y sin `--force`                          |
| `push.declined`                | 1      | Respondiste que no; no se envió nada                                                                               |
| `push.already-linked`          | 1      | `--create`, y `project.json` ya nombra un proyecto de la nube                                                      |
| `push.strict`                  | 1      | `--strict`, y hay errores de validación o archivos que no se pueden enviar; no se envió nada                       |
| `push.manifest-invalid`        | 1      | `project.json` no es texto UTF-8 con un objeto JSON que se pueda editar; no se creó nada                           |
| `push.manifest-not-written`    | 1      | El proyecto se creó pero `project.json` no pudo recibir `cloud`; el mensaje trae las líneas que hay que agregar    |
| `push.file-changed`            | 1      | Un archivo cambió mientras se enviaba; no se guardó nada de él                                                     |
| `pull.unsafe-path`             | 1      | El proyecto de la nube contiene una ruta que no es segura dentro de la carpeta; no se escribió nada                |
| `pull.no-project`              | 1      | No se dio ningún id y el `project.json` de la carpeta no nombra ningún proyecto de la nube                         |
| `pull.other-project`           | 1      | El id no es el proyecto de la nube que nombra el `project.json` de la carpeta                                      |
| `pull.not-a-folder`            | 1      | El destino existe y no es una carpeta                                                                              |
| `pull.manifest-not-updated`    | 1      | Los archivos se escribieron pero `project.json` no pudo recibir `cloud`                                            |
| `pull.write`                   | 1      | Un archivo no se pudo escribir (siguen la ruta y el motivo)                                                        |
| `publish.handle-in-page`       | 1      | El servicio no dejó que un token de API eligiera el alias: elígelo en la página                                    |
| `publish.empty`                | 1      | Nada que publicar: ningún diagrama ni historia que se pueda dibujar                                                |
| `publish.errors`               | 1      | `--strict`, y el proyecto tiene errores; no se envió ni se publicó nada                                            |
| `publish.not-published`        | 1      | `--unpublish` de un nombre que el proyecto no publica                                                              |

Los códigos propios del servicio, tal como los encuentran los comandos, también se imprimen con una
frase propia (cualquier otro código se imprime tal como llegó, con el mensaje del servicio en
inglés; [errores del servicio](cloud.md#errores)):

| Código              | Salida | Qué pasó                                                                                                   |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `token.invalid`     | 3      | El servicio rechaza el token, porque no lo conoce o fue revocado: ejecuta `login`                          |
| `auth.required`     | 3      | El servicio necesita una persona con sesión iniciada y la solicitud no trae ninguna                        |
| `cli.invalid`       | 1      | Se rechazó el código de un solo uso: desconocido, ya usado o caducado                                      |
| `cli.rate`          | 1      | Demasiados intentos fallidos: espera los segundos que dice y ejecuta `login` otra vez                      |
| `quota.tokens`      | 1      | La cuenta ya tiene 20 tokens de API: revoca uno en la página                                               |
| `project.not-found` | 1      | El proyecto de la nube no existe, o no puedes abrirlo (una sola respuesta para los dos casos)              |
| `version.not-found` | 1      | El proyecto de la nube no tiene esa versión                                                                |
| `access.denied`     | 1      | Tu rol no lo permite: publicar, compartir, renombrar y borrar son del propietario                          |
| `revision.mismatch` | 1      | El proyecto volvió a cambiar mientras se enviaba, así que no se sobrescribió nada: ejecuta `push` otra vez |
| `quota.files`       | 1      | Un proyecto tiene como máximo 2000 archivos                                                                |
| `quota.binary`      | 1      | Una imagen o una fuente puede pesar como máximo 10 MiB                                                     |
| `quota.storage`     | 1      | La cuenta superaría sus 200 MiB de almacenamiento                                                          |
| `quota.projects`    | 1      | La cuenta ya tiene 100 proyectos                                                                           |
| `doc.too-large`     | 1      | Un texto de más de 2 Mi caracteres, o textos que superan los 16 MiB que guarda el documento de un proyecto |
| `path.invalid`      | 1      | Una ruta que la nube no guarda                                                                             |
| `binary.invalid`    | 1      | Una subida que no es un PNG, JPEG, GIF, WebP, woff2, ttf u otf según sus bytes                             |
| `handle.required`   | 1      | Todavía no tienes alias: da `--handle`, o ejecuta `publish` en una terminal para que te lo pregunte        |
| `handle.taken`      | 1      | Otra cuenta tiene el alias: elige otro con `--handle`                                                      |
| `handle.locked`     | 1      | El alias no puede cambiar mientras haya páginas publicadas con él: despublícalas antes                     |
| `handle.invalid`    | 1      | Un alias tiene de 3 a 30 letras minúsculas, dígitos y guiones                                              |
| `publish.too-large` | 1      | El catálogo supera los 16 MiB que puede tener una página; no se envió nada                                 |
| `publish.rate`      | 1      | Un proyecto se puede publicar diez veces por hora; inténtalo de nuevo dentro de los segundos que dice      |
| `publish.taken`     | 1      | Otro proyecto tuyo ya publica ese nombre: elige otro con `--slug`                                          |

## Integración continua

```bash
pnpm mdg init architecture --ci github
```

escribe `.github/workflows/meltemi-diagrams.yml` en la raíz del repositorio con la ruta del
proyecto. En cada push y cada pull request instala `@meltemi/diagrams-cli` en la versión de esta
CLI, valida con `--strict`, revisa las pull requests contra su rama base (en el resumen del job y en
una carpeta `review`), genera el catálogo y guarda `catalog` y `review` como artefactos. La rama
base llega al script mediante `$GITHUB_BASE_REF`, nunca escrita en él. Hay pasos comentados que
instalan FFmpeg y ejecutan todos los perfiles de exportación.

`--ci gitlab` escribe `.gitlab-ci.yml`, o `.gitlab/meltemi-diagrams.yml` cuando ya existe un
pipeline, e imprime el `include` que lo agrega. Los flujos de trabajo existentes nunca se
reemplazan.

### Enviar a la nube en cada fusión

```bash
pnpm mdg init architecture --ci github --cloud
```

agrega un trabajo más al flujo de trabajo, lo último del archivo: en un push a la rama
predeterminada del repositorio ejecuta `meltemi-diagrams push "$PROJECT" --force --strict`, para que
el proyecto de la nube siga al repositorio. El trabajo lee el token de los secretos de la CI como
`MELTEMI_TOKEN` y no escribe ninguno en el archivo: en GitHub `${{ secrets.MELTEMI_TOKEN }}`, con la
variable opcional de repositorio `MELTEMI_HOST` para nombrar otro servicio que
`https://diagrams.meltemi.dev` (una variable, no un secreto); en GitLab el trabajo
`meltemi-diagrams-cloud` se ejecuta en los pipelines de la rama predeterminada y lee `MELTEMI_TOKEN`,
que conviene guardar como variable de CI/CD enmascarada y protegida, y la opcional `MELTEMI_HOST`.
`--cloud` va junto con `--ci` (sin él es un error de uso), y sin `--cloud` el flujo de trabajo es
exactamente el que era. El proyecto tiene que haberse enviado una vez desde un equipo
(`push --create`) y su `project.json` estar en el repositorio, para que el trabajo conozca el
proyecto. El flujo de trabajo de
GitHub arranca solo con los push a `main`, así que edita las `branches` de `on:` si tu rama
predeterminada se llama de otro modo.

Crea el token para el trabajo en el diálogo de **Tokens de API** de la página, que lo muestra una
sola vez, y guárdalo en los secretos del repositorio. Un token actúa como tú en todo lo que permite
la API y no está limitado a un proyecto: ponle el nombre del repositorio y revócalo si el secreto se
filtra.

**Por qué `--force --strict`.** El repositorio es la verdad. Un push pregunta antes de sobrescribir
lo que tiene la nube y le falta a la carpeta, un diagrama que alguien dibujó en la página, y la CI no
puede responder: sin terminal el push se rechazaría y el trabajo fallaría siempre, así que el
trabajo lleva `--force`. `--strict` mantiene fuera de la nube un proyecto roto: el trabajo falla ante
errores de validación y ante archivos que no se pueden enviar, y lo que tenía la nube se queda.
Todo lo que cambió la página desde la última fusión se sobrescribe, así que haz `pull` antes si debe
sobrevivir (`review --base cloud` lo lista). Para saber si la nube se ha desviado, `push --check`
termina con 1 cuando algo difiere y no escribe nada.

import { plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";
import { pushPullEs } from "./push-pull-es.js";

/** A count with its word: "1 archivo", "3 archivos". */
const count = (n: number, one: string, other: string) => `${n} ${plural("es", n, { one, other })}`;
/** A list of ids or names, or the word for none when it is empty. */
const listOrNone = (items: readonly string[], none = "ninguno") => items.join(", ") || none;
const quoted = (ids: readonly string[]) => ids.map((id) => `"${id}"`).join(", ");
/** The verb of a summary by count: "Se revisó 1 archivo", "Se revisaron 3 archivos". */
const verb = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const es: typeof en = {
  help: {
    main: (name, alias) => `Uso: ${name} <comando> [opciones]
Alias: ${alias}

Comandos:
  init [carpeta]            Crear un proyecto a partir de una plantilla (--list las muestra)
  validate <ruta>...        Comprobar archivos .meltemi y proyectos
  preview [ruta]            Servir el catálogo del proyecto y reconstruirlo cuando cambian los
                            archivos
  format <ruta>...          Reescribir archivos .meltemi y proyectos con el formato canónico
  import <ruta>             Importar archivos Mermaid, PlantUML o Markdown a hojas .meltemi
  export <ruta>             Dibujar los diagramas, las historias o los perfiles de un archivo o
                            de una carpeta
  layout <archivo.meltemi>  Organizar los diagramas de un archivo con ELK y escribir las
                            posiciones
  convert <archivo.meltemi> Copiar un diagrama de flujo, tal como se dibuja, en un diagrama libre
                            nuevo, o escribir su JSON del modelo
  build catalog [ruta]      Escribir el catálogo HTML sin conexión de los diagramas y las
                            historias de un proyecto
  review [ruta]             Listar por id lo que cambió desde una revisión de Git u otra versión
  assist <operación>        Ayuda opcional de IA: generate, modify, relations, explain, apply
  assets <subcomando>       Listar paquetes de iconos y fuentes, buscar iconos, escribir
                            assets.lock.json
  plugins [ruta]            Listar los plugins que instala un proyecto, lo que agregan y sus
                            problemas
  push [carpeta]            Hacer que el proyecto de la nube coincida con la carpeta (--create,
                            --force, --check)
  pull [id] [carpeta]       Escribir los archivos de un proyecto de la nube en una carpeta
                            (--version, --force)
  login                     Iniciar sesión en el servicio de la nube desde el navegador
                            (--no-browser, --token)
  logout                    Revocar el token de la nube guardado y olvidarlo
  skill install [carpeta]   Dar a los agentes de programación de un proyecto la skill que dibuja
                            diagramas de Meltemi
  skill prompt              Imprimir el prompt que sigue un agente de programación para instalar
                            la skill y demostrar que funciona
  whoami                    Imprimir el nombre y el handle con los que tienes la sesión iniciada
  publish [carpeta]         Publicar el catálogo como una página web del servicio de la nube
                            (--unpublish)
  projects                  Listar tus proyectos de la nube: id, nombre, rol, último cambio
                            (--json)

Todos los comandos aceptan --lang en|es: el idioma de sus mensajes y de las palabras que agregan
a los archivos que escriben (si no, el "locale" del proyecto; los mensajes siguen MELTEMI_LANG o
LANG).

Opciones de init:
  --template <nombre>       flow (predeterminada), c4, sequence, free, kanban, whiteboard o
                            purchase
  --name <nombre>           El nombre del proyecto; por defecto, el de la carpeta
  --list                    Listar las plantillas
  --ci <servicio>           Escribir también un flujo de trabajo de CI: github o gitlab
  --cloud                   Con --ci: el flujo de trabajo también sube a la nube en la rama
                            principal

Opciones de validate:
  --json                    Imprimir un objeto JSON con todos los diagnósticos
  --strict                  Tratar las advertencias como errores para el código de salida

Opciones de export:
  --diagram <id>            Exportar solo este diagrama
  --scenario <id>           Exportar un escenario de los diagramas de secuencia que lo declaran
  --story <id>              Una historia en su lugar: su final, el fotograma en --at o su
                            reproductor
  --format <nombre>         svg (predeterminado), png, pdf, html (el reproductor), mp4, webm o
                            gif; PNG, PDF y video usan Edge o Chrome instalado, y el video
                            también FFmpeg
  --profile <id>            Ejecutar un perfil de exportación del archivo; --profiles los
                            ejecuta todos
  --out <ruta>              Archivo de salida (una salida) o una carpeta; las salidas de una
                            carpeta conservan sus carpetas dentro de ella
  --stdout                  Imprimir el SVG o el HTML de una salida en vez de escribir un
                            archivo
  --theme <nombre>          Dibujar con este tema en vez del propio del diagrama
  --fonts <política>        Texto de SVG y HTML: embedded (fuentes incrustadas, predeterminado),
                            outlined o system
  --motion <modo>           Efectos de SVG: static (predeterminado, no se dibujan) o animated
                            (CSS)
  --at <tiempo>             Escribir el fotograma de ese momento, como 600ms o 1.5s
  --scale <n>               Píxeles de PNG por unidad, de 1 a 8 (2 por defecto)
  --size <an>x<al>          Tamaño de PNG, PDF y video; la imagen se ajusta y se centra
                            (videos: 1920x1080, GIF 960x540 por defecto)
  --fps <n>                 Fotogramas por segundo del video, de 1 a 60 (30, GIF 15 por
                            defecto)
  --duration <tiempo>       Duración del video; por defecto, la de la historia o el final de
                            los efectos
  --background <color>      transparent, un token de color o un color CSS (no para HTML)
  --link <url>              Toda la imagen enlaza a esta URL (SVG y PDF)
  --embed                   Con --format html, un fragmento para pegar en una página

Opciones de layout:
  --diagram <id>            Organizar solo este diagrama
  --all                     Organizar de nuevo cada elemento; sin esta opción solo se mueven
                            los elementos sin colocar
  --check                   No escribir nada; listar los diagramas que cambiarían (sale con 1
                            si hay alguno)
  --stdout                  Imprimir el texto organizado en vez de escribir el archivo

Opciones de convert:
  --to free|json            free: copiar un diagrama de flujo en uno libre; json: escribir el
                            JSON del modelo (<nombre>.model.json junto al archivo, el formato
                            de intercambio)
  --out <archivo>           Con --to json, escribir el JSON aquí
  --diagram <id>            El diagrama de flujo que copiar; necesario cuando el archivo tiene
                            varios
  --id <id>                 Id de la copia; <diagrama>_free por defecto
  --check                   No escribir nada; decir lo que se agregaría (sale con 1)
  --stdout                  Imprimir el texto convertido en vez de escribir el archivo

Opciones de format:
  --check                   No escribir nada; listar los archivos que cambiarían (sale con 1
                            si hay alguno)
  --stdout                  Imprimir el texto formateado de un archivo en vez de escribirlo

Opciones de import:
  --from <formato>          mermaid, plantuml o markdown, cuando la extensión no lo dice
  --out <archivo>           Escribir la hoja aquí en vez de <nombre>.meltemi junto al archivo
                            de origen
  --force                   Reemplazar una hoja que existe
  --merge                   Volver a importar en una hoja que existe, conservando su
                            colocación y sus estilos
  --check                   No escribir nada; informar de lo que haría la importación
  --json                    Imprimir un objeto JSON con el resultado

Opciones de build catalog:
  --out <ruta>              Una carpeta (para index.html) o un archivo .html; catalog/ por
                            defecto
  --title <texto>           El título del catálogo en vez del nombre del proyecto
  --source                  Incluir el texto de cada archivo catalogado (con sus comentarios)

Opciones de preview:
  --port <n>                El puerto, 4317 por defecto; 0 elige uno libre
  --open                    Abrir la vista previa en el navegador predeterminado

Opciones de review:
  --base <revisión>         La versión anterior, de Git (HEAD por defecto); cloud, o cloud:<n>
                            para los archivos del proyecto de la nube ahora, o su versión n
  --before <ruta>           La versión anterior, de otra carpeta u otro archivo
  --project <id>            Con --base cloud: el proyecto de la nube, en vez del del manifiesto
  --host <url>              Con --base cloud: el servicio, como en login
  --out <carpeta>           Escribir index.html con imágenes de antes y después de los
                            diagramas cambiados
  --json                    Imprimir un objeto JSON
  --exit-code               Salir con 1 cuando algo cambió

Opciones de push:
  --create                  Crear un proyecto nuevo en la nube con la carpeta y anotarlo en
                            project.json
  --name <nombre>           Con --create, el nombre del proyecto; el de project.json por defecto
  --project <id>            El proyecto de la nube, en vez del ajuste "cloud" de project.json
  --force                   Sobrescribir sin preguntar lo que difiere en la nube
  --check                   No escribir nada; listar lo que difiere (sale con 1 si algo difiere)
  --strict                  No enviar si la validación encuentra errores
  --host <url>              El servicio, como en login

Opciones de pull:
  --version <n>             Traer esta versión del proyecto en vez de sus últimos archivos
  --force                   Sobrescribir los archivos que difieren en la carpeta
  --host <url>              El servicio, como en login

Opciones de login:
  --host <url>              El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev
  --no-browser              Imprimir la dirección de aprobación en vez de abrirla
  --token                   Leer un token de API de la entrada estándar en vez de usar el
                            navegador

Opciones de logout y whoami:
  --host <url>              El servicio, como en login

Opciones de publish:
  --slug <nombre>           El nombre de la página en su dirección; por defecto, el del proyecto
  --handle <nombre>         El handle con el que empieza la dirección; hace falta en la primera
                            publicación
  --unpublish               Quitar la página que nombra --slug en vez de publicarla
  --project <id>            El proyecto de la nube, en vez del cloud.project del manifiesto
  --host <url>              El servicio, como en login
  --force                   Subir la carpeta sin preguntar cuando difiere del proyecto de la nube
  --strict                  No publicar nada mientras el proyecto tenga errores

Opciones de projects:
  --json                    Imprimir un objeto JSON
  --host <url>              El servicio, como en login

Operaciones de assist (ver assist --help):
  generate <archivo>        Una hoja nueva a partir de --prompt
  modify <archivo>          Cambios como pide --prompt, como una propuesta que aceptar en parte
  relations <archivo>       Relaciones que probablemente faltan, marcadas como suposiciones
  explain [ruta]            Lo que cambió desde una revisión de Git, explicado
  apply <propuesta>         Aplicar puntos de una propuesta guardada

Subcomandos de assets:
  list [ruta]               Paquetes de iconos, alias y fuentes con versiones, orígenes y
                            licencias
  icons <palabras>          Referencias de iconos que coinciden con cada palabra (--project
                            <ruta>, --limit <n>)
  lock [ruta]               Escribir assets.lock.json en la raíz del proyecto

Opciones:
  -h, --help                Mostrar esta ayuda
  -v, --version             Mostrar la versión

Códigos de salida: 0 sin errores, 1 errores encontrados, 2 error de uso o ruta ilegible. Para
import: 0 completa, 1 parcial, 2 error de uso, entrada no admitida o una hoja que existe. Para los
comandos de la nube: 3 sin sesión iniciada, o el servicio rechazó el token (ejecuta login).
`,
    skill: `Uso: skill install [carpeta] [opciones]
     skill prompt

install escribe la skill meltemi-diagrams, que enseña a los agentes de programación a dibujar,
convertir y exportar diagramas de Meltemi, en la carpeta (la de trabajo por defecto), en las
carpetas que leen los agentes: .claude/skills/meltemi-diagrams para Claude Code,
.agents/skills/meltemi-diagrams para Codex, Cursor, GitHub Copilot, Gemini CLI, Devin Desktop
(Windsurf) y cualquier otro agente que lea .agents/skills. Cada carpeta se escribe una vez. Sus
comandos se escriben como los de esta línea de comandos (mdg validate, mdg preview). Una copia
que ya está se conserva. Solo se escriben carpetas de skills, nunca un archivo de instrucciones
del proyecto.

prompt imprime el prompt de configuración para agentes: el texto que un agente de programación
lee y sigue para instalar la skill y demostrar que dibuja, también en
https://diagrams.meltemi.dev/agent-setup/prompt.md.

Opciones de install:
  --agent <nombres>  claude, codex, cursor, copilot, gemini, windsurf, devin, agents o all (all
                     por defecto: las dos carpetas); varios en una lista separada por comas o
                     repitiendo la opción
  --user             Instalarla en tus propias carpetas (~/.claude/skills, ~/.agents/skills),
                     para todo proyecto
  --force            Reemplazar una copia que ya está (solo la carpeta de la skill)
`,
    init: (templates) => `Uso: init [carpeta] [opciones]

Crea un proyecto en la carpeta (por defecto, la carpeta de trabajo): project.json y las hojas de
una plantilla. No se reemplaza nada que exista.

Opciones:
  --template <nombre>  ${templates} (flow por defecto)
  --name <nombre>      El nombre del proyecto; por defecto, el de la carpeta
  --list               Listar las plantillas
  --ci <servicio>      Escribir también un flujo de trabajo de CI que valida, revisa las pull
                       requests y construye el catálogo: github o gitlab. En un proyecto que
                       ya existe, solo el flujo de trabajo.
  --cloud              Con --ci: el flujo de trabajo también tiene un trabajo que sube el
                       proyecto al servicio de la nube en la rama principal, con --force
                       --strict (la CI no puede responder a una pregunta). El token es el
                       secreto de la CI MELTEMI_TOKEN; nunca se escribe en el archivo.
`,
    import: `Uso: import <archivo o carpeta> [opciones]

Importa un archivo Mermaid (.mmd, .mermaid), PlantUML (.puml, .plantuml, .pu, .iuml, .wsd) o
Markdown (.md) a una hoja .meltemi a su lado. Una carpeta importa todos esos archivos que hay
dentro de ella (los archivos .iuml de PlantUML se leen a través de los archivos que los
incluyen; los archivos Markdown sin diagramas se pasan por alto). Los archivos de origen nunca
se modifican.

Opciones:
  --from <formato>   mermaid, plantuml o markdown, cuando la extensión no lo dice (un archivo)
  --out <ruta>       Un archivo: escribir la hoja aquí. Una carpeta: escribir las hojas dentro
                     de esta carpeta, conservando las carpetas de los archivos de origen
  --force            Reemplazar las hojas que existen
  --merge            Volver a importar en las hojas que existen, conservando su colocación y
                     sus estilos
  --check            No escribir nada; informar de lo que haría la importación
  --json             Imprimir un objeto JSON con el resultado

Códigos de salida: 0 completa, 1 parcial (no se importó algo esencial), 2 error de uso, entrada
ilegible o no admitida, o una hoja que existe sin --force ni --merge.
`,
    review: `Uso: review [ruta] [opciones]

Compara dos versiones de un proyecto, una carpeta o un archivo (por defecto, la carpeta de
trabajo) y lista por id lo que cambió: diagramas, elementos, relaciones, entidades, historias,
escenas, temas y perfiles de exportación. Un id cambiado cuyo elemento conservó su tipo,
etiqueta, posición o relaciones es un cambio de nombre, no una eliminación y una adición.

Opciones:
  --base <revisión>  La versión anterior: un commit, una rama o una etiqueta de Git (HEAD por
                     defecto); o el proyecto de la nube: cloud para sus archivos ahora,
                     cloud:<n> para su versión n
  --before <ruta>    La versión anterior: otra carpeta u otro archivo, en vez de Git
  --project <id>     Con --base cloud: el proyecto de la nube, en vez del cloud.project del
                     manifiesto
  --host <url>       Con --base cloud: el servicio (MELTEMI_HOST, si no
                     https://diagrams.meltemi.dev)
  --out <carpeta>    Escribir index.html y las imágenes de antes y después de cada diagrama
                     cambiado
  --json             Imprimir un objeto JSON
  --exit-code        Salir con 1 cuando algo cambió

Códigos de salida: 0 comparado, 1 cambios con --exit-code, o no se puede leer el proyecto de la
nube, 2 error de uso o versiones ilegibles, 3 sin sesión iniciada (--base cloud).
`,
    assets: `Uso: assets <subcomando>

Subcomandos:
  list [ruta]                       Paquetes de iconos, alias y fuentes del proyecto, con sus
                                    licencias
  icons <consulta> [--project <p>]  Referencias de iconos cuyo nombre o marcas contienen cada
                                    palabra (--limit <n>, 50 por defecto)
  lock [ruta]                       Escribir assets.lock.json con versiones, licencias y hashes
`,
    plugins: `Uso: plugins [ruta] [--json]

Lista los plugins que instala el proyecto que contiene la ruta (por defecto, la carpeta de
trabajo): sus versiones, los permisos concedidos, los tipos de diagrama y los paquetes de iconos
que aportan, su licencia y su origen, y sus problemas. Los plugins son datos; su código nunca se
ejecuta.
`,
    build: `Uso: build catalog [ruta] [opciones]

Escribe el catálogo HTML sin conexión del proyecto que contiene la ruta (por defecto, la carpeta
de trabajo): sus diagramas e historias por carpeta, con el reproductor, la búsqueda y los
enlaces, en un solo archivo.

Opciones:
  --out <ruta>     Una carpeta (que recibe index.html) o un archivo .html; por defecto,
                   catalog.out del proyecto o catalog/ en la raíz del proyecto
  --title <texto>  El título del catálogo en vez de catalog.title o el nombre del proyecto
  --source         Incluir el texto de cada archivo catalogado (con sus comentarios)
`,
    preview: `Uso: preview [ruta] [opciones]

Sirve el catálogo del proyecto que contiene la ruta (por defecto, la carpeta de trabajo) en
http://127.0.0.1:4317/ y lo vuelve a construir cada vez que cambia un archivo de origen,
project.json o un recurso; las páginas abiertas se recargan donde estaban. Un archivo se abre en
su primer diagrama. Ctrl+C la detiene.

Opciones:
  --port <n>   El puerto, 4317 por defecto; 0 elige uno libre
  --open       Abrir la vista previa en el navegador predeterminado
`,
    assist: `Uso: assist <operación> [ruta] [opciones]

Asistencia opcional de IA (decisión 0029). Cada respuesta se convierte en una propuesta de
bloques completos, comprobada contra el proyecto, que aceptas en parte o por completo; no se
escribe nada sin --apply. Lo que envía una solicitud se lista primero y necesita tu sí, o --yes.

Operaciones:
  generate <archivo>   Escribir una hoja nueva a partir de --prompt
  modify <archivo>     Cambiar una hoja como pide --prompt
  relations <archivo>  Sugerir relaciones que probablemente faltan, marcadas como suposiciones
  explain [ruta]       Explicar lo que cambió desde una revisión de Git u otra versión
  apply <propuesta>    Aplicar puntos de una propuesta guardada (--items 1,3; todos por defecto)

Opciones:
  --prompt <texto>     Qué hacer (generate, modify; un foco opcional para relations)
  --profile <nombre>   generate: flow, c4, sequence o free
  --block <bloque>     relations: un bloque, como "diagram checkout"
  --save <archivo>     Guardar la propuesta como JSON, para aplicarla después
  --apply <puntos>     Aplicar la propuesta en el acto: all, o una lista como 1,3
  --items <puntos>     apply: los puntos que aplicar (todos por defecto)
  --base <revisión>    explain: la versión anterior, de Git (HEAD por defecto)
  --before <ruta>      explain: la versión anterior, de otra carpeta u otro archivo
  --provider <nombre>  anthropic u openai-compatible (o MELTEMI_AI_PROVIDER)
  --model <nombre>     El modelo (o MELTEMI_AI_MODEL; claude-opus-5-5 para Anthropic)
  --base-url <url>     El punto de conexión (o MELTEMI_AI_BASE_URL), como
                       http://127.0.0.1:11434/v1
  --yes                Enviar sin preguntar; lo que se envía se lista igualmente
  --json               Imprimir la propuesta como JSON

Las claves solo vienen del entorno: ANTHROPIC_API_KEY o MELTEMI_AI_API_KEY. La validación, la
disposición y la exportación nunca usan la asistencia.

Códigos de salida: 0 hecho, 1 una propuesta que no se puede aplicar o un error del proveedor,
2 error de uso o nada enviado.
`,
    push: pushPullEs.help.push,
    pull: pushPullEs.help.pull,
    login: `Uso: login [opciones]

Inicia sesión en el servicio de la nube. El navegador se abre en la página de aprobación del
servicio; el código de un solo uso que devuelve llega solo a este equipo (127.0.0.1, un puerto al
azar) y se cambia por un token de API, que se guarda en la carpeta de configuración, uno por
servicio, legible solo por ti donde el sistema tiene esos permisos. Los seis caracteres que se
imprimen primero son los que muestra la página de aprobación: aprueba la solicitud solo si
coinciden. MELTEMI_TOKEN en el entorno tiene prioridad sobre el token guardado y sobre este
comando.

Opciones:
  --host <url>   El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev
  --no-browser   Imprimir la dirección de aprobación en vez de abrirla
  --token        Leer un token de API de la entrada estándar (nunca de un argumento) en vez de
                 usar el navegador: para equipos sin uno

Códigos de salida: 0 sesión iniciada, 1 falló o no se guardó nada, 2 error de uso, 3 el servicio
rechazó el token.
`,
    logout: `Uso: logout [--host <url>]

Revoca el token guardado en el servicio y lo olvida. Un token que el servicio ya no conoce también
se olvida. Si no se puede llegar al servicio no se olvida nada, para poder revocar el token más
tarde (o en la página de la cuenta). MELTEMI_TOKEN nunca se revoca ni se cambia.

Códigos de salida: 0 sesión cerrada (o nunca iniciada), 1 no se pudo revocar el token, 2 error de
uso.
`,
    whoami: `Uso: whoami [--host <url>]

Imprime el nombre y el handle a los que pertenece el token, y el servicio con el que se comprobó.
El token en sí nunca se imprime.

Códigos de salida: 0 sesión iniciada, 1 no se pudo llegar al servicio, 2 error de uso, 3 sin sesión
iniciada o el token fue rechazado.
`,
    publish: `Uso: publish [carpeta] [opciones]

Publica el catálogo del proyecto de la carpeta (por defecto, la carpeta de trabajo) como una página
web del servicio de la nube: el catálogo que escribe "build catalog", enviado para el proyecto de
la nube que nombra el "cloud" del manifiesto (o --project). La carpeta se sube primero cuando
difiere del proyecto de la nube, con la misma pregunta que push. La primera publicación necesita un
handle, la primera parte de toda dirección que publicas; es público. Da --handle, o responde a la
pregunta en una terminal. Las páginas publicadas son públicas.

Opciones:
  --slug <nombre>    El nombre de la página en su dirección: de 1 a 60 letras minúsculas, dígitos
                     y guiones (por defecto, el nombre del proyecto, simplificado)
  --handle <nombre>  Tu handle: de 3 a 30 letras minúsculas, dígitos y guiones; hace falta una vez
  --unpublish        Quitar la página que nombra --slug en vez de publicarla (no se construye nada)
  --project <id>     El proyecto de la nube, en vez del cloud.project del manifiesto
  --host <url>       El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev
  --force            Cuando la carpeta difiere del proyecto de la nube, subirla sin preguntar
  --strict           No subir ni publicar nada mientras el proyecto tenga errores

Códigos de salida: 0 publicado (o quitado), 1 rechazado o falló, 2 error de uso, 3 sin sesión
iniciada o el token fue rechazado.
`,
    projects: `Uso: projects [opciones]

Lista los proyectos de la nube que puedes abrir: id, nombre, tu rol (propietario, editor o lector)
y la hora del último cambio, el más reciente primero.

Opciones:
  --json         Imprimir un objeto JSON: host y projects, cada uno con id, name, description,
                 role (owner, editor o viewer) y updated_at
  --host <url>   El servicio: MELTEMI_HOST, si no https://diagrams.meltemi.dev

Códigos de salida: 0 listado, 1 no se pudo llegar al servicio, 2 error de uso, 3 sin sesión
iniciada o el token fue rechazado.
`,
  },
  common: {
    lang: "--lang debe ser en o es.",
    unknownCommand: (name, command) =>
      `${name}: comando desconocido "${command}". Ejecuta "${name} --help".`,
    internalError: (name, message) => `${name}: error interno: ${message}`,
    hint: "pista",
    cannotRead: (path, reason) =>
      `no se puede leer ${path}${reason === undefined ? "" : `: ${reason}`}`,
    cannotWrite: (path, reason) => `no se puede escribir ${path}: ${reason}`,
    pathNotFound: (path) => `no se encuentra la ruta: ${path}`,
    wrote: (path) => `Se escribió ${path}`,
    atLeastOnePath: "indica al menos un archivo o una carpeta.",
    oneMeltemiFile: "indica exactamente un archivo .meltemi.",
    oneProject: "indica una carpeta de proyecto o un archivo.",
    oneProjectFolderOrFile: "indica una carpeta de proyecto, una carpeta o un archivo.",
    cannotCombine: (first, second) => `${first} no se puede combinar con ${second}.`,
    noDiagram: (id, path, available) =>
      `no hay ningún diagrama llamado "${id}" en ${path}; disponibles: ${listOrNone(available)}.`,
    arguments: {
      unknownOption: (_message, name) =>
        `la opción ${name} no existe; para dar un argumento que empieza por -, escríbelo al final del comando, después de --.`,
      missingValue: (_message, name) => `falta el valor de ${name}.`,
      noValue: (_message, name) => `${name} no lleva valor.`,
      ambiguous: (_message, name) =>
        `el valor de ${name} es ambiguo; para dar un valor que empieza por un guion, escribe ${name}=-XYZ.`,
      unexpected: (_message, name) =>
        `argumento inesperado "${name}": este comando no lleva argumentos posicionales.`,
    },
  },
  validate: {
    summary: (files, errors, warnings) =>
      `${verb(files, "Se revisó", "Se revisaron")} ${count(files, "archivo", "archivos")}: ${count(errors, "error", "errores")}, ${count(warnings, "advertencia", "advertencias")}.`,
  },
  layout: {
    sequence: (id) => `"${id}" es un diagrama de secuencia, que no tiene posiciones que escribir.`,
    cannotWrite: (id, reason) => `no se pueden escribir las posiciones de "${id}": ${reason}`,
    unchanged: (path) => `${path}: todas las posiciones ya están escritas.`,
    wouldArrange: (ids, path) =>
      `${verb(ids.length, "Se organizaría", "Se organizarían")} ${quoted(ids)} en ${path}`,
    arranged: (ids, path) =>
      `${verb(ids.length, "Se organizó", "Se organizaron")} ${quoted(ids)} en ${path}`,
  },
  convert: {
    giveTo: "indica --to free (un diagrama de flujo copiado en uno libre) o --to json.",
    outWithJson: "--out va con --to json; las copias libres se escriben en el mismo archivo.",
    noFlowDiagram: (id, path, available) =>
      `no hay ningún diagrama de flujo llamado "${id}" en ${path}; diagramas de flujo: ${listOrNone(available)}.`,
    noFlow: (path) => `${path} no tiene ningún diagrama de flujo.`,
    severalFlows: (path, ids) =>
      `${path} tiene ${ids.length} diagramas de flujo (${ids.join(", ")}); elige uno con --diagram.`,
    cannotDraw: (id) => `"${id}" no se puede dibujar, así que no se puede copiar.`,
    wouldConvert: (id, copy, path) => `Se convertiría "${id}" en "${copy}" en ${path}`,
    converted: (id, copy, path) => `Se convirtió "${id}" en "${copy}" en ${path}`,
    notForJson: (option) => `${option} no se aplica a --to json.`,
    wroteJson: (source, target, ok) =>
      `Se escribió el JSON del modelo de ${source} en ${target}${ok ? "" : " (con errores; ver los diagnósticos)"}`,
  },
  format: {
    stdoutOne: "--stdout formatea exactamente un archivo y no se puede combinar con --check.",
    stdoutOneFile: "--stdout formatea exactamente un archivo.",
    syntaxErrors: "El archivo tiene errores de sintaxis y no se formateó.",
    wouldFormat: (path) => `Se formatearía ${path}`,
    formatted: (path) => `Se formateó ${path}`,
    checkedAll: (files) =>
      `${verb(files, "Se revisó", "Se revisaron")} ${count(files, "archivo", "archivos")}: ${verb(files, "ya está formateado", "todos están formateados")}.`,
    checked: (files, changed, refused) =>
      `${verb(files, "Se revisó", "Se revisaron")} ${count(files, "archivo", "archivos")}: ${changed} ${verb(changed, "se formatearía", "se formatearían")}, ${count(refused, "rechazado", "rechazados")}.`,
    summary: (changed, files) =>
      `${verb(changed, "Se formateó", "Se formatearon")} ${changed} de ${count(files, "archivo", "archivos")}.`,
  },
  export: {
    wroteViews: (path, views) => `Se escribió ${path} (${views} vistas)`,
    wrotePicture: (path, browser) => `Se escribió ${path} (${browser})`,
    wroteVideo: (path, browser, ffmpeg, frames) =>
      `Se escribió ${path} (${browser}, FFmpeg ${ffmpeg}, ${count(frames, "fotograma", "fotogramas")})`,
    noDiagram: (types) =>
      types.length === 0
        ? "No hay ningún diagrama que exportar."
        : types.length === 1
          ? `No hay ningún diagrama que exportar; \`${types[0]}\` no es un tipo de diagrama del lenguaje.`
          : `No hay ningún diagrama que exportar; \`${types.join("`, `")}\` no son tipos de diagrama del lenguaje.`,
    noDiagramStoriesHint:
      "Exporta una historia con `--story <id>`, o los perfiles del archivo con `--profiles`.",
    noDiagramTypesHint:
      "Se dibujan los diagramas `diagram <id>: flow { ... }`, `free`, `sequence` y `c4`.",
    onePath: "indica exactamente un archivo .meltemi o una carpeta de proyecto.",
    profileOrProfiles: "--profile ejecuta un perfil y --profiles todos; elige uno.",
    profileOption: (option) =>
      `los perfiles fijan sus propias opciones; ${option} no va con --profile ni con --profiles.`,
    profilesOut: "con perfiles, --out es una carpeta que ya existe para sus archivos.",
    format: (format, formats) => `el formato "${format}" no se admite; usa ${formats.join(", ")}.`,
    fonts: (fonts, policies) => `--fonts debe ser uno de ${policies.join(", ")}, no "${fonts}".`,
    motion: (motion, modes) => `--motion debe ser uno de ${modes.join(", ")}, no "${motion}".`,
    at: (at) => `--at lleva un tiempo como 600ms o 1.5s, no "${at}".`,
    atAnimated: "--at escribe un fotograma; no se puede combinar con --motion animated.",
    story: (option) =>
      `--story escribe un fotograma de una historia; no se puede combinar con ${option}.`,
    html: (option) => `--format html escribe un reproductor; no se puede combinar con ${option}.`,
    embed: "--embed escribe un fragmento de reproductor; necesita --format html.",
    picture: (format) =>
      `--format ${format} escribe una imagen; no se puede combinar con --motion animated.`,
    video: (format, option) =>
      `--format ${format} escribe un video; no se puede combinar con ${option}.`,
    stdoutFile: (format) =>
      `--format ${format} escribe un archivo; --stdout solo imprime formatos de texto.`,
    fpsVideo: "--fps fija los fotogramas por segundo de las exportaciones MP4, WebM y GIF.",
    fps: (fps) => `--fps lleva un número entero de 1 a 60, no "${fps}".`,
    durationVideo: "--duration fija la duración de las exportaciones MP4, WebM y GIF.",
    duration: (duration) => `--duration lleva un tiempo de hasta 600s, como 5s, no "${duration}".`,
    scalePng: "--scale fija los píxeles de las exportaciones PNG.",
    scale: (scale) => `--scale lleva un valor de 1 a 8, no "${scale}".`,
    sizeOutput: "--size fija el tamaño de las exportaciones PNG, PDF y de video.",
    size: (max, size) => `--size lleva ANCHOxALTO de 16 a ${max}, como 1920x1080, no "${size}".`,
    backgroundHtml: "--background no se aplica a los reproductores HTML.",
    background: (background) =>
      `--background lleva transparent, un token de color o un color CSS, no "${background}".`,
    linkFormats: "--link se aplica a las exportaciones SVG y PDF.",
    link: (link) => `--link lleva una URL https:, http: o mailto:, o una relativa, no "${link}".`,
    oneFile: (option) =>
      `${option} funciona con un archivo; indica un archivo .meltemi, no una carpeta.`,
    noProfiles: (path) => `${path} no tiene perfiles de exportación.`,
    noProfile: (id, path, available) =>
      `no hay ningún perfil llamado "${id}" en ${path}; disponibles: ${listOrNone(available)}.`,
    noStory: (id, path, available) =>
      `no hay ninguna historia llamada "${id}" en ${path}; disponibles: ${listOrNone(available, "ninguna")}.`,
    noScenario: (id, path, available) =>
      `no hay ningún escenario llamado "${id}" en ${path}; disponibles: ${listOrNone(available)}.`,
    stdoutOne: "--stdout imprime un diagrama; elígelo con --diagram.",
    severalDiagrams: (path, diagrams) =>
      `${path} tiene ${diagrams} diagramas; --out debe ser una carpeta que ya existe o --diagram debe elegir uno.`,
    noFiles: (folder) => `${folder} no tiene archivos .meltemi.`,
    noFileWithProfile: (folder, id) =>
      `ningún archivo de ${folder} tiene un perfil llamado "${id}".`,
  },
  import: {
    oneSource: "indica exactamente un archivo o una carpeta que importar.",
    from: (from, formats) => `--from debe ser ${formats.join(", ")}, no "${from}".`,
    forceAndMerge: "--force y --merge no se pueden combinar.",
    fromInFolder:
      "--from se aplica a un archivo; en una carpeta, la extensión de cada archivo dice su formato.",
    noSources: (folder) => `${folder} no tiene archivos Mermaid, PlantUML ni Markdown.`,
    replacesSource: "la salida reemplazaría el archivo de origen.",
    exists: (path) =>
      `${path} ya existe; pasa --merge para volver a importarlo conservando sus ajustes, o --force para reemplazarlo.`,
    nothing: (source) => `no se importó nada de ${source}.`,
    status: { complete: "completa", partial: "parcial", failed: "fallida" },
    coverage: (diagram, mapped, approximated, dropped) =>
      `${diagram}: ${count(mapped, "convertido", "convertidos")}, ${count(approximated, "aproximado", "aproximados")}, ${count(dropped, "omitido", "omitidos")}`,
    wouldImport: (source, out, status) => `Se importaría ${source} → ${out} (${status})`,
    imported: (source, out, status, merged) =>
      `Se importó ${source} → ${out} (${status}${merged ? ", fusionada" : ""})`,
    folder: {
      complete: (n) => count(n, "completo", "completos"),
      partial: (n) => count(n, "parcial", "parciales"),
      failed: (n) => count(n, "fallido", "fallidos"),
      notReplaced: (n) => count(n, "no reemplazado", "no reemplazados"),
      withoutDiagrams: (n) => `${n} sin diagramas`,
    },
    folderSummary: (check, files, folder, parts) =>
      `${check ? verb(files, "Se importaría", "Se importarían") : verb(files, "Se importó", "Se importaron")} ${count(files, "archivo", "archivos")} de ${folder}: ${parts.join(", ")}`,
  },
  skill: {
    wrote: (path) => `Se escribió ${path}`,
    subcommand: (given) =>
      given === ""
        ? "Indica qué hacer: skill install [carpeta]."
        : `No existe el comando de skill \`${given}\`; los comandos son: skill install [carpeta], skill prompt.`,
    tooMany: "Indica una carpeta como mucho.",
    userWithFolder: "--user la instala en tus propias carpetas; no indiques una carpeta con él.",
    unknownAgent: (agent, agents) =>
      agent === ""
        ? `El nombre de un agente está vacío; los agentes son ${agents.join(", ")}.`
        : `No existe el agente \`${agent}\`; los agentes son ${agents.join(", ")}.`,
    promptArguments:
      "skill prompt no recibe argumentos; imprime el prompt de configuración para agentes.",
    exists: (path) =>
      `${path} ya tiene la skill; agrega --force para reemplazarla (solo esa carpeta).`,
  },

  init: {
    templates: {
      flow: { title: "Diagrama de flujo", description: "Un diagrama de flujo para empezar" },
      c4: {
        title: "Modelo C4",
        description:
          "Un modelo de arquitectura con una vista de contexto y una vista de contenedores",
      },
      sequence: {
        title: "Diagrama de secuencia",
        description: "Un diagrama de secuencia con un escenario para cada resultado",
      },
      free: {
        title: "Diapositiva",
        description: "Una diapositiva compuesta libremente: texto, cajas, un icono y un grupo",
      },
      kanban: {
        title: "Tablero kanban",
        description: "Un tablero de columnas y notas adhesivas",
      },
      whiteboard: {
        title: "Pizarra",
        description:
          "Un tablero de estilo boceto con trazos, notas adhesivas y una historia que los dibuja",
      },
      purchase: {
        title: "Ejemplo de compra",
        description:
          "El ejemplo de referencia: un modelo, sus vistas C4, una secuencia de pago, una diapositiva ejecutiva, una historia animada y perfiles de exportación",
      },
    },
    contents: (counts) =>
      counts
        .map(([kind, n]) =>
          count(
            n,
            { models: "modelo", views: "vista", diagrams: "diagrama", stories: "historia" }[kind],
            { models: "modelos", views: "vistas", diagrams: "diagramas", stories: "historias" }[
              kind
            ],
          ),
        )
        .join(", "),
    exists: (path) => `${path} ya existe; no se reemplaza.`,
    gitlab: `.gitlab-ci.yml ya existe; agrega el trabajo con:\n  include:\n    - local: .gitlab/meltemi-diagrams.yml\n`,
    oneFolder: "indica una carpeta.",
    noTemplate: (template, templates) =>
      `no hay ninguna plantilla llamada "${template}"; usa ${templates.join(", ")}.`,
    ci: (ci, services) => `--ci lleva ${services.join(" o ")}, no "${ci}".`,
    cloudNeedsCi: (services) =>
      `--cloud agrega un trabajo al flujo de trabajo de CI; da --ci ${services.join(" o ")} con él.`,
    cloudNote: (secret) =>
      `El flujo de trabajo sube a la nube en la rama principal con --force --strict, porque la CI no puede responder a una pregunta. Agrega ${secret} a los secretos de la CI: crea el token en la página, en Tokens de API del menú de la cuenta.`,
    name: "--name necesita algo de texto.",
    notAFolder: (path) => `${path} es un archivo, no una carpeta.`,
    alreadyAProject: (path) => `${path} ya es un proyecto; --ci le agrega un flujo de trabajo.`,
    clash: (path) => `${path} ya existe; no se escribió nada.`,
    created: (path) => `Se creó ${path}`,
    next: "Siguientes pasos:",
  },
  assets: {
    unknownSubcommand: (subcommand) =>
      `subcomando desconocido "${subcommand}"; usa list, icons o lock.`,
    noLicence: "sin licencia",
    icons: (n) => count(n, "icono", "iconos"),
    noRedistribution: "redistribuir: no",
    noEmbedding: "incrustar: no",
    packs: "Paquetes de iconos:",
    aliases: "Alias:",
    fonts: "Fuentes del proyecto:",
    bundledFonts: "Fuentes incluidas:",
    fontGroups: {
      sans: "sin serifa",
      serif: "con serifa",
      mono: "monoespaciada",
      hand: "manuscrita",
    },
    noWords: "indica las palabras que buscar.",
    limit: "--limit debe ser un número entero positivo.",
    noMatch: (query) => `Ningún icono coincide con "${query}".`,
  },
  plugins: {
    none: "El proyecto no instala ningún plugin.",
    notLoaded: (name, version) => `${name} ${version} — no se cargó (ver los problemas más abajo)`,
    from: (homepage) => `  de ${homepage}`,
    folder: (path, granted) => `  carpeta ${path}; concedido: ${granted.join(", ") || "nada"}`,
    type: (type, title, kinds) => `  tipo de diagrama ${type} (${title}): ${kinds.join(", ")}`,
    icons: (name) => `  paquete de iconos ${name}`,
  },
  build: {
    unknownTarget: (target) => `objetivo desconocido "${target}"; el único es catalog.`,
    title: "--title necesita algo de texto.",
    skipped: (entry, reason) => `se omitió ${entry}: ${reason}.`,
    warning: (warning) => `advertencia: ${warning}`,
    empty: (root) => `${root} no tiene ningún diagrama ni historia que catalogar.`,
    diagrams: (n) => count(n, "diagrama", "diagramas"),
    stories: (n) => count(n, "historia", "historias"),
    entities: (n) => count(n, "entidad", "entidades"),
    wrote: (path, parts, size) => `Se escribió ${path} (${parts.join(", ")}; ${size})`,
  },
  preview: {
    onlyHere: "La vista previa solo responde en esta máquina.",
    notFound: "No se encontró.",
    skipped: (entry, reason) => `Se omitió ${entry}: ${reason}.`,
    built: (diagrams, stories, time) =>
      `Catálogo construido con ${count(diagrams, "diagrama", "diagramas")} y ${count(stories, "historia", "historias")} a las ${time}`,
    port: (port) => `--port lleva un número entero de 0 a 65535, no "${port}".`,
    serving: (url) => `Vista previa en ${url} (Ctrl+C para detenerla)`,
    portInUse: (port) => `el puerto ${port} está en uso; elige otro con --port.`,
  },
  review: {
    baseOrBefore: "--base toma la versión anterior de Git y --before de una ruta; elige una.",
    sameKinds: "--before y la ruta deben ser dos carpetas o dos archivos.",
    comparedPaths: (before, after) => `Comparación de ${before} con ${after}`,
    comparedRevision: (revision) => `Comparación de ${revision} con el árbol de trabajo`,
    comparedCloud: (project, version) =>
      version === undefined
        ? `Comparación del proyecto de la nube ${project} con el árbol de trabajo`
        : `Comparación de la versión ${version} del proyecto de la nube ${project} con el árbol de trabajo`,
    cloudVersion: "--base lleva cloud, o cloud: y un número de versión como cloud:3.",
    cloudOptions: "--project y --host van con --base cloud.",
    cloudUnavailable: "la nube no está disponible aquí.",
    none: "Sin cambios.",
    summary: (files, added, removed, renamed, changed) =>
      `${count(files, "archivo cambió", "archivos cambiaron")}: ${count(added, "agregado", "agregados")}, ${count(removed, "quitado", "quitados")}, ${count(renamed, "renombrado", "renombrados")}, ${count(changed, "cambiado", "cambiados")}.`,
    scopes: { diagram: "diagrama", model: "modelo", story: "historia" },
    block: "bloque",
    page: {
      title: "Revisión",
      diagram: (id) => `diagrama ${id}`,
      before: "Antes",
      after: "Después",
      new: "Nuevo",
      removed: "Quitado",
      in: (scope) => `en ${scope}`,
      picture: (id, which) => `${id} ${which === "before" ? "antes" : "después"}`,
      status: {
        added: "agregado",
        removed: "quitado",
        renamed: "renombrado",
        changed: "cambiado",
      },
    },
  },
  assist: {
    items: (ids, text) => `los puntos son ${listOrNone(ids.map(String))}, no "${text}".`,
    proposal: (path, revision, provider, model, summary) =>
      `Propuesta para ${path} (revisión ${revision}, ${provider} ${model}): ${summary || "sin resumen"}`,
    nothingToChange: "  Nada que cambiar.",
    actions: {
      create: "crear",
      add: "agregar",
      replace: "reemplazar",
      remove: "quitar",
      relation: "relación",
    },
    imports: (imports) =>
      `  Importaciones que se agregan con cualquier punto: ${imports.join("; ")}`,
    together: (problem) => `  Todos los puntos juntos: ${problem}`,
    unknownOperation: (operation, operations) =>
      `operación desconocida "${operation}"; usa ${operations.join(", ")}.`,
    proposalFile: "indica el archivo de la propuesta.",
    notAProposal: (path) => `${path} no es una propuesta.`,
    oneFile: (operation) => `${operation} necesita un archivo .meltemi.`,
    notMeltemi: (path) => `${path} no es un archivo .meltemi.`,
    exists: (path) => `${path} ya existe; usa assist modify para cambiarlo.`,
    profile: (profile, profiles) => `--profile lleva ${profiles.join(", ")}, no "${profile}".`,
    needsPrompt: (operation) => `${operation} necesita --prompt.`,
    notSent: "no se envió nada; responde que sí, o pasa --yes.",
    saved: (path, name) =>
      `Se guardó ${path}; aplícala con ${name} assist apply ${path} --items <lista>`,
    send: "¿Enviarla? [s/N] ",
    conflicts: (ids) =>
      ids.length === 1
        ? `el punto ${ids[0]} cambió desde la propuesta y se dejó fuera.`
        : `los puntos ${ids.join(", ")} cambiaron desde la propuesta y se dejaron fuera.`,
    nothingWritten: "no se escribió nada.",
    applied: (ids, path) =>
      ids.length === 1
        ? `Se aplicó el punto ${ids[0]} a ${path}`
        : `Se aplicaron los puntos ${ids.join(", ")} a ${path}`,
    noChanges: "No hay cambios que explicar.",
  },
  cloud: {
    noArguments: (command) => `${command} no lleva argumentos.`,
    errors: {
      hostMismatch: (manifestHost, host) =>
        `project.json nombra ${manifestHost}, pero este comando habla con ${host}; pasa --host ${manifestHost} para usarlo.`,
      insecureHost: (host) =>
        `${host} es una dirección http:; un token solo viaja por https:, o por http: a 127.0.0.1, localhost o [::1].`,
      hostInvalid: (host) =>
        `${host} no es la dirección de un servicio; usa un origen como https://diagrams.meltemi.dev.`,
      unreachable: (host, reason) => `no se puede llegar a ${host}: ${reason}.`,
      timeout: (host) => `${host} no respondió a tiempo.`,
      tooLarge: (host) => `${host} envió más de lo que acepta la línea de comandos.`,
      redirect: (host, status) =>
        `${host} respondió con una redirección (${status}); un token nunca se envía adonde lleva.`,
      badResponse: (host, status) =>
        `${host} respondió algo que no es una respuesta del servicio (${status}).`,
      notSignedIn: (name, host) => `no has iniciado sesión en ${host}; ejecuta "${name} login".`,
      tokenRefused: (name, host) =>
        `${host} rechazó el token (no lo conoce o fue revocado); ejecuta "${name} login".`,
      credentialsCorrupt: (path, reason) =>
        `el archivo de credenciales ${path} no se puede usar: ${reason}. Corrígelo o bórralo; no se escribió nada sobre él.`,
      credentialsUnreadable: (path, reason) =>
        `el archivo de credenciales ${path} no se puede leer: ${reason}.`,
      credentialsUnwritable: (path, reason) =>
        `el archivo de credenciales ${path} no se puede escribir: ${reason}.`,
      cliInvalid:
        "el servicio rechazó el código de un solo uso (no lo conoce, ya se usó o caducó); no se guardó nada. Ejecuta login otra vez.",
      cliRate: (seconds) =>
        `demasiados intentos fallidos; espera ${seconds} segundos y ejecuta login otra vez.`,
      quotaTokens:
        "esta cuenta ya tiene 20 tokens de API; revoca uno en la página de la cuenta y ejecuta login otra vez.",
      loginTimeout: "no llegó ninguna aprobación en 5 minutos; no se guardó nada.",
      stateMismatch:
        "la aprobación no traía el estado de esta solicitud, así que no se aceptó; no se cambió ni se guardó nada.",
      environmentToken:
        "MELTEMI_TOKEN está definido; tiene prioridad sobre cualquier token guardado, así que no se guardó nada. Quítalo del entorno para iniciar sesión con login.",
      tokenInput: "--token lee el token de la entrada estándar; envíalo por una tubería.",
      noToken: "no se dio ningún token en la entrada estándar.",
      notAToken: "eso no es un token de API (empiezan por mdg_).",
      notStored: (reason) => `no se pudo guardar el token (${reason}), así que se revocó.`,
      notStoredNotRevoked: (reason) =>
        `no se pudo guardar el token (${reason}) ni tampoco revocarlo; revócalo en la página de la cuenta.`,
      listener: (reason) => `no se puede escuchar la aprobación en este equipo: ${reason}.`,
      notRevoked: (host, reason, path) =>
        `no se pudo revocar el token de ${host} (${reason}), así que no se olvidó y se puede revocar más tarde: ejecuta logout otra vez, o revócalo en la página de la cuenta. Está guardado en ${path}.`,
      noProject: (name) =>
        `esta carpeta no nombra ningún proyecto de la nube; da --project <id>, o crea uno con "${name} push --create".`,
      unsafePath: (path) =>
        `el proyecto de la nube contiene la ruta ${path}, que no es una ruta segura dentro de la carpeta; no se comparó ni se escribió nada.`,
      versionNotFound: (version) => `el proyecto de la nube no tiene la versión ${version}.`,
      projectNotFound: (project) =>
        `el proyecto de la nube ${project} no existe, o no tienes permiso para abrirlo.`,
      accessDenied:
        "tu rol en este proyecto no permite eso: publicar, compartir, renombrar y borrar son del propietario, y cambiar archivos necesita el rol de editor.",
      handleTaken: (handle) => `el handle ${handle} lo tiene otra cuenta; elige otro con --handle.`,
      handleLocked: (handle) =>
        `tu handle es ${handle} y no puede cambiar mientras haya páginas publicadas con él; quítalas primero (publish --unpublish --slug <nombre>).`,
      handleInvalid: (handle) =>
        `${handle} no es un handle: usa de 3 a 30 letras minúsculas, dígitos y guiones.`,
      handleRequired: (name) =>
        `todavía no tienes handle: da --handle <nombre> (es público y empieza toda dirección que publicas), o ejecuta "${name} publish" en una terminal para que te lo pregunte.`,
      handleInPage: (handle) =>
        `el servicio no deja que un token de API elija el handle ${handle}: elígelo en la página, en el diálogo de publicación del proyecto, y ejecuta publish otra vez.`,
      publishTooLarge: (size) =>
        `el catálogo${size === undefined ? "" : ` (${size})`} supera los 16 MiB que puede tener una página; no se envió nada. Deja fuera lo que la página no necesita con catalog.exclude en project.json.`,
      publishRate: (seconds) =>
        `un proyecto se puede publicar diez veces por hora; inténtalo de nuevo dentro de ${seconds} segundos.`,
      publishTaken: (slug) =>
        `otro proyecto tuyo ya publica ${slug}; elige otro nombre con --slug.`,
      notPublished: (slug) => `el proyecto no publica nada con el nombre ${slug}.`,
      publishEmpty:
        "no hay nada que publicar: el proyecto no tiene ningún diagrama ni historia que se pueda dibujar.",
      publishErrors:
        "el proyecto tiene errores, así que no se subió ni se publicó nada (--strict).",
    },
    push: pushPullEs.push,
    pull: pushPullEs.pull,
    projectErrors: pushPullEs.errors,
    login: {
      check: (check) => `comprobación: ${check}`,
      checkNote:
        "Aprueba la solicitud en el navegador solo si la página muestra los mismos seis caracteres.",
      opening: (url) => `Abriendo ${url}`,
      openFailed: "No se pudo abrir el navegador; abre tú la dirección de arriba.",
      visit: (url) => `Abre esta dirección en tu navegador:\n  ${url}`,
      waiting: "Esperando la aprobación (hasta 5 minutos)...",
      tokenPrompt: "Pega el token: ",
      signedIn: (name, host) => `Sesión iniciada como ${name} (${host})`,
      page: {
        done: "Listo. Puedes cerrar esta ventana y volver a la terminal.",
        failed: "No se terminó de iniciar la sesión. Vuelve a la terminal para ver por qué.",
      },
    },
    logout: {
      done: (host) => `Sesión cerrada en ${host}: el token se revocó y se olvidó.`,
      alreadyRevoked: (host) => `El token de ${host} ya estaba revocado; se olvidó.`,
      none: (host) => `No has iniciado sesión en ${host}; no hay nada que hacer.`,
      environment: "MELTEMI_TOKEN está definido en el entorno y sigue en uso; no se revocó.",
    },
    whoami: {
      who: (name, handle) =>
        handle === null ? `${name} (sin handle todavía)` : `${name} (@${handle})`,
      host: (host) => `servidor: ${host}`,
      environment: "token: de MELTEMI_TOKEN",
    },
    publish: {
      askHandle:
        "Elige tu handle: es público y empieza toda dirección que publicas (de 3 a 30 letras minúsculas, dígitos y guiones): ",
      handleSet: (handle) => `Handle elegido: ${handle}`,
      published: (parts, size) => `Publicado: ${parts.join(", ")} (${size}).`,
      unpublished: (slug) => `Se quitó ${slug}.`,
      slugInvalid: (slug) =>
        `--slug lleva de 1 a 60 letras minúsculas, dígitos y guiones, no "${slug}".`,
      handleOption: (handle) =>
        `--handle lleva de 3 a 30 letras minúsculas, dígitos y guiones, no "${handle}".`,
    },
    projects: {
      none: (name) =>
        `Todavía no tienes proyectos en la nube; crea uno con "${name} push --create".`,
      header: { id: "ID", name: "NOMBRE", role: "ROL", changed: "ÚLTIMO CAMBIO" },
      roles: { owner: "propietario", editor: "editor", viewer: "lector" },
    },
  },
};

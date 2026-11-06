# Seguridad

[English](../security.md)

Meltemi puede abrir diagramas de colegas, repositorios y proyectos compartidos. El procesamiento
local no ejecuta código del proyecto y acota el acceso a archivos; la nube añade decisiones
explícitas de almacenamiento y acceso. Esta página explica esas fronteras, los permisos de los clientes y los límites siguientes.

## No se ejecuta código

- Los diagramas, temas, historias, modelos y perfiles de exportación son declaraciones, no código ejecutable.
- Los [plugins](plugins.md) declaran tipos de diagrama y paquetes de iconos como datos. Los campos
  `main`, `module`, `exports`, `scripts` y `bin` se ignoran con una advertencia.
- Los reproductores y catálogos exportados contienen el runtime de Meltemi. Su política sin
  conexión no permite scripts externos ni solicitudes automáticas de red; seguir un enlace es decisión del lector.

## Las rutas se quedan en el proyecto

- Las importaciones son rutas relativas `.meltemi` dentro de la raíz del proyecto. Se rechazan
  URL, rutas absolutas y las que salen de ella (`module.invalid-path`, `module.outside-project`).
- Las imágenes, fuentes, iconos y plugins son recursos del proyecto o integrados. Una importación
  o un recurso no puede leer un archivo arbitrario fuera de la raíz (`asset.outside-project`).
- Las salidas de perfiles/catálogos se quedan en el proyecto. Un `--out` explícito permite que
  la persona elija escribir la exportación en otro lugar.

## Sin red

Después de instalar, la compilación, validación, disposición y exportación locales leen archivos
del proyecto o integrados; no descargan URL de importaciones, imágenes, fuentes, iconos, plugins
ni temas. Una propiedad `url` se convierte en un enlace del resultado y la compilación no la
descarga. La revisión basada en Git lee el historial Git local.

El uso de red depende del flujo elegido: la [asistencia de IA](assist.md) envía la solicitud
declarada a tu proveedor tras confirmarla; los comandos de nube, MCP con cuenta, los proyectos
compartidos y las sesiones en vivo se comunican con el servicio. La app web también carga código
y recursos desde su host. Un invitado a un proyecto compartido o en vivo usa la red aunque no tenga cuenta Meltemi.

## La app web

Un proyecto del navegador se guarda en su almacenamiento hasta que lo descargues, compartas un
enlace con fragmento o lo guardes en un proyecto con backend. Un enlace con fragmento lleva el
proyecto después de `#`, que el navegador no envía en la petición HTTP; quien reciba el enlace
completo puede leer su contenido. Al abrirlo se descomprimen como máximo 4 MiB y se aplican los límites normales de compilación.

Los proyectos en la nube usan conexiones API/WebSocket al mismo origen. El inicio de sesión
navega por el servicio de cuentas; los avatares pueden cargarse desde GitHub o Google. Los cambios
con cookie requieren el [Origin](cloud.md#la-regla-de-origin) correcto. Estas reglas también se
aplican a invitados y proyectos compartidos: no tener sesión no significa trabajar solo en el navegador.

## Proyectos en la nube

- **Validación.** Cada cambio debe cumplir la [regla de los paths](cloud.md#la-regla-de-los-paths),
  la estructura del documento, las referencias conocidas a recursos y las cuotas. Un rechazo
  conserva el estado válido anterior e informa un código estable. El cliente no se concede identidad ni rol mediante los archivos.
- **Acceso.** Los roles se aplican a lecturas y cambios. Un lector no edita; al cambiar el acceso
  se desconectan las conexiones afectadas para comprobar otra vez sus permisos.
- **Archivos subidos.** El tipo de imagen/fuente se comprueba por sus bytes. Un SVG debe ser XML
  bien formado con raíz `svg`. Las descargas llevan `Content-Security-Policy: sandbox`,
  `X-Content-Type-Options: nosniff` y disposición de adjunto, acotadas a un proyecto accesible.
- **Guardado.** Los pushes HTTP y las restauraciones persisten antes del éxito. Las escrituras
  WebSocket alojadas pueden esperar entre guardados (normalmente un segundo, con un máximo de
  diez desde el primer cambio pendiente). El navegador guarda los cambios pendientes localmente
  y los reenvía al reconectar. Docker local confirma los cambios WebSocket después de guardarlos.
  Conserva un archivo de proyecto como copia independiente; la [guía web](web-app.md#sin-conexión) explica el trabajo sin conexión.
- **Presencia.** El servicio determina nombres, identidades y roles. Cursores, selecciones y
  actividad del puntero se comparten con los participantes conectados, sin formar parte del código, las exportaciones ni el historial.
- **Límites.** El almacenamiento, los tamaños, las salas, los mensajes y las frecuencias están
  acotados; los valores y códigos exactos están [más abajo](#límites).

## Compartir y publicar

Un proyecto nuevo en la nube es privado. Su propietario elige el acceso por enlace y los miembros;
las visitas anónimas ven proyectos compartidos y un enlace de sesión en vivo puede permitir que
un invitado edite. Solo el propietario gestiona compartir y publicar. Los scopes API/OAuth no elevan un rol del proyecto.

Trata los enlaces de invitación y sesión en vivo como enlaces de acceso. Revocar el acceso o
terminar la sesión impide seguir usándolos. Una herramienta de invitación devuelve un enlace; no envía un correo.

Un catálogo publicado contiene los metadatos y dibujos elegidos. El código se incluye solo
si habilitas `catalog.source` o `--source`. Las publicaciones usan el dominio separado
`meltemi.page`, sin cookie de sesión Meltemi ni API de proyectos. Actualizar o despublicar puede
tardar hasta cinco minutos en llegar a una caché existente.

## La línea de comandos y la nube

Los comandos de nube usan el origen elegido y credenciales fuera del proyecto. `mdg login` pide
aprobar una solicitud en el navegador; `mdg login --token` lee un token desde la entrada estándar.
Los tokens no son opciones del comando ni ajustes del proyecto. Consulta la
[referencia de credenciales de la CLI](cli.md#el-host-y-el-token).

Push/pull usan revisiones para detectar copias antiguas y muestran los cambios antes de escribir.
Una revisión rechazada o un documento no válido no se sobrescribe en silencio. Estas son
operaciones explícitas de nube; validar y exportar en local no suben un proyecto.

## Los agentes y el endpoint MCP

La [skill](agents.md) aporta instrucciones y MCP aporta herramientas. Ninguno es un modelo de IA.
MCP con cuenta actúa con la identidad y los scopes concedidos y el rol actual del proyecto.
Puedes revocar OAuth en **Ajustes de Diagrams → Aplicaciones conectadas** y los tokens de API en **Tokens de API**.

El servidor de carpeta local, `mdg mcp --folder .`, ofrece `validate` y `preview`; el agente edita
con sus propias herramientas. Escucha en `127.0.0.1` y rechaza peticiones con origen de navegador.
En un equipo compartido, configura su clave bearer opcional como explica
[la guía MCP local](agents.md#a-través-del-servidor-local). Docker tiene su
[frontera de acceso local](local-compose.md#acceso-y-operación-sin-red) y no usa cuenta Meltemi.

## Los archivos que no son de confianza se sanean

Los iconos y las imágenes SVG se reconstruyen a partir de su geometría: solo se leen formas,
trazados, grupos y degradados, cualquier otro elemento (scripts, `foreignObject`, hojas de estilo)
se rechaza (`asset.unsafe-svg`), y los atributos solo se leen para la geometría y la pintura, así
que los controladores de eventos y las referencias externas nunca pasan. Las fuentes se
inspeccionan antes de usarse; las fuentes cuya licencia prohíbe incrustarlas solo se miden.

## Límites

| Qué                                           | Límite                                                                    | Se informa como                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Un archivo `.meltemi`                         | 2 Mi caracteres                                                           | `limit.too-large`                                                                      |
| Un diagrama                                   | 5000 elementos, 10 000 relaciones, 10 000 eventos de secuencia            | `limit.too-complex`                                                                    |
| Un proyecto                                   | 2000 archivos fuente compilados                                           | `limit.too-many-files`                                                                 |
| project.json, un manifiesto de plugin         | 1 Mi caracteres                                                           | `limit.too-large`                                                                      |
| Anidamiento de bloques                        | 100 niveles                                                               | `syntax.*`                                                                             |
| Un icono SVG                                  | 256 KiB, 2000 elementos, profundidad 32, 256 KiB de datos de trazado      | `asset.too-large`                                                                      |
| Un archivo de Iconify, una fuente             | 16 MiB                                                                    | `asset.too-large`                                                                      |
| Una imagen                                    | 8 MiB                                                                     | `asset.unsupported-image`                                                              |
| Capturas PNG y PDF                            | 16 384 píxeles por lado                                                   | un mensaje                                                                             |
| Un video                                      | 600 s, 60 fps                                                             | un mensaje                                                                             |
| Solicitudes de IA                             | 12 archivos, 200 KB                                                       | los archivos que sobran no se envían                                                   |
| Un enlace para compartir de la app            | 4 MiB descomprimido, 2000 archivos                                        | un mensaje                                                                             |
| Un archivo comprimido de proyecto que se abre | 2000 archivos, 64 MiB                                                     | un mensaje                                                                             |
| Una página publicada                          | 16 MiB, diez solicitudes por hora para un proyecto                        | `publish.too-large`, `publish.rate`                                                    |
| Miembros de un proyecto                       | 50 con las invitaciones pendientes                                        | `quota.members`                                                                        |
| Mensajes de presencia                         | 16 KiB; se retransmiten 20 por segundo, 100 por segundo cierran el socket | `message.too-large`, `awareness.rate`                                                  |
| Conexiones sin cuenta                         | 10 abiertas en una sala desde una misma dirección de cliente              | `connections.limit`                                                                    |
| Una sesión en vivo                            | 24 horas, una hora sin nadie en la sala                                   | `session.ended`                                                                        |
| Un push a la nube                             | 2000 archivos, 16 MiB de texto, 10 MiB una imagen o una fuente            | `quota.files`, `doc.too-large`, `quota.binary`, rechazado antes de cualquier solicitud |

## Errores sin secretos

Los errores del servicio devuelven códigos estables y mensajes seguros, sin credenciales, cookies,
cuerpos de solicitudes ni trazas. Los diagnósticos de la CLI usan rutas relativas al proyecto,
salvo que un comando pida explícitamente rutas absolutas. Los registros de diagnóstico omiten
tokens de API, tokens de invitación/sesión en vivo y códigos OAuth.

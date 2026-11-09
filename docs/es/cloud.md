# El servicio en la nube

[English](../cloud.md)

Usa el servicio en la nube para guardar proyectos entre dispositivos, colaborar con otras personas
y publicar catálogos de lectura. Los proyectos del navegador, los archivos de la CLI y el espacio
Docker también funcionan sin cuenta de Meltemi. Subir un proyecto o entrar a uno compartido es una
elección explícita.

El editor alojado y la API están en `https://diagrams.meltemi.dev`; el inicio de sesión usa la
cuenta de la familia Meltemi en `https://id.meltemi.dev`. Los catálogos publicados usan el dominio
separado `meltemi.page`. Esta referencia cubre credenciales, rutas HTTP, revisiones, colaboración,
permisos, publicación, cuotas y MCP. Para instrucciones paso a paso, empieza por
[la app web](web-app.md), [los comandos de nube](cli.md#los-comandos-de-la-nube) o
[agentes y MCP](agents.md).

## La cuenta es una capa

Usa **Iniciar sesión** en el editor alojado para acceder a proyectos en la nube, tokens de API y
agentes conectados. El inicio de sesión usa GitHub o Google mediante el servicio de cuentas de
Meltemi. **Cuenta Meltemi** abre tu perfil de la familia; **Ajustes de Diagrams** contiene los
ajustes del producto, como el alias de publicación, los tokens, las aplicaciones conectadas y el uso.

El proyecto del navegador sigue separado. Iniciar sesión no lo sube: crea un proyecto en la nube o
elige guardar allí tu proyecto local. Abrir un proyecto compartido o una sesión en vivo conecta
al servicio incluso si entras como invitado sin cuenta.

### Enlaces de proyecto

`GET /p/<id>` es la dirección de un proyecto. La página se sirve siempre en `/` (sus
direcciones de recursos son relativas y su política prohíbe `<base>`), así que el Worker responde
`302` a `/?project=<id>`, conservando el resto de la consulta (`?invite=` incluido) y descartando
cualquier `project` que la propia consulta traiga. Un id tiene 20 letras minúsculas y dígitos; todo
lo demás es `404 project.not-found`, sin redirección. La página lee `project` e `invite` de
`location.search`, acepta la invitación si la hay ([Invitaciones](#invitaciones)), abre ese
proyecto en el modo que le da el rol de la persona ([Ver por enlace](#ver-por-enlace)) y conserva
la dirección, así que al recargar se vuelve a abrir; el enlace que copia una persona es
`<origin>/p/<id>`. `/rooms/<id>` es el socket de la sala de un proyecto
([El socket](#el-socket)); cualquier otro método sobre él, y cualquier solicitud que no sea un
upgrade a WebSocket, es `404 not-found`.

## Quién pregunta

La API acepta la sesión del navegador o un token de API. Los roles del proyecto siguen decidiendo
qué operaciones puede realizar esa identidad.

### Tokens bearer

Usa `Authorization: Bearer mdg_<token>` para la CLI y los scripts. Un token de API válido tiene
prioridad sobre una cookie. Los tokens desconocidos o revocados responden `401 token.invalid`;
un token sigue funcionando después de cerrar la sesión que lo creó, hasta revocarlo o eliminar
la cuenta. Las solicitudes con token bearer no requieren una cabecera `Origin`.

Los tokens de acceso OAuth de MCP son otra credencial: están ligados a `/mcp` y no autorizan
otras rutas de la API. Consulta [Autorización](#autorización).

### La cookie de sesión

El editor alojado usa la cookie `meltemi_session` emitida por el servicio de cuentas de Meltemi.
Una sesión no válida, caducada o de una cuenta eliminada se trata como anónima; una ruta que
requiere sesión responde entonces `401 auth.required`. Una revocación puede tardar hasta una hora
en llegar a un producto que tenga la comprobación en caché. Los cambios con cookie deben cumplir
también la [regla de Origin](#la-regla-de-origin).

### Usuarios

`GET /api/session` identifica la cuenta y sus permisos del producto. Usa el id de cuenta de
**Ajustes de Diagrams → Perfil** cuando un administrador te pregunte a qué cuenta conceder un
permiso. El alias de publicación es distinto de ese id; consulta [Alias](#alias).

## La regla de Origin

Todos los hosts bajo `meltemi.dev` reciben la cookie de sesión y son el mismo sitio para
`SameSite`: un formulario de otro host puede enviar datos a este servicio con la cookie adjunta. Por
eso la cookie sola nunca es consentimiento. Una solicitud hecha con la cookie, con cualquier método
que no sea `GET`, `HEAD` ni `OPTIONS`, debe llevar un `Origin` igual al origen del propio servicio
(`ORIGIN`, o el origen de la propia solicitud en desarrollo), o es `403 request.forbidden` antes de
que se ejecute la ruta. Un `Origin` ausente, `null` o que no sea una dirección no cuenta como el de
la página. No se consultan `Referer` ni `Sec-Fetch-Site`: el primero puede faltar y los navegadores
antiguos no tienen el segundo.

Un token bearer está exento, porque un navegador nunca añade uno por sí solo. Los eventos y el
intercambio del código no determinan ninguna persona y tienen sus propias comprobaciones. Un
upgrade a WebSocket es un `GET`, así que esta regla tampoco lo cubre; la ruta del socket comprueba
por sí misma el `Origin` del upgrade ([El socket](#el-socket)).

La otra regla que acompaña a la cookie es que nada de lo que una persona escribió o subió se sirve
jamás desde un host bajo `meltemi.dev`: el contenido publicado tiene su propio dominio, y el servicio se niega a construir una dirección pública sobre un host que incumpliría la
regla ([El host de publicación](#el-host-de-publicación)).

## Errores

Todo error es JSON, `{ "code": "…", "message": "…" }`, con `Cache-Control: no-store`. El código es
estable; el mensaje está en inglés y nunca contiene un token, una cookie, un secreto ni una traza.
Algunas respuestas llevan un campo más sobre el que quien llama puede actuar: un push obsoleto
contiene la `revision` actual de la sala. Usa el código estable para el manejo programático.

Los rechazos de la propia sala llegan a una persona de dos maneras: como el JSON de una ruta
(`PUT /files`, una creación) o, en el socket, como un mensaje de tipo 4 y un código de cierre
([El protocolo de la sala](#el-protocolo-de-la-sala)). El mismo código nombra a ambos.

| Código                      | Estado | Significado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-found`                 | 404    | No hay ruta pública coincidente, falta el recurso referenciado o quien pregunta no puede descubrirlo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `project.not-found`         | 404    | Un proyecto que no existe o que quien pregunta no puede abrir en absoluto, como uno privado que no es suyo (una misma respuesta para ambos, para que nadie sepa cuáles existen), y `/p/<id>` con un id que no puede ser el de un proyecto; en un socket, la sala de un proyecto que se eliminó                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `request.invalid`           | 400    | El cuerpo no es lo que lee la ruta: no es un objeto JSON, el nombre de un token vacío, de más de 60 caracteres o con caracteres de control, el nombre de un proyecto vacío, de más de 100 caracteres o con caracteres de control, una descripción de más de 500, una etiqueta de más de 80; una plantilla que no existe o que se da junto con archivos; archivos, binarios o un push que no son objetos de texto por path; un hash de binario que no son 64 caracteres hexadecimales en minúscula; un nivel de enlace que no es `private`, `view` ni `edit`, un rol que no es `viewer` ni `editor`, un correo vacío, de más de 254 caracteres o sin un dominio con punto, el propio correo del propietario como invitación; el motivo de una retirada de más de 500 caracteres o con caracteres de control |
| `auth.required`             | 401    | La ruta necesita una persona y la solicitud no trae ninguna (sin credenciales, o con una cookie no válida o caducada); en un proyecto cuyo enlace admite a personas anónimas, una solicitud que iniciar sesión permitiría (un push cuando el enlace es `edit`) o que necesita una cuenta de todos modos (una copia, salir); un upgrade de socket sin una cookie válida, porque en un socket no se admite un token bearer                                                                                                                                                                                                                                                                                                                                                                                   |
| `token.invalid`             | 401    | Un token bearer desconocido, revocado o que no es un token de API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `request.forbidden`         | 403    | Un cambio hecho con la cookie desde una página que no es la del servicio (la regla de `Origin`), o un upgrade de socket cuyo `Origin` no es el del servicio; un token bearer que pide lo que solo puede hacer la página (crear un token); en la página de aprobación, un formulario sin el `csrf` correcto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quota.tokens`              | 413    | La cuenta ya tiene 20 tokens de API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cli.invalid`               | 400    | La solicitud de la línea de comandos no se puede usar: un puerto o un `state` que la página de aprobación no acepta, un código desconocido, ya usado o caducado, un `state` que no coincide, o un intercambio que no se puede leer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cli.rate`                  | 429    | Un solicitante que ha hecho 10 intercambios de código fallidos en el último minuto; `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `path.invalid`              | 400    | Un path de archivo que incumple [la regla de los paths](#la-regla-de-los-paths): en una creación, un push, una subida o un borrado de un binario; en un socket, una transacción que establece un path así (se revierte, código de cierre `4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `blob.unknown`              | 400    | Una imagen o fuente que nombra un hash que el proyecto nunca subió (`project_blobs`) o, en una creación, que ninguno de los proyectos de la persona tiene; en un socket, una transacción que establece un hash así (`4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `doc.invalid`               | 400    | Un cambio que el documento no puede conservar: un path que es a la vez texto y binario en un mismo cambio, un valor de otra forma, un tipo raíz propio, un mensaje de texto o un mensaje de un tipo que un cliente no puede enviar; en un socket, `4400`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `doc.too-large`             | 413    | Un texto de más de 2 Mi caracteres, un documento cuyo estado codificado supera 16 MiB, o un cuerpo mayor que un documento entero; en un socket, la transacción se revierte (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `quota.files`               | 413    | Un proyecto que tendría más de 2000 archivos; en un socket, se revierte (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `quota.projects`            | 413    | La cuenta ya tiene 100 proyectos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `quota.storage`             | 413    | Una subida que llevaría la cuenta por encima de 200 MiB (los bytes que ya referencia no cuentan otra vez)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `quota.binary`              | 413    | Una imagen o fuente de más de 10 MiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `binary.invalid`            | 400    | Una subida que por sus bytes no es un PNG, JPEG, GIF, WebP, SVG, woff2, ttf u otf, diga lo que diga su `Content-Type`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `quota.versions`            | 413    | Un proyecto que ya tiene 200 versiones, una vez que la política ha depurado lo que puede, y al que se pide otra versión o una restauración                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `versions.rate`             | 429    | Más de seis versiones hechas para un proyecto en un minuto (una restauración cuenta); `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `version.not-found`         | 404    | Un número de versión que el proyecto no tiene: nunca se hizo, se depuró, o no es un número                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `thumbnail.too-large`       | 413    | Una miniatura de más de 200 KiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `thumbnail.invalid`         | 400    | Una miniatura que no se envía como `image/svg+xml`, o cuyo cuerpo no es un SVG bien formado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `thumbnail.rate`            | 429    | Una segunda miniatura de un proyecto antes de 30 segundos; `Retry-After` indica cuántos segundos faltan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `revision.mismatch`         | 409    | Un push cuyo `ifRevision` no es la revisión actual de la sala; la respuesta trae esa `revision` y no cambia nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `access.denied`             | 403    | Alguien que ve el proyecto pero no puede hacer esto: un lector, o una persona anónima con un enlace `view`, que lo cambia; un editor, o cualquiera a quien admite el enlace, que hace lo que solo puede el propietario (cambiar cómo se comparte, invitar, publicar, renombrar o eliminar); el propietario que sale de su propio proyecto; en un socket, una actualización de un lector (`4403`)                                                                                                                                                                                                                                                                                                                                                                                                           |
| `invite.invalid`            | 404    | Un enlace de invitación desconocido, ya usado o de más de treinta días (un token que no son 32 caracteres hexadecimales en minúscula recibe la misma respuesta); no se acepta nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `quota.members`             | 413    | Un proyecto que ya tiene 50 miembros e invitaciones pendientes en conjunto (el propietario no cuenta, ni una invitación de más de treinta días); no se registra nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `handle.invalid`            | 400    | Un alias (`handle`) que no son de 3 a 30 letras minúsculas, dígitos o guiones: a la persona no se le recorta ni se le pasa a minúsculas nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `handle.taken`              | 409    | Un alias que otra cuenta ya tiene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `handle.locked`             | 409    | Un cambio de alias mientras una publicación tiene por dirección el alias actual; elegir otra vez el mismo alias siempre es válido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `handle.required`           | 409    | Una publicación de una persona que aún no ha elegido alias, respondida antes de leer el cuerpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `publish.invalid`           | 400    | Un nombre de página (`slug`) que no son de 1 a 60 letras minúsculas, dígitos o guiones, o un `html` que no es texto o está vacío                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `publish.too-large`         | 413    | Una página de más de 16 MiB (UTF-8), o una solicitud de publicación demasiado grande para contener una (más de 24 MiB); no cambia nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `publish.rate`              | 429    | Más de diez solicitudes de publicación para un proyecto en la última hora; `Retry-After` indica cuántos segundos faltan para que la más antigua deje de contar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `publish.taken`             | 409    | Un `slug` que otro proyecto de la misma persona ya publica bajo su alias                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `message.too-large`         | 413    | Un mensaje de un socket de más de 512 KiB, o un mensaje de presencia de más de 16 KiB ([Presencia](#presencia-awareness)); el socket se cierra con `4413`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `room.full`                 | 409    | Una sala que ya tiene 20 clientes, invitados y visitantes incluidos: al 21.º se le avisa y su socket se cierra con `4409`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `awareness.rate`            | 429    | Un cliente que ha enviado más de 100 mensajes de presencia en un segundo: se le avisa en el socket y el socket se cierra con `4429` ([Presencia](#presencia-awareness)); ninguna ruta lo responde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `connections.limit`         | 429    | La undécima conexión abierta sin cuenta desde una misma dirección de cliente: se le avisa en el socket y el socket se cierra con `4428` ([Sesiones en vivo](#sesiones-en-vivo)); ninguna ruta lo responde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `session.ended`             | 410    | La sesión en vivo que admitió una conexión terminó (su propietario la terminó, pasaron sus 24 horas, o su sala estuvo vacía una hora): el socket se cierra con `4410` ([Sesiones en vivo](#sesiones-en-vivo)); ninguna ruta lo responde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `admin.already`             | 409    | Una invitación a administrar para el correo de un propietario o de un administrador ([Administración](#administración))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `admin.limit`               | 409    | Una undécima invitación a administrar pendiente, o una aceptación cuando el servicio ya tiene veinte administradores ([Administración](#administración))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `account.ambiguous`         | 409    | Una ruta de administración nombró una cuenta por un correo con el que inició sesión, verificado, más de una cuenta: nómbrala por su id ([Administración](#administración))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `identity.last`             | 409    | El servicio de identidad conserva la única forma de iniciar sesión de una persona: desvincular el último proveedor desde el panel de la cuenta; no cambia nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `provider.unknown`          | 400    | Un proveedor con el que el servicio de identidad no inicia sesión (solo `github` y `google`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session.current`           | 409    | La sesión con la que llega la solicitud, a la que se pide cerrar desde el panel de la cuenta: termina con Cerrar sesión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `session.not-found`         | 404    | Una sesión que no es de la persona, o ninguna                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rate.limited`              | 429    | El límite del servicio de identidad a las llamadas de cuenta de este servicio para una persona: sesenta por minuto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `identity.unavailable`      | 502    | El servicio de identidad no respondió en cinco segundos, o respondió algo que este servicio no puede leer (entre ello una firma rechazada, que es un problema de configuración); se registra con la ruta y el estado, nunca con un cuerpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `diagram.invalid`           | 400    | Un archivo `.meltemi` de un envío por el endpoint MCP (`write_files`), o de una vista previa, que no compila: no se escribe ni se dibuja nada; `diagnostics` lista los errores y avisos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scope.insufficient`        | 403    | Una llamada MCP con un token cuyos alcances no incluyen el de la herramienta; `scope` nombra el que necesita (un token `mdg_` tiene todos)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `idempotency.mismatch`      | 409    | Una `Idempotency-Key` que la cuenta usó, en el último día, para otra ruta u otro cuerpo; nada cambia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `idempotency.pending`       | 409    | Una `Idempotency-Key` cuya primera petición todavía se está respondiendo; vuelve a pedirlo en un momento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `publish.unverified`        | 502    | La herramienta MCP `publish` guardó la página, pero su dirección pública no respondió `200` al leerla una vez; `url` la nombra, y la publicación existe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `local.feature-unavailable` | 409    | El espacio local no ofrece esta acción de identidad, compartir, sesiones de invitados o publicación; no cambia ningún estado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `renderer.unavailable`      | 503    | El objeto de dibujo no puede dibujar ni comprobar diagramas ahora (su límite de CPU, una sobrecarga, un reinicio); las herramientas MCP `preview`, `validate`, `write_files` y `publish` lo responden sin haber cambiado nada, y su mensaje nombra `mdg mcp`, que hace el mismo trabajo en la máquina de la persona                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `internal`                  | 500    | Cualquier cosa inesperada, o una configuración con la que el servicio no puede ejecutarse; la respuesta no da ningún detalle; en un socket, un mensaje que la sala no pudo atender (`4500`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

La página de aprobación de `/cli-auth` responde `cli.invalid` y `request.forbidden` como páginas
que muestran el código, en inglés o en español, en lugar de JSON.

## Rutas

| Ruta                                                 | Quién puede llamarla                                                                    | Respuesta                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/session`                                   | cualquiera                                                                              | `200`, para quién es la página                                                           |
| `POST /api/tokens`                                   | una persona con sesión iniciada en la página                                            | `201 { id, name, token }`                                                                |
| `GET /api/tokens`                                    | una persona, con la cookie o con un token                                               | `200 { tokens }`                                                                         |
| `DELETE /api/tokens/<id>`                            | una persona, con la cookie o con un token                                               | `204`                                                                                    |
| `GET /cli-auth`                                      | cualquiera; aprueba una persona con sesión iniciada                                     | la página de aprobación, o una redirección para iniciar sesión                           |
| `POST /cli-auth`                                     | una persona con sesión iniciada en la página                                            | `303` al listener de la línea de comandos                                                |
| `POST /cli-auth/token`                               | la línea de comandos                                                                    | `200 { id, name, token }`                                                                |
| `GET /cli-auth/style.css`                            | cualquiera                                                                              | la hoja de estilo de la página de aprobación                                             |
| `GET /p/<id>`                                        | cualquiera                                                                              | `302` a `/?project=<id>`                                                                 |
| `GET /rooms/<id>`                                    | quien admita el proyecto, o el token de una sesión en vivo                              | `101`, un socket a la sala del proyecto                                                  |
| `PATCH /api/account`                                 | una persona, con la cookie o un token                                                   | `200 { handle }`                                                                         |
| `GET /api/account/identity`                          | una persona con sesión iniciada en la página                                            | `200`, los inicios de sesión y las sesiones de la persona según el servicio de identidad |
| `POST /api/account/identity/unlink`                  | una persona con sesión iniciada en la página                                            | `200`, lo mismo sin el proveedor                                                         |
| `POST /api/account/identity/sessions/revoke-others`  | una persona con sesión iniciada en la página                                            | `200`, lo mismo con esta sesión sola                                                     |
| `POST /api/account/identity/sessions/<sid>/revoke`   | una persona con sesión iniciada en la página                                            | `200`, lo mismo sin esa sesión                                                           |
| `POST /api/invitations/<token>/accept`               | una persona, con la cookie o con un token                                               | `200`, el proyecto, con el rol que la persona tiene ahora                                |
| `GET /api/admin`                                     | un propietario o un administrador, con la cookie; cualquier otra persona recibe `404`   | `200`, lo que muestra la consola central de administración                               |
| `DELETE /api/admin/publications/<handle>/<slug>`     | un propietario o un administrador, con la cookie; cualquier otra persona recibe `404`   | `204`                                                                                    |
| `POST /api/admin/invitations`                        | un propietario, con la cookie; cualquier otra persona recibe `404`                      | `201`, la invitación (`200`, la que ya estaba pendiente)                                 |
| `DELETE /api/admin/invitations/<id>`                 | un propietario, con la cookie; cualquier otra persona recibe `404`                      | `204`                                                                                    |
| `POST /api/admin/invitations/<id>/accept`            | el invitado, con la cookie y el correo verificado; cualquier otra persona recibe `404`  | `204`                                                                                    |
| `POST /api/admin/invitations/<id>/decline`           | el invitado, con la cookie y el correo verificado; cualquier otra persona recibe `404`  | `204`                                                                                    |
| `DELETE /api/admin/administrators/<sub>`             | un propietario, o ese administrador, con la cookie; cualquier otra persona recibe `404` | `204`                                                                                    |
| `GET /api/admin/permissions/<id>`                    | un propietario o un administrador, con la cookie; cualquier otra persona recibe `404`   | `200`, quienes tienen el permiso                                                         |
| `GET /api/admin/accounts/<account>/permissions/<id>` | un propietario o un administrador, con la cookie; cualquier otra persona recibe `404`   | `200`, el permiso de la cuenta                                                           |
| `PUT /api/admin/accounts/<account>/permissions/<id>` | un propietario o un administrador, con la cookie; cualquier otra persona recibe `404`   | `200`, el permiso de la cuenta                                                           |
| `POST /mcp`                                          | un agente, con un token de acceso OAuth o un token de API                               | la respuesta JSON-RPC ([El endpoint MCP](#el-endpoint-mcp))                              |
| `GET /.well-known/oauth-authorization-server`        | cualquiera                                                                              | `200`, los metadatos del servidor de autorización                                        |
| `GET /.well-known/oauth-protected-resource/mcp`      | cualquiera                                                                              | `200`, los metadatos del endpoint (también en la ruta sin `/mcp`)                        |
| `POST /oauth/register`                               | un cliente OAuth; diez por hora y dirección                                             | `201`, el cliente                                                                        |
| `GET /oauth/authorize`                               | cualquiera; aprueba una persona con sesión iniciada                                     | la página de consentimiento, una redirección para iniciar sesión, o una hacia el cliente |
| `POST /oauth/authorize`                              | una persona con sesión iniciada en la página                                            | `303` a la URI de redirección del cliente                                                |
| `POST /oauth/token`                                  | un cliente OAuth                                                                        | `200`, los tokens                                                                        |
| `GET /api/account/apps`                              | una persona con sesión iniciada en la página                                            | `200 { grants }`                                                                         |
| `DELETE /api/account/apps/<id>`                      | una persona con sesión iniciada en la página                                            | `204`                                                                                    |

Las rutas de los proyectos nombran cada una el rol que necesitan: el del propietario, el de un
editor o, para lo que solo lee, el de un lector, que el enlace del proyecto puede dar a cualquiera,
con sesión iniciada o sin ella ([Compartir y permisos](#compartir-y-permisos) tiene la tabla y el
orden de los rechazos). Una ruta que necesita más de lo que da el enlace necesita una persona, con
la cookie o con un token; un proyecto que la persona no puede abrir en absoluto es
`404 project.not-found`. [La API de proyectos](#la-api-de-proyectos),
[Compartir y permisos](#compartir-y-permisos) y [Publicación](#publicación) tienen sus formas.

| Ruta                                           | Respuesta                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/projects`                            | `200 { projects }`                                                                                             |
| `POST /api/projects`                           | `201`, el proyecto                                                                                             |
| `GET /api/projects/<id>`                       | `200`, el proyecto                                                                                             |
| `PATCH /api/projects/<id>`                     | `200`, el proyecto                                                                                             |
| `DELETE /api/projects/<id>`                    | `204`                                                                                                          |
| `POST /api/projects/<id>/duplicate`            | `201`, la copia (y `skipped`, si se dejaron archivos fuera)                                                    |
| `GET /api/projects/<id>/files`                 | `200 { revision, files, binaries, collisions }`                                                                |
| `PUT /api/projects/<id>/files`                 | `200 { revision }`                                                                                             |
| `PUT /api/projects/<id>/binaries/<path>`       | `200 { hash }`                                                                                                 |
| `DELETE /api/projects/<id>/binaries/<path>`    | `204`                                                                                                          |
| `GET /api/projects/<id>/blobs/<hash>`          | `200`, los bytes, en una sandbox                                                                               |
| `HEAD /api/projects/<id>/blobs/<hash>`         | `200`, las cabeceras del `GET`                                                                                 |
| `POST /api/projects/<id>/versions`             | `201`, la versión                                                                                              |
| `GET /api/projects/<id>/versions`              | `200 { versions }`                                                                                             |
| `GET /api/projects/<id>/versions/<n>`          | `200`, la versión con sus archivos                                                                             |
| `POST /api/projects/<id>/versions/<n>/restore` | `200 { revision, restored, saved, skipped? }`                                                                  |
| `PUT /api/projects/<id>/thumbnail`             | `204`                                                                                                          |
| `GET /api/projects/<id>/thumbnail`             | `200`, el SVG, en una sandbox                                                                                  |
| `GET /api/projects/<id>/sharing`               | `200`, el nivel del enlace, el rol de quien pregunta y, hasta donde puede verlas, las personas                 |
| `PATCH /api/projects/<id>/sharing`             | `200`, el estado completo de lo que se comparte                                                                |
| `POST /api/projects/<id>/members`              | `201`, la invitación con su enlace (`200` cuando el correo ya tenía una pendiente)                             |
| `PATCH /api/projects/<id>/members/<sub>`       | `200`, el miembro                                                                                              |
| `DELETE /api/projects/<id>/members/<sub>`      | `204`                                                                                                          |
| `DELETE /api/projects/<id>/members/me`         | `204`                                                                                                          |
| `GET /api/projects/<id>/invitations`           | `200 { invitations }`                                                                                          |
| `DELETE /api/projects/<id>/invitations/<id>`   | `204`                                                                                                          |
| `GET /api/projects/<id>/publish`               | `200 { handle, publications, takedowns }`                                                                      |
| `PUT /api/projects/<id>/publish`               | `200 { url, handle, slug, bytes, published_at }`                                                               |
| `DELETE /api/projects/<id>/publish/<slug>`     | `204`                                                                                                          |
| `PUT /api/projects/<id>/live`                  | `200 { id, link, guestsEdit, startedAt, until, guests }`                                                       |
| `GET /api/projects/<id>/live`                  | `200`, la sesión en vivo como la responde `PUT`, o `null`                                                      |
| `DELETE /api/projects/<id>/live`               | `204`                                                                                                          |
| `GET /api/account/usage`                       | `200 { projects, storageBytes, limits }`                                                                       |
| `GET /api/account/publications`                | `200 { handle, publications }`: cada publicación de los proyectos de quien pregunta, cada una con su `project` |

Las fechas y horas son ISO 8601 en UTC con milisegundos.

Los cuerpos cliente tienen topes explícitos: los metadatos habituales de cuenta/proyecto y el JSON
de compartir/retirada se limitan a 8 KiB; el intercambio CLI a 4 KiB; una creación/push a 17 MiB
(`doc.too-large`); un recurso subido a 10 MiB (`quota.binary`); una miniatura a 200 KiB
(`thumbnail.too-large`); y una publicación a 24 MiB, incluidos como máximo 16 MiB de página
(`publish.too-large`). Un cuerpo JSON habitual demasiado grande es `400 request.invalid`.

### La respuesta de sesión

`GET /api/session` es la única solicitud que hace la página al arrancar. Responde `200` con
`Cache-Control: no-store`, con una de tres formas. Una persona con la cookie:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana",
    "entitlements": { "unbranded": false, "unbrandedBy": null },
    "administration": null,
    "administrationInvitation": null
  },
  "account": "https://id.meltemi.dev/account",
  "signOut": "https://id.meltemi.dev/logout",
  "support": { "url": "https://github.com/sponsors/askenaz" }
}
```

`handle` es el nombre bajo el que la persona publica, o `null` hasta que lo elige
([Alias](#alias)). `entitlements.unbranded` dice si la cuenta puede exportar sin la marca de
Meltemi: `true` cuando un propietario o un administrador se lo concedió, y para todo propietario y
todo administrador ([Habilitaciones](#habilitaciones)); `entitlements.unbrandedBy` dice quién fijó
la marca de la fila: `"github-sponsors"` para la reclamación de una donación, `"administrator"` para
una persona, y `null` cuando la fila no la tiene (incluido el derecho propio de un propietario o un
administrador). `support`, en todas las formas, es la página donde donar,
`https://github.com/sponsors/<SPONSORS_ACCOUNT>`, cuando el servicio tiene una cuenta patrocinada, y
no aparece si no ([Patrocinios](#patrocinios)). `administration` es `{ "role": "owner" }`
o `{ "role": "administrator" }` para las personas que administran el servicio, y `null` para todas
las demás ([Administración](#administración)). `administrationInvitation` es la invitación a
administrar pendiente dirigida al correo del propio token de la sesión, cuando el servicio de
identidad lo verificó, como `{ "id", "invitedBy": { "name" }, "expiresAt" }`, y `null` si no, siempre
para un propietario o un administrador; la persona la acepta o la rechaza en el panel de la cuenta.
Antes de responder, una cookie cuyo correo verificó el servicio de identidad ve cómo cada invitación
pendiente para ese correo se convierte en una membresía ([Invitaciones](#invitaciones)); un correo
que no está verificado no resuelve nada. Iniciar sesión no hace administrador a nadie. `account` es la
página del servicio de identidad y `signOut` la dirección a la que un formulario envía, con el
campo `return_to`, para terminar la sesión. Un token bearer, para que la línea de comandos sepa qué
token tiene, sin `account` ni `signOut` ni los dos campos de administración, porque un programa no
administra; lleva también el alias, pero no resuelve ninguna invitación, porque solo la cookie tiene
un correo verificado. Lleva el `email` propio de la cuenta tal como lo guarda el servicio (una cadena
vacía cuando no guarda ninguno), que responde el `whoami` del servidor MCP local:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana",
    "entitlements": { "unbranded": false, "unbrandedBy": null },
    "email": "ana@example.com"
  },
  "token": { "id": "5f0c2a9e", "name": "laptop" }
}
```

Cualquier otro caso, incluida una cookie que no se verifica:

```json
{
  "user": null,
  "signIn": "https://id.meltemi.dev/login?return_to=https%3A%2F%2Fdiagrams.meltemi.dev%2F"
}
```

El `return_to` es la dirección de la propia página: el origen del servicio más el path y la consulta
del `Referer` de la solicitud cuando está bajo el origen, y si no, `/`. Se construye a partir del
origen, así que las credenciales o el fragmento de un `Referer` nunca llegan a él, y una dirección
de más de 2048 caracteres, que el servicio de identidad rechaza, vuelve a `/`.

### Tokens de API

Un token es `mdg_` seguido de 32 bytes aleatorios en base64url. Se muestra una sola vez, en la
respuesta que lo crea; solo se guarda su SHA-256. Los tokens no caducan: uno perdido se revoca.

La línea de comandos envía un token como `Authorization: Bearer` y guarda el suyo en la carpeta de
configuración del usuario: `mdg login` crea uno ([más abajo](#el-inicio-de-sesión-de-la-línea-de-comandos)),
`mdg logout` lo revoca con `DELETE /api/tokens/<id>`, y `MELTEMI_TOKEN` en el entorno lo reemplaza,
que es como inicia sesión la CI. Envía un token solo al host que resolvió (nunca el que nombra un
`project.json`), nunca por `http:` salvo al loopback, y nunca sigue una redirección con él; y nunca
lo imprime: `mdg_…` se oculta en todo lo que escribe la línea de comandos
([la línea de comandos](cli.md#el-host-y-el-token), [seguridad](security.md#la-línea-de-comandos-y-la-nube)).

- `POST /api/tokens` con `{ "name": "laptop" }` responde `201` con `{ "id", "name", "token" }`. Solo
  puede pedirlo una persona con sesión iniciada en la página (se aplica la regla de `Origin`): un
  token no puede crear otro token, así que uno robado no puede generar copias que sobrevivan a su
  revocación. El nombre se recorta y tiene de 1 a 60 caracteres, sin caracteres de control. Una
  cuenta tiene como máximo 20 tokens; después, `413 quota.tokens`.
- `GET /api/tokens` responde `{ "tokens": [{ "id", "name", "created_at", "last_used_at" }] }`, del
  más nuevo al más antiguo; `last_used_at` es `null` hasta que el token se usa por primera vez.
  Ni un token ni su hash forman nunca parte de la respuesta.
- `DELETE /api/tokens/<id>` revoca uno de los tokens de quien pregunta, incluido el que hace la
  solicitud, y responde `204`. Un id ajeno o inexistente responde igual, `404 not-found`. A partir
  de entonces el token es `401 token.invalid`.

### Los datos de identidad

El panel de la cuenta puede leer los proveedores vinculados y las sesiones activas mediante estas
rutas autenticadas con cookie. Los tokens bearer de API no gestionan inicios de sesión ni sesiones
(`403 request.forbidden`); quien no tenga sesión de navegador recibe `401 auth.required`. La regla
de Origin se aplica a los cambios.

- `GET /api/account/identity` devuelve `{ "user", "identities": [{ "provider", "email", "emailVerified", "handle", "linkedAt" }], "sessions": [{ "sid", "label", "createdAt", "lastSeen", "expiresAt", "current" }], "canUnlink" }`.
  También puede devolver `"claimed": true` cuando una cuenta GitHub vinculada reconoce un beneficio de patrocinio.
- `POST /api/account/identity/unlink` recibe `{ "provider" }`.
- `POST /api/account/identity/sessions/revoke-others` cierra las sesiones de los demás dispositivos.
- `POST /api/account/identity/sessions/<sid>/revoke` cierra esa sesión.

Las rutas `POST` devuelven la vista actualizada. Los rechazos conservan los códigos `identity.last`,
`provider.unknown`, `session.current`, `session.not-found` y `rate.limited`. Una sesión cerrada es
`401 auth.required`; un servicio de cuentas no disponible es `502 identity.unavailable`.
Vincular un proveedor y eliminar la cuenta usan las páginas de confirmación del servicio de
cuentas Meltemi, en lugar de estas rutas de la API.

### Eventos de eliminación

Elimina tu cuenta de la familia desde **Cuenta Meltemi**, donde la confirmación explica el alcance.
Diagrams elimina los proyectos propios, sus versiones, archivos subidos, publicaciones, tokens de
API, aprobaciones CLI pendientes y membresías. Las concesiones a aplicaciones conectadas se
revocan. Un inicio de sesión posterior crea trabajo nuevo; no restaura los proyectos eliminados.

Se conserva un id opaco de cuenta y la fecha de eliminación durante 31 días para rechazar sesiones
antiguas. Las retiradas y los registros de administración se conservan como registros del servicio;
los bytes compartidos por contenido se pueden [limpiar](#la-recolección-de-blobs) cuando nadie los
referencie. El endpoint de eventos de identidad firmados está reservado al servicio de cuentas;
los scripts no deben usarlo para eliminar una cuenta.

### El inicio de sesión de la línea de comandos

Usa `mdg login` y aprueba la solicitud en tu navegador; consulta la
[guía de la CLI](cli.md#iniciar-sesión-login-logout-y-whoami) para el flujo de uso. El protocolo público es:

1. El cliente inicia un listener de retorno en `127.0.0.1` y abre
   `https://diagrams.meltemi.dev/cli-auth?port=<n>&state=<s>`. El puerto es un entero decimal
   sencillo de 1024 a 65535; `state` tiene de 16 a 128 caracteres base64url. Un valor no válido es
   `400 cli.invalid`.
2. La página requiere sesión de navegador y muestra una comprobación de seis caracteres.
   Compárala con la terminal antes de **Aprobar**. Es la primera parte de seis caracteres base32
   (RFC 4648, mayúsculas, sin relleno) del SHA-256 de `state`.
3. El formulario generado de aprobación envía a `POST /cli-auth` con su valor CSRF y el Origin
   correcto. El retorno va solo a `http://127.0.0.1:<port>/?code=<code>&state=<state>`; ningún
   token de API aparece en esa dirección.
4. El cliente comprueba `state` e intercambia `{ "code": "…", "state": "…" }` en
   `POST /cli-auth/token`, sin cookie ni Origin. Un código dura cinco minutos y tiene un solo uso.
   El éxito devuelve una vez `200 { "id", "name", "token" }`. Un código no válido, caducado o
   usado responde `400 cli.invalid`; una cuenta con 20 tokens responde `413 quota.tokens`.
5. La CLI guarda la credencial y cierra su listener. Sin navegador local, usa `mdg login --token`
   para leer un token desde la entrada estándar; no lo pongas en una opción del comando.

Diez intercambios fallidos en un minuto hacen que el siguiente responda `429 cli.rate` con
`Retry-After: 60`. La CLI espera como máximo cinco minutos el retorno y rechaza solicitudes a
otro host/puerto o con un estado distinto.

## Un proyecto en la nube

Un proyecto en la nube combina ediciones concurrentes en un documento Yjs y ofrece operaciones
de archivos con revisión. Los cambios HTTP y WebSocket comparten validación y permisos; un
lector recibe los cambios pero no puede escribirlos. Consulta [Compartir y permisos](#compartir-y-permisos).

El id de un proyecto son 20 caracteres de base32 en minúscula (de `a` a `z` y de `2` a `7`) a
partir de 12 bytes aleatorios, elegidos por el Worker: es la dirección del proyecto (`/p/<id>`) y el
nombre de su sala. El id de un archivo son 16 caracteres de base32 a partir de 10 bytes aleatorios,
elegidos por quien añade el archivo, y no cambia nunca.

### El documento

```text
Y.Doc
├── files:    Y.Map<fileId, Y.Text>   // los archivos de texto que edita la página
├── paths:    Y.Map<fileId, string>   // el path de cada archivo, de texto o binario
└── binaries: Y.Map<fileId, string>   // imágenes y fuentes: SHA-256 (hex) de los bytes
```

Un archivo de texto es un `Y.Text` en `files` y un path en `paths`; una imagen o una fuente es un
hash en `binaries` y un path en `paths`, y sus bytes se obtienen aparte mediante la API de recursos del proyecto, nunca se guardan en el documento. Esos son los únicos tres tipos raíz: un
cliente que crea otro es rechazado (`doc.invalid`).

Los archivos tienen id para que renombrar sea un cambio pequeño: `paths.set(id, newPath)`. El
`Y.Text` del texto es la misma instancia, así que su historial y las ediciones simultáneas de otros
dispositivos continúan, y la actualización que envía un cambio de nombre pesa menos de 1 KiB sea
cual sea el tamaño del archivo. Todo lo que está fuera del documento habla en paths: `GET` y
`PUT …/files`, el binding de la página y la línea de comandos traducen entre path e id.

Dos ids pueden acabar con un mismo path (dos dispositivos añaden o renombran un archivo con el mismo
nombre sin conexión). El resultado es determinista y nunca silencioso: el id menor en orden
lexicográfico conserva el path, el otro se muestra como `<path>~<id>`, y ambos se listan como
`collisions`, cada uno `{ path, keeper, id, shown }`, en `hello` y en `GET …/files`, para que la
página se lo diga a la persona. `<path>~<id>` es un nombre para mostrar que
[la regla de los paths](#la-regla-de-los-paths) rechaza, así que una copia del proyecto y una
restauración dejan fuera un archivo así y lo nombran en `skipped`. Cambiar el nombre de uno de los
dos termina la colisión.

### La regla de los paths

Una sola regla nombra todos los archivos de un proyecto en la nube: `cleanPath` e `isCleanPath` de
`@meltemi/diagrams-project`, que la app reexporta y que
importan el Worker, la sala y la línea de comandos. Un path es válido cuando ya está en forma
canónica: relativo, separado por `/`, de 1 a 12 segmentos, cada uno de 1 a 100 caracteres que son
letras ASCII, dígitos, `_`, espacio, `.`, `(`, `)`, `+`, `@` o `-`, ninguno de ellos `..` y ninguno
que empiece por punto. `diagrams/flow.meltemi` pasa; `../secrets.meltemi`,
`.git/hooks/post-checkout`, `a\b.meltemi`, `a//b`, `./a`, `a:b`, un path con un carácter de
control, con una letra acentuada o con 13 segmentos, no.

`cleanPath` convierte las barras invertidas en barras y quita los segmentos vacíos y `.`;
`isCleanPath(path)` pregunta si `cleanPath` no cambiaría nada, y eso es lo que impone la nube:
nunca repara un path. La sala la aplica a cada transacción sea cual sea su origen (socket, push,
restauración) y toda ruta que recibe un path también la aplica (crear, push, subir y borrar una
imagen o fuente): `400 path.invalid`. En un socket la transacción se revierte y el socket se cierra
con `4400`.

Qué más comprueba la sala en cada transacción, sea cual sea su origen, por este orden: la forma
(cada clave de `files` y de `binaries` tiene un path en `paths`, los valores de `files` son `Y.Text`
simples, los valores de `binaries` son 64 caracteres hexadecimales en minúscula, ningún id es las
dos cosas, nada salvo los tres tipos raíz: `doc.invalid`); los paths (`path.invalid`); como máximo
2000 entradas en `paths` (`quota.files`); como máximo 2 Mi caracteres en un texto
(`doc.too-large`); cada hash presente en `project_blobs` para este proyecto (`blob.unknown`); como
máximo 250 000 estructuras en el documento, la unidad que Yjs guarda en memoria y que el tamaño
codificado no acota (`doc.too-large`); y como máximo 16 MiB de documento codificado
(`doc.too-large`). Solo mira lo que cambió la transacción, así
que una pulsación de tecla cuesta una pulsación de tecla, y codifica el documento para medirlo solo
cuando está cerca del límite. Una transacción que incumple una regla se revierte (la sala
reconstruye el documento a partir de su último estado bueno y de las actualizaciones aceptadas
desde entonces) y se avisa a quien la envió.

### El socket

La página se conecta a `wss://<origin>/rooms/<project id>` (`ws:` cuando la página se sirve por
`http:`, como en desarrollo). El Worker responde a `GET /rooms/<id>` solo para un upgrade a
WebSocket; cualquier otro método, o una solicitud sin el upgrade, es `404 not-found`, la haga quien
la haga. Después, por este orden:

1. Quién pregunta, solo por la cookie: en un socket no se admite un token bearer (una solicitud con
   uno y sin cookie es anónima).
2. De dónde viene el upgrade: su `Origin` debe ser el del propio servicio, o es
   `403 request.forbidden`, con token o sin él.
3. Qué es la persona para el proyecto ([Roles](#roles)): `owner`, `editor`, `viewer`, o nada. Nada,
   sin el token de una sesión en vivo (`?live=<token>`), es `404 project.not-found`, como lo son un
   proyecto que no existe y un id que no puede serlo. Con un token el proyecto debe existir (nunca
   se crea una sala para un id que el almacén no tiene), y la sala comprueba el token ella misma
   ([Sesiones en vivo](#sesiones-en-vivo)).
4. Quién es la conexión. Una persona con sesión iniciada es su cuenta: `sub`, nombre e imagen. Una
   persona sin cuenta es un invitado: `?guest=` debe ser los 32 caracteres hexadecimales en
   minúscula que su navegador creó una vez y conserva (`400 request.invalid` si no), su `sub` es
   `guest:<id>`, su nombre es `?name=` recortado cuando tiene de 1 a 40 caracteres y ningún carácter
   de control (si no, "Guest NN", NN dos dígitos del id), y no tiene imagen. Sin token un invitado
   es `viewer`, que es lo que da cualquier enlace que admite a una persona anónima: quien visita de
   forma anónima un enlace `view` o `edit` sigue la sala en vivo.

El rol queda fijado cuando se abre el socket. Un lector recibe todo lo que escribe un editor, como
todo el mundo, y la primera actualización que envía un lector se rechaza: la sala lo avisa con
`access.denied` y cierra el socket con `4403`, y el documento y su revisión quedan como estaban. La
presencia no es una actualización: un lector la envía y la recibe como cualquiera
([Presencia](#presencia-awareness)). Un cambio de acceso corta los sockets que pueda haber dejado obsoletos, para que el rol se determine de
nuevo ([Cuando cambia el acceso](#cuando-cambia-el-acceso)).

### El protocolo de la sala

Los mensajes son binarios; el primer byte es el tipo.

| Tipo | Nombre      | Sentido           | Contenido                                                                                                                                                                                                                                                                                                                                     |
| ---- | ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `sync`      | en ambos sentidos | Un vector de estado. De un cliente: la sala responde con un tipo 1 con lo que le falta al cliente (siempre, aunque no tenga nada que enviar). De la sala: su propio vector, enviado una vez después de `hello` y siempre que una actualización espera algo de lo que depende; el cliente responde con un tipo 1 con lo que le falta a la sala |
| 1    | `update`    | en ambos sentidos | Una actualización de Yjs. De un cliente, la sala la aplica como una transacción, sube la revisión, programa una escritura y una materialización, y la envía a todos los demás clientes; de la sala es un cambio que el cliente aplica como venido de fuera                                                                                    |
| 2    | `awareness` | en ambos sentidos | Presencia ([Presencia](#presencia-awareness)). De un cliente: su propio estado. De la sala: los estados de los demás clientes, cada uno con la identidad que la sala conoce del remitente, o `null` para un cliente que se ha ido. La sala solo lo retransmite                                                                                |
| 3    | `hello`     | sala a cliente    | JSON, una vez al conectar: `{ role, revision, limits, collisions, you, live }`                                                                                                                                                                                                                                                                |
| 4    | `error`     | sala a cliente    | JSON `{ code }`, y después el socket se cierra                                                                                                                                                                                                                                                                                                |

`hello` dice qué es la persona para el proyecto, la revisión en la que está la sala, los límites que
impone, las colisiones del documento, cuál es esta conexión (`guest` para una persona sin cuenta)
y, para una conexión que admitió una sesión en vivo, el fin de la sesión y si los invitados editan
(`null` para cualquier otra):

```json
{
  "role": "owner",
  "revision": 41,
  "limits": {
    "files": 2000,
    "documentBytes": 16777216,
    "textCharacters": 2097152,
    "message": 524288,
    "clients": 20
  },
  "collisions": [],
  "you": {
    "id": "9f3c2a71d04be856",
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://…",
    "guest": false
  },
  "live": null
}
```

Después de `hello` la sala envía su vector de estado. El cliente envía el suyo, recibe lo que le
falta y envía lo que le falta a la sala, y los dos documentos quedan iguales: así es también como
las ediciones hechas sin conexión llegan a la sala, sin nada especial al reconectar.

Una actualización que no cambia nada, porque la sala ya la tiene (entera o en parte), se acepta sin
dejar rastro: ni revisión, ni difusión, ni escritura. Por eso un cliente puede enviar su documento
entero en cada conexión. Una actualización que espera algo de lo que depende (la sala perdió su
último segundo, o el cliente envió muy poco) no se conserva, y la sala responde con su vector de
estado para que el cliente envíe lo que falta, esa actualización incluida (la sala pregunta una vez,
hasta que una actualización de ese cliente llegue entera). Una actualización que nombra un tipo raíz
propio, aunque esté esperando, es `doc.invalid`. Un mensaje de texto, un mensaje vacío y un tipo que un
cliente no puede enviar (`hello`, `error` o uno desconocido) cierran el socket con `doc.invalid`.

Un rechazo es un mensaje de tipo 4, `{ "code": "…" }`, y después el socket se cierra con un código
que dice de qué familia es el rechazo:

| Código de cierre | Código de error                                     | Cuándo                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4400             | `path.invalid`, `blob.unknown`, `doc.invalid`       | Una transacción, o un mensaje, que incumple una regla del documento; la transacción se revierte                                                                                                                                            |
| 4403             | `access.denied`                                     | Un lector envió una actualización                                                                                                                                                                                                          |
| 4404             | `project.not-found`                                 | El proyecto se eliminó mientras el cliente estaba conectado                                                                                                                                                                                |
| 4409             | `room.full`                                         | El 21.º cliente: no recibe `hello`                                                                                                                                                                                                         |
| 4410             | `session.ended`                                     | Terminó la sesión en vivo que admitió la conexión                                                                                                                                                                                          |
| 4413             | `doc.too-large`, `quota.files`, `message.too-large` | Un texto de más de 2 Mi caracteres o un documento de más de 16 MiB, más de 2000 archivos, un mensaje de más de 512 KiB (por debajo del 1 MiB de la plataforma, para que la sala lo vea), un mensaje de presencia de más de 16 KiB          |
| 4428             | `connections.limit`                                 | La undécima conexión abierta sin cuenta desde una misma dirección de cliente: no recibe `hello`                                                                                                                                            |
| 4429             | `awareness.rate`                                    | Un cliente envió más de 100 mensajes de presencia en un segundo                                                                                                                                                                            |
| 4500             | `internal`                                          | La sala no pudo atender un mensaje                                                                                                                                                                                                         |
| 4000             | ninguno                                             | La herramienta de desarrollo ([Las rutas de desarrollo](../internal/es/cloud-implementation.md#las-rutas-de-desarrollo)), o un cambio de acceso ([Cuando cambia el acceso](#cuando-cambia-el-acceso)), cortó la conexión; no es un rechazo |

La página distingue una conexión caída de un rechazo: un cierre sin mensaje de tipo 4 y sin un
código de 4400 a 4429 es una caída, y reconecta al cabo de un segundo, duplicando hasta treinta; un
rechazo se muestra a la persona y el socket se reabre al cabo de medio segundo, duplicando si se
repite. `4404` no es ni una cosa ni la otra: el proyecto ya no existe, así que la página deja de
reconectar, lo dice y conserva lo que tiene. Tampoco lo son `4410` y `4428`: la página deja de
reconectar con esa dirección, dice por qué, y sigue como describe
[Sesiones en vivo](#sesiones-en-vivo).

Una sala que ya tiene 20 clientes rechaza al 21 con `room.full`, con una excepción: el propietario
y los editores con cuenta entran mientras un lector o un invitado ocupe un sitio. Ese cede su sitio
y se le dice `room.full` como si hubiera llegado el último; es el socket más reciente de la persona
que más de esos sockets tiene, de modo que una cuenta, o el navegador de un invitado, que abrió
muchos sockets para mantener la sala llena pierde primero los suyos. Un lector o un invitado (de
cualquier rol) nunca entra por encima de nadie, y el propietario y los editores son rechazados
cuando los 20 son personas con cuenta que pueden escribir.

### Presencia (awareness)

La presencia es lo que cada página cuenta a las demás sobre su persona: el archivo que tiene
abierto, dónde está su cursor o su selección en él, qué ha seleccionado en el lienzo y dónde está
su puntero sobre él y los puntos de un trazo del Puntero. Viaja en
mensajes de tipo 2, y la sala solo los retransmite: nada de ello se escribe en el almacenamiento de
la sala, y no cambia ni el documento ni su revisión. [La app web](web-app.md#trabajar-juntos)
la muestra. El formato es pequeño y propio de la página: un objeto con una clave por conexión, como
lo hace el protocolo de awareness de Yjs, sin el paquete `y-protocols`.

**De un cliente.** Después del byte de tipo, el contenido es JSON en UTF-8: un objeto con
exactamente una entrada, el estado del propio cliente, o `null` cuando ya no tiene ninguno. Cada
parte de un estado es opcional (una persona sin ningún archivo abierto envía `{}`):

```json
{
  "9f3c2a71d04be856": {
    "file": "k7h2m4n9p3q5r8s2",
    "caret": { "anchor": "AQID", "head": "AQIE" },
    "canvas": {
      "selection": ["api", "db"],
      "pointer": { "x": 312, "y": 148, "diagram": "flow" },
      "laser": {
        "diagram": "flow",
        "points": [
          { "x": 312.4, "y": 148, "t": 0 },
          { "x": 320, "y": 151.5, "t": 24 }
        ]
      }
    }
  }
}
```

- `file` es el id del archivo que la persona tiene abierto (`paths` da su nombre), así que la
  presencia sobrevive a un cambio de nombre.
- `caret` lleva dos posiciones relativas de Yjs en el texto de ese archivo, codificadas por la
  página; cada una tiene como máximo 256 caracteres y la sala no las lee. Al ser posiciones en el
  texto y no desplazamientos, se quedan en los mismos caracteres mientras otros editan.
- `canvas.selection` lista los ids seleccionados en el lienzo, cada uno de 256 caracteres como
  máximo.
- `canvas.pointer` es dónde está el puntero de la persona sobre su lienzo, mientras se mueve por
  él: dos números en unidades del diagrama, finitos y a menos de un millón del origen, que la sala
  redondea a enteros, y el id del diagrama sobre el que está.
- `canvas.laser` es la estela de la herramienta Puntero (K en el lienzo): los puntos que un trazo ha
  hecho desde el último estado del cliente, 64 como máximo, cada `x` e `y` en unidades del diagrama
  (finitos, a menos de un millón del origen y con una décima de precisión) y `t` un número entero de
  milisegundos desde el primer punto, de 0 a 1000, y el id del diagrama sobre el que están los
  puntos. Una tanda que pasa de esos límites, o un punto de forma incorrecta, invalida todo el
  mensaje. Una estela va en el mismo mensaje que el puntero y se retransmite una sola vez: la sala
  nunca la guarda, y un estado que retransmita después no la lleva.
- `canvas.laser.pen`, cuando está, dice que la tanda es un trazo que se dibuja con el lápiz o el
  marcador, no la estela del Puntero: `{ "width", "colour", "opacity", "stroke", "cancel"? }`, el
  ancho un entero de 1 a 64, el color un texto de 32 caracteres como máximo, la opacidad un número
  de 0 a 1, `stroke` un entero de 0 a 2.147.483.647 que la página de la persona aumenta con cada
  trazo (todas las tandas de un trazo llevan el mismo número) y `cancel`, cuando está, `true`: la
  tanda, que puede no tener puntos, termina un trazo cancelado con Escape. Los demás lienzos dibujan
  las tandas de un número como un solo trazo que crece y no se desvanece, nunca unido al trazo
  anterior, hasta que llega el dibujo que contiene el `pen` escrito; una cancelación lo quita al
  instante. Una parte que pasa de esos límites invalida todo el mensaje.

Una parte del lienzo lleva una selección, un puntero, una estela o cualquiera de ellos.

La clave de la entrada se ignora (la página usa el id de su conexión), y la sala no lee nada más del
estado: un `user`, un nombre o cualquier otro campo no se retransmite nunca. Un mensaje de otra
forma (que no es JSON, con ninguna entrada o con más de una, un `file` que no es un id de archivo,
un cursor con un solo extremo, una selección que no es una lista de textos) se descarta y se
cuenta; no cierra la conexión y no renueva el estado del cliente.

**A los clientes.** La sala envía cada estado a todos los demás clientes, nunca de vuelta a quien lo
envió, como un objeto cuya clave es el id de conexión del remitente (el `you.id` de su `hello`), con
la identidad en `user`:

```json
{
  "5d0e7a1c9b24f3a8": {
    "user": {
      "sub": "u_8a21",
      "name": "Ben",
      "picture": "https://…",
      "colour": "#1c7ed6",
      "guest": false
    },
    "file": "k7h2m4n9p3q5r8s2",
    "caret": { "anchor": "AQID", "head": "AQIE" },
    "canvas": { "selection": ["api"], "pointer": { "x": 120, "y": 80, "diagram": "flow" } }
  }
}
```

El `user` es el de la sala y nunca el del cliente: el `sub`, el nombre y la imagen que el Worker dio
al socket cuando se abrió ([El socket](#el-socket)), diga lo que diga el mensaje, con como máximo
200 caracteres del `sub`, 100 del nombre y 500 de la dirección de la imagen. El `colour` sale del
`sub`: uno de doce, elegido con un hash FNV-1a de él (`presenceColour`, en
`@meltemi/diagrams-project`, que la página usa también), así que la sala y todas las páginas
coinciden y ningún cliente envía un color. `guest` es verdadero para una persona sin cuenta, por la
conexión y nunca por el mensaje, de modo que cada página marca a un invitado y nunca lo toma por
una cuenta. Como la clave es la del propio remitente, un cliente tampoco puede hablar por la
entrada de otro. La página toma la identidad de una persona solo de este
`user`.

**Al conectar.** Después de `hello` y de su vector de estado, la sala envía al recién llegado un
mensaje de tipo 2 con los estados de los demás clientes, con la misma forma: los de quienes han dado señales en los últimos treinta segundos, y ningún mensaje si
no hay ninguno. Los demás conocen al recién llegado por su primer estado, no al conectar. La
sala no guarda la selección del lienzo ni el puntero, así que el recién llegado los conoce por el
siguiente estado del remitente; una página envía su estado de nuevo cada quince segundos.

**Retirada.** `{ "<id>": null }`, de parte de la sala, dice que esa conexión ya no tiene estado.
La sala lo envía cuando un cliente envía `null` (si tenía un estado), cuando se cierra su socket
(si tenía uno) y cuando pasan treinta segundos sin un estado suyo. Los demás clientes reciben
la retirada; el socket que agotó ese plazo permanece abierto y puede volver a enviar un estado.
Una página envía un estado cuando cambia, como máximo cuatro veces por segundo, y otra vez cada
quince segundos como latido.

**Límites.**

- Un mensaje de presencia de más de 16 KiB, el byte de tipo incluido, cierra a su remitente con
  `message.too-large` (`4413`), y los demás dejan de ver su estado, como con cualquier socket que se
  cierra. Antes se aplica el tope propio de la sala, 512 KiB para cualquier mensaje.
- Hasta 20 mensajes de presencia en un segundo de un mismo cliente (una ventana deslizante) se
  retransmiten. El 21.º y los siguientes se descartan: no se retransmiten, no renuevan el estado y se
  cuentan en `awarenessDropped`. Un mensaje descartado sigue contando en la ventana, así que el 101.º
  dentro de un segundo cierra el socket con `awareness.rate` (`4429`). La ventana es por conexión:
  las dos pestañas de una persona cuentan por separado.
- Una página envía como máximo cuatro estados por segundo y recorta una selección del lienzo a 200
  ids y 12 000 bytes, así que solo un cliente que no sea la página llega a alguno de estos límites.
  Un puntero en movimiento, y los puntos de un trazo del Puntero, van en el mismo mensaje que el
  cursor y la selección: no añaden ningún mensaje propio (64 puntos en cuatro tandas por segundo son
  menos de 2 KiB por segundo, muy por debajo de los 16 KiB que admite un mensaje).
- La presencia es igual para todos los que pueden conectarse: un lector la envía y la recibe como un
  editor, y solo se rechazan las actualizaciones de un lector ([El socket](#el-socket)).

### Lecturas y pushes

El endpoint de archivos devuelve la revisión actual del proyecto. Los metadatos de las listas y
las miniaturas pueden ir por detrás; lee los archivos antes de un cambio condicionado a la revisión.

- `GET /api/projects/<id>/files` responde los archivos más recientes, con los ids traducidos a paths
  (el que pierde una colisión aparece como `<path>~<id>`):

  ```json
  {
    "revision": 41,
    "files": { "diagrams/flow.meltemi": "diagram flow …" },
    "binaries": {
      "assets/logo.png": "9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab"
    },
    "collisions": []
  }
  ```

  Necesita el rol `read`, que el enlace del proyecto puede dar a cualquiera, con sesión iniciada o
  sin ella: es la instantánea que lee quien mira de forma anónima
  ([Ver por enlace](#ver-por-enlace)).

- `PUT /api/projects/<id>/files` recibe un push (cada parte es opcional) y lo aplica como una
  transacción con origen `push`. Necesita el rol `write`: el propietario, un editor, o una persona
  con sesión iniciada en un proyecto cuyo enlace es `edit`:

  ```json
  {
    "files": { "diagrams/flow.meltemi": "diagram flow …", "old.meltemi": null },
    "binaries": { "assets/logo.png": null },
    "ifRevision": 41
  }
  ```

  Un path que existe conserva su id (un texto conserva su `Y.Text` y se edita con el cambio más
  pequeño, así que un cliente conectado ve una actualización pequeña y no un archivo nuevo), un
  path nuevo recibe un id nuevo, y `null` elimina el archivo de ese path. Responde `{ revision }`,
  la revisión de la sala después del push, que es la actual cuando el push no cambió nada.

- Con `ifRevision`, el push se aplica solo si la sala está exactamente en esa revisión; si no, es
  `409 revision.mismatch` con la `revision` actual, y no cambia nada.

Las comprobaciones se hacen por este orden, y un push que falla cualquiera de ellas no aplica nada:
la forma del cuerpo (`400 request.invalid`; un cuerpo de más de 17 MiB es `413 doc.too-large`),
cada path según la regla (`400 path.invalid`), un path que es a la vez texto y binario
(`400 doc.invalid`), `ifRevision` (`409`), cada hash contra `project_blobs` (`400 blob.unknown`), y
después los límites de cualquier transacción. Un cliente conectado recibe un push como cualquier
actualización, y su página muestra el texto enviado.

## La API de proyectos

Las rutas que listan, crean o cuentan los proyectos de una persona necesitan una persona, con la
cookie o con un token. Cada ruta sobre un proyecto concreto declara el rol que necesita, y el
propietario los tiene todos; lo que pueden hacer los demás, y las respuestas cuando no basta, están
en [Compartir y permisos](#compartir-y-permisos). Una persona a la que el proyecto no admite en
absoluto, un proyecto que no existe y un id que no puede serlo responden todos
`404 project.not-found`, para que nadie sepa qué proyectos existen; un cambio hecho con la cookie
también pasa por la regla de `Origin`. Un proyecto, tal como lo muestra cada respuesta:

```json
{
  "id": "k4c2w7x5q3y6m2n5r7d4",
  "name": "Purchase",
  "description": "",
  "updated_at": "2026-10-15T09:41:02.118Z",
  "thumbnail": "/api/projects/k4c2w7x5q3y6m2n5r7d4/thumbnail",
  "role": "owner"
}
```

`thumbnail` es `null` hasta que el proyecto tiene una, y `updated_at` sigue a la última
materialización, al último cambio de nombre o al último cambio de descripción. `role` es lo que
quien pregunta es para el proyecto: `owner`, `editor` o `viewer`, donde el rol de un miembro sube
por el enlace del proyecto cuando este da más. La página abre el proyecto en modo de solo lectura
cuando es `viewer`.

### Proyectos

- `GET /api/projects` responde `{ projects }`, del actualizado más recientemente al más antiguo: los
  proyectos propios de la persona y aquellos de los que es miembro, cada uno con su `role`.
- `POST /api/projects` recibe `{ name, description?, template? | files?, binaries? }` y responde
  `201` con el proyecto. El nombre tiene de 1 a 100 caracteres una vez recortado, sin caracteres de
  control; la descripción, como máximo 500. `template` es una de `flow`, `c4`, `sequence`, `roadmap`,
  `free` y `purchase`, y da los archivos de la propia compilación de la app con su `project.json`,
  leídos de su `templates.json`, así que la página y el servicio ofrecen los mismos bytes. `files`
  es `{ path: texto }` y `binaries` es `{ path: hash }` de imágenes y fuentes que los proyectos de la
  persona ya tienen (otro hash es `blob.unknown`: un hash no es una credencial). Una plantilla y
  archivos son excluyentes. Cada path y cada límite se comprueban antes de hacer nada, así que no se
  crea nada para una solicitud que se rechazaría. La fila del proyecto se inserta en una sentencia
  que comprueba la cuota, los archivos entran en la sala como un solo push y se ejecuta la primera
  materialización; un push que la sala rechaza (un documento de más de 16 MiB) retira el proyecto, y
  una primera materialización que falla no hace fallar la creación, porque la sala lo intenta de
  nuevo.
- `GET /api/projects/<id>` responde el proyecto, con el `role` de quien pregunta, a cualquiera a
  quien admita el enlace del proyecto, las personas anónimas incluidas.
- `PATCH /api/projects/<id>` recibe `{ name?, description? }` y responde el proyecto; un campo que
  se omite conserva su valor. Es del propietario: un editor cambia los archivos, no cómo se llama el
  proyecto.
- `DELETE /api/projects/<id>` destruye el almacenamiento de la sala (se avisa a sus clientes y se
  cierran con `4404`), elimina el objeto de la miniatura y las páginas que el proyecto publicó, y
  después quita las filas (el proyecto, sus archivos, `project_blobs`, sus versiones y sus archivos,
  sus miembros, invitaciones, publicaciones y solicitudes de publicación) en un solo paso atómico y
  actualiza el uso. Los blobs esperan a la recolección. Todos los pasos se pueden repetir sin
  riesgo, así que un fallo a medias es un error y la persona vuelve a eliminar. Una sala que se destruyó
  rechaza lo que llega después (un socket se cierra con `4404`, un push o una restauración es
  `404 project.not-found`) mientras viva el objeto, así que quien entró antes de que se fueran las
  filas, un script que reconecta o un token que era válido, no puede escribir el proyecto en el
  almacenamiento que acaba de vaciarse, donde nada lo nombraría. Es del propietario, y responde `204`.
- `POST /api/projects/<id>/duplicate` recibe `{ name? }` (por omisión `<name> (copy)`) y responde
  `201` con un proyecto nuevo que tiene los archivos más recientes de la sala, la descripción y una
  copia de las filas de `project_blobs`. Las versiones no se copian. Un archivo que la regla de los
  paths rechaza (el que pierde una colisión) no puede entrar en un documento y se deja fuera, y la
  respuesta lo lista como `skipped`. La copia se hace en la cuenta de quien pregunta y cuenta para su
  cuota, no para la del propietario: quien puede leer un proyecto puede quedarse una copia. Necesita
  una persona: una persona anónima en un proyecto que el enlace admite recibe `401 auth.required`.

### Imágenes y fuentes

`PUT /api/projects/<id>/binaries/<path>` recibe los bytes como cuerpo, diga lo que diga su
`Content-Type`, como máximo 10 MiB (`413 quota.binary`; el cuerpo no se lee más allá del tope), y
responde `{ "hash": "…" }`. El path sigue [la regla de los paths](#la-regla-de-los-paths), con cada
segmento codificado como URL. Necesita el rol `write`, y los bytes cuentan para el almacenamiento
del propietario del proyecto, los suba quien los suba.

El tipo se lee de los bytes y de nada más. Los bytes mágicos nombran PNG, JPEG, GIF, WebP (`RIFF` y
`WEBP`), woff2, ttf y otf. SVG no tiene, así que `image/svg+xml` solo se acepta cuando el cuerpo es
un documento XML bien formado con una raíz `svg`: UTF-8 sin caracteres de control prohibidos, una
sola raíz, etiquetas que se anidan y se cierran, atributos entrecomillados que no se repiten,
comentarios sin `--`, ninguna entidad salvo las cinco predefinidas y las referencias numéricas, y un
DOCTYPE sin subconjunto interno, porque esa es la única forma de declarar una entidad. Todo lo demás
es `400 binary.invalid`: un cuerpo `text/html` que dice ser `image/png` se rechaza. Un SVG con un
`<script>` es una subida válida; se hace inofensivo al salir, más abajo.

Después se calcula el hash de los bytes (SHA-256) y se comprueba el almacenamiento de la cuenta
(`413 quota.storage`; los bytes que la cuenta ya referencia no cuentan otra vez). R2 va primero,
después la fila de `blobs`, después la fila de `project_blobs`, y después la sala establece el path
y el hash del archivo (`paths` y `binaries` bajo un mismo id), y tiene la última palabra sobre el
documento (`quota.files`, `doc.too-large`). Cuando la sala rechaza el cambio, la fila de
`project_blobs` se queda solo si el proyecto ya tenía el hash antes. El almacenamiento se comprueba
una segunda vez cuando la fila ya está, y cuenta en el uso: las subidas que corren a la vez pasan
todas la primera comprobación, y la segunda es la que vale, así que la cuenta nunca termina por
encima de sus bytes (una subida que se pasa devuelve su fila y es `413 quota.storage`; de dos que
compiten, pueden rechazarse ambas). Una subida que sustituye al archivo de ese path suelta el hash
que sustituyó, salvo que otro archivo del proyecto lo nombre; una versión que guarda los bytes se
sirve desde sus propias filas.

`DELETE /api/projects/<id>/binaries/<path>` quita el archivo de la sala y el hash de
`project_blobs`, salvo que otro archivo del proyecto use los mismos bytes, y responde `204`; es
`404 not-found` cuando no hay ninguna imagen ni fuente en ese path. Los bytes se quedan en R2 y en
cualquier versión que los tenga hasta que la recolección encuentra que nada los referencia.

`GET /api/projects/<id>/blobs/<hash>` transmite los bytes y `HEAD` responde las cabeceras. Solo se
sirven cuando `project_blobs` o una versión de este proyecto tiene el hash, nunca el mapa vivo ni el
de otro proyecto: si no, `404 not-found`. Necesitan el rol `read`, así que un proyecto cuyo enlace es
`view` o `edit` sirve sus imágenes y fuentes también a personas anónimas, con las mismas cabeceras.
Cada respuesta lleva:

| Cabecera                                              | Por qué                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Content-Type`                                        | El tipo guardado del blob (`text/plain; charset=utf-8` para un texto); cualquier otro es `application/octet-stream` |
| `Cache-Control: private, max-age=31536000, immutable` | Un hash nombra sus bytes, así que nunca cambian; `private`, porque el acceso es el del proyecto                     |
| `Content-Security-Policy: sandbox`                    | El documento recibe un origen opaco y ningún script                                                                 |
| `X-Content-Type-Options: nosniff`                     | El navegador no toma los bytes por otro tipo                                                                        |
| `Content-Disposition: attachment; filename="<hash>"`  | Visitar la dirección descarga el archivo, no lo abre                                                                |

La razón es que el SVG de una persona puede llevar un script y los bytes salen del propio origen del
servicio, que tiene la cookie de sesión. Con la sandbox y el attachment, un SVG con un script abierto
en su dirección no ejecuta nada en el origen de la página, mientras que un `<img>` y el propio
`fetch` de la página siguen recibiendo los bytes (un SVG dentro de un `<img>` nunca ejecuta scripts
de todos modos). La dirección está acotada a un proyecto para que el acceso sea el del proyecto: los
mismos bytes en dos proyectos son dos direcciones, cada una con su propio acceso.

### Versiones

Una versión es una copia de las filas de `project_files` del proyecto en la última materialización,
así que una versión cuesta filas, no bytes (los blobs se comparten por contenido), y hacer una
materializa primero la sala. Una versión, tal como la muestra cada respuesta:

```json
{
  "number": 12,
  "label": "before review",
  "auto": false,
  "created_at": "2026-10-15T09:41:02.118Z",
  "created_by": "u_7d3f",
  "changed": ["diagrams/flow.meltemi", "project.json"]
}
```

`changed` lista los paths cuyo hash difiere del de la versión anterior que aún se conserva
(añadidos, cambiados o quitados, en orden binario); la primera versión lista todos sus paths.

- `POST /api/projects/<id>/versions` recibe `{ label? }` y responde `201` con la versión. Una
  etiqueta se recorta, tiene como máximo 80 caracteres y no lleva caracteres de control; ninguna, o
  una vacía, hace una versión sin etiqueta. Si falla la materialización, la respuesta es
  `500 internal` y no se registra nada. Necesita el rol `write`: un editor hace versiones como las
  hace el propietario.
- `GET /api/projects/<id>/versions` responde `{ versions }`, de la más nueva a la más antigua.
  Necesita `read`.
- `GET /api/projects/<id>/versions/<n>` responde la versión con `files` (path a texto, leído de R2)
  y `binaries` (path a hash); `404 version.not-found` para un número que el proyecto no tiene, y
  para cualquier cosa que no sea un entero positivo. Necesita `read`.
- `POST /api/projects/<id>/versions/<n>/restore` responde
  `200 { revision, restored, saved, skipped? }`: la revisión de la sala, el número restaurado, la
  versión automática que guarda el estado anterior (`saved`, con la forma de cualquier versión) y
  los paths que la regla de los paths dejó fuera. Necesita `write`, así que un editor restaura una
  versión como lo hace el propietario.

La política, que aplica el Worker en cada creación:

- Un proyecto tiene como máximo 200 versiones, contando las que tienen etiqueta. En el límite, la
  política depura primero; si el proyecto sigue lleno, una versión nueva o una restauración es
  `413 quota.versions` y no registra nada.
- De las versiones sin etiqueta (las diarias, las que se guardan antes de una restauración y las que
  una persona hizo sin nombre) se conservan como máximo 100: cuando se hace una nueva, se van primero
  las más antiguas.
- De las versiones sin etiqueta de más de treinta días, solo se queda la más nueva de cada semana
  ISO (UTC, con las semanas desde el lunes).
- Las versiones con etiqueta nunca se van.
- Una versión que se rechaza no elimina nada.
- Más de seis versiones hechas para un proyecto en un minuto son `429 versions.rate`, con
  `Retry-After: 60`. El recuento forma parte de la sentencia que inserta la versión, así que dos
  dispositivos no pueden pasar a la vez. Una restauración cuenta como una versión. La versión diaria
  no tiene límite de frecuencia.
- La versión diaria es la primera materialización de un día UTC que encuentra los archivos distintos
  de los de la última versión: una versión sin etiqueta con `auto` activado, hecha para el
  propietario. Se omite cuando ya existe una versión de hoy (de quien sea), cuando el proyecto no
  tiene archivos ni versiones, cuando los archivos son los de la última versión y cuando el proyecto
  está lleno de versiones que la política conserva. Un proyecto sin versiones recibe la primera un
  día posterior al día en que se creó: crearlo no es un cambio que merezca conservarse. Guarda el
  proyecto tal como lo escribió esa materialización, es decir, después de los primeros cambios del
  día, no el estado a medianoche.

Una restauración hace esto, por orden: lee los archivos de la versión (una versión que ya no existe,
o bytes que faltan, no cambian nada); la sala materializa; el estado anterior se registra como una
versión automática hecha por la persona (así que `413 quota.versions` y `429 versions.rate` se
aplican, y no cambian nada); un hash que la versión tiene y que las subidas del proyecto ya no, se
vuelve a añadir a `project_blobs`; y la sala coloca los archivos como una sola transacción con
origen `restore`, pero solo si sigue en la revisión que materializó: lo que se escribió desde
entonces está en la sala y no en la versión que se registró, y la restauración lo borraría. Si la
sala avanzó, el estado se vuelve a materializar y a registrar (hasta tres veces), y una sala que no
deja de moverse responde `409 revision.mismatch` con su revisión, para pedirlo otra vez. Cada archivo de la versión se establece (un path que existe conserva su id y su
`Y.Text`, editado con el cambio más pequeño) y todos los demás archivos se van. Los clientes
conectados la reciben como una actualización de fuera: la página la trata como un cambio remoto, que
no está en el deshacer de la persona, y olvida lo que la persona podía deshacer antes, así que la
vuelta atrás es restaurar la versión automática que guarda el estado anterior. Un path que la regla
de los paths rechaza (`<path>~<id>`) no puede entrar en un documento y se deja fuera como
`skipped`.

### Miniaturas

`PUT /api/projects/<id>/thumbnail` recibe un cuerpo `image/svg+xml` de 200 KiB como máximo y
responde `204`. Las comprobaciones se hacen por este orden: el tipo (`400 thumbnail.invalid`), la
frecuencia (`429 thumbnail.rate`: una miniatura cada 30 segundos por proyecto, con `Retry-After` que
da los segundos que faltan; la reserva es una sola sentencia, así que dos dispositivos no pueden
pasar a la vez), el tamaño (`413 thumbnail.too-large`) y que el cuerpo sea un SVG bien formado, según
la regla de arriba (`400 thumbnail.invalid`). Guarda `thumbs/<project id>.svg` y establece
`thumbnail_at`. Una miniatura rechazada deja la que hay, y una escritura que falla devuelve los 30
segundos.

`GET /api/projects/<id>/thumbnail` responde el SVG como `image/svg+xml` con
`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: attachment; filename="thumbnail.svg"` y `Cache-Control: private, max-age=60`,
para que volver a abrir el panel en menos de un minuto no cueste ninguna solicitud; es
`404 not-found` mientras el proyecto no tiene ninguna. La lista y el panel la muestran en un
`<img>`. El Worker nunca dibuja nada: la página dibuja su diagrama y envía la imagen. El `PUT`
necesita el rol `write` y el `GET` el rol `read`.

### Uso

`GET /api/account/usage` responde los proyectos y los bytes de la cuenta, y los límites, para que
una página pueda mostrar una cuota sin conocer los números:

```json
{
  "projects": 3,
  "storageBytes": 1048576,
  "limits": {
    "projects": 100,
    "storageBytes": 209715200,
    "files": 2000,
    "documentBytes": 16777216,
    "binaryBytes": 10485760,
    "versions": 200
  }
}
```

`storageBytes` es el de la última materialización, versión, subida o eliminación. La página muestra
los números en el menú de la cuenta.

### Claves de idempotencia

`POST /api/projects` y `PUT /api/projects/<id>/files` aceptan una cabecera `Idempotency-Key`: de 1 a
64 caracteres ASCII visibles, una por cambio lógico, que elige el cliente. La primera petición con una
clave se responde y su respuesta se guarda un día junto con el SHA-256 de su cuerpo; una repetición
con la misma clave y el mismo cuerpo recibe de nuevo esa primera respuesta con
`Idempotent-Replayed: true` y no cambia nada (un proyecto, un push). La misma clave con otro cuerpo,
o en otra ruta, es `409 idempotency.mismatch`; una repetición mientras la primera petición sigue en
curso es `409 idempotency.pending`. Las claves son de cada cuenta. Una respuesta se guarda cuando es
de la propia petición (un éxito o un `4xx`, entre ellos el `409 revision.mismatch` de un push
desfasado); un fallo del servicio (`5xx`) o un límite de ritmo (`429`) suelta la clave, para que un
reintento se ejecute otra vez. La clave se reserva antes del cambio y se responde después , y una reserva que nadie respondió en un minuto se retoma. La
migración 0008 las guarda (`idempotency`); la siguiente clave de la cuenta barre las suyas caducadas y
el cron programado las de todos. Las herramientas MCP `create_project` y `write_files` toman la misma
clave como `idempotencyKey`: la misma clave y el mismo cuerpo por cualquiera de las dos puertas son una
sola petición.

## Compartir y permisos

Un proyecto tiene un nivel de enlace y miembros además de su propietario. El nivel del enlace es
`private` (el valor por omisión: solo el propietario y los miembros abren el proyecto), `view`
(cualquiera con el enlace puede verlo) o `edit` (cualquiera con sesión iniciada y el enlace puede
editarlo, y los demás lo ven). Los miembros son personas a las que el propietario nombró por correo,
cada una con un rol, `viewer` o `editor`. El rol efectivo combina esa membresía con el acceso por
enlace, como muestra la tabla. Un proyecto nuevo es `private`, y solo su propietario cambia
quién puede abrirlo.

### Roles

Una persona es `owner`, `editor` o `viewer` de un proyecto, o nada en absoluto:

| El enlace del proyecto | Anónimo  | Con sesión, no miembro | Un miembro                             |
| ---------------------- | -------- | ---------------------- | -------------------------------------- |
| `private`              | nada     | nada                   | `viewer` o `editor`, según se dio      |
| `view`                 | `viewer` | `viewer`               | según se dio, nunca menos que `viewer` |
| `edit`                 | `viewer` | `editor`               | según se dio, nunca menos que `editor` |

El propietario es siempre `owner`. Editar necesita una cuenta, así que el enlace `edit` da `editor`
solo a quien ha iniciado sesión; una persona anónima nunca es más que `viewer`. Un enlace sube lo
que puede hacer un miembro y nunca lo baja, así que un miembro conserva su rol sea cual sea el
nivel. Para esto, la cookie y un token bearer son la misma persona. La función
`access(project, principal, member)` no lee nada: su respuesta depende solo de lo que recibe, así
que cada celda de la tabla es una prueba (`test/access.test.ts`).

### Qué necesita cada ruta

Una ruta declara el rol que necesita: `read` es un lector, `write` un editor y `manage` el
propietario.

| Necesita                                                                  | Rutas                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage` (el propietario)                                                 | `PATCH` y `DELETE /api/projects/<id>`; `PATCH …/sharing`; `POST …/members`; `PATCH` y `DELETE …/members/<sub>`; `GET` y `DELETE …/invitations`; `GET`, `PUT` y `DELETE …/publish`; `PUT`, `GET` y `DELETE …/live` |
| `write` (un editor)                                                       | `PUT …/files`; `PUT` y `DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/<n>/restore`                                                                                            |
| `read` (un lector; también personas anónimas cuando un enlace las admite) | `GET /api/projects/<id>`; `GET …/files`; `GET` y `HEAD …/blobs/<hash>`; `GET …/versions` y `…/versions/<n>`; `GET …/thumbnail`; `GET …/sharing`                                                                   |

Algunas rutas nombran otra cosa. `POST …/duplicate` necesita `read` y una persona, y hace la copia
en la cuenta de quien pregunta. `DELETE …/members/me` necesita una membresía.
`POST /api/invitations/<token>/accept` necesita una persona y el token, que es la prueba. El socket
necesita cualquier rol que el proyecto admita, o el token de una sesión en vivo
([El socket](#el-socket)). `GET /api/projects/<id>` y `GET` y `HEAD …/blobs/<hash>` también toman
`read` del token vigente de una sesión en vivo en `X-Meltemi-Live`; ninguna otra ruta lee esa
cabecera. `PATCH /api/account { handle }`
necesita una persona, con la cookie o un token, y las rutas de administración la cookie de un
propietario o de un administrador ([Administración](#administración)). Las rutas
sobre la propia cuenta de quien pregunta (`GET` y `POST /api/projects`, `GET /api/account/usage`)
necesitan una persona.

Cuando el rol no basta, la respuesta es, por este orden:

1. Ningún acceso en absoluto es `404 project.not-found`, para que un proyecto privado no revele que
   existe; un id que no puede ser el de un proyecto y un proyecto que no existe se ven igual.
2. Una persona anónima en una ruta que necesita más de lo que le da el enlace, cuando el enlace le
   daría suficiente a una persona con sesión iniciada (una ruta `write` con un enlace `edit`), es
   `401 auth.required`, para que la página pueda ofrecer iniciar sesión.
3. Cualquier otro rol insuficiente es `403 access.denied`: un lector que escribe, un editor que
   elimina, una persona anónima en una ruta `manage` (iniciar sesión no ayudaría) o en una ruta
   `write` de un enlace `view`.

Así, un editor que elimina el proyecto recibe `403`; un push anónimo a un proyecto `private` es
`404`, a uno `view` es `403` y a uno `edit` es `401`; y una persona con sesión iniciada que no es
miembro puede hacer push a un proyecto `edit`, como editor.

### El estado de lo compartido

`GET /api/projects/<id>/sharing` responde a cada persona solo lo que puede ver. El propietario lo
recibe todo, los miembros con el correo con el que iniciaron sesión y las invitaciones pendientes
con sus enlaces:

```json
{
  "linkAccess": "view",
  "role": "owner",
  "members": [
    {
      "sub": "u_91ac",
      "name": "Luis",
      "picture": "https://avatars.githubusercontent.com/u/2",
      "email": "luis@example.com",
      "role": "editor",
      "added_at": "2026-10-15T10:02:11.402Z"
    }
  ],
  "invitations": [
    {
      "id": "0f3a1c5e9b7d4a2c8e6f1b3d5a7c9e0f",
      "email": "ana@example.com",
      "role": "viewer",
      "created_at": "2026-10-15T10:05:40.118Z",
      "expires_at": "2026-11-14T10:05:40.118Z",
      "link": "https://diagrams.meltemi.dev/p/k4c2w7x5q3y6m2n5r7d4?invite=5b1e0d7c9a3f4e2b8c6d1a0f3e5b7c9d"
    }
  ]
}
```

Un miembro recibe el nivel del enlace, su rol (al que lo sube el enlace, si lo sube) y los
miembros con sus nombres e imágenes, nunca sus correos, y ninguna invitación:

```json
{
  "linkAccess": "view",
  "role": "editor",
  "members": [
    {
      "sub": "u_91ac",
      "name": "Luis",
      "picture": "https://avatars.githubusercontent.com/u/2",
      "role": "editor"
    }
  ]
}
```

Cualquier otra persona a la que admita el enlace, con sesión iniciada o sin ella, recibe
`{ "linkAccess": "view", "role": "viewer" }` y nada de las personas. Es a propósito: un enlace `view`
nunca debe dar una invitación a partir de la cual se pueda hacer un editor, ni los correos de
personas que no los compartieron.

`PATCH /api/projects/<id>/sharing` recibe `{ "linkAccess": "private" | "view" | "edit" }`, es del
propietario, y responde el estado completo como lo hace el `GET` para el propietario. Cambiar el
nivel no cambia el `updated_at` del proyecto: quién puede abrir un proyecto no es un cambio de su
contenido. Sí corta los sockets de todos menos el propietario, que se encuentran con el nuevo nivel
cuando sus páginas reconectan ([Cuando cambia el acceso](#cuando-cambia-el-acceso)).

### Miembros

Un miembro es una persona a la que el propietario dio un rol en el proyecto; el propietario no es
miembro. El proyecto aparece en el `GET /api/projects` del miembro con su rol. El propietario cambia
un rol con `PATCH /api/projects/<id>/members/<sub> { "role": "viewer" | "editor" }`, que responde el
miembro, y quita a un miembro con `DELETE …/members/<sub>` (`204`); ambas son `404 not-found` para
una persona que no es miembro. Un miembro sale con `DELETE …/members/me` (`204`). El propietario no
puede salir: eso es `403 access.denied`, y la salida es eliminar el proyecto. Una persona a la que
admite el enlace y que no es miembro no tiene de qué salir (`404 not-found`), y una persona anónima
recibe `401`. Quien sale o es quitado conserva lo que da el enlace, si da algo. Un rol cambiado, un
miembro quitado y un miembro que sale cortan los sockets de esa persona, para que el nuevo rol
cuente en cuanto su página reconecte ([Cuando cambia el acceso](#cuando-cambia-el-acceso)).

Un proyecto tiene como máximo 50 miembros e invitaciones pendientes en conjunto, y la invitación
51.ª es `413 quota.members`; el propietario no cuenta, ni tampoco una invitación que ha caducado.

### Invitaciones

El propietario invita por correo con `POST /api/projects/<id>/members { "email", "role" }`. El
correo se recorta y se pasa a minúsculas, tiene como máximo 254 caracteres y un dominio con punto, y
no es el del propio propietario; el rol es `viewer` o `editor`. Una invitación registra ese correo,
ese rol y un token aleatorio de 128 bits (32 caracteres hexadecimales en minúscula), y la respuesta
es la invitación tal como la ve el propietario en la lista de arriba, con su enlace,
`<origin>/p/<id>?invite=<token>`, con `201`. **No se envía ningún correo**: el propietario pasa el
enlace, o la persona simplemente inicia sesión con ese correo. Invitar un correo que ya tiene una
invitación pendiente vuelve a fijar su rol y responde la misma invitación con `200`; invitar a un
miembro es una invitación como cualquier otra. El token se guarda en claro a propósito, para que el
propietario pueda volver a copiar el enlace desde la lista, y
solo se devuelve al propietario (`POST …/members`, `GET …/invitations`, `GET …/sharing`).

Una invitación pendiente se convierte en una membresía, con su rol, de una de dos maneras:

- **Por correo.** `GET /api/session` con una cookie cuyo correo verificó el servicio de identidad
  convierte cada invitación pendiente para ese correo en una membresía antes de responder, en un
  solo paso atómico. El correo es la propia afirmación del token de sesión, comparada en minúscula.
  Un correo que no está verificado no resuelve nada: cualquiera puede decir que una dirección es
  suya.
- **Por enlace.** `POST /api/invitations/<token>/accept`, por cualquier persona con sesión iniciada,
  sea cual sea su correo: el enlace es la prueba. Responde el proyecto como lo hace
  `GET /api/projects/<id>`, con el rol que la persona tiene ahora. El propietario que abre su propio
  enlace recibe su proyecto y deja la invitación pendiente.

Una invitación funciona una vez: quien la acepta es el miembro, y el enlace pasa a ser
`404 invite.invalid` para cualquier otra persona. También deja de funcionar treinta días después de
hacerse (`expires_at`). Caducar es un filtro, no un barrido: una invitación caducada no se lista, no
cuenta para las 50, no se acepta, y se va con su proyecto. Quien ya es miembro conserva el mayor de
los dos roles: una invitación sube un rol y nunca lo baja, y el propietario lo baja con
`PATCH …/members/<sub>`. Un token desconocido, usado, caducado o de otra forma es
`404 invite.invalid`, sea cual sea el motivo.

`GET /api/projects/<id>/invitations` responde `{ "invitations": […] }` con las pendientes, de la más
antigua a la más reciente, cada una como en la lista de arriba; cualquiera que no sea el propietario
recibe `403 access.denied`. `DELETE …/invitations/<id>` revoca una, por el `id` propio de la
invitación y no por su token (`204`; `404 not-found` cuando no hay ninguna).

### Ver por enlace

Un proyecto cuyo enlace es `view` o `edit` sirve sus rutas `read` a cualquiera: los metadatos, con
el `role` de quien pregunta, los archivos como instantánea, los blobs, las versiones y la miniatura.
Un lector, con sesión o sin ella, se conecta a la sala como tal, recibe cada cambio y no puede
escribir ([El socket](#el-socket)); uno anónimo se conecta con una identidad de invitado, está en la
presencia como cualquiera, y lee la instantánea (`GET …/files`) solo cuando la sala no responde. Un
proyecto que el enlace no admite es `404 project.not-found` para las personas anónimas como para
cualquier otra, lo que la página dice como "no se encontró" y nada más. Cómo usa la página todo esto está en
[la app web](web-app.md#ver-un-proyecto-compartido).

### Cuando cambia el acceso

El acceso se determina en cada solicitud, así que un cambio cuenta desde la siguiente. Un socket es
distinto: la sala determina lo que puede hacer una conexión una sola vez, cuando se abre, y lo
conserva. Por eso las rutas que cambian el acceso cortan los sockets que ese cambio pueda haber
dejado obsoletos, una vez hecho el cambio: `PATCH …/sharing`, cuando el nivel realmente cambia, corta
todos los sockets del proyecto salvo los del propietario; `PATCH` y `DELETE …/members/<sub>` y
`DELETE …/members/me` cortan los sockets de esa persona. Aceptar una invitación no corta nada,
porque solo sube un rol.

El código de cierre es `4000`, el del corte de desarrollo, que no es un rechazo: la página reconecta
al cabo de un segundo y el Worker determina el rol de nuevo. Una persona ascendida se conecta como
editora y una degradada como lectora, y el `hello` de la sala nombra el rol, con lo que la página
vuelve a abrir el proyecto en el modo que da; hace lo mismo cuando la sala rechaza un cambio con
`access.denied`. A una persona quitada a la que el enlace no admite se le rechaza el upgrade
(`404 project.not-found`), y la página, que pregunta al servicio si el proyecto sigue ahí tras su
segunda reconexión fallida, dice que el proyecto ya no está disponible para esa persona. Si no se
puede contactar con la sala cuando se
hace el cambio, el corte se intenta tres veces; si aun así no se puede, el cambio se mantiene, la
respuesta no es un error, y los sockets de esa persona siguen hasta que su conexión termine (el
siguiente cambio de acceso los corta de nuevo). También se cubre un upgrade que estaba en curso
cuando se hizo el cambio: cuando la sala ha aceptado un socket, el Worker resuelve el rol otra vez
y corta los sockets de la persona si es distinto; si ese corte falla, el upgrade es
`500 internal`, no un socket con el rol antiguo. Eliminar una cuenta corta de la misma manera los
sockets de la persona en los proyectos de otras, antes y después de aplicar el evento.

### Sesiones en vivo

Una sesión en vivo deja entrar en un proyecto durante un tiempo a cualquiera con su enlace, con
cuenta o sin ella. Hay una como máximo por
proyecto, y vive en la sala del proyecto, en el almacenamiento propio de la sala, como
`{ id, token, guestsEdit, startedAt, until }`: se va
con la sala cuando se elimina el proyecto. El token son 128 bits aleatorios en hexadecimal en
minúscula, guardados en claro para que el propietario pueda copiar el enlace de nuevo; se responde
solo al propietario y nunca se registra.

- `PUT /api/projects/<id>/live { guestsEdit? }` (del propietario) inicia la sesión, con invitados
  que pueden editar salvo que `guestsEdit` sea `false`, durante veinticuatro horas; con una sesión
  activa responde esa, aplicando `guestsEdit` cuando se da. Un cambio de `guestsEdit` corta las
  conexiones que admitió la sesión con `4000`, como lo hace un cambio de acceso, y estas reconectan
  con el rol que da ahora. La respuesta:

  ```json
  {
    "id": "8c1f02b9e45a7d36",
    "link": "https://diagrams.meltemi.dev/p/k7h2m4n9p3q5r8s2t6v1?live=0f4b…",
    "guestsEdit": true,
    "startedAt": "2026-10-21T18:02:11.000Z",
    "until": "2026-10-22T18:02:11.000Z",
    "guests": 2
  }
  ```

  `guests` cuenta las conexiones que admitió la sesión y que están abiertas ahora.

- `GET …/live` (del propietario) responde lo mismo, o `null`.
- `DELETE …/live` (del propietario) termina la sesión, y responde `204` haya o no una activa.

Una sesión también termina sola en `until` y tras una hora sin ningún cliente en la sala. La única
alarma de la sala se ocupa de ambas cosas, también tras una hibernación. Termine como termine, el
registro se va y a cada conexión que admitió la sesión se le dice `session.ended` y se cierra con
`4410`; una conexión que llegó sin el token se queda. Una página cerrada con `4410` deja de
reconectar con el token.

**Unirse.** Un socket con `?live=<token>` llega a la sala con el token en `X-Meltemi-Live`
([El socket](#el-socket)). La sala lo compara con su registro: un token distinto, o una sesión ya
terminada, es `404 project.not-found` en el upgrade, sin revelar nada. Uno vigente admite la
conexión con el mayor entre el rol propio de la persona y el de la sesión (`editor` cuando
`guestsEdit`, si no `viewer`), así que un miembro con sesión iniciada conserva más cuando lo tiene,
y el propietario es el propietario. `hello` nombra entonces la sesión (`live: { until, guestsEdit }`).

**Invitados y sitios.** Un invitado, y quien visita de forma anónima, ocupan uno de los veinte
sitios de la sala y lo ceden como lo hace un lector ([El protocolo de la sala](#el-protocolo-de-la-sala)).
Entre las conexiones sin cuenta la sala admite como máximo diez abiertas por dirección de cliente y
rechaza la undécima con `connections.limit` (`4428`), para que una red no pueda llenar una sala
mientras un aula o una oficina detrás de una dirección siguen cabiendo; las conexiones con cuenta no
se cuentan por dirección. La actualización de un invitado cuenta frente a los límites del proyecto
como la de un editor.

**A qué llega un token.** A la sala, y a dos lecturas: `GET /api/projects/<id>` (con
`live: { until, guestsEdit }`, o `null` cuando el token no está vigente, para que una página con un
enlace viejo lo descarte) y `GET` y `HEAD …/blobs/<hash>` (las imágenes y fuentes que usan los
diagramas), que toman el token en `X-Meltemi-Live` cuando el acceso propio de quien pregunta no
basta y preguntan a la sala si está vigente. Todas las demás rutas ignoran la cabecera: un invitado
no puede subir, crear versiones, publicar, cambiar la miniatura ni leer lo compartido; eso requiere
una cuenta.

## Publicación

Un proyecto se publica como una página web: el catálogo HTML de sus diagramas e historias, que
construye la página (la misma compilación que la descarga del catálogo y que
`meltemi-diagrams build catalog`, [catálogo](catalog.md)) y envía al servicio. El servicio la guarda
y un segundo Worker la sirve en `https://<PUBLISH_HOST>/<handle>/<slug>/`, en un dominio propio. El
servicio nunca dibuja nada, y las páginas que sirve no pueden alcanzar la cookie de sesión, porque
el host no está bajo `meltemi.dev`.
En producción `PUBLISH_HOST` es `meltemi.page`; en desarrollo las publicaciones se sirven desde
`/_published/` en el propio origen del Worker.

### Alias

Una persona elige un alias (`handle`) antes de su primera publicación:
`PATCH /api/account { "handle": "ana" }`. Es el primer segmento de cada dirección pública que
publica, así que es público por diseño. Es exactamente `[a-z0-9-]{3,30}` (a la persona no se le
recorta ni se le pasa a minúsculas nada) y único entre las cuentas. Puede elegirlo una persona con
sesión iniciada en la página y también su token de API, porque la línea de comandos publica con un
token y una primera publicación necesita un alias (es lo único que un token puede fijar de la
cuenta); la regla de `Origin` se aplica a la cookie.

- `200 { "handle" }` cuando ya es suyo; elegir otra vez el mismo alias siempre es válido.
- `400 handle.invalid` para otra forma, `409 handle.taken` mientras otra cuenta lo tiene, y
  `409 handle.locked` mientras una publicación suya tiene por dirección el alias que tiene, porque
  la dirección se movería de debajo de ella: antes hay que despublicar.
- Quien publica sin alias recibe `409 handle.required`, respondido antes de leer el cuerpo.
  El alias se lee otra vez después del cuerpo, y es bajo el que va la página; y si cambió en el
  último momento, entre esa lectura y la fila, la respuesta también es `409 handle.required` y no
  queda nada bajo la dirección antigua.

`GET /api/session` devuelve el alias (o `null`) en `user.handle`.

### Publicar y despublicar

Las tres rutas son del propietario (`manage`), con la cookie o con un token de API, así que la línea
de comandos también puede publicar. Un proyecto puede publicar varias páginas, una por cada slug, y
un mismo slug no puede estar dos veces bajo un mismo alias.

- `GET /api/projects/<id>/publish` responde lo que necesita el propietario para dibujar el diálogo
  de publicar:

  ```json
  {
    "handle": "ana",
    "publications": [
      {
        "slug": "purchase",
        "url": "https://meltemi.page/ana/purchase/",
        "published_at": "2026-10-15T09:41:02.118Z",
        "bytes": 482113
      }
    ],
    "takedowns": [
      { "slug": "old-draft", "at": "2026-10-14T16:20:00.000Z", "reason": "Abuse report" }
    ]
  }
  ```

  `handle` es `null` hasta que la persona elige uno. `publications` son las de este proyecto, de la
  más antigua a la más reciente, cada una con la dirección en la que se sirve. `takedowns` son las
  que el servicio hizo de las páginas de este proyecto, bajo el alias del propietario (una página
  que otra persona publicó antes bajo el mismo alias no es suya, se creara cuando se creara la
  cuenta), de la más reciente a la más antigua; una que el propietario ha vuelto a publicar desde
  entonces no aparece. `meltemi.page` representa
  el dominio de `PUBLISH_HOST`.

- `PUT /api/projects/<id>/publish { "slug", "html" }` guarda la página y responde
  `200 { "url", "handle", "slug", "bytes", "published_at" }`. El slug es `[a-z0-9-]{1,60}` y el
  HTML es texto, de 16 MiB como máximo en UTF-8. Publicar un slug que el proyecto ya publica
  reemplaza esa página. Las comprobaciones se hacen por este orden, y una solicitud que falla alguna
  no escribe nada: `handle.required` (`409`), un cuerpo de más de 24 MiB (`413 publish.too-large`),
  un cuerpo que no es un objeto JSON (`400 request.invalid`), un slug o un `html` que no se pueden
  usar (`400 publish.invalid`), un HTML de más de 16 MiB (`413 publish.too-large`), un slug que
  publica otro proyecto de la misma persona (`409 publish.taken`) y la frecuencia
  (`429 publish.rate` con `Retry-After`). La frecuencia es de diez solicitudes de publicación para
  un proyecto en una hora. Cuenta solicitudes, en `publish_log`, porque publicar un slug de nuevo
  cambia la hora de su fila y contar filas no vería las repeticiones, así que una solicitud
  rechazada por una comprobación anterior no cuenta, y el barrido elimina las filas del registro de
  una hora de antigüedad. Donde no hay un host de publicación utilizable, la solicitud es
  `500 internal` y el registro nombra la variable (nunca su valor), antes de escribir nada.
- `DELETE /api/projects/<id>/publish/<slug>` elimina la página y después la fila, y responde `204`;
  es `404 not-found` cuando el proyecto no publica nada bajo ese slug. El objeto se va primero, para
  que un fallo del bucket deje la publicación como estaba y el propietario lo intente de nuevo.

Una dirección nueva se reclama primero con su fila y después se rellena, y un fallo del bucket
devuelve la fila: de dos proyectos que compiten por una dirección, el que no consigue la fila nunca
escribe la página, así que la página de nadie se sobrescribe. Un reemplazo escribe primero la página
y después renueva la fila, porque la dirección ya es del proyecto. El host de publicación sirve una
página solo mientras existe su fila, contenga lo que contenga el bucket.

La dirección es `https://<PUBLISH_HOST>/<handle>/<slug>/` y, en desarrollo,
`<origin>/_published/<handle>/<slug>/`. Las páginas son objetos del bucket, bajo
`published/<handle>/<slug>/index.html`, que la recolección de blobs nunca toca. No cuentan en el uso
de almacenamiento de la cuenta: los límites que las acotan son el tamaño de una página y la
frecuencia de publicar.

### El host de publicación

Los catálogos publicados se sirven desde `meltemi.page`, un dominio separado que no recibe la
cookie de sesión de Meltemi ni expone la API de proyectos. La dirección publicada es
`https://meltemi.page/<handle>/<slug>/`.

Sirve `GET` y `HEAD` de `/<handle>/<slug>/` y `/<handle>/<slug>/index.html` cuando existe una
publicación. Otros paths o métodos, una página despublicada y una dirección sin la barra final
responden `404`; la dirección tiene una sola escritura, sin decodificar escapes porcentuales.

| Cabecera                                 | Significado                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Content-Type: text/html; charset=utf-8` | Una página HTML publicada                                                                           |
| `Cache-Control: public, max-age=300`     | Una actualización o despublicación puede tardar hasta cinco minutos en llegar a una caché existente |
| `X-Content-Type-Options: nosniff`        | El contenido no se interpreta como otro tipo                                                        |
| `Referrer-Policy: no-referrer`           | Seguir un enlace no revela la página publicada como referencia                                      |

La página usa la [política sin conexión del catálogo](catalog.md#sin-conexión-por-diseño).
Un `404` lleva el cuerpo de texto `Not found` y `Cache-Control: no-store`; un fallo del
almacenamiento del servicio es `500` con `Something went wrong`. El host publicado no establece
cookies ni sirve rutas de la API.

### Retirada

Un propietario o un administrador del servicio ([Administración](#administración)) retira
cualquier publicación, desde la consola central de administración o con
`DELETE /api/admin/publications/<handle>/<slug>`, con un `{ "reason" }` opcional (de 500
caracteres como máximo, con saltos de línea y tabuladores permitidos y ningún otro carácter de
control). Quien llama debe ser uno de ellos con la cookie, así que se aplica la regla de `Origin`:
no se acepta un token de API ni siquiera de un propietario, porque un token es para programas y se
roba con más facilidad. Todos los demás, con sesión iniciada o sin ella, reciben `404 not-found`, la
respuesta de una ruta que no existe, y no `403`, que le diría a un desconocido que la ruta está ahí.
La sección pide la dirección de la publicación y un motivo, y confirma; la misma llamada desde la
consola del navegador en la página, con la sesión iniciada, envía la cookie y el `Origin`:

```js
await fetch("/api/admin/publications/ana/purchase", {
  method: "DELETE",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason: "Not what this site is for" }),
});
```

La página se elimina primero y la retirada se escribe después, en un solo paso con la eliminación de
la fila: `takedowns (handle, slug, by_sub, reason, at, project_id)`, siendo el proyecto aquel desde el
que se publicó la página, y la entrada `takedown` del registro de administración con
`<handle>/<slug>` y el motivo ([El registro de administración](#el-registro-de-administración)). Un
fallo del bucket deja todo como estaba y
el administrador lo intenta de nuevo; un fallo posterior deja una fila sin página, que el host de
publicación no sirve y un segundo intento completa. La dirección responde entonces `404`, y el
propietario del proyecto ve la página, en `GET …/publish`, como retirada por el servicio. Las
retiradas son el registro del servicio y se quedan cuando se elimina una cuenta.

### Publicaciones y eliminación

Eliminar un proyecto elimina sus páginas (primero los objetos, después las filas junto con el
proyecto); eliminar la cuenta lo hace con cada proyecto de la persona
([Eventos de eliminación](#eventos-de-eliminación)). Despublicar y eliminar son del propietario: un
editor no puede publicar, ni tampoco un lector.

## Administración

Un propietario o administrador abre la consola central desde **Administración** en el menú de la
cuenta. Contiene acceso e invitaciones, permisos, patrocinios, publicaciones y actividad reciente.
Una persona invitada usa **Invitación a administrar** para aceptar o rechazar allí. El panel de
ajustes del producto no tiene pestaña Administración.

Los propietarios y administradores tienen las facultades distintas de la tabla. El operador del
servicio configura la propiedad; un propietario invita a cada administrador y este debe aceptar.
Los contratos HTTP siguientes describen clientes autenticados en el origen de Diagrams; la consola
central conserva su navegación propia y usa las mismas comprobaciones de rol.

| Acto                                                | Propietario | Administrador |
| --------------------------------------------------- | ----------- | ------------- |
| Leer la sección, sus listas y el registro           | sí          | sí            |
| Conceder y revocar un permiso                       | sí          | sí            |
| Retirar una publicación                             | sí          | sí            |
| Invitar un correo, revocar una invitación pendiente | sí          | no            |
| Quitar a un administrador                           | sí          | no            |
| Irse (quitar su propia fila)                        | no          | sí            |

Cada ruta de administración toma la cookie de sesión en el propio origen de la página, así que la
regla de `Origin` se aplica antes de que corra. Quien llama sin sesión, cualquier otra persona y
cualquier token de API, incluido el de un propietario, reciben `404 not-found`, la respuesta de una
ruta que no existe, y no `403`, que le diría a un desconocido que las rutas están ahí; un acto que es
de los propietarios le responde lo mismo a un administrador. El rol se lee en cada solicitud, así
que la siguiente solicitud de un administrador al que quitaron recibe `404`.

### Invitaciones a administrar

Un propietario invita un correo con `POST /api/admin/invitations { "email" }`. El correo se recorta
y se pasa a minúscula, tiene 254 caracteres como máximo y un dominio con punto, como el de una
invitación a un proyecto ([Invitaciones](#invitaciones)), y si no es `400 request.invalid`. El
correo de un propietario o de un administrador (el del propio propietario, o el correo verificado de
su fila) es `409 admin.already`; un correo que ya tiene una invitación pendiente responde esa con
`200`; con diez invitaciones pendientes, la undécima es `409 admin.limit`. Si no, la invitación se
registra, con quién invitó y cuándo, y se responde con `201`:

```json
{
  "id": "3f9a0c1d2e4b5a6978c0d1e2f3a4b5c6",
  "email": "beto@example.com",
  "invitedBy": { "sub": "u_owner", "name": "Olga" },
  "createdAt": "2026-10-29T12:00:00.000Z",
  "expiresAt": "2026-11-05T12:00:00.000Z"
}
```

**No se envía ningún correo**, y no hay enlace ni token: el invitado es quien inicia sesión con ese
correo verificado, e iniciar sesión, por sí solo, no hace administrador a nadie. La respuesta de la
sesión le da al invitado la invitación como `user.administrationInvitation`
([La respuesta de sesión](#la-respuesta-de-sesión)), y elige en el panel de la cuenta:
`POST /api/admin/invitations/<id>/accept` lo hace administrador, salvo que el servicio ya tenga
veinte (`409 admin.limit`), y `POST /api/admin/invitations/<id>/decline` la rechaza; ambas responden
`204`. Cualquiera de las dos actúa solo sobre una invitación pendiente, hecha hace menos de siete
días, dirigida al correo del propio token de la sesión cuando el servicio de identidad lo verificó;
cualquier otra cosa (otro correo, un correo sin verificar, una invitación aceptada, rechazada,
revocada o de siete días, un token de API) es `404 not-found`, así que una invitación no se le
confirma a nadie más que a su destinatario. Una invitación funciona una vez. Un propietario revoca
una pendiente con `DELETE /api/admin/invitations/<id>`: `204`, o `404 not-found` cuando no está
pendiente.

### Quitar e irse

`DELETE /api/admin/administrators/<sub>` quita la fila de un administrador y responde `204`: un
propietario quita a cualquier administrador, y un administrador solo su propia fila, que es irse. El
`sub` de un propietario, un `sub` sin fila y el `sub` de otro administrador pedido por un
administrador son `404 not-found`, y no se quita nada. Un propietario deja de serlo solo con un
cambio de `ADMIN_SUBS`.

### Una cuenta, sin una lista de usuarios

Ninguna ruta lista, busca ni cuenta las cuentas del servicio: la sección lista solo los
propietarios, los administradores, las invitaciones pendientes y quienes tienen cada permiso. Donde
una ruta de administración nombra una cuenta (`<account>`) es una de tres: un identificador de
cuenta (de uno a doscientos caracteres, sin caracteres de control), que cada persona lee en el
Perfil del panel de la cuenta; `@` y un alias, para la persona que lo tiene; o un correo, que se
reconoce por una `@` después de su primer carácter, para la única cuenta cuya fila lo tiene
verificado, comparado en minúscula. Ninguna cuenta es `404 not-found`; un correo con el que
iniciaron sesión, verificado, dos o más cuentas es `409 account.ambiguous`, y el identificador de la
cuenta nombra una de ellas. Una consulta no crea nada. Le dice a un propietario o a un administrador
si un correo tiene cuenta, y a nadie más.

### Habilitaciones

El permiso `unbranded-exports` permite exportar sin la marca de Meltemi. El diálogo ofrece
**Exportar sin la marca de Meltemi** ([app web](web-app.md#exportaciones-en-el-navegador)). Los propietarios y los
administradores tienen todos los permisos sin que nadie se los conceda, como dice la respuesta de la
sesión; su propia fila dice solo lo que se fijó en ella. Tres rutas, para un propietario o un
administrador por igual: `GET /api/admin/permissions/<id>` lista las cuentas cuya fila tiene el
permiso, primero la que lo recibió antes, como `{ "id", "holders": [...] }`, cada una con `sub`,
`handle`, `name`, `email`, quién lo concedió (`by`, como `{ "sub", "name" }`) y cuándo (`at`);
`GET /api/admin/accounts/<account>/permissions/<id>` lee el de una cuenta, y `PUT` en la misma ruta
con `{ "granted": true }` o `{ "granted": false }` lo fija, registrando quién (`by`) y cuándo (`at`),
en un solo paso con su entrada en el registro
([El registro de administración](#el-registro-de-administración)). La reclamación de una donación
fija las mismas columnas con quien concede `github-sponsors` ([Patrocinios](#patrocinios)), y la
lista de quienes lo tienen lo muestra como `"by": { "sub": "github-sponsors", "name": "GitHub
Sponsors" }`; un administrador la revoca como cualquier otra concesión. Ambas responden la cuenta:

```json
{
  "sub": "u_7d3f",
  "handle": "ana",
  "name": "Ana",
  "email": "ana@example.com",
  "permission": {
    "id": "unbranded-exports",
    "granted": true,
    "by": "u_admin",
    "at": "2026-10-28T12:00:00.000Z"
  }
}
```

`<account>` es un identificador de cuenta, `@<handle>` o un correo
([Una cuenta, sin una lista de usuarios](#una-cuenta-sin-una-lista-de-usuarios)); un permiso
desconocido es `404 not-found`, y otro cuerpo `400 request.invalid`. La persona ve una concesión o
una revocación en la siguiente carga de la página, que lee la sesión una vez, y una cuenta eliminada
se lleva sus permisos. **Permisos**, en la sección, concede y revoca; las mismas llamadas desde la
consola del navegador en la página, con la sesión iniciada, son quienes tienen el permiso, una
concesión por correo y una revocación por alias:

```js
await fetch("/api/admin/permissions/unbranded-exports", { credentials: "same-origin" }).then((r) =>
  r.json(),
);
```

```js
await fetch("/api/admin/accounts/ana%40example.com/permissions/unbranded-exports", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ granted: true }),
}).then((r) => r.json());
```

```js
await fetch("/api/admin/accounts/@ana/permissions/unbranded-exports", {
  method: "PUT",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ granted: false }),
}).then((r) => r.json());
```

### El registro de administración

Cada invitación, invitación revocada, aceptación, rechazo, retiro de un administrador, salida,
concesión, permiso revocado y retirada añade una fila a `admin_log`, en el mismo paso atómico que el
acto y solo cuando el acto ocurrió: una solicitud rechazada no añade nada. Una fila guarda quién
(`by_sub`), cuándo (`at`), qué (`invite`, `revoke-invitation`, `accept`, `decline`, `remove`,
`leave`, `grant`, `revoke` o `takedown`), a quién (`target_sub`, o el `target_email` invitado) y un
`detail`: el id del permiso, o el `<handle>/<slug>` de la publicación y el motivo; la reclamación de
una donación es un `grant` cuyo `by_sub` es `github-sponsors` y cuyo detalle añade el usuario de quien
patrocina, `unbranded-exports (ana)`. Las filas nunca
cambian, se quedan cuando se eliminan las personas que nombran y se barren 365 días después de
escribirse.

### La respuesta de administración

`GET /api/admin` responde a un propietario o a un administrador, con `Cache-Control: no-store`, todo
lo que muestra la consola central de administración:

```json
{
  "role": "owner",
  "owners": [{ "sub": "u_owner", "name": "Olga", "handle": null, "email": "olga@example.com" }],
  "administrators": [
    {
      "sub": "u_9a1c",
      "name": "Beto",
      "handle": "beto",
      "email": "beto@example.com",
      "invitedBy": { "sub": "u_owner", "name": "Olga" },
      "since": "2026-10-29T12:30:00.000Z"
    }
  ],
  "invitations": [],
  "permissions": [{ "id": "unbranded-exports", "holders": [] }],
  "log": [
    {
      "at": "2026-10-29T12:30:00.000Z",
      "by": { "sub": "u_9a1c", "name": "Beto" },
      "action": "accept",
      "target": { "sub": "u_9a1c", "name": "Beto" },
      "detail": ""
    }
  ],
  "publishHost": "meltemi.page",
  "sponsorships": [
    {
      "login": "ana",
      "type": "User",
      "oneTime": false,
      "amountCents": 1000,
      "status": "active",
      "createdAt": "2026-11-04T09:30:00.000Z",
      "privacy": "public",
      "claimedBy": { "sub": "u_7d3f", "name": "Ana", "handle": "ana", "email": "ana@example.com" }
    }
  ]
}
```

`owners` y `administrators` son personas, con su `sub`, `name`, `handle` y `email` (un propietario
que nunca hizo una solicitud tiene cadenas vacías), los administradores con quién los invitó y desde
cuándo; `invitations` son las pendientes, primero la más antigua, como las responde
`POST /api/admin/invitations`, para un propietario, y `[]` para un administrador; `permissions` son
los del catálogo, cada uno con quienes lo tienen; `log` son las últimas cincuenta entradas, primero
la más reciente, con `by` y `target` como `{ "sub", "name" }`, una cuenta eliminada después como
`{ "sub", "name": "", "deleted": true }`, un correo invitado como `{ "email" }` y `github-sponsors`
como `{ "sub": "github-sponsors", "name": "GitHub Sponsors" }`; `publishHost` es `PUBLISH_HOST`, o
`null` cuando no está definida, contra el que el formulario de retirada de la sección comprueba la
dirección de una publicación; y `sponsorships` son los últimos cincuenta patrocinios, primero el más
reciente, cada uno con `login`, `type`, `oneTime`, `amountCents`, `status`, `createdAt`, `privacy` y
`claimedBy` (una persona, o `null`), y `[]` sin una cuenta patrocinada. El usuario de quien patrocina
y un patrocinio privado se muestran a las personas que administran el servicio y a nadie más.

### Patrocinios

Cuando el servicio ofrece **Apoya a Meltemi Diagrams**, enlaza a GitHub Sponsors. Usa la cuenta
GitHub vinculada a tu cuenta Meltemi para que el servicio reconozca el beneficio. Abre
**Ajustes de Diagrams → Perfil** después de donar; cuando reconoce la reclamación, indica que tu
cuenta puede exportar sin la marca de Meltemi. Vincula primero un inicio de sesión GitHub si falta.

Los propietarios y administradores revisan los patrocinios y sus reclamaciones en
**Administración → Patrocinios**. El permiso resultante es la habilitación `unbranded-exports`
documentada arriba; se concede o revoca desde **Permisos**. GitHub gestiona el pago y sus recibos.

## El endpoint MCP

`POST /mcp` ofrece Streamable HTTP sin estado para que un agente trabaje en proyectos de una
cuenta. Las revisiones 2025 usan un flujo de eventos con una respuesta; la revisión 2026-07-28 usa
JSON. No se emite id de sesión y `GET`/`DELETE` responden `405`.

Un `Origin` distinto es `403 request.forbidden`; una versión `MCP-Protocol-Version` no admitida es
`400`. Una petición sin token bearer OAuth o de API válido es `401` con
`WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<origin>/.well-known/oauth-protected-resource"`.
La cookie de sesión no autentica MCP. Un cuerpo de más de 24 MiB es `413`.
Consulta [Autorización](#autorización) para el inicio de sesión y los scopes.

Un token de acceso OAuth abre el endpoint como la cuenta que lo aprobó, con los alcances que se le
concedieron; un token de API `mdg_`, como su cuenta, con todos los alcances (`projects:read`,
`projects:write`, `sharing`, `live`, `publish`). Cada herramienta comprueba su alcance
(`scope.insufficient`, que lo nombra) y después el rol que el proyecto da a la cuenta, como hace su
ruta: un alcance amplio nunca añade un rol. Cada llamada se cuenta (300 por minuto y cuenta,
`rate.limited` con `retryAfter`) y se registra como `mcp: <herramienta> <ms> ms <código>`, nunca con
sus argumentos.

Las veintiocho herramientas: `whoami`; `list_projects`, `create_project`, `get_project`,
`rename_project`; `read_files`, `write_files`, `validate`, `upload_image`; `list_versions`,
`create_version`, `restore_version`; `open_url`; `preview`, `inspect_story`; `get_sharing`, `set_link_access`,
`invite`, `list_invitations`, `revoke_invitation`, `set_member_role`, `remove_member`; `get_live`,
`start_live`, `end_live`; `list_publications`, `publish`, `unpublish`. Cada una llama a la operación
que llama su ruta y responde `structuredContent` y el mismo JSON como texto; un
rechazo es un resultado `isError` `{ code, message, … }` con los códigos de [Errores](#errores)
(`project.not-found` no dice nada más, una cuota nombra su `limit`). `write_files` toma `ifRevision` y
hace que el objeto renderizador compile primero cada archivo `.meltemi` que escribe con los archivos
del proyecto, y rechaza entero un push con un error (`diagram.invalid`); `validate` da del mismo modo
los diagnósticos de un archivo o del proyecto. `preview` dibuja un PNG (de 1280 de ancho por omisión,
de 16 a 2048) o un SVG en el objeto renderizador, como mucho 30 por minuto y cuenta, con un informe al
lado; un diagrama de Gantt que escribe `today` sin fecha dibuja su línea en la fecha UTC del
servidor. `invite` responde el enlace de la invitación y `emailSent: false`. `publish` hace que el
objeto renderizador construya el catálogo que publica la página, lo guarda y lee una vez la
dirección pública (`HEAD`): una dirección que no responde `200` es `502 publish.unverified` con su
`url`, y la publicación existe.

`inspect_story` recibe `project`, `path` y `story`, con el mismo alcance `projects:read` y
visibilidad del proyecto que `preview`. Informa la revisión de la instantánea actual, duración de
la historia, escenas ordenadas y vistas activas, transiciones y el inicio/fin/duración de acciones
anidadas en milisegundos, además del `stillAtMs` de cada escena para previsualizar su estado final.
Los tiempos vienen de la timeline compilada del reproductor, incluidos valores por omisión y
acciones paralelas. No cambia fuentes ni lee bytes de imágenes. Cada previsualización posterior
lee su propia instantánea actual: compara revisiones antes de afirmar que revisaste la timeline
inspeccionada. Una historia ausente es `request.invalid`; los errores de compilación son
`diagram.invalid` con diagnósticos; se rechazan más de 10000 escenas/acciones.

Cuando falla una llamada al objeto renderizador (superó su límite de CPU, está sobrecargado o se
reinició), `preview`, `inspect_story`, `validate`, `write_files` y `publish` responden `503 renderer.unavailable`, cuyo
mensaje nombra `mdg mcp`; `write_files` y `publish` no han cambiado nada entonces, y la clave de
idempotencia no guarda respuesta, así que un reintento funciona cuando el objeto vuelve a responder.

### El servidor local

`mdg mcp` sirve el mismo catálogo en la máquina de la persona ([la línea de comandos](cli.md#el-servidor-mcp-local-mcp),
decisión 0073): las definiciones, el envoltorio de las llamadas, el manejador sin estado y el motor del
renderizador son el paquete público `@meltemi/diagrams-mcp`, del que se construye también el endpoint,
y una prueba compara los dos `tools/list`. Sus herramientas actúan por las rutas de arriba con el
token de API de la línea de comandos, y nunca llaman a `/mcp` ni al objeto renderizador:

| Herramienta                      | En la máquina de la persona                                       | Por la API                                                          |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `preview`                        | la imagen y su informe, con el motor del renderizador             | `GET …/files`, y `GET …/blobs/<hash>` para sus imágenes y fuentes   |
| `validate`                       | los diagnósticos                                                  | `GET …/files`                                                       |
| `inspect_story`                  | la timeline compilada, sin dibujar                                | `GET …/files`                                                       |
| `write_files`                    | la comprobación de cada archivo `.meltemi` escrito                | `GET …/files`, y luego `PUT …/files` con `Idempotency-Key`          |
| `publish`                        | el catálogo, con el script y el generador de la línea de comandos | `GET …/publish`, `GET …/files`, `PUT …/publish`, una lectura `HEAD` |
| `whoami`                         |                                                                   | `GET /api/session` (su `email`), `GET /api/account/usage`           |
| `list_publications` sin proyecto |                                                                   | `GET /api/account/publications`                                     |
| cualquier otra herramienta       |                                                                   | la ruta que es su operación                                         |

### Autorización

El endpoint MCP admite inicio de sesión OAuth 2.1 con código de autorización, PKCE `S256` y
renovación opcional mediante `offline_access`. Los clientes descubren los endpoints y los scopes
compatibles a través de los metadatos siguientes:

| Dirección                                       | Es                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/oauth-authorization-server`   | Los metadatos del servidor (RFC 8414): los endpoints, `S256`, `none` entre las autenticaciones de cliente, `authorization_code` y `refresh_token`, `client_id_metadata_document_supported` y los seis alcances                |
| `GET /.well-known/oauth-protected-resource/mcp` | Los metadatos del endpoint (RFC 9728): el recurso `<origin>/mcp`, el servidor, los cinco alcances y `header`; el `/.well-known/oauth-protected-resource` del origen, que nombra el desafío, responde el mismo documento       |
| `POST /oauth/register`                          | El registro dinámico de clientes (RFC 7591): diez por hora y dirección, contando cada intento bajo el hash con clave de la dirección (como los intercambios fallidos de la línea de comandos), el undécimo `429 rate.limited` |
| `GET /oauth/authorize`                          | La página de consentimiento                                                                                                                                                                                                   |
| `POST /oauth/authorize`                         | Aprobar o Denegar: `303` a la URI de redirección del cliente, con `state` e `iss`                                                                                                                                             |
| `POST /oauth/token`                             | Códigos intercambiados con su verificador PKCE, tokens de refresco rotados, tokens revocados (RFC 7009)                                                                                                                       |

Un cliente se registra por registro dinámico o nombra un documento de metadatos de client-id: una
dirección `https:` cuyo JSON nombra al cliente y sus URI de redirección, que se lee bajo la opción de
compatibilidad `global_fetch_strictly_public`, así que nunca desde los orígenes de esta misma zona.
`GET /oauth/authorize` comprueba primero la solicitud, pregunte quien pregunte: un cliente
desconocido o una URI de redirección que no registró es una página con `request.invalid`, nunca una
redirección; un `resource` distinto de `<origin>/mcp` es `invalid_target`; PKCE debe ser `S256` para
todo cliente (`invalid_request`). Una persona sin sesión iniciada en la página va al inicio de sesión
del servicio de identidad y vuelve a la misma dirección. La página de consentimiento nombra al cliente
(y el dominio de un documento de metadatos; del nombre de un cliente registrado dice que no está
verificado), el host al que se envía el acceso, con un aviso cuando es este equipo, y cada alcance en
palabras, en el idioma de la interfaz. Su formulario lleva el identificador de la biblioteca, que
sirve una vez, durante diez minutos, en el navegador a cuya cookie `__Host-` está ligado, y un `csrf`
de la sesión sobre él, con la clave `FORMS_SECRET`. Aprobar guarda una concesión con el `sub` de la
persona y el nombre del cliente; Denegar le da al cliente `error=access_denied`.

Los alcances son `projects:read` (lecturas, comprobaciones, vistas previas), `projects:write`
(escrituras, imágenes, versiones), `sharing`, `live`, `publish`, y `offline_access` para un token de
refresco. A un cliente que no pide ninguno de los cinco se le ofrecen los cinco; un alcance que el
servidor no conoce se descarta. El alcance y el rol en el proyecto son dos comprobaciones: una
herramienta rechaza lo que no se concedió al token con `scope.insufficient`, y el rol rechaza el resto
(`access.denied`), así que un editor con todos los alcances sigue sin poder compartir.

Un token de acceso dura una hora (`expires_in: 3600`) y está ligado solo a `<origin>/mcp`. Con
`offline_access` llega con él un token de refresco, válido treinta días desde el intercambio y rotado
en cada uso; el anterior sigue funcionando hasta que se usa por primera vez su sustituto, para que un
cliente que perdió una respuesta pueda reintentar. Un código sirve una vez: un segundo intercambio es
`invalid_grant` y revoca la concesión, con sus tokens. Un token caducado, uno de una concesión
revocada y uno de una cuenta eliminada después de su aprobación son `401`. Un token OAuth nunca abre
`/api/*` (`401 token.invalid`), y el servidor nunca emite un token `mdg_` ni acepta uno en
`/oauth/token`. Los rechazos de la biblioteca se responden, no se registran (un fallo propio se
registra solo por su código), y ninguna dirección del flujo lleva un token; el código sí, una vez.

### Aplicaciones conectadas

`GET /api/account/apps` responde
`{ grants: [{ id, client: { name, uri }, scopes, createdAt, lastUsedAt }] }`, la más reciente
primero. `uri` es la dirección de un documento de metadatos, o el origen al que va el acceso para un
cliente registrado, cuyas propias afirmaciones no se muestran como un hecho; `lastUsedAt` es la última
vez que el token de la concesión llegó al endpoint, escrita como mucho una vez por hora , `null` mientras nunca. `DELETE /api/account/apps/<id>` revoca la
concesión y sus tokens al instante y responde `204`, o `404 not-found` para una concesión que no es
de la persona. Las dos son para una persona con sesión iniciada en la página: un token de API es
`403 request.forbidden`, un token OAuth `401 token.invalid` y nadie `401 auth.required`, y el `DELETE`
está bajo [la regla de Origin](#la-regla-de-origin). Un cliente que vuelve a autorizarse sustituye
su concesión anterior, y un evento `user.deleted` revoca toda concesión que la persona aprobó antes de
la eliminación ([Eventos de eliminación](#eventos-de-eliminación)). La sección Aplicaciones conectadas
del panel de la cuenta las lee y las revoca ([la aplicación web](web-app.md#el-panel-de-la-cuenta)).

## Cuotas y límites

Los límites son `CLOUD_LIMITS` en `@meltemi/diagrams-project`, que usan la página para rechazar
antes de enviar, el Worker para rechazar de todos modos y la línea de comandos, cuyo `push` rechaza
antes de la primera solicitud ([la línea de comandos](cli.md#reflejar-una-carpeta-push)). Cada
uno se rechaza con un código estable: un `413` para un tamaño o un número, un `429` para una
frecuencia y un `400` para la longitud de un nombre ([Errores](#errores)). El único límite que no
está en `CLOUD_LIMITS` es el de los miembros de un proyecto, que solo impone el Worker.

| Qué                                  | Límite                                                                    | Se rechaza como                       |
| ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------- |
| Proyectos por cuenta                 | 100                                                                       | `quota.projects`                      |
| Almacenamiento por cuenta            | 200 MiB: los blobs distintos que referencian sus proyectos y versiones    | `quota.storage`                       |
| Archivos de un proyecto              | 2000                                                                      | `quota.files`                         |
| El documento de un proyecto          | 16 MiB codificado                                                         | `doc.too-large`                       |
| Un archivo de texto                  | 2 Mi caracteres                                                           | `doc.too-large`                       |
| Una imagen o una fuente              | 10 MiB                                                                    | `quota.binary`                        |
| Versiones de un proyecto             | 200, contando las que tienen etiqueta; se conservan 100 sin ella          | `quota.versions`                      |
| Versiones hechas en un minuto        | 6 para un proyecto                                                        | `versions.rate`                       |
| Clientes de una sala                 | 20                                                                        | `room.full`                           |
| Conexiones sin cuenta                | 10 abiertas desde una misma dirección de cliente                          | `connections.limit`                   |
| Una sesión en vivo                   | 24 horas, y una hora sin nadie en su sala                                 | `session.ended`                       |
| Un mensaje de un socket              | 512 KiB                                                                   | `message.too-large`                   |
| Un mensaje de presencia              | 16 KiB; se retransmiten 20 por segundo, más de 100 por segundo lo cierran | `message.too-large`, `awareness.rate` |
| Una miniatura                        | 200 KiB                                                                   | `thumbnail.too-large`                 |
| Miniaturas de un proyecto            | una cada 30 segundos                                                      | `thumbnail.rate`                      |
| Miembros e invitaciones pendientes   | 50 para un proyecto (el propietario no cuenta)                            | `quota.members`                       |
| Una página publicada                 | 16 MiB de UTF-8                                                           | `publish.too-large`                   |
| Solicitudes de publicación           | 10 para un proyecto en una hora                                           | `publish.rate`                        |
| Un alias, un nombre de página (slug) | de 3 a 30 y de 1 a 60 letras minúsculas, dígitos y guiones                | `handle.invalid`, `publish.invalid`   |
| Nombre, descripción y etiqueta       | 100, 500 y 80 caracteres                                                  | `request.invalid`                     |

La cuota de almacenamiento se comprueba donde entran bytes que una persona eligió: la subida de una
imagen o una fuente. Los textos y las versiones cuentan en el uso pero no se rechazan por él; los
acotan los límites por proyecto y por cuenta de las filas de arriba. Un proyecto y sus copias
comparten blobs, y un blob que comparten cien versiones cuenta una sola vez.

## La recolección de blobs

El contenido se comparte por hash y se conserva mientras lo referencie un proyecto, un archivo
subido o una versión. El contenido sin referencias se puede limpiar cuando su registro almacenado
tiene más de siete días. La limpieza corre dos veces al mes en lotes acotados, por lo que una
acumulación o un fallo pueden retenerlo más tiempo; no es una función de recuperación ni de historial.

Una imagen o fuente quitada sin conexión, sin una eliminación correcta del recurso, puede seguir
contando en el almacenamiento hasta que se borre el proyecto. Mira **Ajustes de Diagrams → Uso**
para conocer el uso actual de la cuenta. Eliminar un proyecto también elimina sus versiones y
sus referencias a recursos.

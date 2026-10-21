# El servicio en la nube

[English](../cloud.md)

El servicio en la nube es la mitad en línea y opcional de Meltemi Diagrams: un Worker de Cloudflare
(`packages/cloud`) que sirve el [playground](playground.md) y una API desde un solo origen,
`diagrams.meltemi.dev`, e inicia la sesión de las personas con el servicio de identidad de la
familia Meltemi, en `id.meltemi.dev`. Las razones están en las decisiones
[0041](../decisions/0041-hosted-service.md) y [0042](../decisions/0042-sharing-and-publishing.md)
(en inglés). Esta página describe lo que el servicio hace hoy: cuentas, tokens de API, el inicio de
sesión de la línea de comandos y los proyectos guardados en la nube: su documento y su sala, su
almacenamiento, las versiones, las miniaturas y las cuotas, y la API que los lee y los escribe;
quién puede abrir un proyecto y como qué ([compartir y permisos](#compartir-y-permisos): el nivel
del enlace, los miembros y las invitaciones, ver por enlace); y la publicación de un proyecto como
página web en un host propio ([publicación](#publicación)). La sala también retransmite quién más
tiene un proyecto abierto y dónde está, y no guarda nada de ello
([presencia](#presencia-awareness)). Los comandos propios de la línea de comandos, que envían una
carpeta a un proyecto, traen uno y publican su catálogo, están en
[la línea de comandos](cli.md#los-comandos-de-la-nube); esta página tiene la parte del servicio.

## La cuenta es una capa

La página funciona sin cuenta. Servida por cualquier servidor estático es lo que describe la
[decisión 0031](../decisions/0031-web-playground.md): el trabajo se queda en el navegador, los
enlaces para compartir llevan el proyecto después de `#` y nada sale del origen de la propia
página. Servida por este Worker ofrece una cuenta encima de eso y no quita nada:

- Sin sesión iniciada, la página le pregunta una vez a su propio origen, al arrancar, quién ha
  iniciado sesión, y muestra un enlace **Iniciar sesión**. Un servidor estático no tiene API, así
  que la compilación escribe la respuesta en el sitio: `api/session` contiene `{"user":null}`. Un
  error de red, un estado distinto de `200` y un cuerpo que no es JSON significan todos que nadie
  ha iniciado sesión, sin decir nada.
- Iniciar y cerrar sesión son navegaciones a `id.meltemi.dev` (un enlace y el envío de un
  formulario), nunca solicitudes que haga la página, así que el `connect-src` de la página sigue
  siendo `'self'`. Ni la página ni el Worker manejan jamás una contraseña ni un token de un
  proveedor: el Worker solo verifica la cookie de sesión de la familia.
- Todo lo que añade la cuenta está en la cabecera y en la API. El editor, el lienzo, las
  exportaciones y los enlaces para compartir funcionan como siempre.
- Lo único que añade la cuenta y que guarda tu trabajo es un proyecto en la nube
  ([Un proyecto en la nube](#un-proyecto-en-la-nube)). Una persona lo crea, o guarda en él el
  proyecto del navegador; no se sube nada más, y el proyecto del navegador nunca es reemplazado por
  él.

## Un Worker, un origen

`packages/cloud/wrangler.jsonc` le da al Worker como recursos estáticos la compilación del
playground, `packages/playground/dist` (el binding `ASSETS`, sin página de reserva), y hace que se
ejecute primero para los paths que responde él mismo (`run_worker_first`: `/api/*`, `/_identity/*`,
`/_published/*`, `/cli-auth`, `/cli-auth/*`, `/p/*` y `/rooms/*`). Cualquier otro path lo sirve la
plataforma de recursos sin ejecutar el Worker. La página y la API son un solo origen: no hace falta
CORS, y la política de la página conserva `connect-src 'self'`.

### Los paths y el Host

`cloud()` reparte según el `Host` de la solicitud, que debe ser el host de `ORIGIN`:

| La solicitud                                                                                                                | La respuesta                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Un path que responde una ruta (véase [Rutas](#rutas))                                                                       | La ruta                                                                                       |
| Un path bajo `/api`, `/_identity`, `/_published`, `/cli-auth`, `/p` o `/rooms` sin ruta, o un path conocido con otro método | `404 not-found` en JSON, nunca un recurso, escrito como se escriba (también `/%61pi/session`) |
| Cualquier otro path                                                                                                         | El recurso estático (la página, sus scripts, sus fuentes), o el `404` de la plataforma        |
| Cualquier otro host, el host de publicación incluido                                                                        | `404 not-found` en JSON: ni recursos ni API                                                   |

En desarrollo (`DEV`) el origen es el de la propia solicitud, así que una solicitud local siempre
pasa. El host de publicación nunca llega a este Worker: es otro Worker
([El host de publicación](#el-host-de-publicación)). `/_published/` es el prefijo de la única ruta
de desarrollo que sirve una publicación desde este origen; sin `DEV`, todo path bajo él es el `404`
en JSON.

Los archivos propios de la página salen con dos cabeceras que la compilación del playground
escribe en `_headers` y que aplica la plataforma de recursos:
`Content-Security-Policy: frame-ancestors 'self'` y `X-Content-Type-Options: nosniff`. La política de
la página es una etiqueta `meta`, que no puede decir quién puede enmarcarla; sin la cabecera,
cualquier sitio podría enmarcar una página con sesión iniciada y engañar a una persona para que pulse
Revocar, Crear o Cerrar sesión. Un archivo que no existe es el `404` de la plataforma, que no tiene
nada que enmarcar. Un recurso que sirve `cloud()` mismo (las pruebas de Node, o una configuración que
ejecuta el Worker primero para todo) lleva las mismas dos cabeceras.

Los recursos que sirve la plataforma no cuentan como solicitudes del Worker en el plan gratuito; solo
cuentan la API, las salas, los enlaces de proyecto y el inicio de sesión de la línea de comandos. La
decisión 0041 hacía que el Worker se ejecutara primero para todo porque una lista de paths coincide
sea cual sea el host, y el host de publicación habría servido entonces la página. Esa razón ya no
existe (decisión 0046): el host de publicación es un Worker propio, y ninguno de los dos Workers
tiene más dirección que su Custom Domain (ni `workers.dev` ni vistas previas), así que ningún otro
host llega a estos recursos. Un path reservado escrito con escapes (`/%61pi/session`) es el `404` del
Worker, o el único archivo estático con nombre reservado, `api/session`, cuyo `{"user":null}` es la
respuesta que el Worker da a nadie; nunca otro archivo.

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

## El manejador

`src/worker.ts` es el punto de entrada de Cloudflare: exporta el manejador del Worker
(`src/worker-handler.ts`) y la clase de Durable Object `ProjectRoom` (`src/room.ts`), y nada más
conoce Cloudflare. El manejador construye las dependencias a partir de los bindings (la base de
datos `DB` mediante `d1Store`, el namespace `ROOMS` mediante `durableRooms`, `ASSETS`, el reloj,
`crypto.getRandomValues`, `fetch` y un verificador por isolate) y entrega cada solicitud a
`cloud(request, env, deps)` de `src/handler.ts`. Las rutas que sirven bytes (blobs y miniaturas)
leen el bucket `BLOBS` de `env`. Todo lo demás es una función simple de lo que recibe:

```ts
interface Deps {
  readonly store: CloudStore;
  readonly rooms: RoomsApi; // las salas de los proyectos: Durable Objects aquí, salas en memoria en las pruebas
  readonly verifier: SessionVerifier; // el verificador de referencia de @meltemi/identity
  readonly assets: { fetch(request: Request): Promise<Response> };
  now(): Date;
  randomBytes(length: number): Uint8Array;
  readonly fetch: typeof fetch; // las claves y la comprobación de sesión del servicio de identidad
}
```

`cloud()` hace, por orden:

1. Lee la configuración. Una que no puede usar es `500 internal`, registrado con el nombre de la
   variable y nunca con su valor.
2. Comprueba el `Host`, como se ha visto.
3. Busca la ruta por método y path. Un path sin ruta bajo un prefijo reservado es `404`; cualquier
   otro path va a los recursos.
4. Para una ruta que necesita saber quién pregunta (todas menos los eventos, el intercambio del
   código, la hoja de estilo, los enlaces de proyecto, la ruta de desarrollo que sirve una
   publicación y el socket, que mira la cookie por sí mismo), determina quién pregunta y aplica la
   regla de `Origin`. Una ruta que determina quién pregunta puede aun así responder a nadie: el
   enlace de un proyecto puede admitir a personas anónimas en las rutas que solo leen
   ([Compartir y permisos](#compartir-y-permisos)).
5. Ejecuta la ruta. Un `ApiError` se convierte en su respuesta JSON; cualquier otro error se
   convierte en `500 internal` y se registra sin detalle.

Una ruta es una función de un solo contexto: la solicitud, el entorno, las dependencias, la
configuración, la identidad de quien pregunta y las partes capturadas del path.

`CloudStore` es todo lo que guarda el servicio: usuarios, tokens de API, los eventos de eliminación
ya procesados, los códigos de la aprobación de la línea de comandos y los fallos que limitan la
frecuencia de su intercambio, los proyectos con sus archivos, blobs, versiones y los bytes que
usa cada cuenta, y lo que añaden compartir y publicar: el nivel del enlace, los miembros, las
invitaciones, los alias, las publicaciones, las retiradas y el registro que limita la frecuencia de
publicar. Tiene dos implementaciones, `memoryStore()` y `d1Store(db)` sobre la interfaz
mínima `D1Like`, y ambas superan una misma suite de conformidad.

`RoomsApi` es lo que el Worker le pide a la sala de un proyecto: conectar un socket, leer los
archivos, hacer un push, restaurar, materializar, destruir, cortar sockets (cuando cambia el
acceso) y, en desarrollo, contar. `durableRooms()` (`src/room-client.ts`) la implementa sobre el
binding de Durable Objects y
construye cada solicitud que envía. Las reglas de la sala no están en la clase del Durable Object,
que solo conecta la plataforma (el almacenamiento SQLite, los temporizadores, la API de
hibernación de WebSocket) con `RoomCore` (`src/room-core.ts`); `RoomCore` trabaja sobre puertos
(almacenamiento, reloj, temporizadores, sockets), así que las pruebas ejecutan cada regla en Node
sobre un par de sockets simulados, un almacenamiento simulado y un reloj simulado. Todas las
pruebas se ejecutan en Node sin red: el servicio de identidad, los recursos, el reloj, las salas y
el bucket de R2 son simulados.

## Quién pregunta

Una ruta que necesita saber quién pregunta determina quién es el solicitante, una persona con la
cookie o un token, por este orden.

### Tokens bearer

`Authorization: Bearer mdg_<token>` es un token de API. Se busca su SHA-256 entre los hashes
guardados; si coincide, es la persona que creó el token, y el último uso del token se registra en
su primer uso y después como máximo una vez por hora. Un token bearer desconocido, revocado o que
no es un token de API es `401 token.invalid`, sea cual sea la cookie que lo acompañe, y uno válido
se impone a la cookie (que ni siquiera se lee). Otros esquemas de `Authorization`, y un `Bearer`
sin token, se ignoran.

Un token es su propia credencial: sigue funcionando cuando termina la sesión que lo creó, hasta que
se revoca o se elimina la cuenta. No necesita `Origin`.

### La cookie de sesión

En caso contrario, la cookie `meltemi_session` pasa al verificador de referencia de
`@meltemi/identity`. Acepta un token firmado (ES256) con una clave del conjunto de claves del
servicio de identidad, emitido por `IDENTITY_ISSUER` para la audiencia `meltemi`, que no ha
caducado y cuya sesión sigue viva: `GET <IDENTITY_ISSUER>/sessions/<sid>` responde `204`. El
conjunto de claves se conserva una hora y la comprobación de sesión una hora por sesión, por
instancia del verificador, de modo que una revocación en el servicio de identidad cuenta desde la
hora siguiente. Una comprobación que falla cuenta como sesión no válida y no se recuerda. El README
del paquete tiene el resto.

Una cookie que no se verifica no es un error: la solicitud continúa como anónima. Una ruta que
necesita una persona responde entonces `401 auth.required`.

Una sesión emitida antes de que su persona fuera eliminada tampoco cuenta. El verificador confía en
una sesión viva durante una hora, y en esa hora la pestaña abierta de la persona eliminada crearía
de nuevo su fila y haría tokens. Por eso, para una cookie verificada, el Worker pregunta si se
atendió una eliminación de ese `sub` en el momento en que se emitió la sesión o después (véase
[Eventos de eliminación](#eventos-de-eliminación)); si es así, la solicitud continúa como anónima y
no se crea ninguna fila. Una persona que inicia sesión de nuevo tiene una sesión posterior y no se
ve afectada.

### Usuarios

Desde la primera solicitud autenticada con la cookie, el Worker guarda una fila de usuario por
`sub`, con una copia del `name`, el `picture`, el `email` y el `email_verified` del token. Cada
solicitud los compara con la fila y la actualiza cuando difieren, así que un nuevo inicio de sesión
con otro nombre u otra imagen la actualiza. La fila guarda además lo que el token no lleva: el
alias de la persona, una vez que lo eligió ([Alias](#alias)). La fila de una persona eliminada se
borra, no se marca.

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
jamás desde un host bajo `meltemi.dev`: el contenido publicado tiene su propio dominio (decisión
0042), y el servicio se niega a construir una dirección pública sobre un host que incumpliría la
regla ([El host de publicación](#el-host-de-publicación)).

## Errores

Todo error es JSON, `{ "code": "…", "message": "…" }`, con `Cache-Control: no-store`. El código es
estable; el mensaje está en inglés y nunca contiene un token, una cookie, un secreto ni una traza.
Algunas respuestas llevan un campo más sobre el que quien llama puede actuar: un push obsoleto
contiene la `revision` actual de la sala. Los códigos son las claves de `ERROR_STATUS` en
`src/errors.ts`, donde se añade primero uno nuevo; una prueba comprueba que esta tabla lista cada
uno de ellos con su estado, y ningún otro.

Los rechazos de la propia sala llegan a una persona de dos maneras: como el JSON de una ruta
(`PUT /files`, una creación) o, en el socket, como un mensaje de tipo 4 y un código de cierre
([El protocolo de la sala](#el-protocolo-de-la-sala)). El mismo código nombra a ambos.

| Código                | Estado | Significado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-found`           | 404    | Ninguna ruta responde: un path desconocido bajo un prefijo reservado, un path conocido con otro método, una solicitud a un socket que no es un upgrade, cualquier path de otro host, un id de token que no es tuyo, un blob que el proyecto no tiene, una miniatura que no tiene, una imagen o fuente que no está en el path que nombra un borrado, un miembro, una invitación o una publicación que una ruta nombra y que no existe, la ruta de los administradores consultada por quien no lo es, y una publicación que la ruta de desarrollo no encuentra (sin `DEV`, cualquier path bajo `/_published/`)                                                                                                                                                                                                                                                              |
| `project.not-found`   | 404    | Un proyecto que no existe o que quien pregunta no puede abrir en absoluto, como uno privado que no es suyo (una misma respuesta para ambos, para que nadie sepa cuáles existen), y `/p/<id>` con un id que no puede ser el de un proyecto; en un socket, la sala de un proyecto que se eliminó                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `request.invalid`     | 400    | El cuerpo no es lo que lee la ruta: no es un objeto JSON, el nombre de un token vacío, de más de 60 caracteres o con caracteres de control, un evento de más de 8 KiB o sin su `id`, `type`, `sub` y `at`; el nombre de un proyecto vacío, de más de 100 caracteres o con caracteres de control, una descripción de más de 500, una etiqueta de más de 80; una plantilla que no existe o que se da junto con archivos; archivos, binarios o un push que no son objetos de texto por path; un hash de binario que no son 64 caracteres hexadecimales en minúscula; un nivel de enlace que no es `private`, `view` ni `edit`, un rol que no es `viewer` ni `editor`, un correo vacío, de más de 254 caracteres o sin un dominio con punto, el propio correo del propietario como invitación; el motivo de una retirada de más de 500 caracteres o con caracteres de control |
| `auth.required`       | 401    | La ruta necesita una persona y la solicitud no trae ninguna (sin credenciales, o con una cookie no válida o caducada); en un proyecto cuyo enlace admite a personas anónimas, una solicitud que iniciar sesión permitiría (un push cuando el enlace es `edit`) o que necesita una cuenta de todos modos (una copia, salir); un upgrade de socket sin una cookie válida, porque en un socket no se admite un token bearer                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `token.invalid`       | 401    | Un token bearer desconocido, revocado o que no es un token de API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `signature.invalid`   | 401    | Un evento de eliminación cuya `Meltemi-Signature` no coincide con su cuerpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `request.forbidden`   | 403    | Un cambio hecho con la cookie desde una página que no es la del servicio (la regla de `Origin`), o un upgrade de socket cuyo `Origin` no es el del servicio; un token bearer que pide lo que solo puede hacer la página (crear un token); en la página de aprobación, un formulario sin el `csrf` correcto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `quota.tokens`        | 413    | La cuenta ya tiene 20 tokens de API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cli.invalid`         | 400    | La solicitud de la línea de comandos no se puede usar: un puerto o un `state` que la página de aprobación no acepta, un código desconocido, ya usado o caducado, un `state` que no coincide, o un intercambio que no se puede leer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cli.rate`            | 429    | Un solicitante que ha hecho 10 intercambios de código fallidos en el último minuto; `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `path.invalid`        | 400    | Un path de archivo que incumple [la regla de los paths](#la-regla-de-los-paths): en una creación, un push, una subida o un borrado de un binario; en un socket, una transacción que establece un path así (se revierte, código de cierre `4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `blob.unknown`        | 400    | Una imagen o fuente que nombra un hash que el proyecto nunca subió (`project_blobs`) o, en una creación, que ninguno de los proyectos de la persona tiene; en un socket, una transacción que establece un hash así (`4400`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doc.invalid`         | 400    | Un cambio que el documento no puede conservar: un path que es a la vez texto y binario en un mismo cambio, un valor de otra forma, un tipo raíz propio, un mensaje de texto o un mensaje de un tipo que un cliente no puede enviar; en un socket, `4400`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `doc.too-large`       | 413    | Un texto de más de 2 Mi caracteres, un documento cuyo estado codificado supera 16 MiB, o un cuerpo mayor que un documento entero; en un socket, la transacción se revierte (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `quota.files`         | 413    | Un proyecto que tendría más de 2000 archivos; en un socket, se revierte (`4413`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `quota.projects`      | 413    | La cuenta ya tiene 100 proyectos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `quota.storage`       | 413    | Una subida que llevaría la cuenta por encima de 200 MiB (los bytes que ya referencia no cuentan otra vez)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quota.binary`        | 413    | Una imagen o fuente de más de 10 MiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `binary.invalid`      | 400    | Una subida que por sus bytes no es un PNG, JPEG, GIF, WebP, SVG, woff2, ttf u otf, diga lo que diga su `Content-Type`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `quota.versions`      | 413    | Un proyecto que ya tiene 200 versiones, una vez que la política ha depurado lo que puede, y al que se pide otra versión o una restauración                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `versions.rate`       | 429    | Más de seis versiones hechas para un proyecto en un minuto (una restauración cuenta); `Retry-After: 60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `version.not-found`   | 404    | Un número de versión que el proyecto no tiene: nunca se hizo, se depuró, o no es un número                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `thumbnail.too-large` | 413    | Una miniatura de más de 200 KiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `thumbnail.invalid`   | 400    | Una miniatura que no se envía como `image/svg+xml`, o cuyo cuerpo no es un SVG bien formado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `thumbnail.rate`      | 429    | Una segunda miniatura de un proyecto antes de 30 segundos; `Retry-After` indica cuántos segundos faltan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `revision.mismatch`   | 409    | Un push cuyo `ifRevision` no es la revisión actual de la sala; la respuesta trae esa `revision` y no cambia nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `access.denied`       | 403    | Alguien que ve el proyecto pero no puede hacer esto: un lector, o una persona anónima con un enlace `view`, que lo cambia; un editor, o cualquiera a quien admite el enlace, que hace lo que solo puede el propietario (cambiar cómo se comparte, invitar, publicar, renombrar o eliminar); el propietario que sale de su propio proyecto; en un socket, una actualización de un lector (`4403`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `invite.invalid`      | 404    | Un enlace de invitación desconocido, ya usado o de más de treinta días (un token que no son 32 caracteres hexadecimales en minúscula recibe la misma respuesta); no se acepta nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `quota.members`       | 413    | Un proyecto que ya tiene 50 miembros e invitaciones pendientes en conjunto (el propietario no cuenta, ni una invitación de más de treinta días); no se registra nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `handle.invalid`      | 400    | Un alias (`handle`) que no son de 3 a 30 letras minúsculas, dígitos o guiones: a la persona no se le recorta ni se le pasa a minúsculas nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `handle.taken`        | 409    | Un alias que otra cuenta ya tiene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `handle.locked`       | 409    | Un cambio de alias mientras una publicación tiene por dirección el alias actual; elegir otra vez el mismo alias siempre es válido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `handle.required`     | 409    | Una publicación de una persona que aún no ha elegido alias, respondida antes de leer el cuerpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `publish.invalid`     | 400    | Un nombre de página (`slug`) que no son de 1 a 60 letras minúsculas, dígitos o guiones, o un `html` que no es texto o está vacío                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `publish.too-large`   | 413    | Una página de más de 16 MiB (UTF-8), o una solicitud de publicación demasiado grande para contener una (más de 24 MiB); no cambia nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `publish.rate`        | 429    | Más de diez solicitudes de publicación para un proyecto en la última hora; `Retry-After` indica cuántos segundos faltan para que la más antigua deje de contar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `publish.taken`       | 409    | Un `slug` que otro proyecto de la misma persona ya publica bajo su alias                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `message.too-large`   | 413    | Un mensaje de un socket de más de 512 KiB, o un mensaje de presencia de más de 16 KiB ([Presencia](#presencia-awareness)); el socket se cierra con `4413`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `room.full`           | 409    | Una sala que ya tiene 20 clientes: al 21.º se le avisa y su socket se cierra con `4409`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `awareness.rate`      | 429    | Un cliente que ha enviado más de 100 mensajes de presencia en un segundo: se le avisa en el socket y el socket se cierra con `4429` ([Presencia](#presencia-awareness)); ninguna ruta lo responde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `internal`            | 500    | Cualquier cosa inesperada, o una configuración con la que el servicio no puede ejecutarse; la respuesta no da ningún detalle; en un socket, un mensaje que la sala no pudo atender (`4500`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

La página de aprobación de `/cli-auth` responde `cli.invalid` y `request.forbidden` como páginas
que muestran el código, en inglés o en español, en lugar de JSON.

## Rutas

| Ruta                                             | Quién puede llamarla                                                 | Respuesta                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/session`                               | cualquiera                                                           | `200`, para quién es la página                                 |
| `POST /api/tokens`                               | una persona con sesión iniciada en la página                         | `201 { id, name, token }`                                      |
| `GET /api/tokens`                                | una persona, con la cookie o con un token                            | `200 { tokens }`                                               |
| `DELETE /api/tokens/<id>`                        | una persona, con la cookie o con un token                            | `204`                                                          |
| `POST /_identity/events`                         | el servicio de identidad                                             | `200 { status }`                                               |
| `GET /cli-auth`                                  | cualquiera; aprueba una persona con sesión iniciada                  | la página de aprobación, o una redirección para iniciar sesión |
| `POST /cli-auth`                                 | una persona con sesión iniciada en la página                         | `303` al listener de la línea de comandos                      |
| `POST /cli-auth/token`                           | la línea de comandos                                                 | `200 { id, name, token }`                                      |
| `GET /cli-auth/style.css`                        | cualquiera                                                           | la hoja de estilo de la página de aprobación                   |
| `GET /p/<id>`                                    | cualquiera                                                           | `302` a `/?project=<id>`                                       |
| `GET /rooms/<id>`                                | una persona a la que admite el proyecto, con la cookie               | `101`, un socket a la sala del proyecto                        |
| `PATCH /api/account`                             | una persona, con la cookie o un token                                | `200 { handle }`                                               |
| `POST /api/invitations/<token>/accept`           | una persona, con la cookie o con un token                            | `200`, el proyecto, con el rol que la persona tiene ahora      |
| `DELETE /api/admin/publications/<handle>/<slug>` | un administrador, con la cookie; cualquier otra persona recibe `404` | `204`                                                          |
| `GET` y `HEAD /_published/<handle>/<slug>/`      | cualquiera; solo en desarrollo                                       | `200`, la página publicada                                     |

Las rutas de los proyectos nombran cada una el rol que necesitan: el del propietario, el de un
editor o, para lo que solo lee, el de un lector, que el enlace del proyecto puede dar a cualquiera,
con sesión iniciada o sin ella ([Compartir y permisos](#compartir-y-permisos) tiene la tabla y el
orden de los rechazos). Una ruta que necesita más de lo que da el enlace necesita una persona, con
la cookie o con un token; un proyecto que la persona no puede abrir en absoluto es
`404 project.not-found`. [La API de proyectos](#la-api-de-proyectos),
[Compartir y permisos](#compartir-y-permisos) y [Publicación](#publicación) tienen sus formas.

| Ruta                                           | Respuesta                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/projects`                            | `200 { projects }`                                                                             |
| `POST /api/projects`                           | `201`, el proyecto                                                                             |
| `GET /api/projects/<id>`                       | `200`, el proyecto                                                                             |
| `PATCH /api/projects/<id>`                     | `200`, el proyecto                                                                             |
| `DELETE /api/projects/<id>`                    | `204`                                                                                          |
| `POST /api/projects/<id>/duplicate`            | `201`, la copia (y `skipped`, si se dejaron archivos fuera)                                    |
| `GET /api/projects/<id>/files`                 | `200 { revision, files, binaries, collisions }`                                                |
| `PUT /api/projects/<id>/files`                 | `200 { revision }`                                                                             |
| `PUT /api/projects/<id>/binaries/<path>`       | `200 { hash }`                                                                                 |
| `DELETE /api/projects/<id>/binaries/<path>`    | `204`                                                                                          |
| `GET /api/projects/<id>/blobs/<hash>`          | `200`, los bytes, en una sandbox                                                               |
| `HEAD /api/projects/<id>/blobs/<hash>`         | `200`, las cabeceras del `GET`                                                                 |
| `POST /api/projects/<id>/versions`             | `201`, la versión                                                                              |
| `GET /api/projects/<id>/versions`              | `200 { versions }`                                                                             |
| `GET /api/projects/<id>/versions/<n>`          | `200`, la versión con sus archivos                                                             |
| `POST /api/projects/<id>/versions/<n>/restore` | `200 { revision, restored, saved, skipped? }`                                                  |
| `PUT /api/projects/<id>/thumbnail`             | `204`                                                                                          |
| `GET /api/projects/<id>/thumbnail`             | `200`, el SVG, en una sandbox                                                                  |
| `GET /api/projects/<id>/sharing`               | `200`, el nivel del enlace, el rol de quien pregunta y, hasta donde puede verlas, las personas |
| `PATCH /api/projects/<id>/sharing`             | `200`, el estado completo de lo que se comparte                                                |
| `POST /api/projects/<id>/members`              | `201`, la invitación con su enlace (`200` cuando el correo ya tenía una pendiente)             |
| `PATCH /api/projects/<id>/members/<sub>`       | `200`, el miembro                                                                              |
| `DELETE /api/projects/<id>/members/<sub>`      | `204`                                                                                          |
| `DELETE /api/projects/<id>/members/me`         | `204`                                                                                          |
| `GET /api/projects/<id>/invitations`           | `200 { invitations }`                                                                          |
| `DELETE /api/projects/<id>/invitations/<id>`   | `204`                                                                                          |
| `GET /api/projects/<id>/publish`               | `200 { handle, publications, takedowns }`                                                      |
| `PUT /api/projects/<id>/publish`               | `200 { url, handle, slug, bytes, published_at }`                                               |
| `DELETE /api/projects/<id>/publish/<slug>`     | `204`                                                                                          |
| `GET /api/account/usage`                       | `200 { projects, storageBytes, limits }`                                                       |
| `GET /api/dev/rooms/<id>/stats`                | solo en desarrollo: `200`, los contadores de la sala                                           |
| `POST /api/dev/rooms/<id>/disconnect`          | solo en desarrollo: `200 { closed }`                                                           |
| `POST /api/dev/rooms/<id>/limits`              | solo en desarrollo: `200 { clients }`                                                          |
| `POST /api/dev/collect`                        | solo en desarrollo: `200`, lo que hizo la recolección                                          |

Las fechas y horas son ISO 8601 en UTC con milisegundos.

Todo cuerpo se lee con un tope, lo envíe quien lo envíe, para que nadie haga que el Worker retenga lo
que no pidió: un evento de eliminación y el formulario de aprobación hasta 8 KiB, el JSON de la
página (el nombre de un token, el de un proyecto, una etiqueta) hasta 8 KiB, el intercambio de la
línea de comandos hasta 4 KiB. Un cuerpo más largo, o que dice serlo, no se lee más y se suelta su
flujo. Para el JSON y los eventos eso es `400 request.invalid`; el formulario de aprobación lo envían
también personas sin sesión, y un formulario demasiado largo es un cuerpo que no es un formulario,
así que se las envía a iniciar sesión y a quien tiene sesión se le muestra la página de rechazo. Las
rutas de proyectos que llevan contenido tienen topes propios, cada uno respondido con el código de
su límite: una creación o un push hasta un documento entero y un megabyte (17 MiB,
`doc.too-large`), una subida 10 MiB (`quota.binary`), una miniatura 200 KiB
(`thumbnail.too-large`) y una solicitud de publicación 24 MiB, los 16 MiB de la página y 8 MiB para
el JSON que la rodea (`publish.too-large`). El JSON de compartir (una invitación, un rol, un nivel
de enlace) y el de una retirada se lee hasta 8 KiB como el resto.

### La respuesta de sesión

`GET /api/session` es la única solicitud que hace la página al arrancar. Responde `200` con
`Cache-Control: no-store`, con una de tres formas. Una persona con la cookie:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana"
  },
  "account": "https://id.meltemi.dev/account",
  "signOut": "https://id.meltemi.dev/logout"
}
```

`handle` es el nombre bajo el que la persona publica, o `null` hasta que lo elige
([Alias](#alias)). Antes de responder, una cookie cuyo correo verificó el servicio de identidad ve
cómo cada invitación pendiente para ese correo se convierte en una membresía
([Invitaciones](#invitaciones)); un correo que no está verificado no resuelve nada. `account` es la
página del servicio de identidad y `signOut` la dirección a la que un formulario envía, con el
campo `return_to`, para terminar la sesión. Un token bearer, para que la línea de comandos sepa qué
token tiene, sin `account` ni `signOut`; lleva también el alias, pero no resuelve ninguna
invitación, porque solo la cookie tiene un correo verificado:

```json
{
  "user": {
    "sub": "u_7d3f",
    "name": "Ana",
    "picture": "https://avatars.githubusercontent.com/u/1",
    "handle": "ana"
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

### Eventos de eliminación

Cuando una persona elimina su cuenta, el servicio de identidad avisa a cada producto de su lista.
Conoce este Worker como el producto `diagrams`: su ajuste `PRODUCTS` contiene
`[{"name":"diagrams","events":"https://diagrams.meltemi.dev/_identity/events"}]`
(`http://localhost:8788/_identity/events` en desarrollo) y su secreto `EVENTS_SECRET_DIAGRAMS`. El
`IDENTITY_EVENTS_SECRET` de este Worker debe tener ese mismo valor.

```http
POST /_identity/events
Content-Type: application/json
Meltemi-Event-Id: evt_9f2c
Meltemi-Signature: v1=ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12

{"id":"evt_9f2c","type":"user.deleted","sub":"u_7d3f","at":"2026-10-14T12:00:00.000Z"}
```

La firma es `v1=` y el HMAC-SHA256 hexadecimal del cuerpo, con la clave del secreto de eventos.
Aquí no hay persona ni `Origin`: la firma sobre el texto exacto del cuerpo es toda la autenticación,
y se comprueba antes de leer el cuerpo como JSON (`401 signature.invalid`). El cuerpo se lee hasta
8 KiB; debe ser un objeto JSON con los campos de texto `id`, `type`, `sub` y `at` (una hora ISO
8601), y si no, `400 request.invalid`. La identidad del evento es el `id` del cuerpo.

- `user.deleted` primero destruye la sala y elimina la miniatura de cada uno de los proyectos de la
  persona y las páginas que publicó, y después elimina, en un solo paso atómico, todo lo que se
  guarda para el `sub` (el usuario, sus tokens y sus códigos de aprobación pendientes, sus
  proyectos con sus filas de archivos, subidas, versiones y archivos de versiones, miembros,
  invitaciones, publicaciones y solicitudes de publicación; las membresías de la persona en los
  proyectos de otras, cuyos sockets abiertos allí se cortan; y las invitaciones dirigidas al correo de su fila de usuario cuando el
  servicio de identidad lo había verificado) y registra el evento: su id, el `sub` y su hora. Luego
  responde `200` con el estado `applied`. Las filas de `blobs` se comparten por contenido y se
  quedan; la [recolección](#la-recolección-de-blobs) semanal se lleva las que nada más referencia.
  Las retiradas también se quedan: son el registro del servicio ([Retirada](#retirada)). La entrega
  es al menos una vez, así que la repetición del mismo id de evento no cambia nada y responde `200`
  con el estado `duplicate`; y la repetición de un evento que ya se atendió no toca las salas ni las
  páginas de una persona que inició sesión de nuevo y creó proyectos desde entonces. Todos los pasos
  se pueden repetir sin riesgo, así que una entrega que sigue a un fallo termina el trabajo.
- Cualquier otro tipo firmado se acepta con `200` y el estado `ignored`, y no cambia nada.
- La respuesta es `200` solo cuando los datos ya no están. Si el almacén falla, la respuesta es
  `500` y el servicio de identidad lo vuelve a intentar (el README de `@meltemi/identity` tiene su
  calendario). Sin `IDENTITY_EVENTS_SECRET` configurado, cada evento es `500 internal`, registrado.

El registro del evento es lo que rechaza las sesiones antiguas de la persona eliminada (véase
[La cookie de sesión](#la-cookie-de-sesión)): una sesión emitida en el segundo de la eliminación o
antes cuenta como nadie, y una emitida en un segundo posterior es una persona que inicia sesión de
nuevo. El registro se guarda 31 días, porque una sesión dura treinta y el servicio de identidad
reintenta un evento durante siete; el barrido elimina los más antiguos. De una persona eliminada
queda su `sub`, que es opaco, y la hora de la eliminación y, cuando el servicio retiró una página
suya, el registro de esa retirada; nada más.

### El inicio de sesión de la línea de comandos

`mdg login` inicia la sesión de la línea de comandos pidiendo a una persona que la apruebe en el
navegador. Los pasos son estos; [la línea de comandos](cli.md#iniciar-sesión-login-logout-y-whoami)
describe la parte de la terminal:

1. La línea de comandos escucha en `127.0.0.1` en un puerto libre, genera un `state` aleatorio (de
   16 a 128 caracteres base64url), muestra una comprobación de seis caracteres y abre
   `https://diagrams.meltemi.dev/cli-auth?port=<n>&state=<s>`.
2. `GET /cli-auth` comprueba primero la solicitud, quienquiera que la haga. El puerto es un entero
   de 1024 a 65535 en dígitos decimales sencillos (`80`, `localhost:4000` y `08080` no son
   puertos) y el `state` tiene de 16 a 128 caracteres base64url, cada uno dado una sola vez; todo lo
   demás es una página `400` con `cli.invalid`. A quien no ha iniciado sesión, o solo tiene un token
   (un token no aprueba otro), se le envía a iniciar sesión y vuelve a esta misma dirección. Quien
   ha iniciado sesión ve "¿Permitir la línea de comandos en este equipo?" en inglés o en español
   (`?lang=en|es`, y si no, el idioma del navegador), con su nombre, el puerto, la comprobación y un
   botón **Aprobar**.
3. La comprobación son los seis primeros caracteres del base32 de la RFC 4648 (mayúsculas, sin
   relleno) del SHA-256 del `state`. La terminal muestra esos mismos seis, así que una persona puede
   distinguir su solicitud de la de otra.
4. **Aprobar** envía el formulario a `POST /cli-auth`. Necesita la cookie, la regla de `Origin` y el
   `csrf` de la página (el HMAC-SHA256 hexadecimal de `cli-auth:<sid>` con la clave `FORMS_SECRET`,
   así que pertenece a una sola sesión). El Worker guarda un código de un solo uso, 32 bytes
   aleatorios en base64url de los que solo se conserva el SHA-256, vinculado a la persona y al
   `state` durante cinco minutos, y responde `303` a
   `http://127.0.0.1:<port>/?code=<code>&state=<state>`. El host es siempre `127.0.0.1`, diga lo
   que diga la solicitud. Todavía no existe ningún token, y ninguno aparece nunca en una dirección.
5. El listener recibe `code` y `state`, comprueba que el `state` es el suyo y envía
   `{ "code": "…", "state": "…" }` a `POST /cli-auth/token`, sin cookie y sin `Origin`.
6. El intercambio toma el código (desaparece pase lo que pase). Un código desconocido, ya usado o de
   más de cinco minutos, un `state` que no coincide, o un cuerpo que no se puede leer, es
   `400 cli.invalid`. En caso contrario crea un token llamado `CLI (<fecha>)`, con la fecha UTC del
   intercambio, para la persona a la que está vinculado el código y responde una sola vez `200` con
   `{ "id", "name", "token" }`. Quien ya tiene 20 tokens recibe `413 quota.tokens` y ningún token, y
   el código desaparece: revoca uno y vuelve a ejecutar `mdg login`.

El token se crea en el intercambio, no en la aprobación, porque de un token de API solo se guarda su
SHA-256: ningún token de API en claro queda en ningún sitio, ni siquiera cinco minutos, y ninguno
llega a la dirección ni al historial del navegador.

El listener es estricto con lo que acepta. Responde solo a un `GET /` dirigido a `127.0.0.1` y a su
propio puerto (un nombre que se resuelva a esta máquina se rechaza), con un `code` y un `state` igual
al suyo, y deja de escuchar con la primera solicitud así. Espera cinco minutos, lo que dura un
código. El intercambio no lleva ningún token, y el token que responde se guarda en el archivo de
credenciales antes de decirle al navegador que el inicio de sesión terminó. `mdg login --token` es la
vía para un equipo sin navegador: lee de la entrada estándar un token creado en la página y averigua
su id y su propietario con `GET /api/session` y ese token
([La respuesta de sesión](#la-respuesta-de-sesión)).

El intercambio tiene un límite de frecuencia por solicitante, un hash con clave de
`CF-Connecting-IP` (la dirección en sí no se guarda nunca, y los solicitantes sin dirección
comparten un mismo grupo). Diez fallos en el último minuto hacen que la solicitud siguiente sea
`429 cli.rate` con `Retry-After: 60`, comprobado antes de leer el cuerpo; el código que traía se
deja como está. Un cuerpo ilegible, un código desconocido o caducado y un `state` equivocado son
fallos; un éxito y una negativa por cuota no lo son. Los fallos de un solicitante de más de una hora
se borran cuando vuelve a fallar. Además, cada intercambio fallido y cada aprobación empiezan por
barrer lo que nadie vuelve a buscar, sea de quien sea: los fallos de cualquier solicitante de más de
una hora, los códigos de aprobación que han caducado, los registros de eliminación de más de 31
días y, ya que publicar también barre antes, las solicitudes de publicación de más de una hora. Un
código que nadie intercambia y un solicitante que no vuelve se quedarían para siempre, y
una avalancha de cualquiera de los dos haría crecer las tablas sin fin; con el barrido guardan los
últimos minutos y la última hora. El cron semanal también barre, para que un despliegue en el que
nadie aprueba, falla ni publica no conserve los registros de una eliminación más de 31 días.

La página de aprobación envía sus propias cabeceras. Su política es `default-src 'none'`,
`style-src 'self'`, `img-src 'self'`, `base-uri 'none'`, `frame-ancestors 'none'` y
`form-action 'self' http://127.0.0.1:*`: Chromium aplica `form-action` a la redirección que sigue
al envío de un formulario, así que la dirección de loopback debe estar en ella. `Referrer-Policy`
es `same-origin`, porque `no-referrer` haría que el navegador enviara el formulario con
`Origin: null`, que la regla de `Origin` rechaza. La página no se guarda nunca en caché; su hoja de
estilo es `GET /cli-auth/style.css`.

## Un proyecto en la nube

Un proyecto en la nube es un documento Yjs que mantiene un Durable Object, su sala. La sala combina
las ediciones de todos los dispositivos, las comprueba, las persiste y responde a los lectores, así
que hay un solo camino de escritura sea quien sea el que escribe: la página, otro dispositivo o un
push mediante la API. Los archivos también se materializan desde el documento a blobs
direccionados por contenido, que es sobre lo que trabajan las versiones, las copias y la
recolección semanal. La sala distingue propietarios, editores y lectores: un lector se conecta y
recibe cada cambio, y no puede escribir ([Compartir y permisos](#compartir-y-permisos)).

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
hash en `binaries` y un path en `paths`, y sus bytes viven en R2
([Almacenamiento](#almacenamiento)), nunca en el documento. Esos son los únicos tres tipos raíz: un
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
`@meltemi/diagrams-project` (`packages/project/src/files.ts`), que el playground reexporta y que
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

1. Quién pregunta, solo por la cookie: en un socket no se admite un token bearer, y una solicitud
   sin una cookie válida es `401 auth.required`.
2. De dónde viene el upgrade: su `Origin` debe ser el del propio servicio, o es
   `403 request.forbidden`.
3. Qué es la persona para el proyecto ([Roles](#roles)): `owner`, `editor` o `viewer`. Una persona
   a la que el proyecto no admite en absoluto, un proyecto que no existe y un id que no puede serlo
   responden todos `404 project.not-found`. Las personas anónimas nunca llegan hasta aquí: el
   socket necesita la cookie, y quien mira de forma anónima lee en cambio una instantánea mediante
   `GET …/files`.

La sala recibe una solicitud que construye el Worker: la dirección interna fija
`https://room/connect` y solo las cabeceras que establece el Worker, `X-Meltemi-Project`,
`X-Meltemi-Sub`, `X-Meltemi-Role` (el rol que el Worker determinó: `owner`, `editor` o `viewer`),
`X-Meltemi-Name` y `X-Meltemi-Picture` (las dos últimas codificadas como URL). No se reenvía nada
de la solicitud del navegador, ni su path ni ninguna cabecera, así que un `X-Meltemi-Role`
falsificado nunca llega a la sala. La sala lee el rol solo de la cabecera del Worker, trata un rol
desconocido como lo mínimo que puede ser una persona (`viewer`) y rechaza una conexión sin `sub`. La
identidad y un id de conexión aleatorio se guardan en el adjunto del socket, que sobrevive a la
hibernación.

El rol queda fijado cuando se abre el socket. Un lector recibe todo lo que escribe un editor, como
todo el mundo, y la primera actualización que envía un lector se rechaza: la sala lo avisa con
`access.denied` y cierra el socket con `4403`, y el documento y su revisión quedan como estaban. La
presencia no es una actualización: un lector la envía y la recibe como cualquiera
([Presencia](#presencia-awareness)). Un cambio de acceso corta los sockets que pueda haber dejado obsoletos, para que el rol se determine de
nuevo ([Cuando cambia el acceso](#cuando-cambia-el-acceso)).

Las rutas propias de la sala (`/files`, `/restore`, `/materialise`, `/destroy`, `/stats` y
`/disconnect`) solo responden a solicitudes que construye el Worker: `POST /rooms/<id>/destroy`
desde un navegador, con la cookie del propietario, es `404 not-found`, y la sala conserva su
documento y su revisión.

### El protocolo de la sala

Los mensajes son binarios; el primer byte es el tipo.

| Tipo | Nombre      | Sentido           | Contenido                                                                                                                                                                                                                                                                                                                                     |
| ---- | ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `sync`      | en ambos sentidos | Un vector de estado. De un cliente: la sala responde con un tipo 1 con lo que le falta al cliente (siempre, aunque no tenga nada que enviar). De la sala: su propio vector, enviado una vez después de `hello` y siempre que una actualización espera algo de lo que depende; el cliente responde con un tipo 1 con lo que le falta a la sala |
| 1    | `update`    | en ambos sentidos | Una actualización de Yjs. De un cliente, la sala la aplica como una transacción, sube la revisión, programa una escritura y una materialización, y la envía a todos los demás clientes; de la sala es un cambio que el cliente aplica como venido de fuera                                                                                    |
| 2    | `awareness` | en ambos sentidos | Presencia ([Presencia](#presencia-awareness)). De un cliente: su propio estado. De la sala: los estados de los demás clientes, cada uno con la identidad que la sala conoce del remitente, o `null` para un cliente que se ha ido. La sala solo lo retransmite                                                                                |
| 3    | `hello`     | sala a cliente    | JSON, una vez al conectar: `{ role, revision, limits, collisions, you }`                                                                                                                                                                                                                                                                      |
| 4    | `error`     | sala a cliente    | JSON `{ code }`, y después el socket se cierra                                                                                                                                                                                                                                                                                                |

`hello` dice qué es la persona para el proyecto, la revisión en la que está la sala, los límites que
impone, las colisiones del documento y cuál es esta conexión:

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
  "you": { "id": "9f3c2a71d04be856", "sub": "u_7d3f", "name": "Ana", "picture": "https://…" }
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

| Código de cierre | Código de error                                     | Cuándo                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4400             | `path.invalid`, `blob.unknown`, `doc.invalid`       | Una transacción, o un mensaje, que incumple una regla del documento; la transacción se revierte                                                                                                                                   |
| 4403             | `access.denied`                                     | Un lector envió una actualización                                                                                                                                                                                                 |
| 4404             | `project.not-found`                                 | El proyecto se eliminó mientras el cliente estaba conectado                                                                                                                                                                       |
| 4409             | `room.full`                                         | El 21.º cliente: no recibe `hello`                                                                                                                                                                                                |
| 4413             | `doc.too-large`, `quota.files`, `message.too-large` | Un texto de más de 2 Mi caracteres o un documento de más de 16 MiB, más de 2000 archivos, un mensaje de más de 512 KiB (por debajo del 1 MiB de la plataforma, para que la sala lo vea), un mensaje de presencia de más de 16 KiB |
| 4429             | `awareness.rate`                                    | Un cliente envió más de 100 mensajes de presencia en un segundo                                                                                                                                                                   |
| 4500             | `internal`                                          | La sala no pudo atender un mensaje                                                                                                                                                                                                |
| 4000             | ninguno                                             | La herramienta de desarrollo ([Las rutas de desarrollo](#las-rutas-de-desarrollo)), o un cambio de acceso ([Cuando cambia el acceso](#cuando-cambia-el-acceso)), cortó la conexión; no es un rechazo                              |

La página distingue una conexión caída de un rechazo: un cierre sin mensaje de tipo 4 y sin un
código de 4400 a 4429 es una caída, y reconecta al cabo de un segundo, duplicando hasta treinta; un
rechazo se muestra a la persona y el socket se reabre al cabo de medio segundo, duplicando si se
repite. `4404` no es ni una cosa ni la otra: el proyecto ya no existe, así que la página deja de
reconectar, lo dice y conserva lo que tiene.

Una sala que ya tiene 20 clientes rechaza al 21 con `room.full`, con una excepción: el propietario
y los editores entran mientras un lector ocupe un sitio. Ese lector cede su sitio y se le dice
`room.full` como si hubiera llegado el último; es el socket más reciente de la persona que más
sockets de lector tiene, de modo que una cuenta que abrió muchos sockets para mantener la sala
llena pierde primero los suyos. Un lector nunca entra por encima de nadie, y el propietario y los
editores son rechazados cuando los 20 son personas que pueden escribir.

### Presencia (awareness)

La presencia es lo que cada página cuenta a las demás sobre su persona: el archivo que tiene
abierto, dónde está su cursor o su selección en él y qué ha seleccionado en el lienzo. Viaja en
mensajes de tipo 2, y la sala solo los retransmite: nada de ello se escribe en el almacenamiento de
la sala, y no cambia ni el documento ni su revisión. [El playground](playground.md#trabajar-juntos)
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
    "canvas": { "selection": ["api", "db"] }
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
    "user": { "sub": "u_8a21", "name": "Ben", "picture": "https://…", "colour": "#1c7ed6" },
    "file": "k7h2m4n9p3q5r8s2",
    "caret": { "anchor": "AQID", "head": "AQIE" },
    "canvas": { "selection": ["api"] }
  }
}
```

El `user` es el de la sala y nunca el del cliente: el `sub`, el nombre y la imagen que el Worker dio
al socket cuando se abrió ([El socket](#el-socket)), diga lo que diga el mensaje, con como máximo
200 caracteres del `sub`, 100 del nombre y 500 de la dirección de la imagen. El `colour` sale del
`sub`: uno de doce, elegido con un hash FNV-1a de él (`presenceColour`, en
`@meltemi/diagrams-project`, que la página usa también), así que la sala y todas las páginas
coinciden y ningún cliente envía un color. Como la clave es la del propio remitente, un cliente
tampoco puede hablar por la entrada de otro. La página toma la identidad de una persona solo de este
`user`.

**Al conectar.** Después de `hello` y de su vector de estado, la sala envía al recién llegado un
mensaje de tipo 2 con los estados de los demás clientes, con la misma forma, leídos de los adjuntos
de los sockets: los de quienes han dado señales en los últimos treinta segundos, y ningún mensaje si
no hay ninguno. Los demás conocen al recién llegado por su primer estado, no al conectar. La
sala no guarda la selección del lienzo, así que el recién llegado la conoce por el siguiente estado
del remitente; una página envía su estado de nuevo cada quince segundos.

**Retirada.** `{ "<id>": null }`, de parte de la sala, dice que esa conexión ya no tiene estado. La
sala lo envía cuando un cliente envía `null` (si tenía un estado), cuando se cierra su socket (si
tenía uno) y cuando pasan treinta segundos sin un estado suyo. Ese plazo es una alarma: la sala la
fija para la hora de la última señal más antigua más treinta segundos y, cuando salta, descarta
todos los estados que tienen al menos esa antigüedad, avisa a cada cliente que queda (de los demás,
nunca de sí mismo) y fija la siguiente alarma para el estado más antiguo que queda. Los sockets
siguen abiertos, y un cliente que vuelve a enviar un estado ha vuelto. Una página envía un estado
cuando cambia, como máximo cuatro veces por segundo, y otra vez cada quince segundos como latido,
así que un estado de treinta segundos es el de una página que se fue.

**Hibernación.** La sala no guarda en memoria ninguna presencia que no pueda reconstruir. El adjunto
de cada socket contiene, junto a la identidad, el último estado del cliente como un registro
compacto: el color, el `file`, el `caret` codificado y cuándo se le oyó por última vez. La
plataforma limita un adjunto a 2 KiB, así que cuando un registro no cabe se descarta primero el
cursor y después el archivo. Un objeto que se desalojó y se construyó de nuevo sigue, por tanto,
enviando los estados al conectar y sabiendo cuándo descartarlos: la alarma sobrevive al objeto y
salta en el nuevo. Lo único que no se conserva es la cuenta de mensajes del último segundo: una sala
construida de nuevo cuenta desde cero.

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
- La presencia es igual para todos los que pueden conectarse: un lector la envía y la recibe como un
  editor, y solo se rechazan las actualizaciones de un lector ([El socket](#el-socket)).

Cada estado es un mensaje entrante para la sala, y la plataforma cuenta los mensajes entrantes de
WebSocket veinte a uno frente al presupuesto de solicitudes de un Durable Object en el plan gratuito.
La limitación (throttle) de la página y el tope de veinte clientes lo acotan: una sala llena en la
que se mueven todos los cursores envía como máximo 80 estados por segundo, y un cliente que solo
está ahí envía cuatro por minuto. Los contadores de desarrollo dicen cuántos llegaron
([Las rutas de desarrollo](#las-rutas-de-desarrollo)).

### Persistencia

La sala guarda el documento en el SQLite de su Durable Object, en dos tablas: `meta` (la revisión,
el número de fragmentos y el id del proyecto) y `doc_chunks` (`n`, `bytes`). Cuando se construye el
objeto lee `meta` y recompone el estado codificado a partir de los fragmentos; un almacenamiento
incompleto lanza un error en lugar de empezar vacío, porque la siguiente escritura haría permanente
la pérdida. La sala hace una sola cosa a la vez (un mensaje, un push, una lectura, un
temporizador), así que un lector nunca ve un cambio antes de que se haya comprobado.

Las escrituras son una limitación (throttle), no un debounce: el primer cambio tras un segundo de
calma se escribe enseguida, después como máximo una vez por segundo mientras siguen llegando
cambios, con una escritura más después del último; y en cualquier caso no más tarde de diez
segundos después del primer cambio que aún no está escrito, así que un cliente que nunca hace pausa
no puede aplazarla. Cuando se va el último cliente, la sala escribe enseguida. Una escritura guarda
todo el estado codificado en fragmentos de 1 MiB como máximo (un valor de SQLite de un Durable
Object tiene un tope de 2 MB) y la revisión, en una sola transacción de almacenamiento. Cuando el
almacenamiento rechaza una escritura, el documento se queda en memoria y la sala lo intenta de nuevo
un segundo después.

La revisión sube una unidad por cada actualización que la sala conserva (un mensaje de un cliente,
un push, una restauración) y se persiste con el documento, así que sigue contando tras un reinicio.
Una escritura o una materialización pendientes mantienen el objeto en memoria con su temporizador;
sin nada pendiente, el objeto puede hibernar entre mensajes, con sus sockets abiertos, y el
siguiente mensaje recarga el documento desde el almacenamiento.

La ventana de desalojo. Si la plataforma desalojara un objeto que tenía un cambio sin escribir, la
sala podría perder como máximo un segundo de ediciones, y diez para un cliente que nunca hace
pausa. La pérdida es transitoria: la página conserva las mismas actualizaciones en memoria y en
IndexedDB, los sockets reconectan, y la sala envía su vector de estado a cada cliente que se
conecta, así que la página responde con lo que le falta a la sala, tanto si la página siguió abierta
como si se recargó entretanto. La alternativa, añadir cada actualización como una fila, sería más
segura en esa ventana y cuesta miles de filas por sesión de escritura frente a un presupuesto diario
de cien mil.

### Lecturas y pushes

Los lectores leen de la sala, nunca de D1: la sala tiene el estado más reciente, y D1 puede ir
treinta segundos por detrás.

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

### Materialización

La materialización convierte el documento en las filas y los bytes que lee el resto del servicio:
`project_files` (path a hash), filas de `blobs` y objetos de R2. Se ejecuta treinta segundos después
del último cambio (la espera empieza de nuevo con cada cambio), cuando se va el último cliente,
cuando el Worker la pide antes de hacer o restaurar una versión, y justo después de crear o copiar
un proyecto. Una sala que nadie ha cambiado (revisión 0) no materializa nada, así que la sala de un
proyecto eliminado nunca puede devolver un proyecto vacío al almacén.

La sala ejecuta `materialise()` por sí misma, con su propio `env`: una clase de Durable Object vive
en el mismo script del Worker, así que llega directamente a `env.DB` y `env.BLOBS`, y no existe
ningún binding de servicio ni ruta pública para ello. Calcula el SHA-256 de los bytes UTF-8 de cada
archivo de texto, lee los `project_files` actuales y escribe solo la diferencia. R2 va primero (los
blobs nuevos bajo `blobs/<hash>`; un put es idempotente y repara un objeto que se perdió), después D1
en un solo paso atómico: las filas de `blobs` de los textos que traen los paths cambiados (una
fila que ya está recibe su hora renovada, en el batch que da su hash a un path, para que la
recolección semanal no pueda llevársela entre medias), los paths eliminados, los paths cuyo hash
cambió, y la `revision` y el `updated_at` del proyecto (solo cuando la revisión es una que el
proyecto aún no tiene: una sala reconstruida sobre un documento que ya había materializado, abierta
por alguien que solo miró, no escribe nada y no sube el proyecto en la lista), en sentencias de 100
parámetros enlazados como máximo (el límite de D1) divididas dentro de un solo `batch()`. Las imágenes y las fuentes se
guardaron por hash cuando se subieron. El mismo contenido tiene siempre el mismo hash: dos archivos
con un mismo texto, o un texto editado hasta volver a lo que era, comparten un blob, y editar un
archivo de cinco escribe un blob nuevo y una fila. Después se actualiza el uso de la cuenta, cuando
cambiaron archivos.

El orden es la garantía: una fila nunca nombra bytes que no están, y un fallo de R2 lanza el error
antes de tocar D1. Los bytes puestos en R2 en vano esperan a [la recolección](#la-recolección-de-blobs).
Un fallo nunca llega al documento: la sala lo conserva con su revisión, registra "the files could
not be materialised" sin contenido, y lo intenta de nuevo en su siguiente disparador. Tampoco se
retrasa a quien escribe, porque la sala solo espera a la instantánea y las escrituras siguen a su
lado. Una materialización que encuentra que su proyecto ya no existe no escribe nada salvo filas de
blobs.

Una vez escritas las filas, la primera materialización de un día UTC que encuentra los archivos
distintos de los de la última versión registra la versión diaria ([Versiones](#versiones)); un
fallo ahí se registra y nunca hace fallar la materialización.

## Almacenamiento

D1 guarda los metadatos, R2 los bytes, y cada sala su documento.

| Dónde                                      | Qué guarda                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects` (D1)                            | `id`, `owner_sub`, `name`, `description`, `created_at`, `updated_at`, `revision` (la de la sala en la última materialización), `thumbnail_at`, y `deleted_at`, que está reservado y nunca se establece: un proyecto se elimina del todo |
| `project_files`                            | Los archivos del proyecto en la última materialización: `(project_id, path)` a `hash`                                                                                                                                                   |
| `project_blobs`                            | `(project_id, hash)` por cada imagen o fuente subida a un proyecto, copiada por una duplicación y eliminada con el proyecto; la comprobación de hashes de la sala y las rutas de blobs la consultan, nunca el mapa vivo                 |
| `blobs`                                    | `hash` a `size`, `media_type` y `created_at`: una fila por contenido distinto, compartida por todos los proyectos y cuentas                                                                                                             |
| `versions`                                 | `id`, `project_id`, `number`, `label`, `auto`, `created_by`, `created_at`                                                                                                                                                               |
| `version_files`                            | Una copia de `project_files` cuando se hizo la versión                                                                                                                                                                                  |
| `users.storage_bytes` (D1)                 | Los bytes que usa una cuenta, siempre al día                                                                                                                                                                                            |
| `projects.link_access` (D1)                | Lo que da el enlace del proyecto: `private` (el valor por omisión), `view` o `edit`                                                                                                                                                     |
| `users.handle` (D1)                        | El nombre bajo el que publica la persona, `[a-z0-9-]{3,30}` y único; nulo hasta que elige uno                                                                                                                                           |
| `members`                                  | `(project_id, sub)` a `role` (`viewer` o `editor`) y `added_at`: una persona a la que el propietario dio un rol en un proyecto. El propietario no es una fila                                                                           |
| `invitations`                              | `id`, `project_id`, `email` (en minúscula), `role`, `token`, `created_by`, `created_at` y `accepted_at`, nulo mientras la invitación está pendiente                                                                                     |
| `publications`                             | `(project_id, slug)` a `handle`, `published_at` y `bytes`, con `(handle, slug)` único: la dirección de cada página que publica un proyecto                                                                                              |
| `takedowns`                                | `handle`, `slug`, `by_sub`, `reason`, `at` y `project_id`: lo que retiró un administrador, y por qué                                                                                                                                    |
| `publish_log`                              | `project_id` y `at`, una fila por cada solicitud de publicación de la última hora: lo que limita la frecuencia de publicar                                                                                                              |
| `meta`, `doc_chunks` (una sala)            | La revisión de la sala y su documento codificado en fragmentos, en el SQLite de su Durable Object                                                                                                                                       |
| R2, `blobs/<sha-256>`                      | Los bytes de cada blob: textos, imágenes y fuentes, por el SHA-256 hexadecimal en minúscula de su contenido                                                                                                                             |
| R2, `thumbs/<project id>.svg`              | La miniatura del proyecto, una por proyecto                                                                                                                                                                                             |
| R2, `published/<handle>/<slug>/index.html` | El HTML de cada publicación; la recolección semanal lista solo `blobs/` y nunca lo toca                                                                                                                                                 |

El esquema de los proyectos es `packages/cloud/migrations/0002_projects.sql`: seis tablas y una
columna, todas `STRICT`, sin claves foráneas, para que eliminar un proyecto o una persona sea
explícito y atómico. Las filas escritas son un presupuesto (D1 cuenta cada entrada de índice como
una fila): las tablas con una fila por archivo son `WITHOUT ROWID`, y el único índice además de las
claves es `projects_owner`. Un hash es un SHA-256 en hexadecimal en minúscula y la base de datos no
admite otra cosa.

`0003_sharing.sql` añade lo que guardan compartir y publicar, con las mismas convenciones: dos
columnas (`projects.link_access` y `users.handle`, esta con un índice único sobre las personas que
tienen uno), cinco tablas (`members`, `invitations`, `publications`, `takedowns` y `publish_log`),
todas `STRICT`, y ninguna clave foránea. La base de datos rechaza lo que una columna no puede
contener: un nivel de enlace, un rol, un alias o un slug de otra forma, un correo que no está en
minúscula, un token que no son 32 caracteres hexadecimales en minúscula. Sus índices sirven una
consulta cada uno: las membresías de una persona, las invitaciones de un proyecto, las invitaciones
de un correo, las solicitudes de publicación de un proyecto y el barrido. El `token` de una
invitación es el único secreto que el servicio guarda en claro, a propósito: el propietario vuelve a
copiar desde la lista el enlace de una invitación pendiente, así que el token tiene que poder
recuperarse. Es una capacidad del mismo tipo que el enlace de un proyecto que es `edit`, solo se le
muestra al propietario, nunca se registra, funciona una vez y durante treinta días, y se va
con su proyecto. Un token de API y un código de aprobación son distintos: de ellos solo se guardan
los hashes ([Tokens de API](#tokens-de-api)).

El uso por cuenta es la suma de `blobs.size` sobre los hashes distintos que referencian sus
`project_files`, `project_blobs` y `version_files`: un blob compartido por dos proyectos, o por un
proyecto y sus versiones, cuenta una sola vez. Se guarda en `users.storage_bytes` y se actualiza en
la materialización (cuando cambiaron archivos), al crear y al restaurar una versión, al subir y al
borrar una imagen o fuente y al eliminar un proyecto; `GET /api/account/usage` lo devuelve con los
recuentos.

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
  control; la descripción, como máximo 500. `template` es una de `flow`, `c4`, `sequence`, `free` y
  `purchase`, y da los archivos de la propia compilación del playground con su `project.json`,
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

## Compartir y permisos

Un proyecto tiene un nivel de enlace y miembros además de su propietario. El nivel del enlace es
`private` (el valor por omisión: solo el propietario y los miembros abren el proyecto), `view`
(cualquiera con el enlace puede verlo) o `edit` (cualquiera con sesión iniciada y el enlace puede
editarlo, y los demás lo ven). Los miembros son personas a las que el propietario nombró por correo,
cada una con un rol, `viewer` o `editor`. Una sola función, `access()` en `src/access.ts`, convierte
un proyecto, quién pregunta y el rol que se le dio a un miembro en lo que esa persona es para el
proyecto. Todas las rutas y el socket la consultan, y nada más decide. Nada se comparte por
accidente: un proyecto nuevo es `private`, y solo su propietario cambia quién puede abrirlo.

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

| Necesita                                                                  | Rutas                                                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage` (el propietario)                                                 | `PATCH` y `DELETE /api/projects/<id>`; `PATCH …/sharing`; `POST …/members`; `PATCH` y `DELETE …/members/<sub>`; `GET` y `DELETE …/invitations`; `GET`, `PUT` y `DELETE …/publish` |
| `write` (un editor)                                                       | `PUT …/files`; `PUT` y `DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/<n>/restore`                                                            |
| `read` (un lector; también personas anónimas cuando un enlace las admite) | `GET /api/projects/<id>`; `GET …/files`; `GET` y `HEAD …/blobs/<hash>`; `GET …/versions` y `…/versions/<n>`; `GET …/thumbnail`; `GET …/sharing`                                   |

Algunas rutas nombran otra cosa. `POST …/duplicate` necesita `read` y una persona, y hace la copia
en la cuenta de quien pregunta. `DELETE …/members/me` necesita una membresía.
`POST /api/invitations/<token>/accept` necesita una persona y el token, que es la prueba. El socket
necesita la cookie y después cualquier rol que el proyecto admita. `PATCH /api/account { handle }`
necesita una persona, con la cookie o un token, y la ruta de los administradores una cookie que
`ADMIN_SUBS` liste. Las rutas
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
propietario pueda volver a copiar el enlace desde la lista ([Almacenamiento](#almacenamiento)), y
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
Es todo lo que necesita quien mira de forma anónima, y todo lo que el servicio le da. El socket es
de las personas con sesión iniciada: un lector con sesión se conecta como tal, recibe cada cambio y
no puede escribir ([El socket](#el-socket)). Un proyecto que el enlace no admite es
`404 project.not-found` para las personas anónimas como para cualquier otra, lo que la página dice
como "no se encontró" y nada más. Cómo usa la página todo esto está en
[el playground](playground.md#ver-un-proyecto-compartido).

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

## Publicación

Un proyecto se publica como una página web: el catálogo HTML de sus diagramas e historias, que
construye la página (la misma compilación que la descarga del catálogo y que
`meltemi-diagrams build catalog`, [catálogo](catalog.md)) y envía al servicio. El servicio la guarda
y un segundo Worker la sirve en `https://<PUBLISH_HOST>/<handle>/<slug>/`, en un dominio propio. El
servicio nunca dibuja nada, y las páginas que sirve no pueden alcanzar la cookie de sesión, porque
el host no está bajo `meltemi.dev` ([decisión 0042](../decisions/0042-sharing-and-publishing.md)).
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

El host de publicación es un segundo Worker, mínimo. `src/publish.ts` es su lógica, una función de
una solicitud, un bucket y una base de datos, y `src/publish-worker.ts` es su punto de entrada;
`wrangler.publish.jsonc` lo configura con dos bindings, la base de datos D1 `DB` y el bucket de R2
`BLOBS` (los mismos que los del Worker principal), y nada más: ni recursos, ni Durable Object, ni
variables, ni secretos. Solo puede leer. Se ejecuta en el puerto 8789 con
`pnpm --filter @meltemi/diagrams-cloud exec wrangler dev -c wrangler.publish.jsonc`, sobre el mismo
estado persistido que `pnpm cloud:dev` (dale a ambos la misma carpeta `--persist-to`). Su dirección es el Custom Domain `meltemi.page`, que adjunta el Terraform de la familia
([Despliegue](#despliegue)); su configuración no tiene rutas ni dirección `workers.dev`.

Responde a `GET` y `HEAD` de `/<handle>/<slug>/` y de `/<handle>/<slug>/index.html`, para una
publicación cuya fila existe, y `404` a todo lo demás: `/`, `/playground.js`, `/api/…`, un alias o un
slug que no tiene la forma que hace el servicio, un path de otra forma, otro método, y
`/<handle>/<slug>` sin su barra final (una redirección sería una respuesta distinta de `404`, y la
dirección que se le da a una persona lleva la barra). Un path se lee tal como llegó, sin
decodificar ningún escape porcentual: una dirección tiene una sola forma de escribirse. Una página
se sirve con:

| Cabecera                                 | Por qué                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Content-Type: text/html; charset=utf-8` | Es una página, sean cuales sean los bytes guardados                                                                 |
| `Cache-Control: public, max-age=300`     | Cinco minutos: una actualización se ve pronto, y una página despublicada aún puede verse otro tanto desde una caché |
| `X-Content-Type-Options: nosniff`        | El navegador no la toma por otro tipo                                                                               |
| `Referrer-Policy: no-referrer`           | Un enlace de una página publicada no le dice a nadie de dónde viene quien lee                                       |

La política de la propia página es la etiqueta `meta` que escribió la compilación del catálogo
([catálogo](catalog.md#sin-conexión-por-diseño)); ninguna cabecera le añade nada. Todo `404` tiene el
mismo cuerpo, `Not found` como `text/plain`, con `Cache-Control: no-store` y los mismos `nosniff` y
`no-referrer`, así que una página publicada un momento después no queda oculta tras un `404` en caché
y nada le dice a un desconocido por qué una dirección está vacía. Un fallo del bucket o de la base de
datos es `500` con el cuerpo `Something went wrong`, y una fila cuya página falta en el bucket es
`404` y una línea en el registro. El Worker no lee ninguna cabecera de la solicitud, no establece
ninguna cookie y nunca responde una ruta de la API.

`PUBLISH_HOST` se lee donde se construye una dirección, y allí se rechaza (`500 internal`, con el
registro nombrando la variable) a menos que sea un nombre de host en minúscula con un punto y sin
esquema, puerto ni path, no sea el host del servicio, y no sea el dominio entre cuyos hosts se
comparte la cookie de sesión (el host del servicio de identidad sin su primera etiqueta,
`meltemi.dev`) ni esté bajo él. Es la regla de la decisión 0042 hecha mecánica: el único error de
configuración que serviría lo que publicó la gente desde un host que recibe la cookie no se puede
cometer en silencio. Un valor que el servicio no puede usar cuesta la publicación y nada más.

El Worker principal nunca sirve el host de publicación (su comprobación del `Host` responde `404` a
cualquier otro host). En desarrollo (`DEV`) sirve la misma página, con las mismas cabeceras, bajo
`/_published/<handle>/<slug>/` en su propio origen, para que las suites y quien ejecuta
`pnpm cloud:dev` vean lo que vería una visita: `GET` y `HEAD`, la dirección con o sin `index.html`, y
nada más; `/_published` es un prefijo reservado, así que cualquier otro path bajo él es el `404` en
JSON del Worker escrito como se escriba, y sin `DEV` lo es todo path bajo él. En producción la ruta
nunca sirve nada, porque una página que escribió una persona en el origen que tiene la cookie y la
API es justo lo que el host de publicación existe para evitar.

### Retirada

Un administrador del servicio retira cualquier publicación con
`DELETE /api/admin/publications/<handle>/<slug>`, con un `{ "reason" }` opcional (de 500
caracteres como máximo, con saltos de línea y tabuladores permitidos y ningún otro carácter de
control). Los administradores son los `sub` que lista `ADMIN_SUBS`, una variable separada por
comas; sin definir, no lo es nadie. Quien llama debe ser una persona de la lista con la cookie, así
que se aplica la regla de `Origin`: no se acepta un token de API ni siquiera de un administrador,
porque un token es para programas y se roba con más facilidad. Todos los demás, con sesión iniciada
o sin ella, reciben `404 not-found`, la respuesta de una ruta que no existe, y no `403`, que le diría
a un desconocido que la ruta está ahí.

La página se elimina primero y la retirada se escribe después, en un solo paso con la eliminación de
la fila: `takedowns (handle, slug, by_sub, reason, at, project_id)`, siendo el proyecto aquel desde el
que se publicó la página. Un fallo del bucket deja todo como estaba y
el administrador lo intenta de nuevo; un fallo posterior deja una fila sin página, que el host de
publicación no sirve y un segundo intento completa. La dirección responde entonces `404`, y el
propietario del proyecto ve la página, en `GET …/publish`, como retirada por el servicio. Las
retiradas son el registro del servicio y se quedan cuando se elimina una cuenta.

### Publicaciones y eliminación

Eliminar un proyecto elimina sus páginas (primero los objetos, después las filas junto con el
proyecto); eliminar la cuenta lo hace con cada proyecto de la persona
([Eventos de eliminación](#eventos-de-eliminación)). Despublicar y eliminar son del propietario: un
editor no puede publicar, ni tampoco un lector.

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

Un blob se va cuando nada lo ha referenciado durante siete días. Un cron semanal (`0 3 * * 0`: los
domingos a las 03:00 UTC, en `wrangler.jsonc`) ejecuta `scheduled` en `src/worker-handler.ts`, que
llama a `collectBlobs` (`src/collect.ts`). Tiene dos pasos, por este orden:

1. Filas. Las filas de `blobs` que ninguna fila de `project_files`, `project_blobs` o
   `version_files` referencia y que tienen más de siete días, de la más antigua a la más reciente,
   de 500 en 500 y como máximo 20 rondas. La fila se va primero, en un solo paso atómico que vuelve
   a comprobar que sigue sin referencias y que es antigua (un blob registrado o referenciado desde
   que se leyó la lista se queda), y los bytes después: un fallo entre ambos deja un objeto que
   ninguna fila nombra, nunca una fila sin bytes. Un objeto escrito desde el corte no se elimina:
   los mismos bytes se pusieron otra vez después de que se fuera la fila (una subida, una
   materialización), y quien los escribió los registra a continuación.
2. Huérfanos. Los objetos bajo `blobs/` que ninguna fila nombra y que tienen más de siete días,
   hallados listando el bucket (1000 por página, como máximo 20 páginas): lo que una materialización
   puso en R2 antes de que fallara su batch, y lo que el paso 1 no pudo eliminar.

Una fila que se registra otra vez (los mismos bytes subidos de nuevo) pasa a ser tan reciente como
ese momento, así que un blob que se acaba de volver a querer no se lo lleva. La ejecución registra
una línea (blobs eliminados, objetos borrados, huérfanos, borrados fallidos y si queda más para la
siguiente ejecución), y un fallo del almacén termina la ejecución con un error que la siguiente,
una semana después, termina de resolver.

Las carencias conocidas: solo se lista `blobs/`, así que una miniatura cuyo proyecto ya no existe
pero cuyo objeto nunca se borró se queda; una ejecución está acotada, así que una gran acumulación
tarda más de una semana; un blob de menos de siete días espera aunque nada lo referencie; y una
imagen quitada del documento de un proyecto sin un `DELETE …/binaries` correcto (la página lo llama
primero cuando está conectada y lo omite sin conexión) conserva su fila de `project_blobs`, así que
sus bytes se quedan y cuentan en el uso hasta que se elimina el proyecto.

## Configuración

`packages/cloud/wrangler.jsonc` contiene las variables y los bindings. Los secretos son del Secrets
Store de la familia, enlazados como `<NAME>_STORE` (`secrets_store_secrets`) y leídos en `<NAME>` una
vez por aislamiento en el punto de entrada del Worker (`src/secrets.ts`), así que los manejadores
leen cadenas. `.dev.vars` (véase `.dev.vars.example`) proporciona cada uno de ellos en desarrollo,
como cadenas, que siempre ganan a un binding.

### Variables y secretos

| Nombre                   | Tipo                | Significado                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                 | variable            | El origen del propio servicio, `https://diagrams.meltemi.dev`: el host que sirve, el `Origin` que acepta y la base de las direcciones que construye. Se ignora en desarrollo                                                                                         |
| `IDENTITY_ISSUER`        | variable            | El servicio de identidad, `https://id.meltemi.dev`: el `iss` del token de sesión, y el lugar de `/login`, `/logout`, `/account` y `/sessions/<sid>`                                                                                                                  |
| `IDENTITY_JWKS_URL`      | variable            | Dónde publica sus claves públicas el servicio de identidad                                                                                                                                                                                                           |
| `IDENTITY_EVENTS_SECRET` | secreto (Store)     | Verifica los eventos de eliminación; el `EVENTS_SECRET_DIAGRAMS` del servicio de identidad                                                                                                                                                                           |
| `FORMS_SECRET`           | secreto (Store)     | Firma el `csrf` de la página de aprobación y es la clave del hash de una dirección en el límite de frecuencia                                                                                                                                                        |
| `PUBLISH_HOST`           | variable, opcional  | El host que sirve las publicaciones, como `meltemi.page`: un nombre de host en minúscula de un dominio propio, nunca el host del servicio ni uno bajo el dominio de la cookie. `meltemi.page` en `wrangler.jsonc`; sin definir, publicar funciona solo en desarrollo |
| `ADMIN_SUBS`             | secreto (Store)     | Los `sub` de los administradores del servicio, separados por comas: quién puede retirar una publicación. Sin definir o vacía, nadie                                                                                                                                  |
| `DEV`                    | solo en `.dev.vars` | `"true"` activa el modo de desarrollo, más abajo                                                                                                                                                                                                                     |
| `IDENTITY_JWKS`          | solo en `.dev.vars` | Un conjunto de claves en línea, `{"keys":[…]}`, para desarrollo y pruebas                                                                                                                                                                                            |

Los bindings son:

| Binding  | Es                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`     | La base de datos D1, con sus migraciones en `packages/cloud/migrations`                                                                                             |
| `ASSETS` | La compilación de la página                                                                                                                                         |
| `BLOBS`  | El bucket de R2 `meltemi-diagrams-blobs`: `blobs/<sha-256>`, `thumbs/<project id>.svg` y `published/<handle>/<slug>/index.html`                                     |
| `ROOMS`  | El namespace de Durable Objects de la clase `ProjectRoom`, que exporta el punto de entrada del Worker; la migración `v1` de `wrangler.jsonc` la respalda con SQLite |

`wrangler.jsonc` contiene además el disparador cron de la recolección semanal, `0 3 * * 0`, y un
`alias` que hace que el Worker incluya en su paquete, desde sus fuentes, los paquetes del workspace
que importa. Los ids del archivo son marcadores de posición (todo ceros): el Terraform de la familia
crea la base de datos, el bucket y el Secrets Store y escribe sus ids como variables del entorno
`production` de este repositorio, y el flujo de despliegue los escribe antes de subir
([Despliegue](#despliegue)). Las dependencias del Worker en tiempo de
ejecución son el paquete de identidad, el paquete de proyectos de este repositorio y `yjs` (MIT).
Fuera del desarrollo, `ORIGIN`, `IDENTITY_ISSUER` e `IDENTITY_JWKS_URL` deben ser direcciones
`https:`; si no, cada solicitud es `500 internal` y el registro nombra la variable. `PUBLISH_HOST` y
`ADMIN_SUBS` son distintas: ninguna detiene el servicio, y cada una cuesta solo su propia función
cuando falta o no se puede usar (publicar, y las retiradas).

El host de publicación tiene su propia configuración, `packages/cloud/wrangler.publish.jsonc`, y
enlaza solo `DB` y `BLOBS`, la misma base de datos y el mismo bucket de arriba, para leerlos: ni
recursos, ni variables, ni secretos, ni Durable Objects
([El host de publicación](#el-host-de-publicación)). No aplica migraciones; las aplica la
configuración del Worker principal.

### Ajustes de desarrollo

`DEV` e `IDENTITY_JWKS` salen solo de `.dev.vars`, nunca de `wrangler.jsonc`, y una prueba falla si
`wrangler.jsonc` define cualquiera de los dos. `DEV` es desarrollo solo cuando vale exactamente
`"true"`. Entonces:

- el origen del servicio es el de la propia solicitud (`http://localhost:8788`), así que cualquier
  host pasa la comprobación del `Host`, y las direcciones de identidad pueden ser `http:`;
- se respeta el `IDENTITY_JWKS` en línea, de modo que una cookie firmada con claves de prueba se
  verifica sin servicio de identidad; fuera del desarrollo ni siquiera se lee, y una cookie firmada
  con esas claves cuenta como anónima. Uno que no es un conjunto de claves hace que cada solicitud
  sea `500 internal`, en lugar de dejar todas las cookies anónimas sin avisar;
- la comprobación horaria de la sesión consulta al servicio de identidad con un límite de medio
  segundo y pasa cuando el servicio no se puede alcanzar en absoluto, así que una cookie generada
  funciona sin que haya ninguno en marcha. Un servicio que responde no está ausente: `204` es una
  sesión viva, `404` una desaparecida, y cualquier otro estado es una sesión no válida que no se
  recuerda;
- las publicaciones no tienen host de publicación: sus direcciones son
  `<origin>/_published/<handle>/<slug>/` y el Worker las sirve ahí, así que no hace falta
  `PUBLISH_HOST`;
- existen las rutas de desarrollo de más abajo.

### Las rutas de desarrollo

Existen cuatro rutas para la suite del navegador y para quien desarrolla. Fuera del desarrollo
responden `404 not-found`, antes de mirar nada más (`config.ts` es el único lugar que lee `DEV`).
Cada una necesita una persona, y las tres de una sala necesitan al propietario del proyecto; la
regla de `Origin` se aplica a los `POST`.

- `GET /api/dev/rooms/<id>/stats` responde lo que la sala ha contado desde que se construyó su
  objeto (una sala que hibernó vuelve a contar desde cero):

  ```json
  {
    "revision": 41,
    "clients": 1,
    "storageWrites": 31,
    "materialisations": 2,
    "materialiseFailures": 0,
    "d1RowsWritten": 14,
    "messages": 212,
    "awareness": 140,
    "awarenessDropped": 0
  }
  ```

  `d1RowsWritten` es lo que informa `materialise()`, y `messages` los mensajes recibidos de los
  clientes. `awareness` es cuántos de ellos eran mensajes de presencia (tipo 2), los descartados y
  los no válidos incluidos, y `awarenessDropped` cuántos de ellos no retransmitió la sala: más de 20
  por segundo de un cliente, o que no eran un estado ([Presencia](#presencia-awareness)). La suite
  del navegador escribe durante un minuto y comprueba estos números.

- `POST /api/dev/rooms/<id>/disconnect` recibe un `{ id?, sub? }` opcional y cierra los sockets que
  nombra (todos los de la sala, sin cuerpo) con el código `4000`, que no es un rechazo, así que la
  página reconecta. Responde `{ closed }`. La suite lo usa para cortar un dispositivo y volver a
  conectarlo.
- `POST /api/dev/rooms/<id>/limits` recibe un `{ clients? }` opcional, un número entero de 1 a 20
  (cualquier otra cosa es `400 request.invalid`), y baja cuántos clientes admite la sala a partir de
  ese momento; sin cuerpo, o con `null`, vuelve el límite real. Responde `{ clients }`, el límite
  vigente. No se corta a nadie que esté conectado, el siguiente cliente que pase del límite se
  rechaza con `room.full`, y el `hello` de la sala nombra el límite reducido. El límite se guarda en
  el almacenamiento de la sala, así que sobrevive a una hibernación. La suite lo usa para ver al
  cliente número veintiuno rechazado con dos navegadores.
- `POST /api/dev/collect` recibe un `{ olderThanDays? }` opcional (un número desde 0; siete por
  omisión), ejecuta ahora [la recolección](#la-recolección-de-blobs) y responde lo que hizo:
  `{ rows, objects, orphans, failures, truncated }`. El disparador cron no se activa con
  `wrangler dev`.

Aquí cabe una quinta ruta, aunque no necesita ninguna persona: `GET` y `HEAD /_published/<handle>/<slug>/`
sirven una publicación desde el propio origen del Worker, con la página y las cabeceras que le da el
host de publicación ([El host de publicación](#el-host-de-publicación)). Responde `404 not-found` a
menos que `DEV` valga exactamente `"true"`, antes de mirar nada más.

### Dominios personalizados (Custom Domains)

`diagrams.meltemi.dev` y el host de publicación `meltemi.page` son Custom Domains de Workers, nunca
Routes. El Worker obtiene las claves del servicio de identidad y comprueba `GET /sessions/<sid>` en
`id.meltemi.dev`, que es un Worker de la misma zona de Cloudflare, y los Workers de una misma zona se
alcanzan entre sí con `fetch` solo mediante Custom Domains (si no, error 1042); con una Route no se
podría verificar ninguna sesión. Los dominios los declara el Terraform de la familia, con los Workers
que sirven; ni `wrangler.jsonc` ni `wrangler.publish.jsonc` tienen `routes`, y ambos mantienen
desactivados `workers_dev` y `preview_urls`, así que un despliegue nunca añade una dirección.

### Despliegue

Nada se despliega ni se configura desde una máquina ([decisión 0046](../decisions/0046-delivery.md)).

- **Lo que existe** está declarado en `packages/infra` del repositorio de Meltemi Web y lo aplica su
  canalización: las zonas, los Workers `meltemi-diagrams-cloud` y `meltemi-diagrams-publish` como
  entidades, sus Custom Domains, la base de datos D1 `meltemi-diagrams`, el bucket de R2, el Secrets
  Store con `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` (el `EVENTS_SECRET_DIAGRAMS` del servicio de
  identidad, el mismo valor por construcción) y `ADMIN_SUBS`, y el entorno `production` de este
  repositorio: un token de despliegue que solo puede subir Workers y migrar D1, y las variables
  `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` y `SECRETS_STORE_ID`.
- **Lo que se ejecuta** lo sube `.github/workflows/deploy.yml` en cada push a `main`:
  `scripts/deploy-config.mjs` escribe `wrangler.deploy.json` y `wrangler.publish.deploy.json` con los
  ids, luego se compila el playground, se aplican las migraciones (`wrangler d1 migrations apply DB
--remote`), y se suben el Worker principal y el de publicación con `wrangler deploy`. Una migración
  que falla no sube nada.
- **Volver atrás** es el mismo flujo lanzado a mano con un id de versión (y el Worker), que ejecuta
  `wrangler rollback`; o un revert enviado a `main`.
- **Un secreto** cambia en el Terraform de la familia; los Workers leen el valor nuevo cuando sus
  aislamientos se reinician. Nunca se ejecuta `wrangler secret put`.

## Ejecutarlo en local

El Worker escucha en `http://localhost:8788` y el servicio de identidad en `http://localhost:8787`.
Las cookies de `localhost` se comparten entre puertos, así que una sesión que establece el servicio
de identidad llega al Worker; eso vale solo en desarrollo. `.dev.vars` es obligatorio: sin él no se
define `DEV`, el origen del Worker es `ORIGIN` y toda solicitud en `localhost` es `404`.

### Con el servicio de identidad

1. Ejecuta el servicio de identidad desde el repositorio de Meltemi Web (`C:\meltemi` en la máquina
   del propietario). Su README, en "Signing in with GitHub and Google on this machine" (en inglés),
   tiene la configuración completa: las aplicaciones OAuth de desarrollo, `pnpm identity:keys` y
   `pnpm identity:migrate --local`. Después:

   ```bash
   pnpm identity:dev
   ```

   Su `.dev.vars` debe nombrar a este Worker: `DEV_ORIGINS` contiene `http://localhost:8788`,
   `PRODUCTS` contiene `{"name":"diagrams","events":"http://localhost:8788/_identity/events"}` y
   `EVENTS_SECRET_DIAGRAMS` contiene un texto aleatorio largo. Su `.dev.vars.example` ya tiene los
   dos primeros.

2. Copia `packages/cloud/.dev.vars.example` en `packages/cloud/.dev.vars` (Git lo ignora) y rellena
   los dos secretos: `IDENTITY_EVENTS_SECRET` toma el valor de `EVENTS_SECRET_DIAGRAMS` y
   `FORMS_SECRET` cualquier texto aleatorio largo.

   ```ini
   DEV=true
   IDENTITY_ISSUER=http://localhost:8787
   IDENTITY_JWKS_URL=http://localhost:8787/.well-known/jwks.json
   IDENTITY_EVENTS_SECRET=
   FORMS_SECRET=
   ```

3. Crea una vez la base de datos local, como explica [La base de datos](#la-base-de-datos). Las
   salas y el bucket de R2 no necesitan preparación ([Salas y bytes en local](#salas-y-bytes-en-local)).

4. Compila la página para el servicio de identidad local y arranca el Worker. `pnpm cloud:dev`
   ejecuta `pnpm playground:build` y después `wrangler dev`. La compilación toma el servicio de
   identidad de `PLAYGROUND_IDENTITY` (por omisión `https://id.meltemi.dev`) para el enlace de
   inicio de sesión de la página y para el `form-action` de su política; con el valor por omisión,
   la política impediría que el formulario **Cerrar sesión** se envíe a `localhost`.

   ```bash
   PLAYGROUND_IDENTITY=http://localhost:8787 pnpm cloud:dev
   ```

   En PowerShell:

   ```powershell
   $env:PLAYGROUND_IDENTITY = "http://localhost:8787"; pnpm cloud:dev
   ```

5. Abre `http://localhost:8788`, pulsa **Iniciar sesión**, elige un proveedor y vuelves con la
   sesión iniciada. Para ver llegar un evento de eliminación, elimina la cuenta en el servicio de
   identidad y ejecuta su entrega programada como describe su README.

Compartir y publicar no necesitan nada más. Una publicación hecha desde la página se sirve bajo
`http://localhost:8788/_published/<handle>/<slug>/`, donde la página muestra su dirección. Para
probar las invitaciones por correo, inicia sesión con una segunda cuenta (otro perfil del navegador)
cuyo correo haya verificado el proveedor; el enlace de una invitación funciona para cualquier
persona con sesión iniciada. Para probar una retirada, pon tu `sub` en `ADMIN_SUBS` de `.dev.vars` y
llama a la ruta de los administradores desde el propio origen de la página, ya que se le aplica la
regla de `Origin`.

### Sin él: una sesión generada

Una cookie firmada con claves de prueba basta para desarrollar la página y la API. `pnpm
cloud:dev-session` lo hace todo por ti: crea `packages/cloud/.dev.vars` (modo de desarrollo, un
conjunto de claves en línea y los dos secretos; Git lo ignora), guarda sus claves en
`.dev.vars.keys.json` para que una segunda ejecución siga firmando sesiones que el Worker acepta, e
imprime, para Ana y Ben, la línea de consola que inicia sesión en el navegador como ellos. Usa dos
perfiles del navegador para ser ambos a la vez; después compila la página para la dirección de
identidad local y arranca el Worker:

```bash
pnpm cloud:dev-session
PLAYGROUND_IDENTITY=http://localhost:8787 pnpm playground:build
pnpm cloud:migrate --local
pnpm --filter @meltemi/diagrams-cloud run dev
```

Para ver lo que hace la orden, o para crear una sesión a mano, guarda esto en `packages/cloud` como
`mint-session.mjs` (no lo incluyas en el repositorio) y ejecuta `node mint-session.mjs`:

```js
import { signSessionToken, testJwks, testKeys } from "@meltemi/identity/testing";

const keys = await testKeys();
// Una sesión de Ana para el servicio de identidad local, con un avatar del origen de este Worker.
const token = await signSessionToken(
  {
    sub: "dev-ana",
    name: "Ana",
    picture: "http://localhost:8788/favicon.svg",
    iss: "http://localhost:8787",
  },
  keys,
  new Date(),
);
// La primera línea va a .dev.vars; la segunda es la cookie que se establece en el navegador.
console.log(`IDENTITY_JWKS=${JSON.stringify(testJwks(keys))}`);
console.log(`meltemi_session=${token}`);
```

Añade a `.dev.vars` la línea `IDENTITY_JWKS=…` que imprime, junto a los ajustes anteriores, y
detén el servicio de identidad si está en marcha: respondería `404` para una sesión que no creó, y
el Worker rechazaría la cookie. Arranca el Worker como antes y, en `http://localhost:8788`,
establece la cookie desde la consola del navegador con
`document.cookie = "meltemi_session=<token>; path=/"`. Recarga: la cabecera muestra a Ana. La
política de la página permite un avatar de su propio origen o de los hosts de los proveedores, y por
eso la `picture` está en el origen del Worker. **Iniciar sesión**, **Cuenta** y **Cerrar sesión**
van todos al servicio de identidad, que no está en marcha: la cookie generada es lo que inicia tu
sesión, y borrarla es la forma de cerrarla.

### El paquete de identidad

El Worker verifica las sesiones con `@meltemi/identity`, que está enlazado y todavía no publicado:
`packages/cloud/package.json` apunta a `link:../../../../meltemi/packages/identity`, cuatro carpetas
por encima de `packages/cloud`, así que el repositorio de Meltemi Web debe estar clonado ahí. Sus
`exports` apuntan a `dist/`: instálalo y compílalo primero, y otra vez cuando cambie su verificador.
`pnpm install` en este repositorio lo avisa cuando falta la carpeta.

```bash
pnpm install
pnpm build
```

Ejecuta ambos comandos en el repositorio de Meltemi Web. El cambio de entrega publicará el paquete y
sustituirá el enlace.

### La base de datos

El esquema son tres migraciones. `packages/cloud/migrations/0001_accounts.sql` crea cinco tablas,
todas `STRICT` (`users`, `tokens`, `processed_events`, `cli_codes` y `cli_failures`). La base de
datos no guarda ningún token de API ni código de aprobación en claro (sus hashes son SHA-256 en
hexadecimal y no admite otra cosa) ni la dirección de ninguna persona. Por cada evento de
eliminación atendido, `processed_events` guarda el id del evento, el `sub` opaco de la persona y la
hora del evento, durante 31 días. `0002_projects.sql` añade las seis tablas de
[Almacenamiento](#almacenamiento) y la columna `storage_bytes` de `users`. `0003_sharing.sql` añade
las dos columnas y las cinco tablas de compartir y publicar, que [Almacenamiento](#almacenamiento)
también describe; el único secreto que guarda en claro es el token de una invitación pendiente.
`0004_takedown_project.sql` añade `takedowns.project_id`, para que una retirada sea el aviso del
proyecto del que se hizo y no de quien tenga el alias después. `pnpm cloud:migrate` aplica las migraciones que faltan; las lista y pide confirmación. Trabaja sobre la base de datos
local que usa `wrangler dev`. Las opciones van justo después del comando, sin un `--` antes:
`pnpm cloud:migrate --remote` las aplica a la base de datos de Cloudflare, y
`pnpm cloud:migrate --local` dice en voz alta lo que ya es el valor por omisión.

```bash
pnpm cloud:migrate
```

### Salas y bytes en local

`wrangler dev` ejecuta D1, R2 y los Durable Objects en tu máquina, sin nada que crear en Cloudflare
y sin cuenta en la que iniciar sesión: el bucket de R2 y el SQLite de las salas aparecen cuando se
usan por primera vez, y la migración `v1` de `wrangler.jsonc` basta para la clase `ProjectRoom`. Su
estado se guarda en `packages/cloud/.wrangler/state`, que Git ignora. Las salas y las filas de D1
describen los mismos proyectos, así que para empezar de cero hay que borrar esa carpeta entera: una
sala cuyo proyecto no tiene fila es inalcanzable, porque quién puede abrir un proyecto se determina
a partir de D1. El cron
semanal no se activa en local; `POST /api/dev/collect` ejecuta la recolección a demanda
([Las rutas de desarrollo](#las-rutas-de-desarrollo)).

## Pruebas

```bash
pnpm cloud:test
```

ejecuta las pruebas del Worker en Node: los manejadores con el almacén en memoria, salas en
memoria, un bucket de R2 simulado y sesiones firmadas con las claves de prueba de
`@meltemi/identity/testing`; la suite de almacenes sobre ambos (D1 sobre `node:sqlite`, omitida
cuando Node no lo tiene), que cubre también proyectos, archivos, blobs, versiones, uso y la
recolección; las migraciones y la configuración, `wrangler.jsonc` incluido; y la auditoría, que lee
esta página, entre otras, y falla cuando su tabla de errores y la del código difieren. Lo que añaden
a esto los proyectos en la nube, compartir, publicar y la presencia, por archivo en
`packages/cloud/test`:

| Suite                                                | Qué cubre                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`                                           | Los ids de archivo, `snapshot` y las colisiones, `applyFiles` y `restoreFiles`, y la validación de una transacción                                                                                                                                                                                                                                                                                                            |
| `room-core`                                          | La sala sobre un par de sockets simulados, un almacenamiento simulado y un reloj simulado: la limitación, los fragmentos, un documento de 3 MiB recargado, el protocolo, las actualizaciones que no cambian nada, cada rechazo y su código de cierre                                                                                                                                                                          |
| `room-hostile`                                       | Lo que un editor puede hacer a una sala con una actualización que ninguna página honesta envía: una estructura que espera a otra que nunca llega, un tipo raíz de otra forma, un documento pequeño codificado y pesado en memoria                                                                                                                                                                                             |
| `room-ops`, `room-storage`, `room-client`            | Lecturas, pushes, restauraciones, los disparadores de la materialización, destruir una sala, los contadores de desarrollo, el corte; el almacenamiento SQLite de la sala; las solicitudes que construye el Worker                                                                                                                                                                                                             |
| `rooms-routes`                                       | La ruta del socket (un `Origin` ajeno, sin cookie, un token, sin upgrade, un rol falsificado, las rutas internas), `GET` y `PUT …/files`, las rutas de desarrollo                                                                                                                                                                                                                                                             |
| `room-awareness`, `room-awareness-room`              | La presencia: el analizador de un estado, el registro que cabe en un adjunto y la frecuencia deslizante; y después la sala sobre sockets simulados: la retransmisión con la identidad del remitente (un `user` falsificado incluido), los estados al conectar, la hibernación, la retirada al cerrarse y a los treinta segundos, también tras un despertar, el tope de 16 KiB, la frecuencia y el límite de clientes reducido |
| `materialise`                                        | Solo se escribe lo que cambió, R2 antes que D1, una escritura de R2 rechazada deja la sala intacta, los disparadores de la sala                                                                                                                                                                                                                                                                                               |
| `projects`, `binaries`, `binary`                     | Proyectos (plantillas, archivos, cuota, duplicar, eliminar), subidas tipadas por sus bytes, la regla del SVG, las cabeceras de los blobs, la cuota de almacenamiento                                                                                                                                                                                                                                                          |
| `versions`, `versions-policy`, `thumbnails`, `usage` | Versiones (límite, frecuencia, restauración, la versión diaria), la política recorrida a lo largo de treinta y cinco días, miniaturas, uso                                                                                                                                                                                                                                                                                    |
| `collect`, `cascade`, `migration-projects`           | La recolección semanal y sus topes, la cascada de una cuenta eliminada, las restricciones de la migración                                                                                                                                                                                                                                                                                                                     |
| `projects-d1`, `versions-d1`                         | Las rutas de proyectos y versiones sobre D1 en `node:sqlite`, donde solo SQL puede fallar (la cuota atómica, el límite y la frecuencia, los lotes)                                                                                                                                                                                                                                                                            |
| `access`, `sharing-access`                           | La matriz de permisos celda por celda, y cada ruta de un proyecto para cada persona (el propietario, un editor, un lector, un desconocido con sesión, nadie) con cada nivel de enlace, en el orden de los rechazos, con el lector en la sala y los sockets que corta un cambio de acceso                                                                                                                                      |
| `sharing`                                            | El estado tal como lo ve cada persona, el nivel del enlace, las invitaciones y sus enlaces, aceptar, los miembros, salir, el límite de 50, los treinta días, el correo resuelto al iniciar sesión (verificado y no), la cascada de una cuenta eliminada                                                                                                                                                                       |
| `publish-routes`, `publish-host`                     | Los alias, publicar y despublicar, los límites y la frecuencia, quién puede, la retirada; el host de publicación sobre un bucket simulado y sobre el SQL real, sus cabeceras y su `404`, la ruta de desarrollo, y lo que mantiene mínimo al Worker (qué importa y qué enlaza)                                                                                                                                                 |
| `publishing-cascade`, `migration-sharing`            | Las publicaciones de una cuenta eliminada (objetos y filas) y todo lo demás de compartir que deja o quita; las restricciones de la tercera migración                                                                                                                                                                                                                                                                          |
| `store/conformance-sharing`, `store/d1-sharing`      | La parte de compartir del contrato del almacén sobre ambos almacenes, y lo que solo SQL puede hacer mal en ella (sentencias, restricciones, índices, carreras)                                                                                                                                                                                                                                                                |

Ninguna prueba de esta suite abre un socket: las salas se manejan sobre pares de sockets simulados.
La parte de la página de los proyectos en la nube también se prueba en Node, con simulaciones
(`packages/playground/test`: el documento, el binding de dos documentos a un Studio, deshacer, el
cliente de la sala, IndexedDB, los modelos del panel de proyectos y del panel de versiones, las
miniaturas; y para compartir, el modo de solo lectura y cada una de sus protecciones, abrir por
enlace, la instantánea, las copias, el modelo del diálogo de compartir para cada rol y el del
diálogo de publicar), y lo mismo la regla de los paths (`packages/project/test/files.test.ts`). Para
la colaboración, la misma carpeta prueba la presencia: su formato, los pares, las personas de la
cabecera, la geometría de los cursores sobre el código, la limitación (throttle) y el latido, y el
estado de una sala llena. El lienzo de solo lectura y la capa que dibuja las selecciones de otras
personas se prueban en la suite de la webview (`pnpm vscode:test-webview`). La clase del Durable
Object es solo conexión con la plataforma; se ejecuta con `wrangler dev` en la suite del navegador.

```bash
pnpm cloud:test-browser
```

compila la página con `http://localhost:8787` como su servicio de identidad, escribe una
configuración de prueba (`DEV=true` y un conjunto de claves en línea con las claves de prueba) en
una carpeta temporal, arranca `wrangler dev` en un puerto libre y maneja el Edge o el Chrome
instalado con `playwright-core`: la página anónima sin cambios, el enlace de inicio de sesión, una
sesión generada con las claves de prueba cuya imagen está en el origen del Worker, el menú de la
cuenta, crear y revocar un token, el rechazo por `Origin`, los eventos de eliminación sobre la base
de datos local real, la aprobación de la línea de comandos que llega a un listener en `127.0.0.1`
que intercambia el código, los rechazos y el límite de frecuencia, y que cada solicitud que hizo la
página fue a su propio origen. El Worker no debe imprimir nada salvo sus líneas de solicitud.

Para los proyectos en la nube, la suite pasa por la sala, D1 y R2 reales que ejecuta `wrangler dev`,
con un segundo dispositivo de la misma persona (otro contexto del navegador) donde un escenario lo
necesita:

- el panel de proyectos, en inglés y en español (la lista con una miniatura, un proyecto creado a
  partir de una plantilla, renombrar, duplicar y eliminar tras una confirmación); guardar en la nube
  el proyecto local editado; abrir un proyecto por su enlace y por una dirección que nombra uno que
  no se puede abrir; y la línea de estado cuando se rechaza el proyecto 101;
- la edición: una edición del lienzo que llega al texto de la sala; dos dispositivos que convergen;
  un cambio remoto que conserva el cursor y no entra en el deshacer; deshacer las propias ediciones
  (escribir, arrastrar y luego escribir dentro de 700 ms, Intro, un cambio de nombre entre
  archivos); y un archivo renombrado en un dispositivo mientras el otro escribe en él;
- la conexión: la sala cortada mediante la ruta de desarrollo y los sockets de la página fuera de
  alcance mientras cada dispositivo edita un archivo, y las dos ediciones en los dos documentos
  cuando vuelve la conexión; una recarga que abre el proyecto desde IndexedDB enseguida; un proyecto
  abierto sin conexión; y un proyecto eliminado desde otro dispositivo, que hace que la página deje
  de reconectar;
- las versiones (una etiqueta de 81 caracteres rechazada, una versión con nombre, una restauración
  que conserva el estado anterior como versión automática y no deja nada que deshacer) y la
  miniatura (enviada unos cinco segundos después de que se asiente el análisis, ninguna para un
  archivo con solo un `model`);
- imágenes y fuentes subidas por hash, servidas con sus cabeceras y mostradas en el otro
  dispositivo, y un SVG con un script que no ejecuta nada cuando se abre en la dirección de su blob,
  mientras que un `<img>` lo sigue mostrando;
- una transacción rechazada (un texto de más de 2 Mi caracteres se nombra en la línea de estado, el
  texto vuelve al de la sala y el socket se reabre) y un minuto de escritura, cuyos contadores,
  leídos mediante la ruta de desarrollo, se quedan entre 20 y 90 escrituras de almacenamiento, como
  máximo 3 materializaciones, como máximo 60 filas escritas en D1 y como máximo 300 mensajes.

Para compartir, ver y publicar pasa por el mismo Worker, D1, R2 y sala reales, con una persona por
cada contexto del navegador y las llamadas del propietario hechas desde Node para ver dónde fue a
parar cada cosa:

- ver por enlace: un proyecto `view` abierto donde nadie ha iniciado sesión se dibuja, reproduce
  una historia y exporta un SVG, el código y el lienzo rechazan toda edición, nada llega a la sala y
  nada se guarda en el navegador; la instantánea que dice pasados cinco minutos que el proyecto puede
  haber cambiado y muestra lo que cambió el propietario al volver a leerla; un enlace `private` que
  dice solo que no se encontró el proyecto, a nadie y a un desconocido por igual; **Hacer una copia**
  tras una confirmación, conservando lo que reemplaza como el proyecto anterior; **Guardar una copia
  en mis proyectos**; un enlace `edit`, que es la página normal para quien ha iniciado sesión y solo
  lectura para nadie, y un push sin cuenta rechazado con `401`; un lector con sesión que sigue la
  sala en vivo, no puede escribir, y cuyo socket se cierra con `4403` cuando envía una actualización,
  diga el rol que diga; y el acceso que cambia con una página abierta: un lector al que se hace
  editor edita, un editor al que se hace lector ya no puede escribir, y una persona quitada pierde el
  proyecto;
- el diálogo de compartir como propietario (cambiar el nivel, con lo que pueden hacer después nadie
  con sesión, un desconocido y los miembros observado por HTTP plano; una invitación hecha, copiada y
  revocada, una dirección no válida rechazada, un rol cambiado, una persona quitada tras una
  confirmación, el límite de cincuenta) y como miembro o como lector por enlace (el enlace, el rol,
  las personas por su nombre y **Salir** para un miembro, nunca una invitación, un correo ni un
  control que cambie algo); una invitación aceptada en otro navegador, una que conserva la dirección
  hasta que la persona inicia sesión, una no válida, y las invitaciones que se resuelven al iniciar
  sesión para el correo que verificó el proveedor y para ningún otro;
- la publicación: el diálogo que pide un alias la primera vez (uno ya en uso se rechaza con
  palabras), el catálogo que construye la exportación, la dirección bajo `/_published/`, lo que se
  sirve a una visita (el catálogo con las cabeceras de [El host de publicación](#el-host-de-publicación)
  y ninguna cookie), un nombre de página que ya tiene otro proyecto de la persona, despublicar, y una
  página que retiraron los administradores, mostrada como retirada por el servicio; y, pedido como
  lo pide un programa, el alias y su bloqueo en D1, la página en R2 con sus cabeceras exactas,
  reemplazada y despublicada, el límite de 16 MiB, la frecuencia, y la retirada, una ruta que es
  `404` para todos los demás. El host de publicación en sí, el segundo Worker, no lo arranca esta
  suite: la ruta de desarrollo sirve la misma página con las mismas cabeceras mediante la misma
  función, y el aislamiento del Worker se prueba en Node.

La colaboración también pasa por el mismo Worker y la misma sala reales, con dos contextos de
navegador, una persona en cada uno, en un mismo proyecto.

La suite sustituye la comprobación de sesión del servicio de identidad: un servidor pequeño en el
puerto 8787 responde `GET /sessions/<sid>` para las sesiones que genera. Ese puerto debe estar, por
tanto, libre. Si está ocupado, por ejemplo por `pnpm identity:dev`, la suite se detiene enseguida y
lo dice: ese servicio no conocería las sesiones que genera la suite. No necesita red, y deja en
`packages/playground/dist` la página compilada para `http://localhost:8787`; todo comando que sirve
la página la compila antes.

```bash
pnpm playground:test-browser
```

sirve en cambio la compilación con un servidor estático: la página anónima, `api/session`
respondiendo el `{"user":null}` estático, ningún error en la consola y ninguna solicitud fuera del
origen.

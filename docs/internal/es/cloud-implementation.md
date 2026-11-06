# Implementación y operaciones de la nube

[English](../cloud-implementation.md)

Notas para mantener e implementar el servicio; no son instrucciones de uso. La guía de producto está en [la documentación pública](../../es/cloud.md).

## Un Worker, un origen

`packages/cloud/wrangler.jsonc` le da al Worker como recursos estáticos la compilación de
la app, `packages/playground/dist` (el binding `ASSETS`, sin página de reserva), y hace que se
ejecute primero para los paths que responde él mismo (`run_worker_first`: `/api/*`, `/_identity/*`,
`/_published/*`, `/_sponsors/*`, `/cli-auth`, `/cli-auth/*`, `/p/*` y `/rooms/*`). Cualquier otro path lo sirve la
plataforma de recursos sin ejecutar el Worker. La página y la API son un solo origen: no hace falta
CORS, y la política de la página conserva `connect-src 'self'`.

### Los paths y el Host

`cloud()` reparte según el `Host` de la solicitud, que debe ser el host de `ORIGIN`:

| La solicitud                                                                                                                              | La respuesta                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Un path que responde una ruta (véase [Rutas](../../es/cloud.md#rutas))                                                                    | La ruta                                                                                       |
| Un path bajo `/api`, `/_identity`, `/_published`, `/_sponsors`, `/cli-auth`, `/p` o `/rooms` sin ruta, o un path conocido con otro método | `404 not-found` en JSON, nunca un recurso, escrito como se escriba (también `/%61pi/session`) |
| Cualquier otro path                                                                                                                       | El recurso estático (la página, sus scripts, sus fuentes), o el `404` de la plataforma        |
| Cualquier otro host, el host de publicación incluido                                                                                      | `404 not-found` en JSON: ni recursos ni API                                                   |

En desarrollo (`DEV`) el origen es el de la propia solicitud, así que una solicitud local siempre
pasa. El host de publicación nunca llega a este Worker: es otro Worker
([El host de publicación](../../es/cloud.md#el-host-de-publicación)). `/_published/` es el prefijo de la única ruta
de desarrollo que sirve una publicación desde este origen; sin `DEV`, todo path bajo él es el `404`
en JSON.

Los archivos propios de la página salen con dos cabeceras que la compilación de la app
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
  readonly fetch: typeof fetch; // el servicio de identidad: sus claves, su comprobación de sesión, su API de cuenta
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
   ([Compartir y permisos](../../es/cloud.md#compartir-y-permisos)).
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

## Persistencia

La sala guarda el documento en el SQLite de su Durable Object, en dos tablas: `meta` (la revisión,
el número de fragmentos y el id del proyecto) y `doc_chunks` (`n`, `bytes`). Cuando se construye el
objeto lee `meta` y recompone el estado codificado a partir de los fragmentos; un almacenamiento
incompleto lanza un error en lugar de empezar vacío, porque la siguiente escritura haría permanente
la pérdida. La sala hace una sola cosa a la vez (un mensaje, un push, una lectura, un
temporizador), así que un lector nunca ve un cambio antes de que se haya comprobado.

Las escrituras por WebSocket del servicio alojado son una limitación (throttle), no un debounce:
el primer cambio tras un segundo de calma se escribe enseguida, después como máximo una vez por
segundo mientras siguen llegando cambios, con una escritura más después del último; y en cualquier caso no más tarde de diez
segundos después del primer cambio que aún no está escrito, así que un cliente que nunca hace pausa
no puede aplazarla. Cuando se va el último cliente, la sala escribe enseguida. Una escritura guarda
todo el estado codificado en fragmentos de 1 MiB como máximo (un valor de SQLite de un Durable
Object tiene un tope de 2 MB) y la revisión, en una sola transacción de almacenamiento. Cuando el
almacenamiento rechaza una de estas escrituras, el documento se queda en memoria y la sala lo
intenta de nuevo un segundo después.

Los pushes y las restauraciones por HTTP guardan el documento candidato y su revisión antes de
confirmar la operación o retransmitirla a los clientes. Una escritura fallida rechaza esa
actualización y conserva el documento y la revisión anteriores. Una materialización explícita,
incluida la creación de versiones, también guarda el estado pendiente antes de confirmar. La
[distribución local](../../es/local-compose.md) configura su sala para guardar también las actualizaciones
por WebSocket antes de confirmarlas o retransmitirlas; la limitación del WebSocket alojado no cambia.

La revisión sube una unidad por cada actualización que la sala conserva (un mensaje de un cliente,
un push, una restauración) y se persiste con el documento, así que sigue contando tras un reinicio.
Una escritura o una materialización pendientes mantienen el objeto en memoria con su temporizador;
sin nada pendiente, el objeto puede hibernar entre mensajes, con sus sockets abiertos, y el
siguiente mensaje recarga el documento desde el almacenamiento.

La ventana de desalojo para las ediciones por WebSocket alojado. Si la plataforma desalojara un
objeto que tenía un cambio sin escribir, la sala podría perder como máximo un segundo de ediciones,
y diez para un cliente que nunca hace
pausa. La pérdida es transitoria: la página conserva las mismas actualizaciones en memoria y en
IndexedDB, los sockets reconectan, y la sala envía su vector de estado a cada cliente que se
conecta, así que la página responde con lo que le falta a la sala, tanto si la página siguió abierta
como si se recargó entretanto. La alternativa, añadir cada actualización como una fila, sería más
segura en esa ventana y cuesta miles de filas por sesión de escritura frente a un presupuesto diario
de cien mil.

## Materialización

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
antes de tocar D1. Los bytes puestos en R2 en vano esperan a [la recolección](../../es/cloud.md#la-recolección-de-blobs).
Un fallo nunca llega al documento: la sala lo conserva con su revisión, registra "the files could
not be materialised" sin contenido, y lo intenta de nuevo en su siguiente disparador. Tampoco se
retrasa a quien escribe, porque la sala solo espera a la instantánea y las escrituras siguen a su
lado. Una materialización que encuentra que su proyecto ya no existe no escribe nada salvo filas de
blobs.

Una vez escritas las filas, la primera materialización de un día UTC que encuentra los archivos
distintos de los de la última versión registra la versión diaria ([Versiones](../../es/cloud.md#versiones)); un
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
| `administrators`                           | `sub` a `invited_by` y `since`: una persona que aceptó la invitación de un propietario a administrar el servicio. Los propietarios no son filas                                                                                         |
| `admin_invitations`                        | `id`, `email` (en minúscula), `invited_by`, `created_at`, `expires_at` (siete días después), y `accepted_at`, `declined_at` y `revoked_at`, con una de ellas como mucho: la invitación de un propietario a administrar                  |
| `admin_log`                                | `id`, `at`, `by_sub`, `action`, `target_sub`, `target_email` y `detail`: cada acto de administración, añadido junto con él y nunca cambiado                                                                                             |
| `sponsorships`                             | `id`, `delivery_id` (único), `sponsor_login`, `sponsor_id`, `sponsor_type`, `one_time`, `amount_cents`, `privacy`, `status`, `created_at`, y `claimed_by_sub` y `claimed_at`, ambos nulos hasta que una cuenta lo reclama               |
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
los hashes ([Tokens de API](../../es/cloud.md#tokens-de-api)).

`0007_sponsorships.sql` añade `sponsorships`, `STRICT` y sin claves foráneas: las donaciones de las
que GitHub Sponsors avisó al servicio ([Patrocinios](../../es/cloud.md#patrocinios)). `sponsor_login` se compara sin
distinguir mayúsculas (`COLLATE NOCASE`) y tiene índice para la reclamación, `claimed_by_sub` para la
de una eliminación, y `delivery_id` es único, lo que hace de una entrega repetida algo sin efecto. La
base de datos rechaza un estado, un nivel de privacidad o un tipo que no conoce, un importe
negativo, un usuario de más de 39 caracteres y una reclamación sin su hora.

`0006_administrators.sql` añade lo que guarda la administración del servicio, con las mismas
convenciones: tres tablas (`administrators`, `admin_invitations` y `admin_log`), todas `STRICT`, y
ninguna clave foránea. Los propietarios no se guardan: son el secreto `ADMIN_SUBS`, que se lee en
cada solicitud. La base de datos rechaza el correo de una invitación que no está en minúscula, un id
que no son 32 caracteres hexadecimales en minúscula, una invitación terminada de dos maneras y una
acción del registro que no conoce. Sus tres índices sirven una consulta cada uno: la invitación
pendiente de un correo (`admin_invitations_email`), las invitaciones que hizo una persona eliminada
(`admin_invitations_invited_by`) y las últimas entradas del registro y su barrido (`admin_log_at`).
Una invitación a administrar no tiene token: su destinatario es quien inicia sesión con su correo
verificado.

El uso por cuenta es la suma de `blobs.size` sobre los hashes distintos que referencian sus
`project_files`, `project_blobs` y `version_files`: un blob compartido por dos proyectos, o por un
proyecto y sus versiones, cuenta una sola vez. Se guarda en `users.storage_bytes` y se actualiza en
la materialización (cuando cambiaron archivos), al crear y al restaurar una versión, al subir y al
borrar una imagen o fuente y al eliminar un proyecto; `GET /api/account/usage` lo devuelve con los
recuentos.

## Configuración

`packages/cloud/wrangler.jsonc` contiene las variables y los bindings. Los secretos son del Secrets
Store de la familia, enlazados como `<NAME>_STORE` (`secrets_store_secrets`) y leídos en `<NAME>` una
vez por aislamiento en el punto de entrada del Worker (`src/secrets.ts`), así que los manejadores
leen cadenas. `.dev.vars` (véase `.dev.vars.example`) proporciona cada uno de ellos en desarrollo,
como cadenas, que siempre ganan a un binding.

### Variables y secretos

| Nombre                    | Tipo                | Significado                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                  | variable            | El origen del propio servicio, `https://diagrams.meltemi.dev`: el host que sirve, el `Origin` que acepta y la base de las direcciones que construye. Se ignora en desarrollo                                                                                                                                        |
| `IDENTITY_ISSUER`         | variable            | El servicio de identidad, `https://id.meltemi.dev`: el `iss` del token de sesión, y el lugar de `/login`, `/logout`, `/account` y `/sessions/<sid>`                                                                                                                                                                 |
| `IDENTITY_JWKS_URL`       | variable            | Dónde publica sus claves públicas el servicio de identidad                                                                                                                                                                                                                                                          |
| `IDENTITY_EVENTS_SECRET`  | secreto (Store)     | El secreto de este producto con el servicio de identidad, su `EVENTS_SECRET_DIAGRAMS`: verifica los eventos de eliminación y firma las llamadas de [los datos de identidad](../../es/cloud.md#los-datos-de-identidad)                                                                                               |
| `FORMS_SECRET`            | secreto (Store)     | Firma el `csrf` de la página de aprobación y es la clave del hash de una dirección en el límite de frecuencia                                                                                                                                                                                                       |
| `PUBLISH_HOST`            | variable, opcional  | El host que sirve las publicaciones, como `meltemi.page`: un nombre de host en minúscula de un dominio propio, nunca el host del servicio ni uno bajo el dominio de la cookie. `meltemi.page` en `wrangler.jsonc`; sin definir, publicar funciona solo en desarrollo                                                |
| `ADMIN_SUBS`              | secreto (Store)     | Los `sub` de los propietarios del servicio, separados por comas: siempre administradores, y los únicos que invitan y quitan administradores ([Administración](../../es/cloud.md#administración)). Sin definir o vacía, nadie administra el servicio                                                                 |
| `SPONSORS_ACCOUNT`        | variable, opcional  | El usuario de GitHub de la cuenta patrocinada (`askenaz`): el `support` de la respuesta de sesión es su página de Sponsors y `/_sponsors/github` acepta sus entregas ([Patrocinios](../../es/cloud.md#patrocinios)). Vacía en `wrangler.jsonc` hasta que se hagan los pasos del propietario: sin camino de donación |
| `SPONSORS_WEBHOOK_SECRET` | secreto (Store)     | El secreto del webhook de Sponsors, el que se escribe en el formulario de GitHub: verifica la `X-Hub-Signature-256` de cada entrega. El Terraform de Meltemi Web lo recibe como `sponsors_webhook_secret`; en blanco, se rechaza toda entrega                                                                       |
| `PRODUCT_NAME`            | variable            | Como qué se firman las llamadas de [los datos de identidad](../../es/cloud.md#los-datos-de-identidad), la entrada de este Worker en los productos del servicio de identidad: `diagrams` en `wrangler.jsonc` (y sin definir), `diagrams-staging` para el Worker de staging                                           |
| `DEV`                     | solo en `.dev.vars` | `"true"` activa el modo de desarrollo, más abajo                                                                                                                                                                                                                                                                    |
| `IDENTITY_JWKS`           | solo en `.dev.vars` | Un conjunto de claves en línea, `{"keys":[…]}`, para desarrollo y pruebas                                                                                                                                                                                                                                           |

Los bindings son:

| Binding  | Es                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`     | La base de datos D1, con sus migraciones en `packages/cloud/migrations`; el servidor de autorización del endpoint MCP guarda su estado en su tabla `oauth_store` ([Autorización](../../es/cloud.md#autorización)) |
| `ASSETS` | La compilación de la página                                                                                                                                                                                       |
| `BLOBS`  | El bucket de R2 `meltemi-diagrams-blobs`: `blobs/<sha-256>`, `thumbs/<project id>.svg` y `published/<handle>/<slug>/index.html`                                                                                   |
| `ROOMS`  | El namespace de Durable Objects de la clase `ProjectRoom`, que exporta el punto de entrada del Worker; la migración `v1` de `wrangler.jsonc` la respalda con SQLite                                               |

`wrangler.jsonc` contiene además el disparador cron de la recolección semanal, `0 3 * * SUN`, y un
`alias` que hace que el Worker incluya en su paquete, desde sus fuentes, los paquetes del workspace
que importa. Los ids del archivo son marcadores de posición (todo ceros): el Terraform de la familia
crea la base de datos, el bucket y el Secrets Store y escribe sus ids como variables del entorno
`production` de este repositorio, y el flujo de despliegue los escribe antes de subir
([Despliegue](cloud-implementation.md#despliegue)). No hay ningún namespace de KV, y el despliegue rechaza una
configuración que enlace uno. `compatibility_flags` contiene `global_fetch_strictly_public`, que el servidor de
autorización necesita antes de leer un documento de metadatos de client-id. Las dependencias del Worker en tiempo de
ejecución son el paquete de identidad, el paquete de proyectos de este repositorio y `yjs` (MIT).
Fuera del desarrollo, `ORIGIN`, `IDENTITY_ISSUER` e `IDENTITY_JWKS_URL` deben ser direcciones
`https:`; si no, cada solicitud es `500 internal` y el registro nombra la variable. `PUBLISH_HOST`,
`ADMIN_SUBS` y `SPONSORS_ACCOUNT` son distintas: ninguna detiene el servicio, y cada una cuesta solo
su propia función cuando falta o no se puede usar (publicar, la administración del servicio y el
camino de donación).

Los dos Workers conservan sus propias líneas de registro (`observability.logs.enabled`) y ningún
registro de invocaciones (`invocation_logs: false`): un registro de invocación guarda la dirección de
cada solicitud, y algunas direcciones dan acceso (`/api/invitations/<token>/accept`, una página
abierta con `?invite=` o `?live=`). Ninguna línea que registra el Worker contiene una dirección, un
token, un id de sesión, el enlace de una invitación o de una sesión en vivo ni un código OAuth;
`test/logs.test.ts` recorre las rutas que los llevan y lee cada línea.

El host de publicación tiene su propia configuración, `packages/cloud/wrangler.publish.jsonc`, y
enlaza solo `DB` y `BLOBS`, la misma base de datos y el mismo bucket de arriba, para leerlos: ni
recursos, ni variables, ni secretos, ni Durable Objects
([El host de publicación](../../es/cloud.md#el-host-de-publicación)). No aplica migraciones; las aplica la
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
  por segundo de un cliente, o que no eran un estado ([Presencia](../../es/cloud.md#presencia-awareness)). La suite
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
  omisión), ejecuta ahora [la recolección](../../es/cloud.md#la-recolección-de-blobs) y responde lo que hizo:
  `{ rows, objects, orphans, failures, truncated }`. El disparador cron no se activa con
  `wrangler dev`.

Aquí cabe una quinta ruta, aunque no necesita ninguna persona: `GET` y `HEAD /_published/<handle>/<slug>/`
sirven una publicación desde el propio origen del Worker, con la página y las cabeceras que le da el
host de publicación ([El host de publicación](../../es/cloud.md#el-host-de-publicación)). Responde `404 not-found` a
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

Nada se despliega ni se configura desde una máquina ([decisión 0046](../../decisions/0046-delivery.md)).

- **Lo que existe** está declarado en `packages/infra` del repositorio de Meltemi Web y lo aplica su
  canalización: las zonas, los Workers `meltemi-diagrams-cloud` y `meltemi-diagrams-publish` como
  entidades, sus Custom Domains, la base de datos D1 `meltemi-diagrams`, el bucket de R2, el Secrets
  Store con `FORMS_SECRET`, `IDENTITY_EVENTS_SECRET` (el `EVENTS_SECRET_DIAGRAMS` del servicio de
  identidad, el mismo valor por construcción) y `ADMIN_SUBS`, y el entorno `production` de este
  repositorio: un token de despliegue que solo puede subir Workers y migrar D1, y las variables
  `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID` y `SECRETS_STORE_ID`.
- **Lo que se ejecuta** lo sube `.github/workflows/deploy.yml` después de una CI correcta del push
  a `main`, desde ese SHA exacto con su versión automática. Una fuente superada se omite antes de
  las migraciones y subidas:
  `scripts/deploy-config.mjs` escribe `wrangler.deploy.json` y `wrangler.publish.deploy.json` con los
  ids, luego se compila la app, se aplican las migraciones (`wrangler d1 migrations apply DB
--remote`), y se suben el Worker principal y el de publicación con `wrangler deploy`. Una migración
  que falla no sube nada.
- **Volver atrás** es un revert enviado a `main` que pasa CI, o una operación explícita de
  `wrangler rollback` en Cloudflare con el propietario. La recuperación recibe un id de CI correcta;
  nunca la omite ni revierte migraciones ([releases](../../../RELEASING.md)).
- **Un secreto** cambia en el Terraform de la familia; los Workers leen el valor nuevo cuando sus
  aislamientos se reinician. Nunca se ejecuta `wrangler secret put`.

**Staging.** El despliegue sube primero los gemelos de staging, `meltemi-diagrams-staging`
(`https://staging.diagrams.meltemi.dev`) y `meltemi-diagrams-publish-staging`
(`staging.meltemi.page`), con los ids del entorno `staging` y `PRODUCT_NAME` `diagrams-staging`,
ejecuta `pnpm acceptance:mcp` contra ellos y solo despliega producción si pasa. Sin los tokens de
prueba del propietario (`MELTEMI_TOKEN`, `MELTEMI_TOKEN_2`) solo se ejecutan las comprobaciones que no
necesitan una cuenta: los metadatos, el desafío y los rechazos.

## Ejecutarlo en local

Para un espacio instalable sin IDP, cookies de prueba ni tokens, usa [Docker Compose](../../es/local-compose.md).
Las instrucciones siguientes son el flujo manual de desarrollo de la implementación alojada.

El Worker escucha en `http://localhost:8788` y el servicio de identidad en `http://localhost:8787`.
Las cookies de `localhost` se comparten entre puertos, así que una sesión que establece el servicio
de identidad llega al Worker; eso vale solo en desarrollo. `.dev.vars` es obligatorio: sin él no se
define `DEV`, el origen del Worker es `ORIGIN` y toda solicitud en `localhost` es `404`.

### Con el servicio de identidad

1. Ejecuta el servicio de identidad desde el repositorio de Meltemi Web (`C:\meltemi\web` en la máquina
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

3. Crea una vez la base de datos local, como explica [La base de datos](cloud-implementation.md#la-base-de-datos). Las
   salas y el bucket de R2 no necesitan preparación ([Salas y bytes en local](cloud-implementation.md#salas-y-bytes-en-local)).

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
persona con sesión iniciada. Para probar la administración, pon tu `sub` en `ADMIN_SUBS` de
`.dev.vars`: el menú ofrece el enlace a la Administración central. Configura el binding privado de
la consola de desarrollo de Identity para este Worker si quieres probar sus formularios; el
[protocolo del servicio](../../es/central-administration-service.md) documenta el entrypoint y la separación
de entornos. Las llamadas directas a la API conservan la regla de Origin propio del producto.

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

El Worker verifica las sesiones con `@meltemi/identity`, publicado en npm con procedencia por el
flujo de publicación del repositorio de Meltemi Web; `packages/cloud/package.json` depende de
`^0.1.0`, y `pnpm install` lo descarga como cualquier otro paquete. Mientras su verificador cambia,
trabaja contra una copia del repositorio de Meltemi Web, sin confirmar el enlace:

```bash
pnpm --filter @meltemi/diagrams-cloud link ../../meltemi-web/packages/identity
```

Compílalo allí primero (`pnpm build`), y otra vez tras cada cambio: los `exports` del paquete
apuntan a `dist/`.

### La base de datos

El esquema son tres migraciones. `packages/cloud/migrations/0001_accounts.sql` crea cinco tablas,
todas `STRICT` (`users`, `tokens`, `processed_events`, `cli_codes` y `cli_failures`). La base de
datos no guarda ningún token de API ni código de aprobación en claro (sus hashes son SHA-256 en
hexadecimal y no admite otra cosa) ni la dirección de ninguna persona. Por cada evento de
eliminación atendido, `processed_events` guarda el id del evento, el `sub` opaco de la persona y la
hora del evento, durante 31 días. `0002_projects.sql` añade las seis tablas de
[Almacenamiento](cloud-implementation.md#almacenamiento) y la columna `storage_bytes` de `users`. `0003_sharing.sql` añade
las dos columnas y las cinco tablas de compartir y publicar, que [Almacenamiento](cloud-implementation.md#almacenamiento)
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
([Las rutas de desarrollo](cloud-implementation.md#las-rutas-de-desarrollo)).

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
  sirve a una visita (el catálogo con las cabeceras de [El host de publicación](../../es/cloud.md#el-host-de-publicación)
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

Un token de acceso del servidor de autorización del endpoint MCP ([Autorización](../../es/cloud.md#autorización)) no
es un token de API: está ligado a `/mcp` y no abre nada más, así que en cualquier otra ruta es
`401 token.invalid`, como cualquier bearer que el servicio no guarde.

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
necesita una persona responde entonces `401 auth.required`. Una cookie que se verifica guarda su
token en el principal; solo lo leen las rutas de [los datos de identidad](../../es/cloud.md#los-datos-de-identidad),
para presentarlo al servicio de identidad en nombre de la persona.

Una sesión emitida antes de que su persona fuera eliminada tampoco cuenta. El verificador confía en
una sesión viva durante una hora, y en esa hora la pestaña abierta de la persona eliminada crearía
de nuevo su fila y haría tokens. Por eso, para una cookie verificada, el Worker pregunta si se
atendió una eliminación de ese `sub` en el momento en que se emitió la sesión o después (véase
[Eventos de eliminación](../../es/cloud.md#eventos-de-eliminación)); si es así, la solicitud continúa como anónima y
no se crea ninguna fila. Una persona que inicia sesión de nuevo tiene una sesión posterior y no se
ve afectada.

### Usuarios

Desde la primera solicitud autenticada con la cookie, el Worker guarda una fila de usuario por
`sub`, con una copia del `name`, el `picture`, el `email` y el `email_verified` del token. Cada
solicitud los compara con la fila y la actualiza cuando difieren, así que un nuevo inicio de sesión
con otro nombre u otra imagen la actualiza. La fila guarda además lo que el token no lleva: el
alias de la persona, una vez que lo eligió ([Alias](../../es/cloud.md#alias)), y los permisos que un propietario o
un administrador concedió a la cuenta, como exportar sin la marca de Meltemi, con quién lo hizo y
cuándo ([Habilitaciones](../../es/cloud.md#habilitaciones)). La fila de una persona eliminada se borra, no se marca.

## Los datos de identidad

El panel de la cuenta muestra lo que solo el servicio de identidad guarda de una persona, sus
inicios de sesión y sus sesiones, y la página nunca habla con el servicio de identidad: le pregunta
a este Worker, que llama a la API de cuenta del servicio de identidad en nombre de la persona
([decisión 0049](../../decisions/0049-account-panel.md)).

- `GET /api/account/identity` responde la vista del servicio de identidad tal como es:
  `{ "user", "identities": [{ "provider", "email", "emailVerified", "handle", "linkedAt" }],
"sessions": [{ "sid", "label", "createdAt", "lastSeen", "expiresAt", "current" }], "canUnlink" }`,
  con `"claimed": true` al lado cuando un inicio de sesión de GitHub de la vista reclamó una
  donación ([Patrocinios](../../es/cloud.md#patrocinios)), tras lo cual la página vuelve a leer la respuesta de
  sesión.
- `POST /api/account/identity/unlink` con `{ "provider" }`,
  `POST /api/account/identity/sessions/revoke-others` y
  `POST /api/account/identity/sessions/<sid>/revoke` responden la misma vista después del cambio.

Solo puede llamarlas una persona con sesión iniciada en la página: un token de API es `403
request.forbidden` (una automatización no gestiona la cuenta) y nadie es `401 auth.required`; la
regla de `Origin` se aplica a los tres `POST`. Cada llamada al servicio de identidad lleva el token
de sesión de la persona, el valor de la cookie, como `Authorization: Bearer`, y la firma de este
producto: `Meltemi-Product: diagrams`, `Meltemi-Timestamp` y `Meltemi-Signature`, hechas por
`signProductRequest` de `@meltemi/identity` con `IDENTITY_EVENTS_SECRET`, el secreto que este
producto comparte con el servicio de identidad y que ya verifica sus eventos de eliminación. Los
rechazos del servicio de identidad sobre los que actúa el panel conservan su código
(`identity.last`, `provider.unknown`, `session.current`, `session.not-found`, `rate.limited`); una
sesión que terminó en el servicio de identidad es `401 auth.required`; ninguna respuesta en cinco
segundos, una respuesta que no es la vista o una firma rechazada es `502 identity.unavailable`, que
se registra con la ruta y el estado, nunca con un cuerpo. Vincular un proveedor y eliminar la
cuenta no están aquí: el panel lleva a la persona a las páginas propias del servicio de identidad,
que la traen de vuelta.

## Eventos de eliminación

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
  proyectos de otras, cuyos sockets abiertos allí se cortan; las invitaciones dirigidas al correo de
  su fila de usuario cuando el servicio de identidad lo había verificado; su fila de administrador y
  las invitaciones a administrar que hizo y nadie respondió; y sus reclamaciones de patrocinios, que
  vuelven a quedar sin reclamar) y registra el evento: su id, el `sub` y
  su hora. Después revoca las concesiones OAuth que la persona aprobó antes de la eliminación
  ([Aplicaciones conectadas](../../es/cloud.md#aplicaciones-conectadas)), cuyos tokens se rechazan desde entonces, y
  responde `200` con el estado `applied`. Las filas de `blobs` se comparten por
  contenido y se quedan; la [recolección](../../es/cloud.md#la-recolección-de-blobs) semanal se lleva las que nada más
  referencia. Las retiradas y el registro de administración también se quedan: son el registro del
  servicio ([Retirada](../../es/cloud.md#retirada), [El registro de administración](../../es/cloud.md#el-registro-de-administración)).
  Una invitación a administrar dirigida al correo de la persona se queda hasta que caduca: un correo
  no es una cuenta. La entrega
  es al menos una vez, así que la repetición del mismo id de evento no cambia nada y responde `200`
  con el estado `duplicate`; y la repetición de un evento que ya se atendió no toca las salas ni las
  páginas de una persona que inició sesión de nuevo y creó proyectos desde entonces. Todos los pasos
  se pueden repetir sin riesgo, así que una entrega que sigue a un fallo termina el trabajo.
- Cualquier otro tipo firmado se acepta con `200` y el estado `ignored`, y no cambia nada.
- La respuesta es `200` solo cuando los datos ya no están. Si el almacén falla, la respuesta es
  `500` y el servicio de identidad lo vuelve a intentar (el README de `@meltemi/identity` tiene su
  calendario). Sin `IDENTITY_EVENTS_SECRET` configurado, cada evento es `500 internal`, registrado.

El registro del evento es lo que rechaza las sesiones antiguas de la persona eliminada (véase
[La cookie de sesión](../../es/cloud.md#la-cookie-de-sesión)): una sesión emitida en el segundo de la eliminación o
antes cuenta como nadie, y una emitida en un segundo posterior es una persona que inicia sesión de
nuevo. El registro se guarda 31 días, porque una sesión dura treinta y el servicio de identidad
reintenta un evento durante siete; el barrido elimina los más antiguos. De una persona eliminada
queda su `sub`, que es opaco, la hora de la eliminación, el registro de la retirada de una página
suya y las entradas del registro de administración que la nombran; nada más.

## El inicio de sesión de la línea de comandos

`mdg login` inicia la sesión de la línea de comandos pidiendo a una persona que la apruebe en el
navegador. Los pasos son estos; [la línea de comandos](../../es/cli.md#iniciar-sesión-login-logout-y-whoami)
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
([La respuesta de sesión](../../es/cloud.md#la-respuesta-de-sesión)).

El intercambio tiene un límite de frecuencia por solicitante, un hash con clave de
`CF-Connecting-IP` (la dirección en sí no se guarda nunca, y los solicitantes sin dirección
comparten un mismo grupo). Diez fallos en el último minuto hacen que la solicitud siguiente sea
`429 cli.rate` con `Retry-After: 60`, comprobado antes de leer el cuerpo; el código que traía se
deja como está. Un cuerpo ilegible, un código desconocido o caducado y un `state` equivocado son
fallos; un éxito y una negativa por cuota no lo son. Los fallos de un solicitante de más de una hora
se borran cuando vuelve a fallar. Además, cada intercambio fallido y cada aprobación empiezan por
barrer lo que nadie vuelve a buscar, sea de quien sea: los fallos de cualquier solicitante de más de
una hora, los códigos de aprobación que han caducado, los registros de eliminación de más de 31
días, las entradas del registro de administración de más de 365 días y, ya que publicar también
barre antes, las solicitudes de publicación de más de una hora. Un
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

## El host de publicación

El host de publicación es un segundo Worker, mínimo. `src/publish.ts` es su lógica, una función de
una solicitud, un bucket y una base de datos, y `src/publish-worker.ts` es su punto de entrada;
`wrangler.publish.jsonc` lo configura con dos bindings, la base de datos D1 `DB` y el bucket de R2
`BLOBS` (los mismos que los del Worker principal), y nada más: ni recursos, ni Durable Object, ni
variables, ni secretos. Solo puede leer. Se ejecuta en el puerto 8789 con
`pnpm --filter @meltemi/diagrams-cloud exec wrangler dev -c wrangler.publish.jsonc`, sobre el mismo
estado persistido que `pnpm cloud:dev` (dale a ambos la misma carpeta `--persist-to`). Su dirección es el Custom Domain `meltemi.page`, que adjunta el Terraform de la familia
([Despliegue](cloud-implementation.md#despliegue)); su configuración no tiene rutas ni dirección `workers.dev`.

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
([catálogo](../../es/catalog.md#sin-conexión-por-diseño)); ninguna cabecera le añade nada. Todo `404` tiene el
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

## La recolección de blobs

Un blob se va cuando nada lo ha referenciado durante siete días. Un cron semanal (`0 3 * * SUN`: los
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

## Autorización

El endpoint es el único recurso protegido de un servidor de autorización OAuth 2.1 en el mismo
Worker, `@cloudflare/workers-oauth-provider` 1.2.3 (MIT). Su estado (clientes, concesiones, códigos,
tokens y consentimientos) es la tabla de D1 `oauth_store` (migración 0010), donde los códigos, los
tokens y los secretos de cliente se guardan como hashes y las props de una concesión, cifradas. La
biblioteca lee y escribe un namespace de KV, así que `src/oauth/store.ts` le da la tabla con la parte
de esa interfaz que usa (`get` como texto o JSON, `put` con caducidad y metadatos, `delete`, `list`
por prefijo en orden de clave con un cursor), con la semántica de KV: una entrada caducada no aparece
en ninguna lectura, y el cron semanal la elimina. El Worker no enlaza ningún namespace de KV: el token
de Terraform de la familia no puede crearlo, y las 1.000 escrituras de KV al día del plan gratuito
para toda la cuenta no darían para una docena de agentes conectados (un inicio de sesión escribe unas
cinco entradas y cada renovación horaria unas tres), mientras que D1 admite 100.000 filas escritas al
día. Sus direcciones:

## Administración

Dos roles administran el servicio. Los **propietarios** son los `sub` que lista el secreto
`ADMIN_SUBS`, que se lee en cada solicitud ([Variables y secretos](cloud-implementation.md#variables-y-secretos)): siempre
son administradores, la página nunca los quita, y son los únicos que invitan y quitan
administradores; sin definir o vacío, el servicio no tiene propietario. Los **administradores** son
las personas que un propietario invitó y que aceptaron, filas de `administrators`
([Almacenamiento](cloud-implementation.md#almacenamiento)); un `sub` que lista `ADMIN_SUBS` y que además tiene fila es un
propietario. Usan la consola central de Identity, accesible desde [el menú de la cuenta](../../es/web-app.md#el-panel-de-la-cuenta).
Esta llama a las rutas de abajo mediante el [servicio privado de administración](../../es/central-administration-service.md),
que verifica una sesión vigente y conserva estos roles por operación. Diagrams no tiene formularios
ni cliente de administración en el navegador.

La sala recibe una solicitud que construye el Worker: la dirección interna fija
`https://room/connect` y solo las cabeceras que establece el Worker, `X-Meltemi-Project`,
`X-Meltemi-Sub`, `X-Meltemi-Role` (el rol que el Worker determinó: `owner`, `editor` o `viewer`, o
`viewer` para una persona a la que el proyecto solo admite por un token), `X-Meltemi-Name` y
`X-Meltemi-Picture` (las tres últimas codificadas como URL), `X-Meltemi-Guest: 1` para una persona
sin cuenta, `X-Meltemi-Address` (la dirección del cliente, `CF-Connecting-IP`) y `X-Meltemi-Live`,
el token, solo cuando la consulta del socket traía uno. No se reenvía nada de la solicitud del
navegador, ni su path ni ninguna cabecera, así que un `X-Meltemi-Role` o un `X-Meltemi-Live`
falsificados nunca llegan a la sala. La sala lee el rol solo de la cabecera del Worker, trata un rol
desconocido como lo mínimo que puede ser una persona (`viewer`), rechaza una conexión sin `sub`, y
rechaza como error interno un sub `guest:` sin la cabecera de invitado o la cabecera de invitado con
otro sub, de modo que el prefijo nombra a un invitado y a nada más. La identidad, la marca de
invitado, la dirección, la sesión que admitió la conexión y un id de conexión aleatorio se guardan
en el adjunto del socket, que sobrevive a la hibernación.

Las rutas propias de la sala (`/files`, `/restore`, `/materialise`, `/destroy`, `/stats`,
`/disconnect` y `/live`) solo responden a solicitudes que construye el Worker:
`POST /rooms/<id>/destroy` o `POST /rooms/<id>/live` desde un navegador, con la cookie del
propietario, es `404 not-found`, y la sala conserva su documento, su revisión y su sesión.

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

**Hibernación.** La sala no guarda en memoria ninguna presencia que no pueda reconstruir. El adjunto
de cada socket contiene, junto a la identidad, el último estado del cliente como un registro
compacto: el color, el `file`, el `caret` codificado y cuándo se le oyó por última vez. La
plataforma limita un adjunto a 2 KiB, así que cuando un registro no cabe se descarta primero el
cursor y después el archivo. Un objeto que se desalojó y se construyó de nuevo sigue, por tanto,
enviando los estados al conectar y sabiendo cuándo descartarlos: la alarma sobrevive al objeto y
salta en el nuevo. Lo único que no se conserva es la cuenta de mensajes del último segundo: una sala
construida de nuevo cuenta desde cero.

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
  editor, y solo se rechazan las actualizaciones de un lector ([El socket](../../es/cloud.md#el-socket)).

Cada estado es un mensaje entrante para la sala, y la plataforma cuenta los mensajes entrantes de
WebSocket veinte a uno frente al presupuesto de solicitudes de un Durable Object en el plan gratuito.
La limitación (throttle) de la página y el tope de veinte clientes lo acotan: una sala llena en la
que se mueven todos los cursores envía como máximo 80 estados por segundo, y un cliente que solo
está ahí envía cuatro por minuto. Los contadores de desarrollo dicen cuántos llegaron
([Las rutas de desarrollo](cloud-implementation.md#las-rutas-de-desarrollo)).

### Patrocinios

Una donación es como una persona que no está habilitada pasa a estarlo sin la mano de nadie. GitHub Sponsors cobra, emite los
recibos y paga; este servicio solo se entera de que existe un patrocinio, por el webhook de Sponsors
de la cuenta patrocinada, y lo empareja con la cuenta que vinculó el mismo inicio de sesión de
GitHub. La cuenta patrocinada es `SPONSORS_ACCOUNT`, un usuario de GitHub (`askenaz`); sin definir o
vacía, como la trae `wrangler.jsonc` hasta que se hagan los pasos del propietario de abajo, el
servicio no tiene camino de donación: `POST /_sponsors/github` responde `404 not-found`, la respuesta
de sesión no lleva `support`, el `sponsorships` de la respuesta de administración es `[]` y no se
reclama nada.

`POST /_sponsors/github` es una llamada de GitHub: sin cookie, sin persona y sin la regla de
`Origin`. GitHub envía:

```http
POST /_sponsors/github
Content-Type: application/json
X-GitHub-Event: sponsorship
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958
X-Hub-Signature-256: sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17

{"action":"created","sponsorship":{"created_at":"2026-11-04T09:30:00+00:00","sponsorable":{"login":"askenaz"},"sponsor":{"login":"ana","id":4242,"type":"User"},"privacy_level":"public","tier":{"monthly_price_in_cents":1000,"is_one_time":false}}}
```

La ruta comprueba, en este orden, y no cambia nada antes de verificar la firma:

1. El cuerpo se declara `application/json` (con un charset vale); si no, `415 request.unsupported`:
   el formulario del webhook elige el tipo de contenido.
2. El cuerpo se lee hasta 64 KiB; si no, `400 request.invalid`, y se suelta su flujo.
3. `X-Hub-Signature-256` es `sha256=` y el HMAC-SHA-256 hexadecimal de los bytes exactos del cuerpo,
   con la clave `SPONSORS_WEBHOOK_SECRET`, comparado en tiempo constante (el `verify` de WebCrypto);
   si no, `401 signature.invalid`, sin leer nunca el cuerpo. Un secreto en blanco rechaza toda
   entrega con `500 internal`, registrado por su nombre.
4. El cuerpo es un objeto JSON; si no, `400 request.invalid`. Un `ping`, y cualquier evento que no
   sea `sponsorship`, es `200 { "ignored": true }`.
5. Un evento de patrocinio lleva `X-GitHub-Delivery`, `sponsorship.sponsor.login`, `.id` y `.type`,
   `sponsorship.tier.is_one_time` y `.monthly_price_in_cents`, `sponsorship.privacy_level`
   (`public` o `private`), `sponsorship.created_at` y `sponsorship.sponsorable.login`, cada uno con
   su forma; si no, `400 request.invalid`. Un patrocinado que no es `SPONSORS_ACCOUNT` (sin
   distinguir mayúsculas) es `200 { "ignored": true }`.
6. `created`, un pago que GitHub procesó, único o mensual y de cualquier importe, guarda una fila en
   `sponsorships`: el id de la entrega, el usuario, el id numérico y el tipo de quien patrocina, si
   el nivel es único, su importe en centavos, el nivel de privacidad, la hora de creación y el estado
   `active`, sin reclamar: `200 { "recorded": true }`. El mismo id de entrega otra vez es
   `200 { "repeated": true }` y no cambia nada, así que los reintentos de GitHub y el Redeliver del
   panel son seguros.
7. `edited`, `tier_changed` y `pending_tier_change` fijan el estado `active`, `pending_cancellation`
   fija `pending-cancellation`, y `cancelled` fija `cancelled`, para siempre, en el patrocinio más
   reciente de ese usuario y tipo: `200 { "updated": true }`, o `false` cuando no hay ninguno que
   cambiar. Ninguna habilitación cambia: se hizo una donación. Otra acción es
   `200 { "ignored": true }`.

No se registra nada de una entrega: ni su cuerpo, ni su firma, ni el secreto. Un fallo del
almacenamiento es un `500`, que el panel de GitHub muestra como una entrega fallida que se puede
volver a enviar.

**La reclamación.** `GET /api/account/identity` lee los inicios de sesión de la persona en el
servicio de identidad ([los datos de identidad](../../es/cloud.md#los-datos-de-identidad)); mientras el servicio
tenga una cuenta patrocinada, cada inicio de sesión de GitHub cuyo usuario (`handle`) es el de un
patrocinio sin reclamar de un `User`, sin distinguir mayúsculas, reclama todos los patrocinios sin
reclamar de ese usuario para la cuenta y le concede `unbranded-exports`, registrando en la fila del
usuario quién concede, `github-sponsors`, y la hora, y añadiendo un `grant` al registro con el
detalle `unbranded-exports (<usuario>)`, todo en un solo paso atómico: la entrada del registro entra
solo mientras existen una fila reclamable y la fila de la persona, y la concesión y la reclamación
siguen solo a esa entrada, así que una segunda reclamación, aunque sea en el mismo instante, no
escribe nada. La respuesta es la vista con `"claimed": true` al lado, y la página vuelve a leer la
respuesta de sesión. Un patrocinio reclamado no se reclama nunca otra vez: otra cuenta que vincule
después el mismo usuario no recibe nada. Una cancelación conserva la concesión. Un administrador
todavía puede revocarla, o conceder a mano a quien nombre una organización o a quien patrocina e
inicia sesión solo con Google (que también puede vincular GitHub, y la siguiente apertura del panel
reclama). Un fallo de la reclamación se registra y los inicios de sesión se responden igual.
Eliminar la cuenta (`user.deleted`) borra sus reclamaciones en el mismo paso que lo demás, así que
el patrocinio puede volver a reclamarlo quien vincule ese usuario. La reclamación empareja el
usuario, no el id numérico de GitHub, que los inicios de sesión no llevan; la fila guarda el id para
el día en que lo lleven.

**Los pasos del propietario en GitHub.** Hasta que estén hechos, `SPONSORS_ACCOUNT` queda vacía:

- [ ] Inscribir la cuenta patrocinada (`askenaz`) en GitHub Sponsors, desde una región admitida
      (Chile lo es), con sus datos de pago e impuestos.
- [ ] Publicar un nivel único y niveles mensuales cuyo texto de recompensa diga "Export without the
      Meltemi branding in the web app; the file's theme can do the same with `frame none`".
- [ ] En el panel de Sponsors, crear el webhook: URL de carga
      `https://diagrams.meltemi.dev/_sponsors/github`, tipo de contenido `application/json`, un
      secreto aleatorio largo y el evento `sponsorship`.
- [ ] Dar el mismo secreto a la infraestructura de la familia: el secreto `SPONSORS_WEBHOOK_SECRET`
      del entorno `infrastructure` de Meltemi Web, que su Terraform lee como
      `sponsors_webhook_secret` y guarda como `SPONSORS_WEBHOOK_SECRET` en el Secrets Store (un
      espacio hasta entonces), y fijar `"SPONSORS_ACCOUNT": "askenaz"` en `wrangler.jsonc`.
- [ ] Tras el despliegue, comprobar que el panel de GitHub muestra el `ping` del webhook respondido
      con `200`.
- [ ] Añadir **Support the project** a meltemi.dev/diagrams/ y /es/diagrams/ en Meltemi Web,
      enlazando `https://github.com/sponsors/askenaz`: esa página solo redirige al perfil hasta que
      la cuenta esté inscrita, así que el enlace espera a estos pasos.

Los dos lados del secreto solo se desalinean a mano: una entrega respondida con `401` en el panel lo
dice, y el propietario vuelve a escribir el mismo secreto en ambos.

## Contratos HTTP reservados y de desarrollo

| Ruta                                        | Quién puede llamarla                                           | Respuesta                                         |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `POST /_identity/events`                    | el servicio de identidad                                       | `200 { status }`                                  |
| `POST /_sponsors/github`                    | GitHub Sponsors, firmado; nadie sin `SPONSORS_ACCOUNT` (`404`) | `200`, guardado, repetido, actualizado o ignorado |
| `GET` y `HEAD /_published/<handle>/<slug>/` | cualquiera; solo en desarrollo                                 | `200`, la página publicada                        |
| `GET /api/dev/rooms/<id>/stats`             | solo en desarrollo: `200`, los contadores de la sala           |
| `POST /api/dev/rooms/<id>/disconnect`       | solo en desarrollo: `200 { closed }`                           |
| `POST /api/dev/rooms/<id>/limits`           | solo en desarrollo: `200 { clients }`                          |
| `POST /api/dev/collect`                     | solo en desarrollo: `200`, lo que hizo la recolección          |

| Código                | Estado | Significado                                                                                                                                                   |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signature.invalid`   | 401    | Un evento de eliminación cuya `Meltemi-Signature` no coincide con su cuerpo, o una entrega de patrocinio cuya `X-Hub-Signature-256` no coincide con su cuerpo |
| `request.unsupported` | 415    | Una entrega de patrocinio cuyo cuerpo no se declara `application/json`                                                                                        |

Todo cuerpo se lee con un tope, lo envíe quien lo envíe, para que nadie haga que el Worker retenga lo
que no pidió: un evento de eliminación y el formulario de aprobación hasta 8 KiB, una entrega de
patrocinio hasta 64 KiB, el JSON de la
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

## El endpoint MCP

`POST /mcp` es un servidor del Model Context Protocol (Streamable HTTP, sin estado) por el que un
agente actúa sobre los proyectos de la cuenta (cambio `agent-mcp`). Está hecho con `createMcpHandler`
de `@modelcontextprotocol/server` 2.3.1 (Apache-2.0) y `zod` 4.6.7 (MIT): las revisiones 2025 del
protocolo se responden por su vía sin estado (un flujo de eventos con la única respuesta), la revisión
2026-07-28 como JSON. No se emite identificador de sesión; `GET` y `DELETE` son `405`. En este orden,
antes de que el SDK lea nada: un `Origin` que no es el de la página es `403 request.forbidden`, un
`MCP-Protocol-Version` que el SDK no sirve es `400`, una petición sin un token que el servidor de
autorización o el servicio guarden es `401` con
`WWW-Authenticate: Bearer realm="OAuth", resource_metadata="<origin>/.well-known/oauth-protected-resource"`
([Autorización](#autorización); aquí nunca se toma la cookie), y un cuerpo de más de 24 MiB es `413`.
La biblioteca del servidor de autorización, el SDK y las herramientas se importan la primera vez que
un isolate sirve `/mcp`.

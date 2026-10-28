# Seguridad

[English](../security.md)

Meltemi Diagrams abre repositorios de cualquier procedencia: los archivos de un colega, una pull
request, un proyecto descargado para echarle un vistazo, un trabajo de CI que recorre muchos
repositorios. Abrir, validar, previsualizar o exportar un proyecto así no debe ejecutar su código,
leer fuera de él, acceder a la red ni agotar los recursos de la máquina. Esta página enumera qué lo
garantiza, y dónde (decisión 0030).

## No se ejecuta código

- Los diagramas, los temas, las historias, los modelos y los perfiles de exportación son
  declaraciones; nada del lenguaje se ejecuta.
- Los plugins son datos (`docs/plugins.md`): tipos de diagrama y paquetes de iconos declarados en
  JSON. Los campos que nombrarían código (`main`, `module`, `exports`, `scripts`, `bin`) se ignoran
  con una advertencia.
- Los reproductores y los catálogos exportados solo llevan su propio script; su política de
  seguridad de contenido no permite ningún otro script ni ninguna solicitud de red.

## Las rutas se quedan en el proyecto

- Las importaciones son rutas `.meltemi` relativas dentro de la raíz del proyecto; se rechazan las
  URL, las rutas absolutas y las rutas que salen de la raíz (`module.invalid-path`,
  `module.outside-project`).
- Las imágenes son archivos del proyecto (`asset.outside-project`); las fuentes y los paquetes de
  iconos están en `assets/`; los plugins son carpetas dentro del proyecto; las salidas del catálogo
  y de los perfiles son rutas relativas dentro de él (una salida escrita en otro lugar es un `--out`
  explícito de la persona).

## Sin red

No se descarga nada: ninguna URL de importación, imagen, fuente, icono, plugin, tema o página de
inicio se lee nunca de la red. Las propiedades `url` son hipervínculos escritos en las
exportaciones, que la herramienta nunca sigue. Las únicas solicitudes que hace el producto son las
de la asistencia de IA que una persona inicia y acepta (`docs/assist.md`) y las de los comandos de
la nube que una persona ejecuta (`docs/cli.md`), que hablan con el único servicio que resolvieron
([más abajo](#la-línea-de-comandos-y-la-nube)); `review --base <revision>` ejecuta el `git` local.

## El playground

El playground (`docs/playground.md`) es una página estática: su política de seguridad de contenido
solo permite scripts, estilos, fuentes y conexiones de su propio origen, y sin una cuenta ninguna
solicitud sale de él. Servido por el servicio en la nube ([cloud](cloud.md)) ofrece una cuenta
opcional: el avatar de la persona con sesión iniciada es la única imagen que puede venir de otro
origen (los hosts de los proveedores), los formularios pueden enviarse a la propia página y al
servicio de identidad (para cerrar sesión), y las conexiones se quedan en el origen de la página. El
servicio rechaza un cambio hecho con la cookie de sesión si no viene de su propia página, no deja
que otro sitio enmarque la página, y guarda solo el SHA-256 de un token de API. Los enlaces para
compartir llevan los proyectos después de `#`, que los
navegadores nunca envían; al abrir uno se descomprimen como máximo 4 MiB y el texto se compila con
los límites de más abajo; nada de lo que contiene se ejecuta. El trabajo se queda en el
almacenamiento del navegador hasta que la persona lo descarga o, con la sesión iniciada, lo guarda
en un proyecto en la nube.

## Proyectos en la nube

Los proyectos en la nube (decisión 0041, [cloud](cloud.md)) son la forma en que el trabajo de una
persona llega al servicio, y solo cuando ella lo decide. Seis cosas los mantienen seguros:

- **La sala.** Todo cambio de un proyecto pasa por su sala, un Durable Object por proyecto, que
  valida cada transacción sea cual sea su origen (un socket, un push mediante la API, una versión
  restaurada): los paths deben seguir [la regla de los paths](cloud.md#la-regla-de-los-paths)
  (relativos, sin `..`, nada oculto), los valores deben tener la forma del documento, un binario
  debe ser un hash que el proyecto subió, y los límites deben cumplirse. Una transacción que
  incumple una regla se revierte y se avisa a quien la envió. La sala solo responde a solicitudes
  que construye el Worker, así que ninguna cabecera ni path de un navegador llega a ella y nadie
  puede nombrar su propio rol; el socket necesita un `Origin` que sea el del propio servicio, y o un
  rol que el proyecto da a la persona o el token de una sesión en vivo que la sala comprueba ella
  misma.
- **Blobs en una sandbox.** Una imagen o una fuente subida se tipa por sus bytes, nunca por el
  `Content-Type` que diga un cliente, y un SVG debe ser XML bien formado con una raíz `svg`. Todo
  blob se sirve con `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` y como
  descarga, desde una dirección acotada al proyecto que lo tiene, así que un script dentro de un SVG
  subido no ejecuta nada en el origen del servicio.
- **Miniaturas.** Una miniatura es un SVG que dibuja la página: el servicio acepta como máximo
  200 KiB de SVG bien formado, una cada treinta segundos por proyecto, y la sirve en una sandbox.
- **Cuotas.** Las cuentas y los proyectos tienen límites (100 proyectos, 200 MiB de almacenamiento,
  2000 archivos, 16 MiB de documento, 10 MiB por imagen o fuente, 200 versiones, 20 clientes en una
  sala, 512 KiB por mensaje, 50 miembros e invitaciones por proyecto, 16 MiB por página publicada), y
  las frecuencias también (seis versiones por minuto y diez solicitudes de publicación por hora para
  un proyecto), y cada rechazo lleva un código estable
  ([cuotas y límites](cloud.md#cuotas-y-límites)).
- **La presencia viene de la sala.** Quién está dónde lo retransmite la sala y no lo guarda nadie
  ([presencia](cloud.md#presencia-awareness)). La sala fija el `sub`, el nombre, la imagen, el
  color y la marca de invitado de cada estado que retransmite a partir de la identidad que el Worker
  dio al socket del remitente (la persona de la cookie, o un invitado al que nombró el Worker), diga
  lo que diga el mensaje, y lo identifica con ese socket, así que nadie puede
  aparecer como otra persona ni hablar por la entrada de otra. Una página lee quién es una persona de
  eso y de ningún otro sitio, y acota lo que toma (un nombre es una línea de 100 caracteres como
  máximo, una imagen cumple la regla del avatar y la política de la página, una posición o un id que
  no se resuelve se ignora). Todo nombre llega a la cabecera, al código y al lienzo como un nodo de
  texto, así que un nombre como `<img src=x>` se muestra como esos caracteres y no construye nada. El
  tráfico también está acotado: un mensaje de presencia de más de 16 KiB cierra a su remitente, más
  de 20 por segundo se descartan y más de 100 cierran el socket (`awareness.rate`), una página envía
  cuatro por segundo como máximo, y un lector puede enviar presencia pero nunca una actualización.
  Un puntero son dos números finitos a menos de un millón del origen, o el estado se descarta. La
  sala guarda el último estado de un cliente solo en el adjunto del socket, nunca en su base de
  datos, y la selección del lienzo y el puntero en ningún sitio, y la página nunca lo guarda ni lo
  escribe en una exportación.
- **Las conexiones sin cuenta están acotadas.** Quien visita de forma anónima un enlace `view` o
  `edit`, y el invitado de una sesión en vivo, se conectan con una identidad que fija el Worker: un
  sub `guest:` a partir de un id que creó su navegador (32 caracteres hexadecimales, si no `400`), un
  nombre de 1 a 40 caracteres sin caracteres de control (si no, "Guest NN"), y ninguna imagen; la
  sala rechaza una cuenta cuyo sub pasaría por el de un invitado. Ocupan los veinte sitios de la sala
  y los ceden al propietario y a los editores con cuenta; una dirección de cliente admite como máximo
  diez de ellas en una sala (`connections.limit`); una visita es un lector, y un invitado edita solo
  mientras esté activa una sesión que deje editar a los invitados. Una sesión en vivo dura un día
  como máximo y termina tras una hora sin nadie en su sala; terminarla cierra cada conexión que
  admitió (`session.ended`). Su token son 128 bits aleatorios guardados en claro en la sala, como el
  de una invitación, respondidos solo al propietario y nunca registrados; un token que no está
  vigente es `404`, sin revelar nada. Además de la sala, llega a la fila del proyecto y a sus blobs, y
  a ninguna ruta que escriba fuera de la sala, lea las versiones, la miniatura o lo compartido, o
  gaste el almacenamiento del propietario ([sesiones en vivo](cloud.md#sesiones-en-vivo)).

## Compartir y publicar

Compartir y publicar (decisión 0042, [cloud](cloud.md)) hacen que el trabajo de una persona llegue a
otras, de nuevo solo cuando ella lo decide, y un proyecto nuevo es privado. Cuatro cosas lo
mantienen seguro:

- **Una sola comprobación de permisos.** Quién puede abrir un proyecto, y como qué (`owner`,
  `editor` o `viewer`), lo decide una sola función que consultan todas las rutas y el socket
  ([roles](cloud.md#roles)). Un proyecto que la persona no puede abrir en absoluto es `404`, la misma
  respuesta que la de uno que no existe, así que un proyecto privado no se delata; a una persona
  anónima solo se le dice que inicie sesión donde iniciar sesión ayudaría (`401`), y cualquier otra
  carencia es `403`. Solo el propietario cambia quién puede abrir un proyecto. La sala toma el rol
  solo del Worker y cierra el socket de un lector en su primera actualización, dejando el documento
  como estaba. Un cambio de acceso cuenta desde la solicitud siguiente, y las rutas que lo hacen
  cortan los sockets que pueda haber dejado obsoletos, para que el rol se determine de nuevo cuando
  la página reconecte ([cuando cambia el acceso](cloud.md#cuando-cambia-el-acceso)).
- **Invitaciones en claro, y solo para el propietario.** El token de una invitación es el único
  secreto que el servicio guarda en claro, porque el propietario puede volver a copiar su enlace; es
  una capacidad del mismo tipo que el enlace de un proyecto `edit`, solo se le muestra al
  propietario, nunca se registra, funciona una vez y dura treinta días. Los tokens de API y los
  códigos de aprobación siguen guardándose solo como hash. Una invitación por correo coincide solo
  con un correo que el servicio de identidad verificó. Un miembro ve los nombres y las imágenes de
  los demás, nunca sus correos; quien solo tiene un enlace no ve a nadie.
- **Una página que solo muestra.** El modo de solo lectura rechaza toda edición en el único lugar
  por el que pasan las ediciones, y de nuevo en cada control; al lienzo se le dice `readOnly`, no
  envía ninguna acción a la página y oculta lo que escribe; el binding de un lector nunca envía una
  actualización, y la sala la rechazaría. Quien no ha iniciado sesión sigue la sala como lector, o
  lee el proyecto con solicitudes normales al propio origen de la página cuando la sala no responde,
  y nada de un proyecto que se mira, ni de un proyecto que edita un invitado, se guarda en el
  navegador.
- **Las páginas publicadas son HTML de otras personas, en un dominio propio.** Una página publicada
  es el catálogo que construyó la página, servido desde un dominio que no está bajo `meltemi.dev` por
  un segundo Worker que solo tiene la base de datos y el bucket: ni recursos, ni secretos, ni
  cookie, ni API. Responde solo `/<handle>/<slug>/`, con `nosniff` y `no-referrer`, y `404` con un
  único cuerpo a todo lo demás; el servicio se niega a construir una dirección sobre un host que es
  el suyo o que está bajo el dominio de la cookie
  ([el host de publicación](cloud.md#el-host-de-publicación)). La página se ejecuta bajo la política
  del propio catálogo, que permite script y estilo en línea e imágenes y fuentes de `data:` y
  `blob:`, y nada más; el servicio no comprueba que el HTML sea un catálogo, y el aislamiento no
  depende de ello. Una página tiene como máximo 16 MiB y un proyecto puede publicarse diez veces por
  hora; el propietario despublica, y los administradores de `ADMIN_SUBS` retiran una página
  ([retirada](cloud.md#retirada)) y habilitan una cuenta para exportar sin la marca
  ([habilitaciones](cloud.md#habilitaciones)), con rutas que responden `404` a todos los demás. La ruta de
  desarrollo que sirve una página desde el propio origen del servicio responde `404` salvo que
  `DEV` esté definido.

## La línea de comandos y la nube

Los comandos de la nube (`login`, `logout`, `whoami`, `push`, `pull`, `publish`, `projects` y
`review --base cloud`, [la línea de comandos](cli.md#los-comandos-de-la-nube)) son la única parte de
la línea de comandos que guarda un secreto, un token de API, y escribe los archivos de un servicio en
una carpeta. Seis cosas los mantienen seguros:

- **Un token va a un solo host.** El host es `--host`, si no `MELTEMI_HOST`, si no
  `https://diagrams.meltemi.dev`, y nunca el `cloud.host` de un `project.json`: un repositorio que
  clonaste no puede enviar tu token a ningún sitio, y un manifiesto que nombra otro host falla con
  `cloud.host-mismatch` antes de cualquier solicitud. Un token nunca se envía por `http:` salvo a
  `127.0.0.1`, `localhost` o `[::1]` (`cloud.insecure-host`), nunca se sigue con él una redirección
  (`cloud.redirect`), y el intercambio del código de un solo uso no lleva ninguno. Cada solicitud
  tiene un límite de tiempo y cada respuesta se lee con un límite de tamaño.
- **Los tokens nunca se muestran.** `redactSecrets` sustituye los tokens `mdg_…` en cada mensaje,
  error, documento `--json`, página de revisión e imagen que escriben los comandos de la nube, y en
  el error inesperado que termina con 70; el valor de `MELTEMI_TOKEN` se elimina como el de
  cualquier variable que parezca un secreto. Un token entra por la entrada estándar
  (`login --token`), nunca por un argumento, así que no queda en el historial del shell ni en la
  lista de procesos. `whoami` imprime un nombre, y el código de un solo uso de `login` no se imprime
  nunca.
- **Un solo archivo guarda el token.** `credentials.json`, en la carpeta de configuración del
  usuario, es el único lugar donde se escribe un token. Es `0600` en una carpeta `0700` donde el
  sistema tiene esos modos (Windows conserva los permisos de la carpeta de perfil y el comando no
  cambia nada ahí), se escribe mediante un archivo temporal y un renombrado, y nunca se sobrescribe
  si no contiene credenciales válidas (`credentials.corrupt`). `logout` olvida un token solo después
  de que el servicio lo revocó o dijo que ya no lo conoce, así que un token que sigue vivo nunca se
  pierde de vista.
- **El inicio de sesión escucha solo aquí.** El listener está en `127.0.0.1`, en un puerto al azar.
  Toma un único `GET /` que lleve un `code`, el `state` de la propia solicitud y un `Host` que sea su
  propia dirección (una página que haga que el navegador lo llame con otro nombre no obtiene nada),
  deja de escuchar con la primera solicitud así y termina a los cinco minutos. La única página que
  responde no tiene script, y su política no permite ninguno. El código está ligado al `state` y se
  intercambia una sola vez, sin ningún token.
- **Pull escribe dentro de la carpeta, después de comprobarlo todo.** Cada ruta que responde la nube
  se comprueba antes de escribir el primer byte: la [regla de los paths](cloud.md#la-regla-de-los-paths)
  de la nube (relativos, sin `..`, nada oculto), nombres que Windows pudiera guardar, ningún par de
  rutas que difiera solo en las mayúsculas, que se resuelva dentro de la carpeta, y nunca a través de
  un enlace. Una que falle rechaza todo el pull con `pull.unsafe-path`. Los archivos se escriben
  mediante un archivo temporal y un renombrado, así que un enlace de la carpeta se reemplaza y nunca
  se sigue; los archivos que difieren se conservan salvo con `--force`; las imágenes y las fuentes se
  comprueban contra su hash. `review --base cloud` aplica la misma regla. Los paths de un proyecto
  los escribe quien lo edita, y la línea de comandos no se fía de la palabra del servicio sobre
  ellos.
- **Nada se sobrescribe sin verlo.** `push` compara antes cada ruta con la nube, lista lo que difiere
  y pregunta, o se niega sin `--force`; lleva la revisión con la que comparó, y un cambio que llega
  entretanto se compara de nuevo, no se sobrescribe. Los archivos que no puede enviar se nombran y
  nunca hacen que borre los de la nube.

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
| Un enlace para compartir del playground       | 4 MiB descomprimido, 2000 archivos                                        | un mensaje                                                                             |
| Un archivo comprimido de proyecto que se abre | 2000 archivos, 64 MiB                                                     | un mensaje                                                                             |
| Una página publicada                          | 16 MiB, diez solicitudes por hora para un proyecto                        | `publish.too-large`, `publish.rate`                                                    |
| Miembros de un proyecto                       | 50 con las invitaciones pendientes                                        | `quota.members`                                                                        |
| Mensajes de presencia                         | 16 KiB; se retransmiten 20 por segundo, 100 por segundo cierran el socket | `message.too-large`, `awareness.rate`                                                  |
| Conexiones sin cuenta                         | 10 abiertas en una sala desde una misma dirección de cliente              | `connections.limit`                                                                    |
| Una sesión en vivo                            | 24 horas, una hora sin nadie en la sala                                   | `session.ended`                                                                        |
| Un push a la nube                             | 2000 archivos, 16 MiB de texto, 10 MiB una imagen o una fuente            | `quota.files`, `doc.too-large`, `quota.binary`, rechazado antes de cualquier solicitud |

## Errores sin secretos

- Las claves de los proveedores de IA están en el entorno o en el almacenamiento de secretos del
  editor, nunca en los archivos del proyecto ni en las exportaciones, y se ocultan en todos los
  errores.
- Un error inesperado de la línea de comandos muestra su mensaje sin los valores de las variables
  de entorno que parecen secretos (`*KEY*`, `*TOKEN*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`), y
  sin la pila de llamadas salvo que `MELTEMI_DEBUG` esté definida; termina con el código 70.
- Los tokens de API del servicio en la nube (`mdg_…`) se sustituyen por `mdg_…` en cada mensaje,
  documento `--json` y página de revisión de la línea de comandos, vengan de donde vengan.
- Las páginas y los informes pensados para compartirse (catálogos, páginas de revisión,
  reproductores exportados) nombran versiones y rutas relativas al proyecto, nunca rutas locales.

# Espacio de trabajo local con Docker Compose

[English](../local-compose.md)

Ejecuta el editor web, el backend de proyectos y el MCP en tu equipo. Tu navegador y Claude Code o
Codex editan los mismos proyectos. Necesitas Docker Compose y un agente instalado; no hacen falta
cuenta de Meltemi, IDP, inicio de sesión, token de API ni instalar Node en el equipo.

## Iniciar

Obtén el archivo de fuentes de una release desde [GitHub releases](https://github.com/askenaz-dev/meltemi-diagrams/releases)
y extráelo, o selecciona esa release con Git. Abre una terminal en la carpeta que contiene
`compose.yaml`. Debe estar ejecutándose Docker Engine con Compose en Linux, o Docker Desktop
con contenedores Linux en Windows. El primer destino de contenedores es Linux amd64.

```bash
docker compose up
```

El primer inicio construye la imagen y necesita red para descargar dependencias. Inicializa
automáticamente el almacenamiento persistente y un proyecto predeterminado. Espera el mensaje
de disponibilidad y abre [el editor local](http://127.0.0.1:8879/). El inicio también muestra la
dirección y el prompt para configurar el agente. El navegador abre el proyecto predeterminado.

Mantén abierta la terminal. `docker compose ps` en otra terminal muestra el estado del servicio.
Si el puerto 8879 está ocupado, detén el servicio que lo usa antes de iniciar Meltemi; no
expongas el puerto del contenedor a la red como alternativa.

## Conectar un agente

En el editor, elige **Configurar mi agente**. Copia el prompt en Claude Code o Codex ejecutándose
en este equipo. El prompt incluye el proyecto abierto y lee las instrucciones de instalación
desde `http://127.0.0.1:8879/agent-setup/local/prompt.md`.

El agente instala el **plugin local de Meltemi Diagrams**, con su skill de diagramación y las
referencias del lenguaje, y registra la conexión MCP por Streamable HTTP del plugin a
`http://127.0.0.1:8879/mcp`. Se necesitan ambas partes: una skill sola no conecta el editor y una
URL MCP sola no instala el plugin. No hay credenciales que crear o copiar.

Los paquetes del plugin y sus hashes provienen de la instancia en ejecución. La instalación
conserva la configuración ajena del cliente; repetirla reutiliza lo existente sin duplicar
registros. Un registro de Meltemi en conflicto se informa antes de reemplazarlo. No hace falta
instalar con npm ni ejecutar otro proceso `mdg mcp`. El prompt usa las herramientas disponibles
de descarga y extracción; su instalador Python es opcional.

### Activación del cliente

Claude Code instala el plugin mediante su marketplace nativo local y alcance local. Codex usa su
marketplace nativo de plugins en el directorio actual de Codex. Se conservan los controles nativos
de instalación o confianza. La integración se desarrolló con Claude Code 2.1.312 y Codex 0.156.1;
las instrucciones comprueban los comandos disponibles en el cliente instalado.

Claude Code puede necesitar `/reload-plugins`; Codex puede necesitar una nueva sesión o chat.
El agente entrega la continuación con el proyecto seleccionado cuando hace falta. La configuración
termina cuando las herramientas MCP nativas del cliente están disponibles. Descargar el archivo
correctamente o hacer una solicitud HTTP no demuestra que el plugin esté activo.

## Diagramar juntos

Dile a tu agente qué diagramar. Lee los archivos y la revisión del proyecto seleccionado, escribe
fuentes `.meltemi` con protección de revisiones y reintentos, valida y revisa una vista previa.
Devuelve la dirección que abre ese proyecto en el editor.

Mantén abierto ese proyecto: su texto y lienzo se actualizan cuando escribe el agente, sin recargar
la página. Arrastra o cambia un elemento y pide al agente leer de nuevo; ve el cambio de fuente
que hiciste. Dos agentes locales pueden usar el mismo proyecto. Una revisión atrasada se rechaza
para que el agente lea y conserve el cambio nuevo antes de reintentar.

Si conservaste un proyecto exclusivo del navegador, el inicio lo preserva. Abre un proyecto del
espacio de trabajo desde **Proyectos**, o guarda el proyecto del navegador en el espacio local,
antes de copiar el prompt. Un prompt copiado después de cambiar de proyecto nombra el nuevo proyecto.

## Archivos y exportaciones

Los proyectos del espacio de trabajo viven en el volumen persistente del backend. No son carpetas
Git montadas con sincronización en vivo. Usa **Importar proyecto…** para un archivo de proyecto y
**Descargar → Proyecto** para llevar fuentes al equipo. Editar esa copia no actualiza el espacio
automáticamente; impórtala explícitamente cuando quieras devolverla.

Las exportaciones del navegador siguen produciendo imágenes, reproductores HTML, catálogos y
videos compatibles. La herramienta MCP `preview` dibuja SVG o PNG localmente. Consulta
[la app web](web-app.md) para exportar y [dibujar con agentes](agents.md) para el flujo de diagramación.

## Detener y reiniciar

Pulsa Ctrl+C en la terminal original o usa:

```bash
docker compose stop
```

`docker compose down` retira el contenedor y conserva el volumen de la instancia. Inicia de nuevo
con `docker compose up`: permanecen el propietario, proyectos, versiones, documentos de las salas
y activos subidos. Los registros se consultan con `docker compose logs`.

El backend local guarda cada actualización aceptada del editor o la API antes de confirmarla o
retransmitirla. Tras confirmar un cambio, no necesitas esperar más antes de detener la instancia.
Las ediciones pendientes en un navegador sin conexión aún no han llegado a este punto.

## Respaldar y restaurar

La instancia contiene filas D1, documentos de salas y activos binarios. Respalda la instancia
completa detenida, en vez de copiar sólo la base de datos mientras una sala puede seguir escribiendo.

### Respaldar

Crea una vez la carpeta `backups`, detén la aplicación y genera un archivo. Elige un nombre de
archivo nuevo para cada respaldo y úsalo en ambos comandos: `docker cp` puede reemplazar un archivo
de destino existente.

```bash
mkdir backups
docker compose stop
docker compose run --no-deps --name meltemi-backup app backup /tmp/meltemi.meltemi-backup
docker cp meltemi-backup:/tmp/meltemi.meltemi-backup ./backups/meltemi.meltemi-backup
docker rm meltemi-backup
```

La herramienta rechaza una instancia en ejecución. El archivo incluye los metadatos de la instancia
y su versión. El respaldo se escribe dentro de un contenedor auxiliar que se detiene al terminar;
`docker cp` crea entonces la copia en el equipo con tu usuario local. Así el usuario del contenedor
no necesita permiso de escritura en tu carpeta Linux. Continúa a la copia sólo si el respaldo
termina correctamente. Si `meltemi-backup` ya existe, inspecciónalo o usa otro nombre de contenedor
antes de continuar. Elimínalo sólo después de copiar correctamente; si falla la copia, el archivo
permanece en ese contenedor para reintentar. Otro respaldo necesita un nombre de archivo nuevo;
el nombre del contenedor puede reutilizarse tras eliminarlo. Inicia la
instancia original con `docker compose up` cuando termine correctamente.

### Restaurar en una instancia nueva

Conserva los datos originales. Restaura en un volumen vacío usando otro nombre de proyecto Compose:

```bash
docker compose stop
docker compose -p meltemi-restored run --rm --no-deps --volume ./backups/meltemi.meltemi-backup:/backup.meltemi-backup:ro app restore /backup.meltemi-backup
docker compose -p meltemi-restored up
```

El servicio original debe seguir detenido porque ambas instancias usan el puerto 8879. La
restauración verifica metadatos y hashes, rechaza archivos incompatibles o dañados y rechaza un
destino con datos. Conserva el respaldo original. Abre el editor restaurado y comprueba fuentes,
versiones e imágenes antes de considerar probado el respaldo. Usa la misma release para restaurar.

## Actualizar

Detén y respalda la instancia primero. Obtén las fuentes de la nueva release en la misma carpeta
de instalación, conservando el respaldo y nombre del proyecto Compose; luego construye e inicia:

```bash
docker compose build
docker compose up
```

La inicialización aplica los cambios de esquema pendientes antes de indicar disponibilidad. No
descartes el volumen para recuperarte de una actualización fallida; conserva datos y registros.
Usa **Configurar mi agente** de nuevo para revisar el plugin correspondiente a la versión en
ejecución. Un paquete, versión o dirección instalada diferente se informa como conflicto: revisa su
reemplazo mediante los controles nativos del cliente antes de reintentar. La configuración
idéntica se reutiliza. Sigue cualquier recarga nativa necesaria tras actualizar con revisión.

## Reiniciar desde cero

El siguiente comando elimina permanentemente los datos de este proyecto Compose, incluidos todos
los proyectos, versiones y activos. Crea y verifica un respaldo antes de usarlo:

```bash
docker compose down -v
```

El próximo `docker compose up` crea una instancia vacía y un proyecto predeterminado nuevos. Es
un borrado, no un reinicio normal ni un requisito para restaurar en una instancia separada.

## Acceso y operación sin red

El servicio escucha en `127.0.0.1` y cualquier proceso local que alcance ese puerto puede usar el
espacio. Esta distribución es para una persona y sus agentes en un equipo. No aísla usuarios ni
agentes locales entre sí. No publiques el puerto en una LAN, proxy inverso o Internet. Un agente
alojado externamente no puede alcanzar esta dirección de loopback.

Después de construir la imagen, el editor, almacenamiento, MCP, archivos del plugin, fuentes/iconos
y vistas previas SVG/PNG no requieren servicios externos. El modelo de tu agente puede seguir
necesitando su propia conexión. Los diagramas y activos subidos permanecen en esta instancia.

## Funciones disponibles

Catorce herramientas centrales cubren proyectos, archivos, versiones, descripción del actor,
direcciones del editor y vistas previas. El catálogo compartido también lista trece herramientas
de compartir, sesiones de invitados y publicación; devuelven `local.feature-unavailable` y no
cambian nada en este modo. Sus controles no aparecen en el editor. La sincronización ordinaria
entre tu navegador y los agentes sigue activa.

El servicio alojado y su autenticación son independientes. Las [instrucciones manuales de
desarrollo](cloud.md#ejecutarlo-en-local) siguen disponibles para trabajar en esa implementación.

# Diagramar con agentes de IA: skill y MCP

[English](../agents.md)

Convierte una descripción, el código de tu proyecto o un diagrama existente en un diagrama
editable de Meltemi con el agente de IA que ya usas. Pídele documentar un flujo real, convertir
Mermaid o PlantUML, actualizar una vista de arquitectura tras un cambio de código o crear un
diagrama que puedan ajustar juntos en el navegador. El resultado es código `.meltemi` que puedes
revisar y editar, junto con una vista previa o exportación.

Claude Code, Codex, Cursor y otros agentes de programación pueden usar la **skill**
`meltemi-diagrams` y las **herramientas MCP** de Meltemi. Cumplen funciones distintas y se pueden
usar juntos. Tu agente aporta el modelo de IA; instalar la skill o conectar MCP no configura un
modelo para la [asistencia de IA integrada](assist.md) de Meltemi.

## ¿Skill o MCP?

| Parte           | Qué le da a tu agente                                                                                                                                      | Cuándo la necesitas                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Skill**       | Instrucciones, ejemplos y referencias del lenguaje: cómo elegir un diagrama, escribir `.meltemi` válido, conservar la disposición y comprobar el resultado | Enseñar al agente a dibujar y editar diagramas de Meltemi. Con acceso a archivos y terminal, puede usar directamente la CLI |
| **MCP**         | Herramientas para leer proyectos, validar código y ver diagramas; el servicio de proyectos también permite escribir, crear versiones y compartir           | Que el agente trabaje sobre un proyecto de Meltemi y vea el resultado dibujado mediante sus propias herramientas            |
| **Skill + MCP** | Guía para diagramar junto con herramientas que operan sobre tu proyecto                                                                                    | Trabajar sobre el mismo proyecto que el editor web, comprobando el dibujo en cada paso                                      |

Una skill aporta conocimiento, no una conexión a tu cuenta. MCP conecta herramientas, no es un
modelo de IA. Conectar MCP no instala la skill; instalar la skill no concede acceso a proyectos.

## Elige dónde guardar tus diagramas

| Tu objetivo                                                         | Empieza aquí                                                                                                                            | Qué obtienes                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Conservar diagramas junto al código en Git                          | [Instala la skill](#instalar-la-skill) y usa la CLI                                                                                     | Archivos `.meltemi` y exportaciones locales; no necesitas cuenta de Meltemi ni MCP            |
| Que el agente inspeccione diagramas de un repositorio local por MCP | Añade el [modo carpeta](#a-través-del-servidor-local), `mdg mcp --folder .`, a la skill                                                 | Herramientas `validate` y `preview`; el agente edita con sus propias herramientas de archivos |
| Editar un proyecto guardado en tu cuenta de Meltemi                 | Conecta el [endpoint MCP alojado](#a-través-del-endpoint-mcp) o usa el [servidor MCP local](#a-través-del-servidor-local) con tu cuenta | Leer y escribir el mismo proyecto que la app web, ver vistas previas y obtener su URL         |
| Trabajar con un agente y el navegador juntos en tu máquina          | Inicia el [espacio de trabajo Docker](#con-el-espacio-de-trabajo-docker) e instala su plugin para agentes                               | Skill y MCP configurados juntos para el backend local; sin cuenta de Meltemi ni token         |

Para un repositorio, empieza por el prompt de configuración de abajo. Para un proyecto abierto
en el editor Docker local, usa **Configurar mi agente** allí: mantiene al agente conectado a ese
proyecto.

## El prompt

Pega esto en tu agente de programación, en tu proyecto. El prompt está en inglés, el idioma en que
el agente lee la guía; el agente te responde en el tuyo:

```text
Set up Meltemi Diagrams in this project so you can draw diagrams as code, and prove it works — you'll need terminal access on this machine and Node 22.12 or later. First read https://diagrams.meltemi.dev/agent-setup/prompt.md and follow it. Install the meltemi-diagrams skill for the coding agents this project uses (ask me if it's unclear which) with `npx @meltemi/diagrams-cli@latest skill install`. Then prove it: write a small sequence diagram of one flow of this project, validate it until no diagnostic remains, export the SVG, and show me the validation's last line and where the SVG is. Never sign in to the cloud, never print or commit a token, and don't commit or change my project's configuration beyond the skill folders without asking me first.
```

La [página de configuración de agentes](https://diagrams.meltemi.dev/es/agent-setup/) muestra el mismo
prompt con un botón para copiarlo en su esquina superior derecha.

El agente lee el prompt de configuración en `https://diagrams.meltemi.dev/agent-setup/prompt.md` y
lo sigue: comprueba Node y la versión de la línea de comandos, instala la skill para los agentes
que usa tu proyecto (te pregunta cuando no está claro), demuestra que dibuja y te cuenta lo que
hizo. El prompt necesita la línea de comandos 1.10.0 o posterior; un agente que encuentra una
anterior lo dice y se detiene. Un agente sin acceso a la web imprime el mismo texto con la línea de
comandos:

```bash
npx @meltemi/diagrams-cli@latest skill prompt
```

## Instalar la skill

La línea de comandos trae la skill. Instala la línea de comandos una vez:

```bash
npm install --global @meltemi/diagrams-cli
```

Luego, en la carpeta de un proyecto:

```bash
mdg skill install
```

Escribe la skill en las carpetas de las que los agentes leen las skills:
`.claude/skills/meltemi-diagrams/` para Claude Code, y `.agents/skills/meltemi-diagrams/`, la
carpeta común a todos los agentes, para los demás. `--agent` nombra los agentes, uno o varios
separados por comas (`--agent claude,codex`), o `all`, el valor por defecto; una carpeta que
comparten varios agentes se escribe una vez.

| Agente                                         | `--agent`  | Carpeta          |
| ---------------------------------------------- | ---------- | ---------------- |
| Claude Code                                    | `claude`   | `.claude/skills` |
| Codex                                          | `codex`    | `.agents/skills` |
| Cursor                                         | `cursor`   | `.agents/skills` |
| GitHub Copilot                                 | `copilot`  | `.agents/skills` |
| Gemini CLI                                     | `gemini`   | `.agents/skills` |
| Windsurf                                       | `windsurf` | `.agents/skills` |
| Devin Desktop                                  | `devin`    | `.agents/skills` |
| Cualquier otro agente que lea `.agents/skills` | `agents`   | `.agents/skills` |

`--user` escribe tus propias carpetas (`~/.claude/skills`, `~/.agents/skills`), para todo
proyecto. Una copia que ya está se conserva salvo que agregues `--force`, que reemplaza solo la
carpeta de la skill. El comando escribe solo carpetas de skills, nunca `AGENTS.md`, `CLAUDE.md` ni
otro archivo del proyecto. Sin la línea de comandos instalada, en la carpeta del proyecto:

```bash
npx @meltemi/diagrams-cli@latest skill install --agent <names>
```

La skill instalada nombra los comandos tal como están instalados (`mdg validate`, `mdg export`,
`mdg preview`), así que el agente ejecuta lo que tiene tu proyecto. A mano: copia
`skills/meltemi-diagrams/` del paquete (`node_modules/@meltemi/diagrams-cli/skills/`) a la carpeta
de la que tu agente lee las skills, o haz que las instrucciones del agente (un `AGENTS.md`, por
ejemplo) remitan a su `SKILL.md`.

## Lo que el agente demuestra

Siguiendo el prompt, el agente elige un flujo real de tu proyecto (un inicio de sesión, un pago,
una petición a través de los servicios) y lo escribe como un diagrama de secuencia pequeño en
`diagrams/`, con seis participantes y doce mensajes como mucho. En una carpeta sin código que leer,
usa el inicio de sesión que escribe `mdg init --template sequence`. Valida la hoja hasta que la
última línea dice `Checked 1 file: 0 errors, 0 warnings.`, exporta el SVG a su lado y te dice esa
línea, dónde quedó el SVG y en qué carpetas quedó la skill. Inicia `mdg preview`, un servidor
local, solo cuando pides ver el resultado en un navegador.

## Lo que nunca hace

- Imprimir, leer, copiar ni confirmar en un commit un token (un valor `mdg_…`, `MELTEMI_TOKEN`, el
  archivo de credenciales).
- Iniciar sesión, hacer push, pull, publicar ni ejecutar otro comando de la nube salvo que lo
  pidas.
- Hacer commit ni preparar nada, ni cambiar tu configuración, tu CI o los archivos de instrucciones
  de los agentes más allá de las carpetas de skills, sin preguntarte antes.
- Agregar `--force` o `--user` por su cuenta.
- Instalar ni descargar Node ni otra herramienta por su cuenta: si falta Node o es anterior a la
  22.12, te lo dice y se detiene.
- Dibujar una imagen a mano, editar un SVG exportado ni reescribir una fuente de Mermaid o
  PlantUML, que `mdg import` convierte.

## Pedir un diagrama

Nombra qué dibujar y la fuente que debe usar el agente. Dale el código, documento o diagrama
relevante para que pueda comprobar cómo funciona tu sistema.

| Pídele al agente                                                                                            | Resultado útil                                                              |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| «Lee los controladores del pago y dibuja los flujos aprobado y rechazado como un diagrama de secuencia»     | Un diagrama basado en tu implementación, con ambos escenarios               |
| «Haz una vista C4 de contenedores a partir de `docs/architecture.md`; marca todo lo que hayas inferido»     | Una vista de arquitectura revisable que identifica las relaciones inciertas |
| «Convierte `diagrams/billing.mmd` a Meltemi y conserva su disposición»                                      | Código editable importado desde Mermaid                                     |
| «Actualiza el diagrama de login para los cambios de código de esta rama y conserva mis posiciones manuales» | Documentación actualizada junto con la implementación                       |
| «Planifica el lanzamiento de `docs/plan.md` como un diagrama de Gantt»                                      | Tareas y dependencias que puedes ajustar en el lienzo                       |

Pídele validar el resultado, revisar la vista previa y decirte dónde abrirlo. Con la CLI, eso
significa un archivo fuente y un SVG, con `mdg preview` cuando quieras verlo en un navegador.
Con MCP conectado a un proyecto, pídele su URL para continuar en el mismo lienzo.

## A través del endpoint MCP

El servicio alojado tiene un endpoint MCP, `https://diagrams.meltemi.dev/mcp`, a través del cual un
agente trabaja en los proyectos de tu cuenta de Meltemi en lugar de una carpeta: crea proyectos,
escribe y valida sus archivos `.meltemi`, mira los dibujos como imágenes dibujadas en el servidor, y
los comparte, abre una sesión en vivo o los publica cuando se lo pides. Conecta Codex con OAuth:
inicias sesión en el navegador y apruebas lo que pide (leer y escribir tus proyectos, compartirlos,
sesiones en vivo, publicar):

```bash
codex mcp add meltemi --url https://diagrams.meltemi.dev/mcp
codex mcp login meltemi
```

O con un token de API que creas en el diálogo **Tokens de API** de la app (el menú de la cuenta),
guardado en el entorno como `MELTEMI_TOKEN` y nunca escrito en un archivo, en
`~/.codex/config.toml`:

```toml
[mcp_servers.meltemi]
url = "https://diagrams.meltemi.dev/mcp"
bearer_token_env_var = "MELTEMI_TOKEN"
```

La referencia de la skill para el endpoint le enseña al agente sus herramientas y su flujo de
trabajo. Lee un proyecto antes de escribir, y escribe con la revisión que leyó (`ifRevision`), así
que un cambio que hiciste en el navegador mientras tanto nunca se sobrescribe; le da una clave a cada
cambio, así que un reintento lo aplica una sola vez; valida, mira la vista previa y te da la
dirección que abre el proyecto, donde una página abierta muestra cada cambio sin recargar. Comparte,
invita, abre una sesión en vivo o publica solo cuando se lo pides, y dice lo que hizo: una invitación
es un enlace que puede darte, y no se envía ningún correo (la herramienta responde
`emailSent: false`). Nunca imprime un token, ni el enlace de una invitación o de una sesión en vivo
que no pediste. Los permisos que concedes nunca añaden un rol: una cuenta que es editora de un
proyecto escribe en él, pero solo su propietario lo comparte o lo publica. Las herramientas y sus
reglas están en [la referencia de la nube](cloud.md#el-endpoint-mcp).

## A través del servidor local

Usa MCP local cuando el agente corre en tu máquina y quieres que la validación y el dibujo se
ejecuten allí también. Tiene dos modos: **proyectos de tu cuenta** por defecto y **archivos
locales** con `--folder`. Iniciar el servidor por defecto no convierte una carpeta del disco en
un proyecto compartido con el navegador; para eso usa el [espacio de trabajo Docker](local-compose.md).

La línea de comandos sirve las herramientas de cuenta en tu máquina: `mdg mcp`, un servidor MCP local
por HTTP streamable. Actúa sobre los proyectos de tu cuenta a través de la API del servicio, con tu
`mdg login` (o `MELTEMI_TOKEN` en su entorno), y dibuja las vistas previas, comprueba los archivos y
arma los catálogos en tu máquina, con el motor que usa el endpoint: las mismas herramientas, las
mismas respuestas y las mismas imágenes. Elígelo para un agente que corre en tu máquina (la línea de
comandos o la app de Codex, Claude Code, Cursor); un cliente que solo llega a una dirección de
internet usa el endpoint. Si el endpoint alojado responde `renderer.unavailable`, usa este modo
para seguir trabajando sobre los mismos proyectos de tu cuenta con el dibujo en tu máquina.
Ponlo en marcha en una terminal y déjalo así mientras el agente trabaja:

```bash
npx -y @meltemi/diagrams-cli@latest mcp
```

Imprime su dirección, `http://127.0.0.1:7373/mcp` (`--port` elige otra). Conecta el agente a ella
una vez:

```bash
codex mcp add meltemi --url http://127.0.0.1:7373/mcp
```

```bash
claude mcp add --transport http meltemi http://127.0.0.1:7373/mcp
```

En Cursor, `.cursor/mcp.json` lleva `{ "mcpServers": { "meltemi": { "url": "http://127.0.0.1:7373/mcp" } } }`.
Sin sesión iniciada el servidor arranca igual, y sus herramientas responden `auth.required` hasta que
ejecutas `mdg login` en otra terminal; la llamada siguiente ya la usa.

Con `--folder`, sirve tres herramientas, `validate`, `inspect_story` y `preview`, sobre los archivos `.meltemi` de una
carpeta del disco, sin cuenta y sin red: un agente que trabaja en un repositorio escribe los archivos
con sus propias herramientas y los mira como imágenes.

Para una historia, `inspect_story` recibe su archivo `path` y su id `story` (además de `project`
en modo cuenta). Informa la duración total compilada, escenas ordenadas, vistas activas,
transiciones y tiempos de acciones anidadas en milisegundos. Previsualiza el `startMs` y el
`stillAtMs` de cada escena y compara la revisión de la imagen con la inspección: cada llamada
lee la instantánea actual, por lo que otra edición puede exigir inspeccionar de nuevo. En modo
carpeta, la revisión identifica el contenido en disco, no una revisión de escritura en nube.
La [guía de historias](../../skills/meltemi-diagrams/reference/stories.md) del skill cubre la
creación, los ajustes de tiempo, el orden y el borrado conservando comentarios y otras historias.

```bash
npx -y @meltemi/diagrams-cli@latest mcp --folder .
```

Escucha solo en `127.0.0.1` y rechaza las peticiones de páginas web. En una computadora donde otras
personas inician sesión, define `MELTEMI_MCP_KEY` (16 caracteres o más) en el entorno del servidor y
en el del agente: cada petición debe llevarla entonces como token bearer
(`--bearer-token-env-var MELTEMI_MCP_KEY` en Codex, `--header "Authorization: Bearer …"` en Claude
Code). El comando, sus opciones y sus rechazos están en [la línea de comandos](cli.md#el-servidor-mcp-local-mcp).

## Con el espacio de trabajo Docker

[El espacio de trabajo local con Docker](local-compose.md) inicia editor, backend y MCP juntos
con `docker compose up`, sin cuenta ni token. **Configurar mi agente** en el editor entrega un
prompt que instala el plugin real de Meltemi y su entrada MCP nativa para Claude Code o Codex.
El plugin edita el mismo proyecto del backend que el navegador abierto; no necesita una CLI
en el equipo ni otro proceso `mdg mcp`. Sigue la continuación de activación antes de diagramar.

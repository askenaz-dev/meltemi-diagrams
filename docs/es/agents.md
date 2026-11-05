# Dibujar con agentes de programación

[English](../agents.md)

Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, Devin Desktop y otros agentes de
programación dibujan, convierten y exportan diagramas de Meltemi con la skill `meltemi-diagrams`:
un flujo de trabajo, una plantilla, las reglas que ahorran iteraciones, referencias del lenguaje,
la disposición, los temas, C4, los diagramas de secuencia, los diagramas de Gantt, las composiciones
libres, las historias y la conversión, y ejemplos completos. Un agente que la lee escribe archivos `.meltemi`, los valida
con la línea de comandos y corrige lo que esta informa, en lugar de dibujar imágenes a mano. Esta
página también está en la web, en
[diagrams.meltemi.dev/es/agent-setup](https://diagrams.meltemi.dev/es/agent-setup/), enlazada
desde el diálogo Acerca de Meltemi Diagrams de la app web.

## El prompt

Pega esto en tu agente de programación, en tu proyecto. El prompt está en inglés, el idioma en que
el agente lee la guía; el agente te responde en el tuyo:

```text
Set up Meltemi Diagrams in this project so you can draw diagrams as code, and prove it works — you'll need terminal access on this machine and Node 22.12 or later. First read https://diagrams.meltemi.dev/agent-setup/prompt.md and follow it. Install the meltemi-diagrams skill for the coding agents this project uses (ask me if it's unclear which) with `npx @meltemi/diagrams-cli@latest skill install`. Then prove it: write a small sequence diagram of one flow of this project, validate it until no diagnostic remains, export the SVG, and show me the validation's last line and where the SVG is. Never sign in to the cloud, never print or commit a token, and don't commit or change my project's configuration beyond the skill folders without asking me first.
```

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

Pide con tus palabras, nombrando qué dibujar y a partir de qué: "dibuja el servicio de pago de
`docs/architecture.md` como un diagrama de flujo", "convierte `diagrams/billing.mmd` a Meltemi y
conserva su disposición", "agrega un diagrama de secuencia del pago con un escenario aprobado y uno
rechazado", "haz una vista C4 de contenedores de la tienda", "planifica el lanzamiento de `docs/plan.md` como un
diagrama de Gantt". La skill le indica al agente que
importe las fuentes de Mermaid y PlantUML en vez de reescribirlas, que elija el perfil (flujo,
libre, secuencia, C4 o Gantt), que valide hasta que no quede ningún diagnóstico y que exporte SVG para que
lo veas con `mdg preview`.

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
reglas están en [el endpoint MCP](cloud.md#el-endpoint-mcp), y cómo se acepta el endpoint en
[la aceptación del MCP](../quality/mcp-acceptance.md).

## En este repositorio

La skill canónica es `skills/meltemi-diagrams/`; `pnpm skills:sync` la copia en `.claude/skills/`,
`.agents/skills/` y el paquete de la línea de comandos, y una prueba falla cuando una copia se
desvía. El prompt de configuración es `packages/cli/agent-setup/prompt.md`, que el build de
la app sirve junto a la página `agent-setup/`. Consulta
[la línea de comandos](cli.md#skill-de-agentes) para `skill install` y `skill prompt`.

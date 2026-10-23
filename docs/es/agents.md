# Dibujar con agentes de programación

[English](../agents.md)

Claude Code, Codex y otros agentes de programación dibujan, convierten y exportan diagramas de
Meltemi con la skill `meltemi-diagrams`: un flujo de trabajo, una plantilla, las reglas que ahorran
iteraciones, referencias del lenguaje, la disposición, C4, los diagramas de secuencia, las
composiciones libres, las historias y la conversión, y ejemplos completos. Un agente que la lee
escribe archivos `.meltemi`, los valida con la línea de comandos y corrige lo que esta informa, en
lugar de dibujar imágenes a mano.

## Instalar la skill

La línea de comandos trae la skill. En la carpeta de un proyecto:

```bash
mdg skill install
```

Escribe `.claude/skills/meltemi-diagrams/` para Claude Code y `.codex/skills/meltemi-diagrams/`
para Codex. `--agent claude` o `--agent codex` escribe una de ellas; `--user` las escribe en tus
propias carpetas (`~/.claude/skills`, `~/.codex/skills`), para todo proyecto; una copia que ya está
se conserva salvo que agregues `--force`, que reemplaza solo la carpeta de la skill. Sin la línea
de comandos instalada:

```bash
npx @meltemi/diagrams-cli skill install
```

La skill instalada nombra los comandos tal como están instalados (`mdg validate`, `mdg export`,
`mdg preview`), así que el agente ejecuta lo que tiene tu proyecto. Otro agente la lee de los mismos
archivos: copia `skills/meltemi-diagrams/` del paquete (`node_modules/@meltemi/diagrams-cli/skills/`)
a la carpeta de la que tu agente lee las skills, o haz que las instrucciones del agente (un
`AGENTS.md`, por ejemplo) remitan a su `SKILL.md`.

## Pedir un diagrama

Pide con tus palabras, nombrando qué dibujar y a partir de qué: "dibuja el servicio de pago de
`docs/architecture.md` como un diagrama de flujo", "convierte `diagrams/billing.mmd` a Meltemi y
conserva su disposición", "agrega un diagrama de secuencia del pago con un escenario aprobado y uno
rechazado", "haz una vista C4 de contenedores de la tienda". La skill le indica al agente que
importe las fuentes de Mermaid y PlantUML en vez de reescribirlas, que elija el perfil (flujo,
libre, secuencia o C4), que valide hasta que no quede ningún diagnóstico y que exporte SVG para que
lo veas con `mdg preview`.

## En este repositorio

La skill canónica es `skills/meltemi-diagrams/`; `pnpm skills:sync` la copia en `.claude/skills/`,
`.codex/skills/` y el paquete de la línea de comandos, y una prueba falla cuando una copia se
desvía. Consulta [la línea de comandos](cli.md#skill-de-agentes) para `skill install`.

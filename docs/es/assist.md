# Asistencia de IA

[English](../assist.md)

La asistencia es una ayuda opcional para escribir y cambiar código fuente `.meltemi`. La validación,
la disposición, la exportación, los catálogos y las revisiones nunca la usan, y un proyecto funciona
igual sin ella. Cada respuesta se convierte en una **propuesta**: bloques enteros que reemplazar,
agregar o quitar, un archivo nuevo o relaciones marcadas como supuestos. Ves qué cambia cada punto,
aceptas los que quieras, y no se escribe nada que agregue errores (decisión 0029).

| Operación   | Qué hace                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `generate`  | Escribe una primera estructura a partir de una descripción: una hoja nueva, que puede importar los modelos del proyecto     |
| `modify`    | Cambia una hoja según lo que pidas: elementos nuevos, una vista para un público, una historia, una entidad con otro nombre… |
| `relations` | Sugiere relaciones que probablemente faltan, cada una marcada con `assumption "<why>"`                                      |
| `explain`   | Explica qué cambió desde una revisión de Git u otra versión, para quien revisa                                              |

## Proveedores y claves

| Proveedor           | Ajustes                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | La clave en `ANTHROPIC_API_KEY` (o en el almacenamiento de secretos de VS Code); el modelo `claude-opus-5-5` de forma predeterminada                     |
| `openai-compatible` | `MELTEMI_AI_BASE_URL`, como `http://127.0.0.1:11434/v1` (Ollama, llama.cpp, LM Studio), y `MELTEMI_AI_MODEL`; una clave opcional en `MELTEMI_AI_API_KEY` |

La línea de comandos lee `MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`,
`MELTEMI_AI_API_KEY` y `ANTHROPIC_API_KEY`, o `--provider`, `--model` y `--base-url`. Las claves
nunca son opciones (acabarían en el historial del shell) ni están nunca en los archivos del
proyecto. VS Code lee los ajustes **Meltemi Diagrams › Assist** y guarda la clave en su
almacenamiento de secretos (**Establecer la clave de IA…**, **Borrar la clave de IA**). Los errores
nunca muestran una clave.

## Qué se envía

Antes de enviar nada, ves adónde va y qué contiene:

```text
This request goes to anthropic (claude-opus-5-5) at https://api.anthropic.com, with:
  diagrams/containers.meltemi (0.6 KB, the file)
  models/commerce.meltemi (0.9 KB, imported by it)
  your request (31 characters)
  the language guide
Send it? [y/N]
```

Una solicitud lleva el archivo y los archivos que importa (si es un archivo nuevo, los modelos y los
temas del proyecto, que puede importar), como máximo 12 archivos y 200 KB, con rutas relativas al
proyecto, más la guía del lenguaje (las referencias de la skill para agentes). No se envía nada más
del repositorio, y ningún otro comando envía nada. Si el punto de conexión es local, se indica que
está en esta máquina.

## Propuestas

```bash
pnpm mdg assist modify architecture/diagrams/containers.meltemi --prompt "Add a cache for the API" --save cache.json
```

```text
Proposal for architecture/diagrams/containers.meltemi (revision cn-b374b3a1, anthropic claude-opus-5-5): A cache in front of the database
  1. replace diagram containers: Reads go through a cache
       + element shop.cache "Cache"
       + relation cache (API → Cache: Reads)
Saved cache.json; apply with meltemi-diagrams assist apply cache.json --items <list>
```

```bash
pnpm mdg assist apply cache.json --items 1
```

- Los **puntos** son bloques enteros (un diagrama, un modelo, una historia, un tema o un perfil de
  exportación), un archivo nuevo o una relación; cada uno enumera lo que cambia, como hace `review`.
- **Aceptación parcial**: elige los puntos con `--items 1,3` (o `--apply 1,3` de una vez); en
  VS Code, la propuesta se abre como un diff y una lista te permite elegir; los puntos aceptados se
  aplican como un solo paso de deshacer.
- **Revisión conocida**: una propuesta registra el texto a partir del cual se hizo. Si el archivo
  cambió desde entonces, los puntos cuyo bloque cambió se dejan fuera como conflictos y los demás se
  aplican.
- **Validación**: el resultado se compila en su proyecto; si tiene errores que el texto actual no
  tiene, no se escribe nada. Cuando la propuesta entera agrega errores, estos se devuelven una vez
  al modelo para obtener una respuesta corregida.

## Supuestos

Las relaciones que infiere el asistente se escriben con `assumption "<why>"`:

```text
api -> cache: "Reads" { assumption "Reads of orders are usually cached" }
```

Se dibujan discontinuas con el color atenuado, llevan una insignia en el catálogo y `review` las
informa. Para confirmar una, quita su línea `assumption`; en VS Code lo hace la corrección rápida
**Confirmar la relación**. Los modelos también aceptan `assumption`, y una relación de una vista C4
es un supuesto cuando lo son todas las relaciones del modelo que representa.

## Explicaciones

```bash
pnpm mdg assist explain architecture --base main
```

muestra una breve explicación de la revisión entre `main` y el árbol de trabajo (o
`--before <path>`). **Explicar los cambios con IA** de VS Code explica en un documento Markdown los
cambios desde el último commit.

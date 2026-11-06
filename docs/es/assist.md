# Asistencia de IA integrada

[English](../assist.md)

Pide un primer diagrama, un cambio en uno existente o una explicación de un diff sin salir de
VS Code o de la línea de comandos. Meltemi envía tu petición y los archivos `.meltemi` pertinentes
al modelo que configures. Los cambios vuelven como una **propuesta**: revisas el diff y eliges los
puntos que quieres aplicar.

Úsala para una tarea concreta sobre un diagrama. Si quieres que tu agente de programación lea tu
aplicación, documente su arquitectura o trabaje en proyectos abiertos en el editor web, empieza
por [Dibujar con agentes: skill y MCP](agents.md). Una skill enseña al agente a dibujar; MCP le da
herramientas para trabajar con Meltemi. Ninguno configura el proveedor de esta asistencia integrada.

La asistencia integrada está disponible en la **extensión de VS Code y la CLI**, con tu propia
configuración de proveedor. No es un chat en el editor del navegador. No necesitas una cuenta de
Meltemi para usarla con archivos locales. La validación, la disposición, la exportación, los
catálogos y las revisiones del código fuente funcionan sin IA.

## Elige una tarea

| Quieres…                       | Operación   | Ejemplo de petición                                                                           |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| Empezar con una descripción    | `generate`  | «Dibuja el pago como un diagrama de secuencia, incluyendo un pago rechazado».                 |
| Cambiar un diagrama existente  | `modify`    | «Agrega una caché entre la API y la base de datos; conserva las etiquetas actuales».          |
| Encontrar vacíos que comprobar | `relations` | Sugiere relaciones que faltan; las inferidas se marcan como supuestos para que las confirmes. |
| Preparar una revisión          | `explain`   | Explica los cambios desde `main` para quien revisa el diagrama.                               |

La generación crea una hoja nueva y puede reutilizar modelos importados del proyecto. La
modificación puede agregar o quitar elementos, adaptar una vista a un público o agregar una
historia. Son cambios de código fuente que puedes conservar en Git y seguir editando en el lienzo.

## Configura un proveedor

En VS Code, instala [la extensión de Meltemi Diagrams](editor.md), abre **Meltemi Diagrams › Assist**
en Ajustes y elige un proveedor. Configura el modelo y el endpoint cuando corresponda; luego usa
**Meltemi Diagrams: Establecer la clave de IA…** desde la paleta de comandos para guardar su clave.
Abre un archivo `.meltemi` y ejecuta **Meltemi Diagrams: Modificar con IA…**, o usa
**Generar un diagrama con IA…** para empezar uno nuevo. VS Code muestra el diff propuesto y te
permite elegir sus puntos antes de aplicarlos.

Para la línea de comandos, instala la CLI:

```bash
npm install --global @meltemi/diagrams-cli
```

Configura el proveedor en el entorno de tu terminal:

| Proveedor           | Ajustes                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | La clave en `ANTHROPIC_API_KEY` (o en el almacenamiento de secretos de VS Code); el modelo `claude-opus-5-5` de forma predeterminada                     |
| `openai-compatible` | `MELTEMI_AI_BASE_URL`, como `http://127.0.0.1:11434/v1` (Ollama, llama.cpp, LM Studio), y `MELTEMI_AI_MODEL`; una clave opcional en `MELTEMI_AI_API_KEY` |

Para Anthropic, establece `MELTEMI_AI_PROVIDER` en `anthropic` y proporciona `ANTHROPIC_API_KEY`.
Para un servidor local o remoto compatible con OpenAI, establece `MELTEMI_AI_PROVIDER` en
`openai-compatible`, `MELTEMI_AI_BASE_URL` en su endpoint y `MELTEMI_AI_MODEL` en un modelo que
sirva; proporciona `MELTEMI_AI_API_KEY` si el servidor lo exige. Inicia el servidor de modelos
local por separado antes de hacer una petición.

La línea de comandos lee `MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`,
`MELTEMI_AI_API_KEY` y `ANTHROPIC_API_KEY`, o `--provider`, `--model` y `--base-url`. Las claves
nunca son opciones (acabarían en el historial del shell) ni están nunca en los archivos del
proyecto. VS Code lee los ajustes **Meltemi Diagrams › Assist** y guarda la clave en su
almacenamiento de secretos (**Establecer la clave de IA…**, **Borrar la clave de IA**). Los errores
nunca muestran una clave.

## Haz y revisa un primer cambio

En un proyecto con un diagrama existente, pide un cambio pequeño y guarda su propuesta:

```bash
mdg assist modify architecture/diagrams/containers.meltemi --prompt "Add a cache for the API" --save cache.json
```

Sustituye la ruta por la de tu archivo. El comando muestra el destino y los archivos que enviará
y pide confirmación. Cuando termine, lee los cambios numerados:

```text
Proposal for architecture/diagrams/containers.meltemi (revision cn-b374b3a1, anthropic claude-opus-5-5): A cache in front of the database
  1. replace diagram containers: Reads go through a cache
       + element shop.cache "Cache"
       + relation cache (API → Cache: Reads)
Saved cache.json; apply with meltemi-diagrams assist apply cache.json --items <list>
```

Acepta solo los puntos que quieras; en este ejemplo, el punto 1:

```bash
mdg assist apply cache.json --items 1
```

El archivo fuente cambia solo cuando aplicas la propuesta. Ábrelo en el editor para inspeccionar
el diagrama y revisar el diff de su código antes de hacer commit. Puedes descartar `cache.json`
sin aplicarlo.

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
proyecto, más la guía del lenguaje (las referencias de la skill para agentes). Esa petición no
incluye otro contenido del repositorio. Si el punto de conexión es local, se indica que está en
esta máquina. La validación, la disposición y la exportación no llaman al modelo.

## Propuestas

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
mdg assist explain architecture --base main
```

muestra una breve explicación de la revisión entre `main` y el árbol de trabajo (o
`--before <path>`). **Explicar los cambios con IA** de VS Code explica en un documento Markdown los
cambios desde el último commit.

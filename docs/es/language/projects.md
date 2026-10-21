# Proyectos e importaciones

[English](../../language/projects.md)

Un proyecto de Meltemi Diagrams es una carpeta normal. Los diagramas, los temas, los modelos, las
historias y los perfiles de exportación pueden vivir en archivos `.meltemi` separados y hacer
referencia unos a otros mediante importaciones relativas con nombres explícitos. No se guarda nada
fuera de los archivos: ni base de datos ni estado oculto.

```text
architecture/
  project.json
  models/commerce.meltemi
  diagrams/checkout.meltemi
  diagrams/payment.meltemi
  stories/purchase.meltemi
  themes/company.meltemi
  assets/icons/          icon packs: <prefix>.json (Iconify) or <prefix>/*.svg
  assets/fonts/          project fonts
  assets/licenses.json   licences of the packs and fonts
  assets.lock.json       versions and hashes, written by `meltemi-diagrams assets lock`
```

Los iconos, las fuentes, las licencias y el archivo de bloqueo se describen en
[assets.md](assets.md).

## project.json

`project.json` marca la raíz del proyecto. Los editores pueden validarlo y autocompletarlo con
`schemas/project.schema.json`.

```json
{
  "$schema": "../schemas/project.schema.json",
  "name": "commerce",
  "language": "0.2",
  "tools": { "meltemi-diagrams": "^1.0.0" },
  "sources": ["diagrams", "themes"],
  "exclude": ["drafts"],
  "theme": "themes/company.meltemi#corporate",
  "locale": "es"
}
```

| Campo      | Obligatorio | Significado                                                                                                              |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`     | sí          | Nombre del proyecto, que se muestra en los catálogos y los informes.                                                     |
| `language` | sí          | Versión del lenguaje de todos los archivos. Se informa un problema en cada archivo con otro encabezado `language`.       |
| `tools`    | no          | Rango de versiones de `meltemi-diagrams`: exacta, `^x.y.z`, `~x.y.z`, comparadores, `\|\|` o `*`.                        |
| `sources`  | no          | Carpetas o archivos que compilar, relativos a `project.json`. Predeterminado: `["."]`.                                   |
| `exclude`  | no          | Rutas que nunca se compilan. `node_modules` y las carpetas ocultas siempre se excluyen.                                  |
| `format`   | no          | Ajustes del formateador: `{ "indent": 2 }`, de 1 a 8 espacios o `"tab"`.                                                 |
| `theme`    | no          | Tema predeterminado de los diagramas sin `theme`: un nombre integrado o `<path>#<theme id>`.                             |
| `locale`   | no          | Idioma de las palabras que la herramienta agrega a las exportaciones: `"en"` (predeterminado) o `"es"`. Véase más abajo. |
| `icons`    | no          | Alias de paquetes de iconos, como `{ "cloud": "aws" }` para `cloud:lambda`.                                              |
| `catalog`  | no          | `title`, `description`, `out`, `exclude` y `source` del catálogo HTML ([catalog.md](../catalog.md)).                     |
| `plugins`  | no          | Plugins instalados: carpeta, versión exacta y permisos concedidos ([plugins.md](../plugins.md)).                         |
| `cloud`    | no          | El proyecto de la nube que refleja la carpeta: `host` y `project` ([más abajo](#el-proyecto-de-la-nube)).                |
| `$schema`  | no          | Ubicación del esquema para los editores.                                                                                 |

Los problemas son diagnósticos `project.*` situados en `project.json` (véase
[diagnostics.md](diagnostics.md)).

## Raíz del proyecto

La raíz de un archivo es la carpeta más cercana que contiene `project.json`, empezando por la del
propio archivo. Si no hay ninguna, la raíz es la carpeta del propio archivo, así que un archivo
suelto puede importar igualmente los archivos que están a su lado o debajo.

## Importaciones

```text
language "0.2"

import "../themes/company.meltemi" as company
import corporate as corp, base from "../themes/company.meltemi"
```

- **Importación con espacio de nombres** (`import "<path>" as <ns>`): cada bloque de nivel superior
  del módulo se alcanza como `<ns>.<id>`, por ejemplo `company.corporate`.
- **Importación de miembros** (`import <id> [as <alias>], ... from "<path>"`): cada bloque de la
  lista se vincula con su id o con su alias.

Reglas:

- Las importaciones van después del encabezado `language` y antes del primer bloque
  (`module.import-position`).
- Las rutas son relativas al archivo que importa, empiezan por `./` o `../`, usan `/`, terminan en
  `.meltemi` y distinguen mayúsculas de minúsculas. Las URL y las rutas absolutas se rechazan, así
  que nunca se descarga nada de la red (`module.invalid-path`).
- Una ruta que sale de la raíz del proyecto es `module.outside-project`. Un archivo que no existe es
  `module.not-found`, que nombra un archivo que solo difiere en mayúsculas y minúsculas.
- Los nombres vinculados comparten el espacio de nombres de nivel superior del archivo con sus
  diagramas y temas (`ref.duplicate-id`). `technical`, `editorial` y `stage` están reservados porque
  los nombres de los temas integrados empiezan por ellos (`module.reserved-name`).
- Importar un id que el módulo no define es `module.unknown-member`. Importar el mismo archivo dos
  veces es `module.duplicate-import`. Un nombre que nunca se usa es `module.unused-import`
  (información).
- Todos los bloques de nivel superior se pueden importar. No hay lista de exportaciones.

## Ciclos

Los módulos no pueden importarse unos a otros en un ciclo. La importación que cierra el ciclo es
`module.cycle`, con la cadena en el mensaje (`a.meltemi → b.meltemi → a.meltemi`). Sus nombres
quedan sin resolver y la compilación continúa. Los ciclos entre relaciones dentro de un diagrama son
normales y no se ven afectados.

## Temas entre archivos

Los temas importados se usan por su nombre en cualquier lugar donde se escribe un nombre de tema:

```text
diagram checkout: flow {
  theme "corp"                      // member binding
}
theme local { extends "company.base"; accent "#ff0000" }   // namespace-qualified
```

Un tema importado resuelve su propio `extends` en su propio archivo. Un nombre que empieza por un
vínculo de importación pero no se resuelve en nada es `theme.unknown-base` en un `extends` y
`layout.unknown-theme` en un diagrama.

## Tema predeterminado

`"theme"` en `project.json` da un tema predeterminado a cada diagrama sin propiedad `theme`: un
nombre integrado como `"editorial.light"`, o `"<path>#<theme id>"` relativo a `project.json`, como
`"themes/company.meltemi#corporate"`. El archivo se suma a todas las compilaciones del proyecto, así
que los diagramas usan el tema, sus clases y sus reglas sin importarlo. El `theme` propio de un
diagrama y el `--theme` de la exportación siguen teniendo prioridad. Un valor mal formado, un
archivo que no existe o un archivo que no declara el tema es `project.invalid-value` sobre el valor,
y entonces los diagramas usan `technical.light`.

La compilación de proyectos comprueba cada clase aplicada contra las clases del diagrama, su cadena
de temas (su propio tema, el tema predeterminado o `technical.light`) y las clases integradas; un
nombre desconocido es `theme.unknown-class` (advertencia).

## Idioma de las exportaciones

`"locale"` fija el idioma de las palabras que la propia herramienta agrega a lo que exporta el
proyecto: las líneas de tipo de las entidades C4 (`[Container: Go]` o `[Contenedor: Go]`,
`External Person` o `Persona externa`), los controles y los resúmenes de los reproductores HTML, y
los encabezados y la búsqueda del catálogo HTML, cuyas páginas también lo llevan como su `lang`. Es
`"en"` (el predeterminado) o `"es"`; cualquier otro valor es `project.invalid-value` y el proyecto
se exporta en inglés.

Las palabras que escriben las personas (etiquetas, descripciones, títulos) nunca se traducen, ni
tampoco las palabras clave y los valores del lenguaje. El ajuste forma parte de la entrada, así que
los mismos archivos fuente y las mismas opciones exportan los mismos bytes en todas las máquinas: el
idioma de la máquina, del editor o del navegador nunca cambia un archivo exportado. La opción
`--lang en|es` de la línea de comandos y el diálogo de exportación del playground eligen otro idioma
para una exportación.

## El proyecto de la nube

`"cloud"` anota qué proyecto de la nube refleja una carpeta, para que `push`, `pull`, `publish` y
`review --base cloud` no necesiten ningún argumento
([la línea de comandos](../cli.md#los-comandos-de-la-nube)):

```json
{
  "name": "commerce",
  "language": "0.2",
  "cloud": { "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }
}
```

`host` es el origen del servicio: `https:`, o `http:` solo para `127.0.0.1`, `localhost` y `[::1]`.
`project` es el id del proyecto de la nube, 20 letras minúsculas y dígitos. `mdg push --create` crea
el proyecto y escribe el ajuste, y `mdg pull` lo agrega a una carpeta que no lo tiene; los dos lo
escriben como un objeto en una sola línea y dejan el resto del archivo tal como estaba, byte por
byte: su sangría, sus finales de línea y una marca de orden de bytes.

El ajuste nombra un servicio y nunca decide adónde va un token. Un comando que habla con otro host
que `host` falla con `cloud.host-mismatch` antes de cualquier solicitud, así que un repositorio que
clonaste no puede hacer que tu inicio de sesión viaje a ningún sitio
([el host y el token](../cli.md#el-host-y-el-token)). Haz commit de `project.json` con el ajuste: no
contiene ningún secreto. El id, eso sí, es la dirección del proyecto (`/p/<id>`), y en un repositorio
público cualquiera puede usarla como lo permite el nivel del enlace del proyecto
([compartir](../cloud.md#compartir-y-permisos)), así que mantén el proyecto privado salvo que su
enlace deba ser público.

Un `cloud` que no es un objeto con los dos ajustes, un `host` que no es un origen de ese tipo y un
`project` que no es un id son `project.invalid-value`, y entonces la carpeta no refleja ningún
proyecto; un ajuste escrito dos veces también es `project.invalid-value`, y cuenta el primero. Un
ajuste desconocido dentro de `cloud` es `project.unknown-field` (una advertencia).

## Referencias a otros bloques

El modelo de `using` en C4, el diagrama de `for` en una historia y el destino de `for` en una
exportación se resuelven de la misma manera: primero un id local, luego un vínculo de miembro y
luego `<ns>.<id>`. Una referencia a un bloque del tipo equivocado nombra el tipo que encontró.

## Compilación

`@meltemi/diagrams-project` compila los proyectos para la CLI, el editor y el playground:

- `Workspace` compila un archivo con sus importaciones (`compileFile`) o el proyecto completo
  (`compileProject`).
- Los resultados de cada archivo se guardan en caché según su texto, así que un cambio solo vuelve a
  compilar el archivo modificado. Los archivos que lo importan se vuelven a resolver, lo que es
  barato.
- Los búferes del editor sin guardar se pasan como superposiciones (`setOverlay`).
- `themeDefinitionsFor(file)` y `projectTheme(program)` dan a la disposición todos los temas
  disponibles y el tema predeterminado del proyecto (`LayoutOptions.themes` y `defaultTheme`).
- `assets()` descubre los paquetes de iconos, las fuentes, las licencias y el archivo de bloqueo, y
  su registro es el `icons` de la disposición. Los iconos se comprueban contra él cuando la
  aplicación anfitriona pasa servicios de recursos.
- No se escribe ninguna caché en el disco. Si alguna vez una herramienta la necesita, irá en
  `.meltemi/cache/`, que siempre se excluye y se puede eliminar sin riesgo.

La línea de comandos lo usa automáticamente:

```bash
pnpm mdg validate architecture/
```

```bash
pnpm mdg export architecture/diagrams/checkout.meltemi
```

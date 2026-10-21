# Iconos y recursos

[English](../../language/assets.md)

Los diagramas dibujan iconos por su nombre y pueden usar las fuentes del proyecto. Cada paquete de
iconos y cada fuente que usa un proyecto tiene una versión, un origen y una licencia conocidos, y un
archivo de bloqueo los registra para que ningún cambio pase inadvertido. No se descarga nada: el
paquete integrado viene con la herramienta, y los recursos del proyecto son archivos del proyecto.

## Iconos

Un icono se escribe `"<pack>:<name>"` en la propiedad de estilo `icon`, así que pueden asignarlo las
instrucciones `style`, las clases y las reglas:

```text
diagram checkout: flow {
  rule data { icon "tabler:database"; iconColor accent }
  class edge { icon "tabler:server" }

  api["API"] { class edge }
  worker["Worker"]
  api -> worker: "jobs" as jobs

  style worker { icon "tabler:cpu"; iconPosition top }
  style jobs { icon "tabler:clock" }
}
```

| Destino                                | Dónde va el icono                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nodo, decisión, almacén de datos, caja | junto al texto (`iconPosition left`, el predeterminado, o `right`), encima o debajo (`top`, `bottom`), centrado en la caja; o, con `center`, como el dibujo de la caja, con la etiqueta en un borde por dentro |
| nodo o caja con `shape icon`           | el icono es el elemento, con la etiqueta fuera ([free.md](free.md#iconos-como-formas))                                                                                                                         |
| grupo                                  | antes del título                                                                                                                                                                                               |
| marca, nota                            | antes del texto, o antes de la primera línea de una nota                                                                                                                                                       |
| relación                               | antes de la etiqueta, dentro de su cápsula; sin etiqueta, solo en una cápsula pequeña                                                                                                                          |

- `iconSize` (un token del tema: technical 18, editorial 16, stage 24) es el lado del cuadrado en el
  que se dibujan los iconos de las cajas junto a su texto. La propiedad de estilo `iconSize` lo fija
  por elemento, de 8 a 128, o `auto` para ajustarlo a la caja
  ([styles.md](styles.md#iconos-en-las-cajas)). Los demás destinos usan 1,3 veces el tamaño de su
  texto.
- `iconPosition` es un token del tema y una propiedad de estilo; los temas stage ponen los iconos
  encima. `labelPosition` coloca la etiqueta alrededor de un icono centrado o de una forma de
  icono.
- Los iconos monocromos toman `iconColor`, que acepta nombres de tokens de color, o si no, el color
  del texto del destino. Los iconos con colores propios, como los de los proveedores, los conservan.
- Las cajas sin `size` crecen para que quepa el icono, y `layout.text-overflow` lo tiene en cuenta.
- Los iconos se normalizan entre paquetes. La proporción óptica de un paquete es la fracción mediana
  de su viewBox que ocupan sus iconos. Cada paquete se escala para que sus iconos ocupen la misma
  fracción que los de Tabler, 20 de 24 unidades. Los iconos se centran en su propio viewBox. Un
  icono dibujado como la forma (`shape icon`) no se reescala: llena su cuadrado, así que los
  conectores lo tocan.

En el SVG, un icono es un grupo `<g data-id="tabler:server" data-role="icon">` que contiene trazados
simples, con los degradados en `<defs>`. Nada se referencia con `<use>` ni `<image>`, así que los
archivos siguen siendo portables.

## Paquetes

| Paquete                  | Archivos                           | Nombres                                                  | Licencia                                            |
| ------------------------ | ---------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `tabler` (integrado)     | `@tabler/icons` 3.48.0             | `tabler:server`; variantes rellenas `tabler:star-filled` | MIT, Paweł Kuna                                     |
| `aws` (integrado)        | AWS Architecture Icons             | `aws:lambda`, `aws:group-vpc`, `aws:client`              | condiciones de AWS: diagramas de arquitectura       |
| `azure` (integrado)      | Azure architecture icons           | `azure:virtual-machine`                                  | condiciones de Microsoft: diagramas de arquitectura |
| `gcp` (integrado)        | Google Cloud icons                 | `gcp:cloud-run`                                          | condiciones de Google: diagramas de arquitectura    |
| `kubernetes` (integrado) | Kubernetes icons                   | `kubernetes:pod`, `kubernetes:sts`                       | Apache-2.0, los autores de Kubernetes               |
| `logos` (integrado)      | SVG Logos (`@iconify-json/logos`)  | `logos:postgresql`, `logos:docker-icon`                  | CC0-1.0                                             |
| JSON de Iconify          | `assets/icons/<prefix>.json`       | `<prefix>:<name>` y los alias del archivo                | el `info` del archivo, o `assets/licenses.json`     |
| Carpeta de SVG           | `assets/icons/<prefix>/<name>.svg` | `<prefix>:<name>`                                        | `assets/licenses.json`                              |

- Los prefijos usan letras minúsculas, dígitos y guiones. Un paquete del proyecto no puede
  reutilizar `tabler` ni el prefijo de otro paquete del proyecto o de un plugin
  (`asset.duplicate-pack`). Un paquete del proyecto con el nombre de un paquete de proveedor
  integrado (`aws`, `azure`, `gcp`, `kubernetes`, `logos`) lo reemplaza, para adoptar un conjunto
  más reciente del proveedor.
- El `prefix` de un archivo de Iconify debe ser igual al nombre del archivo.
- `"icons": { "cloud": "aws" }` en `project.json` agrega alias: `cloud:lambda` es `aws:lambda`.

Busca nombres de iconos con la línea de comandos, que compara los nombres, las palabras clave y las
categorías:

```bash
pnpm mdg assets icons cloud upload
```

### Iconos de proveedores

Los conjuntos de AWS, Azure, Google Cloud y Kubernetes vienen integrados, convertidos sin
modificaciones desde las descargas de cada proveedor con `pnpm vendor:icons` en
`packages/assets/vendor/`, con las categorías del proveedor y una etiqueta por icono
(`aws:lambda` es «AWS Lambda»). Cada uno conserva las condiciones de su proveedor, que permiten
diagramas de arquitectura y documentación: la herramienta las recoge en
`THIRD_PARTY_LICENSES.md` y en los avisos de la extensión y del playground, y los paquetes `aws`,
`azure` y `gcp` declaran `"redistribute": false`, así que `assets list` marca las exportaciones
que los llevan. El playground descarga un paquete de proveedor la primera vez que un documento o
el panel de bibliotecas lo necesita. Otros conjuntos de proveedores van en un paquete del
proyecto, por ejemplo `assets/icons/oci/`, con sus condiciones en `assets/licenses.json`.

### Bibliotecas

Una biblioteca es una lista de elementos prearmados por categoría, que ofrece el panel
Bibliotecas del lienzo ([editor.md](../editor.md#bibliotecas-de-elementos)). Todo paquete con
categorías es una biblioteca: los paquetes de proveedores por sus categorías, Tabler por las
suyas y los paquetes Iconify del proyecto por las suyas, con la etiqueta de cada icono. La
biblioteca integrada `tech` («Technology») selecciona bases de datos, mensajería, lenguajes,
frameworks, herramientas, plataformas y sistemas operativos de `logos`. Un proyecto agrega las
suyas en `assets/libraries/<id>.json`, y un plugin en su `libraries` ([plugins.md](../plugins.md)):

```json
{
  "id": "shapes",
  "title": "Our shapes",
  "categories": [
    {
      "id": "stores",
      "title": "Data stores",
      "items": [{ "icon": "tabler:database", "label": "Database", "kind": "data" }]
    }
  ]
}
```

`icon` es una referencia `pack:name`, `label` el nombre del elemento y `kind` un tipo opcional de
elemento del perfil del diagrama (si no, un nodo, o una caja en las composiciones libres). Un
archivo que no es una biblioteca es `asset.invalid-library`. Un paquete Iconify puede llevar
`"labels": { "<name>": "<etiqueta>" }`, una extensión de Meltemi que leen los selectores y las
bibliotecas.

El control de colocación del panel decide en qué se convierte un elemento, y el selector de iconos
del lienzo lo comparte ([editor.md](../editor.md#iconos)): **Icono**, el predeterminado, escribe
un nodo o una caja dibujado como su icono con la etiqueta del elemento debajo (`shape icon`);
**En una caja**, un nodo o una caja de la forma actual con el icono junto a su etiqueta; **Solo el
icono**, en las composiciones libres, un objeto `icon`. Un elemento con `kind` conserva su tipo y
toma el icono sin `shape`. Si se suelta sobre un nodo, una decisión, un almacén de datos o una
caja, le da su icono y no crea nada. El selector de iconos busca en las bibliotecas además de en
los paquetes, así que las etiquetas de las bibliotecas también encuentran iconos.

### Saneamiento y límites

Los iconos del proyecto son archivos no confiables y se comprueban cuando se leen los recursos del
proyecto:

| Permitido                                                                                                | Rechazado (`asset.unsafe-svg`)                                                                     |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`                           | los elementos `script` y `style`, `foreignObject`, `image`, `use`, `a`, animación                  |
| `defs`, `linearGradient`, `radialGradient`, `stop`, referenciados como `url(#id)` desde el mismo archivo | patrones, máscaras, recortes, filtros, y `url(` hacia cualquier otra cosa                          |
| geometría, pintura, opacidad, `fill-rule`, `transform` y `style` con esas propiedades                    | atributos de eventos (`on…`), enlaces que no sean entre degradados, DTD y entidades personalizadas |

Se omiten `title`, `desc`, `metadata` y los espacios de nombres de editores (Inkscape, Sodipodi).
Límites (`asset.too-large`): 256 KB por archivo SVG, 16 MB por archivo de Iconify o por fuente, 2000
elementos y 32 niveles de anidamiento por icono, y 256 KB de datos de trazado por icono. Un icono
que no se puede usar se informa en su archivo y dondequiera que lo use un diagrama.

## Fuentes

Cada archivo `.woff2`, `.woff`, `.ttf` o `.otf` de `assets/fonts/` se suma a las fuentes con las que
las exportaciones del proyecto miden, incrustan y convierten el texto en contornos, con la familia,
el peso y el estilo que declara la fuente. Un tema la usa por su nombre:

```text
theme company { extends "technical.light"; font "'Company Sans', sans-serif" }
```

La política de fuentes `embedded` escribe el archivo completo en el SVG. Una fuente cuyo permiso de
incrustación (`OS/2 fsType`) está restringido solo se usa para medir el texto: las exportaciones la
nombran sin incrustarla ni convertirla en contornos, y `asset.font-restricted` (advertencia) lo
indica.

## `assets/licenses.json`

```json
{
  "icons": {
    "aws": {
      "title": "AWS Architecture Icons",
      "version": "2026.02",
      "license": "LicenseRef-AWS-Architecture-Icons",
      "url": "https://aws.amazon.com/architecture/icons/",
      "author": "Amazon Web Services",
      "redistribute": false
    }
  },
  "fonts": {
    "Company Sans": { "version": "2.001", "license": "OFL-1.1" }
  }
}
```

| Campo           | Valor                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| `license`       | obligatorio: un identificador SPDX (`MIT`, `OFL-1.1`) o un nombre `LicenseRef-`       |
| `title`         | nombre visible                                                                        |
| `version`       | versión del paquete o de la fuente                                                    |
| `url`, `author` | de dónde viene y quién lo hizo                                                        |
| `redistribute`  | si las exportaciones se pueden publicar; `true` de forma predeterminada               |
| `opticalScale`  | solo paquetes, de 0,5 a 1,5: la proporción óptica que se usa en lugar de la calculada |

Una entrada reemplaza los metadatos propios de un archivo de Iconify. Cada paquete y cada fuente del
proyecto necesita una licencia de uno de los dos lugares (`asset.missing-license`).

## `assets.lock.json`

```bash
pnpm mdg assets lock
```

El archivo de bloqueo registra cada paquete y cada fuente con su versión, su origen, su licencia y,
en los recursos del proyecto, una integridad SHA-256 (`sha256-…`, del archivo, o de los nombres y
los contenidos ordenados de una carpeta). Los paquetes integrados se fijan por versión. Cuando existe
el archivo de bloqueo, `validate` y `export` informan cada diferencia como `asset.lock-mismatch`
(advertencia); `validate --strict` la convierte en un fallo para la integración continua. El archivo
se escribe con las claves ordenadas, así que sus diferencias se leen con claridad.

## Comandos

| Comando                                   | Imprime o hace                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `assets list [path]`                      | los paquetes, los alias y las fuentes con sus versiones, orígenes y licencias                      |
| `assets icons <words> [--project <path>]` | las referencias que coinciden, primero los nombres exactos (`--limit`, 50 de forma predeterminada) |
| `assets lock [path]`                      | escribe `assets.lock.json` en la raíz del proyecto                                                 |

## Para herramientas

`@meltemi/diagrams-assets` contiene los paquetes, el saneador, la geometría de los trazados, el
formato del archivo de bloqueo y un SHA-256 portable; `createNodeIconPacks()` carga Tabler desde
`node_modules`. `Workspace.assets()` de `@meltemi/diagrams-project` devuelve el registro, los
paquetes, las fuentes, los archivos de bloqueo y los diagnósticos de un proyecto cuando la aplicación
anfitriona pasa los servicios `assets` (los paquetes integrados y un inspector de fuentes). La
disposición dibuja los iconos mediante `LayoutOptions.icons`.

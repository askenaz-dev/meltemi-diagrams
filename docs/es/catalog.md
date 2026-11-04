# El catálogo HTML

[English](../catalog.md)

`meltemi-diagrams build catalog` convierte un proyecto en un solo archivo HTML que cualquiera puede
abrir desde un disco, una carpeta compartida, un adjunto o cualquier alojamiento estático, sin red:
los diagramas y las historias del proyecto por carpeta, con el reproductor, la búsqueda, los
enlaces entre diagramas y las entidades del modelo de arquitectura. El mismo código fuente da el
mismo archivo (decisión 0027).

```bash
pnpm mdg build catalog architecture
```

```text
Wrote architecture/catalog/index.html (3 diagrams, 1 story, 6 entities; 289 KB)
```

## Generación

| Comando                                           | Escribe                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm mdg build catalog`                          | el catálogo del proyecto de la carpeta de trabajo                       |
| `pnpm mdg build catalog architecture/`            | `architecture/catalog/index.html`, o donde indique `catalog.out`        |
| `pnpm mdg build catalog architecture/ --out site` | `site/index.html`; una ruta que termina en `.html` da nombre al archivo |
| `pnpm mdg build catalog --title "Shop"`           | con un título distinto de `catalog.title` o del nombre del proyecto     |
| `pnpm mdg build catalog --source`                 | con el texto de cada archivo catalogado                                 |

La ruta es una carpeta de proyecto o un archivo dentro de una. El comando imprime los diagnósticos
de los archivos catalogados, deja fuera (y nombra) los diagramas y las historias que no se pueden
dibujar, e indica qué contiene el catálogo y su tamaño. Termina con 0 cuando nada tuvo errores, con
1 cuando algo tuvo errores o quedó fuera, y con 2 ante errores de uso o cuando el proyecto no tiene
nada que catalogar, así que un job de CI puede validar y publicar en un solo paso.

En VS Code, **Meltemi Diagrams: Generar el catálogo** (paleta de comandos, o el menú del explorador
de una carpeta, un archivo `.meltemi` o `project.json`) genera el catálogo del proyecto y ofrece
abrirlo en el navegador.

Los encabezados, la navegación, la búsqueda y los reproductores del catálogo están en inglés o en
español: `--lang`, si no el `"locale"` del proyecto, si no el inglés
([proyectos](language/projects.md#idioma-de-las-exportaciones)). La página lleva el idioma como su `lang`,
y la búsqueda en español también encuentra las palabras clave de los tipos (`sequence`, `story`).
El idioma forma parte de la entrada, así que el mismo código fuente da el mismo archivo en todas
las máquinas.

## Ajustes

`project.json` puede indicar cómo se llama el catálogo, dónde se escribe y qué deja fuera:

```json
{
  "name": "commerce",
  "language": "0.2",
  "catalog": {
    "title": "Commerce architecture",
    "description": "Views and stories of the shop.",
    "out": "public/catalog",
    "exclude": ["drafts", "diagrams/checkout.meltemi#internal"],
    "source": false
  }
}
```

| Ajuste        | Predeterminado | Significado                                                                                       |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `title`       | el `name`      | El título del catálogo                                                                            |
| `description` | ninguno        | Texto de la página de inicio                                                                      |
| `out`         | `catalog`      | Una carpeta dentro del proyecto (el archivo es el `index.html` que contiene) o un archivo `.html` |
| `exclude`     | ninguno        | Carpetas o archivos que se dejan fuera, o `<file>.meltemi#<id>` para un diagrama o una historia   |
| `source`      | `false`        | Incluir el texto de cada archivo catalogado, con los comentarios, visible y descargable           |

Una historia que muestra un diagrama excluido lo sigue dibujando en sus fotogramas; la generación
lo advierte, así que excluye también la historia cuando el diagrama no deba aparecer.

## Lo que encuentran los lectores

- **Vista general**: el título, la descripción, cuántos diagramas, historias y entidades hay, y
  cada carpeta con una tarjeta por diagrama e historia (una miniatura, el título, el tipo).
- **Navegación**: las mismas carpetas en un panel lateral que marca la página en pantalla; en un
  teléfono se sitúa encima de la página.
- **Un diagrama**: su dibujo, tipo, id, archivo y descripción; los efectos con los controles del
  reproductor; un selector de escenarios para los diagramas de secuencia con escenarios (la
  elección forma parte de la dirección); tablas de elementos (tipo, tecnología, descripción, adónde
  lleva cada uno y qué abre) y de relaciones; las historias que lo muestran; los diagramas con los
  que enlaza y desde los que se lo enlaza; **Descargar SVG**, siempre el dibujo tal como está
  escrito, sea cual sea el zoom o la selección. Las migas de pan nombran las vistas de arriba: una
  vista de componentes queda bajo su vista de contenedores y la vista de contexto.
- **Una historia**: el reproductor con reproducción, pausa, progreso, escenas, teclado, vista
  estática y resumen en texto; sus escenas; los diagramas que muestra; **Descargar SVG** del
  fotograma en pantalla.
- **Entidades**: las entidades de los modelos de arquitectura que dibujan las vistas catalogadas o
  con las que enlazan, por modelo, con su tipo, tecnología, descripción y las vistas que las
  muestran. La página de una entidad lista de qué forma parte, qué contiene y las vistas con su
  alcance.
- **Explorar un dibujo**: cada dibujo admite zoom y desplazamiento, muestra una tarjeta cuando el
  puntero se detiene sobre un elemento o una relación, y abre un panel con un clic: tipo,
  tecnología, descripción, relaciones, las historias que lo muestran, la entidad que dibuja, las
  vistas con el alcance de esa entidad y **Abrir el enlace** para un `url`
  ([el reproductor](player.md#explorar-un-dibujo)). Un clic selecciona y nunca sale de la página;
  una dirección con `?element=` selecciona ese elemento.
- **Abrir lo que contiene una caja**: una caja con un signo más abre una vista: un sistema, su
  vista de contenedores; un contenedor, su vista de componentes; un elemento con `link`, el
  diagrama que nombra. Un doble clic, el signo más o el botón **Abrir** del panel acercan la cámara
  a la caja y van a esa página, cuyo dibujo se transforma a partir de la caja; **Subir** en el
  dibujo, Retroceso y el botón Atrás del navegador suben por el mismo camino. Los enlaces del panel
  llevan a la página de la entidad y a las historias; las tablas ofrecen los mismos enlaces al
  teclado y a los lectores de pantalla.
- **Búsqueda**: títulos, ids, descripciones, carpetas, archivos, etiquetas de elementos y
  relaciones, tecnología, escenas y entidades, sin distinguir mayúsculas ni acentos y exigiendo
  todas las palabras. Los títulos y los ids van primero; cada resultado indica dónde coincidió.
  Presiona `/` para buscar, Entrar para abrir el primer resultado, Abajo para llegar a los resultados
  y Esc para borrar.

Cada página tiene su propia dirección (`#/diagram/diagrams/checkout/checkout`, `#/story/…`,
`#/entity/…`, `#/entities`, `#/search?q=…`), así que los enlaces se pueden compartir y los botones
Atrás y Adelante del navegador funcionan. El encabezado de la página toma el foco después de cada
cambio; las regiones de referencia, un enlace para saltar al contenido, el foco visible y los
esquemas de color claro y oscuro vienen integrados.

## Solo metadatos autorizados

De forma predeterminada, el catálogo contiene el título y la descripción del proyecto, títulos,
descripciones, tipos, carpetas y nombres de archivo relativos al proyecto, y lo que muestran los
dibujos: etiquetas, descripciones, tecnología y URL. Nunca contiene comentarios, rutas absolutas,
diagnósticos, la máquina ni la hora de generación; la página solo nombra su generador y su versión.
El texto fuente solo se incluye con `catalog.source` o `--source`. Los documentos de las historias
nombran sus vistas por el id del diagrama, nunca por el archivo del que viene un diagrama
importado.

## Sin conexión por diseño

El catálogo es un solo archivo: sus datos, los subconjuntos de fuentes que usan sus dibujos (cada
uno una vez), sus estilos y su script van en línea. Una política de seguridad de contenido permite
scripts y estilos en línea, imágenes y fuentes `data:` y `blob:`, y nada más, así que la página no
puede descargar nada ni siquiera por error. Los dibujos son el propio SVG del renderizador,
dibujados en shadow roots por el entorno de ejecución del reproductor, así que se ven como
cualquier otra exportación. Sin JavaScript, la vista general y la navegación se siguen pudiendo
leer.

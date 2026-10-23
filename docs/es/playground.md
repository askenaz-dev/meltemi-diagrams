# El playground

[English](../playground.md)

El playground es Meltemi Diagrams en una página web: las plantillas, el código junto al mismo lienzo
que la extensión de VS Code y todas las exportaciones, sin instalar nada y sin necesidad de cuenta.
Todo se ejecuta en el navegador; nada de lo que escribes se envía a ningún sitio (decisión 0031).
Servida por el [servicio en la nube](cloud.md), la página ofrece además una cuenta opcional
([la cuenta](#la-cuenta)) y, con ella, proyectos guardados en la nube
([proyectos en la nube](#proyectos-en-la-nube)), que se pueden compartir
([compartir un proyecto](#compartir-un-proyecto)), trabajar en ellos juntos, en vivo, con las
personas con quienes se comparten ([trabajar juntos](#trabajar-juntos)) y publicar como página web
([publicar un proyecto](#publicar-un-proyecto)). El enlace a un proyecto compartido lo abre para que
cualquiera lo mire, sin cuenta ([ver un proyecto compartido](#ver-un-proyecto-compartido)); sin
cuenta, nada más cambia.

## Compilarlo y servirlo

```bash
pnpm playground:build
```

La compilación escribe un sitio estático en `packages/playground/dist/`: `index.html`, los scripts,
las hojas de estilo, `templates.json`, las fuentes, los datos de Tabler, los entornos de ejecución
que se escriben en las exportaciones HTML, `NOTICES.md`, `api/session`, la respuesta que da un
servidor estático a la única solicitud que la página hace a una API (`{"user":null}`: nadie ha
iniciado sesión), y `_headers`, las dos cabeceras que la plataforma de recursos del servicio en la
nube da a cada archivo de la página (`frame-ancestors 'self'` y `nosniff`; un servidor estático lo
sirve como un archivo más). Cualquier servidor estático lo sirve; durante el desarrollo,
`pnpm preview` sirve el repositorio en `http://localhost:4173/packages/playground/dist/`. La página
alojada es `https://diagrams.meltemi.dev`: el [servicio en la nube](cloud.md) sirve la misma
compilación con una cuenta encima (`pnpm cloud:dev` en local), desplegada desde `main` por el flujo
de despliegue. La página inicia la sesión en
`https://id.meltemi.dev`; al compilar, fija `PLAYGROUND_IDENTITY` al origen de otro servicio de
identidad para cambiarlo, y el `form-action` de la política lo sigue.

```bash
pnpm playground:test-browser
```

compila el sitio, lo sirve en `127.0.0.1` y lo maneja en el Edge o el Chrome instalado.

## Lo que hace

| Área      | En el playground                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proyectos | El explorador lista las carpetas y los diagramas del proyecto y los crea, les cambia el nombre, los mueve y los elimina, con las importaciones que siguen a un movimiento ([el explorador](#el-explorador)); **Nuevo proyecto** parte de las plantillas de `init`, mostradas como tarjetas; el `.zip` de un proyecto se importa y se exporta entero. El compilador de proyectos es el mismo que usan la CLI y el editor. |
| Código    | Resaltado, números de línea, diagnósticos subrayados y listados con sus líneas y correcciones rápidas, autocompletado, información al pasar el puntero, formato, cambio de nombre e ir a la definición entre archivos.                                                                                                                                                                                                   |
| Lienzo    | El lienzo de VS Code: paleta y herramienta de relación, selección, movimientos, rutas, etiquetas, la barra de estilo y el inspector, el panel del tema, minimapa, cuadrícula y ajuste a la cuadrícula, acciones de disposición, herramientas de secuencia y C4, efectos e historias con su línea de tiempo. Cada gesto es una edición del texto.                                                                         |
| Deshacer  | Un historial por archivo para lo que escribes, las ediciones del lienzo, las correcciones, el formato y los cambios de nombre, y los movimientos de archivos con las importaciones que los siguen; Ctrl+Z, Ctrl+Mayús+Z y Ctrl+Y en cualquier parte de la página. En un proyecto en la nube cubre solo tus propias ediciones.                                                                                            |
| Importar  | Mermaid, PlantUML y Markdown, pegados o desde un archivo, a un nuevo archivo `.meltemi`, con los hallazgos del importador y su informe.                                                                                                                                                                                                                                                                                  |
| Exportar  | SVG, SVG animado, PNG, PDF, el reproductor HTML, GIF, WebM y MP4, y los perfiles de exportación del archivo; el archivo fuente, el `.zip` del proyecto, el JSON del modelo y el catálogo HTML.                                                                                                                                                                                                                           |
| Compartir | Un enlace con el proyecto en la dirección; para un proyecto en la nube, su propio enlace corto y quién puede abrirlo ([compartir un proyecto](#compartir-un-proyecto)).                                                                                                                                                                                                                                                  |
| Conservar | El proyecto se queda en el navegador entre visitas.                                                                                                                                                                                                                                                                                                                                                                      |
| Cuenta    | Opcional, solo cuando el servicio en la nube sirve la página: iniciar sesión con GitHub o Google mediante el servicio de identidad de Meltemi, y crear tokens de API ([la cuenta](#la-cuenta)).                                                                                                                                                                                                                          |
| Nube      | Con la sesión iniciada: proyectos en tu cuenta que se abren en todos los dispositivos, combinan lo que editas sin conexión, guardan versiones y muestran una vista previa ([proyectos en la nube](#proyectos-en-la-nube)).                                                                                                                                                                                               |
| Juntos    | Un proyecto en la nube abierto en varios sitios muestra quién está, dónde están sus cursores y selecciones y qué han seleccionado en el lienzo; todos escriben a la vez ([trabajar juntos](#trabajar-juntos)).                                                                                                                                                                                                           |
| Ver       | El enlace de un proyecto compartido lo abre para mirarlo, reproducirlo y exportarlo, con la sesión iniciada o sin ella, y para copiarlo ([ver un proyecto compartido](#ver-un-proyecto-compartido)).                                                                                                                                                                                                                     |
| Publicar  | El catálogo de un proyecto en la nube como página web en una dirección propia ([publicar un proyecto](#publicar-un-proyecto)).                                                                                                                                                                                                                                                                                           |
| Idioma    | Inglés y español: la página sigue el idioma del navegador hasta que se elige uno en el menú del globo de la cabecera.                                                                                                                                                                                                                                                                                                    |

### Teclas del código

| Tecla                        | Hace                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| Ctrl+Espacio                 | Sugerencias (también se abren al empezar una palabra)                                      |
| Ctrl+.                       | Correcciones rápidas                                                                       |
| Mayús+Alt+F                  | Dar formato al archivo                                                                     |
| F2                           | Cambiar el nombre del id bajo el cursor en todo el proyecto                                |
| F12, Ctrl+clic               | Ir a la definición                                                                         |
| Tab, Mayús+Tab               | Aplicar sangría, quitar sangría; Esc y luego Tab pasa al siguiente control                 |
| Ctrl+Z, Ctrl+Mayús+Z, Ctrl+Y | Deshacer y rehacer, en el código y en el lienzo                                            |
| Ctrl+S                       | Guardar ahora el proyecto en el navegador; en un proyecto en la nube, enviar lo que espera |

En los sistemas de Apple, Cmd sustituye a Ctrl. El lienzo conserva sus propias teclas
(`docs/editor.md`), y el explorador las suyas ([el explorador](#el-explorador)).

## El explorador

La columna de la izquierda es el proyecto: su nombre y dónde vive arriba, y debajo sus carpetas y
diagramas, como los lista el explorador de un editor.

- **El árbol.** Primero van las carpetas y luego los archivos, cada grupo ordenado por nombre. Un
  archivo `.meltemi` aparece por su nombre sin la extensión, con el dibujo del tipo de su primer
  diagrama (flujo, composición libre, secuencia, vista C4), o de un modelo, una historia o un tema.
  Un archivo que declara más de un diagrama o historia se abre para listarlos; un clic en uno abre
  el archivo y muestra ese diagrama, o reproduce esa historia, en el lienzo. El archivo abierto va
  en negrita, y el diagrama que muestra el lienzo aparece seleccionado. Las imágenes se listan con un
  icono de imagen y se ven en el panel de código. Un archivo con errores o advertencias dice
  cuántos; una carpeta cerrada muestra la suma de lo que contiene.
- **Crear y cambiar archivos.** **Nuevo diagrama…**, en la barra sobre el árbol o en el menú de una
  carpeta, pide un nombre y un tipo (flujo, composición libre o secuencia) y escribe
  `<carpeta>/<nombre>.meltemi` con un diagrama vacío de ese tipo, titulado con el nombre. **Nueva
  carpeta…** crea una carpeta que se queda en cuanto tiene un diagrama. El menú de una fila (un clic
  derecho, Mayús+F10 o su botón **…**) cambia el nombre, mueve, duplica, descarga y elimina; una
  carpeta se descarga como un `.zip`. Cambiar el nombre de un archivo `.meltemi` o moverlo reescribe
  las importaciones que lo nombran, y las suyas, para que apunten a los mismos archivos; el
  movimiento y esas ediciones son un solo paso, que Ctrl+Z deshace desde cualquier archivo. Un
  archivo que no se puede analizar conserva sus importaciones, y la línea de estado lo nombra.
  Eliminar pregunta antes y no se puede deshacer.
- **Arrastrar y soltar.** Las filas se arrastran a una carpeta, o al espacio vacío debajo de ellas
  para la raíz del proyecto, de una en una o como una selección hecha con Ctrl o Mayús. Si al soltar
  algo cayera sobre un archivo con el mismo nombre, no se mueve nada y se dice cuál. Los archivos
  arrastrados desde tu equipo quedan en la carpeta donde se sueltan, y un `.zip` abre **Importar
  proyecto**.
- **Mostrar todos los archivos.** El árbol lista carpetas, diagramas e imágenes. **Mostrar todos los
  archivos**, al pie, lista también `project.json`, `assets.lock.json`, las fuentes y cualquier otro
  archivo, y añade **Nuevo archivo…** a los menús; la página recuerda la elección. Un archivo oculto
  con algún problema lo dice al pie, con **Mostrar**. **Configuración del proyecto**, en el panel
  Proyectos, abre `project.json` diga lo que diga el interruptor, y lo crea como lo escribe `init`
  cuando el proyecto no lo tiene.
- **Los problemas de los recursos.** Un paquete de iconos sin licencia, un icono que el saneamiento
  rechaza o un archivo cuyo nombre una referencia no puede escribir se cuentan en la fila de su
  archivo y en sus carpetas, también la carpeta del paquete, como los problemas de los diagramas;
  un archivo de recursos abierto muestra los suyos. Desaparecen en cuanto se corrige el archivo.
  Los iconos agregados con **Agregar icono…** llegan con su licencia, así que no añaden ninguno
  ([agregar iconos](language/assets.md#agregar-iconos-desde-el-editor)).
- **Su lugar.** El borde entre el explorador y el código lo cambia de ancho, de 180 a 480 píxeles
  (las flechas sobre el borde enfocado, un doble clic para restablecerlo), y Ctrl+B lo oculta en un
  riel y lo vuelve a mostrar; la página recuerda ambas cosas. Una primera visita en una pantalla de
  menos de 1100 píxeles empieza con el riel. En una pantalla estrecha el explorador es la primera de
  tres pestañas, **Archivos**, **Código** y **Lienzo**, y abrir un archivo muestra el código.

| Tecla (en el árbol)        | Hace                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| Arriba, Abajo, Inicio, Fin | Moverse entre filas; con Mayús, ampliar la selección                    |
| Derecha, Izquierda         | Abrir una carpeta o entrar en ella; cerrarla o ir a la carpeta padre    |
| Intro, Espacio             | Abrir el archivo, el diagrama o la historia; abrir o cerrar una carpeta |
| Una letra                  | Ir a la siguiente fila cuyo nombre empieza por ella                     |
| F2                         | Cambiar el nombre en la fila: Intro lo guarda, Escape deja el anterior  |
| Ctrl+D                     | Duplicar el archivo a su lado                                           |
| Supr                       | Eliminar, después de una pregunta                                       |
| Mayús+F10                  | El menú de la fila                                                      |
| Ctrl+B                     | Ocultar o mostrar el explorador, desde cualquier parte de la página     |
| Ctrl+Mayús+E               | Ir al explorador, desde cualquier parte de la página                    |

### El selector de proyectos

Arriba del explorador aparecen el nombre del proyecto abierto y dónde vive: **Este navegador**, la
conexión de un proyecto en la nube ("Guardado en la nube", "Guardando…", "Sin conexión") o **Solo
lectura**. El lápiz le cambia el nombre: el `name` de `project.json` en el proyecto de este
navegador, el propio proyecto en la nube. Un clic abre el panel **Proyectos**:

- **Nuevo proyecto…**, **Importar proyecto…**, **Exportar proyecto (.zip)**, **Guardar este
  proyecto en la nube** (con la sesión iniciada, para el proyecto de este navegador),
  **Configuración del proyecto** y **Mostrar todos los archivos**;
- **Este navegador**: el proyecto que guarda el navegador, que se abre con un clic (dejando un
  proyecto en la nube), y **Proyecto anterior** con **Restaurar** cuando una plantilla, un archivo
  comprimido o un enlace reemplazaron trabajo;
- **En la nube**, con la sesión iniciada, tus proyectos en la nube
  ([los proyectos en la nube del panel](#los-proyectos-en-la-nube-del-panel)); sin sesión, una línea
  y el enlace **Iniciar sesión**.

Escape o un clic fuera lo cierran.

### Nuevo proyecto

**Nuevo proyecto…** pide un nombre y muestra una tarjeta por plantilla: un dibujo de su primer
diagrama, su título, para qué sirve y lo que contiene, como "1 modelo · 2 vistas". Las flechas se
mueven entre las tarjetas e Intro crea el proyecto. El nombre sigue a la tarjeta elegida hasta que
escribes uno. Sin sesión, el proyecto reemplaza al de este navegador, después de una pregunta cuando
ese tiene trabajo que no es una plantilla; el trabajo queda como el proyecto anterior. Con la sesión
iniciada, el proyecto se crea en tu cuenta y se abre; **En este navegador** lo crea en el navegador.

| Tarjeta                            | Lo que contiene                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagrama de flujo (`flow`)         | Un diagrama de flujo para empezar                                                                                                                    |
| Modelo C4 (`c4`)                   | Un modelo de arquitectura con una vista de contexto y una vista de contenedores                                                                      |
| Diagrama de secuencia (`sequence`) | Un diagrama de secuencia con un escenario para cada resultado                                                                                        |
| Diapositiva (`free`)               | Una diapositiva compuesta libremente: texto, cajas, un icono y un grupo                                                                              |
| Ejemplo de compra (`purchase`)     | El ejemplo de referencia: un modelo, sus vistas C4, una secuencia de pago, una diapositiva ejecutiva, una historia animada y perfiles de exportación |

Los dibujos se hacen una vez, al compilar el sitio, en el tema de la plantilla y en su versión
oscura, y la página muestra el de su propio tema.

### Importar y exportar un proyecto

**Exportar proyecto (.zip)** descarga el proyecto como lo hace **Descargar → Proyecto (.zip)**
([continuar localmente](#continuar-localmente)). **Importar proyecto…**, **Abrir** con un `.zip` o un
`.zip` soltado en el explorador leen el archivo comprimido (una única carpeta superior que lo
contiene todo se quita de las rutas) y preguntan adónde va su proyecto:

- **Un proyecto nuevo en tu cuenta**, con la sesión iniciada: se crean sus textos, se suben sus
  imágenes y fuentes mostrando el progreso, y se abre; antes se comprueban los límites de un proyecto
  en la nube, y un proyecto que no se puede completar se elimina de nuevo.
- **Este navegador**: pasa a ser el proyecto de este navegador, y el trabajo que reemplaza queda
  como el proyecto anterior.
- **Reemplazar los archivos de** el proyecto en la nube abierto: cada uno de sus archivos pasa a ser
  el del archivo comprimido.

No se reemplaza nada sin esa elección. Un archivo comprimido sin ningún archivo de un proyecto lo
dice y no cambia nada.

## Exportaciones en el navegador

El diálogo de exportación arma las mismas solicitudes que `meltemi-diagrams export` y las produce
con el mismo código, así que una imagen es la misma que la de la CLI; solo cambia el último paso,
porque una página web no tiene ni un navegador sin interfaz ni FFmpeg:

| Formato   | Cómo lo genera la página                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG, HTML | Se escriben tal como se producen: el mismo texto que el de la CLI.                                                                                                                              |
| PNG       | El SVG dibujado en un elemento canvas al tamaño multiplicado por la escala (como máximo 16 384 píxeles por lado), transparente si se pide.                                                      |
| PDF       | El diálogo de impresión del navegador sobre una página del tamaño de la imagen y sin margen; **Guardar como PDF** la conserva como vectores. La CLI escribe los archivos PDF directamente.      |
| GIF       | Fotogramas a `i × 1000 / fps` ms a partir del documento del reproductor, una sola paleta de 256 colores, tramado ordenado, fotogramas recortados a lo que cambió y repetición en bucle.         |
| WebM, MP4 | Los mismos fotogramas codificados por el navegador (WebCodecs: VP9 o VP8, H.264) en contenedores que escribe la página; los formatos que el navegador no puede codificar aparecen desactivados. |
| Perfiles  | Cada bloque `export` del archivo, con el nombre que este indica.                                                                                                                                |

Los tamaños, las frecuencias de fotogramas y las duraciones de los videos siguen los valores
predeterminados de la CLI (1080p a 30 fps; GIF de 960 × 540 a 15 fps). El video transparente lo
genera la CLI (`--format webm --background transparent`). Los fotogramas son los de la CLI; los
codificadores difieren, así que los archivos difieren en los bytes, no en el contenido.

El campo **Idioma** del diálogo fija las palabras que la herramienta agrega a la exportación: las
líneas de tipo de las entidades C4, los controles del reproductor HTML y los encabezados del
catálogo, cuyas páginas lo llevan como su `lang`. Empieza en el `"locale"` del proyecto, o en
inglés, y también se aplica a los perfiles del archivo y a la sección del catálogo; **Descargar →
Catálogo** usa el idioma del proyecto ([proyectos](language/projects.md#idioma-de-las-exportaciones)).

## Idioma

La página habla inglés y español. Sigue el idioma del navegador hasta que en el menú del globo, al
final de la cabecera, se elige **Automático**, **English** o **Español**; la elección se guarda con
los ajustes de la página, y elegir vuelve a cargar la página conservando el proyecto y el archivo
abierto. Cuando el navegador no puede guardar datos, la página lo indica y no se vuelve a cargar;
antes se listan las imágenes demasiado grandes para guardarse. Las palabras que el lienzo escribe
en los archivos, como el texto de una nota nueva ("Nota"), siguen el idioma de la página, como si las hubieras escrito tú; las exportaciones siguen en cambio el
campo **Idioma** del diálogo.

## Compartir y conservar el trabajo

**Compartir** copia un enlace que contiene los archivos de texto del proyecto, comprimidos, después
de `#p=`. La parte de una dirección que sigue a `#` nunca llega a un servidor. Las imágenes no
viajan en los enlaces; descarga el proyecto para compartirlas. Un enlace se comprueba al abrirse:
como máximo 4 MiB una vez descomprimido, el límite de archivos del proyecto y rutas dentro del
proyecto. Abrir un enlace, un archivo comprimido o una plantilla guarda el trabajo que reemplaza
como el proyecto anterior, que **Restaurar**, bajo **Proyecto anterior** en el panel Proyectos,
recupera. En un
proyecto en la nube, y en uno que se está viendo por su enlace, **Compartir** abre en cambio el
diálogo propio de ese proyecto ([compartir un proyecto](#compartir-un-proyecto)).

La página guarda el proyecto en el navegador (almacenamiento local): los archivos de texto y las
imágenes de hasta 512 KiB cada uno. Un navegador que no guarda nada sigue ejecutando el playground;
la línea de estado lo indica. Un proyecto en la nube se guarda de otra manera, como su documento en
IndexedDB ([sin conexión](#sin-conexión)), y el proyecto del navegador y los proyectos en la nube
nunca se reemplazan entre sí.

## Continuar localmente

**Descargar → Proyecto (.zip)** escribe el proyecto como una carpeta: `project.json` y cada archivo
en su ruta. Extráelo, y la línea de comandos y la extensión de VS Code trabajan con él como con
cualquier proyecto:

```bash
meltemi-diagrams validate my-project
```

**Exportar proyecto (.zip)**, en el panel Proyectos, descarga el mismo archivo comprimido, y
**Descargar → Continuar localmente** lista los comandos.

## La cuenta

La cuenta es opcional y pertenece al [servicio en la nube](cloud.md), no a la página: la página solo
la ofrece cuando la sirve el Worker de `packages/cloud`. Servida por un servidor estático, como
`pnpm preview`, nada cambia. Al arrancar, la página le pregunta a su propio origen, una vez, quién
ha iniciado sesión. Un servidor estático responde con el `{"user":null}` que escribió la
compilación; cualquier otra respuesta que la página no pueda usar, o ninguna, también significa que
nadie ha iniciado sesión, sin decir nada.

**Sin sesión iniciada**, el final de la cabecera tiene un enlace **Iniciar sesión**. Va al servicio
de identidad, `id.meltemi.dev`, y te devuelve a la página en la que estabas; antes de salir, la
página guarda tu proyecto en el navegador. Todo lo demás funciona como antes y no se envía nada.

**Con la sesión iniciada**, la cabecera muestra tu avatar y tu nombre, con un menú de tres entradas:

| Entrada           | Hace                                                               |
| ----------------- | ------------------------------------------------------------------ |
| **Cuenta**        | Abre el panel de la cuenta en Perfil, en esta página               |
| **Tokens de API** | Abre el panel de la cuenta en Tokens de API                        |
| **Cerrar sesión** | Termina la sesión en el servicio de identidad y vuelve a la página |

Debajo de las entradas el menú muestra lo que contiene tu cuenta, leído al abrir el menú: cuántos de
los 100 proyectos que admite tiene y cuánto de sus 200 MiB de almacenamiento usa, como en "3 de 100
proyectos" y "5,2 MiB de 200 MiB usados", con una barra delgada junto a cada uno; un clic sobre
ellos abre el panel en Uso. No muestran nada si el servicio no responde, y aparecen solo donde hay
proyectos en la nube.

### El panel de la cuenta

La cuenta es un panel en la página, nunca una pestaña, una ventana emergente ni un marco: una lista
de secciones a la izquierda y la elegida a su lado, o, en una pantalla estrecha, una hoja sobre toda
la página con las secciones como una tira de pestañas arriba. Las flechas, Inicio y Fin pasan de una
sección a otra; Escape y el botón de cerrar vuelven a la página.

| Sección               | Contiene                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Perfil**            | Tu foto y tu nombre, los correos de tus inicios de sesión, el alias de publicación (de 3 a 30 letras minúsculas, dígitos o guiones; no puede cambiar mientras haya una página publicada con él) y Cerrar sesión |
| **Inicios de sesión** | GitHub y Google tal como inicias sesión con ellos: la cuenta, si el proveedor verificó su correo, cuándo se vinculó; Desvincular, tras una pregunta, mientras quede otro; Vincular el otro                      |
| **Dispositivos**      | Dónde tienes la sesión iniciada, con este dispositivo marcado; cerrar la sesión de un dispositivo o de todos los demás, tras una pregunta                                                                       |
| **Tokens de API**     | Los tokens que permiten que la línea de comandos y los scripts actúen como tú (más abajo)                                                                                                                       |
| **Uso**               | Tus proyectos y tu almacenamiento frente a sus límites, y los límites de los archivos, el tamaño y las versiones de un proyecto y de una imagen                                                                 |
| **Zona de peligro**   | Eliminar la cuenta: lo que borra, y el camino a la página del servicio de identidad donde lo confirmas                                                                                                          |

Inicios de sesión y Dispositivos son lo que guarda el servicio de identidad; la página le pregunta a
su propio origen, cuyo Worker le pregunta al servicio de identidad en tu nombre
([los datos de identidad](cloud.md#los-datos-de-identidad)). Cuando no se puede contactar con el
servicio de identidad, las dos secciones lo dicen, con **Reintentar** y un enlace a su página de la
cuenta; las demás secciones siguen funcionando. Un dispositivo cuya sesión cierras sigue
funcionando en este producto hasta una hora, hasta que el Worker vuelve a comprobar su sesión.

Dos cosas salen de la página, en la misma pestaña, y vuelven a la sección de la que salieron:
vincular un proveedor (GitHub y Google muestran sus propias páginas) y eliminar la cuenta (lo
confirmas en la página del servicio de identidad). La página guarda tu trabajo en el navegador
antes de salir. El servicio de identidad te trae de vuelta a `?account=signins` o `?account=danger`;
el panel se abre en esa sección y el parámetro sale de la dirección. Una sesión que termina con el
panel abierto lo cierra y muestra la página sin sesión, con tu trabajo guardado.

**Tokens de API** crea los tokens que permiten que la línea de comandos y los scripts actúen como
tú. Los lista con la fecha de creación y del último uso de cada uno, crea uno a partir de un nombre
de hasta 60 caracteres y revoca uno después de una confirmación. Un token nuevo se muestra una sola
vez, con un botón para copiarlo, y desaparece cuando se cierra el panel; el servicio solo conserva
un hash. Una cuenta tiene como máximo 20. Un token autentica la API del servicio como
`Authorization: Bearer`, que es como lo usan los comandos de la nube de la línea de comandos
([los tokens de API](cloud.md#tokens-de-api), [la línea de comandos](cli.md#los-comandos-de-la-nube)).

Iniciar sesión añade tus proyectos en la nube al panel Proyectos del explorador
([proyectos en la nube](#proyectos-en-la-nube)) y no cambia nada más: el proyecto de tu navegador se queda donde está, no se sube nada hasta que
creas un proyecto en la nube o guardas en la nube el que tienes abierto, y cerrar sesión no te
quita nada; tus proyectos en la nube esperan en tu cuenta.

## Proyectos en la nube

Con la sesión iniciada, la página puede guardar proyectos en tu cuenta además de en el navegador. Se
abren en todos tus dispositivos, sobreviven a un navegador reinstalado, combinan lo que editas sin
conexión y guardan versiones; los mantiene el [servicio en la nube](cloud.md). Nada de esto aparece
sin sesión, y un servidor estático no tiene nada de ello. No se sube nada hasta que creas un
proyecto en la nube o guardas en la nube el que tienes abierto.

### Los proyectos en la nube del panel

El panel Proyectos del selector del explorador lista tus proyectos en la nube: nombre, una vista
previa pequeña del diagrama, cuándo cambió por última vez y cuántos de los 100 que admite una cuenta
tienes; por encima de ocho proyectos aparece un campo para filtrarlos. El proyecto abierto aparece
marcado. **Nuevo proyecto** crea un proyecto a partir de las tarjetas de las plantillas, con un
nombre de 1 a 100 caracteres, e **Importar proyecto** uno a partir de un archivo comprimido. El lápiz
del selector cambia el nombre del proyecto abierto. Cada proyecto tiene botones para abrirlo,
renombrarlo, duplicarlo, copiar su enlace (`<origin>/p/<id>`) y eliminarlo, lo que pide antes una
confirmación: el proyecto desaparece con sus versiones, y no se puede deshacer. Cuando la cuenta
llega a su límite de proyectos, la línea de estado lo dice y la lista no cambia. También aparece un
proyecto que es de otra persona y que compartió contigo por tu nombre, marcado "Compartido contigo:
solo lectura" o "Compartido contigo: puedes editar", y solo tiene los botones para abrirlo,
duplicarlo y copiar su enlace: renombrar y eliminar son cosa del propietario.

### Guardar el proyecto local

**Guardar este proyecto en la nube** aparece mientras el proyecto abierto es el que guarda el
navegador y tiene archivos. Copia el proyecto a un proyecto nuevo en la nube, sube cada imagen y cada
fuente (la línea de estado las cuenta) y abre la copia. Los límites se comprueban antes de enviar
nada: como máximo 2000 archivos, 10 MiB por imagen o fuente, 2 Mi caracteres por archivo de texto y
16 MiB de texto en total, y cada nombre de archivo debe cumplir
[la regla de los paths](cloud.md#la-regla-de-los-paths), que admite letras ASCII, dígitos, espacios
y `_ . ( ) + @ -`, y rechaza `..`, un nombre que empiece por punto, una barra invertida y los dos
puntos. Un proyecto que no se puede completar se elimina de nuevo, así que volver a intentarlo no
deja ninguna copia. El
proyecto del navegador no cambia: descansa mientras el proyecto en la nube está abierto, y un clic
en el proyecto de este navegador, en el panel, lo recupera. El nombre empieza siendo el `name` de `project.json`.

### Abrir un proyecto y su dirección

Un proyecto se abre desde el panel o desde una dirección. El enlace que copias, `<origin>/p/<id>`,
redirige a `/?project=<id>`: al cargar, la página lee `project` (e `invite`, y `live`) de la
dirección, pregunta al servicio qué eres para ese proyecto, lo abre en el modo que ese rol da y
conserva la dirección, así que al recargar se vuelve a abrir.

| Eres                                                        | El proyecto se abre                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| El propietario, un editor, o con sesión en un enlace `edit` | Como un proyecto en la nube: ligado a su sala y editado como siempre                                                  |
| Un lector con sesión (un miembro, o con un enlace `view`)   | En modo de solo lectura, siguiendo el proyecto en vivo                                                                |
| Sin sesión, con un enlace `view` o `edit`                   | En modo de solo lectura, siguiendo el proyecto en vivo como visita; sobre una instantánea solo si la sala no responde |
| Cualquiera con el enlace de una sesión en vivo (`?live=`)   | Ligado a su sala con el rol de la sesión, como invitado sin sesión iniciada ([sesiones en vivo](#sesiones-en-vivo))   |
| Sin admisión (un proyecto privado que no es tuyo)           | La línea de estado dice que no se encontró el proyecto; se abre el del navegador                                      |

Abrir otro proyecto desde el panel cambia `project` en la dirección, y abrir el proyecto de este
navegador lo quita. Cuando el proyecto no se encuentra, o el enlace no te admite, la línea de estado dice "No
se encontró el proyecto."; sin sesión, añade que si lo compartieron contigo, inicies sesión y abras
el enlace otra vez, y el enlace **Iniciar sesión** te devuelve a la misma dirección. La página nunca
dice si un proyecto existe pero es privado: un proyecto privado que no es tuyo se ve igual que uno
que no existe. Mientras tanto se abre el proyecto del navegador, sin tocarlo.

Una dirección puede llevar una invitación, `/p/<id>?invite=<token>` (el enlace que el propietario
copia del diálogo de compartir). Con la sesión iniciada, la página la acepta primero, así que el
proyecto se abre con el rol que da, dice "Invitación aceptada: puedes ver (o editar) el proyecto" y
quita `invite` de la dirección; si la invitación nombra otro proyecto distinto del de la dirección,
gana la invitación y la dirección la sigue. Una invitación que no es válida (desconocida, ya usada o
de más de treinta días) dice "Esta invitación no es válida.", salvo cuando iniciar sesión con la
dirección invitada ya te hizo miembro: entonces el enlace está gastado y el proyecto es tuyo, así que
se abre como si acabara de aceptarse. Sin sesión, la página muestra lo que admite el enlace, si algo,
dice "Inicia sesión para aceptar la invitación a este proyecto." y conserva `invite` en la
dirección: el enlace **Iniciar sesión** vuelve a la misma dirección, y entonces se acepta la
invitación. Un enlace para compartir (`#p=`) se abre como el proyecto del navegador: antes se deja
el proyecto en la nube que estaba abierto, y el panel te ofrece entonces guardar lo que trajo el
enlace.

### Trabajar en un proyecto en la nube

La página carga los archivos del proyecto en el editor, se conecta a la sala del proyecto y mantiene
ambos al día. Lo que escribes, las ediciones del lienzo, las correcciones rápidas, el formato, los
cambios de nombre, las importaciones y los archivos añadidos o eliminados se convierten en ediciones
de un documento compartido, combinadas y enviadas como máximo cuatro veces por segundo. Un cambio que
llega de fuera (otro dispositivo, un push mediante la API, una versión restaurada) actualiza el
texto, el panel de código (el cursor se queda en el mismo texto), el lienzo y el análisis, y nunca
entra en tu historial de deshacer.

- Una imagen o una fuente que añades se sube, como máximo 10 MiB, en PNG, JPEG, GIF, WebP, SVG,
  WOFF2, TTF u OTF, y aparece cuando el servicio la ha guardado; la línea de estado dice cuándo una
  no se guardó.
- Eliminar una imagen o una fuente con la página en línea se lo comunica al servicio, y sus bytes
  dejan de contar en tu uso cuando ningún otro archivo ni ninguna versión tuya usa esos mismos bytes;
  una recolección semanal borra los bytes del almacenamiento
  ([la recolección de blobs](cloud.md#la-recolección-de-blobs)). Deshacer no devuelve una imagen
  así, y la página no dice nada cuando no se puede avisar al servicio.
- Dos archivos que acaban con un mismo nombre (dos dispositivos cambian el nombre de un archivo sin
  conexión) se conservan los dos: uno se muestra como `<nombre>~<id>`, y la línea de estado lo dice.
  Cambia el nombre de uno para terminar con ello.
- El archivo que tienes abierto es tuyo: la página lo recuerda para cada proyecto en este navegador,
  y no se comparte.
- Abrir una plantilla o un archivo comprimido de proyecto reemplaza los archivos del proyecto en la
  nube. La página pregunta antes, salvo que los archivos sean los de una plantilla, y dice que la
  copia en la nube se reemplaza; descarga antes el proyecto si quieres una copia.
- Un proyecto en la nube se guarda solo. **Ctrl+S** envía lo que espera y dice dónde está el
  trabajo.
- Cuando la sala rechaza un cambio (un archivo demasiado grande, un nombre que no puede conservar),
  la línea de estado nombra el límite, el texto vuelve a lo que tiene la sala, la conexión se
  reabre y el historial de deshacer empieza de nuevo.

La línea de estado muestra la conexión:

| Dice                                                                                     | Significa                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Conectando con la nube…                                                                  | La sala todavía no ha respondido                                                                                                 |
| Guardado en la nube                                                                      | La conexión está abierta y los cambios que hiciste ya se enviaron                                                                |
| Guardando…                                                                               | Cambiaste algo hace un momento; dura un segundo y medio después del último cambio                                                |
| Reconectando… tus cambios se conservan en este navegador                                 | La conexión se cayó mientras el navegador está en línea; la página lo intenta de nuevo al cabo de un segundo, después más tarde  |
| Sin conexión: tus cambios se conservan en este navegador y se sincronizan cuando vuelvas | El navegador dice que no tiene conexión                                                                                          |
| Sala llena: ya hay 20 personas en este proyecto. Reintentando…                           | La sala ya tiene veinte conexiones; la página lo intenta de nuevo sola, y **Reintentar** lo pide enseguida                       |
| Eliminado de la nube                                                                     | El proyecto se eliminó de tu cuenta (en otro dispositivo, por ejemplo) o ya no se comparte contigo: la página deja de reconectar |

Donde IndexedDB no está disponible, estas líneas añaden "No se conserva sin conexión en este
navegador" o te piden que mantengas la página abierta, porque una página que se cierra sin conexión
pierde lo que la sala no tiene.

Cuando un proyecto se elimina de tu cuenta mientras está abierto, la página deja de reconectar y
conserva lo que tiene en el editor; ya no se puede guardar en la nube, así que descarga el proyecto
para guardar una copia.

### Deshacer en un proyecto en la nube

Ctrl+Z, Ctrl+Mayús+Z y Ctrl+Y deshacen y rehacen tus propias ediciones del archivo abierto y nunca un
cambio que llegó de la sala. La agrupación es la de un proyecto en el navegador: lo que escribes se
une en un paso hasta una pausa de 700 ms o un salto de línea; una edición del lienzo, una corrección
rápida, el formato, un cambio de nombre, una importación o una operación con archivos es un paso
propio; borrar texto o un salto de línea termina el paso de escritura, así que arrastrar y escribir
dentro de 700 ms se deshace en dos pasos; y una edición que tocó varios archivos, como cambiar el
nombre de un elemento al que se refieren otros archivos, se deshace en todos ellos a la vez. Cuando
desde tu último paso solo han llegado cambios de fuera, no hay nada que deshacer y el botón Deshacer
está desactivado. El historial vive en la página: empieza de nuevo al recargarla, al abrir otro
proyecto, después de que la sala rechace un cambio y después de restaurar una versión. Una
restauración reemplaza los archivos enteros, y un paso anterior solo podría convertir el texto
restaurado en algo que ninguna versión tuvo, así que deshacer no recupera lo que reemplazó;
restaura en cambio la versión automática que guarda la lista.

### Sin conexión

Un proyecto en la nube también se guarda en este navegador: su documento se almacena en IndexedDB (la
base de datos `meltemi-cloud`), con cada cambio tuyo y un momento después de que la sala lo cambie.
Un proyecto se abre desde esa copia enseguida y después se sincroniza con la sala, así que no esperas
a la red para empezar.

Si la conexión se cae mientras hay un proyecto abierto, sigues trabajando. La línea de estado dice
Sin conexión o Reconectando, tus cambios se conservan en IndexedDB, y cuando vuelve la conexión la
página reconecta sola, envía lo que le falta a la sala y recibe lo que te falta a ti, sin ningún
diálogo. Las ediciones que dos dispositivos hicieron a un mismo archivo se combinan como se combina
el texto, cada una conservando sus propios caracteres; las ediciones a archivos distintos y los
cambios de nombre nunca entran en conflicto, salvo que dos archivos con un mismo nombre se muestran
como se ha descrito antes. Cuando el navegador vuelve a estar en línea, o la página vuelve al primer
plano, la página prueba la conexión enseguida en lugar de esperar; cuando la página se oculta o se
abandona, envía lo que espera y escribe el documento en IndexedDB.

Lo que no hace:

- No hay service worker, así que la propia página no se carga sin conexión, y una página que arranca
  sin conexión no puede preguntar quién ha iniciado sesión: se abre como el proyecto del navegador,
  sin sesión. Editar sin conexión significa un proyecto que estaba abierto cuando se cayó la
  conexión, no abrir el playground sin red.
- Donde IndexedDB no está disponible (algunas ventanas privadas, un almacenamiento bloqueado) el
  proyecto se abre desde la sala, la línea de estado dice que no se conservará sin conexión, y lo que
  la sala no tiene se pierde si la página se cierra sin conexión.
- La copia pertenece al navegador: otro navegador u otro dispositivo se sincroniza desde la sala.
- Lo que hagas sin conexión tiene que caber en los mensajes de la sala (512 KiB). Un solo cambio
  que los supere (un pegado o una importación muy grandes hechos sin conexión) no se puede enviar:
  al volver la conexión la página lo rechaza como lo haría la sala, con las mismas palabras, y
  vuelve al texto de la sala.
- Cuando no se puede contactar con el servicio al abrir un proyecto, uno del que este navegador
  tiene una copia se abre igualmente desde ella, y lo dice; uno del que no tiene copia no se abre.

### Versiones

Mientras hay un proyecto en la nube abierto, la cabecera tiene **Versiones**: un panel con las
versiones del proyecto, de la más nueva a la más antigua. Cada una muestra su número, su nombre (o
"Sin nombre"; las que hizo el servicio dicen "Automática"), cuándo se hizo y cuántos archivos
cambiaron desde la anterior, con sus paths (los veinte primeros, y después "y N más"), y tiene
**Restaurar**. El panel las cuenta, como en "12 de 200 versiones".

- **Nombrar esta versión** conserva el proyecto tal como está ahora, con un nombre de hasta 80
  caracteres, o sin nombre cuando el campo está vacío. La página envía a la sala lo que espera justo
  antes de pedirlo y no espera a que la sala lo confirme, así que una edición escrita en ese último
  instante puede quedar fuera de la versión.
- **Restaurar** pregunta antes: los archivos del proyecto pasan a ser los de la versión, y el estado
  que dejas se conserva como una versión automática, para que puedas volver a él. Los archivos llegan
  como cualquier cambio de fuera, y la página olvida lo que podías deshacer antes: la vuelta atrás
  es esa versión automática.

Guardar solo nunca hace una versión. El servicio hace una al día cuando el proyecto ha cambiado
desde su última versión (guarda el proyecto después de los primeros cambios de ese día), y una antes
de cada restauración. Conserva como máximo 100 versiones sin nombre: se van primero las más
antiguas, y de las de más de treinta días solo se queda la más nueva de cada semana. Una versión con
nombre nunca se elimina. Un proyecto tiene como máximo 200 versiones, y cuando está lleno de
versiones con nombre el panel lo dice y rechaza una versión nueva o una restauración; seis por
minuto es lo máximo. [Versiones](cloud.md#versiones) tiene la política.

### Miniaturas

La vista previa del panel la hace la página, que ya dibuja diagramas. Cinco segundos después de que
se asiente el análisis del archivo `.meltemi` abierto, y como máximo una vez por minuto para cada
proyecto, la página dibuja el diagrama del lienzo como un SVG estático (la imagen que hace la
exportación SVG, con el tema del archivo y las fuentes incrustadas) y lo envía cuando cambió desde
el último que envió. No envía nada para un archivo sin nada que dibujar (solo un bloque `model`, o
un texto que no es un diagrama) ni nada de más de 200 KiB; el servicio acepta una por proyecto cada
treinta segundos, y una página a la que se rechaza por llegar pronto lo intenta una vez más un
minuto después, sin decir nada. Un proyecto sin vista previa muestra el contorno de una carpeta.

### Compartir un proyecto

El propietario de un proyecto en la nube decide quién puede abrirlo, y como qué, desde el botón
**Compartir** de la cabecera, que en un proyecto en la nube, y en un proyecto que se está viendo por
su enlace, con la sesión iniciada o sin ella, abre el diálogo propio del proyecto en lugar del de
`#p=`. Cambiar cualquier cosa es cosa del propietario; los demás ven lo que les concierne. [El servicio en la nube](cloud.md#compartir-y-permisos) tiene las reglas.

| Eres                                        | El diálogo muestra                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El propietario                              | El enlace; quién puede abrirlo; la sesión en vivo; las personas con sus correos, un menú de rol y **Quitar**; **Invitar a alguien**; las invitaciones pendientes con sus enlaces; **Publicar…** |
| Un miembro                                  | El enlace; tu rol; las personas (sus nombres, imágenes y roles); **Salir**                                                                                                                      |
| Cualquier otra persona que admite el enlace | El enlace y tu rol: "Puedes ver este proyecto, pero no cambiarlo."; nada de las personas                                                                                                        |

- **El enlace** es `<origin>/p/<id>`, con **Copiar**. Abre el proyecto para quien su nivel admita.
- **Quién puede abrir el enlace** tiene tres opciones, una frase cada una. **Solo las personas de la
  lista**, con lo que empieza un proyecto nuevo: solo las personas de la lista pueden abrirlo.
  **Cualquiera con el enlace puede ver**: cualquiera, con sesión iniciada o sin ella, puede ver y
  reproducir los diagramas, pero no cambiarlos. **Cualquiera con sesión iniciada y el enlace puede
  editar**: quien abra el enlace con sesión iniciada puede editar, y los demás lo ven. Un miembro
  conserva su rol elijas lo que elijas; el enlace solo puede dar más.
- **Personas** son aquellas a las que diste un rol por su nombre, **Puede ver** o **Puede editar**.
  El menú de rol lo cambia. **Quitar** pregunta antes: la persona pierde el acceso que se le dio por
  su nombre, y conserva lo que da el enlace, si da algo. Un proyecto admite como máximo 50 personas e
  invitaciones pendientes en conjunto, y el diálogo las cuenta ("3 de 50 personas e invitaciones").
- **Invitar a alguien** pide un correo electrónico y un rol; un texto que no es un correo se
  rechaza antes de enviar nada. **No se envía ningún correo**: el diálogo muestra la invitación con
  su enlace y **Copiar enlace**, y tú lo pasas. La persona obtiene el acceso al abrir el enlace con
  sesión iniciada, sea cual sea su correo, o al iniciar sesión con esa dirección cuando el
  proveedor la ha verificado. Una invitación funciona una vez, dura treinta días y nunca baja un
  rol que la persona ya tiene. Volver a pedirla para una dirección que ya tiene una invitación
  pendiente vuelve a fijar su rol y muestra el mismo enlace.
- **Invitaciones pendientes** lista cada una con su dirección, su rol, cuándo vence, **Copiar
  enlace** y **Revocar**. Son solo del propietario: el enlace de una invitación es una puerta de
  entrada, así que los miembros y quienes solo tienen el enlace del proyecto no ven ninguna.
- **Salir** pregunta antes. El proyecto desaparece de tus proyectos, y solo podrás abrirlo de nuevo
  si el propietario te invita o si el enlace te admite. El propietario no tiene **Salir**: elimina
  el proyecto.
- **Sesión en vivo**, solo del propietario, deja entrar durante un tiempo a cualquiera con su
  enlace, con cuenta o sin ella ([sesiones en vivo](#sesiones-en-vivo)). Sin ninguna activa, lo dice
  y ofrece **Iniciar una sesión en vivo** junto al interruptor **Los invitados pueden editar**. Con
  una activa, muestra su enlace con **Copiar enlace**, el interruptor, cuántos invitados hay ahora y
  cuándo termina ("Termina en 23 h 59 min"), y **Terminar sesión**, que pregunta antes. El diálogo
  lee la sesión cada vez que se abre, así que se ve una iniciada en otro dispositivo.
- **Publicar…** abre el diálogo de publicar ([publicar un proyecto](#publicar-un-proyecto)).

Lo que el servicio rechaza se dice con palabras: por ejemplo "Un proyecto admite como máximo 50
personas e invitaciones pendientes en conjunto. Quita a alguien o revoca una invitación antes."

Un editor trabaja en el proyecto como su propietario: los archivos, el lienzo, las imágenes y
fuentes, y las versiones, restaurar una incluido. Renombrar y eliminar el proyecto, quién puede
abrirlo y publicarlo son cosa del propietario.

### Ver un proyecto compartido

Un lector puede mirar un proyecto pero no cambiarlo. Cualquiera a quien admite el enlace de un
proyecto es lector cuando el enlace es `view`, y también una persona con sesión iniciada a la que se
añadió como **Puede ver**; una persona sin sesión es lectora también en un enlace `edit`, porque
editar necesita una cuenta. La página muestra **Solo lectura** en la cabecera, con los botones que
guardan una copia, y desactiva todo lo que edita:

- **El código** es de solo lectura. Puedes seleccionar y copiar, y usar la información al pasar el
  puntero y la lista de problemas; escribir, Intro, Tab, aceptar una sugerencia, una corrección
  rápida, el cambio de nombre (F2) y el formato (Mayús+Alt+F) no cambian nada.
- **Los archivos** no se pueden abrir desde tu equipo, importar, crear, renombrar, mover ni
  eliminar: el explorador los lista sin ninguna de sus acciones, y el panel no ofrece **Nuevo
  proyecto** ni **Importar proyecto**. El árbol, **Exportar** (todos los formatos) y **Descargar**
  funcionan como siempre.
- **El lienzo** dice "solo lectura". La paleta y los demás controles que escriben el diagrama están
  ocultos; un arrastre, una conexión, un borrado o una edición con el teclado no cambian nada, y la
  línea de estado lo dice; el inspector muestra los valores y no puede cambiarlos, y el panel del
  tema no se abre. La selección, el zoom, el desplazamiento, el minimapa, mostrar y ocultar capas,
  copiar, las historias con su línea de tiempo y los efectos funcionan.
- **Deshacer, Rehacer y Ctrl+S** no tienen nada que deshacer ni que guardar; Ctrl+S lo dice y
  remite a la copia.
- **Compartir** da el enlace del proyecto y lo que eres para él, y nada que cambiar: las personas
  solo a un miembro ([compartir un proyecto](#compartir-un-proyecto)).

Lo que ve un lector no es igual para todos:

- **Sin sesión.** La página se conecta a la sala del proyecto como visita, con una identidad de
  invitado ("Invitado 37", o el nombre que des en la barra bajo la cabecera): lo que cambian los
  editores aparece según lo hacen, ves quién más está con sus cursores, selecciones y punteros, y te
  ven, con una insignia de **Invitado**. No guarda nada en el navegador (ninguna copia en
  IndexedDB), y el proyecto que guarda el navegador no se toca. Solo cuando la sala no responde a
  tiempo la página lee en cambio el proyecto una vez, sus archivos y las imágenes y fuentes que
  usan, y entonces dice enseguida que el proyecto puede haber cambiado, con **Recargar para ver los
  cambios**, que vuelve a leerlo.
- **Con sesión.** La página se conecta a la sala del proyecto como lectora: lo que cambian los
  editores aparece según lo hacen ("Siguiendo en vivo"), y la conexión se restablece como la de
  cualquier proyecto en la nube ("Reconectando… mientras tanto ves la última versión"). Ves quién
  más está, con sus cursores y sus selecciones, y te ven ([trabajar juntos](#trabajar-juntos)). Un
  lector tampoco guarda nada en el navegador: ni copia en IndexedDB ni archivo recordado; no tiene
  botón **Versiones**, porque no hay nada que nombrar ni restaurar, y no envía miniatura. Si el
  proyecto se elimina mientras se sigue, la línea de estado dice que ya no está disponible para ti.

Dos botones guardan una copia. **Hacer una copia** pone los archivos que estás mirando en este
navegador como el proyecto propio del navegador y sale del modo de solo lectura, así que puedes
editarlo, y se conserva como cualquier otro proyecto del navegador; si el navegador tiene trabajo
que no es una plantilla, la página pregunta antes, y lo que reemplaza queda como el proyecto
anterior (**Restaurar** en el panel Proyectos). **Guardar una copia en mis proyectos**,
que aparece cuando has iniciado sesión, pide al servicio que copie el proyecto a tu cuenta y abre la
copia como su propietario: cuenta para tus 100 proyectos y 200 MiB como cualquier proyecto, y las
versiones no se copian. Ninguna copia cambia el proyecto compartido.

Cuando tu rol cambia con el proyecto abierto (el propietario te hace editor o lector, o cambia
quién admite el enlace), el servicio corta tu conexión y la página reconecta al cabo de un segundo.
El saludo de la sala nombra entonces el rol nuevo, y la página vuelve a abrir el proyecto en el modo
que da ese rol, conservando el archivo que tenías abierto; hace lo mismo cuando la sala rechaza un
cambio. La línea de estado dice "Tu acceso cambió: puedes ver este proyecto, pero no cambiarlo." o
"Tu acceso cambió: ya puedes editar este proyecto." Un editor que pasa a lector pierde lo que la
sala aún no había recibido: la copia del proyecto en el navegador se descarta, porque un lector no
guarda nada. A quien se quita, y a quien el enlace no admite, el proyecto le desaparece, como si lo hubieran eliminado: a un lector se le dice "Este proyecto ya
no está disponible para ti".

### Trabajar juntos

Un proyecto en la nube puede estar abierto en varios sitios a la vez: en tus propios dispositivos y,
cuando lo compartes, para las personas que abren su enlace
([compartir un proyecto](#compartir-un-proyecto)), y, durante una sesión en vivo, para cualquiera
con el enlace de la sesión ([sesiones en vivo](#sesiones-en-vivo)). El propietario, los editores y
los invitados que pueden editar escriben en él juntos; los lectores y las visitas lo siguen. No hay
nada que activar: lo que haces se muestra a los demás y lo que hacen ellos se te muestra a ti. Una
sala admite veinte conexiones a la vez, así que una persona con el proyecto abierto en dos pestañas
cuenta dos veces. Cuando está llena, el propietario y los editores con cuenta siguen entrando: un
lector o un invitado (la conexión más reciente de quien tenga más) cede su sitio y ve la sala llena
en su lugar.

**Quién está.** La cabecera lista a las demás personas que tienen el proyecto abierto: una imagen,
un nombre y, en una pantalla de 1700 píxeles de ancho o más, el nombre del archivo en el que están.
Cada persona tiene un color, uno de doce elegido a partir de su cuenta y el mismo en todas las
páginas, aunque dos personas pueden compartir uno. Se listan cuatro y las demás están tras un botón
**+N**, en un menú. Pulsar a una persona abre el archivo en el que está; una persona que no tiene
ninguno abierto, o que tiene uno que este proyecto no tiene, aparece en la lista pero no se puede
pulsar. La lista se oculta mientras estás solo. Tu propia cuenta no aparece nunca, tengan el
proyecto abierto las pestañas o los dispositivos que tengan, aunque el cursor y la selección de otra
pestaña tuya se dibujan como los de cualquiera, en tu color. Una persona sin cuenta no tiene imagen
y lleva una insignia de **Invitado** junto a su nombre, en la cabecera y en la etiqueta de su
cursor: la sala dice quién es invitado, así que nadie puede pasar por una cuenta.

**En el código.** El cursor de otra persona en el archivo que tienes abierto es una barra fina de su
color con su nombre en una etiqueta encima (debajo, en la primera línea). La etiqueta se desvanece
a los dos segundos sin que el cursor se mueva, para que el código se siga leyendo cuando hay varias
personas en un mismo archivo, y vuelve cuando el cursor se mueve. Una selección es una banda
translúcida del mismo color. Ambos se sujetan a los caracteres en los que estaban, no a una línea y
una columna, así que se mueven cuando alguien escribe, tú incluido. La capa no recibe clics ni
selección y no se copia nunca. Una persona que está en otro archivo no se dibuja.

**En el lienzo.** Un elemento, una relación o un evento que otra persona ha seleccionado en el
archivo que estás mirando se rodea con un contorno de su color y una etiqueta con su nombre; cuando
varias personas tienen seleccionado lo mismo, sus contornos y sus etiquetas se apilan. El contorno
es solo un dibujo: un clic sobre él llega al elemento que tiene debajo. No se dibuja para algo de
una capa oculta, ni mientras se reproduce una historia (vuelve cuando la historia termina), y
ninguna de las exportaciones lo lleva. El lienzo lo recibe como un mensaje `presence`
([la guía del editor](editor.md#los-paneles)).

**Punteros.** Donde está el puntero de otra persona sobre el lienzo del diagrama que estás mirando,
el lienzo dibuja un cursor de su color con su nombre en la cola. Se mueve cuatro veces por segundo y
se desliza de una posición a la siguiente en 200 milisegundos, así que se lee como un solo
movimiento; su punta está en el mismo sitio del diagrama con cualquier zoom, y mantiene su tamaño
en la pantalla. Se va tres segundos después de que el puntero de la persona se detenga, o en cuanto
sale de su lienzo. Un clic lo atraviesa; no se dibuja mientras se reproduce una historia, y ninguna
exportación lo lleva.

**Qué se comparte.** Cuatro cosas: el archivo que tienes abierto, dónde está tu cursor o tu
selección en él, qué has seleccionado en el lienzo y dónde está tu puntero sobre él mientras se
mueve por él. Nunca quién eres: la sala añade el nombre y la imagen de
tu cuenta a lo que retransmite ([presencia](cloud.md#presencia-awareness)), así que nadie puede
aparecer como otra persona, y a quien no tiene nombre se le muestra como "Alguien". Los nombres se
muestran siempre como los caracteres que son: una persona llamada `<b>Ben</b>` aparece exactamente
así. La página envía tu estado cuando cambia, como máximo cuatro veces por segundo, y otra vez cada
quince segundos; una persona desaparece de tu página cuando se cierra su conexión o cuando pasan
treinta segundos sin saber nada de ella, así que una persona cuyo equipo se suspendió o perdió la
conexión desaparece en menos de medio minuto (una página también olvida a quien la sala no ha
mencionado en cuarenta y cinco segundos, por si el aviso de que se fue no le llegó). Mientras tu propia conexión está caída no se muestra a nadie más, y se muestra a todos otra
vez cuando vuelve. Nada de la presencia se guarda: ni en el proyecto, ni en una exportación, ni en
este navegador, ni en el almacenamiento de la sala.

Un lector, con sesión o sin ella, comparte su presencia como cualquiera (dónde está, nunca una
edición) y ve la de todos ([ver un proyecto compartido](#ver-un-proyecto-compartido)).

**Escribir juntos.** Dos personas que escriben en un mismo archivo, incluso en una misma línea en el
mismo momento, acaban con el mismo texto en las dos páginas y con todos los caracteres de ambas
conservados; no hay ningún diálogo ni nada que resolver. Las ediciones del lienzo y lo que se
escribe se entrelazan igual: mientras una persona arrastra un elemento y otra escribe en el archivo,
las dos páginas conservan la nueva línea `place` y el texto escrito, y los dos lienzos muestran el
elemento movido. Tras la pausa habitual, el análisis se ejecuta sobre el texto tal como está, lo
haya escrito quien lo haya escrito, y el lienzo lo sigue. Tu cursor se queda en el mismo texto
cuando otros editan a su alrededor, y Ctrl+Z deshace solo lo que hiciste tú, nunca un carácter de
otra persona ([deshacer en un proyecto en la nube](#deshacer-en-un-proyecto-en-la-nube)); un cambio
que llega mientras escribes no termina tu paso de escritura.

**La conexión.** La línea de estado dice cómo está ([la tabla de arriba](#trabajar-en-un-proyecto-en-la-nube)):
guardado, reconectando o sin conexión, y para un lector "Siguiendo en vivo". Mientras está caída
sigues editando. La página lo intenta de nuevo al cabo de un segundo, después dos, duplicando hasta
treinta, y enseguida cuando el navegador vuelve a estar en línea o la página vuelve al primer plano;
cuando conecta, lo que hiciste y lo que hicieron los demás entretanto se combinan, sin nada que
resolver ([sin conexión](#sin-conexión)).

**Una sala llena.** La conexión número veintiuno se rechaza. La línea de estado dice "Sala llena: ya
hay 20 personas en este proyecto. Reintentando…" con un botón **Reintentar**; la página también lo
intenta sola, al cabo de medio segundo la primera vez y cada vez más tarde hasta treinta segundos, y
entra cuando alguien se va. Lo que escribes entretanto se queda en este navegador y se combina
cuando ya estás dentro. Si este navegador no tiene una copia del proyecto desde la que abrirlo (la
primera vez, o como lector, que no guarda ninguna), no se abre nada: la página dice que la sala está
llena y que vuelvas a abrir el proyecto dentro de un momento, y el proyecto del navegador se queda.

Lo que no hace:

- Es para proyectos en la nube abiertos en el playground. La extensión de VS Code y la línea de
  comandos no muestran presencia; un push mediante la API o la línea de comandos llega en vivo a las
  personas de la sala, como cualquier cambio.
- No sigue la vista de nadie, y no tiene comentarios, chat ni voz.
- Los cursores, las selecciones y los punteros se dibujan solo para el archivo que tienes abierto;
  las personas que están en otros archivos figuran en la cabecera.
- Un proyecto que no está en la nube no tiene sala: el diálogo `#p=` del proyecto del navegador dice
  que una sesión en vivo requiere el proyecto en una cuenta, con **Guardar en mis proyectos** cuando
  tienes la sesión iniciada e **Inicia sesión para iniciar una** cuando no.

### Sesiones en vivo

Una sesión en vivo deja entrar durante un tiempo a cualquiera con su enlace en un proyecto en la
nube, con cuenta o sin ella, para trabajar en él juntos según ocurre. El propietario la inicia desde
el diálogo de compartir ([compartir un proyecto](#compartir-un-proyecto)) y pasa su enlace,
`<origin>/p/<id>?live=<token>`. Dura veinticuatro horas, termina sola tras una hora sin nadie en el
proyecto, y el propietario la termina con **Terminar sesión** cuando quiera. Mientras está activa,
la cabecera del propietario muestra **En vivo · 2 invitados**, que abre el diálogo. **Los invitados
pueden editar** decide qué pueden hacer quienes se unen por el enlace: editar, o solo mirar;
cambiarlo con invitados dentro los reconecta en un segundo con el nuevo rol.

**Unirse.** Quien abre el enlace se une enseguida: una persona con sesión, con su cuenta y el mayor
entre su propio rol y el de la sesión; cualquier otra, como invitado, sin cuenta y sin iniciar
sesión. La página de un invitado abre el proyecto ligado a su sala, no guarda nada en el navegador y
conserva `live` en la dirección, así que al recargar vuelve a unirse. Una barra bajo la cabecera dice
"Estás en la sesión en vivo de Together como" con el nombre que ven los demás, **Invitado 37** al
principio (dos dígitos del propio id del navegador, así que dos invitados se distinguen por el
nombre y no solo por el color), que cambias ahí: la página reconecta y los demás ven el nuevo nombre
enseguida. La barra dice también cuándo termina la sesión, y ofrece **Hacer una copia** e **Iniciar
sesión**. Quien visita un enlace `view` o `edit` sin sesión en vivo tiene la misma barra ("Sigues
Together en vivo como").

**Qué puede hacer un invitado.** Editar el texto y el lienzo, añadir, renombrar y eliminar archivos,
y deshacer sus propias ediciones, como un editor. Lo que se guarda en una cuenta la necesita, y la
página lo dice con el camino para tenerla: añadir imágenes y fuentes ("Añadir imágenes y fuentes
requiere una cuenta. Inicia sesión para añadirlas."), las versiones, la miniatura, compartir y
publicar. **Hacer una copia** pone los archivos en este navegador como su propio proyecto.

**Cuando termina.** La conexión de un invitado se cierra y la línea de estado dice "La sesión en vivo
terminó"; la página nunca reconecta con ese enlace. Cuando el enlace del proyecto deja ver a
cualquiera, la página sigue el proyecto en vivo como visita, sin editar. Cuando no, la página
conserva lo que muestra, en solo lectura, con **Hacer una copia**: nada más del proyecto le llega.

**Límites.** Los invitados y las visitas cuentan entre los veinte sitios de la sala y ceden el suyo
al propietario y a los editores como lo hacen los lectores. Una red admite como máximo diez
conexiones sin cuenta en una sala: la undécima dice "Demasiadas conexiones desde esta red" y no lo
vuelve a intentar sola.

### Publicar un proyecto

El propietario de un proyecto en la nube lo publica desde **Publicar…** del diálogo de compartir. Un
proyecto publicado es una página web: el catálogo HTML de sus diagramas e historias, la misma página
que escribe **Descargar → Catálogo** ([catálogo](catalog.md)), en el idioma del proyecto y con sus
ajustes de `catalog`, servida en una dirección propia que cualquiera puede abrir sin cuenta:
`https://<host de publicación>/<alias>/<nombre de la página>/`. La página se construye en el
navegador; el servicio guarda lo que se le envía y nunca dibuja nada. Solo el propietario puede
publicar, despublicar o ver el diálogo.

- **Alias.** La primera vez, el diálogo pide uno: de 3 a 30 letras minúsculas, dígitos o guiones,
  único entre las cuentas. Forma parte de cada dirección que publicas, y no puede cambiar mientras
  tengas una página publicada. La página lo pide solo cuando el catálogo ya está construido y es lo
  bastante pequeño para enviarse, así que un proyecto que no se puede publicar nunca se queda con un
  alias.
- **Nombre de la página.** La última parte de la dirección: letras minúsculas, dígitos y guiones,
  hasta 60. Empieza siendo el nombre del proyecto convertido en uno. Un proyecto puede publicar
  varias páginas con nombres distintos, y un nombre bajo el que otro de tus proyectos ya publica se
  rechaza: el diálogo lo dice bajo el nombre y pide otro. También dice en qué terminará la
  dirección.
- **Publicar** construye el catálogo, comprueba que no pasa de 16 MiB y lo envía. Dice "Se publicó
  _nombre_." y, cuando algunos diagramas no se pudieron dibujar, cuántos quedaron fuera. Un proyecto
  sin nada que dibujar dice que no tiene diagramas que publicar. La dirección aparece con
  **Copiar** y **Abrir** (en una pestaña nueva). Un proyecto se puede publicar diez veces por hora.
- **Páginas publicadas** lista lo que el proyecto ha publicado, con su fecha, **Publicar de nuevo**,
  que actualiza la página con el proyecto tal como está ahora, y **Despublicar**, que pregunta antes.
  Una página despublicada deja de servirse al instante, aunque un navegador puede seguir mostrando
  una copia que ya tiene hasta cinco minutos.
- **Retiradas por el servicio.** Una página que el servicio retiró aparece como retirada por el
  servicio, con la fecha y el motivo.

Lo que contiene una página publicada es lo que contiene el catálogo: títulos, descripciones, tipos,
nombres de archivo dentro del proyecto y lo que muestran los dibujos, y el texto fuente solo si el
`catalog.source` del proyecto es `true`
([el catálogo](catalog.md#solo-metadatos-autorizados)). La página se ejecuta bajo la política del
propio catálogo, en un dominio que no tiene cookie ni API
([el host de publicación](cloud.md#el-host-de-publicación)). Ese dominio es `meltemi.page`; en
desarrollo la dirección está bajo `/_published/` en el propio origen del servicio.

### Límites conocidos

- Una imagen o una fuente quitada con la página sin conexión, o cuando no se puede avisar al
  servicio, sigue contando en el almacenamiento de la cuenta hasta que se elimina el proyecto
  ([la recolección de blobs](cloud.md#la-recolección-de-blobs)).

## Privacidad y seguridad

La política de seguridad de contenido de la página solo permite scripts, estilos, fuentes, imágenes
y conexiones de su propio origen, además de `data:` y `blob:` para las imágenes dibujadas; sin
cuenta, ninguna solicitud sale de ella, y la prueba en el navegador lo comprueba para cada función.
La cuenta añade dos cosas a la política y no quita nada. `img-src` también permite
`https://avatars.githubusercontent.com` y `https://*.googleusercontent.com`, donde los proveedores
de inicio de sesión guardan los avatares, así que el avatar de quien ha iniciado sesión es la única
imagen que el navegador puede cargar de otro origen. `form-action`, que era `'none'`, es `'self'`
más el origen del servicio de identidad para el que se compiló la página, para que el formulario
**Cerrar sesión** pueda enviarse a él. `connect-src` sigue siendo `'self'`: iniciar sesión es una
navegación, no una solicitud que haga la página. Los proyectos en la nube tampoco añaden nada a la
política: la página habla con su propio origen, con solicitudes normales y un WebSocket a su propio
host (`/rooms/<id>`). Las imágenes y las fuentes de un proyecto en la nube llegan a la página como
bytes que el servicio sirve en una sandbox y como descargas
([imágenes y fuentes](cloud.md#imágenes-y-fuentes)), así que un script dentro de un SVG subido no se
ejecuta en ningún sitio. Compartir, ver y publicar tampoco añaden nada: la página de un lector lee
el proyecto con solicitudes normales a su propio origen, y publicar envía el HTML del catálogo al
servicio como una más; las imágenes de las personas del diálogo de compartir se dibujan solo desde
los hosts que la política ya permite. Trabajar juntos tampoco añade nada: la presencia viaja por el
mismo socket, y el nombre y la imagen de cada persona vienen de la sala, se muestran como texto y
con la misma regla para las imágenes, y no se guardan en ningún sitio
([seguridad](security.md#proyectos-en-la-nube)). Una página publicada se sirve desde un dominio
propio, nunca desde el origen de la página ([seguridad](security.md#compartir-y-publicar)). Nada de
un proyecto o de un enlace se ejecuta: se compilan con los límites de `docs/security.md`. La página no tiene asistencia de IA: necesitaría la
clave de un proveedor en una página web y solicitudes al proveedor; la CLI y el editor sí la tienen
(`docs/assist.md`).

## Cómo está construido

- El lienzo es `@meltemi/diagrams-canvas`, compartido con la webview de la extensión; la página
  hace el papel de la extensión (aplica los planes, lleva las revisiones, responde a las solicitudes
  del lienzo).
- El explorador es `src/explorer/`: `tree-model.ts` (el árbol, las filas que recorren las teclas y
  las reglas de los nombres, los movimientos y las copias, sin DOM), `tree.ts` (el árbol WAI-ARIA,
  redibujado por clave para que el foco, el desplazamiento y una carpeta que se abre sobrevivan a los
  cambios del proyecto), `explorer.ts` (el panel y sus acciones), `switcher.ts` (la cabecera y el
  panel Proyectos), `new-project.ts`, `import.ts` y `dialogs.ts`. Un movimiento pasa por
  `Studio.moveFiles`, que reescribe las importaciones con `moveFileEdits` de
  `@meltemi/diagrams-editor` y anota el movimiento en la pila propia del historial; los dibujos de las
  tarjetas de plantillas se hacen al compilar el sitio (`thumbnails.mjs`).
- Los proyectos viven en memoria (`MemoryHost`, un `ProjectHost` bajo `/playground`) y se compilan
  con `ProjectSessions` de `@meltemi/diagrams-editor`, con los lectores de fuentes y de Tabler de la
  página y el worker de ELK incluido.
- Las fuentes y los datos de iconos se obtienen del propio origen de la página la primera vez que se
  leen; la página vuelve a analizar cuando llegan, y las exportaciones esperan a todos los archivos
  que leen.
- El codificador de GIF, los generadores de WebM y MP4 y el lector y el generador de ZIP forman
  parte de la página (`packages/playground/src/encode/`, `src/zip.ts`); no se descarga nada más.
- La cuenta es `src/cloud/`: la sesión que la página pide una vez (`session.ts`), el enlace de
  inicio de sesión y el menú de la cuenta de la cabecera (`account.ts`) y el diálogo de tokens de
  API (`tokens-dialog.ts`, sobre `tokens-model.ts` y `tokens.ts`, que no necesitan DOM). La página
  funciona igual diga lo que diga el servicio; nunca falla por su respuesta.
- Los proyectos en la nube también están en `src/cloud/`. `client.ts` hace las llamadas al servicio y
  ninguna lanza un error. `projects-model.ts` es la lista en la nube del panel del explorador, y
  `versions.ts` el
  panel de versiones sobre `versions-model.ts`; ninguno de los dos modelos necesita DOM.
  `project.ts` es un proyecto abierto: su documento Yjs (`doc.ts`), el binding que ata el documento
  al `Studio` (`binding.ts`), el socket a la sala (`room.ts`), su copia en IndexedDB
  (`persistence.ts`) y el estado de la conexión (`status.ts`). `thumbnails.ts` y
  `thumbnail-render.ts` hacen y envían la vista previa, `address.ts` lee y escribe `?project=`, y
  `controller.ts` lo mantiene todo junto para el panel y el shell. El `Studio` gana un listener
  `change`, `replaceText` para los cambios que llegan de fuera y `canUndo` y `canRedo`, y delega
  deshacer en el binding mientras hay un proyecto en la nube abierto. La única dependencia en tiempo
  de ejecución que añaden los proyectos en la nube es `yjs` (MIT, en `NOTICES.md`); la página
  mantiene el navegador, el socket, IndexedDB y el reloj detrás de interfaces pequeñas, así que las
  pruebas simulan todos ellos.
- Compartir, ver y publicar también están en `src/cloud/`. `share.ts` dibuja el diálogo de compartir
  sobre `share-model.ts`, cuyo `shareView` es el único lugar que decide qué se muestra a cada rol (un
  control que una persona no puede usar no se dibuja), y `share-api.ts`, las llamadas; `publish.ts`,
  `publish-model.ts` y `publish-api.ts` hacen lo mismo con la publicación, construyendo la página con
  `projectCatalog` (`src/exports/files.ts`), la compilación que comparte la descarga del catálogo.
  Ver es `view-mode.ts` (el modo), `snapshot.ts` (la lectura de quien no ha iniciado sesión),
  `link.ts` (abrir una dirección y aceptar una invitación), `view-actions.ts` (las copias y la
  recarga), `view-bar.ts` (la insignia de la cabecera y el aviso de recarga) y `view-page.ts`, que
  los une. `Studio.setReadOnly` rechaza toda edición en el único lugar por el que pasan las
  ediciones, `CodePane.setReadOnly` y el shell protegen el resto, el binding no envía ninguna
  actualización como lector, y `canvas-settings.ts` da al lienzo `readOnly` en su mensaje `settings`
  ([la guía del editor](editor.md)).
- La presencia también está en `src/cloud/`. `presence.ts` es lo que un proyecto cuenta a la sala
  sobre su persona (el archivo abierto, el cursor como posiciones relativas de Yjs, la selección del
  lienzo) con la limitación (throttle) de 250 ms y el latido, y lo que la sala dice de los demás;
  `presence-wire.ts` es el formato de los mensajes de tipo 2 ([presencia](cloud.md#presencia-awareness))
  y el único lugar que lee el contenido de un par; `presence-model.ts` decide, contra el documento
  tal como está ahora, a quién lista la cabecera, qué cursores dibuja el panel de código y qué se le
  cuenta al lienzo; `presence-geometry.ts` dice dónde está una posición en el panel. Ninguno de esos
  cuatro necesita DOM. `presence-bar.ts` dibuja la lista de la cabecera, `presence-overlay.ts` los
  cursores y selecciones sobre el código, y `presence-mount.ts` los une al shell; `room.ts` lleva
  los mensajes de tipo 2 en ambos sentidos, y el lienzo dibuja el resto a partir de un mensaje
  `presence` ([la guía del editor](editor.md)).

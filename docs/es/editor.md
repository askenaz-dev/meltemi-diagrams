# Edición en VS Code

[English](../editor.md)

La extensión Meltemi Diagrams agrega el lenguaje `.meltemi` a VS Code y a sus derivados (1.95 o
posterior). También pone un lienzo junto al código. El texto sigue siendo la fuente de verdad: cada
acción en el lienzo es una pequeña edición del mismo documento. Deshacer, rehacer, guardar, el
indicador de cambios sin guardar y Git funcionan exactamente igual que con el texto.

El lienzo es el paquete `@meltemi/diagrams-canvas`; el playground (`docs/playground.md`) monta el
mismo lienzo en una página web, así que lo que esta página dice de él también vale allí.

## Instalación

Genera el paquete e instálalo:

```bash
pnpm vscode:package
```

```bash
code --install-extension packages/vscode/meltemi-diagrams.vsix
```

Para volver atrás, desinstálala desde la vista Extensiones. Para trabajar en la propia extensión,
presiona F5 con **Run Meltemi Diagrams**. Eso la compila y abre un Host de desarrollo de
extensiones sobre `examples/`.

## Los paneles

- **Código**: resaltado, diagnósticos en vivo y todas las funciones del lenguaje que se listan más
  abajo.
- **Lienzo**:
  - se abre junto al código cuando abres un archivo `.meltemi`;
  - la barra de herramientas tiene el selector de diagramas con **Nuevo diagrama** al lado, la
    paleta, el zoom, los botones de cuadrícula, ajuste a la cuadrícula, minimapa e inspector,
    organizar y exportar;
  - la insignia muestra el modo de disposición.
- **Inspector**: primero la barra de estilo (colores, línea, ancho, radio de las esquinas, forma,
  posición del icono, punta, efectos y el tema del diagrama), luego las propiedades del diagrama,
  del elemento o la relación seleccionados, o el estilo común de varios elementos. Mientras se
  edita un tema, el panel del tema ocupa su lugar.

- **Bibliotecas** (botón de la barra de herramientas, U): elementos prearmados por categoría, de
  AWS, Azure, Google Cloud, Kubernetes, Tabler y los logos de tecnologías, con un cuadro de búsqueda
  y el control de colocación del selector de iconos
  ([bibliotecas de elementos](#bibliotecas-de-elementos)).
- **Capas** (botón de la barra de herramientas, L): las capas de un diagrama de flujo o de una
  composición libre, de adelante hacia atrás, con lo que tiene cada una
  ([capas y orden](#capas-y-orden)).
  **Ocultar el lienzo.** Si cierras el lienzo mientras el código sigue abierto, queda cerrado: en esta
  sesión, en las siguientes y para otros archivos. **Abrir el lienzo al lado** (el icono del título
  del editor, o la paleta de comandos) lo vuelve a abrir y restablece la apertura automática. El
  ajuste `meltemi.canvas.openWithText` elige `remember` (el predeterminado), `always` o `never`.

| Ajuste                        | Predeterminado | Significado                                                                              |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `meltemi.canvas.openWithText` | `remember`     | Cuándo se abre el lienzo junto al código                                                 |
| `meltemi.canvas.grid`         | `14`           | Tamaño de la cuadrícula en unidades del diagrama                                         |
| `meltemi.canvas.showGrid`     | `true`         | Dibujar la cuadrícula                                                                    |
| `meltemi.canvas.snap`         | `true`         | Ajustar a la cuadrícula                                                                  |
| `meltemi.canvas.guides`       | `true`         | Ajustar a los lados y los centros de otras cajas, con guías                              |
| `meltemi.canvas.minimap`      | `true`         | Mostrar el minimapa                                                                      |
| `meltemi.canvas.inspector`    | `true`         | Mostrar el inspector                                                                     |
| `meltemi.export.browser`      | vacío          | El navegador que dibuja PNG, PDF y video; si está vacío, se busca uno                    |
| `meltemi.export.ffmpeg`       | vacío          | El FFmpeg que codifica el video; si está vacío, `ffmpeg` del PATH                        |
| `meltemi.assist.provider`     | vacío          | Asistencia opcional de IA: `anthropic` u `openai-compatible`; si está vacío, desactivada |
| `meltemi.assist.model`        | vacío          | El modelo; si está vacío, `claude-opus-5-5` para Anthropic                               |
| `meltemi.assist.baseUrl`      | vacío          | El punto de conexión, como `http://127.0.0.1:11434/v1` para un Ollama local              |
| `meltemi.language`            | `auto`         | El idioma de la extensión y del lienzo: `auto`, `en` o `es`                              |

Los botones de la barra de herramientas prevalecen sobre los ajustes de cuadrícula, ajuste a la
cuadrícula, minimapa e inspector en un lienzo concreto.

**Un lienzo de solo lectura.** El anfitrión del lienzo (la extensión o la página) le envía sus
ajustes en un mensaje `settings`
(`CanvasSettings`: `grid`, `showGrid`, `snap`, `guides`, `minimap` e `inspector`, los valores de la
tabla de arriba), y cada mensaje reemplaza los ajustes por completo. Un anfitrión puede añadir
`readOnly: true` para que el lienzo solo muestre: el playground lo hace mientras se ve un proyecto
compartido ([playground](playground.md#ver-un-proyecto-compartido)), y un mensaje posterior sin él, o
con `false`, hace que el lienzo vuelva a editar sin recargar. La extensión nunca lo envía, así que
VS Code no ve ningún cambio. Mientras está activo, el lienzo muestra una insignia "solo lectura",
oculta la paleta y todos los demás controles que escriben el diagrama (los controles de edición de
la línea de tiempo de las historias, el panel de bibliotecas y los botones que crean diagramas
incluidos), y no envía al anfitrión ninguna acción: un arrastre, una conexión, un borrado, una
etiqueta en el sitio, una edición con el teclado, un campo del inspector, deshacer y rehacer y el
panel del tema dejan el diagrama como está, y la línea de estado lo dice. La selección, el zoom,
el desplazamiento, el minimapa, mostrar y ocultar capas, copiar, las historias con su línea de
tiempo y los efectos funcionan.

**Las selecciones de otras personas.** Un anfitrión que comparte el diagrama puede decirle al
lienzo quién más está en él con un mensaje `presence`, `{ type: "presence", people }`, donde cada
persona tiene un `name`, un `colour`, los ids que ha seleccionado (elementos, relaciones y
eventos) y, mientras se mueve, el `pointer` sobre su lienzo. El playground lo hace en un proyecto en la nube que tienen abierto varias personas
([trabajar juntos](playground.md#trabajar-juntos)); la extensión nunca lo envía, así que VS Code no
ve ningún cambio. El lienzo rodea cada uno de esos ids con un contorno del color de la persona y le
pone una etiqueta con su nombre, y dibuja cada puntero como un cursor del color de la persona con
el nombre en la cola, que se desliza de un punto al siguiente, en una capa por encima de la escena
que nunca se selecciona, se copia ni se exporta: pulsar sobre un contorno o un cursor llega al
elemento que tiene debajo. El lienzo le dice a ese anfitrión dónde está su propio puntero
(`presencePointer`), y nada más de la capa. Cada mensaje es la imagen completa y sustituye al anterior; un mensaje sin nadie, un
lienzo vacío u otro diagrama la borran. Los ids que el diagrama no tiene se ignoran, igual que lo
que está en una capa oculta, y mientras se reproduce una historia no se dibuja nada (las personas
se conservan para cuando termine). Un nombre se muestra siempre como texto, nunca como marcado. El
[README del paquete del lienzo](../../packages/canvas/README.md) explica cómo lo envía un anfitrión.

**Idioma.** La extensión habla inglés y español. `meltemi.language` vale `auto` de forma
predeterminada, que sigue el idioma de la interfaz de VS Code; `en` o `es` eligen uno. Los
diagnósticos, la información al pasar el puntero, el autocompletado y las correcciones rápidas
también lo siguen. Al cambiarlo, los lienzos abiertos se vuelven a dibujar y los documentos abiertos
se vuelven a analizar en el nuevo idioma. Los títulos de los comandos y las descripciones de los
ajustes siguen el idioma de la interfaz de VS Code. Las palabras que el lienzo escribe en los
archivos, como el texto de una nota nueva ("Note" o "Nota"), siguen el idioma de la interfaz, como
si las hubieras escrito tú. Los dibujos exportados, los reproductores y los catálogos siguen en
cambio el `"locale"` del proyecto ([proyectos](language/projects.md#idioma-de-las-exportaciones)), así que
el mismo proyecto exporta los mismos archivos sea cual sea el idioma del editor.

## Funciones del lenguaje

| Función                                            | Qué hace                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnósticos                                       | Problemas de compilación, de proyecto y de disposición, mientras escribes, con sus pistas                                                                                                                                                                                    |
| Autocompletado                                     | Instrucciones según el bloque, ids de elementos y de relaciones, puertos después de `element.`, valores de propiedades, temas, clases, tokens de color e iconos dentro de `icon "…"`; en las historias, acciones, transiciones, diagramas y los ids de la vista de la escena |
| Información al pasar el puntero                    | Elementos (tipo, etiqueta, posición, tamaño, puertos), relaciones (extremos, etiqueta, ruta), puertos, palabras clave, temas e iconos con una vista previa y su licencia; acciones de las historias con su lugar en el reloj, escenas e historias con sus tiempos            |
| Esquema y rutas de navegación                      | Diagramas, grupos, elementos y relaciones, anidados como están escritos; historias y sus escenas                                                                                                                                                                             |
| Ir a la definición, buscar referencias, resaltados | Para los ids de elementos y de relaciones, en todos los lugares donde se usan, también en las historias y en las historias de otros archivos que importan el diagrama                                                                                                        |
| Cambiar el nombre (F2)                             | Ids de elementos e ids de relaciones con nombre, con todas sus referencias, desde el diagrama o desde una historia, en todos los archivos del proyecto                                                                                                                       |
| Dar formato al documento                           | El formato canónico de `meltemi-diagrams format`                                                                                                                                                                                                                             |
| Colores semánticos                                 | Elementos, grupos, relaciones, puertos, clases y temas                                                                                                                                                                                                                       |
| Correcciones rápidas                               | Consulta la tabla siguiente                                                                                                                                                                                                                                                  |

| Problema                                                                            | Correcciones rápidas                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `layout.missing-placement`, `layout.mode-unsupported`                               | Organizar con ELK los elementos sin colocar                               |
| `layout.placement-ignored`                                                          | Cambiar a `layout assisted`; cambiar a `layout manual`                    |
| `ref.unknown-element`                                                               | Declarar el elemento como nodo                                            |
| `placement.unknown-port`                                                            | Declarar el puerto en el elemento; usar uno de sus puertos                |
| `layout.text-overflow`                                                              | Poner el tamaño que indica la pista                                       |
| `prop.unknown`, `layout.unknown-theme`, `theme.unknown-class`, `asset.unknown-icon` | Cambiar a la palabra, el tema, la clase o el icono aceptados más cercanos |

Refactorizaciones: **Nombrar esta relación** en una relación anónima y **Organizar el diagrama** en
cualquier diagrama de flujo.

## Moverse por el lienzo

- La cuadrícula mide 14 unidades de forma predeterminada, con una de cada cuatro líneas más marcada.
  Cubre todo el espacio de trabajo y se ve sobre la hoja, detrás de las formas.
- **Zoom**: Ctrl y la rueda, o pellizcar, acerca o aleja alrededor del puntero, del 10 % al 800 %.
  El menú de la barra de herramientas tiene valores predefinidos, **Ajustar a la vista** y
  **Selección**.
- **Desplazamiento**: la rueda, Mayús y la rueda, Espacio y arrastrar, o el botón central.
- **Minimapa**: muestra toda la hoja y la zona visible. Haz clic o arrastra en él para ir allí.
- **Selección en ambos sentidos**: seleccionar en el lienzo muestra el id en el código sin tomar el
  foco. Mover el cursor de texto resalta el elemento de la instrucción que está debajo.
- **Seleccionar**: haz clic en una caja o en un conector; Mayús o Ctrl agrega o quita uno. El clic
  selecciona la forma pintada encima; un rombo, una elipse u otra forma dibujada como trazado solo
  se alcanza dentro de su contorno. Alt+clic selecciona la forma de debajo, recorriendo la pila que
  está bajo el puntero ([formas tapadas](#formas-y-contenedores)). Arrastrar sobre el espacio vacío
  dibuja un rectángulo que selecciona las cajas y los conectores que quedan completamente dentro.
  Ctrl+A selecciona todo y Esc quita la selección.

## Diagramas nuevos y el tamaño del lienzo

**Un archivo vacío.** Cuando el archivo no tiene ningún diagrama, el lienzo lo dice y ofrece un
botón por cada tipo que crea: **Diagrama de flujo**, **Composición libre** y **Diagrama de
secuencia**. No queda nada del último dibujo: se vacían el selector de diagramas, el inspector, el
minimapa y las insignias de disposición y "Desactualizado". Un botón escribe el diagrama y lo
muestra con su paleta, así que un archivo vaciado queda así:

```text
language "0.2"

diagram diagram1: flow {
}
```

**Nuevo diagrama.** El botón **+** a la derecha del selector de diagramas ofrece los mismos tres
tipos en cualquier archivo. El diagrama se escribe después de la última instrucción del archivo,
tras una línea en blanco, con el primer id de `diagram1`, `diagram2`… que no usa ningún diagrama,
modelo, tema ni historia del archivo; un archivo sin `language` recibe antes `language "0.2"`. El
cambio es un solo paso de deshacer, y el selector nombra el diagrama nuevo mientras el lienzo lo
muestra. Las vistas C4 se escriben en el texto, porque una vista necesita un modelo
([c4.md](language/c4.md)). Un lienzo de solo lectura muestra el motivo de un archivo vacío sin los
botones y no tiene **Nuevo diagrama**, y ninguno de los dos se ofrece mientras se reproduce una
historia.

**El tamaño del lienzo.** Sin nada seleccionado, el campo **Lienzo** del inspector fija el tamaño
del dibujo de un diagrama de flujo, una composición libre, un diagrama de secuencia o una vista C4
([preajustes y lienzo](language/styles.md#preajustes-y-lienzo)):

| Lienzo               | Texto                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| ajustar al contenido | Ni `preset` ni `canvas`: el contenido y su margen                                                |
| `document`           | `preset document`                                                                                |
| `slide`              | `preset slide`                                                                                   |
| personalizado        | `canvas (w, h)` a partir del tamaño dibujado, con los campos **Ancho** y **Alto** de 100 a 10000 |

`preset` y `canvas` no se pueden combinar, así que cada opción quita la otra en la misma edición,
y ajustar al contenido quita las dos: un paso de deshacer cada vez. Un ancho o un alto fuera de
rango se rechaza indicando el rango, y el texto queda como estaba.

## Los gestos y lo que escriben

| Gesto                                                                                            | Cambio en el texto                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrastrar una caja (o varias, o un grupo)                                                        | `place` de cada caja; con Alt se mueve libremente; si no, se ajusta primero a las guías y luego a la cuadrícula                                                                    |
| Arrastrar una caja dentro de un grupo, o fuera de su grupo                                       | Su declaración pasa al bloque de ese grupo, o al nivel superior, con su `place` en el nuevo interior; Alt conserva el grupo                                                        |
| Arrastrar un tirador de tamaño                                                                   | `size` y `place`; los lados opuestos se quedan donde están, los tamaños se ajustan a la cuadrícula, como mínimo 24                                                                 |
| Arrastrar la etiqueta de una relación                                                            | `label <id> at <n>% offset (dx, dy)`                                                                                                                                               |
| Arrastrar un punto de paso de una ruta, o el centro de un tramo                                  | `route … via [...]`; arrastrar un centro agrega un punto de paso                                                                                                                   |
| Doble clic en un punto de paso                                                                   | Lo quita de `via`; una ruta que queda sin nada más desaparece                                                                                                                      |
| Arrastrar un extremo de la ruta sobre su caja, o justo fuera de ella                             | El punto del borde que toma, en la `route` (más abajo); dentro de la caja, `auto`                                                                                                  |
| Arrastrar un extremo de la ruta sobre otra caja                                                  | El extremo de la relación y su `route` con el punto                                                                                                                                |
| Doble clic en un extremo de la ruta                                                              | La disposición vuelve a elegir ese extremo                                                                                                                                         |
| Arrastrar desde un tirador de conexión (los puntos junto a una caja seleccionada) hasta una caja | `a -> b`; Mayús para `-->`; sobre su borde, además fija ambos extremos                                                                                                             |
| Presionar justo fuera del borde de una caja y arrastrar hasta otra caja                          | `a -> b` con el inicio fijado en ese punto; sobre el borde, también el final                                                                                                       |
| Herramienta de relación (R): clic en el origen y luego en el destino                             | `a -> b`, o el tipo de flecha elegido, seleccionada; Mayús en el segundo clic alterna continua y discontinua; Esc cancela                                                          |
| Elegir una herramienta de la paleta y hacer clic, o arrastrar un botón de la paleta al lienzo    | Una declaración y su `place`, dentro del grupo que está bajo el puntero (también un grupo se anida); una caja o un nodo con la forma actual recibe además `style <id> { shape … }` |
| Elegir un icono en el selector de iconos y hacer clic en el lienzo, o arrastrarlo hasta allí     | El elemento que dice el control de colocación, vacío, con `style <id> { icon … }` y su `place` ([iconos](#iconos))                                                                 |
| Arrastrar un icono del selector o del panel Bibliotecas sobre una forma                          | `style <id> { icon … }` de ese nodo, decisión, almacén de datos o caja, y nada más; la forma se resalta mientras el puntero está encima                                            |
| Doble clic en una caja o una relación, o presionar Entrar                                        | Su etiqueta, escrita donde se dibuja ([texto en su sitio](#formas-vacías-y-texto-en-su-sitio))                                                                                     |

- **Nombrar relaciones.** Las acciones sobre una relación anónima, incluidos un estilo, un efecto,
  una etiqueta, una capa, una línea punteada, una posición de etiqueta, una etiqueta movida, un
  extremo o un codo arrastrados, primero la nombran `<from>_<to>` (`as api_db`), en la misma
  edición, y la línea de estado lo indica; la relación sigue seleccionada con su id nuevo, y el
  inspector sigue en ella. Las clases y desactivar un efecto no nombran nada. En las vistas C4 el
  nombre se escribe en la relación del modelo (`as shop_api_db`, a partir de las rutas de las
  entidades), en el archivo del modelo cuando es otro archivo del proyecto. Los mensajes, las notas
  y los fragmentos anónimos de los diagramas de secuencia se nombran igual (`as web_api`, `note1`,
  `alt1`) cuando un efecto o un estilo lo necesita: nada se rechaza por falta de un nombre.
- **Diagramas libres.** Las posiciones de los objetos dentro de un grupo se escriben relativas al
  interior del grupo ([free.md](language/free.md)): mover un grupo escribe solo el `place` del
  grupo, y cambiar su tamaño desde el lado izquierdo o el superior desplaza las posiciones de sus
  hijos para que se queden donde están. El interior de un grupo sin título empieza `groupPadding`
  por debajo de su borde superior. El inspector muestra los valores escritos.
- **Fijar extremos.** Un conector puede tocar una caja en cualquier punto de su borde. Mientras
  arrastras el extremo de un conector, o una conexión nueva, sobre una caja o a menos de 12 px por
  fuera de ella, se muestra el contorno de la caja con sus imanes: el centro de cada lado, las
  esquinas y sus puertos con nombre. En una forma que no es un rectángulo, el contorno es el de la
  forma, y también los imanes: sus vértices y los centros de sus lados, sobre el contorno, sin
  esquinas en una elipse. El extremo toma el punto del lado más cercano bajo el puntero,
  de 1 en 1 %, o un imán que esté a menos de 6 px; con Alt no hay imanes. La ruta dice entonces
  dónde va, como `route save from api to db.north 37%`, y el conector se queda ahí, sin importar
  cómo se solapen las cajas ni los puntos de paso. Si lo sueltas más adentro de la caja, el extremo
  vuelve a estar libre y la disposición elige su punto.
- **Conectar desde el borde.** Al pasar el puntero a menos de 8 px por fuera del borde de una
  caja, donde no hay un tirador ni un conector, se muestra el punto desde el que empezaría una
  conexión, y el puntero se vuelve una cruz. Presiona ahí y arrastra hasta otra caja: la relación se escribe con el inicio
  fijado en ese punto, como `route cache_db from cache.north 30% to db.auto`, y con el final fijado
  también si la sueltas sobre el borde del destino. Los diagramas de secuencia no tienen rutas, así
  que ahí la conexión se crea sin extremos fijados; en una vista C4 la conexión escribe la relación
  en el modelo, con nombre cuando un extremo queda fijado.
- **Tiradores sobre la línea.** Un conector seleccionado muestra sus extremos, sus puntos de paso
  y, para cada tramo entre dos de ellos, un tirador a mitad de la línea tal como se dibuja, aunque
  la línea gire. Al arrastrarlo se agrega un punto de paso ahí.
- **Colores del tema.** La selección, los tiradores, el punto que toma un extremo y el punto desde
  el que empieza una conexión usan el color `selection` del tema; las guías de alineación y el
  contorno y los imanes de la caja bajo un extremo usan su color `guide`. Ambos toman por defecto
  el `accent` del tema, así que un tema azul dibuja contornos azules; se cambian en un bloque de
  tema o en **Editar el tema… › Lienzo** ([styles.md](language/styles.md#tokens)). Los anillos de
  foco y los paneles mantienen los colores del editor.
- **Vista previa en vivo.** Mientras arrastras cajas o un tirador de tamaño en un diagrama de
  flujo, una composición libre o una vista C4, el dibujo muestra cómo quedará al soltar: los
  conectores, las etiquetas de las relaciones y los grupos siguen a las cajas tal como se dibujarán
  después, y las cajas arrastradas se quedan bajo el puntero. No se escribe nada hasta soltar: el
  lienzo envía a la sesión, en un mensaje `preview`, el movimiento o el cambio de tamaño que
  enviaría al soltar, y la sesión lo planifica sobre una copia del texto, calcula su disposición y
  responde con el dibujo, sin paso de deshacer ni revisión nueva. Se espera una sola vista previa a
  la vez, la del gesto más reciente primero, así que un diagrama grande se previsualiza con menos
  frecuencia en lugar de quedarse atrás. Un diagrama `layout auto` se previsualiza como lo deja el
  soltar, con todas las cajas colocadas. Donde soltar se rechazaría, como un elemento C4 arrastrado
  a través de un límite, o dejaría errores en el texto, las cajas se mueven solas. Esc devuelve el
  dibujo de antes del arrastre. Los diagramas de secuencia tienen sus propios movimientos de
  eventos en vivo; los puntos de paso y las etiquetas no se previsualizan. Los anfitriones pasan
  los mensajes `preview` como cualquier otro.
- **Un paso cada una.** Cada acción es un paso de deshacer, sea cual sea el panel desde el que
  deshagas.

### Formas vacías y texto en su sitio

**Las formas nuevas llegan vacías.** Como en draw.io o Excalidraw, un nodo, una decisión, un
almacén de datos o una caja llega sin texto: creado desde la paleta, al soltarlo, con N, D, S o B,
desde la cuadrícula de formas o desde el selector de iconos, se escribe con una etiqueta vacía y
queda seleccionado, sin que se abra ningún editor:

```text
node1[""]
decision decision1 ""
data1[("")]
box box1 ""
```

Una forma distinta de `rounded` agrega `style <id> { shape <value> }` en la misma edición, y la
línea de estado nombra el elemento por su id (`Caja box1 seleccionada.`). Haz doble clic en él, o
presiona Entrar o F2, para ponerle texto. Las notas, las marcas y los textos libres, que sin texto
no muestran nada, reciben su texto predeterminado ("Nota", "Marca", "Texto", en el idioma de la
interfaz) y abren el editor enseguida, igual que un grupo nuevo con su título "Grupo". Un elemento
de una biblioteca conserva su etiqueta y no abre ningún editor.

**Editar en su sitio.** El editor se abre donde se dibuja el texto: el área de texto de una forma
(el cuerpo de `person` y de `agent`), la etiqueta de una forma de icono fuera de su cuadrado (en
`labelPosition` junto al cuadrado mientras no tiene), el recuadro de un texto libre, una nota o una
marca, el título de un grupo, la etiqueta de una relación o, si la relación no tiene, el centro de
su línea. Escribe
con la fuente del dibujo, a su tamaño multiplicado por el zoom, con su grosor, su color y su
alineación, y no tiene recuadro ni fondo (la etiqueta de una relación se escribe sobre su píldora);
una línea fina del color de la selección lo marca, y el texto dibujado se oculta mientras tanto. El
autocompletado, la ortografía y la corrección del navegador están desactivados. El editor crece con
el texto y se mantiene centrado donde se dibuja el texto.

| Teclas en el editor        | Efecto                                                                         |
| -------------------------- | ------------------------------------------------------------------------------ |
| Entrar, Tab, un clic fuera | Guardar el texto (`setElementLabel` o `setRelationLabel`), un paso de deshacer |
| Mayús+Entrar               | Empezar una línea nueva, escrita `\n`, donde el dibujo parte las líneas        |
| Esc                        | Cancelar: el texto no cambia y la etiqueta dibujada vuelve a verse             |

- **Líneas.** Mayús+Entrar parte las etiquetas de los nodos, las decisiones, los almacenes de
  datos, las cajas y los elementos C4, los textos libres y las notas, también las de secuencia. Las
  etiquetas de las relaciones, los títulos de los grupos, las marcas, los participantes, las
  condiciones de los fragmentos, los separadores y los retrasos se dibujan en una sola línea: ahí
  Mayús+Entrar guarda el texto como Entrar, y un salto de línea pegado se convierte en un espacio.
  Los saltos de línea del final se descartan.
- **Texto vacío.** Vaciar una forma con etiqueta escribe `""`; guardar sin texto una forma vacía
  no escribe nada.
- **Ids.** Mayús+F2 cambia el id en el mismo editor, en una línea y con una fuente monoespaciada,
  con `renameElement` o `renameRelation`.
- **Diagramas de secuencia.** Las notas, las condiciones de los fragmentos, los separadores y los
  retrasos usan el mismo editor.

### Disposiciones automática y asistida

- **`layout auto`.** ELK organiza las cajas y el lienzo muestra esa organización. El primer cambio
  de posición escribe la posición de todas las cajas, cambia el diagrama a `layout assisted` y luego
  aplica el cambio, todo en una sola edición. Solo se mueve lo que moviste. Esto vale para mover,
  cambiar el tamaño, los puntos de paso, crear, alinear, distribuir y pegar.
- **`layout assisted`.** Las cajas colocadas se quedan donde están. Una caja que arrastras recibe
  su `place`, y ELK sigue organizando las demás.
- **Organizar cuando quieras.** **Organizar los elementos sin colocar** escribe posiciones para las
  cajas que no las tienen y deja las rutas como están. **Recalcular la disposición** vuelve a
  organizarlo todo, como lo dibuja `layout auto`, y escribe lo que dibuja: cada `place`, el
  `place` y el `size` de los grupos colocados, y los codos de cada conector que el motor dobló,
  como `route <id> from <a> to <b> via [...]` con los extremos libres (una relación anónima se
  nombra antes `<origen>_<destino>`). Los lados y los puntos de los extremos se van, los puertos
  con nombre se quedan, y una ruta que queda sin nada se quita, así que el dibujo de después es el
  de antes. Un grupo colocado y con tamaño que no contiene nada, una banda, se queda donde está, y
  un contenedor conserva su tamaño escrito como el mínimo que recibe, con sus hijos centrados. Haz
  doble clic en un codo para quitarlo, o vuelve a recalcular para reescribirlos. Cuando el
  diagrama no se puede organizar, la línea de estado dice por qué, como una banda dentro de un
  grupo que organiza el motor. Ambos están en el menú de la barra de herramientas, el menú
  contextual y la paleta de comandos.

## El teclado

Cada acción del puntero tiene una tecla. Las teclas funcionan mientras el lienzo tiene el foco; las
teclas propias de VS Code (guardar, deshacer, rehacer, la paleta de comandos) siguen funcionando
como en todas partes. Tab después del último elemento sale del lienzo.

| Teclas                                                                    | Acción                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab, Mayús+Tab                                                            | Seleccionar el elemento siguiente o el anterior en el orden del texto                                                                                    |
| Ctrl+Izquierda, Ctrl+Derecha, Ctrl+Arriba, Ctrl+Abajo                     | Seleccionar el elemento más cercano en esa dirección; de dos con el mismo centro, el anidado                                                             |
| Ctrl+A                                                                    | Seleccionar todos los elementos                                                                                                                          |
| Esc                                                                       | Quitar la selección o cancelar un arrastre                                                                                                               |
| Izquierda, Derecha, Arriba, Abajo                                         | Mover la selección 1 px                                                                                                                                  |
| Mayús+Izquierda, Mayús+Derecha, Mayús+Arriba, Mayús+Abajo                 | Mover la selección un paso de la cuadrícula                                                                                                              |
| Alt+Mayús+Izquierda, Alt+Mayús+Derecha, Alt+Mayús+Arriba, Alt+Mayús+Abajo | Hacer la caja un paso de la cuadrícula más estrecha, más ancha, más baja o más alta                                                                      |
| Entrar, F2                                                                | Editar la etiqueta en su sitio                                                                                                                           |
| Mayús+F2                                                                  | Cambiar el id en su sitio                                                                                                                                |
| Supr, Retroceso                                                           | Eliminar la selección                                                                                                                                    |
| Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D                                            | Copiar, cortar, pegar, duplicar                                                                                                                          |
| Alt+G, Alt+Mayús+G                                                        | Agrupar la selección, desagrupar                                                                                                                         |
| Ctrl+Mayús+Izquierda, Derecha, Arriba, Abajo                              | Alinear a la izquierda, a la derecha, arriba o abajo                                                                                                     |
| Ctrl+Alt+H, Ctrl+Alt+V                                                    | Distribuir horizontal o verticalmente                                                                                                                    |
| C                                                                         | Conectar el elemento seleccionado con… (escribe para filtrar, Entrar para elegir)                                                                        |
| R                                                                         | Herramienta de relación (Mensaje en los diagramas de secuencia): clic en el origen y luego en el destino                                                 |
| R con la herramienta de relación activa                                   | El tipo de flecha siguiente: `->`, `-->`, `<->`, `<-->`                                                                                                  |
| N, D, S, O, T, G                                                          | Flujo: crear un nodo (de la forma actual), una decisión, un almacén de datos, una nota, una marca o un grupo (del tipo actual) cerca del centro          |
| B, T, M, G                                                                | Libre: crear una caja (de la forma actual), un texto, una imagen o un grupo (del tipo actual) cerca del centro                                           |
| F                                                                         | Flujo y libre: abrir la cuadrícula de formas (escribe para filtrar, flechas para moverte, Entrar para crear, Esc para cerrar)                            |
| I                                                                         | Flujo y libre: abrir o cerrar el selector de iconos, para la selección o para colocar un icono; en su campo de búsqueda I se escribe ([iconos](#iconos)) |
| P, A, G                                                                   | Secuencia: crear un participante o un actor a la derecha, o un grupo                                                                                     |
| A                                                                         | C4: agregar a la vista una entidad del modelo                                                                                                            |
| O, F                                                                      | Secuencia: una nota sobre la selección; un fragmento alrededor de los eventos seleccionados                                                              |
| Alt+Arriba, Alt+Abajo                                                     | Secuencia: mover el evento seleccionado antes o después de su vecino                                                                                     |
| Alt+A                                                                     | Secuencia: activar el receptor después del mensaje seleccionado, o deshacerlo                                                                            |
| L, U                                                                      | Mostrar u ocultar el panel de capas, las bibliotecas de elementos                                                                                        |
| Ctrl+Mayús+], Ctrl+]                                                      | Traer al frente, traer adelante                                                                                                                          |
| Ctrl+Mayús+[, Ctrl+[                                                      | Enviar al fondo, enviar atrás                                                                                                                            |
| +, =, -                                                                   | Acercar o alejar                                                                                                                                         |
| Mayús+0, Mayús+1, Mayús+2                                                 | Zoom al 100 %, ajustar el diagrama a la vista, ajustar la selección a la vista                                                                           |
| Mayús+F10, la tecla de menú contextual                                    | Abrir el menú contextual (flechas para moverse, Entrar para elegir)                                                                                      |

El foco siempre es visible: el lienzo, los botones de la barra de herramientas, los campos del
inspector, las opciones de los menús y los botones de los diálogos dibujan un anillo con el color de
foco del tema. Cada elemento comunica su tipo y su etiqueta a las tecnologías de asistencia, y una
línea de estado anuncia la selección y el resultado de cada acción.

## Movimiento

El lienzo se mueve poco y siempre del mismo modo, con los tokens de movimiento de su hoja de
estilo (`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms,
`--mdg-ease`):

- **Ventanas emergentes y menús**: el selector de iconos, la cuadrícula de formas, los menús de los
  botones de flecha, de grupo y de Nuevo diagrama, el menú contextual, el menú Organizar,
  **Conectar con…** y las cuadrículas de puntas de flecha del inspector se abren desde su ancla con
  un fundido, una subida de 4 px y una escala desde el 98 % en 160 ms, y se cierran con un fundido
  de 120 ms. Aceptan clics desde el primer momento.
- **Paneles.** Bibliotecas y Capas entran deslizándose desde la izquierda, y el inspector y el
  panel del tema desde la derecha, en 220 ms.
- **Descripciones emergentes**: aparecen con un fundido tras 400 ms sobre un control.
- **Contornos.** El contorno de un destino al soltar o al conectar y el contorno del editor en su
  sitio aparecen con un fundido; los resultados del selector de iconos aparecen uno tras otro.
- **Controles.** Los botones, las muestras y los campos cambian de color en 120 ms.

Cuando el sistema pide movimiento reducido (`prefers-reduced-motion: reduce`), todas las duraciones
son cero y nada sube, se desliza ni cambia de escala.

## Iconos

Un solo selector de iconos sirve para todo el lienzo. El botón de icono de la paleta e I lo abren
en los diagramas de flujo y las composiciones libres, debajo del botón; **Icono…** en el menú
contextual lo abre en el puntero, y **Elegir…** en el campo **Icono** del inspector, debajo del
campo. El botón de icono lo vuelve a cerrar, y también I mientras el lienzo tiene el foco; el
campo de búsqueda toma el foco cuando el selector se abre, y ahí I se escribe como cualquier otra
letra, así que Esc o el botón de icono lo cierran. En las vistas C4 solo **Elegir…** lo abre, con
los iconos de los paquetes y sin bibliotecas ni control de colocación. Los lienzos de solo
lectura, los diagramas de secuencia y el modo historia nunca lo abren.

- **Buscar.** El campo de búsqueda tiene el foco. Escribe una palabra, como `server`, `database` o
  `lambda`, y los resultados llegan a los 80 ms, agrupados por paquete (Tabler, AWS…) o por
  biblioteca (Technology, las del proyecto), 60 como mucho, cada uno con una miniatura de 24 px y
  su nombre; una miniatura muestra un brillo animado mientras se carga su paquete, y los iconos que
  un paquete no puede dibujar no se ofrecen nunca. Un `pack:name`
  escrito que nombra un icono, como `aws:lambda`, va primero. Sin nada escrito, el selector muestra
  los iconos elegidos mientras el lienzo está abierto (**Recientes**, diez como mucho) y luego la
  primera categoría de la biblioteca Technology.
- **Teclas.** Las flechas recorren los resultados mientras el campo conserva el foco; Entrar elige
  el resultado activo, o el primero de una búsqueda que aún no ha llegado, cuando llegue; Esc
  cierra el selector y devuelve el foco, y un clic fuera también lo cierra. Tab llega al control de
  colocación, cuyas flechas eligen.
- **Para la selección.** Con nodos, decisiones, almacenes de datos o cajas seleccionados, el
  selector lleva el encabezado "Icono de api" (o "Icono de 2 elementos"); lo que eliges les da el
  icono a todos en un solo paso de deshacer, `style api { icon "tabler:server" }`, y el selector
  se cierra.
- **Para colocar.** Sin nada seleccionado que admita un icono, el selector muestra el control de
  colocación, **Insertar como**, con un dibujo para cada opción. La opción se conserva mientras el
  lienzo está abierto, y el panel Bibliotecas la comparte:

| Opción                     | El elemento escrito                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Icono** (predeterminada) | un nodo (una caja en las composiciones libres) dibujado como su icono, con la etiqueta debajo: `shape icon`            |
| **En una caja**            | un nodo o una caja de la forma actual, con el icono junto a su etiqueta (`rounded` mientras la forma actual es `icon`) |
| **Solo el icono**          | solo en las composiciones libres, un objeto `icon`, sin texto                                                          |

Un clic en un resultado activa la herramienta de icono. Su silueta muestra lo que se va a colocar:
el icono en su cuadrado sobre una barra de etiqueta, una caja con el icono, o el icono solo. Un clic
en el lienzo lo coloca, dentro del grupo que está bajo el puntero, vacío y seleccionado; un clic en
un nodo, una decisión, un almacén de datos o una caja, resaltado bajo el puntero, le da el icono a
esa forma; Esc desactiva la herramienta. Entrar en el selector coloca el resultado cerca del
centro. La línea de estado dice qué hará cada clic. **Icono** y un clic escriben, en un solo paso
de deshacer:

```text
node1[""]
style node1 { icon "aws:lambda"; shape icon }
```

- **Arrastrar.** Los resultados se arrastran al lienzo como los elementos de las bibliotecas. Sobre
  un nodo, una decisión, un almacén de datos o una caja, la forma se resalta y soltar escribe solo
  su icono; sobre el lienzo vacío la silueta sigue al puntero y soltar crea el elemento como lo
  haría un clic. El selector se desvanece durante el arrastre; Esc, o soltar fuera del lienzo, lo
  cancela.
- **El menú contextual.** Con elementos que admiten iconos seleccionados, **Icono…** (I) abre el
  selector en el punto del menú. **Quitar el icono** aparece cuando un elemento tiene un icono
  propio y lo quita en un solo paso de deshacer, conservando sus demás estilos:
  `style db { icon "tabler:database"; fill "#eef" }` pasa a ser `style db { fill "#eef" }`.
- **El inspector.** **Icono** muestra la miniatura del icono (en gris cuando lo da una clase o una
  regla, discontinua cuando no hay), su nombre y su referencia, con **Elegir…** y **Quitar** junto
  a la etiqueta; también sirve para relaciones y grupos, y el campo **Icono** de un objeto icono
  cambia su icono. **Posición del icono**, en la barra después de **Forma** cuando todos los
  elementos seleccionados tienen icono, elige `left`, `right`, `top`, `bottom` o `center` con
  dibujos, con la posición dibujada en gris; una forma de icono no la tiene, y las entidades C4,
  que dibujan `center` como `top`, tienen las otras cuatro. **Posición de la
  etiqueta** aparece cuando el icono ocupa el centro (`iconPosition center` o `shape icon`), cuatro
  dibujos con `bottom` en gris. **Tamaño del icono** es un número de 8 a 128 con un control
  deslizante, con el tamaño dibujado en gris; **Automático** escribe `iconSize auto` y **Borrar** lo
  quita, y un número fuera de rango se rechaza
  ([iconos en las cajas](language/styles.md#iconos-en-las-cajas)).
- **Formas de icono.** Un elemento dibujado con `shape icon` se selecciona, cambia de tamaño y se
  conecta por su cuadrado: su contorno, sus tiradores, sus imanes y su borde son los del icono
  ([iconos como formas](language/free.md#iconos-como-formas)). Su etiqueta le pertenece: un clic en
  la etiqueta lo selecciona, un rectángulo de selección tiene que contener también la etiqueta, y
  una conexión que se suelta sobre la etiqueta termina en el cuadrado. Los tiradores de conexión
  del lado de la etiqueta quedan más allá de ella, y un contorno discontinuo marca la etiqueta de
  una forma de icono seleccionada. Elegir **icono** en la cuadrícula de formas abre el selector con
  la colocación **Icono**, porque una forma de icono necesita su icono.

## Bibliotecas de elementos

El botón de bibliotecas de la barra de herramientas (U, con la descripción "Bibliotecas (U)") abre
el panel Bibliotecas en los diagramas de flujo y las composiciones libres: un cuadro de búsqueda,
el control de colocación del selector de iconos y las bibliotecas que conoce el documento, cada una
con sus categorías. Abre una categoría para ver sus elementos con sus iconos; haz clic en uno para
agregarlo en el centro de la vista, o arrástralo al lienzo para ponerlo donde lo sueltes. Con la
colocación **Icono**, la predeterminada, el elemento es un nodo (una caja en las composiciones
libres) dibujado como su icono y con la etiqueta del elemento, con su icono y su forma escritos
como estilo en la línea siguiente, y queda seleccionado sin abrir el editor de la etiqueta:

```text
lambda1["AWS Lambda"]
style lambda1 { icon "aws:lambda"; shape icon }
```

**En una caja** lo escribe como un nodo o una caja de la forma actual con el icono junto a su
etiqueta, así que solo `style lambda1 { icon "aws:lambda" }` para `rounded`; **Solo el icono**, en
las composiciones libres, escribe un objeto `icon`. Un elemento al que su biblioteca le da un tipo,
como un almacén de datos, conserva ese tipo y toma el icono. Si se arrastra sobre un nodo, una
decisión, un almacén de datos o una caja, el elemento la resalta y le da su icono, sin crear nada.
La colocación es la del selector de iconos, y cambiarla en uno la cambia en el otro
([iconos](#iconos)).

Las bibliotecas integradas son AWS, Azure, Google Cloud y Kubernetes (los conjuntos de iconos de
cada proveedor, por sus categorías), Tabler (por sus categorías) y Technology (bases de datos,
mensajería, lenguajes, frameworks, herramientas, plataformas y sistemas operativos de los logos de
tecnologías). Las `assets/libraries/*.json` de un proyecto y las bibliotecas de un plugin aparecen
con ellas ([assets.md](language/assets.md#bibliotecas)). La búsqueda compara etiquetas y nombres de
iconos en todas las bibliotecas. Los diagramas de secuencia y las vistas C4 dibujan sus propios
tipos y no tienen panel.

## Capas y orden

Los diagramas de flujo y las composiciones libres se pintan capa por capa: `layers back, main,
front` las declara de atrás hacia adelante, y `layer <nombre>` en el bloque de un elemento, un
grupo o una relación lo pone en una ([free.md](language/free.md#capas-y-orden)). Dentro de una
capa van primero los grupos, luego los demás elementos en el orden del código, luego las
relaciones, y las marcas encima. Las cajas de capas distintas no se comprueban entre sí: así una
banda de color queda detrás de una fila de cajas, como un grupo sin título (`""`) con un `place`,
un `size` y `layer back`. Dentro de una capa, una caja declarada después de otra que la contiene
se dibuja encima, una pila hecha a propósito que las comprobaciones respetan; enviar al fondo la
caja interior la convierte en un `layout.overlap`.

- **El panel.** El botón de capas de la barra de herramientas (L) abre el panel Capas: las capas
  de adelante hacia atrás con cuántos elementos y relaciones tiene cada una. **Agregar** escribe
  una capa nueva (`layer1`, `layer2`, …) justo detrás de `main`; doble clic en un nombre lo
  renombra en todos los sitios donde está escrito; las flechas traen una capa adelante o la envían
  atrás; la cruz la quita y sus elementos vuelven a `main`; con algo seleccionado, **Mover la
  selección a…** escribe su `layer`. Cada acción es un paso de deshacer.
- **Ocultar.** El ojo oculta una capa en el lienzo: sus dibujos desaparecen de la hoja, de la
  selección por rectángulo y de Tab, y no se escribe nada; las exportaciones la siguen dibujando.
  La elección se guarda con el lienzo, por diagrama.
- **Orden dentro de una capa.** Traer al frente, Enviar al fondo, Traer adelante y Enviar atrás
  (las teclas de arriba y el menú contextual) mueven la declaración entre sus hermanas, lo que
  fija el orden de dibujo. El inspector tiene un campo **Capa** para elementos y relaciones, y el
  campo **Capas** del diagrama lista las capas de atrás hacia adelante.
- **En el SVG.** Cada elemento y cada relación en una capa distinta de `main` lleva
  `data-layer="<nombre>"`, así que las hojas de estilo y las aplicaciones pueden dirigirse a una
  capa.

## Formas y contenedores

- **Formas.** El botón **Caja** (libre) y el botón **Nodo** (flujo) son botones divididos. La parte
  principal crea la forma actual y muestra su dibujo, `rounded` hasta que eliges otra; la flecha
  de al lado abre una cuadrícula con las veinticuatro formas, cada una con su dibujo y su nombre.
  Lo que eliges pasa a ser la forma actual y activa la herramienta, cuya silueta toma el tamaño
  predeterminado y el contorno de la forma: el clic o el arrastre escribe el elemento, vacío, y
  `style <id> { shape <value> }` en la misma edición (nada para `rounded`), y luego B o N crean la
  forma actual cerca del centro. La forma actual dura mientras el lienzo está abierto y no se
  guarda. **agente** dibuja un agente de IA: una cabeza de robot sobre un cuerpo que contiene el
  texto. La última forma, **icono**, dibuja el elemento como su icono con la etiqueta fuera;
  elegirla abre el selector de iconos con la colocación **Icono** ([iconos](#iconos)).
- **Formas con el teclado.** F abre la cuadrícula en los diagramas de flujo y las composiciones
  libres: las flechas se mueven, al escribir se filtran las formas por su nombre en el idioma de
  la interfaz o en inglés, Entrar crea la forma resaltada cerca del centro y la hace actual, y Esc
  cierra. Cada forma tiene un camino con el teclado, como F, `hex`, Entrar, y luego B o N para la
  siguiente, o F, `agen`, Entrar para un agente. Los diagramas de secuencia conservan F para los
  fragmentos.
- **Tipos de flecha.** El botón de flecha se divide igual: su menú lista `->`, `-->`, `<->` y
  `<-->` con sus dibujos, y lo que eliges activa la herramienta de relación con ese tipo. R activa
  la herramienta con el tipo actual; mientras está activa, R de nuevo pasa al tipo siguiente, que
  nombran la línea de estado y la insignia junto al puntero. Mayús en el segundo clic sigue
  alternando continua y discontinua, y los tiradores de conexión siguen escribiendo `->` (`-->` con
  Mayús). Las vistas C4 ofrecen los tipos de un solo sentido.
- **Contenedores.** El botón **Grupo** también está dividido: su menú ofrece **Grupo**, una banda
  con título, y **Contenedor**, un rectángulo sin título. Lo que eliges pasa a ser el tipo actual y
  activa la herramienta, y G crea el tipo actual cerca del centro; Alt+G sigue agrupando la
  selección con título. Un contenedor se escribe `group <id> "" { }` con su `place` y su `size`,
  dentro del grupo que está bajo el puntero, y queda seleccionado sin abrir el editor de texto: el
  relleno, el borde y el radio de las esquinas se eligen en la tira como en cualquier grupo. Lo que
  sueltas dentro pasa a estar dentro, y se mueve con sus hijos, en los diagramas de flujo igual que
  en las composiciones libres.
- **Convertir en contenedor.** Un nodo de flujo o una caja libre dibujado detrás de otras cajas
  solo está dibujado detrás: están apiladas sobre él y no las contiene. **Convertir en
  contenedor**, en el menú contextual y junto a **Dentro de** en el inspector, lo reescribe como un
  grupo con el mismo id, texto y descripción, y mete en él las cajas apiladas encima (enteras
  dentro de su rectángulo, declaradas después, en su capa), en una sola edición: `node3[""]` con
  una base de datos encima pasa a ser `group node3 "" { db[("Database")] }`. Sus estilos conservan
  todo salvo `shape`, porque los grupos son rectángulos: `square` y `rectangle` pasan a ser
  `radius 0`. Su `place` y su `size` se quedan, y se escribe un tamaño si no lo tenía; las
  relaciones con él conservan sus extremos. Un nodo con puertos con nombre se rechaza hasta que se
  quiten. La línea de estado nombra el contenedor y lo que contiene, y **Desagrupar** lo devuelve
  a sus hijos.
- **Pilas.** Cuando sueltas una caja entera sobre un nodo o una caja que no es un grupo, la caja
  conserva su grupo y la línea de estado dice que queda apilada sobre la otra y que convertir esa
  en contenedor las movería juntas.
- **Abrir los menús.** Las dos partes de un botón dividido comparten un contorno, con una línea
  divisoria entre ellas. La parte de la flecha muestra una punta hacia abajo, es tan alta como el
  botón y lo bastante ancha para acertarle con facilidad, y cada parte muestra por su cuenta el paso
  del puntero y el foco del teclado; su descripción emergente nombra el menú y su tecla, "Más formas
  (F)", "Tipos de flecha (R cambia)" y "Grupo o contenedor (G)". Un clic derecho en la parte principal, o mantenerla
  presionada medio segundo (450 ms), abre el mismo menú sin activar la herramienta; un clic corto
  activa la herramienta con la forma o el tipo actual.
- **Solo lectura.** Un lienzo de solo lectura no muestra las flechas de los botones divididos, y F
  no hace nada.
- **Dentro y fuera de los grupos.** Mientras arrastras una selección, el grupo más interior que
  está bajo el centro del rectángulo de la selección se resalta como destino, igual que un destino
  de conexión; los elementos arrastrados y lo que contienen quedan fuera, y las capas ocultas se
  saltan. Al soltar, cada elemento arrastrado cuyo grupo cambia pasa al bloque de ese grupo, o al
  nivel superior cuando el centro queda fuera de todo grupo, con su bloque y sus comentarios, y su
  `place` se escribe en el interior del nuevo grupo, así que se queda donde lo soltaste: una
  edición, un paso de deshacer. Alt conserva los grupos, y las flechas del teclado nunca los
  cambian. El dibujo no se mueve: arrastrar todos los hijos de un grupo sin `place` mueve el grupo
  con ellos; un grupo que queda vacío sin `place` o `size` recibe su posición y su tamaño dibujados;
  un grupo libre con `place` y sin `size` recibe su tamaño dibujado cuando gana o pierde un hijo; y
  un elemento conserva un grupo de una capa oculta mientras su centro siga dentro de él. Un grupo
  que sueltas desde la paleta dentro de otro se anida en él. Los diagramas de secuencia y las
  vistas C4 conservan los grupos de sus elementos.
- **Dentro de.** El campo **Dentro de** del inspector muestra el grupo de un elemento, o ninguno, y
  mueve el elemento a otro grupo, o al nivel superior, donde está dibujado; los grupos que ofrece
  nunca incluyen el propio elemento ni un grupo que esté dentro de él. A su lado, los nodos de flujo
  y las cajas libres tienen **Convertir en contenedor**.
- **Formas tapadas.** Un clic selecciona la forma pintada encima. Alt+clic selecciona la forma de
  debajo, y la siguiente hacia abajo en cada Alt+clic, recorriendo la pila que está bajo el
  puntero; el menú contextual tiene **Seleccionar la forma de debajo**. Ctrl con las flechas
  prefiere la forma anidada cuando dos comparten el centro, y Tab, Ctrl+A y el rectángulo de
  selección llegan a todos los elementos.
- **Radio de las esquinas.** El **Radio de las esquinas** de la barra es un control deslizante con
  su número, de 0 a 64. Aparece donde se dibujan esquinas: las cajas y los nodos `rounded`,
  `rectangle`, `square` y `framed`, los polígonos (un hexágono, una estrella, una bandera…) y las
  decisiones, las personas y los agentes, las notas, los recuadros de los textos, iconos e imágenes
  libres, y los grupos. Las elipses, los círculos, las píldoras, los cilindros, las nubes y los
  documentos no tienen esquinas ni control. En gris, muestra el radio dibujado: el `radius` del tema
  en las cajas `rounded`, las notas y los recuadros, su `groupRadius` en un grupo (14 en
  `technical.light`), el radio del cuerpo de una persona o un agente, 0 en las demás esquinas, o el
  de una regla. Moverlo escribe `style g { radius 0 }` o `style h { shape hexagon; radius 10 }`; un
  número fuera de rango se rechaza y el texto queda como estaba.
- **Giro.** Un elemento seleccionado de un diagrama de flujo o de una composición libre muestra un
  asa de giro, un círculo más allá de su esquina superior derecha. Arrástrala alrededor del
  elemento: nada gira hasta que el puntero se ha movido unos píxeles, así que un clic en el asa no
  cambia nada; después el elemento gira tanto como el puntero ha girado alrededor del centro de su
  caja desde que se presionó, en pasos de 15°, con Alt a cualquier ángulo, con el ángulo junto al
  puntero y en la línea de estado. El elemento, su contorno y sus conectores siguen al puntero en
  cada cuadro, sin suavizado; al soltar se escribe `style api { rotation 90 }` en un solo paso de
  deshacer y el elemento se asienta en él, 0 lo quita y Escape cancela. En un diagrama con
  `layout auto` el primer giro escribe antes la disposición, como el primer movimiento, así que el
  elemento girado se queda donde está. La
  **Rotación** de la barra es un control deslizante con su número, de 0 a 359, en gris en 0 o con
  el ángulo de una regla, y el menú contextual tiene **Girar 90°** y **Quitar el giro**. Un
  elemento girado se selecciona y se alcanza por su contorno girado; su selección, sus asas de
  tamaño y de conexión, sus imanes y el editor de texto giran con él; cambiar su tamaño funciona en
  su propio marco y deja el borde opuesto en su sitio, sin ajustarse a la cuadrícula; el extremo de
  un conector que se suelta en él se escribe en sus propios lados (`api.north 50%`). Los grupos no
  tienen asa.
- **Forma.** La **Forma** de la barra, para las cajas libres y los nodos de flujo, muestra cada
  forma como un dibujo con su nombre en el idioma de la interfaz; en gris, la forma dibujada.
  Elegir la elipse escribe `style a { shape ellipse }`.

## Composiciones libres

La paleta depende del diagrama: los diagramas de flujo ofrecen nodo, decisión, almacén de datos,
nota, marca, grupo e icono; los diagramas libres ofrecen caja, texto, icono, imagen y grupo. Los
botones de caja y de nodo abren las formas ([formas y contenedores](#formas-y-contenedores)).

- **Iconos.** El botón de icono e I abren el selector de iconos ([iconos](#iconos)). Con **Solo el
  icono**, lo que eliges y colocas con Entrar se convierte en `icon icon1 "tabler:server"` cerca
  del centro; **Icono** y **En una caja** escriben una caja con el icono, como los diagramas de
  flujo escriben un nodo.
- **Imágenes.** Colocar una imagen abre un diálogo de archivos; el archivo debe estar dentro del
  proyecto, y su ruta se escribe relativa al archivo `.meltemi`. Las rutas de las imágenes también
  se autocompletan en el código.
- **Texto.** El inspector tiene los campos **Tamaño del texto**, **Grosor del texto** y
  **Alineación del texto**; los iconos y las imágenes tienen su campo **Icono** o
  **Archivo de imagen** en lugar de una etiqueta.
- **Enlaces.** **Enlazado a** escribe `link <diagram>.<element>`. Ir a la definición sobre un enlace
  abre el elemento enlazado, en este archivo o en uno importado. **URL** escribe `url "…"`, un
  hipervínculo que conservan las exportaciones SVG, PDF y HTML (todos los perfiles, y las entidades
  del modelo en las vistas C4); el lienzo nunca lo sigue.
- **Convertir.** **Convertir en composición libre** (menú Organizar, menú contextual y paleta de
  comandos) copia el diagrama de flujo que se muestra en un nuevo diagrama libre del mismo archivo,
  tal como está dibujado, con un enlace de cada objeto a su origen, y muestra la copia.
- **Copiar.** Un hijo copiado sin su grupo lleva la posición en la que está dibujado.

## Diagramas de secuencia

El lienzo respeta el orden de los eventos ([sequence.md](language/sequence.md)); nada en él escribe
coordenadas.

- **Paleta.** Participante (P), actor (A), los demás tipos de participante en **Más
  participantes**, mensaje (C, o arrastrar desde el tirador de conexión de una cabecera), nota (O),
  fragmento (F, que pide el operador), separador y retraso, y grupo. Un participante se coloca donde
  se suelta entre los demás; las notas, los separadores y los retrasos van después del evento
  seleccionado, o al final.
- **Cabeceras.** Un participante, una base de datos, una colección o una cola se seleccionan, se
  resaltan, pulsan y editan sobre la caja con la que se dibujan, abajo en la fila de cabeceras,
  haya o no un actor en el diagrama; un actor y las demás figuras, sobre su figura y su nombre.
- **Arrastrar.** Arrastra una cabecera hacia un lado para reordenar el participante; ningún mensaje
  cambia. Arrastra un mensaje, una nota o un fragmento hacia abajo para agregar `space` encima, o
  hacia arriba para quitarlo; se detiene en su vecino, así que un arrastre nunca reordena eventos.
  Con Alt se arrastra sin la cuadrícula.
- **Mover eventos.** Alt+Arriba y Alt+Abajo mueven el evento seleccionado más allá de su vecino, a la
  rama más cercana de un fragmento adyacente, o fuera del fragmento cuando está en su borde. Un
  movimiento que desactivaría un participante que no está activo, o que rompería un ciclo de vida,
  se rechaza indicando el motivo.
- **Activaciones.** Alt+A sobre un mensaje seleccionado activa su receptor (o el participante
  seleccionado) justo después y lo desactiva tras su respuesta; si se repite, quita el par.
- **Flechas.** Izquierda y Derecha intercambian el participante seleccionado con su vecino; Arriba y Abajo
  cambian el espacio encima del mensaje, la nota o el fragmento seleccionados.
- **Inspector.** Mensajes: **Mensaje** (llamada, respuesta, asíncrono) y **Espacio antes**. Notas:
  **Texto**, **Posición**, los participantes y **Espacio antes**. Fragmentos: **Operador**, una
  **Condición** por rama y **Espacio antes**. Participantes: **Tipo** y **Separación antes**. El
  diagrama: **Numerar los mensajes desde** (`autonumber`).
- **Escenarios.** Cuando el diagrama tiene escenarios, la barra de herramientas los ofrece junto a
  **Todos los eventos**. Elegir uno muestra una vista previa de ese camino, de solo lectura; elige
  **Todos los eventos** para volver a editar. **Exportar SVG** pregunta por "Todos los eventos" o un
  escenario y, para un escenario, escribe `<file>.<scenario>.svg`.
- **Funciones del lenguaje.** El autocompletado conoce las instrucciones de secuencia, los
  participantes después de las flechas y en los eventos, las posiciones de las notas, los
  fragmentos y sus condiciones en los escenarios, y `kind async`. La información al pasar el puntero
  describe eventos y escenarios; ir a la definición, las referencias y cambiar el nombre siguen los
  ids de notas y fragmentos; las correcciones rápidas declaran un participante desconocido y quitan
  un `deactivate` sobrante.

## Vistas C4

Una vista C4 dibuja entidades de un modelo; el lienzo nunca declara entidades
([c4.md](language/c4.md)).

- **Agregar.** **Agregar desde el modelo…** (barra de herramientas, A, menú contextual) lista las
  entidades que la vista puede dibujar y no dibuja; la elegida se suma a `include`.
- **Quitar.** Eliminar quita una entidad de la vista (la saca de `include` o la pone en `exclude`)
  junto con las instrucciones de la vista que la nombran; el modelo la conserva.
- **Relaciones.** Las flechas son del modelo, y el lienzo las escribe allí. Arrastrar desde un
  asa de conexión, la herramienta de relación y **Conectar con…** escriben `a -> b` en el modelo
  (`->` es el único tipo que admite un modelo; Mayús no cambia nada aquí). Arrastrar un extremo
  de una flecha hasta otra entidad mueve ese extremo de la relación del modelo; una flecha que
  combina varias relaciones del modelo (C) conserva sus extremos. Eliminar quita la relación del
  modelo con todo lo que la nombra, y pregunta antes cuando otra vista la dibuja, una instrucción
  la nombra o una entidad que la vista dibujaba solo por esa relación se va con sus
  instrucciones. Los estilos, los efectos, las rutas, los codos y las posiciones de etiqueta
  sobre una relación que el modelo no nombró primero la nombran allí.
- **Etiquetas.** Editar una etiqueta escribe `label <entity> "Text"` solo en esta vista. Sobre una
  flecha, rellena la etiqueta de la relación del modelo cuando no tiene y escribe la etiqueta local
  de la vista en caso contrario. Las combinaciones (C) escriben en la vista una relación que
  representa las relaciones del modelo entre dos entidades.
- **Mover.** Arrastrar, los modos de disposición y Organizar escriben solo las posiciones de la
  vista.
- **Inspector.** Los elementos muestran su ruta y su tipo, la etiqueta en esta vista y la etiqueta,
  la descripción, la tecnología y `external` de la entidad, que se escriben en el modelo: en este
  archivo o en el archivo propio del modelo, que el inspector nombra. Las relaciones muestran sus
  orígenes (las relaciones del modelo que representan), su estilo y sus efectos, y su id, que
  nombra o renombra la relación del modelo. La vista muestra su nivel, su ámbito y su modelo.
- **Otro archivo.** Cuando el modelo está en otro archivo del proyecto, la edición llega a los dos
  archivos en un solo paso: el del modelo y las instrucciones propias de la vista. La línea de
  estado nombra el archivo del modelo, y Ctrl+Z deshace ambos desde el archivo de la vista.
- **Cambiar el nombre.** Cambiar el nombre de una entidad desde el lienzo, o con Cambiar el nombre
  del símbolo en un modelo, una vista o un enlace, le cambia el nombre en todos los archivos del
  proyecto. **Abrir el modelo** (menú contextual, paleta de comandos) muestra el modelo de la
  vista.

## Estilos y temas

- **La barra de estilo.** La parte superior del inspector da estilo a la selección: **Relleno**,
  **Borde** y **Color del texto** como filas de muestras, luego la línea y el ancho del borde; en
  los elementos que los admiten, el radio de las esquinas, la forma y la posición del icono; en las
  relaciones, las puntas de ambos extremos, el tipo de ruta y las esquinas; y la fila
  **Efectos**, que dice a su derecha "ninguno" o los efectos activos, con sus interruptores debajo.
  Varios elementos seleccionados reciben el estilo juntos en una sola edición; una fila muestra
  "mixto" donde sus valores difieren.
- **Dibujos, no palabras.** La línea (continua, discontinua, punteada), el tipo de ruta
  (automática, recta, en codo, curva), las esquinas (en ángulo, redondeadas) y las formas son filas
  o cuadrículas de dibujos; **Predeterminado** vuelve a heredar. **Punta inicial** y **Punta final** son botones que muestran
  la punta actual; cada uno abre una cuadrícula con todas las puntas (triángulos, rombos, círculos,
  barras, cruces y las patas de gallo de los diagramas ER). Las flechas del teclado recorren una fila
  o la cuadrícula, Entrar elige, Esc cierra. En una relación, continua y discontinua reescriben su
  flecha (`->`, `-->`, o `<->`, `<-->` cuando es bidireccional) y punteada escribe `line dotted`.
- **Tokens, colores y el tema.** Las muestras son los dieciséis tokens de color del tema, dibujados
  con los colores que les da el tema del diagrama, así que un tema personalizado muestra los suyos.
  Una muestra escribe el token (`style api { fill accent }`), que sigue al tema cuando este cambia;
  el selector de color junto a la fila escribe un color fijo (`stroke "#E8A33D"`); **Tema** quita la
  propiedad para que el elemento vuelva a heredar. Las flechas del teclado se mueven entre las
  muestras; Espacio o Entrar elige.
- **Iconos.** **Elegir…** en el campo **Icono** abre el selector de iconos del lienzo debajo de
  él, para los elementos y las relaciones de los diagramas de flujo, las composiciones libres y las
  vistas C4, y escribe `style <id> { icon "tabler:server" }`; **Quitar** quita el icono. Los
  diagramas de secuencia, cuyos participantes y mensajes no dibujan iconos, no tienen campos
  **Icono** ni **Color del icono**. La posición del icono, la posición de la etiqueta y el tamaño
  del icono se describen en [iconos](#iconos).
- **El tema del diagrama.** Sin nada seleccionado, la barra empieza con el campo **Tema**. Un tema
  integrado ofrece su contraparte con un clic (**Oscuro** para `technical.light`), que escribe
  `theme "technical.dark"`.
- **Nuevo tema a partir de este…** pide un id y dónde se guarda el tema. **Este archivo** agrega
  `theme <id> { extends "<current>" }` después de los demás temas del archivo y hace que el diagrama
  lo use. **El proyecto** (un archivo guardado en un proyecto) escribe `themes/<id>.meltemi` y pone
  `"theme": "themes/<id>.meltemi#<id>"` en `project.json`, conservando su formato, así que todos los
  diagramas sin `theme` propio lo siguen; se quita el `theme` propio del diagrama. En ambos casos, el
  panel del tema se abre sobre el tema nuevo.
- **El panel del tema.** **Editar el tema…** (cuando el tema es un bloque del archivo o del
  proyecto) lista los tokens del tema por grupo: colores, fuentes, tipografía, espaciado, formas y
  líneas, iconos, marco, movimiento y lienzo. Cada uno muestra el valor escrito o, en gris, el del tema base.
  Un cambio escribe el token en el bloque, en el archivo que lo contiene (la línea de estado lo
  nombra); **Heredar** o un valor vacío lo quita. **Fuente del texto** y **Fuente del código**
  ofrecen las familias incluidas y las de `assets/fonts/` del proyecto, que las exportaciones
  incrustan; una pila escrita a mano se muestra como "custom" y se mantiene. Las clases y las reglas
  quedan en el código. **Listo** vuelve al inspector.

## Efectos

- **Inspector.** Un elemento, una relación, un mensaje, una nota o un fragmento, cuando están
  seleccionados, listan los efectos que admiten, como interruptores bajo la fila **Efectos** de la
  barra de estilo: **Partículas** (relaciones),
  **Trazo en movimiento** (relaciones y cajas con contorno), **Pulso** y **Recorrido** (relaciones:
  un resaltado que llena la flecha desde su inicio hasta su final y vuelve a empezar). Activar uno
  escribe `animate <id> { effect … }`; su duración, repetición, retraso y, donde corresponden,
  dirección, partículas y color se escriben en la misma instrucción. La velocidad muestra, en gris,
  el valor predeterminado del tema (`flowDuration`, `dashDuration`, `pulseDuration`,
  `traceDuration`, o los 1200, 1000, 1000 y 1500 ms del motor). Desactivarlo lo quita. Una
  instrucción compartida por varios destinos se divide cuando uno de ellos cambia.
- **Pausar y reproducir.** Un diagrama con efectos los reproduce en el lienzo desde que se
  muestra, como lo haría la exportación SVG animada (`docs/language/motion.md`). **Pausar los
  efectos** (❚❚) en la barra de herramientas muestra el dibujo estático y se convierte en
  **Reproducir los efectos** (▷); la elección se guarda para ese diagrama del archivo, así que un
  diagrama en pausa sigue en pausa al recargar. Con movimiento reducido un diagrama empieza en
  pausa hasta que se presiona Reproducir. Sin efectos el botón está desactivado. Activar un efecto
  mientras el diagrama está en pausa lo indica en la línea de estado. La selección, la edición y
  las vistas previas en vivo siguen funcionando mientras se reproducen los efectos.

## Historias

- **Selector de historias.** Cuando el archivo tiene historias, la barra de herramientas las ofrece
  junto al selector de diagramas. Elegir una entra en el modo historia: el lienzo reproduce la
  historia en solo lectura, con la paleta, **Nuevo diagrama**, el inspector y el minimapa
  ocultos; el zoom y el desplazamiento siguen funcionando. **Editar el diagrama** sale de él.
- **Línea de tiempo.** Debajo del lienzo, una fila por escena muestra su transición y sus acciones
  como barras sobre el reloj de la historia; las acciones de un bloque `parallel` se apilan. ▷
  reproduce y pausa (Espacio o K en la línea de tiempo), la regla permite moverse por el tiempo, Izquierda
  y Derecha avanzan o retroceden 100 ms (un segundo con Mayús), Inicio y Fin van a los extremos. Los
  fotogramas se dibujan en la webview con las funciones del exportador, así que coinciden
  exactamente con `meltemi-diagrams export --story <id> --at <time>`.
- **Editar desde la línea de tiempo.** Arrastrar el extremo derecho de una barra escribe el tiempo
  de la acción (`over 1200ms`, `hold 3000ms` o el `over` de la transición), en pasos de 100 ms.
  Hacer clic en cajas del fotograma las selecciona; **Agregar a la escena** agrega la acción elegida
  para la selección a la escena que está bajo el cabezal de reproducción (`focus` y `camera` sin
  selección escriben `all`; `hold` escribe `hold 1000ms`). El botón ☐ agrega una escena después de
  la actual, y ✕ (o Supr) quita la barra seleccionada. Cada cambio es una edición del texto, que
  se deshace como cualquier otra. **Exportar HTML** escribe el reproductor HTML de la historia junto
  al archivo.

## Eliminar, copiar y agrupar

- **Eliminar.** Al eliminar, primero se comprueba qué depende de la selección. Cuando la usan
  relaciones, posiciones, rutas, estilos o restricciones, un diálogo los lista, y **Eliminar todo**
  los quita en la misma edición.
- **Copiar.** Copiar pone en el portapapeles un fragmento `.meltemi` completo: las cajas
  seleccionadas (los grupos con sus hijos), las relaciones entre ellas, sus posiciones, rutas y
  etiquetas, y sus estilos. Puedes pegarlo como texto en cualquier archivo `.meltemi`.
- **Pegar.** Al pegar en el lienzo, los ids que ya existen reciben un sufijo `_2`, `_3`…, y la
  copia se coloca a dos pasos de la cuadrícula, o bajo el puntero cuando pegas desde el menú
  contextual.
- **Duplicar.** Duplicar es copiar y pegar en un solo paso.
- **Agrupar y desagrupar.** **Agrupar** (Alt+G) mueve las declaraciones de las cajas hermanas
  seleccionadas a un nuevo `group group1 "Group" { … }`. **Desagrupar** reemplaza un grupo por sus
  hijos.

## Comandos

| Comando                                                        | Qué hace                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abrir el lienzo al lado, Abrir el lienzo                       | Abre el lienzo, junto al código o en su lugar                                                                                                                                                                                                  |
| Mostrar el código fuente                                       | Muestra el código del archivo del lienzo                                                                                                                                                                                                       |
| Exportar SVG                                                   | Escribe junto al archivo el SVG de cada diagrama del texto actual (incluidos los cambios sin guardar) y pregunta qué escenario usar en un diagrama de secuencia con escenarios; los diagramas con problemas se omiten y se notifican           |
| Exportar el reproductor HTML                                   | Pregunta qué historia o diagrama del archivo reproducir y escribe su reproductor HTML junto al archivo (`docs/player.md`)                                                                                                                      |
| Exportar PNG, Exportar PDF                                     | Escribe junto al archivo el PNG (al doble de tamaño) o el PDF de cada diagrama mediante el Edge o el Chrome instalado (el ajuste `meltemi.export.browser` indica otro)                                                                         |
| Exportar video                                                 | Pregunta por MP4, WebM o GIF y por la historia o el diagrama (y una duración si los efectos no terminan), y luego lo graba junto al archivo mediante el navegador y FFmpeg, mostrando el progreso (`meltemi.export.ffmpeg` indica otro FFmpeg) |
| Generar un diagrama con IA…                                    | Opcional: pide un archivo, una descripción y un perfil, muestra lo que se enviará y escribe la propuesta aceptada (`docs/assist.md`)                                                                                                           |
| Modificar con IA…                                              | Opcional: pregunta qué debe cambiar, muestra lo que se enviará, abre la propuesta en una vista de diferencias y te deja elegir sus puntos; un solo paso de deshacer                                                                            |
| Sugerir con IA las relaciones que faltan                       | Opcional: propone relaciones que probablemente faltan, cada una escrita con `assumption "<why>"`                                                                                                                                               |
| Explicar los cambios con IA                                    | Opcional: explica en un documento Markdown los cambios desde el último commit                                                                                                                                                                  |
| Establecer la clave de IA… / Borrar la clave de IA             | Guarda la clave del proveedor en el almacenamiento de secretos de VS Code, nunca en archivos                                                                                                                                                   |
| (paleta de un tipo declarado)                                  | Los diagramas de un tipo que declara un plugin tienen sus tipos de elemento en la paleta, el autocompletado de sus propiedades y valores, e información al pasar el puntero sobre esos tipos (`docs/plugins.md`)                               |
| Generar el catálogo                                            | Genera el catálogo HTML sin conexión del proyecto del archivo o la carpeta (`docs/catalog.md`) y ofrece abrirlo en el navegador                                                                                                                |
| Ejecutar un perfil de exportación                              | Escribe un perfil `export` del archivo, o todos, donde indican los perfiles (`docs/language/export.md`)                                                                                                                                        |
| Organizar los elementos sin colocar, Recalcular la disposición | Como se describe más arriba                                                                                                                                                                                                                    |
| Abrir el modelo                                                | Muestra el modelo de la vista C4 del lienzo, o de la que está bajo el cursor, en este archivo o en el importado                                                                                                                                |
| Convertir en composición libre                                 | Copia el diagrama de flujo del lienzo, o el que está bajo el cursor, en un nuevo diagrama libre y lo muestra                                                                                                                                   |
| Dar formato al documento                                       | El formato canónico                                                                                                                                                                                                                            |
| Importar desde Mermaid o PlantUML…                             | Pide un archivo `.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd` o `.md` y lo importa como se describe abajo                                                                                                                   |
| Convertir en diagrama de Meltemi                               | En el menú contextual del explorador y en el menú del título del editor de esos archivos: escribe `<name>.meltemi` junto al archivo y lo abre con el lienzo                                                                                    |
| Importar la selección como diagrama de Meltemi                 | En el menú contextual del editor: importa el texto de Mermaid o PlantUML seleccionado (y pregunta el lenguaje cuando no puede deducirlo) en una hoja a la que das nombre                                                                       |

## Importación

Cuando la hoja ya existe, la importación pregunta si quieres **Combinar**, que conserva sus
posiciones, estilos, clases, animaciones, escenarios y etiquetas locales de todo lo que sigue en el
origen, o **Reemplazar** la hoja. Cada construcción que se aproximó o se descartó aparece en la
salida **Importación de Meltemi** y en la vista Problemas, sobre las líneas del origen, hasta que el
origen se vuelve a importar o se cierra. Una importación parcial (algo esencial no se pudo
importar) lo indica con **Mostrar los hallazgos**. Lo que convierte cada lenguaje está en
[docs/es/import/](import/mermaid.md).

## Cuando algo no se ve bien

| Síntoma                                              | Causa                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El lienzo se ve atenuado y dice "Desactualizado"     | El texto tiene errores; el lienzo conserva la última imagen correcta hasta que se corrigen                                                                                  |
| Un gesto se rechaza con "El texto cambió"            | Escribiste mientras arrastrabas; el lienzo muestra el texto nuevo, vuelve a intentarlo                                                                                      |
| Las cajas se mueven cuando se mueve una              | El diagrama era `layout assisted` con cajas sin colocar, que ELK sigue organizando alrededor de las colocadas; dales posiciones con **Organizar los elementos sin colocar** |
| El lienzo no se abre junto al código                 | Lo cerraste antes; usa **Abrir el lienzo al lado** o cambia `meltemi.canvas.openWithText`                                                                                   |
| Una caja arrastrada sobre un grupo entró en él       | Soltar mueve la caja al grupo que está bajo el centro de la selección; vuelve a sacarla arrastrándola, o mantén Alt mientras arrastras para conservar su grupo              |
| No se puede hacer clic en una caja tapada            | El clic toma la forma de encima; Alt+clic selecciona la de debajo, o usa Tab                                                                                                |
| `layout.overlap` en cajas apiladas a propósito       | La caja interior está declarada antes que la exterior; trae al frente la caja interior, o declara primero la exterior                                                       |
| Un cuadrado discontinuo con un id donde iba un icono | El elemento tiene `shape icon` pero no `icon` (`layout.icon-missing`); dale uno con **Icono…** o con **Elegir…** del inspector, o elige otra forma                          |
| Los conectores se quedan atrás al arrastrar una caja | Soltar ahí se rechazaría, como un elemento C4 a través de un límite, o dejaría errores en el texto; las cajas se mueven solas hasta que sueltas                             |

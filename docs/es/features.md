# Funciones

[English](../features.md)

Todo lo que hace Meltemi Diagrams 1.0, por áreas. La guía de [primeros pasos](getting-started.md)
recorre el camino habitual, y el [índice de la documentación](README.md) enumera todas las
referencias.

- La gramática 0.2 de `.meltemi`, con un analizador sintáctico sin pérdidas y diagnósticos estables.
- Un modelo tipado y validación para los diagramas `flow`, `free`, `sequence` y `c4` y los modelos de
  arquitectura, con intercambio en JSON.
- Ediciones estructuradas del código fuente (mover, cambiar el tamaño, trazar la ruta, etiquetar,
  cambiar el nombre, quitar) que cambian solo los tokens afectados y conservan los comentarios y el
  formato.
- Proyectos: `project.json`, importaciones relativas con espacios de nombres, temas compartidos entre
  archivos, un tema predeterminado para todo el proyecto y validación
  ([proyectos](language/projects.md)).
- Temas y estilos: seis temas integrados (Technical, Editorial y Stage, claros y oscuros), temas
  personalizados que los extienden, un conjunto completo de tokens (incluida la velocidad
  predeterminada de los efectos), clases reutilizables, reglas por tipo, patrones, quince puntas de
  flecha en cualquiera de los dos extremos y flechas de doble sentido, líneas punteadas, esquinas
  redondeadas y preajustes de documento y de diapositiva ([estilos](language/styles.md)); en el
  lienzo, una barra de estilo con los tokens de color del tema, un selector de color y el panel del
  tema, que crea un tema en el archivo o para el proyecto y edita sus tokens.
- Iconos y recursos: el paquete Tabler integrado, paquetes de Iconify y de SVG del proyecto con sus
  licencias, fuentes del proyecto, `assets.lock.json` y `meltemi-diagrams assets`
  ([recursos](language/assets.md)); iconos junto al texto, encima, debajo o en el centro de una
  caja, con su tamaño por elemento, o dibujados como la forma misma con la etiqueta fuera
  ([estilos](language/styles.md#iconos-en-las-cajas)).
- Disposición: disposición automática y asistida con ELK, puertos con nombre, restricciones de
  alineación y de orden, conectores en codo, rectos y curvos, carriles paralelos, comprobaciones de
  composición y `meltemi-diagrams layout` para dejar escritas las posiciones
  ([disposición](language/layout.md)).
- `meltemi-diagrams validate` y `meltemi-diagrams export`: diagnósticos de archivos y de proyectos, y
  exportación a SVG de todos los perfiles compilados: diagramas `flow` con notas, marcas, cilindros
  de datos, rombos de decisión, bandas de grupo y etiquetas de paso, composiciones libres, diagramas
  de secuencia y vistas C4.
- Composiciones libres ([libre](language/free.md)): cajas con veinticuatro formas en las que
  terminan los conectores y cabe el texto (también las admiten los nodos de flujo), radios de
  esquina, contenedores simples y pilas, texto medido, iconos e imágenes del proyecto, grupos
  colocados por su interior, capas, enlaces de identidad a otros diagramas y
  `meltemi-diagrams convert --to free`, que copia un diagrama de flujo, tal como está dibujado, en
  uno libre.
- Diagramas de secuencia ([secuencia](language/sequence.md)): ocho tipos de participante y cajas de
  participantes, llamadas, respuestas, mensajes asíncronos y llamadas a sí mismo, activaciones,
  creación y destrucción, notas, todos los fragmentos (`alt`, `opt`, `loop`, `par`, `break`,
  `critical`, `region`), separadores, retrasos, numeración, reglas con el orden comprobado, una
  disposición determinista y escenarios que se exportan con `meltemi-diagrams export --scenario`.
- Modelos y vistas C4 ([c4](language/c4.md)): personas, sistemas, contenedores, almacenes de datos y
  componentes en un único modelo compartido; vistas de contexto, de contenedores y de componentes
  validadas por nivel y ámbito; relaciones elevadas a los ancestros dibujados, con trazabilidad, y
  combinadas solo de forma explícita; etiquetas locales; vistas de modelos importados; enlaces desde
  objetos de secuencia y libres; cambios de nombre que llegan a todas las vistas.
- Efectos de movimiento ([movimiento](language/motion.md)): partículas a lo largo de las relaciones,
  trazos en movimiento y pulsos, con un reloj determinista;
  `meltemi-diagrams export --motion animated` escribe un SVG animado con una alternativa estática, y
  `--at <time>`, el fotograma de cualquier instante; los efectos se editan en el inspector y se ven
  en vista previa en el lienzo.
- Historias ([historias](language/stories.md)): escenas que muestran, ocultan, resaltan, enfocan,
  encuadran con una cámara y recorren relaciones con el mismo reloj, en secuencia o en paralelo, y
  cambian de vista con un corte, un fundido o una transformación;
  `meltemi-diagrams export --story <id> --at <time>` escribe cualquier fotograma, y el lienzo
  reproduce una historia con una línea de tiempo cuyos arrastres y **Agregar a la escena** editan el
  texto.
- El reproductor HTML ([reproductor](player.md)): `meltemi-diagrams export --format html` escribe una
  página sin conexión, o un fragmento para insertar, que reproduce una historia o los efectos de un
  diagrama con pausa, progreso, escenas, movimiento reducido, una vista estática, control por
  teclado y un resumen en texto; cada dibujo admite zoom y desplazamiento, muestra tarjetas y un
  panel de detalles, y abre la vista de contenedores o de componentes de una caja, o el diagrama con
  el que enlaza, con un doble clic o su signo más.
- PNG y PDF, y perfiles de exportación ([exportación](language/export.md)): `--format png|pdf` con
  una escala de píxeles, un tamaño fijo y un fondo transparente opcional, dibujados por el Edge o el
  Chrome instalado; páginas PDF vectoriales con fuentes, texto seleccionable y enlaces; hipervínculos
  `url` en elementos y entidades; bloques `export` que describen cada entrega y se ejecutan con
  `--profile` o `--profiles`.
- Video y GIF ([exportación](language/export.md)): `--format mp4|webm|gif` graba una historia o los
  efectos de un diagrama fotograma a fotograma con el reloj determinista, a 1080p y 30 fps de forma
  predeterminada, y los codifica con el FFmpeg del sistema.
- El catálogo HTML ([catálogo](catalog.md)): `meltemi-diagrams build catalog` escribe una página sin
  conexión con los diagramas y las historias de un proyecto por carpetas, con el reproductor,
  búsqueda, enlaces entre diagramas y a través de las entidades del modelo, el desglose de una vista
  a las vistas que abre, descargas en SVG y solo los metadatos autorizados.
- La línea de comandos completa ([cli](cli.md)): `init` con plantillas, entre ellas el ejemplo de
  referencia de compra; `preview` con recarga en vivo; `validate`, `format`, `import` y `export` de
  proyectos enteros; `review` de lo que cambió desde una revisión de Git, por id, que distingue los
  cambios de nombre de lo quitado y lo agregado, con imágenes de antes y después; flujos de trabajo
  de CI para GitHub y GitLab.
- Asistencia de IA opcional ([asistencia](assist.md)): Anthropic o cualquier punto de conexión
  compatible con OpenAI, incluidos los locales; primeras estructuras, cambios según instrucciones,
  relaciones que probablemente faltan marcadas como supuestos y explicaciones de revisiones, como
  propuestas de bloques enteros que aceptas en parte, validadas en el proyecto y conciliadas con
  tus ediciones; lo que se envía se muestra antes, y las claves se quedan fuera de los proyectos.
- Plugins y seguridad ([plugins](plugins.md), [seguridad](security.md)): tipos de diagrama
  declarados como datos (tipos de elemento, propiedades, valores obligatorios, relaciones
  permitidas, disposición, paleta, formas y estilos) y paquetes de iconos, instalados de forma
  explícita con una versión fijada, permisos concedidos y compatibilidad declarada; nunca se ejecuta
  código de un proyecto; las rutas se quedan en el proyecto, no se descarga nada, los tamaños tienen
  límites y los errores nunca muestran secretos.
- Importadores ([importación](import/mermaid.md)): `flowchart`, `sequenceDiagram`, `C4*`,
  `architecture-beta` y `block-beta` de Mermaid; diagramas de componentes, de despliegue, de casos
  de uso, de secuencia y de C4-PlantUML de PlantUML, con el preprocesador; bloques de diagramas de
  archivos Markdown. Cada construcción se informa como convertida, aproximada o descartada, el
  origen nunca se modifica, y al reimportar se conservan la colocación, los estilos y los demás
  ajustes hechos desde entonces (`meltemi-diagrams import`, y tres comandos en VS Code).
- El playground ([playground](playground.md)): una página web estática con las plantillas, el código
  con sus servicios de lenguaje junto al mismo lienzo, un único historial para deshacer, importación
  de Mermaid y PlantUML, todas las exportaciones (SVG, PNG, PDF mediante la impresión, el
  reproductor HTML, GIF, WebM y MP4, perfiles, el archivo comprimido del proyecto, el JSON del modelo
  y el catálogo), enlaces para compartir y el trabajo guardado en el navegador; sin cuenta, y nada
  sale de la página.
- Trabajar juntos ([playground](playground.md#trabajar-juntos), [cloud](cloud.md)): una cuenta
  opcional añade proyectos en la nube que varias personas abren a la vez. Todos escriben sin perder
  un solo carácter y el deshacer de cada persona cubre solo sus propias ediciones; la cabecera
  muestra quién está, y sus cursores y selecciones se ven en el código y en el lienzo. Nada de ello
  se exporta ni se guarda.
- El editor para VS Code y sus derivados ([editor](editor.md)):
  - todas las funciones del lenguaje, desde los diagnósticos y el autocompletado hasta el cambio de
    nombre, el formato y las correcciones rápidas;
  - un lienzo junto al código con una cuadrícula de 14 px, guías, zoom, desplazamiento, un minimapa,
    una paleta con una cuadrícula de formas y una herramienta de relación, un selector de iconos
    que busca en todos los paquetes y bibliotecas, formas que se crean vacías y texto que se
    escribe donde se dibuja, edición de rutas, una barra de estilo y un inspector, un panel del
    tema, un portapapeles, agrupación, arrastrar y soltar dentro de los grupos, alineación, manejo
    completo con el teclado y transiciones breves que respetan el movimiento reducido;
  - cada gesto es una pequeña edición del texto.
- Calidad: etiquetas que se mantienen apartadas de las formas y de otros conectores, auditadas en
  cada dibujo, conectores que rodean las cajas, un corpus de aceptación de los cuatro perfiles,
  referencias de píxeles, exportaciones deterministas, objetivos de rendimiento en una máquina de
  referencia y cada exportación abierta en Edge, Chrome y Firefox ([calidad](../quality.md)).
- Estabilidad: la [política de cambios del lenguaje](language/policy.md), una
  [suite de conformidad](language/conformance.md) que otra implementación puede ejecutar, una sola
  versión para todos los paquetes y una comprobación de la versión que instala la CLI empaquetada y
  la ejecuta ([publicación de versiones](../../RELEASING.md)).

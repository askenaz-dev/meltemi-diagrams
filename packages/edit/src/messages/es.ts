import { decimal, list, plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** Code inside a sentence: `text`. */
const code = (text: string) => `\`${text}\``;

/** A number in prose, with the decimal comma. */
const num = (value: number) => decimal("es", value, 3);

/** A count with its noun: "1 instrucción", "3 instrucciones". */
const count = (n: number, one: string, other: string) => `${n} ${plural("es", n, { one, other })}`;

/** "cámbiala" or "cámbialas", by count: an imperative with the pronoun of what it names. */
const them = (n: number, verb: string) => `${verb}${plural("es", n, { one: "la", other: "las" })}`;

/** A word of a table, or the word as code when the table does not know it. */
const pick = (table: Readonly<Record<string, string>>, word: string) =>
  Object.hasOwn(table, word) ? table[word]! : code(word);

/** The first letter in capitals, for words that open a sentence. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The kinds of elements as what an element becomes: "una decisión". */
const A_KIND: Readonly<Record<string, string>> = {
  node: "un nodo",
  decision: "una decisión",
  data: "datos",
  group: "un grupo",
  note: "una nota",
  tag: "una marca",
  participant: "un participante",
  actor: "un actor",
  boundary: "un límite",
  control: "un control",
  entity: "una entidad",
  database: "una base de datos",
  collections: "colecciones",
  queue: "una cola",
  box: "una caja",
  text: "un texto",
  icon: "un icono",
  image: "una imagen",
  person: "una persona",
  system: "un sistema",
  container: "un contenedor",
  datastore: "un almacén de datos",
  component: "un componente",
};

/** The entity kinds of models with an indefinite and a definite article. */
const ENTITIES: Readonly<Record<string, { readonly a: string; readonly the: string }>> = {
  person: { a: "una persona", the: "la persona" },
  system: { a: "un sistema", the: "el sistema" },
  container: { a: "un contenedor", the: "el contenedor" },
  datastore: { a: "un almacén de datos", the: "el almacén de datos" },
  component: { a: "un componente", the: "el componente" },
};

const entity = (kind: string) =>
  Object.hasOwn(ENTITIES, kind) ? ENTITIES[kind]! : { a: code(kind), the: code(kind) };

/** Diagram profiles in plural, with their article. */
const PROFILES: Readonly<Record<string, string>> = {
  flow: "los diagramas de flujo",
  free: "las composiciones libres",
  sequence: "los diagramas de secuencia",
  c4: "las vistas C4",
};

/**
 * The nouns of the statements that depend on a target. The other kinds are keywords (`place`,
 * `route`, `style`, `animate`…), which stay as code.
 */
const DEPENDENTS: Readonly<Record<string, string>> = {
  element: "elemento",
  relation: "relación",
  event: "evento",
  constraint: "restricción",
  link: "enlace",
  story: "historia",
  person: "persona",
  system: "sistema",
  container: "contenedor",
  datastore: "almacén de datos",
  component: "componente",
};

export const es: typeof en = {
  labels: {
    node: "Nodo",
    decision: "Decisión",
    data: "Datos",
    group: "Grupo",
    note: "Nota",
    tag: "Marca",
    participant: "Participante",
    actor: "Actor",
    boundary: "Límite",
    control: "Control",
    entity: "Entidad",
    database: "Base de datos",
    collections: "Colecciones",
    queue: "Cola",
    box: "Caja",
    text: "Texto",
    icon: "Icono",
    image: "Imagen",
    line: "Línea",
    person: "Persona",
    system: "Sistema",
    container: "Contenedor",
    datastore: "Almacén de datos",
    component: "Componente",
  },

  rejections: {
    targets: {
      unsupportedDiagram: (id, profile) =>
        `${code(id)} es un diagrama ${profile}, un tipo que el lenguaje no tiene; la edición visual solo está disponible para diagramas.`,
      isModel: (id) => `${code(id)} es un modelo; edítalo con las operaciones de entidades.`,
      isStory: (id) => `${code(id)} es una historia; edítala con las operaciones de historias.`,
      isExport: (id) =>
        `${code(id)} es un perfil de exportación; la edición visual solo está disponible para diagramas.`,
      noDiagram: (id) => `No hay ningún diagrama ${code(id)} en este documento.`,
      syntaxError: (id, error) =>
        `El diagrama ${code(id)} tiene un error de sintaxis${error ? ` en la línea ${error.line} (${error.message})` : ""}. Corrígelo antes de editarlo visualmente.`,
      noBody: (id) => `El diagrama ${code(id)} no tiene cuerpo.`,
      blockNotClosed: "El bloque no está cerrado; corrige la sintaxis primero.",
      notInBlock: "Una instrucción que se va a eliminar no está dentro de un bloque.",
      invalidStatement: (keyword, target, line) =>
        `La instrucción ${code(keyword)} de ${code(target)} en la línea ${line} no es válida; corrígela antes de editar visualmente.`,
      propertyUnreadable: "No se puede leer la propiedad.",
      unparsable: "La edición produciría un texto que no se puede analizar; no se planificó.",
      staleRevision: (planned, current) =>
        `El plan se hizo para la revisión ${planned}, pero el documento está en la revisión ${current}. Vuelve a planificar a partir del texto actual.`,
    },

    ids: {
      invalid: (id) =>
        `${code(id)} no es un id válido; usa letras, dígitos y \`_\`, y empieza con una letra o \`_\`.`,
      invalidEntity: (id) => `${code(id)} no es un id válido; usa letras, dígitos y \`_\`.`,
      notValid: (id) => `${code(id)} no es un id válido.`,
      usedInDiagram: (id, diagram) => `${code(id)} ya se usa en el diagrama ${code(diagram)}.`,
      used: (id) => `${code(id)} ya se usa.`,
      usedInFile: (id) => `${code(id)} ya se usa en este archivo.`,
    },

    values: {
      notCoordinate: (value) =>
        `${code(String(value))} no es una coordenada que el lenguaje pueda escribir.`,
      positiveSize: "El ancho y el alto deben ser positivos.",
      takesNumber: (name) => `${code(name)} admite un número.`,
      notValueOf: (value, property) => `${code(value)} no es un valor de ${code(property)}.`,
      unsafeUrl: (value) =>
        `${code(value)} no es una URL que un enlace pueda usar: \`https:\`, \`http:\`, \`mailto:\` o una relativa.`,
    },

    elements: {
      missing: (id, diagram) =>
        `El elemento ${code(id)} no existe en el diagrama ${code(diagram)}.`,
      usedBy: (id, n) =>
        `${code(id)} se usa en ${count(n, "instrucción", "instrucciones")}; ${them(n, "quíta")} primero o quítalo en cascada.`,
      otherProfile: (kind, other, kinds) =>
        `Los elementos ${code(kind)} pertenecen a ${other === "flow" ? "los diagramas de flujo" : "las composiciones libres"}; este diagrama declara ${kinds.join(", ")}.`,
      badIcon: (icon) =>
        `${code(icon)} no es una referencia de icono como ${code("tabler:server")}.`,
      notShape: (shape, shapes) =>
        `${code(shape)} no es una forma; las formas son ${shapes.join(", ")}.`,
      shapeKinds: (kind) =>
        `Las formas son para las cajas libres y los nodos de flujo; ${pick(A_KIND, kind)} no admite forma.`,
      needsSource: (kind) =>
        kind === "icon"
          ? "Un icono nuevo necesita su icono."
          : "Una imagen nueva necesita la ruta de su archivo.",
      participantsNotPlaced:
        "Los participantes de una secuencia no se colocan; cambia su orden con reorderParticipant.",
      sourcedLabel: (id, kind) =>
        `${code(id)} es ${kind === "icon" ? "un icono" : "una imagen"}; no tiene etiqueta. Cambia ${kind === "icon" ? "el icono" : "el archivo"} que muestra.`,
      declarationNoId: "La declaración no tiene id.",
      labelUnreadable:
        "No se puede leer la etiqueta de la declaración; corrige la sintaxis primero.",
      descriptionUnreadable: "No se puede leer la descripción; corrige la sintaxis primero.",
      groupKind: "Un grupo no puede convertirse en otro tipo; desagrúpalo primero.",
      cannotBecome: (id, kind, kinds) =>
        `${code(id)} no puede convertirse en ${pick(A_KIND, kind)}; este diagrama solo convierte entre sí ${kinds.join(", ")}.`,
      notClass: (name) => `${code(name)} no es un nombre de clase.`,
      notSourced: (id) => `${code(id)} no es un icono ni una imagen.`,
      sourceUnreadable: "No se puede leer el icono o la ruta de la imagen.",
    },

    lines: {
      freeOnly: "Las líneas que no unen elementos pertenecen a las composiciones libres.",
      notALine: (id) => `\`${id}\` no es una línea.`,
      points: (id) => `\`${id}\` es una línea: sus puntos se escriben en su instrucción.`,
    },
    relations: {
      missing: (name, diagram) =>
        `La relación ${code(name)} no existe en el diagrama ${code(diagram)}.`,
      anonymous: (name) =>
        `La relación ${code(name)} no tiene id. Ejecuta materializeRelationId primero para que la edición pueda referirse a ella.`,
      alreadyNamed: (id) => `La relación ya se llama ${code(id)}.`,
      modelLabel: (relation) =>
        `${code(relation)} es una relación del modelo; dale una etiqueta en esta vista con setLocalLabel, o cambia la etiqueta del modelo con setModelRelationProperty.`,
      modelRemove: (relation) =>
        `${code(relation)} es una relación del modelo; quítala allí con removeModelRelation, o deja de dibujar uno de sus extremos con excludeEntity.`,
      routeUnreadable: "No se puede leer la ruta.",
      messagesNoPorts: "Los mensajes de una secuencia no tienen puertos.",
      oneWay: "Las relaciones de las vistas C4 van en un solo sentido: `->`.",
      unnamed: (key) =>
        `La relación \`${key}\` no tiene id con el que nombrarla; dale uno primero.`,
    },

    placement: {
      expectedNumber: "Se esperaba un número en la instrucción.",
      expectedPoint: "Se esperaba un punto `(x, y)` en la instrucción.",
      layoutUnreadable: "No se puede leer la instrucción `layout`.",
      expectedEndpoint: "Se esperaba un extremo de ruta.",
      labelPosition: "La posición de la etiqueta debe estar entre 0 y 100 por ciento.",
    },

    ports: {
      unknown: (element, port, ports) =>
        `${code(element)} no tiene ningún puerto ${code(port)}; sus puertos son ${ports.join(", ")}.`,
      invalidName: (name) =>
        `${code(name)} no puede nombrar un puerto; los puntos cardinales y \`auto\` vienen integrados.`,
      exists: (element, name) => `${code(element)} ya tiene un puerto ${code(name)}.`,
      position: "La posición de un puerto está entre 0 y 1.",
      endSide: (port) =>
        `Fijar un punto del lado necesita un punto cardinal, \`north\`, \`south\`, \`east\` o \`west\`, no ${code(port)}.`,
      endPosition: "El punto de un lado es un porcentaje de 0 a 100.",
      declareFirst: (element) => `Declara ${code(element)} antes de agregarle puertos.`,
      missing: (element, name) => `${code(element)} no tiene ningún puerto ${code(name)}.`,
      usedByRoutes: (name, n) =>
        `El puerto ${code(name)} se usa en ${count(n, "ruta", "rutas")}; ${them(n, "cámbia")} primero.`,
    },

    groups: {
      notGroup: (id) => `${code(id)} no es un grupo.`,
      noBlock: (id) => `El grupo ${code(id)} no tiene bloque.`,
      select: "Selecciona los elementos que quieres agrupar.",
      sameGroup: "Solo se pueden agrupar elementos del mismo grupo (o todos fuera de grupos).",
      endOfRelations: (group, n) =>
        `El grupo ${code(group)} es el extremo de ${count(n, "relación", "relaciones")}; ${them(n, "cámbia")} primero.`,
      intoItself: (element, parent) =>
        element === parent
          ? `${code(element)} no se puede mover dentro de sí mismo.`
          : `${code(element)} no se puede mover a ${code(parent)}, que está dentro de ${code(element)}.`,
      notMovable: (profile) =>
        profile === "sequence"
          ? "Los participantes de los diagramas de secuencia no se mueven entre grupos; cambia su orden con reorderParticipant."
          : "Los elementos de una vista C4 están donde sus entidades están en el modelo; no se mueven entre grupos.",
      containerProfile:
        "Solo los diagramas de flujo y las composiciones libres tienen contenedores.",
      containerKind: (id, kind) =>
        `${code(id)} es de tipo ${kind}: solo los nodos de flujo y las cajas libres se convierten en contenedores.`,
      containerImplicit: (id) =>
        `${code(id)} no tiene declaración; declárala antes de convertirlo en contenedor.`,
      containerPorts: (id, ports) =>
        `${code(id)} declara ${ports.length === 1 ? "el puerto" : "los puertos"} ${ports.map(code).join(", ")}; los grupos no tienen puertos con nombre, así que ${ports.length === 1 ? "quítalo" : "quítalos"} primero.`,
      containerChild: (child, id) =>
        `${code(child)} no está junto a ${code(id)} en su grupo, así que no puede entrar en él.`,
    },

    insert: {
      notOneDiagram:
        "El texto que se va a insertar no es un único diagrama de flujo o composición libre sin errores de sintaxis.",
      idsExist: (ids, diagram) =>
        `${list("es", ids.map(code))} ya ${ids.length === 1 ? "existe" : "existen"} en el diagrama ${code(diagram)}.`,
    },

    properties: {
      kindForMessages: "`kind` se aplica a los mensajes de los diagramas de secuencia.",
      messageKind: "El tipo de un mensaje es `async` o `sync`.",
      layersFree: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
      mainLayer: "La capa `main` siempre existe y conserva su nombre.",
      layerTaken: (name) =>
        `${code(name)} no es un nombre de capa libre: usa una palabra que ninguna capa tenga.`,
      noLayer: (layer, layers) =>
        `No hay ninguna capa ${code(layer)}; las capas son ${layers.join(", ")}.`,
      relationsNoUrl: "Las relaciones no admiten `url`.",
      viewUrl: "Los elementos de una vista C4 toman la `url` de su entidad.",
      relationsNoLink: "Las relaciones no admiten `link`.",
      notLink: (value) => `${code(value)} no es un enlace; escribe \`<diagram>.<element>\`.`,
    },

    convert: {
      notFlow: (id) => `${code(id)} no es un diagrama de flujo.`,
      hasErrors: (id) => `El diagrama ${code(id)} tiene errores; corrígelos antes de convertirlo.`,
      noBox: (id) => `${code(id)} no tiene una caja dibujada; organiza el diagrama primero.`,
    },

    diagrams: {
      notCreatable: (type, types) =>
        `${code(type)} no es un tipo de diagrama que se pueda crear aquí; se esperaba uno de ${types.join(", ")}.`,
      invalidId: (id) =>
        `${code(id)} no es un id válido para un diagrama; usa letras, dígitos y \`_\`, empezando por una letra o \`_\`.`,
      taken: (id) => `${code(id)} ya se usa en este archivo; elige otro id.`,
    },

    styles: {
      notProperty: (property) => `${code(property)} no es una propiedad de estilo.`,
      wordOrString: (property) => `${code(property)} admite una palabra o una cadena.`,
      unnamedEvent: (target) =>
        `${code(target)} no es una nota ni un fragmento con nombre; nómbralo antes de darle estilo.`,
      relationsOnly: (property) => `${code(property)} solo se aplica a relaciones.`,
      nameRelation: "Nombra la relación primero para que un estilo pueda referirse a ella.",
      elementsOnly: (property) => `${code(property)} solo se aplica a elementos.`,
      notProfileProperty: (property, profile) =>
        `${code(property)} no es una propiedad de ${Object.hasOwn(PROFILES, profile) ? PROFILES[profile]! : `los diagramas ${code(profile)}`}.`,
      names: (property) => `${code(property)} admite nombres separados por comas.`,
      entityPath: (path) => `${code(path)} no es una ruta de entidad como \`shop.api\`.`,
      numberRange: (property, min, max) =>
        `${code(property)} admite un número${min !== undefined && max !== undefined ? ` de ${num(min)} a ${num(max)}` : ""}.`,
      canvasSize: "`canvas` admite un ancho y un alto, como `(1280, 720)`.",
      notDiagramProperty: (property) => `${code(property)} no es una propiedad de diagrama.`,
    },

    animations: {
      flowOnBoxes: "Las partículas recorren relaciones, no cajas.",
      traceOnBoxes: "Un recorrido avanza por relaciones, no por cajas.",
      noOutline: (target) => `${code(target)} no tiene contorno para un trazo en movimiento.`,
      nameRelation: "Nombra la relación primero para que un efecto pueda referirse a ella.",
      unnamedEvent: (target) =>
        `${code(target)} no es una nota ni un fragmento con nombre; nómbralo antes de animarlo.`,
      pulseOnly: "Las notas y los fragmentos solo admiten un pulso.",
      timeRange: (property, min, max) =>
        `${code(property)} admite de ${num(min)} a ${num(max)} milisegundos.`,
      repeatRange: (max) => `\`repeat\` admite \`forever\` o de 1 a ${max}.`,
      particlesRange: (max) => `\`particles\` admite de 1 a ${max}.`,
      direction: "`direction` admite `forward` o `reverse`.",
      notProperty: (property) => `${code(property)} no es una propiedad de \`animate\`.`,
      notForEffect: (property, effect) =>
        `${code(property)} no se aplica a los efectos ${code(effect)}.`,
    },

    themes: {
      missing: (id) =>
        `No hay ningún tema ${code(id)} en este archivo; los temas integrados no se pueden cambiar: crea un tema que extienda uno.`,
      noBlock: (id) => `El tema ${code(id)} no tiene bloque.`,
      notToken: (token, tokens) =>
        `${code(token)} no es un token de tema. Tokens de tema: ${tokens.join(", ")}.`,
      needsValue: (token) => `${code(token)} necesita un valor.`,
      notValue: (value, token, values) =>
        `${code(value)} no es un valor de ${code(token)}; se esperaba uno de ${values.join(", ")}.`,
      takesTime: (token) => `${code(token)} admite un tiempo en milisegundos.`,
      notWritable: (token) => `${code(token)} no se puede escribir desde aquí.`,
      exists: (id) => `Ya hay un tema ${code(id)} en este archivo.`,
      tokenUnreadable: (token) => `No se puede leer ${code(token)}.`,
      keepsBase: "Un tema conserva su base; cambia `extends` con setThemeToken.",
    },

    sequence: {
      notSequence: (id) => `${code(id)} no es un diagrama de secuencia.`,
      flowGeometry: (operation) =>
        `${code(operation)} no se aplica a los diagramas de secuencia, que conservan el orden de los eventos; usa reorderParticipant, moveEvent y setSpacing.`,
      noEvent: (key, diagram) =>
        `El evento ${code(key)} no existe en el diagrama ${code(diagram)}.`,
      notFragment: (key) => `${code(key)} no es un fragmento.`,
      notParticipantOrGroup: (id) =>
        `${code(id)} no es un participante ni un grupo de participantes.`,
      noSpace: (kind) =>
        `Un evento ${code(kind)} no tiene espacio propio; ajusta el espacio del mensaje siguiente.`,
      notParticipant: (id) => `${code(id)} no es un participante.`,
      amountUnreadable: "No se puede leer la cantidad.",
      noBranch: (key, branch) => `${code(key)} no tiene la rama ${branch}.`,
      notFragmentOperator: (operator, operators) =>
        `${code(operator)} no es un fragmento; usa ${operators.join(", ")}.`,
      selectEvents: "Selecciona los eventos que quieres envolver.",
      sameBlock: "Solo se pueden envolver juntos eventos del mismo bloque.",
      consecutive: "Solo se pueden envolver juntos eventos consecutivos.",
      otherBranches: (key) => `${code(key)} tiene otras ramas con eventos; quítalas primero.`,
      singleBranch: (operator) => `${code(operator)} tiene una sola rama.`,
      removeMessage: "Los mensajes son relaciones; quítalos con removeRelation.",
      renameMessage: "Los mensajes son relaciones; cámbiales el nombre con renameRelation.",
      eventNoId: (kind) => `Un evento ${code(kind)} no tiene id.`,
      notMessage: (id) => `${code(id)} no es un mensaje.`,
      noText: (id) => `${code(id)} no tiene texto propio.`,
      textUnreadable: "No se puede leer el texto.",
      needsText: (kind) =>
        kind === "note"
          ? "Una nota necesita su texto."
          : kind === "divider"
            ? "Un separador necesita su texto."
            : `Un evento ${code(kind)} necesita su texto.`,
      notNote: (id) => `${code(id)} no es una nota.`,
      notePosition: "Una nota va `over`, `left` o `right` de sus participantes.",
      noteParticipant: "Una nota necesita un participante.",
      oneParticipant: (position) => `\`${position} of\` admite un solo participante.`,
      notOperator: (operator, operators) =>
        `${code(operator)} no es un operador de fragmento; usa ${operators.map(code).join(", ")}.`,
      singleBranchFor: (operator, key, branches) =>
        `${code(operator)} tiene una sola rama y ${code(key)} tiene ${branches}; quita las demás primero.`,
    },

    c4: {
      notInView: (operation, model) =>
        `${code(operation)} no se aplica a las vistas C4, que dibujan las entidades del modelo ${code(model)}; cambia el modelo con las operaciones de entidades, y la vista con includeEntity, excludeEntity, setLocalLabel, la colocación y los estilos.`,
      notView: (id) => `${code(id)} no es una vista C4.`,
      viewNoBody: (id) => `${code(id)} no tiene cuerpo.`,
      unresolved: "No se encontró el modelo de la vista.",
      nameInModel: (key) =>
        `\`${key}\` viene del modelo; nómbrala allí con setModelRelationProperty.`,
      noEntity: (model, path) => `El modelo ${code(model)} no tiene ninguna entidad ${code(path)}.`,
      isScope: (id) => `${code(id)} es el ámbito de esta vista; cambia el ámbito.`,
      removingFromView: (id, n) =>
        `Quitar ${code(id)} de la vista también quita ${count(n, "instrucción", "instrucciones")}.`,
      notDrawn: (target, view) => `${code(target)} no está dibujado en la vista ${code(view)}.`,
      noModel: (id) => `No hay ningún modelo ${code(id)} en este documento.`,
      modelErrors: (id) =>
        `El modelo ${code(id)} tiene errores de sintaxis; corrígelos antes de editarlo.`,
      noRelation: (model, key) =>
        `El modelo ${code(model)} no tiene ninguna relación ${code(key)}.`,
      modelNoBody: "El modelo no tiene cuerpo.",
      entityExists: (path, model) => `${code(path)} ya es una entidad del modelo ${code(model)}.`,
      opensScope: (view, scope) =>
        `La vista ${code(view)} abre ${code(scope)}; cambia su ámbito antes de quitar la entidad.`,
      removingEntity: (path, n) =>
        `Quitar ${code(path)} también quita ${count(n, "instrucción", "instrucciones")}.`,
      external: "`external` marca personas y sistemas.",
      notEntityKind: (kind, kinds) =>
        `${code(kind)} no es un tipo de entidad; usa ${kinds.join(", ")}.`,
      misplaced: (kind, parent) =>
        `${capital(entity(kind).a)} no se puede declarar ${parent ? `en ${entity(parent.kind).the} ${code(parent.path)}` : "en la raíz del modelo"}.`,
      pathExists: (path) => `${code(path)} ya existe.`,
      relationExists: (id) => `${code(id)} ya es una relación del modelo.`,
      keepsId: "Una relación conserva su id una vez que tiene nombre; cámbiale el nombre.",
      removingRelation: (key, n) =>
        `Quitar ${code(key)} del modelo también afecta a ${count(n, "instrucción o vista", "instrucciones o vistas")}.`,
      endUnreadable: (key) => `No se puede leer el extremo de ${code(key)}.`,
    },

    stories: {
      missing: (id, stories) =>
        `No hay ninguna historia ${code(id)}${stories.length > 0 ? `; historias: ${stories.map(code).join(", ")}` : ""}.`,
      noScene: (story, id) => `La historia ${code(story)} no tiene ninguna escena ${code(id)}.`,
      noSceneAt: (story, index) =>
        index === undefined
          ? `La historia ${code(story)} no tiene esa escena.`
          : `La historia ${code(story)} no tiene la escena ${index}.`,
      noAction: (scene, path) =>
        `La escena ${code(scene)} no tiene ninguna acción en [${path.join(", ")}].`,
      timeRange: (max) => `Los tiempos de una historia van de 0 a ${max} milisegundos.`,
      noTransition: (scene) => `La escena ${code(scene)} no tiene transición.`,
      cut: "Un corte no dura nada; cámbialo a `fade` o `morph` para darle una duración.",
      parallel:
        "Un bloque `parallel` dura lo que su acción más larga; ajusta la duración de una de sus acciones.",
      sceneNoBlock: (scene) => `La escena ${code(scene)} no tiene bloque.`,
      holdTargets: "`hold` admite un tiempo, no objetivos.",
      holdTime: "`hold` necesita un tiempo.",
      allActions: "Solo `focus` y `camera` admiten `all`.",
      allTargets: "`all` reemplaza a los objetivos.",
      needsTargets: (action) => `${code(action)} necesita objetivos.`,
      traceOne: "`trace` sigue una sola relación.",
      noTarget: (view, target) =>
        `${code(view)} no tiene ningún elemento ni relación con nombre ${code(target)}.`,
      traceRelation: (target) => `\`trace\` sigue una relación; ${code(target)} no lo es.`,
      invalidSceneId: (id) => `${code(id)} no es un id de escena válido.`,
      sceneExists: (story, id) => `La historia ${code(story)} ya tiene una escena ${code(id)}.`,
      noBody: (story) => `La historia ${code(story)} no tiene cuerpo.`,
    },
  },

  dependents: {
    statement: (kind, name, line) =>
      Object.hasOwn(DEPENDENTS, kind)
        ? `${DEPENDENTS[kind]!} ${code(name)} en la línea ${line}`
        : `${code(kind)} de ${code(name)} en la línea ${line}`,
    viewList: (keyword, view, line) =>
      `${code(keyword)} de la vista ${code(view)} en la línea ${line}`,
    drawnIn: (relation, view, line) =>
      `${code(relation)} dibujada en la vista ${code(view)} en la línea ${line}`,
    leavesView: (entity, view) => `${code(entity)} deja de dibujarse en la vista ${code(view)}`,
    link: (owner, line) => `enlace de ${code(owner)} en la línea ${line}`,
    storyAction: (action, story, line) =>
      `${code(action)} de la historia ${code(story)} en la línea ${line}`,
  },

  notes: {
    commentMentions: (line, id) =>
      `El comentario de la línea ${line} menciona ${code(id)} y no se cambió.`,
    removedComment: (line, text) => `Se quitó el comentario de la línea ${line}: ${text}`,
    keptElement: (id, kind) =>
      `${code(id)} solo estaba declarado por relaciones quitadas; se conserva como \`${kind} ${id}\`.`,
    keptEnds: (ids) =>
      ids.length === 1
        ? `${list("es", ids.map(code))} solo estaba declarado por la relación quitada y se conserva declarado.`
        : `${list("es", ids.map(code))} solo estaban declarados por la relación quitada y se conservan declarados.`,
    removedLinks: (n, group) =>
      n === 1
        ? `Se quitó de otros diagramas el enlace a ${code(group)}.`
        : `Se quitaron de otros diagramas ${n} enlaces a ${code(group)}.`,
  },
};

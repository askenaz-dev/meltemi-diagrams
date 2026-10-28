import { decimal, list, plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** Code inside a sentence: `text`. */
const code = (text: string) => `\`${text}\``;

/** A number in prose, with the decimal comma. */
const num = (value: number) => decimal("es", value, 3);

/** A value of a table, or the word as code when the table does not know it. */
const pick = (table: Readonly<Record<string, string>>, word: string) =>
  Object.hasOwn(table, word) ? table[word]! : code(word);

/** A diagram profile with an indefinite article: "un diagrama de flujo". */
const A_PROFILE: Readonly<Record<string, string>> = {
  flow: "un diagrama de flujo",
  free: "una composición libre",
  sequence: "un diagrama de secuencia",
  c4: "una vista C4",
};

/** Diagram profiles in plural: "los diagramas de flujo". */
const PROFILES: Readonly<Record<string, string>> = {
  flow: "los diagramas de flujo",
  free: "las composiciones libres",
  sequence: "los diagramas de secuencia",
  c4: "las vistas C4",
};

/** The entity kinds of models: with an article, in plural, and after "bloques". */
const ENTITIES: Readonly<
  Record<
    string,
    { readonly a: string; readonly the: string; readonly many: string; readonly of: string }
  >
> = {
  person: { a: "una persona", the: "la persona", many: "las personas", of: "de persona" },
  system: { a: "un sistema", the: "el sistema", many: "los sistemas", of: "de sistema" },
  container: {
    a: "un contenedor",
    the: "el contenedor",
    many: "los contenedores",
    of: "de contenedor",
  },
  datastore: {
    a: "un almacén de datos",
    the: "el almacén de datos",
    many: "los almacenes de datos",
    of: "de almacén de datos",
  },
  component: {
    a: "un componente",
    the: "el componente",
    many: "los componentes",
    of: "de componente",
  },
};

const entity = (kind: string) =>
  Object.hasOwn(ENTITIES, kind)
    ? ENTITIES[kind]!
    : { a: code(kind), the: code(kind), many: code(kind), of: code(kind) };

/** The levels of C4 views, after "una vista". */
const LEVELS: Readonly<Record<string, string>> = {
  context: "de contexto",
  container: "de contenedores",
  component: "de componentes",
};

/** Where each entity kind of a model belongs. */
const HOMES: Readonly<Record<string, string>> = {
  person: "en la raíz del modelo",
  system: "en la raíz del modelo",
  container: "en un sistema",
  datastore: "en un sistema",
  component: "en un contenedor",
};

/** The element kinds drawn without an outline, with an indefinite article. */
const UNOUTLINED: Readonly<Record<string, string>> = {
  note: "una nota",
  text: "un texto",
  icon: "un icono",
  image: "una imagen",
  actor: "un actor",
  boundary: "un límite",
  control: "un control",
  entity: "una entidad",
};

/** The blocks of properties, by their owner. */
const BLOCKS: Readonly<Record<string, string>> = {
  element: "un bloque de elemento",
  relation: "un bloque de relación",
};
const block = (owner: string) =>
  Object.hasOwn(BLOCKS, owner) ? BLOCKS[owner]! : `un bloque ${code(owner)}`;

/** What a diagram may have too many of. */
const COUNTED: Readonly<Record<string, string>> = {
  elements: "elementos",
  relations: "relaciones",
  events: "eventos",
};

/** The written source of an element, as the subject of a sentence. */
const SOURCES: Readonly<Record<string, string>> = {
  icon: "El icono",
  image: "La imagen",
  label: "La etiqueta",
};

/** What a value follows in a declaration. */
const AFTER: Readonly<Record<string, string>> = {
  text: "del texto",
  icon: "del icono",
  image: "de la imagen",
  label: "de la etiqueta",
};

/** The channels of story actions that may not overlap. */
const CHANNELS: Readonly<Record<string, string>> = {
  visibility: "la misma visibilidad",
  highlight: "el mismo resaltado",
  trace: "el mismo recorrido",
  focus: "el mismo foco",
  camera: "la misma cámara",
};

/** The scope of a C4 view after "de" or "del": its path, or "el ámbito" without one. */
const ofScope = (scope: string | null) => (scope === null ? "del ámbito" : `de ${code(scope)}`);

export const es: typeof en = {
  words: {
    tuple: "una tupla",
    list: "una lista",
    spec: {
      oneOf: (values) => `uno de estos valores: ${values.join(", ")}`,
      string: "una cadena entre comillas",
      color: "un color entre comillas",
      colorOrToken: "un color entre comillas o un token de color",
      icon: 'un icono como "tabler:server"',
      timeRange: (min, max) =>
        max !== undefined
          ? `un tiempo de ${num(min)} ms a ${num(max / 1000)} s, como \`1200ms\``
          : `un tiempo de ${num(min)} ms o más, como \`1200ms\``,
      time: "un tiempo como `1200ms`",
      repeatUpTo: (max) => `\`forever\` o un número entero de 1 a ${num(max)}`,
      repeat: "`forever` o un número entero positivo",
      keywordOrNumber: (keywords, min, max) =>
        `${keywords.map(code).join(", ")} o un número de ${num(min)} a ${num(max)}`,
      numberRange: (min, max) => `un número de ${num(min)} a ${num(max)}`,
      size: (min, max) => `\`(width, height)\` con números de ${num(min)} a ${num(max)}`,
      classes: "uno o más ids de clase",
      name: "un nombre",
      names: "uno o más nombres",
      link: "una referencia `<diagram>.<element>`",
      url: 'una URL entre comillas como "https://example.com"',
    },
    noteForm:
      '`note [<id>] over <p>[, <p>] "Text"`, `note [<id>] left of <p> "Text"` o `note [<id>] right of <p> "Text"`',
    chooseForm: '`choose <fragment> "<condition>"` o `choose <fragment> <n>`',
  },

  diagnostics: {
    common: {
      expected: (form) => `Se esperaba ${form}.`,
      singleBlock: (keyword) => `${code(keyword)} admite un solo bloque.`,
      needsOneBlock: (keyword, form) => `${code(keyword)} necesita un bloque: ${form}.`,
      takesNoBlock: (keyword) => `${code(keyword)} no admite bloque.`,
      takesNoBlockExpected: (keyword, form) =>
        `${code(keyword)} no admite bloque; se esperaba ${form}.`,
      doesNotTakeBlock: (keyword) => `${code(keyword)} no admite bloque.`,
      takesNoValue: (keyword) => `${code(keyword)} no admite valor.`,
      expectsString: (name) => `${code(name)} espera una cadena entre comillas.`,
      setMoreThanOnce: (name) => `${code(name)} se asigna más de una vez.`,
      unknownElement: (id) => `Elemento desconocido ${code(id)}.`,
      unknownEntity: (path, model) =>
        `Entidad desconocida ${code(path)} en el modelo ${code(model)}.`,
      unknownPort: (element, port) => `${code(element)} no tiene ningún puerto ${code(port)}.`,
    },

    compile: {
      duplicateTopLevelId: (id) =>
        `${code(id)} ya lo usa otro bloque de nivel superior de este archivo.`,
      unsupportedVersion: (version, supported) =>
        `La versión del lenguaje "${version}" no es compatible; este compilador implementa la versión ${supported}.`,
      unknownDiagramType: (type, types) =>
        `Tipo de diagrama desconocido ${code(type)}; se esperaba uno de estos: ${types.join(", ")}.`,
      viewWithoutModel: "Una vista C4 nombra su modelo: `diagram <id>: c4 using <model> { }`.",
      unknownModel: (name) => `Modelo desconocido ${code(name)}.`,
      tooComplex: (id, count, what, limit) =>
        `${code(id)} tiene ${count} ${COUNTED[what] ?? what}; un diagrama puede tener como máximo ${limit}.`,
      tooLarge: (characters, limit) =>
        `El archivo tiene ${characters} caracteres; un archivo .meltemi puede tener como máximo ${limit}.`,
      linkNamesModel: (link) =>
        `${code(link)} nombra un modelo; un enlace nombra una de sus entidades, como \`link ${link}.<entity>\`.`,
      linkUnknownEntity: (model, path) =>
        `El modelo ${code(model)} no tiene ninguna entidad ${code(path)}.`,
      linkDiagramShape: (diagram) =>
        `Un enlace a un diagrama nombra un elemento: \`link ${diagram}.<element>\`.`,
      linkToItself: (link) =>
        `${code(link)} apunta a este diagrama; los enlaces apuntan a elementos de otros diagramas.`,
      linkUnknownElement: (diagram, element) =>
        `${code(diagram)} no tiene ningún elemento ${code(element)}.`,
      linkNamespace: (namespace) =>
        `${code(namespace)} es un espacio de nombres; escribe \`link ${namespace}.<diagram>.<element>\` o \`link ${namespace}.<model>.<entity>\`.`,
      linkUnknownTarget: (name, link) =>
        `Diagrama o modelo desconocido ${code(name)} en el enlace ${code(link)}.`,
    },

    flow: {
      missingProperty: (label, id, name) => `${label} ${code(id)} necesita ${code(name)}.`,
      relationNotAllowed: (title, from, to) =>
        `Los diagramas ${title} no permiten relaciones de ${code(from)} a ${code(to)}.`,
      imageEmpty: "La ruta de una imagen no puede estar vacía.",
      imageAbsolute: (path) =>
        `Las rutas de las imágenes son relativas al archivo; ${code(path)} es absoluta.`,
      imageUrl: (path) =>
        `Las rutas de las imágenes son archivos del proyecto; ${code(path)} es una URL.`,
      imageBackslash: (path) =>
        `Las rutas de las imágenes usan \`/\` entre carpetas: ${code(path)}.`,
      unknownInGroup: (keyword) => `Instrucción desconocida ${code(keyword)} en un grupo.`,
      unknownInDiagram: (keyword, profile) =>
        `Instrucción desconocida ${code(keyword)} en ${pick(A_PROFILE, profile)}.`,
      quotedSource: (source, id) =>
        `${SOURCES[source] ?? code(source)} de ${code(id)} debe ser una cadena entre comillas.`,
      needsSource: (kind, id, form) =>
        `\`${kind} ${id}\` necesita ${kind === "text" || kind === "note" ? "su texto" : kind === "icon" ? "un icono" : "la ruta de una imagen"}; se esperaba ${form}.`,
      attachSelf: (id) => `Una nota no puede estar unida a sí misma: ${code(id)}.`,
      valueAfter: (after, form) =>
        `Valor inesperado después ${AFTER[after] ?? `de ${code(after)}`}; se esperaba ${form}.`,
      duplicateElement: (id) => `${code(id)} ya está declarado en este diagrama.`,
      builtInPort: (name) => `${code(name)} es un puerto integrado; dale otro nombre al puerto.`,
      portSide: (name, sides) =>
        `El lado del puerto ${code(name)} debe ser uno de estos: ${sides.join(", ")}.`,
      portPosition: "La posición de un puerto es un porcentaje de `0%` a `100%`.",
      unexpectedValue: (form) => `Valor inesperado; se esperaba ${form}.`,
      duplicatePort: (name) => `El puerto ${code(name)} ya está declarado aquí.`,
      setTwiceInGroup: (name) => `${code(name)} se asigna dos veces en este grupo.`,
      relationIdUsedByElement: (id) => `${code(id)} ya lo usa un elemento de este diagrama.`,
      relationIdUsed: (id) => `${code(id)} ya lo usa otra relación.`,
      arrowUnavailable: (arrow, arrows) =>
        `${code(arrow)} no está disponible aquí; escribe ${list("es", arrows.map(code), "disjunction")}.`,
      relationAsEndpoint: (name) =>
        `${code(name)} es una relación, no un elemento; los extremos de una relación deben ser elementos.`,
      setMoreThanOnceInDiagram: (name) =>
        `${code(name)} se asigna más de una vez en este diagrama.`,
      canvasConflict: (name, other) =>
        `${code(name)} no se puede combinar con ${code(other)}; un diagrama tiene un solo lienzo.`,
      layersEmpty: "`layers` necesita uno o más nombres de capa, de atrás hacia adelante.",
      invalidLayer: (arg) => `Capa no válida: ${arg}; se esperaba un nombre.`,
      layerTwice: (name) => `La capa ${code(name)} aparece dos veces.`,
      unknownLayer: (name) => `Capa desconocida ${code(name)}.`,
      placementArguments: "`placement` no admite argumentos.",
      placementBlock: "`placement` necesita un bloque: `placement { ... }`.",
      relationsInPlacement: "No se permiten relaciones dentro de `placement`.",
      declarationsInPlacement: "No se permiten declaraciones dentro de `placement`.",
      unknownPlacement: (keyword) => `Instrucción desconocida ${code(keyword)} en \`placement\`.`,
      noBlock: (keyword, form) => `${code(keyword)} no admite bloque; se esperaba ${form}.`,
      duplicatePlacement: (target, statement) =>
        `${code(target)} ya tiene una instrucción ${code(statement)}.`,
      position: "Se esperaba una posición `(x, y)` con dos números sin unidad.",
      size: "Se esperaba un tamaño `(width, height)` con dos números positivos.",
      viaList: "Se esperaba una lista de puntos después de `via`, como `[(520, 180)]`.",
      waypoint: "Cada punto de paso debe ser un punto `(x, y)` con dos números sin unidad.",
      routeStart: (relation, source, start) =>
        `La ruta de ${code(relation)} debe empezar en ${code(source)}, el origen de la relación, pero empieza en ${code(start)}.`,
      routeEnd: (relation, target, end) =>
        `La ruta de ${code(relation)} debe terminar en ${code(target)}, el destino de la relación, pero termina en ${code(end)}.`,
      endpointShape: (ref) => `Se esperaba \`<element>.<port>\`, pero se encontró ${code(ref)}.`,
      endPosition: (ref, element) =>
        `Una posición va después de un punto cardinal, como ${code(`${element}.east 50%`)}; ${code(ref)} no lo es.`,
      endPositionRange: "La posición del extremo de una ruta es un porcentaje de `0%` a `100%`.",
      alignEdge: (edges) =>
        `\`align\` necesita, después de los elementos, uno de estos lados: ${edges.join(", ")}.`,
      distanceGap:
        "`distance` necesita una separación mínima positiva en píxeles después de los dos elementos.",
      constraintGroup: (id) =>
        `${code(id)} es un grupo; las restricciones se aplican a cajas, notas y marcas.`,
      constraintTwice: (id) => `${code(id)} aparece dos veces en esta restricción.`,
      constraintCount: (kind, exactlyTwo) =>
        `${code(kind)} necesita ${exactlyTwo ? "exactamente dos" : "dos o más"} elementos.`,
      labelPosition: "Se esperaba una posición a lo largo de la ruta en porcentaje, como `50%`.",
      labelOutside: (at) =>
        `La posición de la etiqueta ${code(at)} está fuera del rango de \`0%\` a \`100%\`.`,
      offset: "Se esperaba un desplazamiento `(dx, dy)` con dos números sin unidad.",
      relationNotElement: (name, statement) =>
        `${code(name)} es una relación; ${code(statement)} necesita un elemento.`,
      lineHasPoints: (name, statement) =>
        `${code(name)} es una línea; ${code(statement)} no se aplica a ella.`,
      linePoints:
        "Una línea lleva un punto `(x, y)` tras `from` y tras `to`, y sus quiebres en una lista tras `via`.",
      notForLines: (name, target) => `${code(name)} no se aplica a líneas como ${code(target)}.`,
      elementNotRelation: (name, statement) =>
        `${code(name)} es un elemento; ${code(statement)} necesita una relación.`,
      unknownRelation: (name) => `Relación desconocida ${code(name)}.`,
      notForTargets: (name, relations, target) =>
        `${code(name)} no se aplica a ${relations ? "relaciones" : "elementos"} como ${code(target)}.`,
      effectConflict: (target, effect) =>
        `${code(target)} ya tiene un efecto ${code(effect)} y admite un solo efecto de cada tipo.`,
      alreadySetFor: (name, target) => `${code(name)} ya está asignado para ${code(target)}.`,
      missingEffect: "Un bloque `animate` necesita un `effect`: `flow`, `pulse`, `dash` o `trace`.",
      effectProperty: (name, effects, effect) =>
        `${code(name)} se aplica a los efectos ${list("es", effects.map(code))}, no a ${code(effect)}.`,
      flowTarget:
        "Las partículas recorren relaciones y líneas; nombra la relación (`a -> b as r`) y anímala.",
      traceTarget:
        "Un recorrido avanza por relaciones y líneas; nombra la relación (`a -> b as r`) y anímala.",
      dashOnEvent: "Un trazo en movimiento recorre relaciones y los contornos de las cajas.",
      dashNeedsOutline: (target, kind) =>
        `${code(target)} es ${kind === "note" ? "una nota" : "un texto"} sin contorno; un trazo en movimiento sigue una línea o una caja.`,
      dashWithoutOutline: (target, kind) =>
        `${code(target)} es ${pick(UNOUTLINED, kind)} sin contorno; un trazo en movimiento necesita una línea o una caja.`,
      unknownTarget: (name) => `Elemento o relación desconocidos ${code(name)}.`,
    },

    values: {
      invalidEnum: (arg, name, values) =>
        `Valor no válido para ${code(name)}: ${arg}; se esperaba uno de estos valores: ${values.join(", ")}.`,
      notColorToken: (word) => `${code(word)} no es un token de color.`,
      expects: (name, spec) => `${code(name)} espera ${spec}.`,
      expectsIcon: (name) => `${code(name)} espera una referencia de icono como "tabler:server".`,
      timeUnit: (name) => `${code(name)} necesita una unidad de tiempo.`,
      expectsTime: (name) => `${code(name)} espera un tiempo positivo como \`1200ms\` o \`1.2s\`.`,
      classNoBlock: "Aquí `class` aplica clases y no admite bloque.",
      classEmpty: "`class` necesita uno o más ids de clase.",
      invalidClass: (arg) => `Clase no válida: ${arg}; se esperaba un id de clase.`,
      needsValue: (name, spec) => `${code(name)} necesita ${spec}.`,
      oneValue: (name) => `${code(name)} admite un solo valor; quita el valor de más.`,
      onlyProperties: (owner) => `Solo se permiten propiedades en ${block(owner)}.`,
      unknownProperty: (name, owner) => `Propiedad desconocida ${code(name)} en ${block(owner)}.`,
      freeOnly: (name) => `${code(name)} solo se aplica a las composiciones libres.`,
      shapeNotFor: (kind, target) =>
        `\`shape\` no se aplica a ${kind === "relation" ? "las relaciones" : `los elementos ${code(kind)}`}${target === null ? "" : ` como ${code(target)}`}; se aplica a los elementos \`node\` y \`box\`.`,
      rotationNotFor: (kind, target) =>
        `\`rotation\` no gira los elementos ${code(kind)}${target === null ? "" : ` como ${code(target)}`}; gira los demás elementos de los diagramas de flujo y las composiciones libres.`,
      rotationInProfile: (profile) =>
        `\`rotation\` gira los elementos de los diagramas de flujo y las composiciones libres; ${pick(PROFILES, profile)} dibujan los suyos rectos.`,
      shapeInProfile: (profile) =>
        `\`shape\` se aplica a los elementos \`node\` y \`box\`; ${pick(PROFILES, profile)} dibujan cada tipo con su propia forma.`,
      duplicateClass: (id) => `La clase ${code(id)} ya está declarada aquí.`,
      ruleShape: "Se esperaba `rule <kind> { ... }`.",
      invalidRuleKind: (arg, kinds) =>
        `Tipo de regla no válido: ${arg}; se esperaba uno de estos: ${kinds.join(", ")}.`,
      ruleBlock: (kind) => `\`rule ${kind}\` necesita un bloque.`,
      ruleProfile: (kind, profiles, profile) =>
        profiles.length > 0
          ? `Los elementos ${code(kind)} pertenecen a ${list(
              "es",
              profiles.map((p) => pick(PROFILES, p)),
            )}, no a ${pick(PROFILES, profile)}.`
          : `Los elementos ${code(kind)} no pertenecen a ${pick(PROFILES, profile)}.`,
      ruleNotFor: (name, kind) =>
        `${code(name)} no se aplica a ${kind === "relation" ? "las relaciones" : `los elementos ${code(kind)}`}.`,
      ruleAlreadySet: (name, kind) => `Otra regla ya asigna ${code(name)} para ${code(kind)}.`,
    },

    theme: {
      onlyTokens: "Solo se permiten tokens, clases y reglas en un bloque de tema.",
      unknownToken: (name) => `Token de tema desconocido ${code(name)}.`,
      unknownBase: (id, base) =>
        `El tema ${code(id)} extiende "${base}", que no es un tema integrado ni está definido en este archivo.`,
      cycle: (id) => `El tema ${code(id)} hereda de sí mismo a través de \`extends\`.`,
    },

    c4: {
      notDrawn: (path) => `${code(path)} no se dibuja en esta vista.`,
      invalidLevel: "Se esperaba `level context`, `level container` o `level component`.",
      missingLevel: "Una vista C4 necesita `level context`, `level container` o `level component`.",
      listTwice: (which) =>
        `${code(which)} se escribe más de una vez; lista todas las entidades en una sola instrucción.`,
      listShape: (which) => `Se esperaba \`${which} <entity>, <entity>...\`.`,
      listByPath: (which) => `${code(which)} lista entidades por su ruta, como \`shop.api\`.`,
      listedTwice: (path, which) => `${code(path)} aparece dos veces en ${code(which)}.`,
      scopeIncluded: (path, level) =>
        `${code(path)} es el ámbito de esta vista; se dibuja como el límite de sus ${level === "container" ? "contenedores" : "componentes"}.`,
      outOfLevel: (level, kind, path) =>
        `Una vista ${pick(LEVELS, level)} no dibuja ${entity(kind).the} ${code(path)}.`,
      viewDeclares: "Las vistas dibujan las entidades del modelo; no declaran ninguna.",
      unknownInView: (keyword) => `Instrucción desconocida ${code(keyword)} en una vista C4.`,
      scopeRequired: (level) =>
        `Una vista ${pick(LEVELS, level)} necesita un ámbito: ${level === "container" ? "el sistema" : "el contenedor"} que abre.`,
      scopeShape: "Se esperaba `scope <entity>`, como `scope shop`.",
      datastoreScope: (path) =>
        `${code(path)} es un almacén de datos; los almacenes de datos no tienen componentes.`,
      invalidScope: (level, expected, path, kind) =>
        `El ámbito de una vista ${pick(LEVELS, level)} es ${entity(expected).a}; ${code(path)} es ${entity(kind).a}.`,
      alreadyCombined: (from, to) => `Otra relación de esta vista ya combina \`${from} -> ${to}\`.`,
      relationIdUsed: (id) => `${code(id)} ya lo usa una relación del modelo o de esta vista.`,
      unsupportedRelation: (from, to) =>
        `Ninguna relación del modelo va de ${code(from)} a ${code(to)}; una vista no dibuja flechas por conveniencia.`,
      labelShape:
        'Se esperaba `label <entity-or-relation> "Text"`; en `placement`, `label <relation> at <n>%` mueve una etiqueta.',
      labelTwice: (path) => `${code(path)} ya tiene una etiqueta local.`,
    },

    model: {
      brackets: "Las entidades del modelo se declaran con su tipo, no con corchetes.",
      unknownStatement: (keyword, parent) =>
        `Instrucción desconocida ${code(keyword)} en ${parent ? `${entity(parent.kind).the} ${code(parent.path)}` : "un modelo"}.`,
      invalidNesting: (kind, parent) =>
        `No se puede declarar ${entity(kind).a} ${parent ? `en ${entity(parent.kind).the} ${code(parent.path)}` : "en la raíz del modelo"}; ${entity(kind).many} van ${HOMES[kind] ?? ""}.`,
      duplicateEntity: (path) => `La entidad ${code(path)} ya está declarada en este modelo.`,
      external: "`external` marca personas y sistemas ajenos a la organización.",
      quotedExample: (word) =>
        `${code(word)} espera una cadena entre comillas, como \`${word} "${word === "technology" ? "PostgreSQL" : word === "url" ? "https://example.com" : "Qué hace"}"\`.`,
      url: "`url` admite una URL `https:`, `http:` o `mailto:`, o una relativa.",
      arrow: "Las relaciones del modelo se escriben con `->`.",
      selfRelation: (from) =>
        `Una relación de ${code(from)} consigo misma no dice nada en un modelo.`,
      nestedRelation: (from, to) =>
        `${code(from)} y ${code(to)} están anidadas una en otra; una relación conecta entidades separadas.`,
      relationIdUsed: (id) => `${code(id)} ya lo usa otra relación del modelo.`,
      unknownInRelation: (word) =>
        `Instrucción desconocida ${code(word)} en una relación del modelo.`,
    },

    sequence: {
      groupHoldsParticipants:
        "Los grupos de participantes contienen declaraciones de participantes; los eventos van en el nivel del diagrama o en fragmentos.",
      groupEnd: (end) =>
        `${code(end)} es un grupo de participantes; los mensajes van entre participantes.`,
      idUsed: (name) => `${code(name)} ya se usa en este diagrama.`,
      unknownParticipant: (id) => `Participante desconocido ${code(id)}.`,
      participantGroup: (id) => `${code(id)} es un grupo de participantes.`,
      participantsAtTop:
        "Los participantes se declaran en el nivel del diagrama, no dentro de fragmentos.",
      unknownInFragment: (keyword) => `Instrucción desconocida ${code(keyword)} en un fragmento.`,
      returnOutsideCall:
        "`return` responde a una llamada: escríbelo dentro del bloque de la llamada.",
      afterReturn: (call) => `\`${call}\` ya respondió; mueve este evento antes del \`return\`.`,
      activeForCall: (participant, call) =>
        `\`${participant}\` está activo durante la llamada \`${call}\`; su barra termina con el bloque.`,
      divider: 'Se esperaba `divider "Label"`.',
      delay: 'Se esperaba `delay` o `delay "Label"`.',
      noteSide: (position) => `Se esperaba \`${position} of <participant>\`.`,
      noteText: (form) => `Una nota necesita su texto; se esperaba ${form}.`,
      noteParticipant: (form) => `Una nota necesita un participante; se esperaba ${form}.`,
      oneParticipant: (position) => `\`${position} of\` admite un solo participante.`,
      invalidParticipant: (arg) => `Participante no válido: ${arg}.`,
      branchKeyword: (operator, branch, written) =>
        `${code(operator)} continúa con ${code(branch)}, no con ${code(written)}.`,
      needsBlock: (keyword) => `${code(keyword)} necesita un bloque.`,
      destroyedBeforeMessage: (participant) =>
        `${code(participant)} se destruyó antes de este mensaje.`,
      destroyedBeforeEvent: (participant) =>
        `${code(participant)} se destruyó antes de este evento.`,
      destroyedBeforeNote: (participant) => `${code(participant)} se destruyó antes de esta nota.`,
      createdTwice: (participant) => `${code(participant)} se crea dos veces.`,
      createAfterUse: (participant) =>
        `${code(participant)} ya participó en la secuencia; \`create\` va antes de su primer evento.`,
      destroyedTwice: (participant) => `${code(participant)} se destruye dos veces.`,
      notActive: (participant) => `${code(participant)} no está activo aquí.`,
      placementStatement: (keyword) =>
        `${code(keyword)} no se aplica a los diagramas de secuencia.`,
      pixels: (form) => `Se esperaba ${form} con un número de píxeles, 0 o más.`,
      signedPixels: (form) => `Se esperaba ${form} con un número de píxeles.`,
      side: (form) => `Se esperaba ${form}: el lado es \`before\` o \`after\`.`,
      outerGap: (participant, side) =>
        side === "before"
          ? `\`${participant}\` es el primer participante: un espacio antes de él es 0 o más.`
          : `\`${participant}\` es el último participante: un espacio después de él es 0 o más.`,
      unknownEvent: (id) => `Evento desconocido ${code(id)}.`,
      duplicateScenario: (id) => `El escenario ${code(id)} ya está declarado.`,
      scenarioStatements: "Los escenarios contienen `choose`, `repeat`, `skip` y `take`.",
      decidedTwice: (fragment) => `${code(fragment)} ya se decide en este escenario.`,
      unknownFragment: (id) => `Fragmento desconocido ${code(id)}.`,
      choiceOperator: (kind, operator, id, operators) =>
        `${code(kind)} no se aplica al fragmento ${code(operator)} ${code(id)}; decide los fragmentos ${list("es", operators.map(code))}.`,
      noBranch: (id, condition) => `${code(id)} no tiene ninguna rama "${condition}".`,
      branchCount: (id, count) =>
        `${code(id)} tiene ${count} ${plural("es", count, { one: "rama", other: "ramas" })}; elige de 1 a ${count}.`,
      loopCount: "Un bucle se repite de 1 a 100 veces en un escenario.",
    },

    story: {
      unknownDiagram: (name) =>
        `No hay ningún diagrama ${code(name)} sobre el que contar una historia.`,
      namesDiagram: "Una historia nombra su diagrama: `story <id> for <diagram> { }`.",
      time: (keyword) => `${code(keyword)} admite un tiempo de \`0ms\` a \`600s\`, como \`800ms\`.`,
      contents: "Una historia contiene `title`, `description` y bloques `scene`.",
      notStoryStatement: (word) =>
        `${code(word)} no es una instrucción de historia; una historia contiene \`title\`, \`description\` y bloques \`scene\`.`,
      sceneShape: 'Una escena es `scene <id> ["Title"] { … }`.',
      duplicateScene: (id) => `La historia ya tiene una escena ${code(id)}.`,
      sceneContents: "Una escena contiene `view`, `transition` y acciones.",
      viewFirst: "`view <diagram>` va primero en una escena y nombra un diagrama.",
      transitionFirst:
        "`transition cut|fade|morph [over <time>]` va antes de las acciones de la escena, una sola vez.",
      notAction: (word) => `${code(word)} no es una acción de historia.`,
      missingTransition: (view) =>
        `La escena cambia a ${code(view)}; indica cómo con \`transition cut\`, \`fade\` o \`morph\`.`,
      emptyScene: (id) => `La escena ${code(id)} no tiene acciones y no dura nada.`,
      afterOver: "Nada puede seguir al tiempo de `over`.",
      hold: "`hold` admite un tiempo, como `hold 1s`.",
      parallel: "`parallel { … }` contiene acciones que empiezan a la vez.",
      namesTargets: (kind) =>
        `${code(kind)} nombra aquello sobre lo que actúa, como \`${kind} api\`.`,
      traceOne: "`trace` sigue una sola relación; usa `parallel` para recorrer varias.",
      ids: (kind) => `${code(kind)} admite ids separados por comas.`,
      unknownTarget: (view, id) =>
        `${code(view)} no tiene ningún elemento ni relación con nombre ${code(id)}.`,
      traceTarget: (id, element) =>
        `\`trace\` sigue una relación; ${code(id)} es ${element ? "un elemento" : "una nota o un fragmento"}.`,
      conflict: (action, channel, target) =>
        `${code(action)} se superpone a una acción anterior sobre ${CHANNELS[channel] ?? code(channel)} de ${code(target)}.`,
    },

    export: {
      namesTarget: "Un perfil nombra lo que exporta: `export <id> for <diagram-or-story> { }`.",
      unknownTarget: (name) => `No hay ningún diagrama ni historia ${code(name)} que exportar.`,
      options: "Un perfil de exportación contiene opciones como `format png`.",
      notOption: (name) => `${code(name)} no es una opción de los perfiles de exportación.`,
      oneValue: (name) => `${code(name)} admite un solo valor.`,
      fps: "`fps` admite un número entero de 1 a 60.",
      file: "`file` admite una ruta relativa a este archivo, dentro de su carpeta, con `/` entre carpetas.",
      missingFormat: (id, formats) =>
        `El perfil ${code(id)} necesita un \`format\`: ${formats.join(", ")}.`,
      notForFormat: (name, format, formats) =>
        `${code(name)} no se aplica a las exportaciones ${format}; se aplica a ${formats.join(", ")}.`,
      atWithMotion: "`at` escribe un solo fotograma; no va con `motion animated`.",
      extension: (format, extension) =>
        `\`file\` de una exportación ${format} termina en \`.${extension}\`.`,
      storyMotion:
        "La exportación de una historia dibuja sus fotogramas; `motion` se aplica a los diagramas.",
      storyScenario:
        "Una historia muestra sus propias vistas; `scenario` se aplica a los diagramas de secuencia.",
      atPastEnd: (duration) =>
        `La historia dura ${num(duration)} ms; \`at\` debe estar dentro de ese tiempo.`,
      unknownScenario: (target, scenario, scenarios) =>
        `${code(target)} no tiene ningún escenario ${code(scenario)}; sus escenarios: ${scenarios.join(", ")}.`,
      noScenarios: (target) => `${code(target)} no tiene escenarios.`,
    },
  },

  hints: {
    example: (sample) => `Ejemplo: ${code(sample)}.`,
    didYouMean: (candidates) => `¿Quisiste decir ${candidates.map(code).join(", ")}?`,

    compile: {
      version: (supported) => `Cambia el encabezado a \`language "${supported}"\`.`,
      declareModel:
        "Declara `model <id> { … }` en este archivo o importa el archivo que lo declara.",
      models: (local, imported, namespaces) =>
        `Modelos: ${[...local, ...imported.map((b) => `${b} (importado)`), ...namespaces.map((n) => `${n}.<model>`)].join(", ")}.`,
      splitDiagram:
        "Divídelo en varios diagramas; las vistas de un modelo pueden compartir sus entidades.",
      splitFile: "Divídelo en varios archivos que se importen entre sí.",
      elementsOf: (diagram, ids) => `Elementos de ${code(diagram)}: ${ids.join(", ")}.`,
      diagramsAndModels: (names) => `Diagramas y modelos de este archivo: ${names.join(", ")}.`,
      linkTargets:
        "Enlaza a un diagrama o a un modelo de este archivo, o de un archivo que importes.",
    },

    flow: {
      requiredProperty: (title, name, kind) =>
        `Los diagramas ${title} exigen ${code(name)} en cada ${code(kind)}.`,
      allowedRelations: (pairs) => `Permitidas: ${pairs.join(", ") || "ninguna"}.`,
      imagePath: 'Escribe una ruta relativa a este archivo dentro del proyecto, como "logo.png".',
      diagramLevel: (keyword) =>
        `${code(keyword)} va en el nivel del diagrama, no dentro de un grupo.`,
      groupContents:
        "Los grupos contienen declaraciones de elementos, relaciones, grupos anidados, `description` y `url`.",
      declareElement: (keyword, box) =>
        `Declara un elemento con \`${keyword}["Label"]\` o \`${box} ${keyword}\`.`,
      freeStatements:
        "Las composiciones libres aceptan declaraciones `box`, `text`, `icon`, `image`, `line` y `group`, relaciones, `direction`, `layout`, `theme`, `title`, `description`, `preset`, `canvas`, `routing`, `layers`, `placement`, `style`, `animate`, `class` y `rule`.",
      flowStatements:
        "Los diagramas de flujo aceptan declaraciones de elementos, relaciones, `direction`, `layout`, `theme`, `title`, `description`, `preset`, `canvas`, `routing`, `placement`, `style`, `animate`, `class` y `rule`.",
      freeDeclarations:
        "Las composiciones libres declaran `box`, `text`, `icon`, `image`, `note`, `line` y `group`.",
      attachTarget: (note) =>
        `Une ${code(note)} a un elemento de este diagrama: \`note ${note} "Texto" on <element>\`.`,
      flowDeclarations: (keyword) =>
        `Los diagramas de flujo declaran \`node\`, \`decision\`, \`data\`, \`group\`, \`note\` y \`tag\`; ${code(keyword)} pertenece a las composiciones libres.`,
      sharedNamespace:
        "Los elementos y las relaciones comparten un espacio de nombres por diagrama.",
      elementBlock: (words) => `Los bloques de elemento aceptan ${list("es", words.map(code))}.`,
      relationBlock: (words) => `Los bloques de relación aceptan ${list("es", words.map(code))}.`,
      compassPorts:
        "Los puertos cardinales (`north`, `south`, `east`, `west`) y `auto` no necesitan declaración.",
      oneCanvas: "Conserva solo `preset` o solo `canvas (width, height)`.",
      qualifiedEndpoint:
        "Las referencias calificadas no están disponibles en los diagramas de flujo; usa el id del elemento. Los puertos van en las instrucciones `route`.",
      layers: (layers) => `Capas: ${layers.join(", ")}.`,
      declareLayer: (layers) => `Declárala con \`layers ${layers.join(", ")}\`.`,
      placementAccepts: (statements) =>
        `Un bloque \`placement\` acepta ${statements.map(code).join(", ")}.`,
      ports: (element, ports) => `Puertos de ${code(element)}: ${ports.join(", ")}.`,
      constraintElements: "Las restricciones se aplican a elementos declarados en este diagrama.",
      dashOutline:
        "Dale un `fill`, un `stroke` o un `pattern` en un `style`, una clase o una `rule` de este diagrama, o usa un pulso.",
      form: (form) => `Forma: ${form}.`,
      linePointsWritten:
        "Los puntos de una línea se escriben en su instrucción: `line <id> from (x, y) to (x, y)`.",
      declareFirst: (name) => `Decláralo primero, por ejemplo \`${name}["Label"]\`.`,
      nameRelation:
        "Las relaciones anónimas necesitan `as <id>` para poder nombrarlas, por ejemplo `a -> b as save`.",
      styleAccepts: (words) => `Los bloques \`style\` aceptan ${words.map(code).join(", ")}.`,
      animateAccepts: "Los bloques `animate` aceptan `effect`, `duration` y `repeat`.",
      mergeEffects: "Quita una de las instrucciones o junta sus propiedades en una sola.",
      styleTargets: (kind) =>
        `${code(kind)} se aplica a un elemento o a una relación nombrada con \`as <id>\`.`,
    },

    values: {
      colorTokens: (tokens) => `Tokens de color: ${tokens.join(", ")}.`,
      cssColor: (name, word) => `Escribe \`${name} "${word}"\` para un color CSS.`,
      colorOrToken: (name) => `Ejemplo: \`${name} "#1f6feb"\` o \`${name} accent\`.`,
      iconForm: 'Los iconos se escriben como "<pack>:<name>".',
      timeUnit: "Agrega `ms` o `s`, por ejemplo `1200ms` o `1.2s`.",
      link: "Ejemplo: `link checkout.api`, o `link shop.checkout.api` a través de una importación con espacio de nombres.",
      url: "Los enlaces pueden usar `https:`, `http:` o `mailto:`, o ser relativos al archivo exportado.",
      declareClasses:
        "Declara las clases en el nivel superior de un diagrama o en un bloque de tema.",
      appliesToElements: (name) => `${code(name)} se aplica a elementos.`,
      appliesToRelations: (name) => `${code(name)} se aplica a relaciones.`,
      classesCannotApply:
        "Las clases no pueden aplicar otras clases; lista cada clase donde se use.",
      styleProperties: (names) => `Las clases y las reglas aceptan ${names.map(code).join(", ")}.`,
      freeProperties:
        "Los diagramas de flujo y de secuencia y las vistas C4 escriben el texto con la escala tipográfica del tema; las composiciones libres eligen su tamaño, su peso y su alineación.",
      applyClasses: "Aplica las clases dentro de bloques de elemento, de relación o `style`.",
      kinds: (kinds) => `Tipos: ${kinds.join(", ")}.`,
    },

    theme: {
      tokens: (tokens) =>
        `Tokens de tema: ${tokens.join(", ")}; los bloques de tema también aceptan \`class <id> { }\` y \`rule <kind> { }\`.`,
      builtIn: (themes) => `Temas integrados: ${themes.join(", ")}.`,
      cycle: "Haz que un tema de la cadena extienda un tema integrado.",
    },

    c4: {
      entityPath: "Las entidades se nombran por su ruta desde la raíz del modelo, como `shop.api`.",
      ports: (ports) => `Puertos: ${ports.join(", ")}.`,
      routeEnds:
        "Los extremos de una ruta son entidades de la vista, con un puerto opcional: `shop.api.east`.",
      nameEntity: "Nombra una entidad de la vista por su ruta, como `shop.api`.",
      include: (path) => `Agrégala con \`include ${path}\` o quítala de \`exclude\`.`,
      notAtLevel: (path, kind, level) =>
        `${code(path)} es ${entity(kind).a}, que una vista ${pick(LEVELS, level)} no dibuja.`,
      removeScope: (path) => `Quita ${code(path)} de \`include\`.`,
      contextLevel: "Las vistas de contexto dibujan personas y sistemas de software.",
      containerLevel: (scope) =>
        `Las vistas de contenedores dibujan los contenedores y almacenes de datos ${ofScope(scope)}, personas y otros sistemas.`,
      componentLevel: (scope) =>
        `Las vistas de componentes dibujan los componentes ${ofScope(scope)}, los demás contenedores de su sistema, personas y otros sistemas.`,
      declareInModel: (id, model) =>
        `Declara la entidad ${code(id)} en el modelo ${code(model)} y lístala en \`include\`.`,
      entitiesInModel: (model) =>
        `Las entidades se declaran en el modelo ${code(model)}; una vista las lista en \`include\`.`,
      viewStatements:
        "Las vistas C4 aceptan `level`, `scope`, `include`, `exclude`, `label`, relaciones que combinan relaciones del modelo, `direction`, `layout`, `routing`, `theme`, `title`, `description`, `preset`, `canvas`, `placement`, `style`, `animate`, `class` y `rule`.",
      addLevel: "Agrega `level container` y `scope <system>` para una vista de contenedores.",
      systemScope: "Agrega `scope <system>`, como `scope shop`.",
      containerScope: "Agrega `scope <container>`, como `scope shop.api`.",
      addToModel: "Agrega la relación al modelo o quita esta.",
      localLabel: "Una etiqueta local nombra una entidad o una relación dibujada en esta vista.",
    },

    model: {
      kindNotBrackets: (id) => `Escribe \`container ${id} "Label"\` u otro tipo de entidad.`,
      blockAccepts: (kind, words) =>
        `Los bloques ${entity(kind).of} aceptan ${list("es", [...words.map(code), "relaciones"])}.`,
      modelAccepts:
        "Los modelos declaran entidades `person` y `system`, con contenedores, almacenes de datos y componentes dentro, y relaciones `a -> b`.",
      canDeclare: (kinds) => `Aquí puedes declarar ${list("es", kinds.map(code))}.`,
      holdsNothing: (kind) => {
        const a = entity(kind).a;
        return `${a[0]!.toUpperCase()}${a.slice(1)} no contiene entidades.`;
      },
      declareEntity:
        'Declara la entidad primero en el modelo, como `container api "API"` dentro de un sistema.',
      dashed:
        "Las respuestas y las líneas discontinuas pertenecen a los diagramas de secuencia y de flujo.",
      relationAccepts:
        "Las relaciones del modelo aceptan `technology`, `description` y `assumption`.",
    },

    sequence: {
      otherDeclaration: (keyword, profile, kinds) =>
        `${code(keyword)} pertenece a ${pick(PROFILES, profile)}. Los diagramas de secuencia declaran ${kinds.map(code).join(", ")} y \`group\`.`,
      statements:
        "Los diagramas de secuencia aceptan participantes, `group`, mensajes, `activate`, `deactivate`, `create`, `destroy`, `note`, los fragmentos `alt`, `opt`, `loop`, `par`, `break`, `critical` y `region`, `divider`, `delay`, `title`, `description`, `theme`, `preset`, `canvas`, `autonumber`, `placement`, `style`, `animate`, `class`, `rule` y `scenario`.",
      sharedNamespace:
        "Los elementos, las relaciones, las notas y los fragmentos comparten un espacio de nombres por diagrama.",
      declareParticipant: (id) => `Decláralo primero, por ejemplo \`participant ${id} "${id}"\`.`,
      fragmentContents:
        "Los fragmentos contienen mensajes, los demás eventos y fragmentos anidados.",
      returnInCall: 'Escríbelo dentro del bloque de la llamada: `a -> b: "Pagar" { return "OK" }`.',
      activate: (participant) =>
        `Agrega \`activate ${participant}\` antes o quita este \`deactivate\`.`,
      placement:
        "Los diagramas de secuencia mantienen el orden de los eventos: usa `space <event> <n>`, `gap <participant> <n>` y `label <message> at <n>% offset (dx, dy)`.",
      outerGap: (participant) =>
        `No queda nada de \`${participant}\` que acercar; un espacio en el lado exterior es 0 o más.`,
      spaceTarget:
        '`space` nombra un mensaje con `as <id>`, o una nota o un fragmento con id, como `alt check "OK" { }`.',
      namedFragments: (fragments) =>
        `Fragmentos con nombre: ${fragments.map((f) => `${code(f.id)} (${f.operator})`).join(", ")}.`,
      nameFragment: 'Nombra un fragmento para decidirlo, como `alt check "Approved" { }`.',
      branches: (conditions) => `Ramas: ${conditions.map((c) => `"${c}"`).join(", ")}.`,
    },

    story: {
      diagrams: (names) => `Diagramas: ${names.join(", ")}.`,
      declareDiagram: "Declara un diagrama o importa uno.",
      actionsInScene: "Las acciones como `reveal` van dentro de `scene <id> { … }`.",
      actions: "Acciones: reveal, hide, highlight, focus, camera, trace, hold y parallel.",
      transition:
        "Un cambio de composición entre escenas necesita una transición explícita, que relaciona los elementos por id.",
      conflict:
        "Dos acciones sobre una misma propiedad de un elemento no deben ejecutarse a la vez; saca una del bloque `parallel`.",
    },

    export: {
      targets: (names) => `Diagramas e historias: ${names.join(", ")}.`,
      declareTarget: "Declara un diagrama o una historia.",
      options: (names) => `Opciones: ${names.join(", ")}.`,
      background: "`background transparent`, un color entre comillas o un token de color.",
    },
  },

  related: {
    firstUsed: "Se usó por primera vez aquí.",
    firstDeclared: "Se declaró por primera vez aquí.",
    firstSet: "Se asignó por primera vez aquí.",
    firstOne: "Aquí está la primera.",
    elementDeclared: "El elemento se declaró aquí.",
    firstEffect: "El primer efecto.",
    firstWritten: "Se escribió por primera vez aquí.",
    firstDecided: "Se decidió por primera vez aquí.",
    firstScene: "La primera escena.",
    earlierAction: "La acción anterior.",
  },

  problems: {
    notObject: "Un tipo de diagrama debe ser un objeto.",
    where: (type) => `tipo de diagrama ${code(type)}`,
    kindWhere: (where, kind) => `${where}, tipo ${code(kind)}`,
    relationsWhere: (where) => `${where}, relaciones`,
    styleObject: (where) => `${where}: el estilo debe ser un objeto.`,
    styleWords: (where, name, words) => `${where}: ${code(name)} admite ${words.join(", ")}.`,
    styleColor: (where, name) =>
      `${where}: ${code(name)} admite un token de color como "@accent" o un color CSS.`,
    styleNumber: (where, name) => `${where}: ${code(name)} admite un número dentro del rango.`,
    styleIcon: (where) => `${where}: \`icon\` admite una referencia como "tabler:table".`,
    styleUnknown: (where, name) => `${where}: propiedad de estilo desconocida ${code(name)}.`,
    propertiesObject: (where) => `${where}: \`properties\` debe ser un objeto.`,
    propertyName: (where, name) => `${where}: ${code(name)} no puede nombrar una propiedad.`,
    propertyKind: (where, name) =>
      `${where}: la propiedad ${code(name)} admite "string", "number", "boolean" o { "kind": "enum", "values": [...] }.`,
    enumValues: (where, name) => `${where}: la propiedad enum ${code(name)} necesita "values".`,
    typeWord: (where) =>
      `${where}: \`type\` debe ser una palabra en minúsculas que no sea una palabra del lenguaje.`,
    layoutValue: (where, key, values) =>
      `${where}: ${code(key)} de \`layout\` admite ${values.join(", ")}.`,
    noKinds: (where) => `${where}: \`elements\` debe nombrar al menos un tipo.`,
    kindWord: (where) =>
      `${where}: un tipo debe ser una palabra en minúsculas que no sea una palabra del lenguaje.`,
    requiredUndeclared: (where, name) =>
      `${where}: la propiedad obligatoria ${code(name)} no está declarada.`,
    allowedPairs: (where) =>
      `${where}: \`allowed\` de las relaciones debe ser una lista de pares [from, to].`,
    unknownPair: (where, pair) =>
      `${where}: el par de relación ${pair} nombra un tipo desconocido.`,
    unknownTool: (where, kind) => `${where}: herramienta para un tipo desconocido ${code(kind)}.`,
  },
};

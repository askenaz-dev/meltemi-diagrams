import { catalog, list } from "@meltemi/diagrams-i18n";
import type { ChangedPart, ChangeState, ChangeSubject, ScheduleCause } from "../diff.js";

const en = {
  /** What changed, as `describeChange` names it. */
  subjects: {
    diagram: "diagram",
    element: "element",
    relation: "relation",
    model: "model",
    entity: "entity",
    story: "story",
    scene: "scene",
    theme: "theme",
    export: "export",
  } satisfies Record<ChangeSubject, string>,
  /** A value that is not written. */
  none: "none",
  /**
   * The names of fields that are not keywords of the language; keywords such as `label` or
   * `layout` are written as they are in every language.
   */
  fields: {
    kind: "kind",
    type: "type",
    classes: "classes",
    view: "view",
    end: "end",
    status: "status",
  } as Readonly<Record<string, string>>,
  /** Parts that changed without details. */
  changed: {
    description: "description changed",
    style: "style changed",
    effects: "effects changed",
    canvas: "canvas changed",
    layers: "layers changed",
    includedEntities: "included entities changed",
    constraints: "constraints changed",
    transition: "transition changed",
    actions: "actions changed",
    assumption: "assumption changed",
    ends: "ends changed",
    heads: "heads changed",
    tags: "tags changed",
  } satisfies Record<ChangedPart, string>,
  /** New states. */
  states: {
    external: "now external",
    notExternal: "no longer external",
    placed: "placed",
    unplaced: "unplaced",
    moved: "moved",
    resized: "resized",
    twoWay: "now two-way",
    oneWay: "now one-way",
    async: "now asynchronous",
    sync: "now synchronous",
    confirmed: "confirmed",
    assumed: "now an assumption",
    rerouted: "rerouted",
    labelMoved: "label moved",
    messagesReordered: "messages reordered",
    scenesReordered: "scenes reordered",
    critical: "now critical",
    notCritical: "no longer critical",
  } satisfies Record<ChangeState, string>,
  movedOutOf: (group: string) => `moved out of ${group}`,
  movedInto: (parent: string) => `moved into ${parent}`,
  movedToRoot: "moved to the model's root",
  scenario: (id: string, added: boolean) => `scenario ${id} ${added ? "added" : "removed"}`,
  duration: (before: number, after: number) => `duration ${before} ms → ${after} ms`,
  /** Gantt charts: the resolved dates of a task, milestone or marker. */
  schedule: { start: "starts", end: "ends", date: "date" } as Readonly<
    Record<"start" | "end" | "date", string>
  >,
  /** What moved a task: a task whose own clauses changed, the calendar or the order of the tasks. */
  cause: (cause: ScheduleCause) =>
    cause.kind === "task"
      ? cause.id
      : cause.kind === "calendar"
        ? "the calendar"
        : "the order of the tasks",
  /** Words joined as prose: `a`, `a and b`, `a, b and c`. */
  and: (words: readonly string[]) =>
    words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`,
  /** The causes of a move, after its dates: `(moved by tec0)`. */
  movedBy: (causes: string) => `moved by ${causes}`,
};

const es: typeof en = {
  subjects: {
    diagram: "diagrama",
    element: "elemento",
    relation: "relación",
    model: "modelo",
    entity: "entidad",
    story: "historia",
    scene: "escena",
    theme: "tema",
    export: "perfil de exportación",
  },
  none: "ninguno",
  fields: {
    kind: "tipo",
    type: "tipo",
    classes: "clases",
    view: "vista",
    end: "fin",
    status: "estado",
  },
  changed: {
    description: "cambió la descripción",
    style: "cambió el estilo",
    effects: "cambiaron los efectos",
    canvas: "cambió el lienzo",
    layers: "cambiaron las capas",
    includedEntities: "cambiaron las entidades incluidas",
    constraints: "cambiaron las restricciones",
    transition: "cambió la transición",
    actions: "cambiaron las acciones",
    assumption: "cambió la suposición",
    ends: "cambiaron los extremos",
    heads: "cambiaron las puntas",
    tags: "cambiaron las marcas",
  },
  states: {
    external: "ahora es externo",
    notExternal: "ya no es externo",
    placed: "colocado",
    unplaced: "sin colocar",
    moved: "movido",
    resized: "redimensionado",
    twoWay: "ahora en ambos sentidos",
    oneWay: "ahora en un sentido",
    async: "ahora asíncrono",
    sync: "ahora síncrono",
    confirmed: "confirmado",
    assumed: "ahora es una suposición",
    rerouted: "con otra ruta",
    labelMoved: "etiqueta movida",
    messagesReordered: "mensajes reordenados",
    scenesReordered: "escenas reordenadas",
    critical: "ahora es crítico",
    notCritical: "ya no es crítico",
  },
  movedOutOf: (group: string) => `sacado de ${group}`,
  movedInto: (parent: string) => `movido a ${parent}`,
  movedToRoot: "movido a la raíz del modelo",
  scenario: (id: string, added: boolean) => `escenario ${id} ${added ? "agregado" : "quitado"}`,
  duration: (before: number, after: number) => `duración ${before} ms → ${after} ms`,
  schedule: { start: "empieza", end: "termina", date: "fecha" },
  cause: (cause: ScheduleCause) =>
    cause.kind === "task"
      ? `de ${cause.id}`
      : cause.kind === "calendar"
        ? "del calendario"
        : "del orden de las tareas",
  and: (words: readonly string[]) => list("es", words),
  movedBy: (causes: string) => `a causa ${causes}`,
};

/**
 * The words of `describeChange`: what changed between two versions, in a language. Reviews pass
 * the language of the report; terminals the interface language.
 */
export const changeMessages = catalog(en, es);

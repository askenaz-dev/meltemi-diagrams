import type {
  FlowDiagram,
  FragmentEvent,
  ScenarioChoice,
  SequenceEvent,
  SequenceScenario,
} from "./types.js";

/** The decisions of a scenario by fragment key. */
type Decisions = ReadonlyMap<string, ScenarioChoice>;

/**
 * The events of one path through a sequence diagram (decision 0019). Alternatives and critical
 * regions keep their chosen branch, options and breaks are taken or skipped, and loops become their
 * body repeated, each repetition framed `[c] k/n`. Undecided fragments take their first branch,
 * one iteration and are taken. Message keys of repetitions after the first end in `@k`.
 */
export function resolveScenario(
  diagram: FlowDiagram,
  scenarioId: string,
): readonly SequenceEvent[] | undefined {
  const scenario = diagram.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return undefined;
  return resolveEvents(diagram.events, decisionsOf(scenario), "");
}

function decisionsOf(scenario: SequenceScenario): Decisions {
  return new Map(scenario.choices.map((choice) => [choice.fragment, choice]));
}

function suffixed(key: string, suffix: string): string {
  return suffix === "" ? key : `${key}${suffix}`;
}

function resolveEvents(
  events: readonly SequenceEvent[],
  decisions: Decisions,
  suffix: string,
): SequenceEvent[] {
  const out: SequenceEvent[] = [];
  for (const event of events) {
    if (event.kind !== "fragment") {
      out.push(suffix === "" ? event : { ...event, key: suffixed(event.key, suffix) });
      continue;
    }
    out.push(...resolveFragment(event, decisions, suffix));
  }
  return out;
}

function resolveFragment(
  fragment: FragmentEvent,
  decisions: Decisions,
  suffix: string,
): SequenceEvent[] {
  const choice = decisions.get(fragment.id ?? "");
  switch (fragment.operator) {
    case "alt":
    case "critical": {
      const branch = fragment.branches[choice?.branch ?? 0] ?? fragment.branches[0]!;
      return resolveEvents(branch.events, decisions, suffix);
    }
    case "opt":
    case "break":
      if (choice?.kind === "skip") return [];
      return resolveEvents(fragment.branches[0]!.events, decisions, suffix);
    case "loop": {
      const iterations = choice?.iterations ?? 1;
      const body = fragment.branches[0]!;
      const repeated: SequenceEvent[] = [];
      for (let k = 1; k <= iterations; k++) {
        const inner = k === 1 ? suffix : `${suffix}@${k}`;
        // One pass keeps the written condition; repeated passes are numbered.
        const label =
          iterations === 1
            ? body.condition
            : `${body.condition ? `${body.condition} ` : ""}${k}/${iterations}`;
        repeated.push({
          ...fragment,
          key: suffixed(fragment.key, inner),
          branches: [
            { ...body, condition: label, events: resolveEvents(body.events, decisions, inner) },
          ],
        });
      }
      return repeated;
    }
    default:
      // `par` and `region` stay as written.
      return [
        {
          ...fragment,
          key: suffixed(fragment.key, suffix),
          branches: fragment.branches.map((branch) => ({
            ...branch,
            events: resolveEvents(branch.events, decisions, suffix),
          })),
        },
      ];
  }
}

/** Every event of a tree, depth first, fragments before their branches' events. */
export function flattenEvents(events: readonly SequenceEvent[]): SequenceEvent[] {
  const out: SequenceEvent[] = [];
  const visit = (list: readonly SequenceEvent[]) => {
    for (const event of list) {
      out.push(event);
      if (event.kind === "fragment") for (const branch of event.branches) visit(branch.events);
    }
  };
  visit(events);
  return out;
}

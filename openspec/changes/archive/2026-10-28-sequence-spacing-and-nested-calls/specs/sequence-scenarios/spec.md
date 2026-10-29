## MODIFIED Requirements

### Requirement: Scenario resolution
`resolveScenario(diagram, id)` SHALL return the flattened events of the path, and `undefined` for an id the diagram does not declare. Chosen alternatives, options and breaks SHALL lose their frames. Loops SHALL become their body repeated, each repetition framed `loop [c k/n]` (a single pass keeps `[c]`), with the message keys of repetitions after the first suffixed `@k`. `par` and `region` SHALL stay as written. A call's block SHALL be resolved as a branch is, in place, so the call keeps its nested events, the fragments inside it are decided, and a repeated loop suffixes the call's key and its nested keys alike.

#### Scenario: Two iterations
- **WHEN** a scenario repeats a loop holding `api -> bank as poll` twice
- **THEN** the resolved events hold `poll` and `poll@2`, in two frames labelled `1/2` and `2/2`

#### Scenario: A loop around a call
- **WHEN** a scenario repeats twice a loop holding `api -> bank as poll { return "Pending" as pending }`
- **THEN** the resolved events hold `poll` with `pending` inside it and `poll@2` with `pending@2` inside it, and the layout of the scenario draws two bars on `bank`

#### Scenario: A decided fragment inside a call
- **WHEN** a scenario chooses the second branch of `alt check` that sits inside `pay`'s block
- **THEN** `pay`'s resolved events are the second branch's events without the frame, and `pay` keeps its bar

#### Scenario: An unknown scenario
- **WHEN** `resolveScenario(diagram, "nope")` runs and the diagram declares no `nope`
- **THEN** it returns `undefined` and the layout draws every event

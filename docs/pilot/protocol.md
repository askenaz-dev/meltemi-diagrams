# Pilot protocol

A pilot with real users tells whether Meltemi Diagrams serves people who make diagrams again and
again for documentation and presentations. It follows the proposal: five to eight participants,
each with a diagram of their own and a later change, timed and observed, plus a comparison of ten
cases with reference tools. The pilot gives qualitative signals; with this sample size it does not
show market demand on its own.

The product owner runs the pilot. This page is the protocol; the measurement templates are in
[templates/](templates/), and `pnpm pilot:summary <folder>` summarises them once filled.

## Participants

- Five to eight people who make diagrams for documentation or presentations at least monthly:
  developers, architects, technical writers, product people.
- A mix of origins: people who use Mermaid or PlantUML, people who use a visual editor such as
  draw.io, Lucidchart or Visio, and at least one who presents to non-technical audiences.
- Each brings a real diagram they made recently, and agrees to a follow-up two to four weeks
  later.

Record each participant in `participants.csv` with a code (`P1`, `P2`, …), never a name:

| Column        | Example                           |
| ------------- | --------------------------------- |
| `participant` | `P1`                              |
| `role`        | `solution architect`              |
| `experience`  | `5 years with PlantUML`           |
| `tools`       | `PlantUML, draw.io`               |
| `consent`     | `yes, 2026-11-02`                 |
| `notes`       | anything that affects the session |

## Sessions

One session per participant, 60 to 90 minutes, remote or in person, with screen sharing and the
participant's permission to record times and notes (not video, unless they agree to it).

Setup before the session: Node, the command line, VS Code with the extension, an installed Edge or
Chrome and FFmpeg on the participant's machine, or the [playground](../playground.md) when they
cannot install anything. Note which in `notes`.

| Phase          | What the participant does                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **creation**   | Draws their own diagram from scratch, from a template, or by importing their existing Mermaid or PlantUML source.         |
| **adjustment** | Makes it presentable: placement, labels, routes, styles, until they would show it.                                        |
| **export**     | Exports it for its real destination: SVG or PDF for a document, PNG for slides, a video or the player for a presentation. |
| **update**     | At the follow-up, changes it to reflect something that changed in their system, and exports again.                        |

The observer does not teach. When the participant is stuck for more than two minutes or asks,
the observer helps with the smallest hint and counts it. The [getting started](../getting-started.md)
guide and the tracks are available to the participant throughout.

Record each phase as a row of `sessions.csv`:

| Column         | Meaning                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| `participant`  | the participant's code                                                                      |
| `task`         | what they drew, in a few words (`checkout flow`, `payment sequence`)                        |
| `phase`        | `creation`, `adjustment`, `export` or `update`                                              |
| `start`, `end` | clock times `HH:MM:SS` (or `MM:SS`, or seconds) when the phase started and ended            |
| `errors`       | the times something went wrong: a wrong result, a lost change, an error they could not read |
| `help`         | the hints the observer gave                                                                 |
| `notes`        | what they said, where they hesitated, what they expected instead                            |

## Follow-up

Two to four weeks later, ask whether the participant made a second delivery with the product on
their own (a new diagram or an update for real use), and run the **update** phase. Record the
answer in `followup.csv` (`second_delivery` is `yes` or `no`, with the `date`). The usage goal of
the proposal is that participants come back for a second delivery.

## Comparison with reference tools

Ten cases, each drawn with Meltemi Diagrams and with the reference tool a participant would
otherwise use (Mermaid, PlantUML, draw.io or another), with equivalent content and comparable
editing effort: the same elements, relations and labels, and about the same time spent on each.

- Choose the cases from the participants' diagrams and the gallery's four profiles.
- Remove tool names and logos from the pictures, and show them in random order.
- At least three raters who did not draw them rate each picture from 1 to 5 on three criteria,
  **separately**:
  - **legibility**: how easily the diagram is read and understood;
  - **preference**: which they would rather show;
  - **maintainability**: how easy the source would be to change, judged from the source shown
    beside the picture.

Record one row per case, tool and rater in `comparison.csv` (`case`, `tool`, `rater`,
`legibility`, `preference`, `maintainability`, `notes`).

## Data handling

- Participants are codes; names, employers and contact details stay out of the files.
- Diagrams stay with their owners; the pilot keeps only what the participant agrees to share.
- Consent is recorded before the session and can be withdrawn: the participant's rows are then
  deleted.
- Nothing is sent to a service; AI assistance is off unless the participant uses their own key.

## Summary

```bash
pnpm pilot:summary pilot-results
```

reads the four files of a folder and writes a Markdown summary: the median and range of each
phase's time, errors and help per task, the mean rating per tool and criterion, and the share of
participants who made a second delivery. Rows it cannot read are listed with their file and line;
a missing file or column stops it. Add `--out summary.md` to write the summary to a file.

Report the summary together with the notes: what people expected, where they hesitated, and what
they asked for. Defects that lose data or draw wrong relations are release blockers, whatever the
ratings say.

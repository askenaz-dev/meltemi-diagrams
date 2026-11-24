# Design: a sheet that reads well

A sheet that validates is correct; this page is about one that a reader understands at a glance.
Each rule names the statement that applies it. Read it before writing a sheet and again before
delivering one.

## Focus

- Decide what the reader must see first: the one or two elements that carry the message, such as
  the service that changed or the step that fails. Mark them with the built-in class `highlight`,
  or with the accent (`style api { stroke accent; width 2 }`).
- Every other element keeps the theme's default style. Five highlighted boxes highlight nothing:
  choose the one or two that matter and leave the rest plain.
- Number the steps of the main path (`"1"`, `"2"` on its relations) when the order matters, and
  only on that path.

```text
diagram checkout: flow {
  direction LR
  client["Client"]
  api["Order API"] { class highlight }
  orders[("Orders DB")]
  client -> api: "1" as request
  api -> orders: "2" as persist
}
```

## Density

- Up to twelve boxes read at a glance.
- From thirteen, organise the sheet in groups (`group core "Core" { … }`), so that it reads as
  three to six blocks with a few arrows between them.
- Beyond thirty, split it: an overview with one box per group, and a detail sheet for each group,
  joined with `link`; or a `model` with its context, container and component views, which the
  catalog opens from one another ([c4.md](c4.md)).
- A system of ten to thirty components is what this tool is for: keep it in one sheet, grouped,
  and split nothing that a reader can follow.

```text
diagram platform: flow {
  direction LR
  group edge "Edge" {
    cdn["CDN"]
    gateway["API gateway"]
  }
  group core "Core" {
    orders["Orders"]
    payments["Payments"]
    catalog["Catalog"]
  }
  group data "Data" {
    db[("Orders DB")]
    events[("Events")]
  }
  cdn -> gateway
  gateway -> orders
  gateway -> catalog
  orders -> payments
  orders -> db
  payments -> events
}
```

## Colour

- Colour carries a meaning or nothing. Colours that stand for categories (a team, a state, an
  owner) need a legend: a row of `tag` elements, one per colour, under the sheet. A colour without
  a meaning is removed.
- Use the theme's tokens (`fill success`, `stroke danger`) where they fit: they follow any theme.
  A quoted colour stays as written in every theme.
- Dashed means one thing in a sheet, usually proposed (`style a, b { line dashed }`), and says so
  in the legend.
- A text must be readable on its fill: `layout.low-contrast` names the pair and a colour that
  passes. Keep a brand's colour as the fill and change the text.

```text
diagram teams: flow {
  direction LR
  checkout["Checkout"]
  payments["Payments"]
  ledger["Ledger"]
  checkout -> payments
  payments -> ledger
  tag orders "Team Orders"
  tag money "Team Money"
  style checkout, orders { fill "#E0F2FE"; color "#0B1830" }
  style payments, ledger, money { fill "#FEF3C7"; color "#0B1830" }
}
```

## Text

- Labels name the thing in two or three words; the `description` under the label says what it
  does or runs on, in a few words.
- Arrow labels say what moves (`"HTTPS"`, `"order.created"`), in one to three words. An arrow
  whose meaning is obvious from its ends needs no label.
- Keep the source's language and its names. Never invent a component to fill a gap: say what you
  inferred.

## Arrangement

- One direction for the main flow (`direction LR` or `TB`); the reader follows it without
  turning back.
- Peers line up (`row a, b, c`, `column x, y`) and keep even gaps.
- Arrows leave and enter the sides that face each other; a crossing that a reorder removes is
  removed.
- Annotations (`note`, `tag`) go beside what they explain, never over it.

## What to avoid

- Every box in a different colour, or the accent on most of them.
- A legend inside the drawing, over boxes or arrows.
- Long sentences in boxes or on arrows.
- Two boxes that always appear together and share every arrow: they are one box.
- Arrows that say what the layout already says, such as every box pointing to the group it is in.
- Shrinking a sheet that is too large instead of splitting it.

## Before you deliver

Run the removal test, then look at the picture (the review step of `SKILL.md`):

- Can a box go without a reader missing it? Remove it.
- Do two boxes always travel together? Merge them.
- Does an arrow repeat what the layout shows? Remove it.
- Does a label repeat what colour or shape already says? Remove it.
- Is the accent on one or two elements, and does every colour have its line in the legend?
- Does the sheet need a guide to be read? Then it holds two sheets: split it.

Say in your report what you removed or merged, and why.

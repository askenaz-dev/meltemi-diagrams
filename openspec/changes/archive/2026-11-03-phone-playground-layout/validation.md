# Validation

## Measured before and after

The built playground at 412 × 915 (the owner's phone), dark, touch, the flow template:

| Band above the canvas | Before | After |
| --------------------- | -----: | ----: |
| Header                | 135 px | 43 px |
| Tabs                  |  37 px | 37 px |
| Canvas toolbar        |  83 px | 31 px |
| Stage starts at       | 255 px | 111 px |

Before, the page opened on the Code tab and the Canvas tab showed the drawing at 79 %, fitted to
an 800 × 600 stage, part of it out of view; after, it opens on the Canvas tab at 34 %, the whole
drawing in view. At 375 and 360 px the header is also one row (43 px); at 320 px it is two rows
(75 px), inside the screen.

## Focused checks

`PLAYGROUND_TEST_FILTER="on a phone|canvas on a phone|narrow screen|header"`: **17/17 passed**,
including the new scenario (one row at 360, 375 and 412 px, a menu of the scrolled toolbar in
view, More's entries and theme switch, a wide screen), the updated narrow-screen scenarios, and the
header scenarios from 320 to 1440 px, signed in and not. `phone-more.png` and `phone-header.png`
were looked at.

## Repository gates

On the branch from `main` `6e4d063`, Windows, Node 24: `pnpm typecheck` and `pnpm lint` passed;
`pnpm test` passed 9,935 tests with one skipped; `pnpm playground:test-browser` passed **101/101**.
The canvas package is unchanged, so the webview suite was not run again.

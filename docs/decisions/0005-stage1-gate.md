# 0005. Stage 1 gate: visual edits keep comments

Status: passed on 9 October 2026, for the `flow` profile

## Context

The proposal sets a gate before the grammar is stabilised: dragging, renaming, reordering and
editing connections must work without losing comments. Stage 1 covers the `flow` profile, so
reordering (a `sequence` concern) is deferred to the sequence stage.

## Procedure

`corpus/valid/edge/commented-checkout.meltemi` is the checkout example with comments in every position
the editor must keep: file header, before statements, trailing, inside blocks, between blocks,
inside a `;`-joined line and after the last `}`. Ten operations run in sequence, each planned
against the latest revision as an editor would:

1. Drag `api` to (380, 200), where it already had a `place`.
2. Drag `db` to (1040, 180), where it had no `place` yet.
3. Resize `orders` to 240 x 120.
4. Change the route of `create`: target port `north`, two waypoints.
5. Move the label of `create` to 35 % with offset (0, -20).
6. Change the label text of `create`.
7. Give the anonymous relation `orders->db#2` the id `read`.
8. Route `read` from `south` to `south` through one waypoint.
9. Rename `api` to `gateway`.
10. Rename `orders` to `orderService`.

The procedure is automated in `packages/edit/test/gate.test.ts` and runs with the test suite.

## Result

- All 16 comments are present, unchanged and in the same order.
- The final text compiles without diagnostics.
- Undoing the ten steps in reverse order with their inverse plans restores the original bytes.
- Only the edited tokens changed; three lines were added (`place db`, `size orderService`,
  `route read`) at the end of the existing `placement` block.
- The rename of `api` reported that the comment on line 23 mentions `api` and was left unchanged.

Changed lines, input first:

```diff
-  api["API Gateway"] /* auth happens here */
-  orders["Pedidos"]
+  gateway["API Gateway"] /* auth happens here */
+  orderService["Pedidos"]
-  client -> api: "HTTPS" as request
-  api -> orders: "Crear pedido" as create // main path
-  orders -> db: "Persistir"; orders -> db: "Leer" /* read path */
+  client -> gateway: "HTTPS" as request
+  gateway -> orderService: "Crear pedido (POST /orders)" as create // main path
+  orderService -> db: "Persistir"; orderService -> db: "Leer" as read /* read path */
-    place api at (360, 180) // fixed by hand
-    place orders at (700, 180)
+    place gateway at (380, 200) // fixed by hand
+    place orderService at (700, 180)
-    route create from api.east to orders.west via [(520, 180)]
-    label create at 50% offset (0, -16) // above the line
+    route create from gateway.east to orderService.north via [(540, 180), (700, 90)]
+    label create at 35% offset (0, -20) // above the line
+    place db at (1040, 180)
+    size orderService (240, 120)
+    route read from orderService.south to db.south via [(870, 300)]
-  style api {
+  style gateway {
```

## Consequences

- The grammar 0.2 statement shapes are fit for bidirectional editing of `flow` diagrams. The open
  questions in `docs/language/grammar-0.2.md` remain to be decided before 0.3.
- Comments inside a removed statement are deleted with it and listed in the plan notes; this is the
  only case where an edit removes a comment.
- When removing an element would leave another element without any declaration, that element is
  kept as `node <id>` instead of disappearing.
- The gate must be repeated for `sequence` (including reordering), `c4` and `free` in their stages.

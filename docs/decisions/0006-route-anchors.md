# 0006. Route anchors: the port names the side, the neighbour fixes the point

Status: accepted (SVG export change, October 2026)

## Context

The proposal defines compass ports (`api.east`) as the ends of a route. Taken literally, a port is
the centre of a side. Real sheets rarely join centres: in the Konfío Agent Platform sheet, 12 of 13
arrows are straight lines that leave and enter boxes wherever the two boxes overlap, and the last one
bends once. Fractional ports (`api.north@25%`) would add syntax and still need numbers the author
has to work out.

## Decision

A port names a side. The exact point on that side comes from the neighbouring point of the route:

1. With waypoints, each side anchors at the projection of its neighbouring waypoint onto the side,
   clamped to the side.
2. Two facing parallel sides without a waypoint between them anchor at the centre of the overlap of
   their extents, so the connector is straight. When the extents do not overlap, each side uses its
   own centre.
3. Sides that do not face each other leave from their centres; perpendicular sides get one elbow.
4. `auto` picks the side facing the neighbouring point, judged relative to the box proportions
   (the distance is divided by the half width or half height), so a wide band next to a small box
   uses its east or west side.

Relations without a `route` use `auto` on both ends and no waypoints.

## Evidence

Applied to the original sheet, rule 2 reproduces every straight arrow: NextJS (x 260..460) to the
API gateway (x 240..700) gives x = 360; the gateway to the BFF (x 260..420) gives x = 340; Temporal
(x 470..700) to the runtime band (x 240..780) gives x = 585; the LLM gateway (x 240..540) to the
three providers gives x = 285, 390 and 495. All match the hand-drawn coordinates. The external
clients arrow needs one waypoint, `via [(1035, 48)]`, and rule 1 lands it at (1035, 530), the
original end point.

## Alternatives considered

- Fractional ports: more syntax, numbers the author must compute, no gain for the common case.
- Centre-to-centre lines clipped at the box border: diagonals everywhere on a sheet drawn with
  straight orthogonal arrows.
- Full orthogonal routing with obstacle avoidance: belongs to the layout engine, not to a manual
  exporter.

## Consequences

- Most sheets need no `route` statements; waypoints are reserved for the few bends.
- Moving a box in the editor keeps straight connectors straight as long as the extents still
  overlap, which matches how authors expect drag to behave.
- The rule is implemented once in `routePoints()` (`@meltemi/diagrams-layout`) and documented in
  `docs/language/svg-export.md`; the layout engine must keep it for placed elements.

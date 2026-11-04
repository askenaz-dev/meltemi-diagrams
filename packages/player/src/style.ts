// The player's style sheet, in its shadow root. Colours are system colours, so pages in dark mode
// work; the motion tokens are the canvas's under player names, overridable by the page on the
// element, and zero under reduced motion.

export const STYLE = `
:host { display: block; color-scheme: light dark; font: 14px/1.4 system-ui, sans-serif;
  --meltemi-motion-fast: 120ms; --meltemi-motion: 160ms; --meltemi-motion-slow: 220ms;
  --meltemi-ease: cubic-bezier(0.2, 0.7, 0.3, 1); --meltemi-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --meltemi-rise: 4px; --meltemi-slide: 12px; --meltemi-pop-scale: 0.98;
  --meltemi-tip-bg: light-dark(#1f2328, #3a3f47); --meltemi-tip-fg: #f3f4f6;
  --meltemi-tip-border: rgba(255, 255, 255, 0.08); --meltemi-panel-width: 320px; }
@media (prefers-reduced-motion: reduce) {
  :host { --meltemi-motion-fast: 0ms; --meltemi-motion: 0ms; --meltemi-motion-slow: 0ms;
    --meltemi-rise: 0px; --meltemi-slide: 0px; --meltemi-pop-scale: 1; }
}
.player { position: relative; margin: 0; }
.body { position: relative; max-width: var(--meltemi-w, 100%); margin: 0 auto; }
.frame { position: relative; width: 100%; aspect-ratio: var(--meltemi-ratio, 16 / 9);
  border-radius: 6px; overflow: hidden; outline: none; }
.frame.interactive { user-select: none; -webkit-user-select: none; touch-action: pan-y; }
.frame.interactive.pannable { cursor: grab; touch-action: none; }
.frame.interactive.panning { cursor: grabbing; }
.content { position: absolute; left: 0; top: 0; width: var(--meltemi-cw, 100%);
  height: var(--meltemi-ch, 100%); transform-origin: 0 0;
  transition: transform var(--meltemi-motion) var(--meltemi-ease); }
.frame.slow .content { transition-duration: var(--meltemi-motion-slow); }
.frame.direct .content, .frame.panning .content { transition: none; will-change: transform; }
.picture, .picture > svg { display: block; width: 100%; height: 100%; }
.picture [data-role="motion"] { pointer-events: none; }
.picture [data-role="motion"] :is([data-role="element"], [data-role="relation"],
  [data-role="lifeline"]) { pointer-events: auto; }
.overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible;
  pointer-events: none; }
.overlay .hit { fill: none; stroke: transparent; pointer-events: stroke; }
.overlay .ring { fill: none; stroke: var(--meltemi-accent); stroke-linejoin: round;
  animation: meltemi-fade var(--meltemi-motion) var(--meltemi-ease); }
.overlay .ring.hover { opacity: 0.6; animation-duration: var(--meltemi-motion-fast); }
.overlay .ring.line { opacity: 0.35; stroke-linecap: round; }
.overlay .ring.focus { stroke: var(--meltemi-focus, Highlight); }
.overlay .badge { pointer-events: all; cursor: pointer; transform-box: fill-box;
  transform-origin: center; transition: transform var(--meltemi-motion-fast) var(--meltemi-ease);
  animation: meltemi-pop var(--meltemi-motion) var(--meltemi-ease); }
.overlay .badge:hover { transform: scale(1.08); }
.overlay .badge circle { fill: Canvas; stroke: var(--meltemi-accent);
  transition: fill var(--meltemi-motion-fast) var(--meltemi-ease); }
.overlay .badge path { fill: none; stroke: var(--meltemi-accent); stroke-linecap: round; }
.overlay .badge.selected circle { fill: var(--meltemi-accent); }
.overlay .badge.selected path { stroke: #fff; }
@media (forced-colors: active) {
  .overlay .ring, .overlay .badge circle, .overlay .badge path { stroke: Highlight; }
  .overlay .badge.selected circle { fill: Highlight; }
  .overlay .badge.selected path { stroke: HighlightText; }
}
@keyframes meltemi-fade { from { opacity: 0; } }
@keyframes meltemi-pop { from { opacity: 0; transform: scale(var(--meltemi-pop-scale)); } }
@keyframes meltemi-rise { from { opacity: 0; transform: translateY(var(--meltemi-rise)); } }
@keyframes meltemi-slide { from { opacity: 0; transform: translateX(var(--meltemi-slide)); } }
.frame:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible,
summary:focus-visible, a:focus-visible, .details:focus-visible, .details .title:focus-visible {
  outline: 2px solid var(--meltemi-focus, Highlight); outline-offset: 2px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 0 0; }
.controls[hidden], [hidden] { display: none !important; }
button { display: inline-flex; align-items: center; justify-content: center; width: 32px;
  height: 32px; padding: 0; border: 1px solid ButtonBorder; border-radius: 6px;
  background: ButtonFace; color: ButtonText; cursor: pointer; font: inherit;
  transition: background-color var(--meltemi-motion-fast) var(--meltemi-ease),
    border-color var(--meltemi-motion-fast) var(--meltemi-ease); }
button:disabled { opacity: 0.4; cursor: default; }
button[aria-pressed="true"] { background: Highlight; color: HighlightText; border-color: Highlight; }
button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5;
  stroke-linejoin: round; stroke-linecap: round; flex: none; }
.playback { display: contents; }
input[type="range"] { flex: 1 1 160px; min-width: 120px; margin: 0; }
.time { min-width: 10ch; font-variant-numeric: tabular-nums; }
select { height: 32px; max-width: 18rem; font: inherit; }
.zoom { display: inline-flex; gap: 4px; margin-left: auto; }
.zoom .level { width: auto; min-width: 6ch; padding: 0 8px; font-size: 13px;
  font-variant-numeric: tabular-nums; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; }
details.summary { margin-top: 8px; }
summary { cursor: pointer; }
details ol { margin: 8px 0 0; padding-left: 1.5em; }
details ul { margin: 2px 0 6px; padding-left: 1.2em; }
.elements { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap;
  gap: 4px; }
.elements button { width: auto; height: auto; min-height: 28px; padding: 2px 8px;
  font-size: 13px; }
.trail { display: flex; align-items: center; gap: 6px; padding: 0 0 8px; font-size: 13px;
  animation: meltemi-rise var(--meltemi-motion-slow) var(--meltemi-ease); }
.trail ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 0;
  padding: 0; list-style: none; }
.trail li { display: inline-flex; align-items: center; }
.trail li + li::before { content: "›"; padding: 0 4px; color: GrayText; }
.trail li button { width: auto; height: 28px; padding: 0 8px; border-color: transparent;
  background: transparent; color: LinkText; }
.trail li button:hover { border-color: ButtonBorder; }
.trail li:last-child { animation: meltemi-slide var(--meltemi-motion-slow) var(--meltemi-ease); }
.trail [aria-current="page"] { padding: 0 8px; font-weight: 600; }
.card { position: fixed; z-index: 50; max-width: 300px; padding: 6px 9px 7px;
  border: 1px solid var(--meltemi-tip-border); border-radius: 6px; background: var(--meltemi-tip-bg);
  color: var(--meltemi-tip-fg); box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22); font-size: 12px;
  line-height: 1.35; pointer-events: none; opacity: 1; transform: none;
  transition: opacity var(--meltemi-motion-fast) var(--meltemi-ease),
    transform var(--meltemi-motion-fast) var(--meltemi-ease),
    display var(--meltemi-motion-fast) allow-discrete; }
@starting-style { .card { opacity: 0; transform: translateY(calc(var(--meltemi-rise) / -2)); } }
.card[data-side="top"] { transform-origin: bottom; }
.card[hidden] { display: none !important; opacity: 0; }
.card .title { font-size: 13px; font-weight: 600; }
.card .meta, .card .link { opacity: 0.8; }
.card .text { margin: 3px 0 0; display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
.details { position: absolute; top: 0; right: 0; bottom: 0; width: min(var(--meltemi-panel-width), 60%);
  box-sizing: border-box; overflow: auto; padding: 12px 14px; background: Canvas; color: CanvasText;
  border-left: 1px solid ButtonBorder; box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
  font-size: 13px; line-height: 1.45; border-radius: 0 6px 6px 0;
  animation: meltemi-slide var(--meltemi-motion-slow) var(--meltemi-ease); }
.player[data-details="below"] .details { position: static; width: auto; max-height: 50vh;
  margin-top: 8px; border-left: 0; border-top: 1px solid ButtonBorder; border-radius: 6px;
  box-shadow: none; animation-name: meltemi-rise; }
.details .head { display: flex; align-items: flex-start; gap: 8px; }
.details .title { flex: 1; margin: 0; font-size: 15px; font-weight: 650; line-height: 1.3;
  overflow-wrap: anywhere; }
.details .type { margin: 2px 0 8px; color: GrayText; }
.details .bodytext { animation: meltemi-fade var(--meltemi-motion) var(--meltemi-ease); }
.details dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0; }
.details dt { color: GrayText; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; padding-top: 2px; }
.details dd { margin: 0; overflow-wrap: anywhere; }
.details .description { margin: 8px 0; white-space: pre-line; overflow-wrap: anywhere; }
.details h4 { margin: 12px 0 4px; font-size: 12px; font-weight: 600; color: GrayText;
  text-transform: uppercase; letter-spacing: 0.04em; }
.details ul { margin: 0; padding: 0; list-style: none; }
.details li button, .details .action { width: 100%; height: auto; min-height: 30px;
  justify-content: flex-start; gap: 6px; padding: 4px 8px; text-align: left;
  border-color: transparent; background: transparent; color: inherit; }
.details li button:hover, .details .action:hover {
  background: color-mix(in srgb, var(--meltemi-accent) 10%, transparent); }
.details .action { margin: 4px 0; border-color: var(--meltemi-accent); color: var(--meltemi-accent);
  font-weight: 600; justify-content: center; }
.details a { color: var(--meltemi-accent); }
.details .badge-text { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 4px;
  background: color-mix(in srgb, CanvasText 10%, transparent); font-size: 11px; }
@media (hover: none), (pointer: coarse) {
  .details li button, .details .action, .details button.close, .trail li button { min-height: 44px; }
}
`;

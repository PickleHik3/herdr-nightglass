// tokyo-night: shared helpers (palette, icons, status marks, popup anchors, formatting).
import { svg, image, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, keys, window, layout, shared } from "herdr";

export const M = "mods/tokyo-night";
export const MONO = "JetBrains Mono";
export const CLEAR = "#00000000";
export const LIT = { teal: "#73daca", cyan: "#7dcfff", orange: "#ff9e64", purple: "#bb9af7", amber: "#e0af68", slate: "#565f89" };
export const BADGES = [LIT.cyan, LIT.orange, LIT.teal, LIT.purple, LIT.amber, "#7aa2f7"];

// Colors: theme names where the theme has one (so the accent follows settings), the design's
// literal Tokyo Night hexes for the rest. Read through C at render time.
function build(t) {
  return {
    canvas: t.canvas ?? "#16161e", chrome: t.chrome ?? "#1a1b26", surface: t.surface ?? "#1f2335",
    raised: t.raised ?? "#292e42", input: t.input ?? "#3b4261",
    fg: t.foreground ?? "#c0caf5", muted: t.muted ?? "#a9b1d6", dim: t.dim ?? "#8a92c2",
    accent: t.accent ?? "#7aa2f7", onAccent: t.accent_foreground ?? "#16161e",
    red: t.blocked ?? "#f7768e", green: t.working ?? "#9ece6a", idle: t.idle ?? "#8a92c2",
    ...LIT, ink: "#16161e",
  };
}
let sig = null, cache = null;
export const C = new Proxy({}, {
  get(_o, k) {
    const t = theme();
    const s = `${t.canvas}|${t.chrome}|${t.accent}|${t.foreground}|${t.blocked}|${t.working}|${t.dim}`;
    if (s !== sig) { sig = s; cache = build(t); }
    return cache[k];
  },
});

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
// A color at `a` (0..1) opacity, as 8-digit hex.
export const alpha = (hex, a) => HEX.test(hex ?? "") ? hex.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0") : hex;
// `top` at `a` over an opaque `base` (the design's color-mix over a known ground).
export function mix(top, base, a) {
  if (!HEX.test(top ?? "") || !HEX.test(base ?? "")) return top;
  const n = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(n(top, i) * a + n(base, i) * (1 - a)).toString(16).padStart(2, "0")).join("");
}
// Per-machine colors the person picked (right-click a machine); the theme accent by default.
export const COLORS_KEY = "tokyo-night.colors";
export const SWATCHES = ["#7aa2f7", "#7dcfff", "#73daca", "#9ece6a", "#e0af68", "#ff9e64", "#f7768e", "#bb9af7"];
export const machineColor = (key) => {
  const c = shared(COLORS_KEY)?.[key];
  return HEX.test(c ?? "") ? c : C.accent;
};
export const stop = (_e, cx) => cx.stop_propagation();

export function dur(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d${h % 24}h`;
}
export const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// A node of the shown layout by id.
export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const f = findNode(child, id); if (f) return f; }
  return null;
}
export const nodePx = (id) => findNode(layout(), id)?.size?.px;

// ---- icons ----
export const ico = (name, size, color) => svg(`${M}/${name}.svg`).size(size).flex_none().text_color(color ?? C.dim);
export function prog(p, size, color) {
  if (p?.icon) return (p.tint ? svg(p.icon).text_color(color ?? C.muted) : image(p.icon)).size(size).flex_none();
  return div().size(size).rounded(3).bg(LIT.slate).flex_none();
}
// The status marks of the design, in a fixed 10 px slot. kind: waiting | working | done | idle | offline
export function mark(kind, slot = 10) {
  const box = h_flex().w(slot).h(slot).flex_none().justify_center().items_center();
  if (kind === "waiting") return box.child(div().size(7).rounded(2).bg(C.red).loop("opacity", { from: 0.3, to: 1, period: 1000 }));
  if (kind === "working") return box.child(div().size(6).rounded(3).bg(C.green).loop("opacity", { from: 0.35, to: 1, period: 2000 }));
  if (kind === "done") return box.child(ico("check", 10, C.green));
  if (kind === "offline") return box.child(div().w(7).h(2).rounded(1).bg(C.idle));
  return box.child(div().size(8).rounded(4).border(1.5).border_color(C.idle));
}
// One 22/36 px double ring: outer = week (5% steps), inner = 5-hour. Built from pre-made arcs.
const step = (p) => p > 0 ? Math.min(100, Math.max(5, Math.round(p / 5) * 5)) : 0;
export function ring(size, wPct, hPct, wColor, hColor) {
  const layer = (file, color) => svg(`${M}/${file}.svg`).absolute().top(0).left(0).size(size).text_color(color);
  const w = step(wPct ?? 0), h = step(hPct ?? 0);
  return h_flex().relative().size(size).flex_none()
    .child(layer("ring-track", C.raised))
    .when(w > 0, el => el.child(layer(`ring-w-${w}`, wColor)))
    .when(h > 0, el => el.child(layer(`ring-h-${h}`, hColor)));
}
export const level = (pct, base) => pct >= 85 ? C.red : pct >= 60 ? C.amber : base;

// ---- popups ----
// Anchor under the pressed element, in window coordinates (position - local_position = origin).
export function anchorBelow(e) {
  if (!e?.local_position || !e?.bounds) return "pointer";
  return { x: Math.round(e.position.x - e.local_position.x), y: Math.round(e.position.y - e.local_position.y + e.bounds.height + 4) };
}
export function anchorBelowRight(e, width) {
  const a = anchorBelow(e);
  return a === "pointer" ? a : { x: Math.max(8, Math.round(a.x + e.bounds.width - width)), y: a.y };
}
export function anchorRight(e) {
  if (!e?.local_position || !e?.bounds) return "pointer";
  return { x: Math.round(e.position.x - e.local_position.x + e.bounds.width + 8), y: Math.round(e.position.y - e.local_position.y) };
}
let pressed = "pointer";
export const setPressed = (a) => { pressed = a; };
export const getPressed = () => pressed;

// ---- keys ----
export function keyLabel(k) {
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}
// The binding label of a command, "" when none.
export function bindingOf(action) {
  const all = keys();
  const b = all.find(x => x.section === "global" && x.action === action && x.keys.trim()) ?? all.find(x => x.action === action && x.keys.trim());
  return b ? keyLabel(b.keys) : "";
}

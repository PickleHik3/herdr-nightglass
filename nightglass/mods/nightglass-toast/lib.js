// nightglass: shared helpers (palette, icons, status marks, popup anchors, formatting).
import { svg, image, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, keys, window, layout, shared, machines } from "herdr";

export const M = "mods/nightglass";
export const MONO = "JetBrains Mono";
export const CLEAR = "#00000000";
export const LIT = { teal: "#4fd1b8" };

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
// A color at `a` (0..1) opacity, as 8-digit hex.
export const alpha = (hex, a) => HEX.test(hex ?? "") ? hex.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0") : hex;
// `top` at `a` over an opaque `base` (the design's color-mix over a known ground).
export function mix(top, base, a) {
  if (!HEX.test(top ?? "") || !HEX.test(base ?? "")) return top;
  const n = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(n(top, i) * a + n(base, i) * (1 - a)).toString(16).padStart(2, "0")).join("");
}
// Derived from a machine color c (the Glass spec's "focused row" family).
export const nearBlack = (c) => mix(c, "#000000", 0.16);
export const darkOf = (c) => mix(c, "#000000", 0.31);
export const lightOf = (c) => mix("#ffffff", c, 0.35);

// ---- Glass tokens ----
// The theme carries the opaque bases (themes/*.json, scripts/gen-themes.py): canvas = wallpaper
// base, chrome = glass base, surface = glass over the wallpaper (opaque), accent = the hue.
// The Glass tokens are alpha fills over those; a machine theme tints the bases slightly.
function build(t) {
  const hue = t.accent ?? "#e6e7eb";
  const white = mix(hue, "#ffffff", 0.08), black = mix(hue, "#000000", 0.06);
  const base = t.chrome ?? "#0c0d12";
  return {
    wall: t.canvas ?? "#0e1016", glassBase: base, glassSolid: t.surface ?? "#0d0e14",
    glass: alpha(base, 0.5), // see-through enough that the wallpaper reads through every box
    raised: alpha(white, 0.09), raisedHi: alpha(white, 0.14), well: alpha(black, 0.38), rim: alpha(white, 0.10),
    fg: t.foreground ?? "#eceef2", muted: t.muted ?? "#a8adba", dim: t.muted ?? "#a8adba",
    accent: hue, onAccent: t.accent_foreground ?? "#0f1012", ink: "#0f1012",
    red: t.blocked ?? "#f0708a", green: t.working ?? "#5fd38d", amber: "#e0af68", idle: t.muted ?? "#a8adba",
    ...LIT,
  };
}
let sig = null, cache = null;
export const C = new Proxy({}, {
  get(_o, k) {
    const t = theme();
    const s = `${t.canvas}|${t.chrome}|${t.surface}|${t.accent}|${t.foreground}|${t.blocked}|${t.working}|${t.muted}`;
    if (s !== sig) { sig = s; cache = build(t); }
    return cache[k];
  },
});

export const COLORS_KEY = "nightglass.colors";
// Each swatch is a machine scheme: themes/<theme>.json (scripts/gen-themes.py), the Glass base
// nudged toward that hue. The focused space's machine decides which one the app shows.
export const SCHEMES = [
  { color: "#6e9bff", theme: "nightglass-blue", label: "Blue" },
  { color: "#52c6f0", theme: "nightglass-frost", label: "Frost" },
  { color: "#4fd1b8", theme: "nightglass-lagoon", label: "Teal" },
  { color: "#86d46a", theme: "nightglass-forest", label: "Forest" },
  { color: "#e5b45c", theme: "nightglass-dune", label: "Dune" },
  { color: "#f58f5c", theme: "nightglass-ember", label: "Ember" },
  { color: "#f0708a", theme: "nightglass-sakura", label: "Rose" },
  { color: "#a98bf5", theme: "nightglass-aurora", label: "Aurora" },
];
export const SWATCHES = SCHEMES.map(s => s.color);
// Picks stored before the Glass retune: the old Tokyo Night swatch -> the scheme it became.
const OLD_SWATCHES = { "#7aa2f7": 0, "#7dcfff": 1, "#73daca": 2, "#9ece6a": 3, "#e0af68": 4, "#ff9e64": 5, "#f7768e": 6, "#bb9af7": 7 };
// The All view's own scheme: the neutral Glass base with a pale accent, unlike any machine.
export const ALL_THEME = "nightglass-storm";
// Renamed from tokyo-night: a stored theme name (or a pick kept under the old shared key) still resolves.
export const migrateTheme = (name) => typeof name === "string" && name.startsWith("tokyo-night") ? `nightglass${name.slice("tokyo-night".length)}` : name;
// A stored pick (a swatch color, a theme name or an old Tokyo Night swatch) -> its scheme, or null.
const pickedScheme = (v) => {
  const c = String(v ?? "").toLowerCase();
  if (!c) return null;
  return SCHEMES.find(s => s.color === c) ?? SCHEMES.find(s => s.theme === migrateTheme(c)) ?? (OLD_SWATCHES[c] != null ? SCHEMES[OLD_SWATCHES[c]] : null);
};
// Stored picks win. A machine without one gets the first scheme no stored pick and no earlier unpicked machine uses,
// in machines() order with this computer ("@local") first (all taken: round the list again). Cached per picks + machines.
let autoSig = null, autoMap = null;
function autoSchemes(picks) {
  const order = ["@local"];
  for (const m of machines()) { const k = m.name ?? "@local"; if (!order.includes(k)) order.push(k); }
  const sig = JSON.stringify(picks ?? null) + "|" + order.join(",");
  if (sig === autoSig) return autoMap;
  const used = new Set(), map = new Map();
  for (const k of Object.keys(picks ?? {})) { const s = pickedScheme(picks[k]); if (s) used.add(s); }
  let n = 0;
  for (const k of order) {
    if (pickedScheme(picks?.[k])) continue;
    const free = SCHEMES.find(s => !used.has(s)) ?? SCHEMES[n % SCHEMES.length];
    used.add(free); map.set(k, free); n++;
  }
  autoSig = sig; autoMap = map;
  return map;
}
export const machineScheme = (key) => {
  const picks = shared(COLORS_KEY) ?? shared("tokyo-night.colors");
  return pickedScheme(picks?.[key]) ?? autoSchemes(picks).get(key) ?? SCHEMES[0];
};
// A fixed default (not the live accent, which follows whichever machine is focused).
export const machineColor = (key) => machineScheme(key).color;
// A machine's glyph, as its sidebar tile draws it: its icon (a monitor for this computer, a server otherwise) on a tile of
// its colour. The one mark for "which machine" everywhere: tiles, board cards and chips, phone cards. (Status has its own
// marks, so a red machine never reads as "waiting".)
export const machineGlyph = (key, size = 18) => h_flex().size(size).flex_none().rounded(Math.round(size * 0.3))
  .justify_center().items_center().bg(alpha(machineColor(key), 0.18))
  .child(ico(key === "@local" ? "monitor" : "server", Math.round(size * 0.6), machineColor(key)));
export const stop = (_e, cx) => cx.stop_propagation();
// Hover-revealed controls (close buttons): an opacity fade in place, no delay. A delayed reveal was not
// cancelled when the pointer left first, so strips flashed on rows already passed.
export const revealMotion = (shown) => shown
  ? { duration: 120, easing: "ease-out" }
  : { duration: 90, easing: "ease-out" };

// Popups and toasts ease in. The app puts an overlay up at once (no entrance of its own), so its content is drawn
// hidden and `dy` px off on the first frame, then shown a frame later (startEnter, from init), which the native
// transitions animate. Guarded: the phone's app 0.1.13 may lack transition or cx.sleep; there it just appears.
export const enter = (el, shown, dy) => typeof el.transition !== "function" ? el
  : el.relative().top(shown ? 0 : dy).opacity(shown ? 1 : 0)
    .transition("opacity", { duration: 160, easing: "ease-out" }).transition("top", { duration: 200, easing: "ease-out" });
export function startEnter(view, cx) {
  view.shown = typeof cx?.sleep !== "function";
  if (!view.shown) cx.spawn(async (cx) => { await cx.sleep(16); view.shown = true; cx.notify(); });
}

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
  return image(`${M}/herdr.png`).size(size).rounded(3).flex_none();
}
// The waiting mark pulses only for PULSE_MS after something starts waiting (data.js snapshot() notes when): a loop
// redraws the whole window ~30 times a second and an agent can wait for hours; after that the solid red says it.
// Each view is its own copy of the mod, so each keeps its own window and re-renders when it closes (main.js).
export const PULSE_MS = 10000;
let pulseUntil = 0;
export const notePulse = (until) => { if (until > pulseUntil) pulseUntil = until; };
export const pulsing = () => Date.now() < pulseUntil;
// The status marks of the design, in a fixed 10 px slot. kind: waiting | working | done | idle | offline
export function mark(kind, slot = 10) {
  const box = h_flex().w(slot).h(slot).flex_none().justify_center().items_center();
  if (kind === "waiting") {
    const dot = div().size(7).rounded(2).bg(C.red);
    return box.child(pulsing() ? dot.loop("opacity", { from: 0.3, to: 1, period: 1000 }) : dot);
  }
  // Only "waiting" pulses: a loop redraws the whole window ~30 times a second, and every working agent had one.
  if (kind === "working") return box.child(div().size(6).rounded(3).bg(C.green));
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

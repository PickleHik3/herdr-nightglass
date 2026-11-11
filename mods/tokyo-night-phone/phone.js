// tokyo-night-phone: what only the phone needs, on top of lib.js / data.js (which are verbatim copies
// of the desktop mod's, so they can be re-synced with `cp`). Icons and ring arcs that the desktop mod
// already ships are loaded from its folder (mods/tokyo-night/...): asset paths are relative to the
// Herdr home, unlike JS imports, which cannot leave their own mod folder.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, shared, setShared } from "herdr";
import { C, anchorBelow } from "./lib.js";

export const MOD = "tokyo-night-phone";
const PM = `mods/${MOD}`;

// The design's width: the layout is drawn for a 412 px wide phone at zoom 1.
export const DESIGN_W = 412;

// App zoom (settings.json "zoom"; settings() carries it). Layout px are "as designed" and drawn at zoom x px.
export const zoom = () => { const z = Number(settings()?.zoom); return z > 0 ? z : 1; };

// The window as measured (main.js "watch" for the height, the top bar for the width). on_size_change reports
// SCREEN px, i.e. designed px x zoom (materialize.rs: bounds.size), and overlay `at` points are screen px too,
// while overlay width/height and every layout/mod px are designed px. So: WIN holds screen px; `dsg` converts.
// Module scope: every role of this mod shares it. `dropped`: the drawer is hidden for the soft keyboard.
export const WIN = { w: 0, h: 0, dropped: false };
export const dsg = (screenPx) => screenPx / zoom();

// An icon that lives in this mod's folder (menu, arrow-up, prompt); the rest come from lib.js `ico`.
export const pico = (name, size, color) => svg(`${PM}/${name}.svg`).size(size).flex_none().text_color(color ?? C.dim);

// The top bar's 16 px double ring (outer = week, inner = 5-hour, 5% steps): arcs from scripts/gen-phone-rings.mjs.
const step = (p) => p > 0 ? Math.min(100, Math.max(5, Math.round(p / 5) * 5)) : 0;
export function ringS(size, wPct, hPct, wColor, hColor) {
  const layer = (file, color) => svg(`${PM}/ring-s-${file}.svg`).absolute().top(0).left(0).size(size).text_color(color);
  const w = step(wPct ?? 0), h = step(hPct ?? 0);
  return h_flex().relative().size(size).flex_none()
    .child(layer("track", C.raised))
    .when(w > 0, el => el.child(layer(`w-${w}`, wColor)))
    .when(h > 0, el => el.child(layer(`h-${h}`, hColor)));
}

// Right edge of the pressed element on the right edge of a popup `width` designed px wide, kept inside the window.
// `win`: the window width in screen px. Event positions and `at` are screen px; `width` is designed px.
export function anchorBelowRight(e, width, win) {
  const a = anchorBelow(e);
  if (a === "pointer") return a;
  const wpx = width * zoom(), m = 8 * zoom();
  const maxX = win > 0 ? Math.max(m, win - wpx - m) : Infinity;
  return { x: Math.min(maxX, Math.max(m, Math.round(a.x + e.bounds.width - wpx))), y: a.y };
}

// ---- popup toggles ----
// A press outside a popup closes it, and the same tap's click then reaches the button that opened it, which would
// open it again: a second tap on the button never closed it. Each popup copy reports (main.js init / close) when it is
// open and when it closed; a button that toggles a popup ignores a click within GUARD_MS of the close and, while the popup
// is open, closes it itself.
const GUARD_MS = 400;
export const popupOpened = (name) => { setShared(`tokyo-night-phone.${name}-open`, true); };
export const popupClosed = (name) => { setShared(`tokyo-night-phone.${name}-open`, false); setShared(`tokyo-night-phone.${name}-closed`, Date.now()); };
export const popupIsOpen = (name) => shared(`tokyo-night-phone.${name}-open`) === true;
export const popupJustClosed = (name) => Date.now() - (shared(`tokyo-night-phone.${name}-closed`) ?? 0) < GUARD_MS;

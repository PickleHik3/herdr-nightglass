// tokyo-night-phone: what only the phone needs, on top of lib.js / data.js (which are verbatim copies
// of the desktop mod's, so they can be re-synced with `cp`). Icons and ring arcs that the desktop mod
// already ships are loaded from its folder (mods/tokyo-night/...): asset paths are relative to the
// Herdr home, unlike JS imports, which cannot leave their own mod folder.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { C, anchorBelow } from "./lib.js";

export const MOD = "tokyo-night-phone";
const PM = `mods/${MOD}`;

// The window as the observer role (main.js "watch") last measured it, in logical px. Module
// scope: every role of this mod shares it. `dropped`: the drawer is hidden for the soft keyboard.
export const WIN = { w: 0, h: 0, dropped: false };

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

// Right edge of the pressed element on the right edge of a `width` px popup, kept inside [8, win - width - 8]
// (overlays are not clamped by the app).
export function anchorBelowRight(e, width, win) {
  const a = anchorBelow(e);
  if (a === "pointer") return a;
  const maxX = win > 0 ? Math.max(8, win - width - 8) : Infinity;
  return { x: Math.min(maxX, Math.max(8, Math.round(a.x + e.bounds.width - width))), y: a.y };
}

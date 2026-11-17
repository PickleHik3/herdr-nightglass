// nightglass-phone: what only the phone needs, on top of lib.js / data.js (which are verbatim copies
// of the desktop mod's, so they can be re-synced with `cp`). Icons and ring arcs that the desktop mod
// already ships are loaded from its folder (mods/nightglass/...): asset paths are relative to the
// Herdr home, unlike JS imports, which cannot leave their own mod folder.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, shared, setShared, run } from "herdr";
import { C, anchorBelow } from "./lib.js";
import { ALL } from "./data.js";

export const MOD = "nightglass-phone";
const PM = `mods/${MOD}`;

// The design's width: the layout is drawn for a 412 px wide phone at zoom 1.
export const DESIGN_W = 412;

// App zoom (settings.json "zoom"; settings() carries it). Layout px are "as designed" and drawn at zoom x px.
export const zoom = () => { const z = Number(settings()?.zoom); return z > 0 ? z : 1; };

// The window as measured (the inbox block's size: its width is the window's, its height the column's). on_size_change reports
// SCREEN px, i.e. designed px x zoom (materialize.rs: bounds.size), and overlay `at` points are screen px too,
// while overlay width/height and every layout/mod px are designed px. So: WIN holds screen px; `dsg` converts.
// Module scope: every role of this mod shares it.
export const WIN = { w: 0, h: 0 };
export const dsg = (screenPx) => screenPx / zoom();

// An icon that lives in this mod's folder (menu, arrow-up, prompt); the rest come from lib.js `ico`.
export const pico = (name, size, color) => svg(`${PM}/${name}.svg`).size(size).flex_none().text_color(color ?? C.dim);

// A 16 px double ring (outer = week, inner = 5-hour, 5% steps): arcs from scripts/gen-phone-rings.mjs. Not drawn by the
// inbox (its usage row uses lib.js ring at 36 px); kept with its ring-s-*.svg arcs for a compact widget.
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
export const popupOpened = (name) => { setShared(`nightglass-phone.${name}-open`, true); };
export const popupClosed = (name) => { setShared(`nightglass-phone.${name}-open`, false); setShared(`nightglass-phone.${name}-closed`, Date.now()); };
export const popupIsOpen = (name) => shared(`nightglass-phone.${name}-open`) === true;
export const popupJustClosed = (name) => Date.now() - (shared(`nightglass-phone.${name}-closed`) ?? 0) < GUARD_MS;

// ---- swipes ----
// A one-finger drag arrives as scroll-wheel events in LINES (gpui X11: ScrollDelta::Lines), and the app's scroll areas
// turn a line into `window.line_height()` px, read inside the scroll element's own text style (gpui div.rs
// paint_scroll_listener runs within with_text_style). So the container's text_size x line_height is the px a scroll line
// moves; inherited from the 13 px root (26 px at zoom 2, line height ~1.6) it was far more than a finger moved. swipeArea
// sets it on the scroll container (SWIPE_PX designed px per line; tune here), swipeBody gives the content its normal text back.
export const SWIPE_PX = 8;
export const swipeArea = (el) => el.text_size(SWIPE_PX).line_height(1);
export const swipeBody = (el) => el.text_size(13).line_height(1.5);
// A drag that starts on a control ends with a press-release in the same spot, i.e. a click on it. Scroll areas note the
// last wheel event (watchScroll); taps on controls inside them ignore a click within SWIPE_GUARD_MS of one (tap()).
const SWIPE_GUARD_MS = 300;
export const watchScroll = (el, view) => el.on_scroll_wheel(() => { view.lastScroll = Date.now(); });
export const swiped = (view) => Date.now() - (view.lastScroll ?? 0) < SWIPE_GUARD_MS;
export const tap = (view, fn) => (e, cx) => { if (swiped(view)) return; fn(e, cx); };

// ---- the two views: the inbox (layout node "inbox") and the detail (dbar, term, sheet when open, composer) ----
// The inbox block takes the whole column on the home view; "Open" (or a tap on any agent) hides it and shows the detail
// blocks, Back does the reverse (detail.js). Which one shows is shared, so every role knows; the layout's hidden flags
// are what actually show the blocks. The inbox role's init resets to the inbox at load, whatever the saved layout said.
const VIEW_KEY = "nightglass-phone.view";   // { view: "inbox" | "detail", address: the opened terminal }
const SHEET_KEY = "nightglass-phone.sheet"; // null | "files" | "changes": the Files / Changes sheet in the detail view
export const DETAIL_IDS = ["dbar", "term", "composer"];
export const detailOpen = () => shared(VIEW_KEY)?.view === "detail";
export const detailAddress = () => shared(VIEW_KEY)?.address ?? null;
export const setViewState = (v) => { setShared(VIEW_KEY, v); };
export const sheetShown = () => shared(SHEET_KEY) ?? null;
export function setSheet(which) {
  setShared(SHEET_KEY, which ?? null);
  if (!which) { run("layout.hide", { id: "sheet" }); return; }
  run("layout.select", { stack: "sheet-body", child: which });
  run("layout.show", { id: "sheet" });
}

// ---- finished agents: listed in the inbox's "Needs you" queue until dismissed (or opened) ----
// The data layer (data.js) has no "seen" mark, so dismissal is phone-only: { terminal address: time it was dismissed }.
// A finished agent is dismissed while its finish time (now - r.ms) is not after that, so a LATER finish shows again.
// Kept in shared state (all roles) and mirrored in localStorage (as the mod's other small state: "open", "visited").
const DIS_KEY = "nightglass-phone.dismissed";
let disLocal = null;
const disMap = () => {
  const v = shared(DIS_KEY);
  if (v) return v;
  if (!disLocal) { try { disLocal = JSON.parse(localStorage.getItem("dismissed") ?? "{}") ?? {}; } catch { disLocal = {}; } }
  return disLocal;
};
export const isDismissed = (r) => (disMap()[r.address] ?? 0) >= Date.now() - r.ms;
export function dismissRows(rows) {
  const cur = disMap(), next = { ...cur }, now = Date.now();
  for (const r of rows) next[r.address] = now;
  const keys = Object.keys(next);
  if (keys.length > 200) for (const k of keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - 200)) delete next[k];
  setShared(DIS_KEY, next);
  try { localStorage.setItem("dismissed", JSON.stringify(next)); } catch { /* storage unavailable */ }
}
export const finishedRows = (snap) => snap.rows.filter(r => r.agent && r.kind === "done" && !isDismissed(r));
// The "Needs you" queue of the inbox (machine `key`, or every machine for null / All): waiting agents first, then the
// finished ones not dismissed, each newest first.
export function needsRows(snap, key) {
  const mine = (r) => !key || key === ALL || r.machine === key;
  const byAge = (a, b) => a.ms - b.ms;
  const waiting = snap.rows.filter(r => r.agent && r.kind === "waiting" && mine(r)).sort(byAge);
  return [...waiting, ...finishedRows(snap).filter(mine).sort(byAge)];
}

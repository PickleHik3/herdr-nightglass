// tokyo-night-phone: the top bar (app button, search, usage rings, menu with dot), the menu popup
// and the Claude/Codex usage popover. Design: design/Phone.dc.html (header, usage sheet).
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, props, spaces, panes, machines, focused, shared, setShared, exec } from "herdr";
import { C, MONO, CLEAR, alpha, mix, dur, ico, ring, level, setPressed, getPressed, raised, rim, inset } from "./lib.js";
import { USAGE_MACHINE, parseUsageJson } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg, pico, ringS, anchorBelowRight } from "./phone.js";

const USAGE_KEY = "tokyo-night.usage";                   // the desktop mod's key: same data, same format
const USAGE_OPEN = "tokyo-night-phone.usage-open";     // true while the popover is shown
const USAGE_CLOSED = "tokyo-night-phone.usage-closed";  // ms when it last closed
const MENU_W = 232;
const MENU_ITEM = 44;
// Popover: 10 pad + legend 22 + n rows, n gaps of 6, 10 pad. A row measured on the phone (zoom 2.5) is ~92 designed px
// (ring 34 + three text lines at the app's line height), not the board's 62; the list scrolls when the window is shorter.
const usageHeight = (n) => 20 + 22 + n * 92 + n * 6;

// ---- pollers (called from timers, each with its own cx): as the desktop header does ----
const place = (s) => {
  const tabs = new Set((s.tabs ?? []).map(t => t.id));
  return panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
};
export function pollChanges(view, cx) {
  const f = focused();
  const sp = f && spaces().find(s => s.id === f.space);
  const cwd = sp && (f.cwd || place(sp));
  if (!sp || !cwd) { if (view.changes) { view.changes = 0; cx.notify(); } return; }
  const key = `${sp.machine}|${cwd}`, now = Date.now();
  if (view.chBusy || (key === view.chKey && now - view.chAt < 10000)) return;
  view.chKey = key; view.chAt = now; view.chBusy = true;
  cx.spawn(async (cx) => {
    let n = 0;
    try {
      const r = await exec("git", ["--no-optional-locks", "status", "--porcelain"], { cwd, on: sp.machine });
      n = r.code === 0 ? r.stdout.split("\n").filter(Boolean).length : 0;
    } catch { n = 0; }
    view.chBusy = false;
    if (n !== view.changes) { view.changes = n; cx.notify(); }
  });
}
// ai-usage-tui --json (by path: ~/.local/bin isn't on sh's PATH there) on USAGE_MACHINE every 120 s, shared as parsed data.
export function pollUsage(view, cx) {
  if (view.usageBusy) return;
  const m = machines().find(x => x.name === USAGE_MACHINE);
  if (!m || m.layout !== "ready") return;
  const now = Date.now(), cur = shared(USAGE_KEY);
  const wait = cur?.rows?.length ? 120000 : 20000;
  if (view.usageTried && now - view.usageTried < wait) return;
  view.usageTried = now; view.usageBusy = true;
  cx.spawn(async (cx) => {
    let rows = null;
    try {
      const r = await exec("sh", ["-c", '"$HOME/.local/bin/ai-usage-tui" --json'], { on: USAGE_MACHINE, timeout: 60000 });
      if (r.code === 0) rows = parseUsageJson(r.stdout);
    } catch { rows = null; }
    view.usageBusy = false;
    if (rows && rows.length) setShared(USAGE_KEY, { at: Date.now(), rows, stale: false });
    else { const prev = shared(USAGE_KEY); if (prev && !prev.stale) setShared(USAGE_KEY, { ...prev, stale: true }); }
  });
}

const toolIcon = (tool, size) => image(`icons/${tool === "codex" ? "codex" : "claude"}.svg`).size(size).flex_none();
const resetIn = (at) => at ? dur(at * 1000 - Date.now()) : null;
const ringColors = (u) => [level(u.week ?? 0, C.accent), level(u.five ?? 0, C.teal)];

// ---- the bar ----
export function renderTopbar(view) {
  const u = shared(USAGE_KEY);
  const rows = u?.rows ?? [];
  const usageOpen = shared(USAGE_OPEN) === true;
  const z = zoom();
  const Wd = WIN.w > 0 ? dsg(WIN.w) : DESIGN_W;      // window width, designed px
  const Hd = WIN.h > 0 ? dsg(WIN.h) : 915;           // window height, designed px
  const openUsage = () => {
    // A press outside the popover closes it first; don't reopen it with the click that follows.
    if (Date.now() - (shared(USAGE_CLOSED) ?? 0) < 400) return;
    if (usageOpen && view.usageId) { closeOverlay(view.usageId); return; }
    // Width: a share of the window with 8 designed px margins. Height: at most the window below the bar, minus a margin;
    // the popover shrinks to its rows (a popup is "as tall as its content, `height` the most") and scrolls beyond that.
    // `at` is in screen px (window.rs: px(num)), so the 8 / 58 designed offsets are multiplied by the zoom.
    const h = Math.min(usageHeight(rows.length), Math.max(160, Hd - 58 - 12));
    view.usageId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: (Wd - 16) / Wd, height: h, at: { x: Math.round(8 * z), y: Math.round(58 * z) }, props: { role: "usage", h } });
  };
  // Rings grouped by tool, each group led by its icon (as the desktop usage card does).
  const groups = [];
  for (const r of rows) {
    const tool = r.tool === "codex" ? "codex" : "claude";
    const g = groups.find(x => x.tool === tool) ?? (groups.push({ tool, rows: [] }), groups[groups.length - 1]);
    g.rows.push(r);
  }
  // Bar: 14 + 28 + 4 + 44 + 8 + 3 gaps of 6 = 116 designed px besides the search and rings pills.
  const SEARCH_MIN = 150, n = rows.length;
  let RING = 16;
  const ringsW = (size, icons) => 16 + n * size + Math.max(0, n - 1) * 2 + (icons ? groups.length * 18 + (groups.length - 1) * 4 : 0);
  const room = Wd - 116 - SEARCH_MIN;
  const showIcons = n > 0 && ringsW(RING, true) <= room;
  if (n > 0 && !showIcons && ringsW(RING, false) > room) RING = 12;
  return h_flex().id("tnp-top").size_full().pl(14).pr(8).pt(4).gap(6).items_center()
    .on_size_change((size, cx) => { WIN.w = size.width; if (Math.abs((view.topW ?? 0) - size.width) >= 1) { view.topW = size.width; cx.notify(); } })
    // app button
    .child(h_flex().size(28).flex_none().rounded(6).bg(C.accent).justify_center().items_center().child(ico("logo", 16, C.ink)))
    // search: opens the app's command palette (a text field cannot be hosted here)
    .child(h_flex().id("tnp-search").flex_1().min_w(0).h(40).ml(4).px(12).gap(8).items_center().rounded(20)
      .bg(inset()).border(1).border_color(rim()).text_size(13).text_color(C.dim).cursor_pointer()
      .on_click(() => run("app.palette"))
      .child(ico("search", 14, C.dim))
      .child(div().min_w(0).truncate().child("Search")))
    // usage rings: a compact pill; tool icons only when the search pill keeps >= SEARCH_MIN designed px
    .when(rows.length > 0, el => el.child((usageOpen ? h_flex().bg(inset()).border(1).border_color(rim()) : raised(h_flex(), C.chrome))
      .id("tnp-rings").h(40).flex_none().px(8).gap(showIcons ? 6 : 0).items_center().rounded(20).cursor_pointer()
      .opacity(u?.stale ? 0.6 : 1)
      .on_click(openUsage)
      .children(groups.map(g => h_flex().flex_none().gap(2).items_center()
        .when(showIcons, e => e.child(h_flex().w(18).flex_none().items_center().child(toolIcon(g.tool, 14))))
        .children(g.rows.map(r => { const [wc, hc] = ringColors(r); return ringS(RING, r.week, r.five, wc, hc); }))))))
    // menu, with the amber dot while the focused space has uncommitted changes
    .child(h_flex().id("tnp-menu").size(44).flex_none().relative().justify_center().items_center().rounded(8).cursor_pointer()
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorBelowRight(e, MENU_W, view.topW || WIN.w)); })
      .on_click(() => openOverlay({ mod: MOD, kind: "popup", frame: "none", width: MENU_W, height: 12 + 5 * MENU_ITEM + 4 * 2, at: getPressed(), props: { role: "menu", changes: view.changes ?? 0 } }))
      .child(pico("menu", 18, C.muted))
      .when((view.changes ?? 0) > 0, el => el.child(div().absolute().top(7).right(6).size(11).rounded(6).bg(C.amber).border(2).border_color(C.canvas))));
}

// ---- popup: menu ----
export function renderMenu() {
  const p = props();
  const item = (id, icon, label, hint, go) => h_flex().id(id).w_full().h(MENU_ITEM).flex_none().px(12).gap(12).items_center().rounded(8)
    .text_size(13).text_color(C.fg).cursor_pointer()
    .on_click(() => { closeOverlay(p.overlay); go(); })
    .child(ico(icon, 15, C.muted)).child(div().flex_1().min_w(0).truncate().child(label))
    .when(!!hint, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.amber).child(hint)));
  return v_flex().id("tnp-menu-pop").w_full().h(12 + 5 * MENU_ITEM + 4 * 2).bg(C.surface).rounded(12).border(1).border_color(rim())
    .shadow_xl().overflow_hidden().p(5).gap(2)
    .child(item("tnp-m-space", "folder", "New space", "", () => run("space.new", {})))
    .child(item("tnp-m-tab", "terminal", "New terminal tab", "", () => run("tab.new", {})))
    .child(item("tnp-m-files", "file", "Files", "", () => run("tab.new", { mod: "files" })))
    .child(item("tnp-m-changes", "changes", "Changes", p.changes > 0 ? `+${p.changes}` : "", () => run("tab.new", { mod: "changes" })))
    .child(item("tnp-m-settings", "settings", "Settings", "", () => run("app.settings", {})));
}

// ---- popover: usage (the desktop usage card's content, as a sheet under the bar) ----
// Called by the popover copy's init() and close() (main.js): the bar shows its pressed state from this.
export function usageOpened() { setShared(USAGE_OPEN, true); }
export function usageClosed() { setShared(USAGE_OPEN, false); setShared(USAGE_CLOSED, Date.now()); }

export function renderUsage() {
  const p = props();
  const u = shared(USAGE_KEY);
  const rows = u?.rows ?? [];
  const age = u?.at ? (Date.now() - u.at < 60000 ? `${Math.max(1, Math.round((Date.now() - u.at) / 1000))}s ago` : `${dur(Date.now() - u.at)} ago`) : "";
  const bar = (label, pct, reset) => h_flex().w_full().gap(6).items_center().font_family(MONO).text_size(11)
    .child(div().w(18).flex_none().text_color(C.dim).child(label))
    .child(div().flex_1().min_w(0).h(4).rounded(2).bg(C.raised).overflow_hidden()
      .when(pct != null, el => el.child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, label === "5h" ? C.teal : C.accent)))))
    .child(div().w(28).flex_none().text_right().text_color(pct == null ? C.dim : level(pct, C.muted)).child(pct == null ? "–" : `${Math.round(pct)}%`))
    .child(div().w(46).flex_none().text_right().whitespace_nowrap().text_color(C.dim).child(reset ?? ""));
  const row = (r) => {
    const hot = (r.week ?? 0) >= 85 || (r.five ?? 0) >= 85;
    const [wc, hc] = ringColors(r);
    return h_flex().w_full().flex_none().gap(10).px(8).py(5).items_center().rounded(10)
      .bg(hot ? alpha(C.red, 0.1) : CLEAR).border(1).border_color(hot ? alpha(C.red, 0.4) : CLEAR)
      .child(ring(34, r.week, r.five, wc, hc))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(6).items_center().child(toolIcon(r.tool, 12)).child(div().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(r.name))
          .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(r.plan))
          .when(!!r.saved, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.amber).child(`saved ${dur(Date.now() - r.saved * 1000)}`))))
        .when(!!r.note, el => el.child(div().text_size(11).text_color(C.amber).truncate().child(r.note)))
        .when(!r.note, el => el.child(bar("wk", r.week, resetIn(r.weekAt))).child(bar("5h", r.five, resetIn(r.fiveAt)))));
  };
  return v_flex().id("tnp-usage").w_full().max_h(p.h ?? usageHeight(rows.length)).min_h(0).bg(mix("#000000", C.chrome, 0.18)).rounded(14).border(1).border_color(rim())
    .shadow_2xl().overflow_hidden().p(10).gap(6).opacity(u?.stale ? 0.6 : 1)
    .child(h_flex().w_full().h(22).flex_none().gap(12).px(4).items_center().text_size(11).text_color(C.dim)
      .child(h_flex().gap(5).items_center().child(div().size(9).rounded(5).border(2).border_color(C.dim)).child(div().child("outer: week")))
      .child(h_flex().gap(5).items_center().child(div().size(5).rounded(3).bg(C.dim)).child(div().child("inner: 5-hour")))
      .child(div().flex_1())
      .child(div().flex_none().font_family(MONO).text_color(C.dim).child(u?.stale ? `stale · ${age}` : age)))
    .child(v_flex().id("tnp-usage-list").w_full().flex_1().min_h(0).gap(6).overflow_y_scroll().children(rows.map(row)));
}

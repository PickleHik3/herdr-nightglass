// tokyo-night: the header (search pill, usage rings, panel toggles, window buttons) and the usage popup.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, props, spaces, panes, machines, focused, layout, window, shared, setShared, exec } from "herdr";
import { C, MONO, CLEAR, alpha, dur, ico, ring, level, stop, findNode, anchorBelowRight, setPressed, getPressed, bindingOf } from "./lib.js";
import { snapshot, USAGE_MACHINE, parseUsageJson } from "./data.js";

const MOD = "tokyo-night";
const USAGE_KEY = "tokyo-night.usage";
const USAGE_W = 392;
const ROW_H = 54;
const RIGHT_RESERVE = 360; // Files + Changes +N + Settings + window buttons
const usageHeight = (n) => Math.min(720, 24 + 18 + 16 + n * ROW_H + 34 + (n + 2) * 8);

// ---- pollers (called from timers, each with its own cx) ----
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
// ai-usage-tui --json (by path: ~/.local/bin isn't on sh's PATH there) on USAGE_MACHINE every 120 s (it calls the Anthropic usage endpoints), shared as parsed data.
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

// ---- Files / Changes panel, remembered per space (as dynamic-board does) ----
function syncPanel(view, space, panel, body, enabled) {
  if (!space || !panel) return;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { stored = {}; }
  view.panels ??= stored;
  const now = panel.hidden ? null : body?.active ?? null;
  if (space.id !== view.panelSpace) {
    const first = view.panelSpace === undefined;
    view.panelSpace = space.id; view.panelPending = null;
    if (!(first && !(space.id in view.panels))) {
      const s = view.panels[space.id] ?? null, want = enabled.includes(s) ? s : null;
      if (want !== now) {
        view.panelPending = { want, until: Date.now() + 1000 };
        if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
        else run("layout.hide", { id: "panel" });
        return;
      }
    }
  }
  if (view.panelPending) {
    if (view.panelPending.want !== now && Date.now() < view.panelPending.until) return;
    view.panelPending = null;
  }
  if (view.panels[space.id] === now) return;
  view.panels[space.id] = now;
  try { localStorage.setItem("panels", JSON.stringify(view.panels)); } catch { /* storage unavailable */ }
}
function panelButtons(view) {
  const root = layout();
  const panel = findNode(root, "panel"), body = findNode(root, "panel-body");
  if (!panel || !body) return [];
  syncPanel(view, spaces().find(s => s.active), panel, body, ["files", "changes"]);
  const btn = (id, label, icon, extra) => {
    const on = !panel.hidden && body.active === id;
    return h_flex().id(`tn-panel-${id}`).h(28).px(10).gap(6).flex_none().items_center().rounded(6)
      .bg(on ? alpha(C.accent, 0.18) : C.surface).text_size(12).text_color(on ? C.accent : C.muted)
      .cursor_pointer().hover(s => s.bg(on ? alpha(C.accent, 0.24) : C.raised))
      .on_mouse_down("left", stop)
      .on_click(() => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      })
      .child(ico(icon, 13, on ? C.accent : C.muted)).child(div().child(label))
      .when(!!extra, el => el.child(div().font_family(MONO).text_size(11).text_color(C.amber).child(extra)));
  };
  return [btn("files", "Files", "file"), btn("changes", "Changes", "changes", view.changes > 0 ? `+${view.changes}` : "")];
}

function windowButtons() {
  const btn = (id, icon, action, danger) => h_flex().id(id).w(30).h(28).flex_none().justify_center().items_center().rounded(6)
    .cursor_pointer().hover(s => s.bg(danger ? C.red : C.raised))
    .on_mouse_down("left", stop).on_click(action).child(ico(icon, 12, C.dim));
  return [
    btn("tn-win-min", "win-min", () => run("window.minimize")),
    btn("tn-win-max", "win-max", () => run("window.maximize")),
    btn("tn-win-close", "win-close", () => run("window.close"), true),
  ];
}

const TOOL_ICON = 12;
const toolIcon = (tool, size) => image(`icons/${tool === "codex" ? "codex" : "claude"}.svg`).size(size).flex_none();
const resetIn = (at) => at ? dur(at * 1000 - Date.now()) : null;
const ringColors = (u) => [level(u.week ?? 0, C.accent), level(u.five ?? 0, C.teal)];

export function renderHeader(view) {
  const snap = snapshot();
  // Stable sample: the lowest terminal address, so the pill's text doesn't change with focus.
  const sample = snap.rows.map(r => r.short).filter(Boolean)
    .sort((a, b) => (parseInt(a.slice(1)) || 0) - (parseInt(b.slice(1)) || 0))[0] ?? "t1";
  const key = bindingOf("app.palette");
  const win = !!window()?.buttons;
  // The pill is placed absolutely from the header's own width, centered in the space left of a
  // fixed reserve for the right-hand buttons: nothing on the right (usage rings loading, the
  // Changes count) can resize or move it.
  const W = view.headerW ?? 0;
  const pillW = Math.max(200, Math.min(440, W - RIGHT_RESERVE - 48));
  const pillX = Math.max(12, Math.round((W - RIGHT_RESERVE - pillW) / 2));
  return h_flex().id("tn-header").relative().size_full().px(12).gap(8).items_center().overflow_hidden()
    .on_size_change((size, cx) => { if (Math.abs((view.headerW ?? 0) - size.width) >= 1) { view.headerW = size.width; cx.notify(); } })
    .when(W > 0, el => el.child(h_flex().id("tn-search").absolute().left(pillX).top(4).w(pillW).h(30).pl(10).pr(6).gap(8).items_center().rounded(15)
      .bg(C.chrome).border(1).border_color(C.raised).text_size(12).text_color(C.dim).cursor_pointer()
      .on_mouse_down("left", stop).on_click(() => run("app.palette"))
      .child(ico("search", 13, C.dim))
      .child(h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap()
        .child(div().flex_none().child("Jump to an agent, "))
        .child(div().flex_none().font_family(MONO).text_color(C.muted).child(sample))
        .child(div().flex_none().child(", or a command")))
      .when(!!key, el => el.child(div().flex_none().px(8).py(1).rounded(10).bg(C.raised).font_family(MONO).text_size(11)
        .text_color(C.muted).child(key)))))
    .child(div().flex_1().h(1))
    .children(panelButtons(view))
    .child(h_flex().id("tn-settings").size(28).flex_none().justify_center().items_center().rounded(6).cursor_pointer()
      .hover(s => s.bg(C.raised)).tooltip("Settings")
      .on_mouse_down("left", stop).on_click(() => run("app.settings")).child(ico("settings", 15, C.dim)))
    .when(win, el => el.child(div().w(6)).children(windowButtons()));
}

// ---- Claude usage card (sidebar, above the stats card) ----
// Collapsed: one row of rings. Tapped: grows upward into a card with a row per account.
export function usageCard(view) {
  const u = shared(USAGE_KEY);
  const rows = u?.rows ?? [];
  if (!rows.length || !machines().some(m => m.name === USAGE_MACHINE)) return null;
  const openState = view.usageOpen ?? (view.usageOpen = (() => { try { return localStorage.getItem("usageOpen") === "1"; } catch { return false; } })());
  const toggle = (_e, cx) => {
    view.usageOpen = !openState;
    try { localStorage.setItem("usageOpen", view.usageOpen ? "1" : "0"); } catch { /* storage unavailable */ }
    cx.notify();
  };
  const age = u.at ? (Date.now() - u.at < 60000 ? `${Math.max(1, Math.round((Date.now() - u.at) / 1000))}s ago` : `${dur(Date.now() - u.at)} ago`) : "";
  // The head is the rings grouped by tool, each group led by its icon (Herdr's own program
  // icons, full color). Every ring gets the same slot width, so they stay evenly spaced.
  const groups = [];
  for (const r of rows) {
    const tool = r.tool === "codex" ? "codex" : "claude";
    const g = groups.find(x => x.tool === tool) ?? (groups.push({ tool, rows: [] }), groups[groups.length - 1]);
    g.rows.push(r);
  }
  const inner = (view.width ?? 268) - 20 - 24 - 2;
  const GROUP_GAP = 10;
  const slot = Math.max(22, Math.floor((inner - groups.length * (TOOL_ICON + 6) - (groups.length - 1) * GROUP_GAP) / rows.length));
  const head = h_flex().id("tn-usage-head").w_full().h(20).flex_none().items_center().cursor_pointer().on_click(toggle)
    .children(groups.map((g, i) => h_flex().flex_none().items_center().when(i > 0, el => el.ml(GROUP_GAP))
      .child(h_flex().w(TOOL_ICON + 6).flex_none().items_center().child(toolIcon(g.tool, TOOL_ICON)))
      .children(g.rows.map(r => { const [wc, hc] = ringColors(r); return h_flex().w(slot).flex_none().justify_center().child(ring(20, r.week, r.five, wc, hc)); }))));
  const card = v_flex().id("tn-usage").w_full().flex_none().bg(C.surface).rounded(16).px(12).pt(10).pb(11).gap(8)
    .opacity(u.stale ? 0.6 : 1).hover(s => s.bg(openState ? C.surface : C.raised))
    .tooltip(openState ? "" : `Claude usage · ${rows.length} account${rows.length === 1 ? "" : "s"} · ai-usage-tui on ${USAGE_MACHINE}`)
    .child(head);
  if (!openState) return card;
  const bar = (label, pct, reset) => h_flex().w_full().gap(6).items_center().font_family(MONO).text_size(11)
    .child(div().w(18).flex_none().text_color(C.dim).child(label))
    .child(div().flex_1().min_w(0).h(4).rounded(2).bg(C.raised).overflow_hidden()
      .when(pct != null, el => el.child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, label === "5h" ? C.teal : C.accent)))))
    .child(div().w(28).flex_none().text_right().text_color(pct == null ? C.dim : level(pct, C.muted)).child(pct == null ? "–" : `${Math.round(pct)}%`))
    .child(div().w(46).flex_none().text_right().whitespace_nowrap().text_color(C.dim).child(reset ?? ""));
  const row = (r) => {
    const hot = (r.week ?? 0) >= 85 || (r.five ?? 0) >= 85;
    const [wc, hc] = ringColors(r);
    return h_flex().w_full().flex_none().gap(10).px(6).py(6).items_center().rounded(12)
      .bg(hot ? alpha(C.red, 0.1) : CLEAR).border(1).border_color(hot ? alpha(C.red, 0.4) : CLEAR)
      .child(ring(30, r.week, r.five, wc, hc))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(6).items_center().child(toolIcon(r.tool, 12)).child(div().text_size(12).font_semibold().text_color(C.fg).child(r.name))
          .child(div().font_family(MONO).text_size(11).text_color(C.dim).child(r.plan))
          .when(!!r.saved, el => el.child(div().font_family(MONO).text_size(11).text_color(C.amber).child(`saved ${dur(Date.now() - r.saved * 1000)}`))))
        .when(!!r.note, el => el.child(div().text_size(11).text_color(C.amber).truncate().child(r.note)))
        .when(!r.note, el => el.child(bar("wk", r.week, resetIn(r.weekAt))).child(bar("5h", r.five, resetIn(r.fiveAt)))));
  };
  return card
    .child(h_flex().w_full().flex_none().gap(12).items_center().text_size(11).text_color(C.dim)
      .child(h_flex().gap(5).items_center().child(div().size(9).rounded(5).border(2).border_color(C.dim)).child(div().child("outer: week")))
      .child(h_flex().gap(5).items_center().child(div().size(5).rounded(3).bg(C.dim)).child(div().child("inner: 5-hour")))
      .child(div().flex_1())
      .child(div().flex_none().font_family(MONO).text_color(C.dim).child(u.stale ? `stale · ${age}` : age)))
    .children(rows.map(row))
    .child(h_flex().id("tn-usage-fold").w_full().h(14).flex_none().justify_center().items_center().rounded(7).cursor_pointer()
      .tooltip("Collapse").hover(s => s.bg(C.raised)).on_click(toggle).child(ico("chevron-down", 12, C.dim)));
}

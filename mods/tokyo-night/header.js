// tokyo-night: the header (search pill, usage rings, panel toggles, window buttons) and the usage popup.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, props, spaces, panes, machines, focused, layout, window, shared, setShared, exec } from "herdr";
import { C, MONO, CLEAR, alpha, dur, ico, ring, level, stop, findNode, anchorBelowRight, setPressed, getPressed, bindingOf } from "./lib.js";
import { snapshot, USAGE_MACHINE, parseUsageJson } from "./data.js";

const MOD = "tokyo-night";
const USAGE_KEY = "tokyo-night.usage";
const USAGE_W = 392;
const ROW_H = 54;
const RIGHT_RESERVE = 500; // usage rings (≤6) + Files + Changes +N + Settings + window buttons
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

// ---- usage ----
const resetIn = (at) => at ? dur(at * 1000 - Date.now()) : null;
const ringColors = (u) => [level(u.week ?? 0, C.accent), level(u.five ?? 0, C.teal)];
function usageButton(u) {
  const rows = u.rows;
  return h_flex().id("tn-usage").h(30).flex_none().px(7).gap(3).items_center().rounded(15)
    .bg(C.chrome).border(1).border_color(C.raised).opacity(u.stale ? 0.55 : 1).cursor_pointer()
    .tooltip(`Claude usage for ${rows.length} account${rows.length === 1 ? "" : "s"}${u.stale ? " (stale)" : ""}`)
    .hover(s => s.bg(C.surface))
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorBelowRight(e, USAGE_W)); })
    .on_click(() => openOverlay({ mod: MOD, kind: "popup", frame: "none", width: USAGE_W, height: usageHeight(rows.length),
      at: getPressed(), props: { role: "usage", h: usageHeight(rows.length) } }))
    .children(rows.map(r => { const [wc, hc] = ringColors(r); return ring(22, r.week, r.five, wc, hc); }));
}

export function renderHeader(view) {
  const snap = snapshot();
  const u = shared(USAGE_KEY);
  const showUsage = !!u?.rows?.length && machines().some(m => m.name === USAGE_MACHINE);
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
    .when(showUsage, el => el.child(usageButton(u)))
    .children(panelButtons(view))
    .child(h_flex().id("tn-settings").size(28).flex_none().justify_center().items_center().rounded(6).cursor_pointer()
      .hover(s => s.bg(C.raised)).tooltip("Settings")
      .on_mouse_down("left", stop).on_click(() => run("app.settings")).child(ico("settings", 15, C.dim)))
    .when(win, el => el.child(div().w(6)).children(windowButtons()));
}

// ---- popup: Claude usage ----
export function renderUsagePopup() {
  const p = props();
  const snap = snapshot();
  const u = shared(USAGE_KEY) ?? { rows: [], at: 0 };
  const rows = u.rows ?? [];
  const age = u.at ? (Date.now() - u.at < 60000 ? `${Math.max(1, Math.round((Date.now() - u.at) / 1000))}s ago` : `${dur(Date.now() - u.at)} ago`) : "";
  const fs = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
  const open = () => {
    closeOverlay(p.overlay);
    if (fs?.machine === USAGE_MACHINE) run("tab.new", { argv: ["ai-usage-tui"] });
    else run("space.new", { machine: USAGE_MACHINE, name: "usage", argv: ["ai-usage-tui"] });
  };
  const bar = (label, pct, reset) => h_flex().w_full().gap(8).items_center().font_family(MONO).text_size(11)
    .child(div().w(30).flex_none().text_color(C.dim).child(label))
    .child(div().flex_1().min_w(0).h(4).rounded(2).bg(C.raised).overflow_hidden()
      .when(pct != null, el => el.child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, label === "5h" ? C.teal : C.accent)))))
    .child(div().w(30).flex_none().text_right().text_color(pct == null ? C.dim : level(pct, C.muted)).child(pct == null ? "–" : `${Math.round(pct)}%`))
    .child(div().w(72).flex_none().whitespace_nowrap().text_color(C.dim).child(reset ? `in ${reset}` : ""));
  const legend = (dot, text) => h_flex().gap(5).items_center().child(dot).child(div().child(text));
  const row = (r) => {
    const hot = (r.week ?? 0) >= 85 || (r.five ?? 0) >= 85;
    const [wc, hc] = ringColors(r);
    return h_flex().w_full().h(ROW_H).flex_none().gap(12).px(10).items_center().rounded(12)
      .bg(hot ? alpha(C.red, 0.1) : CLEAR).border(1).border_color(hot ? alpha(C.red, 0.4) : CLEAR)
      .child(ring(36, r.week, r.five, wc, hc))
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(h_flex().gap(8).items_baseline().child(div().text_size(12).font_semibold().text_color(C.fg).child(r.name))
          .child(div().font_family(MONO).text_size(11).text_color(C.dim).child(r.plan))
          .when(!!r.saved, el => el.child(div().font_family(MONO).text_size(11).text_color(C.amber).child(`saved ${dur(Date.now() - r.saved * 1000)} ago`))))
        .when(!!r.note, el => el.child(div().text_size(11).text_color(C.amber).truncate().child(r.note)))
        .when(!r.note, el => el.child(bar("week", r.week, resetIn(r.weekAt))).child(bar("5h", r.five, resetIn(r.fiveAt)))));
  };
  return v_flex().id("tn-usage-pop").w_full().h(p.h ?? usageHeight(rows.length)).bg(C.surface).rounded(16)
    .border(1).border_color(C.raised).overflow_hidden().p(12).gap(8)
    .child(h_flex().w_full().h(18).flex_none().gap(8).px(4).items_baseline()
      .child(div().text_size(13).font_semibold().text_color(C.fg).child("Claude usage"))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(C.dim)
        .child(`${rows.length} account${rows.length === 1 ? "" : "s"} · ai-usage-tui on ${USAGE_MACHINE}${u.stale ? " · stale" : ""}`))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(age)))
    .child(h_flex().w_full().h(16).flex_none().gap(14).px(4).text_size(11).text_color(C.dim)
      .child(legend(div().size(9).rounded(5).border(2.5).border_color(C.dim), "Outer ring: this week"))
      .child(legend(div().size(5).rounded(3).bg(C.dim), "Inner ring: 5-hour window")))
    .children(rows.map(row))
    .child(h_flex().id("tn-usage-open").w_full().h(32).flex_none().mt(2).gap(8).justify_center().items_center().rounded(16)
      .bg(C.raised).text_size(12).font_medium().text_color(C.fg).cursor_pointer().hover(s => s.bg(C.input))
      .on_click(open).child(ico("terminal", 13, C.cyan)).child(div().child("Open ai-usage-tui in a new tab")));
}

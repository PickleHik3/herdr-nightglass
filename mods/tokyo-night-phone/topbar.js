// tokyo-night-phone: the top bar (search button, stats rings, usage rings, panel toggle with the changes dot)
// and the two popovers its widgets open: Claude/Codex usage and machine stats (cpu / ram / disk of the machine in front).
// Design: design/Phone.dc.html (header, usage sheet); look: Glass (design/GLASS.md).
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, props, spaces, panes, machines, focused, shared, setShared, exec } from "herdr";
import { C, MONO, CLEAR, alpha, dur, ico, ring, level } from "./lib.js";
import { USAGE_MACHINE, parseUsageJson, snapshot, STATS_SCRIPT, parseStats, onArg, statsMachine, ALL } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg, pico, ringS, popupIsOpen, popupJustClosed, swipeArea, swipeBody, panelOpen, setPanel, finishedRows, finishedOpen, setFinishedOpen } from "./phone.js";

const USAGE_KEY = "tokyo-night.usage";                   // the desktop mod's key: same data, same format
const STATS_KEY = "tokyo-night-phone.stats";             // { key, name, at, data, fail, offline } of the machine in front
// Stats popover: 10 pad, header 16, three 22 px rows, 8 gaps, 10 pad.
const STATS_H = 20 + 16 + 3 * 22 + 3 * 8;
const RS = 24; // stats ring size (icon 12 inside)
const diskUsed = (data) => data.diskTotal > 0 ? Math.round(100 - data.diskFree / data.diskTotal * 100) : 0;
const diskFreeText = (data) => `${data.diskFree >= 100 ? Math.round(data.diskFree) : data.diskFree.toFixed(1)} GB free`;
// Popover (Glass usage panel, as the desktop's): 10 pad, legend 16, one 62 px well per account, 8 gaps, 10 pad.
const UROW = 62;
const usageHeight = (n) => 20 + 16 + n * UROW + n * 8;

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
    if (n !== view.changes) { view.changes = n; setShared("tokyo-night-phone.changes", n); cx.notify(); }
  });
}
// The stats of the machine in front (the focused space's; the first when nothing is focused): one exec every 15 s (3 s
// apart at the first), shared as parsed data for the popover. Moved here from the retired bottom row.
export function pollStats(view, cx, force) {
  const snap = snapshot();
  const m = statsMachine(snap, ALL);
  if (!m || m.offline || m.layout !== "ready" || view.statsBusy[m.key]) return;
  const key = m.key, now = Date.now();
  const entry = view.stats[key] ?? (view.stats[key] = { tried: 0 });
  const gap = force ? 3000 : entry.fail ? 60000 : 15000;
  if (now - entry.tried < gap - 500) return;
  entry.tried = now;
  view.statsBusy[key] = true;
  cx.spawn(async (cx) => {
    let data = null;
    try {
      const r = await exec("sh", ["-c", STATS_SCRIPT], { on: onArg(key), timeout: 20000 });
      if (r.code === 0) data = parseStats(r.stdout);
    } catch { data = null; }
    view.statsBusy[key] = false;
    if (data) { entry.data = data; entry.at = Date.now(); entry.fail = false; }
    else if (!entry.data) entry.fail = true; // keep the last good answer otherwise
    setShared(STATS_KEY, { key, name: m.name, at: entry.at ?? 0, data: entry.data ?? null, fail: !!entry.fail });
    cx.notify();
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
  const usageOpen = popupIsOpen("usage");
  const z = zoom();
  const Wd = WIN.w > 0 ? dsg(WIN.w) : DESIGN_W;      // window width, designed px
  const Hd = WIN.h > 0 ? dsg(WIN.h) : 915;           // window height, designed px
  const openUsage = () => {
    // A press outside the popover closes it first; don't reopen it with the click that follows (phone.js popup toggles).
    if (popupJustClosed("usage")) return;
    if (popupIsOpen("usage") && view.usageId) { closeOverlay(view.usageId); return; }
    // Width: a share of the window with 8 designed px margins. Height: at most the window below the bar, minus a margin;
    // the popover shrinks to its rows (a popup is "as tall as its content, `height` the most") and scrolls beyond that.
    // `at` is in screen px (window.rs: px(num)), so the 8 / 58 designed offsets are multiplied by the zoom.
    const h = Math.min(usageHeight(rows.length), Math.max(160, Hd - 58 - 12));
    view.usageId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: (Wd - 16) / Wd, height: h, at: { x: Math.round(8 * z), y: Math.round(58 * z) }, props: { role: "usage", h } });
  };
  // Rings grouped by tool: one well per tool (Glass), the tool icon first when it fits.
  const groups = [];
  for (const r of rows) {
    const tool = r.tool === "codex" ? "codex" : "claude";
    const g = groups.find(x => x.tool === tool) ?? (groups.push({ tool, rows: [] }), groups[groups.length - 1]);
    g.rows.push(r);
  }
  // Stats: the machine in front (focused space's); three single rings (cpu, ram, disk used) in one well, as the usage wells.
  const st = shared(STATS_KEY);
  const sm = statsMachine(snapshot(), ALL);
  const sdata = st && sm && st.key === sm.key ? st.data : null;
  const statsOpen = popupIsOpen("stats");
  const openStats = () => {
    if (popupJustClosed("stats")) return;
    if (popupIsOpen("stats") && view.statsId) { closeOverlay(view.statsId); return; }
    view.statsId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: (Wd - 16) / Wd, height: STATS_H, at: { x: Math.round(8 * z), y: Math.round(58 * z) }, props: { role: "stats", h: STATS_H } });
  };
  // Spacing rule: every item (search, finished count when shown, stats, usage wells, panel toggle) is followed by
  // an equal flexible gap (equal flex_1 spacers), with equal 12 px side padding, so the gaps are the same at any window
  // width. Items first (designed px): search 40, count 40, stats pill 2 x PAD + 3 x 24 + 2 x 2, usage wells
  // (4 apart, each 2 x PAD + rings), toggle 40; the usage wells drop their tool icons, then shrink their rings 16 -> 12,
  // while the gaps would be under 6. When the gap would exceed MAX_GAP (24) the stats pill and each usage well grow:
  // the surplus beyond 24 per gap is added to their inner padding, split evenly over those pills.
  const finished = finishedRows(snapshot()).length;
  const n = rows.length, G = groups.length;
  let RING = 16;
  const wellsW = (size, icons, pad) => G * 2 * pad + n * size + (n - G) * 2 + (icons ? G * 18 : 0) + Math.max(0, G - 1) * 4;
  const items = 3 + (finished > 0 ? 1 : 0) + (n > 0 ? 1 : 0);      // search, stats, toggle (+ count, + usage)
  const gaps = items - 1;
  const statsW = 2 * 8 + 3 * RS + 2 * 2;
  const fixed = 40 + (finished > 0 ? 40 : 0) + statsW + 40;
  const room = Wd - 24 - fixed - gaps * 6;
  const showIcons = n > 0 && wellsW(RING, true, 8) <= room;
  if (n > 0 && !showIcons && wellsW(RING, false, 8) > room) RING = 12;
  const used = fixed + (n > 0 ? wellsW(RING, showIcons, 8) : 0);
  const surplus = Math.max(0, (Wd - 24 - used) - gaps * 24);
  const pills = 1 + G;
  const grow = Math.min(24, surplus / pills / 2);                   // extra padding per side, per pill
  const padS = 8 + grow;
  const gap = () => div().flex_1().min_w(0);
  const ringIcon = (name, pct, color) => h_flex().relative().size(RS).flex_none()
    .child(ringS(RS, pct, 0, color, C.teal))
    .child(div().absolute().top((RS - 12) / 2).left((RS - 12) / 2).child(ico(name, 12, C.muted)));
  const open = panelOpen();
  const hasChanges = (view.changes ?? 0) > 0;
  const BTN = 40;
  return h_flex().id("tnp-top").size_full().px(12).pt(4).items_center()
    .on_size_change((size, cx) => { WIN.w = size.width; if (Math.abs((view.topW ?? 0) - size.width) >= 1) { view.topW = size.width; cx.notify(); } })
    // search: a round button that opens the app's command palette (as the pill did; a text field cannot be hosted here)
    .child(h_flex().id("tnp-search").size(BTN).flex_none().justify_center().items_center().rounded(20)
      .bg(C.well).border(1).border_color(C.rim).cursor_pointer()
      .on_click(() => run("app.palette"))
      .child(ico("search", 16, C.muted)))
    .child(gap())
    // finished count: filled green, only while something finished and was not dismissed; toggles the chip row of finished agents
    .when(finished > 0, el => el.child(h_flex().id("tnp-done").size(BTN).flex_none().justify_center().items_center().rounded(20)
        .bg(C.green).border(2).border_color(finishedOpen() ? C.fg : C.green).cursor_pointer()
        .on_click((_e, cx) => { setFinishedOpen(!finishedOpen()); cx.notify(); })
        .child(div().font_family(MONO).text_size(15).font_semibold().text_color(C.ink).child(String(finished))))
      .child(gap()))
    // stats rings, each with its icon (cpu chip, ram module, disk): one well, opens the popover
    .child(h_flex().id("tnp-stats").h(BTN).flex_none().px(padS).gap(2).items_center().rounded(20).cursor_pointer()
      .bg(statsOpen ? C.raised : C.well).border(1).border_color(C.rim).opacity(sdata && !sm?.offline ? 1 : 0.55)
      .on_click(openStats)
      .child(ringIcon("cpu", sdata?.cpu, level(sdata?.cpu ?? 0, C.accent)))
      .child(ringIcon("ram", sdata?.memPct, level(sdata?.memPct ?? 0, C.teal)))
      .child(ringIcon("disk", sdata ? diskUsed(sdata) : 0, level(sdata ? diskUsed(sdata) : 0, C.fg))))
    .child(gap())
    // usage rings: one well per tool; all of them open the popover
    .when(n > 0, el => el.child(h_flex().id("tnp-rings").flex_none().gap(4).items_center().cursor_pointer()
      .opacity(u?.stale ? 0.6 : 1)
      .on_click(openUsage)
      .children(groups.map(g => h_flex().h(40).flex_none().px(padS).gap(2).items_center().rounded(20)
        .bg(usageOpen ? C.raised : C.well).border(1).border_color(C.rim)
        .when(showIcons, e => e.child(h_flex().w(18).flex_none().items_center().child(toolIcon(g.tool, 14))))
        .children(g.rows.map(r => { const [wc, hc] = ringColors(r); return ringS(RING, r.week, r.five, wc, hc); })))))
      .child(gap()))
    // panel toggle (machines, actions, agents under the bar), with the amber dot while the focused space has uncommitted
    // changes; active look (raised fill, accent rim, bright icon) while the panel is open
    .child(h_flex().id("tnp-menu").size(BTN).flex_none().relative().justify_center().items_center().rounded(20)
      .bg(open ? C.raisedHi : CLEAR).border(1).border_color(open ? alpha(C.accent, 0.6) : CLEAR).cursor_pointer()
      .on_click((_e, cx) => { setPanel(!panelOpen()); cx.notify(); })
      .child(pico("menu", 18, open ? C.fg : C.muted))
      .when(hasChanges, el => el.child(div().absolute().top(6).right(5).size(11).rounded(6).bg(C.amber).border(2).border_color(C.glassSolid))));
}

// ---- popover: stats of the machine in front (the retired bottom row's numbers: cpu / ram / disk) ----
export function renderStatsPopup() {
  const p = props();
  const s = shared(STATS_KEY);
  const data = s?.data;
  const age = s?.at ? `${Math.max(1, Math.round((Date.now() - s.at) / 1000))}s ago` : "";
  const bar = (label, pct, text) => h_flex().w_full().h(22).flex_none().gap(8).items_center().font_family(MONO).text_size(10.5)
    .child(h_flex().w(40).flex_none().gap(5).items_center().text_color(C.muted).child(ico(label, 13, C.muted)).child(div().child(label)))
    .child(div().flex_1().min_w(0).h(4).rounded(2).bg(C.raised).overflow_hidden()
      .child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, C.fg))))
    .child(div().w(84).flex_none().text_right().truncate().text_color(C.muted).child(text));
  return v_flex().id("tnp-stats-pop").w_full().max_h(p.h ?? STATS_H).min_h(0).bg(C.glassSolid).rounded(12).border(1).border_color(C.rim)
    .shadow_xl().overflow_hidden().p(10).gap(8)
    .child(h_flex().w_full().h(16).flex_none().gap(8).items_center().text_size(11).text_color(C.muted)
      .child(div().min_w(0).truncate().font_semibold().child(s?.name ?? "No machine"))
      .child(div().flex_1())
      .child(div().flex_none().font_family(MONO).text_size(10.5).child(age)))
    .when(!!data, el => el
      .child(bar("cpu", data.cpu, `${data.cpu}%`))
      .child(bar("ram", data.memPct, data.memText))
      .child(bar("disk", diskUsed(data), diskFreeText(data))))
    .when(!data, el => el.child(div().text_size(12).text_color(C.muted).child(s?.fail ? "stats unavailable" : "reading…")));
}

// ---- popover: usage (the desktop's Glass usage panel: legend + one well per account) ----

export function renderUsage() {
  const p = props();
  const u = shared(USAGE_KEY);
  const rows = u?.rows ?? [];
  const age = u?.at ? (Date.now() - u.at < 60000 ? `${Math.max(1, Math.round((Date.now() - u.at) / 1000))}s ago` : `${dur(Date.now() - u.at)} ago`) : "";
  const bar = (label, pct, reset) => h_flex().w_full().gap(6).items_center().font_family(MONO).text_size(10.5)
    .child(div().w(18).flex_none().text_color(C.muted).child(label))
    .child(div().flex_1().min_w(0).h(4).rounded(2).bg(C.raised).overflow_hidden()
      .when(pct != null, el => el.child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, label === "5h" ? C.teal : C.accent)))))
    .child(div().w(28).flex_none().text_right().text_color(pct == null ? C.muted : level(pct, C.muted)).child(pct == null ? "–" : `${Math.round(pct)}%`))
    .child(div().w(46).flex_none().text_right().whitespace_nowrap().text_color(C.muted).child(reset ?? ""));
  const row = (r) => {
    const hot = (r.week ?? 0) >= 85 || (r.five ?? 0) >= 85;
    const [wc, hc] = ringColors(r);
    return h_flex().w_full().h(UROW).flex_none().gap(10).px(8).items_center().rounded(10)
      .bg(hot ? alpha(C.red, 0.16) : C.well)
      .child(ring(30, r.week, r.five, wc, hc))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(6).items_center().child(toolIcon(r.tool, 12)).child(div().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(r.name))
          .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(r.plan))
          .when(!!r.saved, el => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.amber).child(`saved ${dur(Date.now() - r.saved * 1000)}`))))
        .when(!!r.note, el => el.child(div().text_size(11).text_color(C.amber).truncate().child(r.note)))
        .when(!r.note, el => el.child(bar("wk", r.week, resetIn(r.weekAt))).child(bar("5h", r.five, resetIn(r.fiveAt)))));
  };
  // Glass popup: an overlay gets no backdrop blur, so its fill is the opaque glass base (C.glassSolid, as the desktop's pane header
  // and empty view), with rim, shadow_xl, radius 12. The rows scroll inside; the popover is a max height.
  return v_flex().id("tnp-usage").w_full().max_h(p.h ?? usageHeight(rows.length)).min_h(0).bg(C.glassSolid).rounded(12).border(1).border_color(C.rim)
    .shadow_xl().overflow_hidden().p(10).gap(8).opacity(u?.stale ? 0.6 : 1)
    .child(h_flex().w_full().h(16).flex_none().gap(12).items_center().text_size(11).text_color(C.muted)
      .child(h_flex().gap(5).items_center().child(div().size(9).rounded(5).border(2).border_color(C.accent)).child(div().child("outer: week")))
      .child(h_flex().gap(5).items_center().child(div().size(5).rounded(3).bg(C.teal)).child(div().child("inner: 5-hour")))
      .child(div().flex_1())
      .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(u?.stale ? `stale · ${age}` : age)))
    .child(swipeArea(v_flex().id("tnp-usage-list").w_full().flex_1().min_h(0).overflow_y_scroll())
      .child(swipeBody(v_flex().w_full().flex_none().gap(8)).children(rows.map(row))));
}

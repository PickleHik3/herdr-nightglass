// nightglass-phone: what the inbox role polls (git changes of the focused space, cpu / ram / disk of every machine, AI
// usage when on, the shown card's terminal text) and the usage popover its usage row opens.
// Design: design/PhoneConcepts.html (Concept B); look: Glass (design/GLASS.md).
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, spaces, panes, machines, focused, shared, setShared, exec, hc } from "herdr";
import { C, MONO, alpha, dur, ring, level } from "./lib.js";
import { USAGE_MACHINE, parseUsageJson, snapshot, STATS_SCRIPT, parseStats, onArg } from "./data.js";
import { swipeArea, swipeBody } from "./phone.js";

export const USAGE_KEY = "nightglass.usage";            // the desktop mod's key: same data, same format
export const STATS_KEY = "nightglass-phone.stats-all";  // { [machine key]: { at, data, fail } }
export const PREVIEW_KEY = "nightglass-phone.preview";  // { address, lines, at, fail }
export const diskUsed = (data) => data.diskTotal > 0 ? Math.round(100 - data.diskFree / data.diskTotal * 100) : 0;
// Popover (Glass usage panel, as the desktop's): 10 pad, legend 16, one 62 px well per account, 8 gaps, 10 pad.
const UROW = 62;
export const usageHeight = (n) => 20 + 16 + n * UROW + n * 8;

// ---- pollers (called from timers, each with its own cx): as the desktop header does ----
const place = (s) => {
  const tabs = new Set((s.tabs ?? []).map(t => t.id));
  return panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
};
export function pollChanges(view, cx) {
  const f = focused();
  const sp = f && spaces().find(s => s.id === f.space);
  const cwd = sp && (f.cwd || place(sp));
  if (!sp || !cwd) { if (view.changes) { view.changes = 0; setShared("nightglass-phone.changes", 0); cx.notify(); } return; }
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
    if (n !== view.changes) { view.changes = n; setShared("nightglass-phone.changes", n); cx.notify(); }
  });
}
// The stats of every reachable machine (the machine cards show them all): one exec per machine every 15 s (60 s after a
// failure, 3 s apart at the first), at most one started per tick so the machines are staggered. Shared as parsed data.
export function pollStats(view, cx, force) {
  const snap = snapshot();
  const now = Date.now();
  for (const m of snap.machines) {
    if (m.offline || m.layout !== "ready" || view.statsBusy[m.key]) continue;
    const key = m.key;
    const entry = view.stats[key] ?? (view.stats[key] = { tried: 0 });
    const gap = force ? 3000 : entry.fail ? 60000 : 15000;
    if (now - entry.tried < gap - 500) continue;
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
      setShared(STATS_KEY, { ...(shared(STATS_KEY) ?? {}), [key]: { at: entry.at ?? 0, data: entry.data ?? null, fail: !!entry.fail } });
      cx.notify();
    });
    return; // one per tick
  }
}
// Opt-in, as the desktop's: the inbox block's prop "usage" is a machine name, or true for USAGE_MACHINE; no prop, no polling
// and no usage row. main.js reads it at init into view.usageM (timers run outside props()).
export function usageMachine() {
  const u = props()?.usage;
  if (u === true) return USAGE_MACHINE;
  return typeof u === "string" && u ? u : null;
}
// ai-usage-tui --json (by path: ~/.local/bin isn't on sh's PATH there) on the usage machine every 120 s, shared as parsed data.
export function pollUsage(view, cx) {
  const um = view.usageM;
  if (!um || view.usageBusy) return;
  const m = machines().find(x => x.name === um);
  if (!m || m.layout !== "ready") return;
  const now = Date.now(), cur = shared(USAGE_KEY);
  const wait = cur?.rows?.length ? 120000 : 20000;
  if (view.usageTried && now - view.usageTried < wait) return;
  view.usageTried = now; view.usageBusy = true;
  cx.spawn(async (cx) => {
    let rows = null;
    try {
      const r = await exec("sh", ["-c", '"$HOME/.local/bin/ai-usage-tui" --json'], { on: um, timeout: 60000 });
      if (r.code === 0) rows = parseUsageJson(r.stdout);
    } catch { rows = null; }
    view.usageBusy = false;
    if (rows && rows.length) setShared(USAGE_KEY, { at: Date.now(), rows, stale: false });
    else { const prev = shared(USAGE_KEY); if (prev && !prev.stale) setShared(USAGE_KEY, { ...prev, stale: true }); }
  });
}

// ---- the shown card's terminal text: `hc read <t>` (its screen; herdr.d.ts: "hc read <t> gives a terminal's text") ----
// Only the card on screen is read, every PREVIEW_MS while the inbox shows it (the inbox role's timer decides that).
export const PREVIEW_MS = 2500;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
export function pollPreview(view, cx, address, force) {
  if (!address || view.pvBusy) return;
  const now = Date.now();
  if (!force && view.pvAddr === address && now - (view.pvAt ?? 0) < PREVIEW_MS) return;
  view.pvAddr = address; view.pvAt = now; view.pvBusy = true;
  cx.spawn(async (cx) => {
    let lines = null;
    try {
      const r = await hc(["read", address]);
      if (r.code === 0) {
        const all = String(r.stdout).replace(ANSI, "").split("\n").map(l => l.replace(/\s+$/, ""));
        while (all.length && !all[all.length - 1]) all.pop();
        lines = all.slice(-24);
      }
    } catch { lines = null; }
    view.pvBusy = false;
    const prev = shared(PREVIEW_KEY);
    if (lines) setShared(PREVIEW_KEY, { address, lines, at: Date.now(), fail: false });
    else if (prev?.address !== address) setShared(PREVIEW_KEY, { address, lines: [], at: Date.now(), fail: true });
    cx.notify();
  });
}
// The numbered choices of a dialog on screen (Claude Code / Codex permission prompts: "❯ 1. Yes", "  2. Yes, and don't ask
// again ...", "  3. No, and tell ..."), from the last lines of the preview: [{ n, label }] for 1, 2, 3... in order (at most
// three, at least two), or [].
export function dialogChoices(lines) {
  const out = [];
  for (const raw of (lines ?? []).slice(-16)) {
    const l = raw.replace(/^[\s│┃|]+/, "").replace(/[\s│┃|]+$/, "");
    const m = /^(?:[❯›>]\s*)?([1-9])[.)]\s+(.+)$/.exec(l);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === 1) out.length = 0;                 // a later list starts again
    if (n !== out.length + 1) continue;
    out.push({ n, label: m[2] });
  }
  return out.length >= 2 ? out.slice(0, 3) : []; // one numbered line is not a dialog (a list in the agent's output)
}
// "Yes" / "Always" / "No" for the usual permission texts, else the start of the option's own text.
export function choiceLabel(text) {
  const t = String(text).trim();
  if (/don.t ask|always|allow all|for this session/i.test(t)) return "Always";
  if (/^yes\b/i.test(t)) return "Yes";
  if (/^no\b/i.test(t)) return "No";
  return t.split(/[,(]/)[0].trim().slice(0, 12);
}

export const toolIcon = (tool, size) => image(`icons/${tool === "codex" ? "codex" : "claude"}.svg`).size(size).flex_none();
const resetIn = (at) => at ? dur(at * 1000 - Date.now()) : null;
export const ringColors = (u) => [level(u.week ?? 0, C.accent), level(u.five ?? 0, C.teal)];

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

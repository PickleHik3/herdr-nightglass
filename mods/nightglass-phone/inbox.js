// nightglass-phone: the inbox (Concept B "Inbox", design/PhoneConcepts.html; look: Glass, design/GLASS.md). The home view,
// one block that takes the whole column (layout node "inbox"), top to bottom:
//   header   glass box: "herdr", "n waiting · n finished", search (app.palette), "+" (newmenu.js action rows, in flow);
//            under it the AI usage row (one well per tool, a small double ring per account), only with the block prop "usage"
//   machines a sideways-scrolling row of cards: "All machines" + one per machine (tint dot, name, cpu / ram / disk);
//            the cards are the machine filter; tapping the selected machine's card again picks its scheme (colors popup)
//   tabs     "Needs you (n)" | "All agents (n)"
//   body     Needs you: one card at a time (machine, tool, age, address; title, branch; status; the terminal's last lines
//            from `hc read`; the dialog's numbered answers, sent with `hc keys`; Open) with a pager. Empty: "Nothing needs
//            you" and the finished agents already seen. All agents: the agents grouped by machine and space.
// Opening an agent (Open, a row) switches to the detail view (detail.js).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, props, shared, setShared, openOverlay, closeOverlay, setAgentOrder, hc, notify } from "herdr";
import { C, MONO, CLEAR, SCHEMES, COLORS_KEY, alpha, mix, dur, ico, mark, ring, level, machineColor, nearBlack, darkOf, lightOf, anchorBelow } from "./lib.js";
import { snapshot, LOCAL, ALL, mArg, lastSeen, statsMachine } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg, pico, popupIsOpen, popupJustClosed, swipeArea, swipeBody, watchScroll, tap, needsRows, finishedRows, isDismissed, dismissRows } from "./phone.js";
import { USAGE_KEY, STATS_KEY, PREVIEW_KEY, diskUsed, usageHeight, dialogChoices, choiceLabel, ringColors, toolIcon } from "./polls.js";
import { actionRows } from "./newmenu.js";
import { openDetail } from "./detail.js";

const machineIcon = (m, size, color) => ico(m.key === LOCAL ? "monitor" : "server", size, color);
const COLORS_W = 312, COLORS_H = 86;
// A Glass box: glass fill, rim, shadow_2xl, radius 16.
const floatBox = (el) => el.bg(C.glass).rounded(16).border(1).border_color(C.rim).shadow_2xl().overflow_hidden();
// The machine dot: its tint with a soft ring.
const mdot = (key) => div().size(10).flex_none().rounded(5).bg(machineColor(key)).border(2).border_color(alpha(machineColor(key), 0.3));
const roundBtn = (id, icon, on, onClick) => h_flex().id(id).size(40).flex_none().justify_center().items_center().rounded(20)
  .bg(on ? C.accent : C.raised).cursor_pointer().on_click(onClick).child(icon);
// A 40 px chip (answers, Open, Dismiss): the design's .chip.
const chipBtn = (id, label, look, onClick) => {
  const b = h_flex().id(id).flex_1().min_w(0).h(40).px(8).justify_center().items_center().rounded(10).cursor_pointer()
    .whitespace_nowrap().font_medium().on_click(onClick);
  if (look === "yes") return b.bg(alpha(C.green, 0.16)).border(1).border_color(alpha(C.green, 0.4)).text_color(lightOf(C.green)).font_family(MONO).text_size(12).child(label);
  if (look === "no") return b.bg(alpha(C.red, 0.12)).text_color(lightOf(C.red)).font_family(MONO).text_size(12).child(label);
  if (look === "ans") return b.bg(C.raised).text_color(C.fg).font_family(MONO).text_size(12).child(label);
  if (look === "sel") return b.bg(C.accent).text_color(C.onAccent).child(label);
  return b.bg(C.raised).text_color(C.fg).child(label);
};

// ---- header ----
function header(view, snap, filter, usageRows) {
  const waiting = snap.rows.filter(r => r.agent && r.kind === "waiting").length;
  const finished = finishedRows(snap).length;
  const summary = waiting || finished ? `${waiting} waiting · ${finished} finished` : "all quiet";
  const m = filter && filter !== ALL ? snap.mBy.get(filter) : statsMachine(snap, ALL);
  const close = () => { view.plus = false; view.agentOpen = null; };
  const body = floatBox(v_flex().id("tnp-head").w_full().flex_none().pl(14).pr(6).pt(6).pb(10).gap(8))
    .child(h_flex().w_full().h(40).gap(8).items_center()
      .child(div().flex_none().text_size(17).font_bold().text_color(C.fg).child("herdr"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(waiting ? C.red : C.muted).child(summary))
      .child(roundBtn("tnp-search", ico("search", 18, C.fg), false, () => run("app.palette")))
      .child(roundBtn("tnp-plus", ico("plus", 18, view.plus ? C.onAccent : C.fg), !!view.plus, (_e, cx) => { view.plus = !view.plus; if (!view.plus) view.agentOpen = null; cx.notify(); })))
    .when(!!view.plus, el => el.child(v_flex().id("tnp-actions").w_full().flex_none().pr(8).gap(6)
      .children(actionRows(view, snap, m, (cx) => { close(); view.tab = "all"; cx?.notify(); }, shared("nightglass-phone.changes") ?? 0, false))));
  if (!usageRows.length) return body;
  // The usage row, as the desktop sidebar's usage head (mods/nightglass/header.js usageParts): ONE row, one well per tool,
  // the tool icon then one small double ring per account (outer week, inner 5 h), no labels (the popover has the details).
  // Laid out by flex alone: a tool with one account gets a well as wide as its icon and ring; tools with several share the
  // rest, their rings in centered slots no wider than RING + 8, so they stay close at any width.
  const u = shared(USAGE_KEY);
  const groups = [];
  for (const r of usageRows) {
    const tool = r.tool === "codex" ? "codex" : "claude";
    const g = groups.find(x => x.tool === tool) ?? (groups.push({ tool, rows: [] }), groups[groups.length - 1]);
    g.rows.push(r);
  }
  const RING = 22, SLOT_MAX = RING + 8;
  const fit = groups.every(g => g.rows.length === 1) ? [] : groups.filter(g => g.rows.length === 1);
  const ringOf = (r) => { const [wc, hc] = ringColors(r); return ring(RING, r.week, r.five, wc, hc); };
  return body.child(h_flex().id("tnp-usage-row").w_full().h(40).flex_none().pr(8).gap(6).items_center().cursor_pointer().opacity(u?.stale ? 0.6 : 1)
    .on_click(() => openUsage(view, usageRows.length))
    .children(groups.map(g => h_flex().h(40).px(8).gap(6).items_center().rounded(12).bg(C.well)
      .when(fit.includes(g), el => el.flex_none())
      .when(!fit.includes(g), el => el.flex_1().min_w(0))
      .child(toolIcon(g.tool, RING))
      .when(fit.includes(g), el => el.child(ringOf(g.rows[0])))
      .when(!fit.includes(g), el => el.child(h_flex().flex_1().min_w(0).justify_center().items_center()
        .children(g.rows.map(r => h_flex().flex_1().min_w(RING).max_w(SLOT_MAX).justify_center().child(ringOf(r)))))))));
}
function openUsage(view, n) {
  // A press outside the popover closes it first; don't reopen it with the click that follows (phone.js popup toggles).
  if (popupJustClosed("usage")) return;
  if (popupIsOpen("usage") && view.usageId) { closeOverlay(view.usageId); return; }
  const z = zoom();
  const Wd = WIN.w > 0 ? dsg(WIN.w) : DESIGN_W, Hd = WIN.h > 0 ? dsg(WIN.h) : 900;
  const h = Math.min(usageHeight(n), Math.max(160, Hd - 120));
  view.usageId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: (Wd - 16) / Wd, height: h, at: { x: Math.round(8 * z), y: Math.round(110 * z) }, props: { role: "usage", h } });
}

// ---- machine cards: the filter ----
const CARD_W = 124, CARD_H = 60;
function cardShell(id, sel, color) {
  return v_flex().id(id).w(CARD_W).h(CARD_H).flex_none().px(10).py(8).gap(6).justify_center().rounded(12).cursor_pointer()
    .bg(sel ? alpha(mix(color, C.glassBase, 0.14), 0.6) : C.glass).border(1).border_color(sel ? alpha(color, 0.55) : C.rim);
}
function allCard(view, snap, filter) {
  const agents = snap.rows.filter(r => r.agent).length;
  const online = snap.machines.filter(m => !m.offline).length;
  return cardShell("tnp-m-all", filter === ALL, "#e6e7eb")
    .on_click(tap(view, (_e, cx) => { view.setOpen(ALL); view.cardAddr = null; cx.notify(); }))
    .child(h_flex().min_w(0).gap(6).items_center().child(ico("server", 14, C.fg))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child("All machines")))
    .child(div().truncate().text_size(10.5).text_color(C.muted).child(`${agents} agents · ${online} online`));
}
function machineCard(view, m, filter) {
  const sel = filter === m.key;
  const st = shared(STATS_KEY)?.[m.key];
  const data = st?.data;
  const bar = (k, v) => v_flex().flex_1().min_w(0).gap(2)
    .child(div().whitespace_nowrap().font_family(MONO).text_size(9.5).line_height(1).text_color(C.muted).child(`${k} ${v == null ? "–" : v}`))
    .child(div().w_full().h(3).rounded(2).bg(C.well).overflow_hidden()
      .when(v != null, el => el.child(div().h(3).rounded(2).w(`${Math.max(2, Math.min(100, v))}%`).bg(level(v, C.fg)))));
  return cardShell(`tnp-m-${m.key}`, sel, machineColor(m.key)).opacity(m.offline ? 0.7 : 1)
    // The selected machine's card, tapped again, opens its scheme picker (there is no right-click on a phone).
    .on_mouse_down("left", (e, cx) => {
      cx.stop_propagation();
      if (!sel || !e?.local_position || !e?.bounds) { view.colorsAt = null; return; }
      // `at` and event positions are screen px, popup sizes are designed px
      const z = zoom(), a = anchorBelow(e);
      const maxX = WIN.w > 0 ? Math.max(8 * z, WIN.w - (COLORS_W + 8) * z) : 8 * z;
      view.colorsAt = { x: Math.round(Math.min(maxX, Math.max(8 * z, a.x))), y: Math.round(a.y) };
    })
    .on_click(tap(view, (_e, cx) => {
      if (sel && view.colorsAt) {
        if (popupJustClosed("colors")) return;                                              // the outside press just closed it
        if (popupIsOpen("colors") && view.colorsId) { closeOverlay(view.colorsId); return; } // a second tap closes it
        view.colorsId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: COLORS_W, height: COLORS_H, at: view.colorsAt, props: { role: "colors", machine: m.key, name: m.name } });
      } else { view.setOpen(m.key); view.cardAddr = null; }
      cx.notify();
    }))
    .child(h_flex().min_w(0).gap(6).items_center().child(mdot(m.key))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name)))
    .child(m.offline
      ? div().truncate().text_size(10.5).text_color(C.amber).child("offline")
      : h_flex().w_full().gap(6)
        .child(bar("cpu", data ? data.cpu : null))
        .child(bar("ram", data ? data.memPct : null))
        .child(bar("dsk", data ? diskUsed(data) : null)));
}

// ---- the two tabs ----
function segTabs(view, nNeeds, anyWaiting, nAll) {
  const tab = (id, which, icon, label, count, red) => {
    const on = view.tab === which;
    return h_flex().id(id).flex_1().min_w(0).h(40).gap(6).justify_center().items_center().rounded(11).cursor_pointer()
      .bg(on ? C.raisedHi : CLEAR).when(on, el => el.shadow_md())
      .font_medium().text_color(on ? C.fg : C.muted)
      .on_click((_e, cx) => { view.tab = which; cx.notify(); })
      .child(pico(icon, 16, on ? C.fg : C.muted)).child(div().child(label))
      .child(div().px(6).rounded(8).bg(red ? C.red : C.raised).font_family(MONO).text_size(10.5).text_color(red ? C.ink : C.fg).child(String(count)));
  };
  return h_flex().id("tnp-tabs").w_full().h(48).flex_none().p(3).rounded(14).bg(C.well).border(1).border_color(C.rim)
    .child(tab("tnp-tab-needs", "needs", "inbox", "Needs you", nNeeds, anyWaiting))
    .child(tab("tnp-tab-all", "all", "list", "All agents", nAll, false));
}

// ---- the card ----
// Height of the terminal excerpt: the design's 212 px when the window has room, less on a short one (soft keyboard up).
const EX_MAX = 212, EX_MIN = 96, LINE = 15.75;
function answer(view, r, n) {
  // `hc keys <t> <n>` presses the digit (`hc send` pastes + Enter and refuses a terminal blocked on a dialog).
  hc(["keys", r.address, String(n)])
    .then((res) => { if (res.code !== 0) notify({ title: `Not answered: ${r.short}`, body: String(res.stderr || res.stdout || "").trim().slice(0, 200), level: "warning" }); })
    .catch((e) => notify({ title: `Not answered: ${r.short}`, body: String(e?.message ?? e).slice(0, 200), level: "warning" }));
  view.pvForce = true; // read the screen again at the next tick
}
function card(view, r, exH) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  const pv = shared(PREVIEW_KEY);
  const mine = pv && pv.address === r.address ? pv : null;
  const nLines = Math.max(3, Math.floor((exH - 16) / LINE));
  const lines = mine?.lines?.length ? mine.lines.slice(-nLines) : null;
  const choices = waiting && mine ? dialogChoices(mine.lines) : [];
  const tool = r.program?.name ?? "agent";
  const state = waiting ? `Waiting for you${r.report ? ` · ${r.report}` : ""}` : `Finished${r.report ? ` · ${r.report}` : ""}`;
  const excerpt = v_flex().id("tnp-excerpt").w_full().h(exH).flex_none().px(10).py(8).justify_end().overflow_hidden().rounded(10)
    .bg(alpha("#000000", 0.45)).border(1).border_color(C.rim).font_family(MONO).text_size(10.5).line_height(1.5)
    .when(!!lines, el => el.children(lines.map(l => div().w_full().whitespace_nowrap().overflow_hidden().text_color(alpha(C.fg, 0.85)).child(l || " "))))
    // no screen text (yet): the agent's own line, as the agent rows show it
    .when(!lines, el => el.child(div().w_full().text_color(C.muted).child(r.now || ""))
      .child(div().w_full().text_color(C.dim).child(mine?.fail ? "terminal text unavailable" : "reading…")));
  const acts = [];
  if (waiting) {
    for (const c of choices) {
      const label = choiceLabel(c.label);
      const look = label === "Yes" ? "yes" : label === "No" ? "no" : "ans";
      acts.push(chipBtn(`tnp-ans-${c.n}`, `${c.n} · ${label}`, look, tap(view, () => answer(view, r, c.n))));
    }
    acts.push(chipBtn("tnp-open", "Open", choices.length ? "plain" : "sel", tap(view, () => openDetail(r))));
  } else {
    acts.push(h_flex().id("tnp-dismiss").flex_1().min_w(0).h(40).gap(6).justify_center().items_center().rounded(10).bg(C.raised)
      .font_medium().text_color(C.fg).cursor_pointer().on_click(tap(view, (_e, cx) => { dismissRows([r]); cx.notify(); }))
      .child(ico("check", 14, C.green)).child(div().child("Dismiss")));
    acts.push(chipBtn("tnp-open", "Open terminal", "sel", tap(view, () => openDetail(r))));
  }
  return v_flex().id(`tnp-card-${r.address}`).w_full().flex_none().p(12).gap(10).rounded(16).shadow_xl()
    .bg(alpha(mix(tint, C.glassBase, waiting ? 0.12 : 0.08), 0.78)).border(1).border_color(alpha(tint, waiting ? 0.45 : 0.35))
    .child(h_flex().w_full().gap(8).items_center().text_size(12).text_color(C.muted)
      .child(mdot(r.machine))
      .child(div().flex_none().max_w(120).truncate().font_medium().text_color(C.fg).child(r.machineName))
      .child(div().flex_1().min_w(0).truncate().child(`· ${tool} · ${dur(r.ms)} ago`))
      .child(div().flex_none().px(6).py(3).rounded(6).bg(machineColor(r.machine)).font_family(MONO).text_size(10.5).font_semibold().text_color(C.ink).child(r.short)))
    .child(v_flex().w_full().gap(2)
      .child(div().w_full().truncate().text_size(18).font_semibold().text_color(C.fg).child(r.title))
      .child(div().w_full().truncate().font_family(MONO).text_size(12).text_color(C.muted).child([r.branch, r.spaceName].filter(Boolean).join(" · "))))
    .child(h_flex().w_full().gap(6).items_center().text_size(13).font_semibold().text_color(tint)
      .child(mark(r.kind, 14)).child(div().flex_1().min_w(0).truncate().child(state)))
    .child(excerpt)
    .child(h_flex().id("tnp-card-acts").w_full().gap(6).children(acts));
}
function pager(view, q, idx) {
  const go = (d) => tap(view, (_e, cx) => { const i = idx + d; if (i < 0 || i >= q.length) return; view.cardAddr = q[i].address; cx.notify(); });
  const arrow = (id, icon, on, d) => h_flex().id(id).size(40).flex_none().justify_center().items_center().rounded(20).bg(C.raised)
    .opacity(on ? 1 : 0.4).when(on, el => el.cursor_pointer().on_click(go(d))).child(pico(icon, 20, C.fg));
  const shown = q.slice(0, 12);
  return h_flex().id("tnp-pager").w_full().flex_none().gap(8).items_center().justify_between()
    .child(arrow("tnp-prev", "chevron-left", idx > 0, -1))
    .child(v_flex().flex_1().min_w(0).gap(4).items_center()
      .child(h_flex().gap(6).items_center().children(shown.map((x, i) => i === idx
        ? div().w(16).h(6).rounded(3).bg(C.fg)
        : div().size(6).rounded(3).bg(x.kind === "waiting" ? C.red : alpha("#ffffff", 0.22)))))
      .child(div().font_family(MONO).text_size(12).text_color(C.muted).child(`${idx + 1} of ${q.length}`)))
    .child(arrow("tnp-next", "chevron-right", idx < q.length - 1, 1));
}
// The card on screen: the one picked last (by address, so a new arrival does not move it), else the first.
export function currentCard(view, q) {
  let idx = view.cardAddr ? q.findIndex(r => r.address === view.cardAddr) : -1;
  if (idx < 0) idx = Math.min(view.idx ?? 0, Math.max(0, q.length - 1));
  view.idx = idx;
  return { idx, r: q[idx] ?? null };
}

// ---- agent rows and space capsules (the desktop's Glass rows; the "now" line is always shown, there is no hover) ----
function agentRow(view, r) {
  const waiting = r.kind === "waiting", cur = r.focused;
  const mc = machineColor(r.machine);
  // Focused row: solid machine color, dark-of-hue text, no outline (the machine group holds the stack's one).
  const t1 = nearBlack(mc), t2 = darkOf(mc);
  return h_flex().id(`tnp-row-${r.address}`).w_full().h(44).flex_none().pl(8).pr(5).gap(8).items_center().rounded(6)
    .bg(cur ? mc : waiting ? alpha(C.red, 0.2) : CLEAR)
    .when(cur, el => el.shadow_md())
    .text_size(13).text_color(cur ? t1 : r.kind === "offline" ? C.dim : C.muted).cursor_pointer()
    .on_click(tap(view, () => openDetail(r)))
    .child(mark(r.kind))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().when(cur, el => el.font_semibold()).child(r.title))
      .child(div().truncate().font_family(MONO).text_size(10.5).line_height("15px").text_color(cur ? t2 : waiting ? C.red : C.muted).child(r.now)))
    .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(cur ? t2 : C.muted).child(r.kind === "offline" ? "" : dur(r.ms)))
    .child(h_flex().flex_none().h(18).px(6).rounded(5).items_center().font_family(MONO).text_size(10.5)
      .bg(cur ? t1 : C.raised).text_color(cur ? lightOf(mc) : C.muted).child(r.short));
}
// A space capsule: raised fill, 9 radius; tinted red / green when an agent waits / finished.
function capsule(view, sp, m) {
  const initial = ([...(sp.name || "?")][0] ?? "?").toUpperCase();
  const seenAt = lastSeen(m.key);
  const wants = sp.rows.some(r => r.kind === "waiting") ? C.red : sp.rows.some(r => r.kind === "done") ? C.green : null;
  const strong = wants === C.red;
  return v_flex().id(`tnp-sp-${sp.id}`).w_full().flex_none().rounded(9).p(3).gap(1).bg(C.raised)
    .when(!!wants, el => el.bg(alpha(wants, strong ? 0.16 : 0.10)).border(1).border_color(alpha(wants, strong ? 0.45 : 0.35)).when(strong, e => e.shadow_md()))
    .child(h_flex().w_full().h(28).gap(8).pl(4).pr(8).items_center()
      .child(h_flex().size(20).flex_none().rounded(6).justify_center().items_center().bg(C.raised)
        .text_color(C.fg).text_size(11).font_semibold().child(initial))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(sp.name))
      .when(!m.offline && !!sp.branch, el => el.child(div().flex_none().max_w(140).truncate().font_family(MONO).text_size(10.5).text_color(C.muted).child(sp.branch)))
      .when(m.offline, el => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.amber).whitespace_nowrap()
        .child(seenAt ? `last seen ${dur(Date.now() - seenAt)}` : "offline"))))
    .children(sp.rows.map(r => agentRow(view, r)));
}
const newSpace = (view, id, m) => h_flex().id(id).w_full().h(40).flex_none().px(12).gap(8).items_center().rounded(9)
  .text_size(12).text_color(C.muted).cursor_pointer()
  .on_click(tap(view, () => run("space.new", { machine: mArg(m.key) })))
  .child(ico("folder", 13, C.muted)).child(div().truncate().child("New space"));
// One group per machine (the filter's, or all of them), tinted in its color (9% fill, 36% border), its capsules inside.
// Machines without spaces are one compact line each, after the others.
function groups(view, snap, filter) {
  const ms = filter && filter !== ALL ? [snap.mBy.get(filter)].filter(Boolean) : snap.machines;
  const ordered = [...ms.filter(m => m.spaces.length > 0), ...ms.filter(m => m.spaces.length === 0)];
  return ordered.map(m => {
    const color = machineColor(m.key);
    const n = m.spaces.reduce((k, sp) => k + sp.rows.filter(r => r.agent).length, 0);
    return v_flex().id(`tnp-grp-${m.key}`).w_full().flex_none().rounded(12).p(4).gap(4)
      .bg(alpha(color, 0.09)).border(1).border_color(alpha(color, 0.36)).opacity(m.offline ? 0.62 : 1)
      .child(h_flex().w_full().h(32).flex_none().gap(8).px(6).items_center()
        .child(machineIcon(m, 13, color))
        .child(div().flex_none().max_w(160).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
        .child(div().flex_none().px(6).rounded(7).bg(C.raised).font_family(MONO).text_size(10.5).text_color(C.muted).child(String(n)))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(m.offline ? C.amber : m.count.waiting ? C.red : C.muted).child(m.summary)))
      .children(m.spaces.map(sp => capsule(view, sp, m)))
      .when(!m.offline, el => el.child(newSpace(view, `tnp-grp-new-${m.key}`, m)));
  });
}

// ---- the inbox ----
export function renderInbox(view) {
  const snap = snapshot();
  const filter = view.openKey(snap);
  view.tab ??= props()?.tab ?? "needs";
  if (view.plus === undefined) view.plus = props()?.plus === true;
  view.agentOpen ??= props()?.openAgents ?? null; // the machine whose agent list is open in the "+" rows (props: staged checks)
  // agent.next / agent.prev follow the list order (this block owns it now that the pill row is gone)
  setAgentOrder(snap.rows.filter(r => r.agent).map(r => r.address));
  const usageRows = props()?.usage === true ? (shared(USAGE_KEY)?.rows ?? []) : []; // opt-in: block prop "usage": true
  const q = needsRows(snap, filter);
  const mine = filter && filter !== ALL ? snap.rows.filter(r => r.machine === filter) : snap.rows;
  const nAll = mine.filter(r => r.agent).length;
  const Hd = WIN.h > 0 ? dsg(WIN.h) : 860;
  // the excerpt gets what the rest of the column leaves (header, usage lines, "+" rows, cards, tabs, card chrome, pager)
  const usageH = usageRows.length ? 48 : 0;
  const plusH = view.plus ? 46 + (view.agentOpen ? 46 : 0) : 0;
  const exH = Math.round(Math.max(EX_MIN, Math.min(EX_MAX, Hd - 530 - usageH - plusH)));
  const body = [];
  if (view.tab === "needs") {
    const { idx, r } = currentCard(view, q);
    if (r) {
      body.push(card(view, r, exH));
      body.push(pager(view, q, idx));
    } else {
      const quiet = mine.filter(x => x.agent).length;
      const seen = mine.filter(x => x.agent && x.kind === "done" && isDismissed(x));
      const where = filter && filter !== ALL ? `${snap.mBy.get(filter)?.name ?? filter}:` : "All:";
      body.push(v_flex().id("tnp-empty").w_full().flex_none().py(24).gap(8).items_center()
        .child(ico("check-circle", 40, C.green))
        .child(div().text_size(15).font_semibold().text_color(C.fg).child("Nothing needs you"))
        .child(div().text_size(12).text_color(C.muted).child(`${where} ${quiet} agents are working or idle.`))
        .child(h_flex().id("tnp-see-all").h(40).px(14).items_center().rounded(10).bg(C.raised).font_medium().text_color(C.fg).cursor_pointer()
          .on_click((_e, cx) => { view.tab = "all"; cx.notify(); }).child("See all agents")));
      if (seen.length) body.push(floatBox(v_flex().id("tnp-finished").w_full().flex_none().p(6).gap(2))
        .child(div().px(6).py(2).text_size(11).font_semibold().text_color(C.muted).child("Finished"))
        .children(seen.map(x => agentRow(view, x))));
    }
  } else {
    body.push(floatBox(v_flex().id("tnp-list").w_full().flex_none().p(6).gap(6)).children(groups(view, snap, filter)));
  }
  return v_flex().id("tnp-inbox").size_full().px(8).pt(4).pb(8).gap(8)
    .on_size_change((size, cx) => {
      WIN.h = size.height;
      if (Math.abs((view.width ?? 0) - size.width) >= 1) { view.width = size.width; WIN.w = size.width; cx.notify(); }
    })
    .child(header(view, snap, filter, usageRows))
    .child(swipeArea(watchScroll(h_flex().id("tnp-machines").w_full().h(CARD_H).flex_none().overflow_x_scroll(), view))
      .child(swipeBody(h_flex().h_full().flex_none().gap(6))
        .child(allCard(view, snap, filter)).children(snap.machines.map(m => machineCard(view, m, filter)))))
    .child(segTabs(view, q.length, q.some(x => x.kind === "waiting"), nAll))
    .child(swipeArea(watchScroll(v_flex().id("tnp-body").w_full().flex_1().min_h(0).overflow_y_scroll(), view))
      .child(swipeBody(v_flex().w_full().flex_none().gap(10)).children(body)));
}

// ---- popup: theme (whole-window scheme) of a machine ----
export function renderColorsPopup() {
  const p = props();
  const cur = shared(COLORS_KEY) ?? {};
  const set = (c) => {
    const next = { ...cur };
    if (c) next[p.machine] = c; else delete next[p.machine];
    setShared(COLORS_KEY, next);
    closeOverlay(p.overlay);
  };
  return v_flex().id("tnp-colors").w_full().h(COLORS_H).bg(C.glassSolid).rounded(12).border(1).border_color(C.rim).shadow_xl().overflow_hidden().p(10).gap(10)
    .child(div().w_full().h(16).flex_none().truncate().text_size(11).font_semibold().text_color(C.muted).child(`Theme for ${String(p.name ?? p.machine)}`))
    .child(h_flex().w_full().h(32).flex_none().gap(4).items_center()
      .children(SCHEMES.map(sc => h_flex().id(`tnp-sw-${sc.color}`).size(32).flex_none().rounded(16).bg(sc.color).cursor_pointer()
        .border(2).border_color(cur[p.machine] === sc.color ? C.fg : CLEAR).tooltip(sc.label)
        .on_click(() => set(sc.color)))));
}

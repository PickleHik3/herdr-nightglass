// nightglass-phone: the inbox (Concept B "Inbox", design/PhoneConcepts.html; look: Glass, design/GLASS.md). The home view,
// one block that takes the whole column (layout node "inbox"), top to bottom:
//   header   glass box, one row: Herdr's logo, the AI usage wells (one per tool: icon + a small double ring per account;
//            only with the block prop "usage"), search (app.palette), "+" (newmenu.js action rows, in flow, under the row)
//   machines a sideways-scrolling row of cards: "All machines" + one per machine (tint dot, name, cpu / ram / disk);
//            the cards are the machine filter; tapping the selected machine's card again picks its scheme (colors popup)
//   tabs     "Needs you (n)" | "All agents (n)"
//   body     Needs you: the queue as cards, the tapped one expanded (status dot, machine, space, age, address; title; the terminal's last lines
//            from `hc read`; the dialog's numbered answers, sent with `hc keys`; Open) with a pager. Empty: "Nothing needs
//            you" and the finished agents already seen. All agents: the agents grouped by machine and space.
// Opening an agent (Open, a row) switches to the detail view (detail.js).
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, props, shared, setShared, openOverlay, closeOverlay, setAgentOrder, hc, notify } from "herdr";
import { C, M, MONO, CLEAR, SCHEMES, COLORS_KEY, alpha, mix, dur, ico, mark, ring, level, machineColor, nearBlack, darkOf, lightOf, anchorBelow } from "./lib.js";
import { snapshot, LOCAL, ALL, mArg, lastSeen, statsMachine } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg, pico, ringS, popupIsOpen, popupJustClosed, swipeArea, swipeBody, watchScroll, tap, needsRows, finishedRows, isDismissed, dismissRows } from "./phone.js";
import { USAGE_KEY, STATS_KEY, PREVIEW_KEY, diskUsed, usageHeight, dialogChoices, choiceLabel, isPermission, ringColors, toolIcon, usageMachine } from "./polls.js";
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
    .whitespace_nowrap().overflow_hidden().font_medium().on_click(onClick);
  if (look === "yes") return b.bg(alpha(C.green, 0.16)).border(1).border_color(alpha(C.green, 0.4)).text_color(lightOf(C.green)).font_family(MONO).text_size(12).child(label);
  if (look === "no") return b.bg(alpha(C.red, 0.12)).text_color(lightOf(C.red)).font_family(MONO).text_size(12).child(label);
  if (look === "ans") return b.bg(C.raised).text_color(C.fg).font_family(MONO).text_size(12).child(label);
  if (look === "sel") return b.bg(C.accent).text_color(C.onAccent).child(label);
  return b.bg(C.raised).text_color(C.fg).child(label);
};

// ---- header ----
// ONE row: Herdr's logo (the desktop All tile's herdr.png), the AI usage wells (only with the block prop "usage"), search and
// "+". The usage wells sit in the room between logo and buttons: one well per tool, the tool icon then one small double
// ring per account (outer week, inner 5 h) packed right after it, no labels (tap: the popover has the details). Content-
// sized wells, left-aligned; the area clips rather than pushing the buttons (412 designed px leave ~244 for ~200 of wells).
function header(view, snap, filter, usageRows) {
  const m = filter && filter !== ALL ? snap.mBy.get(filter) : statsMachine(snap, ALL);
  const close = () => { view.plus = false; view.agentOpen = null; };
  const u = shared(USAGE_KEY);
  const groups = [];
  for (const r of usageRows) {
    const tool = r.tool === "codex" ? "codex" : "claude";
    const g = groups.find(x => x.tool === tool) ?? (groups.push({ tool, rows: [] }), groups[groups.length - 1]);
    g.rows.push(r);
  }
  const RING = 20, ICON = 18;
  const ringOf = (r) => { const [wc, hc] = ringColors(r); return ring(RING, r.week, r.five, wc, hc); };
  const usage = h_flex().id("tnp-usage-row").flex_1().min_w(0).h(40).gap(6).items_center().overflow_hidden()
    .when(groups.length > 0, el => el.cursor_pointer().opacity(u?.stale ? 0.6 : 1).on_click(() => openUsage(view, usageRows.length)))
    .children(groups.map(g => h_flex().flex_none().h(36).pl(6).pr(8).gap(4).items_center().rounded(18).bg(C.raised).border(1).border_color(C.rim)
      .child(toolIcon(g.tool, ICON))
      .children(g.rows.map(ringOf))));
  return floatBox(v_flex().id("tnp-head").w_full().flex_none().pl(10).pr(6).py(6).gap(8))
    .child(h_flex().w_full().h(40).gap(8).items_center()
      .child(image(`${M}/herdr.png`).size(28).rounded(7).flex_none())
      .child(usage)
      .child(roundBtn("tnp-search", ico("search", 18, C.fg), false, () => run("app.palette")))
      .child(roundBtn("tnp-plus", ico("plus", 18, view.plus ? C.onAccent : C.fg), !!view.plus, (_e, cx) => { view.plus = !view.plus; if (!view.plus) view.agentOpen = null; cx.notify(); })))
    .when(!!view.plus, el => el.child(v_flex().id("tnp-actions").w_full().flex_none().pr(8).gap(6)
      .children(actionRows(view, snap, m, (cx) => { close(); view.tab = "all"; cx?.notify(); }, shared("nightglass-phone.changes") ?? 0, false))));
}
function openUsage(view, n) {
  // A press outside the popover closes it first; don't reopen it with the click that follows (phone.js popup toggles).
  if (popupJustClosed("usage")) return;
  if (popupIsOpen("usage") && view.usageId) { closeOverlay(view.usageId); return; }
  const z = zoom();
  const Wd = WIN.w > 0 ? dsg(WIN.w) : DESIGN_W, Hd = WIN.h > 0 ? dsg(WIN.h) : 900;
  const h = Math.min(usageHeight(n), Math.max(160, Hd - 120));
  view.usageId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: (Wd - 16) / Wd, height: h, at: { x: Math.round(8 * z), y: Math.round(64 * z) }, props: { role: "usage", h } });
}

// ---- machine cards: the filter ----
const CARD_W = 134, CARD_H = 60; // wide enough for "This computer" beside the 20 px glyph
// tinted: the whole tile takes the machine's color (stronger when selected); the All tile stays neutral until selected
function cardShell(id, sel, color, tinted) {
  const bg = tinted ? alpha(mix(color, C.glassBase, sel ? 0.22 : 0.12), sel ? 0.75 : 0.62) : sel ? alpha(mix(color, C.glassBase, 0.14), 0.6) : C.glass;
  const rim = tinted ? alpha(color, sel ? 0.65 : 0.3) : sel ? alpha(color, 0.55) : C.rim;
  return v_flex().id(id).w(CARD_W).h(CARD_H).flex_none().px(10).py(8).gap(6).justify_center().rounded(12).cursor_pointer()
    .bg(bg).border(1).border_color(rim);
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
  // cpu / ram / disk: each icon inside a ring filled to the value (ring-s arcs, as the old top bar's stats pill), colored
  // with level(); no value yet: the empty track.
  const RS = 22, ICO = 12;
  const ringIcon = (name, v, base) => h_flex().relative().size(RS).flex_none()
    .child(ringS(RS, v ?? 0, 0, level(v ?? 0, base), C.teal))
    .child(div().absolute().top((RS - ICO) / 2).left((RS - ICO) / 2).child(ico(name, ICO, C.muted)));
  return cardShell(`tnp-m-${m.key}`, sel, machineColor(m.key), true).opacity(m.offline ? 0.7 : 1)
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
    // the machine's glyph as on the desktop tiles, small: a tinted rounded square with the monitor / server icon
    .child(h_flex().min_w(0).gap(6).items_center()
      .child(h_flex().size(20).flex_none().rounded(6).justify_center().items_center().bg(alpha(machineColor(m.key), 0.2)).child(machineIcon(m, 12, machineColor(m.key))))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name)))
    .child(m.offline
      ? div().truncate().text_size(10.5).text_color(C.amber).child("offline")
      : h_flex().w_full().items_center().justify_between()
        .child(ringIcon("cpu", data ? data.cpu : null, C.accent))
        .child(ringIcon("ram", data ? data.memPct : null, C.teal))
        .child(ringIcon("disk", data ? diskUsed(data) : null, C.fg)));
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
// The top row every card starts with: the status dot (red: waiting for you, green: finished), the machine's tinted name,
// the space and the age, and the terminal address.
function cardTop(r) {
  const waiting = r.kind === "waiting";
  return h_flex().w_full().gap(8).items_center().text_size(12).text_color(C.muted)
    .child(div().size(10).flex_none().rounded(5).bg(waiting ? C.red : C.green).border(2).border_color(alpha(waiting ? C.red : C.green, 0.3)))
    .child(div().flex_none().max_w(120).truncate().font_medium().text_color(machineColor(r.machine)).child(r.machineName))
    .child(div().flex_1().min_w(0).truncate().child([r.spaceName, `${dur(r.ms)} ago`].filter(Boolean).join(" · ")))
    .child(div().flex_none().px(6).py(3).rounded(6).bg(machineColor(r.machine)).font_family(MONO).text_size(10.5).font_semibold().text_color(C.ink).child(r.short));
}
// A collapsed card in the queue: the top row and the title; tapping it expands it (and collapses the open one).
function miniCard(view, r) {
  const tint = r.kind === "waiting" ? C.red : C.green;
  return v_flex().id(`tnp-mini-${r.address}`).w_full().flex_none().px(12).py(10).gap(6).rounded(16).cursor_pointer()
    .bg(alpha(mix(tint, C.glassBase, 0.06), 0.7)).border(1).border_color(alpha(tint, 0.25))
    .on_click(tap(view, (_e, cx) => { view.cardAddr = r.address; cx.notify(); }))
    .child(cardTop(r))
    .child(h_flex().w_full().gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().text_color(C.fg).child(r.title))
      .child(ico("chevron-down", 14, C.muted)));
}
function card(view, r, exH) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  const pv = shared(PREVIEW_KEY);
  const mine = pv && pv.address === r.address ? pv : null;
  const choices = waiting && mine ? dialogChoices(mine.lines) : [];
  // a question's option rows (40 + 6 each) come out of the screen text, so the card keeps its height
  const asking = choices.length > 0 && !isPermission(choices);
  const exQ = asking ? Math.max(EX_MIN, exH - 46 * choices.length) : exH;
  const nLines = Math.max(3, Math.floor((exQ - 16) / LINE));
  let src = mine?.lines ?? [];
  let question = null;
  if (asking) {
    // A question (Claude Code's ask dialog): the text between its tab header ("← ☐ … Submit →", when there is one) and
    // option 1, with rules, blanks and quote bars dropped and the screen's line breaks joined into prose.
    let at = -1, from = 0;
    for (let i = src.length - 1; i >= 0; i--) if (/^(?:[❯›>]\s*)?1[.)]\s+/.test(src[i].replace(/^[\s│┃|]+/, ""))) { at = i; break; }
    for (let i = (at > 0 ? at : src.length) - 1; i >= 0; i--) if (/Submit\s*→|^\s*←/.test(src[i])) { from = i + 1; break; }
    question = (at > 0 ? src.slice(from, at) : src).map(l => l.replace(/^[\s│┃|]+/, "").trim()).filter(l => l && !/^[─━—\-=_]+$/.test(l)).join(" ");
  }
  const lines = src.length ? src.slice(-nLines) : null;
  // A question reads as prose in the UI font, the whole of it inline (the page scrolls);
  // terminal output stays the last lines, one per row, bottom-aligned (0.1.13 cannot scroll a box to its end).
  const excerpt = asking && question
    // Inline at full height, NOT a scroll box: on 0.1.13 every scroll area under the pointer takes the wheel (stop_propagation
    // does not keep it from the page), so a box inside the page scrolled both. The page is the one thing that scrolls.
    ? v_flex().id("tnp-excerpt").w_full().flex_none().px(12).py(10).gap(10).rounded(10).bg(alpha("#000000", 0.45)).border(1).border_color(C.rim)
        .child(div().w_full().text_size(14).line_height(1.45).text_color(C.fg).child(question))
        // each option with its description (gain / loss): what you need to choose; the numbered rows below answer
        .children(choices.filter(c => c.desc).map(c => v_flex().w_full().gap(2)
          .child(div().w_full().text_size(13).font_semibold().text_color(C.fg).child(`${c.n}. ${c.label}`))
          .child(div().w_full().text_size(12).line_height(1.4).text_color(C.muted).child(c.desc))))
    : v_flex().id("tnp-excerpt").w_full().h(exQ).flex_none().px(10).py(8).justify_end().overflow_hidden().rounded(10)
    .bg(alpha("#000000", 0.45)).border(1).border_color(C.rim).font_family(MONO).text_size(10.5).line_height(1.5)
    .when(!!lines, el => el.children(lines.map(l => div().w_full().whitespace_nowrap().overflow_hidden().text_color(alpha(C.fg, 0.85)).child(l || " "))))
    // no screen text (yet): the agent's own line, as the agent rows show it
    .when(!lines, el => el.child(div().w_full().text_color(C.muted).child(r.now || ""))
      .child(div().w_full().text_color(C.dim).child(mine?.fail ? "terminal text unavailable" : "reading…")));
  const acts = [];
  let answerList = null; // a question's options: one full-width row each (number badge + the option's text), above the chips
  if (waiting && choices.length && !isPermission(choices)) {
    answerList = v_flex().id("tnp-answers").w_full().flex_none().gap(6).children(choices.map(c =>
      h_flex().id(`tnp-ans-${c.n}`).w_full().h(40).flex_none().pl(6).pr(10).gap(10).items_center().rounded(10).bg(C.raised).cursor_pointer()
        .on_click(tap(view, () => answer(view, r, c.n)))
        .child(h_flex().size(28).flex_none().justify_center().items_center().rounded(7).bg(C.well).font_family(MONO).text_size(12).text_color(C.fg).child(String(c.n)))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(C.fg).child(c.label))));
    acts.push(chipBtn("tnp-open", "Open", "plain", tap(view, () => openDetail(r))));
  } else if (waiting) {
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
    // Rows are scarce on a phone: the status is the dot that starts the top row (red: waiting for you, green: finished),
    // the machine its tinted name, then the space and the age; the title is the only other line above the screen text.
    .child(cardTop(r))
    .child(div().w_full().truncate().text_size(17).font_semibold().text_color(C.fg).child(r.title))
    .child(excerpt)
    .when(!!answerList, el => el.child(answerList))
    .child(h_flex().id("tnp-card-acts").w_full().gap(6).children(acts));
}
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
  const usageRows = usageMachine() ? (shared(USAGE_KEY)?.rows ?? []) : []; // opt-in: block prop "usage" (true or a machine name)
  const q = needsRows(snap, filter);
  const mine = filter && filter !== ALL ? snap.rows.filter(r => r.machine === filter) : snap.rows;
  const nAll = mine.filter(r => r.agent).length;
  const Hd = WIN.h > 0 ? dsg(WIN.h) : 860;
  // the excerpt gets what the rest of the column leaves (header, usage lines, "+" rows, cards, tabs, card chrome, pager)
  const usageH = 0; // the usage wells share the header row
  const plusH = view.plus ? 46 + (view.agentOpen ? 46 : 0) : 0;
  const exH = Math.round(Math.max(EX_MIN, Math.min(EX_MAX, Hd - 470 - usageH - plusH)));
  const body = [];
  if (view.tab === "needs") {
    const { r } = currentCard(view, q);
    if (r) {
      // The whole queue, one card expanded (the tapped one; first by default), the rest collapsed to two lines.
      for (const x of q) body.push(x.address === r.address ? card(view, x, exH) : miniCard(view, x));
    } else {
      // Actual counts by status, zeros left out: "3 working · 1 idle" (done = finished, already seen; offline = unreachable).
      const by = {}; for (const x of mine) if (x.agent) by[x.kind] = (by[x.kind] ?? 0) + 1;
      const counts = ["working", "idle", "done", "offline"].filter(k => by[k]).map(k => `${by[k]} ${k === "done" ? "finished" : k}`).join(" · ") || "no agents";
      const seen = mine.filter(x => x.agent && x.kind === "done" && isDismissed(x));
      const where = filter && filter !== ALL ? `${snap.mBy.get(filter)?.name ?? filter}:` : "All:";
      body.push(v_flex().id("tnp-empty").w_full().flex_none().py(24).gap(8).items_center()
        .child(ico("check-circle", 40, C.green))
        .child(div().text_size(15).font_semibold().text_color(C.fg).child("Nothing needs you"))
        .child(div().text_size(12).text_color(C.muted).child(`${where} ${counts}`))
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

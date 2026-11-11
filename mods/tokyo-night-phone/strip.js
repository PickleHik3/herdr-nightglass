// tokyo-night-phone: the attention strip (status capsule / unreachable banner / swipeable "Needs you" cards)
// and the tab-pill row. Design: design/Phone.dc.html (attention, tab strip); look and behaviour: Glass.
//
// Reconciled with the desktop strip (a tab bar of the shown space + a status capsule on the right): the phone keeps
// ONE row of pills (every agent terminal across machines, the phone board's design) with the desktop's "+" (tab.new)
// at its end, and its status capsule is the quiet row above it. When something waits or finished, the cards replace the
// capsule (as on the board); each card carries its own Waiting / Finished label and tint, and waiting sorts first.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, setAgentOrder } from "herdr";
import { C, MONO, alpha, dur, ico, mark, nodePx, machineColor } from "./lib.js";
import { snapshot, lastSeen } from "./data.js";

const QUIET = 36, BANNER = 56, CARD = 72, CARD_W = 328, GAP = 6, MAX_CARDS = 8;

// ---- acting on a row (copy of the desktop sidebar's focusRow) ----
export function focusRow(r) {
  if (r.agent) return run("agent.focus", { terminal: r.address });
  if (!r.spaceActive) run("space.select", { id: r.space });
  if (!r.spaceActive || !r.tabActive) run("tab.select", { id: r.tab });
  run("pane.focus", { terminal: r.address });
}

function plan(snap) {
  const att = snap.rows.filter(r => r.agent && (r.kind === "waiting" || r.kind === "done"))
    .sort((a, b) => (a.kind === "waiting" ? 0 : 1) - (b.kind === "waiting" ? 0 : 1) || a.ms - b.ms)
    .slice(0, MAX_CARDS);
  const offline = snap.offline;
  const parts = [];
  if (offline.length) parts.push(BANNER);
  if (att.length) parts.push(CARD);
  else if (!offline.length) parts.push(QUIET);
  return { att, offline, px: parts.reduce((s, n) => s + n, 0) + GAP * (parts.length - 1) };
}

function summary(snap) {
  const live = snap.rows.filter(r => r.kind !== "offline");
  const w = live.filter(r => r.kind === "working").length;
  const i = live.filter(r => r.kind === "idle").length;
  return `${w} working · ${i} idle`;
}

function banner(offline) {
  const names = offline.map(m => m.name).join(", ");
  const seen = lastSeen(offline[0].key);
  return h_flex().w_full().h(BANNER).flex_none().pl(12).pr(6).gap(10).items_center().rounded(12)
    .bg(C.glass).border(1).border_color(alpha(C.amber, 0.35)).shadow_md()
    .child(ico("wifi-off", 15, C.amber))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().font_medium().text_color(C.fg).child(`${names} ${offline.length === 1 ? "is" : "are"} unreachable`))
      .child(div().truncate().text_size(12).text_color(C.muted).child(seen ? `Last seen ${dur(Date.now() - seen)} ago` : "Not seen since the app started")))
    // The app has no "retry" command; its Machines settings list, update and remove ssh machines (AGENTS.md:614).
    .child(h_flex().id("tnp-machines").h(44).flex_none().px(14).items_center().rounded(9).bg(C.raised)
      .text_size(13).font_medium().text_color(C.fg).cursor_pointer()
      .on_click(() => run("app.settings", { section: "machines" })).child("Machines"));
}

// The whole card opens the agent (agent.focus); the chip on the right just names the terminal, in the machine's color.
// Glass attention tints: waiting = red 16% + red 45% border + shadow_md; finished = green 10% + green 35% border.
function card(r, i, n) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  return h_flex().id(`tnp-card-${r.address}`).w(CARD_W).h(CARD).flex_none().pl(12).pr(10).gap(10).items_center().rounded(10)
    .bg(alpha(tint, waiting ? 0.16 : 0.10)).border(1).border_color(alpha(tint, waiting ? 0.45 : 0.35))
    .when(waiting, el => el.shadow_md())
    .cursor_pointer()
    .on_click(() => run("agent.focus", { terminal: r.address }))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().w_full().min_w(0).gap(7).items_center()
        .child(mark(r.kind))
        .child(div().min_w(0).flex_shrink(1).truncate().font_semibold().text_color(C.fg).child(r.title))
        .child(div().flex_none().text_size(11).font_semibold().text_color(tint).child(waiting ? "Waiting" : "Finished"))
        .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(dur(r.ms))))
      .child(div().w_full().min_w(0).truncate().text_size(12).text_color(C.muted).child(r.report || r.program?.name || ""))
      .child(div().w_full().min_w(0).truncate().text_size(11).text_color(C.muted).child(`${r.machineName} › ${r.spaceName} · ${i + 1}/${n}`)))
    .child(div().flex_none().px(6).py(1).rounded(5).bg(waiting ? C.red : machineColor(r.machine)).font_family(MONO).text_size(10.5).font_medium()
      .text_color(C.ink).child(r.short));
}

// The status capsule of the quiet state: glass + rim (the desktop's status pill).
function capsule(snap) {
  return h_flex().flex_1().min_w(0).h(QUIET).px(12).gap(8).items_center().rounded(18).bg(C.glass).border(1).border_color(C.rim)
    .child(ico("check-circle", 14, C.green))
    .child(div().flex_none().text_size(12).font_medium().text_color(C.fg).child("Nothing needs you"))
    .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(C.muted).child(summary(snap)));
}

export function renderStrip(view) {
  const snap = snapshot();
  const { att, offline, px } = plan(snap);
  // Size our own block (as the desktop strip does): only when it differs from the layout's current px,
  // retried at most every 2 s. This writes nodes.strip.size to layouts/.state/tokyo-night-phone.json.
  const cur = nodePx("strip");
  if (cur !== px) {
    const now = Date.now();
    if (view.stripReq !== px || now - (view.stripAt ?? 0) > 2000) {
      view.stripReq = px; view.stripAt = now;
      run("layout.resize", { id: "strip", px });
    }
  }
  return v_flex().id("tnp-strip").size_full().gap(GAP).overflow_hidden()
    .when(offline.length > 0, el => el.child(h_flex().w_full().flex_none().px(8).child(div().flex_1().min_w(0).child(banner(offline)))))
    .when(att.length > 0, el => el.child(h_flex().id("tnp-cards").w_full().h(CARD).flex_none().px(8).gap(8).overflow_x_scroll()
      .children(att.map((r, i) => card(r, i, att.length)))))
    .when(att.length === 0 && offline.length === 0, el => el.child(h_flex().w_full().flex_none().px(8)
      .child(capsule(snap))));
}

// ---- tab pills: every agent across machines (plus the focused terminal when it isn't one) ----
// Close: no hover on a phone, so the desktop's hover-revealed close buttons become one control on the ACTIVE pill only,
// and it takes two taps: the first arms it (it turns into a red "Close?" for 4 s), the second closes the terminal's pane.
// A tap on the pill itself never closes anything.
const ARM_MS = 4000;
export function renderTabs(view) {
  const snap = snapshot();
  const rows = snap.rows.filter(r => r.agent || r.focused);
  // agent.next / agent.prev follow the pills (this block is never hidden, so it owns the order).
  setAgentOrder(rows.filter(r => r.agent).map(r => r.address));
  const armed = (r) => view.armed?.address === r.address && Date.now() - view.armed.at < ARM_MS;
  const closeBtn = (r) => {
    const on = armed(r);
    return h_flex().id(`tnp-pill-x-${r.address}`).h(28).flex_none().w(on ? 64 : 28).justify_center().items_center().rounded(14)
      .bg(on ? alpha(C.red, 0.3) : alpha(C.fg, 0.08)).cursor_pointer()
      .on_click((_e, cx) => {
        cx.stop_propagation();
        if (!armed(r)) { view.armed = { address: r.address, at: Date.now() }; cx.notify(); return; }
        view.armed = null; cx.notify();
        // A terminal pane closes through pane.close (the app asks when that would end the space); else the terminal is killed.
        if (r.pane) run("pane.close", { pane: r.pane }); else run("terminal.kill", { terminal: r.address });
      })
      .child(on ? div().text_size(11).font_semibold().text_color(C.red).whitespace_nowrap().child("Close?") : ico("win-close", 10, C.muted));
  };
  const pill = (r) => {
    const cur = r.focused, waiting = r.kind === "waiting";
    const mc = machineColor(r.machine);
    const b = h_flex().id(`tnp-pill-${r.address}`).h(40).max_w(cur ? 240 : 190).flex_none().pl(10).pr(cur ? 6 : 12).gap(7).items_center().rounded(20)
      .text_size(12).text_color(r.kind === "offline" ? C.dim : cur ? C.fg : C.muted).cursor_pointer()
      .on_click(() => focusRow(r));
    // Glass: unselected = raised fill, no border; the selected / waiting one gets the one outline + shadow_md.
    return (cur ? b.bg(C.raisedHi).border(1.5).border_color(alpha(mc, 0.7)).shadow_md()
      : waiting ? b.bg(alpha(C.red, 0.16)).border(1).border_color(alpha(C.red, 0.45)).shadow_md()
      : b.bg(C.raised))
      .child(mark(r.kind))
      .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(cur ? mc : C.muted).child(r.short))
      .child(div().min_w(0).truncate().font_medium().child(r.title))
      .when(cur && r.kind !== "offline", el => el.child(closeBtn(r)));
  };
  return h_flex().id("tnp-pills").size_full().px(8).gap(6).items_center().overflow_x_scroll()
    .children(rows.map(pill))
    // "+": a new tab in the shown space (the desktop strip's +)
    .child(h_flex().id("tnp-newtab").size(40).flex_none().justify_center().items_center().rounded(20)
      .bg(C.raised).cursor_pointer().on_click(() => run("tab.new", {}))
      .child(ico("plus", 14, C.muted)));
}

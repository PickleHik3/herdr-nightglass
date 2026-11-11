// tokyo-night-phone: the attention strip (unreachable banner / one sideways-scrolling row of one-line chips for the
// agents that wait or finished) and the tab-pill row. Design: design/Phone.dc.html (attention, tab strip); look and
// behaviour: Glass.
//
// The phone keeps ONE row of pills (every agent terminal across machines, the phone board's design) with the desktop's
// "+" (tab.new) at its end. Above it the strip: when nothing waits or finished (and no machine is unreachable) the strip
// block is HIDDEN and takes no height; otherwise it is the banner (56) and / or the chip row (28). Each chip carries its
// own tint (waiting = red, finished = green) and waiting sorts first. The strip block is shown / hidden and sized by
// stripSync (a timer of the tabs role, which is never hidden); a hidden block may not render.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, layout, setAgentOrder } from "herdr";
import { C, MONO, CLEAR, alpha, dur, ico, mark, nodePx, findNode, machineColor } from "./lib.js";
import { snapshot, lastSeen } from "./data.js";
import { pico, swipeArea, swipeBody, watchScroll, tap, panelFull } from "./phone.js";
import { toggleComposer, composerOpen } from "./composer.js";

const BANNER = 56, CHIP = 28, CHIP_MAX_W = 230, GAP = 6, MAX_CARDS = 8;

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
  if (att.length) parts.push(CHIP);
  // px 0: nothing to show, the block is hidden.
  return { att, offline, px: parts.length ? parts.reduce((s, n) => s + n, 0) + GAP * (parts.length - 1) : 0 };
}

// Show / hide and size the strip block from what is on screen. Called by a timer (main.js, tabs role); a resize is
// retried at most every 2 s. Writes nodes.strip.{hidden,size} to layouts/.state/tokyo-night-phone.json.
export function stripSync(view) {
  if (panelFull()) return; // the panel covers the strip place: it stays hidden until the panel is normal again
  const { px } = plan(snapshot());
  const hidden = !!findNode(layout(), "strip")?.hidden;
  if (px === 0) { if (!hidden) run("layout.hide", { id: "strip" }); return; }
  if (nodePx("strip") !== px) {
    const now = Date.now();
    if (view.stripReq !== px || now - (view.stripAt ?? 0) > 2000) {
      view.stripReq = px; view.stripAt = now;
      run("layout.resize", { id: "strip", px });
    }
  }
  if (hidden) run("layout.show", { id: "strip" });
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

// One line per agent, 28 px: status mark, title (cut), elapsed, the tNN tag. The whole chip opens the agent (agent.focus).
// Glass attention tints: waiting = red 16% + red 45% border; finished = green 10% + green 35% border.
function chip(view, r) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  return h_flex().id(`tnp-card-${r.address}`).h(CHIP).max_w(CHIP_MAX_W).flex_none().pl(9).pr(4).gap(6).items_center().rounded(14)
    .bg(alpha(tint, waiting ? 0.16 : 0.10)).border(1).border_color(alpha(tint, waiting ? 0.45 : 0.35))
    .cursor_pointer()
    .on_click(tap(view, () => run("agent.focus", { terminal: r.address })))
    .child(mark(r.kind))
    .child(div().min_w(0).flex_shrink(1).truncate().text_size(12).font_semibold().text_color(C.fg).child(r.title))
    .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(dur(r.ms)))
    .child(div().flex_none().px(5).rounded(7).bg(waiting ? C.red : machineColor(r.machine)).font_family(MONO).text_size(10.5).font_medium()
      .text_color(C.ink).child(r.short));
}

export function renderStrip(view) {
  const snap = snapshot();
  const { att, offline } = plan(snap);
  return v_flex().id("tnp-strip").size_full().gap(GAP).overflow_hidden()
    .when(offline.length > 0, el => el.child(h_flex().w_full().flex_none().px(8).child(div().flex_1().min_w(0).child(banner(offline)))))
    .when(att.length > 0, el => el.child(swipeArea(watchScroll(h_flex().id("tnp-cards").w_full().h(CHIP).flex_none().overflow_x_scroll(), view))
      .child(swipeBody(h_flex().h_full().flex_none().px(8).gap(6).items_center()).children(att.map(r => chip(view, r))))));
}

// ---- tab pills: every agent across machines (plus the focused terminal when it isn't one) ----
// Close: no hover on a phone, so the desktop's hover-revealed close buttons become one control on the ACTIVE pill only,
// and it takes two taps: the first arms it (it turns into a red "Close?" for 4 s), the second closes the terminal's pane.
// A tap on the pill itself never closes anything.
const ARM_MS = 4000;
export function renderTabs(view) {
  const snap = snapshot();
  // Every agent terminal, plus everything in the shown space (a tab made with "+" must stay visible while that space is shown).
  const rows = snap.rows.filter(r => r.agent || r.focused || r.spaceActive);
  // agent.next / agent.prev follow the pills (this block is never hidden, so it owns the order).
  setAgentOrder(rows.filter(r => r.agent).map(r => r.address));
  const armed = (r) => view.armed?.address === r.address && Date.now() - view.armed.at < ARM_MS;
  const closeBtn = (r) => {
    const on = armed(r);
    return h_flex().id(`tnp-pill-x-${r.address}`).h(28).flex_none().w(on ? 64 : 28).justify_center().items_center().rounded(14)
      .bg(on ? alpha(C.red, 0.3) : alpha(C.fg, 0.08)).cursor_pointer()
      .on_click(tap(view, (_e, cx) => {
        cx.stop_propagation();
        if (!armed(r)) { view.armed = { address: r.address, at: Date.now() }; cx.notify(); return; }
        view.armed = null; cx.notify();
        // A terminal pane closes through pane.close (the app asks when that would end the space); else the terminal is killed.
        if (r.pane) run("pane.close", { pane: r.pane }); else run("terminal.kill", { terminal: r.address });
      }))
      .child(on ? div().text_size(11).font_semibold().text_color(C.red).whitespace_nowrap().child("Close?") : ico("win-close", 10, C.muted));
  };
  const pill = (r) => {
    const cur = r.focused, waiting = r.kind === "waiting";
    const mc = machineColor(r.machine);
    const b = h_flex().id(`tnp-pill-${r.address}`).h(40).max_w(cur ? 240 : 190).flex_none().pl(10).pr(cur ? 6 : 12).gap(7).items_center().rounded(20)
      .text_size(12).text_color(r.kind === "offline" ? C.dim : cur ? C.fg : C.muted).cursor_pointer()
      .on_click(tap(view, () => focusRow(r)));
    // Glass: unselected = raised fill, no border; the selected / waiting one gets the one outline + shadow_md.
    return (cur ? b.bg(C.raisedHi).border(1.5).border_color(alpha(mc, 0.7)).shadow_md()
      : waiting ? b.bg(alpha(C.red, 0.16)).border(1).border_color(alpha(C.red, 0.45)).shadow_md()
      : b.bg(C.raised))
      .child(mark(r.kind))
      .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(cur ? mc : C.muted).child(r.short))
      .child(div().min_w(0).truncate().font_medium().child(r.title))
      .when(cur && r.kind !== "offline", el => el.child(closeBtn(r)));
  };
  // "+": a new tab in the shown space, named explicitly (the desktop strip's +); never "whatever tab.new picks".
  const shown = snap.foc?.space ?? null;
  const open = composerOpen();
  // The composer button sits at the start of the row, outside the scrolling part: it costs no height and is always in reach.
  return h_flex().id("tnp-pillbar").size_full().px(8).gap(6).items_center()
    .child(h_flex().id("tnp-composer-btn").size(40).flex_none().justify_center().items_center().rounded(20)
      .bg(open ? C.raisedHi : C.raised).border(1).border_color(open ? alpha(C.accent, 0.6) : CLEAR).cursor_pointer()
      .on_click(() => toggleComposer())
      .child(pico("prompt", 15, open ? C.fg : C.muted)))
    .child(swipeArea(watchScroll(h_flex().id("tnp-pills").flex_1().min_w(0).h_full().overflow_x_scroll(), view))
      .child(swipeBody(h_flex().h_full().flex_none().gap(6).items_center())
        .children(rows.map(pill))
        .child(h_flex().id("tnp-newtab").size(40).flex_none().justify_center().items_center().rounded(20)
          .bg(C.raised).cursor_pointer().on_click(tap(view, () => run("tab.new", shown ? { space: shown } : {})))
          .child(ico("plus", 14, C.muted)))));
}

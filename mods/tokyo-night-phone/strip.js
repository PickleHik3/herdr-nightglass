// tokyo-night-phone: the attention strip ("Nothing needs you" / unreachable banner / swipeable
// "Needs you" cards) and the tab-pill row. Design: design/Phone.dc.html (attention, tab strip);
// card and pill behaviour follows the desktop strip: the whole card opens the agent, the chip names the terminal.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, setAgentOrder } from "herdr";
import { C, MONO, alpha, mix, raised, dur, ico, mark, nodePx, machineColor, rim } from "./lib.js";
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
  return h_flex().w_full().h(BANNER).flex_none().pl(12).pr(6).gap(10).items_center().rounded(6)
    .bg(mix(C.amber, C.chrome, 0.1)).border(1).border_color(alpha(C.amber, 0.35)).shadow_md()
    .child(ico("wifi-off", 15, C.amber))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().font_medium().text_color(C.fg).child(`${names} ${offline.length === 1 ? "is" : "are"} unreachable`))
      .child(div().truncate().text_size(12).text_color(C.muted).child(seen ? `Last seen ${dur(Date.now() - seen)} ago` : "Not seen since the app started")))
    // The app has no "retry" command; its Machines settings list, update and remove ssh machines (AGENTS.md:614).
    .child(raised(h_flex().id("tnp-machines").h(44).flex_none().px(14).items_center().rounded(6), C.raised)
      .text_size(13).font_medium().text_color(C.fg).cursor_pointer()
      .on_click(() => run("app.settings", { section: "machines" })).child("Machines"));
}

// The whole card opens the agent (agent.focus); the chip on the right just names the terminal, in the machine's color.
function card(r, i, n) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  return h_flex().id(`tnp-card-${r.address}`).w(CARD_W).h(CARD).flex_none().pl(12).pr(10).gap(10).items_center().rounded(8)
    .bg(mix(tint, C.chrome, waiting ? 0.12 : 0.07)).border(1).border_color(alpha(tint, waiting ? 0.55 : 0.3)).shadow_md()
    .cursor_pointer()
    .on_click(() => run("agent.focus", { terminal: r.address }))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().w_full().min_w(0).gap(7).items_center()
        .child(mark(r.kind))
        .child(div().min_w(0).flex_shrink(1).truncate().font_semibold().text_color(C.fg).child(r.title))
        .child(div().flex_none().text_size(11).font_semibold().text_color(tint).child(waiting ? "Waiting" : "Finished"))
        .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(dur(r.ms))))
      .child(div().w_full().min_w(0).truncate().font_family(MONO).text_size(12).text_color(C.muted).child(r.report || r.program?.name || ""))
      .child(div().w_full().min_w(0).truncate().font_family(MONO).text_size(11).text_color(C.dim).child(`${r.machineName} › ${r.spaceName} · ${i + 1}/${n}`)))
    .child(div().flex_none().px(7).rounded(9).bg(waiting ? C.red : machineColor(r.machine)).font_family(MONO).text_size(11).font_medium()
      .text_color(C.ink).child(r.short));
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
      .child(raised(h_flex().flex_1().min_w(0).h(QUIET).px(12).gap(8).items_center().rounded(6), C.chrome).shadow_md()
        .child(ico("check-circle", 14, C.green))
        .child(div().flex_none().font_medium().text_color(C.fg).child("Nothing needs you"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_color(C.dim).child(summary(snap))))));
}

// ---- tab pills: every agent across machines (plus the focused terminal when it isn't one) ----
export function renderTabs(view) {
  const snap = snapshot();
  const rows = snap.rows.filter(r => r.agent || r.focused);
  const curIdx = rows.findIndex(r => r.focused);
  const curAddr = curIdx >= 0 ? rows[curIdx].address : null;
  // agent.next / agent.prev follow the pills (this block is never hidden, so it owns the order).
  setAgentOrder(rows.filter(r => r.agent).map(r => r.address));
  // Bring the current pill into view when the focus moves (smallest scroll needed).
  if (curAddr !== view.pillFocus) {
    view.pillFocus = curAddr;
    if (curIdx >= 0) view.pillScroll.scroll_to_item(curIdx);
  }
  const pill = (r) => {
    const cur = r.focused, waiting = r.kind === "waiting";
    const mc = machineColor(r.machine);
    const b = h_flex().id(`tnp-pill-${r.address}`).h(40).max_w(190).flex_none().pl(10).pr(12).gap(7).items_center().rounded(20);
    return (cur ? b.bg(mix(mc, C.chrome, 0.18)).border(1.5).border_color(mc).shadow_md()
      : waiting ? b.bg(mix(C.red, C.chrome, 0.1)).border(1).border_color(alpha(C.red, 0.5)).shadow_sm()
      : raised(b, C.chrome))
      .text_size(12).text_color(r.kind === "offline" ? C.dim : cur ? C.fg : C.muted).cursor_pointer()
      .on_click(() => focusRow(r))
      .child(mark(r.kind))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(cur ? mc : C.dim).child(r.short))
      .child(div().min_w(0).truncate().font_medium().child(r.title));
  };
  return h_flex().id("tnp-pills").size_full().px(8).gap(6).items_center().overflow_x_scroll().track_scroll(view.pillScroll)
    .children(rows.map(pill))
    .child(h_flex().id("tnp-newtab").size(40).flex_none().justify_center().items_center().rounded(20)
      .bg(alpha(C.accent, 0.14)).border(1).border_color(rim()).cursor_pointer().on_click(() => run("tab.new", {}))
      .child(ico("plus", 14, C.accent)));
}

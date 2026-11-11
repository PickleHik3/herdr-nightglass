// tokyo-night: the attention strip (quiet / offline banner / "Needs you" cards), the pane header
// and the empty view (a machine with no spaces).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, panes, props, exec, shared, setShared } from "herdr";
import { C, MONO, alpha, mix, dur, ico, prog, mark, stop, nodePx, anchorBelowRight, setPressed, getPressed } from "./lib.js";
import { snapshot, short, LOCAL, mArg } from "./data.js";

export const EMPTY_KEY = "tokyo-night.empty"; // machine key shown in the empty view, or null
const BANNER = 44, QUIET = 40, GAP = 8, CARD = 76, HEAD = 18, PAD = 22, MAX_CARDS = 6;

function plan(snap) {
  const att = snap.rows.filter(r => r.agent && (r.kind === "waiting" || r.kind === "done"))
    .sort((a, b) => (a.kind === "waiting" ? 0 : 1) - (b.kind === "waiting" ? 0 : 1) || a.ms - b.ms);
  const offline = snap.offline;
  const parts = [];
  if (offline.length) parts.push(BANNER);
  if (att.length) {
    const rows = Math.ceil(Math.min(att.length, MAX_CARDS) / 2);
    parts.push(PAD + HEAD + GAP + rows * CARD + (rows - 1) * GAP);
  } else if (!offline.length) parts.push(QUIET);
  return { att, offline, px: parts.reduce((s, n) => s + n, 0) + GAP * (parts.length - 1) };
}

function summary(snap) {
  const live = snap.rows.filter(r => r.kind !== "offline");
  const w = live.filter(r => r.kind === "working").length;
  const i = live.filter(r => r.kind === "idle").length;
  return `${w} working · ${i} idle`;
}

function banner(snap, offline) {
  const names = offline.map(m => m.name).join(", ");
  const n = snap.rows.filter(r => r.agent && offline.some(m => m.key === r.machine)).length;
  const its = offline.length === 1 ? "its" : "their";
  return h_flex().w_full().h(BANNER).flex_none().px(14).gap(10).items_center().rounded(6)
    .bg(mix(C.amber, C.chrome, 0.1)).border(1).border_color(alpha(C.amber, 0.35))
    .child(ico("wifi-off", 15, C.amber))
    .child(div().flex_none().font_medium().text_color(C.fg).child(`${names} ${offline.length === 1 ? "is" : "are"} unreachable`))
    .child(div().flex_1().min_w(0).truncate().text_color(C.muted).child(`${its} ${n} agent${n === 1 ? "" : "s"} show their last known state`));
}

function card(r) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  // The whole card opens the agent; the chip on the right just names the terminal.
  return h_flex().id(`tn-card-${r.address}`).w_full().min_w(0).h(CARD).flex_none().pl(12).pr(10).gap(12).items_center().rounded(6)
    .bg(mix(tint, C.chrome, waiting ? 0.12 : 0.07)).border(1).border_color(alpha(tint, waiting ? 0.55 : 0.3))
    .cursor_pointer().hover(s => s.bg(mix(tint, C.chrome, waiting ? 0.2 : 0.13)).border_color(alpha(tint, waiting ? 0.8 : 0.5)))
    .tooltip(`Open ${r.short}`)
    .on_click(() => run("agent.focus", { terminal: r.address }))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().w_full().min_w(0).gap(8).items_center()
        .child(mark(r.kind))
        .child(div().min_w(0).flex_shrink(1).truncate().font_semibold().text_color(C.fg).child(r.title))
        .child(div().flex_none().text_size(11).font_semibold().text_color(tint).child(waiting ? "Waiting on you" : "Finished"))
        .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(dur(r.ms))))
      .child(div().w_full().min_w(0).truncate().font_family(MONO).text_size(12).text_color(C.muted).child(r.report || r.program?.name || ""))
      .child(div().w_full().min_w(0).truncate().font_family(MONO).text_size(11).text_color(C.dim).child(`${r.machineName} › ${r.spaceName}`)))
    .child(div().flex_none().px(7).rounded(9).bg(waiting ? C.red : C.accent).font_family(MONO).text_size(11).font_medium()
      .text_color(C.ink).child(r.short));
}

function attention(snap, att) {
  const shown = att.slice(0, MAX_CARDS);
  const more = att.length - shown.length;
  const nWait = att.filter(r => r.kind === "waiting").length, nDone = att.length - nWait;
  const col = (xs) => v_flex().flex_1().min_w(0).gap(GAP).children(xs.map(card));
  return v_flex().w_full().flex_none().bg(C.chrome).rounded(6).px(12).pt(10).pb(12).gap(GAP)
    .child(h_flex().w_full().h(HEAD).flex_none().gap(8).px(2).items_center()
      .when(nWait > 0, el => el.child(div().text_size(12).font_semibold().text_color(C.fg).child("Needs you"))
        .child(div().px(5).rounded(4).bg(C.red).font_family(MONO).text_size(11).font_medium().text_color(C.ink).child(String(nWait))))
      .when(nDone > 0, el => el.when(nWait > 0, e => e.child(div().w(6)))
        .child(div().text_size(12).font_semibold().text_color(C.fg).child("Done"))
        .child(div().px(5).rounded(4).bg(C.green).font_family(MONO).text_size(11).font_medium().text_color(C.ink).child(String(nDone))))
      .child(div().flex_1())
      .child(div().text_size(12).text_color(C.dim).child(more > 0 ? `${summary(snap)} · +${more} more` : summary(snap))))
    .child(h_flex().w_full().gap(GAP).items_start()
      .child(col(shown.filter((_r, i) => i % 2 === 0)))
      .child(col(shown.filter((_r, i) => i % 2 === 1))));
}

export function renderStrip(view) {
  const snap = snapshot();
  const { att, offline, px } = plan(snap);
  // Size our own block: only when it differs from the layout's current px (retried at most every 2 s).
  const cur = nodePx("strip");
  if (cur !== px) {
    const now = Date.now();
    if (view.stripReq !== px || now - (view.stripAt ?? 0) > 2000) {
      view.stripReq = px; view.stripAt = now;
      run("layout.resize", { id: "strip", px });
    }
  }
  return v_flex().id("tn-strip").size_full().gap(GAP).overflow_hidden()
    .when(offline.length > 0, el => el.child(banner(snap, offline)))
    .when(att.length > 0, el => el.child(attention(snap, att)))
    .when(att.length === 0 && offline.length === 0, el => el.child(h_flex().w_full().h(QUIET).flex_none().px(14).gap(10).items_center().rounded(6).bg(C.chrome)
      .child(ico("check-circle", 15, C.green))
      .child(div().font_medium().text_color(C.fg).child("Nothing needs you"))
      .child(div().text_color(C.dim).child(summary(snap)))));
}

// ---- pane header ----
export function renderPane() {
  const id = props()?.pane;
  const p = panes().find(x => x.pane === id);
  const root = h_flex().id(`tn-pane-${id}`).size_full().pl(12).pr(8).gap(8).items_center().rounded_t(6).overflow_hidden()
    .bg(C.chrome).border_b(1).border_color(C.raised);
  if (!p) return root;
  if (!p.terminal) {
    return root.child(div().flex_1().min_w(0).truncate().text_size(13).font_medium().text_color(C.fg).child(p.title || p.mod || "Mod"));
  }
  const addr = short(p.terminal);
  const kind = p.status === "blocked" ? "waiting" : p.status ?? (p.program?.shell === false ? "working" : "idle");
  return root
    .child(mark(kind))
    .child(div().min_w(0).flex_shrink(1).truncate().text_size(13).font_medium().text_color(C.fg).child(p.title || p.program?.name || addr))
    .child(h_flex().id(`tn-copy-${id}`).h(22).flex_none().pl(8).pr(6).gap(5).items_center().rounded(11)
      .bg(alpha(C.accent, 0.18)).font_family(MONO).text_size(12).font_medium().text_color(C.accent).cursor_pointer()
      .tooltip("Copy terminal number")
      .hover(s => s.bg(alpha(C.accent, 0.26)))
      .on_mouse_down("left", stop)
      .on_click(() => {
        exec("sh", ["-c", 'printf %s "$1" | (wl-copy 2>/dev/null || xclip -selection clipboard 2>/dev/null || clip.exe)', "sh", addr]).catch(() => {});
      })
      .child(div().child(addr)).child(ico("copy", 11, C.accent)))
    .child(div().flex_1().min_w(0).h(1))
    .child(h_flex().flex_none().gap(6).items_center().text_size(12).text_color(C.muted)
      .child(prog(p.program, 12, C.muted)).child(div().child(p.program?.name ?? "")))
    .child(h_flex().id(`tn-opts-${id}`).size(26).flex_none().justify_center().items_center().rounded(6).cursor_pointer()
      .hover(s => s.bg(C.raised)).tooltip("Pane options")
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorBelowRight(e, 220)); })
      .on_click(() => openOverlay({ mod: "menu", kind: "popup", width: 220, height: 300, at: getPressed(),
        props: { tab: "pane", target: { pane: p.pane, terminal: p.terminal } } }))
      .child(ico("dots", 14, C.dim)));
}

// ---- empty view: a machine with no spaces, shown in the main stack instead of the terminals ----
export function renderEmpty() {
  const snap = snapshot();
  const key = shared(EMPTY_KEY);
  const m = key && snap.mBy.get(key);
  const name = m?.name ?? "this machine";
  const back = () => { setShared(EMPTY_KEY, null); run("layout.select", { stack: "main-stack", child: "main" }); };
  return v_flex().id("tn-empty").size_full().bg(C.chrome).rounded(6).items_center().justify_center().gap(14)
    .child(h_flex().size(56).rounded(14).justify_center().items_center().bg(alpha(C.accent, 0.14))
      .child(ico(m?.offline ? "wifi-off" : key === LOCAL ? "monitor" : "server", 26, m?.offline ? C.amber : C.accent)))
    .child(div().text_size(15).font_semibold().text_color(C.fg).child(m?.offline ? `${name} is unreachable` : `No spaces on ${name}`))
    .child(div().text_color(C.dim).child(m?.offline ? "Its spaces come back when it reconnects." : "Start a terminal or an agent there."))
    .when(!m?.offline, el => el.child(h_flex().id("tn-empty-new").mt(4).h(34).px(14).gap(8).items_center().rounded(17)
      .bg(alpha(C.accent, 0.18)).text_color(C.accent).font_medium().cursor_pointer().hover(s => s.bg(alpha(C.accent, 0.26)))
      .on_click(() => { run("space.new", { machine: mArg(key) }); back(); })
      .child(ico("folder", 14, C.accent)).child(div().child(`New space on ${name}`))));
}

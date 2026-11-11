// nightglass: the strip (tab bar + status capsule, offline banner, "Needs you" cards), the pane header
// and the empty view (a machine with no spaces).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, panes, props, exec, shared, setShared, spaces } from "herdr";
import { C, MONO, CLEAR, alpha, mix, revealMotion, dur, ico, prog, mark, stop, nodePx, anchorBelowRight, setPressed, getPressed, machineColor } from "./lib.js";
import { snapshot, short, LOCAL, mArg, mname, mkey } from "./data.js";

export const EMPTY_KEY = "nightglass.empty"; // machine key shown in the empty view, or null
const BANNER = 44, TABS = 40, GAP = 8, CARD = 76, HEAD = 18, PAD = 22, MAX_CARDS = 6;

function plan(snap) {
  const att = snap.rows.filter(r => r.agent && (r.kind === "waiting" || r.kind === "done"))
    .sort((a, b) => (a.kind === "waiting" ? 0 : 1) - (b.kind === "waiting" ? 0 : 1) || a.ms - b.ms);
  const offline = snap.offline;
  const parts = [TABS];
  if (offline.length) parts.push(BANNER);
  if (att.length) {
    const rows = Math.ceil(Math.min(att.length, MAX_CARDS) / 2);
    parts.push(PAD + HEAD + GAP + rows * CARD + (rows - 1) * GAP);
  }
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
  return h_flex().w_full().h(BANNER).flex_none().px(14).gap(10).items_center().rounded(12)
    .bg(C.glass).border(1).border_color(alpha(C.amber, 0.35)).shadow_md()
    .child(ico("wifi-off", 15, C.amber))
    .child(div().flex_none().font_medium().text_color(C.fg).child(`${names} ${offline.length === 1 ? "is" : "are"} unreachable`))
    .child(div().flex_1().min_w(0).truncate().text_color(C.muted).child(`${its} ${n} agent${n === 1 ? "" : "s"} show their last known state`));
}

function card(r) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  // The whole card opens the agent; the chip on the right just names the terminal.
  return h_flex().id(`tn-card-${r.address}`).w_full().min_w(0).h(CARD).flex_none().pl(12).pr(10).gap(12).items_center().rounded(10)
    .bg(alpha(tint, waiting ? 0.16 : 0.10)).border(1).border_color(alpha(tint, waiting ? 0.45 : 0.35))
    .when(waiting, el => el.shadow_md())
    .cursor_pointer().hover(s => s.bg(alpha(tint, waiting ? 0.24 : 0.16)).border_color(alpha(tint, waiting ? 0.6 : 0.5)))
    .tooltip(`Open ${r.short}`)
    .on_click(() => run("agent.focus", { terminal: r.address }))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().w_full().min_w(0).gap(8).items_center()
        .child(mark(r.kind))
        .child(div().min_w(0).flex_shrink(1).truncate().font_semibold().text_color(C.fg).child(r.title))
        .child(div().flex_none().text_size(11).font_semibold().text_color(tint).child(waiting ? "Waiting on you" : "Finished"))
        .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(dur(r.ms))))
      .child(div().w_full().min_w(0).truncate().text_size(12).text_color(C.muted).child(r.report || r.program?.name || ""))
      .child(div().w_full().min_w(0).truncate().text_size(11).text_color(C.muted).child(`${r.machineName} › ${r.spaceName}`)))
    .child(div().flex_none().px(6).py(1).rounded(5).bg(waiting ? C.red : machineColor(r.machine)).font_family(MONO).text_size(10.5).font_medium()
      .text_color(C.ink).child(r.short));
}

function attention(snap, att) {
  const shown = att.slice(0, MAX_CARDS);
  const more = att.length - shown.length;
  const nWait = att.filter(r => r.kind === "waiting").length, nDone = att.length - nWait;
  const col = (xs) => v_flex().flex_1().min_w(0).gap(GAP).children(xs.map(card));
  return v_flex().w_full().flex_none().bg(C.glass).border(1).border_color(C.rim).rounded(12).px(12).pt(10).pb(12).gap(GAP)
    .child(h_flex().w_full().h(HEAD).flex_none().gap(8).px(2).items_center()
      .when(nWait > 0, el => el.child(div().text_size(12).font_semibold().text_color(C.fg).child("Needs you"))
        .child(div().px(5).rounded(5).bg(C.red).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).child(String(nWait))))
      .when(nDone > 0, el => el.when(nWait > 0, e => e.child(div().w(6)))
        .child(div().text_size(12).font_semibold().text_color(C.fg).child("Done"))
        .child(div().px(5).rounded(5).bg(C.green).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).child(String(nDone))))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(C.muted).child(more > 0 ? `${summary(snap)} · +${more} more` : summary(snap))))
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
    .child(tabRow(view, snap, att))
    .when(offline.length > 0, el => el.child(banner(snap, offline)))
    .when(att.length > 0, el => el.child(attention(snap, att)));
}

// ---- tab bar: the shown space's tabs (Ctrl+Shift+T makes one), status capsule on the right ----
const TAB_KIND = { blocked: "waiting", working: "working", done: "done", idle: "idle" };
function tabRow(view, snap, att) {
  const sp = spaces().find(s => s.active);
  const mc = machineColor(mkey(sp?.machine ?? null));
  const tab = (t) => {
    const on = t.active;
    return h_flex().id(`tn-tab-${t.id}`).h(26).min_w(0).max_w(220).flex_shrink(1).pl(10).pr(3).gap(7).items_center().rounded(8)
      .bg(on ? C.raised : CLEAR)
      .when(on, el => el.shadow_md())
      .cursor_pointer().hover(s => s.bg(on ? C.raisedHi : C.raised))
      .on_hover((h, cx) => { const id = h ? t.id : view.tabHover === t.id ? null : view.tabHover; if (id !== view.tabHover) { view.tabHover = id; cx.notify(); } })
      .on_click(() => { if (!on) run("tab.select", { id: t.id }); })
      .child(mark(t.status ? TAB_KIND[t.status] ?? "idle" : "idle"))
      .child(div().min_w(0).truncate().text_size(12).when(on, el => el.font_medium()).text_color(on ? C.fg : C.muted).child(t.name))
      .when(t.panes > 1, el => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(`×${t.panes}`)))
      // Close on hover. The slot is always there and only its width and opacity change, natively
      // transitioned, so the pill grows smoothly and its neighbours slide over instead of jumping.
      // tab.close asks first when it would close the space's last tab.
      .child(h_flex().id(`tn-tab-xs-${t.id}`).h(16).flex_none().overflow_hidden().items_center()
        .w(view.tabHover === t.id ? 20 : 0).opacity(view.tabHover === t.id ? 1 : 0)
        .transition("width", revealMotion(view.tabHover === t.id)).transition("opacity", revealMotion(view.tabHover === t.id))
        .child(h_flex().id(`tn-tab-x-${t.id}`).size(16).flex_none().justify_center().items_center()
          .rounded(4).cursor_pointer().hover(s => s.bg(alpha(C.red, 0.25))).tooltip("Close tab")
          .on_mouse_down("left", stop).on_click((_e, cx) => { view.tabHover = null; run("tab.close", { id: t.id }); cx.notify(); })
          .child(ico("win-close", 9, C.muted))));
  };
  const tabs = (sp?.tabs ?? []).filter(t => !t.settled || t.active);
  return h_flex().w_full().h(TABS).flex_none().gap(10).items_center()
    .child(h_flex().id("tn-tabs").flex_1().min_w(0).h(30).p(2).gap(2).items_center().rounded(10).bg(C.well).overflow_x_scroll()
      .children(tabs.map(tab))
      .child(h_flex().id("tn-tab-new").size(26).flex_none().justify_center().items_center().rounded(8)
        .cursor_pointer().hover(s => s.bg(C.raised)).tooltip("New tab")
        .on_click(() => run("tab.new", {})).child(ico("plus", 13, C.muted))))
    .child(statusCapsule(snap, att));
}
function statusCapsule(snap, att) {
  const nWait = att.filter(r => r.kind === "waiting").length, nDone = att.length - nWait;
  const pill = h_flex().id("tn-status").h(26).flex_none().px(12).gap(8).items_center().rounded(13).bg(C.glass).border(1).border_color(C.rim);
  if (!att.length) return pill
    .child(ico("check-circle", 14, C.green))
    .child(div().text_size(12).font_medium().text_color(C.fg).child("Nothing needs you"))
    .child(div().text_size(11).text_color(C.muted).child(summary(snap)));
  const count = (label, n, color) => h_flex().gap(6).items_center()
    .child(div().text_size(12).font_medium().text_color(C.fg).child(label))
    .child(div().px(5).rounded(5).bg(color).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).child(String(n)));
  return pill
    .when(nWait > 0, el => el.child(count("Needs you", nWait, C.red)))
    .when(nDone > 0, el => el.child(count("Done", nDone, C.green)))
    .child(div().text_size(11).text_color(C.muted).child(summary(snap)));
}

// ---- pane header ----
export function renderPane() {
  const id = props()?.pane;
  const p = panes().find(x => x.pane === id);
  const root = h_flex().id(`tn-pane-${id}`).size_full().pl(12).pr(8).gap(8).items_center().rounded_t(12).overflow_hidden()
    .bg(C.glassSolid).border_b(1).border_color(C.rim);
  if (!p) return root;
  if (!p.terminal) {
    return root.child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(p.title || p.mod || "Mod"));
  }
  const addr = short(p.terminal);
  // The pane's machine, through the snapshot row of its terminal (local when unknown).
  const mk = snapshot().rows.find(r => r.address === p.terminal)?.machine ?? LOCAL;
  const mc = machineColor(mk);
  const kind = p.status === "blocked" ? "waiting" : p.status ?? (p.program?.shell === false ? "working" : "idle");
  return root
    .child(mark(kind))
    .child(div().min_w(0).flex_shrink(1).truncate().text_size(12).font_semibold().text_color(C.fg).child(p.title || p.program?.name || addr))
    .child(h_flex().id(`tn-copy-${id}`).h(20).flex_none().pl(6).pr(5).gap(5).items_center().rounded(5)
      .bg(mc).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).cursor_pointer()
      .tooltip("Copy terminal number")
      .hover(s => s.bg(mix("#ffffff", mc, 0.15)))
      .on_mouse_down("left", stop)
      .on_click(() => {
        exec("sh", ["-c", 'printf %s "$1" | (wl-copy 2>/dev/null || xclip -selection clipboard 2>/dev/null || clip.exe)', "sh", addr]).catch(() => {});
      })
      .child(div().child(addr)).child(ico("copy", 11, C.ink)))
    .child(div().flex_1().min_w(0).h(1))
    .child(h_flex().flex_none().gap(5).items_center().text_size(11).text_color(C.muted)
      .child(ico(mk === LOCAL ? "monitor" : "server", 11, mc)).child(div().whitespace_nowrap().child(mname(mk))))
    .child(h_flex().flex_none().gap(6).items_center().text_size(11).text_color(C.muted)
      .child(prog(p.program, 12, C.muted)).child(div().child(p.program?.name ?? "")))
    .child(h_flex().id(`tn-opts-${id}`).size(26).flex_none().justify_center().items_center().rounded(8).cursor_pointer()
      .hover(s => s.bg(C.raised)).tooltip("Pane options")
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorBelowRight(e, 220)); })
      .on_click(() => openOverlay({ mod: "menu", kind: "popup", width: 220, height: 300, at: getPressed(),
        props: { tab: "pane", target: { pane: p.pane, terminal: p.terminal } } }))
      .child(ico("dots", 14, C.muted)));
}

// ---- empty view: a machine with no spaces, shown in the main stack instead of the terminals ----
export function renderEmpty() {
  const snap = snapshot();
  const key = shared(EMPTY_KEY);
  const m = key && snap.mBy.get(key);
  const name = m?.name ?? "this machine";
  const back = () => { setShared(EMPTY_KEY, null); run("layout.select", { stack: "main-stack", child: "main" }); };
  return v_flex().id("tn-empty").size_full().bg(C.glassSolid).border(1).border_color(C.rim).rounded(12).items_center().justify_center().gap(14)
    .child(h_flex().size(56).rounded(14).justify_center().items_center().bg(C.raised)
      .child(ico(m?.offline ? "wifi-off" : key === LOCAL ? "monitor" : "server", 26, m?.offline ? C.amber : machineColor(key))))
    .child(div().text_size(15).font_semibold().text_color(C.fg).child(m?.offline ? `${name} is unreachable` : `No spaces on ${name}`))
    .child(div().text_color(C.muted).child(m?.offline ? "Its spaces come back when it reconnects." : "Start a terminal or an agent there."))
    .when(!m?.offline, el => el.child(h_flex().id("tn-empty-new").mt(4).h(34).px(14).gap(8).items_center().rounded(9)
      .bg(C.raised).text_color(C.fg).font_medium().cursor_pointer().hover(s => s.bg(C.raisedHi))
      .on_click(() => { run("space.new", { machine: mArg(key) }); back(); })
      .child(ico("folder", 14, C.muted)).child(div().child(`New space on ${name}`))));
}

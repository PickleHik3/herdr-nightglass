// nightglass: the strip (tab bar, then the fixed-height "Needs you" bar), the pane header
// and the empty view (a machine with no spaces).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, panes, props, exec, shared, setShared, spaces } from "herdr";
import { C, MONO, CLEAR, alpha, mix, revealMotion, dur, ico, prog, mark, stop, nodePx, anchorBelowRight, setPressed, getPressed, machineColor } from "./lib.js";
import { snapshot, short, LOCAL, mArg, mname, mkey } from "./data.js";
import { boardPill, boardShown, hasBoard, showTerminals } from "./board.js";

export const EMPTY_KEY = "nightglass.empty"; // machine key shown in the empty view, or null
// Fixed height: the tab row, then one bar for what needs you. The strip never grows or shrinks with the number of
// agents waiting or finished (it used to stack cards and resize itself), so the terminal below never moves.
const TABS = 40, GAP = 8, BAR = 34, STRIP = TABS + GAP + BAR;

// Agents that want you: waiting first, then finished; the most recent first within each.
const attention = (snap) => snap.rows.filter(r => r.agent && (r.kind === "waiting" || r.kind === "done"))
  .sort((a, b) => (a.kind === "waiting" ? 0 : 1) - (b.kind === "waiting" ? 0 : 1) || a.ms - b.ms);

function summary(snap) {
  const live = snap.rows.filter(r => r.kind !== "offline");
  const w = live.filter(r => r.kind === "working").length;
  const i = live.filter(r => r.kind === "idle").length;
  return `${w} working · ${i} idle`;
}

// One chip per agent that wants you; the whole chip opens it. Where it runs and its last report are the tooltip.
function chip(r) {
  const waiting = r.kind === "waiting";
  const tint = waiting ? C.red : C.green;
  const tip = [`${waiting ? "Waiting on you" : "Finished"} · ${r.machineName} › ${r.spaceName}`, r.report || r.program?.name || ""].filter(Boolean).join("\n");
  return h_flex().id(`tn-chip-${r.address}`).h(26).flex_none().max_w(280).pl(9).pr(4).gap(7).items_center().rounded(13)
    .bg(alpha(tint, waiting ? 0.16 : 0.10)).border(1).border_color(alpha(tint, waiting ? 0.45 : 0.35))
    .cursor_pointer().hover(s => s.bg(alpha(tint, waiting ? 0.24 : 0.16)).border_color(alpha(tint, waiting ? 0.6 : 0.5)))
    .tooltip(tip)
    .on_click(() => { run("agent.focus", { terminal: r.address }); if (boardShown()) showTerminals(); })
    .child(mark(r.kind))
    .child(div().min_w(0).flex_shrink(1).truncate().text_size(12).font_medium().text_color(C.fg).child(r.title))
    .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(dur(r.ms)))
    .child(div().flex_none().px(5).rounded(5).bg(waiting ? C.red : machineColor(r.machine)).font_family(MONO).text_size(10.5)
      .font_medium().text_color(C.ink).child(r.short));
}

function bar(snap, att) {
  const nWait = att.filter(r => r.kind === "waiting").length, nDone = att.length - nWait;
  const count = (label, n, color) => h_flex().flex_none().gap(6).items_center()
    .child(div().text_size(12).font_semibold().text_color(C.fg).child(label))
    .child(div().px(5).rounded(5).bg(color).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).child(String(n)));
  return h_flex().id("tn-bar").w_full().h(BAR).flex_none().pl(12).pr(12).gap(10).items_center().rounded(12)
    .bg(C.glass).border(1).border_color(C.rim)
    .when(!att.length, el => el.child(ico("check-circle", 14, C.green))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(C.fg).child("Nothing needs you")))
    .when(att.length > 0, el => el
      .when(nWait > 0, e => e.child(count("Needs you", nWait, C.red)))
      .when(nDone > 0, e => e.child(count("Done", nDone, C.green)))
      .child(h_flex().id("tn-chips").flex_1().min_w(0).h_full().gap(6).items_center().overflow_x_scroll().children(att.map(chip))))
    .child(div().flex_none().text_size(11).text_color(C.muted).child(summary(snap)));
}

export function renderStrip(view) {
  const snap = snapshot();
  // The board shows every agent already, so while it is up the strip is the tab row alone. Otherwise the strip holds
  // its one height whatever needs you (an installed layout may still say otherwise). Resized only when the wanted
  // height changes, or retried every 2 s.
  const board = boardShown();
  const px = board ? TABS : STRIP;
  if (nodePx("strip") !== px) {
    const now = Date.now();
    if (view.stripReq !== px || now - (view.stripAt ?? 0) > 2000) { view.stripReq = px; view.stripAt = now; run("layout.resize", { id: "strip", px }); }
  }
  return v_flex().id("tn-strip").size_full().gap(GAP).overflow_hidden()
    .child(tabRow(view, snap))
    .when(!board, el => el.child(bar(snap, attention(snap))));
}

// ---- tab bar: the shown space's tabs (Ctrl+Shift+T makes one), status capsule on the right ----
const TAB_KIND = { blocked: "waiting", working: "working", done: "done", idle: "idle" };
// A tab nobody named is called by its position ("1", "2"): show what runs in it instead. The focused pane (else
// the first): the title its program set (Claude Code: the session title), else the program, else the folder.
function tabLabel(t) {
  if (t.named !== false && !/^\d+$/.test(String(t.name))) return t.name;
  const ps = panes().filter(p => p.tab === t.id && p.terminal);
  const p = ps.find(x => x.focused) ?? ps[0];
  if (!p) return t.name;
  const title = String(p.title ?? "").replace(/^[^\p{L}\p{N}~/.]+/u, "").trim(); // drop spinner / status glyphs
  const folder = p.cwd ? p.cwd.replace(/\/+$/, "").split("/").pop() || "/" : "";
  return title || p.program?.name || folder || t.name;
}
function tabRow(view, snap) {
  const sp = spaces().find(s => s.active);
  const mc = machineColor(mkey(sp?.machine ?? null));
  // While the board shows, no tab is the shown one, and picking any tab (the active one too) goes back to the terminals.
  const board = boardShown();
  const tab = (t) => {
    const on = t.active && !board;
    return h_flex().id(`tn-tab-${t.id}`).h(26).min_w(0).max_w(220).flex_shrink(1).pl(10).pr(3).gap(7).items_center().rounded(8)
      .bg(on ? C.raised : CLEAR)
      .when(on, el => el.shadow_md())
      .cursor_pointer().hover(s => s.bg(on ? C.raisedHi : C.raised))
      .on_click(() => { if (board) showTerminals(); if (!t.active) run("tab.select", { id: t.id }); })
      .child(mark(t.status ? TAB_KIND[t.status] ?? "idle" : "idle"))
      .child(div().min_w(0).truncate().text_size(12).when(on, el => el.font_medium()).text_color(on ? C.fg : C.muted).child(tabLabel(t)))
      .when(t.panes > 1, el => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(C.muted).child(`×${t.panes}`)))
      // Close, always shown (muted; red under the pointer). It used to appear on hover by widening the tab, which
      // pushed "+" sideways under the pointer, so aiming at "+" closed a tab. Nothing in the bar moves on hover.
      // tab.close asks first when it would close the space's last tab.
      .child(h_flex().id(`tn-tab-xs-${t.id}`).w(20).h(16).flex_none().overflow_hidden().items_center()
        .child(h_flex().id(`tn-tab-x-${t.id}`).size(16).flex_none().justify_center().items_center()
          .rounded(4).cursor_pointer().hover(s => s.bg(alpha(C.red, 0.25))).tooltip("Close tab")
          .on_mouse_down("left", stop).on_click(() => run("tab.close", { id: t.id }))
          .child(ico("win-close", 9, C.muted))));
  };
  const tabs = (sp?.tabs ?? []).filter(t => !t.settled || t.active);
  return h_flex().w_full().h(TABS).flex_none().gap(10).items_center()
    .child(h_flex().id("tn-tabs").flex_1().min_w(0).h(30).p(2).gap(2).items_center().rounded(10).bg(C.well).overflow_x_scroll()
      .when(hasBoard(), el => el.child(boardPill(snap)).child(div().w(1).h(16).flex_none().mx(3).bg(C.rim)))
      .children(tabs.map(tab))
      .child(h_flex().id("tn-tab-new").size(26).flex_none().justify_center().items_center().rounded(8)
        .cursor_pointer().hover(s => s.bg(C.raised)).tooltip("New tab")
        .on_click(() => run("tab.new", {})).child(ico("plus", 13, C.muted))));
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
  const tab = spaces().flatMap(sp => sp.tabs ?? []).find(t => t.id === p.tab);
  const shown = p.title || p.program?.name || addr;
  const echoed = !!tab && tabLabel(tab) === String(shown).replace(/^[^\p{L}\p{N}~/.]+/u, "").trim();
  const folder = p.cwd ? p.cwd.replace(/^\/(?:home|Users)\/[^/]+/, "~").replace(/\/+$/, "") : "";
  return root
    .child(mark(kind))
    // The title, unless the tab already shows it (an unnamed tab takes its focused pane's title): then where the
    // pane is instead, its folder and git branch, so the tab and the header never say the same thing twice.
    .when(!echoed, el => el.child(div().min_w(0).flex_shrink(1).truncate().text_size(12).font_semibold().text_color(C.fg).child(p.title || p.program?.name || addr)))
    .when(echoed, el => el.child(div().min_w(0).flex_shrink(1).truncate().text_size(12).font_semibold().text_color(C.fg).child(folder || addr))
      .when(!!p.branch, el => el.child(h_flex().flex_none().gap(4).items_center().text_size(11).text_color(C.muted)
        .child(ico("branch", 11, C.muted)).child(div().whitespace_nowrap().child(p.branch)))))
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

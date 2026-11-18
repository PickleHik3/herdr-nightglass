// nightglass: the board. One screen of every agent on every machine in four columns (Needs you, Working, Done, Idle),
// shown in the main stack in place of the terminals: the strip's Board pill opens it, a tab (or opening an agent) goes
// back. A waiting card quotes what the agent asks (data.js pollQuestions); a finished one can be dismissed into Idle.
// Idea from jkuepker/herdr-layouts "board" (MIT), rebuilt on Herdr's own agent states instead of xo tasks.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, shared, setShared, layout } from "herdr";
import { C, MONO, CLEAR, alpha, mix, dur, ico, prog, mark, findNode, machineColor, machineGlyph } from "./lib.js";
import { snapshot, ALL, boardColumns, questionOf } from "./data.js";

// ---- shown or not: the main stack's active child ----
export const boardShown = () => findNode(layout(), "main-stack")?.active === "board";
export const hasBoard = () => !!findNode(layout(), "board");
export const showBoard = () => run("layout.select", { stack: "main-stack", child: "board" });
export const showTerminals = () => run("layout.select", { stack: "main-stack", child: "main" });

// ---- finished agents the person dismissed (as the phone's inbox does): { address: time dismissed } ----
// A finished agent stays dismissed while it hasn't finished again since (now - r.ms is its finish time).
const DIS_KEY = "nightglass.dismissed";
const disMap = () => shared(DIS_KEY) ?? {};
export const isDismissed = (r) => (disMap()[r.address] ?? 0) >= Date.now() - r.ms;
function dismiss(rows) {
  const next = { ...disMap() }, now = Date.now();
  for (const r of rows) next[r.address] = now;
  const keys = Object.keys(next);
  if (keys.length > 200) for (const k of keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - 200)) delete next[k];
  setShared(DIS_KEY, next);
}

// Opening an agent leaves the board for its terminal.
function open(r) {
  run("agent.focus", { terminal: r.address });
  showTerminals();
}

const COL = {
  waiting: { label: "Needs you", color: () => C.red },
  working: { label: "Working", color: () => C.green },
  done: { label: "Done", color: () => C.teal ?? C.green },
  idle: { label: "Idle", color: () => C.idle },
};
const when = (r, k) => k === "waiting" ? `waiting ${dur(r.ms)}` : k === "working" ? dur(r.ms) : k === "done" ? `done ${dur(r.ms)} ago` : `idle ${dur(r.ms)}`;

const button = (id, label, primary, tint, onPress) => h_flex().id(id).h(26).flex_none().px(10).items_center().rounded(7)
  .text_size(12).font_medium().cursor_pointer()
  .bg(primary ? tint : C.raised).text_color(primary ? C.ink : C.fg)
  .hover(s => s.bg(primary ? mix(tint, "#ffffff", 0.85) : C.raisedHi))
  .on_click((_e, cx) => { cx.stop_propagation(); onPress(); cx.notify(); })
  .child(label);

function card(r, k) {
  const tint = COL[k].color();
  const offline = r.kind === "offline";
  const q = k === "waiting" ? questionOf(r.address) : null;
  const sub = k === "waiting" ? null : r.report;
  const where = [r.branch, r.cwd].filter(Boolean).join(" · ");
  // The whole card opens the agent; the buttons stop the press.
  return h_flex().id(`tn-bc-${r.address}`).w_full().flex_none().items_stretch().rounded(10).overflow_hidden()
    .bg(k === "waiting" ? alpha(tint, 0.10) : C.raised).border(1).border_color(k === "waiting" ? alpha(tint, 0.35) : CLEAR)
    .opacity(offline ? 0.6 : 1).cursor_pointer()
    .hover(s => s.bg(k === "waiting" ? alpha(tint, 0.16) : C.raisedHi))
    .tooltip(offline ? `${r.machineName} is unreachable: last known state` : `Open ${r.short}`)
    .on_click(() => open(r))
    .child(div().w(3).flex_none().bg(tint))
    .child(v_flex().flex_1().min_w(0).pl(10).pr(10).py(9).gap(5)
      // Which machine: its glyph (the sidebar tile's), then where in it; the column already says the status.
      .child(h_flex().w_full().gap(6).items_center().text_size(11).text_color(C.muted)
        .child(machineGlyph(r.machine, 18))
        .child(div().flex_none().max_w(110).truncate().font_medium().text_color(C.fg).child(r.machineName))
        .child(div().flex_1().min_w(0).truncate().child(r.spaceName ?? ""))
        .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(k === "waiting" ? tint : C.muted).child(when(r, k))))
      .child(div().w_full().min_w(0).truncate().text_size(13).font_semibold().text_color(C.fg).child(r.title))
      .when(k === "waiting", el => el.child(v_flex().w_full().px(8).py(6).gap(2).rounded(7).bg(alpha(tint, 0.10))
        .child(div().font_family(MONO).text_size(10).font_semibold().text_color(tint).child("ASKS YOU"))
        .child(div().w_full().min_w(0).text_size(12).text_color(q ? C.fg : C.muted).child(q ?? r.report ?? "reading its screen…"))))
      .when(!!sub, el => el.child(div().w_full().min_w(0).truncate().text_size(12).text_color(C.muted).child(sub)))
      .when(!!where, el => el.child(div().w_full().min_w(0).truncate().font_family(MONO).text_size(10.5).text_color(C.dim).child(where)))
      .child(h_flex().w_full().gap(6).pt(2).items_center()
        .child(button(`tn-bo-${r.address}`, k === "waiting" ? "Answer" : "Open", k === "waiting", tint, () => open(r)))
        .when(k === "done", el => el.child(button(`tn-bd-${r.address}`, "Dismiss", false, tint, () => dismiss([r]))))
        .child(div().flex_1())
        .child(prog(r.program, 14, C.muted))
        .child(div().flex_none().px(5).rounded(5).bg(machineColor(r.machine)).font_family(MONO).text_size(10.5).font_medium()
          .text_color(C.ink).child(r.short))));
}

function column(k, rows) {
  const tint = COL[k].color();
  return v_flex().id(`tn-bcol-${k}`).flex_1().min_w(0).h_full().gap(8).p(8).rounded(12).bg(C.glass).border(1).border_color(C.rim)
    .child(h_flex().w_full().h(26).flex_none().px(4).gap(8).items_center()
      .child(k === "idle" ? div().size(8).flex_none().rounded(4).border(1.5).border_color(tint) : k === "done" ? ico("check", 11, tint) : mark(k))
      .child(div().font_family(MONO).text_size(11).font_semibold().text_color(C.fg).child(COL[k].label.toUpperCase()))
      .child(div().px(5).rounded(5).bg(rows.length && k === "waiting" ? tint : C.raised).font_family(MONO).text_size(10.5)
        .text_color(rows.length && k === "waiting" ? C.ink : C.muted).child(String(rows.length)))
      .child(div().flex_1())
      .when(k === "done" && rows.length > 1, el => el.child(button("tn-bd-all", "Dismiss all", false, tint, () => dismiss(rows)))))
    .child(v_flex().id(`tn-bcl-${k}`).w_full().flex_1().min_h(0).gap(8).overflow_y_scroll()
      .children(rows.map(r => card(r, k)))
      .when(!rows.length, el => el.child(div().w_full().py(18).text_center().text_size(12).text_color(C.dim)
        .child(k === "waiting" ? "Nothing needs you" : "None"))));
}

// Machine chips: All, then each machine with its agent count and a red dot while one there waits. A click filters.
function chips(view, snap) {
  const f = view.boardFilter ?? ALL;
  const agents = (key) => snap.rows.filter(r => r.agent && (key === ALL || r.machine === key));
  const chip = (key, label, color) => {
    const on = f === key, rows = agents(key);
    return h_flex().id(`tn-bf-${key}`).h(26).flex_none().px(10).gap(6).items_center().rounded(13).cursor_pointer()
      .bg(on ? C.raisedHi : C.raised).border(1).border_color(on ? alpha(color, 0.6) : CLEAR)
      .hover(s => s.bg(C.raisedHi))
      .on_click((_e, cx) => { view.boardFilter = key; cx.notify(); })
      .when(key !== ALL, el => el.child(machineGlyph(key, 16)))
      .child(div().text_size(12).font_medium().text_color(on ? C.fg : C.muted).child(label))
      .child(div().font_family(MONO).text_size(10.5).text_color(C.dim).child(String(rows.length)))
      .when(rows.some(r => r.kind === "waiting"), el => el.child(div().size(6).flex_none().rounded(3).bg(C.red)));
  };
  return h_flex().id("tn-bchips").w_full().h(30).flex_none().gap(6).items_center().overflow_x_scroll()
    .child(chip(ALL, "All", "#ffffff"))
    .children(snap.machines.filter(m => agents(m.key).length).map(m => chip(m.key, m.name, machineColor(m.key))));
}

export function renderBoard(view) {
  const snap = snapshot();
  if (view.boardFilter && view.boardFilter !== ALL && !snap.mBy.has(view.boardFilter)) view.boardFilter = ALL;
  const cols = boardColumns(snap, view.boardFilter ?? ALL, isDismissed);
  // A plain flex row: h_flex centres its children, which would shrink each column to its header.
  return v_flex().id("tn-board").size_full().gap(8)
    .child(chips(view, snap))
    .child(div().flex().flex_row().w_full().flex_1().min_h(0).gap(8)
      .children(["waiting", "working", "done", "idle"].map(k => column(k, cols[k]))));
}

// The strip's Board pill: before the tabs, with the count of agents waiting on you.
export function boardPill(snap) {
  const on = boardShown();
  const n = snap.rows.filter(r => r.agent && r.kind === "waiting").length;
  return h_flex().id("tn-board-pill").h(26).flex_none().pl(9).pr(n ? 5 : 10).gap(7).items_center().rounded(8)
    .bg(on ? C.raised : CLEAR).when(on, el => el.shadow_md())
    .cursor_pointer().hover(s => s.bg(on ? C.raisedHi : C.raised)).tooltip(on ? "Back to the terminals" : "Every agent on one board")
    .on_click((_e, cx) => { if (on) showTerminals(); else showBoard(); cx.notify(); })
    .child(ico("board", 13, on ? C.fg : C.muted))
    .child(div().text_size(12).when(on, el => el.font_medium()).text_color(on ? C.fg : C.muted).child("Board"))
    .when(n > 0, el => el.child(div().px(5).rounded(5).bg(C.red).font_family(MONO).text_size(10.5).font_medium().text_color(C.ink).child(String(n))));
}

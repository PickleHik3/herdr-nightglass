// tokyo-night-phone: the drawer under the terminal. Glass, as the desktop sidebar: two floating boxes with a gap
// between them, a list box (machine cards + All, spaces as capsules with their agent rows) and a widget box
// (cpu / ram / disk). Design: design/Phone.dc.html (drawer); look: design/GLASS.md. The drawer block itself is
// transparent so the wallpaper shows between and around the boxes.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, closeOverlay, props, shared, setShared, run } from "herdr";
import { C, M, MONO, CLEAR, SCHEMES, COLORS_KEY, alpha, dur, ico, mark, level, machineColor, nearBlack, darkOf, lightOf, anchorBelow } from "./lib.js";
import { snapshot, LOCAL, ALL, mArg, lastSeen, statsMachine } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg } from "./phone.js";
import { focusRow } from "./strip.js";

const machineIcon = (m, size, color) => ico(m.key === LOCAL ? "monitor" : "server", size, color);
// Herdr's ram ("sheep") tile, full color: the All tile's icon (the desktop mod's herdr.png).
const sheep = (size) => image(`${M}/herdr.png`).size(size).rounded(Math.round(size / 4)).flex_none();
const COLORS_W = 312, COLORS_H = 86;
// A Glass box: glass fill, rim, shadow_2xl, radius 16.
const floatBox = (el) => el.bg(C.glass).rounded(16).border(1).border_color(C.rim).shadow_2xl().overflow_hidden();

// The most urgent light over all machines; offline only counts when every machine is offline.
function allLight(snap) {
  const lights = snap.machines.map(m => m.light);
  for (const k of ["waiting", "working", "idle"]) if (lights.includes(k)) return k;
  return lights.length && lights.every(l => l === "offline") ? "offline" : null;
}

// ---- machine cards ----
function tile(view, m, open, w) {
  const sel = open === m.key;
  const mc = machineColor(m.key);
  const wait = m.count.waiting > 0;
  return h_flex().id(`tnp-m-${m.key}`).w(w).h(48).flex_none().px(10).gap(9).items_center().rounded(10)
    .bg(sel ? C.raisedHi : C.raised).border(1).border_color(sel ? alpha(mc, 0.55) : CLEAR)
    .when(sel, el => el.shadow_md())
    .opacity(m.offline ? 0.7 : 1).cursor_pointer()
    // The open machine's card, tapped again, opens its theme picker (there is no right-click on a phone).
    .on_mouse_down("left", (e, cx) => {
      cx.stop_propagation();
      if (!sel || !e?.local_position || !e?.bounds) { view.colorsAt = null; return; }
      // `at` and event positions are screen px, popup sizes are designed px
      const z = zoom(), a = anchorBelow(e);
      const maxX = WIN.w > 0 ? Math.max(8 * z, WIN.w - (COLORS_W + 8) * z) : 8 * z;
      view.colorsAt = { x: Math.round(Math.min(maxX, Math.max(8 * z, a.x))), y: Math.round(Math.max(8 * z, a.y - e.bounds.height - (8 + COLORS_H) * z)) };
    })
    .on_click((_e, cx) => {
      if (sel && view.colorsAt) {
        openOverlay({ mod: MOD, kind: "popup", frame: "none", width: COLORS_W, height: COLORS_H, at: view.colorsAt, props: { role: "colors", machine: m.key, name: m.name } });
      } else { view.goMachine(m.key); view.pollStats(cx, true); }
      cx.notify();
    })
    .child(h_flex().size(28).flex_none().rounded(7).justify_center().items_center().bg(alpha(mc, 0.16))
      .child(machineIcon(m, 14, mc)))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12).font_semibold().text_color(sel ? C.fg : C.muted).child(m.name))
      .child(div().truncate().text_size(11).text_color(m.offline ? C.amber : wait ? C.red : C.muted).child(m.summary)));
}

// The All tile: no machine, so no color to pick; selected = white 14% + white 40% border (Glass).
function allTile(view, snap, open, w) {
  const sel = open === ALL;
  const n = snap.rows.filter(r => r.agent && r.kind === "waiting").length;
  const l = allLight(snap);
  return h_flex().id("tnp-m-all").w(w).h(48).flex_none().px(10).gap(9).items_center().rounded(10)
    .bg(sel ? C.raisedHi : C.raised).border(1).border_color(sel ? alpha("#ffffff", 0.4) : CLEAR)
    .when(sel, el => el.shadow_md())
    .cursor_pointer()
    .on_click((_e, cx) => { view.setOpen(ALL); view.pollStats(cx, true); cx.notify(); })
    .child(sheep(28))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12).font_semibold().text_color(sel ? C.fg : C.muted).child("All"))
      .child(div().truncate().text_size(11).text_color(n > 0 ? C.red : l === "offline" ? C.amber : C.muted)
        .child(`${snap.machines.length} machines${n > 0 ? ` · ${n} waiting` : ""}`)));
}

// ---- agent rows and space capsules (the desktop's Glass rows; the "now" line is always shown, there is no hover) ----
function agentRow(r) {
  const waiting = r.kind === "waiting", cur = r.focused;
  const mc = machineColor(r.machine);
  // Focused row: solid machine color, dark-of-hue text, no outline (the machine card holds the stack's one).
  const t1 = nearBlack(mc), t2 = darkOf(mc);
  return h_flex().id(`tnp-row-${r.address}`).w_full().h(44).flex_none().pl(8).pr(5).gap(8).items_center().rounded(6)
    .bg(cur ? mc : waiting ? alpha(C.red, 0.2) : CLEAR)
    .when(cur, el => el.shadow_md())
    .text_size(13).text_color(cur ? t1 : r.kind === "offline" ? C.dim : C.muted).cursor_pointer()
    .on_click(() => focusRow(r))
    .child(mark(r.kind))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().when(cur, el => el.font_semibold()).child(r.title))
      .child(div().truncate().font_family(MONO).text_size(10.5).line_height("15px").text_color(cur ? t2 : waiting ? C.red : C.muted).child(r.now)))
    .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(cur ? t2 : C.muted).child(r.kind === "offline" ? "" : dur(r.ms)))
    .child(h_flex().flex_none().h(18).px(6).rounded(5).items_center().font_family(MONO).text_size(10.5)
      .bg(cur ? t1 : C.raised).text_color(cur ? lightOf(mc) : C.muted).child(r.short));
}

// A space capsule: raised fill, 9 radius; tinted red / green when a terminal waits / an agent finished.
function capsule(sp, m) {
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
    .children(sp.rows.map(agentRow));
}

const newSpaceRow = (id, m, label) => h_flex().id(id).w_full().h(40).flex_none().px(12).gap(8).items_center().rounded(9)
  .text_size(12).text_color(C.muted).cursor_pointer()
  .on_click(() => run("space.new", { machine: mArg(m.key) }))
  .child(ico("folder", 13, C.muted)).child(div().truncate().child(label));

// The All view: one card per machine, tinted in its color (9% fill, 36% border), with its capsules inside.
function allGroups(view, snap) {
  return snap.machines.map(m => {
    const color = machineColor(m.key);
    return v_flex().id(`tnp-all-${m.key}`).w_full().flex_none().rounded(12).p(4).gap(4)
      .bg(alpha(color, 0.09)).border(1).border_color(alpha(color, 0.36)).opacity(m.offline ? 0.62 : 1)
      .child(h_flex().id(`tnp-all-h-${m.key}`).w_full().h(40).flex_none().gap(8).px(6).items_center().rounded(8).cursor_pointer()
        .on_click((_e, cx) => { view.goMachine(m.key); view.pollStats(cx, true); cx.notify(); })
        .child(machineIcon(m, 13, color))
        // The name keeps its width; a long summary is what gets cut.
        .child(div().flex_none().max_w(140).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(m.offline ? C.amber : m.count.waiting ? C.red : C.muted).child(m.summary)))
      .children(m.spaces.map(sp => capsule(sp, m)))
      .when(m.spaces.length === 0, el => el.child(div().px(8).py(2).text_size(11).text_color(C.muted).child("No spaces")))
      .when(!m.offline, el => el.child(newSpaceRow(`tnp-all-new-${m.key}`, m, "New space")));
  });
}

// ---- widget box: cpu / ram / disk, bars of equal length (disk = used, with what is free as its text, like the desktop) ----
const diskUsed = (data) => data.diskTotal > 0 ? Math.round(100 - data.diskFree / data.diskTotal * 100) : 0;
const diskFreeText = (data) => `${data.diskFree >= 100 ? Math.round(data.diskFree) : data.diskFree.toFixed(1)} GB free`;
function stats(view, m) {
  const st = view.stats?.[m.key];
  const data = st?.data;
  const col = (label, pct, text) => v_flex().flex_1().min_w(0).gap(4)
    .child(h_flex().gap(6).items_center().whitespace_nowrap().overflow_hidden()
      .child(ico(label, 13, C.muted))
      .child(div().min_w(0).truncate().text_color(C.muted).child(text)))
    .child(div().w_full().h(4).rounded(2).bg(C.well).overflow_hidden()
      .child(div().h(4).rounded(2).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, C.fg))));
  return floatBox(h_flex().id("tnp-stats").w_full().flex_none().gap(10).px(12).py(10))
    .font_family(MONO).text_size(10.5).opacity(m.offline ? 0.55 : 1)
    .when(!!data, el => el
      .child(col("cpu", data.cpu, `${data.cpu}%`))
      .child(col("ram", data.memPct, data.memText))
      .child(col("disk", diskUsed(data), diskFreeText(data))))
    .when(!data, el => el.child(div().text_color(C.muted)
      .child(m.offline ? "stats unavailable while offline" : st?.fail ? "stats unavailable" : "reading…")));
}

export function renderDrawer(view) {
  const snap = snapshot();
  const open = view.openKey(snap);
  const all = open === ALL;
  const m = open && !all ? snap.mBy.get(open) : null;
  const sm = all ? statsMachine(snap, open) : m;
  const w = view.width ? dsg(view.width) : DESIGN_W; // designed px (the size event reports screen px)
  // Machine cards: with two or fewer, two equal columns inside the box padding; with more, one horizontally
  // scrollable row of the same cards, a third one peeking in. The agent rows stay on screen (three wrapped rows
  // of cards would take ~160 px of an ~240 px drawer).
  const inner = w - 16 - 20; // drawer side padding + box padding
  const cards = snap.machines.length + 1;
  const tileW = cards <= 2 ? Math.floor((inner - 6) / 2) : Math.floor((inner - 12) / 2.35);
  return v_flex().id("tnp-drawer").size_full().px(8).pb(8).gap(8)
    .on_size_change((size, cx) => { if (Math.abs((view.width ?? 0) - size.width) >= 1) { view.width = size.width; cx.notify(); } })
    .child(floatBox(v_flex().w_full().flex_1().min_h(0).px(10).pt(6).pb(8).gap(8))
      .child(div().w(36).h(4).rounded(2).bg(C.rim).flex_none().self_center())
      .child(h_flex().id("tnp-machines-row").w_full().h(48).flex_none().gap(6).overflow_x_scroll()
        .child(allTile(view, snap, open, tileW)).children(snap.machines.map(mm => tile(view, mm, open, tileW))))
      .child(v_flex().id("tnp-spaces").w_full().flex_1().min_h(0).gap(6).overflow_y_scroll()
        .when(all, el => el.children(allGroups(view, snap)))
        .when(!!m, el => el.children(m.spaces.map(sp => capsule(sp, m))))
        .when(!!m && m.spaces.length === 0, el => el.child(div().px(4).text_color(C.muted).child(`No spaces on ${m.name}`)))
        .when(!!m && !m.offline, el => el.child(newSpaceRow("tnp-newspace", m, `New space on ${m.name}`)))))
    .when(!!sm, el => el.child(stats(view, sm)));
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

// tokyo-night-phone: the drawer under the terminal (machine cards + All, spaces with their agent rows,
// cpu / ram / disk well). Design: design/Phone.dc.html (drawer); depth and machine colors follow the desktop sidebar.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, closeOverlay, props, shared, setShared } from "herdr";
import { C, M, MONO, CLEAR, BADGES, SCHEMES, COLORS_KEY, alpha, mix, dur, hash, ico, mark, level, machineColor, raisedFill, rim, anchorBelow } from "./lib.js";
import { snapshot, LOCAL, ALL, lastSeen, statsMachine } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg } from "./phone.js";
import { focusRow } from "./strip.js";

const machineIcon = (m, size, color) => ico(m.key === LOCAL ? "monitor" : "server", size, color);
// Herdr's ram ("sheep") tile, full color: the All tile's icon (the desktop mod's herdr.png).
const sheep = (size) => image(`${M}/herdr.png`).size(size).rounded(Math.round(size / 4)).flex_none();
const COLORS_W = 312, COLORS_H = 86;

// The most urgent light over all machines; offline only counts when every machine is offline.
function allLight(snap) {
  const lights = snap.machines.map(m => m.light);
  for (const k of ["waiting", "working", "idle"]) if (lights.includes(k)) return k;
  return lights.length && lights.every(l => l === "offline") ? "offline" : null;
}

function tile(view, m, open, w) {
  const sel = open === m.key;
  const mc = machineColor(m.key);
  const wait = m.count.waiting > 0;
  return h_flex().id(`tnp-m-${m.key}`).w(w).h(48).flex_none().px(10).gap(9).items_center().rounded(8)
    .bg(sel ? alpha(mc, 0.16) : raisedFill(C.surface)).border(1).border_color(sel ? alpha(mc, 0.55) : rim())
    .when(sel, el => el.shadow_md()).when(!sel, el => el.shadow_sm())
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
    .child(h_flex().size(28).flex_none().rounded(6).justify_center().items_center().bg(sel ? alpha(mc, 0.24) : C.raised)
      .child(machineIcon(m, 14, sel ? mc : C.muted)))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12).font_semibold().text_color(sel ? C.fg : C.muted).child(m.name))
      .child(div().truncate().font_family(MONO).text_size(11).text_color(m.offline ? C.amber : wait ? C.red : C.dim).child(m.summary)));
}

function allTile(view, snap, open, w) {
  const sel = open === ALL;
  const n = snap.rows.filter(r => r.agent && r.kind === "waiting").length;
  const l = allLight(snap);
  return h_flex().id("tnp-m-all").w(w).h(48).flex_none().px(10).gap(9).items_center().rounded(8)
    .bg(sel ? alpha(C.accent, 0.16) : raisedFill(C.surface)).border(1).border_color(sel ? alpha(C.accent, 0.55) : rim())
    .when(sel, el => el.shadow_md()).when(!sel, el => el.shadow_sm())
    .cursor_pointer()
    .on_click((_e, cx) => { view.setOpen(ALL); view.pollStats(cx, true); cx.notify(); })
    .child(sheep(28))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12).font_semibold().text_color(sel ? C.fg : C.muted).child("All"))
      .child(div().truncate().font_family(MONO).text_size(11).text_color(n > 0 ? C.red : l === "offline" ? C.amber : C.dim)
        .child(`${snap.machines.length} machines${n > 0 ? ` · ${n} waiting` : ""}`)));
}

function agentRow(r) {
  const waiting = r.kind === "waiting", cur = r.focused;
  const mc = machineColor(r.machine);
  const tint = waiting ? C.red : cur ? mc : null;
  return h_flex().id(`tnp-row-${r.address}`).w_full().h(44).flex_none().pl(12).pr(8).gap(9).items_center().rounded(10)
    .bg(tint ? mix(tint, C.surface, 0.12) : raisedFill(C.surface)).border(1).border_color(tint ? alpha(tint, 0.5) : rim())
    .when(!!tint, el => el.shadow_md()).when(!tint, el => el.shadow_sm())
    .text_size(13).text_color(r.kind === "offline" ? C.dim : C.fg).cursor_pointer()
    .on_click(() => focusRow(r))
    .child(mark(r.kind))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().font_medium().child(r.title))
      .child(div().truncate().font_family(MONO).text_size(11).line_height("15px").text_color(waiting ? C.red : C.dim).child(r.now)))
    .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(r.kind === "offline" ? "" : dur(r.ms)))
    .child(h_flex().flex_none().h(18).px(7).rounded(9).items_center().font_family(MONO).text_size(11)
      .bg(cur ? mc : C.raised).text_color(cur ? C.onAccent : C.muted).child(r.short));
}

function folder(sp, m) {
  const color = BADGES[hash(sp.id) % BADGES.length];
  const initial = ([...(sp.name || "?")][0] ?? "?").toUpperCase();
  const seenAt = lastSeen(m.key);
  return v_flex().w_full().flex_none().gap(2)
    .child(h_flex().w_full().h(24).px(4).gap(8).items_center()
      .child(h_flex().size(18).flex_none().rounded(9).justify_center().items_center().bg(alpha(color, 0.2))
        .text_color(color).text_size(10).font_semibold().child(initial))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(sp.name))
      .when(!m.offline && !!sp.branch, el => el.child(div().flex_none().max_w(160).truncate().font_family(MONO).text_size(11).text_color(C.purple).child(sp.branch)))
      .when(m.offline, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.amber).whitespace_nowrap()
        .child(seenAt ? `last seen ${dur(Date.now() - seenAt)}` : "offline"))))
    .children(sp.rows.map(agentRow));
}

// The All view: one card per machine, tinted in its color, with its spaces inside (as the desktop's).
function allGroups(view, snap) {
  return snap.machines.map(m => {
    const color = machineColor(m.key);
    return v_flex().id(`tnp-all-${m.key}`).w_full().flex_none().rounded(14).p(6).gap(6)
      .bg(alpha(color, 0.06)).border(1).border_color(alpha(color, 0.35)).shadow_sm().opacity(m.offline ? 0.62 : 1)
      .child(h_flex().id(`tnp-all-h-${m.key}`).w_full().h(40).flex_none().gap(8).px(6).items_center().rounded(10).cursor_pointer()
        .on_click((_e, cx) => { view.goMachine(m.key); view.pollStats(cx, true); cx.notify(); })
        .child(machineIcon(m, 13, color))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
        .child(div().flex_none().font_family(MONO).text_size(11).text_color(m.offline ? C.amber : m.count.waiting ? C.red : C.dim).child(m.summary)))
      .children(m.spaces.map(sp => folder(sp, m)))
      .when(m.spaces.length === 0, el => el.child(div().px(8).py(2).text_size(11).text_color(C.dim).child("No spaces")));
  });
}

// ---- stats: an inset well flush with the screen's bottom and sides (the desktop dock's well) ----
const shortGB = (t) => String(t ?? "").replace(" / ", "/").replace(" GB", "G"); // "11.2 / 16 GB" -> "11.2/16G"
function stats(view, m) {
  const st = view.stats?.[m.key];
  const data = st?.data;
  const col = (label, pct, text, tint) => v_flex().flex_1().min_w(0).gap(4)
    .child(h_flex().gap(6).items_center().whitespace_nowrap().overflow_hidden()
      .child(ico(label, 13, C.dim))
      .child(div().min_w(0).truncate().text_color(tint ?? C.muted).child(text)))
    .child(div().w_full().h(5).rounded(3).bg(C.raised).overflow_hidden()
      .child(div().h(5).rounded(3).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, C.cyan))));
  const freePct = data && data.diskTotal > 0 ? data.diskFree / data.diskTotal * 100 : 100;
  return h_flex().w_full().flex_none().gap(10).px(14).pt(8).pb(12)
    .bg(mix("#000000", C.chrome, 0.18)).border_t(1).border_color(alpha(C.fg, 0.07))
    .font_family(MONO).text_size(11).opacity(m.offline ? 0.55 : 1)
    .when(!!data, el => el
      .child(col("cpu", data.cpu, `${data.cpu}%`))
      .child(col("ram", data.memPct, shortGB(data.memText)))
      // disk as free space, as the desktop shows it: amber under 15% free, red under 5%
      .child(col("disk", data.diskPct, `${Math.round(data.diskFree)}G free`, freePct < 5 ? C.red : freePct < 15 ? C.amber : C.fg)))
    .when(!data, el => el.child(div().text_color(C.dim)
      .child(m.offline ? "stats unavailable while offline" : st?.fail ? "stats unavailable" : "reading…")));
}

export function renderDrawer(view) {
  const snap = snapshot();
  const open = view.openKey(snap);
  const all = open === ALL;
  const m = open && !all ? snap.mBy.get(open) : null;
  const sm = all ? statsMachine(snap, open) : m;
  const w = view.width ? dsg(view.width) : DESIGN_W; // designed px (the size event reports screen px)
  // Machine cards: with two or fewer, two equal columns inside the 10 px padding; with more, one horizontally
  // scrollable row of the same cards, a third one peeking in. The agent rows stay on screen (three wrapped rows
  // of cards would take ~160 px of an ~240 px drawer).
  const cards = snap.machines.length + 1;
  const tileW = cards <= 2 ? Math.floor((w - 20 - 6) / 2) : Math.floor((w - 20 - 12) / 2.35);
  return v_flex().id("tnp-drawer").size_full().bg(C.chrome).rounded_t(14).overflow_hidden()
    .on_size_change((size, cx) => { if (Math.abs((view.width ?? 0) - size.width) >= 1) { view.width = size.width; cx.notify(); } })
    .child(v_flex().w_full().flex_1().min_h(0).px(10).pt(6).gap(8)
      .child(div().w(36).h(4).rounded(2).bg(C.input).flex_none().self_center())
      .child(h_flex().id("tnp-machines-row").w_full().h(48).flex_none().gap(6).overflow_x_scroll()
        .child(allTile(view, snap, open, tileW)).children(snap.machines.map(mm => tile(view, mm, open, tileW))))
      .child(v_flex().id("tnp-spaces").w_full().flex_1().min_h(0).gap(6).overflow_y_scroll()
        .when(all, el => el.children(allGroups(view, snap)))
        .when(!!m, el => el.children(m.spaces.map(sp => folder(sp, m))))
        .when(!!m && m.spaces.length === 0, el => el.child(div().px(4).text_color(C.dim).child(`No spaces on ${m.name}`)))))
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
  return v_flex().id("tnp-colors").w_full().h(COLORS_H).bg(C.surface).rounded(8).border(1).border_color(rim()).shadow_xl().overflow_hidden().p(10).gap(10)
    .child(div().w_full().h(16).flex_none().truncate().text_size(11).font_semibold().text_color(C.dim).child(`THEME FOR ${String(p.name ?? p.machine).toUpperCase()}`))
    .child(h_flex().w_full().h(32).flex_none().gap(4).items_center()
      .children(SCHEMES.map(sc => h_flex().id(`tnp-sw-${sc.color}`).size(32).flex_none().rounded(16).bg(sc.color).cursor_pointer()
        .border(2).border_color(cur[p.machine] === sc.color ? C.fg : CLEAR).tooltip(sc.label)
        .on_click(() => set(sc.color)))));
}

// tokyo-night-phone: the panel under the top bar (layout node "drawer"), hidden until the top bar's last button toggles
// it. One Glass floating box: machine cards + All, the actions row (New space / Terminal / Agent / Files / Changes /
// Settings, newmenu.js: what the retired menu popup offered) and the list (spaces as capsules with their agent rows,
// which scrolls). Design: design/Phone.dc.html (drawer); look: design/GLASS.md. The block itself is transparent so the
// wallpaper shows around the box. Its height follows its content up to a cap that leaves the terminal >= 120 px
// (panelSync); it shows whether or not the soft keyboard is up. Picking an agent or a space closes it.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, closeOverlay, props, shared, setShared, run, layout } from "herdr";
import { C, M, MONO, CLEAR, SCHEMES, COLORS_KEY, alpha, dur, ico, mark, machineColor, nearBlack, darkOf, lightOf, anchorBelow, nodePx, findNode } from "./lib.js";
import { snapshot, LOCAL, ALL, mArg, lastSeen, statsMachine } from "./data.js";
import { MOD, WIN, DESIGN_W, zoom, dsg, popupIsOpen, popupJustClosed, swipeArea, swipeBody, watchScroll, tap, setPanel } from "./phone.js";
import { focusRow } from "./strip.js";
import { actionRows, actionsHeight } from "./newmenu.js";
import { composerOpen } from "./composer.js";

const closePanel = () => setPanel(false);

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
    .on_click(tap(view, (_e, cx) => {
      if (sel && view.colorsAt) {
        if (popupJustClosed("colors")) return;                                              // the outside press just closed it
        if (popupIsOpen("colors") && view.colorsId) { closeOverlay(view.colorsId); return; } // a second tap closes it
        view.colorsId = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: COLORS_W, height: COLORS_H, at: view.colorsAt, props: { role: "colors", machine: m.key, name: m.name } });
      } else view.goMachine(m.key); // switches the list; the panel stays open for picking an agent
      cx.notify();
    }))
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
    .on_click(tap(view, (_e, cx) => { view.setOpen(ALL); cx.notify(); }))
    .child(sheep(28))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12).font_semibold().text_color(sel ? C.fg : C.muted).child("All"))
      .child(div().truncate().text_size(11).text_color(n > 0 ? C.red : l === "offline" ? C.amber : C.muted)
        .child(`${snap.machines.length} machines${n > 0 ? ` · ${n} waiting` : ""}`)));
}

// ---- agent rows and space capsules (the desktop's Glass rows; the "now" line is always shown, there is no hover) ----
function agentRow(view, r) {
  const waiting = r.kind === "waiting", cur = r.focused;
  const mc = machineColor(r.machine);
  // Focused row: solid machine color, dark-of-hue text, no outline (the machine card holds the stack's one).
  const t1 = nearBlack(mc), t2 = darkOf(mc);
  return h_flex().id(`tnp-row-${r.address}`).w_full().h(44).flex_none().pl(8).pr(5).gap(8).items_center().rounded(6)
    .bg(cur ? mc : waiting ? alpha(C.red, 0.2) : CLEAR)
    .when(cur, el => el.shadow_md())
    .text_size(13).text_color(cur ? t1 : r.kind === "offline" ? C.dim : C.muted).cursor_pointer()
    .on_click(tap(view, () => { closePanel(); focusRow(r); }))
    .child(mark(r.kind))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().when(cur, el => el.font_semibold()).child(r.title))
      .child(div().truncate().font_family(MONO).text_size(10.5).line_height("15px").text_color(cur ? t2 : waiting ? C.red : C.muted).child(r.now)))
    .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(cur ? t2 : C.muted).child(r.kind === "offline" ? "" : dur(r.ms)))
    .child(h_flex().flex_none().h(18).px(6).rounded(5).items_center().font_family(MONO).text_size(10.5)
      .bg(cur ? t1 : C.raised).text_color(cur ? lightOf(mc) : C.muted).child(r.short));
}

// A space capsule: raised fill, 9 radius; tinted red / green when a terminal waits / an agent finished.
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

const newSpaceRow = (view, id, m, label) => h_flex().id(id).w_full().h(40).flex_none().px(12).gap(8).items_center().rounded(9)
  .text_size(12).text_color(C.muted).cursor_pointer()
  .on_click(tap(view, () => { closePanel(); run("space.new", { machine: mArg(m.key) }); }))
  .child(ico("folder", 13, C.muted)).child(div().truncate().child(label));

// The All view: one card per machine, tinted in its color (9% fill, 36% border), with its capsules inside.
function allGroups(view, snap) {
  return snap.machines.map(m => {
    const color = machineColor(m.key);
    return v_flex().id(`tnp-all-${m.key}`).w_full().flex_none().rounded(12).p(4).gap(4)
      .bg(alpha(color, 0.09)).border(1).border_color(alpha(color, 0.36)).opacity(m.offline ? 0.62 : 1)
      .child(h_flex().id(`tnp-all-h-${m.key}`).w_full().h(40).flex_none().gap(8).px(6).items_center().rounded(8).cursor_pointer()
        .on_click(tap(view, (_e, cx) => { closePanel(); view.goMachine(m.key); cx.notify(); }))
        .child(machineIcon(m, 13, color))
        // The name keeps its width; a long summary is what gets cut.
        .child(div().flex_none().max_w(140).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(m.offline ? C.amber : m.count.waiting ? C.red : C.muted).child(m.summary)))
      .children(m.spaces.map(sp => capsule(view, sp, m)))
      .when(m.spaces.length === 0, el => el.child(div().px(8).py(2).text_size(11).text_color(C.muted).child("No spaces")))
      .when(!m.offline, el => el.child(newSpaceRow(view, `tnp-all-new-${m.key}`, m, "New space")));
  });
}

// ---- height: the content's, up to what leaves the terminal at least TERM_MIN designed px ----
// Rows of the stack above and below it (top bar 52, tabs 40, the strip when shown, the composer when open) and 6 px gaps.
const TOP = 52, TABS = 40, TERM_MIN = 120, GAPS = 30;
const listHeight = (snap, open, m) => {
  const capsules = (mm) => mm.spaces.reduce((n, sp) => n + 6 + 28 + sp.rows.length * 45 + 6, 0);
  if (open === ALL) return snap.machines.reduce((n, mm) => n + 8 + 40 + 4 + capsules(mm) + (mm.offline ? 0 : 44) + 6, 0);
  return m ? capsules(m) + (m.spaces.length ? 0 : 24) : 0;
};
// Resize the block to its content (called by a timer of the drawer role: the block may be hidden and not render).
export function panelSync(view) {
  if (!(WIN.h > 0)) return;
  const snap = snapshot();
  const open = view.openKey(snap);
  const m = open && open !== ALL ? snap.mBy.get(open) : null;
  const strip = findNodeHidden("strip") ? 0 : (nodePx("strip") ?? 0) + 6;
  const cap = Math.max(160, dsg(WIN.h) - TOP - TABS - strip - (composerOpen() ? 50 : 0) - TERM_MIN - GAPS);
  const agentsOpen = !!m && view.agentOpen === m.key;
  const chrome = 8 + 2 + 6 + 8 + 48 + 8 + actionsHeight(agentsOpen) + 8;
  const px = Math.round(Math.min(cap, chrome + listHeight(snap, open, m)));
  const want = Math.max(px, chrome + 40);
  if (nodePx("drawer") !== want) {
    const now = Date.now();
    if (view.panelReq !== want || now - (view.panelAt ?? 0) > 2000) {
      view.panelReq = want; view.panelAt = now;
      run("layout.resize", { id: "drawer", px: want });
    }
  }
}
const findNodeHidden = (id) => !!findNode(layout(), id)?.hidden;

export function renderDrawer(view) {
  const snap = snapshot();
  const open = view.openKey(snap);
  const all = open === ALL;
  const m = open && !all ? snap.mBy.get(open) : null;
  const sm = all ? statsMachine(snap, open) : m;
  view.agentOpen ??= props()?.openAgents ?? null; // the machine whose agent list is open (props: staged checks)
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
      .child(swipeArea(watchScroll(h_flex().id("tnp-machines-row").w_full().h(48).flex_none().overflow_x_scroll(), view))
        .child(swipeBody(h_flex().h_full().flex_none().gap(6))
          .child(allTile(view, snap, open, tileW)).children(snap.machines.map(mm => tile(view, mm, open, tileW)))))
      .child(v_flex().id("tnp-actions").w_full().flex_none().gap(6)
        .children(actionRows(view, snap, sm, closePanel, shared("tokyo-night-phone.changes") ?? 0)))
      .child(swipeArea(watchScroll(v_flex().id("tnp-spaces").w_full().flex_1().min_h(0).overflow_y_scroll(), view))
        .child(swipeBody(v_flex().w_full().flex_none().gap(6))
          .when(all, el => el.children(allGroups(view, snap)))
          .when(!!m, el => el.children(m.spaces.map(sp => capsule(view, sp, m))))
          .when(!!m && m.spaces.length === 0, el => el.child(div().px(4).text_color(C.muted).child(`No spaces on ${m.name}`))))));
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

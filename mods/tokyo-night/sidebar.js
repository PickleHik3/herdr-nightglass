// tokyo-night: the sidebar (expanded and rail), its New popup and the rail's spaces popup.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, setAgentOrder, props, spaces, focused, shared, setShared, knownAgents } from "herdr";
import { C, M, MONO, CLEAR, BADGES, alpha, mix, raised, raisedFill, rim, fade, dur, hash, ico, prog, mark, level, stop, nodePx,
  anchorBelow, anchorRight, setPressed, getPressed, bindingOf, machineColor, SCHEMES, COLORS_KEY } from "./lib.js";
import { snapshot, LOCAL, ALL, mkey, mArg, onArg, lastSeen, upText, statsMachine } from "./data.js";
import { usageParts } from "./header.js";

const MOD = "tokyo-night";

// ---- acting on a row ----
export function focusRow(r) {
  if (r.agent) return run("agent.focus", { terminal: r.address });
  if (!r.spaceActive) run("space.select", { id: r.space });
  if (!r.spaceActive || !r.tabActive) run("tab.select", { id: r.tab });
  run("pane.focus", { terminal: r.address });
}

// ---- agents a machine can start (cached per machine; popups are separate copies, so also via shared) ----
const agentCache = new Map();
const cachedAgents = (key) => agentCache.get(key) ?? shared("new-menu.agents")?.[mArg(key)] ?? [];
const storeAgents = (key, list) => {
  agentCache.set(key, list);
  setShared("new-menu.agents", { ...(shared("new-menu.agents") ?? {}), [mArg(key)]: list });
};
export function loadAgents(view, key, cx) {
  view.agents = cachedAgents(key);
  view.agentsFailed = false;
  cx.spawn(async (cx) => {
    try {
      const list = await knownAgents({ on: onArg(key) });
      storeAgents(key, list); view.agents = list; view.agentsFailed = false;
    } catch { view.agentsFailed = true; }
    cx.notify();
  });
}
// Warm every connected machine's list so the Agent flyout is usually instant.
export function prefetchAgents(cx) {
  for (const m of snapshot().machines) {
    if (m.offline) continue;
    cx.spawn(async () => {
      try { storeAgents(m.key, await knownAgents({ on: onArg(m.key) })); } catch { /* the flyout reports it */ }
    });
  }
}

// ---- popup sizes: New (every connected machine, each with its create options) and its Agent flyout ----
const NM_W = 260, NM_HEAD = 26, NM_ROW = 30, NM_SEP = 9, NM_PAD = 12;
const FLY_W = 220, FLY_MAX = 8;
const flyHeight = (n) => NM_PAD + Math.min(FLY_MAX, Math.max(1, n)) * NM_ROW;
// Where "New terminal tab" goes on a machine: the focused space if it is there, else the last visited, else the first.
function targetSpace(snap, key, last) {
  const mine = snap.spaces.filter(s => s.machine === key);
  const f = snap.foc?.space;
  return (mine.find(s => s.id === f) ?? mine.find(s => s.id === last?.[key]) ?? mine[0])?.id ?? null;
}
const menuMachines = (snap) => snap.machines.filter(m => !m.offline);
function newMenuHeight(snap, last) {
  const ms = menuMachines(snap);
  const rows = ms.reduce((n, m) => n + 2 + (targetSpace(snap, m.key, last) ? 1 : 0), 0);
  return NM_PAD + ms.length * NM_HEAD + rows * NM_ROW + Math.max(0, ms.length - 1) * NM_SEP;
}

export function openNewMenu(snap, last) {
  const h = Math.min(640, Math.max(NM_PAD + NM_ROW, newMenuHeight(snap, last)));
  openOverlay({ mod: MOD, kind: "popup", frame: "none", width: NM_W, height: h, at: getPressed(), props: { role: "newmenu", h, last } });
}

// ---- shared pieces ----
const iconBtn = (id, name, size, color, bg, tip, w, h, onPress) => h_flex().id(id).w(w).h(h).flex_none().justify_center().items_center().rounded(6)
  .bg(bg).cursor_pointer().hover(s => s.bg(alpha(C.accent, 0.2))).tooltip(tip)
  .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorBelow(e)); })
  .on_click((e, cx) => onPress(e, cx))
  .child(ico(name, size, color));

// The corner light of a machine tile / rail button.
function light(m, top, right) {
  const slot = h_flex().absolute().top(top).right(right);
  if (m.light === "offline") return slot.child(ico("wifi-off", 11, C.amber));
  if (!m.light) return null;
  return slot.child(mark(m.light));
}
const machineIcon = (m, size, color) => ico(m.key === LOCAL ? "monitor" : "server", size, color);
// Right-click on a machine opens the color picker.
const pickColor = (m) => (_e, cx) => {
  cx.stop_propagation();
  openOverlay({ mod: MOD, kind: "popup", frame: "none", width: 220, height: 72, at: "pointer", props: { role: "colors", machine: m.key, name: m.name } });
};
// The most urgent light over all machines; offline only counts when every machine is offline.
function allLight(snap) {
  const lights = snap.machines.map(m => m.light);
  for (const k of ["waiting", "working", "idle"]) if (lights.includes(k)) return k;
  return lights.length && lights.every(l => l === "offline") ? "offline" : null;
}

// ---- capsules ----
// Swipe-style close: a full-height strip on the right edge that slides open on hover (native width
// and opacity transitions), pushing the content left. It stops the press so the row isn't picked.
const closeSlot = (id, shown, radius, tip, act) => h_flex().id(id).h_full().flex_none().overflow_hidden()
  .w(shown ? 30 : 0).opacity(shown ? 1 : 0)
  .transition("width", { duration: 160, easing: "ease-out" }).transition("opacity", { duration: 160, easing: "ease-out" })
  .child(h_flex().id(`${id}-btn`).w(30).h_full().flex_none().justify_center().items_center().rounded_r(radius)
    .bg(alpha(C.red, 0.2)).hover(s => s.bg(alpha(C.red, 0.38))).cursor_pointer().tooltip(tip)
    .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); act(); })
    .child(ico("win-close", 10, C.red)));

function rowEl(view, r, compact, onPick) {
  const hover = view.hover === r.address;
  const waiting = r.kind === "waiting";
  const mc = machineColor(r.machine);
  const tint = r.focused ? alpha(mc, 0.16) : waiting ? alpha(C.red, 0.12) : CLEAR;
  const ring = r.focused ? alpha(mc, 0.5) : waiting ? alpha(C.red, 0.45) : CLEAR;
  const showNow = !compact && r.now && (hover || r.focused || waiting);
  const closable = !compact && r.kind !== "offline";
  return h_flex().id(`tn-row-${r.address}`).w_full().min_w(0).flex_none().items_stretch().rounded(14).overflow_hidden()
    .bg(tint).border(1).border_color(ring).cursor_pointer().text_size(12).text_color(r.focused ? C.fg : C.muted)
    .when(r.focused, el => el.shadow_md())
    .hover(s => s.bg(r.focused ? alpha(mc, 0.22) : waiting ? alpha(C.red, 0.18) : C.raised).shadow_md())
    .on_hover((h, cx) => { if (h) view.hover = r.address; else if (view.hover === r.address) view.hover = null; cx.notify(); })
    .on_click((_e, cx) => { cx.stop_propagation(); onPick?.(); focusRow(r); })
    .on_mouse_down("right", (_e, cx) => {
      cx.stop_propagation();
      openOverlay({ mod: "menu", kind: "popup", width: 220, height: 300, props: { tab: "pane", target: { pane: r.pane, terminal: r.address } } });
    })
    .child(v_flex().flex_1().min_w(0).pl(10).pr(5).py(3).gap(1)
    .child(h_flex().w_full().h(18).gap(8).items_center()
      .child(mark(r.kind))
      .child(div().flex_1().min_w(0).truncate().font_medium().child(r.title))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(r.kind === "offline" ? "" : dur(r.ms)))
      .child(h_flex().flex_none().h(18).px(7).rounded(9).items_center().font_family(MONO).text_size(11)
        .bg(r.focused ? mc : C.raised).text_color(r.focused ? C.onAccent : C.dim).child(r.short)))
    .when(showNow, el => el.child(div().pl(18).w_full().min_w(0).truncate().font_family(MONO).text_size(11)
      .text_color(waiting ? C.red : C.dim).child(r.now))))
    .when(closable, el => el.child(closeSlot(`tn-row-x-${r.address}`, hover, 13, "Close terminal",
      () => r.pane ? run("pane.close", { pane: r.pane }) : run("terminal.kill", { terminal: r.address }))));
}

const STAT_TEXT_W = 78; // fits "20.3/63 GB", "881 GB free", "58% · 12c" in 11 px mono

function capsule(view, sp, m, compact, onPick) {
  const color = BADGES[hash(sp.id) % BADGES.length];
  const initial = ([...(sp.name || "?")][0] ?? "?").toUpperCase();
  const seenAt = lastSeen(m.key);
  const hover = view.spHover === sp.id;
  // A space with a terminal waiting on you turns red; one with an unseen finished agent, green.
  const wants = sp.rows.some(r => r.kind === "waiting") ? C.red : sp.rows.some(r => r.kind === "done") ? C.green : null;
  const strong = wants === C.red;
  return raised(v_flex().id(`tn-sp-${sp.id}`).w_full().flex_none().rounded(16).p(5).gap(2), C.surface)
    .when(!!wants, el => el.bg(mix(wants, C.surface, strong ? 0.13 : 0.07)).border_color(alpha(wants, strong ? 0.6 : 0.35)).shadow_md())
    .child(h_flex().id(`tn-sph-${sp.id}`).w_full().h(28).items_stretch().rounded(12).overflow_hidden()
      .on_hover((h, cx) => { const id = h ? sp.id : view.spHover === sp.id ? null : view.spHover; if (id !== view.spHover) { view.spHover = id; cx.notify(); } })
      .child(h_flex().flex_1().min_w(0).gap(8).pl(4).pr(8).items_center()
      .child(h_flex().size(20).flex_none().rounded(10).justify_center().items_center().bg(alpha(color, 0.2))
        .text_color(color).text_size(11).font_semibold().child(initial))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(sp.name))
      .when(!m.offline && !!sp.branch, el => el.child(h_flex().flex_none().max_w(96).gap(4).items_center()
        .child(ico("branch", 11, C.purple))
        .child(div().min_w(0).truncate().font_family(MONO).text_size(11).text_color(C.purple).child(sp.branch))))
      .when(m.offline, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.amber).whitespace_nowrap()
        .child(seenAt ? `last seen ${dur(Date.now() - seenAt)}` : "offline"))))
      // space.close asks first, so a stray click can't take a whole space.
      .when(!m.offline, el => el.child(closeSlot(`tn-sp-x-${sp.id}`, hover, 12, "Close space", () => run("space.close", { id: sp.id })))))
    .children(sp.rows.map(r => rowEl(view, r, compact, onPick)));
}

function sectionTitle(m) {
  const wait = m.count.waiting > 0;
  return h_flex().w_full().h(20).flex_none().gap(8).px(6).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.dim).child(m.name.toUpperCase()))
    .child(div().flex_none().font_family(MONO).text_size(11).text_color(wait ? C.red : C.dim).child(m.summary));
}

const newSpaceRow = (id, m, h, label) => h_flex().id(id).w_full().h(h).flex_none().px(12).gap(8).items_center().rounded(16)
  .border(1).border_color(C.input).text_size(12).text_color(C.dim).cursor_pointer()
  .hover(s => s.bg(C.surface))
  .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: mArg(m.key) }); })
  .child(ico("folder", 13, C.dim)).child(div().truncate().child(label));

// The "All" view: one card per machine, tinted in its color, with its capsules inside.
// onHead is null in the rail popup (it has no sidebar state to open a machine in).
function allGroups(view, snap, compact, onHead, onPick) {
  return snap.machines.map(m => {
    const color = machineColor(m.key);
    return v_flex().id(`tn-all-${m.key}`).w_full().flex_none().rounded(18).p(6).gap(6)
      .bg(alpha(color, 0.06)).border(1).border_color(alpha(color, 0.35)).shadow_sm().opacity(m.offline ? 0.62 : 1)
      .child(h_flex().id(`tn-all-h-${m.key}`).w_full().h(24).flex_none().gap(8).px(6).items_center().rounded(12)
        .when(!!onHead, el => el.cursor_pointer().hover(s => s.bg(alpha(color, 0.12))).on_click((_e, cx) => onHead(m, cx)))
        .on_mouse_down("right", pickColor(m))
        .child(machineIcon(m, 13, color))
        // The name keeps its width; a long summary is what gets cut.
        .child(div().flex_none().max_w(140).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
        .child(div().flex_1().min_w(0).truncate().text_right().font_family(MONO).text_size(11).text_color(m.offline ? C.amber : m.count.waiting ? C.red : C.dim).child(m.summary)))
      .children(m.spaces.map(sp => capsule(view, sp, m, compact, onPick)))
      .when(m.spaces.length === 0, el => el.child(div().px(8).py(2).text_size(11).text_color(C.dim).child("No spaces")))
      .child(newSpaceRow(`tn-all-new-${m.key}`, m, 28, "New space"));
  });
}

// ---- stats (inside the dock) ----
function statsBlock(view, m) {
  const st = view.stats?.[m.key];
  const data = st?.data;
  const meta = m.offline ? `stale · ${dur(Date.now() - (st?.at ?? lastSeen(m.key) ?? Date.now()))}`
    : [m.key === LOCAL ? "" : "ssh", upText(data?.up)].filter(Boolean).join(" · ");
  const bar = (label, pct, text) => h_flex().w_full().h(16).flex_none().gap(8).items_center().font_family(MONO).text_size(11)
    .child(h_flex().w(14).flex_none().items_center().tooltip(label).child(ico(label, 13, C.dim)))
    .child(div().flex_1().min_w(0).h(5).rounded(3).bg(C.raised).overflow_hidden()
      .child(div().h(5).rounded(3).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, C.cyan))))
    // A fixed text column, so every bar gets exactly the same length.
    .child(div().w(STAT_TEXT_W).flex_none().text_right().whitespace_nowrap().truncate().text_color(C.muted).child(text));
  return v_flex().id("tn-stats").w_full().flex_none().gap(5).opacity(m.offline ? 0.6 : 1)
    .child(h_flex().w_full().h(14).gap(6).items_center()
      .child(machineIcon(m, 11, C.dim))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(C.dim).child(m.name))
      .child(div().flex_none().font_family(MONO).text_size(10).text_color(m.offline ? C.amber : C.dim).child(meta)))
    .when(!!data, el => el
      .child(bar("cpu", data.cpu, `${data.cpu}% · ${data.cores}c`))
      .child(bar("ram", data.memPct, data.memText))
      .child(bar("disk", diskUsed(data), diskFreeText(data))))
    .when(!data, el => el.child(div().font_family(MONO).text_size(11).text_color(C.dim)
      .child(st?.fail ? "stats unavailable" : "reading…")));
}

const hairline = () => div().w_full().h(1).flex_none().bg(alpha(C.fg, 0.07));
const DOCK_FALLBACK = 150;

// One inset well flush with the sidebar's bottom and sides, floating over the list. Collapsed it is
// the usage pills + stats; expanded, the usage panel stacks above the pills and the dock grows upward.
// The dock (usage row + stats) stays in the sidebar's flow at the bottom, a fixed size; only the
// expanded usage list floats, absolutely placed just above the dock and over the space list.
function dock(view, usage, stats) {
  return v_flex().id("tn-dock").w_full().flex_none()
    .on_size_change((size, cx) => { if (Math.abs((view.dockH ?? 0) - size.height) >= 1) { view.dockH = size.height; cx.notify(); } })
    .child(fade(7, "#000000"))
    .child(v_flex().w_full().flex_none().rounded_b(6).overflow_hidden().px(8).py(6).gap(6)
      .bg(mix("#000000", C.chrome, 0.18)).border_t(1).border_color(alpha(C.fg, 0.07))
      .when(!!usage, el => el.child(usage.head))
      .when(!!usage && !!stats, el => el.child(hairline()))
      .when(!!stats, el => el.child(stats)));
}
function usageOverlay(view, panel) {
  return v_flex().id("tn-usage-float").absolute().left(0).right(0).bottom(Math.max(0, (view.dockH ?? DOCK_FALLBACK) - 7))
    .px(8).pt(8).pb(6).rounded_t(10).bg(mix("#000000", C.chrome, 0.18))
    .border(1).border_color(alpha(C.fg, 0.07)).shadow_2xl()
    .child(panel);
}

// Disk: a used bar like cpu/ram, and what's free as the text (df's Available, so the two agree).
const diskUsed = (data) => data.diskTotal > 0 ? Math.round(100 - data.diskFree / data.diskTotal * 100) : 0;
const diskFreeText = (data) => `${data.diskFree >= 100 ? Math.round(data.diskFree) : data.diskFree.toFixed(1)} GB free`;

// ---- tiles ----
function tile(view, m, open, w) {
  const sel = open === m.key;
  const mc = machineColor(m.key);
  return v_flex().id(`tn-m-${m.key}`).w(w).h(58).flex_none().relative().items_center().justify_center().gap(5).px(6).rounded(6)
    .bg(sel ? alpha(mc, 0.16) : raisedFill(C.surface)).border(1).border_color(sel ? alpha(mc, 0.55) : rim())
    .when(sel, el => el.shadow_md()).when(!sel, el => el.shadow_sm())
    .opacity(m.offline ? 0.62 : 1).cursor_pointer().tooltip(`${m.name} · ${m.summary}`)
    .hover(s => s.bg(sel ? alpha(mc, 0.2) : mix(C.fg, C.raised, 0.05)).shadow_md())
    .on_click((_e, cx) => { view.goMachine(m.key); view.pollStats(cx, true); cx.notify(); })
    .on_mouse_down("right", pickColor(m))
    .child(h_flex().size(24).rounded(6).justify_center().items_center().bg(sel ? alpha(mc, 0.24) : C.raised)
      .child(machineIcon(m, 14, mc)))
    .child(div().max_w(Math.max(20, w - 14)).truncate().text_size(11).font_medium().text_color(sel ? C.fg : C.muted).child(m.name))
    .when(!!m.light, el => el.child(light(m, 6, 6)));
}
// The All tile: no machine, so no color to pick; clicking it only changes what the sidebar lists.
// Herdr's ram ("sheep") tile, full color: the All tile's icon.
const sheep = (size) => image(`${M}/herdr.png`).size(size).rounded(Math.round(size / 4)).flex_none();

function allTile(view, snap, open, w) {
  const sel = open === ALL;
  const l = allLight(snap);
  return v_flex().id("tn-m-all").w(w).h(58).flex_none().relative().items_center().justify_center().gap(5).px(6).rounded(6)
    .bg(sel ? alpha(C.accent, 0.16) : raisedFill(C.surface)).border(1).border_color(sel ? alpha(C.accent, 0.55) : rim())
    .when(sel, el => el.shadow_md()).when(!sel, el => el.shadow_sm())
    .cursor_pointer().tooltip("All machines")
    .hover(s => s.bg(sel ? alpha(C.accent, 0.2) : mix(C.fg, C.raised, 0.05)).shadow_md())
    .on_click((_e, cx) => { view.setOpen(ALL); view.pollStats(cx, true); cx.notify(); })
    .child(sheep(24))
    .child(div().max_w(Math.max(20, w - 14)).truncate().text_size(11).font_medium().text_color(sel ? C.fg : C.muted).child("All"))
    .when(!!l, el => el.child(light({ light: l }, 6, 6)));
}

// ---- expanded ----
function brand(view, snap) {
  return h_flex().w_full().h(28).flex_none().gap(4).items_center()
    .child(h_flex().size(22).flex_none().ml(2).rounded(6).bg(C.accent).justify_center().items_center().child(ico("logo", 14, C.onAccent)))
    .child(div().flex_1().min_w(0).pl(6).text_size(14).font_semibold().text_color(C.fg).child("herdr"))
    .child(iconBtn("tn-new", "plus", 14, C.accent, alpha(C.accent, 0.14), "New", 28, 28, () => openNewMenu(snap, view.lastSpaces())))
    .child(iconBtn("tn-collapse", "panel", 14, C.dim, CLEAR, "Collapse sidebar", 28, 28, () => run("layout.resize", { id: "sidebar", px: 56 })));
}

function full(base, view, snap, open, w) {
  const all = open === ALL;
  const m = open && !all ? snap.mBy.get(open) : null;
  const sm = all ? statsMachine(snap, open) : m;
  const tileW = Math.max(40, Math.floor((w - 20 - 12) / 3));
  const usage = usageParts(view);
  const stats = sm ? statsBlock(view, sm) : null;
  const spacer = div().w_full().h(4).flex_none();
  return base.relative()
    .child(v_flex().w_full().flex_1().min_h(0).px(10).pt(10).gap(14)
      .child(brand(view, snap))
      .child(h_flex().w_full().flex_none().flex_wrap().gap(6).child(allTile(view, snap, open, tileW)).children(snap.machines.map(mm => tile(view, mm, open, tileW))))
      .when(all, el => el.child(v_flex().id("tn-caps").w_full().flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .children(allGroups(view, snap, false, (mm, cx) => { view.goMachine(mm.key); view.pollStats(cx, true); cx.notify(); }))
        .child(spacer)))
      .when(!!m, el => el.child(v_flex().id("tn-caps").w_full().flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .child(sectionTitle(m))
        .children(m.spaces.map(sp => capsule(view, sp, m, false)))
        .child(newSpaceRow("tn-newspace", m, 34, `New space on ${m.name}`))
        .child(spacer)))
      .when(!m && !all, el => el.child(div().flex_1())))
    .when(!!usage || !!stats, el => el.child(dock(view, usage, stats)))
    .when(!!usage?.panel, el => el.child(usageOverlay(view, usage.panel)));
}

// ---- rail ----
function rail(base, view, snap) {
  return base.items_center().py(10).gap(8)
    .child(h_flex().size(28).flex_none().rounded(6).bg(C.accent).justify_center().items_center().child(ico("logo", 16, C.onAccent)))
    .child(iconBtn("tn-new", "plus", 14, C.accent, alpha(C.accent, 0.14), "New", 36, 32, () => openNewMenu(snap, view.lastSpaces())))
    .child(div().w(24).h(1).flex_none().my(2).bg(C.raised))
    .child(h_flex().id("tn-rm-all").w(40).h(40).flex_none().relative().justify_center().items_center().rounded(6)
      .bg(C.surface).cursor_pointer().tooltip("All machines")
      .hover(s => s.bg(C.raised))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorRight(e)); })
      .on_click(() => openSpaces(snap, ALL))
      .child(sheep(24))
      .when(!!allLight(snap), el => el.child(light({ light: allLight(snap) }, 4, 4))))
    .children(snap.machines.map(m => h_flex().id(`tn-rm-${m.key}`).w(40).h(40).flex_none().relative().justify_center().items_center().rounded(6)
      .bg(C.surface).opacity(m.offline ? 0.62 : 1).cursor_pointer().tooltip(`${m.name} · ${m.summary}`)
      .hover(s => s.bg(C.raised))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorRight(e)); })
      .on_mouse_down("right", pickColor(m))
      .on_click(() => openSpaces(snap, m.key))
      .child(machineIcon(m, 16, machineColor(m.key)))
      .when(!!m.light, el => el.child(light(m, 4, 4)))))
    .child(div().flex_1())
    .child(iconBtn("tn-expand", "panel", 15, C.dim, CLEAR, "Expand sidebar", 36, 32, () => run("layout.resize", { id: "sidebar", px: 268 })));
}

export function renderSidebar(view) {
  const snap = snapshot();
  setAgentOrder(snap.rows.filter(r => r.agent).map(r => r.address));
  const w = view.width ?? nodePx("sidebar") ?? 268;
  const base = v_flex().id("tn-sidebar").size_full().overflow_hidden()
    .on_size_change((size, cx) => {
      if (Math.abs((view.width ?? 0) - size.width) >= 1 || Math.abs((view.height ?? 0) - size.height) >= 1) { view.width = size.width; view.height = size.height; cx.notify(); }
    });
  return w < 160 ? rail(base, view, snap) : full(base, view, snap, view.openKey(snap), w);
}

// ---- popup: New ----
const popRow = (id, lead, label, trail, onPick) => h_flex().id(id).w_full().h(NM_ROW).flex_none().px(8).gap(8).items_center().rounded(4)
  .text_size(13).text_color(C.fg).cursor_pointer().hover(s => s.bg(C.raised))
  .on_click(onPick).child(lead).child(div().flex_1().min_w(0).truncate().child(label)).when(!!trail, el => el.child(trail));
const dimText = (t) => div().px(8).py(6).text_size(12).text_color(C.dim).child(t);

export function renderNewMenu(view) {
  const p = props();
  const snap = snapshot();
  const ms = menuMachines(snap);
  const h = p.h ?? newMenuHeight(snap, p.last);
  const closeFly = () => { if (view.fly) { closeOverlay(view.fly.id); view.fly = null; } };
  const pick = (fn) => () => { closeFly(); closeOverlay(p.overlay); fn(); };
  // Open the flyout beside this row (replacing another machine's); one at a time.
  const openFly = (m, target, e) => {
    if (view.fly?.key === m.key) return;
    closeFly();
    const id = openOverlay({ mod: MOD, kind: "popup", frame: "none", width: FLY_W, height: flyHeight(cachedAgents(m.key).filter(a => a.installed).length || 3),
      at: anchorRight(e), props: { role: "agentmenu", machine: m.key, name: m.name, target, parent: p.overlay } });
    view.fly = { key: m.key, id };
  };
  const hint = bindingOf("tab.new");
  const sections = ms.map((m, i) => {
    const target = targetSpace(snap, m.key, p.last);
    return v_flex().w_full().flex_none()
      .when(i > 0, el => el.child(div().w_full().h(1).flex_none().mx(2).my(4).bg(C.raised)))
      .child(h_flex().w_full().h(NM_HEAD).flex_none().px(8).gap(6).items_center()
        .child(machineIcon(m, 12, machineColor(m.key)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.dim).child(m.name.toUpperCase())))
      .child(popRow(`nm-space-${m.key}`, ico("folder", 14, C.teal), "New space", null, pick(() => run("space.new", { machine: mArg(m.key) })))
        .on_hover((hv) => { if (hv) closeFly(); }))
      .when(!!target, el => el.child(popRow(`nm-term-${m.key}`, ico("terminal", 14, C.cyan), "New terminal tab",
        i === 0 && hint ? div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(hint) : null,
        pick(() => run("tab.new", { space: target })))
        .on_hover((hv) => { if (hv) closeFly(); })))
      .child(popRow(`nm-agent-${m.key}`, ico("cpu", 14, C.purple), "Agent", div().flex_none().text_size(15).text_color(C.dim).child("›"), () => {})
        .on_mouse_move((e) => openFly(m, target, e))
        .on_mouse_down("left", (e) => openFly(m, target, e))); // touch: no hover
  });
  return v_flex().id("tn-newmenu").w_full().h(h).bg(C.surface).rounded(6).border(1).border_color(rim()).shadow_xl()
    .overflow_y_scrollbar().p(6)
    .children(sections)
    .when(ms.length === 0, el => el.child(dimText("No machines connected")));
}

// ---- popup: the agents installed on one machine (flyout of New) ----
export function renderAgentMenu(view) {
  const p = props();
  const all = view.agents ?? [];
  const list = all.filter(a => a.installed);
  const pick = (a) => () => {
    closeOverlay(p.overlay); closeOverlay(p.parent);
    if (p.target) run("tab.new", { space: p.target, argv: a.run });
    else run("space.new", { machine: mArg(p.machine), argv: a.run });
  };
  return v_flex().id("tn-agentmenu").w_full().h(flyHeight(list.length)).bg(C.surface).rounded(6).border(1).border_color(rim()).shadow_xl()
    .overflow_y_scrollbar().p(6)
    .children(list.map(a => popRow(`am-${a.key}`, prog(a, 14, C.fg), a.name, null, pick(a))))
    .when(list.length === 0, el => el.child(dimText(view.agentsFailed ? `Couldn't check ${p.name ?? p.machine}`
      : all.length ? "No agents installed" : "Looking for agents…")));
}

// ---- popup: a machine's spaces (or all machines), from the rail ----
function spacesHeight(snap, key) {
  const group = (m) => m.spaces.reduce((n, s) => n + 10 + 28 + s.rows.length * 30 + 8, 0);
  if (key === ALL) {
    const body = snap.machines.reduce((n, m) => n + 12 + 24 + 6 + group(m) + (m.spaces.length ? 0 : 20) + 28 + 6, 0);
    return Math.min(520, 16 + 22 + 8 + Math.max(body, 40));
  }
  return Math.min(640, 16 + 22 + 8 + Math.max(group(snap.mBy.get(key)), 40));
}
function openSpaces(snap, key) {
  const h = spacesHeight(snap, key);
  openOverlay({ mod: MOD, kind: "popup", frame: "none", width: 268, height: h, at: getPressed(), props: { role: "spaces", machine: key, h } });
}
export function renderSpacesPopup(view) {
  const p = props();
  const snap = snapshot();
  const all = p.machine === ALL;
  const m = all ? null : snap.mBy.get(p.machine) ?? snap.machines[0];
  const h = p.h ?? spacesHeight(snap, all ? ALL : m.key);
  const close = () => closeOverlay(p.overlay);
  return v_flex().id("tn-spaces").w_full().h(h).bg(C.chrome).rounded(16).border(1).border_color(rim()).shadow_xl().overflow_hidden().p(8).gap(8)
    .child(h_flex().w_full().h(22).flex_none().gap(8).px(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.dim).child(all ? "ALL MACHINES" : m.name.toUpperCase()))
      .when(!all, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(m.count.waiting ? C.red : C.dim).child(m.summary))))
    .child(v_flex().id("tn-spaces-list").w_full().h(h - 16 - 22 - 8).gap(8).overflow_y_scrollbar()
      .when(all, el => el.children(allGroups(view, snap, true, null, close)))
      .when(!all, el => el.children(m.spaces.map(sp => capsule(view, sp, m, true, close)))));
}

// ---- popup: color of a machine ----
export function renderColorsPopup() {
  const p = props();
  const cur = shared(COLORS_KEY) ?? {};
  const set = (c) => {
    const next = { ...cur };
    if (c) next[p.machine] = c; else delete next[p.machine];
    setShared(COLORS_KEY, next);
    closeOverlay(p.overlay);
  };
  return v_flex().id("tn-colors").w_full().h(72).bg(C.surface).rounded(6).border(1).border_color(rim()).shadow_xl().overflow_hidden().p(10).gap(10)
    .child(div().w_full().h(16).flex_none().truncate().text_size(11).font_semibold().text_color(C.dim).child(`THEME FOR ${String(p.name ?? p.machine).toUpperCase()}`))
    .child(h_flex().w_full().h(26).flex_none().gap(3).items_center()
      .children(SCHEMES.map(sc => h_flex().id(`tn-sw-${sc.color}`).size(22).flex_none().rounded(11).bg(sc.color).cursor_pointer()
        .border(2).border_color(cur[p.machine] === sc.color ? C.fg : CLEAR).tooltip(sc.label)
        .on_click(() => set(sc.color)))));
}

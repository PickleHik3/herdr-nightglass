// tokyo-night: the sidebar (expanded and rail), its New popup and the rail's spaces popup.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, openOverlay, closeOverlay, setAgentOrder, props, spaces, focused, shared, knownAgents } from "herdr";
import { C, M, MONO, CLEAR, BADGES, alpha, dur, hash, ico, prog, mark, level, stop, nodePx,
  anchorBelow, anchorRight, setPressed, getPressed, bindingOf } from "./lib.js";
import { snapshot, LOCAL, mkey, mArg, onArg, lastSeen, upText } from "./data.js";

const MOD = "tokyo-night";

// ---- acting on a row ----
export function focusRow(r) {
  if (r.agent) return run("agent.focus", { terminal: r.address });
  if (!r.spaceActive) run("space.select", { id: r.space });
  if (!r.spaceActive || !r.tabActive) run("tab.select", { id: r.tab });
  run("pane.focus", { terminal: r.address });
}

// ---- agents a machine can start (cached per machine, shared by the popup copies) ----
const agentCache = new Map();
const cachedAgents = (key) => agentCache.get(key) ?? shared("new-menu.agents")?.[mArg(key)] ?? [];
export function loadAgents(view, key, cx) {
  view.agents = cachedAgents(key);
  cx.spawn(async (cx) => {
    try {
      const list = await knownAgents({ on: onArg(key) });
      agentCache.set(key, list); view.agents = list; view.agentsFailed = false;
    } catch { view.agentsFailed = true; }
    cx.notify();
  });
}
const NEW_FIXED = 141;
const newMenuHeight = (n) => NEW_FIXED + Math.min(8, Math.max(1, n)) * 32;

export function openNewMenu(snap, openKey) {
  const f = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
  const key = openKey ?? f?.machine ?? LOCAL;
  const n = cachedAgents(key).filter(a => a.installed).length || 4;
  const h = newMenuHeight(n);
  openOverlay({ mod: MOD, kind: "popup", frame: "none", width: 228, height: h, at: getPressed(), props: { role: "newmenu", machine: key, h } });
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

// ---- capsules ----
function rowEl(view, r, compact, onPick) {
  const hover = view.hover === r.address;
  const waiting = r.kind === "waiting";
  const tint = r.focused ? alpha(C.accent, 0.16) : waiting ? alpha(C.red, 0.12) : CLEAR;
  const ring = r.focused ? alpha(C.accent, 0.5) : waiting ? alpha(C.red, 0.45) : CLEAR;
  const showNow = !compact && r.now && (hover || r.focused || waiting);
  return v_flex().id(`tn-row-${r.address}`).w_full().min_w(0).flex_none().rounded(14).bg(tint).border(1).border_color(ring)
    .pl(10).pr(5).py(3).gap(1).cursor_pointer().text_size(12).text_color(r.focused ? C.fg : C.muted)
    .hover(s => s.bg(r.focused ? alpha(C.accent, 0.22) : waiting ? alpha(C.red, 0.18) : C.raised))
    .on_hover((h, cx) => { if (h) view.hover = r.address; else if (view.hover === r.address) view.hover = null; cx.notify(); })
    .on_click((_e, cx) => { cx.stop_propagation(); onPick?.(); focusRow(r); })
    .on_mouse_down("right", (_e, cx) => {
      cx.stop_propagation();
      openOverlay({ mod: "menu", kind: "popup", width: 220, height: 300, props: { tab: "pane", target: { pane: r.pane, terminal: r.address } } });
    })
    .child(h_flex().w_full().h(18).gap(8).items_center()
      .child(mark(r.kind))
      .child(div().flex_1().min_w(0).truncate().font_medium().child(r.title))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(r.kind === "offline" ? "" : dur(r.ms)))
      .child(h_flex().flex_none().h(18).px(7).rounded(9).items_center().font_family(MONO).text_size(11)
        .bg(r.focused ? C.accent : C.raised).text_color(r.focused ? C.onAccent : C.dim).child(r.short)))
    .when(showNow, el => el.child(div().pl(18).w_full().min_w(0).truncate().font_family(MONO).text_size(11)
      .text_color(waiting ? C.red : C.dim).child(r.now)));
}

function capsule(view, sp, m, compact, onPick) {
  const color = BADGES[hash(sp.id) % BADGES.length];
  const initial = ([...(sp.name || "?")][0] ?? "?").toUpperCase();
  const seenAt = lastSeen(m.key);
  return v_flex().id(`tn-sp-${sp.id}`).w_full().flex_none().bg(C.surface).rounded(16).p(5).gap(2)
    .child(h_flex().w_full().h(28).gap(8).pl(4).pr(8).items_center()
      .child(h_flex().size(20).flex_none().rounded(10).justify_center().items_center().bg(alpha(color, 0.2))
        .text_color(color).text_size(11).font_semibold().child(initial))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(sp.name))
      .when(!m.offline && !!sp.branch, el => el.child(h_flex().flex_none().max_w(96).gap(4).items_center()
        .child(ico("branch", 11, C.purple))
        .child(div().min_w(0).truncate().font_family(MONO).text_size(11).text_color(C.purple).child(sp.branch))))
      .when(m.offline, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.amber).whitespace_nowrap()
        .child(seenAt ? `last seen ${dur(Date.now() - seenAt)}` : "offline"))))
    .children(sp.rows.map(r => rowEl(view, r, compact, onPick)));
}

function sectionTitle(m) {
  const wait = m.count.waiting > 0;
  return h_flex().w_full().h(20).flex_none().gap(8).px(6).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.dim).child(m.name.toUpperCase()))
    .child(div().flex_none().font_family(MONO).text_size(11).text_color(wait ? C.red : C.dim).child(m.summary));
}

// ---- stats card ----
function statsCard(view, m) {
  const st = view.stats?.[m.key];
  const data = st?.data;
  const meta = m.offline ? `stale · ${dur(Date.now() - (st?.at ?? lastSeen(m.key) ?? Date.now()))}`
    : [m.key === LOCAL ? "" : "ssh", upText(data?.up)].filter(Boolean).join(" · ");
  const bar = (label, pct, text) => h_flex().w_full().gap(8).items_center().font_family(MONO).text_size(11)
    .child(h_flex().w(14).flex_none().items_center().tooltip(label).child(ico(label, 13, C.dim)))
    .child(div().flex_1().min_w(0).h(6).rounded(3).bg(C.raised).overflow_hidden()
      .child(div().h(6).rounded(3).w(`${Math.max(2, Math.min(100, pct))}%`).bg(level(pct, C.cyan))))
    .child(div().min_w(82).flex_none().text_right().whitespace_nowrap().text_color(C.muted).child(text));
  return v_flex().id("tn-stats").w_full().flex_none().bg(C.surface).rounded(16).px(12).pt(10).pb(11).gap(7)
    .opacity(m.offline ? 0.6 : 1)
    .child(h_flex().w_full().gap(7).items_center()
      .child(machineIcon(m, 12, C.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.fg).child(m.name))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(m.offline ? C.amber : C.dim).child(meta)))
    .when(!!data, el => el
      .child(bar("cpu", data.cpu, `${data.cpu}% · ${data.cores} cores`))
      .child(bar("ram", data.memPct, data.memText))
      .child(diskRow(data)))
    .when(!data, el => el.child(div().font_family(MONO).text_size(11).text_color(C.dim)
      .child(st?.fail ? "stats unavailable" : "reading…")));
}

// Disk as text: what's free matters more than a bar. Amber under 15% free, red under 5%.
function diskRow(data) {
  const size = (g) => g >= 100 ? `${Math.round(g)} GB` : `${g.toFixed(1)} GB`;
  const freePct = data.diskTotal > 0 ? data.diskFree / data.diskTotal * 100 : 100;
  const tint = freePct < 5 ? C.red : freePct < 15 ? C.amber : C.fg;
  return h_flex().w_full().gap(8).items_center().font_family(MONO).text_size(11)
    .child(h_flex().w(14).flex_none().items_center().tooltip("disk").child(ico("disk", 13, C.dim)))
    .child(div().flex_1().min_w(0).whitespace_nowrap().text_color(tint).child(`${size(data.diskFree)} free`))
    .child(div().flex_none().whitespace_nowrap().text_color(C.dim).child(`of ${size(data.diskTotal)}`));
}

// ---- tiles ----
function tile(view, m, open, w) {
  const sel = open === m.key;
  return v_flex().id(`tn-m-${m.key}`).w(w).h(58).flex_none().relative().items_center().justify_center().gap(5).px(6).rounded(6)
    .bg(sel ? alpha(C.accent, 0.16) : C.surface).border(1).border_color(sel ? alpha(C.accent, 0.55) : CLEAR)
    .opacity(m.offline ? 0.62 : 1).cursor_pointer().tooltip(`${m.name} · ${m.summary}`)
    .hover(s => s.bg(sel ? alpha(C.accent, 0.2) : C.raised))
    .on_click((_e, cx) => { view.goMachine(m.key); view.pollStats(cx, true); cx.notify(); })
    .child(h_flex().size(24).rounded(6).justify_center().items_center().bg(sel ? alpha(C.accent, 0.24) : C.raised)
      .child(machineIcon(m, 14, sel ? C.accent : C.muted)))
    .child(div().max_w(Math.max(20, w - 14)).truncate().text_size(11).font_medium().text_color(sel ? C.fg : C.muted).child(m.name))
    .when(!!m.light, el => el.child(light(m, 6, 6)));
}

// ---- expanded ----
function brand(snap, open) {
  return h_flex().w_full().h(28).flex_none().gap(4).items_center()
    .child(h_flex().size(22).flex_none().ml(2).rounded(6).bg(C.accent).justify_center().items_center().child(ico("logo", 14, C.onAccent)))
    .child(div().flex_1().min_w(0).pl(6).text_size(14).font_semibold().text_color(C.fg).child("herdr"))
    .child(iconBtn("tn-new", "plus", 14, C.accent, alpha(C.accent, 0.14), "New", 28, 28, () => openNewMenu(snap, open)))
    .child(iconBtn("tn-collapse", "panel", 14, C.dim, CLEAR, "Collapse sidebar", 28, 28, () => run("layout.resize", { id: "sidebar", px: 56 })));
}

function full(base, view, snap, open, w) {
  const m = open ? snap.mBy.get(open) : null;
  const tileW = Math.max(40, Math.floor((w - 20 - 12) / 3));
  return base.px(10).pt(10).pb(12).gap(14)
    .child(brand(snap, open))
    .child(h_flex().w_full().flex_none().flex_wrap().gap(6).children(snap.machines.map(mm => tile(view, mm, open, tileW))))
    .when(!!m, el => el.child(v_flex().id("tn-caps").w_full().flex_1().min_h(0).gap(8).overflow_y_scrollbar()
      .child(sectionTitle(m))
      .children(m.spaces.map(sp => capsule(view, sp, m, false)))
      .child(h_flex().id("tn-newspace").w_full().h(34).flex_none().px(12).gap(8).items_center().rounded(16)
        .border(1).border_color(C.input).text_size(12).text_color(C.dim).cursor_pointer()
        .hover(s => s.bg(C.surface))
        .on_click(() => run("space.new", { machine: mArg(m.key) }))
        .child(ico("folder", 13, C.dim)).child(div().truncate().child(`New space on ${m.name}`)))))
    .when(!m, el => el.child(div().flex_1()))
    .when(!!m, el => el.child(statsCard(view, m)));
}

// ---- rail ----
function rail(base, view, snap) {
  return base.items_center().py(10).gap(8)
    .child(h_flex().size(28).flex_none().rounded(6).bg(C.accent).justify_center().items_center().child(ico("logo", 16, C.onAccent)))
    .child(iconBtn("tn-new", "plus", 14, C.accent, alpha(C.accent, 0.14), "New", 36, 32, () => openNewMenu(snap, null)))
    .child(div().w(24).h(1).flex_none().my(2).bg(C.raised))
    .children(snap.machines.map(m => h_flex().id(`tn-rm-${m.key}`).w(40).h(40).flex_none().relative().justify_center().items_center().rounded(6)
      .bg(C.surface).opacity(m.offline ? 0.62 : 1).cursor_pointer().tooltip(`${m.name} · ${m.summary}`)
      .hover(s => s.bg(C.raised))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); setPressed(anchorRight(e)); })
      .on_click(() => {
        const h = spacesHeight(m);
        openOverlay({ mod: MOD, kind: "popup", frame: "none", width: 268, height: h, at: getPressed(), props: { role: "spaces", machine: m.key, h } });
      })
      .child(machineIcon(m, 16, C.muted))
      .when(!!m.light, el => el.child(light(m, 4, 4)))))
    .child(div().flex_1())
    .child(iconBtn("tn-expand", "panel", 15, C.dim, CLEAR, "Expand sidebar", 36, 32, () => run("layout.resize", { id: "sidebar", px: 268 })));
}

export function renderSidebar(view) {
  const snap = snapshot();
  setAgentOrder(snap.rows.filter(r => r.agent).map(r => r.address));
  const w = view.width ?? nodePx("sidebar") ?? 268;
  const base = v_flex().id("tn-sidebar").size_full().overflow_hidden()
    .on_size_change((size, cx) => { if (Math.abs((view.width ?? 0) - size.width) >= 1) { view.width = size.width; cx.notify(); } });
  return w < 160 ? rail(base, view, snap) : full(base, view, snap, view.openKey(snap), w);
}

// ---- popup: New ----
export function renderNewMenu(view) {
  const p = props();
  const key = p.machine ?? LOCAL;
  const fs = spaces().find(s => s.id === focused()?.space);
  const here = !!fs && mkey(fs.machine) === key;
  const list = (view.agents ?? []).filter(a => a.installed);
  const pick = (fn) => () => { closeOverlay(p.overlay); fn(); };
  const item = (id, lead, label, hint, onPick) => h_flex().id(id).w_full().h(30).flex_none().px(8).gap(8).items_center().rounded(4)
    .text_size(13).text_color(C.fg).cursor_pointer().hover(s => s.bg(alpha(C.accent, 0.18)))
    .on_click(onPick).child(lead).child(div().flex_1().min_w(0).truncate().child(label))
    .when(!!hint, el => el.child(div().flex_none().font_family(MONO).text_size(11).text_color(C.dim).child(hint)));
  const label = (t) => div().px(8).py(4).flex_none().text_size(11).font_semibold().text_color(C.dim).child(t);
  return v_flex().id("tn-newmenu").w_full().h(p.h ?? newMenuHeight(4)).bg(C.surface).rounded(6).border(1).border_color(C.raised)
    .overflow_hidden().p(6).gap(2)
    .child(div().px(8).pt(6).pb(4).flex_none().truncate().text_size(11).font_semibold().text_color(C.dim).child(`IN ${(p.machine === LOCAL ? "This computer" : key).toUpperCase()}`))
    .child(item("nm-space", ico("folder", 14, C.teal), "Space", "", pick(() => run("space.new", { machine: mArg(key) }))))
    .child(item("nm-term", ico("terminal", 14, C.cyan), "Terminal tab", bindingOf("tab.new"),
      pick(() => here ? run("tab.new", {}) : run("space.new", { machine: mArg(key) }))))
    .child(div().h(1).flex_none().mx(2).my(4).bg(C.raised))
    .child(label("START AN AGENT"))
    .child(v_flex().id("nm-agents").w_full().h((p.h ?? newMenuHeight(4)) - NEW_FIXED).gap(2).overflow_y_scrollbar()
      .children(list.map(a => item(`nm-a-${a.key}`, prog(a, 14, C.fg), a.name, "",
        pick(() => here ? run("tab.new", { argv: a.run }) : run("space.new", { machine: mArg(key), argv: a.run })))))
      .when(list.length === 0, el => el.child(div().px(8).py(6).text_size(12).text_color(C.dim)
        .child(view.agentsFailed ? "Could not load agents" : "Checking installed agents…"))));
}

// ---- popup: a machine's spaces, from the rail ----
function spacesHeight(m) {
  const body = m.spaces.reduce((n, s) => n + 10 + 28 + s.rows.length * 30 + 8, 0);
  return Math.min(640, 16 + 22 + 8 + Math.max(body, 40));
}
export function renderSpacesPopup(view) {
  const p = props();
  const snap = snapshot();
  const m = snap.mBy.get(p.machine) ?? snap.machines[0];
  const h = p.h ?? spacesHeight(m);
  const close = () => closeOverlay(p.overlay);
  return v_flex().id("tn-spaces").w_full().h(h).bg(C.chrome).rounded(16).border(1).border_color(C.raised).overflow_hidden().p(8).gap(8)
    .child(h_flex().w_full().h(22).flex_none().gap(8).px(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.dim).child(m.name.toUpperCase()))
      .child(div().flex_none().font_family(MONO).text_size(11).text_color(m.count.waiting ? C.red : C.dim).child(m.summary)))
    .child(v_flex().id("tn-spaces-list").w_full().h(h - 16 - 22 - 8).gap(8).overflow_y_scrollbar()
      .children(m.spaces.map(sp => capsule(view, sp, m, true, close))));
}

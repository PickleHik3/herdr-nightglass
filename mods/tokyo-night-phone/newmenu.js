// tokyo-night-phone: the menu popup. Desktop's New menu lists every connected machine with its create
// options (New space, New terminal tab, Agent flyout); a phone has no room for a flyout beside a popup, so the
// Agent row opens its list inline (accordion) under the row. Below the machines: Files, Changes, Settings.
// Agent lists are the desktop's (knownAgents, cached per machine and shared with the other popup copies).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, closeOverlay, props, shared, setShared, knownAgents } from "herdr";
import { C, MONO, ico, prog, machineColor } from "./lib.js";
import { snapshot, LOCAL, mArg, onArg } from "./data.js";
import { swipeArea, swipeBody, watchScroll, tap } from "./phone.js";

const ROW = 44, HEAD = 34, PAD = 12, SEP = 13;

// ---- agents a machine can start (as the desktop sidebar does) ----
const agentCache = new Map();
export const cachedAgents = (key) => agentCache.get(key) ?? shared("new-menu.agents")?.[mArg(key)] ?? [];
const storeAgents = (key, list) => {
  agentCache.set(key, list);
  setShared("new-menu.agents", { ...(shared("new-menu.agents") ?? {}), [mArg(key)]: list });
};
export function loadAgents(view, key, cx) {
  view.agentsFailed = false;
  cx.spawn(async (cx) => {
    try { storeAgents(key, await knownAgents({ on: onArg(key) })); view.agentsFailed = false; } catch { view.agentsFailed = true; }
    cx.notify();
  });
}
// Warm every connected machine's list so the Agent row is usually instant.
export function prefetchAgents(cx) {
  for (const m of snapshot().machines) {
    if (m.offline) continue;
    cx.spawn(async () => {
      try { storeAgents(m.key, await knownAgents({ on: onArg(m.key) })); } catch { /* the Agent row reports it */ }
    });
  }
}

const menuMachines = (snap) => snap.machines.filter(m => !m.offline);
// Where "New terminal tab" goes on a machine: the focused space if it is there, else the shown / first one.
function targetSpace(snap, key) {
  const mine = snap.spaces.filter(s => s.machine === key);
  return (mine.find(s => s.id === snap.foc?.space) ?? mine.find(s => s.active) ?? mine[0])?.id ?? null;
}
// The popup's maximum height: every machine collapsed, the three app rows, and room for one open agent list.
export function menuHeight(snap) {
  const ms = menuMachines(snap);
  const rows = ms.reduce((n, m) => n + 2 + (targetSpace(snap, m.key) ? 1 : 0), 0);
  return PAD + ms.length * (HEAD + 4) + rows * ROW + Math.max(0, ms.length - 1) * SEP + SEP + 3 * ROW + 4 * ROW;
}

const popRow = (view, id, lead, label, trail, onPick) => h_flex().id(id).w_full().h(ROW).flex_none().px(10).gap(10).items_center().rounded(8)
  .text_size(13).text_color(C.fg).cursor_pointer()
  .on_click(tap(view, onPick)).child(lead).child(div().flex_1().min_w(0).truncate().child(label)).when(!!trail, el => el.child(trail));
const dimText = (t) => div().px(10).py(8).text_size(12).text_color(C.muted).child(t);
const sep = () => div().w_full().h(1).flex_none().mx(2).my(6).bg(C.rim);

export function renderNewMenu(view) {
  const p = props();
  const snap = snapshot();
  const ms = menuMachines(snap);
  // A files / changes tab goes to the shown space, named explicitly.
  const modTab = (mod) => snap.foc?.space ? { mod, space: snap.foc.space } : { mod };
  const pick = (fn) => () => { closeOverlay(p.overlay); fn(); };
  view.agentOpen ??= p.openAgents ?? null;
  const toggleAgents = (m) => (_e, cx) => {
    view.agentOpen = view.agentOpen === m.key ? null : m.key;
    if (view.agentOpen && !cachedAgents(m.key).length) loadAgents(view, m.key, cx);
    cx.notify();
  };
  const sections = ms.map((m, i) => {
    const target = targetSpace(snap, m.key);
    const open = view.agentOpen === m.key;
    const list = cachedAgents(m.key).filter(a => a.installed);
    return v_flex().w_full().flex_none()
      .when(i > 0, el => el.child(sep()))
      .child(h_flex().w_full().h(HEAD).flex_none().px(10).mb(4).gap(6).items_center()
        .child(ico(m.key === LOCAL ? "monitor" : "server", 12, machineColor(m.key)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(C.muted).child(m.name)))
      .child(popRow(view, `nm-space-${m.key}`, ico("folder", 14, C.muted), "New space", null, pick(() => run("space.new", { machine: mArg(m.key) }))))
      .when(!!target, el => el.child(popRow(view, `nm-term-${m.key}`, ico("terminal", 14, C.muted), "New terminal tab", null,
        pick(() => run("tab.new", { space: target })))))
      .child(popRow(view, `nm-agent-${m.key}`, ico("cpu", 14, C.muted), "Agent", div().flex_none().text_size(15).text_color(C.muted).child(open ? "⌄" : "›"), toggleAgents(m)))
      .when(open, el => el.children(list.map(a => popRow(view, `nm-a-${m.key}-${a.key}`, h_flex().w(14).flex_none().ml(14).child(prog(a, 14, C.fg)), a.name, null,
        pick(() => target ? run("tab.new", { space: target, argv: a.run }) : run("space.new", { machine: mArg(m.key), argv: a.run }))))))
      .when(open && list.length === 0, el => el.child(dimText(view.agentsFailed ? `Couldn't check ${m.name}` : "Looking for agents…")));
  });
  return v_flex().id("tnp-menu-pop").w_full().max_h(p.h ?? menuHeight(snap)).min_h(0).bg(C.glassSolid).rounded(12).border(1).border_color(C.rim).shadow_xl().p(6)
    .child(swipeArea(watchScroll(v_flex().id("tnp-menu-list").w_full().flex_1().min_h(0).overflow_y_scroll(), view))
      .child(swipeBody(v_flex().w_full().flex_none())
        .children(sections)
        .when(ms.length === 0, el => el.child(dimText("No machines connected")))
        .child(sep())
        .child(popRow(view, "tnp-m-files", ico("file", 14, C.muted), "Files", null, pick(() => run("tab.new", modTab("files")))))
        .child(popRow(view, "tnp-m-changes", ico("changes", 14, C.muted), "Changes",
          p.changes > 0 ? div().flex_none().font_family(MONO).text_size(10.5).text_color(C.amber).child(`+${p.changes}`) : null,
          pick(() => run("tab.new", modTab("changes")))))
        .child(popRow(view, "tnp-m-settings", ico("settings", 14, C.muted), "Settings", null, pick(() => run("app.settings", {}))))));
}

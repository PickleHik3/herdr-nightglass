// nightglass-phone: the "+" actions (what the desktop's New menu offers). Desktop's New menu lists the connected machines
// with their create options (New space, New terminal tab, Agent flyout); on the phone the rows open in the inbox header
// (inbox.js, the "+" button) for the machine shown: New space, New terminal tab, Agent (its list opens as a second row of
// chips under the first), then Settings (Files and Changes when `panels`). Agent lists are the desktop's (knownAgents,
// cached per machine and shared with the other copies of this mod). Chips are 40 px: touch targets.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, shared, setShared, knownAgents } from "herdr";
import { C, MONO, ico, prog, machineColor } from "./lib.js";
import { snapshot, mArg, onArg } from "./data.js";
import { swipeArea, swipeBody, watchScroll, tap } from "./phone.js";

export const ACT_H = 40, ACT_GAP = 6;

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
// Warm every connected machine's list so the Agent chip is usually instant.
export function prefetchAgents(cx) {
  for (const m of snapshot().machines) {
    if (m.offline) continue;
    cx.spawn(async () => {
      try { storeAgents(m.key, await knownAgents({ on: onArg(m.key) })); } catch { /* the Agent chip reports it */ }
    });
  }
}

// Where "New terminal tab" goes on a machine: the focused space if it is there, else the shown / first one.
function targetSpace(snap, key) {
  const mine = snap.spaces.filter(s => s.machine === key);
  return (mine.find(s => s.id === snap.foc?.space) ?? mine.find(s => s.active) ?? mine[0])?.id ?? null;
}

// label null: an icon-only 40 px chip (Files / Changes / Settings).
const chip = (view, id, lead, label, trail, onPick, on) => h_flex().id(id).h(ACT_H).min_w(ACT_H).flex_none().px(label ? 10 : 6).gap(6).justify_center().items_center().rounded(20)
  .bg(on ? C.raisedHi : C.raised).text_size(12).text_color(C.fg).whitespace_nowrap().cursor_pointer()
  .on_click(tap(view, onPick)).child(lead).when(!!label, el => el.child(div().child(label))).when(!!trail, el => el.child(trail));

// The actions for machine `m` (null: the app rows only). `done` closes the "+" rows; `changes` is the focused space's change
// count. `panels` false leaves out Files / Changes (the inbox: they live in the detail view's sheet). view.agentOpen (the
// machine whose agent list is shown) lives on the inbox's view.
export function actionRows(view, snap, m, done, changes, panels = true) {
  const modTab = (mod) => snap.foc?.space ? { mod, space: snap.foc.space } : { mod };
  const pick = (fn) => (_e, cx) => { done(cx); fn(); };
  const target = m && !m.offline ? targetSpace(snap, m.key) : null;
  const open = !!m && view.agentOpen === m.key;
  const list = m ? cachedAgents(m.key).filter(a => a.installed) : [];
  const toggleAgents = (_e, cx) => {
    view.agentOpen = open ? null : m.key;
    if (view.agentOpen && !cachedAgents(m.key).length) loadAgents(view, m.key, cx);
    cx.notify();
  };
  const row = (id, kids) => swipeArea(watchScroll(h_flex().id(id).w_full().h(ACT_H).flex_none().overflow_x_scroll(), view))
    .child(swipeBody(h_flex().h_full().flex_none().gap(ACT_GAP).items_center()).children(kids));
  const main = [];
  if (m && !m.offline) {
    main.push(div().flex_none().size(8).rounded(4).bg(machineColor(m.key))); // the machine the actions go to
    main.push(chip(view, "tnp-act-space", ico("folder", 13, C.muted), "Space", null, pick(() => run("space.new", { machine: mArg(m.key) }))));
    if (target) main.push(chip(view, "tnp-act-term", ico("terminal", 13, C.muted), "Terminal", null, pick(() => run("tab.new", { space: target }))));
    main.push(chip(view, "tnp-act-agent", ico("cpu", 13, C.muted), "Agent", div().text_size(13).text_color(C.muted).child(open ? "⌄" : "›"), toggleAgents, open));
  }
  if (panels) {
    main.push(chip(view, "tnp-act-files", ico("file", 13, C.muted), null, null, pick(() => run("tab.new", modTab("files")))));
    main.push(chip(view, "tnp-act-changes", ico("changes", 13, C.muted), null,
      changes > 0 ? div().font_family(MONO).text_size(10.5).text_color(C.amber).child(`+${changes}`) : null,
      pick(() => run("tab.new", modTab("changes")))));
  }
  main.push(chip(view, "tnp-act-settings", ico("settings", 13, C.muted), null, null, pick(() => run("app.settings", {}))));
  const rows = [row("tnp-act-row", main)];
  if (open) {
    const agents = list.map(a => chip(view, `tnp-act-a-${a.key}`, prog(a, 14, C.fg), a.name, null,
      pick(() => target ? run("tab.new", { space: target, argv: a.run }) : run("space.new", { machine: mArg(m.key), argv: a.run }))));
    if (list.length === 0) agents.push(div().h(ACT_H).flex_none().px(6).text_size(12).text_color(C.muted)
      .child(view.agentsFailed ? `Couldn't check ${m.name}` : "Looking for agents…"));
    rows.push(row("tnp-act-agents", agents));
  }
  return rows;
}
// Height of the actions block (rows and the gaps between them), designed px.
export const actionsHeight = (open) => ACT_H + (open ? ACT_GAP + ACT_H : 0);

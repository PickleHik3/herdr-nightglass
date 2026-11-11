// nightglass: one multi-role mod for the "nightglass" layout.
//   sidebar  machines, folder capsules, system stats (and the 56 px rail below 160 px wide)
//   header   search pill, Claude usage rings, Files / Changes, settings, window buttons
//   strip    "Nothing needs you" / offline banner / "Needs you" cards (sizes its own block)
//   pane     the pane header
//   newmenu, agentmenu, spaces          popups opened by the roles above
// Data comes from Herdr's live state; see data.js. Colors and icons: lib.js.
import { View, div } from "gpui-kit";
import { props, exec, run, shared, setShared } from "herdr";
import { renderSidebar, renderNewMenu, renderAgentMenu, renderSpacesPopup, renderColorsPopup, loadAgents, prefetchAgents } from "./sidebar.js";
import { renderHeader, pollChanges, pollUsage } from "./header.js";
import { renderStrip, renderPane, renderEmpty, EMPTY_KEY } from "./strip.js";
import { snapshot, STATS_SCRIPT, parseStats, onArg, statsMachine, ALL } from "./data.js";
import { nodePx, machineScheme, ALL_THEME } from "./lib.js";

export default class Nightglass extends View {
  init(_p, cx) {
    const role = props()?.role;
    this.stats = {};   // machine key -> { tried, at, data, fail }
    this.statsBusy = {};
    this.hover = null;
    this.changes = 0;
    if (role === "sidebar") {
      this.pollStats(cx, true);
      cx.timer.every(3000, (cx) => this.pollStats(cx));
      cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
      cx.timer.every(500, (cx) => this.watchFocus(cx));
      pollUsage(this, cx);
      cx.timer.every(5000, (cx) => pollUsage(this, cx));
    }
    if (role === "header") {
      pollChanges(this, cx);
      cx.timer.every(2000, (cx) => pollChanges(this, cx));
    }
    if (role === "strip") cx.timer.every(30000, (cx) => cx.notify());
    if (role === "newmenu") prefetchAgents(cx);
    if (role === "agentmenu") loadAgents(this, props().machine, cx);
  }

  // ---- the open machine: the person's choice (kept), else the focused space's machine ----
  openKey(snap) {
    if (this.openState === undefined) {
      try { this.openState = JSON.parse(localStorage.getItem("open") ?? "null"); } catch { this.openState = null; }
    }
    const st = this.openState;
    if (st?.set) {
      if (st.key === null) return null;
      if (st.key === ALL || snap.mBy.has(st.key)) return st.key;
    }
    const f = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
    return f?.machine ?? snap.machines[0]?.key ?? null;
  }
  // Show a machine: its capsules in the sidebar, and on screen the space last visited there
  // (else its first). A machine with no spaces shows the empty view in the main stack.
  goMachine(key) {
    this.setOpen(key);
    const snap = snapshot();
    const mine = snap.spaces.filter(s => s.machine === key);
    if (!mine.length) {
      setShared(EMPTY_KEY, key);
      run("layout.select", { stack: "main-stack", child: "empty" });
      return;
    }
    const last = this.lastSpaces()[key];
    const target = mine.find(s => s.id === last) ?? mine[0];
    setShared(EMPTY_KEY, null);
    run("layout.select", { stack: "main-stack", child: "main" });
    if (target.id !== snap.foc?.space) run("space.select", { id: target.id });
  }
  lastSpaces() {
    if (!this.visited) { try { this.visited = JSON.parse(localStorage.getItem("visited") ?? "{}"); } catch { this.visited = {}; } }
    return this.visited;
  }
  // Remember the focused space per machine; any focus change puts the terminals back on screen.
  watchFocus(cx) {
    const snap = snapshot();
    const id = snap.foc?.space ?? null;
    this.applyScheme(snap);
    if (id === this.lastFocus) return;
    this.lastFocus = id;
    const sp = id && snap.spaces.find(s => s.id === id);
    // Focus moved to another machine (attention card, palette): follow it, unless All is showing.
    if (sp && cx) {
      const open = this.openKey(snap);
      if (open !== ALL && open !== sp.machine) { this.setOpen(sp.machine); this.pollStats(cx, true); cx.notify(); }
    }
    if (sp) {
      const v = this.lastSpaces();
      if (v[sp.machine] !== id) { v[sp.machine] = id; try { localStorage.setItem("visited", JSON.stringify(v)); } catch { /* storage unavailable */ } }
    }
    if (this.emptyShown()) { setShared(EMPTY_KEY, null); run("layout.select", { stack: "main-stack", child: "main" }); }
  }
  // The whole window wears the focused space's machine scheme (the empty view: the machine it
  // shows; All: its own Storm scheme). Checked every tick, so a color picked for the focused machine applies at once.
  applyScheme(snap) {
    const sp = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
    const key = shared(EMPTY_KEY) ?? sp?.machine;
    const all = this.openKey(snap) === ALL;
    if (key == null && !all) return;
    const theme = all ? ALL_THEME : machineScheme(key).theme;
    if (theme === this.appliedTheme) return;
    this.appliedTheme = theme;
    run("app.theme", { name: theme });
  }
  emptyShown() { return shared(EMPTY_KEY) != null; }
  setOpen(key) {
    this.openState = { set: true, key };
    try { localStorage.setItem("open", JSON.stringify(this.openState)); } catch { /* storage unavailable */ }
  }

  // ---- machine stats: one exec every 15 s, only while expanded, only for the open machine ----
  pollStats(cx, force) {
    if ((this.width ?? nodePx("sidebar") ?? 268) < 160) return;
    const snap = snapshot();
    const open = this.openKey(snap);
    const m = open !== null && statsMachine(snap, open);
    const key = m.key;
    if (m.offline || m.layout !== "ready" || this.statsBusy[key]) return;
    const now = Date.now();
    const entry = this.stats[key] ?? (this.stats[key] = { tried: 0 });
    const gap = force ? 3000 : entry.fail ? 60000 : 15000;
    if (now - entry.tried < gap - 500) return;
    entry.tried = now;
    this.statsBusy[key] = true;
    cx.spawn(async (cx) => {
      let data = null;
      try {
        const r = await exec("sh", ["-c", STATS_SCRIPT], { on: onArg(key), timeout: 20000 });
        if (r.code === 0) data = parseStats(r.stdout);
      } catch { data = null; }
      this.statsBusy[key] = false;
      if (data) { entry.data = data; entry.at = Date.now(); entry.fail = false; }
      else if (!entry.data) entry.fail = true; // keep the last good answer otherwise
      cx.notify();
    });
  }

  // Every role gets the design's 13 px body size as its base, so text without its own size
  // never falls back to Herdr's larger UI default.
  render() {
    return this.renderRole().text_size(13);
  }

  renderRole() {
    switch (props()?.role) {
      case "sidebar": return renderSidebar(this);
      case "header": return renderHeader(this);
      case "strip": return renderStrip(this);
      case "pane": return renderPane();
      case "empty": return renderEmpty();
      case "newmenu": return renderNewMenu(this);
      case "agentmenu": return renderAgentMenu(this);
      case "spaces": return renderSpacesPopup(this);
      case "colors": return renderColorsPopup();
      default: return div();
    }
  }
}

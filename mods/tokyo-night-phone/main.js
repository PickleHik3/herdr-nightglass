// tokyo-night-phone: one multi-role mod for the "tokyo-night-phone" layout (portrait phone, 412 x 915).
//   topbar    app button, search button, stats rings, usage rings, panel toggle (with the changes dot); polls
//             changes, usage and the stats of the machine in front; closes the panel at load
//   strip     unreachable banner / one-line chips for agents that wait or finished (hidden when empty)
//   tabs      tab pills: every agent across machines, plus "+"; its timer shows / hides / sizes the strip
//   composer  prompt field + send (hc send)
//   drawer    the panel under the top bar: machine cards + All, actions row, spaces with agent rows; also follows
//             the focused machine and applies its whole-window scheme (its copy lives while the panel is hidden)
//   watch     a 1 px full-height column that only measures the window height (the panel's height cap)
//   usage, stats, colors   popups opened by the roles above
// Data (data.js) and helpers (lib.js) are the desktop tokyo-night mod's files, copied verbatim.
import { View, div } from "gpui-kit";
import { props, run } from "herdr";
import { renderTopbar, renderUsage, renderStatsPopup, pollChanges, pollUsage, pollStats } from "./topbar.js";
import { prefetchAgents } from "./newmenu.js";
import { renderStrip, renderTabs, stripSync } from "./strip.js";
import { renderComposer, initComposer } from "./composer.js";
import { renderDrawer, renderColorsPopup, panelSync } from "./drawer.js";
import { snapshot, ALL } from "./data.js";
import { machineScheme, ALL_THEME } from "./lib.js";
import { WIN, DESIGN_W, zoom, popupOpened, popupClosed, setPanel } from "./phone.js";

export default class TokyoNightPhone extends View {
  init(_p, cx) {
    const role = props()?.role;
    this.role = role;
    this.stats = {};   // machine key -> { tried, at, data, fail }
    this.statsBusy = {};
    this.changes = 0;
    if (role === "topbar") {
      setPanel(false); // the panel is closed whatever the last run or the saved layout said
      // The layout is drawn for 412 designed px: when props.fit_zoom is on, step the app zoom to window / 412.
      if (props()?.fit_zoom) cx.timer.every(400, () => this.fitZoom());
      pollChanges(this, cx);
      cx.timer.every(2000, (cx) => pollChanges(this, cx));
      pollUsage(this, cx);
      cx.timer.every(5000, (cx) => pollUsage(this, cx));
      pollStats(this, cx, true);
      cx.timer.every(3000, (cx) => pollStats(this, cx));
    }
    if (role === "strip") cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
    if (role === "composer") initComposer(this, cx);
    if (role === "drawer") {
      prefetchAgents(cx);
      cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
      cx.timer.every(500, (cx) => this.watchFocus(cx));
      cx.timer.every(400, () => panelSync(this));
    }
    if (role === "tabs") {
      cx.timer.every(1000, (cx) => { if (this.armed) cx.notify(); }); // the armed close expires
      cx.timer.every(500, () => stripSync(this));                      // the strip block: shown / hidden / sized
    }
    if (role === "usage" || role === "stats" || role === "colors") popupOpened(role); // popup toggles: phone.js
  }

  async close() {
    if (this.role === "usage" || this.role === "stats" || this.role === "colors") popupClosed(this.role);
  }

  // ---- the open machine: the person's choice (kept), else the focused space's machine ----
  // (as the desktop mod; the phone has no "empty view" stack, so a machine without spaces just lists none)
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
  // Show a machine: its spaces in the drawer, and on screen the space last visited there (else its first).
  goMachine(key) {
    this.setOpen(key);
    const snap = snapshot();
    const mine = snap.spaces.filter(s => s.machine === key);
    if (!mine.length) return;
    const last = this.lastSpaces()[key];
    const target = mine.find(s => s.id === last) ?? mine[0];
    if (target.id !== snap.foc?.space) run("space.select", { id: target.id });
  }
  lastSpaces() {
    if (!this.visited) { try { this.visited = JSON.parse(localStorage.getItem("visited") ?? "{}"); } catch { this.visited = {}; } }
    return this.visited;
  }
  // Remember the focused space per machine, follow focus across machines (unless All is showing),
  // and keep the window's scheme in step with the focused machine.
  watchFocus(cx) {
    const snap = snapshot();
    const id = snap.foc?.space ?? null;
    this.applyScheme(snap);
    if (id === this.lastFocus) return;
    this.lastFocus = id;
    const sp = id && snap.spaces.find(s => s.id === id);
    if (sp && cx) {
      const open = this.openKey(snap);
      if (open !== ALL && open !== sp.machine) { this.setOpen(sp.machine); cx.notify(); }
    }
    if (sp) {
      const v = this.lastSpaces();
      if (v[sp.machine] !== id) { v[sp.machine] = id; try { localStorage.setItem("visited", JSON.stringify(v)); } catch { /* storage unavailable */ } }
    }
  }
  // The whole window wears the focused space's machine scheme (All: its own Storm scheme). Checked every
  // tick, so a color picked for the focused machine applies at once. app.theme sets the layout's theme click.
  applyScheme(snap) {
    const sp = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
    const key = sp?.machine;
    const all = this.openKey(snap) === ALL;
    if (key == null && !all) return;
    const theme = all ? ALL_THEME : machineScheme(key).theme;
    if (theme === this.appliedTheme) return;
    this.appliedTheme = theme;
    run("app.theme", { name: theme });
  }
  setOpen(key) {
    this.openState = { set: true, key };
    try { localStorage.setItem("open", JSON.stringify(this.openState)); } catch { /* storage unavailable */ }
  }

  // The layout only makes sense at zoom ~ window width / DESIGN_W (every px in it is designed px). There is no
  // layout-level zoom and no "set zoom" command, only app.zoom_in / app.zoom_out (one 0.1 step each, written to
  // settings.json by the app). So: one step per 400 ms tick until the zoom is within 0.05 of the target, then stop
  // for good (until the layout is loaded again), so a later manual zoom is never fought.
  fitZoom() {
    if (this.zoomDone || !(WIN.w > 0)) return;
    const target = Math.min(3, Math.max(0.5, Math.round((WIN.w / DESIGN_W) * 10) / 10));
    const z = Math.round(zoom() * 10) / 10;
    if (Math.abs(z - target) < 0.05 || (this.zoomSteps ?? 0) >= 30) { this.zoomDone = true; return; }
    this.zoomSteps = (this.zoomSteps ?? 0) + 1;
    run(target > z ? "app.zoom_in" : "app.zoom_out", {});
  }

  // The observer: its block is 1 px wide and as tall as the window, so its height is the window's (screen px).
  // The panel's own timer (drawer.js panelSync) reads it, so a soft keyboard (a shorter window) shrinks the cap.
  renderWatch() {
    return div().id("tnp-watch").size_full()
      .on_size_change((size) => { WIN.h = size.height; });
  }

  // Every role gets the design's 13 px body size as its base.
  render() {
    return this.renderRole().text_size(13);
  }

  renderRole() {
    switch (props()?.role) {
      case "topbar": return renderTopbar(this);
      case "strip": return renderStrip(this);
      case "tabs": return renderTabs(this);
      case "composer": return renderComposer(this);
      case "drawer": return renderDrawer(this);
      case "watch": return this.renderWatch();
      case "usage": return renderUsage();
      case "stats": return renderStatsPopup();
      case "colors": return renderColorsPopup();
      default: return div();
    }
  }
}

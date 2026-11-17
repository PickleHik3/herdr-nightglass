// nightglass-phone: one multi-role mod for the "nightglass-phone" layout (portrait phone, 412 x 915), Concept B "Inbox"
// (design/PhoneConcepts.html).
//   inbox     the home view (inbox.js): header (search, "+", usage row when prop "usage": true), machine cards (the filter,
//             with cpu / ram / disk), Needs you / All agents. Owns the pollers (changes, stats of every machine, usage
//             when on, the shown card's terminal text), fit_zoom, the scheme of the focused machine; resets to the inbox
//             view at load. Its copy lives while the block is hidden (detail view), so its timers keep running.
//   dbar      the detail view's slim bar (detail.js): Back, agent name and address, Files / Changes
//   sheet     the head of the Files / Changes sheet under the terminal (detail.js); the sheet itself is the app's mods
//   composer  prompt field + send (composer.js: hc send, bound to the opened terminal)
//   usage, colors   popups opened by the inbox (usage details, a machine's scheme)
// Data (data.js) and helpers (lib.js) are the desktop nightglass mod's files, copied verbatim.
import { View, div } from "gpui-kit";
import { props, run } from "herdr";
import { renderInbox, renderColorsPopup, currentCard } from "./inbox.js";
import { pollChanges, pollStats, pollUsage, pollPreview, renderUsage, PREVIEW_MS } from "./polls.js";
import { prefetchAgents } from "./newmenu.js";
import { renderDbar, renderSheetHead, showInbox } from "./detail.js";
import { renderComposer, initComposer } from "./composer.js";
import { snapshot, ALL } from "./data.js";
import { machineScheme, ALL_THEME } from "./lib.js";
import { WIN, DESIGN_W, zoom, popupOpened, popupClosed, detailOpen, needsRows } from "./phone.js";

export default class NightglassPhone extends View {
  init(_p, cx) {
    const role = props()?.role;
    this.role = role;
    this.stats = {};   // machine key -> { tried, at, data, fail }
    this.statsBusy = {};
    this.changes = 0;
    if (role === "inbox") {
      showInbox(true); // the inbox view, whatever the last run or the saved layout said
      // The layout is drawn for 412 designed px: when props.fit_zoom is on, step the app zoom to window / 412.
      if (props()?.fit_zoom) cx.timer.every(400, () => this.fitZoom());
      prefetchAgents(cx);
      pollChanges(this, cx);
      cx.timer.every(2000, (cx) => pollChanges(this, cx));
      if (props()?.usage === true) { // opt-in (layout prop "usage": true on the inbox block): no usage fetching otherwise
        pollUsage(this, cx);
        cx.timer.every(5000, (cx) => pollUsage(this, cx));
      }
      pollStats(this, cx, true);
      cx.timer.every(3000, (cx) => pollStats(this, cx));
      cx.timer.every(500, (cx) => this.watchFocus(cx));
      cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
      cx.timer.every(500, (cx) => this.previewTick(cx));
    }
    if (role === "dbar") cx.timer.every(1000, (cx) => cx.notify()); // status, title and the needs badge follow the agents
    if (role === "composer") initComposer(this, cx);
    if (role === "usage" || role === "colors") popupOpened(role); // popup toggles: phone.js
  }

  async close() {
    if (this.role === "usage" || this.role === "colors") popupClosed(this.role);
  }

  // The shown card's screen: read every PREVIEW_MS while the inbox shows the Needs you tab (polls.js pollPreview).
  previewTick(cx) {
    if (detailOpen() || this.tab !== "needs") return;
    const snap = snapshot();
    const { r } = currentCard(this, needsRows(snap, this.openKey(snap)));
    if (!r) return;
    const force = this.pvForce === true;
    if (force) this.pvForce = false;
    pollPreview(this, cx, r.address, force); // redraws when the text arrives
  }

  // ---- the machine filter: the person's choice (kept), else All ----
  openKey(snap) {
    if (this.openState === undefined) {
      try { this.openState = JSON.parse(localStorage.getItem("open") ?? "null"); } catch { this.openState = null; }
    }
    const st = this.openState;
    if (st?.set && (st.key === ALL || snap.mBy.has(st.key))) return st.key;
    return ALL;
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

  // Every role gets the design's 13 px body size as its base.
  render() {
    return this.renderRole().text_size(13);
  }

  renderRole() {
    switch (props()?.role) {
      case "inbox": return renderInbox(this);
      case "dbar": return renderDbar(this);
      case "sheet": return renderSheetHead();
      case "composer": return renderComposer(this);
      case "usage": return renderUsage();
      case "colors": return renderColorsPopup();
      default: return div();
    }
  }
}

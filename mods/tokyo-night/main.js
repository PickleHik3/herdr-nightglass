// tokyo-night: one multi-role mod for the "tokyo-night" layout.
//   sidebar  machines, folder capsules, system stats (and the 56 px rail below 160 px wide)
//   header   search pill, Claude usage rings, Files / Changes, settings, window buttons
//   strip    "Nothing needs you" / offline banner / "Needs you" cards (sizes its own block)
//   pane     the pane header
//   newmenu, spaces, usage   popups opened by the roles above
// Data comes from Herdr's live state; see data.js. Colors and icons: lib.js.
import { View, div } from "gpui-kit";
import { props, exec } from "herdr";
import { renderSidebar, renderNewMenu, renderSpacesPopup, loadAgents } from "./sidebar.js";
import { renderHeader, renderUsagePopup, pollChanges, pollUsage } from "./header.js";
import { renderStrip, renderPane } from "./strip.js";
import { snapshot, STATS_SCRIPT, parseStats, onArg } from "./data.js";
import { nodePx } from "./lib.js";

export default class TokyoNight extends View {
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
    }
    if (role === "header") {
      pollChanges(this, cx);
      pollUsage(this, cx);
      cx.timer.every(2000, (cx) => pollChanges(this, cx));
      cx.timer.every(5000, (cx) => pollUsage(this, cx));
    }
    if (role === "strip") cx.timer.every(30000, (cx) => cx.notify());
    if (role === "usage") cx.timer.every(15000, (cx) => cx.notify()); // "30s ago"
    if (role === "newmenu") loadAgents(this, props().machine, cx);
  }

  // ---- the open machine: the person's choice (kept), else the focused space's machine ----
  openKey(snap) {
    if (this.openState === undefined) {
      try { this.openState = JSON.parse(localStorage.getItem("open") ?? "null"); } catch { this.openState = null; }
    }
    const st = this.openState;
    if (st?.set) {
      if (st.key === null) return null;
      if (snap.mBy.has(st.key)) return st.key;
    }
    const f = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
    return f?.machine ?? snap.machines[0]?.key ?? null;
  }
  setOpen(key) {
    this.openState = { set: true, key };
    try { localStorage.setItem("open", JSON.stringify(this.openState)); } catch { /* storage unavailable */ }
  }

  // ---- machine stats: one exec every 15 s, only while expanded, only for the open machine ----
  pollStats(cx, force) {
    if ((this.width ?? nodePx("sidebar") ?? 268) < 160) return;
    const snap = snapshot();
    const key = this.openKey(snap);
    const m = key !== null && snap.mBy.get(key);
    if (!m || m.offline || m.layout !== "ready" || this.statsBusy[key]) return;
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

  render() {
    switch (props()?.role) {
      case "sidebar": return renderSidebar(this);
      case "header": return renderHeader(this);
      case "strip": return renderStrip(this);
      case "pane": return renderPane();
      case "newmenu": return renderNewMenu(this);
      case "spaces": return renderSpacesPopup(this);
      case "usage": return renderUsagePopup();
      default: return div();
    }
  }
}

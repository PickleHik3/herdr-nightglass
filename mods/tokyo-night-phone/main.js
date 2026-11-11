// tokyo-night-phone: one multi-role mod for the "tokyo-night-phone" layout (portrait phone, 412 x 915).
//   topbar    app button, search, usage rings, menu with dot
//   strip     "Nothing needs you" / unreachable banner / swipeable "Needs you" cards (sizes its own block)
//   tabs      tab pills: every agent across machines, plus "+"
//   composer  prompt field + send (hc send)
//   drawer    machine cards + All, spaces with agent rows, cpu / ram / disk; also follows the focused
//             machine and applies its whole-window scheme (its copy lives while the drawer is hidden)
//   watch     a 1 px full-height column that only measures the window and drops / restores the drawer
//   menu, usage, colors   popups opened by the roles above
// Data (data.js) and helpers (lib.js) are the desktop tokyo-night mod's files, copied verbatim.
import { View, div } from "gpui-kit";
import { ScrollHandle } from "gpui-base";
import { props, exec, run, layout } from "herdr";
import { renderTopbar, renderMenu, renderUsage, pollChanges, pollUsage, usageOpened, usageClosed } from "./topbar.js";
import { renderStrip, renderTabs } from "./strip.js";
import { renderComposer, initComposer } from "./composer.js";
import { renderDrawer, renderColorsPopup } from "./drawer.js";
import { snapshot, STATS_SCRIPT, parseStats, onArg, statsMachine, ALL } from "./data.js";
import { C, findNode, machineScheme, ALL_THEME } from "./lib.js";
import { WIN } from "./phone.js";

// Soft keyboard: the display resizes, so the window gets short. The design's core (top bar to
// composer) is 595 px; below HIDE_BELOW the drawer would be under ~45 px, so it is hidden, and it
// comes back only at SHOW_AT (a dead band between them: no flicker while the keyboard animates).
const HIDE_BELOW = 640;
const SHOW_AT = 720;

export default class TokyoNightPhone extends View {
  init(_p, cx) {
    const role = props()?.role;
    this.role = role;
    this.stats = {};   // machine key -> { tried, at, data, fail }
    this.statsBusy = {};
    this.changes = 0;
    if (role === "topbar") {
      pollChanges(this, cx);
      cx.timer.every(2000, (cx) => pollChanges(this, cx));
      pollUsage(this, cx);
      cx.timer.every(5000, (cx) => pollUsage(this, cx));
    }
    if (role === "strip") cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
    if (role === "tabs") this.pillScroll = ScrollHandle.new();
    if (role === "composer") initComposer(this, cx);
    if (role === "drawer") {
      this.pollStats(cx, true);
      cx.timer.every(3000, (cx) => this.pollStats(cx));
      cx.timer.every(30000, (cx) => cx.notify()); // elapsed times
      cx.timer.every(500, (cx) => this.watchFocus(cx));
    }
    if (role === "usage") usageOpened();
  }

  async close() {
    if (this.role === "usage") usageClosed();
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
      if (open !== ALL && open !== sp.machine) { this.setOpen(sp.machine); this.pollStats(cx, true); cx.notify(); }
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

  // ---- machine stats: one exec every 15 s, only for the open machine, only while the drawer is shown ----
  pollStats(cx, force) {
    if (WIN.dropped) return;
    const snap = snapshot();
    const open = this.openKey(snap);
    const m = open !== null && statsMachine(snap, open);
    if (!m || m.offline || m.layout !== "ready" || this.statsBusy[m.key]) return;
    const key = m.key;
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

  // The observer: its block is 1 px wide and as tall as the window, so its height is the window's.
  renderWatch() {
    return div().id("tnp-watch").size_full().bg(C.canvas)
      .on_size_change((size) => {
        WIN.h = size.height;
        const hidden = !!findNode(layout(), "drawer")?.hidden;
        const want = hidden ? size.height < SHOW_AT : size.height < HIDE_BELOW;
        WIN.dropped = want;
        if (want !== hidden) run(want ? "layout.hide" : "layout.show", { id: "drawer" });
      });
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
      case "menu": return renderMenu();
      case "usage": return renderUsage();
      case "colors": return renderColorsPopup();
      default: return div();
    }
  }
}

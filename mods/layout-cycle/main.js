// layout-cycle: ctrl-shift-l cycles through a fixed set of layouts instead of every file in layouts/
// (the app's own `layout.switch` with no name also visits Herdr 98, Terminals and any *.reset-<time> copies,
// and the shipped ones come back on every start, so they can't simply be deleted).
// Bind it in keys.json: "ctrl-shift-l": "mod.open:layout-cycle". It opens as a 1 px popup, switches to the
// layout after the shown one in CYCLE (the first one when the shown layout isn't in the list), and closes.
// Needs herdr-app 0.1.16+ (`checking`).
import { View, div } from "gpui-kit";
import { run, shared, setShared, settings, layouts, props, closeOverlay, checking } from "herdr";

const CYCLE = ["nightglass", "nightglass-phone", "main"];

export default class LayoutCycle extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.spawn(async () => {
      const have = new Set(layouts());
      const list = CYCLE.filter(n => have.has(n));
      const overlay = props()?.overlay;
      if (overlay) closeOverlay(overlay);
      if (!list.length) return;
      const i = list.indexOf(String(shared("layout") ?? ""));
      const next = list[(i + 1) % list.length];
      // Leaving the phone layout: put back the zoom its fit_zoom found (nightglass-phone main.js notes it).
      const z0 = shared("nightglass-phone.zoomBefore");
      if (next !== "nightglass-phone" && typeof z0 === "number") {
        setShared("nightglass-phone.zoomBefore", null);
        const z = Number(settings()?.zoom) > 0 ? Number(settings().zoom) : 1;
        const n = Math.round((z0 - z) * 10);
        for (let k = 0; k < Math.abs(n); k++) run(n > 0 ? "app.zoom_in" : "app.zoom_out", {});
      }
      run("layout.switch", { name: next });
    });
  }

  render(_cx) {
    return div().size_full();
  }
}

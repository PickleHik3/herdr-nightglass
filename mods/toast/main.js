// toast: how notifications look. Herdr draws every toast as an overlay of kind "toast" and loads THIS mod into it
// (replaceable: herdr.d.ts `notify`: "Shown by the `toast` mod (replaceable), which runs `action` when clicked").
// The app fixes the box: 340 x 72 designed px, stacked upward from the window's bottom right (16 px in, 16 px up,
// 8 px between, 5 s / 8 s for warnings and errors unless `timeout`); neither this mod nor a layout can move it.
// So on the phone layout (it has the "drawer" node) the toast is a one-line 32 px capsule at the TOP of that box
// (opaque glass, rim, a dot tinted by kind), the rest of the box transparent; elsewhere it is the stock look.
// lib.js is the desktop mod's, verbatim.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, layout } from "herdr";
import { C, alpha, findNode } from "./lib.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  render(_cx) {
    const p = props() ?? {};
    const act = () => {
      if (p.action?.name) run(p.action.name, p.action.args ?? {});
      closeOverlay(p.overlay);
    };
    if (findNode(layout(), "drawer")) return this.capsule(p, act);
    return this.stock(p, act);
  }

  // Phone: ~32 px, one line (title, then the body in muted), dot by kind; the box around it stays see-through.
  capsule(p, act) {
    const dot = { error: C.red, warning: C.amber, success: C.green, info: C.accent }[p.level] ?? C.accent;
    const text = [p.title, p.body].filter(Boolean).join(" · ");
    return v_flex().size_full().items_center()
      .child(h_flex().id("toast").w_full().h(32).flex_none().px(12).gap(8).items_center().rounded(16)
        .bg(C.glassSolid).border(1).border_color(C.rim).cursor_pointer().text_size(12)
        .on_click(act)
        .child(p.icon ? image(p.icon).size(14).flex_none() : div().size(8).rounded(4).flex_none().bg(dot))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(C.fg).child(text)));
  }

  stock(p, act) {
    const t = theme();
    return h_flex().id("toast").size_full().px(18).gap(12).items_center().bg(t.popover).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click(act)
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(v_flex().flex_1().overflow_hidden()
        .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(p.title ?? ""))
        .when(Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? ""))));
  }
}

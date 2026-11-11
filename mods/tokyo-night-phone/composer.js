// tokyo-night-phone: the message composer row (prompt field + send button). Design: phone-template.html:456-472.
// Sending is `hc send <terminal> <text>` through the documented `hc()` call (herdr.d.ts: hc): it pastes the
// text and presses Enter, and refuses a terminal that is blocked on a dialog (hc send --help).
import { div } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { hc, focused, spaces, panes, notify } from "herdr";
import { C, MONO, alpha } from "./lib.js";
import { pico } from "./phone.js";
import { short } from "./data.js";

// The terminal a message goes to: the focused one, else the first terminal of the shown tab.
export function targetTerminal() {
  const f = focused();
  if (f?.terminal) return f.terminal;
  const tab = spaces().find(s => s.active)?.tabs?.find(t => t.active);
  return tab ? panes().find(p => p.tab === tab.id && p.terminal)?.terminal ?? null : null;
}

function makeInput(view, cx, placeholder) {
  const st = InputState.new({ placeholder });
  st.on("submit", () => send(view));
  st.on("focus", (_e, cx) => { view.inputFocused = true; cx.notify(); });
  st.on("blur", (_e, cx) => { view.inputFocused = false; cx.notify(); });
  return st;
}

export function initComposer(view, cx) {
  view.inputFocused = false;
  view.target = targetTerminal();
  view.input = makeInput(view, cx, `Message ${view.target ? short(view.target) : "terminal"}`);
  // The placeholder can only be set when the state is made, so follow the target by remaking an
  // empty, unfocused field (InputState.new belongs in init or an event handler: gpui-kit.d.ts InputState).
  cx.timer.every(500, (cx) => {
    const t = targetTerminal();
    if (t === view.target) return;
    if (view.inputFocused || view.input.value() !== "") return; // try again later, never disturb typing
    try {
      const next = makeInput(view, cx, `Message ${t ? short(t) : "terminal"}`);
      const old = view.input;
      view.input = next; view.target = t;
      old.release();
    } catch { /* keep the field we have */ }
    cx.notify();
  });
}

function send(view) {
  const text = view.input.value();
  if (!text.trim()) return;
  const t = targetTerminal();
  if (!t) { notify({ title: "Nothing to send to", body: "The shown tab has no terminal.", level: "warning" }); return; }
  view.input.set_value("");
  const fail = (why) => {
    if (view.input.value() === "") view.input.set_value(text);
    notify({ title: `Not sent to ${short(t)}`, body: String(why ?? "").trim().slice(0, 200), level: "warning" });
  };
  hc(["send", t, text]).then((r) => { if (r.code !== 0) fail(r.stderr || r.stdout); }).catch((e) => fail(e?.message ?? e));
}

export function renderComposer(view) {
  const t = targetTerminal();
  const on = view.inputFocused;
  return h_flex().id("tnp-composer").size_full().px(8).gap(6)
    .child(h_flex().flex_1().min_w(0).h(44).px(12).gap(8).items_center().rounded(10).bg(C.well)
      .border(on ? 1.5 : 1).border_color(on ? C.accent : alpha(C.accent, 0.35))
      .font_family(MONO).text_size(13)
      .child(div().flex_none().text_color(C.accent).child("❯"))
      .child(Input.new(view.input).flex_1().min_w(0).h(40).text_size(13).font_family(MONO).text_color(C.fg)))
    .child(h_flex().id("tnp-send").size(44).flex_none().justify_center().items_center().rounded(10).bg(C.accent).shadow_md()
      .opacity(t ? 1 : 0.5).cursor_pointer().on_click(() => send(view))
      .child(pico("arrow-up", 16, C.ink)));
}

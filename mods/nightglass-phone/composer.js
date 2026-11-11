// nightglass-phone: the message composer row (prompt field + send button), behind a button. Design: phone-template.html:456-472.
//
// Default: no row (the terminal takes its height; typing goes straight to the terminal). The button at the start of the pill
// row (strip.js) reveals it: layout.show on the `composer` block (layout.hide again on a second tap, after a successful send,
// and when the active terminal / tab / space changes). Nothing is persisted: init hides it every time the mod loads.
//
// Send target rule (a message once went to a live agent after the active tab had moved): the row is BOUND to the terminal
// that was active when it was opened (address captured at open, shown as "Message tNN" and a tNN chip). A send goes to that
// address only. At send time the active terminal is looked up again; if it is not the bound one, nothing is sent, the text
// is kept and the row turns amber ("tNN is no longer in front, tap to retarget"); the retarget tap binds it to what is in
// front now. Never "whatever is focused". Sending is `hc send <terminal> <text>` (herdr.d.ts: hc): it pastes the text and
// presses Enter, and refuses a terminal that is blocked on a dialog (hc send --help); that refusal is kept.
import { div } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { hc, focused, spaces, panes, notify, shared, setShared, run } from "herdr";
import { C, MONO, alpha } from "./lib.js";
import { pico } from "./phone.js";
import { short } from "./data.js";

const KEY = "nightglass-phone.composer"; // { open, target, ctx, moved? } (not persisted across loads: init resets it)

// The terminal a message goes to: the focused one, else the first terminal of the shown tab.
export function targetTerminal() {
  const f = focused();
  if (f?.terminal) return f.terminal;
  const tab = spaces().find(s => s.active)?.tabs?.find(t => t.active);
  return tab ? panes().find(p => p.tab === tab.id && p.terminal)?.terminal ?? null : null;
}
// What "in front" means: space, tab and terminal. A change of any of them hides the row.
const ctxKey = () => { const f = focused(); return `${f?.space ?? ""}|${f?.tab ?? ""}|${targetTerminal() ?? ""}`; };

export const composerOpen = () => shared(KEY)?.open === true;
export function closeComposer() { setShared(KEY, { open: false }); run("layout.hide", { id: "composer" }); }
export function toggleComposer() {
  if (composerOpen()) { closeComposer(); return; }
  const target = targetTerminal();
  if (!target) { notify({ title: "Nothing to type into", body: "The shown tab has no terminal.", level: "warning" }); return; }
  setShared(KEY, { open: true, target, ctx: ctxKey() });
  run("layout.show", { id: "composer" });
}

function makeInput(view, placeholder) {
  const st = InputState.new({ placeholder });
  st.on("submit", (_e, cx) => send(view, cx));
  st.on("focus", (_e, cx) => { view.inputFocused = true; cx.notify(); });
  st.on("blur", (_e, cx) => { view.inputFocused = false; cx.notify(); });
  return st;
}
// A new field with a new placeholder (it can only be set when the state is made), keeping the text.
function remake(view, target) {
  try {
    const text = view.input.value();
    const next = makeInput(view, `Message ${short(target)}`);
    if (text) next.set_value(text);
    const old = view.input;
    view.input = next;
    old.release();
  } catch { /* keep the field we have */ }
}

export function initComposer(view, cx) {
  view.inputFocused = false;
  view.bound = null;
  view.input = makeInput(view, "Message");
  // Default hidden, whatever the last run or the saved layout click said.
  setShared(KEY, { open: false });
  run("layout.hide", { id: "composer" });
  cx.timer.every(250, (cx) => {
    const st = shared(KEY);
    if (st?.open) {
      if (view.bound !== st.target) {                       // just opened: bind, fresh field, focus it
        view.bound = st.target;
        if (view.input.value()) view.input.set_value("");
        remake(view, st.target);
        view.focusAt = Date.now() + 300;                    // focus once the row is on screen (a later tick)
        cx.notify();
      }
      if (view.focusAt && Date.now() >= view.focusAt) { view.focusAt = 0; try { view.input.focus(); } catch { /* not shown yet */ } }
      // The terminal in front changed: close, but only when it is a terminal that differs for two ticks in a row. focused() can be
      // null or still moving for a moment after the panel or a tap shifted focus, and the old one-tick check on space|tab|terminal
      // closed a just-opened composer at once (the first tap seemed to do nothing).
      const now = targetTerminal();
      if (!st.moved && now && now !== st.target) { view.drift = (view.drift ?? 0) + 1; if (view.drift >= 2) { view.drift = 0; closeComposer(); } }
      else view.drift = 0;
    } else if (view.bound) {                                // closed
      view.bound = null;
      try { view.input.set_value(""); } catch { /* ignore */ }
      cx.notify();
    }
  });
}

function send(view, cx) {
  const st = shared(KEY);
  const text = view.input.value();
  if (!st?.open || !text.trim()) return;
  const bound = st.target;
  const front = targetTerminal();
  // The rule: only to the terminal the row was opened for.
  if (front !== bound) { setShared(KEY, { ...st, moved: front ?? "none" }); cx?.notify(); return; }
  view.input.set_value("");
  const fail = (why) => {
    if (view.input.value() === "") view.input.set_value(text);
    notify({ title: `Not sent to ${short(bound)}`, body: String(why ?? "").trim().slice(0, 200), level: "warning" });
  };
  hc(["send", bound, text]).then((r) => { if (r.code !== 0) fail(r.stderr || r.stdout); else closeComposer(); }).catch((e) => fail(e?.message ?? e));
}

// Retarget: bind the row to what is in front now, keeping the text.
function retarget(view, cx) {
  const st = shared(KEY);
  const front = targetTerminal();
  if (!front) { closeComposer(); return; }
  view.bound = front;                                       // so the timer does not read it as a new opening
  remake(view, front);
  setShared(KEY, { open: true, target: front, ctx: ctxKey() });
  view.focusAt = Date.now() + 200;
  cx?.notify();
}

export function renderComposer(view) {
  const st = shared(KEY);
  const row = h_flex().id("tnp-composer").size_full().px(8).gap(6);
  if (!st?.open) return row; // hidden: the block is hidden too
  if (st.moved) {
    return row.child(h_flex().id("tnp-retarget").flex_1().min_w(0).h(44).px(12).gap(8).items_center().rounded(10)
      .bg(alpha(C.amber, 0.14)).border(1.5).border_color(C.amber).cursor_pointer().on_click((_e, cx) => retarget(view, cx))
      .child(div().flex_none().text_color(C.amber).child("!"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.fg)
        .child(`${short(st.target)} is no longer in front — tap to retarget${st.moved !== "none" ? ` to ${short(st.moved)}` : ""}`)));
  }
  const on = view.inputFocused;
  return row
    .child(h_flex().flex_1().min_w(0).h(44).px(12).gap(8).items_center().rounded(10).bg(C.well)
      .border(on ? 1.5 : 1).border_color(on ? C.accent : alpha(C.accent, 0.35))
      .font_family(MONO).text_size(13)
      .child(div().flex_none().px(5).rounded(5).bg(C.raised).text_size(10.5).text_color(C.muted).child(short(st.target)))
      .child(div().flex_none().text_color(C.accent).child("❯"))
      .child(Input.new(view.input).flex_1().min_w(0).h(40).text_size(13).font_family(MONO).text_color(C.fg)))
    .child(h_flex().id("tnp-send").size(44).flex_none().justify_center().items_center().rounded(10).bg(C.accent).shadow_md()
      .cursor_pointer().on_click((_e, cx) => send(view, cx))
      .child(pico("arrow-up", 16, C.ink)));
}

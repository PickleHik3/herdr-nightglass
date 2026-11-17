// nightglass-phone: the message composer row (prompt field + send button) of the detail view. Design: design/PhoneConcepts.html
// (Concept B, detail: the composer under the terminal).
//
// The row shows whenever the detail view does: detail.js opens it bound to the terminal that view was opened for, Back closes
// it. Nothing is persisted: the inbox role's init resets it every time the mod loads.
//
// Send target rule (a message once went to a live agent after the active tab had moved): the row is BOUND to the terminal
// it was opened for (address captured at open, shown as "Message tNN" and a tNN chip). A send goes to that address only.
// At send time the active terminal is looked up again; if it is not the bound one, nothing is sent, the text is kept and the
// row turns amber ("tNN is no longer in front, tap to retarget"); the retarget tap binds it to what is in front now (and the
// detail bar follows). Never "whatever is focused". Sending is `hc send <terminal> <text>` (herdr.d.ts: hc): it pastes the
// text and presses Enter, and refuses a terminal that is blocked on a dialog (hc send --help; --force would type anyway);
// that refusal is kept (the inbox card answers dialogs with `hc keys`). After a send the field empties and the row stays.
import { div } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { hc, focused, spaces, panes, notify, shared, setShared } from "herdr";
import { C, MONO, alpha } from "./lib.js";
import { pico, setViewState } from "./phone.js";
import { short } from "./data.js";

const KEY = "nightglass-phone.composer"; // { open, target, ctx, moved? } (not persisted across loads: init resets it)

// The terminal a message goes to: the focused one, else the first terminal of the shown tab.
export function targetTerminal() {
  const f = focused();
  if (f?.terminal) return f.terminal;
  const tab = spaces().find(s => s.active)?.tabs?.find(t => t.active);
  return tab ? panes().find(p => p.tab === tab.id && p.terminal)?.terminal ?? null : null;
}
// What "in front" means: space, tab and terminal.
const ctxKey = () => { const f = focused(); return `${f?.space ?? ""}|${f?.tab ?? ""}|${targetTerminal() ?? ""}`; };

export const composerOpen = () => shared(KEY)?.open === true;
// Open bound to `target` (the terminal the detail view was opened for) / close (Back). Showing the block is detail.js's.
export function openComposer(target) { setShared(KEY, { open: true, target, ctx: ctxKey() }); }
export function closeComposer() { setShared(KEY, { open: false }); }

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
  // The field is not focused on open: on a phone that raises the soft keyboard over the terminal the person came to read.
  // A change of the terminal in front does not close the row (it is the detail view's own row): the send-time check is
  // what keeps a message from going anywhere but the bound terminal.
  cx.timer.every(250, (cx) => {
    const st = shared(KEY);
    if (st?.open) {
      if (view.bound !== st.target) {                       // just opened (or for another terminal): bind, fresh field
        view.bound = st.target;
        if (view.input.value()) view.input.set_value("");
        remake(view, st.target);
        cx.notify();
      }
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
  hc(["send", bound, text]).then((r) => { if (r.code !== 0) fail(r.stderr || r.stdout); }).catch((e) => fail(e?.message ?? e));
}

// Retarget: bind the row to what is in front now, keeping the text; the detail bar shows the new terminal.
function retarget(view, cx) {
  const front = targetTerminal();
  if (!front) return;
  view.bound = front;                                       // so the timer does not read it as a new opening
  remake(view, front);
  setShared(KEY, { open: true, target: front, ctx: ctxKey() });
  setViewState({ view: "detail", address: front });
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

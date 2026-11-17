// nightglass-phone: the detail view (Concept B "Inbox", design/PhoneConcepts.html: detail). "Open" on a card, or a tap on
// any agent row, focuses that terminal and swaps the inbox block for the detail blocks: the slim bar (dbar role: Back,
// agent name, address, Files / Changes), the terminal at full height (layout node "term", the shown tab) and the composer
// (composer.js, bound to that terminal). Files / Changes open a sheet under the terminal (layout column "sheet": this
// mod's head (sheet role) over the app's own `files` / `changes` blocks in the stack "sheet-body"). Back returns to the inbox.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, shared } from "herdr";
import { C, MONO, CLEAR, alpha, ico, mark, machineColor } from "./lib.js";
import { snapshot, short } from "./data.js";
import { pico, detailAddress, setViewState, sheetShown, setSheet, DETAIL_IDS, dismissRows, needsRows } from "./phone.js";
import { openComposer, closeComposer, targetTerminal } from "./composer.js";

// ---- acting on a row (copy of the desktop sidebar's focusRow) ----
export function focusRow(r) {
  if (r.agent) return run("agent.focus", { terminal: r.address });
  if (!r.spaceActive) run("space.select", { id: r.space });
  if (!r.spaceActive || !r.tabActive) run("tab.select", { id: r.tab });
  run("pane.focus", { terminal: r.address });
}

// Open a terminal in the detail view. Opening a finished agent counts as seeing it (it leaves the queue).
export function openDetail(r) {
  if (r.agent && r.kind === "done") dismissRows([r]);
  focusRow(r);
  setViewState({ view: "detail", address: r.address });
  openComposer(r.address);
  // show the detail first, then hide the inbox: the column is never empty in between
  for (const id of DETAIL_IDS) run("layout.show", { id });
  run("layout.hide", { id: "inbox" });
}
// Back (and the load: `init` also hides blocks a crashed run or the saved layout left shown).
export function showInbox(init) {
  setViewState({ view: "inbox", address: null });
  closeComposer();
  setSheet(null);
  run("layout.show", { id: "inbox" });
  for (const id of DETAIL_IDS) run("layout.hide", { id });
  if (init) run("layout.hide", { id: "sheet" });
}

const roundBtn = (id, icon, on, onClick) => h_flex().id(id).size(40).flex_none().relative().justify_center().items_center().rounded(20)
  .bg(on ? C.accent : C.raised).cursor_pointer().on_click(onClick).child(icon);
const mdot = (key) => div().size(8).flex_none().rounded(4).bg(machineColor(key)).border(2).border_color(alpha(machineColor(key), 0.25));

// ---- the slim bar ----
export function renderDbar(view) {
  const snap = snapshot();
  const addr = detailAddress() ?? targetTerminal();
  const r = snap.rows.find(x => x.address === addr) ?? null;
  const n = needsRows(snap, null).length;
  const sheet = sheetShown();
  const changes = shared("nightglass-phone.changes") ?? 0;
  const toggle = (which) => (_e, cx) => { setSheet(sheet === which ? null : which); cx.notify(); };
  return h_flex().id("tnp-dbar").size_full().px(8).child(
    h_flex().w_full().h_full().pl(6).pr(6).gap(8).items_center().rounded(16).bg(C.glass).border(1).border_color(C.rim).shadow_md()
      .child(h_flex().id("tnp-back").h(40).flex_none().pl(4).pr(10).gap(2).items_center().rounded(20).bg(C.raised).cursor_pointer()
        .on_click((_e, cx) => { showInbox(false); cx.notify(); })
        .child(pico("chevron-left", 20, C.fg))
        .child(div().font_medium().text_color(C.fg).child("Inbox"))
        .when(n > 0, el => el.child(h_flex().ml(6).h(18).min_w(18).px(5).justify_center().items_center().rounded(9).bg(C.red)
          .font_family(MONO).text_size(10.5).font_semibold().text_color(C.ink).child(String(n)))))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().font_semibold().text_color(C.fg).child(r?.title ?? (addr ? short(addr) : "No terminal")))
        .when(!!r, el => el.child(h_flex().min_w(0).gap(6).items_center()
          .child(mdot(r.machine))
          .child(div().min_w(0).truncate().font_family(MONO).text_size(10.5).text_color(C.muted)
            .child([r.machineName, r.short, r.branch].filter(Boolean).join(" · "))))))
      .when(!!r, el => el.child(mark(r.kind, 14)))
      .child(roundBtn("tnp-files", ico("folder", 18, sheet === "files" ? C.ink : C.fg), sheet === "files", toggle("files")))
      .child(roundBtn("tnp-changes", ico("changes", 18, sheet === "changes" ? C.ink : C.fg), sheet === "changes", toggle("changes"))
        .when(changes > 0 && sheet !== "changes", el => el.child(div().absolute().top(4).right(3).size(11).rounded(6).bg(C.amber).border(2).border_color(C.glassSolid)))));
}

// ---- the sheet's head: Files | Changes (n), close ----
export function renderSheetHead() {
  const sheet = sheetShown() ?? "files";
  const changes = shared("nightglass-phone.changes") ?? 0;
  const seg = (id, which, icon, label, count) => h_flex().id(id).flex_1().min_w(0).h(40).gap(6).justify_center().items_center().rounded(11)
    .bg(sheet === which ? C.raisedHi : CLEAR).when(sheet === which, el => el.shadow_md())
    .font_medium().text_color(sheet === which ? C.fg : C.muted).cursor_pointer()
    .on_click((_e, cx) => { setSheet(which); cx.notify(); })
    .child(ico(icon, 15, sheet === which ? C.fg : C.muted)).child(div().child(label))
    .when(count != null, el => el.child(div().px(6).rounded(8).bg(C.raised).font_family(MONO).text_size(10.5).text_color(C.fg).child(String(count))));
  return h_flex().id("tnp-sheethead").size_full().pb(6).gap(8).items_center()
    .child(h_flex().flex_1().min_w(0).h(46).p(3).rounded(14).bg(C.well).border(1).border_color(C.rim)
      .child(seg("tnp-sheet-files", "files", "folder", "Files", null))
      .child(seg("tnp-sheet-changes", "changes", "changes", "Changes", changes)))
    .child(roundBtn("tnp-sheet-close", ico("win-close", 12, C.fg), false, (_e, cx) => { setSheet(null); cx.notify(); }));
}

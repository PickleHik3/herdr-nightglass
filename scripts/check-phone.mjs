// Static checks for the phone bundle (no Herdr needed): node scripts/check-phone.mjs
//  - every .js of mods/tokyo-night-phone parses as an ES module (node --check)
//  - relative imports resolve inside the folder and export what is imported
//  - names imported from gpui-kit / gpui-base are declared in mods/tokyo-night/gpui-kit.d.ts, and from
//    "herdr" in herdr.d.ts (set HERDR_DTS=<path to the app's herdr.d.ts>; skipped when unset)
//  - every builder method called is declared in the d.ts files
//  - lib.js and data.js are still byte-identical copies of the desktop mod's
//  - the layout parses, names only this mod, every role has a case in main.js, node ids the mod uses exist
//  - APIs the phone mod uses that the desktop mod does not use are listed; each must be in PROVEN below (proven by
//    `herdr-app check` on app 0.1.13, see scripts/stage-role-checks.mjs) or the run fails. Names known to be absent
//    from 0.1.13 (ABSENT_013) fail at once, even though the repo's newer gpui-kit.d.ts declares them.
//  - every icon the mod draws exists (ico -> the desktop mod's folder, pico/ring-s -> the phone's own)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PHONE = join(ROOT, "mods/tokyo-night-phone");
const DESK = join(ROOT, "mods/tokyo-night");
// The repo's gpui-kit.d.ts comes from a newer app (0.1.15) than the store ships (0.1.13); GPUI_KIT_DTS may point at a
// 0.1.13 one (`herdr-app types <mod>` on the phone writes it).
const kit = readFileSync(process.env.GPUI_KIT_DTS ?? join(DESK, "gpui-kit.d.ts"), "utf8");
// Declared by the 0.1.15 typings, missing from 0.1.13 (diff of both d.ts files).
const ABSENT_013 = new Set(["ScrollHandle", "scroll_to_item"]);
// Used by the phone mod, not by the desktop mod, and built without error by `herdr-app check` on 0.1.13
// (14 staged role checks, scripts/stage-role-checks.mjs: they run init() and render() with fixtures).
const PROVEN = new Set(["mb", "max_h", "settings", "Input", "InputState", "new", "on", "overflow_x_scroll", "overflow_y_scroll", "line_height", "self_center"]);
// Phone-only, but only reached inside event handlers / timers, which `check` does not run. Taken from the
// 0.1.13 typings instead (gpui-kit.d.ts InputState: set_value, value, release; herdr.d.ts: hc).
// Round 8 (no phone available): on_scroll_wheel (rendered, but not yet run through `check`), focus (timer only).
const TYPED_ONLY = new Set(["set_value", "value", "release", "hc", "on_scroll_wheel", "focus"]);
const herdr = process.env.HERDR_DTS ? readFileSync(process.env.HERDR_DTS, "utf8") : null;
let fails = 0;
const bad = (m) => { fails++; console.log("FAIL", m); };

const jsFiles = readdirSync(PHONE).filter((f) => f.endsWith(".js"));
const mods = Object.fromEntries(jsFiles.map((f) => [f, readFileSync(join(PHONE, f), "utf8")]));

for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: mods[f], encoding: "utf8" });
  if (r.status !== 0) bad(`${f}: syntax: ${r.stderr}`); else console.log(`node --check OK  ${f}`);
}

const exportsOf = (src) => new Set([...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|default class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
const block = (name) => { const i = kit.indexOf(`declare module "${name}"`); const j = kit.indexOf("\ndeclare module", i + 10); return kit.slice(i, j < 0 ? undefined : j); };
const declared = { "gpui-kit": block("gpui-kit"), "gpui-base": block("gpui-base"), herdr };
const has = (mod, n) => new RegExp(`(?:function|const|class|interface|type)\\s+${n}\\b`).test(declared[mod]);

let nImports = 0, skipped = 0;
for (const [f, src] of Object.entries(mods)) {
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const from = m[2];
    for (const n of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      nImports++;
      if (from.startsWith("./")) {
        const t = from.slice(2);
        if (!mods[t]) bad(`${f}: ${from} does not exist`);
        else if (!exportsOf(mods[t]).has(n)) bad(`${f}: ${n} is not exported by ${from}`);
      } else if (from === "herdr" && !herdr) skipped++;
      else if (declared[from]) { if (!has(from, n)) bad(`${f}: ${n} not declared in ${from}`); }
      else bad(`${f}: unknown module ${from}`);
    }
  }
}
console.log(`imports checked: ${nImports}${skipped ? ` (${skipped} from "herdr" skipped: set HERDR_DTS)` : ""}`);

const JS = new Set(["map", "filter", "find", "findIndex", "some", "every", "slice", "join", "split", "push", "pop", "sort", "reduce", "test", "trim", "toString", "toFixed", "replace", "padStart", "startsWith", "includes", "get", "set", "has", "then", "catch", "now", "abs", "min", "max", "round", "floor", "sin", "cos", "keys", "entries", "parse", "stringify", "toUpperCase", "forEach", "indexOf", "getItem", "setItem", "from", "sort", "localeCompare", "charCodeAt", "slice", "matchAll", "all", "add", "delete"]);
const local = new Set(["openKey", "setOpen", "goMachine", "lastSpaces", "watchFocus", "applyScheme", "pollStats", "renderRole", "renderWatch", "init", "close", "render"]);
const text = kit + (herdr ?? "");
const used = new Map();
const exportsAll = new Set(Object.values(mods).flatMap((src) => [...exportsOf(src)]));
for (const [f, src] of Object.entries(mods)) {
  const body = src.replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const m of body.matchAll(/\.([a-z_][a-z0-9_]*)\s*\(/g)) {
    if (JS.has(m[1]) || local.has(m[1])) continue;
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(f);
  }
}
let missing = 0;
for (const [n, fs] of [...used].sort()) {
  if (!new RegExp(`\\b${n}\\s*(?:<[^>]*>)?\\s*\\(`).test(text) && !new RegExp(`\\b${n}\\s*:`).test(text)) { bad(`method .${n}() not in the d.ts files (${[...fs].join(", ")})`); missing++; }
}
console.log(`distinct builder/API methods checked: ${used.size}, missing: ${missing}`);

// --- API surface: phone-only names must be proven; names absent from 0.1.13 fail ---
const deskSrc = readdirSync(DESK).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(DESK, f), "utf8")).join("\n");
const strip = (src) => src.replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""');
const namesOf = (src) => {
  const body = strip(src), out = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(gpui-kit|gpui-base|herdr)"/g)) for (const n of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) out.add(n);
  for (const m of body.matchAll(/\.([a-z_][a-z0-9_]*)\s*\(/g)) out.add(m[1]);
  return out;
};
const deskNames = namesOf(deskSrc);
const extra = new Map();
for (const [f, src] of Object.entries(mods)) for (const n of namesOf(src)) {
  if (ABSENT_013.has(n)) { bad(`${f}: ${n} is not in herdr-app 0.1.13 (only in the newer d.ts)`); continue; }
  if (!deskNames.has(n) && !JS.has(n) && !local.has(n) && /^[A-Za-z_]/.test(n)) { if (!extra.has(n)) extra.set(n, new Set()); extra.get(n).add(f); }
}
const phoneApi = [...extra].filter(([n]) => !(exportsAll.has(n)));
for (const [n, fs] of phoneApi) if (!PROVEN.has(n) && !TYPED_ONLY.has(n)) bad(`${n} (${[...fs].join(", ")}) is not used by the desktop mod and not in PROVEN: run scripts/stage-role-checks.mjs through herdr-app check on 0.1.13, then add it`);
console.log(`phone-only API names (not used by the desktop mod): ${phoneApi.map(([n]) => n).sort().join(", ")}; typed-only (not run by check): ${[...TYPED_ONLY].join(", ")}`);

// --- theme tokens: every C.<name> the phone reads must be one lib.js's build() provides (Glass renamed/removed several) ---
{
  const lib = readFileSync(join(PHONE, "lib.js"), "utf8");
  const fn = lib.slice(lib.indexOf("function build(t)"), lib.indexOf("let sig = null"));
  const have = new Set([...fn.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]));
  for (const m of lib.matchAll(/export const LIT = \{([^}]*)\}/g)) for (const k of m[1].matchAll(/(\w+)\s*:/g)) have.add(k[1]);
  const used = new Set();
  for (const [f, src] of Object.entries(mods)) {
    if (f === "lib.js") continue;
    for (const m of src.replace(/\/\/.*$/gm, "").matchAll(/\bC\.([A-Za-z_]\w*)/g)) { used.add(m[1]); if (!have.has(m[1])) bad(`${f}: C.${m[1]} is not a token of lib.js build()`); }
  }
  console.log(`theme tokens used: ${[...used].sort().join(", ")}`);
}

for (const f of ["lib.js", "data.js"]) {
  if (readFileSync(join(PHONE, f), "utf8") !== readFileSync(join(DESK, f), "utf8")) bad(`${f} differs from the desktop copy (re-sync: cp mods/tokyo-night/${f} mods/tokyo-night-phone/)`);
}
console.log("lib.js, data.js: identical to the desktop mod's");

const layout = JSON.parse(readFileSync(join(ROOT, "layouts/tokyo-night-phone.json"), "utf8"));
console.log("layout JSON: valid");
const roles = new Set(), ids = [];
const walk = (n) => {
  ids.push(n.id);
  if (n.content?.mod) { if (n.content.mod !== "tokyo-night-phone") bad(`layout names mod ${n.content.mod}`); roles.add(n.content.props?.role); }
  (n.children ?? []).forEach(walk);
};
walk(layout);
for (const r of roles) if (!new RegExp(`case "${r}"`).test(mods["main.js"])) bad(`role ${r} has no case in main.js`);
for (const r of ["usage", "stats", "colors"]) if (!new RegExp(`case "${r}"`).test(mods["main.js"])) bad(`popup role ${r} has no case`);
if (new Set(ids).size !== ids.length) bad("duplicate node ids");
const refs = new Set();
for (const src of Object.values(mods)) for (const m of src.matchAll(/(?:\{\s*id:\s*"([^"]+)"|nodePx\("([^"]+)"\)|findNode\([^,]+,\s*"([^"]+)"\))/g)) refs.add(m[1] ?? m[2] ?? m[3]);
for (const r of refs) if (!ids.includes(r)) bad(`mod references layout node ${r}, not in the layout`);
for (const old of ["sidebar", "panel", "panel-body", "work-body", "main-stack"]) {
  for (const [f, src] of Object.entries(mods)) if (new RegExp(`["'\`]${old}["'\`]`).test(src) && !["lib.js", "data.js"].includes(f)) bad(`${f} names desktop node ${old}`);
}
console.log("layout roles:", [...roles].join(", "), "| node ids:", ids.join(", "), "| referenced:", [...refs].join(", "));

// icons: ico("x") loads mods/tokyo-night/x.svg (lib.js M), pico("x") mods/tokyo-night-phone/x.svg
let nIcons = 0;
for (const [f, src] of Object.entries(mods)) {
  for (const m of src.matchAll(/\bico\("([a-z-]+)"/g)) { nIcons++; if (!existsSync(join(DESK, `${m[1]}.svg`))) bad(`${f}: ico ${m[1]}.svg missing in the desktop mod`); }
  for (const m of src.matchAll(/\bpico\("([a-z-]+)"/g)) { nIcons++; if (!existsSync(join(PHONE, `${m[1]}.svg`))) bad(`${f}: pico ${m[1]}.svg missing in the phone mod`); }
  for (const m of src.matchAll(/item\("[^"]+", "([a-z-]+)", "/g)) { nIcons++; if (!existsSync(join(DESK, `${m[1]}.svg`))) bad(`${f}: menu icon ${m[1]}.svg missing`); }
  for (const m of src.matchAll(/"(monitor|server)"/g)) { if (!existsSync(join(DESK, `${m[1]}.svg`))) bad(`${m[1]}.svg missing`); }
}
for (const n of ["herdr.png"]) if (!existsSync(join(DESK, n))) bad(`${n} missing in the desktop mod`);
for (const k of ["w", "h"]) for (let p = 5; p <= 100; p += 5) {
  if (!existsSync(join(PHONE, `ring-s-${k}-${p}.svg`))) bad(`ring-s-${k}-${p}.svg missing`);
  if (!existsSync(join(DESK, `ring-${k}-${p}.svg`))) bad(`desktop ring-${k}-${p}.svg missing`);
}
if (!existsSync(join(PHONE, "ring-s-track.svg")) || !existsSync(join(DESK, "ring-track.svg"))) bad("ring track missing");
console.log(`icon references checked: ${nIcons}; ring arcs: phone ring-s-*, desktop ring-*`);
// --- structure (round 9: compact strip, stats widget in the bar, toggled panel, no popup menu) ---
{
  const all = Object.entries(mods).filter(([f]) => !["lib.js", "data.js"].includes(f));
  const flat = []; const order = (n) => { flat.push(n); (n.children ?? []).forEach(order); }; order(layout);
  const idx = (id) => flat.findIndex((n) => n.id === id);
  const node = (id) => flat[idx(id)];
  // no stats row at the bottom: the panel sits under the top bar, nothing of the mod follows the composer, no bottom stats box
  if (!(idx("topbar") < idx("drawer") && idx("drawer") < idx("strip") && idx("strip") < idx("tabs") && idx("tabs") < idx("term") && idx("term") < idx("composer"))) bad("rows must run topbar, panel (drawer), strip, tabs, term, composer");
  if (idx("composer") !== flat.findLastIndex((n) => n.content?.mod && n.id !== "watch")) bad("a mod block follows the composer: no bottom row is allowed");
  if (/id\("tnp-stats"\)/.test(mods["drawer.js"]) || /diskFreeText|STATS_SCRIPT/.test(mods["drawer.js"])) bad("drawer.js still draws a stats row");
  console.log("no stats row at the bottom: ok");
  // no popup menu
  for (const [f, src] of all) if (/role:\s*"menu"|case "menu"|renderNewMenu|menuHeight|nm-space|tnp-menu-pop/.test(src)) bad(`${f}: popup menu code is still there`);
  if (roles.has("menu")) bad("layout has a menu role");
  if (/closeOverlay|openOverlay/.test(mods["newmenu.js"])) bad("newmenu.js opens or closes overlays: its actions are in-flow");
  console.log("no popup menu: ok");
  // panel: hidden by default, closed at load, never hidden for the keyboard
  if (node("drawer")?.hidden !== true) bad("layout: the panel (drawer) must be hidden by default");
  if (!/setPanel\(false, true\)/.test(mods["main.js"])) bad("main.js: the top bar must close the panel at load");
  for (const [f, src] of all) if (/HIDE_BELOW|SHOW_AT|evalDrawer|WIN\.dropped/.test(src)) bad(`${f}: keyboard-up hiding of the panel is still there`);
  for (const [f, src] of all) if (f !== "phone.js" && /layout\.(hide|show)["'`]?\s*:|"layout\.(hide|show)"|\? "layout\.show" : "layout\.hide"/.test(src.replace(/\/\/.*$/gm, "")) && /id:\s*"drawer"/.test(src)) bad(`${f}: shows / hides the panel outside setPanel`);
  console.log("panel hidden by default, present with the keyboard up (no window-height hiding): ok");
  // handle (round 10): last row of the panel, only while it is open; a tap toggles normal / full; closing / opening resets to normal
  {
    const d = mods["drawer.js"], ph = mods["phone.js"];
    if (!/\.when\(panelOpen\(\), el => el\.child\(h_flex\(\)\.id\("tnp-handle"\)/.test(d)) bad("drawer.js: the handle must be drawn only while the panel is open");
    if (d.indexOf("tnp-handle") < d.indexOf("tnp-spaces")) bad("drawer.js: the handle must come after the list (last row)");
    if (!/setPanelFull\(!panelFull\(\)\)/.test(d)) bad("drawer.js: a tap on the handle must toggle full");
    if (!/for \(const id of \["strip", "tabs", "term", "composer"\]\) run\("layout\.hide"/.test(ph)) bad("phone.js: full must hide strip, tabs, term and composer");
    if (!/setShared\(FULL_KEY, false\);\s*\n\s*if \(wasFull \|\| init\) restoreRows/.test(ph)) bad("phone.js: setPanel must return to normal size and restore the rows");
    if (!/panelFull\(\)\) return;/.test(mods["strip.js"])) bad("strip.js: stripSync must not re-show the strip while the panel is full");
    if (/on_mouse_up|on_drag/.test(d)) bad("drawer.js: drag is not used (tap only)");
    console.log("panel handle: present only while open, tap toggles full, closing restores rows: ok");
  }
  // strip: hidden by default and hidden whenever there is nothing to show; no quiet capsule row
  if (node("strip")?.hidden !== true) bad("layout: the strip must be hidden by default");
  if (!/px === 0\) \{ if \(!hidden\) run\("layout\.hide", \{ id: "strip" \}\)/.test(mods["strip.js"])) bad("strip.js: stripSync must hide the block when there is nothing to show");
  if (/Nothing needs you|QUIET/.test(mods["strip.js"])) bad("strip.js: the quiet capsule row is still there");
  if (!/CHIP = 28/.test(mods["strip.js"])) bad("strip.js: chips are 28 px");
  console.log("strip row absent without items: ok");
  // top bar order and fit: app, search, flexible gap, stats, usage, toggle
  const top = mods["topbar.js"];
  const pos = ["ico(\"logo\"", "id(\"tnp-search\")", "flex_1().min_w(0))", "id(\"tnp-stats\")", "id(\"tnp-rings\")", "id(\"tnp-menu\")"].map((s) => top.indexOf(s));
  if (pos.some((p) => p < 0) || pos.some((p, i) => i && p <= pos[i - 1])) bad("topbar.js: order must be app, search, flexible gap, stats, usage, panel toggle");
  const bw = 12 + 32 + 40 + 40 + 8 + 5 * 4 + 68 + 8; // fixed part of the bar, designed px (see topbar.js)
  if (bw + 122 > 412) bad(`topbar: fixed part ${bw} leaves no room for usage wells in 412 px`);
  console.log(`top bar order ok; fixed width ${bw} of 412 (usage wells and the gap take the rest)`);
}

console.log(fails ? `${fails} FAILURE(S)` : "ALL STATIC CHECKS PASSED");
process.exit(fails ? 1 : 0);

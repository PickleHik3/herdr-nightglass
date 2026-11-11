# Glass — handoff spec for the nightglass mod

The approved look for the mod. This file is the brief for whoever implements it; nothing in
`mods/`, `layouts/` or `themes/` has been changed yet.

- **Visual source:** `design/Main.dc.html` (the full window, All view). Open it on the design
  canvas "herdr macOS Redesign", or read its inline styles: every colour, size and radius below
  is literal in that file.
- **Wallpaper:** `design/wallpaper.svg` (1600×1000).
- **Other canvas files, for reference only:** `design/canvas.json` (the canvas index),
  `design/DirB.dc.html` (a small Glass sample; it has no wallpaper art),
  `design/States.dc.html` (attention states, still in an earlier flat grey palette — use its
  structure, take colours from this file), `design/DirA/C/D.dc.html` (directions not chosen).
- **Not verified:** the design was never run in the app. Items marked **Check** below are
  assumptions about the kit or the layout that the implementer has to confirm first.

## What must not change

Layout, order and behaviour stay exactly as they are: window buttons on the right, header order
(search, Files, Changes, settings, min/max/close), machine tiles three per row, machine cards with
capsules inside, the two floating sidebar boxes (list box, widgets box), per-machine colours.
This is a restyle only.

## The idea in four rules

1. **One wallpaper behind everything**, a single even tone with sparse line art. No colour glows.
2. **Three surface tones, two text tones.** Do not add in-between greys.
3. **One outline per stack.** The machine card has the coloured outline; capsules, rows, tiles,
   tags and buttons inside have no border, only fill.
4. **Flat fills only.** No sheen or whitewash gradients on surfaces. Depth comes from the rim,
   the shadow preset and the wallpaper showing through.

## Tokens

8-digit hex is what `alpha()` in `lib.js` produces.

| Token | Value | Used for |
|---|---|---|
| wallpaper base | `#0e1016` | window background under the wallpaper art |
| glass | `#0c0d12` at 72% (`#0c0d12b8`) | list box, widgets box, status pill, pane, popups |
| raised | white at 9% (`#ffffff17`) | unselected tiles, capsules, id tags, active tab, keycap, New button, ring tracks, hover |
| well | black at 38% (`#00000061`) | search pill, tab track, usage wells, bar tracks |
| rim | white at 10% (`#ffffff1a`) | 1px border on every glass surface, hairlines |
| text primary | `#eceef2` | titles, names, values, stats bar fill |
| text secondary | `#a8adba` | meta, times, summaries, icons, inactive tabs |
| ink | `#0f1012` | text on a solid colour fill |
| accent (All view) | `#e6e7eb` | brand tile, New icon; All tile selected = white 14% fill + white 40% border |
| working | `#5fd38d` | status dot, finished check, "nothing needs you" icon |
| waiting | `#f0708a` | status mark, waiting tints |
| warn | `#e0af68` | rings and bars from 60%; `waiting` colour from 85% |

Machine colours (the swatches a person picks from), retuned:
teal `#4fd1b8`, rose `#f0708a`, blue `#6e9bff`. The other swatches in `SCHEMES` keep their hue;
tune them to the same lightness as these three.

Derived from a machine colour `c`:

| Use | Value |
|---|---|
| machine card fill | `c` at 9% |
| machine card border | `c` at 36% |
| tile icon chip | `c` at 16%, icon in `c` |
| focused row fill | `c` solid |
| focused row title | a near-black of the hue (teal: `#04211c`) |
| focused row sub and time | a dark of the hue (teal: `#0b4239`) |
| focused row id tag | fill = the title colour, text = a light of the hue (teal: `#7deedb`) |
| pane header id tag | `c` solid, text `ink` |

Space initial tiles, branch names and stats bars are neutral (`raised` fill, secondary or
primary text). The per-space badge colours (`BADGES`) are no longer used in the sidebar.

## Shape and size

| Element | Radius | Size |
|---|---|---|
| sidebar boxes | 16 | padding 10, gap 8 between the two boxes, 8 from the window edge |
| machine tile | 10 | 58 high, width as computed today |
| machine card | 12 | padding 4, gap 4; header 26 high |
| capsule | 9 | padding 3, gap 1; header 28 high, initial tile 20 (radius 6) |
| terminal row | 6 | 30 high; focused row 42 high with a mono sub line |
| id tag | 5 | mono 10.5, padding 1×6 |
| New space | 9 | 28 high, no border, secondary text |
| search pill | 15 | 30 high, `well` fill, `rim` border |
| header buttons | 8 | 28 high, no border or fill at rest |
| tab track | 10 | padding 2; tabs 26 high, radius 8 |
| status pill | 13 | 26 high, `glass` + `rim` |
| pane | 12 | header 34 high, same fill as the pane, `rim` hairline under it |
| usage well | 10 | 34 high; rings 22 px, stroke 2.4 |
| stats bar | 2 | 4 high, `well` track, primary-text fill, text column 76 wide |

Concentric rule: a child's radius is its parent's radius minus the parent's padding
(16 → 12 → 9 → 6).

## Shadows (kit presets only)

| Element | Preset |
|---|---|
| sidebar boxes, pane | `shadow_2xl` |
| popups, toast | `shadow_xl` |
| focused row, active tab, selected tile | `shadow_md` |
| everything else | none |

## Type

Inter for all labels, JetBrains Mono only for terminal ids, branch names and numbers.

| Use | Size / weight |
|---|---|
| brand "herdr" | 14 / 600 |
| names (machine, space, pane title) | 12 / 600 |
| row titles, buttons | 12 / 400, focused or active 500–600 |
| meta, times, summaries | 11 / 400 |
| mono | 10.5 (ids, branches, values) |

Machine names are no longer upper-cased; summaries are Inter, not mono.

## Component notes

- **Usage row:** one `well` per tool. The wells share the row by ring count (Claude with four
  rings takes about 4 parts, Codex with one about 1.6), every ring gets an equal slot inside its
  well. Outer ring = week in the accent, inner = 5-hour in teal; warn and waiting colours by
  `level()` as today.
- **Stats:** header row (machine icon, name, uptime in mono), then icon, bar, fixed text column.
- **Active tab:** `raised` fill on the `well` track. If it reads too faint in the app, this is the
  one place a stronger tint (white 14%) is allowed.
- **Attention states** (not redrawn in Glass; apply the same rules):
  - waiting capsule or strip card: `waiting` at about 16% over glass, border `waiting` at 45%,
    `shadow_md`; the waiting row inside gets `waiting` at 20%.
  - finished capsule or card: `working` at about 10%, border `working` at 35%.
  - toast: `glass` + `rim`, radius 14, `shadow_xl`.
- **Not drawn at all — follow the rules above:** collapsed rail, New menu and agent flyout,
  colour picker, spaces popup, expanded usage panel, Files/Changes on-state, offline machines,
  hover states. Popups are `glass` + `rim` + `shadow_xl`, radius 12; hover is the `raised` tint;
  an on-state button is `raised` fill with primary text.

## Check before building

1. **Wallpaper placement.** Something has to draw an image behind the whole layout, and the
   layout's own backgrounds (`"background": "canvas"` and `"chrome"` in
   `layouts/nightglass.json`) have to let it show. The Snow Leopard mod draws a wallpaper
   (`mods/snowleopard/desk.js`, `img/aurora.jpg` in `attractify-logan/herdr-snowleopard`); use it
   as the reference for how.
2. **SVG as an image.** `wallpaper.svg` uses a `<pattern>` for the dot grid. If `image()` does not
   render that, rasterise it to PNG or JPG at the largest window size and scale it to cover.
3. **Translucent fills over an image.** Glass depends on 8-digit hex fills compositing over the
   wallpaper. If they do not, fall back to the opaque equivalents: glass `#0d0e14`, raised
   `#22242a`, well `#08090c`.
4. **Terminal translucency.** The pane is glass in the design. `terminal_opacity` exists in the
   layout file but was not tested. An opaque terminal (`#0d0e14`) is an acceptable result.
5. **Per-machine themes.** `themes/*.json` (from `scripts/gen-themes.py`) currently tint the whole
   window per machine. In Glass the neutral tokens are identical in every scheme; a scheme only
   changes the accent and the terminal's ANSI colours. Regenerate the themes on the neutral base.
6. **No blur.** The kit has no background blur; do not try to fake frosting.

## Explicitly rejected along the way

Pure-gradient or two-colour wallpapers, milky top-to-bottom sheens on surfaces, the Tokyo Night
navy/lavender palette for chrome, moving the window buttons or any other layout change.

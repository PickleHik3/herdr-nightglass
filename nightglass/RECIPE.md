# Nightglass

A dark "glass" Herdr window for people who run agents on several machines. A wallpaper (near-black `#0e1016` with faint dot grid, three arcs and a diagonal line, 2560x1600) sits behind everything; the sidebar, status strip and pane headers are half-transparent glass boxes over it, the terminal is 82% opaque, and the whole window is tinted by the colour you gave the machine you are looking at. The left sidebar lists machines, their spaces and every agent with its status; a strip above the terminal says what needs you, and a Board shows every agent in four columns.

![Nightglass](preview.png)

## What you see

Window: `titlebar: none`, 8 px padding and 8 px gaps everywhere, wallpaper `mods/nightglass/wallpaper.png` (`cover`). UI font Inter, terminal font JetBrains Mono, size 13 (neither is bundled). Terminal padding 14 px vertical, 22 px horizontal, terminal opacity 0.82. Base theme `nightglass`: canvas `#0e1016`, chrome `#0c0d12`, surface `#0d0e13`, text `#eceef2`, muted `#a8adba`, accent `#e6e7eb`, working/done `#5fd38d`, blocked `#f0708a`, amber `#e0af68`, teal `#4fd1b8`.

Left to right:

1. **Sidebar**, 268 px (resizable 56 to 480), two floating glass boxes (fill `#0c0d12` at 50%, 16 px radius, 1 px rim, shadow) with an 8 px gap.
   - Top box: a 28 px brand row (22 px accent square with the logo, "herdr" 14 px semibold, a `+` button, a collapse button); machine tiles, 58 px high, "All" first then one per machine, at most 3 per row and spread evenly (4 tiles make 2 x 2), each with a 24 px icon (monitor for "This computer", server otherwise), its name at 11 px and a status light in the corner; below, a scrolling list for the open machine: a title row (name and a summary such as `2 working · 1 idle`), one capsule per space (28 px header with a 20 px initial, name, git branch in 10.5 px mono) and inside each capsule one row per terminal (30 px; 42 px when it is the focused row and has a "now" line). A row shows a status mark, the title, elapsed time (`<1m`, `12m`, `1h05m`, `2d3h`), and a terminal-number chip (`t3`). Last in the list: "New space on <machine>".
   - Bottom box (the dock): the open machine's name with `ssh` and uptime (`up 3d`), then three 16 px bars, cpu (`37% · 8c`), ram (`20.3/63 GB`), disk (`881 GB free`), bar fill white, amber from 60%, red from 85%.
   - Under 160 px wide the sidebar becomes a rail: logo, `+`, an All button and one 40 px button per machine, and an expand button.
2. **Work column**, top to bottom:
   - Header, 38 px, window-drag area: a search pill centred on the window (30 px high, 15 px radius, max 440 px) reading `Jump to an agent, t1, or a command` with the palette's key label on its right; on the right a Files button, a Changes button (amber `+N` when the focused folder has N changed files), a settings icon (28 px) and, only when the window has its own buttons, minimise, maximise and close (30 x 28 px, close turns red on hover).
   - Strip: a fixed 82 px block that never changes height with the number of agents waiting. A 40 px tab row: a 30 px well holding the Board pill first (only when the layout has a `board` node; the board icon, "Board" and a red count of waiting agents), a 1 px divider, then the tab pills (26 px high) and a `+` button. Then an 8 px gap and one 34 px glass bar (12 px radius): "Nothing needs you" with a green check, or "Needs you N" (red count) and "Done N" (green count) followed by one chip per waiting or finished agent (26 px pill, tinted red or green: status mark, title, time, terminal-number chip; waiting first, then the most recent; scrolls sideways), and on the right, once, "N working · M idle" (reachable machines only). While the board shows the strip is the 40 px tab row alone.
   - Main: the terminal pane (12 px radius, 1 px border, `#ffffff40` focus border) with a 34 px header, or, in its place, the Board (below), and, at the right, a 368 px column (280 to 900) that is hidden until you open Files or Changes.

Board, in the main stack in place of the terminals, 8 px gaps: a 30 px row of machine filter chips (26 px pills: "All", then each machine that has agents, with its glyph, its agent count and a 6 px red dot while one there waits), then four equal columns (glass fill, 12 px radius, 1 px rim; each scrolls on its own) headed by a status mark, the name in 11 px mono capitals and a count: Needs you (red; the count chip is red when above 0), Working (green), Done (teal `#4fd1b8`), Idle (idle grey). An empty column says "None" ("Nothing needs you" for the first). A card (10 px radius, 3 px bar in the column colour; waiting cards tinted red) holds: the machine glyph (18 px), the machine name, the space and the time (`waiting 12m`, `12m`, `done 3m ago`, `idle 2h`); the title (13 px semibold); for a waiting agent an "ASKS YOU" box with the question (while it is not read: the agent's last report, else "reading its screen…"); for the others its last report; `branch · folder` in mono; then a 26 px button row, `Answer` (waiting, filled) or `Open`, `Dismiss` on Done cards, and at the right the program icon and the terminal chip. The Done column header has `Dismiss all` when it holds more than one card. Agents of an unreachable machine are drawn at 60% opacity in their last known state.

Machine glyph: the machine's icon (a monitor for this computer, a server otherwise) in its colour on a tile of the same colour at 18%. It is the one machine mark on sidebar tiles, board cards and filter chips; status keeps its own marks.

Machine colours (eight schemes, each a theme): Blue `#6e9bff`, Frost `#52c6f0`, Teal `#4fd1b8`, Forest `#86d46a`, Dune `#e5b45c`, Ember `#f58f5c`, Rose `#f0708a`, Aurora `#a98bf5`. A machine with no pick is Blue. The All view uses the neutral `nightglass-storm`.

## How it behaves

Status marks (10 px slot) on rows, tabs and cards:
- waiting (the agent is blocked on you): 7 px red `#f0708a` square, pulsing opacity 0.3 to 1 every 1 s for 10 s after something starts waiting, then solid; its row has a 20% red fill; its space capsule turns red-tinted with a red outline.
- working: 6 px green dot, static.
- done: green check.
- idle: 8 px hollow ring in the muted colour.
- offline machine: a 7 x 2 px bar, the tile at 62% opacity, a wifi-off icon, "last seen 4m" on its capsules, and an amber note under the machine tiles: "<name> is unreachable" and "their N agents show the last known state", with an x that hides it until the set of unreachable machines changes (kept in the shared key `nightglass.offlineDismissed`). Their agents keep their last known state, drawn dimmed.

Clicks and hovers:
- Click a machine tile: shows that machine's spaces and selects the space last visited there (or the empty view "No spaces on <machine>" with a "New space" button). Click All: a card per machine (tinted in its colour) with all its spaces. Right-click a tile: a popup of the eight colour swatches; the pick is stored under the shared key `nightglass.colors`.
- Focused row: solid machine colour, dark text, semibold. Click a row: `agent.focus` for agents, otherwise `space.select`, `tab.select`, `pane.focus`. Right-click a row: the shipped `menu` popup for that pane. Rows keep a fixed height (30 px; 42 px for the focused row and for a waiting row, which show the "now" line); elsewhere the "now" line is the row's tooltip (hidden while the pointer is over the close button). Hover a row: a 30 px red close button laid over the row's right end fades in (opacity, 120 ms ease-out, no delay; 90 ms out) while the terminal chip under it fades out, and runs `pane.close` (or `terminal.kill`); hovering a space header does the same with the branch under it, for `space.close`. Nothing moves on hover.
- The window takes the focused space's machine theme (checked every 500 ms, `app.theme`). Focus moving to another machine (through a card or the palette) switches the sidebar to it.
- `+` opens a popup listing each connected machine with New space (`space.new`), New terminal tab (`tab.new`) and Agent, whose flyout lists the agents installed on that machine (`tab.new` or `space.new` with that agent's argv). The collapse button runs `layout.resize` sidebar to 56 px, expand to 268.
- Strip chips: click opens the agent (`agent.focus`); waiting chips first, then by time; hovering shows where it runs and its last report. The bar counts waiting and done agents. Tab pills: click `tab.select`; each has a muted x, red under the pointer (`tab.close`); `+` is `tab.new`. The Board pill toggles the board (`layout.select` of `main-stack` to `board` or `main`); picking a tab (the active one too), a sidebar row, a chip or any focus change while the board shows goes back to the terminals.
- Board: Answer and Open run `agent.focus` and go back to the terminals; clicking the card does the same. Dismiss moves a finished agent to Idle until it finishes again; Dismiss all does it for every Done card shown. Dismissals are kept in the shared key `nightglass.dismissed`. A filter chip shows one machine's agents. For waiting agents (at most 8) the question is read with `hc read <terminal>` every 5 s while the board shows: the lowest line of the screen that ends in "?" (box-drawing and prompt marks trimmed, 200 characters at most). Timers redraw every 30 s.
- Popups (New, agents, spaces, colours) and toasts ease in: opacity over 160 ms and a drop of 4 px (a 6 px lift for toasts) over 200 ms.
- Zoom: when the layout's sidebar role starts, it puts back the zoom the phone layout's `fit_zoom` recorded in the shared key `nightglass-phone.zoomBefore` (`app.zoom_in` / `app.zoom_out`, one 0.1 step each); `layout-cycle` does the same when it leaves the phone layout.
- Header: the search pill runs `app.palette`; Files and Changes toggle the right column (clicking the active one hides it, `layout.select` + `layout.show` / `layout.hide`). Which one is open is remembered per space. The settings icon runs `app.settings`.
- Pane header: status mark, title, a chip with the terminal number in the machine colour (click copies it with `wl-copy`, `xclip` or `clip.exe`), machine name, program icon and name, and a `...` button opening the shipped `menu` popup.
- Stats: for the open machine only, while the sidebar is 160 px or wider; every 15 s (a first read within 3 s; 60 s retry after a failure); until the first answer the dock says "reading..." and after a failure "stats unavailable".
- Usage (off unless enabled, see Watch out): one 34 px well per tool with 22 px double rings (outer = weekly, accent colour; inner = 5-hour, teal `#4fd1b8`; amber from 60%, red from 85%); click expands a list of accounts (62 px rows, 30 px rings, reset times) above the wells.

## Built from

`layouts/nightglass.json`: a root row with keys `toast: "nightglass-toast"`, `theme: "nightglass"`, `background`, `padding: 8`, `gap: 8`, `terminal_padding: [14, 22]`, `terminal_opacity: 0.82`, `traffic_lights: [20, 22]`, `preview: "layouts/nightglass.svg"`, `ui_font`, `font`, `font_size`. Children: block `sidebar` (268 px, min 56, max 480, mod `nightglass`, `props.role: "sidebar"`) and a column `work` (not resizable) of: block `header` (38 px, `window_drag`, role `header`), block `strip` (82 px, role `strip`), and a row `work-body` with a stack `main-stack` (active `main`; block `main` shows `tab: active` with pane options gap 8, radius 12, background `surface`, `lone`, 1 px `border`, focus 1 px `#ffffff40`, pane header from role `pane`, 34 px, `reveal: always`; block `empty`, role `empty`; block `board`, role `board`) and a hidden column `panel` (368 px) holding stack `panel-body` (active `files`) with blocks `files` and `changes`.

`mods/nightglass/` (one mod, `place: none`, roles by `props.role`): `main.js` (state, polling, machine themes), `sidebar.js` (roles `sidebar`, `newmenu`, `agentmenu`, `spaces`, `colors`), `header.js` (role `header`, usage widget), `strip.js` (roles `strip`, `pane`, `empty`), `board.js` (role `board`, the Board pill), `lib.js` (tokens, icons, status marks, machine glyph, entrance easing), `data.js` (live data, stats, board columns, questions), about 40 SVG icons, 20 + 20 ring arcs (`ring-w-5..100.svg`, `ring-h-5..100.svg`) and `ring-track.svg`, `herdr.png`, `wallpaper.png`.

`mods/nightglass-toast/`: replaces the shipped `toast` mod through the root `toast` key; on this layout it draws the stock look (340 x 72 px box, `popover` fill, status dot, title 13 px semibold, body 12 px muted; click runs the action and closes) and eases in. Its phone capsule only appears when the layout has an `inbox` node (the phone layout).

`themes/nightglass.json`, `nightglass-{blue,frost,lagoon,forest,dune,ember,sakura,aurora,storm}.json`: all ten are used.

Shipped mods used, not bundled: `files`, `changes` (the right column) and `menu` (right-click and `...` popups).

`herdr` calls: `props`, `shared`/`setShared`, `snapshot` data from `spaces`, `panes`, `machines`, `terminals`, `agents`, `focused`, `layout`, `theme`, `keys`, `window`, `home`, `settings`, `knownAgents`, `setAgentOrder`, `openOverlay`/`closeOverlay`, `exec`, `hc`. Commands: `agent.focus`, `space.select`, `space.new`, `space.close`, `tab.select`, `tab.new`, `tab.close`, `pane.focus`, `pane.close`, `terminal.kill`, `layout.select`, `layout.show`, `layout.hide`, `layout.resize`, `app.theme`, `app.palette`, `app.settings`, `app.zoom_in`, `app.zoom_out`, `window.minimize`, `window.maximize`, `window.close`.

Programs it runs (`exec`): `git --no-optional-locks status --porcelain` in the focused terminal's folder on its machine (every 2 s tick, at most every 10 s per folder); a `sh -c` script reading `/proc/stat`, `/proc/meminfo`, `df -kP /`, `/proc/uptime` and `nproc` on the open machine (Linux only); `sh -c` with `wl-copy`, `xclip` or `clip.exe` to copy a terminal number; `hc read <terminal>` every 5 s for each waiting agent (at most 8) while the board shows; and, only with the usage prop, `"$HOME/.local/bin/ai-usage-tui" --json`.

## Watch out

- Needs herdr-app 0.1.16 or newer (root keys `toast` and `preview`). `layout-cycle` is not part of this folder.
- Run `herdr-app check` on `nightglass` and `nightglass-toast`, then `layout.switch {name: "nightglass"}`.
- Tell the person before installing: the mod runs programs (`exec`: git, sh, wl-copy / xclip / clip.exe, and with usage `ai-usage-tui`; and `hc`, Herdr's own CLI, to read waiting agents' screens for the board) on this computer and on every connected machine. It does not use the network itself.
- It reads outside its own folder: Herdr's live state (spaces, terminals, machines), the person's key bindings (`keys()`) for the palette hint, the app settings (`settings()`, for the zoom), the text on screen of each waiting agent's terminal (`hc read`), the files of the folders it runs git in, `/proc` on machines, and, with usage on, `icons/claude.svg` and `icons/codex.svg` in the Herdr home (not part of this folder; without them the usage tool icons draw blank). It stores `open`, `visited`, `panels`, `usageOpen` in localStorage and `nightglass.colors`, `nightglass.empty`, `nightglass.usage`, `nightglass.dismissed`, `nightglass.offlineDismissed`, `nightglass.questions`, `new-menu.agents` as shared state, and it reads and clears `nightglass-phone.zoomBefore`. It can change the person's zoom setting (see the Zoom note above).
- It changes the app theme: `app.theme` is run whenever the focused machine's scheme changes, so the person's saved theme setting ends up one of the `nightglass*` themes. All ten theme files must be installed.
- Usage is off by default. Add a `usage` prop to the sidebar block's props: `"props": { "role": "sidebar", "usage": "server" }` polls `~/.local/bin/ai-usage-tui --json` on the machine named `server` every 120 s (20 s until the first answer; that tool calls the Anthropic usage endpoints) and shows the usage wells and list above the stats; `"usage": true` means `USAGE_MACHINE` in `data.js`, which is `"amal-build"`, so name the machine instead. The machine must be connected and `ai-usage-tui` installed there. Without the prop nothing is polled and the dock is only the stats.
- Stats need `/proc` and `nproc` (Linux machines); elsewhere the dock says "stats unavailable".
- The wallpaper is referenced as `mods/nightglass/wallpaper.png`; renaming the mod folder breaks it, as do the icon paths (`mods/nightglass/...` in `lib.js`). The ring arcs are pre-drawn in 5% steps.
- Popups (New, agents, spaces, colours) are filled at 50% glass and the app draws no backdrop blur behind overlays, so they are see-through.
- The sidebar measures its own width; under zoom the measured size can differ from layout px, so tiles and bars are sized by flex, not measured widths.
- The strip block is 82 px in the layout and keeps that height; the mod only calls `layout.resize` (at most every 2 s) to make it 40 px while the board shows and 82 px again after, so a layout that fixes another size fights it.
- The mod does not bind keys and ships no `keys.json`.
- Two files are copied verbatim into the phone layout's mod (`lib.js`, `data.js`); this folder does not include the phone layout.

## Done when

- `herdr-app check` passes for `nightglass` and `nightglass-toast`, and `layout.switch {name: "nightglass"}` shows a 268 px sidebar, a 38 px header, an 82 px strip (tab row with the Board pill, and the bar) and the terminal over the wallpaper.
- The sidebar lists All and every connected machine; clicking a machine lists its spaces and agent rows; a waiting agent's row pulses red for about 10 s and the strip's bar shows a "Needs you" chip for it, and clicking the chip focuses that agent.
- The Board pill opens four columns with every agent, a waiting card quotes what the agent asks, and picking a tab or a chip returns to the terminals; Dismiss moves a finished agent to Idle.
- An unreachable machine shows the dismissable note under the tiles, not a banner in the strip.
- Right-clicking a machine tile and picking a swatch re-tints the whole window.
- Files and Changes open the 368 px right column; Changes shows `+N` when the focused folder has uncommitted files.
- The dock shows cpu, ram and disk bars for a Linux machine within a few seconds.
- The collapse button turns the sidebar into the 56 px rail and expand brings it back.
- With no `usage` prop, no `ai-usage-tui` process is started and no usage wells show; with `"usage": "<machine>"` they appear once that machine answers.
- A notification shows the stock-looking toast through `nightglass-toast`.

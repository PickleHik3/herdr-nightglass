# Nightglass

A dark glass layout for the [Herdr](https://herdr.dev) desktop app, for running AI coding agents across several machines at once.

![Nightglass](nightglass/preview.png)

## What you get

- **Glass over a wallpaper.** Half-transparent sidebar, strip and pane headers float over a near-black wallpaper, and the terminal is 82% opaque.
- **Every machine at a glance.** Machine tiles at the top of the sidebar: pick one to see its spaces, or **All** for every machine side by side. Each space lists its terminals and agents with a live status, elapsed time and terminal number.
- **Clear agent states.** Waiting agents pulse red, working ones breathe green, finished ones get a check and idle ones a hollow ring. A strip above the terminal shows "Nothing needs you", or a card for each agent that is waiting or done. Click a card to jump straight to that agent.
- **A colour per machine.** Right-click a machine tile and pick one of eight schemes: Blue, Frost, Teal, Forest, Dune, Ember, Rose or Aurora. The whole window takes the colour of the machine you're looking at.
- **Machine stats.** CPU, RAM and disk bars for the open machine sit at the bottom of the sidebar.
- **Files and Changes.** A right-hand panel shows Herdr's file browser or git changes, and the header shows the number of uncommitted files.
- **Search.** A centred search pill opens the command palette: jump to an agent, a terminal (`t1`) or a command.
- **Quick actions.** `+` starts a new space, terminal or agent on any connected machine. Hover a row to close it.
- **Collapsible sidebar.** It shrinks to a 56 px rail of machine buttons.
- **Matching notifications.** The layout's own toast mod (`nightglass-toast`) shows them in the same style.

## Install

Inside Herdr, ask your agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add this layout: herdr.dev/layouts/PickleHik3/nightglass
```

Or install it by hand: copy `nightglass/layouts`, `nightglass/mods` and `nightglass/themes` into `~/.config/herdr-app/`, then run `herdr-app do layout.switch --name nightglass`. Requires herdr-app 0.1.16 or newer.

### Claude usage rings (optional)

To show Claude and Codex usage rings above the machine stats, name the machine that has `ai-usage-tui` (at `~/.local/bin/ai-usage-tui`) installed in the sidebar block's props in `layouts/nightglass.json`:

```json
"props": { "role": "sidebar", "usage": "server" }
```

Without that prop, nothing is polled.

## Also in this repo

- **Nightglass Phone** (`layouts/nightglass-phone.json`, `mods/nightglass-phone/`): the same look on a portrait phone screen running Herdr. It is being reworked and isn't in the gallery yet. It needs the desktop `mods/nightglass/` installed too.
- **Layout cycle** (`mods/layout-cycle/`): `ctrl-shift-l` switches between `nightglass`, `nightglass-phone` and Herdr's `main` only. Bind it in `keys.json` with `"ctrl-shift-l": "mod.open:layout-cycle"`.

## Working on it

- The root `layouts/`, `mods/` and `themes/` folders hold the source. `nightglass/` is the gallery copy: after changing the desktop files, run `scripts/sync-gallery.sh` (`--check` reports drift), and update `nightglass/RECIPE.md` when the behaviour changes.
- The phone mod keeps verbatim copies of `mods/nightglass/{lib,data}.js`. `node scripts/check-phone.mjs` fails when they drift.
- Design sources are in `design/`: `Main.dc.html` (desktop), `Phone.dc.html` and `GLASS.md`.

## Licence

MIT. The palette started from Tokyo Night by enkia.

# Herdr Tokyo Night

A Herdr app layout (layouts/, mods/, themes/ mirror ~/.config/herdr-app).
Design source: design/Main.dc.html (the "Glass" look, canvas "herdr macOS Redesign"), design/wallpaper.svg.
Implementation brief for Glass, not yet built into mods/: design/GLASS.md.
Install: copy layouts/, mods/, themes/ into each Herdr home (~/.config/herdr-app, ~/.config/herdr-app-xrdp).

## Phone layout (portrait, ~412 x 915)

`layouts/tokyo-night-phone.json` + `mods/tokyo-night-phone/` is the same family for a phone: top bar (app, search, usage rings, menu), attention strip, tab pills, the terminal full width, a message composer and a drawer (machines + All, spaces with agent rows, cpu/ram/disk). Design source: `design/Phone.dc.html`.

- Install: copy `layouts/`, `mods/` and `themes/` as above. Install the desktop `mods/tokyo-night/` too: the phone mod loads its icons, ring arcs and `herdr.png` from that folder, and uses the repo's themes (no theme of its own).
- Switch: `herdr-app do layout.switch --name tokyo-night-phone` (back: `... --name tokyo-night`), or `ctrl-shift-l`.
- `data.js` and `lib.js` in the phone mod are verbatim copies of the desktop mod's (JS imports cannot leave their mod folder). After changing the desktop ones: `cp mods/tokyo-night/{lib,data}.js mods/tokyo-night-phone/`. `scripts/check-phone.mjs` fails when they drift; `scripts/gen-phone-rings.mjs` regenerates `ring-s-*.svg`.
- Check: `node scripts/check-phone.mjs` (static only; set `HERDR_DTS` to the app's `herdr.d.ts` to check `herdr` imports).
- Behaviour: the composer sends with `hc send` (paste + Enter; refused while the agent waits on a dialog). Search opens the command palette. When the soft keyboard shrinks the window below 640 px the drawer is hidden (and returns at 720 px); this is saved as `nodes.drawer.hidden` in `layouts/.state/tokyo-night-phone.json`, with `nodes.strip.size` and the dragged `nodes.drawer.size`. Tapping the open machine's card again picks its scheme.
- Limits: no scroll snap on the pills and cards; the drawer drag handle is the 8 px gap above the drawer; popups are not clamped by the app (`app.palette`, `app.settings` are desktop-sized); the permission-choice row and the terminal footer of the design board are not built; nothing here has been run on a device.

#!/usr/bin/env python3
"""Generate the per-machine Tokyo Night variants in themes/.

Each variant is themes/tokyo-night.json with its surfaces nudged toward one hue and that hue
as the accent, so a machine's whole window reads as "its" color while staying Tokyo Night.
Re-run after changing the base theme: python3 scripts/gen-themes.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = json.loads((ROOT / "themes/tokyo-night.json").read_text())

# name -> hue. The swatch order in mods/tokyo-night/lib.js (SWATCHES) follows this list.
VARIANTS = {
    "tokyo-night-frost": "#7dcfff",
    "tokyo-night-lagoon": "#73daca",
    "tokyo-night-forest": "#9ece6a",
    "tokyo-night-dune": "#e0af68",
    "tokyo-night-ember": "#ff9e64",
    "tokyo-night-sakura": "#f7768e",
    "tokyo-night-aurora": "#bb9af7",
}
# How far each surface moves toward the hue: enough to tell machines apart at a glance,
# little enough that text contrast stays as in the base theme.
TINT = {"canvas": 0.05, "chrome": 0.06, "surface": 0.08, "popover": 0.08, "raised": 0.11,
        "hover": 0.11, "selected": 0.14, "border": 0.13, "input": 0.18}


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(pa, pb))


for name, hue in VARIANTS.items():
    t = json.loads(json.dumps(BASE))
    t["background"] = mix(BASE["background"], hue, TINT["chrome"])
    t["selection"] = mix(BASE["selection"], hue, 0.30)
    for k, amt in TINT.items():
        t["colors"][k] = mix(BASE["colors"][k], hue, amt)
    t["colors"].update(accent=hue, solid=hue)
    (ROOT / "themes" / f"{name}.json").write_text(json.dumps(t, indent=2) + "\n")
    print(name, t["colors"]["chrome"], t["colors"]["canvas"], hue)

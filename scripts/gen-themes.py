#!/usr/bin/env python3
"""Generate the Glass themes in themes/: the neutral base, the All view's scheme, one per machine hue.

Glass (design/GLASS.md) is a set of alpha fills over a wallpaper. A theme carries the opaque
bases the mod's lib.js builds those fills from:
  canvas   wallpaper base          chrome   glass base (the colour drawn at 72%)
  surface  glass over the wallpaper, opaque: the pane and terminal background
  raised / hover / selected / border / input   the raised, on, rim and well tones, opaque over surface
Machine schemes nudge canvas and chrome a few percent toward their hue and use it as the accent;
the alpha fills in lib.js follow the accent the same way. Neutral = no nudge.
Re-run: python3 scripts/gen-themes.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
WALL, GLASS = "#0e1016", "#0c0d12"
NEUTRAL_ACCENT = "#e6e7eb"
INK = "#0f1012"

# name -> hue. Keep in step with SCHEMES in mods/nightglass/lib.js.
VARIANTS = {
    "nightglass-blue": "#6e9bff",
    "nightglass-frost": "#52c6f0",
    "nightglass-lagoon": "#4fd1b8",
    "nightglass-forest": "#86d46a",
    "nightglass-dune": "#e5b45c",
    "nightglass-ember": "#f58f5c",
    "nightglass-sakura": "#f0708a",
    "nightglass-aurora": "#a98bf5",
}
# How far the opaque bases move toward the hue, and the tone fills' white/black toward it.
BASE_TINT = {"canvas": 0.05, "chrome": 0.06}
FILL_TINT = {"white": 0.08, "black": 0.06}

ANSI = [
    "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
    "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
]


def mix(top, base, a):
    """`top` at amount `a` over `base` (same as mix() in lib.js)."""
    pt = [int(top[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(base[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * a + y * (1 - a)):02x}" for x, y in zip(pt, pb))


def theme(accent, hue=None):
    """hue None = the neutral base (no nudge)."""
    canvas = mix(hue, WALL, BASE_TINT["canvas"]) if hue else WALL
    chrome = mix(hue, GLASS, BASE_TINT["chrome"]) if hue else GLASS
    surface = mix(chrome, canvas, 0.72)
    white = mix(hue, "#ffffff", FILL_TINT["white"]) if hue else "#ffffff"
    black = mix(hue, "#000000", FILL_TINT["black"]) if hue else "#000000"
    raised = mix(white, surface, 0.09)
    return {
        "background": surface,
        "foreground": "#eceef2",
        "selection": mix(accent, surface, 0.22),
        "cursor": "#eceef2",
        "ansi": ANSI,
        "colors": {
            "canvas": canvas,
            "chrome": chrome,
            "surface": surface,
            "popover": surface,
            "raised": raised,
            "hover": raised,
            "selected": mix(white, surface, 0.14),
            "border": mix(white, surface, 0.10),
            "input": mix(black, surface, 0.38),
            "foreground": "#eceef2",
            "muted": "#a8adba",
            "dim": "#a8adba",
            "accent": accent,
            "accent_foreground": INK,
            "solid": accent,
            "solid_foreground": INK,
            "working": "#5fd38d",
            "blocked": "#f0708a",
            "done": "#5fd38d",
            "idle": "#a8adba",
            "unknown": "#6b7080",
        },
    }


def write(name, t):
    (ROOT / "themes" / f"{name}.json").write_text(json.dumps(t, indent=2) + "\n")
    print(name, t["colors"]["canvas"], t["colors"]["chrome"], t["colors"]["accent"])


# Neutral Glass base (the layout's default theme) and the All view's scheme: the same, pale accent.
write("nightglass", theme(NEUTRAL_ACCENT))
write("nightglass-storm", theme(NEUTRAL_ACCENT))
for name, hue in VARIANTS.items():
    write(name, theme(hue, hue))

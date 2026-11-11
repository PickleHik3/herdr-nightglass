#!/bin/sh
# Build mods/nightglass/wallpaper.png from design/wallpaper.svg for the app: the base stays the
# design's near-black, but the dot grid, line art and spots are brightened (~2.5x) so they read
# through the glass instead of the background looking like plain black.
set -e
cd "$(dirname "$0")/.."
sed -e 's/fill-opacity=".07"/fill-opacity=".16"/' \
    -e 's/stroke-opacity=".10"/stroke-opacity=".28"/; s/stroke-opacity=".08"/stroke-opacity=".22"/g' \
    -e 's/stroke-opacity=".06"/stroke-opacity=".17"/g; s/stroke-opacity=".09"/stroke-opacity=".25"/' \
    -e 's/stroke-opacity=".3"/stroke-opacity=".6"/; s/fill-opacity=".45"/fill-opacity=".9"/g' \
    design/wallpaper.svg | rsvg-convert -w 2560 -h 1600 -o mods/nightglass/wallpaper.png
echo "wrote mods/nightglass/wallpaper.png"

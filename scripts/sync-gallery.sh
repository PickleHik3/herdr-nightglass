#!/usr/bin/env bash
# Rebuild nightglass/ (the herdr.dev gallery folder) from the root tree.
#   scripts/sync-gallery.sh           copy the sources into nightglass/
#   scripts/sync-gallery.sh --check   change nothing; exit 1 if nightglass/ differs
# Never touches nightglass/RECIPE.md or nightglass/preview.png.
set -euo pipefail
cd "$(dirname "$0")/.."

mode=sync
[ "${1:-}" = "--check" ] && mode=check

out=nightglass
want=$(mktemp -d)
trap 'rm -rf "$want"' EXIT

mkdir -p "$want/layouts" "$want/mods" "$want/themes"
cp layouts/nightglass.json layouts/nightglass.svg "$want/layouts/"
for m in nightglass nightglass-toast; do
  cp -r "mods/$m" "$want/mods/$m"
  rm -f "$want/mods/$m/gpui-kit.d.ts" "$want/mods/$m/jsconfig.json"
done
cp themes/nightglass*.json "$want/themes/"

if [ "$mode" = check ]; then
  rc=0
  for d in layouts mods themes; do
    diff -r "$want/$d" "$out/$d" || rc=1
  done
  [ $rc = 0 ] && echo "nightglass/ is in sync" || echo "nightglass/ has drifted: run scripts/sync-gallery.sh" >&2
  exit $rc
fi

mkdir -p "$out"
rm -rf "$out/layouts" "$out/mods" "$out/themes"
cp -r "$want/layouts" "$want/mods" "$want/themes" "$out/"
echo "synced $out/"

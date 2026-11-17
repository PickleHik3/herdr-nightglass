#!/usr/bin/env bash
# Rebuild nightglass/ and nightglass-phone/ (the herdr.dev gallery folders) from the root tree.
#   scripts/sync-gallery.sh           copy the sources into both folders
#   scripts/sync-gallery.sh --check   change nothing; exit 1 if either folder differs
# Never touches RECIPE.md or preview.png in either folder.
set -euo pipefail
cd "$(dirname "$0")/.."

mode=sync
[ "${1:-}" = "--check" ] && mode=check

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# build <folder> <layout name> <mods...>: stage the folder's layouts/, mods/ and themes/ under $work/<folder>
build() {
  local out=$1 layout=$2; shift 2
  local want="$work/$out"
  mkdir -p "$want/layouts" "$want/mods" "$want/themes"
  cp "layouts/$layout.json" "layouts/$layout.svg" "$want/layouts/"
  local m
  for m in "$@"; do
    cp -r "mods/$m" "$want/mods/$m"
    rm -f "$want/mods/$m/gpui-kit.d.ts" "$want/mods/$m/jsconfig.json"
  done
  cp themes/nightglass*.json "$want/themes/"
}

build nightglass nightglass nightglass nightglass-toast
build nightglass-phone nightglass-phone nightglass-phone nightglass nightglass-toast

rc=0
for out in nightglass nightglass-phone; do
  if [ "$mode" = check ]; then
    for d in layouts mods themes; do
      diff -r "$work/$out/$d" "$out/$d" || rc=1
    done
  else
    mkdir -p "$out"
    rm -rf "$out/layouts" "$out/mods" "$out/themes"
    cp -r "$work/$out/layouts" "$work/$out/mods" "$work/$out/themes" "$out/"
    echo "synced $out/"
  fi
done

if [ "$mode" = check ]; then
  [ $rc = 0 ] && echo "nightglass/ and nightglass-phone/ are in sync" || echo "a gallery folder has drifted: run scripts/sync-gallery.sh" >&2
  exit $rc
fi

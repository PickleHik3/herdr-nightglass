// Generates mods/tokyo-night-phone/ring-s-*.svg: the 16 px double ring of the phone's top bar
// (outer r11 stroke 4 round = week, inner r4.5 stroke 3.5 butt = 5-hour; 5% steps), the same way
// the desktop mod's ring-*.svg arcs are pre-made. Design: design/Phone.dc.html (ring in the top bar).
// The usage popover uses the desktop mod's ring-* files instead (same look at 34 px).
// Usage: node scripts/gen-phone-rings.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(dirname(fileURLToPath(import.meta.url)), "../mods/tokyo-night-phone");
const f = (n) => n.toFixed(3).replace(/\.?0+$/, "");
const OW = 4, IR = 4.5, IW = 3.5;
const svg = (sw, cap, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="${cap}">${body}</svg>\n`;
const arc = (r, p) => {
  if (p >= 100) return `<circle cx="14" cy="14" r="${r}"/>`;
  const a = (p / 100) * 2 * Math.PI;
  return `<path d="M14 ${f(14 - r)} A${r} ${r} 0 ${p > 50 ? 1 : 0} 1 ${f(14 + r * Math.sin(a))} ${f(14 - r * Math.cos(a))}"/>`;
};
writeFileSync(`${out}/ring-s-track.svg`, svg(OW, "butt", `<circle cx="14" cy="14" r="11"/><circle cx="14" cy="14" r="${IR}" stroke-width="${IW}"/>`));
for (let p = 5; p <= 100; p += 5) {
  writeFileSync(`${out}/ring-s-w-${p}.svg`, svg(OW, "round", arc(11, p)));
  writeFileSync(`${out}/ring-s-h-${p}.svg`, svg(IW, "butt", arc(IR, p)));
}

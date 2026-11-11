// tokyo-night: live data (machines, spaces, terminals as rows), machine stats and ai-usage parsing.
import { spaces, machines, panes, agents, terminals, focused, home } from "herdr";

export const LOCAL = "@local";
export const mkey = (n) => n ?? LOCAL;
export const mname = (k) => k === LOCAL ? "This computer" : k;
export const mArg = (k) => k === LOCAL ? "" : k;     // space.new {machine}
export const onArg = (k) => k === LOCAL ? null : k;  // exec {on}
export const ALL = "@all"; // the "All" tile's key
export const short = (a) => String(a ?? "").split("/").pop();

// Elapsed tracking: when a terminal was first seen in its present status ("N m observed"),
// or the core's own timestamp when it gives a plausible one. Module scope: shared by copies.
const seen = new Map();
const lastUp = new Map(); // machine key -> last time its layout was readable
export const lastSeen = (key) => lastUp.get(key) ?? null;

function tildePath(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}
// What an agent reported (OSC 7501 report), when the core carries a readable message.
function reportText(term) {
  const r = term?.report;
  if (typeof r === "string") return r.trim() || null;
  if (r && typeof r === "object") {
    for (const k of ["message", "status_message", "detail", "text", "summary", "activity", "task", "title"]) {
      if (typeof r[k] === "string" && r[k].trim()) return r[k].trim();
    }
  }
  return null;
}
function since(addr, status, term, tab, now) {
  const prev = seen.get(addr);
  if (!prev || prev.status !== status) {
    let at = now;
    const ms = term?.status_ms;
    if (typeof ms === "number" && ms > 1.5e12 && ms <= now) at = ms;
    else if (typeof tab?.changed_at === "number" && tab.changed_at > 1.5e12 && tab.changed_at <= now) at = tab.changed_at;
    seen.set(addr, { status, at });
  }
  return now - seen.get(addr).at;
}

// Everything the mod draws, from one pass over Herdr's live data.
export function snapshot() {
  const sp = spaces(), ps = panes(), foc = focused(), terms = terminals();
  const termBy = new Map(terms.map(t => [t.address, t]));
  const agentBy = new Map(agents().map(a => [a.address, a]));
  const state = new Map(machines().map(m => [mkey(m.name), m.layout]));
  const keysSet = new Set([LOCAL, ...state.keys(), ...sp.map(s => mkey(s.machine))]);
  const order = [...keysSet].sort((a, b) => a === LOCAL ? -1 : b === LOCAL ? 1 : a.localeCompare(b));
  const now = Date.now();
  const ms = order.map(key => ({
    key, name: mname(key), layout: state.get(key) ?? "ready", spaces: [], total: 0,
    count: { waiting: 0, working: 0, idle: 0, done: 0 },
  }));
  const mBy = new Map(ms.map(m => [m.key, m]));
  const byTab = new Map();
  for (const p of ps) { if (!byTab.has(p.tab)) byTab.set(p.tab, []); byTab.get(p.tab).push(p); }
  const rows = [], allSpaces = [];
  for (const s of sp) {
    const m = mBy.get(mkey(s.machine));
    const offline = m.layout === "unavailable";
    const space = { id: s.id, name: s.name, branch: s.branch, active: s.active, machine: m.key, rows: [] };
    for (const tab of s.tabs ?? []) {
      for (const p of byTab.get(tab.id) ?? []) {
        if (!p.terminal) continue;
        const a = agentBy.get(p.terminal), term = termBy.get(p.terminal);
        const raw = p.status ?? (p.program?.shell === false ? "working" : "idle");
        const status = raw === "blocked" ? "waiting" : raw;
        const agent = p.status != null;
        const addr = short(p.terminal);
        const report = agent ? reportText(term) : null;
        const prog = p.program ?? a?.program;
        const cwd = tildePath(p.cwd);
        const r = {
          address: p.terminal, short: addr, pane: p.pane, space: s.id, spaceName: s.name, tab: tab.id, tabName: tab.name,
          tabActive: tab.active, spaceActive: s.active, machine: m.key, machineName: m.name,
          status, kind: offline ? "offline" : status, agent, program: prog,
          title: (agent && a?.title) || p.title || prog?.name || addr,
          cwd, branch: p.branch, focused: !!p.focused || foc?.terminal === p.terminal,
          pinned: !!a?.pinned, seq: a?.seq ?? 0,
          ms: since(p.terminal, raw, term, tab, now),
          report,
          now: report ?? (agent ? cwd : [prog?.name, cwd].filter(Boolean).join(" · ")),
        };
        space.rows.push(r); rows.push(r);
        m.total++;
        if (!offline) m.count[status === "waiting" ? "waiting" : status]++;
      }
    }
    m.spaces.push(space); allSpaces.push(space);
  }
  for (const m of ms) {
    if (m.layout === "ready") lastUp.set(m.key, now);
    m.offline = m.layout === "unavailable";
    m.light = m.offline ? "offline" : m.count.waiting ? "waiting" : m.count.working ? "working" : m.total ? "idle" : null;
    const parts = [["waiting", m.count.waiting], ["working", m.count.working], ["done", m.count.done], ["idle", m.count.idle]]
      .filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    m.summary = m.offline ? "offline" : parts.join(" · ") || "no terminals";
  }
  return { machines: ms, spaces: allSpaces, rows, foc, now, mBy,
    offline: ms.filter(m => m.offline && m.spaces.length > 0) };
}

// The machine whose stats the card shows: the open one; in All, the focused space's (else the first).
export function statsMachine(snap, key) {
  if (key !== ALL) return snap.mBy.get(key) ?? null;
  const f = snap.foc && snap.spaces.find(s => s.id === snap.foc.space);
  return snap.mBy.get(f?.machine) ?? snap.machines[0] ?? null;
}

// ---- machine stats: one exec, two /proc/stat samples 0.5 s apart ----
export const STATS_SCRIPT = `[ -r /proc/stat ] && [ -r /proc/meminfo ] || exit 3
s() { awk '/^cpu /{t=0; for(i=2;i<=9;i++) t+=$i; print t, $5+$6}' /proc/stat; }
a=$(s); sleep 0.5; b=$(s)
echo "cpu $a $b"
echo "cores $(nproc 2>/dev/null || echo 1)"
echo "mem $(awk '/^MemTotal/{t=$2} /^MemAvailable/{a=$2} END{print t, a}' /proc/meminfo)"
df -kP / | awk 'NR==2{print "disk", $2, $3, $4}'
awk '{print "up", int($1)}' /proc/uptime
`;
export function parseStats(out) {
  const L = {};
  for (const line of String(out).split("\n")) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k) L[k] = v.map(Number);
  }
  const cpu = L.cpu, mem = L.mem, disk = L.disk, up = L.up?.[0];
  if (!cpu || cpu.length < 4 || !mem || !disk || cpu.some(Number.isNaN)) return null;
  const dt = cpu[2] - cpu[0], di = cpu[3] - cpu[1];
  const gb = (kb) => kb / 1048576;
  return {
    cpu: dt > 0 ? Math.max(0, Math.min(100, Math.round((dt - di) / dt * 100))) : 0,
    cores: L.cores?.[0] || 1,
    memPct: mem[0] > 0 ? Math.round((mem[0] - mem[1]) / mem[0] * 100) : 0,
    memText: `${gb(mem[0] - mem[1]).toFixed(1)}/${Math.round(gb(mem[0]))} GB`,
    diskPct: disk[0] > 0 ? Math.round(disk[1] / disk[0] * 100) : 0,
    diskText: `${Math.round(gb(disk[1]))} / ${Math.round(gb(disk[0]))} GB`,
    // df's Available column (excludes reserved blocks); older 2-column output falls back to size − used.
    diskFree: gb(disk.length > 2 && !Number.isNaN(disk[2]) ? disk[2] : disk[0] - disk[1]),
    diskTotal: gb(disk[0]),
    up: Number.isFinite(up) ? up : null,
  };
}
export function upText(sec) {
  if (sec == null) return "";
  const d = Math.floor(sec / 86400);
  if (d >= 1) return `up ${d}d`;
  const h = Math.floor(sec / 3600);
  return h >= 1 ? `up ${h}h` : `up ${Math.max(1, Math.floor(sec / 60))}m`;
}

// ---- ai-usage ----
export const USAGE_MACHINE = "amal-build";
// `ai-usage-tui --json`: { fetched_at, accounts: [{ tool, label, plan, error, saved_at,
// limits: [{ name: "5-hour" | "Weekly" | ..., percent, resets_at }] }] }. Emails are dropped here.
export function parseUsageJson(text) {
  let d;
  try { d = JSON.parse(text); } catch { return []; }
  return (d?.accounts ?? []).map((a) => {
    const lim = (n) => (a.limits ?? []).find(l => l.name === n) ?? null;
    const five = lim("5-hour"), week = lim("Weekly");
    const label = a.label ?? a.tool ?? "?";
    return {
      tool: a.tool, plan: a.plan ?? "",
      name: label, // the tool shows as its icon
      five: five?.percent ?? null, fiveAt: five?.resets_at ?? null,
      week: week?.percent ?? null, weekAt: week?.resets_at ?? null,
      saved: a.saved_at ?? null,                       // set when the numbers are a saved snapshot
      note: !five && !week ? (a.error ?? "no data") : "",
    };
  });
}

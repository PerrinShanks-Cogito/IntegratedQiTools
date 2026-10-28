/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $ = s => document.querySelector(s);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 864e5, WEEK = 7 * DAY;
const FONT = '"Public Sans", "Segoe UI", system-ui, Arial, sans-serif';
const ANY = 'Any role';
const RULES = [
  { key: 'r1', text: 'A point more than 3 sigma from the mean' },
  { key: 'r2', text: '2 out of 3 points more than 2 sigma from the mean, all 3 on the same side' },
  { key: 'r3', text: '6 points in a row rising or falling' },
  { key: 'r4', text: 'A run of 9 or more points on the same side of the mean' }
];
const LIGHT = {
  ink: '#17222D', muted: '#5A6875', rule: '#DCE2E7', grid: '#EDF0F3', line: '#3B4956', limit: '#6B7885', surface: '#FFFFFF',
  req: '#5B9BD9', 'req-soft': '#CFE2F5', core: '#1F6E3B', adhoc: '#8AB833', carve: '#8A96A3', current: '#003087',
  r1: '#C8372D', r2: '#4E9A2F', r3: '#7A4BB0', r4: '#E07B00', s1: '#DCE8F5', accent: '#005EB8'
};
function palette(){
  const cs = getComputedStyle(document.documentElement), p = {};
  Object.keys(LIGHT).forEach(k => { p[k] = cs.getPropertyValue('--' + k).trim() || LIGHT[k]; });
  return p;
}

const state = { excluded: new Set(), showPct: true, m: null };

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Shared statistics, from /assets/js/focus-stats.js
const { sum, mean, sd, splitTable } = FocusStats;

function fmt(v, dp){
  if (!isFinite(v)) return '–';
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
}
const fmt1 = v => fmt(v, Math.abs(v) < 100 ? 1 : 0);
const fmtW = v => fmt(v, 2);
const plural = (n, w, pl) => `${fmt(n)} ${n === 1 ? w : (pl || w + 's')}`;
function cleanNum(s){
  s = String(s == null ? '' : s).trim().replace(/[£$€,\s %]/g, '');
  if (s === '' || s === '-') return 0;
  return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) ? +s : NaN;
}
const isBlank = s => String(s == null ? '' : s).trim() === '';
function inputNum(id, dflt){ const v = parseFloat($('#' + id).value); return isFinite(v) ? v : dflt; }
// Excel PERCENTILE (inclusive)
function pctile(a, p){
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), r = p * (s.length - 1), lo = Math.floor(r);
  return lo + 1 < s.length ? s[lo] + (r - lo) * (s[lo + 1] - s[lo]) : s[lo];
}
function parseDate(s){
  s = String(s || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return Date.UTC(+m[1], m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))){ const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return Date.UTC(y, m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,})[ \-](\d{2,4})$/))){
    const mi = MON.findIndex(x => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
    if (mi >= 0){ const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return Date.UTC(y, mi, +m[1]); }
  }
  if ((m = s.match(/^(\d{5})(\.0+)?$/)) && +m[1] > 20000 && +m[1] < 80000) return Date.UTC(1899, 11, 30) + +m[1] * DAY;
  return NaN;
}
const fmtDate = t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const isoDate = t => new Date(t).toISOString().slice(0, 10);
function niceMax(v){
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function ticks(max){ const n = 5, step = max / n; return Array.from({ length: n + 1 }, (_, i) => i * step); }
function tickLabel(v){ return Math.abs(v) >= 1000 ? fmt(v) : (Math.round(v * 10) / 10).toLocaleString('en-GB'); }
const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const roleName = s => String(s || '').trim().replace(/\s+/g, ' ') || ANY;

/* ---------- Reading the inputs ---------- */
function splitLines(text){
  // with no delimiter, every line is split on spaces
  const s = splitTable(text, { space: 'columns' });
  return s ? { delim: s.delim, rows: s.recs } : { delim: 'ws', rows: [] };
}
// Work streams: name, minutes, role, turnaround days, failure demand %, waiting now
function parseStreams(text){
  const { rows } = splitLines(text), out = [], skipped = [], seen = new Set();
  rows.forEach((f, li) => {
    const name = (f[0] || '').trim();
    if (!name){ skipped.push(li + 1); return; }
    const mins = isBlank(f[1]) ? NaN : cleanNum(f[1]);
    if (!isBlank(f[1]) && !isFinite(mins)){ if (li > 0) skipped.push(li + 1); return; }
    const num = (v, d) => isBlank(v) ? d : cleanNum(v);
    const days = num(f[3], NaN), fd = num(f[4], 0), wait = num(f[5], NaN);
    if ([fd].some(v => !isFinite(v))){ skipped.push(li + 1); return; }
    if (seen.has(key(name))){ skipped.push(li + 1); return; }
    seen.add(key(name));
    out.push({ name, k: key(name), entered: mins, role: roleName(f[2]), days: isFinite(days) ? Math.max(0, days) : NaN, fd: clamp(fd, 0, 100) / 100, wait: isFinite(wait) ? Math.max(0, wait) : null });
  });
  return { rows: out, skipped };
}
// Rows of label(s), role, number: staff (WTE), extra hours, fixed work (minutes)
function parseRoleRows(text){
  const { rows } = splitLines(text), out = [], skipped = [];
  rows.forEach((f, li) => {
    while (f.length && isBlank(f[f.length - 1])) f.pop();
    if (f.length < 2){ skipped.push(li + 1); return; }
    const v = cleanNum(f[f.length - 1]);
    if (!isFinite(v)){ if (li > 0) skipped.push(li + 1); return; }
    const role = f.length >= 3 ? roleName(f[f.length - 2]) : roleName(f[0]);
    const name = f.length >= 3 ? f.slice(0, f.length - 2).join(' ').trim() : f[0];
    out.push({ name: name || role, role, v: Math.max(0, v) });
  });
  return { rows: out, skipped };
}
// Timed observations: work stream and minutes, by heading or by position
function parseObs(text){
  const { rows } = splitLines(text), out = [];
  if (!rows.length) return { rows: out, skipped: [] };
  let nameCol = 0, valCol = -1, start = 0;
  const head = rows[0];
  const hv = head.findIndex(h => /duration|minutes|mins|time taken/i.test(h));
  if (hv >= 0 && !isFinite(cleanNum(head[hv]))){
    valCol = hv; start = 1;
    const hn = head.findIndex(h => /activity|stream|task|type/i.test(h) && !/record|status|interrupt/i.test(h));
    nameCol = hn >= 0 ? hn : 0;
  }
  const skipped = [];
  for (let li = start; li < rows.length; li++){
    const f = rows[li];
    let vc = valCol;
    if (vc < 0){ for (let j = f.length - 1; j > 0; j--) if (!isBlank(f[j]) && isFinite(cleanNum(f[j]))){ vc = j; break; } }
    const name = (f[nameCol] || '').trim(), v = vc >= 0 ? cleanNum(f[vc]) : NaN;
    if (!name || !isFinite(v) || isBlank(f[vc])){ if (li > 0 || start) skipped.push(li + 1); continue; }
    out.push({ k: key(name), name, v });
  }
  return { rows: out, skipped };
}
// Weekly demand: week start, then one column per work stream (matched by heading)
function parseDemand(text, streams){
  const { delim, rows } = splitLines(text);
  const res = { rows: [], skipped: [], header: false, gaps: 0, dupes: 0, cols: [], unmatched: [], missing: [] };
  if (!rows.length) return res;
  let first = rows[0], cols;
  const dateOf = f => {
    if (delim !== 'ws') return { t: parseDate(f[0]), rest: f.slice(1) };
    for (const k of [3, 1]){ const d = parseDate(f.slice(0, k).join(' ')); if (isFinite(d)) return { t: d, rest: f.slice(k) }; }
    return { t: NaN, rest: [] };
  };
  if (!isFinite(dateOf(first).t)){
    res.header = true;
    const heads = delim === 'ws' ? first.slice(1) : first.slice(1);
    cols = heads.map(h => { const s = streams.find(x => x.k === key(h)); if (!s && !isBlank(h)) res.unmatched.push(h); return s ? s.k : null; });
  } else cols = streams.map(s => s.k);
  res.cols = cols;
  res.missing = streams.filter(s => !cols.includes(s.k)).map(s => s.name);
  const parsed = [];
  rows.forEach((f, li) => {
    if (li === 0 && res.header) return;
    const { t, rest } = dateOf(f);
    if (!isFinite(t)){ res.skipped.push(li + 1); return; }
    const by = {}; let bad = false;
    cols.forEach((k, j) => { if (!k) return; const v = cleanNum(rest[j]); if (!isFinite(v) || v < 0) bad = true; by[k] = (by[k] || 0) + v; });
    if (bad){ res.skipped.push(li + 1); return; }
    parsed.push({ t, by });
  });
  parsed.sort((a, b) => a.t - b.t);
  parsed.forEach(r => { if (!res.rows.length || res.rows[res.rows.length - 1].t !== r.t) res.rows.push(r); });
  res.dupes = parsed.length - res.rows.length;
  for (let i = 1; i < res.rows.length; i++) if (Math.round((res.rows[i].t - res.rows[i - 1].t) / DAY) !== 7) res.gaps++;
  return res;
}

/* ---------- The model ---------- */
function model(){
  const m = { warnings: [] };
  m.pLow = +$('#pctLower').value / 100;
  m.hrsWte = Math.max(1, inputNum('hrsWte', 37.5));
  const away = ['alDays', 'bhDays', 'sickDays', 'trainDays'].map(id => Math.max(0, inputNum(id, 0)));
  m.awayDays = sum(away);
  m.avail = clamp(1 - m.awayDays / 260, 0, 1);
  m.productive = 1 - clamp(inputNum('unmeasured', 0), 0, 90) / 100;
  // Minutes of task time one WTE in post gives in an average week
  m.minPerWte = m.hrsWte * 60 * m.avail * m.productive;
  m.dc = inputNum('demandChange', 0) / 100;
  m.fdr = clamp(inputNum('fdReduce', 0), 0, 100) / 100;

  // Handling times from observations
  const lo = Math.max(0, inputNum('obsMin', 0)), hi = Math.max(lo, inputNum('obsMax', 1e9));
  m.obsParse = parseObs($('#obs').value);
  const groups = new Map();
  m.obsParse.rows.forEach(o => {
    if (!groups.has(o.k)) groups.set(o.k, { name: o.name, all: 0, vals: [] });
    const g = groups.get(o.k); g.all++;
    if (o.v >= lo && o.v <= hi) g.vals.push(o.v);
  });
  m.obs = [...groups.values()].map(g => ({ name: g.name, k: key(g.name), n: g.vals.length, dropped: g.all - g.vals.length, mean: mean(g.vals), median: pctile(g.vals, 0.5), sd: sd(g.vals) }));
  const useObs = $('#useObs').checked;

  // Work streams
  m.streamParse = parseStreams($('#streams').value);
  m.streams = m.streamParse.rows.map(s => {
    const o = m.obs.find(x => x.k === s.k && x.n > 0);
    let mins = s.entered, src = 'Entered';
    if (o && (useObs || !isFinite(mins))){ mins = o.mean; src = `Observed (${plural(o.n, 'time')})`; }
    if (!isFinite(mins)){ mins = 0; src = 'Missing'; }
    return Object.assign({}, s, { mins, src, obs: o || null, factor: (1 + m.dc) * (1 - s.fd * m.fdr) });
  });
  m.streams.filter(s => s.src === 'Missing').forEach(s => m.warnings.push(`${s.name} has no minutes per task, so it adds no demand. Enter a time in step 2 or timed observations in step 3.`));
  m.obs.forEach(o => { o.used = m.streams.some(s => s.obs === o && s.src !== 'Entered'); o.matched = m.streams.some(s => s.k === o.k); });

  // Staff, extra hours and fixed work
  m.staff = parseRoleRows($('#staff').value);
  m.adhoc = parseRoleRows($('#adhoc').value);
  m.fixed = parseRoleRows($('#fixed').value);

  // Roles, in the order they first appear
  const roles = new Map();
  const addRole = r => { if (!roles.has(key(r))) roles.set(key(r), { name: r, k: key(r), streams: [], wte: 0, adhocHrs: 0, fixedMin: 0 }); return roles.get(key(r)); };
  m.streams.forEach(s => addRole(s.role).streams.push(s));
  m.staff.rows.forEach(r => { addRole(r.role).wte += r.v; });
  m.adhoc.rows.forEach(r => { addRole(r.role).adhocHrs += r.v; });
  m.fixed.rows.forEach(r => { addRole(r.role).fixedMin += r.v; });
  m.roles = [...roles.values()];
  m.roles.forEach(r => {
    r.coreMin = r.wte * m.minPerWte;
    r.adhocMin = r.adhocHrs * 60 * m.productive;
    r.availMin = r.coreMin + r.adhocMin;
    if (r.streams.length && !r.wte && !r.adhocHrs) m.warnings.push(`No staff are listed for the role “${r.name}”, so all of its work shows as a gap. Check the role is spelt the same in steps 2 and 5.`);
  });

  m.parse = parseDemand($('#demand').value, m.streams);
  const n = m.parse.rows.length;
  m.ready = m.streams.length > 0 && n >= 10;
  if (!m.ready) return m;

  // Weekly minutes needed, as measured and with the scenarios applied
  m.rows = m.parse.rows.map(r => {
    const raw = {}, adj = {};
    m.streams.forEach(s => { const t = r.by[s.k] || 0; raw[s.k] = t; adj[s.k] = t * s.mins * s.factor; });
    const role = {};
    m.roles.forEach(ro => { role[ro.k] = sum(ro.streams.map(s => adj[s.k])) + ro.fixedMin; });
    const rawMin = sum(m.streams.map(s => raw[s.k] * s.mins)) + sum(m.roles.map(ro => ro.fixedMin));
    return { t: r.t, tasks: raw, role, total: sum(Object.values(role)), rawMin, excl: state.excluded.has(isoDate(r.t)) };
  });

  // Baseline
  let L = clamp(Math.round(inputNum('baseLen', 52)), 10, 52), b0 = -1;
  const bs = $('#baseStart').value;
  if (bs) b0 = m.rows.findIndex(r => isoDate(r.t) === bs);
  if (b0 < 0) b0 = Math.max(0, n - L);
  if (b0 + L > n) L = n - b0;
  if (L < 10){ b0 = Math.max(0, n - 10); L = Math.min(10, n); m.warnings.push('The baseline must be at least 10 weeks, so it has been moved to the most recent 10 weeks.'); }
  m.b0 = b0; m.L = L; m.baseStart = m.rows[b0].t;
  const base = m.rows.slice(b0, b0 + L).filter(r => !r.excl);
  m.baseN = base.length;
  if (base.length < 5){ m.ready = false; m.warnings.push('Too many weeks are left out of the baseline to calculate it. Include more weeks.'); return m; }

  const stats = vals => ({ avg: mean(vals), lo: pctile(vals, m.pLow), hi: pctile(vals, 0.85) });
  m.roles.forEach(r => {
    Object.assign(r, stats(base.map(w => w.role[r.k])));
    r.gapLo = Math.max(0, r.lo - r.availMin); r.gapHi = Math.max(0, r.hi - r.availMin);
  });
  m.total = stats(base.map(w => w.total));
  m.total.availMin = sum(m.roles.map(r => r.availMin));
  m.total.coreMin = sum(m.roles.map(r => r.coreMin));
  m.total.adhocMin = sum(m.roles.map(r => r.adhocMin));
  m.total.wte = sum(m.roles.map(r => r.wte));
  m.total.fixedMin = sum(m.roles.map(r => r.fixedMin));
  m.total.gapLo = Math.max(0, m.total.lo - m.total.availMin);
  m.total.gapHi = Math.max(0, m.total.hi - m.total.availMin);
  m.roleGapLo = sum(m.roles.map(r => r.gapLo));
  m.roleGapHi = sum(m.roles.map(r => r.gapHi));
  m.shortRoles = m.roles.filter(r => wte(m, r.gapLo) >= 0.005);

  // Each work stream over the baseline, its sustainable queue and backlog
  m.streams.forEach(s => {
    s.tasksWk = mean(base.map(w => w.tasks[s.k])) * s.factor;
    s.minWk = s.tasksWk * s.mins;
    s.fdMinWk = mean(base.map(w => w.tasks[s.k])) * (1 + m.dc) * s.fd * (1 - m.fdr) * s.mins;
    // Like the core model: tasks are done, on average, halfway through the turnaround time
    s.sus = isFinite(s.days) ? s.tasksWk * (s.days / 5) / 2 : 0;
    s.backlog = s.wait == null ? 0 : Math.max(0, s.wait - s.sus);
    s.backlogMin = s.backlog * s.mins;
  });
  m.share = m.total.avg ? (s => s.minWk / m.total.avg) : (() => 0);
  m.hasWait = m.streams.some(s => s.wait != null);
  m.backlogMin = sum(m.streams.map(s => s.backlogMin));
  m.waitMin = sum(m.streams.map(s => (s.wait || 0) * s.mins));
  m.susMin = sum(m.streams.map(s => s.wait == null ? 0 : Math.min(s.wait, s.sus) * s.mins));
  m.roles.forEach(r => { r.backlogMin = sum(r.streams.map(s => s.backlogMin)); });
  m.clearWeeks = Math.max(1, Math.round(inputNum('clearWeeks', 12)));
  m.clearMinWk = m.backlogMin / m.clearWeeks;
  m.netAvg = m.total.availMin - m.total.avg;
  m.netHi = m.total.availMin - m.total.hi;
  // A role's backlog can only be cleared with that role's spare time
  m.backRoles = m.roles.filter(r => r.backlogMin > 0);
  m.backRoles.forEach(r => { r.netAvg = r.availMin - r.avg; r.netHi = r.availMin - r.hi; });
  m.stuckRoles = m.backRoles.filter(r => r.netAvg <= 0);
  m.backRoles.forEach(r => { r.toClear = r.netAvg > 0 ? r.backlogMin / r.netAvg : Infinity; });
  m.weeksToClear = !m.backRoles.length ? 0 : Math.max(...m.backRoles.map(r => r.toClear));
  m.limitRole = m.backRoles.reduce((a, r) => !a || r.toClear > a.toClear ? r : a, null);
  m.backlogAt = (t, busy) => sum(m.backRoles.map(r => Math.max(0, r.backlogMin - (busy ? r.netHi : r.netAvg) * t)));

  // SPC on total weekly hours, limits from the baseline
  const mrs = []; for (let i = b0 + 1; i < b0 + L; i++) if (!m.rows[i].excl && !m.rows[i - 1].excl) mrs.push(Math.abs(m.rows[i].total - m.rows[i - 1].total));
  m.spc = { mean: m.total.avg, sigma: mrs.length ? mean(mrs) / 1.128 : 0 };
  const pts = m.rows.map((r, i) => ({ i, v: r.total })).filter(p => !m.rows[p.i].excl), mu = m.spc.mean, sg = m.spc.sigma;
  m.signals = {};
  const mark = (i, k) => { if (!m.signals[i]) m.signals[i] = k; };
  pts.forEach(p => { if (sg > 0 && Math.abs(p.v - mu) > 3 * sg) mark(p.i, 'r1'); });
  for (let j = 0; j + 2 < pts.length; j++){
    const w = pts.slice(j, j + 3);
    for (const side of [1, -1]){
      if (!w.every(p => side * (p.v - mu) > 0)) continue;
      const far = w.filter(p => sg > 0 && side * (p.v - mu) > 2 * sg);
      if (far.length >= 2) far.forEach(p => mark(p.i, 'r2'));
    }
  }
  for (let j = 0; j + 5 < pts.length; j++){
    const w = pts.slice(j, j + 6);
    const up = w.every((p, q) => q === 0 || p.v > w[q - 1].v), dn = w.every((p, q) => q === 0 || p.v < w[q - 1].v);
    if (up || dn) w.forEach(p => mark(p.i, 'r3'));
  }
  let run = [], runSide = 0;
  const flush = () => { if (run.length >= 9) run.forEach(p => mark(p.i, 'r4')); };
  pts.forEach(p => {
    const side = Math.sign(p.v - mu);
    if (side !== 0 && side === runSide) run.push(p);
    else { flush(); run = side ? [p] : []; runSide = side; }
  });
  flush();
  m.baseSignals = Object.keys(m.signals).map(Number).filter(i => i >= b0 && i < b0 + L);
  return m;
}
const hrs = mins => mins / 60;
const wte = (m, mins) => m.minPerWte > 0 ? mins / m.minPerWte : NaN;
const spareText = mins => mins >= 0 ? `${fmt1(hrs(mins))} spare hours` : `a shortfall of ${fmt1(hrs(-mins))} hours`;
const gapW = (m, mins) => wte(m, mins) >= 0.005 ? fmtW(wte(m, mins)) : '–';

/* ---------- Charts (SVG strings) ---------- */
function axisY(x0, y0, w, h, max, p, label){
  let s = '';
  ticks(max).forEach(v => {
    const y = y0 + h - v / max * h;
    s += `<line x1="${x0}" x2="${x0 + w}" y1="${y}" y2="${y}" stroke="${p.grid}"/>`;
    s += `<text x="${x0 - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${p.muted}">${tickLabel(v)}</text>`;
  });
  if (label) s += `<text transform="translate(14 ${y0 + h / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${p.muted}">${esc(label)}</text>`;
  return s;
}
function dateTicks(times, x, y, p){
  const long = times.length > 70, cand = [];
  let last = null;
  times.forEach((t, i) => {
    const d = new Date(t), q = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (last !== null && q === last) return;
    last = q;
    if (long && i > 0 && d.getUTCMonth() % 3 !== 0) return;
    cand.push({ i, d, year: d.getUTCMonth() < (long ? 3 : 1) || i === 0 });
  });
  // Year labels first, then months where they fit, so narrow charts keep the years
  const placed = [];
  const fits = c => placed.every(o => { const [a, b] = x(o.i) < x(c.i) ? [o, c] : [c, o]; return x(b.i) - x(a.i) >= (a.year ? 62 : 34); });
  cand.filter(c => c.year).concat(cand.filter(c => !c.year)).forEach(c => { if (fits(c)) placed.push(c); });
  return placed.map(({ i, d, year }) => `<line x1="${x(i)}" x2="${x(i)}" y1="${y}" y2="${y + 5}" stroke="${p.limit}"/><text x="${x(i) + 2}" y="${y + 18}" font-size="11.5" fill="${p.muted}">${MON[d.getUTCMonth()]}${year ? ` <tspan font-weight="600">${d.getUTCFullYear()}</tspan>` : ''}</text>`).join('');
}

function demandChart(m, W, p, interactive){
  const H = 340, padL = 58, padR = 16, padT = 14, padB = 40;
  const w = W - padL - padR, h = H - padT - padB, n = m.rows.length;
  const mu = hrs(m.spc.mean), sg = hrs(m.spc.sigma), cap = hrs(m.total.availMin), core = hrs(m.total.coreMin);
  const max = niceMax(Math.max(...m.rows.map(r => hrs(r.total)), mu + 3 * sg, cap) * 1.05);
  const step = n > 1 ? w / (n - 1) : w, x = i => padL + i * step, y = v => padT + h - v / max * h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Weekly demand in hours against available staff hours">`;
  const bx0 = Math.max(padL, x(m.b0) - step / 2), bx1 = Math.min(padL + w, x(m.b0 + m.L - 1) + step / 2);
  s += `<rect x="${bx0}" y="${padT}" width="${bx1 - bx0}" height="${h}" fill="${p.s1}"/>`;
  s += axisY(padL, padT, w, h, max, p, 'Hours per week');
  const hl = (v, c, wd, dash) => `<line x1="${padL}" x2="${padL + w}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="${wd}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  s += hl(Math.max(0, mu - 3 * sg), p.limit, 1.3, '5 4') + hl(mu + 3 * sg, p.limit, 1.3, '5 4') + hl(mu, p.limit, 1.5);
  if (state.showPct) s += hl(hrs(m.total.lo), p.req, 1.5, '2 3') + hl(hrs(m.total.hi), p.req, 2);
  if (cap > core + 0.01) s += hl(cap, p.adhoc, 2.5);
  s += hl(core, p.core, 2.5);
  let d = '', pen = false;
  m.rows.forEach((r, i) => { if (r.excl){ pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)} ${y(hrs(r.total))}`; pen = true; });
  s += `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  m.rows.forEach((r, i) => {
    const v = hrs(r.total), sig = m.signals[i];
    const t = `${fmtDate(r.t)}: ${fmt1(v)} hours${r.excl ? ' (left out)' : sig ? ' (special cause)' : ''}${interactive ? '. Click to ' + (r.excl ? 'include' : 'leave out') : ''}`;
    let mk;
    if (r.excl) mk = `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${p.surface}" stroke="${p.muted}" stroke-width="1.5"/>`;
    else if (sig) mk = `<rect x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8" fill="${p[sig]}"/>`;
    else mk = n <= 80 ? `<circle cx="${x(i)}" cy="${y(v)}" r="2.2" fill="${p.line}"/>` : '';
    s += interactive ? `<g class="pt" data-i="${i}">${mk}<circle cx="${x(i)}" cy="${y(v)}" r="${Math.max(5, Math.min(9, step / 2))}" fill="transparent"><title>${t}</title></circle></g>` : mk;
  });
  s += `<line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" stroke="${p.limit}"/>`;
  s += dateTicks(m.rows.map(r => r.t), x, padT + h, p);
  return s + '</svg>';
}

function roleChart(m, W, p){
  const list = m.roles.concat([{ name: 'All roles', all: true, lo: m.total.lo, hi: m.total.hi, avg: m.total.avg, availMin: m.total.availMin }]);
  const rh = 40, padL = Math.min(220, Math.max(110, 12 + 7.2 * Math.max(...list.map(r => r.name.length)))), padR = 24, top = 8, H = top + list.length * rh + 36;
  const w = W - padL - padR;
  const max = niceMax(Math.max(1, ...list.map(r => Math.max(hrs(r.hi), hrs(r.availMin)))) * 1.08);
  const x = v => padL + v / max * w;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Hours needed against hours available for each role">`;
  ticks(max).forEach(v => {
    s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + list.length * rh}" stroke="${p.grid}"/><text x="${x(v)}" y="${top + list.length * rh + 16}" font-size="12" text-anchor="middle" fill="${p.muted}">${tickLabel(v)}</text>`;
  });
  s += `<text x="${padL + w / 2}" y="${H - 2}" font-size="12" text-anchor="middle" fill="${p.muted}">Hours per week</text>`;
  list.forEach((r, i) => {
    const yy = top + i * rh, cy = yy + rh / 2;
    if (r.all) s += `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" stroke="${p.rule}"/>`;
    s += `<text x="${padL - 10}" y="${cy + 4}" font-size="13" text-anchor="end" fill="${p.ink}"${r.all ? ' font-weight="600"' : ''}>${esc(r.name.length > 30 ? r.name.slice(0, 29) + '…' : r.name)}</text>`;
    s += `<rect x="${x(hrs(r.lo))}" y="${cy - 8}" width="${Math.max(2, x(hrs(r.hi)) - x(hrs(r.lo)))}" height="16" rx="2" fill="${p.req}"><title>${esc(r.name)}: needs ${fmt1(hrs(r.lo))} to ${fmt1(hrs(r.hi))} hours a week</title></rect>`;
    const ax = x(hrs(r.availMin)), short = r.availMin < r.lo;
    s += `<line x1="${ax}" x2="${ax}" y1="${cy - 14}" y2="${cy + 14}" stroke="${p.core}" stroke-width="3"><title>${esc(r.name)}: ${fmt1(hrs(r.availMin))} hours a week available</title></line>`;
    if (short) s += `<path d="M${ax + 6} ${cy - 15}l6 0l-3 -5z" fill="${p.r1}"/>`;
  });
  return s + '</svg>';
}

function burnChart(m, W, p){
  const H = 280, padL = 58, padR = 16, padT = 14, padB = 40;
  const w = W - padL - padR, h = H - padT - padB;
  const B0 = hrs(m.backlogMin), N = m.clearWeeks, toClear = m.weeksToClear;
  const span = Math.round(clamp(isFinite(toClear) ? Math.max(toClear * 1.1, N + 4) : Math.max(26, N * 2), N + 4, 104));
  const at = (busy, t) => hrs(m.backlogAt(t, busy));
  const max = niceMax(Math.max(B0, at(false, span), at(true, span)) * 1.05);
  const x = t => padL + t / span * w, y = v => padT + h - v / max * h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Projected backlog in hours of work">`;
  s += axisY(padL, padT, w, h, max, p, 'Backlog (hours of work)');
  const line = (busy, c, wd, dash, t) => {
    const pts = [];
    for (let k = 0; k <= span; k++) pts.push(`${k ? 'L' : 'M'}${x(k)} ${y(at(busy, k))}`);
    return `<path d="${pts.join('')}" fill="none" stroke="${c}" stroke-width="${wd}"${dash ? ` stroke-dasharray="${dash}"` : ''}><title>${esc(t)}</title></path>`;
  };
  s += line(true, p.r4, 2, '6 4', 'Current staffing, busier weeks (85th percentile)');
  s += line(false, p.line, 2.5, '', 'Current staffing, average demand');
  s += `<path d="M${x(0)} ${y(B0)}L${x(N)} ${y(0)}L${x(span)} ${y(0)}" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="2 3"><title>Plan: clear in ${N} weeks</title></path>`;
  s += `<line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" stroke="${p.limit}"/>`;
  const st = span <= 30 ? 2 : span <= 60 ? 5 : 10;
  for (let k = 0; k <= span; k += st) s += `<line x1="${x(k)}" x2="${x(k)}" y1="${padT + h}" y2="${padT + h + 5}" stroke="${p.limit}"/><text x="${x(k)}" y="${padT + h + 18}" font-size="11.5" text-anchor="middle" fill="${p.muted}">${k}</text>`;
  s += `<text x="${padL + w / 2}" y="${H - 4}" font-size="12" text-anchor="middle" fill="${p.muted}">Weeks from now</text>`;
  return s + '</svg>';
}

/* ---------- Plain-English reading ---------- */
function verdict(m){
  const T = m.total, av = T.availMin, pl = `${Math.round(m.pLow * 100)}th`;
  const g = v => `${fmtW(wte(m, v - av))} WTE`;
  const short = m.shortRoles.map(r => r.name).join(', '), are = m.shortRoles.length === 1 ? 'is' : 'are';
  if (av >= T.lo && m.shortRoles.length) return { cls: 'warn', head: `The team has enough staff time overall, but ${short} ${are} short.`, body: `${fmt1(hrs(av))} hours a week of task time meets the ${av >= T.hi ? '85th' : pl} percentile of the team’s demand (${fmt1(hrs(av >= T.hi ? T.hi : T.lo))} hours). Work for ${short} will build up unless other staff can take some of it on: see By role.` };
  if (av >= T.hi) return { cls: 'ok', head: 'The team has enough staff time, even in busier weeks.', body: `${fmt1(hrs(av))} hours a week of task time meets the 85th percentile of demand (${fmt1(hrs(T.hi))} hours). Backlogs should stay stable or fall.` };
  if (av >= T.lo) return { cls: 'warn', head: 'The team has enough staff time for typical weeks, but not busier ones.', body: `About ${g(T.hi)} more would meet the 85th percentile of demand. Consider this if the work is urgent or very variable.` };
  if (av >= T.avg) return { cls: 'bad', head: 'Staff time covers average demand, but not its variation.', body: `About ${g(T.lo)} more is needed to meet the ${pl} percentile. Work will build up in busier weeks and may not be cleared in quieter ones.` };
  return { cls: 'bad', head: 'Staff time is below average demand.', body: `Demand needs ${fmt1(hrs(T.avg))} hours a week on average but only ${fmt1(hrs(av))} is available, so work builds up by about ${fmt1(hrs(T.avg - av))} hours a week. About ${g(T.lo)} more is needed to meet the ${pl} percentile.` };
}
function readingText(m){
  const T = m.total, pl = `${Math.round(m.pLow * 100)}th`, out = [];
  const be = m.rows[m.b0 + m.L - 1].t;
  out.push(`Over the baseline (${plural(m.L, 'week')}, ${fmtDate(m.baseStart)} to ${fmtDate(be)}${m.baseN < m.L ? `, ${plural(m.L - m.baseN, 'week')} left out` : ''}), the team’s work needed ${fmt1(hrs(T.avg))} hours a week on average${T.fixedMin ? `, including ${fmt1(hrs(T.fixedMin))} hours of fixed work` : ''}.${m.dc ? ` This includes a ${fmt(Math.abs(m.dc * 100), 1)}% ${m.dc > 0 ? 'rise' : 'fall'} in demand.` : ''}${m.fdr ? ` It assumes ${fmt(m.fdr * 100)}% of failure demand is removed.` : ''}`);
  out.push(`Allowing for weekly variation, the team needs ${fmt1(hrs(T.lo))} to ${fmt1(hrs(T.hi))} hours of task time a week (the ${pl} to 85th percentile of weekly demand). Each WTE in post gives ${fmt1(hrs(m.minPerWte))} hours of task time a week, after ${fmt(m.awayDays)} days away a year and ${fmt((1 - m.productive) * 100)}% of time not on listed tasks. So the team needs ${fmtW(wte(m, T.lo))} to ${fmtW(wte(m, T.hi))} WTE in post and has ${fmtW(T.wte)} WTE${T.adhocMin ? ` plus ${fmt1(hrs(T.adhocMin / m.productive))} extra hours a week` : ''}.`);
  const v = verdict(m); out.push(v.head + ' ' + v.body);
  if (m.roles.length > 1){
    if (m.shortRoles.length) out.push(`By role, ${m.shortRoles.map(r => `${r.name} needs ${fmtW(wte(m, r.gapLo))} to ${fmtW(wte(m, r.gapHi))} WTE more`).join('; ')}. If staff can’t cover each other’s work, the team needs ${fmtW(wte(m, m.roleGapLo))} to ${fmtW(wte(m, m.roleGapHi))} WTE more in total${T.gapHi > 0 ? `, compared with ${gapW(m, T.gapLo)} to ${fmtW(wte(m, T.gapHi))} if all work could be shared` : ', but none if all work could be shared'}. A role that is short while others have spare time is the constraint: look at moving tasks to other roles or training staff before recruiting.`);
    else out.push('Each role has enough time for the work assigned to it at the ' + pl + ' percentile.');
  }
  if (m.backlogMin > 0){
    const t = isFinite(m.weeksToClear) ? `At current staffing and average demand it would take about ${plural(Math.ceil(m.weeksToClear), 'week')} to clear${m.backRoles.length > 1 ? `, held back by ${m.limitRole.name}` : ''}, longer if demand runs high.` : `At current staffing it will not clear on its own: ${m.stuckRoles.map(r => r.name).join(', ')} ${m.stuckRoles.length === 1 ? 'has' : 'have'} no spare time in an average week, so ${m.stuckRoles.length === 1 ? 'its' : 'their'} backlog grows.`;
    out.push(`There is a backlog of about ${fmt1(hrs(m.backlogMin))} hours of work above what your turnaround targets allow. ${t} Clearing it in ${plural(m.clearWeeks, 'week')} needs ${fmt1(hrs(m.clearMinWk))} extra hours a week (${fmtW(wte(m, m.clearMinWk))} WTE) for that time only, on top of meeting demand. Plan this as time-limited capacity, such as bank or overtime, separate from any permanent posts.`);
  } else if (m.hasWait) out.push('Work waiting now is within what your turnaround targets allow, so there is no backlog to clear.');
  const fd = sum(m.streams.map(s => s.fdMinWk));
  if (fd > 0) out.push(`About ${fmt1(hrs(fd))} hours a week (${fmt(fd / T.avg * 100)}% of demand) is failure demand, such as chasers and rework. Reducing it releases capacity without recruiting: try the failure demand scenario in step 6.`);
  if (m.baseSignals.length) out.push(`${plural(m.baseSignals.length, 'week')} in the baseline ${m.baseSignals.length === 1 ? 'shows' : 'show'} special cause variation. Check whether ${m.baseSignals.length === 1 ? 'it reflects' : 'they reflect'} something unusual, such as a data problem or a one-off event, and consider leaving ${m.baseSignals.length === 1 ? 'it' : 'them'} out.`);
  return out;
}

/* ---------- Render ---------- */
const out = $('#output');
const ICON = {
  ok: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.2 10.2 2.5 2.5 5-5.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  warn: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 18 17H2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 8v4.2M10 14.2v.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};
ICON.bad = ICON.warn;

function emptyState(m){
  const msgs = [];
  if (!m.streams.length) msgs.push('List your work streams and minutes per task in step 2, or click Example to see how the tool works.');
  else if (!m.parse.rows.length) msgs.push('Paste at least 10 weeks of demand in step 4, with a heading for each work stream.');
  else if (m.parse.rows.length < 10) msgs.push(`Add more weeks of demand: you have ${plural(m.parse.rows.length, 'week')} and the model needs at least 10 (ideally 52 or more).`);
  return `<div class="empty">${msgs.concat(m.warnings).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
}

function renderAll(){
  const m = model(); state.m = m;
  const svc = $('#service').value.trim();
  $('#outTitle').textContent = svc ? `${svc}: demand and capacity` : 'Your admin demand and capacity summary';
  statusLines(m);
  if (!m.ready){ out.innerHTML = emptyState(m); return; }
  trackChart({ points: m.rows.length, streams: m.streams.length, roles: m.roles.length });
  const T = m.total, v = verdict(m), pl = `${Math.round(m.pLow * 100)}th`;
  let h = '';
  h += `<section class="out-sec" aria-labelledby="hCap">
    <div class="out-head"><h3 id="hCap">Staff time needed against staff time available</h3>
      <div class="opts"><label class="check"><input type="checkbox" id="optPct"${state.showPct ? ' checked' : ''}> Show percentiles</label></div></div>
    <p class="lead">Task time per week. WTE are staff in post, after leave, sickness, training and time not on listed tasks.</p>
    <div class="kpis">
      <div class="kpi"><h4>Needed a week</h4><div class="big">${fmt1(hrs(T.lo))}–${fmt1(hrs(T.hi))} <small>hours</small></div><p>${pl} to 85th percentile: ${fmtW(wte(m, T.lo))}–${fmtW(wte(m, T.hi))} WTE. Average ${fmt1(hrs(T.avg))} hours.</p></div>
      <div class="kpi"><h4>Available a week</h4><div class="big">${fmt1(hrs(T.availMin))} <small>hours</small></div><dl><dt>Staff in post</dt><dd>${fmtW(T.wte)} WTE</dd><dt>From extra hours</dt><dd>${fmt1(hrs(T.adhocMin))} h</dd></dl></div>
      <div class="kpi"><h4>Gap to 85th percentile</h4><div class="big">${gapW(m, T.gapHi) !== '–' ? `${fmtW(wte(m, T.gapHi))} <small>WTE</small>` : 'None'}</div><p>${gapW(m, T.gapLo) !== '–' ? `${fmtW(wte(m, T.gapLo))} WTE short of the ${pl} percentile.` : `Meets the ${pl} percentile.`}${m.roles.length > 1 && wte(m, m.roleGapHi - T.gapHi) >= 0.005 ? ` ${fmtW(wte(m, m.roleGapHi))} WTE if roles can’t share work.` : ''}</p></div>
    </div>
    <div class="verdict ${v.cls}">${ICON[v.cls]}<div><p><strong>${esc(v.head)}</strong></p><p>${esc(v.body)}</p></div></div>
    <div class="chart-box" id="demBox"></div>
    <div class="legend"><span><i class="ln" style="border-color:var(--line)"></i>Weekly demand (hours)</span><span><i class="ln" style="border-color:var(--limit)"></i>Mean</span><span><i class="ln d" style="border-color:var(--limit)"></i>Control limits</span>${state.showPct ? `<span><i class="ln" style="border-color:var(--req)"></i>85th percentile</span><span><i class="ln d" style="border-color:var(--req)"></i>${pl} percentile</span>` : ''}<span><i class="ln" style="border-color:var(--core)"></i>Available (staff in post)</span>${T.adhocMin ? '<span><i class="ln" style="border-color:var(--adhoc)"></i>Available (with extra hours)</span>' : ''}<span><i class="dot" style="background:var(--surface);border:1.5px solid var(--muted)"></i>Left out</span></div>
    <ul class="signals" aria-label="Special cause variation markers">${RULES.map(r => `<li><i class="dot" style="background:var(--${r.key});border-radius:1px"></i>${esc(r.text)}</li>`).join('')}</ul>
    <p class="note">Shading marks the baseline. Click a point to leave that week out of the baseline, or include it again. Demand includes fixed work and your scenarios.</p>
  </section>`;

  h += `<section class="out-sec" aria-labelledby="hRole">
    <div class="out-head"><h3 id="hRole">By role</h3></div>
    <p class="lead">Each role’s work against its staff time. Blue bars are the hours needed (${pl} to 85th percentile); green lines are the hours available.</p>
    <div class="chart-box" id="roleBox"></div>
    <div class="tablewrap" style="max-height:none" tabindex="0" role="region" aria-labelledby="hRole"><table><thead><tr><th class="l">Role</th><th>WTE in post</th><th>Available (h/wk)</th><th>Needed, average (h/wk)</th><th>Needed, ${pl} (h/wk)</th><th>Needed, 85th (h/wk)</th><th>Gap, ${pl} (WTE)</th><th>Gap, 85th (WTE)</th>${m.backlogMin ? '<th>Backlog (h)</th>' : ''}</tr></thead><tbody>${m.roles.map(r => `<tr><td class="l">${esc(r.name)}</td><td>${fmtW(r.wte)}</td><td>${fmt1(hrs(r.availMin))}</td><td>${fmt1(hrs(r.avg))}</td><td>${fmt1(hrs(r.lo))}</td><td>${fmt1(hrs(r.hi))}</td><td>${gapW(m, r.gapLo)}</td><td>${gapW(m, r.gapHi)}</td>${m.backlogMin ? `<td>${fmt1(hrs(r.backlogMin))}</td>` : ''}</tr>`).join('')}
      <tr><td class="l"><strong>All roles, work shared</strong></td><td><strong>${fmtW(T.wte)}</strong></td><td><strong>${fmt1(hrs(T.availMin))}</strong></td><td><strong>${fmt1(hrs(T.avg))}</strong></td><td><strong>${fmt1(hrs(T.lo))}</strong></td><td><strong>${fmt1(hrs(T.hi))}</strong></td><td><strong>${gapW(m, T.gapLo)}</strong></td><td><strong>${gapW(m, T.gapHi)}</strong></td>${m.backlogMin ? `<td><strong>${fmt1(hrs(m.backlogMin))}</strong></td>` : ''}</tr>
      ${m.roles.length > 1 ? `<tr><td class="l">Sum of role gaps (roles can’t share work)</td><td></td><td></td><td></td><td></td><td></td><td>${gapW(m, m.roleGapLo)}</td><td>${gapW(m, m.roleGapHi)}</td>${m.backlogMin ? '<td></td>' : ''}</tr>` : ''}</tbody></table></div>
    <p class="note">Each percentile is taken from that role’s own weekly totals, so the role figures don’t add up to the all-roles figure: busy weeks for one role aren’t always busy for another.</p>
  </section>`;

  if (m.hasWait){
    const t = isFinite(m.weeksToClear) ? (m.weeksToClear ? `About ${plural(Math.ceil(m.weeksToClear), 'week')} at average demand.` : 'No backlog.') : 'Won’t clear: it grows in an average week.';
    const lr = m.limitRole;
    h += `<section class="out-sec" aria-labelledby="hBack">
      <div class="out-head"><h3 id="hBack">Backlog</h3></div>
      <p class="lead">Work waiting now, against the amount your turnaround targets allow (on average, tasks are done halfway through the target time). The backlog is the extra, in hours of work. Each role’s backlog is cleared only with that role’s spare time.</p>
      <div class="kpis">
        <div class="kpi"><h4>Waiting now</h4><div class="big">${fmt1(hrs(m.waitMin))} <small>hours</small></div><p>Tasks waiting × minutes per task.</p></div>
        <div class="kpi"><h4>Backlog</h4><div class="big">${m.backlogMin ? `${fmt1(hrs(m.backlogMin))} <small>hours</small>` : 'None'}</div><p>Above what the turnaround targets allow.</p></div>
        <div class="kpi"><h4>Clear in ${plural(m.clearWeeks, 'week')}</h4><div class="big">${m.backlogMin ? `${fmt1(hrs(m.clearMinWk))} <small>h/wk</small>` : '–'}</div><p>${m.backlogMin ? `${fmtW(wte(m, m.clearMinWk))} WTE, time-limited, on top of meeting demand.` : 'Nothing to clear.'}</p></div>
        <div class="kpi"><h4>At current staffing</h4><div class="big" style="font-size:18px">${esc(t)}</div><p>${lr ? `Slowest to clear: ${esc(lr.name)}, with ${spareText(lr.netAvg)} a week at average demand and ${spareText(lr.netHi)} at the 85th percentile.` : `Spare time a week: ${fmt1(hrs(m.netAvg))} hours at average demand.`}</p></div>
      </div>
      ${m.backlogMin ? `<div class="chart-box" id="burnBox"></div>
      <div class="legend"><span><i class="ln" style="border-color:var(--line)"></i>Current staffing, average demand</span><span><i class="ln d" style="border-color:var(--r4)"></i>Current staffing, busier weeks (85th percentile)</span><span><i class="ln d" style="border-color:var(--accent)"></i>Plan: clear in ${plural(m.clearWeeks, 'week')}</span></div>` : ''}
    </section>`;
  }

  h += `<section class="out-sec" aria-labelledby="hStreams">
    <div class="out-head"><h3 id="hStreams">Work streams</h3></div>
    <p class="lead">Baseline averages, with your scenarios applied.</p>
    <div class="tablewrap" style="max-height:none" tabindex="0" role="region" aria-labelledby="hStreams"><table><thead><tr><th class="l">Work stream</th><th class="l">Role</th><th>Tasks a week</th><th>Minutes per task</th><th class="l">Time from</th><th>Hours a week</th><th>Share of demand</th><th>Failure demand (h/wk)</th><th>Turnaround (days)</th><th>Waiting now</th><th>Sustainable</th><th>Backlog</th></tr></thead><tbody>${m.streams.map(s => `<tr><td class="l">${esc(s.name)}</td><td class="l">${esc(s.role)}</td><td>${fmt1(s.tasksWk)}</td><td>${fmt(s.mins, 1)}</td><td class="l">${esc(s.src)}</td><td>${fmt1(hrs(s.minWk))}</td><td>${fmt(m.share(s) * 100, 1)}%</td><td>${s.fdMinWk ? fmt1(hrs(s.fdMinWk)) : '–'}</td><td>${isFinite(s.days) ? fmt(s.days, 1) : '–'}</td><td>${s.wait == null ? '–' : fmt(s.wait)}</td><td>${s.wait == null ? '–' : fmt(s.sus)}</td><td>${s.wait == null ? '–' : fmt(s.backlog)}</td></tr>`).join('')}</tbody></table></div>
    ${m.parse.missing.length ? `<p class="note warn">No demand column for: ${esc(m.parse.missing.join(', '))}. Add a column with a matching heading in step 4.</p>` : ''}
  </section>`;

  if (m.obs.length){
    h += `<section class="out-sec" aria-labelledby="hObs">
      <div class="out-head"><h3 id="hObs">Timed observations</h3></div>
      <p class="lead">The mean is used for workload: mean × tasks gives total time. The median is lower when a few tasks take much longer, so it would understate the work.</p>
      <div class="tablewrap" style="max-height:none" tabindex="0" role="region" aria-labelledby="hObs"><table><thead><tr><th class="l">Work stream</th><th>Times used</th><th>Left out</th><th>Mean (min)</th><th>Median (min)</th><th>SD (min)</th><th class="l">Used in model</th></tr></thead><tbody>${m.obs.map(o => `<tr><td class="l">${esc(o.name)}</td><td>${fmt(o.n)}</td><td>${o.dropped ? fmt(o.dropped) : '–'}</td><td>${fmt(o.mean, 1)}</td><td>${fmt(o.median, 1)}</td><td>${fmt(o.sd, 1)}</td><td class="l">${!o.matched ? 'No matching work stream' : o.used ? 'Yes' : 'No (entered time used)'}</td></tr>`).join('')}</tbody></table></div>
      ${m.obs.some(o => o.matched && o.n > 0 && o.n < 20) ? '<p class="note warn">Some work streams have fewer than 20 timed tasks. Time more if you can: small samples give unstable means.</p>' : ''}
    </section>`;
  }

  h += `<section class="reading" aria-labelledby="hRead"><h3 id="hRead">What this means</h3>${readingText(m).map(t => `<p>${esc(t)}</p>`).join('')}
    ${m.warnings.map(t => `<p class="note warn">${esc(t)}</p>`).join('')}
    <p class="note">This tool follows the NHS England demand and capacity approach, with demand, capacity and backlog in units of time and capacity planned between the ${pl} and 85th percentile of weekly demand. It works week by week, so it doesn’t show peaks within a day: for phone lines and front desks, also compare demand and staffing by hour. Process map the work and find the constraint before deciding how to close a gap.</p></section>`;

  h += `<details class="values"><summary>Week by week values</summary>
    <div class="tablewrap"><table><thead><tr><th class="l">Week starting</th><th>Demand (h)</th>${m.roles.map(r => `<th>${esc(r.name)} (h)</th>`).join('')}<th class="l">Baseline</th><th>Leave out</th></tr></thead><tbody>${m.rows.map((r, i) => { const inB = i >= m.b0 && i < m.b0 + m.L; return `<tr class="${inB ? 'base' : ''}${r.excl ? ' excl' : ''}"><td class="l">${fmtDate(r.t)}</td><td>${fmt(hrs(r.total), 1)}</td>${m.roles.map(ro => `<td>${fmt(hrs(r.role[ro.k]), 1)}</td>`).join('')}<td class="l">${inB ? 'Yes' : ''}${m.signals[i] ? ' · special cause' : ''}</td><td><input type="checkbox" data-ex="${i}"${r.excl ? ' checked' : ''} aria-label="Leave out week starting ${fmtDate(r.t)}"></td></tr>`; }).join('')}</tbody></table></div>
  </details>`;
  out.innerHTML = h;
  drawCharts();
}

function drawCharts(){
  const m = state.m; if (!m || !m.ready) return;
  const p = palette();
  const box = id => { const el = $('#' + id); return el ? [el, Math.max(320, Math.round(el.clientWidth || 800))] : [null, 0]; };
  let [el, W] = box('demBox'); if (el) el.innerHTML = demandChart(m, W, p, true);
  [el, W] = box('roleBox'); if (el) el.innerHTML = roleChart(m, W, p);
  [el, W] = box('burnBox'); if (el) el.innerHTML = burnChart(m, W, p);
}

function toggleWeek(i){
  const m = state.m; if (!m || !m.rows[i]) return;
  const k = isoDate(m.rows[i].t);
  if (state.excluded.has(k)) state.excluded.delete(k); else state.excluded.add(k);
  renderAll();
}
out.addEventListener('click', e => {
  const g = e.target.closest('.pt'); if (g) toggleWeek(+g.dataset.i);
});
out.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'optPct'){ state.showPct = t.checked; renderAll(); }
  else if (t.dataset.ex != null){ toggleWeek(+t.dataset.ex); }
});

/* ---------- Status lines and dependent fields ---------- */
function setStatus(id, text, warn){ const el = $('#' + id); el.textContent = text; el.className = 'status' + (warn ? ' warn' : ''); }
function statusLines(m){
  const sp = m.streamParse;
  if (!$('#streams').value.trim()) setStatus('streamsStatus', '');
  else setStatus('streamsStatus', `${plural(sp.rows.length, 'work stream')} read.${sp.skipped.length ? ` ${plural(sp.skipped.length, 'line')} skipped (check the numbers, or a repeated name).` : ''}`, sp.skipped.length);
  const op = m.obsParse;
  if (!$('#obs').value.trim()) setStatus('obsStatus', '');
  else {
    const dropped = sum(m.obs.map(o => o.dropped)), unmatched = m.obs.filter(o => !m.streams.some(s => s.k === o.k)).length;
    setStatus('obsStatus', `${plural(op.rows.length, 'timed task')} for ${plural(m.obs.length, 'work stream')}.${dropped ? ` ${plural(dropped, 'time')} outside the limits left out.` : ''}${unmatched ? ` ${plural(unmatched, 'name')} not matching a work stream.` : ''}${op.skipped.length ? ` ${plural(op.skipped.length, 'line')} skipped.` : ''}`, unmatched || op.skipped.length);
  }
  const p = m.parse;
  if (!$('#demand').value.trim() || !p) setStatus('demandStatus', '');
  else {
    let t = `${plural(p.rows.length, 'week')} read`;
    if (p.rows.length) t += `, ${fmtDate(p.rows[0].t)} to ${fmtDate(p.rows[p.rows.length - 1].t)}`;
    t += '.';
    if (!p.header) t += ' No headings, so columns are taken in the order of step 2.';
    if (p.unmatched.length) t += ` ${plural(p.unmatched.length, 'column')} not matching a work stream (${p.unmatched.join(', ')}).`;
    if (p.skipped.length) t += ` ${plural(p.skipped.length, 'line')} skipped (check the date and numbers).`;
    if (p.dupes) t += ` ${plural(p.dupes, 'repeated week')} ignored.`;
    if (p.gaps) t += ` ${plural(p.gaps, 'gap')} between weeks.`;
    if (state.excluded.size && m.rows) t += ` ${plural(m.rows.filter(r => r.excl).length, 'week')} left out.`;
    setStatus('demandStatus', t, p.skipped.length || p.gaps || p.unmatched.length || !p.header);
  }
  if (!$('#staff').value.trim() && !$('#adhoc').value.trim() && !$('#fixed').value.trim()) setStatus('staffStatus', 'No staff entered yet.', true);
  else {
    const sk = m.staff.skipped.length + m.adhoc.skipped.length + m.fixed.skipped.length;
    setStatus('staffStatus', `${plural(m.staff.rows.length, 'post')} (${fmtW(sum(m.staff.rows.map(r => r.v)))} WTE), ${fmt1(sum(m.adhoc.rows.map(r => r.v)))} extra hours and ${fmt(sum(m.fixed.rows.map(r => r.v)))} minutes of fixed work a week. Each WTE gives ${fmt1(hrs(m.minPerWte))} hours of task time a week.${sk ? ` ${plural(sk, 'line')} skipped.` : ''}`, sk);
  }
}
function syncFields(){
  const rows = parseDemand($('#demand').value, parseStreams($('#streams').value).rows).rows;
  const sel = $('#baseStart'), cur = sel.value;
  sel.innerHTML = ['<option value="">Automatic (most recent weeks)</option>'].concat(rows.map(r => `<option value="${isoDate(r.t)}">${fmtDate(r.t)}</option>`)).join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

let timer;
const aside = $('aside.panel');
aside.addEventListener('input', e => {
  clearTimeout(timer);
  timer = setTimeout(() => { syncFields(); renderAll(); }, e.target.tagName === 'TEXTAREA' ? 200 : 80);
});
aside.addEventListener('change', () => { clearTimeout(timer); syncFields(); renderAll(); });

/* ---------- Exports ---------- */
function slug(){ return ($('#service').value.trim() || 'admin-demand-and-capacity').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'admin-demand-and-capacity'; }
function exportSVG(){
  const m = state.m, p = LIGHT, W = 1200, T = m.total;
  const parts = [['Weekly demand against available staff time (hours)', demandChart(m, W - 48, p, false)], ['Hours needed and available, by role', roleChart(m, W - 48, p)]];
  if (m.backlogMin) parts.push([`Backlog, hours of work (plan: clear in ${m.clearWeeks} weeks)`, burnChart(m, W - 48, p)]);
  const v = verdict(m), pl = Math.round(m.pLow * 100);
  let y = 0, s = '';
  const text = (t, size, weight, fill, dy) => { y += dy; s += `<text x="24" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(t)}</text>`; };
  text($('#service').value.trim() || 'Admin demand and capacity summary', 22, 700, p.ink, 36);
  text(`Needed ${fmt1(hrs(T.lo))}–${fmt1(hrs(T.hi))} hours a week (${pl}th to 85th percentile, ${fmtW(wte(m, T.lo))}–${fmtW(wte(m, T.hi))} WTE); available ${fmt1(hrs(T.availMin))} hours (${fmtW(T.wte)} WTE in post).`, 14, 400, p.muted, 24);
  text(v.head, 14, 600, p.ink, 22);
  parts.forEach(([title, svg]) => {
    const hh = +svg.match(/height="(\d+)"/)[1];
    text(title, 15, 600, p.ink, 32);
    s += `<g transform="translate(24 ${y + 8})">${svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`; y += hh + 8;
  });
  text('Based on the NHS England demand and capacity approach. Blue: staff time needed; green: staff time available.', 11.5, 400, p.muted, 26);
  const H = y + 20;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'><rect width="${W}" height="${H}" fill="#FFFFFF"/>${s}</svg>`, W, H };
}
async function svgToPng(svg, W, H){
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, W, H);
  return await new Promise(r => c.toBlob(r, 'image/png'));
}
function download(name, blob){
  return FocusActions.saveFile(name, blob).then(
    ok => FocusActions.say(ok ? `Saved ${name}.` : 'Download cancelled.'),
    () => FocusActions.say('The file couldn’t be saved here.'));
}
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function csvRows(){
  const m = state.m;
  const rows = [['Week starting', 'In baseline', 'Left out', 'Demand (hours)'].concat(m.roles.map(r => `${r.name} (hours)`))];
  m.rows.forEach((r, i) => rows.push([isoDate(r.t), i >= m.b0 && i < m.b0 + m.L ? 'Yes' : 'No', r.excl ? 'Yes' : 'No', hrs(r.total).toFixed(2)].concat(m.roles.map(ro => hrs(r.role[ro.k]).toFixed(2)))));
  rows.push([]);
  rows.push(['Role', 'WTE in post', 'Available (hours a week)', 'Needed average', `Needed ${Math.round(m.pLow * 100)}th percentile`, 'Needed 85th percentile', `Gap ${Math.round(m.pLow * 100)}th (WTE)`, 'Gap 85th (WTE)', 'Backlog (hours)']);
  m.roles.forEach(r => rows.push([r.name, r.wte.toFixed(2), hrs(r.availMin).toFixed(2), hrs(r.avg).toFixed(2), hrs(r.lo).toFixed(2), hrs(r.hi).toFixed(2), wte(m, r.gapLo).toFixed(2), wte(m, r.gapHi).toFixed(2), hrs(r.backlogMin).toFixed(2)]));
  const T = m.total;
  rows.push(['All roles, work shared', T.wte.toFixed(2), hrs(T.availMin).toFixed(2), hrs(T.avg).toFixed(2), hrs(T.lo).toFixed(2), hrs(T.hi).toFixed(2), wte(m, T.gapLo).toFixed(2), wte(m, T.gapHi).toFixed(2), hrs(m.backlogMin).toFixed(2)]);
  return rows;
}
const csvText = () => csvRows().map(r => r.map(csvCell).join(',')).join('\r\n');
const tableText = () => csvRows().map(r => r.join('\t')).join('\n');
async function copyText(t, ok){
  try { await navigator.clipboard.writeText(t); FocusActions.say(ok); }
  catch (e){ FocusActions.say('Your browser couldn’t copy. Try the CSV download instead.'); }
}
async function doExport(kind){
  try {
    if (kind === 'csv') return download(slug() + '.csv', new Blob([csvText()], { type: 'text/csv' }));
    if (kind === 'copytable') return copyText(tableText(), 'Table copied. Paste it into Excel.');
    if (kind === 'copysummary') return copyText(readingText(state.m).join('\n\n'), 'Summary copied.');
    const e = exportSVG();
    if (kind === 'svg') return download(slug() + '.svg', new Blob([e.svg], { type: 'image/svg+xml' }));
    const png = await svgToPng(e.svg, e.W, e.H);
    if (kind === 'copyimg'){
      if (!(navigator.clipboard && window.ClipboardItem)) return FocusActions.say('Your browser can’t copy images. Use PNG image instead.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return FocusActions.say('Summary copied. Paste it into PowerPoint or Word.');
    }
    download(slug() + '.png', png);
  } catch (err){ FocusActions.say('Sorry, that export didn’t work.'); }
}

/* ---------- Data sheet for collecting the data ---------- */
function dataSheet(){
  const head = a => a.map(v => ({ v, s: 'head' }));
  const blank = (n, c) => Array.from({ length: n }, () => Array(c).fill({ v: '', s: 'input' }));
  const streams = parseStreams($('#streams').value).rows.map(s => s.name);
  const names = streams.length ? streams : ['Work stream 1', 'Work stream 2', 'Work stream 3'];
  const notes = [
    'Collecting your data',
    '1. Work streams: list each kind of task the team does, the role that does it, the turnaround target in working days (0 for same day), the share that is failure demand (chasers, duplicates, rework) and how many tasks are waiting now.',
    '2. Timed tasks: time a sample of each task from start to finish, including logging it, with a stopwatch or an activity logging app. Aim for at least 20 to 30 timed tasks per work stream, spread across different people, days and times. Write the work stream exactly as on the Work streams sheet.',
    '3. Weekly demand: for each week, count tasks arriving, not tasks done. Use emails received, calls offered (including abandoned calls), letters dictated, referrals received. Aim for 52 weeks or more so you can see variation and seasons. Keep the headings matching the work stream names.',
    '4. Staff: one row per post in post with its role and WTE. Leave vacancies out. List overtime, bank and agency hours separately.',
    '5. Fixed work: regular work that doesn’t depend on demand, such as meetings, 1-1s, reporting and MDT preparation, in minutes per week for the whole role.',
    '',
    'Building the model',
    'Save this workbook, then in the Admin demand and capacity model choose Data sheet, then Import filled data sheet, and pick this file. It fills in every box from the matching sheet. Or copy each table, including its headings, and paste it into the matching box.'
  ];
  return [
    { name: 'Work streams', cols: [30, 16, 24, 22, 18, 14], rows: [head(['Work stream', 'Minutes per task', 'Role', 'Turnaround (working days)', 'Failure demand %', 'Waiting now'])].concat(names.map(n => [{ v: n, s: 'input' }].concat(Array(5).fill({ v: '', s: 'input' }))), blank(10, 6)), freeze: 1 },
    { name: 'Timed tasks', cols: [30, 12, 14, 14, 30], rows: [head(['Work stream', 'Minutes', 'Date', 'Observer', 'Notes'])].concat(blank(200, 5)), freeze: 1 },
    { name: 'Weekly demand', cols: [16].concat(names.map(() => 18)), rows: [head(['Week starting'].concat(names))].concat(blank(60, names.length + 1)), freeze: 1 },
    { name: 'Staff', cols: [26, 24, 10], rows: [head(['Post', 'Role', 'WTE'])].concat(blank(30, 3)), freeze: 1 },
    { name: 'Extra hours', cols: [26, 24, 16], rows: [head(['Source', 'Role', 'Hours per week'])].concat(blank(10, 3)), freeze: 1 },
    { name: 'Fixed work', cols: [30, 24, 18], rows: [head(['Activity', 'Role', 'Minutes per week'])].concat(blank(20, 3)), freeze: 1 },
    { name: 'Instructions', cols: [110], rows: notes.map((v, i) => [{ v, s: i === 0 || v === 'Building the model' ? 'title' : 'wrap' }]) }
  ];
}

/* ---------- Example: a patient advice and portal helpdesk team (made-up data) ---------- */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function loadExample(){
  const r = rng(20240729), norm = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const S = [
    // name, minutes, role, days, failure %, waiting, tasks a week, grows with the portal
    ['Advice calls', 11.1, 'Coordinator (B4)', 2, 15, 14, 95, false],
    ['Advice emails', 11.8, 'Coordinator (B4)', 5, 20, 60, 70, false],
    ['Advice in person', 13.9, 'Coordinator (B4)', 0, 10, 0, 55, false],
    ['Advice voicemails', 12.5, 'Senior coordinator (B5)', 2, 15, 12, 35, false],
    ['Reception triage', 4.7, 'Assistant (B3)', 0, 25, 0, 80, false],
    ['Log emails', 3, 'Assistant (B3)', 1, 0, 25, 110, false],
    ['Portal calls', 5.3, 'Coordinator (B4)', 0, 30, 0, 230, true],
    ['Portal emails', 7.1, 'Coordinator (B4)', 5, 30, 2200, 160, true],
    ['Portal voicemails', 6.2, 'Lead (B6)', 2, 30, 30, 120, true]
  ];
  const pad = x => String(x).padStart(2, '0');
  const lines = [['Week starting'].concat(S.map(s => s[0])).join('\t')];
  const N = 78, t0 = Date.UTC(2023, 0, 2);
  for (let i = 0; i < N; i++){
    const t = t0 + i * WEEK, d = new Date(t), mo = d.getUTCMonth(), day = d.getUTCDate();
    const season = (mo === 11 && day > 18) || (mo === 0 && day < 3) ? 0.6 : mo === 7 ? 0.9 : 1;
    const ramp = Math.min(1, 0.7 + 0.3 * i / 26), week = 1 + 0.08 * norm();
    lines.push([`${pad(day)}/${pad(mo + 1)}/${d.getUTCFullYear()}`].concat(S.map(s => Math.max(0, Math.round(s[6] * season * week * (s[7] ? ramp : 1) * (1 + 0.1 * norm()))))).join('\t'));
  }
  const obs = ['Work stream\tMinutes'];
  [['Advice calls', 11.1, 30], ['Portal calls', 5.3, 26], ['Portal emails', 7.1, 25], ['Portal voicemails', 6.2, 22]].forEach(([n, mu, k]) => {
    const sg = Math.sqrt(Math.log(1.25)), lmu = Math.log(mu) - sg * sg / 2;
    for (let j = 0; j < k; j++) obs.push(`${n}\t${Math.exp(lmu + sg * norm()).toFixed(1)}`);
  });
  obs.push('Portal calls\t0.05', 'Advice calls\t0.1');
  const set = (id, v) => { const el = $('#' + id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  set('service', 'Patient advice and portal helpdesk'); set('pctLower', '65'); set('hrsWte', '37.5');
  set('alDays', '33'); set('bhDays', '8'); set('sickDays', '12'); set('trainDays', '5'); set('unmeasured', '10');
  set('streams', ['Work stream\tMinutes per task\tRole\tTurnaround (working days)\tFailure demand %\tWaiting now'].concat(S.map(s => s.slice(0, 6).join('\t'))).join('\n'));
  set('obs', obs.join('\n')); set('obsMin', '0.25'); set('obsMax', '120'); set('useObs', true);
  set('demand', lines.join('\n')); syncFields(); set('baseStart', ''); set('baseLen', '52');
  set('staff', ['Post\tRole\tWTE', 'Service lead\tLead (B6)\t1', 'Senior coordinator\tSenior coordinator (B5)\t0.6', 'Coordinator 1\tCoordinator (B4)\t1', 'Coordinator 2\tCoordinator (B4)\t1', 'Coordinator 3\tCoordinator (B4)\t0.6', 'Coordinator 4\tCoordinator (B4)\t0.8', 'Assistant\tAssistant (B3)\t0.5'].join('\n'));
  set('adhoc', ['Source\tRole\tHours per week', 'Bank coordinator\tCoordinator (B4)\t7.5'].join('\n'));
  set('fixed', ['Activity\tRole\tMinutes per week', 'Team meetings\tCoordinator (B4)\t220', 'General admin and case follow-up\tCoordinator (B4)\t560', 'Formal complaints support\tSenior coordinator (B5)\t300', 'Reporting\tLead (B6)\t150', '1-1s and supervision\tLead (B6)\t115', 'Service management\tLead (B6)\t90'].join('\n'));
  set('demandChange', '0'); set('fdReduce', '0'); set('clearWeeks', '12');
  state.excluded.clear();
  syncFields(); renderAll();
}

/* ---------- Shared toolbar (Open, Save, Export) ---------- */
FocusActions.mount({
  tool: 'admin_demand_capacity', toolName: 'admin demand and capacity model',
  example: loadExample, hasData: () => !!($('#streams').value.trim() || $('#demand').value.trim() || $('#staff').value.trim()),
  fileName: () => slug(),
  fields: 'aside.panel[aria-label="Data and settings"]',
  getExtra: () => ({ excluded: [...state.excluded] }),
  setExtra: x => { state.excluded = new Set((x && x.excluded) || []); },
  afterOpen: () => { clearTimeout(timer); syncFields(); renderAll(); },
  ready: () => !!(state.m && state.m.ready),
  template: {
    fileName: 'admin-demand-and-capacity-data-sheet.xlsx', sheets: dataSheet,
    import: [['Work streams', '#streams', 'work streams'], ['Timed tasks', '#obs', 'timed observations'], ['Weekly demand', '#demand', 'weekly demand'],
      ['Staff', '#staff', 'staff in post'], ['Extra hours', '#adhoc', 'extra hours'], ['Fixed work', '#fixed', 'fixed work']].map(([sheet, into, label]) => ({ sheet, into, label }))
  },
  exports: trackExports([
    { type: 'png', run: () => doExport('png') },
    { type: 'svg', run: () => doExport('svg') },
    { type: 'copyimg', run: () => doExport('copyimg') },
    { type: 'csv', run: () => doExport('csv'), hint: 'Week by week demand and the role summary' },
    { type: 'copytable', run: () => doExport('copytable') },
    { type: 'copysummary', run: () => doExport('copysummary') }
  ])
});
trackSettings({ percentile: 'pctLower', useObservations: 'useObs', showPercentiles: 'optPct' });

let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(drawCharts, 80); }).observe(out);
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCharts);

syncFields(); renderAll();
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $ = s => document.querySelector(s);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 864e5, WEEK = 7 * DAY;
const FONT = '"Public Sans", "Segoe UI", system-ui, Arial, sans-serif';
const RULES = [
  { key: 'r1', text: 'A point more than 3 sigma from the mean' },
  { key: 'r2', text: '2 out of 3 points more than 2 sigma from the mean, all 3 on the same side' },
  { key: 'r3', text: '6 points in a row rising or falling' },
  { key: 'r4', text: 'A run of 9 or more points on the same side of the mean' }
];
const LIGHT = {
  ink: '#17222D', muted: '#5A6875', rule: '#DCE2E7', grid: '#EDF0F3', line: '#3B4956', limit: '#6B7885', surface: '#FFFFFF',
  req: '#5B9BD9', 'req-soft': '#CFE2F5', core: '#1F6E3B', adhoc: '#8AB833', carve: '#8A96A3', wl: '#BBD8A8', 'wl-ink': '#2F6A1E', current: '#003087',
  r1: '#C8372D', r2: '#4E9A2F', r3: '#7A4BB0', r4: '#E07B00', s1: '#DCE8F5', s2: '#DDF0DA', s3: '#ECE1F6', s4: '#FBE5D2', accent: '#005EB8'
};
function palette(){
  const cs = getComputedStyle(document.documentElement), p = {};
  Object.keys(LIGHT).forEach(k => { p[k] = cs.getPropertyValue('--' + k).trim() || LIGHT[k]; });
  return p;
}

const state = { excluded: new Set(), capView: 'week', showPct: true, showSame: false, m: null };

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Shared statistics, from /assets/js/focus-stats.js
const { sum, mean, splitCells, pickDelimiter } = FocusStats;

function fmt(v, dp){
  if (!isFinite(v)) return '–';
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
}
const fmt1 = v => fmt(v, Math.abs(v) < 100 ? 1 : 0);
const plural = (n, w, pl) => `${fmt(n)} ${n === 1 ? w : (pl || w + 's')}`;
function cleanNum(s){
  s = String(s == null ? '' : s).trim().replace(/[£$€,\s ]/g, '');
  if (s === '' || s === '-') return 0;
  return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) ? +s : NaN;
}
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

/* ---------- Reading the inputs ---------- */
function urgencies(){
  return [1, 2, 3].map(i => ({ i, name: $('#u' + i).value.trim() })).filter(u => u.name);
}
function splitFields(line, delim){
  if (delim === 'ws') return line.split(/[\s ]+/);
  return splitCells(line, delim);
}
// the shared choice of delimiter, or spaces when there's none
const pickDelim = lines => pickDelimiter(lines) || 'ws';
function parseDemand(text, nCols){
  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
  const delim = pickDelim(lines), rows = [], skipped = [];
  let header = false;
  lines.forEach((line, li) => {
    let f = splitFields(line.trim(), delim), t = NaN, rest;
    if (delim === 'ws'){
      for (const k of [3, 1]){ const d = parseDate(f.slice(0, k).join(' ')); if (isFinite(d)){ t = d; rest = f.slice(k); break; } }
    } else { t = parseDate(f[0]); rest = f.slice(1); }
    if (!isFinite(t)){ if (li === 0) header = true; else skipped.push(li + 1); return; }
    const vals = [];
    for (let j = 0; j < nCols; j++){ const v = cleanNum(rest[j]); vals.push(v); }
    if (vals.some(v => !isFinite(v) || v < 0)){ skipped.push(li + 1); return; }
    rows.push({ t, vals });
  });
  rows.sort((a, b) => a.t - b.t);
  const out = [];
  rows.forEach(r => { if (!out.length || out[out.length - 1].t !== r.t) out.push(r); });
  let gaps = 0;
  for (let i = 1; i < out.length; i++) if (Math.round((out[i].t - out[i - 1].t) / DAY) !== 7) gaps++;
  return { rows: out, skipped, header, gaps, dupes: rows.length - out.length };
}
function parseSessions(text){
  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
  const delim = pickDelim(lines), rows = [], skipped = [];
  lines.forEach((line, li) => {
    const f = splitFields(line.trim(), delim).filter((x, j, a) => delim !== 'ws' || x !== '');
    if (f.length < 2){ skipped.push(li + 1); return; }
    const slots = cleanNum(f[f.length - 1]), weeks = cleanNum(f[f.length - 2]);
    if (!isFinite(slots) || !isFinite(weeks) || f[f.length - 1].trim() === ''){ if (li > 0) skipped.push(li + 1); return; }
    rows.push({ name: f.slice(0, f.length - 2).join(delim === 'ws' ? ' ' : ' · ').trim() || `Session ${rows.length + 1}`, weeks, slots, total: weeks * slots });
  });
  return { rows, skipped };
}

/* ---------- The model ---------- */
function model(){
  const urg = urgencies();
  const sameDay = $('#sameDay').checked;
  const unit = $('#unit').value;
  const k = unit === 'Patients' ? 1 : Math.max(0, inputNum('perPatient', 1));
  const pLow = +$('#pctLower').value / 100;
  const dc = inputNum('demandChange', 0) / 100;
  const m = { urg, sameDay, unit, k, pLow, dc, warnings: [] };

  const p = parseDemand($('#demand').value, urg.length + (sameDay ? 1 : 0));
  m.parse = p;
  m.rows = p.rows.map(r => {
    const u = urg.map((_, j) => r.vals[j]);
    return { t: r.t, u, total: sum(u), same: sameDay ? r.vals[urg.length] : 0, excl: state.excluded.has(isoDate(r.t)) };
  });
  const n = m.rows.length;

  const cs = parseSessions($('#core').value), as = parseSessions($('#adhoc').value);
  m.core = cs; m.adhoc = as;
  m.coreWk = sum(cs.rows.map(r => r.total)) / 52;
  m.adhocWk = sum(as.rows.map(r => r.total)) / 52;

  const pc = id => clamp(inputNum(id, 0), 0, 100) / 100;
  m.rott = pc('rott'); m.nasr = pc('nasr'); m.nasl = pc('nasl'); m.nasldc = pc('nasldc');
  m.rebook = 1 - m.nasldc;
  // Modifier for required capacity: (1 - ROTT) × (1 - NASR discharged + NASL × NASL rebooked)
  m.mod = (1 - m.rott) * (1 - m.nasr + m.nasl * m.rebook);

  m.wl = $('#wl').value.trim() === '' ? null : Math.max(0, inputNum('wl', 0));
  m.ready = n >= 10 && urg.length > 0;
  if (!m.ready) return m;

  // Baseline
  let L = clamp(Math.round(inputNum('baseLen', 52)), 10, 52);
  let b0 = -1;
  const bs = $('#baseStart').value;
  if (bs){ b0 = m.rows.findIndex(r => isoDate(r.t) === bs); }
  if (b0 < 0) b0 = Math.max(0, n - L);
  if (b0 + L > n){ L = n - b0; }
  if (L < 10){ b0 = Math.max(0, n - 10); L = Math.min(10, n); m.warnings.push('The baseline must be at least 10 weeks, so it has been moved to the most recent 10 weeks.'); }
  m.b0 = b0; m.L = L; m.baseStart = m.rows[b0].t;

  // Seasons
  const nS = +$('#seasons').value;
  const starts = [b0];
  for (let s = 2; s <= nS; s++){
    const v = $('#s' + s).value;
    let idx = v ? m.rows.findIndex(r => isoDate(r.t) === v) : -1;
    if (idx < 0) idx = b0 + Math.round((s - 1) * L / nS);
    const prev = starts[starts.length - 1];
    if (idx - prev < 10 || b0 + L - idx < 10){ m.warnings.push(`Season ${s} was left out: each season needs at least 10 weeks inside the baseline.`); break; }
    starts.push(idx);
  }
  m.seasons = starts.map((from, s) => {
    const to = s + 1 < starts.length ? starts[s + 1] : b0 + L;
    const idx = []; for (let i = from; i < to; i++) idx.push(i);
    const ok = idx.filter(i => !m.rows[i].excl);
    const vals = ok.map(i => m.rows[i].total);
    const mrs = idx.filter(i => i > 0 && !m.rows[i].excl && !m.rows[i - 1].excl).map(i => Math.abs(m.rows[i].total - m.rows[i - 1].total));
    const mu = mean(vals), sigma = mrs.length ? mean(mrs) / 1.128 : 0;
    return { s: s + 1, from, to, len: to - from, n: vals.length, mean: mu, sigma, lo: pctile(vals, pLow), hi: pctile(vals, 0.85), same: mean(ok.map(i => m.rows[i].same)) || 0 };
  });
  if (m.seasons.some(s => s.n < 2)){ m.ready = false; m.warnings.push('Too many weeks are left out of the baseline to calculate it. Include more weeks.'); return m; }
  const rest = clamp(+$('#restSeason').value || 1, 1, m.seasons.length);
  // Week-of-year position relative to the start of the baseline decides the season
  m.seasonAt = t => {
    const off = ((Math.round((t - m.baseStart) / WEEK) % 52) + 52) % 52;
    if (off >= L) return m.seasons[rest - 1];
    return m.seasons.find(s => off < s.to - b0) || m.seasons[m.seasons.length - 1];
  };

  // Baseline demand and urgency split
  const baseOk = []; for (let i = b0; i < b0 + L; i++) if (!m.rows[i].excl) baseOk.push(m.rows[i]);
  m.baseN = baseOk.length;
  m.weekMean = mean(baseOk.map(r => r.total)) * (1 + dc);
  const uTot = urg.map((_, j) => sum(baseOk.map(r => r.u[j])));
  const allTot = sum(uTot);
  m.split = uTot.map(v => allTot ? v / allTot : 0);
  m.sameMean = mean(baseOk.map(r => r.same)) || 0;

  // Year being planned
  const cs0 = $('#capStart').value;
  let start = cs0 ? parseDate(cs0) : NaN;
  if (!isFinite(start)) start = m.rows[n - 1].t + WEEK;
  m.yearStart = start;
  m.weeks = [];
  for (let j = 0; j < 52; j++){
    const t = start + j * WEEK, s = m.seasonAt(t);
    const f = k * m.mod * (1 + dc);
    const carve = sameDay ? s.same * k : 0;
    const core = Math.max(0, m.coreWk - carve);
    const adhoc = core === 0 ? Math.max(0, m.coreWk + m.adhocWk - carve) : m.adhocWk;
    m.weeks.push({ t, season: s.s, lower: s.lo * f, upper: s.hi * f, avg: s.mean * f, carve, core, adhoc });
  }
  const W = m.weeks;
  m.req = { lower: mean(W.map(w => w.lower)), upper: mean(W.map(w => w.upper)), avg: mean(W.map(w => w.avg)), year: sum(W.map(w => w.avg)) };
  m.avail = { core: mean(W.map(w => w.core)), adhoc: mean(W.map(w => w.adhoc)), carve: mean(W.map(w => w.carve)) };
  m.avail.total = m.avail.core + m.avail.adhoc;

  // Activity outcomes over a year (patients)
  const D = m.weekMean * 52;
  const a = { D, rott: D * m.rott, nasr: D * (1 - m.rott) * m.nasr, nasl: D * (1 - m.rott) * m.nasl };
  a.nasldc = a.nasl * m.nasldc; a.rebook = a.nasl - a.nasldc;
  a.slots = Math.max(0, D - a.rott - a.nasr + a.rebook);
  a.att = a.slots - a.nasl;
  const act = $('#actualAtt').value.trim() === '' ? null : inputNum('actualAtt', 0);
  if (act != null && act > 0){
    const denom = (1 - m.nasr - m.nasl * m.nasldc) * (1 - m.rott);
    a.actual = act; a.estD = denom > 0 ? act * (52 / L) / denom : NaN;
    a.inconsistent = Math.abs(1 - a.estD / (D / (1 + dc))) > 0.05;
  }
  m.act = a;

  // Pathway and sustainable waiting list
  m.path = urg.map((u, j) => {
    const unitDiv = $('#p' + u.i + 'u').value === 'Days' ? 7 : 1;
    const s = Math.max(0, inputNum('p' + u.i + 's', 0)) / unitDiv;
    const e = Math.max(s, inputNum('p' + u.i + 'e', 0) / unitDiv);
    const r = Math.max(0, inputNum('p' + u.i + 'r', 0)) / unitDiv;
    const wlU = m.weekMean * m.split[j] * (s + (e - s) / 2) + m.nasl * m.rebook * m.split[j] * r * m.weekMean;
    return { name: u.name, start: s, end: e, rebook: r, split: m.split[j], wl: wlU };
  });
  const mid = sum(m.path.map(p => p.wl));
  m.sus = { mid, lower: mid * 0.95, upper: mid * 1.05 };
  if (m.wl != null){
    m.clear = { lower: Math.max(0, m.wl - m.sus.upper), upper: Math.max(0, m.wl - m.sus.lower) };
    m.clearWeeks = Math.max(1, Math.round(inputNum('clearWeeks', 8)));
  }

  // SPC across all weeks, using the limits of each week's season
  const pts = m.rows.map((r, i) => ({ i, v: r.total, s: m.seasonAt(r.t) })).filter(p => !m.rows[p.i].excl);
  m.signals = {};
  const mark = (i, key) => { if (!m.signals[i]) m.signals[i] = key; };
  pts.forEach(p => { if (p.s.sigma > 0 && Math.abs(p.v - p.s.mean) > 3 * p.s.sigma) mark(p.i, 'r1'); });
  for (let j = 0; j + 2 < pts.length; j++){
    const w = pts.slice(j, j + 3);
    for (const side of [1, -1]){
      if (!w.every(p => side * (p.v - p.s.mean) > 0)) continue;
      const far = w.filter(p => p.s.sigma > 0 && side * (p.v - p.s.mean) > 2 * p.s.sigma);
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
    const side = Math.sign(p.v - p.s.mean);
    if (side !== 0 && side === runSide) run.push(p);
    else { flush(); run = side ? [p] : []; runSide = side; }
  });
  flush();
  m.baseSignals = Object.keys(m.signals).map(Number).filter(i => i >= b0 && i < b0 + L);
  return m;
}

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
function monthTicks(times, x, y, p){
  let s = '', last = -1;
  times.forEach((t, i) => {
    const d = new Date(t), mo = d.getUTCMonth();
    if (mo !== last){
      last = mo;
      const xx = x(i);
      s += `<line x1="${xx}" x2="${xx}" y1="${y}" y2="${y + 5}" stroke="${p.limit}"/>`;
      s += `<text x="${xx + 2}" y="${y + 18}" font-size="11.5" fill="${p.muted}">${MON[mo]}${mo === 0 || i === 0 ? ` <tspan font-weight="600">${d.getUTCFullYear()}</tspan>` : ''}</text>`;
    }
  });
  return s;
}
function unitWord(m, plural){ const u = m.unit.toLowerCase(); return plural ? u : u.replace(/s$/, ''); }
const units = (m, n) => `${fmt(n)} ${unitWord(m, n !== 1)}`;

function capChart(m, W, p, view){
  const H = view === 'week' ? 320 : 300, padL = 58, padR = 16, padT = 14, padB = 40;
  const w = W - padL - padR, h = H - padT - padB;
  const W52 = m.weeks;
  const max = niceMax(Math.max(...W52.map(x => Math.max(x.upper, x.core + x.adhoc + x.carve))) * 1.08);
  const y = v => padT + h - v / max * h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Required capacity against available capacity">`;
  s += axisY(padL, padT, w, h, max, p, `${m.unit} per week`);
  if (view === 'week'){
    const bw = w / 52, x = i => padL + i * bw;
    W52.forEach((wk, i) => {
      s += `<rect x="${x(i) + 0.5}" y="${y(wk.upper)}" width="${Math.max(1, bw - 1)}" height="${Math.max(0.5, y(wk.lower) - y(wk.upper))}" fill="${p.req}"><title>${fmtDate(wk.t)}: needs ${fmt1(wk.lower)} to ${fmt1(wk.upper)}</title></rect>`;
    });
    const path = f => W52.map((wk, i) => `${i ? 'L' : 'M'}${x(i)} ${y(f(wk))}H${x(i + 1)}`).join('');
    if (m.sameDay) s += `<path d="${path(wk => wk.core + wk.adhoc + wk.carve)}" fill="none" stroke="${p.carve}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    s += `<path d="${path(wk => wk.core + wk.adhoc)}" fill="none" stroke="${p.adhoc}" stroke-width="2.5"/>`;
    s += `<path d="${path(wk => wk.core)}" fill="none" stroke="${p.core}" stroke-width="2.5"/>`;
    s += `<line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" stroke="${p.limit}"/>`;
    s += monthTicks(W52.map(wk => wk.t), x, padT + h, p);
  } else {
    const cx = padL + w / 2, bw = Math.min(220, w * 0.4);
    s += `<rect x="${cx - bw / 2}" y="${y(m.req.upper)}" width="${bw}" height="${Math.max(1, y(m.req.lower) - y(m.req.upper))}" fill="${p.req}"><title>Required ${fmt1(m.req.lower)} to ${fmt1(m.req.upper)}</title></rect>`;
    const dash = (v, c, lab, dy) => `<line x1="${cx - bw / 2 - 30}" x2="${cx + bw / 2 + 30}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="3"/><text x="${cx + bw / 2 + 38}" y="${y(v) + 4 + dy}" font-size="12.5" fill="${p.ink}">${lab} ${fmt1(v)}</text>`;
    const lab = (v, t) => `<text x="${cx - bw / 2 - 38}" y="${y(v) + 4}" font-size="12.5" text-anchor="end" fill="${p.muted}">${t} ${fmt1(v)}</text>`;
    s += lab(m.req.upper, '85th percentile') + lab(m.req.lower, `${Math.round(m.pLow * 100)}th percentile`);
    const close = Math.abs(y(m.avail.core) - y(m.avail.total)) < 18;
    s += dash(m.avail.core, p.core, 'Core', close ? 9 : 0);
    if (m.avail.adhoc > 0) s += dash(m.avail.total, p.adhoc, 'Core + ad hoc', close ? -9 : 0);
    s += `<line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" stroke="${p.limit}"/>`;
    s += `<text x="${cx}" y="${padT + h + 20}" font-size="12" text-anchor="middle" fill="${p.muted}">Average week in the year being planned</text>`;
  }
  return s + '</svg>';
}

function wlChart(m, W, p){
  const H = 110, padL = 16, padR = 16, top = 30, bh = 28;
  const w = W - padL - padR;
  const max = niceMax(Math.max(m.sus.upper, m.wl || 0) * 1.15);
  const x = v => padL + v / max * w;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Current waiting list against the sustainable size">`;
  ticks(max).forEach(v => {
    s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 6}" y2="${top + bh + 6}" stroke="${p.grid}"/>`;
    s += `<text x="${x(v)}" y="${top + bh + 24}" font-size="12" text-anchor="middle" fill="${p.muted}">${tickLabel(v)}</text>`;
  });
  s += `<rect x="${x(m.sus.lower)}" y="${top}" width="${Math.max(2, x(m.sus.upper) - x(m.sus.lower))}" height="${bh}" fill="${p.wl}" rx="3"><title>Sustainable ${fmt(m.sus.lower)} to ${fmt(m.sus.upper)}</title></rect>`;
  s += `<text x="${x(m.sus.upper) + 6}" y="${top - 8}" font-size="12.5" fill="${p['wl-ink']}" text-anchor="end">Sustainable ${fmt(m.sus.lower)}–${fmt(m.sus.upper)}</text>`;
  if (m.wl != null){
    const cx = x(m.wl), cy = top + bh / 2;
    s += `<path d="M${cx} ${cy - 9}L${cx + 9} ${cy}L${cx} ${cy + 9}L${cx - 9} ${cy}Z" fill="${p.current}"><title>Current ${fmt(m.wl)}</title></path>`;
    const anchor = cx > padL + w * 0.75 ? 'end' : 'start';
    s += `<text x="${cx + (anchor === 'end' ? -12 : 12)}" y="${cy + 4}" font-size="12.5" font-weight="600" text-anchor="${anchor}" fill="${p.ink}">Current ${fmt(m.wl)}</text>`;
  }
  return s + '</svg>';
}

function spcChart(m, W, p, interactive){
  const H = 340, padL = 54, padR = 16, padT = 14, padB = 40;
  const w = W - padL - padR, h = H - padT - padB, n = m.rows.length;
  const lim = m.rows.map(r => m.seasonAt(r.t));
  let max = Math.max(...m.rows.map(r => r.total), ...lim.map(s => s.mean + 3 * s.sigma));
  if (state.showSame && m.sameDay) max = Math.max(max, ...m.rows.map(r => r.same));
  max = niceMax(max * 1.05);
  const step = n > 1 ? w / (n - 1) : w, x = i => padL + i * step, y = v => padT + h - v / max * h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="SPC chart of weekly demand">`;
  // Baseline and season shading
  m.seasons.forEach(se => {
    const x0 = x(se.from) - step / 2, x1 = x(se.to - 1) + step / 2;
    s += `<rect x="${Math.max(padL, x0)}" y="${padT}" width="${Math.min(padL + w, x1) - Math.max(padL, x0)}" height="${h}" fill="${p['s' + se.s]}"/>`;
  });
  s += axisY(padL, padT, w, h, max, p, 'Patients per week');
  // Limits as steps
  const stepPath = f => m.rows.map((r, i) => `${i ? 'L' : 'M'}${i ? x(i) - step / 2 : x(0)} ${y(f(lim[i]))}${i ? `H${i === n - 1 ? x(i) : x(i) + step / 2}` : `H${x(0) + step / 2}`}`).join('');
  s += `<path d="${stepPath(l => Math.max(0, l.mean - 3 * l.sigma))}" fill="none" stroke="${p.limit}" stroke-width="1.3" stroke-dasharray="5 4"/>`;
  s += `<path d="${stepPath(l => l.mean + 3 * l.sigma)}" fill="none" stroke="${p.limit}" stroke-width="1.3" stroke-dasharray="5 4"/>`;
  s += `<path d="${stepPath(l => l.mean)}" fill="none" stroke="${p.limit}" stroke-width="1.5"/>`;
  if (state.showPct){
    s += `<path d="${stepPath(l => l.lo)}" fill="none" stroke="${p.req}" stroke-width="1.5" stroke-dasharray="2 3"/>`;
    s += `<path d="${stepPath(l => l.hi)}" fill="none" stroke="${p.req}" stroke-width="2"/>`;
  }
  if (state.showSame && m.sameDay){
    s += `<path d="${m.rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r.same)}`).join('')}" fill="none" stroke="${p.carve}" stroke-width="1.5"/>`;
  }
  // Demand line, broken at excluded weeks
  let d = '', pen = false;
  m.rows.forEach((r, i) => { if (r.excl){ pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)} ${y(r.total)}`; pen = true; });
  s += `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  m.rows.forEach((r, i) => {
    const sig = m.signals[i], t = `${fmtDate(r.t)}: ${fmt(r.total)} patients${r.excl ? ' (left out)' : sig ? ' (special cause)' : ''}${interactive ? '. Click to ' + (r.excl ? 'include' : 'leave out') : ''}`;
    let mk;
    if (r.excl) mk = `<circle cx="${x(i)}" cy="${y(r.total)}" r="4" fill="${p.surface}" stroke="${p.muted}" stroke-width="1.5"/>`;
    else if (sig) mk = `<rect x="${x(i) - 4}" y="${y(r.total) - 4}" width="8" height="8" fill="${p[sig]}"/>`;
    else mk = n <= 80 ? `<circle cx="${x(i)}" cy="${y(r.total)}" r="2.2" fill="${p.line}"/>` : '';
    s += interactive ? `<g class="pt" data-i="${i}">${mk}<circle cx="${x(i)}" cy="${y(r.total)}" r="${Math.max(5, Math.min(9, step / 2))}" fill="transparent"><title>${t}</title></circle></g>` : mk;
  });
  s += `<line x1="${padL}" x2="${padL + w}" y1="${padT + h}" y2="${padT + h}" stroke="${p.limit}"/>`;
  // Year ticks for long series, month ticks otherwise
  if (n > 70){
    let last = null;
    m.rows.forEach((r, i) => {
      const d = new Date(r.t), q = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (last !== null && q === last) return;
      if (last === null || d.getUTCMonth() % 3 === 0){
        last = q;
        s += `<line x1="${x(i)}" x2="${x(i)}" y1="${padT + h}" y2="${padT + h + 5}" stroke="${p.limit}"/><text x="${x(i) + 2}" y="${padT + h + 18}" font-size="11.5" fill="${p.muted}">${MON[d.getUTCMonth()]}${d.getUTCMonth() < 3 || i === 0 ? ` <tspan font-weight="600">${d.getUTCFullYear()}</tspan>` : ''}</text>`;
      }
    });
  } else s += monthTicks(m.rows.map(r => r.t), x, padT + h, p);
  return s + '</svg>';
}

function pathChart(m, W, p){
  const rowsN = m.path.length, rh = 34, padL = 110, padR = 20, top = 8, H = top + rowsN * rh + 34;
  const w = W - padL - padR;
  const max = niceMax(Math.max(1, ...m.path.map(r => Math.max(r.end, r.rebook))) * 1.05);
  const x = v => padL + v / max * w;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT}' role="img" aria-label="Waits for each pathway">`;
  ticks(max).forEach(v => {
    s += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${top + rowsN * rh}" stroke="${p.grid}"/><text x="${x(v)}" y="${top + rowsN * rh + 16}" font-size="12" text-anchor="middle" fill="${p.muted}">${tickLabel(v)}</text>`;
  });
  s += `<text x="${padL + w / 2}" y="${H - 2}" font-size="12" text-anchor="middle" fill="${p.muted}">Weeks waiting</text>`;
  m.path.forEach((r, i) => {
    const yy = top + i * rh;
    s += `<text x="${padL - 10}" y="${yy + rh / 2 + 4}" font-size="13" text-anchor="end" fill="${p.ink}">${esc(r.name)}</text>`;
    s += `<rect x="${x(r.start)}" y="${yy + 7}" width="${Math.max(2, x(r.end) - x(r.start))}" height="12" rx="2" fill="${p.accent}"><title>${esc(r.name)}: seen between ${fmt1(r.start)} and ${fmt1(r.end)} weeks</title></rect>`;
    if (r.rebook > 0) s += `<rect x="${x(0)}" y="${yy + 22}" width="${Math.max(2, x(r.rebook) - x(0))}" height="5" rx="1" fill="${p.carve}"><title>Rebooked within ${fmt1(r.rebook)} weeks</title></rect>`;
  });
  return s + '</svg>';
}

/* ---------- Plain-English reading ---------- */
function verdict(m){
  const u = unitWord(m, true), av = m.avail.total, r = m.req;
  const need = v => { const n = Math.ceil(v - av); return `${fmt(n)} more ${unitWord(m, n !== 1)}`; };
  const pl = `${Math.round(m.pLow * 100)}th`;
  if (av >= r.upper) return { cls: 'ok', head: 'You have enough capacity, even in busier weeks.', body: `Available capacity of ${fmt1(av)} ${u} a week meets the 85th percentile of required capacity (${fmt1(r.upper)}). Your waiting list should stay stable or fall.` };
  if (av >= r.lower) return { cls: 'warn', head: `You have enough capacity for typical weeks, but not busier ones.`, body: `You need about ${need(r.upper)} a week to meet the 85th percentile of demand. Consider more capacity if your service is urgent or very variable.` };
  if (av >= r.avg) return { cls: 'bad', head: `Your capacity covers average demand, but not its variation.`, body: `You need about ${need(r.lower)} a week to meet the ${pl} percentile of demand. Your waiting list is likely to grow over time.` };
  return { cls: 'bad', head: 'Your capacity is below average demand.', body: `Required capacity averages ${fmt1(r.avg)} ${u} a week but only ${fmt1(av)} is available, so the waiting list will grow by about ${fmt1((r.avg - av) / (m.k * m.mod || 1))} patients a week. You need about ${need(r.lower)} a week to meet the ${pl} percentile.` };
}
function readingText(m){
  const u = unitWord(m, true), out = [];
  const be = m.rows[m.b0 + m.L - 1].t;
  out.push(`Over the baseline (${plural(m.L, 'week')}, ${fmtDate(m.baseStart)} to ${fmtDate(be)}${m.baseN < m.L ? `, ${plural(m.L - m.baseN, 'week')} left out` : ''}), demand averaged ${fmt1(m.weekMean / (1 + m.dc))} patients a week.${m.dc ? ` You are planning for a ${fmt(Math.abs(m.dc * 100), 1)}% ${m.dc > 0 ? 'rise' : 'fall'}, so ${fmt1(m.weekMean)} a week.` : ''}${m.seasons.length > 1 ? ` The baseline is split into ${m.seasons.length} seasons, each with its own average and percentiles.` : ''}`);
  out.push(`Once you allow for patients removed before treatment and for appointments that are cancelled or missed, the service needs ${fmt1(m.req.lower)} to ${fmt1(m.req.upper)} ${u} a week (the ${Math.round(m.pLow * 100)}th to 85th percentile of demand). Average demand alone would need ${fmt1(m.req.avg)}, but planning for the average means the waiting list grows in every busier-than-average week.`);
  out.push(`Available capacity is ${fmt1(m.avail.total)} ${u} a week: ${fmt1(m.avail.core)} core${m.avail.adhoc ? ` and ${fmt1(m.avail.adhoc)} ad hoc` : ''}${m.sameDay && m.avail.carve ? `, after setting aside ${fmt1(m.avail.carve)} for same-day demand` : ''}.`);
  const v = verdict(m); out.push(v.head + ' ' + v.body);
  if (m.wl != null){
    const w = m.wl, s = m.sus;
    if (w > s.upper) out.push(`Your waiting list of ${fmt(w)} is above the sustainable size of ${fmt(s.lower)} to ${fmt(s.upper)}, so some patients are likely to wait longer than your pathway allows. Clearing the extra ${fmt(m.clear.lower)} to ${fmt(m.clear.upper)} patients over ${plural(m.clearWeeks, 'week')} needs ${fmt(Math.round(m.clear.lower / m.clearWeeks * m.k))} to ${fmt(Math.round(m.clear.upper / m.clearWeeks * m.k))} extra ${u} a week on top of required capacity.`);
    else if (w < s.lower) out.push(`Your waiting list of ${fmt(w)} is below the sustainable size of ${fmt(s.lower)} to ${fmt(s.upper)}. A list that is too short can leave clinics hard to fill at short notice.`);
    else out.push(`Your waiting list of ${fmt(w)} is within the sustainable size of ${fmt(s.lower)} to ${fmt(s.upper)}.`);
  } else out.push(`The sustainable waiting list for your pathway is ${fmt(m.sus.lower)} to ${fmt(m.sus.upper)} patients. Enter your current waiting list in step 1 to compare.`);
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
  if (!m.urg.length) msgs.push('Name at least one urgency level in step 1.');
  if (m.rows.length < 10) msgs.push(m.rows.length ? `Add more weeks of demand: you have ${plural(m.rows.length, 'week')} and the model needs at least 10 (ideally 52 or more).` : 'Paste at least 10 weeks of demand in step 2, or click Example to see how the tool works.');
  return `<div class="empty">${msgs.concat(m.warnings).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
}

function renderAll(){
  const m = model(); state.m = m;
  const svc = $('#service').value.trim();
  $('#outTitle').textContent = svc ? `${svc}: demand and capacity` : 'Your demand and capacity summary';
  statusLines(m);
  if (!m.ready){ out.innerHTML = emptyState(m); return; }
  trackChart({ points: m.rows.length });
  const u = unitWord(m, true), U = m.unit;
  const v = verdict(m);
  const pl = `${Math.round(m.pLow * 100)}th`;
  const conv = m.k !== 1 ? `<p class="note">On aggregate, 1 patient = ${fmt(m.k, 1)} ${u}.</p>` : '';
  let h = '';
  h += `<section class="out-sec" aria-labelledby="hCap">
    <div class="out-head"><h3 id="hCap">Required against available capacity</h3>
      <div class="seg" role="radiogroup" aria-label="Show capacity"><label><input type="radio" name="capView" value="week"${state.capView === 'week' ? ' checked' : ''}><span>By week</span></label><label><input type="radio" name="capView" value="overall"${state.capView === 'overall' ? ' checked' : ''}><span>Overall</span></label></div></div>
    <p class="lead">Year from ${fmtDate(m.yearStart)}. ${U} per week.</p>
    <div class="kpis">
      <div class="kpi"><h4>Required capacity a week</h4><div class="big">${fmt1(m.req.lower)}–${fmt1(m.req.upper)}</div><p>${pl} to 85th percentile of demand. Average ${fmt1(m.req.avg)}, ${fmt(m.req.year)} a year.</p></div>
      <div class="kpi"><h4>Available capacity a week</h4><div class="big">${fmt1(m.avail.total)}</div><dl><dt>Core</dt><dd>${fmt1(m.avail.core)}</dd><dt>Ad hoc</dt><dd>${fmt1(m.avail.adhoc)}</dd>${m.sameDay ? `<dt>Set aside for same day</dt><dd>${fmt1(m.avail.carve)}</dd>` : ''}</dl></div>
      <div class="kpi"><h4>Gap to 85th percentile</h4><div class="big">${m.avail.total >= m.req.upper ? 'None' : fmt(Math.ceil(m.req.upper - m.avail.total))}${m.avail.total >= m.req.upper ? '' : ` <small>${u}</small>`}</div><p>${m.avail.total >= m.req.lower ? `Meets the ${pl} percentile.` : `${units(m, Math.ceil(m.req.lower - m.avail.total))} short of the ${pl} percentile.`}</p></div>
    </div>
    <div class="verdict ${v.cls}">${ICON[v.cls]}<div><p><strong>${esc(v.head)}</strong></p><p>${esc(v.body)}</p></div></div>
    <div class="chart-box" id="capBox"></div>
    <div class="legend"><span><i class="sw" style="background:var(--req)"></i>Required capacity (${pl} to 85th percentile)</span><span><i class="ln" style="border-color:var(--core)"></i>Available capacity (core)</span><span><i class="ln" style="border-color:var(--adhoc)"></i>Available capacity (core plus ad hoc)</span>${m.sameDay && state.capView === 'week' ? '<span><i class="ln d" style="border-color:var(--carve)"></i>Including capacity set aside for same day</span>' : ''}</div>
    ${conv}
  </section>`;

  h += `<section class="out-sec" aria-labelledby="hWl">
    <div class="out-head"><h3 id="hWl">Waiting list position</h3></div>
    <p class="lead">The sustainable waiting list lets you see patients within your pathway times while keeping clinics full.</p>
    <div class="kpis">
      <div class="kpi"><h4>Current waiting list</h4><div class="big">${m.wl == null ? '–' : fmt(m.wl)}</div><p>${m.wl == null ? 'Enter it in step 1.' : 'Patients, booked and unbooked.'}</p></div>
      <div class="kpi"><h4>Sustainable waiting list</h4><div class="big">${fmt(m.sus.lower)}–${fmt(m.sus.upper)}</div><p>Patients, from your pathway times and demand.</p></div>
      ${m.wl != null ? `<div class="kpi"><h4>Backlog to clear</h4><div class="big">${m.clear.upper > 0 ? `${fmt(m.clear.lower)}–${fmt(m.clear.upper)}` : 'None'}</div><p>${m.clear.upper > 0 ? `Clearing it in ${plural(m.clearWeeks, 'week')} needs ${fmt(Math.round(m.clear.lower / m.clearWeeks * m.k))}–${fmt(Math.round(m.clear.upper / m.clearWeeks * m.k))} extra ${u} a week.` : 'Within or below the sustainable size.'}</p></div>` : ''}
    </div>
    <div class="chart-box" id="wlBox"></div>
  </section>`;

  h += `<section class="out-sec" aria-labelledby="hSpc">
    <div class="out-head"><h3 id="hSpc">Weekly demand (SPC chart)</h3>
      <div class="opts"><label class="check"><input type="checkbox" id="optPct"${state.showPct ? ' checked' : ''}> Show percentiles</label>${m.sameDay ? `<label class="check"><input type="checkbox" id="optSame"${state.showSame ? ' checked' : ''}> Show same-day demand</label>` : ''}</div></div>
    <p class="lead">Elective demand in patients. Shading marks the baseline${m.seasons.length > 1 ? ' and its seasons' : ''}. Limits outside the baseline follow the season for that time of year. Click a point to leave that week out of the baseline, or include it again.</p>
    <div class="kpis">${m.seasons.map(s => `<div class="kpi"><h4>${m.seasons.length > 1 ? `<i class="sw" style="background:var(--s${s.s});border:1px solid var(--rule)"></i> Season ${s.s}` : 'Baseline'}: ${plural(s.len, 'week')}</h4><dl><dt>Mean</dt><dd>${fmt1(s.mean)}</dd><dt>${pl} percentile</dt><dd>${fmt1(s.lo)}</dd><dt>85th percentile</dt><dd>${fmt1(s.hi)}</dd><dt>Control limits</dt><dd>${fmt1(Math.max(0, s.mean - 3 * s.sigma))}–${fmt1(s.mean + 3 * s.sigma)}</dd>${m.sameDay ? `<dt>Same day (mean)</dt><dd>${fmt1(s.same)}</dd>` : ''}</dl></div>`).join('')}</div>
    <div class="chart-box" id="spcBox"></div>
    <div class="legend"><span><i class="ln" style="border-color:var(--line)"></i>Demand</span><span><i class="ln" style="border-color:var(--limit)"></i>Mean</span><span><i class="ln d" style="border-color:var(--limit)"></i>Control limits</span>${state.showPct ? `<span><i class="ln" style="border-color:var(--req)"></i>85th percentile</span><span><i class="ln d" style="border-color:var(--req)"></i>${pl} percentile</span>` : ''}${state.showSame && m.sameDay ? '<span><i class="ln" style="border-color:var(--carve)"></i>Same day</span>' : ''}<span><i class="dot" style="background:var(--surface);border:1.5px solid var(--muted)"></i>Left out</span></div>
    <ul class="signals" aria-label="Special cause variation markers">${RULES.map(r => `<li><i class="dot" style="background:var(--${r.key});border-radius:1px"></i>${esc(r.text)}</li>`).join('')}</ul>
  </section>`;

  const a = m.act;
  h += `<section class="out-sec" aria-labelledby="hAct">
    <div class="out-head"><h3 id="hAct">Activity outcomes over a year</h3></div>
    <p class="lead">How baseline demand, normalised to 52 weeks, flows through the service. Patients.</p>
    <div class="flow">
      <div class="box in"><h4>1. Estimated demand</h4><div class="v">${fmt(a.D)}</div><p>Incoming demand</p></div>
      <div class="box out"><h4>2. Removed other than treatment</h4><div class="v">${fmt(a.rott)}</div><p>ROTT, ${fmt(m.rott * 100, 1)}% of demand. Leave without using a slot.</p></div>
      <div class="box out"><h4>3. Slot reused, then discharged</h4><div class="v">${fmt(a.nasr)}</div><p>NASR discharged, ${fmt(m.nasr * 100, 1)}% of booked. Leave without using a slot.</p></div>
      <div class="box slot"><h4>4. Clinical slots used</h4><div class="v">${fmt(a.slots)}</div><p>Not required capacity: this doesn't allow for variation.</p></div>
      <div class="box slot"><h4>5. Slot lost (cancelled or did not attend)</h4><div class="v">${fmt(a.nasl)}</div><p>NASL, ${fmt(m.nasl * 100, 1)}% of booked: ${fmt(a.rebook)} rebooked, ${fmt(a.nasldc)} discharged.</p></div>
      <div class="box att"><h4>6. Expected attendances</h4><div class="v">${fmt(a.att)}</div><p>Leave the pathway having used a slot.</p></div>
    </div>
    ${a.actual != null ? `<p class="note${a.inconsistent ? ' warn' : ''}">Based on the ${fmt(a.actual)} attendances you recorded, estimated demand is ${fmt(a.estD)} a year${m.dc ? ' (before your demand change)' : ''}.${a.inconsistent ? ' This differs from your demand data by more than 5%, so please recheck your figures.' : ' This is consistent with your demand data.'}</p>` : ''}
  </section>`;

  h += `<section class="out-sec" aria-labelledby="hPath">
    <div class="out-head"><h3 id="hPath">Pathway waits</h3></div>
    <p class="lead">When each urgency is seen, with each group's share of demand and of the sustainable waiting list. Grey bars show rebooking waits.</p>
    <div class="chart-box" id="pathBox"></div>
    <div class="tablewrap" style="max-height:none"><table><thead><tr><th class="l">Urgency</th><th>Share of demand</th><th>Seen from (weeks)</th><th>Seen by (weeks)</th><th>Rebooked within (weeks)</th><th>Sustainable waiting list</th></tr></thead><tbody>${m.path.map(r => `<tr><td class="l">${esc(r.name)}</td><td>${fmt(r.split * 100, 1)}%</td><td>${fmt(r.start, 1)}</td><td>${fmt(r.end, 1)}</td><td>${fmt(r.rebook, 1)}</td><td>${fmt1(r.wl)}</td></tr>`).join('')}</tbody></table></div>
  </section>`;

  h += `<section class="reading" aria-labelledby="hRead"><h3 id="hRead">What this means</h3>${readingText(m).map(t => `<p>${esc(t)}</p>`).join('')}
    ${m.warnings.map(t => `<p class="note warn">${esc(t)}</p>`).join('')}
    <p class="note">This tool follows the NHS Improvement and NHS England demand and capacity core model for a single service. It doesn't cover several modalities, planned (scheduled) demand or the capacity planning calculator for critical resources, and it assumes capacity is spread evenly across the year.</p></section>`;

  h += `<details class="values"><summary>Week by week values</summary>
    <div class="tablewrap"><table><thead><tr><th class="l">Week starting</th><th>Season</th><th>Required (${pl})</th><th>Required (85th)</th><th>Required (average)</th><th>Core</th><th>Ad hoc</th>${m.sameDay ? '<th>Same day set aside</th>' : ''}</tr></thead><tbody>${m.weeks.map(w => `<tr><td class="l">${fmtDate(w.t)}</td><td>${w.season}</td><td>${fmt(w.lower, 1)}</td><td>${fmt(w.upper, 1)}</td><td>${fmt(w.avg, 1)}</td><td>${fmt(w.core, 1)}</td><td>${fmt(w.adhoc, 1)}</td>${m.sameDay ? `<td>${fmt(w.carve, 1)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
  </details>
  <details class="values"><summary>Demand data and baseline</summary>
    <div class="tablewrap"><table><thead><tr><th class="l">Week starting</th>${m.urg.map(x => `<th>${esc(x.name)}</th>`).join('')}<th>Total</th>${m.sameDay ? '<th>Same day</th>' : ''}<th class="l">Baseline</th><th>Leave out</th></tr></thead><tbody>${m.rows.map((r, i) => { const inB = i >= m.b0 && i < m.b0 + m.L; return `<tr class="${inB ? 'base' : ''}${r.excl ? ' excl' : ''}"><td class="l">${fmtDate(r.t)}</td>${r.u.map(x => `<td>${fmt(x)}</td>`).join('')}<td>${fmt(r.total)}</td>${m.sameDay ? `<td>${fmt(r.same)}</td>` : ''}<td class="l">${inB ? (m.seasons.length > 1 ? 'Season ' + m.seasonAt(r.t).s : 'Yes') : ''}${m.signals[i] ? ' · special cause' : ''}</td><td><input type="checkbox" data-ex="${i}"${r.excl ? ' checked' : ''} aria-label="Leave out week starting ${fmtDate(r.t)}"></td></tr>`; }).join('')}</tbody></table></div>
  </details>`;
  out.innerHTML = h;
  drawCharts();
}

function drawCharts(){
  const m = state.m; if (!m || !m.ready) return;
  const p = palette();
  const box = id => { const el = $('#' + id); return el ? [el, Math.max(320, Math.round(el.clientWidth || 800))] : [null, 0]; };
  let [el, W] = box('capBox'); if (el) el.innerHTML = capChart(m, W, p, state.capView);
  [el, W] = box('wlBox'); if (el) el.innerHTML = wlChart(m, W, p);
  [el, W] = box('spcBox'); if (el) el.innerHTML = spcChart(m, W, p, true);
  [el, W] = box('pathBox'); if (el) el.innerHTML = pathChart(m, W, p);
}

function toggleWeek(i){
  const m = state.m; if (!m || !m.rows[i]) return;
  const key = isoDate(m.rows[i].t);
  if (state.excluded.has(key)) state.excluded.delete(key); else state.excluded.add(key);
  renderAll();
}
out.addEventListener('click', e => {
  const g = e.target.closest('.pt'); if (g) toggleWeek(+g.dataset.i);
});
out.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'capView'){ state.capView = t.value; renderAll(); }
  else if (t.id === 'optPct'){ state.showPct = t.checked; renderAll(); }
  else if (t.id === 'optSame'){ state.showSame = t.checked; renderAll(); }
  else if (t.dataset.ex != null){ toggleWeek(+t.dataset.ex); }
});

/* ---------- Status lines and dependent fields ---------- */
function statusLines(m){
  const ds = $('#demandStatus'), p = m.parse;
  if (!$('#demand').value.trim()){ ds.textContent = ''; ds.className = 'status'; }
  else {
    let t = `${plural(p.rows.length, 'week')} read`;
    if (p.rows.length) t += `, ${fmtDate(p.rows[0].t)} to ${fmtDate(p.rows[p.rows.length - 1].t)}`;
    t += '.';
    if (p.header) t += ' First line used as a header.';
    if (p.skipped.length) t += ` ${plural(p.skipped.length, 'line')} skipped (check the date and numbers).`;
    if (p.dupes) t += ` ${plural(p.dupes, 'repeated week')} ignored.`;
    if (p.gaps) t += ` ${plural(p.gaps, 'gap')} between weeks.`;
    if (state.excluded.size) t += ` ${plural([...m.rows].filter(r => r.excl).length, 'week')} left out.`;
    ds.textContent = t; ds.className = 'status' + (p.skipped.length || p.gaps ? ' warn' : '');
  }
  const cs = $('#capStatus');
  if (!$('#core').value.trim() && !$('#adhoc').value.trim()){ cs.textContent = 'No capacity entered yet.'; cs.className = 'status warn'; }
  else {
    const sk = m.core.skipped.length + m.adhoc.skipped.length;
    cs.textContent = `${plural(m.core.rows.length, 'core session')} (${fmt1(m.coreWk)} a week), ${plural(m.adhoc.rows.length, 'ad hoc session')} (${fmt1(m.adhocWk)} a week).${sk ? ` ${plural(sk, 'line')} skipped.` : ''}`;
    cs.className = 'status' + (sk ? ' warn' : '');
  }
}
function fillWeekSelect(sel, rows, first, keepBlank){
  const cur = sel.value;
  const opts = (keepBlank ? [`<option value="">${first}</option>`] : []).concat(rows.map(r => `<option value="${isoDate(r.t)}">${fmtDate(r.t)}</option>`));
  sel.innerHTML = opts.join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}
function syncFields(){
  const unit = $('#unit').value;
  $('#perPatientWrap').hidden = unit === 'Patients';
  $('#perPatientLabel').textContent = `${unit} per patient`;
  $('#unitHint').textContent = unit === 'Patients' ? 'Demand and capacity are both counted in patients (appointment slots).' : `Demand is entered in patients and converted to ${unit.toLowerCase()}. Capacity is entered in ${unit.toLowerCase()}.`;
  $('#capUnitHint').textContent = ` (in ${unit.toLowerCase()})`;
  $('#sameDayHint').hidden = !$('#sameDay').checked;
  [1, 2, 3].forEach(i => {
    const nm = $('#u' + i).value.trim();
    $('#pn' + i).textContent = nm || '(not used)';
    [['s', 'seen from'], ['e', 'seen by'], ['r', 'rebooked within'], ['u', 'units']].forEach(([f, lab]) => {
      const el = $('#p' + i + f); el.disabled = !nm; el.setAttribute('aria-label', `${nm || 'Urgency ' + i}: ${lab}`);
    });
  });
  const rows = parseDemand($('#demand').value, 1).rows;
  fillWeekSelect($('#baseStart'), rows, 'Automatic (most recent weeks)', true);
  [2, 3, 4].forEach(s => fillWeekSelect($('#s' + s), rows, 'Automatic', true));
  const nS = +$('#seasons').value;
  $('#seasonFields').hidden = nS < 2;
  document.querySelectorAll('#seasonFields [data-s]').forEach(el => { el.hidden = +el.dataset.s > nS; });
  $('#restWrap').hidden = nS < 2 || inputNum('baseLen', 52) >= 52;
  [...$('#restSeason').options].forEach(o => { o.hidden = +o.value > nS; });
}

let timer;
const aside = $('aside.panel');
aside.addEventListener('input', e => {
  clearTimeout(timer);
  timer = setTimeout(() => { syncFields(); renderAll(); }, e.target.tagName === 'TEXTAREA' ? 200 : 80);
});
aside.addEventListener('change', () => { clearTimeout(timer); syncFields(); renderAll(); });

/* ---------- Exports ---------- */
function slug(){ return ($('#service').value.trim() || 'demand-and-capacity').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'demand-and-capacity'; }
function exportSVG(){
  const m = state.m, p = LIGHT, W = 1200;
  const cap = capChart(m, W - 48, p, state.capView), spc = spcChart(m, W - 48, p, false), wl = wlChart(m, W - 48, p);
  const hC = +cap.match(/height="(\d+)"/)[1], hS = +spc.match(/height="(\d+)"/)[1], hW = +wl.match(/height="(\d+)"/)[1];
  const v = verdict(m), u = unitWord(m, true);
  let y = 0, s = '';
  const text = (t, size, weight, fill, dy) => { y += dy; s += `<text x="24" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(t)}</text>`; };
  text($('#service').value.trim() || 'Demand and capacity summary', 22, 700, p.ink, 36);
  text(`Year from ${fmtDate(m.yearStart)}. Required ${fmt1(m.req.lower)}–${fmt1(m.req.upper)} ${u} a week; available ${fmt1(m.avail.total)} (core ${fmt1(m.avail.core)}, ad hoc ${fmt1(m.avail.adhoc)}).`, 14, 400, p.muted, 24);
  text(v.head, 14, 600, p.ink, 22);
  text('Required against available capacity', 15, 600, p.ink, 32);
  s += `<g transform="translate(24 ${y + 8})">${cap.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`; y += hC + 8;
  text(`Waiting list: current ${m.wl == null ? 'not entered' : fmt(m.wl)}, sustainable ${fmt(m.sus.lower)}–${fmt(m.sus.upper)} patients`, 15, 600, p.ink, 30);
  s += `<g transform="translate(24 ${y})">${wl.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`; y += hW;
  text('Weekly demand (SPC chart), patients', 15, 600, p.ink, 26);
  s += `<g transform="translate(24 ${y + 8})">${spc.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`; y += hS + 8;
  text('Based on the NHS Improvement and NHS England demand and capacity core model. Blue: required capacity; green: available capacity.', 11.5, 400, p.muted, 26);
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
function csvText(){
  const m = state.m, pl = Math.round(m.pLow * 100);
  const rows = [['Week starting', 'Season', `Required ${pl}th percentile`, 'Required 85th percentile', 'Required average', 'Core capacity', 'Ad hoc capacity'].concat(m.sameDay ? ['Same day set aside'] : [])];
  m.weeks.forEach(w => rows.push([isoDate(w.t), w.season, w.lower.toFixed(2), w.upper.toFixed(2), w.avg.toFixed(2), w.core.toFixed(2), w.adhoc.toFixed(2)].concat(m.sameDay ? [w.carve.toFixed(2)] : [])));
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
function tableText(){ return csvText().split('\r\n').map(l => l.split(',').join('\t')).join('\n'); }
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

/* ---------- Example: a new outpatient service ---------- */
const EX_DEMAND = '2,3,16 9,1,11 4,2,9 4,1,24 4,3,17 11,4,17 7,3,19 7,5,25 8,3,3 4,3,12 6,5,20 6,4,16 8,3,14 5,0,13 10,2,14 8,3,9 14,3,6 7,9,21 4,3,3 8,4,9 7,5,25 4,4,16 4,7,13 4,1,18 8,6,11 10,4,15 4,3,16 7,4,12 7,3,23 2,1,20 4,1,21 6,2,8 11,8,22 3,3,13 3,4,20 5,3,20 7,1,15 5,7,13 2,1,3 4,10,11 5,3,21 9,2,23 7,3,19 6,3,25 7,5,24 11,5,5 5,1,27 4,4,15 9,3,17 6,2,12 4,2,18 9,3,19 6,7,11 4,1,16 6,0,21 7,2,22 6,5,14 1,1,7 7,5,17 8,1,10 5,2,10 6,8,13 3,1,13 4,4,17 9,8,16 7,1,13 8,4,9 2,2,19 6,7,26 7,7,22 3,3,11 2,4,10 3,1,10 7,4,13 4,2,13 8,2,17 6,3,16 7,5,13 4,3,9 5,4,19 7,1,26 8,2,22 4,3,15 3,13,33 5,4,25 2,4,19 4,5,22 3,3,27 3,2,30 4,3,36 2,2,19 3,1,22 5,3,27 7,5,30 9,3,36 2,2,12 2,1,13 8,2,32 3,1,11 1,4,22 3,1,18 6,3,19 5,2,29 3,6,19 5,4,8';
function loadExample(){
  const pad = x => String(x).padStart(2, '0');
  const lines = ['Week starting\t2WW\tUrgent\tRoutine'];
  EX_DEMAND.split(' ').forEach((v, i) => {
    const d = new Date(Date.UTC(2022, 3, 4) + i * WEEK);
    lines.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}\t${v.split(',').join('\t')}`);
  });
  const set = (id, v) => { const el = $('#' + id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
  set('service', 'Haematology new outpatients'); set('unit', 'Patients'); set('perPatient', '20'); set('pctLower', '65');
  set('u1', '2WW'); set('u2', 'Urgent'); set('u3', 'Routine'); set('sameDay', false); set('wl', '153');
  set('demand', lines.join('\n')); syncFields(); set('baseStart', '2023-04-03'); set('baseLen', '52'); set('seasons', '1');
  set('capStart', '2024-04-01');
  set('core', ['Session\tWeeks per year\tSlots per session', 'Consultant 1 Mon AM\t38\t4', 'Registrar 1 Mon AM\t38\t3', 'Consultant 1 Thu PM\t42\t4', 'Registrar 1 Thu PM\t42\t3', 'Consultant 2 Thu PM\t42\t5', 'Registrar 2 Thu PM\t42\t2', 'Consultant 3 Fri AM\t40\t5', 'Registrar 3 Fri AM\t40\t3', 'Consultant 4 Fri PM\t40\t3'].join('\n'));
  set('adhoc', ['Session\tWeeks per year\tSlots per session', 'Locum 1 Sat AM\t40\t4'].join('\n'));
  set('rott', '2.4'); set('nasr', '1.5'); set('nasl', '5.7'); set('nasldc', '35.4'); set('actualAtt', '1330');
  set('p1s', '0'); set('p1e', '7'); set('p1r', '0'); set('p1u', 'Days');
  set('p2s', '1'); set('p2e', '2'); set('p2r', '0'); set('p2u', 'Weeks');
  set('p3s', '2'); set('p3e', '8'); set('p3r', '0'); set('p3u', 'Weeks');
  set('demandChange', '0'); set('clearWeeks', '8');
  state.excluded.clear();
  syncFields(); renderAll();
}

/* ---------- Shared toolbar (Open, Save, Export) ---------- */
FocusActions.mount({
  tool: 'demand_capacity', toolName: 'demand and capacity model',
  example: loadExample, hasData: () => !!($('#demand').value.trim() || $('#core').value.trim()),
  fileName: () => slug(),
  fields: 'aside.panel[aria-label="Data and settings"]',
  getExtra: () => ({ excluded: [...state.excluded] }),
  setExtra: x => { state.excluded = new Set((x && x.excluded) || []); },
  afterOpen: () => { clearTimeout(timer); syncFields(); renderAll(); },
  ready: () => !!(state.m && state.m.ready),
  exports: trackExports([
    { type: 'png', run: () => doExport('png') },
    { type: 'svg', run: () => doExport('svg') },
    { type: 'copyimg', run: () => doExport('copyimg') },
    { type: 'csv', run: () => doExport('csv'), hint: 'Week by week required and available capacity' },
    { type: 'copytable', run: () => doExport('copytable') },
    { type: 'copysummary', run: () => doExport('copysummary') }
  ])
});
trackSettings({ unit: 'unit', percentile: 'pctLower', sameDay: 'sameDay', seasons: 'seasons', capacityView: 'capView', showPercentiles: 'optPct', showSameDay: 'optSame' });

let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(drawCharts, 80); }).observe(out);
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCharts);

syncFields(); renderAll();
})();

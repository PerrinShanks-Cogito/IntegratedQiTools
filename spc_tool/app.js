/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function(){
"use strict";
const $ = s => document.querySelector(s);
const state = {
  type: 'xmr',
  rows: [], header: null, skipped: [], invalid: [], decimals: 0, wide: false,
  breaks: new Set(), dir: 'up', target: null, title: '', team: '',
  shiftLen: 7, trendLen: 7, twoThree: true,
  // XmR only
  useBaseN: false, baseN: 20, screen: false, floor: false, showMR: true, yLabel: '',
  // P chart only
  laney: false, unit: 'pct', yMin: null, yMax: null, showNotes: true,
  // U chart only
  per: 1000, perUnit: '',
  // T chart only
  events: [], unsorted: false, hasTime: false, order: 'dmy', useTrend: true, dateFmt: 'dmy'
};
let model = null;

/* ---------- Parsing ---------- */
function splitCSV(line){
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (q){ if (c === '"' && line[i + 1] === '"'){ cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ','){ out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim()); return out;
}

// XmR: a value per line, allowing units, currency, percentages and brackets for negatives
function xNum(raw){
  if (raw === undefined || raw === null) return NaN;
  let t = String(raw).trim().replace(/^"(.*)"$/, '$1').replace(/[−–—]/g, '-').replace(/[£$€%\s ]/g, '');
  if (t === '') return NaN;
  t = t.replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
  const par = t.match(/^\((.*)\)$/); if (par) t = '-' + par[1];
  const m = t.match(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i);
  if (!m) return NaN;
  const rest = t.slice(m[0].length);
  if (rest && !/^[a-z/]+$/i.test(rest)) return NaN;   // allow units like "42days", reject "12/05/2024"
  return Number(m[0]);
}
function decimalsOf(raw){ const t = String(raw).replace(/(\d),(?=\d{3}(\D|$))/g, '$1'); const m = t.match(/\.(\d+)/); return m ? m[1].length : 0; }
function parseXmr(text){
  const lines = text.split(/\r\n|\r|\n/);
  const nonEmpty = lines.filter(l => l.trim() !== '');
  const thousandsOnly = nonEmpty.length && nonEmpty.every(l => /^\s*"?[-(]?[£$€]?\d{1,3}(,\d{3})+(\.\d+)?\)?%?"?\s*$/.test(l));
  let delim = 'ws';
  if (nonEmpty.some(l => l.includes('\t'))) delim = '\t';
  else if (nonEmpty.some(l => l.includes(';'))) delim = ';';
  else if (!thousandsOnly && nonEmpty.some(l => l.includes(','))) delim = ',';
  else if (thousandsOnly) delim = 'single';
  const splitLine = t => {
    if (delim === 'single') return [t];
    if (delim === ',') return splitCSV(t);
    if (delim === 'ws') return t.split(/[\s ]+/);
    return t.split(delim).map(f => f.trim().replace(/^"(.*)"$/, '$1'));
  };
  const recs = [];
  lines.forEach((line, idx) => { const t = line.trim(); if (t) recs.push({ idx, f: splitLine(t) }); });
  const rows = [], skipped = []; let header = null, decimals = 0, note = '', wide = false;
  const numericShare = arr => arr.filter(v => isFinite(xNum(v))).length / Math.max(1, arr.length);

  // Data laid out across a row (or a row of labels above a row of values)
  const maxF = Math.max(0, ...recs.map(r => r.f.length));
  if (recs.length <= 2 && maxF >= 3 && delim !== 'ws'){
    let labels = null, vals = recs[0].f;
    if (recs.length === 2){
      if (numericShare(recs[1].f) >= numericShare(recs[0].f)){ labels = recs[0].f; vals = recs[1].f; }
      else { labels = recs[1].f; vals = recs[0].f; }
    }
    vals.forEach((raw, j) => {
      const v = xNum(raw);
      if (!isFinite(v)){ if (raw !== '' && !(j === 0 && labels === null)) skipped.push('column ' + (j + 1)); return; }
      decimals = Math.max(decimals, decimalsOf(raw));
      rows.push({ label: labels && labels[j] ? labels[j] : String(rows.length + 1), value: v, note: '' });
    });
    note = 'Read as a row of values.';
    return { rows, header: null, skipped, invalid: [], decimals: Math.min(decimals, 3), note, wide };
  }

  if (delim === 'ws'){
    recs.forEach(r => {
      const raw = r.f[r.f.length - 1], v = xNum(raw);
      if (!isFinite(v)){ if (!rows.length && header === null) header = r.f; else skipped.push(r.idx + 1); return; }
      decimals = Math.max(decimals, decimalsOf(raw));
      rows.push({ label: r.f.length > 1 ? r.f.slice(0, -1).join(' ') : String(rows.length + 1), value: v, note: '' });
    });
    return { rows, header, skipped, invalid: [], decimals: Math.min(decimals, 3), note, wide };
  }

  // Pick the value column: the one with the most numbers (rightmost wins a tie)
  let valCol = 0, best = -1;
  for (let c = 0; c < maxF; c++){
    const cnt = recs.filter(r => isFinite(xNum(r.f[c]))).length;
    if (cnt >= best){ best = cnt; valCol = c; }
  }
  const labelCol = valCol === 0 ? -1 : 0;
  // Other columns of numbers are more data; anything else after the value is a note
  const numCols = [];
  for (let c = 0; c < maxF; c++) if (c !== valCol && c !== labelCol && recs.filter(r => isFinite(xNum(r.f[c]))).length > recs.length / 2) numCols.push(c);
  recs.forEach(r => {
    const raw = r.f[valCol], v = xNum(raw);
    if (!isFinite(v)){
      if (!rows.length && header === null) header = r.f;
      else if (!rows.length && header !== null && (raw || '').trim() !== '') { /* extra title row before data */ }
      else skipped.push(r.idx + 1);
      return;
    }
    decimals = Math.max(decimals, decimalsOf(raw));
    const lab = labelCol >= 0 && r.f[labelCol] !== undefined && r.f[labelCol] !== '' ? r.f[labelCol] : String(rows.length + 1);
    const nt = r.f.slice(valCol + 1).filter((x, j) => x && !numCols.includes(valCol + 1 + j)).join(' · ');
    rows.push({ label: lab, value: v, note: nt.slice(0, 120) });
  });
  if (numCols.length){
    const name = header && header[valCol] ? `the “${header[valCol]}” column` : `column ${valCol + 1}`;
    note = `Using ${name} for values.`; wide = true;
  }
  if (header) header = [header[valCol] || ''];
  return { rows, header, skipped, invalid: [], decimals: Math.min(decimals, 3), note, wide };
}

// P chart: each line has a label, count, total, then an optional note
function pNum(raw){
  if (raw === undefined || raw === null) return NaN;
  let t = String(raw).trim().replace(/^"(.*)"$/, '$1').replace(/[\s ]/g, '');
  if (t === '') return NaN;
  t = t.replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}
// The U chart reads the same layout, with an exposure in place of the total, which the count can be more than
function parseP(text, kind){
  const lines = text.split(/\r\n|\r|\n/);
  const nonEmpty = lines.filter(l => l.trim() !== '');
  let delim = 'ws';
  if (nonEmpty.some(l => l.includes('\t'))) delim = '\t';
  else if (nonEmpty.some(l => l.includes(';'))) delim = ';';
  else if (nonEmpty.some(l => l.includes(','))) delim = ',';
  const rows = [], skipped = [], invalid = []; let header = null;
  lines.forEach((line, idx) => {
    const t = line.trim(); if (!t) return;
    let label = '', num = NaN, den = NaN, note = '';
    if (delim === 'ws'){
      // Labels may contain spaces (Apr 2024), so the count and total are the last two numbers
      const f = t.split(/[\s ]+/);
      if (f.length >= 2){ num = pNum(f[f.length - 2]); den = pNum(f[f.length - 1]); label = f.slice(0, -2).join(' '); }
    } else {
      const f = delim === ',' ? splitCSV(t) : t.split(delim).map(x => x.trim().replace(/^"(.*)"$/, '$1'));
      const numeric = f.map(x => isFinite(pNum(x)));
      // The label is the first column unless it's the count; a numeric first column is a label (such as a year or week number) when two more numbers follow
      let k = 0;
      if (!numeric[0]) k = 1;
      else if (numeric.length >= 3 && numeric[1] && numeric[2]) k = 1;
      if (k === 1) label = f[0];
      if (numeric[k] && numeric[k + 1]){ num = pNum(f[k]); den = pNum(f[k + 1]); note = f.slice(k + 2).filter(x => x).join(' · '); }
    }
    if (!isFinite(num) || !isFinite(den)){
      if (!rows.length && header === null) header = t; else skipped.push(idx + 1);
      return;
    }
    if (kind === 'u' && (den <= 0 || num < 0)){ invalid.push({ line: idx + 1, why: den <= 0 ? 'exposure is zero' : 'count is negative' }); return; }
    if (kind !== 'u' && (den <= 0 || num < 0 || num > den)){ invalid.push({ line: idx + 1, why: den <= 0 ? 'total is zero' : num < 0 ? 'count is negative' : 'count is more than the total' }); return; }
    rows.push({ label: label || String(rows.length + 1), num, den, note: note.slice(0, 120), line: idx + 1 });
  });
  return { rows, header, skipped, invalid, decimals: 0, note: '', wide: false };
}

// C chart: each line has a label, the count, then an optional note
function parseC(text){
  const lines = text.split(/\r\n|\r|\n/);
  const nonEmpty = lines.filter(l => l.trim() !== '');
  let delim = 'ws';
  if (nonEmpty.some(l => l.includes('\t'))) delim = '\t';
  else if (nonEmpty.some(l => l.includes(';'))) delim = ';';
  else if (nonEmpty.some(l => l.includes(','))) delim = ',';
  const rows = [], skipped = [], invalid = []; let header = null, wide = false;
  lines.forEach((line, idx) => {
    const t = line.trim(); if (!t) return;
    let label = '', num = NaN, note = '';
    if (delim === 'ws'){
      // Labels may contain spaces (Apr 2024), so the count is the last number
      const f = t.split(/[\s\u00a0]+/);
      num = pNum(f[f.length - 1]); label = f.slice(0, -1).join(' ');
    } else {
      const f = delim === ',' ? splitCSV(t) : t.split(delim).map(x => x.trim().replace(/^"(.*)"$/, '$1'));
      const numeric = f.map(x => isFinite(pNum(x)));
      // A numeric first column is a label (such as a year or week number) when another number follows
      const k = !numeric[0] || numeric[1] ? 1 : 0;
      if (k === 1) label = f[0];
      if (numeric[k]){ num = pNum(f[k]); note = f.slice(k + 1).filter(x => x).join(' · '); if (numeric[k + 1]) wide = true; }
    }
    if (!isFinite(num)){
      if (!rows.length && header === null) header = t; else skipped.push(idx + 1);
      return;
    }
    if (num < 0){ invalid.push({ line: idx + 1, why: 'count is negative' }); return; }
    rows.push({ label: label || String(rows.length + 1), num, den: 1, note: note.slice(0, 120), line: idx + 1 });
  });
  return { rows, header, skipped, invalid, decimals: 0, note: '', wide };
}

// T chart: the date of each event, with anything else on the line kept as a note
const DAY = 864e5, POW = 3.6;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthOf(s){ const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase()); return i < 0 ? -1 : i; }
function fullYear(y){ y = +y; return y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y; }
function mk(y, mo, d, h, mi, se){
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  h = +(h || 0); mi = +(mi || 0); se = +(se || 0);
  if (h > 23 || mi > 59 || se > 59) return null;
  const t = Date.UTC(y, mo, d, h, mi, se), c = new Date(t);
  if (c.getUTCDate() !== d || c.getUTCMonth() !== mo) return null;
  return { t, time: h || mi || se ? true : false };
}
const TIME = '(?:[ T,]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?)?';
const RE_ISO = new RegExp('^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})' + TIME + '$');
const RE_NUM = new RegExp('^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2}|\\d{4})' + TIME + '$');
const RE_DMONY = new RegExp('^(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-]+([A-Za-z]{3,9})\\.?,?[\\s\\-]+(\\d{2}|\\d{4})' + TIME + '$');
const RE_MONDY = new RegExp('^([A-Za-z]{3,9})\\.?[\\s\\-]+(\\d{1,2})(?:st|nd|rd|th)?,?[\\s\\-]+(\\d{4})' + TIME + '$');
// order: 'dmy' or 'mdy' for dates such as 03/04/2024
function parseDate(raw, order){
  const s = String(raw || '').trim().replace(/^"(.*)"$/, '$1').trim();
  if (!s) return null;
  let m;
  if (/^\d{5}(\.\d+)?$/.test(s)){
    // Excel date serial number
    const v = +s; if (v < 20000 || v > 80000) return null;
    const t = Math.round((v - 25569) * DAY / 1000) * 1000;
    return { t, time: v % 1 !== 0 };
  }
  if ((m = s.match(RE_ISO))) return mk(+m[1], +m[2] - 1, +m[3], m[4], m[5], m[6]);
  if ((m = s.match(RE_NUM))){
    const a = +m[1], b = +m[2], y = fullYear(m[3]);
    return order === 'mdy' ? mk(y, a - 1, b, m[4], m[5], m[6]) : mk(y, b - 1, a, m[4], m[5], m[6]);
  }
  if ((m = s.match(RE_DMONY))) return mk(fullYear(m[3]), monthOf(m[2]), +m[1], m[4], m[5], m[6]);
  if ((m = s.match(RE_MONDY))) return mk(+m[3], monthOf(m[1]), +m[2], m[4], m[5], m[6]);
  return null;
}
// Find the date in one line and treat whatever else is there as a note
function readLine(line, order){
  const t = line.trim();
  const whole = parseDate(t, order); if (whole) return { d: whole, note: '' };
  const delim = t.includes('\t') ? '\t' : t.includes(';') ? ';' : null;
  let fields = delim ? t.split(delim).map(f => f.trim().replace(/^"(.*)"$/, '$1')) : null;
  if (!fields && t.includes(',')){
    const f = splitCSV(t);
    if (f.some(x => parseDate(x, order))) fields = f;
  }
  if (fields){
    const k = fields.findIndex(f => parseDate(f, order));
    if (k < 0) return null;
    return { d: parseDate(fields[k], order), note: fields.filter((f, j) => j !== k && f && !/^\d+$/.test(f)).join(' · ') };
  }
  const tok = t.split(/\s+/);
  for (let k = Math.min(6, tok.length); k >= 1; k--){
    const d = parseDate(tok.slice(0, k).join(' '), order);
    if (d) return { d, note: tok.slice(k).join(' ') };
  }
  return null;
}
// Day/month order: day first unless a date such as 04/23/2024 can only be month first
function detectOrder(lines){
  let dmy = 0, mdy = 0;
  lines.forEach(l => {
    const re = /(?:^|[\s,;\t"])(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?![\d])/g; let m;
    while ((m = re.exec(l))){ if (+m[1] > 12 && +m[2] <= 12) dmy++; else if (+m[2] > 12 && +m[1] <= 12) mdy++; }
  });
  return mdy > dmy ? 'mdy' : 'dmy';
}
const tf = v => Math.pow(v, 1 / POW), untf = v => Math.pow(v, POW);
function parseT(text){
  const lines = text.split(/\r\n|\r|\n/);
  const order = detectOrder(lines);
  const events = [], skipped = []; let header = null;
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const r = readLine(line, order);
    if (!r){ if (!events.length && header === null) header = line.trim(); else skipped.push(idx + 1); return; }
    events.push({ t: r.d.t, time: r.d.time, note: r.note.slice(0, 120), line: idx + 1 });
  });
  let unsorted = false;
  for (let i = 1; i < events.length; i++) if (events[i].t < events[i - 1].t){ unsorted = true; break; }
  events.sort((a, b) => a.t - b.t || a.line - b.line);
  const hasTime = events.some(e => e.time);
  // One point per event after the first: days since the previous event (0.5 when on the same day)
  const rows = [];
  for (let i = 1; i < events.length; i++){
    let g = (events[i].t - events[i - 1].t) / DAY;
    if (!hasTime) g = Math.round(g);
    if (g === 0) g = 0.5;
    rows.push({ label: dateLong(events[i].t, hasTime), t: events[i].t, prev: events[i - 1].t, gap: g, y: tf(g), note: events[i].note });
  }
  return { rows, events, header, skipped, invalid: [], unsorted, order, hasTime, decimals: 0, note: '', wide: false };
}

/* ---------- Calculation ---------- */
// Shared statistics, from /assets/js/focus-stats.js
const { sum, mean: avg } = FocusStats;

// Charts of counts (P, U and C) show limits once there are this many points, as in the NHS P chart tool
const MIN_COUNT_LIMITS = 13;

function segments(n){
  const starts = [0, ...[...state.breaks].filter(b => b > 0 && b < n).sort((a, b) => a - b)];
  return starts.map((s, k) => ({ s, e: k + 1 < starts.length ? starts[k + 1] : n }));
}

// XmR: one set of limits for each segment, from its average moving range
function limitsXmr(){
  const v = state.rows.map(r => r.value), n = v.length;
  const segs = segments(n).map(({ s, e }) => {
    const be = state.useBaseN && state.baseN >= 2 ? Math.min(s + state.baseN, e) : e;
    const mrs = []; for (let i = s + 1; i < be; i++) mrs.push(Math.abs(v[i] - v[i - 1]));
    const mean = avg(v.slice(s, be));
    let mrBar = mrs.length ? avg(mrs) : NaN, screened = 0;
    if (state.screen && mrs.length > 1){
      const lim = 3.267 * mrBar, kept = mrs.filter(m => m <= lim);
      if (kept.length && kept.length < mrs.length){ screened = mrs.length - kept.length; mrBar = avg(kept); }
    }
    const ok = isFinite(mrBar);
    let ucl = mean + 2.66 * mrBar, lcl = mean - 2.66 * mrBar;
    if (state.floor && lcl < 0) lcl = 0;
    const two = 2 * mrBar / 1.128;
    return { s, e, be, mean, mrBar, ucl, lcl, up2: mean + two, lo2: mean - two, mrUcl: 3.267 * mrBar, screened, ok, fixed: be < e };
  });
  const segOf = i => segs.find(g => i >= g.s && i < g.e);
  const mr = v.map((x, i) => { const g = segOf(i); return i > g.s ? Math.abs(x - v[i - 1]) : null; });
  return { v, n, segs, segOf, lim: v.map((x, i) => segOf(i)), segOk: g => g.ok, mr };
}

// P, U and C charts: limits for each point, from its total or exposure (a C chart's are all the same).
// The P chart's standard deviation is √(p(1 − p) ÷ total), the U chart's √(u ÷ exposure) and the C chart's √c.
// P′ and U′ (Laney) widen the limits by the spread of the z-scores.
function limitsCount(){
  const rows = state.rows, n = rows.length, type = state.type;
  const v = rows.map(r => r.num / r.den);
  const segs = segments(n).map(({ s, e }) => {
    const part = rows.slice(s, e);
    return { s, e, mean: sum(part.map(r => r.num)) / sum(part.map(r => r.den)) };
  });
  const segOf = i => segs.find(g => i >= g.s && i < g.e);
  const sd = v.map((x, i) => {
    const m = segOf(i).mean;
    return Math.sqrt(type === 'p' ? m * (1 - m) / rows[i].den : m / rows[i].den);
  });
  const z = v.map((x, i) => sd[i] > 0 ? (x - segOf(i).mean) / sd[i] : 0);
  const mrz = z.map((x, i) => i > 0 ? Math.abs(x - z[i - 1]) : null);
  const sigmaZ = n > 1 ? avg(mrz.slice(1)) / 1.128 : NaN;
  const ok = n >= MIN_COUNT_LIMITS && (!isLaney() || isFinite(sigmaZ));
  const k = isLaney() ? sigmaZ : 1;
  const lim = v.map((x, i) => {
    const m = segOf(i).mean, s1 = sd[i] * k;
    return { mean: m, s1, ucl: m + 3 * s1, lcl: m - 3 * s1, up2: m + 2 * s1, lo2: m - 2 * s1 };
  });
  return { v, n, segs, segOf, lim, segOk: () => ok, ok, sd, z, mrz, sigmaZ };
}

// T chart: XmR limits on the gaps raised to the power 1/3.6, converted back to days for the chart
function limitsT(){
  const v = state.rows.map(r => r.gap), y = state.rows.map(r => r.y), n = v.length;
  const segs = segments(n).map(({ s, e }) => {
    const be = state.useBaseN && state.baseN >= 2 ? Math.min(s + state.baseN, e) : e;
    const mrs = []; for (let i = s + 1; i < be; i++) mrs.push(Math.abs(y[i] - y[i - 1]));
    const tMean = avg(y.slice(s, be)), mrBar = mrs.length ? avg(mrs) : NaN;
    const ok = isFinite(mrBar);
    const tU = tMean + 2.66 * mrBar, tL = tMean - 2.66 * mrBar;
    return { s, e, be, tMean, mrBar, tU, tL, mean: untf(tMean), ucl: untf(tU), lcl: tL > 0 ? untf(tL) : null, ok, fixed: be < e };
  });
  const segOf = i => segs.find(g => i >= g.s && i < g.e);
  const mr = y.map((x, i) => { const g = segOf(i); return i > g.s ? Math.abs(x - y[i - 1]) : null; });
  // Signals are found on the transformed gaps, against the transformed mean and limits
  const sig = { v: y, mean: g => g.tMean, lim: y.map((x, i) => { const g = segOf(i); return { ucl: g.tU, lcl: g.lcl === null ? -Infinity : g.tL }; }) };
  // The gap still running since the latest event
  const ev = state.events, today = new Date(), todayT = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const lastT = ev.length ? ev[ev.length - 1].t : null;
  const open = lastT !== null && todayT >= lastT ? Math.floor((todayT - lastT) / DAY) : null;
  return { v, y, n, segs, segOf, lim: v.map((x, i) => segOf(i)), segOk: g => g.ok, mr, sig, open };
}

// Special cause rules, shared by both charts. The two source tools differ in small ways,
// which are kept: how a repeated value affects a trend, and which points count for two of three.
function findSignals(m){
  const { segs, segOf } = m, isP = isCount(), isT = state.type === 't';
  const sig = m.sig || {}, v = sig.v || m.v, lim = sig.lim || m.lim, segMean = sig.mean || (g => g.mean);
  // The U and C charts follow the P chart's rules, as charts of counts from the same family
  const flags = v.map(() => ({ hi: false, lo: false, sides: {} }));
  const events = [];
  const mark = (i, side, rule) => { flags[i][side] = true; flags[i].sides[rule] = side; };
  for (const g of segs){
    const { s, e } = g, mean = segMean(g), ok = m.segOk(g);
    // The XmR chart only looks for signals once a segment has limits; the P chart looks for runs and trends before then
    if (!ok && !isP) continue;
    if (ok){
      for (let i = s; i < e; i++){
        if (v[i] > lim[i].ucl){ mark(i, 'hi', 'outside'); events.push({ rule: 'outside', side: 'hi', from: i, to: i }); }
        else if (v[i] < lim[i].lcl){ mark(i, 'lo', 'outside'); events.push({ rule: 'outside', side: 'lo', from: i, to: i }); }
      }
    }
    // Shift: points on the mean break a run
    const side = i => v[i] > mean ? 1 : v[i] < mean ? -1 : 0;
    let rs = s, rside = side(s);
    for (let i = s + 1; i <= e; i++){
      const sd = i < e ? side(i) : null;
      if (i < e && sd === rside && sd !== 0) continue;
      if (rside !== 0 && i - rs >= state.shiftLen){
        const sname = rside > 0 ? 'hi' : 'lo';
        for (let j = rs; j < i; j++) mark(j, sname, 'shift');
        events.push({ rule: 'shift', side: sname, from: rs, to: i - 1 });
      }
      rs = i; rside = sd;
    }
    if (isP){
      // Trend: a repeated value neither adds to nor breaks a run
      let ts = s, tdir = 0, steps = 0;
      const closeTrend = to => {
        if (tdir !== 0 && steps + 1 >= state.trendLen){
          const sname = tdir > 0 ? 'hi' : 'lo';
          for (let j = ts; j <= to; j++) mark(j, sname, 'trend');
          events.push({ rule: 'trend', side: sname, from: ts, to });
        }
      };
      for (let i = s + 1; i < e; i++){
        const d = Math.sign(v[i] - v[i - 1]);
        if (d === 0) continue;
        if (d === tdir){ steps++; continue; }
        closeTrend(i - 1);
        ts = i - 1; tdir = d; steps = 1;
      }
      closeTrend(e - 1);
    } else if (!isT || state.useTrend){
      // Trend: a repeated value ends a run
      let ts = s, tdir = 0;
      for (let i = s + 1; i <= e; i++){
        const d = i < e ? Math.sign(v[i] - v[i - 1]) : null;
        if (i < e && d !== 0 && d === tdir) continue;
        if (tdir !== 0 && (i - 1) - ts + 1 >= state.trendLen){
          const sname = tdir > 0 ? 'hi' : 'lo';
          for (let j = ts; j <= i - 1; j++) mark(j, sname, 'trend');
          events.push({ rule: 'trend', side: sname, from: ts, to: i - 1 });
        }
        if (i < e){ if (d !== 0){ ts = i - 1; tdir = d; } else { ts = i; tdir = 0; } }
      }
    }
    if (ok && state.twoThree && !isT){
      if (isP){
        // Two out of three points in a row beyond 2 standard deviations but inside the same limit
        const nearHi = j => v[j] > lim[j].up2 && v[j] < lim[j].ucl, nearLo = j => v[j] < lim[j].lo2 && v[j] > lim[j].lcl;
        for (let i = s; i + 2 < e; i++){
          const w = [i, i + 1, i + 2], hi = w.filter(nearHi), lo = w.filter(nearLo);
          if (hi.length >= 2){ hi.forEach(j => mark(j, 'hi', 'twothree')); events.push({ rule: 'twothree', side: 'hi', from: hi[0], to: hi[hi.length - 1] }); }
          if (lo.length >= 2){ lo.forEach(j => mark(j, 'lo', 'twothree')); events.push({ rule: 'twothree', side: 'lo', from: lo[0], to: lo[lo.length - 1] }); }
        }
      } else {
        // As in the Making Data Count Excel tool: all three points must be on the same side of the mean,
        // and only the points beyond 2 sigma are flagged.
        for (let i = s; i + 2 < e; i++){
          const w = [i, i + 1, i + 2];
          const hi = w.filter(j => v[j] > g.up2), lo = w.filter(j => v[j] < g.lo2);
          if (hi.length >= 2 && w.every(j => v[j] > mean)){ hi.forEach(j => mark(j, 'hi', 'twothree')); events.push({ rule: 'twothree', side: 'hi', from: hi[0], to: hi[hi.length - 1] }); }
          if (lo.length >= 2 && w.every(j => v[j] <= mean)){ lo.forEach(j => mark(j, 'lo', 'twothree')); events.push({ rule: 'twothree', side: 'lo', from: lo[0], to: lo[lo.length - 1] }); }
        }
      }
    }
  }
  // merge overlapping / adjacent events of the same kind; the T chart describes each gap on its own
  events.sort((a, b) => a.rule.localeCompare(b.rule) || a.side.localeCompare(b.side) || a.from - b.from);
  const merged = [];
  for (const ev of events){
    if (isT){ merged.push(ev); continue; }
    const q = merged[merged.length - 1];
    if (q && q.rule === ev.rule && q.side === ev.side && ev.from <= q.to + 1 && segOf(ev.from) === segOf(q.to)) q.to = Math.max(q.to, ev.to);
    else merged.push({ ...ev });
  }
  merged.sort((a, b) => a.from - b.from || a.rule.localeCompare(b.rule));

  const status = v.map((x, i) => {
    const f = flags[i];
    if (!f.hi && !f.lo) return 'common';
    // Conflicting signals: trend, then shift, then two of three, then a single point
    const sd = f.hi && f.lo ? f.sides[['trend', 'shift', 'twothree', 'outside'].find(r => f.sides[r])] : (f.hi ? 'hi' : 'lo');
    if (state.dir === 'none') return sd === 'hi' ? 'neither-hi' : 'neither-lo';
    return (state.dir === 'up') === (sd === 'hi') ? 'improve' : 'concern';
  });
  return { events: merged, status };
}

function compute(){
  const m = isCount() ? limitsCount() : state.type === 't' ? limitsT() : limitsXmr();
  Object.assign(m, findSignals(m));
  m.lastStatus = m.status[m.n - 1];
  // Assurance against the target, using the latest point's limits
  const L = m.lim[m.n - 1];
  m.assurance = null;
  if (state.target !== null && state.dir !== 'none' && m.segOk(m.segs[m.segs.length - 1])){
    const T = state.target;
    if (state.dir === 'up') m.assurance = L.lcl > T ? 'pass' : L.ucl < T ? 'fail' : 'hitmiss';
    else m.assurance = L.ucl < T ? 'pass' : L.lcl > T ? 'fail' : 'hitmiss';
  }
  m.allOk = m.segs.every(m.segOk);
  return m;
}

/* ---------- Formatting ---------- */
const isP = () => state.type === 'p', isT = () => state.type === 't', isU = () => state.type === 'u', isC = () => state.type === 'c';
// Charts of counts, with limits for each point
const isCount = () => isP() || isU() || isC();
const isLaney = () => state.laney && (isP() || isU());
const isPct = () => isP() && state.unit === 'pct';
function fmt(v, d){ if (v === null || v === undefined || !isFinite(v)) return '–'; return v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: d === undefined ? (isCount() || isT() ? 1 : Math.min(3, state.decimals + 1)) : d }); }
// A proportion as the chosen unit, with a fixed number of decimals
function fp(v, d){
  if (v === null || v === undefined || !isFinite(v)) return '–';
  if (isPct()) return (v * 100).toLocaleString('en-GB', { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }) + '%';
  return v.toLocaleString('en-GB', { minimumFractionDigits: d === undefined ? 3 : d, maximumFractionDigits: d === undefined ? 3 : d });
}
// A value as the chart shows it: a proportion for the P chart, a rate per 1,000 (or as set) for the U chart, the value itself otherwise
const fv = (v, d) => isP() ? fp(v, d) : isU() ? fmt(v * state.per, d === undefined ? 2 : d) : fmt(v, d);
const scale = () => isPct() ? 100 : isU() ? state.per : 1;
const toUnit = v => v * scale(), fromUnit = v => v / scale();
// Counts can't go below zero, and a proportion can't go above one
const clampV = v => Math.min(isP() ? 1 : Infinity, Math.max(0, v));
const rateName = () => `per ${fmt(state.per, 6)}${state.perUnit ? ' ' + state.perUnit : ''}`;
const countNoun = () => isP() ? 'the proportion' : isU() ? 'the rate' : 'the count';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function pointName(i){ const r = state.rows[i]; if (isT()) return 'the event on ' + r.label; return /^\d+$/.test(r.label) && Number(r.label) === i + 1 ? 'point ' + (i + 1) : r.label; }
function rangeName(a, b){ const n = i => isT() ? state.rows[i].label : pointName(i); return a === b ? n(a) : n(a) + ' to ' + n(b); }
const chartName = () => isP() ? (state.laney ? 'P′ chart' : 'P chart') : isU() ? (state.laney ? 'U′ chart' : 'U chart') : isC() ? 'C chart' : isT() ? 'T chart' : 'XmR chart';
const p2 = v => String(v).padStart(2, '0');
function dateLong(t, hasTime){ const d = new Date(t); let s = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; if (hasTime === undefined ? state.hasTime : hasTime) s += ` ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; return s; }
function dateAxis(t){
  const d = new Date(t), yy = p2(d.getUTCFullYear() % 100);
  if (state.dateFmt === 'my') return `${MON[d.getUTCMonth()]} ${yy}`;
  if (state.dateFmt === 'dmmy') return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${yy}`;
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${yy}`;
}
const iso = t => { const d = new Date(t); let s = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; if (state.hasTime) s += ` ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; return s; };
const days = v => `${fmt(v)} day${v === 1 ? '' : 's'}`;
function fullTitle(){ const t = state.title || chartName(); return state.team ? `${t} – ${state.team}` : t; }

function niceTicks(min, max, count){
  const span = max - min || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), nrm = raw / mag;
  const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
  const ticks = []; for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return { ticks, step };
}

/* ---------- Palettes ---------- */
const LIGHT = { bg: '#FFFFFF', ink: '#17222D', muted: '#5A6875', grid: '#EDF0F3', rule: '#DCE2E7', common: '#8A96A3', improve: '#1A7FD4', concern: '#D97500', neither: '#7A4BB0', target: '#2F7A47', note: '#2F7A47', line: '#3B4956', limit: '#6B7885', accent: '#005EB8' };
function livePalette(){
  const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue('--' + k).trim();
  return { bg: 'transparent', ink: g('ink'), muted: g('muted'), grid: g('grid'), rule: g('rule'), common: g('common'), improve: g('improve'), concern: g('concern'), neither: g('neither'), target: g('target'), note: g('note'), line: g('line'), limit: g('limit'), accent: g('accent') };
}
const statusColor = (st, p) => st === 'improve' ? p.improve : st === 'concern' ? p.concern : st === 'common' ? p.common : p.neither;
const FONT = "Public Sans, Segoe UI, system-ui, Arial, sans-serif";

/* ---------- Chart rendering ---------- */
function noteIndex(){ const out = []; if (!state.showNotes) return out; state.rows.forEach((r, i) => { if (r.note) out.push(i); }); return out; }
// Labels for the latest limits, at the right of the chart: [text, value, colour]
function rightLabels(m, kind){
  const L = m.lim[m.n - 1], g = m.segs[m.segs.length - 1], t = [];
  if (kind === 'mr'){ if (g.ok) t.push(['Upper ' + fmt(g.mrUcl), g.mrUcl], ['Mean ' + fmt(g.mrBar), g.mrBar]); return t; }
  if (isCount()){
    if (m.ok) t.push(['Upper ' + fv(L.ucl), L.ucl]);
    t.push(['Mean ' + fv(L.mean), L.mean]);
    if (m.ok && L.lcl > 0) t.push(['Lower ' + fv(L.lcl), L.lcl]);
  } else if (g.ok){ t.push(['Upper ' + fmt(g.ucl), g.ucl], ['Mean ' + fmt(g.mean), g.mean]); if (g.lcl !== null) t.push(['Lower ' + fmt(g.lcl), g.lcl]); }
  if (state.target !== null) t.push(['Target ' + fv(state.target), state.target, 'target']);
  return t;
}
// Shared by the XmR and moving range charts so their points line up
function rightMargin(m){
  const t = rightLabels(m, 'x').concat(isCount() || isT() ? [] : rightLabels(m, 'mr'));
  return Math.max(74, 12 + Math.ceil(Math.max(0, ...t.map(x => x[0].length)) * 6.6));
}
function yRange(m, kind){
  if (kind === 'mr'){
    const ys = m.mr.filter(v => v !== null);
    m.segs.forEach(g => { if (g.ok) ys.push(g.mrUcl, 0); });
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    return { lo: Math.max(lo - pad, 0), hi: hi + pad };
  }
  if (isT()){
    const ys = m.v.slice();
    m.segs.forEach(g => { if (g.ok){ ys.push(g.ucl, g.mean); if (g.lcl !== null) ys.push(g.lcl); } });
    let lo = 0, hi = Math.max(...ys);
    hi += (hi - lo) * 0.08 || 1;
    if (state.yMin !== null) lo = state.yMin;
    if (state.yMax !== null && state.yMax > lo) hi = state.yMax;
    if (hi <= lo) hi = lo + 1;
    return { lo, hi };
  }
  if (!isCount()){
    const ys = m.v.slice();
    m.segs.forEach(g => { if (g.ok) ys.push(g.ucl, g.lcl); });
    if (state.target !== null) ys.push(state.target);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    if (state.floor && Math.min(...m.v) >= 0) lo = Math.max(lo, 0);
    return { lo, hi };
  }
  const ys = m.v.slice();
  m.lim.forEach(L => { ys.push(L.mean); if (m.ok){ ys.push(clampV(L.ucl), clampV(L.lcl)); } });
  if (state.target !== null) ys.push(state.target);
  let mn = Math.min(...ys), mx = Math.max(...ys);
  const pad = (mx - mn) * 0.08 || (isP() ? 0.02 : Math.max(mx * 0.1, 1e-9) || 1);
  let lo = Math.max(0, mn - pad), hi = Math.min(isP() ? 1 : Infinity, mx + pad);
  if (lo < (hi - lo) * 0.25) lo = 0;
  if (state.yMin !== null) lo = fromUnit(state.yMin);
  if (state.yMax !== null && fromUnit(state.yMax) > lo) hi = fromUnit(state.yMax);
  if (hi <= lo) hi = lo + 0.01;
  return { lo, hi };
}

function renderChart(kind, W, H, p, interactive, oy){
  oy = oy || 0;
  const m = model, n = m.n, vals = kind === 'mr' ? m.mr : m.v;
  const notes = kind === 'x' ? noteIndex() : [];
  const labels = state.rows.map(r => isT() ? dateAxis(r.t) : r.label), longLabels = labels.some(l => l.length > 6);
  const M = isCount() ? { l: 62, r: rightMargin(m), t: notes.length ? 30 : 14, b: 72 }
    : isT() ? { l: 58, r: rightMargin(m), t: notes.length ? 30 : 14, b: 64 }
    : { l: 58, r: rightMargin(m), t: notes.length ? 30 : 14, b: kind === 'x' ? (longLabels ? 64 : 34) : 30 };
  const clipped = isCount() || isT();
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const { lo, hi } = yRange(m, kind);
  const unit = kind === 'x' && isCount();
  const { ticks, step } = niceTicks(unit ? toUnit(lo) : lo, unit ? toUnit(hi) : hi, Math.max(3, Math.round(ph / 55)));
  const tdp = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));
  const X = i => n === 1 ? M.l + pw / 2 : M.l + (i / (n - 1)) * pw;
  const Y = v => oy + M.t + (1 - (v - lo) / (hi - lo)) * ph;
  const half = n > 1 ? pw / (n - 1) / 2 : 20;
  const clip = 'pclip' + kind + oy + (interactive ? 'i' : '');
  let s = clipped ? `<defs><clipPath id="${clip}"><rect x="${M.l - 8}" y="${oy + M.t - 6}" width="${pw + 16}" height="${ph + 12}"/></clipPath></defs>` : '';
  ticks.forEach(t => {
    if (isT() && t < lo - 1e-9) return;
    const yv = Y(unit ? fromUnit(t) : t).toFixed(1);
    s += `<line x1="${M.l}" x2="${M.l + pw}" y1="${yv}" y2="${yv}" stroke="${p.grid}" stroke-width="1"/>`;
    s += `<text x="${M.l - 8}" y="${yv}" dy="0.32em" text-anchor="end" font-size="12" fill="${p.muted}">${fmt(t, tdp)}${unit && isPct() ? '%' : ''}</text>`;
  });
  s += `<line x1="${M.l}" x2="${M.l + pw}" y1="${(oy + M.t + ph).toFixed(1)}" y2="${(oy + M.t + ph).toFixed(1)}" stroke="${p.rule}"/>`;
  const yl = kind === 'mr' ? 'Moving range' : isP() ? (isPct() ? 'Percentage' : 'Proportion') : isU() ? 'Rate ' + rateName() : isC() ? state.yLabel || 'Count' : isT() ? 'Days since previous event' : state.yLabel;
  if (yl) s += `<text transform="translate(14 ${oy + M.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="${p.muted}">${esc(trunc(yl, 40))}</text>`;
  // x labels
  if (isCount() || isT()){
    const every = Math.ceil(n / Math.max(2, Math.floor(pw / 24)));
    for (let i = 0; i < n; i += every){
      const xv = X(i).toFixed(1), yv = oy + M.t + ph + 14;
      s += `<text transform="translate(${xv} ${yv}) rotate(-45)" text-anchor="end" font-size="11" fill="${p.muted}">${esc(isT() ? labels[i] : trunc(labels[i], 16))}</text>`;
    }
  } else if (kind === 'x'){
    const every = Math.ceil(n / Math.max(2, Math.floor(pw / (longLabels ? 34 : 56))));
    for (let i = 0; i < n; i += every){
      const xv = X(i).toFixed(1), yv = oy + M.t + ph + 16;
      if (longLabels) s += `<text transform="translate(${xv} ${yv}) rotate(-40)" text-anchor="end" font-size="11.5" fill="${p.muted}">${esc(trunc(labels[i], 12))}</text>`;
      else s += `<text x="${xv}" y="${yv}" text-anchor="middle" font-size="11.5" fill="${p.muted}">${esc(labels[i])}</text>`;
    }
  }
  // breaks
  m.segs.slice(1).forEach(g => {
    const bx = (X(g.s) - half).toFixed(1);
    s += `<line x1="${bx}" x2="${bx}" y1="${oy + M.t}" y2="${oy + M.t + ph}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>`;
  });
  notes.forEach((i, k) => {
    const xv = X(i).toFixed(1), top = oy + 12;
    s += `<line x1="${xv}" x2="${xv}" y1="${top + 7}" y2="${Y(Math.min(Math.max(vals[i], lo), hi)).toFixed(1)}" stroke="${p.note}" stroke-width="1" stroke-dasharray="1 3"/>`;
    s += `<circle cx="${xv}" cy="${top}" r="8" fill="${p.note}"/><text x="${xv}" y="${top}" dy="0.34em" text-anchor="middle" font-size="10" font-weight="700" fill="#FFFFFF">${k + 1}</text>`;
  });
  // limits
  let lines = '';
  if (isCount()){
    // Limits step with each point's total; a limit below zero (or a proportion's above 100%) isn't drawn
    const span = (g, i) => {
      if (g.e - g.s === 1) return [X(i) - half * 0.8, X(i) + half * 0.8];
      return [i === g.s ? X(i) : X(i) - half, i === g.e - 1 ? X(i) : X(i) + half];
    };
    const stepPath = (g, key) => {
      let d = '', prev = false;
      for (let i = g.s; i < g.e; i++){
        const v = m.lim[i][key];
        if (v <= 0 || (isP() && v >= 1)){ prev = false; continue; }
        const [x1, x2] = span(g, i), yv = Y(v).toFixed(1);
        d += `${prev ? 'L' : 'M'}${x1.toFixed(1)} ${yv}L${x2.toFixed(1)} ${yv}`;
        prev = true;
      }
      return d ? `<path d="${d}" fill="none" stroke="${p.limit}" stroke-width="1.5" stroke-dasharray="6 4"/>` : '';
    };
    m.segs.forEach(g => {
      const [x1] = span(g, g.s), [, x2] = span(g, g.e - 1), yv = Y(g.mean).toFixed(1);
      lines += `<line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${yv}" y2="${yv}" stroke="${p.limit}" stroke-width="1.5"/>`;
      if (m.ok) lines += stepPath(g, 'ucl') + stepPath(g, 'lcl');
    });
  } else {
    const segLine = (g, v, dash) => {
      const x1 = g.e - g.s === 1 ? X(g.s) - half * 0.8 : X(g.s), x2 = g.e - g.s === 1 ? X(g.s) + half * 0.8 : X(g.e - 1);
      return `<line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${p.limit}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    };
    m.segs.forEach(g => {
      if (kind === 'x'){
        lines += segLine(g, g.mean, '');
        if (g.ok) lines += segLine(g, g.ucl, '6 4') + (g.lcl !== null ? segLine(g, g.lcl, '6 4') : '');
      } else if (g.ok) lines += segLine(g, g.mrBar, '') + segLine(g, g.mrUcl, '6 4');
    });
  }
  if (kind === 'x' && state.target !== null){
    const yv = Y(state.target).toFixed(1);
    lines += `<line x1="${M.l}" x2="${M.l + pw}" y1="${yv}" y2="${yv}" stroke="${p.target}" stroke-width="1.5" stroke-dasharray="9 3 2 3"/>`;
  }
  s += clipped ? `<g clip-path="url(#${clip})">${lines}` : lines;
  // data line (the moving range line breaks where limits are recalculated)
  let path = '';
  vals.forEach((v, i) => { if (v === null) return; const cmd = (i === 0 || vals[i - 1] === null || (kind === 'mr' && m.segOf(i).s === i)) ? 'M' : 'L'; path += `${cmd}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; });
  s += `<path d="${path}" fill="none" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => {
    if (v === null) return;
    let col = p.common, r = 3.4;
    if (kind === 'x'){ const st = m.status[i]; col = statusColor(st, p); if (st !== 'common') r = 4.6; }
    else { const g = m.segOf(i); if (g.ok && v > g.mrUcl){ col = p.neither; r = 4.6; } }
    s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${r}" fill="${col}" stroke="${p.bg === 'transparent' ? 'var(--surface)' : p.bg}" stroke-width="1.2"/>`;
    if (interactive && kind === 'x') s += `<circle class="hit" data-i="${i}" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="10" fill="transparent" style="cursor:${i > 0 ? 'pointer' : 'default'}"/>`;
  });
  if (clipped) s += `</g>`;
  const placed = rightLabels(m, kind).filter(([, v]) => v >= lo && v <= hi).map(([t, v, k]) => ({ t, y: Y(v), k })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < 13) placed[i].y = placed[i - 1].y + 13;
  placed.forEach(l => { s += `<text x="${M.l + pw + 6}" y="${l.y.toFixed(1)}" dy="0.32em" font-size="11.5" fill="${l.k === 'target' ? p.target : p.muted}">${esc(l.t)}</text>`; });
  return s;
}
function hiddenCount(){
  if (isT()){ let c = 0; model.v.forEach(v => { if ((state.yMax !== null && v > state.yMax) || (state.yMin !== null && v < state.yMin)) c++; }); return c; }
  if (!isCount()) return 0;
  const { lo, hi } = yRange(model, 'x');
  return model.v.filter(v => v < lo - 1e-12 || v > hi + 1e-12).length;
}

function chartSVG(kind, W, H, interactive){
  return `<svg viewBox="0 0 ${W} ${H}" font-family='${FONT}' role="img" aria-label="${esc(kind === 'x' ? ariaSummary() : 'Moving range chart')}">${renderChart(kind, W, H, livePalette(), interactive)}</svg>`;
}

function exportSVG(){
  const W = 1200, p = LIGHT, top = 64, xH = isCount() || isT() ? 460 : 440;
  const mH = state.type === 'xmr' && state.showMR ? 220 : 0, notes = noteIndex();
  const noteH = notes.length ? 26 + notes.length * 18 : 0, foot = 40;
  const H = top + xH + (mH ? mH + 24 : 0) + noteH + foot;
  const a = assuranceText();
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`;
  s += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  s += `<text x="24" y="34" font-size="22" font-weight="700" fill="${p.ink}">${esc(fullTitle())}</text>`;
  s += `<text x="24" y="54" font-size="13" fill="${p.muted}">${esc(variationText().short + (a ? '. ' + a.short : ''))}</text>`;
  s += renderChart('x', W, xH, p, false, top);
  let yy = top + xH;
  if (mH){
    s += `<text x="24" y="${yy + 16}" font-size="14" font-weight="600" fill="${p.ink}">Moving range</text>`;
    s += renderChart('mr', W, mH, p, false, yy + 24);
    yy += mH + 24;
  }
  yy += 18;
  notes.forEach((i, k) => {
    s += `<circle cx="32" cy="${yy}" r="8" fill="${p.note}"/><text x="32" y="${yy}" dy="0.34em" text-anchor="middle" font-size="10" font-weight="700" fill="#FFFFFF">${k + 1}</text>`;
    s += `<text x="48" y="${yy}" dy="0.34em" font-size="12.5" fill="${p.ink}">${esc(state.rows[i].label + ': ' + state.rows[i].note)}</text>`;
    yy += 18;
  });
  const how = isCount() ? `${chartName()}: limits are the mean ± 3 standard deviations${isP() ? " for each point's total" : isU() ? " for each point's exposure" : ''}. Blue: improvement, orange: concern, purple: special cause with no set direction.`
    : isT() ? 'T chart: days between events, with limits from the gaps transformed to the power 1/3.6. Blue: improvement, orange: concern.'
    : 'XmR chart: limits are the mean ± 2.66 × the average moving range. Blue: improvement, orange: concern, purple: special cause with no set direction.';
  s += `<text x="24" y="${H - 16}" font-size="11.5" fill="${p.muted}">${how}</text>`;
  return { svg: s + '</svg>', W, H };
}

/* ---------- Plain-language reading ---------- */
const RULE_TEXT = {
  outside: (ev, n) => ev.from === ev.to ? `${cap(pointName(ev.from))} is ${ev.side === 'hi' ? 'above the upper' : 'below the lower'} limit.` : `${n} points (${rangeName(ev.from, ev.to)}) are ${ev.side === 'hi' ? 'above the upper' : 'below the lower'} limit.`,
  shift: (ev, n) => `${n} points in a row ${ev.side === 'hi' ? 'above' : 'below'} the mean (${rangeName(ev.from, ev.to)}).`,
  trend: (ev, n) => `${n} points in a row going ${ev.side === 'hi' ? 'up' : 'down'} (${rangeName(ev.from, ev.to)}).`,
  twothree: ev => `Two out of three points close to the ${ev.side === 'hi' ? 'upper' : 'lower'} limit (${rangeName(ev.from, ev.to)}).`
};
const less = 'events have become less frequent', more = 'events have become more frequent';
const T_RULE_TEXT = {
  outside: ev => ev.side === 'hi' ? `The gap before ${pointName(ev.from)} is above the upper limit: a longer than usual gap between events.` : `The gap before ${pointName(ev.from)} is below the lower limit: events closer together than expected.`,
  shift: (ev, n) => `${n} gaps in a row ${ev.side === 'hi' ? 'above' : 'below'} the mean (${rangeName(ev.from, ev.to)}), so ${ev.side === 'hi' ? less : more}.`,
  trend: (ev, n) => `${n} gaps in a row getting ${ev.side === 'hi' ? 'longer' : 'shorter'} (${rangeName(ev.from, ev.to)}).`
};
const ruleText = ev => (isT() ? T_RULE_TEXT : RULE_TEXT)[ev.rule](ev, ev.to - ev.from + 1);
function eventStatus(ev){ if (state.dir === 'none') return 'neither'; return (state.dir === 'up') === (ev.side === 'hi') ? 'improve' : 'concern'; }

function variationText(){
  const st = model.lastStatus, L = model.lim[model.n - 1];
  if (isT()){
    if (!L.ok) return { title: 'Not enough data', short: 'Not enough events to calculate limits', long: 'Add more events to calculate process limits.' };
    const range = L.lcl !== null ? `between ${days(L.lcl)} and ${days(L.ucl)}` : `of up to ${days(L.ucl)}`;
    if (st === 'common') return { title: 'Common cause variation', short: 'Common cause variation', long: `The most recent gap shows common cause variation. Events are happening at a steady rate: unless something changes, expect gaps ${range} between events, typically around ${days(L.mean)}.` };
    const longer = (st === 'improve') === (state.dir === 'up');
    if (st === 'improve') return { title: 'Special cause: improvement', short: `Special cause variation, improving (${longer ? less : more})`, long: `The most recent gap is part of a special cause signal in the direction of improvement: ${longer ? less : more}. Something has changed. Understanding what it was will help you sustain it.` };
    return { title: 'Special cause: concern', short: `Special cause variation, of concern (${longer ? less : more})`, long: `The most recent gap is part of a special cause signal in the wrong direction: ${longer ? less : more}. Something has changed and is worth investigating.` };
  }
  if (st === 'common'){
    if (isCount()){
      if (!model.ok) return { title: 'Not enough data for limits', short: `Fewer than ${MIN_COUNT_LIMITS} points, so no process limits yet`, long: `With fewer than ${MIN_COUNT_LIMITS} points the chart shows the mean but no process limits. So far ${countNoun()} is averaging ${fv(L.mean)}${isU() ? ' ' + rateName() : ''}. Add more periods to see the limits.` };
      const range = L.lcl > 0 ? `between ${fv(L.lcl)} and ${fv(clampV(L.ucl))}` : `of up to ${fv(clampV(L.ucl))}`;
      const like = isP() ? ` for a period with a total of ${fmt(state.rows[model.n - 1].den, 2)}, like the latest` : isU() ? ` ${rateName()} for a period with an exposure of ${fmt(state.rows[model.n - 1].den, 2)}, like the latest` : ' each period';
      return { title: 'Common cause variation', short: 'Common cause variation', long: `The most recent point shows common cause variation. The process looks stable: unless something changes, expect it to average about ${fv(L.mean)}, with values ${range}${like}.` };
    }
    if (!L.ok) return { title: 'Not enough data', short: 'Not enough points to calculate limits', long: 'Add more points to calculate process limits.' };
    return { title: 'Common cause variation', short: 'Common cause variation', long: `The most recent point shows common cause variation. The process looks stable: unless something changes, expect values between ${fmt(L.lcl)} and ${fmt(L.ucl)}, averaging ${fmt(L.mean)}.` };
  }
  if (st === 'improve') return { title: 'Special cause: improvement', short: 'Special cause variation, improving', long: 'The most recent point is part of a special cause signal in the direction of improvement. Something has changed. Understanding what it was will help you sustain it.' };
  if (st === 'concern') return { title: 'Special cause: concern', short: 'Special cause variation, of concern', long: 'The most recent point is part of a special cause signal in the wrong direction. Something has changed and is worth investigating.' };
  const hi = st === 'neither-hi';
  return { title: `Special cause: ${hi ? 'higher' : 'lower'}`, short: `Special cause variation, ${hi ? 'higher' : 'lower'} than expected`, long: `The most recent point is part of a special cause signal: ${isCount() ? countNoun() + ' is' : 'values are'} ${hi ? 'higher' : 'lower'} than the process would usually produce. Something has changed.` };
}
function assuranceText(){
  const a = model.assurance, T = fv(state.target) + (isU() ? ' ' + rateName() : '');
  if (!a) return null;
  const caution = model.lastStatus !== 'common' ? ' The latest data shows a special cause signal, so treat this as provisional until the process settles.' : '';
  if (isP()){
    // Name the limit the target is compared with, rather than a "favourable" or "unfavourable" side
    const L = model.lim[model.n - 1], up = state.dir === 'up';
    const lower = `the lower limit of ${fv(clampV(L.lcl))}`, upper = `the upper limit of ${fv(clampV(L.ucl))}`;
    if (a === 'pass') return { title: 'Consistently meets target', short: `Consistently meets the target of ${T}`, long: `The target of ${T} is ${up ? 'below ' + lower : 'above ' + upper}, so even a poor period is likely to meet it. The process should meet the target consistently if nothing changes.` + caution };
    if (a === 'fail') return { title: 'Will not meet target', short: `Will not meet the target of ${T} without change`, long: `The target of ${T} is ${up ? 'above ' + upper : 'below ' + lower}, so even a good period is unlikely to reach it. The process won't meet the target without a change to the system.` + caution };
    return { title: 'Hit and miss', short: `Will sometimes meet the target of ${T}`, long: `The target of ${T} is between ${lower} and ${upper}, so the process will meet it some of the time and miss it some of the time, by chance alone.` + caution };
  }
  if (a === 'pass') return { title: 'Consistently meets target', short: `Consistently meets the target of ${T}`, long: `The target of ${T} sits outside the latest limits on the favourable side, so the process should meet it consistently if nothing changes.` + caution };
  if (a === 'fail') return { title: 'Will not meet target', short: `Will not meet the target of ${T} without change`, long: `The target of ${T} sits outside the latest limits on the unfavourable side, so the process won't meet it without a change to the system.` + caution };
  return { title: 'Hit and miss', short: `Will sometimes meet the target of ${T}`, long: `The target of ${T} falls within the latest limits, so the process will meet it some of the time and miss it some of the time, by chance alone.` + caution };
}
// T chart: how long it has been since the latest event, against the upper limit
function openText(){
  if (!isT()) return null;
  const g = model.segs[model.segs.length - 1], o = model.open;
  if (o === null || !g.ok) return null;
  if (o > g.ucl) return { cls: state.dir === 'up' ? 'alert' : 'alert bad', text: `It has been ${days(o)} since the latest event, longer than the upper limit of ${days(g.ucl)}. If no event happens before you next update the chart, this gap will be a signal that ${less}.` };
  return { cls: '', text: `It has been ${days(o)} since the latest event. Gaps of up to ${days(g.ucl)} are within the usual range.` };
}
function ariaSummary(){
  const v = variationText(), a = assuranceText();
  if (isT()) return `T chart of ${model.n} gaps between ${model.n + 1} events. ${v.short}.`;
  return `${chartName()} of ${model.n} points. ${v.short}.${a ? ' ' + a.short + '.' : ''}`;
}

function readingNotes(){
  const m = model, nts = [];
  if (isCount()){
    const L1 = isU() ? 'U' : 'P';
    if (!m.ok) nts.push(`Process limits appear once there are ${MIN_COUNT_LIMITS} points. Until then, only runs above or below the mean and trends are checked.`);
    if (isLaney() && isFinite(m.sigmaZ)) nts.push(`${L1}′ chart: the limits are ${fmt(m.sigmaZ, 2)} times as wide as a ${L1} chart's (the spread of the z-scores from their average moving range).`);
    if (!isC() && !state.laney && m.ok && m.sigmaZ > 1.5 && Math.min(...state.rows.map(r => r.den)) >= 200) nts.push(`The points vary about ${fmt(m.sigmaZ, 1)} times as much as a ${L1} chart expects, and the ${isU() ? 'exposures' : 'totals'} are large. If the limits look too narrow, try the ${L1}′ chart.`);
    if (isC() && m.ok && m.sigmaZ > 1.5) nts.push(`The counts vary about ${fmt(m.sigmaZ, 1)} times as much as a C chart expects. If the opportunity for events changes from period to period, a U chart, with the exposure for each period, may suit better.`);
    if (m.ok && m.lim.some(L => L.lcl <= 0)) nts.push(`Where the lower limit would be below ${isPct() ? '0%' : '0'}, it isn't drawn.`);
  } else if (isT()){
    if (m.n < 15) nts.push(`With fewer than 15 gaps, treat the limits as provisional and recalculate them as more events happen.`);
    m.segs.forEach(g => {
      const where = m.segs.length > 1 ? ` in the period from ${state.rows[g.s].label}` : '';
      if (!g.ok) nts.push(`There aren't enough events${where} to calculate limits.`);
      else if (g.lcl === null) nts.push(`There is no lower limit${where}, because events are too spread out for a gap to be unusually short.`);
      if (g.fixed) nts.push(`Limits${where} are fixed from its first ${g.be - g.s} gaps.`);
    });
  } else {
    if (m.n < 15) nts.push(`With fewer than 15 points, treat the limits as provisional and recalculate as more data arrives.`);
    m.segs.forEach(g => {
      const where = m.segs.length > 1 ? ` in the period from ${pointName(g.s)}` : '';
      if (!g.ok) nts.push(`There aren't enough points${where} to calculate limits.`);
      if (g.screened) nts.push(`${g.screened} unusually large moving range${g.screened > 1 ? 's were' : ' was'} left out when calculating limits${where}.`);
      if (g.fixed) nts.push(`Limits${where} are fixed from its first ${g.be - g.s} points.`);
    });
  }
  if (m.segs.length > 1) nts.push(`Limits are recalculated ${m.segs.length === 2 ? 'once' : (m.segs.length - 1) + ' times'}. Only do this where there's a known change to the process and a sustained signal.`);
  if (isT()){
    if (state.unsorted) nts.push(`The dates weren't in order, so they have been sorted from oldest to newest.`);
    if (state.order === 'mdy') nts.push(`Dates were read as month/day/year, because some only make sense that way.`);
    if (state.events[0].note && state.showNotes) nts.push(`The note on the first event isn't shown on the chart, because the first event has no gap before it.`);
  }
  const hidden = hiddenCount();
  if (hidden) nts.push(`${hidden} point${hidden > 1 ? 's are' : ' is'} outside the axis range you set.`);
  if (state.invalid.length) nts.push(`Left out ${state.invalid.slice(0, 6).map(x => `line ${x.line} (${x.why})`).join(', ')}${state.invalid.length > 6 ? '…' : ''}.`);
  if (state.skipped.length){
    const what = isP() ? 'a count and a total couldn’t be read' : isU() ? 'a count and an exposure couldn’t be read' : isC() ? 'no count could be read' : isT() ? 'no date could be read' : 'the value wasn’t a number';
    const lines = typeof state.skipped[0] === 'string' ? '' : 'line' + (state.skipped.length > 1 ? 's ' : ' ');
    nts.push(`Skipped ${lines}${state.skipped.slice(0, 8).join(', ')}${state.skipped.length > 8 ? '…' : ''} because ${what}.`);
  }
  return nts;
}

/* ---------- Badges (own simple glyphs) ---------- */
function varBadge(p){
  const st = model.lastStatus, col = statusColor(st, p);
  let glyph;
  if (st === 'common') glyph = `<path d="M11 22c3-5 5-5 7 0s4 5 7 0 4-5 7 0" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>`;
  else { const up = st === 'neither-hi' || (st === 'improve' && state.dir === 'up') || (st === 'concern' && state.dir === 'down'); glyph = up ? `<path d="M13 26l9-9 9 9" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="M13 18l9 9 9-9" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`; }
  return `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="${col}" stroke-width="2.4"/>${glyph}</svg>`;
}
function assBadge(p){
  const a = model.assurance, col = a === 'pass' ? p.improve : a === 'fail' ? p.concern : p.common;
  const glyph = a === 'pass' ? `<path d="M13 22.5l6 6 12-13" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : a === 'fail' ? `<path d="M15 15l14 14M29 15 15 29" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>` : `<path d="M11 22h22" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="4 4"/>`;
  return `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="${col}" stroke-width="2.4"/>${glyph}</svg>`;
}

/* ---------- Render page ---------- */
const out = $('#output');
function renderAll(){
  try { renderAllInner(); }
  catch (err){
    console.error(err);
    out.innerHTML = `<div class="empty"><p style="margin:0">Something went wrong drawing this chart. Please check your data, and use “Give feedback” to report it if it keeps happening.</p></div>`;
  }
}
function renderAllInner(){
  $('#chartTitle').textContent = state.title || 'Your ' + chartName();
  $('#chartSub').textContent = isT() ? (state.team ? `${state.team} · days between rare events` : 'Days between rare events')
    : (state.team ? state.team + ' · ' : '') + (isP() ? (isPct() ? 'Percentage' : 'Proportion') + ' over time' : isU() ? `Rate ${rateName()}, over time` : isC() ? 'Count over time' : 'XmR chart (individuals and moving range)');
  renderChips();
  if (state.rows.length < 2){
    model = null;
    const ex = isP() ? 'Month\tSeen in 4 hours\tAttended\nApr 2024\t412\t530\nMay 2024\t398\t511\nJun 2024\t431\t547'
      : isU() ? 'Month\tFalls\tBed days\nApr 2024\t12\t3850\nMay 2024\t9\t3920\nJun 2024\t14\t3710'
      : isC() ? 'Month\tComplaints\nApr 2024\t7\nMay 2024\t4\nJun 2024\t9' : isT() ? 'Event date\n03/01/2024\n29/01/2024\n14/02/2024' : 'Month\tDays\nApr 2024\t42\nMay 2024\t39\nJun 2024\t45';
    const ask = isP() ? 'Paste at least two periods on the left, each with a count and a total, to draw a chart.'
      : isU() ? 'Paste at least two periods on the left, each with a count and an exposure, to draw a chart.'
      : isC() ? 'Paste at least two periods on the left, each with a count, to draw a chart.' : isT() ? 'Paste the dates of at least three events on the left to draw a chart.' : 'Paste at least two values on the left to draw a chart.';
    out.innerHTML = `<div class="empty"><p style="margin:0">${ask}</p><pre>${ex}</pre><p style="margin:12px 0 0"><button type="button" class="link" id="exampleBtn2">Or try the example data</button></p></div>`;
    $('#exampleBtn2').onclick = loadExample;
    return;
  }
  model = compute();
  trackChart({ points: model.n, chartType: state.type });
  const p = livePalette(), v = variationText(), a = assuranceText(), L = model.lim[model.n - 1], o = openText();
  const latest = isT() ? `Latest gap, before the event on ${state.rows[model.n - 1].label}` : `Latest point, ${pointName(model.n - 1)}`;
  let h = `<div class="badges"><div class="badge">${varBadge(p)}<div><strong>${esc(v.title)}</strong><small>${esc(latest)}</small></div></div>`;
  if (a) h += `<div class="badge">${assBadge(p)}<div><strong>${esc(a.title)}</strong><small>Against a target of ${fv(state.target)}</small></div></div>`;
  h += `</div>`;
  if (isCount()){
    const totN = sum(state.rows.map(r => r.num)), totD = sum(state.rows.map(r => r.den));
    h += `<div class="stats">`;
    h += `<div class="stat"><b>${model.n}</b><span>Points, ${esc(state.rows[0].label)} to ${esc(state.rows[model.n - 1].label)}</span></div>`;
    if (isC()) h += `<div class="stat"><b>${fmt(totN, 2)}</b><span>Total count</span></div>`;
    else h += `<div class="stat"><b>${fmt(totN, 2)} / ${fmt(totD, 2)}</b><span>${isU() ? 'Total count over total exposure' : 'Total count out of total'}</span></div>`;
    h += `<div class="stat"><b>${fv(L.mean)}</b><span>Mean${isU() ? ' ' + esc(rateName()) : ''}${model.segs.length > 1 ? ' (latest limits)' : ''}</span></div>`;
    h += `<div class="stat"><b>${model.ok ? (L.lcl > 0 ? fv(L.lcl) + ' – ' : '') + fv(clampV(L.ucl)) : '–'}</b><span>${model.ok && L.lcl > 0 ? 'Lower and upper' : 'Upper'} limit for the latest point</span></div>`;
    h += `</div>`;
  }
  if (isT()){
    const ev = state.events, g = L;
    h += `<div class="stats">`;
    h += `<div class="stat"><b>${ev.length}</b><span>Events, ${esc(dateLong(ev[0].t))} to ${esc(dateLong(ev[ev.length - 1].t))}</span></div>`;
    h += `<div class="stat"><b>${g.ok ? fmt(g.mean) : '–'}</b><span>Mean days between events${model.segs.length > 1 ? ' (latest limits)' : ''}</span></div>`;
    h += `<div class="stat"><b>${g.ok ? (g.lcl !== null ? fmt(g.lcl) + ' – ' : '') + fmt(g.ucl) : '–'}</b><span>${g.ok && g.lcl !== null ? 'Lower and upper' : 'Upper'} process limit, days</span></div>`;
    if (model.open !== null) h += `<div class="stat ${o ? o.cls : ''}"><b>${fmt(model.open, 0)}</b><span>Days since the latest event</span></div>`;
    h += `</div>`;
  }
  h += `<div class="chart-box" id="xBox"></div>`;
  h += `<div class="legend"><span><i class="dot" style="background:var(--common)"></i>Common cause</span>`;
  if (state.dir === 'none') h += `<span><i class="dot" style="background:var(--neither)"></i>Special cause</span>`;
  else h += `<span><i class="dot" style="background:var(--improve)"></i>Special cause: improvement</span><span><i class="dot" style="background:var(--concern)"></i>Special cause: concern</span>`;
  h += `<span><i class="solid"></i>Mean</span>${model.segs.some(model.segOk) ? '<span><i class="dash"></i>Process limits</span>' : ''}${state.target !== null ? '<span><i class="tdash"></i>Target</span>' : ''}</div>`;
  const notes = noteIndex();
  if (notes.length) h += `<ul class="notelist">${notes.map((i, k) => `<li><span class="flag">${k + 1}</span><span>${esc(state.rows[i].label)}: ${esc(state.rows[i].note)}</span></li>`).join('')}</ul>`;
  if (state.type === 'xmr' && state.showMR) h += `<h3 class="mr-head">Moving range</h3><div class="chart-box" id="mrBox"></div>`;

  h += `<div class="reading"><h3>What the chart shows</h3><p>${esc(v.long)}</p>`;
  if (a) h += `<p>${esc(a.long)}</p>`;
  if (o) h += `<p>${esc(o.text)}</p>`;
  if (model.events.length){
    h += `<p style="margin-top:14px"><strong>Signals found</strong></p><ul class="signals">`;
    model.events.forEach(ev => { h += `<li><i class="dot" style="background:${statusColor(eventStatus(ev), p)}"></i><span>${esc(cap(ruleText(ev)))}</span></li>`; });
    h += `</ul>`;
  } else if (model.allOk) h += `<p>No special cause signals were found.</p>`;
  const nts = readingNotes();
  if (nts.length) h += `<div class="notes">${nts.map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  h += `</div>`;
  h += tableHTML();
  out.innerHTML = h;
  drawCharts();
  wireOutput();
}

function statusName(st){ return st === 'common' ? 'Common cause' : st === 'improve' ? 'Special cause: improvement' : st === 'concern' ? 'Special cause: concern' : 'Special cause'; }
function tipText(i){
  const r = state.rows[i], L = model.lim[i];
  if (isT()) return `${r.label}: ${days(r.gap)} since ${dateLong(r.prev)} · ${statusName(model.status[i])}`;
  if (!isCount()) return `${r.label}: ${fmt(r.value, 6)} · ${statusName(model.status[i])}`;
  const lims = model.ok ? ` (limits ${fv(clampV(L.lcl))} – ${fv(clampV(L.ucl))})` : '';
  const val = isC() ? fmt(r.num, 2) : `${fmt(r.num, 2)} / ${fmt(r.den, 2)} = ${fv(model.v[i])}${isU() ? ' ' + rateName() : ''}`;
  return `${r.label}: ${val}${lims} · ${statusName(model.status[i])}`;
}
function drawCharts(){
  if (!model) return;
  const xb = $('#xBox'); if (!xb) return;
  const W = Math.max(320, Math.round(xb.clientWidth)), narrow = W < 560;
  const xH = isCount() || isT() ? (narrow ? 320 : 420) : (narrow ? 300 : 380);
  xb.innerHTML = chartSVG('x', W, xH, true) + '<div id="tip"></div>';
  const mb = $('#mrBox'); if (mb) mb.innerHTML = chartSVG('mr', W, narrow ? 170 : 200, false);
  const svg = xb.querySelector('svg'), tip = $('#tip');
  svg.addEventListener('pointerover', e => {
    const t = e.target.closest('.hit'); if (!t) return;
    const i = +t.dataset.i;
    const act = i === 0 ? '' : state.breaks.has(i) ? ' · Click to undo recalculation' : ' · Click to recalculate limits from here';
    tip.textContent = tipText(i) + act;
    const box = xb.getBoundingClientRect(), pr = t.getBoundingClientRect();
    const left = pr.left + pr.width / 2 - box.left;
    tip.style.left = left + 'px'; tip.style.top = (pr.top - box.top + pr.height / 2) + 'px';
    tip.classList.add('on');
    const tw = tip.offsetWidth, minL = tw / 2 + 4, maxL = box.width - tw / 2 - 4;
    tip.style.left = Math.min(Math.max(left, minL), Math.max(minL, maxL)) + 'px';
  });
  svg.addEventListener('pointerout', e => { if (e.target.closest('.hit')) tip.classList.remove('on'); });
  svg.addEventListener('click', e => { const t = e.target.closest('.hit'); if (!t) return; toggleBreak(+t.dataset.i); });
}

function signalName(st){ return st === 'common' ? '' : st === 'improve' ? 'Improvement' : st === 'concern' ? 'Concern' : 'Special cause'; }
// The table for CSV and copying, with full precision
function tableRows(){
  if (isT()){
    const r4 = v => v === null || !isFinite(v) ? '' : String(+v.toFixed(4)), ev0 = state.events[0];
    const rows = [['Event', 'Event date', 'Days since previous event', 'Transformed gap (power 1/3.6)', 'Moving range (transformed)', 'Mean', 'Lower limit', 'Upper limit', 'Signal', 'Note']];
    rows.push([1, iso(ev0.t), '', '', '', '', '', '', '', ev0.note]);
    state.rows.forEach((q, i) => {
      const g = model.segOf(i);
      rows.push([i + 2, iso(q.t), r4(q.gap), r4(q.y), r4(model.mr[i]), r4(g.mean), g.ok ? r4(g.lcl) : '', g.ok ? r4(g.ucl) : '', signalName(model.status[i]) || 'Common cause', q.note]);
    });
    return rows;
  }
  if (!isCount()){
    const n4 = v => isFinite(v) ? String(+v.toFixed(4)) : '';
    const rows = [['Point', 'Label', 'Value', 'Moving range', 'Mean', 'Lower limit', 'Upper limit', 'Signal', 'Note']];
    state.rows.forEach((r, i) => {
      const g = model.segOf(i);
      rows.push([i + 1, r.label, r.value, model.mr[i] === null ? '' : n4(model.mr[i]), n4(g.mean), g.ok ? n4(g.lcl) : '', g.ok ? n4(g.ucl) : '', signalName(model.status[i]) || 'Common cause', r.note]);
    });
    return rows;
  }
  // U chart rates are given per 1,000 (or as set), like the chart
  const r6 = v => v === null || !isFinite(v) ? '' : String(+v.toFixed(6)), k = isU() ? state.per : 1, rk = v => r6(v === null ? v : v * k);
  const head = isC() ? ['Point', 'Label', 'Count'] : ['Point', 'Label', 'Count', isU() ? 'Exposure' : 'Total', isU() ? 'Rate ' + rateName() : 'Proportion'];
  head.push('Mean', 'Standard deviation', 'Lower limit', 'Upper limit');
  if (isLaney()) head.push('z-score', 'Moving range of z');
  head.push('Signal', 'Note');
  const rows = [head];
  state.rows.forEach((r, i) => {
    const L = model.lim[i];
    const row = isC() ? [i + 1, r.label, r.num] : [i + 1, r.label, r.num, r.den, rk(model.v[i])];
    row.push(rk(L.mean), rk(L.s1), model.ok ? rk(clampV(L.lcl)) : '', model.ok ? rk(clampV(L.ucl)) : '');
    if (isLaney()) row.push(r6(model.z[i]), r6(model.mrz[i]));
    row.push(signalName(model.status[i]) || 'Common cause', r.note);
    rows.push(row);
  });
  return rows;
}
function tableHTML(){
  if (isT()){
    const ev0 = state.events[0];
    let h = `<details class="values"><summary>Calculated values</summary><div class="tablewrap"><table><thead><tr><th>Event</th><th class="l">Date</th><th>Days since previous</th><th>Transformed</th><th>Moving range</th><th>Mean</th><th>Lower limit</th><th>Upper limit</th><th class="l">Signal</th><th class="l">Note</th><th><span style="position:absolute;left:-9999px">Action</span></th></tr></thead><tbody>`;
    h += `<tr><td>1</td><td class="l">${esc(dateLong(ev0.t))}</td><td colspan="6" class="l" style="color:var(--muted)">First event, starts the clock</td><td></td><td class="l wrap">${esc(ev0.note)}</td><td></td></tr>`;
    state.rows.forEach((q, i) => {
      const g = model.segOf(i);
      const btn = i === 0 ? '' : `<button type="button" data-brk="${i}">${state.breaks.has(i) ? 'Undo recalculation' : 'Recalculate from here'}</button>`;
      h += `<tr class="${state.breaks.has(i) ? 'brk' : ''}"><td>${i + 2}</td><td class="l">${esc(q.label)}</td><td>${fmt(q.gap)}</td><td>${fmt(q.y, 3)}</td><td>${model.mr[i] === null ? '' : fmt(model.mr[i], 3)}</td><td>${fmt(g.mean)}</td><td>${g.ok && g.lcl !== null ? fmt(g.lcl) : '–'}</td><td>${g.ok ? fmt(g.ucl) : '–'}</td><td class="l">${signalName(model.status[i])}</td><td class="l wrap">${esc(q.note)}</td><td>${btn}</td></tr>`;
    });
    return h + `</tbody></table></div></details>`;
  }
  const P = isCount();
  const valueHead = isC() ? '' : isU() ? `<th>Exposure</th><th>Rate ${esc(rateName())}</th>` : `<th>Total</th><th>${isPct() ? 'Percentage' : 'Proportion'}</th>`;
  const head = P ? `<th>#</th><th class="l">Label</th><th>Count</th>${valueHead}<th>Mean</th><th>Lower limit</th><th>Upper limit</th><th class="l">Signal</th><th class="l">Note</th>`
    : `<th>#</th><th class="l">Label</th><th>Value</th><th>Moving range</th><th>Mean</th><th>Lower limit</th><th>Upper limit</th><th class="l">Signal</th><th class="l">Note</th>`;
  let h = `<details class="values"><summary>Calculated values</summary><div class="tablewrap"><table><thead><tr>${head}<th><span style="position:absolute;left:-9999px">Action</span></th></tr></thead><tbody>`;
  state.rows.forEach((r, i) => {
    const L = model.lim[i];
    const btn = i === 0 ? '' : `<button type="button" data-brk="${i}">${state.breaks.has(i) ? 'Undo recalculation' : 'Recalculate from here'}</button>`;
    const cells = P ? `<td>${fmt(r.num, 2)}</td>${isC() ? '' : `<td>${fmt(r.den, 2)}</td><td>${fv(model.v[i])}</td>`}<td>${fv(L.mean)}</td><td>${model.ok && L.lcl > 0 ? fv(L.lcl) : '–'}</td><td>${model.ok && (!isP() || L.ucl < 1) ? fv(L.ucl) : '–'}</td><td class="l">${signalName(model.status[i])}</td><td class="l wrap">${esc(r.note)}</td>`
      : `<td>${fmt(r.value, 6)}</td><td>${model.mr[i] === null ? '' : fmt(model.mr[i])}</td><td>${fmt(L.mean)}</td><td>${L.ok ? fmt(L.lcl) : '–'}</td><td>${L.ok ? fmt(L.ucl) : '–'}</td><td class="l">${signalName(model.status[i])}</td><td class="l wrap">${esc(r.note)}</td>`;
    h += `<tr class="${state.breaks.has(i) ? 'brk' : ''}"><td>${i + 1}</td><td class="l">${esc(r.label)}</td>${cells}<td>${btn}</td></tr>`;
  });
  return h + `</tbody></table></div></details>`;
}

function wireOutput(){
  out.querySelectorAll('[data-brk]').forEach(b => b.onclick = () => toggleBreak(+b.dataset.brk));
}
function toggleBreak(i){
  if (i <= 0) return;
  if (state.breaks.has(i)) state.breaks.delete(i); else state.breaks.add(i);
  const open = out.querySelector('details.values')?.open;
  renderAll();
  if (open) out.querySelector('details.values').open = true;
}
function renderChips(){
  const c = $('#breakChips');
  const bs = [...state.breaks].filter(b => b < state.rows.length).sort((a, b) => a - b);
  c.innerHTML = bs.map(b => { const d = state.rows[b].label; return `<span class="chip">From ${esc(isT() ? d : trunc(d, 16))}<button type="button" data-rm="${b}" aria-label="Undo recalculation from ${esc(d)}">×</button></span>`; }).join('');
  c.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = () => toggleBreak(+btn.dataset.rm));
}

/* ---------- Exports ---------- */
function slug(){ const d = isP() ? 'p-chart' : isU() ? 'u-chart' : isC() ? 'c-chart' : isT() ? 't-chart' : 'spc-chart'; return (state.title || d).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || d; }
let dlPromise = null;
function getDownloads(){
  if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(undefined);
  if (!dlPromise) dlPromise = window.claude.use('downloads').catch(() => null);
  return dlPromise;
}
async function downloadBlob(blob, name){
  const d = await getDownloads();
  if (d){ const r = await d.save({ filename: name, data: blob }); return r && r.status !== 'declined'; }
  return FocusActions.saveFile(name, blob);
}
async function copyText(t){
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e){
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
const say = msg => FocusActions.say(msg);
async function svgToPng(svg, W, H){
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, W, H);
  return await new Promise(r => c.toBlob(r, 'image/png'));
}
const csvCell = v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function summaryText(){
  const lines = [fullTitle(), '', variationText().long];
  const a = assuranceText(); if (a) lines.push(a.long);
  const o = openText(); if (o) lines.push(o.text);
  if (model.events.length){ lines.push('', 'Signals found:'); model.events.forEach(ev => lines.push('- ' + cap(ruleText(ev)))); }
  else if (model.allOk || isT()) lines.push('No special cause signals were found.');
  const notes = noteIndex();
  if (notes.length){ lines.push('', 'Notes:'); notes.forEach((i, k) => lines.push(`${k + 1}. ${state.rows[i].label}: ${state.rows[i].note}`)); }
  return lines.join('\n');
}
const saved = (ok, msg) => say(ok ? msg : 'Download cancelled.');
const failed = () => say('The file couldn’t be saved here. Try Copy instead.');
async function act(a){
  if (!model) return;
  if (a === 'png'){ const e = exportSVG(); svgToPng(e.svg, e.W, e.H).then(b => downloadBlob(b, slug() + '.png')).then(ok => saved(ok, 'PNG downloaded.'), failed); }
  if (a === 'svg'){ const e = exportSVG(); downloadBlob(new Blob([e.svg], { type: 'image/svg+xml' }), slug() + '.svg').then(ok => saved(ok, 'SVG downloaded.'), failed); }
  if (a === 'copyimg'){
    if (!(navigator.clipboard && window.ClipboardItem)) return say('Your browser can’t copy images — use Download PNG.');
    try { const e = exportSVG(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng(e.svg, e.W, e.H) })]); say('Chart copied — paste it into PowerPoint or Word.'); }
    catch (err){ say('Copy was blocked — use Download PNG.'); }
  }
  if (a === 'csv') downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), slug() + '.csv').then(ok => saved(ok, 'Table downloaded.'), failed);
  if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => say(ok ? 'Table copied — paste it into Excel.' : 'Copy was blocked.'));
  if (a === 'copysummary') copyText(summaryText()).then(ok => say(ok ? 'Summary copied.' : 'Copy was blocked.'));
}

/* ---------- Chart type ---------- */
const TYPE_TEXT = {
  xmr: {
    placeholder: 'Paste from Excel, e.g.\nApr 2024\t42\nMay 2024\t39\nJun 2024\t45\tNew booking system',
    hint: 'Paste one value per line, or a label and a value (dates, weeks, anything). Anything in a third column is shown as a note on the chart. A header row is fine.',
    title: 'e.g. Days from referral to first appointment', dir: 'Improvement is when the value goes'
  },
  p: {
    placeholder: 'Paste from Excel, e.g.\nMonth\tSeen in 4 hours\tAttended\nApr 2024\t412\t530\nMay 2024\t398\t511\tNew triage nurse',
    hint: 'One period per line, oldest first: a label such as the week or month, the count (how many met the measure), then the total it is out of. Anything in a fourth column is shown as a note on the chart. A header row is fine.',
    title: 'e.g. Patients seen within four hours', dir: 'Improvement is when the proportion goes'
  },
  u: {
    placeholder: 'Paste from Excel, e.g.\nMonth\tFalls\tBed days\nApr 2024\t12\t3850\nMay 2024\t9\t3920\tNew bed rails',
    hint: 'One period per line, oldest first: a label such as the week or month, the count of events, then the exposure they happened in, such as bed days. Anything in a fourth column is shown as a note on the chart. A header row is fine.',
    title: 'e.g. Falls per 1,000 bed days', dir: 'Improvement is when the rate goes'
  },
  c: {
    placeholder: 'Paste from Excel, e.g.\nMonth\tComplaints\nApr 2024\t7\nMay 2024\t4\tNew leaflet',
    hint: 'One period per line, oldest first: a label such as the week or month, then the count. Anything in a third column is shown as a note on the chart. A header row is fine.',
    title: 'e.g. Complaints each month', dir: 'Improvement is when the count goes'
  },
  t: {
    placeholder: 'Paste from Excel, e.g.\n03/01/2024\n29/01/2024\n14/02/2024\tNew checklist started',
    hint: 'One event per line, oldest first, as day/month/year (03/01/2024), 2024-01-03 or 3 Jan 2024. Anything after the date, such as a second column, is shown as a note on the chart. A header row is fine.',
    title: 'e.g. Days between falls with harm', dir: 'Improvement looks like'
  }
};
// The special cause rule lengths each chart's source tool uses by default
const RUN_DEFAULT = { xmr: 7, p: 7, u: 7, c: 7, t: 6 };
const TYPES = ['xmr', 'p', 'u', 'c', 't'];
function showType(){
  const t = TYPE_TEXT[state.type];
  document.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(state.type); });
  $('#dirUp').textContent = isT() ? 'Longer gaps' : 'Up'; $('#dirDown').textContent = isT() ? 'Shorter gaps' : 'Down';
  $('#dirSeg').classList.toggle('three', !isT());
  if (isT() && state.dir === 'none'){ document.querySelector('input[name=dir][value=up]').checked = true; state.dir = 'up'; }
  $('#data').placeholder = t.placeholder; $('#dataHint').textContent = t.hint + ' Use Data sheet, at the top of the page, to download a spreadsheet with these columns, then import it once it’s filled in.';
  $('#title').placeholder = t.title; $('#dirLabel').textContent = t.dir;
  $('#targetLabel').textContent = isPct() ? 'Target, % (optional)' : isP() ? 'Target, as a proportion (optional)' : isU() ? `Target, ${rateName()} (optional)` : 'Target (optional)';
  $('#target').min = isCount() ? '0' : '';
  const L1 = isU() ? 'U' : 'P';
  $('#ctypePlain').textContent = L1 + ' chart'; $('#ctypeLaney').textContent = L1 + '′ chart';
  $('#laneyHint').textContent = isU() ? 'Use a U′ (Laney) chart when the exposures are large, such as thousands of bed days a month, and most points fall outside the U chart\u2019s limits even though nothing has changed.'
    : 'Use a P′ (Laney) chart when the totals are large, such as thousands of attendances a month, and most points fall outside the P chart\u2019s limits even though nothing has changed.';
  const r = document.querySelector(`input[name=spctype][value=${state.type}]`); if (r) r.checked = true;
  if (r) $('#typeCurrent').innerHTML = r.nextElementSibling.innerHTML;
}
// Keep the address in step with the chart type, so a link opens the same chart
function syncUrl(){
  try { const u = new URL(location.href); u.searchParams.set('type', state.type); history.replaceState(null, '', u); } catch (e) { /* not available in this view */ }
}
function setType(t){
  if (!TYPES.includes(t)) t = 'xmr';
  if (t === state.type) return;
  // Rule lengths left at the old chart's default move to the new chart's default
  ['#shiftLen', '#trendLen'].forEach(id => { if (+$(id).value === RUN_DEFAULT[state.type]) $(id).value = RUN_DEFAULT[t]; });
  state.type = t; state.breaks.clear();
  showType(); readForm(); readData(); renderAll(); syncUrl();
}

/* ---------- Inputs ---------- */
let parseTimer;
// Suggest the other chart when the pasted data looks like it belongs there
function suggestType(text){
  const box = $('#suggest');
  let other = null;
  const XMR = { type: 'xmr', msg: 'This looks like one value for each period.', btn: 'Use an XmR chart' };
  const P = { type: 'p', msg: 'This looks like a count and a total for each period.', btn: 'Use a P chart' };
  const U = { type: 'u', msg: 'Some counts are more than their total, so this looks like a rate: a count against an exposure such as bed days.', btn: 'Use a U chart' };
  const PU = { type: 'p', msg: 'This looks like a count and a total for each period.', btn: 'Use a P chart', alt: { type: 'u', btn: 'Use a U chart (a rate)' } };
  const T = { type: 't', msg: 'This looks like a list of event dates.', btn: 'Use a T chart' };
  const fitsP = () => { const pr = parseP(text, 'p'); return pr.rows.length >= 2 && !pr.invalid.length; };
  if (text.trim() && state.rows.length < 2){
    // Nothing usable for this chart: offer whichever other chart can read it
    if (!isT() && parseT(text).rows.length >= 2) other = T;
    else if (isP() && parseP(text, 'u').rows.length >= 2) other = U;
    else if (!isCount() && fitsP()) other = PU;
    else if (state.type !== 'xmr' && parseXmr(text).rows.length >= 2) other = XMR;
  } else if (text.trim() && isP() && state.invalid.some(x => x.why === 'count is more than the total')) other = U;
  // A count with another number beside it could be a P or U chart
  else if (text.trim() && (state.type === 'xmr' || isC()) && state.wide && fitsP() && parseP(text, 'p').rows.length >= state.rows.length) other = PU;
  box.hidden = !other;
  if (other){
    box.innerHTML = `${esc(other.msg)} <button type="button" class="link" data-type="${other.type}">${esc(other.btn)}</button>` + (other.alt ? ` or <button type="button" class="link" data-type="${other.alt.type}">${esc(other.alt.btn)}</button>` : '');
    box.querySelectorAll('button').forEach(b => b.onclick = () => setType(b.dataset.type));
  }
}
function readData(){
  const text = $('#data').value;
  const r = isP() || isU() ? parseP(text, state.type) : isC() ? parseC(text) : isT() ? parseT(text) : parseXmr(text);
  state.rows = r.rows; state.skipped = r.skipped; state.invalid = r.invalid; state.decimals = r.decimals; state.wide = r.wide;
  if (isT()){ state.events = r.events; state.unsorted = r.unsorted; state.order = r.order; state.hasTime = r.hasTime; }
  state.header = isCount() ? r.header : (r.header && r.header[0] ? r.header : null);
  [...state.breaks].forEach(b => { if (b >= r.rows.length) state.breaks.delete(b); });
  const ps = $('#parseStatus');
  if (!r.rows.length && !text.trim()){ ps.textContent = ''; ps.className = 'status'; }
  else if (isT()){
    let t = `${r.events.length} event${r.events.length === 1 ? '' : 's'} read.`;
    if (r.header) t += ' First line used as a header.';
    if (r.unsorted) t += ' Sorted into date order.';
    if (r.skipped.length) t += ` ${r.skipped.length} line${r.skipped.length > 1 ? 's' : ''} skipped.`;
    ps.textContent = t; ps.className = 'status' + (r.skipped.length ? ' warn' : '');
  } else {
    let t = `${r.rows.length} ${isCount() ? 'period' : 'value'}${r.rows.length === 1 ? '' : 's'} read.`;
    if (r.note) t += ' ' + r.note;
    if (state.header) t += ' First line used as a header.';
    const bad = r.skipped.length + r.invalid.length;
    if (bad) t += ` ${bad} line${bad > 1 ? 's' : ''} ${isCount() ? 'left out' : 'skipped'}.`;
    ps.textContent = t; ps.className = 'status' + (bad ? ' warn' : '');
  }
  if (state.type === 'xmr'){
    $('#yLabel').placeholder = state.header ? state.header[0] : 'e.g. Days';
    state.yLabel = $('#yLabel').value.trim() || (state.header ? state.header[0] : '');
  }
  suggestType(text);
}
const numOrNull = v => { v = String(v).trim(); return v === '' || !isFinite(+v) || +v < 0 ? null : +v; };
function readTarget(){
  const raw = $('#target').value.trim();
  if (isT()) state.target = null;
  else if (isCount()){ const v = numOrNull(raw); state.target = v === null ? null : clampV(fromUnit(v)); }
  else state.target = raw === '' || !isFinite(+raw) ? null : +raw;
}
function readAxes(){ state.yMin = numOrNull($('#yMin').value); state.yMax = numOrNull($('#yMax').value); }
const runLen = id => { const v = parseInt($(id).value, 10); return v >= 3 ? v : RUN_DEFAULT[state.type]; };
// Read every setting from the form, for after a project file is opened or the chart type changes
function readForm(){
  state.title = $('#title').value.trim(); state.team = $('#team').value.trim();
  state.dir = (document.querySelector('input[name=dir]:checked') || { value: 'up' }).value;
  state.floor = $('#floor').checked; state.screen = $('#screen').checked; state.showMR = $('#showMR').checked;
  state.useBaseN = (document.querySelector('input[name=base]:checked') || {}).value === 'first';
  const bn = parseInt($('#baseN').value, 10); state.baseN = isFinite(bn) && bn >= 2 ? bn : 20;
  state.laney = (document.querySelector('input[name=ctype]:checked') || {}).value === 'laney';
  const per = +$('#per').value; state.per = isFinite(per) && per > 0 ? per : 1000; state.perUnit = $('#perUnit').value.trim();
  if (isC()) state.yLabel = $('#yLabel').value.trim();
  state.unit = (document.querySelector('input[name=unit]:checked') || { value: 'pct' }).value;
  readTarget(); readAxes();
  state.showNotes = $('#showNotes').checked; state.twoThree = $('#twoThree').checked;
  state.shiftLen = runLen('#shiftLen'); state.trendLen = runLen('#trendLen');
  state.useTrend = $('#useTrend').checked; state.dateFmt = $('#dateFmt').value;
  showType();
}

document.querySelectorAll('input[name=spctype]').forEach(r => r.addEventListener('change', e => { setType(e.target.value); $('#typePick').open = false; }));
$('#data').addEventListener('input', () => { clearTimeout(parseTimer); parseTimer = setTimeout(() => { readData(); renderAll(); }, 180); });
$('#title').addEventListener('input', e => { state.title = e.target.value.trim(); $('#chartTitle').textContent = state.title || 'Your ' + chartName(); });
$('#title').addEventListener('change', renderAll);
$('#team').addEventListener('input', e => { state.team = e.target.value.trim(); renderAll(); });
$('#yLabel').addEventListener('input', e => { state.yLabel = e.target.value.trim() || (state.type === 'xmr' && state.header ? state.header[0] : ''); renderAll(); });
// A new rate base changes the target's and the axis range's meaning with it, as typed
$('#per').addEventListener('input', () => { const v = +$('#per').value; state.per = isFinite(v) && v > 0 ? v : 1000; showType(); readTarget(); readAxes(); renderAll(); });
$('#perUnit').addEventListener('input', e => { state.perUnit = e.target.value.trim(); showType(); renderAll(); });
document.querySelectorAll('input[name=dir]').forEach(r => r.addEventListener('change', e => { state.dir = e.target.value; renderAll(); }));
$('#target').addEventListener('input', () => { readTarget(); renderAll(); });
$('#floor').addEventListener('change', e => { state.floor = e.target.checked; renderAll(); });
document.querySelectorAll('input[name=base]').forEach(r => r.addEventListener('change', e => { state.useBaseN = e.target.value === 'first'; renderAll(); }));
$('#baseN').addEventListener('input', e => { const v = parseInt(e.target.value, 10); state.baseN = isFinite(v) && v >= 2 ? v : 20; if (!state.useBaseN){ document.querySelector('input[name=base][value=first]').checked = true; state.useBaseN = true; } renderAll(); });
$('#screen').addEventListener('change', e => { state.screen = e.target.checked; renderAll(); });
$('#showMR').addEventListener('change', e => { state.showMR = e.target.checked; renderAll(); });
document.querySelectorAll('input[name=ctype]').forEach(r => r.addEventListener('change', e => { state.laney = e.target.value === 'laney'; renderAll(); }));
// Changing the unit converts the target and axis values so they keep meaning the same thing
// (only when the person clicks: reopening a project file sets the unit along with
// values already saved in that unit, so they mustn't be converted again)
document.querySelectorAll('input[name=unit]').forEach(r => r.addEventListener('change', e => {
  const f = e.target.value === 'pct' ? 100 : 0.01;
  if (e.isTrusted) ['#target', '#yMin', '#yMax'].forEach(id => { const v = numOrNull($(id).value); if (v !== null) $(id).value = +(v * f).toPrecision(10); });
  state.unit = e.target.value; showType(); readTarget(); readAxes(); renderAll();
}));
$('#yMin').addEventListener('input', () => { readAxes(); renderAll(); });
$('#yMax').addEventListener('input', () => { readAxes(); renderAll(); });
$('#showNotes').addEventListener('change', e => { state.showNotes = e.target.checked; renderAll(); });
$('#shiftLen').addEventListener('input', () => { state.shiftLen = runLen('#shiftLen'); renderAll(); });
$('#trendLen').addEventListener('input', () => { state.trendLen = runLen('#trendLen'); renderAll(); });
$('#useTrend').addEventListener('change', e => { state.useTrend = e.target.checked; renderAll(); });
$('#dateFmt').addEventListener('change', e => { state.dateFmt = e.target.value; renderAll(); });
$('#twoThree').addEventListener('change', e => { state.twoThree = e.target.checked; renderAll(); });

function loadExample(){
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = i => { const m = 3 + i; return `${mon[m % 12]} ${2023 + Math.floor(m / 12)}`; };
  if (isP()){
    // Sepsis patients given antibiotics within an hour: about 64%, then about 80% after a sepsis trolley is introduced
    const pct = [62, 66, 60, 65, 63, 68, 61, 64, 67, 59, 65, 63, 66, 62, 64, 61, 79, 76, 82, 78, 81, 84, 77, 80, 83, 79];
    const den = [48, 55, 41, 60, 52, 47, 58, 50, 44, 62, 53, 49, 57, 45, 51, 59, 54, 46, 61, 50, 56, 48, 63, 52, 47, 58];
    const lines = ['Month\tAntibiotics within 1 hour\tPatients with sepsis\tNote'];
    pct.forEach((v, i) => lines.push(`${month(i)}\t${Math.round(v / 100 * den[i])}\t${den[i]}${i === 16 ? '\tSepsis trolley introduced' : ''}`));
    $('#data').value = lines.join('\n');
    $('#title').value = 'Patients with sepsis given antibiotics within an hour';
    $('#team').value = 'Emergency department (example)';
    document.querySelector('input[name=dir][value=up]').checked = true;
    document.querySelector('input[name=ctype][value=p]').checked = true;
    document.querySelector('input[name=unit][value=pct]').checked = true;
    $('#target').value = '90'; $('#yMin').value = ''; $('#yMax').value = '';
  } else if (isU()){
    // Falls on older people's wards: about 6 per 1,000 bed days, then about 4 after a falls bundle
    const falls = [24, 21, 25, 22, 20, 26, 19, 24, 23, 21, 25, 22, 15, 13, 16, 14, 12, 15, 13, 16, 14, 12, 15, 14];
    const bed = [3850, 3920, 3710, 3880, 3790, 3960, 3700, 3840, 3910, 3760, 3890, 3820, 3870, 3740, 3930, 3800, 3860, 3720, 3900, 3810, 3780, 3950, 3830, 3870];
    const lines = ['Month\tFalls\tBed days\tNote'];
    falls.forEach((c, i) => lines.push(`${month(i)}\t${c}\t${bed[i]}${i === 12 ? '\tFalls bundle introduced' : ''}`));
    $('#data').value = lines.join('\n');
    $('#title').value = 'Falls per 1,000 bed days';
    $('#team').value = 'Older people\u2019s wards (example)';
    $('#per').value = '1000'; $('#perUnit').value = 'bed days';
    document.querySelector('input[name=dir][value=down]').checked = true;
    document.querySelector('input[name=ctype][value=p]').checked = true;
    $('#target').value = '5'; $('#yMin').value = ''; $('#yMax').value = '';
  } else if (isC()){
    // Complaints about one outpatient service: about 8 a month, then about 5 after a drop-in starts
    const counts = [9, 7, 10, 8, 6, 11, 8, 9, 7, 10, 8, 12, 9, 7, 8, 5, 4, 6, 3, 5, 4, 6, 5, 3, 4];
    const lines = ['Month\tComplaints\tNote'];
    counts.forEach((c, i) => lines.push(`${month(i)}\t${c}${i === 15 ? '\tPatient liaison drop-in started' : ''}`));
    $('#data').value = lines.join('\n');
    $('#title').value = 'Complaints about the outpatient service';
    $('#team').value = 'Outpatients (example)'; $('#yLabel').value = 'Complaints';
    document.querySelector('input[name=dir][value=down]').checked = true;
    $('#target').value = ''; $('#yMin').value = ''; $('#yMax').value = '';
  } else if (isT()){
    // Falls with harm on one ward: about one every three weeks, then less often after a falls bundle starts
    const gaps = [19, 6, 31, 12, 25, 3, 17, 40, 9, 22, 14, 28, 7, 35, 11, 20, 16, 4, 26, 13, 58, 47, 71, 39, 64, 52, 88, 44, 61, 75];
    // Ends three weeks before today, so the days since the latest event read sensibly
    const now = new Date(), dmy = t => { const d = new Date(t); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
    let t = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - (gaps.reduce((a, b) => a + b, 0) + 21) * DAY;
    const lines = ['Date of fall\tNote', dmy(t)];
    gaps.forEach((g, i) => { t += g * DAY; lines.push(i === 19 ? `${dmy(t)}\tFalls bundle started` : i === 26 ? `${dmy(t)}\tNew staff joined` : dmy(t)); });
    $('#data').value = lines.join('\n');
    $('#title').value = 'Days between falls with harm';
    $('#team').value = 'Ward 7 (example)';
    document.querySelector('input[name=dir][value=up]').checked = true;
    $('#yMin').value = ''; $('#yMax').value = '';
  } else {
    const vals = [44, 41, 46, 43, 39, 45, 42, 47, 40, 44, 43, 48, 41, 42, 45, 40, 46, 43, 38, 36, 35, 37, 33, 34, 36, 32, 35, 33, 34, 31];
    $('#data').value = ['Month\tDays to first appointment\tNote', ...vals.map((v, i) => `${month(i)}\t${v}${i === 18 ? '\tNew booking system' : ''}`)].join('\n');
    $('#title').value = 'Days from referral to first appointment';
    $('#team').value = ''; $('#yLabel').value = '';
    document.querySelector('input[name=dir][value=down]').checked = true;
    $('#target').value = '38';
  }
  state.breaks.clear();
  readForm(); readData(); renderAll();
}
$('#clearBtn').onclick = () => {
  $('#data').value = ''; state.breaks.clear(); $('#title').value = ''; $('#team').value = ''; $('#yLabel').value = ''; $('#target').value = '';
  readForm(); readData(); renderAll(); $('#data').focus(); trackCleared();
};
trackSettings({ chartType: 'spctype', direction: 'dir', floorAtZero: 'floor', baseline: 'base', screenMovingRanges: 'screen', pChartType: 'ctype', showMovingRange: 'showMR', unit: 'unit', dateFormat: 'dateFmt', showNotes: 'showNotes', twoOfThree: 'twoThree', useTrend: 'useTrend' });

/* ---------- Blank data collection sheet ---------- */
// The columns are in the order each chart's parser reads them, with guidance on collecting the data for that chart
const SHEET = {
  xmr: {
    name: 'XmR chart', option: 'A value for each period',
    head: () => ['Period', $('#yLabel').value.trim() || 'Value', 'Note'], widths: [22, 22, 40], rows: 30,
    fill: [
      'Fill in one row for each week or month, oldest at the top. Write the period in the first column, such as Apr 2024 or the date the week begins.',
      'Write one value for each period in the second column, such as the average number of days to a first appointment for patients seen that month. To plot individual cases instead, write one row per case in the order they happened.',
      'Rename the Value heading to what you are measuring, such as Days.',
      'If there is no data for a period, leave that row out rather than writing 0, unless the value really was 0.',
      'Use the Note column for changes to the process, such as a new booking system. Notes are shown as numbered flags on the chart.'
    ]
  },
  p: {
    name: 'P chart', option: 'How many out of a total',
    head: () => ['Period', 'Count (met the measure)', 'Total (out of)', 'Note'], widths: [18, 24, 18, 40], rows: 30,
    fill: [
      'Fill in one row for each week or month, oldest at the top. Write the period in the first column, such as Apr 2024 or the date the week begins.',
      'In Total, write how many cases there were in the period that could have met the measure, such as all patients who attended.',
      'In Count, write how many of those cases met the measure, such as patients seen within four hours. Each case is either a yes or a no and is counted once, so the count can never be more than the total.',
      'Use the Note column for changes to the process, such as a new triage nurse starting. Notes are shown as numbered flags on the chart.'
    ]
  },
  u: {
    name: 'U chart', option: 'A rate of events',
    head: () => { const u = $('#perUnit').value.trim(); return ['Period', 'Events', u ? cap(u) : 'Exposure (such as bed days)', 'Note']; }, widths: [18, 14, 28, 40], rows: 30,
    fill: [
      'Fill in one row for each week or month, oldest at the top. Write the period in the first column, such as Apr 2024 or the date the week begins.',
      'In Events, write how many events happened in the period, such as falls. The same patient can have more than one event, and each one counts.',
      'In the third column, write the opportunity there was for events in the same period, such as occupied bed days or theatre hours. Use the same unit every period, and rename the heading to match.',
      'Use the Note column for changes to the process, such as new bed rails. Notes are shown as numbered flags on the chart.'
    ]
  },
  c: {
    name: 'C chart', option: 'A count of events each period',
    head: () => ['Period', 'Count of events', 'Note'], widths: [18, 18, 40], rows: 30,
    fill: [
      'Fill in one row for each week or month, oldest at the top. Write the period in the first column, such as Apr 2024 or the date the week begins.',
      'In Count of events, write how many events happened in the period, such as complaints received. Write 0 for a period with none.',
      'Only use a C chart when the opportunity for events is about the same every period, such as a similar number of patients or beds. If it changes a lot, also record the opportunity and use a U chart instead.',
      'Use the Note column for changes to the process, such as a new leaflet. Notes are shown as numbered flags on the chart.'
    ]
  },
  t: {
    name: 'T chart', option: 'Dates of rare events',
    head: () => ['Date of event', 'Note'], widths: [18, 48], rows: 40,
    fill: [
      'Fill in one row for each event, in the order they happened. Write the date as day/month/year, such as 03/01/2024. If two events happen on the same day, write a row for each.',
      'Record every event, including the first. The chart plots the days between each event and the one before, so a missed event makes a gap look longer than it was.',
      'Use a T chart when events are rare, so most weeks or months would have none, such as falls with harm or never events.',
      'Use the Note column for changes to the process, such as a new checklist starting. Notes are shown as numbered flags on the chart.'
    ]
  }
};
function dataSheet(){
  const k = SHEET[state.type];
  const head = k.head().map(v => ({ v, s: 'head' }));
  const rows = [head];
  for (let i = 0; i < k.rows; i++) rows.push(Array(head.length).fill({ v: '', s: 'input' }));
  const min = isT() ? 'Collect at least 15 events if you can. With fewer, treat the limits as provisional.'
    : isCount() ? `Collect at least 20 periods if you can. Process limits appear once there are ${MIN_COUNT_LIMITS} points, and get more reliable with more.`
    : 'Collect at least 20 periods if you can. With fewer than 15, treat the limits as provisional.';
  const notes = [
    `Collecting data for ${state.type === 'xmr' ? 'an' : 'a'} ${k.name}`,
    'Before you start',
    '1. Write down exactly what you are measuring: what counts, what doesn’t, and where the data comes from. This makes sure everyone collects it the same way every time.',
    isT() ? '2. Decide who will record each event and how you will hear about it, so none are missed.' : '2. Choose how often you will plot it, each week or each month, and keep to it.',
    '3. ' + min,
    '',
    'Filling in the sheet',
    ...k.fill.map((t, i) => `${i + 1}. ${t}`),
    '',
    'Building the chart',
    `Save this workbook, then in the SPC chart tool choose Data sheet, then Import filled data sheet, and pick this file. It picks the ${k.name} from the headings. Or choose “${k.option}”, select the rows you have filled in on the Data sheet, including the headings, copy them and paste them into Your data.` + (isU() ? ' Then set Per and Of what, such as per 1,000 bed days.' : '')
  ];
  const titles = new Set([0, 1, 6, 6 + k.fill.length + 2]);
  return [
    { name: 'Data', cols: k.widths, rows, freeze: 1 },
    { name: 'Instructions', cols: [100], rows: notes.map((v, i) => [{ v, s: titles.has(i) ? 'title' : 'wrap' }]) }
  ];
}

// A filled-in data sheet: the headings say which chart it was set up for
function importSheet(book, h){
  const first = book.sheets.find(s => !/^instructions$/i.test(s.name.trim()) && s.rows.length);
  const rows = h.sheet('Data') || (first && first.rows);
  if (!rows) return new Error('That workbook doesn’t have a Data sheet. Use a data sheet downloaded from this tool.');
  const head = (rows[0] || []).map(v => String(v).trim().toLowerCase());
  const t = /^date of event/.test(head[0] || '') ? 't' : /^count \(met/.test(head[1] || '') ? 'p' : head[1] === 'events' ? 'u'
    : head[1] === 'count of events' ? 'c' : head[0] === 'period' && (head.length <= 2 || (head.length === 3 && head[2] === 'note')) ? 'xmr' : '';
  if (t) setType(t);
  const n = h.count(rows);
  if (!n) return new Error('That data sheet has no rows filled in yet.');
  h.put('#data', h.tsv(rows));
  return `Imported ${n} ${n === 1 ? 'row' : 'rows'} as ${state.type === 'xmr' ? 'an' : 'a'} ${SHEET[state.type].name}.`;
}

/* ---------- Shared toolbar (Data sheet, Example, Open, Save, Export) ---------- */
FocusActions.mount({
  // Files saved from the separate P chart and T chart tools still open here, as that chart
  tool: 'spc_tool', formerIds: ['p_chart', 't_chart'], toolName: 'SPC chart',
  example: loadExample, hasData: () => !!$('#data').value.trim(),
  fileName: () => slug(),
  fields: 'aside.panel[aria-label="Data and settings"]',
  getExtra: () => ({ type: state.type, breaks: [...state.breaks], useBaseN: state.useBaseN }),
  setExtra: (x, from) => {
    const t = (x && x.type) || (from === 'p_chart' ? 'p' : from === 't_chart' ? 't' : 'xmr');
    if (t !== state.type){ state.type = TYPES.includes(t) ? t : 'xmr'; syncUrl(); }
    state.breaks = new Set((x && x.breaks) || []);
    if (state.type !== 'p'){
      const base = document.querySelector(`input[name=base][value=${x && x.useBaseN ? 'first' : 'all'}]`);
      if (base) base.checked = true;
    }
  },
  afterOpen: () => { clearTimeout(parseTimer); readForm(); readData(); renderAll(); },
  ready: () => !!model,
  exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) }))),
  template: { title: 'Download a spreadsheet to collect your data in, set up for the chart you have chosen', fileName: () => `${state.type}-chart-data-sheet.xlsx`, sheets: dataSheet, import: importSheet }
});

let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(drawCharts, 80); }).observe(out);
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderAll());

const askedType = new URLSearchParams(location.search).get('type');
state.type = TYPES.includes(askedType) ? askedType : 'xmr';
if (state.type === 't') ['#shiftLen', '#trendLen'].forEach(id => { $(id).value = RUN_DEFAULT.t; });
readForm(); readData(); renderAll();
})();

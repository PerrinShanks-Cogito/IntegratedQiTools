/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(() => {
"use strict";

/* ---------- Reference data ---------- */
// Lower/upper limits for number of runs, by useful observations: fewer than the lower or more than the upper is a
// signal. Table 1 of Perla, Provost and Murray (2011), adapted from Swed and Eisenhart (about a 5% risk of a false signal).
const RUNS_TABLE = {10:[3,9],11:[3,10],12:[3,11],13:[4,11],14:[4,12],15:[5,12],16:[5,13],17:[5,13],18:[6,14],19:[6,15],20:[6,16],21:[7,16],22:[7,17],23:[7,17],24:[8,18],25:[8,18],26:[9,19],27:[10,19],28:[10,20],29:[10,20],30:[11,21],31:[11,22],32:[11,23],33:[12,23],34:[12,24],35:[12,24],36:[13,25],37:[13,25],38:[14,26],39:[14,26],40:[15,27],41:[15,27],42:[16,28],43:[16,28],44:[17,29],45:[17,30],46:[17,31],47:[18,31],48:[18,32],49:[19,32],50:[19,33],51:[20,33],52:[20,34],53:[21,34],54:[21,35],55:[22,35],56:[22,35],57:[23,36],58:[23,37],59:[24,38],60:[24,38]};

const EXAMPLE = (() => {
  const vals = [17,19,20,18,16,15,17,19,21,20,18,16,17,19,20, 22,24,23,26,25,27,24,26,28,25,27,26,29,27,28];
  const start = Date.UTC(2026,0,5);
  const lines = ["Week commencing\t% discharged before midday"];
  vals.forEach((v,i) => {
    const d = new Date(start + i*7*864e5);
    lines.push(`${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}\t${v}`);
  });
  return lines.join("\n");
})();

const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

/* ---------- Parsing ---------- */
function yr(y){ y = +y; return y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y; }
function mk(y, mo, d){
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo, d);
  return new Date(t).getUTCDate() === d ? t : null;
}
function parseDate(raw){
  const s = String(raw).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T\s].*)?$/))) return mk(+m[1], +m[2]-1, m[3] ? +m[3] : 1);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s.*)?$/))) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return mk(yr(m[3]), mo-1, d);
  }
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{4})$/))) return mk(+m[2], +m[1]-1, 1);
  if ((m = s.match(/^(?:(\d{1,2})(?:st|nd|rd|th)?[\s\-]+)?([A-Za-z]{3,9})\.?[\s\-',]+(\d{2,4})$/))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0,3)];
    if (mo !== undefined) return mk(yr(m[3]), mo, m[1] ? +m[1] : 1);
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase().slice(0,3)];
    if (mo !== undefined) return mk(+m[3], mo, +m[2]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = +s; if (n > 20000 && n < 80000) return Date.UTC(1899,11,30) + Math.round(n)*864e5; }
  return null;
}
// Shared statistics and readers, from /assets/js/focus-stats.js
const { median, quantile, splitTable, readNumber: parseNumber } = FocusStats;

function decimalsOf(raw){
  const s = String(raw).replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
function parseInput(text){
  const notes = [];
  // with no delimiter, a line is a label then a value ("Week 1 42")
  const s = splitTable(text, { space: 'label' });
  if (!s) return { points: [], notes, header: null };
  // comma-separated with more than two cells: the value is the last cell and the
  // label everything before it, so an unquoted label such as Mon, 3 Jan still works
  let rows = s.recs.map(r => s.delim === "," && r.length > 2 ? [r.slice(0, -1).join(","), r[r.length - 1]] : r);
  const singleCol = rows.every(r => r.filter(c => c !== "").length <= 1);
  let header = null;
  if (singleCol) rows = rows.map(r => [r.find(c => c !== "") ?? ""]);

  const valueCell = r => singleCol ? r[0] : r[1];
  if (isNaN(parseNumber(valueCell(rows[0]))) && rows.length > 1) header = rows.shift();
  if (!singleCol && rows.some(r => r.filter(c => c !== "").length > 2)) notes.push("Only the first two columns were used: the first as the date or label, the second as the value.");

  const skipped = [];
  let points = [];
  rows.forEach((r, i) => {
    const raw = valueCell(r);
    const v = parseNumber(raw);
    if (isNaN(v)) { skipped.push(`row ${i + 1 + (header ? 1 : 0)} (“${raw || "blank"}”)`); return; }
    points.push({ label: singleCol ? "" : (r[0] || ""), value: v, raw, dp: decimalsOf(raw) });
  });
  if (skipped.length) notes.push(`Skipped ${skipped.length} row${skipped.length > 1 ? "s" : ""} without a number: ${skipped.slice(0,3).join(", ")}${skipped.length > 3 ? "…" : ""}.`);

  let dated = false;
  if (!singleCol && points.length) {
    const ts = points.map(p => parseDate(p.label));
    const ok = ts.filter(t => t !== null).length;
    if (ok === points.length) {
      dated = true;
      points.forEach((p, i) => p.t = ts[i]);
      const sorted = points.every((p, i) => i === 0 || p.t >= points[i-1].t);
      if (!sorted) {
        points = points.map((p, i) => ({ ...p, o: i })).sort((a, b) => a.t - b.t || a.o - b.o);
        notes.push("Your dates weren't in order, so the points have been sorted from earliest to latest.");
      }
      const dupes = points.filter((p, i) => i > 0 && p.t === points[i-1].t).length;
      if (dupes) notes.push(`${dupes} date${dupes > 1 ? "s appear" : " appears"} more than once. A run chart needs one value per time period.`);
    } else if (ok > 0) {
      notes.push("Some labels couldn't be read as dates, so the points are kept in the order you pasted them.");
    }
  }
  if (singleCol) points.forEach((p, i) => p.label = String(i + 1));
  return { points, notes, header, singleCol, dated };
}

/* ---------- Analysis ---------- */

const EPS = 1e-9;
const sideOf = (v, med) => v > med + EPS ? 1 : v < med - EPS ? -1 : 0;

// Rule 1: 6 or more consecutive points on one side of the median. Points on the median neither count nor break the run.
function findShifts(vals, med){
  const out = []; let side = 0, members = [];
  const flush = () => { if (members.length >= 6) out.push({ side, idx: members.slice() }); };
  vals.forEach((v, i) => {
    const s = sideOf(v, med);
    if (s === 0) return;
    if (s === side) members.push(i);
    else { flush(); side = s; members = [i]; }
  });
  flush();
  return out;
}
// Rule 2: 5 or more consecutive points all going up or all going down. Repeated equal values neither count nor break the trend.
function findTrends(vals){
  const out = []; if (vals.length < 2) return out;
  let dir = 0, members = [0], last = 0;
  const flush = () => { if (dir !== 0 && members.length >= 5) out.push({ dir, idx: members.slice(), from: members[0], to: members[members.length-1] }); };
  for (let i = 1; i < vals.length; i++) {
    const d = Math.sign(vals[i] - vals[last]);
    if (Math.abs(vals[i] - vals[last]) < EPS) continue;
    if (d === dir) members.push(i);
    else { flush(); dir = d; members = [last, i]; }
    last = i;
  }
  flush();
  return out;
}
// Rule 3: too many or too few runs.
function countRuns(vals, med){
  const sides = vals.map(v => sideOf(v, med)).filter(s => s !== 0);
  const useful = sides.length, onMedian = vals.length - useful;
  let runs = useful ? 1 : 0;
  for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i-1]) runs++;
  let lo = null, hi = null, source = "table";
  if (useful >= 10 && useful <= 60) [lo, hi] = RUNS_TABLE[useful];
  else if (useful > 60) {
    const n1 = sides.filter(s => s > 0).length, n2 = useful - n1;
    const mu = 2*n1*n2/useful + 1;
    const sd = Math.sqrt(2*n1*n2*(2*n1*n2 - useful) / (useful*useful*(useful - 1)));
    lo = Math.ceil(mu - 1.96*sd); hi = Math.floor(mu + 1.96*sd); source = "approx";
  }
  return { useful, onMedian, runs, lo, hi, source };
}
// Rule 4: astronomical points are a judgement call. Flag far outliers (beyond 3 × IQR) as candidates to look at.
function findAstro(vals){
  if (vals.length < 8) return [];
  const s = [...vals].sort((a, b) => a - b);
  const q1 = quantile(s, .25), q3 = quantile(s, .75), iqr = q3 - q1;
  if (iqr <= EPS) return [];
  const lo = q1 - 3*iqr, hi = q3 + 3*iqr;
  return vals.map((v, i) => (v > hi ? { i, side: 1 } : v < lo ? { i, side: -1 } : null)).filter(Boolean);
}

function kindFor(sign, dir){
  if (dir === "none") return "neutral";
  return (sign > 0) === (dir === "up") ? "improve" : "concern";
}

function analyse(data, opts){
  const pts = data.points, vals = pts.map(p => p.value), n = vals.length;
  let baseN = n, baseNote = "";
  if (opts.medMode === "first") baseN = Math.max(2, Math.min(n, opts.firstN || n));
  if (opts.medMode === "change" && opts.change !== null) baseN = opts.change + 1;
  const frozen = baseN < n;
  const med = median(vals.slice(0, baseN));
  const dp = Math.min(4, Math.max(0, ...pts.map(p => p.dp)));

  const lbl = i => data.singleCol ? `point ${i+1}` : pts[i].label;
  const range = (a, b) => data.singleCol ? `points ${a+1} to ${b+1}` : `${pts[a].label} to ${pts[b].label}`;
  const word = (kind) => kind === "improve" ? "improvement" : kind === "concern" ? "concern" : "";

  const pointKind = new Array(n).fill(null);
  const pointRules = Array.from({ length: n }, () => []);
  const mark = (idxs, kind, rule) => idxs.forEach(i => {
    pointRules[i].push(rule);
    if (!pointKind[i] || pointKind[i] === "neutral") pointKind[i] = kind;
  });

  // When half or more of the (baseline) values sit at the lowest or highest value, the median is that
  // value itself and the rules that use it (shift and runs) can't be applied (Perla, Provost and Murray 2011).
  const baseVals = vals.slice(0, baseN);
  const stuck = baseN >= 2 && (med <= Math.min(...baseVals) + EPS || med >= Math.max(...baseVals) - EPS);
  const stuckAt = stuck ? (med >= Math.max(...baseVals) - EPS && med > Math.min(...baseVals) + EPS ? "highest" : "lowest") : "";
  const stuckText = `Half or more of the ${frozen ? "baseline " : ""}values are at the ${stuckAt} value, ${fmt(med, dp)}, so the median is that value itself and this rule can't be applied. ` +
    "If you're counting events, try plotting the time or the number of cases between them instead.";
  // Provost and Murray: the shift and runs rules need more than 10 points. With 10 or fewer, a long run on
  // one side of the median is shown as a possible shift, not a signal.
  const shiftEarly = n <= 10;

  // Rule 1
  const shifts = stuck ? [] : findShifts(vals, med).map(s => {
    const kind = kindFor(s.side, opts.dir);
    const text = `${s.idx.length} points ${s.side > 0 ? "above" : "below"} the median, ${range(s.idx[0], s.idx[s.idx.length-1])}`;
    if (shiftEarly) { s.idx.forEach(i => pointRules[i].push("early")); return { kind: "common", idx: s.idx, text: `${text}: a possible shift, but there are too few points yet to call it a signal` }; }
    mark(s.idx, kind, "shift");
    return { kind, idx: s.idx, text };
  });
  // Rule 2
  const trends = findTrends(vals).map(t => {
    const kind = kindFor(t.dir, opts.dir);
    const idx = []; for (let i = t.from; i <= t.to; i++) idx.push(i);
    mark(idx, kind, "trend");
    return { kind, idx, text: `${t.idx.length} points ${t.dir > 0 ? "rising" : "falling"}, ${range(t.from, t.to)}` };
  });
  // Rule 3 (baseline only when the median is frozen)
  const runs = countRuns(vals.slice(0, baseN), med);
  let runsStatus = "na", runsText = "";
  const scope = frozen ? " in the baseline period" : "";
  if (stuck) runsText = stuckText;
  else if (runs.lo === null) {
    runsText = `There ${runs.useful === 1 ? "is" : "are"} ${runs.useful} useful observation${runs.useful === 1 ? "" : "s"}${scope} (points not on the median). This rule needs at least 10.`;
  } else {
    const expect = `With ${runs.useful} useful observations${runs.onMedian ? ` (${runs.onMedian} on the median left out)` : ""} we'd expect between ${runs.lo} and ${runs.hi} runs${runs.source === "approx" ? " (normal approximation)" : ""}.`;
    if (runs.runs < runs.lo) { runsStatus = "signal"; runsText = `${runs.runs} runs${scope}: too few. ${expect} Too few runs means points are clustering on one side of the median, which suggests the process level has changed.`; }
    else if (runs.runs > runs.hi) { runsStatus = "signal"; runsText = `${runs.runs} runs${scope}: too many. ${expect} Too many runs means points flip across the median more than chance would explain. Check whether data from different sources or processes are mixed together.`; }
    else { runsStatus = "clear"; runsText = `${runs.runs} runs${scope}. ${expect}`; }
  }
  if (runsStatus === "signal") { for (let i = 0; i < baseN; i++) pointRules[i].push("runs"); }
  // Rule 4
  const astro = findAstro(vals).map(a => {
    const kind = kindFor(a.side, opts.dir);
    pointRules[a.i].push("astro");
    return { kind, i: a.i, text: `${fmt(vals[a.i], dp)} at ${lbl(a.i)} sits well apart from the rest of the data` };
  });

  const rules = [
    { key: "shift", name: "Shift", what: "6 or more consecutive points above or below the median. Points on the median are skipped. Needs more than 10 points.",
      status: stuck ? "na" : shiftEarly ? (shifts.length ? "early" : "na") : shifts.length ? "signal" : "clear", items: shifts,
      none: stuck ? stuckText : shiftEarly ? `There ${n === 1 ? "is" : "are"} ${n} point${n === 1 ? "" : "s"}. This rule needs more than 10, so it can't be applied yet.` : "No run of 6 or more points on one side of the median." },
    { key: "trend", name: "Trend", what: "5 or more consecutive points all going up or all going down. Repeated equal values are skipped.",
      status: trends.length ? "signal" : "clear", items: trends,
      none: "No run of 5 or more points steadily rising or falling." },
    { key: "runs", name: "Number of runs", what: "A run is one or more points in a row on the same side of the median. Too many or too few runs signals non-random variation.",
      status: runsStatus, items: [], none: runsText },
    { key: "astro", name: "Astronomical point", what: "A point obviously, even blatantly, different from the rest, that everyone studying the chart agrees is unusual. Every chart has a highest and a lowest point; that alone doesn't make a point astronomical. This rule is a judgement call, so the tool only suggests points worth a look.",
      status: astro.length ? "check" : "clear", items: astro,
      none: "No point stands far apart from the rest. Look at the chart too: people who know the process may spot something the numbers don't." }
  ];

  const allSignals = [...(shiftEarly ? [] : shifts), ...trends];
  const counts = { improve: 0, concern: 0, neutral: 0 };
  allSignals.forEach(s => counts[s.kind]++);
  if (runsStatus === "signal") counts.neutral++;

  const notes = [];
  if (n < 10) notes.push("With fewer than 10 points, there's not much to judge a pattern against. Keep adding data.");
  if (stuck) notes.push(`Half or more of the ${frozen ? "baseline " : ""}values are at the ${stuckAt} value, so the median can't be used for the shift and runs rules. The trend and astronomical point rules still apply.`);
  // Provost and Murray: freeze the median only from a baseline with no signals
  if (frozen && !stuck) {
    const inBase = [];
    if (findShifts(baseVals, med).length && baseN > 10) inBase.push("a shift");
    if (findTrends(baseVals).length) inBase.push("a trend");
    if (runsStatus === "signal") inBase.push(runs.runs < runs.lo ? "too few runs" : "too many runs");
    if (inBase.length) notes.push(`The baseline (the first ${baseN} points) itself shows a non-random signal (${inBase.join(", ")}). Provost and Murray advise freezing the median only from a baseline with no signals, so consider a different baseline period.`);
  }
  if (frozen && baseN < 10) notes.push(`The baseline median uses only ${baseN} point${baseN === 1 ? "" : "s"}. A baseline of 10 to 12 or more gives a steadier median.`);
  const above = shifts.some(s => shifts.length > 1 && s.text.includes("above")), below = shifts.some(s => s.text.includes("below"));
  const stepHint = !frozen && above && below;

  return { n, med, baseN, frozen, dp, rules, counts, pointKind, pointRules, astro, shifts, trends, runs, runsStatus, notes, stepHint, range, word };
}

/* ---------- Formatting ---------- */
function fmt(v, dp){
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: Math.min(dp + 1, 4) }).format(v);
}
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function niceTicks(min, max, count){
  if (max - min < EPS) { const pad = Math.abs(max) * .1 || 1; min -= pad; max += pad; }
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw)), e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  const dp = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return { lo, hi, ticks, dp };
}
function palette(forceLight){
  if (forceLight) return { surface:"#FFFFFF", ink:"#212B32", muted:"#4C6272", line:"#D8DDE0", improve:"#0072CE", concern:"#C9580A", neutral:"#7C2855", common:"#8A9AA5" };
  const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue("--" + k).trim();
  return { surface:g("surface"), ink:g("ink"), muted:g("muted"), line:g("line"), improve:g("improve"), concern:g("concern"), neutral:g("neutral"), common:g("common") };
}

/* ---------- Chart ---------- */
let geom = null;
function buildSVG(data, an, opts, pal, W, H, title){
  const pts = data.points, n = pts.length, vals = pts.map(p => p.value);
  const narrow = W < 520;
  const m = { t: title ? 56 : 18, r: narrow ? 10 : 22, b: 50, l: narrow ? 42 : 56 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const { lo, hi, ticks, dp } = niceTicks(Math.min(...vals, an.med), Math.max(...vals, an.med), ph < 260 ? 4 : 6);
  const step = pw / n;
  const x = i => m.l + (i + .5) * step;
  const y = v => m.t + ph - (v - lo) / (hi - lo) * ph;
  const font = `font-family="Figtree, Helvetica Neue, Arial, sans-serif"`;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${font} role="img" aria-label="Run chart of ${n} points with median ${fmt(an.med, an.dp)}">`);
  o.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${pal.surface}"/>`);
  if (title) o.push(`<text x="${m.l}" y="30" font-size="20" font-weight="700" fill="${pal.ink}">${esc(title)}</text>`);
  // Number of points plotted, top right (on the title's line when there is one)
  o.push(`<text x="${m.l + pw}" y="${title ? 30 : m.t - 5}" text-anchor="end" font-size="12" font-weight="600" fill="${pal.muted}">n = ${n}</text>`);

  // Grid and y labels
  ticks.forEach(t => {
    const ty = y(t);
    o.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${ty}" y2="${ty}" stroke="${pal.line}" stroke-width="1"/>`);
    o.push(`<text x="${m.l - 8}" y="${ty + 4}" text-anchor="end" font-size="12" fill="${pal.muted}">${fmt(t, dp > 0 ? dp - 1 : 0)}</text>`);
  });

  // X labels, thinned to fit
  const maxLen = Math.max(...pts.map(p => p.label.length), 1);
  const labelW = Math.min(maxLen, 12) * 7 + 14;
  const every = Math.max(1, Math.ceil(labelW / step));
  for (let i = 0; i < n; i += every) {
    const t = pts[i].label.length > 12 ? pts[i].label.slice(0, 11) + "…" : pts[i].label;
    o.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${m.t + ph}" y2="${m.t + ph + 5}" stroke="${pal.muted}"/>`);
    o.push(`<text x="${x(i)}" y="${m.t + ph + 20}" text-anchor="middle" font-size="12" fill="${pal.muted}">${esc(t)}</text>`);
  }
  o.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="${pal.muted}" stroke-width="1"/>`);

  // Change marker
  if (opts.change !== null && opts.change < n - 1) {
    const cx = m.l + (opts.change + 1) * step;
    o.push(`<line x1="${cx}" x2="${cx}" y1="${m.t - 4}" y2="${m.t + ph}" stroke="${pal.ink}" stroke-width="1.5" stroke-dasharray="2 4"/>`);
    o.push(`<text x="${cx + 6}" y="${m.t + 8}" font-size="12" font-weight="700" fill="${pal.ink}">Change</text>`);
  }

  // Median
  const my = y(an.med), mx0 = m.l, mx1 = m.l + an.baseN * step;
  o.push(`<line x1="${mx0}" x2="${mx1}" y1="${my}" y2="${my}" stroke="${pal.ink}" stroke-width="2"/>`);
  if (an.frozen) o.push(`<line x1="${mx1}" x2="${m.l + pw}" y1="${my}" y2="${my}" stroke="${pal.ink}" stroke-width="2" stroke-dasharray="7 5"/>`);
  const medLabel = `Median ${fmt(an.med, an.dp)}`;
  o.push(`<text x="${m.l + pw}" y="${my - 7}" text-anchor="end" font-size="12" font-weight="700" fill="${pal.ink}" paint-order="stroke" stroke="${pal.surface}" stroke-width="4">${medLabel}</text>`);

  // Data line
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  o.push(`<path d="${path}" fill="none" stroke="${pal.muted}" stroke-width="1.5" stroke-linejoin="round" opacity=".7"/>`);

  // Points
  const r = n > 80 ? 3 : n > 40 ? 4 : 5;
  const colour = k => k ? pal[k] : pal.common;
  an.astro.forEach(a => {
    o.push(`<circle class="ring r-astro" cx="${x(a.i)}" cy="${y(vals[a.i])}" r="${r + 5}" fill="none" stroke="${colour(a.kind)}" stroke-width="2"/>`);
  });
  vals.forEach((v, i) => {
    const cls = ["pt", ...new Set(an.pointRules[i].map(k => "r-" + k))].join(" ");
    const k = an.pointKind[i];
    o.push(`<circle class="${cls}" data-i="${i}" cx="${x(i)}" cy="${y(v)}" r="${k ? r + 1 : r}" fill="${colour(k)}" stroke="${pal.surface}" stroke-width="1.5"/>`);
  });
  o.push(`</svg>`);
  geom = { m, step, n, W };
  return o.join("");
}

/* ---------- UI ---------- */
const el = id => document.getElementById(id);
const els = { data: el("data"), notes: el("notes"), measure: el("measure"), change: el("change"), medmode: el("medmode"), firstn: el("firstn"), firstnWrap: el("firstn-wrap"),
  empty: el("empty"), verdict: el("verdict"), chartPanel: el("chart-panel"), chart: el("chart"), tip: el("tip"), legend: el("legend"), chartTitle: el("chart-title"),
  rulesPanel: el("rules-panel"), rules: el("rules"), next: el("next"), check: el("check"), table: el("table") };

let state = { data: null, an: null, opts: null };
let measureTouched = false;

function getOpts(n){
  const dir = document.querySelector('input[name="dir"]:checked').value;
  const cv = els.change.value;
  const change = cv === "" ? null : Math.min(+cv, n - 1);
  return { dir, change, medMode: els.medmode.value, firstN: parseInt(els.firstn.value, 10) || 12 };
}

function refreshChangeOptions(data){
  const prev = els.change.value;
  const opts = ['<option value="">No change marked</option>'];
  data.points.slice(0, -1).forEach((p, i) => opts.push(`<option value="${i}">${esc(data.singleCol ? `Point ${i+1}` : p.label)}</option>`));
  els.change.innerHTML = opts.join("");
  if (prev !== "" && +prev < data.points.length - 1) els.change.value = prev;
}

function run(){
  const data = parseInput(els.data.value);
  els.notes.innerHTML = data.notes.map(t => `<li>${esc(t)}</li>`).join("");
  if (data.header && !measureTouched) els.measure.value = data.singleCol ? data.header[0] : (data.header[1] || "");
  const has = data.points.length >= 2;
  els.empty.hidden = has;
  [els.verdict, els.chartPanel, els.rulesPanel, els.next, els.check].forEach(s => s.hidden = !has);
  if (!has) {
    if (data.points.length === 1) els.notes.innerHTML += `<li>Add at least one more value to draw a chart.</li>`;
    refreshChangeOptions({ points: [], singleCol: true });
    state.data = null; return;
  }
  refreshChangeOptions(data);
  const opts = getOpts(data.points.length);
  if (opts.medMode === "change" && opts.change === null) els.notes.innerHTML += `<li>Mark a change point to use the points before it as the baseline. Using all points for now.</li>`;
  const an = analyse(data, opts);
  an.notes.forEach(t => els.notes.innerHTML += `<li>${esc(t)}</li>`);
  state = { data, an, opts };
  trackChart({ points: data.points.length });
  renderVerdict(); renderChart(); renderRules(); renderNext(); renderTable();
}

function renderVerdict(){
  const { an } = state, c = an.counts;
  const special = an.rules.some(r => r.status === "signal");
  const astro = an.astro.length;
  let h, p;
  if (special) {
    h = "Non-random signal found";
    p = "At least one rule shows a non-random signal: the pattern is unlikely to be down to chance alone, so something has affected the process. The rules below show where.";
  } else if (astro) {
    h = `No signals from rules 1 to 3, but ${astro === 1 ? "one point" : `${astro} points`} to check`;
    p = `${astro === 1 ? "One point stands" : `${astro} points stand`} well apart from the rest, which may be an astronomical point (rule 4). If everyone who knows the process agrees ${astro === 1 ? "it's" : "they're"} obviously different, treat ${astro === 1 ? "it" : "them"} as a non-random signal and find out what happened.`;
  } else {
    h = "No non-random signals";
    p = "None of the rules are triggered, so there's no evidence of a non-random pattern: the variation looks random. A run chart can only show whether there are non-random signals. To judge the process against control limits, use a Shewhart (control) chart, such as the <a href=\"../spc_tool/\">SPC chart</a>.";
  }
  if (!special && an.rules[0].status === "early") p += " A possible shift is building up, but there are too few points to call it a signal yet: keep adding data.";
  if (an.n < 10) p += " With so few points, treat this reading with caution.";
  let tally = "";
  if (special) {
    const parts = [];
    if (state.opts.dir !== "none") {
      parts.push(`<span><i class="dot" style="background:var(--improve)"></i>${c.improve} signal${c.improve === 1 ? "" : "s"} of improvement</span>`);
      parts.push(`<span><i class="dot" style="background:var(--concern)"></i>${c.concern} signal${c.concern === 1 ? "" : "s"} of concern</span>`);
      if (c.neutral) parts.push(`<span><i class="dot" style="background:var(--neutral)"></i>${c.neutral} with no direction</span>`);
    } else {
      const total = c.improve + c.concern + c.neutral;
      parts.push(`<span><i class="dot" style="background:var(--neutral)"></i>${total} signal${total === 1 ? "" : "s"}. Choose which direction is better to see whether ${total === 1 ? "it's" : "they're"} good news.</span>`);
    }
    tally = `<div class="tally">${parts.join("")}</div>`;
  }
  els.verdict.className = "panel verdict" + (special ? " special" : "");
  els.verdict.innerHTML = `<h2>${h}</h2><p>${p}</p>${tally}`;
}

function renderChart(){
  const { data, an, opts } = state;
  const W = Math.max(320, Math.round(els.chart.clientWidth || 800));
  const H = W < 520 ? 300 : Math.round(Math.min(440, Math.max(340, W * .45)));
  const title = els.measure.value.trim();
  els.chartTitle.textContent = title || "Run chart";
  const old = els.chart.querySelector("svg"); if (old) old.remove();
  els.chart.insertAdjacentHTML("afterbegin", buildSVG(data, an, opts, palette(false), W, H, ""));
  const legend = [`<span><i class="ln"></i>Median${an.frozen ? " (baseline)" : ""}</span>`];
  if (an.frozen) legend.push(`<span><i class="ln dash"></i>Baseline median extended</span>`);
  legend.push(`<span><i class="dot" style="background:var(--common)"></i>No signal</span>`);
  if (opts.dir === "none") { if (an.pointKind.some(Boolean)) legend.push(`<span><i class="dot" style="background:var(--neutral)"></i>Non-random signal</span>`); }
  else {
    const kinds = new Set(an.pointKind.filter(Boolean));
    if (kinds.has("improve")) legend.push(`<span><i class="dot" style="background:var(--improve)"></i>Signal: improvement</span>`);
    if (kinds.has("concern")) legend.push(`<span><i class="dot" style="background:var(--concern)"></i>Signal: concern</span>`);
  }
  if (an.astro.length) legend.push(`<span><i class="dot" style="background:transparent;border:2px solid var(--muted)"></i>Point to check</span>`);
  els.legend.innerHTML = legend.join("");
}

function renderRules(){
  const { an, opts } = state;
  const chipText = { signal: "Signal", clear: "No signal", check: "Check", na: "Can't apply", early: "Too early" };
  const dotColour = k => `var(--${opts.dir === "none" ? "neutral" : k})`;
  els.rules.innerHTML = an.rules.map((r, i) => {
    let found;
    if (r.items.length) {
      found = `<ul>${r.items.map(s => `<li><i class="dot" style="background:${dotColour(s.kind)}"></i><span>${esc(s.text)}${opts.dir !== "none" && r.key !== "astro" && an.word(s.kind) ? ` <em>(${an.word(s.kind)})</em>` : ""}</span></li>`).join("")}</ul>`;
      if (r.key === "astro") found += `<p class="what" style="margin-top:4px">Does everyone who knows the process agree this is obviously different? If so, it's a non-random signal: find out what happened that period.</p>`;
    } else found = esc(r.none);
    return `<li tabindex="0" data-rule="${r.key}" aria-label="Rule ${i+1}: ${r.name}, ${chipText[r.status]}">
      <span class="chip ${r.status}">${chipText[r.status]}</span>
      <div><h4>Rule ${i+1}: ${r.name}</h4><p class="what">${esc(r.what)}</p><div class="found">${found}</div></div></li>`;
  }).join("");
}

function renderNext(){
  const { an } = state;
  const special = an.rules.some(r => r.status === "signal");
  const parts = ["<h3>What this means for your work</h3>"];
  if (special) {
    parts.push("<p>A non-random signal needs a different response from random variation. Find out what was going on at the flagged points: a change you made, a change in the patients or demand, or a change in how the data were collected.</p>");
    parts.push("<p>Don't redesign the whole process on the strength of one signal until you understand where it came from. If the signal follows a change you tested, it's evidence the change made a difference.</p>");
  } else {
    parts.push("<p>Random variation comes from the way the process works now. Reacting to individual ups and downs, or asking why one week was worse than the last, tends to add variation rather than reduce it.</p>");
    parts.push("<p>If this level of performance isn't good enough, the way forward is to change the process itself, then keep plotting to see whether the chart picks up the change.</p>");
  }
  if (an.stepHint) parts.push("<p><strong>Tip:</strong> there are long runs on both sides of the median. That often means the process changed level part way through. If you know when a change happened, mark it and set the median from the points before it, so the chart tests the new period against the old one.</p>");
  else if (!an.frozen && state.opts.change !== null) parts.push("<p><strong>Tip:</strong> to test whether the marked change made a difference, set the median from the points before the change. The baseline median is then extended across the new period so you can look for shifts and trends against it.</p>");
  els.next.innerHTML = parts.join("");
}

function renderTable(){
  const { data, an } = state;
  const rows = data.points.map((p, i) => {
    const s = sideOf(p.value, an.med);
    const where = i >= an.baseN ? (s > 0 ? "Above" : s < 0 ? "Below" : "On") + " (after baseline)" : s > 0 ? "Above" : s < 0 ? "Below" : "On median";
    return `<tr><td class="num">${i+1}</td><td>${esc(data.singleCol ? "–" : p.label)}</td><td class="num">${fmt(p.value, p.dp)}</td><td>${where}</td></tr>`;
  });
  els.table.innerHTML = `<thead><tr><th>#</th><th>Date or label</th><th>Value</th><th>Side of median</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

/* Tooltip */
function showTip(clientX){
  if (!state.data || !geom) return;
  const svg = els.chart.querySelector("svg"); if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const sx = (clientX - rect.left) * geom.W / rect.width;
  const i = Math.floor((sx - geom.m.l) / geom.step);
  svg.querySelectorAll(".pt.hl").forEach(c => { c.classList.remove("hl"); c.setAttribute("stroke", palette(false).surface); });
  if (i < 0 || i >= geom.n) { els.tip.classList.remove("on"); return; }
  const c = svg.querySelector(`.pt[data-i="${i}"]`);
  c.classList.add("hl"); c.setAttribute("stroke", palette(false).ink);
  const { data, an } = state, p = data.points[i];
  const ruleNames = { shift: "Shift", trend: "Trend", runs: "Runs", astro: "Point to check", early: "Possible shift (too few points yet)" };
  const rs = [...new Set(an.pointRules[i])].filter(r => r !== "runs").map(r => ruleNames[r]);
  const cr = c.getBoundingClientRect(), hr = els.chart.getBoundingClientRect();
  els.tip.innerHTML = `<b>${esc(data.singleCol ? `Point ${i+1}` : p.label)}</b>: ${fmt(p.value, p.dp)}${rs.length ? `<br>${rs.join(", ")}` : ""}`;
  let left = cr.left + cr.width/2 - hr.left;
  left = Math.max(70, Math.min(hr.width - 70, left));
  els.tip.style.left = left + "px";
  els.tip.style.top = (cr.top - hr.top) + "px";
  els.tip.classList.add("on");
}
els.chart.addEventListener("pointermove", e => showTip(e.clientX));
els.chart.addEventListener("pointerdown", e => showTip(e.clientX));
els.chart.addEventListener("pointerleave", () => { els.tip.classList.remove("on"); const svg = els.chart.querySelector("svg"); svg && svg.querySelectorAll(".pt.hl").forEach(c => { c.classList.remove("hl"); c.setAttribute("stroke", palette(false).surface); }); });

/* Rule focus highlights points on the chart */
function setFocus(key){ const svg = els.chart.querySelector("svg"); if (!svg) return; key ? svg.setAttribute("data-focus", key) : svg.removeAttribute("data-focus"); }
els.rules.addEventListener("mouseover", e => { const li = e.target.closest("li[data-rule]"); if (li) setFocus(li.dataset.rule); });
els.rules.addEventListener("mouseleave", () => setFocus(null));
els.rules.addEventListener("focusin", e => { const li = e.target.closest("li[data-rule]"); if (li) setFocus(li.dataset.rule); });
els.rules.addEventListener("focusout", () => setFocus(null));

/* Exports */
const exportName = () => (els.measure.value.trim() || "run-chart").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "run-chart";
function exportSVGText(W, H){
  const svg = buildSVG(state.data, state.an, state.opts, palette(true), W, H, els.measure.value.trim() || "Run chart");
  renderChart(); // restore on-screen geometry
  return svg;
}
function downloadBlob(blob, name, msg){
  FocusActions.saveFile(name, blob).then(
    ok => FocusActions.say(ok ? msg : "Download cancelled."),
    () => FocusActions.say("The file couldn’t be saved here."));
}
function exportSVG(){
  if (!state.data) return;
  downloadBlob(new Blob([exportSVGText(1200, 600)], { type: "image/svg+xml" }), exportName() + ".svg", "SVG downloaded.");
}
function exportCSV(){
  if (!state.data) return;
  const q = v => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = state.data.header || [];
  const single = state.data.singleCol;
  const rows = [["Point"].concat(single ? [] : [head[0] || "Date"], [els.measure.value.trim() || "Value", "Median"])]
    .concat(state.data.points.map((p, i) => [i + 1].concat(single ? [] : [p.label], [p.value, state.an.med])));
  downloadBlob(new Blob(["\uFEFF" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv" }), exportName() + ".csv", "Data table downloaded.");
}
function exportPNG(){
  if (!state.data) return;
  const W = 1200, H = 600;
  const svg = exportSVGText(W, H);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  img.onload = () => {
    const cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    cv.toBlob(b => downloadBlob(b, exportName() + ".png", "PNG downloaded."), "image/png");
  };
  img.src = url;
}

async function copySummary(){
  if (!state.data) return;
  const { an, opts } = state;
  const lines = [];
  lines.push(els.measure.value.trim() || "Run chart");
  lines.push(els.verdict.querySelector("h2").textContent);
  lines.push(`${an.n} points. Median ${fmt(an.med, an.dp)}${an.frozen ? ` (from the first ${an.baseN} points, extended)` : ""}.`);
  an.rules.forEach((r, i) => {
    const head = `Rule ${i+1} (${r.name}): `;
    if (r.items.length) r.items.forEach(s => lines.push(head + s.text + (opts.dir !== "none" && r.key !== "astro" && an.word(s.kind) ? ` (${an.word(s.kind)})` : "")));
    else lines.push(head + r.none);
  });
  try { await navigator.clipboard.writeText(lines.join("\n")); FocusActions.say("Summary copied."); }
  catch { FocusActions.say("Copy was blocked by your browser."); }
}

/* Inputs */
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 180); };
els.data.addEventListener("input", schedule);
els.measure.addEventListener("input", () => { measureTouched = els.measure.value !== ""; if (state.data) { renderChart(); } });
document.querySelectorAll('input[name="dir"]').forEach(r => r.addEventListener("change", run));
els.change.addEventListener("change", run);
els.medmode.addEventListener("change", () => { els.firstnWrap.hidden = els.medmode.value !== "first"; run(); });
els.firstn.addEventListener("input", schedule);

function loadExample(){
  els.data.value = EXAMPLE;
  measureTouched = false; els.measure.value = "";
  document.getElementById("dir-up").checked = true;
  run();
  els.change.value = "14";
  els.medmode.value = "change"; els.firstnWrap.hidden = true;
  run();
}
el("example2").addEventListener("click", loadExample);
el("clear").addEventListener("click", () => {
  els.data.value = ""; els.measure.value = ""; measureTouched = false;
  els.medmode.value = "all"; els.firstnWrap.hidden = true;
  document.getElementById("dir-none").checked = true;
  run(); els.data.focus(); trackCleared();
});
trackSettings({ improvement: "dir", median: "medmode" });

new ResizeObserver(() => { if (state.data) renderChart(); }).observe(els.chart);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => state.data && renderChart());



/* Shared toolbar (Open, Save, Export) */
FocusActions.mount({
  explain: { root: "#out", place: "#check" },
  tool: "run_chart", toolName: "run chart",
  example: loadExample, hasData: () => !!els.data.value.trim(),
  fileName: exportName,
  fields: 'aside.panel[aria-label="Your data and settings"]',
  afterOpen: () => { measureTouched = !!els.measure.value.trim(); run(); },
  ready: () => !!state.data,
  exports: trackExports([
    { type: "png", run: exportPNG },
    { type: "svg", run: exportSVG },
    { type: "csv", run: exportCSV },
    { type: "copysummary", run: copySummary }
  ])
});

// Exposed for testing
window.__runchart = { parseInput, analyse, findShifts, findTrends, countRuns, parseDate };
run();
})();

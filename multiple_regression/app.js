/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    yCol: $('yCol'), picker: $('picker'), modelBlock: $('modelBlock'), flagOdd: $('flagOdd'), result: $('result')
  };
  const COLORS = { point: '#005EB8', line: '#AE2573', ink: '#212B32', muted: '#4C6272', grid: '#E3E8EB', flag: '#A65300', infl: '#DA291C', off: '#9DB4CA' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 3 });
  const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
  const MAX_LEVELS = 12;
  const CHARTS = { effects: 'Which factors matter most', fit: 'Actual against predicted', resid: 'Differences against predicted', order: 'Differences in row order' };

  let headerTouched = false;
  let current = null;
  let timer = null;
  // The chart on screen is drawn at the width it's shown at (like the SPC
  // chart), so it fills wide screens without the text growing. Exports still
  // use the standard 960-wide drawing.
  const BASE_W = 960, MIN_W = 760;
  let drawW = BASE_W, lastChart = null, shownW = 0;
  function chartWidth() { return Math.max(MIN_W, Math.round(els.result.clientWidth) - 2); }
  function drawAt(w, fn) { const was = drawW; drawW = w; try { return fn(); } finally { drawW = was; } }
  function drawShown(fn) { lastChart = fn; shownW = chartWidth(); return drawAt(shownW, fn); }
  const svgOf = out => out && (typeof out === 'string' ? out : out.svg);
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const c = document.getElementById('chart');
      if (!lastChart || !c || !c.querySelector('svg') || chartWidth() === shownW) return;
      shownW = chartWidth();
      const svg = svgOf(drawAt(shownW, lastChart));
      if (svg) c.innerHTML = svg;
    }, 150);
  });
  let colSig = '';
  let chartType = 'effects';
  let whatIf = {};

  // Example: daily ED time to be seen, with attendances, doctors on shift, older patients and day type
  function exampleText() {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const lines = ['Date\tAttendances\tDoctors on shift\tPatients aged 75+ (%)\tDay type\tMinutes to be seen'];
    const d = new Date(Date.UTC(2025, 0, 6));
    for (let k = 0; k < 42; k++) {
      const wd = d.getUTCDay(), weekend = wd === 0 || wd === 6;
      const att = Math.round((weekend ? 140 : 160) + 22 * gauss());
      const doc = Math.max(5, Math.min(12, Math.round((weekend ? 7 : 9) + att / 80 - 2 + 1.1 * gauss())));
      const old = Math.round(18 + 4 * gauss());
      let mins = 52 + 0.62 * att - 5.5 * doc + 0.15 * old + (weekend ? 9 : 0) + 6 * gauss();
      if (k === 23) mins += 34; // one unusual day (an IT outage)
      lines.push(`${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}\t${att}\t${doc}\t${old}\t${weekend ? 'Weekend' : 'Weekday'}\t${Math.round(mins)}`);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return lines.join('\n');
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'multiple-regression';

  // ---- parsing ----
  function split(text) {
    // with no delimiter, every line is split on spaces
    return splitTable(text, { space: 'columns', trimTrailing: true });
  }

  // Shared statistics, from /assets/js/focus-stats.js
  const { tP, tCrit, fP, mean: avg, sd, readNumber: num, splitTable } = FocusStats;

  // Each column is numeric, a category (a few repeated text values) or a label (anything else)
  function classify(recs, delim, hasHeader) {
    const ncol = Math.max(...recs.map(r => r.length));
    const body = hasHeader ? recs.slice(1) : recs;
    const cols = [];
    for (let c = 0; c < ncol; c++) {
      const cells = body.map(r => r[c]).filter(v => v !== undefined && v !== '');
      const ok = cells.filter(v => isFinite(num(v, delim))).length;
      let kind = 'label';
      if (cells.length && ok / cells.length >= 0.8) kind = 'num';
      else if (cells.length) {
        const lv = new Set(cells).size;
        if (lv >= 2 && lv <= MAX_LEVELS && lv < cells.length * 0.8) kind = 'cat';
      }
      cols.push({ i: c, kind, name: (hasHeader && recs[0][c]) || 'Column ' + (c + 1) });
    }
    return cols;
  }
  function headerGuess(text) {
    const s = split(text); if (!s || s.recs.length < 2) return false;
    const cols = classify(s.recs, s.delim, true);
    return cols.some(c => c.kind === 'num' && !isFinite(num(s.recs[0][c.i], s.delim)));
  }

  // ---- linear algebra and distributions ----


  // Least squares by modified Gram-Schmidt QR. Columns that add nothing new
  // (perfectly explained by earlier ones) are dropped and reported.
  function ols(X, y) {
    const n = y.length, p = X[0].length;
    const Q = [], R = [], keep = [], dropped = [];
    for (let j = 0; j < p; j++) {
      const v = X.map(r => r[j]);
      const norm0 = Math.sqrt(v.reduce((s, a) => s + a * a, 0));
      const rcol = [];
      Q.forEach((q, k) => { let d = 0; for (let i = 0; i < n; i++) d += q[i] * v[i]; rcol.push(d); for (let i = 0; i < n; i++) v[i] -= d * q[i]; });
      const nv = Math.sqrt(v.reduce((s, a) => s + a * a, 0));
      if (norm0 === 0 || nv <= 1e-9 * norm0) { dropped.push(j); continue; }
      Q.push(v.map(a => a / nv)); rcol.push(nv); R.push(rcol); keep.push(j);
    }
    const k = Q.length;
    // R is stored by column: R[c][r] for r <= c. Invert the upper triangle.
    const Ri = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let c = 0; c < k; c++) {
      Ri[c][c] = 1 / R[c][c];
      for (let r = c - 1; r >= 0; r--) {
        let s = 0; for (let m = r + 1; m <= c; m++) s += R[m][r] * Ri[m][c];
        Ri[r][c] = -s / R[r][r];
      }
    }
    const qty = Q.map(q => q.reduce((s, a, i) => s + a * y[i], 0));
    const b = Ri.map(row => row.reduce((s, a, c) => s + a * qty[c], 0));
    // (X'X)^-1 = Ri Ri'
    const C = Ri.map((ra, r) => Ri.map(rb => ra.reduce((s, a, m) => s + a * rb[m], 0)));
    const lev = y.map((_, i) => Q.reduce((s, q) => s + q[i] * q[i], 0));
    return { b, C, lev, keep, dropped };
  }

  // ---- model ----
  function build(text, hasHeader, yIdx, useSet) {
    const s = split(text);
    if (!s) return null;
    const cols = classify(s.recs, s.delim, hasHeader);
    const body = hasHeader ? s.recs.slice(1) : s.recs;
    const yc = cols[yIdx];
    const xs = cols.filter(c => c.i !== yIdx && useSet.has(c.i) && (c.kind === 'num' || c.kind === 'cat'));
    const labelCol = cols.find(c => c.kind === 'label');
    const rows = []; let skipped = 0;
    body.forEach((r, ri) => {
      const y = num(r[yIdx], s.delim);
      if (!isFinite(y)) { skipped++; return; }
      const vals = {};
      for (const c of xs) {
        const raw = r[c.i];
        if (c.kind === 'num') { const v = num(raw, s.delim); if (!isFinite(v)) { skipped++; return; } vals[c.i] = v; }
        else { if (raw === undefined || raw === '') { skipped++; return; } vals[c.i] = raw; }
      }
      rows.push({ label: labelCol ? (r[labelCol.i] || 'Row ' + (ri + 1)) : 'Row ' + (ri + 1), y, vals });
    });
    // design matrix terms
    const terms = [];
    xs.forEach(c => {
      if (c.kind === 'num') { terms.push({ col: c, name: c.name, kind: 'num' }); return; }
      const counts = new Map(); rows.forEach(r => counts.set(r.vals[c.i], (counts.get(r.vals[c.i]) || 0) + 1));
      const levels = [...counts.keys()];
      if (levels.length < 2) return;
      const ref = levels.reduce((a, l) => counts.get(l) > counts.get(a) ? l : a, levels[0]);
      c.levels = levels; c.ref = ref;
      levels.filter(l => l !== ref).forEach(l => terms.push({ col: c, level: l, ref, name: `${c.name}: ${l}`, kind: 'cat' }));
    });
    return { cols, yc, xs, rows, skipped, terms, labelCol };
  }
  function termValue(t, v) { return t.kind === 'num' ? v[t.col.i] : (v[t.col.i] === t.level ? 1 : 0); }

  function fit(d) {
    const n = d.rows.length;
    const X = d.rows.map(r => [1].concat(d.terms.map(t => termValue(t, r.vals))));
    const y = d.rows.map(r => r.y);
    const q = ols(X, y);
    if (!q.keep.length || q.keep[0] !== 0) return { bad: 'flat' };
    const terms = q.keep.slice(1).map(j => d.terms[j - 1]);
    const dropped = q.dropped.map(j => d.terms[j - 1]);
    const k = terms.length, df = n - k - 1;
    if (k === 0) return { bad: 'noterms', dropped };
    if (df < 1) return { bad: 'few', need: k + 2, dropped };
    const Xk = X.map(r => q.keep.map(j => r[j]));
    const pred = Xk.map(r => r.reduce((s, a, j) => s + a * q.b[j], 0));
    const res = y.map((v, i) => v - pred[i]);
    const my = avg(y);
    const sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = res.reduce((s, e) => s + e * e, 0);
    if (sst === 0) return { bad: 'flaty' };
    const r2 = Math.max(0, 1 - sse / sst), adj = 1 - (1 - r2) * (n - 1) / df;
    const s = Math.sqrt(sse / df);
    const F = sse > 0 ? ((sst - sse) / k) / (sse / df) : Infinity;
    const pF = sse > 0 ? fP(F, k, df) : 0;
    const tc = tCrit(df), sdy = sd(y);
    const coefs = q.b.map((b, j) => {
      const se = s * Math.sqrt(Math.max(0, q.C[j][j]));
      const t = se > 0 ? b / se : Infinity, p = se > 0 ? tP(Math.abs(t), df) : 0;
      const out = { b, se, t, p, lo: b - tc * se, hi: b + tc * se };
      if (j > 0) {
        const term = terms[j - 1], xv = Xk.map(r => r[j]), mx = avg(xv);
        const sxx = xv.reduce((a, v) => a + (v - mx) ** 2, 0);
        out.term = term;
        out.vif = q.C[j][j] * sxx;
        out.scale = (term.kind === 'num' ? Math.sqrt(sxx / (n - 1)) : 1) / sdy;
        out.min = Math.min(...xv); out.max = Math.max(...xv); out.mean = mx;
      }
      return out;
    });
    const stud = res.map((e, i) => s > 0 && q.lev[i] < 1 ? e / (s * Math.sqrt(1 - q.lev[i])) : 0);
    const cook = stud.map((r, i) => q.lev[i] < 1 ? r * r / (k + 1) * q.lev[i] / (1 - q.lev[i]) : 0);
    const odd = stud.map(r => n >= 8 && Math.abs(r) > 2.5);
    const infl = cook.map(c => n >= 8 && c > 0.5);
    let dw = NaN;
    if (sse > 0) { let a = 0; for (let i = 1; i < n; i++) a += (res[i] - res[i - 1]) ** 2; dw = a / sse; }
    return { n, k, df, terms, dropped, coefs, pred, res, stud, cook, odd, infl, r2, adj, s, F, pF, tc, dw, my, C: q.C, keep: q.keep };
  }

  // ---- charts ----
  function niceTicks(min, max, count) {
    const raw = (max - min || 1) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), nrm = raw / mag;
    const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }
  function span(vals) {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.04;
    return [lo - pad, hi + pad];
  }
  function svgOpen(W, H, o) {
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (o.title) s.push(`<text x="24" y="34" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(70, Math.floor((W - (24) - 16) / 12.32))))}</text>`);
    return s;
  }
  function legendRow(s, items, x, y) {
    items.forEach(l => {
      if (l.k === 'dot') s.push(`<circle cx="${x + 7}" cy="${y - 4}" r="6" fill="${l.c}"/>`);
      else if (l.k === 'line') s.push(`<line x1="${x - 2}" y1="${y - 4}" x2="${x + 16}" y2="${y - 4}" stroke="${l.c}" stroke-width="2.5"${l.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
      else s.push(`<circle cx="${x + 7}" cy="${y - 4}" r="7" fill="none" stroke="${l.c}" stroke-width="2"/>`);
      s.push(`<text x="${x + 22}" y="${y + 1}" font-size="13" fill="${COLORS.ink}">${esc(l.t)}</text>`);
      x += 22 + l.t.length * 7.2 + 26;
    });
  }
  // Standardised effect of each factor with its 95% confidence interval
  function effectsSVG(m, o) {
    const W = drawW, ML = 300, MR = 40, rowH = 38, cs = m.coefs.slice(1);
    const MT = (o.title ? 58 : 18) + 34, plotH = cs.length * rowH, MB = 96, H = MT + plotH + MB, plotW = W - ML - MR, base = MT + plotH;
    const vals = cs.flatMap(c => [c.lo * c.scale, c.hi * c.scale]).concat([0]);
    const xt = niceTicks(...span(vals), 8), x0 = xt[0], x1 = xt[xt.length - 1];
    const X = v => ML + (v - x0) / (x1 - x0) * plotW;
    const s = svgOpen(W, H, o);
    legendRow(s, [{ c: COLORS.point, t: 'Clear link (p < 0.05)', k: 'dot' }, { c: COLORS.off, t: 'Could be chance', k: 'dot' }], ML, MT - 16);
    xt.forEach(v => {
      s.push(`<line x1="${X(v)}" y1="${MT}" x2="${X(v)}" y2="${base}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${X(v)}" y="${base + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    s.push(`<line x1="${X(0)}" y1="${MT}" x2="${X(0)}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    cs.forEach((c, i) => {
      const y = MT + i * rowH + rowH / 2, sig = c.p < 0.05, col = sig ? COLORS.point : COLORS.off;
      const tip = `${c.term.name}: standardised effect ${f2(c.b * c.scale)} (95% CI ${f2(c.lo * c.scale)} to ${f2(c.hi * c.scale)}), p = ${pText(c.p)}`;
      s.push(`<g><title>${esc(tip)}</title>`);
      s.push(`<text x="${ML - 14}" y="${y + 4}" font-size="13" text-anchor="end" fill="${COLORS.ink}"${sig ? ' font-weight="700"' : ''}>${esc(trunc(c.term.name, 40))}</text>`);
      s.push(`<line x1="${X(c.lo * c.scale)}" y1="${y}" x2="${X(c.hi * c.scale)}" y2="${y}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`);
      s.push(`<circle cx="${X(c.b * c.scale)}" cy="${y}" r="7" fill="${col}" stroke="#fff" stroke-width="1.5"/></g>`);
    });
    s.push(`<text x="${ML + plotW / 2}" y="${base + 46}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">Standardised effect on ${esc(trunc(o.yName, 60))}</text>`);
    s.push(`<text x="24" y="${H - 28}" font-size="12" fill="${COLORS.muted}">Change in the result, in standard deviations, for a 1 standard deviation rise in the factor, or for a category against its reference.</text>`);
    s.push(`<text x="24" y="${H - 11}" font-size="12" fill="${COLORS.muted}">Lines show 95% confidence intervals. A line that crosses zero means the factor's effect could be chance.</text>`);
    s.push('</svg>');
    return s.join('');
  }
  function pointsSVG(d, m, o, kind) {
    const W = drawW, ML = 80, MR = 30, plotH = 420;
    const MT = (o.title ? 58 : 18) + 30, MB = 66, H = MT + plotH + MB, plotW = W - ML - MR, base = MT + plotH;
    const ys = kind === 'fit' ? d.rows.map(r => r.y) : m.res;
    const xs = kind === 'order' ? d.rows.map((_, i) => i + 1) : m.pred;
    const xl = kind === 'order' ? 'Row (in the order pasted)' : 'Predicted ' + o.yName;
    const yl = kind === 'fit' ? 'Actual ' + o.yName : 'Difference (actual − predicted)';
    let [x0, x1] = span(kind === 'fit' ? xs.concat(ys) : xs), [y0, y1] = span(kind === 'fit' ? ys.concat(xs) : ys.concat([0, 2.5 * m.s, -2.5 * m.s]));
    if (kind === 'fit') { x0 = y0 = Math.min(x0, y0); x1 = y1 = Math.max(x1, y1); }
    if (kind === 'order') { x0 = Math.max(0, x0); }
    const xt = niceTicks(x0, x1, 8), yt = niceTicks(y0, y1, 6);
    x0 = xt[0]; x1 = xt[xt.length - 1]; y0 = yt[0]; y1 = yt[yt.length - 1];
    const X = v => ML + (v - x0) / (x1 - x0) * plotW, Y = v => base - (v - y0) / (y1 - y0) * plotH;
    const s = svgOpen(W, H, o);
    const leg = [{ c: COLORS.point, t: 'One row', k: 'dot' }];
    leg.push(kind === 'fit' ? { c: COLORS.line, t: 'Perfect prediction', k: 'line' } : { c: COLORS.line, t: 'No difference', k: 'line' });
    if (kind !== 'fit') leg.push({ c: COLORS.muted, t: '2.5 × typical error', k: 'line', dash: true });
    if (o.flagOdd && m.odd.some(Boolean)) leg.push({ c: COLORS.flag, t: 'Unusual', k: 'ring' });
    if (o.flagOdd && m.infl.some(Boolean)) leg.push({ c: COLORS.infl, t: 'Influential', k: 'ring' });
    legendRow(s, leg, ML, MT - 18);
    yt.forEach(v => {
      s.push(`<line x1="${ML}" y1="${Y(v)}" x2="${ML + plotW}" y2="${Y(v)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    xt.forEach(v => {
      s.push(`<line x1="${X(v)}" y1="${MT}" x2="${X(v)}" y2="${base}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${X(v)}" y="${base + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    if (kind === 'fit') s.push(`<line x1="${X(x0)}" y1="${Y(x0)}" x2="${X(x1)}" y2="${Y(x1)}" stroke="${COLORS.line}" stroke-width="2.5"/>`);
    else {
      s.push(`<line x1="${ML}" y1="${Y(0)}" x2="${ML + plotW}" y2="${Y(0)}" stroke="${COLORS.line}" stroke-width="2.5"/>`);
      [2.5, -2.5].forEach(z => s.push(`<line x1="${ML}" y1="${Y(z * m.s)}" x2="${ML + plotW}" y2="${Y(z * m.s)}" stroke="${COLORS.muted}" stroke-width="1.5" stroke-dasharray="6 4"/>`));
      if (kind === 'order') s.push(`<polyline points="${xs.map((x, i) => X(x) + ',' + Y(ys[i])).join(' ')}" fill="none" stroke="${COLORS.point}" stroke-opacity="0.45" stroke-width="1.5"/>`);
    }
    d.rows.forEach((r, i) => {
      const tip = `${r.label}: actual ${nf.format(r.y)}, predicted ${nf.format(m.pred[i])}, difference ${nf.format(m.res[i])}${m.odd[i] ? ', unusual' : ''}${m.infl[i] ? ', influential' : ''}`;
      s.push(`<g><title>${esc(tip)}</title><circle cx="${X(xs[i])}" cy="${Y(ys[i])}" r="5.5" fill="${COLORS.point}" fill-opacity="0.85" stroke="#fff" stroke-width="1.5"/>`);
      if (o.flagOdd && m.odd[i]) s.push(`<circle cx="${X(xs[i])}" cy="${Y(ys[i])}" r="10" fill="none" stroke="${COLORS.flag}" stroke-width="2.2"/>`);
      if (o.flagOdd && m.infl[i]) s.push(`<circle cx="${X(xs[i])}" cy="${Y(ys[i])}" r="13.5" fill="none" stroke="${COLORS.infl}" stroke-width="2.2"/>`);
      s.push('</g>');
    });
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<line x1="${ML}" y1="${base}" x2="${ML + plotW}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<text transform="translate(22 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(yl, 60))}</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${H - 16}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(xl, 90))}</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  const pText = p => p < 0.001 ? '< 0.001' : nf3.format(p);
  function chanceText(p) { return p < 0.001 ? 'less than 1 in 1,000' : p < 0.01 ? 'less than 1 in 100' : 'less than 1 in 20'; }
  function effectText(c, yn) {
    const t = c.term, up = c.b >= 0, amt = nf.format(Math.abs(c.b));
    if (t.kind === 'cat') return `${esc(yn)} is about ${amt} ${up ? 'higher' : 'lower'} when ${esc(lower(t.col.name))} is <b>${esc(t.level)}</b> rather than ${esc(t.ref)}`;
    return `each extra 1 of <b>${esc(lower(t.name))}</b> goes with ${up ? 'an increase' : 'a decrease'} of about ${amt} in ${esc(yn)}`;
  }
  function readingParts(d, m, yName) {
    const yn = lower(yName), cs = m.coefs.slice(1);
    const sig = cs.filter(c => c.p < 0.05).sort((a, b) => Math.abs(b.b * b.scale) - Math.abs(a.b * a.scale));
    const non = cs.filter(c => c.p >= 0.05);
    const paras = [], cautions = [];
    if (m.pF >= 0.05) paras.push(`Taken together, the factors don't predict ${yn} better than chance would (p = ${pText(m.pF)}). There is no clear evidence here that any of them is linked to ${yn}.`);
    else paras.push(`Together, the factors account for about ${Math.round(m.r2 * 100)}% of the variation in ${yn}; the rest comes from things not in the model. The chance of a fit this good in ${m.n} rows if none of the factors really mattered is ${chanceText(m.pF)}.`);
    if (sig.length) {
      paras.push(`Holding the other factors steady, ${sig.map(c => effectText(c, yn) + ` (95% confidence interval ${nf.format(c.lo)} to ${nf.format(c.hi)})`).join('; ')}.`);
      const sigNum = sig.filter(c => c.term.kind === 'num');
      if (sigNum.length > 1) paras.push(`Allowing for how much each one varies, a typical change in <b>${esc(lower(sigNum[0].term.name))}</b> makes the biggest difference to ${yn}.`);
    }
    if (non.length) paras.push(`There is no clear evidence of a link, once the other factors are allowed for, for ${non.map(c => `<b>${esc(c.term.name)}</b>`).join(', ')}. That doesn't prove ${non.length > 1 ? 'they make' : 'it makes'} no difference; the effect may be small or the data too few to show it.`);
    cautions.push('Regression shows association, not cause and effect. A factor you didn\'t measure may be driving the result. Test your theory with a PDSA cycle.');
    cautions.push('Each coefficient only describes the range of values you collected. Don\'t assume the pattern carries on beyond it.');
    const perTerm = m.n / m.k;
    if (perTerm < 10) cautions.push(`There are only ${nf.format(perTerm)} rows for each factor in the model. Aim for at least 10, or use fewer factors, otherwise the results can be unstable.`);
    const vif = cs.filter(c => c.vif > 5);
    if (vif.length) cautions.push(`${vif.map(c => esc(c.term.name)).join(', ')} ${vif.length > 1 ? 'are' : 'is'} strongly linked to the other factors (VIF above 5). The model struggles to separate overlapping factors, so ${vif.length > 1 ? 'their' : 'its'} coefficients are uncertain. Consider dropping one of a pair that measure much the same thing.`);
    if (m.dropped.length) cautions.push(`${m.dropped.map(t => esc(t.name)).join(', ')} ${m.dropped.length > 1 ? 'were' : 'was'} left out because ${m.dropped.length > 1 ? 'they add' : 'it adds'} nothing beyond the other factors (${m.dropped.length > 1 ? 'they are' : 'it is'} an exact combination of them).`);
    if (isFinite(m.dw) && m.n >= 15 && m.dw < 1.5) cautions.push(`If your rows are in time order, neighbouring rows tend to have similar differences from the prediction (Durbin–Watson ${f2(m.dw)}). Something that changes over time may be missing from the model, and the p-values will look more certain than they are. Check the result on an SPC chart.`);
    return { paras, cautions, sig, non };
  }
  function readingHTML(d, m, yName) {
    const r = readingParts(d, m, yName);
    let h = '<div class="reading"><h3>What the model shows</h3>' + r.paras.map(p => `<p>${p}</p>`).join('');
    h += '<div class="caution"><p><b>Before you act on it</b></p><ul>' + r.cautions.map(c => `<li>${c}</li>`).join('') + '</ul></div>';
    const odd = d.rows.filter((_, i) => m.odd[i]).map(x => x.label), infl = d.rows.filter((_, i) => m.infl[i]).map(x => x.label);
    if (odd.length) h += `<p class="flagnote">${odd.length} row${odd.length > 1 ? 's are' : ' is'} a long way from the prediction. Check for data errors or unusual circumstances: ${esc(odd.join(', '))}.</p>`;
    if (infl.length) h += `<p class="flagnote">${infl.length} row${infl.length > 1 ? 's have' : ' has'} a strong pull on the results: ${esc(infl.join(', '))}. Try the model without ${infl.length > 1 ? 'them' : 'it'} to see how much the answer changes.</p>`;
    return h + '</div>';
  }
  function summaryText() {
    const { d, m, yName } = current, r = readingParts(d, m, yName);
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [current.title || 'Multiple regression: ' + yName, '', `R² = ${Math.round(m.r2 * 100)}% (adjusted ${Math.round(m.adj * 100)}%), ${m.n} rows, ${m.k} factor${m.k > 1 ? 's' : ''}, p = ${pText(m.pF)}`, ''];
    r.paras.forEach(p => lines.push(strip(p), ''));
    lines.push('Before you act on it:'); r.cautions.forEach(c => lines.push('- ' + strip(c)));
    return lines.join('\n');
  }

  // ---- what if: predict the result for chosen factor values ----
  function whatIfHTML(d, m) {
    const cols = [...new Set(m.terms.map(t => t.col))];
    let h = '<div class="reading"><h3>Predict a result</h3><p class="hint">Choose values for each factor to see the result the model predicts, with the range a single new row would be expected to fall in 19 times out of 20.</p><div class="whatif">';
    cols.forEach(c => {
      const id = 'wi-' + c.i, key = c.name;
      if (c.kind === 'num') {
        const vals = d.rows.map(r => r.vals[c.i]);
        if (!(key in whatIf)) whatIf[key] = +avg(vals).toFixed(2);
        h += `<div><label for="${id}">${esc(c.name)}</label><input type="number" step="any" id="${id}" data-wi="${esc(key)}" value="${esc(whatIf[key])}"></div>`;
      } else {
        if (!c.levels.includes(whatIf[key])) whatIf[key] = c.ref;
        h += `<div><label for="${id}">${esc(c.name)}</label><select id="${id}" data-wi="${esc(key)}">${c.levels.map(l => `<option${l === whatIf[key] ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
      }
    });
    return h + '</div><p class="predout" id="predOut" aria-live="polite"></p></div>';
  }
  function updatePrediction() {
    const out = $('predOut'); if (!out || !current) return;
    const { m, yName } = current;
    const vals = {}; let ok = true; const outside = [];
    [...new Set(m.terms.map(t => t.col))].forEach(c => {
      const v = whatIf[c.name];
      if (c.kind === 'num') { const x = Number(v); if (v === '' || !isFinite(x)) ok = false; vals[c.i] = x; }
      else vals[c.i] = v;
    });
    if (!ok) { out.textContent = 'Enter a number for each factor.'; return; }
    const x0 = [1].concat(m.terms.map(t => termValue(t, vals)));
    const yhat = x0.reduce((s, a, j) => s + a * m.coefs[j].b, 0);
    let q = 0; for (let a = 0; a < x0.length; a++) for (let b = 0; b < x0.length; b++) q += x0[a] * m.C[a][b] * x0[b];
    const half = m.tc * m.s * Math.sqrt(1 + q);
    m.coefs.slice(1).forEach((c, j) => { if (c.term.kind === 'num' && (x0[j + 1] < c.min || x0[j + 1] > c.max)) outside.push(c.term.name); });
    out.innerHTML = `Predicted ${esc(lower(yName))}: <strong>${nf.format(yhat)}</strong> <span style="color:var(--muted)">(likely range ${nf.format(yhat - half)} to ${nf.format(yhat + half)})</span>` +
      (outside.length ? `<br><span class="flagnote">${esc(outside.join(', '))} ${outside.length > 1 ? 'are' : 'is'} outside the values in your data, so treat this prediction with caution.</span>` : '');
  }

  // ---- model picker ----
  function syncPicker(text, hasHeader) {
    const s = split(text);
    const cols = s ? classify(s.recs, s.delim, hasHeader) : [];
    const sig = cols.map(c => c.kind + ':' + c.name).join('|');
    const usable = cols.filter(c => c.kind === 'num' || c.kind === 'cat');
    const nums = cols.filter(c => c.kind === 'num');
    if (sig !== colSig) {
      const prevY = els.yCol.value, prevName = els.yCol.selectedOptions[0] ? els.yCol.selectedOptions[0].textContent : '';
      const prevUse = {};
      els.picker.querySelectorAll('input').forEach(i => { prevUse[i.dataset.name] = i.checked; });
      colSig = sig;
      els.yCol.innerHTML = nums.map(c => `<option value="${c.i}">${esc(c.name)}</option>`).join('');
      const keepY = nums.find(c => c.name === prevName) || nums.find(c => String(c.i) === prevY);
      if (keepY) els.yCol.value = String(keepY.i); else if (nums.length) els.yCol.value = String(nums[nums.length - 1].i);
      els.picker.innerHTML = usable.map(c => `<label class="check"><input type="checkbox" id="use-${c.i}" data-col="${c.i}" data-name="${esc(c.name)}"${prevUse[c.name] === false ? '' : ' checked'}> <span>${esc(c.name)} <span class="kind">${c.kind === 'cat' ? '(categories)' : ''}</span></span></label>`).join('');
    }
    const y = els.yCol.value;
    els.picker.querySelectorAll('input').forEach(i => {
      const isY = i.dataset.col === y;
      i.disabled = isY;
      i.closest('label').classList.toggle('off', isY);
      i.closest('label').hidden = isY;
    });
    els.modelBlock.hidden = nums.length < 1 || usable.length < 2;
    return { cols, nums, usable };
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    if (!headerTouched) els.hasHeader.checked = headerGuess(text);
    const pk = syncPicker(text, els.hasHeader.checked);
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to build your model.'); }
    if (!pk.nums.length || pk.usable.length < 2) { els.detected.textContent = 'Couldn’t find a column of numbers and at least one factor.'; return renderEmpty('Paste a column of numbers for the result and one or more columns for the factors.'); }
    const yIdx = Number(els.yCol.value);
    const useSet = new Set([...els.picker.querySelectorAll('input:checked:not(:disabled)')].map(i => Number(i.dataset.col)));
    const d = build(text, els.hasHeader.checked, yIdx, useSet);
    const nCat = d.xs.filter(c => c.kind === 'cat').length;
    let note = `Reading ${d.rows.length} row${d.rows.length === 1 ? '' : 's'} and ${d.xs.length} factor${d.xs.length === 1 ? '' : 's'}${nCat ? ` (${nCat} with categories)` : ''}.`;
    if (d.skipped) note += ` ${d.skipped} row${d.skipped > 1 ? 's' : ''} skipped (a value was missing or wasn’t a number).`;
    els.detected.textContent = note;
    if (!d.xs.length) return renderEmpty('Tick at least one factor to include in the model.');
    const m = fit(d);
    if (m.bad === 'few') return renderEmpty(`With ${d.terms.length} factor term${d.terms.length > 1 ? 's' : ''} you need at least ${m.need} complete rows, and ideally 10 or more for each factor.`);
    if (m.bad === 'flaty') return renderEmpty('Every value of the result is the same, so there’s nothing to explain.');
    if (m.bad) return renderEmpty('The factors you chose don’t vary, so there’s nothing to compare. Each factor needs at least two different values.');

    const title = els.title.value.trim();
    const yName = d.yc.name;
    const nSig = m.coefs.slice(1).filter(c => c.p < 0.05).length;
    const headline = m.pF >= 0.05 ? '<strong>No clear link</strong> between these factors and the result'
      : `The factors explain <strong>${Math.round(m.r2 * 100)}%</strong> of the variation in ${esc(lower(yName))}`;
    const sub = m.pF >= 0.05 ? `R² = ${Math.round(m.r2 * 100)}% across ${m.n} rows, which could easily be chance.`
      : `${nSig} of ${m.k} factor${m.k > 1 ? 's show' : ' shows'} a clear link once the others are allowed for. ${m.n} rows.`;
    if (!CHARTS[chartType]) chartType = 'effects';
    const o = { title, yName, flagOdd: els.flagOdd.checked, aria: (title ? title + '. ' : '') + `${CHARTS[chartType]} for a regression of ${yName} on ${m.k} factors. R squared ${Math.round(m.r2 * 100)}%, ${m.n} rows.` };
    const svg = drawShown(() => chartType === 'effects' ? effectsSVG(m, o) : pointsSVG(d, m, o, chartType));
    trackChart({ points: d.rows.length, factors: d.xs.length });
    current = { d, m, title, yName };

    const cs = m.coefs;
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${Math.round(m.r2 * 100)}%</b><span>R² (variation explained)</span></div>
        <div class="stat"><b>${Math.round(m.adj * 100)}%</b><span>Adjusted R²</span></div>
        <div class="stat"><b>${pText(m.pF)}</b><span>p-value for the model</span></div>
        <div class="stat"><b>${nf.format(m.s)}</b><span>Typical prediction error</span></div>
      </div>
      <div class="chartbar"><div class="block"><label for="chartType">Chart</label><select id="chartType">${Object.keys(CHARTS).map(k => `<option value="${k}"${k === chartType ? ' selected' : ''}>${CHARTS[k]}</option>`).join('')}</select></div></div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      ${readingHTML(d, m, yName)}
      <div class="tablewrap">
        <table>
          <caption class="sr">Regression coefficients</caption>
          <thead><tr><th>Term</th><th class="num">Coefficient</th><th class="num">95% CI</th><th class="num">Std. error</th><th class="num">t</th><th class="num">p</th><th class="num">Std. effect</th><th class="num">VIF</th></tr></thead>
          <tbody>${cs.map((c, j) => `<tr>
            <td${j && c.p < 0.05 ? ' class="sig"' : ''}>${j ? esc(c.term.name) + (c.term.kind === 'cat' ? ` <span class="kind" style="color:var(--muted)">vs ${esc(c.term.ref)}</span>` : '') : 'Intercept'}</td>
            <td class="num">${nf3.format(c.b)}</td><td class="num">${nf3.format(c.lo)} to ${nf3.format(c.hi)}</td><td class="num">${nf3.format(c.se)}</td>
            <td class="num">${f2(c.t)}</td><td class="num">${pText(c.p)}</td><td class="num">${j ? f2(c.b * c.scale) : '–'}</td><td class="num">${j ? f2(c.vif) : '–'}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th colspan="8">F = ${f2(m.F)} on ${m.k} and ${m.df} degrees of freedom · R² = ${f2(m.r2)} · adjusted R² = ${f2(m.adj)} · residual standard error ${nf3.format(m.s)}${isFinite(m.dw) ? ` · Durbin–Watson ${f2(m.dw)}` : ''}</th></tr></tfoot>
        </table>
      </div>
      ${whatIfHTML(d, m)}
      <details class="values"><summary>Show each row with its prediction</summary>
      <div class="tablewrap">
        <table>
          <thead><tr><th class="num">#</th><th>${esc(d.labelCol ? d.labelCol.name : 'Row')}</th><th class="num">Actual</th><th class="num">Predicted</th><th class="num">Difference</th><th class="num">Standardised difference</th><th class="num">Cook’s distance</th></tr></thead>
          <tbody>${d.rows.map((r, i) => `<tr${m.odd[i] || m.infl[i] ? ' class="odd"' : ''}>
            <td class="num">${i + 1}</td><td>${esc(r.label)}${m.odd[i] ? '<span class="sr"> (unusual)</span>' : ''}${m.infl[i] ? '<span class="sr"> (influential)</span>' : ''}</td>
            <td class="num">${nf.format(r.y)}</td><td class="num">${nf.format(m.pred[i])}</td><td class="num">${nf.format(m.res[i])}</td><td class="num">${f2(m.stud[i])}</td><td class="num">${f2(m.cook[i])}</td></tr>`).join('')}
          </tbody>
        </table>
      </div></details>`;
    updatePrediction();
  }
  function renderEmpty(msg) {
    current = null;
    els.result.innerHTML = `<div class="empty"><p>${esc(msg)}</p><button type="button" class="primary" data-act="example">Try the example</button></div>`;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 180); }

  // ---- exports ----
  // Exports use the standard drawing, whatever the size on screen
  function svgEl() {
    if (!document.querySelector('#chart svg')) return null;
    const svg = svgOf(drawAt(BASE_W, lastChart));
    if (!svg) return document.querySelector('#chart svg');
    const d = document.createElement('div');
    d.innerHTML = svg;
    return d.firstElementChild;
  }
  function fileName() { return slug(current && current.title); }
  let dlPromise = null;
  function getDownloads() {
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(undefined);
    if (!dlPromise) dlPromise = window.claude.use('downloads').catch(() => null);
    return dlPromise;
  }
  async function downloadBlob(blob, name) {
    const d = await getDownloads();
    if (d) { const r = await d.save({ filename: name, data: blob }); return r && r.status !== 'declined'; }
    return FocusActions.saveFile(name, blob);
  }
  function status(msg) { FocusActions.say(msg); }
  function toPNG(cb) {
    const svg = svgEl(); if (!svg) return;
    const vb = svg.viewBox.baseVal, scale = 2;
    const str = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = vb.width * scale; c.height = vb.height * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.onerror = () => status('Could not create the image.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }
  function tableRows() {
    const { d, m } = current;
    const r4 = v => Math.round(v * 10000) / 10000;
    const out = [['Term', 'Reference', 'Coefficient', 'CI lower (95%)', 'CI upper (95%)', 'Std. error', 't', 'p-value', 'Standardised effect', 'VIF']];
    m.coefs.forEach((c, j) => out.push([j ? c.term.name : 'Intercept', j && c.term.kind === 'cat' ? c.term.ref : '', r4(c.b), r4(c.lo), r4(c.hi), r4(c.se), r4(c.t), r4(c.p), j ? r4(c.b * c.scale) : '', j ? r4(c.vif) : '']));
    out.push([], ['R squared', r4(m.r2)], ['Adjusted R squared', r4(m.adj)], ['F', r4(m.F)], ['Model p-value', r4(m.pF)], ['Residual standard error', r4(m.s)], ['Durbin-Watson', isFinite(m.dw) ? r4(m.dw) : ''], ['Rows', m.n], ['Factor terms', m.k], []);
    out.push(['#', d.labelCol ? d.labelCol.name : 'Row', 'Actual ' + d.yc.name, 'Predicted', 'Difference', 'Standardised difference', "Cook's distance", 'Unusual', 'Influential']);
    d.rows.forEach((r, i) => out.push([i + 1, r.label, r.y, r4(m.pred[i]), r4(m.res[i]), r4(m.stud[i]), r4(m.cook[i]), m.odd[i] ? 'Yes' : 'No', m.infl[i] ? 'Yes' : 'No']));
    return out;
  }
  const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }
  const saved = (ok, msg) => status(ok ? msg : 'Download cancelled.');
  const failed = () => status('The file couldn’t be saved here. Try Copy instead.');
  function act(a) {
    if (a === 'example') return loadExample();
    if (!current) return;
    if (a === 'png') toPNG(b => downloadBlob(b, fileName() + '.png').then(ok => saved(ok, 'PNG downloaded.'), failed));
    if (a === 'svg') downloadBlob(new Blob([new XMLSerializer().serializeToString(svgEl())], { type: 'image/svg+xml' }), fileName() + '.svg').then(ok => saved(ok, 'SVG downloaded.'), failed);
    if (a === 'copyimg') {
      if (!(navigator.clipboard && window.ClipboardItem)) return status('Your browser can’t copy images — use Download PNG.');
      toPNG(async b => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); status('Chart copied — paste it into PowerPoint or Word.'); }
        catch (e) { status('Copy was blocked — use Download PNG.'); }
      });
    }
    if (a === 'csv') downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '.csv').then(ok => saved(ok, 'Table downloaded.'), failed);
    if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => status(ok ? 'Table copied — paste it into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Summary copied.' : 'Copy was blocked.'));
  }
  function loadExample() {
    els.data.value = exampleText();
    els.title.value = 'What drives time to be seen in ED (example)';
    headerTouched = false; colSig = ''; whatIf = {}; chartType = 'effects';
    els.picker.innerHTML = ''; els.yCol.innerHTML = '';
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', () => { whatIf = {}; schedule(); });
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  els.title.addEventListener('input', schedule);
  els.yCol.addEventListener('change', () => { whatIf = {}; update(); });
  els.picker.addEventListener('change', update);
  els.flagOdd.addEventListener('change', update);
  $('exampleBtn2').addEventListener('click', loadExample);
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; headerTouched = false; els.hasHeader.checked = false; colSig = ''; whatIf = {}; els.picker.innerHTML = ''; els.yCol.innerHTML = ''; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  trackSettings({ highlightUnusual: 'flagOdd', chartType: 'chartType' });
  els.result.addEventListener('change', e => { if (e.target.id === 'chartType') { chartType = e.target.value; update(); } });
  els.result.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.wi; if (k) { whatIf[k] = e.target.value; updatePrediction(); } });
  els.result.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.wi; if (k) { whatIf[k] = e.target.value; updatePrediction(); } });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'multiple_regression', toolName: 'multiple regression',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ chartType, whatIf }),
    setExtra: x => { if (x) { if (CHARTS[x.chartType]) chartType = x.chartType; if (x.whatIf) whatIf = Object.assign({}, x.whatIf); } },
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

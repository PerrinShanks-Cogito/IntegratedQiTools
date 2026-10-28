/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), mode: $('mode'), alpha: $('alpha'),
    title: $('title'), valLabel: $('valLabel'), order: $('order'), swap: $('swap'), swapWrap: $('swapWrap'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', bar: '#005EB8', expected: '#ED8B00' };
  const SERIES = ['#005EB8', '#AE2573', '#007F3B', '#ED8B00', '#330072', '#00A499', '#768692', '#DA291C', '#41B6E6', '#8A1538'];
  const DARK_TEXT = new Set(['#ED8B00', '#00A499', '#768692', '#41B6E6']);
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
  const MAX_ROWS = 30, MAX_COLS = 10, MAX_CATS = 40;

  let headerTouched = false;
  let modeTouched = false;
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

  // Examples (made-up data)
  const EXAMPLE = [
    'Ward\tWithin 6 hours\tLate\tNot done',
    'Ward A\t82\t12\t6',
    'Ward B\t51\t17\t12',
    'Ward C\t108\t9\t3',
    'Ward D\t40\t17\t13'
  ].join('\n');
  const EXAMPLE_GOF = [
    'Day\tFalls',
    'Monday\t17', 'Tuesday\t15', 'Wednesday\t16', 'Thursday\t13', 'Friday\t15', 'Saturday\t28', 'Sunday\t31'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chi-squared';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const pf = p => p == null ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3);
  const pIs = p => p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
  const pct = a => Math.round((1 - a) * 100) + '%';
  const share = x => isFinite(x) ? Math.round(x * 100) + '%' : '–';


  // ---- parsing ----
  // "table": category names down the first column, then columns of counts.
  // "grid": columns of counts with no names.
  // "records": one row per person or event, with one or two category columns and an optional count column.
  function shape(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    const numeric = [];
    for (let c = 0; c < ncol; c++) numeric.push(numShare(recs, c, delim) >= 0.6);
    const unique = c => recs.length > 2 && !recs.slice(1).some(r => (r[c] || '').toLowerCase() === (recs[0][c] || '').toLowerCase());
    if (numeric.every(Boolean)) {
      return { kind: 'grid', ncol, headerGuess: recs.length > 1 && recs[0].some(v => v !== '' && !isNum(v, delim)) };
    }
    if (!numeric[0] && ncol >= 2 && numeric.slice(1).every(Boolean)) {
      return { kind: 'table', ncol, headerGuess: recs.length > 1 && recs[0].slice(1).some(v => v !== '' && !isNum(v, delim)) };
    }
    const cats = ncol >= 2 && !numeric[1] ? 2 : 1;
    const weight = ncol > cats && numeric[ncol - 1];
    const headerGuess = weight ? recs.length > 1 && !isNum(recs[0][ncol - 1], delim) : [...Array(cats).keys()].every(unique);
    return { kind: 'records', ncol, cats, weight, headerGuess };
  }
  function suggestMode(sh) {
    if (sh.kind === 'records') return sh.cats === 1 ? 'gof' : 'independence';
    const countCols = sh.kind === 'table' ? sh.ncol - 1 : sh.ncol;
    return countCols === 1 ? 'gof' : 'independence';
  }

  // Keeps names in order of first appearance, merging repeats (ignoring case and spacing).
  function keyer() {
    const map = new Map(), names = [];
    return {
      names,
      get(name) {
        name = (name || '').trim() || '(blank)';
        const k = name.toLowerCase().replace(/\s+/g, ' ');
        if (!map.has(k)) { map.set(k, names.length); names.push(name); }
        return map.get(k);
      }
    };
  }

  function parse(text, hasHeader, mode) {
    const s = split(text);
    if (!s) return null;
    const { recs, delim } = s;
    const sh = shape(recs, delim);
    const head = hasHeader ? recs[0] : null;
    const body = hasHeader ? recs.slice(1) : recs;
    const out = { kind: sh.kind, ncol: sh.ncol, skipped: 0, negative: 0, notes: [] };
    const cell = raw => {
      if (raw === undefined || raw === '') return 0;
      const v = num(raw, delim);
      if (!isFinite(v)) { out.skipped++; return 0; }
      if (v < 0) { out.negative++; return 0; }
      return v;
    };
    if (mode === 'independence') {
      out.rowName = 'Group'; out.colName = 'Category';
      if (sh.kind === 'records') {
        if (sh.cats < 2) { out.error = 'A test of independence needs a column for each person’s group and a column for their category. To compare one column of categories with an expected split, choose “Compare with an expected split” under Test.'; return out; }
        const R = keyer(), C = keyer(), cells = new Map();
        for (const r of body) {
          const w = sh.weight ? cell(r[sh.ncol - 1]) : 1;
          const i = R.get(r[0]), j = C.get(r[1]), k = i + ',' + j;
          cells.set(k, (cells.get(k) || 0) + w);
        }
        out.rows = R.names; out.cols = C.names;
        out.obs = R.names.map((_, i) => C.names.map((_, j) => cells.get(i + ',' + j) || 0));
        if (head) { out.rowName = head[0] || out.rowName; out.colName = head[1] || out.colName; }
        if (sh.ncol > (sh.weight ? 3 : 2)) out.notes.push('Only the first two columns' + (sh.weight ? ' and the last' : '') + ' are used.');
      } else {
        const first = sh.kind === 'table' ? 1 : 0;
        if (sh.ncol - first < 2) { out.error = 'A test of independence needs at least two columns of counts. To compare one column of counts with an expected split, choose “Compare with an expected split” under Test.'; return out; }
        const R = keyer(), rowsObs = [];
        body.forEach((r, n) => {
          const i = R.get(first ? r[0] : 'Row ' + (n + 1));
          if (!rowsObs[i]) rowsObs[i] = new Array(sh.ncol - first).fill(0);
          for (let c = first; c < sh.ncol; c++) rowsObs[i][c - first] += cell(r[c]);
        });
        out.rows = R.names; out.obs = rowsObs;
        out.cols = [];
        for (let c = first; c < sh.ncol; c++) out.cols.push((head && head[c]) || 'Column ' + (c + 1));
        if (head && first && head[0]) out.rowName = head[0];
      }
    } else {
      out.catName = 'Category';
      const K = keyer(), obs = [], exp = [];
      let hasExp = false;
      if (sh.kind === 'records') {
        for (const r of body) {
          const i = K.get(r[0]);
          obs[i] = (obs[i] || 0) + (sh.weight ? cell(r[sh.ncol - 1]) : 1);
        }
        if (head && head[0]) out.catName = head[0];
        if (sh.cats > 1) out.notes.push('Only the first column of categories is used.');
      } else {
        const first = sh.kind === 'table' ? 1 : 0;
        hasExp = sh.ncol - first >= 2;
        let blankExp = 0;
        body.forEach((r, n) => {
          const i = K.get(first ? r[0] : 'Category ' + (n + 1));
          obs[i] = (obs[i] || 0) + cell(r[first]);
          if (hasExp) {
            if (r[first + 1] === undefined || r[first + 1] === '') blankExp++;
            exp[i] = (exp[i] || 0) + cell(r[first + 1]);
          }
        });
        if (blankExp) { out.error = `${blankExp} row${blankExp > 1 ? 's have' : ' has'} no expected count. Fill in the expected column for every category, or remove it to expect an equal split.`; return out; }
        if (head && first && head[0]) out.catName = head[0];
        if (sh.ncol - first > 2) out.notes.push('Only the first two columns of numbers are used.');
      }
      out.cats = K.names; out.obs = obs.map(v => v || 0); out.exp = hasExp ? exp.map(v => v || 0) : null;
    }
    return out;
  }

  // ---- distributions ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { lgamma, chiP, zCrit, sum, splitTable: split, readNumber: num, isNumberCell: isNum, numericShare: numShare } = FocusStats;

  // Fisher's exact test for a 2 × 2 table (two-sided, summing tables no more likely than the one observed).
  function fisher(t) {
    const [[a, b], [c, d]] = t;
    const r1 = a + b, r2 = c + d, c1 = a + c, c2 = b + d, N = r1 + r2;
    const lf = n => lgamma(n + 1);
    const base = lf(r1) + lf(r2) + lf(c1) + lf(c2) - lf(N);
    const lp = x => base - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x);
    const obs = lp(a);
    let p = 0;
    for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const l = lp(x); if (l <= obs + 1e-7) p += Math.exp(l); }
    return Math.min(1, p);
  }
  function strength(v, dfmin) {
    const s = Math.sqrt(Math.max(1, dfmin));
    return v < 0.1 / s ? 'very weak' : v < 0.3 / s ? 'weak' : v < 0.5 / s ? 'moderate' : 'strong';
  }

  // ---- statistics ----
  function independence(rows, cols, obs, alpha) {
    const r = rows.length, c = cols.length;
    const rt = obs.map(sum), ct = cols.map((_, j) => sum(obs.map(row => row[j]))), N = sum(rt);
    const E = rt.map(a => ct.map(b => a * b / N));
    let chi2 = 0;
    const cells = [];
    obs.forEach((row, i) => row.forEach((o, j) => {
      const e = E[i][j], d = o - e;
      chi2 += d * d / e;
      const z = d / Math.sqrt(e * (1 - rt[i] / N) * (1 - ct[j] / N));
      cells.push({ i, j, o, e, z: isFinite(z) ? z : 0 });
    }));
    const df = (r - 1) * (c - 1), p = chiP(chi2, df);
    const dfmin = Math.min(r, c) - 1, V = Math.sqrt(chi2 / (N * dfmin));
    const m = r === 2 && c === 2 ? 1 : r * c;      // every cell of a 2 × 2 table has the same residual
    const crit = zCrit(alpha / m);
    cells.forEach(x => { x.out = Math.abs(x.z) > crit; });
    const flatE = E.flat(), small = flatE.filter(e => e < 5).length, minE = Math.min(...flatE);
    const cochranOK = minE >= 1 && small <= 0.2 * flatE.length;
    const whole = obs.flat().every(v => Number.isInteger(v));
    const fish = r === 2 && c === 2 && whole ? fisher(obs) : null;
    const useFisher = fish != null && !cochranOK;
    return { r, c, rt, ct, N, E, chi2, df, p, V, dfmin, crit, cells, small, minE, cochranOK, whole, fish, useFisher, pMain: useFisher ? fish : p };
  }
  function goodness(cats, obs, w, alpha) {
    const k = cats.length, N = sum(obs), W = sum(w);
    const E = w.map(x => N * x / W);
    let chi2 = 0;
    const cells = obs.map((o, i) => {
      const e = E[i], d = o - e;
      chi2 += d * d / e;
      const z = d / Math.sqrt(e * (1 - w[i] / W));
      return { i, o, e, z: isFinite(z) ? z : 0 };
    });
    const df = k - 1, p = chiP(chi2, df), effect = Math.sqrt(chi2 / N);
    const crit = zCrit(alpha / (k === 2 ? 1 : k));
    cells.forEach(x => { x.out = Math.abs(x.z) > crit; });
    const small = E.filter(e => e < 5).length, minE = Math.min(...E);
    const cochranOK = minE >= 1 && small <= 0.2 * k;
    return { k, N, E, chi2, df, p, effect, crit, cells, small, minE, cochranOK, whole: obs.every(v => Number.isInteger(v)), pMain: p };
  }

  // ---- axis ----
  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function axis(lo, hi) {
    if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep(hi - lo, 6);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = a; t <= b + step / 2; t += step) ticks.push(+t.toPrecision(12));
    return { min: a, max: b, ticks };
  }

  // ---- drawing ----
  const charW = size => size * 0.56;
  const f = v => Math.round(v * 10) / 10;
  const arrow = x => x.out ? (x.z > 0 ? '▲ ' : '▼ ') : '';
  function svgOpen(s, W, H, o) {
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="16" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (16) - 16) / 11.2))))}</text>`);
  }
  // Legend items laid out left to right, wrapping onto new lines; returns the number of lines.
  function legendLayout(items, x0, maxX) {
    const keyW = t => 26 + charW(12) * t.length + 18;
    let x = x0, line = 0;
    const placed = items.map(it => {
      const w = keyW(it.text);
      if (x + w > maxX && x > x0) { x = x0; line++; }
      const p = Object.assign({ x, line }, it); x += w; return p;
    });
    return { placed, lines: line + 1 };
  }

  // Independence: one 100% bar for each group, split by category, with an overall bar for comparison.
  function renderTable(o) {
    const { rows, cols, obs } = o.table, t = o.t;
    const W = drawW, M = 16;
    const longest = Math.max(...rows.map(r => r.length), 7);
    const ML = Math.min(230, Math.max(90, charW(13) * Math.min(longest, 34) + 26)), MR = 84;
    const plotW = W - ML - MR;
    const items = cols.map((c, j) => ({ kind: 'sw', color: SERIES[j], text: trunc(c, 30) }));
    items.push({ kind: 'out', text: 'Outlined: stands out from the overall split' });
    const titleH = o.title ? 44 : 8;
    const lg = legendLayout(items, M, W - M);
    const MT = titleH + lg.lines * 22 + 18;
    const barH = 28, gap = 12, extra = 18;
    const plotH = rows.length * (barH + gap) + extra + barH;
    const H = MT + plotH + 34 + M;
    const x = v => ML + v * plotW;

    const s = [];
    svgOpen(s, W, H, o);
    lg.placed.forEach(it => {
      const ly = titleH + 14 + it.line * 22;
      if (it.kind === 'sw') s.push(`<rect x="${f(it.x)}" y="${ly - 6}" width="14" height="14" rx="2" fill="${it.color}"/>`);
      else s.push(`<rect x="${f(it.x)}" y="${ly - 6}" width="14" height="14" rx="2" fill="#ffffff" stroke="${COLORS.ink}" stroke-width="2.5"/>`);
      s.push(`<text x="${f(it.x + 22)}" y="${ly + 5}" font-size="12" fill="${COLORS.muted}">${esc(it.text)}</text>`);
    });
    for (let v = 0; v <= 100; v += 20) {
      const xx = f(x(v / 100));
      s.push(`<line x1="${xx}" y1="${MT - 4}" x2="${xx}" y2="${MT + plotH}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${xx}" y="${MT + plotH + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${v}%</text>`);
    }
    const bar = (yy, name, counts, total, cellsFor, bold) => {
      s.push(`<text x="${ML - 10}" y="${f(yy + barH / 2 + 4.5)}" font-size="13" font-weight="${bold ? 800 : 600}" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(name, Math.floor((ML - 20) / charW(13))))}</text>`);
      let acc = 0;
      counts.forEach((cnt, j) => {
        const fr = total > 0 ? cnt / total : 0, x0 = x(acc), w = fr * plotW;
        acc += fr;
        if (w <= 0) return;
        const col = SERIES[j], c = cellsFor ? cellsFor[j] : null;
        const tip = `${name}, ${cols[j]}: ${nf.format(cnt)} of ${nf.format(total)} (${share(fr)})` + (c ? `, expected ${nf1.format(c.e)}` : '');
        s.push(`<g><title>${esc(tip)}</title><rect x="${f(x0)}" y="${f(yy)}" width="${f(w)}" height="${barH}" fill="${col}" stroke="#ffffff" stroke-width="1"/>`);
        if (c && c.out) s.push(`<rect x="${f(x0 + 1.5)}" y="${f(yy + 1.5)}" width="${f(Math.max(0, w - 3))}" height="${barH - 3}" fill="none" stroke="${COLORS.ink}" stroke-width="2.5"/>`);
        const label = (c ? arrow(c) : '') + share(fr);
        if (w > charW(12) * label.length + 10) s.push(`<text x="${f(x0 + w / 2)}" y="${f(yy + barH / 2 + 4.5)}" font-size="12" font-weight="700" text-anchor="middle" fill="${DARK_TEXT.has(col) ? COLORS.ink : '#ffffff'}">${esc(label)}</text>`);
        s.push('</g>');
      });
      s.push(`<text x="${W - MR + 8}" y="${f(yy + barH / 2 + 4.5)}" font-size="12" fill="${COLORS.muted}">n = ${esc(nf.format(total))}</text>`);
    };
    rows.forEach((name, i) => bar(MT + i * (barH + gap), name, obs[i], t.rt[i], t.cells.filter(c => c.i === i).sort((a, b) => a.j - b.j), false));
    const oy = MT + rows.length * (barH + gap) + extra;
    s.push(`<line x1="${M}" y1="${f(oy - extra / 2 - gap / 2)}" x2="${W - M}" y2="${f(oy - extra / 2 - gap / 2)}" stroke="${COLORS.axis}" stroke-dasharray="4 3"/>`);
    bar(oy, 'Overall', t.ct, t.N, null, true);
    s.push('</svg>');
    return s.join('');
  }

  // Goodness of fit: observed counts as bars, with the expected count marked on each.
  function renderFit(o) {
    const { cats, obs } = o.fit, t = o.t;
    const W = drawW, M = 16, k = cats.length;
    const MT = (o.title ? 44 : 8) + 34;
    const ML = 72 + (o.valName ? 22 : 0), MR = 24;
    const plotW = W - ML - MR, band = plotW / k, bw = Math.max(6, Math.min(70, band * 0.6));
    const longest = Math.max(...cats.map(c => c.length));
    const rotate = charW(13) * Math.min(longest, 28) > band - 8;
    const labelH = rotate ? Math.min(140, 18 + charW(13) * Math.min(longest, 22) * 0.64) + 18 : 30;
    const plotH = 380, H = MT + plotH + labelH + M;
    const ax = axis(0, Math.max(...obs, ...t.E) * 1.08);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;

    const s = [];
    svgOpen(s, W, H, o);
    const items = [{ kind: 'bar', text: 'Observed count' }, { kind: 'exp', text: 'Expected count' }, { kind: 'out', text: 'Outlined: stands out from expected' }];
    const lg = legendLayout(items, 0, W);
    const total = lg.placed[lg.placed.length - 1].x + 26 + charW(12) * items[items.length - 1].text.length;
    const shift = W - MR - total, ly = MT - 18;
    lg.placed.forEach(it => {
      const lx = it.x + shift;
      if (it.kind === 'bar') s.push(`<rect x="${f(lx)}" y="${ly - 7}" width="14" height="14" rx="2" fill="${COLORS.bar}"/>`);
      if (it.kind === 'exp') s.push(`<line x1="${f(lx - 2)}" y1="${ly}" x2="${f(lx + 16)}" y2="${ly}" stroke="${COLORS.expected}" stroke-width="3" stroke-dasharray="5 3"/>`);
      if (it.kind === 'out') s.push(`<rect x="${f(lx)}" y="${ly - 7}" width="14" height="14" rx="2" fill="#ffffff" stroke="${COLORS.ink}" stroke-width="2.5"/>`);
      s.push(`<text x="${f(lx + 22)}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">${esc(it.text)}</text>`);
    });
    ax.ticks.forEach(tk => {
      const yy = f(y(tk));
      s.push(`<line x1="${ML}" y1="${yy}" x2="${W - MR}" y2="${yy}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${yy + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(nf.format(tk))}</text>`);
    });
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    if (o.valName) s.push(`<text transform="translate(${M + 6} ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.valName, 50))}</text>`);
    cats.forEach((name, i) => {
      const c = t.cells[i], cx = ML + band * (i + 0.5), top = y(c.o), base = y(0);
      s.push(`<g><title>${esc(`${name}: ${nf.format(c.o)} observed, ${nf1.format(c.e)} expected`)}</title>`);
      s.push(`<rect x="${f(cx - bw / 2)}" y="${f(top)}" width="${f(bw)}" height="${f(base - top)}" fill="${COLORS.bar}"/>`);
      if (c.out) s.push(`<rect x="${f(cx - bw / 2 + 1.5)}" y="${f(top + 1.5)}" width="${f(bw - 3)}" height="${f(Math.max(0, base - top - 3))}" fill="none" stroke="${COLORS.ink}" stroke-width="2.5"/>`);
      const ey = f(y(c.e));
      s.push(`<line x1="${f(cx - bw / 2 - 6)}" y1="${ey}" x2="${f(cx + bw / 2 + 6)}" y2="${ey}" stroke="${COLORS.expected}" stroke-width="3" stroke-dasharray="6 3"/>`);
      const ty = Math.min(top, y(c.e)) - 8;
      s.push(`<text x="${f(cx)}" y="${f(ty)}" font-size="12" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(arrow(c) + nf.format(c.o))}</text>`);
      s.push('</g>');
      const lyy = MT + plotH + 18;
      if (rotate) s.push(`<text transform="translate(${f(cx + 4)} ${lyy}) rotate(-40)" font-size="13" font-weight="600" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(name, 22))}</text>`);
      else s.push(`<text x="${f(cx)}" y="${lyy}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(name, Math.max(3, Math.floor((band - 6) / charW(13)))))}</text>`);
    });
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function readingParts() {
    const { o, t } = current;
    const unit = o.valName ? ' ' + esc(lower(o.valName)) : '';
    const paras = [];
    const sig = t.pMain < o.alpha;
    const chiText = `χ²(${t.df}) = ${nf.format(t.chi2)}, ${pIs(t.p)}`;
    const chance = `would happen less than ${Math.round(o.alpha * 100)}% of the time`;
    let standouts = t.cells.filter(c => c.out).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    if (o.mode === 'independence') {
      const { rows, cols } = o.table;
      const test = t.useFisher ? `Fisher’s exact test, ${pIs(t.fish)}` : chiText;
      paras.push(sig
        ? `<b>There is evidence that the split across categories differs between the groups</b> (${test}). Differences this large ${chance} if every group really had the same split.`
        : `<b>There isn’t enough evidence that the split across categories differs between the groups</b> (${test}). The differences you can see could well be down to chance. That doesn’t prove the groups are the same: with more data a real but small difference might show up.`);
      paras.push(`The difference is ${strength(t.V, t.dfmin)} (Cramér’s V = ${nf.format(t.V)}, on a scale from 0 for no difference to 1 for groups that don’t overlap at all).`);
      // In a 2 × 2 table every cell stands out together, so name only the ones above expected.
      if (t.r === 2 && t.c === 2 && standouts.length) standouts = standouts.filter(c => c.z > 0);
      if (standouts.length) {
        const shown = standouts.slice(0, 6).map(c => `${esc(rows[c.i])} has ${c.z > 0 ? 'more' : 'fewer'} “${esc(cols[c.j])}” than expected (${nf.format(c.o)}${unit}, ${share(c.o / t.rt[c.i])} of the group, against ${nf1.format(c.e)} expected and ${share(t.ct[c.j] / t.N)} overall)`);
        paras.push(`${standouts.length === 1 ? 'One cell stands out' : `${standouts.length} cells stand out`} from the overall split: ${list(shown)}${standouts.length > 6 ? ', among others' : ''}.`);
      } else if (sig) {
        paras.push('No single cell stands out once you allow for how many cells there are. The difference may be spread across several groups; more data would help pin it down.');
      }
      if (!t.cochranOK) {
        paras.push(`${t.small} of the ${t.r * t.c} cells ${t.small === 1 ? 'has' : 'have'} an expected count below 5 (the smallest is ${nf1.format(t.minE)}). ${t.useFisher ? 'So the result uses Fisher’s exact test, which doesn’t need large counts.' : 'The chi-squared p-value may be unreliable. Try combining small groups or categories, or collecting more data.'}`);
      } else if (t.fish != null) {
        paras.push(`For a 2 × 2 table, Fisher’s exact test gives ${pIs(t.fish)}, compared with ${pIs(t.p)} for the chi-squared test.`);
      }
    } else {
      const { cats } = o.fit;
      const what = o.fit.exp ? 'the expected split you gave' : 'an equal split across the categories';
      paras.push(sig
        ? `<b>There is evidence that the counts differ from ${what}</b> (${chiText}). Differences this large ${chance} if the counts really followed that split.`
        : `<b>There isn’t enough evidence that the counts differ from ${what}</b> (${chiText}). The differences you can see could well be down to chance. That doesn’t prove the counts follow that split: with more data a real but small difference might show up.`);
      paras.push(`The difference is ${strength(t.effect, 1)} (Cohen’s w = ${nf.format(t.effect)}).`);
      if (standouts.length) {
        const shown = standouts.slice(0, 6).map(c => `${esc(cats[c.i])} has ${c.z > 0 ? 'more' : 'fewer'} than expected (${nf.format(c.o)}${unit}, against ${nf1.format(c.e)})`);
        paras.push(`${standouts.length === 1 ? 'One category stands out' : `${standouts.length} categories stand out`}: ${list(shown)}${standouts.length > 6 ? ', among others' : ''}.`);
      } else if (sig) {
        paras.push('No single category stands out once you allow for how many there are. The difference may be spread across several categories.');
      }
      if (!t.cochranOK) paras.push(`${t.small} of the ${t.k} categories ${t.small === 1 ? 'has' : 'have'} an expected count below 5 (the smallest is ${nf1.format(t.minE)}), so the p-value may be unreliable. Try combining small categories, or collecting more data.`);
    }
    if (!t.whole) paras.push('Some counts aren’t whole numbers. The chi-squared test needs actual counts of people or events, not percentages, rates or averages.');
    return paras;
  }
  function summaryText() {
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [current.o.title || 'Chi-squared test', ''];
    readingParts().forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- tables ----
  const r4 = x => isFinite(x) ? Math.round(x * 1e4) / 1e4 : x;
  const pcsv = p => p < 0.0001 ? '<0.0001' : r4(p);
  function tableRows() {
    const { o, t } = current;
    const out = [];
    if (o.mode === 'independence') {
      const { rows, cols, obs } = o.table;
      const cell = (i, j) => t.cells.find(c => c.i === i && c.j === j);
      out.push(['Observed counts', ...cols, 'Total']);
      rows.forEach((r, i) => out.push([r, ...obs[i], t.rt[i]]));
      out.push(['Total', ...t.ct, t.N]);
      out.push([], ['Row percentages', ...cols, 'Total']);
      rows.forEach((r, i) => out.push([r, ...obs[i].map(v => r4(v / t.rt[i] * 100)), 100]));
      out.push(['Overall', ...t.ct.map(v => r4(v / t.N * 100)), 100]);
      out.push([], ['Expected counts', ...cols]);
      rows.forEach((r, i) => out.push([r, ...cols.map((_, j) => r4(t.E[i][j]))]));
      out.push([], ['Adjusted residuals', ...cols]);
      rows.forEach((r, i) => out.push([r, ...cols.map((_, j) => r4(cell(i, j).z))]));
      out.push([], ['Test', 'Statistic', 'df', 'p']);
      out.push(['Chi-squared', r4(t.chi2), t.df, pcsv(t.p)]);
      if (t.fish != null) out.push(['Fisher’s exact', '', '', pcsv(t.fish)]);
      out.push(['Cramér’s V', r4(t.V), '', '']);
      out.push(['Critical value for adjusted residuals', r4(t.crit), '', '']);
    } else {
      const { cats } = o.fit;
      out.push([o.fit.catName, 'Observed', 'Expected', 'Observed %', 'Expected %', 'Adjusted residual', 'Stands out']);
      t.cells.forEach(c => out.push([cats[c.i], c.o, r4(c.e), r4(c.o / t.N * 100), r4(c.e / t.N * 100), r4(c.z), c.out ? 'Yes' : 'No']));
      out.push(['Total', t.N, r4(sum(t.E)), 100, 100, '', '']);
      out.push([], ['Test', 'Statistic', 'df', 'p']);
      out.push(['Chi-squared', r4(t.chi2), t.df, pcsv(t.p)]);
      out.push(['Cohen’s w', r4(t.effect), '', '']);
      out.push(['Critical value for adjusted residuals', r4(t.crit), '', '']);
    }
    return out;
  }
  function tableHTML() {
    const { o, t } = current;
    let h = '';
    if (o.mode === 'independence') {
      const { rows, cols, obs } = o.table;
      const cell = (i, j) => t.cells.find(c => c.i === i && c.j === j);
      const headRow = first => `<thead><tr><th>${esc(first)}</th>${cols.map(c => `<th class="num">${esc(c)}</th>`).join('')}`;
      h += `<div class="tablewrap"><h3>Counts</h3><table><caption class="sr">Observed counts with the percentage of each group</caption>${headRow(o.table.rowName)}<th class="num tot">Total</th></tr></thead><tbody>`;
      rows.forEach((r, i) => {
        h += `<tr><td>${esc(r)}</td>${obs[i].map((v, j) => { const c = cell(i, j); return `<td class="num${c.out ? ' out' : ''}">${esc(arrow(c))}${nf.format(v)}<span class="pc">(${share(v / t.rt[i])})</span></td>`; }).join('')}<td class="num tot">${nf.format(t.rt[i])}</td></tr>`;
      });
      h += `<tr><td class="tot">Overall</td>${t.ct.map(v => `<td class="num tot">${nf.format(v)}<span class="pc">(${share(v / t.N)})</span></td>`).join('')}<td class="num tot">${nf.format(t.N)}</td></tr>`;
      h += '</tbody></table><p class="hint">The figure in brackets is the share of each group’s total. ▲ and ▼ mark counts that stand out as higher or lower than expected.</p></div>';

      h += `<div class="tablewrap"><h3>Expected counts</h3><table><caption class="sr">Counts expected if every group had the same split</caption>${headRow(o.table.rowName)}</tr></thead><tbody>`;
      rows.forEach((r, i) => { h += `<tr><td>${esc(r)}</td>${cols.map((_, j) => `<td class="num${t.E[i][j] < 5 ? ' warn' : ''}">${nf1.format(t.E[i][j])}</td>`).join('')}</tr>`; });
      h += '</tbody></table><p class="hint">What each count would be if every group had the overall split. Counts below 5 are highlighted: the test is reliable when none is below 1 and no more than one in five is below 5.</p></div>';

      h += `<div class="tablewrap"><h3>Adjusted residuals</h3><table><caption class="sr">How far each count is from its expected count</caption>${headRow(o.table.rowName)}</tr></thead><tbody>`;
      rows.forEach((r, i) => { h += `<tr><td>${esc(r)}</td>${cols.map((_, j) => { const c = cell(i, j); return `<td class="num${c.out ? ' out' : ''}">${nf.format(c.z)}</td>`; }).join('')}</tr>`; });
      h += `</tbody></table><p class="hint">How many standard errors each count is above (positive) or below (negative) its expected count. Cells beyond ±${nf.format(t.crit)} stand out at the ${Math.round(o.alpha * 100)}% level${t.r * t.c > 4 ? `, adjusted for the ${t.r * t.c} cells` : ''}.</p></div>`;

      h += `<div class="tablewrap"><h3>Test results</h3><table><caption class="sr">Test results</caption><thead><tr><th>Test</th><th class="num">Statistic</th><th class="num">df</th><th class="num">p</th></tr></thead><tbody>`;
      h += `<tr><td>Chi-squared test of independence</td><td class="num">${nf.format(t.chi2)}</td><td class="num">${t.df}</td><td class="num">${t.useFisher ? pf(t.p) : `<b>${pf(t.p)}</b>`}</td></tr>`;
      if (t.fish != null) h += `<tr><td>Fisher’s exact test</td><td></td><td></td><td class="num">${t.useFisher ? `<b>${pf(t.fish)}</b>` : pf(t.fish)}</td></tr>`;
      h += `<tr><td>Cramér’s V</td><td class="num">${nf.format(t.V)}</td><td></td><td></td></tr>`;
      h += '</tbody></table></div>';
    } else {
      const { cats } = o.fit;
      h += `<div class="tablewrap"><h3>Each category</h3><table><caption class="sr">Observed and expected counts for each category</caption><thead><tr><th>${esc(o.fit.catName)}</th>${['Observed', 'Expected', 'Observed share', 'Expected share', 'Adjusted residual'].map(x => `<th class="num">${x}</th>`).join('')}</tr></thead><tbody>`;
      t.cells.forEach(c => {
        h += `<tr><td>${esc(cats[c.i])}</td><td class="num${c.out ? ' out' : ''}"><b>${esc(arrow(c))}${nf.format(c.o)}</b></td><td class="num${c.e < 5 ? ' warn' : ''}">${nf1.format(c.e)}</td><td class="num">${share(c.o / t.N)}</td><td class="num">${share(c.e / t.N)}</td><td class="num${c.out ? ' out' : ''}">${nf.format(c.z)}</td></tr>`;
      });
      h += `<tr><td class="tot">Total</td><td class="num tot">${nf.format(t.N)}</td><td class="num tot">${nf.format(sum(t.E))}</td><td class="num tot">100%</td><td class="num tot">100%</td><td></td></tr>`;
      h += `</tbody></table><p class="hint">The adjusted residual is how many standard errors each count is above or below its expected count. Categories beyond ±${nf.format(t.crit)} stand out at the ${Math.round(o.alpha * 100)}% level${t.k > 2 ? `, adjusted for the ${t.k} categories` : ''}. Expected counts below 5 are highlighted.</p></div>`;
      h += `<div class="tablewrap"><h3>Test results</h3><table><caption class="sr">Test results</caption><thead><tr><th>Test</th><th class="num">Statistic</th><th class="num">df</th><th class="num">p</th></tr></thead><tbody>`;
      h += `<tr><td>Chi-squared goodness of fit</td><td class="num">${nf.format(t.chi2)}</td><td class="num">${t.df}</td><td class="num"><b>${pf(t.p)}</b></td></tr>`;
      h += `<tr><td>Cohen’s w</td><td class="num">${nf.format(t.effect)}</td><td></td><td></td></tr>`;
      h += '</tbody></table></div>';
    }
    return h;
  }

  // ---- render ----
  const orderIdx = (names, sizes, ord) => {
    const idx = names.map((_, i) => i);
    if (ord === 'sizeDesc') idx.sort((a, b) => sizes[b] - sizes[a]);
    if (ord === 'name') idx.sort((a, b) => names[a].localeCompare(names[b], 'en-GB', { numeric: true }));
    return idx;
  };
  function update() {
    const text = els.data.value;
    const sp = split(text);
    const sh = sp ? shape(sp.recs, sp.delim) : null;
    if (!headerTouched) els.hasHeader.checked = !!(sp && sp.recs.length > 1 && sh.headerGuess);
    if (!modeTouched && sh) els.mode.value = suggestMode(sh);
    const mode = els.mode.value;
    els.swap.disabled = mode !== 'independence';
    els.swapWrap.classList.toggle('off', mode !== 'independence');
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to run the test.'); }
    const p = parse(text, els.hasHeader.checked, mode);
    if (!p) return renderEmpty('Couldn’t find any data.');
    if (p.error) { els.detected.textContent = ''; return renderEmpty(p.error); }
    const extraNote = () => {
      let n = p.notes.join(' ');
      if (p.skipped) n += ` ${p.skipped} cell${p.skipped > 1 ? 's' : ''} skipped (not a number).`;
      if (p.negative) n += ` ${p.negative} negative count${p.negative > 1 ? 's' : ''} skipped.`;
      return n ? ' ' + n.trim() : '';
    };
    const alpha = +els.alpha.value;
    const title = els.title.value.trim();
    const valName = els.valLabel.value.trim();
    const o = { title, valName, alpha, mode };
    let svg, headline, sub, tiles;

    if (mode === 'independence') {
      let rows = p.rows, cols = p.cols, obs = p.obs;
      if (els.swap.checked) { [rows, cols] = [cols, rows]; obs = rows.map((_, i) => cols.map((_, j) => p.obs[j][i])); }
      const rowName = els.swap.checked ? p.colName : p.rowName, colName = els.swap.checked ? p.rowName : p.colName;
      // Drop groups and categories with no counts at all: they have no expected counts.
      const keepR = rows.map((_, i) => sum(obs[i]) > 0), keepC = cols.map((_, j) => sum(obs.map(r => r[j])) > 0);
      const dropped = keepR.filter(k => !k).length + keepC.filter(k => !k).length;
      rows = rows.filter((_, i) => keepR[i]); cols = cols.filter((_, j) => keepC[j]);
      obs = obs.filter((_, i) => keepR[i]).map(r => r.filter((_, j) => keepC[j]));
      let note = `Reading a table of ${rows.length} group${rows.length === 1 ? '' : 's'} by ${cols.length} categor${cols.length === 1 ? 'y' : 'ies'}` + (p.kind === 'records' ? ', counted from one row per person or event.' : '.');
      if (dropped) note += ` Left out ${dropped} group${dropped > 1 ? 's or categories' : ' or category'} with no counts.`;
      els.detected.textContent = note + extraNote();
      if (rows.length < 2 || cols.length < 2) return renderEmpty('A test of independence needs at least two groups and two categories with counts in them.');
      if (rows.length > MAX_ROWS) return renderEmpty(`There are ${rows.length} groups. The chart can show up to ${MAX_ROWS}: combine some groups first.`);
      if (cols.length > MAX_COLS) return renderEmpty(`There are ${cols.length} categories. The chart can show up to ${MAX_COLS}: combine some categories${rows.length <= MAX_COLS ? ', or tick “Swap the groups and categories”' : ''}.`);
      const t = independence(rows, cols, obs, alpha);
      // Reorder rows for display after the test (the result doesn't depend on order).
      const idx = orderIdx(rows, t.rt, els.order.value);
      const pos = new Map(idx.map((old, nw) => [old, nw]));
      rows = idx.map(i => rows[i]); obs = idx.map(i => obs[i]);
      t.rt = idx.map(i => t.rt[i]); t.E = idx.map(i => t.E[i]);
      t.cells.forEach(c => { c.i = pos.get(c.i); });
      o.table = { rows, cols, obs, rowName, colName };
      o.t = t;
      const sig = t.pMain < alpha;
      o.aria = (title ? title + '. ' : '') + `Share of each of ${rows.length} groups in each of ${cols.length} categories. ` +
        rows.slice(0, 8).map((r, i) => `${r}: ` + cols.map((c, j) => `${c} ${share(obs[i][j] / t.rt[i])}`).join(', ')).join('; ') + (rows.length > 8 ? '; and more.' : '.') +
        ` ${sig ? 'The split differs between groups' : 'No clear difference between the groups'}, ${pIs(t.pMain)}.`;
      current = { o, t };
      svg = drawShown(() => renderTable(o));
      trackChart({ points: rows.length * cols.length });
      headline = sig ? 'The groups <strong>differ</strong>' : 'No clear difference between the groups';
      sub = `${t.useFisher ? 'Fisher’s exact test' : 'Chi-squared test of independence'} on ${nf.format(t.N)}${valName ? ' ' + lower(valName) : ' counts'} in ${rows.length} groups and ${cols.length} categories, at the ${Math.round(alpha * 100)}% significance level.`;
      tiles = [[pf(t.pMain), t.useFisher ? 'p-value (Fisher’s exact)' : 'p-value'], [nf.format(t.chi2), `Chi-squared (df = ${t.df})`], [nf.format(t.V), 'Cramér’s V (strength)'], [nf.format(t.N), 'Total count']];
    } else {
      let cats = p.cats, obs = p.obs, w = p.exp ? p.exp.slice() : cats.map(() => 1);
      const impossible = cats.filter((_, i) => w[i] === 0 && obs[i] > 0);
      if (impossible.length) { els.detected.textContent = ''; return renderEmpty(`${list(impossible.slice(0, 3))}${impossible.length > 3 ? ' and others have' : impossible.length > 1 ? ' have' : ' has'} counts but an expected count of 0. Every category with counts needs an expected count above 0.`); }
      const keep = cats.map((_, i) => w[i] > 0);
      const dropped = keep.filter(k => !k).length;
      cats = cats.filter((_, i) => keep[i]); obs = obs.filter((_, i) => keep[i]); w = w.filter((_, i) => keep[i]);
      let note = `Reading ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}` + (p.kind === 'records' ? ', counted from one row per person or event' : '') + (p.exp ? ', with the expected split from your second column of numbers.' : ', compared with an equal split.');
      if (dropped) note += ` Left out ${dropped} categor${dropped > 1 ? 'ies' : 'y'} expected to be 0.`;
      els.detected.textContent = note + extraNote();
      if (cats.length < 2) return renderEmpty('Comparing with an expected split needs at least two categories.');
      if (cats.length > MAX_CATS) return renderEmpty(`There are ${cats.length} categories. The chart can show up to ${MAX_CATS}: combine some categories first.`);
      if (!(sum(obs) > 0)) return renderEmpty('All the counts are zero.');
      const t = goodness(cats, obs, w, alpha);
      const idx = orderIdx(cats, obs, els.order.value);
      cats = idx.map(i => cats[i]); obs = idx.map(i => obs[i]);
      t.E = idx.map(i => t.E[i]); t.cells = idx.map((i, n) => Object.assign(t.cells[i], { i: n }));
      o.fit = { cats, obs, exp: p.exp, catName: p.catName };
      o.t = t;
      const sig = t.p < alpha;
      o.aria = (title ? title + '. ' : '') + `Observed and expected counts for ${cats.length} categories. ` +
        cats.slice(0, 10).map((c, i) => `${c}: ${nf.format(obs[i])} observed, ${nf1.format(t.E[i])} expected`).join('; ') + (cats.length > 10 ? '; and more.' : '.') +
        ` ${sig ? 'The counts differ from what was expected' : 'No clear difference from what was expected'}, ${pIs(t.p)}.`;
      current = { o, t };
      svg = drawShown(() => renderFit(o));
      trackChart({ points: cats.length });
      headline = sig ? 'The counts <strong>differ</strong> from what was expected' : 'No clear difference from what was expected';
      sub = `Chi-squared goodness of fit test on ${nf.format(t.N)}${valName ? ' ' + lower(valName) : ' counts'} in ${cats.length} categories, against ${p.exp ? 'your expected split' : 'an equal split'}, at the ${Math.round(alpha * 100)}% significance level.`;
      tiles = [[pf(t.p), 'p-value'], [nf.format(t.chi2), `Chi-squared (df = ${t.df})`], [nf.format(t.effect), 'Cohen’s w (strength)'], [nf.format(t.N), 'Total count']];
    }

    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">${tiles.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('')}</div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">${mode === 'independence' ? 'Each bar shows how one group splits across the categories, with the overall split at the bottom for comparison.' : 'Each bar is the count in one category; the dashed line is the count expected.'} Outlined parts, marked ▲ or ▼, stand out as higher or lower than expected. Hover over the chart to see the figures.</p>
      <div class="reading"><h3>What the test shows</h3>${readingParts().map(x => `<p>${x}</p>`).join('')}</div>
      ${tableHTML()}`;
  }
  function renderEmpty(msg) {
    current = null;
    els.result.innerHTML = `<div class="empty"><p>${esc(msg)}</p><div class="btns"><button type="button" class="primary" data-act="example">Try the example</button><button type="button" data-act="example2">Try an expected split example</button></div></div>`;
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
  function fileName() { return slug(current && current.o.title); }
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
  const csvCell = v => v === undefined ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
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
    if (a === 'example2') return loadExampleFit();
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
    if (a === 'csv') downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '.csv').then(ok => saved(ok, 'Tables downloaded.'), failed);
    if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => status(ok ? 'Tables copied — paste them into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Summary copied.' : 'Copy was blocked.'));
  }
  function loadExample() {
    els.data.value = EXAMPLE;
    els.title.value = 'Risk assessment within 6 hours of admission, by ward (example)';
    els.valLabel.value = 'Patients';
    els.order.value = 'entered';
    els.alpha.value = '0.05';
    els.swap.checked = false;
    headerTouched = false; modeTouched = false;
    update();
  }
  function loadExampleFit() {
    els.data.value = EXAMPLE_GOF;
    els.title.value = 'Inpatient falls by day of the week (example)';
    els.valLabel.value = 'Falls';
    els.order.value = 'entered';
    els.alpha.value = '0.05';
    els.swap.checked = false;
    headerTouched = false; modeTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  els.mode.addEventListener('change', () => { modeTouched = true; update(); });
  [els.title, els.valLabel].forEach(el => el.addEventListener('input', schedule));
  [els.alpha, els.order, els.swap].forEach(el => el.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ test: 'mode', alpha: 'alpha', order: 'order', swap: 'swap' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.valLabel.value = ''; headerTouched = false; modeTouched = false; els.hasHeader.checked = false; els.swap.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'chi_squared', toolName: 'Chi-squared test',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; modeTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

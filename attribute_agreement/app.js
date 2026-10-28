/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), hasId: $('hasId'), hasStd: $('hasStd'), trials: $('trials'), detected: $('detected'),
    ordered: $('ordered'), orderBlock: $('orderBlock'), cats: $('cats'), title: $('title'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', dot: '#005EB8', ci: '#003087', match: '#E3F2E9', matchInk: '#00401E', miss: '#F9D6D3', missInk: '#8A1A12', head: '#F0F4F5' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const MAX_APPRAISERS = 10;
  const CHARTS = { agreement: 'Assessment agreement', grid: 'Every rating, case by case' };

  // Auto-detected settings follow the data until the user changes them.
  const touched = { hasHeader: false, hasId: false, hasStd: false, trials: false, ordered: false };
  let catOrder = [];
  let chartType = 'agreement';
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

  // Example: three ward nurses grade 20 pressure ulcer photos twice, against the
  // tissue viability nurse's grading (made-up data)
  const EXAMPLE = [
    'Photo\tStandard (tissue viability nurse)\tNurse A trial 1\tNurse A trial 2\tNurse B trial 1\tNurse B trial 2\tNurse C trial 1\tNurse C trial 2',
    '1\t1\t1\t1\t1\t1\t1\t1', '2\t1\t1\t1\t1\t1\t2\t1', '3\t1\t1\t1\t1\t1\t1\t1', '4\t1\t1\t1\t2\t2\t1\t1', '5\t1\t1\t1\t1\t1\t1\t1',
    '6\t2\t2\t2\t2\t2\t2\t2', '7\t2\t2\t2\t2\t2\t3\t2', '8\t2\t2\t2\t1\t2\t2\t2', '9\t2\t2\t2\t2\t2\t2\t2', '10\t2\t2\t3\t2\t2\t2\t2',
    '11\t3\t3\t3\t3\t3\t3\t3', '12\t3\t3\t3\t3\t3\t2\t2', '13\t3\t3\t3\t3\t3\t3\t3', '14\t3\t4\t3\t3\t3\t3\t3', '15\t3\t3\t3\t3\t3\t2\t3',
    '16\t4\t4\t4\t4\t4\t4\t4', '17\t4\t4\t4\t4\t4\t3\t3', '18\t4\t4\t4\t4\t4\t4\t4', '19\t4\t4\t4\t3\t4\t4\t4', '20\t4\t4\t4\t4\t4\t4\t4'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attribute-agreement';
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const pc = x => isFinite(x) ? (Math.round(x * 1000) / 10) + '%' : '–';
  const k3 = x => isFinite(x) ? x.toFixed(3) : '–';
  const isNumText = v => v !== '' && isFinite(Number(String(v).replace(/,/g, '')));
  const keyOf = v => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

  // ---- parsing ----
  // Guesses for the checkboxes and trials, from the headings and the values.
  function guess(recs) {
    const ncol = Math.max(...recs.map(r => r.length));
    const first = recs[0] || [];
    const g = {};
    g.hasHeader = recs.length > 2 && first.some(v => /[a-z]/i.test(v)) && /trial|appraiser|rater|standard|nurse|reviewer|assessor|case|sample|item|id/i.test(first.join(' '));
    if (!g.hasHeader && recs.length > 2) {
      // a heading row has text where the rest of a column is numbers
      g.hasHeader = first.some((v, c) => v !== '' && !isNumText(v) && recs.slice(1).every(r => r[c] === undefined || r[c] === '' || isNumText(r[c])));
    }
    if (!g.hasHeader && recs.length > 2) {
      // or labels that never turn up again as a rating
      const seen = new Set(recs.slice(1).flat().map(keyOf));
      g.hasHeader = first.every(v => v !== '' && !seen.has(keyOf(v)));
    }
    const body = g.hasHeader ? recs.slice(1) : recs;
    const h = g.hasHeader ? first : [];
    const col0 = body.map(r => r[0] || '');
    g.hasId = /^(case|sample|item|id|no\.?|number|part|photo|patient|record|ref)/i.test(h[0] || '') ||
      (body.length > 3 && new Set(col0).size === body.length && col0.every(isNumText) && new Set(col0.map(Number)).size === body.length && Math.max(...col0.map(Number)) === body.length);
    const si = g.hasId ? 1 : 0;
    g.hasStd = /standard|expert|reference|correct|known|true|gold|answer|master/i.test(h[si] || '');
    let t = 0;
    h.forEach(x => { const m = /(?:trial|t|run|round|time|rep)\s*#?\s*(\d)\b/i.exec(x); if (m) t = Math.max(t, +m[1]); });
    const rest = ncol - si - (g.hasStd ? 1 : 0);
    g.trials = t >= 1 && t <= 3 ? t : (rest % 2 === 0 && rest >= 2 ? 2 : 1);
    // trials named in the headings plus one spare column: the spare is the standard
    if (!g.hasStd && t >= 2 && rest % t === 1 && !/(?:trial|t|run|round|time|rep)\s*#?\s*\d/i.test(h[si] || '')) { g.hasStd = true; }
    return g;
  }
  function appraiserName(head, i, trials) {
    const hs = head ? head.slice(i * trials, i * trials + trials) : [];
    if (trials === 1) return (hs[0] || '').trim() || 'Appraiser ' + (i + 1);
    const stripped = hs.map(x => (x || '').replace(/[\s_\-–:(),]*(?:(?:trial|t|run|round|time|rep)\s*#?\s*)?\d\)?\s*$/i, '').trim());
    if (stripped[0] && stripped.every(x => x.toLowerCase() === stripped[0].toLowerCase())) return stripped[0];
    return 'Appraiser ' + (i + 1);
  }
  function parse(recs, o) {
    const head = o.hasHeader ? recs[0] : null;
    const body = o.hasHeader ? recs.slice(1) : recs;
    const ncol = Math.max(...recs.map(r => r.length));
    const start = (o.hasId ? 1 : 0) + (o.hasStd ? 1 : 0);
    const rateCols = ncol - start;
    if (rateCols < o.trials) return { error: 'There are no columns of ratings. Check the settings under the box.' };
    const nApp = Math.floor(rateCols / o.trials), spare = rateCols - nApp * o.trials;
    if (nApp > MAX_APPRAISERS) return { error: `That’s ${nApp} appraisers; the tool handles up to ${MAX_APPRAISERS}. Check the trials setting.` };
    const apps = Array.from({ length: nApp }, (_, i) => appraiserName(head && head.slice(start), i, o.trials));
    // keep the first spelling seen of each category, matching case and spacing loosely
    const labels = new Map();
    const lab = v => { const k = keyOf(v); if (!labels.has(k)) labels.set(k, v.trim()); return k; };
    const samples = [];
    let incomplete = 0;
    body.forEach((r, i) => {
      const std = o.hasStd ? (r[o.hasId ? 1 : 0] || '') : null;
      const ratings = apps.map((_, a) => Array.from({ length: o.trials }, (_, t) => r[start + a * o.trials + t] || ''));
      const all = ratings.flat();
      if (all.every(v => v === '') && (std == null || std === '')) return;
      if (all.some(v => v === '') || std === '') { incomplete++; return; }
      samples.push({ id: o.hasId ? (r[0] || String(i + 1)) : String(i + 1), std: std == null ? null : lab(std), r: ratings.map(ts => ts.map(lab)) });
    });
    return { apps, samples, labels, incomplete, spare, nApp, trials: o.trials, hasStd: o.hasStd };
  }

  // ---- statistics ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { betaInv, ranks, tiesT, splitTable } = FocusStats;

  // Percent matched with an exact (Clopper–Pearson) 95% confidence interval.
  function agreement(x, n) {
    // as in Minitab, a 100% or 0% result gets a one-sided bound
    const lo = x === 0 ? 0 : x === n ? betaInv(0.05, x, 1) : betaInv(0.025, x, n - x + 1);
    const hi = x === n ? 1 : x === 0 ? betaInv(0.95, 1, n) : betaInv(0.975, x + 1, n - x);
    return { n, x, p: n ? x / n : NaN, lo, hi };
  }
  // Fleiss' kappa: rows are cases, each a list of the ratings it was given.
  function fleiss(rows, cats) {
    const n = rows.length, m = rows[0].length;
    if (m < 2 || !n) return NaN;
    let num = 0; const tot = {};
    cats.forEach(c => { tot[c] = 0; });
    rows.forEach(rs => cats.forEach(c => { const x = rs.filter(v => v === c).length; num += x * (m - x); tot[c] += x; }));
    const den = n * m * (m - 1) * cats.reduce((s, c) => { const p = tot[c] / (n * m); return s + p * (1 - p); }, 0);
    return den > 0 ? 1 - num / den : NaN;
  }

  // Kendall's coefficient of concordance (W), corrected for ties; columns are raters.
  function kendallW(cols) {
    const m = cols.length, n = cols[0].length;
    if (m < 2 || n < 2) return NaN;
    const rk = cols.map(ranks);
    const R = Array.from({ length: n }, (_, i) => rk.reduce((s, c) => s + c[i], 0));
    const T = cols.reduce((s, c) => s + tiesT(c), 0);
    const den = m * m * n * (n * n - 1) - m * T;
    return den > 0 ? (12 * R.reduce((s, v) => s + v * v, 0) - 3 * m * m * n * (n + 1) ** 2) / den : NaN;
  }
  // Kendall's correlation (tau-b) between a set of ratings and the standard.
  function kendallTau(x, y) {
    const n = x.length; let s = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(x[i] - x[j]) * Math.sign(y[i] - y[j]);
    const pairs = n * (n - 1) / 2, tie = col => { const c = {}; col.forEach(v => { c[v] = (c[v] || 0) + 1; }); return Object.values(c).reduce((a, t) => a + t * (t - 1) / 2, 0); };
    const den = Math.sqrt((pairs - tie(x)) * (pairs - tie(y)));
    return den > 0 ? s / den : NaN;
  }
  const mean = a => { const v = a.filter(isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
  function rating(k) {
    if (!isFinite(k)) return { text: 'Can’t be worked out', cls: '' };
    if (k > 0.9) return { text: 'Excellent', cls: 'good' };
    if (k >= 0.7) return { text: 'Generally acceptable', cls: 'good' };
    if (k >= 0) return { text: 'Needs improvement', cls: 'poor' };
    return { text: 'Disagreement beyond chance', cls: 'poor' };
  }

  function analyse(d, cats, useKendall) {
    const S = d.samples, n = S.length, A = d.nApp, T = d.trials;
    const rank = new Map(cats.map((c, i) => [c, i + 1]));
    const num = col => col.map(v => rank.get(v));
    const col = (a, t) => S.map(s => s.r[a][t]);
    const stdCol = d.hasStd ? S.map(s => s.std) : null;
    const coef = (kappa, kend) => useKendall ? kend : kappa;
    const res = { n, A, T, useKendall };
    if (T >= 2) {
      res.within = d.apps.map((name, a) => {
        const x = S.filter(s => s.r[a].every(v => v === s.r[a][0])).length;
        const cols = Array.from({ length: T }, (_, t) => col(a, t));
        return Object.assign(agreement(x, n), { name, coef: coef(fleiss(S.map(s => s.r[a]), cats), useKendall ? kendallW(cols.map(num)) : NaN) });
      });
    }
    if (d.hasStd) {
      res.vsStd = d.apps.map((name, a) => {
        const x = S.filter(s => s.r[a].every(v => v === s.std)).length;
        const per = Array.from({ length: T }, (_, t) => useKendall ? kendallTau(num(col(a, t)), num(stdCol)) : fleiss(S.map(s => [s.r[a][t], s.std]), cats));
        return Object.assign(agreement(x, n), { name, coef: mean(per) });
      });
      // with two categories, say which way each appraiser gets it wrong
      if (cats.length === 2) {
        const [c1, c2] = cats, n1 = S.filter(s => s.std === c1).length, n2 = S.filter(s => s.std === c2).length;
        res.disagree = d.apps.map((name, a) => {
          const as1 = S.filter(s => s.std === c2 && s.r[a].every(v => v === c1)).length;
          const as2 = S.filter(s => s.std === c1 && s.r[a].every(v => v === c2)).length;
          const mixed = S.filter(s => s.r[a].some(v => v !== s.r[a][0])).length;
          return { name, as1, p1: n2 ? as1 / n2 : NaN, as2, p2: n1 ? as2 / n1 : NaN, mixed, pm: mixed / n };
        });
      }
    }
    if (A * T >= 2 && A >= 2) {
      const x = S.filter(s => { const all = s.r.flat(); return all.every(v => v === all[0]); }).length;
      const cols = []; for (let a = 0; a < A; a++) for (let t = 0; t < T; t++) cols.push(col(a, t));
      res.between = Object.assign(agreement(x, n), { coef: coef(fleiss(S.map(s => s.r.flat()), cats), useKendall ? kendallW(cols.map(num)) : NaN) });
    }
    if (d.hasStd) {
      const x = S.filter(s => s.r.flat().every(v => v === s.std)).length;
      res.allStd = Object.assign(agreement(x, n), { coef: mean(res.vsStd.map(r => r.coef)) });
    }
    // cases with any disagreement, most mixed first, to review
    res.cases = S.map(s => {
      const all = s.r.flat(), ref = d.hasStd ? s.std : null;
      const wrong = ref == null ? 0 : all.filter(v => v !== ref).length;
      const distinct = new Set(all).size;
      return { s, wrong, distinct, ok: ref == null ? distinct === 1 : wrong === 0 };
    });
    return res;
  }

  // ---- drawing ----
  const charW = size => size * 0.56;
  const f1 = v => Math.round(v * 10) / 10;
  function svgOpen(W, H, o) {
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (o.title) s.push(`<text x="16" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (16) - 16) / 11.2))))}</text>`);
    return s;
  }
  // Percent matched with its confidence interval, for each appraiser: within and versus standard.
  function agreementSVG(o) {
    const { res } = current;
    const panels = [];
    if (res.within) panels.push(['Within appraisers', res.within]);
    if (res.vsStd) panels.push(['Appraiser versus standard', res.vsStd]);
    const W = drawW, ML = 64, MR = 20, gap = 40;
    const MT = (o.title ? 44 : 8) + 62, plotH = 320;
    const longest = Math.max(...res.vsStd ? res.vsStd.map(r => r.name.length) : [0], ...res.within ? res.within.map(r => r.name.length) : [0]);
    const pw = (W - ML - MR - gap * (panels.length - 1)) / panels.length, band = pw / res.A;
    const rotate = charW(12) * Math.min(longest, 24) > band - 6;
    const labelH = rotate ? 30 + charW(12) * Math.min(longest, 24) * 0.7 : 34;
    const H = MT + plotH + labelH + 16;
    const lo = Math.min(...panels.flatMap(([, rs]) => rs.map(r => r.lo)));
    const min = Math.max(0, Math.floor((lo - 0.02) * 10) / 10);
    const y = v => MT + plotH - (v - min) / (1 - min) * plotH;
    const ticks = []; const step = 1 - min > 0.5 ? 0.2 : 0.1;
    for (let t = 1; t >= min - 1e-9; t -= step) ticks.push(+t.toFixed(2));
    const s = svgOpen(W, H, o);
    // legend
    const lx = W - MR - 300, ly = MT - 44;
    s.push(`<circle cx="${lx + 10}" cy="${ly}" r="5.5" fill="${COLORS.dot}"/><text x="${lx + 22}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">Percent matched</text>`);
    s.push(`<line x1="${lx + 150}" y1="${ly - 7}" x2="${lx + 150}" y2="${ly + 7}" stroke="${COLORS.ci}" stroke-width="2"/><line x1="${lx + 145}" y1="${ly - 7}" x2="${lx + 155}" y2="${ly - 7}" stroke="${COLORS.ci}" stroke-width="2"/><line x1="${lx + 145}" y1="${ly + 7}" x2="${lx + 155}" y2="${ly + 7}" stroke="${COLORS.ci}" stroke-width="2"/><text x="${lx + 164}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">95% confidence interval</text>`);
    ticks.forEach(t => s.push(`<text x="${ML - 8}" y="${f1(y(t)) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${Math.round(t * 100)}%</text>`));
    s.push(`<text transform="translate(18 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">Percent of cases matched</text>`);
    panels.forEach(([name, rs], p) => {
      const x0 = ML + p * (pw + gap);
      s.push(`<text x="${f1(x0 + pw / 2)}" y="${MT - 10}" font-size="14" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(name)}</text>`);
      s.push(`<rect x="${f1(x0)}" y="${MT}" width="${f1(pw)}" height="${plotH}" fill="none" stroke="${COLORS.axis}"/>`);
      ticks.forEach(t => s.push(`<line x1="${f1(x0)}" y1="${f1(y(t))}" x2="${f1(x0 + pw)}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`));
      rs.forEach((r, i) => {
        const cx = x0 + band * (i + 0.5), cap = Math.min(18, band * 0.3);
        s.push(`<g><title>${esc(`${r.name}, ${name.toLowerCase()}: ${r.x} of ${r.n} matched (${pc(r.p)}), 95% CI ${pc(r.lo)} to ${pc(r.hi)}`)}</title>`);
        s.push(`<line x1="${f1(cx)}" y1="${f1(y(r.hi))}" x2="${f1(cx)}" y2="${f1(y(r.lo))}" stroke="${COLORS.ci}" stroke-width="2.5"/>`);
        [r.hi, r.lo].forEach(v => s.push(`<line x1="${f1(cx - cap / 2)}" y1="${f1(y(v))}" x2="${f1(cx + cap / 2)}" y2="${f1(y(v))}" stroke="${COLORS.ci}" stroke-width="2.5"/>`));
        s.push(`<circle cx="${f1(cx)}" cy="${f1(y(r.p))}" r="7" fill="${COLORS.dot}" stroke="#fff" stroke-width="2"/></g>`);
        const ty = MT + plotH + 18;
        s.push(rotate
          ? `<text transform="translate(${f1(cx + 4)} ${ty}) rotate(-40)" font-size="12" font-weight="600" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(r.name, 24))}</text>`
          : `<text x="${f1(cx)}" y="${ty}" font-size="12" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(r.name, Math.max(3, Math.floor(band / charW(12)))))}</text>`);
      });
    });
    s.push('</svg>');
    return s.join('');
  }
  // Every rating as a grid: one row per case, one column per appraiser and trial.
  function gridSVG(o) {
    const { d, res, labels } = current;
    const many = res.n > 60;
    const rows = many ? res.cases.filter(c => !c.ok) : res.cases;
    const cols = [];
    if (d.hasStd) cols.push({ head: 'Standard', sub: '', get: s => s.std, std: true });
    d.apps.forEach((name, a) => { for (let t = 0; t < d.trials; t++) cols.push({ head: name, sub: d.trials > 1 ? 'Trial ' + (t + 1) : '', get: s => s.r[a][t], a }); });
    const W = drawW, ML = 110, MR = 16, cellH = 24;
    const cw = Math.min(110, (W - ML - MR) / cols.length);
    const MT = (o.title ? 44 : 8) + 62;
    const H = MT + Math.max(1, rows.length) * cellH + 30;
    const s = svgOpen(W, H, o);
    const lx = ML, ly = MT - 50;
    s.push(`<rect x="${lx}" y="${ly - 8}" width="16" height="14" fill="${COLORS.match}"/><text x="${lx + 22}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">${d.hasStd ? 'Matches the standard' : 'Matches the most common rating'}</text>`);
    s.push(`<rect x="${lx + 200}" y="${ly - 8}" width="16" height="14" fill="${COLORS.miss}"/><text x="${lx + 222}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">Differs</text>`);
    if (many) s.push(`<text x="${W - MR}" y="${ly + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">Showing the ${rows.length} of ${res.n} cases with any disagreement</text>`);
    const maxCh = Math.max(3, Math.floor((cw - 6) / charW(11)));
    cols.forEach((c, i) => {
      const cx = ML + cw * (i + 0.5);
      const first = i === 0 || c.a !== cols[i - 1].a;
      s.push(`<text x="${f1(cx)}" y="${MT - 22}" font-size="11" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${first ? esc(trunc(c.head, maxCh)) : ''}</text>`);
      if (c.sub) s.push(`<text x="${f1(cx)}" y="${MT - 8}" font-size="11" text-anchor="middle" fill="${COLORS.muted}">${esc(c.sub)}</text>`);
    });
    s.push(`<text x="${ML - 10}" y="${MT - 8}" font-size="11" font-weight="700" text-anchor="end" fill="${COLORS.ink}">Case</text>`);
    rows.forEach((c, r) => {
      const y0 = MT + r * cellH;
      const all = c.s.r.flat(), counts = {};
      all.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      const ref = d.hasStd ? c.s.std : Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      s.push(`<text x="${ML - 10}" y="${y0 + cellH / 2 + 4}" font-size="12" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(c.s.id, 14))}</text>`);
      cols.forEach((col, i) => {
        const v = col.get(c.s), ok = col.std || v === ref;
        const x0 = ML + cw * i;
        s.push(`<rect x="${f1(x0 + 1)}" y="${y0 + 1}" width="${f1(cw - 2)}" height="${cellH - 2}" fill="${col.std ? COLORS.head : ok ? COLORS.match : COLORS.miss}"><title>${esc(`Case ${c.s.id}, ${col.head}${col.sub ? ' ' + col.sub.toLowerCase() : ''}: ${labels.get(v)}`)}</title></rect>`);
        s.push(`<text x="${f1(x0 + cw / 2)}" y="${y0 + cellH / 2 + 4}" font-size="11" text-anchor="middle" fill="${col.std ? COLORS.ink : ok ? COLORS.matchInk : COLORS.missInk}" pointer-events="none">${esc(trunc(labels.get(v), maxCh))}</text>`);
      });
    });
    if (!rows.length) s.push(`<text x="${W / 2}" y="${MT + 16}" font-size="13" text-anchor="middle" fill="${COLORS.muted}">Every rating agrees.</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function readingParts() {
    const { res, d, labels } = current;
    const paras = [];
    const cname = res.useKendall ? 'Kendall’s coefficient' : 'kappa';
    const cv = r => isFinite(r.coef) ? `${cname} ${k3(r.coef)}, ${rating(r.coef).text.toLowerCase()}` : `${cname} can’t be worked out`;
    const span = r => `${r.x} of ${r.n} cases, ${pc(r.p)}; 95% confidence interval ${pc(r.lo)} to ${pc(r.hi)}`;
    if (res.allStd) {
      paras.push(`<b>${res.A > 1 ? 'Every appraiser' : esc(d.apps[0])} gave the right answer${res.T > 1 ? ' in every trial' : ''} on ${pc(res.allStd.p)} of cases</b> (${span(res.allStd)}; ${cv(res.allStd)}).`);
    }
    if (res.within) {
      const by = res.within.slice().sort((a, b) => a.p - b.p);
      const lo = by[0], hi = by[by.length - 1];
      paras.push(res.A === 1
        ? `<b>Within appraiser:</b> ${esc(lo.name)} gave the same rating in every trial on ${span(lo)} (${cv(lo)}).`
        : `<b>Within appraisers:</b> ${lo.p === hi.p ? `every appraiser gave the same rating in every trial on ${pc(hi.p)} of cases` : `${esc(hi.name)} was the most consistent with themselves, giving the same rating in every trial on ${pc(hi.p)} of cases, and ${esc(lo.name)} the least, on ${pc(lo.p)}`}.${res.within.some(r => rating(r.coef).cls === 'poor') ? ` ${list(res.within.filter(r => rating(r.coef).cls === 'poor').map(r => esc(r.name)))} ${res.within.filter(r => rating(r.coef).cls === 'poor').length > 1 ? 'need' : 'needs'} to improve their consistency.` : ''}`);
    }
    if (res.vsStd && res.A > 1) {
      const by = res.vsStd.slice().sort((a, b) => a.p - b.p);
      const lo = by[0], hi = by[by.length - 1];
      paras.push(`<b>Against the standard:</b> ${lo.p === hi.p ? `every appraiser got ${pc(hi.p)} of cases right` : `${esc(hi.name)} got the most cases right${res.T > 1 ? ' every time' : ''}, ${pc(hi.p)}, and ${esc(lo.name)} the fewest, ${pc(lo.p)}`}.${by.filter(r => rating(r.coef).cls === 'poor').length ? ` ${list(by.filter(r => rating(r.coef).cls === 'poor').map(r => esc(r.name)))} ${by.filter(r => rating(r.coef).cls === 'poor').length > 1 ? 'have' : 'has'} a ${cname} below 0.7.` : ''}`);
    } else if (res.vsStd) {
      paras.push(`<b>Against the standard:</b> ${esc(res.vsStd[0].name)} got ${span(res.vsStd[0])} right${res.T > 1 ? ' in every trial' : ''} (${cv(res.vsStd[0])}).`);
    }
    if (res.disagree) {
      const [c1, c2] = current.cats.map(c => esc(labels.get(c)));
      const worst = res.disagree.filter(r => r.as1 + r.as2 > 0);
      if (worst.length) paras.push(`Where the standard is ${c2}, ${list(worst.filter(r => r.as1).map(r => `${esc(r.name)} said ${c1} on ${r.as1} case${r.as1 > 1 ? 's' : ''}`)) || 'no one consistently said otherwise'}. Where the standard is ${c1}, ${list(worst.filter(r => r.as2).map(r => `${esc(r.name)} said ${c2} on ${r.as2} case${r.as2 > 1 ? 's' : ''}`)) || 'no one consistently said otherwise'}. These are cases rated the same wrong way every time, so they point to a different understanding of the definitions rather than a slip.`);
    }
    if (res.between) {
      paras.push(`<b>Between appraisers:</b> everyone gave the same rating${res.T > 1 ? ' in every trial' : ''} on ${span(res.between)} (${cv(res.between)}).`);
    }
    const review = res.cases.filter(c => !c.ok).sort((a, b) => (b.wrong - a.wrong) || (b.distinct - a.distinct));
    if (review.length) {
      paras.push(`Cases to talk through first, where ${d.hasStd ? 'most ratings missed the standard' : 'the ratings were most mixed'}: ${list(review.slice(0, 5).map(c => esc(c.s.id)))}. The “Every rating, case by case” chart shows them all.`);
    }
    if (res.useKendall) paras.push('Because the categories are in order, Kendall’s coefficients are used instead of kappa: they give credit for ratings that are close to each other, not only for exact matches.');
    if (res.n < 20) paras.push(`There are only ${res.n} cases, so the confidence intervals are wide. Aim for at least 20 to 30 cases that cover the full range.`);
    return paras;
  }
  function summaryText() {
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [els.title.value.trim() || 'Attribute agreement analysis', ''];
    readingParts().forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- tables ----
  const r4 = x => isFinite(x) ? Math.round(x * 1e4) / 1e4 : '';
  function tableRows() {
    const { res, labels } = current;
    const cn = res.useKendall ? 'Kendall’s coefficient' : 'Kappa';
    const out = [];
    const block = (title, rs, named) => {
      out.push([title], [...(named ? ['Appraiser'] : []), '# Inspected', '# Matched', 'Percent', '95% CI from', '95% CI to', cn, 'Rating']);
      rs.forEach(r => out.push([...(named ? [r.name] : []), r.n, r.x, r4(r.p), r4(r.lo), r4(r.hi), r4(r.coef), rating(r.coef).text]));
      out.push([]);
    };
    if (res.within) block('Within appraisers', res.within, true);
    if (res.vsStd) block('Each appraiser versus standard', res.vsStd, true);
    if (res.disagree) {
      const [c1, c2] = current.cats.map(c => labels.get(c));
      out.push(['Assessment disagreement'], ['Appraiser', `# ${c1} / standard ${c2}`, 'Percent', `# ${c2} / standard ${c1}`, 'Percent', '# Mixed', 'Percent']);
      res.disagree.forEach(r => out.push([r.name, r.as1, r4(r.p1), r.as2, r4(r.p2), r.mixed, r4(r.pm)]));
      out.push([]);
    }
    if (res.between) block('Between appraisers', [res.between], false);
    if (res.allStd) block('All appraisers versus standard', [res.allStd], false);
    return out;
  }
  function tableHTML() {
    const { res, labels } = current;
    const cn = res.useKendall ? 'Kendall’s coefficient' : 'Kappa';
    const block = (title, rs, named, note) => {
      let h = `<div class="tablewrap"><h3>${title}</h3><table><caption class="sr">${title}</caption><thead><tr>${named ? '<th>Appraiser</th>' : ''}`;
      h += ['Inspected', 'Matched', 'Percent', '95% confidence interval', cn].map(t => `<th class="num">${t}</th>`).join('') + '<th>Rating</th></tr></thead><tbody>';
      rs.forEach(r => {
        const g = rating(r.coef);
        h += `<tr>${named ? `<td>${esc(r.name)}</td>` : ''}<td class="num">${r.n}</td><td class="num">${r.x}</td><td class="num"><b>${pc(r.p)}</b></td><td class="num">${pc(r.lo)} to ${pc(r.hi)}</td><td class="num">${k3(r.coef)}</td><td class="${g.cls}">${g.text}</td></tr>`;
      });
      return h + `</tbody></table>${note ? `<p class="hint">${note}</p>` : ''}</div>`;
    };
    let h = '';
    if (res.within) h += block('Within appraisers', res.within, true, `Matched: the appraiser gave the same rating in all ${res.T} trials.`);
    else h += '<div class="tablewrap"><h3>Within appraisers</h3><p class="hint">Needs at least two trials per appraiser.</p></div>';
    if (res.vsStd) h += block('Each appraiser versus standard', res.vsStd, true, `Matched: ${res.T > 1 ? 'every trial agreed' : 'the rating agreed'} with the standard.${res.T > 1 ? ` ${res.useKendall ? 'Kendall’s correlation with the standard' : 'Kappa'} is the average over the trials.` : ''}`);
    if (res.disagree) {
      const [c1, c2] = current.cats.map(c => esc(labels.get(c)));
      h += `<div class="tablewrap"><h3>Assessment disagreement</h3><table><caption class="sr">How each appraiser disagreed with the standard</caption><thead><tr><th>Appraiser</th><th class="num">Said ${c1}, standard ${c2}</th><th class="num">Said ${c2}, standard ${c1}</th><th class="num">Mixed</th></tr></thead><tbody>`;
      res.disagree.forEach(r => { h += `<tr><td>${esc(r.name)}</td><td class="num">${r.as1} (${pc(r.p1)})</td><td class="num">${r.as2} (${pc(r.p2)})</td><td class="num">${r.mixed} (${pc(r.pm)})</td></tr>`; });
      h += `</tbody></table><p class="hint">The first two columns count cases rated the same wrong way in every trial, as a share of the cases with that standard. Mixed counts cases where the appraiser’s trials didn’t agree.</p></div>`;
    }
    if (res.between) h += block('Between appraisers', [res.between], false, `Matched: all ${res.A} appraisers gave the same rating${res.T > 1 ? ' in every trial' : ''}.`);
    if (res.allStd) h += block('All appraisers versus standard', [res.allStd], false, `Matched: every rating${res.A > 1 ? ' from every appraiser' : ''} agreed with the standard.`);
    h += `<div class="tablewrap"><h3>Reading ${res.useKendall ? 'Kendall’s coefficients' : 'kappa'}</h3><div class="guide"><b>Above 0.9</b><span>Excellent</span><b>0.7 to 0.9</b><span>Generally acceptable</span><b>Below 0.7</b><span>Needs improvement</span><b>Below 0</b><span>People disagree more than chance would explain</span></div></div>`;
    return h;
  }

  // ---- category order ----
  function renderCats(cats, labels) {
    els.cats.innerHTML = cats.map((c, i) => `<li><span class="rank">${i + 1}</span><span class="name">${esc(labels.get(c))}</span><button type="button" data-move="${i}" data-dir="-1" aria-label="Move ${esc(labels.get(c))} up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-move="${i}" data-dir="1" aria-label="Move ${esc(labels.get(c))} down"${i === cats.length - 1 ? ' disabled' : ''}>↓</button></li>`).join('');
  }
  // Keep the user's order for categories they have seen; add new ones in natural order.
  function orderCats(keys, labels) {
    const natural = keys.slice().sort((a, b) => {
      const x = labels.get(a), y = labels.get(b);
      return isNumText(x) && isNumText(y) ? Number(x) - Number(y) : x.localeCompare(y, 'en-GB', { numeric: true });
    });
    const kept = catOrder.filter(k => keys.includes(k));
    return kept.length ? kept.concat(natural.filter(k => !kept.includes(k))) : natural;
  }

  // ---- render ----
  function update() {
    current = null;
    const text = els.data.value;
    const recs = text.trim() ? splitTable(text).recs : null;
    if (!recs) { els.detected.textContent = ''; els.orderBlock.hidden = true; return renderEmpty('Paste your ratings on the left to check agreement.'); }
    const g = guess(recs);
    ['hasHeader', 'hasId', 'hasStd'].forEach(k => { if (!touched[k]) els[k].checked = g[k]; });
    if (!touched.trials) els.trials.value = String(g.trials);
    const d = parse(recs, { hasHeader: els.hasHeader.checked, hasId: els.hasId.checked, hasStd: els.hasStd.checked, trials: +els.trials.value });
    if (d.error) { els.detected.textContent = d.error; els.orderBlock.hidden = true; return renderEmpty(d.error); }
    const keys = [...d.labels.keys()];
    if (!touched.ordered) els.ordered.checked = keys.length >= 3 && keys.every(k => isNumText(d.labels.get(k)));
    const cats = orderCats(keys, d.labels);
    catOrder = cats.slice();

    let note = `Reading ${d.samples.length} case${d.samples.length === 1 ? '' : 's'}, ${d.nApp} appraiser${d.nApp === 1 ? '' : 's'} (${list(d.apps)}) with ${d.trials} trial${d.trials === 1 ? '' : 's'} each, ${d.hasStd ? 'a known standard, ' : 'no standard, '}and ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}.`;
    if (d.spare) note += ` The last ${d.spare === 1 ? 'column doesn’t' : d.spare + ' columns don’t'} make a full set of trials and ${d.spare === 1 ? 'is' : 'are'} not used: check the number of trials.`;
    if (d.incomplete) note += ` ${d.incomplete} case${d.incomplete > 1 ? 's' : ''} with blank cells left out.`;
    els.detected.textContent = note;

    const ordered = els.ordered.checked;
    els.orderBlock.hidden = !ordered;
    if (ordered) renderCats(cats, d.labels);
    if (d.samples.length < 2) return renderEmpty('Agreement needs at least two complete cases.');
    if (d.nApp === 1 && d.trials === 1 && !d.hasStd) return renderEmpty('With one appraiser and one trial there is nothing to compare. Add a second trial, another appraiser or the known standard.');
    const useKendall = ordered && cats.length >= 3;
    const res = analyse(d, cats, useKendall);
    current = { d, res, cats, labels: d.labels };

    const title = els.title.value.trim();
    const canAgree = !!(res.within || res.vsStd);
    if (!CHARTS[chartType]) chartType = 'agreement';
    if (chartType === 'agreement' && !canAgree) chartType = 'grid';
    const top = res.allStd || res.between || res.within[0];
    const what = res.allStd ? 'every rating matched the standard' : res.between ? 'every appraiser agreed' : `${d.apps[0]} agreed with themselves`;
    const o = { title, aria: (title ? title + '. ' : '') + `${CHARTS[chartType]}. ${d.samples.length} cases, ${d.nApp} appraisers, ${d.trials} trials. ${what} on ${pc(top.p)} of cases.` };
    const svg = drawShown(() => chartType === 'agreement' && canAgree ? agreementSVG(o) : gridSVG(o));
    trackChart({ points: d.samples.length });

    const g2 = rating(top.coef);
    const headline = res.allStd
      ? `${d.nApp > 1 ? 'All appraisers' : esc(d.apps[0])} matched the standard on <strong>${pc(top.p)}</strong> of cases`
      : res.between ? `All appraisers agreed on <strong>${pc(top.p)}</strong> of cases`
      : `${esc(d.apps[0])} agreed with themselves on <strong>${pc(top.p)}</strong> of cases`;
    const cn = useKendall ? 'Kendall’s coefficient' : 'Kappa';
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(`${cn} ${k3(top.coef)}: ${g2.text.toLowerCase()}. ${d.samples.length} cases, ${d.nApp} appraiser${d.nApp === 1 ? '' : 's'}, ${d.trials} trial${d.trials === 1 ? '' : 's'} each, ${useKendall ? 'ordered' : 'unordered'} categories.`)}</p>
      <div class="stats">
        ${res.within ? `<div class="stat"><b>${pc(mean(res.within.map(r => r.p)))}</b><span>Within appraisers (average)</span></div>` : ''}
        ${res.vsStd ? `<div class="stat"><b>${pc(mean(res.vsStd.map(r => r.p)))}</b><span>Appraiser versus standard (average)</span></div>` : ''}
        ${res.between ? `<div class="stat"><b>${pc(res.between.p)}</b><span>Between appraisers</span></div>` : ''}
        ${res.allStd ? `<div class="stat"><b>${pc(res.allStd.p)}</b><span>All appraisers versus standard</span></div>` : ''}
      </div>
      <div class="chartbar"><div class="block"><label for="chartType">Chart</label><select id="chartType">${Object.keys(CHARTS).filter(c => c !== 'agreement' || canAgree).map(c => `<option value="${c}"${c === chartType ? ' selected' : ''}>${CHARTS[c]}</option>`).join('')}</select></div></div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">${chartType === 'agreement' && canAgree ? 'Each dot is the percent of cases an appraiser matched, with a bar for its 95% confidence interval. Hover over a dot to see the figures.' : `Each row is a case and each column an appraiser’s trial. ${d.hasStd ? 'Red cells differ from the standard.' : 'Red cells differ from the most common rating for that case.'}`}</p>
      <div class="reading"><h3>What the study shows</h3>${readingParts().map(x => `<p>${x}</p>`).join('')}</div>
      ${tableHTML()}`;
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
  function fileName() { return slug(els.title.value.trim()); }
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
  function resetAuto() { Object.keys(touched).forEach(k => { touched[k] = false; }); catOrder = []; }
  function loadExample() {
    els.data.value = EXAMPLE;
    els.title.value = 'Pressure ulcer categories: agreement between nurses (example)';
    resetAuto(); chartType = 'agreement';
    update();
  }

  // ---- blank data collection sheet ----
  // Headings the guess step recognises: case, standard, then each appraiser's trials side by side.
  function dataSheet() {
    const cases = 30, apps = ['Appraiser A', 'Appraiser B', 'Appraiser C'], trials = 2;
    const head = ['Case', 'Standard', ...apps.flatMap(a => Array.from({ length: trials }, (_, t) => a + ' trial ' + (t + 1)))].map(v => ({ v, s: 'head' }));
    const rows = [head];
    for (let c = 1; c <= cases; c++) rows.push([c, { v: '', s: 'input' }, ...Array(apps.length * trials).fill({ v: '', s: 'input' })]);
    const notes = [
      'Running the study',
      '1. Choose about 30 cases (samples) that cover every category, including some that are hard to call. Write the correct answer for each in the Standard column, if one is known; otherwise delete that column.',
      '2. Choose two or three people who usually make the decision. Replace “Appraiser A”, “B” and “C” in the headings with their names, keeping the “trial 1”, “trial 2” endings.',
      '3. Each person rates every case, in a random order, without seeing the standard or anyone else’s answers. Repeat for the second trial a few days later, in a different order, without seeing their earlier answers.',
      '4. Write each rating in the shaded box using the same wording every time, such as Yes and No, or the category names. Delete any rows or columns you don’t need, or add more.',
      '',
      'Analysing the results',
      'Save this workbook, then in the Attribute agreement analysis tool choose Data sheet, then Import filled data sheet, and pick this file. Or select the whole table on the Data sheet, including the headings, copy it and paste it into the tool.'
    ];
    return [
      { name: 'Data', cols: [8, 14, ...Array(apps.length * trials).fill(20)], rows, freeze: 1 },
      { name: 'Instructions', cols: [100], rows: notes.map((v, i) => [{ v, s: i === 0 || v === 'Analysing the results' ? 'title' : 'wrap' }]) }
    ];
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  ['hasHeader', 'hasId', 'hasStd', 'trials', 'ordered'].forEach(k => els[k].addEventListener('change', () => { touched[k] = true; update(); }));
  els.title.addEventListener('input', schedule);
  els.cats.addEventListener('click', e => {
    const b = e.target.closest('button[data-move]'); if (!b) return;
    const i = +b.dataset.move, j = i + +b.dataset.dir;
    if (j < 0 || j >= catOrder.length) return;
    [catOrder[i], catOrder[j]] = [catOrder[j], catOrder[i]];
    update();
    const again = els.cats.querySelector(`button[data-move="${j}"][data-dir="${b.dataset.dir}"]`) || els.cats.querySelector(`button[data-move="${j}"]:not([disabled])`);
    if (again) again.focus();
  });
  trackSettings({ trials: 'trials', ordered: 'ordered', chartType: 'chartType' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; resetAuto(); update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  els.result.addEventListener('change', e => { if (e.target.id === 'chartType') { chartType = e.target.value; update(); $('chartType').focus(); } });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'attribute_agreement', toolName: 'attribute agreement analysis',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ catOrder, chartType }),
    setExtra: x => { if (x) { if (Array.isArray(x.catOrder)) catOrder = x.catOrder.map(String); if (CHARTS[x.chartType]) chartType = x.chartType; } },
    afterOpen: () => { Object.keys(touched).forEach(k => { touched[k] = true; }); update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) }))),
    template: { fileName: 'attribute-agreement-data-sheet.xlsx', sheets: dataSheet, import: [{ sheet: 'Data', into: '#data', fixed: 1 }] }
  });
})();

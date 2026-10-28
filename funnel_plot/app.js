/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'), dates: $('dates'), measure: $('measure'),
    popLabel: $('popLabel'), scale: $('scale'), centre: $('centre'), xMin: $('xMin'), xMax: $('xMax'), showWarn: $('showWarn'),
    labels: $('labels'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', point: '#005EB8', centre: '#003087', limit: '#AE2573', warn: '#768692', outlier: '#ED8B00', outlierEdge: '#A65300' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const MAX_ROWS = 200;
  const Z_CONTROL = 3, Z_WARN = 1.96;

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

  // Example: referrals to dermatology from 24 GP practices over a year, with registered list sizes (made-up data)
  const EXAMPLE = [
    'Practice\tReferrals\tRegistered patients',
    'Abbey Road Surgery\t131\t11840', 'Brook Lane Practice\t62\t5320', 'Castle Medical Centre\t248\t21650',
    'Dene Park Surgery\t41\t3120', 'Elm Grove Practice\t176\t12480', 'Fairfield Health Centre\t96\t8950',
    'Green Street Surgery\t19\t2410', 'Harbour View Practice\t143\t13760', 'Ivy House Surgery\t74\t6230',
    'Juniper Medical Practice\t58\t7540', 'Kingsway Health Centre\t219\t18320', 'Linden Surgery\t33\t2960',
    'Market Square Practice\t112\t9870', 'Northgate Medical Centre\t157\t16240', 'Oak Tree Surgery\t48\t4110',
    'Park View Practice\t90\t7680', 'Queens Road Surgery\t131\t15890', 'Riverside Medical Centre\t205\t17410',
    'St Mary’s Surgery\t67\t5480', 'Tower Hill Practice\t118\t10260', 'Upton Health Centre\t31\t2050',
    'Victoria Surgery\t154\t14320', 'Westfield Practice\t84\t6970', 'Yew Tree Medical Centre\t101\t8640'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'funnel-plot';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ---- parsing ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { splitTable: split, readNumber: num, isNumberCell: isNum, numericShare: numShare } = FocusStats;

  // The last two number columns are the events and the population size; the first
  // column, if it isn't numbers, holds the names.
  function shape(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    const numeric = [];
    for (let c = 0; c < ncol; c++) if (numShare(recs, c, delim) >= 0.6) numeric.push(c);
    if (numeric.length < 2) return null;
    const ev = numeric[numeric.length - 2], pop = numeric[numeric.length - 1];
    const name = numeric[0] === 0 && ev === 0 ? -1 : 0;
    const headerGuess = recs.length > 1 && (!isNum(recs[0][ev], delim) || !isNum(recs[0][pop], delim));
    return { ncol, ev, pop, name, headerGuess };
  }

  function parse(text, hasHeader) {
    const s = split(text);
    if (!s) return null;
    const { recs, delim } = s;
    const sh = shape(recs, delim);
    if (!sh) return { rows: [], skipped: 0, noShape: true };
    const head = hasHeader ? recs[0] : null;
    const body = hasHeader ? recs.slice(1) : recs;
    const rows = [];
    let skipped = 0, extra = 0;
    body.forEach((r, i) => {
      const e = num(r[sh.ev], delim), n = num(r[sh.pop], delim);
      if (!isFinite(e) || !isFinite(n) || e < 0 || n <= 0) { skipped++; return; }
      if (rows.length >= MAX_ROWS) { extra++; return; }
      const name = (sh.name >= 0 && r[sh.name]) || 'Row ' + (i + 1);
      rows.push({ name, e, n });
    });
    return {
      rows, skipped, extra, ncol: sh.ncol, used: sh.name >= 0 ? 3 : 2,
      nameHead: (head && sh.name >= 0 && head[sh.name]) || 'Name',
      evHead: (head && head[sh.ev]) || '', popHead: (head && head[sh.pop]) || ''
    };
  }

  // ---- statistics ----
  // Limits around the centre line p for a population of size n: binomial for
  // proportions, Poisson when events can outnumber the population.
  function limitsAt(p, n, z, poisson) {
    const se = poisson ? Math.sqrt(p / n) : Math.sqrt(p * (1 - p) / n);
    return { lo: Math.max(0, p - z * se), hi: poisson ? p + z * se : Math.min(1, p + z * se) };
  }
  function analyse(rows, centreMethod) {
    const E = rows.reduce((a, r) => a + r.e, 0), N = rows.reduce((a, r) => a + r.n, 0);
    rows.forEach(r => { r.p = r.e / r.n; });
    const p = centreMethod === 'mean' ? rows.reduce((a, r) => a + r.p, 0) / rows.length : E / N;
    const poisson = rows.some(r => r.e > r.n) || p >= 1;
    const out = rows.map(r => {
      const c = limitsAt(p, r.n, Z_CONTROL, poisson), w = limitsAt(p, r.n, Z_WARN, poisson);
      const status = r.p > c.hi ? 'above' : r.p < c.lo ? 'below' : (r.p > w.hi || r.p < w.lo) ? 'warn' : 'within';
      return Object.assign({}, r, { lcl: c.lo, ucl: c.hi, lwl: w.lo, uwl: w.hi, status });
    });
    return { rows: out, p, E, N, poisson };
  }

  // ---- axis ----
  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function axis(lo, hi, target, fixLo, fixHi) {
    if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep(hi - lo, target || 6);
    const a = fixLo ? lo : Math.floor(lo / step) * step, b = fixHi ? hi : Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = Math.ceil(a / step - 1e-9) * step; t <= b + step * 1e-6; t += step) ticks.push(+t.toPrecision(12));
    return { min: a, max: b, ticks };
  }

  // ---- formatting ----
  // Rates are shown to about three significant figures.
  function fr(v) {
    if (!isFinite(v)) return '–';
    const a = Math.abs(v);
    const d = a === 0 ? 0 : Math.min(6, Math.max(1, 2 - Math.floor(Math.log10(a))));
    return v.toLocaleString('en-GB', { maximumFractionDigits: d });
  }
  function rateUnit(o) {
    if (o.scale === 1) return '';
    if (o.scale === 100) return '%';
    return ' per ' + nf.format(o.scale) + (o.popName ? ' ' + lower(o.popName) : '');
  }
  const rateText = (v, o) => fr(v * o.scale) + rateUnit(o);
  function yLabel(o) {
    const m = o.measure || 'Rate';
    if (o.scale === 1) return o.measure ? `${m} as a proportion` : 'Rate';
    if (o.scale === 100) return `${m} (%)`;
    return `${m} per ${nf.format(o.scale)}${o.popName ? ' ' + lower(o.popName) : ''}`;
  }

  // ---- drawing ----
  const charW = size => size * 0.56;
  function renderSVG(a, o) {
    const W = drawW, M = 16;
    const legend = [['point', 'Population'], ['centre', o.centreMethod === 'mean' ? 'Average of rates' : 'Overall rate'], ['limit', '99.7% limits']];
    if (o.showWarn) legend.push(['warn', '95% limits']);
    if (a.rows.some(r => r.status === 'above' || r.status === 'below')) legend.push(['outlier', 'Outlier']);
    const MT = (o.chartTitle ? 44 : 8) + 30;
    const ML = 96, MR = 28, plotW = W - ML - MR, plotH = 420, MB = 62, H = MT + plotH + MB;
    const k = o.scale;

    // horizontal axis: population size
    const nMax = Math.max(...a.rows.map(r => r.n)), nMin = Math.min(...a.rows.map(r => r.n));
    const xLo = o.xMin != null ? o.xMin : 0, xHi = o.xMax != null ? o.xMax : nMax * 1.04;
    const ax = axis(xLo, xHi, 7, o.xMin != null, o.xMax != null);
    const x = v => ML + (v - ax.min) / (ax.max - ax.min) * plotW;

    // vertical axis: the points, and the limits for the smallest population shown
    const shown = a.rows.filter(r => r.n >= ax.min && r.n <= ax.max);
    const nRef = Math.max(shown.length ? Math.min(...shown.map(r => r.n)) : nMin, ax.min, 1e-9);
    const refC = limitsAt(a.p, nRef, Z_CONTROL, a.poisson);
    const ys = (shown.length ? shown : a.rows).map(r => r.p).concat([a.p, refC.lo, refC.hi]).map(v => v * k);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (lo >= 0 && lo < hi * 0.4) lo = 0;
    const ay = axis(lo, hi + (hi - lo) * 0.04, 6);
    if (ay.min < 0 && lo >= 0) { ay.ticks = ay.ticks.filter(t => t >= 0); ay.min = 0; }
    const y = v => MT + plotH - (v * k - ay.min) / (ay.max - ay.min) * plotH;
    const f = v => Math.round(v * 10) / 10;

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    s.push(`<defs><clipPath id="fpClip"><rect x="${ML}" y="${MT}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);
    if (o.chartTitle) s.push(`<text x="${M}" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.chartTitle, Math.min(80, Math.floor((W - (M) - 16) / 11.2))))}</text>`);

    // legend, right-aligned above the plot
    const keyW = t => 30 + charW(12) * t.length + 16;
    let lx = W - MR - legend.reduce((acc, [, t]) => acc + keyW(t), 0);
    const ly = MT - 16;
    legend.forEach(([kind, t]) => {
      const cx = lx + 11;
      if (kind === 'point') s.push(`<circle cx="${cx}" cy="${ly}" r="4.5" fill="${COLORS.point}" fill-opacity="0.85"/>`);
      if (kind === 'centre') s.push(`<line x1="${cx - 11}" y1="${ly}" x2="${cx + 11}" y2="${ly}" stroke="${COLORS.centre}" stroke-width="2.5"/>`);
      if (kind === 'limit') s.push(`<line x1="${cx - 11}" y1="${ly}" x2="${cx + 11}" y2="${ly}" stroke="${COLORS.limit}" stroke-width="2" stroke-dasharray="6 4"/>`);
      if (kind === 'warn') s.push(`<line x1="${cx - 11}" y1="${ly}" x2="${cx + 11}" y2="${ly}" stroke="${COLORS.warn}" stroke-width="1.5" stroke-dasharray="2 3"/>`);
      if (kind === 'outlier') s.push(`<path d="M${cx} ${ly - 6}L${cx + 6} ${ly}L${cx} ${ly + 6}L${cx - 6} ${ly}Z" fill="${COLORS.outlier}" stroke="${COLORS.outlierEdge}" stroke-width="1"/>`);
      s.push(`<text x="${lx + 27}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">${esc(t)}</text>`);
      lx += keyW(t);
    });

    // grid and axes
    ay.ticks.forEach(t => {
      const yy = f(MT + plotH - (t - ay.min) / (ay.max - ay.min) * plotH);
      s.push(`<line x1="${ML}" y1="${yy}" x2="${W - MR}" y2="${yy}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${yy + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(fr(t))}</text>`);
    });
    ax.ticks.forEach(t => {
      const xx = f(x(t));
      s.push(`<line x1="${xx}" y1="${MT + plotH}" x2="${xx}" y2="${MT + plotH + 5}" stroke="${COLORS.axis}"/>`);
      s.push(`<text x="${xx}" y="${MT + plotH + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(nf.format(t))}</text>`);
    });
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    s.push(`<text transform="translate(${M + 8} ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(yLabel(o), 60))}</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${MT + plotH + 48}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.popName || 'Population size', 70))}</text>`);

    // funnel: limits worked out along the whole axis, packed towards small populations where they curve most
    s.push('<g clip-path="url(#fpClip)">');
    const STEPS = 240, start = Math.max(ax.min, (ax.max - ax.min) / 4000);
    const ns = [];
    for (let i = 0; i <= STEPS; i++) ns.push(start + (ax.max - start) * Math.pow(i / STEPS, 2));
    const curve = (z, side) => 'M' + ns.map(n => `${f(x(n))} ${f(Math.max(MT - 40, Math.min(MT + plotH + 40, y(limitsAt(a.p, n, z, a.poisson)[side]))))}`).join('L');
    if (o.showWarn) ['lo', 'hi'].forEach(side => s.push(`<path d="${curve(Z_WARN, side)}" fill="none" stroke="${COLORS.warn}" stroke-width="1.5" stroke-dasharray="2 3"/>`));
    ['lo', 'hi'].forEach(side => s.push(`<path d="${curve(Z_CONTROL, side)}" fill="none" stroke="${COLORS.limit}" stroke-width="2" stroke-dasharray="6 4"/>`));
    s.push(`<line x1="${ML}" y1="${f(y(a.p))}" x2="${W - MR}" y2="${f(y(a.p))}" stroke="${COLORS.centre}" stroke-width="2.5"/>`);

    // points, outliers drawn last so they sit on top
    const pts = a.rows.slice().sort((p, q) => (p.status === 'above' || p.status === 'below') - (q.status === 'above' || q.status === 'below'));
    pts.forEach(r => {
      const out = r.status === 'above' || r.status === 'below';
      const cx = f(x(r.n)), cy = f(y(r.p));
      const res = r.status === 'above' ? 'above the upper 99.7% limit' : r.status === 'below' ? 'below the lower 99.7% limit' : r.status === 'warn' ? 'outside the 95% limits but within the 99.7% limits' : 'within the limits';
      const tip = `${r.name}: ${nf.format(r.e)}${o.measure ? ' ' + lower(o.measure) : ' events'} in ${nf.format(r.n)}${o.popName ? ' ' + lower(o.popName) : ''}. Rate ${rateText(r.p, o)}; 99.7% limits ${rateText(r.lcl, o)} to ${rateText(r.ucl, o)}. ${res.charAt(0).toUpperCase() + res.slice(1)}.`;
      s.push(`<g><title>${esc(tip)}</title>`);
      if (out) s.push(`<path d="M${cx} ${f(cy - 7)}L${f(cx + 7)} ${cy}L${cx} ${f(cy + 7)}L${f(cx - 7)} ${cy}Z" fill="${COLORS.outlier}" stroke="${COLORS.outlierEdge}" stroke-width="1.2"/>`);
      else s.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${COLORS.point}" fill-opacity="0.8" stroke="#ffffff" stroke-width="1"/>`);
      s.push('</g>');
    });
    s.push('</g>');

    // outlier labels, kept inside the plot
    if (o.labels) {
      pts.filter(r => r.status === 'above' || r.status === 'below').forEach(r => {
        const cx = x(r.n), cy = y(r.p);
        if (cx < ML || cx > W - MR || cy < MT || cy > MT + plotH) return;
        const t = trunc(r.name, 26), w = charW(12) * t.length;
        const right = cx + 10 + w < W - MR;
        const ty = Math.max(MT + 12, Math.min(MT + plotH - 4, cy + 4));
        s.push(`<text x="${f(right ? cx + 10 : cx - 10)}" y="${f(ty)}" font-size="12" font-weight="600" text-anchor="${right ? 'start' : 'end'}" fill="${COLORS.ink}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(t)}</text>`);
      });
    }
    s.push('</svg>');
    return { svg: s.join(''), hidden: a.rows.length - shown.length };
  }

  // ---- plain-language reading ----
  function readingParts(a, o) {
    const paras = [];
    const rows = a.rows, n = rows.length;
    const above = rows.filter(r => r.status === 'above'), below = rows.filter(r => r.status === 'below'), warn = rows.filter(r => r.status === 'warn');
    const names = rs => list(rs.map(r => '<b>' + esc(r.name) + '</b>'));
    paras.push(o.centreMethod === 'mean'
      ? `The average of the ${n} populations’ rates is <b>${esc(rateText(a.p, o))}</b>. This is the centre line, and the limits are worked out around it.`
      : `Across all ${n} populations there ${a.E === 1 ? 'was' : 'were'} ${nf.format(a.E)}${o.measure ? ' ' + esc(lower(o.measure)) : ' events'} in ${nf.format(a.N)}${o.popName ? ' ' + esc(lower(o.popName)) : ''}, an overall rate of <b>${esc(rateText(a.p, o))}</b>. This is the centre line, and the limits are worked out around it.`);
    if (!above.length && !below.length) {
      paras.push(`Every population is within the 99.7% limits, so the differences between them are no more than you would expect by chance, given their sizes.`);
    } else {
      if (above.length) paras.push(`${names(above)} ${above.length === 1 ? 'is' : 'are'} above the upper limit: ${above.length === 1 ? 'its rate is' : 'their rates are'} higher than chance alone would explain for ${above.length === 1 ? 'a population of its size' : 'populations of their size'}.`);
      if (below.length) paras.push(`${names(below)} ${below.length === 1 ? 'is' : 'are'} below the lower limit: ${below.length === 1 ? 'its rate is' : 'their rates are'} lower than chance alone would explain.`);
      paras.push(`A point outside the limits is unusual and worth investigating. Check the data first, such as whether events are counted and recorded the same way everywhere, then look for differences in the patients or the process${below.length ? '. A low outlier may be doing something others can learn from' : ''}.`);
    }
    const top = rows.slice().sort((p, q) => q.p - p.p)[0];
    if (n > 2 && top.status !== 'above' && above.length) paras.push(`${esc(top.name)} has the highest rate, ${esc(rateText(top.p, o))}, but its population is small enough that this is within its limits. Whether a rate stands out depends on the population size as well as the rate.`);
    if (o.showWarn && warn.length) paras.push(`${names(warn)} ${warn.length === 1 ? 'is' : 'are'} outside the 95% limits but inside the 99.7% limits. About 1 population in 20 lands here by chance, so keep an eye on ${warn.length === 1 ? 'it' : 'them'} rather than acting yet.`);
    if (n >= 10 && (above.length + below.length) / n > 0.2) paras.push(`More than a fifth of the populations are outside the limits. This often happens with large populations, where real differences such as case mix make the limits too narrow. Treat the limits as a guide and consider adjusting for case mix.`);
    if (n < 5) paras.push(`There ${n === 1 ? 'is only 1 population' : `are only ${n} populations`}. A funnel plot is most useful when comparing many populations; add more if you can.`);
    if (a.poisson) paras.push(`At least one population has more events than its size, so the limits use the Poisson standard error, for rates, rather than the binomial, for proportions.`);
    return paras;
  }
  function summaryText() {
    const { a, o } = current;
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [o.chartTitle || 'Funnel plot', ''];
    readingParts(a, o).forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- table ----
  const STATUS = { above: 'Above upper limit', below: 'Below lower limit', warn: 'Outside 95% limits', within: 'Within limits' };
  // Highest rate first, as in the NHS Improvement spreadsheet.
  const ordered = () => current.a.rows.slice().sort((p, q) => q.p - p.p);
  const r6 = v => +(+v.toPrecision(6));
  function tableRows() {
    const { o } = current;
    const unit = o.scale === 1 ? 'Rate' : o.scale === 100 ? 'Rate (%)' : `Rate per ${nf.format(o.scale)}`;
    const out = [[o.nameHead, o.measure || 'Events', o.popName || 'Population', unit, 'Lower 99.7% limit', 'Upper 99.7% limit', 'Lower 95% limit', 'Upper 95% limit', 'Result']];
    ordered().forEach(r => out.push([r.name, r.e, r.n, r6(r.p * o.scale), r6(r.lcl * o.scale), r6(r.ucl * o.scale), r6(r.lwl * o.scale), r6(r.uwl * o.scale), STATUS[r.status]]));
    return out;
  }
  function tableHTML() {
    const { o } = current;
    const unit = o.scale === 1 ? 'Rate' : o.scale === 100 ? 'Rate (%)' : `Rate per ${nf.format(o.scale)}`;
    let h = '<div class="tablewrap"><table><caption class="sr">Table of results, highest rate first</caption><thead><tr>';
    h += `<th>${esc(o.nameHead)}</th>` + [o.measure || 'Events', o.popName || 'Population', unit, '99.7% limits'].map(t => `<th class="num">${esc(t)}</th>`).join('') + '<th>Result</th>';
    h += '</tr></thead><tbody>';
    ordered().forEach(r => {
      const out = r.status === 'above' || r.status === 'below';
      h += `<tr${out ? ' class="out"' : ''}><td>${esc(r.name)}</td><td class="num">${nf.format(r.e)}</td><td class="num">${nf.format(r.n)}</td>` +
        `<td class="num"><b>${esc(fr(r.p * o.scale))}</b></td><td class="num">${esc(fr(r.lcl * o.scale))} – ${esc(fr(r.ucl * o.scale))}</td>` +
        `<td${out ? ' class="flag"' : ''}>${STATUS[r.status === 'warn' && !o.showWarn ? 'within' : r.status]}</td></tr>`;
    });
    h += '</tbody></table></div>';
    return h;
  }

  // ---- render ----
  function optNum(el) { const v = el.value.trim() === '' ? NaN : Number(el.value); return isFinite(v) && v >= 0 ? v : null; }
  function update() {
    const text = els.data.value;
    const sp = split(text);
    if (!headerTouched) { const sh = sp && sp.recs.length > 1 && shape(sp.recs, sp.delim); els.hasHeader.checked = !!(sh && sh.headerGuess); }
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to build your chart.'); }
    const p = parse(text, els.hasHeader.checked);
    if (!p || p.noShape || !p.rows.length) {
      els.detected.textContent = p && p.skipped ? `Couldn’t read any rows: each needs a count of 0 or more and a population above 0.` : 'Couldn’t find two columns of numbers.';
      return renderEmpty('Paste three columns: a name, the number of events and the population size.');
    }
    let note = `Reading ${plural(p.rows.length, 'population', 'populations')}, with ${p.used === 3 ? 'a name, ' : 'no names, '}the number of events and the population size.`;
    if (p.ncol > p.used) note += ` ${p.ncol - p.used === 1 ? '1 column is' : (p.ncol - p.used) + ' columns are'} not used.`;
    if (p.extra) note += ` Only the first ${MAX_ROWS} populations are used.`;
    if (p.skipped) note += ` ${plural(p.skipped, 'row', 'rows')} skipped (need a count of 0 or more and a population above 0).`;

    const centreMethod = els.centre.value;
    const a = analyse(p.rows, centreMethod);
    let xMin = optNum(els.xMin), xMax = optNum(els.xMax);
    if (xMin != null && xMax != null && xMax <= xMin) { note += ' The axis maximum must be more than the minimum, so automatic limits are used.'; xMin = xMax = null; }

    const measure = els.measure.value.trim() || p.evHead;
    const popName = els.popLabel.value.trim() || p.popHead;
    const dates = els.dates.value.trim();
    const o = {
      measure, popName, dates, centreMethod, xMin, xMax, nameHead: p.nameHead,
      scale: Number(els.scale.value) || 1, showWarn: els.showWarn.checked, labels: els.labels.checked
    };
    o.chartTitle = [els.title.value.trim() || (els.measure.value.trim() ? yLabel(o) : ''), dates].filter(Boolean).join(', ');
    const outs = a.rows.filter(r => r.status === 'above' || r.status === 'below');
    o.aria = (o.chartTitle ? o.chartTitle + '. ' : '') + `Funnel plot of ${plural(a.rows.length, 'population', 'populations')}. Centre line ${rateText(a.p, o)}. ` +
      (outs.length ? `Outside the 99.7% limits: ${outs.slice(0, 10).map(r => `${r.name} (${STATUS[r.status].toLowerCase()})`).join(', ')}${outs.length > 10 ? ' and more' : ''}.` : 'Every population is within the 99.7% limits.');
    const drawn = drawShown(() => renderSVG(a, o));
    trackChart({ points: a.rows.length });
    if (drawn.hidden) note += ` ${plural(drawn.hidden, 'population is', 'populations are')} outside the horizontal axis range you set, so not drawn.`;
    els.detected.textContent = note;
    current = { a, o };

    const above = a.rows.filter(r => r.status === 'above').length, below = a.rows.filter(r => r.status === 'below').length;
    const headline = outs.length
      ? `<strong>${outs.length} of ${a.rows.length}</strong> populations ${outs.length === 1 ? 'is' : 'are'} outside the limits`
      : `All <strong>${a.rows.length}</strong> populations are within the limits`;
    const sub = outs.length
      ? 'Points outside the dashed 99.7% limits are unusual for a population of their size: investigate them further.'
      : 'The differences between the populations are no more than you would expect by chance, given their sizes.';
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${a.rows.length}</b><span>Populations</span></div>
        <div class="stat"><b>${esc(fr(a.p * o.scale))}${o.scale === 100 ? '%' : ''}</b><span>${centreMethod === 'mean' ? 'Average rate' : 'Overall rate'}${o.scale > 100 ? ' per ' + nf.format(o.scale) : ''}</span></div>
        <div class="stat"><b>${above}</b><span>Above upper limit</span></div>
        <div class="stat"><b>${below}</b><span>Below lower limit</span></div>
      </div>
      <div class="chartwrap fit" id="chart">${drawn.svg}</div>
      <p class="legend-note">Hover over a point to see its figures. Rows outside the 99.7% limits are highlighted in the table.</p>
      <div class="reading"><h3>What the chart shows</h3>${readingParts(a, o).map(x => `<p>${x}</p>`).join('')}</div>
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
  function fileName() { return slug(current && current.o.chartTitle); }
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
    els.data.value = EXAMPLE;
    els.title.value = 'Dermatology referrals by GP practice (example)';
    els.dates.value = 'April 2025 to March 2026';
    els.measure.value = 'Referrals';
    els.popLabel.value = 'Registered patients';
    els.scale.value = '10000';
    els.centre.value = 'pooled';
    els.xMin.value = ''; els.xMax.value = '';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  [els.title, els.dates, els.measure, els.popLabel, els.xMin, els.xMax].forEach(el => el.addEventListener('input', schedule));
  [els.scale, els.centre, els.showWarn, els.labels].forEach(el => el.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ scale: 'scale', centre: 'centre', showWarningLimits: 'showWarn', labelOutliers: 'labels' });
  $('clearBtn').addEventListener('click', () => {
    ['data', 'title', 'dates', 'measure', 'popLabel', 'xMin', 'xMax'].forEach(k => { els[k].value = ''; });
    headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared();
  });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'funnel_plot', toolName: 'funnel plot',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

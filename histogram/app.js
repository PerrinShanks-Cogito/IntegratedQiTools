/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), col: $('col'), colBlock: $('colBlock'),
    title: $('title'), xLabel: $('xLabel'), binMode: $('binMode'), binVal: $('binVal'), binStart: $('binStart'),
    lsl: $('lsl'), usl: $('usl'), showMean: $('showMean'), showNormal: $('showNormal'), asPct: $('asPct'),
    showLabels: $('showLabels'), result: $('result')
  };
  const COLORS = { bar: '#005EB8', out: '#A9C6E8', mean: '#AE2573', median: '#4C6272', normal: '#212B32', limit: '#D5281B', ink: '#212B32', muted: '#4C6272', grid: '#E3E8EB' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const pct = v => (Math.round(v * 10) / 10).toFixed(1);
  const MAX_BINS = 200;

  let headerTouched = false;
  let colTouched = false;
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
  // On screen, shorten a long title to fit the width (exports keep it whole, as before)
  const fitText = (t, n) => t.length > n ? t.slice(0, Math.max(1, Math.floor(n) - 1)) + '…' : t;
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

  const EXAMPLE = 'Minutes to triage\n' + [18,30,25,8,7,9,21,11,29,27,12,18,14,30,26,8,32,18,22,40,16,25,35,21,13,7,37,33,27,45,23,9,30,43,20,6,13,8,12,20,10,26,42,17,19,13,15,28,20,25,32,55,50,20,11,15,19,11,6,29,16,19,46,23,10,19,6,25,26,25,48,16,13,25,18,42,47,42,15,19,6,16,67,15,14,29,45,30,10,57,36,13,18,21,35,12,56,12,19,25,22,16,16,16,12,19,27,21,24,25,22,3,13,35,18,26,11,16,38,26].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = s => s.trim().replace(/^"(.*)"$/, '$1').trim();
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'histogram';

  // ---- parsing ----

  function analyse(text) {
    // a single pasted line of numbers ("12, 15, 9 ...") becomes one value per row
    const s = splitTable(text);
    if (!s) return null;
    const { recs: rows, delim } = s;
    const ncols = Math.max(...rows.map(r => r.length));
    const rest = rows.length > 1 ? rows.slice(1) : rows;
    const frac = [];
    for (let c = 0; c < ncols; c++) {
      const ok = rest.filter(r => r[c] !== undefined && !isNaN(toNum(r[c], delim))).length;
      frac.push(ok / rest.length);
    }
    const best = Math.max(...frac);
    let autoCol = 0;
    // prefer the right-most well-filled numeric column (IDs and dates usually come first)
    for (let c = 0; c < ncols; c++) if (frac[c] > 0 && frac[c] >= best * 0.8) autoCol = c;
    const firstBad = c => rows.length > 1 && rows[0][c] !== undefined && clean(rows[0][c]) !== '' && isNaN(toNum(rows[0][c], delim));
    const names = [];
    for (let c = 0; c < ncols; c++) names.push(firstBad(c) ? clean(rows[0][c]) : 'Column ' + (c + 1));
    return { rows, delim, ncols, autoCol, names, headerGuess: firstBad(autoCol), firstBad };
  }

  function parse(a, hasHeader, col) {
    const data = hasHeader ? a.rows.slice(1) : a.rows;
    const label = hasHeader && a.rows[0][col] !== undefined ? clean(a.rows[0][col]) : '';
    const values = [];
    let skipped = 0;
    for (const r of data) {
      const v = r[col] === undefined ? NaN : toNum(r[col], a.delim);
      if (isFinite(v)) values.push(v); else skipped++;
    }
    return { values, skipped, label };
  }

  // ---- statistics ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { normCdf, quantile, andersonDarling, splitTable, readNumber: toNum } = FocusStats;


  function describe(values) {
    const s = values.slice().sort((a, b) => a - b);
    const n = s.length;
    const mean = s.reduce((t, v) => t + v, 0) / n;
    const m2 = s.reduce((t, v) => t + (v - mean) ** 2, 0);
    const sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
    let skew = 0;
    if (n > 2 && m2 > 0) {
      const g1 = (s.reduce((t, v) => t + (v - mean) ** 3, 0) / n) / Math.pow(m2 / n, 1.5);
      skew = g1 * Math.sqrt(n * (n - 1)) / (n - 2);
    }
    return { sorted: s, n, mean, sd, skew, min: s[0], max: s[n - 1], median: quantile(s, 0.5), q1: quantile(s, 0.25), q3: quantile(s, 0.75) };
  }



  function adText(ad, n) {
    if (!ad) return n < 8 ? 'Needs at least 8 values to test whether the data are normally distributed.' : 'All values are the same, so normality cannot be tested.';
    const verdict = ad.p < 0.05
      ? 'The data are unlikely to come from a normal distribution (p < 0.05). Be careful using methods that assume normality, and use the median rather than the mean as the typical value.'
      : 'There is no strong evidence that the data are not normally distributed (p ≥ 0.05).';
    return verdict + (n > 300 && ad.p < 0.05 ? ' With this many values, even small departures from normality show up as significant — check the shape of the chart too.' : '');
  }

  function niceStep(x) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    const nfac = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nfac * Math.pow(10, e);
  }
  // nearest 1, 2, 2.5 or 5 × 10^n, so automatic bins neither balloon nor shrink much
  function niceNear(x) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    const nfac = [1, 2, 2.5, 5, 10].reduce((b, c) => Math.abs(Math.log(c / f)) < Math.abs(Math.log(b / f)) ? c : b);
    return nfac * Math.pow(10, e);
  }
  const tidy = v => +v.toPrecision(12);
  function decimalsOf(v) {
    const s = String(+Math.abs(v).toPrecision(6));
    if (/e-/.test(s)) return 6;
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  function makeBins(st, mode, val, startOpt) {
    const { min, max, n } = st;
    const range = max - min;
    let width, start, count, exact = false, note = '';
    const auto = () => {
      if (range === 0) return niceStep(Math.abs(min) / 10 || 1);
      const sturges = range / (Math.log2(n) + 1);
      const fd = 2 * (st.q3 - st.q1) / Math.cbrt(n);
      let w = niceNear(fd > 0 ? Math.min(fd, sturges) : sturges);
      if (range / w > 40) w = niceStep(range / 40);
      return w;
    };
    if (mode === 'count' && val >= 1 && range > 0) {
      count = Math.min(Math.round(val), MAX_BINS);
      start = startOpt !== null && startOpt <= min ? startOpt : min;
      width = (max - start) / count;
      exact = true;
    } else {
      width = mode === 'width' && val > 0 ? val : auto();
      if (mode !== 'auto' && !(mode === 'width' && val > 0)) note = 'Enter a positive value to set the bins — using automatic bins for now.';
      start = startOpt !== null && startOpt <= min ? startOpt : Math.floor(min / width + 1e-9) * width;
      count = Math.floor((max - start) / width + 1e-9) + 1;
      if (count > MAX_BINS) {
        note = 'That bin width gives more than ' + MAX_BINS + ' bins — using automatic bins instead.';
        width = auto();
        start = Math.floor(min / width + 1e-9) * width;
        count = Math.floor((max - start) / width + 1e-9) + 1;
      }
    }
    if (startOpt !== null && startOpt > min) note = (note ? note + ' ' : '') + 'The first bin must start at or below the smallest value (' + nf.format(min) + '), so your start value was ignored.';
    start = tidy(start); width = tidy(width);
    const bins = [];
    for (let i = 0; i < count; i++) bins.push({ lo: tidy(start + i * width), hi: tidy(start + (i + 1) * width), n: 0 });
    for (const v of st.sorted) {
      let i = Math.floor((v - start) / width + 1e-9);
      if (i >= count) i = count - 1;
      if (i < 0) i = 0;
      bins[i].n++;
    }
    let cum = 0;
    bins.forEach(b => { cum += b.n; b.pct = b.n / n * 100; b.cum = cum / n * 100; });
    const dec = Math.min(4, Math.max(decimalsOf(width), decimalsOf(start)));
    return { bins, width, start, exact, dec, note };
  }

  // IHI QI Essentials Toolkit: the histogram shows patterns that an average hides, such as
  // separate clumps of values or gaps. Peaks in the bins count as separate groups when the dip
  // between them is deep: down to half the smaller peak or less, and by more than chance alone
  // usually gives (the drop is at least 2.5 times the square root of peak + dip, as if the two
  // counts were a coin toss), or empty. Each group must also hold at
  // least a tenth of the values (and 5 or more), so a few stragglers in a tail don't count.
  function groupsOf(B, n) {
    const c = B.bins.map(b => b.n);
    if (n < 20 || c.length < 3) return [];
    const deep = (peak, low) => low <= peak / 2 && peak - low >= 2.5 * Math.sqrt(peak + low);
    const cuts = [];
    let peak = c[0], low = null, lowAt = -1;
    for (let i = 1; i < c.length; i++) {
      if (low === null) { if (c[i] >= peak) peak = c[i]; else { low = c[i]; lowAt = i; } continue; }
      if (c[i] < low) { low = c[i]; lowAt = i; }
      else if (low === 0 || deep(Math.min(peak, c[i]), low)) { cuts.push(lowAt); peak = c[i]; low = null; }
      else if (c[i] > peak) { peak = c[i]; low = null; }
    }
    if (!cuts.length) return [];
    const small = m => m < Math.max(5, n / 10);
    const sum = (a, z) => { let m = 0; for (let i = a; i <= z; i++) m += c[i]; return m; };
    // merge the smallest group into a neighbour until every group is big enough
    for (;;) {
      const edges = [-1].concat(cuts, c.length);
      const sizes = cuts.concat(null).map((_, k) => sum(edges[k] + 1, edges[k + 1] - 1));
      let k = sizes.indexOf(Math.min(...sizes));
      if (!cuts.length || !small(sizes[k])) break;
      // drop the cut on the side of the smaller neighbour
      if (k === sizes.length - 1 || (k > 0 && sizes[k - 1] < sizes[k + 1])) k--;
      cuts.splice(k, 1);
    }
    if (!cuts.length) return [];
    // each group runs between the dips, leaving out the low bins themselves
    const groups = [];
    [-1].concat(cuts).forEach((from, k) => {
      const to = k < cuts.length ? cuts[k] : c.length;
      let a = from + 1, z = to - 1;
      while (a < z && c[a] === 0) a++;
      while (z > a && c[z] === 0) z--;
      let m = 0;
      for (let i = a; i <= z; i++) m += c[i];
      groups.push({ lo: B.bins[a].lo, hi: B.bins[z].hi, last: B.exact && z === c.length - 1, n: m });
    });
    return groups;
  }
  // runs of empty bins with plenty of values on both sides (a gap before a few
  // stragglers in a tail is normal, so it isn't reported)
  function gapsOf(B, n) {
    const gaps = [], c = B.bins, enough = Math.max(3, n / 10);
    let below = 0;
    for (let i = 1; i < c.length - 1; i++) {
      below += c[i - 1].n;
      if (c[i].n || !c[i - 1].n) continue;
      let j = i;
      while (j < c.length - 1 && !c[j].n) j++;
      if (c[j].n && below >= enough && n - below >= enough) gaps.push({ lo: c[i].lo, hi: c[j - 1].hi });
      i = j - 1;
    }
    return gaps;
  }

  function shapeOf(st, groups) {
    if (st.n < 3 || st.sd === 0) return '';
    if (groups.length > 1) return `The values fall into ${groups.length} separate groups, so a single average hides how the process behaves. Look for a reason, such as different shifts, sites, staff or types of case, and try plotting each group on its own.${st.n < 50 ? ` With only ${st.n} values, check the pattern with more data.` : ''}`;
    const g = st.skew, a = Math.abs(g);
    let txt;
    if (a < 0.5) txt = 'The shape is roughly symmetrical.';
    else {
      const strength = a < 1 ? 'moderately' : 'strongly';
      txt = g > 0
        ? `The shape is ${strength} skewed to the right — most values are low, with a tail of higher values.`
        : `The shape is ${strength} skewed to the left — most values are high, with a tail of lower values.`;
      txt += ' The median is a better guide to the typical value than the mean.';
    }
    if (st.n < 20) txt += ' With fewer than 20 values, treat the shape with caution.';
    return txt;
  }

  // ---- chart ----
  function renderSVG(st, B, o) {
    const { bins } = B;
    const W = drawW, ML = 76, MR = 40, plotH = 340;
    const plotW = W - ML - MR;
    const MT = (o.title ? 58 : 18) + 30;
    const MB = 74;
    const H = MT + plotH + MB;
    const base = MT + plotH;

    // horizontal domain: the bins, widened to include any limits
    let x0 = bins[0].lo, x1 = bins[bins.length - 1].hi;
    [o.lsl, o.usl].forEach(v => { if (v !== null) { x0 = Math.min(x0, v); x1 = Math.max(x1, v); } });
    if (x0 < bins[0].lo || x1 > bins[bins.length - 1].hi) { const pad = (x1 - x0) * 0.03; x0 -= pad; x1 += pad; }
    const xs = v => ML + (v - x0) / (x1 - x0) * plotW;

    // vertical scale
    const yv = b => o.asPct ? b.pct : b.n;
    let top = Math.max(...bins.map(yv));
    let curve = null;
    if (o.showNormal && st.sd > 0) {
      const k = o.asPct ? 100 * B.width : st.n * B.width;
      curve = [];
      const c0 = Math.max(x0, st.mean - 4 * st.sd), c1 = Math.min(x1, st.mean + 4 * st.sd);
      for (let i = 0; i <= 160; i++) {
        const x = c0 + (c1 - c0) * i / 160, z = (x - st.mean) / st.sd;
        curve.push([x, k * Math.exp(-0.5 * z * z) / (st.sd * Math.sqrt(2 * Math.PI))]);
      }
      top = Math.max(top, ...curve.map(p => p[1]));
    }
    const step = niceStep(Math.max(top, 1e-9) / 5);
    let yMax = Math.ceil(top / step) * step;
    if (yMax - top < step * 0.25) yMax += step; // headroom for labels
    const yy = v => base - v / yMax * plotH;
    const halo = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
    const fmt = v => nf.format(+v.toFixed(B.dec));
    const yTick = v => o.asPct ? nf.format(+v.toFixed(2)) + '%' : nf.format(+v.toFixed(2));

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${ML}" y="34" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(drawW === BASE_W ? o.title : fitText(o.title, (W - ML - 16 - 70 - String(st.n).length * 8) / 12.32))}</text>`);

    // legend
    const ly = MT - 22;
    let lx = ML;
    const legend = [['rect', COLORS.bar, o.asPct ? '% of values' : 'Number of values']];
    if (o.showMean) legend.push(['line', COLORS.mean, 'Mean'], ['dash', COLORS.median, 'Median']);
    if (curve) legend.push(['curve', COLORS.normal, 'Normal curve']);
    const outside = b => (o.lsl !== null && b.hi <= o.lsl) || (o.usl !== null && b.lo >= o.usl);
    if (bins.some(b => b.n > 0 && outside(b))) legend.push(['rect', COLORS.out, 'Outside limits']);
    if (o.lsl !== null || o.usl !== null) legend.push(['limit', COLORS.limit, 'Limit']);
    legend.forEach(([t, c, txt]) => {
      if (t === 'rect') s.push(`<rect x="${lx}" y="${ly - 10}" width="14" height="14" fill="${c}"/>`);
      else if (t === 'line') s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${c}" stroke-width="2.5"/>`);
      else if (t === 'dash') s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${c}" stroke-width="2" stroke-dasharray="5 3"/>`);
      else if (t === 'curve') s.push(`<path d="M${lx - 2} ${ly + 1} Q${lx + 7} ${ly - 14} ${lx + 16} ${ly + 1}" fill="none" stroke="${c}" stroke-width="2"/>`);
      else s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${c}" stroke-width="2" stroke-dasharray="2 3"/>`);
      s.push(`<text x="${lx + 22}" y="${ly + 2}" font-size="13" fill="${COLORS.ink}">${esc(txt)}</text>`);
      lx += 22 + txt.length * 7.2 + 26;
    });
    // IHI: show the total number of values on the chart. Top right, or beside the
    // axis title if a long legend leaves no room
    const nTxt = 'n = ' + nf.format(st.n);
    const nUp = o.title || lx < ML + plotW - nTxt.length * 7.5 - 10;
    s.push(`<text x="${ML + plotW}" y="${o.title ? 34 : nUp ? ly + 2 : H - 22}" font-size="12" font-weight="600" text-anchor="end" fill="${COLORS.muted}">${nTxt}</text>`);

    // grid + y ticks
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      const y = yy(v);
      s.push(`<line x1="${ML}" y1="${y}" x2="${ML + plotW}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${yTick(v)}</text>`);
    }

    // bars (touching, as a histogram should)
    const bandPx = xs(bins[0].hi) - xs(bins[0].lo);
    bins.forEach((b, i) => {
      const x = xs(b.lo), w = xs(b.hi) - x, y = yy(yv(b)), h = base - y;
      const last = B.exact && i === bins.length - 1;
      const range = `${fmt(b.lo)} to ${last ? '' : 'under '}${fmt(b.hi)}`;
      s.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${outside(b) ? COLORS.out : COLORS.bar}" stroke="#ffffff" stroke-width="1"><title>${esc(range)}: ${nf.format(b.n)} (${pct(b.pct)}%)</title></rect>`);
      if (o.showLabels && b.n > 0 && bandPx >= 18) {
        const fs = bandPx < 30 ? 10 : 12;
        s.push(`<text x="${x + w / 2}" y="${y - 5}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${COLORS.ink}" ${halo}>${o.asPct ? pct(b.pct) + '%' : nf.format(b.n)}</text>`);
      }
    });

    // normal curve
    if (curve) s.push(`<polyline points="${curve.map(p => xs(p[0]).toFixed(1) + ',' + yy(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="${COLORS.normal}" stroke-width="2" stroke-linejoin="round"/>`);

    // reference lines, labelled at the top of the plot on staggered rows
    const refs = [];
    if (o.showMean) {
      refs.push({ v: st.mean, c: COLORS.mean, dash: '', w: 2.5, t: 'Mean ' + nf.format(+st.mean.toFixed(B.dec + 1)) });
      refs.push({ v: st.median, c: COLORS.median, dash: 'stroke-dasharray="6 4"', w: 2, t: 'Median ' + nf.format(+st.median.toFixed(B.dec + 1)) });
    }
    if (o.lsl !== null) refs.push({ v: o.lsl, c: COLORS.limit, dash: 'stroke-dasharray="2 3"', w: 2, t: 'Lower ' + nf.format(o.lsl) });
    if (o.usl !== null) refs.push({ v: o.usl, c: COLORS.limit, dash: 'stroke-dasharray="2 3"', w: 2, t: 'Upper ' + nf.format(o.usl) });
    refs.forEach((r, i) => {
      const x = xs(r.v);
      s.push(`<line x1="${x}" y1="${MT}" x2="${x}" y2="${base}" stroke="${r.c}" stroke-width="${r.w}" ${r.dash}/>`);
      const right = x > ML + plotW * 0.7;
      s.push(`<text x="${right ? x - 5 : x + 5}" y="${MT + 14 + i * 16}" font-size="12" font-weight="700" text-anchor="${right ? 'end' : 'start'}" fill="${r.c}" ${halo}>${esc(r.t)}</text>`);
    });

    // axes
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<line x1="${ML}" y1="${base}" x2="${ML + plotW}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);

    // x ticks on bin edges, thinned so the labels never collide
    const edges = bins.map(b => b.lo).concat(bins[bins.length - 1].hi);
    const longest = Math.max(...edges.map(e => fmt(e).length));
    const every = Math.max(1, Math.ceil((longest * 7 + 12) / bandPx));
    edges.forEach((e, i) => {
      const x = xs(e);
      const show = i % every === 0;
      s.push(`<line x1="${x}" y1="${base}" x2="${x}" y2="${base + (show ? 6 : 3)}" stroke="${COLORS.ink}" stroke-width="1"/>`);
      if (show) s.push(`<text x="${x}" y="${base + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${fmt(e)}</text>`);
    });

    // axis titles
    s.push(`<text transform="translate(20 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${o.asPct ? '% of values' : 'Number of values'}</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${H - 22}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(o.xLabel)}</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- page ----
  const optNum = el => { const v = el.value.trim(); if (v === '') return null; const n = parseFloat(v); return isFinite(n) ? n : null; };

  function syncColumns(a) {
    if (!a || a.ncols < 2) { els.colBlock.hidden = true; els.col.innerHTML = ''; return; }
    const prev = els.col.value;
    els.col.innerHTML = a.names.map((nm, i) => `<option value="${i}">${esc(nm)}</option>`).join('');
    els.col.value = colTouched && prev !== '' && +prev < a.ncols ? prev : String(a.autoCol);
    els.colBlock.hidden = false;
  }

  function update() {
    const text = els.data.value;
    const a = analyse(text);
    syncColumns(a);
    if (!a) { els.detected.textContent = ''; current = null; return renderEmpty('Paste data on the left to build your chart.'); }
    const col = a.ncols > 1 ? +els.col.value : 0;
    if (!headerTouched) els.hasHeader.checked = a.firstBad(col);
    const p = parse(a, els.hasHeader.checked, col);

    let note = `Found ${nf.format(p.values.length)} number${p.values.length === 1 ? '' : 's'}.`;
    if (p.skipped) note += ` ${p.skipped} row${p.skipped > 1 ? 's' : ''} skipped (not a number).`;

    if (p.values.length < 2) { els.detected.textContent = note; current = null; return renderEmpty('Add at least two numbers to build a histogram.'); }

    const st = describe(p.values);
    const mode = els.binMode.value;
    els.binVal.disabled = mode === 'auto';
    const B = makeBins(st, mode, optNum(els.binVal), optNum(els.binStart));
    if (mode === 'auto') els.binVal.placeholder = nf.format(B.width);
    else if (mode === 'count') els.binVal.placeholder = String(B.bins.length);
    else els.binVal.placeholder = nf.format(B.width);
    if (B.note) note += ' ' + B.note;
    els.detected.textContent = note;

    let lsl = optNum(els.lsl), usl = optNum(els.usl);
    if (lsl !== null && usl !== null && lsl > usl) [lsl, usl] = [usl, lsl];

    const title = els.title.value.trim();
    const xLabel = els.xLabel.value.trim() || p.label || 'Value';
    els.xLabel.placeholder = p.label || 'Value';
    const d1 = B.dec + 1;
    const f = v => nf.format(+v.toFixed(d1));
    const fmt = v => nf.format(+v.toFixed(B.dec));
    const rangeOf = r => `${fmt(r.lo)} to ${r.last ? '' : 'under '}${fmt(r.hi)}`;
    const groups = groupsOf(B, st.n), gaps = gapsOf(B, st.n);
    const shape = shapeOf(st, groups);
    let gapTxt = '';
    if (gaps.length && gaps.length <= 3) gapTxt = `No values fall in ${gaps.map(rangeOf).join(', ').replace(/, ([^,]*)$/, ' or $1')}: a gap like this can point to two processes mixed together, or a problem with how the data were collected.`;
    else if (gaps.length) gapTxt = `${gaps.length} bins or runs of bins are empty between values. With little data this is common; try wider bins.`;
    const groupTxt = groups.length > 1 ? `<ul class="groups">${groups.map(g => `<li><strong>${rangeOf(g)}</strong>: ${nf.format(g.n)} value${g.n === 1 ? '' : 's'}</li>`).join('')}</ul>` : '';
    const sentence = groups.length > 1
      ? `${nf.format(st.n)} values in ${groups.length} separate groups (${groups.map(rangeOf).join('; ')}), ranging from ${f(st.min)} to ${f(st.max)}.`
      : `${nf.format(st.n)} values with a median of ${f(st.median)}, ranging from ${f(st.min)} to ${f(st.max)}.`;

    let outTxt = '';
    if (lsl !== null || usl !== null) {
      const below = lsl !== null ? st.sorted.filter(v => v < lsl).length : 0;
      const above = usl !== null ? st.sorted.filter(v => v > usl).length : 0;
      const out = below + above;
      const parts = [];
      if (lsl !== null) parts.push(`${nf.format(below)} below ${nf.format(lsl)}`);
      if (usl !== null) parts.push(`${nf.format(above)} above ${nf.format(usl)}`);
      outTxt = `${nf.format(out)} of ${nf.format(st.n)} values (${pct(out / st.n * 100)}%) fall outside your limits: ${parts.join(' and ')}.`;
    }

    trackChart({ points: st.n });
    const svg = drawShown(() => renderSVG(st, B, {
      title, xLabel, lsl, usl,
      showMean: els.showMean.checked, showNormal: els.showNormal.checked,
      asPct: els.asPct.checked, showLabels: els.showLabels.checked,
      aria: (title ? title + '. ' : '') + 'Histogram. ' + sentence + (shape ? ' ' + shape : '') + (gapTxt ? ' ' + gapTxt : '')
    }));

    current = { st, B, title, xLabel };
    const maxN = Math.max(...B.bins.map(b => b.n)) || 1;
    const rangeTxt = (b, i) => `${fmt(b.lo)} to ${B.exact && i === B.bins.length - 1 ? '' : 'under '}${fmt(b.hi)}`;
    const stats = [['Values', nf.format(st.n)], ['Mean', f(st.mean)], ['Median', f(st.median)], ['Standard deviation', f(st.sd)],
      ['Lowest', f(st.min)], ['Highest', f(st.max)], ['Lower quartile', f(st.q1)], ['Upper quartile', f(st.q3)]];
    // the normality test needs at least 8 values here
    const ad = st.n >= 8 ? andersonDarling(st.sorted) : null;
    const pTxt = ad ? (ad.p < 0.005 ? '< 0.005' : ad.p.toFixed(3)) : '';

    els.result.innerHTML = `
      <p class="summary">${groups.length > 1
        ? `<strong>${nf.format(st.n)}</strong> values in <strong>${groups.length} separate groups</strong>, ranging from ${f(st.min)} to ${f(st.max)}.`
        : `<strong>${nf.format(st.n)}</strong> values, typically around <strong>${f(st.median)}</strong>, ranging from ${f(st.min)} to ${f(st.max)}.`}</p>
      ${groupTxt}
      <p class="focuson">${esc([shape, gapTxt, outTxt].filter(Boolean).join(' '))}</p>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <section class="adtest" aria-labelledby="ad-h">
        <h3 id="ad-h">Normality test (Anderson–Darling)</h3>
        <p>${esc(adText(ad, st.n))}</p>
        ${ad ? `<p class="adnums">A² = ${ad.a2.toFixed(3)} (adjusted ${ad.a.toFixed(3)}), p-value ${pTxt}</p>` : ''}
      </section>
      <div class="tablewrap">
        <table>
          <thead><tr><th>${esc(xLabel)}</th><th class="num">Count</th><th class="num">% of values</th><th class="num">Cumulative %</th><th><span class="sr">Distribution</span></th></tr></thead>
          <tbody>${B.bins.map((b, i) => `<tr>
            <td>${rangeTxt(b, i)}</td>
            <td class="num">${nf.format(b.n)}</td>
            <td class="num">${pct(b.pct)}%</td>
            <td class="num">${pct(b.cum)}%</td>
            <td style="width:30%"><span class="bar" style="width:${(b.n / maxN * 100).toFixed(1)}%" aria-hidden="true"></span></td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th>Total</th><th class="num">${nf.format(st.n)}</th><th class="num">100.0%</th><th></th><th></th></tr></tfoot>
        </table>
      </div>`;
  }

  function renderEmpty(msg) {
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
  function downloadBlob(blob, name, msg) {
    FocusActions.saveFile(name, blob).then(
      ok => status(ok ? msg : 'Download cancelled.'),
      () => status('The file couldn’t be saved here.'));
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
    const { B, xLabel } = current;
    const head = [xLabel + ' from', 'To (under)', 'Count', '% of values', 'Cumulative %'];
    const body = B.bins.map(b => [b.lo, b.hi, b.n, pct(b.pct), pct(b.cum)]);
    return [head].concat(body);
  }
  const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }

  function act(a) {
    if (a === 'example') return loadExample();
    if (!current) return;
    if (a === 'png') toPNG(b => { downloadBlob(b, fileName() + '.png', 'PNG downloaded.'); });
    if (a === 'svg') { downloadBlob(new Blob([new XMLSerializer().serializeToString(svgEl())], { type: 'image/svg+xml' }), fileName() + '.svg', 'SVG downloaded.'); }
    if (a === 'copyimg') {
      if (!(navigator.clipboard && window.ClipboardItem)) return status('Your browser can’t copy images — use Download PNG.');
      toPNG(async b => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); status('Chart copied — paste it into PowerPoint or Word.'); }
        catch (e) { status('Copy was blocked — use Download PNG.'); }
      });
    }
    if (a === 'csv') { downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '.csv', 'Table downloaded.'); }
    if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => status(ok ? 'Table copied — paste it into Excel.' : 'Copy was blocked.'));
  }

  function loadExample() {
    els.data.value = EXAMPLE;
    els.title.value = 'Minutes from arrival to triage';
    els.usl.value = '30';
    headerTouched = false; colTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  els.col.addEventListener('change', () => { colTouched = true; headerTouched = false; update(); });
  els.binMode.addEventListener('change', () => { els.binVal.value = ''; update(); if (!els.binVal.disabled) els.binVal.focus(); });
  ['title', 'xLabel', 'binVal', 'binStart', 'lsl', 'usl'].forEach(id => els[id].addEventListener('input', schedule));
  ['showMean', 'showNormal', 'asPct', 'showLabels'].forEach(id => els[id].addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ binMode: 'binMode', showMeanMedian: 'showMean', showNormal: 'showNormal', percentages: 'asPct', showLabels: 'showLabels' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; headerTouched = false; colTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });


  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'histogram', toolName: 'histogram',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable'].map(type => ({ type, run: () => act(type) })))
  });
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), model: $('model'), threshold: $('threshold'),
    censor: $('censor'), lsl: $('lsl'), usl: $('usl'), atTime: $('atTime'), atPct: $('atPct'),
    shapeIn: $('shapeIn'), scaleIn: $('scaleIn'), title: $('title'), unit: $('unit'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', line: '#005EB8', point: '#005EB8', fit: '#D5281B', bar: '#41B6E6', lsl: '#AE2573', usl: '#AE2573', censor: '#768692', mark: '#ED8B00' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf4 = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 4 });
  const CHARTS = { prob: 'Probability plot', hist: 'Histogram with fitted curve', surv: 'Survival (reliability) curve', haz: 'Hazard (failure rate) curve' };

  let headerTouched = false;
  let chartType = 'prob';
  let current = null;
  let timer = null;
  // The chart on screen is drawn at the width it's shown at (like the SPC
  // chart), so it fills wide screens without the text growing. Exports still
  // use the standard 760-wide drawing.
  const BASE_W = 760, MIN_W = 760;
  let drawW = BASE_W, lastChart = null, shownW = 0;
  function chartWidth() { return Math.max(MIN_W, Math.round(els.result.clientWidth) - 2); }
  function drawAt(w, fn) { const was = drawW; drawW = w; try { return fn(); } finally { drawW = was; } }
  function drawShown(fn) { lastChart = fn; shownW = chartWidth(); return drawAt(shownW, fn); }
  // Shorten a title too long for the chart width, rather than let it run off the edge
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

  // Example: days each of 40 infusion pumps was in use before it first needed repair (made-up data)
  const EXAMPLE = ['Days to first repair'].concat('95, 66, 143, 48, 125, 101, 43, 121, 36, 111, 47, 53, 109, 177, 60, 79, 139, 220, 132, 105, 243, 39, 185, 90, 65, 59, 92, 174, 71, 132, 141, 102, 127, 45, 44, 76, 148, 110, 93, 133'.split(', ')).join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'weibull-reliability';
  const fmt = x => isFinite(x) ? nf4.format(+x.toPrecision(4)) : '–';
  const pc = x => isFinite(x) ? (Math.round(x * 1000) / 10).toFixed(1) + '%' : '–';

  const val = el => el.value.trim() === '' ? NaN : Number(el.value);

  // ---- parsing ----
  function parse(text, hasHeader) {
    const s = splitTable(text);
    if (!s) return null;
    const { recs, delim } = s;
    const first = r => r.find(c => c !== '' && isFinite(num(c, delim)));
    const headerGuess = recs.length > 1 && first(recs[0]) === undefined;
    const head = hasHeader ? recs[0] : null, body = hasHeader ? recs.slice(1) : recs;
    const xs = []; let skipped = 0;
    body.forEach(r => { const c = first(r); if (c === undefined) skipped++; else xs.push(num(c, delim)); });
    return { xs, skipped, headerGuess, name: head ? head.filter(Boolean).join(' ') : '' };
  }

  // ---- maths ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { gamma, sum, mean: avg, sd: sdev, readNumber: num, splitTable } = FocusStats;

  // Maximum likelihood fit of a Weibull distribution to failures y (already less the threshold),
  // with m items still working at time c (also less the threshold).
  function mleFit(y, m, c) {
    const r = y.length, all = m > 0 ? y.concat([c]) : y.slice(), wt = m > 0 ? y.map(() => 1).concat([m]) : y.map(() => 1);
    const top = Math.max(...all), ln = all.map(v => Math.log(v)), lnTop = Math.log(top), meanLnF = avg(y.map(v => Math.log(v)));
    // Profile likelihood equation for the shape, which falls as the shape rises
    const g = b => {
      let s0 = 0, s1 = 0;
      for (let i = 0; i < all.length; i++) { const p = wt[i] * Math.exp(b * (ln[i] - lnTop)); s0 += p; s1 += p * ln[i]; }
      return 1 / b + meanLnF - s1 / s0;
    };
    let lo = 1, hi = 1;
    while (g(lo) < 0 && lo > 1e-6) lo /= 2;
    while (g(hi) > 0 && hi < 1e4) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (g(mid) > 0) lo = mid; else hi = mid; }
    const beta = Math.sqrt(lo * hi);
    let s0 = 0;
    for (let i = 0; i < all.length; i++) s0 += wt[i] * Math.exp(beta * (ln[i] - lnTop));
    const alpha = top * Math.pow(s0 / r, 1 / beta);
    return { beta, alpha };
  }
  // Points for the probability plot: median ranks of the failures out of all items, by
  // Benard's approximation, (i − 0.3) / (N + 0.4) for the i-th failure (counting from 1).
  // Median ranks are the standard for Weibull plots (Abernethy, The New Weibull Handbook)
  // and Minitab's default, so the plot, its R² and the automatic threshold (chosen to
  // make the plot straightest) agree with Minitab. They don't affect the fitted shape and
  // scale, which come from maximum likelihood. Items still working at the censor time come
  // after every failure, so they only add to N.
  function probPoints(y, N) {
    return y.map((v, i) => { const F = (i + 1 - 0.3) / (N + 0.4); return { t: v, F, x: Math.log(v), y: Math.log(-Math.log(1 - F)) }; });
  }
  function rsq(pts) {
    const n = pts.length, mx = avg(pts.map(p => p.x)), my = avg(pts.map(p => p.y));
    let sxy = 0, sxx = 0, syy = 0;
    pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
    return sxx > 0 && syy > 0 ? sxy * sxy / (sxx * syy) : NaN;
  }
  // The threshold that makes the probability plot straightest (highest R²)
  function bestThreshold(fails, N) {
    const min = fails[0];
    const score = th => rsq(probPoints(fails.map(v => v - th), N));
    const span = min > 0 ? min : Math.abs(min) || 1;
    let lo = min - span * 20, hi = min - span * 1e-6;
    if (lo < 0 && min > 0) lo = 0;
    // coarse search, then golden section around the best point
    let best = lo, bestS = -Infinity;
    for (let i = 0; i <= 200; i++) { const th = lo + (hi - lo) * i / 200; const s = score(th); if (s > bestS) { bestS = s; best = th; } }
    const step = (hi - lo) / 200;
    let a = Math.max(lo, best - step), b = Math.min(hi, best + step);
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 80; i++) {
      const c = b - gr * (b - a), d = a + gr * (b - a);
      if (score(c) > score(d)) b = d; else a = c;
    }
    return +((a + b) / 2).toPrecision(5);
  }

  // Weibull functions, for times t on the original scale
  const surv = (m, t) => t <= m.theta ? 1 : Math.exp(-Math.pow((t - m.theta) / m.alpha, m.beta));
  const pdf = (m, t) => { if (t <= m.theta) return 0; const z = (t - m.theta) / m.alpha; return m.beta / m.alpha * Math.pow(z, m.beta - 1) * Math.exp(-Math.pow(z, m.beta)); };
  const hazard = (m, t) => t <= m.theta ? (m.beta < 1 ? NaN : 0) : m.beta / m.alpha * Math.pow((t - m.theta) / m.alpha, m.beta - 1);
  const timeAtSurv = (m, p) => m.theta + m.alpha * Math.pow(-Math.log(p), 1 / m.beta);

  // ---- analysis ----
  function analyse() {
    const d = parse(els.data.value, els.hasHeader.checked);
    if (!d || !d.xs.length) return { empty: 'Paste your times to failure on the left to analyse them.' };
    const xs = d.xs.slice().sort((a, b) => a - b), N = xs.length;
    const errs = [];
    [els.threshold, els.censor, els.shapeIn, els.scaleIn, els.atPct, els.atTime, els.lsl, els.usl].forEach(el => el.removeAttribute('aria-invalid'));
    const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); errs.push(msg); };
    const censor = val(els.censor);
    const hasCensor = isFinite(censor);
    const fails = hasCensor ? xs.filter(v => v < censor) : xs, m = N - fails.length;
    let note = `Reading ${N} time${N === 1 ? '' : 's'}${hasCensor ? `: ${fails.length} failure${fails.length === 1 ? '' : 's'} and ${m} still working at ${fmt(censor)}` : ''}.`;
    if (d.skipped) note += ` ${d.skipped} row${d.skipped > 1 ? 's' : ''} skipped (no number).`;
    const three = els.model.value === '3';
    let theta = 0, autoTheta = false;
    if (fails.length < 3) return { d, note, empty: hasCensor ? 'At least three items need to have failed before the censor time to fit a Weibull distribution.' : 'Paste at least three times to fit a Weibull distribution.' };
    if (new Set(fails).size < 2) return { d, note, empty: 'The failure times are all the same, so a distribution can’t be fitted.' };
    if (three) {
      const th = val(els.threshold);
      if (isFinite(th)) { theta = th; if (theta >= fails[0]) bad(els.threshold, `The threshold must be less than the shortest time, ${fmt(fails[0])}.`); }
      else { theta = bestThreshold(fails, N); autoTheta = true; }
    } else if (fails[0] <= 0) errs.push('Times must all be more than 0 for a 2-parameter Weibull. Use the 3-parameter model with a threshold if some times are 0 or less.');
    if (hasCensor && censor <= theta) bad(els.censor, 'The censor time must be more than the threshold.');
    const shapeIn = val(els.shapeIn), scaleIn = val(els.scaleIn);
    if (els.shapeIn.value.trim() !== '' && !(shapeIn > 0)) bad(els.shapeIn, 'The shape must be more than 0.');
    if (els.scaleIn.value.trim() !== '' && !(scaleIn > 0)) bad(els.scaleIn, 'The scale must be more than 0.');
    const atPct = val(els.atPct), atTime = val(els.atTime), lsl = val(els.lsl), usl = val(els.usl);
    if (els.atPct.value.trim() !== '' && !(atPct > 0 && atPct < 100)) bad(els.atPct, 'The percentage still working must be more than 0 and less than 100.');
    if (els.atTime.value.trim() !== '' && !isFinite(atTime)) bad(els.atTime, 'The survival time must be a number.');
    if (isFinite(lsl) && isFinite(usl) && usl <= lsl) bad(els.usl, 'The upper specification limit should be more than the lower one.');
    if (errs.length) return { d, note, errs };

    const y = fails.map(v => v - theta), cy = hasCensor ? censor - theta : NaN;
    const fit = mleFit(y, m, cy);
    const fitted = { beta: fit.beta, alpha: fit.alpha, theta };
    const model = { beta: shapeIn > 0 ? shapeIn : fit.beta, alpha: scaleIn > 0 ? scaleIn : fit.alpha, theta };
    const manual = shapeIn > 0 || scaleIn > 0;
    const pts = probPoints(y, N);
    const r2 = rsq(pts);
    const mean = model.theta + model.alpha * gamma(1 + 1 / model.beta);
    const sd = model.alpha * Math.sqrt(Math.max(0, gamma(1 + 2 / model.beta) - gamma(1 + 1 / model.beta) ** 2));
    const o = {
      title: els.title.value.trim(), unit: els.unit.value.trim(), name: d.name || 'Time', three, autoTheta, hasCensor, censor,
      lsl, usl, atTime, atPct: isFinite(atPct) ? atPct : NaN
    };
    const pred = {
      atTime: isFinite(atTime) ? surv(model, atTime) : NaN,
      atPct: isFinite(atPct) && atPct > 0 && atPct < 100 ? timeAtSurv(model, atPct / 100) : NaN,
      lsl: isFinite(lsl) ? 1 - surv(model, lsl) : NaN,
      usl: isFinite(usl) ? surv(model, usl) : NaN,
      median: timeAtSurv(model, 0.5), b10: timeAtSurv(model, 0.9),
      predFails: hasCensor ? N * (1 - surv(model, censor)) : NaN
    };
    return { d, note, o, xs, fails, N, m, fitted, model, manual, pts, r2, mean, sd, pred,
      dataMean: hasCensor ? NaN : avg(xs), dataSd: hasCensor ? NaN : sdev(xs) };
  }

  // ---- wording ----
  const u = o => o.unit ? ' ' + o.unit : '';
  function shapeWords(b) {
    if (b < 0.95) return { tag: 'Early failures', text: 'the risk of failure falls with age, so items tend to fail early, which points to faults in manufacture, installation or set-up' };
    if (b <= 1.05) return { tag: 'Random failures', text: 'failures happen at random, at about the same rate whatever the age' };
    return { tag: 'Wear-out failures', text: 'the risk of failure rises with age, so items wear out' };
  }
  function readingParts(r) {
    const { o, model, pred } = r, sw = shapeWords(model.beta), out = [];
    out.push(`The shape is ${fmt(model.beta)}, so ${sw.text}.${model.beta > 1.05 ? ' Planned replacement or maintenance before items reach the age where failures climb can prevent them.' : model.beta < 0.95 ? ' Look at what happens when items are new, such as checks before first use, rather than at replacing older ones.' : ' Replacing items early won’t prevent failures, as older items are no more likely to fail than new ones.'}`);
    out.push(`Half of items are expected to fail by ${fmt(pred.median)}${u(o)} (the median life) and 10% by ${fmt(pred.b10)}${u(o)}. The average life is ${fmt(r.mean)}${u(o)}${o.three ? `, and no failures are expected before the threshold of ${fmt(model.theta)}${u(o)}` : ''}.`);
    const p = [];
    if (isFinite(pred.atTime)) p.push(`The chance an item is still working at ${fmt(o.atTime)}${u(o)} is ${pc(pred.atTime)}.`);
    if (isFinite(pred.lsl)) p.push(`${pc(pred.lsl)} are expected to fail before the lower specification limit of ${fmt(o.lsl)}${u(o)}.`);
    if (isFinite(pred.usl)) p.push(`${pc(pred.usl)} are expected to last beyond the upper specification limit of ${fmt(o.usl)}${u(o)}.`);
    if (p.length) out.push(p.join(' '));
    if (r.manual) out.push('These predictions use the shape and scale you set, not the fitted values.');
    out.push(isFinite(r.r2) && r.r2 >= 0.95 ? `The points on the probability plot lie close to a straight line (R² = ${fmt(r.r2)}), so the Weibull distribution fits well.`
      : r.r2 >= 0.9 ? `The points on the probability plot lie fairly close to a straight line (R² = ${fmt(r.r2)}), so the Weibull distribution is a reasonable fit. Check the plot for points that bend away from the line, especially at the ends.`
      : `The points on the probability plot are not very straight (R² = ${fmt(r.r2)}), so treat the predictions with caution.${o.three ? '' : ' If the points curve, try the 3-parameter model with a threshold.'} Check too whether the data mixes different kinds of failure, which are better analysed separately.`);
    return out;
  }

  // ---- charts ----
  function niceTicks(lo, hi, count) {
    const span = hi - lo || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => span / s <= count) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return { ticks: out, step, top: Math.ceil(hi / step - 1e-9) * step };
  }
  function frame(o, W, H, m) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#fff"/>`;
    if (o.title) s += `<text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="${COLORS.ink}">${esc(fitText(o.title, (W - 32) / 10.08))}</text>`;
    return s;
  }
  function axes(s, W, H, m, xLabel, yLabel) {
    const ph = H - m.t - m.b, pw = W - m.l - m.r;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="${COLORS.axis}"/><line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="${COLORS.axis}"/>`;
    s += `<text x="${m.l + pw / 2}" y="${H - 14}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.ink}">${esc(xLabel)}</text>`;
    s += `<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.ink}">${esc(yLabel)}</text>`;
    return s;
  }
  function vline(s, x, m, H, color, label, row) {
    s += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    s += `<text x="${x + 4}" y="${m.t + 13 + (row || 0) * 15}" font-size="12" font-weight="600" fill="${color}">${esc(label)}</text>`;
    return s;
  }
  const timeLabel = o => o.name + (o.unit && !o.name.toLowerCase().includes(o.unit.toLowerCase()) ? ` (${o.unit})` : '');
  function specLines(s, r, X, m, H, x0, x1) {
    const { o } = r; let row = 0;
    if (isFinite(o.lsl) && o.lsl >= x0 && o.lsl <= x1) s = vline(s, X(o.lsl), m, H, COLORS.lsl, 'LSL ' + fmt(o.lsl), row++);
    if (isFinite(o.usl) && o.usl >= x0 && o.usl <= x1) s = vline(s, X(o.usl), m, H, COLORS.usl, 'USL ' + fmt(o.usl), row++);
    if (o.hasCensor && o.censor >= x0 && o.censor <= x1) s = vline(s, X(o.censor), m, H, COLORS.censor, 'Censor ' + fmt(o.censor), row++);
    return s;
  }
  function timeRange(r) {
    const { o, model, xs } = r;
    const cands = [xs[xs.length - 1], timeAtSurv(model, 0.01)];
    [o.lsl, o.usl, o.atTime, o.hasCensor ? o.censor : NaN, r.pred.atPct].forEach(v => { if (isFinite(v)) cands.push(v); });
    const lo = Math.min(0, model.theta, xs[0]);
    return { x0: lo, x1: Math.max(...cands) * 1.05 };
  }
  function curveSVG(r, kind) {
    const { o, model } = r, W = drawW, H = 420, m = { l: 70, r: 24, t: o.title ? 52 : 24, b: 58 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const { x0, x1 } = timeRange(r);
    const n = 300, xs = Array.from({ length: n + 1 }, (_, i) => x0 + (x1 - x0) * i / n);
    const ys = xs.map(t => kind === 'surv' ? surv(model, t) : hazard(model, t));
    const fin = ys.filter(isFinite);
    let yMax = kind === 'surv' ? 1 : Math.max(...fin);
    if (kind === 'haz' && model.beta < 1) yMax = Math.min(yMax, (hazard(model, model.theta + (x1 - model.theta) * 0.02)) || yMax);
    const yt = kind === 'surv' ? { ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], top: 1 } : niceTicks(0, yMax * 1.05, 6);
    if (yt.top > yt.ticks[yt.ticks.length - 1]) yt.ticks.push(yt.top);
    const yTop = yt.top || 1;
    const X = v => m.l + (v - x0) / (x1 - x0) * pw, Y = v => m.t + (1 - Math.min(v, yTop) / yTop) * ph;
    let s = frame(o, W, H, m);
    yt.ticks.forEach(v => {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${COLORS.grid}"/>`;
      s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="${COLORS.muted}">${kind === 'surv' ? v * 100 + '%' : esc(fmt(v))}</text>`;
    });
    niceTicks(x0, x1, 8).ticks.forEach(v => {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="${COLORS.axis}"/><text x="${X(v)}" y="${H - m.b + 19}" text-anchor="middle" font-size="12" fill="${COLORS.muted}">${esc(fmt(v))}</text>`;
    });
    s = axes(s, W, H, m, timeLabel(o), kind === 'surv' ? 'Still working' : 'Failure rate (per unit of time)');
    s = specLines(s, r, X, m, H, x0, x1);
    s += `<path d="${xs.map((x, i) => isFinite(ys[i]) ? `${i && isFinite(ys[i - 1]) ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(ys[i]).toFixed(1)}` : '').join('')}" fill="none" stroke="${COLORS.line}" stroke-width="2.5"/>`;
    xs.forEach((x, i) => { if (i % 10 === 0 && isFinite(ys[i])) s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(ys[i]).toFixed(1)}" r="6" fill="transparent"><title>${esc(fmt(x))}${esc(u(o))}: ${kind === 'surv' ? pc(ys[i]) + ' still working' : 'failure rate ' + fmt(ys[i])}</title></circle>`; });
    if (kind === 'surv') {
      const marks = [];
      if (isFinite(r.pred.atTime)) marks.push({ x: o.atTime, y: r.pred.atTime, label: `${pc(r.pred.atTime)} at ${fmt(o.atTime)}` });
      if (isFinite(r.pred.atPct)) marks.push({ x: r.pred.atPct, y: o.atPct / 100, label: `${fmt(o.atPct)}% at ${fmt(r.pred.atPct)}` });
      marks.forEach((k, i) => {
        const cx = X(k.x), cy = Y(k.y), right = cx > m.l + pw * 0.65;
        s += `<circle cx="${cx}" cy="${cy}" r="6" fill="${COLORS.mark}" stroke="#fff" stroke-width="2"><title>${esc(k.label)}</title></circle>`;
        s += `<text x="${cx + (right ? -10 : 10)}" y="${cy - 10 - i * 2}" text-anchor="${right ? 'end' : 'start'}" font-size="13" font-weight="700" fill="${COLORS.mark}">${esc(k.label)}</text>`;
      });
    }
    return s + '</svg>';
  }
  function histSVG(r) {
    const { o, model, fails } = r, W = drawW, H = 420, m = { l: 60, r: 24, t: o.title ? 52 : 24, b: 58 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const lo0 = fails[0], hi0 = fails[fails.length - 1];
    const bins = Math.max(6, Math.min(30, Math.round(1.5 * Math.sqrt(fails.length))));
    const step = niceTicks(lo0, hi0, bins).step;
    const start = Math.floor(fails[0] / step) * step;
    const nb = Math.max(1, Math.floor((hi0 - start) / step) + 1);
    const counts = Array(nb).fill(0);
    fails.forEach(v => counts[Math.min(nb - 1, Math.floor((v - start) / step))]++);
    let x0 = Math.min(start, model.theta), x1 = start + nb * step;
    [o.lsl, o.usl, o.hasCensor ? o.censor : NaN].forEach(v => { if (isFinite(v) && v < x0 + (x1 - x0) * 3 && v > x0 - (x1 - x0)) { x0 = Math.min(x0, v); x1 = Math.max(x1, v + step / 2); } });
    const scale = r.N * step;
    const cx = Array.from({ length: 301 }, (_, i) => x0 + (x1 - x0) * i / 300), cy = cx.map(t => pdf(model, t) * scale);
    const yMax = Math.max(...counts, ...cy.filter(isFinite)) * 1.08;
    const yt = niceTicks(0, yMax, 6), yTop = yt.top;
    if (yt.top > yt.ticks[yt.ticks.length - 1]) yt.ticks.push(yt.top);
    const X = v => m.l + (v - x0) / (x1 - x0) * pw, Y = v => m.t + (1 - Math.min(v, yTop) / yTop) * ph;
    let s = frame(o, W, H, m);
    yt.ticks.forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${COLORS.grid}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="${COLORS.muted}">${esc(fmt(v))}</text>`; });
    counts.forEach((c, i) => {
      const a = start + i * step, b = a + step;
      s += `<rect x="${X(a) + 1}" y="${Y(c)}" width="${Math.max(0, X(b) - X(a) - 2)}" height="${Y(0) - Y(c)}" fill="${COLORS.bar}"><title>${esc(fmt(a))} to ${esc(fmt(b))}: ${c} failure${c === 1 ? '' : 's'}</title></rect>`;
    });
    niceTicks(x0, x1, 8).ticks.forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="${COLORS.axis}"/><text x="${X(v)}" y="${H - m.b + 19}" text-anchor="middle" font-size="12" fill="${COLORS.muted}">${esc(fmt(v))}</text>`; });
    s = axes(s, W, H, m, timeLabel(o), 'Number of failures');
    s = specLines(s, r, X, m, H, x0, x1);
    s += `<path d="${cx.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(cy[i]).toFixed(1)}`).join('')}" fill="none" stroke="${COLORS.fit}" stroke-width="2.5"/>`;
    return s + '</svg>';
  }
  function probSVG(r) {
    const { o, fitted, pts, model } = r, W = drawW, H = 460, m = { l: 64, r: 24, t: o.title ? 52 : 24, b: 58 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const tv = pts.map(p => p.t);
    const lx0 = Math.log(Math.min(...tv)), lx1 = Math.log(Math.max(...tv, fitted.alpha));
    const pad = (lx1 - lx0) * 0.08 || 0.5, x0 = lx0 - pad, x1 = lx1 + pad;
    const Fs = pts.map(p => p.F), lnF = F => Math.log(-Math.log(1 - F));
    const yLo = Math.min(lnF(Math.min(...Fs)), lnF(0.01)), yHi = Math.max(lnF(Math.max(...Fs)), lnF(0.99));
    const X = v => m.l + (v - x0) / (x1 - x0) * pw, Y = v => m.t + (1 - (v - yLo) / (yHi - yLo)) * ph;
    let s = frame(o, W, H, m);
    [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.632, 0.8, 0.9, 0.95, 0.99, 0.999].forEach(F => {
      const v = lnF(F); if (v < yLo - 1e-9 || v > yHi + 1e-9) return;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${COLORS.grid}"${F === 0.632 ? ' stroke-dasharray="4 3"' : ''}/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="${COLORS.muted}">${+(F * 100).toPrecision(3)}%</text>`;
    });
    // log-scale x ticks: 1, 2, 5 × powers of ten
    const ticks = [];
    for (let e = Math.floor(x0 / Math.LN10) - 1; e <= Math.ceil(x1 / Math.LN10) + 1; e++) [1, 2, 5].forEach(k => { const v = k * Math.pow(10, e), lv = Math.log(v); if (lv >= x0 && lv <= x1) ticks.push(v); });
    const shown = ticks.length > 12 ? ticks.filter(v => /^1/.test(String(v))) : ticks;
    shown.forEach(v => { const lv = Math.log(v); s += `<line x1="${X(lv)}" x2="${X(lv)}" y1="${m.t}" y2="${H - m.b}" stroke="${COLORS.grid}"/><text x="${X(lv)}" y="${H - m.b + 19}" text-anchor="middle" font-size="12" fill="${COLORS.muted}">${esc(fmt(v))}</text>`; });
    s = axes(s, W, H, m, (o.three ? timeLabel(o) + ' minus threshold' : timeLabel(o)) + ', log scale', 'Percentage failed');
    // fitted line: ln(-ln(1-F)) = beta (ln t - ln alpha)
    const fy = lx => fitted.beta * (lx - Math.log(fitted.alpha));
    const clipX = v => Math.min(x1, Math.max(x0, v));
    const ax = clipX(yLo / fitted.beta + Math.log(fitted.alpha)), bx = clipX(yHi / fitted.beta + Math.log(fitted.alpha));
    s += `<line x1="${X(ax)}" y1="${Y(fy(ax))}" x2="${X(bx)}" y2="${Y(fy(bx))}" stroke="${COLORS.fit}" stroke-width="2"/>`;
    pts.forEach(p => { s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${COLORS.point}" fill-opacity=".85"><title>${esc(fmt(p.t + model.theta))}${esc(u(o))}: ${pc(p.F)} failed</title></circle>`; });
    s += `<text x="${W - m.r - 6}" y="${H - m.b - 10}" text-anchor="end" font-size="12" fill="${COLORS.muted}">Fitted shape ${esc(fmt(fitted.beta))}, scale ${esc(fmt(fitted.alpha))}${o.three ? ', threshold ' + esc(fmt(fitted.theta)) : ''}; R² ${esc(fmt(r.r2))}</text>`;
    return s + '</svg>';
  }

  // ---- tables ----
  function statRows(r) {
    const { o, fitted, model, pred } = r, rows = [];
    rows.push(['Shape (β)', fitted.beta, r.manual && model.beta !== fitted.beta ? model.beta : null]);
    rows.push(['Scale (η, characteristic life)', fitted.alpha, r.manual && model.alpha !== fitted.alpha ? model.alpha : null]);
    if (o.three) rows.push([`Threshold${o.autoTheta ? ' (best fit)' : ''}`, fitted.theta, null]);
    return rows;
  }
  function summaryRows(r) {
    const { o, pred } = r, rows = [];
    rows.push(['Number of items', r.N]);
    rows.push(['Failures', r.fails.length]);
    if (o.hasCensor) rows.push(['Still working at ' + fmt(o.censor), r.m], ['Predicted failures before ' + fmt(o.censor), Math.round(pred.predFails)]);
    rows.push(['Mean life, from the model', r.mean]);
    if (isFinite(r.dataMean)) rows.push(['Mean of the data', r.dataMean]);
    rows.push(['Standard deviation, from the model', r.sd]);
    if (isFinite(r.dataSd)) rows.push(['Standard deviation of the data', r.dataSd]);
    rows.push(['Median life (50% failed)', pred.median], ['B10 life (10% failed)', pred.b10], ['Probability plot R²', r.r2]);
    if (isFinite(pred.atTime)) rows.push([`Chance of surviving to ${fmt(o.atTime)}`, pc(pred.atTime)]);
    if (isFinite(pred.atPct)) rows.push([`Time by which ${fmt(o.atPct)}% still work`, pred.atPct]);
    if (isFinite(pred.lsl)) rows.push([`Failing before the LSL (${fmt(o.lsl)})`, pc(pred.lsl)]);
    if (isFinite(pred.usl)) rows.push([`Lasting beyond the USL (${fmt(o.usl)})`, pc(pred.usl)]);
    return rows;
  }
  const show = v => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fmt(v)) : v;
  function tableHTML(r) {
    const manualCol = r.manual;
    let h = `<div class="tablewrap"><h3>Fitted Weibull distribution</h3><table><thead><tr><th>Parameter</th><th class="num">Fitted</th>${manualCol ? '<th class="num">Used for predictions</th>' : ''}</tr></thead><tbody>`;
    statRows(r).forEach(row => { h += `<tr><td>${esc(row[0])}</td><td class="num">${esc(fmt(row[1]))}</td>${manualCol ? `<td class="num">${row[2] != null ? esc(fmt(row[2])) : esc(fmt(row[1]))}</td>` : ''}</tr>`; });
    h += '</tbody></table></div>';
    h += `<div class="tablewrap"><h3>Summary and predictions</h3><table><tbody>`;
    summaryRows(r).forEach(row => { h += `<tr><td>${esc(row[0])}</td><td class="num">${esc(show(row[1]))}</td></tr>`; });
    return h + '</tbody></table></div>';
  }
  const r6 = x => typeof x === 'number' && isFinite(x) ? +x.toPrecision(6) : x;
  function tableRows() {
    const r = current, out = [[r.o.title || 'Weibull reliability analysis'], [], ['Parameter', 'Fitted', 'Used for predictions']];
    statRows(r).forEach(row => out.push([row[0], r6(row[1]), r6(row[2] != null ? row[2] : row[1])]));
    out.push([], ['Summary and predictions']);
    summaryRows(r).forEach(row => out.push([row[0], r6(row[1])]));
    out.push([], ['Probability plot points'], [r.o.name, 'Percentage failed (median rank)']);
    r.pts.forEach(p => out.push([r6(p.t + r.model.theta), r6(p.F * 100)]));
    return out;
  }
  function summaryText() {
    const lines = [current.o.title || 'Weibull reliability analysis', ''];
    lines.push(`Shape ${fmt(current.model.beta)}, scale ${fmt(current.model.alpha)}${current.o.three ? `, threshold ${fmt(current.model.theta)}` : ''}.`, '');
    readingParts(current).forEach(p => lines.push(p, ''));
    return lines.join('\n').trim();
  }

  // ---- render ----
  function update() {
    current = null;
    $('thresholdBlock').hidden = els.model.value !== '3';
    if (els.shapeIn.value.trim() || els.scaleIn.value.trim()) $('adv').open = true;
    const text = els.data.value;
    if (!headerTouched) { const g = parse(text, false); els.hasHeader.checked = !!(g && g.headerGuess); }
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty(['Paste your times to failure on the left to analyse them.']); }
    const r = analyse();
    els.detected.textContent = r.note || '';
    if (r.empty) return renderEmpty([r.empty]);
    if (r.errs) return renderEmpty(r.errs);
    current = r;
    if (r.o.three && r.o.autoTheta) els.threshold.placeholder = `Best fit: ${fmt(r.fitted.theta)} (leave blank to keep)`;
    else els.threshold.placeholder = 'Leave blank to find the best value';
    if (!CHARTS[chartType]) chartType = 'prob';
    const { o, model, pred } = r, sw = shapeWords(model.beta);
    o.aria = (o.title ? o.title + '. ' : '') + `${CHARTS[chartType]}. Weibull shape ${fmt(model.beta)}, scale ${fmt(model.alpha)}${o.three ? `, threshold ${fmt(model.theta)}` : ''}. ${sw.tag}.`;
    const svg = drawShown(() => chartType === 'hist' ? histSVG(r) : chartType === 'surv' ? curveSVG(r, 'surv') : chartType === 'haz' ? curveSVG(r, 'haz') : probSVG(r));
    trackChart({ points: r.N });
    const legend = {
      prob: 'Each dot is a failure, plotted on Weibull scales; the red line is the fitted distribution. If the Weibull distribution fits, the dots lie close to the line. The dashed grid line marks 63.2%, which the line crosses at the scale.',
      hist: 'Bars show how many items failed in each period; the red curve is the fitted distribution, scaled to the number of items.',
      surv: 'The percentage of items expected to still be working at each time. Orange dots mark your predictions.',
      haz: 'The failure rate among items still working at each time. A falling curve means early failures, a flat one random failures, and a rising one wear-out.'
    }[chartType];
    const stats = [[fmt(model.beta), 'Shape (β)'], [fmt(model.alpha), 'Scale (η)']];
    if (o.three) stats.push([fmt(model.theta), o.autoTheta ? 'Threshold (best fit)' : 'Threshold']);
    stats.push([fmt(pred.median), 'Median life' + (o.unit ? ` (${o.unit})` : '')]);
    if (isFinite(pred.atTime)) stats.push([pc(pred.atTime), `Still working at ${fmt(o.atTime)}`]);
    if (isFinite(pred.atPct)) stats.push([fmt(pred.atPct), `Time by which ${fmt(o.atPct)}% still work`]);
    if (isFinite(pred.lsl)) stats.push([pc(pred.lsl), `Failing before LSL (${fmt(o.lsl)})`]);
    if (isFinite(pred.usl)) stats.push([pc(pred.usl), `Lasting beyond USL (${fmt(o.usl)})`]);
    stats.push([fmt(r.r2), 'Probability plot R²', r.r2 >= 0.95 ? 'good' : r.r2 >= 0.9 ? 'ok' : 'poor']);
    els.result.innerHTML = `
      <p class="summary"><strong>${esc(sw.tag)}</strong>: half are expected to fail by <strong>${esc(fmt(pred.median))}${esc(u(o))}</strong></p>
      <p class="focuson">${esc(`${o.three ? '3' : '2'}-parameter Weibull, ${r.N} items, ${r.fails.length} failures${o.hasCensor ? `, ${r.m} still working at ${fmt(o.censor)}` : ''}.${r.manual ? ' Predictions use the shape and scale you set.' : ''}`)}</p>
      <div class="stats">${stats.map(s => `<div class="stat"><b${s[2] ? ` class="${s[2]}"` : ''}>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>
      <div class="chartbar"><div class="block"><label for="chartType">Chart</label><select id="chartType">${Object.keys(CHARTS).map(c => `<option value="${c}"${c === chartType ? ' selected' : ''}>${CHARTS[c]}</option>`).join('')}</select></div></div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">${esc(legend)} Hover over the chart to see the figures.</p>
      <div class="reading"><h3>What the analysis shows</h3>${readingParts(r).map(x => `<p>${esc(x)}</p>`).join('')}</div>
      ${tableHTML(r)}`;
  }
  function renderEmpty(msgs) {
    current = null;
    els.result.innerHTML = `<div class="empty">${msgs.map((m, i) => `<p${msgs.length > 1 || /must|should|need|can’t|Times/.test(m) ? ' class="err"' : ''} style="margin:0 auto .5rem">${esc(m)}</p>`).join('')}<button type="button" class="primary" data-act="example" style="margin-top:.5rem">Try the example</button></div>`;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 200); }

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
  const csvCell = v => v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
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
    if (a === 'copytable') copyText(tableRows().map(r => r.map(v => v == null ? '' : v).join('\t')).join('\n')).then(ok => status(ok ? 'Tables copied — paste them into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Summary copied.' : 'Copy was blocked.'));
  }
  function clearAll() {
    ['data', 'threshold', 'censor', 'lsl', 'usl', 'atTime', 'shapeIn', 'scaleIn', 'title', 'unit'].forEach(k => { els[k].value = ''; });
    els.atPct.value = '50'; els.model.value = '2'; headerTouched = false; els.hasHeader.checked = false;
  }
  function loadExample() {
    clearAll();
    els.data.value = EXAMPLE;
    els.title.value = 'Infusion pumps: days in use before first repair (example)';
    els.unit.value = 'days'; els.atTime.value = '60'; els.atPct.value = '90'; els.lsl.value = '30';
    chartType = 'prob';
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  ['threshold', 'censor', 'lsl', 'usl', 'atTime', 'atPct', 'shapeIn', 'scaleIn', 'title', 'unit'].forEach(k => els[k].addEventListener('input', schedule));
  els.model.addEventListener('change', update);
  trackSettings({ model: 'model', chartType: 'chartType' });
  $('clearBtn').addEventListener('click', () => { clearAll(); update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  els.result.addEventListener('change', e => { if (e.target.id === 'chartType') { chartType = e.target.value; update(); $('chartType').focus(); } });

  update();

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'weibull_reliability', toolName: 'Weibull reliability analysis',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ chartType }),
    setExtra: x => { if (x && CHARTS[x.chartType]) chartType = x.chartType; },
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

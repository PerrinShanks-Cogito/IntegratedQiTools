/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    test: $('test'), sides: $('sides'), alpha: $('alpha'), n: $('n'), power: $('power'), diff: $('diff'),
    sd: $('sd'), levels: $('levels'), title: $('title'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', line: '#005EB8', mark: '#D5281B', ref: '#007F3B', base: '#768692' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf4 = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 4 });
  const nfInt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const TESTS = {
    t1: { name: '1-sample t test or paired t test', short: '1-sample or paired t test', prop: false, groups: false },
    t2: { name: '2-sample t test', short: '2-sample t test', prop: false, groups: true },
    anova: { name: 'One-way ANOVA', short: 'one-way ANOVA', prop: false, groups: true },
    p1: { name: '1-proportion test', short: '1-proportion test', prop: true, groups: false },
    p2: { name: '2-proportions test', short: '2-proportions test', prop: true, groups: true }
  };
  const SOLVE = { power: 'Power', n: 'Sample size', diff: 'Smallest detectable difference' };
  const MAX_N = 10000000;

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

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'power-and-sample-size';
  const pc = x => isFinite(x) ? (Math.round(x * 1000) / 10).toFixed(1).replace(/\.0$/, '') + '%' : '–';
  const pcp = x => isFinite(x) ? nf4.format(+(x * 100).toPrecision(3)) + '%' : '–'; // a proportion as a percentage
  const an = s => (/^(8|1[18](?![0-9]))/.test(s) ? 'an ' : 'a ') + s; // "an 80% chance", "a 66% chance"
  const fmt = x => isFinite(x) ? nf4.format(+x.toPrecision(4)) : '–';
  const solveMode = () => (document.querySelector('input[name="solve"]:checked') || {}).value || 'power';

  // ---- distributions ----
  // Shared distributions, from /assets/js/focus-stats.js
  const { lgamma, ibeta, tInv, normCdf, normInv } = FocusStats;

  // Critical value of F, returned as u = d1·F / (d1·F + d2), the beta-scale cut-off
  function fCritU(alpha, d1, d2) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (1 - ibeta(mid, d1 / 2, d2 / 2) > alpha) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---- power ----
  // o: { test, sides, alpha, sd (or baseline proportion), levels }. x is the difference,
  // or the comparison proportion for the proportions tests. n is per group.
  function powerAt(o, n, x) {
    if (o.test === 't1' || o.test === 't2') {
      const k = o.test === 't1' ? 1 : 2, df = k * (n - 1);
      const ncp = Math.sqrt(n / k) * Math.abs(x) / o.sd;
      const tc = tInv(1 - o.alpha / o.sides, df);
      const z = (tc * (1 - 1 / (4 * df)) - ncp) / Math.sqrt(1 + tc * tc / (2 * df));
      return 1 - normCdf(z);
    }
    if (o.test === 'anova') {
      const d1 = o.levels - 1, d2 = o.levels * (n - 1);
      const lambda = n * x * x / (2 * o.sd * o.sd), m = lambda / 2;
      const u = fCritU(o.alpha, d1, d2);
      if (m === 0) return 1 - ibeta(u, d1 / 2, d2 / 2);
      const jmax = Math.ceil(m + 12 * Math.sqrt(m) + 30);
      let s = 0;
      for (let j = 0; j <= jmax; j++) {
        const w = Math.exp(-m + j * Math.log(m) - lgamma(j + 1));
        if (w > 1e-17) s += w * ibeta(u, d1 / 2 + j, d2 / 2);
      }
      return Math.min(1, Math.max(0, 1 - s));
    }
    const z = normInv(1 - o.alpha / o.sides);
    if (o.test === 'p1') {
      const p0 = o.sd, p1 = x;
      const se0 = Math.sqrt(p0 * (1 - p0) / n), se1 = Math.sqrt(p1 * (1 - p1) / n);
      if (o.sides === 1) return p1 > p0 ? 1 - normCdf((p0 - p1 + z * se0) / se1) : normCdf((p0 - p1 - z * se0) / se1);
      return 1 - normCdf((p0 - p1 + z * se0) / se1) + normCdf((p0 - p1 - z * se0) / se1);
    }
    const p2 = o.sd, p1 = x, pbar = (p1 + p2) / 2;
    const sep = Math.sqrt(2 * pbar * (1 - pbar) / n), se = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n);
    if (o.sides === 1) return normCdf((Math.abs(p2 - p1) - z * sep) / se);
    return 1 - normCdf((p2 - p1 + z * sep) / se) + normCdf((p2 - p1 - z * sep) / se);
  }

  // Sample size (per group) to reach the target power
  function sampleSize(o, x, target) {
    if (TESTS[o.test].prop) {
      const z = normInv(1 - o.alpha / o.sides), zb = normInv(target);
      let n;
      if (o.test === 'p1') { const p0 = o.sd; n = ((z * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(x * (1 - x))) / (x - p0)) ** 2; }
      else { const p2 = o.sd, pbar = (x + p2) / 2; n = ((z * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(x * (1 - x) + p2 * (1 - p2))) / (x - p2)) ** 2; }
      return Math.max(2, Math.ceil(n - 1e-9));
    }
    if (powerAt(o, 2, x) >= target) return 2;
    let lo = 2, hi = 4;
    while (powerAt(o, hi, x) < target) { lo = hi; hi *= 2; if (hi > MAX_N) return Infinity; }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (powerAt(o, mid, x) >= target) hi = mid; else lo = mid; }
    return hi;
  }

  // Smallest difference detectable with the target power. For proportions, returns the
  // comparison proportions above and below the baseline (null where none is possible).
  function minDiff(o, n, target) {
    const bisect = (f, lo, hi) => { for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid)) hi = mid; else lo = mid; } return hi; };
    if (TESTS[o.test].prop) {
      const p0 = o.sd, eps = 1e-9;
      const up = powerAt(o, n, 1 - eps) >= target ? bisect(p => powerAt(o, n, p) >= target, p0, 1 - eps) : null;
      const down = powerAt(o, n, eps) >= target ? 1 - bisect(q => powerAt(o, n, 1 - q) >= target, 1 - p0, 1 - eps) : null;
      return { up, down };
    }
    let hi = o.sd;
    while (powerAt(o, n, hi) < target) { hi *= 2; if (hi > o.sd * 1e6) return { d: Infinity }; }
    return { d: bisect(d => powerAt(o, n, d) >= target, 0, hi) };
  }

  // ---- reading the inputs ----
  function labels(test) {
    const t = TESTS[test];
    return {
      diff: test === 'anova' ? 'Difference between the largest and smallest means' : t.prop ? 'Comparison proportion (%)' : 'Difference to detect',
      diffHint: test === 'anova' ? 'The gap between the highest and lowest group averages that you want to detect, in the units of your measure.'
        : t.prop ? 'The rate you want to be able to detect, as a percentage, for example 60 if you hope to move from 40% to 60%.'
        : test === 't1' ? 'The change in the average you want to detect, compared with the target or the before value, in the units of your measure.'
        : 'The gap between the two group averages that you want to detect, in the units of your measure.',
      sd: t.prop ? 'Baseline proportion (%)' : 'Standard deviation',
      sdHint: t.prop ? (test === 'p1' ? 'Your current rate, or the target you are comparing with, as a percentage.' : 'The rate in the comparison (control) group, as a percentage.')
        : test === 't1' ? 'How much individual values vary, from your baseline data. For a paired test, use the standard deviation of the differences between pairs.'
        : 'How much individual values vary within each group, from your baseline data.',
      nHint: test === 't1' ? 'The number of measurements, or the number of pairs for a paired test.' : t.groups ? 'The number in each group.' : 'The number of people or items in the sample.',
      testHint: {
        t1: 'Compares an average with a target, or before and after values on the same people or items.',
        t2: 'Compares the averages of two separate groups.',
        anova: 'Compares the averages of three or more groups.',
        p1: 'Compares a rate (a percentage) with a target or a past rate.',
        p2: 'Compares the rates (percentages) in two separate groups.'
      }[test]
    };
  }
  function syncForm() {
    const test = els.test.value, mode = solveMode(), L = labels(test);
    $('diffLabel').textContent = L.diff; $('diffHint').textContent = L.diffHint;
    $('sdLabel').textContent = L.sd; $('sdHint').textContent = L.sdHint;
    $('nHint').textContent = L.nHint; $('testHint').textContent = L.testHint;
    $('sidesHint').textContent = test === 'anova' ? 'ANOVA always tests for a difference in either direction, so the test type has no effect.' : '';
    els.sides.disabled = test === 'anova';
    document.querySelector('[data-for="levels"]').hidden = test !== 'anova';
    document.querySelector('[data-for="n"]').hidden = mode === 'n';
    document.querySelector('[data-for="power"]').hidden = mode === 'power';
    document.querySelector('[data-for="diff"]').hidden = mode === 'diff';
  }
  function readInputs() {
    const test = els.test.value, mode = solveMode(), t = TESTS[test];
    const errs = [];
    const val = el => el.value.trim() === '' ? NaN : Number(el.value);
    const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); errs.push(msg); };
    [els.alpha, els.n, els.power, els.diff, els.sd, els.levels].forEach(el => el.removeAttribute('aria-invalid'));
    const o = { test, mode, sides: test === 'anova' ? 2 : +els.sides.value, title: els.title.value.trim() };
    o.alpha = val(els.alpha);
    if (!(o.alpha > 0 && o.alpha < 0.5)) bad(els.alpha, 'The significance level must be more than 0 and less than 0.5, for example 0.05.');
    if (t.prop) {
      o.sd = val(els.sd) / 100;
      if (!(o.sd > 0 && o.sd < 1)) bad(els.sd, 'The baseline proportion must be more than 0% and less than 100%.');
    } else {
      o.sd = val(els.sd);
      if (!(o.sd > 0)) bad(els.sd, 'The standard deviation must be more than 0.');
    }
    if (test === 'anova') {
      o.levels = val(els.levels);
      if (!(Number.isInteger(o.levels) && o.levels >= 2 && o.levels <= 1000)) bad(els.levels, 'The number of groups must be a whole number, 2 or more.');
    }
    if (mode !== 'n') {
      o.n = val(els.n);
      if (!(Number.isInteger(o.n) && o.n >= 2 && o.n <= MAX_N)) bad(els.n, 'The sample size must be a whole number, 2 or more.');
    }
    if (mode !== 'power') {
      o.power = val(els.power) / 100;
      if (!(o.power > 0 && o.power < 1)) bad(els.power, 'The desired power must be more than 0% and less than 100%.');
      else if (!errs.length && o.power <= o.alpha) bad(els.power, 'The desired power must be higher than the significance level.');
    }
    if (mode !== 'diff') {
      if (t.prop) {
        o.x = val(els.diff) / 100;
        if (!(o.x > 0 && o.x < 1)) bad(els.diff, 'The comparison proportion must be more than 0% and less than 100%.');
        else if (o.x === o.sd) bad(els.diff, 'The comparison proportion must differ from the baseline proportion.');
      } else {
        o.x = val(els.diff);
        if (!(isFinite(o.x) && o.x !== 0)) bad(els.diff, 'The difference to detect must be a number other than 0.');
      }
    }
    return { o, errs };
  }

  // ---- wording ----
  function sampleWords(o, n) {
    const t = TESTS[o.test], s = nfInt.format(n);
    if (t.groups) return `${s} in each group`;
    if (o.test === 't1') return `a sample of ${s} (or ${s} pairs)`;
    return `a sample of ${s}`;
  }
  function changeWords(o, x) {
    if (o.test === 'p1') return `a change from ${pcp(o.sd)} to ${pcp(x)}`;
    if (o.test === 'p2') return `a difference between ${pcp(o.sd)} and ${pcp(x)}`;
    if (o.test === 'anova') return `a difference of ${fmt(Math.abs(x))} between the highest and lowest of ${o.levels} group means`;
    return `a difference of ${fmt(Math.abs(x))}`;
  }
  function setupWords(o) {
    const sd = TESTS[o.test].prop ? '' : `, standard deviation ${fmt(o.sd)}`;
    return `${TESTS[o.test].name}, ${o.test === 'anova' ? '' : (o.sides === 1 ? 'one-sided' : 'two-sided') + ', '}α = ${fmt(o.alpha)}${sd}`;
  }

  // ---- calculations ----
  function solve(o) {
    const r = { o };
    if (o.mode === 'power') {
      r.power = powerAt(o, o.n, o.x);
      if (r.power < 0.8) r.n80 = sampleSize(o, o.x, 0.8);
    } else if (o.mode === 'n') {
      r.n = sampleSize(o, o.x, o.power);
      if (isFinite(r.n)) r.actual = powerAt(o, r.n, o.x);
    } else {
      r.md = minDiff(o, o.n, o.power);
    }
    return r;
  }
  function headline(r) {
    const o = r.o;
    if (o.mode === 'power') return `With ${esc(sampleWords(o, o.n))}, the power is <strong>${pc(r.power)}</strong>`;
    if (o.mode === 'n') return isFinite(r.n) ? `You need <strong>${nfInt.format(r.n)}</strong> ${TESTS[o.test].groups ? 'in each group' : o.test === 't1' ? 'measurements or pairs' : 'in the sample'}` : 'The sample size needed is <strong>over 10 million</strong>';
    if (TESTS[o.test].prop) {
      const { up, down } = r.md;
      if (up == null && down == null) return 'No change can be detected with this power';
      return `The smallest detectable change is to <strong>${[up != null ? pcp(up) : null, down != null ? pcp(down) : null].filter(Boolean).join('</strong> or <strong>')}</strong>`;
    }
    return isFinite(r.md.d) ? `The smallest detectable difference is <strong>${fmt(r.md.d)}</strong>` : 'No difference can be detected with this power';
  }
  function readingParts(r) {
    const o = r.o, out = [];
    if (o.mode === 'power') {
      out.push(`With ${sampleWords(o, o.n)}, a ${TESTS[o.test].short} has ${an(pc(r.power))} chance of giving a significant result (at α = ${fmt(o.alpha)}) if there really is ${changeWords(o, o.x)}${TESTS[o.test].prop ? '' : ` and the standard deviation is ${fmt(o.sd)}`}.`);
      if (r.power >= 0.8) out.push('That meets the usual target of 80% power, so the sample is large enough to detect a change of this size.');
      else out.push(`That is below the usual target of 80% power, so there is a real risk of missing the change even if it has happened, and a non-significant result would not show that nothing changed. ${isFinite(r.n80) ? `You would need ${sampleWords(o, r.n80)} for 80% power.` : ''}`);
    } else if (o.mode === 'n') {
      if (!isFinite(r.n)) out.push('The change you want to detect is very small compared with the variation, so no practical sample could detect it. Look for a bigger change to detect, or a way to measure with less variation.');
      else {
        out.push(`To have ${an(pc(o.power))} chance of detecting ${changeWords(o, o.x)}${TESTS[o.test].prop ? '' : ` when the standard deviation is ${fmt(o.sd)}`}, you need ${sampleWords(o, r.n)}${TESTS[o.test].groups ? `, ${nfInt.format(r.n * (o.test === 'anova' ? o.levels : 2))} in total` : ''}. With that sample the power is ${pc(r.actual)}.`);
        out.push('Allow for people who drop out or records with missing data by collecting a little more than this.');
      }
    } else {
      if (TESTS[o.test].prop) {
        const { up, down } = r.md;
        const parts = [];
        if (up != null) parts.push(`a rise from ${pcp(o.sd)} to ${pcp(up)} or more`);
        if (down != null) parts.push(`a fall from ${pcp(o.sd)} to ${pcp(down)} or less`);
        if (parts.length) out.push(`With ${sampleWords(o, o.n)}, the test has ${an(pc(o.power))} chance of detecting ${parts.join(', or ')}. ${o.sides === 1 ? 'For a one-sided test, use only the direction you planned to test.' : ''}`);
        if (up == null || down == null) out.push(`There is no proportion ${up == null ? 'above' : 'below'} the baseline that can be detected with this power and sample size.`);
      } else if (isFinite(r.md.d)) {
        out.push(`With ${sampleWords(o, o.n)}, a ${TESTS[o.test].short} has ${an(pc(o.power))} chance of detecting a difference of ${fmt(r.md.d)}${o.test === 'anova' ? ' between the highest and lowest group means' : ''} or more, when the standard deviation is ${fmt(o.sd)}. That is ${fmt(r.md.d / o.sd)} standard deviations.`);
      }
      out.push('Smaller changes could still happen and go undetected. If the smallest change that would matter in practice is less than this, you need a larger sample.');
    }
    return out;
  }

  // ---- chart ----
  function niceTicks(lo, hi, count) {
    const span = hi - lo || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function curveData(r) {
    const o = r.o;
    if (o.mode === 'diff') {
      if (TESTS[o.test].prop) {
        const xs = Array.from({ length: 199 }, (_, i) => (i + 1) / 200);
        return { kind: 'prop', xs, ys: xs.map(p => powerAt(o, o.n, p)), xLabel: 'Comparison proportion', xFmt: v => pcp(v), x0: 0, x1: 1 };
      }
      const top = isFinite(r.md.d) ? r.md.d * 2 : o.sd * 2;
      const xs = Array.from({ length: 101 }, (_, i) => top * i / 100);
      return { kind: 'diff', xs, ys: xs.map(d => powerAt(o, o.n, d)), xLabel: o.test === 'anova' ? 'Difference between largest and smallest means' : 'Difference', xFmt: fmt, x0: 0, x1: top };
    }
    const n = o.mode === 'n' ? r.n : o.n;
    const ref = isFinite(r.n80) ? Math.max(n, r.n80) : n;
    const top = Math.max(10, Math.ceil(ref * 2));
    const xs = [...new Set(Array.from({ length: 121 }, (_, i) => Math.round(2 + (top - 2) * i / 120)))];
    return { kind: 'n', xs, ys: xs.map(m => powerAt(o, m, o.x)), xLabel: TESTS[o.test].groups ? 'Sample size (each group)' : 'Sample size', xFmt: v => nfInt.format(v), x0: 0, x1: top };
  }
  function chartSVG(r) {
    const o = r.o, c = curveData(r);
    const W = drawW, H = 420, m = { l: 64, r: 24, t: o.title ? 52 : 24, b: 58 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = v => m.l + (v - c.x0) / (c.x1 - c.x0) * pw, Y = v => m.t + (1 - v) * ph;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#fff"/>`;
    if (o.title) s += `<text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="${COLORS.ink}">${esc(fitText(o.title, (W - 32) / 10.08))}</text>`;
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(v => {
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${COLORS.grid}"/>`;
      s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="${COLORS.muted}">${v * 100}%</text>`;
    });
    const xt = c.kind === 'prop' ? [0, 0.2, 0.4, 0.6, 0.8, 1] : niceTicks(c.x0, c.x1, 8);
    xt.forEach(v => {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - m.b}" y2="${H - m.b + 5}" stroke="${COLORS.axis}"/>`;
      s += `<text x="${X(v)}" y="${H - m.b + 19}" text-anchor="middle" font-size="12" fill="${COLORS.muted}">${esc(c.kind === 'prop' ? Math.round(v * 100) + '%' : c.xFmt(v))}</text>`;
    });
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="${COLORS.axis}"/><line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="${COLORS.axis}"/>`;
    s += `<text x="${m.l + pw / 2}" y="${H - 14}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.ink}">${esc(c.xLabel)}</text>`;
    s += `<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.ink}">Power</text>`;
    // target power line
    const target = o.mode === 'power' ? 0.8 : o.power;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(target)}" y2="${Y(target)}" stroke="${COLORS.ref}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    s += `<text x="${W - m.r - 4}" y="${Y(target) - 6}" text-anchor="end" font-size="12" fill="${COLORS.ref}">${o.mode === 'power' ? '80% (usual target)' : 'Target ' + pc(target)}</text>`;
    if (c.kind === 'prop') {
      s += `<line x1="${X(o.sd)}" x2="${X(o.sd)}" y1="${m.t}" y2="${H - m.b}" stroke="${COLORS.base}" stroke-dasharray="3 3"/>`;
      s += `<text x="${X(o.sd) + 5}" y="${m.t + 12}" font-size="12" fill="${COLORS.muted}">Baseline ${esc(pcp(o.sd))}</text>`;
    }
    s += `<path d="${c.xs.map((x, i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(c.ys[i]).toFixed(1)).join('')}" fill="none" stroke="${COLORS.line}" stroke-width="2.5"/>`;
    c.xs.forEach((x, i) => { if (i % 4 === 0) s += `<circle cx="${X(x).toFixed(1)}" cy="${Y(c.ys[i]).toFixed(1)}" r="6" fill="transparent"><title>${esc(c.xLabel)}: ${esc(c.xFmt(x))}, power ${pc(c.ys[i])}</title></circle>`; });
    const marks = [];
    if (o.mode === 'power') marks.push({ x: o.n, y: r.power, label: `n = ${nfInt.format(o.n)}, power ${pc(r.power)}` });
    if (o.mode === 'n' && isFinite(r.n)) marks.push({ x: r.n, y: r.actual, label: `n = ${nfInt.format(r.n)}, power ${pc(r.actual)}` });
    if (o.mode === 'diff') {
      if (c.kind === 'prop') {
        if (r.md.up != null) marks.push({ x: r.md.up, y: powerAt(o, o.n, r.md.up), label: pcp(r.md.up) });
        if (r.md.down != null) marks.push({ x: r.md.down, y: powerAt(o, o.n, r.md.down), label: pcp(r.md.down) });
      } else if (isFinite(r.md.d)) marks.push({ x: r.md.d, y: powerAt(o, o.n, r.md.d), label: `Difference ${fmt(r.md.d)}` });
    }
    marks.forEach(k => {
      const cx = X(k.x), cy = Y(k.y), right = cx > m.l + pw * 0.7;
      s += `<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${H - m.b}" stroke="${COLORS.mark}" stroke-dasharray="3 3"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="6" fill="${COLORS.mark}" stroke="#fff" stroke-width="2"><title>${esc(k.label)}</title></circle>`;
      s += `<text x="${cx + (right ? -10 : 10)}" y="${cy + 18}" text-anchor="${right ? 'end' : 'start'}" font-size="13" font-weight="700" fill="${COLORS.mark}">${esc(k.label)}</text>`;
    });
    return s + '</svg>';
  }

  // ---- tables ----
  function otherSizes(r) {
    const o = r.o, base = o.mode === 'n' ? r.n : o.n;
    return [...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map(f => Math.max(2, Math.round(base * f))))].sort((a, b) => a - b);
  }
  function tableData(r) {
    const o = r.o, t = TESTS[o.test], nHead = t.groups ? 'Sample size (each group)' : 'Sample size';
    if (o.mode !== 'diff') {
      if (o.mode === 'n' && !isFinite(r.n)) return null;
      return { title: 'Power at other sample sizes', head: [nHead, 'Power'], rows: otherSizes(r).map(n => [nfInt.format(n), pc(powerAt(o, n, o.x))]), raw: otherSizes(r).map(n => [n, +powerAt(o, n, o.x).toFixed(4)]) };
    }
    const ns = otherSizes(r), mds = ns.map(n => minDiff(o, n, o.power));
    if (t.prop) {
      const p = v => v == null ? 'None' : pcp(v);
      return { title: `Smallest detectable change at other sample sizes (${pc(o.power)} power)`, head: [nHead, 'Comparison above baseline', 'Comparison below baseline'],
        rows: ns.map((n, i) => [nfInt.format(n), p(mds[i].up), p(mds[i].down)]), raw: ns.map((n, i) => [n, mds[i].up == null ? '' : +mds[i].up.toFixed(6), mds[i].down == null ? '' : +mds[i].down.toFixed(6)]) };
    }
    return { title: `Smallest detectable difference at other sample sizes (${pc(o.power)} power)`, head: [nHead, 'Smallest difference'],
      rows: ns.map((n, i) => [nfInt.format(n), fmt(mds[i].d)]), raw: ns.map((n, i) => [n, +mds[i].d.toPrecision(6)]) };
  }
  function tableHTML(td) {
    if (!td) return '';
    return `<div class="tablewrap"><h3>${esc(td.title)}</h3><table><thead><tr>${td.head.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${td.rows.map(row => `<tr>${row.map((v, i) => `<td${i ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function inputRows(r) {
    const o = r.o, t = TESTS[o.test], rows = [['Hypothesis test', t.name]];
    if (o.test !== 'anova') rows.push(['Test type', o.sides === 1 ? 'One-sided' : 'Two-sided']);
    rows.push(['Significance level (α)', o.alpha]);
    if (o.test === 'anova') rows.push(['Number of groups', o.levels]);
    rows.push([t.prop ? 'Baseline proportion' : 'Standard deviation', t.prop ? pcp(o.sd) : o.sd]);
    if (o.mode !== 'diff') rows.push([t.prop ? 'Comparison proportion' : labels(o.test).diff, t.prop ? pcp(o.x) : o.x]);
    if (o.mode !== 'n') rows.push([t.groups ? 'Sample size (each group)' : 'Sample size', o.n]);
    if (o.mode !== 'power') rows.push(['Desired power', pc(o.power)]);
    if (o.mode === 'power') rows.push(['Power', pc(r.power)]);
    if (o.mode === 'n') rows.push([t.groups ? 'Sample size needed (each group)' : 'Sample size needed', isFinite(r.n) ? r.n : 'Over 10 million'], ['Power at that sample size', pc(r.actual)]);
    if (o.mode === 'diff') {
      if (t.prop) rows.push(['Smallest detectable comparison above baseline', r.md.up == null ? 'None' : pcp(r.md.up)], ['Smallest detectable comparison below baseline', r.md.down == null ? 'None' : pcp(r.md.down)]);
      else rows.push(['Smallest detectable difference', isFinite(r.md.d) ? +r.md.d.toPrecision(6) : 'None']);
    }
    return rows;
  }
  function tableRows() {
    const out = [[current.o.title || 'Power and sample size'], ['Calculating', SOLVE[current.o.mode]]].concat(inputRows(current));
    const td = tableData(current);
    if (td) out.push([], [td.title], td.head, ...td.raw);
    return out;
  }
  function summaryText() {
    const lines = [current.o.title || 'Power and sample size', '', setupWords(current.o), ''];
    readingParts(current).forEach(p => lines.push(p.trim(), ''));
    return lines.join('\n').trim();
  }

  // ---- render ----
  function update() {
    current = null;
    syncForm();
    const { o, errs } = readInputs();
    if (errs.length) return renderEmpty(errs);
    const r = solve(o);
    current = r;
    trackChart({ test: o.test, solveFor: o.mode });
    const stats = [];
    if (o.mode === 'power') {
      stats.push([pc(r.power), 'Power', r.power >= 0.8 ? 'good' : 'poor']);
      if (isFinite(r.n80)) stats.push([nfInt.format(r.n80), `Sample size for 80% power${TESTS[o.test].groups ? ' (each group)' : ''}`, '']);
    } else if (o.mode === 'n' && isFinite(r.n)) {
      stats.push([nfInt.format(r.n), TESTS[o.test].groups ? 'Sample size, each group' : 'Sample size', 'ok']);
      if (TESTS[o.test].groups) stats.push([nfInt.format(r.n * (o.test === 'anova' ? o.levels : 2)), 'Total sample size', '']);
      stats.push([pc(r.actual), 'Power at this sample size', '']);
    } else if (o.mode === 'diff') {
      if (TESTS[o.test].prop) {
        stats.push([r.md.up == null ? 'None' : pcp(r.md.up), 'Comparison above baseline', 'ok'], [r.md.down == null ? 'None' : pcp(r.md.down), 'Comparison below baseline', 'ok']);
      } else if (isFinite(r.md.d)) stats.push([fmt(r.md.d), 'Smallest detectable difference', 'ok'], [fmt(r.md.d / o.sd), 'In standard deviations', '']);
    }
    o.aria = (o.title ? o.title + '. ' : '') + 'Power curve. ' + headline(r).replace(/<[^>]+>/g, '') + '.';
    const legend = o.mode === 'diff'
      ? (TESTS[o.test].prop ? `The curve shows the power to detect each comparison proportion with ${sampleWords(o, o.n)}. It is lowest at the baseline and rises the further the comparison is from it.` : `The curve shows the power to detect each size of difference with ${sampleWords(o, o.n)}.`)
      : 'The curve shows how power rises with sample size for the change you want to detect. Beyond a point, adding more data gains little.';
    els.result.innerHTML = `
      <p class="summary">${headline(r)}</p>
      <p class="focuson">${esc(setupWords(o))}.</p>
      ${stats.length ? `<div class="stats">${stats.map(s => `<div class="stat"><b${s[2] ? ` class="${s[2]}"` : ''}>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>` : ''}
      <div class="chartwrap fit" id="chart">${drawShown(() => chartSVG(r))}</div>
      <p class="legend-note">${esc(legend)} The dashed green line marks ${o.mode === 'power' ? 'the usual target of 80% power' : 'your target power'}. Hover over the chart to see the figures.</p>
      <div class="reading"><h3>What this means</h3>${readingParts(r).map(x => `<p>${esc(x)}</p>`).join('')}</div>
      ${tableHTML(tableData(r))}`;
  }
  function renderEmpty(msgs) {
    current = null;
    els.result.innerHTML = `<div class="empty">${msgs.map(m => `<p class="err" style="margin:0 auto .5rem">${esc(m)}</p>`).join('')}<button type="button" class="primary" data-act="example" style="margin-top:.5rem">Try the example</button></div>`;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 250); }

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
  function setSolve(v) { document.querySelectorAll('input[name="solve"]').forEach(el => { el.checked = el.value === v; }); }
  function resetForm() {
    els.test.value = 't2'; els.sides.value = '2'; els.alpha.value = '0.05';
    els.n.value = ''; els.power.value = '80'; els.diff.value = ''; els.sd.value = ''; els.levels.value = '3'; els.title.value = '';
    setSolve('n');
    family = 'mean';
  }
  // Example: how many patients on each ward to detect a 1-day difference in length of stay
  function loadExample() {
    els.test.value = 't2'; els.sides.value = '2'; els.alpha.value = '0.05';
    els.n.value = '50'; els.power.value = '80'; els.diff.value = '1'; els.sd.value = '2.5'; els.levels.value = '3';
    els.title.value = 'Length of stay on two wards: patients needed (example)';
    setSolve('n');
    family = 'mean';
    update();
  }

  // ---- events ----
  [els.alpha, els.n, els.power, els.diff, els.sd, els.levels, els.title].forEach(el => el.addEventListener('input', schedule));
  trackSettings({ test: 'test', sides: 'sides', solveFor: 'solve' });
  els.test.addEventListener('change', () => { swapFamily(); update(); });
  els.sides.addEventListener('change', update);
  document.querySelectorAll('input[name="solve"]').forEach(el => el.addEventListener('change', update));
  $('clearBtn').addEventListener('click', () => { resetForm(); update(); els.test.focus(); trackCleared(); });
  // Keep separate values for tests of means and of proportions, so switching between them
  // brings back what was last entered for that kind of test
  const stash = { mean: { sd: '1.4', diff: '0.5' }, prop: { sd: '40', diff: '60' } };
  let family = TESTS[els.test.value].prop ? 'prop' : 'mean';
  function swapFamily() {
    const now = TESTS[els.test.value].prop ? 'prop' : 'mean';
    if (now === family) return;
    stash[family] = { sd: els.sd.value, diff: els.diff.value };
    els.sd.value = stash[now].sd; els.diff.value = stash[now].diff;
    family = now;
  }
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update();

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'power_sample_size', toolName: 'power and sample size',
    example: loadExample, hasData: () => !!els.title.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { family = TESTS[els.test.value].prop ? 'prop' : 'mean'; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

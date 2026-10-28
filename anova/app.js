/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), method: $('method'), alpha: $('alpha'),
    title: $('title'), valLabel: $('valLabel'), order: $('order'), showPoints: $('showPoints'), zero: $('zero'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', mean: '#005EB8', ci: '#003087', grand: '#ED8B00', point: '#4C6272' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const MAX_GROUPS = 20;
  const SMALL_N = 5;

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

  // Example: hours from decision to discharge to leaving the ward, 20 patients on each of four wards (made-up data)
  const EXAMPLE = (function () {
    let seed = 20261023;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const wards = [['Ward A', 4.2, 1.3], ['Ward B', 3.8, 1.1], ['Ward C', 5.6, 1.5], ['Ward D', 4.4, 1.2]];
    const rows = ['Ward\tHours to leave the ward'];
    wards.forEach(([w, m, sd]) => {
      for (let i = 0; i < 20; i++) {
        const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
        rows.push(`${w}\t${Math.max(0.5, Math.round((m + sd * z) * 10) / 10)}`);
      }
    });
    return rows.join('\n');
  })();

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'anova';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const pf = p => p == null ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3);
  const pIs = p => p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
  const pct = a => Math.round((1 - a) * 100) + '%';

  // ---- parsing (the same two layouts as the box and whisker plot) ----
  // "long": a group column then a value column, one row per measurement.
  // "wide": one column of values per group.
  function shape(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    if (ncol >= 2 && numShare(recs, 0, delim) < 0.6 && numShare(recs, ncol - 1, delim) >= 0.6) {
      return { kind: 'long', ncol, headerGuess: recs.length > 1 && !isNum(recs[0][ncol - 1], delim) };
    }
    return { kind: 'wide', ncol, headerGuess: recs.length > 1 && recs[0].some(v => v !== '' && !isNum(v, delim)) };
  }

  function parse(text, hasHeader) {
    const s = split(text);
    if (!s) return null;
    const { recs, delim } = s;
    const sh = shape(recs, delim);
    const head = hasHeader ? recs[0] : null;
    const body = hasHeader ? recs.slice(1) : recs;
    const groups = new Map();
    const get = (name, key) => {
      if (!groups.has(key)) groups.set(key, { name, values: [] });
      return groups.get(key);
    };
    let skipped = 0;
    if (sh.kind === 'long') {
      for (const r of body) {
        const v = num(r[sh.ncol - 1], delim);
        if (!isFinite(v)) { skipped++; continue; }
        const name = (r[0] || '').trim() || '(blank)';
        get(name, name.toLowerCase().replace(/\s+/g, ' ')).values.push(v);
      }
    } else {
      for (let c = 0; c < sh.ncol; c++) {
        const name = (head && head[c]) || 'Column ' + (c + 1);
        const g = get(name, 'c' + c);
        for (const r of body) {
          if (r[c] === undefined || r[c] === '') continue;
          const v = num(r[c], delim);
          if (isFinite(v)) g.values.push(v); else skipped++;
        }
      }
    }
    let kept = [...groups.values()].filter(g => g.values.length);
    const single = kept.filter(g => g.values.length < 2).map(g => g.name);
    kept = kept.filter(g => g.values.length >= 2);
    const extra = Math.max(0, kept.length - MAX_GROUPS);
    kept = kept.slice(0, MAX_GROUPS);
    return {
      kind: sh.kind, ncol: sh.ncol, groups: kept, extra, skipped, single,
      groupName: sh.kind === 'long' ? ((head && head[0]) || 'Group') : 'Group',
      valName: sh.kind === 'long' ? ((head && head[sh.ncol - 1]) || '') : ''
    };
  }

  // ---- distributions ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { tP, tCrit, fP, sum, quantile, oneWay, splitTable: split, readNumber: num, isNumberCell: isNum, numericShare: numShare } = FocusStats;

  // ---- statistics ----

  function describe(g) {
    const v = g.values, n = v.length, mean = sum(v) / n;
    const variance = sum(v.map(x => (x - mean) * (x - mean))) / (n - 1);
    const sorted = v.slice().sort((a, b) => a - b);
    return { name: g.name, values: v, n, mean, variance, sd: Math.sqrt(variance), med: quantile(sorted, 0.5), min: sorted[0], max: sorted[n - 1] };
  }
  // Welch's ANOVA, which doesn't assume equal variances. Needs every group to vary.
  function welch(stats) {
    if (stats.some(s => !(s.variance > 0))) return null;
    const k = stats.length, w = stats.map(s => s.n / s.variance), W = sum(w);
    const mw = sum(stats.map((s, i) => w[i] * s.mean)) / W;
    const A = sum(stats.map((s, i) => w[i] * (s.mean - mw) ** 2)) / (k - 1);
    const tmp = sum(stats.map((s, i) => (1 - w[i] / W) ** 2 / (s.n - 1)));
    const F = A / (1 + 2 * (k - 2) / (k * k - 1) * tmp);
    const df1 = k - 1, df2 = (k * k - 1) / (3 * tmp);
    return { F, df1, df2, p: fP(F, df1, df2) };
  }
  // Brown–Forsythe test for equal spread: ANOVA on distances from each group's median.
  function spreadTest(stats) {
    const r = oneWay(stats.map(s => s.values.map(x => Math.abs(x - s.med))));
    return isFinite(r.F) ? { F: r.F, df1: r.dfb, df2: r.dfw, p: r.p } : null;
  }
  // Holm's step-down adjustment.
  function holm(ps) {
    const idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]), m = ps.length, out = new Array(m);
    let run = 0;
    idx.forEach((i, r) => { run = Math.max(run, Math.min(1, (m - r) * ps[i])); out[i] = run; });
    return out;
  }
  function pairwise(stats, useWelch, msw, dfw) {
    const pairs = [];
    for (let i = 0; i < stats.length; i++) for (let j = i + 1; j < stats.length; j++) {
      const a = stats[i], b = stats[j], diff = a.mean - b.mean;
      let se, df;
      if (useWelch) {
        const va = a.variance / a.n, vb = b.variance / b.n;
        se = Math.sqrt(va + vb); df = (va + vb) ** 2 / (va * va / (a.n - 1) + vb * vb / (b.n - 1));
      } else { se = Math.sqrt(msw * (1 / a.n + 1 / b.n)); df = dfw; }
      const p = se > 0 ? tP(Math.abs(diff / se), df) : (diff === 0 ? 1 : 0);
      pairs.push({ a, b, diff, se, df, p });
    }
    holm(pairs.map(x => x.p)).forEach((p, i) => { pairs[i].padj = p; });
    return pairs;
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

  // ---- drawing: each group's values, mean and confidence interval ----
  const charW = size => size * 0.56;
  function renderSVG(stats, o) {
    const W = drawW, M = 16, k = stats.length;
    const legend = [['mean', 'Mean'], ['ci', pct(o.alpha) + ' confidence interval'], ['grand', 'Overall mean']];
    if (o.showPoints) legend.push(['point', 'Each value']);
    const MT = (o.title ? 44 : 8) + 30;
    const ML = 72 + (o.valName ? 22 : 0), MR = 24;
    const plotW = W - ML - MR, band = plotW / k;
    const spread = Math.max(8, Math.min(90, band * 0.55));
    const longest = Math.max(...stats.map(s => s.name.length));
    const rotate = charW(13) * Math.min(longest, 28) > band - 8;
    const labelH = rotate ? Math.min(140, 18 + charW(13) * Math.min(longest, 22) * 0.64) + 18 : 44;
    const plotH = 400, H = MT + plotH + labelH + M;

    const all = [];
    stats.forEach(s => {
      all.push(s.ciLo, s.ciHi);
      if (o.showPoints) all.push(s.min, s.max);
    });
    let lo = Math.min(...all), hi = Math.max(...all);
    if (o.zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    const ax = axis(lo, hi);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const f = v => Math.round(v * 10) / 10;

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${M}" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (M) - 16) / 11.2))))}</text>`);

    // legend, right-aligned above the plot
    const keyW = t => 28 + charW(12) * t.length + 18;
    let lx = W - MR - legend.reduce((a, [, t]) => a + keyW(t), 0);
    const ly = MT - 16;
    legend.forEach(([kind, t]) => {
      const cx = lx + 10;
      if (kind === 'mean') s.push(`<circle cx="${cx}" cy="${ly}" r="5.5" fill="${COLORS.mean}" stroke="#ffffff" stroke-width="1.5"/>`);
      if (kind === 'ci') s.push(`<line x1="${cx}" y1="${ly - 7}" x2="${cx}" y2="${ly + 7}" stroke="${COLORS.ci}" stroke-width="2"/><line x1="${cx - 5}" y1="${ly - 7}" x2="${cx + 5}" y2="${ly - 7}" stroke="${COLORS.ci}" stroke-width="2"/><line x1="${cx - 5}" y1="${ly + 7}" x2="${cx + 5}" y2="${ly + 7}" stroke="${COLORS.ci}" stroke-width="2"/>`);
      if (kind === 'grand') s.push(`<line x1="${cx - 9}" y1="${ly}" x2="${cx + 9}" y2="${ly}" stroke="${COLORS.grand}" stroke-width="2" stroke-dasharray="5 3"/>`);
      if (kind === 'point') s.push(`<circle cx="${cx}" cy="${ly}" r="3" fill="${COLORS.point}" fill-opacity="0.4"/>`);
      s.push(`<text x="${lx + 24}" y="${ly + 4}" font-size="12" fill="${COLORS.muted}">${esc(t)}</text>`);
      lx += keyW(t);
    });

    // grid and y axis
    ax.ticks.forEach(t => {
      const yy = f(y(t));
      s.push(`<line x1="${ML}" y1="${yy}" x2="${W - MR}" y2="${yy}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${yy + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(nf.format(t))}</text>`);
    });
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    if (o.valName) s.push(`<text transform="translate(${M + 6} ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.valName, 50))}</text>`);

    // overall mean
    const gy = f(y(o.grand));
    s.push(`<line x1="${ML}" y1="${gy}" x2="${W - MR}" y2="${gy}" stroke="${COLORS.grand}" stroke-width="2" stroke-dasharray="6 4"><title>Overall mean: ${esc(nf.format(o.grand))}</title></line>`);

    stats.forEach((st, i) => {
      const cx = ML + band * (i + 0.5), cap = Math.min(24, spread * 0.5);
      const tip = `${st.name}: n = ${st.n}, mean ${nf.format(st.mean)}, ${pct(o.alpha)} confidence interval ${nf.format(st.ciLo)} to ${nf.format(st.ciHi)}, standard deviation ${nf.format(st.sd)}`;
      s.push(`<g><title>${esc(tip)}</title>`);
      if (o.showPoints) {
        st.values.forEach((v, j) => {
          const jx = (((j + 1) * 0.6180339887) % 1 - 0.5) * spread;
          s.push(`<circle cx="${f(cx + jx)}" cy="${f(y(v))}" r="2.6" fill="${COLORS.point}" fill-opacity="0.4"/>`);
        });
      }
      s.push(`<line x1="${f(cx)}" y1="${f(y(st.ciHi))}" x2="${f(cx)}" y2="${f(y(st.ciLo))}" stroke="${COLORS.ci}" stroke-width="2.5"/>`);
      s.push(`<line x1="${f(cx - cap / 2)}" y1="${f(y(st.ciHi))}" x2="${f(cx + cap / 2)}" y2="${f(y(st.ciHi))}" stroke="${COLORS.ci}" stroke-width="2.5"/>`);
      s.push(`<line x1="${f(cx - cap / 2)}" y1="${f(y(st.ciLo))}" x2="${f(cx + cap / 2)}" y2="${f(y(st.ciLo))}" stroke="${COLORS.ci}" stroke-width="2.5"/>`);
      s.push(`<circle cx="${f(cx)}" cy="${f(y(st.mean))}" r="7" fill="${COLORS.mean}" stroke="#ffffff" stroke-width="2"/>`);
      s.push('</g>');
      const ty = MT + plotH + 18;
      if (rotate) {
        s.push(`<text transform="translate(${f(cx + 4)} ${ty}) rotate(-40)" font-size="13" font-weight="600" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(st.name, 22))} <tspan font-weight="400" fill="${COLORS.muted}">(n=${st.n})</tspan></text>`);
      } else {
        s.push(`<text x="${f(cx)}" y="${ty}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(st.name, Math.max(3, Math.floor((band - 6) / charW(13)))))}</text>`);
        s.push(`<text x="${f(cx)}" y="${ty + 17}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">n = ${st.n}</text>`);
      }
    });
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function readingParts() {
    const { stats, o, res, cls, wel, spread, pairs } = current;
    const unit = o.valName ? ' ' + esc(lower(o.valName)) : '';
    const v = x => nf.format(x) + unit;
    const paras = [];
    const sig = res.p < o.alpha;
    const fText = `F(${nf.format(res.df1)}, ${nf.format(res.df2)}) = ${isFinite(res.F) ? nf.format(res.F) : '∞'}, ${pIs(res.p)}`;
    paras.push(sig
      ? `<b>There is evidence that the group means differ</b> (${o.useWelch ? 'Welch’s ANOVA, ' : ''}${fText}). Differences this large would happen less than ${Math.round(o.alpha * 100)}% of the time if every group really had the same mean.`
      : `<b>There isn’t enough evidence that the group means differ</b> (${o.useWelch ? 'Welch’s ANOVA, ' : ''}${fText}). The differences you can see could well be down to chance. That doesn’t prove the groups are the same: with more data a real but small difference might show up.`);

    const byMean = stats.slice().sort((a, b) => b.mean - a.mean);
    const top = byMean[0], bot = byMean[byMean.length - 1];
    paras.push(`<b>${esc(top.name)}</b> has the highest mean, at ${v(top.mean)}, and <b>${esc(bot.name)}</b> the lowest, at ${v(bot.mean)}: a gap of ${v(top.mean - bot.mean)}. Differences between groups account for ${Math.round(cls.eta2 * 100)}% of the variation in the values; the rest is variation within the groups.`);

    if (stats.length > 2) {
      const clear = pairs.filter(x => x.padj < o.alpha);
      if (clear.length) {
        const shown = clear.slice().sort((a, b) => a.padj - b.padj).slice(0, 6).map(x => {
          const [hi, lo] = x.diff >= 0 ? [x.a, x.b] : [x.b, x.a];
          return `${esc(hi.name)} is higher than ${esc(lo.name)} by ${v(Math.abs(x.diff))}`;
        });
        paras.push(`Comparing each pair of groups, ${clear.length === 1 ? 'one pair differs' : `${clear.length} of the ${pairs.length} pairs differ`} clearly: ${list(shown)}${clear.length > 6 ? ', among others' : ''}. ${clear.length < pairs.length ? 'The other pairs could differ by chance alone.' : ''}`);
      } else if (sig) {
        paras.push('No single pair of groups differs clearly once the pairwise comparisons are adjusted for how many there are. The overall difference may be spread across several groups; more data would help pin it down.');
      }
    }

    if (!wel && o.method !== 'classic') {
      paras.push('At least one group has values that are all the same, so Welch’s ANOVA can’t be worked out and the standard ANOVA is shown instead.');
    }
    if (spread) {
      const ratio = o.sdRatio;
      if (spread.p < 0.05 || ratio > 2) {
        paras.push(`The groups aren’t equally spread out (${isFinite(ratio) ? `the largest standard deviation is ${nf.format(ratio)} times the smallest; ` : ''}spread check ${pIs(spread.p)}). ${o.useWelch ? 'So this uses Welch’s ANOVA, which allows for that.' : wel ? 'Welch’s ANOVA, which allows for that, would be the safer choice: choose it under Test settings.' : 'The p-value may be less reliable as a result.'}`);
      } else {
        paras.push(`The groups are similarly spread out (spread check ${pIs(spread.p)}), so the standard ANOVA’s assumption of equal spread looks reasonable.${o.useWelch && wel ? ` Welch’s ANOVA gives ${pIs(wel.p)}, compared with ${pIs(cls.p)} for the standard test.` : ''}`);
      }
    }

    if (stats.length === 2) paras.push('With two groups, ANOVA gives the same answer as a t-test.');
    const small = stats.filter(s => s.n < SMALL_N);
    if (small.length) paras.push(`${small.length === stats.length ? 'Every group has' : `${list(small.map(s => esc(s.name)))} ${small.length === 1 ? 'has' : 'have'}`} fewer than ${SMALL_N} values, so the test has little power to find a difference and the means could shift a lot with more data. Treat the result with caution.`);
    return paras;
  }
  function summaryText() {
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [current.o.title || 'One-way ANOVA', ''];
    readingParts().forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- tables ----
  const r4 = x => isFinite(x) ? Math.round(x * 1e4) / 1e4 : x;
  const pcsv = p => p < 0.0001 ? '<0.0001' : r4(p);
  function tableRows() {
    const { stats, o, cls, wel, spread, pairs } = current;
    const ci = pct(o.alpha) + ' CI';
    const out = [[o.groupName, 'Count', 'Mean', ci + ' lower', ci + ' upper', 'Standard deviation', 'Median']];
    stats.forEach(s => out.push([s.name, s.n, r4(s.mean), r4(s.ciLo), r4(s.ciHi), r4(s.sd), r4(s.med)]));
    out.push([], ['Standard ANOVA', 'Sum of squares', 'df', 'Mean square', 'F', 'p']);
    out.push(['Between groups', r4(cls.ssb), cls.dfb, r4(cls.msb), r4(cls.F), pcsv(cls.p)]);
    out.push(['Within groups', r4(cls.ssw), cls.dfw, r4(cls.msw), '', '']);
    out.push(['Total', r4(cls.sst), cls.N - 1, '', '', '']);
    if (wel) out.push([], ['Welch’s ANOVA', 'F', 'df1', 'df2', 'p'], ['', r4(wel.F), wel.df1, r4(wel.df2), pcsv(wel.p)]);
    if (spread) out.push([], ['Spread check (Brown–Forsythe)', 'F', 'df1', 'df2', 'p'], ['', r4(spread.F), spread.df1, spread.df2, pcsv(spread.p)]);
    if (pairs.length) {
      out.push([], ['Pair', 'Difference in means', 'p (Holm adjusted)', 'Clear difference']);
      pairs.forEach(x => out.push([`${x.a.name} vs ${x.b.name}`, r4(x.diff), pcsv(x.padj), x.padj < o.alpha ? 'Yes' : 'No']));
    }
    return out;
  }
  function tableHTML() {
    const { stats, o, cls, wel, spread, pairs } = current;
    const n = x => isFinite(x) ? nf.format(x) : '∞';
    let h = '<div class="tablewrap"><h3>Each group</h3><table><caption class="sr">Summary of each group</caption><thead><tr>';
    h += `<th>${esc(o.groupName)}</th>` + ['Count', 'Mean', pct(o.alpha) + ' confidence interval', 'Standard deviation', 'Median'].map(t => `<th class="num">${t}</th>`).join('');
    h += '</tr></thead><tbody>';
    stats.forEach(s => {
      h += `<tr><td>${esc(s.name)}</td><td class="num${s.n < SMALL_N ? ' warn' : ''}">${s.n}</td><td class="num"><b>${n(s.mean)}</b></td><td class="num">${n(s.ciLo)} to ${n(s.ciHi)}</td><td class="num">${n(s.sd)}</td><td class="num">${n(s.med)}</td></tr>`;
    });
    h += '</tbody></table></div>';

    h += `<div class="tablewrap"><h3>${o.useWelch ? 'ANOVA tables' : 'ANOVA table'}</h3>`;
    if (o.useWelch && wel) {
      h += `<table><caption class="sr">Welch’s ANOVA</caption><thead><tr><th>Welch’s ANOVA</th><th class="num">F</th><th class="num">df1</th><th class="num">df2</th><th class="num">p</th></tr></thead><tbody><tr><td>Between groups</td><td class="num">${n(wel.F)}</td><td class="num">${wel.df1}</td><td class="num">${n(wel.df2)}</td><td class="num"><b>${pf(wel.p)}</b></td></tr></tbody></table><p class="hint">The standard ANOVA below is shown for reference.</p>`;
    }
    h += `<table${o.useWelch ? ' style="margin-top:1rem"' : ''}><caption class="sr">Standard one-way ANOVA</caption><thead><tr><th>${o.useWelch ? 'Standard ANOVA' : 'Source'}</th><th class="num">Sum of squares</th><th class="num">df</th><th class="num">Mean square</th><th class="num">F</th><th class="num">p</th></tr></thead><tbody>`;
    h += `<tr><td>Between groups</td><td class="num">${n(cls.ssb)}</td><td class="num">${cls.dfb}</td><td class="num">${n(cls.msb)}</td><td class="num">${n(cls.F)}</td><td class="num">${o.useWelch ? pf(cls.p) : `<b>${pf(cls.p)}</b>`}</td></tr>`;
    h += `<tr><td>Within groups</td><td class="num">${n(cls.ssw)}</td><td class="num">${cls.dfw}</td><td class="num">${n(cls.msw)}</td><td></td><td></td></tr>`;
    h += `<tr><td>Total</td><td class="num">${n(cls.sst)}</td><td class="num">${cls.N - 1}</td><td></td><td></td><td></td></tr>`;
    h += '</tbody></table>';
    if (spread) h += `<p class="hint">Spread check (Brown–Forsythe test for equal variances): F(${spread.df1}, ${spread.df2}) = ${n(spread.F)}, p ${spread.p < 0.001 ? '< 0.001' : '= ' + spread.p.toFixed(3)}. A p-value below 0.05 suggests the groups are not equally spread out.</p>`;
    h += '</div>';

    if (pairs.length && stats.length > 2) {
      h += `<div class="tablewrap"><h3>Pairwise comparisons</h3><table><caption class="sr">Difference in means for each pair of groups</caption><thead><tr><th>Pair</th><th class="num">Difference in means</th><th class="num">p (adjusted)</th><th>Clear difference?</th></tr></thead><tbody>`;
      pairs.forEach(x => {
        const yes = x.padj < o.alpha;
        h += `<tr><td>${esc(x.a.name)} vs ${esc(x.b.name)}</td><td class="num">${n(x.diff)}</td><td class="num">${pf(x.padj)}</td><td class="${yes ? 'yes' : ''}">${yes ? 'Yes' : 'No'}</td></tr>`;
      });
      h += `</tbody></table><p class="hint">${o.useWelch ? 'Welch’s t-test' : 'A t-test using the pooled within-group variation'} for each pair, with p-values adjusted by Holm’s method for the ${pairs.length} comparisons. Difference is the first group’s mean minus the second’s.</p></div>`;
    }
    return h;
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    const sp = split(text);
    if (!headerTouched) els.hasHeader.checked = !!(sp && sp.recs.length > 1 && shape(sp.recs, sp.delim).headerGuess);
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to run the test.'); }
    const p = parse(text, els.hasHeader.checked);
    if (!p || !p.groups.length) {
      els.detected.textContent = p && p.single.length ? 'Each group needs at least two values.' : 'Couldn’t find any numbers.';
      return renderEmpty('Paste a column of group names and a column of values, or one column of values for each group.');
    }
    const nVals = p.groups.reduce((a, g) => a + g.values.length, 0);
    let note = p.kind === 'long'
      ? `Reading ${nVals} values in ${p.groups.length} group${p.groups.length === 1 ? '' : 's'}, from a column of group names and a column of values.`
      : `Reading ${p.groups.length} column${p.groups.length === 1 ? '' : 's'} as groups, ${nVals} values in all.`;
    if (p.kind === 'long' && p.ncol > 2) note += ` The middle column${p.ncol > 3 ? 's are' : ' is'} not used.`;
    if (p.single.length) note += ` Left out ${list(p.single.slice(0, 3))}${p.single.length > 3 ? ' and others' : ''}: each group needs at least two values.`;
    if (p.extra) note += ` Only the first ${MAX_GROUPS} groups are used.`;
    if (p.skipped) note += ` ${p.skipped} cell${p.skipped > 1 ? 's' : ''} skipped (not a number).`;
    els.detected.textContent = note;
    if (p.groups.length < 2) return renderEmpty('ANOVA compares groups, so it needs at least two groups with two or more values each.');

    let stats = p.groups.map(describe);
    const cls = oneWay(stats.map(s => s.values));
    const wel = welch(stats);
    const spread = spreadTest(stats);
    const sds = stats.map(s => s.sd), sdRatio = Math.min(...sds) > 0 ? Math.max(...sds) / Math.min(...sds) : Infinity;
    const method = els.method.value;
    const unequal = !!spread && (spread.p < 0.05 || sdRatio > 2);
    const useWelch = !!wel && (method === 'welch' || (method === 'auto' && unequal));
    const alpha = +els.alpha.value;
    const res = useWelch ? { F: wel.F, df1: wel.df1, df2: wel.df2, p: wel.p } : { F: cls.F, df1: cls.dfb, df2: cls.dfw, p: cls.p };

    stats.forEach(s => {
      const half = useWelch ? tCrit(s.n - 1, alpha) * s.sd / Math.sqrt(s.n) : tCrit(cls.dfw, alpha) * Math.sqrt(cls.msw / s.n);
      s.ciLo = s.mean - half; s.ciHi = s.mean + half;
    });
    const pairs = pairwise(stats, useWelch, cls.msw, cls.dfw);
    const ord = els.order.value;
    if (ord === 'meanDesc') stats.sort((a, b) => b.mean - a.mean);
    if (ord === 'meanAsc') stats.sort((a, b) => a.mean - b.mean);
    if (ord === 'name') stats.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true }));

    const title = els.title.value.trim();
    const valName = els.valLabel.value.trim() || p.valName;
    const o = {
      title, valName, alpha, method, useWelch, sdRatio, grand: cls.grand, groupName: p.groupName,
      showPoints: els.showPoints.checked, zero: els.zero.checked
    };
    const sig = res.p < alpha;
    o.aria = (title ? title + '. ' : '') + `Means of ${stats.length} groups with ${pct(alpha)} confidence intervals. ` +
      stats.slice(0, 8).map(s => `${s.name}: mean ${nf.format(s.mean)}, ${nf.format(s.ciLo)} to ${nf.format(s.ciHi)}`).join('; ') + (stats.length > 8 ? '; and more.' : '.') +
      ` ${sig ? 'The means differ' : 'No clear difference between the means'}, ${pIs(res.p)}.`;
    current = { stats, o, res, cls, wel, spread, pairs };
    const svg = drawShown(() => renderSVG(stats, o));
    trackChart({ points: nVals });

    const headline = sig ? 'The group means <strong>differ</strong>' : 'No clear difference between the group means';
    const sub = `${o.useWelch ? 'Welch’s' : 'One-way'} ANOVA of ${nVals} values in ${stats.length} groups, at the ${Math.round(alpha * 100)}% significance level.`;
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${pf(res.p)}</b><span>p-value</span></div>
        <div class="stat"><b>${isFinite(res.F) ? nf.format(res.F) : '∞'}</b><span>F statistic</span></div>
        <div class="stat"><b>${Math.round(cls.eta2 * 100)}%</b><span>Variation explained by group</span></div>
        <div class="stat"><b>${stats.length}</b><span>Groups, ${nVals} values</span></div>
      </div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">Each dot in colour is a group’s mean, with a bar showing its ${pct(alpha)} confidence interval. Hover over a group to see its figures.</p>
      <div class="reading"><h3>What the test shows</h3>${readingParts().map(x => `<p>${x}</p>`).join('')}</div>
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
    if (a === 'csv') downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '.csv').then(ok => saved(ok, 'Tables downloaded.'), failed);
    if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => status(ok ? 'Tables copied — paste them into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Summary copied.' : 'Copy was blocked.'));
  }
  function loadExample() {
    els.data.value = EXAMPLE;
    els.title.value = 'Hours from decision to discharge to leaving the ward (example)';
    els.valLabel.value = 'Hours';
    els.order.value = 'entered';
    els.method.value = 'auto';
    els.alpha.value = '0.05';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  [els.title, els.valLabel].forEach(el => el.addEventListener('input', schedule));
  [els.method, els.alpha, els.order, els.showPoints, els.zero].forEach(el => el.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ method: 'method', alpha: 'alpha', order: 'order', showPoints: 'showPoints', zeroAxis: 'zero' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.valLabel.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'anova', toolName: 'ANOVA',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

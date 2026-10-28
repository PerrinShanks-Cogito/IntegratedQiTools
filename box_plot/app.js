/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'), valLabel: $('valLabel'),
    order: $('order'), whiskers: $('whiskers'), showMean: $('showMean'), showPoints: $('showPoints'), zero: $('zero'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', box: '#005EB8', boxFill: '#C7DCF1', median: '#003087', mean: '#ED8B00', outlier: '#AE2573', point: '#4C6272' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const MAX_GROUPS = 30;
  const SMALL_N = 5;

  let headerTouched = false;
  let current = null;
  let timer = null;
  // The chart on screen is drawn at the width it's shown at (like the SPC
  // chart), so it fills wide screens without the text growing. Exports still
  // use the standard 960-wide drawing.
  const MIN_W = 760;
  let shownW = 0;
  function chartWidth() { return Math.max(MIN_W, Math.round(els.result.clientWidth) - 2); }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (current && chartWidth() !== shownW) redrawChart(); }, 150);
  });

  // Example: minutes from arrival to being seen in ED, 28 patients sampled each day (made-up data)
  const EXAMPLE = (function () {
    let seed = 20261023;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const days = [['Monday', 62, 0.42], ['Tuesday', 48, 0.35], ['Wednesday', 45, 0.33], ['Thursday', 47, 0.36], ['Friday', 55, 0.4], ['Saturday', 41, 0.3], ['Sunday', 50, 0.38]];
    const rows = ['Day\tMinutes to be seen'];
    days.forEach(([d, med, sd]) => {
      for (let i = 0; i < 28; i++) {
        const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
        rows.push(`${d}\t${Math.max(4, Math.round(med * Math.exp(sd * z)))}`);
      }
    });
    rows.push('Monday\t236', 'Friday\t188', 'Saturday\t131');
    return rows.join('\n');
  })();

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'box-plot';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');

  // ---- parsing ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { quantile, splitTable: split, readNumber: num, isNumberCell: isNum, numericShare: numShare } = FocusStats;

  // "long": a group column then a value column, one row per measurement.
  // "wide": one column of values per group. A single column is one group.
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
        const name = (head && head[c]) || (sh.ncol === 1 ? 'All values' : 'Column ' + (c + 1));
        const g = get(name, 'c' + c);
        for (const r of body) {
          if (r[c] === undefined || r[c] === '') continue;
          const v = num(r[c], delim);
          if (isFinite(v)) g.values.push(v); else skipped++;
        }
      }
    }
    let kept = [...groups.values()].filter(g => g.values.length);
    const extra = Math.max(0, kept.length - MAX_GROUPS);
    kept = kept.slice(0, MAX_GROUPS);
    return {
      kind: sh.kind, ncol: sh.ncol, groups: kept, extra, skipped,
      groupName: sh.kind === 'long' ? ((head && head[0]) || 'Group') : 'Group',
      valName: sh.kind === 'long' ? ((head && head[sh.ncol - 1]) || '') : ''
    };
  }

  // ---- statistics ----

  function describe(g, tukey) {
    const v = g.values.slice().sort((a, b) => a - b), n = v.length;
    const q1 = quantile(v, 0.25), med = quantile(v, 0.5), q3 = quantile(v, 0.75), iqr = q3 - q1;
    const mean = v.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
    let lo = v[0], hi = v[n - 1], outliers = [];
    if (tukey) {
      const lf = q1 - 1.5 * iqr, uf = q3 + 1.5 * iqr;
      // whiskers reach the furthest values inside the fences, but never back inside the box
      lo = Math.min(q1, v.find(x => x >= lf)); hi = Math.max(q3, [...v].reverse().find(x => x <= uf));
      outliers = v.filter(x => x < lf || x > uf);
    }
    return { name: g.name, values: g.values, sorted: v, n, min: v[0], max: v[n - 1], q1, med, q3, iqr, mean, sd, lo, hi, outliers };
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
  function renderSVG(stats, o) {
    const W = o.width || 960, M = 16, k = stats.length;
    const legend = [['median', 'Median']];
    if (o.showMean) legend.push(['mean', 'Mean']);
    if (o.tukey && stats.some(s => s.outliers.length)) legend.push(['outlier', 'Outlier']);
    if (o.showPoints) legend.push(['point', 'Each value']);
    const MT = (o.title ? 44 : 8) + 30;
    const ML = 72 + (o.valName ? 22 : 0), MR = 24;
    const plotW = W - ML - MR, band = plotW / k;
    const boxW = Math.max(8, Math.min(90, band * 0.55));
    const longest = Math.max(...stats.map(s => s.name.length));
    const rotate = charW(13) * Math.min(longest, 28) > band - 8;
    const labelH = rotate ? Math.min(140, 18 + charW(13) * Math.min(longest, 22) * 0.64) + 18 : 44;
    const plotH = 400, H = MT + plotH + labelH + M;

    const all = [];
    stats.forEach(s => { all.push(s.min, s.max); if (o.showMean) all.push(s.mean); });
    let lo = Math.min(...all), hi = Math.max(...all);
    if (o.zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    const ax = axis(lo, hi);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const f = v => Math.round(v * 10) / 10;

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${M}" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - 2 * M) / charW(20)))))}</text>`);

    // legend, right-aligned above the plot
    const keyW = t => 28 + charW(12) * t.length + 18;
    let lx = W - MR - legend.reduce((a, [, t]) => a + keyW(t), 0);
    const ly = MT - 16;
    legend.forEach(([kind, t]) => {
      const cx = lx + 10;
      if (kind === 'median') s.push(`<line x1="${cx - 9}" y1="${ly}" x2="${cx + 9}" y2="${ly}" stroke="${COLORS.median}" stroke-width="3"/>`);
      if (kind === 'mean') s.push(`<path d="M${cx} ${ly - 5}L${cx + 5} ${ly}L${cx} ${ly + 5}L${cx - 5} ${ly}Z" fill="${COLORS.mean}" stroke="${COLORS.ink}" stroke-width="1"/>`);
      if (kind === 'outlier') s.push(`<circle cx="${cx}" cy="${ly}" r="4" fill="#ffffff" stroke="${COLORS.outlier}" stroke-width="2"/>`);
      if (kind === 'point') s.push(`<circle cx="${cx}" cy="${ly}" r="3" fill="${COLORS.point}" fill-opacity="0.45"/>`);
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

    stats.forEach((st, i) => {
      const cx = ML + band * (i + 0.5), x0 = cx - boxW / 2, cap = boxW * 0.4;
      const tip = `${st.name}: n = ${st.n}, median ${nf.format(st.med)}, quartiles ${nf.format(st.q1)} to ${nf.format(st.q3)}, range ${nf.format(st.min)} to ${nf.format(st.max)}${st.outliers.length ? `, ${st.outliers.length} outlier${st.outliers.length > 1 ? 's' : ''}` : ''}`;
      s.push(`<g><title>${esc(tip)}</title>`);
      // whiskers
      s.push(`<line x1="${f(cx)}" y1="${f(y(st.q3))}" x2="${f(cx)}" y2="${f(y(st.hi))}" stroke="${COLORS.box}" stroke-width="1.5"/>`);
      s.push(`<line x1="${f(cx)}" y1="${f(y(st.q1))}" x2="${f(cx)}" y2="${f(y(st.lo))}" stroke="${COLORS.box}" stroke-width="1.5"/>`);
      s.push(`<line x1="${f(cx - cap / 2)}" y1="${f(y(st.hi))}" x2="${f(cx + cap / 2)}" y2="${f(y(st.hi))}" stroke="${COLORS.box}" stroke-width="1.5"/>`);
      s.push(`<line x1="${f(cx - cap / 2)}" y1="${f(y(st.lo))}" x2="${f(cx + cap / 2)}" y2="${f(y(st.lo))}" stroke="${COLORS.box}" stroke-width="1.5"/>`);
      // box and median
      s.push(`<rect x="${f(x0)}" y="${f(y(st.q3))}" width="${f(boxW)}" height="${f(Math.max(0, y(st.q1) - y(st.q3)))}" fill="${COLORS.boxFill}" stroke="${COLORS.box}" stroke-width="1.5"/>`);
      s.push(`<line x1="${f(x0)}" y1="${f(y(st.med))}" x2="${f(x0 + boxW)}" y2="${f(y(st.med))}" stroke="${COLORS.median}" stroke-width="3"/>`);
      // every value, spread sideways so they don't sit on top of each other
      if (o.showPoints) {
        st.values.forEach((v, j) => {
          if (st.outliers.includes(v)) return; // drawn as an outlier circle instead
          const jx = (((j + 1) * 0.6180339887) % 1 - 0.5) * boxW * 0.7;
          s.push(`<circle cx="${f(cx + jx)}" cy="${f(y(v))}" r="2.6" fill="${COLORS.point}" fill-opacity="0.45"/>`);
        });
      }
      st.outliers.forEach(v => s.push(`<circle cx="${f(cx)}" cy="${f(y(v))}" r="4" fill="#ffffff" stroke="${COLORS.outlier}" stroke-width="2"/>`));
      if (o.showMean) {
        const my = f(y(st.mean)), r = Math.min(6, boxW / 4);
        s.push(`<path d="M${f(cx)} ${f(my - r)}L${f(cx + r)} ${my}L${f(cx)} ${f(my + r)}L${f(cx - r)} ${my}Z" fill="${COLORS.mean}" stroke="${COLORS.ink}" stroke-width="1"/>`);
      }
      s.push('</g>');
      // group label and count
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
  function readingParts(stats, o) {
    const unit = o.valName ? ' ' + esc(lower(o.valName)) : '';
    const v = x => nf.format(x) + unit;
    const paras = [];
    if (stats.length === 1) {
      const s = stats[0];
      paras.push(`The median is <b>${v(s.med)}</b>, so half the ${s.n} values are below it and half above. The middle half lie between ${v(s.q1)} and ${v(s.q3)}, and the values run from ${v(s.min)} to ${v(s.max)}.`);
    } else {
      const byMed = stats.slice().sort((a, b) => b.med - a.med);
      const top = byMed[0], bot = byMed[byMed.length - 1];
      if (top.med === bot.med) paras.push(`All ${stats.length} groups have the same median, ${v(top.med)}.`);
      else paras.push(`<b>${esc(top.name)}</b> has the highest median, at ${v(top.med)}, and <b>${esc(bot.name)}</b> the lowest, at ${v(bot.med)}: a difference of ${v(top.med - bot.med)}.${top.q1 > bot.q3 ? ` Their boxes don’t overlap, so the typical values in ${esc(top.name)} are higher than most of those in ${esc(bot.name)}.` : ` Their boxes overlap, so many values in the two groups are similar.`}`);
      const byIqr = stats.slice().sort((a, b) => b.iqr - a.iqr);
      const wide = byIqr[0], narrow = byIqr[byIqr.length - 1];
      if (wide.iqr > 0 && wide.iqr >= narrow.iqr * 1.5) paras.push(`<b>${esc(wide.name)}</b> is the least predictable: the middle half of its values span ${v(wide.iqr)}, against ${v(narrow.iqr)} for ${esc(narrow.name)}, the most consistent. Reducing variation in ${esc(wide.name)} may matter as much as moving its median.`);
      else paras.push(`The spread is similar across groups, with the middle half of values spanning between ${v(narrow.iqr)} and ${v(wide.iqr)}.`);
    }
    if (o.tukey) {
      const withOut = stats.filter(s => s.outliers.length);
      const nOut = withOut.reduce((a, s) => a + s.outliers.length, 0);
      if (nOut) paras.push(`There ${nOut === 1 ? 'is 1 outlier' : `are ${nOut} outliers`}${stats.length > 1 ? `, in ${list(withOut.map(s => esc(s.name)))}` : ''}. Check ${nOut === 1 ? 'it' : 'them'} first: ${nOut === 1 ? 'it may be a data entry error, or a real case' : 'they may be data entry errors, or real cases'} worth learning from.`);
      else paras.push('There are no outliers: no value is more than 1.5 times the box height beyond its box.');
    }
    const skewed = stats.filter(s => s.n >= SMALL_N && s.iqr > 0 && (s.q3 - s.med) > 2 * (s.med - s.q1) + 1e-9 && s.mean > s.med);
    if (skewed.length && skewed.length >= stats.length / 2) paras.push(`${stats.length === 1 ? 'The values are' : skewed.length === stats.length ? 'In every group the values are' : `In ${list(skewed.map(s => esc(s.name)))} the values are`} skewed upwards: the upper part of the box is longer and the mean is above the median, which is common for waiting times and lengths of stay. The median is the better guide to a typical value here.`);
    const small = stats.filter(s => s.n < SMALL_N);
    if (small.length) paras.push(`${small.length === stats.length ? 'Every group has' : `${list(small.map(s => esc(s.name)))} ${small.length === 1 ? 'has' : 'have'}`} fewer than ${SMALL_N} values, so ${small.length === 1 && small.length !== stats.length ? 'its box' : 'the boxes'} can move a lot with one more measurement. Treat ${small.length === 1 && small.length !== stats.length ? 'it' : 'them'} with caution.`);
    return paras;
  }
  function summaryText() {
    const { stats, o } = current;
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [o.title || 'Box and whisker plot', ''];
    readingParts(stats, o).forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- table ----
  const r2 = x => Math.round(x * 100) / 100;
  function tableRows() {
    const { stats, o } = current;
    const out = [[o.groupName, 'Count', 'Minimum', 'Lower quartile', 'Median', 'Upper quartile', 'Maximum', 'Interquartile range', 'Mean', 'Standard deviation'].concat(o.tukey ? ['Lower whisker', 'Upper whisker', 'Outliers'] : [])];
    stats.forEach(s => out.push([s.name, s.n, s.min, r2(s.q1), r2(s.med), r2(s.q3), s.max, r2(s.iqr), r2(s.mean), r2(s.sd)].concat(o.tukey ? [s.lo, s.hi, s.outliers.join('; ')] : [])));
    return out;
  }
  function tableHTML() {
    const { stats, o } = current;
    let h = '<div class="tablewrap"><table><caption class="sr">Summary of each group</caption><thead><tr>';
    h += `<th>${esc(o.groupName)}</th>` + ['Count', 'Min', 'Lower quartile', 'Median', 'Upper quartile', 'Max', 'IQR', 'Mean'].map(t => `<th class="num">${t}</th>`).join('');
    if (o.tukey) h += '<th class="num">Outliers</th>';
    h += '</tr></thead><tbody>';
    stats.forEach(s => {
      h += `<tr><td>${esc(s.name)}</td><td class="num${s.n < SMALL_N ? ' warn' : ''}">${s.n}</td>` +
        [s.min, s.q1, s.med, s.q3, s.max, s.iqr, s.mean].map((x, i) => `<td class="num">${i === 2 ? '<b>' + nf.format(x) + '</b>' : nf.format(x)}</td>`).join('') +
        (o.tukey ? `<td class="num">${s.outliers.length ? `${s.outliers.length} <span class="sr">(${esc(s.outliers.map(x => nf.format(x)).join(', '))})</span>` : '0'}</td>` : '') + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    const sp = split(text);
    if (!headerTouched) els.hasHeader.checked = !!(sp && sp.recs.length > 1 && shape(sp.recs, sp.delim).headerGuess);
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to build your chart.'); }
    const p = parse(text, els.hasHeader.checked);
    if (!p || !p.groups.length) { els.detected.textContent = 'Couldn’t find any numbers.'; return renderEmpty('Paste a column of numbers, or a column of group names and a column of values.'); }
    const nVals = p.groups.reduce((a, g) => a + g.values.length, 0);
    let note = p.kind === 'long'
      ? `Reading ${nVals} value${nVals === 1 ? '' : 's'} in ${p.groups.length} group${p.groups.length === 1 ? '' : 's'}, from a column of group names and a column of values.`
      : p.groups.length === 1 ? `Reading ${nVals} value${nVals === 1 ? '' : 's'} as one group.` : `Reading ${p.groups.length} columns as groups, ${nVals} values in all.`;
    if (p.kind === 'long' && p.ncol > 2) note += ` The middle column${p.ncol > 3 ? 's are' : ' is'} not used.`;
    if (p.extra) note += ` Only the first ${MAX_GROUPS} groups are shown.`;
    if (p.skipped) note += ` ${p.skipped} cell${p.skipped > 1 ? 's' : ''} skipped (not a number).`;
    els.detected.textContent = note;

    const tukey = els.whiskers.value === 'tukey';
    let stats = p.groups.map(g => describe(g, tukey));
    const ord = els.order.value;
    if (ord === 'medDesc') stats.sort((a, b) => b.med - a.med);
    if (ord === 'medAsc') stats.sort((a, b) => a.med - b.med);
    if (ord === 'name') stats.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true }));

    const title = els.title.value.trim();
    const valName = els.valLabel.value.trim() || p.valName;
    const o = {
      title, valName, tukey, groupName: p.groupName,
      showMean: els.showMean.checked, showPoints: els.showPoints.checked, zero: els.zero.checked
    };
    o.aria = (title ? title + '. ' : '') + `Box and whisker plot of ${nVals} values in ${stats.length} group${stats.length === 1 ? '' : 's'}. ` +
      stats.slice(0, 8).map(s => `${s.name}: median ${nf.format(s.med)}, quartiles ${nf.format(s.q1)} to ${nf.format(s.q3)}`).join('; ') + (stats.length > 8 ? '; and more.' : '.');
    shownW = chartWidth();
    const svg = renderSVG(stats, { ...o, width: shownW });
    trackChart({ points: nVals });
    current = { stats, o };

    const all = p.groups.flatMap(g => g.values).sort((a, b) => a - b);
    const nOut = stats.reduce((a, s) => a + s.outliers.length, 0);
    const unit = valName ? ' ' + esc(lower(valName)) : '';
    let headline, sub;
    if (stats.length === 1) {
      const s = stats[0];
      headline = `The median is <strong>${esc(nf.format(s.med))}</strong>${unit}`;
      sub = `The middle half of the ${s.n} values lie between ${nf.format(s.q1)} and ${nf.format(s.q3)}.`;
    } else {
      const top = stats.slice().sort((a, b) => b.med - a.med)[0];
      headline = `<strong>${esc(top.name)}</strong> has the highest median, at ${esc(nf.format(top.med))}${unit}`;
      sub = `${stats.length} groups and ${nVals} values. Each box holds the middle half of a group’s values.`;
    }
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${nVals}</b><span>Values</span></div>
        ${stats.length > 1 ? `<div class="stat"><b>${stats.length}</b><span>Groups</span></div>` : ''}
        <div class="stat"><b>${nf.format(quantile(all, 0.5))}</b><span>Median${stats.length > 1 ? ' of all values' : ''}</span></div>
        ${tukey ? `<div class="stat"><b>${nOut}</b><span>Outliers</span></div>` : `<div class="stat"><b>${nf.format(all[0])} – ${nf.format(all[all.length - 1])}</b><span>Range</span></div>`}
      </div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">Hover over a box to see its figures.</p>
      <div class="reading"><h3>What the chart shows</h3>${readingParts(stats, o).map(x => `<p>${x}</p>`).join('')}</div>
      ${tableHTML()}`;
  }
  function renderEmpty(msg) {
    current = null;
    els.result.innerHTML = `<div class="empty"><p>${esc(msg)}</p><button type="button" class="primary" data-act="example">Try the example</button></div>`;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 180); }

  // ---- exports ----
  function redrawChart() {
    shownW = chartWidth();
    $('chart').innerHTML = renderSVG(current.stats, { ...current.o, width: shownW });
  }
  // Exports use the standard 960-wide drawing, whatever the size on screen
  function svgEl() {
    if (!current) return null;
    const d = document.createElement('div');
    d.innerHTML = renderSVG(current.stats, current.o);
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
    els.title.value = 'Minutes from arrival to being seen in ED, by day (example)';
    els.valLabel.value = 'Minutes';
    els.order.value = 'entered';
    els.whiskers.value = 'tukey';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  [els.title, els.valLabel].forEach(el => el.addEventListener('input', schedule));
  [els.order, els.whiskers, els.showMean, els.showPoints, els.zero].forEach(el => el.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ order: 'order', whiskers: 'whiskers', showMean: 'showMean', showPoints: 'showPoints', zeroAxis: 'zero' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.valLabel.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'box_plot', toolName: 'box and whisker plot',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    xLabel: $('xLabel'), yLabel: $('yLabel'), showTrend: $('showTrend'), byGroup: $('byGroup'),
    flagOdd: $('flagOdd'), zero: $('zero'), result: $('result')
  };
  const COLORS = { point: '#005EB8', trend: '#AE2573', ink: '#212B32', muted: '#4C6272', grid: '#E3E8EB', flag: '#A65300' };
  const GROUP = ['#005EB8', '#AE2573', '#007F3B', '#ED8B00', '#330072', '#00A499', '#768692', '#DA291C'];
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const f2 = v => (Math.round(v * 100) / 100).toFixed(2);

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

  // Example: daily ward occupancy and time to finish the morning medication round (one unusual day)
  const EX_X = [22, 25, 19, 28, 30, 24, 21, 27, 31, 26, 23, 29, 20, 25, 28, 32, 24, 22, 30, 27, 26, 21, 29, 23];
  const EX_N = [4, -6, 2, 8, -3, -5, 7, 1, -8, 3, -2, 6, -4, 9, -7, 2, 5, -3, 4, -1, 22, 3, 6, 0];
  function exampleText() {
    const lines = ['Date\tPatients on the ward\tMinutes to finish the round'];
    const d = new Date(Date.UTC(2024, 8, 2)); let k = 0;
    while (k < EX_X.length) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        lines.push(`${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}\t${EX_X[k]}\t${35 + 3 * EX_X[k] + EX_N[k]}`);
        k++;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return lines.join('\n');
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scatter-plot';

  // ---- parsing ----
  function split(text) {
    // with no delimiter, a line is x and y, or a label then x and y
    return splitTable(text, { space: t => { const p = t.split(/\s+/); return p.length > 2 ? [p.slice(0, -2).join(' '), p[p.length - 2], p[p.length - 1]] : p; }, trimTrailing: true });
  }

  // Shared statistics, from /assets/js/focus-stats.js
  const { ibeta, mean: avg, ranks: rank, readNumber: num, splitTable } = FocusStats;

  function columns(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    const body = recs.length > 1 ? recs.slice(1) : recs;
    const isNum = [];
    for (let c = 0; c < ncol; c++) {
      const cells = body.map(r => r[c]).filter(v => v !== undefined && v !== '');
      const ok = cells.filter(v => isFinite(num(v, delim))).length;
      isNum.push(cells.length > 0 && ok / cells.length >= 0.6);
    }
    const numCols = isNum.map((b, i) => b ? i : -1).filter(i => i >= 0);
    if (numCols.length < 2) return null;
    const xc = numCols[0], yc = numCols[1];
    const textCols = isNum.map((b, i) => !b ? i : -1).filter(i => i >= 0);
    return { xc, yc, lc: textCols.find(i => i < xc), gc: [...textCols].reverse().find(i => i > yc) };
  }
  function headerGuess(text) {
    const s = split(text); if (!s) return false;
    const c = columns(s.recs, s.delim); if (!c) return false;
    const h = s.recs[0];
    return !isFinite(num(h[c.xc], s.delim)) || !isFinite(num(h[c.yc], s.delim));
  }
  function parse(text, hasHeader) {
    const s = split(text);
    if (!s) return null;
    const c = columns(s.recs, s.delim);
    if (!c) return { tooFew: true, rows: [], skipped: s.recs.length };
    const head = hasHeader ? s.recs[0] : null;
    const data = hasHeader ? s.recs.slice(1) : s.recs;
    const rows = []; let skipped = 0;
    data.forEach(r => {
      const x = num(r[c.xc], s.delim), y = num(r[c.yc], s.delim);
      if (!isFinite(x) || !isFinite(y)) { skipped++; return; }
      rows.push({ label: c.lc !== undefined ? (r[c.lc] || '') : '', x, y, group: c.gc !== undefined ? (r[c.gc] || '(blank)') : '' });
    });
    rows.forEach((r, i) => { if (!r.label) r.label = 'Point ' + (i + 1); });
    return {
      rows, skipped, hasLabel: c.lc !== undefined, hasGroup: c.gc !== undefined,
      xHead: head ? head[c.xc] || '' : '', yHead: head ? head[c.yc] || '' : '',
      lHead: head && c.lc !== undefined ? head[c.lc] || '' : '', gHead: head && c.gc !== undefined ? head[c.gc] || '' : ''
    };
  }

  // ---- statistics ----


  function stats(pts) {
    const n = pts.length;
    if (n < 3) return { n, ok: false };
    const mx = avg(pts.map(p => p.x)), my = avg(pts.map(p => p.y));
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach(p => { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    if (sxx === 0 || syy === 0) return { n, ok: false, flat: sxx === 0 ? 'x' : 'y' };
    const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
    const slope = sxy / sxx, icpt = my - slope * mx, df = n - 2;
    const se = df > 0 ? Math.sqrt(Math.max(0, syy - slope * sxy) / df) : NaN;
    let p = 1;
    if (df > 0) { if (Math.abs(r) >= 1) p = 0; else { const t = r * Math.sqrt(df / (1 - r * r)); p = ibeta(df / (df + t * t), df / 2, 0.5); } }
    const rx = rank(pts.map(q => q.x)), ry = rank(pts.map(q => q.y)), mrx = avg(rx), mry = avg(ry);
    let a = 0, b = 0, c = 0;
    rx.forEach((v, i) => { a += (v - mrx) * (ry[i] - mry); b += (v - mrx) ** 2; c += (ry[i] - mry) ** 2; });
    return { n, ok: true, r, r2: r * r, slope, icpt, se, p, rho: b && c ? a / Math.sqrt(b * c) : NaN,
      xmin: Math.min(...pts.map(q => q.x)), xmax: Math.max(...pts.map(q => q.x)) };
  }
  function strength(st) {
    if (!st.ok) return { none: true, word: 'no clear', dir: '' };
    const a = Math.abs(st.r), dir = st.r >= 0 ? 'positive' : 'negative';
    if (st.p >= 0.05 || a < 0.3) return { none: true, word: 'no clear', dir };
    return { none: false, word: a >= 0.7 ? 'strong' : 'weak', dir };
  }
  function compute(p) {
    const all = stats(p.rows);
    const groups = p.hasGroup ? [...new Set(p.rows.map(r => r.group))] : [];
    const gStats = groups.map(g => ({ name: g, st: stats(p.rows.filter(r => r.group === g)) }));
    const fit = p.rows.map(r => all.ok ? all.icpt + all.slope * r.x : null);
    const res = p.rows.map((r, i) => fit[i] === null ? null : r.y - fit[i]);
    const odd = p.rows.map((r, i) => all.ok && all.n >= 6 && all.se > 0 && Math.abs(res[i] / all.se) > 2.5);
    return { all, groups, gStats, fit, res, odd };
  }

  // ---- chart ----
  function niceTicks(min, max, count) {
    const raw = (max - min || 1) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), nrm = raw / mag;
    const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }
  function span(vals, extra, zero) {
    let lo = Math.min(...vals, ...extra), hi = Math.max(...vals, ...extra);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    if (zero && lo > 0) lo = 0;
    if (Math.min(...vals) >= 0 && lo < 0) lo = 0;
    return [lo, hi];
  }
  function renderSVG(p, m, o) {
    // IHI QI Essentials Toolkit: make the axes roughly the same length, so the plotting area is
    // close to square (a stretched plot flattens the pattern). On a wider chart it's centred.
    const W = drawW, plotH = 440, plotW = Math.min(W - 110, Math.round(plotH * 1.25));
    const ML = Math.round((W - plotW) / 2 + 25), MR = W - ML - plotW;
    const useG = o.byGroup && m.groups.length > 1;
    const legend = useG ? m.groups.map((g, i) => ({ c: GROUP[i % GROUP.length], t: trunc(g, 26), k: 'dot' })) : [{ c: COLORS.point, t: 'One pair of values', k: 'dot' }];
    if (o.showTrend && m.all.ok) legend.push({ c: useG ? COLORS.muted : COLORS.trend, t: useG ? 'Trend line (one per group)' : 'Trend line', k: 'line' });
    if (o.flagOdd && m.odd.some(Boolean)) legend.push({ c: COLORS.flag, t: 'Far from the trend', k: 'ring' });
    const MT = (o.title ? 58 : 18) + 30, MB = 66, H = MT + plotH + MB, base = MT + plotH;
    const xs = p.rows.map(r => r.x), ys = p.rows.map(r => r.y);
    const lines = !o.showTrend ? [] : useG ? m.gStats.map((g, i) => ({ st: g.st, c: GROUP[i % GROUP.length] })) : [{ st: m.all, c: COLORS.trend }];
    const fitY = [];
    lines.forEach(l => { if (l.st.ok) fitY.push(l.st.icpt + l.st.slope * l.st.xmin, l.st.icpt + l.st.slope * l.st.xmax); });
    let [x0, x1] = span(xs, [], o.zero), [y0, y1] = span(ys, fitY, o.zero);
    const xt = niceTicks(x0, x1, 8), yt = niceTicks(y0, y1, 6);
    x0 = xt[0]; x1 = xt[xt.length - 1]; y0 = yt[0]; y1 = yt[yt.length - 1];
    const X = v => ML + (v - x0) / (x1 - x0) * plotW;
    const Y = v => base - (v - y0) / (y1 - y0) * plotH;
    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${ML}" y="34" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(70, Math.floor((W - (ML) - 16) / 12.32))))}</text>`);
    // legend
    const ly = MT - 22; let lx = ML;
    legend.forEach(l => {
      if (l.k === 'dot') s.push(`<circle cx="${lx + 7}" cy="${ly - 3}" r="6" fill="${l.c}"/>`);
      else if (l.k === 'line') s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${l.c}" stroke-width="2.5"/>`);
      else s.push(`<circle cx="${lx + 7}" cy="${ly - 3}" r="7" fill="none" stroke="${l.c}" stroke-width="2"/>`);
      s.push(`<text x="${lx + 22}" y="${ly + 2}" font-size="13" fill="${COLORS.ink}">${esc(l.t)}</text>`);
      lx += 22 + l.t.length * 7.2 + 26;
    });
    // grid + ticks
    yt.forEach(v => {
      const y = Y(v);
      s.push(`<line x1="${ML}" y1="${y}" x2="${ML + plotW}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    xt.forEach(v => {
      const x = X(v);
      s.push(`<line x1="${x}" y1="${MT}" x2="${x}" y2="${base}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${x}" y="${base + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    // trend lines (observed X range only)
    lines.forEach(l => {
      if (!l.st.ok) return;
      s.push(`<line x1="${X(l.st.xmin)}" y1="${Y(l.st.icpt + l.st.slope * l.st.xmin)}" x2="${X(l.st.xmax)}" y2="${Y(l.st.icpt + l.st.slope * l.st.xmax)}" stroke="${l.c}" stroke-width="2.5" stroke-linecap="round"/>`);
    });
    // points
    p.rows.forEach((r, i) => {
      const c = useG ? GROUP[m.groups.indexOf(r.group) % GROUP.length] : COLORS.point;
      // Hover details (shown by focus-chart-full.js); the values table lists the same for screen readers
      const tip = [r.label, `${o.xLabel}: ${nf.format(r.x)}`, `${o.yLabel}: ${nf.format(r.y)}`]
        .concat(p.hasGroup ? [`Group: ${r.group}`] : [])
        .concat(m.all && m.all.ok ? [`Trend predicts ${nf.format(m.fit[i])}, so ${nf.format(Math.abs(m.res[i]))} ${m.res[i] >= 0 ? 'above' : 'below'} it`] : [])
        .concat(m.odd[i] ? ['Far from the trend'] : []).join('\n');
      s.push(`<g data-tip="${esc(tip)}"><circle cx="${X(r.x)}" cy="${Y(r.y)}" r="11" fill="transparent"/><circle class="pt" cx="${X(r.x)}" cy="${Y(r.y)}" r="5.5" fill="${c}" fill-opacity="0.85" stroke="#fff" stroke-width="1.5"/>`);
      if (o.flagOdd && m.odd[i]) s.push(`<circle cx="${X(r.x)}" cy="${Y(r.y)}" r="10" fill="none" stroke="${COLORS.flag}" stroke-width="2.2"/>`);
      s.push('</g>');
    });
    // axes
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<line x1="${ML}" y1="${base}" x2="${ML + plotW}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    // axis titles
    s.push(`<text transform="translate(${ML - 58} ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.yLabel, 60))}</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${H - 16}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.xLabel, 90))}</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function chanceText(p) { return p < 0.001 ? 'less than 1 in 1,000' : p < 0.01 ? 'less than 1 in 100' : 'less than 1 in 20'; }
  function readingHTML(p, m, xl, yl) {
    const st = m.all, k = strength(st), xn = xl.toLowerCase(), yn = yl.toLowerCase();
    let h = '<div class="reading"><h3>What the chart shows</h3>';
    if (k.none) {
      h += `<p>The points don't follow a clear pattern, so there is no evidence here that ${esc(yn)} changes with ${esc(xn)}.`;
      if (Math.abs(st.r) >= 0.3) h += ` There is a hint of a ${k.dir} pattern, but with ${st.n} pairs it could easily be chance. Collecting more data would tell you more.`;
      h += '</p>';
    } else {
      h += `<p>${esc(cap(yn))} tends to be ${st.r > 0 ? 'higher' : 'lower'} when ${esc(xn)} is higher. On average, each extra 1 of ${esc(xn)} goes with ${st.slope >= 0 ? 'an increase' : 'a decrease'} of about ${nf.format(Math.abs(st.slope))} in ${esc(yn)}.</p>`;
      h += `<p>About ${Math.round(st.r2 * 100)}% of the variation in ${esc(yn)} moves in step with ${esc(xn)}; the rest comes from other things. The chance of seeing a pattern this strong in ${st.n} pairs if there were really no relationship is ${chanceText(st.p)}.</p>`;
    }
    h += '<div class="caution"><p><b>Before you act on it</b></p><ul>';
    h += '<li>A correlation can point to cause and effect, but it doesn\'t prove it. A third factor, such as day of the week or case mix, may be driving both measures. Test your theory with a PDSA cycle.</li>';
    h += `<li>The trend line only describes the values you collected (${esc(xn)} from ${nf.format(st.xmin)} to ${nf.format(st.xmax)}). Don't assume the pattern carries on beyond that range.</li>`;
    if (isFinite(st.rho) && Math.abs(st.rho - st.r) > 0.25) h += `<li>A rank-based check gives a different answer (${f2(st.rho)}), so a few extreme points may be shaping the result. Look at them before relying on it.</li>`;
    h += '</ul></div>';
    const nOdd = m.odd.filter(Boolean).length;
    if (nOdd) h += `<p class="flagnote">${nOdd} point${nOdd > 1 ? 's sit' : ' sits'} a long way from the trend. Check for data errors or unusual circumstances on ${nOdd > 1 ? 'those days' : 'that day'}: ${esc(p.rows.filter((r, i) => m.odd[i]).map(r => r.label).join(', '))}.</p>`;
    if (m.groups.length > 1) {
      h += `<h3 style="margin-top:1rem">By group</h3><div class="tablewrap" style="margin-top:.4rem"><table><thead><tr><th>Group</th><th class="num">Pairs</th><th class="num">r</th><th class="num">Slope</th><th>Reading</th></tr></thead><tbody>`;
      m.gStats.forEach((g, i) => {
        const kk = strength(g.st);
        const read = !g.st.ok ? 'Too few pairs' : kk.none ? 'No clear relationship' : `${cap(kk.word)} ${kk.dir}`;
        h += `<tr><td><span class="sw" style="background:${GROUP[i % GROUP.length]}" aria-hidden="true"></span>${esc(g.name)}</td><td class="num">${g.st.n}</td><td class="num">${g.st.ok ? f2(g.st.r) : '–'}</td><td class="num">${g.st.ok ? nf.format(g.st.slope) : '–'}</td><td>${read}</td></tr>`;
      });
      h += '</tbody></table></div>';
      const ok = m.gStats.filter(g => g.st.ok);
      if (ok.length > 1 && ok.some(g => Math.sign(g.st.r) !== Math.sign(st.r) || Math.abs(g.st.r - st.r) > 0.3))
        h += '<p style="margin-top:.75rem">The groups behave differently from the data as a whole. Read each group on its own: combining periods with different behaviour can hide a relationship or invent one.</p>';
    }
    if (st.n < 10) h += '<p class="hint">With fewer than 10 pairs, treat any pattern as provisional. Aim for 20 or more.</p>';
    return h + '</div>';
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    if (!headerTouched) els.hasHeader.checked = headerGuess(text);
    const p = parse(text, els.hasHeader.checked);
    if (!p) { els.detected.textContent = ''; current = null; setGroupOption(false); return renderEmpty('Paste data on the left to build your chart.'); }
    if (p.tooFew) { els.detected.textContent = 'Couldn’t find two columns of numbers.'; current = null; setGroupOption(false); return renderEmpty('Paste an X column and a Y column of numbers to build your chart.'); }

    let note = `Reading ${p.rows.length} pair${p.rows.length === 1 ? '' : 's'}`;
    const extras = [];
    if (p.hasLabel) extras.push('labels');
    if (p.hasGroup) extras.push(`${new Set(p.rows.map(r => r.group)).size} groups`);
    note += extras.length ? ` with ${extras.join(' and ')}.` : '.';
    if (p.skipped) note += ` ${p.skipped} row${p.skipped > 1 ? 's' : ''} skipped (X or Y wasn’t a number).`;
    els.detected.textContent = note;
    setGroupOption(p.hasGroup);
    els.xLabel.placeholder = p.xHead || 'The factor';
    els.yLabel.placeholder = p.yHead || 'The result';

    if (p.rows.length < 3) { current = null; return renderEmpty('Add at least three pairs to look for a relationship.'); }
    const m = compute(p);
    if (!m.all.ok) { current = null; return renderEmpty(`Every ${m.all.flat === 'x' ? 'X' : 'Y'} value is the same, so there’s nothing to compare. Both measures need to vary.`); }

    const title = els.title.value.trim();
    const xLabel = els.xLabel.value.trim() || p.xHead || 'X';
    const yLabel = els.yLabel.value.trim() || p.yHead || 'Y';
    const st = m.all, k = strength(st);
    const headline = k.none ? `<strong>No clear relationship</strong> between the two measures` : `<strong>${cap(k.word)} ${k.dir}</strong> correlation`;
    const plain = k.none ? 'No clear relationship' : `${cap(k.word)} ${k.dir} correlation`;
    const sub = `r = ${f2(st.r)} across ${st.n} pairs${k.none ? (st.p >= 0.05 ? ', which could easily be chance' : '') : `. ${cap(yLabel.toLowerCase())} tends to ${st.r > 0 ? 'rise' : 'fall'} as ${xLabel.toLowerCase()} rises`}.`;

    trackChart({ points: p.rows.length });
    const svg = drawShown(() => renderSVG(p, m, {
      title, xLabel, yLabel, showTrend: els.showTrend.checked, byGroup: els.byGroup.checked && p.hasGroup,
      flagOdd: els.flagOdd.checked, zero: els.zero.checked,
      aria: (title ? title + '. ' : '') + `Scatter plot of ${yLabel} against ${xLabel}. ${plain}, r = ${f2(st.r)}, ${st.n} pairs.`
    }));
    current = { p, m, title, xLabel, yLabel };

    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="chartwrap fit" id="chart">${svg}</div>
      ${readingHTML(p, m, xLabel, yLabel)}
      <details class="values"><summary>Show the data and trend values</summary>
      <div class="tablewrap">
        <table>
          <thead><tr><th class="num">#</th><th>${esc(p.lHead || 'Label')}</th><th class="num">${esc(trunc(xLabel, 28))}</th><th class="num">${esc(trunc(yLabel, 28))}</th>${p.hasGroup ? `<th>${esc(p.gHead || 'Group')}</th>` : ''}<th class="num">Trend value</th><th class="num">Difference</th></tr></thead>
          <tbody>${p.rows.map((r, i) => `<tr${m.odd[i] ? ' class="odd"' : ''}>
            <td class="num">${i + 1}</td><td>${esc(r.label)}${m.odd[i] ? '<span class="sr"> (far from the trend)</span>' : ''}</td>
            <td class="num">${nf.format(r.x)}</td><td class="num">${nf.format(r.y)}</td>${p.hasGroup ? `<td>${esc(r.group)}</td>` : ''}
            <td class="num">${nf.format(m.fit[i])}</td><td class="num">${nf.format(m.res[i])}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th></th><th colspan="${p.hasGroup ? 6 : 5}">r = ${f2(st.r)} · R² = ${Math.round(st.r2 * 100)}% · trend: ${esc(yLabel)} = ${nf.format(st.icpt)} ${st.slope < 0 ? '−' : '+'} ${nf.format(Math.abs(st.slope))} × ${esc(xLabel)}</th></tr></tfoot>
        </table>
      </div></details>`;
  }
  function setGroupOption(on) {
    els.byGroup.disabled = !on;
    $('byGroupWrap').classList.toggle('off', !on);
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
    const { p, m, xLabel, yLabel } = current;
    const head = ['#', p.lHead || 'Label', xLabel, yLabel].concat(p.hasGroup ? [p.gHead || 'Group'] : [], ['Trend value', 'Difference from trend', 'Far from trend']);
    const r4 = v => Math.round(v * 10000) / 10000;
    const body = p.rows.map((r, i) => [i + 1, r.label, r.x, r.y].concat(p.hasGroup ? [r.group] : [], [r4(m.fit[i]), r4(m.res[i]), m.odd[i] ? 'Yes' : 'No']));
    const st = m.all;
    return [head].concat(body, [[], ['r', r4(st.r)], ['R squared', r4(st.r2)], ['Slope', r4(st.slope)], ['Intercept', r4(st.icpt)], ['p-value', r4(st.p)], ['Pairs', st.n]]);
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
  }
  function loadExample() {
    els.data.value = exampleText();
    els.title.value = 'Ward occupancy and medication round time (example)';
    els.xLabel.value = ''; els.yLabel.value = '';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  ['title', 'xLabel', 'yLabel'].forEach(id => els[id].addEventListener('input', schedule));
  ['showTrend', 'byGroup', 'flagOdd', 'zero'].forEach(id => els[id].addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ showTrend: 'showTrend', colourByGroup: 'byGroup', highlightOdd: 'flagOdd', zeroAxes: 'zero' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.xLabel.value = ''; els.yLabel.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });


  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'scatter_plot', toolName: 'scatter plot',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable'].map(type => ({ type, run: () => act(type) })))
  });
})();

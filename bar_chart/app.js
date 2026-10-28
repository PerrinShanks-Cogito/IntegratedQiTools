---
# Liquid fills in the site links below
---
/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    xLabel: $('xLabel'), yLabel: $('yLabel'), showLabels: $('showLabels'), showAvg: $('showAvg'), result: $('result')
  };
  const radio = n => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
  const COLORS = { bar: '#005EB8', avg: '#AE2573', ink: '#212B32', muted: '#4C6272', grid: '#E3E8EB' };
  const SERIES = ['#005EB8', '#AE2573', '#007F3B', '#ED8B00', '#330072', '#00A499', '#768692', '#DA291C'];
  const DARK_TEXT = new Set(['#ED8B00', '#00A499', '#768692']);
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const pct = v => (Math.round(v * 10) / 10).toFixed(1);

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

  const EXAMPLE = [
    'Ward\t2023/24\t2024/25',
    'Acute Medical Unit\t38\t29',
    'Care of the Elderly\t52\t41',
    'Cardiology\t17\t19',
    'General Surgery\t21\t15',
    'Orthopaedics\t26\t18',
    'Respiratory\t30\t22',
    'Stroke Unit\t44\t31'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bar-chart';
  const joinNames = a => a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  // ---- parsing ----
  function split(text) {
    // with no delimiter, a line is a label then a number ("Ward A 12")
    const s = splitTable(text, { space: 'label', trimTrailing: true });
    return s && { recs: s.recs, comma: s.delim === ',' };
  }

  // Shared readers for pasted data, from /assets/js/focus-stats.js
  const { readNumber, splitTable } = FocusStats;
  const num = raw => readNumber(raw);
  function headerGuess(text) {
    const s = split(text); if (!s || s.recs.length < 2) return false;
    const h = s.recs[0];
    return h.length > 1 && h.slice(1).some(v => v !== '' && !isFinite(num(v, s.comma)));
  }
  function parse(text, hasHeader) {
    const s = split(text);
    if (!s) return null;
    const head = hasHeader ? s.recs[0] : null;
    const data = hasHeader ? s.recs.slice(1) : s.recs;
    const ncol = Math.max(1, ...data.map(r => r.length)) - 1;
    if (ncol < 1) return { noValues: true };
    const series = [];
    for (let c = 1; c <= ncol; c++) series.push((head && head[c]) || (ncol === 1 ? 'Value' : 'Series ' + c));
    const cats = []; let skipped = 0;
    data.forEach(r => {
      const vals = series.map((_, i) => num(r[i + 1], s.comma));
      if (!vals.some(isFinite)) { skipped++; return; }
      cats.push({ name: r[0] || '(blank)', vals: vals.map(v => isFinite(v) ? v : 0), blanks: vals.filter(v => !isFinite(v)).length });
    });
    // drop value columns that are empty throughout
    const keep = series.map((_, i) => cats.some(c => c.vals[i] !== 0) || cats.length === 0);
    const sKept = series.filter((_, i) => keep[i]);
    cats.forEach(c => { c.vals = c.vals.filter((_, i) => keep[i]); c.total = c.vals.reduce((a, b) => a + b, 0); });
    return {
      cats, series: sKept.length ? sKept : series.slice(0, 1), skipped,
      catHead: head ? head[0] || '' : '', valHead: head && sKept.length === 1 ? head[series.indexOf(sKept[0]) + 1] || '' : '',
      blanks: cats.reduce((a, c) => a + c.blanks, 0)
    };
  }
  const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
  function looksLikeTime(cats) {
    if (cats.length < 5) return false;
    const hits = cats.filter(c => MONTHS.test(c.name) || /^(q[1-4]|week|wk|w\/c|day)\b/i.test(c.name) || /^\d{1,4}[\/.-]\d{1,2}([\/.-]\d{1,4})?$/.test(c.name) || /^(19|20)\d{2}$/.test(c.name)).length;
    return hits / cats.length >= 0.7;
  }

  // ---- chart ----
  function niceStep(x) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * Math.pow(10, e);
  }
  function scale(min, max) {
    if (max === min) max = min + 1;
    const step = niceStep((max - min) / 5);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return { lo, hi, ticks };
  }
  function renderSVG(d, o) {
    const { cats, series } = d, n = cats.length, k = series.length;
    const multi = k > 1, layout = multi ? o.layout : 'group';
    const stacked = layout !== 'group';
    const W = drawW, horiz = o.orient === 'h';
    const labels = cats.map(c => trunc(c.name, horiz ? 34 : 28));
    const maxLen = Math.max(...labels.map(l => l.length)), charW = 7;
    const legend = multi ? series.map((s, i) => ({ c: SERIES[i % SERIES.length], t: trunc(s, 24) })) : [];
    if (o.showAvg && layout !== 'pct') legend.push({ c: COLORS.avg, t: 'Average' + (multi && !stacked ? ' (all bars)' : ''), line: true });
    const MT = (o.title ? 58 : 18) + (legend.length ? 30 : 6);

    // values per bar segment
    const val = (c, i) => layout === 'pct' ? (c.total ? c.vals[i] / c.total * 100 : 0) : c.vals[i];
    let vmin = 0, vmax = 0;
    cats.forEach(c => {
      if (stacked) { vmax = Math.max(vmax, layout === 'pct' ? 100 : c.vals.reduce((a, b) => a + Math.max(0, b), 0)); vmin = Math.min(vmin, c.vals.reduce((a, b) => a + Math.min(0, b), 0)); }
      else c.vals.forEach(v => { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
    });
    const avgVal = stacked ? d.cats.reduce((a, c) => a + c.total, 0) / n : d.cats.reduce((a, c) => a + c.vals.reduce((x, y) => x + y, 0), 0) / (n * k);
    if (o.showAvg && layout !== 'pct') vmax = Math.max(vmax, avgVal);
    const sc = layout === 'pct' ? { lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] } : scale(vmin, vmax * (o.showLabels ? 1.06 : 1));
    const fmtV = v => layout === 'pct' ? Math.round(v) + '%' : nf.format(v);

    let ML, MR = 30, MB, H, plotW, plotH;
    if (horiz) {
      ML = Math.min(300, Math.max(80, maxLen * charW + 24));
      const band = Math.max(multi && !stacked ? 18 * k + 12 : 34, 26);
      plotH = band * n; plotW = W - ML - MR - (o.showLabels ? 40 : 0);
      MB = 60; H = MT + plotH + MB;
    } else {
      ML = 76; plotW = W - ML - MR;
      const band = plotW / n, rotate = maxLen * charW > band - 6;
      MB = (rotate ? maxLen * charW * Math.sin(40 * Math.PI / 180) + 22 : 28) + 40;
      plotH = 360; H = Math.round(MT + plotH + MB);
    }
    const band = (horiz ? plotH : plotW) / n;
    // value -> pixel along the value axis
    const V = v => horiz ? ML + (v - sc.lo) / (sc.hi - sc.lo) * plotW : MT + plotH - (v - sc.lo) / (sc.hi - sc.lo) * plotH;
    const zero = V(0);
    const halo = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${horiz ? 24 : ML}" y="34" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(70, Math.floor((W - (horiz ? 24 : ML) - 16) / 12.32))))}</text>`);
    // legend
    let lx = horiz ? 24 : ML; const ly = MT - 22;
    legend.forEach(l => {
      if (l.line) s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${l.c}" stroke-width="2" stroke-dasharray="6 4"/>`);
      else s.push(`<rect x="${lx}" y="${ly - 10}" width="14" height="14" fill="${l.c}"/>`);
      s.push(`<text x="${lx + 22}" y="${ly + 2}" font-size="13" fill="${COLORS.ink}">${esc(l.t)}</text>`);
      lx += 22 + l.t.length * 7.2 + 26;
    });
    // grid + value ticks
    sc.ticks.forEach(v => {
      const p = V(v);
      if (horiz) {
        s.push(`<line x1="${p}" y1="${MT}" x2="${p}" y2="${MT + plotH}" stroke="${COLORS.grid}" stroke-width="1"/>`);
        s.push(`<text x="${p}" y="${MT + plotH + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${fmtV(v)}</text>`);
      } else {
        s.push(`<line x1="${ML}" y1="${p}" x2="${ML + plotW}" y2="${p}" stroke="${COLORS.grid}" stroke-width="1"/>`);
        s.push(`<text x="${ML - 8}" y="${p + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${fmtV(v)}</text>`);
      }
    });
    // bars
    const rect = (a, b, c0, c1, fill, tip) => {
      // a..b along value axis (pixels), c0..c1 across
      const v0 = Math.min(a, b), len = Math.abs(b - a);
      return horiz
        ? `<rect x="${v0}" y="${c0}" width="${len}" height="${c1 - c0}" fill="${fill}"><title>${esc(tip)}</title></rect>`
        : `<rect x="${c0}" y="${v0}" width="${c1 - c0}" height="${len}" fill="${fill}"><title>${esc(tip)}</title></rect>`;
    };
    const label = (pAlong, pAcross, txt, inside, white) => {
      const fs = 12;
      if (horiz) return `<text x="${inside ? pAlong - 6 : pAlong + 6}" y="${pAcross + 4}" font-size="${fs}" font-weight="700" text-anchor="${inside ? 'end' : 'start'}" fill="${white ? '#ffffff' : COLORS.ink}" ${white ? '' : halo}>${txt}</text>`;
      return `<text x="${pAcross}" y="${inside ? pAlong + 16 : pAlong - 6}" font-size="${band < 34 ? 10 : fs}" font-weight="700" text-anchor="middle" fill="${white ? '#ffffff' : COLORS.ink}" ${white ? '' : halo}>${txt}</text>`;
    };
    cats.forEach((c, ci) => {
      const start = (horiz ? MT : ML) + ci * band;
      if (stacked) {
        const bw = band * 0.68, c0 = start + (band - bw) / 2, c1 = c0 + bw;
        let pos = 0, neg = 0;
        series.forEach((sName, si) => {
          const v = val(c, si); if (!v) return;
          const from = v >= 0 ? pos : neg, to = from + v;
          if (v >= 0) pos = to; else neg = to;
          const col = SERIES[si % SERIES.length];
          s.push(rect(V(from), V(to), c0, c1, col, `${c.name}, ${sName}: ${nf.format(c.vals[si])}${layout === 'pct' ? ' (' + pct(val(c, si)) + '%)' : ''}`));
          const seg = Math.abs(V(to) - V(from));
          if (o.showLabels && seg >= (horiz ? 34 : 18) && bw >= 22) {
            const mid = (V(from) + V(to)) / 2, txt = layout === 'pct' ? Math.round(val(c, si)) + '%' : nf.format(c.vals[si]);
            const fill = DARK_TEXT.has(col) ? COLORS.ink : '#ffffff';
            s.push(horiz ? `<text x="${mid}" y="${(c0 + c1) / 2 + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${fill}">${txt}</text>`
                         : `<text x="${(c0 + c1) / 2}" y="${mid + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${fill}">${txt}</text>`);
          }
        });
        if (o.showLabels && layout === 'stack') { const end = V(pos); s.push(label(end, (c0 + c1) / 2, nf.format(c.total), false, false)); }
      } else {
        const inner = band * (multi ? 0.8 : 0.72), bw = inner / k, off = start + (band - inner) / 2;
        series.forEach((sName, si) => {
          const v = c.vals[si], c0 = off + si * bw + (multi ? 1 : 0), c1 = off + (si + 1) * bw - (multi ? 1 : 0);
          const col = multi ? SERIES[si % SERIES.length] : (o.highlight === ci ? '#003087' : COLORS.bar);
          s.push(rect(zero, V(v), c0, c1, col, `${c.name}${multi ? ', ' + sName : ''}: ${nf.format(v)}`));
          if (o.showLabels && (c1 - c0) >= 16) {
            const end = V(v), len = Math.abs(end - zero), inside = len > (horiz ? 48 : 24) && !multi;
            const along = horiz ? (v >= 0 ? end : end) : end;
            if (horiz) s.push(`<text x="${inside ? end - 6 : (v >= 0 ? end + 6 : end - 6)}" y="${(c0 + c1) / 2 + 4}" font-size="${multi ? 11 : 12}" font-weight="700" text-anchor="${inside || v < 0 ? 'end' : 'start'}" fill="${inside ? '#ffffff' : COLORS.ink}" ${inside ? '' : halo}>${nf.format(v)}</text>`);
            else s.push(`<text x="${(c0 + c1) / 2}" y="${inside ? end + 16 : (v >= 0 ? end - 6 : end + 14)}" font-size="${(c1 - c0) < 30 ? 10 : 12}" font-weight="700" text-anchor="middle" fill="${inside ? '#ffffff' : COLORS.ink}" ${inside ? '' : halo}>${nf.format(v)}</text>`);
          }
        });
      }
    });
    // average line
    if (o.showAvg && layout !== 'pct') {
      const p = V(avgVal);
      if (horiz) s.push(`<line x1="${p}" y1="${MT}" x2="${p}" y2="${MT + plotH}" stroke="${COLORS.avg}" stroke-width="2" stroke-dasharray="6 4"/><text x="${p + 4}" y="${MT - 6}" font-size="12" font-weight="700" fill="${COLORS.avg}" ${halo}>${nf.format(avgVal)}</text>`);
      else s.push(`<line x1="${ML}" y1="${p}" x2="${ML + plotW}" y2="${p}" stroke="${COLORS.avg}" stroke-width="2" stroke-dasharray="6 4"/><text x="${ML + plotW - 4}" y="${p - 6}" font-size="12" font-weight="700" text-anchor="end" fill="${COLORS.avg}" ${halo}>Average ${nf.format(avgVal)}</text>`);
    }
    // axes: zero baseline + category axis
    if (horiz) {
      s.push(`<line x1="${zero}" y1="${MT}" x2="${zero}" y2="${MT + plotH}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
      s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${ML + plotW}" y2="${MT + plotH}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
      labels.forEach((l, i) => s.push(`<text x="${ML - 8}" y="${MT + i * band + band / 2 + 4}" font-size="13" text-anchor="end" fill="${COLORS.ink}"><title>${esc(cats[i].name)}</title>${esc(l)}</text>`));
      s.push(`<text x="${ML + plotW / 2}" y="${H - 16}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.yLabel, 80))}</text>`);
    } else {
      s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
      s.push(`<line x1="${ML}" y1="${zero}" x2="${ML + plotW}" y2="${zero}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
      const rotate = maxLen * charW > band - 6, base = MT + plotH;
      labels.forEach((l, i) => {
        const x = ML + i * band + band / 2;
        if (rotate) s.push(`<text x="${x}" y="${base + 16}" font-size="13" text-anchor="end" fill="${COLORS.ink}" transform="rotate(-40 ${x} ${base + 16})"><title>${esc(cats[i].name)}</title>${esc(l)}</text>`);
        else s.push(`<text x="${x}" y="${base + 20}" font-size="13" text-anchor="middle" fill="${COLORS.ink}"><title>${esc(cats[i].name)}</title>${esc(l)}</text>`);
      });
      s.push(`<text transform="translate(20 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.yLabel, 50))}</text>`);
      s.push(`<text x="${ML + plotW / 2}" y="${H - 12}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.xLabel, 90))}</text>`);
    }
    s.push('</svg>');
    return s.join('');
  }

  // ---- summary ----
  function summarise(d, layout) {
    const { cats, series } = d, multi = series.length > 1;
    const grand = cats.reduce((a, c) => a + c.total, 0);
    const byTotal = [...cats].sort((a, b) => b.total - a.total);
    const top = byTotal[0], bottom = byTotal[byTotal.length - 1];
    const ties = byTotal.filter(c => c.total === top.total).map(c => c.name);
    let head, sub;
    const share = grand > 0 && cats.every(c => c.total >= 0) ? ` (${pct(top.total / grand * 100)}% of the total)` : '';
    if (!multi) {
      head = ties.length > 1 ? `<strong>${esc(joinNames(ties))}</strong> are joint highest at <strong>${nf.format(top.total)}</strong>` : `<strong>${esc(top.name)}</strong> is highest at <strong>${nf.format(top.total)}</strong>${share}`;
      sub = `Lowest: ${bottom.name} at ${nf.format(bottom.total)}. Total across ${cats.length} categories: ${nf.format(grand)}. Average: ${nf.format(grand / cats.length)}.`;
    } else {
      const sTot = series.map((s, i) => cats.reduce((a, c) => a + c.vals[i], 0));
      head = `<strong>${esc(top.name)}</strong> has the highest combined total at <strong>${nf.format(top.total)}</strong>`;
      sub = `Totals by column: ${series.map((s, i) => `${s} ${nf.format(sTot[i])}`).join(', ')}.`;
      if (series.length === 2 && cats.every(c => c.vals[0] !== undefined)) {
        const up = cats.filter(c => c.vals[1] > c.vals[0]).length, down = cats.filter(c => c.vals[1] < c.vals[0]).length;
        sub += ` ${series[1]} is higher than ${series[0]} in ${up} of ${cats.length} categories and lower in ${down}.`;
      }
    }
    return { head, sub, grand };
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    if (!headerTouched) els.hasHeader.checked = headerGuess(text);
    const d = parse(text, els.hasHeader.checked);
    if (!d) { els.detected.textContent = ''; current = null; setLayout(1); return renderEmpty('Paste data on the left to build your chart.'); }
    if (d.noValues || !d.cats.length) { els.detected.textContent = 'Couldn’t find any numbers after the first column.'; current = null; setLayout(1); return renderEmpty('Paste a column of categories and at least one column of values.'); }

    let note = `Reading ${d.cats.length} categor${d.cats.length === 1 ? 'y' : 'ies'}` + (d.series.length > 1 ? ` with ${d.series.length} value columns.` : '.');
    if (d.skipped) note += ` ${d.skipped} row${d.skipped > 1 ? 's' : ''} skipped (no number found).`;
    if (d.blanks) note += ` ${d.blanks} cell${d.blanks > 1 ? 's were' : ' was'} empty or not a number and ${d.blanks > 1 ? 'are' : 'is'} shown as zero.`;
    els.detected.textContent = note;
    const hasNeg = d.cats.some(c => c.vals.some(v => v < 0));
    setLayout(d.series.length, hasNeg);
    els.xLabel.placeholder = d.catHead || 'Category';
    els.yLabel.placeholder = d.valHead || 'Value';

    if (d.cats.length < 2) { current = null; return renderEmpty('Add at least two categories to build a bar chart.'); }

    const sort = radio('sort');
    if (sort !== 'none') d.cats.sort((a, b) => sort === 'desc' ? b.total - a.total : a.total - b.total);
    const layout = d.series.length > 1 ? radio('layout') : 'group';
    const title = els.title.value.trim();
    const xLabel = els.xLabel.value.trim() || d.catHead || 'Category';
    const yLabel = (els.yLabel.value.trim() || d.valHead || 'Value') + (layout === 'pct' ? ' (% of each bar)' : '');
    const sm = summarise(d, layout);
    const plain = sm.head.replace(/<[^>]+>/g, '');
    trackChart({ points: d.cats.length * d.series.length });
    const svg = drawShown(() => renderSVG(d, {
      title, xLabel, yLabel, orient: radio('orient'), layout,
      showLabels: els.showLabels.checked, showAvg: els.showAvg.checked,
      aria: (title ? title + '. ' : '') + `Bar chart of ${d.cats.length} categories. ${plain}.`
    }));
    current = { d, title, xLabel, yLabel: els.yLabel.value.trim() || d.valHead || 'Value', grand: sm.grand };

    const multi = d.series.length > 1;
    const timeWarn = looksLikeTime(d.cats) ? `<div class="notice" style="margin-top:1rem">Your categories look like time periods. A bar chart can't tell you whether a change over time is real or just normal variation, so try a <a href="{{ '/run_chart/' | relative_url }}">run chart</a> or <a href="{{ '/spc_tool/' | relative_url }}">SPC chart</a> instead.</div>` : '';
    const showShare = !multi && sm.grand > 0 && d.cats.every(c => c.total >= 0);

    els.result.innerHTML = `
      <p class="summary">${sm.head}.</p>
      <p class="focuson">${esc(sm.sub)}</p>
      <div class="chartwrap fit" id="chart">${svg}</div>
      ${timeWarn}
      <div class="tablewrap">
        <table>
          <thead><tr><th>${esc(xLabel)}</th>${d.series.map((s, i) => `<th class="num">${multi ? `<span class="sw" style="background:${SERIES[i % SERIES.length]};border-radius:0" aria-hidden="true"></span>` : ''}${esc(multi ? s : current.yLabel)}</th>`).join('')}${multi ? '<th class="num">Total</th>' : ''}${showShare ? '<th class="num">% of total</th>' : ''}</tr></thead>
          <tbody>${d.cats.map(c => `<tr><td>${esc(c.name)}</td>${c.vals.map(v => `<td class="num">${nf.format(v)}</td>`).join('')}${multi ? `<td class="num">${nf.format(c.total)}</td>` : ''}${showShare ? `<td class="num">${pct(c.total / sm.grand * 100)}%</td>` : ''}</tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th>${d.series.map((s, i) => `<th class="num">${nf.format(d.cats.reduce((a, c) => a + c.vals[i], 0))}</th>`).join('')}${multi ? `<th class="num">${nf.format(sm.grand)}</th>` : ''}${showShare ? '<th class="num">100.0%</th>' : ''}</tr></tfoot>
        </table>
      </div>`;
  }
  function setLayout(k, hasNeg) {
    const multi = k > 1;
    document.querySelectorAll('input[name=layout]').forEach(r => { r.disabled = !multi || (hasNeg && r.value !== 'group'); });
    if (hasNeg && radio('layout') !== 'group') document.querySelector('input[name=layout][value=group]').checked = true;
    $('layoutNote').textContent = !multi ? 'Paste two or more value columns to use these.' : hasNeg ? 'Stacked bars are turned off because some values are negative.' : 'Side by side compares groups; stacked shows how each total is made up.';
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
    const vb = svg.viewBox.baseVal, sc = 2;
    const str = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = vb.width * sc; c.height = vb.height * sc;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.onerror = () => status('Could not create the image.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }
  function tableRows() {
    const { d, xLabel, yLabel, grand } = current, multi = d.series.length > 1;
    const head = [xLabel].concat(multi ? d.series : [yLabel], multi ? ['Total'] : ['% of total']);
    const body = d.cats.map(c => [c.name].concat(c.vals, multi ? [c.total] : [grand ? pct(c.total / grand * 100) : '']));
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
    els.data.value = EXAMPLE;
    els.title.value = 'Inpatient falls by ward (example)';
    els.xLabel.value = ''; els.yLabel.value = 'Falls';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  ['title', 'xLabel', 'yLabel'].forEach(id => els[id].addEventListener('input', schedule));
  ['showLabels', 'showAvg'].forEach(id => els[id].addEventListener('change', update));
  document.querySelectorAll('input[name=orient],input[name=sort],input[name=layout]').forEach(r => r.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ orientation: 'orient', sort: 'sort', layout: 'layout', showLabels: 'showLabels', showAverage: 'showAvg' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.xLabel.value = ''; els.yLabel.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });


  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'bar_chart', toolName: 'bar chart',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable'].map(type => ({ type, run: () => act(type) })))
  });
})();

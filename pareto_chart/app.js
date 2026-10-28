/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    yLabel: $('yLabel'), cutoff: $('cutoff'), groupAfter: $('groupAfter'),
    aligned: $('aligned'), showLabels: $('showLabels'), result: $('result')
  };
  const COLORS = { vital: '#005EB8', rest: '#A9C6E8', line: '#AE2573', ink: '#212B32', muted: '#4C6272', grid: '#E3E8EB', cut: '#4C6272' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const pct = v => (Math.round(v * 10) / 10).toFixed(1);
  const ROW = /^(.*?)\s*[\t,;]\s*"?(-?\d[\d,]*(?:\.\d+)?)"?\s*$/;

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

  const EXAMPLE = [
    'Reason\tDelays',
    'Late patient arrival\t48',
    'Surgeon unavailable\t31',
    'Anaesthetic delay\t22',
    'Equipment missing\t15',
    'Consent incomplete\t11',
    'Bed unavailable\t9',
    'Porter delay\t6',
    'Pre-op checks incomplete\t5',
    'Theatre list changed\t3'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = s => s.trim().replace(/^"(.*)"$/, '$1').trim();
  // Shared reader for numbers, from /assets/js/focus-stats.js: commas count only in thousands groups
  const { readNumber } = FocusStats;
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pareto-chart';

  function analyse(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return null;
    const rest = lines.slice(1);
    const all = lines.filter(l => ROW.test(l)).length;
    const restM = rest.filter(l => ROW.test(l)).length;
    const counts = all > 0 && (all >= lines.length * 0.6 || (rest.length > 0 && restM >= rest.length * 0.6));
    const mode = counts ? 'counts' : 'tally';
    return { lines, mode, headerGuess: mode === 'counts' && !ROW.test(lines[0]) };
  }

  function parse(text, hasHeader) {
    const a = analyse(text);
    if (!a) return null;
    const { lines, mode } = a;
    let catLabel = 'Category', valLabel = '', data = lines;
    if (hasHeader) {
      data = lines.slice(1);
      if (mode === 'counts') {
        const parts = lines[0].split(/\t|,|;/).map(clean);
        catLabel = parts[0] || catLabel;
        valLabel = parts[1] || '';
      } else {
        catLabel = clean(lines[0].split('\t')[0]) || catLabel;
      }
    }
    const map = new Map();
    let skipped = 0;
    for (const line of data) {
      let name, val;
      if (mode === 'counts') {
        const m = line.match(ROW);
        if (!m) { skipped++; continue; }
        name = clean(m[1]);
        val = readNumber(m[2]);
        if (!(val > 0)) { skipped++; continue; }
      } else {
        name = clean(line.split('\t')[0]);
        val = 1;
      }
      if (!name) name = '(blank)';
      const key = name.toLowerCase().replace(/\s+/g, ' ');
      const e = map.get(key);
      if (e) e.value += val; else map.set(key, { name, value: val });
    }
    return { mode, catLabel, valLabel, skipped, items: [...map.values()] };
  }

  function compute(items, groupAfter, cutoff) {
    const isOther = d => /^other$/i.test(d.name);
    const byVal = (a, b) => b.value - a.value || a.name.localeCompare(b.name);
    let main = items.filter(d => !isOther(d)).map(d => ({ ...d })).sort(byVal);
    let others = items.filter(isOther).map(d => ({ ...d, other: true }));
    if (groupAfter > 0 && main.length > groupAfter + 1) {
      const rest = main.slice(groupAfter);
      main = main.slice(0, groupAfter);
      const restTotal = rest.reduce((t, d) => t + d.value, 0) + others.reduce((t, d) => t + d.value, 0);
      const n = rest.length + others.length;
      others = [{ name: 'Other (' + n + ' categories)', value: restTotal, other: true }];
    }
    const rows = main.concat(others);
    const total = rows.reduce((t, d) => t + d.value, 0);
    let cum = 0;
    rows.forEach(d => { cum += d.value; d.pct = d.value / total * 100; d.cum = cum / total * 100; });
    let vital = rows.findIndex(d => d.cum >= cutoff - 1e-9) + 1;
    if (vital <= 0) vital = rows.length;
    rows.forEach((d, i) => { d.vital = i < vital; });
    return { rows, total, vital };
  }

  function niceStep(x) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    const nfac = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nfac * Math.pow(10, e);
  }

  function renderSVG(res, o) {
    const { rows, total } = res;
    const n = rows.length;
    const W = o.width || 960, ML = 76, MR = 76;
    const plotW = W - ML - MR, band = plotW / n, plotH = 340;
    const labels = rows.map(d => trunc(d.name, 28));
    const maxLen = Math.max(...labels.map(l => l.length));
    const charW = 7;
    const rotate = maxLen * charW > band - 6;
    const labelH = rotate ? maxLen * charW * Math.sin(40 * Math.PI / 180) + 22 : 28;
    // room above the plot for the legend and the vital few / useful many brackets
    const MT = (o.title ? 58 : 18) + 30 + 30;
    const MB = labelH + 40;
    const H = Math.round(MT + plotH + MB);
    const base = MT + plotH;

    let leftMax, leftTicks = [];
    if (o.aligned) {
      leftMax = total;
      for (let k = 0; k <= 5; k++) leftTicks.push(total * k / 5);
    } else {
      const maxV = rows[0] ? Math.max(...rows.map(d => d.value)) : 1;
      const step = niceStep(maxV / 5);
      leftMax = Math.ceil(maxV / step) * step;
      for (let v = 0; v <= leftMax + 1e-9; v += step) leftTicks.push(v);
    }
    const yL = v => base - v / leftMax * plotH;
    const yR = p => base - p / 100 * plotH;
    const tick = v => o.aligned && total >= 50 ? nf.format(Math.round(v)) : nf.format(Math.round(v * 10) / 10);
    const halo = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';

    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${ML}" y="34" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(o.width ? trunc(o.title, Math.floor((W - ML - 16) / 12.4)) : o.title)}</text>`);

    // legend
    const ly = MT - 52;
    let lx = ML;
    const legend = [['rect', COLORS.vital, 'Vital few'], ['rect', COLORS.rest, 'Useful many'], ['line', COLORS.line, 'Cumulative %'], ['dash', COLORS.cut, o.cutoff + '% cut-off']];
    legend.forEach(([t, c, txt]) => {
      if (t === 'rect') s.push(`<rect x="${lx}" y="${ly - 10}" width="14" height="14" fill="${c}"/>`);
      else if (t === 'line') s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${c}" stroke-width="2.5"/><circle cx="${lx + 7}" cy="${ly - 3}" r="3.5" fill="${c}"/>`);
      else s.push(`<line x1="${lx - 2}" y1="${ly - 3}" x2="${lx + 16}" y2="${ly - 3}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
      s.push(`<text x="${lx + 22}" y="${ly + 2}" font-size="13" fill="${COLORS.ink}">${esc(txt)}</text>`);
      lx += 22 + txt.length * 7.2 + 26;
    });

    // grid + left ticks
    leftTicks.forEach(v => {
      const y = yL(v);
      s.push(`<line x1="${ML}" y1="${y}" x2="${ML + plotW}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>`);
      s.push(`<text x="${ML - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${tick(v)}</text>`);
    });
    // right ticks
    for (let p = 0; p <= 100; p += 20) {
      s.push(`<text x="${ML + plotW + 8}" y="${yR(p) + 4}" font-size="12" fill="${COLORS.muted}">${p}%</text>`);
    }

    // bars
    rows.forEach((d, i) => {
      const bw = band * 0.76, x = ML + i * band + (band - bw) / 2, y = yL(d.value), h = base - y;
      const fill = d.vital ? COLORS.vital : COLORS.rest;
      s.push(`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${fill}"><title>${esc(d.name)}: ${nf.format(d.value)} (${pct(d.pct)}%)</title></rect>`);
      if (o.showLabels && band >= 20) {
        const fs = band < 34 ? 10 : 12;
        if (h > 22) s.push(`<text x="${x + bw / 2}" y="${y + 16}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${d.vital ? '#ffffff' : COLORS.ink}">${nf.format(d.value)}</text>`);
        else s.push(`<text x="${x + bw / 2}" y="${y - 5}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${COLORS.ink}" ${halo}>${nf.format(d.value)}</text>`);
      }
    });

    // cut-off line
    const cy = yR(o.cutoff);
    s.push(`<line x1="${ML}" y1="${cy}" x2="${ML + plotW}" y2="${cy}" stroke="${COLORS.cut}" stroke-width="1.5" stroke-dasharray="6 5"/>`);

    // cumulative line (IHI QI Essentials Toolkit): from 0 in the bottom left corner, with
    // each point at the right-hand edge of its bar, so it ends at 100% in the top right
    const pts = rows.map((d, i) => [ML + (i + 1) * band, yR(d.cum)]);
    s.push(`<polyline points="${[[ML, base]].concat(pts).map(p => p.join(',')).join(' ')}" fill="none" stroke="${COLORS.line}" stroke-width="2.5" stroke-linejoin="round"/>`);
    pts.forEach(([x, y], i) => {
      s.push(`<circle cx="${x}" cy="${y}" r="4" fill="${COLORS.line}" stroke="#fff" stroke-width="1.5"><title>Cumulative to ${esc(rows[i].name)}: ${pct(rows[i].cum)}%</title></circle>`);
      // the last point is always 100%, which the right-hand axis already shows
      // near the top, label to the left of the point (above the line) to stay clear of the brackets
      const high = y - 10 < MT + 10;
      if (o.showLabels && band >= 30 && i < n - 1) s.push(`<text x="${high ? x - 8 : x}" y="${high ? y + 4 : y - 10}" font-size="11" text-anchor="${high ? 'end' : 'middle'}" fill="${COLORS.line}" font-weight="700" ${halo}>${pct(rows[i].cum)}%</text>`);
    });

    // IHI: annotate the vital few, with the share of the total they account for, and the
    // useful many. Brackets sit above the plot, clear of the bars and the line.
    const bracket = (from, to, text, c, bold) => {
      const x1 = ML + from * band + band * 0.12, x2 = ML + to * band - band * 0.12, y = MT - 10;
      const tw = text.length * (bold ? 7.4 : 7), mid = Math.min(Math.max((x1 + x2) / 2, ML + tw / 2), ML + plotW - tw / 2);
      s.push(`<path d="M${x1} ${y + 7}V${y}H${x2}V${y + 7}" fill="none" stroke="${c}" stroke-width="2"/>`);
      s.push(`<text x="${mid}" y="${y - 6}" font-size="13" font-weight="${bold ? 700 : 600}" text-anchor="middle" fill="${c}" ${halo}>${esc(text)}</text>`);
    };
    const k = res.vital;
    bracket(0, k, `Vital few: ${pct(rows[k - 1].cum)}%`, COLORS.vital, true);
    if (k < n) bracket(k, n, `Useful many: ${pct(100 - rows[k - 1].cum)}%`, COLORS.muted, false);

    // axes
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<line x1="${ML + plotW}" y1="${MT}" x2="${ML + plotW}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
    s.push(`<line x1="${ML}" y1="${base}" x2="${ML + plotW}" y2="${base}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);

    // category labels
    labels.forEach((l, i) => {
      const x = ML + i * band + band / 2;
      if (rotate) s.push(`<text x="${x}" y="${base + 16}" font-size="13" text-anchor="end" fill="${COLORS.ink}" transform="rotate(-40 ${x} ${base + 16})"><title>${esc(rows[i].name)}</title>${esc(l)}</text>`);
      else s.push(`<text x="${x}" y="${base + 20}" font-size="13" text-anchor="middle" fill="${COLORS.ink}"><title>${esc(rows[i].name)}</title>${esc(l)}</text>`);
    });

    // axis titles
    s.push(`<text transform="translate(20 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(o.yLabel)}</text>`);
    s.push(`<text transform="translate(${W - 16} ${MT + plotH / 2}) rotate(90)" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">Cumulative %</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${H - 12}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(o.xLabel)}</text>`);
    s.push('</svg>');
    return s.join('');
  }

  function joinNames(names) {
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function update() {
    const text = els.data.value;
    const a = analyse(text);
    if (a && !headerTouched) els.hasHeader.checked = a.headerGuess;
    const p = parse(text, els.hasHeader.checked);

    if (!p) { els.detected.textContent = ''; current = null; return renderEmpty('Paste data on the left to build your chart.'); }

    let note = p.mode === 'counts' ? 'Reading this as categories with counts.' : 'Reading this as a list of occurrences — each row counts as one.';
    if (p.skipped) note += ` ${p.skipped} row${p.skipped > 1 ? 's' : ''} skipped (no positive number found).`;
    els.detected.textContent = note;

    if (p.items.length < 2) { current = null; return renderEmpty('Add at least two different categories to build a Pareto chart.'); }

    let cutoff = parseFloat(els.cutoff.value);
    if (!(cutoff > 0 && cutoff < 100)) cutoff = 80;
    const groupAfter = Math.max(0, parseInt(els.groupAfter.value, 10) || 0);
    const res = compute(p.items, groupAfter, cutoff);
    const title = els.title.value.trim();
    const yLabel = els.yLabel.value.trim() || p.valLabel || (p.mode === 'tally' ? 'Occurrences' : 'Count');
    els.yLabel.placeholder = p.valLabel || (p.mode === 'tally' ? 'Occurrences' : 'Count');
    const n = res.rows.length, k = res.vital, reach = res.rows[k - 1].cum;
    const sentence = `${k} of ${n} categories account for ${pct(reach)}% of the total (${nf.format(res.total)}).`;

    trackChart({ points: n });
    const opts = {
      title, yLabel, xLabel: p.catLabel, cutoff,
      aligned: els.aligned.checked, showLabels: els.showLabels.checked,
      aria: (title ? title + '. ' : '') + 'Pareto chart. ' + sentence
    };
    shownW = chartWidth();
    const svg = renderSVG(res, { ...opts, width: shownW });

    const focusNames = res.rows.slice(0, k).filter(d => !d.other).map(d => d.name);
    current = { res, opts, title, yLabel, catLabel: p.catLabel };

    els.result.innerHTML = `
      <p class="summary"><strong>${k} of ${n}</strong> categories account for <strong>${pct(reach)}%</strong> of the total (${nf.format(res.total)}).</p>
      ${focusNames.length ? `<p class="focuson">Vital few: ${esc(joinNames(focusNames))}.</p>` : '<p class="focuson"></p>'}
      <div class="chartwrap fit" id="chart">${svg}</div>
      <div class="tablewrap">
        <table>
          <thead><tr><th class="num">Rank</th><th>${esc(p.catLabel)}</th><th class="num">${esc(yLabel)}</th><th class="num">% of total</th><th class="num">Cumulative %</th></tr></thead>
          <tbody>${res.rows.map((d, i) => `<tr${i === k - 1 && k < n ? ' class="cutrow"' : ''}>
            <td class="num">${i + 1}</td>
            <td><span class="sw" style="background:${d.vital ? COLORS.vital : COLORS.rest}" aria-hidden="true"></span>${esc(d.name)}${d.vital ? '<span class="sr"> (vital few)</span>' : ''}</td>
            <td class="num">${nf.format(d.value)}</td>
            <td class="num">${pct(d.pct)}%</td>
            <td class="num">${pct(d.cum)}%</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th></th><th>Total</th><th class="num">${nf.format(res.total)}</th><th class="num">100.0%</th><th></th></tr></tfoot>
        </table>
      </div>`;
  }

  function renderEmpty(msg) {
    els.result.innerHTML = `<div class="empty"><p>${esc(msg)}</p><button type="button" class="primary" data-act="example">Try the example</button></div>`;
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(update, 180); }

  // ---- exports ----
  function redrawChart() {
    shownW = chartWidth();
    $('chart').innerHTML = renderSVG(current.res, { ...current.opts, width: shownW });
  }
  // Exports use the standard 960-wide drawing, whatever the size on screen
  function svgEl() {
    if (!current) return null;
    const d = document.createElement('div');
    d.innerHTML = renderSVG(current.res, current.opts);
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
    const { res, yLabel, catLabel } = current;
    const head = ['Rank', catLabel, yLabel, '% of total', 'Cumulative %', 'Vital few'];
    const body = res.rows.map((d, i) => [i + 1, d.name, d.value, pct(d.pct), pct(d.cum), d.vital ? 'Yes' : 'No']);
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
    els.title.value = 'Reasons for theatre start delays';
    headerTouched = false;
    update();
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  ['title', 'yLabel', 'cutoff', 'groupAfter'].forEach(id => els[id].addEventListener('input', schedule));
  trackSettings({ alignAxes: 'aligned', showLabels: 'showLabels' });
  ['aligned', 'showLabels'].forEach(id => els[id].addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });


  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'pareto_chart', toolName: 'Pareto chart',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable'].map(type => ({ type, run: () => act(type) })))
  });
})();

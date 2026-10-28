/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    valLabel: $('valLabel'), minPct: $('minPct'), showValues: $('showValues'), showPct: $('showPct'), result: $('result')
  };
  const PALETTE = ['#005EB8', '#007F3B', '#AE2573', '#ED8B00', '#330072', '#00A499', '#8A1538', '#41B6E6', '#768692', '#78BE20'];
  const COLORS = { ink: '#212B32', muted: '#4C6272' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const pct = v => (Math.round(v * 10) / 10).toFixed(1);
  const MAX_LEVELS = 3;

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
    'Directorate\tWard\tIncident type\tIncidents',
    'Medicine\tWard C\tFalls\t21', 'Medicine\tWard C\tPressure ulcers\t9', 'Medicine\tWard C\tMedication errors\t7',
    'Medicine\tWard D\tFalls\t16', 'Medicine\tWard D\tMedication errors\t11', 'Medicine\tWard D\tPressure ulcers\t4',
    'Medicine\tWard E\tFalls\t12', 'Medicine\tWard E\tMedication errors\t5',
    'Surgery\tWard A\tFalls\t14', 'Surgery\tWard A\tPressure ulcers\t6', 'Surgery\tWard A\tMedication errors\t5',
    'Surgery\tWard B\tMedication errors\t8', 'Surgery\tWard B\tFalls\t7', 'Surgery\tWard B\tPressure ulcers\t3',
    'Women and children\tMaternity\tMedication errors\t6', 'Women and children\tMaternity\tFalls\t2',
    'Women and children\tChildren\'s ward\tMedication errors\t5', 'Women and children\tChildren\'s ward\tFalls\t1',
    'Critical care\tICU\tPressure ulcers\t8', 'Critical care\tICU\tMedication errors\t4'
  ].join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tree-plot';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  // ---- parsing ----
  function split(text) {
    return splitTable(text, { trimTrailing: true });
  }

  // Shared statistics, from /assets/js/focus-stats.js
  const { readNumber: num, splitTable } = FocusStats;

  // The last column holds the values when most of its cells are numbers; otherwise each row counts 1.
  function shape(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    const body = recs.length > 1 ? recs.slice(1) : recs;
    const cells = body.map(r => r[ncol - 1]).filter(v => v !== undefined && v !== '');
    const numeric = ncol > 1 && cells.length > 0 && cells.filter(v => isFinite(num(v, delim))).length / cells.length >= 0.6;
    return { ncol, numeric, headerGuess: numeric && !isFinite(num(recs[0][ncol - 1], delim)) };
  }

  function parse(text, hasHeader) {
    const s = split(text);
    if (!s) return null;
    const { recs, delim } = s;
    const sh = shape(recs, delim);
    const nLevelCols = sh.numeric ? sh.ncol - 1 : sh.ncol;
    const nLevels = Math.min(MAX_LEVELS, nLevelCols);
    const head = hasHeader ? recs[0] : null;
    const levelNames = [];
    for (let c = 0; c < nLevels; c++) levelNames.push((head && head[c]) || (nLevels === 1 ? 'Category' : 'Level ' + (c + 1)));
    const valName = sh.numeric ? ((head && head[sh.ncol - 1]) || '') : '';
    const root = { name: 'Total', key: '', kids: new Map(), value: 0, depth: 0 };
    let skipped = 0, used = 0;
    for (const r of hasHeader ? recs.slice(1) : recs) {
      let v = 1;
      if (sh.numeric) {
        v = num(r[sh.ncol - 1], delim);
        if (!(v > 0)) { skipped++; continue; }
      }
      let node = root;
      for (let c = 0; c < nLevels; c++) {
        const name = (r[c] || '').trim() || '(blank)';
        const key = name.toLowerCase().replace(/\s+/g, ' ');
        let k = node.kids.get(key);
        if (!k) { k = { name, kids: new Map(), value: 0, depth: c + 1, parent: node }; node.kids.set(key, k); }
        k.value += v;
        node = k;
      }
      root.value += v;
      used++;
    }
    return { root, levelNames, nLevels, extraCols: nLevelCols - nLevels, valName, numeric: sh.numeric, skipped, used };
  }

  // Turn the maps into sorted arrays, putting small items into "Other" within their group.
  function finish(node, total, minPct) {
    let kids = [...node.kids.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    if (minPct > 0) {
      const small = kids.filter(k => k.value / total * 100 < minPct);
      if (small.length > 1 && small.length < kids.length) {
        kids = kids.filter(k => !small.includes(k));
        const v = small.reduce((t, k) => t + k.value, 0);
        kids.push({ name: `Other (${small.length})`, other: true, kids: new Map(), value: v, depth: node.depth + 1, parent: node, merged: small.map(k => k.name) });
        kids.sort((a, b) => b.value - a.value);
      }
    }
    node.children = kids;
    kids.forEach(k => { k.parent = node; if (k.kids.size) finish(k, total, minPct); else k.children = []; });
    return node;
  }
  function leaves(node, out = []) {
    if (!node.children.length) out.push(node); else node.children.forEach(k => leaves(k, out));
    return out;
  }
  const pathOf = n => { const p = []; for (let x = n; x && x.depth > 0; x = x.parent) p.unshift(x.name); return p; };
  const topOf = n => { let x = n; while (x.depth > 1) x = x.parent; return x; };

  // ---- squarified layout (Bruls, Huizing and van Wijk) ----
  function worst(row, sum, side) {
    const max = Math.max(...row), min = Math.min(...row), s2 = side * side, sum2 = sum * sum;
    return Math.max(s2 * max / sum2, sum2 / (s2 * min));
  }
  function squarify(nodes, x, y, w, h) {
    const total = nodes.reduce((t, n) => t + n.value, 0);
    if (!nodes.length || w <= 0 || h <= 0 || total <= 0) { nodes.forEach(n => { n.rect = null; }); return; }
    const scale = w * h / total;
    let i = 0;
    while (i < nodes.length) {
      const side = Math.min(w, h);
      const row = [nodes[i].value * scale];
      let sum = row[0], j = i + 1;
      while (j < nodes.length) {
        const a = nodes[j].value * scale;
        if (worst(row.concat(a), sum + a, side) > worst(row, sum, side)) break;
        row.push(a); sum += a; j++;
      }
      if (w >= h) {
        const cw = j >= nodes.length ? w : sum / h;
        let yy = y;
        for (let k = i; k < j; k++) { const hh = k === j - 1 ? y + h - yy : row[k - i] / cw; nodes[k].rect = { x, y: yy, w: cw, h: hh }; yy += hh; }
        x += cw; w -= cw;
      } else {
        const rh = j >= nodes.length ? h : sum / w;
        let xx = x;
        for (let k = i; k < j; k++) { const ww = k === j - 1 ? x + w - xx : row[k - i] / rh; nodes[k].rect = { x: xx, y, w: ww, h: rh }; xx += ww; }
        y += rh; h -= rh;
      }
      i = j;
    }
  }
  const HEAD = 22, PAD = 3;
  function layout(node, r) {
    node.rect = r;
    if (!node.children.length || !r) return;
    let inner = r;
    if (node.depth > 0) {
      node.head = r.h >= HEAD + 18 && r.w >= 36;
      const top = node.head ? HEAD : PAD;
      inner = { x: r.x + PAD, y: r.y + top, w: r.w - 2 * PAD, h: r.h - top - PAD };
    }
    squarify(node.children, inner.x, inner.y, inner.w, inner.h);
    node.children.forEach(k => layout(k, k.rect));
  }

  // ---- colours ----
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (c, d, t) => { const a = hex(c), b = hex(d); return toHex(a.map((v, i) => v + (b[i] - v) * t)); };
  function lum(c) {
    const [r, g, b] = hex(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  // Pick whichever of white or ink text has the stronger contrast.
  const textOn = c => { const L = lum(c); return (1.05 / (L + 0.05)) >= ((L + 0.05) / (lum(COLORS.ink) + 0.05)) ? '#ffffff' : COLORS.ink; };
  function colour(root) {
    root.children.forEach((t, i) => {
      t.base = PALETTE[i % PALETTE.length];
      (function paint(n) {
        if (n.depth === 1) n.fill = t.children.length ? mix(t.base, '#000000', 0.22) : t.base;
        n.children.forEach((k, j) => {
          k.fill = k.children.length ? mix(t.base, '#000000', 0.1 * (k.depth - 1)) : mix(t.base, '#ffffff', Math.min(0.5, 0.12 * j) + (k.depth > 2 ? 0.08 : 0));
          paint(k);
        });
      })(t);
    });
  }

  // ---- drawing ----
  const charW = size => size * 0.56;
  function fitText(s, w, size) { const n = Math.floor((w - 10) / charW(size)); return n >= 3 ? trunc(s, n) : ''; }
  function valueText(v, total, o) {
    const parts = [];
    if (o.showValues) parts.push(nf.format(v));
    if (o.showPct) parts.push(o.showValues ? `(${pct(v / total * 100)}%)` : pct(v / total * 100) + '%');
    return parts.join(' ');
  }
  function renderSVG(res, o) {
    const W = drawW, plotH = 540, MT = o.title ? 48 : 12, M = 12, H = MT + plotH + M;
    const { root, total } = res;
    layout(root, { x: M, y: MT, w: W - 2 * M, h: plotH });
    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${M}" y="32" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (M) - 16) / 11.2))))}</text>`);
    const f = v => Math.round(v * 10) / 10;
    (function draw(n) {
      n.children.forEach(k => {
        const r = k.rect; if (!r || r.w < 0.5 || r.h < 0.5) return;
        const tip = `${pathOf(k).join(' › ')}: ${nf.format(k.value)} (${pct(k.value / total * 100)}% of total)`;
        const ink = textOn(k.fill);
        s.push(`<g><title>${esc(tip)}</title><rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" fill="${k.fill}" stroke="#ffffff" stroke-width="${k.children.length ? 2 : 1.5}"/>`);
        if (k.children.length) {
          if (k.head) {
            const vt = valueText(k.value, total, o);
            const nameT = fitText(k.name, r.w - (vt ? charW(12) * vt.length + 8 : 0), 13) || fitText(k.name, r.w, 13);
            if (nameT) s.push(`<text x="${f(r.x + 6)}" y="${f(r.y + 15.5)}" font-size="13" font-weight="700" fill="${ink}">${esc(nameT)}</text>`);
            if (vt && nameT && charW(13) * nameT.length + charW(12) * vt.length + 20 <= r.w) s.push(`<text x="${f(r.x + r.w - 6)}" y="${f(r.y + 15.5)}" font-size="12" text-anchor="end" fill="${ink}" fill-opacity="0.9">${esc(vt)}</text>`);
          }
          s.push('</g>');
          draw(k);
        } else {
          const nameT = r.h >= 20 ? fitText(k.name, r.w, 13) : '';
          if (nameT) {
            s.push(`<text x="${f(r.x + 6)}" y="${f(r.y + 17)}" font-size="13" font-weight="700" fill="${ink}">${esc(nameT)}</text>`);
            const vt = valueText(k.value, total, o);
            if (vt && r.h >= 38 && charW(12) * vt.length + 10 <= r.w) s.push(`<text x="${f(r.x + 6)}" y="${f(r.y + 33)}" font-size="12" fill="${ink}">${esc(vt)}</text>`);
          }
          s.push('</g>');
        }
      });
    })(root);
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function itemsFor80(ls, total) {
    const sorted = ls.slice().sort((a, b) => b.value - a.value);
    let cum = 0, k = 0;
    while (k < sorted.length && cum < total * 0.8 - 1e-9) cum += sorted[k++].value;
    return k;
  }
  function readingParts(res, valName) {
    const { root, total, levelNames } = res;
    const tops = root.children, ls = leaves(root), k80 = itemsFor80(ls, total);
    const what = valName ? lower(valName) : 'the total';
    const paras = [];
    const share = n => `${pct(n.value / total * 100)}%`;
    if (res.nLevels > 1) {
      const top3 = tops.slice(0, 3);
      const parts = top3.map((t, i) => `<b>${esc(t.name)}</b> ${i ? 'for ' : `accounts for `}${share(t)}${i ? '' : ` of ${esc(what)}`}`);
      if (tops.length === 4) parts.push(`<b>${esc(tops[3].name)}</b> for ${share(tops[3])}`);
      else if (tops.length > 4) parts.push(`the other ${tops.length - 3} together for ${pct(tops.slice(3).reduce((a, t) => a + t.value, 0) / total * 100)}%`);
      paras.push(`By ${esc(lower(levelNames[0]))}, ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]}.`);
      const big = tops[0];
      if (big.children.length > 1) {
        const in1 = big.children[0];
        paras.push(`Within ${esc(big.name)}, the largest part is <b>${esc(in1.name)}</b>, at ${pct(in1.value / big.value * 100)}% of ${esc(big.name)} and ${share(in1)} of the total.`);
      }
      // The same item name turning up under several groups, such as one incident type on every ward
      const byName = new Map();
      ls.forEach(l => {
        if (l.other) return;
        const key = l.name.toLowerCase();
        if (!byName.has(key)) byName.set(key, { name: l.name, v: 0, n: 0 });
        const e = byName.get(key); e.v += l.value; e.n++;
      });
      const rec = [...byName.values()].filter(e => e.n > 1).sort((a, b) => b.v - a.v)[0];
      if (rec && rec.v / total >= 0.2) paras.push(`Added up across groups, <b>${esc(rec.name)}</b> comes to ${pct(rec.v / total * 100)}% of the total, spread over ${rec.n} boxes. A theme that runs through several areas may be worth tackling together.`);
    } else {
      paras.push(`The largest item, <b>${esc(tops[0].name)}</b>, accounts for ${share(tops[0])} of ${esc(what)}.`);
    }
    if (ls.length > 2) paras.push(`${k80} of the ${ls.length} boxes make up 80% of the total. ${k80 <= ls.length * 0.3 ? 'A few areas carry most of it, so start there.' : 'It is spread fairly evenly, so there may not be one obvious place to start.'}`);
    return paras;
  }
  function summaryText() {
    const { res, title, valName } = current;
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [title || 'Tree plot', '', `Total: ${nf.format(res.total)}${valName ? ' ' + lower(valName) : ''}`, ''];
    readingParts(res, valName).forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- table ----
  function tableRows() {
    const { res, valName } = current, { root, total, levelNames, nLevels } = res;
    const head = levelNames.slice(0, nLevels).concat([valName || 'Value', '% of total']);
    if (nLevels > 1) head.push('% of group');
    const out = [head];
    leaves(root).forEach(l => {
      const p = pathOf(l);
      while (p.length < nLevels) p.push('');
      const row = p.concat([l.value, +pct(l.value / total * 100)]);
      if (nLevels > 1) row.push(+pct(l.value / l.parent.value * 100));
      out.push(row);
    });
    out.push(['Total'].concat(new Array(nLevels - 1).fill(''), [total, 100]).concat(nLevels > 1 ? [''] : []));
    return out;
  }
  function tableHTML() {
    const { res, valName } = current, { root, total, levelNames, nLevels } = res;
    let h = '<div class="tablewrap"><table><caption class="sr">Values in the tree plot</caption><thead><tr>';
    h += levelNames.slice(0, nLevels).map(n => `<th>${esc(n)}</th>`).join('');
    h += `<th class="num">${esc(valName || 'Value')}</th><th class="num">% of total</th>${nLevels > 1 ? '<th class="num">% of group</th>' : ''}</tr></thead><tbody>`;
    (function rows(n) {
      n.children.forEach(k => {
        if (k.children.length) {
          const p = pathOf(k);
          h += `<tr class="group"><td colspan="${nLevels}"><span class="sw" style="background:${k.fill}"></span>${esc(p.join(' › '))}</td><td class="num">${nf.format(k.value)}</td><td class="num">${pct(k.value / total * 100)}%</td>${nLevels > 1 ? `<td class="num">${k.depth > 1 ? pct(k.value / k.parent.value * 100) + '%' : ''}</td>` : ''}</tr>`;
          rows(k);
        } else {
          const p = pathOf(k);
          h += '<tr>' + p.map((x, i) => i === p.length - 1 ? `<td><span class="sw" style="background:${k.fill}"></span>${esc(x)}${k.merged ? `<span class="sr"> (${esc(k.merged.join(', '))})</span>` : ''}</td>` : `<td class="path">${esc(x)}</td>`).join('') +
            (p.length < nLevels ? `<td colspan="${nLevels - p.length}"></td>` : '') +
            `<td class="num">${nf.format(k.value)}</td><td class="num">${pct(k.value / total * 100)}%</td>${nLevels > 1 ? `<td class="num">${pct(k.value / k.parent.value * 100)}%</td>` : ''}</tr>`;
        }
      });
    })(root);
    h += `</tbody><tfoot><tr><th colspan="${nLevels}">Total</th><th class="num">${nf.format(total)}</th><th class="num">100%</th>${nLevels > 1 ? '<th></th>' : ''}</tr></tfoot></table></div>`;
    return h;
  }

  // ---- render ----
  function update() {
    const text = els.data.value;
    const s = split(text);
    if (!headerTouched) els.hasHeader.checked = !!(s && s.recs.length > 1 && shape(s.recs, s.delim).headerGuess);
    current = null;
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste data on the left to build your chart.'); }
    const p = parse(text, els.hasHeader.checked);
    if (!p || !p.used) { els.detected.textContent = 'Couldn’t find any rows with a value above zero.'; return renderEmpty('Paste one or more columns of group names, with a column of counts at the end if you have them.'); }
    let note = p.numeric
      ? `Reading ${p.used} row${p.used === 1 ? '' : 's'}: ${p.nLevels} level${p.nLevels === 1 ? '' : 's'} (${p.levelNames.join(' › ')}) and a column of values.`
      : `Reading ${p.used} row${p.used === 1 ? '' : 's'} with no numbers, so each row counts as 1: ${p.levelNames.join(' › ')}.`;
    if (p.extraCols > 0) note += ` Only the first ${MAX_LEVELS} name columns are used.`;
    if (p.skipped) note += ` ${p.skipped} row${p.skipped > 1 ? 's' : ''} skipped (the value was missing, zero or not a number).`;
    els.detected.textContent = note;

    const minPct = Math.max(0, Number(els.minPct.value) || 0);
    const root = finish(p.root, p.root.value, minPct);
    const total = root.value;
    colour(root);
    const res = { root, total, levelNames: p.levelNames, nLevels: p.nLevels };
    const title = els.title.value.trim();
    const valName = els.valLabel.value.trim() || p.valName;
    const ls = leaves(root), tops = root.children;
    const o = {
      title, showValues: els.showValues.checked, showPct: els.showPct.checked,
      aria: (title ? title + '. ' : '') + `Tree plot of ${nf.format(total)} ${valName ? lower(valName) : ''} in ${ls.length} boxes. Largest: ${tops.slice(0, 3).map(t => `${t.name} ${pct(t.value / total * 100)}%`).join(', ')}.`
    };
    const svg = drawShown(() => renderSVG(res, o));
    trackChart({ points: ls.length });
    current = { res, title, valName };

    const big = tops[0];
    const headline = `<strong>${esc(big.name)}</strong> makes up ${pct(big.value / total * 100)}% of the total`;
    const k80 = itemsFor80(ls, total);
    const sub = p.nLevels > 1
      ? `${tops.length} ${tops.length === 1 ? 'group' : 'groups'} and ${ls.length} boxes. ${k80} of the ${ls.length} boxes make up 80% of the total.`
      : `${ls.length} ${ls.length === 1 ? 'box' : 'boxes'}. ${k80} of them make up 80% of the total.`;
    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${nf.format(total)}</b><span>Total${valName ? ' ' + esc(lower(valName)) : ''}</span></div>
        ${p.nLevels > 1 ? `<div class="stat"><b>${tops.length}</b><span>${esc(p.levelNames[0])} groups</span></div>` : ''}
        <div class="stat"><b>${ls.length}</b><span>Boxes</span></div>
        <div class="stat"><b>${k80}</b><span>Boxes making up 80%</span></div>
      </div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <div class="reading"><h3>What the chart shows</h3>${readingParts(res, valName).map(x => `<p>${x}</p>`).join('')}</div>
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
    els.title.value = 'Patient safety incidents by directorate and ward (example)';
    els.valLabel.value = '';
    els.minPct.value = '0';
    headerTouched = false;
    update();
  }

  // ---- blank data collection sheet ----
  // One column per level, broadest first, then the values, as the parse step reads them.
  function dataSheet() {
    const val = els.valLabel.value.trim() || 'Count';
    const head = ['Group', 'Subgroup', 'Item', val].map(v => ({ v, s: 'head' }));
    const rows = [head];
    for (let i = 0; i < 40; i++) rows.push(Array(4).fill({ v: '', s: 'input' }));
    const notes = [
      'Collecting your data',
      '1. Rename the headings to suit your data, such as Directorate, Ward and Incident type. Keep the columns in order, from the broadest group to the item.',
      '2. Fill in one row for each item within its group and subgroup, writing each name the same way every time so rows from the same group are put together.',
      '3. Write the count or value for each row in the last column. If you leave it blank on every row, each row counts as one, so you can list one row per event instead.',
      '4. You can use fewer levels: delete the Subgroup column, or both Subgroup and Item, if you don’t need them. Add more rows if you need them.',
      '',
      'Building the tree plot',
      'Save this workbook, then in the Tree plot tool choose Data sheet, then Import filled data sheet, and pick this file. Or select the whole table on the Data sheet, including the headings, copy it and paste it into the tool. Check that “First row is column headings” is ticked.'
    ];
    return [
      { name: 'Data', cols: [28, 28, 32, 14], rows, freeze: 1 },
      { name: 'Instructions', cols: [100], rows: notes.map((v, i) => [{ v, s: i === 0 || v === 'Building the tree plot' ? 'title' : 'wrap' }]) }
    ];
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  [els.title, els.valLabel, els.minPct].forEach(el => el.addEventListener('input', schedule));
  [els.showValues, els.showPct].forEach(el => el.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  trackSettings({ showValues: 'showValues', showPercentages: 'showPct' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.valLabel.value = ''; els.minPct.value = '0'; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Data sheet, Example, Open, Save, Export) ----
  FocusActions.mount({
    tool: 'tree_plot', toolName: 'tree plot',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) }))),
    template: { fileName: 'tree-plot-data-sheet.xlsx', sheets: dataSheet, import: [{ sheet: 'Data', into: '#data' }] }
  });
})();

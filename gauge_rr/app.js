/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'), method: $('method'), k: $('k'),
    lsl: $('lsl'), usl: $('usl'), histSd: $('histSd'), title: $('title'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', limit: '#D5281B', centre: '#007F3B', mean: '#768692' };
  const SERIES = ['#005EB8', '#ED8B00', '#007F3B', '#AE2573', '#330072', '#00A499'];
  const BARS = ['#005EB8', '#41B6E6', '#ED8B00', '#AE2573'];
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 4 });
  const ALPHA_INTERACTION = 0.05;
  const CHARTS = {
    components: 'Components of variation', rchart: 'R chart by appraiser', xbar: 'X-bar chart by appraiser',
    bypart: 'Measurement by part', byapp: 'Measurement by appraiser', inter: 'Part by appraiser interaction', run: 'Gauge run chart'
  };

  let headerTouched = false;
  let chartType = 'components';
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

  // Example: three nurses each take two systolic blood pressure readings from 10
  // volunteers, in a random order (made-up data)
  const EXAMPLE = ['Volunteer\tNurse\tSystolic BP (mmHg)'].concat([
    '3\tNurse B\t132', '8\tNurse A\t121', '1\tNurse C\t112', '10\tNurse B\t158', '8\tNurse C\t120', '7\tNurse C\t135', '10\tNurse B\t153', '4\tNurse C\t134', '7\tNurse A\t140', '6\tNurse C\t98',
    '9\tNurse A\t128', '3\tNurse B\t126', '6\tNurse A\t105', '3\tNurse C\t122', '8\tNurse B\t122', '5\tNurse C\t158', '3\tNurse A\t124', '4\tNurse C\t134', '7\tNurse B\t144', '5\tNurse C\t160',
    '5\tNurse A\t163', '2\tNurse B\t147', '6\tNurse B\t110', '3\tNurse C\t126', '6\tNurse A\t101', '8\tNurse B\t126', '10\tNurse A\t156', '2\tNurse A\t147', '9\tNurse A\t124', '1\tNurse B\t115',
    '4\tNurse B\t134', '5\tNurse B\t160', '9\tNurse C\t132', '10\tNurse C\t151', '2\tNurse A\t147', '4\tNurse B\t135', '2\tNurse C\t150', '5\tNurse B\t161', '10\tNurse A\t151', '7\tNurse B\t135',
    '1\tNurse A\t113', '6\tNurse C\t103', '2\tNurse C\t149', '9\tNurse B\t135', '2\tNurse B\t148', '8\tNurse A\t122', '1\tNurse A\t112', '9\tNurse B\t137', '4\tNurse A\t139', '5\tNurse A\t161',
    '3\tNurse A\t127', '4\tNurse A\t137', '7\tNurse C\t137', '1\tNurse C\t111', '1\tNurse B\t114', '7\tNurse A\t141', '8\tNurse C\t117', '9\tNurse C\t128', '10\tNurse C\t149', '6\tNurse B\t107'
  ]).join('\n');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gauge-rr';
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const pc = x => isFinite(x) ? (Math.round(x * 1000) / 10).toFixed(1) + '%' : '–';
  const pf = p => p == null || !isFinite(p) ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3);

  const byName = (a, b) => String(a).localeCompare(String(b), 'en-GB', { numeric: true });
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) && !/[A-Z]{2}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  // ---- parsing ----
  // "long": part, appraiser, measurement. "table": appraiser, trial, then one column per part.
  function shape(recs, delim) {
    const ncol = Math.max(...recs.map(r => r.length));
    const body = recs.slice(1);
    const share = c => { const cells = body.map(r => r[c]).filter(v => v !== undefined && v !== ''); return cells.length ? cells.filter(v => isNum(v, delim)).length / cells.length : 0; };
    const kind = ncol >= 4 && share(ncol - 1) >= 0.6 && share(2) >= 0.6 && (share(1) >= 0.9) ? 'table' : 'long';
    const headerGuess = recs.length > 1 && (kind === 'long' ? !isNum(recs[0][ncol - 1], delim) : recs[0].slice(2).some(v => v !== '' && !isNum(v, delim)) || !isNum(recs[0][1], delim));
    return { kind, ncol, headerGuess };
  }
  function parse(text, hasHeader) {
    const sp = split(text);
    if (!sp) return null;
    const { recs, delim } = sp;
    const sh = shape(recs, delim);
    const head = hasHeader ? recs[0] : null;
    const body = hasHeader ? recs.slice(1) : recs;
    const obs = [];
    let skipped = 0;
    if (sh.kind === 'long') {
      body.forEach(r => {
        const y = num(r[sh.ncol - 1], delim);
        const part = (r[0] || '').trim(), app = (sh.ncol >= 3 ? r[1] || '' : '').trim() || 'Appraiser';
        if (!isFinite(y) || !part) { skipped++; return; }
        obs.push({ part, app, y });
      });
    } else {
      const parts = Array.from({ length: sh.ncol - 2 }, (_, c) => (head && head[c + 2]) || 'Part ' + (c + 1));
      body.forEach(r => {
        const app = (r[0] || '').trim() || 'Appraiser';
        parts.forEach((p, c) => {
          const raw = r[c + 2];
          if (raw === undefined || raw === '') return;
          const y = num(raw, delim);
          if (isFinite(y)) obs.push({ part: p, app, y }); else skipped++;
        });
      });
    }
    return {
      kind: sh.kind, obs, skipped,
      partName: sh.kind === 'long' ? (head && head[0]) || 'Part' : 'Part',
      appName: sh.kind === 'long' ? (head && sh.ncol >= 3 && head[1]) || 'Appraiser' : (head && head[0]) || 'Appraiser',
      yName: sh.kind === 'long' ? (head && head[sh.ncol - 1]) || 'Measurement' : 'Measurement'
    };
  }
  // Group into a balanced study: every appraiser measures every part r times.
  function arrange(obs) {
    const parts = [...new Set(obs.map(o => o.part))].sort(byName);
    const apps = [...new Set(obs.map(o => o.app))].sort(byName);
    const cells = parts.map(p => apps.map(a => obs.filter(o => o.part === p && o.app === a).map(o => o.y)));
    const counts = cells.flat().map(c => c.length);
    const r = Math.min(...counts), rMax = Math.max(...counts);
    return { parts, apps, cells, r, rMax };
  }

  // ---- statistics ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { fP, sum, mean: avg, splitTable: split, readNumber: num, isNumberCell: isNum } = FocusStats;

  // Control chart constants for subgroups of 2 to 25.
  const D2 = [0, 0, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078, 3.173, 3.258, 3.336, 3.407, 3.472, 3.532, 3.588, 3.640, 3.689, 3.735, 3.778, 3.819, 3.858, 3.895, 3.931];
  const D3c = [0, 0, 0.853, 0.888, 0.880, 0.864, 0.848, 0.833, 0.820, 0.808, 0.797, 0.787, 0.778, 0.770, 0.763, 0.756, 0.750, 0.744, 0.739, 0.734, 0.729, 0.724, 0.720, 0.716, 0.712, 0.708];
  const A2 = [0, 0, 1.880, 1.023, 0.729, 0.577, 0.483, 0.419, 0.373, 0.337, 0.308];
  const D3 = [0, 0, 0, 0, 0, 0, 0, 0.076, 0.136, 0.184, 0.223];
  const D4 = [0, 0, 3.267, 2.574, 2.282, 2.114, 2.004, 1.924, 1.864, 1.816, 1.777];
  // d2* (Duncan) for g subgroups of size m, as tabled for the AIAG X-bar and R method:
  // close to sqrt(d2² + d3²/g), and taken as d2 beyond 20 subgroups.
  const D2STAR = {
    2: [1.41421, 1.27931, 1.23105, 1.20621, 1.19105, 1.18083, 1.17348, 1.16794, 1.16361, 1.16014, 1.15729, 1.1549, 1.15289, 1.15115, 1.14965, 1.14833, 1.14717, 1.14613, 1.1452, 1.14437],
    3: [1.91155, 1.80538, 1.76858, 1.74989, 1.73857, 1.73099, 1.72555, 1.72147, 1.71828, 1.71573, 1.71363, 1.71189, 1.71041, 1.70914, 1.70804, 1.70708, 1.70623, 1.70547, 1.7048, 1.70419],
    4: [2.23887, 2.15069, 2.12049, 2.10522, 2.09601, 2.08985, 2.08543, 2.08212, 2.07953, 2.07746, 2.07577, 2.07436, 2.07316, 2.07213, 2.07125, 2.07047, 2.06978, 2.06917, 2.06862, 2.06813]
  };
  const D2STAR1 = [0, 0, 1.41421, 1.91155, 2.23887, 2.48124, 2.67253, 2.82981, 2.96288, 3.07794, 3.17905];
  function d2star(g, m) {
    const mm = Math.min(m, 25);
    if (g === 1 && m <= 10) return D2STAR1[m];
    if (D2STAR[m] && g <= 20) return D2STAR[m][g - 1];
    if (g > 20) return D2[mm];
    return Math.sqrt(D2[mm] ** 2 + D3c[mm] ** 2 / g);
  }

  function anova(st) {
    const { cells, parts, apps, r } = st, p = parts.length, o = apps.length, N = p * o * r;
    const all = cells.flat().flat(), gm = avg(all);
    const pm = cells.map(row => avg(row.flat())), om = apps.map((_, j) => avg(cells.map(row => row[j]).flat()));
    const ssP = o * r * sum(pm.map(m => (m - gm) ** 2));
    const ssO = p * r * sum(om.map(m => (m - gm) ** 2));
    const ssT = sum(all.map(y => (y - gm) ** 2));
    const ssE = sum(cells.flat().map(c => { const m = avg(c); return sum(c.map(y => (y - m) ** 2)); }));
    const ssPO = Math.max(0, ssT - ssP - ssO - ssE);
    const df = { P: p - 1, O: o - 1, PO: (p - 1) * (o - 1), E: p * o * (r - 1), T: N - 1 };
    const ms = { P: ssP / df.P, O: o > 1 ? ssO / df.O : NaN, PO: o > 1 ? ssPO / df.PO : NaN, E: ssE / df.E };
    const res = { gm, pm, om, N, p, o, r, ss: { P: ssP, O: ssO, PO: ssPO, E: ssE, T: ssT }, df, ms };
    const comp = {};
    if (o > 1) {
      // full table: parts and appraisers tested against the interaction
      res.full = [
        { src: 'P', df: df.P, ss: ssP, ms: ms.P, F: ms.P / ms.PO, p: fP(ms.P / ms.PO, df.P, df.PO) },
        { src: 'O', df: df.O, ss: ssO, ms: ms.O, F: ms.O / ms.PO, p: fP(ms.O / ms.PO, df.O, df.PO) },
        { src: 'PO', df: df.PO, ss: ssPO, ms: ms.PO, F: ms.PO / ms.E, p: fP(ms.PO / ms.E, df.PO, df.E) },
        { src: 'E', df: df.E, ss: ssE, ms: ms.E }, { src: 'T', df: df.T, ss: ssT }
      ];
      res.interaction = res.full[2].p < ALPHA_INTERACTION;
      if (res.interaction) {
        comp.rep = ms.E;
        comp.op = Math.max(0, (ms.O - ms.PO) / (p * r));
        comp.po = Math.max(0, (ms.PO - ms.E) / r);
        comp.part = Math.max(0, (ms.P - ms.PO) / (o * r));
      } else {
        // the interaction could be chance, so pool it with repeatability
        const dfE = df.PO + df.E, msE = (ssPO + ssE) / dfE;
        res.reduced = [
          { src: 'P', df: df.P, ss: ssP, ms: ms.P, F: ms.P / msE, p: fP(ms.P / msE, df.P, dfE) },
          { src: 'O', df: df.O, ss: ssO, ms: ms.O, F: ms.O / msE, p: fP(ms.O / msE, df.O, dfE) },
          { src: 'E', df: dfE, ss: ssPO + ssE, ms: msE }, { src: 'T', df: df.T, ss: ssT }
        ];
        comp.rep = msE;
        comp.op = Math.max(0, (ms.O - msE) / (p * r));
        comp.part = Math.max(0, (ms.P - msE) / (o * r));
      }
    } else {
      res.full = [
        { src: 'P', df: df.P, ss: ssP, ms: ms.P, F: ms.P / ms.E, p: fP(ms.P / ms.E, df.P, df.E) },
        { src: 'E', df: df.E, ss: ssE, ms: ms.E }, { src: 'T', df: df.T, ss: ssT }
      ];
      comp.rep = ms.E;
      comp.part = Math.max(0, (ms.P - ms.E) / r);
    }
    comp.repro = o > 1 ? (comp.op || 0) + (comp.po || 0) : null;
    comp.grr = comp.rep + (comp.repro || 0);
    comp.total = comp.grr + comp.part;
    res.comp = comp;
    return res;
  }
  function xbarR(st) {
    const { cells, parts, apps, r } = st, p = parts.length, o = apps.length;
    const ranges = cells.flat().map(c => Math.max(...c) - Math.min(...c));
    const Rbar = avg(ranges);
    const ev = Rbar / d2star(p * o, r);
    const om = apps.map((_, j) => avg(cells.map(row => row[j]).flat()));
    const pm = cells.map(row => avg(row.flat()));
    const xdiff = Math.max(...om) - Math.min(...om);
    const av = o > 1 ? Math.sqrt(Math.max(0, (xdiff / d2star(1, o)) ** 2 - ev * ev / (p * r))) : null;
    const pv = (Math.max(...pm) - Math.min(...pm)) / d2star(1, p);
    const comp = { rep: ev * ev, repro: o > 1 ? av * av : null, part: pv * pv };
    comp.grr = comp.rep + (comp.repro || 0);
    comp.total = comp.grr + comp.part;
    return { Rbar, xdiff, comp, gm: avg(cells.flat().flat()), pm, om, p, o, r, N: p * o * r };
  }
  function grade(x) {
    if (!isFinite(x)) return { text: '', cls: '' };
    return x < 0.1 ? { text: 'Excellent', cls: 'good' } : x <= 0.3 ? { text: 'Acceptable', cls: 'ok' } : { text: 'Unacceptable', cls: 'poor' };
  }

  // Standard deviations and percentages for each source of variation.
  function table(res, o) {
    const c = res.comp, rows = [];
    const add = (key, label, v, sub) => { if (v == null) return; rows.push({ key, label, sub, v, sd: Math.sqrt(v) }); };
    add('grr', 'Total Gauge R&R', c.grr, false);
    add('rep', 'Repeatability', c.rep, true);
    add('repro', 'Reproducibility', c.repro, true);
    if (c.op != null) add('op', o.appName, c.op, 2);
    if (c.po != null) add('po', `${o.partName} × ${o.appName}`, c.po, 2);
    add('part', 'Part to part', c.part, false);
    add('total', 'Total variation', c.total, false);
    const totSD = Math.sqrt(c.total);
    rows.forEach(r => {
      r.contrib = c.total > 0 ? r.v / c.total : NaN;
      r.sv = o.k * r.sd;
      r.psv = totSD > 0 ? r.sd / totSD : NaN;
      r.ptol = o.tol ? (o.tol.two ? r.sv / o.tol.width : r.sv / 2 / o.tol.half) : NaN;
      r.pproc = o.histSd > 0 ? r.sd / o.histSd : NaN;
    });
    return rows;
  }

  // ---- drawing helpers ----
  const charW = size => size * 0.56;
  const f1 = v => Math.round(v * 10) / 10;
  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function axis(lo, hi, target) {
    if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep(hi - lo, target || 5);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = a; t <= b + step / 2; t += step) ticks.push(+t.toPrecision(12));
    return { min: a, max: b, ticks };
  }
  function svgOpen(W, H, o) {
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (o.title) s.push(`<text x="16" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (16) - 16) / 11.2))))}</text>`);
    return s;
  }
  function legend(s, items, right, y) {
    const keyW = t => 28 + charW(12) * t.length + 18;
    let lx = right - items.reduce((a, [, t]) => a + keyW(t), 0);
    items.forEach(([draw, t]) => { s.push(draw(lx + 10, y)); s.push(`<text x="${lx + 24}" y="${y + 4}" font-size="12" fill="${COLORS.muted}">${esc(t)}</text>`); lx += keyW(t); });
  }
  const swatch = col => (cx, cy) => `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 9}" y2="${cy}" stroke="${col}" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="4" fill="${col}"/>`;
  const dash = col => (cx, cy) => `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 9}" y2="${cy}" stroke="${col}" stroke-width="1.8" stroke-dasharray="5 3"/>`;
  function yAxis(s, ax, y, ML, x1, yLabel, MT, plotH) {
    ax.ticks.forEach(t => {
      s.push(`<line x1="${ML}" y1="${f1(y(t))}" x2="${x1}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`);
      s.push(`<text x="${ML - 8}" y="${f1(y(t)) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(nf4.format(t))}</text>`);
    });
    if (yLabel) s.push(`<text transform="translate(18 ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(yLabel, 48))}</text>`);
  }

  // ---- charts ----
  function componentsSVG(o) {
    const { rows } = current;
    const keep = rows.filter(r => ['grr', 'rep', 'repro', 'part'].includes(r.key));
    const series = [['contrib', '% Contribution'], ['psv', '% Study variation']];
    if (o.tol) series.push(['ptol', '% Tolerance']);
    if (o.histSd > 0) series.push(['pproc', '% Process']);
    const W = drawW, ML = 64, MR = 20, MT = (o.title ? 44 : 8) + 40, plotH = 340, H = MT + plotH + 48;
    const vmax = Math.max(1, ...keep.flatMap(r => series.map(([k]) => r[k]).filter(isFinite)));
    const ax = axis(0, vmax, 5);
    const y = v => MT + plotH - v / ax.max * plotH;
    const s = svgOpen(W, H, o);
    legend(s, series.map(([, t], i) => [(cx, cy) => `<rect x="${cx - 8}" y="${cy - 6}" width="16" height="12" fill="${BARS[i]}"/>`, t]), W - MR, MT - 22);
    ax.ticks.forEach(t => {
      s.push(`<line x1="${ML}" y1="${f1(y(t))}" x2="${W - MR}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`);
      s.push(`<text x="${ML - 8}" y="${f1(y(t)) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${Math.round(t * 100)}%</text>`);
    });
    [0.1, 0.3].forEach(t => { if (t <= ax.max) s.push(`<line x1="${ML}" y1="${f1(y(t))}" x2="${W - MR}" y2="${f1(y(t))}" stroke="${COLORS.limit}" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"><title>${Math.round(t * 100)}% guideline</title></line>`); });
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    const band = (W - ML - MR) / keep.length, bw = Math.min(46, band * 0.8 / series.length);
    keep.forEach((r, i) => {
      const x0 = ML + band * i + (band - bw * series.length) / 2;
      series.forEach(([k, t], j) => {
        const v = r[k]; if (!isFinite(v)) return;
        s.push(`<rect x="${f1(x0 + j * bw)}" y="${f1(y(v))}" width="${f1(bw - 3)}" height="${f1(MT + plotH - y(v))}" fill="${BARS[j]}"><title>${esc(`${r.label}: ${t} ${pc(v)}`)}</title></rect>`);
      });
      s.push(`<text x="${f1(ML + band * (i + 0.5))}" y="${MT + plotH + 20}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(r.label === 'Total Gauge R&R' ? 'Gauge R&R' : r.label)}</text>`);
    });
    s.push('</svg>');
    return s.join('');
  }
  // One panel per appraiser, points for each part, with centre line and limits.
  function panelsSVG(o, kind) {
    const { st, res } = current, A = st.apps.length, P = st.parts.length;
    const W = drawW, ML = 70, MR = 16, gap = 14, MT = (o.title ? 44 : 8) + 54, plotH = 300;
    const longest = Math.max(...st.parts.map(p => String(p).length));
    const pw = (W - ML - MR - gap * (A - 1)) / A, step = pw / P;
    const rotate = charW(11) * Math.min(longest, 12) > step - 2;
    const H = MT + plotH + (rotate ? 30 + charW(11) * Math.min(longest, 12) * 0.7 : 30) + 26;
    let vals, centre, lcl, ucl, label;
    if (kind === 'rchart') {
      vals = st.apps.map((_, j) => st.cells.map(row => Math.max(...row[j]) - Math.min(...row[j])));
      const Rbar = avg(vals.flat()), r = Math.min(st.r, 10);
      centre = Rbar; ucl = D4[r] * Rbar; lcl = D3[r] * Rbar; label = 'Range';
    } else {
      vals = st.apps.map((_, j) => st.cells.map(row => avg(row[j])));
      const Rbar = avg(st.cells.flat().map(c => Math.max(...c) - Math.min(...c))), r = Math.min(st.r, 10);
      centre = res.gm; ucl = centre + A2[r] * Rbar; lcl = centre - A2[r] * Rbar; label = 'Average of ' + lower(o.yName);
    }
    const ax = axis(Math.min(lcl, ...vals.flat()), Math.max(ucl, ...vals.flat()), 5);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const s = svgOpen(W, H, o);
    legend(s, [[swatch(SERIES[0]), kind === 'rchart' ? 'Range of each part' : 'Average of each part'], [dash(COLORS.centre), kind === 'rchart' ? 'Average range' : 'Overall average'], [dash(COLORS.limit), 'Control limits']], W - MR, MT - 36);
    yAxis(s, ax, y, ML, W - MR, label, MT, plotH);
    st.apps.forEach((a, j) => {
      const x0 = ML + j * (pw + gap);
      s.push(`<rect x="${f1(x0)}" y="${MT}" width="${f1(pw)}" height="${plotH}" fill="none" stroke="${COLORS.axis}"/>`);
      [[ucl, COLORS.limit], [centre, COLORS.centre], [lcl, COLORS.limit]].forEach(([v, col]) => s.push(`<line x1="${f1(x0)}" y1="${f1(y(v))}" x2="${f1(x0 + pw)}" y2="${f1(y(v))}" stroke="${col}" stroke-width="1.6" stroke-dasharray="5 3"/>`));
      const pts = vals[j].map((v, i) => [x0 + step * (i + 0.5), y(v)]);
      s.push(`<polyline points="${pts.map(([x, yy]) => f1(x) + ',' + f1(yy)).join(' ')}" fill="none" stroke="${SERIES[0]}" stroke-width="1.6"/>`);
      vals[j].forEach((v, i) => {
        const out = v > ucl + 1e-12 || v < lcl - 1e-12;
        s.push(`<circle cx="${f1(pts[i][0])}" cy="${f1(pts[i][1])}" r="4" fill="${out ? COLORS.limit : SERIES[0]}"><title>${esc(`${a}, ${o.partName.toLowerCase()} ${st.parts[i]}: ${nf4.format(v)}`)}</title></circle>`);
        const tx = f1(pts[i][0]), ty = MT + plotH + 16;
        s.push(rotate
          ? `<text transform="translate(${tx + 3} ${ty}) rotate(-50)" font-size="11" text-anchor="end" fill="${COLORS.muted}">${esc(trunc(String(st.parts[i]), 12))}</text>`
          : `<text x="${tx}" y="${ty}" font-size="11" text-anchor="middle" fill="${COLORS.muted}">${esc(String(st.parts[i]))}</text>`);
      });
      s.push(`<text x="${f1(x0 + pw / 2)}" y="${MT - 6}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(a, Math.floor(pw / charW(13))))}</text>`);
    });
    s.push(`<text x="${f1((ML + W - MR) / 2)}" y="${H - 8}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(o.partName)}</text>`);
    s.push('</svg>');
    return s.join('');
  }
  // Every measurement by group, with the group averages joined up.
  function dotsSVG(o, by) {
    const { st } = current;
    const groups = by === 'part'
      ? st.parts.map((p, i) => ({ name: String(p), vals: st.cells[i].flat() }))
      : st.apps.map((a, j) => ({ name: a, vals: st.cells.map(row => row[j]).flat() }));
    const W = drawW, ML = 70, MR = 20, MT = (o.title ? 44 : 8) + 40, plotH = 340;
    const band = (W - ML - MR) / groups.length;
    const longest = Math.max(...groups.map(g => g.name.length));
    const rotate = charW(12) * Math.min(longest, 18) > band - 4;
    const H = MT + plotH + (rotate ? 30 + charW(12) * Math.min(longest, 18) * 0.7 : 30) + 26;
    const all = groups.flatMap(g => g.vals);
    const ax = axis(Math.min(...all), Math.max(...all), 5);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const s = svgOpen(W, H, o);
    legend(s, [[(cx, cy) => `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${COLORS.mean}" fill-opacity="0.6"/>`, 'Each measurement'], [swatch(SERIES[0]), 'Average']], W - MR, MT - 22);
    yAxis(s, ax, y, ML, W - MR, o.yName, MT, plotH);
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    const means = groups.map((g, i) => [ML + band * (i + 0.5), avg(g.vals)]);
    s.push(`<polyline points="${means.map(([x, v]) => f1(x) + ',' + f1(y(v))).join(' ')}" fill="none" stroke="${SERIES[0]}" stroke-width="2"/>`);
    groups.forEach((g, i) => {
      const cx = ML + band * (i + 0.5), spread = Math.min(40, band * 0.5);
      g.vals.forEach((v, q) => s.push(`<circle cx="${f1(cx + (((q + 1) * 0.618034) % 1 - 0.5) * spread)}" cy="${f1(y(v))}" r="3.2" fill="${COLORS.mean}" fill-opacity="0.55"/>`));
      s.push(`<circle cx="${f1(cx)}" cy="${f1(y(means[i][1]))}" r="6" fill="${SERIES[0]}" stroke="#fff" stroke-width="1.5"><title>${esc(`${g.name}: average ${nf4.format(means[i][1])}, ${g.vals.length} measurements from ${nf4.format(Math.min(...g.vals))} to ${nf4.format(Math.max(...g.vals))}`)}</title></circle>`);
      const ty = MT + plotH + 18;
      s.push(rotate
        ? `<text transform="translate(${f1(cx + 3)} ${ty}) rotate(-45)" font-size="12" text-anchor="end" fill="${COLORS.ink}">${esc(trunc(g.name, 18))}</text>`
        : `<text x="${f1(cx)}" y="${ty}" font-size="12" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(g.name, Math.max(3, Math.floor(band / charW(12)))))}</text>`);
    });
    s.push(`<text x="${f1((ML + W - MR) / 2)}" y="${H - 8}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(by === 'part' ? o.partName : o.appName)}</text>`);
    s.push('</svg>');
    return s.join('');
  }
  function interSVG(o) {
    const { st } = current, P = st.parts.length;
    const W = drawW, ML = 70, MR = 20, MT = (o.title ? 44 : 8) + 40, plotH = 340, H = MT + plotH + 56;
    const lines = st.apps.map((a, j) => st.cells.map(row => avg(row[j])));
    const ax = axis(Math.min(...lines.flat()), Math.max(...lines.flat()), 5);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const step = (W - ML - MR) / P;
    const s = svgOpen(W, H, o);
    legend(s, st.apps.map((a, j) => [swatch(SERIES[j % SERIES.length]), trunc(a, 20)]), W - MR, MT - 22);
    yAxis(s, ax, y, ML, W - MR, 'Average of ' + lower(o.yName), MT, plotH);
    s.push(`<line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    lines.forEach((ln, j) => {
      const col = SERIES[j % SERIES.length];
      s.push(`<polyline points="${ln.map((v, i) => f1(ML + step * (i + 0.5)) + ',' + f1(y(v))).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`);
      ln.forEach((v, i) => s.push(`<circle cx="${f1(ML + step * (i + 0.5))}" cy="${f1(y(v))}" r="4.5" fill="${col}"><title>${esc(`${st.apps[j]}, ${o.partName.toLowerCase()} ${st.parts[i]}: average ${nf4.format(v)}`)}</title></circle>`));
    });
    st.parts.forEach((p, i) => s.push(`<text x="${f1(ML + step * (i + 0.5))}" y="${MT + plotH + 18}" font-size="12" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(String(p), Math.max(2, Math.floor(step / charW(12)))))}</text>`));
    s.push(`<text x="${f1((ML + W - MR) / 2)}" y="${H - 8}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(o.partName)}</text>`);
    s.push('</svg>');
    return s.join('');
  }
  // Gauge run chart: a panel per part, each appraiser's readings in turn.
  function runSVG(o) {
    const { st, res } = current, P = st.parts.length;
    const cols = Math.min(5, P), rowsN = Math.ceil(P / cols);
    const W = drawW, ML = 70, MR = 16, gap = 10, MT = (o.title ? 44 : 8) + 40, ph = 150, gapY = 30;
    const pw = (W - ML - MR - gap * (cols - 1)) / cols, H = MT + rowsN * (ph + gapY) + 20;
    const all = st.cells.flat().flat();
    const ax = axis(Math.min(...all), Math.max(...all), 4);
    const s = svgOpen(W, H, o);
    legend(s, st.apps.map((a, j) => [swatch(SERIES[j % SERIES.length]), trunc(a, 20)]).concat([[dash(COLORS.mean), 'Overall average']]), W - MR, MT - 22);
    st.parts.forEach((p, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x0 = ML + c * (pw + gap), y0 = MT + r * (ph + gapY) + 16;
      const y = v => y0 + ph - (v - ax.min) / (ax.max - ax.min) * ph;
      s.push(`<text x="${f1(x0 + pw / 2)}" y="${y0 - 4}" font-size="12" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(`${o.partName} ${p}`, Math.floor(pw / charW(12))))}</text>`);
      s.push(`<rect x="${f1(x0)}" y="${y0}" width="${f1(pw)}" height="${ph}" fill="none" stroke="${COLORS.axis}"/>`);
      if (c === 0) ax.ticks.forEach(t => s.push(`<text x="${ML - 6}" y="${f1(y(t)) + 4}" font-size="11" text-anchor="end" fill="${COLORS.muted}">${esc(nf4.format(t))}</text>`));
      ax.ticks.forEach(t => s.push(`<line x1="${f1(x0)}" y1="${f1(y(t))}" x2="${f1(x0 + pw)}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`));
      s.push(`<line x1="${f1(x0)}" y1="${f1(y(res.gm))}" x2="${f1(x0 + pw)}" y2="${f1(y(res.gm))}" stroke="${COLORS.mean}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
      const n = st.apps.length * st.r, step = pw / n;
      st.apps.forEach((a, j) => {
        const col = SERIES[j % SERIES.length];
        const pts = st.cells[i][j].map((v, t) => [x0 + step * (j * st.r + t + 0.5), y(v), v, t]);
        s.push(`<polyline points="${pts.map(q => f1(q[0]) + ',' + f1(q[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/>`);
        pts.forEach(q => s.push(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.5" fill="${col}"><title>${esc(`${o.partName} ${p}, ${a}, trial ${q[3] + 1}: ${nf4.format(q[2])}`)}</title></circle>`));
      });
    });
    s.push(`<text transform="translate(18 ${MT + rowsN * (ph + gapY) / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.yName, 48))}</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function readingParts() {
    const { o, rows, res, st, ndc, cp } = current;
    const get = k => rows.find(r => r.key === k);
    const grr = get('grr'), rep = get('rep'), repro = get('repro');
    const main = o.histSd > 0 ? grr.pproc : grr.psv;
    const g = grade(main);
    const paras = [];
    paras.push(`<b>Measuring accounts for ${pc(main)} of the ${o.histSd > 0 ? 'known process variation' : 'study variation'}</b>, which is ${g.text.toLowerCase()} for tracking improvement${g.cls === 'poor' ? ': changes in your data could easily be measurement noise' : g.cls === 'ok' ? ', though it may hide small changes' : ''}. ${o.histSd > 0 ? 'This uses the known process standard deviation, which is the most reliable comparison.' : 'This compares with the spread of the parts in the study, so it depends on how the parts were chosen; give the known process standard deviation if you have it.'}`);
    if (repro) {
      const bigger = rep.v >= repro.v ? 'repeatability' : 'reproducibility';
      paras.push(bigger === 'repeatability'
        ? `Most of the measurement variation is <b>repeatability</b> (${pc(rep.contrib)} of the total variance, against ${pc(repro.contrib)} for reproducibility): the same person measuring the same ${o.partName.toLowerCase()} gets different results. Look at the equipment, the method and the conditions of measuring.`
        : `Most of the measurement variation is <b>reproducibility</b> (${pc(repro.contrib)} of the total variance, against ${pc(rep.contrib)} for repeatability): different ${o.appName.toLowerCase()}s get different results. Look at training and how clearly the method is written down.`);
      const lo = st.apps[res.om.indexOf(Math.min(...res.om))], hi = st.apps[res.om.indexOf(Math.max(...res.om))];
      if (st.apps.length > 1) paras.push(`${esc(hi)} had the highest average, ${nf4.format(Math.max(...res.om))}, and ${esc(lo)} the lowest, ${nf4.format(Math.min(...res.om))}: a gap of ${nf4.format(Math.max(...res.om) - Math.min(...res.om))}.`);
    } else {
      paras.push(`With one ${o.appName.toLowerCase()} the study measures repeatability only; reproducibility, the differences between people, can’t be worked out.`);
    }
    if (o.method === 'anova' && st.apps.length > 1) {
      const pi = res.full[2];
      paras.push(res.interaction
        ? `The ${o.partName.toLowerCase()} by ${o.appName.toLowerCase()} interaction is significant (${pf(pi.p) === '< 0.001' ? 'p < 0.001' : 'p = ' + pf(pi.p)}): ${o.appName.toLowerCase()}s don’t differ by the same amount on every ${o.partName.toLowerCase()}, so some items are harder to measure consistently than others. The interaction chart shows which.`
        : `The ${o.partName.toLowerCase()} by ${o.appName.toLowerCase()} interaction could be chance (p = ${pf(pi.p)}, not below ${ALPHA_INTERACTION}), so it is pooled with repeatability, as Minitab does.`);
    }
    if (o.tol) {
      const t = grade(grr.ptol);
      paras.push(`<b>Against the tolerance, measuring takes up ${pc(grr.ptol)}</b>, so the measurement is ${t.cls === 'good' ? 'excellent' : t.cls === 'ok' ? 'generally acceptable' : 'not good enough'} for deciding whether an item is in or out of specification.`);
    }
    paras.push(`The measurement can tell apart <b>${ndc} distinct categor${ndc === 1 ? 'y' : 'ies'}</b> of ${o.partName.toLowerCase()}. ${ndc >= 5 ? 'That meets the usual minimum of 5.' : 'The usual minimum is 5: fewer means the measurement can only sort items into a few broad groups.'}`);
    if (cp != null) {
      paras.push(`Is the data valid? From the tolerance and the parts in this study, the rough process capability (Cp) is ${nf.format(cp)}. If that is much lower than you would expect from the process, the parts probably weren’t chosen at random from everyday work, and the study’s percentages may be misleading.`);
    }
    if (st.parts.length < 5) paras.push(`There are only ${st.parts.length} ${o.partName.toLowerCase()}s, so the part-to-part variation is poorly estimated. Aim for about 10.`);
    return paras;
  }
  function summaryText() {
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [current.o.title || 'Gauge R&R study', ''];
    readingParts().forEach(p => lines.push(strip(p), ''));
    return lines.join('\n').trim();
  }

  // ---- tables ----
  const r6 = x => isFinite(x) ? +x.toPrecision(6) : '';
  const srcName = (src, o) => ({ P: o.partName, O: o.appName, PO: `${o.partName} × ${o.appName}`, E: 'Repeatability', T: 'Total' }[src]);
  function tableRows() {
    const { o, rows, res, ndc } = current;
    const out = [];
    if (o.method === 'anova') {
      const t = (title, rs) => { out.push([title], ['Source', 'DF', 'SS', 'MS', 'F', 'P']); rs.forEach(r => out.push([srcName(r.src, o), r.df, r6(r.ss), r6(r.ms), r6(r.F), r6(r.p)])); out.push([]); };
      t(res.o > 1 ? 'Two-way ANOVA table with interaction' : 'One-way ANOVA table', res.full);
      if (res.reduced) t('Two-way ANOVA table without interaction', res.reduced);
    }
    const head = ['Source', 'Variance component', '% Contribution', 'Standard deviation', `Study variation (${o.k} × SD)`, '% Study variation'];
    if (o.tol) head.push('% Tolerance');
    if (o.histSd > 0) head.push('% Process');
    out.push(['Gauge R&R (' + (o.method === 'anova' ? 'ANOVA' : 'X-bar and R') + ' method)'], head);
    rows.forEach(r => { const row = [r.label, r6(r.v), r6(r.contrib), r6(r.sd), r6(r.sv), r6(r.psv)]; if (o.tol) row.push(r6(r.ptol)); if (o.histSd > 0) row.push(r6(r.pproc)); out.push(row); });
    out.push([], ['Number of distinct categories', ndc]);
    return out;
  }
  function tableHTML() {
    const { o, rows, res, ndc } = current;
    const n4 = x => isFinite(x) ? nf4.format(x) : '–';
    let h = '';
    const gcell = v => { const g = grade(v); return `<td class="num ${g.cls}">${pc(v)}</td>`; };
    h += `<div class="tablewrap" tabindex="0" role="region" aria-label="Gauge R&amp;R table"><h3>Gauge R&amp;R</h3><table><caption class="sr">Variance components, standard deviations and percentages for each source of variation</caption><thead><tr><th>Source</th><th class="num">Variance component</th><th class="num">% Contribution</th><th class="num">Standard deviation</th><th class="num">Study variation (${o.k} × SD)</th><th class="num">% Study variation</th>${o.tol ? '<th class="num">% Tolerance</th>' : ''}${o.histSd > 0 ? '<th class="num">% Process</th>' : ''}</tr></thead><tbody>`;
    rows.forEach(r => {
      const grrRow = r.key === 'grr' || r.sub;
      h += `<tr><td${r.sub === 2 ? ' class="sub" style="padding-left:2.6rem"' : r.sub ? ' class="sub"' : ''}>${r.key === 'grr' || r.key === 'total' ? `<b>${esc(r.label)}</b>` : esc(r.label)}</td><td class="num">${n4(r.v)}</td><td class="num">${pc(r.contrib)}</td><td class="num">${n4(r.sd)}</td><td class="num">${n4(r.sv)}</td>${grrRow ? gcell(r.psv) : `<td class="num">${pc(r.psv)}</td>`}${o.tol ? (grrRow ? gcell(r.ptol) : `<td class="num">${pc(r.ptol)}</td>`) : ''}${o.histSd > 0 ? (grrRow ? gcell(r.pproc) : `<td class="num">${pc(r.pproc)}</td>`) : ''}</tr>`;
    });
    h += `</tbody></table><p class="hint">Number of distinct categories: <b>${ndc}</b>. For the measurement rows, green is under 10% (excellent), blue 10% to 30% (acceptable) and red over 30% (unacceptable).${o.method === 'xbarr' ? ' The X-bar and R method can’t split reproducibility into appraiser and interaction.' : ''}</p></div>`;
    if (o.method === 'anova') {
      const t = (title, rs) => {
        let x = `<div class="tablewrap" tabindex="0" role="region" aria-label="${title}"><h3>${title}</h3><table><caption class="sr">${title}</caption><thead><tr><th>Source</th><th class="num">DF</th><th class="num">SS</th><th class="num">MS</th><th class="num">F</th><th class="num">P</th></tr></thead><tbody>`;
        rs.forEach(r => { x += `<tr><td>${esc(srcName(r.src, o))}</td><td class="num">${r.df}</td><td class="num">${n4(r.ss)}</td><td class="num">${r.ms != null ? n4(r.ms) : ''}</td><td class="num">${r.F != null ? n4(r.F) : ''}</td><td class="num">${r.p != null ? pf(r.p) : ''}</td></tr>`; });
        return x + '</tbody></table>';
      };
      h += t(res.o > 1 ? 'Two-way ANOVA table with interaction' : 'One-way ANOVA table', res.full) + '</div>';
      if (res.reduced) h += t('Two-way ANOVA table without interaction', res.reduced) + `<p class="hint">The interaction p-value is not below ${ALPHA_INTERACTION}, so the interaction is pooled with repeatability for the Gauge R&amp;R figures.</p></div>`;
    }
    return h;
  }

  // ---- render ----
  function update() {
    current = null;
    const text = els.data.value;
    const sp = split(text);
    if (!headerTouched) els.hasHeader.checked = !!(sp && sp.recs.length > 1 && shape(sp.recs, sp.delim).headerGuess);
    if (!text.trim()) { els.detected.textContent = ''; return renderEmpty('Paste your study data on the left to analyse it.'); }
    const d = parse(text, els.hasHeader.checked);
    if (!d || !d.obs.length) { els.detected.textContent = 'Couldn’t find any measurements.'; return renderEmpty('Paste three columns (part, appraiser and measurement), or a table with the appraiser and trial first and one column per part.'); }
    const st = arrange(d.obs);
    let note = `Reading ${d.obs.length} measurements: ${st.parts.length} ${d.partName.toLowerCase()}s, ${st.apps.length} ${d.appName.toLowerCase()}${st.apps.length === 1 ? '' : 's'} (${list(st.apps.slice(0, 6))}${st.apps.length > 6 ? ' and more' : ''})${st.r === st.rMax ? `, ${st.r} trial${st.r === 1 ? '' : 's'} each` : ''}.`;
    if (d.kind === 'table') note += ' Read as a table with one column per part.';
    if (d.skipped) note += ` ${d.skipped} row${d.skipped > 1 ? 's' : ''} skipped (no number).`;
    els.detected.textContent = note;
    if (st.parts.length < 2) return renderEmpty('A Gauge R&R study needs at least two parts.');
    if (st.r === 0) return renderEmpty('Every appraiser needs to measure every part. Some combinations have no measurements.');
    if (st.r !== st.rMax) return renderEmpty(`Every appraiser should measure every part the same number of times, but some combinations have ${st.r} and others ${st.rMax}. Check for missing or extra rows.`);
    if (st.r < 2) return renderEmpty('Each appraiser needs to measure each part at least twice, so that repeatability can be worked out.');

    const lsl = parseFloat(els.lsl.value), usl = parseFloat(els.usl.value), histSd = parseFloat(els.histSd.value);
    const method = els.method.value;
    const res = method === 'xbarr' ? xbarR(st) : anova(st);
    let tol = null;
    if (isFinite(lsl) && isFinite(usl) && usl > lsl) tol = { two: true, width: usl - lsl };
    else if (isFinite(lsl) !== isFinite(usl)) { const lim = isFinite(lsl) ? lsl : usl; const half = Math.abs(res.gm - lim); if (half > 0) tol = { two: false, half }; }
    const o = {
      title: els.title.value.trim(), method, k: +els.k.value, tol, histSd: histSd > 0 ? histSd : NaN,
      partName: d.partName, appName: d.appName, yName: d.yName
    };
    const rows = table(res, o);
    const get = k => rows.find(r => r.key === k);
    const ndc = get('grr').sd > 0 ? Math.max(1, Math.floor(1.41 * get('part').sd / get('grr').sd)) : Infinity;
    const cp = tol && tol.two && get('total').sd > 0 ? tol.width / 6 / get('total').sd : null;
    current = { o, rows, res, st, ndc, cp };

    if (!CHARTS[chartType]) chartType = 'components';
    const main = o.histSd > 0 ? get('grr').pproc : get('grr').psv, g = grade(main);
    o.aria = (o.title ? o.title + '. ' : '') + `${CHARTS[chartType]}. Gauge R&R is ${pc(main)} of ${o.histSd > 0 ? 'process' : 'study'} variation, ${g.text.toLowerCase()}. ${ndc} distinct categories.`;
    const svg = drawShown(() => chartType === 'rchart' || chartType === 'xbar' ? panelsSVG(o, chartType) : chartType === 'bypart' ? dotsSVG(o, 'part') : chartType === 'byapp' ? dotsSVG(o, 'app') : chartType === 'inter' ? interSVG(o) : chartType === 'run' ? runSVG(o) : componentsSVG(o));
    trackChart({ points: d.obs.length });
    const legendNote = {
      components: 'Each group of bars shows a source of variation. The dashed lines mark the 10% and 30% guidelines; the measurement bars (Gauge R&R, repeatability and reproducibility) should be short and the part-to-part bars tall.',
      rchart: 'The range of each appraiser’s repeat measurements of each part. Points above the upper limit (in red) show readings that were unusually inconsistent.',
      xbar: 'The average of each appraiser’s measurements of each part. Here you want most points outside the limits: that shows the measurement can tell the parts apart.',
      bypart: 'Every measurement of each part. Tight clusters with averages far apart are what a good measurement looks like.',
      byapp: 'Every measurement by each appraiser. A level line means appraisers agree on average.',
      inter: 'The average measurement of each part by each appraiser. Lines that cross or aren’t parallel mean appraisers differ more on some parts than others.',
      run: 'Each panel is one part, with every appraiser’s readings in turn. Readings should sit close together within each panel.'
    }[chartType];
    const ptol = get('grr').ptol;
    els.result.innerHTML = `
      <p class="summary">Measuring accounts for <strong>${pc(main)}</strong> of the variation: <strong>${g.text.toLowerCase()}</strong></p>
      <p class="focuson">${esc(`${o.method === 'anova' ? 'ANOVA' : 'X-bar and R'} method, ${st.parts.length} ${o.partName.toLowerCase()}s, ${st.apps.length} ${o.appName.toLowerCase()}${st.apps.length === 1 ? '' : 's'}, ${st.r} trials, ${res.N} measurements. Gauge R&R as a percentage of ${o.histSd > 0 ? 'the known process' : 'study'} variation.`)}</p>
      <div class="stats">
        <div class="stat"><b class="${grade(get('grr').psv).cls}">${pc(get('grr').psv)}</b><span>Gauge R&amp;R, % study variation</span></div>
        ${o.histSd > 0 ? `<div class="stat"><b class="${grade(get('grr').pproc).cls}">${pc(get('grr').pproc)}</b><span>Gauge R&amp;R, % process</span></div>` : ''}
        ${o.tol ? `<div class="stat"><b class="${grade(ptol).cls}">${pc(ptol)}</b><span>Gauge R&amp;R, % tolerance</span></div>` : ''}
        <div class="stat"><b>${pc(get('grr').contrib)}</b><span>Gauge R&amp;R, % contribution</span></div>
        <div class="stat"><b class="${ndc >= 5 ? 'good' : 'poor'}">${isFinite(ndc) ? ndc : '–'}</b><span>Distinct categories (5 or more)</span></div>
      </div>
      <div class="chartbar"><div class="block"><label for="chartType">Chart</label><select id="chartType">${Object.keys(CHARTS).map(c => `<option value="${c}"${c === chartType ? ' selected' : ''}>${CHARTS[c]}</option>`).join('')}</select></div></div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">${legendNote} Hover over the chart to see the figures.</p>
      <div class="reading"><h3>What the study shows</h3>${readingParts().map(x => `<p>${x}</p>`).join('')}</div>
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
    els.title.value = 'Systolic blood pressure readings: Gauge R&R study (example)';
    els.method.value = 'anova'; els.k.value = '6';
    els.lsl.value = ''; els.usl.value = ''; els.histSd.value = '18';
    headerTouched = false; chartType = 'components';
    update();
  }

  // ---- blank data collection sheet ----
  // In the table layout the parse step reads: appraiser and trial, then one column for each part.
  function dataSheet() {
    const parts = 10, apps = ['Appraiser A', 'Appraiser B', 'Appraiser C'], trials = 3;
    const head = ['Appraiser', 'Trial', ...Array.from({ length: parts }, (_, i) => 'Part ' + (i + 1))].map(v => ({ v, s: 'head' }));
    const rows = [head];
    apps.forEach(a => { for (let t = 1; t <= trials; t++) rows.push([a, t, ...Array(parts).fill({ v: '', s: 'input' })]); });
    const notes = [
      'Running the study',
      '1. Choose about 10 parts (items) that cover the range you normally see, picked at random from everyday work. Label them 1 to 10, ideally where the appraisers can’t see the label.',
      '2. Choose two or three people who usually take the measurement. Replace “Appraiser A”, “B” and “C” with their names.',
      '3. Each person measures every part, in a random order, without seeing their earlier results. Repeat for each trial.',
      '4. Write each measurement in the shaded box for that appraiser, trial and part. Delete any columns or rows you don’t need, or add more.',
      '',
      'Analysing the results',
      'Save this workbook, then in the Gauge R&R tool choose Data sheet, then Import filled data sheet, and pick this file. Or select the whole table on the Data sheet, including the headings, copy it and paste it into the tool.'
    ];
    return [
      { name: 'Data', cols: [16, 8, ...Array(parts).fill(10)], rows, freeze: 1 },
      { name: 'Instructions', cols: [100], rows: notes.map((v, i) => [{ v, s: i === 0 || v === 'Analysing the results' ? 'title' : 'wrap' }]) }
    ];
  }

  // ---- events ----
  els.data.addEventListener('input', schedule);
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  [els.title, els.lsl, els.usl, els.histSd].forEach(el => el.addEventListener('input', schedule));
  [els.method, els.k].forEach(el => el.addEventListener('change', update));
  trackSettings({ method: 'method', spread: 'k', chartType: 'chartType' });
  $('clearBtn').addEventListener('click', () => { els.data.value = ''; els.title.value = ''; els.lsl.value = ''; els.usl.value = ''; els.histSd.value = ''; headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  els.result.addEventListener('change', e => { if (e.target.id === 'chartType') { chartType = e.target.value; update(); $('chartType').focus(); } });

  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'gauge_rr', formerIds: ['gauge_rr'], toolName: 'Gauge R&R',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ chartType }),
    setExtra: x => { if (x && CHARTS[x.chartType]) chartType = x.chartType; },
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) }))),
    template: { fileName: 'gauge-rr-data-sheet.xlsx', sheets: dataSheet, import: [{ sheet: 'Data', into: '#data', fixed: 2 }] }
  });
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    nFactors: $('nFactors'), reps: $('reps'), factors: $('factors'), respName: $('respName'), goal: $('goal'),
    terms: $('terms'), alpha: $('alpha'), title: $('title'), view: $('view'), runs: $('runs'), runNote: $('runNote'), result: $('result')
  };
  const COLORS = { ink: '#212B32', muted: '#4C6272', grid: '#E8EDEE', axis: '#AEB7BD', sig: '#005EB8', insig: '#AEB7BD', ref: '#ED8B00', lo: '#005EB8', hi: '#ED8B00', mean: '#768692' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 4 });
  const LETTERS = 'ABCD';
  const CHARTS = { pareto: 'Which terms matter most (Pareto chart)', main: 'Main effects', inter: 'Interactions' };

  // Everything the user sets up. Results are keyed by standard order, so they stay
  // with their settings whatever order the runs are listed or carried out in.
  let state = null;
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

  const blankFactor = i => ({ name: '', type: 'text', low: '', high: '' });
  function fresh() {
    return {
      k: 2, reps: 2, factors: [0, 1, 2, 3].map(blankFactor), response: '', goal: 'min', alpha: '0.05', title: '',
      view: 'run', runOrder: [], y: {}, terms: [], chartType: 'pareto', whatIf: {}
    };
  }

  // Example: an ED team tests three changes to speed up triage (made-up data)
  const EXAMPLE = {
    k: 3, reps: 2, response: 'Minutes from arrival to triage', goal: 'min', alpha: '0.05', title: 'What speeds up triage in ED (example)',
    factors: [
      { name: 'Triage nurses on shift', type: 'numeric', low: '2', high: '3' },
      { name: 'Streaming nurse at the front door', type: 'text', low: 'No', high: 'Yes' },
      { name: 'Self check-in kiosk', type: 'text', low: 'Off', high: 'On' },
      blankFactor(3)
    ],
    runOrder: [6, 11, 1, 14, 3, 16, 9, 4, 13, 7, 2, 10, 15, 5, 12, 8],
    y: { 1: 39, 2: 26, 3: 28, 4: 21, 5: 36, 6: 25, 7: 27, 8: 23, 9: 37, 10: 24, 11: 26, 12: 23, 13: 38, 14: 26, 15: 25, 16: 21 }
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trunc = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'designed-experiment';
  const lower = s => /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const pf = p => p == null ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3);
  const pIs = p => p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
  // Shared statistics, from /assets/js/focus-stats.js. Numbers typed into the tool are
  // read like pasted cells: commas count as thousands separators only in groups of three.
  const { tP, tCrit, readNumber: num } = FocusStats;

  // ---- the design ----
  const runsN = () => (1 << state.k) * state.reps;
  // Coded settings (−1 low, +1 high) of a run in standard order: factor A changes fastest.
  const codedOf = std => { const i = (std - 1) % (1 << state.k); return LETTERS.slice(0, state.k).split('').map((_, j) => (i >> j) & 1 ? 1 : -1); };
  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Every term: main effects, then two-, three- and four-factor interactions.
  function allTerms(k) {
    const out = [];
    for (let size = 1; size <= k; size++) {
      const rec = (start, pick) => {
        if (pick.length === size) { out.push(pick.join('')); return; }
        for (let j = start; j < k; j++) rec(j + 1, pick.concat(LETTERS[j]));
      };
      rec(0, []);
    }
    return out;
  }
  const idx = key => key.split('').map(c => LETTERS.indexOf(c));
  const fName = j => (state.factors[j].name || '').trim() || 'Factor ' + LETTERS[j];
  const termName = key => idx(key).map(fName).join(' × ');
  const lvl = (j, x) => { const f = state.factors[j]; const t = String(x < 0 ? f.low : f.high).trim(); return t || (x < 0 ? 'Low' : 'High'); };
  const respName = () => state.response.trim() || 'Result';

  // Low and high settings must make sense before anything can be analysed.
  function factorProblems() {
    const out = [];
    for (let j = 0; j < state.k; j++) {
      const f = state.factors[j];
      if (f.type === 'numeric') {
        const a = num(f.low), b = num(f.high);
        if (!isFinite(a) || !isFinite(b)) out.push({ j, msg: 'Enter a number for both settings, or choose Text.' });
        else if (a === b) out.push({ j, msg: 'The low and high settings must be different.' });
      } else if (String(f.low).trim() && String(f.low).trim().toLowerCase() === String(f.high).trim().toLowerCase()) {
        out.push({ j, msg: 'Give the two settings different names.' });
      }
    }
    return out;
  }

  // ---- the model ----
  // Inverse of a symmetric matrix by Gauss–Jordan elimination; null if singular.
  function invert(A) {
    const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => i === j ? 1 : 0)));
    const scale = Math.max(...A.map((r, i) => Math.abs(r[i]))) || 1;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-9 * scale) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = M[r][c]; if (!f) continue;
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(r => r.slice(n));
  }
  const termVal = (key, x) => idx(key).reduce((p, j) => p * x[j], 1);

  // Least squares fit of the response on the coded terms in the model.
  function fit(obs, terms) {
    const cols = ['', ...terms], p = cols.length, n = obs.length;
    if (n < p) return { error: 'few', n, p };
    const X = obs.map(o => cols.map(key => key ? termVal(key, o.x) : 1));
    const XtX = cols.map((_, a) => cols.map((_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
    const inv = invert(XtX);
    if (!inv) return { error: 'singular', n, p };
    const Xty = cols.map((_, a) => X.reduce((s, r, i) => s + r[a] * obs[i].y, 0));
    const coef = inv.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
    const mean = obs.reduce((s, o) => s + o.y, 0) / n;
    const sse = obs.reduce((s, o, i) => s + (o.y - X[i].reduce((a, v, j) => a + v * coef[j], 0)) ** 2, 0);
    const sst = obs.reduce((s, o) => s + (o.y - mean) ** 2, 0);
    const df = n - p, mse = df > 0 ? sse / df : NaN;
    const tiny = 1e-12 * (sst || 1);
    const testable = df > 0 && sse > tiny;
    const se = inv.map((r, i) => testable ? Math.sqrt(mse * r[i]) : NaN);
    const pv = coef.map((c, i) => testable ? tP(Math.abs(c / se[i]), df) : null);
    return {
      cols, coef, se, pv, n, p, df, mse, testable, mean, sse, sst,
      s: df > 0 ? Math.sqrt(mse) : NaN,
      r2: sst > 0 ? 1 - sse / sst : NaN,
      r2adj: sst > 0 && df > 0 ? Math.max(0, 1 - mse / (sst / (n - 1))) : NaN
    };
  }
  const predict = (m, x) => m.cols.reduce((s, key, i) => s + m.coef[i] * (key ? termVal(key, x) : 1), 0);
  // Uncoded coefficients, for the prediction equation in real units. A numeric factor's
  // coded value is (x − centre) / half-range; text factors stay coded −1 and +1.
  function uncoded(m) {
    const cen = [], half = [];
    for (let j = 0; j < state.k; j++) {
      const f = state.factors[j];
      if (f.type === 'numeric') { const a = num(f.low), b = num(f.high); cen[j] = (a + b) / 2; half[j] = (b - a) / 2; }
      else { cen[j] = 0; half[j] = 1; }
    }
    const out = {};
    m.cols.forEach(key => { out[key] = 0; });
    m.cols.forEach((T, i) => {
      const t = T ? idx(T) : [];
      // expand the product of (x_j − centre_j) / half_j over the factors in T
      for (let mask = 0; mask < (1 << t.length); mask++) {
        let factor = m.coef[i], S = '';
        t.forEach((j, b) => {
          if (mask >> b & 1) { factor /= half[j]; S += LETTERS[j]; } else factor *= -cen[j] / half[j];
        });
        if (S in out) out[S] += factor;
      }
    });
    return out;
  }
  // Every corner of the design (each combination of low and high).
  const corners = k => Array.from({ length: 1 << k }, (_, i) => Array.from({ length: k }, (_, j) => (i >> j) & 1 ? 1 : -1));
  // Fitted average at given settings of some factors, averaged over the others.
  function fittedMean(m, fixed) {
    const pts = corners(state.k).filter(x => Object.keys(fixed).every(j => x[j] === fixed[j]));
    return pts.reduce((s, x) => s + predict(m, x), 0) / pts.length;
  }

  // Keep the model hierarchical: an interaction needs every term inside it.
  const isSub = (a, b) => a !== b && a.split('').every(c => b.includes(c));
  function include(key) { const all = allTerms(state.k); state.terms = all.filter(t => state.terms.includes(t) || t === key || isSub(t, key)); }
  function exclude(key) { state.terms = state.terms.filter(t => t !== key && !isSub(key, t)); }

  function observations() {
    const obs = [];
    for (let s = 1; s <= runsN(); s++) {
      const v = num(state.y[s]);
      if (isFinite(v)) obs.push({ std: s, x: codedOf(s), y: v });
    }
    return obs;
  }

  // Backward elimination: drop the least significant term that nothing else depends on,
  // until every term left is clear. Without repeats, start with the highest-order interaction.
  function reduce() {
    const obs = observations(), alpha = +state.alpha;
    let terms = allTerms(state.k).filter(t => state.terms.includes(t));
    for (let guard = 0; guard < 20 && terms.length; guard++) {
      const m = fit(obs, terms);
      const removable = terms.filter(t => !terms.some(u => isSub(t, u)));
      if (m.error || !m.testable) {
        if (m.error === 'singular' && !obs.length) break;
        const top = Math.max(...removable.map(t => t.length));
        if (top < 2 && !m.error) break;
        terms = terms.filter(t => t !== removable.filter(r => r.length === top).pop());
        continue;
      }
      let worst = null, wp = -1;
      removable.forEach(t => { const p = m.pv[m.cols.indexOf(t)]; if (p > wp) { wp = p; worst = t; } });
      if (worst == null || wp < alpha) break;
      terms = terms.filter(t => t !== worst);
    }
    state.terms = terms;
  }

  // ---- left panel ----
  function renderFactors() {
    const probs = factorProblems();
    let h = '';
    for (let j = 0; j < state.k; j++) {
      const f = state.factors[j], L = LETTERS[j], pr = probs.find(p => p.j === j);
      const num_ = f.type === 'numeric';
      h += `<div class="factor"><h3><span class="letter" aria-hidden="true">${L}</span>Factor ${L}</h3>
        <div class="block"><label for="f${j}name">Name</label><input type="text" id="f${j}name" data-f="${j}" data-k="name" value="${esc(f.name)}" placeholder="${['e.g. Nurses on shift', 'e.g. Reminder text', 'e.g. Letter design', 'e.g. Clinic time'][j]}"></div>
        <div class="block"><label for="f${j}type">Type</label><select id="f${j}type" data-f="${j}" data-k="type"><option value="text"${num_ ? '' : ' selected'}>Text (a choice)</option><option value="numeric"${num_ ? ' selected' : ''}>Numeric (a quantity)</option></select></div>
        <div class="pair">
          <div class="block"><label for="f${j}low">Low setting</label><input type="${num_ ? 'number' : 'text'}" step="any" id="f${j}low" data-f="${j}" data-k="low" value="${esc(f.low)}" placeholder="${num_ ? 'e.g. 2' : 'e.g. No'}"></div>
          <div class="block"><label for="f${j}high">High setting</label><input type="${num_ ? 'number' : 'text'}" step="any" id="f${j}high" data-f="${j}" data-k="high" value="${esc(f.high)}" placeholder="${num_ ? 'e.g. 3' : 'e.g. Yes'}"></div>
        </div>
        <p class="ferr" id="f${j}err"${pr ? '' : ' hidden'}>${pr ? esc(pr.msg) : ''}</p></div>`;
    }
    els.factors.innerHTML = h;
  }
  function showFactorProblems() {
    const probs = factorProblems();
    for (let j = 0; j < state.k; j++) {
      const el = $('f' + j + 'err'), pr = probs.find(p => p.j === j);
      if (!el) continue;
      el.hidden = !pr; el.textContent = pr ? pr.msg : '';
    }
  }
  function renderTerms() {
    const focused = document.activeElement && document.activeElement.id;
    const m = current && current.m, alpha = +state.alpha;
    let h = '', last = 0;
    allTerms(state.k).forEach(key => {
      if (key.length !== last) {
        last = key.length;
        h += `<p class="order">${key.length === 1 ? 'Main effects' : key.length + '-factor interactions'}</p>`;
      }
      const on = state.terms.includes(key);
      let pv = '';
      if (on && m && m.testable) {
        const p = m.pv[m.cols.indexOf(key)];
        pv = `<span class="pv${p < alpha ? ' sig' : ''}">${p < alpha ? 'Clear, ' : ''}p ${p < 0.001 ? '< 0.001' : '= ' + p.toFixed(3)}</span>`;
      }
      h += `<label class="check"><span class="t"><input type="checkbox" id="term-${key}" data-term="${key}"${on ? ' checked' : ''}><span><b>${key}</b> ${esc(termName(key))}</span></span>${pv}</label>`;
    });
    els.terms.innerHTML = h;
    if (focused && focused.startsWith('term-') && $(focused)) $(focused).focus();
  }
  function syncInputs() {
    els.nFactors.value = String(state.k);
    els.reps.value = String(state.reps);
    els.respName.value = state.response;
    els.goal.value = state.goal;
    els.alpha.value = state.alpha;
    els.title.value = state.title;
    els.view.value = state.view;
  }

  // ---- runs worksheet ----
  function renderRuns() {
    const N = runsN(), k = state.k;
    const runOf = {}; state.runOrder.forEach((s, i) => { runOf[s] = i + 1; });
    const order = state.view === 'std' ? Array.from({ length: N }, (_, i) => i + 1) : state.runOrder.slice();
    const per = 1 << k;
    let h = '<table><caption class="sr">Runs in the experiment, with the settings for each and a box for its result</caption><thead><tr>';
    h += '<th class="num">Run</th><th class="num">Std</th>';
    for (let j = 0; j < k; j++) h += `<th>${LETTERS[j]}: ${esc(trunc(fName(j), 28))}</th>`;
    h += `<th>${esc(trunc(respName(), 32))}</th></tr></thead><tbody>`;
    order.forEach((s, i) => {
      const x = codedOf(s);
      const start = state.view === 'std' && i > 0 && i % per === 0;
      h += `<tr${start ? ' class="rep-start"' : ''}><td class="num">${runOf[s]}</td><td class="num">${s}</td>`;
      x.forEach((v, j) => { h += `<td class="${v > 0 ? 'lvl-hi' : ''}">${esc(lvl(j, v))}</td>`; });
      const val = state.y[s] == null ? '' : state.y[s];
      h += `<td><input type="text" inputmode="decimal" id="y${s}" data-std="${s}" value="${esc(val)}" aria-label="Result for run ${runOf[s]}"></td></tr>`;
    });
    h += '</tbody></table>';
    els.runs.innerHTML = h;
    noteRuns();
  }
  function noteRuns() {
    const N = runsN(), got = observations().length;
    const bad = Object.keys(state.y).filter(s => +s <= N && String(state.y[s]).trim() !== '' && !isFinite(num(state.y[s]))).length;
    let t = `${N} runs: ${1 << state.k} combinations of settings × ${state.reps} replicate${state.reps > 1 ? 's' : ''}. `;
    t += got === N ? 'Every run has a result.' : `${got} of ${N} runs have a result so far.`;
    if (bad) t += ` ${bad} result${bad > 1 ? 's aren’t numbers' : ' isn’t a number'} and ${bad > 1 ? 'are' : 'is'} left out.`;
    els.runNote.textContent = t;
  }

  // ---- axis ----
  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function axis(lo, hi, target) {
    if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep(hi - lo, target || 6);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = a; t <= b + step / 2; t += step) ticks.push(+t.toPrecision(12));
    return { min: a, max: b, ticks };
  }
  const charW = size => size * 0.56;
  const f1 = v => Math.round(v * 10) / 10;
  function svgOpen(W, H, o) {
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (o.title) s.push(`<text x="16" y="30" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(80, Math.floor((W - (16) - 16) / 11.2))))}</text>`);
    return s;
  }
  function legend(s, items, right, y) {
    const keyW = t => 28 + charW(12) * t.length + 18;
    let lx = right - items.reduce((a, [, t]) => a + keyW(t), 0);
    items.forEach(([draw, t]) => {
      s.push(draw(lx + 10, y));
      s.push(`<text x="${lx + 24}" y="${y + 4}" font-size="12" fill="${COLORS.muted}">${esc(t)}</text>`);
      lx += keyW(t);
    });
  }

  // ---- Pareto chart of the coded coefficients ----
  function paretoSVG(o) {
    const { m, rows, alpha } = current;
    const terms = rows.filter(r => r.key).slice().sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
    const W = drawW, MR = 64, M = 16;
    const labels = terms.map(r => `${r.key}  ${trunc(termName(r.key), 52)}`);
    const ML = Math.min(440, Math.max(110, 24 + charW(13) * Math.max(...labels.map(l => l.length))));
    const MT = (o.title ? 44 : 8) + 34, barH = 30, gap = 10;
    const plotH = terms.length * (barH + gap) + gap, H = MT + plotH + 52;
    // with a balanced design every term has the same standard error, so one line marks significance
    const ses = terms.map(r => r.se).filter(isFinite);
    const sameSE = m.testable && ses.length && Math.max(...ses) - Math.min(...ses) < 1e-9 * Math.max(...ses);
    const crit = sameSE ? tCrit(m.df, alpha) * ses[0] : null;
    const ax = axis(0, Math.max(crit || 0, ...terms.map(r => Math.abs(r.coef))) || 1);
    const x = v => ML + v / ax.max * (W - ML - MR);
    const s = svgOpen(W, H, o);
    const items = m.testable
      ? [[(cx, cy) => `<rect x="${cx - 8}" y="${cy - 6}" width="16" height="12" fill="${COLORS.sig}"/>`, 'Clear effect'], [(cx, cy) => `<rect x="${cx - 8}" y="${cy - 6}" width="16" height="12" fill="${COLORS.insig}"/>`, 'Could be chance']]
      : [[(cx, cy) => `<rect x="${cx - 8}" y="${cy - 6}" width="16" height="12" fill="${COLORS.insig}"/>`, 'Size of effect (no p-values without spare runs)']];
    if (crit) items.push([(cx, cy) => `<line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="${COLORS.ref}" stroke-width="2" stroke-dasharray="4 3"/>`, 'Significance threshold']);
    legend(s, items, W - MR, MT - 18);
    ax.ticks.forEach(t => {
      const xx = f1(x(t));
      s.push(`<line x1="${xx}" y1="${MT}" x2="${xx}" y2="${MT + plotH}" stroke="${COLORS.grid}"/>`);
      s.push(`<text x="${xx}" y="${MT + plotH + 18}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(nf.format(t))}</text>`);
    });
    s.push(`<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="${COLORS.axis}"/>`);
    s.push(`<text x="${(ML + W - MR) / 2}" y="${MT + plotH + 42}" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">Size of coded coefficient (half the effect), ignoring its sign</text>`);
    terms.forEach((r, i) => {
      const y = MT + gap + i * (barH + gap), v = Math.abs(r.coef);
      const sig = m.testable && r.p < alpha;
      const tip = `${termName(r.key)}: coded coefficient ${nf4.format(r.coef)}, effect ${nf4.format(2 * r.coef)}${m.testable ? ', ' + pIs(r.p) : ''}`;
      s.push(`<g><title>${esc(tip)}</title><rect x="${ML}" y="${y}" width="${f1(Math.max(1, x(v) - ML))}" height="${barH}" fill="${sig ? COLORS.sig : COLORS.insig}"/>`);
      s.push(`<text x="${f1(x(v) + 6)}" y="${y + barH / 2 + 4}" font-size="12" fill="${COLORS.ink}">${esc(nf4.format(v))}</text></g>`);
      s.push(`<text x="${ML - 8}" y="${y + barH / 2 + 4}" font-size="13" text-anchor="end" fill="${COLORS.ink}"><tspan font-weight="700">${r.key}</tspan>  ${esc(trunc(termName(r.key), 52))}</text>`);
    });
    if (crit) {
      const xx = f1(x(crit));
      s.push(`<line x1="${xx}" y1="${MT}" x2="${xx}" y2="${MT + plotH}" stroke="${COLORS.ref}" stroke-width="2" stroke-dasharray="6 4"><title>Bars past this line are clear effects at the ${Math.round(alpha * 100)}% level: ${esc(nf4.format(crit))}</title></line>`);
    }
    s.push('</svg>');
    return s.join('');
  }

  // ---- main effects plot ----
  function mainSVG(o) {
    const { m } = current, k = state.k;
    const W = drawW, MR = 20, ML = 82, gapX = 26;
    const MT = (o.title ? 44 : 8) + 34, plotH = 300, H = MT + plotH + 70;
    const pw = (W - ML - MR - gapX * (k - 1)) / k;
    const means = [];
    for (let j = 0; j < k; j++) means.push([-1, 1].map(v => fittedMean(m, { [j]: v })));
    const ax = axis(Math.min(m.mean, ...means.flat()), Math.max(m.mean, ...means.flat()), 5);
    const y = v => MT + plotH - (v - ax.min) / (ax.max - ax.min) * plotH;
    const s = svgOpen(W, H, o);
    legend(s, [
      [(cx, cy) => `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 9}" y2="${cy}" stroke="${COLORS.sig}" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="${COLORS.sig}"/>`, 'Fitted average'],
      [(cx, cy) => `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 9}" y2="${cy}" stroke="${COLORS.mean}" stroke-width="1.5" stroke-dasharray="5 3"/>`, 'Overall average']
    ], W - MR, MT - 18);
    ax.ticks.forEach(t => s.push(`<text x="${ML - 8}" y="${f1(y(t)) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(nf.format(t))}</text>`));
    s.push(`<text transform="translate(${24} ${MT + plotH / 2}) rotate(-90)" font-size="13" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(respName(), 48))}</text>`);
    for (let j = 0; j < k; j++) {
      const x0 = ML + j * (pw + gapX), xa = x0 + pw * 0.22, xb = x0 + pw * 0.78;
      const inModel = state.terms.includes(LETTERS[j]);
      s.push(`<rect x="${f1(x0)}" y="${MT}" width="${f1(pw)}" height="${plotH}" fill="none" stroke="${COLORS.axis}"/>`);
      ax.ticks.forEach(t => s.push(`<line x1="${f1(x0)}" y1="${f1(y(t))}" x2="${f1(x0 + pw)}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`));
      s.push(`<line x1="${f1(x0)}" y1="${f1(y(m.mean))}" x2="${f1(x0 + pw)}" y2="${f1(y(m.mean))}" stroke="${COLORS.mean}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
      const [a, b] = means[j];
      s.push(`<g><title>${esc(`${fName(j)}: ${lvl(j, -1)} ${nf.format(a)}, ${lvl(j, 1)} ${nf.format(b)}${inModel ? '' : ' (not in the model)'}`)}</title>`);
      s.push(`<line x1="${f1(xa)}" y1="${f1(y(a))}" x2="${f1(xb)}" y2="${f1(y(b))}" stroke="${inModel ? COLORS.sig : COLORS.insig}" stroke-width="2.5"/>`);
      [[xa, a], [xb, b]].forEach(([xx, v]) => s.push(`<circle cx="${f1(xx)}" cy="${f1(y(v))}" r="6" fill="${inModel ? COLORS.sig : COLORS.insig}" stroke="#fff" stroke-width="1.5"/>`));
      s.push('</g>');
      const maxCh = Math.max(4, Math.floor(pw * 0.5 / charW(12)));
      s.push(`<text x="${f1(xa)}" y="${MT + plotH + 18}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(trunc(lvl(j, -1), maxCh))}</text>`);
      s.push(`<text x="${f1(xb)}" y="${MT + plotH + 18}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(trunc(lvl(j, 1), maxCh))}</text>`);
      s.push(`<text x="${f1(x0 + pw / 2)}" y="${MT + plotH + 40}" font-size="13" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${LETTERS[j]}: ${esc(trunc(fName(j), Math.max(4, Math.floor(pw / charW(13)) - 3)))}</text>`);
      if (!inModel) s.push(`<text x="${f1(x0 + pw / 2)}" y="${MT + plotH + 58}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">Not in the model</text>`);
    }
    s.push('</svg>');
    return s.join('');
  }

  // ---- interaction plots: one panel for each pair of factors ----
  function interSVG(o) {
    const { m } = current, k = state.k;
    const pairs = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairs.push([i, j]);
    const cols = Math.min(3, pairs.length), rowsN = Math.ceil(pairs.length / cols);
    const W = drawW, M = 16, gapX = 70, gapY = 40;
    const MT = (o.title ? 44 : 8) + 8, ML = 70, MR = 20;
    const pw = (W - ML - MR - gapX * (cols - 1)) / cols, ph = 230, head = 58, foot = 46;
    const H = MT + rowsN * (head + ph + foot) + (rowsN - 1) * gapY + M;
    const vals = [];
    const cell = pairs.map(([i, j]) => [-1, 1].map(vj => [-1, 1].map(vi => { const v = fittedMean(m, { [i]: vi, [j]: vj }); vals.push(v); return v; })));
    const ax = axis(Math.min(...vals), Math.max(...vals), 4);
    const s = svgOpen(W, H, o);
    pairs.forEach(([i, j], n) => {
      const c = n % cols, r = Math.floor(n / cols);
      const x0 = ML + c * (pw + gapX), y0 = MT + r * (head + ph + foot + gapY) + head;
      const y = v => y0 + ph - (v - ax.min) / (ax.max - ax.min) * ph;
      const xa = x0 + pw * 0.2, xb = x0 + pw * 0.8;
      const key = LETTERS[i] + LETTERS[j], inModel = state.terms.includes(key);
      const maxCh = Math.floor(pw / charW(13));
      s.push(`<text x="${f1(x0)}" y="${y0 - 38}" font-size="13" font-weight="700" fill="${COLORS.ink}">${key} interaction<title>${esc(`${fName(i)} × ${fName(j)}`)}</title></text>`);
      const kw = Math.floor((pw / 2 - 28) / charW(12));
      [[-1, COLORS.lo, ''], [1, COLORS.hi, '6 4']].forEach(([vj, col, dash], q) => {
        const lx = x0 + q * pw / 2;
        s.push(`<line x1="${f1(lx)}" y1="${y0 - 18}" x2="${f1(lx + 18)}" y2="${y0 - 18}" stroke="${col}" stroke-width="2.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
        s.push(`<text x="${f1(lx + 24)}" y="${y0 - 14}" font-size="12" fill="${COLORS.muted}">${esc(trunc(`${LETTERS[j]} ${lvl(j, vj)}`, kw))}</text>`);
      });
      s.push(`<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(pw)}" height="${ph}" fill="none" stroke="${COLORS.axis}"/>`);
      ax.ticks.forEach(t => {
        s.push(`<line x1="${f1(x0)}" y1="${f1(y(t))}" x2="${f1(x0 + pw)}" y2="${f1(y(t))}" stroke="${COLORS.grid}"/>`);
        s.push(`<text x="${f1(x0 - 6)}" y="${f1(y(t)) + 4}" font-size="11" text-anchor="end" fill="${COLORS.muted}">${esc(nf.format(t))}</text>`);
      });
      [[-1, COLORS.lo, ''], [1, COLORS.hi, '6 4']].forEach(([vj, col, dash], q) => {
        const [a, b] = cell[n][q];
        s.push(`<g><title>${esc(`${fName(j)} ${lvl(j, vj)}: ${fName(i)} ${lvl(i, -1)} ${nf.format(a)}, ${lvl(i, 1)} ${nf.format(b)}`)}</title>`);
        s.push(`<line x1="${f1(xa)}" y1="${f1(y(a))}" x2="${f1(xb)}" y2="${f1(y(b))}" stroke="${col}" stroke-width="2.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
        [[xa, a], [xb, b]].forEach(([xx, v]) => s.push(q ? `<rect x="${f1(xx - 5)}" y="${f1(y(v) - 5)}" width="10" height="10" fill="${col}"/>` : `<circle cx="${f1(xx)}" cy="${f1(y(v))}" r="5.5" fill="${col}"/>`));
        s.push('</g>');
      });
      const lc = Math.max(4, Math.floor(pw * 0.45 / charW(12)));
      s.push(`<text x="${f1(xa)}" y="${f1(y0 + ph + 17)}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(trunc(lvl(i, -1), lc))}</text>`);
      s.push(`<text x="${f1(xb)}" y="${f1(y0 + ph + 17)}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${esc(trunc(lvl(i, 1), lc))}</text>`);
      s.push(`<text x="${f1(x0 + pw / 2)}" y="${f1(y0 + ph + 36)}" font-size="12" font-weight="600" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(`${LETTERS[i]}: ${fName(i)}`, maxCh))}${inModel ? '' : ` <tspan font-weight="400" fill="${COLORS.muted}">(not in model)</tspan>`}</text>`);
    });
    s.push('</svg>');
    return s.join('');
  }

  // ---- plain-language reading ----
  function readingParts() {
    const { m, rows, alpha, unc, best } = current;
    const paras = [];
    const resp = esc(lower(respName()));
    const v = x => nf.format(x);
    const terms = rows.filter(r => r.key);
    const coefOf = key => { const r = rows.find(q => q.key === key); return r ? r.coef : 0; };
    const sig = r => m.testable && r.p < alpha;

    if (!terms.length) {
      paras.push(`The model has no terms, so it just predicts the overall average, ${v(m.mean)}. Tick some terms on the left to see their effects.`);
      return paras;
    }
    if (!m.testable) {
      paras.push(m.df === 0
        ? `<b>There are no spare runs to measure noise</b>, so the tool can’t tell which effects are real. The model has ${m.p} terms (including the overall average) and there are ${m.n} results. Take out the terms least likely to matter, usually the highest-order interactions, or use <b>Reduce the model for me</b>. Adding a replicate also helps.`
        : 'Every result is exactly what the model predicts, so there is no noise left to test the effects against. Check the results have been entered correctly.');
    }
    const mains = terms.filter(r => r.key.length === 1);
    const inters = terms.filter(r => r.key.length > 1);
    mains.slice().sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef)).forEach(r => {
      const j = idx(r.key)[0], eff = 2 * r.coef;
      const dir = eff > 0 ? 'raises' : 'lowers';
      const clear = m.testable ? (sig(r) ? ` This is a clear effect (${pIs(r.p)}).` : ` This could be chance (${pIs(r.p)}).`) : '';
      paras.push(`Moving <b>${esc(fName(j))}</b> from ${esc(lvl(j, -1))} to ${esc(lvl(j, 1))} ${Math.abs(eff) < 1e-12 ? 'makes no difference to' : `${dir}`} ${resp}${Math.abs(eff) < 1e-12 ? '' : ` by ${v(Math.abs(eff))} on average`}.${clear}`);
    });
    inters.filter(r => !m.testable || sig(r)).forEach(r => {
      const ix = idx(r.key);
      if (ix.length === 2) {
        const [i, j] = ix, a = coefOf(LETTERS[i]), ab = r.coef;
        const by = e => Math.abs(e) < 1e-12 ? 'makes no difference to ' + resp : `${e > 0 ? 'raises' : 'lowers'} ${resp} by ${v(Math.abs(e))}`;
        paras.push(`<b>The effect of ${esc(fName(i))} depends on ${esc(fName(j))}</b>${m.testable ? ` (${pIs(r.p)})` : ''}. With ${esc(fName(j))} at ${esc(lvl(j, -1))}, moving ${esc(fName(i))} from ${esc(lvl(i, -1))} to ${esc(lvl(i, 1))} ${by(2 * (a - ab))}; with ${esc(fName(j))} at ${esc(lvl(j, 1))}, it ${by(2 * (a + ab))}. The interactions chart shows this as lines that aren’t parallel.`);
      } else {
        paras.push(`<b>${esc(termName(r.key))}</b> interact${m.testable ? ` (${pIs(r.p)})` : ''}: how two of them work together depends on the setting of the other${ix.length > 3 ? 's' : ''}. Look at the interactions chart and the predictions below to understand it before acting on the separate effects.`);
      }
    });
    if (m.testable) {
      const noisy = inters.filter(r => !sig(r));
      if (noisy.length) paras.push(`${noisy.length === 1 ? 'The interaction' : 'The interactions'} ${list(noisy.map(r => esc(termName(r.key))))} could be chance. You could take ${noisy.length === 1 ? 'it' : 'them'} out of the model to simplify it.`);
    }

    if (best) {
      const inModel = j => state.terms.some(t => t.includes(LETTERS[j]));
      const set = best.x.map((x, j) => inModel(j) ? `${esc(fName(j))} at <b>${esc(lvl(j, x))}</b>` : null).filter(Boolean);
      const free = best.x.map((x, j) => inModel(j) ? null : esc(fName(j))).filter(Boolean);
      paras.push(`The model predicts the ${state.goal === 'min' ? 'lowest' : 'highest'} ${resp}, <b>${v(best.y)}</b>, with ${list(set)}.${free.length ? ` ${list(free)} ${free.length > 1 ? 'aren’t' : 'isn’t'} in the model, so ${free.length > 1 ? 'their settings make' : 'its setting makes'} no difference here: choose whichever is easier or cheaper.` : ''} Confirm it with a few runs at these settings before making the change.`);
    }

    if (isFinite(m.r2)) paras.push(`The model explains ${Math.round(m.r2 * 100)}% of the variation in the results${isFinite(m.r2adj) ? ` (${Math.round(m.r2adj * 100)}% once adjusted for the number of terms)` : ''}.${isFinite(m.s) ? ` A typical result is about ${v(m.s)} away from what the model predicts.` : ''}`);
    const missing = runsN() - m.n;
    if (missing > 0) paras.push(`${missing} run${missing > 1 ? 's have' : ' has'} no result yet, so the analysis uses the other ${m.n}. Fill in the rest for the full picture.`);
    if (unc && state.factors.slice(0, state.k).some(f => f.type === 'numeric')) paras.push('Predictions between the low and high settings of a numeric factor assume a straight line. A factorial experiment can’t check that, so test any in-between setting before relying on it.');
    return paras;
  }
  function equationText(plain) {
    const { unc } = current;
    const nm = key => key.split('').map(c => fName(LETTERS.indexOf(c))).join(' × ');
    let t = `${respName()} = ${nf4.format(unc[''])}`;
    allTerms(state.k).filter(key => state.terms.includes(key)).forEach(key => {
      const c = unc[key];
      t += ` ${c < 0 ? '−' : '+'} ${nf4.format(Math.abs(c))} × ${nm(key)}`;
    });
    return plain ? t : esc(t);
  }
  function summaryText() {
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const lines = [state.title.trim() || 'Designed experiment', ''];
    readingParts().forEach(p => lines.push(strip(p), ''));
    lines.push('Prediction equation: ' + equationText(true));
    return lines.join('\n').trim();
  }

  // ---- tables ----
  const r6 = x => isFinite(x) ? +x.toPrecision(8) : '';
  const pcsv = p => p == null ? '' : p < 0.0001 ? '<0.0001' : Math.round(p * 1e4) / 1e4;
  function tableRows() {
    const { m, rows, unc, alpha } = current;
    const runOf = {}; state.runOrder.forEach((s, i) => { runOf[s] = i + 1; });
    const out = [['Run order', 'Standard order', ...Array.from({ length: state.k }, (_, j) => fName(j)), respName()]];
    state.runOrder.forEach(s => out.push([runOf[s], s, ...codedOf(s).map((x, j) => lvl(j, x)), state.y[s] == null ? '' : state.y[s]]));
    out.push([], ['Term', 'Effect (low to high)', 'Coded coefficient', 'Uncoded coefficient', 'Standard error', 'p-value', 'Clear effect']);
    rows.forEach(r => out.push([r.key ? `${r.key}: ${termName(r.key)}` : 'Constant', r.key ? r6(2 * r.coef) : '', r6(r.coef), r6(unc[r.key]), r6(r.se), pcsv(r.p), r.key && m.testable ? (r.p < alpha ? 'Yes' : 'No') : '']));
    out.push([], ['Model summary', ''], ['s', r6(m.s)], ['R-squared', r6(m.r2)], ['Adjusted R-squared', r6(m.r2adj)], ['Residual degrees of freedom', m.df], ['Runs analysed', m.n]);
    out.push([], ['Prediction equation', equationText(true)]);
    return out;
  }
  function tableHTML() {
    const { m, rows, unc, alpha } = current;
    let h = '<div class="tablewrap"><h3>Model coefficients</h3><table><caption class="sr">Effect, coefficients and p-value of each term in the model</caption><thead><tr>';
    h += '<th>Term</th>' + ['Effect (low to high)', 'Coded coefficient', 'Uncoded coefficient', 'p-value'].map(t => `<th class="num">${t}</th>`).join('') + '<th>Clear effect?</th></tr></thead><tbody>';
    rows.forEach(r => {
      const yes = r.key && m.testable && r.p < alpha;
      h += `<tr><td>${r.key ? `<b>${r.key}</b> ${esc(termName(r.key))}` : 'Constant (overall average)'}</td><td class="num">${r.key ? nf4.format(2 * r.coef) : ''}</td><td class="num">${nf4.format(r.coef)}</td><td class="num">${nf4.format(unc[r.key])}</td><td class="num">${r.key ? pf(r.p) : ''}</td><td class="${yes ? 'yes' : ''}">${r.key ? (m.testable ? (yes ? 'Yes' : 'No') : '–') : ''}</td></tr>`;
    });
    h += '</tbody></table>';
    h += `<p class="hint">Coded coefficients use −1 for each factor’s low setting and +1 for its high setting, so they can be compared with each other. ${state.factors.slice(0, state.k).some(f => f.type === 'numeric') ? 'Uncoded coefficients use the real values of numeric factors; text factors stay coded.' : 'With no numeric factors, the uncoded coefficients are the same as the coded ones.'}</p></div>`;
    h += `<div class="tablewrap"><h3>Prediction equation</h3><p class="equation">${equationText()}</p>`;
    const text = state.factors.slice(0, state.k).map((f, j) => f.type === 'text' ? `${esc(fName(j))} is −1 for ${esc(lvl(j, -1))} and +1 for ${esc(lvl(j, 1))}` : null).filter(Boolean);
    h += `<p class="hint">${text.length ? `In the equation, ${list(text)}.` : 'Put the real values of each factor into the equation.'}</p></div>`;
    return h;
  }

  // ---- predict at chosen settings ----
  function whatIfHTML() {
    let h = '<div class="reading"><h3>Predict a result</h3><p class="hint">Choose a setting for each factor to see what the model predicts.</p><div class="whatif">';
    for (let j = 0; j < state.k; j++) {
      const f = state.factors[j], id = 'wi' + j;
      if (f.type === 'numeric') {
        if (!isFinite(num(state.whatIf[j]))) state.whatIf[j] = f.low;
        h += `<div><label for="${id}">${esc(fName(j))}</label><input type="number" step="any" id="${id}" data-wi="${j}" value="${esc(state.whatIf[j])}"></div>`;
      } else {
        if (state.whatIf[j] !== -1 && state.whatIf[j] !== 1) state.whatIf[j] = -1;
        h += `<div><label for="${id}">${esc(fName(j))}</label><select id="${id}" data-wi="${j}"><option value="-1"${state.whatIf[j] === -1 ? ' selected' : ''}>${esc(lvl(j, -1))}</option><option value="1"${state.whatIf[j] === 1 ? ' selected' : ''}>${esc(lvl(j, 1))}</option></select></div>`;
      }
    }
    return h + '</div><p class="predout" id="predOut" aria-live="polite"></p></div>';
  }
  function updatePrediction() {
    const out = $('predOut'); if (!out || !current) return;
    const x = [], outside = [];
    for (let j = 0; j < state.k; j++) {
      const f = state.factors[j];
      if (f.type === 'numeric') {
        const a = num(f.low), b = num(f.high), v = num(state.whatIf[j]);
        if (!isFinite(v)) { out.textContent = 'Enter a value for every numeric factor.'; return; }
        x.push((v - (a + b) / 2) / ((b - a) / 2));
        if (v < Math.min(a, b) || v > Math.max(a, b)) outside.push(fName(j));
      } else x.push(+state.whatIf[j]);
    }
    out.innerHTML = `Predicted ${esc(lower(respName()))}: <strong>${esc(nf.format(predict(current.m, x)))}</strong>` +
      (outside.length ? `<br><span class="hint">${esc(list(outside))} ${outside.length > 1 ? 'are' : 'is'} outside the range you tested, so this is a guess.</span>` : '');
  }

  // ---- render ----
  function update() {
    current = null;
    const probs = factorProblems();
    const obs = observations();
    if (probs.length) { renderTerms(); return renderEmpty(`Check the settings for ${list(probs.map(p => 'factor ' + LETTERS[p.j]))} on the left.`); }
    if (!obs.length) { renderTerms(); return renderEmpty('Enter the result of each run in the table above to analyse your experiment.'); }
    const terms = allTerms(state.k).filter(t => state.terms.includes(t));
    const m = fit(obs, terms);
    if (m.error === 'few') { renderTerms(); return renderEmpty(`There ${m.n === 1 ? 'is 1 result' : `are ${m.n} results`} so far, but the model has ${m.p} terms, counting the overall average. Enter more results, or take terms out of the model.`); }
    if (m.error === 'singular') { renderTerms(); return renderEmpty('Some terms can’t be worked out because the runs that separate them have no result. Fill in the missing runs, or take those terms out of the model.'); }

    const alpha = +state.alpha;
    const rows = m.cols.map((key, i) => ({ key, coef: m.coef[i], se: m.se[i], p: m.pv[i] }));
    current = { m, rows, alpha };
    current.unc = uncoded(m);
    current.best = null;
    if (state.goal !== 'none' && terms.length) {
      corners(state.k).forEach(x => {
        const yv = predict(m, x);
        if (!current.best || (state.goal === 'min' ? yv < current.best.y - 1e-9 : yv > current.best.y + 1e-9)) current.best = { x, y: yv };
      });
    }
    renderTerms();
    trackChart({ points: obs.length });

    const title = state.title.trim();
    if (!CHARTS[state.chartType]) state.chartType = 'pareto';
    const sigTerms = rows.filter(r => r.key && m.testable && r.p < alpha).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
    const o = { title };
    o.aria = (title ? title + '. ' : '') + `${CHARTS[state.chartType]} for a ${state.k}-factor experiment on ${respName()}. ` +
      (m.testable ? (sigTerms.length ? `Clear effects: ${sigTerms.map(r => termName(r.key)).join('; ')}.` : 'No clear effects.') : 'No p-values: no spare runs to measure noise.');
    const svg = drawShown(() => !terms.length ? null : state.chartType === 'main' ? mainSVG(o) : state.chartType === 'inter' ? interSVG(o) : paretoSVG(o));

    let headline;
    if (!terms.length) headline = 'The model has no terms';
    else if (!m.testable) headline = `Biggest effect: <strong>${esc(termName(rows.filter(r => r.key).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef))[0].key))}</strong>`;
    else if (sigTerms.length) {
      const names = sigTerms.slice(0, 3).map(r => `<strong>${esc(termName(r.key))}</strong>`);
      headline = `${list(names)}${sigTerms.length > 3 ? ` and ${sigTerms.length - 3} more` : ''} make${sigTerms.length === 1 ? 's' : ''} a clear difference`;
    } else headline = 'No factor makes a clear difference';
    const sub = `${state.k}-factor, two-level experiment: ${m.n} of ${runsN()} runs analysed, ${terms.length} term${terms.length === 1 ? '' : 's'} in the model, at the ${Math.round(alpha * 100)}% significance level.`;
    const legendNote = {
      pareto: 'Each bar is the size of a term’s coded coefficient: half the change in the result when the factor goes from low to high. Longer bars matter more.',
      main: 'Each panel shows the fitted average result at a factor’s low and high setting. The steeper the line, the bigger the effect.',
      inter: 'Each panel shows how the effect of one factor changes with the setting of another. Lines that aren’t parallel mean the two interact.'
    }[state.chartType];

    els.result.innerHTML = `
      <p class="summary">${headline}</p>
      <p class="focuson">${esc(sub)}</p>
      <div class="stats">
        <div class="stat"><b>${isFinite(m.r2) ? Math.round(m.r2 * 100) + '%' : '–'}</b><span>R², variation explained</span></div>
        <div class="stat"><b>${isFinite(m.r2adj) ? Math.round(m.r2adj * 100) + '%' : '–'}</b><span>Adjusted R²</span></div>
        <div class="stat"><b>${isFinite(m.s) ? nf4.format(m.s) : '–'}</b><span>s, typical noise</span></div>
        <div class="stat"><b>${m.df}</b><span>Spare runs (degrees of freedom)</span></div>
      </div>
      ${svg ? `<div class="chartbar"><div class="block"><label for="chartType">Chart</label><select id="chartType">${Object.keys(CHARTS).map(c => `<option value="${c}"${c === state.chartType ? ' selected' : ''}>${CHARTS[c]}</option>`).join('')}</select></div></div>
      <div class="chartwrap fit" id="chart">${svg}</div>
      <p class="legend-note">${legendNote} Hover over the chart to see the figures.</p>` : ''}
      <div class="reading"><h3>What the experiment shows</h3>${readingParts().map(x => `<p>${x}</p>`).join('')}</div>
      ${tableHTML()}
      ${whatIfHTML()}`;
    updatePrediction();
  }
  function renderEmpty(msg) {
    current = null;
    els.result.innerHTML = `<div class="empty"><p>${esc(msg)}</p><button type="button" class="primary" data-act="example">Try the example</button></div>`;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 180); }
  function renderAll() { syncInputs(); renderFactors(); renderRuns(); update(); }

  // A new design: new run order and every term in the model.
  function redesign() {
    state.runOrder = shuffled(runsN());
    state.terms = allTerms(state.k);
    state.whatIf = {};
  }
  const hasResults = () => Object.keys(state.y).some(s => String(state.y[s]).trim() !== '');

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
  function fileName() { return slug(state.title.trim() || state.response.trim()); }
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
    const needChart = ['png', 'svg', 'copyimg'].includes(a);
    if (needChart && !svgEl()) return status('Put some terms in the model to draw a chart.');
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
    state = Object.assign(fresh(), JSON.parse(JSON.stringify(EXAMPLE)));
    state.terms = allTerms(state.k);
    renderAll();
  }
  function restore(x) {
    const s = fresh();
    if (x && typeof x === 'object') {
      s.k = [2, 3, 4].includes(+x.k) ? +x.k : 2;
      s.reps = [1, 2, 3, 4].includes(+x.reps) ? +x.reps : 2;
      if (Array.isArray(x.factors)) x.factors.slice(0, 4).forEach((f, j) => {
        if (f && typeof f === 'object') s.factors[j] = { name: String(f.name || ''), type: f.type === 'numeric' ? 'numeric' : 'text', low: String(f.low == null ? '' : f.low), high: String(f.high == null ? '' : f.high) };
      });
      ['response', 'title'].forEach(key => { if (typeof x[key] === 'string') s[key] = x[key]; });
      if (['min', 'max', 'none'].includes(x.goal)) s.goal = x.goal;
      if (['0.05', '0.01', '0.1'].includes(String(x.alpha))) s.alpha = String(x.alpha);
      if (['run', 'std'].includes(x.view)) s.view = x.view;
      if (CHARTS[x.chartType]) s.chartType = x.chartType;
      const N = (1 << s.k) * s.reps;
      const ro = Array.isArray(x.runOrder) ? x.runOrder.map(Number) : [];
      s.runOrder = ro.length === N && new Set(ro).size === N && ro.every(v => v >= 1 && v <= N) ? ro : shuffled(N);
      if (x.y && typeof x.y === 'object') Object.keys(x.y).forEach(k => { if (+k >= 1 && +k <= N) s.y[k] = String(x.y[k]); });
      const all = allTerms(s.k);
      s.terms = Array.isArray(x.terms) ? all.filter(t => x.terms.includes(t)) : all;
      if (x.whatIf && typeof x.whatIf === 'object') s.whatIf = Object.assign({}, x.whatIf);
    } else {
      s.runOrder = shuffled((1 << s.k) * s.reps);
      s.terms = allTerms(s.k);
    }
    state = s;
    // a hand-edited file could break the hierarchy; put back what each term needs
    state.terms.slice().forEach(include);
  }

  // ---- events ----
  els.nFactors.addEventListener('change', () => {
    const k = +els.nFactors.value;
    if (k === state.k) return;
    if (hasResults() && !confirm('Changing the number of factors makes a new design and clears the results you’ve entered. Carry on?')) { els.nFactors.value = String(state.k); return; }
    state.k = k; state.y = {};
    redesign(); renderFactors(); renderRuns(); update();
  });
  els.reps.addEventListener('change', () => {
    const reps = +els.reps.value, N = (1 << state.k) * reps;
    if (reps === state.reps) return;
    const lost = Object.keys(state.y).filter(s => +s > N && String(state.y[s]).trim() !== '').length;
    if (lost && !confirm(`Fewer replicates means ${lost} result${lost > 1 ? 's' : ''} will be removed. Carry on?`)) { els.reps.value = String(state.reps); return; }
    Object.keys(state.y).forEach(s => { if (+s > N) delete state.y[s]; });
    state.reps = reps;
    state.runOrder = shuffled(N);
    renderRuns(); update();
  });
  els.factors.addEventListener('input', e => {
    const j = e.target.dataset.f, key = e.target.dataset.k;
    if (j == null || key === 'type') return;
    state.factors[+j][key] = e.target.value;
    showFactorProblems(); renderRuns(); schedule();
  });
  els.factors.addEventListener('change', e => {
    const j = e.target.dataset.f, key = e.target.dataset.k;
    if (j == null || key !== 'type') return;
    const f = state.factors[+j];
    f.type = e.target.value;
    // a text label can't be a number setting, so start numeric settings afresh
    if (f.type === 'numeric') { if (!isFinite(num(f.low))) f.low = ''; if (!isFinite(num(f.high))) f.high = ''; }
    delete state.whatIf[+j];
    renderFactors(); $('f' + j + 'type').focus(); renderRuns(); update();
  });
  els.respName.addEventListener('input', () => { state.response = els.respName.value; renderRuns(); schedule(); });
  els.goal.addEventListener('change', () => { state.goal = els.goal.value; update(); });
  els.alpha.addEventListener('change', () => { state.alpha = els.alpha.value; update(); });
  els.title.addEventListener('input', () => { state.title = els.title.value; schedule(); });
  els.view.addEventListener('change', () => { state.view = els.view.value; renderRuns(); });
  els.terms.addEventListener('change', e => {
    const key = e.target.dataset.term; if (!key) return;
    if (e.target.checked) include(key); else exclude(key);
    update();
  });
  trackSettings({ factors: 'nFactors', repeats: 'reps', goal: 'goal', alpha: 'alpha', runView: 'view', chartType: 'chartType' });
  $('reduceBtn').addEventListener('click', () => {
    if (!observations().length) return status('Enter some results first.');
    reduce(); update(); status('Model reduced to the terms that make a clear difference.');
  });
  $('allBtn').addEventListener('click', () => { state.terms = allTerms(state.k); update(); });
  $('shuffleBtn').addEventListener('click', () => {
    if (hasResults() && !confirm('Shuffle the order of the runs? Results you’ve entered stay with their settings.')) return;
    state.runOrder = shuffled(runsN()); renderRuns(); status('Run order shuffled.');
  });
  $('clearBtn').addEventListener('click', () => {
    if (hasResults() && !confirm('Clear your factors and results and start again?')) return;
    restore(null); renderAll(); trackCleared();
  });
  els.runs.addEventListener('input', e => {
    const s = e.target.dataset.std; if (!s) return;
    state.y[s] = e.target.value; noteRuns(); schedule();
  });
  // Pasting a column of results fills this run and the ones listed below it.
  els.runs.addEventListener('paste', e => {
    const s = e.target.dataset.std; if (!s) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const vals = text.split(/\r?\n/).map(l => l.split('\t').pop().trim());
    while (vals.length && vals[vals.length - 1] === '') vals.pop();
    if (vals.length < 2) return;
    e.preventDefault();
    const inputs = [...els.runs.querySelectorAll('input[data-std]')];
    const start = inputs.indexOf(e.target);
    vals.forEach((v, i) => { const inp = inputs[start + i]; if (inp) { inp.value = v; state.y[inp.dataset.std] = v; } });
    const extra = Math.max(0, vals.length - (inputs.length - start));
    noteRuns(); update();
    if (extra) status(`${extra} pasted value${extra > 1 ? 's' : ''} didn’t fit and ${extra > 1 ? 'were' : 'was'} left out.`);
  });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  els.result.addEventListener('change', e => {
    if (e.target.id === 'chartType') { state.chartType = e.target.value; update(); $('chartType').focus(); return; }
    const j = e.target.dataset && e.target.dataset.wi;
    if (j != null) { state.whatIf[j] = state.factors[+j].type === 'numeric' ? e.target.value : +e.target.value; updatePrediction(); }
  });
  els.result.addEventListener('input', e => {
    const j = e.target.dataset && e.target.dataset.wi;
    if (j != null && state.factors[+j].type === 'numeric') { state.whatIf[j] = e.target.value; updatePrediction(); }
  });

  restore(null);
  renderAll(); // start empty, ready for the user's experiment

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'design_of_experiments', toolName: 'designed experiment',
    example: loadExample, hasData: () => hasResults() || state.factors.some(f => f.name.trim()),
    fileName: () => fileName(),
    getExtra: () => JSON.parse(JSON.stringify(state)),
    setExtra: x => restore(x),
    afterOpen: () => renderAll(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

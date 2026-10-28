/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);

  /* ---------- the report's sections, from the A3 report template ---------- */
  const SECTIONS = [
    { id: 'current', head: 'II. Current state analysis', q: 'Where do things stand today, objectively?', g: 'Evidence that supports the problem statement, using baselined quantitative & qualitative data' },
    { id: 'targets', head: 'III. Setting targets and goals', q: 'What are we trying to accomplish, and how will we know that a change is an improvement?', g: 'Selecting measures to “prove the improvement”, including baseline and targets for each' },
    { id: 'gap', head: 'IV. Gap analysis', q: 'What are the root causes of the problem?', g: 'Understanding root causes of the gap between baseline and target' },
    { id: 'solutions', head: 'V. Identifying solutions', q: 'What is your proposal to reduce or eliminate root causes?', g: 'Having understood the problem and its root causes, identifying and prioritising potential solutions' },
    { id: 'testing', head: 'VI. Testing and implementing', q: 'What is the plan to test and evaluate the solution(s)? What evidence is going to be collected?', g: 'Utilising simple planning tools that outline actions, timeline and responsibilities; incl. for evaluation' },
    { id: 'sustain', head: 'VII. Evaluating and sustaining', q: 'What will be required to sustain the change? How do we share learning from this project?', g: 'Ensuring that processes and tools are put in place to sustain the change' }
  ];
  const BACKGROUND = { head: 'I. Background', stake: '“X” in this box if stakeholder engagement has been considered',
    q: 'Problem statement', g: 'A short, specific and evidence-based explanation of an issue or challenge that sums up what needs to change.' };
  const COLS = [['current', 'targets', 'gap'], ['solutions', 'testing', 'sustain']];
  // Drawing units are a quarter of a millimetre, so an A3 page is 1680 x 1188.
  const MM = 4, PT = 0.3528 * MM, EMU = 9000;
  const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
  const C = { frame: '#00359E', label: '#00338D', guide: '#44546A', ink: '#212B32', white: '#FFFFFF', line: '#C9D3E6' };
  const BODY_MAX = 14 * PT, BODY_MIN = 9 * PT, MIN_CHART = 0.6, SMALL_CHART = 0.35;
  const HS = 13 * PT, HEAD = HS * 1.75, B = 7, P = 10, CG = 14, LH = 1.25;

  /* ---------- page controls ---------- */
  const sec = id => SECTIONS.find(s => s.id === id);
  $('sections').innerHTML = SECTIONS.map(s =>
    '<div class="secfield">' +
      '<h3 id="h_' + s.id + '">' + s.head + '</h3>' +
      '<p class="q">' + s.q + '</p><p class="g">' + s.g + '</p>' +
      '<textarea id="text_' + s.id + '" aria-labelledby="h_' + s.id + '"></textarea>' +
    '</div>').join('');
  $('addTo').innerHTML = SECTIONS.map(s => '<option value="' + s.id + '"' + (s.id === 'gap' ? ' selected' : '') + '>' + s.head + '</option>').join('');
  const FIELDS = ['reportTitle', 'layout', 'showGuide', 'projectName', 'team', 'projectLead', 'stakeholder', 'problem'].concat(SECTIONS.map(s => 'text_' + s.id));

  let placed = []; // on the report: { uid, title, tool, src, raster, caption, section }
  let nextUid = 1;
  const esc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const val = id => $(id).value.trim();
  const RASTER = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

  /* ---------- making a chart's SVG safe to place ---------- */
  // Project files can come from anyone, so keep only drawing: no scripts,
  // event handlers, embedded pages or links out of the file.
  function cleanSvg(str) {
    let doc;
    try { doc = new DOMParser().parseFromString(String(str || ''), 'image/svg+xml'); } catch (e) { return null; }
    const root = doc.documentElement;
    if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
    root.querySelectorAll('script, foreignObject, iframe, object, embed, a').forEach(n => {
      if (n.localName === 'a') { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); }
      n.remove();
    });
    [root, ...root.querySelectorAll('*')].forEach(el => {
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase(), v = a.value.trim();
        if (n.startsWith('on')) el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'xlink:href') && !(v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);/i.test(v))) el.removeAttribute(a.name);
        else if (/javascript:/i.test(v)) el.removeAttribute(a.name);
      });
    });
    let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(isNaN) || vb[2] <= 0 || vb[3] <= 0) {
      const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
      if (!(w > 0 && h > 0)) return null;
      vb = [0, 0, w, h];
      root.setAttribute('viewBox', vb.join(' '));
    }
    return new XMLSerializer().serializeToString(root);
  }
  // Ready one chart to draw: give its ids a prefix so two charts can't clash.
  const prepared = new Map();
  function prepare(p) {
    if (prepared.has(p.uid)) return prepared.get(p.uid);
    const doc = new DOMParser().parseFromString(p.src, 'image/svg+xml');
    const root = doc.documentElement;
    const ids = [...root.querySelectorAll('[id]')].map(el => el.id);
    const pre = 'a3c' + p.uid + '-';
    if (ids.length) {
      const set = new Set(ids);
      [root, ...root.querySelectorAll('*')].forEach(el => {
        if (el.id && set.has(el.id)) el.id = pre + el.id;
        [...el.attributes].forEach(a => {
          if (a.name === 'id') return;
          const v = a.value.replace(/url\(\s*#([^)\s]+)\s*\)/g, (m, id) => set.has(id) ? 'url(#' + pre + id + ')' : m)
            .replace(/^#(.+)$/, (m, id) => (a.name === 'href' || a.name === 'xlink:href') && set.has(id) ? '#' + pre + id : m);
          if (v !== a.value) el.setAttribute(a.name, v);
        });
      });
    }
    const vb = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const keep = [...root.attributes].filter(a => !/^(width|height|x|y|viewBox|preserveAspectRatio|xmlns(:.*)?|version|style|class)$/.test(a.name))
      .map(a => ' ' + a.name + '="' + esc(a.value) + '"').join('');
    const inner = [...root.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    const r = { vb: vb.join(' '), aspect: vb[2] / vb[3], keep, inner };
    prepared.set(p.uid, r);
    return r;
  }
  function place(item, section) {
    const src = cleanSvg(item.svg);
    if (!src) return false;
    placed.push({ uid: nextUid++, title: String(item.title || 'Chart'), tool: String(item.tool || ''), src,
      raster: RASTER.test(item.raster || '') ? item.raster : '', caption: String(item.caption || ''),
      section: SECTIONS.some(s => s.id === section) ? section : 'gap' });
    return true;
  }
  // A picture from outside the tools is shown through a small SVG wrapper,
  // so it lays out like a chart, and kept as it is for PowerPoint.
  function pictureSvg(url, w, h) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"><image href="' + url + '" width="' + w + '" height="' + h + '"/></svg>';
  }

  /* ---------- measuring and wrapping text ---------- */
  const ctx = document.createElement('canvas').getContext('2d');
  function textWidth(t, size, bold, italic) { ctx.font = (italic ? 'italic ' : '') + (bold ? '700 ' : '400 ') + size + 'px ' + FONT; return ctx.measureText(t).width; }
  // Paragraphs of { lines, bullet, blankBefore } for text wrapped to width.
  function wrapParas(text, size, width, bold, italic, bullets) {
    const out = [];
    let blank = false;
    String(text || '').replace(/\r/g, '').split('\n').forEach(para => {
      if (!para.trim()) { if (out.length) blank = true; return; }
      const m = bullets ? para.match(/^\s*[-*•]\s+/) : null;
      const indent = m ? size * 1.1 : 0, avail = width - indent;
      const text = (m ? para.slice(m[0].length) : para).trim().replace(/\s+/g, ' ');
      const words = text.split(' ');
      const lines = [];
      let line = '';
      words.forEach(w => {
        // A word too long for the line is split across lines.
        while (textWidth(w, size, bold, italic) > avail && w.length > 1) {
          if (line) { lines.push(line); line = ''; }
          let n = w.length - 1;
          while (n > 1 && textWidth(w.slice(0, n), size, bold, italic) > avail) n--;
          lines.push(w.slice(0, n)); w = w.slice(n);
        }
        const tryLine = line ? line + ' ' + w : w;
        if (line && textWidth(tryLine, size, bold, italic) > avail) { lines.push(line); line = w; } else line = tryLine;
      });
      if (line) lines.push(line);
      out.push({ text, lines, bullet: !!m, indent, blankBefore: blank });
      blank = false;
    });
    return out;
  }
  // A block of text from specs { text, size, color, b, i, bullets, gap, align }.
  // Wraps a little short of the width, so PowerPoint's own wrapping fits too.
  function textBlock(specs, width) {
    const paras = [];
    let h = 0;
    specs.filter(s => s && String(s.text || '').trim()).forEach(s => {
      wrapParas(s.text, s.size, width * 0.97, s.b, s.i, s.bullets).forEach((p, n) => {
        const gap = (n === 0 && paras.length ? (s.gap || 0) : 0) + (p.blankBefore ? s.size * 0.45 : 0);
        paras.push(Object.assign(p, { size: s.size, color: s.color, b: !!s.b, i: !!s.i, align: s.align || 'l', gap }));
        h += gap + p.lines.length * s.size * LH;
      });
    });
    return { h, draw: (items, x, y) => { if (paras.length) items.push({ t: 'text', x, y, w: width, h, paras }); } };
  }
  const rect = (items, x, y, w, h, fill, stroke) => items.push({ t: 'rect', x, y, w, h, fill, stroke });
  // Where a field's box sits on the page, so it can be clicked to type into in full screen
  const hot = (items, x, y, w, h, field) => items.push({ t: 'hot', x, y, w, h, field });

  /* ---------- laying out the report ---------- */
  const guide = () => $('showGuide').checked;
  function headText(t, w) { return textBlock([{ text: t, size: HS, color: C.white, b: true }], w); }
  function bandBlock(w, f) {
    const inner = w - 2 * B, gapIn = 8, FP = 7;
    const sq = 34, labW = Math.max(150, inner * 0.17);
    const fw = (inner - labW - sq - 4 * gapIn) / 3;
    const fields = [['Project Name', 'projectName'], ['Team', 'team'], ['Project lead', 'projectLead']].map(([l, id]) =>
      textBlock([{ text: l, size: f * 0.85, color: C.label }, { text: val(id), size: f, color: C.ink, b: true, gap: 2 }], fw - 2 * FP));
    const stake = textBlock([{ text: BACKGROUND.stake, size: f * 0.8, color: C.label }], labW - 2 * FP);
    const rowH = Math.max(sq, ...fields.map(t => t.h + 2 * FP), stake.h + 2 * FP);
    const prob = textBlock([
      { text: BACKGROUND.q, size: f, color: C.label },
      guide() && { text: BACKGROUND.g, size: f * 0.92, color: C.guide, i: true },
      { text: val('problem'), size: f, color: C.ink, bullets: true, gap: f * 0.4 }], inner - 2 * P);
    const probH = Math.max(prob.h, f * LH * 2) + 2 * P;
    const h = HEAD + rowH + gapIn + probH + B;
    return { h, draw(items, x, y) {
      rect(items, x, y, w, h, C.frame);
      headText(BACKGROUND.head, w - 2 * B - 4).draw(items, x + B + 2, y + (HEAD - HS * LH) / 2 + 1);
      let fx = x + B, fy = y + HEAD;
      fields.forEach((t, i) => { rect(items, fx, fy, fw, rowH, C.white); hot(items, fx, fy, fw, rowH, ['projectName', 'team', 'projectLead'][i]); t.draw(items, fx + FP, fy + FP); fx += fw + gapIn; });
      rect(items, fx, fy, sq, rowH, C.white);
      if ($('stakeholder').checked) textBlock([{ text: 'X', size: Math.min(rowH, sq) * 0.6, color: C.label, b: true, align: 'c' }], sq).draw(items, fx, fy + (rowH - Math.min(rowH, sq) * 0.6 * LH) / 2);
      fx += sq + gapIn;
      rect(items, fx, fy, x + w - B - fx, rowH, C.white);
      stake.draw(items, fx + FP, fy + FP);
      fy += rowH + gapIn;
      rect(items, x + B, fy, inner, probH, C.white);
      hot(items, x + B, fy, inner, probH, 'problem');
      prob.draw(items, x + B + P, fy + P);
    } };
  }
  // One section at body size f: what is fixed (heading, text, captions) and
  // how tall its charts would be at full width. draw() lays it out with the
  // charts at k of that.
  function sectionBlock(id, w, f) {
    const s = sec(id), inner = w - 2 * B, cw = inner - 2 * P;
    const tb = textBlock([
      { text: s.q, size: f, color: C.label },
      guide() && { text: s.g, size: f * 0.92, color: C.guide, i: true },
      { text: $('text_' + id).value, size: f, color: C.ink, bullets: true, gap: f * 0.5 }], cw);
    const charts = placed.filter(p => p.section === id);
    const cols = charts.length > 1 ? 2 : 1, cellW = (cw - (cols - 1) * CG) / cols;
    const rows = [];
    for (let i = 0; i < charts.length; i += cols) {
      const cells = charts.slice(i, i + cols).map(p => ({ p, a: prepare(p), cap: textBlock([{ text: p.caption, size: f * 0.82, color: C.guide, align: 'c' }], cellW) }));
      rows.push({ cells, nat: Math.max(...cells.map(c => cellW / c.a.aspect)), capH: Math.max(0, ...cells.map(c => c.cap.h)) });
    }
    const fixed = HEAD + P + tb.h + (rows.length ? 12 : 0) +
      rows.reduce((t, r) => t + (r.capH ? r.capH + 5 : 0), 0) + Math.max(0, rows.length - 1) * CG + P + B;
    return { id, fixed, charts: rows.reduce((t, r) => t + r.nat, 0), draw(items, x, y, h, k) {
      rect(items, x, y, w, h, C.frame);
      headText(s.head, w - 2 * B - 4).draw(items, x + B + 2, y + (HEAD - HS * LH) / 2 + 1);
      rect(items, x + B, y + HEAD, inner, h - HEAD - B, C.white);
      hot(items, x, y, w, h, 'text_' + id);
      const cx0 = x + B + P;
      let cy = y + HEAD + P;
      tb.draw(items, cx0, cy);
      cy += tb.h + (rows.length ? 12 : 0);
      rows.forEach((r, ri) => {
        const rh = r.nat * k;
        // A row with fewer charts than columns is centred.
        const shift = (cols - r.cells.length) * (cellW + CG) / 2;
        r.cells.forEach((cell, ci) => {
          const cx = cx0 + shift + ci * (cellW + CG);
          const dw = Math.min(cellW, rh * cell.a.aspect), dh = dw / cell.a.aspect;
          items.push({ t: 'img', x: cx + (cellW - dw) / 2, y: cy, w: dw, h: dh, p: cell.p });
          cell.cap.draw(items, cx, cy + rh + 5);
        });
        cy += rh + (r.capH ? r.capH + 5 : 0) + (ri < rows.length - 1 ? CG : 0);
      });
    } };
  }
  function layout() {
    const portrait = $('layout').value === 'portrait';
    const W = (portrait ? 297 : 420) * MM, H = (portrait ? 420 : 297) * MM, M = 12 * MM, G = 3 * MM;
    const fullW = W - 2 * M, colW = (fullW - G) / 2;
    const title = textBlock([{ text: val('reportTitle') || 'A3 Report', size: 24 * PT, color: C.label, b: true }], fullW);
    const top = 9 * MM, bodyTop = top + title.h + 3 * MM;
    function tryFit(f) {
      const band = bandBlock(fullW, f);
      const CH = H - M - (bodyTop + band.h + G);
      const cols = COLS.map((ids, i) => {
        const secs = ids.map(id => sectionBlock(id, colW, f));
        const fixed = secs.reduce((t, s) => t + s.fixed, 0) + G * (secs.length - 1);
        const charts = secs.reduce((t, s) => t + s.charts, 0);
        const k = charts ? Math.max(0.15, Math.min(1, (CH - fixed) / charts)) : 1;
        return { i, x: M + i * (colW + G), ids, secs, fixed, charts, k };
      });
      return { f, band, CH, cols };
    }
    // Charts shrink before text does. The body text gets smaller only while
    // that lets the charts reach MIN_CHART of their full size, or come close
    // to the most that the smallest text would allow: shrinking the text for
    // a sliver of chart isn't worth it.
    const fits = r => r.band.h <= H && r.cols.every(c => c.fixed + c.charts * c.k <= r.CH + 0.5 && c.k >= target);
    const atMin = tryFit(BODY_MIN);
    const target = Math.min(MIN_CHART, ...atMin.cols.map(c => c.k * 0.9));
    let fit = null;
    for (let f = BODY_MAX; f > BODY_MIN + 0.01; f -= PT / 2) { const r = tryFit(f); if (fits(r)) { fit = r; break; } }
    fit = fit || atMin;
    const warnings = [];
    fit.cols.forEach(col => {
      const names = col.ids.map(id => sec(id).head).join(', ');
      if (fit.CH < 0 || col.fixed + col.charts * col.k > fit.CH + 0.5) warnings.push('The ' + (col.i ? 'right' : 'left') + ' column (' + names + ') doesn’t fit on the page. Shorten its text or move a chart or picture to another section.');
      else if (col.charts && col.k < SMALL_CHART) warnings.push('The charts in the ' + (col.i ? 'right' : 'left') + ' column (' + names + ') are shown small, so they may be hard to read. Shorten the text or move a chart to another section.');
    });
    const items = [];
    title.draw(items, M, top);
    hot(items, M, top, fullW, title.h, 'reportTitle');
    fit.band.draw(items, M, bodyTop, fullW);
    fit.cols.forEach(col => {
      const used = col.fixed + col.charts * col.k;
      const extra = Math.max(0, fit.CH - used) / col.secs.length;
      let y = bodyTop + fit.band.h + G;
      col.secs.forEach(s => {
        const h = s.fixed + s.charts * col.k + extra;
        s.draw(items, col.x, y, h, col.k);
        y += h + G;
      });
    });
    return { W, H, portrait, f: fit.f, items: items.filter(it => it.t !== 'hot'), hots: items.filter(it => it.t === 'hot'), warnings, title: val('reportTitle') || 'A3 Report' };
  }

  /* ---------- drawing the report as SVG ---------- */
  const n1 = v => (+v).toFixed(1);
  function toSvg(lay) {
    let s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + (lay.W / MM) + 'mm" height="' + (lay.H / MM) + 'mm" viewBox="0 0 ' + lay.W + ' ' + lay.H + '" font-family="' + esc(FONT) + '">';
    s += '<rect width="' + lay.W + '" height="' + lay.H + '" fill="#FFFFFF"/>';
    lay.items.forEach(it => {
      if (it.t === 'rect') s += '<rect x="' + n1(it.x) + '" y="' + n1(it.y) + '" width="' + n1(it.w) + '" height="' + n1(it.h) + '" fill="' + it.fill + '"' + (it.stroke ? ' stroke="' + it.stroke + '"' : '') + '/>';
      if (it.t === 'img') {
        const a = prepare(it.p);
        s += '<rect x="' + n1(it.x) + '" y="' + n1(it.y) + '" width="' + n1(it.w) + '" height="' + n1(it.h) + '" fill="#FFFFFF" stroke="' + C.line + '"/>';
        s += '<svg x="' + n1(it.x) + '" y="' + n1(it.y) + '" width="' + n1(it.w) + '" height="' + n1(it.h) + '" viewBox="' + a.vb + '" preserveAspectRatio="xMidYMid meet"' + a.keep + '>' + a.inner + '</svg>';
      }
      if (it.t === 'text') {
        let y = it.y;
        it.paras.forEach(p => {
          y += p.gap;
          const font = ' font-size="' + p.size.toFixed(2) + '" fill="' + p.color + '"' + (p.b ? ' font-weight="700"' : '') + (p.i ? ' font-style="italic"' : '');
          p.lines.forEach((l, li) => {
            const base = y + p.size * LH * 0.8;
            if (p.bullet && !li) s += '<text x="' + n1(it.x) + '" y="' + n1(base) + '"' + font + '>•</text>';
            s += p.align === 'c'
              ? '<text x="' + n1(it.x + it.w / 2) + '" y="' + n1(base) + '" text-anchor="middle"' + font + '>' + esc(l) + '</text>'
              : '<text x="' + n1(it.x + p.indent) + '" y="' + n1(base) + '"' + font + '>' + esc(l) + '</text>';
            y += p.size * LH;
          });
        });
      }
    });
    return s + '</svg>';
  }

  /* ---------- the preview window: zoom, drag, full screen, typing on the page ----------
     The page sits in a window you can scroll, or drag with the mouse. Fit
     (100%) is the biggest the whole page fits: the panel's width, or in full
     screen the whole screen. In full screen, click a box on the page to type
     into it; the text goes into the same field as the panels on the left.
     Where a browser can't put part of a page full screen (iPhone Safari), the
     preview fills the browser window instead. Esc leaves either. */
  const previewEl = document.querySelector('.preview'), viewEl = $('viewport'), sheetEl = $('sheet'), fullBtn = $('fullScreen');
  const editBox = $('editbox'), editText = $('editText');
  let zoom = 1, editing = null;
  const isFull = () => document.fullscreenElement === previewEl || previewEl.classList.contains('full');

  function applyZoom() {
    if (!last) return;
    const cs = getComputedStyle(viewEl);
    const vw = viewEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = viewEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ar = last.lay.W / last.lay.H;
    const fitW = isFull() ? Math.min(vw, vh * ar) : Math.min(vw, last.lay.portrait ? 640 : vw);
    sheetEl.style.width = Math.max(120, Math.floor(fitW * zoom)) + 'px';
    $('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    viewEl.classList.toggle('can-pan', viewEl.scrollWidth > viewEl.clientWidth || viewEl.scrollHeight > viewEl.clientHeight);
    placeEditor();
  }
  function setZoom(z) { zoom = Math.min(4, Math.max(0.5, z)); applyZoom(); }
  $('zoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
  $('zoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
  $('zoomFit').addEventListener('click', () => setZoom(1));
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyZoom, 100); });

  // Drag to move the page around in its window (touch screens swipe as usual)
  let drag = null, dragged = false;
  viewEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || (e.button !== 0 && e.button !== 1) || e.target.closest('.editbox')) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false;
    e.preventDefault();
  });
  viewEl.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) return;
    // Only take over the pointer once it's a drag, so a plain click still reaches a box
    if (!dragged) { dragged = true; viewEl.setPointerCapture(e.pointerId); viewEl.classList.add('grabbing'); }
    drag.x = e.clientX; drag.y = e.clientY;
    viewEl.scrollLeft -= dx; viewEl.scrollTop -= dy;
  });
  const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; viewEl.classList.remove('grabbing'); };
  viewEl.addEventListener('pointerup', endDrag);
  viewEl.addEventListener('pointercancel', endDrag);
  viewEl.addEventListener('click', e => {
    if (dragged) { dragged = false; e.preventDefault(); return; }
    const h = e.target.closest('.hot');
    if (h) openEditor(h.dataset.field);
    else if (editing && !e.target.closest('.editbox')) closeEditor();
  });

  // Boxes on the page to click and type into (shown in full screen)
  const FIELD_NAMES = { reportTitle: 'Report title', projectName: 'Project name', team: 'Team', projectLead: 'Project lead', problem: 'Problem statement' };
  const fieldName = f => FIELD_NAMES[f] || sec(f.slice(5)).head;
  function renderHots(lay) {
    const pc = v => (v * 100).toFixed(3) + '%';
    $('hots').innerHTML = lay.hots.map(h => '<button type="button" class="hot" data-field="' + h.field + '" style="left:' + pc(h.x / lay.W) +
      ';top:' + pc(h.y / lay.H) + ';width:' + pc(h.w / lay.W) + ';height:' + pc(h.h / lay.H) + '" aria-label="Type into ' + esc(fieldName(h.field)) + '"></button>').join('');
  }
  function openEditor(field) {
    const el = $(field); if (!el) return;
    editing = field;
    $('editLabel').textContent = fieldName(field);
    editBox.classList.toggle('short', el.tagName === 'INPUT');
    editText.value = el.value;
    editBox.hidden = false;
    // At least big enough to type in comfortably, however small the box on the page
    const h = sheetEl.querySelector('.hot[data-field="' + field + '"]');
    editText.style.height = el.tagName === 'INPUT' ? '' : Math.max(128, (h ? h.offsetHeight : 0) - 90) + 'px';
    placeEditor();
    editText.focus();
  }
  function closeEditor() {
    if (!editing) return;
    editing = null; editBox.hidden = true;
    viewEl.focus({ preventScroll: true });
  }
  // Over its box, kept on the page (it follows the box if the layout moves as you type)
  function placeEditor() {
    if (!editing) return;
    const h = sheetEl.querySelector('.hot[data-field="' + editing + '"]'); if (!h) return;
    const sw = sheetEl.clientWidth, sh = sheetEl.clientHeight;
    const w = Math.min(sw, Math.max(h.offsetWidth, 384));
    editBox.style.width = w + 'px';
    editBox.style.left = Math.max(0, Math.min(h.offsetLeft, sw - w)) + 'px';
    editBox.style.top = Math.max(0, Math.min(h.offsetTop, sh - editBox.offsetHeight)) + 'px';
  }
  editText.addEventListener('input', () => {
    const el = editing && $(editing); if (!el) return;
    el.value = editText.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  editText.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(); }
    else if (e.key === 'Enter' && editBox.classList.contains('short')) { e.preventDefault(); closeEditor(); }
  });
  $('editDone').addEventListener('click', closeEditor);

  // Full screen
  function fullChanged() {
    const on = isFull();
    fullBtn.setAttribute('aria-pressed', on);
    fullBtn.querySelector('span').textContent = on ? 'Exit full screen' : 'Full screen';
    document.body.classList.toggle('ft-full', previewEl.classList.contains('full'));
    if (!on) closeEditor();
    zoom = 1;
    requestAnimationFrame(applyZoom);
  }
  function setFull(on) {
    if (on === isFull()) return;
    if (!on && previewEl.classList.contains('full')) { previewEl.classList.remove('full'); fullChanged(); return; }
    if (document.fullscreenEnabled && previewEl.requestFullscreen) {
      if (on) previewEl.requestFullscreen().catch(() => { previewEl.classList.add('full'); fullChanged(); });
      else document.exitFullscreen();
      return;
    }
    previewEl.classList.toggle('full', on); fullChanged();
  }
  fullBtn.addEventListener('click', () => setFull(!isFull()));
  document.addEventListener('fullscreenchange', fullChanged);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !editing && previewEl.classList.contains('full')) setFull(false); });

  /* ---------- showing it ---------- */
  let last = null;
  function render() {
    const lay = layout();
    const svg = toSvg(lay);
    last = { lay, svg };
    const paper = $('paper');
    paper.innerHTML = svg;
    const sv = paper.querySelector('svg');
    sv.setAttribute('role', 'img');
    sv.setAttribute('aria-label', 'A3 report preview: ' + lay.title);
    sv.removeAttribute('width'); sv.removeAttribute('height');
    renderHots(lay);
    applyZoom();
    $('fit').textContent = 'A3 ' + (lay.portrait ? 'portrait' : 'landscape') + ' · body text ' + (Math.round(lay.f / PT * 2) / 2) + 'pt · ' +
      placed.length + (placed.length === 1 ? ' chart or picture' : ' charts and pictures');
    $('warnings').innerHTML = lay.warnings.map(w => '<p class="warn">' + esc(w) + '</p>').join('');
    renderPlaced();
    markTray();
    saveDraft();
  }
  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 200); };

  function renderPlaced() {
    const ul = $('placed');
    if (!placed.length) { ul.innerHTML = '<li class="none" style="border:0;padding:0">Nothing yet. Add a chart or picture from the list above.</li>'; return; }
    // Rows have no ids (so Save leaves them to getExtra); keep focus by position.
    const a = document.activeElement, li = a && ul.contains(a) ? a.closest('li') : null;
    if (li && a.dataset.act === 'caption') return; // still typing: the list is already up to date
    const keep = li ? { uid: li.dataset.uid, act: a.dataset.act } : null;
    ul.innerHTML = placed.map((p, i) =>
      '<li data-uid="' + p.uid + '"><b>' + esc(p.title) + '</b>' +
        '<div class="pair">' +
          '<label>Section<select data-act="section">' +
            SECTIONS.map(s => '<option value="' + s.id + '"' + (s.id === p.section ? ' selected' : '') + '>' + esc(s.head) + '</option>').join('') + '</select></label>' +
          '<label>Caption<input type="text" data-act="caption" value="' + esc(p.caption) + '" placeholder="Optional"></label>' +
        '</div>' +
        '<div class="btns">' +
          '<button type="button" class="sm" data-act="up"' + (i ? '' : ' disabled') + '>Move up</button>' +
          '<button type="button" class="sm" data-act="down"' + (i < placed.length - 1 ? '' : ' disabled') + '>Move down</button>' +
          '<button type="button" class="sm" data-act="remove">Remove</button>' +
        '</div></li>').join('');
    const el = keep && keep.act && ul.querySelector('li[data-uid="' + keep.uid + '"] [data-act="' + keep.act + '"]');
    if (el && !el.disabled) el.focus();
  }
  $('placed').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const uid = +b.closest('li').dataset.uid, i = placed.findIndex(p => p.uid === uid);
    if (i < 0) return;
    if (b.dataset.act === 'remove') placed.splice(i, 1);
    if (b.dataset.act === 'up' && i > 0) placed.splice(i - 1, 0, placed.splice(i, 1)[0]);
    if (b.dataset.act === 'down' && i < placed.length - 1) placed.splice(i + 1, 0, placed.splice(i, 1)[0]);
    render();
  });
  $('placed').addEventListener('change', e => {
    const el = e.target; if (el.dataset.act !== 'section') return;
    const p = placed.find(p => p.uid === +el.closest('li').dataset.uid); if (p) { p.section = el.value; render(); }
  });
  $('placed').addEventListener('input', e => {
    const el = e.target; if (el.dataset.act !== 'caption') return;
    const p = placed.find(p => p.uid === +el.closest('li').dataset.uid); if (p) { p.caption = el.value; schedule(); }
  });

  /* ---------- pictures from outside the tools ---------- */
  const MAX_PX = 2400;
  function addPicture(file) {
    if (!file || !/^image\/(png|jpeg)$/.test(file.type)) return FocusActions.say('Choose a PNG or JPG picture.');
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let url = String(r.result), w = img.naturalWidth, h = img.naturalHeight;
        // Very large photos are made smaller, to keep files a sensible size.
        if (Math.max(w, h) > MAX_PX) {
          const s = MAX_PX / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const c = cv.getContext('2d');
          if (file.type === 'image/jpeg') { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); }
          c.drawImage(img, 0, 0, w, h);
          url = cv.toDataURL(file.type, 0.9);
        }
        const title = (file.name || 'Picture').replace(/\.(png|jpe?g)$/i, '') || 'Picture';
        if (!place({ title, tool: 'picture', svg: pictureSvg(url, w, h), raster: url }, $('addTo').value)) return FocusActions.say('Sorry, that picture couldn’t be added.');
        trackUsage('picture_added');
        render();
        FocusActions.say('Added ' + title + ' to ' + sec($('addTo').value).head + '.');
      };
      img.onerror = () => FocusActions.say('Sorry, that picture couldn’t be read.');
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  $('picBtn').addEventListener('click', () => $('picFile').click());
  $('picFile').addEventListener('change', () => { const f = $('picFile').files[0]; $('picFile').value = ''; addPicture(f); });
  document.addEventListener('paste', e => {
    const t = e.target;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => /^image\/(png|jpeg)$/.test(i.type));
    if (!item) return;
    // Pasting text into a box still pastes the text.
    if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text')) && [...e.clipboardData.items].some(i => i.type === 'text/plain')) return;
    e.preventDefault();
    const f = item.getAsFile();
    addPicture(new File([f], 'Pasted picture.' + (item.type === 'image/png' ? 'png' : 'jpg'), { type: item.type }));
  });

  /* ---------- charts kept from the other tools ---------- */
  const store = FocusActions.clips;
  let thumbs = [];
  function loadTray() {
    store.list().then(list => {
      thumbs.forEach(u => URL.revokeObjectURL(u)); thumbs = [];
      const ul = $('tray');
      ul._clips = list;
      if (!list.length) { ul.innerHTML = '<li class="none">No charts yet.</li>'; return markTray(); }
      ul.innerHTML = list.map(c => {
        const u = URL.createObjectURL(new Blob([c.svg], { type: 'image/svg+xml' })); thumbs.push(u);
        const when = new Date(c.added);
        return '<li class="clip" data-id="' + c.id + '"><img src="' + u + '" alt="">' +
          '<div><b>' + esc(c.title) + '</b><small>' + esc(c.toolName) + ' · ' + esc(when.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: when.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' })) + '</small>' +
          '<span class="on" hidden>On the report</span>' +
          '<div class="btns"><button type="button" class="sm" data-act="add">Add to report</button><button type="button" class="sm" data-act="delete">Delete</button></div></div></li>';
      }).join('');
      ul._clips = list;
      markTray();
    }, () => { $('tray').innerHTML = '<li class="none">Charts can’t be kept in this browser, for example in a private window. You can still add pictures and write your report.</li>'; });
  }
  /* ---------- keeping the list short ---------- */
  // A chart is on the report when its cleaned SVG matches one placed there,
  // so this works for reports opened from a file too.
  const cleaned = new Map();
  function cleanOf(c) {
    const k = c.id + '|' + c.added;
    if (!cleaned.has(k)) cleaned.set(k, cleanSvg(c.svg));
    return cleaned.get(k);
  }
  const OLD = 90 * 864e5;
  let tidyLater = false;
  function markTray() {
    const ul = $('tray'), list = ul._clips || [], box = $('tidy');
    const srcs = new Set(placed.map(p => p.src));
    const on = list.filter(c => srcs.has(cleanOf(c)));
    const onIds = new Set(on.map(c => c.id));
    ul.querySelectorAll('li.clip').forEach(li => { li.querySelector('.on').hidden = !onIds.has(+li.dataset.id); });
    // Wait for the saved draft, so charts on it don't count as old.
    const old = restoring || tidyLater ? [] : list.filter(c => !onIds.has(c.id) && Date.now() - new Date(c.added) > OLD);
    const n = k => k + (k === 1 ? ' chart' : ' charts');
    box.innerHTML =
      (old.length ? '<p>' + n(old.length) + ' in this list ' + (old.length === 1 ? 'is' : 'are') + ' over 3 months old and not on the report.</p>' +
        '<div class="btns" style="margin-bottom:.5rem"><button type="button" class="sm" data-act="old">Remove ' + (old.length === 1 ? 'it' : 'them') + '</button><button type="button" class="sm" data-act="later">Not now</button></div>' : '') +
      (on.length ? '<div class="btns"><button type="button" class="sm" data-act="placed">Remove ' + n(on.length) + ' already on the report</button></div>' : '');
    box._old = old.map(c => c.id); box._on = on.map(c => c.id);
  }
  $('tidy').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'), box = $('tidy'); if (!b) return;
    if (b.dataset.act === 'later') { tidyLater = true; return markTray(); }
    const ids = b.dataset.act === 'old' ? box._old : box._on;
    if (!ids || !ids.length) return;
    const what = b.dataset.act === 'old' ? 'over 3 months old' : 'already on the report';
    if (!confirm('Remove ' + ids.length + (ids.length === 1 ? ' chart' : ' charts') + ' ' + what + ' from this list?' +
      (b.dataset.act === 'placed' ? ' The report keeps its own copy.' : ''))) return;
    store.removeMany(ids).then(() => { FocusActions.say('Removed ' + ids.length + (ids.length === 1 ? ' chart' : ' charts') + ' from the list.'); loadTray(); },
      () => FocusActions.say('Sorry, the charts couldn’t be removed.'));
  });
  $('tray').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = +b.closest('li').dataset.id, clip = ($('tray')._clips || []).find(c => c.id === id);
    if (!clip) return;
    if (b.dataset.act === 'add') {
      if (!place(clip, $('addTo').value)) return FocusActions.say('Sorry, that chart couldn’t be added.');
      trackUsage('chart_placed', { tool: clip.tool });
      render();
      FocusActions.say('Added ' + clip.title + ' to ' + sec($('addTo').value).head + '.');
    }
    if (b.dataset.act === 'delete' && confirm('Delete this chart from the list? Charts already on the report stay there.')) store.remove(id).then(loadTray);
  });
  // Pick up charts added in another tab.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadTray(); });
  window.addEventListener('focus', loadTray);

  /* ---------- keeping a draft, so going to another tool loses nothing ---------- */
  const DRAFT = 'a3_report';
  let restoring = true;
  function readAll() { const o = {}; FIELDS.forEach(id => { const el = $(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; }); return o; }
  function writeAll(o) {
    FIELDS.forEach(id => {
      const el = $(id), v = o ? o[id] : undefined;
      if (el.type === 'checkbox') { if (typeof v === 'boolean') el.checked = v; }
      else if (typeof v === 'string') el.value = v;
    });
  }
  function getExtra() { return { charts: placed.map(p => ({ title: p.title, tool: p.tool, svg: p.src, raster: p.raster || undefined, caption: p.caption, section: p.section })) }; }
  function setExtra(x) {
    placed = []; prepared.clear();
    ((x && x.charts) || []).forEach(c => place(c, c.section));
  }
  function saveDraft() {
    if (restoring) return;
    store.setDraft(DRAFT, { fields: readAll(), extra: getExtra() }).catch(() => {});
  }
  const hasData = () => placed.length > 0 || ['projectName', 'team', 'projectLead', 'problem'].concat(SECTIONS.map(s => 'text_' + s.id)).some(id => val(id));

  function reset() {
    FIELDS.forEach(id => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = el.defaultChecked;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = el.defaultValue || '';
    });
    placed = []; prepared.clear();
    store.clearDraft(DRAFT).catch(() => {});
    render();
  }

  /* ---------- example ---------- */
  function exampleRun() {
    const v = [42, 45, 39, 47, 44, 41, 46, 43, 48, 40, 44, 42, 35, 31, 33, 29, 30, 27, 28, 26];
    const W = 900, H = 420, l = 60, r = 20, t = 56, b = 50, pw = W - l - r, ph = H - t - b, max = 55;
    const X = i => l + i * pw / (v.length - 1), Y = y => t + ph - y / max * ph;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" font-family="Arial, sans-serif"><rect width="' + W + '" height="' + H + '" fill="#fff"/>';
    s += '<text x="20" y="30" font-size="20" font-weight="700" fill="#212B32">Example: patients discharged after midday each week</text>';
    for (let y = 0; y <= 50; y += 10) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(y) + '" y2="' + Y(y) + '" stroke="#E8EDEE"/><text x="' + (l - 8) + '" y="' + (Y(y) + 4) + '" font-size="12" text-anchor="end" fill="#4C6272">' + y + '</text>';
    s += '<line x1="' + l + '" x2="' + X(11) + '" y1="' + Y(43.5) + '" y2="' + Y(43.5) + '" stroke="#768692" stroke-dasharray="6 4" stroke-width="2"/>';
    s += '<line x1="' + X(12) + '" x2="' + (W - r) + '" y1="' + Y(29.5) + '" y2="' + Y(29.5) + '" stroke="#768692" stroke-dasharray="6 4" stroke-width="2"/>';
    s += '<polyline fill="none" stroke="#005EB8" stroke-width="2.5" points="' + v.map((y, i) => X(i) + ',' + Y(y)).join(' ') + '"/>';
    v.forEach((y, i) => { s += '<circle cx="' + X(i) + '" cy="' + Y(y) + '" r="4.5" fill="' + (i >= 12 ? '#ED8B00' : '#005EB8') + '"/>'; });
    s += '<line x1="' + X(11.5) + '" x2="' + X(11.5) + '" y1="' + t + '" y2="' + (t + ph) + '" stroke="#212B32" stroke-width="1.5"/><text x="' + (X(11.5) + 6) + '" y="' + (t + 14) + '" font-size="13" fill="#212B32">Board round at 9am</text>';
    s += '<text x="' + (l + pw / 2) + '" y="' + (H - 14) + '" font-size="13" text-anchor="middle" fill="#4C6272">Week</text></svg>';
    return s;
  }
  function examplePareto() {
    const d = [['Waiting for medicines', 38], ['Transport not booked', 22], ['Awaiting senior review', 17], ['Care package', 9], ['Other', 6]];
    const W = 900, H = 420, l = 60, r = 60, t = 56, b = 70, pw = W - l - r, ph = H - t - b, tot = 92, bw = pw / d.length;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" font-family="Arial, sans-serif"><rect width="' + W + '" height="' + H + '" fill="#fff"/>';
    s += '<text x="20" y="30" font-size="20" font-weight="700" fill="#212B32">Example: reasons for discharges after midday</text>';
    let cum = 0;
    const pts = [];
    d.forEach(([n, v], i) => {
      const h = v / 40 * ph, x = l + i * bw;
      s += '<rect x="' + (x + 10) + '" y="' + (t + ph - h) + '" width="' + (bw - 20) + '" height="' + h + '" fill="#005EB8"/>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (t + ph - h - 6) + '" font-size="13" text-anchor="middle" fill="#212B32">' + v + '</text>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (t + ph + 20) + '" font-size="12" text-anchor="middle" fill="#4C6272">' + n + '</text>';
      cum += v; pts.push((x + bw / 2) + ',' + (t + ph - cum / tot * ph));
    });
    s += '<polyline fill="none" stroke="#ED8B00" stroke-width="2.5" points="' + pts.join(' ') + '"/>';
    s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + (t + ph) + '" y2="' + (t + ph) + '" stroke="#212B32"/></svg>';
    return s;
  }
  function loadExample() {
    reset();
    writeAll({
      projectName: 'Getting patients home before midday (example)', team: 'Ward 7 discharge team', projectLead: 'Ward 7 matron', stakeholder: true,
      problem: 'Around a third of patients who are medically fit go home after midday, which delays admissions from A&E and makes the ward feel rushed in the afternoon.',
      text_current: '- 44 patients a week discharged after midday (baseline, 12 weeks)\n- Patients and staff describe the wait as the most frustrating part of going home',
      text_targets: 'Reduce discharges after midday from 44 to 25 a week by March 2027.\n- Outcome: discharges after midday each week\n- Balancing: readmissions within 7 days',
      text_gap: 'We mapped the discharge process and counted the reasons for each late discharge. Medicines and transport made up two thirds of delays.',
      text_solutions: '- Board round at 9am to confirm who is going home\n- Pharmacy reviews discharge medicines the day before\n- Transport booked at the board round',
      text_testing: '- PDSA 1: 9am board round, two weeks (done)\n- PDSA 2: next-day medicines, starts November\n- PDSA 3: transport at board round, starts December',
      text_sustain: 'Late discharges fell to around 30 a week after the 9am board round, a shift in the run chart. The board round is now in the ward routine, and we will share our learning at the divisional QI forum.'
    });
    place({ title: 'Example Pareto chart', tool: 'pareto_chart', svg: examplePareto(), caption: 'Reasons recorded for 92 late discharges' }, 'gap');
    place({ title: 'Example run chart', tool: 'run_chart', svg: exampleRun(), caption: 'Late discharges fell after the 9am board round started' }, 'sustain');
    render();
  }

  /* ---------- PowerPoint ---------- */
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml.';
  const emu = v => Math.round(v * EMU);
  const hex = c => c.replace('#', '').toUpperCase();
  const xfrm = it => '<a:xfrm><a:off x="' + emu(it.x) + '" y="' + emu(it.y) + '"/><a:ext cx="' + Math.max(1, emu(it.w)) + '" cy="' + Math.max(1, emu(it.h)) + '"/></a:xfrm>';
  const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const THEME = XML + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="FOCUS A3"><a:themeElements>' +
    '<a:clrScheme name="FOCUS A3"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="00338D"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="00359E"/></a:accent1><a:accent2><a:srgbClr val="005EB8"/></a:accent2><a:accent3><a:srgbClr val="007F3B"/></a:accent3><a:accent4><a:srgbClr val="ED8B00"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="44546A"/></a:accent5><a:accent6><a:srgbClr val="AE2573"/></a:accent6><a:hlink><a:srgbClr val="005EB8"/></a:hlink><a:folHlink><a:srgbClr val="330072"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="FOCUS A3"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="FOCUS A3"><a:fillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:fillStyleLst>' +
    '<a:lnStyleLst>' + '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3) + '</a:lnStyleLst>' +
    '<a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) + '</a:effectStyleLst>' +
    '<a:bgFillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';

  function runXml(p, text) {
    return '<a:r><a:rPr lang="en-GB" sz="' + Math.round(p.size / PT * 100) + '"' + (p.b ? ' b="1"' : '') + (p.i ? ' i="1"' : '') + ' dirty="0"><a:solidFill><a:srgbClr val="' + hex(p.color) + '"/></a:solidFill>' +
      '<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t>' + esc(text) + '</a:t></a:r>';
  }
  function textXml(it, id) {
    const paras = it.paras.map(p => {
      const ind = p.bullet ? ' marL="' + emu(p.indent) + '" indent="-' + emu(p.indent) + '"' : ' marL="0" indent="0"';
      return '<a:p><a:pPr' + ind + (p.align === 'c' ? ' algn="ctr"' : '') + '><a:lnSpc><a:spcPts val="' + Math.round(p.size * LH / PT * 100) + '"/></a:lnSpc>' +
        '<a:spcBef><a:spcPts val="' + Math.round(p.gap / PT * 100) + '"/></a:spcBef>' +
        (p.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>') + '</a:pPr>' +
        runXml(p, p.text) + '</a:p>';
    }).join('');
    // A little taller than measured, so PowerPoint's wrapping never clips.
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr>' + xfrm({ x: it.x, y: it.y, w: it.w, h: it.h + 2 }) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + paras + '</p:txBody></p:sp>';
  }
  function rectXml(it, id) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Box ' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(it) +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="' + hex(it.fill) + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>';
  }
  function picXml(it, id, rid, svgRid) {
    const svg = svgRid ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' + svgRid + '"/></a:ext></a:extLst>' : '';
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Picture ' + id + '" descr="' + esc(it.p.title + (it.p.caption ? ': ' + it.p.caption : '')) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rid + '">' + svg + '</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr>' + xfrm(it) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="' + hex(C.line) + '"/></a:solidFill></a:ln></p:spPr></p:pic>';
  }
  const b64bytes = url => Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
  // A chart's SVG as a PNG, at about 250 dpi for the size it has on the page.
  function svgPng(src, w, h) {
    const px = Math.min(3000, Math.max(300, Math.round(w / MM / 25.4 * 250))), py = Math.max(1, Math.round(px * h / w));
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = px; cv.height = py;
        const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, px, py); c.drawImage(img, 0, 0, px, py);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error('png')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }
  async function buildPptx() {
    render();
    const lay = last.lay, files = [], rels = [], shapes = [];
    let id = 2, rid = 2, media = 0;
    const enc = new TextEncoder();
    for (const it of lay.items) {
      if (it.t === 'rect') shapes.push(rectXml(it, id++));
      else if (it.t === 'text') shapes.push(textXml(it, id++));
      else if (it.t === 'img') {
        let png, ext = 'png', svgRid = '';
        if (it.p.raster) { png = b64bytes(it.p.raster); ext = it.p.raster.startsWith('data:image/jpeg') ? 'jpeg' : 'png'; }
        else {
          png = await svgPng(it.p.src, it.w, it.h);
          const sname = 'image' + (++media) + '.svg';
          files.push(['ppt/media/' + sname, enc.encode(it.p.src)]);
          svgRid = 'rId' + rid++;
          rels.push('<Relationship Id="' + svgRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + sname + '"/>');
        }
        const name = 'image' + (++media) + '.' + ext, prid = 'rId' + rid++;
        files.push(['ppt/media/' + name, png]);
        rels.push('<Relationship Id="' + prid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + name + '"/>');
        shapes.push(picXml(it, id++, prid, svgRid));
      }
    }
    const cx = emu(lay.W), cy = emu(lay.H), now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const rl = list => XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.join('') + '</Relationships>';
    return FocusActions.zip([
      ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="svg" ContentType="image/svg+xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="' + CT + 'presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + CT + 'slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + CT + 'slideLayout+xml"/>' +
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="' + CT + 'slide+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '<Override PartName="/ppt/presProps.xml" ContentType="' + CT + 'presProps+xml"/>' +
        '<Override PartName="/ppt/viewProps.xml" ContentType="' + CT + 'viewProps+xml"/>' +
        '<Override PartName="/ppt/tableStyles.xml" ContentType="' + CT + 'tableStyles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
      ['_rels/.rels', rl(['<Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="ppt/presentation.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
        '<Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/>'])],
      ['docProps/core.xml', XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(val('projectName') || lay.title) + '</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>'],
      ['docProps/app.xml', XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FOCUS QI charting tools</Application><Slides>1</Slides></Properties>'],
      ['ppt/presentation.xml', XML + '<p:presentation ' + NS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="' + cx + '" cy="' + cy + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'],
      ['ppt/_rels/presentation.xml.rels', rl(['<Relationship Id="rId1" Type="' + REL + 'slideMaster" Target="slideMasters/slideMaster1.xml"/>',
        '<Relationship Id="rId2" Type="' + REL + 'slide" Target="slides/slide1.xml"/>', '<Relationship Id="rId3" Type="' + REL + 'theme" Target="theme/theme1.xml"/>',
        '<Relationship Id="rId4" Type="' + REL + 'presProps" Target="presProps.xml"/>', '<Relationship Id="rId5" Type="' + REL + 'viewProps" Target="viewProps.xml"/>',
        '<Relationship Id="rId6" Type="' + REL + 'tableStyles" Target="tableStyles.xml"/>'])],
      ['ppt/presProps.xml', XML + '<p:presentationPr ' + NS + '/>'],
      ['ppt/viewProps.xml', XML + '<p:viewPr ' + NS + '><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>'],
      ['ppt/tableStyles.xml', XML + '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'],
      ['ppt/theme/theme1.xml', THEME],
      ['ppt/slideMasters/slideMaster1.xml', XML + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + GRP + '</p:spTree></p:cSld>' +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
        '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>'],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rl(['<Relationship Id="rId1" Type="' + REL + 'slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
        '<Relationship Id="rId2" Type="' + REL + 'theme" Target="../theme/theme1.xml"/>'])],
      ['ppt/slideLayouts/slideLayout1.xml', XML + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + GRP + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'],
      ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rl(['<Relationship Id="rId1" Type="' + REL + 'slideMaster" Target="../slideMasters/slideMaster1.xml"/>'])],
      ['ppt/slides/slide1.xml', XML + '<p:sld ' + NS + '><p:cSld name="A3 report"><p:spTree>' + GRP + shapes.join('') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'],
      ['ppt/slides/_rels/slide1.xml.rels', rl(['<Relationship Id="rId1" Type="' + REL + 'slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'].concat(rels))]
    ].concat(files), CT + 'presentation');
  }

  /* ---------- exports ---------- */
  const slug = () => ((val('projectName') || val('reportTitle') || 'a3 report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'a3-report');
  function svgOut() { render(); return last.svg; }
  function toPng() {
    const svg = svgOut(), { W, H } = last.lay;
    const px = Math.round(W / MM / 25.4 * 300), py = Math.round(H / MM / 25.4 * 300); // 300 dpi
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = px; cv.height = py;
        const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, px, py); c.drawImage(img, 0, 0, px, py);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('png')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }
  const saved = msg => ok => FocusActions.say(ok ? msg : 'Download cancelled.');
  const failed = () => FocusActions.say('Sorry, that export didn’t work.');
  function printReport() {
    const svg = svgOut();
    let st = $('a3PageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'a3PageStyle'; document.head.appendChild(st); }
    st.textContent = '@page{size:A3 ' + (last.lay.portrait ? 'portrait' : 'landscape') + ';margin:0}';
    $('printArea').innerHTML = svg;
    window.print();
  }
  const EXPORTS = {
    pptx: () => buildPptx().then(b => FocusActions.saveFile(slug() + '.pptx', b)).then(saved('PowerPoint downloaded.'), failed),
    png: () => toPng().then(b => FocusActions.saveFile(slug() + '.png', b)).then(saved('PNG downloaded.'), failed),
    svg: () => FocusActions.saveFile(slug() + '.svg', new Blob([svgOut()], { type: 'image/svg+xml' })).then(saved('SVG downloaded.'), failed),
    copyimg: async () => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng() })]); FocusActions.say('Report copied. Paste it into PowerPoint or Word.'); }
      catch (e) { FocusActions.say('Your browser couldn’t copy the image. Use PNG image instead.'); }
    },
    print: printReport
  };

  /* ---------- events and start ---------- */
  FIELDS.forEach(id => $(id).addEventListener($(id).tagName === 'SELECT' || $(id).type === 'checkbox' ? 'change' : 'input', schedule));
  trackSettings({ layout: 'layout', showGuidance: 'showGuide' });

  FocusActions.mount({
    tool: 'a3_report', toolName: 'A3 report', a3: false,
    example: loadExample, hasData, reset,
    fileName: slug,
    fields: '.side',
    getExtra, setExtra,
    afterOpen: render,
    ready: () => true,
    exports: trackExports([
      { type: 'pptx', label: 'PowerPoint (A3)', hint: 'Edit the text, charts and pictures in PowerPoint', run: EXPORTS.pptx },
      { type: 'print', label: 'Print or save as PDF', hint: 'A3, from your browser’s print window', run: EXPORTS.print },
      { type: 'png', run: EXPORTS.png, hint: 'A3 at 300 dpi, for slides and documents' },
      { type: 'svg', run: EXPORTS.svg },
      { type: 'copyimg', run: EXPORTS.copyimg }
    ])
  });

  loadTray();
  store.getDraft(DRAFT).then(d => {
    if (d && d.fields) { writeAll(d.fields); setExtra(d.extra); }
  }).catch(() => {}).then(() => { restoring = false; render(); });
  render();

  // Exposed for testing
  window.__a3 = { layout, cleanSvg, buildPptx, placed: () => placed };
})();

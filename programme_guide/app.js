---
# Liquid fills in the site links below
---
/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const G = {{ site.data.programme_guide | jsonify }};
  const BASE = '{{ "/programme_guide/" | relative_url }}';
  const TOOLS = '{{ "/" | relative_url }}';
  const DOCS = {}; G.docs.forEach(d => { DOCS[d.id] = d; });
  const STAGES = {}; G.stages.forEach((s, i) => { STAGES[s.id] = Object.assign({ n: i + 1 }, s); });
  const KIND = { slides: 'PowerPoint', sheet: 'Excel', doc: 'Word' };
  const T = G.tree;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const track = (name, props) => { try { if (window.trackUsage) trackUsage(name, props); } catch (e) { /* never break the page */ } };
  const ICON = {
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  $('exName').textContent = G.example.name;

  let answers = [];   // indexes of the options chosen, from the root
  let view = null;    // what the result panel shows when not following the tree

  // ---- stage bar and document map ----
  $('stagebar').innerHTML = G.stages.map((s, i) => {
    const docs = G.docs.filter(d => d.stage === s.id);
    return `<li><button type="button" class="stagebtn" data-stage="${s.id}" style="--sc:var(--s-${s.id})">
      <span class="n">Stage ${i + 1}</span><b><span class="fl">${esc(s.name.charAt(0))}</span>${esc(s.name.slice(1))}</b><small>${esc(s.question)}</small>
      <span class="codes" aria-hidden="true">${docs.map(d => `<span class="code">${esc(d.code)}</span>`).join('')}</span>
      <span class="sr">${docs.length} documents</span></button></li>`;
  }).join('');
  $('flow').innerHTML = G.stages.map(s => `<div style="--sc:var(--s-${s.id})"><h3>${STAGES[s.id].n}. ${esc(s.name)}</h3><ul>${
    G.docs.filter(d => d.stage === s.id).map(d => `<li><button type="button" class="docbtn" data-doc="${d.id}"><span class="code">${esc(d.code)}</span><span>${esc(d.name)}</span></button></li>`).join('')
  }</ul><h4>Charting tools</h4><ul class="flowtools">${
    s.tools.map(t => `<li><a href="${TOOLS}${t}/">${esc(G.tool_names[t] || t)}</a></li>`).join('')
  }</ul></div>`).join('');

  // ---- decision tree ----
  function walk() {
    // follow the answers; returns {id, steps:[{q, a}], result}
    let id = T.root, steps = [];
    for (const i of answers) {
      const q = T.questions[id], o = q && q.options[i];
      if (!o) break;
      steps.push({ q: q.q, a: o.a });
      if (o.result) return { steps, result: o.result };
      id = o.next;
    }
    return { id, steps, result: null };
  }

  function renderAsk() {
    const w = walk();
    $('route').innerHTML = w.steps.length ? w.steps.map(s => `<li><span class="q">${esc(s.q)}</span><span class="a">${esc(s.a)}</span></li>`).join('') : '<li class="hint" style="border:0">Nothing chosen yet.</li>';
    $('backBtn').disabled = !answers.length;
    if (w.result) {
      $('ask').innerHTML = view
        ? `<p class="step">Done</p><p class="question">You're browsing.</p><p class="hint">Press Back to return to what your answers recommend, or start over.</p>`
        : `<p class="step">Done</p><p class="question">Here is what you need.</p><p class="hint">Change an answer with Back, or start over to ask something else.</p>`;
      return;
    }
    const q = T.questions[w.id];
    $('ask').innerHTML = `<p class="step">Question ${w.steps.length + 1}</p><p class="question" id="qText">${esc(q.q)}</p>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}
      <div role="group" aria-labelledby="qText">${q.options.map((o, i) => `<button type="button" class="option" data-opt="${i}"><b>${esc(o.a)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }

  function render() {
    renderAsk();
    const w = walk();
    document.querySelectorAll('.stagebtn').forEach(b => b.classList.toggle('on', !!view && view.stage === b.dataset.stage));
    document.querySelectorAll('.docbtn').forEach(b => b.classList.remove('lit'));
    if (view && view.doc) return renderDoc(DOCS[view.doc]);
    if (view && view.stage) return renderStage(STAGES[view.stage]);
    if (w.result) return renderResult(T.results[w.result]);
    renderWelcome();
  }

  function card(d) {
    return `<article class="card" style="--sc:var(--s-${d.stage})">
      <h3><span class="code">${esc(d.code)}</span><span>${esc(d.name)}</span></h3>
      <span class="kind">${STAGES[d.stage].name} · ${KIND[d.kind]}</span>
      <p>${esc(d.purpose)}</p>
      <p class="when"><b>When:</b> ${esc(d.when)}</p>
      ${d.feeds.length ? `<div class="chips">Draws on: ${d.feeds.map(f => `<button type="button" class="chip" data-doc="${f}">${esc(DOCS[f].name)}</button>`).join('')}</div>` : ''}
      <div class="btns">
        <button type="button" class="btn primary" data-example="${d.id}">${ICON.eye}See the example</button>
        <button type="button" class="link" data-doc="${d.id}">More about it</button>
      </div>
    </article>`;
  }

  function toolLinks(ids) {
    return `<div class="tools">${ids.map(t => `<a href="${TOOLS}${t}/">${esc(G.tool_names[t] || t)}</a>`).join('')}</div>`;
  }

  function renderWelcome() {
    $('result').innerHTML = `<span class="tag">Worked example</span>
      <p class="summary">${esc(G.example.name)}</p>
      <p class="lead">${esc(G.example.pitch)}</p>
      <p class="lead"><b>Aim:</b> ${esc(G.example.aim)}. It runs from ${esc(G.example.start)} to ${esc(G.example.end)}, and every example on this page is filled in for it.</p>
      <p class="lead">Answer the questions on the left to find the documents you need, or choose a stage above.</p>
      <h3 class="sub">Where most programmes start</h3>
      <div class="cards">${['scope', 'highlight', 'raid'].map(id => card(DOCS[id])).join('')}</div>`;
  }

  function renderResult(r) {
    const s = STAGES[r.stage];
    $('result').innerHTML = `<span class="tag" style="--sc:var(--s-${s.id})">Stage ${s.n}: ${esc(s.name)}</span>
      <p class="summary">${esc(r.title)}</p>
      <p class="lead">${esc(r.text)}</p>
      <div class="cards">${r.docs.map(id => card(DOCS[id])).join('')}</div>
      <h3 class="sub">Charting tools that help at this stage</h3>${toolLinks(s.tools)}
      ${r.next ? `<p class="nextup"><b>Next:</b> ${esc(r.next)}</p>` : ''}`;
  }

  function renderStage(s) {
    const docs = G.docs.filter(d => d.stage === s.id);
    $('result').innerHTML = `<span class="tag" style="--sc:var(--s-${s.id})">Stage ${s.n} of 5</span>
      <p class="summary">${esc(s.name)}: ${esc(s.question)}</p>
      <p class="lead">${esc(s.text)}</p>
      <div class="cards">${docs.map(card).join('')}</div>
      <h3 class="sub">Charting tools that help at this stage</h3>${toolLinks(s.tools)}
      <p class="nextup">${s.n < 5 ? `<b>Next:</b> <button type="button" class="link" data-stage="${G.stages[s.n].id}">Stage ${s.n + 1}: ${esc(G.stages[s.n].name)}</button>` : 'This is the last stage.'}</p>`;
  }

  function renderDoc(d) {
    const s = STAGES[d.stage];
    const usedBy = G.docs.filter(x => x.feeds.includes(d.id));
    document.querySelectorAll('.docbtn').forEach(b => b.classList.toggle('lit', b.dataset.doc === d.id || d.feeds.includes(b.dataset.doc)));
    const thumbs = d.pages && d.pages.length ? `<h3 class="sub">The example</h3><div class="thumbs">${d.pages.slice(0, 6).map((p, i) => `<button type="button" data-example="${d.id}" data-page="${i}" aria-label="Open ${esc(d.name)} example, page ${i + 1}"><img src="${BASE}previews/${p}" alt="" loading="lazy"></button>`).join('')}</div>` : '';
    $('result').innerHTML = `<span class="tag" style="--sc:var(--s-${s.id})">Stage ${s.n}: ${esc(s.name)} · ${KIND[d.kind]}${d.ref ? ' · CITI template ' + esc(d.ref) : ''}</span>
      <p class="summary">${esc(d.name)}</p>
      <p class="lead">${esc(d.purpose)}</p>
      <div class="detail"><dl>
        <dt>When</dt><dd>${esc(d.when)}</dd>
        <dt>Who</dt><dd>${esc(d.owner)}</dd>
        <dt>What's in it</dt><dd>${esc(d.covers.join('; '))}</dd>
        <dt>Draws on</dt><dd>${d.feeds.length ? `<span class="chips">${d.feeds.map(f => `<button type="button" class="chip" data-doc="${f}">${esc(DOCS[f].name)}</button>`).join('')}</span>` : 'Nothing: it is a starting point.'}</dd>
        <dt>Feeds</dt><dd>${usedBy.length ? `<span class="chips">${usedBy.map(f => `<button type="button" class="chip" data-doc="${f.id}">${esc(f.name)}</button>`).join('')}</span>` : 'Nothing further.'}</dd>
      </dl>
      <h3 class="sub">Tips</h3><ul>${d.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="btns" style="margin-top:1rem">
        <button type="button" class="btn primary" data-example="${d.id}">${ICON.eye}See the example</button>
        ${downloads(d)}
      </div>${thumbs}`;
  }

  function downloads(d) {
    return `<a class="btn" href="${BASE}examples/${d.example}" download data-dl="example" data-id="${d.id}">${ICON.down}Example (${KIND[d.kind]})</a>
      <a class="btn" href="${BASE}templates/${d.template}" download data-dl="template" data-id="${d.id}">${ICON.down}Blank template</a>`;
  }

  // ---- example viewer ----
  const viewer = $('viewer');
  function openExample(id, page, sheetName) {
    const d = DOCS[id];
    $('vTitle').textContent = d.name + ': worked example';
    $('vSub').textContent = `${G.example.name} (made up). ${d.purpose}`;
    if (d.pages && d.pages.length) {
      const what = d.kind === 'doc' ? 'Page' : 'Slide';
      $('vBody').innerHTML = `<div class="pages${d.kind === 'doc' ? ' doc' : ''}">${d.pages.map((p, i) => `<figure id="pg-${i}"><img src="${BASE}previews/${p}" alt="${what} ${i + 1} of the example ${esc(d.name.toLowerCase())}" loading="lazy"><figcaption>${what} ${i + 1} of ${d.pages.length}</figcaption></figure>`).join('')}</div>`;
    } else if (d.tables) {
      let tab = Math.max(0, d.tables.findIndex(t => sheetName && t.name.toLowerCase().startsWith(sheetName.toLowerCase())));
      const draw = () => {
        $('vBody').innerHTML = (d.tables.length > 1 ? `<div class="tabs" role="tablist">${d.tables.map((t, i) => `<button type="button" role="tab" aria-selected="${i === tab}" data-tab="${i}">${esc(t.name)}</button>`).join('')}</div>` : '') +
          `<div role="tabpanel">${sheet(d.tables[tab])}</div><p class="note">A preview of the ${d.tables.length > 1 ? 'tab' : 'sheet'} from the example workbook. Download it to see every column, the formulas and the drop-down lists.</p>`;
        $('vBody').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = +b.dataset.tab; draw(); $('vBody').querySelector(`[data-tab="${tab}"]`).focus(); }));
      };
      draw();
    }
    $('vFoot').innerHTML = `<span class="note" style="margin:0">All names, figures and dates are made up.</span><span class="btns">${downloads(d)}</span>`;
    if (!viewer.open) viewer.showModal();
    $('vBody').scrollTop = 0;
    if (page) { const f = $('pg-' + page); if (f) f.scrollIntoView(); }
    track('example_viewed', { doc: id });
  }

  function sheet(t) {
    const long = new Set(), nowrap = new Set();
    t.columns.forEach((c, i) => {
      const lens = t.rows.map(r => String(r[i] == null ? '' : r[i]).length);
      const max = Math.max(0, ...lens);
      if (max > 45) long.add(i); else if (max <= 14) nowrap.add(i);
    });
    let gantt = '', g = t.gantt, days = [];
    if (g) {
      const start = new Date(g.start + 'T00:00:00');
      for (let w = 0; w < g.weeks; w++) { const x = new Date(start); x.setDate(x.getDate() + 7 * w); days.push(x); }
      gantt = days.map(x => `<th scope="col" style="font-weight:600">${x.getDate()}/${x.getMonth() + 1}</th>`).join('');
    }
    const parse = s => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
    const head = `<tr>${t.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}${gantt}</tr>`;
    const body = t.rows.map(r => {
      const ws = g && r[0] === 'Workstream';
      let cells = r.map((v, i) => {
        let cls = [];
        if (long.has(i)) cls.push('long');
        if (nowrap.has(i)) cls.push('nowrap');
        if (t.rag === i && /^[RAGB]$/.test(v)) cls.push('rag-' + v);
        if (t.heat && t.heat.includes(i)) { const n = +v; cls.push(n >= 15 ? 'rag-R' : n >= 8 ? 'rag-A' : 'rag-G'); }
        return `<td${cls.length ? ` class="${cls.join(' ')}"` : ''}>${esc(v)}</td>`;
      }).join('');
      if (g) {
        const a = parse(r[g.startCol]), b = parse(r[g.endCol]);
        cells += days.map(x => {
          const end = new Date(x); end.setDate(end.getDate() + 6);
          const on = a && b && a <= end && b >= x;
          return `<td class="gcell">${on ? `<span class="gbar${r[8] === 'Y' ? ' crit' : ''}"></span>` : ''}</td>`;
        }).join('');
      }
      return `<tr${ws ? ' class="ws"' : ''}>${cells}</tr>`;
    }).join('');
    return `<div class="tscroll"><table class="sheet"><caption class="sr">${esc(t.name)}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
      (t.note ? `<p class="note">${esc(t.note)}</p>` : '') +
      (g ? `<p class="note">Bars show each week an activity runs; red bars are on the critical path.</p>` : '') +
      (t.heat ? `<p class="note">Exposure is likelihood × impact: 15 or more is red, 8 to 14 amber, below 8 green.</p>` : '');
  }

  $('vClose').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });

  // ---- events ----
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-opt],[data-stage],[data-doc],[data-example],[data-dl]');
    if (!el) return;
    if (el.dataset.dl) { track('template_downloaded', { doc: el.dataset.id, file: el.dataset.dl }); return; }
    if (el.dataset.opt != null) { answers.push(+el.dataset.opt); view = null; render(); focusResultIfDone(); return; }
    if (el.dataset.example) {
      const w = walk(), r = w.result && T.results[w.result];
      openExample(el.dataset.example, el.dataset.page ? +el.dataset.page : 0, r && r.sheet && r.docs[0] === el.dataset.example ? r.sheet : null);
      return;
    }
    if (el.dataset.stage) { view = { stage: el.dataset.stage }; if (viewer.open) viewer.close(); render(); scrollToResult(); return; }
    if (el.dataset.doc) { view = { doc: el.dataset.doc }; if (viewer.open) viewer.close(); render(); scrollToResult(); }
  });
  function focusResultIfDone() { if (walk().result) scrollToResult(); }
  function scrollToResult() {
    const p = $('resultPanel');
    if (window.matchMedia('(max-width:880px)').matches || p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: 'start' });
    p.focus({ preventScroll: true });
  }
  $('backBtn').addEventListener('click', () => { if (view) view = null; else answers.pop(); render(); });
  $('clearBtn').addEventListener('click', () => { answers = []; view = null; render(); });

  // ?doc=raid opens a document, ?stage=plan a stage
  const qs = new URLSearchParams(location.search);
  if (DOCS[qs.get('doc')]) view = { doc: qs.get('doc') };
  else if (STAGES[qs.get('stage')]) view = { stage: qs.get('stage') };
  render();
})();

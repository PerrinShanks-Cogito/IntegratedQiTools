/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    preset: $('preset'), presetNote: $('presetNote'), customBox: $('customBox'),
    cX: $('cX'), cY: $('cY'), cTL: $('cTL'), cTR: $('cTR'), cBL: $('cBL'), cBR: $('cBR'),
    data: $('data'), dataHint: $('dataHint'), hasHeader: $('hasHeader'), detected: $('detected'), title: $('title'),
    xSplit: $('xSplit'), ySplit: $('ySplit'), xLabel: $('xLabel'), yLabel: $('yLabel'),
    showNames: $('showNames'), result: $('result'), scaleNote: $('scaleNote')
  };
  const radio = n => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
  const COLORS = { ink: '#212B32', muted: '#4C6272' };
  const TONES = {
    green: { dot: '#007F3B', tint: '#E3F2E9', ink: '#00602C' },
    blue:  { dot: '#005EB8', tint: '#E6F0FA', ink: '#003087' },
    amber: { dot: '#ED8B00', tint: '#FFF4DB', ink: '#7A4600', dark: true },
    grey:  { dot: '#5E6E7A', tint: '#EEF1F3', ink: '#4C6272' },
    red:   { dot: '#D5281B', tint: '#FBE7E5', ink: '#9A1B12' }
  };
  // Quadrants: tr = high across and high up, tl = low across, high up, and so on.
  const ORDER = ['tr', 'tl', 'br', 'bl'];
  const IMPACT = { name: 'Impact', match: /impact|benefit/i, lo: 'Lower', hi: 'Higher', guide: ['very little', 'a lot'], help: 'how much difference it would make to your aim' };
  const IMPORTANCE = { name: 'Importance', match: /importan/i, lo: 'Less important', hi: 'More important', guide: ['not important', 'very important'] };
  const q = (name, desc, advice, tone) => ({ name, desc, advice, tone });
  const PRESETS = {
    ease_impact: {
      about: 'Find the change ideas that are easy to do and would make a big difference, so you know which to test first.',
      item: ['idea', 'ideas'], focus: 'tr',
      listTip: 'Ideas can come from a driver diagram, a fishbone diagram, process mapping or brainstorming with staff and patients.',
      x: { name: 'Ease', match: /ease|feasib/i, lo: 'Harder', hi: 'Easier', guide: ['very hard', 'very easy'], help: 'how easy the idea is to do. Think about time, cost, staff, the approvals needed and how much is within your team’s control' },
      y: IMPACT,
      quads: {
        tr: q('Quick wins', 'high impact and easy to do', 'Test these first.', 'green'),
        tl: q('Major projects', 'high impact but hard to do', 'Worth doing, but plan carefully and get support for them.', 'blue'),
        br: q('Fill-ins', 'easy to do but lower impact', 'Pick these up if time allows.', 'amber'),
        bl: q('Thankless tasks', 'hard to do and lower impact', 'Drop these, or rethink them to make them easier or more useful.', 'grey')
      },
      title: 'Ideas to reduce discharge delays (example)',
      example: [
        ['Daily 9am board round on every ward', 8, 9], ['Tell families the expected discharge date on admission', 8, 9],
        ['Write discharge medicines the day before', 7, 8], ['Criteria-led discharge on two pilot wards', 6, 8],
        ['Discharge co-ordinator role', 3, 9], ['Weekend senior review', 2, 8], ['Discharge lounge open until 8pm', 4, 7],
        ['Electronic discharge summary template', 6, 5], ['Transport booking checklist', 9, 4], ['Patient discharge leaflet', 9, 3],
        ['New bed management system', 1, 5], ['Redesign the therapy staffing model', 2, 4]
      ]
    },
    stakeholder: {
      about: 'Map the people and groups your project affects by how much they can influence it and how interested they are, to plan how to involve each one.',
      item: ['stakeholder', 'stakeholders'], focus: 'tr',
      listTip: 'Include patients and carers, staff groups, managers, other teams and services, and anyone who could help or block the change.',
      x: { name: 'Interest', match: /interest/i, lo: 'Less interested', hi: 'More interested', guide: ['not interested', 'very interested'], help: 'how much they care about the project or will be affected by it' },
      y: { name: 'Influence', match: /influence|power/i, lo: 'Less', hi: 'More', guide: ['very little', 'a lot'], help: 'how much they can help or block the project, through their role, authority or the respect of others' },
      quads: {
        tr: q('Manage closely', 'high influence and high interest', 'Key players. Involve them early and often, in planning and decisions.', 'green'),
        tl: q('Keep satisfied', 'high influence but less interest', 'Keep them on side and meet their needs without overloading them. Their interest may grow.', 'blue'),
        br: q('Keep informed', 'high interest but less influence', 'Keep them updated and listen to them. They often make good champions and testers.', 'amber'),
        bl: q('Monitor', 'less influence and less interest', 'Give general updates and watch for changes in their position.', 'grey')
      },
      title: 'Stakeholders for the discharge project (example)',
      example: [
        ['Ward managers', 9, 7], ['Matron', 8, 8], ['Director of nursing', 5, 9], ['Clinical lead consultant', 6, 8],
        ['Pharmacy lead', 6, 6], ['IT department', 3, 7], ['Finance business partner', 2, 6], ['Junior doctors', 7, 3],
        ['Healthcare assistants', 8, 3], ['Patients and families', 9, 2], ['Patient experience team', 7, 4], ['Estates team', 2, 3]
      ]
    },
    confidence_impact: {
      about: 'Sort change ideas by how sure you are they will work here and how much difference they would make, to decide which to test with PDSA cycles and which are ready to implement.',
      item: ['idea', 'ideas'], focus: 'tr',
      listTip: 'Ideas can come from a driver diagram, from other teams or organisations, or from earlier PDSA cycles.',
      x: { name: 'Confidence', match: /confiden|certain|evidence/i, lo: 'Less sure', hi: 'More sure', guide: ['no idea if it will work', 'sure it will work'], help: 'how sure you are that it will work here, from published evidence, other organisations or your own tests' },
      y: IMPACT,
      quads: {
        tr: q('Implement', 'high impact and likely to work', 'Ready to implement and spread. Keep measuring to check the gain holds.', 'green'),
        tl: q('Test first', 'high impact but unproven', 'Test these on a small scale with PDSA cycles to build confidence before going bigger.', 'blue'),
        br: q('Adopt if easy', 'likely to work but lower impact', 'Adopt these if they are simple to put in place, without distracting from bigger gains.', 'amber'),
        bl: q('Park', 'unproven and lower impact', 'Park these for now and revisit them later.', 'grey')
      },
      title: 'Ideas to reduce discharge delays (example)',
      example: [
        ['Daily safety and discharge huddle', 9, 8], ['Write discharge medicines the day before', 8, 8], ['Criteria-led discharge', 4, 9],
        ['Ward-based pharmacist', 5, 9], ['Discharge co-ordinator role', 3, 8], ['Redesign ward rounds', 2, 7],
        ['Text reminders to families', 6, 6], ['Transport booking checklist', 8, 4], ['Patient discharge leaflet', 7, 3],
        ['Volunteer drivers', 3, 4], ['Discharge music in the lounge', 2, 2]
      ]
    },
    urgency_importance: {
      about: 'Sort the tasks on your project by how urgent and how important they are (an Eisenhower matrix), so time goes to what matters most.',
      item: ['task', 'tasks'], focus: 'tr',
      listTip: 'List everything on your project to-do list, including meetings, data collection and communications.',
      x: { name: 'Urgency', match: /urgen/i, lo: 'Can wait', hi: 'More urgent', guide: ['can wait', 'needs doing now'], help: 'how soon it needs doing, such as a deadline coming up' },
      y: Object.assign({ help: 'how much it matters to your aim, your patients or your team' }, IMPORTANCE),
      quads: {
        tr: q('Do now', 'important and urgent', 'Do these first, yourself.', 'red'),
        tl: q('Schedule', 'important but not urgent', 'Book time for these and protect it. Much of the real improvement work sits here.', 'blue'),
        br: q('Delegate', 'urgent but less important', 'Hand these on if you can, or do them quickly.', 'amber'),
        bl: q('Drop', 'less important and not urgent', 'Stop doing these, or leave them until there is time.', 'grey')
      },
      title: 'Discharge project tasks this month (example)',
      example: [
        ['Submit this month’s data for the board report', 9, 8], ['Book the PDSA cycle 2 review huddle', 8, 7],
        ['Agree the aim statement with the sponsor', 4, 9], ['Plan the measurement strategy', 3, 9],
        ['Train ward staff in the new process', 5, 8], ['Chase the room booking', 9, 4], ['Reply to the newsletter request', 8, 3],
        ['Update the project poster', 7, 2], ['Watch an optional webinar', 3, 3], ['Tidy the shared drive', 2, 2]
      ]
    },
    risk: {
      about: 'Sort the risks to your project or to a change by how likely they are and how serious they would be, so you know which to act on now.',
      item: ['risk', 'risks'], focus: 'tr',
      listTip: 'Think about risks to patients, staff, data, time, money and support for the project.',
      x: { name: 'Likelihood', match: /likel|probab/i, lo: 'Less likely', hi: 'More likely', guide: ['rare', 'almost certain'], help: 'how likely it is to happen' },
      y: { name: 'Consequence', match: /consequ|sever/i, lo: 'Minor', hi: 'Serious', guide: ['negligible', 'catastrophic'], help: 'how bad it would be for patients, staff or the project if it happened' },
      quads: {
        tr: q('Act now', 'likely and serious', 'Act to reduce these before you go on, and name an owner for each.', 'red'),
        tl: q('Plan for it', 'unlikely but serious', 'Have a contingency plan ready and watch for early warning signs.', 'amber'),
        br: q('Manage', 'likely but minor', 'Put simple checks in place and keep an eye on them.', 'blue'),
        bl: q('Accept', 'unlikely and minor', 'Accept these and review them from time to time.', 'green')
      },
      title: 'Risks to the discharge project (example)',
      example: [
        ['Staff too busy to collect data', 8, 6], ['Agency staff not briefed on the new process', 7, 7],
        ['New process delays medicines', 3, 9], ['IT downtime during a test', 4, 8], ['Project sponsor leaves', 2, 7],
        ['Funding withdrawn', 2, 9], ['Data entry errors', 7, 4], ['Few patients return the survey', 8, 3], ['Printed forms run out', 6, 2],
        ['Meeting room double-booked', 3, 2], ['Laminator breaks', 2, 1]
      ]
    },
    importance_performance: {
      about: 'Compare how important each aspect of care is to patients with how well you do it now (importance and performance analysis), to find where to improve first. Survey results work well.',
      item: ['aspect of care', 'aspects of care'], focus: 'tl', xDesc: false,
      listTip: 'Use the questions or themes from a patient or staff survey, or from complaints and compliments.',
      x: { name: 'Performance', match: /perform|satisf|rating/i, lo: 'Worse', hi: 'Better', guide: ['very poor', 'excellent'], help: 'how well you do it now, for example from survey results or audit' },
      y: Object.assign({ help: 'how much it matters to patients' }, IMPORTANCE),
      quads: {
        tr: q('Keep it up', 'important and done well', 'Strengths to protect and celebrate.', 'green'),
        tl: q('Focus here', 'important but done poorly', 'Your biggest opportunities to improve. Start here.', 'red'),
        br: q('Possible overkill', 'less important but done well', 'You may be putting in more effort than patients need, so consider moving some of it to Focus here.', 'blue'),
        bl: q('Low priority', 'less important and done poorly', 'Improve these when time allows.', 'grey')
      },
      title: 'Inpatient survey results (example)',
      example: [
        ['Kind and caring staff', 9, 9], ['Pain managed well', 7, 9], ['Clean ward', 8, 8], ['Told about delays', 3, 9],
        ['Information on going home', 4, 8], ['Noise at night', 3, 7], ['Food quality', 4, 5], ['Visiting times', 7, 4],
        ['Car parking', 2, 4], ['Wi-fi', 3, 2], ['Choice of newspapers', 8, 2]
      ]
    }
  };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

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

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '2x2-matrix';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const count = (n, item) => n + ' ' + (n === 1 ? item[0] : item[1]);
  const joinList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  // The matrix type in use. A custom matrix is built from its axis and group names.
  function preset(id) {
    id = id || els.preset.value;
    if (PRESETS[id]) return Object.assign({ id, xDesc: true }, PRESETS[id]);
    const x = els.cX.value.trim() || 'Across', y = els.cY.value.trim() || 'Up';
    const axis = name => ({ name, match: new RegExp('^\\s*' + escRe(name), 'i'), lo: 'Lower', hi: 'Higher', guide: ['very low', 'very high'], help: 'its ' + name.toLowerCase() + ' score' });
    const dflt = (hy, hx) => `${hy ? 'high' : 'low'} ${y.toLowerCase()}, ${hx ? 'high' : 'low'} ${x.toLowerCase()}`;
    const grp = (el, hy, hx, tone) => q(el.value.trim() || cap(dflt(hy, hx)), dflt(hy, hx), '', tone);
    return {
      id: 'custom', xDesc: true, custom: true, item: ['item', 'items'], focus: 'tr',
      about: 'Name your own two measures and, if you like, the four groups they make.',
      listTip: '', x: axis(x), y: axis(y),
      quads: { tr: grp(els.cTR, 1, 1, 'green'), tl: grp(els.cTL, 1, 0, 'blue'), br: grp(els.cBR, 0, 1, 'amber'), bl: grp(els.cBL, 0, 0, 'grey') },
      title: 'Ideas by patient and staff benefit (example)',
      example: [
        ['Protected meal breaks', 8, 6], ['Bedside medicines lockers', 6, 8], ['Volunteer ward guides', 3, 8],
        ['Electronic handover', 8, 3], ['Ward quiet hour', 4, 7], ['New uniforms', 5, 1], ['Extra paperwork audit', 1, 2]
      ],
      exampleNames: { cX: 'Staff benefit', cY: 'Patient benefit', cTR: 'Win-win', cTL: 'Patient-focused', cBR: 'Staff-focused', cBL: 'Rethink' }
    };
  }
  function applyPreset() {
    const p = preset();
    els.customBox.hidden = !p.custom;
    els.presetNote.textContent = p.about;
    els.dataHint.textContent = `One ${p.item[0]} per row: its name in the first column, then its ${p.x.name.toLowerCase()} score and its ${p.y.name.toLowerCase()} score. With column headings, the ${p.x.name} and ${p.y.name} columns are found by name, in any order, and any others (such as notes or owner) are ignored.`;
    const ex = p.example.slice(0, 3);
    els.data.placeholder = [cap(p.item[0]), p.x.name, p.y.name].join('\t') + '\n' + ex.map(r => r.join('\t')).join('\n');
    els.title.placeholder = 'e.g. ' + p.title.replace(/ \(example\)$/, '');
    $('xSplitLabel').textContent = `Split ${p.x.name.toLowerCase()} at`;
    $('ySplitLabel').textContent = `Split ${p.y.name.toLowerCase()} at`;
  }

  // ---- parsing ----
  // Shared statistics, from /assets/js/focus-stats.js
  const { splitTable, readNumber } = FocusStats;

  function split(text) {
    // with no delimiter, a line is a label then two numbers ("Fix the rota 3 2")
    const s = splitTable(text, { space: t => { const m = t.match(/^(.*?)\s+(-?[\d.]+)\s+(-?[\d.]+)$/); return m ? [m[1], m[2], m[3]] : [t]; } });
    return s && { recs: s.recs };
  }

  const num = raw => readNumber(raw);
  function headerGuess(text) {
    const s = split(text); if (!s || s.recs.length < 2) return false;
    const h = s.recs[0];
    return h.length > 1 && h.slice(1, 3).some(v => v !== '' && !isFinite(num(v)));
  }
  // A heading without its scoring guide, e.g. "Ease (1 = very hard, 10 = very easy)" -> "Ease".
  const bare = h => (h || '').replace(/\s*\(.*\)\s*$/, '');
  // Columns for the two scores, found by their headings.
  function columns(head, p) {
    const find = re => head.findIndex(h => re.test(bare(h)));
    const xi = find(p.x.match), yi = find(p.y.match);
    return xi >= 0 && yi >= 0 && xi !== yi ? { xi, yi } : null;
  }
  // Another matrix type whose headings match a pasted table, such as a data sheet from it.
  function presetForHeadings(text) {
    const s = split(text); if (!s || !headerGuess(text)) return null;
    if (columns(s.recs[0], preset())) return null;
    return Object.keys(PRESETS).find(id => columns(s.recs[0], preset(id))) || null;
  }
  function parse(text, hasHeader, p) {
    const s = split(text);
    if (!s) return null;
    const head = hasHeader ? s.recs[0] : null;
    const data = hasHeader ? s.recs.slice(1) : s.recs;
    let ci = 0, xi = 1, yi = 2;
    const cols = head && columns(head, p);
    if (cols) {
      ({ xi, yi } = cols);
      const named = head.findIndex((h, i) => i !== xi && i !== yi && /idea|change|action|option|solution|stakeholder|name|task|risk|aspect|item|question/i.test(h));
      ci = named >= 0 ? named : head.findIndex((_, i) => i !== xi && i !== yi);
      if (ci < 0) ci = 0;
    }
    const items = [], unscored = [];
    data.forEach(r => {
      const name = (r[ci] || '').trim(), x = num(r[xi]), y = num(r[yi]);
      if (!name && !isFinite(x) && !isFinite(y)) return;
      if (!isFinite(x) || !isFinite(y)) { if (name) unscored.push(name); return; }
      items.push({ name: name || '(no name)', x, y });
    });
    return { items, unscored, xHead: head ? bare(head[xi]) : '', yHead: head ? bare(head[yi]) : '' };
  }
  function pickScale(items) {
    const choice = radio('scale');
    if (choice === '5') return { lo: 1, hi: 5, auto: false };
    if (choice === '10') return { lo: 1, hi: 10, auto: false };
    const all = items.flatMap(p => [p.x, p.y]);
    const max = all.length ? Math.max(...all) : 10, min = all.length ? Math.min(...all) : 1;
    const hi = max <= 5 ? 5 : max <= 10 ? 10 : 100;
    return { lo: min < 1 ? 0 : 1, hi, auto: true };
  }
  const quadOf = (p, xs, ys) => (p.y >= ys ? 't' : 'b') + (p.x >= xs ? 'r' : 'l');

  // ---- chart ----
  function renderSVG(d, o) {
    const { items, sc, xs: xSplit, ys: ySplit, p: pr } = d;
    const W = drawW, ML = 78, MR = 24, MT = o.title ? 62 : 22, plotW = W - ML - MR, plotH = 600, MB = 70, H = MT + plotH + MB;
    const pad = (sc.hi - sc.lo) * 0.06, lo = sc.lo - pad, hi = sc.hi + pad;
    const X = v => ML + (v - lo) / (hi - lo) * plotW;
    const Y = v => MT + plotH - (v - lo) / (hi - lo) * plotH;
    const halo = 'paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"';
    const s = [];
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`);
    s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (o.title) s.push(`<text x="${ML}" y="38" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(trunc(o.title, Math.min(70, Math.floor((W - (ML) - 16) / 12.32))))}</text>`);

    // quadrant backgrounds and names
    const xs = Math.min(Math.max(X(xSplit), ML), ML + plotW), ys = Math.min(Math.max(Y(ySplit), MT), MT + plotH);
    const areas = {
      tl: [ML, MT, xs - ML, ys - MT, 'start', ML + 12, MT + 24],
      tr: [xs, MT, ML + plotW - xs, ys - MT, 'end', ML + plotW - 12, MT + 24],
      bl: [ML, ys, xs - ML, MT + plotH - ys, 'start', ML + 12, MT + plotH - 14],
      br: [xs, ys, ML + plotW - xs, MT + plotH - ys, 'end', ML + plotW - 12, MT + plotH - 14]
    };
    ORDER.forEach(k => {
      const [x, y, w, h] = areas[k];
      if (w > 0 && h > 0) s.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TONES[pr.quads[k].tone].tint}"/>`);
    });
    // grid at each whole score (or every 10 on a 0 to 100 scale)
    const step = sc.hi - sc.lo > 20 ? 10 : 1, ticks = [];
    for (let v = Math.ceil(sc.lo / step) * step; v <= sc.hi; v += step) ticks.push(v);
    ticks.forEach(v => {
      s.push(`<line x1="${X(v)}" y1="${MT}" x2="${X(v)}" y2="${MT + plotH}" stroke="#ffffff" stroke-width="1.5" opacity=".9"/>`);
      s.push(`<line x1="${ML}" y1="${Y(v)}" x2="${ML + plotW}" y2="${Y(v)}" stroke="#ffffff" stroke-width="1.5" opacity=".9"/>`);
      s.push(`<text x="${X(v)}" y="${MT + plotH + 20}" font-size="12" text-anchor="middle" fill="${COLORS.muted}">${nf.format(v)}</text>`);
      s.push(`<text x="${ML - 10}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${nf.format(v)}</text>`);
    });
    ORDER.forEach(k => {
      const [, , w, h, anchor, tx, ty] = areas[k];
      if (w < 100 || h < 40) return;
      s.push(`<text x="${tx}" y="${ty}" font-size="17" font-weight="800" text-anchor="${anchor}" fill="${TONES[pr.quads[k].tone].ink}" opacity=".85">${esc(trunc(pr.quads[k].name, Math.floor((w - 24) / 9.5)))}</text>`);
    });
    // dividing lines and frame
    s.push(`<line x1="${xs}" y1="${MT}" x2="${xs}" y2="${MT + plotH}" stroke="${COLORS.ink}" stroke-width="2" stroke-dasharray="7 5"/>`);
    s.push(`<line x1="${ML}" y1="${ys}" x2="${ML + plotW}" y2="${ys}" stroke="${COLORS.ink}" stroke-width="2" stroke-dasharray="7 5"/>`);
    s.push(`<rect x="${ML}" y="${MT}" width="${plotW}" height="${plotH}" fill="none" stroke="${COLORS.ink}" stroke-width="1.5"/>`);

    // place dots, spreading out items with the same scores so all can be seen
    const R = 13, groups = new Map();
    items.forEach(p => { const k = p.x + '|' + p.y; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
    groups.forEach(g => {
      const n = g.length, rad = n > 1 ? Math.max(R + 3, (2 * R + 4) * n / (2 * Math.PI)) : 0;
      g.forEach((p, i) => {
        const a = -Math.PI / 2 + 2 * Math.PI * i / n;
        p.px = X(p.x) + rad * Math.cos(a); p.py = Y(p.y) + rad * Math.sin(a);
      });
    });
    const boxes = items.map(p => ({ x: p.px - R, y: p.py - R, w: 2 * R, h: 2 * R }));
    const hits = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const inside = b => b.x >= ML + 2 && b.x + b.w <= ML + plotW - 2 && b.y >= MT + 2 && b.y + b.h <= MT + plotH - 2;
    const labels = [];
    if (o.showNames) {
      [...items].sort((a, b) => b.y - a.y || b.x - a.x).forEach(p => {
        const t = trunc(p.name, 30), w = t.length * 6.7 + 4, h = 15;
        const tries = [
          { x: p.px + R + 4, y: p.py - h / 2 }, { x: p.px - R - 4 - w, y: p.py - h / 2 },
          { x: p.px - w / 2, y: p.py - R - 3 - h }, { x: p.px - w / 2, y: p.py + R + 3 },
          { x: p.px + R, y: p.py - R - h }, { x: p.px - R - w, y: p.py - R - h },
          { x: p.px + R, y: p.py + R }, { x: p.px - R - w, y: p.py + R }
        ].map(c => ({ ...c, w, h }));
        const b = tries.find(c => inside(c) && !hits(c)) || tries.find(inside) || tries[0];
        boxes.push(b); labels.push({ b, t, name: p.name });
      });
    }
    items.forEach(p => {
      const g = pr.quads[p.quad], tone = TONES[g.tone];
      s.push(`<g><title>${esc(`${p.n}. ${p.name}: ${o.xLabel} ${nf.format(p.x)}, ${o.yLabel} ${nf.format(p.y)} (${g.name})`)}</title>` +
        `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="${R}" fill="${tone.dot}" stroke="#ffffff" stroke-width="2"/>` +
        `<text x="${p.px.toFixed(1)}" y="${(p.py + 4).toFixed(1)}" font-size="${p.n > 99 ? 9 : 12}" font-weight="800" text-anchor="middle" fill="${tone.dark ? COLORS.ink : '#ffffff'}">${p.n}</text></g>`);
    });
    labels.forEach(l => s.push(`<text x="${l.b.x.toFixed(1)}" y="${(l.b.y + 11.5).toFixed(1)}" font-size="12" font-weight="600" fill="${COLORS.ink}" ${halo}><title>${esc(l.name)}</title>${esc(l.t)}</text>`));

    // axis titles, with which way is which at each end
    const base = MT + plotH;
    s.push(`<text x="${ML}" y="${base + 44}" font-size="12" fill="${COLORS.muted}">← ${esc(pr.x.lo)}</text>`);
    s.push(`<text x="${ML + plotW}" y="${base + 44}" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(pr.x.hi)} →</text>`);
    s.push(`<text x="${ML + plotW / 2}" y="${base + 44}" font-size="14" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.xLabel, 70))}</text>`);
    s.push(`<text transform="translate(24 ${MT + plotH / 2}) rotate(-90)" font-size="14" font-weight="700" text-anchor="middle" fill="${COLORS.ink}">${esc(trunc(o.yLabel, 50))}</text>`);
    s.push(`<text transform="translate(24 ${MT + plotH}) rotate(-90)" font-size="12" fill="${COLORS.muted}">← ${esc(pr.y.lo)}</text>`);
    s.push(`<text transform="translate(24 ${MT}) rotate(-90)" font-size="12" text-anchor="end" fill="${COLORS.muted}">${esc(pr.y.hi)} →</text>`);
    s.push('</svg>');
    return s.join('');
  }

  // ---- summary ----
  function summarise(d, xLabel, yLabel) {
    const { p, items } = d;
    // Highest up first, then furthest right (or furthest left where low across is worse).
    const rank = (a, b) => b.y - a.y || (p.xDesc ? b.x - a.x : a.x - b.x);
    const groups = {}; ORDER.forEach(k => { groups[k] = items.filter(i => i.quad === k).sort(rank); });
    const n = items.length, f = p.focus, nf_ = groups[f].length, fq = p.quads[f];
    let head;
    if (nf_ === n) head = `All <strong>${count(n, p.item)}</strong> fall in <strong>${esc(fq.name)}</strong>: ${esc(fq.desc)}`;
    else if (nf_) head = `<strong>${nf_} of ${count(n, p.item)}</strong> ${nf_ === 1 ? 'falls' : 'fall'} in <strong>${esc(fq.name)}</strong>: ${esc(fq.desc)}`;
    else head = `None of your ${count(n, p.item)} ${n === 1 ? 'falls' : 'fall'} in <strong>${esc(fq.name)}</strong> (${esc(fq.desc)})`;
    const scores = i => `${xLabel.toLowerCase()} ${nf.format(i.x)}, ${yLabel.toLowerCase()} ${nf.format(i.y)}`;
    let sub = nf_ ? `Top of the list: ${groups[f][0].name} (${scores(groups[f][0])}).` : '';
    if (nf_ < n) sub += ` The rest: ${joinList(ORDER.filter(k => k !== f).map(k => `${groups[k].length} in ${p.quads[k].name}`))}.`;
    return { head, sub: sub.trim(), groups, scores };
  }

  // ---- render ----
  function update() {
    const p = preset();
    const text = els.data.value;
    if (!headerTouched) els.hasHeader.checked = headerGuess(text);
    const d = parse(text, els.hasHeader.checked, p);
    if (!d) { els.detected.textContent = ''; current = null; els.scaleNote.textContent = 'Worked out from your scores.'; return renderEmpty(`Paste your scored ${p.item[1]} on the left to build your matrix.`); }

    const sc = pickScale(d.items);
    const outside = d.items.filter(i => i.x < sc.lo || i.x > sc.hi || i.y < sc.lo || i.y > sc.hi);
    d.items = d.items.filter(i => !outside.includes(i));
    d.items.forEach((i, k) => { i.n = k + 1; });
    const mid = (sc.lo + sc.hi) / 2;
    const splitVal = el => { const v = num(el.value); return isFinite(v) ? v : mid; };
    d.p = p; d.sc = sc; d.xs = splitVal(els.xSplit); d.ys = splitVal(els.ySplit);
    els.xSplit.placeholder = els.ySplit.placeholder = nf.format(mid);
    els.scaleNote.textContent = (sc.auto ? 'Detected ' : 'Using ') + `scores from ${sc.lo} to ${sc.hi}.`;
    d.items.forEach(i => { i.quad = quadOf(i, d.xs, d.ys); });

    let note = (switched ? `Switched the matrix type to match your column headings. ` : '') + (d.items.length ? `Reading ${count(d.items.length, ['scored ' + p.item[0], 'scored ' + p.item[1]])}.` : '');
    switched = false;
    if (d.unscored.length) note += ` ${count(d.unscored.length, p.item)} still ${d.unscored.length === 1 ? 'needs' : 'need'} both scores: ${trunc(d.unscored.join(', '), 120)}.`;
    if (outside.length) note += ` ${count(outside.length, p.item)} left out because ${outside.length === 1 ? 'its scores are' : 'their scores are'} outside ${sc.lo} to ${sc.hi}.`;
    els.detected.textContent = note.trim();
    els.xLabel.placeholder = d.xHead || p.x.name;
    els.yLabel.placeholder = d.yHead || p.y.name;

    if (!d.items.length) { current = null; return renderEmpty(d.unscored.length ? `Give each ${p.item[0]} a ${p.x.name.toLowerCase()} score and a ${p.y.name.toLowerCase()} score, in the two columns after its name.` : `Paste one ${p.item[0]} per row, with a ${p.x.name.toLowerCase()} score and a ${p.y.name.toLowerCase()} score after it.`); }

    const title = els.title.value.trim();
    const xLabel = els.xLabel.value.trim() || d.xHead || p.x.name;
    const yLabel = els.yLabel.value.trim() || d.yHead || p.y.name;
    const sm = summarise(d, xLabel, yLabel);
    const plain = sm.head.replace(/<[^>]+>/g, '');
    trackChart({ points: d.items.length });
    const svg = drawShown(() => renderSVG(d, {
      title, xLabel, yLabel, showNames: els.showNames.checked,
      aria: (title ? title + '. ' : '') + `2x2 matrix of ${count(d.items.length, p.item)}, ${xLabel} across and ${yLabel} up. ${plain}.`
    }));
    current = { d, sm, title, xLabel, yLabel };

    const sameScores = new Set(d.items.map(i => i.x + '|' + i.y)).size < d.items.length;
    const tone = k => TONES[p.quads[k].tone];
    const sw = k => `<span class="sw" style="background:${tone(k).dot}" aria-hidden="true"></span>`;
    const numDot = i => `<span class="qnum${tone(i.quad).dark ? ' dark' : ''}" style="background:${tone(i.quad).dot}">${i.n}</span>`;
    const quadBlock = k => {
      const g = p.quads[k], list = sm.groups[k];
      return `
      <h3 class="qhead">${sw(k)}${esc(g.name)} (${list.length})</h3>
      <p class="qadvice">${esc(cap(g.desc))}.${g.advice ? ' ' + esc(g.advice) : ''}</p>
      ${list.length ? `<ul class="qlist">${list.map(i => `<li>${numDot(i)}<span>${esc(i.name)}</span><span class="scores">${esc(xLabel.toLowerCase())} ${nf.format(i.x)} · ${esc(yLabel.toLowerCase())} ${nf.format(i.y)}</span></li>`).join('')}</ul>` : `<p class="none">No ${p.item[1]} here.</p>`}`;
    };
    // Show the group to act on first, then the rest.
    const shown = [p.focus].concat(ORDER.filter(k => k !== p.focus));

    els.result.innerHTML = `
      <p class="summary">${sm.head}.</p>
      ${sm.sub ? `<p class="focuson">${esc(sm.sub)}</p>` : ''}
      <div class="chartwrap fit" id="chart">${svg}</div>
      ${sameScores ? `<p class="hint">${cap(p.item[1])} with the same scores are spread out a little so you can see them all.</p>` : ''}
      <div class="reading">${shown.map(quadBlock).join('')}</div>
      <details class="values">
        <summary>All ${p.item[1]} as a table</summary>
        <div class="tablewrap">
          <table>
            <thead><tr><th class="num">No.</th><th>${esc(cap(p.item[0]))}</th><th class="num">${esc(xLabel)}</th><th class="num">${esc(yLabel)}</th><th>Group</th></tr></thead>
            <tbody>${d.items.map(i => `<tr><td class="num">${i.n}</td><td>${esc(i.name)}</td><td class="num">${nf.format(i.x)}</td><td class="num">${nf.format(i.y)}</td><td>${sw(i.quad)}${esc(p.quads[i.quad].name)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </details>`;
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
    const { d, xLabel, yLabel } = current;
    return [['No.', cap(d.p.item[0]), xLabel, yLabel, 'Group']].concat(d.items.map(i => [i.n, i.name, i.x, i.y, d.p.quads[i.quad].name]));
  }
  function summaryText() {
    const { d, sm, title, xLabel, yLabel } = current, p = d.p;
    const lines = [];
    if (title) lines.push(title, '');
    lines.push(sm.head.replace(/<[^>]+>/g, '') + '.');
    if (sm.sub) lines.push(sm.sub);
    lines.push('', `Scores from ${d.sc.lo} to ${d.sc.hi}; ${xLabel.toLowerCase()} split at ${nf.format(d.xs)} and ${yLabel.toLowerCase()} split at ${nf.format(d.ys)}.`, '');
    [p.focus].concat(ORDER.filter(k => k !== p.focus)).forEach(k => {
      const g = p.quads[k];
      lines.push(`${g.name} (${sm.groups[k].length}): ${cap(g.desc)}.${g.advice ? ' ' + g.advice : ''}`);
      sm.groups[k].forEach(i => lines.push(`  ${i.n}. ${i.name} (${sm.scores(i)})`));
      lines.push('');
    });
    return lines.join('\n').trim();
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
  // The example for the matrix type that is selected.
  function loadExample() {
    let p = preset();
    if (p.custom) { Object.keys(p.exampleNames).forEach(id => { els[id].value = p.exampleNames[id]; }); p = preset(); }
    els.data.value = [[cap(p.item[0]), p.x.name, p.y.name].join('\t')].concat(p.example.map(r => r.join('\t'))).join('\n');
    els.title.value = p.title;
    els.xLabel.value = ''; els.yLabel.value = ''; els.xSplit.value = ''; els.ySplit.value = '';
    document.querySelector('input[name=scale][value=auto]').checked = true;
    headerTouched = false;
    applyPreset(); update();
  }

  // ---- data collection sheet ----
  // The parse step finds the two score columns by their headings, and ignores Notes.
  // Items already in the box are carried over, so a list can be shared for scoring.
  function dataSheet() {
    const p = preset(), hi = radio('scale') === '5' ? 5 : 10, One = cap(p.item[0]);
    const d = parse(els.data.value, els.hasHeader.checked, p);
    const have = d ? d.items.map(i => [i.name, i.x, i.y]).concat(d.unscored.map(n => [n, '', ''])) : [];
    const blank = Math.max(20, have.length + 10);
    const head = [One, `${p.x.name} (1 = ${p.x.guide[0]}, ${hi} = ${p.x.guide[1]})`, `${p.y.name} (1 = ${p.y.guide[0]}, ${hi} = ${p.y.guide[1]})`, 'Notes'].map(v => ({ v, s: 'head' }));
    const rows = [head];
    for (let i = 0; i < blank; i++) {
      const h = have[i] || ['', '', ''];
      rows.push([{ v: h[0], s: 'input' }, { v: h[1], s: 'input' }, { v: h[2], s: 'input' }, { v: '', s: 'input' }]);
    }
    const mid = nf.format((1 + hi) / 2);
    const notes = [
      'About this matrix',
      p.about,
      '',
      `Listing your ${p.item[1]}`,
      `1. List each ${p.item[0]} in the ${One} column on the Data sheet, one per row.${p.listTip ? ' ' + p.listTip : ''}`,
      '',
      'Scoring',
      `2. ${p.x.name}: ${p.x.help}, from 1 (${p.x.guide[0]}) to ${hi} (${p.x.guide[1]}).`,
      `3. ${p.y.name}: ${p.y.help}, from 1 (${p.y.guide[0]}) to ${hi} (${p.y.guide[1]}).`,
      '4. Agree what a low and a high score look like before you start. Score together, or each person separately and then talk through any big differences.',
      '5. Use the Notes column for owners, actions or the reasons behind a score. Leave a score blank if you are not sure yet.',
      '',
      'Building the matrix',
      'Save this workbook, then in the 2x2 matrix tool choose Data sheet, then Import filled data sheet, and pick this file. Or select the whole table on the Data sheet, including the headings, copy it and paste it into the tool. It picks the matching matrix type from the headings.',
      `Scores of ${mid} or more count as high. You can change where the matrix is split in the tool. The four groups are:`,
      ...ORDER.map(k => `${p.quads[k].name}: ${p.quads[k].desc}.${p.quads[k].advice ? ' ' + p.quads[k].advice : ''}`)
    ];
    const titles = new Set(['About this matrix', `Listing your ${p.item[1]}`, 'Scoring', 'Building the matrix']);
    return [
      { name: 'Data', cols: [48, 22, 22, 40], rows, freeze: 1 },
      { name: 'Instructions', cols: [100], rows: notes.map(v => [{ v, s: titles.has(v) ? 'title' : 'wrap' }]) }
    ];
  }

  // ---- events ----
  let switched = false;
  els.data.addEventListener('input', () => {
    // A pasted data sheet from another matrix type switches to that type.
    const id = presetForHeadings(els.data.value);
    if (id) { els.preset.value = id; switched = true; applyPreset(); }
    schedule();
  });
  els.hasHeader.addEventListener('change', () => { headerTouched = true; update(); });
  trackSettings({ matrixType: 'preset', scale: 'scale', showNames: 'showNames' });
  els.preset.addEventListener('change', () => { applyPreset(); update(); });
  ['cX', 'cY', 'cTL', 'cTR', 'cBL', 'cBR'].forEach(id => els[id].addEventListener('input', () => { applyPreset(); schedule(); }));
  ['title', 'xLabel', 'yLabel', 'xSplit', 'ySplit'].forEach(id => els[id].addEventListener('input', schedule));
  els.showNames.addEventListener('change', update);
  document.querySelectorAll('input[name=scale]').forEach(r => r.addEventListener('change', update));
  $('exampleBtn2').addEventListener('click', loadExample);
  $('clearBtn').addEventListener('click', () => { ['data', 'title', 'xLabel', 'yLabel', 'xSplit', 'ySplit'].forEach(id => { els[id].value = ''; }); headerTouched = false; els.hasHeader.checked = false; update(); els.data.focus(); trackCleared(); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });

  applyPreset();
  update(); // start empty, ready for the user's data

  // ---- shared toolbar (Data sheet, Example, Open, Save, Export) ----
  FocusActions.mount({
    tool: 'matrix_2x2', formerIds: ['prioritisation_matrix'], toolName: '2x2 matrix',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    afterOpen: () => { headerTouched = true; applyPreset(); update(); },
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) }))),
    template: {
      fileName: () => slug(els.preset.value.replace(/_/g, '-')) + '-data-sheet.xlsx',
      title: 'Download a spreadsheet to list your items and score them for this matrix type',
      sheets: dataSheet,
      import: [{ sheet: 'Data', into: '#data' }]
    }
  });
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = {
    question: $('question'), data: $('data'), hasHeader: $('hasHeader'), detected: $('detected'),
    colsBox: $('colsBox'), textCol: $('textCol'), idCol: $('idCol'), groupCol: $('groupCol'),
    importBox: $('importBox'), importNote: $('importNote'),
    sampleN: $('sampleN'), sampleBox: $('sampleBox'), boostWrap: $('boostWrap'), boostBox: $('boostBox'), sampleNote: $('sampleNote'),
    empty: $('empty'), work: $('work'), thickAt: $('thickAt'), ovOut: $('ovOut'),
    wcFilter: $('wcFilter'), wcMax: $('wcMax'), wcMin: $('wcMin'), wcExclude: $('wcExclude'), wcStop: $('wcStop'), wcPlural: $('wcPlural'),
    cloudOut: $('cloudOut'), wordOut: $('wordOut'),
    approachNote: $('approachNote'), codesOut: $('codesOut'), newCode: $('newCode'), codeView: $('codeView'), codeSearch: $('codeSearch'),
    progress: $('progress'), listOut: $('listOut'), findOut: $('findOut'), method: $('method'), redact: $('redact')
  };
  const radio = n => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const INK = '#212B32', MUTED = '#4C6272';
  // Strong colours that read on white, for codes and words.
  const PALETTE = ['#005EB8', '#007F3B', '#AE2573', '#330072', '#8A1538', '#00667A', '#7A4600', '#003087', '#425563', '#5C2D91'];
  const OTHER = { id: 'other', name: 'Other', desc: 'Anything that doesn’t fit your codes yet. Look back at these regularly: they show what your codes are missing.', keywords: '', color: '#5C6F7E' };
  const SENT = { pos: 'Positive', neg: 'Negative', mix: 'Mixed', neu: 'Neutral' };
  const FLAGS = { quote: 'Potential quote', pii: 'Personal details', safe: 'Safeguarding' };
  const IMPACT = { high: 'High impact', some: 'Some impact', low: 'Low impact' };
  const STEPS = ['Reading the comments', 'Sentiment', 'Content analysis', 'Thematic analysis', 'Other methods'];
  const APPROACH = {
    deductive: 'Code against a set list of codes to answer a specific question, such as what people said about X, Y and Z. Use Other for anything that doesn’t fit, so you can show what the list misses.',
    inductive: 'Let the comments lead: add a code whenever a new topic comes up as you read. Your codes grow as you go, so look back over early responses once they settle.',
    combined: 'Start with the codes you need, such as those for routine reporting, and add new ones as they come up. Use Other for anything that doesn’t fit yet.'
  };
  const PAGE = 20;
  const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'qualitative-analysis';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const count = (n, item) => n + ' ' + (n === 1 ? item[0] : item[1]);
  const joinList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const RESP = ['response', 'responses'];
  const int = el => { const v = Math.round(Number(String(el.value).trim())); return isFinite(v) && String(el.value).trim() !== '' ? v : NaN; };
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const uniq = a => [...new Set(a)];
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  function hl(text, re) {
    if (!re) return esc(text);
    let out = '', last = 0;
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  // ---- checks before sharing ----
  const PII = [
    { label: 'email address', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, sub: '[email]' },
    { label: 'name', re: /\b(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Nurse|Sister|Prof|Professor)\.?\s+[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?/g, sub: '[name]' },
    { label: 'phone or NHS number', re: /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, sub: '[number]' },
    { label: 'postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, sub: '[postcode]' },
    { label: 'date', re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, sub: '[date]' }
  ];
  const SAFE = /\b(abus\w*|assault\w*|neglect\w*|self[- ]?harm\w*|suicid\w*|kill (?:my|him|her|them)sel\w*|overdos\w*|hit me|hurt me|threaten\w*|unsafe|scared of|afraid of|domestic violence|harass\w*|exploit\w*|groom\w*|restrain\w*)\b/i;
  const piiFound = t => PII.filter(p => t.search(p.re) >= 0).map(p => p.label);
  const redact = t => PII.reduce((s, p) => s.replace(p.re, p.sub), t);
  const shown = t => els.redact.checked ? redact(t) : t;

  // ---- words ----
  const STOP = new Set(('a about above after again against all am an and any are aren\'t as at be because been before being below between both but by can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each few for from further had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most mustn\'t my myself no nor not of off on once only or other ought our ours ourselves out over own same shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up very was wasn\'t we we\'d we\'ll we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom why why\'s with won\'t would wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves ' +
    'also just get got getting really much many one ones even still quite lot lots will us im ive dont didnt wasnt couldnt wouldnt cant isnt thats theyre youre etc way thing things however although though made make could would may might must shall every another able take took taken back know knew go went going come came say said see saw seen put').split(' '));
  const tokens = t => (t.toLowerCase().replace(/[’‘`]/g, "'").match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []).map(w => w.replace(/'s$/, ''));
  const POS = new Set('good great excellent brilliant amazing fantastic wonderful lovely kind kindness caring helpful friendly supportive supported respectful respect professional clean quick efficient prompt thank thanks thankful grateful happy pleased satisfied reassuring reassured compassionate polite courteous comfortable clear best perfect superb impressed attentive informative nice smooth easy outstanding marvellous listened empathic empathetic dignity calm welcoming proud heard'.split(' '));
  const NEG = new Set('bad poor terrible awful horrible rude slow late delay delays delayed dirty cold unhelpful ignored dismissive disappointed disappointing frustrating frustrated worried anxious scared upset angry joke worst unacceptable cancelled lost confusing confused unclear shortage shortages abandoned nuisance complaint complain difficult lonely painful uncomfortable neglect neglected unsafe unprofessional uncaring disgusting appalling chaotic chaos rushed unfriendly frightening frightened limited'.split(' '));
  const NEGATE = /^(not|never|no|nothing|isn't|wasn't|weren't|didn't|don't|doesn't|couldn't|wouldn't|hardly|without)$/;
  // A suggestion from the words used, for the analyst to accept or ignore.
  function sentHint(text) {
    const t = tokens(text);
    let p = 0, n = 0;
    t.forEach((w, i) => {
      const flip = [t[i - 1], t[i - 2], t[i - 3]].some(x => x && NEGATE.test(x));
      if (POS.has(w)) flip ? n++ : p++;
      else if (NEG.has(w)) flip ? p++ : n++;
    });
    return p && n ? 'mix' : p ? 'pos' : n ? 'neg' : '';
  }

  // ---- state ----
  const blankState = () => ({ codes: [], cid: 0, coding: {}, seq: 0, findings: {}, sample: null, boost: [] });
  let state = blankState();
  let data = null;      // the pasted table and the role of each column
  let rows = [];        // responses with a comment
  let tab = 'overview', page = 0, timer = null, chosenWord = null, cloud = null, headerTouched = false, colSig = '';

  const allCodes = () => state.codes.concat(OTHER);
  const codeById = id => allCodes().find(c => c.id === id);
  const codeByName = name => allCodes().find(c => c.name.toLowerCase() === String(name).trim().toLowerCase());
  function addCode(name, desc, keywords) {
    const usedColours = state.codes.map(c => c.color);
    const color = PALETTE.find(c => !usedColours.includes(c)) || PALETTE[state.codes.length % PALETTE.length];
    const c = { id: 'c' + (++state.cid), name: name.trim(), desc: desc || '', keywords: keywords || '', color };
    state.codes.push(c);
    return c;
  }
  const entry = key => state.coding[key] || (state.coding[key] = { codes: [], sent: '', note: '' });
  // Record the order responses were first coded in (for saturation), and drop empty entries.
  function touched(key) {
    const c = state.coding[key];
    if (!c) return;
    if (c.codes.length && !c.order) c.order = ++state.seq;
    if (!c.codes.length && !c.sent && !c.note && !c.quote && !c.pii && !c.safe) delete state.coding[key];
  }
  const thickAt = () => { const v = int(els.thickAt); return v > 1 ? v : 30; };
  const groupName = () => data && data.r.group >= 0 ? data.cols.names[data.r.group] : '';
  function activeRows() {
    if (radio('sample') === 'all' || !state.sample) return rows;
    const keep = new Set(state.sample.keys);
    return rows.filter(r => keep.has(r.key));
  }
  function usage(list) {
    const u = {}; allCodes().forEach(c => { u[c.id] = 0; });
    list.forEach(r => { const c = state.coding[r.key]; if (c) c.codes.forEach(id => { if (id in u) u[id]++; }); });
    return u;
  }
  const isCoded = r => { const c = state.coding[r.key]; return !!(c && c.codes.length); };
  function kwRe(code) {
    const kws = code.keywords.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    return kws.length ? new RegExp('\\b(' + kws.map(k => escRe(k).replace(/\s+/g, '\\s+')).join('|') + ')', 'i') : null;
  }

  // ---- parsing ----
  // Quote-aware split, so a comment with line breaks, which Excel copies inside quotes, stays in one cell.
  function parseDelimited(text, d) {
    const recs = []; let rec = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (c === d) { rec.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rec.push(cell); recs.push(rec); rec = []; cell = ''; }
      else cell += c;
    }
    if (q) return null;
    rec.push(cell); recs.push(rec);
    return recs.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
  }
  const TOTALS = 'Theme totals';
  // Everything from the Theme totals heading of a coded responses CSV onwards is left out.
  const TOTALS_RE = /(^|\r?\n)[ \t]*"?Theme totals"?[ \t,]*(\r?\n[\s\S]*)?$/i;
  function split(text) {
    text = text.replace(TOTALS_RE, '');
    if (!text.trim()) return null;
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (text.includes('\t')) return parseDelimited(text, '\t') || lines.map(l => l.split('\t').map(x => x.trim()));
    // A CSV only when the rows line up; otherwise each line is one comment, commas and all.
    const csv = parseDelimited(text, ',');
    if (csv && csv.length > 1 && csv[0].length > 1 && csv[0].every(v => v.length <= 40)) {
      const n = csv[0].length;
      if (csv.filter(r => r.length === n).length / csv.length >= 0.9) return csv;
    }
    return lines.map(l => [l.trim()]);
  }
  const HEAD_WORDS = /comment|response|feedback|answer|text|why|reason|tell us|question|\bid\b|ref|service|ward|site|team|group|date|code|age|gender/i;
  function headerGuess(recs) {
    if (recs.length < 2) return false;
    const h = recs[0];
    if (h.some(v => v.length > 60)) return false;
    if (h.length > 1) return h.every(v => v !== '' && !/^\d+$/.test(v)) && (h.some(v => HEAD_WORDS.test(v)) || h.join('').length < 40);
    return h[0].length <= 40 && HEAD_WORDS.test(h[0]) && !/[.!?]$/.test(h[0]);
  }
  const bare = h => (h || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const MARK = /^(1|x|y|yes|true|✓|✔|\*)$/i;
  const TEXT_HEAD = /comment|response|feedback|answer|text|verbatim/i;
  const ID_HEAD = /^(id|ref|reference|respondent( id)?|response (id|no\.?|number)|unique (id|ref|reference)|no\.?|number|#)$/i;
  const GROUP_HEAD = /group|service|ward|site|team|department|location|age|gender|ethnic|area|directorate|specialty|speciality|clinic|unit|source|month|quarter/i;
  const SPECIAL = [
    ['sentiment', /^sentiment$/i], ['pos', /^positive$/i], ['neg', /^negative$/i], ['mix', /^mixed$/i], ['neu', /^neutral$/i],
    ['quote', /^(potential )?quotes?$/i], ['pii', /^(personal (details|data|info\w*|identifiable info\w*)|pii)$/i],
    ['safe', /^safeguarding( concerns?)?$/i], ['note', /^(analytical )?notes?$/i], ['other', /^other$/i]
  ];
  function table(recs, hasHeader) {
    const width = Math.max(...recs.map(r => r.length));
    const head = hasHeader ? recs[0] : null;
    const body = (hasHeader ? recs.slice(1) : recs).map(r => { const x = r.slice(); while (x.length < width) x.push(''); return x; });
    const names = [];
    for (let i = 0; i < width; i++) names.push((head && head[i]) || (width === 1 ? 'Comments' : `Column ${i + 1}`));
    return { names, body, width };
  }
  function roles(cols, hasHeader) {
    const { names, body, width } = cols;
    const vals = i => body.map(r => r[i]).filter(v => v !== '');
    const avgLen = i => { const v = vals(i); return v.length ? v.reduce((a, s) => a + s.length, 0) / v.length : 0; };
    const special = {}, marks = [], free = [];
    for (let i = 0; i < width; i++) {
      const nm = bare(names[i]);
      const sp = hasHeader ? SPECIAL.find(s => s[1].test(nm)) : null;
      if (sp && !(sp[0] in special)) { special[sp[0]] = i; continue; }
      if (hasHeader && width > 2 && vals(i).every(v => MARK.test(v)) && !TEXT_HEAD.test(nm) && !ID_HEAD.test(nm) && !GROUP_HEAD.test(nm)) { marks.push(i); continue; }
      free.push(i);
    }
    const pick = (sel, auto) => sel === 'none' ? -1 : sel !== '' && +sel < width ? +sel : auto;
    // The comments are in the column with the longest entries.
    const autoText = free.length ? free.reduce((b, i) => avgLen(i) > avgLen(b) ? i : b, free[0]) : 0;
    const text = pick(els.textCol.value, autoText);
    const rest = free.filter(i => i !== text);
    const autoId = rest.find(i => hasHeader && ID_HEAD.test(bare(names[i]))) ??
      rest.find(i => { const v = vals(i); return v.length === body.length && v.length > 1 && new Set(v).size === v.length && v.every(x => /^[A-Za-z]{0,4}[-_ ]?\d+$/.test(x)); }) ?? -1;
    const id = pick(els.idCol.value, autoId);
    const rest2 = rest.filter(i => i !== id);
    const lowCard = i => { const v = vals(i), k = new Set(v).size; return v.length >= 4 && k >= 2 && k <= Math.min(15, v.length / 2) && avgLen(i) <= 40; };
    const autoGroup = rest2.find(i => hasHeader && GROUP_HEAD.test(bare(names[i]))) ?? rest2.find(lowCard) ?? -1;
    const group = pick(els.groupCol.value, autoGroup);
    return { text, id, group, special, marks, auto: { text: autoText, id: autoId, group: autoGroup } };
  }
  const NO_COMMENT = /^(n\/?a|none|no|nothing|nil|-+|\.+|no comments?|nothing to add|nothing else|not applicable)[.!]?$/i;
  function buildRows(cols, r) {
    const out = [], seen = new Map();
    let none = 0;
    cols.body.forEach((rec, i) => {
      const text = (rec[r.text] || '').replace(/[ \t]+/g, ' ').trim();
      if (!text) return;
      if (NO_COMMENT.test(text)) { none++; return; }
      const id = r.id >= 0 && rec[r.id] ? rec[r.id] : String(i + 1);
      let key = (r.id >= 0 ? 'id:' : 'row:') + id;
      const k = seen.get(key) || 0; seen.set(key, k + 1);
      if (k) key += '#' + (k + 1);
      out.push({
        key, id, text, raw: rec, group: r.group >= 0 ? (rec[r.group] || '(no group)') : '',
        wc: text.split(/\s+/).length, pii: piiFound(text), safe: SAFE.test(text), hint: sentHint(text)
      });
    });
    return { list: out, none, dupes: [...seen.values()].some(v => v > 1) };
  }
  function fillSelects(cols) {
    const sig = cols.names.join('\u0001');
    els.colsBox.hidden = cols.width < 2;
    if (sig === colSig) return;
    colSig = sig;
    const opts = (sel, extra) => {
      sel.innerHTML = `<option value="">Detect</option>${extra ? '<option value="none">None</option>' : ''}` +
        cols.names.map((n, i) => `<option value="${i}">${esc(trunc(n, 40))}</option>`).join('');
      sel.value = '';
    };
    opts(els.textCol, false); opts(els.idCol, true); opts(els.groupCol, true);
  }
  // A pasted coding sheet: columns of marks for codes, sentiment and flags.
  function importable() {
    if (!data || !data.hasHeader) return null;
    const { r, cols } = data;
    const keys = Object.keys(r.special);
    const has = i => cols.body.some(rec => (rec[i] || '').trim() !== '');
    const codeCols = r.marks.filter(i => has(i) || !/^code \d+$/i.test(bare(cols.names[i])));
    if (!codeCols.length && !keys.length) return null;
    const marked = codeCols.concat(keys.map(k => r.special[k])).some(has);
    return { codeCols, names: codeCols.map(i => bare(cols.names[i])), marked };
  }

  // ---- update ----
  function update() {
    const recs = split(els.data.value);
    if (!recs) {
      data = null; rows = []; colSig = '';
      els.detected.textContent = ''; els.colsBox.hidden = true; els.importBox.hidden = true;
      return render();
    }
    if (!headerTouched) els.hasHeader.checked = headerGuess(recs);
    const hasHeader = els.hasHeader.checked && recs.length > 1;
    const cols = table(recs, hasHeader);
    fillSelects(cols);
    const r = roles(cols, hasHeader);
    data = { cols, r, hasHeader };
    const b = buildRows(cols, r);
    rows = b.list;

    const N = cols.names, bits = [];
    if (rows.length) bits.push(`Reading ${count(rows.length, ['comment', 'comments'])}${cols.width > 1 ? ` from ${N[r.text]}` : ''}.`);
    if (b.none) bits.push(`${count(b.none, RESP)} such as “none” or “n/a” left out.`);
    if (cols.width > 1) {
      bits.push(r.id >= 0 ? `IDs from ${N[r.id]}${b.dupes ? ' (some repeat, so check them)' : ''}.` : 'Numbered by row, as there is no ID column.');
      if (r.group >= 0) bits.push(`Groups from ${N[r.group]}.`);
    }
    els.detected.textContent = bits.join(' ');

    const imp = importable();
    els.importBox.hidden = !imp;
    if (imp) els.importNote.textContent = imp.marked
      ? `This looks like a coding sheet${imp.names.length ? `, with codes for ${trunc(joinList(imp.names), 140)}` : ''}. Bring its coding into the tool to carry on here.`
      : `This looks like a blank coding sheet${imp.names.length ? `, with codes for ${trunc(joinList(imp.names), 140)}` : ''}. Bring in its codes to start coding here.`;
    render();
  }
  function schedule(fn) { clearTimeout(timer); timer = setTimeout(fn || update, 180); }

  function doImport() {
    const imp = importable(); if (!imp) return;
    const { cols, r } = data, sp = r.special;
    const idFor = {};
    imp.codeCols.forEach((i, k) => { const name = imp.names[k]; if (name) idFor[i] = (codeByName(name) || addCode(name)).id; });
    let n = 0;
    rows.forEach(row => {
      const rec = row.raw, has = i => i !== undefined && (rec[i] || '').trim() !== '';
      const codes = Object.keys(idFor).filter(i => has(+i)).map(i => idFor[i]);
      if (has(sp.other)) codes.push('other');
      let sent = '';
      if (has(sp.sentiment)) { const v = rec[sp.sentiment].toLowerCase(); sent = ['pos', 'neg', 'mix', 'neu'].find(k => v.startsWith(k)) || ''; }
      else { const p = has(sp.pos), g = has(sp.neg); sent = (p && g) || has(sp.mix) ? 'mix' : p ? 'pos' : g ? 'neg' : has(sp.neu) ? 'neu' : ''; }
      const note = has(sp.note) ? rec[sp.note] : '';
      const fl = { quote: has(sp.quote), pii: has(sp.pii), safe: has(sp.safe) };
      if (!codes.length && !sent && !note && !fl.quote && !fl.pii && !fl.safe) return;
      const c = entry(row.key);
      c.codes = uniq(c.codes.concat(codes));
      if (sent) c.sent = sent;
      if (note) c.note = note;
      Object.keys(fl).forEach(k => { if (fl[k]) c[k] = true; });
      touched(row.key); n++;
    });
    els.importBox.hidden = true;
    FocusActions.say(n ? `Brought in the coding for ${count(n, RESP)}.` : 'Brought in the codes from your sheet.');
    showTab('code');
  }

  // ---- sampling ----
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function byGroup(list) {
    const m = new Map();
    list.forEach(r => { if (!m.has(r.group)) m.set(r.group, []); m.get(r.group).push(r); });
    return m;
  }
  function drawSample() {
    const mode = radio('sample'), N = int(els.sampleN);
    if (mode === 'all') return;
    if (!(N > 0)) { els.sampleN.focus(); return FocusActions.say('Enter a sample size first.'); }
    const coded = rows.filter(isCoded).length;
    if (state.sample && coded && !confirm('Draw a new sample? Responses you have coded stay coded, but some may drop out of the sample.')) return;
    const n = Math.min(N, rows.length);
    let pick;
    if (mode === 'random' || data.r.group < 0) pick = shuffle(rows).slice(0, n);
    else {
      // In proportion to each group, sharing out the remainder by the largest fractions.
      const groups = [...byGroup(rows)].map(([g, list]) => ({ g, list, exact: list.length * n / rows.length }));
      groups.forEach(x => { x.k = Math.floor(x.exact); });
      let left = n - groups.reduce((a, x) => a + x.k, 0);
      [...groups].sort((a, b) => (b.exact - b.k) - (a.exact - a.k)).forEach(x => { if (left > 0) { x.k++; left--; } });
      pick = groups.flatMap(x => shuffle(x.list).slice(0, x.k));
      if (mode === 'purposive') rows.filter(r => state.boost.includes(r.group)).forEach(r => { if (!pick.includes(r)) pick.push(r); });
    }
    const keep = new Set(pick.map(r => r.key));
    state.sample = { mode, n, keys: rows.filter(r => keep.has(r.key)).map(r => r.key) };
    page = 0;
    render();
    FocusActions.say(`Drew a sample of ${count(state.sample.keys.length, RESP)}.`);
  }
  function renderSample() {
    const mode = radio('sample'), hasG = !!(data && data.r.group >= 0);
    els.sampleBox.hidden = mode === 'all' || !rows.length;
    els.boostWrap.hidden = mode !== 'purposive' || !hasG;
    if (mode === 'purposive' && hasG) {
      const groups = [...byGroup(rows)].sort((a, b) => a[1].length - b[1].length);
      const sig = groups.map(g => g[0] + g[1].length).join('|');
      if (els.boostBox.dataset.sig !== sig) {
        els.boostBox.dataset.sig = sig;
        els.boostBox.innerHTML = groups.map(([g, list]) =>
          `<label class="check"><input type="checkbox" data-g="${esc(g)}"${state.boost.includes(g) ? ' checked' : ''}> ${esc(g)} <span class="muted">(${list.length})</span></label>`).join('');
      }
    }
    let note = '';
    if (!rows.length) note = '';
    else if (mode === 'all') note = `Analysing all ${count(rows.length, RESP)}.` + (rows.length > 300 ? ' That is a lot to code by hand, so think about a sample.' : '');
    else {
      if (mode !== 'random' && !hasG) note = 'Choose a group column above to sample in proportion to groups. Until then the sample is random. ';
      note += state.sample ? `Analysing a sample of ${state.sample.keys.length} of ${count(rows.length, RESP)}.` : 'Press Draw sample to pick the comments to analyse. Until then, all are shown.';
      if (state.sample && state.sample.mode !== mode) note += ' Press Draw sample again to use this kind of sample.';
    }
    els.sampleNote.textContent = note;
  }

  // ---- render ----
  const TABS = ['overview', 'cloud', 'code', 'findings'];
  function showTab(t, focus) {
    tab = t;
    TABS.forEach(k => {
      const b = $('tab-' + k), on = k === t;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      $('p-' + k).hidden = !on;
    });
    if (focus) $('tab-' + t).focus();
    render();
  }
  function render() {
    const has = rows.length > 0;
    els.empty.hidden = has; els.work.hidden = !has;
    renderSample();
    if (!has) {
      els.empty.querySelector('p').textContent = data ? 'No comments found yet. Check the comments column, or paste one comment per row.' : 'Paste your survey comments on the left to start.';
      return;
    }
    trackChart({ points: rows.length });
    fillFilters();
    if (tab === 'overview') renderOverview();
    else if (tab === 'cloud') renderCloud();
    else if (tab === 'code') renderCode();
    else renderFindings();
  }
  // Options that depend on the data and the codes, keeping what was chosen.
  function setOptions(sel, opts) {
    const keep = sel.value;
    const html = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
    sel.value = opts.some(o => o[0] === keep) ? keep : opts[0][0];
  }
  function fillFilters() {
    const groups = groupName() ? uniq(rows.map(r => r.group)).map(g => ['group:' + g, `${groupName()}: ${g}`]) : [];
    const codes = allCodes().map(c => ['code:' + c.id, 'Coded ' + c.name]);
    const sents = Object.keys(SENT).map(k => ['sent:' + k, SENT[k]]);
    const sampled = radio('sample') !== 'all' && state.sample;
    setOptions(els.wcFilter, [['all', 'All comments'], ...(sampled ? [['sample', 'Comments in your sample']] : []), ...groups, ...sents, ...codes]);
    setOptions(els.codeView, [['all', 'All responses'], ['uncoded', 'Not coded yet'], ['coded', 'Coded'], ...codes, ...sents,
      ['flag:quote', 'Marked as potential quotes'], ['flag:pii', 'Marked as personal details'], ['flag:safe', 'Marked for safeguarding'],
      ['hint:pii', 'Check: possible personal details'], ['hint:safe', 'Check: words linked to safeguarding'],
      ['len:thin', 'Thin comments'], ['len:thick', 'Thick comments'], ...groups]);
  }
  function matches(r, v) {
    const c = state.coding[r.key] || {}, codes = c.codes || [];
    if (v === 'all') return true;
    if (v === 'sample') return !state.sample || state.sample.keys.includes(r.key);
    if (v === 'uncoded') return !codes.length;
    if (v === 'coded') return codes.length > 0;
    const k = v.slice(0, v.indexOf(':')), x = v.slice(v.indexOf(':') + 1);
    if (k === 'code') return codes.includes(x);
    if (k === 'sent') return c.sent === x;
    if (k === 'flag') return !!c[x];
    if (k === 'hint') return x === 'pii' ? r.pii.length > 0 : r.safe;
    if (k === 'len') return x === 'thick' ? r.wc >= thickAt() : r.wc < thickAt();
    if (k === 'group') return r.group === x;
    return true;
  }

  // ---- step 1: know your data ----
  function renderOverview() {
    const act = activeRows(), T = thickAt();
    const thin = act.filter(r => r.wc < T), thick = act.filter(r => r.wc >= T);
    const pct = Math.round(100 * thick.length / act.length);
    const med = median(act.map(r => r.wc));
    const pii = act.filter(r => r.pii.length), safe = act.filter(r => r.safe);
    const big = act.length > 300;
    let fit, advice;
    if (pct < 20) {
      fit = [0, 1, 2];
      advice = 'These comments are mostly thin: short and focused on one or two topics. Sentiment and content analysis suit them, and you don’t need to be a specialist to do it. Read them all first.';
    } else if (pct <= 50) {
      fit = [0, 2, 3];
      advice = 'A mix of thin and thick comments. Content analysis will sort the short ones, but it can miss the context in the longer ones. For those, thematic analysis gives a fuller picture, so think about involving a qualitative analyst.';
    } else {
      fit = [0, 3];
      advice = 'These comments are mostly thick: long, detailed and covering several topics. Thematic analysis makes the most of them. It needs specialist skill, so involve an experienced qualitative analyst if you can.';
    }
    const pick = list => { const s = [...list].sort((a, b) => a.wc - b.wc); return s[Math.floor(s.length / 2)]; };
    const eg = (r, label) => r ? `<div class="eg"><small>${label} (${r.wc} words)</small>${esc(shown(trunc(r.text, 420)))}</div>` : '';
    const sampled = act.length < rows.length;
    els.ovOut.innerHTML = `
      <p class="summary"><strong>${count(act.length, ['comment', 'comments'])}</strong> to analyse, ${pct >= 50 ? 'mostly <strong>thick</strong>' : pct >= 20 ? 'a <strong>mix</strong> of thin and thick' : 'mostly <strong>thin</strong>'}.</p>
      <p class="focuson">${sampled ? `A sample of ${act.length} from ${rows.length} comments. ` : ''}Read every comment before you choose how to analyse them.</p>
      <div class="tiles">
        <div class="tile"><b>${act.length}</b><span>comments${sampled ? ' in your sample' : ''}</span></div>
        <div class="tile"><b>${nf.format(med)}</b><span>words in a typical comment</span></div>
        <div class="tile"><b>${thin.length}</b><span>thin (under ${T} words)</span></div>
        <div class="tile"><b>${thick.length}</b><span>thick (${T} words or more)</span></div>
      </div>
      <div class="share" role="img" aria-label="${100 - pct}% thin, ${pct}% thick">
        ${thin.length ? `<span class="thin" style="flex:${thin.length}">${100 - pct}% thin</span>` : ''}${thick.length ? `<span class="thick" style="flex:${thick.length}">${pct}% thick</span>` : ''}
      </div>
      <p class="hint">Thin comments are short, focus on one or two topics and lack detail or context. Thick comments are longer, cover several topics and give detail and context.</p>
      ${eg(pick(thin), 'A typical thin comment')}${eg(pick(thick), 'A typical thick comment')}

      <div class="reading">
        <h3>Which method fits</h3>
        <p>${esc(advice)}</p>
        <ol class="ladder" aria-label="Methods, from simplest to most in-depth. Highlighted methods fit your data.">${STEPS.map((s, i) => `<li class="${fit.includes(i) ? 'fit' : ''}">${s}${fit.includes(i) ? '<span class="sr"> (fits)</span>' : ''}</li>`).join('')}</ol>
        ${big ? `<p>With ${act.length} comments, think about analysing a sample (see How much to analyse, on the left), or coding until nothing new is emerging.</p>` : ''}
        <details class="values">
          <summary>Who should analyse it?</summary>
          <div class="tablewrap"><table>
            <thead><tr><th></th><th>Someone who isn’t an analyst</th><th>A qualitative analyst</th><th>Your comments</th></tr></thead>
            <tbody>
              <tr><th scope="row">How it was collected</th><td>One standard question, such as in a survey</td><td>Different questions or methods, such as surveys, interviews and observations mixed</td><td>Check: did everyone answer the same question?</td></tr>
              <tr><th scope="row">How much</th><td>A small amount</td><td>Large volumes that may need sampling</td><td>${act.length} comments</td></tr>
              <tr><th scope="row">How rich</th><td>Thin (short comments)</td><td>Thick (long comments and passages of text)</td><td>${100 - pct}% thin, ${pct}% thick</td></tr>
              <tr><th scope="row">How broad</th><td>A narrow focus</td><td>A wide range of topics</td><td>The word cloud gives a first idea</td></tr>
              <tr><th scope="row">What you report</th><td>Describes what you see</td><td>Relationships, patterns and inferences backed by evidence</td><td>Depends on your aim</td></tr>
            </tbody>
          </table></div>
        </details>
      </div>

      <div class="reading">
        <h3>Check before you analyse or share</h3>
        <div class="caution${pii.length || safe.length ? ' warn' : ''}">
          <ul>
            <li>${pii.length ? `${count(pii.length, ['comment seems', 'comments seem'])} to include personal details, such as a name, email or phone number. <button type="button" class="linkbtn" data-goto="hint:pii">Check them</button>` : 'No obvious personal details found, but read the comments to be sure.'}</li>
            <li>${safe.length ? `${count(safe.length, ['comment uses', 'comments use'])} words linked to safeguarding concerns. <button type="button" class="linkbtn" data-goto="hint:safe">Check them</button>. Follow your safeguarding process for any concern straight away, rather than waiting for the analysis.` : 'No words linked to safeguarding found, but stay alert to concerns as you read.'}</li>
            <li>Make sure your information governance and, for research, ethics approval cover using the comments this way.</li>
            <li>Remove or hide personal details before you share comments or quotes. The checks here are a prompt, not a guarantee.</li>
          </ul>
        </div>
      </div>`;
  }

  // ---- step 2: word cloud ----
  let measureCtx = null;
  function textW(t, size, weight) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} ${size}px ${FONT}`;
    return measureCtx.measureText(t).width;
  }
  function cloudOptions() {
    const max = int(els.wcMax), min = int(els.wcMin);
    return {
      equal: radio('wcSize') !== 'freq', phrases: radio('wcUnit') === 'phrases', stop: els.wcStop.checked, plural: els.wcPlural.checked,
      exclude: new Set(els.wcExclude.value.toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)),
      max: Math.min(200, Math.max(5, max > 0 ? max : 60)), min: Math.max(1, min > 0 ? min : 1)
    };
  }
  // Words (or phrases) and the responses that use them.
  function cloudWords(list, o) {
    const where = new Map();
    const keep = t => t.length > 1 && !(o.stop && STOP.has(t)) && !o.exclude.has(t);
    list.forEach(r => {
      const t = tokens(r.text);
      const items = o.phrases
        ? t.slice(0, -1).map((a, i) => [a, t[i + 1]]).filter(([a, b]) => keep(a) && keep(b) && !STOP.has(a) && !STOP.has(b)).map(p => p.join(' '))
        : t.filter(keep);
      items.forEach(w => { if (!where.has(w)) where.set(w, new Set()); where.get(w).add(r.key); });
    });
    const forms = new Map([...where.keys()].map(w => [w, [w]]));
    if (o.plural) {
      [...where.keys()].forEach(w => {
        const one = w.slice(0, -1);
        if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w) && where.has(one)) {
          where.get(w).forEach(k => where.get(one).add(k));
          forms.get(one).push(w);
          where.delete(w);
        }
      });
    }
    return [...where].map(([w, keys]) => ({ w, keys, n: keys.size, forms: forms.get(w) }))
      .filter(x => x.n >= o.min && !o.exclude.has(x.w))
      .sort((a, b) => b.n - a.n || a.w.localeCompare(b.w))
      .slice(0, o.max);
  }
  // Place each word on a spiral out from the middle, in the first spot where it fits.
  function cloudSVG(words, o) {
    const W = 960, H = 540, top = o.title ? 60 : 16, bottom = H - 16;
    const cx = W / 2, cy = (top + bottom) / 2;
    const maxN = words[0].n, minN = words[words.length - 1].n;
    const size = w => o.equal ? 24 : Math.round(15 + 43 * Math.sqrt((w.n - minN) / Math.max(1, maxN - minN)));
    // Equal sizes in a scrambled (but repeatable) order, so the middle doesn't hint at the most common.
    const order = o.equal ? [...words].sort((a, b) => hash(a.w + 'q') - hash(b.w + 'q')) : words;
    const placed = [], boxes = [];
    let lastHit = null;
    const hits = b => {
      if (lastHit && overlap(lastHit, b)) return true;
      for (const x of boxes) if (overlap(x, b)) { lastHit = x; return true; }
      return false;
    };
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    order.forEach(w => {
      const s = size(w), weight = o.equal ? 700 : s >= 30 ? 800 : 600;
      const bw = textW(w.w, s, weight) + 10, bh = s * 1.15 + 2;
      if (bw > W - 20) return;
      for (let a = 0, r = 0; r < W; a += Math.min(0.5, 9 / (r + 1))) {
        r = 1.7 * a;
        const b = { x: cx + r * Math.cos(a) * 1.7 - bw / 2, y: cy + r * Math.sin(a) - bh / 2, w: bw, h: bh };
        if (b.x < 8 || b.x + bw > W - 8 || b.y < top || b.y + bh > bottom) continue;
        if (hits(b)) continue;
        boxes.push(b); placed.push({ w, s, weight, b });
        return;
      }
    });
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (o.title) out.push(`<text x="24" y="38" font-size="22" font-weight="700" fill="${INK}">${esc(trunc(o.title, 80))}</text>`);
    placed.forEach(p => {
      const fill = PALETTE[hash(p.w.w) % PALETTE.length];
      out.push(`<g class="wd" data-w="${esc(p.w.w)}" tabindex="0" role="button" aria-label="${esc(p.w.w)}, in ${count(p.w.n, RESP)}"><title>${esc(p.w.w)}: in ${count(p.w.n, RESP)}</title>` +
        `<text x="${(p.b.x + p.b.w / 2).toFixed(1)}" y="${(p.b.y + p.s * 0.9 + 1).toFixed(1)}" font-size="${p.s}" font-weight="${p.weight}" text-anchor="middle" fill="${fill}">${esc(p.w.w)}</text></g>`);
    });
    out.push('</svg>');
    return { svg: out.join(''), placed: placed.length };
  }
  function cloudList() {
    const v = els.wcFilter.value || 'all';
    return rows.filter(r => matches(r, v));
  }
  function buildCloud() {
    const list = cloudList(), o = cloudOptions();
    const words = cloudWords(list, o);
    if (!words.length) return { list, words, o };
    const title = els.question.value.trim();
    const res = cloudSVG(words, { equal: o.equal, title, aria: `Word cloud${title ? ' for ' + title : ''}: ${words.slice(0, 12).map(w => w.w).join(', ')}${words.length > 12 ? ' and more' : ''}.` });
    return { list, words, o, svg: res.svg, placed: res.placed };
  }
  function renderCloud() {
    cloud = buildCloud();
    const { words, list, o } = cloud;
    if (!words.length) {
      els.cloudOut.innerHTML = `<div class="empty"><p>No words to show. Try including more comments, or fewer words left out.</p></div>`;
      els.wordOut.innerHTML = '';
      return;
    }
    const left = words.length - cloud.placed;
    els.cloudOut.innerHTML = `
      <p class="focuson">${count(words.length, o.phrases ? ['phrase', 'phrases'] : ['word', 'words'])} from ${count(list.length, ['comment', 'comments'])}. Select a word to read the comments that use it.</p>
      <div class="chartwrap" id="cloudChart">${cloud.svg}</div>
      ${left > 0 ? `<p class="hint">${count(left, o.phrases ? ['phrase', 'phrases'] : ['word', 'words'])} didn’t fit. Show fewer words to see them all.</p>` : ''}
      <details class="values">
        <summary>All ${o.phrases ? 'phrases' : 'words'} as a list</summary>
        <p class="hint">For getting to know your data only. Counting words doesn’t tell you what people meant.</p>
        <div class="tablewrap"><table>
          <thead><tr><th>${o.phrases ? 'Phrase' : 'Word'}</th><th class="num">Comments that use it</th><th></th></tr></thead>
          <tbody>${words.map(w => `<tr><td>${esc(w.w)}${w.forms.length > 1 ? ` <span class="muted">(${esc(w.forms.slice(1).join(', '))})</span>` : ''}</td><td class="num">${w.n}</td><td><button type="button" class="linkbtn" data-word="${esc(w.w)}">Read them</button></td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;
    if (chosenWord && words.some(w => w.w === chosenWord)) showWord(chosenWord, false); else { chosenWord = null; els.wordOut.innerHTML = ''; }
  }
  function wordRe(w) {
    const forms = w.forms.map(f => escRe(f).replace(/\s+/g, '[^a-z0-9]+'));
    return new RegExp(`\\b(${forms.join('|')})(?:'s)?\\b`, 'gi');
  }
  function showWord(word, scroll) {
    const w = cloud && cloud.words.find(x => x.w === word); if (!w) return;
    chosenWord = word;
    const list = cloud.list.filter(r => w.keys.has(r.key)), re = wordRe(w);
    els.wordOut.innerHTML = `<div class="wordpanel" tabindex="-1">
      <div class="whead"><h3>“${esc(word)}” in ${count(list.length, ['comment', 'comments'])}</h3><button type="button" class="small" data-codeword="${esc(word)}">Code these comments</button></div>
      <ul class="quotes">${list.slice(0, 60).map(r => `<li class="${sentClass(r)}"><small>ID ${esc(r.id)}${r.group ? ' · ' + esc(r.group) : ''}</small>${hl(shown(r.text), re)}</li>`).join('')}</ul>
      ${list.length > 60 ? `<p class="hint">Showing the first 60. Use Code these comments to read them all.</p>` : ''}
    </div>`;
    if (scroll !== false) { const p = els.wordOut.firstElementChild; p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); p.focus({ preventScroll: true }); }
  }
  const sentClass = r => { const c = state.coding[r.key]; return c && c.sent ? 's-' + c.sent : ''; };

  // ---- step 3: code responses ----
  function renderCode() {
    els.approachNote.textContent = APPROACH[radio('approach')] || '';
    renderCodes();
    renderList();
  }
  function renderCodes() {
    const u = usage(activeRows());
    const row = c => {
      const other = c.id === 'other';
      return `<li data-id="${c.id}" style="--c:${c.color}" class="${other ? 'other' : ''}">
        <span class="cdot" aria-hidden="true"></span>
        <div class="cfields">
          ${other ? `<input class="cname" value="Other" readonly aria-label="Code name">` : `<input class="cname" value="${esc(c.name)}" aria-label="Code name">`}
          ${other ? `<span class="hint" style="margin:.4rem 0 0">${esc(c.desc)}</span>` : `<input class="cdesc" value="${esc(c.desc)}" placeholder="What belongs here" aria-label="What belongs under ${esc(c.name)}">
          <input class="ckw" value="${esc(c.keywords)}" placeholder="Suggest for comments that mention… (comma separated)" aria-label="Words that suggest ${esc(c.name)}">`}
        </div>
        <span class="ccount" data-count="${c.id}">${countText(u[c.id])}</span>
        ${other ? '<span></span>' : `<button type="button" class="icon" data-del="${c.id}" aria-label="Delete ${esc(c.name)}" title="Delete code">×</button>`}
      </li>`;
    };
    const big = Object.entries(u).filter(([id, n]) => id !== 'other' && n >= Math.max(5, activeRows().filter(isCoded).length * 0.4)).map(([id]) => codeById(id).name);
    els.codesOut.innerHTML = `
      ${state.codes.length ? '' : `<p class="hint">No codes yet. Add codes below as topics come up, or <button type="button" class="linkbtn" data-starter>start with codes for patient feedback</button>.</p>`}
      <ul class="codes">${allCodes().map(row).join('')}</ul>
      <p class="hint">Counts help you keep track of your coding: think about splitting a code used a lot, and merging or dropping one hardly used. Don’t report them as findings.${big.length ? ` <b>${esc(joinList(big))}</b> ${big.length === 1 ? 'is' : 'are'} used a lot, so may be worth splitting.` : ''}</p>`;
  }
  const countText = n => n ? `used ${n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'}` : 'not used yet';
  function searchRe() {
    const q = els.codeSearch.value.trim();
    return q ? new RegExp(escRe(q), 'gi') : null;
  }
  function viewRows() {
    const v = els.codeView.value || 'all', q = els.codeSearch.value.trim().toLowerCase();
    return activeRows().filter(r => matches(r, v) && (!q || r.text.toLowerCase().includes(q) || String(r.id).toLowerCase() === q));
  }
  function renderProgress() {
    const act = activeRows(), done = act.filter(isCoded).length, pct = act.length ? Math.round(100 * done / act.length) : 0;
    els.progress.innerHTML = `<span>${done} of ${count(act.length, RESP)} coded</span><span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  }
  function renderList() {
    renderProgress();
    const list = viewRows(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    const re = searchRe(), from = page * PAGE, shownRows = list.slice(from, from + PAGE);
    els.listOut.innerHTML = list.length
      ? shownRows.map(r => cardHTML(r, re)).join('') + (pages > 1 ? `
        <div class="pager">
          <button type="button" class="small" data-page="${page - 1}"${page ? '' : ' disabled'}>Previous</button>
          <span>${from + 1} to ${from + shownRows.length} of ${list.length}</span>
          <button type="button" class="small" data-page="${page + 1}"${page < pages - 1 ? '' : ' disabled'}>Next</button>
        </div>` : '')
      : `<div class="empty"><p>No comments match. Try showing all responses or clearing the search.</p></div>`;
  }
  function suggested(r) {
    return state.codes.filter(c => { const re = kwRe(c); return re && re.test(r.text); }).map(c => c.id);
  }
  function cardHTML(r, re) {
    const c = state.coding[r.key] || {}, codes = c.codes || [];
    const sugg = suggested(r).filter(id => !codes.includes(id));
    const T = thickAt();
    const tags = [
      r.group && `<span class="tag">${esc(r.group)}</span>`,
      `<span class="tag">${r.wc} words · ${r.wc >= T ? 'thick' : 'thin'}</span>`,
      r.pii.length && `<span class="tag warn">Check: possible ${esc(joinList(r.pii))}</span>`,
      r.safe && `<span class="tag warn">Check: words linked to safeguarding</span>`
    ].filter(Boolean).join('');
    const chip = code => {
      const on = codes.includes(code.id), sg = sugg.includes(code.id);
      return `<button type="button" class="chip${sg ? ' sugg' : ''}" style="--c:${code.color}" data-code="${code.id}" aria-pressed="${on}"${sg ? ' title="Suggested by your keywords"' : ''}>${sg ? '<span aria-hidden="true">+</span>' : ''}${esc(code.name)}${sg ? '<span class="sr"> (suggested)</span>' : ''}</button>`;
    };
    const sents = Object.keys(SENT).map(k => `<button type="button" class="sbtn s-${k}" data-sent="${k}" aria-pressed="${c.sent === k}">${SENT[k]}</button>`).join('');
    const hint = r.hint && !c.sent ? `<span class="shint">Words suggest ${SENT[r.hint].toLowerCase()}. <button type="button" class="linkbtn" data-accept="${r.hint}">Use this</button></span>` : '';
    const flags = Object.keys(FLAGS).map(k => `<button type="button" class="fbtn" data-flag="${k}" aria-pressed="${!!c[k]}">${FLAGS[k]}</button>`).join('');
    return `<article class="resp${codes.length ? ' done' : ''}" data-key="${esc(r.key)}" aria-label="Response ${esc(r.id)}">
      <div class="rhead"><b>ID ${esc(r.id)}</b>${tags}</div>
      <p class="rtext">${hl(r.text, re)}</p>
      <div class="chips" role="group" aria-label="Codes">${allCodes().map(chip).join('')}</div>
      <div class="rrow"><span class="lbl">Sentiment</span><div class="sents" role="group" aria-label="Sentiment">${sents}</div>${hint}</div>
      <div class="rrow"><span class="lbl">Mark as</span><div class="flags" role="group" aria-label="Mark as">${flags}</div></div>
      <textarea class="note" rows="1" placeholder="Analytical notes, such as patterns, links or what is implied" aria-label="Analytical notes for response ${esc(r.id)}">${esc(c.note || '')}</textarea>
    </article>`;
  }
  function refreshCounts() {
    const u = usage(activeRows());
    els.codesOut.querySelectorAll('[data-count]').forEach(s => { s.textContent = countText(u[s.dataset.count]); });
    renderProgress();
  }
  function deleteCode(id) {
    const c = codeById(id); if (!c) return;
    const used = Object.values(state.coding).filter(x => x.codes.includes(id)).length;
    if (used && !confirm(`Delete “${c.name}”? It is used on ${count(used, RESP)}, which will lose this code.`)) return;
    state.codes = state.codes.filter(x => x.id !== id);
    Object.keys(state.coding).forEach(k => { const x = state.coding[k]; x.codes = x.codes.filter(i => i !== id); touched(k); });
    delete state.findings[id];
    fillFilters(); renderCode();
  }
  const STARTER = [
    ['Staff attitude and behaviour', 'Kindness, respect, friendliness or rudeness', 'kind, caring, friendly, rude, respect, courteous, polite, lovely, supportive, compassion, helpful, dismissive'],
    ['Communication and information', 'Being told what is happening, explanations, letters and phone calls', 'explain, informed, information, letter, phone, told, leaflet'],
    ['Being listened to and involved', 'Feeling heard, involved in decisions and plans', 'listen, heard, involved, together, plan, choice'],
    ['Waiting and access', 'Getting an appointment, waiting times and delays', 'wait, delay, late, appointment, months, weeks, hours'],
    ['Staffing levels', 'Enough staff, staff being available', 'staffing, shortage, short staffed, busy, enough staff'],
    ['Food and drink', 'Meals, drinks and choice', 'food, meal, menu, drink, vegetarian'],
    ['Car parking and getting there', 'Parking, transport and finding the way', 'park, parking, transport, bus, signs'],
    ['Environment and cleanliness', 'Cleanliness, noise, comfort and facilities', 'clean, dirty, noise, noisy, toilet, comfortable']
  ];

  // ---- step 4: findings ----
  const impactRank = id => ({ high: 0, some: 1, low: 2 })[(state.findings[id] || {}).impact] ?? 3;
  const finding = id => state.findings[id] || (state.findings[id] = { text: '', impact: '', skip: [] });
  function wrapText(s, chars, maxLines) {
    const words = s.split(/\s+/), lines = [];
    let cur = '';
    words.forEach(w => {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= chars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = trunc(lines[maxLines - 1] + '…', chars); }
    return lines.map(l => trunc(l, chars + 1));
  }
  // Each column is a group of respondents with the codes found in its comments, without counts.
  // A code found in more than one group is coloured; one found in a single group is plain.
  function mapSVG(act) {
    const byG = !!groupName();
    const groups = byG ? uniq(act.map(r => r.group)) : ['All comments'];
    const per = new Map(groups.map(g => [g, new Set()]));
    act.forEach(r => { const c = state.coding[r.key]; if (c) c.codes.forEach(id => per.get(byG ? r.group : 'All comments').add(id)); });
    const gs = groups.filter(g => per.get(g).size);
    if (!gs.length) return null;
    const order = allCodes().map(c => c.id);
    const inGroups = id => gs.filter(g => per.get(g).has(id)).length;
    const k = gs.length, M = 24, gap = 16;
    const W = Math.max(960, M * 2 + k * 190 + (k - 1) * gap), colW = (W - M * 2 - (k - 1) * gap) / k;
    const chars = Math.max(12, Math.floor((colW - 24) / 7.3));
    const title = els.question.value.trim();
    const top = title ? 92 : 46;
    const cols = gs.map(g => {
      const ids = [...per.get(g)].sort((a, b) => impactRank(a) - impactRank(b) || order.indexOf(a) - order.indexOf(b));
      return { g, items: ids.map(id => { const c = codeById(id); const star = impactRank(id) === 0; return { c, star, shared: k > 1 && inGroups(id) > 1, lines: wrapText((star ? '★ ' : '') + c.name, chars, 3) }; }) };
    });
    const itemH = it => 14 + it.lines.length * 17, headH = 52;
    const colH = c => headH + 10 + c.items.reduce((a, it) => a + itemH(it) + 8, 0);
    const legendY = top + Math.max(...cols.map(colH)) + 16, H = legendY + 46;
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc((title ? title + '. ' : '') + 'Themes by group: ' + cols.map(c => `${c.g}: ${c.items.map(i => i.c.name).join(', ')}`).join('; '))}" font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (title) s.push(`<text x="${M}" y="38" font-size="22" font-weight="700" fill="${INK}">${esc(trunc(title, 80))}</text>`);
    s.push(`<text x="${M}" y="${top - 16}" font-size="14" fill="${MUTED}">What people talked about${byG ? ', by ' + esc(groupName().toLowerCase()) : ''}</text>`);
    cols.forEach((c, i) => {
      const x = M + i * (colW + gap);
      let y = top;
      const hl_ = wrapText(c.g, Math.floor((colW - 20) / 8.2), 2);
      s.push(`<rect x="${x}" y="${y}" width="${colW}" height="${headH}" rx="6" fill="#003087"/>`);
      hl_.forEach((l, j) => s.push(`<text x="${x + colW / 2}" y="${y + (hl_.length === 1 ? 31 : 22 + j * 18)}" font-size="15" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(l)}</text>`));
      y += headH + 10;
      c.items.forEach(it => {
        const h = itemH(it);
        s.push(`<g><title>${esc(it.c.name)}${it.star ? ' (high impact)' : ''}</title><rect x="${x}" y="${y}" width="${colW}" height="${h}" rx="5" fill="${it.shared ? it.c.color : '#ffffff'}" stroke="${it.shared ? it.c.color : INK}" stroke-width="1.5"/>`);
        it.lines.forEach((l, j) => s.push(`<text x="${x + 12}" y="${y + 22 + j * 17}" font-size="13" font-weight="${it.shared ? 600 : 700}" fill="${it.shared ? '#ffffff' : INK}">${esc(l)}</text>`));
        s.push('</g>');
        y += h + 8;
      });
    });
    const legend = [k > 1 ? 'Coloured: found in more than one group. White: found in one group only.' : '', cols.some(c => c.items.some(i => i.star)) ? '★ judged high impact.' : ''].filter(Boolean).join('  ');
    if (legend) s.push(`<text x="${M}" y="${legendY + 20}" font-size="13" fill="${MUTED}">${esc(legend)}</text>`);
    s.push('</svg>');
    return s.join('');
  }
  // How many different codes had appeared after each response was coded, in coding order.
  function saturation(act) {
    const seq = act.map(r => state.coding[r.key]).filter(c => c && c.codes.length).sort((a, b) => (a.order || 0) - (b.order || 0));
    const seen = new Set(), pts = [], fresh = [];
    seq.forEach((c, i) => {
      const nw = c.codes.filter(id => id !== 'other' && !seen.has(id) && codeById(id));
      nw.forEach(id => seen.add(id));
      pts.push(seen.size);
      if (nw.length) fresh.push({ i, ids: nw });
    });
    const m = pts.length, last = fresh.length ? fresh[fresh.length - 1].i : -1, since = m - 1 - last;
    const need = Math.max(5, Math.ceil(m * 0.2));
    return { pts, fresh, m, since, need, near: m >= 10 && since >= need };
  }
  function satSVG(sat) {
    const W = 960, H = 260, ML = 56, MR = 20, MT = 18, MB = 46, pw = W - ML - MR, ph = H - MT - MB;
    const maxY = Math.max(1, ...sat.pts), m = sat.m;
    const X = i => ML + (m > 1 ? i / (m - 1) : 0.5) * pw, Y = v => MT + ph - v / maxY * ph;
    const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Codes found against responses coded. ${sat.pts[m - 1]} codes after ${m} responses." font-family="${FONT}">`, `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    const step = maxY > 10 ? Math.ceil(maxY / 5) : 1;
    for (let v = 0; v <= maxY; v += step) {
      s.push(`<line x1="${ML}" y1="${Y(v)}" x2="${ML + pw}" y2="${Y(v)}" stroke="#D8DDE0"/>`);
      s.push(`<text x="${ML - 8}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="${MUTED}">${v}</text>`);
    }
    let d = `M${X(0)},${Y(sat.pts[0])}`;
    sat.pts.forEach((v, i) => { if (i) d += `H${X(i).toFixed(1)}V${Y(v).toFixed(1)}`; });
    s.push(`<path d="${d}" fill="none" stroke="#005EB8" stroke-width="3"/>`);
    sat.fresh.forEach(f => s.push(`<circle cx="${X(f.i).toFixed(1)}" cy="${Y(sat.pts[f.i]).toFixed(1)}" r="5" fill="#005EB8" stroke="#fff" stroke-width="2"><title>New: ${esc(f.ids.map(id => codeById(id).name).join(', '))}</title></circle>`));
    s.push(`<text x="${ML}" y="${H - 12}" font-size="13" fill="${MUTED}">First coded</text><text x="${ML + pw}" y="${H - 12}" font-size="13" text-anchor="end" fill="${MUTED}">${count(m, RESP)} coded</text>`);
    s.push(`<text x="${ML + pw / 2}" y="${H - 12}" font-size="13" font-weight="700" text-anchor="middle" fill="${INK}">Responses, in the order you coded them</text>`);
    s.push(`<text transform="translate(16 ${MT + ph / 2}) rotate(-90)" font-size="13" font-weight="700" text-anchor="middle" fill="${INK}">Codes found</text>`);
    s.push('</svg>');
    return s.join('');
  }
  function renderFindings() {
    const act = activeRows(), u = usage(act);
    els.method.placeholder = methodText();
    const used = allCodes().filter(c => u[c.id]).sort((a, b) => impactRank(a.id) - impactRank(b.id) || allCodes().indexOf(a) - allCodes().indexOf(b));
    const unused = state.codes.filter(c => !u[c.id]);
    if (!used.length) {
      els.findOut.innerHTML = `<div class="empty"><p>Code some responses in step 3 to build your findings.</p><button type="button" data-goto="uncoded">Start coding</button></div>`;
      return;
    }
    const sat = saturation(act), map = mapSVG(act);
    const satMsg = sat.m < 10 ? `Keep coding: after ${count(sat.m, RESP)} it is too early to tell whether new codes are still appearing.`
      : sat.near ? `No new codes in the last ${sat.since} responses you coded, so you may be close to saturation, where nothing new is emerging.`
      : `New codes were still appearing recently (the last one ${sat.since ? sat.since + ' responses ago' : 'in the latest response'}), so keep coding.`;
    const card = c => {
      const f = state.findings[c.id] || {}, skip = f.skip || [];
      const coded = act.filter(r => (state.coding[r.key] || { codes: [] }).codes.includes(c.id));
      const quotes = coded.filter(r => state.coding[r.key].quote);
      const qli = r => `<li class="${sentClass(r)}"><label><input type="checkbox" data-quote="${esc(r.key)}"${skip.includes(r.key) ? '' : ' checked'}><span>“${esc(shown(r.text))}”<small>ID ${esc(r.id)}${r.group ? ' · ' + esc(r.group) : ''}</small></span></label></li>`;
      return `<article class="finding" data-code="${c.id}" style="--c:${c.color}">
        <h3>${esc(c.name)} <span class="muted">coded on ${count(coded.length, RESP)}</span></h3>
        ${c.desc ? `<p class="qadvice">${esc(c.desc)}</p>` : ''}
        <div class="imp" role="group" aria-label="Impact of ${esc(c.name)}"><span class="muted">Impact</span>${Object.keys(IMPACT).map(k => `<button type="button" class="sbtn" data-impact="${k}" aria-pressed="${f.impact === k}">${IMPACT[k]}</button>`).join('')}</div>
        <label>What you found<textarea class="ftext" data-code="${c.id}" placeholder="${c.id === 'other' ? 'What didn’t fit your codes? Is something missing from them?' : 'Describe the finding: what people experienced, why, and the impact on them'}">${esc(f.text || '')}</textarea></label>
        <p style="font-weight:600;margin:0 0 .35rem">Quotes to include</p>
        ${quotes.length ? `<ul class="quotes">${quotes.map(qli).join('')}</ul>` : `<p class="hint">Mark comments as Potential quote while coding to pick quotes here.</p>`}
        <details class="read"><summary>Read all ${count(coded.length, ['comment', 'comments'])} coded ${esc(c.name)}</summary>
          <ul class="quotes">${coded.map(r => `<li class="${sentClass(r)}"><small>ID ${esc(r.id)}${r.group ? ' · ' + esc(r.group) : ''}${state.coding[r.key].note ? ' · Note: ' + esc(state.coding[r.key].note) : ''}</small>${esc(shown(r.text))}</li>`).join('')}</ul>
        </details>
      </article>`;
    };
    els.findOut.innerHTML = `
      <h3>What people talked about</h3>
      <p class="hint">Colour shows where the same theme came up in more than one group, without counting it. Set the impact of each finding below to mark the most important with a star.</p>
      ${map ? `<div class="chartwrap" id="mapChart">${map}</div>` : ''}
      <h3 style="margin-top:1.25rem">Is anything new still emerging?</h3>
      <p class="focuson">${esc(satMsg)}</p>
      ${sat.m >= 2 ? `<details class="values" style="margin-top:0"><summary>Show new codes as you coded</summary><div class="chartwrap" style="margin-top:.6rem">${satSVG(sat)}</div></details>` : ''}
      <div class="reading">
        <h3>Your findings</h3>
        <p class="hint">Write each finding in words, with a short description and quotes that show where it came from. Use colour to tell sentiments apart: green for positive, red for negative.</p>
        ${used.map(card).join('')}
        ${unused.length ? `<p class="hint">Codes not used yet: ${esc(joinList(unused.map(c => c.name)))}. If they stay unused, think about dropping or merging them.</p>` : ''}
      </div>`;
  }
  function methodText() {
    const act = activeRows(), mode = radio('sample'), sampled = mode !== 'all' && state.sample;
    const coded = act.filter(isCoded).length, T = thickAt();
    const thinPct = act.length ? Math.round(100 * act.filter(r => r.wc < T).length / act.length) : 0;
    const q = els.question.value.trim();
    const g = groupName() ? groupName().toLowerCase() : 'group';
    const lines = [];
    const what = q ? `free-text answers to “${q}”` : 'free-text survey comments';
    if (!sampled) lines.push(`We analysed ${what}: all ${act.length} responses with a comment.`);
    else {
      const how = { random: 'a random sample', representative: `a sample in proportion to each ${g}`, purposive: `a sample in proportion to each ${g}, with every comment from ${joinList(state.boost) || 'chosen groups'} added so their voices were heard` }[state.sample.mode] || 'a sample';
      lines.push(`We analysed ${what}, using ${how}: ${act.length} of the ${rows.length} responses with a comment.`);
    }
    if (coded < act.length) lines.push(`So far ${coded} of these have been coded.`);
    lines.push({
      deductive: 'Each comment was read and coded against a set list of codes, with an Other code for anything that didn’t fit.',
      inductive: 'Each comment was read and codes were developed from the comments as they were read.',
      combined: 'Each comment was read and coded against a starting list of codes, with new codes added as they came up and an Other code for anything that didn’t fit.'
    }[radio('approach')] || '');
    if (Object.values(state.coding).some(c => c.sent)) lines.push('Sentiment (positive, negative, mixed or neutral) was recorded for each comment.');
    lines.push('Findings are judged by their impact on people rather than how many people raised them, so counts are not reported.');
    const lim = [`Many comments were brief (${thinPct}% had fewer than ${T} words), so they may lack context.`, 'People who chose to comment may not represent everyone who used the service.'];
    const sat = saturation(act);
    if (sat.m >= 10 && !sat.near) lim.push('New codes were still emerging when coding stopped, so some topics may be missing.');
    if (sampled) lim.push('Comments outside the sample were not analysed.');
    return lines.filter(Boolean).join(' ') + '\n\nLimitations: ' + lim.join(' ');
  }

  // ---- exports ----
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
  const status = msg => FocusActions.say(msg);
  const fileName = () => slug(els.question.value);
  function chartSvg(kind) {
    if (kind === 'map') return mapSVG(activeRows());
    const c = buildCloud();
    return c.svg || null;
  }
  function toPNG(svg, cb) {
    const w = +svg.match(/width="(\d+)"/)[1], h = +svg.match(/height="(\d+)"/)[1], sc = 2;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * sc; c.height = h * sc;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.onerror = () => status('Could not create the image.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function tableRows() {
    const codes = allCodes(), g = groupName();
    const head = ['ID', ...(g ? [g] : []), 'Response', ...codes.map(c => c.name), 'Sentiment', 'Potential quote', 'Personal details', 'Safeguarding', 'Analytical notes'];
    return [head].concat(activeRows().map(r => {
      const c = state.coding[r.key] || {}, cs = c.codes || [];
      return [r.id, ...(g ? [r.group] : []), shown(r.text), ...codes.map(k => cs.includes(k.id) ? 1 : ''), c.sent ? SENT[c.sent] : '', c.quote ? 1 : '', c.pii ? 1 : '', c.safe ? 1 : '', c.note || ''];
    }));
  }
  // How many responses each theme was coded on, largest first, laid out as two columns for the Pareto chart tool.
  // Pasting the CSV back in stops at the TOTALS heading, so these rows aren't read as responses.
  function totalsRows() {
    const u = usage(activeRows());
    const used = allCodes().filter(c => u[c.id] > 0).sort((a, b) => u[b.id] - u[a.id] || allCodes().indexOf(a) - allCodes().indexOf(b));
    if (!used.length) return [];
    return [[], [TOTALS], ['Copy the Theme and Responses columns below, including the headings, into the Pareto chart tool.'], ['Theme', 'Responses'], ...used.map(c => [c.name, u[c.id]])];
  }
  function summaryText() {
    const act = activeRows(), u = usage(act), q = els.question.value.trim();
    const lines = [];
    if (q) lines.push(q, '');
    lines.push('Method and limitations', els.method.value.trim() || methodText(), '', 'Findings', '');
    const used = allCodes().filter(c => u[c.id]).sort((a, b) => impactRank(a.id) - impactRank(b.id) || allCodes().indexOf(a) - allCodes().indexOf(b));
    if (!used.length) lines.push('No responses coded yet.');
    used.forEach(c => {
      const f = state.findings[c.id] || {}, skip = f.skip || [];
      lines.push(c.name + (f.impact ? ` (${IMPACT[f.impact].toLowerCase()})` : ''));
      lines.push(f.text ? f.text.trim() : (c.id === 'other' ? 'Comments that did not fit the codes. Review them for anything the codes miss.' : '[Write this finding]'));
      act.filter(r => { const x = state.coding[r.key]; return x && x.quote && x.codes.includes(c.id) && !skip.includes(r.key); })
        .forEach(r => lines.push(`  “${shown(r.text)}” (ID ${r.id}${r.group ? ', ' + r.group : ''})`));
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
  function act(a, kind) {
    if (a === 'example') return loadExample();
    if (!rows.length) return;
    if (a === 'png' || a === 'svg' || a === 'copyimg') {
      const svg = chartSvg(kind), what = kind === 'map' ? 'theme map' : 'word cloud';
      if (!svg) return status(kind === 'map' ? 'Code some responses first to draw the theme map.' : 'There are no words to show in the word cloud.');
      const name = fileName() + (kind === 'map' ? '-themes' : '-word-cloud');
      if (a === 'png') toPNG(svg, b => downloadBlob(b, name + '.png').then(ok => saved(ok, cap(what) + ' downloaded.'), failed));
      if (a === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg').then(ok => saved(ok, cap(what) + ' downloaded.'), failed);
      if (a === 'copyimg') {
        if (!(navigator.clipboard && window.ClipboardItem)) return status('Your browser can’t copy images — use PNG instead.');
        toPNG(svg, async b => {
          try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); status(cap(what) + ' copied — paste it into PowerPoint or Word.'); }
          catch (e) { status('Copy was blocked — use PNG instead.'); }
        });
      }
    }
    if (a === 'csv') downloadBlob(new Blob([tableRows().concat(totalsRows()).map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '-coded.csv').then(ok => saved(ok, 'Coded responses downloaded.'), failed);
    if (a === 'copytable') copyText(tableRows().map(r => r.map(v => String(v).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n')).then(ok => status(ok ? 'Table copied — paste it into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Findings copied.' : 'Copy was blocked.'));
  }

  // ---- coding sheet ----
  // Codes, sentiment and flags as columns to mark, which the tool reads back when the sheet is pasted in.
  function dataSheet() {
    const g = groupName() || 'Group';
    const codeNames = state.codes.length ? state.codes.map(c => c.name) : ['Code 1', 'Code 2', 'Code 3', 'Code 4', 'Code 5', 'Code 6'];
    const head = ['ID', g, 'Response', ...codeNames, 'Other', 'Positive', 'Negative', 'Personal details', 'Safeguarding', 'Potential quote', 'Analytical notes'];
    const ids = state.codes.length ? state.codes.map(c => c.id) : [];
    const have = activeRows();
    const next = Math.max(0, ...have.map(r => +r.id).filter(isFinite));
    const sheet = [head.map(v => ({ v, s: 'head' }))];
    const total = Math.max(30, have.length + 10);
    for (let i = 0; i < total; i++) {
      const r = have[i], c = r ? state.coding[r.key] || {} : {}, cs = c.codes || [];
      const mark = on => ({ v: on ? 1 : '', s: 'input' });
      sheet.push([
        { v: r ? (isFinite(+r.id) ? +r.id : r.id) : next + i - have.length + 1, s: 'input' },
        { v: r ? r.group : '', s: 'input' }, { v: r ? r.text : '', s: 'wrap' },
        ...(ids.length ? ids.map(id => mark(cs.includes(id))) : codeNames.map(() => mark(false))),
        mark(cs.includes('other')), mark(c.sent === 'pos' || c.sent === 'mix'), mark(c.sent === 'neg' || c.sent === 'mix'),
        mark(c.pii), mark(c.safe), mark(c.quote), { v: c.note || '', s: 'input' }
      ]);
    }
    const codesSheet = [['Code', 'What belongs here', 'Words that suggest it'].map(v => ({ v, s: 'head' }))]
      .concat((state.codes.length ? state.codes : codeNames.map(n => ({ name: n, desc: '', keywords: '' }))).map(c => [{ v: c.name, s: 'input' }, { v: c.desc, s: 'input' }, { v: c.keywords, s: 'input' }]))
      .concat([[{ v: 'Other', s: 'input' }, { v: OTHER.desc, s: 'wrap' }, '']]);
    const notes = [
      'About this sheet',
      'A simple template for coding free-text comments: the comments on the left and a column for each code, so you can mark which codes apply to each response.',
      '',
      'Setting it up',
      '1. Give every response a unique ID (the ID column), so you can trace any comment back and share it with others.',
      `2. Put the comments in the Response column, and a ${g.toLowerCase()} for each in the ${g} column if you have one.`,
      '3. Rename the code columns to your codes (Code 1, Code 2 and so on). Insert more columns before Other if you need them. Add or remove columns now, to save going back and re-reading the comments later.',
      '4. List your codes on the Codes sheet with what belongs under each. This keeps coding consistent, especially with more than one coder. Expect these to change early on.',
      '5. Colour code the columns, for example one colour for the comments (which should not be changed), one for each group of codes and one for your notes.',
      '',
      'Coding',
      '6. Read each comment and put 1 in each code column that applies. Use Other for anything that doesn’t fit, and look back at these regularly: they show what your codes are missing.',
      '7. Mark Positive and Negative for sentiment. Mark both for a mixed comment.',
      '8. Mark Personal details and Safeguarding for comments that need action or redaction, and Potential quote for comments that show a finding well.',
      '9. Use Analytical notes for patterns, connections and what is implied.',
      '10. To keep track of which codes you use, add =COUNTA(D2:D500) under a code column. Split codes used a lot, and merge or drop ones hardly used. Don’t report these counts as findings.',
      '',
      'Bringing it back to the tool',
      'Save this workbook, then in the qualitative survey analysis tool choose Data sheet, then Import filled data sheet, and pick this file. It brings in your comments, codes and marks, and the descriptions on the Codes sheet. Or select the whole table on the Coding sheet, including the headings, copy it and paste it into the tool.'
    ];
    const titles = new Set(['About this sheet', 'Setting it up', 'Coding', 'Bringing it back to the tool']);
    return [
      { name: 'Coding', cols: [10, 18, 70, ...codeNames.map(() => 14), 10, 10, 10, 14, 14, 14, 40], rows: sheet, freeze: 1 },
      { name: 'Codes', cols: [30, 60, 50], rows: codesSheet, freeze: 1 },
      { name: 'Instructions', cols: [110], rows: notes.map(v => [{ v, s: titles.has(v) ? 'title' : 'wrap' }]) }
    ];
  }

  // A filled-in coding sheet: comments, coding and marks, then the code descriptions from the Codes sheet
  function importSheet(book, h) {
    const first = book.sheets.find(s => !/^(instructions|codes)$/i.test(s.name.trim()) && s.rows.length);
    const coding = h.sheet('Coding') || (first && first.rows);
    if (!coding) return new Error('That workbook doesn’t have a Coding sheet. Use a coding sheet downloaded from this tool.');
    const n = h.count(coding, 1);
    if (!n) return new Error('That coding sheet has no comments in yet.');
    els.data.value = h.tsv(coding, 1);
    headerTouched = false; clearTimeout(timer); update();
    if (importable()) doImport();
    (h.sheet('Codes') || []).slice(1).forEach(([name, desc, kw]) => {
      name = String(name || '').trim();
      if (!name || /^other$/i.test(name) || (/^code \d+$/i.test(name) && !desc && !kw)) return;
      const c = codeByName(name);
      if (!c) addCode(name, desc, kw);
      else { if (desc) c.desc = desc; if (kw) c.keywords = kw; }
    });
    fillFilters(); renderCode();
    return `Imported ${count(n, RESP)} from the coding sheet.`;
  }

  // ---- example ----
  const EXAMPLE = [
    [1, 'Outpatients', 'Consultant and staff had time for me to ask questions with well informed literature to take home as well'],
    [2, 'Outpatients', 'Phone call was 15 minutes late but service was comprehensive and friendly'],
    [3, 'Outpatients', 'No delay. The staff was very courteous and helpful. The vaccine and its possible side effects were fully explained. Very pleased with the service.'],
    [4, 'Emergency department', 'First visit was brilliant but second visit was horrible and made a complaint'],
    [5, 'Outpatients', 'Its been a joke past couple of years'],
    [6, 'Emergency department', 'Just good service'],
    [7, 'Inpatient wards', 'Nurses were very supportive, caring and sympathetic'],
    [8, 'Inpatient wards', 'There were issues with staffing levels when I was on the ward. This affected care in terms of people being familiar with patients and their care plans (bank and agency staff often weren’t), and whether or not people were available for 1:1s.'],
    [9, 'Inpatient wards', 'I would have liked to see the psychologist more while I was on the ward. I understand that work load is hard, and staff shortages are a major thing on the wards at the moment.'],
    [10, 'Inpatient wards', 'I was left on the toilet once for a very long time. I was getting anxious, something must have happened.'],
    [11, 'Outpatients', 'The car parking situation wasn’t very good'],
    [12, 'Maternity', 'The midwives were amazing. They listened to me and we made a birth plan together. I felt heard and supported, and when things changed quickly they explained everything calmly so I never felt frightened. Before the birth the antenatal classes were handled really well too, and although I had a long wait for my first scan it was worth it.'],
    [13, 'Inpatient wards', 'Food was cold by the time it got to me most days. A small thing, but when you are trying to get your strength back it matters.'],
    [14, 'Emergency department', 'Waited 7 hours to be seen with a broken wrist. Staff were clearly doing their best but there were not enough of them.'],
    [15, 'Outpatients', 'It took three months to get an appointment and when I finally saw someone I didn’t feel listened to. I kept saying the pain was getting worse and it was another two months before I was referred for a scan, by which time I couldn’t work.'],
    [16, 'Maternity', 'Dr Patel was lovely and explained everything.'],
    [17, 'Inpatient wards', 'Clean ward, kind staff, thank you all'],
    [18, 'Emergency department', 'N/A'],
    [19, 'Outpatients', 'Couldn’t get through on the phone to change my appointment. Rang 12 times.'],
    [20, 'Maternity', 'Partners should be able to stay overnight. My husband had to leave at 8pm and I was on my own with a newborn after a long labour, which was frightening. I didn’t know how to feed her and was too scared to keep pressing the buzzer.'],
    [21, 'Inpatient wards', 'Staff didn’t seem to know how to support my son, who has a learning disability. He needs things explained simply and with pictures, and nobody had been trained to do that, so he was frightened and wouldn’t let them take bloods.'],
    [22, 'Emergency department', 'Triage nurse was rude and dismissive'],
    [23, 'Outpatients', 'Very efficient, in and out in 20 minutes'],
    [24, 'Inpatient wards', 'My husband went into hospital with dehydration and came out 14 days later unable to walk, because no one got him out of bed. He also developed an infected bed sore and was discharged bedbound, which he still is.'],
    [25, 'Maternity', 'Some parts very good, other parts not so good'],
    [26, 'Outpatients', 'Letters arrived after the appointment date.'],
    [27, 'Emergency department', 'Kept informed about the wait the whole time, which made a big difference.'],
    [28, 'Inpatient wards', 'Vegetarian options were very limited and I had the same meal for a week. A menu with a few more choices would help a lot of people.'],
    [29, 'Maternity', 'Felt rushed at the 6 week check'],
    [30, 'Outpatients', 'All was good'],
    [31, 'Inpatient wards', 'I felt unsafe on the ward at night because another patient kept shouting and coming into my bay, and staff were too busy to help.'],
    [32, 'Emergency department', 'Nothing'],
    [33, 'Outpatients', 'I am so proud of the NHS after the care I received, it is there for the good of the people'],
    [34, 'Maternity', 'It was very good, mostly down to how friendly the staff were'],
    [35, 'Inpatient wards', 'Hard to find somewhere to park and the machines only take coins.'],
    [36, 'Emergency department', 'The doctor took time to explain my scan results and what would happen next. Being listened to made all the difference after months of being told it was nothing.']
  ];
  const EX_CODES = [
    ['Staff attitude', 'How staff behaved: kindness, respect, friendliness or rudeness', 'kind, caring, friendly, rude, respect, courteous, lovely, supportive, sympathetic, helpful, dismissive'],
    ['Communication and information', 'Being told what is happening: explanations, letters, phone calls', 'explain, informed, information, letter, phone, literature'],
    ['Being listened to and involved', 'Feeling heard and involved in decisions and plans', 'listen, heard, together, birth plan'],
    ['Waiting and access', 'Getting an appointment, waiting times and delays', 'wait, delay, late, appointment, months, hours'],
    ['Staffing levels', 'Enough staff, and staff being available', 'staffing, shortage, too busy, not enough of them'],
    ['Food and drink', 'Meals, drinks and choice', 'food, meal, menu, vegetarian'],
    ['Car parking', 'Parking and getting to the hospital', 'park'],
    ['Basic care and safety', 'Help with basic needs, and feeling safe', 'toilet, bed sore, out of bed, unsafe'],
    ['Staff training', 'Staff skills and training for particular needs', 'trained, training, learning disability']
  ];
  const EX_CODING = [
    [1, ['Communication and information', 'Staff attitude'], 'pos'],
    [2, ['Waiting and access', 'Staff attitude'], 'mix'],
    [3, ['Staff attitude', 'Communication and information'], 'pos'],
    [4, ['Other'], 'mix'],
    [5, ['Other'], 'neg'],
    [7, ['Staff attitude'], 'pos'],
    [8, ['Staffing levels', 'Basic care and safety'], 'neg', 'quote'],
    [9, ['Staffing levels'], 'neg'],
    [10, ['Basic care and safety', 'Staffing levels'], 'neg', 'quote', 'Staff not mentioned, but their absence is implied.'],
    [11, ['Car parking'], 'neg'],
    [12, ['Being listened to and involved', 'Staff attitude', 'Communication and information'], 'pos', 'quote'],
    [13, ['Food and drink'], 'neg', 'quote', 'Likely to affect everyone on the ward, not just this patient.'],
    [14, ['Waiting and access', 'Staffing levels'], 'mix'],
    [15, ['Waiting and access', 'Being listened to and involved'], 'neg', 'quote', 'Not being listened to led to a delayed referral.'],
    [16, ['Staff attitude', 'Communication and information'], 'pos', 'pii'],
    [20, ['Other'], 'neg', 'quote', 'Partners staying overnight: a possible new code.'],
    [21, ['Staff training'], 'neg', 'quote'],
    [24, ['Basic care and safety', 'Staffing levels'], 'neg', 'quote'],
    [28, ['Food and drink'], 'neg', 'quote'],
    [31, ['Basic care and safety', 'Staffing levels'], 'neg', 'safe'],
    [36, ['Being listened to and involved', 'Communication and information'], 'pos', 'quote']
  ];
  const EX_FINDINGS = {
    'Being listened to and involved': ['high', 'Being listened to shaped whether people felt their care was safe. Where people felt unheard, particularly when trying to get an appointment, they described delayed referrals and pain getting worse. Where staff listened and planned care with them, people felt supported and less afraid.'],
    'Staffing levels': ['high', 'Staff shortages were linked to unmet basic needs: people left waiting for help, not helped out of bed, or feeling unsafe at night. Often staff were not mentioned at all; it was their absence in the situations described that linked these comments.'],
    'Staff training': ['high', 'Few comments, but with serious impact for people with complex needs: staff did not know how to support a patient with a learning disability. Experiences of small groups like this will never show up in large numbers, but specific training could make a real difference to them.'],
    'Food and drink': ['some', 'Not many comments, but practical suggestions: food arriving cold and little vegetarian choice. These are likely to affect everyone on the ward, not just those who mentioned them, and small changes could help recovery.']
  };
  function loadExample() {
    state = blankState();
    els.question.value = 'Please can you tell us why you gave your answer?';
    els.data.value = ['ID\tService\tComment'].concat(EXAMPLE.map(r => r.join('\t'))).join('\n');
    headerTouched = false; colSig = '';
    document.querySelector('input[name=sample][value=all]').checked = true;
    document.querySelector('input[name=approach][value=combined]').checked = true;
    EX_CODES.forEach(c => addCode(...c));
    update();
    EX_CODING.forEach(([id, names, sent, flag, note]) => {
      const key = 'id:' + id, c = entry(key);
      c.codes = names.map(n => codeByName(n).id);
      c.sent = sent;
      if (flag) c[flag] = true;
      if (note) c.note = note;
      touched(key);
    });
    Object.keys(EX_FINDINGS).forEach(n => { const f = finding(codeByName(n).id); [f.impact, f.text] = EX_FINDINGS[n]; });
    render();
  }

  // ---- events ----
  els.data.addEventListener('input', () => schedule());
  els.hasHeader.addEventListener('change', () => { headerTouched = true; colSig = ''; update(); });
  [els.textCol, els.idCol, els.groupCol].forEach(s => s.addEventListener('change', update));
  $('importBtn').addEventListener('click', doImport);
  $('clearBtn').addEventListener('click', () => {
    if (Object.keys(state.coding).length && !confirm('Clear your comments and all your coding?')) return;
    els.data.value = ''; els.question.value = ''; state = blankState(); headerTouched = false; els.hasHeader.checked = false; chosenWord = null;
    update(); els.data.focus(); trackCleared();
  });
  trackSettings({ sample: 'sample', cloudSize: 'wcSize', cloudUnit: 'wcUnit', leaveOutCommonWords: 'wcStop', groupPlurals: 'wcPlural', approach: 'approach', hidePersonalDetails: 'redact' });
  els.question.addEventListener('input', () => schedule(render));
  document.querySelectorAll('input[name=sample]').forEach(r => r.addEventListener('change', () => { page = 0; render(); }));
  $('drawBtn').addEventListener('click', drawSample);
  els.boostBox.addEventListener('change', e => {
    const g = e.target.dataset.g; if (g === undefined) return;
    state.boost = e.target.checked ? uniq(state.boost.concat(g)) : state.boost.filter(x => x !== g);
  });
  els.thickAt.addEventListener('input', () => schedule(render));

  // steps
  TABS.forEach(k => $('tab-' + k).addEventListener('click', () => showTab(k)));
  document.querySelector('.tabs').addEventListener('keydown', e => {
    const i = TABS.indexOf(tab);
    const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); showTab(TABS[to], true);
  });
  document.querySelector('section.panel[aria-labelledby="result-h"]').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act) return act(b.dataset.act);
    if (b.dataset.goto) { els.codeSearch.value = ''; page = 0; showTab('code'); els.codeView.value = b.dataset.goto; renderList(); els.codeView.focus(); }
  });

  // word cloud
  ['wcMax', 'wcMin', 'wcExclude'].forEach(id => els[id].addEventListener('input', () => schedule(render)));
  [els.wcStop, els.wcPlural, els.wcFilter].forEach(el => el.addEventListener('change', render));
  document.querySelectorAll('input[name=wcSize], input[name=wcUnit]').forEach(r => r.addEventListener('change', () => { chosenWord = null; render(); }));
  els.cloudOut.addEventListener('click', e => {
    const g = e.target.closest('.wd, [data-word]'); if (g) showWord(g.dataset.w || g.dataset.word);
  });
  els.cloudOut.addEventListener('keydown', e => {
    const g = e.target.closest('.wd'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showWord(g.dataset.w); }
  });
  els.wordOut.addEventListener('click', e => {
    const b = e.target.closest('[data-codeword]'); if (!b) return;
    els.codeSearch.value = b.dataset.codeword.split(' ')[0];
    els.codeView.value = 'all'; page = 0; showTab('code');
  });

  // coding
  document.querySelectorAll('input[name=approach]').forEach(r => r.addEventListener('change', () => { els.approachNote.textContent = APPROACH[radio('approach')]; }));
  function newCode() {
    const name = els.newCode.value.trim(); if (!name) return els.newCode.focus();
    if (codeByName(name)) return status(`There is already a code called “${name}”.`);
    addCode(name); els.newCode.value = '';
    fillFilters(); renderCode(); els.newCode.focus();
  }
  $('addCode').addEventListener('click', newCode);
  els.newCode.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); newCode(); } });
  els.codesOut.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.del) deleteCode(b.dataset.del);
    if (b.hasAttribute('data-starter')) { STARTER.forEach(c => { if (!codeByName(c[0])) addCode(...c); }); fillFilters(); renderCode(); }
  });
  els.codesOut.addEventListener('input', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const c = state.codes.find(x => x.id === li.dataset.id); if (!c) return;
    if (e.target.classList.contains('cname')) c.name = e.target.value;
    if (e.target.classList.contains('cdesc')) c.desc = e.target.value;
    if (e.target.classList.contains('ckw')) c.keywords = e.target.value;
  });
  // Redraw the comments once a code's name or words are finished, to keep focus while typing.
  els.codesOut.addEventListener('change', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const c = state.codes.find(x => x.id === li.dataset.id);
    if (c && e.target.classList.contains('cname') && !c.name.trim()) { c.name = 'Untitled code'; e.target.value = c.name; }
    fillFilters(); renderList();
  });
  els.codeView.addEventListener('change', () => { page = 0; renderList(); });
  els.codeSearch.addEventListener('input', () => { page = 0; schedule(renderList); });
  els.listOut.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.page !== undefined) { page = +b.dataset.page; renderList(); els.progress.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const card = b.closest('.resp'); if (!card) return;
    const key = card.dataset.key, c = entry(key);
    let sel;
    if (b.dataset.code) { const id = b.dataset.code; c.codes = c.codes.includes(id) ? c.codes.filter(x => x !== id) : c.codes.concat(id); sel = `[data-code="${id}"]`; }
    else if (b.dataset.sent) { c.sent = c.sent === b.dataset.sent ? '' : b.dataset.sent; sel = `[data-sent="${b.dataset.sent}"]`; }
    else if (b.dataset.accept) { c.sent = b.dataset.accept; sel = `[data-sent="${c.sent}"]`; }
    else if (b.dataset.flag) { const f = b.dataset.flag; c[f] = !c[f]; sel = `[data-flag="${f}"]`; }
    else return;
    touched(key);
    const r = rows.find(x => x.key === key);
    card.outerHTML = cardHTML(r, searchRe());
    const nc = els.listOut.querySelector(`.resp[data-key="${CSS.escape(key)}"]`);
    if (nc) { const t = nc.querySelector(sel); if (t) t.focus(); }
    refreshCounts();
  });
  els.listOut.addEventListener('input', e => {
    if (!e.target.classList.contains('note')) return;
    const key = e.target.closest('.resp').dataset.key;
    entry(key).note = e.target.value; touched(key);
  });

  // findings
  els.findOut.addEventListener('click', e => {
    const b = e.target.closest('button[data-impact]'); if (!b) return;
    const id = b.closest('.finding').dataset.code, f = finding(id), k = b.dataset.impact;
    f.impact = f.impact === k ? '' : k;
    b.parentNode.querySelectorAll('[data-impact]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.impact === f.impact)));
    const m = $('mapChart'), svg = mapSVG(activeRows()); if (m && svg) m.innerHTML = svg;
  });
  els.findOut.addEventListener('input', e => {
    if (e.target.classList.contains('ftext')) finding(e.target.dataset.code).text = e.target.value;
  });
  els.findOut.addEventListener('change', e => {
    const key = e.target.dataset.quote; if (key === undefined) return;
    const f = finding(e.target.closest('.finding').dataset.code);
    f.skip = e.target.checked ? f.skip.filter(k => k !== key) : uniq(f.skip.concat(key));
  });
  $('methodBtn').addEventListener('click', () => {
    if (els.method.value.trim() && !confirm('Replace what you have written with the suggested wording?')) return;
    els.method.value = methodText(); els.method.focus();
  });
  els.redact.addEventListener('change', render);

  els.approachNote.textContent = APPROACH[radio('approach')];
  update(); // start empty, ready for the user's data
  // Redraw the word cloud once the font has loaded, so words are measured in it.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (tab === 'cloud' && rows.length) render(); });

  // ---- shared toolbar (Data sheet, Example, Open, Save, Export) ----
  FocusActions.mount({
    tool: 'qualitative_analysis', toolName: 'qualitative survey analysis',
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileName(),
    fields: 'main',
    getExtra: () => state,
    setExtra: x => { state = Object.assign(blankState(), x || {}); },
    afterOpen: () => { headerTouched = true; update(); },
    ready: () => rows.length > 0,
    // Copilot prompt: themes, counts and the person's own findings only. Free-text
    // comments and quotes are left out, as they may identify people.
    // The theme map, not the word cloud: words from comments could include names.
    explain: { place: 'section.panel[aria-labelledby="result-h"]', png: () => act('png', 'map'), text: () => {
      const SENT = { pos: 'positive', neg: 'negative', mix: 'mixed', neu: 'neutral' };
      const L = ['Qualitative analysis of free-text survey responses.', 'Question asked: ' + (els.question.value.trim() || '(not given)'),
        'Responses with a comment: ' + rows.length + '. Responses coded so far: ' + rows.filter(isCoded).length + '.', '', 'Themes (codes), with how many responses mention each:'];
      allCodes().forEach(c => {
        const list = rows.filter(r => { const x = state.coding[r.key]; return x && x.codes.includes(c.id); });
        if (!list.length && c.id === 'other') return;
        const s = {}; list.forEach(r => { const v = (state.coding[r.key] || {}).sent; if (v) s[v] = (s[v] || 0) + 1; });
        const sent = Object.keys(s).map(k => s[k] + ' ' + (SENT[k] || k)).join(', ');
        L.push('- ' + c.name + ': ' + list.length + (sent ? ' (' + sent + ')' : '') + (c.desc ? '. ' + c.desc : ''));
      });
      const f = allCodes().filter(c => state.findings[c.id] && state.findings[c.id].text);
      if (f.length) { L.push('', 'My findings so far:'); f.forEach(c => L.push('- ' + c.name + (state.findings[c.id].impact ? ' (impact: ' + state.findings[c.id].impact + ')' : '') + ': ' + state.findings[c.id].text)); }
      L.push('', 'The comments themselves are not included, to protect people’s privacy.');
      return L.join('\n');
    } },
    exports: trackExports([
      { type: 'png', label: 'Word cloud (PNG)', run: () => act('png', 'cloud') },
      { type: 'svg', label: 'Word cloud (SVG)', run: () => act('svg', 'cloud') },
      { type: 'copyimg', label: 'Copy word cloud', run: () => act('copyimg', 'cloud') },
      { type: 'png', label: 'Theme map (PNG)', hint: 'Themes by group, for reports', run: () => act('png', 'map') },
      { type: 'svg', label: 'Theme map (SVG)', run: () => act('svg', 'map') },
      { type: 'csv', label: 'Coded responses (.csv)', hint: 'A column for each code, with theme totals for a Pareto chart. Opens in Excel', run: () => act('csv') },
      { type: 'copytable', label: 'Copy coded responses', run: () => act('copytable') },
      { type: 'copysummary', label: 'Copy findings', hint: 'Method, findings and quotes, as text', run: () => act('copysummary') }
    ]),
    template: {
      fileName: () => fileName().replace(/^qualitative-analysis$/, 'qualitative') + '-coding-sheet.xlsx',
      title: 'Download a spreadsheet to code comments in, with a column for each code',
      sheets: dataSheet,
      import: importSheet
    }
  });
})();

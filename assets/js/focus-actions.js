/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* Shared FOCUS tool toolbar: New, Example, Open, Save and an Export menu, shown in the
   top right of every tool's page heading so they all work the same way.

   A tool calls FocusActions.mount({...}) once its own script has set up:

     tool       id of the tool, e.g. "bar_chart" (written into saved files)
     formerIds  optional earlier ids of the tool, so files saved under them still open
     toolName   name used in messages, e.g. "bar chart"
     fileName   () => base name for saved files, without extension
     fields     element (or selector) whose inputs are saved and reopened
     getExtra   () => any extra state to save alongside the fields
     setExtra   (extra, fromTool) => restore that extra state; fromTool is the id
                the file was saved under, which may be one of formerIds
     afterOpen  () => redraw once the fields have been restored
     save/open  optional overrides for tools that have their own project files
     example    () => fill the tool with its example data
     hasData    () => true if the user has entered something (asks before
                the example replaces it)
     say        optional (message) => void, to show messages the tool's way
     ready      () => true when there is something to export
     exports    [{ type, run, hint? }] where type is one of FORMATS below
     template   optional { fileName, title?, sheets, import? } for a "Data sheet"
                button that downloads a blank .xlsx to collect the data in; see
                xlsx(). fileName and sheets can each be a function, called on
                each click. With import, the button becomes a menu that can also
                bring a filled-in data sheet back in (and Open accepts .xlsx):
                  [{ sheet, into, fixed?, label? }]  copies each named sheet
                    into the field matching the selector `into`, as
                    tab-separated text like a paste from Excel. fixed = how
                    many columns on the left the blank sheet fills in for you
                    (such as a case number), so rows with nothing else in are
                    left out. Every field is replaced: one whose sheet is
                    missing is emptied, and the message names it by label.
                  (book, h) => message  for anything else; see importHelpers()
     explain    optional settings for the "Need further help to understand the
                analysis?" link to Microsoft 365 Copilot; see focus-explain.js
     load       optional (doc) => void, for tools with their own project files
                (those that pass save/open), so case study sample data can open
     reset      optional () => void, to clear the tool for a new analysis. Without
                it, New reloads the page empty (tools that keep their own state,
                such as in localStorage, must pass this)

   New asks whether to save first whenever hasData() says there is something
   to lose (or always, for tools that don't pass hasData).

   A3 report: every tool with an SVG export also gets "Add to A3 report" in
   its Export menu. It runs the tool's own SVG export, catches the file in
   saveFile() instead of saving it, and keeps it in this browser (IndexedDB,
   see clips below) for the A3 report tool to place. Pass a3: false to leave
   it out.

   Case study sample data: a link such as
     /spc_tool/?sample=/case_studies/data/late-discharges-2.json
   opens that project file as soon as the page has loaded, and shows a
   "Sample data" note with a link back to the case study. Only files under
   /case_studies/data/ on this site are opened.
*/
(function () {
  "use strict";

  const FORMATS = {
    png:         { label: "PNG image",         hint: "For slides and documents" },
    svg:         { label: "SVG image",         hint: "Scales without blurring" },
    copyimg:     { label: "Copy image",        hint: "Paste into PowerPoint or Word" },
    csv:         { label: "Data table (.csv)", hint: "Opens in Excel" },
    copytable:   { label: "Copy table",        hint: "Paste into Excel" },
    copysummary: { label: "Copy summary",      hint: "Plain-English reading, as text" }
  };

  const ICONS = {
    new: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M11.5 2.5h-7v15h11V6.5zM11.5 2.5v4h4M10 9v6M7 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    example: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 2.75a5 5 0 0 0-2.9 9.07c.4.29.65.74.65 1.23v.45h4.5v-.45c0-.49.25-.94.65-1.23A5 5 0 0 0 10 2.75zM8 16.5h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.75h7.5a1 1 0 0 1 1 1v7.25a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    save: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.5 3.5h10l3 3v10h-13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 3.5v4h6v-4M6.5 16.5v-5h7v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    sheet: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.5 3.5h13v13h-13zM3.5 8h13M3.5 12.25h13M8.5 3.5v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    export: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 3v9M6.5 6.5 10 3l3.5 3.5M4 12v4.5h12V12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const $ = (sel, root) => (typeof sel === "string" ? (root || document).querySelector(sel) : sel);

  /* ---------- saving and restoring form fields ---------- */
  function readFields(root) {
    const out = {};
    root.querySelectorAll("input, textarea, select").forEach(el => {
      if (el.type === "file" || el.type === "button" || el.type === "submit") return;
      if (el.type === "radio") { if (el.name && el.checked) out["radio:" + el.name] = el.value; return; }
      if (!el.id) return;
      out[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }
  function writeFields(root, fields) {
    const fire = el => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    Object.keys(fields).forEach(key => {
      const v = fields[key];
      if (key.startsWith("radio:")) {
        const name = key.slice(6);
        const r = [...root.querySelectorAll('input[type="radio"]')].find(x => x.name === name && x.value === String(v));
        if (r && !r.disabled) { r.checked = true; fire(r); }
        return;
      }
      const el = root.querySelector("#" + CSS.escape(key));
      if (!el || el.type === "file") return;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : String(v);
      fire(el);
    });
  }

  /* Save a file, letting the person choose where with a "Save as" window
     where the browser supports it (Chrome, Edge). Elsewhere, or where the
     window can't open, falls back to a normal download.
     Resolves true when saved, false when the person cancels. */
  const SAVE_TYPES = {
    png: ["image/png", "PNG image"], svg: ["image/svg+xml", "SVG image"],
    csv: ["text/csv", "CSV file"], json: ["application/json", "Saved work"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel workbook"],
    html: ["text/html", "Web page"], pdf: ["application/pdf", "PDF document"],
    pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint presentation"]
  };
  async function saveFile(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    if (capture && /\.svg$/i.test(name)) {
      const done = capture; capture = null;
      done(blob);
      // Never settles, so the tool doesn't also say it saved a file.
      return new Promise(() => {});
    }
    if (typeof window.showSaveFilePicker === "function") {
      const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
      const t = ext && SAVE_TYPES[ext.toLowerCase()];
      const opts = { suggestedName: name };
      if (t) opts.types = [{ description: t[1], accept: { [t[0]]: ["." + ext.toLowerCase()] } }];
      let handle = null;
      try { handle = await window.showSaveFilePicker(opts); }
      catch (err) { if (err && err.name === "AbortError") return false; }
      if (handle) {
        const w = await handle.createWritable();
        await w.write(blob); await w.close();
        return true;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }
  function download(name, data, mime, msg) {
    return saveFile(name, data, mime).then(
      ok => say(ok ? msg : "Download cancelled."),
      () => say("The file couldn’t be saved here."));
  }
  function safeName(s, fallback) {
    return (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)) || fallback;
  }

  /* ---------- blank .xlsx workbooks for collecting data ----------
     sheets: [{ name, cols: [widths], rows: [[cell]], freeze?: rows }]
     A cell is a string or number, or { v, s } where s is a style:
     "head" (bold, shaded), "input" (a box to fill in), "title" or "wrap". */
  const XSTYLE = { head: 1, input: 2, title: 3, wrap: 4 };
  const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = i => { let n = ""; for (i++; i; i = Math.floor((i - 1) / 26)) n = String.fromCharCode(65 + (i - 1) % 26) + n; return n; };
  function sheetXml(sh) {
    const cols = (sh.cols || []).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("");
    const rows = sh.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((c, ci) => {
      if (c == null) return "";
      const cell = typeof c === "object" ? c : { v: c };
      const ref = colName(ci) + (ri + 1), st = XSTYLE[cell.s] ? ' s="' + XSTYLE[cell.s] + '"' : "";
      if (cell.v == null || cell.v === "") return '<c r="' + ref + '"' + st + "/>";
      if (typeof cell.v === "number") return '<c r="' + ref + '"' + st + "><v>" + cell.v + "</v></c>";
      return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(cell.v) + "</t></is></c>";
    }).join("") + "</row>").join("");
    const pane = sh.freeze ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' + pane + "</sheetView></sheetViews>" +
      (cols ? "<cols>" + cols + "</cols>" : "") + "<sheetData>" + rows + "</sheetData></worksheet>";
  }
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE9F7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7DC"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><left style="thin"><color rgb="FFAEB7BD"/></left><right style="thin"><color rgb="FFAEB7BD"/></right><top style="thin"><color rgb="FFAEB7BD"/></top><bottom style="thin"><color rgb="FFAEB7BD"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  // An uncompressed ("stored") zip, which is all an .xlsx or .pptx needs to
  // be. Each file is [name, text or Uint8Array].
  function zip(files, type) {
    const enc = new TextEncoder(), parts = [], dir = [];
    let off = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(([name, text]) => {
      const nm = enc.encode(name), data = typeof text === "string" ? enc.encode(text) : text, crc = crc32(data);
      const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
      const local = new Uint8Array([...u32(0x04034b50), ...common]);
      parts.push(local, nm, data);
      dir.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
      off += local.length + nm.length + data.length;
    });
    const dirLen = dir.reduce((n, p) => n + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(dirLen), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...dir, end], { type: type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function xlsx(sheets) {
    const ws = sheets.map((sh, i) => ["xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(sh)]);
    return zip([
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        ws.map(w => '<Override PartName="/' + w[0] + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + "</Types>"],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((sh, i) => '<sheet name="' + xmlEsc(sh.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>"],
      ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        ws.map((w, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
        '<Relationship Id="rId' + (ws.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", STYLES],
      ...ws
    ]);
  }

  /* ---------- reading a filled-in .xlsx back in ----------
     Resolves { sheets: [{ name, rows: [[text]]] }] }, every cell as text the
     way it shows in Excel: dates as YYYY-MM-DD (with HH:MM when there is a
     time), percentages as 20%, numbers without floating point noise,
     TRUE/FALSE, errors blank. */
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(buf);
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("notzip");
    const count = dv.getUint16(end + 10, true), files = {};
    let p = dv.getUint32(end + 16, true);
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("notzip");
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true), name = dec.decode(b.subarray(p + 46, p + 46 + nLen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      files[name] = { method, data: b.subarray(start, start + size) };
      p += 46 + nLen + xLen + cLen;
    }
    return async name => {
      const f = files[name]; if (!f) return null;
      if (f.method === 0) return dec.decode(f.data);
      if (f.method !== 8) throw new Error("method");
      if (typeof DecompressionStream !== "function") throw new Error("inflate");
      const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return dec.decode(await new Response(stream).arrayBuffer());
    };
  }
  const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  function isDateFormat(code) {
    const c = String(code).replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
    return /[dmyhs]/i.test(c) && !/^general$/i.test(c.trim());
  }
  function serialText(v) {
    const days = Math.floor(v), t = Math.round((v - days) * 1440);
    const d = new Date(Date.UTC(1899, 11, 30) + days * 864e5), pad = n => String(n).padStart(2, "0");
    const date = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    const time = pad(Math.floor(t / 60) % 24) + ":" + pad(t % 60);
    return days === 0 && t ? time : t ? date + " " + time : date;
  }
  async function readXlsx(buf) {
    const get = await unzip(buf);
    const xml = async name => { const t = await get(name); return t == null ? null : new DOMParser().parseFromString(t, "application/xml"); };
    const els = (node, tag) => node ? [...node.getElementsByTagNameNS("*", tag)] : [];
    const text = node => els(node, "t").filter(t => !t.closest || !t.closest("rPh")).map(t => t.textContent).join("");
    const wb = await xml("xl/workbook.xml");
    if (!wb) throw new Error("notxlsx");
    const rels = {};
    els(await xml("xl/_rels/workbook.xml.rels"), "Relationship").forEach(r => { rels[r.getAttribute("Id")] = r.getAttribute("Target"); });
    const shared = els(await xml("xl/sharedStrings.xml"), "si").map(text);
    const styles = await xml("xl/styles.xml"), fmts = {};
    els(styles, "numFmt").forEach(f => { fmts[+f.getAttribute("numFmtId")] = f.getAttribute("formatCode"); });
    // How each cell style shows a number: as a date, a percentage or plain
    const xfs = els(els(styles, "cellXfs")[0], "xf").map(x => {
      const id = +x.getAttribute("numFmtId"), code = fmts[id];
      if (id === 9 || id === 10 || (code != null && /%/.test(String(code).replace(/"[^"]*"/g, "")))) return "pct";
      return BUILTIN_DATES.has(id) || (code != null && isDateFormat(code)) ? "date" : "";
    });
    const sheets = [];
    for (const sh of els(wb, "sheet")) {
      const rid = [...sh.attributes].find(a => a.localName === "id" && a.name !== "sheetId");
      let target = rid && rels[rid.value];
      if (!target) continue;
      target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      const doc = await xml(target);
      const rows = [];
      let ri = -1;
      els(doc, "row").forEach(row => {
        ri = row.getAttribute("r") ? +row.getAttribute("r") - 1 : ri + 1;
        const out = [];
        let ci = -1;
        els(row, "c").forEach(c => {
          const ref = c.getAttribute("r");
          ci = ref ? ref.replace(/\d+$/, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : ci + 1;
          const type = c.getAttribute("t"), vEl = els(c, "v")[0], v = vEl ? vEl.textContent : "";
          let val = "";
          if (type === "s") val = shared[+v] || "";
          else if (type === "inlineStr") val = text(els(c, "is")[0]);
          else if (type === "str") val = v;
          else if (type === "b") val = v === "1" ? "TRUE" : "FALSE";
          else if (type === "e") val = "";
          else if (v !== "" && isFinite(+v)) {
            const kind = xfs[+(c.getAttribute("s") || 0)];
            val = kind === "date" ? serialText(+v) : kind === "pct" ? String(+(+v * 100).toPrecision(15)) + "%" : String(+(+v).toPrecision(15));
          }
          else val = v;
          out[ci] = val;
        });
        for (let j = 0; j < out.length; j++) if (out[j] == null) out[j] = "";
        rows[ri] = out;
      });
      for (let j = 0; j < rows.length; j++) if (!rows[j]) rows[j] = [];
      rows.forEach(r => { while (r.length && String(r[r.length - 1]).trim() === "") r.pop(); });
      while (rows.length && !rows[rows.length - 1].length) rows.pop();
      sheets.push({ name: sh.getAttribute("name") || "", rows });
    }
    return { sheets };
  }
  // Helpers handed to a tool's own import function.
  function importHelpers(book) {
    const blank = v => String(v == null ? "" : v).trim() === "";
    const rowsIn = (rows, fixed) => (rows || []).filter((r, i) => i === 0 || r.slice(fixed || 0).some(v => !blank(v)));
    const h = {
      book,
      // A sheet's rows by name (any case), or null
      sheet: name => { const s = book.sheets.find(x => x.name.trim().toLowerCase() === String(name).trim().toLowerCase()); return s ? s.rows : null; },
      // Rows as tab-separated text, the way Excel copies them: the heading row,
      // then rows with something in beyond the first `fixed` columns. Cells with
      // a tab, line break or quote are quoted. "" when there are no data rows.
      tsv: (rows, fixed) => {
        const keep = rowsIn(rows, fixed);
        if (keep.length < 2) return "";
        const width = Math.max(...keep.map(r => { let n = r.length; while (n && blank(r[n - 1])) n--; return n; }));
        const cell = v => { v = String(v == null ? "" : v); return /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        return keep.map(r => Array.from({ length: width }, (_, j) => cell(r[j])).join("\t")).join("\n");
      },
      // Put text in a field and let the tool react as if it had been typed
      put: (sel, value) => {
        const el = $(sel); if (!el) return false;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      // How many data rows tsv() keeps
      count: (rows, fixed) => Math.max(0, rowsIn(rows, fixed).length - 1)
    };
    return h;
  }

  /* ---------- charts kept for the A3 report ---------- */
  /* Kept in IndexedDB on this site, so every tool can add to it and the A3
     report tool can read it. Nothing leaves the browser. Each clip is
     { id, tool, toolName, title, svg, doc, added, exp, named, page }. */
  let capture = null, a3Running = false;
  // Marks clips added from this page load, so adding the same chart again
  // replaces it rather than filling the list with copies.
  const PAGE = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const clips = (function () {
    let dbp = null;
    function db() {
      if (!dbp) dbp = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error("no IndexedDB"));
        const r = indexedDB.open("focus-a3", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("clips", { keyPath: "id", autoIncrement: true });
          r.result.createObjectStore("drafts");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    function run(store, mode, fn) {
      return db().then(d => new Promise((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }));
    }
    // The same chart again: same tool, export and title, and either a title
    // the person gave it or added from this same page. Resolves to "updated"
    // or "added".
    function keep(clip) {
      return db().then(d => new Promise((resolve, reject) => {
        const tx = d.transaction("clips", "readwrite"), st = tx.objectStore("clips");
        let result = "added";
        const req = st.getAll();
        req.onsuccess = () => {
          const same = (req.result || []).find(c => c.tool === clip.tool && c.exp === clip.exp &&
            c.title === clip.title && (clip.named || c.page === clip.page));
          if (same) { result = "updated"; st.put(Object.assign({}, clip, { id: same.id })); }
          else st.add(clip);
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      }));
    }
    return {
      add: clip => run("clips", "readwrite", st => st.add(clip)),
      keep,
      list: () => run("clips", "readonly", st => st.getAll()).then(a => (a || []).sort((x, y) => y.added.localeCompare(x.added))),
      remove: id => run("clips", "readwrite", st => st.delete(id)),
      removeMany: ids => run("clips", "readwrite", st => { ids.forEach(id => st.delete(id)); }),
      getDraft: key => run("drafts", "readonly", st => st.get(key)),
      setDraft: (key, val) => run("drafts", "readwrite", st => st.put(val, key)),
      clearDraft: key => run("drafts", "readwrite", st => st.delete(key))
    };
  })();

  let sayFn = null, statusEl = null, statusTimer = null;
  function say(msg) {
    if (sayFn) return sayFn(msg);
    if (!statusEl) return;
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 4000);
  }

  /* ---------- toolbar ---------- */
  /* The toolbar sits at the right of the dark blue header bar. On tool pages
     the header scrolls away until that bar reaches the top of the screen, then
     the bar stays there, so the buttons are always to hand. --fh-stick-h tells
     the page how tall the bar is, for anything else that sticks below it. */
  let barHome = null;
  function dockInHeader(bar) {
    const head = document.querySelector(".fh"), inner = head && head.querySelector(".fh-sub .fh-inner");
    if (!inner) return;
    barHome = bar.parentNode;
    inner.appendChild(bar);
    inner.parentNode.hidden = false;
    head.classList.add("fh-stick");
    bar.querySelectorAll(".fa-btns .fa-btn").forEach(b => { if (!b.title) b.title = b.textContent.trim(); });
    const top = head.querySelector(".fh-top"), sub = head.querySelector(".fh-sub");
    const measure = () => {
      head.style.setProperty("--fh-top-h", top.offsetHeight + "px");
      document.documentElement.style.setProperty("--fh-stick-h", sub.offsetHeight + "px");
    };
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(head);
    else window.addEventListener("resize", measure);
  }

  function mount(o) {
    const bar = document.querySelector("[data-focus-actions]");
    if (!bar) return;
    sayFn = o.say || null;
    const fallbackName = (o.tool || "focus").replace(/_/g, "-");
    const baseName = () => safeName(o.fileName ? o.fileName() : "", fallbackName);
    const fieldsRoot = o.fields ? $(o.fields) : null;

    bar.classList.add("fa-bar");
    bar.innerHTML =
      '<div class="fa-btns">' +
        '<button type="button" class="fa-btn" data-fa="new">' + ICONS.new + '<span>New</span></button>' +
        (o.template && o.template.import ?
          '<div class="fa-menu">' +
            '<button type="button" class="fa-btn fa-drop" data-fa="sheetmenu" aria-haspopup="true" aria-expanded="false">' + ICONS.sheet + '<span>Data sheet</span></button>' +
            '<div class="fa-list" role="menu" aria-label="Data sheet" hidden>' +
              '<button type="button" role="menuitem" data-fa="template">Download blank data sheet<small>A spreadsheet to collect your data in</small></button>' +
              '<button type="button" role="menuitem" data-fa="import">Import filled data sheet<small>Bring in a data sheet you’ve filled in (.xlsx)</small></button>' +
            '</div>' +
          '</div>' :
          o.template ? '<button type="button" class="fa-btn" data-fa="template">' + ICONS.sheet + '<span>Data sheet</span></button>' : '') +
        (o.example ? '<button type="button" class="fa-btn" data-fa="example">' + ICONS.example + '<span>Example</span></button>' : '') +
        '<button type="button" class="fa-btn" data-fa="open">' + ICONS.open + '<span>Open</span></button>' +
        '<button type="button" class="fa-btn" data-fa="save">' + ICONS.save + '<span>Save</span></button>' +
        '<div class="fa-menu">' +
          '<button type="button" class="fa-btn fa-primary" data-fa="export" aria-haspopup="true" aria-expanded="false">' + ICONS.export + '<span>Export</span></button>' +
          '<div class="fa-list" role="menu" aria-label="Export" hidden></div>' +
        '</div>' +
      '</div>' +
      '<input type="file" accept=".json,application/json' + (o.template && o.template.import ? ',.xlsx,.xlsm' : '') + '" class="fa-file" tabindex="-1" aria-hidden="true">' +
      (o.template && o.template.import ? '<input type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="fa-file fa-xlsx" tabindex="-1" aria-hidden="true">' : '') +
      '<p class="fa-status" role="status" aria-live="polite"></p>' +
      '<dialog class="fa-dialog" aria-labelledby="fa-new-title" aria-describedby="fa-new-text">' +
        '<h2 id="fa-new-title">Start a new analysis?</h2>' +
        '<p id="fa-new-text">This clears the ' + escHtml(o.toolName || "tool") + '. Anything you haven\'t saved will be lost. ' +
          'Save a project file first if you want to keep this one and open it again later.</p>' +
        '<div class="fa-dialog-btns">' +
          '<button type="button" class="fa-btn fa-primary-solid" data-fa-new="save">' + ICONS.save + '<span>Save, then start new</span></button>' +
          '<button type="button" class="fa-btn" data-fa-new="discard">Start new without saving</button>' +
          '<button type="button" class="fa-btn fa-quiet" data-fa-new="cancel">Cancel</button>' +
        '</div>' +
      '</dialog>';
    statusEl = bar.querySelector(".fa-status");
    dockInHeader(bar);

    const openBtn = bar.querySelector('[data-fa="open"]');
    const saveBtn = bar.querySelector('[data-fa="save"]');
    const expBtn = bar.querySelector('[data-fa="export"]');
    const list = expBtn.nextElementSibling;
    const fileIn = bar.querySelector(".fa-file");
    openBtn.title = o.template && o.template.import ? "Open a project file you saved, or a filled-in data sheet" : "Open a project file you saved";
    saveBtn.title = "Save a project file to reopen and keep editing later";

    list.innerHTML = (o.exports || []).map((e, i) => {
      const f = FORMATS[e.type] || { label: e.label || e.type, hint: "" };
      return '<button type="button" role="menuitem" data-i="' + i + '">' + (e.label || f.label) + '<small>' + (e.hint || f.hint) + '</small></button>';
    }).join("") + (o.a3 === false ? "" : (o.exports || []).map((e, i) => {
      if (e.type !== "svg") return "";
      const what = e.label ? e.label.replace(/\s*\(SVG\)\s*$/i, "") : "";
      return '<button type="button" role="menuitem" data-a3="' + i + '">' + (what ? "Add " + escHtml(what.toLowerCase()) + " to A3 report" : "Add to A3 report") +
        '<small>Place it on an A3 report with the A3 report tool</small></button>';
    }).join(""));
    // A drop-down menu: the button toggles it, Escape and clicks outside close
    // it, and the arrow keys move between its items. ready() (optional)
    // decides whether the items can be used when it opens. Opening one menu
    // closes the others.
    const menus = [];
    function menu(btn, list, ready) {
      const items = [...list.querySelectorAll('[role="menuitem"]')], box = list.parentNode;
      function setOpen(open) {
        if (open) menus.forEach(m => { if (m !== setOpen) m(false); });
        list.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        if (open) {
          // Keep the menu on screen when the button has wrapped to the left.
          list.style.right = "";
          const left = list.getBoundingClientRect().left;
          if (left < 8) list.style.right = (left - 8) + "px";
          const ok = !ready || ready();
          items.forEach(b => { b.disabled = !ok; });
          list.dataset.empty = ok ? "" : "Add some data first";
          const first = items.find(b => !b.disabled);
          if (first) first.focus();
        }
      }
      btn.addEventListener("click", e => { e.stopPropagation(); setOpen(list.hidden); });
      document.addEventListener("click", e => { if (!list.hidden && !box.contains(e.target)) setOpen(false); });
      box.addEventListener("keydown", e => {
        if (list.hidden) return;
        if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.focus(); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const live = items.filter(b => !b.disabled);
          if (!live.length) return;
          const at = live.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (at + 1) % live.length : (at - 1 + live.length) % live.length;
          live[next].focus();
        }
      });
      menus.push(setOpen);
      return setOpen;
    }
    const setOpen = menu(expBtn, list, () => !o.ready || o.ready());
    list.addEventListener("click", e => {
      const b = e.target.closest("[data-i],[data-a3]"); if (!b || b.disabled) return;
      setOpen(false); expBtn.focus();
      if (b.dataset.a3) return addToA3(o.exports[+b.dataset.a3]);
      try { o.exports[+b.dataset.i].run(); } catch (err) { say("Sorry, that export didn't work."); }
    });

    /* Add to A3 report: run the SVG export and keep the file it makes */
    function addToA3(exp) {
      let timer = 0;
      capture = blob => {
        clearTimeout(timer);
        blob.text().then(svg => {
          const name = (o.toolName || "chart").replace(/^./, c => c.toUpperCase());
          const base = baseName().replace(/-/g, " ");
          const doc = o.save ? null : {
            focus: { tool: o.tool, version: 1, saved: new Date().toISOString() },
            fields: fieldsRoot ? readFields(fieldsRoot) : {},
            extra: o.getExtra ? o.getExtra() : null
          };
          const named = !!base && base !== fallbackName.replace(/-/g, " ");
          return clips.keep({
            tool: o.tool, toolName: name, svg, doc, added: new Date().toISOString(),
            title: named ? base.replace(/^./, c => c.toUpperCase()) : name +
              (exp.label ? " – " + exp.label.replace(/\s*\(SVG\)\s*$/i, "").toLowerCase() : ""),
            exp: (exp.type || "") + "|" + (exp.label || ""), named, page: PAGE
          });
        }).then(
          r => say(r === "updated"
            ? "Updated this chart in your A3 report charts. To keep both, give the chart a different name first."
            : "Added to your A3 report charts. Open the A3 report tool to place it."),
          () => say("Sorry, the chart couldn't be kept in this browser for the A3 report."));
      };
      timer = setTimeout(() => { capture = null; }, 5000);
      a3Running = true;
      try { exp.run(); }
      catch (err) { capture = null; clearTimeout(timer); say("Sorry, the chart couldn't be added to the A3 report."); }
      finally { a3Running = false; }
    }

    /* Data sheet */
    const tplBtn = bar.querySelector('[data-fa="template"]');
    const sheetBtn = bar.querySelector('[data-fa="sheetmenu"]');
    const closeSheet = sheetBtn ? menu(sheetBtn, sheetBtn.nextElementSibling) : () => {};
    if (sheetBtn) sheetBtn.title = "Download a blank data sheet, or import one you’ve filled in";
    if (tplBtn) {
      tplBtn.title = o.template.title || "Download a blank spreadsheet to collect your data in";
      tplBtn.addEventListener("click", () => {
        if (sheetBtn) { closeSheet(false); sheetBtn.focus(); }
        const sheets = typeof o.template.sheets === "function" ? o.template.sheets() : o.template.sheets;
        const name = typeof o.template.fileName === "function" ? o.template.fileName() : o.template.fileName;
        download(name, xlsx(sheets), undefined, "Saved " + name + ". Fill it in, then use Data sheet, Import filled data sheet, to bring it back in.");
      });
    }
    const xlsxIn = bar.querySelector(".fa-xlsx");
    const impBtn = bar.querySelector('[data-fa="import"]');
    if (impBtn) {
      impBtn.title = "Bring in a data sheet from this tool that you’ve filled in";
      impBtn.addEventListener("click", () => { closeSheet(false); sheetBtn.focus(); xlsxIn.click(); });
      xlsxIn.addEventListener("change", () => { const f = xlsxIn.files && xlsxIn.files[0]; xlsxIn.value = ""; if (f) importSheet(f); });
    }
    // Read a filled-in data sheet and hand it to the tool.
    function importSheet(f) {
      if (!/\.xls[xm]$/i.test(f.name)) return say(/\.xls$/i.test(f.name) ? "That’s an older Excel file. Save it as an Excel Workbook (.xlsx) and try again." : "Choose a data sheet saved as an Excel Workbook (.xlsx).");
      f.arrayBuffer().then(readXlsx).then(book => {
        if (o.hasData && o.hasData() && !confirm("Replace what you've entered with the data sheet?")) return;
        const h = importHelpers(book), imp = o.template.import;
        let msg;
        if (typeof imp === "function") msg = imp(book, h);
        else {
          const found = imp.map(spec => {
            let rows = h.sheet(spec.sheet);
            // A single-sheet tool also takes the first sheet of a workbook laid out differently
            if (!rows && imp.length === 1) { const first = book.sheets.find(s => !/^instructions$/i.test(s.name.trim()) && s.rows.length); rows = first ? first.rows : null; }
            return { spec, rows };
          });
          if (!found.some(x => x.rows)) msg = new Error((imp.length === 1 ? "That workbook doesn’t have a " + imp[0].sheet + " sheet."
            : "That workbook doesn’t have any of this tool’s sheets (" + imp.map(x => x.sheet).join(", ") + "), so nothing was changed.") + " Use a data sheet downloaded from this tool.");
          else {
            // Every box is replaced, so nothing is left over from before: a
            // sheet that is missing (renamed or deleted) empties its box.
            found.forEach(x => { h.put(x.spec.into, x.rows ? h.tsv(x.rows, x.spec.fixed) : ""); });
            const got = found.filter(x => x.rows).map(x => [x.spec.sheet, h.count(x.rows, x.spec.fixed)]);
            const lost = found.filter(x => !x.rows).map(x => x.spec);
            const rows = n => n + (n === 1 ? " row" : " rows"), filled = got.filter(g => g[1]);
            const and = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0];
            msg = !filled.length ? "That data sheet has no rows filled in yet."
              : got.length === 1 ? "Imported " + rows(got[0][1]) + " from " + f.name + "."
              : "Imported " + f.name + ": " + filled.map(g => rows(g[1]) + " from " + g[0]).join(", ") + ".";
            if (lost.length) msg += " No " + and(lost.map(x => x.sheet)).replace(/ and /, " or ") + " sheet found, so " +
              and(lost.map(x => x.label || "the " + x.sheet + " box")) + (lost.length === 1 ? " is" : " are") +
              " now empty. Check the tab names match the data sheet.";
          }
        }
        if (msg instanceof Error) return say(msg.message);
        say(msg || "Imported " + f.name + ".");
        if (window.trackToolEvent) window.trackToolEvent("data_sheet_imported");
      }).catch(err => {
        const m = err && err.message;
        say(m === "inflate" ? "Your browser can’t read Excel files. Copy the table from Excel and paste it in instead."
          : m === "notzip" || m === "notxlsx" ? "That file isn’t an Excel workbook (.xlsx) that can be read."
          : "Sorry, that data sheet couldn’t be imported. Copy the table from Excel and paste it in instead.");
      });
    }

    /* Example */
    const exBtn = bar.querySelector('[data-fa="example"]');
    if (exBtn) {
      exBtn.title = "Fill in example data to see how the tool works";
      exBtn.addEventListener("click", () => {
        if (o.hasData && o.hasData() && !confirm("Replace what you've entered with the example?")) return;
        o.example();
      });
    }

    /* New: ask to save first, then clear the tool */
    const newBtn = bar.querySelector('[data-fa="new"]');
    const dlg = bar.querySelector(".fa-dialog");
    newBtn.title = "Clear the tool and start a new analysis";
    function startNew() {
      if (o.reset) {
        try { o.reset(); } catch (e) { return say("Sorry, the tool couldn't be cleared. Reload the page instead."); }
        const note = document.querySelector(".fa-sample"); if (note) note.remove();
        if (window.trackToolEvent) window.trackToolEvent("new_analysis");
        return say("Started a new analysis.");
      }
      if (window.trackToolEvent) window.trackToolEvent("new_analysis");
      // Put every field back to how the page first loaded, so the browser
      // doesn't restore what was typed when the page loads again.
      document.querySelectorAll("input, textarea, select").forEach(el => {
        if (el.type === "file") el.value = "";
        else if (el.type === "checkbox" || el.type === "radio") el.checked = el.defaultChecked;
        else if (el.tagName === "SELECT") [...el.options].forEach(op => { op.selected = op.defaultSelected; });
        else if ("defaultValue" in el) el.value = el.defaultValue;
      });
      // Load the page again without ?sample= or anything else in the address.
      location.replace(location.pathname);
    }
    function closeNew() { if (dlg.open) dlg.close(); newBtn.focus(); }
    newBtn.addEventListener("click", () => {
      if (o.hasData && !o.hasData()) return startNew();
      if (typeof dlg.showModal !== "function") {
        if (confirm("Start a new analysis? Anything you haven't saved will be lost. Choose Cancel, then Save, to keep it.")) startNew();
        return;
      }
      dlg.showModal();
      dlg.querySelector('[data-fa-new="save"]').focus();
    });
    dlg.addEventListener("click", e => {
      if (e.target === dlg) return closeNew(); // click on the backdrop
      const b = e.target.closest("[data-fa-new]"); if (!b) return;
      const act = b.dataset.faNew;
      if (act === "cancel") return closeNew();
      dlg.close();
      if (act === "discard") return startNew();
      saveBtn.click();
      // Give the browser a moment to start the download before the page reloads.
      setTimeout(startNew, o.reset ? 0 : 600);
    });
    dlg.addEventListener("cancel", e => { e.preventDefault(); closeNew(); });

    /* Save */
    saveBtn.addEventListener("click", () => {
      if (o.save) return o.save();
      const doc = {
        focus: { tool: o.tool, version: 1, saved: new Date().toISOString() },
        fields: fieldsRoot ? readFields(fieldsRoot) : {},
        extra: o.getExtra ? o.getExtra() : null
      };
      download(baseName() + ".json", JSON.stringify(doc, null, 2), "application/json", "Saved " + baseName() + ".json. Use Open to carry on later.");
    });

    /* Open */
    openBtn.addEventListener("click", () => { if (o.open) return o.open(); fileIn.click(); });
    // Restore a project document saved by this toolbar. Returns an error
    // message, or "" when it worked.
    function applyDoc(doc) {
      if (!doc || !doc.focus || !doc.fields) return "That file isn't a FOCUS project file.";
      if (doc.focus.tool !== o.tool && !(o.formerIds || []).includes(doc.focus.tool)) {
        const other = String(doc.focus.tool || "another tool").replace(/_/g, " ");
        return "That file was saved from the " + other + " tool. Open it there instead.";
      }
      // Two passes: the first redraw can add options (such as a column
      // picker) that the second pass then selects.
      // A tool can throw on the first pass, before those options exist.
      for (let pass = 0; pass < 2; pass++) {
        try {
          if (fieldsRoot) writeFields(fieldsRoot, doc.fields);
          if (o.setExtra) o.setExtra(doc.extra, doc.focus.tool);
          if (o.afterOpen) o.afterOpen();
        } catch (e) {
          if (pass === 1) return "Sorry, that file didn't open properly.";
        }
      }
      return "";
    }

    fileIn.addEventListener("change", () => {
      const f = fileIn.files && fileIn.files[0]; if (!f) return;
      if (o.template && o.template.import && /\.xls[xm]?$/i.test(f.name)) { fileIn.value = ""; return importSheet(f); }
      const r = new FileReader();
      r.onload = () => {
        fileIn.value = "";
        let doc;
        try { doc = JSON.parse(r.result); } catch (e) { return say("That file isn't a FOCUS project file."); }
        const err = applyDoc(doc);
        say(err || "Opened " + f.name + ".");
      };
      r.onerror = () => say("Couldn't read that file.");
      r.readAsText(f);
    });

    /* "Need further help to understand the analysis?" link (focus-explain.js) */
    if (window.FocusExplain) { try { window.FocusExplain.setup(o); } catch (e) { /* the tool still works without it */ } }

    /* Case study sample data (?sample=...) */
    const sample = samplePath();
    if (sample) {
      const run = () => setTimeout(() => loadSample(sample), 0);
      if (document.readyState === "complete") run(); else window.addEventListener("load", run, { once: true });
    }
    function loadSample(path) {
      fetch(path, { credentials: "same-origin" })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(doc => {
          if (o.hasData && o.hasData() && !confirm("Replace what you've entered with the case study sample data?")) return;
          let err = "";
          if (o.load) {
            if (doc && doc.focus && doc.focus.tool && doc.focus.tool !== o.tool) err = "That sample belongs to another tool.";
            else { try { o.load(doc); } catch (e) { err = "Sorry, the sample data didn't open."; } }
          } else err = applyDoc(doc);
          if (err) return say(err);
          sampleNote(bar, doc.sample || {});
          say("Opened the case study sample data.");
        })
        .catch(() => say("Sorry, the sample data couldn't be loaded."));
    }
  }

  // The ?sample= path, if it points at a case study data file on this site.
  function samplePath() {
    let p;
    try { p = new URLSearchParams(location.search).get("sample"); } catch (e) { return ""; }
    if (!p) return "";
    const base = (document.querySelector('meta[name="focus-base"]') || {}).content || "";
    const rel = p.startsWith(base + "/") ? p.slice(base.length) : p;
    return /^\/case_studies\/data\/[a-z0-9-]+\.json$/.test(rel) ? base + rel : "";
  }

  // A note under the page heading: this is sample data, from which case study.
  function sampleNote(bar, s) {
    const old = document.querySelector(".fa-sample"); if (old) old.remove();
    const note = document.createElement("div");
    note.className = "fa-sample";
    note.setAttribute("role", "note");
    const back = typeof s.caseUrl === "string" && /^\/case_studies\/[a-z0-9-]+\/$/.test(s.caseUrl.replace(/^.*?(\/case_studies\/)/, "$1")) ? s.caseUrl : "";
    const b = document.createElement("b"); b.textContent = "Sample data";
    note.appendChild(b);
    const t = document.createElement("span");
    t.textContent = (s.caseTitle ? " · " + s.caseTitle : "") + (s.step ? " · Step " + s.step + (s.stepTitle ? ": " + s.stepTitle : "") : "") +
      ". Made-up figures for learning, not real GSTT data.";
    note.appendChild(t);
    if (s.look) {
      const l = document.createElement("span"); l.className = "fa-sample-look";
      l.textContent = "Look for: " + s.look;
      note.appendChild(l);
    }
    if (back) {
      const a = document.createElement("a"); a.href = back; a.textContent = "← Back to the case study";
      note.appendChild(a);
    }
    const host = barHome || bar.parentNode;
    host.parentNode.insertBefore(note, host.nextSibling);
  }

  window.FocusActions = { mount, say, xlsx, readXlsx, zip, saveFile, FORMATS, clips, addingToA3: () => a3Running };
})();

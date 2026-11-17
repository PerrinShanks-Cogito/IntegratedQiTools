/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* Attendee upload formatter. Replaces the Friday Office Script
   (attendeelistformatv1): turns the course attendee export (Sheet 1 columns
   A to O) into rows for the SharePoint training list (Sheet 2 columns), with
   the same rules as the script:
     FullName  = B & " " & C (each trimmed)
     TypeName, EventTypeID, Medium, LengthHours = event types table, looked up
                 on the course name in L (ignoring capitals)
     Name      = L without a leading "CITI:" or "CITI Bitesize series:",
                 plus " dd/mm/yyyy" from F unless L contains "elearning"
     F (date completed) goes to ElearningCompletionDate when the mapped
                 Medium is elearning, otherwise to EventDate
     Scheduled = 1, Completed = 1, Email = E; the rest are blank. The attendee list never leaves the browser; only the
   event types table is kept, in this browser's localStorage. */
(function () {
  const $ = id => document.getElementById(id);
  const els = {
    data: $("data"), detected: $("detected"), result: $("result"),
    fileIn: $("fileIn"), typesBody: $("typesBody"), typesIn: $("typesIn"), typesStatus: $("typesStatus")
  };
  const TYPES_KEY = "focus.attendee_upload.eventTypes";
  const DEFAULTS_URL = "/attendee_upload/event_types.json";

  // Sheet 1 columns, in order (A to O)
  const IN_COLS = ["Employee number", "First Name", "Last Name", "Username", "Email", "Date completed", "Role",
    "Division", "Directorate", "Department", "Staff Group", "Course Name", "Cost centre", "Site", "Epic Username"];
  // Sheet 2 columns, in order (A to N)
  const OUT_COLS = ["FullName", "TypeName", "EventTypeID", "Name", "Grouper", "EngagementNotes", "Medium", "LengthHours",
    "EventDate", "ElearningCompletionDate", "Facilitator1", "Scheduled", "Completed", "Email"];

  const norm = s => String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const key = s => norm(s).toLowerCase();
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pad = n => String(n).padStart(2, "0");
  const say = msg => { if (window.FocusActions) FocusActions.say(msg); };
  const track = (name, props) => { try { if (window.trackToolEvent) window.trackToolEvent(name, props || {}); } catch (e) { /* analytics is optional */ } };

  /* ---------- event types ---------- */
  let defaults = [];
  let types = [];

  function cleanType(t) {
    const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : ""; };
    return { course: norm(t.course), typeName: norm(t.typeName), eventTypeId: num(t.eventTypeId), medium: norm(t.medium), lengthHours: num(t.lengthHours) };
  }
  function saveTypes() {
    try { localStorage.setItem(TYPES_KEY, JSON.stringify(types)); } catch (e) { /* private window: kept for this visit only */ }
  }
  function loadStoredTypes() {
    try {
      const raw = localStorage.getItem(TYPES_KEY);
      if (!raw) return null;
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.map(cleanType) : null;
    } catch (e) { return null; }
  }
  function typeLookup() {
    const m = new Map();
    types.forEach(t => { if (t.course && !m.has(key(t.course))) m.set(key(t.course), t); });
    return m;
  }
  function typesSay(msg) { els.typesStatus.textContent = msg; }

  function renderTypes(focusLast) {
    const field = (i, name, label, type) =>
      '<input type="' + (type || "text") + '"' + (type === "number" ? ' step="any"' : "") + ' data-i="' + i + '" data-k="' + name +
      '" aria-label="' + label + ', row ' + (i + 1) + '" value="' + esc(types[i][name]) + '">';
    els.typesBody.innerHTML = types.map((t, i) =>
      '<tr><td class="c">' + field(i, "course", "Course name") + "</td><td>" + field(i, "typeName", "TypeName") +
      '</td><td class="n">' + field(i, "eventTypeId", "EventTypeID", "number") + "</td><td>" + field(i, "medium", "Medium") +
      '</td><td class="n">' + field(i, "lengthHours", "LengthHours", "number") +
      '</td><td><button type="button" class="del" data-del="' + i + '" aria-label="Remove event type ' + (i + 1) + '">✕</button></td></tr>'
    ).join("") || '<tr><td colspan="6" class="hint">No event types yet. Add one below.</td></tr>';
    if (focusLast) { const f = els.typesBody.querySelector("tr:last-child input"); if (f) f.focus(); }
  }
  els.typesBody.addEventListener("input", e => {
    const el = e.target, i = +el.dataset.i, k = el.dataset.k;
    if (!k || !types[i]) return;
    types[i][k] = el.type === "number" ? (el.value === "" ? "" : +el.value) : el.value;
    saveTypes(); update();
  });
  els.typesBody.addEventListener("change", e => {
    const el = e.target, i = +el.dataset.i;
    if (!el.dataset.k || !types[i]) return;
    types[i] = cleanType(types[i]);
    saveTypes();
  });
  els.typesBody.addEventListener("click", e => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    const i = +b.dataset.del, name = types[i] && types[i].course;
    if (name && !confirm("Remove the event type “" + name + "”?")) return;
    types.splice(i, 1); saveTypes(); renderTypes(); update();
    typesSay(name ? "Removed " + name + "." : "Removed the row.");
  });
  function addType(course) {
    types.push(cleanType({ course: course || "" }));
    saveTypes(); renderTypes(true); update();
    typesSay(course ? "Added " + course + ". Fill in its TypeName, EventTypeID, Medium and LengthHours." : "Added a row.");
  }
  $("addTypeBtn").addEventListener("click", () => addType(""));
  $("resetTypesBtn").addEventListener("click", () => {
    if (!confirm("Replace the event types in this browser with the defaults? Any you've added here will be lost unless you download them first.")) return;
    types = defaults.map(cleanType); saveTypes(); renderTypes(); update();
    typesSay("Event types reset to the defaults.");
  });
  $("dlTypesBtn").addEventListener("click", () => {
    const doc = { about: "Event types for the attendee upload formatter. Load this file on the page, or replace attendee_upload/event_types.json with it to change the defaults.", eventTypes: types.map(cleanType) };
    FocusActions.saveFile("event_types.json", JSON.stringify(doc, null, 2) + "\n", "application/json").then(
      ok => typesSay(ok ? "Downloaded event_types.json." : "Download cancelled."), () => typesSay("The file couldn’t be saved here."));
  });
  $("ulTypesBtn").addEventListener("click", () => els.typesIn.click());
  els.typesIn.addEventListener("change", () => {
    const f = els.typesIn.files && els.typesIn.files[0]; els.typesIn.value = "";
    if (!f) return;
    const big = FocusActions.tooBig(f, "project"); if (big) return typesSay(big);
    f.text().then(t => {
      const doc = JSON.parse(t), list = Array.isArray(doc) ? doc : doc && doc.eventTypes;
      if (!Array.isArray(list)) throw new Error("bad");
      types = list.map(cleanType); saveTypes(); renderTypes(); update();
      typesSay("Loaded " + types.length + " event type" + (types.length === 1 ? "" : "s") + " from " + f.name + ".");
    }).catch(() => typesSay("That file isn't an event types file."));
  });

  /* ---------- reading the attendee export ---------- */
  function splitText(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const tabbed = lines.some(l => l.includes("\t"));
    return lines.map(l => tabbed ? l.split("\t") : csvLine(l));
  }
  function csvLine(l) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  // Where each Sheet 1 column is: by heading when there's a heading row,
  // otherwise by position (A to O).
  function columnMap(rows) {
    const first = (rows[0] || []).map(key);
    const want = IN_COLS.map(key);
    const found = want.map(w => first.indexOf(w));
    const hits = found.filter(i => i >= 0).length;
    if (hits >= 3) {
      return { header: true, idx: found.map((f, i) => f >= 0 ? f : null) };
    }
    return { header: false, idx: want.map((w, i) => i) };
  }

  // Dates as Excel pastes them (dd/mm/yyyy or dd-Mon-yy, with or without a
  // time), as the workbook reader gives them (yyyy-mm-dd hh:mm) or as an
  // Excel serial. A time of day is kept, as Excel keeps it in the cell.
  // Two-digit years: under 30 is 20xx, otherwise 19xx, as in the script.
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseDate(v) {
    const s = norm(v);
    if (!s) return null;
    const year = t => { let y = +t; if (t.length <= 2) y += y < 30 ? 2000 : 1900; return y; };
    const time = t => {
      const m = String(t || "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
      if (!m) return t && t.trim() ? null : [0, 0, 0];
      let h = +m[1]; const ap = (m[4] || "").toLowerCase();
      if (ap.startsWith("p") && h < 12) h += 12;
      if (ap.startsWith("a") && h === 12) h = 0;
      return h < 24 && +m[2] < 60 && +(m[3] || 0) < 60 ? [h, +m[2], +(m[3] || 0)] : null;
    };
    let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2}|[A-Za-z]{3,9})[\/.\- ](\d{4}|\d{2})(?:[ T,]+(.*))?$/) ||
            s.match(/^(\d{1,2}) ([A-Za-z]{3,9}),? (\d{4}|\d{2})(?:[ T,]+(.*))?$/);
    if (m) {
      const mo = /\d/.test(m[2]) ? +m[2] : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      return valid(year(m[3]), mo, +m[1], time(m[4]));
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.*))?$/);
    if (m) return valid(+m[1], +m[2], +m[3], time(m[4]));
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const ms = Math.round(+s * 864e5 / 1000) * 1000, d = new Date(Date.UTC(1899, 11, 30) + ms);
      return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]);
    }
    return null;
  }
  function valid(y, mo, d, t) {
    if (!t || mo < 1) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, mo, d, h: t[0], mi: t[1], s: t[2] } : null;
  }
  const dayText = dt => pad(dt.d) + "/" + pad(dt.mo) + "/" + dt.y;
  const dateText = dt => dayText(dt) + " " + pad(dt.h) + ":" + pad(dt.mi) + ":" + pad(dt.s);
  const dateSerial = dt => (Date.UTC(dt.y, dt.mo - 1, dt.d, dt.h, dt.mi, dt.s) - Date.UTC(1899, 11, 30)) / 864e5;
  const DATE_COLS = ["EventDate", "ElearningCompletionDate"];

  /* ---------- building the output ---------- */
  let current = null;

  function build() {
    const text = els.data.value;
    if (!text.trim()) return null;
    const rows = splitText(text);
    const map = columnMap(rows);
    const body = (map.header ? rows.slice(1) : rows).filter(r => r.some(v => norm(v) !== ""));
    const get = (r, name) => { const i = map.idx[IN_COLS.indexOf(name)]; return i == null ? "" : r[i]; };
    const lookup = typeLookup();
    const unmatched = new Map();
    let badDates = 0, noEmail = 0, noName = 0;
    const out = body.map(r => {
      const course = norm(get(r, "Course Name"));
      const dt = parseDate(get(r, "Date completed"));
      const t = lookup.get(key(course));
      const fullName = norm(norm(get(r, "First Name")) + " " + norm(get(r, "Last Name")));
      const email = norm(get(r, "Email"));
      const shortCourse = course.replace(/^CITI(?:\s+Bitesize\s+series)?:\s*/i, "");
      const isElearningCourse = /elearning/i.test(course);
      const dateCol = t && norm(t.medium).toLowerCase() === "elearning" ? "ElearningCompletionDate" : "EventDate";
      if (!t && course) unmatched.set(key(course), { course, n: (unmatched.get(key(course)) || { n: 0 }).n + 1 });
      if (!dt) badDates++;
      if (!email) noEmail++;
      if (!fullName) noName++;
      const v = {
        FullName: fullName,
        TypeName: t ? t.typeName : "",
        EventTypeID: t ? t.eventTypeId : "",
        Name: dt && !isElearningCourse ? shortCourse + " " + dayText(dt) : shortCourse,
        Medium: t ? t.medium : "",
        LengthHours: t ? t.lengthHours : "",
        EventDate: "",
        ElearningCompletionDate: "",
        Scheduled: 1,
        Completed: 1,
        Email: email
      };
      if (dt) v[dateCol] = dateText(dt);
      return { v, dt, dateCol, matched: !!t, course, rawDate: norm(get(r, "Date completed")) };
    });
    return { rows: out, header: map.header, unmatched: [...unmatched.values()], badDates, noEmail, noName,
      missingCols: map.header ? IN_COLS.filter((c, i) => map.idx[i] == null && ["First Name", "Last Name", "Email", "Date completed", "Course Name"].includes(c)) : [] };
  }

  function update() {
    current = build();
    if (!current) {
      els.detected.textContent = "";
      els.result.innerHTML = '<div class="empty"><p>Paste or upload the attendee export on the left.</p><button type="button" class="primary" id="exampleBtn2">Try the example</button></div>';
      $("exampleBtn2").addEventListener("click", loadExample);
      return;
    }
    const c = current, n = c.rows.length;
    els.detected.textContent = n + " attendee row" + (n === 1 ? "" : "s") + (c.header ? ", heading row found." : ", no heading row, so columns are read in Sheet 1 order (A to O).");
    const issues = [];
    if (c.missingCols.length) issues.push("These columns weren't found in the heading row: " + c.missingCols.join(", ") + ".");
    if (c.badDates) issues.push(c.badDates + " row" + (c.badDates === 1 ? " has" : "s have") + " no date completed that could be read (expected dd/mm/yyyy). The date is missing from Name and EventDate or ElearningCompletionDate for " + (c.badDates === 1 ? "it" : "them") + ".");
    if (c.noEmail) issues.push(c.noEmail + " row" + (c.noEmail === 1 ? " has" : "s have") + " no email.");
    if (c.noName) issues.push(c.noName + " row" + (c.noName === 1 ? " has" : "s have") + " no first or last name.");
    const matched = c.rows.filter(r => r.matched).length;
    const ready = c.unmatched.length === 0 && !c.badDates;
    let h = '<p class="summary">' + (ready ? n + " row" + (n === 1 ? "" : "s") + " ready to upload." : matched + " of " + n + " rows matched to an event type.") + "</p>";
    if (c.unmatched.length) {
      h += '<div class="unmatched"><b>Course' + (c.unmatched.length === 1 ? "" : "s") + " not in the event types table</b>" +
        '<ul>' + c.unmatched.map(u => "<li>" + esc(u.course) + " (" + u.n + " row" + (u.n === 1 ? "" : "s") + ')<button type="button" data-addcourse="' + esc(u.course) + '">Add as event type</button></li>').join("") + "</ul></div>";
    }
    if (issues.length) h += '<ul class="issues">' + issues.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>";
    const shown = ["FullName", "TypeName", "EventTypeID", "Name", "Medium", "LengthHours", "EventDate", "ElearningCompletionDate", "Scheduled", "Completed", "Email"];
    h += '<p class="hint">Grouper, EngagementNotes and Facilitator1 are blank, so they’re not shown here. The download and copies include all 14 Sheet 2 columns.</p>';
    h += '<div class="tablewrap"><table><thead><tr><th scope="col">#</th>' + shown.map(s => '<th scope="col">' + s + "</th>").join("") + "</tr></thead><tbody>" +
      c.rows.map((r, i) => '<tr' + (r.matched && r.dt ? "" : ' class="warn"') + '><td class="num">' + (i + 1) + "</td>" + shown.map(s => {
        const val = r.v[s];
        const miss = (s === "TypeName" && !r.matched) || (s === r.dateCol && !r.dt);
        const shownVal = miss ? (s === r.dateCol ? (r.rawDate ? "Can't read “" + r.rawDate + "”" : "Missing") : "Not matched") : val;
        return "<td" + (miss ? ' class="miss"' : (["EventTypeID", "LengthHours", "Scheduled", "Completed"].includes(s) ? ' class="num"' : "")) + ">" + esc(shownVal) + "</td>";
      }).join("") + "</tr>").join("") + "</tbody></table></div>";
    els.result.innerHTML = h;
  }
  els.result.addEventListener("click", e => {
    const b = e.target.closest("[data-addcourse]"); if (!b) return;
    addType(b.dataset.addcourse);
    $("types-h").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  let timer = 0;
  els.data.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 150); });
  $("clearBtn").addEventListener("click", () => { els.data.value = ""; update(); els.data.focus(); });

  /* ---------- uploading a file ---------- */
  $("uploadBtn").addEventListener("click", () => els.fileIn.click());
  els.fileIn.addEventListener("change", () => {
    const f = els.fileIn.files && els.fileIn.files[0]; els.fileIn.value = "";
    if (!f) return;
    if (els.data.value.trim() && !confirm("Replace the data you've pasted with " + f.name + "?")) return;
    if (/\.(xlsx|xlsm)$/i.test(f.name)) {
      const big = FocusActions.tooBig(f, "sheet"); if (big) return say(big);
      f.arrayBuffer().then(FocusActions.readXlsx).then(book => {
        const has = sh => sh.rows.length && columnMap(sh.rows).header;
        const sheet = book.sheets.find(s => /^sheet\s*1$/i.test(s.name) && has(s)) || book.sheets.find(has) ||
          book.sheets.find(s => /^sheet\s*1$/i.test(s.name)) || book.sheets[0];
        if (!sheet || !sheet.rows.length) return say("There's no data in " + f.name + ".");
        els.data.value = sheet.rows.map(r => r.map(v => String(v).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
        update();
        track("attendee_file_uploaded", { kind: "xlsx", rows: current ? current.rows.length : 0 });
        say("Read " + (current ? current.rows.length : 0) + " rows from " + sheet.name + " in " + f.name + ".");
      }).catch(() => say("That file couldn't be read as an Excel workbook."));
    } else {
      const big = FocusActions.tooBig(f, "sheet"); if (big) return say(big);
      f.text().then(t => {
        els.data.value = splitText(t.replace(/^﻿/, "")).map(r => r.map(v => v.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n").replace(/\n+$/, "");
        update();
        track("attendee_file_uploaded", { kind: "csv", rows: current ? current.rows.length : 0 });
        say("Read " + (current ? current.rows.length : 0) + " rows from " + f.name + ".");
      }).catch(() => say("Couldn't read that file."));
    }
  });

  /* ---------- exports ---------- */
  const outValue = (r, col) => (col in r.v ? r.v[col] : "");
  function checkReady() {
    if (!current || !current.rows.length) { say("Paste or upload the attendee export first."); return false; }
    if (current.unmatched.length || current.badDates) {
      return confirm("Some rows aren't matched to an event type or have no date. Export them anyway, with those columns blank?");
    }
    return true;
  }
  function tsv(withHead) {
    const lines = current.rows.map(r => OUT_COLS.map(c => String(outValue(r, c)).replace(/[\t\r\n]+/g, " ")).join("\t"));
    return (withHead ? [OUT_COLS.join("\t")].concat(lines) : lines).join("\r\n");
  }
  function copy(withHead) {
    if (!checkReady()) return;
    const text = tsv(withHead);
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => say("Copied " + current.rows.length + " rows" + (withHead ? " with headings" : "") + ". Paste them into the list or workbook."),
      () => say("Couldn't copy here. Use Download for SharePoint instead."));
    track("attendee_copied", { rows: current.rows.length, head: withHead });
  }
  function fileBase() {
    const d = new Date();
    return "attendee-upload-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function downloadXlsx() {
    if (!checkReady()) return;
    const head = OUT_COLS.map(c => ({ v: c, s: "head" }));
    const rows = current.rows.map(r => OUT_COLS.map(c => {
      if (DATE_COLS.includes(c)) return r.dt && c === r.dateCol ? { v: dateSerial(r.dt), s: "date" } : null;
      const v = outValue(r, c);
      return v === "" ? null : v;
    }));
    const widths = [24, 34, 12, 60, 10, 18, 11, 12, 20, 22, 14, 11, 11, 32];
    const blob = FocusActions.xlsx([{ name: "Sheet2", cols: widths, rows: [head].concat(rows), freeze: 1 }]);
    FocusActions.saveFile(fileBase() + ".xlsx", blob).then(
      ok => say(ok ? "Downloaded " + fileBase() + ".xlsx with " + current.rows.length + " rows." : "Download cancelled."),
      () => say("The file couldn’t be saved here."));
    track("attendee_exported", { rows: current.rows.length, type: "xlsx" });
  }
  function downloadCsv() {
    if (!checkReady()) return;
    const q = v => { const s = String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = "﻿" + [OUT_COLS.map(q).join(",")].concat(current.rows.map(r => OUT_COLS.map(c => q(outValue(r, c))).join(","))).join("\r\n");
    FocusActions.saveFile(fileBase() + ".csv", csv, "text/csv").then(
      ok => say(ok ? "Downloaded " + fileBase() + ".csv." : "Download cancelled."), () => say("The file couldn’t be saved here."));
    track("attendee_exported", { rows: current.rows.length, type: "csv" });
  }

  /* ---------- example (made-up people) ---------- */
  function loadExample() {
    if (els.data.value.trim() && !confirm("Replace what you've entered with the example?")) return;
    const ex = [
      IN_COLS,
      ["100001", "Alex", "Morgan", "amorgan", "alex.morgan@example.nhs.uk", "14/11/2026", "Staff Nurse", "Medicine", "Acute", "Ward A", "Nursing", "CITI: Intro to Improvement eLearning", "C100", "Site 1", "AMORGAN"],
      ["100002", "Sam", "Patel", "spatel", "sam.patel@example.nhs.uk", "13/11/2026 14:30", "Physiotherapist", "Surgery", "Therapies", "Physio", "AHP", "CITI Bitesize series: Introduction to Data for Improvement", "C200", "Site 2", "SPATEL"],
      ["100003", "Jo", "Okafor", "jokafor", "jo.okafor@example.nhs.uk", "13/11/2026", "Admin Officer", "Corporate", "Finance", "Payroll", "Admin", "CITI Bitesize series: Introduction to Data for Improvement", "C300", "Site 1", ""],
      ["100004", "Chris", "Lee", "clee", "chris.lee@example.nhs.uk", "12/11/2026", "Registrar", "Medicine", "Cardiology", "Cardiology", "Medical", "CITI Bitesize series: Introduction to SPC charts for Improvement", "C400", "Site 1", "CLEE"],
      ["100005", "Rowan", "Hughes", "rhughes", "rowan.hughes@example.nhs.uk", "11/11/2026", "Pharmacist", "Clinical Support", "Pharmacy", "Pharmacy", "AHP", "CITI: Introduction to Excel for Improvement eLearning", "C500", "Site 2", "RHUGHES"]
    ];
    els.data.value = ex.map(r => r.join("\t")).join("\n");
    update();
  }
  $("exampleBtn2").addEventListener("click", loadExample);

  /* ---------- toolbar ---------- */
  FocusActions.mount({
    tool: "attendee_upload", toolName: "attendee upload formatter",
    example: loadExample, hasData: () => !!els.data.value.trim(),
    fileName: () => fileBase(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ eventTypes: types.map(cleanType) }),
    setExtra: extra => {
      if (extra && Array.isArray(extra.eventTypes) && extra.eventTypes.length) {
        types = extra.eventTypes.map(cleanType); saveTypes(); renderTypes();
      }
    },
    afterOpen: () => update(),
    explain: { off: true },  // never send attendee rows to Copilot
    reset: () => { els.data.value = ""; update(); },
    ready: () => !!(current && current.rows.length),
    exports: [
      { type: "xlsx", label: "Download for SharePoint (.xlsx)", hint: "Sheet 2 columns, ready to copy into the list", run: downloadXlsx },
      { type: "copyrows", label: "Copy rows", hint: "Without headings, to paste under existing rows", run: () => copy(false) },
      { type: "copytable", label: "Copy rows with headings", hint: "Paste into a new workbook", run: () => copy(true) },
      { type: "csv", label: "Data table (.csv)", hint: "All 14 Sheet 2 columns", run: downloadCsv }
    ]
  });

  /* ---------- start ---------- */
  const stored = loadStoredTypes();
  fetch(DEFAULTS_URL, { credentials: "same-origin" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(doc => { defaults = (doc.eventTypes || []).map(cleanType); })
    .catch(() => { defaults = []; typesSay("The default event types couldn't be loaded."); })
    .then(() => {
      types = stored || defaults.map(cleanType);
      renderTypes(); update();
    });
  renderTypes(); update();
})();

/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* Shared FOCUS tool toolbar: Example, Open, Save and an Export menu, shown in the
   top right of every tool's page heading so they all work the same way.

   A tool calls FocusActions.mount({...}) once its own script has set up:

     tool       id of the tool, e.g. "bar_chart" (written into saved files)
     toolName   name used in messages, e.g. "bar chart"
     fileName   () => base name for saved files, without extension
     fields     element (or selector) whose inputs are saved and reopened
     getExtra   () => any extra state to save alongside the fields
     setExtra   (extra) => restore that extra state
     afterOpen  () => redraw once the fields have been restored
     save/open  optional overrides for tools that have their own project files
     example    () => fill the tool with its example data
     hasData    () => true if the user has entered something (asks before
                the example replaces it)
     say        optional (message) => void, to show messages the tool's way
     ready      () => true when there is something to export
     exports    [{ type, run, hint? }] where type is one of FORMATS below
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
    example: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 2.75a5 5 0 0 0-2.9 9.07c.4.29.65.74.65 1.23v.45h4.5v-.45c0-.49.25-.94.65-1.23A5 5 0 0 0 10 2.75zM8 16.5h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.75h7.5a1 1 0 0 1 1 1v7.25a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    save: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3.5 3.5h10l3 3v10h-13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 3.5v4h6v-4M6.5 16.5v-5h7v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    export: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 3v9M6.5 6.5 10 3l3.5 3.5M4 12v4.5h12V12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

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

  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function safeName(s, fallback) {
    return (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)) || fallback;
  }

  let sayFn = null, statusEl = null, statusTimer = null;
  function say(msg) {
    if (sayFn) return sayFn(msg);
    if (!statusEl) return;
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 4000);
  }

  /* ---------- toolbar ---------- */
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
        (o.example ? '<button type="button" class="fa-btn" data-fa="example">' + ICONS.example + '<span>Example</span></button>' : '') +
        '<button type="button" class="fa-btn" data-fa="open">' + ICONS.open + '<span>Open</span></button>' +
        '<button type="button" class="fa-btn" data-fa="save">' + ICONS.save + '<span>Save</span></button>' +
        '<div class="fa-menu">' +
          '<button type="button" class="fa-btn fa-primary" data-fa="export" aria-haspopup="true" aria-expanded="false">' + ICONS.export + '<span>Export</span></button>' +
          '<div class="fa-list" role="menu" aria-label="Export" hidden></div>' +
        '</div>' +
      '</div>' +
      '<input type="file" accept=".json,application/json" class="fa-file" tabindex="-1" aria-hidden="true">' +
      '<p class="fa-status" role="status" aria-live="polite"></p>';
    statusEl = bar.querySelector(".fa-status");

    const openBtn = bar.querySelector('[data-fa="open"]');
    const saveBtn = bar.querySelector('[data-fa="save"]');
    const expBtn = bar.querySelector('[data-fa="export"]');
    const list = bar.querySelector(".fa-list");
    const fileIn = bar.querySelector(".fa-file");
    openBtn.title = "Open a project file you saved";
    saveBtn.title = "Save a project file to reopen and keep editing later";

    list.innerHTML = (o.exports || []).map((e, i) => {
      const f = FORMATS[e.type] || { label: e.label || e.type, hint: "" };
      return '<button type="button" role="menuitem" data-i="' + i + '">' + (e.label || f.label) + '<small>' + (e.hint || f.hint) + '</small></button>';
    }).join("");
    const items = [...list.querySelectorAll('[role="menuitem"]')];

    function setOpen(open) {
      list.hidden = !open;
      expBtn.setAttribute("aria-expanded", String(open));
      if (open) {
        // Keep the menu on screen when the button has wrapped to the left.
        list.style.right = "";
        const left = list.getBoundingClientRect().left;
        if (left < 8) list.style.right = (left - 8) + "px";
        const ok = !o.ready || o.ready();
        items.forEach(b => { b.disabled = !ok; });
        list.dataset.empty = ok ? "" : "Add some data first";
        const first = items.find(b => !b.disabled);
        if (first) first.focus();
      }
    }
    expBtn.addEventListener("click", e => { e.stopPropagation(); setOpen(list.hidden); });
    document.addEventListener("click", e => { if (!list.hidden && !bar.contains(e.target)) setOpen(false); });
    bar.addEventListener("keydown", e => {
      if (list.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); expBtn.focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const live = items.filter(b => !b.disabled);
        if (!live.length) return;
        const at = live.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? (at + 1) % live.length : (at - 1 + live.length) % live.length;
        live[next].focus();
      }
    });
    list.addEventListener("click", e => {
      const b = e.target.closest("[data-i]"); if (!b || b.disabled) return;
      setOpen(false); expBtn.focus();
      try { o.exports[+b.dataset.i].run(); } catch (err) { say("Sorry, that export didn't work."); }
    });

    /* Example */
    const exBtn = bar.querySelector('[data-fa="example"]');
    if (exBtn) {
      exBtn.title = "Fill in example data to see how the tool works";
      exBtn.addEventListener("click", () => {
        if (o.hasData && o.hasData() && !confirm("Replace what you've entered with the example?")) return;
        o.example();
      });
    }

    /* Save */
    saveBtn.addEventListener("click", () => {
      if (o.save) return o.save();
      const doc = {
        focus: { tool: o.tool, version: 1, saved: new Date().toISOString() },
        fields: fieldsRoot ? readFields(fieldsRoot) : {},
        extra: o.getExtra ? o.getExtra() : null
      };
      download(baseName() + ".json", JSON.stringify(doc, null, 2), "application/json");
      say("Saved " + baseName() + ".json. Use Open to carry on later.");
    });

    /* Open */
    openBtn.addEventListener("click", () => { if (o.open) return o.open(); fileIn.click(); });
    fileIn.addEventListener("change", () => {
      const f = fileIn.files && fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        fileIn.value = "";
        let doc;
        try { doc = JSON.parse(r.result); } catch (e) { return say("That file isn't a FOCUS project file."); }
        if (!doc || !doc.focus || !doc.fields) return say("That file isn't a FOCUS project file.");
        if (doc.focus.tool !== o.tool) {
          const other = String(doc.focus.tool || "another tool").replace(/_/g, " ");
          return say("That file was saved from the " + other + " tool. Open it there instead.");
        }
        // Two passes: the first redraw can add options (such as a column
        // picker) that the second pass then selects.
        for (let pass = 0; pass < 2; pass++) {
          if (fieldsRoot) writeFields(fieldsRoot, doc.fields);
          if (o.setExtra) o.setExtra(doc.extra);
          if (o.afterOpen) o.afterOpen();
        }
        say("Opened " + f.name + ".");
      };
      r.onerror = () => say("Couldn't read that file.");
      r.readAsText(f);
    });
  }

  window.FocusActions = { mount, say, FORMATS };
})();

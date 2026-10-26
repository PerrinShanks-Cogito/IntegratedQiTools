/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* "Need further help to understand the analysis?"

   A link under each tool's analysis. It opens a panel that:
     1. builds a prompt for Microsoft 365 Copilot Chat from the analysis on the
        page, with anything that looks like personal identifying information
        removed, shown in an editable box so the person can check it
     2. downloads the tool's PNG image of the chart, to attach in Copilot
     3. opens Copilot Chat in a new tab
   Copilot Chat can't be pre-filled from a link and won't take an image from
   one, so the person pastes the prompt and attaches the image themselves.

   FocusActions.mount() calls FocusExplain.setup(o) for every tool. A tool can
   pass o.explain to change the defaults:
     root         element or selector holding the analysis (default: the
                  first of #result, #output, #out, #analysis)
     place        element or selector the link goes after (default: root)
     text         () => analysis text, instead of reading it from root
     visibleOnly  false to read root even when it's hidden (default true)
     png          () => download the image to attach (default: the tool's
                  first PNG export)
     off          true to leave the link out
*/
(function () {
  "use strict";

  const COPILOT = "https://m365.cloud.microsoft/chat";
  const MAX_ANALYSIS = 6000;   // characters of analysis in the prompt
  const $ = s => (typeof s === "string" ? document.querySelector(s) : s);

  /* ---------- reading the analysis off the page ---------- */
  const SKIP = "svg, canvas, button, input, select, textarea, script, style, noscript, template, " +
               "[aria-hidden='true'], [hidden], .fx, .fa-bar, .fa-sample, .sr-only, .visually-hidden, " +
               "details:not([open]) > :not(summary), .legend, .chart-legend, .key";
  const BLOCK = /^(P|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|H[1-6]|UL|OL|LI|TR|TABLE|THEAD|TBODY|DL|DT|DD|FIGURE|FIGCAPTION|BLOCKQUOTE|PRE|BR|HR|DETAILS|SUMMARY)$/;
  function readText(root, visibleOnly) {
    let out = "", rows = 0;
    (function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, " "); return; }
      if (n.nodeType !== 1) return;
      if (n !== root && n.matches(SKIP)) return;
      if (visibleOnly && n !== root) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return; }
      const tag = n.tagName;
      if (tag === "TR") { rows++; if (rows > 40) { if (rows === 41) out += "\n(table shortened)\n"; return; } }
      if (tag === "TABLE") rows = 0;
      const block = BLOCK.test(tag);
      if (block) out += "\n";
      if (tag === "LI") out += "- ";
      n.childNodes.forEach(walk);
      if (tag === "TD" || tag === "TH") out += " | ";
      if (/^H[1-6]$/.test(tag)) out += ":";
      if (block) out += "\n";
      else if (n.nextSibling && n.nextSibling.nodeType === 1) out += " ";   // keep "Mean" and "20.4%" apart
    })(root);
    return out.split("\n").map(l => l.replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim().replace(/^:$/, ""))
      .filter((l, i, a) => l && l !== a[i - 1]).join("\n").replace(/::/g, ":");
  }

  /* ---------- removing personal identifying information ----------
     Pattern-based, so it catches the common identifiers: names with a title,
     email addresses, phone, NHS and hospital numbers, postcodes, dates of birth
     and web links. It can't recognise every name, so the panel asks the person
     to check the prompt and the image before sharing them. */
  const RULES = [
    [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, "[email removed]"],
    [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link removed]"],
    [/\b(?:d\.?o\.?b\.?|date of birth|born)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/gi, "[date of birth removed]"],
    [/\b(?:NHS|MRN|hospital|patient|case)\s*(?:no\.?|number|num|id|#)?\s*[:\-]?\s*[A-Z]{0,3}\d[\d \-]{4,}\d\b/gi, "[ID removed]"],
    [/\b\d{3}[ -]\d{3}[ -]\d{4}\b|\b\d{10}\b/g, "[number removed]"],
    [/(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d\s?){9,10}\b/g, "[phone removed]"],
    [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g, "[postcode removed]"],
    [/\b[A-Z]{1,3}\d{6,9}\b/g, "[ID removed]"],
    [/\b\d{7,}\b/g, "[number removed]"],
    [/\b(?:Dr|Mr|Mrs|Ms|Miss|Mx|Prof|Professor|Sister|Matron|Nurse|Doctor|Sir|Dame|Rev|Revd)\.?\s+(?:[A-Z]\.?\s+)?[A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+)?/g, "[name removed]"],
    [/\b(?:[Mm]y name is|[Cc]alled|[Nn]amed|[Ss]igned)\s+[A-Z][a-z'’\-]+(?:\s+[A-Z][a-z'’\-]+)?/g, m => m.split(/\s+/).slice(0, m.match(/^(my name is)/i) ? 3 : 1).join(" ") + " [name removed]"]
  ];
  function scrub(text) {
    let n = 0;
    RULES.forEach(([re, rep]) => { text = text.replace(re, (...a) => { n++; return typeof rep === "function" ? rep(a[0]) : rep; }); });
    return { text, removed: n };
  }

  /* ---------- the prompt ---------- */
  function toolInfo() {
    const h = document.querySelector("header.fh");
    const name = (h && h.dataset.toolName) || document.title.split("|")[0].trim();
    return { name, desc: (h && h.dataset.toolDesc) || "", url: location.origin + location.pathname };
  }
  function buildPrompt(analysis, hasImage) {
    const t = toolInfo();
    const lines = [
      "I work in the NHS and I'm using the FOCUS quality improvement tools. I've used the " + t.name + " tool (" + t.url + ")" + (t.desc ? ": " + t.desc.replace(/\.$/, "") + "." : "."),
      "",
      "Please help me understand the analysis below" + (hasImage ? ", using the attached image of the chart as well" : "") + ". It contains no personal or patient-identifiable information, and you don't need any.",
      "",
      "Please:",
      "1. Explain in plain English what the results show, and what they don't show.",
      "2. Explain any statistical or improvement terms simply, with an everyday example.",
      "3. Point out cautions and common mistakes when reading this kind of analysis.",
      "4. Suggest three questions I could take to my team, and which quality improvement tool or next step might help answer them.",
      "Only use figures given here or shown in the image, and say if you're unsure. Then wait for my questions.",
      "",
      "--- Analysis from the " + t.name + " tool ---",
      analysis,
      "--- End of analysis ---"
    ];
    return lines.join("\n");
  }

  /* ---------- the panel ---------- */
  let dlg = null;
  function panel() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "fx fx-dlg";
    dlg.setAttribute("aria-labelledby", "fx-h");
    dlg.innerHTML =
      '<form method="dialog" class="fx-close-form"><button class="fx-x" aria-label="Close">&times;</button></form>' +
      '<h2 id="fx-h">Get help understanding this analysis</h2>' +
      '<p class="fx-lead">Ask Microsoft 365 Copilot Chat to explain the analysis and answer your questions. We’ve written a prompt from the analysis on this page.</p>' +
      '<ol class="fx-steps">' +
        '<li><b>Check the prompt.</b> <span class="fx-removed"></span> You can edit it here before you copy it.</li>' +
        '<li><b>Copy the prompt and download the chart image.</b> The image gives Copilot more context.</li>' +
        '<li><b>Open Copilot Chat</b>, signed in with your work account. Paste the prompt, attach the image with the <b>+</b> or paperclip button, and send.</li>' +
      '</ol>' +
      '<label class="fx-label" for="fx-text">Prompt for Copilot</label>' +
      '<textarea id="fx-text" class="fx-text" rows="12" spellcheck="false"></textarea>' +
      '<p class="fx-warn"><b>Before you share:</b> check that the prompt and the chart image don’t show names, initials, dates of birth, NHS or hospital numbers, or anything else that could identify a patient or member of staff. Edit or relabel your data if they do.</p>' +
      '<div class="fx-actions">' +
        '<button type="button" class="fx-btn fx-primary" data-fx="all">Copy prompt, download image and open Copilot</button>' +
        '<button type="button" class="fx-btn" data-fx="copy">Copy prompt</button>' +
        '<button type="button" class="fx-btn" data-fx="png">Download chart image</button>' +
        '<a class="fx-btn" data-fx="open" href="' + COPILOT + '" target="_blank" rel="noopener">Open Copilot Chat<span class="fx-sr"> (opens in a new tab)</span></a>' +
      '</div>' +
      '<p class="fx-status" role="status" aria-live="polite"></p>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    return dlg;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = dlg.querySelector("#fx-text");
      ta.focus(); ta.select();
      try { return document.execCommand("copy"); } catch (e2) { return false; }
    }
  }

  function setup(o) {
    const x = o.explain || {};
    if (x.off) return;
    const findRoot = () => $(x.root) || document.querySelector("#result, #output, #out, #analysis");
    const findPlace = () => $(x.place) || findRoot();
    const png = x.png ? { run: x.png } : (o.exports || []).find(e => e.type === "png");

    const wrap = document.createElement("div");
    wrap.className = "fx fx-wrap";
    wrap.innerHTML =
      '<button type="button" class="fx-link">' +
        '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.9 7.6a2.2 2.2 0 1 1 3 2.05c-.55.22-.9.73-.9 1.32v.53M10 14.1v.15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '<span>Need further help to understand the analysis?</span></button>' +
      '<span class="fx-hint">Ask Microsoft 365 Copilot to explain it</span>';
    const btn = wrap.querySelector(".fx-link");

    function placeLink() {
      const at = findPlace();
      if (!at || !at.parentNode) return;
      if (wrap.previousElementSibling !== at || !wrap.isConnected) at.parentNode.insertBefore(wrap, at.nextSibling);
      const hide = o.ready ? !o.ready() : false;
      if (wrap.hidden !== hide) wrap.hidden = hide;
    }

    btn.addEventListener("click", () => {
      const d = panel();
      let analysis = "";
      try { analysis = x.text ? x.text() : readText(findRoot(), x.visibleOnly !== false); } catch (e) { analysis = ""; }
      if (!analysis.trim()) analysis = "(The tool didn't return any analysis text. Please use the attached image.)";
      if (analysis.length > MAX_ANALYSIS) analysis = analysis.slice(0, MAX_ANALYSIS).replace(/\n[^\n]*$/, "") + "\n(analysis shortened)";
      const s = scrub(analysis);           // only the analysis: the rest is our own wording
      const ta = d.querySelector("#fx-text");
      ta.value = buildPrompt(s.text, !!png);
      d.querySelector(".fx-removed").textContent = s.removed
        ? "We removed " + s.removed + " thing" + (s.removed > 1 ? "s" : "") + " that looked like personal information, marked [… removed]."
        : "We found nothing that looked like personal information.";
      const st = d.querySelector(".fx-status"); st.textContent = "";
      const pngBtn = d.querySelector('[data-fx="png"]');
      pngBtn.hidden = !png;
      d.querySelector('[data-fx="all"]').textContent = png ? "Copy prompt, download image and open Copilot" : "Copy prompt and open Copilot";
      d.querySelectorAll("[data-fx]").forEach(b => { b.onclick = null; });
      const doCopy = async () => { const ok = await copyText(ta.value); st.textContent = ok ? "Prompt copied. Paste it into Copilot Chat." : "Couldn't copy. Select the prompt and copy it yourself."; return ok; };
      const doPng = () => { try { png.run(); return true; } catch (e) { st.textContent = "Couldn't create the image. Use Export to download it."; return false; } };
      d.querySelector('[data-fx="copy"]').onclick = doCopy;
      pngBtn.onclick = () => { if (doPng()) st.textContent = "Chart image downloaded. Attach it in Copilot Chat."; };
      d.querySelector('[data-fx="all"]').onclick = async () => {
        const ok = await doCopy();          // before the new tab takes focus, or the copy is refused
        if (png) doPng();
        window.open(COPILOT, "_blank", "noopener");
        st.textContent = (ok ? "Prompt copied" : "Copy the prompt yourself") + (png ? " and chart image downloaded" : "") +
          ". In Copilot Chat, paste the prompt" + (png ? ", attach the image" : "") + " and send.";
      };
      if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
      ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
    });

    // Tools redraw their results, so keep the link in place and in step with whether there's anything to explain.
    let t = null;
    const sync = list => {
      if (list.every(m => wrap.contains(m.target) || [...m.addedNodes].includes(wrap))) return;
      clearTimeout(t); t = setTimeout(placeLink, 60);
    };
    const start = () => {
      placeLink();
      const root = findRoot();
      new MutationObserver(sync).observe(root ? (root.closest("main") || document.body) : document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
  }

  window.FocusExplain = { setup, scrub, readText, buildPrompt };
})();

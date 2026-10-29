// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

// Shared FOCUS header: only one menu open at a time; close on outside click or Escape.
(function () {
  const menus = [...document.querySelectorAll("details.fh-dd")];
  menus.forEach(m => m.addEventListener("toggle", () => { if (m.open) menus.forEach(o => { if (o !== m) o.open = false; }); }));
  document.addEventListener("click", e => { menus.forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const m = menus.find(x => x.open);
    if (m) { m.open = false; m.querySelector("summary").focus(); }
  });

  const proj = document.querySelector(".fh-projects");

  // The MiQi project open in this tab (kept by miqi_project/app.js) is shown
  // as a button with its name next to MiQi Projects, and as Go to your open
  // project in the menu. Both are hidden until the project has something in
  // it. The project page calls FocusHeader.setProject as its title changes.
  const goto = proj && proj.querySelector("[data-fh-current-project]");
  const nameBtn = document.querySelector("[data-fh-project-name]");
  const away = document.querySelector("[data-fh-project-away]");
  const others = new Map(); // tab id -> project title, from other tabs (see below)
  const NAME_MAX = 30;
  const shorten = full => (full.length > NAME_MAX ? full.slice(0, NAME_MAX - 1).trim() + "…" : full);
  let ownProject = false;
  function setProject(title, show) {
    ownProject = !!show;
    if (show) showAway();
    const full = String(title || "").trim() || "Untitled project";
    const short = shorten(full);
    if (goto) {
      goto.querySelector("[data-fh-current-title]").textContent = full + ", open in this tab";
      goto.hidden = !show;
    }
    if (nameBtn) {
      nameBtn.querySelector("span").textContent = short;
      nameBtn.title = full;
      nameBtn.setAttribute("aria-label", "Open project: " + full);
      nameBtn.hidden = !show;
    }
  }
  try {
    const p = JSON.parse(sessionStorage.getItem("miqi-project-v1") || "null");
    const d = p && p.data;
    if (d && (p.stage > 0 || p.closed || Object.keys(d).some(k => typeof d[k] === "string" ? d[k].trim() : Array.isArray(d[k]) && d[k].length))) setProject(d.title, true);
  } catch (e) { /* no project open in this tab */ }
  window.FocusHeader = { setProject };

  // A MiQi project open in another tab of this browser, such as the tab a
  // tool was opened from with Tools for this stage. The project page says
  // it's open on the "focus-miqi" channel (miqi_project/app.js); here, a
  // button in the dark blue bar shows its name while it stays open. Pages
  // can't switch tabs, so the button's menu says where to find it.
  function showAway() {
    if (!away) return;
    const list = [...others.values()];
    away.hidden = ownProject || !list.length;
    if (away.hidden) { away.open = false; return; }
    const one = list.length === 1;
    const name = one ? (list[0] || "Untitled project") : list.length + " MiQi projects";
    away.querySelector("[data-fh-away-name]").textContent = shorten(name);
    away.querySelector("summary").title = one ? name + " is open in another tab" : name + " are open in other tabs";
    away.querySelector("[data-fh-away-text]").textContent = one
      ? "“" + name + "” is still open in another tab of this browser. To carry on with it, switch to the tab called “" + name + " – MiQi project”."
      : "These projects are open in other tabs of this browser: " + list.map(t => "“" + (t || "Untitled project") + "”").join(", ") + ". Switch to a project's tab to carry on with it.";
  }
  if (away && typeof BroadcastChannel === "function") {
    const ch = new BroadcastChannel("focus-miqi");
    ch.onmessage = e => {
      const m = e.data || {};
      if (m.type === "here" && typeof m.id === "string") others.set(m.id, String(m.title || "").trim());
      else if (m.type === "gone") others.delete(m.id);
      else return;
      showAway();
    };
    const ask = () => { others.clear(); showAway(); ch.postMessage({ type: "ping" }); };
    ask();
    // Check again on coming back to this tab, in case a project tab closed without saying
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ask(); });
  }

  // MiQi Projects > Open a saved QI project: read the file here, hand it to
  // the MiQi project page in this tab, and go there (miqi_project/app.js).
  const btn = proj && proj.querySelector("[data-fh-open-project]");
  const file = proj && proj.querySelector("[data-fh-project-file]");
  if (!btn || !file) return;
  function go(f, handle) {
    proj.open = false;
    if (f.size > 5 * 1024 * 1024) { alert("That file is too big to be a MiQi project file."); return; }
    f.text().then(text => {
      try { sessionStorage.setItem("miqi-open", JSON.stringify({ name: f.name, text })); }
      catch (e) { alert("Couldn't open that file in this browser."); return; }
      const next = () => { location.href = proj.dataset.projectUrl + "?open=1"; };
      if (handle) keepHandle(handle).then(next, next); else next();
    }, () => alert("Couldn't read that file."));
  }
  // Where the browser can save back to a picked file (Edge, Chrome), the
  // file's handle goes with it, so Save on the project page updates this
  // file (see "the project file you're working in" in focus-actions.js).
  btn.addEventListener("click", () => {
    if (typeof window.showOpenFilePicker !== "function") return file.click();
    window.showOpenFilePicker({ types: [{ description: "Saved work", accept: { "application/json": [".json"] } }], multiple: false })
      .then(hs => hs[0].getFile().then(f => go(f, hs[0])), () => {});
  });
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (f) go(f, null);
  });
  // The "focus-files" database, opened the same way as in focus-actions.js
  function filesDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("no IndexedDB"));
      const r = indexedDB.open("focus-files", 2);
      r.onupgradeneeded = () => ["links", "recent"].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); });
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
  }
  function store(name, mode, fn) {
    return filesDb().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(name, mode), req = fn(tx.objectStore(name));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    }));
  }
  function keepHandle(handle) {
    let tab;
    try {
      tab = sessionStorage.getItem("focus-tab");
      if (!tab) { tab = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("focus-tab", tab); }
    } catch (e) { return Promise.reject(e); }
    return store("links", "readwrite", st => st.put({ handle, name: handle.name, pending: true, saved: Date.now() }, tab + "|miqi_project"));
  }

  // MiQi Projects > Recent projects: the last 5 project files saved or
  // opened in Edge or Chrome, kept 30 days (focus-actions.js adds them).
  // Only each file's handle, name, title and when it was last used are
  // kept, never the project. Choosing one asks the browser for permission
  // to read the file, then opens it like Open a saved QI project.
  const recentBox = proj.querySelector("[data-fh-recent]");
  if (!recentBox || typeof window.showOpenFilePicker !== "function") return;
  let recent = [];
  const when = t => {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  function drawRecent() {
    recentBox.hidden = !recent.length;
    const ul = recentBox.querySelector("ul");
    ul.textContent = "";
    recent.forEach((e, i) => {
      const li = document.createElement("li"), b = document.createElement("button"), d = document.createElement("span");
      b.type = "button"; b.className = "fh-linkbtn"; b.dataset.i = i;
      b.textContent = e.title || "Untitled project";
      d.className = "fh-desc"; d.textContent = e.name + " · " + when(e.used);
      li.append(b, d); ul.appendChild(li);
    });
  }
  function loadRecent() {
    return store("recent", "readonly", st => st.get("miqi_project")).then(list => {
      const cut = Date.now() - 30 * 864e5;
      recent = (list || []).filter(e => e && e.handle && e.used >= cut).slice(0, 5);
      drawRecent();
    }).catch(() => {});
  }
  const saveRecent = () => store("recent", "readwrite", st => st.put(recent, "miqi_project")).catch(() => {});
  // Read only when the menu opens, so pages that don't need the list never touch the stored handles
  proj.addEventListener("toggle", () => { if (proj.open) loadRecent(); });
  recentBox.addEventListener("click", e => {
    if (e.target.closest("[data-fh-clear-recent]")) {
      if (!confirm("Clear the list of recent projects? Your project files aren't changed.")) return;
      recent = []; drawRecent(); saveRecent(); return;
    }
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const entry = recent[+b.dataset.i]; if (!entry) return;
    const h = entry.handle, mode = { mode: "read" };
    Promise.resolve(h.queryPermission ? h.queryPermission(mode) : "granted")
      .then(p => (p === "granted" ? p : h.requestPermission(mode)))
      .then(p => {
        if (p !== "granted") return;
        return h.getFile().then(f => go(f, h), () => {
          alert("Couldn't find " + entry.name + ". It may have been moved, renamed or deleted, so it's been taken off the list. Use Open a saved QI project to find it.");
          recent = recent.filter(x => x !== entry); drawRecent(); saveRecent();
        });
      }, () => {});
  });
})();

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
  const NAME_MAX = 30;
  function setProject(title, show) {
    const full = String(title || "").trim() || "Untitled project";
    const short = full.length > NAME_MAX ? full.slice(0, NAME_MAX - 1).trim() + "…" : full;
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

  // MiQi Projects > Open a saved QI project: read the file here, hand it to
  // the MiQi project page in this tab, and go there (miqi_project/app.js).
  const btn = proj && proj.querySelector("[data-fh-open-project]");
  const file = proj && proj.querySelector("[data-fh-project-file]");
  if (!btn || !file) return;
  btn.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    proj.open = false;
    if (f.size > 5 * 1024 * 1024) { alert("That file is too big to be a MiQi project file."); return; }
    f.text().then(text => {
      try { sessionStorage.setItem("miqi-open", JSON.stringify({ name: f.name, text })); }
      catch (e) { alert("Couldn't open that file in this browser."); return; }
      location.href = proj.dataset.projectUrl + "?open=1";
    }, () => alert("Couldn't read that file."));
  });
})();

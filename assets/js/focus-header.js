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

  // MiQi Projects > Open a saved QI project: read the file here, hand it to
  // the MiQi project page in this tab, and go there (miqi_project/app.js).
  const proj = document.querySelector(".fh-projects");
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

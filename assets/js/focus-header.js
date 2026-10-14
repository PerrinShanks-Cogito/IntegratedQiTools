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
})();

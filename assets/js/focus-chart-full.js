// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

/* Full screen for every chart on a tool page, and hover details for any part
   of a chart marked with data-tip (see the end of this file). A small "Full screen" button
   sits above each chart; it opens the chart on its own, filling the screen,
   where it can be zoomed (buttons, Ctrl + scroll, or + - 0) and dragged or
   scrolled around. The full screen view shows a copy of the chart as it is
   when opened, so it works the same whatever drew the chart, and the tool
   underneath is left as it was. Charts redraw often, so the buttons are added
   again whenever a chart appears. Styles are in focus-tool.css, prefixed fcv.
   The process map, driver and fishbone diagrams and the A3 report have their
   own full screen, with editing, and don't use this. */
(function () {
  const CHARTS = ".chartwrap, .chart-box, main#out #chart";
  const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  let view = null, source = null, natW = 0, natH = 0, zoom = 1, fromButton = null;

  /* ---------- the buttons above each chart ---------- */
  const hasChart = el => !!el.querySelector("svg, img");
  function addButtons() {
    document.querySelectorAll(CHARTS).forEach(el => {
      if (el.closest(".fcv") || !hasChart(el)) return;
      const prev = el.previousElementSibling;
      if (prev && prev.classList.contains("fcv-row")) return;
      const row = document.createElement("div");
      row.className = "fcv-row";
      row.innerHTML = '<button type="button" class="fcv-btn" title="Show this chart on its own, filling the screen">' + ICON + "<span>Full screen</span></button>";
      row.firstChild.addEventListener("click", () => open(el, row.firstChild));
      el.parentNode.insertBefore(row, el);
    });
  }
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; addButtons(); });
  }).observe(document.body, { childList: true, subtree: true });
  addButtons();

  /* ---------- the full screen view ---------- */
  function build() {
    view = document.createElement("div");
    view.className = "fcv";
    view.hidden = true;
    view.setAttribute("role", "dialog");
    view.setAttribute("aria-modal", "true");
    view.setAttribute("aria-label", "Chart, full screen");
    view.innerHTML =
      '<div class="fcv-bar">' +
        '<button type="button" class="fcv-btn" data-z="out" aria-label="Zoom out">−</button>' +
        '<span class="fcv-zoom" aria-live="polite">100%</span>' +
        '<button type="button" class="fcv-btn" data-z="in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="fcv-btn" data-z="fit">Fit</button>' +
        '<span class="fcv-hint">Drag to move. Ctrl + scroll to zoom.</span>' +
        '<button type="button" class="fcv-btn fcv-exit">' + ICON + "<span>Exit full screen</span></button>" +
      "</div>" +
      '<div class="fcv-view" tabindex="0" aria-label="Chart. Drag to move around it, or use the arrow keys."><div class="fcv-box"><div class="fcv-inner"></div></div></div>';
    document.body.appendChild(view);
    view.querySelector('[data-z="out"]').addEventListener("click", () => setZoom(zoom / 1.25));
    view.querySelector('[data-z="in"]').addEventListener("click", () => setZoom(zoom * 1.25));
    view.querySelector('[data-z="fit"]').addEventListener("click", () => setZoom(1));
    view.querySelector(".fcv-exit").addEventListener("click", close);
    const vp = view.querySelector(".fcv-view");

    // Drag to move (touch screens swipe as usual)
    let drag = null;
    vp.addEventListener("pointerdown", e => {
      if (e.pointerType === "touch" || (e.button !== 0 && e.button !== 1)) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      e.preventDefault();
    });
    vp.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!drag.moved) { drag.moved = true; vp.setPointerCapture(e.pointerId); vp.classList.add("grabbing"); }
      drag.x = e.clientX; drag.y = e.clientY;
      vp.scrollLeft -= dx; vp.scrollTop -= dy;
    });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; vp.classList.remove("grabbing"); } };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    // Ctrl + scroll zooms, keeping the point under the pointer still
    vp.addEventListener("wheel", e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e);
    }, { passive: false });
    document.addEventListener("keydown", e => {
      if (view.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.target.closest && e.target.closest("button, input, textarea, select")) return;
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(zoom * 1.25); }
      else if (e.key === "-") { e.preventDefault(); setZoom(zoom / 1.25); }
      else if (e.key === "0") { e.preventDefault(); setZoom(1); }
    });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && view && !view.hidden) close(); });
    window.addEventListener("resize", () => { if (view && !view.hidden) apply(); });
  }

  function open(el, btn) {
    if (!view) build();
    source = el; fromButton = btn;
    // A copy of the chart at the width it's shown at
    natW = el.clientWidth || el.getBoundingClientRect().width;
    const copy = el.cloneNode(true);
    copy.removeAttribute("id");
    copy.style.width = natW + "px";
    copy.style.margin = "0";
    copy.style.overflow = "visible";
    copy.style.maxHeight = "none";
    const inner = view.querySelector(".fcv-inner");
    inner.innerHTML = "";
    inner.appendChild(copy);
    view.hidden = false;
    document.body.classList.add("fcv-open");
    natW = inner.scrollWidth; natH = inner.scrollHeight;
    zoom = 1;
    apply();
    view.querySelector(".fcv-view").focus({ preventScroll: true });
    if (document.fullscreenEnabled && view.requestFullscreen) view.requestFullscreen().catch(() => {});
  }
  function close() {
    if (!view || view.hidden) return;
    view.hidden = true;
    document.body.classList.remove("fcv-open");
    if (document.fullscreenElement === view) document.exitFullscreen().catch(() => {});
    view.querySelector(".fcv-inner").innerHTML = "";
    if (fromButton && fromButton.isConnected) fromButton.focus({ preventScroll: true });
    source = null;
  }

  // Fit (100%) is the whole chart on screen; zoom is relative to that
  function fitScale() {
    const vp = view.querySelector(".fcv-view"), cs = getComputedStyle(vp);
    const vw = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const vh = vp.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(0.05, Math.min(vw / natW, vh / natH));
  }
  function apply(at) {
    const vp = view.querySelector(".fcv-view"), box = view.querySelector(".fcv-box"), inner = view.querySelector(".fcv-inner");
    // Keep the point under the pointer (or the middle) still while zooming
    const r = vp.getBoundingClientRect();
    const px = at ? at.clientX - r.left : vp.clientWidth / 2, py = at ? at.clientY - r.top : vp.clientHeight / 2;
    const fx = (vp.scrollLeft + px) / (box.offsetWidth || 1), fy = (vp.scrollTop + py) / (box.offsetHeight || 1);
    const s = fitScale() * zoom;
    inner.style.width = natW + "px";
    inner.style.transform = "scale(" + s + ")";
    box.style.width = Math.round(natW * s) + "px";
    box.style.height = Math.round(natH * s) + "px";
    vp.scrollLeft = fx * box.offsetWidth - px;
    vp.scrollTop = fy * box.offsetHeight - py;
    view.querySelector(".fcv-zoom").textContent = Math.round(zoom * 100) + "%";
    vp.classList.toggle("can-pan", vp.scrollWidth > vp.clientWidth || vp.scrollHeight > vp.clientHeight);
  }
  function setZoom(z, at) { zoom = Math.min(6, Math.max(0.25, z)); apply(at); }

  /* ---------- hover details ----------
     Any part of a chart with a data-tip attribute shows its details in a box
     beside the pointer, on the page and in full screen (the copy keeps the
     attribute). Lines are separated by newlines; the first is the heading.
     On a touch screen, tap it. */
  let tip = null, tipOn = null;
  function showTip(el, x, y) {
    if (!tip) { tip = document.createElement("div"); tip.className = "fct"; }
    // In full screen only what's inside the full screen element shows
    const host = document.fullscreenElement || document.body;
    if (tip.parentNode !== host) host.appendChild(tip);
    if (tipOn !== el) {
      if (tipOn) tipOn.classList.remove("fct-on");
      tipOn = el; el.classList.add("fct-on");
      tip.textContent = "";
      el.getAttribute("data-tip").split("\n").forEach((line, i) => {
        const d = document.createElement(i ? "span" : "b"); d.textContent = line; tip.appendChild(d);
      });
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top + h > innerHeight - 8) top = y - h - 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    if (tipOn) { tipOn.classList.remove("fct-on"); tipOn = null; }
  }
  const tipTarget = e => e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
  document.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    const el = tipTarget(e);
    if (el && !e.buttons) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener("pointerdown", e => {
    const el = tipTarget(e);
    if (e.pointerType === "touch" && el) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
  document.addEventListener("fullscreenchange", hideTip);
})();

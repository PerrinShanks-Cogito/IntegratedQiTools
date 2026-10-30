// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

/* FOCUS as an app: registers the service worker (/sw.js) that keeps the site
   for use with no connection, which also lets Edge and Chrome offer Install.
   Loaded by every page; the worker's address is in data-sw. Browsers only
   allow this over HTTPS (or on localhost). */
(function () {
  const sw = document.currentScript && document.currentScript.dataset.sw;
  if (!sw || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  // After the page has loaded, so keeping the copy doesn't slow the first visit
  const go = () => navigator.serviceWorker.register(sw).catch(() => {});
  if (document.readyState === "complete") go(); else window.addEventListener("load", go);
})();

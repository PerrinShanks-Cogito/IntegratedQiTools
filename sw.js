---
# Liquid lists the site's pages and files below, and names the cache after the build
---
// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

/* FOCUS with no connection, in the browser or installed as an app (Install
   in Edge or Chrome; see manifest.webmanifest). The first visit keeps a copy
   of every page and file of the site in the browser's cache, except the
   programme guide's templates and examples (about 50 MB), which are kept the
   first time each one is downloaded. Online, files come from the site, so a
   deploy shows straight away; the copy is used when the site can't be
   reached or takes more than 4 seconds to answer. Each build names a new
   cache and the old one is deleted. The cache holds only the site's own
   files, never anything a person types, pastes or opens. Registered by
   assets/js/focus-app.js. */

const CACHE = "focus-{{ site.time | date: '%s' }}";
const SLOW = 4000;
{%- assign skip = "/sw.js,/p_chart/,/t_chart/" | split: "," %}
const FILES = [
{%- for p in site.pages %}{% unless skip contains p.url %}
  {{ p.url | relative_url | jsonify }},
{%- endunless %}{% endfor %}
{%- for f in site.static_files %}{% unless f.path contains "/programme_guide/templates/" or f.path contains "/programme_guide/examples/" or f.path == "/staticwebapp.config.json" %}
  {{ f.path | relative_url | jsonify }},
{%- endunless %}{% endfor %}
];

// One missing file doesn't stop the rest being kept
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(FILES.map(u => c.add(new Request(u, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("focus-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Only the site's own files; analytics and outside links go straight out
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range")) return;
  // A tool's settings in the address (?type=p) and the ?v= on scripts don't change the file
  const key = url.origin + url.pathname;
  const net = fetch(req).then(res => {
    if (res.ok && res.type === "basic" && !res.redirected) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)));
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  const saved = () => caches.match(key, { cacheName: CACHE });
  const slow = new Promise(r => setTimeout(r, SLOW)).then(() => saved().then(hit => hit || net));
  e.respondWith(Promise.race([net, slow]).catch(() => saved().then(hit => hit || Response.error())));
});

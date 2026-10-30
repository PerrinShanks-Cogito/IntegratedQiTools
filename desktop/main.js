// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

/* FOCUS QI tools as a desktop app (Electron). The built site is packed inside
   the app (desktop/site, from `npm run site`) and served at app://focus/ by
   the handler below, so its links (/assets/...) and the tools work as they do
   on the web, with no web server and no connection. Each response carries
   the live site's security headers from staticwebapp.config.json. Links to
   other sites open in the default browser. Pages get no Node.js access. */
const { app, BrowserWindow, protocol, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { readFileSync } = require("node:fs");

const SITE = path.join(__dirname, "site");
const ORIGIN = "app://focus";
const ICON = path.join(SITE, "assets/img/app/icon-512.png");

// The live site's headers and file types; Strict-Transport-Security is for HTTPS only
const config = JSON.parse(readFileSync(path.join(SITE, "staticwebapp.config.json"), "utf8"));
const HEADERS = { ...config.globalHeaders };
delete HEADERS["Strict-Transport-Security"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ...config.mimeTypes
};

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
]);

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== "focus") return new Response("Not found", { status: 404 });
  const rel = decodeURIComponent(url.pathname);
  let file = path.join(SITE, rel);
  // Never outside the site folder
  if (file !== SITE && !file.startsWith(SITE + path.sep)) return new Response("Not found", { status: 404 });
  let status = 200;
  try {
    if ((await fs.stat(file)).isDirectory()) {
      // Pages live at /tool/ (index.html), as on the web
      if (!rel.endsWith("/")) return new Response(null, { status: 301, headers: { Location: ORIGIN + rel + "/" + url.search } });
      file = path.join(file, "index.html");
    }
    await fs.access(file);
  } catch (e) {
    file = path.join(SITE, "404.html");
    status = 404;
  }
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  return new Response(await fs.readFile(file), { status, headers: { ...HEADERS, "Content-Type": type } });
}

const inside = url => url === ORIGIN || url.startsWith(ORIGIN + "/");
const outside = url => {
  // Web, email and Teams links open in the default browser or app; nothing else
  if (/^(https?|mailto|msteams):/i.test(url)) shell.openExternal(url);
};

function openWindow(url) {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 360, minHeight: 400,
    icon: ICON, backgroundColor: "#F0F4F5", autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true }
  });
  win.once("ready-to-show", () => win.show());
  // Links opened in a new tab: the site's own pages in a new window, others in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inside(url)) { openWindow(url); return { action: "deny" }; }
    outside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (inside(url)) return;
    e.preventDefault();
    outside(url);
  });
  win.loadURL(url);
  return win;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Opening the app again brings the open window forward
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    protocol.handle("app", serve);
    // Save and Open with project files, and copying; no camera, location or the like
    const allowed = new Set(["clipboard-sanitized-write", "fileSystem"]);
    session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(allowed.has(permission)));
    openWindow(ORIGIN + "/");
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) openWindow(ORIGIN + "/"); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

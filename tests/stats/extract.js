// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
//
// Pulls statistical functions out of a tool page exactly as published, so the
// tests check the code the site runs rather than a copy of it.
//
// Each tool keeps its functions inside the page's inline <script>, indented by
// two spaces (`  function name(` or `  const name = `). load() takes the
// functions asked for, adds any other top-level functions they call, and
// evaluates them on their own, away from the page.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

// Index just past the end of the statement or function that starts at `start`:
// a function ends at the brace that closes its body; a const ends at the first
// `;` or newline outside any brackets. Strings, template literals and comments
// are skipped so braces inside them don't count.
function endOf(src, start) {
  const isFunction = src.startsWith("function", start);
  let depth = 0, i = start, opened = false;
  const tpl = [];           // brace depth at which each open template literal resumes
  let prev = "", word = ""; // the last code character, and the last word, before i
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    if (ch === "/" && next === "/") { i = src.indexOf("\n", i); if (i < 0) return src.length; continue; }
    if (ch === "/" && next === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    // A slash starts a regular expression, not a division, after an operator,
    // an opening bracket or a keyword such as return
    if (ch === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || /^(return|typeof|case|in|of|new|delete|void|throw)$/.test(word))) {
      i++;
      let inClass = false;
      while (i < src.length && (inClass || src[i] !== "/")) {
        if (src[i] === "\\") i++;
        else if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || "")) i++;
      prev = ")"; word = "";
      continue;
    }
    if (ch === "'" || ch === '"') {
      i++;
      while (i < src.length && src[i] !== ch) { if (src[i] === "\\") i++; i++; }
      i++; prev = ch; word = ""; continue;
    }
    if (/[\w$]/.test(ch)) { word = /[\w$]/.test(src[i - 1] || "") ? word + ch : ch; prev = ch; }
    else if (!/\s/.test(ch)) { prev = ch; word = ""; }
    if (ch === "`" || (ch === "}" && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (ch === "}") tpl.pop();
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { tpl.push(depth); i += 2; break; }
        i++;
      }
      if (src[i] === "`") i++;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") { depth++; if (ch === "{") opened = true; }
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (isFunction && opened && depth === 0 && ch === "}") return i + 1;
    } else if (!isFunction && depth === 0 && (ch === ";" || ch === "\n")) return i + 1;
    i++;
  }
  return src.length;
}

const cache = {};

// The names a const or let statement declares: `const a = 1, b = x => x * 2;`
// declares a and b (commas inside brackets or strings don't separate them).
function declared(stmt) {
  const body = stmt.replace(/^(?:const|let)\s+/, ""), names = [];
  let depth = 0, part = "", q = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) { if (ch === "\\") { part += ch + body[++i]; continue; } if (ch === q) q = null; part += ch; continue; }
    if (ch === "'" || ch === '"' || ch === "`") q = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) { names.push(part); part = ""; continue; }
    part += ch;
  }
  names.push(part);
  return names.map(p => (p.match(/^\s*([A-Za-z_$][\w$]*)\s*=/) || [])[1]).filter(Boolean);
}

// All top-level definitions in a tool's page: { name: { start, src } }. Most
// tools wrap their script in a function, so its top level is indented by two
// spaces; a few (SPC chart, run chart) aren't wrapped. The top level is the
// smallest indent any function in the page is written at.
function definitions(tool) {
  if (cache[tool]) return cache[tool];
  const html = fs.readFileSync(path.join(ROOT, tool, "index.html"), "utf8");
  const indent = Math.min(...[...html.matchAll(/\n( *)function [A-Za-z_$][\w$]*\s*\(/g)].map(m => m[1].length));
  const defs = {};
  const re = new RegExp(`\\n {${indent}}(function ([A-Za-z_$][\\w$]*)\\s*\\(|(?:const|let) ([A-Za-z_$][\\w$]*)\\s*=)`, "g");
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + 1 + indent, src = html.slice(start, endOf(html, start));
    const names = m[2] ? [m[2]] : declared(src);
    const def = { start, src };
    names.forEach(name => { if (!(name in defs)) defs[name] = def; });
  }
  return (cache[tool] = defs);
}

// src with comments and the text of strings and regular expressions blanked
// out (the code inside a template's ${…} is kept), so words in them aren't
// mistaken for names.
function codeOnly(src) {
  let out = "", i = 0, prev = "", word = "";
  const tpl = [];
  let depth = 0;
  const blank = (a, b) => { out += src.slice(a, b).replace(/[^\n]/g, " "); };
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    if (ch === "/" && next === "/") { const j = src.indexOf("\n", i); blank(i, j < 0 ? src.length : j); i = j < 0 ? src.length : j; continue; }
    if (ch === "/" && next === "*") { const j = src.indexOf("*/", i + 2) + 2; blank(i, j); i = j; continue; }
    if (ch === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || /^(return|typeof|case|in|of|new|delete|void|throw)$/.test(word))) {
      const a = i; i++;
      let inClass = false;
      while (i < src.length && (inClass || src[i] !== "/")) { if (src[i] === "\\") i++; else if (src[i] === "[") inClass = true; else if (src[i] === "]") inClass = false; i++; }
      i++; while (/[a-z]/i.test(src[i] || "")) i++;
      blank(a, i); prev = ")"; word = ""; continue;
    }
    if (ch === "'" || ch === '"') {
      const a = i; i++;
      while (i < src.length && src[i] !== ch) { if (src[i] === "\\") i++; i++; }
      i++; blank(a, i); prev = ch; word = ""; continue;
    }
    if (ch === "`" || (ch === "}" && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (ch === "}") tpl.pop();
      const a = i; i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { tpl.push(depth); i += 2; break; }
        i++;
      }
      if (src[i] === "`") i++;
      blank(a, i); prev = "`"; word = ""; continue;
    }
    if ("{([".includes(ch)) depth++;
    else if ("})]".includes(ch)) depth--;
    if (/[\w$]/.test(ch)) { word = /[\w$]/.test(src[i - 1] || "") ? word + ch : ch; prev = ch; }
    else if (!/\s/.test(ch)) { prev = ch; word = ""; }
    out += ch; i++;
  }
  return out;
}

// Names a function declares for itself (parameters, local variables and
// functions), which hide any top-level definition of the same name.
function locals(src) {
  const out = new Set(), add = list => (list || "").split(/[,\s{}\[\]=.:]+/).forEach(n => { if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); });
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*([{\[][^=;]*[}\]])\s*=/g)) add(m[1]);
  for (const m of src.matchAll(/\bfunction\s*[\w$]*\s*\(([^)]*)\)/g)) add(m[1].replace(/=[^,]*/g, ""));
  for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) add(m[1].replace(/=[^,]*/g, ""));
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) out.add(m[1]);
  for (const m of src.matchAll(/\bcatch\s*\(\s*([\w$]+)/g)) out.add(m[1]);
  return out;
}

// The definitions `names` need, in page order: each named function plus,
// recursively, any other top-level definition its body mentions. Mentions
// that can't be the top-level definition are left out: properties (`.mean`),
// object keys (`{ run: … }`) and names the function declares itself.
function closure(tool, names, trace) {
  const defs = definitions(tool), need = new Set();
  const visit = (name, from) => {
    if (trace && !need.has(name)) trace.push(from ? `${from} -> ${name}` : name);
    if (need.has(name)) return;
    if (!defs[name]) throw new Error(`${tool}: no top-level function or const called ${name}`);
    need.add(name);
    const src = codeOnly(defs[name].src), own = locals(src.replace(/^(?:function [\w$]+|(?:const|let) [\w$]+\s*=)/, ""));
    const ids = src.match(/(?<![.\w$])[A-Za-z_$][\w$]*(?!\s*:(?!:))/g) || [];
    ids.forEach(id => { if (id !== name && defs[id] && !own.has(id)) visit(id, name); });
  };
  names.forEach(n => visit(n));
  // one definition can declare several names; keep each once, in page order
  return [...new Set([...need].map(n => defs[n]))].sort((a, b) => a.start - b.start);
}

// load("anova", ["fP", "tP"]) -> { fP, tP }, run on their own. `globals` sets
// any free variables the functions read, such as { alpha: 0.05 }, in place of
// the page's own definition of them.
function load(tool, names, globals = {}) {
  const used = closure(tool, names).filter(d => {
    const own = d.src.startsWith("function") ? [d.src.match(/^function ([\w$]+)/)[1]] : declared(d.src);
    return !own.some(n => n in globals);
  });
  const pre = Object.keys(globals).map(k => `let ${k} = ${JSON.stringify(globals[k])};`).join("\n");
  const body = [pre, ...used.map(d => d.src), `return { ${names.join(", ")} };`].join("\n");
  try {
    return new Function(body)();
  } catch (e) {
    throw new Error(`${tool}: could not load ${names.join(", ")}: ${e.message}`);
  }
}

module.exports = { load, definitions, closure };

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
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    if (ch === "/" && next === "/") { i = src.indexOf("\n", i); if (i < 0) return src.length; continue; }
    if (ch === "/" && next === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    if (ch === "'" || ch === '"') {
      i++;
      while (i < src.length && src[i] !== ch) { if (src[i] === "\\") i++; i++; }
      i++; continue;
    }
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

// All top-level definitions in a tool's page: { name: { start, src } }
function definitions(tool) {
  if (cache[tool]) return cache[tool];
  const html = fs.readFileSync(path.join(ROOT, tool, "index.html"), "utf8");
  const defs = {};
  const re = /\n {2}(?:function ([A-Za-z_$][\w$]*)\s*\(|(?:const|let) ([A-Za-z_$][\w$]*) = )/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1] || m[2], start = m.index + 3;
    if (!(name in defs)) defs[name] = { start, src: html.slice(start, endOf(html, start)) };
  }
  return (cache[tool] = defs);
}

// The definitions `names` need, in page order: each named function plus,
// recursively, any other top-level definition its body mentions (other than
// as a property, like `.mean`).
function closure(tool, names) {
  const defs = definitions(tool), need = new Set();
  const visit = name => {
    if (need.has(name)) return;
    if (!defs[name]) throw new Error(`${tool}: no top-level function or const called ${name}`);
    need.add(name);
    const ids = defs[name].src.match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || [];
    ids.forEach(id => { if (id !== name && defs[id]) visit(id); });
  };
  names.forEach(visit);
  return [...need].sort((a, b) => defs[a].start - defs[b].start).map(n => defs[n]);
}

// load("anova", ["fP", "tP"]) -> { fP, tP }, run on their own. `globals` sets
// any free variables the functions read, such as { alpha: 0.05 }.
function load(tool, names, globals = {}) {
  const used = closure(tool, names);
  const pre = Object.keys(globals).map(k => `let ${k} = ${JSON.stringify(globals[k])};`).join("\n");
  const defined = new Set(used.map(d => d.src.match(/^(?:function|const|let) ([\w$]+)/)[1]));
  const body = [pre, ...used.filter(d => !(d.src.startsWith("let ") && d.src.match(/^let ([\w$]+)/)[1] in globals)).map(d => d.src),
    `return { ${names.join(", ")} };`].join("\n");
  try {
    return new Function(body)();
  } catch (e) {
    throw new Error(`${tool}: could not load ${names.join(", ")} (${[...defined].join(", ")}): ${e.message}`);
  }
}

module.exports = { load, definitions, closure };

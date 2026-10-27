// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
//
// Checks the statistical functions in every tool against reference answers
// from SciPy and NumPy (reference.json, written by make_reference.py).
//
// Run from the repository root:   node --test tests/stats/
//
// Each function is taken from the tool's page as published (extract.js), so
// every copy of a function in every tool is checked. A check passes when the
// tool's answer is within the group's absolute tolerance (`abs`) or relative
// tolerance (`tol`) of the reference.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { load } = require("./extract.js");
const ref = require("./reference.json");

// Calls that need more than fn(...args)
const CALLS = {
  // the histogram describes the data first, then tests it
  adHistogram: (tool, g) => {
    const f = load(tool, ["describe", "andersonDarling"]);
    return values => f.andersonDarling(f.describe(values));
  },
  // ANOVA works out each group's statistics, then runs Welch's test on them
  welchFromGroups: (tool, g) => {
    const f = load(tool, ["describe", "welch"]);
    return groups => f.welch(groups.map((values, i) => f.describe({ name: "g" + i, values })));
  },
};

// Compare got with expect; returns a list of { where, got, expect, err }
function compare(got, expect, g, where = "") {
  if (Array.isArray(expect)) {
    if (!Array.isArray(got) || got.length !== expect.length) return [{ where, got, expect, err: Infinity }];
    return expect.flatMap((e, i) => compare(got[i], e, g, `${where}[${i}]`));
  }
  if (expect !== null && typeof expect === "object") {
    if (got === null || typeof got !== "object") return [{ where, got, expect, err: Infinity }];
    return Object.keys(expect).flatMap(k => compare(got[k], expect[k], g, where ? `${where}.${k}` : k));
  }
  const diff = Math.abs(got - expect);
  const rel = expect === 0 ? diff : diff / Math.abs(expect);
  const ok = typeof got === "number" && (diff <= g.abs || diff <= g.tol * Math.abs(expect));
  return [{ where, got, expect, diff, err: Number.isFinite(rel) ? rel : Infinity, ok }];
}

for (const g of ref.groups) {
  for (const tool of g.tools) {
    test(`${g.id} – ${tool} (${g.fn})`, t => {
      const fn = g.call ? CALLS[g.call](tool, g) : load(tool, [g.fn], g.globals || {})[g.fn];
      const fails = [];
      let worst = 0, failed = 0;
      // groups judged on an absolute tolerance report the largest difference,
      // the rest the largest relative error
      const absolute = g.tol === 0;
      for (const c of g.cases) {
        const got = fn(...JSON.parse(JSON.stringify(c.args)));
        const bad = compare(got, c.expect, g).filter(res => {
          if (res.ok) worst = Math.max(worst, absolute ? res.diff : res.err);
          return !res.ok;
        });
        if (bad.length) failed++;
        bad.forEach(res => fails.push(`  ${g.fn}(${JSON.stringify(c.args).slice(0, 80)})${res.where ? " " + res.where : ""}: got ${res.got}, expected ${res.expect}`));
      }
      t.diagnostic(`${g.cases.length} cases, worst ${absolute ? "difference" : "relative error"} ${worst.toExponential(1)}${g.note ? " – " + g.note : ""}`);
      assert.ok(!failed, `${failed} of ${g.cases.length} cases out of tolerance:\n${fails.slice(0, 10).join("\n")}`);
    });
  }
}

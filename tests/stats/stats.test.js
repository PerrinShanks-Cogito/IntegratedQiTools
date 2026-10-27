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
  // SPC chart: the data goes in as pasted text, through the tool's own reader,
  // then compute() works out the limits and signals with the given settings.
  // Each case gets a fresh copy of the tool, so settings don't carry over.
  spc: tool => (kind, data, opts) => {
    const S = load(tool, ["compute", "state", "parseXmr", "parseP", "parseC", "parseT"]);
    const text = kind === "xmr" || kind === "t" ? data.join("\n")
      : kind === "c" ? data.map((c, i) => `P${i + 1} ${c}`).join("\n")
      : data.map(([num, den], i) => `P${i + 1} ${num} ${den}`).join("\n");
    const r = kind === "xmr" ? S.parseXmr(text) : kind === "c" ? S.parseC(text) : kind === "t" ? S.parseT(text) : S.parseP(text, kind);
    Object.assign(S.state, { type: kind, rows: r.rows, events: r.events || [] }, opts, { breaks: new Set(opts.breaks || []) });
    const m = S.compute();
    const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
    const events = m.events.map(e => pick(e, ["rule", "side", "from", "to"]));
    if (kind === "xmr") return { segs: m.segs.map(g => pick(g, ["mean", "mrBar", "ucl", "lcl", "up2", "lo2", "ok"])), events, status: m.status };
    if (kind === "t") return { gaps: r.rows.map(x => x.gap), segs: m.segs.map(g => pick(g, ["tMean", "mrBar", "mean", "ucl", "lcl"])), events, status: m.status };
    return { ok: m.ok, lim: m.lim.map(l => pick(l, ["mean", "ucl", "lcl", "up2", "lo2"])), events, status: m.status };
  },
  // Run chart: pasted values through the tool's reader, then its analysis
  runChart: tool => (values, opts) => {
    const R = load(tool, ["analyse", "parseInput"]);
    const a = R.analyse(R.parseInput(values.join("\n")), Object.assign({ change: null }, opts));
    return { med: a.med, shifts: a.shifts.map(s => s.idx), trends: a.trends.map(t => t.idx), useful: a.runs.useful,
      runs: a.runs.runs, lo: a.runs.lo, hi: a.runs.hi, astro: a.astro.map(x => x.i) };
  },
  runsTable: tool => n => load(tool, ["RUNS_TABLE"]).RUNS_TABLE[n],
  number: tool => raw => { const v = load(tool, ["parseNumber"]).parseNumber(raw); return Number.isNaN(v) ? null : v; },
  // Funnel plot: rows as pasted CSV (name, count, population) through the tool's reader
  funnel: tool => (rows, centre) => {
    const F = load(tool, ["analyse", "parse"]);
    const a = F.analyse(F.parse(rows.map(r => r.join(",")).join("\n"), false).rows, centre);
    return { p: a.p, poisson: a.poisson, rows: a.rows.map(r => ({ p: r.p, lcl: r.lcl, ucl: r.ucl, lwl: r.lwl, uwl: r.uwl, status: r.status })) };
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
  // rule names, statuses, yes/no and "none" must match exactly
  if (typeof expect !== "number") return [{ where, got, expect, diff: 0, err: 0, ok: got === expect || (expect === null && got === undefined) }];
  const diff = Math.abs(got - expect);
  const rel = expect === 0 ? diff : diff / Math.abs(expect);
  const ok = typeof got === "number" && (diff <= g.abs || diff <= g.tol * Math.abs(expect));
  return [{ where, got, expect, diff, err: Number.isFinite(rel) ? rel : Infinity, ok }];
}

for (const g of ref.groups) {
  for (const tool of g.tools) {
    // A `todo` group is a known difference waiting on a decision: it runs and
    // reports, but doesn't fail the suite.
    test(`${g.id} – ${tool} (${g.fn})`, g.todo ? { todo: g.todo } : {}, t => {
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
        const label = c.name || `${g.fn}(${JSON.stringify(c.args).slice(0, 80)})`;
        bad.forEach(res => fails.push(`  ${label}${res.where ? " " + res.where : ""}: got ${JSON.stringify(res.got)}, expected ${JSON.stringify(res.expect)}`));
      }
      t.diagnostic(`${g.cases.length} cases, worst ${absolute ? "difference" : "relative error"} ${worst.toExponential(1)}${g.note ? " – " + g.note : ""}`);
      assert.ok(!failed, `${failed} of ${g.cases.length} cases out of tolerance:\n${fails.slice(0, 10).join("\n")}`);
    });
  }
}

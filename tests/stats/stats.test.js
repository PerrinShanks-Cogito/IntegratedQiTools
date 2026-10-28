// © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
//
// Checks the statistical functions in every tool against reference answers
// from SciPy and NumPy (reference.json, written by make_reference.py).
//
// Run from the repository root:   node --test tests/stats/stats.test.js
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
  // a number reader, with "not a number" as null (JSON has no NaN)
  number: (tool, g) => (...args) => { const v = load(tool, [g.fn])[g.fn](...args); return Number.isNaN(v) ? null : v; },
  // Funnel plot: rows as pasted CSV (name, count, population) through the tool's reader
  funnel: tool => (rows, centre) => {
    const F = load(tool, ["analyse", "parse"]);
    const a = F.analyse(F.parse(rows.map(r => r.join(",")).join("\n"), false).rows, centre);
    return { p: a.p, poisson: a.poisson, rows: a.rows.map(r => ({ p: r.p, lcl: r.lcl, ucl: r.ucl, lwl: r.lwl, uwl: r.uwl, status: r.status })) };
  },
  // Hypothesis test selector: runs one of its tests on pasted data, as the
  // page does. The page rounds numbers for display, so its formatting is
  // swapped for one that keeps every digit; the results table then reads
  // { label: number }, with "a to b" as [a, b], and each table row is keyed
  // by its first cell.
  selector: tool => (id, d) => {
    const S = load(tool, ["RUN"], { fmt: x => x, fp: p => p });
    const r = S.RUN[id].run(d, { reject: "there is a difference." });
    if (r.error) return { error: r.error };
    const read = v => {
      if (typeof v !== "string") return v;
      const nums = v.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|-?Infinity/gi) || [];
      const rest = nums.reduce((s, x) => s.replace(x, ""), v).replace(/%| to | and | percentage points| points/g, "").trim();
      return rest || !nums.length ? v : nums.length === 1 ? Number(nums[0]) : nums.map(Number);
    };
    const out = { sig: r.sig, stats: Object.fromEntries(r.stats.map(([k, v]) => [k, read(v)])) };
    if (r.table) out.table = Object.fromEntries(r.table.rows.map(row => [row[0], row.map(read)]));
    return out;
  },
  // ANOVA tool: each group's statistics, the equal-spread test, and the
  // pairwise comparisons with Holm's adjustment
  anovaPost: tool => (groups, useWelch) => {
    const A = load(tool, ["describe", "oneWay", "spreadTest", "pairwise"]);
    const stats = groups.map((values, i) => A.describe({ name: "g" + i, values }));
    const ow = A.oneWay(groups);
    return { spread: A.spreadTest(stats),
      pairs: A.pairwise(stats, useWelch, ow.msw, ow.dfw).map(p => ({ diff: p.diff, se: p.se, df: p.df, p: p.p, padj: p.padj })) };
  },
  // Multiple regression tool: pasted data (headings in the first row) through
  // its reader, using every column but the output as an input
  regression: tool => (text, yIdx) => {
    const M = load(tool, ["build", "fit"]);
    const ncol = text.split("\n")[0].split("\t").length;
    const d = M.build(text, true, yIdx, new Set(Array.from({ length: ncol }, (_, i) => i)));
    const m = M.fit(d);
    if (m.bad) return { bad: m.bad };
    return { terms: m.terms.map(t => t.name), dropped: m.dropped.map(t => t.name), r2: m.r2, adj: m.adj, s: m.s, F: m.F, pF: m.pF, dw: m.dw,
      coefs: m.coefs.map(c => ({ b: c.b, se: c.se, t: c.t, p: c.p, lo: c.lo, hi: c.hi, vif: c.vif })), stud: m.stud, cook: m.cook };
  },
  // Gauge R&R: pasted data (headings in the first row) through the tool's
  // reader, then the ANOVA or X-bar and R method and the table of percentages
  gauge: tool => (text, method, o) => {
    const G = load(tool, ["parse", "arrange", "anova", "xbarR", "table"]);
    const res = (method === "xbarr" ? G.xbarR : G.anova)(G.arrange(G.parse(text, true).obs));
    const rows = Object.fromEntries(G.table(res, o).map(r => [r.key, { sd: r.sd, contrib: r.contrib, psv: r.psv, ptol: r.ptol, pproc: r.pproc }]));
    const src = list => list && Object.fromEntries(list.map(r => [r.src, { df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p }]));
    return { Rbar: res.Rbar, full: src(res.full), reduced: src(res.reduced) || null, interaction: res.interaction, comp: res.comp, rows };
  },
  // Attribute agreement: pasted ratings through the tool's reader and analysis.
  // `cats` are the categories in order (lower case, as the tool keys them).
  attribute: tool => (text, o, cats, useKendall) => {
    const A = load(tool, ["splitTable", "parse", "analyse"]);
    const a = A.analyse(A.parse(A.splitTable(text).recs, o), cats, useKendall);
    const pick = r => r && { x: r.x, n: r.n, p: r.p, lo: r.lo, hi: r.hi, coef: r.coef };
    return { within: a.within ? a.within.map(pick) : null, vsStd: a.vsStd ? a.vsStd.map(pick) : null,
      between: pick(a.between) || null, allStd: pick(a.allStd) || null, disagree: a.disagree || null };
  },
  // Design of experiments: the fit of a model in coded units (−1 and +1)
  doeFit: tool => (obs, terms) => {
    const m = load(tool, ["fit"]).fit(obs, terms);
    return { cols: m.cols, coef: m.coef, se: m.se, pv: m.pv, df: m.df, s: m.s, r2: m.r2, r2adj: m.r2adj };
  },
  // ...the equation in real units, and fitted means, for a design held in the page's state
  doeUncoded: tool => (state, obs, terms, fixed) => {
    const D = load(tool, ["fit", "uncoded", "fittedMean"], { state });
    const m = D.fit(obs, terms);
    return { uncoded: D.uncoded(m), means: fixed.map(f => D.fittedMean(m, f)) };
  },
  // Box plot: one group's quartiles, whiskers and outliers
  boxPlot: tool => (values, tukey) => load(tool, ["describe"]).describe({ name: "g", values }, tukey),
  // Histogram: the tool describes the data, then works out the bins
  histBins: tool => (values, mode, val, start) => {
    const H = load(tool, ["describe", "makeBins"]);
    const b = H.makeBins(H.describe(values), mode, val, start);
    return { width: b.width, start: b.start, bins: b.bins.map(x => ({ lo: x.lo, hi: x.hi, n: x.n, pct: x.pct, cum: x.cum })) };
  },
  // Pareto chart: pasted text through the tool's reader, then the sorted rows
  // with their percentages and the "vital few"
  pareto: tool => (text, hasHeader, groupAfter, cutoff) => {
    const P = load(tool, ["parse", "compute"]);
    const p = P.parse(text, hasHeader), r = P.compute(p.items, groupAfter, cutoff);
    return { skipped: p.skipped, total: r.total, vital: r.vital, rows: r.rows.map(d => ({ name: d.name, value: d.value, pct: d.pct, cum: d.cum })) };
  },
  // Bar chart: pasted text through the tool's reader
  barChart: tool => (text, hasHeader) => {
    const d = load(tool, ["parse"]).parse(text, hasHeader);
    return { cats: d.cats.map(c => ({ name: c.name, vals: c.vals })), skipped: d.skipped, blanks: d.blanks };
  },
  // A paste through a tool's reader, reduced to the data it found, so the same
  // data pasted in different ways can be compared
  pasted: (tool, g) => (text, hasHeader) => {
    const f = load(tool, [g.fn])[g.fn];
    if (tool === "histogram") { const H = load(tool, ["analyse", "parse"]), a = H.analyse(text); return H.parse(a, hasHeader, a.autoCol).values; }
    const r = f(text, hasHeader);
    if (tool === "box_plot") return r.groups.map(x => [x.name, x.values]);
    if (tool === "weibull_reliability") return r.xs;
    if (tool === "bar_chart") return r.cats.map(c => [c.name, c.vals]);
    if (tool === "scatter_plot") return r.rows.map(x => [x.x, x.y]);
    if (tool === "funnel_plot") return r.rows.map(x => [x.name, x.e, x.n]);
    if (tool === "run_chart") return r.points.map(x => [x.label, x.value]);
    throw new Error("no reader for " + tool);
  },
  // ...and backward elimination of terms that aren't clear
  doeReduce: tool => state => {
    const D = load(tool, ["reduce", "state"], { state });
    D.reduce();
    return D.state.terms;
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
        // JSON has no infinity, so the reference writes it as text
        const got = fn(...JSON.parse(JSON.stringify(c.args), (k, v) => v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v));
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

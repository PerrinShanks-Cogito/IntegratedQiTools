/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* Shared statistics for the FOCUS tools: the gamma and beta functions, the
   p-values, cumulative probabilities and critical values built on them, and the
   descriptive statistics and tests several tools use, and the reader for pasted
   tables that most tools share. Every tool that needs one
   takes it from here, so there is one copy to check and correct:

     const { ibeta, tP, fP, tCrit } = FocusStats;

   tests/stats/ checks each function against SciPy, and checks each tool's results
   through these shared copies.

     lgamma(z)            log of the gamma function, z > 0
     gamma(z)             the gamma function
     ibeta(x, a, b)       regularised incomplete beta function
     betaInv(p, a, b)     its inverse: the x with ibeta(x, a, b) = p
     gammaQ(a, x)         regularised upper incomplete gamma function
     tP(t, df)            two-sided p-value for t
     tCdf(t, df)          cumulative probability of the t distribution
     tInv(p, df)          its inverse
     tCrit(df, alpha)     two-sided critical value of t (alpha defaults to 0.05)
     fP(F, d1, d2)        upper-tail p-value for F
     chiP(x, df)          upper-tail p-value for chi-squared
     zP(z)                two-sided p-value for z
     normCdf(z)           cumulative probability of the standard normal
     normInv(p)           its inverse
     zCrit(alpha)         two-sided critical value of z

     sum(a), mean(a)      total and mean (NaN when a is empty)
     variance(a), sd(a)   sample variance and standard deviation (n − 1)
     median(a)            middle value, or the mean of the middle two
     quantile(sorted, p)  linear interpolation, as R type 7 and Excel's
                          QUARTILE.INC; `sorted` must be in ascending order
     ranks(a)             ranks from 1, with tied values given their average rank
     tiesT(a)             the tie correction, the sum of t³ − t over tied groups
     andersonDarling(a)   normality test: { a2, a, p }, or null with fewer than 3
                          values or none varying
     oneWay(groups)       one-way ANOVA on arrays of values

   Reading pasted data. Every tool reads a paste the same way, whether it was
   copied from Excel (tab-separated), saved as CSV, or typed:
     splitTable(text, opts)  { recs, delim }: the rows of the paste split into
                          cells, or null if it's blank. The delimiter is a tab,
                          or else a semicolon, or else a comma, looking only at
                          text outside quotes; a column of numbers like 1,234
                          isn't taken as comma-separated. Cells in quotes can
                          hold the delimiter and line breaks, and "" in quotes
                          is a quote mark. Cells are trimmed and blank lines
                          left out. With no delimiter at all, opts.space says
                          what a line becomes:
                            'numbers' (the default) a line made only of numbers
                                      separated by spaces gives a cell for each;
                                      any other line is one cell
                            'label'   as 'numbers', and a line of text ending in
                                      a number ("Ward A 12") gives the text and
                                      the number
                            'columns' every line is split on spaces
                            or a function of the line, for a tool with a
                            layout of its own
                          A paste that is a single line of three or more numbers
                          ("12, 15, 9" or "12 15 9") becomes one number per row.
                          opts.trimTrailing drops empty cells at the end of rows.
     pickDelimiter(lines) the delimiter splitTable would choose for these lines
                          (tab, semicolon or comma), or null if there is none
     splitCells(line, d)  one line split into cells on the delimiter d, keeping
                          a delimiter inside double quotes ("Ward A, North")
                          as part of the cell, and reading "" inside quotes as
                          one quote mark; cells are trimmed
     readNumber(raw)      a cell as a number. %, £, $ and € are ignored, and so
                          are spaces around it; a number in brackets, (12), is
                          negative; commas or spaces count only as thousands
                          separators, in groups of three (1,234 or 1 234). NaN
                          for anything else, so 1,2 or "95 66" is not a number
                          rather than 12 or 9566. (Tools may pass the table's
                          delimiter as a second argument; it isn't needed.)
     isNumberCell(v)      whether a cell holds a number
     numericShare(recs, c)  the share of column c's filled cells (after the
                          first row) that hold numbers
*/
window.FocusStats = (() => {
  // Lanczos approximation (Numerical Recipes gammln), accurate to about 1e-10
  function lgamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015; for (const k of c) s += k / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  const gamma = z => Math.exp(lgamma(z));

  // Continued fraction for the incomplete beta function (modified Lentz). It
  // usually settles in well under 100 terms; the cap only matters for extreme
  // shapes, such as the power tool's large degrees of freedom.
  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= 2000; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function betaInv(p, a, b) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (ibeta(mid, a, b) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // Upper incomplete gamma function, regularised: a series below a + 1, a
  // continued fraction above
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x === Infinity) return 0;
    const lead = Math.exp(-x + a * Math.log(x) - lgamma(a));
    if (x < a + 1) {
      let ap = a, del = 1 / a, s = del;
      for (let i = 0; i < 1000; i++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
      return Math.max(0, 1 - s * lead);
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return lead * h;
  }

  // The value at which a falling function pOf drops to a, by bisection
  function crit(pOf, a, hi) {
    let lo = 0;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (pOf(m) > a) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  const tP = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);
  function tCdf(t, df) { const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); return t > 0 ? 1 - p : p; }
  function tInv(p, df) {
    let lo = 0, hi = 1;
    while (tCdf(hi, df) < p && hi < 1e8) { lo = hi; hi *= 2; }
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  const tCrit = (df, alpha = 0.05) => crit(t => tP(t, df), alpha, 1e4);
  const fP = (F, d1, d2) => F <= 0 ? 1 : !isFinite(F) ? (F > 0 ? 0 : NaN) : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  const chiP = (x, df) => x <= 0 ? 1 : gammaQ(df / 2, x / 2);
  const zP = z => gammaQ(0.5, z * z / 2);
  // From the incomplete gamma function, so accurate far into the tails
  const normCdf = z => z < 0 ? zP(z) / 2 : 1 - zP(z) / 2;
  const zCrit = alpha => crit(zP, alpha, 40);

  // Acklam's rational approximation (relative error below 1.2e-9), refined with
  // one Halley step against normCdf
  function normInv(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    let x;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = normCdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  }

  // ---- descriptive statistics ----
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => sum(a) / a.length;
  const variance = a => { const m = mean(a); return sum(a.map(x => (x - m) ** 2)) / (a.length - 1); };
  const sd = a => Math.sqrt(variance(a));
  function quantile(sorted, p) {
    const h = (sorted.length - 1) * p, lo = Math.floor(h);
    return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
  }
  const median = a => a.length ? quantile(a.slice().sort((x, y) => x - y), 0.5) : NaN;
  function ranks(a) {
    const idx = a.map((v, i) => i).sort((x, y) => a[x] - a[y]), r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }
  const tiesT = a => { const c = new Map(); a.forEach(v => c.set(v, (c.get(v) || 0) + 1)); let t = 0; c.forEach(k => { t += k * k * k - k; }); return t; };

  // Anderson-Darling test for normality, with the mean and standard deviation
  // estimated from the data: A² with Stephens' small-sample adjustment, and the
  // p-value from D'Agostino and Stephens (1986), as Minitab uses. Each tail
  // probability comes straight from normCdf, so extreme values are measured
  // accurately; beyond an adjusted A² of 13 the p-value is taken as 0, because
  // the fitted curve turns back up there.
  function andersonDarling(values) {
    const n = values.length; if (n < 3) return null;
    const m = mean(values), s = sd(values); if (!(s > 0)) return null;
    const v = values.slice().sort((x, y) => x - y);
    let S = 0;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(normCdf((v[i] - m) / s), 1e-300);
      const hi = Math.max(normCdf(-(v[n - 1 - i] - m) / s), 1e-300);
      S += (2 * i + 1) * (Math.log(lo) + Math.log(hi));
    }
    const a2 = -n - S / n, a = a2 * (1 + 0.75 / n + 2.25 / (n * n));
    const p = a < 0.2 ? 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a)
      : a < 0.34 ? 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
      : a < 0.6 ? Math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
      : a < 13 ? Math.exp(1.2937 - 5.709 * a + 0.0186 * a * a) : 0;
    return { a2, a, p: Math.min(1, Math.max(0, p)) };
  }

  // One-way ANOVA. When nothing varies within the groups, F is Infinity (or NaN
  // if nothing varies at all) and p is 0 (or 1).
  function oneWay(groups) {
    const k = groups.length, N = sum(groups.map(g => g.length));
    const means = groups.map(mean), grand = sum(groups.map(sum)) / N;
    const ssb = sum(groups.map((g, i) => g.length * (means[i] - grand) ** 2));
    const ssw = sum(groups.map((g, i) => sum(g.map(x => (x - means[i]) ** 2))));
    const dfb = k - 1, dfw = N - k, msb = ssb / dfb, msw = ssw / dfw;
    const tiny = 1e-12 * (ssb + ssw);
    let F, p;
    if (ssw <= tiny) { F = ssb <= tiny ? NaN : Infinity; p = ssb <= tiny ? 1 : 0; }
    else { F = msb / msw; p = fP(F, dfb, dfw); }
    return { k, N, grand, ssb, ssw, sst: ssb + ssw, dfb, dfw, msb, msw, F, p, eta2: ssb + ssw > 0 ? ssb / (ssb + ssw) : 0 };
  }

  // ---- reading pasted data ----
  // Cells as a spreadsheet writes them to CSV: a cell in double quotes can hold
  // the delimiter, and "" inside the quotes is a quote mark. A quote that opens
  // but never closes is taken as an ordinary character, as before.
  function splitCells(line, delim) {
    const out = [];
    let cell = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (c === delim) { out.push(cell); cell = ''; }
      else cell += c;
    }
    if (q) return line.split(delim).map(x => x.trim().replace(/^"(.*)"$/, '$1').trim());
    out.push(cell);
    return out.map(x => x.trim());
  }
  // A whole paste split on the delimiter, with quoted cells able to hold the
  // delimiter and line breaks. If a quote opens and never closes, each line is
  // split on its own instead, with the quote as an ordinary character.
  function splitQuoted(text, delim) {
    const recs = []; let rec = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
      else if (c === delim) { rec.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rec.push(cell); recs.push(rec); rec = []; cell = ''; }
      else cell += c;
    }
    if (q) return text.split(/\r?\n/).filter(l => l.trim() !== '').map(l => splitCells(l, delim));
    rec.push(cell); recs.push(rec);
    return recs.map(r => r.map(x => x.trim())).filter(r => r.length > 1 || r[0] !== '');
  }
  // A number written with thousands commas, as Excel copies a formatted cell. Its
  // commas don't count when choosing the delimiter, so a column of 1,234 and 980
  // is one column, and "Ward B 1,234" a label and a number. (A paste whose only
  // commas are in such numbers is read that way even if it was meant as CSV:
  // 45,120 is 45120, not 45 and 120.)
  const THOUSANDS = /(?<![\d,.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/g;
  const unquote = x => x.trim().replace(/^"(.*)"$/, '$1').trim();
  // What a line with no tab, semicolon or comma becomes (see splitTable)
  const SPACES = {
    numbers: t => { const p = t.split(/\s+/); return p.length > 1 && p.every(isNumberCell) ? p : [unquote(t)]; },
    label: t => {
      const p = t.split(/\s+/);
      if (p.length > 2 && p.every(isNumberCell)) return p;
      const m = t.match(/^(.*\S)\s+(\S+)$/);
      return m && isNumberCell(m[2]) ? [unquote(m[1]), m[2]] : [unquote(t)];
    },
    columns: t => t.split(/\s+/).map(unquote)
  };
  // The delimiter of a paste: a tab, or else a semicolon, or else a comma, looking
  // only at text outside quotes and outside numbers like 1,234; null if none
  function pickDelimiter(lines) {
    const bare = lines.map(l => String(l).replace(/"[^"]*"/g, '').replace(THOUSANDS, '0'));
    return bare.some(l => l.includes('\t')) ? '\t' : bare.some(l => l.includes(';')) ? ';' : bare.some(l => l.includes(',')) ? ',' : null;
  }
  function splitTable(text, opts = {}) {
    const src = String(text || '');
    const lines = src.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return null;
    // choose the delimiter from the text outside quotes, so a name like "A; B" doesn't count
    const delim = pickDelimiter(lines);
    let recs;
    if (delim) recs = splitQuoted(src, delim);
    else {
      const rule = typeof opts.space === 'function' ? opts.space : SPACES[opts.space || 'numbers'];
      recs = lines.map(l => rule(l.trim()));
    }
    if (opts.trimTrailing) recs = recs.map(r => { const f = r.slice(); while (f.length > 1 && f[f.length - 1] === '') f.pop(); return f; });
    // one line of numbers is a list, one number per row
    if (recs.length === 1 && recs[0].length > 2 && recs[0].every(isNumberCell)) recs = recs[0].map(x => [x]);
    return { recs, delim: delim || (opts.space === 'columns' ? 'ws' : '\t') };
  }
  // Commas and spaces are taken as thousands separators only when they group
  // digits in threes. Any other comma or space, as in a decimal comma (1,2) or
  // numbers typed on one line (95 66), makes the cell not a number, so it's
  // reported as skipped rather than read as 12 or 9566.
  function readNumber(raw) {
    if (raw === undefined || raw === null) return NaN;
    let v = String(raw).trim().replace(/^"(.*)"$/, '$1').replace(/[−–]/g, '-').replace(/[£$€%]/g, '').trim();
    let neg = false;
    const par = v.match(/^\((.*)\)$/);
    if (par) { neg = true; v = par[1].trim(); }
    if (/^[-+]?\d{1,3}([,   ]\d{3})+(\.\d*)?$/.test(v)) v = v.replace(/[,   ]/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return NaN;
    const n = Number(v);
    return neg ? -n : n;
  }
  const isNumberCell = v => v !== undefined && v !== '' && isFinite(readNumber(v));
  function numericShare(recs, c) {
    const cells = recs.slice(recs.length > 1 ? 1 : 0).map(r => r[c]).filter(v => v !== undefined && v !== '');
    return cells.length ? cells.filter(v => isNumberCell(v)).length / cells.length : 0;
  }

  return { lgamma, gamma, ibeta, betaInv, gammaQ, tP, tCdf, tInv, tCrit, fP, chiP, zP, normCdf, normInv, zCrit,
    sum, mean, variance, sd, median, quantile, ranks, tiesT, andersonDarling, oneWay,
    pickDelimiter, splitCells, splitTable, readNumber, isNumberCell, numericShare };
})();

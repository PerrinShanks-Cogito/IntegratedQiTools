---
# Liquid fills in the site links below
---
/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

(function () {
  const $ = id => document.getElementById(id);
  const els = { pick: $('pickTest'), ask: $('ask'), route: $('route'), result: $('result'), tree: $('tree'), title: $('title'), back: $('backBtn') };
  const COLORS = { ink: '#212B32', muted: '#4C6272', line: '#AEB7BD', q: '#E6F0FA', qStroke: '#005EB8', test: '#007F3B', start: '#F0F4F5' };
  const FONT = 'Figtree, Frutiger, Helvetica Neue, Arial, sans-serif';
  const BASE = {{ site.baseurl | jsonify }};
  const toolUrl = id => BASE + '/' + id + '/';

  // ---- the road map ----
  // A question has options, each leading to the next node. A test is where a route ends;
  // the Box-Cox transform leads on (`then`) to the normal-data questions.
  const NODES = {
    output: { q: 'What type of data is your output (Y)?', hint: 'The result you are measuring, the thing you want to understand or improve.', options: [
      { a: 'Attribute', sub: 'Counts or categories, such as admitted or not, harm or no harm, on time or late', next: 'attrInput' },
      { a: 'Continuous', sub: 'A measurement on a scale, such as length of stay, waiting time or blood pressure', next: 'contInput' }] },

    attrInput: { q: 'What type of data is your input (X)?', hint: 'The thing you think influences the output.', options: [
      { a: 'Attribute', sub: 'Categories, such as ward, team or before and after a change', next: 'attrFactors' },
      { a: 'Continuous', sub: 'A measurement, such as age, length of stay or staffing level', next: 'logistic' }] },
    attrFactors: { q: 'How many factors?', hint: 'Use one factor to compare a proportion with a target or between groups. Use two factors to see whether two sets of categories are related, such as ward and whether patients were assessed on time, when the output has more than two categories or there are more than two groups.', options: [
      { a: '1 factor', sub: 'One proportion, such as the percentage of patients seen within 4 hours', next: 'attrLevels' },
      { a: '2 factors', sub: 'A table of counts, such as on time or late on each of several wards', next: 'chi' }] },
    attrLevels: { q: 'How many levels?', hint: 'The number of groups you are comparing.', options: [
      { a: '1 level', sub: 'One group compared with a target or standard', next: 'prop1' },
      { a: '2 levels', sub: 'Two groups compared with each other, such as two wards or before and after', next: 'prop2' }] },

    contInput: { q: 'What type of data is your input (X)?', hint: 'The thing you think influences the output.', options: [
      { a: 'Attribute', sub: 'Categories or groups, such as ward, site, or before and after a change', next: 'normal' },
      { a: 'Continuous', sub: 'A measurement, such as age, staffing level or number of referrals', next: 'contFactors' }] },
    contFactors: { q: 'How many factors?', hint: 'The number of inputs you want to relate to the output.', options: [
      { a: '1 factor', sub: 'One input, such as length of stay against age', next: 'slr' },
      { a: 'More than 1 factor', sub: 'Several inputs together, such as waiting time against staffing and demand', next: 'mlr' }] },

    normal: { q: 'Is your data normally distributed?', hint: 'Check with an Anderson-Darling test: a p-value above 0.05 means you can treat the data as normal.', link: { id: 'histogram', label: 'Check with the histogram tool' }, options: [
      { a: 'Normal', sub: 'Roughly symmetrical and bell-shaped, Anderson-Darling p above 0.05', next: 'nFactors' },
      { a: 'Not normal', sub: 'Skewed or lumpy, Anderson-Darling p of 0.05 or below', next: 'transform' }] },
    nFactors: { q: 'How many factors?', hint: 'The number of inputs that split your data into groups.', options: [
      { a: '1 factor', sub: 'One way of grouping, such as ward', next: 'nLevels' },
      { a: '2 factors', sub: 'Two ways of grouping at once, such as ward and day of the week', next: 'anova2' }] },
    nLevels: { q: 'How many levels?', hint: 'The number of groups you are comparing.', options: [
      { a: '1 level', sub: 'One group compared with a target or standard', next: 't1' },
      { a: '2 levels', sub: 'Two groups, such as two wards or before and after', next: 'n2Compare' },
      { a: 'More than 2 levels', sub: 'Three or more groups, such as several wards', next: 'n3Compare' }] },
    n2Compare: { q: 'Do you want to compare the means or the variation?', hint: 'The average, or how spread out the values are.', options: [
      { a: 'Means', sub: 'Is the average different?', next: 'dependent' },
      { a: 'Variation', sub: 'Is the spread different?', next: 'var2' }] },
    dependent: { q: 'Is the data dependent?', hint: 'Paired data comes from the same people or things measured twice.', options: [
      { a: 'Independent', sub: 'Different people or things in each group, such as patients on two wards', next: 't2' },
      { a: 'Paired', sub: 'The same people or things measured twice, such as before and after', next: 'tPaired' }] },
    n3Compare: { q: 'Do you want to compare the means or the variation?', hint: 'The average, or how spread out the values are.', options: [
      { a: 'Means', sub: 'Are any of the averages different?', next: 'anova1' },
      { a: 'Variation', sub: 'Is the spread different in any group?', next: 'bartlett' }] },

    transform: { q: 'Do you want to transform the data?', hint: 'Transforming skewed data, such as waiting times, can make it normal so you can use the tests for normal data.', options: [
      { a: 'Yes', sub: 'Transform it and use the tests for normal data', next: 'transformType' },
      { a: 'No', sub: 'Use a test that doesn’t need normal data', next: 'npFactors' }] },
    transformType: { q: 'Which transformation?', hint: 'Box-Cox finds the best power for your data. A log suits a long tail of high values, such as waiting times or costs; a square root suits counts and milder skew.', options: [
      { a: 'Box-Cox', sub: 'Let the tool find the power that makes your data closest to normal', next: 'boxcox' },
      { a: 'Log', sub: 'Natural log (ln) or log base 10, for a long tail of high values', next: 'logT' },
      { a: 'Square root', sub: 'For counts, or data that is only a little skewed', next: 'sqrtT' }] },
    npFactors: { q: 'How many factors?', hint: 'The number of inputs that split your data into groups.', options: [
      { a: '1 factor', sub: 'One group compared with a target, or two groups compared', next: 'npLevels' },
      { a: '2 or more factors', sub: 'More groups, such as several wards', next: 'outliers' }] },
    npLevels: { q: 'How many levels?', hint: 'The number of groups you are comparing.', options: [
      { a: '1 level', sub: 'One group compared with a target or standard', next: 'sign' },
      { a: '2 levels', sub: 'Two groups, such as two wards or before and after', next: 'np2Compare' }] },
    np2Compare: { q: 'Do you want to compare the medians or the variation?', hint: 'For data that isn’t normal, the median is the better middle value.', options: [
      { a: 'Medians', sub: 'Is the middle value different?', next: 'mann' },
      { a: 'Variation', sub: 'Is the spread different?', next: 'levene' }] },
    outliers: { q: 'Are there outliers in your data?', hint: 'Values far away from the rest. A box and whisker plot shows them.', link: { id: 'box_plot', label: 'Check with the box and whisker plot' }, options: [
      { a: 'No outliers', sub: 'No values far from the rest', next: 'kruskal' },
      { a: 'Outliers', sub: 'Some values far from the rest', next: 'mood' }] },

    logistic: { test: 'Logistic regression', what: 'Relates a yes or no (or other category) outcome to one or more measured inputs, and gives the odds of the outcome as each input changes.',
      example: 'Whether a patient is readmitted within 30 days, against their age and length of stay.',
      h0: 'The input has no effect on the chance of the outcome.', reject: 'the chance of the outcome changes with the input.',
      checks: ['Each observation is independent.', 'You have enough of each outcome; a rough rule is at least 10 of the rarer outcome for each input.'] },
    chi: { test: 'Chi-squared test', what: 'Tests whether counts split differently between groups, that is whether two sets of categories are related.',
      example: 'Whether the split of patients assessed on time and late differs between wards.',
      h0: 'The two factors are independent: the split is the same in every group.', reject: 'the split differs between groups.',
      checks: ['Use counts, not percentages.', 'Each patient or item is counted once.', 'Expected counts of at least 5 in each cell.'], tools: ['chi_squared'] },
    prop1: { test: '1-proportion test', what: 'Compares one proportion with a target or standard.',
      example: 'Whether the percentage of patients seen within 4 hours is different from the 95% standard.',
      h0: 'The proportion equals the target.', reject: 'the proportion is different from the target.',
      checks: ['Each observation is independent.', 'Enough data that you expect at least 5 of each outcome.'], tools: ['power_sample_size'] },
    prop2: { test: '2-proportions test', what: 'Compares a proportion between two groups.',
      example: 'Whether the percentage of falls that cause harm is different on two wards, or before and after a change.',
      h0: 'The two proportions are equal.', reject: 'the proportions are different.',
      checks: ['The two groups are independent.', 'Enough data that you expect at least 5 of each outcome in each group.'], tools: ['power_sample_size', 'chi_squared'] },
    slr: { test: 'Simple linear regression', what: 'Fits a straight line relating one measured input to the output, and tells you how much of the variation in the output it explains (R²).',
      example: 'Length of stay against age.',
      h0: 'The slope is zero: the input has no straight-line relationship with the output.', reject: 'the output changes with the input.',
      checks: ['The relationship looks like a straight line on a scatter plot.', 'The residuals (the gaps from the line) are roughly normal and similarly spread all along the line.', 'Each observation is independent.'], tools: ['scatter_plot'] },
    mlr: { test: 'Multiple linear regression', what: 'Relates several inputs together to the output, and shows which of them matter once the others are taken into account.',
      example: 'Waiting times against staffing and demand.',
      h0: 'Each input’s coefficient is zero: it adds nothing once the others are included.', reject: 'that input is related to the output.',
      checks: ['Each relationship is roughly a straight line.', 'The residuals are roughly normal and evenly spread.', 'The inputs are not too closely related to each other.'], tools: ['multiple_regression'] },
    anova2: { test: 'Two-way ANOVA', what: 'Compares means across two factors at once, and whether the effect of one factor depends on the other (an interaction).',
      example: 'Length of stay by ward and by day of admission.',
      h0: 'Neither factor, nor their interaction, changes the mean.', reject: 'that factor (or the interaction) changes the mean.',
      checks: ['The data in each group is roughly normal.', 'The groups have similar spread.', 'Each observation is independent.'] },
    t1: { test: '1-sample t test', what: 'Compares the mean of one group with a target or standard.',
      example: 'Whether the average time from arrival to triage is different from the 15-minute standard.',
      h0: 'The mean equals the target.', reject: 'the mean is different from the target.',
      checks: ['The data is roughly normal.', 'Each observation is independent.'], tools: ['power_sample_size'] },
    var2: { test: 'Test for two variances (F test)', what: 'Compares how spread out the values are in two groups.',
      example: 'Whether door-to-needle times vary more on one site than another.',
      h0: 'The two variances are equal.', reject: 'one group is more spread out than the other.',
      checks: ['The data in each group is normal; the F test is sensitive to this, so use Levene’s test if in doubt.', 'The two groups are independent.'] },
    t2: { test: '2-sample t test', what: 'Compares the means of two independent groups.',
      example: 'Whether the average length of stay is different on two wards.',
      h0: 'The two means are equal.', reject: 'the means are different.',
      checks: ['The data in each group is roughly normal.', 'The groups are independent.', 'Check whether the spread is similar; if not, use the version of the test that doesn’t assume equal variances (Welch’s).'], tools: ['power_sample_size', 'box_plot'] },
    tPaired: { test: 'Paired t test', what: 'Compares two measurements on the same people or things by looking at the difference within each pair.',
      example: 'Pain scores for the same patients before and after a new pain management plan.',
      h0: 'The mean difference is zero.', reject: 'there is a real change between the two measurements.',
      checks: ['The differences are roughly normal.', 'Each pair is independent of the others.'], tools: ['power_sample_size'] },
    anova1: { test: 'One-way ANOVA', what: 'Compares the means of three or more groups.',
      example: 'Whether the average length of stay differs across several wards.',
      h0: 'All the group means are equal.', reject: 'at least one group mean is different; follow up to see which.',
      checks: ['The data in each group is roughly normal.', 'The groups have similar spread (check with Bartlett’s or Levene’s test).', 'Each observation is independent.'], tools: ['anova', 'power_sample_size'] },
    bartlett: { test: 'Bartlett’s test', what: 'Compares how spread out the values are in three or more groups.',
      example: 'Whether blood test turnaround times vary more in some laboratories than others.',
      h0: 'All the group variances are equal.', reject: 'at least one group is more or less spread out.',
      checks: ['The data in each group is normal; Bartlett’s test is sensitive to this, so use Levene’s test if in doubt.', 'Each observation is independent.'] },
    boxcox: { test: 'Box-Cox transformation', isTransform: true, what: 'Finds a power (such as the square root, the log or the reciprocal) that makes skewed data closer to normal. You then run the test on the transformed data.',
      example: 'Taking the log of waiting times, which usually have a long tail of long waits.',
      checks: ['The data must all be above zero.', 'Check the transformed data is normal with an Anderson-Darling test before you carry on.', 'Report results in the original units, for example by back-transforming means.'],
      then: { a: 'Transformed data is normal', sub: 'Carry on with the tests for normal data', next: 'nFactors' }, tools: ['histogram'] },
    logT: { test: 'Log transformation', isTransform: true, what: 'Takes the logarithm of each value, which pulls in a long tail of high values. The natural log (ln) and log base 10 change the shape in the same way, so either works. You then run the test on the transformed data.',
      example: 'Taking the log of the cost of each admission, where a few very expensive admissions make a long tail.',
      checks: ['The data must all be above zero; add the same constant to every value first if some are zero.', 'Check the transformed data is normal with an Anderson-Darling test before you carry on.', 'Report results in the original units: a mean of logs back-transforms to a geometric mean, not the ordinary mean.'],
      then: { a: 'Transformed data is normal', sub: 'Carry on with the tests for normal data', next: 'nFactors' }, tools: ['histogram'] },
    sqrtT: { test: 'Square root transformation', isTransform: true, what: 'Takes the square root of each value, which reduces skew more gently than a log. It often suits counts, such as the number of falls or complaints each week. You then run the test on the transformed data.',
      example: 'Taking the square root of the number of incidents reported each week.',
      checks: ['The data must not be below zero.', 'Check the transformed data is normal with an Anderson-Darling test before you carry on.', 'Report results in the original units, for example by squaring a mean back.'],
      then: { a: 'Transformed data is normal', sub: 'Carry on with the tests for normal data', next: 'nFactors' }, tools: ['histogram'] },
    sign: { test: '1-sample sign test', what: 'Compares the median of one group with a target, without assuming the data is normal.',
      example: 'Whether the median wait for a clinic appointment is different from the 6-week standard.',
      h0: 'The median equals the target.', reject: 'the median is different from the target.',
      checks: ['Each observation is independent.', 'It has less power than a t test, so it needs more data to detect the same change.'] },
    mann: { test: 'Mann-Whitney test', what: 'Compares the medians of two independent groups, without assuming the data is normal.',
      example: 'Whether the median wait in the emergency department is different on two sites.',
      h0: 'The two medians are equal.', reject: 'the medians are different.',
      checks: ['The groups are independent.', 'The two groups have a similar shape of distribution.'], tools: ['box_plot'] },
    levene: { test: 'Levene’s test', what: 'Compares how spread out the values are in two or more groups, and works well when the data isn’t normal.',
      example: 'Whether discharge times vary more on one ward than another.',
      h0: 'All the group variances are equal.', reject: 'at least one group is more or less spread out.',
      checks: ['Each observation is independent.'], tools: ['box_plot'] },
    kruskal: { test: 'Kruskal-Wallis test', what: 'Compares the medians of three or more groups, without assuming the data is normal.',
      example: 'Whether the median length of stay differs across several wards.',
      h0: 'All the group medians are equal.', reject: 'at least one group median is different.',
      checks: ['The groups have a similar shape of distribution.', 'Each observation is independent.', 'It is affected by outliers; use Mood’s median test if there are any.'], tools: ['box_plot'] },
    mood: { test: 'Mood’s median test', what: 'Compares the medians of two or more groups by counting values above and below the overall median, so outliers have little effect.',
      example: 'Whether the median time to theatre differs across sites when a few patients waited much longer than the rest.',
      h0: 'All the group medians are equal.', reject: 'at least one group median is different.',
      checks: ['Each observation is independent.', 'It has less power than Kruskal-Wallis, so it needs more data.'], tools: ['box_plot'] }
  };
  const TOOL_NAMES = {
    chi_squared: 'Chi-squared test', power_sample_size: 'Power and sample size', scatter_plot: 'Scatter plot',
    multiple_regression: 'Multiple regression', anova: 'ANOVA', box_plot: 'Box and whisker plot', histogram: 'Histogram'
  };
  const ROOT = 'output';

  // answers: the option chosen at each step, as an index, or 'then' to carry on after a transform
  let answers = [];
  let current = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hypothesis-test-selector';
  const pick = (node, a) => a === 'then' ? node.then : node.options && node.options[a];
  // What a step asked: its question, or for a transform the step itself
  const askOf = node => node.q || node.test;
  // Test names as they read mid-sentence, keeping capitals on people's names
  const inline = t => /^(Mann|Mood|Levene|Kruskal|Bartlett|Box)/.test(t) ? t : t[0].toLowerCase() + t.slice(1);

  // ---- running the test on your data ----
  // What was pasted for each test, kept per test so exploring other routes doesn't lose it
  let runs = {};
  let alpha = 0.05;
  let lastRun = null;

  // distributions, descriptive statistics and the reader for pasted tables, shared
  // by every tool, from /assets/js/focus-stats.js
  const { ibeta, tP, tCrit, fP, chiP, zP, normCdf, zCrit, sum, mean, variance, median, ranks, tiesT, andersonDarling, oneWay, splitTable: split, readNumber: num, isNumberCell: isNum, numericShare: numShare } = FocusStats;

  // Gauss-Jordan inverse of a symmetric matrix; null when it is singular
  function inverse(A) {
    const n = A.length, M = A.map((row, i) => row.concat(row.map((_, j) => i === j ? 1 : 0)));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (!(Math.abs(M[p][c]) > 1e-10 * Math.abs(A[c][c]))) return null;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(row => row.slice(n));
  }
  const crossprod = (X, w) => X[0].map((_, i) => X[0].map((_, j) => sum(X.map((r, k) => r[i] * r[j] * (w ? w[k] : 1)))));
  // Least squares fit; X includes the column of 1s for the intercept
  function ols(X, y) {
    const inv = inverse(crossprod(X)); if (!inv) return null;
    const Xty = X[0].map((_, i) => sum(X.map((r, k) => r[i] * y[k])));
    const b = inv.map(row => sum(row.map((v, j) => v * Xty[j])));
    const sse = sum(y.map((v, k) => (v - sum(X[k].map((x, j) => x * b[j]))) ** 2));
    return { b, inv, sse, df: X.length - X[0].length };
  }
  // Logistic regression by Newton-Raphson
  function logit(X, y) {
    let b = X[0].map(() => 0), converged = false;
    const probs = () => X.map(r => 1 / (1 + Math.exp(-sum(r.map((v, j) => v * b[j])))));
    for (let it = 0; it < 60; it++) {
      const mu = probs(), inv = inverse(crossprod(X, mu.map(m => Math.max(m * (1 - m), 1e-12))));
      if (!inv) return null;
      const g = X[0].map((_, i) => sum(X.map((r, k) => r[i] * (y[k] - mu[k]))));
      const step = inv.map(row => sum(row.map((v, j) => v * g[j])));
      b = b.map((v, j) => v + step[j]);
      if (Math.max(...step.map(Math.abs)) < 1e-8) { converged = true; break; }
    }
    const mu = probs(), inv = inverse(crossprod(X, mu.map(m => Math.max(m * (1 - m), 1e-12))));
    const ll = sum(mu.map((m, k) => { const q = Math.min(1 - 1e-15, Math.max(1e-15, m)); return y[k] ? Math.log(q) : Math.log(1 - q); }));
    return { b, se: inv ? inv.map((row, i) => Math.sqrt(row[i])) : b.map(() => NaN), ll, converged };
  }
  function chiTable(obs) {
    const rt = obs.map(r => sum(r)), ct = obs[0].map((_, j) => sum(obs.map(r => r[j]))), N = sum(rt);
    const E = obs.map((r, i) => r.map((_, j) => rt[i] * ct[j] / N));
    const X2 = sum(obs.map((r, i) => sum(r.map((o, j) => (o - E[i][j]) ** 2 / E[i][j]))));
    const df = (obs.length - 1) * (obs[0].length - 1), flat = [].concat(...E);
    return { X2, df, p: chiP(X2, df), E, N, minE: Math.min(...flat), lowE: flat.filter(e => e < 5).length, cells: flat.length };
  }

  // parsing pasted data (the same layouts as the other tools)
  // Groups, either "long" (a group column then a value column) or "wide" (one column per group)
  function parseGroups(text) {
    const s = split(text); if (!s) return null;
    const { recs, delim } = s, ncol = Math.max(...recs.map(r => r.length));
    const long = ncol >= 2 && numShare(recs, 0, delim) < 0.6 && numShare(recs, ncol - 1, delim) >= 0.6;
    const header = recs.length > 1 && (long ? !isNum(recs[0][ncol - 1], delim) : recs[0].some(v => v !== '' && !isNum(v, delim)));
    const head = header ? recs[0] : null, body = header ? recs.slice(1) : recs, groups = new Map();
    const get = (name, key) => { if (!groups.has(key)) groups.set(key, { name, values: [] }); return groups.get(key); };
    let skipped = 0;
    if (long) {
      for (const r of body) {
        const v = num(r[ncol - 1], delim);
        if (!isFinite(v)) { skipped++; continue; }
        const name = (r[0] || '').trim() || '(blank)';
        get(name, name.toLowerCase().replace(/\s+/g, ' ')).values.push(v);
      }
    } else {
      for (let c = 0; c < ncol; c++) {
        const g = get((head && head[c]) || 'Column ' + (c + 1), 'c' + c);
        for (const r of body) {
          if (r[c] === undefined || r[c] === '') continue;
          const v = num(r[c], delim); if (isFinite(v)) g.values.push(v); else skipped++;
        }
      }
    }
    const all = [...groups.values()].filter(g => g.values.length);
    return { groups: all.filter(g => g.values.length >= 2), single: all.filter(g => g.values.length < 2).map(g => g.name), skipped };
  }
  // Columns, with headings in the first row when a numeric column starts with text
  function parseCols(text) {
    const s = split(text); if (!s) return null;
    const { recs, delim } = s, ncol = Math.max(...recs.map(r => r.length));
    const numeric = Array.from({ length: ncol }, (_, c) => numShare(recs, c, delim) >= 0.6);
    const header = recs.length > 1 && numeric.some((isN, c) => isN && recs[0][c] && !isNum(recs[0][c], delim));
    return {
      ncol, numeric, rows: header ? recs.slice(1) : recs, n: v => num(v, delim),
      names: Array.from({ length: ncol }, (_, c) => (header && recs[0][c]) || 'Column ' + (c + 1))
    };
  }
  function oneCol(text) {
    const c = parseCols(text); if (!c) return { values: [], name: '' };
    const col = Math.max(0, c.numeric.indexOf(true));
    const values = c.rows.map(r => c.n(r[col])).filter(isFinite);
    return { values, name: c.names[col], skipped: c.rows.filter(r => r[col] !== undefined && r[col] !== '').length - values.length, extraCols: c.ncol > 1 };
  }
  // A table of counts, optionally with row labels down the side and headings across the top
  function parseTable(text) {
    const s = split(text); if (!s) return null;
    const { recs, delim } = s, ncol = Math.max(...recs.map(r => r.length));
    const labRows = recs.length > 1 ? recs.slice(1) : recs;
    const rowLab = labRows.filter(r => r[0] && !isNum(r[0], delim)).length > labRows.length / 2;
    const c0 = rowLab ? 1 : 0;
    const header = recs[0].slice(c0).some(v => v !== '' && !isNum(v, delim)) || (rowLab && !recs[0][0] && recs.length > 1);
    const body = header ? recs.slice(1) : recs;
    const cols = Array.from({ length: ncol - c0 }, (_, j) => (header && recs[0][j + c0]) || 'Column ' + (j + 1));
    let bad = 0;
    const counts = body.map(r => cols.map((_, j) => { const v = r[j + c0]; if (v === undefined || v === '') return 0; const x = num(v, delim); if (!(x >= 0)) { bad++; return 0; } return x; }));
    return { rows: body.map((r, i) => rowLab ? r[0] || 'Row ' + (i + 1) : 'Row ' + (i + 1)), cols, counts, bad };
  }

  // formatting
  const fmt = (x, d = 3) => x === Infinity ? '∞' : !isFinite(x) ? '–' : (Math.abs(x) >= 1e6 || (Math.abs(x) < 1e-3 && x !== 0)) ? x.toPrecision(3) : String(+x.toFixed(d));
  const fp = p => p < 0.001 ? 'below 0.001' : p.toFixed(3);
  const pText = p => p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
  const conf = () => Math.round((1 - alpha) * 100) + '%';
  const fail = error => ({ error });
  const sentence = s => s.split(';')[0].replace(/\.$/, '');
  function decide(p, n) {
    const sig = p < alpha;
    return { sig, verdict: sig ? `${pText(p)} is below ${alpha}, so reject the null hypothesis: ${n.reject}`
      : `${pText(p)} is not below ${alpha}, so don't reject the null hypothesis. There isn't enough evidence that ${sentence(n.reject)}.` };
  }
  const groupTable = (gs, med) => ({ head: ['Group', 'Values', med ? 'Median' : 'Mean', 'Standard deviation'],
    rows: gs.map(g => [g.name, g.values.length, fmt(med ? median(g.values) : mean(g.values)), fmt(Math.sqrt(variance(g.values)))]) });
  // Flag groups that don't look normal, for tests that assume normal data
  function normalNotes(gs, alt) {
    const off = gs.filter(g => { const ad = andersonDarling(g.values); return ad && ad.p <= 0.05; }).map(g => g.name);
    return off.length ? [`${off.length === 1 && gs.length > 1 ? off[0] + ' doesn’t' : gs.length > 1 ? off.join(', ') + ' don’t' : 'Your data doesn’t'} look normal (Anderson-Darling p of 0.05 or below). ${alt}`] : [];
  }
  function groupsFor(d, min, max) {
    const g = parseGroups(d.data);
    if (!g || !g.groups.length) return { error: 'No numbers found. Check the data is laid out as described above.' };
    if (g.groups.length < min) return { error: `This test needs ${max === min ? 'exactly ' + min : 'at least ' + min} groups, each with at least 2 values, and found ${g.groups.length}.` };
    if (max && g.groups.length > max) return { error: `This test compares exactly ${max} groups, and found ${g.groups.length}. Go back and choose the route for more groups.` };
    const notes = [];
    if (g.single.length) notes.push(`Left out ${g.single.join(', ')}, which ${g.single.length === 1 ? 'has' : 'have'} fewer than 2 values.`);
    if (g.skipped) notes.push(`Skipped ${g.skipped} cell${g.skipped === 1 ? '' : 's'} that ${g.skipped === 1 ? 'isn’t a number' : 'aren’t numbers'}.`);
    return { gs: g.groups, notes };
  }
  // A two-sided test of one sample's mean, used by the 1-sample and paired t tests
  function tOne(v, mu) {
    const n = v.length, m = mean(v), sd = Math.sqrt(variance(v)), se = sd / Math.sqrt(n);
    if (!(se > 0)) return null;
    const t = (m - mu) / se, df = n - 1, tc = tCrit(df, alpha);
    return { n, m, sd, t, df, p: tP(Math.abs(t), df), lo: m - tc * se, hi: m + tc * se };
  }
  const LEVENE = 'Levene’s test is safer when the data isn’t normal.';

  // examples, made with a fixed random seed so they are the same every time
  function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function draw(seed, n, fn) {
    const r = rng(seed), z = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    return Array.from({ length: n }, () => fn(z, r));
  }
  const r1 = x => Math.round(x * 10) / 10;
  const wide = (names, cols) => names.join('\t') + '\n' + Array.from({ length: Math.max(...cols.map(c => c.length)) }, (_, i) => cols.map(c => c[i] !== undefined ? c[i] : '').join('\t')).join('\n');
  const logn = (seed, n, med, s, d = 0) => draw(seed, n, z => +(med * Math.exp(s * z())).toFixed(d));
  const norm = (seed, n, m, s, d = 1) => draw(seed, n, z => +Math.max(0.1, m + s * z()).toFixed(d));

  const LAYOUT = {
    one: 'One column of values, one value per row. A heading in the first row is fine.',
    two: 'Either one column of values for each group, with the group names in the first row; or two columns, a group name and a value, with one row for each measurement. You need exactly 2 groups.',
    many: 'Either one column of values for each group, with the group names in the first row; or two columns, a group name and a value, with one row for each measurement.'
  };
  // The pasted values for a transformation, with an optional constant added to each
  function shifted(d) {
    const c = oneCol(d.data);
    if (c.values.length < 3) return fail('Paste at least 3 values.');
    if (Math.min(...c.values) === Math.max(...c.values)) return fail('All the values are the same.');
    const raw = String(d.shift || '').trim(), k = raw ? num(raw) : 0;
    if (!isFinite(k)) return fail('The constant to add must be a number.');
    return { v: c.values.map(x => x + k), label: k ? (k > 0 ? ' + ' : ' − ') + fmt(Math.abs(k)) : '', notes: k ? [`Added ${fmt(k)} to every value before transforming. Remember to take it off again when you back-transform.`] : [] };
  }
  // Check whether a transformation has made the data normal, and offer the transformed values
  function transformed(v, tf, stats, notes) {
    const tv = v.map(tf), before = andersonDarling(v), after = andersonDarling(tv), ok = after && after.p > 0.05;
    return { sig: ok, verdict: ok ? `The transformed data looks normal (Anderson-Darling ${pText(after.p)}). Copy the transformed values and carry on with the tests for normal data, using the button on the left.`
      : `The transformed data still doesn’t look normal (Anderson-Darling ${after ? pText(after.p) : 'not available'}). Try another transformation, or go back and choose not to transform and use a test that doesn’t need normal data.`,
      stats: [['Values', v.length]].concat(stats, [['Anderson-Darling p before', before ? fp(before.p) : '–'], ['Anderson-Darling p after', after ? fp(after.p) : '–']]),
      notes, copy: tv.map(x => +x.toPrecision(6)).join('\n'), copyLabel: 'Copy transformed values' };
  }
  const RUN = {
    t1: { layout: LAYOUT.one, target: 'Target mean', example: () => ({ data: 'Minutes to triage\n' + norm(11, 30, 17, 5).join('\n'), target: '15' }),
      run(d, n) {
        const c = oneCol(d.data), mu = num(d.target);
        if (c.values.length < 2) return fail('Paste at least 2 values.');
        if (!isFinite(mu)) return fail('Enter the target mean to compare with.');
        const r = tOne(c.values, mu); if (!r) return fail('All the values are the same, so there is no spread to test.');
        return Object.assign(decide(r.p, n), { stats: [['Values', r.n], ['Mean', fmt(r.m)], ['Standard deviation', fmt(r.sd)], ['Target', fmt(mu)], ['t', fmt(r.t)], ['Degrees of freedom', r.df], [conf() + ' confidence interval for the mean', fmt(r.lo) + ' to ' + fmt(r.hi)], ['p-value', fp(r.p)]],
          notes: normalNotes([{ name: c.name, values: c.values }], 'With fewer than about 30 values, consider the 1-sample sign test instead.') });
      } },
    sign: { layout: LAYOUT.one, target: 'Target median', example: () => ({ data: 'Weeks waited\n' + logn(12, 25, 7.5, 0.5, 1).join('\n'), target: '6' }),
      run(d, n) {
        const c = oneCol(d.data), m0 = num(d.target);
        if (c.values.length < 2) return fail('Paste at least 2 values.');
        if (!isFinite(m0)) return fail('Enter the target median to compare with.');
        const above = c.values.filter(x => x > m0).length, below = c.values.filter(x => x < m0).length, N = above + below;
        if (!N) return fail('Every value equals the target, so there is nothing to test.');
        const k = Math.min(above, below), p = Math.min(1, 2 * (k >= N ? 1 : ibeta(0.5, N - k, k + 1)));
        return Object.assign(decide(p, n), { stats: [['Values', c.values.length], ['Median', fmt(median(c.values))], ['Target', fmt(m0)], ['Above the target', above], ['Below the target', below], ['Equal to the target (left out)', c.values.length - N], ['p-value (exact)', fp(p)]], notes: [] });
      } },
    t2: { layout: LAYOUT.two, choice: { key: 'method', label: 'Spread', options: [['welch', 'Don’t assume equal spread (Welch’s, safer)'], ['pooled', 'Assume equal spread (pooled)']] },
      example: () => ({ data: wide(['Ward A', 'Ward B'], [norm(21, 25, 5.2, 1.5), norm(22, 22, 6.4, 1.6)]) }),
      run(d, n) {
        const g = groupsFor(d, 2, 2); if (g.error) return g;
        const [a, b] = g.gs.map(x => x.values), na = a.length, nb = b.length, va = variance(a), vb = variance(b);
        let se, df;
        if (d.method === 'pooled') { se = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2) * (1 / na + 1 / nb)); df = na + nb - 2; }
        else { se = Math.sqrt(va / na + vb / nb); df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1)); }
        if (!(se > 0)) return fail('Neither group varies, so there is no spread to test against.');
        const diff = mean(a) - mean(b), t = diff / se, p = tP(Math.abs(t), df), tc = tCrit(df, alpha);
        const notes = g.notes.concat(normalNotes(g.gs, 'With small groups, consider the Mann-Whitney test instead.'));
        if (d.method === 'pooled' && Math.max(va, vb) > 4 * Math.min(va, vb)) notes.push('One group is much more spread out than the other, so the version that doesn’t assume equal spread is safer.');
        return Object.assign(decide(p, n), { stats: [[`Difference in means (${g.gs[0].name} − ${g.gs[1].name})`, fmt(diff)], [conf() + ' confidence interval for the difference', fmt(diff - tc * se) + ' to ' + fmt(diff + tc * se)], ['t', fmt(t)], ['Degrees of freedom', fmt(df, 1)], ['p-value', fp(p)]],
          table: groupTable(g.gs), notes });
      } },
    tPaired: { layout: 'Two columns, such as before and after, with one row for each person or thing measured twice. Headings in the first row are fine.',
      example: () => ({ data: 'Before\tAfter\n' + draw(31, 20, z => { const b = Math.min(10, Math.max(1, Math.round(6.5 + 1.5 * z()))); return b + '\t' + Math.min(10, Math.max(0, Math.round(b - 1.3 + z()))); }).join('\n') }),
      run(d, n) {
        const c = parseCols(d.data); if (!c) return fail('No numbers found.');
        const cols = c.numeric.map((x, i) => x ? i : -1).filter(i => i >= 0);
        if (cols.length < 2) return fail('Paste two columns of numbers, one row for each pair.');
        const [i, j] = cols, pairs = c.rows.map(r => [c.n(r[i]), c.n(r[j])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
        if (pairs.length < 2) return fail('Paste at least 2 complete pairs.');
        const diffs = pairs.map(p => p[1] - p[0]), r = tOne(diffs, 0);
        if (!r) return fail('Every pair changes by the same amount, so there is no spread to test.');
        const notes = normalNotes([{ name: '', values: diffs }], 'Treat the result with caution, especially with fewer than about 30 pairs.').map(s => s.replace('Your data doesn’t', 'The differences don’t'));
        const dropped = c.rows.length - pairs.length;
        if (dropped) notes.unshift(`Left out ${dropped} row${dropped === 1 ? '' : 's'} without two numbers.`);
        return Object.assign(decide(r.p, n), { stats: [['Pairs', r.n], [`Mean of ${c.names[i]}`, fmt(mean(pairs.map(p => p[0])))], [`Mean of ${c.names[j]}`, fmt(mean(pairs.map(p => p[1])))], [`Mean difference (${c.names[j]} − ${c.names[i]})`, fmt(r.m)], [conf() + ' confidence interval for the difference', fmt(r.lo) + ' to ' + fmt(r.hi)], ['t', fmt(r.t)], ['Degrees of freedom', r.df], ['p-value', fp(r.p)]], notes });
      } },
    var2: { layout: LAYOUT.two, example: () => ({ data: wide(['Site A', 'Site B'], [norm(41, 20, 62, 7, 0), norm(42, 20, 60, 16, 0)]) }),
      run(d, n) {
        const g = groupsFor(d, 2, 2); if (g.error) return g;
        const [a, b] = g.gs.map(x => x.values), va = variance(a), vb = variance(b);
        if (!(vb > 0) || !(va > 0)) return fail('Both groups need to vary to compare their spread.');
        const F = va / vb, d1 = a.length - 1, d2 = b.length - 1, up = fP(F, d1, d2), p = Math.min(1, 2 * Math.min(up, 1 - up));
        return Object.assign(decide(p, n), { stats: [[`Ratio of variances (${g.gs[0].name} ÷ ${g.gs[1].name})`, fmt(F)], ['Degrees of freedom', d1 + ' and ' + d2], ['p-value', fp(p)]],
          table: groupTable(g.gs), notes: g.notes.concat(normalNotes(g.gs, LEVENE)) });
      } },
    anova1: { layout: LAYOUT.many, example: () => ({ data: wide(['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4'], [norm(51, 20, 5.0, 1.4), norm(52, 20, 5.4, 1.4), norm(53, 20, 6.3, 1.4), norm(54, 20, 5.1, 1.4)]) }),
      run(d, n) {
        const g = groupsFor(d, 2); if (g.error) return g;
        const r = oneWay(g.gs.map(x => x.values)); if (!isFinite(r.F)) return fail('None of the groups vary, so there is no spread to test against.');
        const notes = g.notes.concat(normalNotes(g.gs, 'Consider the Kruskal-Wallis test instead.'));
        const sds = g.gs.map(x => Math.sqrt(variance(x.values)));
        if (Math.max(...sds) > 2 * Math.min(...sds)) notes.push('Some groups are much more spread out than others, so Welch’s ANOVA (in the ANOVA tool) is safer.');
        if (r.p < alpha) notes.push('Use the ANOVA tool to see which groups differ, with pairwise comparisons.');
        return Object.assign(decide(r.p, n), { stats: [['Groups', r.k], ['Values', r.N], ['F', fmt(r.F)], ['Degrees of freedom', r.dfb + ' and ' + r.dfw], ['Share of the variation explained by the groups (η²)', fmt(r.eta2 * 100, 1) + '%'], ['p-value', fp(r.p)]],
          table: groupTable(g.gs), notes });
      } },
    bartlett: { layout: LAYOUT.many, example: () => ({ data: wide(['Lab 1', 'Lab 2', 'Lab 3'], [norm(61, 18, 55, 6, 0), norm(62, 18, 56, 9, 0), norm(63, 18, 54, 15, 0)]) }),
      run(d, n) {
        const g = groupsFor(d, 2); if (g.error) return g;
        const vs = g.gs.map(x => variance(x.values)), ns = g.gs.map(x => x.values.length), k = vs.length, N = sum(ns);
        if (vs.some(v => !(v > 0))) return fail('Every group needs to vary for Bartlett’s test. ' + LEVENE);
        const sp = sum(vs.map((v, i) => (ns[i] - 1) * v)) / (N - k);
        const X2 = ((N - k) * Math.log(sp) - sum(vs.map((v, i) => (ns[i] - 1) * Math.log(v)))) / (1 + (sum(ns.map(m => 1 / (m - 1))) - 1 / (N - k)) / (3 * (k - 1)));
        const p = chiP(X2, k - 1);
        return Object.assign(decide(p, n), { stats: [['Groups', k], ['Chi-squared', fmt(X2)], ['Degrees of freedom', k - 1], ['p-value', fp(p)]],
          table: groupTable(g.gs), notes: g.notes.concat(normalNotes(g.gs, LEVENE)) });
      } },
    anova2: { layout: 'Three columns: the first factor (such as ward), the second factor (such as day of the week) and the value, with one row for each measurement. Headings in the first row are fine.',
      example: () => ({ data: 'Ward\tDay\tLength of stay\n' + [].concat(...['A', 'B', 'C'].map((w, i) => [].concat(...['Weekday', 'Weekend'].map((day, j) => norm(71 + i * 2 + j, 8, 5 + 0.6 * i + 0.8 * j, 1.2).map(v => `Ward ${w}\t${day}\t${v}`))))).join('\n') }),
      run(d, n) {
        const c = parseCols(d.data); if (!c || c.ncol < 3) return fail('Paste three columns: the first factor, the second factor and the value.');
        const vc = c.ncol - 1, data = c.rows.filter(r => r[0] && r[1] && isFinite(c.n(r[vc])));
        if (!data.length) return fail('No values found in the last column.');
        const LA = [...new Set(data.map(r => r[0]))], LB = [...new Set(data.map(r => r[1]))];
        if (LA.length < 2 || LB.length < 2) return fail('Each factor needs at least 2 levels.');
        if (LA.length * LB.length > 60) return fail('There are too many combinations of levels. Check the first two columns hold the factors.');
        const counts = LA.map(a => LB.map(b => data.filter(r => r[0] === a && r[1] === b).length));
        if (counts.some(r => r.some(x => !x))) return fail('Every combination of the two factors needs at least one value.');
        const dfE = data.length - LA.length * LB.length;
        if (dfE < 1) return fail('Some combinations of the two factors need more than one value, to measure the variation within them.');
        const code = (L, i) => L.slice(0, -1).map((_, j) => i === L.length - 1 ? -1 : i === j ? 1 : 0);
        const y = data.map(r => c.n(r[vc])), parts = data.map(r => {
          const A = code(LA, LA.indexOf(r[0])), B = code(LB, LB.indexOf(r[1]));
          return { A, B, AB: [].concat(...A.map(x => B.map(z => x * z))) };
        });
        const fit = terms => ols(parts.map(o => [1].concat(...terms.map(t => o[t]))), y);
        const full = fit(['A', 'B', 'AB']); if (!full) return fail('The model couldn’t be fitted to this data.');
        const mse = full.sse / dfE;
        if (!(mse > 0)) return fail('The values don’t vary within the combinations, so there is nothing to test against.');
        const nameA = c.names[0], nameB = c.names[1];
        const terms = [['A', nameA, LA.length - 1], ['B', nameB, LB.length - 1], ['AB', `${nameA} × ${nameB} interaction`, (LA.length - 1) * (LB.length - 1)]].map(([t, label, df]) => {
          const red = fit(['A', 'B', 'AB'].filter(x => x !== t)), ss = Math.max(0, red.sse - full.sse), F = ss / df / mse;
          return { label, df, ss, F, p: fP(F, df, dfE) };
        });
        const sig = terms.filter(t => t.p < alpha);
        const verdict = sig.length ? `Significant at ${alpha}: ${sig.map(t => `${t.label} (${pText(t.p)})`).join(', ')}. ${sig.some(t => t.label.includes('interaction')) ? 'The effect of one factor depends on the other, so look at the combinations together.' : (sig.length > 1 ? 'Each of these factors changes' : 'This factor changes') + ' the mean.'}`
          : `None of the factors, nor their interaction, has a p-value below ${alpha}, so don't reject the null hypothesis. There isn't enough evidence that either factor changes the mean.`;
        const notes = Math.max(...[].concat(...counts)) !== Math.min(...[].concat(...counts)) ? ['The combinations have different numbers of values, so the sums of squares are adjusted for each other (type III).'] : [];
        return { sig: sig.length > 0, verdict, stats: [['Values', data.length], ['Levels', `${LA.length} of ${nameA}, ${LB.length} of ${nameB}`]],
          table: { head: ['Source', 'Degrees of freedom', 'Sum of squares', 'Mean square', 'F', 'p-value'], rows: terms.map(t => [t.label, t.df, fmt(t.ss), fmt(t.ss / t.df), fmt(t.F), fp(t.p)]).concat([['Error', dfE, fmt(full.sse), fmt(mse), '', '']]) },
          notes };
      } },
    boxcox: { layout: 'One column of values, all above zero. If your data is in groups, paste all the values together: the same transformation is then used for every group.', transform: true,
      example: () => ({ data: 'Wait (minutes)\n' + logn(81, 40, 45, 0.6).join('\n') }),
      run(d) {
        const c = oneCol(d.data), v = c.values;
        if (v.length < 3) return fail('Paste at least 3 values.');
        if (v.some(x => !(x > 0))) return fail('Every value must be above zero for a Box-Cox transformation. Add a constant to all the values first, or choose not to transform.');
        if (Math.min(...v) === Math.max(...v)) return fail('All the values are the same.');
        const slog = sum(v.map(Math.log));
        const ll = lam => { const t = v.map(x => Math.abs(lam) < 1e-9 ? Math.log(x) : (x ** lam - 1) / lam), m = mean(t); return -v.length / 2 * Math.log(sum(t.map(x => (x - m) ** 2)) / v.length) + (lam - 1) * slog; };
        let best = 1, bestLL = -Infinity;
        for (let lam = -5; lam <= 5.0001; lam += 0.01) { const L = ll(lam); if (L > bestLL) { bestLL = L; best = lam; } }
        const lam = Math.max(-2, Math.min(2, Math.round(best * 2) / 2));
        const tf = x => lam === 0 ? Math.log(x) : x ** lam;
        const NAMES = { '-2': '1 ÷ Y²', '-1': '1 ÷ Y (the reciprocal)', '-0.5': '1 ÷ √Y', 0: 'the natural log, ln(Y)', 0.5: '√Y (the square root)', 1: 'Y (no change)', 1.5: 'Y^1.5', 2: 'Y² (the square)' };
        return transformed(v, tf, [['Best λ (lambda)', fmt(best, 2)], ['Rounded λ used', fmt(lam, 1)], ['Transformation', NAMES[lam]]],
          lam < 0 ? ['With a negative λ the order of the values is reversed, so the highest original value becomes the lowest. Keep this in mind when you read the results.'] : []);
      } },
    logT: { layout: 'One column of values, all above zero. If your data is in groups, paste all the values together: the same transformation is then used for every group.', transform: true,
      choice: { key: 'base', label: 'Logarithm', options: [['ln', 'Natural log, ln(Y)'], ['log10', 'Log base 10, log₁₀(Y)']] },
      shift: true, example: () => ({ data: 'Cost of admission (£)\n' + logn(161, 40, 2400, 0.7).join('\n') }),
      run(d) {
        const c = shifted(d); if (c.error) return c;
        if (c.v.some(x => !(x > 0))) return fail('Every value must be above zero to take a log. Add the same constant to every value first, using “Add to every value first”, or try a square root.');
        const ten = d.base === 'log10';
        return transformed(c.v, ten ? Math.log10 : Math.log, [['Transformation', ten ? 'log base 10, log₁₀(Y' + c.label + ')' : 'the natural log, ln(Y' + c.label + ')']], c.notes);
      } },
    sqrtT: { layout: 'One column of values, none below zero. If your data is in groups, paste all the values together: the same transformation is then used for every group.', transform: true,
      shift: true, example: () => ({ data: 'Incidents reported each week\n' + draw(171, 40, (z, r) => { let k = 0, t = 0; const lam = 4 * Math.exp(0.6 * z()); while ((t -= Math.log(r() || 1e-9) / lam) < 1) k++; return k; }).join('\n') }),
      run(d) {
        const c = shifted(d); if (c.error) return c;
        if (c.v.some(x => x < 0)) return fail('No value can be below zero to take a square root. Add the same constant to every value first, using “Add to every value first”.');
        return transformed(c.v, Math.sqrt, [['Transformation', 'the square root, √(Y' + c.label + ')']], c.notes);
      } },
    mann: { layout: LAYOUT.two, example: () => ({ data: wide(['Site A', 'Site B'], [logn(91, 24, 180, 0.5), logn(92, 26, 235, 0.5)]) }),
      run(d, n) {
        const g = groupsFor(d, 2, 2); if (g.error) return g;
        const [a, b] = g.gs.map(x => x.values), na = a.length, nb = b.length, N = na + nb, both = a.concat(b), rk = { r: ranks(both), ties: tiesT(both) };
        const U = sum(rk.r.slice(0, na)) - na * (na + 1) / 2, mu = na * nb / 2;
        const sd = Math.sqrt(na * nb / 12 * ((N + 1) - rk.ties / (N * (N - 1))));
        if (!(sd > 0)) return fail('All the values are the same, so there is nothing to compare.');
        const z = Math.max(0, Math.abs(U - mu) - 0.5) / sd, p = zP(z);
        const notes = g.notes.slice();
        if (Math.min(na, nb) < 10) notes.push('With fewer than 10 values in a group, the p-value from the normal approximation is only a guide.');
        return Object.assign(decide(p, n), { stats: [[`Difference in medians (${g.gs[0].name} − ${g.gs[1].name})`, fmt(median(a) - median(b))], ['U', fmt(U)], ['z (with a correction for ties)', fmt(z)], ['p-value', fp(p)]],
          table: groupTable(g.gs, true), notes });
      } },
    levene: { layout: LAYOUT.many, example: () => ({ data: wide(['Ward 1', 'Ward 2'], [logn(101, 22, 3, 0.35, 1), logn(102, 22, 3.2, 0.8, 1)]) }),
      run(d, n) {
        const g = groupsFor(d, 2); if (g.error) return g;
        const r = oneWay(g.gs.map(x => { const m = median(x.values); return x.values.map(v => Math.abs(v - m)); }));
        if (!isFinite(r.F)) return fail('The groups don’t vary enough to compare their spread.');
        return Object.assign(decide(r.p, n), { stats: [['Groups', r.k], ['W (Levene’s statistic, using medians)', fmt(r.F)], ['Degrees of freedom', r.dfb + ' and ' + r.dfw], ['p-value', fp(r.p)]],
          table: groupTable(g.gs, true), notes: g.notes });
      } },
    kruskal: { layout: LAYOUT.many, example: () => ({ data: wide(['Ward 1', 'Ward 2', 'Ward 3'], [logn(111, 18, 4, 0.45, 1), logn(112, 18, 4.5, 0.45, 1), logn(113, 18, 6.2, 0.45, 1)]) }),
      run(d, n) {
        const g = groupsFor(d, 2); if (g.error) return g;
        const all = [].concat(...g.gs.map(x => x.values)), N = all.length, rk = { r: ranks(all), ties: tiesT(all) };
        let at = 0; const R = g.gs.map(x => { const s = sum(rk.r.slice(at, at + x.values.length)); at += x.values.length; return s; });
        const corr = 1 - rk.ties / (N ** 3 - N); if (!(corr > 0)) return fail('All the values are the same, so there is nothing to compare.');
        const H = (12 / (N * (N + 1)) * sum(R.map((s, i) => s * s / g.gs[i].values.length)) - 3 * (N + 1)) / corr, df = g.gs.length - 1, p = chiP(H, df);
        const notes = g.notes.slice();
        if (g.gs.some(x => x.values.length < 5)) notes.push('With fewer than 5 values in a group, the p-value is only a guide.');
        const t = groupTable(g.gs, true); t.head.push('Mean rank'); t.rows.forEach((row, i) => row.push(fmt(R[i] / g.gs[i].values.length, 1)));
        return Object.assign(decide(H > 0 ? p : 1, n), { stats: [['Groups', g.gs.length], ['Values', N], ['H (adjusted for ties)', fmt(H)], ['Degrees of freedom', df], ['p-value', fp(H > 0 ? p : 1)]], table: t, notes });
      } },
    mood: { layout: LAYOUT.many, example: () => ({ data: wide(['Site A', 'Site B', 'Site C'], [logn(121, 20, 20, 0.4).concat([118]), logn(122, 20, 22, 0.4).concat([150, 96]), logn(123, 20, 30, 0.4)]) }),
      run(d, n) {
        const g = groupsFor(d, 2); if (g.error) return g;
        const M = median([].concat(...g.gs.map(x => x.values)));
        const obs = [g.gs.map(x => x.values.filter(v => v > M).length), g.gs.map(x => x.values.filter(v => v <= M).length)];
        if (!sum(obs[0])) return fail('No values are above the overall median, so there is nothing to compare.');
        const r = chiTable(obs), notes = g.notes.slice();
        if (r.minE < 5) notes.push('Some groups are small (an expected count below 5), so the p-value is only a guide.');
        const t = groupTable(g.gs, true); t.head.push('Above the overall median', 'At or below'); t.rows.forEach((row, i) => row.push(obs[0][i], obs[1][i]));
        return Object.assign(decide(r.p, n), { stats: [['Overall median', fmt(M)], ['Chi-squared', fmt(r.X2)], ['Degrees of freedom', r.df], ['p-value', fp(r.p)]], table: t, notes });
      } },
    prop1: { fields: [['x', 'Number with the outcome'], ['n', 'Total number'], ['p0', 'Target or standard (%)']], example: () => ({ x: '1858', n: '2000', p0: '95' }),
      run(d, n) {
        const x = num(d.x), N = num(d.n); let p0 = num(d.p0);
        if (!(N > 0) || !(x >= 0) || x > N) return fail('Enter the number with the outcome and the total, with the number no more than the total.');
        if (p0 > 1) p0 /= 100;
        if (!(p0 > 0 && p0 < 1)) return fail('Enter the target as a percentage between 0 and 100.');
        const ph = x / N, z = (ph - p0) / Math.sqrt(p0 * (1 - p0) / N), p = zP(z), h = zCrit(alpha) * Math.sqrt(ph * (1 - ph) / N);
        const notes = N * p0 < 5 || N * (1 - p0) < 5 ? ['You would expect fewer than 5 of one outcome, so the normal approximation used here is only a guide.'] : [];
        return Object.assign(decide(p, n), { stats: [['Proportion', fmt(ph * 100, 2) + '%'], ['Target', fmt(p0 * 100, 2) + '%'], [conf() + ' confidence interval', fmt(Math.max(0, ph - h) * 100, 2) + '% to ' + fmt(Math.min(1, ph + h) * 100, 2) + '%'], ['z', fmt(z)], ['p-value', fp(p)]], notes });
      } },
    prop2: { fields: [['x1', 'Group 1: number with the outcome'], ['n1', 'Group 1: total'], ['x2', 'Group 2: number with the outcome'], ['n2', 'Group 2: total']], example: () => ({ x1: '18', n1: '120', x2: '9', n2: '130' }),
      run(d, n) {
        const [x1, n1, x2, n2] = ['x1', 'n1', 'x2', 'n2'].map(k => num(d[k]));
        if (!(n1 > 0 && n2 > 0 && x1 >= 0 && x2 >= 0 && x1 <= n1 && x2 <= n2)) return fail('Enter the number with the outcome and the total for both groups, with each number no more than its total.');
        const p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2);
        if (!(pp > 0 && pp < 1)) return fail('Every item has the same outcome, so there is nothing to compare.');
        const z = (p1 - p2) / Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)), p = zP(z), h = zCrit(alpha) * Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
        const notes = [n1 * pp, n1 * (1 - pp), n2 * pp, n2 * (1 - pp)].some(e => e < 5) ? ['You would expect fewer than 5 of an outcome in a group, so the normal approximation used here is only a guide.'] : [];
        return Object.assign(decide(p, n), { stats: [['Group 1 proportion', fmt(p1 * 100, 2) + '%'], ['Group 2 proportion', fmt(p2 * 100, 2) + '%'], ['Difference (1 − 2)', fmt((p1 - p2) * 100, 2) + ' percentage points'], [conf() + ' confidence interval for the difference', fmt((p1 - p2 - h) * 100, 2) + ' to ' + fmt((p1 - p2 + h) * 100, 2) + ' points'], ['z', fmt(z)], ['p-value', fp(p)]], notes });
      } },
    chi: { layout: 'A table of counts, as you would lay it out in Excel: the categories of one factor down the side, the other across the top, and headings in the first row and column.',
      example: () => ({ data: '\tOn time\tLate\nWard A\t86\t14\nWard B\t71\t29\nWard C\t90\t12\nWard D\t64\t31' }),
      run(d, n) {
        const t = parseTable(d.data); if (!t) return fail('No counts found.');
        const keepR = t.counts.map(r => sum(r) > 0), keepC = t.cols.map((_, j) => sum(t.counts.map(r => r[j])) > 0);
        const obs = t.counts.filter((_, i) => keepR[i]).map(r => r.filter((_, j) => keepC[j]));
        const rows = t.rows.filter((_, i) => keepR[i]), cols = t.cols.filter((_, j) => keepC[j]);
        if (obs.length < 2 || cols.length < 2) return fail('The table needs at least 2 rows and 2 columns of counts.');
        const r = chiTable(obs), notes = [];
        if (t.bad) notes.push(`Treated ${t.bad} cell${t.bad === 1 ? '' : 's'} that ${t.bad === 1 ? 'isn’t a count' : 'aren’t counts'} as 0.`);
        if (keepR.includes(false) || keepC.includes(false)) notes.push('Left out rows or columns with no counts.');
        if (r.lowE) notes.push(`${r.lowE} of the ${r.cells} cells ${r.lowE === 1 ? 'has' : 'have'} an expected count below 5, so the p-value is only a guide. Try combining small categories, or use the chi-squared tool for Fisher’s exact test on a 2×2 table.`);
        return Object.assign(decide(r.p, n), { stats: [['Total count', fmt(r.N)], ['Chi-squared', fmt(r.X2)], ['Degrees of freedom', r.df], ['Smallest expected count', fmt(r.minE, 1)], ['p-value', fp(r.p)]],
          table: { caption: 'Counts (expected counts if there were no relationship in brackets)', head: [''].concat(cols), rows: obs.map((row, i) => [rows[i]].concat(row.map((o, j) => `${fmt(o)} (${fmt(r.E[i][j], 1)})`))) }, notes });
      } },
    slr: { layout: 'Two columns: the input (X) first, then the output (Y), with one row for each observation. Headings in the first row are fine.',
      example: () => ({ data: 'Age\tLength of stay (days)\n' + draw(131, 40, (z, r) => { const age = Math.round(20 + 70 * r()); return age + '\t' + r1(Math.max(0.5, 1.5 + 0.06 * age + 1.2 * z())); }).join('\n') }),
      run(d, n) {
        const c = parseCols(d.data); if (!c || c.ncol < 2) return fail('Paste two columns: the input (X) then the output (Y).');
        const pts = c.rows.map(r => [c.n(r[0]), c.n(r[1])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
        if (pts.length < 3) return fail('Paste at least 3 rows with a number in both columns.');
        const f = ols(pts.map(p => [1, p[0]]), pts.map(p => p[1]));
        if (!f) return fail('The input (X) doesn’t vary, so a line can’t be fitted.');
        const ym = mean(pts.map(p => p[1])), sst = sum(pts.map(p => (p[1] - ym) ** 2)), mse = f.sse / f.df;
        const se = Math.sqrt(mse * f.inv[1][1]), t = se > 0 ? f.b[1] / se : Infinity, p = se > 0 ? tP(Math.abs(t), f.df) : 0, tc = tCrit(f.df, alpha);
        const notes = c.rows.length > pts.length ? [`Left out ${c.rows.length - pts.length} rows without two numbers.`] : [];
        return Object.assign(decide(p, n), { stats: [['Observations', pts.length], ['Equation', `${c.names[1]} = ${fmt(f.b[0])} ${f.b[1] < 0 ? '−' : '+'} ${fmt(Math.abs(f.b[1]))} × ${c.names[0]}`], ['Slope', fmt(f.b[1])], [conf() + ' confidence interval for the slope', fmt(f.b[1] - tc * se) + ' to ' + fmt(f.b[1] + tc * se)], ['R² (share of the variation explained)', sst > 0 ? fmt((1 - f.sse / sst) * 100, 1) + '%' : '–'], ['t', fmt(t)], ['Degrees of freedom', f.df], ['p-value for the slope', fp(p)]],
          notes: notes.concat(['Use the scatter plot tool to check the relationship looks like a straight line.']) });
      } },
    mlr: { layout: 'One column for each input (X), then the output (Y) in the last column, with one row for each observation and headings in the first row.',
      example: () => ({ data: 'Staff on shift\tReferrals\tWait (minutes)\n' + draw(141, 30, (z, r) => { const s = 8 + Math.floor(7 * r()), ref = 40 + Math.round(50 * r()); return s + '\t' + ref + '\t' + Math.round(Math.max(5, 60 - 4 * s + 0.8 * ref + 8 * z())); }).join('\n') }),
      run(d, n) {
        const c = parseCols(d.data); if (!c || c.ncol < 3) return fail('Paste at least two input columns and the output in the last column.');
        const k = c.ncol - 1, data = c.rows.map(r => r.slice(0, c.ncol).map(c.n)).filter(r => r.length === c.ncol && r.every(isFinite));
        if (data.length < k + 2) return fail(`You need at least ${k + 2} complete rows for ${k} inputs.`);
        const y = data.map(r => r[k]), f = ols(data.map(r => [1].concat(r.slice(0, k))), y);
        if (!f) return fail('Some inputs are exact copies or combinations of each other, so the model can’t be fitted. Remove one of them.');
        const mse = f.sse / f.df, ym = mean(y), sst = sum(y.map(v => (v - ym) ** 2));
        const F = ((sst - f.sse) / k) / mse, pF = mse > 0 ? fP(F, k, f.df) : 0;
        const terms = c.names.slice(0, k).map((name, i) => { const se = Math.sqrt(mse * f.inv[i + 1][i + 1]), t = f.b[i + 1] / se; return { name, b: f.b[i + 1], se, t, p: se > 0 ? tP(Math.abs(t), f.df) : 0 }; });
        const sig = terms.filter(t => t.p < alpha);
        const verdict = pF < alpha ? `The model as a whole is significant (${pText(pF)}). ${sig.length ? `Inputs related to the output once the others are taken into account: ${sig.map(t => t.name).join(', ')}.` : 'But no single input stands out once the others are taken into account, which can happen when the inputs are closely related.'}`
          : `${pText(pF)} for the model as a whole is not below ${alpha}, so there isn't enough evidence that the inputs are related to the output.`;
        return { sig: pF < alpha, verdict, stats: [['Observations', data.length], ['R²', fmt((1 - f.sse / sst) * 100, 1) + '%'], ['Adjusted R²', fmt((1 - (f.sse / f.df) / (sst / (data.length - 1))) * 100, 1) + '%'], ['F for the whole model', fmt(F)], ['Degrees of freedom', k + ' and ' + f.df], ['p-value for the whole model', fp(pF)]],
          table: { head: ['Term', 'Coefficient', 'Standard error', 't', 'p-value', `Below ${alpha}?`], rows: [['Constant', fmt(f.b[0]), fmt(Math.sqrt(mse * f.inv[0][0])), '', '', '']].concat(terms.map(t => [t.name, fmt(t.b), fmt(t.se), fmt(t.t), fp(t.p), t.p < alpha ? 'Yes' : 'No'])) },
          notes: ['Use the multiple regression tool to check the residuals and try predictions.'] };
      } },
    logistic: { layout: 'One column for each measured input (X), then the outcome (Y) in the last column, such as Yes and No or 1 and 0. One row for each patient or item, with headings in the first row.',
      example: () => ({ data: 'Age\tLength of stay\tReadmitted\n' + draw(151, 120, (z, r) => { const age = 30 + Math.round(60 * r()), los = 1 + Math.round(13 * r()), pr = 1 / (1 + Math.exp(-(-5 + 0.045 * age + 0.15 * los))); return age + '\t' + los + '\t' + (r() < pr ? 'Yes' : 'No'); }).join('\n') }),
      run(d, n) {
        const c = parseCols(d.data); if (!c || c.ncol < 2) return fail('Paste at least one input column and the outcome in the last column.');
        const k = c.ncol - 1, data = c.rows.filter(r => (r[k] || '') !== '' && r.slice(0, k).every(v => isFinite(c.n(v))));
        const cats = [...new Set(data.map(r => r[k].toLowerCase()))];
        if (cats.length !== 2) return fail(`The outcome in the last column needs exactly 2 categories, such as Yes and No, and has ${cats.length}.`);
        const count = cat => data.filter(r => r[k].toLowerCase() === cat).length;
        const event = cats.includes('1') && cats.includes('0') ? '1' : cats.find(x => /^(yes|y|true)$/.test(x)) || (count(cats[0]) === count(cats[1]) ? cats.slice().sort()[1] : cats.sort((a, b) => count(a) - count(b))[0]);
        const label = data.find(r => r[k].toLowerCase() === event)[k];
        if (data.length < k + 2) return fail('Paste more rows.');
        const X = data.map(r => [1].concat(r.slice(0, k).map(c.n))), y = data.map(r => r[k].toLowerCase() === event ? 1 : 0);
        const f = logit(X, y); if (!f) return fail('Some inputs are exact copies or combinations of each other, or don’t vary, so the model can’t be fitted.');
        const pb = mean(y), ll0 = data.length * (pb * Math.log(pb) + (1 - pb) * Math.log(1 - pb)), LR = 2 * (f.ll - ll0), pLR = chiP(LR, k);
        const terms = c.names.slice(0, k).map((name, i) => { const b = f.b[i + 1], se = f.se[i + 1], z = b / se; return { name, b, se, z, p: zP(z) }; });
        const sig = terms.filter(t => t.p < alpha), zc = zCrit(alpha);
        const notes = [];
        if (!f.converged || f.b.some(b => Math.abs(b) > 20)) notes.push('The model didn’t settle, which usually means an input separates the two outcomes perfectly. Treat the results with caution.');
        if (Math.min(sum(y), y.length - sum(y)) < 10 * k) notes.push(`There are fewer than ${10 * k} of the rarer outcome (10 for each input), so the results may be unreliable.`);
        const verdict = pLR < alpha ? `The model is significant (likelihood ratio ${pText(pLR)}). ${sig.length ? `Inputs that change the chance of “${label}”: ${sig.map(t => `${t.name} (odds × ${fmt(Math.exp(t.b))} for each unit)`).join(', ')}.` : 'But no single input stands out once the others are taken into account.'}`
          : `${pText(pLR)} for the model is not below ${alpha}, so don't reject the null hypothesis. There isn't enough evidence that the inputs change the chance of “${label}”.`;
        return { sig: pLR < alpha, verdict, stats: [['Observations', data.length], ['Modelling the chance of', `“${label}” (${sum(y)} of ${y.length})`], ['Likelihood ratio chi-squared', fmt(LR)], ['Degrees of freedom', k], ['p-value for the model', fp(pLR)]],
          table: { head: ['Term', 'Coefficient', 'Standard error', 'z', 'p-value', 'Odds ratio', conf() + ' interval for the odds ratio'], rows: [['Constant', fmt(f.b[0]), fmt(f.se[0]), '', '', '', '']].concat(terms.map(t => [t.name, fmt(t.b), fmt(t.se), fmt(t.z), fp(t.p), fmt(Math.exp(t.b)), fmt(Math.exp(t.b - zc * t.se)) + ' to ' + fmt(Math.exp(t.b + zc * t.se))])) },
          notes };
      } }
  };

  function runHTML(id, n) {
    const spec = RUN[id], d = runs[id] || (runs[id] = {});
    const field = (k, label) => `<div><label for="run-${k}">${esc(label)}</label><input type="text" inputmode="decimal" id="run-${k}" data-run="${k}" value="${esc(d[k] || '')}"></div>`;
    let body = spec.fields ? `<div class="runfields">${spec.fields.map(([k, l]) => field(k, l)).join('')}</div>`
      : `<label for="run-data">Paste from Excel or a CSV</label><p class="hint">${esc(spec.layout)}</p><textarea id="run-data" data-run="data" spellcheck="false">${esc(d.data || '')}</textarea>`;
    body += `<div class="runset">${spec.target ? field('target', spec.target) : ''}${spec.shift ? field('shift', 'Add to every value first (optional)') : ''}` +
      (spec.choice ? `<div><label for="run-${spec.choice.key}">${esc(spec.choice.label)}</label><select id="run-${spec.choice.key}" data-run="${spec.choice.key}">${spec.choice.options.map(([v, l]) => `<option value="${v}"${(d[spec.choice.key] || spec.choice.options[0][0]) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : '') +
      (spec.transform ? '' : `<div><label for="run-alpha">Significance level</label><select id="run-alpha">${[[0.05, '5% (the usual choice)'], [0.01, '1% (stricter)'], [0.1, '10% (looser)']].map(([v, l]) => `<option value="${v}"${v === alpha ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`) +
      `<div class="btns"><button type="button" data-act="runexample">Use example data</button><button type="button" data-act="runclear">Clear</button></div></div>`;
    return `<section class="runbox" aria-labelledby="run-h"><h3 id="run-h">${spec.transform ? 'Transform your data' : 'Run the ' + esc(inline(n.test)) + ' on your data'}</h3>` +
      `<p class="hint">Everything runs in your browser, so your data is never uploaded.</p>${body}<div class="runout" id="runOut" aria-live="polite"></div></section>`;
  }
  function renderRun() {
    const out = $('runOut'); lastRun = null;
    if (!out || !current || !RUN[current.id]) return;
    const id = current.id, n = current.node, spec = RUN[id], d = runs[id] || {};
    const empty = spec.fields ? spec.fields.every(([k]) => !String(d[k] || '').trim()) : !String(d.data || '').trim();
    if (empty) { out.innerHTML = `<p class="hint" style="margin:0">${spec.fields ? 'Enter your numbers' : 'Paste your data'} above, or use the example data, to ${spec.transform ? 'find the transformation' : 'run the test'}.</p>`; return; }
    let res;
    try { res = spec.run(d, n); } catch (e) { res = fail('Something went wrong with this data. Check it is laid out as described above.'); }
    if (res.error) { out.innerHTML = `<div class="warnbox">${esc(res.error)}</div>`; return; }
    lastRun = { test: n.test, res };
    const tbl = t => `<div class="tscroll"><table class="rtable">${t.caption ? `<caption>${esc(t.caption)}</caption>` : ''}<thead><tr>${t.head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((v, i) => i ? `<td>${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    out.innerHTML = `<div class="verdict${res.sig ? ' sig' : ''}">${esc(res.verdict)}</div>` +
      tbl({ head: ['Result', 'Value'], rows: res.stats }) + (res.table ? tbl(res.table) : '') +
      (res.notes || []).filter(Boolean).map(s => `<div class="warnbox">${esc(s)}</div>`).join('') +
      (res.copy ? `<div class="btns"><button type="button" data-act="runcopy">${esc(res.copyLabel)}</button></div>` : '');
  }

  // Follow the answers from the start: the steps taken and the node reached
  function walk(list) {
    const steps = [];
    let id = ROOT;
    for (const a of list) {
      const node = NODES[id], opt = pick(node, a);
      if (!opt) break;
      steps.push({ id, node, a, opt });
      id = opt.next;
    }
    return { steps, id, node: NODES[id] };
  }

  // The route to every test, for the road map
  const ROUTES = {};
  (function find(id, list) {
    const node = NODES[id];
    if (!ROUTES[id]) ROUTES[id] = list;
    (node.options || []).forEach((o, i) => find(o.next, list.concat(i)));
  })(ROOT, []);

  // ---- drawing the route ----
  function wrap(text, max) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    words.forEach(w => { if (line && (line + ' ' + w).length > max) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; });
    if (line) lines.push(line);
    return lines;
  }
  function routeSVG(r) {
    const W = 680, BW = 440, X0 = (W - BW) / 2, cx = W / 2, LH = 19, PAD = 12, GAP = 46;
    const title = els.title.value.trim();
    const boxes = [{ kind: 'start', lines: ['Start'] }];
    r.steps.forEach(s => boxes.push({ kind: 'q', lines: wrap(askOf(s.node), 44), ans: s.opt.a }));
    if (r.node.test) boxes.push({ kind: 'test', lines: wrap(r.node.test, 36) });
    else boxes.push({ kind: 'q', lines: wrap(r.node.q, 44), open: true });
    let y = title ? 62 : 24, s = '';
    if (title) wrap(title, 60).slice(0, 2).forEach((l, i) => { s += `<text x="${cx}" y="${30 + i * 22}" text-anchor="middle" font-size="18" font-weight="700" fill="${COLORS.ink}">${esc(l)}</text>`; });
    if (title && wrap(title, 60).length > 1) y += 22;
    boxes.forEach((b, i) => {
      const h = b.lines.length * LH + PAD * 2;
      const fill = b.kind === 'test' ? COLORS.test : b.kind === 'start' ? COLORS.start : COLORS.q;
      const stroke = b.kind === 'test' ? COLORS.test : b.kind === 'start' ? COLORS.line : COLORS.qStroke;
      const ink = b.kind === 'test' ? '#ffffff' : COLORS.ink;
      const bw = b.kind === 'start' ? 140 : BW, bx = cx - bw / 2;
      s += `<rect x="${bx}" y="${y}" width="${bw}" height="${h}" rx="${b.kind === 'start' ? h / 2 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="2"${b.open ? ' stroke-dasharray="6 4"' : ''}/>`;
      b.lines.forEach((l, j) => { s += `<text x="${cx}" y="${y + PAD + 14 + j * LH}" text-anchor="middle" font-size="${b.kind === 'test' ? 17 : 15}" font-weight="${b.kind === 'q' ? 600 : 700}" fill="${ink}">${esc(l)}</text>`; });
      y += h;
      if (i < boxes.length - 1) {
        const ans = b.ans, y2 = y + GAP;
        s += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y2 - 8}" stroke="${COLORS.muted}" stroke-width="2"/><path d="M${cx - 6} ${y2 - 10} L${cx} ${y2 - 1} L${cx + 6} ${y2 - 10} Z" fill="${COLORS.muted}"/>`;
        if (ans) s += `<text x="${cx + 12}" y="${y + GAP / 2 + 5}" font-size="14" font-weight="700" fill="${COLORS.qStroke}">${esc(ans)}</text>`;
        y = y2;
      }
    });
    const H = y + 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-labelledby="routeTitle"><title id="routeTitle">${esc(summaryText())}</title><rect width="${W}" height="${H}" fill="#ffffff"/>${s}</svg>`;
  }

  // ---- text ----
  function summaryText() {
    const r = walk(answers);
    const route = r.steps.map(s => `${askOf(s.node)} ${s.opt.a}.`).join(' ');
    const title = els.title.value.trim();
    const head = title ? title + '\n' : '';
    if (!r.node.test) return head + (route ? route + ' ' : '') + 'Next question: ' + r.node.q;
    const n = r.node;
    if (n.isTransform) return head + route + ` Transform the data with a ${n.test}, check it is now normal, then carry on with the tests for normal data. ${n.what}` + runText();
    return head + route + ` Suggested test: ${n.test}. ${n.what} Null hypothesis: ${n.h0} If the p-value is below 0.05, reject it: ${n.reject}` + runText();
  }
  // The result of running the test on the pasted data, if there is one
  function runText() {
    if (!lastRun) return '';
    const r = lastRun.res;
    return `\n\nResult on your data: ${r.verdict}\n` + r.stats.map(([k, v]) => `${k}: ${v}`).join('\n');
  }
  function tableRows() {
    const r = walk(answers);
    const rows = [['Step', 'Question', 'Answer']];
    r.steps.forEach((s, i) => rows.push([i + 1, askOf(s.node), s.opt.a]));
    if (r.node.test) rows.push(['Result', r.node.isTransform ? 'Transform' : 'Suggested test', r.node.test]);
    else rows.push(['Next', r.node.q, '']);
    if (lastRun) {
      rows.push(['Your data', 'Verdict', lastRun.res.verdict]);
      lastRun.res.stats.forEach(([k, v]) => rows.push(['Your data', k, v]));
    }
    return rows;
  }

  // ---- rendering ----
  function toolLinks(ids) {
    return (ids || []).map(id => `<a href="${esc(toolUrl(id))}">${esc(TOOL_NAMES[id])}</a>`).join('');
  }
  function renderAsk(r) {
    const n = r.node, stepNo = r.steps.length + 1;
    if (n.test) {
      els.ask.innerHTML = `<p class="step">Your test</p><p class="question">${esc(n.test)}</p>` +
        (n.then ? `<p class="hint">Once you have transformed the data and checked it is now normal, carry on.</p><div class="choices"><button type="button" class="option" data-then="1"><b>${esc(n.then.a)}</b><small>${esc(n.then.sub)}</small></button></div>`
          : `<p class="hint">See the result for what the test does and what to check, and paste your data there to run it. Go back or change an answer to explore other routes.</p>`);
      return;
    }
    els.ask.innerHTML = `<fieldset class="choices"><legend><span class="step">Question ${stepNo}</span><span class="question" style="display:block">${esc(n.q)}</span></legend>` +
      `<p class="hint">${esc(n.hint)}${n.link ? ` <a href="${esc(toolUrl(n.link.id))}">${esc(n.link.label)}</a>.` : ''}</p>` +
      n.options.map((o, i) => `<button type="button" class="option" data-opt="${i}"><b>${esc(o.a)}</b><small>${esc(o.sub)}</small></button>`).join('') + `</fieldset>`;
  }
  function renderRoute(r) {
    els.route.innerHTML = r.steps.length
      ? r.steps.map((s, i) => `<li><span><span class="q">${esc(askOf(s.node))}</span><span class="a">${esc(s.opt.a)}</span></span><button type="button" class="link" data-change="${i}" aria-label="Change your answer to: ${esc(askOf(s.node))}">Change</button></li>`).join('')
      : `<li><span class="hint" style="margin:0">None yet. Start with the first question.</span></li>`;
    els.back.disabled = !answers.length;
  }
  function renderResult(r) {
    const n = r.node;
    lastRun = null;
    const chart = `<div class="chartwrap" id="chart">${routeSVG(r)}</div>`;
    if (!n.test) {
      current = r.steps.length ? r : null;
      lastRun = null;
      els.result.innerHTML = r.steps.length
        ? `<p class="summary">Keep going: <strong>${esc(n.q.replace(/\?$/, ''))}?</strong></p><p class="focuson">Your route so far. Answer the next question to reach a test.</p>${chart}`
        : `<div class="empty"><p>Answer the questions on the left to find the hypothesis test that suits your data, or try an example route.</p><button type="button" class="primary" data-act="example">Try the example</button></div>`;
      return;
    }
    current = r;
    const facts = n.isTransform ? '' : `<div class="facts"><div class="fact"><span>Null hypothesis</span><p>${esc(n.h0)}</p></div><div class="fact"><span>If p is below 0.05</span><p>Reject the null hypothesis: ${esc(n.reject)}</p></div></div>`;
    els.result.innerHTML = `
      <p class="summary">${n.isTransform ? 'Transform your data with a' : 'Use a'} <strong>${esc(inline(n.test))}</strong></p>
      <p class="focuson">${esc(n.what)}</p>
      ${n.isTransform ? `<div class="warnbox">After transforming, check the data is now normal, then carry on with the tests for normal data using the button on the left. If it still isn’t normal, go back and choose not to transform.</div>` : ''}
      ${facts}
      ${RUN[r.id] ? runHTML(r.id, n) : ''}
      ${chart}
      <div class="reading"><h3>For example</h3><p>${esc(n.example)}</p>
      <h3>Before you trust the result</h3><ul>${n.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      ${n.tools ? `<h3>Tools that can help</h3><div class="tools">${toolLinks(n.tools)}</div>` : ''}</div>`;
    renderRun();
  }
  function renderTree(r) {
    const onIds = new Set(r.steps.map(s => s.id));
    const onPairs = new Set(r.steps.map(s => s.id + ':' + s.a));
    const here = r.node.test ? r.id : null;
    function node(id) {
      const n = NODES[id];
      if (n.test) {
        return `<button type="button" class="leaf${id === here ? ' here' : ''}" data-leaf="${id}"${id === here ? ' aria-current="true"' : ''}>${esc(n.test)}</button>` +
          (n.then ? ` <span class="then">then carry on as normal data, from “${esc(NODES[n.then.next].q)}”</span>` : '');
      }
      const on = onIds.has(id) || id === r.id;
      return `<span class="tq">${esc(n.q)}</span><ul${on ? ' class="on"' : ''}>` + n.options.map((o, i) =>
        `<li${onPairs.has(id + ':' + i) ? ' class="on"' : ''}><span class="ta">${esc(o.a)}</span>${node(o.next)}</li>`).join('') + `</ul>`;
    }
    els.tree.innerHTML = `<li class="on">${node(ROOT)}</li>`;
  }
  function update() {
    const r = walk(answers);
    els.pick.value = r.node.test ? r.id : '';
    answers = r.steps.map(s => s.a);
    renderAsk(r); renderRoute(r); renderResult(r); renderTree(r);
    if (r.node.test) trackChart({ points: r.steps.length, test: r.id });
  }
  function choose(a) { answers.push(a); update(); focusAsk(); }
  function focusAsk() {
    const b = els.ask.querySelector('button.option') || els.ask.querySelector('.question');
    if (!b) return;
    if (!b.matches('button')) b.setAttribute('tabindex', '-1');
    b.focus();
  }

  // ---- exports ----
  function svgEl() { return document.querySelector('#chart svg'); }
  function fileName() { return slug(els.title.value.trim() || (current && current.node.test) || ''); }
  let dlPromise = null;
  function getDownloads() {
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(undefined);
    if (!dlPromise) dlPromise = window.claude.use('downloads').catch(() => null);
    return dlPromise;
  }
  async function downloadBlob(blob, name) {
    const d = await getDownloads();
    if (d) { const r = await d.save({ filename: name, data: blob }); return r && r.status !== 'declined'; }
    return FocusActions.saveFile(name, blob);
  }
  function status(msg) { FocusActions.say(msg); }
  function toPNG(cb) {
    const svg = svgEl(); if (!svg) return;
    const vb = svg.viewBox.baseVal, scale = 2;
    const str = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = vb.width * scale; c.height = vb.height * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/png');
    };
    img.onerror = () => status('Could not create the image.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }
  const csvCell = v => v === undefined ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }
  const saved = (ok, msg) => status(ok ? msg : 'Download cancelled.');
  const failed = () => status('The file couldn’t be saved here. Try Copy instead.');
  function act(a) {
    if (a === 'example') return loadExample();
    if (!current) return;
    if (a === 'runexample' || a === 'runclear') {
      runs[current.id] = a === 'runexample' ? RUN[current.id].example() : {};
      renderResult(current);
      if (a === 'runclear') trackCleared();
      return a === 'runexample' ? status('Example data added.') : $('run-data') ? $('run-data').focus() : null;
    }
    if (a === 'runcopy') return lastRun && copyText(lastRun.res.copy).then(ok => status(ok ? 'Copied.' : 'Copy was blocked.'));
    if (a === 'png') toPNG(b => downloadBlob(b, fileName() + '.png').then(ok => saved(ok, 'PNG downloaded.'), failed));
    if (a === 'svg') downloadBlob(new Blob([new XMLSerializer().serializeToString(svgEl())], { type: 'image/svg+xml' }), fileName() + '.svg').then(ok => saved(ok, 'SVG downloaded.'), failed);
    if (a === 'copyimg') {
      if (!(navigator.clipboard && window.ClipboardItem)) return status('Your browser can’t copy images — use Download PNG.');
      toPNG(async b => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); status('Chart copied — paste it into PowerPoint or Word.'); }
        catch (e) { status('Copy was blocked — use Download PNG.'); }
      });
    }
    if (a === 'csv') downloadBlob(new Blob([tableRows().map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), fileName() + '.csv').then(ok => saved(ok, 'Table downloaded.'), failed);
    if (a === 'copytable') copyText(tableRows().map(r => r.join('\t')).join('\n')).then(ok => status(ok ? 'Table copied — paste it into Excel.' : 'Copy was blocked.'));
    if (a === 'copysummary') copyText(summaryText()).then(ok => status(ok ? 'Summary copied.' : 'Copy was blocked.'));
  }
  // Example: comparing length of stay on two wards
  function loadExample() {
    answers = ROUTES.t2.slice();
    runs = { t2: RUN.t2.example() };
    els.title.value = 'Length of stay on two wards: which test? (example)';
    update();
  }

  // ---- events ----
  els.ask.addEventListener('click', e => {
    const b = e.target.closest('button.option'); if (!b) return;
    choose(b.dataset.then ? 'then' : +b.dataset.opt);
  });
  els.route.addEventListener('click', e => {
    const b = e.target.closest('button[data-change]'); if (!b) return;
    answers = answers.slice(0, +b.dataset.change); update(); focusAsk();
  });
  // Jump straight to a test chosen from the list, with the route that leads there
  const PICK = [
    ['Proportions and counts', ['prop1', 'prop2', 'chi']],
    ['Means (normal data)', ['t1', 't2', 'tPaired', 'anova1', 'anova2']],
    ['Medians (data that isn’t normal)', ['sign', 'mann', 'kruskal', 'mood']],
    ['Spread (variation)', ['var2', 'bartlett', 'levene']],
    ['Relationships', ['slr', 'mlr', 'logistic']],
    ['Making data normal', ['boxcox', 'logT', 'sqrtT']]
  ];
  els.pick.insertAdjacentHTML('beforeend', PICK.map(([label, ids]) => `<optgroup label="${esc(label)}">${ids.map(id => `<option value="${id}">${esc(NODES[id].test)}</option>`).join('')}</optgroup>`).join(''));
  els.pick.addEventListener('change', () => {
    const id = els.pick.value; if (!ROUTES[id]) return;
    answers = ROUTES[id].slice(); update();
    const box = els.result.querySelector('.runbox');
    if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = box.querySelector('textarea, input'); if (f) f.focus({ preventScroll: true }); }
  });
  els.tree.addEventListener('click', e => {
    const b = e.target.closest('button[data-leaf]'); if (!b) return;
    answers = ROUTES[b.dataset.leaf].slice(); update();
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  trackSettings({ test: 'pickTest', alpha: 'run-alpha' });
  els.back.addEventListener('click', () => { answers.pop(); update(); focusAsk(); });
  $('clearBtn').addEventListener('click', () => { answers = []; runs = {}; els.title.value = ''; update(); focusAsk(); trackCleared(); });
  // Redraw only the route chart, so typing a title doesn't disturb the data pasted below it
  els.title.addEventListener('input', () => { const c = $('chart'); if (c) c.innerHTML = routeSVG(walk(answers)); });
  els.result.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  const onRunInput = e => {
    const t = e.target;
    if (!current) return;
    if (t.id === 'run-alpha') alpha = +t.value;
    else if (t.dataset.run) (runs[current.id] || (runs[current.id] = {}))[t.dataset.run] = t.value;
    else return;
    renderRun();
  };
  els.result.addEventListener('input', onRunInput);
  els.result.addEventListener('change', onRunInput);

  update();

  // ---- shared toolbar (Open, Save, Export) ----
  FocusActions.mount({
    tool: 'hypothesis_test_selector', toolName: 'hypothesis test selector',
    example: loadExample, hasData: () => answers.length > 0 || !!els.title.value.trim() || Object.keys(runs).some(id => Object.values(runs[id]).some(v => String(v).trim())),
    fileName: () => fileName(),
    fields: 'section.panel[aria-labelledby="data-h"]',
    getExtra: () => ({ answers, runs, alpha }),
    setExtra: x => {
      answers = x && Array.isArray(x.answers) ? x.answers.filter(a => a === 'then' || Number.isInteger(a)) : [];
      // Files saved before "Which transformation?" was added went from "Yes" straight to Box-Cox
      for (let i = 0, id = ROOT; i < answers.length && NODES[id]; i++) {
        if (id === 'transformType' && !Number.isInteger(answers[i])) answers.splice(i, 0, 0);
        const opt = pick(NODES[id], answers[i]); if (!opt) break;
        id = opt.next;
        if (id === 'transformType' && i === answers.length - 1) answers.push(0);
      }
      runs = {};
      if (x && x.runs && typeof x.runs === 'object') Object.keys(x.runs).forEach(id => {
        if (!RUN[id] || !x.runs[id] || typeof x.runs[id] !== 'object') return;
        runs[id] = {}; Object.keys(x.runs[id]).forEach(k => { if (typeof x.runs[id][k] === 'string') runs[id][k] = x.runs[id][k]; });
      });
      alpha = x && [0.05, 0.01, 0.1].includes(x.alpha) ? x.alpha : 0.05;
    },
    afterOpen: () => update(),
    ready: () => !!current,
    exports: trackExports(['png', 'svg', 'copyimg', 'csv', 'copytable', 'copysummary'].map(type => ({ type, run: () => act(type) })))
  });
})();

# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
Writes tests/stats/reference.json: the inputs for every statistics test and
the answers SciPy and NumPy give for them. stats.test.js checks each tool's own
functions against these answers.

Only needed when you add or change a test; the reference file is committed.
Run from the repository root:

    pip install numpy scipy statsmodels pandas matplotlib
    python3 tests/stats/make_reference.py

The datasets are made up and drawn from fixed random seeds, so re-running gives
the same file for the same SciPy version.
"""
import json, math, os
import numpy as np
import scipy
from scipy import stats, special

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference.json")
rng = np.random.default_rng(20261027)


def r(x):
    """Plain floats for JSON (and full precision)."""
    if isinstance(x, (list, tuple, np.ndarray)):
        return [r(v) for v in x]
    return float(x)


def data(kind, n, **k):
    if kind == "normal":
        v = rng.normal(k.get("mean", 50), k.get("sd", 10), n)
    elif kind == "skewed":
        v = rng.lognormal(k.get("mu", 2), k.get("sigma", 0.6), n)
    elif kind == "ties":
        v = rng.integers(1, k.get("top", 6), n).astype(float)
    return [round(float(x), 2) for x in v]


groups = []


def group(id, fn, tools, cases, tol=1e-9, abs_tol=1e-12, call=None, globals=None, note=None, todo=None):
    """`todo` marks a known difference that's reported but doesn't fail the run."""
    groups.append({k: v for k, v in dict(id=id, fn=fn, tools=tools, call=call, globals=globals,
                                          tol=tol, abs=abs_tol, note=note, todo=todo, cases=cases).items() if v is not None})


SEL = "hypothesis_test_selector"
# The distributions every tool shares (assets/js/focus-stats.js), tested once
# here; each tool's own results below run through these same shared copies.
SHARED = "assets/js/focus-stats.js"

# ---------------------------------------------------------------- distributions
group("lgamma", "lgamma", [SHARED],
      [{"args": [x], "expect": r(special.gammaln(x))} for x in [0.5, 1, 1.5, 2, 3.7, 10, 50.5, 171, 1000]],
      tol=1e-9, abs_tol=1e-9)
group("gamma function", "gamma", [SHARED],
      [{"args": [x], "expect": r(special.gamma(x))} for x in [0.5, 1, 1.5, 2.25, 3.7, 10, 30.5]], tol=1e-9)

ib = []
for x in [0.001, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]:
    for a, b in [(0.5, 0.5), (1, 3), (2.5, 7), (10, 0.5), (50, 50), (0.5, 2500), (2500, 0.5)]:
        ib.append({"args": [x, a, b], "expect": r(special.betainc(a, b, x))})
group("ibeta", "ibeta", [SHARED], ib, tol=1e-8, abs_tol=1e-14)
group("inverse of the incomplete beta function", "betaInv", [SHARED],
      [{"args": [p, a, b], "expect": r(stats.beta.ppf(p, a, b))}
       for p in [0.001, 0.025, 0.5, 0.95, 0.999] for a, b in [(0.5, 0.5), (1, 20), (12, 3), (40, 41)]], tol=1e-9, abs_tol=1e-14)

tps = [{"args": [t, df], "expect": r(2 * stats.t.sf(t, df))}
       for t in [0.2, 1, 1.96, 3, 6, 12] for df in [1, 2, 5, 30, 200, 5000, 100000]]
group("t p-value (two-sided)", "tP", [SHARED], tps, tol=1e-8, abs_tol=1e-15)

fps = [{"args": [F, d1, d2], "expect": r(stats.f.sf(F, d1, d2))}
       for F in [0.3, 1, 2.5, 6, 30] for d1 in [1, 2, 4, 12] for d2 in [3, 20, 200, 20000]]
fps += [{"name": "F = 0", "args": [0, 3, 20], "expect": 1.0}, {"name": "F infinite", "args": ["Infinity", 3, 20], "expect": 0.0}]
group("F p-value (upper tail)", "fP", [SHARED], fps, tol=1e-8, abs_tol=1e-15)

chis = [{"args": [x, df], "expect": r(stats.chi2.sf(x, df))}
        for x in [0.1, 1, 3.84, 10, 40, 150] for df in [1, 2, 4, 10, 50, 200]]
group("chi-squared p-value", "chiP", [SHARED], chis, tol=1e-8, abs_tol=1e-15)

gq = [{"args": [a, x], "expect": r(special.gammaincc(a, x))}
      for a in [0.5, 1, 2.5, 10, 100] for x in [0.05, 0.5, 2, 9, 30, 120]]
group("upper incomplete gamma", "gammaQ", [SHARED], gq, tol=1e-8, abs_tol=1e-15)

zs = [-8, -5, -3, -1.96, -1, -0.3, 0, 0.3, 1, 1.96, 3, 5, 8]
group("z p-value (two-sided)", "zP", [SHARED],
      [{"args": [z], "expect": r(2 * stats.norm.sf(abs(z)))} for z in zs], tol=1e-8, abs_tol=1e-15)
group("normal CDF", "normCdf", [SHARED], [{"args": [z], "expect": r(stats.norm.cdf(z))} for z in zs]
      + [{"name": "−∞", "args": ["-Infinity"], "expect": 0.0}, {"name": "+∞", "args": ["Infinity"], "expect": 1.0}],
      tol=1e-8, abs_tol=1e-15)
group("inverse normal", "normInv", [SHARED],
      [{"args": [p], "expect": r(stats.norm.ppf(p))} for p in [1e-10, 1e-5, 0.001, 0.025, 0.2, 0.6, 0.9, 0.975, 0.999, 1 - 1e-7]],
      tol=1e-9, abs_tol=1e-9)
group("t CDF", "tCdf", [SHARED],
      [{"args": [t, df], "expect": r(stats.t.cdf(t, df))} for t in [-4, -1.5, 0.5, 2.2, 6] for df in [2, 9, 60, 1000]],
      tol=1e-8, abs_tol=1e-15)
group("inverse t", "tInv", [SHARED],
      [{"args": [p, df], "expect": r(stats.t.ppf(p, df))} for p in [0.6, 0.9, 0.975, 0.995, 0.9995] for df in [2, 9, 60, 1000]],
      tol=1e-7)
group("beta quantile for the F critical value", "fCritU", ["power_sample_size"],
      [{"args": [a, d1, d2], "expect": r(stats.beta.ppf(1 - a, d1 / 2, d2 / 2))}
       for a in [0.01, 0.05, 0.1] for d1 in [1, 3, 8] for d2 in [6, 40, 400]], tol=1e-7)

tc = [{"args": [df, a], "expect": r(stats.t.ppf(1 - a / 2, df))} for df in [1, 3, 10, 40, 1000] for a in [0.01, 0.05, 0.1]]
group("t critical value (two-sided)", "tCrit", [SHARED], tc, tol=1e-7)
group("t critical value (two-sided, 95% when no alpha is given)", "tCrit", [SHARED],
      [{"args": [df], "expect": r(stats.t.ppf(0.975, df))} for df in [1, 3, 10, 40, 1000]], tol=1e-7)
group("z critical value (two-sided)", "zCrit", [SHARED],
      [{"args": [a], "expect": r(stats.norm.ppf(1 - a / 2))} for a in [0.001, 0.01, 0.05, 0.1, 0.2]], tol=1e-7)

# ------------------------------------------------------------- descriptive
sets = [data("normal", 7), data("normal", 40), data("skewed", 25), data("ties", 30), [3.0, 3.0, 3.0, 9.0]]
qs = []
for v in sets:
    s = sorted(v)
    for p in [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]:
        qs.append({"args": [s, p], "expect": r(np.quantile(s, p, method="linear"))})
group("quantile (linear interpolation, R type 7 / Excel QUARTILE.INC)", "quantile", [SHARED], qs)

group("sum", "sum", [SHARED], [{"args": [v], "expect": r(np.sum(v))} for v in sets])
group("mean", "mean", [SHARED], [{"args": [v], "expect": r(np.mean(v))} for v in sets])
group("variance (n - 1)", "variance", [SHARED], [{"args": [v], "expect": r(np.var(v, ddof=1))} for v in sets])
group("median", "median", [SHARED], [{"args": [v], "expect": r(np.median(v))} for v in sets])
group("standard deviation (n - 1)", "sd", [SHARED], [{"args": [v], "expect": r(np.std(v, ddof=1))} for v in sets])

rk = []
for v in sets:
    ties = sum(c ** 3 - c for c in np.unique(v, return_counts=True)[1])
    rk.append({"args": [v], "expect": {"r": r(stats.rankdata(v)), "ties": r(ties)}})
group("average ranks with ties", "ranks", [SHARED], [{"args": c["args"], "expect": c["expect"]["r"]} for c in rk])
group("tie correction (sum of t³ − t)", "tiesT", [SHARED], [{"args": c["args"], "expect": c["expect"]["ties"]} for c in rk])

desc = []
for v in sets[:4]:
    desc.append({"args": [v], "expect": {"mean": r(np.mean(v)), "sd": r(np.std(v, ddof=1)), "skew": r(stats.skew(v, bias=False)),
                                         "median": r(np.median(v)), "q1": r(np.quantile(v, 0.25)), "q3": r(np.quantile(v, 0.75)),
                                         "min": r(min(v)), "max": r(max(v))}})
group("describe: mean, SD, skewness, quartiles", "describe", ["histogram"], desc)
group("describe: mean, variance, SD, median", "describe", ["anova"],
      [{"args": [{"name": "g", "values": v}], "expect": {"mean": r(np.mean(v)), "variance": r(np.var(v, ddof=1)),
                                                        "sd": r(np.std(v, ddof=1)), "med": r(np.median(v))}} for v in sets[:4]])


# Anderson-Darling: the statistic from SciPy; the p-value from D'Agostino and
# Stephens (1986) table 4.9, which Minitab uses, applied to A² adjusted for n.
def ad_p(a):
    if a >= 0.6:
        return math.exp(1.2937 - 5.709 * a + 0.0186 * a * a)
    if a >= 0.34:
        return math.exp(0.9177 - 4.279 * a - 1.38 * a * a)
    if a >= 0.2:
        return 1 - math.exp(-8.318 + 42.796 * a - 59.938 * a * a)
    return 1 - math.exp(-13.436 + 101.14 * a - 223.73 * a * a)


ad = []
for v in [data("normal", 12), data("normal", 60), data("skewed", 30), data("skewed", 200), data("ties", 50)]:
    n = len(v)
    a2 = stats.anderson(v, dist="norm", method="interpolate").statistic
    a = a2 * (1 + 0.75 / n + 2.25 / n ** 2)
    ad.append({"args": [v], "expect": {"a2": r(a2), "a": r(a), "p": r(min(1, max(0, ad_p(a))))}})
# very far from normal: 1,000 values, 90% of them 0. The fitted p-value curve
# turns back up beyond an adjusted A² of about 150, so p must be cut off at 0.
far = [0.0 if i % 10 < 9 else 100.0 + i % 7 for i in range(1000)]
a2 = stats.anderson(far, dist="norm", method="interpolate").statistic
ad.append({"name": "1,000 values, 90% zero", "args": [far], "expect": {"a2": r(a2), "a": r(a2 * (1 + 0.75 / 1000 + 2.25 / 1000 ** 2)), "p": 0.0}})
group("Anderson-Darling normality test", "andersonDarling", [SHARED], ad, tol=1e-7, abs_tol=1e-12,
      note="statistic from SciPy; p-value from D'Agostino and Stephens (1986), as Minitab uses, taken as 0 beyond an adjusted A² of 13")

# ------------------------------------------------------------- tests
gsets = [
    [data("normal", 8, mean=50), data("normal", 10, mean=55), data("normal", 9, mean=52)],
    [data("normal", 30, mean=20, sd=4), data("normal", 25, mean=21, sd=8)],
    [data("skewed", 15), data("skewed", 20, mu=2.3), data("skewed", 12, mu=1.8), data("skewed", 18)],
]
ow = []
for g in gsets:
    res = stats.f_oneway(*g)
    ow.append({"args": [g], "expect": {"F": r(res.statistic), "p": r(res.pvalue)}})
group("one-way ANOVA", "oneWay", [SHARED], ow)


def welch_anova(g):
    # Welch (1951), written out independently of the tool's code
    k = len(g); n = np.array([len(x) for x in g]); m = np.array([np.mean(x) for x in g]); v = np.array([np.var(x, ddof=1) for x in g])
    w = n / v; W = w.sum(); mw = (w * m).sum() / W
    A = (w * (m - mw) ** 2).sum() / (k - 1)
    tmp = (((1 - w / W) ** 2) / (n - 1)).sum()
    F = A / (1 + 2 * (k - 2) / (k * k - 1) * tmp)
    df2 = (k * k - 1) / (3 * tmp)
    return F, k - 1, df2, stats.f.sf(F, k - 1, df2)


wl = []
for g in gsets:
    F, d1, d2, p = welch_anova(g)
    wl.append({"args": [g], "expect": {"F": r(F), "df1": r(d1), "df2": r(d2), "p": r(p)}})
group("Welch's ANOVA", "welch", ["anova"], wl, call="welchFromGroups",
      note="reference is Welch (1951) written out in Python; SciPy has no Welch ANOVA")

t1 = []
for v, mu in [(data("normal", 6), 50), (data("normal", 25, mean=12, sd=3), 10), (data("skewed", 40), 9)]:
    res = stats.ttest_1samp(v, mu)
    ci = res.confidence_interval(0.95)
    t1.append({"args": [v, mu], "expect": {"t": r(res.statistic), "df": r(res.df), "p": r(res.pvalue), "lo": r(ci.low), "hi": r(ci.high)}})
group("one-sample t-test", "tOne", [SEL], t1, globals={"alpha": 0.05}, tol=1e-7)

tabs = [[[12, 5], [7, 14]], [[30, 22, 18], [10, 25, 31]], [[8, 3, 6, 9], [4, 11, 5, 7], [9, 6, 12, 3]]]
ct = []
for t in tabs:
    c2, p, df, _ = stats.chi2_contingency(t, correction=False)
    ct.append({"args": [t], "expect": {"X2": r(c2), "df": r(df), "p": r(p)}})
group("chi-squared test of independence", "chiTable", [SEL], ct)
group("chi-squared test of independence", "independence", ["chi_squared"],
      [{"args": [[f"r{i}" for i in range(len(c["args"][0]))], [f"c{j}" for j in range(len(c["args"][0][0]))], c["args"][0], 0.05],
        "expect": {"chi2": c["expect"]["X2"], "df": c["expect"]["df"], "p": c["expect"]["p"],
                   "V": r(stats.contingency.association(np.array(c["args"][0]), method="cramer", correction=False))}} for c in ct])

gf = []
for obs, w in [([18, 22, 30, 30], [1, 1, 1, 1]), ([50, 30, 20], [0.5, 0.3, 0.2]), ([5, 12, 9, 20, 4], [2, 3, 3, 4, 1])]:
    W = sum(w); exp = [sum(obs) * x / W for x in w]
    res = stats.chisquare(obs, exp)
    gf.append({"args": [[f"c{i}" for i in range(len(obs))], obs, w, 0.05], "expect": {"chi2": r(res.statistic), "df": r(len(obs) - 1), "p": r(res.pvalue)}})
group("chi-squared goodness of fit", "goodness", ["chi_squared"], gf)

group("Fisher's exact test (two-sided)", "fisher", ["chi_squared"],
      [{"args": [t], "expect": r(stats.fisher_exact(t).pvalue)} for t in [[[3, 9], [8, 2]], [[12, 5], [7, 14]], [[1, 20], [6, 15]], [[0, 10], [10, 0]]]],
      tol=1e-7)

sc = []
for n, slope in [(12, 0.8), (40, -0.3), (100, 0.05)]:
    x = data("normal", n, mean=30, sd=6)
    y = [round(slope * a + float(e), 2) for a, e in zip(x, rng.normal(0, 4, n))]
    lr, sp = stats.linregress(x, y), stats.spearmanr(x, y)
    sc.append({"args": [[{"x": a, "y": b} for a, b in zip(x, y)]],
               "expect": {"r": r(lr.rvalue), "p": r(lr.pvalue), "slope": r(lr.slope), "icpt": r(lr.intercept), "rho": r(sp.statistic)}})
group("correlation and simple regression", "stats", ["scatter_plot"], sc, tol=1e-8)

olsc = []
for n, k in [(20, 1), (50, 3), (35, 5)]:
    X = np.column_stack([np.ones(n), rng.normal(10, 3, (n, k))]).round(2)
    beta = rng.normal(0, 2, k + 1)
    y = (X @ beta + rng.normal(0, 1.5, n)).round(2)
    b, res, *_ = np.linalg.lstsq(X, y, rcond=None)
    olsc.append({"args": [X.tolist(), y.tolist()], "expect": {"b": r(b), "sse": r(((y - X @ b) ** 2).sum()), "df": r(n - k - 1)}})
group("least squares regression", "ols", [SEL], olsc, tol=1e-8, abs_tol=1e-9)
group("least squares regression", "ols", ["multiple_regression"],
      [{"args": c["args"], "expect": {"b": c["expect"]["b"]}} for c in olsc], tol=1e-8, abs_tol=1e-9)

# ------------------------------------------------------------- power
pw = []
for test, sides in [("t1", 2), ("t2", 2), ("t2", 1)]:
    for n in [5, 10, 30, 100]:
        for d in [0.3, 0.8, 1.5]:
            k = 1 if test == "t1" else 2
            df = k * (n - 1)
            nc = math.sqrt(n / k) * d
            tc = stats.t.ppf(1 - 0.05 / sides, df)
            # the far tail underflows to NaN in SciPy when the effect is very large; it is 0 then
            far = stats.nct.cdf(-tc, df, nc) if sides == 2 else 0
            power = stats.nct.sf(tc, df, nc) + (0 if math.isnan(far) else far)
            pw.append({"args": [{"test": test, "sides": sides, "alpha": 0.05, "sd": 1}, n, d], "expect": r(power)})
group("power of a t-test", "powerAt", ["power_sample_size"], pw, tol=0, abs_tol=0.02,
      note="the tool uses a normal approximation to the noncentral t distribution; the reference is exact (SciPy nct)")
pa = []
for levels in [3, 5]:
    for n in [5, 12, 30]:
        for d in [0.5, 1, 2]:
            d1, d2, lam = levels - 1, levels * (n - 1), n * d * d / 2
            fc = stats.f.ppf(0.95, d1, d2)
            pa.append({"args": [{"test": "anova", "levels": levels, "alpha": 0.05, "sd": 1, "sides": 2}, n, d], "expect": r(stats.ncf.sf(fc, d1, d2, lam))})
group("power of a one-way ANOVA", "powerAt", ["power_sample_size"], pa, tol=1e-6, abs_tol=1e-9,
      note="difference between the highest and lowest means, others in the middle (the least favourable case, as Minitab uses)")

# ------------------------------------------------------------- SPC, run chart and funnel plot
# The reference is an independent Python version of the published rules
# (reference_spc.py). Boundary cases are built so the rule's outcome is known,
# and checked here before they're written.
from datetime import date, timedelta
import reference_spc as R

rng2 = np.random.default_rng(1620)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, np.ndarray)):
        return [clean(v) for v in o]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, float, np.integer, np.floating)):
        return float(o)
    return o


def rules(res):
    return sorted({(e["rule"], e["side"]) for e in res["events"]})


wiggle = lambda n, lo=9, hi=11: [lo if i % 2 else hi for i in range(n)]
X = {  # XmR series: name -> (values, options, the signals they must show)
    "random": (np.round(rng2.normal(50, 5, 30), 1).tolist(), {}, None),
    "seven above the mean": (wiggle(12) + [12, 13, 12, 13, 12, 13, 12] + wiggle(5), {}, [("shift", "hi")]),
    "six above the mean": (wiggle(12) + [12, 13, 12, 13, 12, 13] + [9, 11, 9, 11, 9, 11], {}, []),
    "point on the mean breaks a shift": (wiggle(12) + [12, 13, 12, 10.6, 12, 13, 12, 13] + wiggle(4), {}, None),
    "seven rising": (wiggle(6) + [8, 9, 10, 11, 12, 13, 14] + wiggle(6), {}, [("trend", "hi")]),
    "six rising": (wiggle(6) + [8, 9, 10, 11, 12, 13] + wiggle(7), {}, []),
    "repeat ends a trend": (wiggle(6) + [8, 9, 10, 10, 11, 12, 13, 14] + wiggle(6), {}, []),
    "seven falling": (wiggle(6) + [14, 13, 12, 11, 10, 9, 8] + wiggle(6), {}, [("trend", "lo")]),
    "one point outside": (wiggle(10) + [25] + wiggle(10), {}, [("outside", "hi")]),
    "two of three high": (wiggle(10, 9.5, 10.5) + [12.8, 10.6, 12.8] + wiggle(8, 9.5, 10.5), {}, [("twothree", "hi")]),
    "two of three, rule off": (wiggle(10, 9.5, 10.5) + [12.8, 10.6, 12.8] + wiggle(8, 9.5, 10.5), {"twoThree": False}, []),
    "step change with a break": (np.round(np.r_[rng2.normal(20, 2, 15), rng2.normal(30, 2, 15)], 1).tolist(), {"breaks": [15]}, None),
    "baseline of the first 12": (np.round(np.r_[rng2.normal(20, 2, 12), rng2.normal(26, 2, 14)], 1).tolist(), {"useBaseN": True, "baseN": 12}, None),
    "screened moving ranges": (np.round(np.r_[rng2.normal(40, 3, 10), [80], rng2.normal(40, 3, 10)], 1).tolist(), {"screen": True}, None),
    "lower limit floored at 0": ([2, 0, 5, 1, 0, 6, 1, 0, 2, 7, 0, 1, 3, 0, 5], {"floor": True}, None),
    "lower is better": (wiggle(10) + [25] + wiggle(10), {"dir": "down"}, [("outside", "hi")]),
    "no preferred direction": (wiggle(6) + [8, 9, 10, 11, 12, 13, 14] + wiggle(6), {"dir": "none"}, [("trend", "hi")]),
    "shift of 6 when set to 6": (wiggle(12) + [12, 13, 12, 13, 12, 13] + [9, 11, 9, 11, 9, 11], {"shiftLen": 6}, [("shift", "hi")]),
}
xc = []
for name, (v, o, must) in X.items():
    res = R.spc_xmr(v, o.get("breaks", ()), o.get("baseN") if o.get("useBaseN") else None, o.get("screen", False),
                    o.get("floor", False), o.get("shiftLen", 7), o.get("trendLen", 7), o.get("twoThree", True), o.get("dir", "up"))
    if must is not None:
        assert rules(res) == must, (name, rules(res))
    xc.append({"name": name, "args": ["xmr", v, o], "expect": clean(res)})
group("SPC XmR chart: limits and signals", "compute", ["spc_tool"], xc, call="spc", tol=1e-9, abs_tol=1e-12,
      note="reference: Making Data Count rules written independently in Python")

pn = rng2.integers(80, 150, 24)
pdata = [[int(rng2.binomial(n, 0.12)), int(n)] for n in pn]
pdata[18][0] = int(pn[18] * 0.3)                      # one high month
big = rng2.integers(5000, 8000, 20)
ldata = [[int(rng2.binomial(n, min(0.95, max(0.01, rng2.normal(0.1, 0.012))))), int(n)] for n in big]
trend_p = [[n, 100] for n in [10, 12, 11, 13, 12, 10, 11, 12, 13, 13, 14, 15, 16, 17, 18, 11, 12, 10, 11]]
P = {
    "P chart": ("p", pdata, {}),
    "P chart, short (no limits yet)": ("p", pdata[:10], {}),
    "P chart with a break": ("p", pdata, {"breaks": [12]}),
    "Laney P' chart (large totals)": ("p", ldata, {"laney": True}),
    "P chart, ordinary limits on the same data": ("p", ldata, {}),
    "P chart trend: repeats don't break it": ("p", trend_p, {}),
    "U chart": ("u", [[int(rng2.poisson(e * 0.004)), int(e)] for e in rng2.integers(800, 2500, 20)], {}),
    "Laney U' chart": ("u", [[int(rng2.poisson(e * max(0.0005, rng2.normal(0.004, 0.001)))), int(e)] for e in rng2.integers(20000, 40000, 20)], {"laney": True}),
}
pc = []
for name, (kind, d, o) in P.items():
    res = R.spc_count([a for a, b in d], [b for a, b in d], kind, o.get("breaks", ()), o.get("laney", False),
                      direction=o.get("dir", "up"))
    if name.startswith("P chart trend"):
        assert ("trend", "hi") in rules(res), rules(res)
    pc.append({"name": name, "args": [kind, d, o], "expect": clean(res)})
cdata = [int(x) for x in rng2.poisson(12, 25)]
cdata[20] = 30
res = R.spc_count(cdata, [1] * len(cdata), "c")
assert ("outside", "hi") in rules(res)
pc.append({"name": "C chart", "args": ["c", cdata, {}], "expect": clean(res)})
group("SPC P, U and C charts: limits and signals", "compute", ["spc_tool"], pc, call="spc", tol=1e-9, abs_tol=1e-12,
      note="reference: binomial and Poisson limits, and Laney's P' and U', written independently in Python")

tc = []
for name, gaps in {"T chart": [int(g) for g in np.maximum(0, np.round(rng2.exponential(25, 24)))],
                   "T chart, events closer together": [int(g) for g in np.round(np.r_[rng2.exponential(30, 15), rng2.exponential(4, 12)])]}.items():
    d0 = date(2024, 1, 3)
    days = [0]
    for g in gaps:
        days.append(days[-1] + g)
    iso = [(d0 + timedelta(days=x)).isoformat() for x in days]
    res = R.spc_t(days, direction="down")
    tc.append({"name": name, "args": ["t", iso, {"dir": "down"}], "expect": clean(res)})
group("SPC T chart for rare events: gaps, limits and signals", "compute", ["spc_tool"], tc, call="spc", tol=1e-9, abs_tol=1e-12,
      note="reference: gaps in days (half a day for the same day), transformed by the power 1/3.6, XmR limits, back-transformed")

runc = []
RUN = {
    "random": (np.round(rng2.normal(30, 4, 24), 1).tolist(), {}),
    "6 above the median": ([10, 9, 10, 9, 10, 9, 10, 9, 10, 9, 12, 12.5, 12, 13, 12, 12.5, 9, 10, 9, 10], {}),
    "5 above the median": ([10, 9, 10, 9, 10, 9, 10, 9, 10, 9, 12, 12.5, 12, 13, 12, 9, 10, 9, 10, 9], {}),
    "points on the median are skipped": ([5, 4, 6, 4, 6, 4, 6, 5, 6, 7, 5, 8, 6, 7, 4, 3, 5, 4], {}),
    "5 rising": ([10, 9, 10, 9, 10, 6, 7, 8, 9, 10, 9, 10, 9, 10, 9], {}),
    "4 rising": ([10, 9, 10, 9, 10, 6, 7, 8, 9, 7, 10, 9, 10, 9], {}),
    "repeats are skipped in a trend": ([10, 9, 10, 9, 10, 6, 7, 7, 8, 8, 9, 10, 9, 10, 9], {}),
    "astronomical point": ([10, 11, 9, 10, 12, 10, 11, 9, 10, 40, 10, 11], {}),
    "baseline of the first 12": (np.round(np.r_[rng2.normal(20, 2, 12), rng2.normal(25, 2, 14)], 1).tolist(), {"medMode": "first", "firstN": 12}),
    "80 points (runs from the normal approximation)": (np.round(rng2.normal(50, 6, 80), 1).tolist(), {}),
}
for name, (v, o) in RUN.items():
    res = R.run_chart(v, o.get("firstN") if o.get("medMode") == "first" else None)
    want = {k: res[k] for k in ("med", "shifts", "trends", "useful", "runs", "astro")}
    if res["useful"] > 60:
        want.update(lo=res["lo"], hi=res["hi"])
    runc.append({"name": name, "args": [v, {"medMode": o.get("medMode", "all"), "firstN": o.get("firstN"), "dir": "up"}], "expect": clean(want)})
assert len(R.run_chart(*RUN["6 above the median"][:1])["shifts"]) == 1 and not R.run_chart(RUN["5 above the median"][0])["shifts"]
assert len(R.run_chart(RUN["5 rising"][0])["trends"]) == 1 and not R.run_chart(RUN["4 rising"][0])["trends"]
assert len(R.run_chart(RUN["repeats are skipped in a trend"][0])["trends"]) == 1
assert R.run_chart(RUN["astronomical point"][0])["astro"] == [9]
group("run chart: median, shifts, trends, runs and astronomical points", "analyse", ["run_chart"], runc, call="runChart",
      note="reference: the IHI run chart rules (Perla, Provost and Murray 2011) written independently in Python")

# The runs table: Table 1 of Perla, Provost and Murray (2011), "Checking for too
# many or too few runs on a run chart", adapted from Swed and Eisenhart. N =
# useful observations (points not on the median): (fewest, most) runs that
# aren't a signal.
PUBLISHED_RUNS = {10: (3, 9), 11: (3, 10), 12: (3, 11), 13: (4, 11), 14: (4, 12), 15: (5, 12), 16: (5, 13), 17: (5, 13), 18: (6, 14), 19: (6, 15), 20: (6, 16), 21: (7, 16), 22: (7, 17), 23: (7, 17), 24: (8, 18), 25: (8, 18), 26: (9, 19), 27: (10, 19), 28: (10, 20), 29: (10, 20), 30: (11, 21), 31: (11, 22), 32: (11, 23), 33: (12, 23), 34: (12, 24), 35: (12, 24), 36: (13, 25), 37: (13, 25), 38: (14, 26), 39: (14, 26), 40: (15, 27), 41: (15, 27), 42: (16, 28), 43: (16, 28), 44: (17, 29), 45: (17, 30), 46: (17, 31), 47: (18, 31), 48: (18, 32), 49: (19, 32), 50: (19, 33), 51: (20, 33), 52: (20, 34), 53: (21, 34), 54: (21, 35), 55: (22, 35), 56: (22, 35), 57: (23, 36), 58: (23, 37), 59: (24, 38), 60: (24, 38)}
group("run chart: runs table (Perla, Provost and Murray 2011, table 1)", "RUNS_TABLE", ["run_chart"],
      [{"name": f"{n} useful observations", "args": [n], "expect": clean(list(v))} for n, v in PUBLISHED_RUNS.items()],
      call="runsTable")

fc = []
fe = rng2.integers(80, 2000, 14)
fd = [[f"Unit {chr(65 + i)}", int(rng2.binomial(n, 0.08)), int(n)] for i, n in enumerate(fe)]
fd[3][1] = int(fd[3][2] * 0.2)
rates = [[f"Ward {i + 1}", int(rng2.poisson(n * 1.4)), int(n)] for i, n in enumerate(rng2.integers(30, 400, 12))]
for name, rows, centre in [("proportions, pooled average", fd, "pooled"), ("proportions, average of the rates", fd, "mean"),
                           ("rates (Poisson)", rates, "pooled")]:
    res = R.funnel([e for _, e, _ in rows], [n for *_, n in rows], centre)
    fc.append({"name": name, "args": [rows, centre], "expect": clean(res)})
assert fc[0]["expect"]["rows"][3]["status"] == "above"
assert fc[2]["expect"]["poisson"] is True
group("funnel plot: limits and status", "analyse", ["funnel_plot"], fc, call="funnel",
      note="reference: average ± 3 and ± 1.96 standard errors, binomial or Poisson, written independently in Python")

# Reading pasted numbers: what the run chart makes of typical cells (null = not a number)
NUMBERS = {"1,200": 1200, "£1,234.50": 1234.5, "12%": 12, "(5)": -5, " 7 ": 7, "1.2e3": 1200, "-3.25": -3.25,
           "abc": None, "1,2": None, "": None, "N/A": None, "<5": None}
group("run chart: reading pasted numbers", "parseNumber", ["run_chart"],
      [{"name": repr(k), "args": [k], "expect": clean(v)} for k, v in NUMBERS.items()], call="number")

# ------------------------------------------------------------- hypothesis test selector: each test
# Each test runs on pasted text, as the page does, and is checked against SciPy
# or statsmodels. Labels are the page's own, at a 5% significance level.
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.proportion import proportions_ztest, proportion_confint, confint_proportions_2indep
from statsmodels.stats.multitest import multipletests
import pandas as pd


def column(name, v):
    return name + "\n" + "\n".join(str(x) for x in v)


def wide(names, cols):
    rows = ["\t".join(names)]
    for i in range(max(len(c) for c in cols)):
        rows.append("\t".join(str(c[i]) if i < len(c) else "" for c in cols))
    return "\n".join(rows)


def ad_of(v):
    n = len(v)
    a = stats.anderson(v, dist="norm", method="interpolate").statistic * (1 + 0.75 / n + 2.25 / n ** 2)
    return min(1, max(0, ad_p(a)))


sel = {}  # test id -> cases


def sel_case(id, name, d, expect):
    sel.setdefault(id, []).append({"name": name, "args": [id, d], "expect": clean(expect)})


CI = "95% confidence interval"

for name, v, mu in [("small", data("normal", 8, mean=20, sd=4), 18), ("30 values", data("normal", 30, mean=12, sd=3), 12.5),
                    ("skewed", data("skewed", 45), 6)]:
    res = stats.ttest_1samp(v, mu); ci = res.confidence_interval(0.95)
    sel_case("t1", name, {"data": column("Value", v), "target": str(mu)},
             {"sig": bool(res.pvalue < 0.05), "stats": {"Values": len(v), "Mean": np.mean(v), "Standard deviation": np.std(v, ddof=1),
              "t": res.statistic, "Degrees of freedom": res.df, CI + " for the mean": [ci.low, ci.high], "p-value": res.pvalue}})

for name, v, m0 in [("some equal to the target", data("ties", 30, top=9), 4), ("skewed", data("skewed", 25), 5), ("all above", [3, 5, 6, 8, 9, 12], 2)]:
    above, below = sum(x > m0 for x in v), sum(x < m0 for x in v)
    p = stats.binomtest(min(above, below), above + below, 0.5).pvalue
    sel_case("sign", name, {"data": column("Value", v), "target": str(m0)},
             {"sig": bool(p < 0.05), "stats": {"Above the target": above, "Below the target": below, "p-value (exact)": p}})

for name, a, b in [("similar spread", data("normal", 12, mean=50, sd=6), data("normal", 15, mean=55, sd=6)),
                   ("different spread", data("normal", 25, mean=20, sd=2), data("normal", 9, mean=23, sd=7))]:
    for method in ["welch", "pooled"]:
        res = stats.ttest_ind(a, b, equal_var=method == "pooled"); ci = res.confidence_interval(0.95)
        sel_case("t2", f"{name}, {method}", {"data": wide(["A", "B"], [a, b]), "method": method},
                 {"sig": bool(res.pvalue < 0.05), "stats": {"Difference in means (A − B)": np.mean(a) - np.mean(b), CI + " for the difference": [ci.low, ci.high],
                  "t": res.statistic, "Degrees of freedom": res.df, "p-value": res.pvalue}})

for name, n, shift in [("10 pairs", 10, -1.5), ("40 pairs", 40, 0.4)]:
    before = data("normal", n, mean=30, sd=5)
    after = [round(x + shift + float(e), 2) for x, e in zip(before, rng.normal(0, 2, n))]
    res = stats.ttest_rel(after, before); ci = res.confidence_interval(0.95)
    sel_case("tPaired", name, {"data": wide(["Before", "After"], [before, after])},
             {"sig": bool(res.pvalue < 0.05), "stats": {"Pairs": n, "Mean difference (After − Before)": np.mean(np.subtract(after, before)),
              CI + " for the difference": [ci.low, ci.high], "t": res.statistic, "Degrees of freedom": res.df, "p-value": res.pvalue}})

for name, a, b in [("A less spread", data("normal", 20, sd=4), data("normal", 16, sd=9)), ("A more spread", data("normal", 11, sd=12), data("normal", 30, sd=8))]:
    F = np.var(a, ddof=1) / np.var(b, ddof=1); d1, d2 = len(a) - 1, len(b) - 1
    p = min(1, 2 * min(stats.f.sf(F, d1, d2), stats.f.cdf(F, d1, d2)))
    sel_case("var2", name, {"data": wide(["A", "B"], [a, b])},
             {"sig": bool(p < 0.05), "stats": {"Ratio of variances (A ÷ B)": F, "Degrees of freedom": [d1, d2], "p-value": p}})

many = [("3 groups", [data("normal", 8, mean=50), data("normal", 10, mean=56), data("normal", 9, mean=52)]),
        ("4 skewed groups", [data("skewed", 15), data("skewed", 20, mu=2.4), data("skewed", 12, mu=1.8), data("skewed", 18)]),
        ("2 groups with ties", [data("ties", 20, top=8), data("ties", 24, top=10)])]
for name, g in many:
    names = [f"G{i + 1}" for i in range(len(g))]
    text = wide(names, g)
    N = sum(map(len, g))
    res = stats.f_oneway(*g)
    allv = np.concatenate(g); ssb = sum(len(x) * (np.mean(x) - allv.mean()) ** 2 for x in g); sst = ((allv - allv.mean()) ** 2).sum()
    sel_case("anova1", name, {"data": text}, {"sig": bool(res.pvalue < 0.05), "stats": {"Groups": len(g), "Values": N, "F": res.statistic,
             "Degrees of freedom": [len(g) - 1, N - len(g)], "Share of the variation explained by the groups (η²)": ssb / sst * 100, "p-value": res.pvalue}})
    res = stats.bartlett(*g)
    sel_case("bartlett", name, {"data": text}, {"sig": bool(res.pvalue < 0.05), "stats": {"Chi-squared": res.statistic, "Degrees of freedom": len(g) - 1, "p-value": res.pvalue}})
    res = stats.levene(*g, center="median")
    sel_case("levene", name, {"data": text}, {"sig": bool(res.pvalue < 0.05), "stats": {"W (Levene’s statistic, using medians)": res.statistic,
             "Degrees of freedom": [len(g) - 1, N - len(g)], "p-value": res.pvalue}})
    res = stats.kruskal(*g)
    sel_case("kruskal", name, {"data": text}, {"sig": bool(res.pvalue < 0.05), "stats": {"Values": N, "H (adjusted for ties)": res.statistic,
             "Degrees of freedom": len(g) - 1, "p-value": res.pvalue}})
    X2, p, M, _ = stats.median_test(*g, ties="below", correction=False)
    sel_case("mood", name, {"data": text}, {"sig": bool(p < 0.05), "stats": {"Overall median": M, "Chi-squared": X2, "Degrees of freedom": len(g) - 1, "p-value": p}})
    if len(g) == 2:
        res = stats.mannwhitneyu(*g, use_continuity=True, alternative="two-sided", method="asymptotic")
        sel_case("mann", name, {"data": text}, {"sig": bool(res.pvalue < 0.05), "stats": {"Difference in medians (G1 − G2)": np.median(g[0]) - np.median(g[1]),
                 "U": res.statistic, "p-value": res.pvalue}})
for name, a, b in [("small groups", data("skewed", 9), data("skewed", 11, mu=2.5)), ("larger groups", data("normal", 30, mean=40), data("normal", 26, mean=44))]:
    res = stats.mannwhitneyu(a, b, use_continuity=True, alternative="two-sided", method="asymptotic")
    sel_case("mann", name, {"data": wide(["G1", "G2"], [a, b])}, {"sig": bool(res.pvalue < 0.05), "stats": {"Difference in medians (G1 − G2)": np.median(a) - np.median(b),
             "U": res.statistic, "p-value": res.pvalue}})

# Two-way ANOVA, type III sums of squares with sum-to-zero coding (as Minitab's adjusted SS)
for name, per in [("balanced", [[4] * 3, [4] * 3]), ("unbalanced", [[3, 5, 4], [6, 2, 4]])]:
    rows = []
    for j, day in enumerate(["Weekday", "Weekend"]):
        for i, ward in enumerate(["A", "B", "C"]):
            for v in data("normal", per[j][i], mean=5 + 0.6 * i + 0.8 * j, sd=1.2):
                rows.append((f"Ward {ward}", day, v))
    df = pd.DataFrame(rows, columns=["W", "D", "y"])
    fitted = smf.ols("y ~ C(W, Sum) * C(D, Sum)", data=df).fit()
    t = sm.stats.anova_lm(fitted, typ=3)
    def row(key):
        ss, d = t.loc[key, "sum_sq"], t.loc[key, "df"]
        return {"1": d, "2": ss, "3": ss / d, "4": t.loc[key, "F"], "5": t.loc[key, "PR(>F)"]}
    sse, dfe = t.loc["Residual", "sum_sq"], t.loc["Residual", "df"]
    sel_case("anova2", name, {"data": "Ward\tDay\tStay\n" + "\n".join(f"{a}\t{b}\t{c}" for a, b, c in rows)},
             {"table": {"Ward": row("C(W, Sum)"), "Day": row("C(D, Sum)"), "Ward × Day interaction": row("C(W, Sum):C(D, Sum)"),
                        "Error": {"1": dfe, "2": sse, "3": sse / dfe}}})

# Box-Cox: SciPy's maximum likelihood λ; the tool searches a grid in steps of 0.01
for name, v in [("log-normal", data("skewed", 40)), ("square of normal", [round(x * x / 10, 2) for x in data("normal", 50, mean=30, sd=6)]),
                ("reciprocal of normal", [round(1000 / x, 2) for x in data("normal", 35, mean=40, sd=5)])]:
    lam = stats.boxcox_normmax(v, method="mle")
    used = max(-2, min(2, round(lam * 2) / 2))
    assert abs(lam * 2 - round(lam * 2)) > 0.05, "λ too near a rounding boundary for the grid"
    tv = np.log(v) if used == 0 else np.power(v, used)
    sel_case("boxcox", name, {"data": column("Value", v)}, {"stats": {"Best λ (lambda)": lam, "Rounded λ used": used,
             "Anderson-Darling p before": ad_of(v), "Anderson-Darling p after": ad_of(tv)}})
for name, v, shift, base in [("natural log", data("skewed", 40, mu=4), "", "ln"), ("log 10 with a constant", [round(x - 3, 2) for x in data("skewed", 30)], "5", "log10")]:
    tv = (np.log10 if base == "log10" else np.log)(np.add(v, float(shift or 0)))
    sel_case("logT", name, {"data": column("Value", v), "shift": shift, "base": base},
             {"stats": {"Anderson-Darling p before": ad_of(np.add(v, float(shift or 0))), "Anderson-Darling p after": ad_of(tv)}})
cnt = rng.poisson(4, 40).tolist()
sel_case("sqrtT", "counts", {"data": column("Incidents", cnt)}, {"stats": {"Anderson-Darling p before": ad_of(cnt), "Anderson-Darling p after": ad_of(np.sqrt(cnt))}})

for name, x, n, p0 in [("below target", 1858, 2000, 95), ("small sample", 9, 12, 60), ("target as a fraction", 41, 50, 0.7)]:
    pp = p0 / 100 if p0 > 1 else p0
    z, p = proportions_ztest(x, n, pp, prop_var=pp)
    lo, hi = proportion_confint(x, n, 0.05, method="normal")
    sel_case("prop1", name, {"x": str(x), "n": str(n), "p0": str(p0)},
             {"sig": bool(p < 0.05), "stats": {"Proportion": x / n * 100, CI: [max(0, lo) * 100, min(1, hi) * 100], "z": z, "p-value": p}})
for name, x1, n1, x2, n2 in [("example", 18, 120, 9, 130), ("large", 412, 1500, 371, 1480)]:
    z, p = proportions_ztest([x1, x2], [n1, n2])
    lo, hi = confint_proportions_2indep(x1, n1, x2, n2, method="wald", compare="diff")
    sel_case("prop2", name, {"x1": str(x1), "n1": str(n1), "x2": str(x2), "n2": str(n2)},
             {"sig": bool(p < 0.05), "stats": {"Difference (1 − 2)": (x1 / n1 - x2 / n2) * 100, CI + " for the difference": [lo * 100, hi * 100], "z": z, "p-value": p}})

for name, tab in [("2 × 2", [[12, 5], [7, 14]]), ("4 × 2", [[86, 14], [71, 29], [90, 12], [64, 31]]), ("3 × 4", [[8, 3, 6, 9], [4, 11, 5, 7], [9, 6, 12, 3]])]:
    c2, p, df, E = stats.chi2_contingency(tab, correction=False)
    text = "\t" + "\t".join(f"C{j + 1}" for j in range(len(tab[0]))) + "\n" + "\n".join(f"R{i + 1}\t" + "\t".join(map(str, r)) for i, r in enumerate(tab))
    sel_case("chi", name, {"data": text}, {"sig": bool(p < 0.05), "stats": {"Total count": int(np.sum(tab)), "Chi-squared": c2, "Degrees of freedom": df,
             "Smallest expected count": E.min(), "p-value": p}})

for name, n, slope in [("12 points", 12, 0.8), ("60 points, weak", 60, 0.05)]:
    x = data("normal", n, mean=30, sd=6)
    y = [round(slope * a + float(e), 2) for a, e in zip(x, rng.normal(0, 4, n))]
    lr = stats.linregress(x, y); tc = stats.t.ppf(0.975, n - 2)
    sel_case("slr", name, {"data": wide(["X", "Y"], [x, y])}, {"sig": bool(lr.pvalue < 0.05), "stats": {"Slope": lr.slope,
             CI + " for the slope": [lr.slope - tc * lr.stderr, lr.slope + tc * lr.stderr], "R² (share of the variation explained)": lr.rvalue ** 2 * 100,
             "t": lr.slope / lr.stderr, "Degrees of freedom": n - 2, "p-value for the slope": lr.pvalue}})

def mlr_data(n, k, scale=1.5):
    X = rng.normal(10, 3, (n, k)).round(2)
    y = (X @ rng.normal(0, 1, k) + 5 + rng.normal(0, scale, n)).round(2)
    return X, y


for name, n, k in [("2 inputs", 30, 2), ("4 inputs", 45, 4)]:
    X, y = mlr_data(n, k)
    names = [f"X{j + 1}" for j in range(k)]
    f = sm.OLS(y, sm.add_constant(X)).fit()
    table = {"Constant": {"1": f.params[0], "2": f.bse[0]}}
    for j, nm in enumerate(names):
        table[nm] = {"1": f.params[j + 1], "2": f.bse[j + 1], "3": f.tvalues[j + 1], "4": f.pvalues[j + 1], "5": "Yes" if f.pvalues[j + 1] < 0.05 else "No"}
    sel_case("mlr", name, {"data": wide(names + ["Y"], [X[:, j].tolist() for j in range(k)] + [y.tolist()])},
             {"sig": bool(f.f_pvalue < 0.05), "stats": {"Observations": n, "R²": f.rsquared * 100, "Adjusted R²": f.rsquared_adj * 100,
              "F for the whole model": f.fvalue, "Degrees of freedom": [k, n - k - 1], "p-value for the whole model": f.f_pvalue}, "table": table})

for name, n, coef in [("2 inputs", 150, [-5, 0.045, 0.15]), ("1 input", 80, [-1, 0.03])]:
    k = len(coef) - 1
    X = np.column_stack([rng.uniform(20, 90, n).round(0)] + [rng.uniform(1, 14, n).round(0) for _ in range(k - 1)])
    pr = 1 / (1 + np.exp(-(coef[0] + X @ np.array(coef[1:]))))
    yes = rng.uniform(size=n) < pr
    f = sm.Logit(yes.astype(float), sm.add_constant(X)).fit(disp=0, tol=1e-12, maxiter=100)
    names = ["Age", "Stay"][:k]
    zc = stats.norm.ppf(0.975)
    table = {"Constant": {"1": f.params[0], "2": f.bse[0]}}
    for j, nm in enumerate(names):
        b, se = f.params[j + 1], f.bse[j + 1]
        table[nm] = {"1": b, "2": se, "3": b / se, "4": f.pvalues[j + 1], "5": math.exp(b), "6": [math.exp(b - zc * se), math.exp(b + zc * se)]}
    text = "\t".join(names + ["Readmitted"]) + "\n" + "\n".join("\t".join([str(v) for v in X[i].tolist()] + ["Yes" if yes[i] else "No"]) for i in range(n))
    sel_case("logistic", name, {"data": text}, {"sig": bool(f.llr_pvalue < 0.05), "stats": {"Observations": n, "Likelihood ratio chi-squared": f.llr,
             "Degrees of freedom": k, "p-value for the model": f.llr_pvalue}, "table": table})

SEL_NAMES = {"t1": "1-sample t-test", "sign": "1-sample sign test", "t2": "2-sample t-test (Welch and pooled)", "tPaired": "paired t-test",
             "var2": "F test for two variances", "anova1": "one-way ANOVA", "bartlett": "Bartlett's test", "anova2": "two-way ANOVA (type III)",
             "boxcox": "Box-Cox transformation", "logT": "log transformation", "sqrtT": "square root transformation", "mann": "Mann-Whitney test",
             "levene": "Levene's test (medians)", "kruskal": "Kruskal-Wallis test", "mood": "Mood's median test", "prop1": "1-proportion z-test",
             "prop2": "2-proportion z-test", "chi": "chi-squared test of a table", "slr": "simple regression", "mlr": "multiple regression",
             "logistic": "binary logistic regression"}
SEL_NOTES = {"boxcox": "the tool searches λ in steps of 0.01, so its best λ is within 0.005 of SciPy's maximum likelihood value",
             "mood": "SciPy median_test with values equal to the median counted below and no continuity correction",
             "anova2": "statsmodels, type III sums of squares with sum-to-zero coding",
             "logistic": "statsmodels Logit; the tool stops when every step is below 1e-8",
             "mann": "SciPy, normal approximation with the continuity and ties corrections"}
for id, cases in sel.items():
    tol, abs_tol = (1e-6, 1e-9) if id == "logistic" else (1e-7, 1e-10)
    if id == "boxcox":
        # the best λ is checked to the grid's step; everything else exactly
        group(f"selector: {SEL_NAMES[id]}, best λ", "RUN." + id, [SEL],
              [dict(c, expect={"stats": {"Best λ (lambda)": c["expect"]["stats"].pop("Best λ (lambda)")}}) for c in cases],
              call="selector", tol=0, abs_tol=0.0051, note=SEL_NOTES[id])
    group(f"selector: {SEL_NAMES[id]}", "RUN." + id, [SEL], cases, call="selector", tol=tol, abs_tol=abs_tol, note=SEL_NOTES.get(id))

# ------------------------------------------------------------- ANOVA tool: equal spread, pairwise comparisons, Holm
group("Holm's adjustment", "holm", ["anova"],
      [{"args": [ps], "expect": r(multipletests(ps, method="holm")[1])}
       for ps in [[0.01, 0.04, 0.03, 0.005], [0.2, 0.5, 0.001], [0.04, 0.04, 0.04], [0.3, 0.6, 0.9, 0.0001, 0.02, 0.011]]])
post = []
for name, g in many:
    k = len(g); N = sum(map(len, g))
    msw = sum(((np.array(x) - np.mean(x)) ** 2).sum() for x in g) / (N - k)
    for welch in [False, True]:
        pairs = []
        for i in range(k):
            for j in range(i + 1, k):
                a, b = g[i], g[j]
                if welch:
                    res = stats.ttest_ind(a, b, equal_var=False)
                    se = math.sqrt(np.var(a, ddof=1) / len(a) + np.var(b, ddof=1) / len(b)); df, p = res.df, res.pvalue
                else:
                    se = math.sqrt(msw * (1 / len(a) + 1 / len(b))); df = N - k
                    p = 2 * stats.t.sf(abs((np.mean(a) - np.mean(b)) / se), df)
                pairs.append({"diff": np.mean(a) - np.mean(b), "se": se, "df": df, "p": p})
        for pr_, adj in zip(pairs, multipletests([x["p"] for x in pairs], method="holm")[1]):
            pr_["padj"] = adj
        lev = stats.levene(*g, center="median")
        post.append({"name": f"{name}, {'Welch' if welch else 'pooled'}", "args": [g, welch],
                     "expect": clean({"spread": {"F": lev.statistic, "df1": k - 1, "df2": N - k, "p": lev.pvalue}, "pairs": pairs})})
group("ANOVA: Brown-Forsythe spread test and pairwise comparisons (Holm)", "pairwise", ["anova"], post, call="anovaPost", tol=1e-8, abs_tol=1e-12,
      note="spread test against SciPy levene(center='median'); pairwise t-tests (pooled or Welch) with statsmodels' Holm adjustment")

# ------------------------------------------------------------- multiple regression tool
reg = []
for name, n, k, cat, collinear in [("3 numeric inputs", 40, 3, False, False), ("numeric and a category", 50, 2, True, False),
                                   ("an input that copies another", 30, 2, False, True)]:
    X, y = mlr_data(n, k, scale=2)
    cols = {f"X{j + 1}": X[:, j] for j in range(k)}
    if collinear:
        cols["X3"] = (2 * X[:, 0] - X[:, 1]).round(2)
    if cat:
        site = rng.choice(["North", "South", "East"], n, p=[0.5, 0.3, 0.2])
        y = (y + np.where(site == "South", 3, 0) + np.where(site == "East", -2, 0)).round(2)
        # start with the least common site, so the reference level (the most
        # common) isn't simply the first one seen
        first = int(np.flatnonzero(site == "East")[0])
        for c in list(cols) + ["y"]:
            a = cols[c] if c != "y" else y
            a[[0, first]] = a[[first, 0]]
        site[[0, first]] = site[[first, 0]]
        cols["Site"] = site
    cols["Y"] = y
    df = pd.DataFrame(cols)
    terms = [c for c in cols if c.startswith("X")]
    if collinear:
        terms = terms[:-1]
    design = df[terms].astype(float)
    tnames = list(terms)
    if cat:
        ref = df["Site"].value_counts().idxmax()
        for lvl in pd.unique(df["Site"]):
            if lvl != ref:
                design[f"Site: {lvl}"] = (df["Site"] == lvl).astype(float); tnames.append(f"Site: {lvl}")
    Xd = sm.add_constant(design)
    f = sm.OLS(y, Xd).fit()
    infl = f.get_influence()
    ci = f.conf_int(0.05)
    from statsmodels.stats.outliers_influence import variance_inflation_factor
    from statsmodels.stats.stattools import durbin_watson
    coefs = []
    for j in range(Xd.shape[1]):
        c = {"b": f.params.iloc[j], "se": f.bse.iloc[j], "t": f.tvalues.iloc[j], "p": f.pvalues.iloc[j], "lo": ci.iloc[j, 0], "hi": ci.iloc[j, 1]}
        if j:
            c["vif"] = variance_inflation_factor(Xd.values, j)
        coefs.append(c)
    text = "\t".join(cols) + "\n" + "\n".join("\t".join(str(df[c].iloc[i]) for c in cols) for i in range(n))
    reg.append({"name": name, "args": [text, len(cols) - 1], "expect": clean({
        "terms": tnames, "dropped": ["X3"] if collinear else [], "r2": f.rsquared, "adj": f.rsquared_adj, "s": math.sqrt(f.mse_resid),
        "F": f.fvalue, "pF": f.f_pvalue, "dw": durbin_watson(f.resid), "coefs": coefs,
        "stud": infl.resid_studentized_internal, "cook": infl.cooks_distance[0]})})
group("multiple regression: coefficients, tests, fit and diagnostics", "fit", ["multiple_regression"], reg, call="regression", tol=1e-7, abs_tol=1e-10,
      note="statsmodels OLS: coefficients, standard errors, p-values and intervals, R², F, Durbin-Watson, studentised residuals, Cook's distance and VIF")

# ------------------------------------------------------------- Gauge R&R
# d2 and d3 (the mean and standard deviation of the range of m normal values)
# by numerical integration, and d2* = √(d2² + d3²/g) (Duncan's approximation,
# which the AIAG tables list).
from scipy import integrate
N_ = stats.norm


def d2_of(m):
    return integrate.quad(lambda x: 1 - N_.cdf(x) ** m - N_.sf(x) ** m, -np.inf, np.inf, epsabs=1e-13)[0]


def d3_of(m):
    # E[R²] = 2 ∫∫ over x < y of P(min < x and max > y)
    f = lambda y, x: 1 - N_.cdf(y) ** m - N_.sf(x) ** m + max(0.0, N_.cdf(y) - N_.cdf(x)) ** m if y > x else 0.0
    er2 = 2 * integrate.dblquad(f, -9, 9, lambda x: x, lambda x: 9, epsabs=1e-11)[0]
    return math.sqrt(er2 - d2_of(m) ** 2)


D2X = {m: d2_of(m) for m in range(2, 11)}
D3X = {m: d3_of(m) for m in range(2, 11)}
assert abs(D2X[2] - 2 / math.sqrt(math.pi)) < 1e-10 and abs(D3X[2] - 0.8525) < 1e-4 and abs(D2X[5] - 2.326) < 1e-3


def d2star_ref(g, m):
    return D2X[m] if g > 20 else math.sqrt(D2X[m] ** 2 + D3X[m] ** 2 / g)


ds = []
for m in [2, 3, 4]:
    ds += [{"name": f"g={g}, m={m}", "args": [g, m], "expect": d2star_ref(g, m)} for g in [1, 2, 3, 5, 10, 15, 20]]
ds += [{"name": f"g=1, m={m}", "args": [1, m], "expect": d2star_ref(1, m)} for m in range(5, 11)]
group("Gauge R&R: d2* for the X-bar and R method", "d2star", ["gauge_rr"], ds, tol=0, abs_tol=2e-5,
      note="reference: d2 and d3 by numerical integration, d2* = √(d2² + d3²/g); the tool's AIAG table is to 5 decimal places")
ds2 = [{"name": f"g={g}, m={m}", "args": [g, m], "expect": d2star_ref(g, m)} for g, m in [(25, 2), (30, 3), (60, 5), (6, 5), (12, 7)]]
group("Gauge R&R: d2* beyond the table (d2 for more than 20 subgroups)", "d2star", ["gauge_rr"], ds2, tol=0, abs_tol=2e-3,
      note="beyond the table the tool uses control chart constants to 3 decimal places")
group("Gauge R&R: grading the % study variation (AIAG: under 10%, 10 to 30%, over 30%)", "grade", ["gauge_rr"],
      [{"args": [x], "expect": {"text": t}} for x, t in [(0.05, "Excellent"), (0.0999, "Excellent"), (0.1, "Acceptable"), (0.25, "Acceptable"),
                                                       (0.3, "Acceptable"), (0.3001, "Unacceptable"), (0.8, "Unacceptable")]])


def gauge_data(p, o, r, part_sd, op_sd, inter_sd, rep_sd):
    pe, oe = rng.normal(0, part_sd, p), rng.normal(0, op_sd, o)
    ie = rng.normal(0, inter_sd, (p, o))
    rows = [(f"P{i + 1}", f"Op {'ABCDE'[j]}", round(100 + pe[i] + oe[j] + ie[i, j] + float(rng.normal(0, rep_sd)), 2))
            for i in range(p) for j in range(o) for _ in range(r)]
    order = rng.permutation(len(rows))
    return [rows[i] for i in order]


def gauge_table(comp, o):
    out = {}
    tot = comp["total"]
    for key, v in comp.items():
        if v is None:
            continue
        sd = math.sqrt(v)
        out[key] = {"sd": sd, "contrib": v / tot, "psv": sd / math.sqrt(tot), "pproc": sd / o["histSd"],
                    "ptol": o["k"] * sd / o["tol"]["width"] if o["tol"]["two"] else o["k"] * sd / 2 / o["tol"]["half"]}
    return out


gc, gx = [], []
OPTS = [{"k": 6, "tol": {"two": True, "width": 40}, "histSd": 15, "appName": "Operator", "partName": "Part"},
        {"k": 5.15, "tol": {"two": False, "half": 25}, "histSd": 9, "appName": "Operator", "partName": "Part"}]
for name, (p, o, r, sds), opts in [("interaction", (10, 3, 3, (8, 1.5, 2.5, 1)), OPTS[0]), ("no interaction", (10, 3, 2, (6, 2, 0, 1.2)), OPTS[1]),
                                   ("one appraiser", (8, 1, 3, (5, 0, 0, 1)), OPTS[0]), ("2 appraisers, 5 parts", (5, 2, 2, (3, 0.5, 0, 0.8)), OPTS[1]),
                                   ("interaction not clear (p between 0.05 and 0.25)", (10, 3, 2, (6, 1, 0.6, 1)), OPTS[0])]:
    rows = gauge_data(p, o, r, *sds)
    if name.startswith("interaction not clear"):
        # draw until the interaction's p-value falls in the band, so the 0.05 cut-off is tested
        while not 0.06 < sm.stats.anova_lm(smf.ols("y ~ C(P) * C(O)", data=pd.DataFrame(rows, columns=["P", "O", "y"])).fit(), typ=2).loc["C(P):C(O)", "PR(>F)"] < 0.24:
            rows = gauge_data(p, o, r, *sds)
    df = pd.DataFrame(rows, columns=["P", "O", "y"])
    text = "Part\tOperator\tValue\n" + "\n".join(f"{a}\t{b}\t{c}" for a, b, c in rows)
    if o > 1:
        t = sm.stats.anova_lm(smf.ols("y ~ C(P) * C(O)", data=df).fit(), typ=2)
        ss = {"P": t.loc["C(P)", "sum_sq"], "O": t.loc["C(O)", "sum_sq"], "PO": t.loc["C(P):C(O)", "sum_sq"], "E": t.loc["Residual", "sum_sq"]}
        dfs = {"P": p - 1, "O": o - 1, "PO": (p - 1) * (o - 1), "E": p * o * (r - 1)}
        ms = {k: ss[k] / dfs[k] for k in ss}
        full = {"P": {"df": dfs["P"], "ss": ss["P"], "ms": ms["P"], "F": ms["P"] / ms["PO"], "p": stats.f.sf(ms["P"] / ms["PO"], dfs["P"], dfs["PO"])},
                "O": {"df": dfs["O"], "ss": ss["O"], "ms": ms["O"], "F": ms["O"] / ms["PO"], "p": stats.f.sf(ms["O"] / ms["PO"], dfs["O"], dfs["PO"])},
                "PO": {"df": dfs["PO"], "ss": ss["PO"], "ms": ms["PO"], "F": ms["PO"] / ms["E"], "p": stats.f.sf(ms["PO"] / ms["E"], dfs["PO"], dfs["E"])},
                "E": {"df": dfs["E"], "ss": ss["E"], "ms": ms["E"]}, "T": {"df": p * o * r - 1, "ss": sum(ss.values())}}
        inter = full["PO"]["p"] < 0.05
        if inter:
            comp = {"rep": ms["E"], "op": max(0, (ms["O"] - ms["PO"]) / (p * r)), "po": max(0, (ms["PO"] - ms["E"]) / r),
                    "part": max(0, (ms["P"] - ms["PO"]) / (o * r))}
            reduced = None
        else:
            dfE = dfs["PO"] + dfs["E"]; msE = (ss["PO"] + ss["E"]) / dfE
            reduced = {"P": {"F": ms["P"] / msE, "p": stats.f.sf(ms["P"] / msE, dfs["P"], dfE)},
                       "O": {"F": ms["O"] / msE, "p": stats.f.sf(ms["O"] / msE, dfs["O"], dfE)}, "E": {"df": dfE, "ss": ss["PO"] + ss["E"], "ms": msE}}
            comp = {"rep": msE, "op": max(0, (ms["O"] - msE) / (p * r)), "part": max(0, (ms["P"] - msE) / (o * r))}
        comp["repro"] = comp["op"] + comp.get("po", 0)
    else:
        t = sm.stats.anova_lm(smf.ols("y ~ C(P)", data=df).fit(), typ=2)
        ssP, ssE = t.loc["C(P)", "sum_sq"], t.loc["Residual", "sum_sq"]
        msP, msE = ssP / (p - 1), ssE / (p * (r - 1))
        full = {"P": {"F": msP / msE, "p": stats.f.sf(msP / msE, p - 1, p * (r - 1))}, "E": {"ss": ssE, "ms": msE}}
        inter, reduced = None, None
        comp = {"rep": msE, "part": max(0, (msP - msE) / r)}
    comp["grr"] = comp["rep"] + comp.get("repro", 0)
    comp["total"] = comp["grr"] + comp["part"]
    expect = {"full": full, "comp": comp, "rows": gauge_table(comp, opts)}
    if o > 1:
        expect["interaction"] = bool(inter)
        expect["reduced"] = reduced
    if name == "interaction":
        assert inter
    if name == "no interaction":
        assert not inter
    gc.append({"name": name, "args": [text, "anova", opts], "expect": clean(expect)})
    # X-bar and R: range of each part and appraiser's repeats, with d2* from the integrals above
    cells = df.groupby(["P", "O"])["y"]
    Rbar = (cells.max() - cells.min()).mean()
    ev = Rbar / d2star_ref(p * o, r)
    om, pm = df.groupby("O")["y"].mean(), df.groupby("P")["y"].mean()
    av = math.sqrt(max(0, ((om.max() - om.min()) / d2star_ref(1, o)) ** 2 - ev * ev / (p * r))) if o > 1 else None
    pv = (pm.max() - pm.min()) / d2star_ref(1, p)
    xc = {"rep": ev * ev, "repro": None if av is None else av * av, "part": pv * pv}
    xc["grr"] = xc["rep"] + (xc["repro"] or 0); xc["total"] = xc["grr"] + xc["part"]
    gx.append({"name": name, "args": [text, "xbarr", opts], "expect": clean({"Rbar": Rbar, "comp": xc, "rows": gauge_table(xc, opts)})})
group("Gauge R&R: ANOVA method", "anova", ["gauge_rr"], gc, call="gauge", tol=1e-9, abs_tol=1e-12,
      note="sums of squares from statsmodels; parts and appraisers tested against the interaction, which is pooled when p ≥ 0.05 (AIAG); "
           "variance components from the expected mean squares")
group("Gauge R&R: X-bar and R method", "xbarR", ["gauge_rr"], gx, call="gauge", tol=1e-3, abs_tol=1e-12,
      note="AIAG average and range method with d2* from numerical integration; beyond 20 subgroups the tool uses d2 to 3 decimal "
           "places (as AIAG tables it), which squared in the variances agrees to about 1 part in 10³")

# ------------------------------------------------------------- attribute agreement
from statsmodels.stats.inter_rater import fleiss_kappa, aggregate_raters


def agree_ci(x, n):
    # Clopper-Pearson; a 100% or 0% result gets a one-sided 95% bound, as Minitab does
    if x == n:
        return stats.beta.ppf(0.05, x, 1), 1.0
    if x == 0:
        return 0.0, stats.beta.ppf(0.95, 1, n)
    return proportion_confint(x, n, 0.05, method="beta")


def fk(rows, cats):
    return fleiss_kappa(aggregate_raters(np.array(rows), n_cat=None)[0]) if len({v for r in rows for v in r}) > 1 else float("nan")


def kendall_w(cols):
    m, n = len(cols), len(cols[0])
    chi = stats.friedmanchisquare(*[[c[i] for c in cols] for i in range(n)]).statistic
    return chi / (m * (n - 1))


def attribute_ref(R, std, kendall):
    # R[case][appraiser][trial]
    n, A, T = len(R), len(R[0]), len(R[0][0])
    def entry(x, c):
        lo, hi = agree_ci(x, n)
        return {"x": x, "n": n, "p": x / n, "lo": lo, "hi": hi, "coef": c}
    out = {}
    if T >= 2:
        out["within"] = [entry(sum(len(set(R[i][a])) == 1 for i in range(n)),
                               kendall_w([[R[i][a][t] for i in range(n)] for t in range(T)]) if kendall else fk([R[i][a] for i in range(n)], None))
                         for a in range(A)]
    if std is not None:
        per = []
        for a in range(A):
            if kendall:
                c = np.mean([stats.kendalltau([R[i][a][t] for i in range(n)], std).statistic for t in range(T)])
            else:
                c = np.mean([fk([[R[i][a][t], std[i]] for i in range(n)], None) for t in range(T)])
            per.append(entry(sum(all(v == std[i] for v in R[i][a]) for i in range(n)), c))
        out["vsStd"] = per
    if A >= 2:
        flat = [[v for a in range(A) for v in R[i][a]] for i in range(n)]
        out["between"] = entry(sum(len(set(f)) == 1 for f in flat),
                               kendall_w([[R[i][a][t] for i in range(n)] for a in range(A) for t in range(T)]) if kendall else fk(flat, None))
    if std is not None:
        out["allStd"] = entry(sum(all(v == std[i] for a in range(A) for v in R[i][a]) for i in range(n)), float(np.mean([e["coef"] for e in out["vsStd"]])))
    return out


def ratings(n, A, T, k, good):
    std = rng.integers(1, k + 1, n)
    R = [[[int(min(k, max(1, s + (0 if rng.uniform() < good[a] else rng.choice([-1, 1]))))) for _ in range(T)] for a in range(A)] for s in std]
    return std.tolist(), R


ac = []
for name, (n, A, T, k, good), kendall in [("4 ordered categories, kappa", (30, 3, 2, 4, [0.9, 0.8, 0.65]), False),
                                         ("4 ordered categories, Kendall", (30, 3, 2, 4, [0.9, 0.8, 0.65]), True),
                                         ("3 trials, 2 appraisers", (25, 2, 3, 3, [0.85, 0.7]), False),
                                         ("1 trial, 4 appraisers", (40, 4, 1, 5, [0.9, 0.85, 0.8, 0.6]), False)]:
    std, R = ratings(n, A, T, k, good)
    head = ["Case", "Standard"] + [f"{'ABCD'[a]} trial {t + 1}" for a in range(A) for t in range(T)]
    text = "\t".join(head) + "\n" + "\n".join("\t".join([str(i + 1), str(std[i])] + [str(v) for a in range(A) for v in R[i][a]]) for i in range(n))
    ac.append({"name": name, "args": [text, {"hasHeader": True, "hasId": True, "hasStd": True, "trials": T}, [str(c) for c in range(1, k + 1)], kendall],
               "expect": clean(attribute_ref(R, std, kendall))})
# every rating right: the one-sided bound at 100%
std, R = ratings(12, 2, 2, 3, [1, 1])
text = "Case\tStandard\tA 1\tA 2\tB 1\tB 2\n" + "\n".join("\t".join([str(i + 1), str(std[i])] + [str(v) for a in range(2) for v in R[i][a]]) for i in range(12))
ac.append({"name": "every rating right", "args": [text, {"hasHeader": True, "hasId": True, "hasStd": True, "trials": 2}, ["1", "2", "3"], False],
           "expect": clean(attribute_ref(R, std, False))})
# two categories as text, with the ways each appraiser gets it wrong
std, R = ratings(40, 3, 2, 2, [0.92, 0.8, 0.7])
word = {1: "Fail", 2: "Pass"}
text = "Item\tStandard\tA 1\tA 2\tB 1\tB 2\tC 1\tC 2\n" + "\n".join("\t".join([str(i + 1), word[std[i]]] + [word[v] for a in range(3) for v in R[i][a]]) for i in range(40))
exp = attribute_ref(R, std, False)
n1, n2 = std.count(1), std.count(2)
exp["disagree"] = []
for a in range(3):
    as1 = sum(std[i] == 2 and all(v == 1 for v in R[i][a]) for i in range(40))
    as2 = sum(std[i] == 1 and all(v == 2 for v in R[i][a]) for i in range(40))
    mixed = sum(len(set(R[i][a])) > 1 for i in range(40))
    exp["disagree"].append({"as1": as1, "p1": as1 / n2, "as2": as2, "p2": as2 / n1, "mixed": mixed, "pm": mixed / 40})
ac.append({"name": "pass or fail, as text", "args": [text, {"hasHeader": True, "hasId": True, "hasStd": True, "trials": 2}, ["fail", "pass"], False],
           "expect": clean(exp)})
group("attribute agreement: agreement, confidence intervals, kappa and Kendall", "analyse", ["attribute_agreement"], ac, call="attribute",
      tol=1e-9, abs_tol=1e-12,
      note="Clopper-Pearson intervals (one-sided at 0% and 100%, as Minitab); Fleiss' kappa from statsmodels; "
           "Kendall's W from SciPy's Friedman test (W = χ² / m(n − 1)); Kendall's tau-b from SciPy")

# ------------------------------------------------------------- design of experiments
LET = "ABCD"


def all_terms(k):
    from itertools import combinations
    return ["".join(LET[j] for j in c) for size in range(1, k + 1) for c in combinations(range(k), size)]


def coded(k, reps):
    # standard order, factor A changing fastest
    return [[1 if (i >> j) & 1 else -1 for j in range(k)] for _ in range(reps) for i in range(1 << k)]


def design_y(X, effects, sd, gen=None):
    gen = gen or rng
    return [round(30 + sum(v * np.prod([x[LET.index(c)] for c in t]) for t, v in effects.items()) + float(gen.normal(0, sd)), 1) for x in X]


def doe_ols(X, y, terms):
    M = np.array([[1.0] + [float(np.prod([x[LET.index(c)] for c in t])) for t in terms] for x in X])
    return sm.OLS(np.array(y), M).fit()


dc = []
for name, k, reps, terms, effects in [("3 factors, 2 repeats, full model", 3, 2, None, {"A": -4, "B": 1.5, "AC": 2}),
                                      ("4 factors, main effects and 2-way interactions", 4, 1, "2fi", {"A": 3, "D": -2, "AD": 1.5}),
                                      ("2 factors, 3 repeats, main effects", 2, 3, ["A", "B"], {"A": 2, "B": 0.5})]:
    X = coded(k, reps)
    y = design_y(X, effects, 1.2)
    terms = all_terms(k) if terms is None else [t for t in all_terms(k) if len(t) <= 2] if terms == "2fi" else terms
    f = doe_ols(X, y, terms)
    dc.append({"name": name, "args": [[{"x": x, "y": v} for x, v in zip(X, y)], terms],
               "expect": clean({"cols": [""] + terms, "coef": f.params, "se": f.bse, "pv": f.pvalues, "df": f.df_resid,
                                "s": math.sqrt(f.mse_resid), "r2": f.rsquared, "r2adj": max(0, f.rsquared_adj)})})
# unreplicated with every term: a perfect fit, nothing left to test against
X = coded(2, 1); y = design_y(X, {"A": 2}, 1)
dc.append({"name": "2 factors, no repeats, full model", "args": [[{"x": x, "y": v} for x, v in zip(X, y)], all_terms(2)],
           "expect": clean({"coef": doe_ols(X, y, all_terms(2)).params, "df": 0, "pv": [None] * 4})})
group("design of experiments: fit in coded units", "fit", ["design_of_experiments"], dc, call="doeFit", tol=1e-9, abs_tol=1e-12,
      note="statsmodels OLS on the coded design (−1 and +1)")

du = []
FACT = [{"name": "Nurses", "type": "numeric", "low": "2", "high": "3"}, {"name": "Minutes", "type": "numeric", "low": "10", "high": "30"},
        {"name": "Kiosk", "type": "text", "low": "Off", "high": "On"}, {"name": "", "type": "text", "low": "", "high": ""}]
for name, terms in [("all terms", all_terms(3)), ("A, B, C and AB", ["A", "B", "C", "AB"]), ("A, C and AC", ["A", "C", "AC"])]:
    X = coded(3, 2); y = design_y(X, {"A": -3, "B": 2, "AB": 1.5, "C": -1}, 1)
    lows, highs = [2, 10], [3, 30]
    real = [[lows[j] + (x[j] + 1) / 2 * (highs[j] - lows[j]) for j in range(2)] + [x[2]] for x in X]
    f = doe_ols(real, y, terms)
    coded_fit = doe_ols(X, y, terms)
    fixed = [{"0": 1}, {"0": -1}, {"2": 1}, {"0": 1, "1": -1}]
    means = [float(np.mean([coded_fit.fittedvalues[i] for i, x in enumerate(X) if all(x[int(j)] == v for j, v in fx.items())])) for fx in fixed]
    if terms == all_terms(3):  # the full model's fitted means are the observed means
        means_obs = [float(np.mean([y[i] for i, x in enumerate(X) if all(x[int(j)] == v for j, v in fx.items())])) for fx in fixed]
        assert np.allclose(means, means_obs)
    du.append({"name": name, "args": [{"k": 3, "factors": FACT}, [{"x": x, "y": v} for x, v in zip(X, y)], terms, fixed],
               "expect": clean({"uncoded": dict(zip([""] + terms, f.params)), "means": means})})
group("design of experiments: equation in real units and fitted means", "uncoded", ["design_of_experiments"], du, call="doeUncoded",
      tol=1e-8, abs_tol=1e-9,
      note="the equation from refitting in real units with statsmodels (text factors stay −1 and +1); means of the fitted values over the design")


def backward(X, y, terms, alpha):
    # drop the least clear term that no interaction depends on; with nothing to
    # test against, drop the last of the highest-order removable terms
    terms = list(terms)
    sub = lambda a, b: a != b and all(c in b for c in a)
    for _ in range(20):
        if not terms:
            break
        removable = [t for t in terms if not any(sub(t, u) for u in terms)]
        M = np.array([[1.0] + [float(np.prod([x[LET.index(c)] for c in t])) for t in terms] for x in X])
        if len(X) - len(terms) - 1 <= 0 or np.linalg.matrix_rank(M) < M.shape[1]:
            top = max(map(len, removable))
            terms.remove([t for t in removable if len(t) == top][-1])
            continue
        f = doe_ols(X, y, terms)
        ps = {t: f.pvalues[1 + terms.index(t)] for t in removable}
        worst = max(removable, key=lambda t: ps[t])
        if ps[worst] < alpha:
            break
        terms.remove(worst)
    return terms


dr = []
# each case has its own seed, chosen so some terms are dropped and some kept
SEEDS = {"3 factors, 2 repeats": 1, "4 factors, 2 repeats, alpha 0.1": 2, "3 factors, no repeats": 3, "4 factors, no repeats, 3 results missing": 4}
for name, k, reps, effects, alpha, missing in [("3 factors, 2 repeats", 3, 2, {"A": -4, "C": 2.5, "AC": 2}, 0.05, []),
                                               ("4 factors, 2 repeats, alpha 0.1", 4, 2, {"B": 3, "D": -1.2, "BD": 1}, 0.1, []),
                                               ("3 factors, no repeats", 3, 1, {"A": 5, "B": -3}, 0.05, []),
                                               # until the model can be tested, the last of the 3-way interactions is dropped
                                               # each time, so ABC (a real effect here) stays in
                                               ("4 factors, no repeats, 3 results missing", 4, 1, {"A": 3, "B": 2, "ABC": 4}, 0.05, [5, 10, 15])]:
    X = coded(k, reps); y = design_y(X, effects, 0.3 if missing else 1, np.random.default_rng(SEEDS[name]))
    have = [i for i in range(len(X)) if i + 1 not in missing]
    keep = backward([X[i] for i in have], [y[i] for i in have], all_terms(k), alpha)
    state = {"k": k, "reps": reps, "terms": all_terms(k), "alpha": str(alpha), "y": {str(i + 1): y[i] for i in have},
             "factors": FACT}
    assert 0 < len(keep) < len(all_terms(k)), (name, keep)
    dr.append({"name": name, "args": [state], "expect": keep})
group("design of experiments: backward elimination", "reduce", ["design_of_experiments"], dr, call="doeReduce",
      note="the same steps written in Python on statsmodels p-values")

# ------------------------------------------------------------- box plot, histogram and Pareto chart
from matplotlib.cbook import boxplot_stats
from numpy.lib import _histograms_impl as npbins
from collections import Counter

bp = []
for name, v in [("normal", data("normal", 25)), ("skewed, with outliers", data("skewed", 60, sigma=0.9)),
                ("ties", data("ties", 30, top=9)), ("outliers both sides", data("normal", 20, sd=2) + [20.0, 21.5, 80.0, 85.0]),
                ("4 values", [3.0, 3.0, 3.0, 9.0]),
                # quartiles 10 and 20, so the fences are −5 and 35: 35 is on the fence (not an outlier), 36 and −6 are just past
                ("values on and just past the fences", [-6.0, 0.0, 10.0, 10.0, 10.0, 15.0, 20.0, 20.0, 20.0, 35.0, 36.0])]:
    b = boxplot_stats(np.array(v), whis=1.5)[0]
    for tukey in [True, False]:
        e = {"n": len(v), "q1": b["q1"], "med": b["med"], "q3": b["q3"], "iqr": b["iqr"], "mean": np.mean(v), "sd": np.std(v, ddof=1),
             "lo": b["whislo"] if tukey else min(v), "hi": b["whishi"] if tukey else max(v), "outliers": sorted(b["fliers"]) if tukey else []}
        bp.append({"name": f"{name}{', Tukey' if tukey else ', min to max'}", "args": [v, tukey], "expect": clean(e)})
group("box plot: quartiles, whiskers and outliers", "describe", ["box_plot"], bp, call="boxPlot",
      note="matplotlib's boxplot_stats (whiskers at the furthest values within 1.5 × IQR of the box); quartiles by linear interpolation")


def nice_near(x):
    e = math.floor(math.log10(x)); f = x / 10 ** e
    return min([1, 2, 2.5, 5, 10], key=lambda c: abs(math.log(c / f))) * 10 ** e


def hist_ref(v, mode, val, start):
    v = np.array(v); n, lo_, hi_ = len(v), v.min(), v.max()
    if mode == "count":
        start = lo_ if start is None else start
        count, width = val, (hi_ - start) / val
        edges = np.linspace(start, hi_, count + 1)
        inner = edges[1:-1]
        assert all(np.min(np.abs(v - e)) > 1e-6 for e in inner), "a value sits on an inner edge"
    else:
        if mode == "width":
            width = val
        else:
            # numpy's 'auto' rule (the smaller of the Sturges and Freedman-Diaconis widths), rounded to a nice number
            sturges, fd = npbins._hist_bin_sturges(v, None), npbins._hist_bin_fd(v, None)
            assert abs(sturges - np.ptp(v) / (math.log2(n) + 1)) < 1e-12
            width = nice_near(min(fd, sturges) if fd > 0 else sturges)
            if "Sturges" in CASE[0]:
                assert sturges < fd and nice_near(np.ptp(v) / (math.log2(n) + 2)) != width
        start = math.floor(lo_ / width + 1e-9) * width if start is None else start
        count = math.floor((hi_ - start) / width + 1e-9) + 1
        edges = np.array([start + i * width for i in range(count + 1)])
    counts, _ = np.histogram(v, bins=edges)
    cum = np.cumsum(counts)
    return {"width": width, "start": start,
            "bins": [{"lo": edges[i], "hi": edges[i + 1], "n": counts[i], "pct": counts[i] / n * 100, "cum": cum[i] / n * 100} for i in range(count)]}


hb = []
CASE = [""]
for name, v, mode, val, start in [("automatic, normal", data("normal", 80), "auto", None, None),
                                  ("automatic, skewed", data("skewed", 200), "auto", None, None),
                                  ("automatic, small", data("normal", 12, mean=5, sd=1), "auto", None, None),
                                  # two clusters make the IQR wide, so Sturges' rule gives the narrower width
                                  ("automatic, two clusters (Sturges)", data("normal", 15, mean=10, sd=1) + data("normal", 15, mean=30, sd=1), "auto", None, None),
                                  ("automatic, 8 values in two groups (Sturges)", [0.0, 1.0, 2.0, 3.0, 13.0, 14.0, 15.0, 16.0], "auto", None, None),
                                  ("width 5, values on the edges", [float(x) for x in rng.integers(0, 41, 60)], "width", 5, None),
                                  ("width 2.5 from 0", data("normal", 50, mean=20, sd=4), "width", 2.5, 0),
                                  ("8 bins", data("normal", 40, mean=100, sd=15), "count", 8, None)]:
    CASE[0] = name
    hb.append({"name": name, "args": [v, mode, val, start], "expect": clean(hist_ref(v, mode, val, start))})
group("histogram: bins and counts", "makeBins", ["histogram"], hb, call="histBins", tol=1e-9, abs_tol=1e-9,
      note="counts from numpy.histogram on the same edges (each bin includes its lower edge, the last both); "
           "the automatic width is numpy's 'auto' rule (smaller of Sturges and Freedman-Diaconis) rounded to 1, 2, 2.5 or 5 × 10ⁿ")


def pareto_ref(pairs, group_after, cutoff):
    # case and spacing don't matter when grouping; the first spelling is kept
    tot, first = {}, {}
    for name, val in pairs:
        key = " ".join(name.lower().split())
        first.setdefault(key, name); tot[key] = tot.get(key, 0) + val
    items = [(first[k], tot[k]) for k in tot]
    main = sorted([d for d in items if d[0].lower() != "other"], key=lambda d: (-d[1], d[0]))
    other = [d for d in items if d[0].lower() == "other"]
    if group_after > 0 and len(main) > group_after + 1:
        rest = main[group_after:]
        other = [(f"Other ({len(rest) + len(other)} categories)", sum(d[1] for d in rest) + sum(d[1] for d in other))]
        main = main[:group_after]
    rows = main + other
    total = sum(d[1] for d in rows)
    cum = np.cumsum([d[1] for d in rows]) / total * 100
    vital = next((i + 1 for i, c in enumerate(cum) if c >= cutoff - 1e-9), len(rows))
    return {"total": total, "vital": vital, "rows": [{"name": d[0], "value": d[1], "pct": d[1] / total * 100, "cum": c} for d, c in zip(rows, cum)]}


REASONS = ["Waiting for bed", "Awaiting transport", "Medication delay", "Awaiting tests", "Social care", "Paperwork",
           "Family availability", "Equipment", "Other"]
pc = []
counts = [int(x) for x in rng.integers(1, 120, len(REASONS))]
pairs = list(zip(REASONS, counts))
text = "Reason\tCount\n" + "\n".join(f"{a}\t{b}" for a, b in pairs) + "\nwaiting  FOR bed\t7\nParking\t0\nUnknown\tn/a"
# 8 categories besides Other: grouping after 7 would leave one on its own, so nothing is grouped
for ga, cut in [(0, 80), (4, 80), (0, 50), (0, 100), (7, 80), (6, 80)]:
    e = pareto_ref(pairs + [("waiting  FOR bed", 7)], ga, cut)
    e["skipped"] = 2
    pc.append({"name": f"counts, group after {ga}, cut-off {cut}%", "args": [text, True, ga, cut], "expect": clean(e)})
tally = [REASONS[i] for i in rng.choice(len(REASONS) - 1, 150, p=np.array([30, 20, 15, 10, 8, 7, 6, 4]) / 100)]
pc.append({"name": "a list to count", "args": ["Reason\n" + "\n".join(tally), True, 0, 80],
           "expect": clean(dict(pareto_ref(list(Counter(tally).items()), 0, 80), skipped=0))})
pc.append({"name": "thousands separators, and a tie sorted by name", "args": ["Ward D,980\nWard A,\"1,250\"\nWard B,980\nWard C,2,100.5", False, 0, 80],
           "expect": clean(dict(pareto_ref([("Ward D", 980), ("Ward A", 1250), ("Ward B", 980), ("Ward C", 2100.5)], 0, 80), skipped=0))})
group("Pareto chart: order, percentages and the vital few", "compute", ["pareto_chart"], pc, call="pareto", tol=1e-12, abs_tol=1e-12,
      note="written out in Python: categories matched ignoring case and spacing, sorted largest first with Other last, "
           "the vital few up to the first category that reaches the cut-off")

# ------------------------------------------------------------- Weibull reliability
from scipy import optimize
from scipy.stats import weibull_min, CensoredData


def weibull_mle(y, m, c):
    """Maximum likelihood shape and scale, with m items still working at c: the likelihood equations
    (the log-likelihood's derivatives set to zero) written out and solved by SciPy."""
    y = np.array(y, float); r_ = len(y)
    def score(q):
        b, a = q
        z = y / a
        zc = c / a if m else 1.0
        db = r_ / b + np.sum(np.log(z)) - np.sum(z ** b * np.log(z)) - (m * zc ** b * np.log(zc) if m else 0)
        da = (b / a) * (np.sum(z ** b) + (m * zc ** b if m else 0) - r_)
        return [db, da]
    start = weibull_min.fit(CensoredData(uncensored=y, right=[c] * m) if m else y, floc=0)
    sol = optimize.root(score, [start[0], start[2]], method="hybr", options={"xtol": 1e-14})
    b, a = sol.x
    assert max(abs(v) for v in score(sol.x)) < 1e-8 * r_, sol
    assert abs(start[0] / b - 1) < 1e-4 and abs(start[2] / a - 1) < 1e-4  # SciPy's own fit, to its tolerance
    return b, a


wf = []
for name, n, shape, scale, cens in [("shape 1.5, 40 items", 40, 1.5, 100, None), ("shape 0.8, 25 items", 25, 0.8, 30, None),
                                    ("shape 3, 60 items", 60, 3.0, 500, None), ("censored at 80, 50 items", 50, 2.0, 90, 80),
                                    ("censored at 20, 30 items", 30, 1.2, 25, 20)]:
    t = np.sort(np.round(weibull_min.rvs(shape, scale=scale, size=n, random_state=rng), 2))
    fails = t[t < cens] if cens else t
    m = n - len(fails)
    b, a = weibull_mle(fails, m, cens or 0)
    wf.append({"name": name, "args": [fails.tolist(), m, cens or 0], "expect": {"beta": clean(b), "alpha": clean(a)}})
group("Weibull: maximum likelihood fit", "mleFit", ["weibull_reliability"], wf, tol=1e-7, abs_tol=1e-12,
      note="the likelihood equations (with right-censored items) solved by SciPy; SciPy's weibull_min.fit agrees to its own tolerance")

pp, rq = [], []
for n, N in [(10, 10), (25, 25), (18, 30)]:
    y = np.sort(np.round(weibull_min.rvs(1.7, scale=50, size=n, random_state=rng), 2)).tolist()
    F = [(i - 0.3) / (N + 0.4) for i in range(1, n + 1)]  # median ranks, Benard's approximation
    pts = [{"t": v, "F": f, "x": math.log(v), "y": math.log(-math.log(1 - f))} for v, f in zip(y, F)]
    pp.append({"name": f"{n} failures of {N}", "args": [y, N], "expect": clean(pts)})
    rq.append({"name": f"{n} failures of {N}", "args": [pts], "expect": clean(stats.linregress([p_["x"] for p_ in pts], [p_["y"] for p_ in pts]).rvalue ** 2)})
group("Weibull: probability plot points (median ranks, Benard: (i − 0.3) / (N + 0.4), as Minitab)", "probPoints", ["weibull_reliability"], pp, tol=1e-12, abs_tol=1e-15)
group("Weibull: R² of the probability plot", "rsq", ["weibull_reliability"], rq, tol=1e-10)

bt = []
for name, shape, scale, theta in [("threshold 40", 1.6, 60, 40), ("threshold 200", 2.2, 300, 200), ("threshold 5", 1.1, 10, 5),
                                  ("negative times, threshold −50", 1.8, 30, -50)]:
    y = np.sort(np.round(theta + weibull_min.rvs(shape, scale=scale, size=40, random_state=rng), 2))
    N = len(y)
    def neg_r2(th):
        v = y - th
        F = (np.arange(1, N + 1) - 0.3) / (N + 0.4)
        return -stats.linregress(np.log(v), np.log(-np.log(1 - F))).rvalue ** 2
    # search from 20 times the shortest time below it (not below 0 when every time is positive) up to just under it
    span = y[0] if y[0] > 0 else abs(y[0]) or 1
    lo, hi = y[0] - 20 * span, y[0] - span * 1e-6
    if lo < 0 and y[0] > 0:
        lo = 0
    grid = np.linspace(lo, hi, 201)
    g0 = grid[np.argmin([neg_r2(g) for g in grid])]
    step = (hi - lo) / 200
    best = optimize.minimize_scalar(neg_r2, bounds=(max(lo, g0 - step), min(hi, g0 + step)), method="bounded", options={"xatol": 1e-10}).x
    bt.append({"name": name, "args": [y.tolist(), N], "expect": clean(best)})
group("Weibull: threshold that makes the probability plot straightest", "bestThreshold", ["weibull_reliability"], bt, tol=1e-4, abs_tol=1e-6,
      note="SciPy's bounded search for the highest R², around the best of the same 201-point grid; the tool rounds to 5 significant figures")

wm = [("2-parameter", {"beta": 1.8, "alpha": 120, "theta": 0}), ("3-parameter", {"beta": 0.7, "alpha": 40, "theta": 15}),
      ("shape 1 (exponential)", {"beta": 1, "alpha": 10, "theta": 0})]
for fn, ref in [("surv", lambda d, t: weibull_min.sf(t, d["beta"], loc=d["theta"], scale=d["alpha"])),
                ("pdf", lambda d, t: weibull_min.pdf(t, d["beta"], loc=d["theta"], scale=d["alpha"])),
                ("hazard", lambda d, t: weibull_min.pdf(t, d["beta"], loc=d["theta"], scale=d["alpha"]) / weibull_min.sf(t, d["beta"], loc=d["theta"], scale=d["alpha"]))]:
    group(f"Weibull: {dict(surv='survival', pdf='density', hazard='hazard (failure rate)')[fn]}", fn, ["weibull_reliability"],
          [{"name": f"{nm}, t={t}", "args": [d, t], "expect": clean(ref(d, t))} for nm, d in wm for t in [d["theta"] + 0.5, 20, 60, 150, 400] if t > d["theta"]],
          tol=1e-10, abs_tol=1e-300)
group("Weibull: time by which a given share is still working", "timeAtSurv", ["weibull_reliability"],
      [{"name": f"{nm}, {p_:.0%} working", "args": [d, p_], "expect": clean(weibull_min.isf(p_, d["beta"], loc=d["theta"], scale=d["alpha"]))}
       for nm, d in wm for p_ in [0.99, 0.9, 0.5, 0.1, 0.01]], tol=1e-10)

# ------------------------------------------------------------- power and sample size: proportions, sample size, smallest difference
from statsmodels.stats.proportion import power_proportions_2indep, samplesize_proportions_2indep_onetail
from statsmodels.stats.power import TTestPower, TTestIndPower


def p1_power(p0, p1, n, alpha, sides):
    # normal approximation: the null's standard error for the critical value, the alternative's for the power
    z = stats.norm.ppf(1 - alpha / sides); se0, se1 = math.sqrt(p0 * (1 - p0) / n), math.sqrt(p1 * (1 - p1) / n)
    hi = stats.norm.sf((p0 + z * se0 - p1) / se1)
    lo = stats.norm.cdf((p0 - z * se0 - p1) / se1)
    return (hi if p1 > p0 else lo) if sides == 1 else hi + lo


def p2_power(p2, p1, n, alpha, sides):
    return power_proportions_2indep(p1 - p2, p2, n, alpha=alpha, alternative="two-sided" if sides == 2 else ("larger" if p1 > p2 else "smaller")).power


pw = []
for test, base, comp in [("p1", 0.4, 0.5), ("p1", 0.9, 0.95), ("p1", 0.3, 0.2), ("p2", 0.4, 0.5), ("p2", 0.1, 0.05), ("p2", 0.6, 0.75)]:
    for sides in [1, 2]:
        for n in [20, 100, 400]:
            f = p1_power if test == "p1" else p2_power
            pw.append({"args": [{"test": test, "sides": sides, "alpha": 0.05, "sd": base}, n, comp], "expect": clean(f(base, comp, n, 0.05, sides))})
group("power of a proportions test", "powerAt", ["power_sample_size"], pw, tol=1e-9, abs_tol=1e-12,
      note="normal approximation, as Minitab; 2 proportions against statsmodels power_proportions_2indep, 1 proportion written out")

ss = []
for test, base, comp, power, sides in [("p1", 0.4, 0.5, 0.8, 2), ("p1", 0.9, 0.95, 0.9, 1), ("p1", 0.3, 0.2, 0.8, 2),
                                       ("p2", 0.4, 0.5, 0.8, 2), ("p2", 0.1, 0.05, 0.9, 2), ("p2", 0.6, 0.75, 0.8, 1)]:
    if test == "p2":
        n = samplesize_proportions_2indep_onetail(comp - base, base, power, alpha=0.05 if sides == 1 else 0.05,
                                                  alternative="two-sided" if sides == 2 else "larger")
    else:
        z, zb = stats.norm.ppf(1 - 0.05 / sides), stats.norm.ppf(power)
        n = ((z * math.sqrt(base * (1 - base)) + zb * math.sqrt(comp * (1 - comp))) / (comp - base)) ** 2
    ss.append({"name": f"{test} {base:.0%} to {comp:.0%}, power {power:.0%}, {sides}-sided", "args": [{"test": test, "sides": sides, "alpha": 0.05, "sd": base}, comp, power],
               "expect": max(2, math.ceil(n - 1e-9))})
for levels, d, power in [(3, 1, 0.8), (4, 0.5, 0.9), (5, 2, 0.8)]:
    d1 = levels - 1
    n = next(n for n in range(2, 10000) if stats.ncf.sf(stats.f.ppf(0.95, d1, levels * (n - 1)), d1, levels * (n - 1), n * d * d / 2) >= power)
    ss.append({"name": f"ANOVA, {levels} levels, difference {d} SD, power {power:.0%}", "args": [{"test": "anova", "levels": levels, "sides": 2, "alpha": 0.05, "sd": 1}, d, power], "expect": n})
group("sample size: proportions (normal approximation) and one-way ANOVA (exact)", "sampleSize", ["power_sample_size"], ss, tol=0, abs_tol=0,
      note="2 proportions from statsmodels samplesize_proportions_2indep_onetail, rounded up; ANOVA the smallest n with SciPy's noncentral F power at the target")

st = []
for test, d, power, sides in [("t1", 0.5, 0.8, 2), ("t1", 1, 0.9, 1), ("t2", 0.5, 0.8, 2), ("t2", 0.8, 0.9, 2), ("t2", 0.3, 0.8, 1), ("t1", 0.2, 0.8, 2)]:
    an = TTestPower() if test == "t1" else TTestIndPower()
    n = math.ceil(an.solve_power(effect_size=d, alpha=0.05, power=power, alternative="two-sided" if sides == 2 else "larger") - 1e-9)
    st.append({"name": f"{test}, {d} SD, power {power:.0%}, {sides}-sided", "args": [{"test": test, "sides": sides, "alpha": 0.05, "sd": 1}, d, power], "expect": max(2, n)})
group("sample size: t-tests", "sampleSize", ["power_sample_size"], st, tol=0, abs_tol=0,
      note="exact sample size from statsmodels (noncentral t); the tool's normal approximation to the power gives the same n in these cases")

md = []
for test, base, n, power in [("p1", 0.4, 100, 0.8), ("p1", 0.95, 200, 0.8), ("p2", 0.4, 150, 0.8), ("p2", 0.05, 300, 0.9), ("p1", 0.5, 8, 0.99)]:
    f = (lambda p_: p1_power(base, p_, n, 0.05, 2)) if test == "p1" else (lambda p_: p2_power(base, p_, n, 0.05, 2))
    eps = 1e-9
    up = optimize.brentq(lambda p_: f(p_) - power, base + 1e-12, 1 - eps, xtol=1e-14) if f(1 - eps) >= power else None
    down = optimize.brentq(lambda p_: f(p_) - power, eps, base - 1e-12, xtol=1e-14) if f(eps) >= power else None
    md.append({"name": f"{test} from {base:.0%}, n {n}, power {power:.0%}", "args": [{"test": test, "sides": 2, "alpha": 0.05, "sd": base}, n, power],
               "expect": {"up": up, "down": down}})
for levels, n, power in [(3, 10, 0.8), (5, 25, 0.9)]:
    d1 = levels - 1
    pw_ = lambda d: stats.ncf.sf(stats.f.ppf(0.95, d1, levels * (n - 1)), d1, levels * (n - 1), n * d * d / 2)
    md.append({"name": f"ANOVA, {levels} levels, n {n}", "args": [{"test": "anova", "levels": levels, "sides": 2, "alpha": 0.05, "sd": 2}, n, power],
               "expect": {"d": 2 * optimize.brentq(lambda d: pw_(d) - power, 1e-6, 50, xtol=1e-14)}})
group("smallest detectable difference: proportions and one-way ANOVA", "minDiff", ["power_sample_size"], md, tol=1e-7, abs_tol=1e-9,
      note="the difference at which the reference power above reaches the target (SciPy brentq)")
mt = []
for test, n, power in [("t1", 20, 0.8), ("t2", 30, 0.9), ("t2", 100, 0.8)]:
    an = TTestPower() if test == "t1" else TTestIndPower()
    mt.append({"name": f"{test}, n {n}, power {power:.0%}", "args": [{"test": test, "sides": 2, "alpha": 0.05, "sd": 3}, n, power],
               "expect": {"d": 3 * an.solve_power(nobs1=n, alpha=0.05, power=power) if test == "t2" else 3 * an.solve_power(nobs=n, alpha=0.05, power=power)}})
group("smallest detectable difference: t-tests", "minDiff", ["power_sample_size"], mt, tol=1e-3, abs_tol=0,
      note="exact from statsmodels; the tool's normal approximation to the power puts it within 0.1%")

# ------------------------------------------------------------- reading pasted tables (shared)
# What the shared reader makes of typical pastes: tab-separated from Excel,
# semicolons, commas, quotes, blank lines and ragged rows.
TABLES = [("tabs from Excel", "Ward\tDays\nA\t3\n\nB\t 4 ", {"delim": "\t", "recs": [["Ward", "Days"], ["A", "3"], ["B", "4"]]}),
          ("semicolons win over commas", "a;1,5\nb;2", {"delim": ";", "recs": [["a", "1,5"], ["b", "2"]]}),
          ("commas, with quotes", 'name,"value"\n"Ward A", 12', {"delim": ",", "recs": [["name", "value"], ["Ward A", "12"]]}),
          ("one column", "4\n5\r\n6", {"delim": "\t", "recs": [["4"], ["5"], ["6"]]}),
          ("ragged rows", "a\tb\tc\n1\t2", {"delim": "\t", "recs": [["a", "b", "c"], ["1", "2"]]}),
          ("blank", " \n\n", None)]
TABLES += [("CSV with commas and semicolons inside quotes", 'Ward,Days,Note\n"Ward A, North",3,"a; b"\n"Ward ""B""","1,234",x',
            {"delim": ",", "recs": [["Ward", "Days", "Note"], ["Ward A, North", "3", "a; b"], ['Ward "B"', "1,234", "x"]]}),
           ("a quote that never closes is an ordinary character", '5" pipe,3\n"open,4', {"delim": ",", "recs": [['5" pipe', "3"], ['"open', "4"]]}),
           ("a quoted cell with a line break, as Excel copies one", 'Ward\tNote\nA\t"two\nlines"\nB\tx', {"delim": "\t", "recs": [["Ward", "Note"], ["A", "two\nlines"], ["B", "x"]]}),
           ("a column of thousands from Excel is one column", "Cost\n1,234\n980\n2,500", {"delim": "\t", "recs": [["Cost"], ["1,234"], ["980"], ["2,500"]]}),
           ("CSV still splits on its commas", "Ward,Days\nA,3\nB,12", {"delim": ",", "recs": [["Ward", "Days"], ["A", "3"], ["B", "12"]]}),
           ("one line of numbers is a list", "12, 15, 9", {"delim": ",", "recs": [["12"], ["15"], ["9"]]}),
           ("numbers separated by spaces", "Days to repair\n12 15\n9", {"delim": "\t", "recs": [["Days to repair"], ["12", "15"], ["9"]]})]
TABLES_OPT = [("label then value", "Ward Falls\nWard A 1,234\nWard B n/a", {"space": "label"}, {"delim": "\t", "recs": [["Ward Falls"], ["Ward A", "1,234"], ["Ward B n/a"]]}),
              ("every line on spaces", "Age LOS\n45 3", {"space": "columns"}, {"delim": "ws", "recs": [["Age", "LOS"], ["45", "3"]]}),
              ("empty cells at the end dropped", "A\t1\t\t\nB\t2", {"trimTrailing": True}, {"delim": "\t", "recs": [["A", "1"], ["B", "2"]]})]
group("reading a pasted table", "splitTable", [SHARED], [{"name": n, "args": [t], "expect": e} for n, t, e in TABLES]
      + [{"name": n, "args": [t, o], "expect": e} for n, t, o, e in TABLES_OPT])
group("splitting one line into cells", "splitCells", [SHARED], [{"name": n, "args": [l, d], "expect": e} for n, l, d, e in [
    ("tabs, with a quoted tab", 'A\t"x\ty"\t3', "\t", ["A", "x\ty", "3"]),
    ("semicolons, with a quoted semicolon", '"a;b"; 2 ;""', ";", ["a;b", "2", ""]),
    ("commas, escaped quotes", '"say ""hi""",1', ",", ['say "hi"', "1"]),
    ("no quotes at all", " 1 , 2,3 ", ",", ["1", "2", "3"])]])
CELLS = [("1,234", "\t", 1234), ("£1,234.50", "\t", 1234.5), ("12%", "\t", 12), (" 7 ", "\t", 7), ("-3.25", "\t", -3.25),
         ("1.2e3", "\t", 1200), ("$ 40", ";", 40), ("1,234", ",", 1234), ("abc", "\t", None), ("", "\t", None), ("N/A", "\t", None),
         # only commas that group thousands are dropped: a decimal comma isn't read as a bigger number
         ("1,234,567.5", "\t", 1234567.5), ("-1,234", "\t", -1234), ("1,2", "\t", None), ("12,34", ";", None), ("1,2345", "\t", None),
         ("1234,5", "\t", None), (",5", "\t", None),
         # spaces, brackets and dashes, as Excel and other software write numbers
         ("1 234", "\t", 1234), ("£ 1,234.00", "\t", 1234), ("(1,234.00)", "\t", -1234), ("(5)", "\t", -5), ("−5", "\t", -5),
         ("12.5 %", "\t", 12.5), ("95 66", "\t", None), ("- 5", "\t", None), ("Infinity", "\t", None), ("0x10", "\t", None),
         (".5", "\t", 0.5), ("5.", "\t", 5)]
group("reading a number from a cell", "readNumber", [SHARED],
      [{"name": f"{c!r} ({'comma' if d == ',' else 'tab' if d == chr(9) else 'semicolon'}-separated)", "args": [c, d], "expect": e}
       for c, d, e in CELLS], call="number")
group("share of a column that holds numbers", "numericShare", [SHARED],
      [{"name": n, "args": [recs, c, d], "expect": e} for n, recs, c, d, e in [
          ("heading then numbers", [["Days"], ["3"], ["4"], ["x"], [""]], 0, "\t", 2 / 3),
          ("one row only", [["5"]], 0, "\t", 1.0),
          ("column missing", [["a"], ["1"]], 1, "\t", 0.0)]])

# The bar chart and design of experiments read numbers with the same shared rule:
# commas are thousands separators only in groups of three.
group("bar chart: reading pasted values", "parse", ["bar_chart"], [
    {"name": "thousands and a decimal comma (tabs)", "args": ["Ward\tAdmissions\nA\t1,234\nB\t1,2\nC\t£2,500.50\nD\tn/a", True],
     "expect": {"cats": [{"name": "A", "vals": [1234]}, {"name": "C", "vals": [2500.5]}], "skipped": 2, "blanks": 0}},
    {"name": "comma-separated, with an empty cell", "args": ["Ward,Jan,Feb\nA,12,\nB,7,8", True],
     "expect": {"cats": [{"name": "A", "vals": [12, 0]}, {"name": "B", "vals": [7, 8]}], "skipped": 0, "blanks": 1}},
    {"name": "two series, one unreadable cell", "args": ["Ward\tJan\tFeb\nA\t3\t12,5\nB\t4\t6", True],
     "expect": {"cats": [{"name": "A", "vals": [3, 0]}, {"name": "B", "vals": [4, 6]}], "skipped": 0, "blanks": 1}},
    {"name": "CSV with quoted names and numbers", "args": ['Ward,Admissions\n"Ward A, North",12\n"Ward B","1,234"', True],
     "expect": {"cats": [{"name": "Ward A, North", "vals": [12]}, {"name": "Ward B", "vals": [1234]}], "skipped": 0, "blanks": 0}}],
      call="barChart", tol=0, abs_tol=0)
FACT_COMMA = [{"name": "Volume", "type": "numeric", "low": "1,000", "high": "1,500"}, {"name": "Minutes", "type": "numeric", "low": "10", "high": "30"},
              {"name": "Kiosk", "type": "text", "low": "Off", "high": "On"}, {"name": "", "type": "text", "low": "", "high": ""}]
X = coded(3, 1); y = design_y(X, {"A": -3, "B": 2}, 1, np.random.default_rng(7))
real = [[1000 + (x[0] + 1) / 2 * 500, 10 + (x[1] + 1) / 2 * 20, x[2]] for x in X]
f = doe_ols(real, y, ["A", "B", "C"])
group("design of experiments: settings with thousands commas", "uncoded", ["design_of_experiments"],
      [{"name": "low 1,000 and high 1,500", "args": [{"k": 3, "factors": FACT_COMMA}, [{"x": x, "y": v} for x, v in zip(X, y)], ["A", "B", "C"], []],
        "expect": clean({"uncoded": dict(zip(["", "A", "B", "C"], f.params)), "means": []})}],
      call="doeUncoded", tol=1e-8, abs_tol=1e-9)
dr2 = backward(X, y, ["A", "B", "C"], 0.05)
group("design of experiments: a result with a decimal comma is left out", "reduce", ["design_of_experiments"],
      [{"name": "run 3 typed as 31,5", "args": [{"k": 3, "reps": 1, "terms": ["A", "B", "C"], "alpha": "0.05",
                                                  "y": {**{str(i + 1): v for i, v in enumerate(y)}, "3": "31,5"}, "factors": FACT_COMMA}],
        "expect": backward([X[i] for i in range(8) if i != 2], [y[i] for i in range(8) if i != 2], ["A", "B", "C"], 0.05)}], call="doeReduce")

# ------------------------------------------------------------- the same data, pasted in different ways
# Every tool reads a paste with the shared reader, so the same data copied from
# Excel, saved as CSV or typed on one line should give the tool the same values.
ONE_COLUMN = [1234, 980, 2500, 15.5]
COLUMN_PASTES = [
    ("Excel copy of a formatted column", "Cost\n1,234\n980\n2,500\n15.5", True),
    ("Excel copy with currency", "Cost\n£1,234.00\n£980.00\n£2,500.00\n£15.50", True),
    ("plain column", "Cost\n1234\n980\n2500\n15.5", True),
    ("CSV column with quoted thousands", 'Cost\n"1,234"\n980\n"2,500"\n15.5', True),
    ("one line, commas", "1234,980,2500,15.5", False),
    ("one line, spaces", "1234 980 2500 15.5", False),
    ("one line, spaces and thousands", "1,234 980 2,500 15.5", False),
    ("one line, semicolons", "1234; 980; 2500; 15.5", False)]
for tool, fn, head in [("box_plot", "parse", lambda h: [["Cost" if h else "All values", ONE_COLUMN]]),
                       ("weibull_reliability", "parse", lambda h: ONE_COLUMN), ("histogram", "parse", lambda h: ONE_COLUMN)]:
    group(f"{tool.replace('_', ' ')}: one column of values, pasted in different ways", fn, [tool],
          [{"name": n, "args": [t, h], "expect": clean(head(h))} for n, t, h in COLUMN_PASTES], call="pasted", tol=0, abs_tol=0)

LABELLED = [["Ward A, North", 1234], ["Ward B", 980], ["Ward C", 15]]
LABEL_PASTES = [
    ("Excel copy", "Ward\tFalls\nWard A, North\t1,234\nWard B\t980\nWard C\t15"),
    ("CSV with quoted name and number", 'Ward,Falls\n"Ward A, North","1,234"\nWard B,980\nWard C,15'),
    ("semicolons", "Ward;Falls\nWard A, North;1234\nWard B;980\nWard C;15")]
PLAIN = [["Ward A", 1234], ["Ward B", 980], ["Ward C", 15]]
PLAIN_PASTES = [("Excel copy", "Ward\tFalls\nWard A\t1,234\nWard B\t980\nWard C\t15"),
                ("plain CSV", "Ward,Falls\nWard A,1234\nWard B,980\nWard C,15"),
                ("spaces, label then value", "Ward Falls\nWard A 1,234\nWard B 980\nWard C 15")]
for tool, fn, shape in [("bar_chart", "parse", lambda rows: [[n, [v]] for n, v in rows]), ("run_chart", "parseInput", lambda rows: rows)]:
    group(f"{tool.replace('_', ' ')}: labels and values, pasted in different ways", fn, [tool],
          [{"name": n, "args": [t, True], "expect": clean(shape(LABELLED))} for n, t in LABEL_PASTES]
          + [{"name": n + " (names without commas)", "args": [t, True], "expect": clean(shape(PLAIN))} for n, t in PLAIN_PASTES],
          call="pasted", tol=0, abs_tol=0)

XY = [[1.5, 1234], [2, 980], [3.25, 15]]
group("scatter plot: x and y, pasted in different ways", "parse", ["scatter_plot"],
      [{"name": n, "args": [t, True], "expect": clean(XY)} for n, t in [
          ("Excel copy", "Dose\tCost\n1.5\t1,234\n2\t980\n3.25\t15"),
          ("CSV with quoted thousands", 'Dose,Cost\n1.5,"1,234"\n2,980\n3.25,15'),
          ("semicolons", "Dose;Cost\n1.5;1234\n2;980\n3.25;15"),
          ("spaces", "Dose Cost\n1.5 1,234\n2 980\n3.25 15")]], call="pasted", tol=0, abs_tol=0)
FUN = [["Ward A, North", 3, 1234], ["Ward B", 5, 980], ["Ward C", 1, 150]]
group("funnel plot: units, events and populations, pasted in different ways", "parse", ["funnel_plot"],
      [{"name": n, "args": [t, True], "expect": clean(FUN)} for n, t in [
          ("Excel copy", "Unit\tEvents\tPopulation\nWard A, North\t3\t1,234\nWard B\t5\t980\nWard C\t1\t150"),
          ("CSV with quoted name and number", 'Unit,Events,Population\n"Ward A, North",3,"1,234"\nWard B,5,980\nWard C,1,150'),
          ("semicolons", "Unit;Events;Population\nWard A, North;3;1234\nWard B;5;980\nWard C;1;150")]], call="pasted", tol=0, abs_tol=0)

with open(OUT, "w") as f:
    json.dump({"generated_by": "tests/stats/make_reference.py", "scipy": scipy.__version__, "numpy": np.__version__,
               "groups": groups}, f, indent=0, separators=(",", ":"))
    f.write("\n")
print(f"wrote {sum(len(g['cases']) * len(g['tools']) for g in groups)} checks in {len(groups)} groups to {os.path.relpath(OUT)}")

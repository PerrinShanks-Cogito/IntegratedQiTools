# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
Writes tests/stats/reference.json: the inputs for every statistics test and
the answers SciPy and NumPy give for them. stats.test.js checks each tool's own
functions against these answers.

Only needed when you add or change a test; the reference file is committed.
Run from the repository root:

    pip install numpy scipy
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


def group(id, fn, tools, cases, tol=1e-9, abs_tol=1e-12, call=None, globals=None, note=None):
    groups.append({k: v for k, v in dict(id=id, fn=fn, tools=tools, call=call, globals=globals,
                                          tol=tol, abs=abs_tol, note=note, cases=cases).items() if v is not None})


SEL = "hypothesis_test_selector"
LGAMMA_TOOLS = ["anova", "attribute_agreement", "chi_squared", "design_of_experiments", "gauge_rr",
                SEL, "multiple_regression", "power_sample_size", "scatter_plot", "weibull_reliability"]
IBETA_TOOLS = ["anova", "attribute_agreement", "design_of_experiments", "gauge_rr", SEL,
               "multiple_regression", "power_sample_size", "scatter_plot"]

# ---------------------------------------------------------------- distributions
group("lgamma", "lgamma", LGAMMA_TOOLS,
      [{"args": [x], "expect": r(special.gammaln(x))} for x in [0.5, 1, 1.5, 2, 3.7, 10, 50.5, 171, 1000]],
      tol=1e-9, abs_tol=1e-9)

ib = []
for x in [0.001, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]:
    for a, b in [(0.5, 0.5), (1, 3), (2.5, 7), (10, 0.5), (50, 50), (0.5, 2500), (2500, 0.5)]:
        ib.append({"args": [x, a, b], "expect": r(special.betainc(a, b, x))})
group("ibeta", "ibeta", IBETA_TOOLS, ib, tol=1e-8, abs_tol=1e-14)

tps = [{"args": [t, df], "expect": r(2 * stats.t.sf(t, df))}
       for t in [0.2, 1, 1.96, 3, 6, 12] for df in [1, 2, 5, 30, 200, 5000, 100000]]
group("t p-value (two-sided)", "tP", ["anova", "design_of_experiments", SEL, "multiple_regression"], tps, tol=1e-8, abs_tol=1e-15)

fps = [{"args": [F, d1, d2], "expect": r(stats.f.sf(F, d1, d2))}
       for F in [0.3, 1, 2.5, 6, 30] for d1 in [1, 2, 4, 12] for d2 in [3, 20, 200, 20000]]
group("F p-value (upper tail)", "fP", ["anova", "gauge_rr", "multiple_regression"], fps, tol=1e-8, abs_tol=1e-15)
group("F p-value (upper tail)", "fUp", [SEL], fps, tol=1e-8, abs_tol=1e-15)

chis = [{"args": [x, df], "expect": r(stats.chi2.sf(x, df))}
        for x in [0.1, 1, 3.84, 10, 40, 150] for df in [1, 2, 4, 10, 50, 200]]
group("chi-squared p-value", "chiP", ["chi_squared", SEL], chis, tol=1e-8, abs_tol=1e-15)

gq = [{"args": [a, x], "expect": r(special.gammaincc(a, x))}
      for a in [0.5, 1, 2.5, 10, 100] for x in [0.05, 0.5, 2, 9, 30, 120]]
group("upper incomplete gamma", "gammaQ", ["chi_squared", SEL], gq, tol=1e-8, abs_tol=1e-15)

zs = [-8, -5, -3, -1.96, -1, -0.3, 0, 0.3, 1, 1.96, 3, 5, 8]
group("z p-value (two-sided)", "zP", ["chi_squared", SEL],
      [{"args": [z], "expect": r(2 * stats.norm.sf(abs(z)))} for z in zs], tol=1e-8, abs_tol=1e-15)
group("normal CDF", "normCdf", [SEL], [{"args": [z], "expect": r(stats.norm.cdf(z))} for z in zs],
      tol=1e-8, abs_tol=1e-15)
group("normal CDF (polynomial approximation)", "normCdf", ["histogram", "power_sample_size"],
      [{"args": [z], "expect": r(stats.norm.cdf(z))} for z in zs], tol=2e-7, abs_tol=1e-15,
      note="erfc approximation (Numerical Recipes erfcc), accurate to about 1.2e-7 relative")
group("inverse normal", "normInv", ["power_sample_size"],
      [{"args": [p], "expect": r(stats.norm.ppf(p))} for p in [1e-10, 1e-5, 0.001, 0.025, 0.2, 0.6, 0.9, 0.975, 0.999, 1 - 1e-7]],
      tol=1e-7, abs_tol=1e-7)
group("t CDF", "tCdf", ["power_sample_size"],
      [{"args": [t, df], "expect": r(stats.t.cdf(t, df))} for t in [-4, -1.5, 0.5, 2.2, 6] for df in [2, 9, 60, 1000]],
      tol=1e-8, abs_tol=1e-15)
group("inverse t", "tInv", ["power_sample_size"],
      [{"args": [p, df], "expect": r(stats.t.ppf(p, df))} for p in [0.6, 0.9, 0.975, 0.995, 0.9995] for df in [2, 9, 60, 1000]],
      tol=1e-7)
group("beta quantile for the F critical value", "fCritU", ["power_sample_size"],
      [{"args": [a, d1, d2], "expect": r(stats.beta.ppf(1 - a, d1 / 2, d2 / 2))}
       for a in [0.01, 0.05, 0.1] for d1 in [1, 3, 8] for d2 in [6, 40, 400]], tol=1e-7)

tc = [{"args": [df, a], "expect": r(stats.t.ppf(1 - a / 2, df))} for df in [1, 3, 10, 40, 1000] for a in [0.01, 0.05, 0.1]]
group("t critical value (two-sided)", "tCrit", ["anova", "design_of_experiments", SEL], tc, tol=1e-7)
group("t critical value (two-sided, 95%)", "tCrit", ["multiple_regression"],
      [{"args": [df], "expect": r(stats.t.ppf(0.975, df))} for df in [1, 3, 10, 40, 1000]], tol=1e-7)
group("z critical value (two-sided)", "zCrit", ["chi_squared", SEL],
      [{"args": [a], "expect": r(stats.norm.ppf(1 - a / 2))} for a in [0.001, 0.01, 0.05, 0.1, 0.2]], tol=1e-7)

# ------------------------------------------------------------- descriptive
sets = [data("normal", 7), data("normal", 40), data("skewed", 25), data("ties", 30), [3.0, 3.0, 3.0, 9.0]]
qs = []
for v in sets:
    s = sorted(v)
    for p in [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]:
        qs.append({"args": [s, p], "expect": r(np.quantile(s, p, method="linear"))})
group("quantile (linear interpolation, R type 7 / Excel QUARTILE.INC)", "quantile", ["anova", "box_plot", "histogram"], qs)

group("mean", "mean", [SEL], [{"args": [v], "expect": r(np.mean(v))} for v in sets])
group("variance (n - 1)", "variance", [SEL], [{"args": [v], "expect": r(np.var(v, ddof=1))} for v in sets])
group("median", "median", [SEL], [{"args": [v], "expect": r(np.median(v))} for v in sets])
group("standard deviation (n - 1)", "sd", ["multiple_regression"], [{"args": [v], "expect": r(np.std(v, ddof=1))} for v in sets])

rk = []
for v in sets:
    ties = sum(c ** 3 - c for c in np.unique(v, return_counts=True)[1])
    rk.append({"args": [v], "expect": {"r": r(stats.rankdata(v)), "ties": r(ties)}})
group("average ranks with ties", "ranks", [SEL], rk)
group("average ranks with ties", "ranks", ["attribute_agreement"], [{"args": c["args"], "expect": c["expect"]["r"]} for c in rk])
group("average ranks with ties", "rank", ["scatter_plot"], [{"args": c["args"], "expect": c["expect"]["r"]} for c in rk])

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
group("Anderson-Darling normality test", "andersonDarling", ["histogram"], ad, call="adHistogram", tol=2e-6, abs_tol=1e-8,
      note="statistic from SciPy; p-value from D'Agostino and Stephens (1986), as Minitab uses; "
           "the histogram's normal CDF approximation (1.2e-7) carries through to about 1e-6")
group("Anderson-Darling normality test", "andersonDarling", [SEL],
      [{"args": c["args"], "expect": {"A": c["expect"]["a"], "p": c["expect"]["p"]}} for c in ad], tol=1e-7, abs_tol=1e-12,
      note="statistic from SciPy; p-value from D'Agostino and Stephens (1986), as Minitab uses")

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
group("one-way ANOVA", "oneWay", ["anova", SEL], ow)


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

with open(OUT, "w") as f:
    json.dump({"generated_by": "tests/stats/make_reference.py", "scipy": scipy.__version__, "numpy": np.__version__,
               "groups": groups}, f, indent=0, separators=(",", ":"))
    f.write("\n")
print(f"wrote {sum(len(g['cases']) * len(g['tools']) for g in groups)} checks in {len(groups)} groups to {os.path.relpath(OUT)}")

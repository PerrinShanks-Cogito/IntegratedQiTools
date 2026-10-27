# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
Reference versions of the SPC chart, run chart and funnel plot calculations,
written in Python from the published rules rather than from the tools' code,
so the tests compare two independent versions. make_reference.py uses them.

SPC charts follow NHS England's Making Data Count guidance and its Excel
tools: XmR limits at the mean ± 2.66 × the average moving range, P, U and C
charts at ± 3 standard errors (Laney's P' and U' optionally), and the T chart
for rare events on gaps transformed by the power 1/3.6. The signals:
  outside   a point beyond a process limit
  shift     7 or more points in a row on one side of the mean (a point on the
            mean breaks the run)
  trend     7 or more points in a row all rising or all falling
  twothree  2 of 3 points in a row beyond 2 standard deviations on one side

Run charts follow the IHI rules (Perla, Provost and Murray 2011):
  shift     6 or more points in a row on one side of the median, skipping
            points on the median
  trend     5 or more points all rising or all falling, skipping repeats
  runs      too few or too many runs for the number of useful observations
  astro     a point far from the rest; the tool suggests points beyond 3 IQR
            outside the quartiles

Funnel plots: the overall rate ± 3 and ± 1.96 standard errors, binomial for
proportions and Poisson for rates.
"""
import math
import numpy as np


def sign(x):
    return (x > 0) - (x < 0)


# ------------------------------------------------------------------ SPC
def segments(n, breaks):
    starts = [0] + sorted(b for b in set(breaks) if 0 < b < n)
    return [(s, starts[k + 1] if k + 1 < len(starts) else n) for k, s in enumerate(starts)]


def xmr_limits(v, breaks=(), base_n=None, screen=False, floor=False):
    segs = []
    for s, e in segments(len(v), breaks):
        be = min(s + base_n, e) if base_n and base_n >= 2 else e
        mrs = [abs(v[i] - v[i - 1]) for i in range(s + 1, be)]
        mean = float(np.mean(v[s:be]))
        mr = float(np.mean(mrs)) if mrs else math.nan
        if screen and len(mrs) > 1:
            kept = [m for m in mrs if m <= 3.267 * mr]       # leave out moving ranges above their upper limit
            if kept and len(kept) < len(mrs):
                mr = float(np.mean(kept))
        lcl = mean - 2.66 * mr
        if floor and lcl < 0:
            lcl = 0.0
        sigma = mr / 1.128
        segs.append(dict(s=s, e=e, mean=mean, mrBar=mr, ucl=mean + 2.66 * mr, lcl=lcl,
                         up2=mean + 2 * sigma, lo2=mean - 2 * sigma, ok=not math.isnan(mr)))
    return segs


def count_limits(num, den, kind, breaks=(), laney=False, min_points=13):
    n = len(num)
    v = [a / b for a, b in zip(num, den)]
    seg_mean = []
    for s, e in segments(n, breaks):
        m = sum(num[s:e]) / sum(den[s:e])
        seg_mean += [m] * (e - s)
    sd = [math.sqrt(m * (1 - m) / d) if kind == "p" else math.sqrt(m / d) for m, d in zip(seg_mean, den)]
    k = 1.0
    if laney:
        # Laney: scale by the spread of the z-scores, from their average moving range
        z = [(x - m) / s if s > 0 else 0 for x, m, s in zip(v, seg_mean, sd)]
        k = float(np.mean([abs(z[i] - z[i - 1]) for i in range(1, n)])) / 1.128
    lim = [dict(mean=m, ucl=m + 3 * s * k, lcl=m - 3 * s * k, up2=m + 2 * s * k, lo2=m - 2 * s * k)
           for m, s in zip(seg_mean, sd)]
    return v, lim, n >= min_points


def spc_signals(v, segs, lim, mean_of, ok_of, counts, shift_len=7, trend_len=7, two_three=True, t_chart=False, use_trend=True):
    """Signals for each segment. `lim[i]` holds point i's ucl/lcl (and up2/lo2
    for counts); `segs` the segments with their mean, up2 and lo2."""
    flags = [dict(hi=False, lo=False, sides={}) for _ in v]
    events = []

    def mark(i, side, rule):
        flags[i][side] = True
        flags[i]["sides"][rule] = side

    def event(rule, side, a, b):
        events.append(dict(rule=rule, side=side, **{"from": a, "to": b}))

    for g in segs:
        s, e, mean, ok = g["s"], g["e"], mean_of(g), ok_of(g)
        if not ok and not counts:
            continue
        if ok:
            for i in range(s, e):
                if v[i] > lim[i]["ucl"]:
                    mark(i, "hi", "outside"); event("outside", "hi", i, i)
                elif v[i] < lim[i]["lcl"]:
                    mark(i, "lo", "outside"); event("outside", "lo", i, i)
        # shift: runs of points strictly on one side; a point on the mean ends a run
        i = s
        while i < e:
            sd = sign(v[i] - mean)
            j = i
            while j + 1 < e and sign(v[j + 1] - mean) == sd and sd != 0:
                j += 1
            if sd != 0 and j - i + 1 >= shift_len:
                name = "hi" if sd > 0 else "lo"
                for q in range(i, j + 1):
                    mark(q, name, "shift")
                event("shift", name, i, j)
            i = j + 1
        if counts:
            # trend for counts: a repeated value neither adds to nor breaks a run
            moves = [(i, sign(v[i] - v[i - 1])) for i in range(s + 1, e) if v[i] != v[i - 1]]
            k = 0
            while k < len(moves):
                d = moves[k][1]
                j = k
                while j + 1 < len(moves) and moves[j + 1][1] == d:
                    j += 1
                points = j - k + 2                      # moves + 1
                start, end = moves[k][0] - 1, (moves[j + 1][0] - 1 if j + 1 < len(moves) else e - 1)
                if points >= trend_len:
                    name = "hi" if d > 0 else "lo"
                    for q in range(start, end + 1):
                        mark(q, name, "trend")
                    event("trend", name, start, end)
                k = j + 1
        elif not t_chart or use_trend:
            # trend for XmR and T: a repeated value ends a run
            i = s
            while i < e - 1:
                d = sign(v[i + 1] - v[i])
                if d == 0:
                    i += 1
                    continue
                j = i + 1
                while j + 1 < e and sign(v[j + 1] - v[j]) == d:
                    j += 1
                if j - i + 1 >= trend_len:
                    name = "hi" if d > 0 else "lo"
                    for q in range(i, j + 1):
                        mark(q, name, "trend")
                    event("trend", name, i, j)
                i = j
        if ok and two_three and not t_chart:
            for i in range(s, e - 2):
                w = [i, i + 1, i + 2]
                if counts:
                    hi = [j for j in w if lim[j]["up2"] < v[j] < lim[j]["ucl"]]
                    lo = [j for j in w if lim[j]["lcl"] < v[j] < lim[j]["lo2"]]
                    hi_ok = lo_ok = True
                else:
                    # as the Making Data Count Excel tool: all three on the same side of the mean
                    hi = [j for j in w if v[j] > g["up2"]]
                    lo = [j for j in w if v[j] < g["lo2"]]
                    hi_ok = all(v[j] > mean for j in w)
                    lo_ok = all(v[j] <= mean for j in w)
                if len(hi) >= 2 and hi_ok:
                    for j in hi: mark(j, "hi", "twothree")
                    event("twothree", "hi", hi[0], hi[-1])
                if len(lo) >= 2 and lo_ok:
                    for j in lo: mark(j, "lo", "twothree")
                    event("twothree", "lo", lo[0], lo[-1])
    # join overlapping or touching events of the same kind in a segment (not on a T chart)
    seg_of = lambda i: next(k for k, g in enumerate(segs) if g["s"] <= i < g["e"])
    events.sort(key=lambda x: (x["rule"], x["side"], x["from"]))
    merged = []
    for ev in events:
        q = merged[-1] if merged else None
        if not t_chart and q and q["rule"] == ev["rule"] and q["side"] == ev["side"] and ev["from"] <= q["to"] + 1 and seg_of(ev["from"]) == seg_of(q["to"]):
            q["to"] = max(q["to"], ev["to"])
        else:
            merged.append(dict(ev))
    merged.sort(key=lambda x: (x["from"], x["rule"]))
    return merged, flags


def spc_status(flags, direction):
    out = []
    for f in flags:
        if not f["hi"] and not f["lo"]:
            out.append("common"); continue
        if f["hi"] and f["lo"]:
            # conflicting signals: trend, then shift, then two of three, then a single point
            side = f["sides"][next(r for r in ["trend", "shift", "twothree", "outside"] if r in f["sides"])]
        else:
            side = "hi" if f["hi"] else "lo"
        if direction == "none":
            out.append("neither-hi" if side == "hi" else "neither-lo")
        else:
            out.append("improve" if (direction == "up") == (side == "hi") else "concern")
    return out


def spc_xmr(v, breaks=(), base_n=None, screen=False, floor=False, shift_len=7, trend_len=7, two_three=True, direction="up"):
    segs = xmr_limits(v, breaks, base_n, screen, floor)
    lim = [next(g for g in segs if g["s"] <= i < g["e"]) for i in range(len(v))]
    events, flags = spc_signals(v, segs, lim, lambda g: g["mean"], lambda g: g["ok"], False, shift_len, trend_len, two_three)
    keep = ("mean", "mrBar", "ucl", "lcl", "up2", "lo2", "ok")
    return dict(segs=[{k: g[k] for k in keep} for g in segs], events=events, status=spc_status(flags, direction))


def spc_count(num, den, kind, breaks=(), laney=False, shift_len=7, trend_len=7, two_three=True, direction="up"):
    v, lim, ok = count_limits(num, den, kind, breaks, laney)
    segs = [dict(s=s, e=e, mean=lim[s]["mean"]) for s, e in segments(len(v), breaks)]
    events, flags = spc_signals(v, segs, lim, lambda g: g["mean"], lambda g: ok, True, shift_len, trend_len, two_three)
    return dict(ok=ok, lim=lim, events=events, status=spc_status(flags, direction))


POW = 3.6


def spc_t(days, breaks=(), shift_len=7, trend_len=7, use_trend=True, direction="down"):
    """days: the event dates as day numbers, in order. Gaps of 0 days count as half a day."""
    gaps = [(days[i] - days[i - 1]) or 0.5 for i in range(1, len(days))]
    y = [g ** (1 / POW) for g in gaps]
    segs = []
    for s, e in segments(len(y), breaks):
        mrs = [abs(y[i] - y[i - 1]) for i in range(s + 1, e)]
        tm = float(np.mean(y[s:e])); mr = float(np.mean(mrs)) if mrs else math.nan
        tu, tl = tm + 2.66 * mr, tm - 2.66 * mr
        segs.append(dict(s=s, e=e, tMean=tm, mrBar=mr, tU=tu, tL=tl, mean=tm ** POW, ucl=tu ** POW,
                         lcl=tl ** POW if tl > 0 else None, ok=not math.isnan(mr)))
    lim = []
    for i in range(len(y)):
        g = next(g for g in segs if g["s"] <= i < g["e"])
        lim.append(dict(ucl=g["tU"], lcl=g["tL"] if g["lcl"] is not None else -math.inf))
    events, flags = spc_signals(y, segs, lim, lambda g: g["tMean"], lambda g: g["ok"], False, shift_len, trend_len,
                                two_three=False, t_chart=True, use_trend=use_trend)
    keep = ("tMean", "mrBar", "mean", "ucl", "lcl")
    return dict(gaps=gaps, segs=[{k: g[k] for k in keep} for g in segs], events=events, status=spc_status(flags, direction))


# ------------------------------------------------------------------ run chart
EPS = 1e-9


def run_chart(v, base_n=None):
    n = len(v)
    base = v[:base_n] if base_n else v
    med = float(np.median(base))
    side = [1 if x > med + EPS else -1 if x < med - EPS else 0 for x in v]
    # shift: 6 or more on one side; points on the median are skipped
    shifts, run, run_side = [], [], 0
    for i, s in enumerate(side):
        if s == 0:
            continue
        if s == run_side:
            run.append(i)
        else:
            if len(run) >= 6: shifts.append(run)
            run, run_side = [i], s
    if len(run) >= 6: shifts.append(run)
    # trend: 5 or more rising or falling; repeated values are skipped
    trends, members, d0, last = [], [0], 0, 0
    for i in range(1, n):
        if abs(v[i] - v[last]) < EPS:
            continue
        d = sign(v[i] - v[last])
        if d == d0:
            members.append(i)
        else:
            if d0 != 0 and len(members) >= 5: trends.append(list(range(members[0], members[-1] + 1)))
            d0, members = d, [last, i]
        last = i
    if d0 != 0 and len(members) >= 5: trends.append(list(range(members[0], members[-1] + 1)))
    # runs, in the baseline
    bs = [s for s in side[:len(base)] if s != 0]
    useful = len(bs)
    runs = (1 + sum(bs[i] != bs[i - 1] for i in range(1, useful))) if useful else 0
    lo = hi = None
    if useful > 60:
        n1 = sum(1 for s in bs if s > 0); n2 = useful - n1
        mu = 2 * n1 * n2 / useful + 1
        sd = math.sqrt(2 * n1 * n2 * (2 * n1 * n2 - useful) / (useful ** 2 * (useful - 1)))
        lo, hi = math.ceil(mu - 1.96 * sd), math.floor(mu + 1.96 * sd)
    # astronomical points: beyond 3 IQR outside the quartiles, with 8 or more points
    astro = []
    if n >= 8:
        q1, q3 = np.quantile(v, [0.25, 0.75])
        iqr = q3 - q1
        if iqr > EPS:
            astro = [i for i, x in enumerate(v) if x > q3 + 3 * iqr or x < q1 - 3 * iqr]
    return dict(med=med, shifts=shifts, trends=trends, useful=useful, runs=runs, lo=lo, hi=hi, astro=astro)


# ------------------------------------------------------------------ funnel plot
def funnel(e, n, centre="pooled"):
    p_i = [a / b for a, b in zip(e, n)]
    p = sum(e) / sum(n) if centre == "pooled" else float(np.mean(p_i))
    poisson = any(a > b for a, b in zip(e, n)) or p >= 1
    rows = []
    for a, b, x in zip(e, n, p_i):
        se = math.sqrt(p / b) if poisson else math.sqrt(p * (1 - p) / b)
        lim = {}
        for name, z in (("c", 3), ("w", 1.96)):
            lo, hi = max(0, p - z * se), p + z * se
            lim[name] = (lo, hi if poisson else min(1, hi))
        status = "above" if x > lim["c"][1] else "below" if x < lim["c"][0] else \
            "warn" if (x > lim["w"][1] or x < lim["w"][0]) else "within"
        rows.append(dict(p=x, lcl=lim["c"][0], ucl=lim["c"][1], lwl=lim["w"][0], uwl=lim["w"][1], status=status))
    return dict(p=p, poisson=poisson, rows=rows)

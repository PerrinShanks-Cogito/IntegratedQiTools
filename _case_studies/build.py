# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
Builds the FOCUS case studies.

Run from the repository root:   python3 _case_studies/build.py

It writes
  _data/case_studies.json             the case studies and their steps (pages read this)
  case_studies/data/<case>-<n>.json   one FOCUS project file per step (the sample data)
  case_studies/<case>/index.html      a page stub for each case study

All figures are made up for learning. They are generated from fixed random
seeds so re-running the script gives the same files. Edit the CASES below and
re-run to change a case study.
"""
import json, math, os, random
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "case_studies", "data")
SAVED = "2026-10-25T09:00:00.000Z"

# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def months(n, start=(2024, 10)):
    y, m = start
    out = []
    for _ in range(n):
        out.append(date(y, m, 1).strftime("%b %Y"))
        m += 1
        if m > 12: y, m = y + 1, 1
    return out

def weeks(n, start=date(2025, 10, 6)):
    return [(start + timedelta(weeks=i)).strftime("%d/%m/%Y") for i in range(n)]

def tsv(header, rows):
    return "\n".join(["\t".join(map(str, header))] + ["\t".join("" if v is None else str(v) for v in r) for r in rows])

def binom(rng, n, p):
    return sum(1 for _ in range(n) if rng.random() < p)

def pois(rng, lam):
    # Knuth; fine for the small rates used here
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L: return k
        k += 1

def zscores(kind, pts):
    """pts: values (xmr) or (count, total) pairs (p, u). Rough z-scores against
    the mean of all points, for checking a made-up series looks stable."""
    if kind == "xmr":
        m = sum(pts) / len(pts)
        mr = sum(abs(a - b) for a, b in zip(pts[1:], pts)) / (len(pts) - 1)
        sd = mr / 1.128 or 1
        return [(x - m) / sd for x in pts]
    tot = sum(n for _, n in pts); bar = sum(c for c, _ in pts) / tot
    if kind == "p": return [(c / n - bar) / math.sqrt(bar * (1 - bar) / n) for c, n in pts]
    return [(c / n - bar) / math.sqrt(bar / n) for c, n in pts]

def is_stable(kind, pts):
    z = zscores(kind, pts)
    if any(abs(v) > 3 for v in z): return False
    run, side = 0, 0
    for v in z:
        sd_ = 1 if v > 0 else (-1 if v < 0 else 0)
        run = run + 1 if sd_ == side and sd_ else 1; side = sd_
        if run >= 7: return False
    vals = pts if kind == "xmr" else [c / n for c, n in pts]
    up = dn = 1
    for a, b in zip(vals, vals[1:]):
        up = up + 1 if b > a else 1; dn = dn + 1 if b < a else 1
        if up >= 7 or dn >= 7: return False
    for i in range(len(z) - 2):
        w = z[i:i + 3]
        if sum(1 for v in w if v > 2) >= 2 or sum(1 for v in w if v < -2) >= 2: return False
    return True

def stable(rng, kind, make, tries=500):
    """Call make(rng) until the series it returns passes is_stable."""
    for _ in range(tries):
        rows = make(rng)
        if is_stable(kind, [r[1] for r in rows] if kind == "xmr" else [(r[1], r[2]) for r in rows]): return rows
    raise RuntimeError("no stable series")

def doc(tool, fields, extra=None):
    return {"focus": {"tool": tool, "version": 1, "saved": SAVED}, "fields": fields, "extra": extra}

# --------------------------------------------------------------------------
# Tool project builders (match each tool's own Save format)
# --------------------------------------------------------------------------
SPC_DEFAULTS = {
    "team": "", "per": "1000", "perUnit": "", "yLabel": "", "target": "", "floor": False,
    "radio:base": "all", "baseN": "20", "screen": False, "radio:ctype": "p", "showMR": True,
    "radio:unit": "pct", "yMin": "", "yMax": "", "dateFmt": "dmy", "showNotes": True,
    "shiftLen": "7", "trendLen": "7", "twoThree": True, "useTrend": True,
}
def spc(kind, title, data, direction="up", team="", target="", laney=False, per="1000", per_unit="",
        breaks=(), y_label="", floor=False, base_n=None):
    f = dict(SPC_DEFAULTS)
    # Fixed baselines only apply to XmR and T charts in the SPC tool
    base_n = base_n if kind in ("xmr", "t") else None
    if base_n: f.update({"radio:base": "first", "baseN": str(base_n)})
    f.update({"radio:spctype": kind, "data": data, "title": title, "team": team, "radio:dir": direction,
              "target": str(target), "radio:ctype": "laney" if laney else "p", "per": per,
              "perUnit": per_unit, "yLabel": y_label, "floor": floor})
    return doc("spc_tool", f, {"type": kind, "breaks": list(breaks), "useBaseN": bool(base_n)})

def pareto(title, data, y_label=""):
    return doc("pareto_chart", {"data": data, "hasHeader": True, "title": title, "yLabel": y_label,
                                "cutoff": "80", "groupAfter": "0", "aligned": True, "showLabels": True})

def bar(title, data, y_label="", layout="group", orient="v", sort="none"):
    return doc("bar_chart", {"data": data, "hasHeader": True, "title": title, "xLabel": "", "yLabel": y_label,
                             "radio:orient": orient, "radio:sort": sort, "radio:layout": layout,
                             "showLabels": True, "showAvg": False})

def chi(title, data, val_label):
    return doc("chi_squared", {"data": data, "hasHeader": True, "mode": "independence", "alpha": "0.05",
                               "title": title, "valLabel": val_label, "order": "entered", "swap": False})

def matrix(title, data):
    return doc("matrix_2x2", {"preset": "ease_impact", "cX": "", "cY": "", "cTL": "", "cTR": "", "cBL": "",
                              "cBR": "", "data": data, "hasHeader": True, "title": title, "radio:scale": "auto",
                              "xSplit": "", "ySplit": "", "xLabel": "", "yLabel": "", "showNames": True})

def box(title, data, val_label, points=False):
    return doc("box_plot", {"data": data, "hasHeader": True, "title": title, "valLabel": val_label,
                            "order": "entered", "whiskers": "tukey", "showMean": True, "showPoints": points,
                            "zero": False})

def scatter(title, data, by_group=True):
    return doc("scatter_plot", {"data": data, "hasHeader": True, "title": title, "xLabel": "", "yLabel": "",
                                "showTrend": True, "byGroup": by_group, "flagOdd": True, "zero": False})

def regression(title, data, y_col, n_cols, what_if):
    f = {"data": data, "hasHeader": True, "yCol": str(y_col), "title": title, "flagOdd": True}
    for i in range(1, n_cols):
        f["use-%d" % i] = True
    return doc("multiple_regression", f, {"chartType": "effects", "whatIf": what_if})

def funnel(title, data, dates, measure, pop_label, scale):
    return doc("funnel_plot", {"data": data, "hasHeader": True, "title": title, "dates": dates,
                               "measure": measure, "popLabel": pop_label, "scale": str(scale),
                               "centre": "pooled", "xMin": "", "xMax": "", "showWarn": True, "labels": True})

def attribute(title, data, trials=2, ordered=False, cats=()):
    return doc("attribute_agreement", {"data": data, "hasHeader": True, "hasId": True, "hasStd": True,
                                       "trials": str(trials), "ordered": ordered, "title": title},
               {"catOrder": list(cats), "chartType": "agreement"})

PALETTE = ["#005EB8", "#007F3B", "#AE2573", "#330072", "#8A1538", "#00667A", "#7A4600", "#003087", "#425563"]
def qualitative(question, comments, codes, coding, findings=None):
    """comments: list of (id, group, text); codes: list of (name, desc, keywords);
    coding: {id: (code_names, sentiment, quote?)}"""
    data = tsv(["ID", "Group", "Comment"], comments)
    cl = [{"id": "c%d" % (i + 1), "name": n, "desc": d, "keywords": k, "color": PALETTE[i % len(PALETTE)]}
          for i, (n, d, k) in enumerate(codes)]
    by_name = {c["name"]: c["id"] for c in cl}
    cd, order = {}, 0
    for cid, (names, sent, quote) in coding.items():
        order += 1
        e = {"codes": [by_name.get(n, "other") for n in names], "sent": sent, "note": "", "order": order}
        if quote: e["quote"] = True
        cd["id:%s" % cid] = e
    f = {"question": question, "data": data, "hasHeader": True, "textCol": "", "idCol": "", "groupCol": "",
         "radio:sample": "all", "sampleN": "", "thickAt": "30", "radio:wcSize": "freq", "radio:wcUnit": "words",
         "wcFilter": "all", "wcMax": "60", "wcMin": "1", "wcExclude": "", "wcStop": True, "wcPlural": True,
         "radio:approach": "combined", "newCode": "", "codeView": "all", "codeSearch": "", "method": "",
         "redact": True}
    fd = {}
    for name, (text, impact) in (findings or {}).items():
        fd[by_name[name]] = {"text": text, "impact": impact, "skip": []}
    return doc("qualitative_analysis", f, {"codes": cl, "cid": len(cl), "coding": cd, "seq": order,
                                           "findings": fd, "sample": None, "boost": []})

def fishbone(title, effect, cats):
    """cats: {category: [cause or (cause, [sub causes])]}"""
    def node(c):
        if isinstance(c, tuple): return {"text": c[0], "children": [node(x) for x in c[1]]}
        return {"text": c, "children": []}
    return {"focus": {"tool": "fishbone_diagram", "version": 1, "saved": SAVED}, "title": title, "effect": effect,
            "categories": [{"name": k, "causes": [node(c) for c in v]} for k, v in cats.items()]}

def driver(title, aim, measure, drivers, balancing=()):
    """drivers: [(primary, measure, [(secondary, [change ideas])])]"""
    def proj(t): return {"kind": "project", "text": t, "measure": "", "children": []}
    out = []
    for p, m, secs in drivers:
        out.append({"kind": "driver", "text": p, "measure": m, "children": [
            {"kind": "driver", "text": s, "measure": "", "children": [proj(x) for x in ideas]} for s, ideas in secs]})
    return {"focus": {"tool": "driver_diagram", "version": 1, "saved": SAVED}, "title": title,
            "goal": {"text": aim, "measure": measure}, "drivers": out,
            "balancing": [{"text": b} for b in balancing]}

def process_map(title, scope, lanes, steps, unit="min"):
    """lanes: [(name, is_patient)]; steps: [(lane_index, type, text, value, time, issue, bottleneck)]"""
    L = [{"id": "l%d" % i, "name": n, "patient": p} for i, (n, p) in enumerate(lanes)]
    S = []
    for i, s in enumerate(steps):
        lane, typ, text, val, t, issue, bn = s[:7]
        no_to = s[7] if len(s) > 7 else ""
        S.append({"id": "s%d" % i, "lane": "l%d" % lane, "type": typ, "text": text, "value": val, "time": t,
                  "issue": issue, "bottleneck": bn, "noTo": no_to, "yesLabel": "Yes",
                  "noLabel": s[8] if len(s) > 8 else "No"})
    return {"focus": {"tool": "process_map", "version": 1, "saved": SAVED}, "title": title,
            "scope": scope, "unit": unit, "active": "current", "maps": {"current": {"lanes": L, "steps": S}, "future": None},
            "view": {"timeline": True, "issues": True, "handoffs": True}}

# --------------------------------------------------------------------------
# The case studies
# --------------------------------------------------------------------------
TOOL_NAMES = {
    "process_map": "Process map", "fishbone_diagram": "Fishbone diagram", "pareto_chart": "Pareto chart",
    "spc_tool": "SPC chart", "driver_diagram": "Driver diagram", "attribute_agreement": "Attribute agreement analysis",
    "bar_chart": "Bar chart", "chi_squared": "Chi-squared test", "matrix_2x2": "2x2 matrix",
    "box_plot": "Box and whisker plot", "scatter_plot": "Scatter plot", "multiple_regression": "Multiple regression",
    "qualitative_analysis": "Qualitative survey analysis", "funnel_plot": "Funnel plot",
}
# How each tool is named mid-sentence ("Open the ... with sample data")
OPEN_NAMES = {
    "process_map": "process map", "fishbone_diagram": "fishbone diagram", "pareto_chart": "Pareto chart",
    "spc_tool": "SPC chart", "driver_diagram": "driver diagram", "attribute_agreement": "attribute agreement tool",
    "bar_chart": "bar chart", "chi_squared": "chi-squared test", "matrix_2x2": "2x2 matrix",
    "box_plot": "box and whisker plot", "scatter_plot": "scatter plot", "multiple_regression": "multiple regression tool",
    "qualitative_analysis": "qualitative survey analysis tool", "funnel_plot": "funnel plot",
}
CASES = []

def case(**kw):
    kw["steps"] = []
    CASES.append(kw)
    return kw

def step(c, tool, title, sample, why, look, next_q, phase, chart=""):
    n = len(c["steps"]) + 1
    c["steps"].append({"n": n, "tool": tool, "tool_name": chart or TOOL_NAMES[tool], "open_name": OPEN_NAMES[tool], "title": title,
                       "why": why, "look": look, "next": next_q, "phase": phase,
                       "sample": "/case_studies/data/%s-%d.json" % (c["id"], n), "_doc": sample})


# ===== 1. Late discharges ===================================================
def case_late_discharges():
    rng = random.Random(101)
    c = case(id="late-discharges", number=1, source="flow", title="Why do our discharges happen late in the day?",
             question="Ward 7 discharges most patients in the late afternoon, so beds aren’t free when ED and theatres need them. Where does the time go, and what will change it?",
             summary="Map the discharge day, find the causes, rank the delays, set a baseline, plan changes and check they worked.",
             tools=["process_map", "fishbone_diagram", "pareto_chart", "spc_tool", "driver_diagram"],
             source_detail="GSTT Flow Manual: Principle 2 (time of discharge matters), Chapter 3 (proactive discharge planning) and the A3 template in Chapter 7.",
             pairs=[("readmissions-balancing", "Add a balancing measure so that discharging earlier doesn’t send patients back")],
             pitfalls=["Measure the percentage of discharges before midday, not the count, because the number of discharges changes from week to week.",
                       "Don’t recalculate SPC limits until a shift has lasted at least seven points and you know what changed.",
                       "Keep Epic delay reasons up to date. The Pareto chart is only as good as what’s recorded in Delays and Milestones."])
    step(c, "process_map", "Map the discharge day as it really happens",
         process_map("Ward 7 discharge day, current state (example)",
                     {"start": "Patient is discussed at the morning board round", "end": "Patient leaves the ward",
                      "who": "Adult medical inpatients going home on pathway 0"},
                     [("Patient", True), ("Consultant and medical team", False), ("Nurse in charge", False),
                      ("Pharmacy", False), ("Transport", False)],
                     [(0, "terminator", "Patient waits for the board round", "", 0, "", False),
                      (1, "step", "Board round confirms medically ready for discharge", "va", 15, "Starts 09:40 on most days, not 09:00", False),
                      (1, "decision", "Criteria-led discharge set yesterday?", "nnva", 1, "Rarely set the day before", False),
                      (0, "wait", "Waits for the consultant ward round", "nva", 120, "Ward round finishes around 12:30", True),
                      (1, "step", "Writes discharge medicines (TTO)", "nnva", 20, "TTOs written after the ward round", False),
                      (3, "wait", "TTO waits in the pharmacy queue", "nva", 150, "Afternoon peak in the dispensary", True),
                      (3, "step", "Screens and dispenses TTO", "va", 25, "", False),
                      (1, "step", "Writes the discharge letter (EDL)", "nnva", 30, "Often left until the TTO arrives", False),
                      (2, "step", "Books transport", "nnva", 10, "Only booked once medicines are back", False),
                      (4, "wait", "Waits for transport", "nva", 90, "", False),
                      (0, "wait", "Waits in the bed space, not the Discharge Unit", "nva", 45, "Fit to Sit not considered", False),
                      (0, "terminator", "Patient leaves the ward", "", 0, "", False)]),
         "Draw the steps from the board round to the patient leaving, with who does what and how long each wait takes. A shared picture stops the team arguing about whose step is slow.",
         "The long waits after the decision to discharge: for the ward round, the pharmacy queue and transport. Very little of the six or more hours adds value for the patient.",
         "Why are discharge medicines written so late?", "Observe")
    step(c, "fishbone_diagram", "Find the causes behind the late discharges",
         fishbone("Why are discharges late in the day? (example)", "Most discharges happen after 3pm",
                  {"People": [("No challenger at board round", ["Role not on the board round script"]),
                              ("Junior doctors on the ward round until midday", [])],
                   "Methods": [("TTOs written on the day of discharge", ["Discharge not planned the day before"]),
                               ("EDD not reviewed every day", []),
                               ("Criteria-led discharge rarely used", ["Criteria not agreed at the post-take round"]),
                               ("Transport booked after medicines arrive", [])],
                   "Materials": [("Patients’ own medicines not brought in", [])],
                   "Equipment": [("Epic not updated live during board round", ["Too few screens in the board round room"])],
                   "Environment": [("Discharge Unit seen as far away", []), ("Pharmacy afternoon peak", [])]}),
         "Bring the MDT together and ask “why?” until you reach causes you can act on, as the Flow Manual A3 template suggests (five whys).",
         "Causes cluster under Methods: discharge isn’t planned the day before, so everything happens in sequence on the day.",
         "Which of these causes delays the most patients?", "Observe")
    reasons = [("Awaiting discharge medicines (TTO)", 142), ("Awaiting transport", 61), ("Awaiting senior review", 48),
               ("Awaiting discharge letter", 37), ("Awaiting therapy assessment", 26), ("Awaiting family or carer", 22),
               ("Awaiting equipment", 14), ("Awaiting diagnostic result", 11), ("Other", 9)]
    step(c, "pareto_chart", "Rank the delay reasons recorded in Epic",
         pareto("Delays on the day of discharge, Ward 7, July to September (example)", tsv(["Delay reason", "Patients delayed"], reasons), "Patients delayed"),
         "Count the delay reasons from Epic Delays and Milestones and put them in order. The Pareto chart shows the vital few that make up most of the delay.",
         "Medicines and transport together make up over half of all delays. Fix these first.",
         "How late are we now? We need a baseline before changing anything.", "Observe")
    wk = weeks(46)
    def mk(r):
        out = []
        for w in wk[:26]:
            n = r.randint(58, 76); out.append((w, binom(r, n, 0.16), n, ""))
        return out
    base_rows = stable(rng, "p", mk)
    rows = list(base_rows)
    for i, w in enumerate(wk[26:], 26):
        n = rng.randint(58, 76)
        p = 0.22 if i < 30 else 0.29
        note = {26: "TTOs written the day before (PDSA 1)", 30: "Challenger role at board round (PDSA 2)", 34: "Transport booked the day before"}.get(i, "")
        rows.append((w, binom(rng, n, p), n, note))
    hdr = ["Week starting", "Discharges before 12pm", "All discharges", "Note"]
    step(c, "spc_tool", "Set a baseline: discharges before midday",
         spc("p", "Ward 7 discharges before midday (example)", tsv(hdr, base_rows), "up", "Ward 7 (example)", target=33),
         "Plot the weekly percentage of discharges before 12pm on a P chart. The limits show how much it varies by chance, so later changes can be judged fairly.",
         "Common cause variation around 16%, with no signals. The process is stable, but it will never reach 33% without a change to the system.",
         "What changes could move this measure?", "Observe", chart="SPC chart (P chart)")
    step(c, "driver_diagram", "Plan the changes",
         driver("Ward 7 discharges before midday (example)",
                "Increase discharges before midday on Ward 7 from 16% to 33% by March 2027",
                "Weekly % of discharges before 12pm (P chart)",
                [("Decide on discharge the day before", "% patients with an EDD reviewed at board round",
                  [("EDD agreed on admission and reviewed daily", ["Challenger asks “can they go today or tomorrow?”"]),
                   ("Criteria-led discharge used", ["Agree criteria at the post-take ward round"])]),
                 ("Medicines ready before the day", "% TTOs written by 4pm the day before",
                  [("TTOs written the day before", ["Afternoon TTO slot for next-day discharges"]),
                   ("Pharmacy prioritises next-day discharges", ["Pharmacist at the 2pm huddle"])]),
                 ("Patients leave the bed space early", "% discharges through the Discharge Unit",
                  [("Fit to Sit and the Discharge Unit used", ["Discharge Unit referral at board round"]),
                   ("Transport booked the day before", ["Book transport when the EDD is confirmed"])])],
                ["30-day emergency readmissions", "Patient experience of discharge"]),
         "Link the aim to the drivers you found, and to change ideas you can test one at a time with PDSA cycles. Add balancing measures so you notice harm elsewhere.",
         "Each change idea traces back to a cause from the fishbone and a delay from the Pareto chart. Readmissions is the balancing measure.",
         "Did the changes work?", "Create")
    step(c, "spc_tool", "Check the changes worked",
         spc("p", "Ward 7 discharges before midday, after changes (example)", tsv(hdr, rows), "up", "Ward 7 (example)", target=33),
         "Add the weeks after the changes to the same P chart, with a note for each PDSA cycle. Leave the limits calculated from all points until the signal is clear.",
         "Special cause improvement: a run of weeks below the mean before the changes, then runs of nine and ten weeks above it afterwards. Once it has held, open the table of values, choose Recalculate from here on week 27 and see the new level: close to, but not yet reliably at, the 33% target.",
         "Are we sending people home too early? Check readmissions (case study 12).", "Sustain", chart="SPC chart (P chart)")


# ===== 2. Flow Manual audit =================================================
def case_flow_audit():
    rng = random.Random(202)
    c = case(id="flow-audit", number=2, source="flow", title="Can we trust our Flow Manual audit, and where should we focus?",
             question="Clinical Groups complete the monthly Flow Manual audit, but different auditors may judge the same board round differently. Before acting on the results, are they reliable, and what do they tell us?",
             summary="Check auditors agree, compare chapters across Clinical Groups, test whether differences are real, pick priorities and track progress.",
             tools=["attribute_agreement", "bar_chart", "chi_squared", "matrix_2x2", "spc_tool"],
             source_detail="GSTT Flow Manual: Chapter 7 (Flow Improvement Cycle and the Flow Manual audit tool) and the board round example scenarios.",
             pairs=[("flow-cycle-triangulated", "Put the audit alongside performance data and MDT feedback")],
             pitfalls=["Check that auditors agree before comparing wards. Otherwise you may be comparing auditors, not wards.",
                       "A chi-squared test needs enough audits in each cell (an expected count of about 5 or more).",
                       "Audit percentages from small wards jump around. Use a P chart, not month-on-month red, amber and green ratings."])
    scen = []
    truth = ["Embedded"] * 10 + ["Not yet embedded"] * 10
    rng.shuffle(truth)
    flip = {"A": 0.04, "B": 0.08, "C": 0.24}
    for i, t in enumerate(truth, 1):
        row = [i, t]
        for a in "ABC":
            for _ in range(2):
                other = "Not yet embedded" if t == "Embedded" else "Embedded"
                row.append(other if rng.random() < flip[a] else t)
        scen.append(row)
    step(c, "attribute_agreement", "Check the auditors agree",
         attribute("Board round chapter ratings: agreement between auditors (example)",
                   tsv(["Scenario", "Standard (flow lead)", "Auditor A trial 1", "Auditor A trial 2", "Auditor B trial 1",
                        "Auditor B trial 2", "Auditor C trial 1", "Auditor C trial 2"], scen), 2, False,
                   ["Embedded", "Not yet embedded"]),
         "Three auditors each rate 20 written board round scenarios twice, such as the Ward A, B and C examples in the Flow Manual. Compare them with each other, with themselves and with the flow lead’s rating.",
         "Auditors A and B agree well with the standard. Auditor C is less consistent, even with themselves, so retrain them on the Challenger and attendance standards before trusting their wards’ results.",
         "Now we trust the ratings, where are standards embedded and where not?", "Find")
    chapters = ["Flow principles", "Board rounds", "Proactive discharge planning", "Independence and deconditioning",
                "Pathways out of hospital", "Operational flow and escalation"]
    groups = ["Medicine", "Surgery", "Cardiovascular", "Older people’s care"]
    base = {"Medicine": 48, "Surgery": 66, "Cardiovascular": 71, "Older people’s care": 63}
    adj = [6, -8, 0, -14, 4, 9]
    bars = [[ch] + [max(10, min(95, base[g] + adj[i] + rng.randint(-6, 6))) for g in groups] for i, ch in enumerate(chapters)]
    step(c, "bar_chart", "Compare chapters across Clinical Groups",
         bar("% of ward audits rated Embedded, by chapter and Clinical Group, last 3 months (example)", tsv(["Chapter"] + groups, bars), "% Embedded"),
         "Show the share of ward audits rated Embedded for each chapter, side by side for each Clinical Group, the same roll-up the Overall Maturity tab gives.",
         "Board rounds and Independence and deconditioning are the weakest chapters everywhere, and Medicine is lowest on most chapters.",
         "Is Medicine really different, or is that chance?", "Find")
    counts = {"Medicine": (21, 39), "Surgery": (31, 17), "Cardiovascular": (27, 12), "Older people’s care": (24, 18)}
    step(c, "chi_squared", "Test whether Clinical Groups really differ",
         chi("Board rounds chapter: audits Embedded or not, by Clinical Group, last 3 months (example)",
             tsv(["Clinical Group", "Embedded", "Not yet embedded"], [[g] + list(v) for g, v in counts.items()]), "Ward audits"),
         "Count ward audits for the Board rounds chapter, Embedded against Not yet embedded, for each Clinical Group, and test whether the split depends on the group.",
         "A small p-value: the split really does differ between groups, and Medicine has far more Not yet embedded audits than expected. Focus support there.",
         "What should Medicine work on first?", "Find")
    ideas = [("Appoint a challenger at every board round", 8, 8), ("Fix the board round start at 9am", 6, 7),
             ("Update EDDs live in Epic during the round", 6, 8), ("Board round script on the wall", 9, 4),
             ("Consultant of the Week model", 2, 9), ("Friday planning for weekend discharges", 5, 7),
             ("Fit to Sit prompt on the board", 8, 5), ("Refer to the Discharge Unit at board round", 7, 6),
             ("Virtual board round for outlying patients", 4, 5), ("Therapist at every board round", 3, 6),
             ("Flow champion on every ward", 5, 8), ("New bed management system", 1, 4)]
    step(c, "matrix_2x2", "Choose the priorities",
         matrix("Board round improvement ideas, Medicine (example)", tsv(["Idea", "Ease", "Impact"], ideas)),
         "Score each improvement idea from the audit comments on ease and impact with the flow champions. The matrix sorts quick wins from major projects.",
         "Quick wins: the challenger role, live EDD updates, a fixed 9am start and Discharge Unit referrals. Consultant of the Week is high impact but hard, so plan it as a bigger project.",
         "Are the changes lifting audit results over time?", "Create")
    rows = []
    def mk(r):
        out = []
        for m in months(13, (2024, 10)):
            n = r.randint(140, 170); out.append((m, binom(r, n, 0.58), n, ""))
        return out
    rows = stable(rng, "p", mk)
    for i, m in enumerate(months(11, (2025, 11))):
        n = rng.randint(140, 170)
        rows.append((m, binom(rng, n, 0.71), n, "Flow champions trained; challenger role started" if i == 0 else ""))
    step(c, "spc_tool", "Track standards met over time",
         spc("p", "Medicine: board round audit standards met (example)", tsv(["Month", "Standards met", "Standards audited", "Note"], rows),
             "up", "Medicine Clinical Group (example)", target=80),
         "Plot the share of audit standards met each month on a P chart to report to the PRM. This replaces month-on-month red, amber and green ratings.",
         "A run of months below the mean before the change, then 11 months in a row above it from the month the challenger role started, with a point above the upper limit. It’s special cause improvement, not noise. Report it upward, then recalculate the limits from November 2025 to show the new level.",
         "Does better board round practice change flow? See case study 7.", "Sustain", chart="SPC chart (P chart)")


# ===== 5. Medicine triangulation ===========================================
def case_medicine():
    rng = random.Random(505)
    c = case(id="medicine-triangulation", number=5, source="mdc", title="Quality, workforce and finance in the medicine division",
             question="The Director of Nursing is worried about falls. The Director of Workforce isn’t worried about sickness, and the Director of Finance says agency spend is stable. Each is looking at Trust totals on their own. What do the measures say when they’re put together?",
             summary="Start with Trust totals, drill into divisions, look for relationships between measures, add staff voices, then agree the causes and actions.",
             tools=["spc_tool", "box_plot", "scatter_plot", "multiple_regression", "qualitative_analysis", "fishbone_diagram", "driver_diagram"],
             source_detail="NHS England Making Data Count, Step 7: Triangulating data. Based on the St Elsewhere board story (quality, workforce and finance).",
             pairs=[("drill-down", "Drill down further into the falls and pressure damage data"),
                    ("ae-occupancy", "The second St Elsewhere conversation: flow and performance")],
             pitfalls=["Aggregate data can hide significant variation. Always look by division or ward before concluding all is well.",
                       "Scatter plots and regression show association, not cause. Use them to start a conversation, then test changes.",
                       "With few wards, regression can be unstable. Look at the size of each effect and its range, not only the p-value.",
                       "Involve your analyst from the start: they know the data and its limits."])
    m = months(24)
    def mk(r):
        out = []
        for i, mo in enumerate(m):
            med = 310 + (0 if i < 15 else 95 + (i - 15) * 6) + r.randint(-25, 25)
            other = 1180 - (0 if i < 15 else 95 + (i - 15) * 6) + r.randint(-45, 45)
            out.append((mo, med + other, med, other))
        return out
    rows = [(r[0], r[2], r[3]) for r in stable(rng, "xmr", mk)]
    step(c, "spc_tool", "Start with the Trust total: agency spend",
         spc("xmr", "Trust nursing agency spend, £000s (example)", tsv(["Month", "Agency spend (£000s)"], [(r[0], r[1] + r[2]) for r in rows]),
             "down", "St Elsewhere NHS Trust (example)", y_label="£000s"),
         "Plot the Trust’s monthly nursing agency spend on an XmR chart, the view the Director of Finance sees.",
         "Common cause variation only: spend looks stable, so at Trust level there seems to be nothing to worry about.",
         "Is every division stable, or are changes cancelling each other out?", "Find", chart="SPC chart (XmR)")
    step(c, "spc_tool", "Drill into one division: Medicine agency spend",
         spc("xmr", "Medicine nursing agency spend, £000s (example)", tsv(["Month", "Agency spend (£000s)", "Note"],
             [(r[0], r[1], "Two senior nurses left; vacancies rise" if i == 15 else "") for i, r in enumerate(rows)]),
             "down", "Medicine division (example)", y_label="£000s", base_n=15),
         "Plot the same measure for Medicine on its own, with limits fixed on the 15 months before anything changed.",
         "Special cause concern: from month 16 every point is above the upper limit. Other divisions’ agency spend fell by about the same amount, which is why the Trust total looked flat.",
         "Are quality measures also worse in Medicine?", "Find", chart="SPC chart (XmR)")
    wards = {"Medicine": ["Ward 7", "Ward 8", "Ward 9", "Ward 10", "Ward 11", "Ward 12"],
             "Surgery": ["Ward 20", "Ward 21", "Ward 22", "Ward 23", "Ward 24"],
             "Older people’s care": ["Ward 30", "Ward 31", "Ward 32", "Ward 33"],
             "Women’s and children’s": ["Ward 40", "Ward 41", "Ward 42"]}
    falls_mu = {"Medicine": 7.4, "Surgery": 4.3, "Older people’s care": 6.0, "Women’s and children’s": 1.8}
    brows = []
    for d, ws in wards.items():
        for w in ws:
            for _ in range(12):
                brows.append((d, round(max(0.3, rng.gauss(falls_mu[d], 1.4)), 1)))
    step(c, "box_plot", "Compare falls across divisions",
         box("Falls per 1,000 bed days, each ward each month, last 12 months, by division (example)", tsv(["Division", "Falls per 1,000 bed days"], brows), "Falls per 1,000 bed days"),
         "Show each ward’s monthly falls rate in a box for each division, so you see the middle, the spread and any outliers.",
         "Medicine’s whole box sits higher than every other division. This isn’t one bad ward; the whole division is affected.",
         "What else is different about Medicine’s wards?", "Observe")
    srows, rrows = [], []
    for d, ws in wards.items():
        for w in ws:
            train = {"Medicine": 74, "Surgery": 89, "Older people’s care": 84, "Women’s and children’s": 92}[d] + rng.randint(-5, 5)
            sick = {"Medicine": 6.8, "Surgery": 4.4, "Older people’s care": 5.2, "Women’s and children’s": 4.0}[d] + rng.uniform(-0.9, 0.9)
            agency = {"Medicine": 19, "Surgery": 8, "Older people’s care": 12, "Women’s and children’s": 5}[d] + rng.uniform(-4, 4)
            falls = 16.5 - 0.15 * train + 0.32 * sick + 0.09 * agency + rng.gauss(0, 0.5)
            srows.append((w, train, round(falls, 1), d))
            for _ in range(4):
                t2 = train + rng.randint(-3, 3); s2 = sick + rng.uniform(-1, 1); a2 = agency + rng.uniform(-3, 3)
                f2 = 16.5 - 0.15 * t2 + 0.32 * s2 + 0.09 * a2 + rng.gauss(0, 0.9)
                rrows.append((w, round(t2, 1), round(s2, 1), round(a2, 1), d, round(max(0.2, f2), 1)))
    step(c, "scatter_plot", "Look for a relationship: training and falls",
         scatter("Mandatory training compliance and falls, by ward (example)", tsv(["Ward", "Mandatory training compliance (%)", "Falls per 1,000 bed days", "Division"], srows)),
         "Plot each ward’s mandatory training compliance against its falls rate, coloured by division. This is the Director of Nursing’s hunch, put to the data.",
         "Wards with lower training compliance tend to have more falls, and Medicine’s wards sit in the bottom-right corner.",
         "Training, sickness and agency use all move together in Medicine. Which matters most?", "Observe")
    step(c, "multiple_regression", "Untangle the factors together",
         regression("What goes with higher falls rates? Ward-months (example)",
                    tsv(["Ward", "Training compliance (%)", "Sickness (%)", "Agency shifts (%)", "Division", "Falls per 1,000 bed days"], rrows),
                    5, 6, {"Training compliance (%)": 83, "Sickness (%)": 5.4, "Agency shifts (%)": 12, "Division": "Medicine"}),
         "Put training, sickness, agency use and division into one model of the falls rate, so each factor is judged while holding the others steady.",
         "Training compliance, sickness and agency use each have a clear link with falls once the others are taken into account, and training makes the biggest difference. Division adds nothing on top: Medicine’s higher falls are explained by its workforce measures, not by being Medicine.",
         "Numbers show what; staff can tell us why.", "Observe")
    comments = [
        (1, "Ward 7", "We are always short, and the agency nurses don’t know our patients or where anything is kept."),
        (2, "Ward 8", "I haven’t been able to do my manual handling update for months because I can’t be released from the ward."),
        (3, "Ward 9", "Agency staff get no ward induction, so they don’t know the falls bundle or how to use the sensor alarms."),
        (4, "Ward 7", "Sickness has gone up because people are exhausted. I’ve done four long days in a row to cover gaps."),
        (5, "Ward 10", "Our team is really supportive and the matron is visible, which helps on hard days."),
        (6, "Ward 11", "We lost three experienced nurses to the hospital down the road; they pay more for the same band."),
        (7, "Ward 12", "Training is all online and we never get protected time to do it."),
        (8, "Ward 8", "Night shifts are mostly bank and agency, so supervision of confused patients is hard."),
        (9, "Ward 9", "Recruitment takes so long that good candidates take other jobs before we can offer."),
        (10, "Ward 7", "When we have a full team, falls are rare. It’s the gaps that cause them."),
        (11, "Ward 10", "The new starters are great but they need time with someone experienced."),
        (12, "Ward 11", "I’m thinking of leaving because I can’t give the care I want to."),
        (13, "Ward 12", "Agency nurses are often brilliant, but they don’t get access to Epic training straight away."),
        (14, "Ward 8", "Sickness absence is mostly stress and back injuries."),
        (15, "Ward 9", "We need enhanced care support workers for patients at high risk of falls."),
        (16, "Ward 7", "Handover is rushed because we start late and everyone is behind."),
        (17, "Ward 10", "Flexible working would help me stay. At the moment it’s all or nothing."),
        (18, "Ward 11", "Pressure area checks get missed when we’re short."),
        (19, "Ward 12", "Our practice educator post has been vacant for a year."),
        (20, "Ward 9", "Proud of my team and how we pull together."),
        (21, "Ward 8", "The rota is published late so it’s hard to plan childcare, and people go off sick."),
        (22, "Ward 7", "Agency staff are not allowed to do some tasks, so the permanent staff carry more."),
        (23, "Ward 11", "I would like a clear career path, otherwise I’ll move on."),
        (24, "Ward 12", "Falls happen at night and at shift change when there is nobody in the bay."),
    ]
    codes = [("Staffing levels", "Not enough staff on shift", "short, gaps, nobody, full team"),
             ("Agency and bank induction", "Temporary staff not inducted or trained for the ward", "agency, bank, induction"),
             ("Training time", "Protected time and access to training", "training, update, educator, released"),
             ("Wellbeing and sickness", "Exhaustion, stress and sickness absence", "sickness, exhausted, stress"),
             ("Recruitment and retention", "Hiring and keeping staff", "leaving, recruitment, pay, career, stay"),
             ("Team support", "Positive team and leadership", "supportive, proud, together"),
             ("Patient safety", "Falls, pressure areas and supervision", "falls, pressure, supervision, confused")]
    coding = {1: (["Staffing levels", "Agency and bank induction"], "neg", True), 2: (["Training time"], "neg", False),
              3: (["Agency and bank induction", "Patient safety"], "neg", True), 4: (["Wellbeing and sickness", "Staffing levels"], "neg", True),
              5: (["Team support"], "pos", False), 6: (["Recruitment and retention"], "neg", False), 7: (["Training time"], "neg", False),
              8: (["Agency and bank induction", "Patient safety"], "neg", False), 9: (["Recruitment and retention"], "neg", False),
              10: (["Staffing levels", "Patient safety"], "mix", True), 11: (["Training time"], "mix", False),
              12: (["Recruitment and retention", "Wellbeing and sickness"], "neg", False), 13: (["Agency and bank induction", "Training time"], "mix", False),
              14: (["Wellbeing and sickness"], "neg", False), 15: (["Patient safety", "Staffing levels"], "neg", False),
              16: (["Staffing levels"], "neg", False), 17: (["Recruitment and retention"], "mix", False), 18: (["Patient safety", "Staffing levels"], "neg", True),
              19: (["Training time"], "neg", False), 20: (["Team support"], "pos", False), 21: (["Wellbeing and sickness"], "neg", False),
              22: (["Agency and bank induction", "Staffing levels"], "neg", False), 23: (["Recruitment and retention"], "neg", False),
              24: (["Patient safety", "Staffing levels"], "neg", False)}
    findings = {"Agency and bank induction": ("Temporary staff often start without a ward induction or the falls bundle, so the safety processes depend on a shrinking group of permanent staff.", "high"),
                "Training time": ("Staff can’t be released for mandatory training, which matches the fall in compliance seen in the data.", "high")}
    step(c, "qualitative_analysis", "Hear from staff: why is this happening?",
         qualitative("What would make the biggest difference to safe care on your ward?", comments, codes, coding, findings),
         "Code free-text comments from a staff pulse survey on Medicine’s wards. Qualitative data explains the “why” behind the numbers.",
         "Agency staff without induction, no protected training time and exhaustion come up again and again. They match what the regression found.",
         "Let’s pull the evidence together into causes.", "Observe")
    step(c, "fishbone_diagram", "Bring the evidence together",
         fishbone("Why have falls risen in Medicine? (example)", "Falls per 1,000 bed days have risen in Medicine",
                  {"People": [("High sickness absence", ["Stress and back injuries"]), ("Vacancies filled by agency", ["Staff leaving for better-paid posts nearby"])],
                   "Methods": [("Agency staff not inducted", ["No falls bundle briefing"]), ("No protected training time", [])],
                   "Materials": [("Practice educator post vacant", [])],
                   "Equipment": [("Sensor alarms not used by temporary staff", [])],
                   "Environment": [("Bays unobserved at shift change", [])]}),
         "Put the quantitative and qualitative findings on one cause and effect diagram with the divisional team.",
         "Workforce causes explain the quality problem, and the agency spend increase is a symptom of the same thing.",
         "What will the Board do about it?", "Create")
    step(c, "driver_diagram", "Agree the actions",
         driver("Reducing falls in Medicine (example)", "Reduce falls in Medicine to the Trust average (5 per 1,000 bed days) by September 2027",
                "Monthly falls per 1,000 bed days (U chart)",
                [("A trained, stable workforce", "Mandatory training compliance",
                  [("Agency staff inducted before their first shift", ["Invest in a training pack for agency nurses"]),
                   ("Protected time for training", ["Rostered training days"])]),
                 ("Fewer vacancies", "Vacancy rate",
                  [("Make the Trust an attractive place to work", ["Trial new incentives to work at the Trust"]),
                   ("Faster recruitment", ["Recruitment open days with on-the-day offers"])]),
                 ("Lower sickness absence", "Sickness rate",
                  [("Understand why staff are off sick", ["Analyse the reasons for staff sickness"])])],
                ["Agency spend", "Time staff spend away from the ward for training"]),
         "Turn the causes into a plan with measures from all three areas: quality, workforce and finance.",
         "The same three actions the St Elsewhere board chose: invest in training for agency nurses, trial incentives to work at the Trust, and analyse the reasons for sickness.",
         "Track falls, training, sickness and agency spend together on one divisional page.", "Create")


# ===== 6. A&E and occupancy ================================================
def case_ae():
    rng = random.Random(606)
    c = case(id="ae-occupancy", number=6, source="mdc", title="A&E performance and bed occupancy: what’s really going on?",
             question="Four-hour performance has got worse and bed occupancy is very high. The Medical Director is worried about length of stay and medical outliers, and the Director of Operations about A&E. Is more demand coming through the front door, or is something stopping patients leaving?",
             summary="Chart each measure on the same timeline, rule out demand, look at relationships, separate the factors, and check for a tipping point in occupancy.",
             tools=["spc_tool", "scatter_plot", "multiple_regression", "box_plot", "driver_diagram"],
             source_detail="NHS England Making Data Count, Step 7: Triangulating data. Based on the St Elsewhere Medical Director and Director of Operations conversation.",
             pairs=[("late-discharges", "Act on flow at ward level with the Flow Manual"),
                    ("medicine-triangulation", "The first St Elsewhere conversation: quality, workforce and finance")],
             pitfalls=["Line the SPC charts up on the same months. Triangulation is about when signals start together.",
                       "Weekly data gives more points for regression, but neighbouring weeks are related (autocorrelated). Treat p-values with care.",
                       "A stable admissions chart is a finding in itself: it rules demand out."])
    m = months(24)
    occ, att, ae, los = [], [], [], []
    for i, mo in enumerate(m):
        shock = i >= 14
        o = 91.2 + (4.6 if shock else 0) + rng.uniform(-1.1, 1.1)
        l = 118 + (36 if shock else 0) + (i - 14) * 2 * shock + rng.randint(-8, 8)
        a = rng.randint(14800, 15900)
        perf = 0.78 - (0.075 if shock else 0) + rng.uniform(-0.015, 0.015)
        occ.append((mo, round(o, 1), "Community intermediate care beds reduced" if i == 14 else ""))
        los.append((mo, l, "Community intermediate care beds reduced" if i == 14 else ""))
        ae.append((mo, round(a * perf), a, "Community intermediate care beds reduced" if i == 14 else ""))
    adm = stable(rng, "xmr", lambda r: [(mo, r.randint(2950, 3250), "") for mo in m])
    step(c, "spc_tool", "Chart the problem: four-hour performance",
         spc("p", "Patients seen within 4 hours in A&E (example)", tsv(["Month", "Within 4 hours", "Attendances", "Note"], ae), "up",
             "St Elsewhere NHS Trust (example)", target=78, laney=True),
         "Plot the share of A&E attendances seen within four hours. With around 15,000 attendances a month, use the P′ (Laney) chart, so limits allow for the large totals.",
         "Months above the mean for the first year, then from month 15 a run below it, with points below the lower limit. The deterioration is real, and it started at a definite point.",
         "Did something else change at the same time?", "Find", chart="SPC chart (P′ chart)")
    step(c, "spc_tool", "Same timeline: bed occupancy",
         spc("xmr", "General and acute bed occupancy, % (example)", tsv(["Month", "Occupancy (%)", "Note"], occ), "down",
             "St Elsewhere NHS Trust (example)", target=92, y_label="%", base_n=14),
         "Plot monthly general and acute bed occupancy for the same months.",
         "Occupancy jumps above the upper limit, to around 96%, in the same month that four-hour performance drops.",
         "Is that because more patients are being admitted?", "Find", chart="SPC chart (XmR)")
    step(c, "spc_tool", "Rule out demand: admissions from A&E",
         spc("xmr", "Emergency admissions via A&E (example)", tsv(["Month", "Admissions", "Note"], adm), "none",
             "St Elsewhere NHS Trust (example)"),
         "Plot emergency admissions through A&E. If they rose, demand could explain the occupancy.",
         "Common cause variation only: admissions are stable, so the hospital isn’t taking in more patients. Patients must be staying longer.",
         "Who is staying longer?", "Observe", chart="SPC chart (XmR)")
    step(c, "spc_tool", "Find who is staying: patients in hospital 21 days or more",
         spc("xmr", "Patients in hospital 21 days or more, month end (example)", tsv(["Month", "Patients", "Note"], los), "down",
             "St Elsewhere NHS Trust (example)", base_n=14),
         "Plot the number of long-stay patients at the end of each month.",
         "From month 15 the count is above the upper limit and still climbing, after a change in the wider system: community intermediate care beds were reduced.",
         "How closely does occupancy track four-hour performance?", "Observe", chart="SPC chart (XmR)")
    wk_rows, sc_rows, bx_rows = [], [], []
    for i, w in enumerate(weeks(52, date(2025, 9, 1))):
        shock = i >= 22
        o = 91 + (4.8 if shock else 0) + rng.uniform(-1.8, 1.8)
        l = 120 + (40 if shock else 0) + rng.randint(-12, 12)
        out_ = 18 + (16 if shock else 0) + rng.randint(-6, 6)
        a = rng.randint(3350, 3750)
        perf = 100 * (0.78 - 0.012 * max(0, o - 92) - 0.0004 * (l - 120) - 0.0008 * (out_ - 18) - 0.00002 * (a - 3550)) + rng.gauss(0, 1.2)
        perf = round(perf, 1); o = round(o, 1)
        wk_rows.append((w, a, o, l, out_, perf))
        sc_rows.append((w, o, perf))
        band = "Below 92%" if o < 92 else ("92% to 95%" if o <= 95 else "Above 95%")
        bx_rows.append((band, perf))
    bx_rows.sort(key=lambda r: ["Below 92%", "92% to 95%", "Above 95%"].index(r[0]))
    step(c, "scatter_plot", "Look at the relationship: occupancy and four-hour performance",
         scatter("Weekly bed occupancy and four-hour performance (example)", tsv(["Week starting", "Bed occupancy (%)", "Seen within 4 hours (%)"], sc_rows), False),
         "Plot each week’s occupancy against its four-hour performance.",
         "A strong negative relationship: the fuller the hospital, the worse A&E performs.",
         "Occupancy, long stays and outliers all rose together. Which matters most?", "Observe")
    step(c, "multiple_regression", "Separate the factors",
         regression("What goes with four-hour performance? Weekly (example)",
                    tsv(["Week starting", "A&E attendances", "Bed occupancy (%)", "Patients 21+ days", "Medical outliers", "Seen within 4 hours (%)"], wk_rows),
                    5, 5, {"A&E attendances": 3550, "Bed occupancy (%)": 94, "Patients 21+ days": 140, "Medical outliers": 26}),
         "Model weekly four-hour performance on attendances, occupancy, long-stay patients and outliers together.",
         "Occupancy has the biggest effect, and outliers add a little. Attendances add nothing, which confirms this isn’t a front-door demand problem. Long-stay patients show no separate effect because they work through occupancy: they’re why the beds are full.",
         "Is there a tipping point in occupancy?", "Observe")
    step(c, "box_plot", "Check for a tipping point",
         box("Four-hour performance by occupancy band, weekly (example)", tsv(["Occupancy band", "Seen within 4 hours (%)"], bx_rows), "% seen within 4 hours", True),
         "Group the weeks by occupancy band and compare four-hour performance in each band.",
         "Performance holds up below 92% occupancy but falls away above 95%. Freeing a modest number of beds would make a big difference.",
         "What will free those beds?", "Create")
    step(c, "driver_diagram", "Agree the actions",
         driver("Restoring flow (example)", "Bring general and acute occupancy below 92% and four-hour performance back to 78% by June 2027",
                "Monthly occupancy (XmR) and four-hour performance (P′ chart)",
                [("Fewer patients waiting in hospital for care elsewhere", "Patients in hospital 21+ days",
                  [("Faster assessment for going home", ["Invest in occupational therapy services"]),
                   ("Joint decisions with system partners", ["Convene a whole-system meeting", "Escalate through the twice-weekly DARM"])]),
                 ("New options for leaving hospital", "Pathway 1 and 3 delays",
                  [("Alternatives to residential care", ["Explore an intergenerational home"])]),
                 ("Patients on the right ward", "Medical outliers",
                  [("Daily outlier review", ["Virtual board round for outlying patients"])])],
                ["Readmissions within 30 days", "Elective cancellations"]),
         "Turn the findings into actions with system partners. The problem started outside the hospital, so the fix needs partners too.",
         "The same choices the St Elsewhere team made: invest in OT services, convene a whole-system meeting and explore an intergenerational home.",
         "Keep all five SPC charts together on one page and review them at each meeting.", "Create")


# ===== 7. Flow Improvement Cycle, triangulated =============================
def case_flow_cycle():
    rng = random.Random(707)
    c = case(id="flow-cycle-triangulated", number=7, source="both", title="The Flow Improvement Cycle, triangulated",
             question="The Flow Manual says to use three sources of evidence to find improvement opportunities: performance data, the monthly audits and MDT feedback. How do they fit together for one ward?",
             summary="Put the three sources side by side for Ward 9, agree priorities with the MDT, and turn them into a driver diagram ready for A3 and PDSA cycles.",
             tools=["spc_tool", "qualitative_analysis", "matrix_2x2", "driver_diagram"],
             source_detail="GSTT Flow Manual, Chapter 7 (FOCUS change approach: triangulate performance data, monthly audits and MDT feedback), with Making Data Count Step 7.",
             pairs=[("flow-audit", "Check the audit is reliable before relying on it"),
                    ("late-discharges", "A full worked example of one flow improvement")],
             pitfalls=["Agreement between sources is strong evidence. Disagreement is a question to explore, not an error.",
                       "Code MDT feedback before counting it. Raw comments are easy to skim selectively.",
                       "Record the work on the Flow Manual A3 template and feed the output into the PRM."])
    rows = stable(rng, "p", lambda r: [(w, binom(r, n, 0.61), n, "") for w, n in ((w, r.randint(34, 46)) for w in weeks(26, date(2026, 3, 30)))])
    step(c, "spc_tool", "Source 1, performance data: EDD set within 24 hours",
         spc("p", "Ward 9: patients with an EDD within 24 hours of admission (example)", tsv(["Week starting", "EDD within 24 hours", "Admissions", "Note"], rows),
             "up", "Ward 9 (example)", target=90),
         "Plot a Flow Manual standard from the Flow Oversight Dashboard: the share of patients with an expected discharge date set within 24 hours of admission.",
         "Stable around 60%, well short of the 90% target. The process is predictable but not capable.",
         "What does the audit say about why?", "Find", chart="SPC chart (P chart)")
    a_rows = stable(rng, "p", lambda r: [(mo, binom(r, n, 0.55), n, "") for mo, n in ((mo, r.randint(36, 44)) for mo in months(14, (2025, 8)))])
    step(c, "spc_tool", "Source 2, monthly audit: Proactive discharge planning standards met",
         spc("p", "Ward 9: Proactive discharge planning audit standards met (example)", tsv(["Month", "Standards met", "Standards audited", "Note"], a_rows),
             "up", "Ward 9 (example)", target=80),
         "Plot the share of Chapter 3 audit questions answered “yes” each month, such as “Did every patient have an EDD recorded?”.",
         "Also stable at a little over half. The audit agrees with the performance data, which strengthens the case for acting.",
         "What does the MDT say gets in the way?", "Find", chart="SPC chart (P chart)")
    comments = [
        (1, "Nursing", "The consultant isn’t always at board round, so nobody feels able to set the EDD."),
        (2, "Medical", "We set EDDs at the post-take round but they aren’t carried across to Epic."),
        (3, "Therapy", "We’re not asked about mobility until day three, so the EDD is a guess."),
        (4, "Nursing", "Board round starts late most days and we rush through the last patients."),
        (5, "Pharmacy", "If we knew tomorrow’s discharges at board round, we could prepare medicines in the afternoon."),
        (6, "Medical", "Nobody plays the challenger role, so plans drift."),
        (7, "Nursing", "Epic isn’t updated live; someone types it up afterwards, if at all."),
        (8, "Social work", "We hear about complex patients too late to arrange packages."),
        (9, "Therapy", "When the full MDT is there the board round is excellent and really quick."),
        (10, "Nursing", "Weekend discharges fall apart because plans aren’t made on Friday."),
        (11, "Medical", "The board round framework helps when we use it."),
        (12, "Nursing", "We need a screen big enough for everyone to see the Epic discharge planning view."),
        (13, "Therapy", "Fit to Sit is never discussed at our board round."),
        (14, "Medical", "Locum consultants don’t know the board round routine."),
        (15, "Nursing", "Families aren’t told the expected discharge date, so they aren’t ready."),
        (16, "Pharmacy", "TTOs arrive after 2pm and then everything queues."),
        (17, "Social work", "Long-stay patients are discussed every day but actions don’t have owners."),
        (18, "Nursing", "Good teamwork on our ward; we just need the basics in place."),
    ]
    codes = [("Senior presence", "Consultant or senior decision-maker at board round", "consultant, locum, senior"),
             ("Challenger role", "Constructive challenge of plans and EDDs", "challenger, challenge, drift"),
             ("Epic live updates", "Recording EDDs and actions live in Epic", "Epic, typed, screen"),
             ("Board round timing", "Start time and pace", "late, rush, starts"),
             ("Early MDT input", "Therapy, pharmacy and social work involved early", "day three, too late, prepare, packages"),
             ("Weekend planning", "Friday planning for weekend discharges", "weekend, Friday"),
             ("Actions and owners", "Clear actions with owners and dates", "owners, actions"),
             ("What works", "Things that help", "excellent, helps, good teamwork")]
    coding = {1: (["Senior presence"], "neg", True), 2: (["Epic live updates"], "neg", False), 3: (["Early MDT input"], "neg", False),
              4: (["Board round timing"], "neg", False), 5: (["Early MDT input"], "mix", True), 6: (["Challenger role"], "neg", True),
              7: (["Epic live updates"], "neg", False), 8: (["Early MDT input"], "neg", False), 9: (["What works"], "pos", False),
              10: (["Weekend planning"], "neg", False), 11: (["What works"], "pos", False), 12: (["Epic live updates"], "neg", False),
              13: (["Early MDT input"], "neg", False), 14: (["Senior presence"], "neg", False), 15: (["Early MDT input"], "neg", False),
              16: (["Early MDT input"], "neg", False), 17: (["Actions and owners"], "neg", True), 18: (["What works"], "pos", False)}
    step(c, "qualitative_analysis", "Source 3, MDT feedback: what gets in the way?",
         qualitative("What gets in the way of setting and keeping to an EDD on this ward?", comments, codes, coding),
         "Code comments from a board round debrief, grouped by profession. This is the Flow Manual’s third source: discussion and feedback from the MDT.",
         "Three themes stand out: the EDD isn’t updated live in Epic, there’s no challenger, and therapy, pharmacy and social work aren’t involved early. All three are Flow Manual standards.",
         "With the MDT, which do we tackle first?", "Observe")
    ideas = [("Challenger named on the board each morning", 9, 8), ("EDD typed live in Epic during board round", 4, 9),
             ("Therapy at board round from day one", 4, 8), ("Fixed 9am start, chair keeps time", 7, 6),
             ("Friday weekend planning huddle", 6, 7), ("Large screen for the Epic discharge view", 3, 6),
             ("Tell families the EDD on admission", 8, 6), ("Pharmacist told next-day discharges at board round", 8, 7),
             ("Locum consultant induction to the board round", 5, 5), ("Owner and date for every long-stay action", 8, 7)]
    step(c, "matrix_2x2", "Agree priorities with the MDT",
         matrix("Ward 9 board round ideas (example)", tsv(["Idea", "Ease", "Impact"], ideas)),
         "Score the ideas that came out of all three sources on ease and impact with the ward MDT and flow champion.",
         "Most ideas are quick wins, led by a named challenger, telling the pharmacist about next-day discharges, and an owner for every long-stay action. Typing EDDs live in Epic has the highest impact but needs a screen first, so it’s a major project.",
         "Turn these into a plan with measures.", "Create")
    step(c, "driver_diagram", "Plan the improvement",
         driver("Ward 9 proactive discharge planning (example)", "90% of Ward 9 patients have an EDD within 24 hours of admission by March 2027",
                "Weekly % EDD within 24 hours (P chart); monthly Chapter 3 audit (P chart)",
                [("Constructive challenge at every board round", "Audit: “Was a challenger appointed?”",
                  [("Challenger role assigned daily", ["Name the challenger on the board each morning"])]),
                 ("The whole MDT plans from day one", "Audit: “Were all core MDT members present?”",
                  [("Therapy and pharmacy at board round", ["Therapist joins from day one", "Pharmacist told about next-day discharges"])]),
                 ("Plans recorded live", "Audit: “Were actions and updates recorded live in Epic?”",
                  [("Epic used live in the round", ["Large screen for the discharge planning view"]),
                   ("Every action has an owner and a date", ["Owner and due date in Discharge Planning Activity comments"])])],
                ["Board round length", "Staff experience of board rounds"]),
         "Each driver uses a measure from one of the three sources, so progress can be triangulated in the same way.",
         "Ready to test with PDSA cycles and record on the Flow Manual A3 template (the A3 and PDSA tools are coming to FOCUS).",
         "Re-run this cycle each month: chart, audit, listen, prioritise.", "Undertake")


# ===== 11. Drilling into aggregate data =====================================
def case_drill_down():
    rng = random.Random(1111)
    c = case(id="drill-down", number=11, source="hcdg", title="Drilling into aggregate data",
             question="The Trust’s rate of hospital-acquired pressure ulcers has been stable for two years, so it gets little attention at the Quality Committee. Is every ward really stable, or is the Trust figure hiding a problem?",
             summary="Follow the drill-down pathway: chart the aggregate properly, compare units fairly, look at their spread, chart the unusual unit over time, then find causes.",
             tools=["spc_tool", "funnel_plot", "box_plot", "fishbone_diagram"],
             source_detail="Inspired by The Health Care Data Guide (Provost and Murray), Chapter 9: drilling down into aggregate data, and the Chapter 13 case studies on caesarean section and accidental puncture rates. Scenario and figures are our own.",
             pairs=[("medicine-triangulation", "The same idea from Making Data Count: aggregate data hides variation")],
             pitfalls=["With very large totals, ordinary P and U chart limits are too narrow. Use the P′ or U′ (Laney) chart for Trust-level data.",
                       "A unit outside the funnel limits needs understanding, not blame. Look for system causes first.",
                       "Check whether the unusual unit is a recent change or has always been different: the response differs."])
    wards = [("Ward 7", 9800), ("Ward 8", 9400), ("Ward 9", 10100), ("Ward 10", 8700), ("Ward 11", 9900), ("Ward 12", 9600),
             ("Ward 20", 8200), ("Ward 21", 7900), ("Ward 22", 8800), ("Ward 23", 6100), ("Ward 24", 5200),
             ("Ward 30", 9300), ("Ward 31", 8900), ("Ward 32", 9100), ("Ward 33", 7400),
             ("Ward 40", 4300), ("Ward 41", 3900), ("Critical care", 5600), ("Stroke unit", 7800), ("Renal ward", 6900)]
    rate = {w: 1.1 for w, _ in wards}
    rate["Ward 12"] = 2.6; rate["Stroke unit"] = 2.1; rate["Ward 41"] = 0.5
    def mk(r_):
        out = []
        for i, mo in enumerate(months(24)):
            bd = 0; pu = 0
            for w, b in wards:
                mb = b // 12 + r_.randint(-40, 40)
                r = rate[w] if (w != "Ward 12" or i >= 17) else 1.1
                bd += mb; pu += pois(r_, r * mb / 1000)
            out.append((mo, pu, bd, ""))
        return out
    trust = stable(rng, "u", mk)
    step(c, "spc_tool", "Chart the aggregate properly",
         spc("u", "Trust hospital-acquired pressure ulcers (category 2+) per 1,000 bed days (example)",
             tsv(["Month", "Pressure ulcers", "Bed days", "Note"], trust), "down", "St Elsewhere NHS Trust (example)",
             laney=True, per="1000", per_unit="bed days"),
         "Plot the Trust’s monthly rate on a U′ (Laney) chart. With over 13,000 bed days a month, ordinary U chart limits would flag almost every month.",
         "Common cause variation: by this measure the Trust is stable. This is where many reviews stop.",
         "Is every ward stable?", "Find", chart="SPC chart (U′ chart)")
    frows = []
    for w, b in wards:
        frows.append((w, {"Ward 12": 25, "Stroke unit": 22}.get(w, pois(rng, rate[w] * b / 1000)), b))
    step(c, "funnel_plot", "Compare wards fairly",
         funnel("Pressure ulcers per 1,000 bed days by ward (example)", tsv(["Ward", "Pressure ulcers", "Bed days"], frows),
                "last 12 months", "Pressure ulcers", "Bed days", 1000),
         "Plot each ward’s 12-month rate against its bed days. The funnel allows for size, so small wards aren’t flagged just for being small.",
         "Ward 12 and the Stroke unit sit above the upper limit. Ward 41 has the lowest rate, but it’s small enough that this could be chance. The funnel stops you over-reading it.",
         "Do these wards have high rates every month, or only some?", "Observe")
    brows = []
    for w in ["Ward 7", "Ward 9", "Ward 12", "Ward 22", "Stroke unit", "Ward 41"]:
        b = dict(wards)[w]
        for k in range(12):
            r = rate[w] if (w != "Ward 12" or k >= 5) else 1.1
            mb = b // 12
            brows.append((w, round(1000 * pois(rng, r * mb / 1000) / mb, 2)))
    step(c, "box_plot", "Look at the spread month by month",
         box("Monthly pressure ulcers per 1,000 bed days, selected wards, last 12 months (example)", tsv(["Ward", "Rate per 1,000 bed days"], brows), "Rate per 1,000 bed days", True),
         "Show each selected ward’s monthly rates in a box, with the points, comparing the flagged wards with typical ones.",
         "The Stroke unit is consistently high, which suggests its case mix (immobile patients). Ward 12 has a wide spread: some ordinary months and some very high ones.",
         "When did Ward 12 change?", "Observe")
    w12 = stable(rng, "u", lambda r: [(mo, pois(r, 1.3 * 800 / 1000), 800 + r.randint(-40, 40), "") for mo in months(17)])
    for i, mo in enumerate(months(7, (2026, 3))):
        mb = 800 + rng.randint(-40, 40)
        w12.append((mo, max(2, pois(rng, 4.2 * mb / 1000)), mb, "Mattress contract changed; new dynamic mattresses" if i == 0 else ""))
    step(c, "spc_tool", "Chart the unusual ward over time",
         spc("u", "Ward 12 pressure ulcers per 1,000 bed days (example)", tsv(["Month", "Pressure ulcers", "Bed days", "Note"], w12),
             "down", "Ward 12 (example)", per="1000", per_unit="bed days"),
         "Plot Ward 12 on its own U chart for 24 months.",
         "Stable for 17 months, then seven months in a row above the mean, with two above the upper limit. It’s a recent special cause, not a long-standing difference, and it began when the mattress contract changed.",
         "What changed in month 18, and why?", "Observe", chart="SPC chart (U chart)")
    step(c, "fishbone_diagram", "Find the causes on Ward 12",
         fishbone("Why have pressure ulcers risen on Ward 12? (example)", "Pressure ulcer rate on Ward 12 has risen since month 18",
                  {"Equipment": [("New dynamic mattresses", ["Staff not trained on the settings", "Alarms silenced, not reset"])],
                   "Methods": [("Repositioning checks not recorded", []), ("Skin bundle not restarted after outbreak", [])],
                   "People": [("Two tissue viability link nurses left", [])],
                   "Materials": [("Barrier cream supply changed", [])],
                   "Environment": [("More bed moves to make space", [])]}),
         "Run a cause and effect session with the Ward 12 team and the tissue viability nurse, as a learning conversation rather than a judgement.",
         "The new mattresses, used without training, are the most likely cause. Test a short training and settings checklist with a PDSA cycle, and keep the Ward 12 U chart running to see the effect.",
         "Share the learning: other wards received the same mattresses.", "Create")


# ===== 12. Readmissions as a balancing measure ==============================
def case_readmissions():
    rng = random.Random(1212)
    c = case(id="readmissions-balancing", number=12, source="hcdg", title="Discharge sooner, but at what cost? Readmissions as a balancing measure",
             question="The Trust is pushing for earlier, quicker discharges. Are patients coming back because they went home too soon?",
             summary="Track readmissions as a balancing measure, find the main reasons for coming back, check whether shorter stays mean more returns, test discharge routes, then plan safe discharge.",
             tools=["spc_tool", "pareto_chart", "scatter_plot", "chi_squared", "driver_diagram"],
             source_detail="Inspired by The Health Care Data Guide (Provost and Murray), Chapter 13 case study F on reducing hospital readmissions, and Chapter 2 on a family of measures (outcome, process and balancing). Scenario and figures are our own.",
             pairs=[("late-discharges", "The improvement this balancing measure protects")],
             pitfalls=["Agree the readmission definition first (for example, emergency readmission within 30 days to any ward).",
                       "Not every readmission is avoidable. Code the reasons before acting.",
                       "No difference in a chi-squared test isn’t proof of no effect: check you had enough patients."])
    rows = stable(rng, "p", lambda r: [(mo, binom(r, n, 0.118), n, "Earlier discharge programme starts" if i == 12 else "")
                                        for i, (mo, n) in enumerate((mo, r.randint(2700, 2950)) for mo in months(24))])
    step(c, "spc_tool", "Track the balancing measure",
         spc("p", "Emergency readmissions within 30 days (example)", tsv(["Month", "Readmitted within 30 days", "Discharges", "Note"], rows),
             "down", "Medicine (example)", laney=True),
         "Plot the share of discharges readmitted within 30 days, before and after the earlier discharge programme began. Use the P′ chart for these large monthly totals.",
         "No signal after month 13: readmissions haven’t risen. The balancing measure is holding.",
         "Even if the rate is stable, why do patients come back?", "Sustain", chart="SPC chart (P′ chart)")
    reasons = [("Medicines problem after discharge", 96), ("Same condition worsened", 81), ("Fall at home", 44),
               ("Care package not started", 38), ("New infection", 27), ("Follow-up not arranged", 22),
               ("Equipment not delivered", 13), ("Other", 18)]
    step(c, "pareto_chart", "Rank the reasons for readmission",
         pareto("Reasons for 30-day readmission, case note review of 339 patients (example)", tsv(["Reason", "Patients"], reasons), "Patients"),
         "Review a sample of readmitted patients’ notes and code the main reason each came back.",
         "Medicines problems and the same condition getting worse account for half of readmissions. Both can be addressed before the patient leaves.",
         "Do wards with shorter stays have more readmissions?", "Observe")
    sc = []
    for k in range(22):
        los = round(rng.uniform(4.2, 9.5), 1)
        rr = round(11.8 + rng.gauss(0, 1.6) - 0.05 * (los - 6.5), 1)
        sc.append(("Ward %d" % (k + 1), los, rr))
    step(c, "scatter_plot", "Shorter stays, more returns?",
         scatter("Average length of stay and readmission rate, by ward (example)", tsv(["Ward", "Average length of stay (days)", "Readmitted within 30 days (%)"], sc), False),
         "Plot each ward’s average length of stay against its readmission rate.",
         "No clear relationship: wards with shorter stays don’t have more readmissions.",
         "Does the way patients leave make a difference?", "Observe")
    step(c, "chi_squared", "Compare discharge routes",
         chi("Readmitted within 30 days, by discharge route (example)",
             tsv(["Discharge route", "Readmitted", "Not readmitted"],
                 [["Discharge Unit", 118, 902], ["Direct from the ward", 241, 1779], ["Criteria-led discharge", 52, 418], ["Weekend discharge", 61, 437]]),
             "Patients"),
         "Count patients readmitted or not for each discharge route used in the earlier discharge programme, and test whether readmission depends on the route.",
         "The p-value is well above 0.05: no evidence that the Discharge Unit, criteria-led or weekend discharges lead to more readmissions.",
         "So focus on the reasons patients return.", "Observe")
    step(c, "driver_diagram", "Plan safe discharge",
         driver("Safe earlier discharge (example)", "Keep 30-day readmissions at or below 11.8% while discharges before midday rise to 33%",
                "Monthly 30-day readmissions (P′ chart)",
                [("Patients understand and have their medicines", "% patients given medicines counselling",
                  [("Medicines reconciled and explained", ["Pharmacist counselling for patients on 5+ medicines"])]),
                 ("Problems caught early at home", "% patients called within 48 hours",
                  [("Safety-netting after discharge", ["Phone call within 48 hours", "Clear “who to call” card"])]),
                 ("Support in place on the day", "% packages confirmed before discharge",
                  [("Care and equipment confirmed", ["Package start confirmed at board round"]),
                   ("Follow-up booked before leaving", ["Book clinic follow-up in Epic before discharge"])])],
                ["Length of stay", "Discharges before midday"]),
         "Aim at the top readmission reasons, while keeping the earlier discharge work going.",
         "Earlier discharge and safe discharge work together. Length of stay becomes the balancing measure for this plan.",
         "Keep readmissions on the same page as discharges before midday.", "Create")


# ===== 14. Patient feedback =================================================
def case_feedback():
    rng = random.Random(1414)
    c = case(id="patient-feedback", number=14, source="hcdg", title="Learning from patient feedback",
             question="Friends and Family Test scores on the medical wards seem to have dropped. Is it real, what are patients telling us, and is it the same on every ward?",
             summary="Chart the score, code the comments, rank the themes, test whether wards differ, then plan changes with patients.",
             tools=["spc_tool", "qualitative_analysis", "pareto_chart", "chi_squared", "driver_diagram"],
             source_detail="Inspired by The Health Care Data Guide (Provost and Murray), Chapter 11: learning from patient feedback to improve care, with the Making Data Count guidance on quantitative and qualitative data. Scenario and comments are our own.",
             pairs=[("medicine-triangulation", "Put patient experience alongside quality and workforce data")],
             pitfalls=["Response numbers change every month. Chart the percentage on a P chart, not the raw count.",
                       "Read the comments, don’t only count them. One serious comment can matter more than many mild ones.",
                       "Remove names and other personal details before sharing quotes."])
    rows = []
    for i, mo in enumerate(months(24)):
        n = rng.randint(180, 240)
        rows.append((mo, binom(rng, n, 0.93 if i < 16 else 0.86), n, "Visiting hours cut; day room closed" if i == 16 else ""))
    step(c, "spc_tool", "Is the drop real?",
         spc("p", "Friends and Family Test: % positive, medical wards (example)", tsv(["Month", "Positive responses", "All responses", "Note"], rows),
             "up", "Medical wards (example)", target=93),
         "Plot the share of positive responses each month on a P chart.",
         "A run of months above the mean, then from month 17 a run below it, with points below the lower limit. The drop is a real change, not noise.",
         "What are patients saying?", "Find", chart="SPC chart (P chart)")
    comments = [
        (1, "Ward 7", "Waited all day to go home. I was told in the morning I could leave but didn’t get my medicines until 6pm."),
        (2, "Ward 8", "Nurses were kind and patient with my mum."),
        (3, "Ward 7", "Too noisy at night to sleep. Alarms going off constantly."),
        (4, "Ward 9", "Nobody told us what the plan was, we had to keep asking."),
        (5, "Ward 7", "Discharge was chaotic. Transport came before my letter was ready."),
        (6, "Ward 8", "Food was fine, good choice."),
        (7, "Ward 9", "Doctors explained everything clearly and involved me in decisions."),
        (8, "Ward 7", "My family couldn’t visit in the evening any more and I felt very alone."),
        (9, "Ward 8", "The day room was closed so I spent two weeks next to my bed."),
        (10, "Ward 9", "Pain relief was late most nights."),
        (11, "Ward 7", "I was ready to go at 10am but sat in a chair until the evening."),
        (12, "Ward 8", "Lovely staff, thank you."),
        (13, "Ward 9", "Different doctors every day said different things about when I could go home."),
        (14, "Ward 7", "Staff were rushed off their feet but always polite."),
        (15, "Ward 8", "Visiting hours are too short for people who work."),
        (16, "Ward 9", "I didn’t know who my nurse was."),
        (17, "Ward 7", "Waiting for the pharmacy took hours."),
        (18, "Ward 8", "Clean and calm ward."),
        (19, "Ward 9", "Nobody asked what I wanted."),
        (20, "Ward 7", "The noise from the nurses’ station kept me awake."),
        (21, "Ward 8", "My husband wasn’t allowed to stay with me even though I have dementia."),
        (22, "Ward 9", "Great care from the physiotherapists, they got me walking again."),
        (23, "Ward 7", "Told I was going home three days running, then it was cancelled."),
        (24, "Ward 9", "Not enough information about my medicines when I left."),
    ]
    codes = [("Waiting to go home", "Delays on the day of discharge", "medicines, pharmacy, ready to go, waited all day"),
             ("Communication and plans", "Being told the plan and who is caring for them", "told, plan, explained, information"),
             ("Visiting and loneliness", "Visiting hours, family presence, day room", "visit, family, alone, day room"),
             ("Noise at night", "Sleep and noise", "noise, noisy, alarms, awake"),
             ("Staff kindness", "How staff treated people", "kind, lovely, polite, patient"),
             ("Being involved", "Involved in decisions", "involved, asked what I wanted"),
             ("Pain and basic care", "Pain relief and basic needs", "pain"),
             ("Environment and food", "Ward, cleanliness and food", "food, clean")]
    coding = {1: (["Waiting to go home"], "neg", True), 2: (["Staff kindness"], "pos", False), 3: (["Noise at night"], "neg", False),
              4: (["Communication and plans"], "neg", False), 5: (["Waiting to go home", "Communication and plans"], "neg", False),
              6: (["Environment and food"], "pos", False), 7: (["Communication and plans", "Being involved"], "pos", True),
              8: (["Visiting and loneliness"], "neg", True), 9: (["Visiting and loneliness"], "neg", False), 10: (["Pain and basic care"], "neg", False),
              11: (["Waiting to go home"], "neg", False), 12: (["Staff kindness"], "pos", False), 13: (["Communication and plans"], "neg", True),
              14: (["Staff kindness"], "mix", False), 15: (["Visiting and loneliness"], "neg", False), 16: (["Communication and plans"], "neg", False),
              17: (["Waiting to go home"], "neg", False), 18: (["Environment and food"], "pos", False), 19: (["Being involved"], "neg", False),
              20: (["Noise at night"], "neg", False), 21: (["Visiting and loneliness"], "neg", True), 22: (["Staff kindness"], "pos", False),
              23: (["Waiting to go home", "Communication and plans"], "neg", False), 24: (["Communication and plans"], "neg", False)}
    findings = {"Visiting and loneliness": ("A new theme since visiting hours were cut and the day room closed. Patients, especially those with dementia, describe feeling alone. This lines up with when the score dropped.", "high"),
                "Waiting to go home": ("Patients told they could go in the morning wait until evening, mostly for medicines. This links to the late discharge work (case study 1).", "high")}
    step(c, "qualitative_analysis", "Code what patients are saying",
         qualitative("What was good about your stay, and what could we do better?", comments, codes, coding, findings),
         "Code a month of Friends and Family Test comments by theme and sentiment, and pick quotes.",
         "Two themes stand out: waiting all day to go home, and visiting and loneliness. The second started when visiting hours were cut, the same month the score dropped.",
         "How often does each theme come up over six months?", "Observe")
    themes = [("Visiting and loneliness", 74), ("Waiting to go home", 66), ("Communication and plans", 41), ("Noise at night", 23),
              ("Pain and basic care", 12), ("Being involved", 10), ("Environment and food", 6)]
    step(c, "pareto_chart", "Rank the negative themes",
         pareto("Negative comments by theme, medical wards, last 6 months (example)", tsv(["Theme", "Negative comments"], themes), "Negative comments"),
         "Count the negative comments in each theme over six months, using the codes from the last step.",
         "Visiting and waiting to go home make up over half of negative comments.",
         "Is it the same on every ward?", "Observe")
    step(c, "chi_squared", "Do the wards differ?",
         chi("Negative comments by theme and ward, last 6 months (example)",
             tsv(["Ward", "Visiting and loneliness", "Waiting to go home", "Communication and plans", "Other themes"],
                 [["Ward 7", 22, 39, 11, 12], ["Ward 8", 33, 12, 9, 13], ["Ward 9", 19, 15, 21, 16]]),
             "Negative comments"),
         "Count negative comments by theme for each ward and test whether the mix of themes depends on the ward.",
         "The mix differs: Ward 7 is mostly about waiting to go home, Ward 8 about visiting, and Ward 9 about communication and plans. One plan won’t fit all three wards.",
         "Plan changes with patients, ward by ward.", "Create")
    step(c, "driver_diagram", "Plan the changes with patients",
         driver("Improving patient experience on the medical wards (example)", "Return Friends and Family Test positive responses to 93% by June 2027",
                "Monthly % positive (P chart)",
                [("Patients aren’t left alone", "Negative comments on visiting",
                  [("Family can be present", ["Restore evening visiting", "Carers can stay for patients with dementia"]),
                   ("Somewhere to go off the bed", ["Reopen the day room"])]),
                 ("Leaving hospital is on time", "% discharges before midday (Ward 7)",
                  [("Medicines ready the day before", ["Link to the late discharges work"])]),
                 ("Patients know the plan", "Negative comments on communication (Ward 9)",
                  [("One consistent message", ["Daily “plan for today” on the bedside board"])])],
                ["Infection control incidents", "Staff time spent on visiting"]),
         "Turn the themes into a plan, with a different emphasis for each ward, and include patient representatives.",
         "Each driver has its own qualitative and quantitative measure, so the next round of feedback can show what changed.",
         "Keep charting the score and coding comments each month.", "Create")


SOURCES = {
    "flow": {"name": "GSTT Flow Manual", "short": "Flow Manual"},
    "mdc": {"name": "Making Data Count: Triangulating data", "short": "Making Data Count"},
    "hcdg": {"name": "The Health Care Data Guide", "short": "Health Care Data Guide"},
    "both": {"name": "Flow Manual and Making Data Count", "short": "Flow Manual and Making Data Count"},
}
PHASES = {"Find": "Find the opportunity", "Observe": "Observe the current state", "Create": "Create the plan",
          "Undertake": "Undertake the change", "Sustain": "Sustain the benefit"}

def main():
    for fn in (case_late_discharges, case_flow_audit, case_medicine, case_ae, case_flow_cycle,
               case_drill_down, case_readmissions, case_feedback):
        fn()
    os.makedirs(DATA_DIR, exist_ok=True)
    for f in os.listdir(DATA_DIR):
        if f.endswith(".json"): os.remove(os.path.join(DATA_DIR, f))
    out = []
    for c in CASES:
        steps = []
        for s in c["steps"]:
            d = s.pop("_doc")
            d["sample"] = {"caseTitle": c["title"], "caseUrl": "/case_studies/%s/" % c["id"], "step": s["n"],
                           "stepTitle": s["title"], "look": s["look"]}
            with open(os.path.join(ROOT, s["sample"].lstrip("/")), "w", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False, indent=1)
            s["phase_name"] = PHASES[s["phase"]]
            steps.append(s)
        c["steps"] = steps
        c["source_name"] = SOURCES[c["source"]]["name"]
        c["source_short"] = SOURCES[c["source"]]["short"]
        c["pairs"] = [{"id": p, "why": w, "title": next(x["title"] for x in CASES if x["id"] == p) if any(x["id"] == p for x in CASES) else p}
                      for p, w in c.get("pairs", [])]
        c["tool_names"] = [TOOL_NAMES[t] for t in c["tools"]]
        out.append(c)
        page_dir = os.path.join(ROOT, "case_studies", c["id"])
        os.makedirs(page_dir, exist_ok=True)
        with open(os.path.join(page_dir, "index.html"), "w", encoding="utf-8") as fh:
            fh.write("---\nlayout: case_study\ncase_id: %s\ntitle: %s\npermalink: /case_studies/%s/\n---\n"
                     % (c["id"], json.dumps("Case study: " + c["title"], ensure_ascii=False), c["id"]))
    groups = [{"id": k, "name": SOURCES[k]["name"], "cases": [c["id"] for c in out if c["source"] == k]}
              for k in ("flow", "mdc", "both", "hcdg")]
    with open(os.path.join(ROOT, "_data", "case_studies.json"), "w", encoding="utf-8") as fh:
        json.dump({"cases": out, "groups": [g for g in groups if g["cases"]]}, fh, ensure_ascii=False, indent=1)
    print("%d case studies, %d steps" % (len(out), sum(len(c["steps"]) for c in out)))

if __name__ == "__main__":
    main()

# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""Fills in the Word project initiation document (PID) with the worked example."""
import copy
import docx

from officekit import detemplate
from example import *


def _set(p, text, italic=False, bold=None):
    """Put text in paragraph p, in its first run's formatting."""
    runs = p.runs
    if not runs:
        r = p.add_run(text)
    else:
        r = runs[0]
        r.text = text
        for extra in runs[1:]:
            extra._r.getparent().remove(extra._r)
    r.italic = italic
    if bold is not None:
        r.bold = bold
    return p


def _copy(p):
    """A copy of paragraph p's XML without its bookmarks (ids must be unique)."""
    el = copy.deepcopy(p._p)
    for b in el.xpath(".//w:bookmarkStart | .//w:bookmarkEnd"):
        b.getparent().remove(b)
    return el


def _lines(p, lines):
    """Replace guidance paragraph p with lines (the first keeps its place)."""
    _set(p, lines[0])
    prev = p
    for text in lines[1:]:
        el = _copy(p)
        prev._p.addnext(el)
        prev = docx.text.paragraph.Paragraph(el, p._parent)
        _set(prev, text)


def _after(p, lines):
    """Add plain paragraphs after heading p, styled like the body text."""
    prev = p
    for text in lines:
        el = _copy(p)
        prev._p.addnext(el)
        new = docx.text.paragraph.Paragraph(el, p._parent)
        new.style = p.part.document.styles["Normal"]
        _set(new, text, bold=False)
        prev = new


def _table(t, rows, start=1):
    while len(t.rows) < start + len(rows):
        t._tbl.append(copy.deepcopy(t.rows[-1]._tr))
    for r, vals in enumerate(rows, start):
        for c, v in enumerate(vals):
            if v is None:
                continue
            cell = t.rows[r].cells[c]
            p = cell.paragraphs[0]
            _set(p, v)
            for extra in cell.paragraphs[1:]:
                extra._p.getparent().remove(extra._p)


def pid(src, dst):
    doc = docx.Document(detemplate(src))
    P_ = doc.paragraphs
    find = lambda start: next(p for p in P_ if p.text.strip().startswith(start))
    for r in P_[0].runs:
        if r.text.strip() == "Title":
            r.text = NAME
    _set(P_[2], "Date: 26/01/26, Version: 1.0")

    _lines(find("Use this section to document your case for change"), [
        "Only 16% of patients on our 8 adult medical wards go home before midday, against 33% in the best-performing trusts. Beds free up late in the day, so patients in A&E wait for a bed into the evening: in December 2025, 41% of medical admissions waited more than 4 hours in A&E after the decision to admit.",
        "Average length of stay on the 8 wards is 7.4 days. A November 2025 audit of 120 discharges found medicines to take out (TTOs) ready on average 4.2 hours after they were prescribed, and 1 in 3 patients waiting on the ward for transport after they were ready to go.",
        "Patients tell us the day they go home is long and uncertain: 'I was told I could go at 9 and left at 6.'",
    ])
    _lines(find("Use this section to document what your objectives are"), [
        "1. Increase discharges before midday on the 8 medical wards from 16% to 33% by 30 September 2026.",
        "2. Reduce average length of stay from 7.4 to 6.9 days by 30 September 2026, releasing about 3,000 bed days a year.",
        "3. Reduce the time from TTO prescribed to ready from 4.2 to 2 hours by 31 July 2026.",
        "4. Set an expected discharge date within 24 hours of admission for 90% of patients by 30 September 2026.",
        "5. Do this without a rise in readmissions within 30 days (13.8%).",
    ])
    _lines(find("Use this section to document what your high-level plan"), [
        "We will redesign the discharge day with the people who do the work, using Plan, Do, Study, Act cycles. We will start on Wards 5 and 6 in March and spread ward by ward, so all 8 wards are live by June.",
        "Four core workstreams (board rounds and criteria-led discharge; TTOs; transport and the discharge lounge; complex discharges) are supported by two enabling workstreams (data and measurement; PMO, comms and engagement).",
        "Progress is measured weekly on SPC charts and reported through highlight reports and a fortnightly leadership report. The programme closes at the end of September 2026, when the work is handed to the Clinical Group.",
    ])
    _lines(find("Use this section to document the required resources"), [
        "The programme needs CITI improvement support and protected time from the Clinical Group, as set out below and in the resource planner.",
    ])
    _after(find("Team"), [
        "CITI: Programme Director (0.2 WTE), Programme Manager (1.0 WTE), 3 Improvement Managers and a Project Manager (2.8 WTE in total), Senior Analyst (0.4 WTE), PMO Officer (0.5 WTE).",
        "Clinical Group: SRO and Accountable Executive (0.1 WTE each), clinical lead (1 session a week), matron (0.2 WTE), ward managers (2 hours a week each), lead pharmacist (0.2 WTE).",
    ])
    _after(find("Funding"), [
        "£35k capital for discharge lounge chairs and refurbishment (agreed). £95k a year revenue for 2 pharmacy technicians (business case to the March investment panel). CITI time is met from the CITI budget.",
    ])
    _after(find("Other corporate support"), [
        "Digital: an expected discharge date field in the board round view. Estates: lounge refurbishment. Communications: launch, patient leaflet and case study. Procurement: patient transport contract.",
    ])
    _lines(find("Use this section to document what the timescales"), [
        "The programme runs from mobilisation in February 2026 to closure on 30 September 2026. The key milestones are:",
    ])
    _table(doc.tables[0], [
        ["M1", "Kick-off and mobilisation workshop", "02/02/2026"],
        ["M2", "Baseline agreed", "23/02/2026"],
        ["M3", "Board round tested on Wards 5 and 6", "27/03/2026"],
        ["M4", "Pharmacy technicians in post", "05/05/2026"],
        ["M5", "All 8 wards live", "05/06/2026"],
        ["M6", "Handover to the Clinical Group", "31/08/2026"],
        ["M7", "Closure report", "30/09/2026"],
    ])
    _lines(find("Use this section to document who the supporting stakeholders"), ["The programme is led by:"])
    for label, key in (("SRO:", "sro"), ("Project Manager:", "pm"), ("Clinical Lead:", "clin"), ("Operational Lead:", "ops")):
        p = find(label)
        p.add_run(" " + who(key)).bold = False
    _lines(find("Use this section to document what governance structure"), [
        "A fortnightly Programme Leadership Meeting, chaired by the SRO, oversees progress, risks, resources and benefits. A weekly programme huddle, chaired by the Programme Manager, reviews highlight reports from each workstream. The programme reports monthly to the Medicine Clinical Group Executive Committee and the Urgent and Emergency Care Programme Board.",
    ])
    find("Accountable Forum:").add_run(" Medicine Clinical Group Executive Committee").bold = False
    _lines(find("Use this section to document what your key risks"), ["The key risks and issues at the start of the programme are below. The full list is in the RAID log."])
    _table(doc.tables[1], [
        ["Risk: winter-level bed pressures pull ward staff away from training and testing.", "Start with 2 wards; 30-minute training slots at ward huddles; matrons protect time."],
        ["Risk: the pharmacy technician business case is delayed.", "Take to the March investment panel; interim bank cover agreed."],
        ["Risk: changes are not kept up after support ends, as happened after the 2024 pilot.", "Ward champions, quarterly Flow Manual audit and a planned handover from July."],
        ["Issue: no reliable data on TTO ready times.", "Senior Analyst to build a TTO tracker from the pharmacy system by end of February."],
    ])
    _lines(find("Use this section to document what your key interdependencies"), ["The programme depends on:"])
    _table(doc.tables[2], [
        ["An expected discharge date field in the board round view", "Digital: electronic patient record team"],
        ["Named social workers for the daily transfer of care huddle", "Local authority hospital social work team"],
        ["Same day emergency care changes, so medical admissions don't rise", "Urgent and Emergency Care Programme"],
    ])
    _lines(find("Use this section to document who are they stakeholders"), ["The key stakeholders are below. The stakeholder map and communication plan has the full list."])
    _table(doc.tables[3], [
        [P["sro"][0], P["sro"][1], "SRO"],
        [P["ae"][0], P["ae"][1], "Accountable Executive"],
        [P["pd"][0], P["pd"][1], "Programme Director"],
        [P["pharm"][0], P["pharm"][1], "TTO workstream clinical lead"],
        [P["sw"][0], P["sw"][1], "Partner, complex discharges"],
        [P["supplier"][0], P["supplier"][1], "Senior supplier"],
    ])
    _lines(find("Use this section to document what the ROI"), ["Return is cost avoided from about 3,000 bed days a year at £400 a bed day, from half way through year 1. Figures in £ thousands."])
    roi = [
        ["35", "0", "0", "0", "0", "35"],
        ["0", "0", "0", "0", "0", "0"],
        ["-35", "0", "0", "0", "0", "-35"],
        ["180", "95", "95", "95", "95", "560"],
        ["600", "1,200", "1,200", "1,200", "1,200", "5,400"],
        ["420", "1,105", "1,105", "1,105", "1,105", "4,840"],
    ]
    _table(doc.tables[4], [[None, None] + r for r in roi])
    _lines(find("Use this section to document what your KPIs"), ["We will track these weekly on SPC charts. Readmissions is a balancing measure."])
    _table(doc.tables[5], [[k[0], k[1], k[2], "30/09/2026"] for k in KPI])
    _lines(find("Use this section to document any expected benefits"), [
        "Patients: home earlier in the day, with their medicines explained and a clear time to leave.",
        "A&E: shorter waits for a medical bed in the afternoon and evening.",
        "Staff: calmer afternoons, fewer late discharges and less time chasing transport and TTOs.",
        "Quality: a standard board round on every medical ward, built into induction and the Flow Manual audit.",
    ])
    doc.core_properties.title = NAME
    doc.save(dst)

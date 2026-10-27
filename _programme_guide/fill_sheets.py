# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""Fills in the Excel templates with the worked example (example.py).

Each function writes the filled workbook and returns a preview for the guide
page: a list of tables, {"name", "columns", "rows"}, with optional "rag" (the
index of a red/amber/green column) and "gantt" settings."""
from datetime import date, timedelta

from officekit import Book, col_letters, col_num
from example import *

WS_NAMES = [w[1] for w in WS] + [e[1] for e in ENABLING]


def d(day, month, year=2026):
    return date(year, month, day)


def fmt(v):
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    if v is None:
        return ""
    return str(v)


def _workstream_lists(b, sheet, first_row, col="B", rows=8):
    """Swap the template's example workstreams in a drop-down list for ours."""
    for i in range(rows):
        b.set(sheet, f"{col}{first_row + i}", WS_NAMES[i] if i < len(WS_NAMES) else None)


# --------------------------------------------------------------------------
RISKS = [
    # ref, raised, owner, responsible, workstream, title, description, L, I, mitigation, L2, I2, trend, impact date, status, commentary, closed, escalate
    ("R-001", d(9, 2), "Tom Reid", "Grace Mensah", WS_NAMES[0], "Bed pressures", "If winter-level bed pressures continue into spring, ward staff will miss board round training and the spread will slip.", 4, 4, "Train in 30-minute slots at the ward huddle; matrons protect time; start with 2 wards.", 3, 4, "Up", d(30, 4), "Open", "Pressures continued into May; escalated to leadership meeting 14/05.", None, "Yes"),
    ("R-002", d(9, 2), "Dr Amara Okafor", "Leila Haddad", WS_NAMES[1], "Business case delay", "If the pharmacy technician business case is delayed, TTOs will still wait for dispensary staff.", 3, 4, "Take to the March investment panel; agree interim bank cover.", 2, 3, "Down", d(31, 3), "Closed", "Approved 18/03; both posts filled 05/05.", d(5, 5), "No"),
    ("R-003", d(23, 2), "Leila Haddad", "Arjun Mehta", WS_NAMES[1], "Technicians pulled away", "If dispensary is short-staffed, ward technicians will be pulled back and TTO times will rise.", 3, 3, "Agree a minimum ward cover rule with the pharmacy manager.", 2, 3, "No Change", d(30, 6), "Open", "Rule agreed 28/04; happened twice in May.", None, "No"),
    ("R-004", d(2, 3), "Kwame Asante", "Kwame Asante", WS_NAMES[2], "Transport capacity", "If the provider cannot add morning vehicles, patients will wait in the lounge until the afternoon.", 3, 3, "Share daily booking forecasts with the provider; review at the monthly contract meeting.", 2, 3, "Down", d(30, 4), "Open", "Morning slots up from 6 to 10 a day.", None, "No"),
    ("R-005", d(2, 3), "Fiona Gallagher", "Martin Doyle", WS_NAMES[3], "Social work input", "If the local authority cannot staff the daily huddle, complex discharges will not move earlier.", 2, 4, "Agree named social workers and a deputy rota.", 2, 3, "No Change", d(31, 5), "Open", "Running daily since 13/04.", None, "No"),
    ("R-006", d(16, 3), "James Holloway", "Omar Siddiqui", WS_NAMES[4], "Data quality", "If ward codes are wrong in the TTO data, the tracker will show the wrong wards' times.", 3, 2, "Check codes against bed management each week.", 1, 2, "Down", d(30, 4), "Closed", "Merged into issue I-002.", d(22, 4), "No"),
]
ISSUES = [
    ("I-001", d(20, 4), "Dr Sofia Marquez", "Grace Mensah", WS_NAMES[1], "Junior doctor rota gaps", "Rota gaps on Wards 1 to 4 mean TTOs are not written the day before.", 4, "Clinical Director to raise with the rota team; decision on locum cover at leadership meeting.", "Up", "Open", "Escalated 14/05.", None, "Yes"),
    ("I-002", d(22, 4), "Omar Siddiqui", "Omar Siddiqui", WS_NAMES[4], "Tracker ward codes", "Wards 2 and 3 have the wrong codes in the TTO tracker.", 2, "Fix the codes with Digital; back-fill April data.", "No Change", "Open", "Fix due 22/05.", None, "No"),
    ("I-003", d(6, 4), "Kwame Asante", "Joy Adebayo", WS_NAMES[2], "Lounge chairs", "2 of 12 lounge chairs broken, so the lounge fills by 11am.", 2, "Estates to replace from the capital budget.", "Down", "Closed", "Replaced 24/04.", d(24, 4), "No"),
]
ASSUMPTIONS = [
    ("AS-001", d(2, 2), "Mobilisation workshop", "Ward time", "Ward teams can free 2 hours a week each for the programme.", "If not, the spread to 8 wards takes longer.", WS_NAMES[0], "Grace Mensah", "High", "Open"),
    ("AS-002", d(2, 2), "Mobilisation workshop", "Transport at no cost", "The transport provider can take more morning bookings within the current contract.", "If not, we need a contract change (3 months).", WS_NAMES[2], "Kwame Asante", "Medium", "Closed"),
    ("AS-003", d(9, 2), "Leadership meeting", "Data available", "Discharge times can be taken daily from the patient record.", "If not, the dashboard is weekly and manual.", WS_NAMES[4], "Omar Siddiqui", "Medium", "Closed"),
    ("AS-004", d(9, 2), "Leadership meeting", "Readmissions stable", "Earlier discharge does not raise readmissions; we track this as a balancing measure.", "If readmissions rise, we pause and review.", WS_NAMES[0], "Dr Sofia Marquez", "High", "Open"),
]
DEPENDENCIES = [
    ("DEP-001", d(9, 2), WS_NAMES[0], "Board rounds workstream", "Digital (patient record team)", "EDD field in the board round view", d(30, 6), "Agreed", "In the June release", "A", "High"),
    ("DEP-002", d(9, 2), WS_NAMES[3], "Complex discharges workstream", "Local authority social work", "Named social workers for the daily huddle", d(13, 4), "Delivered", "Live 13/04", "G", "High"),
    ("DEP-003", d(16, 3), WS_NAMES[2], "Transport and lounge workstream", "Estates", "Lounge refurbishment and 4 extra chairs", d(30, 4), "Delivered late", "Done 06/05", "G", "Medium"),
    ("DEP-004", d(16, 3), WS_NAMES[0], "Whole programme", "UEC Programme", "Same day emergency care changes, so admissions don't rise", d(31, 7), "Meeting planned", "Next UEC board 21/05", "A", "Medium"),
]


def raid(src, dst):
    b = Book(src)
    b.set("Cover", "C3", NAME)
    b.set("Cover", "C4", who("pm"))
    review = d(11, 5)
    for sheet in ("Risks", "Issues", "Assumptions", "Dependencies"):
        b.set(sheet, "D4", review)
    _workstream_lists(b, "Definitions and Validation", 59, rows=7)
    wrap = {"H", "I", "M", "T"}
    for i, r in enumerate(RISKS):
        row = 7 + i
        (ref, raised, owner, resp, ws, title, desc, l1, i1, mit, l2, i2, trend, impact, status, comm, closed, esc) = r
        b.row("Risks", row, "C", [ref, raised, owner, resp, ws, title, desc, l1, i1, f"=J{row}*K{row}", mit, l2, i2, f"=N{row}*O{row}", trend, impact, status, comm, closed, esc], wrap_cols=wrap)
    for row in range(7 + len(RISKS), 32):
        for c in "JKNO":
            b.set("Risks", f"{c}{row}", None)
    for i, r in enumerate(ISSUES):
        b.row("Issues", 7 + i, "C", list(r), wrap_cols={"H", "I", "K", "N"})
    for i, r in enumerate(ASSUMPTIONS):
        b.row("Assumptions", 7 + i, "C", list(r), wrap_cols={"F", "G", "H"})
    for i, r in enumerate(DEPENDENCIES):
        b.row("Dependencies", 7 + i, "C", list(r), wrap_cols={"F", "G", "H", "K"})
    b.active_sheet("Risks")
    b.save(dst)
    return [
        {"name": "Risks", "columns": ["Ref", "Raised", "Owner", "Workstream", "Title", "Description", "L", "I", "Exposure", "Mitigation", "L after", "I after", "Exposure after", "Trend", "Status", "Commentary", "Escalate"],
         "rows": [[r[0], fmt(r[1]), r[2], r[4], r[5], r[6], r[7], r[8], r[7] * r[8], r[9], r[10], r[11], r[10] * r[11], r[12], r[14], r[15], r[17]] for r in RISKS],
         "heat": [8, 12]},
        {"name": "Issues", "columns": ["Ref", "Raised", "Owner", "Workstream", "Title", "Description", "Impact", "Actions to resolve", "Trend", "Status", "Commentary", "Escalate"],
         "rows": [[r[0], fmt(r[1]), r[2], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[13]] for r in ISSUES]},
        {"name": "Assumptions", "columns": ["Ref", "Raised", "Raised by", "Title", "Assumption", "Impact if wrong", "Workstream", "Owner", "Priority", "Status"],
         "rows": [[r[0], fmt(r[1])] + list(r[2:]) for r in ASSUMPTIONS]},
        {"name": "Dependencies", "columns": ["Ref", "Raised", "Workstream affected", "Who depends on it", "Who delivers it", "Description", "Delivery date", "Status", "Commentary", "RAG", "Priority"],
         "rows": [[r[0], fmt(r[1]), r[2], r[3], r[4], r[5], fmt(r[6])] + list(r[7:]) for r in DEPENDENCIES], "rag": 9},
    ]


# --------------------------------------------------------------------------
ACTIONS = [
    ("A-001", "PMO, comms and engagement", "Set up the Teams site, action log and RAID log", "Kick-off, 02/02", d(2, 2), "Ruth Adeyemi", d(6, 2), None, "Closed", "Done", d(5, 2)),
    ("A-002", "Data and measurement", "Build the baseline: discharges before midday by ward, Oct to Dec 2025", "Kick-off, 02/02", d(2, 2), "Omar Siddiqui", d(20, 2), None, "Closed", "16% baseline agreed at leadership meeting", d(23, 2)),
    ("A-003", "Medicines to take out (TTOs)", "Write the pharmacy technician business case", "Leadership meeting, 09/02", d(9, 2), "Leila Haddad", d(6, 3), None, "Closed", "Approved 18/03", d(18, 3)),
    ("A-004", "Board rounds and criteria-led discharge", "Agree the board round standard with Ward 5 and 6 teams", "Board rounds group, 17/02", d(17, 2), "Dr Sofia Marquez", d(13, 3), d(27, 3), "Closed", "Moved 2 weeks for ward manager leave", d(25, 3)),
    ("A-005", "Transport and discharge lounge", "Ask the provider for 4 more morning slots a day", "Transport group, 02/03", d(2, 3), "Kwame Asante", d(31, 3), None, "Closed", "Agreed from 13/04", d(9, 4)),
    ("A-006", "Complex discharges", "Agree terms of reference for the daily transfer of care huddle", "Transport group, 02/03", d(2, 3), "Fiona Gallagher", d(3, 4), None, "Closed", "Signed off with local authority", d(1, 4)),
    ("A-007", "Board rounds and criteria-led discharge", "Train Ward 1 and 2 teams in the board round standard", "Weekly huddle, 11/05", d(11, 5), "Joy Adebayo", d(22, 5), None, "In progress", "Ward 1 done; Ward 2 booked 20/05", None),
    ("A-008", "Data and measurement", "Fix ward codes for Wards 2 and 3 in the TTO tracker (I-002)", "Weekly huddle, 27/04", d(27, 4), "Omar Siddiqui", d(8, 5), d(22, 5), "In progress", "Waiting on Digital", None),
    ("A-009", "Medicines to take out (TTOs)", "Agree weekend technician cover with the pharmacy manager", "TTO group, 07/05", d(7, 5), "Leila Haddad", d(29, 5), None, "Open", "", None),
    ("A-010", "PMO, comms and engagement", "Write the patient leaflet with the patient panel", "Leadership meeting, 30/04", d(30, 4), "Nadia Rahman", d(12, 6), None, "Open", "Panel meets 03/06", None),
]
DECISIONS = [
    ("D-001", "Board rounds and criteria-led discharge", d(9, 2), "High", "Which wards test the board round first?", d(23, 2), "Wards 5 and 6: keen ward managers, and Ward 6 ran the 2024 pilot", "Programme Leadership Meeting", d(23, 2), "Closed", "", "Baseline by ward"),
    ("D-002", "Data and measurement", d(9, 2), "High", "Which measure is the main outcome?", d(23, 2), "Discharges before midday, with length of stay and readmissions alongside", "Programme Leadership Meeting", d(23, 2), "Closed", "", "Benefits register"),
    ("D-003", "Transport and discharge lounge", d(2, 3), "Medium", "Should the lounge open at 8am, and who staffs it?", d(30, 3), "Open at 8am from 30/04, staffed by moving 1 healthcare assistant from the late shift", "Medicine senior leadership team", d(26, 3), "Closed", "", "Lounge activity data"),
    ("D-004", "Medicines to take out (TTOs)", d(14, 4), "Medium", "How do we fund weekend TTO cover?", d(28, 4), "From the technician budget, by staggering rotas", "Programme Leadership Meeting", d(28, 4), "Closed", "", "Rota options paper"),
    ("D-005", "Medicines to take out (TTOs)", d(14, 5), "Very high", "Locum cover for junior doctor rota gaps on Wards 1 to 4 (I-001)?", d(28, 5), "", "Medicine Clinical Group Executive Committee", None, "Open", "Escalated from leadership meeting 14/05", "Rota gap analysis"),
]


def actions(src, dst):
    b = Book(src)
    b.set("1. Cover", "B4", NAME)
    _workstream_lists(b, "Lists", 3)
    for i, r in enumerate(ACTIONS):
        b.row("2. Action Log", 2 + i, "A", list(r), wrap_cols={"B", "C", "D", "J"})
    for i, r in enumerate(DECISIONS):
        b.row("3. Decisions Log", 3 + i, "A", list(r), wrap_cols={"B", "E", "G", "H", "K", "L"})
    b.set("3. Decisions Log", "A1", f"DECISIONS LOG\n{NAME}")
    b.active_sheet("2. Action Log")
    b.save(dst)
    return [
        {"name": "Action log", "columns": ["ID", "Workstream", "Action", "Raised at", "Raised", "Owner", "Due", "Revised due", "Status", "Commentary", "Closed"],
         "rows": [[fmt(v) for v in r] for r in ACTIONS]},
        {"name": "Decisions log", "columns": ["ID", "Workstream", "Raised", "Priority", "Decision to be made", "Due", "Final decision", "Approved by", "Decision date", "Status", "Commentary", "Reference"],
         "rows": [[fmt(v) for v in r] for r in DECISIONS]},
    ]


# --------------------------------------------------------------------------
BENEFITS = [
    # objective, beneficiary, benefit, enablers, project owner, CG owner, measure, reported, baseline, base date, target, target date, frequency, source, manager, owner, cash, %cash, £, external
    ("Discharge patients earlier in the day", "Patients; A&E", "B01 - AB - More discharges before midday", "Board rounds; TTOs; lounge", "James Holloway", "Grace Mensah", "% of discharges before 12:00, 8 wards", "Y", "16%", d(31, 12, 2025), "33%", d(30, 9), "Weekly", "Patient record discharge times", "Omar Siddiqui", "Grace Mensah", "N", "", "", ""),
    ("Reduce length of stay", "Patients; Trust", "B02 - AB - Shorter average length of stay", "All workstreams", "James Holloway", "Tom Reid", "Average LOS (days), excl. zero-day stays", "Y", "7.4", d(31, 12, 2025), "6.9", d(30, 9), "Monthly", "Inpatient data warehouse", "Omar Siddiqui", "Tom Reid", "N", "", "£1.2m cost avoidance a year (3,000 bed days)", ""),
    ("Medicines ready on time", "Patients; ward staff", "B03 - AB - Faster TTOs", "Technician posts; TTO the day before", "Hannah Lee", "Leila Haddad", "Hours from TTO prescribed to ready", "N", "4.2", d(30, 11, 2025), "2.0", d(31, 7), "Weekly", "Pharmacy system (TTO tracker)", "Omar Siddiqui", "Leila Haddad", "N", "", "", "Digital: tracker codes"),
    ("Use the discharge lounge", "Patients; wards", "B04 - AB - More eligible discharges via the lounge", "Lounge open 8am; morning transport", "Chloe Evans", "Kwame Asante", "% of eligible discharges through the lounge", "Y", "12%", d(31, 12, 2025), "40%", d(30, 9), "Weekly", "Lounge register", "Omar Siddiqui", "Kwame Asante", "N", "", "", "Transport provider"),
    ("Plan discharge from admission", "Patients; families", "B05 - AB - EDD set within 24 hours", "Board round standard; EDD field", "Ben Carter", "Joy Adebayo", "% of patients with an EDD within 24 hours", "N", "41%", d(31, 1), "90%", d(30, 9), "Weekly", "Board round audit", "Omar Siddiqui", "Joy Adebayo", "N", "", "", "Digital: EDD field"),
    ("Keep patients safe", "Patients", "B06 - DB - Risk of more readmissions (balancing)", "Criteria-led discharge safeguards", "James Holloway", "Dr Sofia Marquez", "% readmitted within 30 days", "Y", "13.8%", d(31, 12, 2025), "No rise", d(30, 9), "Monthly", "Inpatient data warehouse", "Omar Siddiqui", "Dr Sofia Marquez", "N", "", "", ""),
]


def benefits(src, dst):
    b = Book(src)
    b.set("Benefits Register", "A8", f"CITI-26-014 {NAME} - Benefits Register")
    for i, r in enumerate(BENEFITS):
        b.row("Benefits Register", 13 + i, "A", list(r), wrap_cols=set("ABCDEFGNST"))
    for row in range(13 + len(BENEFITS), 23):
        for c in ("C", "H", "Q"):
            b.set("Benefits Register", f"{c}{row}", None)
    b.set("Benefits Register", "B26", "Draft issued 02/02/2026 by James Holloway")
    b.set("Benefits Register", "A27", "V0.2")
    b.set("Benefits Register", "B27", "Baselines added 23/02/2026 by Omar Siddiqui")
    b.set("Benefits Register", "A28", "V1.0")
    b.set("Benefits Register", "B28", "Agreed at Programme Leadership Meeting 09/03/2026")
    b.save(dst)
    return [{"name": "Benefits register", "columns": ["Objective", "Beneficiary", "Benefit", "Enablers", "Measure", "Baseline", "Baseline date", "Target", "Target date", "Frequency", "Data source", "Benefit owner", "£ value"],
             "rows": [[r[0], r[1], r[2], r[3], r[6], r[8], fmt(r[9]), r[10], fmt(r[11]), r[12], r[13], r[15], r[18]] for r in BENEFITS]}]


# --------------------------------------------------------------------------
TEAM = [
    ("James Holloway", "Programme Manager", 5, 5),
    ("Ben Carter", "Improvement Manager", 5, 5),
    ("Hannah Lee", "Improvement Manager", 3, 3),
    ("Chloe Evans", "Project Manager", 3, 3),
    ("Sam Patel", "Improvement Manager", 3, 3),
    ("Omar Siddiqui", "Senior Analyst", 2, 2),
]
RP_START = d(2, 2)
RP_WEEKS = 31          # columns G to AK
RP_ACTUAL_WEEKS = 15   # up to the week of 11 May


def _planned(i, w):
    """Planned days for person i in week w (0-based): lighter in the first
    and last month, nothing in August for the analyst."""
    name, role, full, _ = TEAM[i]
    if w < 4:
        return max(1, full - 2) if i else full
    if w >= 27:
        return 1 if i == 5 else max(1, full - 2)
    return full


def _actual(i, w):
    p = _planned(i, w)
    # a few real-life wobbles: leave and the March pressures
    if (i, w) in {(1, 7), (3, 11)}:
        return 0
    if (i, w) in {(2, 5), (4, 9)}:
        return p - 1
    if (i, w) == (5, 2):
        return p + 2
    return p


def resources(src, dst):
    b = Book(src)
    b.set("Sheet1", "B2", NAME)
    b.set("Sheet1", "B3", P["pm"][0])
    b.set("Sheet1", "B4", RP_START)
    for i in range(6):
        row = 8 + i
        if i < len(TEAM):
            b.set("Sheet1", f"B{row}", TEAM[i][0])
            b.set("Sheet1", f"C{row}", TEAM[i][1])
        for w in range(RP_WEEKS):
            b.set("Sheet1", f"{col_letters(7 + w)}{row}", _planned(i, w) if i < len(TEAM) else None)
        arow = 19 + i
        for w in range(38):
            v = _actual(i, w) if i < len(TEAM) and w < RP_ACTUAL_WEEKS else None
            b.set("Sheet1", f"{col_letters(7 + w)}{arow}", v)
    # the template's external resources rows repeat the people above by mistake
    for row in range(30, 36):
        for c in "BCDE":
            b.set("Sheet1", f"{c}{row}", None)
        b.set("Sheet1", f"F{row}", None)
    b.save(dst)
    weeks = [RP_START + timedelta(weeks=w) for w in range(RP_WEEKS)]
    planned = [sum(_planned(i, w) for w in range(RP_WEEKS)) for i in range(len(TEAM))]
    actual = [sum(_actual(i, w) for w in range(RP_ACTUAL_WEEKS)) for i in range(len(TEAM))]
    show = list(range(0, RP_WEEKS, 2))
    return [
        {"name": "Planned days", "columns": ["Name", "Role", "Total planned days"] + [weeks[w].strftime("%d %b") for w in show],
         "rows": [[t[0], t[1], planned[i]] + [_planned(i, w) for w in show] for i, t in enumerate(TEAM)],
         "note": "Every other week shown here; the workbook has every week."},
        {"name": "Actual days (to 11 May)", "columns": ["Name", "Role", "Planned", "Worked so far", "Remaining"],
         "rows": [[t[0], t[1], planned[i], actual[i], planned[i] - actual[i]] for i, t in enumerate(TEAM)]},
    ]


# --------------------------------------------------------------------------
PLAN_START = d(2, 3)
PLAN = [
    # (row, type, id, description, responsible, start, due, status, % complete, critical, comment)
    (4, "Workstream", 1, "Board rounds and criteria-led discharge", "Dr Sofia Marquez", d(2, 3), d(5, 6), "In progress", None, "Y", ""),
    (5, "Activity", 1.1, "Agree the board round standard with Wards 5 and 6", "Dr Sofia Marquez", d(2, 3), d(27, 3), "COMPLETE", 1, "Y", "2 weeks late: ward manager leave"),
    (6, "Sub-activity", "1.1.1", "Observe 4 board rounds on each ward", "Ben Carter", d(2, 3), d(13, 3), "COMPLETE", 1, "N", ""),
    (7, "Sub-activity", "1.1.2", "Run PDSA tests of the 30-minute board round", "Joy Adebayo", d(16, 3), d(27, 3), "COMPLETE", 1, "Y", "3 PDSA cycles"),
    (8, "Activity", 1.2, "Criteria-led discharge policy through Clinical Governance", "Dr Sofia Marquez", d(23, 3), d(24, 4), "COMPLETE", 1, "N", "Approved 24/04"),
    (9, "Activity", 1.3, "Spread the board round to Wards 1 to 4, 7 and 8", "Joy Adebayo", d(30, 3), d(5, 6), "In progress", 0.75, "Y", "6 of 8 wards live"),
    (10, "Milestones", 1.4, "Board round live on all 8 wards", "Grace Mensah", d(5, 6), d(5, 6), "Not started", 0, "Y", ""),
    (13, "Workstream", 2, "Medicines to take out (TTOs)", "Leila Haddad", d(2, 3), d(5, 6), "In progress", None, "Y", ""),
    (14, "Activity", 2.1, "Agree the TTO process for the day before discharge", "Leila Haddad", d(2, 3), d(10, 4), "COMPLETE", 1, "N", ""),
    (15, "Activity", 2.2, "Recruit 2 pharmacy technicians", "Leila Haddad", d(16, 3), d(1, 5), "COMPLETE", 1, "Y", "Started 05/05"),
    (16, "Activity", 2.3, "Build the daily TTO tracker", "Omar Siddiqui", d(23, 3), d(22, 5), "In progress", 0.6, "N", "Ward codes issue I-002"),
    (17, "Activity", 2.4, "Spread TTO the day before to all 8 wards", "Arjun Mehta", d(20, 4), d(5, 6), "In progress", 0.4, "Y", "Rota gaps on Wards 1 to 4"),
    (23, "Workstream", 3, "Transport and discharge lounge", "Kwame Asante", d(9, 3), d(29, 5), "In progress", None, "N", ""),
    (24, "Activity", 3.1, "Agree 4 more morning transport slots", "Kwame Asante", d(9, 3), d(10, 4), "COMPLETE", 1, "N", ""),
    (25, "Activity", 3.2, "Open the lounge at 8am", "Kwame Asante", d(23, 3), d(30, 4), "COMPLETE", 1, "N", "Opened 30/04"),
    (26, "Activity", 3.3, "Promote the lounge at ward huddles", "Chloe Evans", d(4, 5), d(29, 5), "In progress", 0.5, "N", ""),
    (31, "Workstream", 4, "Complex discharges", "Fiona Gallagher", d(9, 3), d(22, 5), "In progress", None, "N", ""),
    (32, "Activity", 4.1, "Start the daily transfer of care huddle", "Fiona Gallagher", d(9, 3), d(13, 4), "COMPLETE", 1, "N", "Live 13/04"),
    (33, "Activity", 4.2, "Plan the discharge to assess pilot", "Sam Patel", d(20, 4), d(22, 5), "In progress", 0.5, "N", ""),
    (37, "Workstream", 5, "Data and measurement", "Omar Siddiqui", d(2, 3), d(22, 5), "In progress", None, "Y", ""),
    (38, "Activity", 5.1, "Agree baseline and data definitions", "Omar Siddiqui", d(2, 3), d(13, 3), "COMPLETE", 1, "Y", ""),
    (39, "Activity", 5.2, "Weekly SPC dashboard for each ward", "Omar Siddiqui", d(16, 3), d(22, 5), "In progress", 0.8, "N", ""),
    (45, "Workstream", 6, "PMO, comms and engagement", "Ruth Adeyemi", d(2, 3), d(22, 5), "In progress", None, "N", ""),
    (46, "Activity", 6.1, "Launch event and ward roadshows", "Nadia Rahman", d(2, 3), d(10, 4), "COMPLETE", 1, "N", ""),
    (47, "Meeting", 6.2, "Programme Leadership Meeting (fortnightly)", "Ruth Adeyemi", d(2, 3), d(22, 5), "In progress", 0.85, "N", ""),
    (48, "Activity", 6.3, "Patient leaflet with the patient panel", "Nadia Rahman", d(4, 5), d(22, 5), "In progress", 0.3, "N", ""),
]


def _workdays(a, b):
    n, x = 0, a
    while x <= b:
        if x.weekday() < 5:
            n += 1
        x += timedelta(days=1)
    return n


def plan(src, dst):
    b = Book(src)
    b.set("Plan", "A1", f"ACTIVITY PLAN (2 March 2026 - 5 June 2026)\n{NAME}")
    b.set("Plan", "A2", P["pm"][0])
    b.set("Plan", "I1", PLAN_START)
    b.set("Plan", "I2", d(5, 6))
    # month labels over the weekly columns
    week_cols = ["N", "S", "X", "AC", "AH", "AM", "AR", "AW", "BB", "BG", "BL", "BQ", "BU"]
    last = None
    for i, c in enumerate(week_cols):
        m = (PLAN_START + timedelta(weeks=i)).strftime("%B")
        b.set("Plan", f"{c}1", m if m != last else None)
        last = m
    b.set("Plan", "BL2", "Week 11")
    rows = {r[0] for r in PLAN}
    for row in range(4, 55):
        if row not in rows:
            for c in "ABCDEFGHIJKL":
                b.set("Plan", f"{c}{row}", None)
    ws_rows = [r[0] for r in PLAN if r[1] == "Workstream"]
    days_style = b.style_of("Plan", "G5")
    for (row, typ, ident, desc, resp, start, due, status, pct, crit, comm) in PLAN:
        b.set("Plan", f"A{row}", typ)
        b.set("Plan", f"B{row}", ident)
        b.set("Plan", f"D{row}", desc)
        b.set("Plan", f"E{row}", resp)
        b.set("Plan", f"F{row}", start)
        b.set("Plan", f"G{row}", _workdays(start, due), style=days_style)
        b.set("Plan", f"H{row}", due)
        b.set("Plan", f"I{row}", status)
        if typ == "Workstream":
            kids = [r[0] for r in PLAN if r[0] > row and r[1] != "Workstream" and all(not (row < w <= r[0]) for w in ws_rows if w != row)]
            b.set("Plan", f"J{row}", "=AVERAGE(J%d:J%d)" % (min(kids), max(kids)))
        else:
            b.set("Plan", f"J{row}", pct)
        b.set("Plan", f"K{row}", crit)
        b.set("Plan", f"L{row}", comm)
    b.set("Plan", "K1", "=AVERAGE(" + ",".join(f"J{r}" for r in ws_rows) + ")")
    b.save(dst)
    out = []
    for (row, typ, ident, desc, resp, start, due, status, pct, crit, comm) in PLAN:
        if typ == "Workstream":
            kids = [r for r in PLAN if r[0] > row and r[1] != "Workstream" and all(not (row < w <= r[0]) for w in ws_rows if w != row)]
            pct = sum(k[8] for k in kids) / len(kids)
        out.append([typ, str(ident), desc, resp, fmt(start), fmt(due), status, f"{round(pct * 100)}%", crit, comm])
    return [{"name": "Activity plan", "columns": ["Type", "ID", "Activity", "Responsible", "Start", "Due", "Status", "% complete", "Critical path", "Comments"],
             "rows": out, "gantt": {"start": PLAN_START.isoformat(), "weeks": 14, "startCol": 4, "endCol": 5}}]

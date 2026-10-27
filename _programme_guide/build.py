# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
Builds the FOCUS programme guide, which follows the FOCUS stages: Find the
opportunity, Observe the current state, Create the plan, Undertake the change
and Sustain the benefit.

Run from the repository root:   python3 _programme_guide/build.py

It reads the blank templates in programme_guide/templates/ and writes
  programme_guide/examples/<template>-example.<pptx|xlsx|docx>
                                    each template filled in with the worked example
  programme_guide/previews/<id>-<n>.jpg
                                    a picture of each page of the PowerPoint and
                                    Word examples (needs LibreOffice and pdftoppm)
  _data/programme_guide.json        the stages, documents, decision tree and the
                                    spreadsheet previews (the page reads this)

The worked example (one made-up programme) is in example.py, and how each
template is filled in is in fill_slides.py, fill_sheets.py and fill_pid.py.
Edit those or the catalogue and decision tree below, then re-run. Commit what
it writes. Set SOFFICE to the LibreOffice command if it isn't `soffice`;
--no-previews skips the pictures.
"""
import glob, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
GUIDE = os.path.join(ROOT, "programme_guide")
TPL = os.path.join(GUIDE, "templates")
EXAMPLES = os.path.join(GUIDE, "examples")
PREVIEWS = os.path.join(GUIDE, "previews")

import fill_slides, fill_sheets, fill_pid
import example as X

# --------------------------------------------------------------------------
# The FOCUS stages, in order
# --------------------------------------------------------------------------
STAGES = [
    {"id": "find", "letter": "F", "name": "Find the opportunity", "question": "What could be better, and is it worth doing?",
     "text": "Spot the problem or opportunity, describe it on a page with its scope and the benefits you expect, and get a sponsor (SRO) to agree. If you need CITI's help, agree a support plan with them.",
     "tools": ["pareto_chart", "run_chart"]},
    {"id": "observe", "letter": "O", "name": "Observe the current state", "question": "How does it work now, and how well?",
     "text": "See the process as it really works, find the causes of the problem and measure where you are now. Set a baseline for each benefit you want, and map who is affected and who has a say.",
     "tools": ["process_map", "fishbone_diagram", "pareto_chart", "run_chart", "spc_tool"]},
    {"id": "create", "letter": "C", "name": "Create the plan", "question": "What will we change, who will do it, and when?",
     "text": "Decide on the changes, set up the team, its roles and governance, and plan the activities, milestones and people's time. For larger work, write a project initiation document.",
     "tools": ["driver_diagram", "matrix_2x2"]},
    {"id": "undertake", "letter": "U", "name": "Undertake the change", "question": "Are we on track, and what is getting in the way?",
     "text": "Test and spread the changes. Keep the RAID log and the action and decision log up to date, and report progress every week to the programme huddle and every fortnight to the leadership meeting.",
     "tools": ["run_chart", "spc_tool", "a3_report"]},
    {"id": "sustain", "letter": "S", "name": "Sustain the benefit", "question": "Did it work, will it last, and who looks after it now?",
     "text": "Show the benefits against their baselines and check they are holding. Hand over to named owners with a plan to keep the gains, pass on open risks and issues, and capture what you learnt.",
     "tools": ["spc_tool", "a3_report"]},
]

# --------------------------------------------------------------------------
# The documents. `ref` is the CITI template's own letter; `feeds` lists the
# documents it takes information from. Each document's FOCUS code (F1, O1,
# C1...) comes from its stage and its place in ORDER below.
# --------------------------------------------------------------------------
DOCS = [
    {"id": "scope", "ref": "D", "stage": "find", "name": "High level scoping document", "kind": "slides",
     "template": "initiate-d-high-level-scope.potx", "fill": fill_slides.scope,
     "purpose": "One page that says what the project is, why it matters, what is in and out of scope, and who leads it.",
     "when": "First. Use it to get your sponsor (SRO) to agree the work is worth doing before you spend time on detail.",
     "owner": "Project lead, with the SRO",
     "covers": ["Elevator pitch", "Scope", "Benefits", "Delivery and resourcing", "Budget", "Stakeholders", "Governance", "Assumptions", "Risks and issues", "Constraints and dependencies"],
     "feeds": [],
     "tips": ["Keep each box to two or three lines: detail belongs in the PID or support plan.", "Put numbers in the benefits box (the baseline and what you expect), not just aims.", "List what is out of scope. It saves arguments later."]},
    {"id": "support", "ref": "E2", "stage": "find", "name": "Support plan", "kind": "slides",
     "template": "initiate-e2-support-plan.potx", "fill": fill_slides.support_plan,
     "purpose": "The agreement between CITI and a clinical group or service: the context, scope, deliverables, metrics, approach, governance, resources and next steps.",
     "when": "When you are asking CITI for improvement support. Agree it with the clinical group before the work starts.",
     "owner": "CITI programme director, with the clinical group lead",
     "covers": ["Context and request", "Scope, deliverables and metrics", "Improvement approach (Plan, Do, Study, Act)", "Principles", "Governance", "Risks and dependencies", "Return on investment and KPIs", "Resource plan", "Next steps"],
     "feeds": ["scope"],
     "tips": ["The scope, deliverables and metrics table feeds every highlight report, so word the deliverables as things you can tick off.", "Agree the clinical group's commitment (time, people, decisions) as clearly as CITI's."]},
    {"id": "pid", "ref": "E1", "stage": "create", "name": "Project initiation document (PID)", "kind": "doc",
     "template": "initiate-e1-project-initiation-document.dotx", "fill": fill_pid.pid,
     "purpose": "The full case for the project: case for change, SMART objectives, approach, resourcing, timescales, leadership, governance, risks, dependencies, stakeholders, return on investment and KPIs.",
     "when": "When you create the plan for a larger project, especially one that needs formal approval or a business case.",
     "owner": "Project or programme manager",
     "covers": ["Case for change", "Objectives", "Approach and resourcing", "Milestones", "Leadership and governance", "Risks, dependencies and stakeholders", "Return on investment", "KPIs and other benefits"],
     "feeds": ["scope", "benefits", "stakeholders", "plan", "resources"],
     "tips": ["Use facts and figures for the case for change: your baseline from a run chart is ideal.", "Write objectives as SMART: a measure, a target and a date."]},
    {"id": "resources", "ref": "J", "stage": "create", "name": "Resource planner and tracker", "kind": "sheet",
     "template": "initiate-j-resource-planner.xlsx", "fill": fill_sheets.resources,
     "purpose": "The days each person is planned to give the project each week, and the days they actually gave.",
     "when": "Plan it when you agree resources in the PID or support plan; fill in actual days every week or month.",
     "owner": "Project manager",
     "covers": ["Planned days by person and week", "Actual days worked", "Days remaining", "External resources"],
     "feeds": ["support", "plan"],
     "tips": ["Enter the start date and the weeks fill in by themselves.", "A gap between planned and actual days is an early warning: log it as a risk."]},
    {"id": "mobilisation", "ref": "", "stage": "create", "name": "Programme mobilisation document", "kind": "slides",
     "template": "mobilise-programme-mobilisation.potx", "fill": fill_slides.mobilisation,
     "purpose": "An intro manual for each team member and a team charter: what we want to achieve, how we work together and how we support each other.",
     "when": "At a workshop when the team first comes together, as you create the plan.",
     "owner": "Programme manager, with the team",
     "covers": ["Intro manual (one per person)", "Team charter: objectives and success", "Ways of working", "Supporting each other"],
     "feeds": ["support"],
     "tips": ["Fill it in together in the room rather than sending it round.", "Revisit the charter when new people join."]},
    {"id": "roles", "ref": "N", "stage": "create", "name": "Key programme roles", "kind": "slides",
     "template": "mobilise-n-key-programme-roles.potx", "fill": fill_slides.roles,
     "purpose": "Who fills each standard programme role (SRO, accountable executive, programme director and manager, leads, PMO, assurance) and what each is responsible for.",
     "when": "When you create the plan, alongside the organisation chart.",
     "owner": "Programme director",
     "covers": ["SRO", "Accountable executive", "Programme director and manager", "Clinical, operational and nursing leads", "PMO and assurance", "Improvement support", "Senior supplier"],
     "feeds": ["support"],
     "tips": ["Every role needs a name. A blank role is a risk.", "Use the comments to say how much time each person gives."]},
    {"id": "orgchart", "ref": "O", "stage": "create", "name": "Organisation chart", "kind": "slides",
     "template": "mobilise-o-organisation-chart.potx", "fill": fill_slides.org_chart,
     "purpose": "The programme's structure on a page: the executive team, the programme leadership, and the leads and improvement support for each workstream.",
     "when": "When you create the plan, once workstreams and leads are agreed.",
     "owner": "Programme manager",
     "covers": ["Programme executive team", "Programme leadership", "Core workstreams and their leads", "Enabling workstreams"],
     "feeds": ["roles"],
     "tips": ["The leads and teams named here go straight into each workstream's highlight report."]},
    {"id": "governance", "ref": "P", "stage": "create", "name": "Governance", "kind": "slides",
     "template": "mobilise-p-governance.potx", "fill": fill_slides.governance,
     "purpose": "How the programme is steered: a chart of the forums it reports to, and a table of each forum's purpose, responsibilities, inputs, outputs and attendees.",
     "when": "When you create the plan, before the first leadership meeting.",
     "owner": "Programme director, with the SRO",
     "covers": ["Governance chart", "Forum purpose and responsibilities", "Inputs (which report goes where)", "Outputs and attendees"],
     "feeds": ["roles", "orgchart"],
     "tips": ["Use meetings that already exist where you can.", "Say which report each forum gets: highlight reports to the huddle, the leadership report to the leadership meeting."]},
    {"id": "benefits", "ref": "K", "stage": "observe", "name": "Benefits register", "kind": "sheet",
     "template": "mobilise-k-benefits-register.xlsx", "fill": fill_sheets.benefits,
     "purpose": "Each benefit (and dis-benefit) with its measure, baseline, target, dates, data source and owners.",
     "when": "Set the baselines while you observe the current state, review it monthly, and use it again to show the benefit is sustained.",
     "owner": "Programme manager; each benefit has its own owner",
     "covers": ["Objective and beneficiary", "Benefit or dis-benefit", "Measure, baseline and target", "Data source and frequency", "Benefit manager and owner", "Cash releasing and £ value"],
     "feeds": ["scope", "support"],
     "tips": ["Set the baseline from data over time: a run chart or SPC chart shows whether the baseline is stable.", "Include a balancing measure as a dis-benefit, so you'd notice if the change caused harm."]},
    {"id": "plan", "ref": "B", "stage": "create", "name": "Project plan (detailed)", "kind": "sheet",
     "template": "plan-b-project-plan-detailed.xlsx", "fill": fill_sheets.plan,
     "purpose": "Every workstream broken into activities, sub-activities, milestones and meetings, with owners, dates, status, % complete and the critical path, drawn as a Gantt chart.",
     "when": "When you create the plan, before the changes start; update it every week.",
     "owner": "Project manager, with workstream leads",
     "covers": ["Workstreams, activities and milestones", "Responsible person", "Start and due dates", "Status and % complete", "Critical path", "Gantt chart by day"],
     "feeds": ["support", "orgchart"],
     "tips": ["Mark the critical path: these are the tasks that delay everything if they slip.", "The plan on a page and the leadership report are drawn from this."]},
    {"id": "stakeholders", "ref": "I", "stage": "observe", "name": "Stakeholder map and communication plan", "kind": "slides",
     "template": "plan-i-stakeholder-map-comms-plan.potx", "fill": fill_slides.stakeholders,
     "purpose": "Stakeholders placed by influence and interest (champions, supporters, blockers, sleepers), and a plan of how and how often you will communicate with each.",
     "when": "While you observe the current state, so you know who is affected; review it when a stakeholder's interest or influence changes.",
     "owner": "Programme manager, with the comms lead",
     "covers": ["Stakeholder map", "Key interests and issues", "Communication vehicle, frequency and format", "Content provided"],
     "feeds": ["scope", "support"],
     "tips": ["The 2x2 matrix tool has a stakeholder grid you can score with your team, then copy into this map."]},
    {"id": "onepage", "ref": "A", "stage": "create", "name": "Project plan on a page", "kind": "slides",
     "template": "implement-a-plan-on-a-page.potx", "fill": fill_slides.plan_on_a_page,
     "purpose": "A high level timeline of the programme by workstream, with its main activities, milestones and critical path, on one slide.",
     "when": "Once the detailed plan is agreed. Use it in leadership reports and when you brief people.",
     "owner": "Project manager",
     "covers": ["Workstreams by month", "Main activities", "Milestones", "Critical path"],
     "feeds": ["plan"],
     "tips": ["Show only what a senior reader needs: about 2 or 3 bars a workstream."]},
    {"id": "raid", "ref": "F", "stage": "undertake", "name": "RAID log", "kind": "sheet",
     "template": "implement-f-raid-log.xlsx", "fill": fill_sheets.raid,
     "purpose": "The programme's Risks, Assumptions, Issues and Dependencies, each with an owner, a score or RAG, actions and status.",
     "when": "Start it when you create the plan; review it at every weekly huddle.",
     "owner": "Programme manager; each item has an owner",
     "covers": ["Risks: likelihood x impact, before and after mitigation", "Issues: impact and actions to resolve", "Assumptions", "Dependencies: who delivers what, by when", "Escalation to the executive"],
     "feeds": ["scope", "support"],
     "tips": ["A risk might happen; an issue is happening now. When a risk happens, close it and open an issue.", "Highlight and leadership reports copy their risks and issues from here."]},
    {"id": "actions", "ref": "M", "stage": "undertake", "name": "Action and decision log", "kind": "sheet",
     "template": "implement-m-action-decision-log.xlsx", "fill": fill_sheets.actions,
     "purpose": "Actions agreed at meetings, with owners, due dates and status; and decisions made or needed, with who approved them and when.",
     "when": "At every programme meeting, from the first.",
     "owner": "PMO",
     "covers": ["Action log: owner, due and revised due dates, status", "Decisions log: decision needed, final decision, approved by, date"],
     "feeds": [],
     "tips": ["Log the decision and who made it at the time. It is hard to piece together later.", "Key decisions go into the highlight report."]},
    {"id": "highlight", "ref": "G", "stage": "undertake", "name": "Highlight report", "kind": "slides",
     "template": "implement-g-highlight-report.potx", "fill": fill_slides.highlight,
     "purpose": "One slide per workstream: its brief, leads, key achievements and metrics, deliverables with % done and RAG, decisions, escalations and risks.",
     "when": "Every week, for the programme weekly huddle.",
     "owner": "Each workstream lead",
     "covers": ["Brief, leads and teams", "Key achievements", "Key metrics: target and current", "Deliverables: % done, RAG, progress, next steps", "Decisions, escalations, risks and issues", "Win of the week"],
     "feeds": ["support", "orgchart", "actions", "raid", "benefits"],
     "tips": ["Use the RAG key: red is delayed and needs escalating, amber is at risk, green is on track, blue is complete.", "Show your metric as a run chart or SPC chart rather than a single number when you can."]},
    {"id": "leadership", "ref": "L", "stage": "undertake", "name": "Leadership report", "kind": "slides",
     "template": "implement-l-leadership-report.potx", "fill": fill_slides.leadership,
     "purpose": "One slide for the whole programme: key metrics, each workstream's deliverables with % done, due date and RAG, wins and the key risks and issues.",
     "when": "Every fortnight or month, for the programme leadership meeting.",
     "owner": "Programme manager",
     "covers": ["Key metrics and KPIs", "Workstream RAG and deliverables", "RAG justification and next steps", "Wins of the week", "Key risks and issues"],
     "feeds": ["plan", "onepage", "raid", "highlight", "benefits"],
     "tips": ["Explain every amber and red in the RAG justification, and say what you need from the leaders."]},
    {"id": "closure", "ref": "", "stage": "sustain", "name": "Programme closure report", "kind": "slides",
     "template": "close-programme-closure-report.potx", "fill": fill_slides.closure,
     "purpose": "Why the programme is closing, what it achieved, the benefits against their baselines, handover of outputs and open risks, stakeholder feedback, lessons learnt and a case study.",
     "when": "At the end of the programme, or when it is stopped.",
     "owner": "Programme manager, signed off by the SRO",
     "covers": ["Closure summary and sustainability plan", "Outputs, handover owners and next steps", "Benefits realisation", "Ongoing risks and issues", "Stakeholder feedback", "Lessons learnt", "Case study"],
     "feeds": ["benefits", "raid", "plan"],
     "tips": ["Show the benefits as SPC charts: a sustained shift is stronger evidence than a before-and-after.", "Every open risk and output needs a named handover owner."]},
]

# The order documents are numbered and shown in within each stage
ORDER = [
    "scope", "support",                                          # Find
    "benefits", "stakeholders",                                  # Observe
    "mobilisation", "roles", "orgchart", "governance",           # Create
    "plan", "onepage", "resources", "pid",
    "raid", "actions", "highlight", "leadership",                # Undertake
    "closure",                                                   # Sustain
]
DOCS.sort(key=lambda d: ORDER.index(d["id"]))
for _stage in STAGES:
    for _n, _doc in enumerate((d for d in DOCS if d["stage"] == _stage["id"]), 1):
        _doc["code"] = f'{_stage["letter"]}{_n}'

# --------------------------------------------------------------------------
# Decision tree. A question has options; each option leads to another
# question (`next`) or to a recommendation (`result`).
# --------------------------------------------------------------------------
TREE = {
    "root": "start",
    "questions": {
        "start": {"q": "What do you need to do?", "hint": "Pick the closest. You can go back at any point.", "options": [
            {"a": "Find out what to do next on my project or programme", "sub": "Answer a few questions about where your work is", "next": "agreed"},
            {"a": "Record something", "sub": "A risk, issue, assumption, dependency, action or decision", "next": "record"},
            {"a": "Report progress", "sub": "To a weekly huddle, a leadership meeting or at the end", "next": "report"},
            {"a": "Plan something", "sub": "Tasks and dates, people's time, stakeholders or benefits", "next": "plan"},
            {"a": "Set up the team", "sub": "Ways of working, roles or governance", "next": "team"},
        ]},
        "agreed": {"q": "Has a sponsor (SRO) agreed the opportunity and its scope?", "options": [
            {"a": "No, it's still an idea or a problem", "next": "size"},
            {"a": "Yes", "next": "observed"},
        ]},
        "size": {"q": "How big is the work?", "options": [
            {"a": "A project within my own team or service", "sub": "You can do it with the people and money you have", "result": "scope_small"},
            {"a": "A larger project or programme", "sub": "It crosses teams, needs funding, approval or CITI support", "next": "citi"},
        ]},
        "citi": {"q": "Are you asking CITI for improvement support?", "options": [
            {"a": "Yes", "result": "support"},
            {"a": "No, but it needs formal approval or a business case", "result": "pid"},
        ]},
        "observed": {"q": "Do you understand the current state, with a baseline for each benefit you want?", "hint": "For example, a process map, the main causes of the problem and a run chart of where you are now.", "options": [
            {"a": "No, not yet", "result": "observe"},
            {"a": "Yes", "next": "teamready"},
        ]},
        "teamready": {"q": "Is the team set up, with roles, workstream leads and meetings agreed?", "options": [
            {"a": "No, not yet", "result": "mobilise"},
            {"a": "Yes", "next": "planned"},
        ]},
        "planned": {"q": "Do you have a plan with activities, owners and dates?", "options": [
            {"a": "No, not yet", "result": "plan"},
            {"a": "Yes", "next": "live"},
        ]},
        "live": {"q": "Where is the work now?", "options": [
            {"a": "Under way: we are testing and spreading changes", "result": "implement"},
            {"a": "Finishing, stopping or being handed over", "result": "close"},
        ]},
        "record": {"q": "What do you need to record?", "options": [
            {"a": "Something that might happen and affect the work", "sub": "A risk", "result": "risk"},
            {"a": "A problem that is happening now", "sub": "An issue", "result": "issue"},
            {"a": "Something we are taking to be true", "sub": "An assumption", "result": "assumption"},
            {"a": "Something we need from someone else before we can move on", "sub": "A dependency", "result": "dependency"},
            {"a": "A task someone has agreed to do", "sub": "An action", "result": "action"},
            {"a": "A decision made, or one that needs making", "sub": "A decision", "result": "decision"},
        ]},
        "report": {"q": "Who is the report for?", "options": [
            {"a": "The weekly programme huddle", "sub": "One workstream's progress", "result": "highlight"},
            {"a": "The leadership meeting or senior leaders", "sub": "The whole programme", "result": "leadership"},
            {"a": "Anyone who wants the timeline on one page", "result": "onepage"},
            {"a": "Everyone, at the end of the work", "result": "close"},
        ]},
        "plan": {"q": "What do you need to plan?", "options": [
            {"a": "Tasks, owners and dates", "result": "plan"},
            {"a": "People's time", "result": "resources"},
            {"a": "Who to involve and how to keep them informed", "result": "stakeholders"},
            {"a": "The benefits and how we will measure them", "result": "benefits"},
        ]},
        "team": {"q": "What do you need to set up?", "options": [
            {"a": "How we will work together as a team", "result": "charter"},
            {"a": "Who does what", "result": "roles"},
            {"a": "Meetings, reporting and escalation", "result": "governance"},
        ]},
    },
    "results": {
        "scope_small": {"stage": "find", "title": "Write a high level scoping document", "docs": ["scope"],
                        "text": "Agree the problem, scope and benefits on one page with your sponsor. For a project in your own service this may be all the paperwork you need: then observe the current state, run your tests of change with Plan, Do, Study, Act cycles and keep an action log.",
                        "next": "Next, observe the current state: map the process and set a baseline with a run chart."},
        "support": {"stage": "find", "title": "Scope the opportunity and agree a support plan with CITI", "docs": ["scope", "support"],
                    "text": "Start with the one-page scope. Then agree a support plan with CITI setting out the scope, deliverables, metrics, approach and resources.",
                    "next": "When the support plan is approved, observe the current state."},
        "pid": {"stage": "find", "title": "Scope the opportunity, then write a PID", "docs": ["scope", "pid"],
                "text": "Start with the one-page scope and get your sponsor to agree it. Larger work that needs formal approval or a business case then needs a project initiation document, with the case for change, SMART objectives, resources, milestones, governance and return on investment. You'll finish it as you create the plan.",
                "next": "Once the scope is agreed, observe the current state so the PID's case for change has a baseline."},
        "observe": {"stage": "observe", "title": "Observe the current state and set baselines", "docs": ["benefits", "stakeholders"],
                    "text": "Map the process as it really works and find the causes of the problem with the charting tools below. Record each benefit with its measure, baseline, target and owner in the benefits register, including a balancing measure, and plot each baseline over time to check it is stable. Map who is affected and who has a say.",
                    "next": "Next, create the plan."},
        "mobilise": {"stage": "create", "title": "Set up the team", "docs": ["mobilisation", "roles", "orgchart", "governance"],
                     "text": "Hold a workshop to write the team charter and intro manuals. Agree who fills each programme role, draw the organisation chart, and agree the governance: which meetings steer the work and what each one receives.",
                     "next": "Then plan the activities, owners and dates."},
        "benefits": {"stage": "observe", "title": "Agree the benefits and their baselines", "docs": ["benefits"],
                     "text": "List each benefit with its measure, baseline, target, data source and owner in the benefits register. Include a balancing measure so you would notice harm. Plot the baseline over time to check it is stable before you change anything.",
                     "next": "Then create the plan."},
        "plan": {"stage": "create", "title": "Create the plan", "docs": ["plan", "onepage", "resources", "pid"],
                 "text": "Break each workstream into activities with owners and dates in the detailed plan, and mark the critical path. Summarise it on the plan on a page and plan each person's time. For larger work, bring it together in a project initiation document.",
                 "next": "Then undertake the change, with a RAID log and regular reports."},
        "implement": {"stage": "undertake", "title": "Undertake the change: deliver, track and report", "docs": ["raid", "actions", "highlight", "leadership"],
                      "text": "Review the RAID log and the action and decision log at every huddle. Each workstream writes a weekly highlight report; the programme manager pulls them together into the leadership report for the leadership meeting.",
                      "next": "Keep the plan and benefits register up to date. When the work is ending, sustain the benefit."},
        "close": {"stage": "sustain", "title": "Sustain the benefit and close the programme", "docs": ["closure", "benefits", "raid"],
                  "text": "Write the closure report: what was achieved, the benefits against their baselines, the sustainability plan, who owns each output and open risk from now on, stakeholder feedback and lessons learnt. Update the benefits register and the RAID log first, as the report draws on both.",
                  "next": "Keep plotting the measures on SPC charts for the following months to check the benefit is sustained, and share the case study."},
        "risk": {"stage": "undertake", "title": "Log a risk in the RAID log", "docs": ["raid"], "sheet": "Risks",
                 "text": "A risk is something that might happen and would affect the work. Score its likelihood and impact from 1 to 5 (exposure is the two multiplied), add mitigating actions and score it again, give it an owner, and say whether it needs escalating.",
                 "next": "If the risk happens, close it and open an issue."},
        "issue": {"stage": "undertake", "title": "Log an issue in the RAID log", "docs": ["raid"], "sheet": "Issues",
                  "text": "An issue is a problem happening now that needs action. Score its impact from 1 to 5, record the actions to resolve it and the owner, and escalate it if the programme can't resolve it.",
                  "next": "Red issues go into the highlight and leadership reports."},
        "assumption": {"stage": "undertake", "title": "Log an assumption in the RAID log", "docs": ["raid"], "sheet": "Assumptions",
                       "text": "An assumption is something your plans rely on that might not be true. Record what would happen if it turned out to be wrong, and who will check it.",
                       "next": "Check assumptions at each review. One that proves wrong becomes an issue."},
        "dependency": {"stage": "undertake", "title": "Log a dependency in the RAID log", "docs": ["raid"], "sheet": "Dependencies",
                       "text": "A dependency is something another team or project must deliver before you can move on. Record who depends on it, who delivers it, by when, and its RAG status.",
                       "next": "Agree the date with the team that delivers it, and review it at each huddle."},
        "action": {"stage": "undertake", "title": "Add it to the action log", "docs": ["actions"], "sheet": "Action log",
                   "text": "Record the action, where it was raised, who owns it and when it is due. If the date moves, fill in the revised due date rather than overwriting the original.",
                   "next": "Review open actions at the start of each meeting."},
        "decision": {"stage": "undertake", "title": "Add it to the decisions log", "docs": ["actions"], "sheet": "Decisions log",
                     "text": "Record the decision needed, when it is needed by and its priority. When it is made, record the final decision, who approved it (a person or a forum) and the date.",
                     "next": "Key decisions go into the highlight report."},
        "highlight": {"stage": "undertake", "title": "Write a highlight report", "docs": ["highlight"],
                      "text": "One slide per workstream each week. It draws on the support plan (brief, metrics and deliverables), the organisation chart (leads), the action and decision log, and the RAID log.",
                      "next": "Highlight reports feed the leadership report."},
        "leadership": {"stage": "undertake", "title": "Write a leadership report", "docs": ["leadership", "onepage"],
                       "text": "One slide for the whole programme. Take the deliverables from the detailed plan, the RAG and progress from the highlight reports, the metrics from the benefits register and the key risks and issues from the RAID log. Add the plan on a page if the leaders want to see the timeline.",
                       "next": "Explain every red and amber, and say what you need from the leaders."},
        "onepage": {"stage": "create", "title": "Draw the plan on a page", "docs": ["onepage", "plan"],
                    "text": "Summarise the detailed plan as a timeline by workstream, with the main activities, milestones and critical path.",
                    "next": "Update it when the detailed plan changes a milestone."},
        "resources": {"stage": "create", "title": "Plan people's time", "docs": ["resources"],
                      "text": "Enter each person, their role and the days you plan they will give each week. Fill in the actual days as you go to see the burn rate and days remaining.",
                      "next": "Agree the planned days in the support plan or PID."},
        "stakeholders": {"stage": "observe", "title": "Map your stakeholders and plan communications", "docs": ["stakeholders"],
                         "text": "Place each stakeholder by their influence and interest, then plan how, how often and in what format you will communicate with each.",
                         "next": "Champions need to be involved in decisions; blockers need to be kept satisfied."},
        "charter": {"stage": "create", "title": "Write a team charter", "docs": ["mobilisation"],
                    "text": "Use the mobilisation document at a workshop: each person fills in an intro manual, and the team agrees its objectives, what success looks like, and how it will work together and support each other.",
                    "next": "Then agree roles and governance."},
        "roles": {"stage": "create", "title": "Agree roles and draw the organisation chart", "docs": ["roles", "orgchart"],
                  "text": "Name who fills each programme role and what they are responsible for, and draw the programme structure with the leads for each workstream.",
                  "next": "The organisation chart gives the leads in each highlight report."},
        "governance": {"stage": "create", "title": "Agree the governance", "docs": ["governance"],
                       "text": "Draw how the programme fits into the Trust's meetings, and agree the purpose, responsibilities, inputs, outputs and attendees of each programme forum.",
                       "next": "Set the dates of the meetings and the reports each one needs."},
    },
}

TOOL_NAMES = {
    "process_map": "Process map", "fishbone_diagram": "Fishbone diagram", "pareto_chart": "Pareto chart",
    "run_chart": "Run chart", "spc_tool": "SPC chart", "driver_diagram": "Driver diagram",
    "matrix_2x2": "2x2 matrix", "a3_report": "A3 report",
}


# --------------------------------------------------------------------------
def example_name(doc):
    base, ext = os.path.splitext(doc["template"])
    ext = {".potx": ".pptx", ".dotx": ".docx"}.get(ext, ext)
    return base + "-example" + ext


def previews(paths, width):
    """Render each file to JPEGs in PREVIEWS; returns {path: [file names]}."""
    soffice = os.environ.get("SOFFICE", "soffice").split()
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(soffice + ["--headless", "--convert-to", "pdf", "--outdir", tmp] + paths,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for p in paths:
            stem = os.path.splitext(os.path.basename(p))[0]
            pdf = os.path.join(tmp, stem + ".pdf")
            prefix = os.path.join(tmp, "pg")
            for f in glob.glob(prefix + "*"):
                os.remove(f)
            subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", "quality=82", "-scale-to-x", str(width), "-scale-to-y", "-1", pdf, prefix], check=True)
            pages = sorted(glob.glob(prefix + "*.jpg"), key=lambda f: int(f.rsplit("-", 1)[1][:-4]))
            names = []
            for i, f in enumerate(pages, 1):
                name = stem.replace("-example", "") + f"-{i}.jpg"
                shutil.move(f, os.path.join(PREVIEWS, name))
                names.append(name)
            out[p] = names
    return out


def main():
    make_previews = "--no-previews" not in sys.argv
    os.makedirs(EXAMPLES, exist_ok=True)
    os.makedirs(PREVIEWS, exist_ok=True)
    old = {}
    data_path = os.path.join(ROOT, "_data", "programme_guide.json")
    if os.path.exists(data_path):
        old = {d["id"]: d for d in json.load(open(data_path, encoding="utf-8"))["docs"]}
    docs = []
    to_render = []
    for doc in DOCS:
        src = os.path.join(TPL, doc["template"])
        dst = os.path.join(EXAMPLES, example_name(doc))
        tables = doc["fill"](src, dst)
        d = {k: v for k, v in doc.items() if k != "fill"}
        d["example"] = example_name(doc)
        if tables:
            d["tables"] = tables
        elif doc["kind"] in ("slides", "doc"):
            to_render.append(dst)
            d["pages"] = old.get(doc["id"], {}).get("pages", [])
        docs.append(d)
        print("wrote", os.path.relpath(dst, ROOT))
    if make_previews and to_render:
        for f in glob.glob(os.path.join(PREVIEWS, "*.jpg")):
            os.remove(f)
        slides = [p for p in to_render if p.endswith(".pptx")]
        words = [p for p in to_render if p.endswith(".docx")]
        pages = {}
        if slides:
            pages.update(previews(slides, 1400))
        if words:
            pages.update(previews(words, 1000))
        for d in docs:
            p = os.path.join(EXAMPLES, d["example"])
            if p in pages:
                d["pages"] = pages[p]
                print("previews", d["id"], len(pages[p]))
    data = {
        "example": {"name": X.NAME, "group": X.GROUP, "aim": X.AIM, "pitch": X.PITCH,
                    "start": X.long_date(X.START), "end": X.long_date(X.END)},
        "stages": STAGES,
        "docs": docs,
        "tree": TREE,
        "tool_names": TOOL_NAMES,
    }
    # check every link in the tree goes somewhere
    ids = {d["id"] for d in docs}
    for q in TREE["questions"].values():
        for o in q["options"]:
            assert ("next" in o and o["next"] in TREE["questions"]) or ("result" in o and o["result"] in TREE["results"]), o
    for r in TREE["results"].values():
        assert all(x in ids for x in r["docs"]), r
    for d in docs:
        assert all(x in ids for x in d["feeds"]), d["id"]
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", os.path.relpath(data_path, ROOT))


if __name__ == "__main__":
    main()

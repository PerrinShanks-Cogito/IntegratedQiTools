# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""
The worked example used to fill in every programme template: one made-up
programme followed from its first scoping page to its closure report, so each
document can be read alongside the ones that feed it.

All names, figures and dates are made up for learning. Any resemblance to a
real person is a coincidence.
"""
from datetime import date

NAME = "Discharge Flow Programme"
SHORT = "Discharge Flow"
GROUP = "Medicine Clinical Group"
DIRECTORATE = "Acute and General Medicine"
START = date(2026, 1, 12)
END = date(2026, 9, 30)

AIM = ("Increase discharges before midday on our 8 medical wards from 16% to 33%, "
       "and reduce average length of stay by 0.5 days, by 30 September 2026")
PITCH = ("Patients on our medical wards wait most of the day to go home: only 16% leave before midday, "
         "so A&E patients wait for beds into the evening. We will redesign the discharge day with ward teams, "
         "pharmacy and transport so patients who are ready go home in the morning.")

# People (all made up)
P = {
    "sro": ("Dr Amara Okafor", "Chief of Medicine"),
    "ae": ("Tom Reid", "Director of Operations, Medicine"),
    "pd": ("Priya Nair", "Head of Transformation, CITI"),
    "pm": ("James Holloway", "Senior Improvement Manager, CITI"),
    "clin": ("Dr Sofia Marquez", "Consultant Physician"),
    "ops": ("Grace Mensah", "General Manager, Acute Medicine"),
    "nurse": ("Daniel Cho", "Head of Nursing, Medicine"),
    "pharm": ("Leila Haddad", "Lead Pharmacist, Medicine"),
    "flow": ("Kwame Asante", "Patient Flow Manager"),
    "tocl": ("Fiona Gallagher", "Discharge Team Lead"),
    "sw": ("Martin Doyle", "Hospital Social Work Manager, local authority"),
    "pmo": ("Ruth Adeyemi", "PMO Officer, CITI"),
    "im1": ("Ben Carter", "Improvement Manager, CITI"),
    "im2": ("Hannah Lee", "Improvement Manager, CITI"),
    "im3": ("Chloe Evans", "Project Manager, CITI"),
    "im4": ("Sam Patel", "Improvement Manager, CITI"),
    "analyst": ("Omar Siddiqui", "Senior Analyst, CITI"),
    "assure": ("Kate Burrows", "Programme Assurance Lead"),
    "comms": ("Nadia Rahman", "Communications Manager"),
    "supplier": ("Mark Ellis", "Contract Manager, patient transport provider"),
    "matron": ("Joy Adebayo", "Matron, Acute Medicine"),
    "wm": ("Lucy Fenwick", "Ward Manager, Ward 6"),
    "tech": ("Arjun Mehta", "Pharmacy Technician Lead"),
    "pt": ("Ellie Brooks", "Lead Physiotherapist, Medicine"),
}


def who(key, title=True):
    n, t = P[key]
    return f"{n}, {t}" if title else n


# Workstreams: four core, two enabling. (id, name, short name, ops lead, clinical lead, nursing lead, CITI support)
WS = [
    ("br", "Board rounds and criteria-led discharge", "Board rounds & CLD", "Grace Mensah", "Dr Sofia Marquez", "Joy Adebayo", "Ben Carter"),
    ("tto", "Medicines to take out (TTOs)", "TTOs & pharmacy", "Arjun Mehta", "Leila Haddad", "Lucy Fenwick", "Hannah Lee"),
    ("tr", "Transport and discharge lounge", "Transport & lounge", "Kwame Asante", "Dr Sofia Marquez", "Joy Adebayo", "Chloe Evans"),
    ("cx", "Complex discharges", "Complex discharges", "Fiona Gallagher", "Ellie Brooks", "Daniel Cho", "Sam Patel"),
]
ENABLING = [
    ("data", "Data and measurement", "Omar Siddiqui", "James Holloway"),
    ("pmo", "PMO, comms and engagement", "Nadia Rahman", "Ruth Adeyemi"),
]

# Measures: name, baseline, target, at the May reports, at closure
KPI = [
    ("Discharges before midday (8 wards)", "16%", "33%", "24%", "31%"),
    ("Average length of stay (days)", "7.4", "6.9", "7.1", "6.9"),
    ("TTO ready time, prescribed to ready (hours)", "4.2", "2.0", "2.6", "2.1"),
    ("Eligible discharges through the lounge", "12%", "40%", "31%", "38%"),
    ("Expected discharge date set within 24 hours", "41%", "90%", "78%", "88%"),
    ("Readmissions within 30 days (balancing)", "13.8%", "No rise", "13.6%", "13.5%"),
]

REPORT_DATE = date(2026, 5, 13)
LEAD_DATE = date(2026, 5, 14)


def long_date(d):
    return d.strftime("%-d %B %Y")


def short_date(d):
    return d.strftime("%d/%m/%Y")

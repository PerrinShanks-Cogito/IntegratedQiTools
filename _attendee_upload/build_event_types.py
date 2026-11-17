#!/usr/bin/env python3
# © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.
"""Build attendee_upload/event_types.json from the ImpCommEventType export.

Run from the repository root:  python3 _attendee_upload/build_event_types.py

Reads _attendee_upload/ImpCommEventType.csv (columns ID, TypeName,
LengthHours, Medium, EventTypeNotes, as exported from the database) and
_attendee_upload/overrides.json, and writes attendee_upload/event_types.json,
which the attendee upload formatter page looks course names up in.

Each event type matches these course names (Sheet 1 column L):
  - its TypeName
  - its EventTypeNotes, when that starts with "CITI" (the course's name in
    the CITI export), unless overrides.json says useNotes: false
  - any extraCourses in overrides.json
Spaces are tidied (single spaces, no leading or trailing ones) in TypeName and
course names. The deploy workflow runs this before building the site, so
replacing the CSV is enough to update the tool. It stops with an error, and
the site isn't deployed, if the CSV is missing a column or two event types
claim the same course name.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSV_PATH = os.path.join(HERE, "ImpCommEventType.csv")
OVERRIDES_PATH = os.path.join(HERE, "overrides.json")
OUT_PATH = os.path.join(ROOT, "attendee_upload", "event_types.json")
NEEDED = ["ID", "TypeName", "LengthHours", "Medium", "EventTypeNotes"]


def tidy(s):
    return " ".join(str(s or "").split())


def number(s, what):
    s = tidy(s)
    try:
        v = float(s)
    except ValueError:
        sys.exit("Event type %s: %r isn't a number." % (what, s))
    return int(v) if v.is_integer() else v


def main():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        heads = {tidy(h).lower(): h for h in (reader.fieldnames or [])}
        missing = [c for c in NEEDED if c.lower() not in heads]
        if missing:
            sys.exit("ImpCommEventType.csv is missing the column(s): " + ", ".join(missing))
        rows = [{c: r.get(heads[c.lower()]) for c in NEEDED} for r in reader]
    with open(OVERRIDES_PATH, encoding="utf-8") as f:
        overrides = {k: v for k, v in json.load(f).items() if k != "about"}

    out, owner, problems = [], {}, []
    for r in rows:
        if not tidy(r["ID"]) and not tidy(r["TypeName"]):
            continue  # blank line
        tid = number(r["ID"], "ID")
        o = overrides.get(str(tid), {})
        type_name = tidy(o.get("typeName", r["TypeName"]))
        if not type_name:
            problems.append("ID %s has no TypeName." % tid)
            continue
        notes = tidy(r["EventTypeNotes"])
        courses = [type_name]
        if o.get("useNotes", True) and notes.upper().startswith("CITI"):
            courses.append(notes)
        courses += [tidy(c) for c in o.get("extraCourses", [])]
        entry = {"eventTypeId": tid, "typeName": type_name, "medium": tidy(r["Medium"]),
                 "lengthHours": number(r["LengthHours"], "ID %s LengthHours" % tid)}
        seen = set()
        for c in courses:
            k = c.lower()
            if not c or k in seen:
                continue
            seen.add(k)
            if k in owner and owner[k] != tid:
                problems.append("The course name %r belongs to both ID %s and ID %s. Fix the CSV, or add "
                                "useNotes/typeName in overrides.json." % (c, owner[k], tid))
                continue
            owner[k] = tid
            out.append(dict(course=c, **entry))
    for tid in overrides:
        if not any(str(e["eventTypeId"]) == tid for e in out):
            print("Note: overrides.json has ID %s, which isn't in the CSV." % tid)
    if problems:
        sys.exit("\n".join(problems))

    about = ("Built from _attendee_upload/ImpCommEventType.csv by _attendee_upload/build_event_types.py. "
             "Don't edit this file: replace the CSV (or change overrides.json) and run the script.")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write('{\n  "about": ' + json.dumps(about) + ',\n  "eventTypes": [\n' +
                ",\n".join("    " + json.dumps(e, ensure_ascii=False) for e in out) + "\n  ]\n}\n")
    print("Wrote %d course names for %d event types to attendee_upload/event_types.json."
          % (len(out), len({e["eventTypeId"] for e in out})))


if __name__ == "__main__":
    main()

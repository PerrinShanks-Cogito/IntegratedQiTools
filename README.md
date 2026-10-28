# FOCUS – Integrated QI tools

A Jekyll site that brings the FOCUS QI charting tools together in one app,
with a landing page and a shared header. Every tool runs entirely in the
browser; nothing a user pastes is uploaded.

Tools (copied from [ImprovementTools](https://github.com/PerrinShanks-Cogito/ImprovementTools), apart from the
fishbone diagram, which was built here following the IHI QI Essentials Toolkit
instructions for a cause and effect diagram, and the demand and capacity model,
which was built here from the NHS Improvement and NHS England demand and
capacity core model (version 4.2) and its user guidance, and the admin demand
and capacity model, which was built here from the same core model and the
QSIR guide *Demand and capacity – a comprehensive guide*, measuring demand,
capacity and backlog in staff time by role, and the multiple
regression tool, tree plot (treemap), box and whisker plot, ANOVA,
chi-squared test and Weibull reliability analysis, which were all built here, and the design of experiments, attribute agreement analysis and Gauge R&R tools, which were built here from the DOE, Attribute Agreement Analysis and Gauge R&R sheets of the AAS Data Analysis Toolkit, and the power and sample size tool, which was built here from the Power and Sample Size section of the AAS Advanced Analysis Toolkit, and the 2x2 matrix (ease and impact, stakeholder analysis and other 2x2 grids), which was built here, and the A3 report, which was built here from the CITI A3 report template, and the hypothesis test selector, which was built here from the [hypothesis test selection road map](https://perrinshanks.com/hypothesis-test-selection-road-map/) and runs the chosen test on pasted data, and the qualitative survey analysis tool, which was built here from the Making Data Count step 9 session on qualitative data, and the funnel plot, which was
built here from the NHS Improvement funnel plot tool (version 2.0), and the T
chart for rare events, which was built here from NHS England's T chart rare
events SPC tool (version 2.0), and the P chart, which was built here from NHS
Improvement's SPC P chart tool (version 3.0)):

| Tool | Path |
| --- | --- |
| Process map | `/process_map/` |
| Driver diagram | `/driver_diagram/` |
| Fishbone (cause and effect) diagram | `/fishbone_diagram/` |
| Qualitative survey analysis (word cloud, coding and findings) | `/qualitative_analysis/` |
| Pareto chart | `/pareto_chart/` |
| 2x2 matrix (ease and impact, stakeholders and more) | `/matrix_2x2/` |
| Tree plot (treemap) | `/tree_plot/` |
| Bar chart | `/bar_chart/` |
| Run chart | `/run_chart/` |
| SPC chart (XmR, P, U, C and T charts) | `/spc_tool/` (`/p_chart/` and `/t_chart/` redirect to `/spc_tool/?type=p` and `?type=t`) |
| Histogram | `/histogram/` |
| Box and whisker plot | `/box_plot/` |
| ANOVA (one-way analysis of variance) | `/anova/` |
| Chi-squared test | `/chi_squared/` |
| Funnel plot | `/funnel_plot/` |
| Scatter plot | `/scatter_plot/` |
| Multiple regression | `/multiple_regression/` |
| Weibull reliability analysis (hidden) | `/weibull_reliability/` |
| Gauge R&R (measurement system analysis) | `/gauge_rr/` |
| Attribute agreement analysis | `/attribute_agreement/` |
| Design of experiments (2-level factorial) | `/design_of_experiments/` |
| Hypothesis test selector | `/hypothesis_test_selector/` |
| Power and sample size (hidden) | `/power_sample_size/` |
| Demand and capacity model (hidden) | `/demand_capacity/` |
| Admin demand and capacity model (hidden) | `/admin_demand_capacity/` |
| A3 report | `/a3_report/` |
| Programme guide (which programme document next, with worked examples) (hidden) | `/programme_guide/` |

## How it fits together

- `_data/tools.yml` – the list of tools: name, status, group and the short
  description on the landing page. The landing page and the "QI charting
  tools" menu are both built from this file, so add or rename tools here.
  `hidden: true` takes a tool off both (and asks search engines not to
  index it) while its page keeps working for anyone with the link; a group
  whose tools are all hidden disappears. The demand and capacity model and
  the admin demand and capacity model (the Plan capacity group) are hidden.
- `_data/upcoming_tools.yml` – tools in development or ideation, shown in the
  menu without a link.
- `_includes/focus-header.html` – the shared header: **FOCUS** plus the tool
  name on the left of the blue top bar, and on its right the "Get support"
  and "Case studies" menus and a link to the feedback form. Below it, the
  dark blue bar starts with the "All QI tools" menu and, on tool pages, holds
  the tool's buttons on the right. Its styles
  (`assets/css/focus-header.css`) are all prefixed `.fh` so they don't clash
  with each tool's own CSS.
- `assets/css/focus-tool.css` – the shared base every tool links just before
  its own `<style>`: the colour tokens (light and dark), the page reset, the
  full-width page gutter (`--gutter`, matching the header), buttons, print
  and reduced motion. A tool only keeps the styles that are its own, and
  anything it sets wins over the shared file. Standard tools (data panel on
  the left, results on the right) add `class="ft-standard"` to `<body>` to
  share the layout, panel, form and table styles too; diagram tools use the
  `.btn` classes. Text on a coloured fill uses `var(--on-accent)`, which
  turns dark in dark mode so it stays readable.
- `assets/js/focus-actions.js` – the shared toolbar for every tool, docked at
  the right of the dark blue header bar. On tool pages the header scrolls
  away until that bar reaches the top of the screen, then the bar stays
  there, so the buttons are always to hand (`--fh-stick-h` holds the bar's
  height for anything else that sticks below it). The toolbar: **Example** (fill in example data), **Open** (reopen a saved project
  file), **Save** (download a project
  `.json`) and **Export** (a menu of PNG, SVG, CSV and copy options, using the
  same labels in every tool). Tools with a **Data sheet** (a blank `.xlsx` to
  collect data in) can also import it once it's filled in: Data sheet becomes
  a menu with Download blank data sheet and Import filled data sheet, and Open
  also takes the `.xlsx`. The workbook is read in the browser
  (`FocusActions.readXlsx`), with dates and percentages as Excel shows them,
  and each tool's `template.import` says which sheet fills which box (or runs
  its own import, as the SPC chart and qualitative analysis tools do). Each
  tool calls `FocusActions.mount()` with its
  own export functions; chart tools save and reopen everything in their data
  and settings panel. Styles are in `assets/css/focus-actions.css`, prefixed
  `.fa`.
- `assets/js/focus-chart-full.js` – a **Full screen** button above every chart
  on a tool page. It opens a copy of the chart filling the screen, with zoom
  (buttons, Ctrl + scroll, or + - 0) and drag to move. The buttons are added
  again whenever a chart redraws, so tools need no changes for it. The
  process map, driver and fishbone diagrams and the A3 report have their own
  full screen, with editing. It also shows hover details for any part of a
  chart with a `data-tip` attribute (lines separated by newlines, the first
  as the heading), on the page and in full screen; the scatter plot's points
  use it. Styles are in `assets/css/focus-tool.css`, prefixed `.fcv` and
  `.fct`.
- `assets/js/focus-explain.js` – the **Need further help to understand the
  analysis?** link under every tool's analysis. It builds a prompt for
  Microsoft 365 Copilot Chat from the analysis on the page, removes anything
  that looks like personal identifying information (names with a title,
  emails, phone, NHS and hospital numbers, postcodes, dates of birth, links),
  shows it for the person to check and edit, then copies it, downloads the
  tool's PNG and opens Copilot Chat to paste and attach them. Copilot Chat
  can't be pre-filled from a link. `FocusActions.mount()` sets it up for every
  tool; a tool can pass `explain` to point it at its own analysis (the
  diagram tools and qualitative analysis do; qualitative sends themes and
  findings only, never comments, and the theme map rather than the word cloud).
- **Add to A3 report** – `focus-actions.js` adds this to the Export menu of
  every tool with an SVG export (a tool can opt out with `a3: false`). It runs
  the tool's own SVG export, catches the file in `FocusActions.saveFile()`
  instead of saving it, and keeps it with the tool's project document in
  IndexedDB (`FocusActions.clips`), so nothing leaves the browser. Adding the
  same chart again (same tool, export and title, where the title is one the
  person gave it or the chart comes from the same page load) updates it
  rather than adding a copy. The A3 report marks charts already on the
  report and offers to remove those, and charts over 3 months old that
  aren't on it; nothing is removed without asking.
- `a3_report/index.html` – the A3 report, with the sections, questions and
  guidance of the CITI A3 report template. It places charts from the other
  tools and the user's own PNG or JPG pictures, and shares the space between
  sections: when there is too much to fit it shrinks the charts first, then
  the body text down to 9pt, and then says which column to shorten. One
  layout feeds the preview, the SVG, PNG and print exports and the editable
  A3 PowerPoint, which it writes in the browser (`FocusActions.zip`). Charts
  and pictures are copied into the project file, and the report in progress is
  kept in IndexedDB so going to another tool to add a chart loses nothing.
- `_config.yml` – site settings and the header links (`links:`).
- `<tool>/index.html` – each tool's original single-file page. The only
  changes from ImprovementTools are front matter (`tool_id`), the shared
  header in place of the tool's own, removal of the old per-tool menu script,
  links to other tools pointing inside this app rather than Netlify, and the
  shared Open / Save / Export toolbar in place of each tool's own export buttons.
- `spc_tool/index.html` – one SPC chart page for several chart types (XmR, P,
  U, C and T), picked on the page or with `?type=xmr`, `p`, `u`, `c` or `t`. Each type has its
  own parsing and limits; the special cause rules, drawing, plain-English reading
  and exports are shared. Project files saved from the old P chart and T chart tools
  still open.
- `staticwebapp.config.json` – Azure Static Web Apps routing (custom 404,
  trailing slashes, security headers). The Content Security Policy lets pages
  load only the site's own files, Google Fonts and the Application Insights
  script, and send data only to the site and Application Insights, so nothing
  a user pastes can be sent anywhere else. Inline scripts and styles are
  allowed because every tool is a single page with its own inline script.
  WebAssembly is allowed (`'wasm-unsafe-eval'`, which doesn't allow `eval`)
  because the Trust's Imprivata single sign-on extension runs WebAssembly in
  the page and fails without it. If
  a tool needs a new outside script, font, image or API, add its origin to
  the matching directive, or the browser will block it.

## Programme guide

`/programme_guide/` is a decision tree that guides people through the five
FOCUS stages (Find the opportunity, Observe the current state, Create the
plan, Undertake the change, Sustain the benefit) to the CITI programme
template they need next, from the high level scoping document to
the RAID log, highlight and leadership reports and the closure report. Each
document has a filled-in worked example (a made-up "Discharge Flow
Programme", followed from scoping to closure) to view in the page or
download, and the blank template. It sits in the Share your work group but
is hidden from the landing page and menu for now; the page works for anyone
with the link.

- `programme_guide/templates/` – the blank CITI templates (version October
  2022), renamed `<stage>-<letter>-<name>` (the stage in the file name is
  the template's own; the guide places each one in a FOCUS stage). Pictures over 1600px were
  shrunk to keep the files small, and the hidden archive sheet (real names
  from an earlier programme) was removed from the action and decision log.
- `_programme_guide/build.py` – the single source for the guide: the FOCUS stages,
  the document catalogue (purpose, when, owner, what each draws on, tips) and
  the decision tree. `example.py` holds the worked example's people, aim and
  measures; `fill_slides.py`, `fill_sheets.py` and `fill_pid.py` fill each
  template in, keeping its formatting (`officekit.py` edits the files).
  Run `python3 _programme_guide/build.py` from the repository root (needs
  python-pptx, python-docx, lxml, LibreOffice and pdftoppm; set `SOFFICE` if
  LibreOffice isn't `soffice`). It writes `programme_guide/examples/`,
  slide and page pictures in `programme_guide/previews/`, and
  `_data/programme_guide.json`, which the page reads (spreadsheet examples
  are shown as tables from it). Commit what it writes.
- Documents are numbered by FOCUS stage (F1, F2, O1, O2, C1 to C8, U1 to U4,
  S1) from their stage and their place in `ORDER` in `build.py`; each one's
  CITI template letter (`ref`) is shown on its page.
- `?doc=raid` opens a document and `?stage=plan` a stage, for linking from
  elsewhere.

## Case studies

The **Case studies** menu and `/case_studies/` show worked examples that link
several tools together, drawn from the GSTT Flow Manual, NHS England's Making
Data Count step 7 (triangulating data) and The Health Care Data Guide (Provost
and Murray; scenarios and figures are our own). Each step opens a tool with
made-up sample data already filled in.

- `_case_studies/build.py` – the single source for the case studies: the
  narrative for every step and the generator for its sample data. Edit it, then
  run `python3 _case_studies/build.py` from the repository root. It writes
  `_data/case_studies.json`, a project file per step in `case_studies/data/`
  and a page stub per case in `case_studies/<case>/`. Commit what it writes.
- `_layouts/case_study.html` – the case study page; `case_studies/index.html`
  – the list. Styles are in `assets/css/site.css` (prefixed `.cs`).
- One-click samples: a link such as
  `/spc_tool/?sample=/case_studies/data/late-discharges-4.json` makes the
  shared toolbar open that project file when the page loads, with a "Sample
  data" note and a link back to the case study. Only files under
  `/case_studies/data/` are opened. Tools with their own project files (process
  map, fishbone and driver diagrams) pass `load` to `FocusActions.mount()`.

## Run locally

```sh
bundle install
bundle exec jekyll serve
```

Then open <http://localhost:4000>.

## Statistics tests

`tests/stats/` checks the statistical functions in every tool against
reference answers from SciPy and NumPy: distributions and p-values, critical
values, quantiles, ranks, descriptive statistics, the Anderson-Darling test,
one-way and Welch's ANOVA, the one-sample t-test, chi-squared and Fisher's
exact tests, correlation, least squares regression and power.

The statistics several tools need are in one shared file,
`assets/js/focus-stats.js`, which every tool page loads:
- the gamma and beta functions, and the t, F, chi-squared and normal p-values,
  cumulative probabilities and critical values;
- sum, mean, variance, standard deviation, median, quantiles and ranks;
- the Anderson-Darling normality test and one-way ANOVA;
- the reader for pasted data, which every tool that reads a table uses: it
  chooses the delimiter (tab, semicolon or comma) the same way, keeps quoted
  cells whole as a spreadsheet writes them to CSV, reads a column of Excel
  numbers like 1,234 as one column and a single line of numbers as a list,
  and reads numbers by one rule (thousands separators only in groups of
  three, brackets for negatives). Each tool only says what a line with no
  delimiter means, such as a label then a value.

A tool takes what it uses with `const { tP, fP } = FocusStats;`. The shared
file is tested once, and each tool's results are tested through it. Other
calculations are still written in each tool, and every copy is checked.

It also checks the SPC chart (XmR, P, U, C and T charts, including Laney's P'
and U', breaks, a fixed baseline, screened moving ranges and every signal
rule), the run chart (median, shifts, trends, runs and astronomical points)
and the funnel plot (limits and each row's status). There's no standard
library for these, so `reference_spc.py` is a separate Python version written
from the published rules: NHS England's Making Data Count, the IHI run chart
rules and the funnel plot method on its page. The data goes in as pasted text
through each tool's own reader, so reading the numbers is tested too. Cases
on each rule's boundary (6 points against 7 for a shift, a repeated value in a
trend) are checked in Python before they're written.

Every test in the hypothesis test selector is run as the page runs it, on
pasted data: the t-tests, sign test, F test, ANOVA (one-way and two-way),
Bartlett's, Levene's, Mann-Whitney, Kruskal-Wallis, Mood's median, the
proportion tests, chi-squared, the transformations and simple, multiple and
logistic regression. The page's number formatting is swapped for one that
keeps every digit, so the results are compared in full against SciPy and
statsmodels. The ANOVA tool's spread test, pairwise comparisons and Holm
adjustment, and the multiple regression tool's coefficients, p-values,
intervals, R², Durbin-Watson, residuals, Cook's distance and VIF, are checked
against SciPy and statsmodels too.

Gauge R&R (the ANOVA method, with the interaction pooled when it isn't
clear, and the X-bar and R method), attribute agreement (agreement with
Clopper-Pearson intervals, Fleiss' kappa, Kendall's W and tau) and design of
experiments (the fit, the equation in real units, fitted means and backward
elimination) are checked against statsmodels and SciPy. The d2* constants
are checked against d2 and d3 worked out by numerical integration.

The box plot's quartiles, whiskers and outliers are checked against
matplotlib, the histogram's bins and counts against NumPy (including its
automatic width rule), and the Pareto chart's order, percentages and vital
few against a Python version, with values on the fences, bin edges and
cut-offs.

Weibull analysis (the maximum likelihood fit with and without censored
items, probability plot points, R², the automatic threshold, and the
survival, density, hazard and percentile functions) is checked against
SciPy, and the power tool's proportion tests, sample sizes and smallest
detectable differences against statsmodels and SciPy.

111 tests, about 1,100 comparisons.

```sh
node --test tests/stats/stats.test.js
```

The deploy workflow runs them first and stops if any fail. Each test reports
its worst error; most functions agree with SciPy to 10 or more significant
figures.

- `extract.js` takes each function out of the tool's page exactly as
  published, with the other top-level functions it calls and the shared
  distributions it takes from `FocusStats`, and runs it away from the page.
  The tests check the code the site runs, not a copy.
- `make_reference.py` holds the inputs (made-up data from fixed random seeds)
  and works out the expected answers. It writes `reference.json`, which is
  committed, so the tests need only Node. To add or change a test, edit it and
  run `pip install numpy scipy statsmodels pandas matplotlib && python3 tests/stats/make_reference.py`.
- Tolerances are tight (about 1 part in 10⁸) except where a tool uses a known
  approximation, which the test notes: the power of a t-test, which uses
  a normal approximation to the noncentral t distribution and is within 0.01
  of the exact power; the Box-Cox λ, searched in steps of 0.01; and Gauge
  R&R's X-bar and R constants, tabled to 3 to 5 decimal places as AIAG does.
- A known difference waiting on a decision can be marked `todo`: it runs
  and reports but doesn't stop a deploy. There are none at the moment.
- The run chart's table of the expected number of runs is checked row by row
  against Table 1 of Perla, Provost and Murray (2011), the Provost and Murray
  table adapted from Swed and Eisenhart.

Not covered yet: the demand and capacity models, and most tools' date and
number readers.

## Deploy to Azure Static Web Apps

1. In the Azure portal, create a **Static Web App**. For deployment source
   choose **Other** (so Azure doesn't add its own workflow), or choose GitHub
   and then delete the workflow file it commits in favour of the one here.
2. Copy the app's **deployment token** (Static Web App → Overview → Manage
   deployment token).
3. In this GitHub repository add it as an Actions secret named
   `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. Push to `main`. `.github/workflows/azure-static-web-apps.yml` builds the
   site with Jekyll and uploads `_site`. Pull requests to `main` get their own
   preview environment, removed when the pull request closes.

If you host the site under a sub-path rather than at the root of a domain,
set `baseurl` in `_config.yml` (for example `baseurl: "/qi"`). All internal
links use `relative_url`, so they follow it.

## Copyright

© Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved.

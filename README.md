# FOCUS – Integrated QI tools

A Jekyll site that brings the FOCUS QI charting tools together in one app,
with a landing page and a shared header. Every tool runs entirely in the
browser; nothing a user pastes is uploaded.

Tools (copied from [ImprovementTools](https://github.com/PerrinShanks-Cogito/ImprovementTools), apart from the
fishbone diagram, which was built here following the IHI QI Essentials Toolkit
instructions for a cause and effect diagram, and the demand and capacity model,
which was built here from the NHS Improvement and NHS England demand and
capacity core model (version 4.2) and its user guidance, and the multiple
regression tool, tree plot (treemap), box and whisker plot, ANOVA,
chi-squared test and Weibull reliability analysis, which were all built here, and the design of experiments, attribute agreement analysis and Gauge R&R tools, which were built here from the DOE, Attribute Agreement Analysis and Gauge R&R sheets of the AAS Data Analysis Toolkit, and the power and sample size tool, which was built here from the Power and Sample Size section of the AAS Advanced Analysis Toolkit, and the 2x2 matrix (ease and impact, stakeholder analysis and other 2x2 grids), which was built here, and the hypothesis test selector, which was built here from the [hypothesis test selection road map](https://perrinshanks.com/hypothesis-test-selection-road-map/), and the funnel plot, which was
built here from the NHS Improvement funnel plot tool (version 2.0), and the T
chart for rare events, which was built here from NHS England's T chart rare
events SPC tool (version 2.0), and the P chart, which was built here from NHS
Improvement's SPC P chart tool (version 3.0)):

| Tool | Path |
| --- | --- |
| Process map | `/process_map/` |
| Driver diagram | `/driver_diagram/` |
| Fishbone (cause and effect) diagram | `/fishbone_diagram/` |
| Pareto chart | `/pareto_chart/` |
| 2x2 matrix (ease and impact, stakeholders and more) | `/matrix_2x2/` |
| Tree plot (treemap) | `/tree_plot/` |
| Bar chart | `/bar_chart/` |
| Run chart | `/run_chart/` |
| SPC chart (XmR) | `/spc_tool/` |
| P chart | `/p_chart/` |
| T chart (rare events) | `/t_chart/` |
| Histogram | `/histogram/` |
| Box and whisker plot | `/box_plot/` |
| ANOVA (one-way analysis of variance) | `/anova/` |
| Chi-squared test | `/chi_squared/` |
| Funnel plot | `/funnel_plot/` |
| Scatter plot | `/scatter_plot/` |
| Multiple regression | `/multiple_regression/` |
| Weibull reliability analysis | `/weibull_reliability/` |
| Gauge R&R (measurement system analysis) | `/gauge_rr/` |
| Attribute agreement analysis | `/attribute_agreement/` |
| Design of experiments (2-level factorial) | `/design_of_experiments/` |
| Hypothesis test selector | `/hypothesis_test_selector/` |
| Power and sample size | `/power_sample_size/` |
| Demand and capacity model | `/demand_capacity/` |

## How it fits together

- `_data/tools.yml` – the list of tools: name, status, group and the short
  description on the landing page. The landing page and the "QI charting
  tools" menu are both built from this file, so add or rename tools here.
- `_data/upcoming_tools.yml` – tools in development or ideation, shown in the
  menu without a link.
- `_includes/focus-header.html` – the shared header: **FOCUS** plus the tool
  name, links to the CITI Academy, the feedback form and the QI Coach
  chatbot, and the "Get support" and "QI charting tools" menus. Its styles
  (`assets/css/focus-header.css`) are all prefixed `.fh` so they don't clash
  with each tool's own CSS.
- `assets/js/focus-actions.js` – the shared toolbar at the top right of every
  tool: **Example** (fill in example data), **Open** (reopen a saved project
  file), **Save** (download a project
  `.json`) and **Export** (a menu of PNG, SVG, CSV and copy options, using the
  same labels in every tool). Each tool calls `FocusActions.mount()` with its
  own export functions; chart tools save and reopen everything in their data
  and settings panel. Styles are in `assets/css/focus-actions.css`, prefixed
  `.fa`.
- `_config.yml` – site settings and the header links (`links:`).
- `<tool>/index.html` – each tool's original single-file page. The only
  changes from ImprovementTools are front matter (`tool_id`), the shared
  header in place of the tool's own, removal of the old per-tool menu script,
  links to other tools pointing inside this app rather than Netlify, and the
  shared Open / Save / Export toolbar in place of each tool's own export buttons.
- `staticwebapp.config.json` – Azure Static Web Apps routing (custom 404,
  trailing slashes, security headers).

## Run locally

```sh
bundle install
bundle exec jekyll serve
```

Then open <http://localhost:4000>.

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

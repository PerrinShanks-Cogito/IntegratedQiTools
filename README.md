# FOCUS – Integrated QI tools

A Jekyll site that brings the FOCUS QI charting tools together in one app,
with a landing page and a shared header. Every tool runs entirely in the
browser; nothing a user pastes is uploaded.

Tools (copied from [ImprovementTools](https://github.com/PerrinShanks-Cogito/ImprovementTools)):

| Tool | Path |
| --- | --- |
| Process map | `/process_map/` |
| Driver diagram | `/driver_diagram/` |
| Pareto chart | `/pareto_chart/` |
| Bar chart | `/bar_chart/` |
| Run chart | `/run_chart/` |
| SPC chart | `/spc_tool/` |
| Histogram | `/histogram/` |
| Scatter plot | `/scatter_plot/` |

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
- `_config.yml` – site settings and the header links (`links:`).
- `<tool>/index.html` – each tool's original single-file page. The only
  changes from ImprovementTools are front matter (`tool_id`), the shared
  header in place of the tool's own, removal of the old per-tool menu script,
  and links to other tools pointing inside this app rather than Netlify.
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

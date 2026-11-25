# Shared Responsibility for Splunk (proof of concept)

A Splunk app generated from this repository's control matrix. It makes the 1,191 atomic controls and the explorer's reference data searchable in SPL. It adds a Splunk UI Toolkit (React) explorer page, Dashboard Studio dashboards, and control evidence produced by scheduled searches.

## Build and install

```sh
python3 splunk/build.py --package     # needs Python 3.9+, Node.js 22+ and npm
```

This builds the React page (running `npm ci` the first time), regenerates `splunk/shared_responsibility/` and writes `splunk/dist/shared_responsibility-0.2.0.tgz`. Use `--skip-ui` to reuse the last React build. To install the package in Splunk, go to **Apps › Manage Apps › Install app from file**, then **restart Splunk**: Splunk Web only discovers a new app's page templates at startup. `build.py` and `splunk/react/src` are the sources of truth, so edit them rather than the generated files.

After installing:

1. Edit the `srm_monitored_indexes` macro (**Settings › Advanced search › Search macros**) so it names the indexes that hold your security data. The default is `index=*`.
2. Run any evidence check straight away, for example `| savedsearch "SRM Evidence - LOG-004"`. Otherwise they run on their schedule: hourly, and daily for LOG-010.

## What is in the app

| Part | Contents |
| --- | --- |
| **Lookups** (17) | `srm_controls` (one row per control, with RASCI, owner, test and standards references), `srm_rasci` (control × party), `srm_layer_shares` (layer × service model split), `srm_sections` and `srm_section_roles`, `srm_functions`, `srm_pillars`, `srm_lifecycle_*`, `srm_scenario*`, `srm_layer_domains`, `srm_service_models`, `srm_evidence_checks`. Each has a lookup definition named `<file>_lookup`. Multivalue fields are pipe-delimited. |
| **KV Store** | `srm_evidence`, an append-only history of evidence results (`control_id`, `check`, `status`, `evidence`, `metric`, `checked_at`), read with `| inputlookup srm_evidence_lookup`. |
| **Explorer page** (React, the app's default view) | Built with Splunk UI Toolkit (`@splunk/react-ui`, `@splunk/react-page`, `@splunk/search-job`). Lookups and the latest evidence load through live searches. **Allocation:** a layer × service-model matrix with a details panel. **Controls:** a sortable, filterable table with expandable rows. **Evidence:** each check with a **Run now** button (or **Run all checks**) that runs its saved search and refreshes the results. **Graph & Cypher:** the combined property graph rebuilt from the lookups, with expandable domains and the read-only Cypher console showing graph and table results. |
| **Dashboards** (Dashboard Studio) | Overview, Responsibility Allocation (party → layer Sankey by service model), Control Catalogue, On-premises Cross-cut, Platform Lifecycle, Failure Scenarios, Control Evidence. |
| **Evidence searches** (7) | `SRM Evidence - <control>` scheduled searches. They evidence logging controls from data every Splunk instance holds, and write results through the `srm_record_evidence` macro. |
| **Standalone explorer** | The original single-file explorer (every diagram view) under `appserver/static/explorer`, linked from the app navigation as *Standalone explorer*. |

### Evidence checks

| Control | Check | Method |
| --- | --- | --- |
| LOG-004 Deliver logs to the SIEM | Monitored indexes are receiving events | `tstats` event counts in the last 24 h |
| COL-016 Monitor end-to-end collection latency | p95 latency ≤ 300 s | p95 of `_indextime - _time` over the last hour |
| COL-006 Preserve the source event time | < 1% implausible timestamps | Events indexed before their event time, or more than a day after it |
| LOG-010 Retain searchable security event logs | Retention ≥ 365 days | `frozenTimePeriodInSecs` of enabled non-system indexes |
| LOG-012 Protect logs from unauthorised access | Access attempts are audited | Login attempts in `_audit` over 7 days |
| LOG-013 Protect logs from modification and deletion | No user can delete events | Users holding the `can_delete` role |
| LOG-009 Monitor customer security activity | Alerts are scheduled | Enabled scheduled searches with alert actions or tracking |

Each result is `pass`, `fail` or `no_evidence`. To add a check, add an entry to `EVIDENCE_CHECKS` in `build.py`. Its search must produce `status`, `evidence` and `metric`.

## React page source

`splunk/react/` holds the page source:

- `src/App.jsx` and `src/components/*`: the tabs.
- `src/data.js`: lookup loading through `SearchJob` (five searches at a time), plus running evidence checks.
- `src/graph.js`: rebuilds the combined graph from the lookups.
- `scripts/extract.js`: copies the Cypher engine, example queries and graph layout out of `index.html` at build time, so the page and the standalone explorer share one implementation.

`npm run build` writes `dist/explorer.js`. `node test/parity.mjs <graph.json>` checks the graph rebuilt from the lookups against a dump of the standalone explorer's graph. It currently matches all 1,325 nodes and 5,877 relationships, including properties, so Cypher queries return the same results in both places.

## Verification

Version 0.2.0 was tested on Splunk Enterprise 9.4 (the `splunk/splunk:9.4` container), driving the React page in a browser:

- **Loading:** all lookups load in about 2 seconds.
- **Allocation:** selecting a layer filters the control table (Security operations → 146 controls), and rows expand.
- **Evidence:** **Run all checks** ran the seven saved searches from the page and refreshed their results.
- **Graph & Cypher:** a domain expands to its controls (134 → 179 nodes). Example and typed queries return graph and table results, and syntax errors show the line and column.
- **Page errors:** none.
- **Dashboards:** all 29 dashboard queries and all 7 evidence searches also run without error.

**Splunk AppInspect 4.4.0** found 0 failures and 0 errors in both the default checks and the `cloud` tag. There are four warnings:

- **KV Store:** the app uses a KV Store collection. This is informational.
- **SplunkJS telemetry:** a notice that comes from Splunk's own `@splunk/react-page` library.
- **Legacy header view:** a deprecated `splunkjs/mvc/headerview` reference, also from Splunk's own `@splunk/react-page` library.
- **Custom page template:** *custom Mako templates are deprecated in Splunk Enterprise 10.4*. The page template is how Splunk UI Toolkit pages are mounted today. It contains no Python code blocks, but the page will need re-hosting when Splunk provides the replacement mechanism.

## Limits of the proof of concept

- **React page coverage:** the React page covers allocation, controls, evidence and the graph. The on-premises, lifecycle and failure-scenario diagrams are available as Dashboard Studio dashboards and in the standalone explorer, but not yet as React components.
- **Page template:** the page depends on a custom page template, which Splunk has deprecated from Enterprise 10.4 (see Verification).
- **Evidence:** the seven checks cover logging controls that Splunk can evidence about itself. Most of the other 1,184 controls need searches written against your own data, or a manual-attestation workflow.
- **Editing:** RASCI assignments are read-only. Changes are made in `matrix.json` and the app is rebuilt.

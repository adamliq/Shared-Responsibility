# Shared Responsibility for Splunk (proof of concept)

A Splunk app generated from this repository's control matrix. It makes the 1,191 atomic controls and the explorer's reference data searchable in SPL. It adds a Splunk UI Toolkit (React) explorer page, Dashboard Studio dashboards, and control evidence produced by scheduled searches.

## Build and install

```sh
python3 splunk/build.py --package     # needs Python 3.9+, Node.js 22+ and npm
```

This builds the React page (running `npm ci` the first time), regenerates `splunk/shared_responsibility/` and writes `splunk/dist/shared_responsibility-0.4.0.tgz`. Use `--skip-ui` to reuse the last React build. To install the package in Splunk, go to **Apps › Manage Apps › Install app from file**, then **restart Splunk**: Splunk Web only discovers a new app's page templates at startup. The demo dataset comes from the repository's `matrix.json` and `reference.json`, so the app and the standalone explorer always agree. `build.py` and `splunk/react/src` are the sources of truth, so edit them rather than the generated files.

After installing:

1. Edit the `srm_monitored_indexes` macro (**Settings › Advanced search › Search macros**) so it names the indexes that hold your security data. The default is `index=*`.
2. Run any evidence check straight away, for example `| savedsearch "SRM Evidence - LOG-004"`. Otherwise they run on their schedule: hourly, and daily for LOG-010.

## Your own information and the demo dataset

The app's data lives in **KV Store collections**. Every dashboard, search and the Explorer page read them through lookup definitions (`srm_controls_lookup`, `srm_rasci_lookup` and so on).

**The demo dataset** is the published 1,191-control baseline. It ships as read-only CSV lookups (`srm_demo_*.csv`) and can be reloaded at any time.

**First launch:** an administrator opening the app sees Splunk's *app configuration* notice. From there, the setup screen offers three starting points: the demo dataset, an organisation profile applied to the demo catalogue, or your own control catalogue.

**Managing the data:** the Explorer page's **Data** tab shows what's loaded (demo or your own, when and by whom) and lets you:

- **Reload the demo dataset.** This replaces everything with the baseline, after a confirmation. From the command line, `| savedsearch "SRM - Load demo dataset"` does the same.
- **Import an organisation profile:** a JSON profile or a tailoring workbook (CSV), in the same formats as the standalone explorer (see [`docs/organisation-profile.md`](../docs/organisation-profile.md)). It adds named parties and providers, systems, control applicability with justifications, RASCI changes, owners, contract references, evidence links, custom controls, allocation shares and failure scenarios. A preview shows the counts, errors and warnings before anything is written.
- **Import your own control catalogue** (`matrix.json` format), optionally with your own reference data (`reference.json` format). Any organisation profile is re-applied to it.
- **Export** the tailoring workbook, a Statement of Applicability, the profile, a tailoring report, the catalogue and the reference data.
- **Remove the organisation profile.**

**Editing controls:** each expanded row on the **Controls** tab has **Edit this control**. You can change applicability and justification, owner assignment, RASCI, owner, contract reference, evidence links and notes. Edits are stored as organisation-profile overrides (differences from the baseline), so they appear in the tailoring report and survive a new baseline.

**How the data is built and stored:**

- **Builder:** the browser builds the collections with the same rules as `build.py`; `test/dataset-parity.mjs` checks that they produce identical demo data.
- **Profile rules:** applied with the standalone explorer's own code, extracted from `index.html` at build time.
- **Sources:** the imported catalogue, reference data and profile are kept in the `srm_dataset` collection, so they can be exported and re-applied.
- **Speed:** a full write takes about 5 seconds.

**Permissions:** changes apply to everyone using the app. Writing needs write access to the app's KV Store collections, which by default means the `admin` or `sc_admin` role. Other users see a clear refusal and the data is left unchanged. Control evidence results are kept separately and aren't affected by reloads or imports.

## What is in the app

| Part | Contents |
| --- | --- |
| **Dataset** (18 KV Store collections) | `srm_controls` (one row per control, with RASCI, owner, test, standards references and your applicability, justification, owner, evidence and notes), `srm_rasci` (control × party, with your party names), `srm_parties`, `srm_systems`, `srm_layer_shares` (layer × service model split), `srm_service_models` (with your providers), `srm_sections` and `srm_section_roles`, `srm_functions`, `srm_pillars`, `srm_lifecycle_*`, `srm_scenario*` and `srm_layer_domains`. Each is read through a lookup definition named `<collection>_lookup`. Multivalue fields are pipe-delimited. |
| **Demo dataset** (18 CSV lookups) | `srm_demo_*.csv`, with definitions named `srm_demo_*_lookup`. Generated by `build.py`. |
| **Other KV Store collections** | `srm_dataset`, the dataset's status and its imported sources. `srm_evidence`, an append-only history of evidence results (`control_id`, `check`, `status`, `evidence`, `metric`, `checked_at`), read with `| inputlookup srm_evidence_lookup`. |
| **Explorer page** (React, the app's default view) | Built with Splunk UI Toolkit (`@splunk/react-ui`, `@splunk/react-page`, `@splunk/search-job`). Lookups and the latest evidence load through live searches. **Allocation:** a layer × service-model matrix with a details panel. **Controls:** a sortable, filterable table with expandable rows. **Evidence:** each check with a **Run now** button (or **Run all checks**) that runs its saved search and refreshes the results. **Graph & Cypher:** the combined property graph rebuilt from the lookups, with expandable domains and the read-only Cypher console showing graph and table results. |
| **Dashboards** (Dashboard Studio) | Overview, Responsibility Allocation (party → layer Sankey by service model), Control Catalogue, On-premises Cross-cut, Platform Lifecycle, Failure Scenarios, Control Evidence. |
| **Evidence searches** (7) | `SRM Evidence - <control>` scheduled searches. They evidence logging controls from data every Splunk instance holds, and write results through the `srm_record_evidence` macro. |
| **Standalone explorer** | The single-file explorer (every diagram view) under `appserver/static/explorer`, with its `reference.json` and the example organisation profile. It's linked from the app navigation as *Standalone explorer*. Its **Organisation profile** feature works inside Splunk; profiles are kept in each user's browser, as on the website. |

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

Version 0.4.0 was tested on a fresh Splunk Enterprise 9.4 container (`splunk/splunk:9.4`), driving the React page in a browser and checking KV Store from the Splunk CLI. These checks were added in 0.4.0:

- **First launch:** Splunk shows its *app configuration* notice, which leads to the setup screen. Loading the demo dataset writes 1,191 controls and marks the app configured.
- **Example profile:** importing it gives 1,192 controls (3 out of scope, 1 custom), 3 systems, named parties and an allocation override in KV Store.
- **Editing a control:** the edit is stored, and the Statement of Applicability and profile exports reflect it. Cypher finds the profile's systems.
- **Own catalogue:** importing a 40-control catalogue gives 41 controls, including the profile's custom control, and the sources are recorded.
- **Reloading the demo:** restores 1,191 controls with no profile. `SRM - Load demo dataset` does the same from the CLI.
- **Non-admin user:** sees a clear refusal, and the data is left unchanged.
- **Parity:** `test/dataset-parity.mjs` shows the browser builder reproduces all 18 demo collections exactly. `test/profile-parity.mjs` shows that, with the example profile applied, the graph built from the written dataset matches the standalone explorer's (1,330 nodes, 5,899 relationships).

The earlier checks still pass. The React page:

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

- **Standalone explorer:** the bundled standalone explorer still shows the demo dataset. Its own Organisation profile feature works per browser. The Explorer page and dashboards show the app's dataset.
- **No approval workflow:** edits and imports take effect straight away for everyone; there's no review or approval step.
- **React page coverage:** the React page covers allocation, controls, evidence and the graph. The on-premises, lifecycle and failure-scenario diagrams are available as Dashboard Studio dashboards and in the standalone explorer, but not yet as React components.
- **Page template:** the page depends on a custom page template, which Splunk has deprecated from Enterprise 10.4 (see Verification).
- **Evidence:** the seven checks cover logging controls that Splunk can evidence about itself. Most of the other 1,184 controls need searches written against your own data, or a manual-attestation workflow.
- **Editing:** RASCI assignments are read-only. Changes are made in `matrix.json` and the app is rebuilt.

## Screenshots

[`screenshots/`](screenshots/) holds screenshots on Splunk Enterprise 9.4. Screenshots 01–15 are from version 0.3.0; 16–19 show 0.4.0's setup screen, import preview, own information and control editor:

- **React explorer page (01–05):** allocation, controls, evidence, graph and Cypher.
- **Dashboard Studio dashboards (06–12).**
- **Bundled standalone explorer (13–15):** with the example organisation profile applied.

Sample events were loaded into the test instance so that the evidence checks have results.


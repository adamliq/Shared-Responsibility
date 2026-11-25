# Shared Responsibility for Splunk (proof of concept)

A Splunk app generated from this repository's control matrix. It makes the 1,191 atomic controls and the explorer's reference data searchable in SPL. It adds Dashboard Studio dashboards, and it shows control evidence produced by scheduled searches.

## Build and install

```sh
python3 splunk/build.py --package     # needs Python 3.9+ and Node.js
```

This regenerates `splunk/shared_responsibility/` and writes `splunk/dist/shared_responsibility-0.1.0.tgz`. To install the package in Splunk, go to **Apps › Manage Apps › Install app from file**. `build.py` is the source of truth, so edit it rather than the generated files.

After installing:

1. Edit the `srm_monitored_indexes` macro (**Settings › Advanced search › Search macros**) so it names the indexes that hold your security data. The default is `index=*`.
2. Run any evidence check straight away, for example `| savedsearch "SRM Evidence - LOG-004"`. Otherwise they run on their schedule: hourly, and daily for LOG-010.

## What is in the app

| Part | Contents |
| --- | --- |
| **Lookups** (17) | `srm_controls` (one row per control, with RASCI, owner, test and standards references), `srm_rasci` (control × party), `srm_layer_shares` (layer × service model split), `srm_sections` and `srm_section_roles`, `srm_functions`, `srm_pillars`, `srm_lifecycle_*`, `srm_scenario*`, `srm_layer_domains`, `srm_service_models`, `srm_evidence_checks`. Each has a lookup definition named `<file>_lookup`. Multivalue fields are pipe-delimited. |
| **KV Store** | `srm_evidence`, an append-only history of evidence results (`control_id`, `check`, `status`, `evidence`, `metric`, `checked_at`), read with `| inputlookup srm_evidence_lookup`. |
| **Dashboards** (Dashboard Studio) | Overview, Responsibility Allocation (party → layer Sankey by service model), Control Catalogue, On-premises Cross-cut, Platform Lifecycle, Failure Scenarios, Control Evidence. |
| **Evidence searches** (7) | `SRM Evidence - <control>` scheduled searches. They evidence logging controls from data every Splunk instance holds, and write results through the `srm_record_evidence` macro. |
| **Explorer** | The full standalone explorer (all diagrams, the property graphs and the Cypher console) under `appserver/static/explorer`, linked from the app navigation. |

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

## Verification

The package was tested on Splunk Enterprise 9.4 (the `splunk/splunk:9.4` container):

- Every dashboard query (29) ran without error.
- Every evidence search ran and wrote to the KV Store.
- All seven dashboards rendered without visualisation errors.
- The explorer, including the Cypher console, loaded inside Splunk Web.

**Splunk AppInspect 4.4.0** found 0 failures and 0 errors in both the default checks and the `cloud` tag. The one warning is informational: the app uses a KV Store collection.

## Limits of the proof of concept

- **Explorer:** it reads its own bundled `matrix.json`, not the lookups. It also opens outside the Splunk chrome. A production version would rebuild it as a Splunk UI Toolkit (React) page that reads the lookups.
- **Evidence:** the seven checks cover logging controls that Splunk can evidence about itself. Most of the other 1,184 controls need searches written against your own data, or a manual-attestation workflow.
- **Editing:** RASCI assignments are read-only. Changes are made in `matrix.json` and the app is rebuilt.

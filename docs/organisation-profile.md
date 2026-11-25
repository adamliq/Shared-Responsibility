# Organisation profiles

An organisation profile adds your own information to the published baseline. The baseline is the 1,191 controls in `matrix.json` plus the reference data in `reference.json`. The profile is an **overlay** that holds only your information and your differences from the baseline, so:

- the baseline can be upgraded without losing your tailoring;
- every change is listed in a **tailoring report**;
- a **Statement of Applicability** can be exported at any time.

Open **Organisation profile** at the top right of the explorer to import, review, export or remove a profile. **Try the example profile** loads [`examples/profile-example.json`](../examples/profile-example.json), a fictional organisation that uses every feature.

> **In the Splunk app**, profiles and workbooks in these formats are imported on the Explorer page's **Data** tab. There they're stored in the app's KV Store and shared by everyone using the app, rather than kept in one browser. See [`splunk/README.md`](../splunk/README.md).

> **Privacy.** A profile is stored only in your browser (`localStorage`); nothing is uploaded. To keep a copy or share it, export it. Do not commit organisation profiles to this repository: GitHub Pages publishes the whole repository, so anything committed becomes public.

## What a profile can contain

| Section | Effect in the explorer |
| --- | --- |
| `organisation` | Name and description shown in the header and on exports. |
| `parties` | Real names for the four RASCI parties (`csc`, `customer_soc`, `csp`, `third_party`). They're used in filters, the RASCI table, control details, diagrams, the combined graph and Cypher. |
| `providers` | The provider behind each service model, for example `"SaaS": "…"`. Shown in the allocation panel and on `ServiceModel` graph nodes. |
| `systems` | Your systems, each with its service model, provider, criticality and owner. They appear as `System` nodes linked `USES_MODEL` to their service model in the combined graph and Cypher. |
| `controls` | Per-control overrides, keyed by control ID: `applicable` (with `justification`), `rasci` (only the parties that change), `owner_assignment`, `owner`, `contract_ref` (fills the baseline's `MSA §__` placeholder), `evidence` (`[{title, url, reviewed}]`) and `notes`. |
| `custom_controls` | Controls of your own, with the same fields as baseline controls. They need `control_id`, `domain` and `control_objective`, and must not reuse a baseline ID. |
| `allocation` | Replaces a layer's split for a service model: `{"operations": {"SaaS": {"customer": 10, "soc": 70, "provider": 20}}}`. The three values must sum to 100. |
| `failure_scenarios` | Adds scenarios, or replaces one with the same `id`, using the same structure as `failure_scenarios` in `reference.json`. `involved` lists 8 values per section, one per responsibility function. |

In the catalogue, tailored, out-of-scope and custom controls are marked. The **Applicability** filter shows only one group (*In scope*, *Out of scope*, *Tailored by profile* or *Custom controls*). In Cypher, controls have `applicable`, `justification`, `owner`, `tailored`, `custom`, `evidence` and `notes` properties. For example:

```cypher
MATCH (c:Control) WHERE c.applicable = false RETURN c.control_id, c.justification
```

## Working in a spreadsheet: the tailoring workbook

**Export › Tailoring workbook (CSV)** lists every control with its current values. Edit it in Excel or any spreadsheet, then import it.

| Column | Notes |
| --- | --- |
| `control_id` | Required. A baseline ID tailors that control. A new ID with `control_objective` and `domain` adds a custom control. |
| `applicable` | `Yes` or `No` (blank means `Yes`). |
| `justification` | Expected whenever `applicable` is `No`. |
| `owner_assignment` | One of `CSP`, `CSC`, `SH-S`, `SH-D`, `INH`, `3PTY`, `GAP`, `N/A`. |
| `owner` | A named person or team. |
| `rasci_csp`, `rasci_csc`, `rasci_customer_soc`, `rasci_third_party` | One of `R`, `A`, `R/A`, `S`, `C`, `I`, `—` (or `-`), `N/A`. |
| `contract_reference` | Your contract clause, replacing the baseline placeholder. |
| `evidence_url`, `evidence_reviewed` | Separate several values with `|`. |
| `notes` | Free text. |
| `domain`, `control_objective`, `service_model`, `expected_outcome`, `test` | Read only for baseline controls; used to define custom controls. |

Only values that differ from the baseline are stored. Importing a workbook replaces the profile's control tailoring and custom controls, and keeps its organisation, parties, providers, systems, allocation and scenarios. The workbook is UTF-8 with a byte-order mark so Excel opens it correctly, and semicolon-delimited files are accepted too.

## Validation

Every import is previewed before it is applied.

**Errors block the import:**
- invalid RASCI or owner codes, or unknown parties;
- duplicate IDs, or custom controls that reuse a baseline ID or lack required fields;
- allocation splits that don't sum to 100;
- malformed scenarios.

**Warnings are shown but don't block:**
- out-of-scope controls without a justification;
- overrides for unknown controls, layers or service models;
- RASCI that breaks the rule of exactly one accountable and at least one responsible party.

If a saved profile no longer fits a newer baseline, the explorer shows the problems when it opens and falls back to the baseline until you import a corrected profile.

## Exports

| Export | Contents |
| --- | --- |
| Profile (JSON) | The overlay itself, to keep, share or import elsewhere. |
| Tailoring workbook (CSV) | Every control with its current values, for editing. |
| Tailoring report (CSV) | One row per change: control, field, baseline value, profile value and justification. |
| Statement of Applicability (CSV) | Every control:<ul><li>whether it applies, with the justification;</li><li>its source (baseline, tailored or custom);</li><li>the named accountable and responsible parties;</li><li>owner, contract reference and evidence;</li><li>CSA CCM, ISO/IEC 27017 and ISM references.</li></ul> |

## Reference data

The service-model allocation shares, on-premises sections and roles, responsibility functions, COBIT pillars, lifecycle stages and failure scenarios live in [`reference.json`](../reference.json), not in the page code. The explorer loads it at start-up, and `splunk/build.py` builds the Splunk lookups from it. A profile overrides it for your organisation; changes intended for everyone belong in `reference.json` itself.

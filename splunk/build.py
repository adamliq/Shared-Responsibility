#!/usr/bin/env python3
"""Build the Shared Responsibility Splunk app (proof of concept).

Reads the control catalogue (matrix.json) and the reference data embedded in
index.html (service-model shares, on-premises sections, lifecycle stages and
failure scenarios), then writes a complete Splunk app to splunk/shared_responsibility
and, with --package, a .tgz ready to install.

Requires Python 3.9+. The control catalogue (matrix.json) and reference data
(reference.json) are shared with the standalone explorer, so both always agree.
Building the React page needs Node.js 22+ and npm.

    python3 splunk/build.py            # regenerate the app directory
    python3 splunk/build.py --package  # also write dist/shared_responsibility-<version>.tgz
    python3 splunk/build.py --skip-ui  # reuse the last React build in splunk/react/dist

The React explorer page (Splunk UI Toolkit) is built with npm from splunk/react.
"""
import argparse
import csv
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_ID = "shared_responsibility"
APP_DIR = ROOT / "splunk" / APP_ID
VERSION = "0.3.0"
UI_DIR = ROOT / "splunk" / "react"
PARTIES = [
    ("csc", "Customer governance"),
    ("customer_soc", "Customer SOC"),
    ("csp", "Cloud provider"),
    ("third_party", "Third party"),
]
NO_ROLE = {"—", "N/A", ""}


def read_reference_data():
    """Reads reference.json (shared with the explorer) into the shapes the lookup builders use."""
    ref = json.loads((ROOT / "reference.json").read_text(encoding="utf-8"))
    return {
        "MODELS": [m["id"] for m in ref["service_models"]],
        "MODEL_INFO": {m["id"]: m.get("definition", "") for m in ref["service_models"]},
        "LAYERS": ref["control_layers"],
        "ONPREM_PILLARS": ref["cobit_pillars"],
        "ONPREM_RESPONSIBILITIES": ref["responsibility_functions"],
        "ONPREM_SECTIONS": ref["onprem_sections"],
        "PLATFORM_LIFECYCLE": ref["lifecycle_stages"],
        "FAILURE_SCENARIOS": ref["failure_scenarios"],
    }


def write_csv(name, header, rows):
    path = APP_DIR / "lookups" / name
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)
    return len(rows)


def mv(values):
    """Splunk multivalue fields are stored pipe-delimited and expanded with makemv/split()."""
    return "|".join(str(v) for v in (values or []))


def write(rel, text):
    path = APP_DIR / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.lstrip("\n"), encoding="utf-8")


# --------------------------------------------------------------------------- lookups
def build_lookups(matrix, ref):
    controls = matrix["controls"]
    layers = ref["LAYERS"]
    domain_layers = {}
    for layer in layers:
        for domain in layer["domains"]:
            domain_layers.setdefault(domain, []).append(layer["id"])
    ref_keys = sorted({k for c in controls for k in c.get("references", {})})
    counts = {}

    rows = []
    for c in controls:
        rasci = c.get("rasci", {})
        accountable = [label for key, label in PARTIES if rasci.get(key) in ("A", "R/A")]
        refs = c.get("references", {})
        rows.append([
            c["control_id"], c["domain"], c["service_model"], c["control_objective"], c["expected_outcome"], c["test"],
            c["owner_assignment"], rasci.get("csp", "—"), rasci.get("csc", "—"), rasci.get("customer_soc", "—"),
            rasci.get("third_party", "—"), mv(accountable), c.get("ism_mapping_strength", ""), mv(c.get("ism_applicability")),
            mv(c.get("shared_control_component")), mv(domain_layers.get(c["domain"], [])),
            *[mv(refs.get(k)) if isinstance(refs.get(k), list) else (refs.get(k) or "") for k in ref_keys],
        ])
    counts["srm_controls.csv"] = write_csv("srm_controls.csv", [
        "control_id", "domain", "service_model", "objective", "expected_outcome", "test", "owner_assignment",
        "rasci_csp", "rasci_csc", "rasci_customer_soc", "rasci_third_party", "accountable_party", "ism_mapping_strength",
        "ism_applicability", "shared_control_component", "layer_ids", *ref_keys,
    ], rows)

    rows = [[c["control_id"], key, label, c["rasci"][key]] for c in controls for key, label in PARTIES
            if c.get("rasci", {}).get(key, "—") not in NO_ROLE]
    counts["srm_rasci.csv"] = write_csv("srm_rasci.csv", ["control_id", "party_key", "party", "rasci"], rows)

    counts["srm_layers.csv"] = write_csv("srm_layers.csv", ["layer_id", "layer", "scope"],
                                         [[l["id"], l["label"], l["hint"]] for l in layers])
    counts["srm_layer_domains.csv"] = write_csv("srm_layer_domains.csv", ["layer_id", "layer", "domain"],
                                                [[l["id"], l["label"], d] for l in layers for d in l["domains"]])
    rows = []
    for layer in layers:
        for i, model in enumerate(ref["MODELS"]):
            share, soc = layer["share"][i], layer["soc"][i]
            rows.append([layer["id"], layer["label"], model, max(0, share - soc), soc, 100 - share])
    counts["srm_layer_shares.csv"] = write_csv("srm_layer_shares.csv",
                                               ["layer_id", "layer", "service_model", "customer_pct", "soc_pct", "provider_pct"], rows)
    counts["srm_service_models.csv"] = write_csv("srm_service_models.csv", ["service_model", "definition"],
                                                 [[m, ref["MODEL_INFO"].get(m, "")] for m in ref["MODELS"]])

    functions = ref["ONPREM_RESPONSIBILITIES"]
    pillars = {p["code"]: p for p in ref["ONPREM_PILLARS"]}
    counts["srm_pillars.csv"] = write_csv("srm_pillars.csv", ["pillar_code", "pillar", "meaning"],
                                          [[p["code"], p["label"], p["meaning"]] for p in ref["ONPREM_PILLARS"]])
    counts["srm_functions.csv"] = write_csv("srm_functions.csv", ["function_order", "function", "pillar_code", "pillar"],
                                            [[i + 1, f["label"], code, pillars[code]["label"]] for i, f in enumerate(functions) for code in f["pillars"]])
    role_name = {"P": "Primary", "S": "Support", "C": "Consulted"}
    sections = ref["ONPREM_SECTIONS"]
    counts["srm_sections.csv"] = write_csv("srm_sections.csv", ["section_order", "section_id", "section", "scope", "layer_ids"],
                                           [[i + 1, s["id"], s["label"], s["hint"], mv(s["layers"])] for i, s in enumerate(sections)])
    counts["srm_section_roles.csv"] = write_csv("srm_section_roles.csv", ["section_id", "section", "function_order", "function", "role", "role_name"],
                                                [[s["id"], s["label"], i + 1, functions[i]["label"], r, role_name[r]]
                                                 for s in sections for i, r in enumerate(s["roles"]) if r in role_name])

    stages = ref["PLATFORM_LIFECYCLE"]
    counts["srm_lifecycle_stages.csv"] = write_csv("srm_lifecycle_stages.csv", ["stage_order", "stage_id", "stage", "scope"],
                                                   [[i + 1, st["id"], st["label"], st["hint"]] for i, st in enumerate(stages)])
    counts["srm_lifecycle_pillars.csv"] = write_csv("srm_lifecycle_pillars.csv", ["stage_order", "stage", "function", "pillar_code", "pillar"],
                                                    [[i + 1, st["label"], functions[f]["label"], code, pillars[code]["label"]]
                                                     for i, st in enumerate(stages) for f, codes in enumerate(st["pillars"]) for code in codes])
    layer_label = {l["id"]: l["label"] for l in layers}
    counts["srm_lifecycle_layers.csv"] = write_csv("srm_lifecycle_layers.csv", ["stage_order", "stage", "layer_id", "layer"],
                                                   [[i + 1, st["label"], lid, layer_label.get(lid, lid)] for i, st in enumerate(stages) for lid in st["layers"]])

    scenarios = ref["FAILURE_SCENARIOS"]
    counts["srm_scenarios.csv"] = write_csv("srm_scenarios.csv", ["scenario_number", "scenario_id", "scenario", "summary", "objective", "phases", "metrics"],
                                            [[sc.get("number", i + 1), sc["id"], sc["title"], sc["summary"], sc["objective"], mv(sc["phases"]),
                                              mv(f"{m['label']}={m['value']}" for m in sc.get("metrics", []))]
                                             for i, sc in enumerate(scenarios)])
    counts["srm_scenario_involvement.csv"] = write_csv(
        "srm_scenario_involvement.csv", ["scenario", "section_id", "section", "function", "involved"],
        [[sc["title"], s["id"], s["label"], functions[i]["label"], int(bool((sc["involved"].get(s["id"]) or [])[i] if i < len(sc["involved"].get(s["id"]) or []) else 0))]
         for sc in scenarios for s in sections for i in range(len(functions))])
    counts["srm_scenario_layers.csv"] = write_csv("srm_scenario_layers.csv", ["scenario", "layer_id", "layer"],
                                                  [[sc["title"], lid, layer_label.get(lid, lid)] for sc in scenarios for lid in sc["layers"]])

    counts["srm_evidence_checks.csv"] = write_csv("srm_evidence_checks.csv", ["control_id", "check", "saved_search", "method"],
                                                  [[c["control_id"], c["check"], c["name"], c["method"]] for c in EVIDENCE_CHECKS])
    return counts


# --------------------------------------------------------------------------- evidence checks
# Each check evidences one control from data every Splunk instance has (its own
# indexes, audit trail and configuration), so the proof of concept works out of the box.
EVIDENCE_CHECKS = [
    {"control_id": "LOG-004", "check": "Monitored indexes are receiving events", "cron": "5 * * * *", "earliest": "-24h",
     "method": "tstats event counts across `srm_monitored_indexes` in the last 24 hours",
     "search": "| tstats count where `srm_monitored_indexes` by index "
               "| stats sum(count) as metric dc(index) as indexes | fillnull value=0 metric indexes "
               "| eval status=if(metric>0,\"pass\",\"fail\"), evidence=indexes.\" monitored index(es) received \".metric.\" events in the last 24 hours\""},
    {"control_id": "COL-016", "check": "End-to-end collection latency within 5 minutes (p95)", "cron": "10 * * * *", "earliest": "-60m",
     "method": "95th percentile of _indextime - _time for recent events",
     "search": "`srm_monitored_indexes` | head 50000 | eval lag=_indextime-_time "
               "| stats count perc95(lag) as p95 | eval metric=round(coalesce(p95,0),1), "
               "status=case(count=0,\"no_evidence\",p95<=300,\"pass\",true(),\"fail\"), "
               "evidence=if(count=0,\"No events in the last hour to measure\",\"p95 indexing latency \".metric.\" s across \".count.\" sampled events (target 300 s)\")"},
    {"control_id": "COL-006", "check": "Source event time preserved (skew under 1%)", "cron": "15 * * * *", "earliest": "-24h",
     "method": "Share of events whose index time is before event time or more than a day after it",
     "search": "`srm_monitored_indexes` | head 50000 | eval skew=_indextime-_time "
               "| stats count count(eval(skew<0 OR skew>86400)) as bad | eval metric=if(count>0,round(bad/count*100,2),0), "
               "status=case(count=0,\"no_evidence\",metric<1,\"pass\",true(),\"fail\"), "
               "evidence=if(count=0,\"No events in the last 24 hours to measure\",bad.\" of \".count.\" sampled events (\".metric.\"%) have implausible timestamps\")"},
    {"control_id": "LOG-010", "check": "Monitored indexes retain events for 12 months", "cron": "20 2 * * *", "earliest": "-1m",
     "method": "frozenTimePeriodInSecs of each enabled non-internal index",
     "search": "| rest /services/data/indexes splunk_server=local count=0 | search disabled=0 NOT title=\"_*\" NOT title IN (\"history\",\"summary\",\"splunklogger\",\"lastchanceindex\") "
               "| eval days=round(frozenTimePeriodInSecs/86400) | stats count as indexes count(eval(days<365)) as short min(days) as metric "
               "values(eval(if(days<365,title,null()))) as short_indexes | fillnull value=0 indexes short "
               "| eval status=case(indexes=0,\"no_evidence\",short=0,\"pass\",true(),\"fail\"), "
               "evidence=if(short=0,indexes.\" index(es) retain at least \".metric.\" days\",short.\" index(es) retain under 365 days: \".mvjoin(short_indexes,\", \"))"},
    {"control_id": "LOG-012", "check": "Access attempts to the logging platform are audited", "cron": "25 * * * *", "earliest": "-7d",
     "method": "Login attempts recorded in the _audit index over seven days",
     "search": "index=_audit action=\"login attempt\" | stats count as metric count(eval(info=\"failed\")) as failed "
               "| fillnull value=0 metric failed | eval status=if(metric>0,\"pass\",\"no_evidence\"), "
               "evidence=metric.\" login attempts audited in 7 days, \".failed.\" failed\""},
    {"control_id": "LOG-013", "check": "No user can delete indexed events", "cron": "30 * * * *", "earliest": "-1m",
     "method": "Users holding the can_delete role",
     "search": "| rest /services/authentication/users splunk_server=local count=0 | search roles=\"can_delete\" "
               "| stats count as metric values(title) as holders | fillnull value=0 metric "
               "| eval status=if(metric=0,\"pass\",\"fail\"), evidence=if(metric=0,\"No user holds the can_delete role\",metric.\" user(s) can delete events: \".mvjoin(holders,\", \"))"},
    {"control_id": "LOG-009", "check": "Security monitoring alerts are scheduled", "cron": "35 * * * *", "earliest": "-1m",
     "method": "Enabled scheduled searches with an alert action or triggered-alert tracking",
     "search": "| rest /servicesNS/-/-/saved/searches splunk_server=local count=0 | search is_scheduled=1 disabled=0 "
               "| where 'alert.track'=1 OR (isnotnull(actions) AND actions!=\"\") | stats count as metric "
               "| eval status=if(metric>0,\"pass\",\"fail\"), evidence=metric.\" enabled alert(s) scheduled\""},
]
for check in EVIDENCE_CHECKS:
    check["name"] = f"SRM Evidence - {check['control_id']}"


# --------------------------------------------------------------------------- dashboards
def dashboard(title, description, inputs, data_sources, visualizations, layout, height=None):
    """Wrap a Dashboard Studio definition in the XML envelope Splunk stores for version 2 dashboards."""
    definition = {
        "title": title,
        "description": description,
        "inputs": inputs,
        "defaults": {"dataSources": {"ds.search": {"options": {"queryParameters": {"earliest": "-24h@h", "latest": "now"}}}}},
        "visualizations": visualizations,
        "dataSources": data_sources,
        "layout": {"type": "grid", "options": {"width": 1440, **({"height": height} if height else {})},
                   "globalInputs": list(inputs), "structure": layout},
    }
    body = json.dumps(definition, indent=2, ensure_ascii=False)
    return f'<dashboard version="2" theme="dark">\n  <label>{title}</label>\n  <description>{description}</description>\n  <definition><![CDATA[\n{body}\n  ]]></definition>\n</dashboard>\n'


def ds(query):
    return {"type": "ds.search", "options": {"query": " ".join(query.split())}}


def viz(kind, title, source, options=None, description=None, extra=None):
    v = {"type": f"splunk.{kind}", "title": title, "dataSources": {"primary": source}, "options": options or {}}
    if description:
        v["description"] = description
    v.update(extra or {})
    return v


def place(items):
    """items: list of rows; each row is a list of (viz_id, width, height)."""
    structure, y = [], 0
    for row in items:
        x, h = 0, 0
        for item, w, hh in row:
            structure.append({"item": item, "type": "block", "position": {"x": x, "y": y, "w": w, "h": hh}})
            x += w
            h = max(h, hh)
        y += h
    return structure


def dropdown(title, token, items, default):
    return {"type": "input.dropdown", "title": title,
            "options": {"items": [{"label": i, "value": i} for i in items], "defaultValue": default, "token": token}}


STATUS_COLORS = {"rowBackgroundColors": "> table | seriesByName(\"status\") | matchValue(statusColors)"}
STATUS_CONTEXT = {"statusColors": [{"match": "pass", "value": "#1C6B2D"}, {"match": "fail", "value": "#9E2520"},
                                   {"match": "no_evidence", "value": "#7A5A00"}, {"match": "not_run", "value": "#3C444D"}]}


def build_dashboards(ref):
    models = ref["MODELS"]
    scenarios = [sc["title"] for sc in ref["FAILURE_SCENARIOS"]]
    views = {}

    views["srm_overview"] = dashboard(
        "Shared Responsibility Overview",
        "Who is accountable and responsible across the 1,191 atomic controls, by party, domain and RASCI code.",
        {},
        {
            "ds_total": ds("| inputlookup srm_controls_lookup | stats count"),
            "ds_direct": ds("| inputlookup srm_controls_lookup | where ism_mapping_strength=\"Direct\" | stats count"),
            "ds_domains": ds("| inputlookup srm_controls_lookup | stats dc(domain)"),
            "ds_evidence": ds("| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id | stats count(eval(status=\"pass\")) as pass count as total | eval pct=if(total>0,round(pass/total*100),0) | fields pct"),
            "ds_accountable": ds("| inputlookup srm_rasci_lookup | where rasci=\"A\" OR rasci=\"R/A\" | stats count as controls by party | sort - controls"),
            "ds_owner": ds("| inputlookup srm_controls_lookup | stats count by owner_assignment | sort - count"),
            "ds_codes": ds("| inputlookup srm_rasci_lookup | chart count over party by rasci"),
            "ds_domain_table": ds("| inputlookup srm_controls_lookup | eval accountable=accountable_party | stats count as controls "
                                  "count(eval(accountable=\"Customer governance\")) as customer count(eval(accountable=\"Cloud provider\")) as provider "
                                  "count(eval(accountable=\"Third party\")) as third_party count(eval(rasci_customer_soc=\"R\" OR rasci_customer_soc=\"R/A\")) as soc_responsible "
                                  "count(eval(ism_mapping_strength=\"Direct\")) as ism_direct by domain | sort - controls "
                                  "| rename domain as Domain controls as Controls customer as \"Customer accountable\" provider as \"Provider accountable\" "
                                  "third_party as \"Third party accountable\" soc_responsible as \"SOC responsible\" ism_direct as \"ISM direct\""),
        },
        {
            "viz_total": viz("singlevalue", "Atomic controls", "ds_total"),
            "viz_direct": viz("singlevalue", "Direct ISM mappings", "ds_direct"),
            "viz_domains": viz("singlevalue", "Control domains", "ds_domains"),
            "viz_evidence": viz("singlevalue", "Evidence checks passing", "ds_evidence", {"unit": "%"}),
            "viz_accountable": viz("bar", "Accountable party (A or R/A)", "ds_accountable", {"legendDisplay": "off"}),
            "viz_owner": viz("pie", "Owner assignment", "ds_owner"),
            "viz_codes": viz("column", "RASCI codes by party", "ds_codes", {"stackMode": "stacked"}),
            "viz_domain_table": viz("table", "Accountability by control domain", "ds_domain_table", {"count": 20}),
        },
        place([[("viz_total", 360, 130), ("viz_direct", 360, 130), ("viz_domains", 360, 130), ("viz_evidence", 360, 130)],
               [("viz_accountable", 480, 320), ("viz_owner", 440, 320), ("viz_codes", 520, 320)],
               [("viz_domain_table", 1440, 620)]]),
    )

    views["srm_allocation"] = dashboard(
        "Responsibility Allocation",
        "How each control layer's responsibility splits between customer governance, the customer SOC and the provider under a service model.",
        {"input_model": dropdown("Service model", "model", models, "SaaS")},
        {
            "ds_flow": ds("| inputlookup srm_layer_shares_lookup where service_model=\"$model$\" "
                          "| eval pair=mvappend(\"Customer governance=\".customer_pct, \"Customer SOC=\".soc_pct, \"Cloud provider=\".provider_pct) "
                          "| mvexpand pair | eval source=mvindex(split(pair,\"=\"),0), value=tonumber(mvindex(split(pair,\"=\"),1)), target=layer "
                          "| where value>0 | table source target value"),
            "ds_split": ds("| inputlookup srm_layer_shares_lookup where service_model=\"$model$\" "
                           "| stats avg(customer_pct) as \"Customer governance\" avg(soc_pct) as \"Customer SOC\" avg(provider_pct) as \"Cloud provider\" "
                           "| transpose column_name=party | rename \"row 1\" as share | eval share=round(share,1)"),
            "ds_table": ds("| inputlookup srm_layer_shares_lookup where service_model=\"$model$\" "
                           "| sort - provider_pct | table layer customer_pct soc_pct provider_pct "
                           "| rename layer as \"Control layer\" customer_pct as \"Customer %\" soc_pct as \"SOC %\" provider_pct as \"Provider %\""),
            "ds_models": ds("| inputlookup srm_layer_shares_lookup | stats avg(customer_pct) as Customer avg(soc_pct) as SOC avg(provider_pct) as Provider by service_model "
                            "| foreach Customer SOC Provider [eval <<FIELD>>=round('<<FIELD>>',1)]"),
        },
        {
            "viz_flow": viz("sankey", "Party → control layer ($model$, share in percentage points)", "ds_flow"),
            "viz_split": viz("pie", "Average split ($model$)", "ds_split"),
            "viz_models": viz("column", "Average split by service model", "ds_models", {"stackMode": "stacked100"}),
            "viz_table": viz("table", "Layer shares ($model$)", "ds_table", {"count": 30}),
        },
        place([[("viz_flow", 960, 760), ("viz_split", 480, 380)], [("viz_models", 1440, 340)], [("viz_table", 1440, 620)]]),
    )
    # place() stacks rows, so put the pie beside the Sankey's lower half too by keeping the Sankey tall.

    views["srm_controls"] = dashboard(
        "Control Catalogue",
        "Search and filter the atomic controls with their tests, owners, RASCI assignments and standards references.",
        {"input_text": {"type": "input.text", "title": "Search", "options": {"defaultValue": "*", "token": "q"}},
         "input_owner": dropdown("Owner assignment", "owner", ["*", "CSC", "CSP", "3PTY", "SH-D", "SH-S", "INH"], "*"),
         "input_ism": dropdown("ISM mapping", "ism", ["*", "Direct", "Contextual", "Not applicable"], "*")},
        {
            "ds_count": ds("| inputlookup srm_controls_lookup | search owner_assignment=\"$owner$\" ism_mapping_strength=\"$ism$\" "
                           "| search control_id=\"*$q$*\" OR objective=\"*$q$*\" OR domain=\"*$q$*\" OR test=\"*$q$*\" | stats count"),
            "ds_controls": ds("| inputlookup srm_controls_lookup | search owner_assignment=\"$owner$\" ism_mapping_strength=\"$ism$\" "
                              "| search control_id=\"*$q$*\" OR objective=\"*$q$*\" OR domain=\"*$q$*\" OR test=\"*$q$*\" "
                              "| eval csa_ccm_v4_1_control_ids=replace(csa_ccm_v4_1_control_ids,\"\\|\",\", \") "
                              "| table control_id domain objective test owner_assignment accountable_party rasci_csc rasci_customer_soc rasci_csp rasci_third_party ism_mapping_strength csa_ccm_v4_1_control_ids "
                              "| rename control_id as ID domain as Domain objective as Objective test as Test owner_assignment as Owner accountable_party as Accountable "
                              "rasci_csc as \"Customer gov.\" rasci_customer_soc as SOC rasci_csp as Provider rasci_third_party as \"Third party\" ism_mapping_strength as ISM csa_ccm_v4_1_control_ids as \"CSA CCM\""),
        },
        {
            "viz_count": viz("singlevalue", "Matching controls", "ds_count"),
            "viz_controls": viz("table", "Controls", "ds_controls", {"count": 25, "showInternalFields": False}),
        },
        place([[("viz_count", 300, 120)], [("viz_controls", 1440, 900)]]),
    )

    views["srm_onprem"] = dashboard(
        "On-premises Cross-cut",
        "On-premises sections against responsibility functions (Primary, Support, Consulted) and the COBIT pillars each function carries.",
        {},
        {
            "ds_matrix": ds("| inputlookup srm_section_roles_lookup | eval cell=role | xyseries section function cell "
                            "| join type=left section [| inputlookup srm_sections_lookup | fields section section_order] | sort section_order | fields - section_order _* "
                            "| fillnull value=\"—\""),
            "ds_flow": ds("| inputlookup srm_section_roles_lookup | rename section as source function as target | eval value=case(role=\"P\",3,role=\"S\",2,true(),1) "
                          "| table source target value "
                          "| append [| inputlookup srm_functions_lookup | eval source=function, target=pillar.\" (\".pillar_code.\")\", value=2 | table source target value]"),
            "ds_roles": ds("| inputlookup srm_section_roles_lookup | chart count over section by role_name"),
        },
        {
            "viz_matrix": viz("table", "Section × function roles", "ds_matrix", {"count": 15}),
            "viz_flow": viz("sankey", "Section → function → COBIT pillar (weight: P=3, S=2, C=1)", "ds_flow"),
            "viz_roles": viz("bar", "Role mix by section", "ds_roles", {"stackMode": "stacked"}),
        },
        place([[("viz_matrix", 1440, 460)], [("viz_flow", 920, 760), ("viz_roles", 520, 760)]]),
    )

    views["srm_lifecycle"] = dashboard(
        "Platform Lifecycle",
        "Lifecycle stages against the COBIT pillars engaged by each responsibility function, and the control layers each stage engages.",
        {},
        {
            "ds_heat": ds("| inputlookup srm_lifecycle_pillars_lookup | eval stage=printf(\"%02d \", stage_order).replace(stage,\"^\\d+\\.\\s*\",\"\") "
                          "| chart count over stage by pillar"),
            "ds_flow": ds("| inputlookup srm_lifecycle_pillars_lookup | stats count as value by stage pillar | rename stage as source pillar as target | table source target value"),
            "ds_layers": ds("| inputlookup srm_lifecycle_layers_lookup | stats count as stages values(stage) as engaged_by by layer | sort - stages "
                            "| rename layer as \"Control layer\" stages as Stages engaged_by as \"Engaged by\""),
        },
        {
            "viz_heat": viz("column", "Function–pillar engagements per stage", "ds_heat", {"stackMode": "stacked"}),
            "viz_flow": viz("sankey", "Stage → COBIT pillar", "ds_flow"),
            "viz_layers": viz("table", "Control layers across the lifecycle", "ds_layers", {"count": 30}),
        },
        place([[("viz_heat", 1440, 360)], [("viz_flow", 760, 700), ("viz_layers", 680, 700)]]),
    )

    views["srm_scenarios"] = dashboard(
        "Failure Scenarios",
        "Which on-premises sections and responsibility functions each failure scenario involves, and the control layers its recovery draws on.",
        {"input_scenario": dropdown("Scenario", "scenario", scenarios, scenarios[0])},
        {
            "ds_summary": ds("| inputlookup srm_scenarios_lookup where scenario=\"$scenario$\" | eval phases=replace(phases,\"\\|\",\" → \") | table objective phases "
                             "| rename objective as Objective phases as \"Recovery phases\""),
            "ds_matrix": ds("| inputlookup srm_scenario_involvement_lookup where scenario=\"$scenario$\" | eval cell=if(involved=1,\"Involved\",\"—\") "
                            "| xyseries section function cell | join type=left section [| inputlookup srm_sections_lookup | fields section section_order] | sort section_order | fields - section_order _*"),
            "ds_compare": ds("| inputlookup srm_scenario_involvement_lookup | stats sum(involved) as involved by scenario function | xyseries function scenario involved"),
            "ds_layers": ds("| inputlookup srm_scenario_layers_lookup | stats count as scenarios values(scenario) as used_by by layer | sort - scenarios "
                            "| rename layer as \"Control layer\" scenarios as Scenarios used_by as \"Used by\""),
        },
        {
            "viz_summary": viz("table", "$scenario$", "ds_summary"),
            "viz_matrix": viz("table", "Section × function involvement ($scenario$)", "ds_matrix", {"count": 15}),
            "viz_compare": viz("column", "Sections involved per function, by scenario", "ds_compare"),
            "viz_layers": viz("table", "Control layers drawn on", "ds_layers", {"count": 25}),
        },
        place([[("viz_summary", 1440, 150)], [("viz_matrix", 1440, 460)], [("viz_compare", 760, 520), ("viz_layers", 680, 520)]]),
    )

    views["srm_evidence"] = dashboard(
        "Control Evidence",
        "Scheduled searches that evidence controls from data Splunk already holds. Each run appends a result to the srm_evidence KV Store collection.",
        {},
        {
            "ds_latest": ds("| inputlookup srm_evidence_checks_lookup | join type=left control_id [| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id] "
                            "| lookup srm_controls_lookup control_id OUTPUT objective owner_assignment accountable_party "
                            "| eval status=coalesce(status,\"not_run\"), last_checked=if(isnotnull(checked_at),strftime(checked_at,\"%Y-%m-%d %H:%M\"),\"—\") "
                            "| table control_id objective check status evidence last_checked accountable_party saved_search "
                            "| rename control_id as control objective as Objective check as Check evidence as Evidence last_checked as \"Last checked\" accountable_party as Accountable saved_search as \"Saved search\""),
            "ds_pass": ds("| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id | where status=\"pass\" | stats count"),
            "ds_fail": ds("| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id | where status=\"fail\" | stats count"),
            "ds_none": ds("| inputlookup srm_evidence_checks_lookup | join type=left control_id [| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id] "
                          "| where isnull(status) OR status=\"no_evidence\" | stats count"),
            "ds_history": ds("| inputlookup srm_evidence_lookup | eval _time=checked_at | timechart span=1h count(eval(status=\"pass\")) as pass count(eval(status=\"fail\")) as fail count(eval(status=\"no_evidence\")) as no_evidence",
                             ),
        },
        {
            "viz_pass": viz("singlevalue", "Passing", "ds_pass", {"majorColor": "#1C6B2D"}),
            "viz_fail": viz("singlevalue", "Failing", "ds_fail", {"majorColor": "#9E2520"}),
            "viz_none": viz("singlevalue", "No evidence or not run", "ds_none", {"majorColor": "#7A5A00"}),
            "viz_latest": viz("table", "Latest result per control (run a check with | savedsearch \"SRM Evidence - <control>\")", "ds_latest",
                              {"count": 20, "columnFormat": {"status": STATUS_COLORS}}, extra={"context": STATUS_CONTEXT}),
            "viz_history": viz("column", "Evidence results over time", "ds_history", {"stackMode": "stacked", "seriesColorsByField": {"pass": "#1C6B2D", "fail": "#9E2520", "no_evidence": "#7A5A00"}}),
        },
        place([[("viz_pass", 480, 130), ("viz_fail", 480, 130), ("viz_none", 480, 130)], [("viz_latest", 1440, 420)], [("viz_history", 1440, 320)]]),
    )
    for name, xml in views.items():
        write(f"default/data/ui/views/{name}.xml", xml)
    return list(views)


# --------------------------------------------------------------------------- configuration
def build_conf(views):
    write("default/app.conf", f"""
[install]
is_configured = false
build = 3

[ui]
is_visible = true
label = Shared Responsibility

[launcher]
author = Shared Responsibility Explorer project
description = Cloud shared-responsibility control matrix (1,191 atomic controls) with RASCI, service-model allocation, on-premises cross-cut, lifecycle and failure-scenario views, plus scheduled control-evidence searches. Proof of concept.
version = {VERSION}

[package]
id = {APP_ID}
check_for_updates = false

[id]
name = {APP_ID}
version = {VERSION}
""")
    write("default/data/ui/nav/default.xml", """
<nav search_view="search" color="#0B6689">
  <view name="srm_explorer" default="true" />
  <view name="srm_overview" />
  <collection label="Responsibility">
    <view name="srm_allocation" />
    <view name="srm_onprem" />
    <view name="srm_lifecycle" />
    <view name="srm_scenarios" />
  </collection>
  <view name="srm_controls" />
  <view name="srm_evidence" />
  <a href="/static/app/shared_responsibility/explorer/index.html" target="_blank">Standalone explorer ↗</a>
  <view name="search" />
</nav>
""")
    lookups = sorted(p.name for p in (APP_DIR / "lookups").glob("*.csv"))
    stanzas = []
    for name in lookups:
        stanzas.append(f"[{name[:-4]}_lookup]\nfilename = {name}\ncase_sensitive_match = false\n")
    stanzas.append("""[srm_evidence_lookup]
external_type = kvstore
collection = srm_evidence
case_sensitive_match = false
fields_list = _key, control_id, check, status, evidence, metric, checked_at
""")
    write("default/transforms.conf", "\n".join(stanzas))
    write("default/collections.conf", """
[srm_evidence]
field.control_id = string
field.check = string
field.status = string
field.evidence = string
field.metric = number
field.checked_at = time
accelerated_fields.control_time = {"control_id": 1, "checked_at": -1}
""")
    write("default/macros.conf", """
[srm_monitored_indexes]
definition = index=*
description = Indexes whose data evidences logging controls. Narrow this to your security indexes, for example (index=wineventlog OR index=firewall).
iseval = 0

[srm_record_evidence(2)]
args = control_id, check
definition = eval control_id="$control_id$", check="$check$", checked_at=now() | fields control_id check status evidence metric checked_at | outputlookup append=true srm_evidence_lookup
description = Appends one evidence result (fields status, evidence and metric) for a control to the srm_evidence KV Store collection.
iseval = 0
""")
    saved = []
    for c in EVIDENCE_CHECKS:
        saved.append(f"""[{c['name']}]
description = Evidence for {c['control_id']}: {c['check']}. Method: {c['method']}.
search = {c['search']} | `srm_record_evidence("{c['control_id']}","{c['check']}")`
dispatch.earliest_time = {c['earliest']}
dispatch.latest_time = now
cron_schedule = {c['cron']}
enableSched = 1
is_visible = true
""")
    write("default/savedsearches.conf", "\n".join(saved))
    write("metadata/default.meta", """
[]
access = read : [ * ], write : [ admin, sc_admin ]
export = none

[collections/srm_evidence]
access = read : [ * ], write : [ admin, sc_admin ]

[savedsearches]
owner = nobody
""")
    write("README.txt", f"""
Shared Responsibility for Splunk ({APP_ID}) - version {VERSION} - proof of concept

WHAT IT CONTAINS
- Lookups generated from the explorer's data: srm_controls (1,191 controls), srm_rasci,
  srm_layer_shares, srm_sections, srm_section_roles, srm_lifecycle_*, srm_scenario_* and more.
  Every lookup has a definition named <file>_lookup, for example | inputlookup srm_controls_lookup
- Explorer: a Splunk UI Toolkit (React) page, the app's default view, that reads the lookups live,
  runs evidence checks on demand and queries the combined graph with read-only Cypher.
- Dashboard Studio dashboards: {", ".join(views)}
- Seven scheduled evidence searches ("SRM Evidence - <control>") that evidence logging controls
  from Splunk's own data and append results to the srm_evidence KV Store collection.
- The standalone explorer (graphs and Cypher console) under appserver/static/explorer, linked
  from the app navigation.

SET UP
1. Install the app (Apps > Manage Apps > Install app from file), then restart Splunk so
   Splunk Web picks up the Explorer page template.
2. Edit the srm_monitored_indexes macro to list the indexes that hold your security data.
3. Run any check immediately with | savedsearch "SRM Evidence - LOG-004"; they are otherwise
   scheduled hourly (LOG-010 daily).

This package is generated by splunk/build.py in the Shared Responsibility repository; edit
that script, not the files here.
""")


def copy_explorer():
    target = APP_DIR / "appserver" / "static" / "explorer"
    target.mkdir(parents=True, exist_ok=True)
    # Ship the explorer's script as a separate file: Splunk's content checks flag JavaScript
    # template literals inside .html files as Mako template code, and external scripts suit
    # Splunk Web's content security policy better than inline ones. Splunk prefixes app .js
    # files with an i18n_register() call, so the page defines a no-op before loading it.
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    start, end = html.index("<script>"), html.index("</script>", html.index("<script>"))
    (target / "explorer.js").write_text(html[start + len("<script>"):end].strip() + "\n", encoding="utf-8")
    (target / "index.html").write_text(html[:start] + '<script>window.i18n_register=window.i18n_register||function(){};</script><script src="explorer.js"></script>' + html[end + len("</script>"):], encoding="utf-8")
    shutil.copy2(ROOT / "matrix.json", target / "matrix.json")
    shutil.copy2(ROOT / "reference.json", target / "reference.json")
    (target / "examples").mkdir(exist_ok=True)
    shutil.copy2(ROOT / "examples" / "profile-example.json", target / "examples" / "profile-example.json")
    for icon in sorted((ROOT / "splunk" / "static").glob("*.png")):
        shutil.copy2(icon, APP_DIR / "static" / icon.name)


def build_ui(skip):
    """Builds the Splunk UI Toolkit page and installs its bundle, template and view."""
    bundle = UI_DIR / "dist" / "explorer.js"
    if not skip:
        npm = shutil.which("npm")
        if not npm:
            raise SystemExit("npm is required to build the React page (or pass --skip-ui to reuse splunk/react/dist).")
        if not (UI_DIR / "node_modules").exists():
            subprocess.run([npm, "ci", "--no-audit", "--no-fund"], cwd=UI_DIR, check=True)
        subprocess.run([npm, "run", "build"], cwd=UI_DIR, check=True)
    if not bundle.exists():
        raise SystemExit("splunk/react/dist/explorer.js is missing; run without --skip-ui.")
    pages = APP_DIR / "appserver" / "static" / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    shutil.copy2(bundle, pages / "explorer.js")
    # Splunk UI Toolkit page template. It uses only make_url() expressions, with no Python code
    # blocks, and loads Splunk's config and i18n scripts before the page bundle.
    write("appserver/templates/srm_explorer.html", f"""
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Shared Responsibility Explorer</title>
    </head>
    <body>
        <script src="${{make_url('/config?autoload=1')}}" crossorigin="use-credentials"></script>
        <script src="${{make_url('/static/js/i18n.js')}}"></script>
        <script src="${{make_url('/i18ncatalog?autoload=1')}}"></script>
        <script>
            __splunkd_partials__ = ${{json_decode(splunkd)}};
        </script>
        <script src="${{make_url('/static/app/{APP_ID}/pages/explorer.js')}}"></script>
    </body>
</html>
""")
    write("default/data/ui/views/srm_explorer.xml", f"""
<?xml version="1.0"?>
<view template="{APP_ID}:/templates/srm_explorer.html" type="html" isDashboard="False">
    <label>Explorer</label>
</view>
""")
    return (pages / "explorer.js").stat().st_size


def package():
    dist = ROOT / "splunk" / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / f"{APP_ID}-{VERSION}.tgz"
    with tarfile.open(out, "w:gz") as tar:
        def clean(info):
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mode = 0o755 if info.isdir() else 0o644
            return info
        tar.add(APP_DIR, arcname=APP_ID, filter=clean)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--package", action="store_true", help="also write splunk/dist/<app>-<version>.tgz")
    parser.add_argument("--skip-ui", action="store_true", help="reuse the existing React build instead of running npm")
    args = parser.parse_args()
    matrix = json.loads((ROOT / "matrix.json").read_text(encoding="utf-8"))
    ref = read_reference_data()
    if APP_DIR.exists():
        shutil.rmtree(APP_DIR)
    (APP_DIR / "lookups").mkdir(parents=True)
    (APP_DIR / "static").mkdir(parents=True)
    counts = build_lookups(matrix, ref)
    views = build_dashboards(ref)
    build_conf(views)
    copy_explorer()
    ui_size = build_ui(args.skip_ui)
    for name, n in counts.items():
        print(f"  lookups/{name}: {n} rows")
    print(f"  {len(views)} dashboards, {len(EVIDENCE_CHECKS)} evidence searches, React explorer page ({ui_size / 1048576:.1f} MB bundle)")
    if args.package:
        print(f"Packaged {package().relative_to(ROOT)}")


if __name__ == "__main__":
    main()

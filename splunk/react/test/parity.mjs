// Rebuilds the combined graph from the generated lookup CSVs and compares it with the
// standalone explorer's graph (dumped from index.html by the caller) node-for-node.
import fs from 'fs';
import path from 'path';
import { buildGraph, indexData } from '../src/graph.js';
import { CY } from '../src/generated/engine.js';
const L = path.resolve('../shared_responsibility/lookups');
function csv(file) {
    const text = fs.readFileSync(path.join(L, file), 'utf8'); const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
        if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
        else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
    if (f || row.length) { row.push(f); rows.push(row); }
    const [h, ...body] = rows; return body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
export const FILES = { controls: 'srm_controls.csv', rasci: 'srm_rasci.csv', layers: 'srm_layers.csv', layerDomains: 'srm_layer_domains.csv', layerShares: 'srm_layer_shares.csv', serviceModels: 'srm_service_models.csv', sections: 'srm_sections.csv', sectionRoles: 'srm_section_roles.csv', functions: 'srm_functions.csv', pillars: 'srm_pillars.csv', stages: 'srm_lifecycle_stages.csv', lifecyclePillars: 'srm_lifecycle_pillars.csv', lifecycleLayers: 'srm_lifecycle_layers.csv', scenarios: 'srm_scenarios.csv', scenarioInvolvement: 'srm_scenario_involvement.csv', scenarioLayers: 'srm_scenario_layers.csv', evidenceChecks: 'srm_evidence_checks.csv' };
const raw = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, csv(f)])); raw.evidence = [];
const data = indexData(raw);
const mine = buildGraph(data, { allControls: true });
const orig = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const key = (o) => JSON.stringify(o, Object.keys(o).sort());
const nk = (n) => `${n.id}|${n.type}|${n.caption}|${key(Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)])))}`;
const ek = (e) => `${e.s}|${e.type}|${e.t}|${key(Object.fromEntries(Object.entries(e.props || {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)])))}`;
function diff(a, b, f, label) { const A = new Map(), B = new Map(); a.forEach((x) => A.set(f(x), (A.get(f(x)) || 0) + 1)); b.forEach((x) => B.set(f(x), (B.get(f(x)) || 0) + 1));
    const onlyA = [...A.keys()].filter((k) => A.get(k) !== B.get(k)), onlyB = [...B.keys()].filter((k) => A.get(k) !== B.get(k));
    console.log(`${label}: lookups ${a.length} · original ${b.length} · mismatches ${onlyA.length}/${onlyB.length}`); onlyA.slice(0, 3).forEach((k) => console.log('  lookup  ', k.slice(0, 260))); onlyB.slice(0, 3).forEach((k) => console.log('  original', k.slice(0, 260))); return onlyA.length + onlyB.length; }
const bad = diff(mine.nodes, orig.nodes, nk, 'nodes') + diff(mine.edges, orig.edges, ek, 'relationships');
const db = CY.db(mine), r = CY.run("MATCH (:Control)-[a:ASSIGNED]->(p:Party) RETURN p.name AS party, count(*) AS n ORDER BY n DESC", db);
console.log('cypher on lookup graph:', r.rows.map((x) => x.join('=')).join(', '));
process.exit(bad ? 1 : 0);

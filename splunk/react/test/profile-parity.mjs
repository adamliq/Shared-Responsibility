// End-to-end check with an organisation profile: the dataset written to Splunk (src/dataset.js)
// rebuilt into the graph (src/graph.js) must equal the standalone explorer's graph with the same
// profile applied (dumped from index.html by the caller).
import fs from 'fs';
import path from 'path';
import { buildDataset } from '../src/dataset.js';
import { buildGraph, indexData } from '../src/graph.js';
export const KEYS = { srm_controls: 'controls', srm_rasci: 'rasci', srm_parties: 'parties', srm_systems: 'systems', srm_layers: 'layers', srm_layer_domains: 'layerDomains', srm_layer_shares: 'layerShares', srm_service_models: 'serviceModels', srm_pillars: 'pillars', srm_functions: 'functions', srm_sections: 'sections', srm_section_roles: 'sectionRoles', srm_lifecycle_stages: 'stages', srm_lifecycle_pillars: 'lifecyclePillars', srm_lifecycle_layers: 'lifecycleLayers', srm_scenarios: 'scenarios', srm_scenario_involvement: 'scenarioInvolvement', srm_scenario_layers: 'scenarioLayers' };
const root = path.resolve('../..');
const profile = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : null;
const res = buildDataset(JSON.parse(fs.readFileSync(path.join(root, 'matrix.json'))), JSON.parse(fs.readFileSync(path.join(root, 'reference.json'))), profile);
if (res.errors.length) { console.log(res.errors); process.exit(1); }
const raw = Object.fromEntries(Object.entries(KEYS).map(([c, k]) => [k, res.dataset[c].rows]));
raw.evidenceChecks = []; raw.evidence = [];
const mine = buildGraph(indexData(raw), { allControls: true });
const orig = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const key = (o) => JSON.stringify(o, Object.keys(o).sort());
const norm = (props) => key(Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)])));
const nk = (n) => `${n.id}|${n.type}|${n.caption}|${norm(n.props)}`, ek = (e) => `${e.s}|${e.type}|${e.t}|${norm(e.props)}`;
function diff(a, b, f, label) { const A = new Map(), B = new Map(); a.forEach((x) => A.set(f(x), (A.get(f(x)) || 0) + 1)); b.forEach((x) => B.set(f(x), (B.get(f(x)) || 0) + 1));
    const oa = [...A.keys()].filter((k) => A.get(k) !== B.get(k)), ob = [...B.keys()].filter((k) => A.get(k) !== B.get(k));
    console.log(`${label}: splunk ${a.length} · explorer ${b.length} · mismatches ${oa.length}/${ob.length}`); oa.slice(0, 3).forEach((k) => console.log('  splunk  ', k.slice(0, 300))); ob.slice(0, 3).forEach((k) => console.log('  explorer', k.slice(0, 300))); return oa.length + ob.length; }
const bad = diff(mine.nodes, orig.nodes, nk, 'nodes') + diff(mine.edges, orig.edges, ek, 'relationships');
process.exit(bad ? 1 : 0);

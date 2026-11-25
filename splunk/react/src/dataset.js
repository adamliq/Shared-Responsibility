/**
 * Builds the app's dataset (one row list per KV Store collection) from a control catalogue
 * (matrix.json format), reference data (reference.json format) and an optional organisation
 * profile. It mirrors splunk/build.py, which builds the shipped demo dataset the same way;
 * test/dataset-parity.mjs checks that both produce identical rows for the demo data.
 */
import { overlayControls, overlayReference, setProfileContext, validateProfile, DEFAULT_PARTY_NAMES } from './generated/engine.js';

export const PARTY_KEYS = ['csc', 'customer_soc', 'csp', 'third_party'];
const NO_ROLE = new Set(['—', 'N/A', '']);
const ROLE_NAME = { P: 'Primary', S: 'Support', C: 'Consulted' };
export const PROFILE_COLUMNS = ['applicable', 'source', 'tailored', 'justification', 'owner', 'evidence_links', 'notes'];
export const SYSTEM_COLUMNS = ['system_id', 'system', 'service_model', 'provider', 'criticality', 'owner', 'description'];
export const COLLECTIONS = [
    'srm_controls', 'srm_rasci', 'srm_parties', 'srm_systems', 'srm_layers', 'srm_layer_domains', 'srm_layer_shares',
    'srm_service_models', 'srm_pillars', 'srm_functions', 'srm_sections', 'srm_section_roles', 'srm_lifecycle_stages',
    'srm_lifecycle_pillars', 'srm_lifecycle_layers', 'srm_scenarios', 'srm_scenario_involvement', 'srm_scenario_layers',
];

const mv = (values) => (values || []).map(String).join('|');
const table = (columns, rows) => ({ columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] === undefined || r[i] === null ? '' : String(r[i])]))) });

/** Validates the inputs and returns {errors, warnings, stats, dataset} where dataset maps collection name to {columns, rows}. */
export function buildDataset(catalogue, reference, profile) {
    const errors = [];
    if (!catalogue || !Array.isArray(catalogue.controls) || !catalogue.controls.length) errors.push('The control catalogue must be a JSON object with a non-empty "controls" array (the matrix.json format).');
    ['service_models', 'control_layers', 'cobit_pillars', 'responsibility_functions', 'onprem_sections', 'lifecycle_stages', 'failure_scenarios'].forEach((k) => {
        if (!reference || !Array.isArray(reference[k])) errors.push(`The reference data must contain a "${k}" array (the reference.json format).`);
    });
    if (!errors.length) {
        const seen = new Set();
        catalogue.controls.forEach((c, i) => {
            const where = c && c.control_id ? c.control_id : `Control ${i + 1}`;
            ['control_id', 'domain', 'control_objective', 'owner_assignment'].forEach((k) => {
                if (!c || !c[k]) errors.push(`${where}: "${k}" is required.`);
            });
            if (c && c.control_id) {
                if (seen.has(c.control_id)) errors.push(`${c.control_id} appears more than once.`);
                seen.add(c.control_id);
            }
            if (c && (!c.rasci || typeof c.rasci !== 'object')) errors.push(`${where}: "rasci" must be an object with csp, csc, customer_soc and third_party.`);
        });
        reference.control_layers.forEach((l) => {
            if (!Array.isArray(l.share) || !Array.isArray(l.soc) || l.share.length !== reference.service_models.length || l.soc.length !== reference.service_models.length) {
                errors.push(`Control layer "${l.id}": "share" and "soc" need one value per service model (${reference.service_models.length}).`);
            }
        });
    }
    if (errors.length) return { errors: errors.slice(0, 100), warnings: [], stats: null, dataset: null };
    const controlsIn = catalogue.controls.map((c) => ({ references: {}, ...c }));
    setProfileContext(controlsIn, reference, profile || null, []);
    let warnings = [];
    let stats = null;
    if (profile) {
        const v = validateProfile(profile);
        if (v.errors.length) return { errors: v.errors, warnings: v.warnings, stats: null, dataset: null };
        warnings = v.warnings;
        stats = v.stats;
    }
    const controls = overlayControls(profile || null);
    const ref = overlayReference(profile || null);
    setProfileContext(controlsIn, reference, profile || null, controls);
    return { errors: [], warnings, stats, dataset: datasetRows(controls, ref, profile), controls, reference: ref };
}

function datasetRows(controls, ref, profile) {
    const parties = PARTY_KEYS.map((k) => [k, (profile && profile.parties && profile.parties[k] && profile.parties[k].name) || DEFAULT_PARTY_NAMES[k]]);
    const layers = ref.control_layers;
    const models = ref.service_models.map((m) => m.id);
    const domainLayers = new Map();
    layers.forEach((l) => l.domains.forEach((d) => (domainLayers.has(d) ? domainLayers.get(d).push(l.id) : domainLayers.set(d, [l.id]))));
    const refKeys = [...new Set(controls.flatMap((c) => Object.keys(c.references || {})))].sort();
    const out = {};

    out.srm_controls = table(
        ['control_id', 'domain', 'service_model', 'objective', 'expected_outcome', 'test', 'owner_assignment', 'rasci_csp', 'rasci_csc', 'rasci_customer_soc', 'rasci_third_party', 'accountable_party', 'ism_mapping_strength', 'ism_applicability', 'shared_control_component', 'layer_ids', ...PROFILE_COLUMNS, ...refKeys],
        controls.map((c) => {
            const rasci = c.rasci || {};
            const refs = c.references || {};
            return [
                c.control_id, c.domain, c.service_model, c.control_objective, c.expected_outcome, c.test, c.owner_assignment,
                rasci.csp || '—', rasci.csc || '—', rasci.customer_soc || '—', rasci.third_party || '—',
                mv(parties.filter(([k]) => rasci[k] === 'A' || rasci[k] === 'R/A').map(([, label]) => label)),
                c.ism_mapping_strength || '', mv(c.ism_applicability), mv(c.shared_control_component), mv(domainLayers.get(c.domain)),
                c.applicable === false ? 'No' : 'Yes', c.custom ? 'custom' : c.tailored && c.tailored.length ? 'tailored' : 'baseline', mv(c.custom ? c.tailored : c.tailored || []),
                c.justification || '', c.owner || '', mv((c.evidence || []).map((e) => e.url)), c.notes || '',
                ...refKeys.map((k) => (Array.isArray(refs[k]) ? mv(refs[k]) : refs[k] || '')),
            ];
        })
    );
    out.srm_rasci = table(['control_id', 'party_key', 'party', 'rasci'], controls.flatMap((c) => parties.filter(([k]) => !NO_ROLE.has((c.rasci || {})[k] || '—')).map(([k, label]) => [c.control_id, k, label, c.rasci[k]])));
    out.srm_parties = table(['party_key', 'party', 'contact'], parties.map(([k, label]) => [k, label, (profile && profile.parties && profile.parties[k] && profile.parties[k].contact) || '']));
    out.srm_systems = table(SYSTEM_COLUMNS, ((profile && profile.systems) || []).map((s) => [s.id || s.name, s.name, s.service_model, s.provider, s.criticality, s.owner, s.description]));
    out.srm_layers = table(['layer_id', 'layer', 'scope'], layers.map((l) => [l.id, l.label, l.hint]));
    out.srm_layer_domains = table(['layer_id', 'layer', 'domain'], layers.flatMap((l) => l.domains.map((d) => [l.id, l.label, d])));
    out.srm_layer_shares = table(['layer_id', 'layer', 'service_model', 'customer_pct', 'soc_pct', 'provider_pct'], layers.flatMap((l) => models.map((m, i) => [l.id, l.label, m, Math.max(0, l.share[i] - l.soc[i]), l.soc[i], 100 - l.share[i]])));
    out.srm_service_models = table(['service_model', 'definition', 'provider'], ref.service_models.map((m) => [m.id, m.definition || '', m.provider || '']));
    const pillars = new Map(ref.cobit_pillars.map((p) => [p.code, p]));
    const functions = ref.responsibility_functions;
    out.srm_pillars = table(['pillar_code', 'pillar', 'meaning'], ref.cobit_pillars.map((p) => [p.code, p.label, p.meaning]));
    out.srm_functions = table(['function_order', 'function', 'pillar_code', 'pillar'], functions.flatMap((f, i) => f.pillars.map((code) => [i + 1, f.label, code, pillars.get(code).label])));
    const sections = ref.onprem_sections;
    out.srm_sections = table(['section_order', 'section_id', 'section', 'scope', 'layer_ids'], sections.map((s, i) => [i + 1, s.id, s.label, s.hint, mv(s.layers)]));
    out.srm_section_roles = table(['section_id', 'section', 'function_order', 'function', 'role', 'role_name'], sections.flatMap((s) => s.roles.map((r, i) => [r, i]).filter(([r]) => ROLE_NAME[r]).map(([r, i]) => [s.id, s.label, i + 1, functions[i].label, r, ROLE_NAME[r]])));
    const stages = ref.lifecycle_stages;
    const layerLabel = new Map(layers.map((l) => [l.id, l.label]));
    out.srm_lifecycle_stages = table(['stage_order', 'stage_id', 'stage', 'scope'], stages.map((st, i) => [i + 1, st.id, st.label, st.hint]));
    out.srm_lifecycle_pillars = table(['stage_order', 'stage', 'function', 'pillar_code', 'pillar'], stages.flatMap((st, i) => st.pillars.flatMap((codes, f) => codes.map((code) => [i + 1, st.label, functions[f].label, code, pillars.get(code).label]))));
    out.srm_lifecycle_layers = table(['stage_order', 'stage', 'layer_id', 'layer'], stages.flatMap((st, i) => st.layers.map((lid) => [i + 1, st.label, lid, layerLabel.get(lid) || lid])));
    const scenarios = ref.failure_scenarios;
    out.srm_scenarios = table(['scenario_number', 'scenario_id', 'scenario', 'summary', 'objective', 'phases', 'metrics'], scenarios.map((sc, i) => [sc.number || i + 1, sc.id, sc.title, sc.summary, sc.objective, mv(sc.phases), mv((sc.metrics || []).map((m) => `${m.label}=${m.value}`))]));
    out.srm_scenario_involvement = table(['scenario', 'section_id', 'section', 'function', 'involved'], scenarios.flatMap((sc) => sections.flatMap((s) => functions.map((f, i) => {
        const row = (sc.involved && sc.involved[s.id]) || [];
        return [sc.title, s.id, s.label, f.label, i < row.length && row[i] ? 1 : 0];
    }))));
    out.srm_scenario_layers = table(['scenario', 'layer_id', 'layer'], scenarios.flatMap((sc) => sc.layers.map((lid) => [sc.title, lid, layerLabel.get(lid) || lid])));
    return out;
}

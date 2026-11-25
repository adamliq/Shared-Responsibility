/**
 * Builds the combined property graph from the app's lookups (as loaded by data.js).
 * Node ids, labels and relationship types match the standalone explorer's Combined graph and
 * Cypher export, so the same Cypher queries work in both places.
 */
export const PARTIES = [
    { key: 'csc', label: 'Customer governance', shareField: 'customer_pct' },
    { key: 'customer_soc', label: 'Customer SOC', shareField: 'soc_pct' },
    { key: 'csp', label: 'Cloud provider', shareField: 'provider_pct' },
    { key: 'third_party', label: 'Third party', shareField: null },
];
export const NODE_TYPES = ['Party', 'ServiceModel', 'ControlLayer', 'Domain', 'Section', 'Function', 'Pillar', 'Stage', 'Scenario', 'Control', 'System'];
const ROLE_TYPES = { P: 'PRIMARY_FOR', S: 'SUPPORTS', C: 'CONSULTED_ON' };
const NUMERIC = new Set(['customer_pct', 'soc_pct', 'provider_pct', 'stage_order', 'section_order', 'function_order', 'scenario_number', 'involved', 'metric', 'checked_at']);

export const mv = (value) => (value ? String(value).split('|').filter(Boolean) : []);
export const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Normalises numeric lookup columns, which Splunk returns as strings. */
export function normalise(rows) {
    return rows.map((row) => {
        const out = { ...row };
        Object.keys(out).forEach((k) => {
            if (NUMERIC.has(k)) out[k] = num(out[k]);
        });
        return out;
    });
}

export function buildGraph(data, { allControls = false, expandedDomains = new Set() } = {}) {
    const nodes = [];
    const edges = [];
    const add = (id, type, caption, props = {}, extra = {}) => nodes.push({ id, type, caption, props, ...extra });
    const link = (s, t, type, props, caption) => edges.push({ s, t, type, props: props || {}, caption: caption || type });

    const layers = data.layers;
    const layerIds = new Set(layers.map((l) => l.layer_id));
    const domains = [...new Set(data.controls.map((c) => c.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const controlsByDomain = new Map();
    data.controls.forEach((c) => {
        if (!controlsByDomain.has(c.domain)) controlsByDomain.set(c.domain, []);
        controlsByDomain.get(c.domain).push(c);
    });
    const layerDomains = new Map();
    data.layerDomains.forEach((r) => {
        if (!layerDomains.has(r.layer_id)) layerDomains.set(r.layer_id, []);
        layerDomains.get(r.layer_id).push(r.domain);
    });
    const functions = [];
    data.functions.forEach((f) => {
        const i = f.function_order - 1;
        if (!functions[i]) functions[i] = { label: f.function, pillars: [] };
        functions[i].pillars.push(f.pillar_code);
    });
    const fnIndex = new Map(functions.map((f, i) => [f.label, i]));
    const models = data.serviceModels.map((m) => m.service_model);

    const partyLabel = new Map((data.parties || []).map((p) => [p.party_key, p.party]));
    PARTIES.forEach((p) => add(`party:${p.key}`, 'Party', partyLabel.get(p.key) || p.label, { rasci_actor: p.key }, { r: 32 }));
    data.serviceModels.forEach((m) => add(`model:${m.service_model}`, 'ServiceModel', m.service_model, { definition: m.definition, ...(m.provider ? { provider: m.provider } : {}) }, { r: 22 }));
    (data.systems || []).forEach((s) => {
        const id = `system:${s.system_id}`;
        const props = {};
        [['description', s.description], ['provider', s.provider], ['criticality', s.criticality], ['owner', s.owner], ['service_model', s.service_model]].forEach(([k, v]) => {
            if (v) props[k] = v;
        });
        add(id, 'System', s.system, props, { r: 22 });
        if (s.service_model && models.includes(s.service_model)) link(id, `model:${s.service_model}`, 'USES_MODEL');
    });
    layers.forEach((l) => add(`layer:${l.layer_id}`, 'ControlLayer', l.layer, { scope: l.scope, domains: layerDomains.get(l.layer_id) || [] }, { r: 24 }));
    domains.forEach((d) =>
        add(`domain:${d}`, 'Domain', d, {
            controls: (controlsByDomain.get(d) || []).length,
            layers: layers.filter((l) => (layerDomains.get(l.layer_id) || []).includes(d)).map((l) => l.layer),
        }, { r: 20 }));
    data.sections.forEach((s) => add(`section:${s.section_id}`, 'Section', s.section, { scope: s.scope }, { r: 26 }));
    functions.forEach((f, i) => add(`fn:${i}`, 'Function', f.label, { cobit_pillars: f.pillars }, { r: 24 }));
    data.pillars.forEach((p) => add(`pillar:${p.pillar_code}`, 'Pillar', `${p.pillar} ${p.pillar_code}`, { code: p.pillar_code, meaning: p.meaning }, { r: 26 }));
    data.stages.forEach((st) => add(`stage:${st.stage_id}`, 'Stage', st.stage, { order: st.stage_order, scope: st.scope }, { r: 24 }));
    data.scenarios.forEach((sc) => add(`scenario:${sc.scenario_id}`, 'Scenario', sc.scenario, {
        objective: sc.objective,
        phases: mv(sc.phases),
        ...Object.fromEntries(mv(sc.metrics).map((m) => {
            const [label, value] = m.split('=');
            return [label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), value];
        })),
    }, { r: 28 }));

    models.forEach((m) => {
        const rows = data.layerShares.filter((r) => r.service_model === m);
        PARTIES.forEach((p) => {
            if (!p.shareField) return;
            const v = Math.round(avg(rows.map((r) => r[p.shareField])));
            if (v) link(`model:${m}`, `party:${p.key}`, 'ALLOCATES', { avg_share_pct: v }, `ALLOCATES · ${v}%`);
        });
    });
    layers.forEach((l) => {
        const rows = data.layerShares.filter((r) => r.layer_id === l.layer_id);
        PARTIES.forEach((p) => {
            if (!p.shareField) return;
            const v = Math.round(avg(rows.map((r) => r[p.shareField])));
            if (v) link(`party:${p.key}`, `layer:${l.layer_id}`, 'HOLDS_SHARE', { avg_share_pct: v }, `HOLDS_SHARE · ${v}%`);
        });
    });
    const accountable = new Map();
    data.rasci.forEach((r) => {
        if (r.rasci !== 'A' && r.rasci !== 'R/A') return;
        const c = data.controlById.get(r.control_id);
        if (!c) return;
        const k = `${r.party_key}|${c.domain}`;
        accountable.set(k, (accountable.get(k) || 0) + 1);
    });
    domains.forEach((d) => {
        layers.filter((l) => (layerDomains.get(l.layer_id) || []).includes(d)).forEach((l) => link(`domain:${d}`, `layer:${l.layer_id}`, 'PART_OF'));
        PARTIES.forEach((p) => {
            const n = accountable.get(`${p.key}|${d}`);
            if (n) link(`party:${p.key}`, `domain:${d}`, 'ACCOUNTABLE_FOR', { controls: n }, `ACCOUNTABLE_FOR · ${n}`);
        });
    });
    const rolesBySection = new Map();
    data.sectionRoles.forEach((r) => {
        if (!rolesBySection.has(r.section_id)) rolesBySection.set(r.section_id, []);
        rolesBySection.get(r.section_id).push(r);
    });
    data.sections.forEach((s) => {
        (rolesBySection.get(s.section_id) || [])
            .sort((a, b) => a.function_order - b.function_order)
            .forEach((r) => link(`section:${s.section_id}`, `fn:${r.function_order - 1}`, ROLE_TYPES[r.role], { role: r.role }));
        mv(s.layer_ids).forEach((id) => layerIds.has(id) && link(`section:${s.section_id}`, `layer:${id}`, 'COVERS'));
    });
    functions.forEach((f, i) => f.pillars.forEach((code) => link(`fn:${i}`, `pillar:${code}`, 'ALIGNS_TO')));
    const stages = [...data.stages].sort((a, b) => a.stage_order - b.stage_order);
    stages.forEach((st, i) => {
        if (i) link(`stage:${stages[i - 1].stage_id}`, `stage:${st.stage_id}`, 'NEXT');
        data.pillars.forEach((p) => {
            const n = data.lifecyclePillars.filter((r) => r.stage_order === st.stage_order && r.pillar_code === p.pillar_code).length;
            if (n) link(`stage:${st.stage_id}`, `pillar:${p.pillar_code}`, 'EMPHASISES', { functions: n }, `EMPHASISES · ${n}`);
        });
        data.lifecycleLayers.filter((r) => r.stage_order === st.stage_order).forEach((r) => layerIds.has(r.layer_id) && link(`stage:${st.stage_id}`, `layer:${r.layer_id}`, 'ENGAGES'));
    });
    data.scenarios.forEach((sc) => {
        data.sections.forEach((s) => {
            const fns = data.scenarioInvolvement
                .filter((r) => r.scenario === sc.scenario && r.section_id === s.section_id && r.involved === 1)
                .map((r) => r.function)
                .sort((a, b) => fnIndex.get(a) - fnIndex.get(b));
            if (fns.length) link(`scenario:${sc.scenario_id}`, `section:${s.section_id}`, 'INVOLVES', { functions: fns.length, responsibility_functions: fns }, `INVOLVES · ${fns.length}`);
        });
        data.scenarioLayers.filter((r) => r.scenario === sc.scenario).forEach((r) => layerIds.has(r.layer_id) && link(`scenario:${sc.scenario_id}`, `layer:${r.layer_id}`, 'DRAWS_ON'));
    });

    const shown = allControls ? data.controls : data.controls.filter((c) => expandedDomains.has(c.domain));
    const rasciByControl = data.rasciByControl;
    shown.forEach((c) => {
        add(`control:${c.control_id}`, 'Control', c.control_id, controlProps(c), { r: 15, near: `domain:${c.domain}` });
        link(`control:${c.control_id}`, `domain:${c.domain}`, 'IN_DOMAIN');
        (rasciByControl.get(c.control_id) || []).forEach((r) => link(`control:${c.control_id}`, `party:${r.party_key}`, 'ASSIGNED', { rasci: r.rasci }, r.rasci));
    });
    return { nodes, edges };
}

// Lists every control carries (possibly empty); other framework lists appear only when populated.
const LIST_FIELDS = new Set(['ism_applicability', 'shared_control_component', 'layer_ids', 'accountable_party', 'csa_ccm_v4_1_control_ids', 'iso_iec_27017_2026', 'ism_v2026_09_4']);
const PROFILE_FIELDS = new Set(['applicable', 'source', 'tailored', 'justification', 'owner', 'evidence_links', 'notes']);
export function controlProps(c) {
    // Matches the standalone explorer's control properties, including an organisation's own
    // information (applicability, justification, owner, tailoring, evidence and notes).
    const props = { applicable: c.applicable !== 'No', objective: c.objective };
    if (c.justification) props.justification = c.justification;
    if (c.owner) props.owner = c.owner;
    if (c.tailored) props.tailored = mv(c.tailored);
    if (c.source === 'custom') props.custom = true;
    if (c.evidence_links) props.evidence = mv(c.evidence_links);
    if (c.notes) props.notes = c.notes;
    Object.entries(c).forEach(([k, v]) => {
        if (PROFILE_FIELDS.has(k) || ['objective', 'rasci_csp', 'rasci_csc', 'rasci_customer_soc', 'rasci_third_party', 'accountable_party', 'layer_ids', '_key', '_user'].includes(k)) return;
        if (k === 'provider_contractual_reference' || k === 'expected_outcome' || k === 'test' || k === 'domain' || k === 'service_model' || k === 'owner_assignment' || k === 'ism_mapping_strength' || k === 'control_id') {
            props[k] = v;
        } else if (LIST_FIELDS.has(k) || k.endsWith('_ids') || k.endsWith('_frameworks') || k.endsWith('_capabilities') || /^is[om]_/.test(k)) {
            if (v !== '' || LIST_FIELDS.has(k)) props[k] = mv(v);
        } else {
            props[k] = v;
        }
    });
    return props;
}

/** Indexes loaded lookup rows for the graph builder and the UI. */
export function indexData(raw) {
    const data = Object.fromEntries(Object.entries(raw).map(([k, rows]) => [k, normalise(rows)]));
    data.controlById = new Map(data.controls.map((c) => [c.control_id, c]));
    data.rasciByControl = new Map();
    data.rasci.forEach((r) => {
        if (!data.rasciByControl.has(r.control_id)) data.rasciByControl.set(r.control_id, []);
        data.rasciByControl.get(r.control_id).push(r);
    });
    data.evidenceByControl = new Map((data.evidence || []).map((e) => [e.control_id, e]));
    return data;
}

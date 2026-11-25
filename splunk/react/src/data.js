import SearchJob from '@splunk/search-job';
import { indexData } from './graph';

export const APP = 'shared_responsibility';

/** Lookup definitions loaded at start-up, keyed by the name the UI uses. */
export const LOOKUPS = {
    controls: 'srm_controls_lookup',
    rasci: 'srm_rasci_lookup',
    parties: 'srm_parties_lookup',
    systems: 'srm_systems_lookup',
    layers: 'srm_layers_lookup',
    layerDomains: 'srm_layer_domains_lookup',
    layerShares: 'srm_layer_shares_lookup',
    serviceModels: 'srm_service_models_lookup',
    sections: 'srm_sections_lookup',
    sectionRoles: 'srm_section_roles_lookup',
    functions: 'srm_functions_lookup',
    pillars: 'srm_pillars_lookup',
    stages: 'srm_lifecycle_stages_lookup',
    lifecyclePillars: 'srm_lifecycle_pillars_lookup',
    lifecycleLayers: 'srm_lifecycle_layers_lookup',
    scenarios: 'srm_scenarios_lookup',
    scenarioInvolvement: 'srm_scenario_involvement_lookup',
    scenarioLayers: 'srm_scenario_layers_lookup',
    evidenceChecks: 'srm_evidence_checks_lookup',
};
export const EVIDENCE_SEARCH = '| inputlookup srm_evidence_lookup | sort 0 - checked_at | dedup control_id';

/** Runs SPL in the app's context and resolves with every result row. */
export function runSearch(search, { earliest = '0', latest = 'now' } = {}) {
    return new Promise((resolve, reject) => {
        const job = SearchJob.create({ search, earliest_time: earliest, latest_time: latest }, { app: APP, owner: 'nobody' });
        const sub = job.getResults({ count: 0 }).subscribe({
            next: (res) => {
                const messages = (res && res.messages) || [];
                const fatal = messages.find((m) => m.type === 'FATAL' || m.type === 'ERROR');
                if (fatal) reject(new Error(fatal.text));
                else resolve((res && res.results) || []);
                sub.unsubscribe();
            },
            error: (err) => reject(err instanceof Error ? err : new Error(String((err && err.message) || err))),
        });
    });
}

/** Runs tasks with a small concurrency limit to stay well inside users' search quotas. */
async function pool(tasks, limit = 5) {
    const results = new Array(tasks.length);
    let next = 0;
    async function worker() {
        while (next < tasks.length) {
            const i = next++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

export async function loadAll(onProgress) {
    const entries = Object.entries(LOOKUPS);
    let done = 0;
    const tasks = entries.map(([, def]) => async () => {
        const rows = await runSearch(`| inputlookup ${def}`);
        done += 1;
        if (onProgress) onProgress(done, entries.length + 1);
        return rows;
    });
    tasks.push(async () => {
        const rows = await runSearch(EVIDENCE_SEARCH);
        done += 1;
        if (onProgress) onProgress(done, entries.length + 1);
        return rows;
    });
    const results = await pool(tasks);
    const raw = Object.fromEntries(entries.map(([key], i) => [key, results[i]]));
    raw.evidence = results[results.length - 1];
    return indexData(raw);
}

export async function loadEvidence() {
    return runSearch(EVIDENCE_SEARCH);
}

/** Runs one evidence check now; the saved search appends its result to the KV Store itself. */
export function runEvidenceCheck(savedSearch) {
    return runSearch(`| savedsearch "${savedSearch.replace(/"/g, '\\"')}"`, { earliest: '-24h' });
}

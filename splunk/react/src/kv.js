/**
 * Writes the app's dataset to its KV Store collections through Splunk's REST API, with the
 * signed-in user's permissions (by default, write access is limited to admin and sc_admin).
 */
import { createRESTURL, createStaticURL } from '@splunk/splunk-utils/url';
import { createFetchInit } from '@splunk/splunk-utils/fetch';
import { APP } from './data';
import { COLLECTIONS } from './dataset';

const NS = { app: APP, owner: 'nobody' };
const BATCH = 500;

async function call(endpoint, { method = 'GET', body, form, ns = NS, allow404 = false } = {}) {
    const headers = form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' };
    const init = createFetchInit({ method, headers, body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body) });
    const res = await fetch(`${createRESTURL(endpoint, ns)}?output_mode=json`, init);
    if (allow404 && res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) {
        if (res.status === 403) throw new Error("Your Splunk role can't change this app's data. Writing to its KV Store collections needs the admin or sc_admin role, or write access granted to your role.");
        let message = `${res.status} ${res.statusText}`;
        try {
            const m = JSON.parse(text).messages;
            if (m && m.length) message = m.map((x) => x.text).join('; ');
        } catch (e) {
            // Keep the status text.
        }
        throw new Error(`Splunk REST ${method} ${endpoint}: ${message}`);
    }
    return text ? JSON.parse(text) : null;
}

/** Status and source documents of the active dataset (without the large JSON payloads). */
export async function getDatasetInfo() {
    const docs = (await call('storage/collections/data/srm_dataset', { allow404: true })) || [];
    return Object.fromEntries(docs.map((d) => [d._key, { ...d, json: undefined, hasJson: !!d.json }]));
}
export async function getDatasetDoc(key) {
    const doc = await call(`storage/collections/data/srm_dataset/${encodeURIComponent(key)}`, { allow404: true });
    return doc && doc.json ? JSON.parse(doc.json) : null;
}
export async function currentUser() {
    try {
        const r = await call('authentication/current-context', { ns: {} });
        return r.entry[0].content.username;
    } catch (e) {
        return 'unknown';
    }
}
/** The demo dataset's sources, shipped with the app's standalone explorer. */
export async function getDemoSources() {
    const get = async (file) => {
        const res = await fetch(createStaticURL(`app/${APP}/explorer/${file}`), { credentials: 'include' });
        if (!res.ok) throw new Error(`Could not load the demo ${file} (${res.status}).`);
        return res.json();
    };
    const [catalogue, reference] = await Promise.all([get('matrix.json'), get('reference.json')]);
    return { catalogue, reference };
}

/**
 * Replaces every dataset collection with the given rows and records where the data came from.
 * sources: {catalogue, reference, profile} — objects to keep (own data) or null (demo / none).
 */
export async function writeDataset(dataset, sources, meta, onProgress = () => {}) {
    const steps = COLLECTIONS.length + 1;
    for (let i = 0; i < COLLECTIONS.length; i++) {
        const name = COLLECTIONS[i];
        onProgress(i, steps, name);
        // eslint-disable-next-line no-await-in-loop
        await call(`storage/collections/data/${name}`, { method: 'DELETE' });
        const rows = dataset[name].rows;
        for (let j = 0; j < rows.length; j += BATCH) {
            // eslint-disable-next-line no-await-in-loop
            await call(`storage/collections/data/${name}/batch_save`, { method: 'POST', body: rows.slice(j, j + BATCH) });
        }
    }
    onProgress(COLLECTIONS.length, steps, 'srm_dataset');
    const user = await currentUser();
    const now = Math.floor(Date.now() / 1000);
    await call('storage/collections/data/srm_dataset', { method: 'DELETE' });
    const docs = [{ _key: 'meta', kind: 'meta', source: meta.source, name: meta.name || '', loaded_at: now, loaded_by: user }];
    Object.entries(sources).forEach(([kind, value]) => {
        if (value) docs.push({ _key: kind, kind, name: (value.organisation && value.organisation.name) || value.title || '', loaded_at: now, loaded_by: user, json: JSON.stringify(value) });
    });
    await call('storage/collections/data/srm_dataset/batch_save', { method: 'POST', body: docs });
    onProgress(steps, steps, 'done');
    // Mark the app as configured so Splunk stops opening the setup screen; failure here is harmless.
    try {
        await call(`apps/local/${APP}`, { method: 'POST', form: { configured: '1' }, ns: {} });
    } catch (e) {
        // Users without permission to edit apps keep seeing setup; the data is written either way.
    }
}

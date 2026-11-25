import React, { useRef, useState } from 'react';
import Button from '@splunk/react-ui/Button';
import Heading from '@splunk/react-ui/Heading';
import Message from '@splunk/react-ui/Message';
import Modal from '@splunk/react-ui/Modal';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import { buildDataset } from '../dataset';
import { parseCSV, profileFromWorkbook, setProfileContext, soaRows, tailoringRows, toCSV, workbookRows, WORKBOOK_COLUMNS } from '../generated/engine';
import { getDatasetDoc, getDemoSources, writeDataset } from '../kv';
import { Lead, Muted, Panel, Stat, Toolbar } from '../styles';

function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const readFile = (file) =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error(`${file.name} could not be read.`));
        r.readAsText(file);
    });
const slug = (s) => (s || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset';

/** Loads the sources of the active dataset: own catalogue/reference if imported, otherwise the demo files. */
export async function loadSources(info) {
    const demo = info.catalogue && info.reference ? null : await getDemoSources();
    return {
        catalogue: info.catalogue ? await getDatasetDoc('catalogue') : demo.catalogue,
        reference: info.reference ? await getDatasetDoc('reference') : demo.reference,
        profile: info.profile ? await getDatasetDoc('profile') : null,
        ownCatalogue: !!info.catalogue,
        ownReference: !!info.reference,
    };
}

/** Builds the dataset from sources and writes it; returns the build result. */
export async function applySources(input, onProgress) {
    const sources = input.catalogue && input.reference ? input : { ...input, ...(await getDemoSources()) };
    const result = buildDataset(sources.catalogue, sources.reference, sources.profile);
    if (result.errors.length) throw new Error(result.errors.slice(0, 5).join(' '));
    const own = sources.ownCatalogue || sources.ownReference || sources.profile;
    await writeDataset(
        result.dataset,
        { catalogue: sources.ownCatalogue ? sources.catalogue : null, reference: sources.ownReference ? sources.reference : null, profile: sources.profile },
        { source: own ? 'own' : 'demo', name: sources.profile && sources.profile.organisation ? sources.profile.organisation.name : '' },
        onProgress
    );
    return result;
}

export function DatasetSummary({ data, info }) {
    const meta = info.meta;
    const own = meta && meta.source === 'own';
    const c = data.controls;
    return (
        <>
            <Heading level={3} style={{ marginTop: 0 }}>
                {!meta ? 'Demo dataset' : own ? meta.name || 'Your organisation’s data' : 'Demo dataset'}
            </Heading>
            <Muted>
                {meta
                    ? `Loaded ${new Date(meta.loaded_at * 1000).toLocaleString()} by ${meta.loaded_by}. `
                    : 'Loaded by the “SRM - Load demo dataset” search or an earlier version. '}
                Catalogue: {info.catalogue ? `your own (${info.catalogue.name || 'imported'})` : 'demo'} · reference data: {info.reference ? 'your own' : 'demo'} · organisation profile:{' '}
                {info.profile ? info.profile.name || 'applied' : 'none'}
            </Muted>
            <Stat style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                <div>
                    <strong>{c.length}</strong>controls
                </div>
                <div>
                    <strong>{c.filter((x) => x.applicable === 'No').length}</strong>out of scope
                </div>
                <div>
                    <strong>{c.filter((x) => x.source === 'tailored').length}</strong>tailored
                </div>
                <div>
                    <strong>{c.filter((x) => x.source === 'custom').length}</strong>custom
                </div>
                <div>
                    <strong>{(data.systems || []).length}</strong>systems
                </div>
            </Stat>
        </>
    );
}

export default function DataTab({ data, info, onReload, setup = false }) {
    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const [confirm, setConfirm] = useState(false);
    const profileInput = useRef(null);
    const catalogueInput = useRef(null);
    const returnFocus = useRef(null);
    const empty = !data || !data.controls.length;

    async function run(label, sources) {
        setError(null);
        setDone(null);
        setPending(null);
        setBusy({ label, step: 0, steps: 1, name: '' });
        try {
            const res = await applySources(sources, (step, steps, name) => setBusy({ label, step, steps, name }));
            setBusy({ label, step: 0, steps: 1, name: 'done', refreshing: true });
            await onReload();
            setDone(`${label}: ${res.dataset.srm_controls.rows.length} controls written to the app's KV Store collections.`);
        } catch (e) {
            setError(e.message || String(e));
        } finally {
            setBusy(null);
        }
    }
    async function current() {
        return loadSources(info);
    }
    async function stage(kind, file, extra) {
        setError(null);
        setDone(null);
        try {
            const text = await readFile(file);
            const base = empty ? { ...(await getDemoSources()), profile: null, ownCatalogue: false, ownReference: false } : await current();
            let next;
            let note;
            if (kind === 'profile') {
                let profile;
                if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
                    setProfileContext(base.catalogue.controls, base.reference, base.profile, []);
                    const r = profileFromWorkbook(parseCSV(text), base.profile);
                    if (r.errors.length) throw new Error(r.errors.slice(0, 8).join(' '));
                    profile = r.profile;
                    note = 'Tailoring workbook: control applicability, RASCI, owners, contract references, evidence and custom controls come from this file. The current profile’s organisation, parties, providers, systems, allocation and scenarios are kept.';
                } else {
                    try {
                        profile = JSON.parse(text);
                    } catch (e) {
                        throw new Error(`${file.name} is not valid JSON: ${e.message}`);
                    }
                    note = 'Organisation profile: replaces the current profile and is applied to the current catalogue.';
                }
                next = { ...base, profile };
            } else {
                let catalogue;
                let reference = base.reference;
                try {
                    catalogue = JSON.parse(text);
                    if (extra) reference = JSON.parse(await readFile(extra));
                } catch (e) {
                    throw new Error(`Not valid JSON: ${e.message}`);
                }
                next = { ...base, catalogue, reference, ownCatalogue: true, ownReference: !!extra || base.ownReference };
                note = `Control catalogue${extra ? ' and reference data' : ''}: replaces the ${base.ownCatalogue ? 'current' : 'demo'} catalogue${extra ? ' and reference data' : ''}. The current organisation profile${base.profile ? ' is re-applied to it' : ' (none)'}.`;
            }
            const result = buildDataset(next.catalogue, next.reference, next.profile);
            setPending({ label: kind === 'profile' ? `Import ${file.name}` : `Import ${file.name}${extra ? ` and ${extra.name}` : ''}`, note, sources: next, result });
        } catch (e) {
            setError(e.message || String(e));
        }
    }
    async function exportFile(kind) {
        try {
            const s = await current();
            const res = buildDataset(s.catalogue, s.reference, s.profile);
            const name = slug(s.profile && s.profile.organisation && s.profile.organisation.name);
            setProfileContext(s.catalogue.controls, s.reference, s.profile, res.controls);
            if (kind === 'profile') download(`${name}-profile.json`, `${JSON.stringify(s.profile, null, 2)}\n`, 'application/json');
            if (kind === 'workbook') download(`${name}-tailoring-workbook.csv`, toCSV(workbookRows(), WORKBOOK_COLUMNS), 'text/csv');
            if (kind === 'report') download(`${name}-tailoring-report.csv`, toCSV(tailoringRows(), ['control_id', 'control_objective', 'field', 'baseline_value', 'profile_value', 'justification']), 'text/csv');
            if (kind === 'soa') download(`${name}-statement-of-applicability.csv`, toCSV(soaRows(), ['control_id', 'domain', 'control_objective', 'applicable', 'justification', 'source', 'owner_assignment', 'accountable', 'responsible', 'owner', 'contract_reference', 'evidence', 'ism_mapping_strength', 'csa_ccm', 'iso_iec_27017', 'ism']), 'text/csv');
            if (kind === 'catalogue') download(`${name}-catalogue.json`, `${JSON.stringify(s.catalogue, null, 1)}\n`, 'application/json');
            if (kind === 'reference') download(`${name}-reference.json`, `${JSON.stringify(s.reference, null, 1)}\n`, 'application/json');
        } catch (e) {
            setError(e.message || String(e));
        }
    }

    const v = pending && pending.result;
    return (
        <>
            {setup ? (
                <Lead>
                    The app has no data yet. Start with the <b>demo dataset</b> (the published 1,191-control baseline) or with <b>your own information</b>: an organisation profile applied to
                    the demo catalogue, or your own control catalogue. Everything can be replaced later, and the demo can be reloaded at any time.
                </Lead>
            ) : (
                <Lead>
                    The app’s data lives in KV Store collections that every dashboard, search and this page read. Load your own information here, or reload the demo dataset. Changes
                    apply to everyone using the app.
                </Lead>
            )}
            {!setup && !empty && (
                <Panel style={{ marginBottom: 16 }}>
                    <DatasetSummary data={data} info={info} />
                </Panel>
            )}
            {error && (
                <Message type="error" onRequestRemove={() => setError(null)}>
                    {error}
                </Message>
            )}
            {done && (
                <Message type="success" onRequestRemove={() => setDone(null)}>
                    {done}
                </Message>
            )}
            {busy ? (
                <Panel>
                    <WaitSpinner /> {busy.label}: {busy.refreshing ? 'refreshing the page’s data…' : `writing ${busy.name} (${busy.step + 1} of ${busy.steps})…`}
                </Panel>
            ) : pending ? (
                <Panel>
                    <Heading level={3} style={{ marginTop: 0 }}>
                        Preview: {pending.label}
                    </Heading>
                    <p>{pending.note}</p>
                    {v.errors.length ? (
                        <Message type="error">
                            <b>
                                {v.errors.length} error{v.errors.length === 1 ? '' : 's'}. Fix these and import again.
                            </b>
                            <ul>
                                {v.errors.slice(0, 30).map((e) => (
                                    <li key={e}>{e}</li>
                                ))}
                            </ul>
                        </Message>
                    ) : (
                        <Stat style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                            <div>
                                <strong>{v.dataset.srm_controls.rows.length}</strong>controls
                            </div>
                            <div>
                                <strong>{v.controls.filter((c) => c.applicable === false).length}</strong>out of scope
                            </div>
                            <div>
                                <strong>{v.controls.filter((c) => c.tailored.length && !c.custom).length}</strong>tailored
                            </div>
                            <div>
                                <strong>{v.controls.filter((c) => c.custom).length}</strong>custom
                            </div>
                            <div>
                                <strong>{v.dataset.srm_systems.rows.length}</strong>systems
                            </div>
                        </Stat>
                    )}
                    {v.warnings.length > 0 && (
                        <Message type="warning">
                            <b>
                                {v.warnings.length} warning{v.warnings.length === 1 ? '' : 's'}
                            </b>
                            <ul>
                                {v.warnings.slice(0, 30).map((w) => (
                                    <li key={w}>{w}</li>
                                ))}
                            </ul>
                        </Message>
                    )}
                    <Toolbar>
                        <Button appearance="primary" label="Apply to the app" disabled={!!v.errors.length} onClick={() => run(pending.label, pending.sources)} />
                        <Button appearance="secondary" label="Cancel" onClick={() => setPending(null)} />
                    </Toolbar>
                </Panel>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    <Panel>
                        <Heading level={4} style={{ marginTop: 0 }}>
                            Demo dataset
                        </Heading>
                        <p>The published baseline: 1,191 atomic controls with RASCI, allocation shares, on-premises sections, lifecycle stages and failure scenarios.</p>
                        <Button appearance={setup ? 'primary' : 'secondary'} label={empty ? 'Load the demo dataset' : 'Reload the demo dataset'} onClick={() => (empty ? run('Load the demo dataset', { profile: null, ownCatalogue: false, ownReference: false }) : setConfirm(true))} />
                    </Panel>
                    <Panel>
                        <Heading level={4} style={{ marginTop: 0 }}>
                            Organisation profile
                        </Heading>
                        <p>
                            Your parties, providers, systems, control applicability, RASCI, owners, contract references, evidence, custom controls, allocation and scenarios, as a JSON profile
                            or a tailoring workbook (CSV) from the standalone explorer. It is applied to the current catalogue{empty ? ' (the demo catalogue)' : ''}.
                        </p>
                        <input ref={profileInput} type="file" accept=".json,.csv" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && stage('profile', e.target.files[0]).finally(() => (e.target.value = ''))} />
                        <Button appearance={setup ? 'primary' : 'secondary'} label="Import a profile or workbook…" onClick={() => profileInput.current.click()} />
                    </Panel>
                    <Panel>
                        <Heading level={4} style={{ marginTop: 0 }}>
                            Your own control catalogue
                        </Heading>
                        <p>
                            A catalogue in the <code>matrix.json</code> format, optionally with reference data in the <code>reference.json</code> format. Choose one file for the catalogue only, or
                            both files together.
                        </p>
                        <input
                            ref={catalogueInput}
                            type="file"
                            accept=".json"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const files = [...e.target.files];
                                const ref = files.find((f) => /reference/i.test(f.name));
                                const cat = files.find((f) => f !== ref) || files[0];
                                if (cat) stage('catalogue', cat, ref && ref !== cat ? ref : null).finally(() => (e.target.value = ''));
                            }}
                        />
                        <Button appearance="secondary" label="Import a catalogue…" onClick={() => catalogueInput.current.click()} />
                    </Panel>
                    {!empty && (
                        <Panel>
                            <Heading level={4} style={{ marginTop: 0 }}>
                                Export
                            </Heading>
                            <p>Download the active dataset’s sources and reports.</p>
                            <Toolbar>
                                <Button appearance="secondary" label="Tailoring workbook (CSV)" onClick={() => exportFile('workbook')} />
                                <Button appearance="secondary" label="Statement of Applicability (CSV)" onClick={() => exportFile('soa')} />
                                <Button appearance="secondary" label="Profile (JSON)" disabled={!info.profile} onClick={() => exportFile('profile')} />
                                <Button appearance="secondary" label="Tailoring report (CSV)" disabled={!info.profile} onClick={() => exportFile('report')} />
                                <Button appearance="secondary" label="Catalogue (JSON)" onClick={() => exportFile('catalogue')} />
                                <Button appearance="secondary" label="Reference data (JSON)" onClick={() => exportFile('reference')} />
                            </Toolbar>
                            {info.profile && <Button appearance="destructive" label="Remove the organisation profile" onClick={async () => run('Remove the organisation profile', { ...(await current()), profile: null })} />}
                        </Panel>
                    )}
                </div>
            )}
            <Modal open={confirm} onRequestClose={() => setConfirm(false)} returnFocus={returnFocus} style={{ width: 560 }}>
                <Modal.Header title="Reload the demo dataset?" onRequestClose={() => setConfirm(false)} />
                <Modal.Body>
                    This replaces the app’s data for everyone, including any organisation profile, own catalogue and control edits, with the published demo dataset. Export your profile
                    or workbook first if you want to keep them. Control evidence results are not affected.
                </Modal.Body>
                <Modal.Footer>
                    <Button appearance="secondary" label="Cancel" onClick={() => setConfirm(false)} />
                    <Button
                        appearance="destructive"
                        label="Reload the demo dataset"
                        onClick={() => {
                            setConfirm(false);
                            run('Reload the demo dataset', { profile: null, ownCatalogue: false, ownReference: false });
                        }}
                    />
                </Modal.Footer>
            </Modal>
        </>
    );
}

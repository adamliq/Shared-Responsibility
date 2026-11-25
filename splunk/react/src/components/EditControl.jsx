import React, { useRef, useState } from 'react';
import Button from '@splunk/react-ui/Button';
import Message from '@splunk/react-ui/Message';
import Modal from '@splunk/react-ui/Modal';
import Select from '@splunk/react-ui/Select';
import Text from '@splunk/react-ui/Text';
import TextArea from '@splunk/react-ui/TextArea';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import { mv, PARTIES } from '../graph';
import { PROFILE_VERSION } from '../generated/engine';
import { applySources, loadSources } from './DataTab';
import { Field, Muted } from '../styles';

const CODES = ['R/A', 'A', 'R', 'S', 'C', 'I', '—', 'N/A'];
const OWNERS = ['CSC', 'CSP', 'SH-S', 'SH-D', 'INH', '3PTY', 'GAP', 'N/A'];
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Records edits as organisation-profile overrides (only differences from the baseline control),
 * so they show in tailoring reports and survive a new baseline, then rewrites the dataset.
 */
export function profileWithEdit(sources, id, form) {
    const profile = sources.profile ? clone(sources.profile) : { profile_version: PROFILE_VERSION, organisation: { name: '' } };
    profile.controls = profile.controls || {};
    const evidence = form.evidence.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((url) => ({ url }));
    const custom = (profile.custom_controls || []).find((c) => c.control_id === id);
    if (custom) {
        Object.assign(custom, { owner_assignment: form.owner_assignment, rasci: { ...form.rasci }, contract_ref: form.contract_ref || undefined, owner: form.owner || undefined, justification: form.justification || undefined, notes: form.notes || undefined, evidence: evidence.length ? evidence : undefined });
        if (form.applicable) delete custom.applicable;
        else custom.applicable = false;
        return JSON.parse(JSON.stringify(profile));
    }
    const base = sources.catalogue.controls.find((c) => c.control_id === id);
    const o = {};
    if (!form.applicable) o.applicable = false;
    if (form.justification) o.justification = form.justification;
    if (form.owner) o.owner = form.owner;
    if (form.owner_assignment !== base.owner_assignment) o.owner_assignment = form.owner_assignment;
    const rasci = Object.fromEntries(Object.entries(form.rasci).filter(([k, v]) => v !== (base.rasci || {})[k]));
    if (Object.keys(rasci).length) o.rasci = rasci;
    if (form.contract_ref && form.contract_ref !== (base.references || {}).provider_contractual_reference) o.contract_ref = form.contract_ref;
    if (evidence.length) o.evidence = evidence;
    if (form.notes) o.notes = form.notes;
    if (Object.keys(o).length) profile.controls[id] = o;
    else delete profile.controls[id];
    return profile;
}

export default function EditControl({ control, info, onClose, onSaved }) {
    const returnFocus = useRef(null);
    const [form, setForm] = useState(() => ({
        applicable: control.applicable !== 'No',
        justification: control.justification || '',
        owner: control.owner || '',
        owner_assignment: control.owner_assignment,
        rasci: Object.fromEntries(PARTIES.map((p) => [p.key, control[`rasci_${p.key}`] || '—'])),
        contract_ref: control.provider_contractual_reference || '',
        evidence: mv(control.evidence_links).join('\n'),
        notes: control.notes || '',
    }));
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const set = (patch) => setForm({ ...form, ...patch });
    const accountable = Object.values(form.rasci).filter((c) => c === 'A' || c === 'R/A').length;
    const responsible = Object.values(form.rasci).filter((c) => c === 'R' || c === 'R/A').length;

    async function save() {
        setError(null);
        setBusy('Preparing…');
        try {
            const sources = await loadSources(info);
            await applySources({ ...sources, profile: profileWithEdit(sources, control.control_id, form) }, (step, steps, name) => setBusy(`Writing ${name} (${step + 1} of ${steps})…`));
            await onSaved();
            onClose();
        } catch (e) {
            setError(e.message || String(e));
            setBusy(null);
        }
    }
    return (
        <Modal open onRequestClose={onClose} returnFocus={returnFocus} style={{ width: 760 }}>
            <Modal.Header title={`Edit ${control.control_id} · ${control.objective}`} onRequestClose={onClose} />
            <Modal.Body>
                <Muted>Changes are stored as your organisation profile (differences from the baseline) and apply to everyone using the app.</Muted>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                    <Field>
                        Applicability
                        <Select value={form.applicable ? 'Yes' : 'No'} onChange={(e, { value }) => set({ applicable: value === 'Yes' })}>
                            <Select.Option label="In scope" value="Yes" />
                            <Select.Option label="Out of scope" value="No" />
                        </Select>
                    </Field>
                    <Field>
                        Owner assignment
                        <Select value={form.owner_assignment} onChange={(e, { value }) => set({ owner_assignment: value })}>
                            {OWNERS.map((o) => (
                                <Select.Option key={o} label={o} value={o} />
                            ))}
                        </Select>
                    </Field>
                    <Field style={{ gridColumn: '1 / -1' }}>
                        Justification{!form.applicable && !form.justification ? ' (expected when out of scope)' : ''}
                        <TextArea value={form.justification} rowsMin={2} onChange={(e, { value }) => set({ justification: value })} />
                    </Field>
                    {PARTIES.map((p) => (
                        <Field key={p.key}>
                            RASCI · {p.label}
                            <Select value={form.rasci[p.key]} onChange={(e, { value }) => set({ rasci: { ...form.rasci, [p.key]: value } })}>
                                {CODES.map((c) => (
                                    <Select.Option key={c} label={c} value={c} />
                                ))}
                            </Select>
                        </Field>
                    ))}
                    {form.applicable && (accountable !== 1 || responsible < 1) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Message type="warning">RASCI needs exactly one accountable and at least one responsible party.</Message>
                        </div>
                    )}
                    <Field>
                        Owner (person or team)
                        <Text value={form.owner} onChange={(e, { value }) => set({ owner: value })} />
                    </Field>
                    <Field>
                        Contract reference
                        <Text value={form.contract_ref} onChange={(e, { value }) => set({ contract_ref: value })} />
                    </Field>
                    <Field style={{ gridColumn: '1 / -1' }}>
                        Evidence links (one URL per line)
                        <TextArea value={form.evidence} rowsMin={2} onChange={(e, { value }) => set({ evidence: value })} />
                    </Field>
                    <Field style={{ gridColumn: '1 / -1' }}>
                        Notes
                        <TextArea value={form.notes} rowsMin={2} onChange={(e, { value }) => set({ notes: value })} />
                    </Field>
                </div>
                {error && <Message type="error">{error}</Message>}
            </Modal.Body>
            <Modal.Footer>
                {busy && (
                    <span style={{ marginRight: 'auto' }}>
                        <WaitSpinner /> <Muted>{busy}</Muted>
                    </span>
                )}
                <Button appearance="secondary" label="Cancel" onClick={onClose} disabled={!!busy} />
                <Button appearance="primary" label="Save" onClick={save} disabled={!!busy} />
            </Modal.Footer>
        </Modal>
    );
}

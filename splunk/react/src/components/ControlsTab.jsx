import React, { useMemo, useState } from 'react';
import Button from '@splunk/react-ui/Button';
import Chip from '@splunk/react-ui/Chip';
import Paginator from '@splunk/react-ui/Paginator';
import Select from '@splunk/react-ui/Select';
import Table from '@splunk/react-ui/Table';
import Text from '@splunk/react-ui/Text';
import { mv, PARTIES } from '../graph';
import { Field, Grid2, Lead, Muted, Toolbar } from '../styles';

const PAGE = 25;
const STATUS = { pass: 'success', fail: 'error', no_evidence: 'warning' };
const COLUMNS = [
    { key: 'control_id', label: 'ID', width: 90 },
    { key: 'domain', label: 'Domain', width: 200 },
    { key: 'objective', label: 'Objective' },
    { key: 'owner_assignment', label: 'Owner', width: 80 },
    { key: 'accountable_party', label: 'Accountable', width: 170 },
    { key: 'ism_mapping_strength', label: 'ISM', width: 110 },
    { key: 'evidence', label: 'Evidence', width: 110 },
];

export function StatusChip({ status }) {
    if (!status) return <Muted>—</Muted>;
    return <Chip appearance={STATUS[status] || 'outline'}>{status.replace('_', ' ')}</Chip>;
}

export default function ControlsTab({ data, filters, setFilters }) {
    const [sort, setSort] = useState({ key: 'control_id', dir: 'asc' });
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState(null);
    const set = (patch) => {
        setFilters({ ...filters, ...patch });
        setPage(1);
    };
    const domainsOfLayer = useMemo(
        () => (filters.layer ? new Set(data.layerDomains.filter((r) => r.layer_id === filters.layer).map((r) => r.domain)) : null),
        [data, filters.layer]
    );
    const rows = useMemo(() => {
        const q = filters.q.trim().toLowerCase();
        const out = data.controls.filter((c) => {
            if (domainsOfLayer && !domainsOfLayer.has(c.domain)) return false;
            if (filters.owner !== 'All' && c.owner_assignment !== filters.owner) return false;
            if (filters.ism !== 'All' && c.ism_mapping_strength !== filters.ism) return false;
            if (filters.party !== 'All') {
                const code = c[`rasci_${filters.party}`] || '—';
                if (filters.role === 'Any' ? ['—', 'N/A', ''].includes(code) : !code.split('/').includes(filters.role)) return false;
            }
            if (q && !`${c.control_id} ${c.domain} ${c.objective} ${c.test} ${c.expected_outcome}`.toLowerCase().includes(q)) return false;
            return true;
        });
        const val = (c) => (sort.key === 'evidence' ? (data.evidenceByControl.get(c.control_id) || {}).status || '' : c[sort.key] || '');
        out.sort((a, b) => String(val(a)).localeCompare(String(val(b)), undefined, { numeric: true }) * (sort.dir === 'asc' ? 1 : -1));
        return out;
    }, [data, filters, domainsOfLayer, sort]);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const shown = rows.slice((page - 1) * PAGE, page * PAGE);
    const layerName = filters.layer ? (data.layers.find((l) => l.layer_id === filters.layer) || {}).layer : null;
    const owners = [...new Set(data.controls.map((c) => c.owner_assignment))].sort();

    return (
        <>
            <Lead>
                The <code>srm_controls</code> lookup with RASCI assignments and the latest evidence result from the <code>srm_evidence</code> KV Store collection. Expand a row for its test, outcome and standards references.
            </Lead>
            <Toolbar>
                <Field $width={280}>
                    Search
                    <Text value={filters.q} placeholder="ID, objective, test…" onChange={(e, { value }) => set({ q: value })} canClear />
                </Field>
                <Field $width={140}>
                    Owner
                    <Select value={filters.owner} onChange={(e, { value }) => set({ owner: value })}>
                        <Select.Option label="All owners" value="All" />
                        {owners.map((o) => (
                            <Select.Option key={o} label={o} value={o} />
                        ))}
                    </Select>
                </Field>
                <Field $width={190}>
                    RASCI party
                    <Select value={filters.party} onChange={(e, { value }) => set({ party: value })}>
                        <Select.Option label="All parties" value="All" />
                        {PARTIES.map((p) => (
                            <Select.Option key={p.key} label={p.label} value={p.key} />
                        ))}
                    </Select>
                </Field>
                <Field $width={130}>
                    Role
                    <Select value={filters.role} disabled={filters.party === 'All'} onChange={(e, { value }) => set({ role: value })}>
                        {['Any', 'R', 'A', 'S', 'C', 'I'].map((r) => (
                            <Select.Option key={r} label={r === 'Any' ? 'Any role' : r} value={r} />
                        ))}
                    </Select>
                </Field>
                <Field $width={150}>
                    ISM mapping
                    <Select value={filters.ism} onChange={(e, { value }) => set({ ism: value })}>
                        {['All', 'Direct', 'Contextual', 'Not applicable'].map((r) => (
                            <Select.Option key={r} label={r === 'All' ? 'All mappings' : r} value={r} />
                        ))}
                    </Select>
                </Field>
                {layerName && <Button appearance="secondary" label={`Layer: ${layerName} ✕`} onClick={() => set({ layer: null })} />}
            </Toolbar>
            <p>
                <strong>{rows.length}</strong> <Muted>of {data.controls.length} controls</Muted>
            </p>
            <Table stripeRows rowExpansion="controlled" headType="docked">
                <Table.Head>
                    {COLUMNS.map((col) => (
                        <Table.HeadCell
                            key={col.key}
                            width={col.width}
                            sortKey={col.key}
                            sortDir={sort.key === col.key ? sort.dir : 'none'}
                            onSort={(e, { sortKey }) => setSort({ key: sortKey, dir: sort.key === sortKey && sort.dir === 'asc' ? 'desc' : 'asc' })}
                        >
                            {col.label}
                        </Table.HeadCell>
                    ))}
                </Table.Head>
                <Table.Body>
                    {shown.map((c) => {
                        const ev = data.evidenceByControl.get(c.control_id);
                        return (
                            <Table.Row
                                key={c.control_id}
                                expanded={expanded === c.control_id}
                                onExpansion={() => setExpanded(expanded === c.control_id ? null : c.control_id)}
                                expansionRow={
                                    <Table.Row key={`${c.control_id}-x`}>
                                        <Table.Cell style={{ borderTop: 'none' }} colSpan={COLUMNS.length + 1}>
                                            <Grid2>
                                                <dt>Expected outcome</dt>
                                                <dd>{c.expected_outcome}</dd>
                                                <dt>Test</dt>
                                                <dd>{c.test}</dd>
                                                <dt>Service model</dt>
                                                <dd>{c.service_model}</dd>
                                                <dt>RASCI</dt>
                                                <dd>
                                                    {PARTIES.map((p) => (
                                                        <span key={p.key} style={{ marginRight: 14 }}>
                                                            {p.label} <strong>{c[`rasci_${p.key}`]}</strong>
                                                        </span>
                                                    ))}
                                                </dd>
                                                <dt>CSA CCM</dt>
                                                <dd>{mv(c.csa_ccm_v4_1_control_ids).join(', ') || '—'}</dd>
                                                <dt>ISO/IEC 27017</dt>
                                                <dd>{mv(c.iso_iec_27017_2026).join(', ') || '—'}</dd>
                                                <dt>ISM</dt>
                                                <dd>{mv(c.ism_v2026_09_4).join(', ') || '—'}</dd>
                                                {ev && (
                                                    <>
                                                        <dt>Latest evidence</dt>
                                                        <dd>
                                                            <StatusChip status={ev.status} /> {ev.evidence}{' '}
                                                            <Muted>({new Date(ev.checked_at * 1000).toLocaleString()})</Muted>
                                                        </dd>
                                                    </>
                                                )}
                                            </Grid2>
                                        </Table.Cell>
                                    </Table.Row>
                                }
                            >
                                <Table.Cell>
                                    <strong>{c.control_id}</strong>
                                </Table.Cell>
                                <Table.Cell>{c.domain}</Table.Cell>
                                <Table.Cell>{c.objective}</Table.Cell>
                                <Table.Cell>{c.owner_assignment}</Table.Cell>
                                <Table.Cell>{mv(c.accountable_party).join(', ')}</Table.Cell>
                                <Table.Cell>{c.ism_mapping_strength}</Table.Cell>
                                <Table.Cell>
                                    <StatusChip status={ev && ev.status} />
                                </Table.Cell>
                            </Table.Row>
                        );
                    })}
                </Table.Body>
            </Table>
            <div style={{ marginTop: 12 }}>
                <Paginator current={page} totalPages={pages} onChange={(e, { page: p }) => setPage(p)} />
            </div>
        </>
    );
}

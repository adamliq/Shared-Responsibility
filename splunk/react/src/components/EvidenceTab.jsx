import React, { useState } from 'react';
import Button from '@splunk/react-ui/Button';
import Message from '@splunk/react-ui/Message';
import Table from '@splunk/react-ui/Table';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import { loadEvidence, runEvidenceCheck } from '../data';
import { Lead, Muted, Stat, Toolbar } from '../styles';
import { StatusChip } from './ControlsTab';

export default function EvidenceTab({ data, onEvidence }) {
    const [running, setRunning] = useState(new Set());
    const [error, setError] = useState(null);
    const checks = data.evidenceChecks;
    const latest = (id) => data.evidenceByControl.get(id);
    const count = (s) => checks.filter((c) => ((latest(c.control_id) || {}).status || 'not_run') === s).length;

    async function run(list) {
        setError(null);
        setRunning(new Set(list.map((c) => c.control_id)));
        try {
            for (const check of list) {
                // Sequential so each check's KV Store write lands before the next starts.
                // eslint-disable-next-line no-await-in-loop
                await runEvidenceCheck(check.saved_search);
                setRunning((prev) => {
                    const next = new Set(prev);
                    next.delete(check.control_id);
                    return next;
                });
            }
            onEvidence(await loadEvidence());
        } catch (e) {
            setError(e.message || String(e));
        } finally {
            setRunning(new Set());
        }
    }

    return (
        <>
            <Lead>
                Each check is a scheduled saved search that evidences a control from data Splunk already holds and appends its result to the <code>srm_evidence</code> KV Store
                collection. Run them on demand here; your role needs permission to write to the collection.
            </Lead>
            <Stat>
                <div>
                    <strong style={{ color: '#1C9B3E' }}>{count('pass')}</strong>Passing
                </div>
                <div>
                    <strong style={{ color: '#D0372B' }}>{count('fail')}</strong>Failing
                </div>
                <div>
                    <strong style={{ color: '#C08A00' }}>{count('no_evidence') + count('not_run')}</strong>No evidence or not run
                </div>
            </Stat>
            <Toolbar>
                <Button appearance="primary" label={running.size ? 'Running…' : 'Run all checks'} disabled={running.size > 0} onClick={() => run(checks)} />
                {running.size > 0 && (
                    <span>
                        <WaitSpinner /> <Muted>{running.size} remaining</Muted>
                    </span>
                )}
            </Toolbar>
            {error && <Message type="error">{error}</Message>}
            <Table stripeRows>
                <Table.Head>
                    <Table.HeadCell width={90}>Control</Table.HeadCell>
                    <Table.HeadCell>Objective</Table.HeadCell>
                    <Table.HeadCell>Check</Table.HeadCell>
                    <Table.HeadCell width={120}>Status</Table.HeadCell>
                    <Table.HeadCell>Evidence</Table.HeadCell>
                    <Table.HeadCell width={170}>Last checked</Table.HeadCell>
                    <Table.HeadCell width={110} />
                </Table.Head>
                <Table.Body>
                    {checks.map((c) => {
                        const ev = latest(c.control_id);
                        const control = data.controlById.get(c.control_id) || {};
                        return (
                            <Table.Row key={c.control_id}>
                                <Table.Cell>
                                    <strong>{c.control_id}</strong>
                                </Table.Cell>
                                <Table.Cell>{control.objective}</Table.Cell>
                                <Table.Cell>
                                    {c.check}
                                    <br />
                                    <Muted>{c.method}</Muted>
                                </Table.Cell>
                                <Table.Cell>{running.has(c.control_id) ? <WaitSpinner /> : <StatusChip status={ev ? ev.status : 'not_run'} />}</Table.Cell>
                                <Table.Cell>{ev ? ev.evidence : <Muted>Not run yet</Muted>}</Table.Cell>
                                <Table.Cell>{ev ? new Date(ev.checked_at * 1000).toLocaleString() : '—'}</Table.Cell>
                                <Table.Cell>
                                    <Button label="Run now" appearance="secondary" disabled={running.size > 0} onClick={() => run([c])} />
                                </Table.Cell>
                            </Table.Row>
                        );
                    })}
                </Table.Body>
            </Table>
        </>
    );
}

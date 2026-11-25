import React, { useEffect, useRef, useState } from 'react';
import Heading from '@splunk/react-ui/Heading';
import Message from '@splunk/react-ui/Message';
import Modal from '@splunk/react-ui/Modal';
import TabBar from '@splunk/react-ui/TabBar';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import { loadAll } from './data';
import { mv, PARTIES } from './graph';
import { Grid2, Lead, Muted, Page } from './styles';
import AllocationTab from './components/AllocationTab';
import ControlsTab from './components/ControlsTab';
import EvidenceTab from './components/EvidenceTab';
import GraphTab from './components/GraphTab';
import { StatusChip } from './components/ControlsTab';

const DEFAULT_FILTERS = { q: '', owner: 'All', party: 'All', role: 'Any', ism: 'All', layer: null };

export default function App() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState([0, 1]);
    const [tab, setTab] = useState('allocation');
    const [model, setModel] = useState('All');
    const [layer, setLayer] = useState(null);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [openControl, setOpenControl] = useState(null);
    const returnFocus = useRef(null);

    useEffect(() => {
        loadAll((done, total) => setProgress([done, total]))
            .then(setData)
            .catch((e) => setError(e.message || String(e)));
    }, []);

    const setEvidence = (rows) =>
        setData((d) => {
            const evidence = rows.map((r) => ({ ...r, metric: Number(r.metric), checked_at: Number(r.checked_at) }));
            return { ...d, evidence, evidenceByControl: new Map(evidence.map((e) => [e.control_id, e])) };
        });

    if (error) {
        return (
            <Page>
                <Message type="error">Could not load the Shared Responsibility lookups: {error}</Message>
            </Page>
        );
    }
    if (!data) {
        return (
            <Page>
                <WaitSpinner size="medium" /> <Muted>Loading lookups from Splunk… {progress[0]} of {progress[1]}</Muted>
            </Page>
        );
    }
    const control = openControl && data.controlById.get(openControl);
    const ev = control && data.evidenceByControl.get(control.control_id);
    return (
        <Page>
            <Heading level={1}>Shared Responsibility Explorer</Heading>
            <Lead>
                {data.controls.length.toLocaleString()} atomic controls across {data.layers.length} control layers and {data.serviceModels.length} service models, read
                live from this app's lookups and evidence collection.
            </Lead>
            <TabBar activeTabId={tab} onChange={(e, { selectedTabId }) => setTab(selectedTabId)}>
                <TabBar.Tab label="Allocation" tabId="allocation" />
                <TabBar.Tab label="Controls" tabId="controls" />
                <TabBar.Tab label="Evidence" tabId="evidence" />
                <TabBar.Tab label="Graph & Cypher" tabId="graph" />
            </TabBar>
            <div style={{ marginTop: 16 }}>
                {tab === 'allocation' && (
                    <AllocationTab
                        data={data}
                        model={model}
                        setModel={setModel}
                        layer={layer}
                        setLayer={setLayer}
                        onShowControls={({ layer: l }) => {
                            setFilters({ ...DEFAULT_FILTERS, layer: l });
                            setTab('controls');
                        }}
                    />
                )}
                {tab === 'controls' && <ControlsTab data={data} filters={filters} setFilters={setFilters} />}
                {tab === 'evidence' && <EvidenceTab data={data} onEvidence={setEvidence} />}
                {tab === 'graph' && <GraphTab data={data} onOpenControl={setOpenControl} />}
            </div>
            <Modal open={!!control} onRequestClose={() => setOpenControl(null)} returnFocus={returnFocus} style={{ width: 760 }}>
                {control && (
                    <>
                        <Modal.Header title={`${control.control_id} · ${control.objective}`} onRequestClose={() => setOpenControl(null)} />
                        <Modal.Body>
                            <Grid2>
                                <dt>Domain</dt>
                                <dd>{control.domain}</dd>
                                <dt>Expected outcome</dt>
                                <dd>{control.expected_outcome}</dd>
                                <dt>Test</dt>
                                <dd>{control.test}</dd>
                                <dt>Owner</dt>
                                <dd>{control.owner_assignment}</dd>
                                <dt>RASCI</dt>
                                <dd>
                                    {PARTIES.map((p) => (
                                        <span key={p.key} style={{ marginRight: 14 }}>
                                            {p.label} <strong>{control[`rasci_${p.key}`]}</strong>
                                        </span>
                                    ))}
                                </dd>
                                <dt>CSA CCM</dt>
                                <dd>{mv(control.csa_ccm_v4_1_control_ids).join(', ') || '—'}</dd>
                                <dt>ISM</dt>
                                <dd>{mv(control.ism_v2026_09_4).join(', ') || '—'}</dd>
                                <dt>Evidence</dt>
                                <dd>{ev ? <><StatusChip status={ev.status} /> {ev.evidence}</> : <Muted>No automated check</Muted>}</dd>
                            </Grid2>
                        </Modal.Body>
                    </>
                )}
            </Modal>
        </Page>
    );
}

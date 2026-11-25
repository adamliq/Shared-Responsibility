import React, { useMemo, useState } from 'react';
import Button from '@splunk/react-ui/Button';
import Message from '@splunk/react-ui/Message';
import Select from '@splunk/react-ui/Select';
import Table from '@splunk/react-ui/Table';
import TabBar from '@splunk/react-ui/TabBar';
import TextArea from '@splunk/react-ui/TextArea';
import { CY, CY_EXAMPLES } from '../generated/engine';
import { buildGraph, NODE_TYPES } from '../graph';
import { Field, Grid2, Lead, Mono, Muted, Panel, Split, Toolbar } from '../styles';
import ForceGraph, { TYPE_COLORS } from './ForceGraph';

const MAX_ROWS = 500;
const MAX_NODES = 300;

function fmt(v) {
    if (v === null || v === undefined) return 'null';
    if (CY.isNode(v)) return `(:${v.labels[0]} ${v.props.name})`;
    if (CY.isRel(v)) return `[:${v.type}${Object.keys(v.props).length ? ` ${JSON.stringify(v.props)}` : ''}]`;
    if (CY.isPath(v)) return v.nodes.map((n) => n.props.name).join(' → ');
    if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

/** Collects nodes and relationships from query results, adding relationships between returned nodes. */
function resultGraph(result, db) {
    const ns = new Map();
    const rs = new Map();
    const collect = (v) => {
        if (v == null) return;
        if (CY.isNode(v)) ns.set(v.id, v);
        else if (CY.isRel(v)) {
            rs.set(v.id, v);
            ns.set(v.start.id, v.start);
            ns.set(v.end.id, v.end);
        } else if (CY.isPath(v)) {
            v.nodes.forEach((n) => ns.set(n.id, n));
            v.rels.forEach((r) => rs.set(r.id, r));
        } else if (Array.isArray(v)) v.forEach(collect);
    };
    result.rows.forEach((row) => row.forEach(collect));
    if (!ns.size) return null;
    const list = [...ns.values()].slice(0, MAX_NODES);
    const keep = new Set(list.map((n) => n.id));
    db.rels.forEach((r) => {
        if (keep.has(r.start.id) && keep.has(r.end.id) && rs.size < 2000) rs.set(r.id, r);
    });
    return {
        truncated: ns.size > MAX_NODES,
        nodes: list.map((n) => {
            const { id, name, ...props } = n.props;
            return { id: n.id, type: n.labels[0], caption: name, props, r: n.labels[0] === 'Control' ? 16 : n.labels[0] === 'Party' ? 30 : 24 };
        }),
        edges: [...rs.values()]
            .filter((r) => keep.has(r.start.id) && keep.has(r.end.id))
            .map((r) => ({ s: r.start.id, t: r.end.id, type: r.type, props: r.props, caption: r.props.rasci ? `${r.type} · ${r.props.rasci}` : r.type })),
    };
}

export default function GraphTab({ data, onOpenControl }) {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState('graph');
    const [expanded, setExpanded] = useState(new Set());
    const [hidden, setHidden] = useState(new Set());
    const [inspect, setInspect] = useState(null);
    const [pinned, setPinned] = useState(null);

    const db = useMemo(() => CY.db(buildGraph(data, { allControls: true })), [data]);
    const overview = useMemo(() => buildGraph(data, { expandedDomains: expanded }), [data, expanded]);
    const shownOverview = useMemo(() => {
        if (!hidden.size) return overview;
        const keep = new Set(overview.nodes.filter((n) => !hidden.has(n.type)).map((n) => n.id));
        return { nodes: overview.nodes.filter((n) => keep.has(n.id)), edges: overview.edges.filter((e) => keep.has(e.s) && keep.has(e.t)) };
    }, [overview, hidden]);
    const rg = useMemo(() => (result ? resultGraph(result, db) : null), [result, db]);

    function run(q) {
        setQuery(q);
        setError(null);
        setPinned(null);
        if (!q.trim()) {
            setResult(null);
            return;
        }
        try {
            const r = CY.run(q, db);
            setResult(r);
            setMode(resultGraph(r, db) ? 'graph' : 'table');
        } catch (e) {
            const before = q.slice(0, e.pos || 0);
            const line = before.split('\n').length;
            const col = before.length - before.lastIndexOf('\n');
            setError(e.cypher && e.pos != null ? `${e.message} (line ${line}, column ${col})` : e.message);
            setResult(null);
        }
    }
    function select(node) {
        if (node.type === 'Control') {
            onOpenControl(node.caption);
            return;
        }
        setPinned(node);
        if (!result && node.type === 'Domain') {
            const next = new Set(expanded);
            if (next.has(node.caption)) next.delete(node.caption);
            else next.add(node.caption);
            setExpanded(next);
        }
    }
    const graph = result ? rg : shownOverview;
    const panelNode = inspect || pinned;
    const relTypes = useMemo(() => {
        const counts = {};
        graph && graph.edges.forEach((e) => (counts[e.type] = (counts[e.type] || 0) + 1));
        return counts;
    }, [graph]);

    return (
        <>
            <Lead>
                Read-only Cypher over the combined graph built live from the app's lookups ({db.nodes.length.toLocaleString()} nodes ·{' '}
                {db.rels.length.toLocaleString()} relationships). Without a query, the overview graph is shown; select a domain to expand its controls.
            </Lead>
            <Toolbar>
                <Field $width={720} style={{ flex: 1 }}>
                    Cypher query
                    <TextArea
                        value={query}
                        rowsMin={3}
                        rowsMax={10}
                        placeholder="MATCH (p:Party)-[r:ACCOUNTABLE_FOR]->(d:Domain) RETURN p, r, d"
                        onChange={(e, { value }) => setQuery(value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                run(query);
                            }
                        }}
                        style={{ fontFamily: 'monospace' }}
                    />
                </Field>
                <Field $width={260}>
                    Examples
                    <Select value="" onChange={(e, { value }) => run(CY_EXAMPLES[value].q)}>
                        <Select.Option label="Choose an example…" value="" />
                        {CY_EXAMPLES.map((x, i) => (
                            <Select.Option key={x.label} label={x.label} value={i} />
                        ))}
                    </Select>
                </Field>
                <Button appearance="primary" label="Run" onClick={() => run(query)} />
                <Button appearance="secondary" label="Clear" onClick={() => run('')} />
            </Toolbar>
            {error && <Message type="error">{error}</Message>}
            {result && (
                <Toolbar>
                    <Muted>
                        {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · {result.ms.toFixed(1)} ms
                        {rg ? ` · ${rg.nodes.length} nodes · ${rg.edges.length} relationships${rg.truncated ? ` (first ${MAX_NODES} nodes)` : ''}` : ''}
                    </Muted>
                    <TabBar activeTabId={mode} onChange={(e, { selectedTabId }) => setMode(selectedTabId)}>
                        {rg && <TabBar.Tab label="Graph" tabId="graph" />}
                        <TabBar.Tab label="Table" tabId="table" />
                    </TabBar>
                </Toolbar>
            )}
            {result && mode === 'table' ? (
                <Table stripeRows headType="docked">
                    <Table.Head>
                        {result.columns.map((c) => (
                            <Table.HeadCell key={c}>{c}</Table.HeadCell>
                        ))}
                    </Table.Head>
                    <Table.Body>
                        {result.rows.slice(0, MAX_ROWS).map((row, i) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <Table.Row key={i}>
                                {row.map((v, j) => (
                                    // eslint-disable-next-line react/no-array-index-key
                                    <Table.Cell key={j}>{fmt(v)}</Table.Cell>
                                ))}
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table>
            ) : (
                graph && (
                    <Split>
                        <ForceGraph
                            key={result ? `result:${query}:${result.ms}` : 'overview'}
                            nodes={graph.nodes}
                            edges={graph.edges}
                            selected={pinned ? [pinned.id] : []}
                            onSelect={select}
                            onHover={setInspect}
                        />
                        <Panel>
                            {panelNode ? (
                                <>
                                    <span style={{ background: TYPE_COLORS[panelNode.type], color: '#102a37', borderRadius: 999, padding: '2px 9px', fontWeight: 700 }}>
                                        {panelNode.type}
                                    </span>
                                    <h3 style={{ margin: '10px 0' }}>{panelNode.caption}</h3>
                                    <Grid2>
                                        {Object.entries(panelNode.props || {})
                                            .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
                                            .map(([k, v]) => (
                                                <React.Fragment key={k}>
                                                    <dt>{k}</dt>
                                                    <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                                                </React.Fragment>
                                            ))}
                                    </Grid2>
                                    {!result && panelNode.type === 'Domain' && (
                                        <p>
                                            <Muted>Select the domain again to {expanded.has(panelNode.caption) ? 'collapse' : 'expand'} its controls.</Muted>
                                        </p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <h3 style={{ marginTop: 0 }}>{result ? 'Query result' : 'Overview'}</h3>
                                    <Muted>{result ? 'Hover a node to inspect it.' : 'Select a type to show or hide it.'}</Muted>
                                    <p style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {(result ? [...new Set(graph.nodes.map((n) => n.type))] : NODE_TYPES.filter((t) => overview.nodes.some((n) => n.type === t))).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                disabled={!!result}
                                                aria-pressed={!hidden.has(t)}
                                                onClick={() => {
                                                    const next = new Set(hidden);
                                                    if (next.has(t)) next.delete(t);
                                                    else next.add(t);
                                                    setHidden(next);
                                                }}
                                                style={{
                                                    border: 0,
                                                    borderRadius: 999,
                                                    padding: '2px 9px',
                                                    fontWeight: 700,
                                                    cursor: result ? 'default' : 'pointer',
                                                    background: hidden.has(t) ? '#31525f' : TYPE_COLORS[t],
                                                    color: hidden.has(t) ? '#9db8c4' : '#102a37',
                                                    textDecoration: hidden.has(t) ? 'line-through' : 'none',
                                                }}
                                            >
                                                {t} ({graph.nodes.filter((n) => n.type === t).length || overview.nodes.filter((n) => n.type === t).length})
                                            </button>
                                        ))}
                                    </p>
                                    <Mono>
                                        {Object.entries(relTypes)
                                            .map(([t, c]) => `${t} (${c})`)
                                            .join('\n')}
                                    </Mono>
                                </>
                            )}
                        </Panel>
                    </Split>
                )
            )}
        </>
    );
}

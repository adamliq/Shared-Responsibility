import React, { useMemo } from 'react';
import styled from 'styled-components';
import { variables } from '@splunk/themes';
import Button from '@splunk/react-ui/Button';
import Heading from '@splunk/react-ui/Heading';
import Select from '@splunk/react-ui/Select';
import { Field, Lead, Muted, Panel, PARTY_COLORS, SHARE_PARTIES, Split, Stat, Toolbar } from '../styles';

const Matrix = styled.table`
    border-collapse: separate;
    border-spacing: 3px;
    width: 100%;
    min-width: 960px;
    font-size: ${variables.fontSizeSmall};
    th {
        font-weight: 600;
        color: ${variables.contentColorMuted};
        padding: 4px;
    }
    th.layer {
        text-align: left;
        color: ${variables.contentColorDefault};
        min-width: 240px;
    }
    td button {
        all: unset;
        cursor: pointer;
        display: block;
        width: 100%;
        height: 22px;
        border-radius: 4px;
        overflow: hidden;
        box-sizing: border-box;
        outline-offset: 1px;
    }
    td button:focus-visible,
    td button[aria-pressed='true'] {
        outline: 2px solid ${variables.contentColorActive};
    }
    tr.active th.layer {
        color: ${variables.contentColorActive};
    }
`;
const Bar = styled.span`
    display: flex;
    height: 100%;
    & > i {
        display: block;
        height: 100%;
    }
`;

export default function AllocationTab({ data, model, setModel, layer, setLayer, onShowControls }) {
    const models = data.serviceModels.map((m) => m.service_model);
    const shares = useMemo(() => {
        const map = new Map();
        data.layerShares.forEach((r) => map.set(`${r.layer_id}|${r.service_model}`, r));
        return map;
    }, [data]);
    const layerInfo = data.layers.find((l) => l.layer_id === layer);
    const domains = data.layerDomains.filter((r) => r.layer_id === layer).map((r) => r.domain);
    const controls = layer ? data.controls.filter((c) => domains.includes(c.domain)) : data.controls;
    const rows = data.layerShares.filter((r) => (!layer || r.layer_id === layer) && (model === 'All' || r.service_model === model));
    const split = SHARE_PARTIES.map((p) => ({ ...p, value: rows.length ? Math.round(rows.reduce((s, r) => s + r[p.field], 0) / rows.length) : 0 }));
    const definition = data.serviceModels.find((m) => m.service_model === model);

    return (
        <>
            <Lead>
                Each cell splits a control layer's responsibility between customer governance, the customer SOC and the provider under a service model.
                Data comes from the <code>srm_layer_shares</code> lookup.
            </Lead>
            <Toolbar>
                <Field $width={200}>
                    Service model
                    <Select value={model} onChange={(e, { value }) => setModel(value)}>
                        <Select.Option label="All models" value="All" />
                        {models.map((m) => (
                            <Select.Option key={m} label={m} value={m} />
                        ))}
                    </Select>
                </Field>
                {layer && <Button label="Clear layer" appearance="secondary" onClick={() => setLayer(null)} />}
            </Toolbar>
            <Split>
                <Panel>
                    <Matrix>
                        <thead>
                            <tr>
                                <th className="layer">Control layer</th>
                                {models.map((m) => (
                                    <th key={m} style={model === m ? { color: 'inherit' } : undefined}>
                                        {m === 'On-premises' ? 'On-prem' : m}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.layers.map((l) => (
                                <tr key={l.layer_id} className={layer === l.layer_id ? 'active' : ''}>
                                    <th className="layer">
                                        <Button appearance="subtle" label={l.layer} onClick={() => setLayer(layer === l.layer_id ? null : l.layer_id)} />
                                    </th>
                                    {models.map((m) => {
                                        const r = shares.get(`${l.layer_id}|${m}`);
                                        if (!r) return <td key={m} />;
                                        const text = `${l.layer} · ${m}: customer ${r.customer_pct}%, SOC ${r.soc_pct}%, provider ${r.provider_pct}%`;
                                        return (
                                            <td key={m} style={model !== 'All' && model !== m ? { opacity: 0.35 } : undefined}>
                                                    <button
                                                        type="button"
                                                        title={text}
                                                        aria-label={text}
                                                        aria-pressed={layer === l.layer_id && model === m}
                                                        onClick={() => {
                                                            setLayer(l.layer_id);
                                                            setModel(m);
                                                        }}
                                                    >
                                                        <Bar>
                                                            {SHARE_PARTIES.map((p) => (
                                                                <i key={p.key} style={{ width: `${r[p.field]}%`, background: PARTY_COLORS[p.key] }} />
                                                            ))}
                                                        </Bar>
                                                    </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </Matrix>
                    <p>
                        {SHARE_PARTIES.map((p) => (
                            <span key={p.key} style={{ marginRight: 16 }}>
                                <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: PARTY_COLORS[p.key], marginRight: 6 }} />
                                {p.label}
                            </span>
                        ))}
                    </p>
                </Panel>
                <Panel>
                    <Heading level={3}>{layerInfo ? layerInfo.layer : 'All control layers'}</Heading>
                    <Muted>{model === 'All' ? 'Average of all service models' : model}</Muted>
                    <p>{layerInfo ? layerInfo.scope : definition ? definition.definition : 'Select a layer or a cell to inspect its split.'}</p>
                    <Stat>
                        {split.map((p) => (
                            <div key={p.key}>
                                <strong style={{ color: PARTY_COLORS[p.key] }}>{p.value}%</strong>
                                {p.label}
                            </div>
                        ))}
                    </Stat>
                    <p>
                        <strong>{controls.length}</strong> <Muted>atomic controls{layer ? ` in ${domains.length} domain${domains.length === 1 ? '' : 's'}` : ''}</Muted>
                    </p>
                    <Button appearance="primary" label="Show these controls" onClick={() => onShowControls({ layer })} />
                </Panel>
            </Split>
        </>
    );
}

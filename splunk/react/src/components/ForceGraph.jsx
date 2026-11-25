import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { variables } from '@splunk/themes';
import Button from '@splunk/react-ui/Button';
import { grLayout, GR_PALETTE } from '../generated/engine';
import { NODE_TYPES } from '../graph';

export const TYPE_COLORS = Object.fromEntries(NODE_TYPES.map((t, i) => [t, GR_PALETTE[i % GR_PALETTE.length]]));
const W = 1200;
const H = 700;

const Wrap = styled.div`
    position: relative;
    border: 1px solid ${variables.borderColorWeak};
    border-radius: ${variables.borderRadius};
    background: ${variables.backgroundColorSection};
    overflow: hidden;
    svg {
        display: block;
        width: 100%;
        height: auto;
        touch-action: none;
        user-select: none;
    }
    .edge line {
        stroke: #a5abb6;
        stroke-width: 1.3;
    }
    .edge.hl line {
        stroke: #ffc55a;
        stroke-width: 2.4;
    }
    .edge text {
        font-size: 8.5px;
        fill: ${variables.contentColorDefault};
        paint-order: stroke;
        stroke: ${variables.backgroundColorSection};
        stroke-width: 3px;
        display: none;
    }
    .edge.hl text {
        display: block;
    }
    .node {
        cursor: grab;
    }
    .node text {
        font-size: 8.6px;
        font-weight: 700;
        fill: #102a37;
        pointer-events: none;
    }
    .dim {
        opacity: 0.15;
    }
`;

function wrapCaption(s, max = 11) {
    const out = [''];
    String(s)
        .split(/\s+/)
        .forEach((w) => {
            const cur = out[out.length - 1];
            if (`${cur} ${w}`.trim().length > max && cur) out.push(w);
            else out[out.length - 1] = `${cur} ${w}`.trim();
        });
    if (out.length > 3) {
        out.length = 3;
        out[2] = `${out[2].slice(0, max - 1)}…`;
    }
    return out;
}

/**
 * Neo4j-style property graph: force-directed layout (shared with the standalone explorer),
 * draggable nodes, hover focus, Ctrl/Cmd + wheel zoom and background pan.
 */
export default function ForceGraph({ nodes, edges, selected = [], onSelect, onHover }) {
    const cache = useRef(new Map());
    const svgRef = useRef(null);
    const [view, setView] = useState({ x: 0, y: 0, s: 1 });
    const [, setTick] = useState(0);
    const [focus, setFocus] = useState(null);
    const drag = useRef(null);

    const laid = useMemo(() => {
        const sc = Math.max(1, Math.sqrt(nodes.length / 55));
        const LW = W * sc;
        const LH = H * sc;
        const types = [...new Set(nodes.map((n) => n.type))];
        const byType = {};
        nodes.forEach((n) => (byType[n.type] = byType[n.type] || []).push(n));
        const list = nodes.map((n) => ({ ...n }));
        let fresh = 0;
        list.forEach((n, k) => {
            const p = cache.current.get(n.id);
            if (p) {
                n.x = p.x;
                n.y = p.y;
                return;
            }
            fresh += 1;
            const anchor = n.near && cache.current.get(n.near);
            if (anchor) {
                const a = k * 2.399;
                const r = 55 + (k % 5) * 14;
                n.x = anchor.x + Math.cos(a) * r;
                n.y = anchor.y + Math.sin(a) * r;
                return;
            }
            const ti = types.indexOf(n.type);
            const group = byType[n.type];
            const i = group.findIndex((g) => g.id === n.id);
            const a = ((ti + (i / group.length) * 0.85) / types.length) * 2 * Math.PI;
            const r = (150 + (i % 3) * 70) * sc;
            n.x = LW / 2 + Math.cos(a) * r * 1.4;
            n.y = LH / 2 + Math.sin(a) * r;
        });
        if (fresh === list.length) grLayout(list, edges, LW, LH, 420, 120 * sc);
        else if (fresh) grLayout(list, edges, LW, LH, 160, 30);
        list.forEach((n) => cache.current.set(n.id, { x: n.x, y: n.y }));
        return { list, fresh };
    }, [nodes, edges]);

    const byId = useMemo(() => new Map(laid.list.map((n) => [n.id, n])), [laid]);
    const fit = () => {
        if (!laid.list.length) return;
        const xs = laid.list.map((n) => n.x);
        const ys = laid.list.map((n) => n.y);
        const x0 = Math.min(...xs) - 40;
        const x1 = Math.max(...xs) + 40;
        const y0 = Math.min(...ys) - 40;
        const y1 = Math.max(...ys) + 40;
        const s = Math.min(2, W / (x1 - x0), H / (y1 - y0));
        setView({ s, x: (W - (x0 + x1) * s) / 2, y: (H - (y0 + y1) * s) / 2 });
    };
    useEffect(() => {
        fit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [laid]);

    const neighbours = useMemo(() => {
        if (!focus) return null;
        const set = new Set([focus]);
        edges.forEach((e) => {
            if (e.s === focus || e.t === focus) {
                set.add(e.s);
                set.add(e.t);
            }
        });
        return set;
    }, [focus, edges]);

    const toLocal = (ev) => {
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        const q = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: (q.x - view.x) / view.s, y: (q.y - view.y) / view.s, sx: q.x, sy: q.y };
    };
    const onPointerMove = (ev) => {
        const d = drag.current;
        if (!d) return;
        if (d.node) {
            if (Math.hypot(ev.clientX - d.cx, ev.clientY - d.cy) > 4) d.moved = true;
            if (!d.moved) return;
            const p = toLocal(ev);
            d.node.x = p.x + d.ox;
            d.node.y = p.y + d.oy;
            cache.current.set(d.node.id, { x: d.node.x, y: d.node.y });
            setTick((t) => t + 1);
        } else {
            const scale = W / svgRef.current.getBoundingClientRect().width;
            setView((v) => ({ ...v, x: d.vx + (ev.clientX - d.cx) * scale, y: d.vy + (ev.clientY - d.cy) * scale }));
        }
    };
    const onPointerUp = () => {
        const d = drag.current;
        drag.current = null;
        if (d && d.node && !d.moved && onSelect) onSelect(d.node);
    };
    const zoom = (f, cx = W / 2, cy = H / 2) =>
        setView((v) => {
            const s = Math.max(0.3, Math.min(4, v.s * f));
            return { s, x: cx - ((cx - v.x) * s) / v.s, y: cy - ((cy - v.y) * s) / v.s };
        });
    useEffect(() => {
        const svg = svgRef.current;
        const onWheel = (ev) => {
            if (!ev.ctrlKey && !ev.metaKey) return;
            ev.preventDefault();
            const p = toLocal(ev);
            zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.sx, p.sy);
        };
        svg.addEventListener('wheel', onWheel, { passive: false });
        return () => svg.removeEventListener('wheel', onWheel);
    });

    const sel = new Set(selected);
    return (
        <Wrap>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 1 }}>
                <Button appearance="secondary" label="Fit" onClick={fit} />
                <Button appearance="secondary" label="+" aria-label="Zoom in" onClick={() => zoom(1.25)} />
                <Button appearance="secondary" label="−" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)} />
            </div>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label="Property graph"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
            >
                <defs>
                    <marker id="srmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0 0L10 5L0 10z" fill="#a5abb6" />
                    </marker>
                </defs>
                <rect
                    width={W}
                    height={H}
                    fill="transparent"
                    onPointerDown={(ev) => {
                        drag.current = { cx: ev.clientX, cy: ev.clientY, vx: view.x, vy: view.y };
                    }}
                />
                <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
                    {edges.map((e, i) => {
                        const a = byId.get(e.s);
                        const b = byId.get(e.t);
                        if (!a || !b) return null;
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const d = Math.hypot(dx, dy) || 1;
                        const ra = a.r || 24;
                        const rb = (b.r || 24) + 3;
                        const x1 = a.x + (dx / d) * ra;
                        const y1 = a.y + (dy / d) * ra;
                        const x2 = b.x - (dx / d) * rb;
                        const y2 = b.y - (dy / d) * rb;
                        let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
                        if (ang > 90) ang -= 180;
                        if (ang < -90) ang += 180;
                        const on = focus && (e.s === focus || e.t === focus);
                        return (
                            // eslint-disable-next-line react/no-array-index-key
                            <g key={i} className={`edge${on ? ' hl' : ''}${focus && !on ? ' dim' : ''}`}>
                                <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#srmArrow)" />
                                <text textAnchor="middle" dy="-4" transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${ang})`}>
                                    {e.caption || e.type}
                                </text>
                            </g>
                        );
                    })}
                    {laid.list.map((n) => {
                        const lines = wrapCaption(n.caption, n.r > 26 ? 13 : 11);
                        const color = TYPE_COLORS[n.type] || '#a5abb6';
                        return (
                            <g
                                key={n.id}
                                className={`node${neighbours && !neighbours.has(n.id) ? ' dim' : ''}`}
                                transform={`translate(${n.x} ${n.y})`}
                                tabIndex={0}
                                role="button"
                                aria-label={`${n.type}: ${n.caption}`}
                                onPointerDown={(ev) => {
                                    ev.stopPropagation();
                                    const p = toLocal(ev);
                                    drag.current = { node: n, ox: n.x - p.x, oy: n.y - p.y, cx: ev.clientX, cy: ev.clientY, moved: false };
                                }}
                                onMouseEnter={() => {
                                    setFocus(n.id);
                                    if (onHover) onHover(n);
                                }}
                                onMouseLeave={() => {
                                    setFocus(null);
                                    if (onHover) onHover(null);
                                }}
                                onKeyDown={(ev) => {
                                    if ((ev.key === 'Enter' || ev.key === ' ') && onSelect) {
                                        ev.preventDefault();
                                        onSelect(n);
                                    }
                                }}
                            >
                                {sel.has(n.id) && <circle r={(n.r || 24) + 6} fill="none" stroke="#ffc55a" strokeWidth={4} />}
                                <circle r={n.r || 24} fill={color} stroke={color} strokeWidth={2} />
                                {lines.map((l, k) => (
                                    // eslint-disable-next-line react/no-array-index-key
                                    <text key={k} textAnchor="middle" y={(k - (lines.length - 1) / 2) * 10 + 3}>
                                        {l}
                                    </text>
                                ))}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </Wrap>
    );
}

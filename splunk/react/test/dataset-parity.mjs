// Checks that the browser dataset builder (src/dataset.js) produces exactly the demo dataset that
// splunk/build.py ships as srm_demo_*.csv, from the same matrix.json and reference.json.
import fs from 'fs';
import path from 'path';
import { buildDataset, COLLECTIONS } from '../src/dataset.js';
const L = path.resolve('../shared_responsibility/lookups');
export function csv(file) {
    const text = fs.readFileSync(file, 'utf8'); const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
        if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
        else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
    if (f || row.length) { row.push(f); rows.push(row); }
    const [h, ...body] = rows; return { columns: h, rows: body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))) };
}
const root = path.resolve('../..');
const { errors, dataset } = buildDataset(JSON.parse(fs.readFileSync(path.join(root, 'matrix.json'))), JSON.parse(fs.readFileSync(path.join(root, 'reference.json'))), null);
if (errors.length) { console.log(errors); process.exit(1); }
let bad = 0;
for (const name of COLLECTIONS) {
    const demo = csv(path.join(L, `srm_demo_${name.slice(4)}.csv`)), mine = dataset[name];
    const sameCols = JSON.stringify(demo.columns) === JSON.stringify(mine.columns);
    const a = demo.rows.map((r) => JSON.stringify(r)), b = mine.rows.map((r) => JSON.stringify(r));
    const diff = a.filter((x, i) => x !== b[i]).length + Math.abs(a.length - b.length);
    if (!sameCols || diff) { bad++; console.log(`MISMATCH ${name}: columns ${sameCols ? 'same' : 'differ'}; rows ${mine.rows.length} vs demo ${demo.rows.length}; ${diff} differing`); if (!sameCols) console.log('  demo ', demo.columns.join(','), '\n  mine ', mine.columns.join(',')); else { const i = a.findIndex((x, k) => x !== b[k]); console.log('  demo ', a[i]?.slice(0, 300), '\n  mine ', b[i]?.slice(0, 300)); } }
}
console.log(bad ? `${bad} collections differ` : `All ${COLLECTIONS.length} collections identical to the shipped demo dataset`);
process.exit(bad ? 1 : 0);

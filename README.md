# Cloud Shared Responsibility Explorer

GitHub Pages-ready export of Version 31.

## Publish with GitHub Pages

1. Upload `index.html`, `matrix.json`, and `.nojekyll` to the root of a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the branch containing these files and the `/ (root)` folder.

The application is static and requires no build step or server-side runtime.

## Contents

- `index.html` — interactive explorer.
- `matrix.json` — catalogue of 1,191 atomic controls.
- `.nojekyll` — disables Jekyll processing for direct static hosting.

The lifecycle view uses responsibility functions as rows and 11 uncoloured lifecycle-stage headings as columns. COBIT pillar colours appear only within matrix intersections.

The **Allocation** and **Parties involved** views each switch between the original matrix and four diagrams built from the control-layer × service-model share data. The parties are customer governance, customer SOC and cloud provider:

- **Sankey flow**: service model → party → control layer. In Allocation, band width is the party's share of each layer, in percentage points. In Parties involved, each band is one layer in which the party is involved.
- **Party–layer network**: each party is linked to the control layers it takes part in, weighted by its average share or by the number of service models that involve it. Selecting a service model reweights the lines for that model.
- **Model arcs**: arcs join the 16 most similar pairs of service models, and a bar under each model shows its average party mix.
- **Heatmap**: control layers against service models. Allocation cells are split by party share, and selecting a party in the RASCI actor filter focuses on its share. Involvement cells show which parties take part.

Selecting a service model, party or layer in a diagram filters the control catalogue.

The **Platform lifecycle** view now switches between the original matrix and four diagrams built from the lifecycle data:

- **Sankey flow**: lifecycle stage → responsibility function → COBIT pillar, with bands coloured by pillar.
- **Stage–layer network**: the 11 stages in order, linked to the control layers each one engages. Layers are ordered by when they are most active, and line weight shows in-scope controls.
- **Stage arcs**: arcs join stages that share control layers, and a bar under each stage shows its mix of COBIT pillars.
- **Heatmap**: pillars against stages (how many responsibility functions engage each pillar), followed by a stage-by-layer grid showing when each layer is engaged.

The on-premises section and COBIT pillar filters narrow every diagram. Selecting a stage, pillar or layer in a diagram filters the control catalogue.

The **On-prem cross-cut** view has the same switch between the original matrix and four diagrams built from the section, role and pillar data:

- **Sankey flow**: on-premises section → responsibility function → COBIT pillar. Left bands are shaded by the section's role (primary, support or consulted) and right bands are coloured by pillar.
- **Section–function network**: each section is linked to the functions it holds a role in. Line weight, shade and dashes show the role, and each function lists its pillars.
- **Section arcs**: arcs join sections that both hold a primary or support role in the same function, and a bar under each section shows its mix of roles.
- **Heatmap**: pillars against sections (functions engaged, split into P/S/C), followed by a grid of the control layers each section covers.

The **Failure scenarios** view has the same switch between its original involvement matrix and four diagrams built from the four scenarios:

- **Sankey flow**: scenario → on-premises section → responsibility function, with each band an involved section–function pairing coloured by scenario.
- **Scenario–layer network**: each scenario is linked to the control layers its recovery draws on. Layers used by every scenario sit at the top.
- **Scenario arcs**: arcs join scenarios by how much their section–function involvement overlaps, labelled with the number of control layers they share. Each scenario shows its involvement, layer count and recovery targets.
- **Heatmap**: the scenarios side by side, showing sections involved per function, functions involved per section, and the control layers each scenario uses.

Every view also has a **Graph** tab: a Neo4j-style property graph of that view's data, with node labels, typed relationships carrying properties, a properties panel and draggable nodes.

| View | Nodes | Relationships |
| --- | --- | --- |
| Allocation / Parties involved | Party, ServiceModel, ControlLayer | `ALLOCATES` / `INVOLVES`, `HOLDS_SHARE` / `INVOLVED_IN` |
| On-prem cross-cut | Section, Function, Pillar, ControlLayer | `PRIMARY_FOR`, `SUPPORTS`, `CONSULTED_ON`, `ALIGNS_TO`, `COVERS` |
| Platform lifecycle | Stage, Pillar, ControlLayer | `NEXT`, `EMPHASISES`, `ENGAGES` |
| Failure scenarios | Scenario, Section, ControlLayer | `INVOLVES`, `DRAWS_ON` |

The **Cypher** button shows a `CREATE` script for the current graph, ready to copy or download as a `.cypher` file and run in Neo4j Browser or `cypher-shell`.

The **Combined graph** view joins every data set into one property graph:

- **Nodes:** parties and RASCI actors (including third party), service models, control layers, the 51 control domains, on-premises sections, responsibility functions, COBIT pillars, lifecycle stages and failure scenarios.
- **Expanding controls:** select a domain and choose **Expand** to add its individual controls, each linked to the parties it assigns by RASCI code.
- **Type chips:** the chips in the overview panel show or hide each node type.
- **Cypher › Full dataset:** exports all 1,191 controls with their RASCI assignments, domains and standards references. Nodes load in `UNWIND` batches with uniqueness constraints, so the import suits `cypher-shell` or Neo4j Browser.

The Combined graph view includes a **Cypher console** for running read-only queries against the full dataset: 1,325 nodes and 5,877 relationships, including all 1,191 controls.

- **Supported Cypher:** `MATCH`, `OPTIONAL MATCH`, `WHERE`, `WITH`, `UNWIND` and `RETURN` (with `DISTINCT`, `ORDER BY`, `SKIP` and `LIMIT`); label, property and relationship-type patterns; variable-length paths (up to 15 hops) and named paths; aggregates (`count`, `collect`, `sum`, `avg`, `min`, `max`); `CASE`; and the common string, list and graph functions.
- **Results:** nodes, relationships and paths appear as a graph, which also includes relationships between returned nodes, as in Neo4j Browser. Every result can be viewed as a table and downloaded as CSV.
- **Help:** an Examples menu offers ready-made queries, and the Syntax button lists everything supported.
- **Limits:** writes (`CREATE`, `MERGE`, `SET`, `DELETE`, `CALL`) are rejected. Runaway queries stop at 50,000 rows or after too many explored paths.

## Splunk app (proof of concept)

`splunk/` holds a Splunk app built from the same data. It has lookups for every data set, a Splunk UI Toolkit (React) explorer page that reads them live, Dashboard Studio dashboards, scheduled control-evidence searches you can run from the page, and the bundled standalone explorer. To build it, run `python3 splunk/build.py --package`. [splunk/README.md](splunk/README.md) covers installation and what the app contains.

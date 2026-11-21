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

The **Relationships** view offers four diagrams, all driven by the same filters:

- **Mind map**: the shared-responsibility hub, the four RASCI actors (customer governance, customer SOC, cloud provider and third party) and their links to each control layer, weighted by control count.
- **Sankey flow**: traces each assignment from actor, through its RASCI role (R/A, A, R, S, C, I), into a control layer.
- **Actor chord**: ribbons show how many controls each pair of actors shares, coloured by the actor more often accountable. A side panel ranks the pairs and breaks each one down by who is accountable.
- **Heatmap**: control layers × actors, shaded by the share of each layer's controls where the actor holds the selected role.

Selecting an actor, role or layer in any diagram filters the control catalogue.

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

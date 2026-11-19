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

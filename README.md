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

The relationship map view is a mind map with the shared-responsibility hub at the centre. It links the four RASCI actors (customer governance, customer SOC, cloud provider and third party) to each control layer. Line weight shows how many in-scope controls give an actor a role, and each node is coloured by the actor holding the most accountable assignments. Selecting an actor or a layer filters the control catalogue.

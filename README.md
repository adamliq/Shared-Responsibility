# Cloud Shared Responsibility Explorer

Interactive cloud shared responsibility matrix covering customer governance, Customer SOC and cloud-provider involvement across cloud service models.

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Upload the **contents** of this package to the repository root, preserving the `.github/workflows` directory.
3. Ensure the default branch is named `main`.
4. Open **Settings → Pages** in the repository.
5. Under **Build and deployment**, select **GitHub Actions** as the source.
6. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish.

The site will be available at:

`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

Every later push to `main` republishes the site automatically.

## Repository structure

- `index.html` — interactive application
- `matrix.json` — complete shared-responsibility control catalogue
- `.nojekyll` — prevents Jekyll processing
- `.github/workflows/deploy-pages.yml` — automated GitHub Pages deployment

No build tools, packages or server-side services are required.

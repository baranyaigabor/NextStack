# Creating and updating products with Copier

Copier records the upstream source, revision, and public project identity in
`.copier-answers.yml`. Commit that file and `project.json`. Private configuration
stays in ignored `.env` files and is generated separately by `pnpm project:init`.
The template has no automatic tasks, migrations, or extensions and does not need
`--trust`. See [Copier's update documentation](https://copier.readthedocs.io/en/stable/updating/).

## Create a product

Install Copier 9.18.2 (`brew install copier` on macOS, or
`pipx install copier==9.18.2` with Python 3.10+), Docker, tmux, and the Node/pnpm
versions specified by this repository. Copier is needed only for creation and
updates, not application runtime.

After these changes have been committed, published, and tagged by the maintainer:

```bash
# Replace TEMPLATE_TAG with an actual reviewed release tag containing copier.yml.
copier copy --vcs-ref TEMPLATE_TAG gh:baranyaigabor/NextStack ../my-product
cd ../my-product
git init
pnpm install --frozen-lockfile
pnpm project:init
# Review .env and configure any external providers.
pnpm dev:up
```

For local development before publication, use `copier copy --vcs-ref HEAD .
../my-product` from the template root. Copier may warn about including dirty
changes; use a committed template release for reproducible products. No new
upstream release has been published as part of this implementation.

Choose a lowercase project slug and public display name (1–80 characters,
without control characters, double quotes, or backslashes). Initialization adds a
random suffix to the slug for isolated application identity, finds free local
ports, and generates private credentials. Re-running initialization preserves
an existing `.env`. Each `pnpm project:init` also resolves the latest stable
cloudflared release and updates both Compose image pins to its multi-platform
Docker digest. This requires GitHub and Docker registry access; failed lookups
warn and retain existing pins. Initialization does not restart running connectors;
apply the new image with `pnpm dev:tunnel:up` or `pnpm prod:tunnel:up`. Keep workspace package names stable; public branding comes
from environment configuration. Changing answers later updates `project.json`,
but intentionally does not rewrite an existing `.env` or production identity.

## Update a generated product

Start from a clean, committed Git worktree and create an upgrade branch:

```bash
git switch -c chore/template-update
pnpm template:update --vcs-ref TEMPLATE_TAG
# Review all changes and resolve any inline conflict markers.
pnpm install --frozen-lockfile
pnpm verify
# Run integration/native tests appropriate to the changed components.
```

Review updated `.env.example` for newly required settings. Copier can preserve
nonconflicting product changes, but overlapping edits require manual resolution.
Do not deploy unresolved conflicts. Commit the reviewed result including the
new revision in `.copier-answers.yml`. A template update applies source changes;
it does not run database migrations, deploy services, or modify private `.env`.

Ordinary Git clones predating Copier have no recorded template baseline. Do not
run a forced copy over them. Generate a fresh product from a known template tag
and transfer product changes on a branch, or rehearse an explicit baseline
migration separately.

## Maintainer validation and releases

```bash
pnpm test:template              # Real copy and two staged upgrades
pnpm test:template --verify     # Also install and verify the generated product
```

The test snapshots current source into temporary Git repositories and tags only
those disposable repositories. It checks public identity, initialization,
exclusion of accidentally tracked secrets/build outputs, preservation of product
code and `.env`, a clean upgrade, and an overlapping conflict followed by
resolution. It never changes this repository's Git index or publishes tags.
The dedicated CI job runs the generated-product verification too.

Before publishing a template release, review the full changes, run these checks,
commit, and create a semantic-version tag. Keep release history available so
Copier can reconstruct prior revisions. Keep `copier.yml` exclusions aligned with
`.gitignore` when adding generated output directories or new private file types.

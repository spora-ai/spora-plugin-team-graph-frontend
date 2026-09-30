# Releasing spora-plugin-team-graph-frontend

This package is published on Packagist as `spora-ai/spora-plugin-team-graph-frontend`. Releases use GitHub Releases for the asset tarball; Packagist indexes from the git tag, so the `dist.url` in the **tagged** `composer.json` must point at the correct asset.

## Release process

1. **Open a release prep PR** against `main`:
   - Bump `package.json` `version` to the next semver (e.g. `0.1.1`)
   - Bump the **two root `version` fields in `package-lock.json`** — the top-level one and the one under `packages[""]`. Every workflow runs `npm ci`, which hard-fails when `package.json` and the lockfile disagree, so this is not optional. Ignore the third `"version": "0.1.0"` you may find further down the file: that is `node_modules/yocto-queue`, a transitive dep that happens to share the number.
   - Update `composer.json` `dist.url` to the matching URL:
     ```
     https://github.com/spora-ai/spora-plugin-team-graph-frontend/releases/download/v<VERSION>/spora-plugin-team-graph-frontend-v<VERSION>.tar.gz
     ```
   - Update `CHANGELOG.md` (if present) and `README.md` if needed
2. **Merge the PR** to `main`.
3. **Tag the merge commit** from `main`:
   ```bash
   git checkout main && git pull --ff-only
   git tag v<VERSION>    # e.g. v0.1.1
   git push origin v<VERSION>
   ```
4. The `build-and-release` workflow fires:
   - Builds the bundle (`vue-tsc && vite build`)
   - Verifies the tagged `composer.json`'s `dist.url` matches the tag (fails loudly if not)
   - Verifies the artifact contains only `frontend/` contents (no source code, configs, or `node_modules`)
   - Creates the GitHub Release with the asset attached
5. Packagist auto-indexes the new tag within ~5 minutes.

> **Step 1 must be merged before step 3 runs.** Skipping it burns a version slot — see "Why this is the process" below.

## Verify the prep PR before merging it

```bash
npm ci --dry-run --ignore-scripts   # fails loudly if package.json and the lockfile disagree
```

This is the check that catches a missed lockfile bump, and it costs seconds. The `dist.url` check in `build-and-release` does **not** catch it — that job never reaches the install step, and the tag is already dead by then.

## Release artifact shape

The GitHub Release asset (`spora-plugin-team-graph-frontend-v<VERSION>.tar.gz`) contains **the `frontend/` directory verbatim** (the Vite IIFE bundle output — `main.js` and optionally `style.css`), under a single versioned root directory that matches the tag:

```
spora-plugin-team-graph-frontend-v<VERSION>.tar.gz
└── spora-plugin-team-graph-frontend-v<VERSION>/     # versioned root — required by PHP's PharData
    └── frontend/                                      # preserved as a subdir so the installer can find it
        ├── main.js                                     # the IIFE bundle
        └── style.css                                   # Tailwind-compiled CSS
```

The v0.1.0 asset is 1,043,701 bytes with exactly these four entries.

**Nothing else ships in the archive** — no source files, no `package.json`, no `node_modules`, no build configs. The release tarball is built explicitly from `frontend/` in the `build-and-release` workflow, and the `Verify only frontend/ is shipped` step fails the build if any non-`frontend/` path slips into the archive (deny-list + allow-list assertions).

The installer in `spora-ai/installer` unpacks this tarball into `public/plugins/team-graph/` on the operator's host, so the host SPA's dynamic `import('/plugins/team-graph/main.js')` (per `registry.ts → mountPlugin`) finds the IIFE bundle at the path it expects.

Note: `composer.json`'s `archive.exclude` block is **only consumed by `composer archive`** — it has no effect on the GitHub Release tarball, which is built by the CI workflow directly from `frontend/`. It's defense-in-depth so a maintainer running `composer archive` locally doesn't ship source files in a one-off manual release.

## Why a versioned root directory

Composer's `TarDownloader` uses PHP's `PharData::extractTo()` internally, which fails with `Cannot extract '.', internal error` on a leading `.` directory entry. PHP requires the archive to have a non-trivial root directory.

The fix is to wrap the contents in a versioned root before tarring:

```bash
mkdir -p staging/spora-plugin-team-graph-frontend-${TAG}
cp -R frontend staging/spora-plugin-team-graph-frontend-${TAG}/
tar -czf spora-plugin-team-graph-frontend-${TAG}.tar.gz -C staging spora-plugin-team-graph-frontend-${TAG}
```

## Why this is the process

`composer install` reads `dist.url` from the **tagged** `composer.json`, not from the CI workspace. If you skip the prep PR and tag the old `composer.json`, `composer install` resolves the URL to a 404 because the new release asset does not exist at the old URL.

## Rollback

If a release is broken, do NOT delete + retag the same version. Git tags are immutable. Instead, tag a new patch version (e.g. `v0.1.0` → `v0.1.1`) with the fix.

## Release ordering

This package is a **runtime dependency of the plugin**, not of the host. `spora-ai/spora-plugin-team-graph` requires it (`>=0.1.0 <2.0.0`) and `composer install` resolves it transitively, so the two are released independently:

- **Release the frontend first** when both change. The plugin's `dist`/install pulls the frontend by constraint, so the frontend's asset has to exist on Packagist before the plugin's lockfile is regenerated.
- A frontend-only release is fine and needs no plugin release. A plugin-only release is also fine as long as it does not tighten the frontend constraint.

Because the requirement is a range rather than a pin, an operator running `composer update` picks up the newest matching frontend without the plugin being re-released.

## Do not release on a CI-only diff

`git diff --stat <last-tag>..origin/main -- src/ scripts/ package.json package-lock.json vite.config.ts tailwind.config.ts tsconfig.json index.html` returning empty means the rebuilt bundle is byte-identical to the last release. Tagging anyway publishes a duplicate ~1 MB asset and burns a version slot for no functional gain — wait for a change that actually reaches the bundle. The Sonar scan is skipped automatically on tag pushes (see the `sonarcloud` job's `if:` guard), which is intentional and not a reason to skip a release.

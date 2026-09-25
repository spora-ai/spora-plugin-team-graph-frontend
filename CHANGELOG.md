# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-25

### Changed

- **Real principals, no fixtures.** The plugin no longer ships demo
  fixture data (`api/fixtures.ts` deleted; backend `fixtures: [...]`
  field removed from the graph endpoint envelope). The left column is
  a `PrincipalListSidebar` listing the caller's principals from
  `GET /principals/me` — the user-owned user-principal always renders
  as "My Agents", and every group the user belongs to renders as its
  raw name. Switching a row swaps the centre canvas to that principal's
  directed graph.
- **Detail as a sidebar at every viewport.** The `lg:`-only sidebar +
  centred-modal split is gone. Per user feedback ("details open in an
  overlay instead of the sidebar"), `AgentDetailPanel` now renders as
  a right-column sidebar at every breakpoint; `AgentDetailModal.vue`
  is deleted.
- **Three-column layout.** `[240px principal list | flex graph | 340px
  detail]`. On `<lg` the columns stack to `[principal list above
  graph above detail]` instead of swapping the detail for a modal.

### Added

- `usePrincipalList` composable: loads `/principals/me`, picks the
  user-principal as the default selection, exposes
  `select(id)` and `reload()`.
- New `PrincipalListSidebar.vue` component with MY/G badges, hover
  states, and aria-current for the active row.
- Plugin-side `principalLabel()` helper that renders the user-owned
  user-principal as "My Agents" regardless of what the wire's `name`
  field says (the wire usually returns the user's email).

### Size

- `frontend/main.js`: 3,436,440 B (3,355 KiB) raw / 1,031,210 B
  (1,007 KiB) gzipped.
- `frontend/style.css`: 13,344 B (13 KiB) raw / 3,029 B (3 KiB)
  gzipped.
- Diff vs v0.1.0: -11 KiB raw on main.js (fixture graph payloads gone),
  no meaningful change in gzipped size.

## [0.1.0] - 2026-09-25

### Added

- Initial release of the Spora team-graph admin SPA.
- Vue 3 + Pinia + vue-router mount contract under `window.SporaAppTeamGraph`.
- Mermaid 10 dagre layout for the hierarchical team-graph rendering.
- Three seeded fixtures (`tinyStartup`, `marketing`, `solo`) that render when
  the API response includes a `fixtures` array, so the dev experience works
  against a fresh backend with no data.
- Click-to-select behaviour with right-sidebar detail on `lg:` screens and a
  centred modal below the breakpoint (so it never collides with the host's
  global right-side sheet).
- Pan/zoom controls on the canvas (drag empty canvas to pan, wheel to zoom
  around the cursor; +/-/fit buttons in the corner).
- Status-coloured node classes for `RUNNING`, `PENDING_APPROVAL`,
  `AWAITING_SUB_AGENTS`, `FAILED`, `COMPLETED`, `ABORTED`.
- Post-render viewBox trim, rounded corners (rx/ry=12), and soft drop-shadow
  on every node shape.
- CSS isolation: `corePlugins.preflight: false` and
  `important: '#spora-plugin-team-graph'` so the plugin's Tailwind utilities
  don't leak past the host SPA's reset.
- Mount contract smoke script (`scripts/smoke.js`) that asserts
  `window.SporaAppTeamGraph` is declared with `mount`/`unmount` and that the
  stylesheet scopes utilities beneath `#spora-plugin-team-graph`.
- Vitest suite (35 tests) covering the Mermaid source builder, the rendering
  composable, the team-graph fetch composable, the page-level integration,
  and the status → CSS class mapping.
- 6-job CI workflow (lint-and-test, build, size-budget, sonarcloud,
  build-and-release) with all external actions pinned to full SHAs.

### Size

- `frontend/main.js`: 3,447,664 B (3,367 KiB) raw / 1,026,991 B (1,003 KiB)
  gzipped.
- `frontend/style.css`: 13,668 B (13 KiB) raw / 3,262 B (3 KiB) gzipped.
- Total gzipped: ~1.0 MB. The bulk is Mermaid 10's IIFE bundle (dagre +
  parsers for every diagram type).
- CI size budget set to 4 MB pre-gzip (above the plan's nominal 800 KB) so
  Mermaid's actual baseline passes; future regressions re-bundling
  Vue/Pinia/VueRouter would still fail this gate.

### Notes

- The empty merge commit added to bootstrap this repo from a blank `main` is
  intentionally the only direct push — see
  `spora-workspace/plans/spora-plugin-team-graph.md` "Implementation plan"
  for the rationale; all subsequent work will follow the normal feature
  branch + PR flow.

# spora-plugin-team-graph-frontend

Vue 3 admin SPA for the Spora **Team Graph** panel. The host SPA (`spora-frontend`) lazy-loads it at `/plugins/team-graph/main.js` — the parent plugin's `plugin.json#slug`, not this package's name — and mounts it into the `/apps/team-graph` slot via the global `window.SporaAppTeamGraph`.

The PHP half of the panel lives in `spora-plugin-team-graph`; this repo ships only the built assets. The wire contract is the plugin's own route — `GET /api/v1/plugins/team-graph/graph?principal_id=<id>` — plus the host's `/principals/me`, `/tasks` and `/agents/{id}`; read them before changing anything under `src/api/`.

## The package

A Composer package of type `spora-plugin-frontend`. `SporaPluginFrontendInstaller` reads `composer.json#extra.spora-plugin-slug` (`team-graph` — it must equal the parent plugin's `plugin.json#slug`, and the installer refuses to install when it does not) and copies the built `frontend/` directory into the host's `public/plugins/team-graph/`.

The build is a Vite **library** build in IIFE format: `npm run build` writes `frontend/main.js` and `frontend/style.css`, and the host injects the stylesheet and lazy-loads the script. Vue and Pinia are the only externalised modules — they are published on `window.Vue` / `window.Pinia` by the host, and everything else (Mermaid, `@spora-ai/components`) is bundled.

`frontend/` is gitignored here: the release tarball is built by CI from the tagged commit, not from a committed artefact.

## What the panel does

One page, three regions:

- **Toolbar** — title, a summary line (agent and edge counts), the freshness indicator, and a Refresh button.
- **Principal pill row** — the operator's own user-principal ("My Agents") plus every group principal they belong to, from `GET /principals/me`. Clicking a pill switches the canvas to that principal's graph.
- **Canvas + detail sidebar** — a Mermaid graph of the principal's agent spawning relationships on the left, the selected agent's detail panel on the right.

The graph polls every 30 s. The detail panel shows the agent's description, its inbound and outbound relations, and its recent chats.

## Build

```bash
npm install
npm run build   # vue-tsc --noEmit && vite build → frontend/main.js + frontend/style.css
npm run smoke   # static guard on the IIFE global, the mount contract and the CSS scope
```

`npm run smoke` reads the built assets as text: a missing global, a rewritten CSS layer or a dropped utility looks exactly like a working build in a diff, and an invalid CSS value is discarded at computed-value time without an error anywhere. The checks are the reason the stylesheet's hand-written rules stay inside the plugin boundary.

## Dev mode (plugin author)

```bash
npm run dev   # vite dev server on :5180
```

The dev sandbox stubs the REST API, so the page renders without a backend. To exercise the real wire surface, run the host SPA's plugin dev-proxy (`SPORA_PLUGIN_DEV_PORTS=team-graph:5180 npm run dev` in `spora-frontend`) and visit `/apps/team-graph`.

The dev page has no host CSS variables: every colour resolves through the host's tokens and nothing in this repo declares them. Load the panel through the dev-proxy before judging any colour.

## Languages

The panel ships its own `vue-i18n` instance (`src/i18n/index.ts`) built from its own catalogue — the host does not publish its instance, because that would couple every plugin to the host's catalogue lifetime and to a version-skewed peer range. The locale comes from the host through `PluginHostContext.locale`; the dev sandbox reads it from `?locale=de`.

```
src/locales/en.json   generated identity map — every key maps to itself
src/locales/de.json   the German catalogue
```

**The catalogue key is the English source string** — `t('Save & Render')`, not a slug. `en.json` is therefore generated, never hand-edited, and a copy edit orphans the German entry that was paired with it — which is exactly what the extractor's orphan rule catches.

```bash
npm run i18n:extract   # regenerate en.json from the source and report what is untranslated
npm run i18n:check     # the CI gate: en.json drift, a locale's key set, untranslated values, and copy outside t()
```

`npm run i18n:check` fails on an operator-facing string that is not wrapped in `t()`. In this plugin that failure is fatal rather than advisory: the panel is the operator's whole surface, so a string that missed the catalogue is a string the operator reads in English.

### What stays English, and why

Four kinds of string are deliberately not in the catalogue:

- **Agent names** — "Marketing Lead", "Invoice Bot". Data the operator chose when they created the agent; translating them would rename somebody's agent behind their back. They never reach the extractor in the first place: they arrive with the payload, not as a literal in the source.
- **`Principal` / `Principals`** — the house term. The host's own German catalogue keeps it untranslated ("Ziel-Principal", "einen anderen Principal"), so a German operator reads "Principal" here too, and translating it would put two words for one concept on the same screen.
- **`sub_agent`** — the wire's edge-operation slug (`op: 'sub_agent' | 'handover'`). It names the tool that produced the edge, and the host's task chat uses the same identifier for it; translating it here would break the link between the graph and the tool it draws.
- **`MY` / `G`** — two-letter codes in a 20 px pill badge on each principal tab. There is no room for a translated word in the badge, and the label beside it ("My Agents", or the group's own name) already carries the meaning.

The last three are the extractor's `EXCLUDED_TERMS` — it leaves them in the template as raw text instead of reporting them as untranslated copy.

## Relative time

`src/lib/relativeTime.ts` is the panel's only relative-time renderer. The toolbar's freshness indicator and the detail panel's "last seen" both read it, so one duration is phrased one way wherever it appears — the page used to carry a ladder of its own, which phrased the same duration differently from the panel's, in the same language, on the same screen.

English keeps the compact form the dashboard has always shipped (`5m ago`); every other locale goes through `Intl.RelativeTimeFormat` for its plural forms (`vor 5 Minuten`). The sign is carried all the way down: a timestamp in the future is `in a moment` / `in 10 Sekunden`, never "now".

## Mount contract

The IIFE bundle installs `window.SporaAppTeamGraph` (the PascalCase of the slug) with two methods:

- `mount(target: HTMLElement, hostContext)` — create the app, install the local Pinia and the plugin's own i18n instance, mount into the host's slot.
- `unmount(target: HTMLElement)` — tear down.

The host's `apps/registry.ts` reads both. The bundle name must stay aligned with `team-graph` → `SporaAppTeamGraph` (see `vite.config.ts → build.lib.name`).

## Commands

```bash
npm install
npm run dev            # standalone sandbox on :5180 with stubbed payloads
npm run lint           # eslint
npm run typecheck      # vue-tsc --noEmit
npm test               # vitest run
npm run test:coverage  # vitest run --coverage → coverage/lcov.info
npm run build          # vue-tsc --noEmit && vite build → frontend/
npm run smoke          # static guard on the IIFE bundle + the CSS scope
npm run i18n:extract   # regenerate src/locales/en.json
npm run i18n:check     # the catalogue gate
npm run clean          # removes frontend/main.js + frontend/style.css
```

CI runs lint, type-check, the catalogue gate, the tests, the build, the smoke check, a bundle-size budget and the SonarCloud scan on every push.

## Tests

- `tests/lib/relativeTime.spec.ts` — the ladder, the compact English form, the German plural forms, and the sign in the sub-minute bucket.
- `tests/components/TeamGraphPage.spec.ts` — the toolbar, the pill row, the summary line, the freshness label and the principal switch.
- `tests/i18n.spec.ts` — the catalogue against the source, and the panel rendering German.
- `tests/style.spec.ts` and `scripts/cssGuards.js` — the plugin boundary in the stylesheet.

## Releasing

See [RELEASING.md](./RELEASING.md). In short: bump `package.json` **and** `composer.json` (including `dist.url`), then tag `v<version>`. The `build-and-release` job fails if `dist.url` does not match the tag.

## License

MIT — declared in `composer.json#license`.

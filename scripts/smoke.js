#!/usr/bin/env node
/**
 * Static-analysis smoke check for the production plugin assets.
 *
 * Mirrors `spora-plugin-typst-frontend/scripts/smoke.js`. Vue's
 * top-level createApp()/defineComponent() calls need a real
 * renderer, so we inspect the IIFE wrapper instead of evaluating
 * it. The stylesheet checks lock in the plugin boundary:
 *
 *  - the bundle declares `window.SporaAppTeamGraph` (or `var SporaAppTeamGraph=`),
 *  - the bundle defines `mount(a, b)` and `unmount(a)`,
 *  - the stylesheet scopes every utility beneath `#spora-plugin-team-graph`
 *    (so plugin classes can't escape the slot),
 *  - the stylesheet omits Tailwind preflight (the host owns the reset),
 *  - the stylesheet still carries `@spora-ai/components`' rules
 *    unrenamed inside `@layer components` (the Tailwind v3
 *    `scopeVendorLayers` workaround must stay deleted),
 *  - the stylesheet still carries the plugin's own `.tg-*` rules and
 *    its `.surface-card` fill,
 *  - no rule uses a bare `var(--<host token>)`: the host's tokens are
 *    HSL channel triples, so the unwrapped form is an invalid value
 *    that is dropped silently at computed-value time,
 *  - `--color-card` / `--color-card-foreground` are still emitted, so
 *    the detail panel keeps a real surface in both themes.
 */
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IS_FUNCTION_ARGUMENT, firstHostDocLeak } from './cssGuards.js'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '..', 'frontend', 'main.js')
const stylesheetPath = resolve(here, '..', 'frontend', 'style.css')

const failures = []

let txt
let css
try {
    ;[txt, css] = await Promise.all([
        readFile(bundlePath, 'utf8'),
        readFile(stylesheetPath, 'utf8'),
    ])
} catch (e) {
    console.error(`smoke: cannot read build output: ${e.message}`)
    process.exit(1)
}

const globalName = 'SporaAppTeamGraph'

// No `String.raw` here: there is no backslash to protect, only the `\n` and
// `\s` the regex engine reads, so a plain template is the same string with
// one less thing to keep straight.
const bindingRe = new RegExp(`(?:^|;|\\n)\\s*(?:var\\s+${globalName}\\s*=|window\\.${globalName}\\s*=)`, 'm')
if (!bindingRe.test(txt)) {
    failures.push(`bundle does not declare ${globalName} via \`var ${globalName}=\` or \`window.${globalName}=\``)
}

const mountRe = /\bmount\s*\(\s*[a-zA-Z_$][\w$]*\s*,\s*[a-zA-Z_$][\w$]*\s*\)/
if (!mountRe.test(txt)) {
    failures.push('bundle does not define `mount(a, b)` with two parameters')
}

const unmountRe = /\bunmount\s*\(\s*[a-zA-Z_$][\w$]*\s*\)/
if (!unmountRe.test(txt)) {
    failures.push('bundle does not define `unmount(a)` with one parameter')
}

const scopeSelector = '#spora-plugin-team-graph'
if (!css.includes(scopeSelector)) {
    failures.push(`stylesheet does not scope utilities beneath ${scopeSelector}`)
}

const unscopedTeamGraphUtilityRe = /(?:^|})\s*\.text-team-graph-\d+\s*\{\s*color\s*:/
if (unscopedTeamGraphUtilityRe.test(css)) {
    failures.push('stylesheet contains an unscoped team-graph utility (missing `important:` scope)')
}

// Preflight arrives in two different shapes depending on the Tailwind
// major: v3 reset `*, ::before, ::after` with `border-width: 0; border-style: solid`,
// v4 reset `*, ::after, ::before, ::backdrop, ::file-selector-button` with
// `border: 0 solid`. Both are listed so a future major bump can't slip a
// reset past this guard. The remaining probes are the distinctive markers
// of v4's preflight block.
const preflightRes = [
    /box-sizing\s*:\s*border-box;\s*border-width\s*:\s*0;\s*border-style\s*:\s*solid/,
    /-webkit-text-size-adjust\s*:\s*100%/,
    /-webkit-tap-highlight-color\s*:\s*transparent/,
    /::file-selector-button\s*\{/,
]
for (const re of preflightRes) {
    if (re.test(css)) {
        failures.push(`stylesheet contains the Tailwind preflight reset (host owns this): ${re}`)
    }
}

/**
 * `@spora-ai/components` ships every rule inside `@layer components`.
 * Under Tailwind v3 the PostCSS `normalizeTailwindDirectives` guard threw
 * on that bare at-rule, and the fix was a `scopeVendorLayers` pre-plugin
 * renaming the layer to `vendor-components`. v4 has no such guard, so the
 * workaround is gone and the layer name must be back to `components` —
 * anything else means someone re-introduced the rename.
 */
if (/vendor-(components|utilities|base)/.test(css)) {
    failures.push('stylesheet contains a `vendor-*` layer rename (the Tailwind v3 scopeVendorLayers workaround is gone)')
}
for (const sel of ['.avatar--sm', '.avatar--initials', '.spora-icon']) {
    if (!css.includes(sel)) {
        failures.push(`stylesheet is missing @spora-ai/components' ${sel} rule`)
    }
}
if (!/@layer\s+components\s*\{/.test(css)) {
    failures.push("stylesheet has no `@layer components` block (the package's layer name was rewritten)")
}

// The plugin's own Mermaid/graph chrome. If these vanish the canvas
// renders unstyled, which is invisible in a bundle-size diff.
// The list tracks the *current* chrome: the Variant M node card
// (`.tg-node-card`) replaced the Mermaid HTML label template
// (`.tg-node-accent`) when node cards moved to a Vue overlay, the
// edge-degree badges (`.tg-edge-badge`) are new, and `.surface-card`
// is the card surface the canvas and the detail panel paint.
// Swapping a selector out is fine; dropping a check is not.
for (const sel of ['.tg-node-card', '.tg-status-running', '.tg-edge-badge', '.surface-card']) {
    if (!css.includes(sel)) {
        failures.push(`stylesheet is missing the plugin's own ${sel} rule`)
    }
}

/*
 * The card surface must survive Tailwind's `@theme` tree-shaking.
 *
 * v4 emits a `--color-*` variable only while some template still uses
 * the utility it backs — of the fifteen this plugin declares, only
 * the handful whose utilities appear in an SFC reach the output. Drop
 * the last `bg-card` from a template and `--color-card` disappears
 * with it, at which point `background-color: var(--color-card)` is an
 * invalid value again and the panel is transparent: the same silent
 * failure this file's other guards exist for. `.surface-card` does not
 * read the variable (see `src/style.css`), so the plugin keeps a
 * working surface either way, but the utility path is worth asserting
 * too because it is the one a refactor would remove.
 */
if (!/--color-card:hsl\(var\(--background\)\)/.test(css)) {
    failures.push('stylesheet does not emit `--color-card: hsl(var(--background))` — the card surface is gone')
}
if (!/--color-card-foreground:hsl\(var\(--foreground\)\)/.test(css)) {
    failures.push('stylesheet does not emit `--color-card-foreground: hsl(var(--foreground))`')
}
if (!/#spora-plugin-team-graph \.bg-card\{/.test(css)) {
    failures.push('stylesheet has no `bg-card` utility under the plugin scope (Tailwind dropped the card colour)')
}

/*
 * No bare `var(--<host token>)` — the failure mode with no signal.
 *
 * The host declares its design tokens as bare HSL *channel* triples
 * (`--border: 240 5.9% 90%` in `spora-frontend/src/style.css`), not
 * as colours. So `background: var(--muted)` is an **invalid value**,
 * and an invalid value is dropped at computed-value time with no build
 * error, no lint error and no failing test: the property falls back
 * to its inherited or initial value and the declaration is simply
 * gone. It shipped that way on `.tg-zoom-btn` for long enough that
 * the three zoom buttons rendered with no hover fill, no divider
 * between them and a full-strength icon, and nothing in the build
 * said a word about it.
 *
 * The fix is `hsl(var(--token))` everywhere, which is what
 * `src/style.css` does now and what `tests/style.spec.ts` asserts at
 * source level. This is the backstop on the *built* asset, so it also
 * covers rules contributed by `@spora-ai/components` and by anything
 * imported later.
 *
 * A `var(--token)` is legal here only as a colour function's argument:
 * `hsl(var(--muted))`, `hsl(var(--primary) / 0.45)`,
 * `color-mix(in srgb, hsl(var(--muted)) 14%, white)`. The list below is
 * the host's own token set — Tailwind's `--color-*` / `--tw-*`
 * variables and the plugin's local `--panel-fg` / `--tg-status-color`
 * are already full colours and are correctly absent from it.
 */
const HOST_HSL_TOKENS = [
    'background', 'foreground',
    'muted', 'muted-foreground',
    'border', 'input', 'ring',
    'primary', 'primary-foreground',
    'secondary', 'secondary-foreground',
    'destructive', 'destructive-foreground',
    'accent', 'accent-foreground',
]
for (const token of HOST_HSL_TOKENS) {
    // The captured window ends exactly where `var(` begins, so the test
    // below can ask whether that `var(` is a function's argument.
    const re = new RegExp(String.raw`(.{0,64})var\(--${token}\)`, 'g')
    for (const [, lead = ''] of css.matchAll(re)) {
        if (IS_FUNCTION_ARGUMENT.test(lead)) continue
        failures.push(
            `stylesheet uses a bare \`var(--${token})\`, which is an invalid value against an HSL-triple ` +
            `token and is dropped at computed-value time: \`…${lead}var(--${token})\``,
        )
    }
}

/*
 * Nothing in the plugin's stylesheet may style the host document.
 *
 * The host injects this file as a plain
 * `<link rel="stylesheet" href="/plugins/team-graph/style.css">` in
 * `document.head` (`spora-frontend/src/apps/registry.ts`), so any
 * unscoped rule here applies to the host SPA — not to the plugin. An
 * `html, body, #app { color: #1f2937; background: #f9fafb }` block
 * shipped for a long time and did exactly that: the host declares
 * `body { background-color: hsl(var(--background)) }` inside
 * `@layer base`, and an unlayered rule beats a layered one regardless
 * of order, so the whole host application was forced light for as
 * long as the plugin was mounted.
 *
 * The signature to guard on is the *declaration*, not the selector
 * name: `background:#f9fafb` / `color:#1f2937` are hard-coded
 * plugin-local values that must never appear, whereas a legitimate
 * `html`/`body` selector with no such value is not automatically a
 * bug. The value-level check is what actually catches the regression
 * if the rule is reintroduced with different colours.
 */
const leak = firstHostDocLeak(css)
if (leak !== null) {
    failures.push(`stylesheet leaks into the host document: ${leak}`)
}
if (css.includes('#f9fafb') || css.includes('#1f2937')) {
    failures.push('stylesheet contains the hard-coded dev-harness colours #f9fafb / #1f2937 (host tokens must be used)')
}

// The plugin root must carry the plugin-local typography. Its absence
// is what let the unscoped `html, body, #app` block look reasonable:
// with the scope in place, the same properties belong on the wrapper
// `App.vue` renders.
if (!/#spora-plugin-team-graph\s*\{[^}]*font-family/.test(css)) {
    failures.push("stylesheet does not set font-family on the plugin's #spora-plugin-team-graph root")
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
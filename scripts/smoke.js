#!/usr/bin/env node
/**
 * Static-analysis smoke check for the production plugin assets.
 *
 * Vue's top-level `createApp()`/`defineComponent()` calls need a real
 * renderer, so the IIFE wrapper is inspected as text rather than
 * evaluated. Every check below guards a boundary whose failure is silent
 * in the build: a missing binding or a renamed layer looks identical to a
 * working build, and an invalid CSS value is dropped at computed-value
 * time with no error anywhere.
 *
 * The stylesheet checks lock in the plugin boundary: utilities scoped
 * beneath `#spora-plugin-team-graph` (so plugin classes cannot escape the
 * slot), no Tailwind preflight (the host owns the reset), `@spora-ai/
 * components`' rules unrenamed inside `@layer components` (the Tailwind v3
 * `scopeVendorLayers` workaround must stay deleted), the plugin's own
 * `.tg-*` rules and `.surface-card` fill, no bare `var(--<host token>)`,
 * and `--color-card` / `--color-card-foreground` still emitted so the
 * detail panel keeps a surface in both themes.
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

const bindingRe = new RegExp(String.raw`(?:^|;|\n)\s*(?:var\s+${globalName}\s*=|window\.${globalName}\s*=)`, 'm')
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

// Preflight arrives in two shapes depending on the Tailwind major: v3
// resets `*, ::before, ::after` with `border-width: 0; border-style: solid`,
// v4 with `border: 0 solid`. Both are listed so a major bump cannot slip a
// reset past this guard; the rest are distinctive markers of v4's block.
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
 * Tailwind v3's PostCSS `normalizeTailwindDirectives` guard threw on that
 * bare at-rule, and the fix was a `scopeVendorLayers` pre-plugin renaming
 * it to `vendor-components`. v4 has no such guard, so the workaround is
 * gone and the layer name must be back to `components` — anything else
 * means someone re-introduced the rename.
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
// renders unstyled, which is invisible in a bundle-size diff. Swapping a
// selector out is fine; dropping a check is not.
for (const sel of ['.tg-node-card', '.tg-status-running', '.tg-edge-badge', '.surface-card']) {
    if (!css.includes(sel)) {
        failures.push(`stylesheet is missing the plugin's own ${sel} rule`)
    }
}

/*
 * The card surface must survive Tailwind's `@theme` tree-shaking.
 *
 * v4 emits a `--color-*` variable only while some template still uses
 * the utility it backs. Drop the last `bg-card` from a template and
 * `--color-card` disappears with it, at which point
 * `background-color: var(--color-card)` is an invalid value and the
 * panel is transparent — the same silent failure this file's other
 * guards exist for. `.surface-card` does not read the variable, so the
 * plugin keeps a working surface either way, but the utility path is
 * worth asserting because it is the one a refactor would remove.
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
 * (`--border: 240 5.9% 90%`), not as colours. So `background:
 * var(--muted)` is an **invalid value**, and an invalid value is dropped
 * at computed-value time with no build error, no lint error and no
 * failing test: the property falls back to its inherited or initial
 * value and the declaration is simply gone. It shipped that way on
 * `.tg-zoom-btn` long enough that the zoom buttons rendered with no
 * hover fill and nothing in the build said a word.
 *
 * A `var(--token)` is legal only as a colour function's argument:
 * `hsl(var(--muted))`, `hsl(var(--primary) / 0.45)`,
 * `color-mix(in srgb, hsl(var(--muted)) 14%, white)`. The list below is
 * the host's own token set — Tailwind's `--color-*` / `--tw-*` and the
 * plugin's local `--panel-fg` / `--tg-status-color` are already full
 * colours and are correctly absent. This is the backstop on the *built*
 * asset, so it also covers rules from `@spora-ai/components`.
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
 * The host injects this file as a plain `<link rel="stylesheet">` in
 * `document.head`, so any unscoped rule here applies to the host SPA —
 * not to the plugin. An `html, body, #app { color: #1f2937; background:
 * #f9fafb }` block shipped for a long time and did exactly that: the
 * host declares `body { background-color: hsl(var(--background)) }`
 * inside `@layer base`, and an unlayered rule beats a layered one
 * regardless of order, so the whole host application was forced light.
 *
 * The signature to guard on is the *declaration*, not the selector name:
 * a hard-coded plugin-local colour must never appear, whereas a
 * legitimate `html`/`body` selector with no such value is not
 * automatically a bug. `firstHostDocLeak` implements that; see
 * `cssGuards.js`.
 */
const leak = firstHostDocLeak(css)
if (leak !== null) {
    failures.push(`stylesheet leaks into the host document: ${leak}`)
}
if (css.includes('#f9fafb') || css.includes('#1f2937')) {
    failures.push('stylesheet contains the hard-coded dev-harness colours #f9fafb / #1f2937 (host tokens must be used)')
}

// The plugin root must carry the plugin-local typography: with the scope
// in place, those properties belong on the wrapper `App.vue` renders.
if (!/#spora-plugin-team-graph\s*\{[^}]*font-family/.test(css)) {
    failures.push("stylesheet does not set font-family on the plugin's #spora-plugin-team-graph root")
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
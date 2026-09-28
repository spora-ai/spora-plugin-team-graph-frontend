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
 *  - the stylesheet still carries the plugin's own `.tg-*` rules.
 */
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
for (const sel of ['.tg-node-accent', '.tg-status-running']) {
    if (!css.includes(sel)) {
        failures.push(`stylesheet is missing the plugin's own ${sel} rule`)
    }
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
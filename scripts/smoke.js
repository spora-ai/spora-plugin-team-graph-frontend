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
 *  - the stylesheet omits Tailwind preflight (the host owns the reset).
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

const preflightRe = /box-sizing\s*:\s*border-box;\s*border-width\s*:\s*0;\s*border-style\s*:\s*solid/
if (preflightRe.test(css)) {
    failures.push('stylesheet contains the Tailwind preflight reset (host owns this)')
}

if (failures.length > 0) {
    console.error('smoke: FAIL')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
}

console.log('smoke: OK')
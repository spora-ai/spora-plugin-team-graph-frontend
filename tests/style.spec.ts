import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * `src/style.css` — the plugin's own stylesheet, read as text.
 *
 * A stylesheet is not unit-testable through happy-dom (no cascade, no
 * layout), but the invariants the canvas depends on *are* checkable as
 * text, and they are exactly the ones that regress silently: a rule
 * that lets a Mermaid node box paint, or one that fades the card's own
 * surface, produces a wrong picture with no failing test.
 * `scripts/smoke.js` already reads this file for the preflight
 * assertion; these tests cover the visual contract.
 */
const styleCss = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

/**
 * Collapse whitespace *and* strip comments, so a rule can be matched as
 * one line and a `selector { … }` quoted inside a doc comment cannot
 * be mistaken for a real rule.
 */
const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ')

/** Every (selector-list, body) pair in the file, comment-free. */
function rules(): Array<{ selectors: string[]; body: string }> {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors = '', body = '']) => ({
        selectors: selectors.split(',').map((s) => s.trim()).filter(Boolean),
        body,
    }))
}

/** The concatenated body of every rule that targets `selector`. */
function declarationsFor(selector: string): string {
    return rules()
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join(' ')
}

describe('style.css — Mermaid node boxes stay invisible', () => {
    it('forces fill and stroke transparent on every node shape, for every state', () => {
        // Keyed on `g.node`, not on `g.node.selected` / `.dimmed` /
        // `.hover` — so nothing the selection store or a pointer does
        // can re-expose a fill. This is the rule that keeps the Vue card
        // the only painted node box on the canvas.
        expect(css).toContain(
            '#spora-plugin-team-graph .tg-canvas-content svg g.node rect, ' +
            '#spora-plugin-team-graph .tg-canvas-content svg g.node polygon, ' +
            '#spora-plugin-team-graph .tg-canvas-content svg g.node circle, ' +
            '#spora-plugin-team-graph .tg-canvas-content svg g.node ellipse ' +
            '{ fill: transparent !important; stroke: transparent !important; }',
        )
    })

    it('never paints a fill or a stroke on a Mermaid node shape', () => {
        // Any rule targeting a `g.node` shape may only set
        // `pointer-events`. A future "selected node" treatment that adds
        // a fill would light up a box the Vue card is supposed to own.
        for (const { selectors, body } of rules()) {
            if (!selectors.some((s) => /svg\s+g\.node\b/.test(s))) continue
            if (selectors.some((s) => s.includes('pointer-events'))) continue
            for (const [, value = ''] of body.matchAll(/(?:^|[\s;])(?:fill|stroke)\s*:\s*([^;]+)/g)) {
                const keyword = value.trim().split(/\s+/)[0]
                expect(['none', 'transparent'], `${keyword} in rule: ${selectors.join(', ')}`).toContain(keyword)
            }
        }
    })

    it('leaves the node boxes non-interactive so empty canvas stays pannable', () => {
        expect(css).toContain('.tg-canvas-content svg g.node { pointer-events: none; }')
    })
})

describe('style.css — the card always paints an opaque prototype-M surface', () => {
    it('paints the prototype surface: white, 10 px radius, prototype shadow', () => {
        const rule = declarationsFor('.tg-node-card')
        expect(rule).toContain('background: #fff')
        expect(rule).toContain('border: 1.5px solid #7c3aed')
        expect(rule).toContain('border-radius: 10px')
        expect(rule).toContain('padding: 9px 13px')
        expect(rule).toContain('width: 240px')
        expect(rule).toContain('height: 76px')
        expect(rule).toContain('box-shadow: 0 2px 6px -2px rgba(15, 23, 41, 0.08)')
    })

    it('never fades the card itself — only its contents', () => {
        // The regression: `opacity: 0.28` on `.is-dimmed` faded the
        // button, so a dimmed card stopped being an opaque white
        // surface (measured: it rendered #f9fafb, the canvas showing
        // through, where an un-dimmed card renders #ffffff) and read as
        // a pale, half-painted box.
        expect(declarationsFor('.tg-node-card.is-dimmed')).not.toMatch(/\bopacity\s*:/)
        expect(declarationsFor('.tg-node-card')).not.toMatch(/\bopacity\s*:/)
        expect(css).toContain('.tg-node-card.is-dimmed > * { opacity: 0.35; }')
    })

    it('uses opaque border colours in every selection state', () => {
        for (const state of ['is-selected', 'is-adjacent', 'is-dimmed']) {
            const border = /border-color: ([^;]+);/.exec(declarationsFor(`.tg-node-card.${state}`))?.[1] ?? ''
            expect(border, `border-color for .${state}`).not.toBe('')
            // A `rgba()` border composites against whatever is behind
            // it, so the edge was a wash rather than a colour.
            expect(border, `border-color for .${state}`).not.toContain('rgba(')
        }
    })
})

describe('style.css — the avatar tile shape', () => {
    it('forces the initials tile to the prototype\'s rounded square, unlayered', () => {
        // The package ships `.avatar--initials[data-v-0a52efe6] { border-radius: 9999px }`
        // inside `@layer components`; an unlayered rule beats a layered
        // one regardless of specificity, which is why this needs no
        // `!important`. `.avatar--sm`, the archetype branch, is 0.5rem.
        expect(css).toContain(
            '.tg-node-card-avatar.avatar--initials, .tg-agent-tile .avatar--initials, .tg-agent-tile { border-radius: 0.5rem; }',
        )
    })

    it('gives the detail-panel status ring the same radius as the tile it wraps', () => {
        // A `box-shadow` ring is clipped to the element's own radius, so
        // a circular wrapper around a square tile drew a circle.
        expect(declarationsFor('.tg-agent-tile')).toContain(
            'box-shadow: 0 0 0 2px var(--tg-status-ring, transparent)',
        )
        // The only border-radius on the wrapper comes from the shared
        // tile-shape rule, and it matches the 0.5rem square the tile
        // itself paints — never the 9999px circle it used to be.
        const radii = [...css.matchAll(/\.tg-agent-tile\b[^{}]*\{([^{}]*)\}/g)]
            .map((m) => /border-radius: ([^;]+);/.exec(m[1] ?? '')?.[1])
            .filter(Boolean)
        expect(new Set(radii)).toEqual(new Set(['0.5rem']))
    })
})

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

/**
 * The body of the `@theme` block — the file's stand-in for `:root`.
 * Tailwind emits these declarations to `:root` in the built sheet, and
 * only the ones some utility consumes (see the card-surface tests).
 *
 * Read with its own regex rather than through `rules()`: the generic
 * parser splits a selector list on commas, and everything above
 * `@theme` is a run of at-rule *statements* — including
 * `@custom-variant dark (&:where(.dark, .dark *))`, whose argument has
 * a comma in it. Only the `{ … }` pair identifies the block.
 */
function themeBlock(): string {
    return /@theme\s*\{([^{}]*)\}/.exec(css)?.[1] ?? ''
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

/**
 * The host's design tokens, verbatim from
 * `spora-frontend/src/style.css` `:root` / `.dark`. They are **bare HSL
 * channel triples**, not colours: `--muted` is `240 4.8% 95.9%`, so
 * `var(--muted)` on its own is a syntactically valid `var()` whose
 * *substituted value* is not a colour. CSS resolves that at
 * computed-value time by discarding the whole declaration — no build
 * error, no lint error, no failing test, and a property that quietly
 * falls back to its inherited or initial value.
 *
 * That is the bug class this block exists for. `.tg-zoom-btn` shipped
 * the bare form for its icon colour, its hover fill and its divider;
 * the first silently rendered the button in the page's *text* colour
 * (so the three glyphs read at heading weight), the second produced no
 * hover affordance at all, and the third — being a `border-top`
 * *shorthand* — was dropped whole, leaving three floating buttons with
 * no seam between them.
 *
 * `scripts/smoke.js` runs the same sweep over the *built* stylesheet;
 * these tests run it over the source, so a regression fails `npm test`
 * and `npm run smoke` alike.
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

describe('style.css — host tokens are always wrapped in a colour function', () => {
    it('never uses a bare `var(--<host token>)`', () => {
        // `css` is already comment-stripped, so a `var(--border)`
        // quoted inside a doc comment cannot trip this.
        for (const token of HOST_HSL_TOKENS) {
            for (const [, lead = ''] of css.matchAll(new RegExp(`(.{0,64})var\\(--${token}\\)`, 'g'))) {
                // Legal only as a colour function's argument:
                // `hsl(var(--muted))`, `hsl(var(--primary) / 0.45)`,
                // `color-mix(in srgb, hsl(var(--muted)) 14%, white)`.
                const wrapped = /[a-z-]+\(\s*$/i.test(lead)
                expect(
                    wrapped,
                    `bare \`var(--${token})\` in: …${lead}var(--${token})`,
                ).toBe(true)
            }
        }
    })

    it('resolves the zoom button\'s colour, hover fill and divider', () => {
        // The three declarations that were wrong, asserted directly so
        // the failure names the control rather than a token.
        expect(declarationsFor('.tg-zoom-btn')).toContain('color: hsl(var(--muted-foreground))')
        expect(declarationsFor('.tg-zoom-btn:hover')).toContain('background: hsl(var(--muted))')
        expect(declarationsFor('.tg-zoom-btn:hover')).toContain('color: hsl(var(--foreground))')
        expect(declarationsFor('.tg-zoom-btn + .tg-zoom-btn')).toContain('border-top: 1px solid hsl(var(--border))')
    })
})

describe('style.css — the cards have a real surface', () => {
    it('maps the card colour to the host\'s own card mapping', () => {
        // `spora-frontend/src/style.css:117` reads
        // `--color-card: hsl(var(--background))`: in this design system a
        // card *is* the page background, separated by `border-border` and
        // a radius. Copied rather than invented, so the plugin can never
        // drift from the app it is embedded in — and so light and dark
        // both come for free from the host's own `.dark` toggle.
        // Note there is no host `--card` token to read: shadcn's name
        // is a *Tailwind* colour here, and the host has never declared
        // it. `hsl(var(--card))` would be a fresh silent failure.
        expect(themeBlock()).toContain('--color-card: hsl(var(--background))')
        // The host has no `card-foreground` utility either, so this is
        // the one value with no line to copy. `hsl(var(--foreground))`
        // invents nothing: it is what the panel's text already
        // inherited before the class resolved to anything.
        expect(themeBlock()).toContain('--color-card-foreground: hsl(var(--foreground))')
    })

    it('defines `.surface-card` so the class on five elements is not inert', () => {
        // `surface-card` appears in `AgentDetailPanel.vue`,
        // `TeamGraphCanvas.vue` and `TeamGraphPage.vue` and used to be
        // defined nowhere, so the panel rendered on whatever the host
        // painted behind it. It carries the fill itself rather than
        // reading `var(--color-card)`: Tailwind v4 tree-shakes `@theme`
        // variables that no utility consumes, so a hand-written rule
        // leaning on one would go transparent the moment the last
        // `bg-card` left a template.
        expect(declarationsFor('.surface-card')).toContain('background-color: hsl(var(--background))')
    })

    it('paints the surface with a host token, never a hard-coded colour', () => {
        // The regression the file's own header warns about: pinning
        // `color: #1f2937` on the panel would have hard-coded a
        // light-theme text colour onto a surface that has to work in
        // dark too.
        const surface = declarationsFor('.surface-card')
        expect(surface).not.toMatch(/#[0-9a-f]{3,8}\b/i)
        expect(surface).not.toContain('rgba(')
    })
})


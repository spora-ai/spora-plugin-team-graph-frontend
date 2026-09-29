import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    NODE_CARD_AVATAR_SIZE,
    NODE_CARD_BADGE_HEIGHT,
    NODE_CARD_BORDER,
    NODE_CARD_HEIGHT,
    NODE_CARD_PADDING_BLOCK,
    NODE_CARD_PILL_HEIGHT,
    NODE_CARD_ROW2_HEIGHT,
    NODE_CARD_ROW_GAP,
    NODE_CARD_WIDTH,
    SVG_PADDING,
    edgeEndsFromMermaidId,
    measureNodePositions,
    nodeIdFromMermaidId,
    parseTranslate,
    viewBoxOrigin,
} from '../../src/lib/nodeLayout'
import { statusLabel } from '../../src/lib/nodeStatus'
import type { WireStatus } from '../../src/types'

/**
 * `lib/nodeLayout.ts` — the Option C coordinate bridge.
 *
 * The card overlay and the Mermaid SVG are siblings inside one
 * transformed element, so the only question these helpers answer is
 * "where, in content-layer pixels, is the node Mermaid placed at?".
 * The answer is `translate(cx, cy)` minus the SVG's viewBox origin
 * minus half the card — everything else is CSS.
 */

describe('node card constants', () => {
    it('keeps the Variant M width and derives the height from the box\'s own parts', () => {
        // 240 px of width is the prototype's and is not negotiable; the
        // height is *computed*, so the tile, the padding, the border, the
        // row gap and the status row can never add up to less than
        // the box they have to fit inside. Every term is a named constant,
        // so a resize is a one-line change in all three consumers
        // (`nodeLayout`, `edgeGeometry`, `useMermaidRender`) and this
        // arithmetic follows.
        expect(NODE_CARD_WIDTH).toBe(240)
        expect(NODE_CARD_HEIGHT).toBe(
            NODE_CARD_BORDER * 2 +
            NODE_CARD_PADDING_BLOCK * 2 +
            NODE_CARD_AVATAR_SIZE +
            NODE_CARD_ROW_GAP +
            NODE_CARD_ROW2_HEIGHT,
        )
        // 1.5×2 border + 9×2 padding + 44 tile + 4 gap + 19.2 status row.
        expect(NODE_CARD_HEIGHT).toBe(88.2)
    })

    it('reserves the tile the whole headline row, so the two can be aligned', () => {
        /*
         * The tile is the package's `size="md"` (2.75rem → 44 px) and the
         * headline row is the tile's own edge, which is what lets
         * `.tg-node-card-row1 { block-size: var(--tg-avatar-size) }` put
         * the name's line box on the tile's centre line. Measured in the
         * browser: 0.000 px between the two centres, both themes.
         */
        expect(NODE_CARD_AVATAR_SIZE).toBe(44)
    })

    it('derives the status row from its two boxes instead of reserving a worst case', () => {
        /*
         * The row is exactly as tall as the taller of the two boxes it
         * holds. The pill is one line (`.tg-node-card-pill` sets
         * `white-space: nowrap` + `text-overflow: ellipsis`), so its box
         * is 11 px × 1.2 + 2 × 3 = 19.2 px; the badges are
         * 10 px × 1.4 + 2 × 1 = 16 px. The pill wins, so the row is
         * 19.2 px and the card is 88.2 px — not the 115 px it was when the
         * row reserved the pill's three-line height.
         */
        expect(NODE_CARD_PILL_HEIGHT).toBeCloseTo(19.2, 5)
        expect(NODE_CARD_BADGE_HEIGHT).toBeCloseTo(16, 5)
        expect(NODE_CARD_ROW2_HEIGHT).toBe(Math.max(NODE_CARD_PILL_HEIGHT, NODE_CARD_BADGE_HEIGHT))
        // The old worst case (the pill on three lines) is 45.6 px; the row
        // must NOT reserve it any more, or the 26.8 px hole comes back.
        const threeLinePill = 3 * 13.2 + 2 * 3
        expect(threeLinePill).toBeCloseTo(45.6, 1)
        expect(NODE_CARD_ROW2_HEIGHT).toBeLessThan(threeLinePill)
    })

    it('leaves a positive margin around the rendered content', () => {
        expect(SVG_PADDING).toBeGreaterThan(0)
    })
})

/**
 * The status row fits every label `statusLabel()` can produce, on one
 * line, with no card overflow — the property the 46 px worst-case reserve
 * used to buy by brute force and that `.tg-node-card-pill`'s
 * `text-overflow: ellipsis` now buys by construction.
 *
 * **What this can and cannot assert without a layout engine.** happy-dom
 * has no cascade, no flexbox and no text metrics, so the *rendered* pill
 * box is measured in a real browser (see `tests/fixtures/`) and reported in
 * the change that introduced it. What is assertable here — and what would
 * actually regress — is the contract the CSS and the constants encode:
 *
 *   1. The row is one line tall for *every* status, so no label can make
 *      the row, and therefore the card, taller than `NODE_CARD_HEIGHT`.
 *      The pill's reserved height is its single-line height by
 *      construction (`NODE_CARD_PILL_HEIGHT`).
 *   2. The card's declared height accommodates that row plus everything
 *      above it (the height is the sum, asserted above), so a one-line row
 *      cannot overflow the box.
 *   3. The pill cannot grow horizontally past the row: `flex-shrink: 1`
 *      plus `min-width: 0` lets it shrink to the row's own width, and
 *      `overflow: hidden` + `text-overflow: ellipsis` clips whatever is
 *      left rather than pushing the edge-count badges off the card.
 *
 * The 11 labels are asserted to be non-empty and to include the longest
 * one, so a future `statusLabel()` that returns something longer is caught
 * here rather than only on screen.
 */
describe('the status row fits every real status on one line', () => {
    const ALL: WireStatus[] = [
        'RUNNING',
        'PENDING_APPROVAL',
        'AWAITING_SUB_AGENTS',
        'AWAITING_INPUT',
        'AWAITING_FINAL_APPROVAL',
        'APPROVED',
        'FAILED',
        'ABORTED',
        'COMPLETED',
        'CANCELLED',
        'QUEUED',
    ]
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\s+/g, ' ')

    it('has 11 statuses, and the longest label is the three-word one', () => {
        expect(ALL).toHaveLength(11)
        const labels = ALL.map((s) => statusLabel(s))
        expect(labels.every((l) => l.length > 0)).toBe(true)
        expect(statusLabel('AWAITING_FINAL_APPROVAL')).toBe('awaiting final approval')
        // The label that used to force the three-line reserve.
        expect(labels).toContain('awaiting final approval')
    })

    it('renders the card pill on a single, ellipsised line so no status can overflow', () => {
        // These three declarations are the whole mechanism, asserted as
        // text because happy-dom cannot lay them out. `min-width: 0` is
        // load-bearing (a flex item's automatic minimum size is its
        // min-content width, so a `nowrap` pill without it refuses to
        // shrink and pushes the badges off the card); `overflow: hidden` +
        // `text-overflow: ellipsis` are what make the remainder a truncated
        // label rather than a clipped one.
        expect(css).toContain(
            '.tg-node-card-pill { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        )
    })

    it('never lets the row exceed one line, whatever the label', () => {
        // The card cannot overflow because its height is the sum of parts
        // and the status row is one of those parts at a fixed, single-line
        // size. The assertion is a pair of bounds: the row is *at least*
        // the pill (so the pill is never clipped by its own row) and
        // *strictly less* than the three-line worst case (so the reserve
        // is gone and the hole cannot come back).
        expect(NODE_CARD_ROW2_HEIGHT).toBeGreaterThanOrEqual(NODE_CARD_PILL_HEIGHT)
        expect(NODE_CARD_ROW2_HEIGHT).toBeLessThan(3 * 13.2 + 2 * 3)
        // And the whole card still has room for it.
        expect(NODE_CARD_HEIGHT).toBeGreaterThanOrEqual(NODE_CARD_PILL_HEIGHT)
    })
})

/**
 * The footprint is load-bearing in four places, and three of them read
 * these constants — so the fourth (the CSS that actually paints the box)
 * has to read them too, or the arrowheads detach from the cards again.
 * This is the guard on that seam: it fails the build if a
 * `width: 240px; height: …` pair ever reappears in the stylesheet
 * next to the constants that define it.
 */
describe('the stylesheet takes the card footprint from these constants', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\s+/g, ' ')

    it('states no width or height of its own on the card', () => {
        const body = /\.tg-node-card\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
        expect(body).not.toMatch(/(?:^|[;\s])width\s*:/)
        expect(body).not.toMatch(/(?:^|[;\s])height\s*:/)
    })

    it('takes the tile edge and the headline row from the same custom property', () => {
        // The package sizes its tile in `rem`, which tracks the *root*
        // font size, while the card is a fixed px box. Both consumers
        // therefore read `--tg-avatar-size`, which
        // `AgentNodeCard.vue` sets from `NODE_CARD_AVATAR_SIZE`.
        expect(css).toContain(
            '.tg-node-card-avatar { inline-size: var(--tg-avatar-size); block-size: var(--tg-avatar-size);',
        )
        expect(css).toContain(
            '.tg-node-card-row1 { display: flex; align-items: center; gap: 6px; block-size: var(--tg-avatar-size); }',
        )
    })

    it('reserves the status row the derived height is built from', () => {
        // If this drifts from `NODE_CARD_ROW2_HEIGHT` the card either
        // grows a hole or clips its own pill — the derivation would still
        // be self-consistent and still wrong.
        expect(css).toContain(`min-height: ${NODE_CARD_ROW2_HEIGHT}px;`)
        expect(css).toContain(`margin-top: ${NODE_CARD_ROW_GAP}px;`)
        expect(css).toContain(`padding: ${NODE_CARD_PADDING_BLOCK}px 13px;`)
        expect(css).toContain(`border: ${NODE_CARD_BORDER}px solid #7c3aed;`)
    })

    it('pins the tile to the top padding edge, not the middle of the card', () => {
        // With `center` the tile would be centred on the *body* — which
        // also holds the status row — and would sit beside the pill
        // instead of the name.
        expect(css).toContain('.tg-node-card {')
        expect(/\.tg-node-card\s*\{[^}]*align-items:\s*flex-start;/.test(css)).toBe(true)
    })

    it('rounds the tile the same way on every Avatar branch, not just the initials one', () => {
        // `.avatar--md` is `.75rem` and `.avatar--initials` is `9999px`,
        // so without a rule on the tile element itself the same card
        // would draw a 12 px-rounded square with an archetype and a
        // circle without one.
        expect(css).toContain(
            '.tg-node-card-avatar, .tg-node-card-avatar.avatar--initials, ' +
            '.tg-agent-tile .avatar--initials, .tg-agent-tile { border-radius: 0.5rem; }',
        )
    })
})

describe('nodeIdFromMermaidId', () => {
    it('parses the standard flowchart-n<id>-<i> format', () => {
        expect(nodeIdFromMermaidId('flowchart-n11-2')).toBe(11)
        expect(nodeIdFromMermaidId('flowchart-n1-0')).toBe(1)
    })

    it('returns null for unrecognised ids', () => {
        expect(nodeIdFromMermaidId('flowchart-11-2')).toBeNull()
        expect(nodeIdFromMermaidId('node-1')).toBeNull()
        expect(nodeIdFromMermaidId('')).toBeNull()
    })
})

describe('edgeEndsFromMermaidId', () => {
    it('parses the Mermaid 10 L-n<src>-n<tgt>-<idx> form', () => {
        expect(edgeEndsFromMermaidId('L-n1-n2-0')).toEqual([1, 2])
        expect(edgeEndsFromMermaidId('L-n42-n7-3')).toEqual([42, 7])
    })

    it('still recognises the Mermaid 9 flowchart-n<src>_n<tgt>-<idx> form', () => {
        expect(edgeEndsFromMermaidId('flowchart-n4-n9-1')).toEqual([4, 9])
    })

    it('accepts the index-less forms (a single edge between the two nodes)', () => {
        expect(edgeEndsFromMermaidId('L-n1-n2')).toEqual([1, 2])
        expect(edgeEndsFromMermaidId('flowchart-n4-n9')).toEqual([4, 9])
    })

    it('returns null for ids that carry no edge ends', () => {
        expect(edgeEndsFromMermaidId('L-n1')).toBeNull()
        expect(edgeEndsFromMermaidId('nonsense')).toBeNull()
        expect(edgeEndsFromMermaidId('')).toBeNull()
    })
})

describe('parseTranslate', () => {
    it('reads the two-argument translate Mermaid writes for nodes', () => {
        expect(parseTranslate('translate(123.5, 67.25)')).toEqual({ x: 123.5, y: 67.25 })
    })

    it('treats the one-argument form as y = 0', () => {
        expect(parseTranslate('translate(40)')).toEqual({ x: 40, y: 0 })
    })

    it('accepts negative and exponent notation', () => {
        expect(parseTranslate('translate(-10, -2.5e2)')).toEqual({ x: -10, y: -250 })
    })

    it('returns null for a missing, unparseable, or non-numeric transform', () => {
        expect(parseTranslate(null)).toBeNull()
        expect(parseTranslate('')).toBeNull()
        expect(parseTranslate('scale(2)')).toBeNull()
        expect(parseTranslate('translate(a, b)')).toBeNull()
    })
})

describe('viewBoxOrigin', () => {
    it('reads the min-x / min-y pair from a space-separated viewBox', () => {
        expect(viewBoxOrigin('-20 -10 400 300')).toEqual({ x: -20, y: -10 })
    })

    it('reads a comma-separated viewBox', () => {
        expect(viewBoxOrigin('-20,-10,400,300')).toEqual({ x: -20, y: -10 })
    })

    it('returns null when the viewBox is missing, short, or non-numeric', () => {
        expect(viewBoxOrigin(null)).toBeNull()
        expect(viewBoxOrigin('')).toBeNull()
        expect(viewBoxOrigin('0 0 100')).toBeNull()
        expect(viewBoxOrigin('a b c d')).toBeNull()
    })
})

/** Build a `<g class="node">` with the transform Mermaid emits. */
function makeNode(id: string, transform: string | null): SVGGElement {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    el.setAttribute('class', 'node')
    el.setAttribute('id', id)
    if (transform !== null) el.setAttribute('transform', transform)
    return el
}

describe('measureNodePositions', () => {
    function makeSvg(viewBox: string | null, nodes: SVGGElement[]): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        if (viewBox !== null) svg.setAttribute('viewBox', viewBox)
        for (const n of nodes) svg.appendChild(n)
        return svg
    }

    it('converts a node centre into a card top-left in content-layer pixels', () => {
        /* Centre (200, 150) in SVG user space; a viewBox origin of
         * (-20, -10) offsets user space from the content layer's
         * (0, 0), so the centre lands at (220, 160) in content-layer
         * pixels — minus half the card. */
        const svg = makeSvg('-20 -10 400 300', [makeNode('flowchart-n7-0', 'translate(200, 150)')])
        expect(measureNodePositions(svg)).toEqual({
            7: { x: 220 - NODE_CARD_WIDTH / 2, y: 160 - NODE_CARD_HEIGHT / 2 },
        })
    })

    it('measures every node and ignores ids Mermaid did not generate', () => {
        const svg = makeSvg('0 0 900 700', [
            makeNode('flowchart-n1-0', 'translate(0, 0)'),
            makeNode('flowchart-n2-0', 'translate(300, 100)'),
            makeNode('not-a-node', 'translate(999, 999)'),
        ])
        const positions = measureNodePositions(svg)
        expect(Object.keys(positions)).toEqual(['1', '2'])
        expect(positions[2]).toEqual({ x: 300 - NODE_CARD_WIDTH / 2, y: 100 - NODE_CARD_HEIGHT / 2 })
    })

    it('skips nodes whose transform cannot be read rather than guessing', () => {
        const svg = makeSvg('0 0 900 700', [
            makeNode('flowchart-n1-0', null),
            makeNode('flowchart-n2-0', 'scale(2)'),
            makeNode('flowchart-n3-0', 'translate(60, 60)'),
        ])
        expect(Object.keys(measureNodePositions(svg))).toEqual(['3'])
    })

    it('returns an empty map when the viewBox is unusable (nothing is positioned at the origin)', () => {
        const svg = makeSvg(null, [makeNode('flowchart-n1-0', 'translate(50, 50)')])
        expect(measureNodePositions(svg)).toEqual({})
    })

    it('honours an explicit card size override', () => {
        const svg = makeSvg('0 0 900 700', [makeNode('flowchart-n1-0', 'translate(100, 100)')])
        expect(measureNodePositions(svg, 40, 20)).toEqual({ 1: { x: 80, y: 90 } })
    })
})

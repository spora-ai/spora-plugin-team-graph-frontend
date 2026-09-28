import { describe, it, expect } from 'vitest'
import {
    NODE_CARD_HEIGHT,
    NODE_CARD_WIDTH,
    SVG_PADDING,
    edgeEndsFromMermaidId,
    measureNodePositions,
    nodeIdFromMermaidId,
    parseTranslate,
    viewBoxOrigin,
} from '../../src/lib/nodeLayout'

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
    it('pins the Variant M footprint at 240 × 76 px', () => {
        expect(NODE_CARD_WIDTH).toBe(240)
        expect(NODE_CARD_HEIGHT).toBe(76)
    })

    it('leaves a positive margin around the rendered content', () => {
        expect(SVG_PADDING).toBeGreaterThan(0)
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

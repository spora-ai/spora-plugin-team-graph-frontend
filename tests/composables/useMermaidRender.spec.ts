import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useMermaidRender } from '../../src/composables/useMermaidRender'
import {
    NODE_CARD_HEIGHT,
    NODE_CARD_WIDTH,
    SVG_PADDING,
    nodeIdFromMermaidId,
} from '../../src/lib/nodeLayout'
import { ARROWHEAD_OVERSHOOT, parsePathPoints } from '../../src/lib/edgeGeometry'
import { useSelectionStore } from '../../src/stores/selection'
import type { GraphPayload } from '../../src/types'

/**
 * useMermaidRender — drive the Mermaid render lifecycle.
 *
 * `mermaid.render` (and `mermaid.initialize`) are mocked so the
 * composable can exercise its whole post-processing pipeline — node
 * box resize, viewBox reset, position measurement, edge styling —
 * without pulling the real 600 KB Mermaid runtime into the test.
 *
 * The SVG fixtures mimic what Mermaid 10 emits for
 * `htmlLabels: false`: a `transform="translate(cx, cy)"` per
 * `g.node`, a `rect.basic.label-container` sized from the text, and
 * `path.flowchart-link` elements with `L-n<src>-n<tgt>-<idx>` ids.
 * `getBBox()` is stubbed on the prototype because happy-dom has no
 * layout engine.
 */

const renderFn = vi.fn()
const initializeFn = vi.fn()

vi.mock('mermaid', () => ({
    default: {
        initialize: (cfg: unknown) => initializeFn(cfg),
        render: (id: string, source: string) => renderFn(id, source),
    },
}))

const BBOX = { x: 0, y: 0, width: 400, height: 300 }

function makeSvgFixture(centres: Array<[number, [number, number]]> = [[1, [200, 40]], [2, [200, 160]]]): string {
    const nodes = centres
        .map(
            ([id, [cx, cy]]) =>
                `<g class="node" id="flowchart-n${id}-0" transform="translate(${cx}, ${cy})">` +
                `<rect class="basic label-container" x="-30" y="-12" width="60" height="24" />` +
                `<g class="label"><text><tspan>Agent ${id}</tspan></text></g></g>`,
        )
        .join('')
    return `<svg viewBox="0 0 200 100" style="max-width: 200px" width="200" height="100">${nodes}` +
        `<path class="flowchart-link LS-n1 LE-n2" id="L-n1-n2-0" d="M200 52 L200 148" />` +
        // The path Mermaid 10 really emits for a `curveBasis` edge:
        // `M <q₀> L <blend> C … C … L <qₙ>`. These are d3's `Basis`
        // emission of Mermaid's `curveBundle(0.85)` through the routed
        // spline points (200,52) → (240,100) → (200,148), serialised at
        // Mermaid's own 3 decimals — so `edgeGeometry` recognises it as
        // the one shape the shipped `flowchart.curve` produces and takes
        // its own `reanchorBundleBasis` path, not the polyline fallback.
        // It used to be a hand-written `M L C C L` that only *looked*
        // like one, which the bundle-basis decoder rightly declined.
        `<path class="flowchart-link LS-n1 LE-n2" id="L-n1-n2-9" d="M200,52L205.667,60C211.333,68,222.667,84,222.667,100C222.667,116,211.333,132,205.667,140L200,148" />` +
        `<path class="flowchart-link" id="L-unparseable" d="M0,0H10" />` +
        `<path class="flowchart-link" id="L-n1-n99-0" d="M200 52 L200 148" />` +
        `</svg>`
}

const tinyStartup: GraphPayload = {
    principal: { id: 7, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' } },
        { id: 2, name: 'Blake', role: 'Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3, profile_picture: { palette_key: 'amber', bg_color: '#D97706', fg_color: '#FFFBEB' } },
    ],
    edges: [
        { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
    ],
    generated_at: '2026-09-25T08:14:00Z',
}

function host(): HTMLElement {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
}

beforeEach(() => {
    setActivePinia(createPinia())
    renderFn.mockReset()
    initializeFn.mockReset()
    Object.defineProperty(SVGSVGElement.prototype, 'getBBox', {
        value: () => ({ ...BBOX }) as DOMRect,
        configurable: true,
        writable: true,
    })
})

/**
 * Must stay the FIRST describe in this file: `ensureMermaidInit()`
 * latches a module-level `mermaidInitialised` flag, so the only place
 * the initialisation config can be observed is the first render of the
 * module's lifetime.
 */
describe('useMermaidRender — Mermaid initialisation', () => {
    it('initialises once, with htmlLabels off and card-sized spacing', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        useMermaidRender({ hostRef: ref<HTMLElement | null>(host()), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))

        expect(initializeFn).toHaveBeenCalledTimes(1)
        const cfg = initializeFn.mock.calls[0][0] as {
            startOnLoad: boolean
            securityLevel: string
            flowchart: { htmlLabels: boolean; nodeSpacing: number; rankSpacing: number; useMaxWidth: boolean }
        }
        expect(cfg.startOnLoad).toBe(false)
        expect(cfg.securityLevel).toBe('loose')
        // The card is a Vue component in an HTML overlay; a
        // `<foreignObject>` label would be unmountable by Vue.
        expect(cfg.flowchart.htmlLabels).toBe(false)
        expect(cfg.flowchart.useMaxWidth).toBe(false)
        // Both spacings are lower bounds on the gap dagre leaves
        // between node boxes, sized so the cards can never
        // overlap. This is the layout guarantee, pinned.
        expect(cfg.flowchart.nodeSpacing).toBeGreaterThanOrEqual(NODE_CARD_WIDTH)
        expect(cfg.flowchart.rankSpacing).toBeGreaterThanOrEqual(NODE_CARD_HEIGHT)

        // A second render must not re-initialise.
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        const { reRender } = useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await reRender()
        expect(initializeFn).toHaveBeenCalledTimes(1)
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

describe('useMermaidRender — render lifecycle', () => {
    it('renders Mermaid once per payload and commits the SVG', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })

        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        expect(el.querySelectorAll('g.node')).toHaveLength(2)
        // The source is the new minimal contract: one quoted label per
        // node, no classDef, no HTML.
        const source = renderFn.mock.calls[0][1] as string
        expect(source).toContain('  n1["Alex"]')
        expect(source).not.toContain('classDef')
    })

    it('re-renders when the graph ref changes', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const hostRef = ref<HTMLElement | null>(host())
        const graph = ref<GraphPayload | null>(tinyStartup)
        useMermaidRender({ hostRef, graph })

        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        graph.value = { ...tinyStartup, principal: { ...tinyStartup.principal, name: 'Marketing' } }
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2))
    })

    it('does not render when graph is null', async () => {
        useMermaidRender({ hostRef: ref<HTMLElement | null>(host()), graph: ref<GraphPayload | null>(null) })
        await new Promise((r) => setTimeout(r, 10))
        expect(renderFn).not.toHaveBeenCalled()
    })

    it('surfaces render errors, paints a fallback message and clears the positions', async () => {
        renderFn.mockRejectedValueOnce(new Error('mermaid parse error'))
        const el = host()
        const { error, positions } = useMermaidRender({
            hostRef: ref<HTMLElement | null>(el),
            graph: ref<GraphPayload | null>(tinyStartup),
        })
        await vi.waitFor(() => {
            expect(error.value).toContain('mermaid parse error')
        })
        expect(positions.value).toEqual({})
        expect(el.innerHTML).toContain('Mermaid render error')
        expect(el.querySelector('svg')).toBeNull()
    })

    it('stringifies a non-Error rejection instead of losing it', async () => {
        renderFn.mockRejectedValueOnce('plain string failure')
        const el = host()
        const { error } = useMermaidRender({
            hostRef: ref<HTMLElement | null>(el),
            graph: ref<GraphPayload | null>(tinyStartup),
        })
        await vi.waitFor(() => {
            expect(error.value).toBe('plain string failure')
        })
        expect(el.innerHTML).toContain('plain string failure')
    })

    it('fires onRender after every successful render (not on error)', async () => {
        renderFn.mockRejectedValueOnce(new Error('boom'))
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const hostRef = ref<HTMLElement | null>(host())
        const graph = ref<GraphPayload | null>(tinyStartup)
        const onRender = vi.fn()
        useMermaidRender({ hostRef, graph, onRender })

        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        expect(onRender).not.toHaveBeenCalled()

        graph.value = { ...tinyStartup, principal: { ...tinyStartup.principal, name: 'Marketing' } }
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2))
        expect(onRender).toHaveBeenCalledTimes(1)
    })

    it('drops a superseded render so a slow first call cannot clobber a newer SVG', async () => {
        // A mutable holder: the resolver is captured inside a promise
        // callback, which control-flow analysis cannot see through.
        const first: { resolve: ((v: { svg: string }) => void) | null } = { resolve: null }
        renderFn.mockImplementationOnce(() => new Promise<{ svg: string }>((resolve) => {
            first.resolve = resolve
        }))
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        const graph = ref<GraphPayload | null>(tinyStartup)
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph })

        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        graph.value = { ...tinyStartup, generated_at: '2026-09-26T08:14:00Z' }
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2))
        first.resolve?.({ svg: '<svg id="stale"></svg>' })
        await new Promise((r) => setTimeout(r, 5))
        expect(el.querySelector('svg')?.id).not.toBe('stale')
    })

    it('clears the host and the positions on unmount', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        const hostRef: Ref<HTMLElement | null> = ref(el)
        const graph = ref<GraphPayload | null>(tinyStartup)
        const { mount } = await import('@vue/test-utils')
        // A mutable holder: the composable only runs inside `setup()`, so
        // a plain `let` would be narrowed to `never` by control-flow
        // analysis across the closure boundary.
        const api: { current: ReturnType<typeof useMermaidRender> | null } = { current: null }
        const wrapper = mount({
            template: '<div />',
            setup() {
                api.current = useMermaidRender({ hostRef, graph })
                return {}
            },
        })
        await vi.waitFor(() => expect(el.querySelector('svg')).not.toBeNull())
        expect(api.current?.positions.value[1]).toBeDefined()
        wrapper.unmount()
        expect(el.innerHTML).toBe('')
        expect(api.current?.positions.value).toEqual({})
    })
})

describe('useMermaidRender — post-processing', () => {
    it('strips Mermaid\'s inline sizing and hides the SVG from assistive tech', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const svg = el.querySelector('svg') as SVGSVGElement
        expect(svg.getAttribute('style')).toBeNull()
        // The overlay cards are the accessible representation; the raw
        // topology must not be announced a second time.
        expect(svg.getAttribute('aria-hidden')).toBe('true')
        expect(svg.getAttribute('role')).toBe('presentation')
    })

    it('grows every node box to the card footprint, centred on its own translate()', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const rect = el.querySelector('g.node rect') as SVGRectElement
        expect(rect.getAttribute('width')).toBe(String(NODE_CARD_WIDTH))
        expect(rect.getAttribute('height')).toBe(String(NODE_CARD_HEIGHT))
        expect(rect.getAttribute('x')).toBe(String(-NODE_CARD_WIDTH / 2))
        expect(rect.getAttribute('y')).toBe(String(-NODE_CARD_HEIGHT / 2))
    })

    it('pins the viewBox to the content bounding box + padding and matches width/height', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const svg = el.querySelector('svg') as SVGSVGElement
        // One SVG user unit must equal one content-layer pixel, so the
        // viewBox origin and the pixel size have to agree.
        expect(svg.getAttribute('viewBox')).toBe(`${BBOX.x - SVG_PADDING} ${BBOX.y - SVG_PADDING} ${BBOX.width + SVG_PADDING * 2} ${BBOX.height + SVG_PADDING * 2}`)
        expect(svg.getAttribute('width')).toBe(String(BBOX.width + SVG_PADDING * 2))
        expect(svg.getAttribute('height')).toBe(String(BBOX.height + SVG_PADDING * 2))
    })

    it('keeps Mermaid\'s own viewBox when getBBox throws (pre-layout)', async () => {
        Object.defineProperty(SVGSVGElement.prototype, 'getBBox', {
            value: () => {
                throw new Error('NS_ERROR_FAILURE')
            },
            configurable: true,
            writable: true,
        })
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        const { positions } = useMermaidRender({
            hostRef: ref<HTMLElement | null>(el),
            graph: ref<GraphPayload | null>(tinyStartup),
        })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const svg = el.querySelector('svg') as SVGSVGElement
        expect(svg.getAttribute('viewBox')).toBe('0 0 200 100')
        // Positions still resolve — against Mermaid's own viewBox.
        expect(Object.keys(positions.value).sort()).toEqual(['1', '2'])
    })

    it('measures one card position per node, in content-layer pixels', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const el = host()
        const { positions } = useMermaidRender({
            hostRef: ref<HTMLElement | null>(el),
            graph: ref<GraphPayload | null>(tinyStartup),
        })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const minX = BBOX.x - SVG_PADDING
        const minY = BBOX.y - SVG_PADDING
        expect(positions.value).toEqual({
            1: { x: 200 - minX - NODE_CARD_WIDTH / 2, y: 40 - minY - NODE_CARD_HEIGHT / 2 },
            2: { x: 200 - minX - NODE_CARD_WIDTH / 2, y: 160 - minY - NODE_CARD_HEIGHT / 2 },
        })
    })

    it('re-syncs every position on re-render so cards cannot drift', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        const graph = ref<GraphPayload | null>(tinyStartup)
        const { positions } = useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const first = { ...positions.value }
        expect(first[1]).toBeDefined()
        expect(first[2]).toBeDefined()

        // A different layout: node 1 moves, node 2 is gone.
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture([[1, [900, 900]]]) })
        graph.value = { ...tinyStartup, principal: { ...tinyStartup.principal, name: 'Marketing' } }
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2))
        expect(Object.keys(positions.value)).toEqual(['1'])
        expect(positions.value[1]).not.toEqual(first[1])
    })
})

describe('useMermaidRender — edge re-anchoring', () => {
    /*
     * The invariant, stated once: the path's **start** lands exactly on
     * the source card's border, and the path's **end** stops
     * `ARROWHEAD_OVERSHOOT` short of the target border along the
     * path's own end tangent — so the arrowhead *tip*, which Mermaid
     * paints that far past the path end, is what meets the card.
     *
     * Asserting "the end is on the border" (as this did before) is
     * precisely the bug: it produced arrowheads buried 4.8 user units
     * inside the opaque card.
     */
    it('starts on the source border and stops short of the target by the marker overshoot', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const svg = el.querySelector('svg') as SVGSVGElement
        const centre = (id: number): { x: number; y: number } => {
            const t = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(
                (svg.querySelector(`#flowchart-n${id}-0`) as SVGGElement).getAttribute('transform') ?? '',
            ) as RegExpExecArray
            return { x: Number(t[1]), y: Number(t[2]) }
        }
        let checked = 0
        /**
         * Shortest distance from a point to a card's **outline**, for a
         * card centred on `centre` and sized by the shipped constants:
         * 0 on the border, the gap to the nearest edge when the point is
         * inside, the Euclidean gap when it is outside.
         *
         * Deliberately not "is |dx| half the width OR is |dy| half the
         * height": that reads a diagonal endpoint as "on the border" the
         * moment one of its two components happens to match, which is how
         * a re-anchored path that is really 4.8 units short can pass as
         * one that is short of nothing.
         */
        const distanceToBorder = (p: { x: number; y: number }, centre: { x: number; y: number }): number => {
            const halfW = NODE_CARD_WIDTH / 2
            const halfH = NODE_CARD_HEIGHT / 2
            const dx = Math.abs(p.x - centre.x)
            const dy = Math.abs(p.y - centre.y)
            if (dx <= halfW && dy <= halfH) return Math.min(halfW - dx, halfH - dy)
            return Math.hypot(Math.max(dx - halfW, 0), Math.max(dy - halfH, 0))
        }
        for (const path of [...svg.querySelectorAll('path.flowchart-link')]) {
            const id = path.id
            const m = /^L-n(\d+)-n(\d+)/.exec(id)
            if (m === null) continue
            const [src, tgt] = [Number(m[1]), Number(m[2])]
            // n99 is a decoy with no `g.node`; it must come back byte
            // identical, and "on the border" is vacuously true for it.
            if (svg.querySelector(`#flowchart-n${src}-0`) === null) continue
            if (svg.querySelector(`#flowchart-n${tgt}-0`) === null) continue
            const segments = parsePathPoints(path.getAttribute('d') ?? '')
            if (segments === null) continue
            const points = segments.flatMap((seg) => seg.points)
            const first = points[0] as { x: number; y: number }
            const last = points[points.length - 1] as { x: number; y: number }
            const prev = points[points.length - 2] as { x: number; y: number }
            checked += 1
            // Start: exactly on the source card's border. No marker there
            // to compensate, so it is the border itself — 0.000 px away.
            expect(
                distanceToBorder(first, centre(src)),
                `start of ${id} is on the source card's border`,
            ).toBeCloseTo(0, 3)

            // End: walk the overshoot back off the tip and the tip must
            // then be exactly on the target card's border. The tangent
            // is read off the *rewritten* path, so this checks the
            // shipped geometry rather than the input.
            const len = Math.hypot(last.x - prev.x, last.y - prev.y)
            expect(len, `end tangent of ${id} is non-degenerate`).toBeGreaterThan(0)
            const tip = {
                x: last.x + (ARROWHEAD_OVERSHOOT * (last.x - prev.x)) / len,
                y: last.y + (ARROWHEAD_OVERSHOOT * (last.y - prev.y)) / len,
            }
            expect(
                distanceToBorder(tip, centre(tgt)),
                `arrow tip of ${id} lands on the target border`,
            ).toBeCloseTo(0, 3)
            // …and the path end is never more than one arrowhead past it.
            //
            // For a vertical edge (`L-n1-n2-0`) the end tangent is exactly
            // the border's normal, so the end sits `ARROWHEAD_OVERSHOOT`
            // short. For the diagonal `L-n1-n2-9` the same 4.8 is walked
            // along the *tangent* rather than along the normal, so it
            // lands nearer the border than one arrowhead (3.083 px at the
            // 63 px card) — which is the point of measuring the tip
            // rather than the end. The bound is stated as "within one
            // arrowhead" for exactly that reason.
            expect(
                distanceToBorder(last, centre(tgt)),
                `path end of ${id} is held back by at most the overshoot`,
            ).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.01)
        }
        // Guard against the loop vacuously passing over zero edges.
        expect(checked).toBeGreaterThan(0)
    })

    it('leaves a path it cannot parse exactly as Mermaid wrote it', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const bad = el.querySelector('#L-unparseable') as SVGElement
        expect(bad.getAttribute('d')).toBe('M0,0H10')
    })

    it('leaves an edge whose target node was never placed untouched', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        // n99 has no `g.node`, so there is no centre to aim at.
        const orphan = el.querySelector('#L-n1-n99-0') as SVGElement
        expect(orphan.getAttribute('d')).toBe('M200 52 L200 148')
    })

    it('stamps fill:none / stroke:none on every node box it resizes', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        const rects = [...el.querySelectorAll('g.node rect')] as SVGRectElement[]
        expect(rects.length).toBeGreaterThan(0)
        for (const rect of rects) {
            // An inline declaration outranks the `<style>` Mermaid
            // injects into the SVG, so the boxes stay unpainted even if
            // the plugin's own stylesheet never loads — the case where
            // Mermaid's default theme would paint them #ECECFF with a
            // #9370DB stroke, straight over cards with no surface.
            expect(rect.style.fill).toBe('none')
            expect(rect.style.stroke).toBe('none')
        }
    })
})

describe('useMermaidRender — selection-driven edge styling', () => {
    it('publishes the payload edges to the selection store', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        useMermaidRender({ hostRef: ref<HTMLElement | null>(host()), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        expect(useSelectionStore().edges).toEqual(tinyStartup.edges)
    })

    it('tags edges out / in / dim for the selected node and clears when nothing is selected', async () => {
        renderFn.mockResolvedValue({ svg: makeSvgFixture() })
        const el = host()
        const selection = useSelectionStore()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))

        const edge = () => el.querySelector('path.flowchart-link') as SVGElement
        expect(edge().classList.contains('out')).toBe(false)

        selection.setSelected(1)
        await nextTick()
        expect(edge().classList.contains('out')).toBe(true)

        selection.setSelected(2)
        await nextTick()
        expect(edge().classList.contains('in')).toBe(true)
        expect(edge().classList.contains('out')).toBe(false)

        selection.setSelected(3)
        await nextTick()
        expect(edge().classList.contains('dim')).toBe(true)

        selection.clear()
        await nextTick()
        expect([...edge().classList].sort()).toEqual(['LE-n2', 'LS-n1', 'flowchart-link'])
    })

    it('leaves edges whose id carries no parseable ends untagged', async () => {
        renderFn.mockResolvedValueOnce({
            svg: '<svg viewBox="0 0 10 10"><path class="flowchart-link" id="L-opaque" /></svg>',
        })
        const el = host()
        const selection = useSelectionStore()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(el), graph: ref<GraphPayload | null>(tinyStartup) })
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        selection.setSelected(1)
        await nextTick()
        expect([...(el.querySelector('path.flowchart-link') as SVGElement).classList]).toEqual(['flowchart-link'])
    })

    it('does not tag edges before the first SVG has been committed', async () => {
        const selection = useSelectionStore()
        useMermaidRender({ hostRef: ref<HTMLElement | null>(null), graph: ref<GraphPayload | null>(tinyStartup) })
        selection.setSelected(1)
        await nextTick()
        expect(renderFn).not.toHaveBeenCalled()
    })
})

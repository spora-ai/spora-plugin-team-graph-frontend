import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphCanvas from '../../src/components/TeamGraphCanvas.vue'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH, SVG_PADDING } from '../../src/lib/nodeLayout'
import { useSelectionStore } from '../../src/stores/selection'
import type { GraphPayload } from '../../src/types'

/**
 * `TeamGraphCanvas` — the Option C composition point.
 *
 * Mermaid renders edges into `.tg-mermaid-host`; the node cards are
 * Vue components in `.tg-node-overlay`, a **sibling** of that host
 * inside the same `.tg-canvas-content` element that `usePanZoom`
 * transforms. These tests prove the two halves actually line up:
 *
 *  - one card per placed node, positioned from the measured centre,
 *  - a card is not rendered at all when Mermaid placed no node for
 *    it (never "positioned at the origin" as a fallback),
 *  - positions are re-measured on every re-render (poll, principal
 *    switch), so cards cannot drift,
 *  - a card click toggles the selection and the cards restyle,
 *  - the transform is written to the *parent* of both layers, which
 *    is what keeps them locked together under pan / zoom / fit.
 */

const renderFn = vi.fn()
const initializeFn = vi.fn()

vi.mock('mermaid', () => ({
    default: {
        initialize: (cfg: unknown) => initializeFn(cfg),
        render: (id: string, source: string) => renderFn(id, source),
    },
}))

const BBOX = { x: 0, y: 0, width: 800, height: 600 }

function makeGraph(principalId: number, nodeIds: number[], edgePairs: Array<[number, number]> = []): GraphPayload {
    return {
        principal: { id: principalId, type: 'group', name: `Principal ${principalId}`, is_current_user_owned: principalId === 1 },
        nodes: nodeIds.map((id) => ({
            id,
            name: `Agent ${id}`,
            role: null,
            picture_url: null,
            status: 'COMPLETED',
            active_chats: 0,
            recent_chats_24h: 0,
            profile_picture: {
                kind: 'avatar',
                archetype: 'assistant',
                variant_key: 'v0',
                palette_key: 'indigo',
                bg_color: '#4338CA',
                fg_color: '#EEF2FF',
            },
        })),
        edges: edgePairs.map(([src, tgt]) => ({
            id: `${src}->${tgt}`,
            source: src,
            target: tgt,
            op: 'sub_agent' as const,
            configured: true as const,
            count_24h: 0,
            last_invoked_at: null,
        })),
        generated_at: '2026-09-25T08:14:00Z',
    }
}

/** Mermaid's `htmlLabels: false` output for the given node centres. */
function svgFixture(centres: Array<[number, [number, number]]>): string {
    const nodes = centres
        .map(
            ([id, [cx, cy]]) =>
                `<g class="node" id="flowchart-n${id}-0" transform="translate(${cx}, ${cy})">` +
                `<rect class="basic label-container" x="-30" y="-12" width="60" height="24" /></g>`,
        )
        .join('')
    return `<svg viewBox="0 0 800 600" width="800" height="600">${nodes}` +
        `<path class="flowchart-link LS-n1 LE-n2" id="L-n1-n2-0" d="M0 0 L10 10" /></svg>`
}

function stubLayout(el: Element, width: number, height: number): void {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: height, configurable: true })
    el.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect
}

function flushRafs(): Promise<void> {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

/**
 * Mount the canvas the way the page does: the graph prop is still
 * `null` on mount (the endpoint is async), so the composable's
 * immediate watcher runs with an unbound `hostRef` and the real
 * render happens when the payload arrives.
 */
async function mountCanvas(graph: GraphPayload): Promise<VueWrapper> {
    const w = mount(TeamGraphCanvas, { props: { graph: null } })
    await w.setProps({ graph })
    await flushPromises()
    return w
}

beforeEach(() => {
    setActivePinia(createPinia())
    renderFn.mockReset()
    initializeFn.mockReset()
    renderFn.mockResolvedValue({ svg: svgFixture([[1, [200, 100]], [2, [200, 400]]]) })
    Object.defineProperty(SVGSVGElement.prototype, 'getBBox', {
        value: () => ({ ...BBOX }) as DOMRect,
        configurable: true,
        writable: true,
    })
})

/** Cards in the overlay, in DOM order. */
function cards(w: VueWrapper): ReturnType<VueWrapper['findAll']> {
    return w.findAll('[data-testid="tg-node-overlay"] .tg-node-card')
}

function transformOf(w: VueWrapper): string {
    return (w.find('[data-testid="tg-canvas-content"]').element as HTMLElement).style.transform
}

describe('TeamGraphCanvas — overlay placement', () => {
    it('renders one Vue card per node Mermaid placed, inside the transformed content layer', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))

        const host = w.find('[data-testid="tg-mermaid-host"]')
        const overlay = w.find('[data-testid="tg-node-overlay"]')
        expect(host.exists()).toBe(true)
        expect(overlay.exists()).toBe(true)
        // Sibling HTML layers — Vue cannot mount inside <svg>, so the
        // cards must live next to it, not in it.
        expect(overlay.element.parentElement).toBe(host.element.parentElement)
        expect(host.element.querySelector('.tg-node-card')).toBeNull()
        expect(cards(w)).toHaveLength(2)
    })

    it('positions each card from the measured node centre, minus the viewBox origin and half the card', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))

        const minX = BBOX.x - SVG_PADDING
        const minY = BBOX.y - SVG_PADDING
        const first = cards(w)[0]!
        expect(first.attributes('data-node-id')).toBe('1')
        expect(first.attributes('style')).toContain(
            `translate3d(${200 - minX - NODE_CARD_WIDTH / 2}px, ${100 - minY - NODE_CARD_HEIGHT / 2}px, 0)`,
        )
        const second = cards(w)[1]!
        expect(second.attributes('style')).toContain(
            `translate3d(${200 - minX - NODE_CARD_WIDTH / 2}px, ${400 - minY - NODE_CARD_HEIGHT / 2}px, 0)`,
        )
    })

    it('omits a card entirely when Mermaid placed no node for it', async () => {
        renderFn.mockResolvedValue({ svg: svgFixture([[1, [200, 100]]]) })
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        // Node 2 is in the payload but not in the diagram: the operator
        // sees one card, not a second one stacked at (0, 0).
        expect(cards(w).map((c) => c.attributes('data-node-id'))).toEqual(['1'])
    })

    it('renders no cards at all before the graph has arrived', async () => {
        const w = mount(TeamGraphCanvas, { props: { graph: null } })
        await flushPromises()
        expect(cards(w)).toHaveLength(0)
    })

    it('re-measures every card on re-render so positions cannot drift', async () => {
        const graphA = makeGraph(1, [1, 2], [[1, 2]])
        const w = await mountCanvas(graphA)
        const before = cards(w).map((c) => c.attributes('style'))

        // A poll returns a payload with a *different* layout.
        renderFn.mockResolvedValueOnce({ svg: svgFixture([[1, [700, 500]], [2, [700, 100]]]) })
        const graphB = { ...graphA, generated_at: '2026-09-26T08:14:00Z' }
        await w.setProps({ graph: graphB })
        await flushPromises()

        const after = cards(w).map((c) => c.attributes('style'))
        expect(after).toHaveLength(2)
        expect(after).not.toEqual(before)
        // Node 1 moved to the bottom of the diagram: 500 - (-20) - 38.
        expect(after[0]).toContain('translate3d(600px, 482px, 0)')
    })

    it('drops the stale cards while a new principal is still rendering', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        expect(cards(w)).toHaveLength(2)

        renderFn.mockResolvedValueOnce({ svg: svgFixture([[9, [10, 10]]]) })
        await w.setProps({ graph: makeGraph(2, [9], []) })
        await flushPromises()
        expect(cards(w).map((c) => c.attributes('data-node-id'))).toEqual(['9'])
    })
})

describe('TeamGraphCanvas — edge counts and selection', () => {
    it('derives the badge counts from the payload edges, client-side', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        const first = cards(w)[0]!
        const badges = first.findAll('.tg-edge-badge')
        // Agent 1 has 0 inbound (entry point) and 1 outbound.
        expect(badges[0]!.classes()).toContain('tg-edge-badge--zero')
        expect(badges[1]!.classes()).toContain('tg-edge-badge--out')
    })

    it('selects on card click and clears when the same card is clicked again', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        const selection = useSelectionStore()

        await cards(w)[0]!.trigger('click')
        await nextTick()
        expect(selection.selectedId).toBe(1)
        expect(cards(w)[0]!.classes()).toContain('is-selected')

        await cards(w)[0]!.trigger('click')
        await nextTick()
        expect(selection.selectedId).toBeNull()
        expect(cards(w)[0]!.classes()).not.toContain('is-selected')
    })

    it('marks the neighbours of the selection adjacent and the rest dimmed', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        useSelectionStore().setSelected(1)
        await nextTick()
        // 1 and 2 are directly connected, so neither is dimmed.
        expect(cards(w)[0]!.classes()).toContain('is-selected')
        expect(cards(w)[1]!.classes()).toContain('is-adjacent')
        expect(cards(w)[1]!.classes()).not.toContain('is-dimmed')

        // An agent that is not on any edge with 1 is dimmed instead.
        useSelectionStore().setSelected(99)
        await nextTick()
        expect(cards(w)[0]!.classes()).toContain('is-dimmed')
    })

    it('keeps the Mermaid SVG marked as decorative while the cards carry the semantics', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        const svg = w.find('[data-testid="tg-mermaid-host"] svg')
        expect(svg.attributes('aria-hidden')).toBe('true')
        expect(cards(w)[0]!.attributes('role')).toBe('button')
    })
})

describe('TeamGraphCanvas — pan / zoom drives both layers', () => {
    it('writes the transform to the shared parent of the SVG and the cards', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        const wrap = w.find('[data-testid="tg-canvas-wrap"]').element as HTMLElement
        stubLayout(wrap, 1200, 800)

        await w.find('[data-testid="tg-zoom-in"]').trigger('click')
        const content = w.find('[data-testid="tg-canvas-content"]').element as HTMLElement
        expect(content.style.transform).toContain('scale(1.25)')
        // The cards are children of that very element, so they moved
        // with it — no per-card bookkeeping anywhere.
        expect(content.querySelector('[data-testid="tg-node-overlay"]')).not.toBeNull()
    })

    it('fits the freshly rendered diagram and leaves the operator\'s zoom alone on a data refresh', async () => {
        const graph = makeGraph(1, [1, 2], [[1, 2]])
        const w = await mountCanvas(graph)
        const wrap = w.find('[data-testid="tg-canvas-wrap"]').element as HTMLElement
        stubLayout(wrap, 1200, 800)
        // Let the initial principal-change fit drain before the test
        // takes manual control of the view.
        await flushRafs()
        await flushRafs()

        await w.find('[data-testid="tg-zoom-fit"]').trigger('click')
        const fitted = transformOf(w)
        expect(fitted).toMatch(/scale\(/)

        // Simulate the operator zooming in, then a poll that dedups.
        const content = w.find('[data-testid="tg-canvas-content"]').element as HTMLElement
        content.style.transform = 'translate(50px, 50px) scale(1.75)'
        await w.setProps({ graph: { ...graph, generated_at: '2026-09-26T08:14:00Z' } })
        await flushPromises()
        await flushRafs()
        expect(transformOf(w)).toBe('translate(50px, 50px) scale(1.75)')
    })

    it('resets the view when the principal changes', async () => {
        const graphA = makeGraph(1, [1, 2, 3], [[1, 2]])
        const graphB = makeGraph(2, [4, 5, 6, 7], [[4, 5], [6, 7]])
        const w = await mountCanvas(graphA)
        renderFn.mockResolvedValue({ svg: svgFixture([[4, [100, 100]], [5, [300, 300]], [6, [500, 500]], [7, [700, 700]]]) })
        const wrap = w.find('[data-testid="tg-canvas-wrap"]').element as HTMLElement
        stubLayout(wrap, 1200, 800)

        const content = w.find('[data-testid="tg-canvas-content"]').element as HTMLElement
        content.style.transform = 'translate(0px, 0px) scale(2.5)'
        await w.setProps({ graph: graphB })
        await flushPromises()
        await flushRafs()
        await flushRafs()

        expect(transformOf(w)).not.toContain('scale(2.5)')
        expect(cards(w)).toHaveLength(4)
    })

    it('fits on an explicit shouldFit request even when the payload dedups', async () => {
        const graphA = makeGraph(1, [1, 2], [[1, 2]])
        const w = await mountCanvas(graphA)
        const wrap = w.find('[data-testid="tg-canvas-wrap"]').element as HTMLElement
        stubLayout(wrap, 1200, 800)

        const content = w.find('[data-testid="tg-canvas-content"]').element as HTMLElement
        content.style.transform = 'translate(50px, 50px) scale(1.75)'
        await w.setProps({ shouldFit: true })
        await flushRafs()
        await flushRafs()
        expect(transformOf(w)).not.toBe('translate(50px, 50px) scale(1.75)')
    })

    it('emits tap-empty-canvas for a tap that missed every card', async () => {
        const w = await mountCanvas(makeGraph(1, [1, 2], [[1, 2]]))
        const wrap = w.find('[data-testid="tg-canvas-wrap"]').element as HTMLElement
        stubLayout(wrap, 1200, 800)
        wrap.dispatchEvent(new CustomEvent('tg-canvas-tap'))
        await nextTick()
        expect(w.emitted('tap-empty-canvas')).toHaveLength(1)
    })
})

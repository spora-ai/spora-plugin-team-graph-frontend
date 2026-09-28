import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphCanvas from '../../src/components/TeamGraphCanvas.vue'
import type { GraphPayload } from '../../src/types'

/**
 * `TeamGraphCanvas` — view reset semantics.
 *
 * The canvas's transform (`translate(x, y) scale(k)`) is owned by
 * `usePanZoom`. The view is reset to fit-to-viewport when:
 *
 *   1. The principal changes (`graph.principal.id` flips) — the
 *      new graph has different dimensions, so the operator's old
 *      zoom + pan would frame the wrong content.
 *   2. The first render (initial mount).
 *   3. The Refresh button or `shouldFit` prop fires.
 *
 * Data refreshes (polling) preserve the view — that's covered by
 * the dedup tests in `useTeamGraph.spec.ts`. Here we only test
 * the three reset paths above.
 *
 * We assert on `data-testid="tg-canvas-content"`'s `style.transform`
 * (the canvas-content div carries the transform). The exact scale
 * value is not pinned (Mermaid's output varies between runs); we
 * assert that the transform changes after a principal switch
 * compared to the value we set by manually zooming.
 */

const renderFn = vi.fn()
const initializeFn = vi.fn()

vi.mock('mermaid', () => ({
    default: {
        initialize: (cfg: unknown) => initializeFn(cfg),
        render: (id: string, source: string) => renderFn(id, source),
    },
}))

function makeGraph(
    principalId: number,
    nodeIds: number[],
    edgePairs: Array<[number, number]> = [],
): GraphPayload {
    return {
        principal: {
            id: principalId,
            type: 'group',
            name: `Principal ${principalId}`,
            is_current_user_owned: principalId === 1,
        },
        nodes: nodeIds.map((id) => ({
            id,
            name: `Agent ${id}`,
            role: null,
            picture_url: null,
            status: 'COMPLETED',
            active_chats: 0,
            recent_chats_24h: 0,
            profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' },
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

function flushRafs(): Promise<void> {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

beforeEach(() => {
    setActivePinia(createPinia())
    renderFn.mockReset()
    initializeFn.mockReset()
    // Mermaid returns a tiny valid SVG. The exact shape doesn't
    // matter — the canvas wraps it in <foreignObject> wrappers via
    // the post-process step. We just need a node Mermaid can drop
    // into the host without throwing.
    renderFn.mockResolvedValue({
        svg: '<svg viewBox="0 0 200 100" width="200" height="100"><g class="node" id="flowchart-n1-0"></g></svg>',
    })
})

describe('TeamGraphCanvas — view reset on principal change', () => {
    it('resets the view when the principal changes (different graph)', async () => {
        const graphA = makeGraph(1, [1, 2, 3], [[1, 2]])
        const graphB = makeGraph(2, [4, 5, 6, 7], [[4, 5], [6, 7]])

        const wrapper = mount(TeamGraphCanvas, { props: { graph: graphA } })
        await flushPromises()
        await flushRafs()

        // The canvas content carries the transform. Simulate the
        // operator zooming in (so we have a non-default transform
        // to reset away from).
        const content = wrapper.find('.tg-canvas-content').element as HTMLElement
        content.style.transform = 'translate(0px, 0px) scale(2.5)'
        await nextTick()

        // Switch principal. The new graph has different dimensions
        // and a different node count, so the canvas should fit-to-
        // viewport (the manual scale(2.5) gets overwritten).
        await wrapper.setProps({ graph: graphB })
        await flushPromises()
        await flushRafs()
        await flushRafs() // onRender uses double-rAF

        const transform = (wrapper.find('.tg-canvas-content').element as HTMLElement).style.transform
        expect(transform).not.toContain('scale(2.5)')
        expect(transform).toMatch(/scale\(/)
    })

    it('preserves the view when the same graph payload refreshes (no principal change)', async () => {
        const graph = makeGraph(1, [1, 2, 3])

        const wrapper = mount(TeamGraphCanvas, { props: { graph } })
        await flushPromises()
        await flushRafs()
        await flushRafs()

        // Simulate the operator zooming in significantly.
        const content = wrapper.find('.tg-canvas-content').element as HTMLElement
        content.style.transform = 'translate(50px, 50px) scale(1.75)'
        await nextTick()

        // Re-emit the same graph prop (simulates a poll that dedups
        // to the identical payload — Vue re-evaluates the watcher
        // but useMermaidRender's data hasn't changed, so it
        // doesn't re-render). The view stays at the operator's zoom.
        await wrapper.setProps({ graph })
        await flushPromises()
        await flushRafs()

        const transform = (wrapper.find('.tg-canvas-content').element as HTMLElement).style.transform
        // The operator's zoom must survive a same-principal refresh.
        expect(transform).toBe('translate(50px, 50px) scale(1.75)')
    })

    it('fits when shouldFit flips to true (Refresh button path)', async () => {
        /* The graph must be rendered before a fit can measure it, and
         * the initial mount's render is skipped (the composable's
         * immediate watcher runs before `hostRef` binds), so we flip
         * to a second graph first — that lands a real <svg> in the
         * wrap. The Refresh click itself then dedup's: no new payload
         * means no re-render, so the double-rAF fallback inside
         * scheduleFit() is the only path that can run the fit. */
        const graphA = makeGraph(1, [1, 2, 3])
        const graphB = makeGraph(1, [4, 5, 6, 7])

        const wrapper = mount(TeamGraphCanvas, { props: { graph: graphA } })
        await flushPromises()
        await wrapper.setProps({ graph: graphB })
        await flushPromises()
        await flushRafs()
        await flushRafs() // onRender uses double-rAF
        expect(wrapper.find('[data-testid="tg-mermaid-host"]').html()).toContain('<svg')

        // Operator zoomed in — the explicit reset request must
        // overwrite the manual transform.
        const content = wrapper.find('.tg-canvas-content').element as HTMLElement
        content.style.transform = 'translate(50px, 50px) scale(1.75)'
        await nextTick()

        await wrapper.setProps({ shouldFit: true })
        await flushRafs()
        await flushRafs()

        const transform = (wrapper.find('.tg-canvas-content').element as HTMLElement).style.transform
        expect(transform).not.toBe('translate(50px, 50px) scale(1.75)')
        expect(transform).toMatch(/scale\(/)
    })
})

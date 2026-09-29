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

describe('TeamGraphCanvas — the first graph is framed', () => {
    /*
     * The regression, measured live: on the real first load the page
     * mounts with `graph === null`, the payload arrives, the principal
     * watcher schedules a fit — and Mermaid has still not resolved, so
     * there is no SVG to measure. The old code cleared `pendingFit`
     * *before* calling `fit()`, so that no-op consumed the request and
     * the `onRender` fit (the only one that runs after the SVG
     * exists) saw a cleared flag. The graph was left at the
     * untransformed default: origin, scale 1, a small band in the
     * corner of a large empty canvas.
     *
     * The Mermaid mock is held pending on purpose so the ordering is
     * deterministic — in the real browser the fit landed before the
     * render on a fast machine and after it on a slow one, which is
     * exactly why the bug was intermittent.
     */
    async function mountAndFrame(graph: GraphPayload): Promise<ReturnType<typeof mount>> {
        let release: (v: { svg: string }) => void = () => {}
        renderFn.mockReturnValueOnce(
            new Promise<{ svg: string }>((resolve) => {
                release = resolve
            }),
        )
        const wrapper = mount(TeamGraphCanvas, { props: { graph: null } })
        await nextTick()

        // The payload lands; the principal watcher schedules a fit while
        // the render is still in flight.
        await wrapper.setProps({ graph })
        await nextTick()
        await flushRafs()
        await flushRafs()

        // Now let Mermaid answer. This is the moment the SVG appears.
        release({
            svg: '<svg viewBox="0 0 200 100" width="200" height="100"><g class="node" id="flowchart-n1-0"></g></svg>',
        })
        await flushPromises()
        await flushRafs()
        await flushRafs()
        return wrapper
    }

    it('still frames the graph when the fit request predates the render', async () => {
        const wrapper = await mountAndFrame(makeGraph(1, [1, 2, 3], [[1, 2]]))
        expect(wrapper.find('[data-testid="tg-mermaid-host"]').html()).toContain('<svg')
        const transform = (wrapper.find('.tg-canvas-content').element as HTMLElement).style.transform
        expect(transform).toMatch(/scale\(/)
    })

    it('leaves the content layer untouched while there is still no diagram', async () => {
        const wrapper = mount(TeamGraphCanvas, { props: { graph: null } })
        await flushPromises()
        await flushRafs()
        await flushRafs()
        // Nothing to measure, so nothing is written — a fit against a
        // non-existent diagram is what used to strand the view.
        expect(wrapper.find('.tg-canvas-content').element.getAttribute('style') ?? '').not.toContain('scale(')
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

/**
 * A principal with no agents.
 *
 * The payload is well-formed and simply has no `nodes`. The canvas
 * paints a note in the card instead of a diagram, and drops the
 * footer hint and the zoom stack — instructions for a diagram that
 * is not there.
 *
 * These are unit-level because that is where the decision is made:
 * `graphIsEmpty` lives in the canvas template, and the
 * "do not hand Mermaid an empty `flowchart TB`" guard lives in
 * `useMermaidRender.reRender()`. `TeamGraphPageEmptyGraph.spec.ts`
 * covers the same state from the page, where the precedence against
 * the error fallback lives.
 */
describe('TeamGraphCanvas — a principal with no agents', () => {
    function emptyGraph(principalId: number): GraphPayload {
        return { ...makeGraph(principalId, []), nodes: [], edges: [] }
    }

    it('shows the note and never asks Mermaid to lay out an empty diagram', async () => {
        const wrapper = mount(TeamGraphCanvas, { props: { graph: emptyGraph(1) } })
        await flushPromises()

        const note = wrapper.find('[data-testid="tg-graph-empty"]')
        expect(note.exists()).toBe(true)
        expect(note.text()).toContain('No agents yet')
        expect(note.text()).toContain('This team has no agents. The view updates when one is added.')

        // The guard. A bare `flowchart TB` is either wasted work or a
        // thrown error, and a throw lands in `renderInto`'s catch,
        // which writes a red "Mermaid render error: …" div into the
        // host — directly under the note.
        expect(renderFn).not.toHaveBeenCalled()
        expect(renderFn.mock.calls.at(-1)?.[1]).not.toBe('flowchart TB\n')
        const host = wrapper.find('[data-testid="tg-mermaid-host"]').element
        expect(host.innerHTML).toBe('')
        expect(wrapper.find('.tg-node-card').exists()).toBe(false)
    })

    it('drops the footer hint and the zoom stack', async () => {
        // Control: a real graph has all three.
        const populated = mount(TeamGraphCanvas, { props: { graph: makeGraph(1, [1, 2, 3], [[1, 2]]) } })
        await flushPromises()
        expect(populated.text()).toContain('Drag empty canvas to pan')
        expect(populated.find('[data-testid="tg-zoom-in"]').exists()).toBe(true)
        expect(populated.find('[data-testid="tg-zoom-fit"]').exists()).toBe(true)
        populated.unmount()

        const wrapper = mount(TeamGraphCanvas, { props: { graph: emptyGraph(1) } })
        await flushPromises()
        expect(wrapper.text()).not.toContain('Drag empty canvas to pan')
        expect(wrapper.find('[data-testid="tg-zoom-in"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="tg-zoom-out"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="tg-zoom-fit"]').exists()).toBe(false)
        // The card drops `cursor: grab` / `touch-action: none` too —
        // both are promises about a diagram. See style.css.
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').classes()).toContain('tg-canvas-wrap--idle')
    })

    it('does not show the note while there is no payload at all', async () => {
        // `null` is the first fetch in flight, not an empty graph.
        // The note is keyed on the pair, and the loading window keeps
        // the bare canvas and its footer exactly as before.
        const wrapper = mount(TeamGraphCanvas, { props: { graph: null } })
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('Drag empty canvas to pan')
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').classes()).not.toContain('tg-canvas-wrap--idle')
    })

    it('survives an empty spell without remounting or losing the transform', async () => {
        /*
         * The defect that decided the empty state lives *here* and not
         * in `TeamGraphPage.vue`. A page-level `v-if` that swaps the
         * canvas for a card unmounts it, and the next graph
         * remounts a canvas whose `graph` prop is already non-null —
         * at which point nothing renders it: `useMermaidRender`'s
         * immediate watcher runs during `setup()` while `hostRef` is
         * still null, and no prop change follows to fire it again.
         * Measured in a headless browser: 0 `<svg>`, 0 cards, no
         * transform, 4 s after switching back.
         *
         * So both the wrap and the content layer must be the *same
         * elements* across the transition, and the transform the
         * operator had must still be on the content layer.
         */
        const wrapper = mount(TeamGraphCanvas, { props: { graph: makeGraph(1, [1, 2, 3], [[1, 2]]) } })
        await flushPromises()
        await flushRafs()

        const wrap = wrapper.find('[data-testid="tg-canvas-wrap"]').element
        const content = wrapper.find('.tg-canvas-content').element as HTMLElement
        content.style.transform = 'translate(40px, 25px) scale(1.8)'
        await nextTick()

        // The team empties.
        await wrapper.setProps({ graph: emptyGraph(1) })
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').element).toBe(wrap)
        expect(wrapper.find('.tg-canvas-content').element).toBe(content)
        // The renderer cleared the host rather than leaving the old
        // SVG measurable underneath the note.
        expect((wrapper.find('[data-testid="tg-mermaid-host"]').element as HTMLElement).innerHTML).toBe('')

        // …and refills.
        await wrapper.setProps({ graph: makeGraph(1, [1, 2, 3], [[1, 2]]) })
        await flushPromises()
        await flushRafs()

        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').element).toBe(wrap)
        expect(wrapper.find('.tg-canvas-content').element).toBe(content)
        expect(renderFn).toHaveBeenCalled()
        expect(wrapper.find('[data-testid="tg-mermaid-host"]').html()).toContain('<svg')
        // A poll does not fit (that is the view-preservation
        // contract), so the operator's transform is intact.
        expect(content.style.transform).toBe('translate(40px, 25px) scale(1.8)')
    })
})

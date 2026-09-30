import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphPage from '../../src/components/TeamGraphPage.vue'
import type { PrincipalSummary } from '../../src/api/principals'
import type { GraphPayload } from '../../src/types'

/**
 * A failed load, then a successful Retry.
 *
 * `TeamGraphPage` gives the error card the canvas's slot, so a failed
 * fetch *unmounts* `TeamGraphCanvas` and the retry *remounts* it — and
 * the remount arrives with the payload already in the `graph` prop,
 * because the refetch resolves before the error state clears. A canvas
 * mounted that way drew nothing: `useMermaidRender`'s payload watcher
 * is `immediate`, so it ran during `setup()` while `hostRef` was still
 * null, and the prop never changed again to fire it. `useTeamGraph`'s
 * dedup closed the remaining door — the polls after the retry return
 * the identical payload, so nothing else ever triggered a render.
 *
 * So the canvas came back, held the graph, and stayed blank until the
 * team itself changed. These assert it paints instead, and that it
 * asks to be framed.
 */

const renderFn = vi.fn()

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: (id: string, source: string) => renderFn(id, source),
    },
}))

const fetchGraphMock = vi.fn()
const fetchPrincipalsMock = vi.fn()
const fetchActiveChatsMock = vi.fn()
const fetchRecentChatsMock = vi.fn()
const fetchAgentMetaMock = vi.fn()

vi.mock('../../src/api/teamGraph', () => ({
    fetchGraph: (...args: unknown[]) => fetchGraphMock(...args),
}))

vi.mock('../../src/api/principals', () => ({
    fetchPrincipals: (...args: unknown[]) => fetchPrincipalsMock(...args),
    principalLabel: (p: { type: string; is_current_user_owned: boolean; name: string }) =>
        p.type === 'user' && p.is_current_user_owned ? 'My Agents' : p.name,
}))

vi.mock('../../src/api/agentDetail', () => ({
    fetchAgentMeta: (...args: unknown[]) => fetchAgentMetaMock(...args),
    fetchActiveChats: (...args: unknown[]) => fetchActiveChatsMock(...args),
    fetchRecentChats: (...args: unknown[]) => fetchRecentChatsMock(...args),
}))

const PRINCIPALS: PrincipalSummary[] = [
    { id: 7, type: 'user', name: 'admin@spora.local', is_current_user_owned: true },
    { id: 2, type: 'group', name: 'Marketing', is_current_user_owned: false },
]

function populatedPayload(principalId: number, principalName: string): GraphPayload {
    return {
        principal: { id: principalId, type: 'group', name: principalName, is_current_user_owned: principalId === 7 },
        nodes: [
            { id: 11, name: 'Lead', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' } },
            { id: 12, name: 'Helper', role: 'Helper', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 2, profile_picture: { palette_key: 'amber', bg_color: '#D97706', fg_color: '#FFFBEB' } },
        ],
        edges: [
            { id: '11->12', source: 11, target: 12, op: 'sub_agent' as const, configured: true as const, count_24h: 3, last_invoked_at: '2026-09-25T08:14:00Z' },
        ],
        generated_at: '2026-09-25T08:14:00Z',
    }
}

/**
 * What Mermaid 10 hands back for `htmlLabels: false`: a `translate` per
 * `g.node`, which is what `measureNodePositions` turns into a card.
 * Without placed nodes the canvas would be legitimately empty and the
 * "it painted" assertion below would be vacuous, so the fixture has to
 * carry the two nodes the payload declares.
 */
const SVG_FIXTURE =
    '<svg viewBox="0 0 400 300" width="400" height="300">' +
    '<g class="node" id="flowchart-n11-0" transform="translate(200, 80)"><rect class="basic label-container" x="-30" y="-12" width="60" height="24" /></g>' +
    '<g class="node" id="flowchart-n12-0" transform="translate(200, 200)"><rect class="basic label-container" x="-30" y="-12" width="60" height="24" /></g>' +
    '</svg>'

const hostContext = {
    api: {
        get: vi.fn().mockResolvedValue({}),
        post: vi.fn().mockResolvedValue({}),
        put: vi.fn().mockResolvedValue({}),
        patch: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
    },
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: null,
}

/** Both fit paths settle two animation frames out, so drain four. */
function flushRafs(): Promise<void> {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

beforeEach(() => {
    setActivePinia(createPinia())
    renderFn.mockReset()
    fetchGraphMock.mockReset()
    fetchPrincipalsMock.mockReset()
    fetchActiveChatsMock.mockReset()
    fetchRecentChatsMock.mockReset()
    fetchAgentMetaMock.mockReset()
    renderFn.mockResolvedValue({ svg: SVG_FIXTURE })
    fetchPrincipalsMock.mockResolvedValue(PRINCIPALS)
    fetchActiveChatsMock.mockResolvedValue([])
    fetchRecentChatsMock.mockResolvedValue([])
    fetchAgentMetaMock.mockResolvedValue(null)
})

/** Drives the endpoint to fail until the test calls `recover()`. */
function failingGraph(): { recover: () => void } {
    let failing = true
    fetchGraphMock.mockImplementation(async (id: number) => {
        if (failing) throw new Error('graph endpoint unavailable')
        return populatedPayload(id, id === 7 ? 'admin@spora.local' : 'Marketing')
    })
    return {
        recover: () => {
            failing = false
        },
    }
}

describe('TeamGraphPage — the canvas after a successful retry', () => {
    it('paints the diagram again instead of coming back blank', async () => {
        const endpoint = failingGraph()

        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()

        // The error card owns the canvas's slot, so nothing is mounted.
        expect(wrapper.find('[data-testid="tg-graph-error"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(false)
        expect(renderFn).not.toHaveBeenCalled()

        endpoint.recover()
        await wrapper.find('[data-testid="tg-error-fallback"] button').trigger('click')
        await flushPromises()

        expect(fetchGraphMock).toHaveBeenLastCalledWith(7)
        expect(wrapper.find('[data-testid="tg-graph-error"]').exists()).toBe(false)
        // The remount arrived with the payload already in the `graph`
        // prop, so the render can only have come from the host binding.
        expect(renderFn).toHaveBeenCalledTimes(1)
        const host = wrapper.find('[data-testid="tg-mermaid-host"]')
        expect(host.exists()).toBe(true)
        expect(host.element.querySelector('svg')).not.toBeNull()
        expect(host.element.querySelectorAll('g.node')).toHaveLength(2)
        // Positions are the observable half of a paint: no cards can
        // exist without them, so this is the assertion that would fail
        // on a canvas that rendered a diagram with nothing to place.
        expect(wrapper.findAll('.tg-node-card')).toHaveLength(2)

        wrapper.unmount()
    })

    it('re-requests a fit, so the retried graph is framed rather than parked at the origin', async () => {
        /*
         * The canvas consumes `shouldFit` in a non-`immediate` watcher,
         * and this remount hands it `true` on the very commit that
         * brought it back — no change for it to react to, and no
         * principal change to trigger the other fit path. `refresh`
         * therefore drops the flag and raises it again once the mount
         * has happened, which is what makes the retry frame the graph
         * instead of leaving it at `translate(0, 0) scale(1)` in the
         * corner of the canvas.
         *
         * The scale itself is not asserted (happy-dom has no layout, so
         * the computed factor is meaningless); the contract is that
         * `fit()` ran at all, and only a fit writes the transform.
         */
        const endpoint = failingGraph()

        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        endpoint.recover()
        await wrapper.find('[data-testid="tg-error-fallback"] button').trigger('click')
        await flushPromises()
        await flushRafs()
        await flushRafs()

        const content = wrapper.find('[data-testid="tg-canvas-content"]').element as HTMLElement
        expect(content.style.transform).toMatch(/scale\(/)

        wrapper.unmount()
    })
})

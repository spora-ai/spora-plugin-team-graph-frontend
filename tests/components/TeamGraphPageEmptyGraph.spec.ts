import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphPage from '../../src/components/TeamGraphPage.vue'
import { useSelectionStore } from '../../src/stores/selection'
import type { PrincipalSummary } from '../../src/api/principals'
import type { GraphPayload } from '../../src/types'

/**
 * A principal with no agents.
 *
 * The graph endpoint answers with a complete, well-formed envelope
 * whose `nodes` array is empty — a team nobody has added an agent to
 * yet. That is a legitimate state, not a failure, and it used to
 * render as a blank 620 px canvas with the footer still telling the
 * operator to "Drag empty canvas to pan · scroll to zoom · click any
 * node to inspect". The canvas was mounted, Mermaid was handed a
 * `flowchart TB` with no node lines, and the operator was told to
 * interact with a diagram that had nothing in it.
 *
 * The three states share one slot in `TeamGraphPage.vue` and are
 * ordered by precedence:
 *
 *   1. **error**   `error !== null && graph === null` — a failed
 *      fetch, which `useTeamGraph` always pairs with a null graph, so
 *      the error card wins and the empty note never renders.
 *   2. **empty**   a payload arrived with zero nodes. Distinct from
 *      loading: `graph` is `null` until the first fetch resolves, and
 *      the note must not flash during that window.
 *   3. **canvas**  everything else, including the loading window,
 *      which keeps its existing affordance untouched.
 */

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }),
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
    { id: 4, type: 'group', name: 'Research', is_current_user_owned: false },
]

/** A populated payload, so the tests can contrast against HEAD's behaviour. */
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

/** The wire shape for "this team has no agents": a real envelope, zero nodes. */
function emptyPayload(principalId: number, principalName: string): GraphPayload {
    return {
        principal: { id: principalId, type: 'group', name: principalName, is_current_user_owned: principalId === 7 },
        nodes: [],
        edges: [],
        generated_at: '2026-09-25T08:14:00Z',
    }
}

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

const FOOTER_HINT = 'Drag empty canvas to pan'

function mountPage(): ReturnType<typeof mount> {
    return mount(TeamGraphPage, { props: { hostContext } })
}

/**
 * Is the Mermaid host still holding a diagram? The content layer
 * stays mounted in every state, so "no graph" is expressed by an
 * empty host and no placed cards, not by an absent element.
 */
function hostIsEmpty(wrapper: ReturnType<typeof mount>): boolean {
    const host = wrapper.find('[data-testid="tg-mermaid-host"]').element
    return host.querySelector('svg') === null
}

beforeEach(() => {
    setActivePinia(createPinia())
    fetchGraphMock.mockReset()
    fetchPrincipalsMock.mockReset()
    fetchActiveChatsMock.mockReset()
    fetchRecentChatsMock.mockReset()
    fetchAgentMetaMock.mockReset()
    fetchPrincipalsMock.mockResolvedValue(PRINCIPALS)
    fetchActiveChatsMock.mockResolvedValue([])
    fetchRecentChatsMock.mockResolvedValue([])
    fetchAgentMetaMock.mockResolvedValue(null)
    // Default: every principal is populated. Individual tests override.
    fetchGraphMock.mockImplementation(async (id: number) => {
        if (id === 2) return populatedPayload(2, 'Marketing')
        if (id === 4) return populatedPayload(4, 'Research')
        return populatedPayload(7, 'admin@spora.local')
    })
})

describe('TeamGraphPage — a principal with no agents', () => {
    it('shows the empty-state note in place of the diagram for a zero-node payload', async () => {
        fetchGraphMock.mockImplementation(async (id: number) =>
            emptyPayload(id, id === 7 ? 'admin@spora.local' : 'Research'),
        )

        const wrapper = mountPage()
        await flushPromises()

        const note = wrapper.find('[data-testid="tg-graph-empty"]')
        expect(note.exists()).toBe(true)
        expect(note.text()).toContain('No agents yet')
        expect(note.text()).toContain('This team has no agents. The view updates when one is added.')

        // The canvas is the card, so it stays — but it holds nothing:
        // the Mermaid host is emptied rather than handed a bare
        // `flowchart TB`, and the content layer is hidden.
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)
        const host = wrapper.find('[data-testid="tg-mermaid-host"]').element
        expect(host.querySelector('svg')).toBeNull()
        expect(host.children).toHaveLength(0)
        expect(wrapper.find('.tg-node-card').exists()).toBe(false)
        expect(hostIsEmpty(wrapper)).toBe(true)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').classes()).toContain('tg-canvas-wrap--idle')

        wrapper.unmount()
    })

    it('keeps the same canvas element across an empty spell', async () => {
        // The regression that decided where this markup lives. An
        // earlier version put the note in `TeamGraphPage.vue` and
        // unmounted the canvas for the empty team; switching back then
        // remounted it with a non-null `graph` prop, and nothing
        // rendered it — `useMermaidRender`'s immediate watcher runs
        // during `setup()` when `hostRef` is still null, and no prop
        // change follows to fire it again. Measured: 0 `<svg>`, 0
        // cards, no transform, 4 s after switching back.
        //
        // The canvas must therefore survive the transition, and so
        // must the content layer inside it (that is the element the
        // pan/zoom transform is written to). Identity, not equality.
        let empty = false
        fetchGraphMock.mockImplementation(async (id: number) =>
            empty ? emptyPayload(id, 'Research') : populatedPayload(id, 'Research'),
        )

        const wrapper = mountPage()
        await flushPromises()
        const wrap = wrapper.find('[data-testid="tg-canvas-wrap"]').element
        const content = wrapper.find('[data-testid="tg-canvas-content"]').element
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)

        empty = true
        await wrapper.find('[data-testid="tg-refresh"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(true)

        empty = false
        await wrapper.find('[data-testid="tg-refresh"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').element).toBe(wrap)
        expect(wrapper.find('[data-testid="tg-canvas-content"]').element).toBe(content)
        // …and the diagram is back, not just the frame.
        expect(hostIsEmpty(wrapper)).toBe(false)

        wrapper.unmount()
    })

    it('suppresses the footer hint that tells the operator to pan, zoom and click a node', async () => {
        // Control: with a graph, the hint is there.
        const populated = mountPage()
        await flushPromises()
        expect(populated.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)
        expect(populated.text()).toContain(FOOTER_HINT)
        populated.unmount()

        // With no graph, the hint and the zoom stack it points at are
        // gone — there is nothing to pan, zoom or fit.
        fetchGraphMock.mockImplementation(async (id: number) => emptyPayload(id, 'Research'))
        const empty = mountPage()
        await flushPromises()
        expect(empty.text()).not.toContain(FOOTER_HINT)
        expect(empty.find('[data-testid="tg-zoom-in"]').exists()).toBe(false)
        expect(empty.find('[data-testid="tg-zoom-out"]').exists()).toBe(false)
        expect(empty.find('[data-testid="tg-zoom-fit"]').exists()).toBe(false)
        empty.unmount()
    })

    it('does not flash the note while the first fetch is still in flight', async () => {
        // `graph` is null until this resolves, and null is also what
        // an error produces. The note must key off a payload that
        // arrived *and* had no nodes — otherwise every load opens
        // with a flash of "No agents yet".
        fetchGraphMock.mockReturnValue(new Promise(() => {}))

        const wrapper = mountPage()
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)
        // The loading affordance is the bare canvas, and it is
        // unchanged: same element, same footer hint, nothing hidden.
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)
        expect(hostIsEmpty(wrapper)).toBe(true)
        expect(wrapper.text()).toContain(FOOTER_HINT)

        wrapper.unmount()
    })

    it('keeps the error fallback ahead of the note', async () => {
        fetchGraphMock.mockRejectedValue(new Error('boom'))

        const wrapper = mountPage()
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-graph-error"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-error-fallback"]').exists()).toBe(true)
        // The error branch outranks the empty one, so an empty note
        // must not be rendered alongside it.
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(false)

        wrapper.unmount()
    })

    it('shows the note when a principal switch lands on a team with no agents', async () => {
        // Only principal 4 is empty; the page boots on 7 (the user's
        // own), so the switch is a real populated → empty transition.
        fetchGraphMock.mockImplementation(async (id: number) => {
            if (id === 4) return emptyPayload(4, 'Research')
            return populatedPayload(id, id === 2 ? 'Marketing' : 'admin@spora.local')
        })

        const wrapper = mountPage()
        await flushPromises()
        // Starts populated, on the operator's own principal.
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(false)

        await wrapper.find('[data-testid="tg-pill-4"]').trigger('click')
        await flushPromises()

        expect(fetchGraphMock).toHaveBeenLastCalledWith(4)
        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(true)
        expect(hostIsEmpty(wrapper)).toBe(true)

        wrapper.unmount()
    })

    it('shows the note when a poll turns a populated graph into an empty one, and clears the selection', async () => {
        // Non-empty on the first call, empty on the next — the 30 s
        // poll's worst case, and the one path the principal-switch
        // watcher does not cover. Refresh drives the same
        // `refetch()` the poll does, without a fake timer.
        let call = 0
        fetchGraphMock.mockImplementation(async (id: number) => {
            call += 1
            return call === 1 ? populatedPayload(id, 'Research') : emptyPayload(id, 'Research')
        })

        const wrapper = mountPage()
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)

        const selection = useSelectionStore()
        selection.setSelected(11)
        await flushPromises()
        expect(selection.selectedId).toBe(11)

        // The poll lands.
        await wrapper.find('[data-testid="tg-refresh"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-graph-empty"]').exists()).toBe(true)
        // The selected id is no longer in `graph.nodes`; leaving it
        // set would keep the previous agent's panel on screen beside
        // a canvas that has nothing on it.
        expect(selection.selectedId).toBeNull()

        wrapper.unmount()
    })

    it('keeps the toolbar intact — counts read zero, the pills and freshness survive', async () => {
        fetchGraphMock.mockImplementation(async (id: number) => emptyPayload(id, id === 7 ? 'admin@spora.local' : 'Research'))

        const wrapper = mountPage()
        await flushPromises()

        // The summary line still names the principal and reports the
        // counts it actually got. `stats.bidirectional` is 0, and the
        // "· N bidirectional" clause is already gated on `> 0`, so
        // nothing has to change for it.
        const summary = wrapper.find('[data-testid="tg-summary"]')
        expect(summary.exists()).toBe(true)
        expect(summary.text()).toContain('0 agents')
        expect(summary.text()).toContain('0 edges')
        expect(summary.text()).not.toContain('bidirectional')

        // The pill row is the operator's way out of an empty team, so
        // it must survive — all three principals are still listed.
        expect(wrapper.find('[data-testid="tg-principal-pills"]').findAll('button')).toHaveLength(3)

        // Freshness is still meaningful on an empty payload: the
        // commit sets `lastUpdatedAt` regardless of node count, so
        // the ticker confirms the empty result is current.
        expect(wrapper.find('[data-testid="tg-freshness"]').text()).toMatch(/Updated (just now|\d+s ago)/)

        // The legend is a key for the cards; it stays, it just has
        // nothing to key yet.
        expect(wrapper.find('[data-testid="tg-legend"]').exists()).toBe(true)

        wrapper.unmount()
    })

    it('drops the sidebar\'s "click any node" instruction when there is no diagram', async () => {
        fetchGraphMock.mockImplementation(async (id: number) => emptyPayload(id, id === 7 ? 'admin@spora.local' : 'Research'))

        const wrapper = mountPage()
        await flushPromises()

        // The panel still renders — an empty graph is not a loading
        // graph — but it can no longer offer an interaction the
        // canvas does not have.
        expect(wrapper.find('[data-testid="tg-agent-panel"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('This team has no agents to select from.')
        expect(wrapper.text()).not.toContain('Click any node in the diagram')

        wrapper.unmount()
    })

    it('keeps the sidebar instruction when the graph does have nodes', async () => {
        // Control for the case above: the original copy is
        // unchanged for a populated graph, selected or not.
        const wrapper = mountPage()
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-agent-panel"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Click any node in the diagram')
        expect(wrapper.text()).not.toContain('This team has no agents to select from.')

        wrapper.unmount()
    })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AgentDetailPanel from '../../src/components/AgentDetailPanel.vue'
import { useSelectionStore } from '../../src/stores/selection'
import type { AgentMeta } from '../../src/api/agentDetail'
import type { AgentStatus, ChatSummary, GraphNode, GraphPayload } from '../../src/types'

/**
 * `AgentDetailPanel` — responses from a selection the operator has
 * already left.
 *
 * The header and the body of this panel are fetched along different
 * paths. The name is read straight off the graph payload, so it
 * tracks the selection synchronously; the description and both chat
 * lists come from three per-agent requests. The panel is therefore
 * empty for as long as a request is in flight, which is fine — what
 * is not fine is the *loser* of two overlapping requests committing
 * afterwards, which leaves the operator reading agent B's name above
 * agent A's description and chats with nothing on screen to say the
 * two belong to different people.
 *
 * The tests below pin that with deferred promises rather than
 * timers: the test decides which response lands last, so the
 * ordering under test is the one the bug needs — A selected first,
 * A's response delivered *after* B's — and it does not depend on how
 * the runner interleaves microtasks. Letting both promises "resolve
 * at the same time" would be a weaker test, since the broken
 * component survives it whenever the race happens to land the right
 * way round.
 */

const fetchActiveChatsMock = vi.fn()
const fetchRecentChatsMock = vi.fn()
const fetchAgentMetaMock = vi.fn()

vi.mock('../../src/api/agentDetail', () => ({
    fetchAgentMeta: (...args: unknown[]) => fetchAgentMetaMock(...args),
    fetchActiveChats: (...args: unknown[]) => fetchActiveChatsMock(...args),
    fetchRecentChats: (...args: unknown[]) => fetchRecentChatsMock(...args),
}))

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id: 11,
        name: 'Ada',
        role: 'Lead',
        picture_url: null,
        status: 'RUNNING',
        active_chats: 1,
        recent_chats_24h: 4,
        profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' },
        ...overrides,
    }
}

function makeGraph(): GraphPayload {
    return {
        principal: { id: 1, type: 'user', name: 'Ada', is_current_user_owned: true },
        nodes: [
            makeNode(),
            makeNode({ id: 22, name: 'Blake' }),
            makeNode({ id: 33, name: 'Casey' }),
        ],
        edges: [],
        generated_at: '2026-09-28T12:00:00Z',
    }
}

function meta(id: number, description: string): AgentMeta {
    return {
        id,
        name: id === 11 ? 'Ada' : 'Blake',
        description,
        llm_driver_config_id: 1,
        max_steps: 25,
        is_active: true,
        is_pinned: false,
        principal_id: 7,
        tools: [],
        created_at: '2026-09-01T00:00:00Z',
    }
}

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id: 501,
        title: 'Summarise the Q3 report',
        status: 'COMPLETED' as AgentStatus,
        started_at: '2026-09-28T10:00:00Z',
        preview: 'The report covers three regions…',
        ...overrides,
    }
}

interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
}

/**
 * A promise the test settles by hand. The `!` initialisation is the
 * house idiom for "assigned synchronously by the executor" (see
 * `useTeamGraph.spec.ts`).
 */
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => {
        resolve = r
    })
    return { promise, resolve }
}

/** The three fetches one selection issues, each held open by the test. */
interface Held {
    meta: Deferred<AgentMeta | null>
    active: Deferred<ChatSummary[]>
    recent: Deferred<ChatSummary[]>
}

/**
 * Every fetcher resolves to the deferred registered for the agent id
 * it was called with. Routing by id rather than by call order means
 * the test never has to care that the panel issues meta → active →
 * recent, or how many times it re-fires.
 */
function holdOpen(...agentIds: number[]): Map<number, Held> {
    const held = new Map<number, Held>()
    for (const id of agentIds) {
        held.set(id, {
            meta: deferred<AgentMeta | null>(),
            active: deferred<ChatSummary[]>(),
            recent: deferred<ChatSummary[]>(),
        })
    }
    const pendingFor = (id: number) => held.get(id)
    fetchAgentMetaMock.mockImplementation((id: number) =>
        pendingFor(id)?.meta.promise ?? Promise.resolve(null),
    )
    fetchActiveChatsMock.mockImplementation((id: number) =>
        pendingFor(id)?.active.promise ?? Promise.resolve([]),
    )
    fetchRecentChatsMock.mockImplementation((id: number) =>
        pendingFor(id)?.recent.promise ?? Promise.resolve([]),
    )
    return held
}

/** An unhandled rejection from a retired request is still a failure. */
async function settle() {
    await nextTick()
    await flushPromises()
}

/**
 * The panel's fetch state, read off the mounted instance.
 *
 * `<script setup>` keeps its bindings private, so they are absent
 * from the public instance *type* even though VTU's runtime proxy
 * exposes them from `setupState`. These assertions have to be on the
 * refs themselves rather than on the DOM: `metaLoading` renders
 * nothing, and the post-teardown case has no DOM left to read. The
 * narrow interface is deliberate — it types the four fields under
 * test instead of widening the proxy to `any`.
 */
interface FetchState {
    metaLoading: boolean
    activeChats: ChatSummary[]
    recentChats: ChatSummary[]
    agentMeta: AgentMeta | null
}

const inertRouter = { push: () => Promise.resolve(undefined) }

/** Mount with node 11 selected; its three fetches are left in flight. */
async function mountWithPending() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const selection = useSelectionStore()
    selection.setSelected(11)
    const held = holdOpen(11, 22, 33)
    const wrapper = mount(AgentDetailPanel, {
        props: { graph: makeGraph(), router: inertRouter },
        global: { plugins: [pinia] },
    })
    await settle()
    const state = wrapper.vm as unknown as FetchState
    return { wrapper, selection, held, state }
}

/** Answer every request for one agent, as the API would. */
function answerAll(held: Held, id: number, description: string, chats: ChatSummary[]) {
    held.meta.resolve(meta(id, description))
    held.active.resolve(chats)
    held.recent.resolve(chats)
}

beforeEach(() => {
    fetchActiveChatsMock.mockReset()
    fetchRecentChatsMock.mockReset()
    fetchAgentMetaMock.mockReset()
})

describe('AgentDetailPanel — selection switching', () => {
    it('keeps the newest agent when the earlier one answers last', async () => {
        const { wrapper, selection, held } = await mountWithPending()
        const a = held.get(11)!
        const b = held.get(22)!

        // Switch to node 22 before node 11's requests have landed.
        selection.setSelected(22)
        await settle()

        // Node 22 — the current selection — answers first.
        answerAll(b, 22, 'Blake runs the data pipeline.', [chat({ id: 900, title: 'Blake task' })])
        await settle()

        expect(wrapper.find('[data-testid="tg-agent-name"]').text()).toBe('Blake')
        expect(wrapper.text()).toContain('Blake runs the data pipeline.')
        expect(wrapper.find('[data-testid="tg-chat-row-900"]').exists()).toBe(true)

        // Now the stale one answers, last, with entirely different
        // content. Every one of its writes must be dropped: the name
        // is already Blake, and the body has to stay his too.
        answerAll(a, 11, 'Ada is the team lead.', [chat({ id: 501, title: 'Ada task' })])
        await settle()

        expect(wrapper.find('[data-testid="tg-agent-name"]').text()).toBe('Blake')
        expect(wrapper.text()).toContain('Blake runs the data pipeline.')
        expect(wrapper.text()).not.toContain('Ada is the team lead.')
        expect(wrapper.find('[data-testid="tg-chat-row-900"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-chat-row-501"]').exists()).toBe(false)
        // Both list headers, not just the rows — a stale commit that
        // slipped past the row check would still miscount.
        expect(wrapper.find('[data-testid="tg-active-chats-section"]').text()).toContain('(1)')
        expect(wrapper.find('[data-testid="tg-recent-chats-section"]').text()).toContain('(1)')
        wrapper.unmount()
    })

    it('survives three rapid switches and shows only the last agent', async () => {
        // A guard that only compares against the *previous* selection
        // would pass the two-node test above; this walks the chain and
        // settles the three retired responses in the worst order,
        // oldest last.
        const { wrapper, selection, held } = await mountWithPending()
        const a = held.get(11)!
        const b = held.get(22)!
        const c = held.get(33)!

        selection.setSelected(22)
        await settle()
        selection.setSelected(33)
        await settle()

        answerAll(b, 22, 'Blake runs the data pipeline.', [chat({ id: 900, title: 'Blake task' })])
        await settle()
        answerAll(c, 33, 'Casey audits the spend.', [chat({ id: 901, title: 'Casey task' })])
        await settle()
        answerAll(a, 11, 'Ada is the team lead.', [chat({ id: 501, title: 'Ada task' })])
        await settle()

        expect(wrapper.find('[data-testid="tg-agent-name"]').text()).toBe('Casey')
        expect(wrapper.text()).toContain('Casey audits the spend.')
        expect(wrapper.text()).not.toContain('Ada is the team lead.')
        expect(wrapper.text()).not.toContain('Blake runs the data pipeline.')
        expect(wrapper.find('[data-testid="tg-chat-row-901"]').exists()).toBe(true)
        expect(wrapper.findAll('.tg-chat-row')).toHaveLength(2)
        wrapper.unmount()
    })
})

describe('AgentDetailPanel — loading flag ownership', () => {
    it('does not let a stale response clear the current request’s flag', async () => {
        // `loadAgentMeta` clears `metaLoading` in a `finally`, which
        // runs for a response that has already been superseded. If it
        // were unguarded, the flag would read "loaded" while node 22's
        // record was still on the wire — the spinner would vanish for
        // the request that is actually in flight.
        const { wrapper, selection, held, state } = await mountWithPending()
        const a = held.get(11)!
        const b = held.get(22)!

        selection.setSelected(22)
        await settle()
        expect(state.metaLoading).toBe(true)

        // The stale response lands while node 22 is still loading.
        a.meta.resolve(meta(11, 'Ada is the team lead.'))
        a.active.resolve([])
        a.recent.resolve([])
        await settle()

        expect(state.metaLoading).toBe(true)

        // Only the current request may turn it off.
        b.meta.resolve(meta(22, 'Blake runs the data pipeline.'))
        await settle()
        expect(state.metaLoading).toBe(false)
        wrapper.unmount()
    })

    it('drops a response that lands after the panel is torn down', async () => {
        // Unmounting mid-request used to be a third way to write into
        // a dead component. The panel is gone either way, so the
        // assertion is that nothing moved after the teardown.
        const { wrapper, held, state } = await mountWithPending()
        const a = held.get(11)!

        expect(state.metaLoading).toBe(true)
        wrapper.unmount()

        answerAll(a, 11, 'Ada is the team lead.', [chat({ id: 501, title: 'Ada task' })])
        await settle()

        expect(state.activeChats).toEqual([])
        expect(state.recentChats).toEqual([])
        expect(state.agentMeta).toBeNull()
    })
})

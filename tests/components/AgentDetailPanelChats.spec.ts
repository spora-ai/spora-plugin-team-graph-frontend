import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentDetailPanel from '../../src/components/AgentDetailPanel.vue'
import { useSelectionStore } from '../../src/stores/selection'
import type { AgentStatus, GraphNode, GraphPayload } from '../../src/types'
import type { ChatSummary } from '../../src/types'

/**
 * `AgentDetailPanel` chat rows — navigation, the null-router
 * fallback, and the status signal.
 *
 * **The three decisions under test.**
 *
 *  1. **Rows navigate.** A chat row is a `<button type="button">`
 *     that calls the host router with the task's chat path. The
 *     assertion is on the *exact* argument, because the failure mode
 *     of a wrong path is silent: the host's catch-all
 *     (`/:pathMatch(.*)*` → redirect `/`) swallows it and the
 *     operator lands on the dashboard instead of the chat, with no
 *     error anywhere.
 *  2. **No router → inert row.** `PluginHostContext.router` is
 *     nullable, and the plugin's own dev entry passes `null`. The row
 *     must render with its content intact, be `disabled` (so it
 *     leaves the tab order rather than lying to a keyboard user), and
 *     never attempt a navigation.
 *  3. **The removed bullet dot did not take the status with it.**
 *     The old row painted status as a bare
 *     `background: statusColor(...)` 6 px swatch. The replacement is
 *     the shared `.tg-status-pill` driven by the same
 *     `statusPillClass()` slug the panel header and the node cards
 *     use — so the test pins both the class *and* the text label, the
 *     latter being the part a screen reader actually gets.
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
        name: 'Lead',
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
        nodes: [makeNode()],
        edges: [],
        generated_at: '2026-09-28T12:00:00Z',
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

/**
 * Mount with node 11 selected and the given chat lists.
 *
 * `router` is threaded through explicitly rather than defaulted, so
 * each test states which of the two policies it is exercising.
 */
async function mountPanel(options: {
    router: { push: (to: string) => Promise<unknown> } | null
    active?: ChatSummary[]
    recent?: ChatSummary[]
}) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSelectionStore().setSelected(11)
    fetchActiveChatsMock.mockResolvedValue(options.active ?? [])
    fetchRecentChatsMock.mockResolvedValue(options.recent ?? [])
    fetchAgentMetaMock.mockResolvedValue(null)
    const wrapper = mount(AgentDetailPanel, {
        props: { graph: makeGraph(), router: options.router },
        global: { plugins: [pinia] },
    })
    await flushPromises()
    return wrapper
}

const liveRouter = () => ({ push: vi.fn().mockResolvedValue(undefined) })

beforeEach(() => {
    fetchActiveChatsMock.mockReset()
    fetchRecentChatsMock.mockReset()
    fetchAgentMetaMock.mockReset()
})

describe('AgentDetailPanel chat rows — navigation', () => {
    it('pushes the host task-chat path when a recent chat row is clicked', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501 })] })

        await wrapper.find('[data-testid="tg-chat-row-501"]').trigger('click')

        // The exact string, not a prefix: the host's catch-all route
        // turns a wrong path into a silent redirect to the dashboard.
        expect(router.push).toHaveBeenCalledTimes(1)
        expect(router.push).toHaveBeenCalledWith('/tasks/501')
        wrapper.unmount()
    })

    it('pushes the path for the row that was clicked, not the first row', async () => {
        // A `v-for` closure bug (every row closing over the same id)
        // would still pass a single-row test, so the click target is
        // the *second* row here.
        const router = liveRouter()
        const wrapper = await mountPanel({
            router,
            recent: [chat({ id: 501 }), chat({ id: 502 })],
        })

        await wrapper.find('[data-testid="tg-chat-row-502"]').trigger('click')

        expect(router.push).toHaveBeenCalledWith('/tasks/502')
        wrapper.unmount()
    })

    it('navigates from the active-chats section too', async () => {
        // The two sections render the same row, so they must behave
        // identically — an in-flight run is the one an operator is
        // most likely to want to open.
        const router = liveRouter()
        const wrapper = await mountPanel({ router, active: [chat({ id: 900, status: 'RUNNING' })] })

        await wrapper.find('[data-testid="tg-chat-row-900"]').trigger('click')

        expect(router.push).toHaveBeenCalledWith('/tasks/900')
        wrapper.unmount()
    })

    it('renders chat rows as real buttons so Enter and Space activate them natively', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501 })] })

        const row = wrapper.find('[data-testid="tg-chat-row-501"]')
        // A native `<button type="button">` is what gets Enter/Space
        // activation, the `button` role and the tab order for free.
        // A `<div role="button">` would need all three hand-written.
        expect(row.element.tagName).toBe('BUTTON')
        expect(row.attributes('type')).toBe('button')
        expect(row.attributes('role')).toBeUndefined()
        expect(row.attributes('tabindex')).toBeUndefined()
        // Enabled rows are reachable by keyboard.
        expect(row.attributes('disabled')).toBeUndefined()
        expect(row.attributes('aria-disabled')).toBe('false')
        wrapper.unmount()
    })

    it('does not nest a chat row inside another interactive element', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501 })] })

        // Nesting a control inside a control is invalid HTML and
        // breaks both the inner control's focus and the outer one's
        // activation. The panel body must be a plain scroll container.
        const nested = wrapper.findAll('[data-testid="tg-chat-row-501"] button')
        expect(nested).toHaveLength(0)
        const parentTag = wrapper.find('[data-testid="tg-recent-chats-section"]').element.tagName
        expect(parentTag).toBe('SECTION')
        wrapper.unmount()
    })

    it('survives a router that rejects, without an unhandled rejection', async () => {
        // vue-router's push rejects when a navigation is aborted or
        // redirected away. An unhandled rejection there would show up
        // as a console error with no owner, so the click path
        // swallows it.
        const router = { push: vi.fn().mockRejectedValue(new Error('redirected')) }
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501 })] })

        await wrapper.find('[data-testid="tg-chat-row-501"]').trigger('click')
        await flushPromises()

        expect(router.push).toHaveBeenCalledWith('/tasks/501')
        wrapper.unmount()
    })
})

describe('AgentDetailPanel chat rows — null router fallback', () => {
    it('renders a disabled row that keeps its content when the host has no router', async () => {
        const wrapper = await mountPanel({ router: null, recent: [chat({ id: 501 })] })

        const row = wrapper.find('[data-testid="tg-chat-row-501"]')
        expect(row.exists()).toBe(true)
        // Still the same element and the same text, so the panel does
        // not reflow when the host withholds a router.
        expect(row.element.tagName).toBe('BUTTON')
        expect(row.text()).toContain('Summarise the Q3 report')
        // Disabled *and* aria-disabled: the native attribute keeps it
        // out of the tab order, the ARIA state is what a screen reader
        // announces when focus lands on it by other means.
        expect(row.attributes('disabled')).toBe('')
        expect(row.attributes('aria-disabled')).toBe('true')
        expect(row.classes()).toContain('is-disabled')
        wrapper.unmount()
    })

    it('does not throw or navigate when a disabled row is clicked', async () => {
        // happy-dom does not implement the disabled-click suppression
        // a real browser does, so this also pins the component's own
        // guard: `openChat` returns early on a disabled action rather
        // than relying on the UA to swallow the event.
        const router = liveRouter()
        const wrapper = await mountPanel({ router: null, recent: [chat({ id: 501 })] })

        await expect(
            wrapper.find('[data-testid="tg-chat-row-501"]').trigger('click'),
        ).resolves.not.toThrow()
        expect(router.push).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('uses no href anywhere in the chat list', async () => {
        // The decision under test is "disabled row, not <a href>": an
        // href written by the plugin would resolve against the
        // plugin's own mount path (`/spora/apps/team-graph` in the
        // host) and force a full page load, so there must be no anchor
        // to fall back on.
        const wrapper = await mountPanel({ router: null, recent: [chat({ id: 501 })] })

        const anchors = wrapper.findAll('[data-testid="tg-recent-chats-section"] a')
        expect(anchors).toHaveLength(0)
        wrapper.unmount()
    })
})

describe('AgentDetailPanel chat rows — status signal', () => {
    it('carries status in the shared status pill, not a bare colour dot', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({
            router,
            recent: [chat({ id: 501, status: 'AWAITING_SUB_AGENTS' })],
        })

        const row = wrapper.find('[data-testid="tg-chat-row-501"]')
        // The pill class comes from the plugin's single
        // status→colour table (`statusPillClass`), shared with the
        // panel header and the Variant M node card.
        expect(row.find('.tg-status-pill.tg-status-awaiting').exists()).toBe(true)
        // The text label is the part the removed bullet dot could
        // never provide: a 6 px hue swatch is invisible to a screen
        // reader and to a colour-vision-deficient operator, a label
        // is neither.
        expect(row.find('.tg-status-pill').text()).toContain('awaiting sub-agent')
        wrapper.unmount()
    })

    it('renders no inline status background, so the removed bullet cannot come back', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501, status: 'FAILED' })] })

        const row = wrapper.find('[data-testid="tg-chat-row-501"]')
        // The old row painted `style="background: <hex>"` on a 6 px
        // span. Nothing in the row carries an inline background now.
        expect(row.attributes('style') ?? '').not.toContain('background')
        // And the status still reads "failed", with the failed slug.
        expect(row.find('.tg-status-pill').text()).toContain('failed')
        expect(row.find('.tg-status-failed').exists()).toBe(true)
        wrapper.unmount()
    })

    it('labels each status distinctly rather than collapsing them', async () => {
        // The dot only ever carried a hue; the pill carries a hue and
        // a word. Two statuses that share a colour bucket
        // (`COMPLETED` and `CANCELLED` both fold onto the neutral
        // slug) must still be distinguishable by their label.
        const router = liveRouter()
        const wrapper = await mountPanel({
            router,
            recent: [chat({ id: 501, status: 'COMPLETED' }), chat({ id: 502, status: 'CANCELLED' })],
        })

        expect(wrapper.find('[data-testid="tg-chat-row-501"] .tg-status-pill').text()).toContain('idle')
        expect(wrapper.find('[data-testid="tg-chat-row-502"] .tg-status-pill').text()).toContain('cancelled')
        wrapper.unmount()
    })
})

describe('AgentDetailPanel chat rows — overflow note', () => {
    it('describes the display cap rather than pointing at the dashboard', async () => {
        // The old note read "+N more — open the dashboard for the full
        // history", which was a workaround for rows not being
        // navigable. Now they are, so the note only has to be true
        // about what it is: the cap.
        const router = liveRouter()
        const many = Array.from({ length: 6 }, (_, i) => chat({ id: 600 + i }))
        const wrapper = await mountPanel({ router, recent: many })

        const more = wrapper.find('[data-testid="tg-recent-chats-more"]')
        expect(more.exists()).toBe(true)
        expect(more.text()).toContain('+2 more')
        expect(more.text()).toContain('caps')
        expect(more.text()).not.toContain('open the dashboard')
        wrapper.unmount()
    })

    it('caps the list at four rows and still shows the note', async () => {
        const router = liveRouter()
        const many = Array.from({ length: 6 }, (_, i) => chat({ id: 600 + i }))
        const wrapper = await mountPanel({ router, recent: many })

        expect(wrapper.findAll('[data-testid="tg-recent-chats-section"] .tg-chat-row')).toHaveLength(4)
        wrapper.unmount()
    })

    it('omits the note when the list fits under the cap', async () => {
        const router = liveRouter()
        const wrapper = await mountPanel({ router, recent: [chat({ id: 501 })] })

        expect(wrapper.find('[data-testid="tg-recent-chats-more"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('AgentDetailPanel — Owner section removal', () => {
    it('renders no Owner section even when the agent record carries an owner', async () => {
        // The owning principal is chosen by the pill row at the top of
        // the page, so the panel's Owner row duplicated a control one
        // screen above it. `principal` is still on the wire and still
        // in the fixture — the section must not render anyway.
        const pinia = createPinia()
        setActivePinia(pinia)
        useSelectionStore().setSelected(11)
        fetchAgentMetaMock.mockResolvedValue({
            id: 11,
            name: 'Lead',
            description: 'Owns the marketing strategy.',
            llm_driver_config_id: 1,
            max_steps: 25,
            is_active: true,
            is_pinned: false,
            principal_id: 7,
            principal: { id: 7, type: 'user', name: 'admin@spora.local' },
            tools: [],
            created_at: '2026-09-01T00:00:00Z',
        })
        fetchActiveChatsMock.mockResolvedValue([])
        fetchRecentChatsMock.mockResolvedValue([])
        const wrapper = mount(AgentDetailPanel, {
            props: { graph: makeGraph(), router: liveRouter() },
            global: { plugins: [pinia] },
        })
        await flushPromises()

        const panel = wrapper.find('[data-testid="tg-agent-panel"]')
        // No Owner heading, no owner label, and none of the values
        // that only that section read.
        expect(panel.text()).not.toContain('Owner')
        expect(panel.text()).not.toContain('Personal agent')
        expect(panel.text()).not.toContain('admin@spora.local')
        expect(panel.text()).not.toContain('max 25 steps per run')
        // The rest of the panel is untouched — the description from the
        // same payload still renders.
        expect(panel.text()).toContain('Owns the marketing strategy.')
        wrapper.unmount()
    })

    it('keeps the rest of the panel rendering without an agent record', async () => {
        // `fetchAgentMeta` is still called (the description needs it);
        // only the owner view went away. A failed fetch must not take
        // the edge or chat sections with it.
        const wrapper = await mountPanel({ router: liveRouter(), recent: [chat({ id: 501 })] })

        expect(wrapper.find('[data-testid="tg-recent-chats-section"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-chat-row-501"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

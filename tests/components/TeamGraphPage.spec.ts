import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphPage from '../../src/components/TeamGraphPage.vue'

/**
 * TeamGraphPage — top-level layout: toolbar + legend + canvas +
 * sidebar/modal. Component test pins:
 *  - the principal selector renders and emits fixture keys,
 *  - the canvas + sidebar render together (no missing branches
 *    in the conditional),
 *  - the summary line reflects the fixture's node/edge counts.
 *
 * The Mermaid renderer is mocked so the page mounts without a
 * real DOM graph; the canvas wrapper testid is enough to assert
 * the layout.
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
    fetchPrincipals: (...args: unknown[]) => fetchPrincipalsMock(...args),
}))

vi.mock('../../src/api/agentDetail', () => ({
    fetchAgentMeta: (...args: unknown[]) => fetchAgentMetaMock(...args),
    fetchActiveChats: (...args: unknown[]) => fetchActiveChatsMock(...args),
    fetchRecentChats: (...args: unknown[]) => fetchRecentChatsMock(...args),
}))

const fixturePayload = {
    principal: { id: -1, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4 },
        { id: 2, name: 'Blake', role: 'Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3 },
    ],
    edges: [
        { id: '1->2', source: 1, target: 2, op: 'sub_agent', count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
    ],
    fixtures: [
        { key: 'tinyStartup', label: 'Tiny Startup' },
        { key: 'marketing', label: 'Marketing Team' },
        { key: 'solo', label: 'Solo Workspace' },
    ],
    generated_at: '2026-09-25T08:14:00Z',
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

beforeEach(() => {
    setActivePinia(createPinia())
    fetchGraphMock.mockReset()
    fetchPrincipalsMock.mockReset()
    fetchActiveChatsMock.mockReset()
    fetchRecentChatsMock.mockReset()
    fetchAgentMetaMock.mockReset()
    fetchPrincipalsMock.mockResolvedValue([])
    fetchActiveChatsMock.mockResolvedValue([])
    fetchRecentChatsMock.mockResolvedValue([])
    fetchAgentMetaMock.mockResolvedValue(null)
    fetchGraphMock.mockResolvedValue(fixturePayload)
})

describe('TeamGraphPage.vue', () => {
    it('renders the principal selector + canvas + summary in fixture mode', async () => {
        const wrapper = mount(TeamGraphPage, {
            props: { hostContext },
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="tg-principal-select"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-canvas-wrap"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-summary"]').exists()).toBe(true)
        // Default fixture is 'tinyStartup' which has 5 agents and 5
        // edges. The selector emits a fixture key (the liveGraph
        // fetch is mocked but never committed because
        // `inFixtureMode` is true).
        expect(wrapper.text()).toContain('5 agents')
        expect(wrapper.text()).toContain('5 edges')
        wrapper.unmount()
    })

    it('renders the legend + refresh button', async () => {
        const wrapper = mount(TeamGraphPage, {
            props: { hostContext },
        })
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-legend"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="tg-refresh"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('updates the graph when a different fixture key is emitted', async () => {
        const wrapper = mount(TeamGraphPage, {
            props: { hostContext },
        })
        await flushPromises()
        const select = wrapper.find('[data-testid="tg-principal-select"]')
        await select.setValue('marketing')
        await flushPromises()
        // Marketing fixture has 8 agents / 7 edges (vs. tinyStartup's
        // 5 / 5). Switching fixture keys drives the canvas through
        // the same graph pipeline.
        expect(wrapper.text()).toContain('8 agents')
        expect(wrapper.text()).toContain('7 edges')
        wrapper.unmount()
    })
})
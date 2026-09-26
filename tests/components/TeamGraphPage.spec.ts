import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphPage from '../../src/components/TeamGraphPage.vue'
import { useSelectionStore } from '../../src/stores/selection'
import { principalLabel } from '../../src/api/principals'
import type { PrincipalSummary } from '../../src/api/principals'

/**
 * Tests for the single-sidebar layout.
 *
 * Layout: toolbar (title + principal pill row + refresh) over a
 * grid of `[flex graph | 340px detail sidebar]`. The principal
 * pill row replaces the dropped left-column sidebar.
 *
 * Each test cases a specific page-level contract:
 *  - the pill row lists the user's user-principal first as
 *    "My Agents" and every group with its raw `name`,
 *  - clicking a pill swaps the graph to that principal,
 *  - the summary line reflects the active principal's
 *    node / edge counts,
 *  - selecting an agent via the store opens the right-side
 *    detail panel,
 *  - switching principals clears the agent selection.
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
    { id: 4, type: 'group', name: 'Engineering', is_current_user_owned: false },
]

function buildPayload(principalId: number, principalName: string) {
    return {
        principal: { id: principalId, type: 'group', name: principalName, is_current_user_owned: principalId === 7 },
        nodes: [
            { id: 11, name: 'Lead', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4 },
            { id: 12, name: 'Helper', role: 'Helper', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 2 },
        ],
        edges: [
            { id: '11->12', source: 11, target: 12, op: 'sub_agent' as const, count_24h: 1, last_invoked_at: '2026-09-25T08:14:00Z' },
        ],
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
    fetchAgentMetaMock.mockResolvedValue({
        id: 11,
        name: 'Lead',
        description: 'Owns the marketing strategy and reviews copy.',
        llm_driver_config_id: 1,
        max_steps: 25,
        is_active: true,
        is_pinned: false,
        principal_id: 7,
        principal: { id: 7, type: 'user', name: 'admin@spora.local' },
        tools: [
            { tool_class: 'Spora\\Tools\\WebSearchTool', tool_name: 'Web search', icon: 'search' },
            { tool_class: 'Spora\\Tools\\SubAgentTool', tool_name: 'Sub-agent spawn', icon: 'git-fork' },
        ],
        created_at: '2026-09-01T00:00:00Z',
    })
    fetchGraphMock.mockImplementation(async (id: number) => {
        if (id === 7) return buildPayload(7, 'admin@spora.local')
        if (id === 2) return buildPayload(2, 'Marketing')
        return buildPayload(4, 'Engineering')
    })
})

describe('TeamGraphPage.vue (single-sidebar layout)', () => {
    it('boots by selecting the user-principal and rendering the pill row', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()

        expect(fetchPrincipalsMock).toHaveBeenCalledOnce()
        expect(fetchGraphMock).toHaveBeenCalledWith(7)

        const pills = wrapper.find('[data-testid="tg-principal-pills"]').findAll('button')
        expect(pills).toHaveLength(3)
        // The user's own principal renders as "My Agents", never by
        // the wire's email-as-name.
        expect(pills[0]!.text()).toContain('MY')
        expect(pills[0]!.text()).toContain('My Agents')
        expect(pills[1]!.text()).toContain('Marketing')
        expect(pills[2]!.text()).toContain('Engineering')

        // No left-column sidebar anymore — only the right detail panel.
        expect(wrapper.find('[data-testid="tg-principal-sidebar"]').exists()).toBe(false)

        // The summary line picks up the active principal name + node/edge
        // counts from the graph response.
        expect(wrapper.text()).toContain('My Agents')
        expect(wrapper.text()).toContain('2 agents')
        expect(wrapper.text()).toContain('1 edge')

        wrapper.unmount()
    })

    it('swaps the graph when a pill is clicked', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const engineeringPill = wrapper.find('[data-testid="tg-pill-4"]')
        expect(engineeringPill.exists()).toBe(true)
        await engineeringPill.trigger('click')
        await flushPromises()

        expect(fetchGraphMock).toHaveBeenLastCalledWith(4)
        expect(wrapper.text()).toContain('Engineering')
        wrapper.unmount()
    })

    it('marks the active pill as selected (aria-selected + class)', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const ownPill = wrapper.find('[data-testid="tg-pill-7"]')
        expect(ownPill.attributes('aria-selected')).toBe('true')
        expect(ownPill.classes()).toContain('is-selected')

        const marketingPill = wrapper.find('[data-testid="tg-pill-2"]')
        expect(marketingPill.attributes('aria-selected')).toBe('false')
        expect(marketingPill.classes()).not.toContain('is-selected')
        wrapper.unmount()
    })

    it('clears selection when the principal switches', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()

        const selection = useSelectionStore()
        selection.setSelected(11)
        expect(selection.selectedId).toBe(11)

        await wrapper.find('[data-testid="tg-pill-4"]').trigger('click')
        await flushPromises()

        // Different principal → ids aren't shared → selection should clear
        // so the canvas doesn't keep the old agent visually highlighted.
        expect(selection.selectedId).toBeNull()
        wrapper.unmount()
    })

    it('renders the agent-detail panel for the selected agent', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const selection = useSelectionStore()
        selection.setSelected(11)
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-agent-panel"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('renders hierarchy info + tools + description + owner when an agent is selected', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const selection = useSelectionStore()
        selection.setSelected(11)
        await flushPromises()

        // /agents/11 was called by the detail panel for tools /
        // description / owner — these come from /agents/{id}, not the
        // graph payload.
        expect(fetchAgentMetaMock).toHaveBeenCalledWith(11)

        // Tool tiles rendered (one per configured tool) with a
        // compact two-letter chip + tooltip via the parent's title=.
        const tools = wrapper.find('[data-testid="tg-tool-tiles"]').findAll('.tg-tool-tile')
        expect(tools.length).toBe(2)
        expect(tools[0]!.attributes('title')).toBe('Web search')
        expect(tools[0]!.text()).toBe('WE')

        // Owner label says "Personal agent" because the agent is
        // owned by the user's user-principal (the test mock's
        // `principal.type === 'user'`).
        expect(wrapper.text()).toContain('Owner')
        expect(wrapper.text()).toContain('Personal agent')
        // max_steps surfaces in the owner section.
        expect(wrapper.text()).toContain('max 25 steps per run')

        // Description renders the agent's body copy.
        expect(wrapper.text()).toContain('Owns the marketing strategy')

        wrapper.unmount()
    })

    it('renders the empty state of the detail panel when no agent is selected', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        expect(wrapper.find('[data-testid="tg-agent-panel"]').exists()).toBe(true)
        expect(wrapper.find('.tg-agent-panel-empty').exists()).toBe(true)
        expect(wrapper.text()).toContain('No agent selected')
        wrapper.unmount()
    })
})

describe('principalLabel', () => {
    it('returns "My Agents" for the user-owned user-principal', () => {
        expect(principalLabel(PRINCIPALS[0]!)).toBe('My Agents')
    })

    it('returns the wire name for a group principal', () => {
        expect(principalLabel(PRINCIPALS[1]!)).toBe('Marketing')
    })

    it('returns the wire name for a user-principal that is not the viewer', () => {
        const otherUser: PrincipalSummary = {
            id: 99,
            type: 'user',
            name: 'teammate@spora.local',
            is_current_user_owned: false,
        }
        expect(principalLabel(otherUser)).toBe('teammate@spora.local')
    })
})

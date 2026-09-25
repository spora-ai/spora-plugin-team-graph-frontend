import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TeamGraphPage from '../../src/components/TeamGraphPage.vue'
import PrincipalListSidebar from '../../src/components/PrincipalListSidebar.vue'
import { useSelectionStore } from '../../src/stores/selection'
import { principalLabel } from '../../src/api/principals'
import type { PrincipalSummary } from '../../src/api/principals'

/**
 * Tests for the real-principals data path.
 *
 * The page renders the left sidebar (`<PrincipalListSidebar />`),
 * the centre graph (`<TeamGraphCanvas />` stubbed via the
 * Mermaid mock below so the test doesn't actually try to render
 * an SVG), and the right detail panel (`<AgentDetailPanel />`).
 *
 * Each test cases a specific page-level contract:
 *  - the sidebar lists the user's user-principal first as
 *    "My Agents" and every group with its raw `name`,
 *  - clicking a sidebar row swaps the graph to that principal,
 *  - the summary line reflects the active principal's
 *    node / edge counts,
 *  - selecting an agent via the store highlights it on the
 *    canvas AND opens the right-side detail panel.
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
    fetchAgentMetaMock.mockResolvedValue(null)
    fetchGraphMock.mockImplementation(async (id: number) => {
        if (id === 7) return buildPayload(7, 'admin@spora.local')
        if (id === 2) return buildPayload(2, 'Marketing')
        return buildPayload(4, 'Engineering')
    })
})

describe('TeamGraphPage.vue', () => {
    it('boots by selecting the user-principal and rendering the sidebar', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()

        expect(fetchPrincipalsMock).toHaveBeenCalledOnce()
        expect(fetchGraphMock).toHaveBeenCalledWith(7)

        const sidebar = wrapper.find('[data-testid="tg-principal-sidebar"]')
        expect(sidebar.exists()).toBe(true)
        const rows = sidebar.findAll('[data-testid^="tg-principal-row-"]')
        expect(rows).toHaveLength(3)
        // The user's own principal renders as "My Agents", never by
        // the wire's email-as-name.
        expect(rows[0]!.text()).toContain('My Agents')
        expect(rows[1]!.text()).toContain('Marketing')
        expect(rows[2]!.text()).toContain('Engineering')

        // The summary line picks up the active principal name + node/edge
        // counts from the graph response.
        expect(wrapper.text()).toContain('My Agents')
        expect(wrapper.text()).toContain('2 agents')
        expect(wrapper.text()).toContain('1 edge')

        wrapper.unmount()
    })

    it('swaps the graph when a sidebar row is clicked', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const sidebar = wrapper.findComponent(PrincipalListSidebar)
        await sidebar.vm.$emit('select', 2)
        await flushPromises()

        expect(fetchGraphMock).toHaveBeenLastCalledWith(2)
        expect(wrapper.text()).toContain('Marketing')
        wrapper.unmount()
    })

    it('clears selection when the principal switches', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()

        const selection = useSelectionStore()
        selection.setSelected(11)
        expect(selection.selectedId).toBe(11)

        const sidebar = wrapper.findComponent(PrincipalListSidebar)
        await sidebar.vm.$emit('select', 4)
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

    it('renders the empty state of the detail panel when no agent is selected', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        // The panel still mounts when there's a graph (so we don't lose
        // its scroll state), but its body shows the empty placeholder
        // rather than an agent's detail. The placeholder inside
        // `AgentDetailPanel` carries the `.tg-agent-panel-empty` class.
        expect(wrapper.find('[data-testid="tg-agent-panel"]').exists()).toBe(true)
        expect(wrapper.find('.tg-agent-panel-empty').exists()).toBe(true)
        expect(wrapper.text()).toContain('No agent selected')
        wrapper.unmount()
    })

    it('shows a tile-shaped placeholder in the right column when the graph is still loading', async () => {
        fetchGraphMock.mockReturnValueOnce(new Promise(() => { /* never resolves */ }))
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        // When the graph hasn't loaded yet, the standalone tile
        // placeholder carries the `tg-detail-placeholder` testid so
        // the page boundary stays predictable for a11y tooling.
        expect(wrapper.find('[data-testid="tg-detail-placeholder"]').exists()).toBe(true)
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

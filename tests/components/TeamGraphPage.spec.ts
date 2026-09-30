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
            { id: 11, name: 'Lead', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' } },
            { id: 12, name: 'Helper', role: 'Helper', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 2, profile_picture: { palette_key: 'amber', bg_color: '#D97706', fg_color: '#FFFBEB' } },
            { id: 13, name: 'Writer', role: 'Writer', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: 'teal', bg_color: '#0F766E', fg_color: '#F0FDFA' } },
        ],
        edges: [
            // Used in the last 24h — solid line + "Nx / 24 h" label.
            { id: '11->12', source: 11, target: 12, op: 'sub_agent' as const, configured: true as const, count_24h: 3, last_invoked_at: '2026-09-25T08:14:00Z' },
            // Configured but never fired — dashed line + "configured, never used" label.
            { id: '11->13', source: 11, target: 13, op: 'sub_agent' as const, configured: true as const, count_24h: 0, last_invoked_at: null },
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
        expect(wrapper.text()).toContain('3 agents')
        expect(wrapper.text()).toContain('2 edges')

        // The freshness indicator anchors off the first commit and
        // shows "Updated just now" (or "Xs ago" if the test ran long
        // enough for the threshold to flip). We accept either because
        // the timer reads Date.now() at mount time.
        const freshness = wrapper.find('[data-testid="tg-freshness"]')
        expect(freshness.exists()).toBe(true)
        expect(freshness.text()).toMatch(/Updated (just now|\d+s ago|\d+ min(?:s)? ago)/)

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

    it('renders the compact header + description + edges when an agent is selected', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const selection = useSelectionStore()
        selection.setSelected(11)
        await flushPromises()

        // /agents/11 was called by the detail panel for the
        // description — that comes from /agents/{id}, not the graph
        // payload. The compact variant no longer reads m.tools.
        expect(fetchAgentMetaMock).toHaveBeenCalledWith(11)

        // Compact header — agent name + status chip on one row.
        // The user dropped the #ID from the canvas node, and we
        // never show it in the panel header either. The chip lives
        // in its own component so a status poll re-renders only the
        // chip.
        expect(wrapper.find('[data-testid="tg-agent-name"]').text()).toBe('Lead')
        const chip = wrapper.findComponent({ name: 'AgentStatusChip' })
        expect(chip.exists()).toBe(true)
        expect(chip.text()).toContain('running')

        // Tools section is gone in the compact variant (the
        // dashboard's AgentCard already carries the tool list).
        expect(wrapper.find('[data-testid="tg-tool-tiles"]').exists()).toBe(false)

        // Description renders the agent's body copy (line-clamped).
        expect(wrapper.text()).toContain('Owns the marketing strategy')

        // Outbound edge list distinguishes a "used in last 24h"
        // edge from a "configured, never used" one via the new
        // edgeActivity label. The fixture has 2 outbound edges
        // (both visible at the cap of 4).
        const outbound = wrapper.find('[data-testid="tg-outbound-section"]')
        expect(outbound.text()).toContain('→ sub_agent · 3× / 24 h')
        expect(outbound.text()).toContain('→ sub_agent · configured, never used')
        expect(outbound.text()).toContain('Outbound — spawned (2)')

        wrapper.unmount()
    })

    it('shows a "+N more" line when outbound edges exceed the cap', async () => {
        // Build a fixture with 6 outbound edges — the cap is 4, so
        // the panel should render 4 rows + "+2 more" overflow.
        const manyEdges = Array.from({ length: 6 }, (_, i) => ({
            id: `11->${13 + i}`,
            source: 11,
            target: 13 + i,
            op: 'sub_agent' as const,
            configured: true as const,
            count_24h: 0,
            last_invoked_at: null,
        }))
        fetchGraphMock.mockImplementation(async (id: number) => {
            if (id === 7) return {
                ...buildPayload(7, 'admin@spora.local'),
                nodes: [
                    ...buildPayload(7, 'admin@spora.local').nodes,
                    ...Array.from({ length: 6 }, (_, i) => ({
                        id: 13 + i,
                        name: `Target ${i}`,
                        role: null,
                        picture_url: null,
                        status: 'COMPLETED',
                        active_chats: 0,
                        recent_chats_24h: 0,
                        profile_picture: { palette_key: 'slate', bg_color: '#475569', fg_color: '#F8FAFC' },
                    })),
                ],
                edges: manyEdges,
            }
            return buildPayload(id === 2 ? 2 : 4, id === 2 ? 'Marketing' : 'Engineering')
        })

        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const selection = useSelectionStore()
        selection.setSelected(11)
        await flushPromises()

        const outbound = wrapper.find('[data-testid="tg-outbound-section"]')
        expect(outbound.text()).toContain('Outbound — spawned (6)')
        expect(outbound.text()).toContain('+2 more')
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

/**
 * The full-width change.
 *
 * `max-w-7xl mx-auto` used to sit on the page, which capped the *whole*
 * layout — graph canvas included — at 80rem and centred it, so a wide
 * monitor wasted both sides. The cap now sits on the `header` only,
 * which is the one region whose content is short, left-aligned and
 * would otherwise stretch; the graph column below it takes every pixel
 * the host slot offers.
 *
 * These assert the class contract rather than a computed width:
 * happy-dom has no layout engine, so `getBoundingClientRect()` is 0 for
 * everything and a width assertion here would be vacuous. The real
 * widths were measured in a headless browser against the dev server
 * (1920 px viewport: tg-page 1162 px → 1920 px, canvas 766 px →
 * 1516 px, fitted scale 1.12 → 1.5, `scrollWidth` == `clientWidth`).
 */
/**
 * The `grid … lg:grid-cols-[minmax(0,1fr)_340px]` element: the only
 * child of the page that carries the `grid` class, reached through the
 * DOM rather than a `> div.grid` selector (which happy-dom's parser
 * rejects).
 */
function pageGrid(wrapper: ReturnType<typeof mount>): HTMLElement {
    const page = wrapper.find('[data-testid="tg-page"]').element as HTMLElement
    const grid = [...page.children].find((el) => el.classList.contains('grid'))
    if (grid === undefined) throw new Error('no grid element on the page')
    return grid as HTMLElement
}

describe('TeamGraphPage.vue — full-width graph area', () => {
    it('drops the max-width cap from the page container', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const classes = wrapper.find('[data-testid="tg-page"]').classes()
        expect(classes).toContain('w-full')
        expect(classes).not.toContain('max-w-7xl')
        expect(classes).not.toContain('mx-auto')
        // `box-border` keeps `w-full` honest: there is no Tailwind
        // preflight here, so the default box model is `content-box` and
        // `width: 100%` + `p-6` would push the page 42 px past the
        // viewport (measured: `scrollWidth` 1962 vs `clientWidth` 1920
        // at 1920 px, 928 vs 900 at 900 px). The old `max-w-7xl` was
        // capping the *content* box and hiding it.
        expect(classes).toContain('box-border')
        wrapper.unmount()
    })

    it('keeps the cap on the toolbar, where the short text lives', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const page = wrapper.find('[data-testid="tg-page"]').element as HTMLElement
        const header = [...page.children].find((el) => el.tagName === 'HEADER')
        expect(header).toBeDefined()
        // The title / summary / legend / pill row keep their measure.
        expect(header!.classList).toContain('max-w-7xl')
        wrapper.unmount()
    })

    it('leaves the 1fr / 340px grid and the stacked-below-lg layout intact', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        const grid = pageGrid(wrapper)
        const classes = grid.classList
        // Stacked by default, side-by-side from `lg`.
        expect(classes).toContain('grid-cols-1')
        expect(classes).toContain('lg:grid-cols-[minmax(0,1fr)_340px]')
        // `items-start` keeps the sticky detail panel from stretching.
        expect(classes).toContain('items-start')
        wrapper.unmount()
    })

    it('still stacks the graph above the detail panel below lg', async () => {
        const wrapper = mount(TeamGraphPage, { props: { hostContext } })
        await flushPromises()
        // Document order is the whole contract for a single column: the
        // canvas comes first, the detail panel second.
        const cols = [...pageGrid(wrapper).children]
        expect(cols).toHaveLength(2)
        expect(cols[0]!.querySelector('[data-testid="tg-canvas-wrap"]')).not.toBeNull()
        expect(cols[1]!.tagName).toBe('ASIDE')
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

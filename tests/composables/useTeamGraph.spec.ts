import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useTeamGraph } from '../../src/composables/useTeamGraph'
import { ApiError } from '../../src/api/client'
import type { GraphPayload } from '../../src/types'

/**
 * useTeamGraph — fetch + 30 s polling + dedup + principalId reactivity.
 *
 * Mock the network module (`api/teamGraph.ts → fetchGraph`) so the
 * composable's lifecycle (monotonic request token, polling
 * registration, principalId watcher, payload dedup) can be exercised
 * without hitting a real backend.
 */

const fetchGraphMock = vi.fn()
const principalId = ref<number | null>(7)

const fixturePayload: GraphPayload = {
    principal: { id: 7, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' } },
        { id: 2, name: 'Blake', role: 'Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3, profile_picture: { palette_key: 'amber', bg_color: '#D97706', fg_color: '#FFFBEB' } },
    ],
    edges: [
        { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
    ],
    generated_at: '2026-09-25T08:14:00Z',
}

vi.mock('../../src/api/teamGraph', () => ({
    fetchGraph: (id: number) => fetchGraphMock(id),
}))

beforeEach(() => {
    fetchGraphMock.mockReset()
    principalId.value = 7
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useTeamGraph', () => {
    it('fetches immediately on mount with the current principalId', async () => {
        fetchGraphMock.mockResolvedValueOnce(fixturePayload)
        const { graph, loading, lastUpdatedAt } = useTeamGraph(principalId)
        await vi.waitFor(() => {
            expect(fetchGraphMock).toHaveBeenCalledWith(7)
            expect(graph.value).toEqual(fixturePayload)
            expect(loading.value).toBe(false)
        })
        // lastUpdatedAt gets stamped on first commit so the
        // freshness indicator has a non-null anchor.
        expect(lastUpdatedAt.value).not.toBeNull()
    })

    it('returns null graph and no error when principalId is null', async () => {
        principalId.value = null
        const { graph, error } = useTeamGraph(principalId)
        expect(graph.value).toBeNull()
        expect(error.value).toBeNull()
        expect(fetchGraphMock).not.toHaveBeenCalled()
    })

    it('surfaces ApiError messages verbatim', async () => {
        fetchGraphMock.mockRejectedValueOnce(new ApiError('Network unreachable', 'NETWORK', 0))
        const { error } = useTeamGraph(principalId)
        await vi.waitFor(() => {
            expect(error.value).toBe('Network unreachable')
        })
    })

    it('falls back to a generic message for non-ApiError rejections', async () => {
        fetchGraphMock.mockRejectedValueOnce(new Error('boom'))
        const { error } = useTeamGraph(principalId)
        await vi.waitFor(() => {
            expect(error.value).toBe('failed to load team graph')
        })
    })

    it('ignores stale responses from a slow earlier call', async () => {
        let resolveSlow!: (value: GraphPayload) => void
        let resolveFast!: (value: GraphPayload) => void
        fetchGraphMock
            .mockImplementationOnce(() => new Promise<GraphPayload>((r) => { resolveSlow = r }))
            .mockImplementation(() => new Promise<GraphPayload>((r) => { resolveFast = r }))

        const { graph, refetch } = useTeamGraph(principalId)
        await vi.waitFor(() => {
            expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(1)
        })
        const refetchPromise = refetch()
        await vi.waitFor(() => {
            expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(2)
        })
        resolveFast({ ...fixturePayload, principal: { ...fixturePayload.principal, id: 99 } })
        await refetchPromise
        await vi.waitFor(() => {
            expect(graph.value?.principal.id).toBe(99)
        })
        resolveSlow({ ...fixturePayload, principal: { ...fixturePayload.principal, id: 7 } })
        await new Promise((r) => setTimeout(r, 10))
        expect(graph.value?.principal.id).toBe(99)
    })

    it('refetch() forces an immediate fetch', async () => {
        fetchGraphMock.mockResolvedValue(fixturePayload)
        const { refetch } = useTeamGraph(principalId)
        await refetch()
        expect(fetchGraphMock).toHaveBeenCalledWith(7)
        expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('skips the commit when a poll returns the same payload (dedup)', async () => {
        // Every poll returns the same bytes; the composable must
        // commit only the first one. The downstream effect (no
        // graph.value write) is what keeps the Mermaid SVG from
        // re-rendering on every poll — see the "pan/zoom reset"
        // bug report.
        fetchGraphMock.mockResolvedValue(fixturePayload)
        const { graph, lastUpdatedAt, refetch } = useTeamGraph(principalId)
        await vi.waitFor(() => expect(graph.value).toEqual(fixturePayload))
        const firstStamp = lastUpdatedAt.value
        expect(firstStamp).not.toBeNull()

        // Drive another fetch — same payload. lastUpdatedAt must
        // not advance (commit was skipped), and graph.value stays
        // referentially identical (no Vue reactivity triggers).
        await refetch()
        expect(lastUpdatedAt.value).toBe(firstStamp)
        // graph.value stays structurally equal — payloadEquals()
        // compares field-by-field and rejects identical payloads
        // before the ref's value gets replaced. `toBe` would be
        // stronger (referential identity) but the fixture spreads
        // objects inside, so structural equality is the contract.
        expect(graph.value).toEqual(fixturePayload)
    })

    it('commits when a poll returns a payload with changed node status', async () => {
        // First fetch: idle. Second fetch: one node flipped to RUNNING.
        // The composable must commit the second payload (no dedup) so
        // the canvas re-renders the new status pill colour.
        const first = {
            ...fixturePayload,
            nodes: fixturePayload.nodes.map((n) => ({ ...n, status: 'COMPLETED' as const })),
        }
        const second = {
            ...fixturePayload,
            nodes: fixturePayload.nodes.map((n, i) => i === 0 ? { ...n, status: 'RUNNING' as const } : n),
        }
        fetchGraphMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
        const { graph, refetch } = useTeamGraph(principalId)
        await vi.waitFor(() => expect(graph.value).toEqual(first))
        await refetch()
        await vi.waitFor(() => expect(graph.value).toEqual(second))
    })

    it('polls on a 30 s interval', async () => {
        vi.useFakeTimers()
        fetchGraphMock.mockResolvedValue(fixturePayload)
        useTeamGraph(principalId)
        // The immediate fetch + zero polls so far.
        expect(fetchGraphMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(29_999)
        expect(fetchGraphMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(2)
        expect(fetchGraphMock).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(30_000)
        expect(fetchGraphMock).toHaveBeenCalledTimes(3)
        vi.useRealTimers()
    })
})

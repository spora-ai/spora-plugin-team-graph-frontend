import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useTeamGraph } from '../../src/composables/useTeamGraph'
import { ApiError } from '../../src/api/client'
import type { GraphPayload } from '../../src/types'

/**
 * useTeamGraph — fetch + 5 s polling + principalId reactivity.
 *
 * Mock the network module (`api/teamGraph.ts → fetchGraph`) so the
 * composable's lifecycle (monotonic request token, polling
 * registration, principalId watcher) can be exercised without
 * hitting a real backend.
 */

const fetchGraphMock = vi.fn()
const principalId = ref<number | null>(7)

const fixturePayload: GraphPayload = {
    principal: { id: 7, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4 },
        { id: 2, name: 'Blake', role: 'Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3 },
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
        const { graph, loading } = useTeamGraph(principalId)
        await vi.waitFor(() => {
            expect(fetchGraphMock).toHaveBeenCalledWith(7)
            expect(graph.value).toEqual(fixturePayload)
            expect(loading.value).toBe(false)
        })
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
        // Monotonic-token guard: a slow earlier response whose token
        // no longer matches must not overwrite the latest committed
        // graph. We drive two concurrent fetches and resolve the
        // older one last to confirm the new value sticks.
        let resolveSlow!: (value: GraphPayload) => void
        let resolveFast!: (value: GraphPayload) => void
        fetchGraphMock
            .mockImplementationOnce(() => new Promise<GraphPayload>((r) => { resolveSlow = r }))
            .mockImplementation(() => new Promise<GraphPayload>((r) => { resolveFast = r }))

        const { graph, refetch } = useTeamGraph(principalId)
        // Wait for the immediate watcher's fetch to consume the
        // first mockImplementationOnce (resolveSlow is now wired).
        await vi.waitFor(() => {
            expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(1)
        })
        // Kick off a second fetch via refetch() — uses the second
        // mock implementation (resolveFast).
        const refetchPromise = refetch()
        await vi.waitFor(() => {
            expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(2)
        })
        // Resolve the SECOND fetch first (latest principal) — graph
        // commits to that value.
        resolveFast({ ...fixturePayload, principal: { ...fixturePayload.principal, id: 99 } })
        await refetchPromise
        await vi.waitFor(() => {
            expect(graph.value?.principal.id).toBe(99)
        })
        // Now resolve the SLOW first response — it must be ignored
        // because the request token has moved on.
        resolveSlow({ ...fixturePayload, principal: { ...fixturePayload.principal, id: 7 } })
        await new Promise((r) => setTimeout(r, 10))
        expect(graph.value?.principal.id).toBe(99)
    })

    it('refetch() forces an immediate fetch', async () => {
        fetchGraphMock.mockResolvedValue(fixturePayload)
        const { refetch } = useTeamGraph(principalId)
        await refetch()
        expect(fetchGraphMock).toHaveBeenCalledWith(7)
        // At least one call from the immediate watcher + the refetch.
        expect(fetchGraphMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
})
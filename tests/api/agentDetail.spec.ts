import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchActiveChats, fetchRecentChats } from '../../src/api/agentDetail'

/**
 * `fetchActiveChats` / `fetchRecentChats` — raw `/tasks` row →
 * `ChatSummary` mapping. The wire returns `user_prompt` /
 * `final_response` / `created_at`; the panel wants `title` /
 * `preview` / `started_at`. If the mapping drops a field on the
 * floor the panel renders blank rows — exactly the "Recent
 * chats list is empty" complaint we caught.
 *
 * Mock `getApi().get(...)` so the suite exercises the mapping
 * logic without hitting a real backend.
 */

const getMock = vi.fn()
vi.mock('../../src/api/client', () => ({
    getApi: () => ({ get: (...args: unknown[]) => getMock(...args) }),
}))

beforeEach(() => {
    getMock.mockReset()
})

afterEach(() => {
    vi.useRealTimers()
})

function rawTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 100,
        agent_id: 3,
        status: 'COMPLETED',
        user_prompt: 'What is the weather in Erlangen today?',
        final_response: 'Sunny, 22 °C, light wind from the west.',
        step_count: 2,
        max_steps: 40,
        created_at: '2026-09-25T08:14:00+00:00',
        updated_at: '2026-09-25T08:14:30+00:00',
        ...overrides,
    }
}

describe('fetchRecentChats', () => {
    it('maps /tasks rows to ChatSummary with a derived title (first line of user_prompt)', async () => {
        getMock.mockResolvedValueOnce({ tasks: [rawTask()] })
        const chats = await fetchRecentChats(3)
        expect(chats).toHaveLength(1)
        expect(chats[0]!.title).toBe('What is the weather in Erlangen today?')
        expect(chats[0]!.preview).toBe('Sunny, 22 °C, light wind from the west.')
        expect(chats[0]!.started_at).toBe('2026-09-25T08:14:00+00:00')
        expect(chats[0]!.status).toBe('COMPLETED')
    })

    it('falls back to "Untitled prompt" when user_prompt is missing or blank', async () => {
        getMock.mockResolvedValueOnce({ tasks: [rawTask({ user_prompt: null })] })
        const chats = await fetchRecentChats(3)
        expect(chats[0]!.title).toBe('Untitled prompt')
        expect(chats[0]!.preview).toBe('Sunny, 22 °C, light wind from the west.')
    })

    it('truncates title to 50 chars and preview to 120 chars with a trailing ellipsis', async () => {
        const longPrompt = 'a'.repeat(80)
        const longResponse = 'b'.repeat(200)
        getMock.mockResolvedValueOnce({ tasks: [rawTask({ user_prompt: longPrompt, final_response: longResponse })] })
        const chats = await fetchRecentChats(3)
        expect(chats[0]!.title.length).toBe(50)
        expect(chats[0]!.title.endsWith('…')).toBe(true)
        expect(chats[0]!.preview?.length).toBe(120)
        expect(chats[0]!.preview?.endsWith('…')).toBe(true)
    })

    it('collapses newlines in user_prompt to a single-line title', async () => {
        getMock.mockResolvedValueOnce({
            tasks: [rawTask({ user_prompt: 'first line\n\nsecond line\nthird' })],
        })
        const chats = await fetchRecentChats(3)
        expect(chats[0]!.title).toBe('first line')
    })

    it('collapses whitespace in final_response to a single-line preview', async () => {
        getMock.mockResolvedValueOnce({
            tasks: [rawTask({ final_response: 'line one\n\n\nline two  line three' })],
        })
        const chats = await fetchRecentChats(3)
        expect(chats[0]!.preview).toBe('line one line two line three')
    })

    it('returns empty array on 404 / network failure instead of throwing', async () => {
        getMock.mockRejectedValueOnce(new Error('404 Not Found'))
        const chats = await fetchRecentChats(3)
        expect(chats).toEqual([])
    })

    it('returns empty array when the wire has no tasks key', async () => {
        getMock.mockResolvedValueOnce({ tasks: undefined })
        const chats = await fetchRecentChats(3)
        expect(chats).toEqual([])
    })
})

describe('fetchActiveChats', () => {
    it('fans out across the three active statuses and dedupes shared tasks', async () => {
        // Task 101 shows up under both RUNNING and AWAITING_SUB_AGENTS
        // (a transition window). The merge must drop the duplicate so
        // the panel doesn't render the same row twice.
        const shared = rawTask({ id: 101, status: 'RUNNING' })
        const onlyRunning = rawTask({ id: 102, status: 'RUNNING' })
        const onlyAwaiting = rawTask({ id: 103, status: 'AWAITING_SUB_AGENTS' })
        const onlyPending = rawTask({ id: 104, status: 'PENDING_APPROVAL' })

        getMock
            .mockImplementation((url: string) => {
                if (url.includes('status=RUNNING')) return Promise.resolve({ tasks: [shared, onlyRunning] })
                if (url.includes('status=AWAITING_SUB_AGENTS')) return Promise.resolve({ tasks: [shared, onlyAwaiting] })
                if (url.includes('status=PENDING_APPROVAL')) return Promise.resolve({ tasks: [onlyPending] })
                return Promise.resolve({ tasks: [] })
            })

        const chats = await fetchActiveChats(3)
        const ids = chats.map((c) => c.id)
        expect(ids).toEqual([101, 102, 103, 104])
    })

    it('returns empty array when every status query fails', async () => {
        getMock.mockRejectedValue(new Error('boom'))
        const chats = await fetchActiveChats(3)
        expect(chats).toEqual([])
    })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { usePrincipalList } from '../../src/composables/usePrincipalList'
import { useTeamGraph } from '../../src/composables/useTeamGraph'

/**
 * The composables' failure messages, in the interface's language.
 *
 * Both composables fall back to a generic message when the endpoint
 * fails with something that is not an `ApiError` — and that fallback
 * is copy the operator reads, so it goes through the catalogue. The
 * fallback branch is the one the API's own message never takes, so it
 * needs its own test: without one, an untranslated literal would sit
 * in the source and the CI gate's candidate list would not see it.
 */

const fetchPrincipalsMock = vi.fn()
const fetchGraphMock = vi.fn()

vi.mock('../../src/api/principals', () => ({
    fetchPrincipals: () => fetchPrincipalsMock(),
    // The label is not what this spec is about, and the real one
    // reaches into the i18n instance.
    principalLabel: (p: { name: string }) => p.name,
}))

vi.mock('../../src/api/teamGraph', () => ({
    fetchGraph: () => fetchGraphMock(),
}))

beforeEach(() => {
    fetchPrincipalsMock.mockReset()
    fetchGraphMock.mockReset()
})

describe('the principal list', () => {
    it('falls back to a translated message for a non-Error rejection', async () => {
        // Not an `Error` at all: the `instanceof` guard is false, so
        // the catalogue's own message is what the operator gets.
        fetchPrincipalsMock.mockRejectedValueOnce('not an error')
        const { error } = usePrincipalList()
        await vi.waitFor(() => {
            expect(error.value).toBe('Failed to load principals.')
        })
    })
})

describe('the team graph', () => {
    it('falls back to a translated message for a non-ApiError rejection', async () => {
        fetchGraphMock.mockRejectedValueOnce(new Error('boom'))
        const { error } = useTeamGraph(ref<number | null>(7))
        await vi.waitFor(() => {
            expect(error.value).toBe('Failed to load team graph')
        })
    })
})

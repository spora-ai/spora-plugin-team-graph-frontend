import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchGraph } from '../../src/api/teamGraph'
import type { GraphPayload } from '../../src/types'

/**
 * `api/teamGraph.ts` — the one wire call the canvas makes.
 *
 * The principal list lives in `api/principals.ts`; this file exists
 * purely to build the (plugin-scoped) path and hand the host client's
 * already-unwrapped `GraphPayload` back to `useTeamGraph`. Both the
 * path shape and the id encoding are pinned here because a wrong
 * principal silently renders the wrong graph.
 */

const getMock = vi.fn()
vi.mock('../../src/api/client', () => ({
    getApi: () => ({ get: (...args: unknown[]) => getMock(...args) }),
}))

const payload: GraphPayload = {
    principal: { id: 7, type: 'group', name: 'Marketing', is_current_user_owned: false },
    nodes: [],
    edges: [],
    generated_at: '2026-09-25T08:14:00Z',
}

beforeEach(() => {
    getMock.mockReset()
})

describe('fetchGraph', () => {
    it('requests the plugin-scoped graph endpoint for the principal', async () => {
        getMock.mockResolvedValueOnce(payload)
        await expect(fetchGraph(7)).resolves.toBe(payload)
        expect(getMock).toHaveBeenCalledWith('/plugins/team-graph/graph?principal_id=7')
    })

    it('URL-encodes the principal id', async () => {
        getMock.mockResolvedValueOnce(payload)
        await fetchGraph(-12)
        expect(getMock).toHaveBeenCalledWith('/plugins/team-graph/graph?principal_id=-12')
    })

    it('propagates a transport error so useTeamGraph can surface it', async () => {
        getMock.mockRejectedValueOnce(new Error('500 Internal Server Error'))
        await expect(fetchGraph(7)).rejects.toThrow('500 Internal Server Error')
    })
})

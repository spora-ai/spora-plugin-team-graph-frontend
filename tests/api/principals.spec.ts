import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchPrincipals, principalLabel, type PrincipalSummary } from '../../src/api/principals'
import { setApi } from '../../src/api/client'
import type { PluginHostContext } from '../../src/shims'

/**
 * `api/principals.ts` — the principal pill row's data source.
 *
 * `/principals/me` is the one endpoint scoped to the *current
 * caller* (one user-principal plus every group they belong to), and
 * the host's typed client has already unwrapped `{ data: T }` — so
 * these tests pin the two things the file actually owns: the path it
 * requests and the nullish-envelope fallback.
 */

const get = vi.fn()

beforeEach(() => {
    get.mockReset()
    setApi({ get } as unknown as PluginHostContext['api'])
})

describe('fetchPrincipals', () => {
    it('requests /principals/me through the host client', async () => {
        const principals: PrincipalSummary[] = [
            { id: 1, type: 'user', name: 'fabeat', is_current_user_owned: true },
        ]
        get.mockResolvedValueOnce({ principals })

        await expect(fetchPrincipals()).resolves.toEqual(principals)
        expect(get).toHaveBeenCalledWith('/principals/me')
    })

    it('returns an empty list when the envelope carries no principals key', async () => {
        get.mockResolvedValueOnce({})
        await expect(fetchPrincipals()).resolves.toEqual([])
    })

    it('returns an empty list when principals is explicitly null', async () => {
        get.mockResolvedValueOnce({ principals: null })
        await expect(fetchPrincipals()).resolves.toEqual([])
    })

    it('propagates a transport error rather than swallowing it', async () => {
        get.mockRejectedValueOnce(new Error('401 Unauthorized'))
        await expect(fetchPrincipals()).rejects.toThrow('401 Unauthorized')
    })
})

describe('principalLabel', () => {
    const owned: PrincipalSummary = { id: 1, type: 'user', name: 'fabeat', is_current_user_owned: true }
    const group: PrincipalSummary = { id: 2, type: 'group', name: 'Marketing', is_current_user_owned: false }
    const otherUser: PrincipalSummary = { id: 3, type: 'user', name: 'someone', is_current_user_owned: false }

    it('relabels the current user\'s own user-principal as "My Agents"', () => {
        expect(principalLabel(owned)).toBe('My Agents')
    })

    it('keeps the wire name for a group principal', () => {
        expect(principalLabel(group)).toBe('Marketing')
    })

    it('keeps the wire name for a user-principal owned by someone else', () => {
        expect(principalLabel(otherUser)).toBe('someone')
    })
})

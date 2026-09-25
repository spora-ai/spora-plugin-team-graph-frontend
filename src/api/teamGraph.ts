/**
 * Wire call to `GET /api/v1/plugins/team-graph/graph?principal_id=N`.
 *
 * The host's typed REST client (`hostContext.api`) already unwraps
 * the `{ data: T }` envelope, so the result is a `GraphPayload`
 * directly. `fixtures` is optional on the wire: when the backend
 * is reachable for a real principal, the principal selector reads
 * `GET /api/v1/principals` and never consults the fixtures array.
 */
import { getApi } from './client'
import type { GraphPayload } from '../types'

export async function fetchGraph(principalId: number): Promise<GraphPayload> {
    const path = `/plugins/team-graph/graph?principal_id=${encodeURIComponent(String(principalId))}`
    return await getApi().get<GraphPayload>(path)
}

/**
 * Fetch the principal list. Used by the principal selector when the
 * graph response does NOT include a `fixtures` array (real
 * principals), so the operator can switch between principals.
 *
 * Mirrors the host's existing `GET /api/v1/principals` endpoint
 * shape; the plugin only needs `{ id, name }` per principal.
 */
export interface PrincipalListEntry {
    id: number
    name: string
}

export async function fetchPrincipals(): Promise<PrincipalListEntry[]> {
    const result = await getApi().get<{ principals: PrincipalListEntry[] }>('/principals')
    return result.principals ?? []
}
/**
 * Wire call to `GET /api/v1/plugins/team-graph/graph?principal_id=N`.
 *
 * The host's typed REST client (`hostContext.api`) already unwraps
 * the `{ data: T }` envelope, so the result is a `GraphPayload`
 * directly.
 *
 * The principal list lives in `api/principals.ts`; this file only
 * ships the graph fetch because the two halves never share state —
 * one is per-mounted-call (useTeamGraph composable) and the other is
 * per-mount-once (useTeamGraph's principals load).
 */
import { getApi } from './client'
import type { GraphPayload } from '../types'

export async function fetchGraph(principalId: number): Promise<GraphPayload> {
    const path = `/plugins/team-graph/graph?principal_id=${encodeURIComponent(String(principalId))}`
    return await getApi().get<GraphPayload>(path)
}

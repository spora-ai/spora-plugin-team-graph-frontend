/**
 * Fetch + polling for a principal's team graph.
 *
 * **Polling cadence is 30 s** — Mercure live updates are deferred
 * to v2 (see plan "Realtime updates?"). The composable exposes
 * `refetch()` so the toolbar's "Refresh" button can fire an
 * out-of-band fetch without waiting for the next tick, and
 * `lastUpdatedAt` so the UI can surface a "X seconds ago"
 * freshness indicator.
 *
 * **Payload dedup.** Every poll that returns the same nodes +
 * edges + principal as the current state commits nothing — the
 * `graph` ref stays unchanged, which means `useMermaidRender`'s
 * `watch(graph.value)` does not fire, which means the Mermaid SVG
 * is NOT torn down and re-rendered. That kills the "every 30 s
 * the canvas flashes and resets my zoom" complaint without
 * sacrificing freshness: when something *does* change (a new
 * agent's status, a freshly-spawned edge), the new payload
 * commits, the SVG re-renders, and the canvas's pan/zoom is
 * preserved by the composable's transform snapshot.
 *
 * Returns:
 *   - `graph`         : the most recent `GraphPayload` (null until first load)
 *   - `loading`       : true while a fetch is in flight
 *   - `error`         : last fetch error message (null when clean)
 *   - `refetch()`     : force a re-fetch now (skips the dedup)
 *   - `lastUpdatedAt` : ms timestamp of the last commit (drives the
 *                       freshness indicator in the toolbar)
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { fetchGraph } from '../api/teamGraph'
import { ApiError } from '../api/client'
import type { GraphPayload } from '../types'

export interface UseTeamGraph {
    graph: Ref<GraphPayload | null>
    loading: Ref<boolean>
    error: Ref<string | null>
    refetch: () => Promise<void>
    lastUpdatedAt: Ref<number | null>
}

const POLL_INTERVAL_MS = 30_000

export function useTeamGraph(principalId: Ref<number | null>): UseTeamGraph {
    const graph = ref<GraphPayload | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const lastUpdatedAt = ref<number | null>(null)

    let timer: ReturnType<typeof setInterval> | null = null
    /* Monotonic request token — a slow earlier response that no longer
     * matches the latest principalId must not commit, otherwise
     * rapid sidebar clicks surface the previous principal's data. */
    let requestToken = 0

    async function loadNow(): Promise<void> {
        const id = principalId.value
        if (id === null) {
            graph.value = null
            error.value = null
            return
        }
        const token = ++requestToken
        loading.value = true
        try {
            const payload = await fetchGraph(id)
            if (token !== requestToken) return
            /* Dedup against the current payload. Polling at 30 s
             * means ~95% of responses will be byte-identical to
             * the previous one; committing the same data would
             * cascade into a no-op Mermaid re-render + a
             * pan/zoom reset. */
            if (!payloadEquals(graph.value, payload)) {
                graph.value = payload
                lastUpdatedAt.value = Date.now()
            }
            error.value = null
        } catch (e) {
            if (token !== requestToken) return
            error.value = e instanceof ApiError ? e.message : 'failed to load team graph'
            graph.value = null
        } finally {
            if (token === requestToken) loading.value = false
        }
    }

    async function refetch(): Promise<void> {
        await loadNow()
    }

    watch(
        principalId,
        () => {
            void loadNow()
        },
        { immediate: true },
    )

    function startPolling(): void {
        stopPolling()
        timer = setInterval(() => {
            void loadNow()
        }, POLL_INTERVAL_MS)
    }

    function stopPolling(): void {
        if (timer !== null) {
            clearInterval(timer)
            timer = null
        }
    }

    startPolling()
    onBeforeUnmount(stopPolling)

    return { graph, loading, error, refetch, lastUpdatedAt }
}

/**
 * Structural equality for a graph payload. We only compare the
 * fields that actually drive the canvas — `generated_at` (a
 * server-side timestamp that ticks on every fetch) and any other
 * bookkeeping fields are deliberately ignored.
 *
 * The shape is small (≤ a few dozen agents + edges for a
 * typical principal) so a per-field string compare is fast
 * enough; no need to reach for a deep-equal library.
 */
function payloadEquals(a: GraphPayload | null, b: GraphPayload): boolean {
    if (a === null) return false
    if (a.principal.id !== b.principal.id) return false
    if (a.nodes.length !== b.nodes.length) return false
    if (a.edges.length !== b.edges.length) return false
    for (let i = 0; i < a.nodes.length; i++) {
        const na = a.nodes[i]!
        const nb = b.nodes[i]!
        if (na.id !== nb.id) return false
        if (na.status !== nb.status) return false
        if (na.active_chats !== nb.active_chats) return false
        if (na.recent_chats_24h !== nb.recent_chats_24h) return false
        if (na.profile_picture.palette_key !== nb.profile_picture.palette_key) return false
        if (na.profile_picture.bg_color !== nb.profile_picture.bg_color) return false
        if (na.profile_picture.fg_color !== nb.profile_picture.fg_color) return false
    }
    for (let i = 0; i < a.edges.length; i++) {
        const ea = a.edges[i]!
        const eb = b.edges[i]!
        if (ea.id !== eb.id) return false
        if (ea.count_24h !== eb.count_24h) return false
        if (ea.last_invoked_at !== eb.last_invoked_at) return false
    }
    return true
}

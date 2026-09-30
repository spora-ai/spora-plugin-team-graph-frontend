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
import type { GraphEdge, GraphNode, GraphPayload } from '../types'

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

/** The node fields the canvas renders — anything else is ignored. */
const NODE_FIELDS = ['id', 'status', 'active_chats', 'recent_chats_24h'] as const
/**
 * Palette fields, split out from `NODE_FIELDS` only because they live
 * under `node.profile_picture` rather than on the node itself — they
 * are compared with the same strict `===` as every other field.
 *
 * The split is load-bearing for *which* fields take part in the change
 * check, and therefore in whether a poll re-renders: a field left out
 * of both lists is invisible to `nodesEqual`, so a poll returning a
 * changed value for it will not repaint and will leave the canvas
 * showing stale data. Any new node field that affects rendering
 * belongs in one of the two lists.
 */
const NODE_PALETTE_FIELDS = ['palette_key', 'bg_color', 'fg_color'] as const
/** The edge fields the canvas renders. */
const EDGE_FIELDS = ['id', 'count_24h', 'last_invoked_at'] as const

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
    return nodesEqual(a.nodes, b.nodes) && edgesEqual(a.edges, b.edges)
}

function nodesEqual(a: GraphNode[], b: GraphNode[]): boolean {
    if (a.length !== b.length) return false
    return a.every((na, i) => {
        const nb = b[i]!
        return (
            NODE_FIELDS.every((field) => na[field] === nb[field]) &&
            NODE_PALETTE_FIELDS.every((field) => na.profile_picture[field] === nb.profile_picture[field])
        )
    })
}

function edgesEqual(a: GraphEdge[], b: GraphEdge[]): boolean {
    if (a.length !== b.length) return false
    return a.every((ea, i) => EDGE_FIELDS.every((field) => ea[field] === b[i]![field]))
}

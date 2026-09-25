/**
 * Fetch + 5-second polling for a principal's team graph.
 *
 * Polling cadence is hard-coded to 5 s — Mercure live updates are
 * deferred to v2 (see plan "Realtime updates?"). The composable
 * exposes a `refetch()` so the toolbar's "Refresh" button can fire
 * an out-of-band fetch without waiting for the next tick.
 *
 * Returns:
 *   - `graph`        : the most recent `GraphPayload` (null until first load)
 *   - `loading`      : true while a fetch is in flight
 *   - `error`        : last fetch error message (null when clean)
 *   - `refetch()`    : force a re-fetch now
 *   - `refreshTick`  : increments on every successful poll (debug aid)
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { fetchGraph } from '../api/teamGraph'
import { ApiError } from '../api/client'
import type { GraphPayload } from '../types'

export interface UseTeamGraph {
    graph: Ref<GraphPayload | null>
    loading: Ref<boolean>
    error: Ref<string | null>
    refreshTick: Ref<number>
    refetch: () => Promise<void>
}

const POLL_INTERVAL_MS = 5_000

export function useTeamGraph(principalId: Ref<number | null>): UseTeamGraph {
    const graph = ref<GraphPayload | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const refreshTick = ref(0)

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
            graph.value = payload
            error.value = null
            refreshTick.value++
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

    return { graph, loading, error, refreshTick, refetch }
}

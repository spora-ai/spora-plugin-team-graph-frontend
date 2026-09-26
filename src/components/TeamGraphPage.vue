<script setup lang="ts">
/**
 * TeamGraphPage — single-sidebar layout (graph + right-side detail).
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Toolbar                                                      │
 *   │   title · principal pill row · refresh                       │
 *   ├───────────────────────────────────┬──────────────────────────┤
 *   │ Centre graph canvas               │ Right detail sidebar     │
 *   │ (flex — gets whatever's left)     │ (340px when populated)    │
 *   └───────────────────────────────────┴──────────────────────────┘
 *
 * One graph per principal. The principal pill row in the toolbar
 * lists the user's own user-principal (always rendered as "My
 * Agents") plus every group principal they're a member of — driven
 * by `GET /principals/me` via `usePrincipalList`. Clicking a pill
 * switches the centre canvas to render that principal's directed
 * graph.
 *
 * The right column is `AgentDetailPanel` — always rendered as a
 * sidebar at every breakpoint (per user feedback: "details open in
 * an overlay instead of the sidebar" → never an overlay). It
 * shows the empty-state placeholder when no agent is selected.
 *
 * Switching principals clears the agent selection because agent
 * ids are principal-local — an id from the previous principal is
 * meaningless in the new principal's graph.
 *
 * The toolbar's refresh button calls `useTeamGraph.refetch()` which
 * re-fetches the currently-selected principal's graph on demand
 * (the 5-second polling is independent).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import { usePrincipalList } from '../composables/usePrincipalList'
import { useTeamGraph } from '../composables/useTeamGraph'
import { principalLabel, type PrincipalSummary } from '../api/principals'
import TeamGraphCanvas from './TeamGraphCanvas.vue'
import AgentDetailPanel from './AgentDetailPanel.vue'
import Legend from './Legend.vue'
import GraphErrorFallback from './GraphErrorFallback.vue'

defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const selection = useSelectionStore()

const principalList = usePrincipalList()
const { graph, loading, error, refetch, lastUpdatedAt } = useTeamGraph(principalList.selectedPrincipalId)

const shouldFit = ref(false)

/*
 * Freshness indicator — "Updated Xs ago". Ticks every 15 s so the
 * text is accurate enough to feel live without forcing a re-render
 * on every second. The interval is independent of the polling
 * interval because the indicator only reads `lastUpdatedAt` and
 * does not trigger any network call.
 */
const now = ref<number>(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
    nowTimer = setInterval(() => {
        now.value = Date.now()
    }, 15_000)
})
onBeforeUnmount(() => {
    if (nowTimer !== null) clearInterval(nowTimer)
})

const freshnessLabel = computed<string | null>(() => {
    if (lastUpdatedAt.value === null) return null
    const secs = Math.max(0, Math.round((now.value - lastUpdatedAt.value) / 1_000))
    if (secs < 5) return 'Updated just now'
    if (secs < 60) return `Updated ${secs}s ago`
    const mins = Math.round(secs / 60)
    return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`
})

const activePrincipal = computed<PrincipalSummary | null>(() => {
    const id = principalList.selectedPrincipalId.value
    if (id === null) return null
    return principalList.principals.value.find((p) => p.id === id) ?? null
})

interface GraphStats {
    nodes: number
    edges: number
    bidirectional: number
}

const stats = computed<GraphStats>(() => {
    const g = graph.value
    if (g === null) return { nodes: 0, edges: 0, bidirectional: 0 }
    const seen = new Set<string>()
    let bidirectional = 0
    for (const e of g.edges) {
        const key = [e.source, e.target].sort((a, b) => a - b).join('-')
        if (seen.has(key)) continue
        seen.add(key)
        if (g.edges.some((o) => o.source === e.target && o.target === e.source)) bidirectional++
    }
    return { nodes: g.nodes.length, edges: g.edges.length, bidirectional }
})

async function refresh(): Promise<void> {
    await refetch()
    shouldFit.value = true
}

function onSelectPrincipal(id: number): void {
    selection.clear()
    principalList.select(id)
}

function isOwn(principal: PrincipalSummary): boolean {
    return principal.type === 'user' && principal.is_current_user_owned
}

watch(() => principalList.selectedPrincipalId.value, () => {
    selection.clear()
    shouldFit.value = true
})

/* No `watch(refreshTick, () => selection.clear())` here:
 * the 5 s poll triggers re-renders, but a user-selected agent is
 * still valid across refreshes — clearing it on every poll makes
 * the right-side panel flicker back to empty. The selection is
 * cleared on principal switch (above), on empty-canvas tap
 * (below), and on a user clicking the same node twice (handled in
 * useMermaidRender's click listener). The watch has nothing to do
 * for a poll-driven re-render. */

function onTapEmptyCanvas(): void {
    selection.clear()
}
</script>

<template>
    <div class="p-4 lg:p-6 max-w-7xl mx-auto w-full" data-testid="tg-page">
        <header class="mb-4 space-y-3">
            <div class="flex flex-wrap items-end justify-between gap-3">
                <div class="min-w-0">
                    <h1 class="text-2xl font-semibold tracking-tight">Team Graph</h1>
                    <p
                        v-if="activePrincipal !== null && graph !== null"
                        class="text-sm text-muted-foreground mt-1"
                        data-testid="tg-summary"
                    >
                        <span class="text-foreground font-medium">{{ principalLabel(activePrincipal) }}</span>
                        ·
                        {{ stats.nodes }} agent{{ stats.nodes === 1 ? '' : 's' }} ·
                        {{ stats.edges }} edge{{ stats.edges === 1 ? '' : 's' }}
                        <span v-if="stats.bidirectional > 0">
                            · {{ stats.bidirectional }} bidirectional
                        </span>
                    </p>
                    <p
                        v-else-if="principalList.loading.value"
                        class="text-sm text-muted-foreground mt-1"
                    >
                        Loading teams…
                    </p>
                    <p v-else class="text-sm text-muted-foreground mt-1">
                        Select a team below to view its agent graph.
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <span
                        v-if="freshnessLabel !== null"
                        class="text-xs text-muted-foreground"
                        data-testid="tg-freshness"
                    >{{ freshnessLabel }}</span>
                    <button
                        type="button"
                        class="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 px-3 transition-colors"
                        data-testid="tg-refresh"
                        :disabled="loading"
                        @click="refresh"
                    >
                        <svg
                            class="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6 1 6.3 2.6L21 8" />
                            <path d="M21 3v5h-5" />
                        </svg>
                        Refresh
                    </button>
                </div>
            </div>

            <!-- Principal pill row: one pill per principal. Wraps when there are
                 many principals so the toolbar never overflows horizontally. -->
            <div
                v-if="principalList.principals.value.length > 0"
                data-testid="tg-principal-pills"
                class="flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="Principals"
            >
                <button
                    v-for="p in principalList.principals.value"
                    :key="p.id"
                    type="button"
                    role="tab"
                    :data-testid="`tg-pill-${p.id}`"
                    :aria-selected="p.id === principalList.selectedPrincipalId.value"
                    class="tg-pill"
                    :class="p.id === principalList.selectedPrincipalId.value ? 'is-selected' : ''"
                    @click="onSelectPrincipal(p.id)"
                >
                    <span
                        class="tg-pill__badge"
                        :class="isOwn(p) ? 'tg-pill__badge--my' : 'tg-pill__badge--group'"
                        aria-hidden="true"
                    >{{ isOwn(p) ? 'MY' : 'G' }}</span>
                    <span class="truncate">{{ principalLabel(p) }}</span>
                </button>
            </div>
            <p
                v-else-if="!principalList.loading.value"
                class="text-xs text-muted-foreground"
            >
                No principals available for this user.
            </p>

            <Legend />
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <div class="min-w-0">
                <div
                    v-if="error !== null && graph === null"
                    class="surface-card border border-border rounded-xl bg-card text-card-foreground"
                    style="height: 620px;"
                    data-testid="tg-graph-error"
                >
                    <GraphErrorFallback :message="error">
                        <button
                            type="button"
                            class="mt-4 text-[11px] font-medium text-primary hover:underline"
                            @click="refresh"
                        >
                            Retry
                        </button>
                    </GraphErrorFallback>
                </div>
                <TeamGraphCanvas
                    v-else
                    :graph="graph"
                    :should-fit="shouldFit"
                    @tap-empty-canvas="onTapEmptyCanvas"
                />
            </div>

            <aside class="min-w-0">
                <AgentDetailPanel v-if="graph !== null" :graph="graph" />
                <div
                    v-else
                    class="surface-card border border-border rounded-xl bg-card text-card-foreground p-6 text-center"
                    data-testid="tg-detail-placeholder"
                >
                    <p class="text-sm font-medium">No agent selected</p>
                    <p class="text-xs text-muted-foreground mt-1">
                        Click any node in the diagram to see its inbound and outbound relations,
                        plus recent chats.
                    </p>
                </div>
            </aside>
        </div>
    </div>
</template>

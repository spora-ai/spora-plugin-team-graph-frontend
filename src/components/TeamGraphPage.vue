<script setup lang="ts">
/**
 * TeamGraphPage — three-column layout.
 *
 *   ┌─────────────┬────────────────────────┬──────────────────┐
 *   │ Left list   │ Centre graph canvas     │ Right detail      │
 *   │ (principals │                        │ (selected agent)  │
 *   │ the user is │                        │                   │
 *   │ a member of)│                        │                   │
 *   └─────────────┴────────────────────────┴──────────────────┘
 *
 * One graph per principal. The left column is a sidebar that lists
 * the user's own user-principal ("My Agents") plus every group they're
 * a member of. The right column is the agent-detail sidebar — it now
 * renders as a sidebar at every viewport size, never as a centred
 * modal (the modal-on-mobile variant is gone: the right column just
 * collapses to a smaller fixed width on narrow screens).
 *
 * Data flow:
 *   - usePrincipalList → loads `/api/v1/principals` on mount, exposes
 *     `principals`, `selectedPrincipalId`, `select(id)`, `reload()`.
 *   - useTeamGraph → fetches the live `/plugins/team-graph/graph` for
 *     the selected principal id, 5-second polling, refetch button.
 *
 * Selection (which agent is highlighted in the canvas) lives in the
 * Pinia store so the canvas (centre) and the detail panel (right) stay
 * in lockstep across re-renders.
 *
 * Switching principals clears the agent selection — agent ids are
 * principal-local, so an id from the previous principal is meaningless
 * in the new principal's graph.
 */
import { computed, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import { usePrincipalList } from '../composables/usePrincipalList'
import { useTeamGraph } from '../composables/useTeamGraph'
import { principalLabel, type PrincipalSummary } from '../api/principals'
import TeamGraphCanvas from './TeamGraphCanvas.vue'
import AgentDetailPanel from './AgentDetailPanel.vue'
import PrincipalListSidebar from './PrincipalListSidebar.vue'
import Legend from './Legend.vue'
import GraphErrorFallback from './GraphErrorFallback.vue'

defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const selection = useSelectionStore()

const principalList = usePrincipalList()
const { graph, loading, error, refetch, refreshTick } = useTeamGraph(principalList.selectedPrincipalId)

const shouldFit = ref(false)
const principalError = computed<{ list: string | null; graph: string | null }>(() => ({
    list: principalList.error.value,
    graph: error.value,
}))

interface PrincipalHeadline {
    label: string
    badge: 'MY' | 'GROUP'
}

const activePrincipal = computed<PrincipalSummary | null>(() => {
    const id = principalList.selectedPrincipalId.value
    if (id === null) return null
    return principalList.principals.value.find((p) => p.id === id) ?? null
})

const headline = computed<PrincipalHeadline | null>(() => {
    const p = activePrincipal.value
    if (p === null) return null
    return {
        label: principalLabel(p),
        badge: p.type === 'user' && p.is_current_user_owned ? 'MY' : 'GROUP',
    }
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

watch(() => principalList.selectedPrincipalId.value, () => {
    selection.clear()
    shouldFit.value = true
})

watch(refreshTick, () => {
    selection.clear()
})

function onTapEmptyCanvas(): void {
    selection.clear()
}
</script>

<template>
    <div class="p-4 lg:p-6 max-w-7xl mx-auto w-full" data-testid="tg-page">
        <header class="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div class="min-w-0">
                <h1 class="text-2xl font-semibold tracking-tight">Team Graph</h1>
                <p
                    v-if="headline !== null && graph !== null"
                    class="text-sm text-muted-foreground mt-1"
                    data-testid="tg-summary"
                >
                    <span class="text-foreground font-medium">{{ headline.label }}</span>
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
                <p
                    v-else
                    class="text-sm text-muted-foreground mt-1"
                >
                    Select a team on the left to view its agent graph.
                </p>
            </div>
            <div class="flex items-center gap-2">
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
                    >
                        <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6 1 6.3 2.6L21 8" />
                        <path d="M21 3v5h-5" />
                    </svg>
                    Refresh
                </button>
            </div>
        </header>

        <Legend />

        <div class="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_340px] gap-4 items-start">
            <PrincipalListSidebar
                :principals="principalList.principals.value"
                :selected-id="principalList.selectedPrincipalId.value"
                :loading="principalList.loading.value"
                @select="onSelectPrincipal"
            />

            <div class="min-w-0">
                <div
                    v-if="principalError.graph !== null && graph === null"
                    class="surface-card border border-border rounded-xl bg-card text-card-foreground"
                    style="height: 620px;"
                    data-testid="tg-graph-error"
                >
                    <GraphErrorFallback :message="principalError.graph ?? ''">
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

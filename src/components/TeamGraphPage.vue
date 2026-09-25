<script setup lang="ts">
/**
 * TeamGraphPage — top-level layout.
 *
 * Toolbar (title + principal selector + refresh) → legend →
 * canvas + (lg+) sidebar / (<lg) centred modal.
 *
 * Source switch:
 *   - When the API response carries `fixtures`, the toolbar
 *     selector switches between in-memory demo principals
 *     (`FixtureKey`). No backend call is made.
 *   - Otherwise, the selector is fed by `GET /api/v1/principals`
 *     and each switch triggers `fetchGraph(principalId)` via
 *     `useTeamGraph`.
 *
 * Selection lives in Pinia so the canvas (left) and the panel /
 * modal (right) stay in lockstep.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import { useTeamGraph } from '../composables/useTeamGraph'
import { fixtureByKey } from '../api/fixtures'
import { fetchPrincipals } from '../api/teamGraph'
import TeamGraphCanvas from './TeamGraphCanvas.vue'
import AgentDetailPanel from './AgentDetailPanel.vue'
import AgentDetailModal from './AgentDetailModal.vue'
import PrincipalSelector from './PrincipalSelector.vue'
import Legend from './Legend.vue'
import GraphErrorFallback from './GraphErrorFallback.vue'
import type { GraphPayload } from '../types'

defineProps<{
    hostContext: import('../shims').PluginHostContext
}>()

const selection = useSelectionStore()

const principalId = ref<number | null>(null)
const fixtureKey = ref<string>('tinyStartup')
const fixtureGraph = ref<GraphPayload | null>(null)
const principals = ref<{ id: number; name: string }[]>([])
const shouldFit = ref(false)

const inFixtureMode = computed<boolean>(() => fixtureGraph.value !== null && fixtureGraph.value.fixtures.length > 0)

const { graph: liveGraph, loading, error, refetch, refreshTick } = useTeamGraph(principalId)

const graph = computed<GraphPayload | null>(() => {
    if (inFixtureMode.value) return fixtureGraph.value
    return liveGraph.value
})

const summary = computed<{ nodes: number; edges: number; bidirectional: number }>(() => {
    if (graph.value === null) return { nodes: 0, edges: 0, bidirectional: 0 }
    const bidirectional = (() => {
        const seen = new Set<string>()
        let n = 0
        for (const e of graph.value.edges) {
            const key = [e.source, e.target].sort((a, b) => a - b).join('-')
            if (seen.has(key)) continue
            seen.add(key)
            if (graph.value.edges.some((o) => o.source === e.target && o.target === e.source)) n++
        }
        return n
    })()
    return { nodes: graph.value.nodes.length, edges: graph.value.edges.length, bidirectional }
})

async function refresh(): Promise<void> {
    if (inFixtureMode.value) {
        const bundle = fixtureByKey(fixtureKey.value)
        if (bundle !== null) fixtureGraph.value = bundle.graph
    } else {
        await refetch()
    }
    shouldFit.value = true
}

watch(fixtureKey, (next) => {
    selection.clear()
    if (inFixtureMode.value) {
        const bundle = fixtureByKey(next)
        if (bundle !== null) {
            fixtureGraph.value = bundle.graph
            shouldFit.value = true
        }
    }
})

watch(principalId, () => {
    selection.clear()
    shouldFit.value = true
})

watch(refreshTick, () => {
    selection.clear()
})

onMounted(async () => {
    try {
        const list = await fetchPrincipals()
        principals.value = list
        if (list.length > 0 && principalId.value === null) {
            const first = list[0]
            if (first !== undefined) principalId.value = first.id
        }
    } catch {
        principals.value = []
    }
    if (fixtureGraph.value === null) {
        const bundle = fixtureByKey(fixtureKey.value)
        if (bundle !== null) fixtureGraph.value = bundle.graph
    }
})

function onTapEmptyCanvas(): void {
    selection.clear()
}

function onModalClose(): void {
    selection.clear()
}
</script>

<template>
    <div class="p-4 lg:p-6 max-w-7xl mx-auto w-full">
        <header class="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div class="min-w-0">
                <h1 class="text-2xl font-semibold tracking-tight">Team Graph</h1>
                <p
                    v-if="graph !== null"
                    class="text-sm text-muted-foreground mt-1"
                    data-testid="tg-summary"
                >
                    {{ summary.nodes }} agents · {{ summary.edges }} edge{{ summary.edges === 1 ? '' : 's' }}
                    <span v-if="summary.bidirectional > 0"> · {{ summary.bidirectional }} bidirectional</span>
                </p>
                <p
                    v-else
                    class="text-sm text-muted-foreground mt-1"
                >
                    Loading the team graph…
                </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <PrincipalSelector
                    :fixtures="inFixtureMode && graph !== null ? graph.fixtures : []"
                    :principals="principals"
                    @update:fixture-key="fixtureKey = $event"
                    @update:principal-id="principalId = $event"
                />
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

        <div
            v-if="error !== null && graph === null"
            class="surface-card border border-border rounded-xl bg-card text-card-foreground"
            style="height: 620px;"
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
        <div
            v-else
            class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4"
        >
            <TeamGraphCanvas
                :graph="graph"
                :should-fit="shouldFit"
                @tap-empty-canvas="onTapEmptyCanvas"
            />
            <aside class="hidden lg:block">
                <AgentDetailPanel v-if="graph !== null" :graph="graph" />
            </aside>
        </div>

        <AgentDetailModal
            v-if="graph !== null"
            :graph="graph"
            :open="selection.selectedId !== null"
            @close="onModalClose"
        />
    </div>
</template>
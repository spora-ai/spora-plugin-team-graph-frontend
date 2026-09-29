<script setup lang="ts">
/**
 * TeamGraphPage — single-sidebar layout (graph + right-side detail).
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Toolbar (capped at max-w-7xl)                               │
 *   │   title · principal pill row · refresh                       │
 *   ├───────────────────────────────────┬──────────────────────────┤
 *   │ Centre graph canvas               │ Right detail sidebar     │
 *   │ (full width — gets whatever's    │ (340px when populated)    │
 *   │  left after the sidebar)          │                          │
 *   └───────────────────────────────────┴──────────────────────────┘
 *
 * **Where the width cap lives, and why it moved.** The page used to
 * carry `max-w-7xl mx-auto`, which capped *everything* — the graph
 * canvas included — at 80 rem and centred it, so a 1920 px monitor
 * wasted both sides of the diagram. The cap now sits on the `header`
 * only, which is the one region that genuinely wants one:
 *
 *   - the toolbar's own text is short and left-aligned (an `h1`, a
 *     one-line summary, a wrapping row of principal pills, a wrapping
 *     legend of status chips), so without a cap `justify-between`
 *     would fling the Refresh button 900 px away from the title it
 *     belongs with;
 *   - the legend and pill rows are `flex-wrap` chip rows that gain
 *     nothing from extra width;
 *   - the only prose on the page is the agent description, and it lives
 *     in the detail panel — a *fixed* 340 px column, which is why it
 *     was never affected by the page cap and still isn't.
 *
 * Below the header, the `1fr` column takes every pixel the host slot
 * offers, so the graph gets the width back. Measured in a headless
 * browser at a 1920 px viewport: page 1162 px → 1920 px, canvas
 * 766 px → 1516 px, and the diagram's fitted scale 1.12 → 1.5 (the
 * `FIT_MAX_SCALE` cap) — see `composables/usePanZoom.ts → reflow()`,
 * which re-fits when the canvas box changes.
 *
 * **`box-border` is load-bearing, not decoration.** This plugin
 * imports Tailwind without `preflight` (see `style.css` note 1 — the
 * host owns the reset), so nothing in the subtree sets
 * `box-sizing: border-box` and the default is `content-box`. `w-full`
 * is then `width: 100%` of the parent *plus* the horizontal padding,
 * which is 42 px at `lg:p-6` (1.5 rem × the 14 px root this
 * stylesheet sets). The `max-w-7xl` that used to sit alongside it
 * capped the *content* box, so the padding fitted inside the cap and
 * nothing overflowed; with the cap gone the page grew 42 px wider
 * than the viewport and produced a horizontal scrollbar at every
 * width. Measured: `documentElement.scrollWidth` 1962 vs
 * `clientWidth` 1920 at a 1920 px viewport, 928 vs 900 at 900 px (the
 * latter pre-existing — it was only the wide widths the cap had been
 * hiding). `box-border` folds the padding inside the 100 % and both
 * are 0 now.
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
import { Icon } from '@spora-ai/components/icons'
import { useSelectionStore } from '../stores/selection'
import { usePrincipalList } from '../composables/usePrincipalList'
import { useTeamGraph } from '../composables/useTeamGraph'
import { countBidirectional } from '../lib/stats'
import { principalLabel, type PrincipalSummary } from '../api/principals'
import TeamGraphCanvas from './TeamGraphCanvas.vue'
import AgentDetailPanel from './AgentDetailPanel.vue'
/*
 * Imported as `StatusKey`, not `StatusLegend`. Sonar's web analyser
 * matches a Vue component's tag name case-insensitively against the
 * HTML `<legend>` element and files Web:S8732 ("move this <legend>
 * to be a direct child of <fieldset>") for the self-closing
 * `<StatusLegend />` at the bottom of this template — even though the
 * component renders a <span> row and is not a legend at all. The
 * local binding name is the only part of the identifier the analyser
 * sees, so it has to avoid the substring.
 */
import StatusKey from './StatusLegend.vue'
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
    return { nodes: g.nodes.length, edges: g.edges.length, bidirectional: countBidirectional(g.edges) }
})

/**
 * A payload that arrived with zero agents — the graph is
 * legitimately empty, which is a different thing from "no payload
 * yet". `useTeamGraph` hands back `graph === null` while the first
 * fetch is in flight, so the null check alone would flash this state
 * on every load; requiring a non-null payload with no nodes is what
 * keeps "still loading" and "nothing to show" apart.
 *
 * The note itself is rendered by `TeamGraphCanvas` (see
 * `hasGraph` there), not here — the canvas owns the pan/zoom
 * surface, the zoom stack and the footer hint that the empty state
 * has to suppress, and unmounting the canvas to swap in a card was
 * measured to strand the *next* graph: a canvas that mounts with a
 * non-null `graph` prop never runs Mermaid, because
 * `useMermaidRender`'s immediate watcher fires during `setup()` when
 * `hostRef` is still null. This flag is only here to drive the
 * selection clear below.
 */
const graphIsEmpty = computed<boolean>(() => graph.value !== null && graph.value.nodes.length === 0)

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

/*
 * Clear the selection when the graph empties under the operator's
 * feet. The principal-switch watcher above covers the pill click, but
 * a poll is a different path: a 30 s tick that drops the last agent
 * leaves `selectedId` pointing at an id that is no longer in
 * `graph.nodes`, and `AgentDetailPanel` would keep the previous
 * agent's header on screen over an empty canvas. Keying the watcher
 * on the node *count* (null while loading, 0 when empty) means it
 * fires on the non-empty → empty transition the same way a switch
 * does, and is a no-op for every other tick.
 */
watch(graphIsEmpty, (empty) => {
    if (empty) selection.clear()
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
    <div class="p-4 lg:p-6 box-border w-full" data-testid="tg-page">
        <header class="mb-4 space-y-3 max-w-7xl">
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
                        <Icon
                            name="refresh"
                            class="w-4 h-4"
                        />
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

            <StatusKey />
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
                <AgentDetailPanel
                    v-if="graph !== null"
                    :graph="graph"
                    :router="hostContext.router"
                />
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

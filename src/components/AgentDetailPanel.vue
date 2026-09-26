<script setup lang="ts">
/**
 * Right-sidebar agent detail panel — renders at every viewport.
 *
 * Layout (top → bottom):
 *   1. Header: avatar + name + role + status pill
 *   2. Activity counts (active + 24 h)
 *   3. Hierarchy chain (root → ... → this agent) — computed from the
 *      graph payload's inbound edges by walking up the spawn tree
 *      until a node with no parent is reached
 *   4. Owner / Principal (live /agents/{id} payload)
 *   5. Description (line-clamped, from /agents/{id})
 *   6. Tools row (icons + tooltip, from /agents/{id})
 *   7. Inbound + Outbound edges (graph payload) — already clickable
 *      deep-links; switching selection also fires `selection.setSelected`
 *      so the canvas highlights the new node
 *   8. Active chats (live /tasks)
 *   9. Recent chats (live /tasks)
 *
 * Edge rows are deep-link buttons — clicking one sets
 * `selection.setSelected(otherId)` so the canvas highlights the
 * target and the panel re-renders for the new agent.
 *
 * Active / recent chats come from the live `/tasks` endpoint; the
 * `is_archived` filter and `principal_id` scope mirror what the
 * host's dashboard chat feed shows, so the operator sees the same
 * set of chats here as on the agent's main page.
 */
import { computed, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import {
    fetchActiveChats,
    fetchAgentMeta,
    fetchRecentChats,
    type AgentMeta,
    type AgentToolEntry,
} from '../api/agentDetail'
import { statusColor, statusLabel, statusPillClass } from '../lib/nodeStatus'
import { inDegree, outDegree } from '../lib/stats'
import type { ChatSummary, GraphEdge, GraphNode, GraphPayload } from '../types'

const props = defineProps<{
    graph: GraphPayload
}>()

const selection = useSelectionStore()

const selectedNode = computed<GraphNode | null>(() => {
    const id = selection.selectedId
    if (id === null) return null
    return props.graph.nodes.find((n) => n.id === id) ?? null
})

const outboundEdges = computed<GraphEdge[]>(() =>
    selectedNode.value === null ? [] : outDegree(props.graph.edges, selectedNode.value.id),
)
const inboundEdges = computed<GraphEdge[]>(() =>
    selectedNode.value === null ? [] : inDegree(props.graph.edges, selectedNode.value.id),
)

/**
 * Walk up the spawn tree to find the chain of ancestors, capped at
 * three hops (anything deeper reads as "deeply nested"). Multi-parent
 * chains collapse to the first parent found — clicking an inbound
 * edge in the panel below lets the operator hop between branches.
 */
interface AncestorLink {
    id: number
    name: string
    role: string | null
}

const MAX_HIERARCHY_DEPTH = 3

const hierarchyChain = computed<{ path: AncestorLink[]; isRoot: boolean }>(() => {
    const node = selectedNode.value
    if (node === null) return { path: [], isRoot: false }
    const path: AncestorLink[] = []
    const visited = new Set<number>([node.id])
    let currentId: number | null = node.id
    for (let i = 0; i < MAX_HIERARCHY_DEPTH; i++) {
        const parents: GraphEdge[] = currentId === null ? [] : inDegree(props.graph.edges, currentId)
        const parentEdge: GraphEdge | undefined = parents[0]
        if (parentEdge === undefined) {
            return { path, isRoot: true }
        }
        const parentId: number = parentEdge.source
        if (visited.has(parentId)) {
            // Cycle (shouldn't happen in a directed spawn graph, but
            // defensive — break out before infinite-looping the walk).
            return { path, isRoot: true }
        }
        visited.add(parentId)
        const parentNode: GraphNode | undefined = props.graph.nodes.find((n) => n.id === parentId)
        if (parentNode === undefined) {
            return { path, isRoot: true }
        }
        path.unshift({ id: parentNode.id, name: parentNode.name, role: parentNode.role })
        currentId = parentNode.id
    }
    /* We hit the depth cap with parents still ahead — show what we
     * have and let the operator click an inbound edge to go deeper. */
    return { path, isRoot: false }
})

const activeChats = ref<ChatSummary[]>([])
const recentChats = ref<ChatSummary[]>([])
const agentMeta = ref<AgentMeta | null>(null)
const metaLoading = ref(false)

async function loadAgentMeta(agentId: number): Promise<AgentMeta | null> {
    metaLoading.value = true
    try {
        return await fetchAgentMeta(agentId)
    } finally {
        metaLoading.value = false
    }
}

watch(
    () => selectedNode.value?.id,
    async (id) => {
        activeChats.value = []
        recentChats.value = []
        agentMeta.value = null
        if (id === undefined || id === null) return
        /* Three independent fetches — meta + active + recent — all
         * scoped to the freshly-clicked agent. They run in parallel;
         * any individual failure (network, 404) degrades gracefully
         * to empty arrays. */
        const [metaResult, activeResult, recentResult] = await Promise.allSettled([
            loadAgentMeta(id),
            fetchActiveChats(id),
            fetchRecentChats(id),
        ])
        agentMeta.value = metaResult.status === 'fulfilled' ? metaResult.value : null
        activeChats.value = activeResult.status === 'fulfilled' ? activeResult.value : []
        recentChats.value = recentResult.status === 'fulfilled' ? recentResult.value : []
    },
    { immediate: true },
)

function initials(name: string): string {
    return name
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .slice(0, 2)
        .join('')
        .toUpperCase()
}

function otherEnd(edge: GraphEdge, direction: 'out' | 'in'): number {
    return direction === 'out' ? edge.target : edge.source
}

function relTime(iso: string | null): string {
    if (iso === null || iso === '') return ''
    const then = new Date(iso).getTime()
    if (!Number.isFinite(then)) return iso
    const mins = Math.round((Date.now() - then) / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`
    return 'yesterday'
}

/**
 * Build the secondary line of an edge row in the detail panel.
 *
 * The wire payload distinguishes three states for a configured
 * sub-agent edge:
 *
 *   1. Just-fired:  `count_24h > 0`, recent timestamp
 *   2. Dormant:     `count_24h === 0` but `last_invoked_at !== null`
 *                   (fired within the 7-day enrichment window but
 *                   outside the 24h counter)
 *   3. Unfired:     `count_24h === 0 && last_invoked_at === null`
 *                   (configured but never invoked)
 *
 * Returns the plain-text label so the template can render it without
 * branching on every case.
 */
function edgeActivity(edge: GraphEdge): string {
    if (edge.count_24h > 0) {
        return `${edge.count_24h}× / 24 h · ${relTime(edge.last_invoked_at)}`
    }
    if (edge.last_invoked_at !== null) {
        return `last seen ${relTime(edge.last_invoked_at)}`
    }
    return 'configured, never used'
}

function jumpTo(id: number): void {
    selection.setSelected(id)
}

const visibleTools = computed<AgentToolEntry[]>(() => {
    const m = agentMeta.value
    if (m === null) return []
    return m.tools
})

const ownerLabel = computed<string>(() => {
    const m = agentMeta.value
    if (m === null || m.principal === null) return ''
    if (m.principal.type === 'user') return 'Personal agent'
    return m.principal.name
})
</script>

<template>
    <div data-testid="tg-agent-panel" class="tg-agent-panel surface-card border border-border rounded-xl bg-card text-card-foreground">
        <div v-if="selectedNode === null" class="tg-agent-panel-empty px-6 py-10">
            <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <svg
                    class="w-5 h-5 text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                </svg>
            </div>
            <p class="text-sm font-medium text-foreground">No agent selected</p>
            <p class="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Click any node in the diagram to see its inbound and outbound relations, plus recent chats.
            </p>
        </div>
        <template v-else>
            <header class="flex items-start gap-3 p-4 border-b border-border">
                <div
                    class="shrink-0 flex items-center justify-center text-white font-semibold text-xs"
                    :style="{ background: statusColor(selectedNode.status), width: '38px', height: '38px', borderRadius: '999px' }"
                >
                    {{ initials(selectedNode.name) }}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-sm font-semibold leading-tight truncate">{{ selectedNode.name }}</h3>
                    <p class="text-[11px] text-muted-foreground leading-tight truncate">
                        #{{ selectedNode.id }} · {{ selectedNode.role ?? '—' }}
                    </p>
                    <span
                        class="tg-status-pill mt-1.5"
                        :class="statusPillClass(selectedNode.status)"
                    >
                        <span class="dot" />
                        {{ statusLabel(selectedNode.status) }}
                    </span>
                </div>
            </header>
            <div class="tg-agent-panel-body p-4 space-y-5">
                <section class="flex items-center justify-between text-xs">
                    <span class="text-muted-foreground">Activity</span>
                    <span>
                        <strong class="text-foreground">{{ selectedNode.active_chats }}</strong>
                        active ·
                        <strong class="text-foreground">{{ selectedNode.recent_chats_24h }}</strong>
                        / 24 h
                    </span>
                </section>

                <!-- Hierarchy chain: root → ... → this agent. Walks
                     inbound edges up to MAX_HIERARCHY_DEPTH. -->
                <section
                    v-if="hierarchyChain.path.length > 0 || hierarchyChain.isRoot"
                    data-testid="tg-hierarchy-chain"
                >
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Hierarchy
                    </h4>
                    <p
                        v-if="hierarchyChain.isRoot"
                        class="text-xs text-muted-foreground"
                    >
                        Root — no parent in this team.
                    </p>
                    <p
                        v-else
                        class="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1"
                    >
                        <template v-for="(link, idx) in hierarchyChain.path" :key="link.id">
                            <button
                                type="button"
                                class="tg-edge-row tg-hierarchy-link inline-flex items-center gap-1"
                                @click="jumpTo(link.id)"
                            >
                                <span class="truncate">{{ link.name }}</span>
                            </button>
                            <span class="text-muted-foreground/60" aria-hidden="true">→</span>
                            <span v-if="idx === hierarchyChain.path.length - 1" class="text-foreground font-medium">
                                {{ selectedNode.name }}
                            </span>
                        </template>
                    </p>
                </section>

                <!-- Owner / Principal (live /agents/{id} payload). -->
                <section v-if="agentMeta !== null">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Owner
                    </h4>
                    <p class="text-xs text-foreground">{{ ownerLabel || '—' }}</p>
                    <p
                        v-if="agentMeta.max_steps > 0"
                        class="text-[11px] text-muted-foreground mt-0.5"
                    >
                        max {{ agentMeta.max_steps }} steps per run
                    </p>
                </section>

                <!-- Description (line-clamped, from /agents/{id}). -->
                <section v-if="agentMeta?.description">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Description
                    </h4>
                    <p class="text-xs leading-[1.4] text-foreground/90">
                        {{ agentMeta.description }}
                    </p>
                </section>

                <!-- Tools row — server-resolved icons + tooltips. -->
                <section v-if="visibleTools.length > 0">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Tools
                    </h4>
                    <div class="flex flex-wrap gap-1.5" data-testid="tg-tool-tiles">
                        <span
                            v-for="(tool, idx) in visibleTools.slice(0, 12)"
                            :key="`${tool.tool_class}-${idx}`"
                            class="tg-tool-tile"
                            :title="tool.tool_name"
                            :aria-label="`Tool: ${tool.tool_name}`"
                        >
                            {{ tool.tool_name.slice(0, 2).toUpperCase() }}
                        </span>
                        <span
                            v-if="visibleTools.length > 12"
                            class="tg-tool-tile tg-tool-tile--more"
                            :title="`+${visibleTools.length - 12} more`"
                        >
                            +{{ visibleTools.length - 12 }}
                        </span>
                    </div>
                </section>

                <section>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Outbound — spawned ({{ outboundEdges.length }})
                    </h4>
                    <p v-if="outboundEdges.length === 0" class="text-xs text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in outboundEdges"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'out'))"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                                :style="{ background: statusColor(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.status ?? 'COMPLETED') }"
                            >
                                {{ initials(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.name ?? '?') }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">
                                    {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.name ?? 'Unknown' }}
                                </p>
                                <p class="text-[11px] text-muted-foreground">
                                    → sub_agent · {{ edgeActivity(edge) }}
                                </p>
                            </div>
                            <svg
                                class="w-4 h-4 text-muted-foreground"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                    </div>
                </section>

                <section>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Inbound — spawned by ({{ inboundEdges.length }})
                    </h4>
                    <p v-if="inboundEdges.length === 0" class="text-xs text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in inboundEdges"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'in'))"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                                :style="{ background: statusColor(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.status ?? 'COMPLETED') }"
                            >
                                {{ initials(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.name ?? '?') }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">
                                    {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.name ?? 'Unknown' }}
                                </p>
                                <p class="text-[11px] text-muted-foreground">
                                    ← sub_agent · {{ edgeActivity(edge) }}
                                </p>
                            </div>
                            <svg
                                class="w-4 h-4 text-muted-foreground"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                    </div>
                </section>

                <section>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Active chats ({{ activeChats.length }})
                    </h4>
                    <p v-if="activeChats.length === 0" class="text-xs text-muted-foreground">
                        No active chats. The agent hasn't run anything in flight.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in activeChats"
                            :key="chat.id"
                            class="tg-task-row"
                        >
                            <div class="flex items-start gap-2">
                                <span
                                    class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                                    :style="{ background: statusColor(chat.status) }"
                                />
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium truncate">{{ chat.title }}</p>
                                    <p class="text-xs text-muted-foreground truncate">{{ chat.preview ?? '' }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Recent chats ({{ recentChats.length }})
                    </h4>
                    <p v-if="recentChats.length === 0" class="text-xs text-muted-foreground">
                        No recent chats.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in recentChats"
                            :key="chat.id"
                            class="tg-task-row"
                        >
                            <div class="flex items-start gap-2">
                                <span
                                    class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                                    :style="{ background: statusColor(chat.status) }"
                                />
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium truncate">{{ chat.title }}</p>
                                    <p class="text-xs text-muted-foreground truncate">{{ chat.preview ?? '' }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </template>
    </div>
</template>

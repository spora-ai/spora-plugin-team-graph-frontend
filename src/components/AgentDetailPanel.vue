<script setup lang="ts">
/**
 * Right-sidebar agent detail panel — compact variant.
 *
 * Layout (top → bottom):
 *   1. Compact header: name + #ID on one line, status chip on the
 *      same row (right-aligned). The chip lives in its own component
 *      (`AgentStatusChip`) so a status poll re-renders only the chip
 *      and not the static name + ID text.
 *   2. Activity counts (active + 24 h)
 *   3. Hierarchy chain (root → ... → this agent)
 *   4. Owner / Principal (live /agents/{id} payload)
 *   5. Description (line-clamped, from /agents/{id})
 *   6. Outbound + Inbound edges, capped at MAX_EDGES_DISPLAYED = 4
 *      each, with a "+N more" overflow line
 *   7. Active chats, capped at MAX_CHATS_DISPLAYED = 4
 *   8. Recent chats, capped at MAX_CHATS_DISPLAYED = 4
 *
 * The Tools section was removed in this compact variant — the
 * dashboard's AgentCard already carries the tool list, and
 * surfacing it twice on the same screen dilutes the header.
 *
 * Edge rows are deep-link buttons — clicking one calls
 * `selection.setSelected(otherId)` so the canvas highlights the
 * target and the panel re-renders for the new agent.
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@spora-ai/components/icons'
import { formatRelativeTime, useInitials } from '@spora-ai/components/composables'
import { useSelectionStore } from '../stores/selection'
import {
    fetchActiveChats,
    fetchAgentMeta,
    fetchRecentChats,
    type AgentMeta,
} from '../api/agentDetail'
import { statusColor } from '../lib/nodeStatus'
import { inDegree, outDegree } from '../lib/stats'
import type { ChatSummary, GraphEdge, GraphNode, GraphPayload } from '../types'
import AgentStatusChip from './AgentStatusChip.vue'

const props = defineProps<{
    graph: GraphPayload
}>()

/* Display caps. The user asked to limit outbound to a maximum of 4;
 * we apply the same cap to inbound + chats so a busy agent doesn't
 * push the panel off the viewport. Each cap surfaces a "+N more"
 * line at the bottom so the operator knows there are more. */
const MAX_EDGES_DISPLAYED = 4
const MAX_CHATS_DISPLAYED = 4

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
const visibleOutbound = computed<GraphEdge[]>(() => outboundEdges.value.slice(0, MAX_EDGES_DISPLAYED))
const visibleInbound = computed<GraphEdge[]>(() => inboundEdges.value.slice(0, MAX_EDGES_DISPLAYED))
const hiddenOutboundCount = computed<number>(() =>
    Math.max(0, outboundEdges.value.length - visibleOutbound.value.length),
)
const hiddenInboundCount = computed<number>(() =>
    Math.max(0, inboundEdges.value.length - visibleInbound.value.length),
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

/**
 * Two-letter avatar initials per node id, memoised per graph commit.
 *
 * Delegates to the shared `useInitials` so the panel's tiles match
 * the dashboard's (a single-word name yields two letters there, not
 * one). The map is built once per payload instead of per render so
 * the composable isn't re-invoked on every unrelated re-render.
 */
const nodeInitials = computed<Record<number, string>>(() => {
    const entries = props.graph.nodes.map((n) => [n.id, useInitials(() => n.name).value] as const)
    return Object.fromEntries(entries)
})

function initialsFor(nodeId: number): string {
    return nodeInitials.value[nodeId] ?? '?'
}

function otherEnd(edge: GraphEdge, direction: 'out' | 'in'): number {
    return direction === 'out' ? edge.target : edge.source
}

/**
 * Three states for a configured sub-agent edge:
 *   1. Just-fired: `count_24h > 0`, recent timestamp
 *   2. Dormant:    `count_24h === 0` but `last_invoked_at !== null`
 *   3. Unfired:    `count_24h === 0 && last_invoked_at === null`
 */
function edgeActivity(edge: GraphEdge): string {
    if (edge.count_24h > 0) {
        return `${edge.count_24h}× / 24 h · ${formatRelativeTime(edge.last_invoked_at)}`
    }
    if (edge.last_invoked_at !== null) {
        return `last seen ${formatRelativeTime(edge.last_invoked_at)}`
    }
    return 'configured, never used'
}

function jumpTo(id: number): void {
    selection.setSelected(id)
}

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
                <Icon
                    name="clock"
                    class="w-5 h-5 text-muted-foreground"
                />
            </div>
            <p class="text-sm font-medium text-foreground">No agent selected</p>
            <p class="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Click any node in the diagram to see its inbound and outbound relations, plus recent chats.
            </p>
        </div>
        <template v-else>
            <!--
                Compact header — one row with the name on the left
                and the status chip on the right. The #ID was
                dropped in the compact variant (the agent name is
                the primary identifier). The chip lives in its own
                component (`AgentStatusChip`) so a status poll
                re-renders only the chip, not the static text.
            -->
            <header class="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <div class="flex-1 min-w-0">
                    <h3
                        class="text-sm font-semibold truncate"
                        :title="selectedNode.name"
                        data-testid="tg-agent-name"
                    >{{ selectedNode.name }}</h3>
                </div>
                <AgentStatusChip :status="selectedNode.status" />
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
                    <p class="text-xs leading-[1.4] text-foreground/90 line-clamp-3">
                        {{ agentMeta.description }}
                    </p>
                </section>

                <!--
                    Outbound edges, capped at MAX_EDGES_DISPLAYED. Each
                    row deep-links to the target agent. A "+N more"
                    line appears when there are more than the cap.
                -->
                <section data-testid="tg-outbound-section">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Outbound — spawned ({{ outboundEdges.length }})
                    </h4>
                    <p v-if="outboundEdges.length === 0" class="text-xs text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in visibleOutbound"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'out'))"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                                :style="{ background: statusColor(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.status ?? 'COMPLETED') }"
                            >
                                {{ initialsFor(otherEnd(edge, 'out')) }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">
                                    {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.name ?? 'Unknown' }}
                                </p>
                                <p class="text-[11px] text-muted-foreground">
                                    → sub_agent · {{ edgeActivity(edge) }}
                                </p>
                            </div>
                            <Icon
                                name="chevron-right"
                                class="w-4 h-4 text-muted-foreground"
                            />
                        </button>
                        <p
                            v-if="hiddenOutboundCount > 0"
                            class="text-[11px] text-muted-foreground pl-9"
                        >
                            +{{ hiddenOutboundCount }} more — open the dashboard
            to inspect.
                        </p>
                    </div>
                </section>

                <!-- Inbound edges, capped at MAX_EDGES_DISPLAYED. -->
                <section data-testid="tg-inbound-section">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Inbound — spawned by ({{ inboundEdges.length }})
                    </h4>
                    <p v-if="inboundEdges.length === 0" class="text-xs text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in visibleInbound"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'in'))"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                                :style="{ background: statusColor(props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.status ?? 'COMPLETED') }"
                            >
                                {{ initialsFor(otherEnd(edge, 'in')) }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">
                                    {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.name ?? 'Unknown' }}
                                </p>
                                <p class="text-[11px] text-muted-foreground">
                                    ← sub_agent · {{ edgeActivity(edge) }}
                                </p>
                            </div>
                            <Icon
                                name="chevron-right"
                                class="w-4 h-4 text-muted-foreground"
                            />
                        </button>
                        <p
                            v-if="hiddenInboundCount > 0"
                            class="text-[11px] text-muted-foreground pl-9"
                        >
                            +{{ hiddenInboundCount }} more — open the dashboard
            to inspect.
                        </p>
                    </div>
                </section>

                <!-- Active chats, capped at MAX_CHATS_DISPLAYED. -->
                <section data-testid="tg-active-chats-section">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Active chats ({{ activeChats.length }})
                    </h4>
                    <p v-if="activeChats.length === 0" class="text-xs text-muted-foreground">
                        No active chats. The agent hasn't run anything in flight.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in activeChats.slice(0, MAX_CHATS_DISPLAYED)"
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
                        <p
                            v-if="activeChats.length > MAX_CHATS_DISPLAYED"
                            class="text-[11px] text-muted-foreground"
                        >
                            +{{ activeChats.length - MAX_CHATS_DISPLAYED }} more in flight.
                        </p>
                    </div>
                </section>

                <!-- Recent chats, capped at MAX_CHATS_DISPLAYED. -->
                <section data-testid="tg-recent-chats-section">
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Recent chats ({{ recentChats.length }})
                    </h4>
                    <p v-if="recentChats.length === 0" class="text-xs text-muted-foreground">
                        No recent chats.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in recentChats.slice(0, MAX_CHATS_DISPLAYED)"
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
                        <p
                            v-if="recentChats.length > MAX_CHATS_DISPLAYED"
                            class="text-[11px] text-muted-foreground"
                        >
                            +{{ recentChats.length - MAX_CHATS_DISPLAYED }} more — open the dashboard
                            for the full history.
                        </p>
                    </div>
                </section>
            </div>
        </template>
    </div>
</template>

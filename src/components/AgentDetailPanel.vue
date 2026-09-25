<script setup lang="ts">
/**
 * Right sidebar (lg+): avatar + name + role + status + active
 * chats + recent chats + inbound + outbound. Below `lg`, the
 * page swaps this component for `AgentDetailModal.vue`.
 *
 * Edge rows are deep-links: clicking one sets
 * `selection.setSelected(otherId)` so the canvas highlights the
 * target and the panel re-renders for the new agent.
 *
 * Active chats come from the live `/tasks` endpoint (or the
 * fixture map when in fixture mode); recent chats similarly.
 * The panel re-renders on selection change so a stale "active
 * chats" list never persists between agents.
 */
import { computed, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import { fetchActiveChats, fetchRecentChats } from '../api/agentDetail'
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

const activeChats = ref<ChatSummary[]>([])
const recentChats = ref<ChatSummary[]>([])

watch(
    () => selectedNode.value?.id,
    async (id) => {
        if (id === undefined || id === null) {
            activeChats.value = []
            recentChats.value = []
            return
        }
        try {
            const [a, r] = await Promise.all([fetchActiveChats(id), fetchRecentChats(id)])
            activeChats.value = a
            recentChats.value = r
        } catch {
            activeChats.value = []
            recentChats.value = []
        }
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

function relTime(iso: string): string {
    const then = new Date(iso).getTime()
    if (!Number.isFinite(then)) return iso
    const mins = Math.round((Date.now() - then) / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`
    return 'yesterday'
}

function jumpTo(id: number): void {
    selection.setSelected(id)
}
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
                                    → sub_agent · {{ edge.count_24h }}× / 24 h · {{ relTime(edge.last_invoked_at) }}
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
                                    ← sub_agent · {{ edge.count_24h }}× / 24 h · {{ relTime(edge.last_invoked_at) }}
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
                    <p v-if="activeChats.length === 0" class="text-xs text-muted-foreground">No active chats.</p>
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
                    <p v-if="recentChats.length === 0" class="text-xs text-muted-foreground">No recent chats.</p>
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
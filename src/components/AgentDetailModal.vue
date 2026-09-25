<script setup lang="ts">
/**
 * Centred modal shown on `<lg` when an agent is selected.
 * The page renders this when `lg:` would clip the sidebar.
 * Same content as `AgentDetailPanel.vue` but the layout is
 * compact and dismissable via a backdrop click or the X button.
 */
import { computed, ref, watch } from 'vue'
import { useSelectionStore } from '../stores/selection'
import { fetchActiveChats, fetchRecentChats } from '../api/agentDetail'
import { statusColor, statusLabel, statusPillClass } from '../lib/nodeStatus'
import { inDegree, outDegree } from '../lib/stats'
import type { ChatSummary, GraphEdge, GraphNode, GraphPayload } from '../types'

const props = defineProps<{
    graph: GraphPayload
    open: boolean
}>()

const emit = defineEmits<{
    close: []
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

function jumpTo(id: number): void {
    selection.setSelected(id)
}

function close(): void {
    emit('close')
}

function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && props.open) close()
}

watch(
    () => props.open,
    (next) => {
        if (next && typeof document !== 'undefined') {
            document.addEventListener('keydown', onKeydown)
        } else if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', onKeydown)
        }
    },
)
</script>

<template>
    <div
        v-if="open && selectedNode !== null"
        data-testid="tg-agent-modal"
        class="tg-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`tg-modal-title-${selectedNode.id}`"
    >
        <button
            type="button"
            class="tg-backdrop-btn"
            aria-label="Close dialog"
            @click="close"
        />
        <div class="tg-modal-panel">
            <header class="tg-modal-header">
                <div class="flex items-center gap-3 min-w-0">
                    <div
                        class="flex items-center justify-center text-white font-semibold text-[13px] shrink-0"
                        :style="{ background: statusColor(selectedNode.status), width: '40px', height: '40px', borderRadius: '999px' }"
                    >
                        {{ initials(selectedNode.name) }}
                    </div>
                    <div class="min-w-0">
                        <h2
                            :id="`tg-modal-title-${selectedNode.id}`"
                            class="text-base font-semibold leading-tight truncate"
                        >
                            {{ selectedNode.name }}
                        </h2>
                        <p class="text-xs text-muted-foreground leading-tight">
                            #{{ selectedNode.id }} · {{ selectedNode.role ?? '—' }}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    class="tg-modal-close"
                    aria-label="Close"
                    @click="close"
                >
                    <svg
                        class="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </header>
            <div class="tg-modal-body space-y-5">
                <div class="flex items-center justify-between">
                    <span
                        class="tg-status-pill"
                        :class="statusPillClass(selectedNode.status)"
                    >
                        <span class="dot" />
                        {{ statusLabel(selectedNode.status) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                        <strong class="text-foreground">{{ selectedNode.active_chats }}</strong>
                        active ·
                        <strong class="text-foreground">{{ selectedNode.recent_chats_24h }}</strong>
                        / 24 h
                    </span>
                </div>
                <section>
                    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Active ({{ activeChats.length }})
                    </h3>
                    <p v-if="activeChats.length === 0" class="text-sm text-muted-foreground">
                        No active chats.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in activeChats"
                            :key="chat.id"
                            class="tg-task-row"
                        >
                            <p class="text-sm font-medium truncate">{{ chat.title }}</p>
                            <p class="text-xs text-muted-foreground truncate">{{ chat.preview ?? '' }}</p>
                        </div>
                    </div>
                </section>
                <section>
                    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Recently finished ({{ recentChats.length }})
                    </h3>
                    <p v-if="recentChats.length === 0" class="text-sm text-muted-foreground">
                        No recent chats.
                    </p>
                    <div v-else class="space-y-1">
                        <div
                            v-for="chat in recentChats"
                            :key="chat.id"
                            class="tg-task-row"
                        >
                            <p class="text-sm font-medium truncate">{{ chat.title }}</p>
                            <p class="text-xs text-muted-foreground truncate">{{ chat.preview ?? '' }}</p>
                        </div>
                    </div>
                </section>
                <section>
                    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Outbound — spawned ({{ outboundEdges.length }})
                    </h3>
                    <p v-if="outboundEdges.length === 0" class="text-sm text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in outboundEdges"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'out'))"
                        >
                            <p class="text-sm font-medium truncate">
                                {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'out'))?.name ?? 'Unknown' }}
                            </p>
                            <p class="text-[11px] text-muted-foreground">
                                → {{ edge.count_24h }}× / 24 h
                            </p>
                        </button>
                    </div>
                </section>
                <section>
                    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Inbound — spawned by ({{ inboundEdges.length }})
                    </h3>
                    <p v-if="inboundEdges.length === 0" class="text-sm text-muted-foreground">None.</p>
                    <div v-else class="space-y-1">
                        <button
                            v-for="edge in inboundEdges"
                            :key="edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(edge, 'in'))"
                        >
                            <p class="text-sm font-medium truncate">
                                {{ props.graph.nodes.find((n) => n.id === otherEnd(edge, 'in'))?.name ?? 'Unknown' }}
                            </p>
                            <p class="text-[11px] text-muted-foreground">
                                ← {{ edge.count_24h }}× / 24 h
                            </p>
                        </button>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
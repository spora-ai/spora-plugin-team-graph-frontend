<script setup lang="ts">
/**
 * Right-sidebar agent detail panel — compact variant.
 *
 * Layout (top → bottom):
 *   1. Compact header: name + status chip on one line. The chip
 *      lives in its own component (`AgentStatusChip`) so a status
 *      poll re-renders only the chip and not the static name.
 *   2. Activity counts (active + 24 h)
 *   3. Hierarchy chain (root → ... → this agent)
 *   4. Description (line-clamped, from /agents/{id})
 *   5. Outbound + Inbound edges, capped at MAX_EDGES_DISPLAYED = 4
 *      each, with a "+N more" overflow line. Each row leads with the
 *      shared `@spora-ai/components` `AgentAvatar` (size `sm`), which
 *      supersedes the hand-written `w-7 h-7 rounded-full` div + inline
 *      `statusColor()` background this panel used to paint. The tile
 *      itself is owned by the package, so the status swatch moved to a
 *      `.tg-agent-tile` ring — see `lib/agentAvatar.ts` and the
 *      `style.css` rule.
 *   6. Active chats, capped at MAX_CHATS_DISPLAYED = 4
 *   7. Recent chats, capped at MAX_CHATS_DISPLAYED = 4
 *
 * The Tools section was removed in this compact variant — the
 * dashboard's AgentCard already carries the tool list, and
 * surfacing it twice on the same screen dilutes the header.
 * The Owner section went the same way: the owning principal is
 * chosen by the pill row at the top of the page, so the row was a
 * duplicate of a control one screen above it.
 *
 * Edge rows are deep-link buttons — clicking one calls
 * `selection.setSelected(otherId)` so the canvas highlights the
 * target and the panel re-renders for the new agent.
 *
 * **Chat rows navigate to the host's task chat.** Each row is a
 * real `<button type="button">` that calls
 * `hostContext.router.push(taskChatPath(id))` — see
 * `lib/hostNavigation.ts` for the route string and the null-router
 * policy.
 */
import { computed, ref, watch } from 'vue'
import { AgentAvatar } from '@spora-ai/components/avatar'
import { Icon } from '@spora-ai/components/icons'
import { formatRelativeTime } from '@spora-ai/components/composables'
import { useSelectionStore } from '../stores/selection'
import {
    fetchActiveChats,
    fetchAgentMeta,
    fetchRecentChats,
    type AgentMeta,
} from '../api/agentDetail'
import { avatarSubject, statusRingColor, type AgentAvatarSubject } from '../lib/agentAvatar'
import { chatRowAction, type ChatRowAction, type PluginRouter } from '../lib/hostNavigation'
import { statusPillClass, statusLabel } from '../lib/nodeStatus'
import { inDegree, outDegree } from '../lib/stats'
import type { ChatSummary, GraphEdge, GraphNode, GraphPayload } from '../types'
import AgentStatusChip from './AgentStatusChip.vue'

const props = defineProps<{
    graph: GraphPayload
    /**
     * The host's router, threaded down from `TeamGraphPage`. Nullable
     * by contract — see `lib/hostNavigation.ts` for what a chat row
     * becomes when it is absent.
     */
    router: PluginRouter | null
}>()

/* Display caps. The user asked to limit outbound to a maximum of 4;
 * we apply the same cap to inbound + chats so a busy agent doesn't
 * push the panel off the viewport. Each cap surfaces a "+N more"
 * line at the bottom so the operator knows there are more. */
const MAX_EDGES_DISPLAYED = 4
const MAX_CHATS_DISPLAYED = 4

const selection = useSelectionStore()

/**
 * Whether the payload has anything to select at all. The empty state
 * below is the same card in both cases — nothing is selected either
 * way — but the *body* cannot be the same: "Click any node in the
 * diagram" is false when the graph rendered zero nodes, and it is
 * the one line on this card that tells the operator what to do next.
 */
const hasNodes = computed<boolean>(() => props.graph.nodes.length > 0)

const selectedNode = computed<GraphNode | null>(() => {
    const id = selection.selectedId
    if (id === null) return null
    return props.graph.nodes.find((n) => n.id === id) ?? null
})

/**
 * Node lookup for the edge lists below. Built once per payload so
 * each row resolves its `otherEnd` agent with a Map hit instead of
 * three `Array.find` scans (name, status, initials) inside the
 * render function.
 */
const nodesById = computed<Map<number, GraphNode>>(
    () => new Map(props.graph.nodes.map((n) => [n.id, n])),
)

function otherEnd(edge: GraphEdge, direction: 'out' | 'in'): number {
    return direction === 'out' ? edge.target : edge.source
}

/**
 * One rendered edge row: the edge, the agent at its far end, and the
 * two values the avatar needs from that agent.
 *
 * `agent` / `ring` are resolved once per payload rather than per
 * render. `agent` in particular has to be a stable object reference —
 * building it inline in the template (`avatarSubject(row.node)`)
 * would hand `AgentAvatar` a fresh object on every parent render and
 * defeat its prop diffing.
 */
interface EdgeRow {
    edge: GraphEdge
    node: GraphNode | undefined
    agent: AgentAvatarSubject
    ring: string
}

function toEdgeRow(edge: GraphEdge, direction: 'out' | 'in'): EdgeRow {
    const node = nodesById.value.get(otherEnd(edge, direction))
    return {
        edge,
        node,
        agent: avatarSubject(node),
        ring: statusRingColor(node?.status),
    }
}

const outboundEdges = computed<GraphEdge[]>(() =>
    selectedNode.value === null ? [] : outDegree(props.graph.edges, selectedNode.value.id),
)
const inboundEdges = computed<GraphEdge[]>(() =>
    selectedNode.value === null ? [] : inDegree(props.graph.edges, selectedNode.value.id),
)
const visibleOutboundRows = computed<EdgeRow[]>(() =>
    outboundEdges.value.slice(0, MAX_EDGES_DISPLAYED).map((edge) => toEdgeRow(edge, 'out')),
)
const visibleInboundRows = computed<EdgeRow[]>(() =>
    inboundEdges.value.slice(0, MAX_EDGES_DISPLAYED).map((edge) => toEdgeRow(edge, 'in')),
)
const hiddenOutboundCount = computed<number>(() =>
    Math.max(0, outboundEdges.value.length - visibleOutboundRows.value.length),
)
const hiddenInboundCount = computed<number>(() =>
    Math.max(0, inboundEdges.value.length - visibleInboundRows.value.length),
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

/**
 * The host router, through a computed rather than read off `props`
 * at each call site. A `computed` (not a plain `const` snapshot)
 * because the prop is reactive and a host that re-mounts the plugin
 * with a different context must not leave the rows bound to the
 * previous router.
 */
const hostRouter = computed<PluginRouter | null>(() => props.router)

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

/**
 * One chat row, with everything the template needs pre-resolved.
 *
 * `action` is the navigation decision from `lib/hostNavigation.ts`,
 * `pill` / `pillClass` are the plugin's existing status→label and
 * status→colour pair (the same two functions `AgentStatusChip` and
 * the Variant M node card use, so the panel has exactly one status
 * table). Computing them here rather than in the template keeps the
 * `v-for` body to attribute binding and stops the two lookups
 * re-running per render.
 */
interface ChatRow {
    chat: ChatSummary
    action: ChatRowAction
    pill: string
    pillClass: string
    /** Relative start time, or `''` when the wire omits it. */
    started: string
}

function toChatRow(chat: ChatSummary): ChatRow {
    return {
        chat,
        action: chatRowAction(hostRouter.value, chat.id),
        pill: statusLabel(chat.status),
        pillClass: statusPillClass(chat.status),
        started: chat.started_at === null ? '' : formatRelativeTime(chat.started_at),
    }
}

const visibleActiveChats = computed<ChatRow[]>(() =>
    activeChats.value.slice(0, MAX_CHATS_DISPLAYED).map(toChatRow),
)
const visibleRecentChats = computed<ChatRow[]>(() =>
    recentChats.value.slice(0, MAX_CHATS_DISPLAYED).map(toChatRow),
)
const hiddenActiveCount = computed<number>(() =>
    Math.max(0, activeChats.value.length - visibleActiveChats.value.length),
)
const hiddenRecentCount = computed<number>(() =>
    Math.max(0, recentChats.value.length - visibleRecentChats.value.length),
)

/**
 * Perform a row's navigation.
 *
 * Awaits the host router's promise: vue-router rejects when a
 * navigation is aborted or redirected, and an unhandled rejection
 * here would surface as a console error with no owner. The void
 * return type is what `void router.push(...)` would give anyway —
 * nothing downstream waits on the navigation.
 */
function openChat(row: ChatRow): void {
    if (row.action.kind !== 'push') return
    // Read the router through a local rather than `props.router`
    // directly: `vue/no-mutating-props` cannot tell a method *call*
    // on a prop from an assignment to one, so `props.router?.push(…)`
    // is reported as a prop mutation. The optional chain is also
    // redundant here — `row.action.kind === 'push'` already proves a
    // router was present when the row was built.
    void hostRouter.value?.push(row.action.to)
}
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
                <!--
                    Two bodies, one card. `selectedNode` is null in
                    both cases, so the headline is right either way —
                    but sending the operator to click a node is only
                    true when the diagram has nodes, and an empty
                    graph would leave this card telling them to do
                    the one thing the canvas no longer offers.
                -->
                <template v-if="hasNodes">
                    Click any node in the diagram to see its inbound and outbound relations, plus recent chats.
                </template>
                <template v-else>
                    This team has no agents to select from.
                </template>
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
            <div class="tg-agent-panel-body p-4 space-y-4">
                <!--
                    Activity. The one section with no heading of its
                    own — the counts are the whole content, so a
                    label/value row reads better than a heading
                    stacked over a single line.
                -->
                <section class="tg-panel-stats">
                    <span class="tg-panel-stats-label">Activity</span>
                    <span class="tg-panel-stats-value">
                        <strong class="tg-panel-stats-num">{{ selectedNode.active_chats }}</strong>
                        active
                        <span aria-hidden="true" class="tg-panel-stats-sep">·</span>
                        <strong class="tg-panel-stats-num">{{ selectedNode.recent_chats_24h }}</strong>
                        in 24 h
                    </span>
                </section>

                <!-- Hierarchy chain: root → ... → this agent. Walks
                     inbound edges up to MAX_HIERARCHY_DEPTH. -->
                <section
                    v-if="hierarchyChain.path.length > 0 || hierarchyChain.isRoot"
                    data-testid="tg-hierarchy-chain"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
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

                <!-- Description (line-clamped, from /agents/{id}). -->
                <section
                    v-if="agentMeta?.description"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        Description
                    </h4>
                    <p class="tg-panel-prose line-clamp-3">
                        {{ agentMeta.description }}
                    </p>
                </section>

                <!--
                    Outbound edges, capped at MAX_EDGES_DISPLAYED. Each
                    row deep-links to the target agent. A "+N more"
                    line appears when there are more than the cap.
                -->
                <section
                    data-testid="tg-outbound-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        Outbound — spawned <span class="tg-panel-count">({{ outboundEdges.length }})</span>
                    </h4>
                    <p v-if="outboundEdges.length === 0" class="tg-panel-empty">None.</p>
                    <div v-else class="tg-panel-list">
                        <button
                            v-for="row in visibleOutboundRows"
                            :key="row.edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(row.edge, 'out'))"
                        >
                            <span
                                class="tg-agent-tile shrink-0"
                                :style="{ '--tg-status-ring': row.ring }"
                            >
                                <AgentAvatar size="sm" :agent="row.agent" />
                            </span>
                            <span class="flex-1 min-w-0">
                                <span class="tg-row-title">
                                    {{ row.node?.name ?? 'Unknown' }}
                                </span>
                                <span class="tg-row-sub">
                                    <span aria-hidden="true">→</span> sub_agent · {{ edgeActivity(row.edge) }}
                                </span>
                            </span>
                            <Icon
                                name="chevron-right"
                                class="tg-row-chevron w-4 h-4"
                                aria-hidden="true"
                            />
                        </button>
                        <p
                            v-if="hiddenOutboundCount > 0"
                            class="tg-panel-more"
                        >
                            +{{ hiddenOutboundCount }} more — open the dashboard
            to inspect.
                        </p>
                    </div>
                </section>

                <!-- Inbound edges, capped at MAX_EDGES_DISPLAYED. -->
                <section
                    data-testid="tg-inbound-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        Inbound — spawned by <span class="tg-panel-count">({{ inboundEdges.length }})</span>
                    </h4>
                    <p v-if="inboundEdges.length === 0" class="tg-panel-empty">None.</p>
                    <div v-else class="tg-panel-list">
                        <button
                            v-for="row in visibleInboundRows"
                            :key="row.edge.id"
                            type="button"
                            class="tg-edge-row w-full text-left"
                            @click="jumpTo(otherEnd(row.edge, 'in'))"
                        >
                            <span
                                class="tg-agent-tile shrink-0"
                                :style="{ '--tg-status-ring': row.ring }"
                            >
                                <AgentAvatar size="sm" :agent="row.agent" />
                            </span>
                            <span class="flex-1 min-w-0">
                                <span class="tg-row-title">
                                    {{ row.node?.name ?? 'Unknown' }}
                                </span>
                                <span class="tg-row-sub">
                                    <span aria-hidden="true">←</span> sub_agent · {{ edgeActivity(row.edge) }}
                                </span>
                            </span>
                            <Icon
                                name="chevron-right"
                                class="tg-row-chevron w-4 h-4"
                                aria-hidden="true"
                            />
                        </button>
                        <p
                            v-if="hiddenInboundCount > 0"
                            class="tg-panel-more"
                        >
                            +{{ hiddenInboundCount }} more — open the dashboard
            to inspect.
                        </p>
                    </div>
                </section>

                <!--
                    Active + recent chats, capped at MAX_CHATS_DISPLAYED.
                    Both sections render the same row, because a chat is a
                    chat: the operator's question ("what is this agent
                    doing, and what did it just do?") is the same whether
                    the run is still in flight or already finished. Only
                    the heading and the overflow wording differ.

                    Each row is a real `<button type="button">` that
                    navigates to the host's task chat
                    (`router.push('/tasks/{id}')` — see
                    `lib/hostNavigation.ts`). A `<button>` rather than an
                    `<a>` because the plugin has no `vue-router` and
                    cannot render a `RouterLink`; the destination is a
                    host route, but the *mechanism* is a programmatic
                    navigation, and a bare href would be resolved
                    against the plugin's own mount path. Using the native
                    element also means Enter/Space activation, the tab
                    order and the focus ring are the browser's, with no
                    hand-written key handling to drift out of sync.

                    Nothing encloses these rows in another control: the
                    panel body is a plain scrollable `<div>` inside
                    `<aside>`, and the panel lives in its own grid
                    column — outside `.tg-canvas-wrap`, which is the only
                    element with the drag-to-pan pointer capture. So
                    there is no pan gesture to conflict with (and no need
                    for the `data-tg-no-pan` opt-out the node cards use
                    on the canvas).

                    **The old bullet dot is gone, and status is not.**
                    The dot was a bare `background: statusColor(...)`
                    swatch carrying the only status signal on the row.
                    It is replaced by the same `.tg-status-pill` the
                    panel header and the node cards use, driven by the
                    same `statusPillClass()` / `statusLabel()` pair —
                    one status→colour table in the plugin, unchanged. The
                    pill is strictly more informative than the dot: it
                    pairs the colour with a text label, so the status
                    survives for a screen reader and for the ~8 % of
                    operators with a colour-vision deficiency, neither
                    of whom could read a 6 px hue swatch. The dashboard's
                    chat row keeps its dot, but it pairs that dot with a
                    `chatLabel()` text line; we get the same
                    text-plus-colour result from the shared pill.

                    When the host hands us no router the row renders as a
                    **disabled** button: same element, same layout, same
                    label, `aria-disabled` + native `disabled` so it
                    leaves the tab order rather than lying to a keyboard
                    user. See `lib/hostNavigation.ts` for why not an
                    `<a href>`.
                -->
                <section
                    data-testid="tg-active-chats-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        Active chats <span class="tg-panel-count">({{ activeChats.length }})</span>
                    </h4>
                    <p v-if="activeChats.length === 0" class="tg-panel-empty">
                        No active chats. The agent hasn't run anything in flight.
                    </p>
                    <div v-else class="tg-panel-list">
                        <button
                            v-for="row in visibleActiveChats"
                            :key="row.chat.id"
                            type="button"
                            class="tg-chat-row"
                            :class="{ 'is-disabled': row.action.kind === 'disabled' }"
                            :disabled="row.action.kind === 'disabled'"
                            :aria-disabled="row.action.kind === 'disabled'"
                            :data-testid="`tg-chat-row-${row.chat.id}`"
                            @click="openChat(row)"
                        >
                            <span class="tg-chat-row-head">
                                <span class="tg-row-title">{{ row.chat.title }}</span>
                                <span
                                    v-if="row.started"
                                    class="tg-row-time"
                                >{{ row.started }}</span>
                            </span>
                            <span class="tg-chat-row-foot">
                                <span
                                    class="tg-status-pill tg-chat-row-status"
                                    :class="row.pillClass"
                                >
                                    <span class="dot" />
                                    {{ row.pill }}
                                </span>
                                <span
                                    v-if="row.chat.preview"
                                    class="tg-row-sub"
                                >{{ row.chat.preview }}</span>
                            </span>
                        </button>
                        <p
                            v-if="hiddenActiveCount > 0"
                            class="tg-panel-more"
                        >
                            +{{ hiddenActiveCount }} more in flight.
                        </p>
                    </div>
                </section>

                <section
                    data-testid="tg-recent-chats-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        Recent chats <span class="tg-panel-count">({{ recentChats.length }})</span>
                    </h4>
                    <p v-if="recentChats.length === 0" class="tg-panel-empty">
                        No recent chats.
                    </p>
                    <div v-else class="tg-panel-list">
                        <button
                            v-for="row in visibleRecentChats"
                            :key="row.chat.id"
                            type="button"
                            class="tg-chat-row"
                            :class="{ 'is-disabled': row.action.kind === 'disabled' }"
                            :disabled="row.action.kind === 'disabled'"
                            :aria-disabled="row.action.kind === 'disabled'"
                            :data-testid="`tg-chat-row-${row.chat.id}`"
                            @click="openChat(row)"
                        >
                            <span class="tg-chat-row-head">
                                <span class="tg-row-title">{{ row.chat.title }}</span>
                                <span
                                    v-if="row.started"
                                    class="tg-row-time"
                                >{{ row.started }}</span>
                            </span>
                            <span class="tg-chat-row-foot">
                                <span
                                    class="tg-status-pill tg-chat-row-status"
                                    :class="row.pillClass"
                                >
                                    <span class="dot" />
                                    {{ row.pill }}
                                </span>
                                <span
                                    v-if="row.chat.preview"
                                    class="tg-row-sub"
                                >{{ row.chat.preview }}</span>
                            </span>
                        </button>
                        <!--
                            The old note here read "+N more — open the
                            dashboard for the full history", which was a
                            workaround for the very thing this change
                            fixes: there was no way to open a chat from
                            the panel, so the only route to one was the
                            dashboard. Now every visible row is a
                            deep-link, so the note only has to be true
                            about what it *is* — the display cap, not a
                            missing feature.
                        -->
                        <p
                            v-if="hiddenRecentCount > 0"
                            class="tg-panel-more"
                            data-testid="tg-recent-chats-more"
                        >
                            +{{ hiddenRecentCount }} more not shown — the panel caps
                            each list at {{ MAX_CHATS_DISPLAYED }}.
                        </p>
                    </div>
                </section>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
/**
 * Right-sidebar agent detail panel — compact variant.
 *
 * The Tools, Owner and Hierarchy sections were all removed. The host's
 * dashboard AgentCard already carries the tool list, and the owning
 * principal is chosen by the pill row at the top of the page, so both
 * would have duplicated a control one screen above. The Hierarchy chain
 * walked *inbound* edges upward to draw a "root → … → this agent"
 * chain, but the graph is not a spawn tree: an edge means "agent A
 * invoked sub-agent B", which says nothing about ownership or reporting
 * lines, and an agent that was never invoked by another has no parent at
 * all — so the chain was either empty or an accidental ordering of
 * whoever happened to call whom. The inbound edges are still listed
 * under their own heading; the chain added a rendering of the same data,
 * not information the section list does not already carry.
 *
 * Edge rows are deep-link buttons — clicking one calls
 * `selection.setSelected(otherId)` so the canvas highlights the
 * target and the panel re-renders for the new agent.
 *
 * **The header and the body are fetched separately, so they can
 * disagree.** The name comes from the graph payload (synchronous) and
 * the description + chat lists come from three per-agent requests.
 * A response is therefore only trustworthy for the selection that
 * asked for it: click agent A, then agent B, and A's slower response
 * arrives last. Without a guard the panel then shows B's name over
 * A's description and chats. `requestToken` below is the same
 * monotonic token `useTeamGraph` uses for the same reason.
 *
 * **Chat rows navigate to the host's task chat.** Each row is a
 * real `<button type="button">` that calls
 * `hostContext.router.push(taskChatPath(id))` — see
 * `lib/hostNavigation.ts` for the route string and the null-router
 * policy.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AgentAvatar } from '@spora-ai/components/avatar'
import { Icon } from '@spora-ai/components/icons'
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
import { formatRelativeTime } from '../lib/relativeTime'
import { inDegree, outDegree } from '../lib/stats'
import type { ChatSummary, GraphEdge, GraphNode, GraphPayload } from '../types'
import AgentStatusChip from './AgentStatusChip.vue'

const { t } = useI18n()

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
 * The host router, through a computed rather than read off `props`
 * at each call site. A `computed` (not a plain `const` snapshot)
 * because the prop is reactive and a host that re-mounts the plugin
 * with a different context must not leave the rows bound to the
 * previous router.
 */
const hostRouter = computed<PluginRouter | null>(() => props.router)

const activeChats = ref<ChatSummary[]>([])
const recentChats = ref<ChatSummary[]>([])
const agentMeta = ref<AgentMeta | null>(null)
const metaLoading = ref(false)

/* Monotonic request token — a response for a selection the operator
 * has already left must not commit, otherwise clicking through agents
 * faster than the API answers leaves the panel showing the previous
 * agent's description and chats under the new agent's name. Same
 * guard as `useTeamGraph`'s `requestToken`. */
let requestToken = 0

/**
 * `fetchAgentMeta`, plus the `metaLoading` flag that marks it in
 * flight.
 *
 * `token` is threaded in rather than read from a ref because the
 * `finally` has to know whether *this* call is still the current one:
 * a stale response clearing `metaLoading` would drop the spinner for
 * the request that is actually in flight. Only the owning request
 * may turn it back off.
 */
async function loadAgentMeta(agentId: number, token: number): Promise<AgentMeta | null> {
    metaLoading.value = true
    try {
        return await fetchAgentMeta(agentId)
    } finally {
        if (token === requestToken) metaLoading.value = false
    }
}

watch(
    () => selectedNode.value?.id,
    async (id) => {
        /* Claim the token before anything else, so a deselect also
         * retires the in-flight request for the agent being left. */
        const token = ++requestToken
        activeChats.value = []
        recentChats.value = []
        agentMeta.value = null
        if (id === undefined || id === null) {
            /* Nothing selected: no request owns `metaLoading` any
             * more, so clear it rather than leaving it stuck on. */
            metaLoading.value = false
            return
        }
        /* Three independent fetches — meta + active + recent — all
         * scoped to the freshly-clicked agent. They run in parallel;
         * any individual failure (network, 404) degrades gracefully
         * to empty arrays. */
        const [metaResult, activeResult, recentResult] = await Promise.allSettled([
            loadAgentMeta(id, token),
            fetchActiveChats(id),
            fetchRecentChats(id),
        ])
        if (token !== requestToken) return
        agentMeta.value = metaResult.status === 'fulfilled' ? metaResult.value : null
        activeChats.value = activeResult.status === 'fulfilled' ? activeResult.value : []
        recentChats.value = recentResult.status === 'fulfilled' ? recentResult.value : []
    },
    { immediate: true },
)

/* Bumping the token on teardown retires every request still in
 * flight, so a response that lands after the panel is gone cannot
 * write into a torn-down component. */
onBeforeUnmount(() => {
    requestToken++
})

/**
 * Three states for a configured sub-agent edge:
 *   1. Just-fired: `count_24h > 0`, recent timestamp
 *   2. Dormant:    `count_24h === 0` but `last_invoked_at !== null`
 *   3. Unfired:    `count_24h === 0 && last_invoked_at === null`
 */
function edgeActivity(edge: GraphEdge): string {
    if (edge.count_24h > 0) {
        return t('{count}× / 24 h · {when}', {
            count: edge.count_24h,
            when: formatRelativeTime(edge.last_invoked_at),
        })
    }
    if (edge.last_invoked_at !== null) {
        return t('last seen {when}', { when: formatRelativeTime(edge.last_invoked_at) })
    }
    return t('configured, never used')
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
            <p class="text-sm font-medium text-foreground">{{ t('No agent selected') }}</p>
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
                    {{ t('Click any node in the diagram to see its inbound and outbound relations, plus recent chats.') }}
                </template>
                <template v-else>
                    {{ t('This team has no agents to select from.') }}
                </template>
            </p>
        </div>
        <template v-else>
            <!--
                Compact header — one row with the name on the left and
                the status chip on the right. The chip lives in its own
                component (`AgentStatusChip`) so a status poll
                re-renders only the chip, not the static name.
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
                    <span class="tg-panel-stats-label">{{ t('Activity') }}</span>
                    <span class="tg-panel-stats-value">
                        <strong class="tg-panel-stats-num">{{ selectedNode.active_chats }}</strong>
                        {{ t('active') }}
                        <span aria-hidden="true" class="tg-panel-stats-sep">·</span>
                        <strong class="tg-panel-stats-num">{{ selectedNode.recent_chats_24h }}</strong>
                        {{ t('in 24 h') }}
                    </span>
                </section>

                <!-- Description (line-clamped, from /agents/{id}). -->
                <section
                    v-if="agentMeta?.description"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        {{ t('Description') }}
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
                        {{ t('Outbound — spawned') }} <span class="tg-panel-count">({{ outboundEdges.length }})</span>
                    </h4>
                    <p v-if="outboundEdges.length === 0" class="tg-panel-empty">{{ t('None.') }}</p>
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
                                    {{ row.node?.name ?? t('Unknown') }}
                                </span>
                                <span class="tg-row-sub">
                                    <span aria-hidden="true">→</span> <span>sub_agent</span> · {{ edgeActivity(row.edge) }}
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
                            {{ t('+{count} more — open the dashboard to inspect.', { count: hiddenOutboundCount }) }}
                        </p>
                    </div>
                </section>

                <!-- Inbound edges, capped at MAX_EDGES_DISPLAYED. -->
                <section
                    data-testid="tg-inbound-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        {{ t('Inbound — spawned by') }} <span class="tg-panel-count">({{ inboundEdges.length }})</span>
                    </h4>
                    <p v-if="inboundEdges.length === 0" class="tg-panel-empty">{{ t('None.') }}</p>
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
                                    {{ row.node?.name ?? t('Unknown') }}
                                </span>
                                <span class="tg-row-sub">
                                    <span aria-hidden="true">←</span> <span>sub_agent</span> · {{ edgeActivity(row.edge) }}
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
                            {{ t('+{count} more — open the dashboard to inspect.', { count: hiddenInboundCount }) }}
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
                    element with the drag-to-pan pointer capture.

                    **Status is a pill, not a dot.** The row uses the
                    same `.tg-status-pill` the panel header and the node
                    cards use, driven by the same `statusPillClass()` /
                    `statusLabel()` pair — one status→colour table in the
                    plugin. The pill pairs the colour with a text label,
                    so the status survives for a screen reader and for
                    operators with a colour-vision deficiency, neither of
                    whom could read a 6 px hue swatch.

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
                        {{ t('Active chats') }} <span class="tg-panel-count">({{ activeChats.length }})</span>
                    </h4>
                    <p v-if="activeChats.length === 0" class="tg-panel-empty">
                        {{ t("No active chats. The agent hasn't run anything in flight.") }}
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
                            {{ t('+{count} more in flight.', { count: hiddenActiveCount }) }}
                        </p>
                    </div>
                </section>

                <section
                    data-testid="tg-recent-chats-section"
                    class="tg-panel-section"
                >
                    <h4 class="tg-panel-heading">
                        {{ t('Recent chats') }} <span class="tg-panel-count">({{ recentChats.length }})</span>
                    </h4>
                    <p v-if="recentChats.length === 0" class="tg-panel-empty">
                        {{ t('No recent chats.') }}
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
                            The overflow line states only what it is —
                            the display cap — because every visible row
                            is a deep-link, so there is no missing
                            feature to work around.
                        -->
                        <p
                            v-if="hiddenRecentCount > 0"
                            class="tg-panel-more"
                            data-testid="tg-recent-chats-more"
                        >
                            {{ t('+{count} more not shown — the panel caps each list at {cap}.', { count: hiddenRecentCount, cap: MAX_CHATS_DISPLAYED }) }}
                        </p>
                    </div>
                </section>
            </div>
        </template>
    </div>
</template>

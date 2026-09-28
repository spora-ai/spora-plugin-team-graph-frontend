<script setup lang="ts">
/**
 * AgentNodeCard — the Variant M node card (prototype B + H hybrid).
 *
 * Reproduces `spora-workspace/prototypes/compact-node-designs/
 * prototype-m-edge-counts.html`:
 *
 *     ┌────────────────────────────────────┐
 *     │ ┌────┐  Marketing Lead            │   row1 — name, full width
 *     │ │ ML │ ──────────────────────────  │
 *     │ └────┘  ( idle )        ↑ 2  ↓ 3   │   row2 — pill left, badges right
 *     └────────────────────────────────────┘
 *
 *   - avatar tile **left**, name **top-right**,
 *   - status pill **bottom-left**, edge-count badges **bottom-right**,
 *   - fixed **240 px** width, ellipsised name,
 *   - `↑ N` inbound green / `↓ N` outbound violet, and a distinct
 *     slate `.zero` style **per badge** when that badge's own count
 *     is 0 — a 0-inbound node is an entry-point agent, and that
 *     distinction is signal, not noise.
 *
 * **Everything visual lives in `style.css`** (`.tg-node-card` and
 * friends) so the card markup stays a pure structure and the CSS
 * file remains the single place the prototype's geometry is
 * expressed. `NODE_CARD_WIDTH` / `NODE_CARD_HEIGHT` are shared with
 * the layout maths in `lib/nodeLayout.ts` and must match the CSS.
 *
 * **The pieces are the shared ones.** The tile is the package's
 * `AgentAvatar` (fed through `lib/agentAvatar.ts → avatarSubject()`,
 * the same snake_case→camelCase coercion the detail panel uses), the
 * badge arrows are the package's `Icon`, and the status pill reuses
 * the plugin's existing `statusPillClass()` slugs so the colour map
 * stays the one already shared with `AgentStatusChip` — there is no
 * second status→colour table in this component.
 */
import { computed } from 'vue'
import { AgentAvatar } from '@spora-ai/components/avatar'
import { Icon } from '@spora-ai/components/icons'
import { avatarSubject } from '../lib/agentAvatar'
import { statusLabel, statusPillClass } from '../lib/nodeStatus'
import type { GraphNode } from '../types'

/**
 * `Icon`'s documented plugin-author extension point: a single `d`
 * path string is accepted as-is and rendered as a round-capped
 * stroke on a 24 × 24 `viewBox`. Shipping the arrows this way (rather
 * than depending on a bundled name) keeps the badges exactly as the
 * prototype drew them — `↑` for inbound, `↓` for outbound — while
 * still going through the shared `Icon` component.
 */
const ARROW_UP = 'M12 20V6M6 12l6-6 6 6'
const ARROW_DOWN = 'M12 4v14M18 12l-6 6-6-6'

const props = defineProps<{
    node: GraphNode
    /** Edges pointing *at* this agent. Drives the `↑ N` badge. */
    inbound: number
    /** Edges pointing away from this agent. Drives the `↓ N` badge. */
    outbound: number
    selected: boolean
    adjacent: boolean
    dimmed: boolean
    /** Card top-left in content-layer pixels, from the overlay. */
    x: number
    y: number
}>()

const emit = defineEmits<{ toggle: [id: number] }>()

const avatar = computed(() => avatarSubject(props.node))
const pillClass = computed(() => statusPillClass(props.node.status))
const pillText = computed(() => statusLabel(props.node.status))

/**
 * The zero variant is chosen per badge, not per pair: the prototype
 * shows a "0 in / 1 out" entry point with a slate `↑ 0` next to a
 * violet `↓ 1`, and a "1 in / 0 out" terminus with the mirror image.
 */
const inboundVariant = computed(() => (props.inbound === 0 ? 'zero' : 'in'))
const outboundVariant = computed(() => (props.outbound === 0 ? 'zero' : 'out'))

const cardClass = computed(() => ({
    'tg-node-card': true,
    'is-selected': props.selected,
    'is-adjacent': props.adjacent,
    'is-dimmed': props.dimmed,
}))

function onActivate(): void {
    emit('toggle', props.node.id)
}
</script>

<template>
    <div
        :class="cardClass"
        :style="{ transform: `translate3d(${x}px, ${y}px, 0)` }"
        :data-testid="`tg-node-${node.id}`"
        :data-node-id="node.id"
        :aria-pressed="selected"
        role="button"
        tabindex="0"
        data-tg-no-pan
        @click="onActivate"
        @keydown.enter.prevent="onActivate"
        @keydown.space.prevent="onActivate"
    >
        <AgentAvatar
            :agent="avatar"
            size="sm"
            class="tg-node-card-avatar"
        />
        <div class="tg-node-card-body">
            <div class="tg-node-card-row1">
                <span
                    class="tg-node-card-name"
                    :title="node.name"
                >{{ node.name }}</span>
            </div>
            <div class="tg-node-card-row2">
                <span
                    class="tg-status-pill tg-node-card-pill"
                    :class="pillClass"
                >
                    <span class="dot" />
                    {{ pillText }}
                </span>
                <span class="tg-node-card-badges">
                    <span
                        class="tg-edge-badge"
                        :class="`tg-edge-badge--${inboundVariant}`"
                    >
                        <Icon
                            :name="ARROW_UP"
                            class="w-2.5 h-2.5"
                            aria-hidden="true"
                        />
                        <span class="sr-only">inbound</span>{{ inbound }}
                    </span>
                    <span
                        class="tg-edge-badge"
                        :class="`tg-edge-badge--${outboundVariant}`"
                    >
                        <Icon
                            :name="ARROW_DOWN"
                            class="w-2.5 h-2.5"
                            aria-hidden="true"
                        />
                        <span class="sr-only">outbound</span>{{ outbound }}
                    </span>
                </span>
            </div>
        </div>
    </div>
</template>

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
 *   - fixed **240 px** box whose height is derived from its own parts
 *     in `lib/nodeLayout.ts`, ellipsised name,
 *   - `↑ N` inbound green / `↓ N` outbound violet, and a distinct
 *     slate `.zero` style **per badge** when that badge's own count
 *     is 0 — a 0-inbound node is an entry-point agent, and that
 *     distinction is signal, not noise.
 *
 * **The tile is `size="md"` (44 px) and the headline is top-aligned
 * against it.** The 240 px width is the Variant M prototype's; the
 * height is *derived* from the box's own parts in `lib/nodeLayout.ts`
 * (`border + block padding + max(tile, body column)`), so the tile is
 * the content box and the card is exactly as short as a 44 px tile can
 * be — 63 px.
 *
 * The headline used to be **centred** on the tile: row 1 was forced to
 * the tile's whole 44 px, which put the name's line-box centre and the
 * tile's centre on the same line at Δ = 0.000 px. That alignment is
 * deliberately reversed here. A 15.6 px line box centred in a 44 px
 * band hangs 14.2 px below the tile's top edge, and that is what the
 * operator read as "the headline sits low". Row 1 is now the headline's
 * natural height (13 px × 1.2 = 15.6 px) and the card's own
 * `align-items: flex-start` puts the name's top edge on the tile's top
 * edge. The measured delta between the two centres is −14.203 px — the
 * name now sits *above* the tile's centre rather than on it, which is
 * the point. See `NODE_CARD_HEADLINE_HEIGHT` in `lib/nodeLayout.ts`.
 *
 * **The status row is sized to its content, so the label does not
 * wrap.** It used to reserve the pill's three-line height, which made
 * every card 115 px tall and left 26.8 px of empty row under the pill
 * on all of them — the "the paddings are off" report. The pill now
 * takes its label on one line and ellipsises (`.tg-node-card-pill` in
 * `style.css`), which puts the card at its natural height for every
 * status. The full label is not lost: it stays in the DOM as the
 * pill's text, so a screen reader reads it whole; it is the pill's
 * `title` on hover; and the detail panel shows it in full. The
 * ellipsis is visible on the three longest labels — the `awaiting *`
 * family, which share one colour slug — so the canvas text is
 * genuinely less specific than it was. That is the trade this card
 * makes for being a fixed box, and it is the same one
 * `.tg-chat-row-status` already makes in the sidebar.
 *
 * **Everything visual lives in `style.css`** (`.tg-node-card` and
 * friends) so the card markup stays a pure structure and the CSS
 * file remains the single place the prototype's geometry is
 * expressed — with one deliberate exception: the box's own
 * `width` / `height` and the tile's edge are **inline**, built from
 * `NODE_CARD_WIDTH` / `NODE_CARD_HEIGHT` / `NODE_CARD_AVATAR_SIZE`,
 * because the footprint is load-bearing in four places and only the
 * constants can keep all four in step.
 *
 * **The card is a real `<button>`.** Selecting an agent is an
 * activation, so the card is a native toggle button
 * (`type="button"` + `aria-pressed`) rather than a `<div
 * role="button">` with hand-written `tabindex` and Enter/Space
 * handlers. The browser then owns the button role, the focus ring and
 * the keyboard activation on every device, and the manual handlers
 * cannot drift out of sync (a native button already synthesises a
 * `click` from Enter and Space, so a `keydown` handler on top of it
 * would fire the toggle twice). Nothing interactive encloses the
 * card — `.tg-canvas-wrap` → `.tg-canvas-content` → `.tg-node-overlay`
 * are all plain divs — so no control is nested inside a control. The
 * subtree is all `<span>` so the button keeps its phrasing-content
 * content model. See the comment above the template for the detail.
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
import { avatarPaletteStyle, avatarSubject } from '../lib/agentAvatar'
import { statusLabel, statusPillClass } from '../lib/nodeStatus'
import { NODE_CARD_AVATAR_SIZE, NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../lib/nodeLayout'
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
/**
 * The pill's whole class list in one binding: the shared `.tg-status-pill`
 * the panel chip and the chat rows also use, the card's own
 * `.tg-node-card-pill` (which is what makes the label one line), and the
 * status slug. Merged rather than split across a static `class` and a
 * `:class` so the element keeps two attributes — the same count it had
 * before `title` joined it, and one attribute per line.
 */
const pillClass = computed(() => `tg-status-pill tg-node-card-pill ${statusPillClass(props.node.status)}`)
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

/**
 * Placement, the card's own box, and the agent's palette.
 *
 * **`width` / `height` are inline, not in `style.css`.** The footprint
 * is load-bearing in four places — this box, `nodeLayout`'s
 * `translate3d`, `useMermaidRender`'s grown `g.node rect`, and
 * `edgeGeometry`'s border walk — and the last three all read
 * `NODE_CARD_WIDTH` / `NODE_CARD_HEIGHT`. Stating the box from the same
 * constants here is what makes it a single source of truth rather than
 * a fourth copy: resize the card and every consumer of the box moves
 * with it, so the arrowheads cannot detach from the cards again.
 *
 * `--tg-avatar-size` is the same move one level down: the package sizes
 * its tile in `rem` (which tracks the *root* font size) while the card
 * is a fixed px box, so the tile's edge is stated in px here and
 * `style.css` uses the same variable for the tile itself.
 *
 * The two `--spora-avatar-*` custom properties are the package's own
 * theming hook for the initials tile, so an agent with no archetype
 * keeps the colour the backend resolved for it instead of dropping to
 * the hard-coded slate default. Set on the card (the avatar inherits
 * custom properties), which keeps one palette source for the whole
 * card. See `lib/agentAvatar.ts → avatarPaletteStyle`.
 */
const cardStyle = computed(() => ({
    transform: `translate3d(${props.x}px, ${props.y}px, 0)`,
    width: `${NODE_CARD_WIDTH}px`,
    height: `${NODE_CARD_HEIGHT}px`,
    '--tg-avatar-size': `${NODE_CARD_AVATAR_SIZE}px`,
    ...avatarPaletteStyle(props.node),
}))

function onActivate(): void {
    emit('toggle', props.node.id)
}
</script>

<template>
    <!--
        A real `<button type="button">`, not a `<div role="button">`:
        the card is the only interactive element in its whole ancestor
        chain (`.tg-canvas-wrap` → `.tg-canvas-content` →
        `.tg-node-overlay` are all plain divs), so nothing nests inside
        another control and the native element costs nothing. In return
        the browser owns focus, the focus ring, Enter/Space activation
        and the `button` role on every device — no `role`, no
        `tabindex`, and no hand-rolled `keydown` handlers to keep in
        sync (a native button synthesises a `click` from Enter and
        Space, so a `keydown` handler would double-fire the toggle).
        `aria-pressed` is the one attribute kept: it is what makes this
        a *toggle* button rather than a plain action button.

        Everything inside is a `<span>` so the subtree stays phrasing
        content, which is the content model `<button>` allows.
        `AgentAvatar` and `Icon` already render `span` / `svg` roots.
    -->
    <button
        type="button"
        :class="cardClass"
        :style="cardStyle"
        :data-testid="`tg-node-${node.id}`"
        :data-node-id="node.id"
        :aria-pressed="selected"
        data-tg-no-pan
        @click="onActivate"
    >
        <AgentAvatar
            :agent="avatar"
            size="md"
            class="tg-node-card-avatar"
        />
        <span class="tg-node-card-body">
            <span class="tg-node-card-row1">
                <span
                    class="tg-node-card-name"
                    :title="node.name"
                >{{ node.name }}</span>
            </span>
            <span class="tg-node-card-row2">
                <span
                    :class="pillClass"
                    :title="pillText"
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
            </span>
        </span>
    </button>
</template>

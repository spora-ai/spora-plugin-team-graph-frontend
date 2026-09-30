<script setup lang="ts">
/**
 * TeamGraphCanvas — the Mermaid viewport plus the Vue node overlay.
 *
 * Composes `useMermaidRender` (SVG lifecycle + node positioning)
 * and `usePanZoom` (pan/zoom driver). Emits `tap-empty-canvas` when
 * the operator taps the empty area without dragging — the page wires
 * this to `selection.clear()`.
 *
 * **The two-layer arrangement (Option C).**
 *
 *   .tg-canvas-wrap          viewport; owns pointer/wheel events
 *   └── .tg-canvas-content   the single transformed element
 *       ├── [data-testid=tg-mermaid-host]   <svg> — EDGES only
 *       └── .tg-node-overlay                HTML — one AgentNodeCard
 *
 * The overlay is a *sibling* of the SVG inside the same element that
 * `usePanZoom` applies `translate(x, y) scale(k)` to, so panning,
 * zooming, `fit()` and the window-resize clamp move the cards and
 * the edges together with **no JavaScript** — that is the whole
 * reason the card layer is HTML and not a `<foreignObject>`.
 *
 * Card positions come from `useMermaidRender`'s `positions` map,
 * which is recomputed from scratch on every successful Mermaid
 * render. Cards whose id has no measured position are not rendered
 * at all, so a re-render (poll, principal switch, dedup) can never
 * leave a card behind at a stale coordinate.
 *
 * **View reset semantics.**
 *
 * The canvas fits to viewport when ANY of these change:
 *
 *   1. The principal changes (`props.graph.principal.id` differs
 *      from the previously-rendered one) — the new graph has
 *      different dimensions, so the operator's old zoom + pan
 *      would frame the wrong content.
 *   2. The first render (initial mount) — nothing to preserve.
 *   3. The Refresh button or `shouldFit` prop fires — explicit
 *      "reset view to fit" request.
 *
 * Data refreshes (the 30 s polling in `useTeamGraph`) DO NOT fit:
 * the operator's zoom + pan survive, and `useTeamGraph`'s dedup
 * means identical payloads don't re-render anyway. Because the cards
 * live in the transformed content layer, "preserve the view" also
 * preserves the card positions for free.
 *
 * Implementation: a single `pendingFit` ref is the contract. Both
 * the principal-change watcher and the shouldFit watcher set it to
 * true. The fit itself runs from two paths:
 *
 *   - `useMermaidRender`'s `onRender` callback fires AFTER the new
 *     SVG has been committed to the DOM with final dimensions.
 *     This is the path the principal-change case takes.
 *   - A double rAF fallback in `scheduleFit()` handles the dedup
 *     case (Refresh with identical data → no re-render → onRender
 *     doesn't fire → rAF fallback runs `fit()` directly).
 *
 * Whichever path fires first clears the flag + calls `fit()`; the
 * other sees the flag cleared and no-ops.
 *
 * **The empty state lives here, not in the page.**
 *
 * A principal with no agents returns a well-formed payload whose
 * `nodes` array is empty. Rendering that meant a 620 px blank card
 * with the footer still saying "Drag empty canvas to pan · scroll to
 * zoom · click any node to inspect" — instructions for a diagram
 * with nothing in it.
 *
 * The obvious fix is for the page to swap the canvas for a card
 * (`v-if` in `TeamGraphPage.vue`), and that was the first thing
 * tried. It is wrong, and the browser is what said so: the canvas
 * then *unmounts* for the empty team, and when the operator switches
 * back it **remounts with a non-null `graph` prop**. Nothing renders
 * it. `useMermaidRender`'s watcher is `immediate: true`, but it runs
 * during `setup()` — before `hostRef` has bound — and `reRender()`
 * returns early on a null host, so the immediate pass is a permanent
 * no-op and nothing else fires because the prop never changes again.
 * Measured after switching empty → populated and waiting 4 s: 0
 * `<svg>`, 0 edge paths, 0 node cards, no transform on the content
 * layer. A blank canvas with the misleading footer, reached by the
 * ordinary act of clicking back to your own team.
 *
 * So the canvas stays mounted across the transition and decides for
 * itself: `graphIsEmpty` below gates the zoom stack and the footer
 * out, and the note takes their place. That also makes the footer
 * suppression total by construction — there is no path where the
 * hint is on screen and the note is not.
 *
 * **No icon, mirroring the `tg-detail-placeholder` aside card.**
 * `GraphErrorFallback` leads with a warning glyph because something
 * went wrong; "this team has no agents" is a neutral fact.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@spora-ai/components/icons'
import AgentNodeCard from './AgentNodeCard.vue'
import { useMermaidRender } from '../composables/useMermaidRender'
import { usePanZoom } from '../composables/usePanZoom'
import { edgeDegrees, isAdjacent } from '../lib/stats'
import type { NodePosition } from '../lib/nodeLayout'
import { useSelectionStore } from '../stores/selection'
import type { GraphNode, GraphPayload } from '../types'

const props = defineProps<{
    graph: GraphPayload | null
    /** Set true when the toolbar's Refresh button is clicked. */
    shouldFit?: boolean
}>()

const emit = defineEmits<{
    'tap-empty-canvas': []
}>()

const canvasWrap = ref<HTMLElement | null>(null)
const canvasContent = ref<HTMLElement | null>(null)
const hostRef = ref<HTMLElement | null>(null)

const graphRef = ref<GraphPayload | null>(props.graph)
watch(
    () => props.graph,
    (next) => {
        graphRef.value = next
    },
)

/**
 * A payload arrived and it had no nodes.
 *
 * `null` and `0` are different states and are deliberately NOT merged
 * into one flag. `null` is the first fetch still in flight, and it
 * keeps the bare canvas and its footer exactly as before; `0` is a
 * payload that arrived with nothing in it, and it is the only case
 * the note is for. Testing `!props.graph?.nodes.length` instead would
 * conflate them and flash "No agents yet" on every page load.
 *
 * One flag is enough for the template because the content layer is
 * unconditional (see below) and the two gated regions — the note and
 * the footer/zoom — partition the three states between them.
 */
const graphIsEmpty = computed<boolean>(() => graphRef.value !== null && graphRef.value.nodes.length === 0)

/*
 * `pendingFit` is the one-bit contract between the trigger
 * sources (principal-change + shouldFit) and the runner
 * (useMermaidRender's onRender + the double-rAF fallback).
 * Whoever fires first consumes the flag.
 */
const pendingFit = ref(false)

/**
 * Schedule a fit-to-viewport on the next available animation
 * frame. Two paths consume the flag:
 *
 *   1. useMermaidRender's `onRender` callback (the normal path —
 *      fires after the new SVG has been committed).
 *   2. The double rAF here (the fallback — fires after two
 *      animation frames, by which time any in-flight render
 *      has either completed and consumed the flag, or will
 *      consume it next).
 *
 * **`consumeFit()` clears the flag only once a fit has actually
 * happened.** A fit requested before Mermaid has committed its SVG
 * finds no diagram to measure; clearing the flag on that no-op would
 * strand the view at its untransformed default, because the `onRender`
 * fit is the one that runs *after* the SVG exists. Keeping the request
 * pending lets that later fit be the one that consumes it.
 */
function consumeFit(): void {
    if (!pendingFit.value) return
    if (!fit()) return
    pendingFit.value = false
}

function scheduleFit(): void {
    pendingFit.value = true
    requestAnimationFrame(() => requestAnimationFrame(consumeFit))
}

const { positions } = useMermaidRender({
    hostRef,
    graph: graphRef,
    /*
     * Two RAFs: the first lets the freshly committed SVG attach to
     * the DOM, the second lets layout propagate so the wrap's box and
     * the SVG's width/height attributes are valid by the time fit()
     * reads them. Without this double-rAF the first fit is sometimes
     * called before the browser has sized the new node.
     *
     * This is the path that actually frames the *first* graph: the
     * `pendingFit` set by the principal-change watcher fires long
     * before Mermaid has resolved, and `consumeFit` leaves that request
     * pending until there is a diagram to frame — which is exactly
     * what this callback is.
     */
    onRender: () => requestAnimationFrame(() => requestAnimationFrame(consumeFit)),
})
const { fit, zoomIn, zoomOut } = usePanZoom({
    wrapRef: canvasWrap,
    contentRef: canvasContent,
    hostRef,
})

const selection = useSelectionStore()

/** One entry per node that Mermaid actually placed, in payload order. */
interface PlacedNode {
    node: GraphNode
    position: NodePosition
}

const placedNodes = computed<PlacedNode[]>(() => {
    const graph = graphRef.value
    if (graph === null) return []
    const out: PlacedNode[] = []
    for (const node of graph.nodes) {
        const position = positions.value[node.id]
        if (position === undefined) continue
        out.push({ node, position })
    }
    return out
})

/**
 * Badge counts, derived from the payload's `edges` (see
 * `lib/stats.ts → edgeDegrees`). Recomputed only when the payload
 * changes, not on every selection toggle.
 */
const degrees = computed(() => {
    const graph = graphRef.value
    if (graph === null) return new Map<number, { inbound: number; outbound: number }>()
    return edgeDegrees(graph.nodes, graph.edges)
})

function degreesFor(id: number): { inbound: number; outbound: number } {
    return degrees.value.get(id) ?? { inbound: 0, outbound: 0 }
}

function isSelected(id: number): boolean {
    return selection.selectedId === id
}

function isAdjacentToSelection(id: number): boolean {
    const sel = selection.selectedId
    if (sel === null) return false
    return isAdjacent(selection.edges, id, sel)
}

function isDimmedBySelection(id: number): boolean {
    return selection.selectedId !== null && !isSelected(id) && !isAdjacentToSelection(id)
}

function onToggleNode(id: number): void {
    if (selection.selectedId === id) {
        selection.clear()
    } else {
        selection.setSelected(id)
    }
}

/*
 * Principal-change detection. `graph.principal.id` flips the
 * moment `useTeamGraph` commits the new principal's payload —
 * this watcher fires synchronously (Vue's reactivity) and asks
 * for a fit on the next render. The onRender callback above then
 * runs `fit()` once the new SVG has settled.
 *
 * The dedup case (`oldId === null` initial load) is included —
 * the very first render still needs a fit.
 */
watch(
    () => props.graph?.principal.id ?? null,
    (newId, oldId) => {
        if (newId !== null && (oldId === null || newId !== oldId)) {
            scheduleFit()
        }
    },
)

/*
 * Explicit refresh trigger from the toolbar. The Refresh button
 * in `TeamGraphPage` sets `shouldFit = true` after refetch resolves;
 * if the refetch dedup'd (no data change), no re-render happens,
 * so the rAF fallback in `scheduleFit()` is what actually runs
 * the fit. If the refetch produced a new payload, both paths race
 * — whichever fires first wins, the other sees the cleared flag.
 */
watch(
    () => props.shouldFit,
    (next) => {
        if (next === true) {
            scheduleFit()
        }
    },
)

function onTapEmptyCanvas(): void {
    emit('tap-empty-canvas')
}

onMounted(() => {
    const wrap = canvasWrap.value
    if (wrap === null) return
    wrap.addEventListener('tg-canvas-tap', onTapEmptyCanvas)
})
</script>

<template>
    <div
        ref="canvasWrap"
        data-testid="tg-canvas-wrap"
        class="tg-canvas-wrap surface-card relative overflow-hidden bg-card text-card-foreground border border-border rounded-xl"
        :class="graphIsEmpty ? 'tg-canvas-wrap--idle' : ''"
        style="height: 620px;"
    >
        <!--
            The empty state, replacing the diagram rather than
            sitting over it. The card itself is the canvas, so the
            height, the surface, the radius and the border are
            unchanged and a poll crossing between "no agents" and
            "some agents" cannot move anything — measured at 622 px
            in both states (620 + 2 × 1 px border).

            `p-6` sits on this inner div rather than on the wrap for
            the same reason `GraphErrorFallback` puts it there: there
            is no Tailwind preflight in this plugin, so the box model
            is `content-box` and padding on the 620 px wrap would
            measure 670 px and jump the row by 48 px.

            Keyed on `graphIsEmpty` rather than on "no graph": the
            loading window (`graph === null`) is not an empty graph,
            and the note must not open every load. `z-10` because the
            content layer below is also positioned.
        -->
        <div
            v-if="graphIsEmpty"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center"
            data-testid="tg-graph-empty"
        >
            <p class="text-sm font-medium text-foreground">No agents yet</p>
            <p class="text-xs text-muted-foreground mt-1 max-w-[360px]">
                This team has no agents. The view updates when one is added.
            </p>
        </div>
        <!--
            The content layer stays mounted and visible in every
            state, exactly as before. It is not `v-if`'d and not
            `v-show`'d, for two measured reasons:

              - it carries the pan/zoom `transform` on its inline
                style and holds the `hostRef` the renderer writes
                into, so unmounting it would strand the next graph
                with neither;
              - `useMermaidRender` measures the committed SVG with
                `getBBox()`, and an ancestor with `display: none`
                makes that return zero — the `bb.width > 0` guard
                would silently skip the viewBox reset. Keeping the
                layer visible keeps the geometry path byte-for-byte
                the one it is today.

            In the empty state it is simply *empty*: the render guard
            in `useMermaidRender` skips a zero-node payload and
            empties the host, so there is no SVG under the note. The
            note paints over the top of it (`z-10`, since both are
            positioned) rather than replacing it.
        -->
        <div
            ref="canvasContent"
            data-testid="tg-canvas-content"
            class="tg-canvas-content"
            style="position: absolute; left: 0; top: 0;"
        >
            <div
                ref="hostRef"
                data-testid="tg-mermaid-host"
                class="inline-block"
            />
            <!--
                Sibling HTML overlay. Same transformed parent as the
                SVG above, so `usePanZoom`'s transform moves both
                layers in lockstep. `pointer-events: none` on the
                layer (see style.css) keeps the gaps between cards
                clickable for panning; the cards themselves opt back
                in and are marked `data-tg-no-pan` so a click selects
                instead of starting a drag — the same trade-off the
                Mermaid node boxes made before Option C.
            -->
            <div
                data-testid="tg-node-overlay"
                class="tg-node-overlay"
            >
                <AgentNodeCard
                    v-for="placed in placedNodes"
                    :key="placed.node.id"
                    :node="placed.node"
                    :inbound="degreesFor(placed.node.id).inbound"
                    :outbound="degreesFor(placed.node.id).outbound"
                    :x="placed.position.x"
                    :y="placed.position.y"
                    :selected="isSelected(placed.node.id)"
                    :adjacent="isAdjacentToSelection(placed.node.id)"
                    :dimmed="isDimmedBySelection(placed.node.id)"
                    @toggle="onToggleNode"
                />
            </div>
        </div>
        <!--
            The zoom stack and the footer hint describe interactions
            with a diagram. A team with no agents has none, so both
            are gated off in that state — not dimmed, not left inert.
            "Scroll to zoom" and "click any node to inspect" on a
            card holding a sentence that says there is nothing to
            inspect is the exact contradiction this state exists to
            remove.

            Gated on `!graphIsEmpty` rather than on a positive
            "has a graph" test, so the *loading* window
            (`graph === null`) keeps the affordance it has always
            had. That copy is equally premature while a fetch is in
            flight, but changing that is a separate decision from
            this one and would alter what the page has always shown
            on load.
        -->
        <div
            v-if="!graphIsEmpty"
            class="absolute top-3 right-3 flex flex-col surface-card rounded-lg shadow-sm overflow-hidden border border-border"
        >
            <button
                type="button"
                class="tg-zoom-btn"
                aria-label="Zoom in"
                data-testid="tg-zoom-in"
                @click="zoomIn"
            >
                <Icon
                    name="plus"
                    class="w-3.5 h-3.5"
                />
            </button>
            <button
                type="button"
                class="tg-zoom-btn"
                aria-label="Zoom out"
                data-testid="tg-zoom-out"
                @click="zoomOut"
            >
                <Icon
                    name="minus"
                    class="w-3.5 h-3.5"
                />
            </button>
            <button
                type="button"
                class="tg-zoom-btn"
                aria-label="Fit to view"
                data-testid="tg-zoom-fit"
                @click="fit"
            >
                <Icon
                    name="maximize"
                    class="w-3.5 h-3.5"
                />
            </button>
        </div>
        <p
            v-if="!graphIsEmpty"
            class="absolute bottom-3 left-4 right-24 text-[11px] text-muted-foreground pointer-events-none"
        >
            Drag empty canvas to pan · scroll to zoom · click any node to inspect
        </p>
    </div>
</template>

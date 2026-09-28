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
 */
function scheduleFit(): void {
    pendingFit.value = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (pendingFit.value) {
            pendingFit.value = false
            fit()
        }
    }))
}

const { positions } = useMermaidRender({
    hostRef,
    graph: graphRef,
    /*
     * Two RAFs: the first lets the freshly committed SVG attach to
     * the DOM, the second lets layout propagate so wrap.clientWidth
     * and the SVG's width/height attributes are valid by the time
     * fit() reads them. Without this double-rAF the first fit is
     * sometimes called before the browser has sized the new node.
     *
     * On every render we check the `pendingFit` flag — if a fit
     * was requested (principal change or Refresh), run it now
     * that the SVG has its final dimensions.
     */
    onRender: () => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (pendingFit.value) {
            pendingFit.value = false
            fit()
        }
    })),
})
const { fit, zoomIn, zoomOut } = usePanZoom({
    wrapRef: canvasWrap,
    contentRef: canvasContent,
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
        style="height: 620px;"
    >
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
        <div
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
        <p class="absolute bottom-3 left-4 right-24 text-[11px] text-muted-foreground pointer-events-none">
            Drag empty canvas to pan · scroll to zoom · click any node to inspect
        </p>
    </div>
</template>

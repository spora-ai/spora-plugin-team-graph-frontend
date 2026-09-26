<script setup lang="ts">
/**
 * TeamGraphCanvas — the Mermaid viewport.
 *
 * Composes `useMermaidRender` (SVG lifecycle) and `usePanZoom`
 * (pan/zoom driver). Emits `tap-empty-canvas` when the operator
 * taps the empty area without dragging — the page wires this to
 * `selection.clear()`.
 *
 * Two render passes happen on mount: the first Mermaid render
 * commits the SVG with the loose `useMaxWidth` setting, the
 * second (after `getBBox`) tightens the viewBox. The fit call
 * lives behind a `requestAnimationFrame` so the SVG has time
 * to attach to layout before we measure it.
 */
import { onMounted, ref, watch } from 'vue'
import { useMermaidRender } from '../composables/useMermaidRender'
import { usePanZoom } from '../composables/usePanZoom'
import { useSelectionStore } from '../stores/selection'
import type { GraphPayload } from '../types'

const props = defineProps<{
    graph: GraphPayload | null
    /** Set true when the principal changes so we can refit on the next render. */
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

const selection = useSelectionStore()
const { reRender } = useMermaidRender({
    hostRef,
    graph: graphRef,
    /* Two RAFs: the first lets the freshly committed SVG attach to
     * the DOM, the second lets layout propagate so wrap.clientWidth
     * and the SVG's width/height attributes are valid by the time
     * fit() reads them. Without this double-rAF the first fit is
     * sometimes called before the browser has sized the new node. */
    onRender: () => requestAnimationFrame(() => requestAnimationFrame(() => fit())),
})
const { fit, zoomIn, zoomOut } = usePanZoom({
    wrapRef: canvasWrap,
    contentRef: canvasContent,
})

function onTapEmptyCanvas(): void {
    emit('tap-empty-canvas')
}

onMounted(() => {
    const wrap = canvasWrap.value
    if (wrap === null) return
    wrap.addEventListener('tg-canvas-tap', onTapEmptyCanvas)
})

watch(
    () => selection.selectedId,
    () => {
        // Selection-driven styling is reapplied by `useMermaidRender`'s
        // own watcher; the canvas just needs to clear any pending
        // fit when a re-render fires after selection changes.
        void reRender
    },
)

watch(
    () => props.shouldFit,
    (next) => {
        if (next === true) {
            requestAnimationFrame(() => requestAnimationFrame(() => fit()))
        }
    },
)
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
            class="tg-canvas-content"
            style="position: absolute; left: 0; top: 0;"
        >
            <div
                ref="hostRef"
                data-testid="tg-mermaid-host"
                class="inline-block"
            />
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
                <svg
                    class="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                >
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </button>
            <button
                type="button"
                class="tg-zoom-btn"
                aria-label="Zoom out"
                data-testid="tg-zoom-out"
                @click="zoomOut"
            >
                <svg
                    class="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                >
                    <path d="M5 12h14" />
                </svg>
            </button>
            <button
                type="button"
                class="tg-zoom-btn"
                aria-label="Fit to view"
                data-testid="tg-zoom-fit"
                @click="fit"
            >
                <svg
                    class="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
                </svg>
            </button>
        </div>
        <p class="absolute bottom-3 left-4 right-24 text-[11px] text-muted-foreground pointer-events-none">
            Drag empty canvas to pan · scroll to zoom · click any node to inspect
        </p>
    </div>
</template>
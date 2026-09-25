/**
 * Pinia store for the currently selected / hovered agent node.
 *
 * The team graph has exactly one selected agent at a time; clicking
 * a node sets it, clicking the same node again clears it, clicking
 * the empty canvas clears it. The Pinia store is the canonical
 * source of truth — `TeamGraphCanvas.vue` reads `selectedId` to
 * toggle CSS classes on the rendered Mermaid SVG and
 * `AgentDetailPanel.vue` reads the same `selectedId` to decide
 * whether to render.
 *
 * Composition store (not options store) because the rest of the
 * plugin uses composition-style refs; mixing the two styles in one
 * app would just churn dev-time type inference.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GraphEdge } from '../types'

export const useSelectionStore = defineStore('selection', () => {
    const selectedId = ref<number | null>(null)
    const hoverId = ref<number | null>(null)
    const edges = ref<GraphEdge[]>([])

    function setSelected(id: number | null): void {
        selectedId.value = id
    }

    function clear(): void {
        selectedId.value = null
    }

    function setHover(id: number | null): void {
        hoverId.value = id
    }

    function setEdges(next: GraphEdge[]): void {
        edges.value = next
    }

    function isSelected(id: number): boolean {
        return selectedId.value === id
    }

    const outgoingEdges = computed<GraphEdge[]>(() =>
        selectedId.value === null ? [] : edges.value.filter((e) => e.source === selectedId.value),
    )

    const incomingEdges = computed<GraphEdge[]>(() =>
        selectedId.value === null ? [] : edges.value.filter((e) => e.target === selectedId.value),
    )

    const neighbours = computed<Set<number>>(() => {
        const set = new Set<number>()
        if (selectedId.value === null) return set
        for (const e of edges.value) {
            if (e.source === selectedId.value) set.add(e.target)
            if (e.target === selectedId.value) set.add(e.source)
        }
        return set
    })

    return {
        selectedId,
        hoverId,
        edges,
        setSelected,
        clear,
        setHover,
        setEdges,
        isSelected,
        outgoingEdges,
        incomingEdges,
        neighbours,
    }
})
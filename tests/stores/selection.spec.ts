import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSelectionStore } from '../../src/stores/selection'
import type { GraphEdge } from '../../src/types'

/**
 * `stores/selection.ts` — the single source of truth for "which
 * agent is selected".
 *
 * After Option C this store is read by *three* consumers, which is
 * why every branch is worth pinning:
 *
 *  - `AgentNodeCard` / `TeamGraphCanvas` derive `is-selected` /
 *    `is-adjacent` / `is-dimmed` from `selectedId` + `edges`
 *    (the node highlight moved off the Mermaid SVG and onto the Vue
 *    cards),
 *  - `useMermaidRender` tags the SVG's `path.flowchart-link` with
 *    `out` / `in` / `dim` from the same two fields,
 *  - `AgentDetailPanel` lists `outgoingEdges` / `incomingEdges` and
 *    walks `neighbours` for the hierarchy chain.
 */

function edge(source: number, target: number): GraphEdge {
    return {
        id: `${source}->${target}`,
        source,
        target,
        op: 'sub_agent',
        configured: true,
        count_24h: 1,
        last_invoked_at: '2026-09-23T10:14:00Z',
    }
}

const EDGES = [edge(1, 2), edge(1, 3), edge(4, 1), edge(2, 3)]

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('useSelectionStore — scalar state', () => {
    it('starts empty', () => {
        const s = useSelectionStore()
        expect(s.selectedId).toBeNull()
        expect(s.hoverId).toBeNull()
        expect(s.edges).toEqual([])
    })

    it('sets, re-sets and clears the selected id', () => {
        const s = useSelectionStore()
        s.setSelected(4)
        expect(s.selectedId).toBe(4)
        s.setSelected(9)
        expect(s.selectedId).toBe(9)
        s.clear()
        expect(s.selectedId).toBeNull()
    })

    it('accepts an explicit null through setSelected', () => {
        const s = useSelectionStore()
        s.setSelected(4)
        s.setSelected(null)
        expect(s.selectedId).toBeNull()
    })

    it('tracks hover independently of selection', () => {
        const s = useSelectionStore()
        s.setHover(3)
        expect(s.hoverId).toBe(3)
        expect(s.selectedId).toBeNull()
        s.setHover(null)
        expect(s.hoverId).toBeNull()
    })

    it('exposes isSelected as a derived predicate', () => {
        const s = useSelectionStore()
        s.setSelected(2)
        expect(s.isSelected(2)).toBe(true)
        expect(s.isSelected(3)).toBe(false)
    })

    it('replaces the edge list wholesale', () => {
        const s = useSelectionStore()
        s.setEdges(EDGES)
        expect(s.edges).toHaveLength(4)
        s.setEdges([])
        expect(s.edges).toEqual([])
    })
})

describe('useSelectionStore — derived edge views', () => {
    it('exposes the selected node\'s outgoing and incoming edges', () => {
        const s = useSelectionStore()
        s.setEdges(EDGES)
        s.setSelected(1)
        expect(s.outgoingEdges.map((e) => e.target)).toEqual([2, 3])
        expect(s.incomingEdges.map((e) => e.source)).toEqual([4])
    })

    it('returns empty lists while nothing is selected', () => {
        const s = useSelectionStore()
        s.setEdges(EDGES)
        expect(s.outgoingEdges).toEqual([])
        expect(s.incomingEdges).toEqual([])
        expect(s.neighbours.size).toBe(0)
    })

    it('collects every neighbour of the selected node in both directions', () => {
        const s = useSelectionStore()
        s.setEdges(EDGES)
        s.setSelected(1)
        // outbound 2, 3 + inbound 4
        expect([...s.neighbours].sort((a, b) => a - b)).toEqual([2, 3, 4])
    })

    it('is a genuine Set so a two-way pair collapses to one entry', () => {
        const s = useSelectionStore()
        s.setEdges([edge(1, 2), edge(2, 1)])
        s.setSelected(1)
        expect(s.neighbours.has(2)).toBe(true)
        expect(s.neighbours.size).toBe(1)
    })

    it('re-derives everything the moment the selection changes', () => {
        const s = useSelectionStore()
        s.setEdges(EDGES)
        s.setSelected(1)
        expect(s.outgoingEdges).toHaveLength(2)
        s.setSelected(2)
        expect(s.outgoingEdges).toHaveLength(1)
        expect(s.incomingEdges).toHaveLength(1)
        expect([...s.neighbours].sort((a, b) => a - b)).toEqual([1, 3])
    })
})

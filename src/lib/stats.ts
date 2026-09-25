/**
 * Edge-degree helpers used by the agent-detail panel's
 * "Outbound" / "Inbound" lists and by `useGraphSelection.ts`.
 */
import type { GraphEdge } from '../types'

export function outDegree(edges: GraphEdge[], nodeId: number): GraphEdge[] {
    return edges.filter((e) => e.source === nodeId)
}

export function inDegree(edges: GraphEdge[], nodeId: number): GraphEdge[] {
    return edges.filter((e) => e.target === nodeId)
}

export function isAdjacent(edges: GraphEdge[], a: number, b: number): boolean {
    if (a === b) return true
    return edges.some((e) =>
        (e.source === a && e.target === b) || (e.source === b && e.target === a),
    )
}

/**
 * Count bidirectional edge pairs in the graph (a pair is a
 * match when both `(a → b)` and `(b → a)` exist). Used by the
 * summary line "X bidirectional" so operators can spot
 * back-and-forth chatter at a glance.
 */
export function countBidirectional(edges: GraphEdge[]): number {
    const seen = new Set<string>()
    let count = 0
    for (const e of edges) {
        const key = [e.source, e.target].sort((a, b) => a - b).join('-')
        if (seen.has(key)) continue
        seen.add(key)
        if (edges.some((o) => o.source === e.target && o.target === e.source)) {
            count++
        }
    }
    return count
}
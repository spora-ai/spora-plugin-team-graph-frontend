/**
 * Edge-degree helpers used by the agent-detail panel's
 * "Outbound" / "Inbound" lists, by `stores/selection.ts`, and by
 * the canvas cards' `↑ N` / `↓ N` badges.
 */
import type { GraphEdge, GraphNode } from '../types'

export function outDegree(edges: GraphEdge[], nodeId: number): GraphEdge[] {
    return edges.filter((e) => e.source === nodeId)
}

export function inDegree(edges: GraphEdge[], nodeId: number): GraphEdge[] {
    return edges.filter((e) => e.target === nodeId)
}

export interface EdgeDegrees {
    inbound: number
    outbound: number
}

/**
 * Per-agent inbound / outbound counts, keyed by node id.
 *
 * Derived client-side from the `edges` array that is already in the
 * payload: the endpoint sends no counts and never will, because
 * `NodeResolver` would otherwise have to hoist two columns the
 * client can derive from data it already received.
 *
 * The counts go through `inDegree` / `outDegree` on purpose — the
 * canvas badge and the detail panel's "Inbound (N)" list must be
 * derived from one definition of "degree" or they can drift. That
 * costs two linear passes per node (O(nodes × edges) in total),
 * which is irrelevant at the ~100-node / ~300-edge scale the
 * endpoint serves, and it is recomputed only when the payload's
 * edges change.
 */
export function edgeDegrees(nodes: GraphNode[], edges: GraphEdge[]): Map<number, EdgeDegrees> {
    const degrees = new Map<number, EdgeDegrees>()
    for (const node of nodes) {
        degrees.set(node.id, {
            inbound: inDegree(edges, node.id).length,
            outbound: outDegree(edges, node.id).length,
        })
    }
    return degrees
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
import { describe, it, expect } from 'vitest'
import { countBidirectional, edgeDegrees, inDegree, isAdjacent, outDegree } from '../../src/lib/stats'
import type { GraphEdge, GraphNode } from '../../src/types'

/**
 * `lib/stats.ts` — the single definition of "how connected is this
 * agent".
 *
 * `edgeDegrees()` is what feeds the Variant M card's `↑ N` / `↓ N`
 * badges. It deliberately goes through `inDegree` / `outDegree` so
 * the badge and the detail panel's lists cannot disagree, and the
 * counts are derived client-side from the `edges` array that is
 * already in the payload — `NodeResolver` sends no counts and is not
 * touched.
 */

function edge(source: number, target: number, id = `${source}->${target}`): GraphEdge {
    return { id, source, target, op: 'sub_agent', configured: true, count_24h: 1, last_invoked_at: null }
}

function node(id: number): GraphNode {
    return {
        id,
        name: `Agent ${id}`,
        role: null,
        picture_url: null,
        status: 'COMPLETED',
        active_chats: 0,
        recent_chats_24h: 0,
        profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' },
    }
}

const EDGES = [edge(1, 2), edge(1, 3), edge(4, 1), edge(2, 3), edge(2, 1, '2->1')]

describe('inDegree / outDegree', () => {
    it('selects the edges leaving a node', () => {
        expect(outDegree(EDGES, 1).map((e) => e.target)).toEqual([2, 3])
        expect(outDegree(EDGES, 9)).toEqual([])
    })

    it('selects the edges entering a node', () => {
        expect(inDegree(EDGES, 1).map((e) => e.source)).toEqual([4, 2])
        expect(inDegree(EDGES, 9)).toEqual([])
    })
})

describe('edgeDegrees', () => {
    it('counts inbound and outbound per node from the payload edges', () => {
        const degrees = edgeDegrees([1, 2, 3, 4, 5].map(node), EDGES)
        expect(degrees.get(1)).toEqual({ inbound: 2, outbound: 2 })
        expect(degrees.get(2)).toEqual({ inbound: 1, outbound: 2 })
        expect(degrees.get(3)).toEqual({ inbound: 2, outbound: 0 })
        expect(degrees.get(4)).toEqual({ inbound: 0, outbound: 1 })
    })

    it('reports 0 / 0 for an isolated node (both badge variants are the zero style)', () => {
        const degrees = edgeDegrees([node(5)], EDGES)
        expect(degrees.get(5)).toEqual({ inbound: 0, outbound: 0 })
    })

    it('returns an empty map when the graph has no nodes', () => {
        expect(edgeDegrees([], EDGES).size).toBe(0)
    })

    it('returns 0 / 0 for every node when the graph has no edges', () => {
        const degrees = edgeDegrees([1, 2].map(node), [])
        expect(degrees.get(1)).toEqual({ inbound: 0, outbound: 0 })
        expect(degrees.get(2)).toEqual({ inbound: 0, outbound: 0 })
    })

    it('counts a bidirectional pair once on each side', () => {
        const degrees = edgeDegrees([1, 2].map(node), [edge(1, 2), edge(2, 1, 'reverse')])
        expect(degrees.get(1)).toEqual({ inbound: 1, outbound: 1 })
        expect(degrees.get(2)).toEqual({ inbound: 1, outbound: 1 })
    })
})

describe('isAdjacent', () => {
    it('is true for a node connected in either direction', () => {
        expect(isAdjacent(EDGES, 1, 2)).toBe(true)
        expect(isAdjacent(EDGES, 2, 1)).toBe(true)
    })

    it('is true for a node compared with itself', () => {
        expect(isAdjacent(EDGES, 1, 1)).toBe(true)
    })

    it('is false for two unconnected nodes', () => {
        expect(isAdjacent(EDGES, 3, 4)).toBe(false)
        expect(isAdjacent(EDGES, 1, 9)).toBe(false)
    })
})

describe('countBidirectional', () => {
    it('counts each mutual pair exactly once', () => {
        expect(countBidirectional(EDGES)).toBe(1)
    })

    it('is zero for a purely directed graph', () => {
        expect(countBidirectional([edge(1, 2), edge(2, 3)])).toBe(0)
    })

    it('is zero for an empty edge list', () => {
        expect(countBidirectional([])).toBe(0)
    })
})

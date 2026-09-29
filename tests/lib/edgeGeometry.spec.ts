import { describe, it, expect } from 'vitest'
import {
    cardBorderPoint,
    parsePathPoints,
    reanchorEdgePath,
} from '../../src/lib/edgeGeometry'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'

/**
 * `lib/edgeGeometry.ts` — re-anchoring Mermaid's edges onto the cards.
 *
 * Mermaid sizes a node box from its *label* and routes every edge
 * endpoint to that box, so growing the rect to the 240 × 76 card
 * footprint afterwards (which `useMermaidRender` does, because the
 * layout maths needs the bigger box) leaves the arrows short of the
 * cards. These tests pin the geometry that closes that gap: an
 * endpoint walks out along the ray from its node's centre to the
 * card's border, carrying its control point so the curve stays smooth.
 */

/** The exact `d` Mermaid 10 emits for one `curveBasis` edge. */
const MERMAID_D =
    'M203.725,42L181.305,50C158.884,58,114.044,74,91.623,89.117' +
    'C69.203,104.233,69.203,118.467,69.203,125.583L69.203,132.7'

describe('parsePathPoints', () => {
    it('splits Mermaid\'s M/L/C path into command → point list', () => {
        expect(parsePathPoints(MERMAID_D)).toEqual([
            { command: 'M', points: [{ x: 203.725, y: 42 }] },
            { command: 'L', points: [{ x: 181.305, y: 50 }] },
            {
                command: 'C',
                points: [
                    { x: 158.884, y: 58 },
                    { x: 114.044, y: 74 },
                    { x: 91.623, y: 89.117 },
                ],
            },
            {
                command: 'C',
                points: [
                    { x: 69.203, y: 104.233 },
                    { x: 69.203, y: 118.467 },
                    { x: 69.203, y: 125.583 },
                ],
            },
            { command: 'L', points: [{ x: 69.203, y: 132.7 }] },
        ])
    })

    it('accepts space- and comma-separated coordinates equally', () => {
        expect(parsePathPoints('M 10 20 L 30 40')).toEqual(parsePathPoints('M10,20L30,40'))
    })

    it('normalises extra coordinate pairs after an M to implicit Ls (SVG rule)', () => {
        expect(parsePathPoints('M1,2 3,4')).toEqual([
            { command: 'M', points: [{ x: 1, y: 2 }] },
            { command: 'L', points: [{ x: 3, y: 4 }] },
        ])
    })

    it('handles exponent notation and leading dots', () => {
        expect(parsePathPoints('M1e2,.5')).toEqual([{ command: 'M', points: [{ x: 100, y: 0.5 }] }])
    })

    it('rejects a path whose command arity it cannot verify', () => {
        // Single-coordinate commands carry an ambiguous "point", and
        // guessing would move half the path.
        expect(parsePathPoints('M0,0H10')).toBeNull()
        expect(parsePathPoints('M0,0A1 1 0 0 1 10 10')).toBeNull()
        // An odd coordinate count is a malformed path.
        expect(parsePathPoints('M0,0L1')).toBeNull()
        // A C needs 3 points per repetition.
        expect(parsePathPoints('M0,0C1,1 2,2')).toBeNull()
        // Numbers before any command.
        expect(parsePathPoints('1,2L3,4')).toBeNull()
        // Nothing usable at all.
        expect(parsePathPoints('')).toBeNull()
    })
})

describe('cardBorderPoint', () => {
    const half = { w: NODE_CARD_WIDTH / 2, h: NODE_CARD_HEIGHT / 2 }

    it('lands on the near border along the ray from the centre', () => {
        // Straight down from the centre: the bottom edge, exactly.
        expect(cardBorderPoint({ x: 100, y: 100 }, { x: 100, y: 140 }, half.w, half.h))
            .toEqual({ x: 100, y: 100 + half.h })
    })

    it('lands on the left or right edge for a shallow ray', () => {
        // Far to the side and only slightly below: the ray leaves
        // through the vertical edge long before the horizontal one.
        const p = cardBorderPoint({ x: 0, y: 0 }, { x: 400, y: 5 }, half.w, half.h)
        expect(p.x).toBe(half.w)
        expect(p.y).toBeCloseTo(5 * (half.w / 400), 6)
    })

    it('handles a zero component without dividing by zero', () => {
        // A perfectly vertical ray: the x term is unbounded, so the y
        // edge decides. `Infinity` is the whole point of the guard.
        expect(cardBorderPoint({ x: 7, y: 7 }, { x: 7, y: 7 }, half.w, half.h))
            .toEqual({ x: 7, y: 7 })
        expect(cardBorderPoint({ x: 7, y: 7 }, { x: 7, y: 70 }, half.w, half.h))
            .toEqual({ x: 7, y: 7 + half.h })
    })

    it('re-aims a ray whose point already sits outside the card', () => {
        // A very long agent name makes Mermaid's label box wider than
        // the card, so its endpoint starts beyond the border. Pulling it
        // back to the border keeps the tangent and stays sane.
        const p = cardBorderPoint({ x: 0, y: 0 }, { x: 900, y: 0 }, half.w, half.h)
        expect(p).toEqual({ x: half.w, y: 0 })
    })
})

describe('reanchorEdgePath', () => {
    const halfW = NODE_CARD_WIDTH / 2
    const halfH = NODE_CARD_HEIGHT / 2
    // The measured node 11 / node 12 centres from the 4-node fixture.
    const source = { x: 262.578125, y: 21 }
    const target = { x: 69.203125, y: 159 }

    function endpoint(d: string): { first: { x: number; y: number }; last: { x: number; y: number } } {
        const segments = parsePathPoints(d)
        if (segments === null) throw new Error('unparseable')
        const points = segments.flatMap((s) => s.points)
        return { first: points[0]!, last: points[points.length - 1]! }
    }

    it('puts both endpoints exactly on the card borders', () => {
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)
        expect(out).not.toBeNull()
        const { first, last } = endpoint(out!)
        // Start: on the source card's bottom border (y = cy + halfH).
        expect(first.y).toBeCloseTo(source.y + halfH, 3)
        // End: on the target card's top border (y = cy - halfH).
        expect(last.y).toBeCloseTo(target.y - halfH, 3)
        // Both are vertical rays, so x follows the centre.
        expect(first.x).toBeLessThan(source.x)
        expect(last.x).toBeCloseTo(target.x, 3)
    })

    it('is idempotent — re-anchoring an anchored path moves nothing', () => {
        const once = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const twice = reanchorEdgePath(once, source, target, halfW, halfH)!
        expect(endpoint(twice)).toEqual(endpoint(once))
    })

    it('preserves the start and end tangents (the curve stays smooth)', () => {
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const before = parsePathPoints(MERMAID_D)!
        const after = parsePathPoints(out)!
        const flatBefore = before.flatMap((s) => s.points)
        const flatAfter = after.flatMap((s) => s.points)
        // The endpoint moved by `delta`; the first control point moved
        // by the same `delta`, so the vector between them is unchanged.
        const d0 = {
            x: flatAfter[1]!.x - flatAfter[0]!.x,
            y: flatAfter[1]!.y - flatAfter[0]!.y,
        }
        const b0 = {
            x: flatBefore[1]!.x - flatBefore[0]!.x,
            y: flatBefore[1]!.y - flatBefore[0]!.y,
        }
        expect(d0.x).toBeCloseTo(b0.x, 3)
        expect(d0.y).toBeCloseTo(b0.y, 3)
        // Same at the end, in reverse.
        const n = flatAfter.length
        const d1 = {
            x: flatAfter[n - 2]!.x - flatAfter[n - 1]!.x,
            y: flatAfter[n - 2]!.y - flatAfter[n - 1]!.y,
        }
        const b1 = {
            x: flatBefore[n - 2]!.x - flatBefore[n - 1]!.x,
            y: flatBefore[n - 2]!.y - flatBefore[n - 1]!.y,
        }
        expect(d1.x).toBeCloseTo(b1.x, 3)
        expect(d1.y).toBeCloseTo(b1.y, 3)
    })

    it('never lets the end handle overshoot its neighbour into a loop', () => {
        // A short path: the endpoint has to travel a long way, more
        // than its own control handle. Without the clamp the control
        // point lands past the previous point and the segment doubles
        // back on itself.
        const short = 'M100,50L120,70'
        const out = reanchorEdgePath(short, { x: 100, y: 50 }, { x: 500, y: 50 }, halfW, halfH)
        expect(out).not.toBeNull()
        const points = parsePathPoints(out!)!.flatMap((s) => s.points)
        // x must increase monotonically along the path.
        expect(points[1]!.x).toBeGreaterThan(points[0]!.x)
        expect(points[0]!.x).toBeLessThanOrEqual(100 + halfW)
    })

    it('leaves the middle of the curve untouched', () => {
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const before = parsePathPoints(MERMAID_D)!.flatMap((s) => s.points)
        const after = parsePathPoints(out)!.flatMap((s) => s.points)
        expect(after).toHaveLength(before.length)
        for (let i = 2; i < after.length - 2; i++) {
            expect(after[i]).toEqual(before[i])
        }
    })

    it('clamps a start handle that would overshoot the next on-curve point', () => {
        /*
         * A path that doubles back: the start handle is 262 px long, but
         * the next on-curve point sits 11 px from the new endpoint.
         * Without the clamp the control point would land far past that
         * point and the segment would loop.
         */
        // Two cubics, so there is a middle *on-curve* point to clamp
        // against: the path doubles straight back past the new endpoint.
        const doubling = 'M10,20L200,200C210,210 20,30 30,40C40,50 50,60 60,70'
        const out = reanchorEdgePath(doubling, { x: 0, y: 0 }, { x: 0, y: 300 }, halfW, halfH)
        expect(out).not.toBeNull()
        const points = parsePathPoints(out!)!.flatMap((s) => s.points)
        const start = points[0] as { x: number; y: number }
        const handle = points[1] as { x: number; y: number }
        const nextOnCurve = points[4] as { x: number; y: number }
        // The handle now stops exactly at the next on-curve point…
        const handleLen = Math.hypot(handle.x - start.x, handle.y - start.y)
        const room = Math.hypot(nextOnCurve.x - start.x, nextOnCurve.y - start.y)
        expect(handleLen).toBeCloseTo(room, 3)
        // …where the unclamped handle was 262 px long.
        expect(handleLen).toBeLessThan(262)
        // The tangent is still the original one, just shorter.
        expect(handle.x - start.x).toBeCloseTo(190 * (room / Math.hypot(190, 180)), 2)
        expect(handle.y - start.y).toBeCloseTo(180 * (room / Math.hypot(190, 180)), 2)
    })

    it('returns null for a path it cannot parse, so the attribute is left alone', () => {
        expect(reanchorEdgePath('', source, target, halfW, halfH)).toBeNull()
        expect(reanchorEdgePath('M0,0H10', source, target, halfW, halfH)).toBeNull()
    })
})

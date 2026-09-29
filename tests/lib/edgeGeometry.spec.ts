import { describe, it, expect } from 'vitest'
import {
    ARROWHEAD_OVERSHOOT,
    cardBorderPoint,
    parsePathPoints,
    reanchorEdgePath,
} from '../../src/lib/edgeGeometry'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'

/**
 * `lib/edgeGeometry.ts` — re-anchoring Mermaid's edges onto the cards.
 *
 * Mermaid sizes a node box from its *label* and routes every edge
 * endpoint to that box, so growing the rect to the card footprint
 * afterwards (which `useMermaidRender` does, because the layout maths
 * needs the bigger box) leaves the arrows short of the cards. These
 * tests pin the geometry that closes that gap: an endpoint walks out
 * along the ray from its node's centre to the card's border, carrying
 * its control point so the curve stays smooth.
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
        // Single-axis commands carry one coordinate, and `A` carries two
        // radii, an angle and two flags between its endpoint's pair.
        // Neither is an x/y pair, so a pair-based arity table cannot split
        // them without guessing — and a guess here moves half the path.
        expect(parsePathPoints('M0,0H10')).toBeNull()
        expect(parsePathPoints('M0,0V10')).toBeNull()
        expect(parsePathPoints('M0,0A1 1 0 0 1 10 10')).toBeNull()
        // An odd coordinate count is a malformed path.
        expect(parsePathPoints('M0,0L1')).toBeNull()
        // A C needs 3 points per repetition.
        expect(parsePathPoints('M0,0C1,1 2,2')).toBeNull()
        // A S or a Q needs 2.
        expect(parsePathPoints('M0,0S1,1')).toBeNull()
        // Numbers before any command.
        expect(parsePathPoints('1,2L3,4')).toBeNull()
        // Nothing usable at all.
        expect(parsePathPoints('')).toBeNull()
    })

    it('reads the commands whose arity is a whole number of x/y pairs', () => {
        // The table this module's anchoring is built on, one case each.
        // `S` and `Q` are the two-point curve commands the dagre router
        // does not emit but which share `C`'s "handles then vertex"
        // shape; `T` is a vertex whose control point is implicit, so it
        // has nothing to move; `Z` carries no coordinates at all.
        expect(parsePathPoints('M0,0S10,10 20,20')).toEqual([
            { command: 'M', points: [{ x: 0, y: 0 }] },
            { command: 'S', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
        ])
        expect(parsePathPoints('M0,0Q10,10 20,20')).toEqual([
            { command: 'M', points: [{ x: 0, y: 0 }] },
            { command: 'Q', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
        ])
        expect(parsePathPoints('M0,0T20,20')).toEqual([
            { command: 'M', points: [{ x: 0, y: 0 }] },
            { command: 'T', points: [{ x: 20, y: 20 }] },
        ])
        // `Z` with coordinates after it is malformed; on its own it is a
        // no-op the re-anchorer steps over.
        expect(parsePathPoints('M0,0L10,10Z')).toEqual([
            { command: 'M', points: [{ x: 0, y: 0 }] },
            { command: 'L', points: [{ x: 10, y: 10 }] },
            { command: 'Z', points: [] },
        ])
        expect(parsePathPoints('M0,0Z5,5')).toBeNull()
    })

    it('rejects a relative command, whose coordinates are deltas rather than positions', () => {
        // A lowercase letter means every coordinate after it is relative
        // to the current point, so "move the first curve's head handle by
        // this delta" stops meaning anything.
        expect(parsePathPoints('m0,0l10,10')).toBeNull()
        expect(parsePathPoints('M0,0c1,1 2,2 3,3')).toBeNull()
        expect(parsePathPoints('M0,0L10,10z')).toBeNull()
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

    function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.hypot(a.x - b.x, a.y - b.y)
    }

    /** Shortest distance from a point to a card's outline, at the shipped footprint. */
    function distanceToBorderLocal(p: { x: number; y: number }, centre: { x: number; y: number }): number {
        const dx = Math.abs(p.x - centre.x)
        const dy = Math.abs(p.y - centre.y)
        if (dx <= halfW && dy <= halfH) return Math.min(halfW - dx, halfH - dy)
        return Math.hypot(Math.max(dx - halfW, 0), Math.max(dy - halfH, 0))
    }

    /**
     * Where Mermaid's `pointEnd` marker paints its tip, given a flat point
     * list: `overshoot` units past the end, along the path's own direction
     * of travel there.
     */
    function tipOfLocal(points: Array<{ x: number; y: number }>, overshoot: number): { x: number; y: number } {
        const last = points[points.length - 1] as { x: number; y: number }
        const previous = points[points.length - 2] as { x: number; y: number }
        const length = Math.hypot(last.x - previous.x, last.y - previous.y)
        if (length === 0) return { ...last }
        return {
            x: last.x + (overshoot * (last.x - previous.x)) / length,
            y: last.y + (overshoot * (last.y - previous.y)) / length,
        }
    }

    /**
     * The node centre dagre would have placed so that `edge` leaves the
     * box at `exit` heading for `next` — i.e. `intersectRect()` walked
     * back along that direction by the label box's half-extent, nearer
     * side first. Building the synthetic fixtures' centres this way is
     * what makes the premise of the whole module true for them: the ray
     * the endpoint is walked out along *is* the path's own direction.
     */
    function dagreCentre(edge: { x: number; y: number }, next: { x: number; y: number }): { x: number; y: number } {
        const length = dist(edge, next)
        const dx = (next.x - edge.x) / length
        const dy = (next.y - edge.y) / length
        const t = Math.min(67.9 / Math.abs(dx), 21 / Math.abs(dy))
        return { x: edge.x - dx * t, y: edge.y - dy * t }
    }

    /**
     * Sine of the angle between two rays, `p0 → p1` and `q0 → q1`. 0 when
     * they are parallel. Normalised, so the 3-decimal precision the
     * serialiser writes at shows up as an angle rather than as an
     * area-scaled number.
     */
    function cross(
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        q0: { x: number; y: number },
        q1: { x: number; y: number },
    ): number {
        const a = { x: p1.x - p0.x, y: p1.y - p0.y }
        const b = { x: q1.x - q0.x, y: q1.y - q0.y }
        const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
        if (length === 0) return 0
        return (a.x * b.y - a.y * b.x) / length
    }

    it('puts the start endpoint exactly on the card border', () => {
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)
        expect(out).not.toBeNull()
        const { first, last } = endpoint(out!)
        // Start: on the source card's border, 0.000 px outside it.
        //
        // Measured against the *rect*, not against "x is half a card to
        // the left OR y is half a card below": the ray from this centre
        // through the path's first point leaves through the vertical edge
        // at `halfH = 38` and through the left edge at
        // `halfH = 57.5` (the taller card), so an axis-wise assertion
        // would be silently describing whichever edge the current
        // footprint happens to pick.
        const onBorder = (p: { x: number; y: number }, c: { x: number; y: number }): number => {
            const dx = Math.abs(p.x - c.x)
            const dy = Math.abs(p.y - c.y)
            if (dx <= halfW && dy <= halfH) return Math.min(halfW - dx, halfH - dy)
            return Math.hypot(Math.max(dx - halfW, 0), Math.max(dy - halfH, 0))
        }
        expect(onBorder(first, source)).toBeCloseTo(0, 3)
        // …and it is on the *source's* border, not the target's: these
        // two centres are 138 apart and the card is 88.2 tall, so they
        // cannot be the same box.
        expect(onBorder(first, target)).toBeGreaterThan(0)
        expect(last.x).toBeCloseTo(target.x, 3)
    })

    /**
     * The end endpoint is *not* on the border — that is the whole point
     * of the overshoot. These are the numbers measured on the rendered
     * dev fixture, where the un-inset path ended on the border and its
     * arrowhead tip landed 4.8 units inside the target card.
     */
    it('stops the end endpoint short by the arrowhead overshoot', () => {
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const { last } = endpoint(out)
        // The ray here is vertical, so the end tangent is (0, 1) and the
        // tip is `overshoot` further down. The border is at
        // `target.y - halfH`; the endpoint must be that far above it.
        expect(last.y).toBeCloseTo(target.y - halfH - ARROWHEAD_OVERSHOOT, 3)
    })

    it('insets along the end tangent, not along a fixed axis (diagonal edge)', () => {
        /*
         * A 45° edge. The marker is `orient="auto"`, so it is rotated
         * onto the path's own direction; the overshoot has to be
         * subtracted along *that* vector. Subtracting it vertically (or
         * horizontally) would leave the tip off the card by up to
         * `overshoot * sin(45°) = 3.39` units.
         */
        const d = 'M600,100C500,100 200,100 100,200'
        const tgt = { x: 0, y: 300 }
        const out = reanchorEdgePath(d, { x: 700, y: 100 }, tgt, halfW, halfH)!
        const { last } = endpoint(out)
        // The end tangent is (0,1) - (0,100) normalised = (0,1)...
        // actually (-100,100) normalised = (-0.7071, 0.7071).
        const border = cardBorderPoint(tgt, last, halfW, halfH)
        // Walking back along the tangent by the overshoot must put the
        // tip exactly on the border, in the *tangent* direction.
        const tip = {
            x: last.x + ARROWHEAD_OVERSHOOT * -Math.SQRT1_2,
            y: last.y + ARROWHEAD_OVERSHOOT * Math.SQRT1_2,
        }
        expect(Math.hypot(tip.x - border.x, tip.y - border.y)).toBeLessThan(0.01)
        // And the endpoint is genuinely *short* of the border.
        expect(Math.hypot(last.x - border.x, last.y - border.y)).toBeCloseTo(ARROWHEAD_OVERSHOOT, 3)
    })

    it('applies no inset at all when endOvershoot is 0 (no end marker)', () => {
        // An edge with no arrowhead — `mermaidSource.ts` only ever emits
        // `-->`, but the geometry must degrade to "path end on the
        // border" rather than silently short by 4.8.
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH, 0)!
        const { last } = endpoint(out)
        expect(last.y).toBeCloseTo(target.y - halfH, 3)
    })

    it('leaves a two-point path with no measurable tangent un-inset', () => {
        // `endTangent` returns (0,0) for fewer than two points and for
        // coincident last two points; the inset is then a no-op rather
        // than a NaN or a random direction.
        const single = 'M100,50'
        const a = reanchorEdgePath(single, { x: 100, y: 50 }, { x: 500, y: 50 }, halfW, halfH)
        const b = reanchorEdgePath(single, { x: 100, y: 50 }, { x: 500, y: 50 }, halfW, halfH, 0)
        expect(a).toBe(b)
        expect(endpoint(a!)).toEqual(endpoint(b!))

        // Same guard, reached through a path whose last two points
        // coincide: the tangent length is 0, so there is no direction to
        // inset along and the endpoint stays on the border.
        const degenerate = 'M100,50L200,100L200,100'
        const c = reanchorEdgePath(degenerate, { x: 100, y: 50 }, { x: 400, y: 100 }, halfW, halfH)!
        const d = reanchorEdgePath(degenerate, { x: 100, y: 50 }, { x: 400, y: 100 }, halfW, halfH, 0)!
        expect(endpoint(c)).toEqual(endpoint(d))
    })

    it('is idempotent — re-anchoring an anchored path moves nothing', () => {
        const once = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const twice = reanchorEdgePath(once, source, target, halfW, halfH)!
        // The overshoot is a property of the marker, not of the current
        // path, so re-anchoring must not stack a second 4.8 on top: the
        // ray from the target centre through the already-shortened end
        // still crosses the same border, and the same inset is applied.
        const one = endpoint(once)
        const two = endpoint(twice)
        expect(two.last.x).toBeCloseTo(one.last.x, 3)
        expect(two.last.y).toBeCloseTo(one.last.y, 3)
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

    it('translates the two runs rigidly, rescales the two straddling handles, and leaves the vertex between them alone', () => {
        /*
         * The exact edit, stated on this one path. `MERMAID_D` is
         * `M exit L lead-in C … C … L entry`, so its nine points are
         * `[exit, lead-in, c1, c2, v1, c1', c2', v2, entry]`, and the
         * re-anchoring does four things and no more:
         *
         *   - `0‥2` — the start endpoint, the lead-in vertex and the
         *     first cubic's head control point — translate **rigidly** by
         *     the source border walk-out. All three lie at or before the
         *     new start point along the path's departure direction, so
         *     they slide along the line they were already on.
         *   - `3` — the first cubic's *tail* control point — is rescaled
         *     about its own vertex `4`, because the run moved that
         *     vertex's neighbour and the segment is now shorter. Its
         *     direction from the vertex is unchanged.
         *   - `5` — the last cubic's *head* control point — is rescaled
         *     about its anchor `4` for the same reason at the other end.
         *   - `6‥8` — the last cubic's tail control point, its vertex and
         *     the end point — translate **rigidly** by the target border
         *     walk-out.
         *
         * `4` is dagre's, and comes out byte-identical. Its two joins are
         * tangent-continuous because each side's *adjacent* handle kept
         * its direction, which is the whole point.
         *
         * The old version of this test looped `2 … n - 3` and would have
         * caught *nothing* on a real path: it assumed the point at index
         * 2 was already past the reach of the endpoint's move, which on
         * this shape it is not.
         */
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const firstAfter = endpoint(out).first
        const before = parsePathPoints(MERMAID_D)!.flatMap((s) => s.points)
        const after = parsePathPoints(out)!.flatMap((s) => s.points)
        expect(after).toHaveLength(before.length)
        const at = (points: Array<{ x: number; y: number }>, i: number): { x: number; y: number } =>
            points[i] as { x: number; y: number }
        // The one point dagre owns outright.
        expect(after[4]).toEqual(before[4])
        // Each run translates as a unit.
        const delta = (i: number): { x: number; y: number } => ({
            x: at(after, i).x - at(before, i).x,
            y: at(after, i).y - at(before, i).y,
        })
        expect(delta(1).x).toBeCloseTo(delta(0).x, 3)
        expect(delta(1).y).toBeCloseTo(delta(0).y, 3)
        expect(delta(7).x).toBeCloseTo(delta(8).x, 3)
        expect(delta(7).y).toBeCloseTo(delta(8).y, 3)
        // The two rescaled handles stay on the ray they were drawn on, so
        // the tangents at the untouched vertex are exactly dagre's.
        expect(Math.abs(cross(at(after, 3), at(after, 4), at(before, 3), at(before, 4))), 'c2 ray').toBeLessThan(1e-3)
        expect(Math.abs(cross(at(after, 5), at(after, 4), at(before, 5), at(before, 4))), "c1' ray").toBeLessThan(1e-3)
        // …and they got shorter, not longer, because the segment did.
        expect(dist(at(after, 3), at(after, 4))).toBeLessThan(dist(at(before, 3), at(before, 4)))
        expect(dist(at(after, 5), at(after, 4))).toBeLessThan(dist(at(before, 5), at(before, 4)))
        // The start delta is the source border walk-out, and the endpoint
        // ends up exactly one arrowhead short of the target border: this
        // edge is vertical, so the tangent and the border's normal are the
        // same line.
        expect(delta(0).x).toBeCloseTo(firstAfter.x - 203.725, 3)
        expect(delta(0).y).toBeCloseTo(firstAfter.y - 42, 3)
        expect(endpoint(out).last.y).toBeCloseTo(target.y - halfH - ARROWHEAD_OVERSHOOT, 3)
    })

    it('clamps a start handle that would overshoot its own vertex', () => {
        /*
         * A path whose label box is far smaller than the card, so the
         * start endpoint travels 52.5 units and drags the first cubic's
         * head control point with it. The handle was 30 units long; the
         * room left between its (moved) anchor and the segment's own
         * vertex is 7.5, so the clamp has to bite or the segment loops.
         *
         * The handle is found through the command table — index 2 is the
         * first `C`'s *head control point*, not "the point after the
         * endpoint" — and it is measured from the lead-in vertex it hangs
         * off, not from the endpoint. Its direction is preserved, so the
         * tangent the card is met at is still the tangent dagre drew.
         *
         * `tests/lib/edgeGeometryCorpus.spec.ts` proves the same clamp on
         * ten real Mermaid paths, from the `short-names` graph.
         */
        const narrowLabelBox = 'M0,5L0,10C0,40 0,55 0,70L0,600'
        const out = reanchorEdgePath(narrowLabelBox, { x: 0, y: 0 }, { x: 0, y: 700 }, halfW, halfH)
        expect(out).not.toBeNull()
        const points = parsePathPoints(out!)!.flatMap((s) => s.points)
        const anchor = points[1] as { x: number; y: number }
        const handle = points[2] as { x: number; y: number }
        const vertex = points[4] as { x: number; y: number }
        // The handle now stops exactly at its own repetition's vertex…
        const handleLen = Math.hypot(handle.x - anchor.x, handle.y - anchor.y)
        const room = Math.hypot(vertex.x - anchor.x, vertex.y - anchor.y)
        expect(handleLen).toBeCloseTo(room, 3)
        // …where it was 30 units long to begin with.
        expect(handleLen).toBeLessThan(30)
        // The tangent is still the original one, just shorter: the handle
        // still points from the lead-in vertex straight down.
        expect(handle.x - anchor.x).toBeCloseTo(0, 3)
        expect(handle.y - anchor.y).toBeCloseTo(handleLen, 3)
        // The endpoint is where the card border is, not where the run
        // stopped: the run reached the card, the clamp only kept the
        // segment from folding.
        expect(points[0]).toEqual({ x: 0, y: halfH })
    })

    it('returns null for a path it cannot parse, so the attribute is left alone', () => {
        expect(reanchorEdgePath('', source, target, halfW, halfH)).toBeNull()
        expect(reanchorEdgePath('M0,0H10', source, target, halfW, halfH)).toBeNull()
        // A relative path: every coordinate is a delta, so there is no
        // vertex to walk a ray out from.
        expect(reanchorEdgePath('m0,0l10,10', source, target, halfW, halfH)).toBeNull()
        // A path that does not open with `M` has no endpoint for the ray
        // to start from, even though it parses.
        expect(reanchorEdgePath('L10,10L20,20', source, target, halfW, halfH)).toBeNull()
    })

    it('anchors a lone S segment, whose one control point governs both of its ends', () => {
        /*
         * `M … S c e` is the degenerate case the run logic has to reason
         * about: there is a single control point, so it hangs off the
         * path's own start *and* leads into its own end. Deltas are
         * accumulated per point before any of them is applied, so when
         * both runs reach that one point it receives both — which is what
         * preserving both tangents requires.
         *
         * On a path long enough for the geometry to be sane that cannot
         * happen: the two border walks are 36.5 and 62.3 units here, and
         * a single interior point is only in *both* runs if the whole
         * path is shorter than their sum — at which point the segment is
         * crushed and the clamp does its job instead. So what is asserted
         * is the invariant that actually has to hold either way: the
         * handle never ends up past the vertex it leads into.
         *
         * The centres are built the way dagre builds them, so the two
         * border walks are along the path and the tangents are the ones
         * Mermaid drew. Mermaid's router only ever emits `L` and `C`, so
         * this is a table-completeness case rather than one it can
         * produce — but the table has to be right for the commands it
         * claims, and `S` is one of them.
         */
        const p0 = { x: 600, y: 20 }
        const control = { x: 700, y: 120 }
        const p2 = { x: 800, y: 220 }
        const d = `M${p0.x},${p0.y}S${control.x},${control.y} ${p2.x},${p2.y}`
        const from = dagreCentre(p0, control)
        const to = dagreCentre(p2, control)
        const out = reanchorEdgePath(d, from, to, halfW, halfH)
        expect(out).not.toBeNull()
        const points = parsePathPoints(out!)!.flatMap((s) => s.points)
        expect(parsePathPoints(out!)!.map((s) => s.command)).toEqual(['M', 'S'])
        expect(points).toHaveLength(3)
        // The start is on the source card's border and the arrowhead tip
        // is on the target's.
        expect(distanceToBorderLocal(points[0]!, from)).toBeCloseTo(0, 3)
        expect(distanceToBorderLocal(tipOfLocal(points, ARROWHEAD_OVERSHOOT), to)).toBeCloseTo(0, 3)
        // The handle does not overshoot the vertex it leads into.
        expect(dist(points[1]!, points[2]!)).toBeLessThan(dist(points[0]!, points[2]!) + 1e-6)
    })
    it('steps over a trailing Z, which carries no coordinate to move', () => {
        // `Z` closes the path with a straight line back to the start, so
        // its own start vertex is not the path's end and nothing about it
        // may be re-aimed at a card.
        const p0 = { x: 600, y: 20 }
        const middle = { x: 700, y: 80 }
        const p2 = { x: 800, y: 140 }
        const d = `M${p0.x},${p0.y}L${middle.x},${middle.y}L${p2.x},${p2.y}Z`
        const from = dagreCentre(p0, middle)
        const to = dagreCentre(p2, middle)
        const out = reanchorEdgePath(d, from, to, halfW, halfH)
        expect(out).not.toBeNull()
        expect(parsePathPoints(out!)!.map((s) => s.command)).toEqual(['M', 'L', 'L', 'Z'])
        const points = parsePathPoints(out!)!.flatMap((s) => s.points)
        // `Z` contributes no point, so the flat list is still the three
        // on-curve vertices.
        expect(points).toHaveLength(3)
        expect(distanceToBorderLocal(points[0]!, from)).toBeCloseTo(0, 3)
        expect(distanceToBorderLocal(tipOfLocal(points, ARROWHEAD_OVERSHOOT), to)).toBeCloseTo(0, 3)
    })
})

/**
 * The coupling this file exists for.
 *
 * The card's box is described in **three** places that all have to
 * agree, and two of the three earlier regressions on this canvas came
 * from them disagreeing:
 *
 *   - `useMermaidRender` grows each `g.node` rect to the footprint, so
 *     dagre's spacing reserves room for the card and `getBBox()` (and
 *     therefore the `viewBox`) encloses it;
 *   - `edgeGeometry.reanchorEdgePath` walks each endpoint onto that same
 *     box's border;
 *   - `AgentNodeCard` paints it, from the same constants.
 *
 * Nothing at runtime can catch a drift between the first two — they
 * are separate passes over separate data, and a mismatch does not throw,
 * it just draws an arrowhead in the gap. So it is asserted here, at the
 * one level where all the numbers are known: re-anchor a real
 * `curveBasis` path with the shipped constants and measure where the
 * **tip** (not the path end) lands against the very rect
 * `useMermaidRender` writes.
 */
describe('the arrowhead tip lands on the card box, at the shipped footprint', () => {
    const halfW = NODE_CARD_WIDTH / 2
    const halfH = NODE_CARD_HEIGHT / 2

    /** The rect `useMermaidRender.renderInto` writes on every `g.node`. */
    const cardRect = { x: -halfW, y: -halfH, w: NODE_CARD_WIDTH, h: NODE_CARD_HEIGHT }

    /**
     * Shortest distance from a point to the card's **outline** — 0 on the
     * border, and the gap to the nearest edge when the point is inside.
     *
     * Not the distance to the *filled* box (which is 0 for anything
     * inside, and so would call a path end 4.8 units short of the border
     * "on" it), and not an axis-wise "is |dx| half the width?" (which
     * reads a diagonal endpoint as on the border the moment one of its
     * two components happens to match).
     */
    function distanceToBorder(p: { x: number; y: number }): number {
        const halfW = NODE_CARD_WIDTH / 2
        const halfH = NODE_CARD_HEIGHT / 2
        const ax = Math.abs(p.x)
        const ay = Math.abs(p.y)
        if (ax <= halfW && ay <= halfH) return Math.min(halfW - ax, halfH - ay)
        return Math.hypot(Math.max(ax - halfW, 0), Math.max(ay - halfH, 0))
    }

    function endOf(d: string): { first: { x: number; y: number }; last: { x: number; y: number }; unit: { x: number; y: number } } {
        const points = parsePathPoints(d)!.flatMap((s) => s.points)
        const first = points[0]!
        const last = points[points.length - 1]!
        const prev = points[points.length - 2]!
        const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1
        return { first, last, unit: { x: (last.x - prev.x) / len, y: (last.y - prev.y) / len } }
    }

    /**
     * The dagre layout of the 7-agent dev graph at the shipped footprint:
     * the sources sit in the top rank, the targets in the one below, and
     * the four sub-edges of each source fan out sideways.
     *
     * Each `d` is written so its own first point sits on the ray from its
     * source centre and its last point on the ray into its target — the
     * same relationship Mermaid's router produces, and the one
     * `reanchorEdgePath` relies on.
     *
     * **These are hand-written `M … C …` single-cubic shapes, which the
     * shipped `curve: 'basis'` never emits** — dagre + `curveBasis`
     * produces `M … L … C … C … L …` (see
     * `tests/lib/edgeGeometryCorpus.spec.ts` for 132 real ones). They are
     * kept here because they isolate the *geometry* from any routing
     * detail, but they have a property the real shapes do not: on a
     * single cubic the start endpoint's move drags the curve's first
     * control point with it, so re-anchoring *rotates* the end tangent
     * instead of merely sliding it. The overshoot is walked along that
     * re-aimed tangent, so the tip lands on the border to within the
     * tangent's tilt rather than exactly. Hence the bound below; the
     * shipped curve is asserted exact on all 33 real `basis` paths.
     */
    const topRankY = 21
    const bottomRankY = 21 + NODE_CARD_HEIGHT + 20 + NODE_CARD_HEIGHT
    const straightDown = (x: number): string =>
        `M${x - 40},${topRankY + 21}C${x - 40},${topRankY + 60} ${x - 40},${bottomRankY - 60} ${x - 40},${bottomRankY - 40}`
    const fan = (from: number, to: number): string => {
        const y0 = topRankY + 21
        const y1 = bottomRankY - 40
        return `M${from},${y0}C${from},${y0 + 40} ${to},${y1 - 40} ${to},${y1}`
    }
    const cases: Array<{ name: string; src: { x: number; y: number }; tgt: { x: number; y: number }; d: string }> = [
        {
            name: 'straight down (two ranks apart)',
            src: { x: 620.578125, y: topRankY },
            tgt: { x: 620.578125, y: bottomRankY },
            d: straightDown(620.578125),
        },
        {
            name: 'diagonal, down and to the left',
            src: { x: 1035.6171875, y: topRankY },
            tgt: { x: 640.0, y: bottomRankY },
            d: fan(1035.6171875, 640.0),
        },
        {
            name: 'diagonal, down and to the right',
            src: { x: 205.6171875, y: topRankY },
            tgt: { x: 601.2, y: bottomRankY },
            d: fan(205.6171875, 601.2),
        },
        {
            name: 'sideways within a rank (nodesep, not ranksep)',
            src: { x: 300, y: topRankY },
            tgt: { x: 300 + NODE_CARD_WIDTH + 20, y: topRankY },
            // The path's own endpoints are *offset* from the node centres,
            // the way Mermaid's router leaves them: `cardBorderPoint`
            // walks the ray from the centre through the endpoint, so an
            // endpoint sitting exactly on its own centre has no ray and
            // degenerates to the centre itself.
            d: `M260,${topRankY}C340,${topRankY} ${300 + NODE_CARD_WIDTH},${topRankY} ${300 + NODE_CARD_WIDTH + 50},${topRankY}`,
        },
    ]

    for (const { name, src, tgt, d } of cases) {
        it(`puts the tip on the border for an edge that runs ${name}`, () => {
            const out = reanchorEdgePath(d, src, tgt, halfW, halfH)!
            const { first, last, unit } = endOf(out)
            // The start point is not compensated (Mermaid emits no
            // `marker-start`), so it sits on the source border.
            expect(distanceToBorder({ x: first.x - src.x, y: first.y - src.y })).toBeCloseTo(0, 3)
            // The path end is one arrowhead short of it, along the
            // direction the marker is actually drawn.
            const tip = { x: last.x + ARROWHEAD_OVERSHOOT * unit.x, y: last.y + ARROWHEAD_OVERSHOOT * unit.y }
            // The tip is ON the border — not floating in the gap between
            // the boxes, and not buried under the opaque card where it
            // would read as a clipped arrowhead. On a single cubic the
            // overshoot is walked along a tangent the start move has
            // already tilted, so the bound is the tilt rather than zero
            // (see the note above; the shipped `basis` is asserted exact
            // on 33 real paths in `edgeGeometryCorpus.spec.ts`).
            expect(Math.abs(distanceToBorder({ x: tip.x - tgt.x, y: tip.y - tgt.y }))).toBeLessThanOrEqual(0.5)
            // …and the path end really is one arrowhead short of it.
            expect(distanceToBorder({ x: last.x - tgt.x, y: last.y - tgt.y })).toBeCloseTo(ARROWHEAD_OVERSHOOT, 3)
        })
    }

    it('grows the node rect to exactly the box the endpoints are aimed at', () => {
        // The two passes in `useMermaidRender`, asserted as one: the rect
        // it writes and the half-extents it hands `reanchorEdgePath` are
        // the same numbers, and the border the ray leaves from is one of
        // that rect's own four edges. 88.2 = 1.5×2 border + 9×2 padding +
        // 44 tile + 4 row gap + 19.2 one-line status row.
        expect(cardRect).toEqual({ x: -halfW, y: -halfH, w: NODE_CARD_WIDTH, h: NODE_CARD_HEIGHT })
        const c = { x: 500, y: 500 }
        // Straight up → the top edge; straight left → the left edge.
        expect(cardBorderPoint(c, { x: 500, y: 200 }, halfW, halfH)).toEqual({ x: 500, y: 500 - halfH })
        expect(cardBorderPoint(c, { x: 200, y: 500 }, halfW, halfH)).toEqual({ x: 500 - halfW, y: 500 })
        // A shallow ray leaves through the vertical edge, but not at the
        // centre's height — which is the case an axis-wise "is it at half
        // the width?" check would accept without ever looking at y.
        const shallow = cardBorderPoint(c, { x: 0, y: 495 }, halfW, halfH)
        expect(shallow.x).toBe(500 - halfW)
        expect(shallow.y).not.toBeCloseTo(500, 3)
        // t = halfW / 500 = 0.24, so the ray has covered 24 % of its dy.
        expect(shallow.y).toBeCloseTo(500 - 5 * (halfW / 500), 3)
    })
})

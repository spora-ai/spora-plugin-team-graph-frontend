import { describe, it, expect } from 'vitest'
import {
    ARROWHEAD_OVERSHOOT,
    cardBorderPoint,
    parsePathPoints,
    reanchorEdgePath,
} from '../../src/lib/edgeGeometry'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'
import { turnAngles } from '../fixtures/pathMetrics'

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

    it('preserves the direction the path leaves the card and arrives by (C1 at both ends)', () => {
        /*
         * The invariant, on the quantity that is actually invariant.
         *
         * The path used to be rewritten by translating a run of points,
         * so the *length* of its first and last legs survived as well as
         * their direction — and the test could compare the raw vectors. It
         * is now re-emitted from d3's own formulas with a different exit
         * point, so the lead-in is a different length (it spans one sixth
         * of a different `q₀ → q₁`) while its **direction** is exactly
         * dagre's. Direction is the whole of "smooth" here: a lead-in at
         * a different angle is a visible kink at the card border, and one
         * at the same angle is not, whatever its length.
         *
         * It is preserved *because* `q₀` slides along the line `q₁` was
         * already on. d3's router put the source centre, `q₀` and `q₁`
         * on one line (its entry is `intersectNode(tail, points[0])`, the
         * intersection of that ray with the label box), and
         * `cardBorderPoint` walks `q₀` out along the same ray. The
         * collinearity is asserted first, because the invariant is
         * conditional on it and would otherwise be a coincidence.
         */
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const before = parsePathPoints(MERMAID_D)!.flatMap((s) => s.points)
        const after = parsePathPoints(out)!.flatMap((s) => s.points)

        /** 2·a − b: d3's two controls invert exactly to their two spline points. */
        const reflect = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: 2 * a.x - b.x,
            y: 2 * a.y - b.y,
        })
        const q0 = before[0]!
        const q1 = reflect(before[3]!, before[2]!)
        const q2 = before[before.length - 1]!
        // Collinearity the re-anchoring relies on, to 1 part in 10³ of
        // the slope. `MERMAID_D` is a three-decimal hand transcription of
        // a Mermaid path, so the three points are collinear only to the
        // `d`'s own precision; the real paths in the corpus are
        // collinear to the same bound. The invariant is conditional on
        // this, and asserting it is what stops the direction claim above
        // being a coincidence of this one fixture.
        const slope = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.x - a.x) / (b.y - a.y)
        expect(slope(q0, q1)).toBeCloseTo(slope(source, q0), 3)
        expect(slope(q1, q2)).toBeCloseTo(slope(target, q2), 3)

        /** Direction of the path's first / last leg, as a unit vector. */
        const dir = (
            from: { x: number; y: number },
            to: { x: number; y: number },
        ): { x: number; y: number } => {
            const dx = to.x - from.x
            const dy = to.y - from.y
            const length = Math.hypot(dx, dy)
            return { x: dx / length, y: dy / length }
        }
        // Leaving the card, and arriving by it. The bound is a
        // thousandth of a unit of direction, not a millionth, because
        // Mermaid's own `d` carries three decimals: the three points are
        // collinear only to their own rounding, which over a 78-unit leg
        // is 0.0002 units of lateral slack. That is four orders of
        // magnitude below the 180° fold the first regression produced.
        expect(dir(after[0]!, after[1]!).x).toBeCloseTo(dir(before[0]!, before[1]!).x, 3)
        expect(dir(after[0]!, after[1]!).y).toBeCloseTo(dir(before[0]!, before[1]!).y, 3)
        const n = after.length
        expect(dir(after[n - 2]!, after[n - 1]!).x).toBeCloseTo(dir(before[n - 2]!, before[n - 1]!).x, 3)
        expect(dir(after[n - 2]!, after[n - 1]!).y).toBeCloseTo(dir(before[n - 2]!, before[n - 1]!).y, 3)
        // …and both are the tangent at an interior join, so the joins
        // either side of them are C1 as dagre drew them. The bound is
        // the same hundredth of a degree the corpus suite holds every
        // join on, and the value compared is dagre's own 0.00° straight
        // lead-in — the one the pre-fix implementation turned into 180°.
        expect(Math.abs(turnAngles(out)[0]! - turnAngles(MERMAID_D)[0]!)).toBeLessThan(0.01)
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

    it('re-emits the path from d3\'s own formulas over the *same* routing', () => {
        /*
         * The exact edit, stated on this one path. `MERMAID_D` is
         * `M exit L lead-in C … C … L entry`, so its nine points are
         * `[exit, lead-in, c1, c2, v1, c1', c2', v2, entry]` — and every
         * one of the seven after the exit is a *derived* quantity, not
         * something dagre chose. This test states the new mechanism's
         * whole contract in one place:
         *
         *   1. d3's three routing points are recovered from the `d`
         *      exactly (a cubic's two controls invert to the two spline
         *      points they span: `2c₂ − c₁ = q_k`, `2c₁ − c₂ = q_{k-1}`),
         *      which is the assertion that the shape is understood rather
         *      than approximated;
         *   2. `q₀` and `q₂` are the *only* things that change, and they
         *      land on the card borders — the endpoint one arrowhead short
         *      of the target's;
         *   3. `q₁` — dagre's routing, the one point that is not derived
         *      from the endpoints — comes back **bit-identical**, and
         *   4. every other point is exactly what d3's formulas say for
         *      the new `q`s.
         *
         * Point 3 is the one that matters for "shape is preserved": the
         * previous mechanism left the middle of the path byte-identical
         * too, but by *translating* the points around it, which is what
         * put a control point on the wrong side of its partner. Here the
         * middle is re-derived, and what is held fixed is the routing
         * that produced it.
         *
         * The old version of this test looped `2 … n - 3` and would have
         * caught *nothing* on a real path: it assumed the point at index
         * 2 was already past the reach of the endpoint's move, which on
         * this shape it is not.
         */
        const out = reanchorEdgePath(MERMAID_D, source, target, halfW, halfH)!
        const before = parsePathPoints(MERMAID_D)!.flatMap((s) => s.points)
        const after = parsePathPoints(out)!.flatMap((s) => s.points)
        expect(after).toHaveLength(before.length)
        expect(parsePathPoints(out)!.map((s) => s.command)).toEqual(['M', 'L', 'C', 'C', 'L'])

        const reflect = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: 2 * a.x - b.x,
            y: 2 * a.y - b.y,
        })
        const at = (points: Array<{ x: number; y: number }>, i: number): { x: number; y: number } =>
            points[i] as { x: number; y: number }
        /** The `(wₐa + w_b b + w_c c) / Σw` blends d3's emitter uses. */
        const blend = (
            a: { x: number; y: number },
            b: { x: number; y: number },
            c: { x: number; y: number },
            wa: number,
            wb: number,
            wc: number,
        ): { x: number; y: number } => ({
            x: (wa * a.x + wb * b.x + wc * c.x) / (wa + wb + wc),
            y: (wa * a.y + wb * b.y + wc * c.y) / (wa + wb + wc),
        })
        const towards = (
            a: { x: number; y: number },
            b: { x: number; y: number },
            t: number,
        ): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

        // (1) the three routing points, decoded from Mermaid's own `d`.
        // The interior one takes the mean of the two cubics that name it,
        // exactly as the module does, because Mermaid's three decimals
        // make the two readings differ by ~0.0015 and one of them alone
        // is the less accurate figure. `after` is checked against the same
        // definition below, so this compares like with like.
        const q0 = at(before, 0)
        const mean = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
        })
        // 2·tail − head names the interval's *end*, 2·head − tail its
        // *start*, so the first cubic names q₁ as its end and the second
        // as its start: two independent readings of the same point.
        const q1 = mean(reflect(at(before, 3), at(before, 2)), reflect(at(before, 5), at(before, 6)))
        // …and the trailing `L` is q₂, which d3 writes out verbatim. Its
        // own reading back out of the last cubic's controls agrees to
        // within the `d`'s own step (0.001), which is exactly why the
        // module reads the two ends verbatim rather than inverting them:
        // inverting cannot beat the rounding it is fed. Bound is a
        // thousandth, one ulp of Mermaid's serialisation.
        // Rounded to Mermaid's own precision before comparing: the residual
        // is `132.701 − 132.700`, and in binary floating point that is
        // 0.0010000000000047748 rather than 0.001 exactly.
        const rounded = (v: number): number => Math.round(v * 1000) / 1000
        expect(rounded(Math.hypot(
            at(before, 8).x - reflect(at(before, 6), at(before, 5)).x,
            at(before, 8).y - reflect(at(before, 6), at(before, 5)).y,
        ))).toBeLessThanOrEqual(0.001)

        // (2) the two endpoints, on the cards.
        const border = cardBorderPoint(source, q0, halfW, halfH)
        expect(at(after, 0).x).toBeCloseTo(border.x, 6)
        expect(at(after, 0).y).toBeCloseTo(border.y, 6)
        // The *path* end is short of the target border by the marker; the
        // tip is what meets it. This edge is vertical, so the end tangent
        // and the border's normal are the same line — within the three
        // decimals of dagre's own entry point, which is what put the
        // border 0.0001 off the target's axis.
        expect(at(after, 8).x).toBeCloseTo(target.x, 3)
        expect(at(after, 8).y).toBeCloseTo(target.y - halfH - ARROWHEAD_OVERSHOOT, 3)

        // (3) dagre's routing survives exactly. q₁ read back out of the
        // rewritten path — twice, from the two cubics that name it — is
        // the q₁ read out of Mermaid's.
        const q1After = {
            x: (reflect(at(after, 3), at(after, 2)).x + reflect(at(after, 5), at(after, 6)).x) / 2,
            y: (reflect(at(after, 3), at(after, 2)).y + reflect(at(after, 5), at(after, 6)).y) / 2,
        }
        expect(q1After.x).toBeCloseTo(q1.x, 3)
        expect(q1After.y).toBeCloseTo(q1.y, 3)

        // (4) every derived point is d3's own expression of the new q's.
        const n0 = at(after, 0)
        const n1 = q1After
        const end = at(after, 8)
        expect(at(after, 1).x).toBeCloseTo(blend(n0, n1, n1, 5, 1, 0).x, 5)
        expect(at(after, 1).y).toBeCloseTo(blend(n0, n1, n1, 5, 1, 0).y, 5)
        expect(at(after, 2).x).toBeCloseTo(towards(n0, n1, 1 / 3).x, 5)
        expect(at(after, 2).y).toBeCloseTo(towards(n0, n1, 1 / 3).y, 5)
        expect(at(after, 3).x).toBeCloseTo(towards(n0, n1, 2 / 3).x, 5)
        expect(at(after, 3).y).toBeCloseTo(towards(n0, n1, 2 / 3).y, 5)
        expect(at(after, 4).x).toBeCloseTo(blend(n0, n1, end, 1, 4, 1).x, 5)
        expect(at(after, 4).y).toBeCloseTo(blend(n0, n1, end, 1, 4, 1).y, 5)
        expect(at(after, 5).x).toBeCloseTo(towards(n1, end, 1 / 3).x, 5)
        expect(at(after, 5).y).toBeCloseTo(towards(n1, end, 1 / 3).y, 5)
        expect(at(after, 6).x).toBeCloseTo(towards(n1, end, 2 / 3).x, 5)
        expect(at(after, 6).y).toBeCloseTo(towards(n1, end, 2 / 3).y, 5)
        expect(at(after, 7).x).toBeCloseTo(blend(n1, end, end, 1, 5, 0).x, 5)
        expect(at(after, 7).y).toBeCloseTo(blend(n1, end, end, 1, 5, 0).y, 5)

        // …which also means no control point can be on the wrong side of
        // its partner: within one cubic, the lead-in `L` and the two
        // control pairs are each collinear and *ordered* along the
        // interval they belong to, because d3 puts them at a third and
        // two thirds of the way along it. Ordered is the part that
        // matters — it is exactly the property the pre-fix run
        // translation broke, and the reason the S appeared. `q → q → q`
        // is 1 for a forward pair and −1 for a folded one.
        const at_ = (p: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) => {
            const dx = to.x - from.x
            const dy = to.y - from.y
            return ((p.x - from.x) * dx + (p.y - from.y) * dy) / (dx * dx + dy * dy)
        }
        for (const [lo, hi, from, to] of [
            [2, 3, n0, n1],
            [5, 6, n1, end],
        ] as const) {
            // Sine of the angle between the segment and the interval d3
            // built it from: 0 when the two are parallel.
            expect(Math.abs(cross(from, to, at(after, lo), at(after, hi))), 'collinear').toBeLessThan(1e-6)
            // Each control is strictly inside the interval, and the first
            // is strictly before the second — as a fraction of the
            // interval, 1/3 and 2/3 by construction. A handle that had
            // been dragged past its partner reads as a fraction *outside*
            // this range, so this is the assertion the S would fail.
            const loAt = at_(at(after, lo), from, to)
            const hiAt = at_(at(after, hi), from, to)
            expect(loAt).toBeCloseTo(1 / 3, 6)
            expect(hiAt).toBeCloseTo(2 / 3, 6)
        }
        // The leading `L` is the same statement one sixth of the way
        // along, which is where d3 puts it and therefore the direction
        // the path leaves the card on.
        expect(Math.abs(cross(n0, n1, n0, at(after, 1)))).toBeLessThan(1e-6)
        expect(at_(at(after, 1), n0, n1)).toBeCloseTo(1 / 6, 6)
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

    /*
     * The codec has to *decline* anything that is not a d3
     * `curveBundle.basis`, because the fallback is correct for those
     * shapes and this path is not. A false positive here is not a wrong
     * curve — it is a polyline re-anchored by a spline rule, which is
     * exactly the class of bug the corpus exists to catch.
     *
     * Every case below is either a real command sequence Mermaid emits
     * for a non-`basis` `flowchart.curve`, or the nearest neighbour of
     * the real one.
     */
    describe('the curveBundle.basis codec declines everything else', () => {
        const SOURCE = { x: 262.578125, y: 21 }
        const TARGET = { x: 69.203125, y: 159 }
        /** Re-anchored, and the commands of the result — unchanged means declined. */
        const reanchor = (d: string): { out: string; commands: string[] } => {
            const out = reanchorEdgePath(d, SOURCE, TARGET, halfW, halfH)!
            return { out, commands: (parsePathPoints(out) ?? []).map((s) => s.command) }
        }

        it('takes a polyline on the fallback, not the codec', () => {
            // `curveLinear` is `M L L`; d3's basis is `M L C C L`. A
            // three-point polyline has no cubic at all, so there is
            // nothing for the codec to invert.
            const { commands: c } = reanchor('M67.906,42L67.906,96.1L67.906,144.9')
            expect(c).toEqual(['M', 'L', 'L'])
        })

        it('takes a staircase on the fallback', () => {
            // `curveStep` is all `L`s — d3 emits a zero-length final step.
            const { commands: c } = reanchor('M0,42L0,60L0,80L0,100L0,120L0,140L0,144.9')
            expect(c.every((x) => x === 'L' || x === 'M')).toBe(true)
        })

        it('takes curveBumpX on the fallback, whose controls sit on the vertices', () => {
            // `curveBumpX` is `M C C` with no leading or trailing `L`, so
            // it fails the command-sequence test before any arithmetic.
            const { commands: c } = reanchor('M202.589,42C133.88,42,133.88,96.1,65.172,96.1C65.172,96.1,65.172,144.9,65.172,144.9')
            expect(c).toEqual(['M', 'C', 'C'])
        })

        it('takes a path whose trailing command is a curve, not a line', () => {
            // A `curveBasis` with the entry folded into the last cubic is
            // one command away from the real thing and must not be
            // claimed by the codec: `emitBundleBasis` would put a point
            // back.
            const { commands: c } = reanchor('M0,42L0,51C0,60 0,78 0,95C0,112 0,128 0,136')
            expect(c[c.length - 1]).toBe('C')
        })

        it('takes a path with only one cubic, which is not a bundle', () => {
            // `M L C L`: the shape in `MERMAID_D`'s own family with a
            // single cubic. Two points is the minimum d3's basis emits,
            // and one is not enough to invert.
            const { commands: c } = reanchor('M0,42L0,51C0,60 0,78 0,95L0,110')
            expect(c).toEqual(['M', 'L', 'C', 'L'])
        })

        it('takes a path whose last command is a curve, not a line', () => {
            // A `curveBasis` with the entry folded into the last cubic is
            // one command away from the real thing and must not be
            // claimed by the codec: `emitBundleBasis` would put a point
            // back. Long enough for the command test to reach the
            // *closing* check rather than the length check.
            const d = 'M203.725,42L181.305,50C158.884,58 114.044,74 91.623,89.117C69.203,104.233 69.203,118.467 69.203,125.583C69.203,130 69.203,131 69.203,132.7'
            const { commands: c } = reanchor(d)
            expect(c).toEqual(['M', 'L', 'C', 'C', 'C'])
        })

        it('takes a path whose first command is a line, not a move', () => {
            // The command test reads the *last* repetition as well as the
            // first, because a `… C … C` with no trailing `L` is the same
            // command sequence one character away. `M` is checked first
            // in `reanchorEdgePath`, so this reaches the codec only
            // because the opening `M` is there and the closing `L` is not.
            const { commands: c } = reanchor('M0,42L0,51C0,60 0,78 0,95C0,112 0,128 0,136')
            expect(c[c.length - 1]).toBe('C')
        })

        it('takes a path with a leading L but no opening M', () => {
            // `reanchorEdgePath` rejects this before the codec, and the
            // assertion is on the rejection: a path that does not open
            // with `M` has no endpoint for the ray to start from.
            expect(reanchorEdgePath('L0,51C0,60 0,78 0,95C0,112 0,128 0,136L0,143', SOURCE, TARGET, halfW, halfH))
                .toBeNull()
        })

        it('uses the border point itself when the last leg is shorter than the arrowhead', () => {
            /*
             * `room` is the distance from dagre's second-to-last spline
             * point to the target's border — the whole room the endpoint
             * has to be short by. A path whose last leg is *shorter*
             * than the 4.8-unit marker has no room to stop in, and the
             * endpoint becomes the border point: the tip then overshoots
             * into the card, which is the same outcome d3's own
             * zero-length terminal `L` on `curveStep` produces, and is a
             * property of the shape rather than of the re-anchoring.
             *
             * Built from `MERMAID_D` with its whole tail crushed up
             * against the target's border, so the codec still accepts
             * the path and `room` is genuinely under 4.8: the last
             * spline point lands at y = 115 and the border is at
             * 114.9.
             */
            const cramped = 'M203.725,42L181.305,50C158.884,58 114.044,74 91.623,89.117C69.203,104.233 69.203,115 69.203,116L69.203,116'
            const { out } = reanchor(cramped)
            const last = parsePathPoints(out)!.flatMap((s) => s.points).pop() as { x: number; y: number }
            expect(last.y).toBeCloseTo(TARGET.y - halfH, 3)
        })

        it('takes a path whose controls are not d3\'s, however bundle-shaped it looks', () => {
            /*
             * The command sequence is right and the *shape* is not, so the
             * decode has to notice: re-emitting the recovered `q`s would
             * not reproduce the path, and the codec returns `null` rather
             * than a curve d3 never drew. One control is pushed a whole
             * 10 units off d3's fraction, so the disagreement is metres
             * rather than the `d`'s own rounding — and the assertion is
             * on the *answer*, not on the rejection, because the
             * fallback's answer for this path is well defined.
             */
            const notD3 = 'M203.725,42L181.305,50C158.884,58 114.044,74 91.623,89.117C69.203,104.233 60,128.467 69.203,135.583L69.203,142.7'
            const { out, commands: c } = reanchor(notD3)
            // Declined → the fallback, which keeps the command sequence and
            // the point count and translates a run.
            expect(c).toEqual(['M', 'L', 'C', 'C', 'L'])
            const after = parsePathPoints(out)!.flatMap((s) => s.points)
            const before = parsePathPoints(notD3)!.flatMap((s) => s.points)
            expect(after).toHaveLength(before.length)
        })

        it('declines a path it cannot re-emit, rather than guessing', () => {
            /*
             * The re-emit check is the codec's own safety net, and this
             * is the shape that trips it: a bundle-looking `d` whose
             * *first* cubic is not d3's, so the `q` recovered from it
             * cannot reproduce the path it came from. The two ends are
             * read verbatim (see `decodeBundleBasis`), so this one is
             * caught on the leading `L` and the first cubic's controls.
             */
            const notD3 = 'M203.725,42L181.305,50C158.884,58 114.044,74 91.623,89.117C69.203,104.233 69.203,118.467 69.203,125.583L69.203,132.7'
            // Control the baseline: the untouched path *is* d3's.
            const { out: baseline } = reanchor(notD3)
            expect(baseline).not.toBeNull()
            // And a single point moved far off its fraction is enough to
            // lose the re-emit.
            const broken = notD3.replace('L181.305,50', 'L181.305,80')
            const { commands: c } = reanchor(broken)
            expect(c).toEqual(['M', 'L', 'C', 'C', 'L'])
        })
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

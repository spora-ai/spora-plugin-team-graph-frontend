/**
 * Measurement helpers for the edge-path corpus.
 *
 * Shared by `captureEdgeCorpus.ts` (which records these numbers into
 * `edgePathCorpus.ts`) and `edgeGeometryCorpus.spec.ts` (which asserts
 * them) so the two cannot drift: the number the fixture records and the
 * number the test recomputes are produced by the same code.
 *
 * Everything here is a pure function over a path's `d` string and
 * deliberately **re-derives** the command arity table from the SVG
 * specification rather than importing `lib/edgeGeometry.ts`'s. The
 * table in the module under test is one of the things being asserted
 * against, so the measuring stick must not be the thing being measured.
 */
import { parsePathPoints } from '../../src/lib/edgeGeometry'

export interface Point {
    x: number
    y: number
}

/**
 * Coordinate points per repetition, and how many of those are *control*
 * points — i.e. everything before the repetition's single on-curve
 * point.
 */
export const ARITY: Record<string, { points: number; controls: number }> = {
    M: { points: 1, controls: 0 },
    L: { points: 1, controls: 0 },
    H: { points: 1, controls: 0 },
    V: { points: 1, controls: 0 },
    C: { points: 3, controls: 2 },
    S: { points: 2, controls: 1 },
    Q: { points: 2, controls: 1 },
    T: { points: 1, controls: 0 },
    A: { points: 7, controls: 0 },
    Z: { points: 0, controls: 0 },
}

/** The commands a `d` string is made of, run together: `MLCCL`. */
export function commands(d: string): string {
    return (parsePathPoints(d) ?? []).map((segment) => segment.command).join('')
}

/** Every coordinate in a `d`, in order, on-curve and control alike. */
export function flatPoints(d: string): Point[] {
    return (parsePathPoints(d) ?? []).flatMap((segment) => segment.points)
}

interface ChainNode {
    p: Point
    /** The point the path arrives from: the last control of this group, if any. */
    arrive: Point | null
    /** The point the path leaves towards: the first control of the *next* group. */
    leave: Point | null
}

/**
 * Turn angle in degrees at every interior on-curve vertex: the angle
 * between the direction the path arrives from and the direction it
 * leaves in. A straight run scores 0; a path that folds back on itself
 * scores 180.
 *
 * **This is the "no discontinuity" measure.** Comparing the whole
 * sequence before and after is the strongest form of the assertion: a
 * vertex that slides *along* the line it was already on — which is what
 * re-anchoring a straight lead-in does — changes no angle at all,
 * while a vertex dragged off that line changes the angles around it. It
 * also catches the failure the pre-fix implementation had on every
 * `curveBasis` edge: dagre emits a 0.00° lead-in, and moving the lead-in
 * *vertex* instead of the curve's first control point turned it into
 * 180.00°.
 */
export function turnAngles(d: string): number[] {
    const segments = parsePathPoints(d)
    if (segments === null) return []
    const chain: ChainNode[] = []
    for (const segment of segments) {
        const shape = ARITY[segment.command]
        if (shape === undefined || shape.points === 0) continue
        for (let at = 0; at + shape.points <= segment.points.length; at += shape.points) {
            const group = segment.points.slice(at, at + shape.points)
            const vertex = group[shape.points - 1] as Point
            const previous = chain[chain.length - 1]
            if (previous === undefined) {
                chain.push({ p: vertex, arrive: null, leave: null })
                continue
            }
            previous.leave = group[0] as Point
            chain.push({
                p: vertex,
                /*
                 * A group with no control point (a line, a horizontal /
                 * vertical, a smooth-quadratic's reflection) has no handle
                 * to arrive from, so the chord from the previous vertex is
                 * the direction the path actually came in on. Skipping
                 * those groups instead would leave every polyline corner
                 * unmeasured — which is exactly the corner a staircase
                 * router is all about.
                 */
                arrive: shape.controls > 0 ? (group[shape.controls - 1] as Point) : previous.p,
                leave: null,
            })
        }
    }
    const angles: number[] = []
    for (let i = 1; i < chain.length - 1; i++) {
        const node = chain[i] as ChainNode
        if (node.arrive === null || node.leave === null) continue
        const a = Math.atan2(node.p.y - node.arrive.y, node.p.x - node.arrive.x)
        const b = Math.atan2(node.leave.y - node.p.y, node.leave.x - node.p.x)
        const degrees = ((b - a) * 180) / Math.PI
        angles.push(Math.min(Math.abs(degrees), 360 - Math.abs(degrees)))
    }
    return angles
}

/** Largest interior turn angle, in degrees. `0` for a path with no interior vertex. */
export function maxTurnAngle(d: string): number {
    const angles = turnAngles(d)
    return angles.length === 0 ? 0 : Math.max(...angles)
}

/**
 * Largest displacement of any *interior* point between two versions of
 * the same path. A vertex that has been dragged off the line it was on
 * shows up here; one that has merely slid along that line does not,
 * which is why the turn-angle sequence above is the sharper measure.
 */
export function maxInteriorShift(before: string, after: string): number {
    const a = flatPoints(before)
    const b = flatPoints(after)
    if (a.length !== b.length) return Number.POSITIVE_INFINITY
    let worst = 0
    for (let i = 1; i < a.length - 1; i++) {
        worst = Math.max(worst, Math.hypot((b[i] as Point).x - (a[i] as Point).x, (b[i] as Point).y - (a[i] as Point).y))
    }
    return worst
}

/**
 * How far along `d` the tangents in `renderedWaviness` are sampled.
 *
 * Only the *browser* measure needs this; `inflections` below is closed-form
 * and samples nothing.
 */
export const TANGENT_SAMPLE = 1

/**
 * How far the tangent angle may turn between two samples before the turn
 * counts as a change of direction at all.
 *
 * **It is a numerical guard, not a threshold in the design, and the
 * measurement says so.** A path that never changes its mind has a
 * *monotone* tangent, however sharply it turns: Mermaid's own paths
 * reach 5.5° between two adjacent samples at their tightest elbow and
 * score 0 reversals, because every one of those steps has the same
 * sign. So this does not protect Mermaid's curves from being counted
 * and it is not tuned to.
 *
 * What it does do is stop a sub-ulp sign flip from counting. Two
 * consecutive samples can be collinear to the last bit a `d` carries,
 * and then the sign of their difference is arbitrary — which on a
 * *straight* run (the vertical edges are straight for their whole
 * length) would manufacture a reversal out of numerical noise. 0.2°
 * over a `TANGENT_SAMPLE` step is a radius of 290 units, a quarter of
 * the shortest path in the corpus, so nothing that reads as a curve
 * sits inside it.
 *
 * Measured: lowering it to 0.01° raises the count on the re-anchored
 * `curveBasis` paths not at all (still 0) and the count on the
 * run-translating ones from 32 to 44 — i.e. the extra 12 are reversals
 * of under 0.05°, which is noise, not wobble. Raising it to 0.8°
 * changes nothing at all. The measure is insensitive to the value over
 * more than a decade and a half, which is the property worth knowing
 * about a threshold: it is not what the number means.
 */
export const TANGENT_DEADBAND = 0.2

export interface Waviness {
    /**
     * How many times the tangent's direction changes from increasing to
     * decreasing, or back. **0 means the curve turns the same way all the
     * way along**; 1 is an inflection, and 2 is the S that a control
     * point on the wrong side of its partner produces.
     */
    reversals: number
    /**
     * The total angle, in degrees, those reversals account for. Two
     * reversals of 0.5° are still a visible wobble and two of 30° are
     * not the same defect, so the count alone is not the measure.
     */
    reversalTurn: number
}

/**
 * The curvature of a path in the only form that describes a wobble:
 * **changes of mind**.
 *
 * **This is the definition of "wavy" this repo measures**, and it comes
 * in two implementations, because the two answer slightly different
 * questions and the suite wants both.
 *
 * A path reads as wavy when its *direction* turns one way, stops, and
 * turns back — the S through an arrowhead that an eye sees. Every other
 * measure of curvature is confounded on these paths by their length:
 * re-anchoring makes a path roughly half as long as Mermaid drew it
 * (most of the original ran *inside* the cards, where the overlay covers
 * it), so the *same* curve necessarily reports a higher turn per unit of
 * length. A turn-per-window figure cannot separate "curvier" from
 * "wobblier", which is why the suite's previous
 * `maxTurnAngle(reanchor) ≤ maxTurnAngle(mermaid) + 0.5` was vacuous:
 * Mermaid's own turn angle at an interior vertex is 0.00°–0.002°, so a
 * half-degree allowance passed on paths that wobbled, because a wobble
 * lives *inside* a cubic where there is no interior vertex to measure.
 *
 *   - `inflections` below is the **closed form**: the exact number of
 *     inflections in the path's own control points, sampled nowhere and
 *     with no threshold. It is what the assertions are made on, because
 *     it needs no browser and therefore tests the *live* implementation
 *     rather than a recorded number.
 *   - `renderedWaviness` below is the **rendered, sampled** version: it
 *     asks Chrome where the ink actually goes and counts the direction
 *     changes above a deadband. It is recorded in the corpus as the
 *     cross-check on the closed form, on real browser geometry.
 *
 * They are not expected to agree path for path, and do not: the closed
 * form counts every inflection, while the rendered one counts only those
 * whose direction change is large enough to see — Mermaid's own paths
 * have zero of the former and zero of the latter on `curveBasis`, but
 * d3's `curveStep` staircase has 66 of the former (every corner) and 44
 * of the latter. **The assertion is the difference between a path and
 * the version Mermaid emitted**, which is zero on both measures for
 * `curveBasis` and non-zero on the broken implementation on both.
 */
export function renderedWaviness(probe: SVGPathElement): Waviness {
    const total = probe.getTotalLength()
    const tangentAt = (at: number): number => {
        const back = probe.getPointAtLength(Math.max(0, at - TANGENT_SAMPLE))
        const forward = probe.getPointAtLength(Math.min(total, at + TANGENT_SAMPLE))
        const degrees = (Math.atan2(forward.y - back.y, forward.x - back.x) * 180) / Math.PI
        return degrees < 0 ? degrees + 360 : degrees
    }
    let reversals = 0
    let reversalTurn = 0
    let lastSign = 0
    let previous = tangentAt(TANGENT_SAMPLE)
    for (let at = 2 * TANGENT_SAMPLE; at < total; at += TANGENT_SAMPLE) {
        const current = tangentAt(at)
        // Wrapped into (−180, 180] so a path that turns through "north"
        // is not read as a reversal.
        let step = current - previous
        while (step > 180) step -= 360
        while (step < -180) step += 360
        previous = current
        if (Math.abs(step) <= TANGENT_DEADBAND) continue
        const sign = step > 0 ? 1 : -1
        if (lastSign !== 0 && sign !== lastSign) {
            reversals++
            reversalTurn += Math.abs(step)
        }
        lastSign = sign
    }
    return { reversals, reversalTurn: Math.round(reversalTurn * 1000) / 1000 }
}

/* ------------------------------------------------------------------ *
 * The closed form.
 * ------------------------------------------------------------------ */

const cross = (u: Point, v: Point): number => u.x * v.y - u.y * v.x
const scale = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k })
const shift = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y })
const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y })

/**
 * `B(t) = a·t³ + b·t² + c·t + d` for a cubic bézier — the *monomial*
 * coefficients, which is what makes the derivative trivial.
 *
 *   d = p₀,  c = 3(p₁ − p₀),  b = 3(p₀ − 2p₁ + p₂),  a = −p₀ + 3p₁ − 3p₂ + p₃
 *
 * (Written out rather than in Bernstein form because the point is to take
 * two derivatives and multiply them out, which the monomial basis makes
 * a one-liner.)
 */
function monomials(p0: Point, p1: Point, p2: Point, p3: Point): { a: Point; b: Point; c: Point } {
    return {
        a: add(add(shift(scale(p1, 3), scale(p2, 3)), p3), scale(p0, -1)),
        b: add(scale(shift(p0, p1), 3), scale(p2, 3)),
        c: scale(shift(p1, p0), 3),
    }
}

/**
 * How many times the curve's tangent **changes its mind** — the exact
 * count, in closed form, from the control points alone.
 *
 * **The derivation, which is the whole point.** A cubic's signed
 * curvature is `cross(B′, B″)` up to a positive factor, and with the
 * monomial coefficients above
 *
 *     B′(t)  = 3a·t² + 2b·t + c
 *     B″(t)  = 6a·t + 2b
 *     cross(B′, B″) = −6·cross(a,b)·t² + 6·cross(c,a)·t + 2·cross(c,b)
 *
 * — the t³ term is `18·cross(a,a)`, which is zero. So the sign of a
 * cubic's curvature is the sign of a **quadratic in t**, and the
 * inflections are the roots of that quadratic that fall strictly inside
 * `(0, 1)`. Counting them is a quadratic formula, not a search: there
 * is no sampling step, no deadband, and no dependence on the path's
 * length or on how finely anyone discretised it.
 *
 * **That matters here more than usual.** The defect being guarded is
 * 0.5°–3.8° of direction change on an 800-unit path, which is the same
 * order as the difference between two samplings of a *correct* curve —
 * an earlier sampled version of this measure could not separate the two
 * implementations on some paths at all. The closed form can, because it
 * does not discretise: on the 33 `curveBasis` paths Mermaid's own output
 * and this repo's both score **0**, and the run-translating
 * implementation that this replaces scores **50** across the same 33.
 *
 * **A polyline corner counts too.** A staircase changes its mind at every
 * step, and d3's `curveStep` staircase is 66 on the whole corpus — which
 * is why the assertion is always a *difference* against the path Mermaid
 * emitted, never an absolute number. (`M` does not count: it starts the
 * path, so there is no direction to have changed from.)
 */
export function inflections(d: string): number {
    const segments = parsePathPoints(d)
    if (segments === null) return 0
    let total = 0
    let at: Point | null = null
    /** The direction of the last straight segment, for corner detection. */
    let previousChord: Point | null = null
    for (const segment of segments) {
        const shape = ARITY[segment.command]
        if (shape === undefined || shape.points === 0) continue
        for (let k = 0; k + shape.points <= segment.points.length; k += shape.points) {
            const group = segment.points.slice(k, k + shape.points)
            if (segment.command === 'C') {
                if (at === null) {
                    // No point to measure from: the path opens with a
                    // curve, which Mermaid never emits, and there is
                    // nothing for a curvature to be relative to.
                    at = group[2] as Point
                    previousChord = null
                    continue
                }
                total += cubicInflections(at, group[0] as Point, group[1] as Point, group[2] as Point)
                at = group[2] as Point
                // A curve leaves no chord behind for the next line to
                // turn against.
                previousChord = null
                continue
            }
            const end = group[shape.points - 1] as Point
            if (at !== null && previousChord !== null && cross(previousChord, shift(end, at)) !== 0) {
                total++
            }
            previousChord = at === null ? null : shift(end, at)
            at = end
        }
    }
    return total
}

/** Real roots of `A·t² + B·t + C` strictly inside `(0, 1)`. */
function cubicInflections(p0: Point, p1: Point, p2: Point, p3: Point): number {
    const { a, b, c } = monomials(p0, p1, p2, p3)
    const t2 = -6 * cross(a, b)
    const t1 = 6 * cross(c, a)
    const t0 = 2 * cross(c, b)
    // The scale is a user-unit cubed and the coefficients of a real path
    // run to ~10⁶, so these are comparisons against float noise, not
    // against anything geometric. A degenerate cubic (a straight run, or
    // a collapsed one) has all three coefficients zero.
    if (Math.abs(t2) < 1e-9) {
        if (Math.abs(t1) < 1e-9) return 0
        const t = -t0 / t1
        return t > 0 && t < 1 ? 1 : 0
    }
    const discriminant = t1 * t1 - 4 * t2 * t0
    if (discriminant < 0) return 0
    const root = Math.sqrt(discriminant)
    let n = 0
    for (const t of [(-t1 - root) / (2 * t2), (-t1 + root) / (2 * t2)]) {
        if (t > 0 && t < 1) n++
    }
    return n
}

/**
 * The point Mermaid's `pointEnd` marker paints its **tip** at, given a
 * path: `overshoot` user units past the path's end, along the path's own
 * direction of travel there (which is what `orient="auto"` rotates the
 * marker to).
 *
 * A degenerate final segment (Mermaid's `curveStep` ends every edge with
 * a zero-length `L`, so there is no direction to honour) pins the tip to
 * the path's end rather than inventing a direction.
 */
export function arrowTip(d: string, overshoot: number): Point {
    const points = flatPoints(d)
    const last = points[points.length - 1]
    const previous = points[points.length - 2]
    if (last === undefined) return { x: 0, y: 0 }
    if (previous === undefined) return { ...last }
    const length = Math.hypot(last.x - previous.x, last.y - previous.y)
    if (length === 0) return { ...last }
    return {
        x: last.x + (overshoot * (last.x - previous.x)) / length,
        y: last.y + (overshoot * (last.y - previous.y)) / length,
    }
}

/**
 * Shortest distance from a point to a card's **outline** — `0` on the
 * border, the gap to the nearest edge when the point is inside, and the
 * Euclidean gap when it is outside.
 *
 * Not the distance to the *filled* box (which is `0` for anything
 * inside, and would call a path end 4.8 units short of the border "on"
 * it), and not an axis-wise "is |dx| half the width?" (which reads a
 * diagonal endpoint as on the border the moment one of its two
 * components happens to match).
 */
export function distanceToBorder(p: Point, centre: Point, halfWidth: number, halfHeight: number): number {
    const ax = Math.abs(p.x - centre.x)
    const ay = Math.abs(p.y - centre.y)
    if (ax <= halfWidth && ay <= halfHeight) return Math.min(halfWidth - ax, halfHeight - ay)
    return Math.hypot(Math.max(ax - halfWidth, 0), Math.max(ay - halfHeight, 0))
}

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

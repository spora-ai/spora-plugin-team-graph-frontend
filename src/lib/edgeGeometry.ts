/**
 * Re-anchor Mermaid's edge endpoints onto the node cards.
 *
 * **Why this exists.** Mermaid sizes a node box from its *label*
 * (`dagre-d3-es/src/dagre-js/create-nodes.js` takes the label's
 * `getBBox()`), and `intersectRect()` routes every edge endpoint to that
 * same box — the routing is baked into the path's `d` before anything
 * else runs. The card, on the other hand, is a fixed 240 × 76 box drawn
 * by a Vue component (`lib/nodeLayout.ts`), and `useMermaidRender` grows
 * the SVG's `g.node rect` to match *after* the render, because the
 * layout maths and the viewBox need the bigger box. Growing the rect
 * therefore fixes the box the card covers and the box `getBBox()`
 * measures, but it cannot move an edge endpoint that was already
 * computed against the smaller label box. Measured on the 4-node dev
 * fixture: node 11's label box is 147 × 42, so its outgoing edge left
 * the endpoint 17 px *inside* the card and arrived 11.7 px *inside* the
 * target — the arrows visibly floated in the gap between the boxes.
 *
 * **The fix is geometric, not a re-layout.** For each edge we know the
 * two node centres, and Mermaid routed along the ray from a node's
 * centre through its own path endpoint (measured: the initial tangent
 * and that ray agree to 0.1 % on the same fixture). So we walk the ray
 * out to the card's border and translate the endpoint *and its adjacent
 * control point* by the same delta: the curve keeps its shape and stays
 * smooth, and only its reach changes.
 *
 * Everything here is a pure function over the path's `d` string, so it
 * is unit-testable without a layout engine and cannot half-apply: a
 * path we cannot parse is reported as `null` and the caller leaves the
 * attribute alone.
 */

export interface Point {
    x: number
    y: number
}

/**
 * A parsed path point plus whether it lies *on* the curve.
 *
 * The distinction is load-bearing: a cubic's end tangent is the vector
 * to its nearest *control* point, but a handle may only be shortened
 * to the distance to the nearest *on-curve* point — shortening it to a
 * neighbouring control point clamps it far too hard and changes the
 * tangent it was supposed to preserve.
 */
interface PathPoint extends Point {
    onCurve: boolean
}

interface Segment {
    command: string
    points: PathPoint[]
}

/**
 * Commands Mermaid's edge router emits, with how many coordinate
 * points each repetition carries and which of those are on-curve.
 * `M`/`L` carry a single on-curve point; `C` carries two *control*
 * points followed by one on-curve point — so the on-curve offsets are
 * `0` for the linears and `2` for the cubic. Anything outside this
 * table (`H`, `V`, `A`, `Q`, `S`, `T`, …) is rejected rather than
 * guessed at.
 */
const SHAPE: Record<string, { points: number; onCurveAt: readonly number[] }> = {
    M: { points: 1, onCurveAt: [0] },
    L: { points: 1, onCurveAt: [0] },
    C: { points: 3, onCurveAt: [2] },
}

/**
 * Tokenise an SVG path into command → points, marking on-curve points.
 *
 * Only `M` / `L` / `C` are accepted, which is the complete set the
 * dagre edge router (`curveBasis` / `curveLinear`) produces. Returns
 * `null` for anything else — a relative or single-coordinate command
 * would make "shift the first two points" ambiguous, and a mis-parsed
 * path is worse than an un-anchored one.
 */
function parsePath(d: string): Segment[] | null {
    const segments: Segment[] = []
    let current: string | null = null
    let numbers: number[] = []

    const flush = (): boolean => {
        if (current === null) return true
        const shape = SHAPE[current]
        if (shape === undefined) return false
        // No coordinates for this command: nothing to emit. Reached
        // whenever a letter is followed immediately by another one, and
        // by the `M` → implicit-`L` split below.
        if (numbers.length === 0) return true
        if (numbers.length % 2 !== 0) return false
        if (numbers.length / 2 % shape.points !== 0) return false
        const points: PathPoint[] = []
        for (let i = 0; i < numbers.length; i += 2) {
            const x = numbers[i]
            const y = numbers[i + 1]
            if (x === undefined || y === undefined) return false
            points.push({ x, y, onCurve: shape.onCurveAt.includes(points.length % shape.points) })
        }
        segments.push({ command: current, points })
        numbers = []
        return true
    }

    // A single alternation of a command letter and a number matches
    // both "M10 20" and "M10,20" and "C1 2 3 4 5 6".
    const token = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g
    let match: RegExpExecArray | null
    while ((match = token.exec(d)) !== null) {
        const [, letter, value] = match
        if (letter !== undefined) {
            if (!flush()) return null
            current = letter.toUpperCase()
        } else {
            if (current === null) return null
            numbers.push(Number(value))
            /*
             * Per SVG, coordinate pairs after an `M` are implicit `L`s.
             * dagre never emits that, but honouring it keeps the
             * "first / last on-curve point" rules below correct if a
             * future Mermaid does.
             */
            if (current === 'M' && numbers.length === 2) {
                if (!flush()) return null
                current = 'L'
            }
        }
    }
    if (!flush()) return null
    return segments.length > 0 ? segments : null
}

/**
 * `parsePath` without the on-curve bookkeeping — the plain
 * command → points view, which is all a caller inspecting a path needs.
 */
export function parsePathPoints(d: string): { command: string; points: Point[] }[] | null {
    const segments = parsePath(d)
    if (segments === null) return null
    return segments.map((segment) => ({
        command: segment.command,
        points: segment.points.map((p) => ({ x: p.x, y: p.y })),
    }))
}

/**
 * Where the ray from `centre` through `toward` crosses the card's
 * border — i.e. the first point of that ray that lies on the
 * `halfWidth × halfHeight` rectangle centred on `centre`.
 *
 * A zero component means the ray runs parallel to that axis and never
 * leaves through it, so the ray is allowed to run unbounded in that
 * direction and the *other* axis decides where it lands. That is what
 * makes a perfectly vertical edge land exactly on the card's top or
 * bottom border.
 */
export function cardBorderPoint(centre: Point, toward: Point, halfWidth: number, halfHeight: number): Point {
    const dx = toward.x - centre.x
    const dy = toward.y - centre.y
    const toSideX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx)
    const toSideY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy)
    const t = Math.min(toSideX, toSideY)
    if (!Number.isFinite(t)) return { x: centre.x, y: centre.y }
    return { x: centre.x + dx * t, y: centre.y + dy * t }
}

/**
 * Round to Mermaid's own precision (3 decimals) so the rewritten `d`
 * stays as short and stable as the string it replaces.
 */
function round(value: number): number {
    return Math.round(value * 1000) / 1000
}

function serialise(segments: Segment[]): string {
    return segments
        .map((segment) => `${segment.command} ${segment.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}`)
        .join(' ')
}

/**
 * Move the path's start point onto `newStart` and its end point onto
 * `newEnd`, carrying each end's control point along so the curve keeps
 * the same tangent — and stays free of loops.
 *
 * **Why the control point moves at all.** A cubic bezier's tangent at
 * an end point is the vector to that point's nearest control point, so
 * moving the endpoint alone would snap the curve to a new direction
 * where it meets the card. Moving the control point by the same delta
 * is a rigid translation of the handle, preserving both the tangent
 * and the curve's shape through it.
 *
 * **Why the handle is then shortened.** A rigid translation can push
 * the control point *past* the next on-curve point, turning the
 * segment into a loop. Clamping the handle to the distance from the
 * new endpoint to that point keeps its direction (so the tangent
 * survives) and guarantees the points stay in order. A path with only
 * two points has no handle to carry and is left as pure endpoints.
 */
function anchorEnds(segments: Segment[], newStart: Point, newEnd: Point): Segment[] {
    const points = segments.flatMap((segment) => segment.points)
    const total = points.length
    if (total === 0) return segments
    const moved: PathPoint[] = points.map((p) => ({ ...p }))
    moved[0] = { ...newStart, onCurve: true }
    if (total > 1) moved[total - 1] = { ...newEnd, onCurve: true }
    if (total >= 3) {
        const middle = points.slice(2, total - 2)
        const nextOnCurve = middle.find((p) => p.onCurve)
        const prevOnCurve = [...middle].reverse().find((p) => p.onCurve)
        moved[1] = clampHandle(newStart, points[0] as PathPoint, points[1] as PathPoint, nextOnCurve)
        moved[total - 2] = clampHandle(newEnd, points[total - 1] as PathPoint, points[total - 2] as PathPoint, prevOnCurve)
    }

    let seen = 0
    return segments.map((segment) => ({
        command: segment.command,
        points: segment.points.map(() => moved[seen++] as PathPoint),
    }))
}

/**
 * `endpoint` translated by the whole of `oldHandle`, shortened to at
 * most `|endpoint − neighbour|` so it cannot overshoot `neighbour`.
 * With no `neighbour` (a two-point path) the handle moves whole.
 */
function clampHandle(
    endpoint: Point,
    oldEndpoint: PathPoint,
    oldHandle: PathPoint,
    neighbour: PathPoint | undefined,
): PathPoint {
    const moved: Point = {
        x: endpoint.x + oldHandle.x - oldEndpoint.x,
        y: endpoint.y + oldHandle.y - oldEndpoint.y,
    }
    let result = moved
    if (neighbour !== undefined) {
        const handleLength = Math.hypot(moved.x - endpoint.x, moved.y - endpoint.y)
        if (handleLength > 0) {
            const room = Math.hypot(neighbour.x - endpoint.x, neighbour.y - endpoint.y)
            if (room < handleLength) {
                result = {
                    x: endpoint.x + (moved.x - endpoint.x) * (room / handleLength),
                    y: endpoint.y + (moved.y - endpoint.y) * (room / handleLength),
                }
            }
        }
    }
    return { x: result.x, y: result.y, onCurve: oldHandle.onCurve }
}

/**
 * Re-anchor one edge path so it starts on `source`'s card border and
 * ends on `target`'s card border.
 *
 * Returns `null` when the path cannot be parsed or carries no points,
 * which is the caller's signal to leave the attribute alone. A node
 * whose edge endpoint is already on (or outside) the card still gets a
 * sensible result: the ray is simply re-aimed at the border.
 */
export function reanchorEdgePath(
    d: string,
    source: Point,
    target: Point,
    halfWidth: number,
    halfHeight: number,
): string | null {
    const segments = parsePath(d)
    if (segments === null) return null
    const points = segments.flatMap((segment) => segment.points)
    const first = points[0]
    const last = points[points.length - 1]
    if (first === undefined || last === undefined) return null
    return serialise(
        anchorEnds(
            segments,
            cardBorderPoint(source, first, halfWidth, halfHeight),
            cardBorderPoint(target, last, halfWidth, halfHeight),
        ),
    )
}

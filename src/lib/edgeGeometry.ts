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
 * **The border is not where the arrow is.** Landing the *path end* on
 * the card border looks right in the geometry and is still wrong on
 * screen: Mermaid's `pointEnd` marker is drawn with the path's end
 * vertex at the marker's `refX`, so the visible tip is
 * `ARROWHEAD_OVERSHOOT` user units further along the path — i.e.
 * *inside* the opaque `button.tg-node-card`, which then clips the tip
 * and reads as a cut-off arrowhead. The endpoint is therefore stopped
 * short by exactly that overshoot, along the direction the marker is
 * actually drawn, so the **tip** lands on the border.
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
 * How far Mermaid's end-of-line arrowhead paints **past** the path's
 * end point, in SVG user units — the default value of
 * `reanchorEdgePath`'s `endOvershoot`.
 *
 * This number is the whole reason a path that ends *exactly* on the
 * card border still looks cut off, so it is derived rather than
 * guessed. Read off the rendered `<marker>` in the plugin's own SVG
 * (and byte-identical in `mermaid/dist/edges-*.js → insertMarkers`):
 *
 *     <marker id="m-1_flowchart-pointEnd" viewBox="0 0 10 10"
 *             refX="6" refY="5" markerUnits="userSpaceOnUse"
 *             markerWidth="12" markerHeight="12" orient="auto">
 *       <path d="M 0 0 L 10 5 L 0 10 z"/>
 *     </marker>
 *
 *   - `markerUnits="userSpaceOnUse"` *together with* a `viewBox`
 *     means the marker's own 10-unit coordinate box is scaled into SVG
 *     user units by `markerWidth / viewBox.width` = 12 / 10 = **1.2**.
 *   - `refX="6"` is the marker-local point pinned to the path's end
 *     vertex; the tip is the marker path's rightmost point, local
 *     `x = 10`, so 4 local units sit beyond the vertex.
 *   - 4 × 1.2 = **4.8 user units**.
 *
 * Measured on the 4-node dev fixture with the previous, un-inset code:
 * every edge's path end sat 0.000 user units from the card border
 * while its arrow **tip** sat 4.800 inside the card (1.613 for the two
 * diagonal edges, whose tip approaches at an angle) — hidden under the
 * card's own background. With the endpoint stopped 4.8 short, the tip
 * lands on the border to within 0.000.
 *
 * `orient="auto"` rotates the marker to the path's own direction of
 * travel, so the overshoot is the same 4.8 on every edge — but it is
 * applied *along that direction* (`endTangent`), not along the ray
 * from the node's centre, so a diagonal edge is compensated along the
 * direction the marker is actually drawn.
 *
 * **Nothing is compensated at the start.** `lib/mermaidSource.ts` emits
 * `n<a> --> n<b>` for every edge, so Mermaid only ever writes
 * `marker-end`; the `pointStart` marker it also defines in `<defs>`
 * (`refX=4.5`, i.e. a 5.4-unit *backward* reach) is never referenced,
 * and the start point therefore stays exactly on the source border.
 */
export const ARROWHEAD_OVERSHOOT = 4.8

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
 * The path's direction of travel where it *ends*, as a unit vector —
 * i.e. the direction an `orient="auto"` end marker is rotated to.
 *
 * For a final cubic this is the vector to the nearest *control* point
 * (the curve's end tangent); for a final `L` it is the vector to the
 * previous on-curve point. A two-point path therefore measures the
 * line between its two endpoints, and a path whose last two points
 * coincide (or that has fewer than two points) has no direction at
 * all: `(0, 0)` is returned, which turns any overshoot into a no-op
 * rather than a guess.
 */
function endTangent(points: PathPoint[]): Point {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    if (last === undefined || prev === undefined) return { x: 0, y: 0 }
    const length = Math.hypot(last.x - prev.x, last.y - prev.y)
    if (length === 0) return { x: 0, y: 0 }
    return { x: (last.x - prev.x) / length, y: (last.y - prev.y) / length }
}

/**
 * `border` walked back along the marker's own direction by
 * `overshoot` — the point the path has to *stop* at for its arrow
 * **tip** to land on `border`.
 *
 * The inset is along the path's travel direction rather than the ray
 * from the node's centre, because that is the line the marker is drawn
 * on: subtracting the overshoot from the wrong direction would leave
 * the tip off the border by up to `overshoot` for a diagonal edge.
 */
function shortOfBorder(border: Point, unit: Point, overshoot: number): Point {
    if (overshoot === 0) return border
    return { x: border.x - unit.x * overshoot, y: border.y - unit.y * overshoot }
}

/**
 * Re-anchor one edge path so it starts on `source`'s card border and
 * its arrow **tip** lands on `target`'s card border.
 *
 * `endOvershoot` is how far past the path's end the end marker's tip
 * is drawn (see `ARROWHEAD_OVERSHOOT`, which is the default because
 * every edge `mermaidSource.ts` emits is a `-->` arrow). The endpoint
 * is stopped short by exactly that much along the path's own end
 * direction, so the *tip* — not the path end — meets the border. Pass
 * `0` for a path with no end marker; the start point is never
 * compensated, because Mermaid emits no `marker-start` for it.
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
    endOvershoot: number = ARROWHEAD_OVERSHOOT,
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
            shortOfBorder(
                cardBorderPoint(target, last, halfWidth, halfHeight),
                endTangent(points),
                endOvershoot,
            ),
        ),
    )
}

/**
 * Re-anchor Mermaid's edge endpoints onto the node cards.
 *
 * **Why this exists.** Mermaid sizes a node box from its *label*
 * (`dagre-d3-es/src/dagre-js/create-nodes.js` takes the label's
 * `getBBox()`), and `intersectRect()` routes every edge endpoint to that
 * same box — the routing is baked into the path's `d` before anything
 * else runs. The card, on the other hand, is a fixed
 * `NODE_CARD_WIDTH` × `NODE_CARD_HEIGHT` box drawn by a Vue component
 * (`lib/nodeLayout.ts`), and `useMermaidRender` grows the SVG's
 * `g.node rect` to match *after* the render, because the layout maths and
 * the viewBox need the bigger box. Growing the rect therefore fixes the
 * box the card covers and the box `getBBox()` measures, but it cannot
 * move an edge endpoint that was already computed against the smaller
 * label box. Measured on the 4-node dev fixture: node 11's label box is
 * 147 × 42, so its outgoing edge left the endpoint 17 px *inside* the
 * card and arrived 11.7 px *inside* the target — the arrows visibly
 * floated in the gap between the boxes.
 *
 * **The fix is geometric, not a re-layout.** For each edge we know the
 * two node centres, and Mermaid routed along the ray from a node's
 * centre through its own path endpoint (measured: the initial tangent
 * and that ray agree to 0.1 % on the same fixture). So we walk the ray
 * out to the card's border and translate the endpoint together with the
 * *handle that governs the curve there*: the curve keeps its tangent,
 * its shape, and its smooth join with the straight lead-in in front of
 * it, and only its reach changes.
 *
 * **Which handle is "the handle there" is a question about commands,
 * not about indices.** This is the whole point of the module, and
 * getting it wrong was a shipped bug. dagre + d3's `curveBasis` — what
 * `useMermaidRender` configures — emits
 *
 *     M <exit> L <lead-in> C … C … L <entry>
 *
 * so on a path with two cubics the flat point list is
 * `[exit, lead-in, c1, c2, v1, c1', c2', v2, entry]`, and:
 *
 *   - index `1` is the **lead-in vertex**, not a control point, and
 *   - index `n - 2` is the last cubic's **on-curve endpoint**, not a
 *     control point either.
 *
 * An implementation that assumed `points[1]` and `points[n - 2]` were
 * bézier control points translated two *vertices* by the endpoint
 * delta. On every real path in the captured corpus that folds the path
 * back on itself: the turn angle at the first interior vertex goes from
 * dagre's 0.00° to **180.00°**, and the interior vertex is displaced by
 * 36.5 – 82.7 user units. The suite stayed green because every fixture
 * was hand-written; `tests/fixtures/edgePathCorpus.ts` is 120 real
 * `d` strings captured from mermaid 10.9.8 in a real browser, and it is
 * what this module is now tested against.
 *
 * So the anchoring is **command-aware**: every SVG path command has a
 * known arity and a known split between control points and its single
 * on-curve point (`SHAPE` below), the runs that each endpoint drags
 * along are located through that table rather than by index, and every
 * join angle in the rewritten path is identical to the one Mermaid
 * drew. A path whose start and end handle are the *same* point (a lone
 * `S`/`Q` segment) correctly receives both deltas.
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
 * Every edge in the captured corpus confirms this: `marker-end` is
 * always `url(#…_flowchart-pointEnd)` and `marker-start` is always
 * absent.
 */
export const ARROWHEAD_OVERSHOOT = 4.8

/**
 * A parsed path point plus whether it lies *on* the curve.
 *
 * The distinction is load-bearing: a cubic's end tangent is the vector
 * to its nearest *control* point, but a handle may only be shortened
 * to the distance to the segment's own on-curve point — shortening it
 * to a neighbouring control point clamps it far too hard and changes
 * the tangent it was supposed to preserve. It is also what lets a
 * *vertex* be dragged along a straight run without being mistaken for
 * a handle: only `offset < handles` points are ever candidates for the
 * handle bounds in `clampHandle`.
 */
interface PathPoint extends Point {
    onCurve: boolean
}

interface Segment {
    command: string
    points: PathPoint[]
}

interface Shape {
    /** Coordinate *pairs* one repetition of the command carries. */
    points: number
    /**
     * Control points at the *head* of one repetition. `C` carries two
     * (`c1`, `c2`), `S`/`Q` one, and everything else none.
     */
    handles: number
    /**
     * Which of those points is the on-curve one. It is always the last.
     */
    vertex: number
}

/**
 * Every path command the parser accepts, with its arity and the split
 * between control points and its on-curve point.
 *
 * **`Z` is the odd one out:** it carries no coordinates at all, so
 * `points` is 0 and its `vertex` is meaningless.
 *
 * **`H`, `V` and `A` are deliberately absent**, and this is the one
 * place the table is *not* exhaustive. `points` counts x/y **pairs**,
 * and those three commands do not speak in pairs: `H x` and `V y` carry
 * a single coordinate, and `A` carries `rx ry rot largeArc sweep x y` —
 * two radii, an angle and two flags between the endpoint's coordinates.
 * Reading them with a pair-based arity would mis-split them silently,
 * which is exactly the failure mode this table exists to prevent, so
 * they stay rejected and the caller leaves the attribute alone.
 *
 * The commands with no handles (`L`, `T`, `Z`) are the ones an
 * index-based implementation gets wrong when it assumes "the point
 * after the start is a control point": for `L` there is no handle at
 * all, and for `T` the single point is a vertex whose control point is
 * *implicit* (the reflection of the previous `Q`/`C`), so nothing can
 * be moved without recomputing it.
 */
const SHAPE: Record<string, Shape> = {
    M: { points: 1, handles: 0, vertex: 0 },
    L: { points: 1, handles: 0, vertex: 0 },
    C: { points: 3, handles: 2, vertex: 2 },
    S: { points: 2, handles: 1, vertex: 1 },
    Q: { points: 2, handles: 1, vertex: 1 },
    T: { points: 1, handles: 0, vertex: 0 },
    Z: { points: 0, handles: 0, vertex: 0 },
}

/**
 * One command *repetition* — a single `M`, a single `C`, each pair of a
 * repeated `L a b`, and so on — flattened out of the parsed segments.
 *
 * A `C` is three points, but it is *one* of these, and that is the
 * granularity the anchoring works at: a handle belongs to a repetition
 * and is clamped against that repetition's own vertex, not against
 * "whatever happens to be at index + 1".
 */
interface Group {
    /** Flat index of the repetition's first point. */
    start: number
    /** Flat index of its on-curve point. */
    vertex: number
    /** Flat index of the on-curve point it starts from, or −1. */
    anchor: number
    /** Control points at the head of the repetition. */
    handles: number
}

/**
 * Tokenise an SVG path into command → points, marking on-curve points.
 *
 * Returns `null` for anything it cannot read with certainty:
 *
 *   - a *relative* command (lowercase) — "shift the first curve's
 *     handle" is ambiguous when every coordinate is a delta;
 *   - a command outside `SHAPE`;
 *   - a coordinate count that is not a whole number of repetitions of
 *     that command's arity (a malformed path, or a guess).
 */
function parsePath(d: string): Segment[] | null {
    const segments: Segment[] = []
    let current: string | null = null
    let numbers: number[] = []

    const flush = (): boolean => {
        if (current === null) return true
        const shape = SHAPE[current]
        if (shape === undefined) return false
        /*
         * No coordinates for this command. `Z` is the one command that
         * legitimately carries none, and it still has to survive into the
         * segment list so the rewritten `d` keeps it; anything else with
         * no numbers is a letter followed immediately by another one, and
         * contributes nothing.
         */
        if (numbers.length === 0) {
            if (shape.points === 0) segments.push({ command: current, points: [] })
            return true
        }
        if (shape.points === 0) return false
        if (numbers.length % 2 !== 0) return false
        if (numbers.length / 2 % shape.points !== 0) return false
        const points: PathPoint[] = []
        for (let i = 0; i < numbers.length; i += 2) {
            const x = numbers[i]
            const y = numbers[i + 1]
            if (x === undefined || y === undefined) return false
            points.push({ x, y, onCurve: (i / 2) % shape.points === shape.vertex })
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
            if (letter !== letter.toUpperCase()) return null
            current = letter.toUpperCase()
        } else {
            if (current === null) return null
            numbers.push(Number(value))
            /*
             * Per SVG, coordinate pairs after an `M` are implicit `L`s.
             * dagre never emits that, but honouring it keeps the group
             * arithmetic below correct if a future Mermaid does.
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
 * Flatten the parsed segments into one point per coordinate, plus the
 * repetition each point belongs to and the on-curve point that
 * repetition hangs off.
 *
 * This is the step the index-based version never had, and it is what
 * makes "the handle at the start" a *nameable* thing: the answer is
 * `groups[first curve repetition].start`, not `1`.
 */
function flatten(segments: Segment[]): { points: PathPoint[]; groups: Group[] } {
    const points: PathPoint[] = []
    const groups: Group[] = []
    let previousVertex = -1
    for (const segment of segments) {
        const shape = SHAPE[segment.command]
        if (shape === undefined || shape.points === 0) continue
        for (let at = 0; at + shape.points <= segment.points.length; at += shape.points) {
            const group: Group = {
                start: points.length,
                vertex: points.length + shape.vertex,
                anchor: previousVertex,
                handles: shape.handles,
            }
            for (let k = 0; k < shape.points; k++) {
                points.push(segment.points[at + k] as PathPoint)
            }
            groups.push(group)
            previousVertex = group.vertex
        }
    }
    return { points, groups }
}

/** Where the ray from `centre` through `toward` crosses the card's border. */
export function cardBorderPoint(centre: Point, toward: Point, halfWidth: number, halfHeight: number): Point {
    const dx = toward.x - centre.x
    const dy = toward.y - centre.y
    const toSideX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx)
    const toSideY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy)
    const t = Math.min(toSideX, toSideY)
    if (!Number.isFinite(t)) return { x: centre.x, y: centre.y }
    return { x: centre.x + dx * t, y: centre.y + dy * t }
}

/** Round to Mermaid's own precision (3 decimals) so the rewritten `d` stays as short and stable. */
function round(value: number): number {
    return Math.round(value * 1000) / 1000
}

function serialise(segments: Segment[]): string {
    return segments
        .map((segment) => `${segment.command} ${segment.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}`)
        .join(' ')
}

function unit(x: number, y: number): Point {
    const length = Math.hypot(x, y)
    if (length === 0) return { x: 0, y: 0 }
    return { x: x / length, y: y / length }
}

/**
 * Move the path's start point onto `newStart` and its end point onto
 * `newEnd` by rigidly translating the **run** of geometry that each
 * endpoint is attached to.
 *
 * **Why a run and not just a handle.** A bézier segment's tangent at
 * an end point is the vector to that end's control point, so moving an
 * endpoint alone snaps the curve to a new direction where it meets the
 * card, and moving only the control point is not enough either. The
 * control point is 1/6 of the way along dagre's first leg (d3's
 * `curveBasis` puts it at `(2p₀ + p₁) / 3` against a lead-in vertex at
 * `(5p₀ + p₁) / 6`), so on a *real* path the endpoint has to travel
 * 36 – 83 user units to reach the card border while that lead-in sits
 * only ~11 units along the leg. Drag the handle alone and the lead-in
 * vertex is left behind: the path leaves the card, the curve turns back
 * to meet it, and the tangent is gone. Drag the lead-in vertex *too*
 * and the run slides along the line it was already on, which is
 * invisible — the path is the same curve, reached a little further.
 *
 * So the run at each end is measured **positionally**: it reaches from
 * the endpoint back along the path's own direction of travel, as far as
 * the points that lie at or before the endpoint's new position, and no
 * further.
 *
 * That single rule covers both ends of the problem. d3's `curveBasis`
 * puts the first control point 1/6 of the way along the first leg and
 * the last 1/6 of the way back from the last, so on a real path the
 * runs come out as `[exit, lead-in, first control]` and
 * `[last control, its vertex, entry]` — a rigid translation of a
 * straight stretch, which preserves every join angle exactly. It also
 * covers the shapes where there is no handle to speak of: a `curveLinear`
 * polyline needs no run at all (its neighbouring vertex is already on
 * the ray the endpoint is walked out along), while d3's `curveStep`
 * staircase *does* need one, because its terminal `L` is a duplicate of
 * the point before it and leaving that behind doubles the path back over
 * itself.
 *
 * A path with no direction of its own — a single point, or one whose
 * first leg is zero-length, which d3 emits for a `curveBumpX` edge
 * leaving straight up — falls back to the tangent-carrying handle
 * instead, which is the nearest thing to an answer the path offers.
 *
 * Every join *inside* a run keeps its angle exactly, and so does every
 * join *between* a run and the untouched middle: the first repetition's
 * head anchor is in the head run and its tail handle is not, so its
 * start tangent moves with the run and its end tangent does not — the
 * same as if nothing had happened. On the captured corpus the turn
 * angle at every interior vertex is identical before and after, and the
 * middle of the path is byte-for-byte Mermaid's own output.
 *
 * **Why the runs are accumulated before they are applied.** A lone
 * `S`/`Q` repetition has one control point governing both of its ends,
 * and if both runs reach it, it has to receive both deltas.
 */
function anchorEnds(
    segments: Segment[],
    newStart: Point,
    newEnd: Point,
    departure: Point,
    arrival: Point,
): Segment[] {
    const { points, groups } = flatten(segments)
    const lastIndex = points.length - 1
    if (lastIndex < 0) return segments

    const first = points[0] as PathPoint
    const last = points[lastIndex] as PathPoint
    const deltas: Point[] = points.map(() => ({ x: 0, y: 0 }))
    const addTo = (from: number, to: number, delta: Point): void => {
        for (let i = from; i <= to; i++) {
            const current = deltas[i] as Point
            deltas[i] = { x: current.x + delta.x, y: current.y + delta.y }
        }
    }

    // The run at each end of the path.
    const curves = groups.filter((group) => group.handles > 0)
    const firstCurve = curves[0]
    const lastCurve = curves[curves.length - 1]
    const hasDeparture = departure.x !== 0 || departure.y !== 0
    const hasArrival = arrival.x !== 0 || arrival.y !== 0

    /*
     * How far the endpoint has actually travelled along the path's own
     * direction of travel, rather than how far the cards moved it. A run
     * that reached past a point the endpoint never passed would drag that
     * point *backwards*, which is the fold this exists to prevent.
     *
     * Where the path has no direction at all to measure against — a
     * single point, or a first leg of zero length, which d3 emits for a
     * `curveBumpX` edge leaving straight up — the tangent-carrying handle
     * stands in instead, which is the nearest thing to an answer the path
     * offers.
     */
    const along = (point: Point, direction: Point): number => point.x * direction.x + point.y * direction.y
    let headEnd = 0
    if (hasDeparture) {
        while (headEnd + 1 <= lastIndex && along(points[headEnd + 1] as PathPoint, departure) <= along(newStart, departure)) {
            headEnd += 1
        }
    } else if (firstCurve !== undefined) {
        headEnd = firstCurve.start
    }
    let tailStart = lastIndex
    if (hasArrival) {
        while (tailStart - 1 >= 0 && along(points[tailStart - 1] as PathPoint, arrival) >= along(newEnd, arrival)) {
            tailStart -= 1
        }
    } else if (lastCurve !== undefined) {
        tailStart = Math.min(tailStart, lastCurve.start + lastCurve.handles - 1)
    }

    addTo(0, headEnd, { x: newStart.x - first.x, y: newStart.y - first.y })
    addTo(tailStart, lastIndex, { x: newEnd.x - last.x, y: newEnd.y - last.y })

    const moved: PathPoint[] = points.map((point, index) => {
        const delta = deltas[index] as Point
        return { x: point.x + delta.x, y: point.y + delta.y, onCurve: point.onCurve }
    })

    /*
     * Rescale the handle on the far side of any repetition whose span
     * changed.
     *
     * A run carries one end of a repetition and never the other, so the
     * repetition's span grows or shrinks while the handle at the *moved*
     * end keeps its length (it slid with its own point) and the handle
     * at the *unmoved* end is left at the length that fitted the old
     * span. Left alone, that handle reaches past its own vertex and the
     * segment hooks: on the captured corpus the last cubic of a
     * diagonal `curveBasis` edge comes out with its head control still
     * 4.9 units *below* the vertex it is supposed to lead into, and
     * Chrome's own path geometry shows a 75.81° turn over a 12-unit
     * window where Mermaid drew 18.61°.
     *
     * Scaling it by the span ratio is the standard way to shorten a
     * bézier without moving either tangent: the handle keeps its
     * direction, so every join angle is untouched, and its length stays
     * in proportion to the segment it shapes. When both ends of a
     * repetition moved — a lone `S`/`Q` segment, whose single control
     * point is in both runs — the ratio is 1 and nothing happens.
     */
    for (const group of curves) {
        if (group.anchor < 0) continue
        const span = Math.hypot(
            (points[group.vertex] as PathPoint).x - (points[group.anchor] as PathPoint).x,
            (points[group.vertex] as PathPoint).y - (points[group.anchor] as PathPoint).y,
        )
        const movedSpan = Math.hypot(
            (moved[group.vertex] as PathPoint).x - (moved[group.anchor] as PathPoint).x,
            (moved[group.vertex] as PathPoint).y - (moved[group.anchor] as PathPoint).y,
        )
        if (span === 0 || movedSpan === 0) continue
        const ratio = movedSpan / span
        if (ratio === 1) continue
        const movedIt = (index: number): boolean => {
            const delta = deltas[index]
            return delta !== undefined && (delta.x !== 0 || delta.y !== 0)
        }
        const scaleAbout = (index: number, baseIndex: number): void => {
            const base = moved[baseIndex] as PathPoint
            const current = moved[index] as PathPoint
            moved[index] = {
                x: base.x + (current.x - base.x) * ratio,
                y: base.y + (current.y - base.y) * ratio,
                onCurve: (points[index] as PathPoint).onCurve,
            }
        }
        if (group.handles > 0 && movedIt(group.vertex) && !movedIt(group.start)) {
            // The vertex moved and the anchor did not: shorten the head
            // handle about the anchor.
            scaleAbout(group.start, group.anchor)
        }
        if (group.handles > 0 && movedIt(group.anchor) && !movedIt(group.start + group.handles - 1)) {
            // The anchor moved and the vertex did not: shorten the tail
            // handle about the vertex.
            scaleAbout(group.start + group.handles - 1, group.vertex)
        }
    }

    for (const group of groups) {
        if (group.anchor < 0) continue
        for (let k = 0; k < group.handles; k++) {
            const index = group.start + k
            const delta = deltas[index] as Point
            if (delta.x === 0 && delta.y === 0) continue
            /*
             * A head handle hangs off the repetition's *anchor*, a tail
             * handle off its *vertex*. Measuring the clamp from the wrong
             * one rotates the handle onto the original direction and puts
             * a visible kink at the far join — measured at 113° on the
             * captured `curveBasis` corpus when the tail was measured
             * from the anchor instead of the vertex.
             */
            const base = k === 0 ? (moved[group.anchor] as PathPoint) : (moved[group.vertex] as PathPoint)
            const originalBase = k === 0 ? (points[group.anchor] as PathPoint) : (points[group.vertex] as PathPoint)
            const far = k === 0 ? (moved[group.vertex] as PathPoint) : (moved[group.anchor] as PathPoint)
            moved[index] = clampHandle(moved[index] as PathPoint, points[index] as PathPoint, base, originalBase, far)
        }
    }

    let seen = 0
    return segments.map((segment) => ({
        command: segment.command,
        points: segment.points.map(() => moved[seen++] as PathPoint),
    }))
}

/**
 * A translated handle, held to two bounds so a run can never fold the
 * path back on itself:
 *
 *   - it keeps the **direction** it had relative to the point it hangs
 *     off — a repetition's anchor for a head handle, its vertex for a
 *     tail handle. It may be shortened, never turned around.
 *   - it is never **longer than the room** from that point to the far
 *     end of the repetition, which is what would turn the segment into
 *     a loop.
 *
 * The reference direction is read off the **original** handle and the
 * **original** point it hung off, while the length and the room are read
 * off the **moved** ones. Mixing the two — measuring a handle's
 * original reach from where its anchor ended up — silently rotates the
 * handle onto a different ray, which is what put a 113° kink at the far
 * join of every `curveBasis` edge before this was split in two.
 */
function clampHandle(
    handle: PathPoint,
    original: PathPoint,
    base: PathPoint,
    originalBase: PathPoint,
    far: PathPoint,
): PathPoint {
    const reference = { x: original.x - originalBase.x, y: original.y - originalBase.y }
    const referenceLength = Math.hypot(reference.x, reference.y)
    if (referenceLength === 0) return handle
    const reach = Math.hypot(handle.x - base.x, handle.y - base.y)
    if (reach === 0) return handle
    const room = Math.hypot(far.x - base.x, far.y - base.y)
    const turnedAround = (handle.x - base.x) * reference.x + (handle.y - base.y) * reference.y < 0
    const length = Math.min(turnedAround ? referenceLength : reach, room)
    return {
        x: base.x + (reference.x / referenceLength) * length,
        y: base.y + (reference.y / referenceLength) * length,
        onCurve: handle.onCurve,
    }
}

/**
 * The path's direction of travel where it *ends*, as a unit vector —
 * i.e. the direction an `orient="auto"` end marker is rotated to.
 *
 * **Command-aware, because the two cases are different vectors.** If
 * the last repetition carries handles, the direction is the curve's end
 * tangent — from the *tail control point* to the vertex. If it does not
 * (a trailing `L`, as `curveBasis` always emits), the direction is the
 * chord from the previous on-curve point. An index-based version read
 * `points[n - 2]`, which is the tail control point for a `C` and the
 * last cubic's *on-curve* endpoint for the `… C … L …` shape dagre
 * actually produces.
 *
 * A path whose last two points coincide, or that has fewer than two
 * points, has no direction at all: `(0, 0)` is returned, which turns
 * any overshoot into a no-op rather than a guess. That is not a
 * cop-out: d3's `curveStep` ends every edge with a zero-length `L`, so
 * Mermaid's own marker on such a path has no orientation to honour.
 */
function endTangent(groups: Group[], points: PathPoint[]): Point {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup === undefined) return { x: 0, y: 0 }
    const end = points[lastGroup.vertex]
    if (end === undefined) return { x: 0, y: 0 }
    if (lastGroup.handles > 0) {
        const handle = points[lastGroup.start + lastGroup.handles - 1]
        if (handle !== undefined) return unit(end.x - handle.x, end.y - handle.y)
    }
    // No handle to aim by (a line, or a smooth-quadratic's reflection
    // whose control point is implicit). Mermaid's flowchart router emits
    // neither of those after a curve, so the chord from the previous
    // on-curve point is the honest fallback.
    if (lastGroup.anchor < 0) return { x: 0, y: 0 }
    const anchor = points[lastGroup.anchor]
    if (anchor === undefined) return { x: 0, y: 0 }
    return unit(end.x - anchor.x, end.y - anchor.y)
}

/**
 * How far along its own line the path travels, at each end, as a unit
 * vector: away from the start point at one end and away from the end
 * point at the other. These bound how much of the path the endpoint's
 * move can drag along (see `anchorEnds`).
 *
 * Each is read off the *nearest* handle where there is one, and off the
 * nearest pair of distinct on-curve points otherwise — d3 emits
 * degenerate handles (`curveBumpX` puts the first control point on the
 * start vertex, `curveStep` repeats the last point), and a handle that
 * sits on the point it measures from has no direction to give.
 */function endDirections(groups: Group[], points: PathPoint[]): { departure: Point; arrival: Point } {
    const firstGroup = groups[0]
    const lastGroup = groups[groups.length - 1]
    if (firstGroup === undefined || lastGroup === undefined) {
        return { departure: { x: 0, y: 0 }, arrival: { x: 0, y: 0 } }
    }
    const vertices = groups
        .map((group) => points[group.vertex])
        .filter((point): point is PathPoint => point !== undefined)
    const first = points[0] as PathPoint | undefined
    const last = points[points.length - 1] as PathPoint | undefined

    let departure = { x: 0, y: 0 }
    if (firstGroup.handles > 0) {
        const head = points[firstGroup.start]
        if (first !== undefined && head !== undefined) departure = unit(head.x - first.x, head.y - first.y)
    }
    let arrival = { x: 0, y: 0 }
    if (lastGroup.handles > 0) {
        const tail = points[lastGroup.start + lastGroup.handles - 1]
        if (last !== undefined && tail !== undefined) arrival = unit(last.x - tail.x, last.y - tail.y)
    }
    // Fall back to the chord to the next on-curve point the head run and
    // the tail run are both made of.
    if (departure.x === 0 && departure.y === 0 && first !== undefined) {
        for (const vertex of vertices) {
            const chord = unit(vertex.x - first.x, vertex.y - first.y)
            if (chord.x !== 0 || chord.y !== 0) {
                departure = chord
                break
            }
        }
    }
    if (arrival.x === 0 && arrival.y === 0 && last !== undefined) {
        for (let i = vertices.length - 2; i >= 0; i--) {
            const chord = unit(last.x - (vertices[i] as PathPoint).x, last.y - (vertices[i] as PathPoint).y)
            if (chord.x !== 0 || chord.y !== 0) {
                arrival = chord
                break
            }
        }
    }
    return { departure, arrival }
}

/**
 * `border` walked back along the marker's own direction by `overshoot` —
 * the point the path has to *stop* at for its arrow **tip** to land on
 * `border`.
 *
 * The inset is along the path's travel direction rather than the ray
 * from the node's centre, because that is the line the marker is drawn
 * on: subtracting the overshoot from the wrong direction would leave
 * the tip off the border by up to `overshoot` for a diagonal edge.
 */
function shortOfBorder(border: Point, tangent: Point, overshoot: number): Point {
    if (overshoot === 0) return border
    return { x: border.x - tangent.x * overshoot, y: border.y - tangent.y * overshoot }
}

/**
 * Re-anchor one edge path so it starts on `source`'s card border and
 * its arrow **tip** lands on `target`'s card border.
 *
 * `endOvershoot` is how far past the path's end the end marker's tip
 * is drawn (see `ARROWHEAD_OVERSHOOT`, which is the default because
 * every edge `mermaidSource.ts` emits is a `--> arrow`). The endpoint
 * is stopped short by exactly that much along the path's own end
 * direction, so the *tip* — not the path end — meets the border. Pass
 * `0` for a path with no end marker; the start point is never
 * compensated, because Mermaid emits no `marker-start` for it.
 *
 * Returns `null` when the path cannot be parsed, carries no points, or
 * does not begin with an `M` — all of which are the caller's signal to
 * leave the attribute alone, since "the first point is a vertex the ray
 * can start from" is what the rest of this function assumes. A node
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
    // Every path dagre emits through Mermaid opens with `M`; one that
    // does not has no "endpoint" for the ray to walk out from.
    if (segments[0]?.command !== 'M') return null
    const { points, groups } = flatten(segments)
    const first = points[0]
    const last = points[points.length - 1]
    if (first === undefined || last === undefined) return null
    const { departure, arrival } = endDirections(groups, points)
    return serialise(
        anchorEnds(
            segments,
            cardBorderPoint(source, first, halfWidth, halfHeight),
            shortOfBorder(
                cardBorderPoint(target, last, halfWidth, halfHeight),
                endTangent(groups, points),
                endOvershoot,
            ),
            departure,
            arrival,
        ),
    )
}

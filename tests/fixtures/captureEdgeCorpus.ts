/**
 * Development-only corpus generator for `tests/fixtures/edgePathCorpus.ts`.
 *
 * Loaded only by `tests/fixtures/captureEdgeCorpus.html` through the Vite
 * dev server; see that file for the "why" and the "how to run it". It is
 * not part of the build (`vite build` only ever sees `src/main.ts`) and
 * not part of the test run (`vite.config.ts` only collects
 * `*.{test,spec}.{js,ts}`).
 *
 * The page carries a verbatim copy of the pre-fix, index-based
 * implementation (`reanchorEdgePathOLD`) next to the shipped
 * `reanchorEdgePath`, so every real path can be measured both ways in a
 * single pass — which is what produced the "before" column in
 * `edgePathCorpus.ts`.
 */
import mermaid from 'mermaid'
import { buildMermaidSource } from '../../src/lib/mermaidSource'
import {
    NODE_CARD_AVATAR_SIZE,
    NODE_CARD_BORDER,
    NODE_CARD_HEIGHT,
    NODE_CARD_PADDING_BLOCK,
    NODE_CARD_ROW2_HEIGHT,
    NODE_CARD_ROW_GAP,
    NODE_CARD_WIDTH,
    edgeEndsFromMermaidId,
    measureNodeCentres,
    nodeIdFromMermaidId,
    type NodeCentre,
} from '../../src/lib/nodeLayout'
import { ARROWHEAD_OVERSHOOT, parsePathPoints, reanchorEdgePath } from '../../src/lib/edgeGeometry'
import {
    ARITY,
    arrowTip,
    commands,
    distanceToBorder,
    flatPoints,
    maxInteriorShift,
    maxTurnAngle,
    turnAngles,
} from './pathMetrics'

/* `pathMetrics`' browser-side measure, aliased so the two `waviness`
 * spellings in this file (the local wrapper and the imported measure) do
 * not collide. */
import { renderedWaviness as renderedWavinessOn } from './pathMetrics'
import type { GraphPayload } from '../../src/types'

interface Pt {
    x: number
    y: number
}

/* ------------------------------------------------------------------ *
 * The pre-fix, index-based implementation, copied verbatim from
 * `src/lib/edgeGeometry.ts` at commit 7c275f2.
 * ------------------------------------------------------------------ */

interface PP extends Pt {
    onCurve: boolean
}
interface Seg {
    command: string
    points: PP[]
}
const SHAPE_OLD: Record<string, { points: number; onCurveAt: readonly number[] }> = {
    M: { points: 1, onCurveAt: [0] },
    L: { points: 1, onCurveAt: [0] },
    C: { points: 3, onCurveAt: [2] },
}
function parsePathOLD(d: string): Seg[] | null {
    const segments: Seg[] = []
    let current: string | null = null
    let numbers: number[] = []
    const flush = (): boolean => {
        if (current === null) return true
        const shape = SHAPE_OLD[current]
        if (shape === undefined) return false
        if (numbers.length === 0) return true
        if (numbers.length % 2 !== 0) return false
        if (numbers.length / 2 % shape.points !== 0) return false
        const points: PP[] = []
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
            if (current === 'M' && numbers.length === 2) {
                if (!flush()) return null
                current = 'L'
            }
        }
    }
    if (!flush()) return null
    return segments.length > 0 ? segments : null
}
function cardBorderPointOLD(centre: Pt, toward: Pt, halfWidth: number, halfHeight: number): Pt {
    const dx = toward.x - centre.x
    const dy = toward.y - centre.y
    const toSideX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx)
    const toSideY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy)
    const t = Math.min(toSideX, toSideY)
    if (!Number.isFinite(t)) return { x: centre.x, y: centre.y }
    return { x: centre.x + dx * t, y: centre.y + dy * t }
}
function clampHandleOLD(endpoint: Pt, oldEndpoint: PP, oldHandle: PP, neighbour: PP | undefined): PP {
    const moved: Pt = { x: endpoint.x + oldHandle.x - oldEndpoint.x, y: endpoint.y + oldHandle.y - oldEndpoint.y }
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
function anchorEndsOLD(segments: Seg[], newStart: Pt, newEnd: Pt): Seg[] {
    const points = segments.flatMap((s) => s.points)
    const total = points.length
    if (total === 0) return segments
    const moved: PP[] = points.map((p) => ({ ...p }))
    moved[0] = { ...newStart, onCurve: true }
    if (total > 1) moved[total - 1] = { ...newEnd, onCurve: true }
    if (total >= 3) {
        const middle = points.slice(2, total - 2)
        const nextOnCurve = middle.find((p) => p.onCurve)
        const prevOnCurve = [...middle].reverse().find((p) => p.onCurve)
        moved[1] = clampHandleOLD(newStart, points[0] as PP, points[1] as PP, nextOnCurve)
        moved[total - 2] = clampHandleOLD(newEnd, points[total - 1] as PP, points[total - 2] as PP, prevOnCurve)
    }
    let seen = 0
    return segments.map((s) => ({ command: s.command, points: s.points.map(() => moved[seen++] as PP) }))
}
function endTangentOLD(points: PP[]): Pt {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    if (last === undefined || prev === undefined) return { x: 0, y: 0 }
    const length = Math.hypot(last.x - prev.x, last.y - prev.y)
    if (length === 0) return { x: 0, y: 0 }
    return { x: (last.x - prev.x) / length, y: (last.y - prev.y) / length }
}
function serialiseOLD(segments: Seg[]): string {
    const r = (v: number): number => Math.round(v * 1000) / 1000
    return segments
        .map((s) => `${s.command} ${s.points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')}`)
        .join(' ')
}
function reanchorEdgePathOLD(
    d: string,
    source: Pt,
    target: Pt,
    halfWidth: number,
    halfHeight: number,
    endOvershoot: number = ARROWHEAD_OVERSHOOT,
): string | null {
    const segments = parsePathOLD(d)
    if (segments === null) return null
    const points = segments.flatMap((s) => s.points)
    const first = points[0]
    const last = points[points.length - 1]
    if (first === undefined || last === undefined) return null
    const unit = endTangentOLD(points)
    const border = cardBorderPointOLD(target, last, halfWidth, halfHeight)
    return serialiseOLD(
        anchorEndsOLD(segments, cardBorderPointOLD(source, first, halfWidth, halfHeight), {
            x: border.x - unit.x * endOvershoot,
            y: border.y - unit.y * endOvershoot,
        }),
    )
}

/* ------------------------------------------------------------------ *
 * The run-translating implementation, copied verbatim from
 * `src/lib/edgeGeometry.ts` at commit 5f24fcd.
 *
 * This is the *second* regression, and the one the module docblock
 * describes as the wobble: it kept every join tangent, and it still
 * S-curved 28 of the 33 real `curveBasis` paths, because a run boundary
 * lands between the last cubic's two control points. It sits next to
 * `reanchorEdgePathOLD` (the index-based implementation, which folded
 * the paths outright) so both predecessors can be measured against the
 * same real paths in a single pass, and so the corpus carries a
 * `reversalsRuns*` column that says which of them wobbled and which
 * folded.
 *
 * Only the entry point and the two type names are renamed, so the
 * harness can hold all three implementations side by side; the
 * geometry is byte-for-byte the shipped code. The overshoot is read off
 * the shipped module rather than re-declared, because it is a property
 * of Mermaid's marker and both have to agree.
 * ------------------------------------------------------------------ */

interface RunsPoint {
    x: number
    y: number
}

/**
 * The arrowhead overshoot, read off the shipped module rather than
 * re-declared here: it is a property of Mermaid's marker, not of this
 * implementation, and both have to agree for the comparison in the
 * corpus to mean anything. See `src/lib/edgeGeometry.ts →
 * ARROWHEAD_OVERSHOOT` for the derivation and the measurement.
 */
const RUNS_OVERSHOOT = ARROWHEAD_OVERSHOOT

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
interface RunsPathPoint extends RunsPoint {
    onCurve: boolean
}

interface Segment {
    command: string
    points: RunsPathPoint[]
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
        const points: RunsPathPoint[] = []
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
 * Flatten the parsed segments into one point per coordinate, plus the
 * repetition each point belongs to and the on-curve point that
 * repetition hangs off.
 *
 * This is the step the index-based version never had, and it is what
 * makes "the handle at the start" a *nameable* thing: the answer is
 * `groups[first curve repetition].start`, not `1`.
 */
function flatten(segments: Segment[]): { points: RunsPathPoint[]; groups: Group[] } {
    const points: RunsPathPoint[] = []
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
                points.push(segment.points[at + k] as RunsPathPoint)
            }
            groups.push(group)
            previousVertex = group.vertex
        }
    }
    return { points, groups }
}

/** Where the ray from `centre` through `toward` crosses the card's border. */
function runsCardBorderPoint(centre: RunsPoint, toward: RunsPoint, halfWidth: number, halfHeight: number): RunsPoint {
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

function unit(x: number, y: number): RunsPoint {
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
    newStart: RunsPoint,
    newEnd: RunsPoint,
    departure: RunsPoint,
    arrival: RunsPoint,
): Segment[] {
    const { points, groups } = flatten(segments)
    const lastIndex = points.length - 1
    if (lastIndex < 0) return segments

    const first = points[0] as RunsPathPoint
    const last = points[lastIndex] as RunsPathPoint
    const deltas: RunsPoint[] = points.map(() => ({ x: 0, y: 0 }))
    const addTo = (from: number, to: number, delta: RunsPoint): void => {
        for (let i = from; i <= to; i++) {
            const current = deltas[i] as RunsPoint
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
    const along = (point: RunsPoint, direction: RunsPoint): number => point.x * direction.x + point.y * direction.y
    let headEnd = 0
    if (hasDeparture) {
        while (headEnd + 1 <= lastIndex && along(points[headEnd + 1] as RunsPathPoint, departure) <= along(newStart, departure)) {
            headEnd += 1
        }
    } else if (firstCurve !== undefined) {
        headEnd = firstCurve.start
    }
    let tailStart = lastIndex
    if (hasArrival) {
        while (tailStart - 1 >= 0 && along(points[tailStart - 1] as RunsPathPoint, arrival) >= along(newEnd, arrival)) {
            tailStart -= 1
        }
    } else if (lastCurve !== undefined) {
        tailStart = Math.min(tailStart, lastCurve.start + lastCurve.handles - 1)
    }

    addTo(0, headEnd, { x: newStart.x - first.x, y: newStart.y - first.y })
    addTo(tailStart, lastIndex, { x: newEnd.x - last.x, y: newEnd.y - last.y })

    const moved: RunsPathPoint[] = points.map((point, index) => {
        const delta = deltas[index] as RunsPoint
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
            (points[group.vertex] as RunsPathPoint).x - (points[group.anchor] as RunsPathPoint).x,
            (points[group.vertex] as RunsPathPoint).y - (points[group.anchor] as RunsPathPoint).y,
        )
        const movedSpan = Math.hypot(
            (moved[group.vertex] as RunsPathPoint).x - (moved[group.anchor] as RunsPathPoint).x,
            (moved[group.vertex] as RunsPathPoint).y - (moved[group.anchor] as RunsPathPoint).y,
        )
        if (span === 0 || movedSpan === 0) continue
        const ratio = movedSpan / span
        if (ratio === 1) continue
        const movedIt = (index: number): boolean => {
            const delta = deltas[index]
            return delta !== undefined && (delta.x !== 0 || delta.y !== 0)
        }
        const scaleAbout = (index: number, baseIndex: number): void => {
            const base = moved[baseIndex] as RunsPathPoint
            const current = moved[index] as RunsPathPoint
            moved[index] = {
                x: base.x + (current.x - base.x) * ratio,
                y: base.y + (current.y - base.y) * ratio,
                onCurve: (points[index] as RunsPathPoint).onCurve,
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
            const delta = deltas[index] as RunsPoint
            if (delta.x === 0 && delta.y === 0) continue
            /*
             * A head handle hangs off the repetition's *anchor*, a tail
             * handle off its *vertex*. Measuring the clamp from the wrong
             * one rotates the handle onto the original direction and puts
             * a visible kink at the far join — measured at 113° on the
             * captured `curveBasis` corpus when the tail was measured
             * from the anchor instead of the vertex.
             */
            const base = k === 0 ? (moved[group.anchor] as RunsPathPoint) : (moved[group.vertex] as RunsPathPoint)
            const originalBase = k === 0 ? (points[group.anchor] as RunsPathPoint) : (points[group.vertex] as RunsPathPoint)
            const far = k === 0 ? (moved[group.vertex] as RunsPathPoint) : (moved[group.anchor] as RunsPathPoint)
            moved[index] = clampHandle(moved[index] as RunsPathPoint, points[index] as RunsPathPoint, base, originalBase, far)
        }
    }

    let seen = 0
    return segments.map((segment) => ({
        command: segment.command,
        points: segment.points.map(() => moved[seen++] as RunsPathPoint),
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
    handle: RunsPathPoint,
    original: RunsPathPoint,
    base: RunsPathPoint,
    originalBase: RunsPathPoint,
    far: RunsPathPoint,
): RunsPathPoint {
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
function endTangent(groups: Group[], points: RunsPathPoint[]): RunsPoint {
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
 */function endDirections(groups: Group[], points: RunsPathPoint[]): { departure: RunsPoint; arrival: RunsPoint } {
    const firstGroup = groups[0]
    const lastGroup = groups[groups.length - 1]
    if (firstGroup === undefined || lastGroup === undefined) {
        return { departure: { x: 0, y: 0 }, arrival: { x: 0, y: 0 } }
    }
    const vertices = groups
        .map((group) => points[group.vertex])
        .filter((point): point is RunsPathPoint => point !== undefined)
    const first = points[0] as RunsPathPoint | undefined
    const last = points[points.length - 1] as RunsPathPoint | undefined

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
            const chord = unit(last.x - (vertices[i] as RunsPathPoint).x, last.y - (vertices[i] as RunsPathPoint).y)
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
function shortOfBorder(border: RunsPoint, tangent: RunsPoint, overshoot: number): RunsPoint {
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
function reanchorEdgePathRuns(
    d: string,
    source: RunsPoint,
    target: RunsPoint,
    halfWidth: number,
    halfHeight: number,
    endOvershoot: number = RUNS_OVERSHOOT,
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
            runsCardBorderPoint(source, first, halfWidth, halfHeight),
            shortOfBorder(
                runsCardBorderPoint(target, last, halfWidth, halfHeight),
                endTangent(groups, points),
                endOvershoot,
            ),
            departure,
            arrival,
        ),
    )
}

/* ------------------------------------------------------------------ *
 * Extra measurement: did a handle have to be clamped?
 * ------------------------------------------------------------------ */
const round3 = (xs: number[]): number[] => xs.map((x) => Math.round(x * 1000) / 1000)

/**
 * Largest turn per window the **browser's own path geometry** shows,
 * over a window proportional to the path's own length (4 %, at least 4
 * units, sampled a quarter-window at a time).
 *
 * This is the rendered-geometry counterpart to `maxTurnAngle`, and it is
 * the one that cannot be fooled by a bad model of the path: it asks
 * Chrome where the ink goes. A displaced vertex or a folded-back run
 * shows up as a large angle over a short distance; a curve that merely
 * reaches further does not.
 *
 * The window has to be a *fraction* of the length. Re-anchoring makes
 * these paths roughly half as long as Mermaid drew them, so a fixed
 * window would span twice as much of the curve and report a curvature
 * that has not changed. Measured over 4 % of the length, a cubic
 * reports a few degrees and a fold-back reports 180.
 */
function renderedMaxWindowTurn(d: string): number {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('d', d)
    probe.setAttribute('fill', 'none')
    probe.setAttribute('stroke', 'none')
    probeHost.appendChild(probe)
    try {
        const total = probe.getTotalLength()
        if (total === 0) return 0
        const window = Math.max(4, total * 0.04)
        const step = window / 4
        let worst = 0
        for (let s = 0; s + window <= total; s += step) {
            const a = probe.getPointAtLength(s)
            const b = probe.getPointAtLength(s + window / 2)
            const c = probe.getPointAtLength(s + window)
            const t1 = Math.atan2(b.y - a.y, b.x - a.x)
            const t2 = Math.atan2(c.y - b.y, c.x - b.x)
            let degrees = ((t2 - t1) * 180) / Math.PI
            if (degrees < 0) degrees += 360
            worst = Math.max(worst, Math.min(degrees, 360 - degrees))
        }
        return Math.round(worst * 100) / 100
    } finally {
        probe.remove()
    }
}

/**
 * The tangent's **reversals** on a rendered path, measured on a real
 * `<path>` in a real browser. The browser cross-check on
 * `pathMetrics.ts → inflections`: the closed form needs no browser, so it
 * is what the suite asserts on (it tests the *live* implementation),
 * while this one asks Chrome where the ink actually goes and is recorded
 * per path so the two can be compared.
 *
 * It needs a real element because the measure is about the *rendered*
 * curve, whose tangents are not the tangents between the control points
 * the `d` lists.
 */
function renderedWaviness(d: string): { reversals: number; reversalTurn: number } {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('d', d)
    probe.setAttribute('fill', 'none')
    probe.setAttribute('stroke', 'none')
    probeHost.appendChild(probe)
    try {
        return renderedWavinessOn(probe)
    } finally {
        probe.remove()
    }
}
/**
 * Does the **rendered** path cross itself?
 *
 * A fold always does: the leg that doubles back runs along the leg that
 * came out. This is the scale-independent, model-free "no
 * discontinuity" test — unlike a turn-per-window measure it does not
 * care how long the path is, so it compares a path that reaches further
 * and got shorter with the one Mermaid drew on equal terms.
 *
 * Sampled every 0.5 units; a crossing is any two samples more than 2
 * units apart along the path landing within 0.75 units of each other.
 */
function renderedSelfIntersects(d: string): boolean {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('d', d)
    probe.setAttribute('fill', 'none')
    probe.setAttribute('stroke', 'none')
    probeHost.appendChild(probe)
    try {
        const total = probe.getTotalLength()
        const samples: Pt[] = []
        for (let s = 0; s <= total; s += 0.5) {
            const p = probe.getPointAtLength(s)
            samples.push({ x: p.x, y: p.y })
        }
        for (let i = 0; i < samples.length; i++) {
            for (let j = i + 5; j < samples.length; j++) {
                if (
                    Math.hypot((samples[j] as Pt).x - (samples[i] as Pt).x, (samples[j] as Pt).y - (samples[i] as Pt).y) <
                    0.75
                ) {
                    return true
                }
            }
        }
        return false
    } finally {
        probe.remove()
    }
}

const probeHost = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
probeHost.setAttribute('width', '0')
probeHost.setAttribute('height', '0')
probeHost.setAttribute('style', 'position:absolute;left:-99999px;top:0;overflow:hidden;')
document.body.appendChild(probeHost)

/**
 * Length of the first (`which = 0`) or last (`which = 1`) curve
 * repetition's *outermost* control handle, measured from the point it
 * hangs off. A re-anchored path that keeps this length has not had a
 * handle rotated or collapsed; a shorter one has been clamped.
 */
function handleLength(d: string, which: 0 | 1): number {
    const segments = parsePathPoints(d)
    if (segments === null) return Number.NaN
    const groups: Array<{ vertex: number; handles: number; anchor: number; start: number }> = []
    const flat: Pt[] = []
    let previousVertex = -1
    for (const segment of segments) {
        const shape = ARITY[segment.command]
        if (shape === undefined || shape.points === 0) continue
        for (let at = 0; at + shape.points <= segment.points.length; at += shape.points) {
            const start = flat.length
            groups.push({ start, vertex: start + shape.points - 1, anchor: previousVertex, handles: shape.controls })
            for (let k = 0; k < shape.points; k++) flat.push(segment.points[at + k] as Pt)
            previousVertex = start + shape.points - 1
        }
    }
    const curves = groups.filter((g) => g.handles > 0)
    const group = which === 0 ? curves[0] : curves[curves.length - 1]
    if (group === undefined) return Number.NaN
    const handle = flat[group.start + (which === 0 ? 0 : group.handles - 1)] as Pt
    const base = flat[which === 0 ? group.anchor : group.vertex] as Pt
    if (handle === undefined || base === undefined) return Number.NaN
    return Math.hypot(handle.x - base.x, handle.y - base.y)
}

/* ------------------------------------------------------------------ *
 * Graphs.
 * ------------------------------------------------------------------ */

interface Fixture {
    name: string
    note: string
    names: Record<number, string>
    edges: Array<[number, number]>
}

const FIXTURES: Fixture[] = [
    {
        name: 'two-node-chain',
        note: 'one source, one target: the smallest graph the endpoint can return',
        names: { 1: 'Marketing Lead', 2: 'Content Writer' },
        edges: [[1, 2]],
    },
    {
        name: 'three-chain',
        note: 'a single rank-spanning edge, centred on both nodes',
        names: { 1: 'Marketing Lead', 2: 'Content Writer', 3: 'SEO Analyst' },
        edges: [[1, 2], [2, 3]],
    },
    {
        name: 'diamond',
        note: 'two sources converging on one target — the shortest diagonal fan',
        names: { 1: 'Marketing Lead', 2: 'Content Writer', 3: 'SEO Analyst', 4: 'Growth Reviewer' },
        edges: [[1, 2], [1, 3], [2, 4], [3, 4]],
    },
    {
        name: 'wide-fan',
        note: 'one source with five targets: the sub-agent shape this plugin exists for',
        names: {
            1: 'Marketing Lead',
            2: 'Content Writer',
            3: 'SEO Analyst',
            4: 'Social Scheduler',
            5: 'Email Campaign Manager',
            6: 'Paid Ads Strategist',
        },
        edges: [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6]],
    },
    {
        name: 'deep-chain',
        note: 'five ranks: the longest curve dagre emits through this plugin',
        names: {
            11: 'Marketing Lead',
            12: 'Campaign Manager',
            13: 'Content Writer',
            14: 'Copy Editor',
            15: 'Publishing Coordinator',
        },
        edges: [[11, 12], [12, 13], [13, 14], [14, 15]],
    },
    {
        name: 'team-7',
        note: 'the real 7-agent team graph the operator opens, with mixed fan + chain edges',
        names: {
            11: 'Marketing Lead',
            12: 'Content Writer',
            13: 'SEO Analyst',
            14: 'Social Scheduler',
            15: 'Growth Reviewer',
            16: 'Campaign Manager',
            17: 'Copy Editor',
        },
        edges: [[11, 12], [11, 13], [11, 14], [11, 16], [12, 15], [13, 15], [16, 17]],
    },
    {
        name: 'long-names',
        note: "agent names far wider than the card, so Mermaid's label box is *larger* than the card box",
        names: {
            1: 'Head of Growth Marketing and Demand Generation',
            2: 'Senior Long-Form Content Writing Specialist',
            3: 'Technical Search Engine Optimisation Analyst',
        },
        edges: [[1, 2], [1, 3], [2, 3]],
    },
    {
        name: 'two-pairs',
        note: 'two independent two-node chains: gives the corpus more than one purely vertical edge',
        names: { 1: 'Marketing Lead', 2: 'Content Writer', 3: 'Engineering Lead', 4: 'Backend Engineer' },
        edges: [[1, 2], [3, 4]],
    },
    {
        name: 'two-ranks-apart',
        note: 'an edge that skips a rank, so dagre routes it through an intermediate dummy node',
        names: { 1: 'Marketing Lead', 2: 'Content Writer', 3: 'SEO Analyst', 4: 'Copy Editor' },
        edges: [[1, 4], [1, 2]],
    },
    {
        name: 'short-names',
        note:
            'two-to-three character agent names: the narrowest label box Mermaid can measure, ' +
            'which is the case where the start endpoint has to travel furthest and the head handle ' +
            'has the least room before it would loop',
        names: { 1: 'AI', 2: 'QA', 3: 'SEO', 4: 'Ops' },
        edges: [[1, 2], [1, 3], [2, 4]],
    },
]

function payload(fixture: Fixture): GraphPayload {
    return {
        principal: { id: 7, type: 'group', name: fixture.name, is_current_user_owned: true },
        nodes: Object.entries(fixture.names).map(([id, name]) => ({
            id: Number(id),
            name,
            role: null,
            picture_url: null,
            status: 'RUNNING',
            active_chats: 1,
            recent_chats_24h: 2,
            profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' },
        })),
        edges: fixture.edges.map(([source, target]) => ({
            id: `${source}->${target}`,
            source,
            target,
            op: 'sub_agent',
            configured: true,
            count_24h: 1,
            last_invoked_at: '2026-09-25T08:14:00Z',
        })),
        generated_at: '2026-09-25T08:14:00Z',
    }
}

/*
 * The Mermaid configuration `composables/useMermaidRender.ts →
 * ensureMermaidInit` initialises with, mirrored verbatim.
 * `MIN_NODE_SPACING` / `MIN_RANK_SPACING` are derived there as
 * `NODE_CARD_WIDTH + 20` and `NODE_CARD_HEIGHT + 20`; both are
 * re-derived from the constants below before anything renders, so a
 * change to the card footprint fails loudly instead of silently
 * capturing paths for a configuration the plugin no longer uses.
 */
const CARD_GUTTER = 20
const MIN_NODE_SPACING = NODE_CARD_WIDTH + CARD_GUTTER
const MIN_RANK_SPACING = NODE_CARD_HEIGHT + CARD_GUTTER

/**
 * Curve settings to render each graph with.
 *
 * `basis` is what the plugin ships. The others are rendered from the
 * *same* dagre router with the *same* node boxes — only the shape
 * function d3 hands the points to differs — so they are genuine
 * Mermaid output, and they are what makes the corpus cover shapes
 * (`M…L` with no curve at all, `…C…` with no tail) that `basis` never
 * produces. The plugin never selects them; they are here so the
 * command-aware anchoring is proved against the whole family rather
 * than against one lucky string.
 */
const CURVES = ['basis', 'linear', 'bumpX', 'step'] as const

const host = document.createElement('div')
document.body.appendChild(host)
const out = document.getElementById('out') as HTMLElement
out.textContent = 'rendering…'
window.addEventListener('error', (e) => {
    out.textContent = `ERROR: ${e.message}\n${e.error?.stack ?? ''}`
})
window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason
    out.textContent = `REJECTION: ${String(reason instanceof Error ? reason.stack : reason)}`
})

interface EdgeRecord {
    graph: string
    note: string
    curve: string
    shippedCurve: boolean
    id: string
    source: number
    target: number
    d: string
    markerEnd: string | null
    markerStart: string | null
    sourceCentre: NodeCentre
    targetCentre: NodeCentre
    /** Mermaid's own `g.node rect` for the source/target, before growth. */
    sourceLabelBox: { x: number; y: number; width: number; height: number }
    targetLabelBox: { x: number; y: number; width: number; height: number }
    commands: string
    dOld: string | null
    dRuns: string | null
    dNew: string | null
    pointCount: number
    metrics: {
        tipToBorderOld: number
        tipToBorderNew: number
        startToBorderOld: number
        startToBorderNew: number
        maxInteriorShiftOld: number
        maxInteriorShiftNew: number
        maxTurnAngleMermaid: number
        maxTurnAngleOld: number
        maxTurnAngleNew: number
        turnAnglesMermaid: number[]
        turnAnglesOld: number[]
        turnAnglesNew: number[]
        /** Did the start run push the first curve's head handle past its room? */
        headHandleClamped: boolean
        /** Did the tail run push the last curve's tail handle past its room? */
        tailHandleClamped: boolean
        /** Does re-anchoring the rewritten path leave it byte-identical? */
        idempotentNew: boolean
        /**
         * Largest turn Chrome's own path geometry shows over a 12-unit
         * window, sampled every unit. The rendered-geometry counterpart to
         * `maxTurnAngle`, and the one that cannot be fooled by a bad model
         * of the path: it asks the renderer where the ink goes.
         */
        renderedWindowTurnMermaid: number
        renderedWindowTurnOld: number
        renderedWindowTurnNew: number
        /**
         * The tangent's reversals on the rendered path, for the path
         * Mermaid emitted, the pre-fix rewrite and the current one. This
         * is the repo's definition of "wavy" — see `pathMetrics.ts →
         * waviness`. 0 reversals means the curve turns the same way the
         * whole way along, which is what "smooth" means to an eye; 2 is
         * the S.
         */
        reversalsMermaid: number
        reversalTurnMermaid: number
        reversalsOld: number
        reversalTurnOld: number
        /**
         * …and for the *run-translating* implementation this one
         * replaces (`5f24fcd`), which kept every join tangent and still
         * wobbled. This is the column the fix is measured against.
         */
        reversalsRuns: number
        reversalTurnRuns: number
        reversalsNew: number
        reversalTurnNew: number
        /** Does the rendered path cross itself? A fold always does. */
        renderedSelfIntersectsMermaid: boolean
        renderedSelfIntersectsOld: boolean
        renderedSelfIntersectsNew: boolean
    }
}

const records: EdgeRecord[] = []
let counter = 0

for (const curve of CURVES) {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
            primaryColor: '#ffffff',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#e2e8f0',
            lineColor: '#475569',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSize: '16px',
        },
        flowchart: {
            htmlLabels: false,
            useMaxWidth: false,
            curve,
            nodeSpacing: MIN_NODE_SPACING,
            rankSpacing: MIN_RANK_SPACING,
            padding: 24,
        },
        securityLevel: 'loose',
    })

    for (const fixture of FIXTURES) {
        out.textContent = `rendering ${curve} / ${fixture.name}…`
        const { svg } = await mermaid.render(`cap-${counter++}`, buildMermaidSource(payload(fixture)))
        host.innerHTML = svg
        const svgEl = host.querySelector('svg') as SVGSVGElement
        const centres = measureNodeCentres(svgEl)
        const boxes: Record<number, { x: number; y: number; width: number; height: number }> = {}
        for (const nodeEl of svgEl.querySelectorAll('g.node')) {
            const id = nodeIdFromMermaidId(nodeEl.id)
            if (id === null) continue
            const rect = nodeEl.querySelector('rect')
            if (rect === null) continue
            boxes[id] = {
                x: Number(rect.getAttribute('x') ?? 0),
                y: Number(rect.getAttribute('y') ?? 0),
                width: Number(rect.getAttribute('width') ?? 0),
                height: Number(rect.getAttribute('height') ?? 0),
            }
        }
        for (const el of svgEl.querySelectorAll('path.flowchart-link')) {
            const id = el.id
            const ends = edgeEndsFromMermaidId(id)
            const d = el.getAttribute('d')
            if (ends === null || d === null) continue
            const [source, target] = ends
            const sourceCentre = centres[source]
            const targetCentre = centres[target]
            if (sourceCentre === undefined || targetCentre === undefined) continue

            const halfW = NODE_CARD_WIDTH / 2
            const halfH = NODE_CARD_HEIGHT / 2
            const oldD = reanchorEdgePathOLD(d, sourceCentre, targetCentre, halfW, halfH)
            const runsD = reanchorEdgePathRuns(d, sourceCentre, targetCentre, halfW, halfH)
            const newD = reanchorEdgePath(d, sourceCentre, targetCentre, halfW, halfH)
            const emptyBox = { x: 0, y: 0, width: 0, height: 0 }

            records.push({
                graph: fixture.name,
                note: fixture.note,
                curve,
                shippedCurve: curve === 'basis',
                id,
                source,
                target,
                d,
                markerEnd: el.getAttribute('marker-end'),
                markerStart: el.getAttribute('marker-start'),
                sourceCentre,
                targetCentre,
                sourceLabelBox: boxes[source] ?? emptyBox,
                targetLabelBox: boxes[target] ?? emptyBox,
                commands: commands(d),
                dOld: oldD,
                dRuns: runsD,
                dNew: newD,
                pointCount: flatPoints(d).length,
                metrics: {
                    tipToBorderOld: oldD === null ? Number.NaN : distanceToBorder(arrowTip(oldD, ARROWHEAD_OVERSHOOT), targetCentre, halfW, halfH),
                    tipToBorderNew: newD === null ? Number.NaN : distanceToBorder(arrowTip(newD, ARROWHEAD_OVERSHOOT), targetCentre, halfW, halfH),
                    startToBorderOld: oldD === null ? Number.NaN : distanceToBorder(flatPoints(oldD)[0] as Pt, sourceCentre, halfW, halfH),
                    startToBorderNew:
                        newD === null ? Number.NaN : distanceToBorder(flatPoints(newD)[0] as Pt, sourceCentre, halfW, halfH),
                    maxInteriorShiftOld: oldD === null ? Number.NaN : maxInteriorShift(d, oldD),
                    maxInteriorShiftNew: newD === null ? Number.NaN : maxInteriorShift(d, newD),
                    maxTurnAngleMermaid: maxTurnAngle(d),
                    maxTurnAngleOld: oldD === null ? Number.NaN : maxTurnAngle(oldD),
                    maxTurnAngleNew: newD === null ? Number.NaN : maxTurnAngle(newD),
                    turnAnglesMermaid: round3(turnAngles(d)),
                    turnAnglesOld: oldD === null ? [] : round3(turnAngles(oldD)),
                    turnAnglesNew: newD === null ? [] : round3(turnAngles(newD)),
                    /*
                     * A re-anchored path keeps a handle's length unless
                     * something shortened it, so a shorter "after" is
                     * direct evidence *on the curves that go through the
                     * run machinery* — and on `curveBasis`, whose handles
                     * are re-derived from d3's own formulas over a longer
                     * `q₀ → q₁`, it is evidence of the re-emission
                     * instead. Recorded per path either way; the suite
                     * reads it only for the shapes that take the clamp
                     * path, which is what it is a statement about.
                     */
                    headHandleClamped: newD !== null && handleLength(newD, 0) < handleLength(d, 0) - 1e-9,
                    tailHandleClamped: newD !== null && handleLength(newD, 1) < handleLength(d, 1) - 1e-9,
                    // Re-anchoring the rewritten path must be a no-op. On
                    // the re-emitted `curveBasis` paths it is a fixed
                    // point to within the codec's round-trip precision
                    // rather than byte-for-byte, because recovering d3's
                    // routing from a `d` that was itself serialised
                    // cannot be exact; the suite asserts the bound on the
                    // geometry rather than on the string.
                    idempotentNew:
                        newD !== null &&
                        reanchorEdgePath(newD, sourceCentre, targetCentre, halfW, halfH, ARROWHEAD_OVERSHOOT) === newD,
                    // Chrome's own geometry, on a real <path>: the largest
                    // turn the renderer shows over a 12-unit window for the
                    // path Mermaid emitted, for the pre-fix rewrite, and for
                    // the current one.
                    renderedWindowTurnMermaid: renderedMaxWindowTurn(d),
                    renderedWindowTurnOld: oldD === null ? Number.NaN : renderedMaxWindowTurn(oldD),
                    renderedWindowTurnNew: newD === null ? Number.NaN : renderedMaxWindowTurn(newD),
                    // The repo's definition of "wavy": changes of mind in
                    // the rendered path's tangent direction. Recorded for
                    // all three so a future regression is a number that
                    // moved, not a judgement call.
                    reversalsMermaid: renderedWaviness(d).reversals,
                    reversalTurnMermaid: renderedWaviness(d).reversalTurn,
                    reversalsOld: oldD === null ? Number.NaN : renderedWaviness(oldD).reversals,
                    reversalTurnOld: oldD === null ? Number.NaN : renderedWaviness(oldD).reversalTurn,
                    reversalsRuns: runsD === null ? Number.NaN : renderedWaviness(runsD).reversals,
                    reversalTurnRuns: runsD === null ? Number.NaN : renderedWaviness(runsD).reversalTurn,
                    reversalsNew: newD === null ? Number.NaN : renderedWaviness(newD).reversals,
                    reversalTurnNew: newD === null ? Number.NaN : renderedWaviness(newD).reversalTurn,
                    // The scale-independent "no discontinuity" measure:
                    // a fold always makes the rendered path cross itself.
                    renderedSelfIntersectsMermaid: renderedSelfIntersects(d),
                    renderedSelfIntersectsOld: oldD === null ? true : renderedSelfIntersects(oldD),
                    renderedSelfIntersectsNew: newD === null ? true : renderedSelfIntersects(newD),
                },
            })
        }
        host.innerHTML = ''
    }
}

const corpus = {
    capturedWith: {
        mermaidVersion: '10.9.8',
        userAgent: navigator.userAgent,
        nodeCard: {
            NODE_CARD_WIDTH,
            NODE_CARD_HEIGHT,
            NODE_CARD_BORDER,
            NODE_CARD_PADDING_BLOCK,
            NODE_CARD_ROW_GAP,
            NODE_CARD_AVATAR_SIZE,
            NODE_CARD_ROW2_HEIGHT,
        },
        arrowheadOvershoot: ARROWHEAD_OVERSHOOT,
        curves: CURVES,
    },
    edges: records,
}
;(window as unknown as { __CORPUS__: typeof corpus }).__CORPUS__ = corpus
out.textContent = JSON.stringify(corpus, null, 2)
document.title = `ready:${records.length}`

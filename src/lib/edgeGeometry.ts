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
 * and that ray agree to 0.1 % on the same fixture). So the endpoint is
 * walked out along that ray to the card's border, and *nothing else
 * about the curve is allowed to change*. How that is done is the whole
 * content of this module, and the two obvious answers were both wrong.
 *
 * **Wrong #1: translate a handle.** dagre + d3's `curveBasis` — what
 * `useMermaidRender` configures — emits
 *
 *     M <exit> L <lead-in> C … C … L <entry>
 *
 * so on a path with two cubics the flat point list is
 * `[exit, lead-in, c1, c2, v1, c1', c2', v2, entry]`, and
 *
 *   - index `1` is the **lead-in vertex**, not a control point, and
 *   - index `n - 2` is the last cubic's **on-curve endpoint**, not a
 *     control point either.
 *
 * An implementation that read `points[1]` and `points[n - 2]` as
 * control points translated two *vertices* by the endpoint delta. On
 * every real path in the captured corpus that folds the path back on
 * itself: the turn angle at the first interior vertex goes from dagre's
 * 0.00° to **180.00°**, and the interior vertex is displaced by
 * 36.5 – 82.7 user units.
 *
 * **Wrong #2: translate a *run*, then repair the handles it split.**
 * Moving the handle alone snaps the curve to a new direction where it
 * meets the card, so the endpoint drags the whole *run* of geometry it
 * is attached to — a straight stretch of the path — and the two
 * repetitions the run straddles are then re-fitted by scaling their
 * unmoved handle by the span ratio. That kept every join tangent, and
 * it is what `958084a` shipped. It also wobbles, and it wobbled the
 * moment the card shrank to its content (`5f24fcd`): 28 of the 33 real
 * `curveBasis` paths came out with **two reversals of the tangent
 * angle** each — an S — where Mermaid's own paths have none, because a
 * run boundary lands *between* the last cubic's two control points. The
 * run carries the tail control point and the vertex past the head
 * control point that stayed behind, the control polygon folds back on
 * itself, and neither the span-ratio rescale nor the clamp can undo it:
 * both hold a handle's *direction* and change only its *length*, and
 * what has gone wrong is a direction. Fixing it needs the head handle
 * to **rotate**, which no amount of rescaling can do.
 *
 * **What this module does instead: re-run d3's own emission.** A `d` is
 * not a free list of control points; it is the *output* of a function of
 * a handful of routing points. `dagre-d3-es` hands dagre's edge points
 * to `d3.line().curve(curveBasis)` (`createEdgePaths.js` →
 * `createLine()`), and d3's `curveBundle` is a straight line at each
 * end with a `Basis` spline between, which for spline points
 * `q₀ … q_{n-1}` emits exactly
 *
 *     M q₀
 *     L (5q₀ + q₁)/6
 *     C (2q_{k-1} + q_k)/3  (q_{k-1} + 2q_k)/3  (q_{k-1} + 4q_k + q_{k+1})/6
 *     L q_{n-1}
 *
 * (`d3-shape@3.2.0` `src/curve/{bundle,basis}.js`; the last cubic, which
 * `lineEnd` emits after the last point, ends at `(q_{n-2} + 5q_{n-1})/6`
 * — its own rule, reproduced below). The cubic's two controls sit a
 * third and two thirds of the way along `q_{k-1} → q_k`, so **they invert
 * it exactly**: `2·c₁ − c₂ = q_{k-1}` and `2·c₂ − c₁ = q_k`. That is
 * the codec below. It recovers dagre's routing, moves the two end
 * points onto the card borders, and re-runs the emission — so the
 * result is still d3's curve, still a function of the same routing, and
 * still guaranteed well formed because d3's own formulas built it.
 *
 * Every interior join tangent then comes out **unchanged**: the first
 * `L` and the first cubic's controls are all affine in `q₀`, and `q₁`
 * is unchanged and collinear with `q₀` and the source centre, so the
 * lead-in keeps its direction; the same argument runs backwards at the
 * tail. Measured on the captured corpus, no `curveBasis` path has a
 * single tangent reversal after re-anchoring, against 28 with two each
 * before, and 0 in Mermaid's own output.
 *
 * **The other three `flowchart.curve` settings keep the run
 * machinery**, which is the right answer for each of them for a
 * different reason: `curveLinear` and `curveStep` draw the routing
 * polyline itself (a straight segment has no curvature to preserve, and
 * translating a run of its vertices changes no corner angle), and
 * `curveBumpX` is not a shape this plugin can ask for. It is also the
 * shape whose controls sit *on* the vertices, so it is a table-
 * completeness case rather than a rendered one.
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
    /** The command this repetition came from — `M`, `L`, `C`, … */
    command: string
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
 * A single command letter, and an SVG path number, each matched **where the
 * scanner stands** rather than at the next match anywhere in the string.
 *
 * Sticky (`y`) matching is what makes that possible: it anchors a match at
 * `lastIndex` and reports failure rather than searching on. `nextToken`
 * offers both at the same index and takes the first that fits. They are
 * disjoint — a command letter is never `-`, a digit or a `.` — so this
 * picks the same tokens, in the same order, as a single alternation would.
 * That is also the cheaper form: nesting the number pattern inside a
 * top-level alternation pushes every quantifier in it one level deeper,
 * which is what put the combined pattern over the complexity budget.
 *
 * The number accepts what the SVG grammar allows and `Number()` reads: an
 * optional sign, a mantissa of digits with at most one dot (which may lead
 * or trail), and an optional exponent. It can never match empty, so the
 * scanner always advances.
 */
const LETTER = /[A-Za-z]/y
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y

/**
 * Turn one command's accumulated coordinates into a `Segment`.
 *
 * Three-valued, because "carries nothing" and "cannot be read" are
 * different answers:
 *
 *   - a `Segment` — read it, and keep it;
 *   - `undefined` — a command letter immediately followed by another one
 *     carries no coordinates and contributes no segment. Not an error;
 *   - `null` — the path cannot be read with certainty, and declining is
 *     always the right answer rather than a guess: a mis-split moves half
 *     the path. `Z` is the one command that legitimately has no
 *     coordinates, and it still has to survive so the rewritten `d`
 *     keeps it.
 */
function readSegment(command: string, numbers: number[]): Segment | null | undefined {
    const shape = SHAPE[command]
    if (shape === undefined) return null
    if (numbers.length === 0) {
        return shape.points === 0 ? { command, points: [] } : undefined
    }
    if (shape.points === 0) return null
    if (numbers.length % 2 !== 0) return null
    if (numbers.length / 2 % shape.points !== 0) return null
    const points: PathPoint[] = []
    for (let i = 0; i < numbers.length; i += 2) {
        const x = numbers[i]
        const y = numbers[i + 1]
        if (x === undefined || y === undefined) return null
        points.push({ x, y, onCurve: (i / 2) % shape.points === shape.vertex })
    }
    return { command, points }
}

/** The next command letter or number at or after `from`, or `null` at the end. */
function nextToken(d: string, from: number): { text: string; letter: boolean; end: number } | null {
    for (let at = from; at < d.length; at += 1) {
        NUMBER.lastIndex = at
        const number = NUMBER.exec(d)
        if (number !== null) {
            return { text: number[0], letter: false, end: at + number[0].length }
        }
        LETTER.lastIndex = at
        const letter = LETTER.exec(d)
        if (letter !== null) return { text: letter[0], letter: true, end: at + 1 }
    }
    return null
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
/**
 * The scan's mutable state: the command being read, the coordinates
 * collected for it so far, and whether the path is still readable.
 */
interface Scan {
    /** The command the pending numbers belong to, or `null` before the first one. */
    command: string | null
    numbers: number[]
    /** The segments read so far. */
    segments: Segment[]
    /** `false` once the path has been found unreadable. */
    ok: boolean
}

/** Close off the command being read, so the next token starts a new one. */
function flushScan(scan: Scan): void {
    if (scan.command === null) return
    const segment = readSegment(scan.command, scan.numbers)
    scan.numbers = []
    // `undefined` is a command with no coordinates, which contributes
    // nothing and is not an error; only a `null` makes the path unreadable.
    if (segment === null) {
        scan.ok = false
        return
    }
    if (segment !== undefined) scan.segments.push(segment)
}

/** Consume one command letter. A lowercase one is a *relative* command, which is declined. */
function readLetter(scan: Scan, letter: string): void {
    flushScan(scan)
    if (!scan.ok || letter !== letter.toUpperCase()) {
        scan.ok = false
        return
    }
    scan.command = letter.toUpperCase()
}

/** Consume one coordinate. */
function readNumber(scan: Scan, text: string): void {
    if (scan.command === null) {
        scan.ok = false
        return
    }
    scan.numbers.push(Number(text))
    /*
     * Per SVG, coordinate pairs after an `M` are implicit `L`s.
     * dagre never emits that, but honouring it keeps the group
     * arithmetic below correct if a future Mermaid does.
     */
    if (scan.command === 'M' && scan.numbers.length === 2) {
        flushScan(scan)
        scan.command = 'L'
    }
}

function parsePath(d: string): Segment[] | null {
    const scan: Scan = { command: null, numbers: [], segments: [], ok: true }
    for (let at = 0; at < d.length && scan.ok; ) {
        const token = nextToken(d, at)
        if (token === null) break
        at = token.end
        if (token.letter) readLetter(scan, token.text)
        else readNumber(scan, token.text)
    }
    if (!scan.ok) return null
    flushScan(scan)
    if (!scan.ok) return null
    return scan.segments.length > 0 ? scan.segments : null
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
                command: segment.command,
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

/**
 * Round a coordinate before it goes into a `d`.
 *
 * **Six decimals, not Mermaid's three, and the reason is the
 * arrowhead.** Three decimals is a step of 0.001 user units, and the
 * arrow-tip contract is a tolerance of 0.0005. An `orient="auto"` marker
 * is rotated to the direction of the last *two points of the `d`*, and
 * the last leg of a re-anchored `curveBasis` path is d3's trailing `L`
 * — which is one sixth of the last leg, so 8–24 units on the captured
 * corpus. Aiming the tip 4.8 units short of the border and then
 * rounding both ends of that chord to 0.001 moves the rendered tip by up
 * to `4.8 × 0.0014 / 8` = 0.0008, which is the whole tolerance. At six
 * decimals the same error is 0.0000008 and the tip lands on the border
 * to 0.000 — measured, on all 33 `basis` paths in the corpus, where the
 * three-decimal version missed by up to 0.0005 on the four whose
 * trailing `L` is diagonal.
 *
 * The extra digits only appear where a point actually moved, because
 * `String()` drops trailing zeros: a point that is already on Mermaid's
 * 3-decimal grid still serialises as `67.906`, so the parts of a path
 * this module does not touch stay byte-identical to Mermaid's output.
 */
function round(value: number): number {
    return Math.round(value * 1e6) / 1e6
}

/** One segment back to its `d` text, e.g. `C 1,2 3,4 5,6`. */
function serialiseSegment(segment: Segment): string {
    const coordinates = segment.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
    return `${segment.command} ${coordinates}`
}

function serialise(segments: Segment[]): string {
    return segments.map(serialiseSegment).join(' ')
}

function unit(x: number, y: number): Point {
    const length = Math.hypot(x, y)
    if (length === 0) return { x: 0, y: 0 }
    return { x: x / length, y: y / length }
}

/** `a + (b − a)·t` — a point a fraction `t` of the way from `a` to `b`. */
function along(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** `(wₐ·a + w_b·b + w_c·c) / (wₐ + w_b + w_c)` — d3's three-point blends. */
function blend(a: Point, b: Point, c: Point, wa: number, wb: number, wc: number): Point {
    const total = wa + wb + wc
    return {
        x: (wa * a.x + wb * b.x + wc * c.x) / total,
        y: (wa * a.y + wb * b.y + wc * c.y) / total,
    }
}

/** `2·a − b`: the point that puts `a` a third of the way from `b` to `a`…'s reflection. */
function reflect(a: Point, b: Point): Point {
    return { x: 2 * a.x - b.x, y: 2 * a.y - b.y }
}

/* ------------------------------------------------------------------ *
 * The d3 `curveBundle.basis` codec.
 *
 * This is the shape `useMermaidRender` ships, and the whole point of
 * this module. See the file header for why re-running d3's emission is
 * the only way to relocate an endpoint without changing the curve's
 * shape; everything below is that one idea, written out.
 * ------------------------------------------------------------------ */

/**
 * How far a decoded `q` and a re-emitted path may disagree before the
 * decode is rejected as "this is not a bundle basis after all".
 *
 * The check is exact-arithmetic self-consistency: decode, re-emit,
 * compare against what was handed in. A `d` Mermaid wrote carries three
 * decimals, so a correct decode cannot do better than a few thousandths
 * — measured 0.0009 over the whole captured corpus, from the codec
 * *inverting a difference* (`2c₁ − c₂`) of two already-rounded numbers.
 * 0.01 is four orders of magnitude below the shortest leg on any path in
 * the corpus (4.9 units) and far below anything a mis-decode of another
 * curve family could accidentally land on: the same comparison rejects
 * every non-`curveBasis` shape in the corpus by three orders of
 * magnitude.
 */
const BUNDLE_BASIS_TOLERANCE = 0.01

/**
 * Is this flattened path the one d3's `curveBundle.basis` emits?
 *
 * That curve is a straight `L` at each end with a spline between, so
 * the command sequence is `M L C…C L` with at least two cubics, and its
 * flat point list is exactly `3n` long for `n` spline points
 * (`1 + 1 + 3(n − 1) + 1`). Both are asserted, because the codec below
 * indexes off them.
 */
function isBundleBasis(groups: Group[], points: Point[]): boolean {
    if (groups.length < 5) return false
    if (groups[0]?.command !== 'M' || groups[1]?.command !== 'L') return false
    if (groups.at(-1)?.command !== 'L') return false
    for (const group of groups.slice(2, -1)) {
        if (group.command !== 'C') return false
    }
    return points.length === 3 * (groups.length - 2)
}

/**
 * Recover d3's spline points from the `d` its `curveBasis` produced.
 *
 * **The inverse is exact, and short.** d3's `Basis` point function
 * (`d3-shape@3.2.0` `src/curve/basis.js`) emits, for the interval
 * `q_{k-1} → q_k`,
 *
 *     c₁ = (2q_{k-1} + q_k) / 3 = q_{k-1} + (q_k − q_{k-1})/3
 *     c₂ = (q_{k-1} + 2q_k) / 3 = q_{k-1} + 2(q_k − q_{k-1})/3
 *
 * — the two controls a third and two thirds of the way along the
 * interval, which makes them an exact encoding of their two endpoints:
 * `2c₂ − c₁ = q_k` and `2c₁ − c₂ = q_{k-1}`. So each cubic names the
 * pair of spline points it spans, and no iteration is needed.
 *
 * **Why not invert the cubic *endpoints* instead**, which is the obvious
 * other route? Because they amplify. Each is a sixth of a sum of three
 * spline points, so recovering `q_{k+1}` from it multiplies the
 * rounding already in `q_k` by four, and the five-spline-point path in
 * the corpus came back with 0.24 of error by the last point. Inverting
 * the controls has no such step: the error stays at the two controls'
 * own half-ulp.
 *
 * **The two end points are read verbatim, not inverted.** d3 writes `q₀`
 * as the `M` and `q_{n-1}` as the trailing `L`, so the `d` already
 * carries them exactly. An interior point is named by two different
 * cubics and takes the mean of the two readings, which halves what is
 * left of the rounding. The consistency of those readings is then
 * *checked*, not assumed — see `isBundleBasis` and the re-emit below.
 */
function decodeBundleBasis(points: Point[]): Point[] | null {
    // `isBundleBasis` has already established `points.length === 3n` for
    // some `n ≥ 3`, so both of the length checks below are guards on the
    // *values* rather than on the shape: a path can be a bundle basis by
    // command sequence and still carry a control the emitter's formulas
    // cannot reproduce, and the only honest answer then is to decline.
    const n = points.length / 3
    const control = (k: number): { head: Point; tail: Point } => ({
        head: points[2 + 3 * (k - 1)] as Point,
        tail: points[3 + 3 * (k - 1)] as Point,
    })
    const q: Point[] = []
    for (let i = 0; i < n; i++) {
        if (i === 0) {
            // d3 writes q₀ as the `M` and q_{n-1} as the trailing `L`, so
            // the `d` already carries the two ends exactly. Inverting them
            // cannot beat the rounding they are fed, and they are the two
            // points this function has to move.
            q.push(points[0] as Point)
            continue
        }
        if (i === n - 1) {
            q.push(points.at(-1) as Point)
            continue
        }
        // The two ends are read verbatim above; every interior point is
        // named by the cubic that ends at it and by the one that starts
        // there, and takes the mean of the two readings — which halves
        // what is left of the `d`'s own rounding.
        const first = reflect(control(i).tail, control(i).head)
        const second = reflect(control(i + 1).head, control(i + 1).tail)
        q.push({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 })
    }
    // Re-emitting the decode has to reproduce the path d3 drew. This one
    // comparison validates every formula in the emitter at once — a
    // decode that is wrong anywhere comes back out differently — so
    // there is no per-formula tolerance to argue about.
    const reencoded = emitBundleBasis(q)
    for (let i = 0; i < points.length; i++) {
        const a = reencoded[i] as Point
        const b = points[i] as Point
        if (Math.hypot(a.x - b.x, a.y - b.y) > BUNDLE_BASIS_TOLERANCE) return null
    }
    return q
}

/**
 * The inverse of `decodeBundleBasis`: d3's `curveBundle.basis`, written
 * out point for point.
 *
 * Transcribed from `d3-shape@3.2.0` `src/curve/{bundle,basis}.js`, which
 * is what `dagre-d3-es/src/dagre-js/create-edge-paths.js` feeds the edge
 * points through (`createLine()` calls `d3.line().curve(edge.curve)`).
 * The `curveBundle` wrapper first convolves the routing polyline with
 * its own chord (weight 0.15), and that convolution does not appear
 * here because `q` is d3's *post*-convolution input: recovering it from
 * the `d` and handing it straight back is exact, and re-deriving the
 * pre-convolution polyline would only throw away precision.
 *
 * The last cubic is the one `lineEnd` emits, after the last point has
 * already been consumed, so its two "previous" points are both `q_{n-1}`
 * and it ends at `(q_{n-2} + 5q_{n-1})/6` rather than at
 * `(q_{n-2} + 4q_{n-1} + q_{n-1})/6`. Those are the same expression —
 * the difference is only in what d3's index arithmetic happens to read
 * — and it is written the way d3 writes it so the two agree by
 * construction rather than by coincidence.
 */
function emitBundleBasis(q: Point[]): Point[] {
    const n = q.length
    const out: Point[] = [q[0] as Point, blend(q[0] as Point, q[1] as Point, q[1] as Point, 5, 1, 0)]
    for (let k = 1; k <= n - 2; k++) {
        out.push(
            along(q[k - 1] as Point, q[k] as Point, 1 / 3),
            along(q[k - 1] as Point, q[k] as Point, 2 / 3),
            blend(q[k - 1] as Point, q[k] as Point, q[k + 1] as Point, 1, 4, 1),
        )
    }
    // The closing cubic `lineEnd` emits after the last point is consumed,
    // and the trailing `L` that closes the path is its on-curve endpoint.
    out.push(
        along(q[n - 2] as Point, q[n - 1] as Point, 1 / 3),
        along(q[n - 2] as Point, q[n - 1] as Point, 2 / 3),
        blend(q[n - 2] as Point, q[n - 1] as Point, q[n - 1] as Point, 1, 5, 0),
        q[n - 1] as Point,
    )
    return out
}

/**
 * Move the path's start point onto `newStart` and its end point onto
 * `newEnd` by rigidly translating the **run** of geometry that each
 * endpoint is attached to.
 *
 * **This is the fallback, not the main path.** `reanchorEdgePath` only
 * comes here for a `d` that `decodeBundleBasis` declines — a
 * `curveLinear` or `curveStep` polyline, or a `curveBumpX`. For the
 * shipped `curveBasis` the run is the wrong instrument, for the reason
 * the file header spells out: it drags a control point past its partner
 * and no repair available here can put it back, because the repair
 * moves lengths and the damage is to a direction. What follows is
 * retained because it is the right answer for the shapes that reach it,
 * and because it is where the corpus's `curveLinear` and `curveStep`
 * coverage is earned.
 *
 * **Why a run and not just a handle.** A bézier segment's tangent at
 * an end point is the vector to that end's control point, so moving an
 * endpoint alone snaps the curve to a new direction where it meets the
 * card, and moving only the control point is not enough either. Drag the
 * neighbouring vertex *too* and the run slides along the line it was
 * already on, which is invisible on a straight stretch.
 *
 * So the run at each end is measured **positionally**: it reaches from
 * the endpoint back along the path's own direction of travel, as far as
 * the points that lie at or before the endpoint's new position, and no
 * further.
 *
 * That single rule covers both ends of the problem, and it covers the
 * shapes where there is no handle to speak of: a `curveLinear` polyline
 * needs no run at all (its neighbouring vertex is already on the ray the
 * endpoint is walked out along), while d3's `curveStep` staircase *does*
 * need one, because its terminal `L` is a duplicate of the point before
 * it and leaving that behind doubles the path back over itself.
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
 * same as if nothing had happened. On the shapes that reach this
 * function the turn angle at every interior vertex is identical before
 * and after, and the middle of the path is byte-for-byte Mermaid's own
 * output.
 *
 * **Why the runs are accumulated before they are applied.** A lone
 * `S`/`Q` repetition has one control point governing both of its ends,
 * and if both runs reach it, it has to receive both deltas.
 *
 * The four steps below are named so each can be read — and measured — on its
 * own: measure the runs, apply them, rescale the handles a run left at the
 * wrong length, then clamp what is left.
 */

/**
 * How far the run at the **head** of the path reaches.
 *
 * Measured **positionally** along the path's own direction of travel: the
 * run extends as far as the points that lie at or before the endpoint's new
 * position, and no further. Reaching past a point the endpoint never passed
 * would drag that point *backwards*, which is the fold this prevents.
 *
 * Where the path has no direction to measure against — a single point, or a
 * zero-length first leg, which d3 emits for a `curveBumpX` edge leaving
 * straight up — the tangent-carrying handle stands in, which is the nearest
 * thing to an answer the path offers.
 */
function headReach(points: PathPoint[], lastIndex: number, movedTo: Point, direction: Point, curve: Group | undefined): number {
    if (direction.x === 0 && direction.y === 0) return curve === undefined ? 0 : curve.start
    const along = (point: Point): number => point.x * direction.x + point.y * direction.y
    const reachable = along(movedTo)
    let end = 0
    while (end + 1 <= lastIndex && along(points[end + 1] as PathPoint) <= reachable) {
        end += 1
    }
    return end
}

/**
 * How far the run at the **tail** of the path reaches, walking backwards.
 * The mirror of `headReach`, with the comparison reversed: the run covers
 * the points at or beyond the endpoint's new position.
 */
function tailReach(points: PathPoint[], lastIndex: number, movedTo: Point, direction: Point, curve: Group | undefined): number {
    if (direction.x === 0 && direction.y === 0) {
        return curve === undefined ? lastIndex : Math.min(lastIndex, curve.start + curve.handles - 1)
    }
    const along = (point: Point): number => point.x * direction.x + point.y * direction.y
    const reachable = along(movedTo)
    let start = lastIndex
    while (start - 1 >= 0 && along(points[start - 1] as PathPoint) >= reachable) {
        start -= 1
    }
    return start
}

/** Accumulate one run's translation, so a point in two runs receives both. */
function addDelta(deltas: Point[], from: number, to: number, delta: Point): void {
    for (let i = from; i <= to; i++) {
        const current = deltas[i] as Point
        deltas[i] = { x: current.x + delta.x, y: current.y + delta.y }
    }
}

/**
 * Rescale the handle on the far side of any repetition whose span changed.
 *
 * A run carries one end of a repetition and never the other, so the
 * repetition's span grows or shrinks while the handle at the *moved* end
 * keeps its length (it slid with its own point) and the handle at the
 * *unmoved* end is left at the length that fitted the old span. Left alone,
 * that handle reaches past its own vertex and the segment hooks: on the
 * captured corpus the last cubic of a diagonal `curveBasis` edge comes out
 * with its head control still 4.9 units *below* the vertex it is supposed
 * to lead into, and Chrome's own path geometry shows a 75.81° turn over a
 * 12-unit window where Mermaid drew 18.61°.
 *
 * Scaling it by the span ratio is the standard way to shorten a bézier
 * without moving either tangent: the handle keeps its direction, so every
 * join angle is untouched, and its length stays in proportion to the segment
 * it shapes. When both ends of a repetition moved — a lone `S`/`Q` segment,
 * whose single control point is in both runs — the ratio is 1 and nothing
 * happens.
 */
function rescaleFarHandles(points: PathPoint[], moved: PathPoint[], deltas: Point[], curves: Group[]): void {
    const movedIt = (index: number): boolean => {
        const delta = deltas[index]
        return delta !== undefined && (delta.x !== 0 || delta.y !== 0)
    }
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
}

/**
 * The three points one handle is measured against: the point it hangs off,
 * the same point before the move, and the far end of its repetition.
 *
 * A head handle (`head`) hangs off the repetition's *anchor*, a tail handle
 * off its *vertex*. Measuring the clamp from the wrong one rotates the
 * handle onto the original direction and puts a visible kink at the far
 * join — measured at 113° on the captured `curveBasis` corpus when the tail
 * was measured from the anchor instead of the vertex.
 */
function handleBounds(
    points: PathPoint[],
    moved: PathPoint[],
    group: Group,
    head: boolean,
): { base: PathPoint; originalBase: PathPoint; far: PathPoint } {
    const near = head ? group.anchor : group.vertex
    const far = head ? group.vertex : group.anchor
    return { base: moved[near] as PathPoint, originalBase: points[near] as PathPoint, far: moved[far] as PathPoint }
}

/** Hold every handle a run dragged to two bounds, so a run can never fold the path back on itself. */
function clampMovedHandles(points: PathPoint[], moved: PathPoint[], deltas: Point[], groups: Group[]): void {
    for (const group of groups) {
        if (group.anchor < 0) continue
        for (let k = 0; k < group.handles; k++) {
            const index = group.start + k
            const delta = deltas[index] as Point
            if (delta.x === 0 && delta.y === 0) continue
            const bounds = handleBounds(points, moved, group, k === 0)
            moved[index] = clampHandle(moved[index] as PathPoint, points[index] as PathPoint, bounds.base, bounds.originalBase, bounds.far)
        }
    }
}

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

    const deltas: Point[] = points.map(() => ({ x: 0, y: 0 }))
    const first = points[0] as PathPoint
    const last = points[lastIndex] as PathPoint
    // The run at each end of the path.
    const curves = groups.filter((group) => group.handles > 0)

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
    const reach = headReach(points, lastIndex, newStart, departure, curves[0])
    const back = tailReach(points, lastIndex, newEnd, arrival, curves.at(-1))

    addDelta(deltas, 0, reach, { x: newStart.x - first.x, y: newStart.y - first.y })
    addDelta(deltas, back, lastIndex, { x: newEnd.x - last.x, y: newEnd.y - last.y })

    const moved: PathPoint[] = points.map((point, index) => {
        const delta = deltas[index] as Point
        return { x: point.x + delta.x, y: point.y + delta.y, onCurve: point.onCurve }
    })

    rescaleFarHandles(points, moved, deltas, curves)
    clampMovedHandles(points, moved, deltas, groups)

    let seen = 0
    return segments.map((segment) => ({
        command: segment.command,
        points: segment.points.map(() => moved[seen++] as PathPoint),
    }))
}

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
    const lastGroup = groups.at(-1)
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
 */
function endDirections(groups: Group[], points: PathPoint[]): { departure: Point; arrival: Point } {
    const firstGroup = groups[0]
    const lastGroup = groups.at(-1)
    if (firstGroup === undefined || lastGroup === undefined) {
        return { departure: { x: 0, y: 0 }, arrival: { x: 0, y: 0 } }
    }
    const vertices = groups
        .map((group) => points[group.vertex])
        .filter((point): point is PathPoint => point !== undefined)
    return {
        departure: endDirection(vertices, points[0] as PathPoint | undefined, headHandle(points, firstGroup), true),
        arrival: endDirection(vertices, points.at(-1), tailHandle(points, lastGroup), false),
    }
}

/** The handle nearest the start, or `undefined` when that repetition carries none. */
function headHandle(points: PathPoint[], group: Group): PathPoint | undefined {
    return group.handles > 0 ? points[group.start] : undefined
}

/** The handle nearest the end, or `undefined` when that repetition carries none. */
function tailHandle(points: PathPoint[], group: Group): PathPoint | undefined {
    return group.handles > 0 ? points[group.start + group.handles - 1] : undefined
}

/**
 * The travel direction at one end: off that end's own handle where it has
 * one, and off the nearest pair of distinct on-curve points otherwise.
 *
 * A handle that sits on the point it measures from — d3 emits several
 * (`curveBumpX` puts its first control point on the start vertex,
 * `curveStep` repeats the last point) — has no direction to give, so the
 * chord scan takes over. It walks *inward* from the end, which is the way
 * the run there is made: forwards from the start, backwards from the end,
 * and skipping the end's own vertex.
 */
function endDirection(vertices: PathPoint[], end: PathPoint | undefined, handle: PathPoint | undefined, forward: boolean): Point {
    const zero = { x: 0, y: 0 }
    if (end === undefined) return zero
    if (handle !== undefined) {
        const chord = forward ? unit(handle.x - end.x, handle.y - end.y) : unit(end.x - handle.x, end.y - handle.y)
        if (chord.x !== 0 || chord.y !== 0) return chord
    }
    for (const vertex of inward(vertices, forward)) {
        const chord = forward ? unit(vertex.x - end.x, vertex.y - end.y) : unit(end.x - vertex.x, end.y - vertex.y)
        if (chord.x !== 0 || chord.y !== 0) return chord
    }
    return zero
}

/** The on-curve vertices to try, in the order they are tried. */
function inward(vertices: PathPoint[], forward: boolean): PathPoint[] {
    if (forward) return vertices
    return vertices.slice(0, -1).reverse()
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
 * Re-anchor a d3 `curveBundle.basis` path by re-running d3's own
 * emission with its two end points moved onto the cards.
 *
 * **The move is a re-route, not a translate.** `q₀` and `q_{n-1}` are
 * what dagre routed the edge *from* and *to*; they are the two points
 * the emission is a function of, so moving them and re-emitting asks
 * the same router the same question with a different answer — "leave the
 * source card here, arrive at the target card here" — and d3 builds the
 * curve. Every control point in the result is therefore one of d3's own
 * expressions, which is what makes the result guaranteed not to fold:
 * there is no code here that can put a control point on the wrong side
 * of its partner, because there is no code here that places a control
 * point at all.
 *
 * **Why every interior join tangent survives.** A join's tangent is the
 * direction between an on-curve point and the control point beside it,
 * and *both* of those are affine in the `q`s. At the head, `q₀` moves
 * along the ray from the source centre through its old position; `q₁`
 * is unmoved; and d3's own router put the source centre, `q₀` and `q₁`
 * on one line, because the entry point it computed is
 * `intersectNode(tail, points[0])` — the intersection of that very ray
 * with the label box. So `q₀` slides along the line `q₁` was already on,
 * and every ratio in the first `L` and the first cubic is unchanged:
 * the lead-in and the curve leave the card along the same directions
 * d3 drew. The same argument runs backwards at the tail, where the fixed
 * point is `q_{n-2}`.
 *
 * **The endpoint is where the tip goes, minus the marker.** The tip is
 * `overshoot` past the path end along the end tangent, and the end
 * tangent of a re-emitted path is `unit(q_last − q_{n-2})` — d3's last
 * cubic runs from `(q_{n-2} + 5q_last)/6` to `q_last`, so the trailing
 * `L` is a sixth of the way along the same ray. So the endpoint that
 * puts the tip on the border is the border walked back by `overshoot`
 * *along that ray*, which is the closed form below and exact rather than
 * iterative. A path whose last leg is shorter than the arrowhead itself
 * has no room to stop short, and the border point is used unchanged.
 */
function reanchorBundleBasis(
    q: Point[],
    source: Point,
    target: Point,
    halfWidth: number,
    halfHeight: number,
    endOvershoot: number,
): string {
    const n = q.length
    const last = q[n - 1] as Point
    const beforeLast = q[n - 2] as Point
    const start = cardBorderPoint(source, q[0] as Point, halfWidth, halfHeight)
    const tip = cardBorderPoint(target, last, halfWidth, halfHeight)
    const room = Math.hypot(tip.x - beforeLast.x, tip.y - beforeLast.y)
    const end = room > endOvershoot ? along(beforeLast, tip, (room - endOvershoot) / room) : tip
    return serialise(emitBundleBasisSegments([start, ...q.slice(1, n - 1), end]))
}

/** `emitBundleBasis`, shaped as the `Segment[]` `serialise` consumes. */
function emitBundleBasisSegments(q: Point[]): Segment[] {
    const n = q.length
    const segments: Segment[] = []
    const push = (command: string, points: Point[]): void => {
        segments.push({
            command,
            points: points.map((p) => ({ x: p.x, y: p.y, onCurve: command === 'L' || command === 'M' })),
        })
    }
    push('M', [q[0] as Point])
    push('L', [blend(q[0] as Point, q[1] as Point, q[1] as Point, 5, 1, 0)])
    for (let k = 1; k <= n - 2; k++) {
        push('C', [
            along(q[k - 1] as Point, q[k] as Point, 1 / 3),
            along(q[k - 1] as Point, q[k] as Point, 2 / 3),
            blend(q[k - 1] as Point, q[k] as Point, q[k + 1] as Point, 1, 4, 1),
        ])
    }
    push('C', [
        along(q[n - 2] as Point, q[n - 1] as Point, 1 / 3),
        along(q[n - 2] as Point, q[n - 1] as Point, 2 / 3),
        blend(q[n - 2] as Point, q[n - 1] as Point, q[n - 1] as Point, 1, 5, 0),
    ])
    push('L', [q[n - 1] as Point])
    return segments
}

/**
 * Re-anchor one edge path so it starts on `source`'s card border and
 * its arrow **tip** lands on `target`'s card border.
 *
 * Two mechanisms, chosen by what the `d` turns out to be:
 *
 *   - **d3 `curveBundle.basis`** — the shipped `flowchart.curve` — goes
 *     through `reanchorBundleBasis`, which decodes d3's routing out of
 *     the `d`, moves its two end points onto the cards and re-runs d3's
 *     own emission. This is the path every real edge takes, and it is
 *     the only one of the two that keeps the curve's *shape*; see the
 *     file header for the measurement that says so.
 *   - **everything else** falls back to `anchorEnds`, which translates
 *     the run of geometry at each end. Correct for a polyline, where
 *     there is no curvature to disturb, and the answer for the three
 *     `flowchart.curve` settings the plugin does not ship.
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
    const last = points.at(-1)
    if (first === undefined || last === undefined) return null
    if (isBundleBasis(groups, points)) {
        const q = decodeBundleBasis(points)
        if (q !== null) return reanchorBundleBasis(q, source, target, halfWidth, halfHeight, endOvershoot)
    }
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

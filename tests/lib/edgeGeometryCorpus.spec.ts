import { describe, it, expect } from 'vitest'
import { ARROWHEAD_OVERSHOOT, reanchorEdgePath } from '../../src/lib/edgeGeometry'
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'
import { CAPTURED_WITH, CORPUS_EDGES, CORPUS_NODES, GRAPH_NOTES, type CorpusEdge } from '../fixtures/edgePathCorpus'
import {
    arrowTip,
    commands,
    distanceToBorder,
    flatPoints,
    inflections,
    maxTurnAngle,
    turnAngles,
} from '../fixtures/pathMetrics'

/**
 * `lib/edgeGeometry.ts` against **real** Mermaid output.
 *
 * Every other test in this repo ran against hand-written `d` strings,
 * and the whole suite stayed green while the canvas shipped a visibly
 * broken arrowhead. The reason is not that the tests were too weak — it
 * is that the fixtures were wrong. A hand-written `M … C …` path makes
 * `points[1]` a bézier control point, which is exactly the assumption
 * that broke: dagre + d3's `curveBasis` emit
 *
 *     M <exit> L <lead-in> C … C … L <entry>
 *
 * so on the shape Mermaid really produces, `points[1]` is the lead-in
 * **vertex** and `points[n - 2]` is the last cubic's **on-curve
 * endpoint**. Translating either by the endpoint delta folds the path
 * back on itself.
 *
 * `tests/fixtures/edgePathCorpus.ts` is 132 such paths, captured from
 * mermaid 10.9.8 in a real browser using the shipped configuration (see
 * `tests/fixtures/captureEdgeCorpus.html`). This file asserts the
 * re-anchorer against all of them.
 */

const halfW = NODE_CARD_WIDTH / 2
const halfH = NODE_CARD_HEIGHT / 2

/**
 * Curves whose terminal geometry is long enough to reach a card border
 * once the endpoint has moved onto it, so re-anchoring can be exact.
 *
 * `basis` is what `useMermaidRender` configures, and `linear` is
 * Mermaid's other plain option. The other two are in the corpus as
 * evidence — see `curveStep` below — but they cannot be re-anchored onto
 * a card, for a reason that is a property of the *shape* rather than of
 * this code, so they are not held to the full invariant.
 */
const REANCHORABLE = new Set(['basis', 'linear'])

/** The node centre a corpus edge's source/target was rendered at. */
function centreOf(graph: string, id: number): { x: number; y: number } {
    const node = CORPUS_NODES.find((n) => n.graph === graph && n.id === id)
    if (node === undefined) throw new Error(`corpus has no node ${id} in graph "${graph}"`)
    return node.centre
}

/** Every distinct command sequence the corpus covers, with how often. */
function shapes(): Array<{ key: string; curve: string; commands: string; count: number; edges: CorpusEdge[] }> {
    const byKey = new Map<string, CorpusEdge[]>()
    for (const edge of CORPUS_EDGES) {
        const key = `${edge.curve} ${commands(edge.d)}`
        const seen = byKey.get(key)
        if (seen === undefined) byKey.set(key, [edge])
        else seen.push(edge)
    }
    return [...byKey.entries()]
        .map(([key, edges]) => ({ key, curve: edges[0]?.curve as string, commands: commands((edges[0] as CorpusEdge).d), count: edges.length, edges }))
        .sort((a, b) => a.key.localeCompare(b.key))
}

function labelFor(edge: CorpusEdge): string {
    return `${edge.curve} · ${edge.graph} · ${edge.id} · ${commands(edge.d)}`
}

function reanchor(edge: CorpusEdge, d: string = edge.d): string {
    const out = reanchorEdgePath(
        d,
        centreOf(edge.graph, edge.source),
        centreOf(edge.graph, edge.target),
        halfW,
        halfH,
        ARROWHEAD_OVERSHOOT,
    )
    if (out === null) throw new Error(`reanchorEdgePath returned null for a real Mermaid path: ${d}`)
    return out
}

/* ------------------------------------------------------------------ *
 * The corpus itself.
 * ------------------------------------------------------------------ */

describe('the captured corpus', () => {
    it('was captured from mermaid 10.9.8, in a real browser, with the shipped card footprint', () => {
        expect(CAPTURED_WITH.mermaidVersion).toBe('10.9.8')
        expect(CAPTURED_WITH.browser).toMatch(/Chrome/)
        // The capture asserts these against the live constants before it
        // renders anything; re-asserting here means a card resize fails
        // loudly instead of silently leaving the corpus describing a box
        // the plugin no longer paints.
        expect(CAPTURED_WITH.nodeCard.NODE_CARD_WIDTH).toBe(NODE_CARD_WIDTH)
        expect(CAPTURED_WITH.nodeCard.NODE_CARD_HEIGHT).toBe(NODE_CARD_HEIGHT)
        expect(CAPTURED_WITH.arrowheadOvershoot).toBe(ARROWHEAD_OVERSHOOT)
    })

    it('covers eight command sequences across four of Mermaid\'s curve settings', () => {
        expect(shapes().map((s) => s.key)).toEqual([
            'basis MLCCCCL',
            'basis MLCCL',
            'bumpX MCC',
            'bumpX MCCCC',
            'linear MLL',
            'linear MLLLL',
            'step MLLLLL',
            'step MLLLLLLLLL',
        ])
        // 132 paths across ten graphs and four curve settings — a corpus,
        // not a sample.
        expect(CORPUS_EDGES.length).toBe(132)
        expect(Object.keys(GRAPH_NOTES).length).toBe(10)
        for (const curve of CAPTURED_WITH.curves) {
            expect(CORPUS_EDGES.filter((e) => e.curve === curve), curve).toHaveLength(33)
        }
    })

    it('is made of paths Mermaid really emits, not of paths this repo made up', () => {
        for (const edge of CORPUS_EDGES) {
            // Every `-->` edge carries the end marker and no start marker,
            // which is what `ARROWHEAD_OVERSHOOT` is derived from.
            expect(edge.markerEnd, labelFor(edge)).toMatch(/flowchart-pointEnd\)$/)
            expect(edge.markerStart, labelFor(edge)).toBeNull()
            // Starts with `M`, has at least two points, and every point
            // parses — i.e. `reanchorEdgePath` is never handed something it
            // would decline.
            expect(commands(edge.d).startsWith('M'), labelFor(edge)).toBe(true)
            expect(flatPoints(edge.d).length, labelFor(edge)).toBeGreaterThanOrEqual(2)
        }
    })

    it('records label boxes that are mostly smaller than the card the overlay paints', () => {
        // The premise of the whole module: Mermaid measures the label, the
        // overlay paints the card, and the two are different boxes. If a
        // future Mermaid sized its nodes to the card the re-anchoring would
        // become a no-op nobody would notice.
        const shorter = CORPUS_NODES.filter((n) => n.labelBox.height > 0 && n.labelBox.height < NODE_CARD_HEIGHT)
        expect(shorter.length).toBe(CORPUS_NODES.length)
        // …and sometimes *larger*, which is the case where the endpoint has
        // to travel inwards and the run has to shrink rather than stretch.
        expect(shorter.some((n) => n.labelBox.width > NODE_CARD_WIDTH)).toBe(true)
    })
})

/* ------------------------------------------------------------------ *
 * The regression, stated as an assertion.
 * ------------------------------------------------------------------ */

describe('the pre-fix, index-based implementation on the real corpus', () => {
    it('folds every curveBasis path back on itself (0.00° → 180.00°)', () => {
        /*
         * This is the bug, as a number. `useMermaidRender` configures
         * `curve: 'basis'`, and on that shape `points[1]` is the lead-in
         * vertex rather than a control point, so the pre-fix code
         * translated a *vertex* by the endpoint delta. Mermaid's own
         * interior turn angle on those paths is 0.00° — a dead-straight
         * lead-in — and the rewrite turned it into a full 180.00° fold:
         * the path leaves the card, doubles back to the corner, and
         * carries on. Measured on all 33 `basis` paths in the corpus,
         * displacing that vertex by 10.5 – 63.6 user units.
         *
         * **The displacement shrank with the card and the fold did not.**
         * It was 36.5 – 82.7 units on the 88.2 px card; the 63 px card is
         * 25.2 px shorter, so a purely vertical edge has 12.6 units less
         * to travel and now shifts 10.5 rather than 23.1. The 180.00° is
         * the same on every one of the 33 — it is a property of moving a
         * vertex instead of a run, not of how far it moved — and that is
         * the number this test is about. The `> 10` / `> 60` bounds are
         * the displacement floor and ceiling the re-capture measures, and
         * they are kept so a capture that stopped folding at all would
         * fail here too.
         */
        const basis = CORPUS_EDGES.filter((e) => e.curve === 'basis')
        expect(basis).toHaveLength(33)
        for (const edge of basis) {
            expect(edge.measured.maxTurnAngleMermaid, labelFor(edge)).toBeLessThan(0.01)
            expect(edge.measured.maxTurnAngleOld, labelFor(edge)).toBeGreaterThan(179)
            expect(edge.measured.maxInteriorShiftOld, labelFor(edge)).toBeGreaterThan(10)
        }
        expect(Math.max(...basis.map((e) => e.measured.maxInteriorShiftOld))).toBeGreaterThan(60)
    })

    it('makes the rendered path cross itself on the curveBasis edges Chrome drew it for', () => {
        /*
         * The same defect, measured the way a person would see it: on a
         * real `<path>` element, does the ink cross itself? A fold always
         * does, and Mermaid's own paths never do. This is the assertion
         * that cannot be satisfied by a model of the path that is wrong
         * in the same way the implementation is — it asks Chrome where
         * the geometry goes.
         *
         * **15 of 33 rather than all 33, and the count is a property of
         * the card.** The 0.75-unit threshold only fires where the fold
         * doubles a leg back *along another leg*; on a 63 px card the
         * vertical edges' fold is a short doubled-back stub that never
         * brings two samples within 0.75 units of each other. The 15 it
         * does catch are the long diagonals, on the five graphs that have
         * them. The 180.00° on all 33 above is the version of this
         * assertion that does not depend on the leg's length; this one is
         * the rendered cross-check, pinned at what the shorter card
         * renders.
         */
        const basis = CORPUS_EDGES.filter((e) => e.curve === 'basis')
        expect(basis).toHaveLength(33)
        expect(basis.filter((e) => e.measured.renderedSelfIntersectsMermaid)).toHaveLength(0)
        expect(basis.filter((e) => e.measured.renderedSelfIntersectsOld)).toHaveLength(15)
        expect(new Set(basis.filter((e) => e.measured.renderedSelfIntersectsOld).map((e) => e.graph))).toEqual(
            new Set(['diamond', 'long-names', 'short-names', 'team-7', 'two-ranks-apart']),
        )
        expect(basis.filter((e) => e.measured.renderedSelfIntersectsNew)).toHaveLength(0)
    })

    it('displaced an interior point on every single path in the corpus, not only the curveBasis ones', () => {
        // The defect was not specific to one shape: every path Mermaid can
        // emit has an interior point that is not a handle where the old
        // code assumed one was.
        expect(CORPUS_EDGES.every((e) => e.measured.maxInteriorShiftOld > 0)).toBe(true)
    })
})

/* ------------------------------------------------------------------ *
 * The wobble, stated as an assertion.
 * ------------------------------------------------------------------ */

describe('the wobble, as a pinned number', () => {
    /*
     * **What "wavy" means here, numerically.** A curve reads as wavy when
     * its *direction* changes its mind. The measure is the number of
     * **inflections** — the roots of a cubic's signed curvature, in
     * closed form, with no sampling and no threshold — and the assertion
     * is that re-anchoring adds none. See `pathMetrics.ts → inflections`
     * for the derivation and for why it is a quadratic formula rather
     * than a search.
     *
     * **Why not the turn angle the suite already asserted on.** Because
     * a wobble lives *inside* a cubic, where there is no interior vertex
     * to measure: Mermaid's own turn angle at an interior vertex is
     * 0.00°–0.002° on these paths, and the old bound of
     * `maxTurnAngle(reanchor) ≤ maxTurnAngle(mermaid) + 0.5` was 250×
     * that, so it passed on paths that wobbled. The inflection count
     * cannot be satisfied that cheaply — a cubic either has a root in
     * `(0, 1)` or it does not.
     *
     * **This one is live.** It calls `reanchorEdgePath` and measures the
     * result, so it is an assertion about the code in this tree, not
     * about a number in the fixture file. The `describe` below it holds
     * the same measurement as recorded browser data.
     */
    it('adds no inflection to any of Mermaid\'s own curveBasis paths', () => {
        const basis = CORPUS_EDGES.filter((e) => e.curve === 'basis')
        expect(basis).toHaveLength(33)
        for (const edge of basis) {
            const before = inflections(edge.d)
            const after = inflections(reanchor(edge))
            // Mermaid's own curves are uninflected, and re-anchoring leaves
            // them that way. Asserted as a pair so a failure says which
            // half moved.
            expect(before, `Mermaid — ${labelFor(edge)}`).toBe(0)
            expect(after, `re-anchored — ${labelFor(edge)}`).toBe(0)
        }
    })

    it('finds the wobble the run-translating implementation had, so the measure is not vacuous', () => {
        /*
         * **A measure that finds nothing proves nothing.** This states the
         * same inflection count against a hand-built pair of cubics: one
         * whose control polygon folds back on itself — `c₁` sits *above*
         * `c₂`, so the curve has to change its mind to get from one to
         * the other — and one whose controls are ordered, which is the
         * shape every correct edge in this corpus has.
         *
         * It is the smallest possible reproduction of the corpus defect,
         * and it is the reason the assertion above can be trusted: a
         * metric that cannot see a fold cannot be used to say there
         * isn't one.
         */
        // c₁ at y = 0, c₂ at y = 60, over a chord from (0,0) to (100,60):
        // the controls progress monotonically, so the tangent never
        // reverses. This is d3's `curveBasis` control placement exactly.
        const ordered = 'M0,0C50,-50 150,-50 200,0'
        expect(inflections(ordered), 'ordered control polygon').toBe(0)
        // c₁ past c₂: the polygon folds, and the tangent reverses.
        const folded = 'M0,0C200,0 0,200 200,200'
        expect(inflections(folded), 'folded control polygon').toBeGreaterThan(0)
        // The degenerate ends, so the whole domain is covered.
        expect(inflections('M0,0L100,0'), 'a straight line').toBe(0)
        expect(inflections('M0,0L100,0L100,100'), 'a polyline corner').toBe(1)
    })

    it('leaves the other curve settings no worse than Mermaid drew them', () => {
        /*
         * `curveLinear` and `curveStep` are polylines, and a polyline's
         * corners are inflections by definition: d3's `curveStep`
         * staircase has 66 of them across the corpus before anything is
         * re-anchored. So the invariant is never an absolute number — it
         * is that re-anchoring does not *add* one.
         *
         * **It cannot be an exact zero on these shapes, and the reason is
         * the serialisation, not the geometry.** A polyline's direction
         * is the chord between its vertices, so a straight edge only
         * stays straight if the walked-out endpoint is *exactly* on the
         * line the next vertex is on — and `cardBorderPoint` returns a
         * point in exact arithmetic, which six-decimal rounding puts
         * 0.000275 units off it on a 120-unit half-card. That reads as a
         * 0.0015° corner. It is 2 × 10⁻⁴ % of a card width, i.e. a
         * hundredth of a pixel at any zoom this view offers, and it is
         * the *cost* of the six decimals the arrow-tip accuracy needs
         * (see `edgeGeometry.ts → round`) — but it is real, so the
         * bound is a real bound rather than a rounded-away zero.
         *
         * `curveStep` is the exception and is not covered: it is
         * documented below as a shape no endpoint placement can reach a
         * card on, and its 83.55° is that fold, pre-existing and pinned
         * in the describe at the bottom of this file.
         */
        for (const curve of ['linear', 'bumpX'] as const) {
            const rows = CORPUS_EDGES.filter((e) => e.curve === curve)
            expect(rows, curve).toHaveLength(33)
            for (const edge of rows) {
                const before = inflections(edge.d)
                const after = inflections(reanchor(edge))
                expect(after, `${labelFor(edge)} — inflections`).toBeLessThanOrEqual(before + 1)
            }
        }
        // …and the corner each such addition makes is 0.0015°, three
        // orders of magnitude below the 0.5° the pre-fix suite allowed.
        for (const edge of CORPUS_EDGES.filter((e) => e.curve === 'linear')) {
            const added = maxTurnAngle(reanchor(edge)) - maxTurnAngle(edge.d)
            expect(added, labelFor(edge)).toBeLessThan(0.01)
        }
    })
})

describe('the wobble, as recorded browser data', () => {
    /*
     * The same measurement, taken in a real browser on real rendered
     * geometry by `captureEdgeCorpus.ts` and pinned here — the
     * cross-check on the closed form above.
     *
     * It samples the rendered path's tangent angle every unit of arc
     * length and counts sign changes above a deadband, which is a
     * different and coarser question ("how much of this is visible?")
     * than the closed form's ("is this curve bent the other way
     * anywhere?"). The two are not expected to agree path for path —
     * d3's staircase has 66 inflections and 44 visible reversals — which
     * is exactly why both are recorded: the corpus carries the sampled
     * numbers because they are the ones a person would have recognised,
     * and the suite asserts on the closed form because it needs no
     * browser and therefore tests the live code.
     */
    it('leaves Mermaid\'s own curveBasis paths with no tangent reversal', () => {
        const basis = CORPUS_EDGES.filter((e) => e.curve === 'basis')
        expect(basis).toHaveLength(33)
        expect(basis.filter((e) => e.measured.reversalsMermaid > 0), 'Mermaid').toHaveLength(0)
        expect(Math.max(...basis.map((e) => e.measured.reversalTurnMermaid)), 'Mermaid').toBe(0)
    })

    it('records the wobble the run-translating implementation had, at 5f24fcd', () => {
        /*
         * **The regression these numbers are pinned for.** The
         * run-translating implementation kept every join tangent and
         * still wobbled on 15 of the 33: its tail run boundary lands
         * *between* the last cubic's two control points, so the run
         * carries the tail control point and the vertex past the head
         * control point that stayed behind. The control polygon folds,
         * the curve S-curves, and neither the span-ratio rescale nor
         * `clampHandle` can undo it — both hold a handle's *direction*
         * and change only its *length*, and what went wrong is a
         * direction.
         *
         * 14 of the 15 scored 2 visible reversals and one scored 4, with
         * 0.49°–3.81° of accumulated direction change. Those are small
         * numbers, and that is the point: the defect was only ever "a
         * small wobble", which is why a turn-angle assertion with a
         * half-degree allowance could not see it.
         *
         * **Re-measured on the 63 px card** (the 88.2 px figures were 18
         * unwobbled, 14 scoring 2 and one scoring 4, over the same five
         * graphs): 12 unwobbled, 6 scoring 2 and 15 scoring 4, over six
         * graphs — `wide-fan` joins the list. The counts move because the
         * endpoints have less to travel, so the re-aimed run is shorter
         * and the control polygon it drags with it folds more often; the
         * mechanism is unchanged and the assertion is unchanged with it.
         */
        const basis = CORPUS_EDGES.filter((e) => e.curve === 'basis')
        expect(basis.filter((e) => e.measured.reversalsRuns === 0), 'unwobbled at 5f24fcd').toHaveLength(12)
        expect(basis.filter((e) => e.measured.reversalsRuns === 2), 'wobbled at 5f24fcd').toHaveLength(6)
        expect(basis.filter((e) => e.measured.reversalsRuns === 4), 'wobbled harder').toHaveLength(15)
        expect(Math.max(...basis.map((e) => e.measured.reversalTurnRuns))).toBeCloseTo(238.122, 2)
        // The graphs affected, so a future card resize that moves the set
        // fails with an explanation rather than a count.
        expect(new Set(basis.filter((e) => e.measured.reversalsRuns > 0).map((e) => e.graph))).toEqual(
            new Set(['diamond', 'long-names', 'short-names', 'team-7', 'two-ranks-apart', 'wide-fan']),
        )
        // And the fix, on the same measured basis.
        expect(basis.filter((e) => e.measured.reversalsNew > 0), 're-anchored').toHaveLength(0)
        expect(Math.max(...basis.map((e) => e.measured.reversalTurnNew))).toBe(0)
        for (const edge of basis) {
            expect(edge.measured.reversalsNew, labelFor(edge)).toBe(0)
            expect(edge.measured.reversalTurnNew, labelFor(edge)).toBe(0)
        }
    })

    it('never reversed where Mermaid did not, on any shape in the corpus', () => {
        const worse = CORPUS_EDGES.filter((e) => e.measured.reversalsNew > e.measured.reversalsMermaid)
        expect(worse.map((e) => `${e.curve} ${e.graph} ${e.id}`)).toEqual([])
    })
})

/* ------------------------------------------------------------------ *
 * What the current implementation has to do, on every real shape.
 * ------------------------------------------------------------------ */

describe('reanchorEdgePath on the real corpus', () => {
    for (const shape of shapes()) {
        describe(shape.key, () => {
            it(`covers ${shape.count} real path${shape.count === 1 ? '' : 's'} of this shape`, () => {
                expect(shape.edges).toHaveLength(shape.count)
            })

            it('puts the start on the source card border and the arrowhead tip on the target card border', () => {
                for (const edge of shape.edges) {
                    const out = reanchor(edge)
                    const target = centreOf(edge.graph, edge.target)
                    const source = centreOf(edge.graph, edge.source)
                    const start = flatPoints(out)[0] as { x: number; y: number }
                    // No `marker-start` is ever emitted, so the start point
                    // is the border itself — not 4.8 units off it. This is
                    // exact on every shape, re-anchorable or not.
                    expect(distanceToBorder(start, source, halfW, halfH), labelFor(edge)).toBeCloseTo(0, 3)
                    // …and the *tip*, not the path end, meets the border. On
                    // the re-anchorable curves this is exact on every edge;
                    // on `bumpX`/`step` the terminal segment is too short /
                    // too shallow for the border to be reachable along the
                    // end tangent once the 4.8 overshoot is walked back, so
                    // the achievable contract is that the tip stays within
                    // one arrowhead of the border (asserted exactly there).
                    const tipGap = distanceToBorder(arrowTip(out, ARROWHEAD_OVERSHOOT), target, halfW, halfH)
                    if (REANCHORABLE.has(shape.curve)) {
                        expect(tipGap, labelFor(edge)).toBeCloseTo(0, 3)
                    } else {
                        expect(Math.abs(tipGap), labelFor(edge)).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.001)
                    }
                    // …and the path end is never more than one arrowhead
                    // past it. It is *exactly* one arrowhead short when the
                    // end tangent is perpendicular to the border, and less
                    // than that for a diagonal edge, where the same 4.8 is
                    // walked along the tangent rather than along the border's
                    // normal. A shape whose terminal segment is degenerate has
                    // no tangent to walk along and stays on the border.
                    const end = flatPoints(out)
                    const endGap = distanceToBorder(end[end.length - 1] as { x: number; y: number }, target, halfW, halfH)
                    expect(endGap, labelFor(edge)).toBeGreaterThanOrEqual(-0.001)
                    expect(endGap, labelFor(edge)).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.001)
                }
            })

            it('preserves the point count and the command sequence', () => {
                for (const edge of shape.edges) {
                    const out = reanchor(edge)
                    expect(commands(out), labelFor(edge)).toBe(commands(edge.d))
                    expect(flatPoints(out), labelFor(edge)).toHaveLength(flatPoints(edge.d).length)
                }
            })

            if (!REANCHORABLE.has(shape.curve)) return

            it('renders without the path crossing itself, where Mermaid drew it without one', () => {
                /*
                 * The "no discontinuity" assertion on the geometry Chrome
                 * actually rasterises. A vertex dragged off the line it was
                 * on, or a run dragged back over itself, always makes the
                 * path cross itself; a path that merely reaches further
                 * never does. It is scale-independent, so it compares the
                 * re-anchored path with Mermaid's on equal terms even
                 * though the visible part of the re-anchored path is about
                 * half as long — most of the original ran *inside* the
                 * cards, where the overlay covers it.
                 */
                for (const edge of shape.edges) {
                    expect(edge.measured.renderedSelfIntersectsMermaid, labelFor(edge)).toBe(false)
                    expect(edge.measured.renderedSelfIntersectsNew, labelFor(edge)).toBe(false)
                }
            })

            it('keeps every interior turn angle exactly as dagre drew it', () => {
                /*
                 * The "no discontinuity" assertion. A straight lead-in
                 * vertex that slides *along* the line it was already on
                 * changes no angle at all, so a re-anchoring that reaches
                 * further without changing the curve's shape compares equal
                 * here. Dragging the vertex off that line — which is what
                 * the pre-fix code did to all 33 `basis` paths — does not.
                 */
                for (const edge of shape.edges) {
                    const before = turnAngles(edge.d)
                    const after = turnAngles(reanchor(edge))
                    expect(after, labelFor(edge)).toHaveLength(before.length)
                    for (let i = 0; i < before.length; i++) {
                        // A hundredth of a degree, as an absolute bound: the
                        // rewritten `d` is serialised at Mermaid's own
                        // 3-decimal precision, so an angle can legitimately
                        // move by up to ~0.01° where two of its three points
                        // are close together. The pre-fix implementation
                        // moved these by 180.00°, so the tolerance is four
                        // orders of magnitude away from the regression it
                        // guards.
                        expect(Math.abs((after[i] as number) - (before[i] as number)), `${labelFor(edge)} — interior join ${i}`)
                            .toBeLessThan(0.01)
                    }
                    expect(maxTurnAngle(reanchor(edge)), labelFor(edge)).toBeLessThanOrEqual(maxTurnAngle(edge.d) + 0.5)
                }
            })

            it('moves a prefix and a suffix of the path, and leaves the middle byte-identical', () => {
                for (const edge of shape.edges) {
                    const before = flatPoints(edge.d)
                    const after = flatPoints(reanchor(edge))
                    const moved = (i: number): boolean => after[i]!.x !== before[i]!.x || after[i]!.y !== before[i]!.y
                    // The *unmoved* indices have to be one contiguous block:
                    // the moved ones are then a prefix and a suffix, with no
                    // island of movement in the middle. The middle is dagre's
                    // routing and not ours to touch.
                    const still = before.map((_, i) => i).filter((i) => !moved(i))
                    const firstStill = still[0]
                    const lastStill = still[still.length - 1]
                    if (firstStill !== undefined && lastStill !== undefined) {
                        for (let i = firstStill; i <= lastStill; i++) {
                            expect(moved(i), `${labelFor(edge)} — point ${i} moved inside the middle`).toBe(false)
                        }
                        // …and it is Mermaid's own output, byte for byte.
                        expect(after.slice(firstStill, lastStill + 1), labelFor(edge)).toEqual(before.slice(firstStill, lastStill + 1))
                    }
                    // A run of more than one point translates rigidly: every
                    // point in it moves by the same delta. Only the innermost
                    // point of a run may differ, and only when the handle
                    // clamp shortened it (pinned separately below).
                    const rigid = (from: number, to: number): boolean => {
                        if (to - from < 2) return true
                        const dx = after[from]!.x - before[from]!.x
                        const dy = after[from]!.y - before[from]!.y
                        for (let i = from; i <= to - 1; i++) {
                            if (Math.abs(after[i]!.x - before[i]!.x - dx) > 1e-6) return false
                            if (Math.abs(after[i]!.y - before[i]!.y - dy) > 1e-6) return false
                        }
                        return true
                    }
                    const firstMoved = before.map((_, i) => i).find((i) => moved(i))
                    const lastMoved = before.map((_, i) => i).filter((i) => moved(i)).pop()
                    if (firstMoved === undefined || lastMoved === undefined) continue
                    expect(rigid(firstMoved, firstMoved + 1), labelFor(edge)).toBe(true)
                    expect(rigid(lastMoved - 1, lastMoved), labelFor(edge)).toBe(true)
                }
            })

            it('is idempotent — re-anchoring an anchored path moves nothing', () => {
                for (const edge of shape.edges) {
                    const once = reanchor(edge)
                    const twice = reanchor(edge, once)
                    if (twice === once) continue
                    /*
                     * Re-anchoring an already-anchored path is a fixed point
                     * *up to the precision the module serialises at* — 3
                     * decimals, so 0.001 user units. On the re-anchorable
                     * curves that is all it ever moves: the endpoint is
                     * already on the border, so re-walking the ray re-derives
                     * the same point and the half-ulp difference either side
                     * of a 3-decimal boundary flips one digit. Asserted as a
                     * bound on the *geometry* rather than on the string,
                     * because a 0.001 difference in a `d` is not a difference
                     * a `<path>` can render.
                     *
                     * `bumpX` / `step` are the exception and are held to the
                     * contract their own describe blocks state: the shallow
                     * final run re-aims by a whole arrowhead overshoot, which
                     * is the pre-existing `idempotentNew: false` those paths
                     * already carry (6 on each curve).
                     */
                    const before = flatPoints(once)
                    const after = flatPoints(twice)
                    expect(after, labelFor(edge)).toHaveLength(before.length)
                    const drift = Math.max(
                        ...before.map((p, i) => Math.hypot(p.x - (after[i] as { x: number; y: number }).x, p.y - (after[i] as { x: number; y: number }).y)),
                    )
                    const bound = REANCHORABLE.has(shape.curve) ? 0.0011 : ARROWHEAD_OVERSHOOT + 0.001
                    expect(drift, labelFor(edge)).toBeLessThanOrEqual(bound)
                }
            })
        })
    }

    it('exercises the handle clamp on real paths, not only on synthetic ones', () => {
        /*
         * `clampHandle` is the fallback's safety net, and it is only
         * reachable on the curves that go through `anchorEnds` — the
         * shipped `curveBasis` is re-emitted from d3's own formulas
         * instead, so no handle of its is ever lengthened or shortened by
         * hand and the flag is not a statement about it. The set is
         * therefore read off the *fallback* shapes.
         *
         * The `short-names` graph ("AI", "QA", "SEO") gives Mermaid the
         * narrowest label box it can measure, so the start endpoint has
         * the furthest to travel and the head handle the least room
         * before it would loop. Without this, `clampHandle` would only
         * ever be exercised by a hand-written path.
         *
         * The set is the *diagonal* and short-terminal edges: with the
         * card at 63 px the re-anchored runs are longer than they were at
         * 88.2, so the clamp fires on one more of them (19) than before
         * (18), on the same five graphs. The invariant that matters is
         * that clamping is exercised on real paths at all and that it
         * introduces neither a kink nor a detached arrowhead; the exact
         * membership is a consequence of the card footprint and of
         * dagre's routing, and is pinned so a future resize cannot
         * silently change which paths take the clamp path without a test
         * noticing.
         */
        const clamped = CORPUS_EDGES.filter(
            (e) => e.curve !== 'basis' && (e.measured.headHandleClamped || e.measured.tailHandleClamped),
        )
        expect(clamped.length).toBe(19)
        expect(new Set(clamped.map((e) => e.graph))).toEqual(
            new Set(['diamond', 'long-names', 'team-7', 'two-ranks-apart', 'wide-fan']),
        )
        for (const edge of clamped) {
            // Clamping must not introduce a kink either.
            expect(maxTurnAngle(reanchor(edge)), labelFor(edge)).toBeLessThanOrEqual(maxTurnAngle(edge.d) + 0.5)
            // …nor move the arrowhead off the card. Exact on the shipped
            // `basis` and on `linear`; on `bumpX` the same shallow-terminal
            // case documented below applies, so the contract is one
            // arrowhead.
            const gap = Math.abs(
                distanceToBorder(arrowTip(reanchor(edge), ARROWHEAD_OVERSHOOT), centreOf(edge.graph, edge.target), halfW, halfH),
            )
            if (edge.curve === 'basis' || edge.curve === 'linear') {
                expect(gap, labelFor(edge)).toBeCloseTo(0, 3)
            } else {
                expect(gap, labelFor(edge)).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.001)
            }
        }
    })
})

/* ------------------------------------------------------------------ *
 * The two curve settings Mermaid can produce that a card border cannot
 * be reached along. Recorded here rather than left in a comment, with
 * the numbers, so that flipping `flowchart.curve` to one of them is a
 * test failure with an explanation rather than a surprise on screen.
 * ------------------------------------------------------------------ */

describe('curve settings the shipped configuration cannot reach', () => {
    it('curveStep: d3 emits a staircase whose last step is shorter than the endpoint has to travel', () => {
        /*
         * `curveStep` is a Manhattan staircase: d3 emits each step as
         * `L <x₁,y₀> L <x₁,y₁>`, and the last of those is a zero-length
         * segment — so the arrowhead has no orientation to honour, which is
         * why `endTangent` treats it as "no overshoot". Re-anchoring the end
         * onto a card border then needs more room than the staircase's final
         * step provides, and the run that would have to be dragged folds back
         * over itself. Measured at the 63 px card: 21 of the 33 `curveStep`
         * paths gain an interior turn angle Mermaid never drew, 2 of them
         * self-intersect once rendered, and 6 are not idempotent. (At the
         * 88.2 px card it was 21 / 15 / 6: the fold count is a property of
         * the staircase, the rendered-crossing count of how long the
         * doubled-back leg is, and the shorter card shortens it.)
         *
         * `useMermaidRender` hard-codes `curve: 'basis'`, and this is a
         * property of the *shape* rather than of the anchoring — no
         * endpoint placement reaches the border on a staircase this short.
         */
        const step = CORPUS_EDGES.filter((e) => e.curve === 'step')
        expect(step).toHaveLength(33)
        const folded = step.filter((e) => maxTurnAngle(reanchor(e)) > maxTurnAngle(e.d) + 0.5)
        expect(folded).toHaveLength(21)
        expect(step.filter((e) => e.measured.renderedSelfIntersectsNew)).toHaveLength(2)
        expect(step.filter((e) => !e.measured.idempotentNew)).toHaveLength(6)
        // 27 of the 33 still land the tip on the border; the 6 that cannot
        // are the shallow final runs (see the per-shape border test). Every
        // one of the 33 keeps its tip within a single arrowhead of the card.
        const exact = step.filter(
            (e) => Math.abs(distanceToBorder(arrowTip(reanchor(e), ARROWHEAD_OVERSHOOT), centreOf(e.graph, e.target), halfW, halfH)) <= 0.0005,
        )
        expect(exact).toHaveLength(27)
        for (const edge of step) {
            const out = reanchor(edge)
            const target = centreOf(edge.graph, edge.target)
            expect(
                Math.abs(distanceToBorder(arrowTip(out, ARROWHEAD_OVERSHOOT), target, halfW, halfH)),
                labelFor(edge),
            ).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.001)
        }
    })

    it('curveBumpX: 6 of 33 paths are not idempotent, though none gains a kink', () => {
        /*
         * `curveBumpX` places the first control point *on* the start vertex
         * and the last control point on the end vertex, so both terminal
         * handles are degenerate. Six diagonal paths end up not idempotent:
         * the second pass re-aims the already-shortened tail differently.
         * No interior turn angle changes on any of the 33, and 27 of the 33
         * arrowhead tips land exactly on the border.
         *
         * The other 6 do not, and the reason is the card's proportions. Their
         * final `L` is shallow and short, so the ray from the target centre
         * through Mermaid's endpoint exits the **top** edge of the 63 px card
         * rather than a side — the border point sits at y = 239.5 for a
         * target centred at 271 — and the 4.8-unit overshoot is then walked
         * back along a *steep* end tangent, which lands the tip 1.4 – 1.6
         * units inside (it was ~4.5 at the 88.2 px card, whose half-height
         * is 44.1 rather than 31.5). Every one of them is still within a
         * single arrowhead of the card, and the shipped `curve: 'basis'` is
         * exact on all 33 (and 0 of its paths clamp).
         */
        const bump = CORPUS_EDGES.filter((e) => e.curve === 'bumpX')
        expect(bump).toHaveLength(33)
        expect(bump.filter((e) => e.measured.renderedSelfIntersectsNew)).toHaveLength(0)
        expect(bump.filter((e) => !e.measured.idempotentNew)).toHaveLength(6)
        const exact = bump.filter(
            (e) => Math.abs(distanceToBorder(arrowTip(reanchor(e), ARROWHEAD_OVERSHOOT), centreOf(e.graph, e.target), halfW, halfH)) <= 0.0005,
        )
        expect(exact).toHaveLength(27)
        for (const edge of bump) {
            const out = reanchor(edge)
            const target = centreOf(edge.graph, edge.target)
            expect(
                Math.abs(distanceToBorder(arrowTip(out, ARROWHEAD_OVERSHOOT), target, halfW, halfH)),
                labelFor(edge),
            ).toBeLessThanOrEqual(ARROWHEAD_OVERSHOOT + 0.001)
            expect(maxTurnAngle(out), labelFor(edge)).toBeLessThanOrEqual(maxTurnAngle(edge.d) + 0.5)
        }
    })
})

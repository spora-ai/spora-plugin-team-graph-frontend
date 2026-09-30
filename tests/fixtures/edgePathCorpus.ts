/**
 * Real Mermaid 10.9.8 edge paths, captured from a live render.
 *
 * DO NOT HAND-EDIT. Re-captured with:
 *
 *     npx vite --port 5199
 *     # open in Chromium:
 *     #   http://localhost:5199/plugins/team-graph/tests/fixtures/captureEdgeCorpus.html
 *     # then evaluate window.__CORPUS__ in the console
 *
 * See `tests/fixtures/captureEdgeCorpus.html` and
 * `tests/fixtures/captureEdgeCorpus.ts` for the harness, and
 * `tests/lib/edgeGeometryCorpus.spec.ts` for what it is asserted for.
 *
 * **Why this file exists.** `lib/edgeGeometry.ts` rewrites the `d` of paths
 * Mermaid's dagre router generated. Every unit test in this repo used to run
 * against hand-written `d` strings, and the whole suite stayed green while the
 * canvas shipped a visibly broken arrowhead — because the fixtures were the
 * bug, not the tests. These are the paths the shipped configuration emits.
 *
 * **What is in here.** `CORPUS_NODES` is every `g.node` the capture rendered
 * (its centre, and the box Mermaid sized from the *label* — which is what its
 * router measured, and which is smaller than the card the overlay paints).
 * `CORPUS_EDGES` is every `path.flowchart-link` it emitted, with the
 * `measured` block the harness computed on that exact path: the arrowhead
 * **tip** to card-border distance before and after re-anchoring, the largest
 * interior-point displacement, and the largest interior turn angle in
 * Mermaid's own output / the pre-fix output / the current output.
 *
 * `measured.maxTurnAngleOld` is the regression in one number: on every
 * `curveBasis` edge — the only curve `useMermaidRender` configures — the
 * pre-fix, index-based implementation folded the path back on itself, turning
 * dagre's 0.00° straight lead-in into 180.00°.
 *
 * `measured.reversals*` is the second regression, and the one that
 * `maxTurnAngle*` cannot see: a run-translating rewrite that keeps every
 * join tangent still wobbles, because a control point ends up on the
 * wrong side of its partner. On the 33 `curveBasis` paths — the only
 * curve the plugin ships — Mermaid's own output and the current
 * implementation both score **0** reversals, and the run-translating
 * implementation that this one replaces scores **2** on 6 of them and
 * **4** on 15 more, leaving 12 clean. (That split is for the 63 px card;
 * the 88.2 px capture it replaced read 14 / 1 / 18. The counts move
 * because the endpoints have less to travel — the mechanism and the
 * assertion are unchanged. `edgeGeometryCorpus.spec.ts` pins both
 * numbers.) See `pathMetrics.ts → waviness` for why reversal
 * count and not turn-per-window.
 *
 * Ten graphs × four Mermaid `flowchart.curve` settings. `basis` is what the
 * plugin ships; the other three are rendered by the *same* dagre router and the
 * *same* node boxes, with only the shape function d3 hands the points to
 * differing, so they are genuine Mermaid output and they are what widens the
 * corpus past the one command sequence `curveBasis` happens to produce.
 */

export interface CorpusPoint {
    x: number
    y: number
}

export interface CorpusNode {
    /** Which capture graph this node came from. Node ids repeat across graphs. */
    graph: string
    /** The wire agent id, as it appears in the Mermaid node id `flowchart-n<id>-<i>`. */
    id: number
    /** The node's own `transform="translate(cx, cy)"` — its centre in SVG user space. */
    centre: CorpusPoint
    /** The `g.node rect` Mermaid sized from the label, before `useMermaidRender` grew it. */
    labelBox: { x: number; y: number; width: number; height: number }
}

export interface CorpusEdge {
    graph: string
    /** The Mermaid `flowchart.curve` this graph was rendered with. */
    curve: string
    /** The edge path's own DOM id, e.g. `L-n11-n12-0`. */
    id: string
    source: number
    target: number
    /** The `d` Mermaid emitted, verbatim. */
    d: string
    /** `marker-end` with the capture's render counter stripped. Always `…pointEnd`. */
    markerEnd: string
    /** Always null: Mermaid only ever writes `marker-end` for `-->` edges. */
    markerStart: string | null
    measured: {
        /** Distance from the arrowhead **tip** to the target card border. */
        tipToBorderOld: number
        tipToBorderNew: number
        /** Distance from the path start to the source card border. */
        startToBorderOld: number
        startToBorderNew: number
        /** Largest displacement of any *interior* point of the path. */
        maxInteriorShiftOld: number
        maxInteriorShiftNew: number
        /** Did re-anchoring have to shorten the first curve's head handle? */
        headHandleClamped: boolean
        /** Did re-anchoring have to shorten the last curve's tail handle? */
        tailHandleClamped: boolean
        /** Does re-anchoring the rewritten path leave it byte-identical? */
        idempotentNew: boolean
        /**
         * Largest turn Chrome's own path geometry shows over a window
         * 4 % of the path's own length. 0 = straight, 180 = folded back.
         * Re-anchoring makes these paths roughly half as long as Mermaid
         * drew them — most of the original ran *inside* the cards, where
         * the overlay hides it — so the visible path is shorter and its
         * curvature is necessarily higher. Read this as "how sharply the
         * ink turns", not as a kink detector;
         * `renderedSelfIntersects*` is the kink detector.
         */
        renderedWindowTurnMermaid: number
        renderedWindowTurnOld: number
        renderedWindowTurnNew: number
        /**
         * The tangent's **reversals** on the rendered path — the repo's
         * definition of "wavy", and the only curvature measure here that
         * is not confounded by the re-anchored path being about half as
         * long as the one Mermaid drew. `reversals*` is the count (0 = the
         * curve turns one way the whole way along, which is what "smooth"
         * means to an eye) and `reversalTurn*` is the total angle those
         * reversals account for. See `pathMetrics.ts → waviness`.
         */
        reversalsMermaid: number
        reversalTurnMermaid: number
        reversalsOld: number
        reversalTurnOld: number
        /** …and for the run-translating implementation this one replaces. */
        reversalsRuns: number
        reversalTurnRuns: number
        reversalsNew: number
        reversalTurnNew: number
        /** Does the rendered path cross itself? A fold always does. */
        renderedSelfIntersectsMermaid: boolean
        renderedSelfIntersectsOld: boolean
        renderedSelfIntersectsNew: boolean
        /** Largest interior turn angle, in degrees. 0 = straight, 180 = folded back. */
        maxTurnAngleMermaid: number
        maxTurnAngleOld: number
        maxTurnAngleNew: number
    }
}

export const CAPTURED_WITH = {
    mermaidVersion: "10.9.8",
    browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.7778.96 Safari/537.36",
    curves: ["basis","linear","bumpX","step"],
    nodeCard: {
        NODE_CARD_WIDTH: 240,
        NODE_CARD_HEIGHT: 63,
        NODE_CARD_BORDER: 1.5,
        NODE_CARD_PADDING_BLOCK: 8,
        NODE_CARD_ROW_GAP: 3,
        NODE_CARD_AVATAR_SIZE: 44,
        NODE_CARD_ROW2_HEIGHT: 19.2,
    },
    arrowheadOvershoot: 4.8,
}

/** What each capture graph was for, copied from the capture harness. */
export const GRAPH_NOTES: Record<string, string> = {
    "two-node-chain": "one source, one target: the smallest graph the endpoint can return",
    "three-chain": "a single rank-spanning edge, centred on both nodes",
    "diamond": "two sources converging on one target — the shortest diagonal fan",
    "wide-fan": "one source with five targets: the sub-agent shape this plugin exists for",
    "deep-chain": "five ranks: the longest curve dagre emits through this plugin",
    "team-7": "the real 7-agent team graph the operator opens, with mixed fan + chain edges",
    "long-names": "agent names far wider than the card, so Mermaid's label box is *larger* than the card box",
    "two-pairs": "two independent two-node chains: gives the corpus more than one purely vertical edge",
    "two-ranks-apart": "an edge that skips a rank, so dagre routes it through an intermediate dummy node",
    "short-names": "two-to-three character agent names: the narrowest label box Mermaid can measure, which is the case where the start endpoint has to travel furthest and the head handle has the least room before it would loop",
}

export const CORPUS_NODES: CorpusNode[] = [
    { graph: "two-node-chain", id: 1, centre: { x: 67.90625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "two-node-chain", id: 2, centre: { x: 67.90625, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "three-chain", id: 1, centre: { x: 67.90625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "three-chain", id: 2, centre: { x: 67.90625, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "three-chain", id: 3, centre: { x: 67.90625, y: 271 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "diamond", id: 1, centre: { x: 255.9296875, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "diamond", id: 2, centre: { x: 65.171875, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "diamond", id: 3, centre: { x: 446.6875, y: 146 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "diamond", id: 4, centre: { x: 255.9296875, y: 271 }, labelBox: { x: -73.328125, y: -21, width: 146.65625, height: 42 } },
    { graph: "wide-fan", id: 1, centre: { x: 835.5703125, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "wide-fan", id: 2, centre: { x: 65.171875, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "wide-fan", id: 3, centre: { x: 446.6875, y: 146 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "wide-fan", id: 4, centre: { x: 835.5703125, y: 146 }, labelBox: { x: -72.5390625, y: -21, width: 145.078125, height: 42 } },
    { graph: "wide-fan", id: 5, centre: { x: 1272.2109375, y: 146 }, labelBox: { x: -104.1015625, y: -21, width: 208.203125, height: 42 } },
    { graph: "wide-fan", id: 6, centre: { x: 1717.125, y: 146 }, labelBox: { x: -80.8125, y: -21, width: 161.625, height: 42 } },
    { graph: "deep-chain", id: 11, centre: { x: 94.59375, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "deep-chain", id: 12, centre: { x: 94.59375, y: 146 }, labelBox: { x: -82.6484375, y: -21, width: 165.296875, height: 42 } },
    { graph: "deep-chain", id: 13, centre: { x: 94.59375, y: 271 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "deep-chain", id: 14, centre: { x: 94.59375, y: 396 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "deep-chain", id: 15, centre: { x: 94.59375, y: 521 }, labelBox: { x: -94.59375, y: -21, width: 189.1875, height: 42 } },
    { graph: "team-7", id: 11, centre: { x: 641.12890625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "team-7", id: 12, centre: { x: 65.171875, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "team-7", id: 13, centre: { x: 446.6875, y: 146 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "team-7", id: 14, centre: { x: 835.5703125, y: 146 }, labelBox: { x: -72.5390625, y: -21, width: 145.078125, height: 42 } },
    { graph: "team-7", id: 16, centre: { x: 1250.7578125, y: 146 }, labelBox: { x: -82.6484375, y: -21, width: 165.296875, height: 42 } },
    { graph: "team-7", id: 15, centre: { x: 255.9296875, y: 271 }, labelBox: { x: -73.328125, y: -21, width: 146.65625, height: 42 } },
    { graph: "team-7", id: 17, centre: { x: 1250.7578125, y: 271 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "long-names", id: 1, centre: { x: 197.5078125, y: 21 }, labelBox: { x: -197.5078125, y: -21, width: 395.015625, height: 42 } },
    { graph: "long-names", id: 2, centre: { x: 354.35546875, y: 146 }, labelBox: { x: -173.6953125, y: -21, width: 347.390625, height: 42 } },
    { graph: "long-names", id: 3, centre: { x: 197.5078125, y: 271 }, labelBox: { x: -176.9765625, y: -21, width: 353.953125, height: 42 } },
    { graph: "two-pairs", id: 1, centre: { x: 67.90625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "two-pairs", id: 2, centre: { x: 67.90625, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "two-pairs", id: 3, centre: { x: 470.46875, y: 21 }, labelBox: { x: -74.65625, y: -21, width: 149.3125, height: 42 } },
    { graph: "two-pairs", id: 4, centre: { x: 470.46875, y: 146 }, labelBox: { x: -77.34375, y: -21, width: 154.6875, height: 42 } },
    { graph: "two-ranks-apart", id: 1, centre: { x: 244.08984375, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "two-ranks-apart", id: 4, centre: { x: 54.3359375, y: 146 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "two-ranks-apart", id: 2, centre: { x: 433.84375, y: 146 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "short-names", id: 1, centre: { x: 182.046875, y: 21 }, labelBox: { x: -19.21875, y: -21, width: 38.4375, height: 42 } },
    { graph: "short-names", id: 2, centre: { x: 26.7734375, y: 146 }, labelBox: { x: -22.9765625, y: -21, width: 45.953125, height: 42 } },
    { graph: "short-names", id: 3, centre: { x: 337.3203125, y: 146 }, labelBox: { x: -27.5703125, y: -21, width: 55.140625, height: 42 } },
    { graph: "short-names", id: 4, centre: { x: 26.7734375, y: 271 }, labelBox: { x: -26.7734375, y: -21, width: 53.546875, height: 42 } },
]

export const CORPUS_EDGES: CorpusEdge[] = [
    { graph: "two-node-chain", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,48.917C67.906,55.833,67.906,69.667,67.906,82.617C67.906,95.567,67.906,107.633,67.906,113.667L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "three-chain", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,48.917C67.906,55.833,67.906,69.667,67.906,82.617C67.906,95.567,67.906,107.633,67.906,113.667L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "three-chain", curve: "basis", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,167L67.906,173.917C67.906,180.833,67.906,194.667,67.906,207.617C67.906,220.567,67.906,232.633,67.906,238.667L67.906,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "diamond", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M191.835,42L170.725,48.917C149.614,55.833,107.393,69.667,86.282,82.617C65.172,95.567,65.172,107.633,65.172,113.667L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.0179413695586845e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.723288822414695, maxInteriorShiftNew: 28.103436255239114, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.31, renderedWindowTurnOld: 179.34, renderedWindowTurnNew: 7.62, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 87.19, reversalsRuns: 4, reversalTurnRuns: 181.932, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003254017233254483, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121671852685963 } },
    { graph: "diamond", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M320.024,42L341.135,48.917C362.245,55.833,404.466,69.667,425.577,82.617C446.688,95.567,446.688,107.633,446.688,113.667L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.881784197001252e-10, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.723288822414716, maxInteriorShiftNew: 28.10241658820642, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.31, renderedWindowTurnOld: 179.34, renderedWindowTurnNew: 7.62, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 87.048, reversalsRuns: 4, reversalTurnRuns: 181.706, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001647965199508555, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121672412463587 } },
    { graph: "diamond", curve: "basis", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,167L65.172,173.917C65.172,180.833,65.172,194.667,85.443,208.225C105.714,221.783,146.256,235.067,166.527,241.708L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004827401016029853, tipToBorderNew: 2.1982936004860676e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866921, maxInteriorShiftNew: 27.685925908224643, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.81, renderedWindowTurnOld: 179.87, renderedWindowTurnNew: 5.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 192.715, reversalsRuns: 4, reversalTurnRuns: 198.283, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0017161918168938143, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000003447348119309004 } },
    { graph: "diamond", curve: "basis", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,167L446.688,173.917C446.688,180.833,446.688,194.667,426.416,208.225C406.145,221.783,365.603,235.067,345.332,241.708L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004161610669939364, tipToBorderNew: 6.184733365444117e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866921, maxInteriorShiftNew: 27.68699019134823, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.82, renderedWindowTurnOld: 179.87, renderedWindowTurnNew: 5.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 192.709, reversalsRuns: 4, reversalTurnRuns: 198.255, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0025524925996927967, maxTurnAngleOld: 180, maxTurnAngleNew: 0.0000023178614367743517 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,26.509L650.582,36.008C533.5,45.506,299.336,64.503,182.254,80.035C65.172,95.567,65.172,107.633,65.172,113.667L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.0179413695586845e-12, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.26513093832248, maxInteriorShiftNew: 43.553994245892476, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 25.33, renderedWindowTurnOld: 3.7, renderedWindowTurnNew: 44.14, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 19.957, reversalsRuns: 2, reversalTurnRuns: 32.434, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0004861648139142403, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121431453640918 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,31.914L714.168,40.511C660.672,49.109,553.68,66.305,500.184,80.936C446.688,95.567,446.688,107.633,446.688,113.667L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.467004378559068e-11, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.76260005913284, maxInteriorShiftNew: 43.96865171812038, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 25.87, renderedWindowTurnOld: 54.75, renderedWindowTurnNew: 31.2, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 99.855, reversalsRuns: 2, reversalTurnRuns: 89.318, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001044062499279471, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000001246338544032094 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,48.917C835.57,55.833,835.57,69.667,835.57,82.617C835.57,95.567,835.57,107.633,835.57,113.667L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.057554623519536e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000965728, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0.00001312167018607531 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,30.72L964.932,39.517C1026.388,48.313,1149.299,65.907,1210.755,80.737C1272.211,95.567,1272.211,107.633,1272.211,113.667L1272.211,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.525340268126456e-10, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.624020161899416, maxInteriorShiftNew: 43.8541040031828, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 31.37, renderedWindowTurnOld: 23.42, renderedWindowTurnNew: 34.8, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 75.738, reversalsRuns: 2, reversalTurnRuns: 95.972, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0010443641020960626, maxTurnAngleOld: 180, maxTurnAngleNew: 7.996540640902195e-7 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,25.814L1039.085,35.429C1174.693,45.043,1445.909,64.271,1581.517,79.919C1717.125,95.567,1717.125,107.633,1717.125,113.667L1717.125,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.223738835897294, maxInteriorShiftNew: 43.51999330696727, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 19.63, renderedWindowTurnOld: 4.44, renderedWindowTurnNew: 11.57, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 101.911, reversalsRuns: 2, reversalTurnRuns: 96.484, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0004203971110033727, maxTurnAngleOld: 180, maxTurnAngleNew: 4.4915396675972874e-7 } },
    { graph: "deep-chain", curve: "basis", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,48.917C94.594,55.833,94.594,69.667,94.594,82.617C94.594,95.567,94.594,107.633,94.594,113.667L94.594,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "deep-chain", curve: "basis", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,167L94.594,173.917C94.594,180.833,94.594,194.667,94.594,207.617C94.594,220.567,94.594,232.633,94.594,238.667L94.594,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "deep-chain", curve: "basis", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,292L94.594,298.917C94.594,305.833,94.594,319.667,94.594,332.617C94.594,345.567,94.594,357.633,94.594,363.667L94.594,369.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.195932655828074e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618091, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "deep-chain", curve: "basis", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,417L94.594,423.917C94.594,430.833,94.594,444.667,94.594,457.617C94.594,470.567,94.594,482.633,94.594,488.667L94.594,494.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.195932655828074e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618091, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,28.369L488.548,37.557C403.872,46.746,234.522,65.123,149.847,80.345C65.172,95.567,65.172,107.633,65.172,113.667L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.0179413695586845e-12, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 52.39982103977073, maxInteriorShiftNew: 43.66683571127956, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 35.13, renderedWindowTurnOld: 8.77, renderedWindowTurnNew: 28.92, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 23.306, reversalsRuns: 2, reversalTurnRuns: 16.845, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0005962043849785279, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121431453640918 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M575.797,42L554.278,48.917C532.76,55.833,489.724,69.667,468.206,82.617C446.688,95.567,446.688,107.633,446.688,113.667L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.467004378559068e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 34.312061377888725, maxInteriorShiftNew: 28.592502575296358, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.53, renderedWindowTurnOld: 179.55, renderedWindowTurnNew: 7.83, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 53.178, reversalsRuns: 4, reversalTurnRuns: 77.675, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0016376188661821817, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000003230718542566184 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M706.461,42L727.979,48.917C749.498,55.833,792.534,69.667,814.052,82.617C835.57,95.567,835.57,107.633,835.57,113.667L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.057554623519536e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 34.312061377888625, maxInteriorShiftNew: 28.593528860780214, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.52, renderedWindowTurnOld: 179.55, renderedWindowTurnNew: 7.84, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 53.118, reversalsRuns: 4, reversalTurnRuns: 77.69, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003188994139412945, maxTurnAngleOld: 180, maxTurnAngleNew: 0.00001312167018607531 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,27.962L799.322,37.218C889.609,46.475,1070.184,64.987,1160.471,80.277C1250.758,95.567,1250.758,107.633,1250.758,113.667L1250.758,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 5.317843942975742e-10, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 52.36708047046355, maxInteriorShiftNew: 43.63942827862803, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 33.97, renderedWindowTurnOld: 42.03, renderedWindowTurnNew: 47.21, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 100.827, reversalsRuns: 2, reversalTurnRuns: 92.853, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0006279952707981541, maxTurnAngleOld: 180, maxTurnAngleNew: 5.784779464510636e-7 } },
    { graph: "team-7", curve: "basis", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,167L65.172,173.917C65.172,180.833,65.172,194.667,85.443,208.225C105.714,221.783,146.256,235.067,166.527,241.708L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004827401016029853, tipToBorderNew: 2.1982936004860676e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866921, maxInteriorShiftNew: 27.685925908224643, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.81, renderedWindowTurnOld: 179.87, renderedWindowTurnNew: 5.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 192.715, reversalsRuns: 4, reversalTurnRuns: 198.283, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0017161918168938143, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000003447348119309004 } },
    { graph: "team-7", curve: "basis", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,167L446.688,173.917C446.688,180.833,446.688,194.667,426.416,208.225C406.145,221.783,365.603,235.067,345.332,241.708L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004161610669939364, tipToBorderNew: 6.184733365444117e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866921, maxInteriorShiftNew: 27.68699019134823, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.82, renderedWindowTurnOld: 179.87, renderedWindowTurnNew: 5.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 192.709, reversalsRuns: 4, reversalTurnRuns: 198.255, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0025524925996927967, maxTurnAngleOld: 180, maxTurnAngleNew: 0.0000023178614367743517 } },
    { graph: "team-7", curve: "basis", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,167L1250.758,173.917C1250.758,180.833,1250.758,194.667,1250.758,207.617C1250.758,220.567,1250.758,232.633,1250.758,238.667L1250.758,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 3.154809746774845e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000347659, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000011089179616207592 } },
    { graph: "long-names", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M250.209,42L267.566,48.917C284.924,55.833,319.64,69.667,336.998,82.617C354.355,95.567,354.355,107.633,354.355,113.667L354.355,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.881784197001252e-10, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 28.36591618474538, maxInteriorShiftNew: 23.63858378723171, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.49, renderedWindowTurnOld: 179.8, renderedWindowTurnNew: 5.73, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 69.912, reversalsRuns: 4, reversalTurnRuns: 93.128, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003983715199205635, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121670923963996 } },
    { graph: "long-names", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M144.807,42L127.449,48.917C110.091,55.833,75.376,69.667,58.018,87C40.66,104.333,40.66,125.167,40.66,146C40.66,166.833,40.66,187.667,57.197,204.673C73.735,221.679,106.809,234.859,123.346,241.448L139.883,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.00009090201697858902, tipToBorderNew: 1.0168531616727705e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 28.36498722016281, maxInteriorShiftNew: 23.63744845242339, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 6.99, renderedWindowTurnOld: 5.97, renderedWindowTurnNew: 6.77, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 190.361, reversalsRuns: 4, reversalTurnRuns: 238.122, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002989960891457888, maxTurnAngleOld: 179.99777671895845, maxTurnAngleNew: 0.0000038134094930955252 } },
    { graph: "long-names", curve: "basis", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,167L354.355,173.917C354.355,180.833,354.355,194.667,337.818,208.173C321.281,221.679,288.207,234.859,271.669,241.448L255.132,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.00009090201695016731, tipToBorderNew: 4.4804616550209175e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 27.864537498404662, maxInteriorShiftNew: 23.220831649308035, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.41, renderedWindowTurnOld: 179.71, renderedWindowTurnNew: 4.36, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 190.948, reversalsRuns: 4, reversalTurnRuns: 195.416, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.004181243100779105, maxTurnAngleOld: 180, maxTurnAngleNew: 0.0000027996639460302348 } },
    { graph: "two-pairs", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,48.917C67.906,55.833,67.906,69.667,67.906,82.617C67.906,95.567,67.906,107.633,67.906,113.667L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "two-pairs", curve: "basis", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,48.917C470.469,55.833,470.469,69.667,470.469,82.617C470.469,95.567,470.469,107.633,470.469,113.667L470.469,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833000618063, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 4.507482094570096e-11 } },
    { graph: "two-ranks-apart", curve: "basis", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M180.333,42L159.333,48.917C138.334,55.833,96.335,69.667,75.335,82.617C54.336,95.567,54.336,107.633,54.336,113.667L54.336,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.2789769243681803e-13, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.562730580213525, maxInteriorShiftNew: 27.968749334029813, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.25, renderedWindowTurnOld: 179.29, renderedWindowTurnNew: 7.57, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 192.012, reversalsRuns: 4, reversalTurnRuns: 215.537, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001650712861624085, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000013121671585519369 } },
    { graph: "two-ranks-apart", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M307.847,42L328.847,48.917C349.846,55.833,391.845,69.667,412.844,82.617C433.844,95.567,433.844,107.633,433.844,113.667L433.844,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 6.16751094639767e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.56368038520212, maxInteriorShiftNew: 27.968872808681713, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.26, renderedWindowTurnOld: 179.29, renderedWindowTurnNew: 7.57, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 191.626, reversalsRuns: 4, reversalTurnRuns: 215.497, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0016507128616527098, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000004380426075390888 } },
    { graph: "short-names", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,28.736L140.152,37.863C117.477,46.991,72.125,65.245,49.449,80.406C26.773,95.567,26.773,107.633,26.773,113.667L26.773,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.8118839761882555e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.641284870750354, maxInteriorShiftNew: 53.03431219745276, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.84, renderedWindowTurnOld: 179.99, renderedWindowTurnNew: 5.64, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 51.672, reversalsRuns: 4, reversalTurnRuns: 56.506, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0030497230551593804, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000003841279675991692 } },
    { graph: "short-names", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,28.736L223.941,37.863C246.617,46.991,291.969,65.245,314.645,80.406C337.32,95.567,337.32,107.633,337.32,113.667L337.32,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 7.855334160922212e-10, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.64221254010582, maxInteriorShiftNew: 53.03575564810237, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 7.84, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.64, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 51.708, reversalsRuns: 4, reversalTurnRuns: 56.436, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.0012991745427657138, maxTurnAngleOld: 180, maxTurnAngleNew: 0.0000038413252915069335 } },
    { graph: "short-names", curve: "basis", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,167L26.773,173.917C26.773,180.833,26.773,194.667,26.773,207.617C26.773,220.567,26.773,232.633,26.773,238.667L26.773,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.8133050616597757e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 8.749833001892831, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0.000011089226026861505 } },
    { graph: "two-node-chain", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,83.5L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "three-chain", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,83.5L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "three-chain", curve: "linear", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,167L67.906,208.5L67.906,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.412825991399586e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "diamond", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M191.835,42L65.172,83.5L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.1884716261411086e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 60.87, renderedWindowTurnOld: 71.64, renderedWindowTurnNew: 67.03, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85907945107867, maxTurnAngleOld: 77.48606858182951, maxTurnAngleNew: 71.85911997871908 } },
    { graph: "diamond", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M320.024,42L446.688,83.5L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 3.426237071835203e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 60.87, renderedWindowTurnOld: 71.65, renderedWindowTurnNew: 67.03, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85921329039384, maxTurnAngleOld: 77.4861966745835, maxTurnAngleNew: 71.85906166359881 } },
    { graph: "diamond", curve: "linear", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,167L65.172,208.5L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004949927055406533, tipToBorderNew: 9.4736870437373e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866923, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 56.38, renderedWindowTurnOld: 122.27, renderedWindowTurnNew: 61.12, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85907928314857, maxTurnAngleOld: 128.66643962570146, maxTurnAngleNew: 71.85918206645165 } },
    { graph: "diamond", curve: "linear", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,167L446.688,208.5L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004949927055406533, tipToBorderNew: 0.000004604156515597424, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.224589598669276, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 56.38, renderedWindowTurnOld: 122.27, renderedWindowTurnNew: 61.13, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85907928314857, maxTurnAngleOld: 128.66643962570146, maxTurnAngleNew: 71.85855947929997 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,26.509L65.172,83.5L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.1884716261411086e-12, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.91, renderedWindowTurnOld: 77.78, renderedWindowTurnNew: 81.1, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 85.36192835493819, maxTurnAngleOld: 86.23810027803572, maxTurnAngleNew: 85.36198106025012 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,31.914L446.688,83.5L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 3.426237071835203e-11, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 80.31, renderedWindowTurnOld: 76.3, renderedWindowTurnNew: 73.92, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 80.86972408326692, maxTurnAngleOld: 82.95834602945372, maxTurnAngleNew: 80.86999865412679 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,83.5L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.3443468560581096e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00042391258123041154 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,30.72L1272.211,83.5L1272.211,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.973799150320701e-13, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 77.56, renderedWindowTurnOld: 77.31, renderedWindowTurnNew: 67.26, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 81.85410492379532, maxTurnAngleOld: 83.63466643808981, maxTurnAngleNew: 81.85407119691477 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,25.814L1717.125,83.5L1717.125,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 77.94, renderedWindowTurnOld: 69.95, renderedWindowTurnNew: 75.41, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 85.9446306633903, maxTurnAngleOld: 86.69385006687872, maxTurnAngleNew: 85.94460501019815 } },
    { graph: "deep-chain", curve: "linear", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,83.5L94.594,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "deep-chain", curve: "linear", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,167L94.594,208.5L94.594,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.412825991399586e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "deep-chain", curve: "linear", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,292L94.594,333.5L94.594,369.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.412825991399586e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "deep-chain", curve: "linear", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,417L94.594,458.5L94.594,494.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.412825991399586e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,28.369L65.172,83.5L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.1884716261411086e-12, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 70.8, renderedWindowTurnOld: 74.1, renderedWindowTurnNew: 70.05, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 83.80679923688255, maxTurnAngleOld: 85.05151614742095, maxTurnAngleNew: 83.80687405427803 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M575.797,42L446.688,83.5L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 3.426237071835203e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 70.25, renderedWindowTurnOld: 72.76, renderedWindowTurnNew: 57.89, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 72.18083814938143, maxTurnAngleOld: 77.71586616614721, maxTurnAngleNew: 72.18108572142394 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M706.461,42L835.57,83.5L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.3443468560581096e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 70.25, renderedWindowTurnOld: 72.76, renderedWindowTurnNew: 57.89, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 72.18083814938143, maxTurnAngleOld: 77.71586616614722, maxTurnAngleNew: 72.18098853821346 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,27.962L1250.758,83.5L1250.758,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.789058039023075e-12, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 76.77, renderedWindowTurnOld: 81.14, renderedWindowTurnNew: 82.57, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 84.14642860422869, maxTurnAngleOld: 85.30672199616384, maxTurnAngleNew: 84.14636518725472 } },
    { graph: "team-7", curve: "linear", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,167L65.172,208.5L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004949927055406533, tipToBorderNew: 9.4736870437373e-7, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.22458959866923, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 56.38, renderedWindowTurnOld: 122.27, renderedWindowTurnNew: 61.12, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85907928314857, maxTurnAngleOld: 128.66643962570146, maxTurnAngleNew: 71.85918206645165 } },
    { graph: "team-7", curve: "linear", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,167L446.688,208.5L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.0004949927055406533, tipToBorderNew: 0.000004604156515597424, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.224589598669276, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 56.38, renderedWindowTurnOld: 122.27, renderedWindowTurnNew: 61.13, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.85907928314857, maxTurnAngleOld: 128.66643962570146, maxTurnAngleNew: 71.85855947929997 } },
    { graph: "team-7", curve: "linear", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,167L1250.758,208.5L1250.758,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.803268893738277e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00025464947661865884 } },
    { graph: "long-names", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M250.209,42L354.355,83.5L354.355,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 3.0240698833949864e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 55.99, renderedWindowTurnOld: 74.85, renderedWindowTurnNew: 63.51, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.27375363514847, maxTurnAngleOld: 74.89361693869661, maxTurnAngleNew: 68.27385539707943 } },
    { graph: "long-names", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M144.807,42L40.66,83.5L40.66,146L40.66,208.5L139.883,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.00018391850500165674, tipToBorderNew: 0.000002318605538675911, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 28.36498722016281, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 66.74, renderedWindowTurnOld: 89.64, renderedWindowTurnNew: 65.26, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 26.909, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.27394281673666, maxTurnAngleOld: 95.14667838293849, maxTurnAngleNew: 68.27395289209394 } },
    { graph: "long-names", curve: "linear", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,167L354.355,208.5L255.132,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.00018391850500165674, tipToBorderNew: 0.0000025529864728923712, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 27.865466459400928, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 67.79, renderedWindowTurnOld: 109.18, renderedWindowTurnNew: 62.74, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.27389694989158, maxTurnAngleOld: 119.64622423356413, maxTurnAngleNew: 68.27436329208894 } },
    { graph: "two-pairs", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,83.5L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "two-pairs", curve: "linear", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,83.5L470.469,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.00033818759789406384 } },
    { graph: "two-ranks-apart", curve: "linear", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M180.333,42L54.336,83.5L54.336,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.973799150320701e-13, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 58, renderedWindowTurnOld: 68.24, renderedWindowTurnNew: 69.28, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.76951663124315, maxTurnAngleOld: 77.42208555662977, maxTurnAngleNew: 71.7696038386976 } },
    { graph: "two-ranks-apart", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M307.847,42L433.844,83.5L433.844,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 8.384404281969182e-12, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 58, renderedWindowTurnOld: 68.23, renderedWindowTurnNew: 69.28, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 71.76951663124315, maxTurnAngleOld: 77.42195616921356, maxTurnAngleNew: 71.76944222196337 } },
    { graph: "short-names", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,28.736L26.773,83.5L26.773,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.646061147970613e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 62.31, renderedWindowTurnOld: 68.83, renderedWindowTurnNew: 67.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.07453979482852, maxTurnAngleOld: 74.74809171936325, maxTurnAngleNew: 68.0746241959928 } },
    { graph: "short-names", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,28.736L337.32,83.5L337.32,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.3443468560581096e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 62.31, renderedWindowTurnOld: 68.81, renderedWindowTurnNew: 67.76, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.07439392047472, maxTurnAngleOld: 74.74771409107953, maxTurnAngleNew: 68.07449468934125 } },
    { graph: "short-names", curve: "linear", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,167L26.773,208.5L26.773,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 2.6489033189136535e-11, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.0005950239362683321 } },
    { graph: "two-node-chain", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,83.5,67.906,83.5C67.906,83.5,67.906,119.7,67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,83.5,67.906,83.5C67.906,83.5,67.906,119.7,67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "bumpX", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,167C67.906,167,67.906,208.5,67.906,208.5C67.906,208.5,67.906,244.7,67.906,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M191.835,42C128.503,42,128.503,83.5,65.172,83.5C65.172,83.5,65.172,119.7,65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.72328882241468, maxInteriorShiftNew: 16.023541999999992, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.71, renderedWindowTurnOld: 85.07, renderedWindowTurnNew: 81.5, reversalsMermaid: 2, reversalTurnMermaid: 8.683, reversalsOld: 2, reversalTurnOld: 2.187, reversalsRuns: 2, reversalTurnRuns: 22.578, reversalsNew: 2, reversalTurnNew: 22.593, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "diamond", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M320.024,42C383.356,42,383.356,83.5,446.688,83.5C446.688,83.5,446.688,119.7,446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.723288822414716, maxInteriorShiftNew: 16.023595999999998, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.7, renderedWindowTurnOld: 85.07, renderedWindowTurnNew: 81.51, reversalsMermaid: 2, reversalTurnMermaid: 8.65, reversalsOld: 2, reversalTurnOld: 2.172, reversalsRuns: 2, reversalTurnRuns: 22.516, reversalsNew: 2, reversalTurnNew: 22.523, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,167C65.172,167,65.172,208.5,65.172,208.5C125.985,208.5,125.985,248.35,186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.4009220110016543, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.01911902216653, maxInteriorShiftNew: 15.667286000000004, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 84.66, renderedWindowTurnOld: 87.33, renderedWindowTurnNew: 85.96, reversalsMermaid: 2, reversalTurnMermaid: 0.661, reversalsOld: 2, reversalTurnOld: 0.602, reversalsRuns: 2, reversalTurnRuns: 0.961, reversalsNew: 2, reversalTurnNew: 0.961, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,167C446.688,167,446.688,208.5,446.688,208.5C385.874,208.5,385.874,248.35,325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.400976983756351, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.020082434785, maxInteriorShiftNew: 15.667652999999973, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 84.65, renderedWindowTurnOld: 87.33, renderedWindowTurnNew: 85.95, reversalsMermaid: 2, reversalTurnMermaid: 0.653, reversalsOld: 2, reversalTurnOld: 0.61, reversalsRuns: 2, reversalTurnRuns: 0.96, reversalsNew: 2, reversalTurnNew: 0.961, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,26.509C416.418,26.509,416.418,83.5,65.172,83.5C65.172,83.5,65.172,119.7,65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.26513093832253, maxInteriorShiftNew: 26.046843000000024, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.16, renderedWindowTurnOld: 72.68, renderedWindowTurnNew: 72.66, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,31.914C607.176,31.914,607.176,83.5,446.688,83.5C446.688,83.5,446.688,119.7,446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.76260005913284, maxInteriorShiftNew: 26.046866000000023, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 88.92, renderedWindowTurnOld: 85.16, renderedWindowTurnNew: 84.69, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 23.323, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42C835.57,42,835.57,83.5,835.57,83.5C835.57,83.5,835.57,119.7,835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000001158856, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,30.72C1087.844,30.72,1087.844,83.5,1272.211,83.5C1272.211,83.5,1272.211,119.7,1272.211,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.6240201618993, maxInteriorShiftNew: 26.04665299999988, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 84.2, renderedWindowTurnOld: 83.06, renderedWindowTurnNew: 83.15, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 9.714, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,25.814C1310.301,25.814,1310.301,83.5,1717.125,83.5C1717.125,83.5,1717.125,119.7,1717.125,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 52.223738835897294, maxInteriorShiftNew: 26.046644000000015, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 81.94, renderedWindowTurnOld: 86.79, renderedWindowTurnNew: 86.78, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42C94.594,42,94.594,83.5,94.594,83.5C94.594,83.5,94.594,119.7,94.594,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,167C94.594,167,94.594,208.5,94.594,208.5C94.594,208.5,94.594,244.7,94.594,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,292C94.594,292,94.594,333.5,94.594,333.5C94.594,333.5,94.594,369.7,94.594,369.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,417C94.594,417,94.594,458.5,94.594,458.5C94.594,458.5,94.594,494.7,94.594,494.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,28.369C319.197,28.369,319.197,83.5,65.172,83.5C65.172,83.5,65.172,119.7,65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 52.39982103977073, maxInteriorShiftNew: 26.047004000000015, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 75.71, renderedWindowTurnOld: 79.36, renderedWindowTurnNew: 79.25, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M575.797,42C511.242,42,511.242,83.5,446.688,83.5C446.688,83.5,446.688,119.7,446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 34.312061377888675, maxInteriorShiftNew: 16.332858000000044, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 82.04, renderedWindowTurnOld: 85.16, renderedWindowTurnNew: 87.42, reversalsMermaid: 2, reversalTurnMermaid: 43.488, reversalsOld: 2, reversalTurnOld: 13.041, reversalsRuns: 2, reversalTurnRuns: 38.828, reversalsNew: 2, reversalTurnNew: 38.824, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M706.461,42C771.016,42,771.016,83.5,835.57,83.5C835.57,83.5,835.57,119.7,835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 34.312061377888725, maxInteriorShiftNew: 16.332900999999993, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 82.04, renderedWindowTurnOld: 85.16, renderedWindowTurnNew: 87.42, reversalsMermaid: 2, reversalTurnMermaid: 43.473, reversalsOld: 2, reversalTurnOld: 13.022, reversalsRuns: 2, reversalTurnRuns: 38.862, reversalsNew: 2, reversalTurnNew: 38.865, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,27.962C979.896,27.962,979.896,83.5,1250.758,83.5C1250.758,83.5,1250.758,119.7,1250.758,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 52.367080470463556, maxInteriorShiftNew: 26.047009000000003, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 82.78, renderedWindowTurnOld: 87.15, renderedWindowTurnNew: 87.15, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,167C65.172,167,65.172,208.5,65.172,208.5C125.985,208.5,125.985,248.35,186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.4009220110016543, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.01911902216653, maxInteriorShiftNew: 15.667286000000004, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 84.66, renderedWindowTurnOld: 87.33, renderedWindowTurnNew: 85.96, reversalsMermaid: 2, reversalTurnMermaid: 0.661, reversalsOld: 2, reversalTurnOld: 0.602, reversalsRuns: 2, reversalTurnRuns: 0.961, reversalsNew: 2, reversalTurnNew: 0.961, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,167C446.688,167,446.688,208.5,446.688,208.5C385.874,208.5,385.874,248.35,325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.400976983756351, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.020082434785, maxInteriorShiftNew: 15.667652999999973, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 84.65, renderedWindowTurnOld: 87.33, renderedWindowTurnNew: 85.95, reversalsMermaid: 2, reversalTurnMermaid: 0.653, reversalsOld: 2, reversalTurnOld: 0.61, reversalsRuns: 2, reversalTurnRuns: 0.96, reversalsNew: 2, reversalTurnNew: 0.961, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,167C1250.758,167,1250.758,208.5,1250.758,208.5C1250.758,208.5,1250.758,244.7,1250.758,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000420762, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M250.209,42C302.282,42,302.282,83.5,354.355,83.5C354.355,83.5,354.355,119.7,354.355,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 28.36591618474538, maxInteriorShiftNew: 13.175269000000014, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.91, renderedWindowTurnOld: 84.28, renderedWindowTurnNew: 80.11, reversalsMermaid: 2, reversalTurnMermaid: 3.274, reversalsOld: 2, reversalTurnOld: 20.007, reversalsRuns: 2, reversalTurnRuns: 43.906, reversalsNew: 2, reversalTurnNew: 43.885, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M144.807,42C92.734,42,92.734,83.5,40.66,83.5C40.66,83.5,40.66,146,40.66,146C40.66,146,40.66,208.5,40.66,208.5C90.272,208.5,90.272,248.038,139.883,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.6462627279570086, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 28.36498722016281, maxInteriorShiftNew: 13.175331999999997, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 84.52, renderedWindowTurnOld: 83.36, renderedWindowTurnNew: 85.13, reversalsMermaid: 4, reversalTurnMermaid: 4.084, reversalsOld: 4, reversalTurnOld: 20.83, reversalsRuns: 4, reversalTurnRuns: 44.86, reversalsNew: 4, reversalTurnNew: 44.888, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "long-names", curve: "bumpX", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,167C354.355,167,354.355,208.5,354.355,208.5C304.744,208.5,304.744,248.038,255.132,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.6461862003228873, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 27.581750723984126, maxInteriorShiftNew: 12.775021999999979, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 71.27, renderedWindowTurnOld: 85.48, renderedWindowTurnNew: 75.86, reversalsMermaid: 2, reversalTurnMermaid: 0.846, reversalsOld: 2, reversalTurnOld: 0.742, reversalsRuns: 2, reversalTurnRuns: 1.376, reversalsNew: 2, reversalTurnNew: 1.376, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "two-pairs", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,83.5,67.906,83.5C67.906,83.5,67.906,119.7,67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-pairs", curve: "bumpX", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42C470.469,42,470.469,83.5,470.469,83.5C470.469,83.5,470.469,119.7,470.469,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-ranks-apart", curve: "bumpX", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M180.333,42C117.334,42,117.334,83.5,54.336,83.5C54.336,83.5,54.336,119.7,54.336,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.562730580213525, maxInteriorShiftNew: 15.939101000000008, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.32, renderedWindowTurnOld: 82.32, renderedWindowTurnNew: 78.51, reversalsMermaid: 2, reversalTurnMermaid: 38.784, reversalsOld: 2, reversalTurnOld: 20.223, reversalsRuns: 2, reversalTurnRuns: 1.131, reversalsNew: 2, reversalTurnNew: 1.143, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "two-ranks-apart", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M307.847,42C370.845,42,370.845,83.5,433.844,83.5C433.844,83.5,433.844,119.7,433.844,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.56368038520206, maxInteriorShiftNew: 15.939423999999974, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.31, renderedWindowTurnOld: 82.31, renderedWindowTurnNew: 78.51, reversalsMermaid: 2, reversalTurnMermaid: 38.784, reversalsOld: 2, reversalTurnOld: 20.264, reversalsRuns: 2, reversalTurnRuns: 1.168, reversalsNew: 2, reversalTurnNew: 1.156, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,28.736C94.801,28.736,94.801,83.5,26.773,83.5C26.773,83.5,26.773,119.7,26.773,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.641284870750376, maxInteriorShiftNew: 63.64121065729658, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 75.07, renderedWindowTurnOld: 72.85, renderedWindowTurnNew: 83.43, reversalsMermaid: 2, reversalTurnMermaid: 25.99, reversalsOld: 2, reversalTurnOld: 24.031, reversalsRuns: 2, reversalTurnRuns: 22.323, reversalsNew: 2, reversalTurnNew: 22.321, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "short-names", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,28.736C269.293,28.736,269.293,83.5,337.32,83.5C337.32,83.5,337.32,119.7,337.32,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.642212540105795, maxInteriorShiftNew: 63.641922179361984, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 75.07, renderedWindowTurnOld: 72.86, renderedWindowTurnNew: 83.42, reversalsMermaid: 2, reversalTurnMermaid: 26.039, reversalsOld: 2, reversalTurnOld: 24.112, reversalsRuns: 2, reversalTurnRuns: 22.397, reversalsNew: 2, reversalTurnNew: 22.747, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "bumpX", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,167C26.773,167,26.773,208.5,26.773,208.5C26.773,208.5,26.773,244.7,26.773,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000002283857, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-node-chain", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,83.5L67.906,83.5L67.906,119.7L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00009056429668 } },
    { graph: "three-chain", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,83.5L67.906,83.5L67.906,119.7L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00009056429668 } },
    { graph: "three-chain", curve: "step", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,167L67.906,167L67.906,208.5L67.906,208.5L67.906,244.7L67.906,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00009056429668 } },
    { graph: "diamond", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M191.835,42L128.503,42L128.503,83.5L65.172,83.5L65.172,119.7L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.523212883697877, maxInteriorShiftNew: 5.200000000060099, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 89.71, renderedWindowTurnOld: 108.8, renderedWindowTurnNew: 91.48, reversalsMermaid: 2, reversalTurnMermaid: 40.981, reversalsOld: 2, reversalTurnOld: 19.125, reversalsRuns: 2, reversalTurnRuns: 23.707, reversalsNew: 2, reversalTurnNew: 23.732, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.36953687704319, maxTurnAngleNew: 108.55318375989785 } },
    { graph: "diamond", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M320.024,42L383.356,42L383.356,83.5L446.688,83.5L446.688,119.7L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.523212883697877, maxInteriorShiftNew: 5.200000000942406, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 89.71, renderedWindowTurnOld: 108.81, renderedWindowTurnNew: 91.48, reversalsMermaid: 2, reversalTurnMermaid: 40.926, reversalsOld: 2, reversalTurnOld: 19.093, reversalsRuns: 2, reversalTurnRuns: 23.675, reversalsNew: 2, reversalTurnNew: 23.687, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.3695368770432, maxTurnAngleNew: 108.55307990005744 } },
    { graph: "diamond", curve: "step", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,167L65.172,167L65.172,208.5L125.985,208.5L125.985,248.35L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.4009220110016543, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.099630461597553, maxInteriorShiftNew: 10.500000000183046, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 88.86, renderedWindowTurnOld: 105.14, renderedWindowTurnNew: 97.66, reversalsMermaid: 2, reversalTurnMermaid: 63.361, reversalsOld: 2, reversalTurnOld: 19.704, reversalsRuns: 2, reversalTurnRuns: 17.529, reversalsNew: 2, reversalTurnNew: 17.529, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 113.4530665532405, maxTurnAngleNew: 106.96926962754836 } },
    { graph: "diamond", curve: "step", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,167L446.688,167L446.688,208.5L385.874,208.5L385.874,248.35L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.400976983756351, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.100465831770197, maxInteriorShiftNew: 10.50000000297619, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 88.85, renderedWindowTurnOld: 105.17, renderedWindowTurnNew: 97.64, reversalsMermaid: 2, reversalTurnMermaid: 63.254, reversalsOld: 2, reversalTurnOld: 19.603, reversalsRuns: 2, reversalTurnRuns: 17.452, reversalsNew: 2, reversalTurnNew: 17.452, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 113.45462201886515, maxTurnAngleNew: 106.96995568775003 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,26.509L416.418,26.509L416.418,83.5L65.172,83.5L65.172,119.7L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 6.259792328823693, maxInteriorShiftNew: 5.200000000060099, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.56, renderedWindowTurnOld: 91.78, renderedWindowTurnNew: 83.72, reversalsMermaid: 2, reversalTurnMermaid: 50.883, reversalsOld: 2, reversalTurnOld: 9.2, reversalsRuns: 2, reversalTurnRuns: 57.468, reversalsNew: 2, reversalTurnNew: 57.432, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 95.00178956323113, maxTurnAngleNew: 90.80937364784342 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,31.914L607.176,31.914L607.176,83.5L446.688,83.5L446.688,119.7L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 11.786888690405148, maxInteriorShiftNew: 5.200000000942406, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.41, renderedWindowTurnOld: 96.79, renderedWindowTurnNew: 91.52, reversalsMermaid: 2, reversalTurnMermaid: 56.432, reversalsOld: 2, reversalTurnOld: 45.269, reversalsRuns: 2, reversalTurnRuns: 34.809, reversalsNew: 2, reversalTurnNew: 34.783, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 100.8673795737329, maxTurnAngleNew: 94.41685905954012 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,42L835.57,83.5L835.57,83.5L835.57,119.7L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000001158856, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00011459155917 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,30.72L1087.844,30.72L1087.844,83.5L1272.211,83.5L1272.211,119.7L1272.211,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 10.611755227105425, maxInteriorShiftNew: 5.2000000000138495, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.27, renderedWindowTurnOld: 95.05, renderedWindowTurnNew: 91.19, reversalsMermaid: 2, reversalTurnMermaid: 54.433, reversalsOld: 2, reversalTurnOld: 44.506, reversalsRuns: 2, reversalTurnRuns: 42.955, reversalsNew: 2, reversalTurnNew: 42.987, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 99.45760714717922, maxTurnAngleNew: 93.22645412873145 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,25.814L1310.301,25.814L1310.301,83.5L1717.125,83.5L1717.125,119.7L1717.125,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.0003124999999499778, startToBorderNew: 5.000000555810402e-7, maxInteriorShiftOld: 5.507598841600585, maxInteriorShiftNew: 5.200000000000003, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 89.68, renderedWindowTurnOld: 88.84, renderedWindowTurnNew: 81.43, reversalsMermaid: 2, reversalTurnMermaid: 44.509, reversalsOld: 2, reversalTurnOld: 7.788, reversalsRuns: 2, reversalTurnRuns: 51.842, reversalsNew: 2, reversalTurnNew: 51.878, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 94.32769383026212, maxTurnAngleNew: 90.5964633011894 } },
    { graph: "deep-chain", curve: "step", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,42L94.594,83.5L94.594,83.5L94.594,119.7L94.594,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00023103136903 } },
    { graph: "deep-chain", curve: "step", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,167L94.594,167L94.594,208.5L94.594,208.5L94.594,244.7L94.594,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00023103136903 } },
    { graph: "deep-chain", curve: "step", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,292L94.594,292L94.594,333.5L94.594,333.5L94.594,369.7L94.594,369.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00023103136903 } },
    { graph: "deep-chain", curve: "step", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,417L94.594,417L94.594,458.5L94.594,458.5L94.594,494.7L94.594,494.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00023103136903 } },
    { graph: "team-7", curve: "step", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,28.369L319.197,28.369L319.197,83.5L65.172,83.5L65.172,119.7L65.172,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 8.22393689178122, maxInteriorShiftNew: 5.200000000060099, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 88.84, renderedWindowTurnOld: 86.55, renderedWindowTurnNew: 83.08, reversalsMermaid: 2, reversalTurnMermaid: 70.76, reversalsOld: 2, reversalTurnOld: 16.008, reversalsRuns: 2, reversalTurnRuns: 72.421, reversalsNew: 2, reversalTurnNew: 72.435, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 96.8834553730325, maxTurnAngleNew: 91.60359162563805 } },
    { graph: "team-7", curve: "step", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M575.797,42L511.242,42L511.242,83.5L446.688,83.5L446.688,119.7L446.688,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.39000381330038, maxInteriorShiftNew: 5.200000000942406, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 83.14, renderedWindowTurnOld: 109.88, renderedWindowTurnNew: 97.18, reversalsMermaid: 2, reversalTurnMermaid: 55.51, reversalsOld: 2, reversalTurnOld: 21.036, reversalsRuns: 2, reversalTurnRuns: 53.721, reversalsNew: 2, reversalTurnNew: 53.715, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.09556572992632, maxTurnAngleNew: 108.22499072150961 } },
    { graph: "team-7", curve: "step", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M706.461,42L771.016,42L771.016,83.5L835.57,83.5L835.57,119.7L835.57,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.39000381330038, maxInteriorShiftNew: 5.200000000369618, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 83.14, renderedWindowTurnOld: 109.88, renderedWindowTurnNew: 97.18, reversalsMermaid: 2, reversalTurnMermaid: 55.511, reversalsOld: 2, reversalTurnOld: 21.035, reversalsRuns: 2, reversalTurnRuns: 53.723, reversalsNew: 2, reversalTurnNew: 53.726, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.09556572992632, maxTurnAngleNew: 108.22504089275294 } },
    { graph: "team-7", curve: "step", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,27.962L979.896,27.962L979.896,83.5L1250.758,83.5L1250.758,119.7L1250.758,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.00009375000001909939, startToBorderNew: 2.4999997094710125e-7, maxInteriorShiftOld: 7.800352940732916, maxInteriorShiftNew: 5.200000000131637, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 82.19, renderedWindowTurnOld: 93.8, renderedWindowTurnNew: 90.71, reversalsMermaid: 2, reversalTurnMermaid: 53.612, reversalsOld: 2, reversalTurnOld: 6.116, reversalsRuns: 2, reversalTurnRuns: 56.618, reversalsNew: 2, reversalTurnNew: 56.605, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 96.46143179808739, maxTurnAngleNew: 91.39851311645504 } },
    { graph: "team-7", curve: "step", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,167L65.172,167L65.172,208.5L125.985,208.5L125.985,248.35L186.799,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.4009220110016543, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.099630461597553, maxInteriorShiftNew: 10.500000000183046, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 88.86, renderedWindowTurnOld: 105.14, renderedWindowTurnNew: 97.66, reversalsMermaid: 2, reversalTurnMermaid: 63.361, reversalsOld: 2, reversalTurnOld: 19.704, reversalsRuns: 2, reversalTurnRuns: 17.529, reversalsNew: 2, reversalTurnNew: 17.529, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 113.4530665532405, maxTurnAngleNew: 106.96926962754836 } },
    { graph: "team-7", curve: "step", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,167L446.688,167L446.688,208.5L385.874,208.5L385.874,248.35L325.061,248.35",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.400976983756351, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.100465831770197, maxInteriorShiftNew: 10.50000000297619, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 88.85, renderedWindowTurnOld: 105.17, renderedWindowTurnNew: 97.64, reversalsMermaid: 2, reversalTurnMermaid: 63.254, reversalsOld: 2, reversalTurnOld: 19.603, reversalsRuns: 2, reversalTurnRuns: 17.452, reversalsNew: 2, reversalTurnNew: 17.452, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 113.45462201886515, maxTurnAngleNew: 106.96995568775003 } },
    { graph: "team-7", curve: "step", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,167L1250.758,167L1250.758,208.5L1250.758,208.5L1250.758,244.7L1250.758,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000420762, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.0001737355895 } },
    { graph: "long-names", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M250.209,42L302.282,42L302.282,83.5L354.355,83.5L354.355,119.7L354.355,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 17.951144810289957, maxInteriorShiftNew: 5.200000000831637, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.21, renderedWindowTurnOld: 105.76, renderedWindowTurnNew: 104.79, reversalsMermaid: 2, reversalTurnMermaid: 27.323, reversalsOld: 2, reversalTurnOld: 31.549, reversalsRuns: 2, reversalTurnRuns: 54.645, reversalsNew: 2, reversalTurnNew: 54.607, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 115.15838421446668, maxTurnAngleNew: 112.20550009713992 } },
    { graph: "long-names", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M144.807,42L92.734,42L92.734,83.5L40.66,83.5L40.66,146L40.66,146L40.66,208.5L90.272,208.5L90.272,248.038L139.883,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.6462627279570086, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 17.951144810289946, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 86.77, renderedWindowTurnOld: 112.13, renderedWindowTurnNew: 107.4, reversalsMermaid: 4, reversalTurnMermaid: 64.209, reversalsOld: 4, reversalTurnOld: 74.468, reversalsRuns: 4, reversalTurnRuns: 74.452, reversalsNew: 4, reversalTurnNew: 74.521, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 116.48515111540647, maxTurnAngleNew: 112.20535357258046 } },
    { graph: "long-names", curve: "step", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,167L354.355,167L354.355,208.5L304.744,208.5L304.744,248.038L255.132,248.038",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 1.6461862003228873, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 17.648692869445014, maxInteriorShiftNew: 10.500000002607427, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 89.36, renderedWindowTurnOld: 110.43, renderedWindowTurnNew: 105.11, reversalsMermaid: 2, reversalTurnMermaid: 50.681, reversalsOld: 2, reversalTurnOld: 50.185, reversalsRuns: 2, reversalTurnRuns: 56.576, reversalsNew: 2, reversalTurnNew: 56.576, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 116.4851511154064, maxTurnAngleNew: 110.0570392110952 } },
    { graph: "two-pairs", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,83.5L67.906,83.5L67.906,119.7L67.906,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00009056429668 } },
    { graph: "two-pairs", curve: "step", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,42L470.469,83.5L470.469,83.5L470.469,119.7L470.469,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000000744047, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00023103136905 } },
    { graph: "two-ranks-apart", curve: "step", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M180.333,42L117.334,42L117.334,83.5L54.336,83.5L54.336,119.7L54.336,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.559529733660924, maxInteriorShiftNew: 5.2000000000138495, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.86, renderedWindowTurnOld: 107.04, renderedWindowTurnNew: 89.73, reversalsMermaid: 2, reversalTurnMermaid: 37.054, reversalsOld: 2, reversalTurnOld: 41.41, reversalsRuns: 2, reversalTurnRuns: 52.076, reversalsNew: 2, reversalTurnNew: 52.118, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.44378306548826, maxTurnAngleNew: 108.6442576964694 } },
    { graph: "two-ranks-apart", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M307.847,42L370.845,42L370.845,83.5L433.844,83.5L433.844,119.7L433.844,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 16.560303016551345, maxInteriorShiftNew: 5.200000000230868, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.84, renderedWindowTurnOld: 107.06, renderedWindowTurnNew: 89.7, reversalsMermaid: 2, reversalTurnMermaid: 37.098, reversalsOld: 2, reversalTurnOld: 41.429, reversalsRuns: 2, reversalTurnRuns: 52.22, reversalsNew: 2, reversalTurnNew: 52.18, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 112.44536190942682, maxTurnAngleNew: 108.6449024107877 } },
    { graph: "short-names", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,28.736L94.801,28.736L94.801,83.5L26.773,83.5L26.773,119.7L26.773,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.27249073934802, maxInteriorShiftNew: 5.2000000007277905, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 88.99, renderedWindowTurnOld: 126.4, renderedWindowTurnNew: 157.1, reversalsMermaid: 2, reversalTurnMermaid: 12.338, reversalsOld: 2, reversalTurnOld: 98.312, reversalsRuns: 2, reversalTurnRuns: 69.01, reversalsNew: 2, reversalTurnNew: 69.007, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.91482066766036, maxTurnAngleNew: 159.28014383420935 } },
    { graph: "short-names", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,28.736L269.293,28.736L269.293,83.5L337.32,83.5L337.32,119.7L337.32,119.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.27249073934803, maxInteriorShiftNew: 5.200000000369618, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 88.99, renderedWindowTurnOld: 126.39, renderedWindowTurnNew: 157.1, reversalsMermaid: 2, reversalTurnMermaid: 12.374, reversalsOld: 2, reversalTurnOld: 98.541, reversalsRuns: 2, reversalTurnRuns: 69.104, reversalsNew: 2, reversalTurnNew: 69.091, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.91482066766038, maxTurnAngleNew: 159.2817616344801 } },
    { graph: "short-names", curve: "step", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,167L26.773,167L26.773,208.5L26.773,208.5L26.773,244.7L26.773,244.7",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 10.5, maxInteriorShiftNew: 10.500000002283857, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.00016079783283 } },
]

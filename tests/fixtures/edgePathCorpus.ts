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
 * implementation that this one replaces scores **2** on 14 of them and
 * **4** on one more. See `pathMetrics.ts → waviness` for why reversal
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
        NODE_CARD_HEIGHT: 88.2,
        NODE_CARD_BORDER: 1.5,
        NODE_CARD_PADDING_BLOCK: 9,
        NODE_CARD_ROW_GAP: 4,
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
    { graph: "two-node-chain", id: 2, centre: { x: 67.90625, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "three-chain", id: 1, centre: { x: 67.90625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "three-chain", id: 2, centre: { x: 67.90625, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "three-chain", id: 3, centre: { x: 67.90625, y: 321.4 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "diamond", id: 1, centre: { x: 255.9296875, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "diamond", id: 2, centre: { x: 65.171875, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "diamond", id: 3, centre: { x: 446.6875, y: 171.2 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "diamond", id: 4, centre: { x: 255.9296875, y: 321.4 }, labelBox: { x: -73.328125, y: -21, width: 146.65625, height: 42 } },
    { graph: "wide-fan", id: 1, centre: { x: 835.5703125, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "wide-fan", id: 2, centre: { x: 65.171875, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "wide-fan", id: 3, centre: { x: 446.6875, y: 171.2 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "wide-fan", id: 4, centre: { x: 835.5703125, y: 171.2 }, labelBox: { x: -72.5390625, y: -21, width: 145.078125, height: 42 } },
    { graph: "wide-fan", id: 5, centre: { x: 1272.2109375, y: 171.2 }, labelBox: { x: -104.1015625, y: -21, width: 208.203125, height: 42 } },
    { graph: "wide-fan", id: 6, centre: { x: 1717.125, y: 171.2 }, labelBox: { x: -80.8125, y: -21, width: 161.625, height: 42 } },
    { graph: "deep-chain", id: 11, centre: { x: 94.59375, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "deep-chain", id: 12, centre: { x: 94.59375, y: 171.2 }, labelBox: { x: -82.6484375, y: -21, width: 165.296875, height: 42 } },
    { graph: "deep-chain", id: 13, centre: { x: 94.59375, y: 321.4 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "deep-chain", id: 14, centre: { x: 94.59375, y: 471.6 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "deep-chain", id: 15, centre: { x: 94.59375, y: 621.8000000000001 }, labelBox: { x: -94.59375, y: -21, width: 189.1875, height: 42 } },
    { graph: "team-7", id: 11, centre: { x: 641.12890625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "team-7", id: 12, centre: { x: 65.171875, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "team-7", id: 13, centre: { x: 446.6875, y: 171.2 }, labelBox: { x: -56.34375, y: -21, width: 112.6875, height: 42 } },
    { graph: "team-7", id: 14, centre: { x: 835.5703125, y: 171.2 }, labelBox: { x: -72.5390625, y: -21, width: 145.078125, height: 42 } },
    { graph: "team-7", id: 16, centre: { x: 1250.7578125, y: 171.2 }, labelBox: { x: -82.6484375, y: -21, width: 165.296875, height: 42 } },
    { graph: "team-7", id: 15, centre: { x: 255.9296875, y: 321.4 }, labelBox: { x: -73.328125, y: -21, width: 146.65625, height: 42 } },
    { graph: "team-7", id: 17, centre: { x: 1250.7578125, y: 321.4 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "long-names", id: 1, centre: { x: 197.5078125, y: 21 }, labelBox: { x: -197.5078125, y: -21, width: 395.015625, height: 42 } },
    { graph: "long-names", id: 2, centre: { x: 354.35546875, y: 171.2 }, labelBox: { x: -173.6953125, y: -21, width: 347.390625, height: 42 } },
    { graph: "long-names", id: 3, centre: { x: 197.5078125, y: 321.4 }, labelBox: { x: -176.9765625, y: -21, width: 353.953125, height: 42 } },
    { graph: "two-pairs", id: 1, centre: { x: 67.90625, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "two-pairs", id: 2, centre: { x: 67.90625, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "two-pairs", id: 3, centre: { x: 470.46875, y: 21 }, labelBox: { x: -74.65625, y: -21, width: 149.3125, height: 42 } },
    { graph: "two-pairs", id: 4, centre: { x: 470.46875, y: 171.2 }, labelBox: { x: -77.34375, y: -21, width: 154.6875, height: 42 } },
    { graph: "two-ranks-apart", id: 1, centre: { x: 244.08984375, y: 21 }, labelBox: { x: -67.90625, y: -21, width: 135.8125, height: 42 } },
    { graph: "two-ranks-apart", id: 4, centre: { x: 54.3359375, y: 171.2 }, labelBox: { x: -54.3359375, y: -21, width: 108.671875, height: 42 } },
    { graph: "two-ranks-apart", id: 2, centre: { x: 433.84375, y: 171.2 }, labelBox: { x: -65.171875, y: -21, width: 130.34375, height: 42 } },
    { graph: "short-names", id: 1, centre: { x: 182.046875, y: 21 }, labelBox: { x: -19.21875, y: -21, width: 38.4375, height: 42 } },
    { graph: "short-names", id: 2, centre: { x: 26.7734375, y: 171.2 }, labelBox: { x: -22.9765625, y: -21, width: 45.953125, height: 42 } },
    { graph: "short-names", id: 3, centre: { x: 337.3203125, y: 171.2 }, labelBox: { x: -27.5703125, y: -21, width: 55.140625, height: 42 } },
    { graph: "short-names", id: 4, centre: { x: 26.7734375, y: 321.4 }, labelBox: { x: -26.7734375, y: -21, width: 53.546875, height: 42 } },
]

export const CORPUS_EDGES: CorpusEdge[] = [
    { graph: "two-node-chain", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,51.017C67.906,60.033,67.906,78.067,67.906,95.217C67.906,112.367,67.906,128.633,67.906,136.767L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,51.017C67.906,60.033,67.906,78.067,67.906,95.217C67.906,112.367,67.906,128.633,67.906,136.767L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "basis", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,192.2L67.906,201.217C67.906,210.233,67.906,228.267,67.906,245.417C67.906,262.567,67.906,278.833,67.906,286.967L67.906,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M202.589,42L179.686,51.017C156.783,60.033,110.977,78.067,88.075,95.217C65.172,112.367,65.172,128.633,65.172,136.767L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.058, maxInteriorShiftNew: 52.548, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.36, renderedWindowTurnOld: 180, renderedWindowTurnNew: 5.82, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 180.538, reversalsRuns: 2, reversalTurnRuns: 0.655, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M309.271,42L332.174,51.017C355.076,60.033,400.882,78.067,423.785,95.217C446.688,112.367,446.688,128.633,446.688,136.767L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.058, maxInteriorShiftNew: 52.549, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.36, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.82, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 180.559, reversalsRuns: 2, reversalTurnRuns: 0.651, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "basis", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,192.2L65.172,201.217C65.172,210.233,65.172,228.267,87.253,245.976C109.334,263.686,153.495,281.072,175.576,289.765L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 52.13, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.54, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.136, reversalsRuns: 2, reversalTurnRuns: 0.491, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "basis", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,192.2L446.688,201.217C446.688,210.233,446.688,228.267,424.607,245.976C402.526,263.686,358.364,281.072,336.283,289.765L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0.000001, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 52.13, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.54, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.128, reversalsRuns: 2, reversalTurnRuns: 0.49, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 179.999, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,27.62L650.582,39.033C533.5,50.446,299.336,73.273,182.254,92.82C65.172,112.367,65.172,128.633,65.172,136.767L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.341, maxInteriorShiftNew: 43.617, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 35.04, renderedWindowTurnOld: 63.66, renderedWindowTurnNew: 43.54, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 1, reversalTurnOld: 179.579, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,34.114L714.168,44.445C660.672,54.776,553.68,75.438,500.184,93.902C446.688,112.367,446.688,128.633,446.688,136.767L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 53.056, maxInteriorShiftNew: 44.214, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 18.35, renderedWindowTurnOld: 177.26, renderedWindowTurnNew: 30.47, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 179.869, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,51.017C835.57,60.033,835.57,78.067,835.57,95.217C835.57,112.367,835.57,128.633,835.57,136.767L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,32.68L964.932,43.25C1026.388,53.82,1149.299,74.96,1210.755,93.663C1272.211,112.367,1272.211,128.633,1272.211,136.767L1272.211,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.858, maxInteriorShiftNew: 44.049, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 22.34, renderedWindowTurnOld: 171.17, renderedWindowTurnNew: 33.86, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 179.984, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "basis", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,26.785L1039.085,38.337C1174.693,49.89,1445.909,72.995,1581.517,92.681C1717.125,112.367,1717.125,128.633,1717.125,136.767L1717.125,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.282, maxInteriorShiftNew: 43.568, headHandleClamped: true, tailHandleClamped: true, idempotentNew: true, renderedWindowTurnMermaid: 47.05, renderedWindowTurnOld: 33.71, renderedWindowTurnNew: 39.79, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 1, reversalTurnOld: 177.782, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "basis", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,51.017C94.594,60.033,94.594,78.067,94.594,95.217C94.594,112.367,94.594,128.633,94.594,136.767L94.594,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "basis", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,192.2L94.594,201.217C94.594,210.233,94.594,228.267,94.594,245.417C94.594,262.567,94.594,278.833,94.594,286.967L94.594,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "basis", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,342.4L94.594,351.417C94.594,360.433,94.594,378.467,94.594,395.617C94.594,412.767,94.594,429.033,94.594,437.167L94.594,445.3",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "basis", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,492.6L94.594,501.617C94.594,510.633,94.594,528.667,94.594,545.817C94.594,562.967,94.594,579.233,94.594,587.367L94.594,595.5",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,29.854L488.548,40.895C403.872,51.936,234.522,74.018,149.847,93.192C65.172,112.367,65.172,128.633,65.172,136.767L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 52.535, maxInteriorShiftNew: 43.779, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 32.39, renderedWindowTurnOld: 114.59, renderedWindowTurnNew: 28.3, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 180.074, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M586.758,42L563.413,51.017C540.068,60.033,493.378,78.067,470.033,95.217C446.688,112.367,446.688,128.633,446.688,136.767L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 64.114, maxInteriorShiftNew: 53.428, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.51, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.98, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.134, reversalsRuns: 2, reversalTurnRuns: 0.604, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M695.5,42L718.845,51.017C742.19,60.033,788.88,78.067,812.225,95.217C835.57,112.367,835.57,128.633,835.57,136.767L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 64.114, maxInteriorShiftNew: 53.428, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.51, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.98, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.119, reversalsRuns: 2, reversalTurnRuns: 0.574, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,29.365L799.322,40.488C889.609,51.61,1070.184,73.855,1160.471,93.111C1250.758,112.367,1250.758,128.633,1250.758,136.767L1250.758,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 52.488, maxInteriorShiftNew: 43.74, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 34.29, renderedWindowTurnOld: 65.64, renderedWindowTurnNew: 25.81, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 180.025, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,192.2L65.172,201.217C65.172,210.233,65.172,228.267,87.253,245.976C109.334,263.686,153.495,281.072,175.576,289.765L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 52.13, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.54, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.136, reversalsRuns: 2, reversalTurnRuns: 0.491, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,192.2L446.688,201.217C446.688,210.233,446.688,228.267,424.607,245.976C402.526,263.686,358.364,281.072,336.283,289.765L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0.000001, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 52.13, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.54, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.128, reversalsRuns: 2, reversalTurnRuns: 0.49, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 179.999, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "basis", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,192.2L1250.758,201.217C1250.758,210.233,1250.758,228.267,1250.758,245.417C1250.758,262.567,1250.758,278.833,1250.758,286.967L1250.758,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M241.367,42L260.198,51.017C279.03,60.033,316.693,78.067,335.524,95.217C354.355,112.367,354.355,128.633,354.355,136.767L354.355,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 53.49, maxInteriorShiftNew: 44.575, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 4.09, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.79, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.068, reversalsRuns: 2, reversalTurnRuns: 0.549, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.004, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M153.649,42L134.817,51.017C115.986,60.033,78.323,78.067,59.492,99.6C40.66,121.133,40.66,146.167,40.66,171.2C40.66,196.233,40.66,221.267,58.695,242.419C76.73,263.57,112.799,280.841,130.834,289.476L148.869,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000145, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 53.49, maxInteriorShiftNew: 44.574, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 6.29, renderedWindowTurnOld: 179.97, renderedWindowTurnNew: 6.16, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 180.898, reversalsRuns: 4, reversalTurnRuns: 2.394, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "basis", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,192.2L354.355,201.217C354.355,210.233,354.355,228.267,336.321,245.919C318.286,263.57,282.216,280.841,264.182,289.476L246.147,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000145, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 52.989, maxInteriorShiftNew: 44.158, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 3.53, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 3.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 180.991, reversalsRuns: 2, reversalTurnRuns: 0.762, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003, maxTurnAngleOld: 179.999, maxTurnAngleNew: 0 } },
    { graph: "two-pairs", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,51.017C67.906,60.033,67.906,78.067,67.906,95.217C67.906,112.367,67.906,128.633,67.906,136.767L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "two-pairs", curve: "basis", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,51.017C470.469,60.033,470.469,78.067,470.469,95.217C470.469,112.367,470.469,128.633,470.469,136.767L470.469,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "two-ranks-apart", curve: "basis", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M191.029,42L168.247,51.017C145.465,60.033,99.9,78.067,77.118,95.217C54.336,112.367,54.336,128.633,54.336,136.767L54.336,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.772, maxInteriorShiftNew: 52.31, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.32, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.78, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.43, reversalsRuns: 2, reversalTurnRuns: 0.809, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.002, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "two-ranks-apart", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M297.15,42L319.932,51.017C342.715,60.033,388.279,78.067,411.061,95.217C433.844,112.367,433.844,128.633,433.844,136.767L433.844,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.771, maxInteriorShiftNew: 52.309, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.33, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 5.78, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.414, reversalsRuns: 2, reversalTurnRuns: 0.807, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "basis", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,30.295L140.152,41.263C117.477,52.23,72.125,74.165,49.449,93.266C26.773,112.367,26.773,128.633,26.773,136.767L26.773,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 79.94, maxInteriorShiftNew: 66.616, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.13, renderedWindowTurnOld: 179.99, renderedWindowTurnNew: 4.74, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.744, reversalsRuns: 2, reversalTurnRuns: 3.805, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.001, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "basis", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,30.295L223.941,41.263C246.617,52.23,291.969,74.165,314.645,93.266C337.32,112.367,337.32,128.633,337.32,136.767L337.32,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 79.941, maxInteriorShiftNew: 66.617, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 5.13, renderedWindowTurnOld: 179.98, renderedWindowTurnNew: 4.74, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 4, reversalTurnOld: 181.721, reversalsRuns: 2, reversalTurnRuns: 3.812, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0.003, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "basis", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,192.2L26.773,201.217C26.773,210.233,26.773,228.267,26.773,245.417C26.773,262.567,26.773,278.833,26.773,286.967L26.773,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 19.25, headHandleClamped: true, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 180, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 3, reversalTurnOld: 540, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 180, maxTurnAngleNew: 0 } },
    { graph: "two-node-chain", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,96.1L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "three-chain", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,96.1L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "three-chain", curve: "linear", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,192.2L67.906,246.3L67.906,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "diamond", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M202.589,42L65.172,96.1L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 63.93, renderedWindowTurnOld: 80.04, renderedWindowTurnNew: 57.84, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 83.911, maxTurnAngleNew: 68.511 } },
    { graph: "diamond", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M309.271,42L446.688,96.1L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 63.93, renderedWindowTurnOld: 80.04, renderedWindowTurnNew: 57.84, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 83.911, maxTurnAngleNew: 68.51 } },
    { graph: "diamond", curve: "linear", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,192.2L65.172,246.3L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000353, tipToBorderNew: 0.000031, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.25, renderedWindowTurnOld: 146.81, renderedWindowTurnNew: 67.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 150.604, maxTurnAngleNew: 68.512 } },
    { graph: "diamond", curve: "linear", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,192.2L446.688,246.3L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0.000045, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.25, renderedWindowTurnOld: 146.83, renderedWindowTurnNew: 67.74, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 150.604, maxTurnAngleNew: 68.511 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,27.62L65.172,96.1L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 68.03, renderedWindowTurnOld: 85.44, renderedWindowTurnNew: 80.01, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 84.432, maxTurnAngleOld: 86.41, maxTurnAngleNew: 84.433 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,34.114L446.688,96.1L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 78.75, renderedWindowTurnOld: 74.57, renderedWindowTurnNew: 70.67, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 79.07, maxTurnAngleOld: 83.776, maxTurnAngleNew: 79.071 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,96.1L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,32.68L1272.211,96.1L1272.211,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 64.51, renderedWindowTurnOld: 74.63, renderedWindowTurnNew: 64.58, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 80.241, maxTurnAngleOld: 84.254, maxTurnAngleNew: 80.241 } },
    { graph: "wide-fan", curve: "linear", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,26.785L1717.125,96.1L1717.125,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 72.97, renderedWindowTurnOld: 86.44, renderedWindowTurnNew: 74.77, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 85.131, maxTurnAngleOld: 86.823, maxTurnAngleNew: 85.131 } },
    { graph: "deep-chain", curve: "linear", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,96.1L94.594,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "deep-chain", curve: "linear", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,192.2L94.594,246.3L94.594,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "deep-chain", curve: "linear", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,342.4L94.594,396.5L94.594,445.3",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "deep-chain", curve: "linear", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,492.6L94.594,546.7L94.594,595.5",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,29.854L65.172,96.1L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 72.73, renderedWindowTurnOld: 73.23, renderedWindowTurnNew: 69.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 82.571, maxTurnAngleOld: 85.379, maxTurnAngleNew: 82.571 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M586.758,42L446.688,96.1L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.35, renderedWindowTurnOld: 73.63, renderedWindowTurnNew: 58.7, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.882, maxTurnAngleOld: 84.025, maxTurnAngleNew: 68.882 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M695.5,42L835.57,96.1L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.35, renderedWindowTurnOld: 73.63, renderedWindowTurnNew: 58.7, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.882, maxTurnAngleOld: 84.025, maxTurnAngleNew: 68.882 } },
    { graph: "team-7", curve: "linear", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,29.365L1250.758,96.1L1250.758,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 76.53, renderedWindowTurnOld: 84.46, renderedWindowTurnNew: 81.73, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 82.977, maxTurnAngleOld: 85.595, maxTurnAngleNew: 82.977 } },
    { graph: "team-7", curve: "linear", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,192.2L65.172,246.3L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000353, tipToBorderNew: 0.000031, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.25, renderedWindowTurnOld: 146.81, renderedWindowTurnNew: 67.75, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 150.604, maxTurnAngleNew: 68.512 } },
    { graph: "team-7", curve: "linear", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,192.2L446.688,246.3L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000341, tipToBorderNew: 0.000045, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.556, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 54.25, renderedWindowTurnOld: 146.83, renderedWindowTurnNew: 67.74, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: true, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.511, maxTurnAngleOld: 150.604, maxTurnAngleNew: 68.511 } },
    { graph: "team-7", curve: "linear", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,192.2L1250.758,246.3L1250.758,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "long-names", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M241.367,42L354.355,96.1L354.355,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 63.52, renderedWindowTurnOld: 75.55, renderedWindowTurnNew: 58.43, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 64.414, maxTurnAngleOld: 82.608, maxTurnAngleNew: 64.415 } },
    { graph: "long-names", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M153.649,42L40.66,96.1L40.66,171.2L40.66,246.3L148.869,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000097, tipToBorderNew: 0.000026, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 52.989, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 55.36, renderedWindowTurnOld: 103.79, renderedWindowTurnNew: 60.13, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 10.573, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 64.415, maxTurnAngleOld: 106.882, maxTurnAngleNew: 64.415 } },
    { graph: "long-names", curve: "linear", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,192.2L354.355,246.3L246.147,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0.000081, tipToBorderNew: 0.000006, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 52.989, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 62.33, renderedWindowTurnOld: 140.22, renderedWindowTurnNew: 64.42, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 64.414, maxTurnAngleOld: 144.777, maxTurnAngleNew: 64.415 } },
    { graph: "two-pairs", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,96.1L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "two-pairs", curve: "linear", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,96.1L470.469,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.001 } },
    { graph: "two-ranks-apart", curve: "linear", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M191.029,42L54.336,96.1L54.336,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 66.28, renderedWindowTurnOld: 75.84, renderedWindowTurnNew: 60.4, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.407, maxTurnAngleOld: 83.879, maxTurnAngleNew: 68.407 } },
    { graph: "two-ranks-apart", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M297.15,42L433.844,96.1L433.844,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 66.28, renderedWindowTurnOld: 75.87, renderedWindowTurnNew: 60.39, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 68.408, maxTurnAngleOld: 83.879, maxTurnAngleNew: 68.407 } },
    { graph: "short-names", curve: "linear", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,30.295L26.773,96.1L26.773,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 52.46, renderedWindowTurnOld: 81.99, renderedWindowTurnNew: 58.92, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 64.189, maxTurnAngleOld: 82.533, maxTurnAngleNew: 64.187 } },
    { graph: "short-names", curve: "linear", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,30.295L337.32,96.1L337.32,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 52.45, renderedWindowTurnOld: 81.97, renderedWindowTurnNew: 58.97, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 64.188, maxTurnAngleOld: 82.533, maxTurnAngleNew: 64.187 } },
    { graph: "short-names", curve: "linear", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,192.2L26.773,246.3L26.773,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 22.6, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0.002 } },
    { graph: "two-node-chain", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,96.1,67.906,96.1C67.906,96.1,67.906,144.9,67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,96.1,67.906,96.1C67.906,96.1,67.906,144.9,67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "three-chain", curve: "bumpX", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,192.2C67.906,192.2,67.906,246.3,67.906,246.3C67.906,246.3,67.906,295.1,67.906,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M202.589,42C133.88,42,133.88,96.1,65.172,96.1C65.172,96.1,65.172,144.9,65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.058, maxInteriorShiftNew: 29.337, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 75.64, renderedWindowTurnOld: 81.18, renderedWindowTurnNew: 80.32, reversalsMermaid: 2, reversalTurnMermaid: 29.751, reversalsOld: 2, reversalTurnOld: 9.627, reversalsRuns: 2, reversalTurnRuns: 7.163, reversalsNew: 2, reversalTurnNew: 7.156, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "diamond", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M309.271,42C377.979,42,377.979,96.1,446.688,96.1C446.688,96.1,446.688,144.9,446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 63.058, maxInteriorShiftNew: 29.338, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 75.64, renderedWindowTurnOld: 81.17, renderedWindowTurnNew: 80.31, reversalsMermaid: 2, reversalTurnMermaid: 29.744, reversalsOld: 2, reversalTurnOld: 9.618, reversalsRuns: 2, reversalTurnRuns: 7.16, reversalsNew: 2, reversalTurnNew: 7.173, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,192.2C65.172,192.2,65.172,246.3,65.172,246.3C131.414,246.3,131.414,298.458,197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.51047, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.247, maxInteriorShiftNew: 28.94, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 87.38, renderedWindowTurnOld: 87.35, renderedWindowTurnNew: 78.39, reversalsMermaid: 2, reversalTurnMermaid: 0.681, reversalsOld: 2, reversalTurnOld: 0.714, reversalsRuns: 2, reversalTurnRuns: 1.656, reversalsNew: 2, reversalTurnNew: 1.657, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "diamond", curve: "bumpX", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,192.2C446.688,192.2,446.688,246.3,446.688,246.3C380.445,246.3,380.445,298.458,314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.510447, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.247, maxInteriorShiftNew: 28.94, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 87.39, renderedWindowTurnOld: 87.36, renderedWindowTurnNew: 78.4, reversalsMermaid: 2, reversalTurnMermaid: 0.684, reversalsOld: 2, reversalTurnOld: 0.712, reversalsRuns: 2, reversalTurnRuns: 1.671, reversalsNew: 2, reversalTurnNew: 1.671, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,27.62C416.418,27.62,416.418,96.1,65.172,96.1C65.172,96.1,65.172,144.9,65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.341, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 73.48, renderedWindowTurnOld: 72.23, renderedWindowTurnNew: 72.21, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,34.114C607.176,34.114,607.176,96.1,446.688,96.1C446.688,96.1,446.688,144.9,446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 53.056, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.81, renderedWindowTurnOld: 87.61, renderedWindowTurnNew: 87.02, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 7.583, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42C835.57,42,835.57,96.1,835.57,96.1C835.57,96.1,835.57,144.9,835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,32.68C1087.844,32.68,1087.844,96.1,1272.211,96.1C1272.211,96.1,1272.211,144.9,1272.211,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.858, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 72.34, renderedWindowTurnOld: 81.03, renderedWindowTurnNew: 81.19, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 2, reversalTurnOld: 2.984, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "wide-fan", curve: "bumpX", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,26.785C1310.301,26.785,1310.301,96.1,1717.125,96.1C1717.125,96.1,1717.125,144.9,1717.125,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 52.282, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 77.06, renderedWindowTurnOld: 86.57, renderedWindowTurnNew: 86.56, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42C94.594,42,94.594,96.1,94.594,96.1C94.594,96.1,94.594,144.9,94.594,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,192.2C94.594,192.2,94.594,246.3,94.594,246.3C94.594,246.3,94.594,295.1,94.594,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,342.4C94.594,342.4,94.594,396.5,94.594,396.5C94.594,396.5,94.594,445.3,94.594,445.3",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "deep-chain", curve: "bumpX", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,492.6C94.594,492.6,94.594,546.7,94.594,546.7C94.594,546.7,94.594,595.5,94.594,595.5",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,29.854C319.197,29.854,319.197,96.1,65.172,96.1C65.172,96.1,65.172,144.9,65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 52.535, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 78.48, renderedWindowTurnOld: 80.22, renderedWindowTurnNew: 80.06, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M586.758,42C516.723,42,516.723,96.1,446.688,96.1C446.688,96.1,446.688,144.9,446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 64.114, maxInteriorShiftNew: 29.904, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.19, renderedWindowTurnOld: 89.07, renderedWindowTurnNew: 87.94, reversalsMermaid: 2, reversalTurnMermaid: 9.818, reversalsOld: 2, reversalTurnOld: 39.51, reversalsRuns: 2, reversalTurnRuns: 39.807, reversalsNew: 2, reversalTurnNew: 39.807, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M695.5,42C765.535,42,765.535,96.1,835.57,96.1C835.57,96.1,835.57,144.9,835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 64.114, maxInteriorShiftNew: 29.904, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.19, renderedWindowTurnOld: 89.06, renderedWindowTurnNew: 87.94, reversalsMermaid: 2, reversalTurnMermaid: 9.815, reversalsOld: 2, reversalTurnOld: 39.506, reversalsRuns: 2, reversalTurnRuns: 39.794, reversalsNew: 2, reversalTurnNew: 39.805, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,29.365C979.896,29.365,979.896,96.1,1250.758,96.1C1250.758,96.1,1250.758,144.9,1250.758,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 52.488, maxInteriorShiftNew: 26.047, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 84.04, renderedWindowTurnOld: 86.51, renderedWindowTurnNew: 86.51, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,192.2C65.172,192.2,65.172,246.3,65.172,246.3C131.414,246.3,131.414,298.458,197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.51047, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.247, maxInteriorShiftNew: 28.94, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 87.38, renderedWindowTurnOld: 87.35, renderedWindowTurnNew: 78.39, reversalsMermaid: 2, reversalTurnMermaid: 0.681, reversalsOld: 2, reversalTurnOld: 0.714, reversalsRuns: 2, reversalTurnRuns: 1.656, reversalsNew: 2, reversalTurnNew: 1.657, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "team-7", curve: "bumpX", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,192.2C446.688,192.2,446.688,246.3,446.688,246.3C380.445,246.3,380.445,298.458,314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.510447, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.247, maxInteriorShiftNew: 28.94, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 87.39, renderedWindowTurnOld: 87.36, renderedWindowTurnNew: 78.4, reversalsMermaid: 2, reversalTurnMermaid: 0.684, reversalsOld: 2, reversalTurnOld: 0.712, reversalsRuns: 2, reversalTurnRuns: 1.671, reversalsNew: 2, reversalTurnNew: 1.671, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "team-7", curve: "bumpX", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,192.2C1250.758,192.2,1250.758,246.3,1250.758,246.3C1250.758,246.3,1250.758,295.1,1250.758,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M241.367,42C297.861,42,297.861,96.1,354.355,96.1C354.355,96.1,354.355,144.9,354.355,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 53.49, maxInteriorShiftNew: 53.49, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 74.75, renderedWindowTurnOld: 84.49, renderedWindowTurnNew: 84.87, reversalsMermaid: 2, reversalTurnMermaid: 30.648, reversalsOld: 2, reversalTurnOld: 41.466, reversalsRuns: 2, reversalTurnRuns: 25.533, reversalsNew: 2, reversalTurnNew: 25.539, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "long-names", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M153.649,42C97.155,42,97.155,96.1,40.66,96.1C40.66,96.1,40.66,171.2,40.66,171.2C40.66,171.2,40.66,246.3,40.66,246.3C94.764,246.3,94.764,298.111,148.869,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.621397, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 53.49, maxInteriorShiftNew: 53.49, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 85.49, renderedWindowTurnOld: 87.33, renderedWindowTurnNew: 79.42, reversalsMermaid: 4, reversalTurnMermaid: 31.535, reversalsOld: 4, reversalTurnOld: 42.246, reversalsRuns: 4, reversalTurnRuns: 27.798, reversalsNew: 4, reversalTurnNew: 27.784, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "long-names", curve: "bumpX", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,192.2C354.355,192.2,354.355,246.3,354.355,246.3C300.251,246.3,300.251,298.111,246.147,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.621474, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 52.56, maxInteriorShiftNew: 23.67, headHandleClamped: false, tailHandleClamped: true, idempotentNew: false, renderedWindowTurnMermaid: 74.48, renderedWindowTurnOld: 85.53, renderedWindowTurnNew: 78.93, reversalsMermaid: 2, reversalTurnMermaid: 0.961, reversalsOld: 2, reversalTurnOld: 0.965, reversalsRuns: 2, reversalTurnRuns: 2.317, reversalsNew: 2, reversalTurnNew: 2.316, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "two-pairs", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42C67.906,42,67.906,96.1,67.906,96.1C67.906,96.1,67.906,144.9,67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-pairs", curve: "bumpX", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42C470.469,42,470.469,96.1,470.469,96.1C470.469,96.1,470.469,144.9,470.469,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-ranks-apart", curve: "bumpX", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M191.029,42C122.683,42,122.683,96.1,54.336,96.1C54.336,96.1,54.336,144.9,54.336,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.772, maxInteriorShiftNew: 29.184, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 72.18, renderedWindowTurnOld: 78.18, renderedWindowTurnNew: 77.54, reversalsMermaid: 2, reversalTurnMermaid: 13.543, reversalsOld: 2, reversalTurnOld: 26.775, reversalsRuns: 2, reversalTurnRuns: 22.901, reversalsNew: 2, reversalTurnNew: 22.896, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "two-ranks-apart", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M297.15,42C365.497,42,365.497,96.1,433.844,96.1C433.844,96.1,433.844,144.9,433.844,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 62.771, maxInteriorShiftNew: 29.183, headHandleClamped: true, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 72.19, renderedWindowTurnOld: 78.18, renderedWindowTurnNew: 77.55, reversalsMermaid: 2, reversalTurnMermaid: 13.506, reversalsOld: 2, reversalTurnOld: 26.689, reversalsRuns: 2, reversalTurnRuns: 22.816, reversalsNew: 2, reversalTurnNew: 22.824, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "bumpX", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,30.295C94.801,30.295,94.801,96.1,26.773,96.1C26.773,96.1,26.773,144.9,26.773,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 79.94, maxInteriorShiftNew: 79.939, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 83.31, renderedWindowTurnOld: 85.89, renderedWindowTurnNew: 70.39, reversalsMermaid: 2, reversalTurnMermaid: 44.963, reversalsOld: 2, reversalTurnOld: 29.71, reversalsRuns: 2, reversalTurnRuns: 9.649, reversalsNew: 2, reversalTurnNew: 9.646, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 180, maxTurnAngleOld: 180, maxTurnAngleNew: 180 } },
    { graph: "short-names", curve: "bumpX", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,30.295C269.293,30.295,269.293,96.1,337.32,96.1C337.32,96.1,337.32,144.9,337.32,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 79.941, maxInteriorShiftNew: 79.94, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 83.31, renderedWindowTurnOld: 85.88, renderedWindowTurnNew: 70.41, reversalsMermaid: 2, reversalTurnMermaid: 44.989, reversalsOld: 2, reversalTurnOld: 29.765, reversalsRuns: 2, reversalTurnRuns: 9.684, reversalsNew: 2, reversalTurnNew: 9.681, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "short-names", curve: "bumpX", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,192.2C26.773,192.2,26.773,246.3,26.773,246.3C26.773,246.3,26.773,295.1,26.773,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 0, maxTurnAngleOld: 0, maxTurnAngleNew: 0 } },
    { graph: "two-node-chain", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,96.1L67.906,96.1L67.906,144.9L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "three-chain", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,96.1L67.906,96.1L67.906,144.9L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "three-chain", curve: "step", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M67.906,192.2L67.906,192.2L67.906,246.3L67.906,246.3L67.906,295.1L67.906,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "diamond", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M202.589,42L133.88,42L133.88,96.1L65.172,96.1L65.172,144.9L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.281, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.89, renderedWindowTurnOld: 123.62, renderedWindowTurnNew: 155.66, reversalsMermaid: 2, reversalTurnMermaid: 23.689, reversalsOld: 2, reversalTurnOld: 15.085, reversalsRuns: 2, reversalTurnRuns: 74.282, reversalsNew: 2, reversalTurnNew: 74.273, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.032, maxTurnAngleNew: 156.521 } },
    { graph: "diamond", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M309.271,42L377.979,42L377.979,96.1L446.688,96.1L446.688,144.9L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.282, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.91, renderedWindowTurnOld: 123.62, renderedWindowTurnNew: 155.67, reversalsMermaid: 2, reversalTurnMermaid: 23.723, reversalsOld: 2, reversalTurnOld: 15.008, reversalsRuns: 2, reversalTurnRuns: 74.286, reversalsNew: 2, reversalTurnNew: 74.301, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.033, maxTurnAngleNew: 156.524 } },
    { graph: "diamond", curve: "step", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M65.172,192.2L65.172,192.2L65.172,246.3L131.414,246.3L131.414,298.458L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.51047, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.176, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.74, renderedWindowTurnOld: 126.92, renderedWindowTurnNew: 158.95, reversalsMermaid: 2, reversalTurnMermaid: 44.553, reversalsOld: 2, reversalTurnOld: 50.971, reversalsRuns: 2, reversalTurnRuns: 45.185, reversalsNew: 2, reversalTurnNew: 45.185, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 128.024, maxTurnAngleNew: 159.998 } },
    { graph: "diamond", curve: "step", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M446.688,192.2L446.688,192.2L446.688,246.3L380.445,246.3L380.445,298.458L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.510447, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.175, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.74, renderedWindowTurnOld: 126.91, renderedWindowTurnNew: 158.95, reversalsMermaid: 2, reversalTurnMermaid: 44.459, reversalsOld: 2, reversalTurnOld: 50.859, reversalsRuns: 2, reversalTurnRuns: 45.08, reversalsNew: 2, reversalTurnNew: 45.08, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 128.023, maxTurnAngleNew: 159.997 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M767.664,27.62L416.418,27.62L416.418,96.1L65.172,96.1L65.172,144.9L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 88.62, renderedWindowTurnOld: 91.15, renderedWindowTurnNew: 89.17, reversalsMermaid: 2, reversalTurnMermaid: 9.831, reversalsOld: 2, reversalTurnOld: 23.368, reversalsRuns: 2, reversalTurnRuns: 13.326, reversalsNew: 2, reversalTurnNew: 13.308, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 95.983, maxTurnAngleNew: 90.973 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M767.664,34.114L607.176,34.114L607.176,96.1L446.688,96.1L446.688,144.9L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 84.68, renderedWindowTurnOld: 100.92, renderedWindowTurnNew: 94.01, reversalsMermaid: 2, reversalTurnMermaid: 20.749, reversalsOld: 2, reversalTurnOld: 24.762, reversalsRuns: 2, reversalTurnRuns: 31.312, reversalsNew: 2, reversalTurnNew: 31.286, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 102.799, maxTurnAngleNew: 95.303 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M835.57,42L835.57,42L835.57,96.1L835.57,96.1L835.57,144.9L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n5-0", source: 1, target: 5,
      d: "M903.477,32.68L1087.844,32.68L1087.844,96.1L1272.211,96.1L1272.211,144.9L1272.211,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.48, renderedWindowTurnOld: 100.33, renderedWindowTurnNew: 86.47, reversalsMermaid: 2, reversalTurnMermaid: 43.04, reversalsOld: 2, reversalTurnOld: 18.402, reversalsRuns: 2, reversalTurnRuns: 70.074, reversalsNew: 2, reversalTurnNew: 70.095, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 101.188, maxTurnAngleNew: 93.875 } },
    { graph: "wide-fan", curve: "step", id: "L-n1-n6-0", source: 1, target: 6,
      d: "M903.477,26.785L1310.301,26.785L1310.301,96.1L1717.125,96.1L1717.125,144.9L1717.125,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000312, startToBorderNew: 0.000001, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.96, renderedWindowTurnOld: 87.28, renderedWindowTurnNew: 85.74, reversalsMermaid: 2, reversalTurnMermaid: 38.164, reversalsOld: 2, reversalTurnOld: 22.681, reversalsRuns: 2, reversalTurnRuns: 43.865, reversalsNew: 2, reversalTurnNew: 43.89, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 95.182, maxTurnAngleNew: 90.717 } },
    { graph: "deep-chain", curve: "step", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M94.594,42L94.594,42L94.594,96.1L94.594,96.1L94.594,144.9L94.594,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
    { graph: "deep-chain", curve: "step", id: "L-n12-n13-0", source: 12, target: 13,
      d: "M94.594,192.2L94.594,192.2L94.594,246.3L94.594,246.3L94.594,295.1L94.594,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
    { graph: "deep-chain", curve: "step", id: "L-n13-n14-0", source: 13, target: 14,
      d: "M94.594,342.4L94.594,342.4L94.594,396.5L94.594,396.5L94.594,445.3L94.594,445.3",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
    { graph: "deep-chain", curve: "step", id: "L-n14-n15-0", source: 14, target: 15,
      d: "M94.594,492.6L94.594,492.6L94.594,546.7L94.594,546.7L94.594,595.5L94.594,595.5",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
    { graph: "team-7", curve: "step", id: "L-n11-n12-0", source: 11, target: 12,
      d: "M573.223,29.854L319.197,29.854L319.197,96.1L65.172,96.1L65.172,144.9L65.172,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 84.76, renderedWindowTurnOld: 94.8, renderedWindowTurnNew: 76.07, reversalsMermaid: 2, reversalTurnMermaid: 58.241, reversalsOld: 2, reversalTurnOld: 29.96, reversalsRuns: 2, reversalTurnRuns: 56.106, reversalsNew: 2, reversalTurnNew: 56.119, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 98.202, maxTurnAngleNew: 91.927 } },
    { graph: "team-7", curve: "step", id: "L-n11-n13-0", source: 11, target: 13,
      d: "M586.758,42L516.723,42L516.723,96.1L446.688,96.1L446.688,144.9L446.688,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.188, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.47, renderedWindowTurnOld: 125.54, renderedWindowTurnNew: 156.07, reversalsMermaid: 2, reversalTurnMermaid: 72.663, reversalsOld: 2, reversalTurnOld: 4.533, reversalsRuns: 2, reversalTurnRuns: 48.38, reversalsNew: 2, reversalTurnNew: 48.38, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 125.871, maxTurnAngleNew: 156.12 } },
    { graph: "team-7", curve: "step", id: "L-n11-n14-0", source: 11, target: 14,
      d: "M695.5,42L765.535,42L765.535,96.1L835.57,96.1L835.57,144.9L835.57,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.189, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 87.47, renderedWindowTurnOld: 125.55, renderedWindowTurnNew: 156.08, reversalsMermaid: 2, reversalTurnMermaid: 72.666, reversalsOld: 2, reversalTurnOld: 4.437, reversalsRuns: 2, reversalTurnRuns: 48.382, reversalsNew: 2, reversalTurnNew: 48.39, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 125.872, maxTurnAngleNew: 156.12 } },
    { graph: "team-7", curve: "step", id: "L-n11-n16-0", source: 11, target: 16,
      d: "M709.035,29.365L979.896,29.365L979.896,96.1L1250.758,96.1L1250.758,144.9L1250.758,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0.000094, startToBorderNew: 0, maxInteriorShiftOld: 17.8, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 83.28, renderedWindowTurnOld: 91.59, renderedWindowTurnNew: 83.31, reversalsMermaid: 2, reversalTurnMermaid: 34.595, reversalsOld: 2, reversalTurnOld: 18.035, reversalsRuns: 2, reversalTurnRuns: 34.588, reversalsNew: 2, reversalTurnNew: 34.577, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 97.707, maxTurnAngleNew: 91.68 } },
    { graph: "team-7", curve: "step", id: "L-n12-n15-0", source: 12, target: 15,
      d: "M65.172,192.2L65.172,192.2L65.172,246.3L131.414,246.3L131.414,298.458L197.657,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.51047, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.176, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.74, renderedWindowTurnOld: 126.92, renderedWindowTurnNew: 158.95, reversalsMermaid: 2, reversalTurnMermaid: 44.553, reversalsOld: 2, reversalTurnOld: 50.971, reversalsRuns: 2, reversalTurnRuns: 45.185, reversalsNew: 2, reversalTurnNew: 45.185, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 128.024, maxTurnAngleNew: 159.998 } },
    { graph: "team-7", curve: "step", id: "L-n13-n15-0", source: 13, target: 15,
      d: "M446.688,192.2L446.688,192.2L446.688,246.3L380.445,246.3L380.445,298.458L314.202,298.458",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.510447, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.175, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.74, renderedWindowTurnOld: 126.91, renderedWindowTurnNew: 158.95, reversalsMermaid: 2, reversalTurnMermaid: 44.459, reversalsOld: 2, reversalTurnOld: 50.859, reversalsRuns: 2, reversalTurnRuns: 45.08, reversalsNew: 2, reversalTurnNew: 45.08, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 128.023, maxTurnAngleNew: 159.997 } },
    { graph: "team-7", curve: "step", id: "L-n16-n17-0", source: 16, target: 17,
      d: "M1250.758,192.2L1250.758,192.2L1250.758,246.3L1250.758,246.3L1250.758,295.1L1250.758,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "long-names", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M241.367,42L297.861,42L297.861,96.1L354.355,96.1L354.355,144.9L354.355,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.189, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 84.75, renderedWindowTurnOld: 123.95, renderedWindowTurnNew: 157.42, reversalsMermaid: 2, reversalTurnMermaid: 54.26, reversalsOld: 2, reversalTurnOld: 54.753, reversalsRuns: 2, reversalTurnRuns: 50.85, reversalsNew: 2, reversalTurnNew: 50.853, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 127.55, maxTurnAngleNew: 160.349 } },
    { graph: "long-names", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M153.649,42L97.155,42L97.155,96.1L40.66,96.1L40.66,171.2L40.66,171.2L40.66,246.3L94.764,246.3L94.764,298.111L148.869,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.621397, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.189, maxInteriorShiftNew: 0, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 89.81, renderedWindowTurnOld: 126.23, renderedWindowTurnNew: 161.95, reversalsMermaid: 4, reversalTurnMermaid: 111.22, reversalsOld: 4, reversalTurnOld: 92.104, reversalsRuns: 4, reversalTurnRuns: 94.779, reversalsNew: 4, reversalTurnNew: 94.752, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 129.664, maxTurnAngleNew: 164.321 } },
    { graph: "long-names", curve: "step", id: "L-n2-n3-0", source: 2, target: 3,
      d: "M354.355,192.2L354.355,192.2L354.355,246.3L300.251,246.3L300.251,298.111L246.147,298.111",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 4.621474, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 33.073, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: false, renderedWindowTurnMermaid: 81.27, renderedWindowTurnOld: 127.2, renderedWindowTurnNew: 159.92, reversalsMermaid: 2, reversalTurnMermaid: 77.611, reversalsOld: 2, reversalTurnOld: 78.597, reversalsRuns: 2, reversalTurnRuns: 39.781, reversalsNew: 2, reversalTurnNew: 39.781, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 129.665, maxTurnAngleNew: 164.324 } },
    { graph: "two-pairs", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M67.906,42L67.906,42L67.906,96.1L67.906,96.1L67.906,144.9L67.906,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90 } },
    { graph: "two-pairs", curve: "step", id: "L-n3-n4-0", source: 3, target: 4,
      d: "M470.469,42L470.469,42L470.469,96.1L470.469,96.1L470.469,144.9L470.469,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
    { graph: "two-ranks-apart", curve: "step", id: "L-n1-n4-0", source: 1, target: 4,
      d: "M191.029,42L122.683,42L122.683,96.1L54.336,96.1L54.336,144.9L54.336,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.308, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.8, renderedWindowTurnOld: 122.82, renderedWindowTurnNew: 155.54, reversalsMermaid: 2, reversalTurnMermaid: 27.549, reversalsOld: 2, reversalTurnOld: 31.753, reversalsRuns: 2, reversalTurnRuns: 43.855, reversalsNew: 2, reversalTurnNew: 43.852, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.079, maxTurnAngleNew: 156.636 } },
    { graph: "two-ranks-apart", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M297.15,42L365.497,42L365.497,96.1L433.844,96.1L433.844,144.9L433.844,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 32.307, maxInteriorShiftNew: 17.8, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 86.8, renderedWindowTurnOld: 122.82, renderedWindowTurnNew: 155.53, reversalsMermaid: 2, reversalTurnMermaid: 27.465, reversalsOld: 2, reversalTurnOld: 31.846, reversalsRuns: 2, reversalTurnRuns: 43.78, reversalsNew: 2, reversalTurnNew: 43.786, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 126.076, maxTurnAngleNew: 156.632 } },
    { graph: "short-names", curve: "step", id: "L-n1-n2-0", source: 1, target: 2,
      d: "M162.828,30.295L94.801,30.295L94.801,96.1L26.773,96.1L26.773,144.9L26.773,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 49.493, maxInteriorShiftNew: 79.939, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.72, renderedWindowTurnOld: 136.4, renderedWindowTurnNew: 173.42, reversalsMermaid: 2, reversalTurnMermaid: 9.544, reversalsOld: 2, reversalTurnOld: 83.712, reversalsRuns: 1, reversalTurnRuns: 0.528, reversalsNew: 1, reversalTurnNew: 0.528, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 138.62, maxTurnAngleNew: 173.547 } },
    { graph: "short-names", curve: "step", id: "L-n1-n3-0", source: 1, target: 3,
      d: "M201.266,30.295L269.293,30.295L269.293,96.1L337.32,96.1L337.32,144.9L337.32,144.9",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 49.493, maxInteriorShiftNew: 79.94, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 85.72, renderedWindowTurnOld: 136.39, renderedWindowTurnNew: 173.42, reversalsMermaid: 2, reversalTurnMermaid: 9.577, reversalsOld: 2, reversalTurnOld: 83.629, reversalsRuns: 1, reversalTurnRuns: 0.528, reversalsNew: 1, reversalTurnNew: 0.528, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: true, maxTurnAngleMermaid: 90, maxTurnAngleOld: 138.621, maxTurnAngleNew: 173.544 } },
    { graph: "short-names", curve: "step", id: "L-n2-n4-0", source: 2, target: 4,
      d: "M26.773,192.2L26.773,192.2L26.773,246.3L26.773,246.3L26.773,295.1L26.773,295.1",
      markerEnd: "url(#flowchart-pointEnd)", markerStart: null,
      measured: { tipToBorderOld: 0, tipToBorderNew: 0, startToBorderOld: 0, startToBorderNew: 0, maxInteriorShiftOld: 23.1, maxInteriorShiftNew: 23.1, headHandleClamped: false, tailHandleClamped: false, idempotentNew: true, renderedWindowTurnMermaid: 0, renderedWindowTurnOld: 0, renderedWindowTurnNew: 0, reversalsMermaid: 0, reversalTurnMermaid: 0, reversalsOld: 0, reversalTurnOld: 0, reversalsRuns: 0, reversalTurnRuns: 0, reversalsNew: 0, reversalTurnNew: 0, renderedSelfIntersectsMermaid: false, renderedSelfIntersectsOld: false, renderedSelfIntersectsNew: false, maxTurnAngleMermaid: 90, maxTurnAngleOld: 90, maxTurnAngleNew: 90.001 } },
]

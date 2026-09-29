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
                    // A re-anchored path keeps a handle's length unless the
                    // clamp had to shorten it, so a shorter "after" is
                    // direct evidence the clamp fired on a real path.
                    headHandleClamped: newD !== null && handleLength(newD, 0) < handleLength(d, 0) - 1e-9,
                    tailHandleClamped: newD !== null && handleLength(newD, 1) < handleLength(d, 1) - 1e-9,
                    // Re-anchoring the rewritten path must be a no-op.
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

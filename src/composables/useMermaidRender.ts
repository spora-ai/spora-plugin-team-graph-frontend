/**
 * Mermaid render pipeline.
 *
 * Owns the whole SVG lifecycle — render → commit → node-box resize
 * → viewBox reset → measure → click-free edge styling — and returns
 * the `positions` map the Vue node-card overlay consumes. Teardown is
 * implicit: `onBeforeUnmount` empties the host and drops the positions.
 *
 * **Mermaid owns edges, Vue owns cards.** The diagram is rendered
 * with `htmlLabels: false` and the node boxes are left transparent
 * (see `style.css`); `TeamGraphCanvas.vue` paints a real
 * `<AgentNodeCard>` per node in a sibling HTML overlay that shares
 * the pan/zoom content layer. See `lib/nodeLayout.ts` for the full
 * argument and the coordinate maths.
 *
 * The post-processing pipeline is, in order:
 *   1. `mermaid.render(id, source)` produces an SVG string with
 *      inline `style="max-width: …"`. We strip it.
 *   2. Every `g.node` box is resized to the card footprint
 *      (`NODE_CARD_WIDTH` × `NODE_CARD_HEIGHT`) and centred on the
 *      node's own `translate(cx, cy)`. Mermaid sized these boxes from
 *      the label text; growing them is what makes the SVG's own
 *      bounding box — and therefore `getBBox()` below — enclose the
 *      cards the overlay is about to draw.
 *   3. Every edge is **re-anchored onto the card borders**. Mermaid
 *      routed the edges against the (much smaller) label boxes it
 *      measured, so growing the rects in step 2 leaves the arrows
 *      floating short of the cards. Each endpoint is walked out along
 *      the same ray to the new border — and then stopped short again
 *      by `ARROWHEAD_OVERSHOOT`, so the arrow *tip* rather than the
 *      path end meets the card. See `lib/edgeGeometry.ts`.
 *   4. `viewBox` is reset to that `getBBox()` + `SVG_PADDING`
 *      padding, and `width`/`height` are pinned to the same numbers
 *      so one SVG user unit equals one content-layer pixel.
 *   5. `measureNodePositions()` converts each node's centre into a
 *      card top-left in content-layer pixels. Re-run on *every*
 *      render, so a re-render (poll, principal switch, edge
 *      selection) can never leave a card where it used to be.
 *   6. Edge paths are tagged `out` / `in` / `dim` for the current
 *      selection.
 *
 * Pan/zoom is handled by the parent component via `setPointerCapture`
 * — `pointerup` distinguishes a drag (`moved=true`) from an empty
 * tap (clears selection). Because the overlay lives inside the same
 * transformed element as the SVG, it follows the view with no JS.
 */
import mermaid from 'mermaid'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { buildMermaidSource } from '../lib/mermaidSource'
import { ARROWHEAD_OVERSHOOT, reanchorEdgePath } from '../lib/edgeGeometry'
import {
    SVG_PADDING,
    edgeEndsFromMermaidId,
    measureNodeCentres,
    measureNodePositions,
    NODE_CARD_HEIGHT,
    NODE_CARD_WIDTH,
    type NodeCentre,
    type NodePosition,
} from '../lib/nodeLayout'
import { useSelectionStore } from '../stores/selection'
import type { GraphPayload } from '../types'

export interface UseMermaidRenderOptions {
    hostRef: Ref<HTMLElement | null>
    graph: Ref<GraphPayload | null>
    /**
     * Called after every successful Mermaid render (post-processing
     * included). The canvas wires this to its pan/zoom `fit()` so the
     * diagram centres inside the viewport the moment it lands in the
     * DOM, instead of relying on a prop-driven watcher that can race
     * the async Mermaid render and silently no-op.
     */
    onRender?: () => void
}

export interface UseMermaidRenderReturn {
    renderId: Ref<number>
    error: Ref<string | null>
    /**
     * Card top-left per agent id, in content-layer pixels. Replaced
     * wholesale on every successful render and emptied on error, so
     * the overlay can never show a stale layout.
     */
    positions: Ref<Record<number, NodePosition>>
    reRender: () => Promise<void>
}

let renderCounter = 0

/**
 * Minimum `nodeSpacing` / `rankSpacing` that makes the overlay cards
 * collision-free.
 *
 * dagre guarantees `gap >= nodesep` between boxes side by side in a
 * rank (`order/bk.js → sep()`) and `gap >= ranksep` between ranks
 * (`position/index.js → positionY()`). Those are minimums, not
 * averages: a *larger* measured box only ever pushes neighbours
 * further apart. So setting each spacing to the card's own footprint
 * plus a gutter makes overlap impossible regardless of how wide the
 * agent names are.
 */
const CARD_GUTTER = 20
const MIN_NODE_SPACING = NODE_CARD_WIDTH + CARD_GUTTER
const MIN_RANK_SPACING = NODE_CARD_HEIGHT + CARD_GUTTER

let mermaidInitialised = false
function ensureMermaidInit(): void {
    if (mermaidInitialised) return
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
            /*
             * The card is a Vue component in an HTML overlay, and
             * `createApp().mount()` cannot target an element nested
             * inside `<svg>`. Text labels keep the SVG a pure
             * geometry surface — no `<foreignObject>`, nothing for
             * Mermaid's sanitiser to strip, and the overlay is free
             * to use real components.
             */
            htmlLabels: false,
            // Render the SVG at its natural intrinsic size; the parent
            // component's transform handles zoom. Without this Mermaid
            // scales the SVG to fit the container, fighting our
            // imperative transform.
            useMaxWidth: false,
            curve: 'basis',
            // Both are lower bounds on the gap dagre leaves between
            // node boxes — sized so the overlay cards can never
            // overlap. See MIN_NODE_SPACING / MIN_RANK_SPACING.
            nodeSpacing: MIN_NODE_SPACING,
            rankSpacing: MIN_RANK_SPACING,
            padding: 24,
        },
        securityLevel: 'loose',
    })
    mermaidInitialised = true
}

/**
 * Render the graph and expose the resulting geometry.
 *
 * The return is an **imperative handle**, not reactive state to watch:
 * `renderId` is a monotonic counter whose only job is to let a caller
 * (and the module's own error path) discard a render that a newer one
 * has already superseded, so every write is guarded on it. `reRender`
 * re-runs the pipeline on demand; `positions` and `error` are the
 * outputs the overlay and the error card read.
 */
export function useMermaidRender({ hostRef, graph, onRender }: UseMermaidRenderOptions): UseMermaidRenderReturn {
    const renderId = ref(0)
    const error = ref<string | null>(null)
    const positions = ref<Record<number, NodePosition>>({})
    const selection = useSelectionStore()

    function applyEdgeStyling(svgEl: SVGSVGElement): void {
        /*
         * Tag each edge path with `out`/`in`/`dim` (per the current
         * selection). Every edge is a solid arrow now — the
         * configured-but-never-fired distinction is conveyed in the
         * detail panel's secondary label, not on the canvas.
         *
         * Mermaid 10 changed the edge DOM: edges are
         * `<path class="flowchart-link LS-N LE-M">` (not the older
         * `<g class="edgePath">`). We tag the `path` element so the
         * CSS in style.css can recolour it.
         *
         * Node highlighting is *not* done here: the node boxes are
         * transparent, and `AgentNodeCard` reads the same store to
         * paint `is-selected` / `is-adjacent` / `is-dimmed`.
         */
        const sel = selection.selectedId
        svgEl.querySelectorAll('path.flowchart-link').forEach((edgeEl) => {
            const ends = edgeEndsFromMermaidId(edgeEl.id)
            edgeEl.classList.remove('out', 'in', 'dim', 'uninvoked')
            if (ends === null) return
            if (sel === null) return
            const [src, tgt] = ends
            if (src === sel) {
                edgeEl.classList.add('out')
            } else if (tgt === sel) {
                edgeEl.classList.add('in')
            } else {
                edgeEl.classList.add('dim')
            }
        })
    }

    function reanchorEdges(svgEl: SVGSVGElement, centres: Record<number, NodeCentre>): void {
        /*
         * Mermaid routed every edge against the *label* box it measured
         * before the render; the rects above have since been grown to the
         * `NODE_CARD_WIDTH` × `NODE_CARD_HEIGHT` card footprint, so the
         * endpoints now sit inside (or short of) the cards. Walk each
         * endpoint out along the same ray to the card's border,
         * translating the adjacent control point by the same delta so the
         * curve stays smooth. See `lib/edgeGeometry.ts` for the
         * measurement that motivates it.
         *
         * The overshoot is passed explicitly because it is not a guess:
         * every edge `lib/mermaidSource.ts` emits is a `-->`, so every
         * rendered path carries Mermaid's `pointEnd` marker, and
         * `ARROWHEAD_OVERSHOOT` is how far that marker's tip paints past
         * the path end. Without the inset the tip lands *inside* the
         * opaque card and the arrowhead reads as cut off.
         *
         * Runs before the `getBBox()` below on purpose: a re-anchored
         * endpoint lands on — or just short of — a node rect, which is
         * already within the widest geometry in the diagram, so the
         * bounding box cannot grow; but taking it afterwards keeps that
         * true by construction rather than by argument.
         */
        svgEl.querySelectorAll('path.flowchart-link').forEach((edgeEl) => {
            const ends = edgeEndsFromMermaidId(edgeEl.id)
            if (ends === null) return
            const [src, tgt] = ends
            const source = centres[src]
            const target = centres[tgt]
            if (source === undefined || target === undefined) return
            const d = edgeEl.getAttribute('d')
            if (d === null) return
            const next = reanchorEdgePath(
                d,
                source,
                target,
                NODE_CARD_WIDTH / 2,
                NODE_CARD_HEIGHT / 2,
                ARROWHEAD_OVERSHOOT,
            )
            if (next !== null) edgeEl.setAttribute('d', next)
        })
    }

    async function renderInto(host: HTMLElement, payload: GraphPayload): Promise<SVGSVGElement | null> {
        const myRenderId = ++renderCounter
        renderId.value = myRenderId
        ensureMermaidInit()
        host.innerHTML = ''
        const code = buildMermaidSource(payload)
        try {
            const result = await mermaid.render(`m-${myRenderId}`, code)
            if (myRenderId !== renderCounter) return null
            host.innerHTML = result.svg
            const svgEl = host.querySelector('svg')
            if (svgEl === null) {
                positions.value = {}
                return null
            }
            // Strip Mermaid's inline sizing — we own viewBox / width / height now.
            svgEl.removeAttribute('style')
            /*
             * The SVG now carries edges and the transparent node
             * boxes only. Screen readers must not announce the raw
             * topology twice, so the whole diagram is hidden and the
             * overlay cards are the accessible representation.
             */
            svgEl.setAttribute('aria-hidden', 'true')
            svgEl.setAttribute('role', 'presentation')

            /*
             * Grow every node box to the card footprint, keeping it
             * centred on the node's own translate(). Doing this
             * *before* `getBBox()` is what makes the viewBox below
             * enclose the cards rather than the text labels. The
             * boxes stay transparent (style.css), so this is purely
             * geometry.
             *
             * The `fill: none; stroke: none` inline declaration is
             * load-bearing rather than belt-and-braces: an inline
             * style outranks the `<style>` Mermaid injects *into* the
             * SVG, so the node boxes stay unpainted even if the
             * plugin's own stylesheet never loads — which is the one
             * case where Mermaid's default theme would otherwise paint
             * them `#ECECFF` with a `#9370DB` stroke, straight over
             * cards that would themselves have no surface. `style.css`
             * still owns this (it must also cover `polygon` / `circle`
             * / `ellipse` for the other node shapes); this just makes
             * the guarantee independent of the stylesheet.
             */
            svgEl.querySelectorAll<SVGRectElement>('g.node rect').forEach((shape) => {
                shape.style.fill = 'none'
                shape.style.stroke = 'none'
                shape.setAttribute('x', String(-NODE_CARD_WIDTH / 2))
                shape.setAttribute('y', String(-NODE_CARD_HEIGHT / 2))
                shape.setAttribute('width', String(NODE_CARD_WIDTH))
                shape.setAttribute('height', String(NODE_CARD_HEIGHT))
            })

            /*
             * The node boxes are now card-sized, but Mermaid already
             * routed the edges against the label boxes it measured. Pull
             * the endpoints onto the new borders before anything reads
             * the geometry, so the arrows meet the cards they connect.
             */
            reanchorEdges(svgEl, measureNodeCentres(svgEl))

            try {
                const bb = svgEl.getBBox()
                if (bb.width > 0 && bb.height > 0) {
                    const pad = SVG_PADDING
                    svgEl.setAttribute(
                        'viewBox',
                        `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`,
                    )
                    svgEl.setAttribute('width', String(bb.width + pad * 2))
                    svgEl.setAttribute('height', String(bb.height + pad * 2))
                }
            } catch {
                // getBBox may fail before layout — fall back to Mermaid's defaults.
            }

            positions.value = measureNodePositions(svgEl)

            selection.setEdges(payload.edges)
            applyEdgeStyling(svgEl)
            /* Notify the canvas so it can fit the viewport against the
             * freshly committed SVG. Doing it here — instead of from
             * a prop watcher that races the async render — means fit()
             * runs the very first time a diagram lands, not just on
             * subsequent principal/refresh switches. */
            onRender?.()
            return svgEl
        } catch (e) {
            /*
             * The supersession check the success path runs, and for the
             * same reason: a render a newer one has already committed
             * over has no standing to touch the shared state, and here
             * that state is the *live* diagram. The failure this guard
             * exists to stop is the loud one — a stale rejection
             * replaced the good SVG the newer render had just put on
             * screen with a red error div and emptied `positions`, so
             * one slow-then-failing poll could blank a working graph
             * while the poll that superseded it sat there healthy. A
             * superseded render now writes nothing at all, on either
             * path.
             */
            if (myRenderId !== renderCounter) return null
            error.value = e instanceof Error ? e.message : String(e)
            positions.value = {}
            host.innerHTML = `<div class="p-4 text-sm text-red-500">Mermaid render error: <pre class="mt-2 text-xs whitespace-pre-wrap">${String(e instanceof Error ? e.message : e)}</pre></div>`
            return null
        }
    }

    async function reRender(): Promise<void> {
        error.value = null
        const host = hostRef.value
        const payload = graph.value
        if (host === null || payload === null) return
        /*
         * A payload with no nodes is not a diagram. `buildMermaidSource`
         * would emit a bare `flowchart TB`, and what Mermaid does with
         * that is not something to leave to chance: an empty `<svg>` is
         * merely wasted work, and a thrown one lands in the `catch`
         * below, which writes a red "Mermaid render error: …" div into
         * the host. `TeamGraphCanvas` shows its own empty-state note in
         * that card, so the error text would render *underneath* it.
         *
         * Clearing the host and the positions is the same thing
         * `renderInto` does on its first line, and it is what keeps a
         * previous principal's cards from being measured out of a
         * stale SVG.
         */
        if (payload.nodes.length === 0) {
            host.innerHTML = ''
            positions.value = {}
            return
        }
        await renderInto(host, payload)
    }

    watch(
        () => graph.value,
        (next) => {
            if (next === null) return
            void reRender()
        },
        { immediate: true },
    )

    /*
     * The payload is not the only thing a render needs — it needs
     * somewhere to put the result — and the watcher above only hears
     * about the first. A canvas that mounts with its `graph` prop
     * already populated gets an `immediate` pass during `setup()`,
     * when `hostRef` is still null, so `reRender()` returns early and
     * the pass is a permanent no-op: nothing else fires it, because the
     * prop never changes again. `useTeamGraph`'s dedup closes the
     * escape hatch too — the polls that follow return the identical
     * payload, so the graph watcher stays quiet and the canvas sits
     * there blank, holding a graph it will not draw.
     *
     * The host binding is the event that actually makes a render
     * possible, so it is the thing to watch. `TeamGraphPage` unmounts
     * the canvas whenever a fetch errors, which makes a successful
     * Retry exactly that remount-with-a-payload case.
     */
    watch(hostRef, (el) => {
        if (el === null) return
        void reRender()
    })

    // Re-apply edge styling when the store changes (e.g. clicking
    // a node in the canvas, or an "edge row" in the panel that jumps
    // to a different agent).
    watch(
        () => [selection.selectedId, selection.hoverId],
        () => {
            const host = hostRef.value
            if (host === null) return
            const svgEl = host.querySelector('svg')
            if (svgEl === null) return
            applyEdgeStyling(svgEl)
        },
    )

    onBeforeUnmount(() => {
        positions.value = {}
        if (hostRef.value !== null) hostRef.value.innerHTML = ''
    })

    return { renderId, error, positions, reRender }
}

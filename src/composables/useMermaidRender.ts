/**
 * Mermaid render pipeline.
 *
 * Owns the whole SVG lifecycle — render → cleanup → click handler
 * wiring → selection styling → viewBox / pan / zoom. Returns an
 * imperative `render()` and a `destroy()` so the parent component
 * can drive re-renders when the principal changes.
 *
 * The post-processing pipeline (lifted verbatim from Prototype E)
 * is the part that makes the diagram look like the rest of the
 * Spora UI:
 *   1. `mermaid.render(id, source)` produces an SVG string with
 *      inline `style="max-width: …"` and a padded viewBox. We
 *      strip both.
 *   2. We reset `viewBox` to the content's `getBBox()` + 20 px
 *      padding, and pin `width`/`height` to those dimensions.
 *      Without this, Mermaid's viewBox encloses the SVG's outer
 *      box (and arrowhead labels) which inflates the natural
 *      size and makes `fitView()` shrink the diagram.
 *   3. We walk `g.node rect, g.node polygon` and apply rounded
 *      corners (`rx=12, ry=12`) plus a soft drop-shadow.
 *   4. We attach `click` listeners to every `g.node` whose
 *      `id` matches the `flowchart-n<id>-<i>` regex.
 *
 * Pan/zoom is handled by the parent component via `setPointerCapture`
 * — `pointerup` distinguishes a drag (`moved=true`) from an empty
 * tap (clears selection).
 */
import mermaid from 'mermaid'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { buildMermaidSource } from '../lib/mermaidSource'
import { isAdjacent } from '../lib/stats'
import { useSelectionStore } from '../stores/selection'
import type { GraphEdge, GraphPayload } from '../types'

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
    reRender: () => Promise<void>
}

let renderCounter = 0

/**
 * Parse a Mermaid node DOM id (e.g. `flowchart-n11-2`) back to the
 * fixture id (`11`). Snapshot-tested so we catch Mermaid upgrades
 * that change the id format (see plan "Risks → Mermaid upgrades").
 */
export function nodeIdFromMermaidId(domId: string): number | null {
    const m = /^flowchart-(n\d+)-\d+$/.exec(domId)
    if (m === null) return null
    const cap = m[1]
    if (cap === undefined || !cap.startsWith('n')) return null
    const n = Number(cap.slice(1))
    return Number.isFinite(n) ? n : null
}

function edgeEndsFromMermaidId(domId: string): [number, number] | null {
    /*
     * Mermaid 10 emits edge path ids in the form `L-n<src>-n<tgt>-<idx>`
     * (the older Mermaid 9 form `flowchart-n<src>_n<tgt>-<idx>` is
     * still recognised for safety). We accept both because the
     * difference is internal to Mermaid and not part of any public
     * contract — the regex just needs to extract the two agent ids.
     */
    const m = /(?:^|[_-])n(\d+)[_-]n(\d+)(?:[-_]\d+)?$/.exec(domId)
    if (m === null) return null
    const a = Number(m[1])
    const b = Number(m[2])
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null
}

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
            htmlLabels: true,
            // Render the SVG at its natural intrinsic size; the parent
            // component's transform handles zoom. Without this Mermaid
            // scales the SVG to fit the container, fighting our
            // imperative transform.
            useMaxWidth: false,
            curve: 'basis',
            nodeSpacing: 60,
            rankSpacing: 90,
            padding: 24,
        },
        securityLevel: 'loose',
    })
    mermaidInitialised = true
}

export function useMermaidRender({ hostRef, graph, onRender }: UseMermaidRenderOptions): UseMermaidRenderReturn {
    const renderId = ref(0)
    const error = ref<string | null>(null)
    const selection = useSelectionStore()

    function applySelectionStyling(svgEl: SVGSVGElement, edges: GraphEdge[]): void {
        const sel = selection.selectedId
        svgEl.querySelectorAll('g.node').forEach((nodeEl) => {
            const id = nodeIdFromMermaidId(nodeEl.id)
            if (id === null) return
            nodeEl.classList.remove('selected', 'adjacent', 'dimmed')
            if (sel === null) return
            if (id === sel) {
                nodeEl.classList.add('selected')
            } else if (isAdjacent(edges, id, sel)) {
                nodeEl.classList.add('adjacent')
            } else {
                nodeEl.classList.add('dimmed')
            }
        })

        /*
         * Tag each edge group with `out`/`in`/`dim` (per the
         * selection). Every edge is a solid arrow now — the
         * configured-but-never-fired distinction is conveyed in
         * the detail panel's secondary label, not on the canvas.
         *
         * Mermaid 10 changed the edge DOM: edges are
         * `<path class="flowchart-link LS-N LE-M">` (not the
         * older `<g class="edgePath">`). We tag the `path` element
         * so the CSS in style.css can recolour it.
         */
        svgEl.querySelectorAll('path.flowchart-link').forEach((edgeEl) => {
            const ends = edgeEndsFromMermaidId(edgeEl.id)
            edgeEl.classList.remove('out', 'in', 'dim', 'uninvoked')
            if (ends === null) return
            const [src, tgt] = ends
            if (sel === null) return
            if (src === sel) {
                edgeEl.classList.add('out')
            } else if (tgt === sel) {
                edgeEl.classList.add('in')
            } else {
                edgeEl.classList.add('dim')
            }
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
            if (svgEl === null) return null
            // Strip Mermaid's inline sizing — we own viewBox / width / height now.
            svgEl.removeAttribute('style')

            try {
                const bb = svgEl.getBBox()
                if (bb.width > 0 && bb.height > 0) {
                    const pad = 20
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

            // Rounded corners + soft shadow on every node shape.
            // Colour comes from the `tg-palette-<key>` classDef
            // Mermaid applied to the wrapping `<g>` (see
            // `lib/mermaidSource.ts`); the rect's fill is
            // `!important`-overridden in style.css.
            svgEl.querySelectorAll('g.node rect, g.node polygon').forEach((shape) => {
                shape.setAttribute('rx', '12')
                shape.setAttribute('ry', '12')
                ;(shape as SVGElement).style.filter = 'drop-shadow(0 2px 6px rgba(15, 23, 41, 0.12))'
            })

            // Per-node click handler.
            svgEl.querySelectorAll('g.node').forEach((nodeEl) => {
                const id = nodeIdFromMermaidId(nodeEl.id)
                if (id === null) return
                nodeEl.addEventListener('click', (ev: Event) => {
                    ev.stopPropagation()
                    if (selection.selectedId === id) {
                        selection.clear()
                    } else {
                        selection.setSelected(id)
                    }
                })
            })

            selection.setEdges(payload.edges)
            applySelectionStyling(svgEl, payload.edges)
            /*
             * Force-set status pill colours after Mermaid renders.
             * Mermaid injects per-class rules like
             *   `#m-N .tg-palette-indigo span { color: <fg>; }`
             * into the SVG's <style> element, which beats our
             * `.tg-status-pill { color: #0f172a !important }` rule on
             * specificity (1,1,1 > 0,1,0) AND on source order (Mermaid
             * injects after our document-head stylesheet). The result
             * is the pill text inheriting the agent's fg_color — "idle"
             * sits white-on-white on the slate palette, etc.
             *
             * Inline style on the pill wins unconditionally, so we set
             * the colour imperatively here, after Mermaid's CSSOM has
             * settled. This is the cheapest reliable fix that does not
             * require coupling to Mermaid's internal CSS class naming.
             */
            svgEl.querySelectorAll('g.node .tg-status-pill').forEach((pill) => {
                const el = pill as SVGElement
                el.style.setProperty('color', '#0f172a', 'important')
                el.style.setProperty('background-color', 'rgba(255, 255, 255, 0.92)', 'important')
            })
            /* Notify the canvas so it can fit the viewport against the
             * freshly committed SVG. Doing it here — instead of from
             * a prop watcher that races the async render — means fit()
             * runs the very first time a diagram lands, not just on
             * subsequent principal/refresh switches. */
            onRender?.()
            return svgEl
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e)
            host.innerHTML = `<div class="p-4 text-sm text-red-500">Mermaid render error: <pre class="mt-2 text-xs whitespace-pre-wrap">${String(e instanceof Error ? e.message : e)}</pre></div>`
            return null
        }
    }

    async function reRender(): Promise<void> {
        error.value = null
        const host = hostRef.value
        const payload = graph.value
        if (host === null || payload === null) return
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

    // Re-apply selection styling when the store changes (e.g. clicking
    // a node in the canvas, or an "edge row" in the panel that jumps
    // to a different agent).
    watch(
        () => [selection.selectedId, selection.hoverId],
        () => {
            const host = hostRef.value
            if (host === null) return
            const svgEl = host.querySelector('svg')
            if (svgEl === null) return
            const edges = graph.value?.edges ?? []
            applySelectionStyling(svgEl, edges)
        },
    )

    onBeforeUnmount(() => {
        if (hostRef.value !== null) hostRef.value.innerHTML = ''
    })

    return { renderId, error, reRender }
}
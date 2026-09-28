/**
 * Node-id ⇄ DOM-id mapping and card placement.
 *
 * **The Option C arrangement.** Mermaid owns the *edges* only. It
 * still lays out nodes (dagre owns the topology — nothing else can
 * compute a readable TB ranking), but the node boxes themselves are
 * painted `transparent` by `style.css` and the real card is a Vue
 * component in a sibling HTML overlay, absolutely positioned inside
 * the same transformed content layer.
 *
 * **Where the coordinates come from.** Mermaid's `positionNode()`
 * writes `transform="translate(cx, cy)"` on every `<g class="node">`
 * — the node's *centre* in the SVG's own user space. We then pin the
 * SVG's `viewBox` to the rendered content's `getBBox()` + padding and
 * set `width`/`height` to the same numbers, which makes one SVG user
 * unit equal one CSS pixel of the content layer. The two coordinate
 * systems therefore differ by exactly the viewBox origin, and the
 * card's top-left inside the content layer is:
 *
 *     (cx - viewBox.x - CARD_WIDTH / 2,  cy - viewBox.y - CARD_HEIGHT / 2)
 *
 * That is deliberately *not* `getBoundingClientRect()`: rect maths
 * is in screen space and would have to be un-transformed on every
 * pan and zoom tick. Reading the `transform` attribute is exact,
 * synchronous, and zoom-invariant — the card is a sibling of the SVG
 * inside the element `usePanZoom` transforms, so both layers move
 * together for free.
 *
 * **Why the cards cannot overlap.** dagre's `sep()` guarantees
 * `gap >= nodesep` between adjacent boxes in a rank, and
 * `positionY()` guarantees `gap >= ranksep` between ranks. So sizing
 * `nodeSpacing`/`rankSpacing` at or above the card's footprint is a
 * proof, not a hope — see `MIN_NODE_SPACING` /
 * `MIN_RANK_SPACING` in `composables/useMermaidRender.ts`.
 */

/**
 * Card footprint in content-layer pixels. Mirrored by
 * `.tg-node-card { width; height }` in `style.css`; the two must
 * stay equal or the cards drift from the space Mermaid reserved for
 * them. 240 px is fixed by the Variant M prototype — the card never
 * grows with the agent name (the name ellipsises instead).
 */
export const NODE_CARD_WIDTH = 240
export const NODE_CARD_HEIGHT = 76

/**
 * Padding between the rendered content's bounding box and the
 * `viewBox` we set on the root `<svg>`. Doubles as the margin the
 * pan/zoom `fit()` leaves around the diagram.
 */
export const SVG_PADDING = 20

export interface NodePosition {
    /** Left edge of the card, in content-layer pixels. */
    x: number
    /** Top edge of the card, in content-layer pixels. */
    y: number
}

/**
 * Parse a Mermaid node DOM id (e.g. `flowchart-n11-2`) back to the
 * wire agent id (`11`). Snapshot-tested so we catch Mermaid upgrades
 * that change the id format.
 *
 * The regex already guarantees the capture is a non-empty run of
 * digits prefixed with `n`, so there is no second defensive check to
 * make — a mismatch between the two can only mean the format changed.
 */
export function nodeIdFromMermaidId(domId: string): number | null {
    const m = /^flowchart-(n\d+)-\d+$/.exec(domId)
    if (m === null) return null
    const n = Number(m[1].slice(1))
    return Number.isFinite(n) ? n : null
}

/**
 * Parse a Mermaid edge DOM id back to its `[source, target]` agent
 * ids.
 *
 * Mermaid 10 emits edge path ids in the form `L-n<src>-n<tgt>-<idx>`
 * (the older Mermaid 9 form `flowchart-n<src>_n<tgt>-<idx>` is still
 * recognised for safety). Both are accepted because the difference is
 * internal to Mermaid and not part of any public contract — the regex
 * only has to extract the two agent ids.
 */
export function edgeEndsFromMermaidId(domId: string): [number, number] | null {
    const m = /(?:^|[_-])n(\d+)[_-]n(\d+)(?:[-_]\d+)?$/.exec(domId)
    if (m === null) return null
    const a = Number(m[1])
    const b = Number(m[2])
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null
}

/**
 * Read the `(x, y)` pair out of an SVG `transform` attribute.
 *
 * Mermaid only ever emits `translate(a, b)` for nodes, but the
 * single-argument `translate(a)` form is legal SVG and would silently
 * place every card at y = 0 if ignored, so both are handled.
 */
export function parseTranslate(value: string | null): { x: number; y: number } | null {
    if (value === null) return null
    const m = /translate\(\s*(-?[\d.eE+]+)(?:[ ,]+(-?[\d.eE+]+))?\s*\)/.exec(value)
    if (m === null) return null
    const x = Number(m[1])
    const y = m[2] === undefined ? 0 : Number(m[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
}

/**
 * Origin of a `viewBox` string, i.e. the `min-x` / `min-y` pair.
 * Returns `null` for a missing or unparseable `viewBox` so callers
 * can bail out instead of positioning every card at the origin.
 */
export function viewBoxOrigin(viewBox: string | null): { x: number; y: number } | null {
    if (viewBox === null) return null
    const parts = viewBox.trim().split(/[\s,]+/)
    if (parts.length < 4) return null
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
}

/**
 * Measure every `g.node` in a freshly rendered Mermaid SVG and return
 * the card top-left for each, keyed by wire agent id.
 *
 * Must run *after* the root `viewBox` / `width` / `height` have been
 * pinned (see `composables/useMermaidRender.ts`) — the viewBox origin
 * is the only offset between SVG user space and content-layer pixels.
 * Nodes whose id or transform can't be read are skipped rather than
 * guessed at, so a Mermaid upgrade that changes either format
 * degrades to "fewer cards" instead of "cards in a heap at (0, 0)".
 */
export function measureNodePositions(
    svg: SVGSVGElement,
    cardWidth: number = NODE_CARD_WIDTH,
    cardHeight: number = NODE_CARD_HEIGHT,
): Record<number, NodePosition> {
    const out: Record<number, NodePosition> = {}
    const origin = viewBoxOrigin(svg.getAttribute('viewBox'))
    if (origin === null) return out
    svg.querySelectorAll('g.node').forEach((nodeEl) => {
        const id = nodeIdFromMermaidId(nodeEl.id)
        if (id === null) return
        const centre = parseTranslate(nodeEl.getAttribute('transform'))
        if (centre === null) return
        out[id] = {
            x: centre.x - origin.x - cardWidth / 2,
            y: centre.y - origin.y - cardHeight / 2,
        }
    })
    return out
}

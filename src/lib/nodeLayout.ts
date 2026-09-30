/**
 * Node-id ⇄ DOM-id mapping and card placement.
 *
 * **The arrangement.** Mermaid owns the *edges* only. It still lays out
 * nodes (dagre owns the topology — nothing else can compute a readable TB
 * ranking), but the node boxes are painted `transparent` by `style.css` and
 * the real card is a Vue component in a sibling HTML overlay, absolutely
 * positioned inside the same transformed content layer.
 *
 * **Where the coordinates come from.** Mermaid's `positionNode()` writes
 * `transform="translate(cx, cy)"` on every `<g class="node">` — the node's
 * *centre* in the SVG's own user space. We pin the SVG's `viewBox` to the
 * rendered content's `getBBox()` + padding and set `width`/`height` to the
 * same numbers, which makes one SVG user unit equal one CSS pixel. The two
 * systems then differ by exactly the viewBox origin, and the card's top-left
 * is:
 *
 *     (cx - viewBox.x - CARD_WIDTH / 2,  cy - viewBox.y - CARD_HEIGHT / 2)
 *
 * Deliberately *not* `getBoundingClientRect()`: rect maths is in screen
 * space and would have to be un-transformed on every pan and zoom tick.
 * Reading the `transform` attribute is exact, synchronous and zoom-invariant,
 * because the card is a sibling of the SVG inside the element `usePanZoom`
 * transforms, so both layers move together.
 *
 * **Why the cards cannot overlap.** dagre's `sep()` guarantees
 * `gap >= nodesep` between adjacent boxes in a rank and `positionY()`
 * guarantees `gap >= ranksep` between ranks, so sizing `nodeSpacing` /
 * `rankSpacing` at or above the card's footprint is a proof, not a hope —
 * see `MIN_NODE_SPACING` / `MIN_RANK_SPACING` in
 * `composables/useMermaidRender.ts`.
 */

/**
 * Card footprint in content-layer pixels — the single source of truth for
 * every consumer of the box: `measureNodePositions` places the card,
 * `useMermaidRender` grows each `g.node` rect to it so dagre's spacing
 * accounts for the card, and `reanchorEdges` walks each arrow tip onto its
 * border with the same half-extents. `AgentNodeCard.vue` takes its `width` /
 * `height` from these as *inline* declarations and `style.css` carries no
 * footprint literal at all (`tests/style.spec.ts` asserts that). They are
 * all this module precisely so they cannot disagree — a resize that skipped
 * one of them has detached the arrowheads before.
 *
 * 240 px is fixed by the Variant M prototype; the name ellipsises rather
 * than growing the card.
 */
export const NODE_CARD_WIDTH = 240

/**
 * Avatar tile edge, in px — the package's `size="md"` (`2.75rem`, i.e. 44 px
 * at the default root size). The operator asked for the bigger tile and has
 * not rescinded it, so this is the one term of the card's height that is
 * *not* negotiable.
 *
 * **Pinned in px rather than left to the package's `rem`:** `.avatar--md`
 * tracks the *root* font size while the card's height is a fixed px box, so
 * a host setting `html { font-size: 18px }` would paint a 49.5 px tile
 * inside a box derived from 44 px and spill out of it. The card states the
 * edge itself from the same constant `NODE_CARD_CONTENT_HEIGHT` reads, so
 * the painted tile and the box containing it cannot drift.
 */
export const NODE_CARD_AVATAR_SIZE = 44

/**
 * The card's block padding, its border, and the gap between the two rows —
 * three of the terms of `NODE_CARD_HEIGHT`. Named rather than inlined into
 * the sum so the height reads as the equation the stylesheet implements.
 *
 * `1.5px` is the prototype's own border. The block padding (9 → 8) and row
 * gap (4 → 3) are the operator's revision: the prototype framed a **32 px**
 * tile, this card carries the 44 px one, and the card read too tall with a
 * gap that read as a hole rather than as a gap.
 */
export const NODE_CARD_BORDER = 1.5
export const NODE_CARD_PADDING_BLOCK = 8
export const NODE_CARD_ROW_GAP = 3

/**
 * The status row's height, derived from the two boxes that sit in it.
 *
 * The row is content-sized, not a worst-case reserve, because the pill no
 * longer wraps: `.tg-node-card-pill` takes the label on one line
 * (`white-space: nowrap` + `text-overflow: ellipsis`) and `min-width: 0`.
 * That `min-width: 0` is the load-bearing half — a flex item's automatic
 * minimum size is its min-content width, so without it a `nowrap` pill
 * refuses to shrink and pushes the edge badges off the card. The label
 * survives in full in `textContent`, the `title`, and the detail panel, so a
 * card can no longer overflow however long a status string the wire grows.
 */
export const NODE_CARD_PILL_FONT_SIZE = 11
export const NODE_CARD_PILL_LINE_HEIGHT = 1.2
export const NODE_CARD_PILL_PADDING_BLOCK = 3
export const NODE_CARD_PILL_HEIGHT =
    NODE_CARD_PILL_FONT_SIZE * NODE_CARD_PILL_LINE_HEIGHT + NODE_CARD_PILL_PADDING_BLOCK * 2

export const NODE_CARD_BADGE_FONT_SIZE = 10
export const NODE_CARD_BADGE_LINE_HEIGHT = 1.4
export const NODE_CARD_BADGE_PADDING_BLOCK = 1
export const NODE_CARD_BADGE_HEIGHT =
    NODE_CARD_BADGE_FONT_SIZE * NODE_CARD_BADGE_LINE_HEIGHT + NODE_CARD_BADGE_PADDING_BLOCK * 2

/** The status row: the taller of the pill and the edge-count badges. 19.2 px. */
export const NODE_CARD_ROW2_HEIGHT = Math.max(NODE_CARD_PILL_HEIGHT, NODE_CARD_BADGE_HEIGHT)

/**
 * Row 1 — the headline — and its own height, 15.6 px.
 *
 * **A constant, and deliberately no longer the tile's edge.** Row 1 used to
 * be forced to `NODE_CARD_AVATAR_SIZE` and the name centred in it, which is
 * exactly why the headline read as sitting low: a 15.6 px line box centred
 * in a 44 px band hangs 14.2 px below the tile's top edge. Row 1 is
 * therefore the headline's natural height, top-aligned against the tile
 * (`.tg-node-card { align-items: flex-start }`).
 *
 * It has to be stated rather than guessed because the height below is a
 * sum, and a sum whose term is guessed is a sum that lies. The one thing
 * that could make it wrong is a two-line name, and
 * `.tg-node-card-name` is `nowrap` + `ellipsis` (asserted in
 * `tests/lib/nodeLayout.spec.ts`), so it is one line for every name the
 * wire can carry.
 */
export const NODE_CARD_HEADLINE_FONT_SIZE = 13
export const NODE_CARD_HEADLINE_LINE_HEIGHT = 1.2
export const NODE_CARD_HEADLINE_HEIGHT = NODE_CARD_HEADLINE_FONT_SIZE * NODE_CARD_HEADLINE_LINE_HEIGHT

/**
 * The body column — headline, row gap, status row — at 37.8 px.
 *
 * Exported because the invariant worth stating is a comparison, not a
 * number: **the body must not exceed the tile.** While it does not, the
 * tile is the height floor and the card is exactly as short as a 44 px tile
 * allows; the moment it does, the card grows again by however much it grew
 * by. `tests/lib/nodeLayout.spec.ts` asserts the inequality directly, so a
 * future font-size or pill-padding change fails there instead of quietly
 * shipping a taller card.
 */
export const NODE_CARD_BODY_HEIGHT = NODE_CARD_HEADLINE_HEIGHT + NODE_CARD_ROW_GAP + NODE_CARD_ROW2_HEIGHT

/**
 * The content box: the taller of the tile and the body column. 44 px — the
 * tile, with 6.2 px of the body column's band left over beneath it.
 *
 * The `max` is the load-bearing part. *Summing* the tile and the body (the
 * shape this equation had while row 1 was forced to the tile's edge) is
 * what produced 88.2 px, of which 23.2 px was slack hanging under the tile
 * with nothing in it.
 */
export const NODE_CARD_CONTENT_HEIGHT = Math.max(NODE_CARD_AVATAR_SIZE, NODE_CARD_BODY_HEIGHT)

/**
 * Card height in content-layer pixels, *derived* from the parts above rather
 * than authored beside them: border + block padding + the content box. 63 px.
 *
 *     1.5 × 2  border                      =  3
 *     8   × 2  block padding               = 16
 *     max(44 tile, 37.8 body) content box  = 44
 *                                     total = 63
 *
 * **63 px is the floor for this tile, not a preference.** The content box
 * cannot be shorter than the 44 px tile standing in it, so the tile is the
 * only lever below 63 and the operator has not rescinded it — the padding
 * and the un-forced row height are where the height had to come from.
 */
export const NODE_CARD_HEIGHT = NODE_CARD_BORDER * 2 + NODE_CARD_PADDING_BLOCK * 2 + NODE_CARD_CONTENT_HEIGHT

/**
 * Padding between the rendered content's bounding box and the `viewBox` set
 * on the root `<svg>`; doubles as the margin pan/zoom `fit()` leaves.
 */
export const SVG_PADDING = 20

/** Card top-left, in content-layer pixels. */
export interface NodePosition {
    x: number
    y: number
}

/** A node's centre, in the SVG's own user space. */
export interface NodeCentre {
    x: number
    y: number
}

/**
 * Parse a Mermaid node DOM id (e.g. `flowchart-n11-2`) back to the wire
 * agent id (`11`). Snapshot-tested so we catch Mermaid upgrades that change
 * the id format.
 */
export function nodeIdFromMermaidId(domId: string): number | null {
    const m = /^flowchart-(n\d+)-\d+$/.exec(domId)
    if (m === null) return null
    const n = Number(m[1].slice(1))
    return Number.isFinite(n) ? n : null
}

/**
 * Parse a Mermaid edge DOM id back to its `[source, target]` agent ids.
 *
 * Mermaid 10 emits `L-n<src>-n<tgt>-<idx>`; the older Mermaid 9 form
 * `flowchart-n<src>_n<tgt>-<idx>` is still accepted. The difference is
 * internal to Mermaid and not part of any public contract, so the regex only
 * has to extract the two agent ids.
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
 * single-argument `translate(a)` form is legal SVG and would silently place
 * every card at y = 0 if ignored, so both are handled.
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
 * Origin of a `viewBox` string, i.e. its `min-x` / `min-y` pair. `null` for
 * a missing or unparseable `viewBox` so callers bail out instead of
 * positioning every card at the origin.
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
 * Read every `g.node`'s own `translate(cx, cy)` — the node's *centre* in the
 * SVG's own user space, keyed by wire agent id.
 *
 * The primitive both consumers need: `measureNodePositions` turns a centre
 * into a card top-left and `lib/edgeGeometry.ts` needs the same centre to
 * re-anchor an edge endpoint onto the card's border. Reading it once keeps
 * the two from disagreeing about what "the node's centre" is.
 *
 * Nodes whose id or transform can't be read are skipped rather than guessed
 * at, so a Mermaid upgrade that changes either format degrades to "fewer
 * cards" instead of "cards in a heap at (0, 0)".
 */
export function measureNodeCentres(svg: SVGSVGElement): Record<number, NodeCentre> {
    const out: Record<number, NodeCentre> = {}
    svg.querySelectorAll('g.node').forEach((nodeEl) => {
        const id = nodeIdFromMermaidId(nodeEl.id)
        if (id === null) return
        const centre = parseTranslate(nodeEl.getAttribute('transform'))
        if (centre === null) return
        out[id] = { x: centre.x, y: centre.y }
    })
    return out
}

/**
 * Measure every `g.node` in a freshly rendered Mermaid SVG and return the
 * card top-left for each, keyed by wire agent id.
 *
 * Must run *after* the root `viewBox` / `width` / `height` have been pinned
 * (see `composables/useMermaidRender.ts`) — the viewBox origin is the only
 * offset between SVG user space and content-layer pixels.
 */
export function measureNodePositions(
    svg: SVGSVGElement,
    cardWidth: number = NODE_CARD_WIDTH,
    cardHeight: number = NODE_CARD_HEIGHT,
): Record<number, NodePosition> {
    const out: Record<number, NodePosition> = {}
    const origin = viewBoxOrigin(svg.getAttribute('viewBox'))
    if (origin === null) return out
    for (const [id, centre] of Object.entries(measureNodeCentres(svg))) {
        out[Number(id)] = {
            x: centre.x - origin.x - cardWidth / 2,
            y: centre.y - origin.y - cardHeight / 2,
        }
    }
    return out
}

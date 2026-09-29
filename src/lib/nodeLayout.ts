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
 * Card footprint in content-layer pixels — the single source of truth
 * for every consumer of the box.
 *
 * **Three consumers, one number.** `measureNodePositions` turns a node
 * centre into a card top-left with it, `useMermaidRender` grows each
 * `g.node` rect to it so dagre's spacing accounts for the card, and
 * `reanchorEdges` walks each arrow tip onto its border with the same
 * half-extents. They are all this module, so they cannot disagree
 * with each other. The fourth consumer — the CSS that actually paints
 * the box — used to carry its own `width: 240px; height: 76px`
 * literal, which is the seam the two earlier regressions came through:
 * resizing the card in one place left the other three describing a box
 * that no longer existed, and the arrowheads detached. So the card
 * takes its `width` / `height` as **inline** declarations built from
 * these constants (`AgentNodeCard.vue → cardStyle`), and `style.css`
 * carries no footprint literal at all. `tests/style.spec.ts` asserts
 * that, and `tests/lib/nodeLayout.spec.ts` asserts the arithmetic.
 *
 * 240 px of width is fixed by the Variant M prototype — the card never
 * grows with the agent name (the name ellipsises instead).
 */
export const NODE_CARD_WIDTH = 240

/**
 * Avatar tile edge, in px — the package's `size="md"`
 * (`2.75rem`, i.e. 44 px at the default root size). The operator asked
 * for the bigger tile and has not rescinded it, so it is the one term
 * of the card's height that is *not* negotiable here.
 *
 * **Why the tile is pinned in px rather than left to the package's
 * `rem`.** `.avatar--md` is `2.75rem`, so its rendered edge tracks the
 * *root* font size, while the card's height is a fixed px box. A host
 * that set `html { font-size: 18px }` would therefore paint a 49.5 px
 * tile inside a box derived from 44 px, and the tile would spill out of
 * the content box it is supposed to fill. The card therefore states the
 * edge itself (`.tg-node-card-avatar { inline-size: var(--tg-avatar-size) }`)
 * from the same constant `NODE_CARD_CONTENT_HEIGHT` below reads, so the
 * painted tile and the box that has to contain it cannot drift.
 *
 * **What it is now, structurally.** The tile is the card's *height
 * floor*: `NODE_CARD_CONTENT_HEIGHT` is `max(44, body)`, and the body
 * is 37.8 px, so the tile sets the content box and the card is exactly
 * as short as a 44 px tile allows. That is the whole arithmetic behind
 * the 63 px card — see `NODE_CARD_HEIGHT`.
 */
export const NODE_CARD_AVATAR_SIZE = 44

/**
 * The card's block padding, its border, and the gap between the two
 * rows — three of the terms of `NODE_CARD_HEIGHT` below. They are named
 * (rather than inlined into the sum) so the height reads as the
 * equation the stylesheet implements, and so a future resize changes
 * one line.
 *
 * `1.5px` is the Variant M prototype's own border, unchanged. The
 * block padding has come down from the prototype's `9px` to `8px` and
 * the row gap from `4px` to `3px`, for the reasons the operator gave:
 * the card read too tall, and the space between the headline and the
 * badges read as a hole rather than as a gap. The prototype sized both
 * for a **32 px** tile; this card carries the 44 px one, so the padding
 * that framed a smaller tile is not the padding that frames this one.
 *
 * **What the four insets render at, measured** in a headless browser in
 * both themes on the 63 px card: 9 px from the top border to the tile,
 * 10 px from the tile to the bottom border, and 14 px on the left and
 * right (1 px painted border + 8 / 13 px padding). The body column is
 * 6.2 px shorter than the tile it stands beside, so *its* bottom inset
 * reads 16.2 px — that asymmetry is the price of top-aligning the
 * headline, and it is the only one the resize introduces.
 *
 * Chromium rounds the 1.5 px border down to a whole pixel at every
 * device-pixel-ratio; the half pixel that costs lands as slack inside
 * the `border-box` height, so the bottom inset reads one pixel deeper
 * than the top. That 1 px is pre-existing — the 88.2 px card measured
 * 10 / 11 / 14 / 14, the 115 px one 10 / 11 / 14 / 14, both to the
 * body column, which was then the full-height element rather than the
 * tile — and it is a browser rounding artefact, not a padding the
 * stylesheet got wrong. Changing the declared border to a whole pixel
 * would move the card's visual weight in engines I cannot measure here,
 * to fix a difference no one can see.
 */
export const NODE_CARD_BORDER = 1.5
export const NODE_CARD_PADDING_BLOCK = 8
export const NODE_CARD_ROW_GAP = 3

/**
 * The status row's height, derived from the two boxes that sit in it.
 *
 * **This replaces a worst-case reserve, and that is the whole point.**
 * The row used to claim `min-height: 46px` — the status pill's
 * *three*-line height — so that one `NODE_CARD_HEIGHT` could be correct
 * for every agent, which is what a fixed-box card needs when its status
 * can wrap. It is measured dead space: the longest label
 * `statusLabel()` can produce, "awaiting final approval", needs
 * 45.563 px (3 × the 13.2 px line box + 6 px of block padding), and
 * **seven of the eleven** labels are one line (19.188 px). So every
 * card — including the seven that had nothing to wrap — carried 26.8 px
 * of empty row under the pill, and `NODE_CARD_HEIGHT` came out at 115
 * where its own contents add up to 88.2. That is the 28 px the operator
 * read as "the paddings are off": the top and inline padding were
 * already right, and the bottom *looked* wrong because there was a hole
 * in front of it.
 *
 * The reserve bought one thing: that a label which wraps cannot grow
 * past a fixed box. It is no longer needed, because the pill no longer
 * wraps. `.tg-node-card-pill` takes the label on **one** line
 * (`white-space: nowrap` + `text-overflow: ellipsis`, the treatment
 * `.tg-chat-row-status` already used for exactly this reason) and
 * `min-width: 0`, which is the part that actually makes it work: a
 * flex item's automatic minimum size is its min-content width, so
 * without it a `nowrap` pill refuses to shrink below its full label and
 * pushes the edge badges off the card. The label survives intact in the
 * DOM — `textContent`, the `title` on the card's pill, and the detail
 * panel all carry it in full — so nothing is lost, and a card can no
 * longer overflow however long a status string the wire grows.
 *
 * So the row is now exactly as tall as its content, and the content is
 * the taller of the two boxes it holds. Measuring both is what keeps
 * the equation true: raise the badge's font size and the row, the card
 * and the dagre spacing all move together.
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
 * **Why it is a constant, and not the tile's edge any more.** Row 1 used
 * to be *forced* to `NODE_CARD_AVATAR_SIZE` and the name centred inside
 * it, so the two centres coincided at Δ = 0.000 px. That is exactly why
 * the headline read as sitting low: a 15.6 px line box centred in a
 * 44 px band hangs 14.2 px below the tile's top edge, and the operator
 * asked for the headline higher. The requirement is therefore
 * **deliberately reversed** — row 1 is the headline's natural height and
 * is top-aligned against the tile (`.tg-node-card { align-items:
 * flex-start }`), so the name's top edge now sits on the tile's *top*
 * edge instead of on its centre line.
 *
 * The number is the stylesheet's own — 13 px at `line-height: 1.2` — and
 * it has to be stated here because the height below is a sum, and a sum
 * whose term is guessed is a sum that lies. The one thing that could
 * make it wrong is a two-line name, and `.tg-node-card-name` is
 * `white-space: nowrap` + `text-overflow: ellipsis` (asserted in
 * `tests/lib/nodeLayout.spec.ts`), so it is one line for every agent
 * name the wire can carry.
 */
export const NODE_CARD_HEADLINE_FONT_SIZE = 13
export const NODE_CARD_HEADLINE_LINE_HEIGHT = 1.2
export const NODE_CARD_HEADLINE_HEIGHT = NODE_CARD_HEADLINE_FONT_SIZE * NODE_CARD_HEADLINE_LINE_HEIGHT

/**
 * The body column — headline, row gap, status row — at 37.8 px.
 *
 * Exported because the invariant worth stating is a comparison, not a
 * number: **the body must not exceed the tile.** While it does not, the
 * tile is the height floor and the card is exactly as short as a 44 px
 * tile can be; the moment it does, the card grows again by however much
 * it grew by. `tests/lib/nodeLayout.spec.ts` asserts the inequality
 * directly, so a future font-size or pill-padding change that breaks it
 * fails there instead of quietly shipping a taller card.
 */
export const NODE_CARD_BODY_HEIGHT = NODE_CARD_HEADLINE_HEIGHT + NODE_CARD_ROW_GAP + NODE_CARD_ROW2_HEIGHT

/**
 * The content box: the taller of the tile and the body column. 44 px —
 * the tile, with 6.2 px of the body column's band left over beneath it.
 *
 * The `max` is the load-bearing part. *Summing* the tile and the body
 * (the shape this equation had while row 1 was forced to the tile's
 * edge) is what produced 88.2 px, of which 23.2 px was slack hanging
 * under the tile with nothing in it.
 */
export const NODE_CARD_CONTENT_HEIGHT = Math.max(NODE_CARD_AVATAR_SIZE, NODE_CARD_BODY_HEIGHT)

/**
 * Card height in content-layer pixels, *derived* from the parts above
 * rather than authored beside them: border + block padding + the content
 * box. 63 px.
 *
 *     1.5 × 2  border                      =  3
 *     8   × 2  block padding               = 16
 *     max(44 tile, 37.8 body) content box  = 44
 *                                     total = 63
 *
 * **63 px is the floor for this tile, not a preference.** The content
 * box cannot be shorter than the 44 px tile standing in it, so the only
 * lever left below 63 is the tile: 59 px at 6 px of padding, 55 at 4,
 * 47 at none. The operator asked for the 44 px tile and has not
 * rescinded it, so the padding and the forced row height are where the
 * height had to come from — and the row height was the bigger half of
 * it, because un-forcing row 1 is worth 23.2 px on its own (88.2 → 65
 * with the prototype's 9 px padding still in place).
 */
export const NODE_CARD_HEIGHT = NODE_CARD_BORDER * 2 + NODE_CARD_PADDING_BLOCK * 2 + NODE_CARD_CONTENT_HEIGHT

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

/** A point in the SVG's own user space. */
export interface NodeCentre {
    x: number
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
 * Read every `g.node`'s own `translate(cx, cy)` — the node's *centre*
 * in the SVG's own user space, keyed by wire agent id.
 *
 * This is the primitive both consumers need: `measureNodePositions`
 * turns a centre into a card top-left in content-layer pixels, and
 * `lib/edgeGeometry.ts` needs the same centre to re-anchor an edge
 * endpoint onto the card's border. Reading it once per consumer would
 * let the two disagree about what "the node's centre" is.
 *
 * Nodes whose id or transform can't be read are skipped rather than
 * guessed at, so a Mermaid upgrade that changes either format degrades
 * to "fewer cards" instead of "cards in a heap at (0, 0)".
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
 * Measure every `g.node` in a freshly rendered Mermaid SVG and return
 * the card top-left for each, keyed by wire agent id.
 *
 * Must run *after* the root `viewBox` / `width` / `height` have been
 * pinned (see `composables/useMermaidRender.ts`) — the viewBox origin
 * is the only offset between SVG user space and content-layer pixels.
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

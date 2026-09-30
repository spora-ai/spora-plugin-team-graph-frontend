import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentNodeCard from '../../src/components/AgentNodeCard.vue'
import { NODE_CARD_AVATAR_SIZE, NODE_CARD_BODY_HEIGHT, NODE_CARD_CONTENT_HEIGHT, NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'
import type { GraphNode } from '../../src/types'

/**
 * `AgentNodeCard.vue` — the Variant M card.
 *
 * The card is the visible half of Option C: Mermaid positions the
 * node, Vue paints it. These tests pin the three things that make it
 * a faithful reproduction of
 * `prototype-m-edge-counts.html`:
 *
 *   1. the shared `@spora-ai/components` primitives are really used
 *      (`AgentAvatar` tile, `Icon` arrows) rather than a hand-rolled
 *      lookalike,
 *   2. the edge badges pick the zero variant **per badge**, so a
 *      "0 in / 1 out" entry point stays distinguishable from a hub,
 *   3. the card is positioned by the transform the overlay hands it
 *      and is reachable by keyboard.
 */

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id: 7,
        name: 'Marketing Lead',
        role: null,
        picture_url: null,
        status: 'COMPLETED',
        active_chats: 0,
        recent_chats_24h: 0,
        profile_picture: {
            kind: 'avatar',
            archetype: 'assistant',
            variant_key: 'v0',
            palette_key: 'teal',
            bg_color: '#0F766E',
            fg_color: '#F0FDFA',
        },
        ...overrides,
    }
}

/** The visible count is the badge's text minus the sr-only direction label. */
function countOf(badge: ReturnType<ReturnType<typeof mountCard>['findAll']>[number]): string {
    return badge.text().slice(badge.find('.sr-only').text().length)
}

function mountCard(props: Partial<InstanceType<typeof AgentNodeCard>['$props']> = {}, node = makeNode()) {
    return mount(AgentNodeCard, {
        props: {
            node,
            inbound: 2,
            outbound: 3,
            selected: false,
            adjacent: false,
            dimmed: false,
            x: 10,
            y: 20,
            ...props,
        },
    })
}

describe('AgentNodeCard — structure', () => {
    it('renders the shared AgentAvatar tile with the wire profile_picture', () => {
        const wrapper = mountCard()
        // The package's Avatar root class, not a plugin-invented one.
        const tile = wrapper.find('.avatar')
        expect(tile.exists()).toBe(true)
        // 44 px tile — `.avatar--md`, the package's documented step up
        // from the 32 px `.avatar--sm` the card used to sit at.
        expect(tile.classes()).toContain('avatar--md')
        // Wire snake_case coerced through lib/agentAvatar.ts.
        const img = wrapper.find('[data-testid="avatar-archetype"]')
        expect(img.exists()).toBe(true)
        expect(img.attributes('style')).toContain('#0F766E')
    })

    it('takes its own box from the layout constants, not from the stylesheet', () => {
        /*
         * The single-source-of-truth guard. `style.css` has no `width` /
         * `height` on `.tg-node-card` any more; the four consumers of the
         * footprint (the painted box, the overlay's `translate3d`, the
         * grown `g.node` rect, the edge border walk) all read
         * `NODE_CARD_WIDTH` / `NODE_CARD_HEIGHT`, and this is the fourth
         * one. Asserted through the rendered inline style, so a
         * regression in either the constant or the component fails here.
         */
        const style = mountCard().find('.tg-node-card').attributes('style') ?? ''
        expect(style).toContain(`width: ${NODE_CARD_WIDTH}px`)
        expect(style).toContain(`height: ${NODE_CARD_HEIGHT}px`)
    })

    it('paints the tightened box: 240 × 63, floored by the 44 px tile', () => {
        /*
         * The card the operator asked for: headline higher, less room
         * between the headline and the badges, less card. 88.2 → 63 px, and
         * the number is pinned here as well as in `nodeLayout.spec.ts`
         * because this is the element the box is actually painted on — a
         * constant that changed without reaching the card would still pass
         * every other test in the suite.
         *
         * The floor is the tile: 1.5 × 2 border + 8 × 2 block padding +
         * max(44 tile, 37.8 body) = 63. Nothing below 63 is reachable
         * without shrinking the tile, which the operator has not asked
         * for.
         */
        const card = mountCard().find('.tg-node-card')
        const style = card.attributes('style') ?? ''
        expect(NODE_CARD_WIDTH).toBe(240)
        expect(NODE_CARD_HEIGHT).toBe(63)
        expect(style).toContain('width: 240px')
        expect(style).toContain('height: 63px')
        expect(NODE_CARD_CONTENT_HEIGHT).toBe(NODE_CARD_AVATAR_SIZE)
        expect(NODE_CARD_BODY_HEIGHT).toBeLessThan(NODE_CARD_AVATAR_SIZE)
    })

    it('publishes the tile edge so the tile and the card height cannot drift', () => {
        /*
         * `--tg-avatar-size` is read by `.tg-node-card-avatar` for the
         * tile's own edge, in px, and `NODE_CARD_AVATAR_SIZE` is the term
         * `NODE_CARD_CONTENT_HEIGHT` floors the card's height on — so the
         * painted tile and the box that has to contain it are one number.
         * It used to be read by `.tg-node-card-row1` too, which is how
         * the headline was centred on the tile; that alignment is
         * deliberately gone, so this is now the only consumer.
         */
        const style = mountCard().find('.tg-node-card').attributes('style') ?? ''
        expect(style).toContain(`--tg-avatar-size: ${NODE_CARD_AVATAR_SIZE}px`)
    })

    it('falls back to the initials tile when the node has no usable picture', () => {
        const wrapper = mountCard({}, makeNode({ profile_picture: { palette_key: 'slate', bg_color: '', fg_color: '' } }))
        expect(wrapper.find('[data-testid="avatar-initials"]').exists()).toBe(true)
    })

    it('carries the agent palette on the card so the initials tile is not slate', () => {
        /*
         * The regression: an agent with no archetype drops to the
         * package's initials branch, which paints
         * `var(--spora-avatar-bg, #475569)` — so the green agent from
         * the dashboard rendered as a grey tile on the canvas. The two
         * custom properties are the package's own theming hook, set
         * from the backend-resolved pair on the wire node.
         */
        const wrapper = mountCard(
            {},
            makeNode({
                name: 'Spora Core Agent',
                profile_picture: {
                    kind: 'avatar',
                    archetype: null,
                    variant_key: null,
                    palette_key: 'green',
                    bg_color: '#15803D',
                    fg_color: '#F0FDF4',
                },
            }),
        )
        expect(wrapper.find('[data-testid="avatar-initials"]').exists()).toBe(true)
        const style = wrapper.find('.tg-node-card').attributes('style') ?? ''
        expect(style).toContain('--spora-avatar-bg: #15803D')
        expect(style).toContain('--spora-avatar-fg: #F0FDF4')
    })

    it('carries the palette for an archetype agent too (the branch that already worked)', () => {
        const style = mountCard().find('.tg-node-card').attributes('style') ?? ''
        expect(style).toContain('--spora-avatar-bg: #0F766E')
        expect(style).toContain('--spora-avatar-fg: #F0FDFA')
    })

    it('omits the palette hook when the wire carries no usable colours', () => {
        const style = mountCard(
            {},
            makeNode({ profile_picture: { palette_key: 'slate', bg_color: '', fg_color: '' } }),
        )
            .find('.tg-node-card')
            .attributes('style')
        // The package's own slate fallbacks apply; nothing undefined is
        // written into a custom property.
        expect(style).not.toContain('--spora-avatar-bg')
    })

    it('lays out the Variant M rows: name on top, pill + badges underneath', () => {
        const wrapper = mountCard()
        expect(wrapper.find('.tg-node-card-row1 .tg-node-card-name').text()).toBe('Marketing Lead')
        const row2 = wrapper.find('.tg-node-card-row2')
        expect(row2.find('.tg-status-pill').exists()).toBe(true)
        expect(row2.findAll('.tg-edge-badge')).toHaveLength(2)
    })

    it('positions itself with the translate3d the overlay measured', () => {
        const wrapper = mountCard({ x: 123, y: 456 })
        expect(wrapper.find('.tg-node-card').attributes('style')).toContain('translate3d(123px, 456px, 0)')
    })

    it('carries the node id for the canvas / e2e hooks', () => {
        const wrapper = mountCard()
        expect(wrapper.find('.tg-node-card').attributes('data-node-id')).toBe('7')
        expect(wrapper.find('.tg-node-card').attributes('data-testid')).toBe('tg-node-7')
    })
})

describe('AgentNodeCard — status pill', () => {
    it('reuses the plugin\'s status slug class and label (no second colour map)', () => {
        const wrapper = mountCard({}, makeNode({ status: 'AWAITING_SUB_AGENTS' }))
        const pill = wrapper.find('.tg-status-pill')
        expect(pill.classes()).toContain('tg-status-awaiting')
        expect(pill.text()).toBe('awaiting sub-agent')
    })

    it('renders the nullish-status fallback as "idle" on the completed slug', () => {
        const wrapper = mountCard({}, makeNode({ status: null }))
        const pill = wrapper.find('.tg-status-pill')
        expect(pill.classes()).toContain('tg-status-completed')
        expect(pill.text()).toBe('idle')
    })

    /**
     * All eleven wire statuses, on the card that has to stay one fixed box.
     *
     * The card's status row is sized to a *single* line, and the pill
     * ellipsises whatever does not fit — so the label is still in the DOM
     * in full (a screen reader reads it whole, and the `title` shows it on
     * hover) even where the visible text is truncated. That is the whole
     * trade this card makes for being a fixed box, and this is the test
     * that says the *label* is never lost even when the pixels are.
     *
     * The rendered pixel width/height of the pill is a browser
     * measurement (reported in the change that introduced this); what is
     * assertable here is that every status reaches the DOM whole, carries
     * the single-line class, and hands the full string to `title`.
     */
    it('renders all 11 statuses in full, on a single-line pill, with the label in the title', () => {
        const ALL: GraphNode['status'][] = [
            'RUNNING',
            'PENDING_APPROVAL',
            'AWAITING_SUB_AGENTS',
            'AWAITING_INPUT',
            'AWAITING_FINAL_APPROVAL',
            'APPROVED',
            'FAILED',
            'ABORTED',
            'COMPLETED',
            'CANCELLED',
            'QUEUED',
        ]
        const labels = new Set<string>()
        for (const status of ALL) {
            const wrapper = mountCard({}, makeNode({ status }))
            const pill = wrapper.find('.tg-status-pill')
            // `WireStatus` is nullable, so it cannot be a vitest assertion
            // message; every entry here is a real enum case, so `String()`
            // is exact.
            const which = String(status)
            // The card's own class is what makes the label one line; it has
            // to be on the element, not merely implied by the shared pill.
            expect(pill.classes(), which).toContain('tg-node-card-pill')
            const text = pill.text().trim()
            expect(text.length, which).toBeGreaterThan(0)
            expect(pill.attributes('title'), which).toBe(text)
            labels.add(text)
        }
        // 11 statuses, 11 distinct labels — none of them collapses onto
        // another's text (three of them share the `awaiting` colour slug,
        // so their text is the only thing that tells them apart).
        expect(labels.size).toBe(11)
        // The label that used to need a three-line reserve.
        expect(labels).toContain('awaiting final approval')
    })
})

describe('AgentNodeCard — edge-degree badges', () => {
    it('uses the inbound (green) and outbound (violet) variants for non-zero counts', () => {
        const wrapper = mountCard({ inbound: 2, outbound: 3 })
        const [inbound, outbound] = wrapper.findAll('.tg-edge-badge')
        expect(inbound.classes()).toContain('tg-edge-badge--in')
        expect(countOf(inbound)).toBe('2')
        expect(outbound.classes()).toContain('tg-edge-badge--out')
        expect(countOf(outbound)).toBe('3')
    })

    it('marks a 0-inbound node as an entry point without silencing its outbound count', () => {
        // The prototype's "Running · 0 in / 1 out (entry-point agent)".
        const wrapper = mountCard({ inbound: 0, outbound: 1 })
        const [inbound, outbound] = wrapper.findAll('.tg-edge-badge')
        expect(inbound.classes()).toContain('tg-edge-badge--zero')
        expect(countOf(inbound)).toBe('0')
        expect(outbound.classes()).toContain('tg-edge-badge--out')
    })

    it('marks a 0-outbound node as a terminus', () => {
        const wrapper = mountCard({ inbound: 1, outbound: 0 })
        const [inbound, outbound] = wrapper.findAll('.tg-edge-badge')
        expect(inbound.classes()).toContain('tg-edge-badge--in')
        expect(outbound.classes()).toContain('tg-edge-badge--zero')
    })

    it('marks an isolated node as zero on both sides', () => {
        const wrapper = mountCard({ inbound: 0, outbound: 0 })
        for (const badge of wrapper.findAll('.tg-edge-badge')) {
            expect(badge.classes()).toContain('tg-edge-badge--zero')
        }
    })

    it('renders the arrows through the shared Icon component, hidden from AT', () => {
        const wrapper = mountCard()
        const icons = wrapper.findAll('.tg-edge-badge .spora-icon')
        expect(icons).toHaveLength(2)
        for (const icon of icons) {
            expect(icon.attributes('aria-hidden')).toBe('true')
        }
        // First badge is inbound (up arrow), second is outbound (down).
        expect(icons[0].find('path').attributes('d')).toBe('M12 20V6M6 12l6-6 6 6')
        expect(icons[1].find('path').attributes('d')).toBe('M12 4v14M18 12l-6 6-6-6')
    })

    it('labels the badges for screen readers', () => {
        const [inbound, outbound] = mountCard().findAll('.tg-edge-badge')
        expect(inbound.find('.sr-only').text()).toBe('inbound')
        expect(outbound.find('.sr-only').text()).toBe('outbound')
    })
})

describe('AgentNodeCard — selection state', () => {
    it('reflects selected / adjacent / dimmed as CSS classes', () => {
        const wrapper = mountCard({ selected: true, adjacent: false, dimmed: false })
        expect(wrapper.find('.tg-node-card').classes()).toContain('is-selected')
        expect(wrapper.find('.tg-node-card').attributes('aria-pressed')).toBe('true')

        const adjacent = mountCard({ adjacent: true })
        expect(adjacent.find('.tg-node-card').classes()).toContain('is-adjacent')

        const dimmed = mountCard({ dimmed: true })
        expect(dimmed.find('.tg-node-card').classes()).toContain('is-dimmed')
    })

    it('emits toggle on click', async () => {
        const wrapper = mountCard()
        await wrapper.find('.tg-node-card').trigger('click')
        expect(wrapper.emitted('toggle')).toEqual([[7]])
    })

    it('emits toggle when the click lands on a child, not just the card root', async () => {
        // The card's body / rows are `<span>`s so the `<button>` keeps
        // its phrasing-content model; the handler is on the button
        // itself, so a click on any descendant still bubbles up.
        const wrapper = mountCard()
        await wrapper.find('.tg-node-card-name').trigger('click')
        await wrapper.find('.tg-edge-badge').trigger('click')
        expect(wrapper.emitted('toggle')).toEqual([[7], [7]])
    })

    it('is a native <button type="button">, so the browser owns Enter/Space activation', () => {
        /*
         * The card used to be a `<div role="button" tabindex="0">` with
         * `@keydown.enter` / `@keydown.space` handlers. happy-dom (like
         * a raw DOM) does not run a button's activation behaviour, so
         * this test cannot fire a synthetic keypress the way the old one
         * did — what it pins instead is the contract that replaces it:
         * a real button needs no `role`, no `tabindex` and no key
         * handlers, and a `keydown` handler left in place would
         * double-fire the toggle on top of the browser's own click.
         */
        const card = mountCard().find('.tg-node-card')
        expect(card.element.tagName).toBe('BUTTON')
        expect(card.attributes('type')).toBe('button')
        // No ARIA role and no tabindex: both are native on <button>.
        expect(card.attributes('role')).toBeUndefined()
        expect(card.attributes('tabindex')).toBeUndefined()
    })

    it('opts out of pan gestures so a click selects instead of dragging', () => {
        const wrapper = mountCard()
        // usePanZoom skips pointer capture for `button` and for
        // [data-tg-no-pan] — the marker keeps the opt-out explicit and
        // independent of the element type.
        expect(wrapper.find('.tg-node-card').attributes('data-tg-no-pan')).toBe('')
    })
})

describe('AgentNodeCard — long names', () => {
    it('keeps the full name in the DOM (CSS ellipsises it) and in the title attribute', () => {
        const long = 'Customer Comms Coordinator Agent'
        const wrapper = mountCard({}, makeNode({ name: long }))
        expect(wrapper.find('.tg-node-card-name').text()).toBe(long)
        expect(wrapper.find('.tg-node-card-name').attributes('title')).toBe(long)
    })
})

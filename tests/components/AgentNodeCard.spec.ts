import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentNodeCard from '../../src/components/AgentNodeCard.vue'
import { NODE_CARD_AVATAR_SIZE, NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from '../../src/lib/nodeLayout'
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

    it('publishes the tile edge so the tile and the headline row cannot drift', () => {
        // `--tg-avatar-size` is read by both `.tg-node-card-avatar`
        // (the tile's own edge, in px) and `.tg-node-card-row1` (the row
        // the name is centred in). One number for both is what makes the
        // headline land on the tile's centre line at any font size.
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

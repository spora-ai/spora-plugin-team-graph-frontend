import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentDetailPanel from '../../src/components/AgentDetailPanel.vue'
import { useSelectionStore } from '../../src/stores/selection'
import type { GraphNode, GraphPayload } from '../../src/types'

/**
 * `AgentDetailPanel` edge-row avatar tiles.
 *
 * The tiles used to be hand-written `<div>`s: a status-coloured
 * circle with the node's initials. They are now the shared
 * `@spora-ai/components` `AgentAvatar`, so what is worth testing here
 * is *this plugin's mapping* onto the component's props — not the
 * package's internals, which ship their own tests.
 *
 * Three mapping decisions are pinned below:
 *
 *   1. A node whose wire `profile_picture` carries the `kind`
 *      discriminant renders the package's archetype branch.
 *   2. A node with no picture — or a legacy envelope with the three
 *      palette keys but no `kind` — renders the initials branch, and
 *      the letters match what the deleted `initialsFor()` helper
 *      produced (same shared `useInitials`, so same output).
 *   3. The status ring resolves through the package's `STATUS_PALETTE`
 *      where it can, and through the plugin's own `statusColor()` for
 *      the five statuses the palette does not cover. A test asserts
 *      the *uncovered* statuses do NOT collapse onto the neutral
 *      swatch, because losing that colour coverage is the one
 *      regression this swap could cause.
 */

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id: 11,
        name: 'Lead',
        role: 'Lead',
        picture_url: null,
        status: 'RUNNING',
        active_chats: 1,
        recent_chats_24h: 4,
        // The pre-swap shape: three palette keys, no `kind`. This is
        // what the endpoint's `profile_picture` looked like before the
        // type was widened, and what every existing fixture carries.
        profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' },
        ...overrides,
    }
}

/** A node with a complete archetype picture, as `NodeResolver` sends it. */
function withArchetype(overrides: Partial<GraphNode> = {}): GraphNode {
    return makeNode({
        ...overrides,
        profile_picture: {
            palette_key: 'indigo',
            bg_color: '#4338CA',
            fg_color: '#EEF2FF',
            kind: 'avatar',
            archetype: 'assistant',
            variant_key: 'v0',
            image_url: null,
            image_updated_at: null,
        },
    })
}

function makeGraph(target: GraphNode): GraphPayload {
    return {
        principal: { id: 1, type: 'user', name: 'Ada', is_current_user_owned: true },
        // Node 1 is the selected agent; `target` is the far end of
        // every edge, so it is the one that gets a tile.
        nodes: [makeNode({ id: 1, name: 'Root' }), target],
        edges: [
            {
                id: `1->${target.id}`,
                source: 1,
                target: target.id,
                op: 'sub_agent',
                configured: true,
                count_24h: 2,
                last_invoked_at: '2026-09-28T10:00:00Z',
            },
        ],
        generated_at: '2026-09-28T12:00:00Z',
    }
}

/** Mount the panel with node 1 selected and the first tile returned. */
async function mountFirstTile(target: GraphNode) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSelectionStore().setSelected(1)
    const wrapper = mount(AgentDetailPanel, {
        props: { graph: makeGraph(target) },
        global: { plugins: [pinia] },
    })
    // The panel fires three fetches for the selected agent on mount;
    // none of them feed the edge rows, so we only need them settled.
    await flushPromises()
    return wrapper
}

describe('AgentDetailPanel avatar tiles', () => {
    it('renders the shared AgentAvatar archetype branch for a node with a full picture', async () => {
        const wrapper = await mountFirstTile(withArchetype({ name: 'Blake' }))

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        expect(tile.exists()).toBe(true)
        // The package's own marker for the archetype branch.
        expect(tile.find('[data-testid="avatar-archetype"]').exists()).toBe(true)
        expect(tile.find('[data-testid="avatar-initials"]').exists()).toBe(false)
        // `size="sm"` is the closest package size to the 28 px tile
        // the panel used to draw.
        expect(tile.find('.avatar--sm').exists()).toBe(true)
        wrapper.unmount()
    })

    it('renders the shared AgentAvatar image branch for an uploaded picture', async () => {
        const wrapper = await mountFirstTile(
            makeNode({
                name: 'Casey',
                profile_picture: {
                    palette_key: '',
                    bg_color: '',
                    fg_color: '',
                    kind: 'image',
                    archetype: null,
                    variant_key: null,
                    image_url: 'https://cdn.example/casey.png',
                    image_updated_at: '2026-09-28T09:00:00Z',
                },
            }),
        )

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        const img = tile.find('[data-testid="avatar-image"] img')
        expect(img.exists()).toBe(true)
        // The package appends `image_updated_at` as a `?v=` cache
        // buster so a re-uploaded picture is not served from cache.
        expect(img.attributes('src')).toBe(
            'https://cdn.example/casey.png?v=2026-09-28T09%3A00%3A00Z',
        )
        wrapper.unmount()
    })

    it('falls back to initials when the node carries no picture', async () => {
        const wrapper = await mountFirstTile(makeNode({ name: 'Dakota' }))

        const initials = wrapper.find(
            '[data-testid="tg-outbound-section"] .tg-agent-tile [data-testid="avatar-initials"]',
        )
        expect(initials.exists()).toBe(true)
        // The deleted `initialsFor()` helper and the package both route
        // through the shared `useInitials`, so a single-word name
        // yields two letters, not one.
        expect(initials.text()).toBe('DA')
        wrapper.unmount()
    })

    it('falls back to initials for a legacy picture with no `kind` discriminant', async () => {
        // The plugin's `GraphNode.profile_picture` type keeps the three
        // palette keys required and the rest optional, so a payload
        // without `kind` still typechecks. Passing it through verbatim
        // would make `Avatar` guess; `toProfilePicture` returns null
        // instead, which is the initials branch.
        const wrapper = await mountFirstTile(makeNode({ name: 'Ellis' }))

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        expect(tile.find('[data-testid="avatar-archetype"]').exists()).toBe(false)
        expect(tile.find('[data-testid="avatar-initials"]').text()).toBe('EL')
        wrapper.unmount()
    })

    it('renders "?" initials and an "Unknown" label for a dangling edge', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        useSelectionStore().setSelected(1)
        const graph = makeGraph(makeNode({ id: 2 }))
        // Point the edge at an agent that is not in the payload.
        graph.edges[0]!.target = 999
        const wrapper = mount(AgentDetailPanel, {
            props: { graph },
            global: { plugins: [pinia] },
        })
        await flushPromises()

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        // `avatarSubject(undefined)` sends `name: null`, so
        // `useInitials('')` returns '?' — same as the old
        // `initialsFor()` fallback.
        expect(tile.find('[data-testid="avatar-initials"]').text()).toBe('?')
        expect(wrapper.find('[data-testid="tg-outbound-section"] .truncate').text()).toBe('Unknown')
        wrapper.unmount()
    })

    it('uses the package ring colour for a status the palette covers', async () => {
        const wrapper = await mountFirstTile(makeNode({ status: 'FAILED' }))

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        // `STATUS_PALETTE.FAILED.ringColor`, not a local copy.
        expect(tile.attributes('style')).toContain('--tg-status-ring: #fee2e2')
        wrapper.unmount()
    })

    it('keeps the plugin colour for a status the palette does not cover', async () => {
        // `APPROVED` is one of the five statuses `STATUS_PALETTE` does
        // not carry. `statusDisplay('APPROVED')` would answer with the
        // neutral `COMPLETED` entry (#f1f5f9); the panel must not.
        const wrapper = await mountFirstTile(makeNode({ status: 'APPROVED' }))

        const tile = wrapper.find('[data-testid="tg-outbound-section"] .tg-agent-tile')
        const style = tile.attributes('style') ?? ''
        expect(style).not.toContain('#f1f5f9')
        // `statusColor('APPROVED') === '#06b6d4'`, tinted 60 % to white.
        expect(style).toContain('--tg-status-ring: color-mix(in srgb, #06b6d4 60%, white)')
        wrapper.unmount()
    })

    it('paints both the outbound and the inbound tile', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        useSelectionStore().setSelected(1)
        const graph = makeGraph(withArchetype({ id: 2, name: 'Blake' }))
        graph.edges.push({
            id: '3->1',
            source: 3,
            target: 1,
            op: 'sub_agent',
            configured: true,
            count_24h: 0,
            last_invoked_at: null,
        })
        graph.nodes.push(withArchetype({ id: 3, name: 'Frankie' }))
        const wrapper = mount(AgentDetailPanel, {
            props: { graph },
            global: { plugins: [pinia] },
        })
        await flushPromises()

        const outbound = wrapper.findAll('[data-testid="tg-outbound-section"] .tg-agent-tile')
        const inbound = wrapper.findAll('[data-testid="tg-inbound-section"] .tg-agent-tile')
        expect(outbound).toHaveLength(1)
        expect(inbound).toHaveLength(1)
        expect(inbound[0]!.find('[data-testid="avatar-archetype"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

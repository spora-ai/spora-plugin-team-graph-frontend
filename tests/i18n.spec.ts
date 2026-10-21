/**
 * The plugin's German catalogue.
 *
 * Three things are pinned here: that the catalogue covers the source
 * (the extractor's rule 2 does the same, but it is a build-time gate
 * and this is a test), that no value is left identical to its English
 * source, and that the panel actually renders German when the host
 * says the operator's language is German.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import AgentNodeCard from '../src/components/AgentNodeCard.vue'
import AgentStatusChip from '../src/components/AgentStatusChip.vue'
import GraphErrorFallback from '../src/components/GraphErrorFallback.vue'
import StatusLegend from '../src/components/StatusLegend.vue'
import TeamGraphCanvas from '../src/components/TeamGraphCanvas.vue'
import { createPluginI18n, t } from '../src/i18n'
import en from '../src/locales/en.json'
import de from '../src/locales/de.json'
import type { GraphNode, GraphPayload } from '../src/types'

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }),
    },
}))

const german = () => ({ global: { plugins: [createPluginI18n('de')] } })

beforeEach(() => {
    setActivePinia(createPinia())
})

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        id: 7,
        name: 'Marketing Lead',
        role: null,
        picture_url: null,
        status: 'RUNNING',
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

const EMPTY_GRAPH: GraphPayload = {
    principal: { id: 1, type: 'user', name: 'Ada', is_current_user_owned: true },
    nodes: [],
    edges: [],
    generated_at: '2026-09-28T12:00:00Z',
}

describe('the German catalogue', () => {
    it('covers every key the English catalogue has, and no more', () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    })

    it('translates every key — no value is left identical to its English source', () => {
        const untranslated = Object.entries(de)
            .filter(([key, value]) => value === key)
            .map(([key]) => key)
        expect(untranslated).toEqual([])
    })

    it('keeps the placeholders of the English source', () => {
        const placeholders = (value: string): string[] =>
            [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        const drifted = Object.entries(de)
            .filter(([key, value]) => placeholders(key).join() !== placeholders(value).join())
            .map(([key]) => key)
        expect(drifted).toEqual([])
    })
})

describe('the panel in German', () => {
    it('renders the status label in German', () => {
        const wrapper = mount(AgentStatusChip, {
            ...german(),
            props: { status: 'RUNNING' },
        })
        expect(wrapper.text()).toBe('läuft')
    })

    it('renders the legend in German', () => {
        const wrapper = mount(StatusLegend, german())
        const text = wrapper.text()
        expect(text).toContain('läuft')
        expect(text).toContain('wartet auf Freigabe')
        expect(text).toContain('Sie haben sie erzeugt')
        expect(text).toContain('Sie wurden von ihnen erzeugt')
    })

    it('renders the error card in German', () => {
        const wrapper = mount(GraphErrorFallback, {
            ...german(),
            props: { message: 'boom' },
        })
        expect(wrapper.text()).toContain('Der Team-Graph konnte nicht geladen werden')
    })

    it('renders the empty state in German', () => {
        const wrapper = mount(TeamGraphCanvas, {
            ...german(),
            props: { graph: EMPTY_GRAPH },
        })
        const text = wrapper.text()
        expect(text).toContain('Noch keine Agenten')
        expect(text).toContain('Dieses Team hat keine Agenten.')
    })

    it('renders the node card in German', () => {
        const wrapper = mount(AgentNodeCard, {
            ...german(),
            props: {
                node: makeNode(),
                inbound: 2,
                outbound: 3,
                selected: false,
                adjacent: false,
                dimmed: false,
                x: 0,
                y: 0,
            },
        })
        const text = wrapper.text()
        expect(text).toContain('läuft')
        expect(text).toContain('eingehend')
        expect(text).toContain('ausgehend')
    })

    it('translates through the module-level helper the stores use', () => {
        const instance = createPluginI18n('de')
        expect(instance.global.locale.value).toBe('de')
        expect(t('My Agents')).toBe('Meine Agenten')
    })

    it('falls back to the English source when no instance has been created yet', async () => {
        // A fresh module registry, so the instance this file created
        // in `beforeEach` is not the one being asked. A store action
        // that runs before `createPluginI18n` must not crash.
        vi.resetModules()
        const fresh = await import('../src/i18n')

        expect(fresh.t('A key nobody translated')).toBe('A key nobody translated')
    })

    it('falls back to the English source for a locale it has no catalogue for', () => {
        const wrapper = mount(AgentStatusChip, {
            global: { plugins: [createPluginI18n('fr')] },
            props: { status: 'RUNNING' },
        })
        expect(wrapper.text()).toBe('running')
    })
})

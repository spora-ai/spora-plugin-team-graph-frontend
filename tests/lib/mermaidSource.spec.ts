import { describe, it, expect } from 'vitest'
import { PALETTES } from '@spora-ai/components/lib'
import { buildMermaidSource } from '../../src/lib/mermaidSource'
import type { GraphPayload } from '../../src/types'

/**
 * Snapshot test for `buildMermaidSource()`.
 *
 * The Mermaid source is the contract with the renderer; a regression
 * that mangles the `n<id>["…"]` line would surface as a parse error
 * or a missing node. We pin the entire source string for one
 * representative payload.
 *
 * Since the node cards moved to a Vue overlay (`Option C`), the
 * source is deliberately minimal: Mermaid is a *layout* engine here
 * and nothing more. There is no HTML label, no `classDef`, and no
 * palette machinery — `style.css` hides Mermaid's node boxes and the
 * shared `AgentAvatar` paints the agent's identity on the card.
 *
 * The palette table itself lives in `@spora-ai/components`; the
 * `PALETTES` block at the bottom pins the key list and hexes the
 * cards depend on, so a package bump that renames a key or shifts a
 * hex fails here instead of silently repainting agents.
 */
const tinyStartup: GraphPayload = {
    principal: { id: -1, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Marketing Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' } },
        { id: 2, name: 'Blake', role: 'Content Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3, profile_picture: { palette_key: 'amber', bg_color: '#D97706', fg_color: '#FFFBEB' } },
        { id: 3, name: 'Casey', role: 'Translator', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 1, profile_picture: { palette_key: 'teal', bg_color: '#0F766E', fg_color: '#F0FDFA' } },
        { id: 4, name: 'Dakota', role: 'Designer', picture_url: null, status: 'AWAITING_SUB_AGENTS', active_chats: 1, recent_chats_24h: 2, profile_picture: { palette_key: 'pink', bg_color: '#BE185D', fg_color: '#FDF2F8' } },
        { id: 5, name: 'Ellis', role: 'Developer', picture_url: null, status: 'PENDING_APPROVAL', active_chats: 1, recent_chats_24h: 2, profile_picture: { palette_key: 'green', bg_color: '#15803D', fg_color: '#F0FDF4' } },
    ],
    edges: [
        { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
        { id: '1->4', source: 1, target: 4, op: 'sub_agent', configured: true, count_24h: 2, last_invoked_at: '2026-09-23T09:48:00Z' },
    ],
    generated_at: '2026-09-25T08:14:00Z',
}

describe('buildMermaidSource', () => {
    it('starts with the flowchart TB header', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src.split('\n')[0]).toBe('flowchart TB')
    })

    it('emits no classDef — the node boxes are hidden from style.css, not from Mermaid', () => {
        const src = buildMermaidSource(tinyStartup)
        // Mermaid's own theme (primaryColor / primaryTextColor) has to
        // survive as the fallback for a stylesheet that fails to load,
        // which a `classDef fill:transparent` would destroy.
        expect(src).not.toContain('classDef')
        expect(src).not.toContain(':::')
    })

    it('emits one n<id>["name"] line per node and no HTML label', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toContain('  n1["Alex"]')
        expect(src).toContain('  n3["Casey"]')
        expect(src).not.toContain('<div')
        expect(src).not.toContain('tg-node')
        expect(src).not.toContain('--palette-bg')
    })

    it('escapes double quotes and collapses newlines so the label cannot break the lexer', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            edges: [],
            nodes: [
                { id: 99, name: 'O"Reilly\nOps', role: null, picture_url: null, status: 'RUNNING', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: 'green', bg_color: '#15803D', fg_color: '#F0FDF4' } },
            ],
        }
        const src = buildMermaidSource(payload)
        // Exactly one quoted label, with the quote and the newline
        // collapsed to a single space so the lexer cannot split it.
        expect(src.split('\n')).toEqual(['flowchart TB', '  n99["O Reilly Ops"]'])
    })

    it('falls back to a placeholder label so an empty name still sizes a node box', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 98, name: '   ', role: null, picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: 'slate', bg_color: '#475569', fg_color: '#F8FAFC' } },
            ],
        }
        expect(buildMermaidSource(payload)).toContain('  n98["agent"]')
    })

    it('emits one solid arrow line per edge, regardless of last_invoked_at', () => {
        const payloadUnfired: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 0, last_invoked_at: null },
            ],
        }
        const srcUnfired = buildMermaidSource(payloadUnfired)
        expect(srcUnfired).toContain('  n1 --> n2')
        expect(srcUnfired).not.toContain('  n1 -.-> n2')
    })

    it('declares isolated nodes so a node with no edges is still laid out', () => {
        const payload: GraphPayload = { ...tinyStartup, edges: [] }
        const src = buildMermaidSource(payload)
        expect(src).toContain('  n5["Ellis"]')
        expect(src.split('\n')).toHaveLength(1 + 5)
    })

    it('produces a stable, line-ordered output', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toBe([
            'flowchart TB',
            '  n1["Alex"]',
            '  n2["Blake"]',
            '  n3["Casey"]',
            '  n4["Dakota"]',
            '  n5["Ellis"]',
            '  n1 --> n2',
            '  n1 --> n4',
        ].join('\n'))
    })
})

describe('PALETTES table', () => {
    it('has 10 entries matching the host Palette enum', () => {
        expect(PALETTES.map((p) => p.key)).toEqual([
            'slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink',
        ])
    })

    it('matches the host Palette hex codes exactly', () => {
        const expected: Record<string, { background: string; foreground: string }> = {
            slate:  { background: '#475569', foreground: '#F8FAFC' },
            red:    { background: '#DC2626', foreground: '#FEF2F2' },
            orange: { background: '#EA580C', foreground: '#FFF7ED' },
            amber:  { background: '#D97706', foreground: '#FFFBEB' },
            green:  { background: '#15803D', foreground: '#F0FDF4' },
            teal:   { background: '#0F766E', foreground: '#F0FDFA' },
            blue:   { background: '#1D4ED8', foreground: '#EFF6FF' },
            indigo: { background: '#4338CA', foreground: '#EEF2FF' },
            violet: { background: '#6D28D9', foreground: '#F5F3FF' },
            pink:   { background: '#BE185D', foreground: '#FDF2F8' },
        }
        for (const [key, hex] of Object.entries(expected)) {
            const entry = PALETTES.find((p) => p.key === key)
            expect(entry?.background).toBe(hex.background)
            expect(entry?.foreground).toBe(hex.foreground)
        }
    })
})

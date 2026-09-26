import { describe, it, expect } from 'vitest'
import { buildMermaidSource } from '../../src/lib/mermaidSource'
import type { GraphPayload } from '../../src/types'
import { PALETTES } from '../../src/lib/palette'

/**
 * Snapshot test for `buildMermaidSource()`.
 *
 * The Mermaid source is the contract with the renderer; a
 * regression that drops a `classDef` or mangles the
 * `n<id>["…"]:::tg-palette-<key>` line would surface as the wrong
 * palette or a render error. We pin the entire source string for
 * one representative payload (Tiny Startup fixture, minus chats).
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

    it('emits exactly one classDef per palette_key actually used in the payload', () => {
        const src = buildMermaidSource(tinyStartup)
        // Tiny Startup uses indigo, amber, teal, pink, green → 5 classDefs.
        // No classDef for slate/red/orange/blue/violet even though they're
        // in the PALETTES table — the emitted set is the used-set.
        expect(src).toContain('classDef tg-palette-indigo fill:#4338CA,color:#EEF2FF,stroke:#4338CA')
        expect(src).toContain('classDef tg-palette-amber fill:#D97706,color:#FFFBEB,stroke:#D97706')
        expect(src).toContain('classDef tg-palette-teal fill:#0F766E,color:#F0FDFA,stroke:#0F766E')
        expect(src).toContain('classDef tg-palette-pink fill:#BE185D,color:#FDF2F8,stroke:#BE185D')
        expect(src).toContain('classDef tg-palette-green fill:#15803D,color:#F0FDF4,stroke:#15803D')
        expect(src).not.toContain('classDef tg-palette-slate')
        expect(src).not.toContain('classDef tg-palette-red')
        expect(src).not.toContain('classDef tg-palette-violet')
    })

    it('emits one n<id> line per node with the expected tg-palette-<key> class', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toContain('n1["')
        expect(src).toContain(':::tg-palette-indigo')
        expect(src).toContain('n3["')
        expect(src).toContain(':::tg-palette-teal')
        expect(src).toContain('n4["')
        expect(src).toContain(':::tg-palette-pink')
        expect(src).toContain('n5["')
        expect(src).toContain(':::tg-palette-green')
    })

    it('does NOT inline style attributes on the label div', () => {
        /* Inline `style=` was tried first and rejected: Mermaid 10's
         * HTML-label sanitiser strips `;` characters from inline
         * styles, which concatenates adjacent declarations into
         * invalid CSS. Every colour now lives in CSS variables
         * driven by the wrapping `<g class="tg-palette-*">`. */
        const src = buildMermaidSource(tinyStartup)
        expect(src).not.toContain('style=\'background-color')
        expect(src).not.toContain('style="background-color')
    })

    it('falls back to Slate palette when a node\'s wire payload omits palette_key', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: 'Default', role: null, picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: '', bg_color: '', fg_color: '' } },
            ],
        }
        const src = buildMermaidSource(payload)
        // paletteByKey('') returns the Slate fallback; the canvas
        // always has a usable (bg, fg) pair.
        expect(src).toContain('classDef tg-palette-slate fill:#475569,color:#F8FAFC,stroke:#475569')
        expect(src).toContain(':::tg-palette-slate')
    })

    it('emits one solid arrow line per edge, regardless of last_invoked_at', () => {
        /* Every configured edge renders as a solid arrow — the
         * "configured, never used" distinction lives in the detail
         * panel's secondary label only, not on the canvas, because
         * a dashed arrow reads as "broken" rather than "dormant"
         * and confuses operators. */
        const payloadUnfired: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 0, last_invoked_at: null },
            ],
        }
        const srcUnfired = buildMermaidSource(payloadUnfired)
        expect(srcUnfired).toContain('  n1 --> n2')
        expect(srcUnfired).not.toContain('  n1 -.-> n2')

        const payloadFired: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-25T08:14:00Z' },
            ],
        }
        const srcFired = buildMermaidSource(payloadFired)
        expect(srcFired).toContain('  n1 --> n2')
        expect(srcFired).not.toContain('  n1 -.-> n2')
    })

    it('escapes single quotes in node names', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: "O'Reilly", role: "Engineer", picture_url: null, status: 'RUNNING', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: 'green', bg_color: '#15803D', fg_color: '#F0FDF4' } },
            ],
        }
        const src = buildMermaidSource(payload)
        // Single-quote inside the name attribute must be escaped
        // to `&#39;` so Mermaid's parser doesn't terminate the label.
        expect(src).toContain('O&#39;Reilly')
    })

    it('produces a stable, line-ordered output', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toBe([
            'flowchart TB',
            'classDef tg-palette-indigo fill:#4338CA,color:#EEF2FF,stroke:#4338CA',
            'classDef tg-palette-amber fill:#D97706,color:#FFFBEB,stroke:#D97706',
            'classDef tg-palette-teal fill:#0F766E,color:#F0FDFA,stroke:#0F766E',
            'classDef tg-palette-pink fill:#BE185D,color:#FDF2F8,stroke:#BE185D',
            'classDef tg-palette-green fill:#15803D,color:#F0FDF4,stroke:#15803D',
            '  n1["<div class=\'tg-node\'><div class=\'tg-node-name\'>Alex</div><div class=\'tg-node-role\'>#1 · Marketing Lead</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>4</strong>/24h</span></div></div>"]:::tg-palette-indigo',
            '  n2["<div class=\'tg-node\'><div class=\'tg-node-name\'>Blake</div><div class=\'tg-node-role\'>#2 · Content Writer</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>3</strong>/24h</span></div></div>"]:::tg-palette-amber',
            '  n3["<div class=\'tg-node\'><div class=\'tg-node-name\'>Casey</div><div class=\'tg-node-role\'>#3 · Translator</div><span class=\'tg-status-pill tg-status-completed\'><span class=\'dot\'></span>idle</span><div class=\'tg-node-stats\'><span><strong>0</strong> active · <strong>1</strong>/24h</span></div></div>"]:::tg-palette-teal',
            '  n4["<div class=\'tg-node\'><div class=\'tg-node-name\'>Dakota</div><div class=\'tg-node-role\'>#4 · Designer</div><span class=\'tg-status-pill tg-status-awaiting\'><span class=\'dot\'></span>awaiting sub-agent</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>2</strong>/24h</span></div></div>"]:::tg-palette-pink',
            '  n5["<div class=\'tg-node\'><div class=\'tg-node-name\'>Ellis</div><div class=\'tg-node-role\'>#5 · Developer</div><span class=\'tg-status-pill tg-status-pending\'><span class=\'dot\'></span>awaiting approval</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>2</strong>/24h</span></div></div>"]:::tg-palette-green',
            '  n1 --> n2',
            '  n1 --> n4',
        ].join('\n'))
    })
})

describe('PALETTES table', () => {
    it('has 10 entries matching the host Palette enum (slate/red/orange/amber/green/teal/blue/indigo/violet/pink)', () => {
        expect(PALETTES.map((p) => p.className)).toEqual([
            'slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink',
        ])
    })

    it('matches the host Palette hex codes exactly', () => {
        // Mirrors spora-core/app/Services/AgentPictures/Palette.php —
        // any drift here breaks the colour contract with the dashboard
        // Avatar tile for the same agent.
        const expected: Record<string, { bg: string; fg: string }> = {
            slate:  { bg: '#475569', fg: '#F8FAFC' },
            red:    { bg: '#DC2626', fg: '#FEF2F2' },
            orange: { bg: '#EA580C', fg: '#FFF7ED' },
            amber:  { bg: '#D97706', fg: '#FFFBEB' },
            green:  { bg: '#15803D', fg: '#F0FDF4' },
            teal:   { bg: '#0F766E', fg: '#F0FDFA' },
            blue:   { bg: '#1D4ED8', fg: '#EFF6FF' },
            indigo: { bg: '#4338CA', fg: '#EEF2FF' },
            violet: { bg: '#6D28D9', fg: '#F5F3FF' },
            pink:   { bg: '#BE185D', fg: '#FDF2F8' },
        }
        for (const [key, hex] of Object.entries(expected)) {
            const entry = PALETTES.find((p) => p.className === key)
            expect(entry?.bg).toBe(hex.bg)
            expect(entry?.fg).toBe(hex.fg)
        }
    })
})

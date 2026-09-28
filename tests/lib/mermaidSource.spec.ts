import { describe, it, expect } from 'vitest'
import { PALETTES } from '@spora-ai/components/lib'
import { buildMermaidSource } from '../../src/lib/mermaidSource'
import type { GraphPayload } from '../../src/types'

/**
 * Snapshot test for `buildMermaidSource()`.
 *
 * The Mermaid source is the contract with the renderer; a
 * regression that drops a `classDef` or mangles the
 * `n<id>["…"]:::tg-palette-<key>` line would surface as the wrong
 * palette or a render error. We pin the entire source string for
 * one representative payload (Tiny Startup fixture, minus chats).
 *
 * Compact variant (v0.1.x): nodes carry only an accent bar + name
 * + status pill — no #ID, no role, no stats line.
 *
 * The palette table itself now lives in `@spora-ai/components`; the
 * `PALETTES` block below pins the key list and hexes the generated
 * Mermaid classes depend on, so a package bump that renames a key or
 * shifts a hex fails here instead of silently repainting nodes.
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

    it('emits transparent-fill classDefs (CSS owns the rect styling)', () => {
        const src = buildMermaidSource(tinyStartup)
        // Every classDef uses fill:transparent + stroke:transparent
        // so Mermaid's per-palette CSS injection can't fight our
        // stylesheet's white-fill + violet-outline rules.
        for (const palette of ['indigo', 'amber', 'teal', 'pink', 'green']) {
            expect(src).toContain(`classDef tg-palette-${palette} fill:transparent,stroke:transparent`)
        }
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

    it('does NOT inline background-color or fill on the label div', () => {
        /* Inline `style=` was tried first and rejected: Mermaid 10's
         * HTML-label sanitiser strips `;` characters from inline
         * styles, which concatenates adjacent declarations into
         * invalid CSS. Every colour lives in CSS variables driven
         * by the wrapping `<g class="tg-palette-*">`. The compact
         * variant only carries a single inline property:
         * `--palette-bg` for the accent bar. */
        const src = buildMermaidSource(tinyStartup)
        expect(src).not.toContain('background-color:')
        // classDefs legitimately use `fill:transparent` — the
        // assertion has to look for an actual colour, not just
        // the property prefix.
        expect(src).not.toMatch(/fill:\s*(?!transparent)[^,)]+/)
    })

    it('passes the agent palette_key via --palette-bg (inline) so the accent bar can read it', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toContain("style='--palette-bg:#4338CA'") // indigo
        expect(src).toContain("style='--palette-bg:#D97706'") // amber
    })

    it('falls back to Slate palette when a node\'s wire payload omits palette_key', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: 'Default', role: null, picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: '', bg_color: '', fg_color: '' } },
            ],
        }
        const src = buildMermaidSource(payload)
        expect(src).toContain('classDef tg-palette-slate fill:transparent,stroke:transparent')
        expect(src).toContain(':::tg-palette-slate')
        // safeHex('') falls back to #475569 (Slate bg_color).
        expect(src).toContain("style='--palette-bg:#475569'")
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

    it('escapes single quotes in node names', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: "O'Reilly", role: "Engineer", picture_url: null, status: 'RUNNING', active_chats: 0, recent_chats_24h: 0, profile_picture: { palette_key: 'green', bg_color: '#15803D', fg_color: '#F0FDF4' } },
            ],
        }
        const src = buildMermaidSource(payload)
        expect(src).toContain('O&#39;Reilly')
    })

    it('does not include #ID, role, or stats line in the compact label', () => {
        const src = buildMermaidSource(tinyStartup)
        // The user asked to drop the stats line and the agent ID from
        // the canvas nodes. The compact label carries only the
        // accent bar + agent name + status pill.
        expect(src).not.toContain('tg-node-stats')
        expect(src).not.toContain('tg-node-role')
        expect(src).not.toContain('active · <strong>')
        expect(src).not.toContain('24h')
        // `#ID` rendering would look like "#1 · Marketing Lead".
        // `#1` itself shows up in hex colours (e.g. #15803D) so we
        // check for the rendered interpolation pattern, not the raw
        // substring.
        expect(src).not.toMatch(/#\d+\s+·\s+\w/)  // "#1 · Marketing"
    })

    it('produces a stable, line-ordered output', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toBe([
            'flowchart TB',
            'classDef tg-palette-indigo fill:transparent,stroke:transparent',
            'classDef tg-palette-amber fill:transparent,stroke:transparent',
            'classDef tg-palette-teal fill:transparent,stroke:transparent',
            'classDef tg-palette-pink fill:transparent,stroke:transparent',
            'classDef tg-palette-green fill:transparent,stroke:transparent',
            '  n1["<div class=\'tg-node\' style=\'--palette-bg:#4338CA\'><div class=\'tg-node-accent\'></div><div class=\'tg-node-body\'><div class=\'tg-node-name\'>Alex</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span></div></div>"]:::tg-palette-indigo',
            '  n2["<div class=\'tg-node\' style=\'--palette-bg:#D97706\'><div class=\'tg-node-accent\'></div><div class=\'tg-node-body\'><div class=\'tg-node-name\'>Blake</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span></div></div>"]:::tg-palette-amber',
            '  n3["<div class=\'tg-node\' style=\'--palette-bg:#0F766E\'><div class=\'tg-node-accent\'></div><div class=\'tg-node-body\'><div class=\'tg-node-name\'>Casey</div><span class=\'tg-status-pill tg-status-completed\'><span class=\'dot\'></span>idle</span></div></div>"]:::tg-palette-teal',
            '  n4["<div class=\'tg-node\' style=\'--palette-bg:#BE185D\'><div class=\'tg-node-accent\'></div><div class=\'tg-node-body\'><div class=\'tg-node-name\'>Dakota</div><span class=\'tg-status-pill tg-status-awaiting\'><span class=\'dot\'></span>awaiting sub-agent</span></div></div>"]:::tg-palette-pink',
            '  n5["<div class=\'tg-node\' style=\'--palette-bg:#15803D\'><div class=\'tg-node-accent\'></div><div class=\'tg-node-body\'><div class=\'tg-node-name\'>Ellis</div><span class=\'tg-status-pill tg-status-pending\'><span class=\'dot\'></span>awaiting approval</span></div></div>"]:::tg-palette-green',
            '  n1 --> n2',
            '  n1 --> n4',
        ].join('\n'))
    })
})

describe('PALETTES table', () => {
    it('has 10 entries matching the host Palette enum (slate/red/orange/amber/green/teal/blue/indigo/violet/pink)', () => {
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

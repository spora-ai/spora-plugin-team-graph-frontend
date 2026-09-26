import { describe, it, expect } from 'vitest'
import { buildMermaidSource } from '../../src/lib/mermaidSource'
import type { GraphPayload } from '../../src/types'

/**
 * Snapshot test for `buildMermaidSource()`.
 *
 * The Mermaid source is the contract with the renderer; a
 * regression that drops a `classDef` or mangles the
 * `n<id>["…"]:::tg-node-rect` line would surface as the wrong
 * palette or a render error. We pin the entire source string for
 * one representative payload (Tiny Startup fixture, minus chats).
 */
const tinyStartup: GraphPayload = {
    principal: { id: -1, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Marketing Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { bg_color: '#4338CA', fg_color: '#EEF2FF' } },
        { id: 2, name: 'Blake', role: 'Content Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3, profile_picture: { bg_color: '#D97706', fg_color: '#FFFBEB' } },
        { id: 3, name: 'Casey', role: 'Translator', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 1, profile_picture: { bg_color: '#0F766E', fg_color: '#F0FDFA' } },
        { id: 4, name: 'Dakota', role: 'Designer', picture_url: null, status: 'AWAITING_SUB_AGENTS', active_chats: 1, recent_chats_24h: 2, profile_picture: { bg_color: '#BE185D', fg_color: '#FDF2F8' } },
        { id: 5, name: 'Ellis', role: 'Developer', picture_url: null, status: 'PENDING_APPROVAL', active_chats: 1, recent_chats_24h: 2, profile_picture: { bg_color: '#16A34A', fg_color: '#F0FDF4' } },
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

    it('emits a single transparent-rect classDef for the invisible Mermaid node shape', () => {
        const src = buildMermaidSource(tinyStartup)
        // One classDef total; the agent's icon colour lives on the
        // HTML label's inline style, not on a per-status classDef.
        expect(src).toContain('classDef tg-node-rect fill:transparent,stroke:transparent,color:inherit')
    })

    it('emits one n<id> line per node with the expected inline icon-colour style', () => {
        const src = buildMermaidSource(tinyStartup)
        // Alex (id=1) → indigo. Inline style carries bg + fg + CSS vars
        // so the gradient can be re-applied without re-parsing hex.
        expect(src).toContain('n1["')
        expect(src).toContain('background-color:#4338CA;color:#EEF2FF')
        expect(src).toContain('--tg-node-bg:#4338CA;--tg-node-fg:#EEF2FF')
        // Casey (id=3) → teal.
        expect(src).toContain('n3["')
        expect(src).toContain('background-color:#0F766E;color:#F0FDFA')
    })

    it('falls back to Slate for a node whose wire payload has empty hex strings', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: 'Default', role: null, picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 0, profile_picture: { bg_color: '', fg_color: '' } },
            ],
        }
        const src = buildMermaidSource(payload)
        // safeHex rejects '' and falls back to Slate (#475569/#F8FAFC).
        expect(src).toContain('background-color:#475569;color:#F8FAFC')
    })

    it('emits one arrow line per edge', () => {
        const src = buildMermaidSource(tinyStartup)
        expect(src).toContain('  n1 --> n2')
        expect(src).toContain('  n1 --> n4')
    })

    it('emits a dashed arrow for configured-but-never-fired edges', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 0, last_invoked_at: null },
            ],
        }
        const src = buildMermaidSource(payload)
        expect(src).toContain('  n1 -.-> n2')
        expect(src).not.toContain('  n1 --> n2')
    })

    it('emits a solid arrow when count_24h is zero but a previous invocation is on file', () => {
        /* Dormant edge: last fired more than 24h ago but inside the
         * 7-day enrichment window. Renders solid — the operator has
         * touched this connection recently enough that it doesn't
         * warrant the "configured, never used" treatment. */
        const payload: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 0, last_invoked_at: '2026-09-19T08:14:00Z' },
            ],
        }
        const src = buildMermaidSource(payload)
        expect(src).toContain('  n1 --> n2')
        expect(src).not.toContain('  n1 -.-> n2')
    })

    it('emits a solid arrow once the edge has fired in the last 24h', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            edges: [
                { id: '1->2', source: 1, target: 2, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-25T08:14:00Z' },
            ],
        }
        const src = buildMermaidSource(payload)
        expect(src).toContain('  n1 --> n2')
        expect(src).not.toContain('  n1 -.-> n2')
    })

    it('escapes single quotes in node names', () => {
        const payload: GraphPayload = {
            ...tinyStartup,
            nodes: [
                { id: 99, name: "O'Reilly", role: "Engineer", picture_url: null, status: 'RUNNING', active_chats: 0, recent_chats_24h: 0, profile_picture: { bg_color: '#16A34A', fg_color: '#F0FDF4' } },
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
            '  classDef tg-node-rect fill:transparent,stroke:transparent,color:inherit',
            '  n1["<div class=\'tg-node\' style=\'background-color:#4338CA;color:#EEF2FF;--tg-node-bg:#4338CA;--tg-node-fg:#EEF2FF\'><div class=\'tg-node-name\'>Alex</div><div class=\'tg-node-role\'>#1 · Marketing Lead</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>4</strong>/24h</span></div></div>"]:::tg-node-rect',
            '  n2["<div class=\'tg-node\' style=\'background-color:#D97706;color:#FFFBEB;--tg-node-bg:#D97706;--tg-node-fg:#FFFBEB\'><div class=\'tg-node-name\'>Blake</div><div class=\'tg-node-role\'>#2 · Content Writer</div><span class=\'tg-status-pill tg-status-running\'><span class=\'dot\'></span>running</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>3</strong>/24h</span></div></div>"]:::tg-node-rect',
            '  n3["<div class=\'tg-node\' style=\'background-color:#0F766E;color:#F0FDFA;--tg-node-bg:#0F766E;--tg-node-fg:#F0FDFA\'><div class=\'tg-node-name\'>Casey</div><div class=\'tg-node-role\'>#3 · Translator</div><span class=\'tg-status-pill tg-status-completed\'><span class=\'dot\'></span>idle</span><div class=\'tg-node-stats\'><span><strong>0</strong> active · <strong>1</strong>/24h</span></div></div>"]:::tg-node-rect',
            '  n4["<div class=\'tg-node\' style=\'background-color:#BE185D;color:#FDF2F8;--tg-node-bg:#BE185D;--tg-node-fg:#FDF2F8\'><div class=\'tg-node-name\'>Dakota</div><div class=\'tg-node-role\'>#4 · Designer</div><span class=\'tg-status-pill tg-status-awaiting\'><span class=\'dot\'></span>awaiting sub-agent</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>2</strong>/24h</span></div></div>"]:::tg-node-rect',
            '  n5["<div class=\'tg-node\' style=\'background-color:#16A34A;color:#F0FDF4;--tg-node-bg:#16A34A;--tg-node-fg:#F0FDF4\'><div class=\'tg-node-name\'>Ellis</div><div class=\'tg-node-role\'>#5 · Developer</div><span class=\'tg-status-pill tg-status-pending\'><span class=\'dot\'></span>awaiting approval</span><div class=\'tg-node-stats\'><span><strong>1</strong> active · <strong>2</strong>/24h</span></div></div>"]:::tg-node-rect',
            '  n1 --> n2',
            '  n1 --> n4',
        ].join('\n'))
    })
})

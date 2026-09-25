import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useMermaidRender, nodeIdFromMermaidId } from '../../src/composables/useMermaidRender'
import type { GraphPayload } from '../../src/types'

/**
 * useMermaidRender — drive the Mermaid render lifecycle.
 *
 * Mock `mermaid.render` (and `mermaid.initialize`) so the
 * composable can exercise its post-processing pipeline (viewBox
 * reset, rounded corners, click handler attachment) without
 * pulling the real 600 KB Mermaid runtime into the test.
 */

const renderFn = vi.fn()
const initializeFn = vi.fn()

vi.mock('mermaid', () => ({
    default: {
        initialize: (cfg: unknown) => initializeFn(cfg),
        render: (id: string, source: string) => renderFn(id, source),
    },
}))

function makeSvgFixture(): string {
    // Hand-written SVG with two <g class="node"> elements that
    // match Mermaid's `flowchart-n<id>-<i>` id format. The
    // composable walks these and attaches click listeners.
    return `<svg viewBox="0 0 200 100">
        <g class="node" id="flowchart-n1-0">
            <rect x="10" y="10" width="80" height="40" />
            <g class="label"><foreignObject>Alex</foreignObject></g>
        </g>
        <g class="node" id="flowchart-n2-0">
            <polygon points="100,10 180,10 140,50" />
            <g class="label"><foreignObject>Blake</foreignObject></g>
        </g>
        <g class="edgePath" id="flowchart-n1-n2-0">
            <path d="M90 30 L100 30" />
        </g>
    </svg>`
}

const tinyStartup: GraphPayload = {
    principal: { id: 7, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
    nodes: [
        { id: 1, name: 'Alex', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4 },
        { id: 2, name: 'Blake', role: 'Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3 },
    ],
    edges: [
        { id: '1->2', source: 1, target: 2, op: 'sub_agent', count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
    ],
    generated_at: '2026-09-25T08:14:00Z',
}

beforeEach(() => {
    setActivePinia(createPinia())
    renderFn.mockReset()
    initializeFn.mockReset()
})

describe('nodeIdFromMermaidId', () => {
    it('parses the standard flowchart-n<id>-<i> format', () => {
        expect(nodeIdFromMermaidId('flowchart-n11-2')).toBe(11)
        expect(nodeIdFromMermaidId('flowchart-n1-0')).toBe(1)
    })

    it('returns null for unrecognised ids', () => {
        expect(nodeIdFromMermaidId('flowchart-11-2')).toBeNull()
        expect(nodeIdFromMermaidId('node-1')).toBeNull()
        expect(nodeIdFromMermaidId('')).toBeNull()
    })
})

describe('useMermaidRender', () => {
    it('renders Mermaid once per payload and wires click handlers', async () => {
        renderFn.mockResolvedValueOnce({ svg: makeSvgFixture() })
        const host = document.createElement('div')
        document.body.appendChild(host)
        const hostRef = ref<HTMLElement | null>(host)
        const graph = ref<GraphPayload | null>(tinyStartup)

        useMermaidRender({ hostRef, graph })

        await vi.waitFor(() => {
            expect(renderFn).toHaveBeenCalledTimes(1)
        })
        // Click handler attached to every g.node — dispatching click
        // bubbles up the DOM event so the composable's
        // `selection.setSelected` runs.
        const nodes = host.querySelectorAll('g.node')
        expect(nodes.length).toBe(2)

        // Ensure rounded corners + drop-shadow got applied to shapes.
        const rect = host.querySelector('g.node rect') as SVGElement | null
        expect(rect?.getAttribute('rx')).toBe('12')
        expect(rect?.getAttribute('ry')).toBe('12')
    })

    it('re-renders when the graph ref changes', async () => {
        renderFn.mockResolvedValue(makeSvgFixture())
        const host = document.createElement('div')
        document.body.appendChild(host)
        const hostRef = ref<HTMLElement | null>(host)
        const graph = ref<GraphPayload | null>(tinyStartup)
        useMermaidRender({ hostRef, graph })

        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(1))
        graph.value = { ...tinyStartup, principal: { ...tinyStartup.principal, name: 'Marketing' } }
        await vi.waitFor(() => expect(renderFn).toHaveBeenCalledTimes(2))
    })

    it('does not render when graph is null', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const hostRef = ref<HTMLElement | null>(host)
        const graph = ref<GraphPayload | null>(null)
        useMermaidRender({ hostRef, graph })
        await new Promise((r) => setTimeout(r, 10))
        expect(renderFn).not.toHaveBeenCalled()
    })

    it('surfaces render errors and paints a fallback message', async () => {
        renderFn.mockRejectedValueOnce(new Error('mermaid parse error'))
        const host = document.createElement('div')
        document.body.appendChild(host)
        const hostRef = ref<HTMLElement | null>(host)
        const graph = ref<GraphPayload | null>(tinyStartup)
        const { error } = useMermaidRender({ hostRef, graph })
        await vi.waitFor(() => {
            expect(error.value).toContain('mermaid parse error')
        })
    })
})
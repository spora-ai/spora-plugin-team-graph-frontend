/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * Output structure:
 *   flowchart TB
 *     classDef tg-palette-indigo fill:#4338CA,color:#EEF2FF,stroke:#4338CA
 *     classDef tg-palette-teal    fill:#0F766E,color:#F0FDFA,stroke:#0F766E
 *     …
 *     n11["<div class='tg-node'>…</div>"]:::tg-palette-indigo
 *     n11 --> n4
 *
 * The agent's icon colour comes from the wire's
 * `profile_picture.palette_key` (resolved server-side from
 * `agent_pictures.palette_key` via
 * `Spora\Services\AgentPictures\Palette`). We emit one Mermaid
 * `classDef` per palette actually present in the payload — Mermaid
 * applies the class to `<g class="node tg-palette-X">`, and the
 * stylesheet (`style.css`) uses that class to paint the rect fill +
 * the inner `.tg-node` background / text colour. This keeps the
 * colour in CSS rather than the inline `style=` attribute, because
 * Mermaid's HTML-label sanitiser strips `;` characters from inline
 * styles (a known Mermaid 10 parser bug), which concatenates
 * adjacent declarations into invalid CSS.
 *
 * The HTML label carries structured content (name / role / status
 * pill / stats) but no colour — every visible colour is driven by
 * the `tg-palette-X` class on the wrapping `<g>`.
 *
 * Status no longer drives the rect colour — the operator gets a
 * status pill inside the label (matching the dashboard's
 * `DashboardAgentCard.vue` pattern) so agent identity wins and
 * status remains glance-readable.
 */
import type { GraphPayload } from '../types'
import { statusPillClass, statusLabel } from './nodeStatus'
import { paletteByKey, PALETTES } from './palette'

/**
 * Escape a string for safe inclusion in an HTML attribute value
 * delimited by single quotes. We only need to replace `'` because
 * that's the only character that can break out of the attribute;
 * Mermaid's parser already handles `<`, `>`, and `&` inside
 * `["…"]` labels.
 *
 * Defensive: nullish / non-string input collapses to an empty string
 * so the canvas still renders when a node field is unexpectedly
 * undefined.
 */
function escapeAttr(s: unknown): string {
    if (typeof s !== 'string') return ''
    return s.replace(/'/g, '&#39;')
}

export function buildMermaidSource(graph: GraphPayload): string {
    const lines: string[] = ['flowchart TB']

    /*
     * Emit one classDef per palette_key actually used in this
     * payload — a 20-agent principal that uses 3 palettes emits 3
     * classDefs (vs. always emitting 10). The classDef's stroke is
     * identical to fill so the rect has no visible border against
     * the agent-coloured tile; the stylesheet can re-paint the
     * stroke on hover / selection without a Mermaid re-render.
     */
    const usedKeys = new Set<string>()
    for (const node of graph.nodes) {
        const key = node.profile_picture?.palette_key ?? 'slate'
        usedKeys.add(key)
    }
    for (const key of usedKeys) {
        const p = paletteByKey(key)
        lines.push(`classDef tg-palette-${p.className} fill:${p.bg},color:${p.fg},stroke:${p.bg}`)
    }

    for (const node of graph.nodes) {
        const name = escapeAttr(node.name)
        const role = escapeAttr(node.role ?? '')
        const pillClass = statusPillClass(node.status)
        const pillText = escapeAttr(statusLabel(node.status))
        const paletteKey = paletteByKey(node.profile_picture?.palette_key).className
        const label = renderNodeLabel(node, name, role, pillClass, pillText)
        lines.push(`  n${node.id}["${label}"]:::tg-palette-${paletteKey}`)
    }

    for (const edge of graph.edges) {
        /*
         * Every configured edge renders as a solid Mermaid arrow
         * (`-->`). The user's "All Configured connections should be
         * displayed" rule means the canvas treats configuration as
         * the source of truth — the configured-but-never-fired
         * distinction is preserved in the detail panel's secondary
         * label ("configured, never used") but not on the canvas
         * itself, where a dashed arrow reads as "broken" rather
         * than "dormant" and confuses operators.
         */
        lines.push(`  n${edge.source} --> n${edge.target}`)
    }

    return lines.join('\n')
}

function renderNodeLabel(
    node: { id: number; active_chats: number; recent_chats_24h: number },
    name: string,
    role: string,
    pillClass: string,
    pillText: string,
): string {
    /*
     * The inner `.tg-node` div carries no colour inline — every
     * visible colour is driven by the `tg-palette-X` class on the
     * wrapping `<g>`, via CSS rules in style.css. This sidesteps
     * Mermaid's known inline-style sanitiser bug (it strips `;`
     * from `style=` values, which concatenates adjacent
     * declarations into invalid CSS).
     */
    return (
        `<div class='tg-node'>` +
        `<div class='tg-node-name'>${name}</div>` +
        `<div class='tg-node-role'>#${node.id} · ${role}</div>` +
        `<span class='tg-status-pill ${pillClass}'><span class='dot'></span>${pillText}</span>` +
        `<div class='tg-node-stats'>` +
        `<span><strong>${node.active_chats}</strong> active · <strong>${node.recent_chats_24h}</strong>/24h</span>` +
        `</div>` +
        `</div>`
    )
}

/* Re-export the palette table for tests + style.css consumers. */
export { PALETTES, paletteByKey }

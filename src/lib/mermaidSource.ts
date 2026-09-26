/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * Mirrors `spora-workspace/prototypes/prototype-e-mermaid.html →
 * buildMermaidSyntax(fix)` (Prototype E) so the rendered diagram
 * is identical between the prototype and the production plugin.
 *
 * Output structure:
 *   flowchart TB
 *     classDef status-running  fill:...,stroke:...,color:...
 *     classDef status-pending  fill:...,stroke:...,color:...
 *     …
 *     n11["<div class='tg-node'>…</div>"]:::status-running
 *     n11 --> n4
 *
 * HTML inside the `["…"]` label uses single quotes for attributes
 * — double quotes would terminate Mermaid's label string and
 * produce a parse error.
 */
import type { GraphPayload } from '../types'
import { statusSlug, statusPillClass, statusLabel } from './nodeStatus'

/**
 * Escape a string for safe inclusion in an HTML attribute value
 * delimited by single quotes. We only need to replace `'` because
 * that's the only character that can break out of the attribute;
 * Mermaid's parser already handles `<`, `>`, and `&` inside
 * `["…"]` labels.
 *
 * Defensive: nullish / non-string input collapses to an empty string
 * so the canvas still renders when a node field is unexpectedly
 * undefined (the Mermaid renderer is strict about every `nX["…"]`
 * label being a well-formed HTML string).
 */
function escapeAttr(s: unknown): string {
    if (typeof s !== 'string') return ''
    return s.replace(/'/g, '&#39;')
}

export function buildMermaidSource(graph: GraphPayload): string {
    const lines: string[] = ['flowchart TB']

    lines.push('  classDef status-running fill:#dcfce7,stroke:#10b981,color:#065f46')
    lines.push('  classDef status-pending fill:#e0e7ff,stroke:#6366f1,color:#3730a3')
    lines.push('  classDef status-awaiting fill:#fef3c7,stroke:#f59e0b,color:#92400e')
    lines.push('  classDef status-failed fill:#fee2e2,stroke:#ef4444,color:#991b1b')
    lines.push('  classDef status-completed fill:#f1f5f9,stroke:#94a3b8,color:#475569')
    /* Fuchsia instead of purple — the host's app accent is violet, so two near-blue
       ABORTED swatches on the same canvas read as duplicates. Fuchsia lands far
       enough down the spectrum to remain distinct under both light/dark. */
    lines.push('  classDef status-aborted fill:#fdf4ff,stroke:#d946ef,color:#a21caf')

    for (const node of graph.nodes) {
        const name = escapeAttr(node.name)
        const role = escapeAttr(node.role ?? '')
        const pillClass = statusPillClass(node.status)
        const pillText = escapeAttr(statusLabel(node.status))
        const slug = statusSlug(node.status)
        const label =
            `<div class='tg-node'>` +
            `<div class='tg-node-name'>${name}</div>` +
            `<div class='tg-node-role'>#${node.id} · ${role}</div>` +
            `<span class='tg-status-pill ${pillClass}'><span class='dot'></span>${pillText}</span>` +
            `<div class='tg-node-stats'>` +
            `<span><strong>${node.active_chats}</strong> active · <strong>${node.recent_chats_24h}</strong>/24h</span>` +
            `</div>` +
            `</div>`
        lines.push(`  n${node.id}["${label}"]:::status-${slug}`)
    }

    for (const edge of graph.edges) {
        lines.push(`  n${edge.source} --> n${edge.target}`)
    }

    return lines.join('\n')
}
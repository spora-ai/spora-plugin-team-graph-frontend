/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * Mirrors `spora-workspace/prototypes/prototype-e-mermaid.html →
 * buildMermaidSyntax(fix)` (Prototype E) so the rendered diagram
 * is identical between the prototype and the production plugin.
 *
 * Output structure:
 *   flowchart TB
 *     n11["<div class='tg-node' style='background:…;color:…'>…</div>"]
 *     n11 --> n4
 *
 * The agent's icon color (resolved server-side via
 * `Spora\Services\AgentPictures\Palette`) is applied via inline
 * `style="background:…;color:…"` on the label container, so each
 * node picks up its own `(bg_color, fg_color)` pair without relying
 * on Mermaid's classDef system. The rect Mermaid draws behind the
 * label is transparent (`fill:transparent`) so the HTML label owns
 * all the visible colour; the rect is still there for layout +
 * hit-testing.
 *
 * Status no longer drives the rect colour — the operator gets a
 * status pill inside the label (matching the dashboard's
 * `DashboardAgentCard.vue` pattern) so agent identity wins and
 * status remains glance-readable.
 *
 * HTML inside the `["…"]` label uses single quotes for attributes
 * — double quotes would terminate Mermaid's label string and
 * produce a parse error.
 */
import type { GraphNode, GraphPayload } from '../types'
import { statusPillClass, statusLabel } from './nodeStatus'

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

/**
 * Sanitize a hex color string before injecting it into the
 * Mermaid-sourced inline `style=`. Defense against a malformed wire
 * payload (e.g. someone hand-patching an agent_pictures row with
 * a CSS string) shipping a `background:url(javascript:…)`-style
 * injection into the canvas.
 *
 * Accepts `#RGB`, `#RRGGBB`, or `#RRGGBBAA`; everything else falls
 * back to slate-500 so the canvas always has a usable colour.
 */
function safeHex(color: string | null | undefined, fallback: string): string {
    if (typeof color !== 'string') return fallback
    return /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?([0-9A-Fa-f]{2})?$/.test(color)
        ? color
        : fallback
}

export function buildMermaidSource(graph: GraphPayload): string {
    const lines: string[] = ['flowchart TB']

    /*
     * Default invisible-rect classDef. Mermaid still draws a rect
     * for layout + hit-testing, but it carries no fill/stroke of
     * its own — the agent's icon color is applied via inline style
     * on the HTML label below. Every node references this same
     * classDef so Mermaid doesn't pick up its default theme colour.
     */
    lines.push('  classDef tg-node-rect fill:transparent,stroke:transparent,color:inherit')

    for (const node of graph.nodes) {
        const name = escapeAttr(node.name)
        const role = escapeAttr(node.role ?? '')
        const pillClass = statusPillClass(node.status)
        const pillText = escapeAttr(statusLabel(node.status))
        const label = renderNodeLabel(node, name, role, pillClass, pillText)
        lines.push(`  n${node.id}["${label}"]:::tg-node-rect`)
    }

    for (const edge of graph.edges) {
        const isUninvoked = edge.count_24h === 0 && edge.last_invoked_at === null
        /*
         * Configured-but-never-fired edges render as Mermaid's
         * dashed arrow syntax (`-.->`); the runtime CSS keeps them
         * muted so the canvas distinguishes "live connection" from
         * "configured, never used". Once the operator actually fires
         * the edge the 24 h count will tick above 0 and the next
         * render promotes it to a solid line.
         */
        const arrow = isUninvoked ? '-.->' : '-->'
        lines.push(`  n${edge.source} ${arrow} n${edge.target}`)
    }

    return lines.join('\n')
}

function renderNodeLabel(
    node: GraphNode,
    name: string,
    role: string,
    pillClass: string,
    pillText: string,
): string {
    const bg = safeHex(node.profile_picture?.bg_color, '#475569')
    const fg = safeHex(node.profile_picture?.fg_color, '#F8FAFC')
    /*
     * The dashboard Avatar applies a `linear-gradient(135deg, bg 60%,
     * white → bg)` so the tile reads as a soft rounded gradient
     * rather than a flat saturated block. Mermaid's HTML label can't
     * accept a CSS gradient via the inline-style attribute alone —
     * the parser drops `linear-gradient(` — so we apply the
     * gradient via a CSS variable on the outer div and let the
     * stylesheet do the rest. The CSS rule lives in style.css under
     * `.tg-canvas-content svg foreignObject .tg-node`.
     */
    const styleAttr =
        `background-color:${bg};color:${fg};--tg-node-bg:${bg};--tg-node-fg:${fg}`
    return (
        `<div class='tg-node' style='${styleAttr}'>` +
        `<div class='tg-node-name'>${name}</div>` +
        `<div class='tg-node-role'>#${node.id} · ${role}</div>` +
        `<span class='tg-status-pill ${pillClass}'><span class='dot'></span>${pillText}</span>` +
        `<div class='tg-node-stats'>` +
        `<span><strong>${node.active_chats}</strong> active · <strong>${node.recent_chats_24h}</strong>/24h</span>` +
        `</div>` +
        `</div>`
    )
}

/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * Output structure:
 *   flowchart TB
 *     classDef tg-palette-indigo fill:transparent,stroke:transparent
 *     classDef tg-palette-teal    fill:transparent,stroke:transparent
 *     …
 *     n11["<div class='tg-node'><div class='tg-node-accent'>|name|</div>…</div>"]:::tg-palette-indigo
 *     n11 --> n4
 *
 * The agent's icon colour comes from the wire's
 * `profile_picture.palette_key` (resolved server-side from
 * `agent_pictures.palette_key` via
 * `Spora\Services\AgentPictures\Palette`). We emit one Mermaid
 * `classDef` per palette actually used in the payload. The
 * classDef drives the wrapping `<g class="tg-palette-X">` so the
 * stylesheet can paint:
 *
 *   - the rect's fill + stroke (transparent — the stylesheet
 *     applies the actual white fill + violet outline via
 *     `.tg-canvas-content svg g[class*="tg-palette-"] rect`)
 *   - the left accent bar's colour via the inline `--palette-bg`
 *     CSS variable the HTML label sets
 *
 * The HTML label is intentionally compact: a 6 px wide accent bar
 * (the agent's palette bg_color) on the left edge, the agent name,
 * and the status pill on the right. No #ID, no role, no stats
 * line — those moved to the detail panel's right sidebar where
 * they have room to breathe. The canvas is now a uniform grid of
 * white-tiled boxes with violet outlines + a coloured stripe per
 * agent, so the operator can scan it like a leaderboard rather
 * than a mood-board.
 *
 * Status no longer drives the rect colour — the operator gets a
 * status pill inside the label (matching the dashboard's
 * `DashboardAgentCard.vue` pattern) so agent identity wins and
 * status remains glance-readable.
 */
import type { GraphPayload } from '../types'
import { statusPillClass, statusLabel } from './nodeStatus'
import { paletteByKey } from './palette'

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
     * payload. Every classDef sets fill:transparent,stroke:transparent
     * so the stylesheet owns the visible rect styling — Mermaid's
     * per-class CSS injection would otherwise fight our overrides
     * on specificity.
     */
    const usedKeys = new Set<string>()
    for (const node of graph.nodes) {
        const key = node.profile_picture?.palette_key ?? 'slate'
        usedKeys.add(key)
    }
    for (const key of usedKeys) {
        lines.push(`classDef tg-palette-${paletteByKey(key).className} fill:transparent,stroke:transparent`)
    }

    for (const node of graph.nodes) {
        const name = escapeAttr(node.name)
        const pillClass = statusPillClass(node.status)
        const pillText = escapeAttr(statusLabel(node.status))
        const paletteKey = paletteByKey(node.profile_picture?.palette_key).className
        const paletteBg = safeHex(node.profile_picture?.bg_color, '#475569')
        const label = renderNodeLabel(name, paletteBg, pillClass, pillText)
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
         * itself.
         */
        lines.push(`  n${edge.source} --> n${edge.target}`)
    }

    return lines.join('\n')
}

function renderNodeLabel(
    name: string,
    paletteBg: string,
    pillClass: string,
    pillText: string,
): string {
    /*
     * Compact label — accent bar + name + status pill. The accent
     * bar reads --palette-bg (set inline by buildMermaidSource) so
     * each node still carries the agent's icon colour, just on a
     * 6 px wide stripe instead of saturating the whole tile.
     */
    return (
        `<div class='tg-node' style='--palette-bg:${paletteBg}'>` +
        `<div class='tg-node-accent'></div>` +
        `<div class='tg-node-body'>` +
        `<div class='tg-node-name'>${name}</div>` +
        `<span class='tg-status-pill ${pillClass}'><span class='dot'></span>${pillText}</span>` +
        `</div>` +
        `</div>`
    )
}

/**
 * Sanitize a hex color string before injecting it into the
 * Mermaid-sourced inline `style=`. Defense against a malformed wire
 * payload shipping a CSS-injection string.
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

/* Re-export the palette table for tests + style.css consumers. */
export { paletteByKey }

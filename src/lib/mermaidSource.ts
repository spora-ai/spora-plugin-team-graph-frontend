/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * Output structure:
 *   flowchart TB
 *     classDef tg-palette-indigo fill:transparent,stroke:transparent
 *     classDef tg-palette-teal    fill:transparent,stroke:transparent
 *     …
 *     n11["<div class='tg-node'><div class='tg-node-accent'>|<avatar>+name|</div>…</div>"]:::tg-palette-indigo
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
 *   - the rect's fill (transparent — the agent color shows via
 *     the left accent bar instead, so the canvas reads as a
 *     unified grid of white-tiled boxes with violet outlines)
 *   - the rect's stroke (the team's primary violet — gives every
 *     node a consistent outline that ties the canvas to the
 *     team's accent)
 *   - the left accent bar's colour via the inline `--palette-bg`
 *     CSS variable the HTML label sets
 *
 * The HTML label is intentionally compact: a 6 px wide accent bar
 * (the agent's palette bg_color) on the left edge, the agent name
 * + avatar circle on the right of it (row 1), and the status pill
 * below (row 2). The avatar mirrors the host's `Avatar.vue` —
 * inline SVG primitives for archetype, `<img>` for uploaded
 * pictures, uppercase initials as a fallback.
 *
 * Status no longer drives the rect colour — the operator gets a
 * status pill inside the label (matching the dashboard's
 * `DashboardAgentCard.vue` pattern) so agent identity wins and
 * status remains glance-readable.
 */
import type { GraphPayload, ProfilePicture } from '../types'
import { statusPillClass, statusLabel } from './nodeStatus'
import { paletteByKey } from './palette'
import { agentAvatarHtml } from './agentAvatar'

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
        const label = renderNodeLabel(node, name, paletteBg, pillClass, pillText)
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
    node: { id: number; name: string; profile_picture: ProfilePicture | null },
    name: string,
    paletteBg: string,
    pillClass: string,
    pillText: string,
): string {
    /*
     * Compact two-row label:
     *
     *   ┌──────────────────────────────────────────┐
     *   │▮ [Avatar] Test Agent                      │  ← row 1: accent + avatar + name
     *   │          ● idle                          │  ← row 2: status pill
     *   └──────────────────────────────────────────┘
     *
     * The avatar is inlined via `agentAvatarHtml()` because Mermaid's
     * `<foreignObject>` content cannot host Vue components — we
     * can't import the host's `Avatar.vue` directly. The inner
     * palette-bg CSS variable is set inline so the stylesheet can
     * paint the left accent bar via `var(--palette-bg)`.
     */
    const initials = initialsFor(node.name)
    const avatar = agentAvatarHtml(node.profile_picture, initials)
    return (
        `<div class='tg-node' style='--palette-bg:${paletteBg}'>` +
        `<div class='tg-node-accent'></div>` +
        `<div class='tg-node-body'>` +
        `<div class='tg-node-row tg-node-row--main'>` +
        avatar +
        `<span class='tg-node-name'>${name}</span>` +
        `</div>` +
        `<span class='tg-status-pill ${pillClass}'><span class='dot'></span>${pillText}</span>` +
        `</div>` +
        `</div>`
    )
}

/**
 * Compute the uppercase-initials fallback the host Avatar uses when
 * `kind !== 'image'` and the agent has no archetype picked yet.
 * Two letters from the first two whitespace-separated words. Mirrors
 * `DashboardAgentCard.vue → initials()` which the host Avatar
 * receives via its `initials` prop.
 */
function initialsFor(name: string): string {
    const words = name.split(/\s+/).filter((w) => w.length > 0)
    const letters = words.slice(0, 2).map((w) => w[0] ?? '').join('')
    return letters.toUpperCase() || '?'
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

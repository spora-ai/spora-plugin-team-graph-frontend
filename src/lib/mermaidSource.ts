/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * **Mermaid is a layout engine here, not a renderer.** It draws the
 * edges and it decides where every node sits; the visible node card
 * is a Vue component in the sibling HTML overlay (see
 * `lib/nodeLayout.ts`). The node lines are therefore reduced to an
 * id and a plain-text label:
 *
 *   flowchart TB
 *     n11["Marketing Lead"]
 *     n11 --> n4
 *
 * **No `htmlLabels`.** `useMermaidRender.ts` initialises Mermaid with
 * `htmlLabels: false`, so the label becomes a real `<text>` node
 * instead of a `<foreignObject>` wrapper. That matters beyond
 * tidiness: a Vue app cannot mount into an element nested inside
 * `<svg>` (`createApp().mount()` needs an `HTMLDivElement`), so any
 * HTML label would be a dead end for the card component.
 *
 * **No `classDef`.** The node boxes are hidden from `style.css`
 * (`.tg-canvas-content svg g.node rect { fill: transparent }`), not
 * from Mermaid's own theme. Keeping Mermaid's default theme colours
 * means the canvas still degrades to a readable — if plain — diagram
 * if the plugin stylesheet ever fails to load, instead of to a blank
 * rectangle. The agent's palette colour reaches the card through the
 * shared `AgentAvatar`, which reads `profile_picture` directly.
 *
 * **No escaping of the old kind.** The previous version inlined an
 * HTML `<div>` tree into the label, which only had to dodge `'` (the
 * attribute delimiter). A quoted Mermaid string only has to dodge
 * `"`, plus line breaks (they would split the label across
 * `<tspan>`s and inflate the measured box). Everything else is
 * decoded and sanitised by Mermaid. The one residual artefact is
 * Mermaid's `#word;` HTML-entity escape hatch, which round-trips
 * such a name as `&word;` in the SVG text — a purely cosmetic
 * change to a label that is `aria-hidden` and painted transparent,
 * with the real name always on the Vue card.
 */
import type { GraphPayload } from '../types'

/**
 * Make an agent name safe to sit inside `["…"]`.
 *
 * A nullish / empty name still needs *something* in the label —
 * Mermaid measures the text to size the node box, and an empty
 * `<text>` measures as 0 × 0, which would collapse the node's
 * contribution to the layout.
 */
function nodeLabel(name: string): string {
    const cleaned = name.replace(/["\r\n\t]+/g, ' ').trim()
    return cleaned === '' ? 'agent' : cleaned
}

export function buildMermaidSource(graph: GraphPayload): string {
    const lines: string[] = ['flowchart TB']

    for (const node of graph.nodes) {
        lines.push(`  n${node.id}["${nodeLabel(node.name)}"]`)
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

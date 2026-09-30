/**
 * Build the Mermaid `flowchart TB` source for a `GraphPayload`.
 *
 * **Mermaid is a layout engine here, not a renderer.** It draws the edges
 * and decides where every node sits; the visible node card is a Vue
 * component in a sibling HTML overlay (see `lib/nodeLayout.ts`). So node
 * lines are reduced to an id and a plain-text label:
 *
 *   flowchart TB
 *     n11["Marketing Lead"]
 *     n11 --> n4
 *
 * **No `htmlLabels`** (`useMermaidRender.ts` sets it false): a Vue app
 * cannot mount into an element nested inside `<svg>`, so a `<foreignObject>`
 * label would be a dead end for the card component.
 *
 * **No `classDef`.** The node boxes are hidden by `style.css`, not by
 * Mermaid's theme, so keeping Mermaid's defaults means the canvas degrades
 * to a plain but readable diagram if that stylesheet ever fails to load.
 *
 * The residual artefact of Mermaid's own sanitiser is its `#word;` entity
 * escape, which round-trips a name as `&word;` in the SVG text — cosmetic
 * only, on an `aria-hidden` label painted transparent.
 */
import type { GraphPayload } from '../types'

/**
 * Make an agent name safe to sit inside `["…"]`.
 *
 * A nullish / empty name still needs *something* in the label: Mermaid
 * measures the text to size the node box, and an empty `<text>` measures
 * 0 × 0, collapsing the node's contribution to the layout.
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
         * Every configured edge renders as a solid arrow. Configuration is
         * the source of truth on the canvas; the "configured but never
         * fired" distinction lives in the detail panel's secondary label.
         */
        lines.push(`  n${edge.source} --> n${edge.target}`)
    }

    return lines.join('\n')
}

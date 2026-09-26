/**
 * Map `AgentStatus` (wire enum, 11 values) to the Mermaid `classDef`
 * name used in `buildMermaidSource()`. Mermaid has 6 slots; we
 * collapse the wire enum onto those slots, mirroring the other
 * prototypes so the colour palette stays consistent across plugins.
 *
 * Output slugs: `running`, `pending`, `awaiting`, `failed`,
 * `aborted`, `completed`.
 */
import type { AgentStatus } from '../types'

export function statusSlug(status: AgentStatus | string | null | undefined): string {
    if (status === null || status === undefined) return 'completed'
    switch (status) {
        case 'RUNNING':
        case 'APPROVED':
            return 'running'
        case 'PENDING_APPROVAL':
            return 'pending'
        case 'AWAITING_SUB_AGENTS':
        case 'AWAITING_INPUT':
        case 'AWAITING_FINAL_APPROVAL':
            return 'awaiting'
        case 'FAILED':
            return 'failed'
        case 'ABORTED':
            return 'aborted'
        case 'COMPLETED':
        case 'CANCELLED':
        case 'QUEUED':
            return 'completed'
        default:
            return 'completed'
    }
}

/**
 * CSS class name for the status pill rendered inside each Mermaid
 * node's HTML label. The class definitions live in `style.css`;
 * they share the prefix `tg-status-` so they don't collide with
 * the host's `.status-*` Tailwind utilities.
 */
export function statusPillClass(status: AgentStatus | string | null | undefined): string {
    return `tg-status-${statusSlug(status)}`
}

/**
 * Human-readable label for the panel sub-header. Mirrors the
 * `STATUS_LABEL` map in Prototype E so the prototype and the
 * production plugin show the same text.
 *
 * The `default` branch catches statuses the wire carries but the
 * TypeScript union doesn't (and unknown values like `null` /
 * `undefined` from a wire bug). Returning the raw value (or a
 * placeholder for nullish) keeps the canvas renderable instead of
 * crashing on every node.
 */
export function statusLabel(status: AgentStatus | string | null | undefined): string {
    if (status === null || status === undefined) return 'idle'
    switch (status) {
        case 'RUNNING':
            return 'running'
        case 'PENDING_APPROVAL':
            return 'awaiting approval'
        case 'AWAITING_SUB_AGENTS':
            return 'awaiting sub-agent'
        case 'AWAITING_INPUT':
            return 'awaiting input'
        case 'AWAITING_FINAL_APPROVAL':
            return 'awaiting final approval'
        case 'APPROVED':
            return 'approved'
        case 'FAILED':
            return 'failed'
        case 'ABORTED':
            return 'aborted'
        case 'COMPLETED':
            return 'idle'
        case 'CANCELLED':
            return 'cancelled'
        case 'QUEUED':
            return 'queued'
        default:
            /* Unknown status — display the raw value so the operator
             * sees what the wire actually carries. The status slug
             * falls back to 'completed' (the neutral bucket) below. */
            return typeof status === 'string' && status.length > 0 ? status : 'idle'
    }
}

/**
 * Background colour for the panel's avatar / pill dots. Mirrors the
 * `STATUS_PILL_BG` map in Prototype E.
 *
 * `ABORTED` uses fuchsia-500 instead of the original purple (#a855f7):
 * the host's app accent is violet, so two near-blue swatches on the
 * same canvas read as duplicates and the operator can't tell at a
 * glance whether an aborted node belongs to the same colour family
 * as the brand. Fuchsia lives far enough down the spectrum to remain
 * distinct under both light/dark and never collides with our accent.
 */
export function statusColor(status: AgentStatus | string | null | undefined): string {
    switch (status) {
        case 'RUNNING':
            return '#10b981'
        case 'PENDING_APPROVAL':
            return '#6366f1'
        case 'AWAITING_SUB_AGENTS':
        case 'AWAITING_INPUT':
        case 'AWAITING_FINAL_APPROVAL':
            return '#f59e0b'
        case 'APPROVED':
            return '#06b6d4'
        case 'FAILED':
            return '#ef4444'
        case 'ABORTED':
            return '#d946ef'
        case 'COMPLETED':
        case 'CANCELLED':
            return '#94a3b8'
        case 'QUEUED':
            return '#cbd5e1'
        default:
            return '#94a3b8'
    }
}
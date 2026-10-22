/**
 * Map a wire status onto one of six status slugs: `running`, `pending`,
 * `awaiting`, `failed`, `aborted`, `completed`.
 *
 * The slugs are the plugin's own — `style.css` defines one
 * `tg-status-<slug>` rule per slug, and the prefix keeps them from
 * colliding with the host's `.status-*` utilities.
 */
import { t } from '../i18n'
import type { WireStatus } from '../types'

export function statusSlug(status: WireStatus): string {
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
 * CSS class name for the status pill. The class definitions live in
 * `style.css`.
 */
export function statusPillClass(status: WireStatus): string {
    return `tg-status-${statusSlug(status)}`
}

/**
 * Human-readable label for the panel sub-header. Mirrors the `STATUS_LABEL`
 * map in `spora-workspace/prototypes/prototype-e-mermaid.html`.
 *
 * The labels are operator-facing copy, so they go through the
 * catalogue — the panel, the node cards and the legend all read the
 * label from here, and one table is what keeps the three surfaces
 * saying the same thing in every language.
 *
 * The `default` branch catches statuses the wire carries but the
 * TypeScript union doesn't (and unknown values like `null` /
 * `undefined` from a wire bug). Returning the raw value (or a
 * placeholder for nullish) keeps the canvas renderable instead of
 * crashing on every node — and the raw value is a wire identifier,
 * not copy, so it is deliberately *not* translated.
 */
export function statusLabel(status: WireStatus): string {
    if (status === null || status === undefined) return t('idle')
    switch (status) {
        case 'RUNNING':
            return t('running')
        case 'PENDING_APPROVAL':
            return t('awaiting approval')
        case 'AWAITING_SUB_AGENTS':
            return t('awaiting sub-agent')
        case 'AWAITING_INPUT':
            return t('awaiting input')
        case 'AWAITING_FINAL_APPROVAL':
            return t('awaiting final approval')
        case 'APPROVED':
            return t('approved')
        case 'FAILED':
            return t('failed')
        case 'ABORTED':
            return t('aborted')
        case 'COMPLETED':
            return t('idle')
        case 'CANCELLED':
            return t('cancelled')
        case 'QUEUED':
            return t('queued')
        default:
            /* Unknown status — display the raw value so the operator
             * sees what the wire actually carries. The status slug
             * falls back to 'completed' (the neutral bucket) in
             * `statusSlug`, above. */
            return typeof status === 'string' && status.length > 0 ? status : t('idle')
    }
}

/**
 * Background colour for the panel's avatar / pill dots. Mirrors the
 * `STATUS_PILL_BG` map in
 * `spora-workspace/prototypes/prototype-e-mermaid.html`.
 *
 * `ABORTED` uses fuchsia-500 instead of the original purple (#a855f7):
 * the host's app accent is violet, so two near-blue swatches on the
 * same canvas read as duplicates and the operator can't tell at a
 * glance whether an aborted node belongs to the same colour family
 * as the brand. Fuchsia lives far enough down the spectrum to remain
 * distinct under both light/dark and never collides with our accent.
 */
export function statusColor(status: WireStatus): string {
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
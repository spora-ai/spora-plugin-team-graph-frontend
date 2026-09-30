/**
 * Map the team-graph wire shape onto the shared `@spora-ai/components`
 * avatar primitives.
 *
 * **Why the mapping lives here and not in the package.** The shared
 * `AgentAvatar` is domain-agnostic: it takes `{ name, profile_picture }`,
 * and the wire shape is snake_case, so the two are not structurally
 * assignable. Keeping the coercion in the plugin leaves the package free of
 * any one backend's field naming.
 *
 * **Status lives on a wrapper, not on the avatar.** `AgentAvatar` has no
 * `status` prop — it forwards name / picture to `Avatar` and stops — so the
 * panel paints the status ring using the colour this module resolves.
 */
import { STATUS_PALETTE, statusDisplay } from '@spora-ai/components/avatar'
import type { ProfilePicture } from '@spora-ai/components/types'
import { statusColor } from './nodeStatus'
import type { GraphNode, WireStatus } from '../types'

/**
 * The `agent` prop shape `AgentAvatar` expects. Re-declared rather than
 * imported from the package's `.vue` types because the published
 * `AgentAvatar.vue.d.ts` exposes the props only through `DefineComponent`.
 */
export interface AgentAvatarSubject {
    name: string | null
    profile_picture: ProfilePicture | null
}

/**
 * Coerce a wire `profile_picture` into the package's `ProfilePicture`.
 *
 * Returns `null` when there is no picture, and when the `kind`
 * discriminant is missing. That second case matters: `Avatar` branches on
 * `kind`, so an object without one would silently drop to the initials
 * branch while looking as though a picture was configured.
 *
 * **`variant_key` must be forwarded, never derived here.** On the `avatar`
 * branch the endpoint already runs the host's FNV-1a derivation rather
 * than forwarding null, and `Avatar` takes its archetype branch only when
 * `variant_key` is a string. Re-deriving it client-side would make the
 * canvas glyph disagree with the dashboard's — the one thing the
 * shared derivation exists to prevent.
 */
export function toProfilePicture(node: GraphNode | undefined): ProfilePicture | null {
    const picture = node?.profile_picture
    if (picture === null || picture === undefined) return null
    if (picture.kind !== 'avatar' && picture.kind !== 'image') return null
    return {
        kind: picture.kind,
        archetype: picture.archetype ?? null,
        variant_key: picture.variant_key ?? null,
        palette_key: picture.palette_key,
        bg_color: picture.bg_color,
        fg_color: picture.fg_color,
        image_url: picture.image_url ?? null,
        image_updated_at: picture.image_updated_at ?? null,
    }
}

/**
 * The `agent` object for `<AgentAvatar>`. A node that isn't in the payload
 * (a dangling edge) maps to `name: null` so `useInitials` returns `'?'` —
 * the fallback the panel's own helper produced for a missing node.
 */
export function avatarSubject(node: GraphNode | undefined): AgentAvatarSubject {
    return {
        name: node?.name ?? null,
        profile_picture: toProfilePicture(node),
    }
}

/**
 * Inline custom properties carrying the agent's server-resolved palette
 * onto the tile, for the **initials fallback** branch.
 *
 * **The gap this closes.** `Avatar` paints the initials tile only with
 * `var(--spora-avatar-bg, #475569)` / `var(--spora-avatar-fg, #f8fafc)`,
 * and its archetype branch ignores them. So an agent with no archetype fell
 * back to hard-coded *slate* and lost its palette — a grey tile on an agent
 * the dashboard paints green. Feeding the two resolved hex values through
 * the hook the package already reads restores the colour without
 * reimplementing the tile.
 *
 * Returns `{}` when either colour is missing or not a string, so the
 * package's own fallbacks apply rather than `undefined` leaking into a
 * custom property.
 */
export function avatarPaletteStyle(node: GraphNode | undefined): Record<string, string> {
    const picture = node?.profile_picture
    if (picture === undefined) return {}
    const { bg_color: bg, fg_color: fg } = picture
    if (typeof bg !== 'string' || typeof fg !== 'string') return {}
    return { '--spora-avatar-bg': bg, '--spora-avatar-fg': fg }
}

/**
 * Tint strength (percent white) mixed into `statusColor()` for the five
 * wire statuses the shared `STATUS_PALETTE` does not cover: `APPROVED`,
 * `AWAITING_INPUT`, `AWAITING_FINAL_APPROVAL`, `CANCELLED`, `QUEUED`.
 *
 * `statusDisplay()` would collapse all five onto the neutral `COMPLETED`
 * entry and repaint them as idle, so palette membership is checked *before*
 * asking the package.
 */
const UNPACKAGED_TINT_MIX = 60

/**
 * The neutral status a nullish wire value resolves to, named so the default
 * parameter and the `null` fold in `statusRingColor` cannot drift apart.
 */
const NEUTRAL_STATUS = 'COMPLETED'

/**
 * Ring colour for an avatar tile, painted by the panel's `.tg-agent-tile`
 * wrapper (see `AgentDetailPanel.vue`).
 *
 * Package-covered statuses return the package's own `ringColor` verbatim, so
 * the sidebar's swatches cannot drift from the dashboard's status dots.
 * Everything else falls back to a 60 %-white tint of the plugin's
 * `statusColor()` — the `color-mix` idiom `Avatar` uses for its archetype
 * gradient, and the same lightness band the packaged values occupy.
 *
 * **A nullish status resolves to the packaged `COMPLETED` swatch** rather
 * than `statusColor(null)`'s `default` arm, so both halves agree on one
 * neutral. The two guards are deliberately separate: a default parameter
 * only fires for `undefined`, not for the wire's own `null`.
 */
export function statusRingColor(status: WireStatus = NEUTRAL_STATUS): string {
    const key: Exclude<WireStatus, null | undefined> = status ?? NEUTRAL_STATUS
    if (Object.hasOwn(STATUS_PALETTE, key)) {
        const display = statusDisplay(key)
        if (display !== null) return display.ringColor
    }
    return `color-mix(in srgb, ${statusColor(key)} ${UNPACKAGED_TINT_MIX}%, white)`
}

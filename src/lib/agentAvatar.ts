/**
 * Map the team-graph wire shape onto the shared
 * `@spora-ai/components` avatar primitives.
 *
 * **Why the mapping lives here and not in the package.** The shared
 * `AgentAvatar` is deliberately domain-agnostic: it takes a
 * `{ name, profile_picture }` object. The team-graph wire shape is
 * snake_case and carries only the fields the canvas needs, so the
 * two shapes are not structurally assignable. Keeping the coercion
 * in the plugin means the package stays free of any single backend's
 * field naming, and the panel call sites read as
 * `:agent="avatarSubject(row.node)"` rather than a wall of
 * `?? null` fallbacks.
 *
 * **Status lives on a wrapper, not on the avatar.** `AgentAvatar`
 * has no `status` prop — it forwards `agent.name` /
 * `agent.profile_picture` to `Avatar` and stops there, so the tile
 * has no status channel of its own. The status is therefore painted
 * as a ring on the wrapping element by the panel, using the colour
 * this module resolves. See `statusRingColor` for the coverage
 * rules.
 */
import { STATUS_PALETTE, statusDisplay } from '@spora-ai/components/avatar'
import type { ProfilePicture } from '@spora-ai/components/types'
import { statusColor } from './nodeStatus'
import type { GraphNode, WireStatus } from '../types'

/**
 * The `agent` prop shape `AgentAvatar` expects. Re-declared here
 * (rather than imported from the package's `.vue` types) because the
 * published `AgentAvatar.vue.d.ts` only exposes the props through
 * `DefineComponent`, not as a named interface.
 */
export interface AgentAvatarSubject {
    name: string | null
    profile_picture: ProfilePicture | null
}

/**
 * Coerce a wire `profile_picture` into the package's `ProfilePicture`.
 *
 * Returns `null` when the node carries no picture at all, or when the
 * `kind` discriminant is missing. That second case matters: `Avatar`
 * picks its branch from `kind`, so handing it an object without one
 * would silently drop the agent to the initials branch while looking
 * like a picture was configured. Returning `null` makes the fallback
 * explicit at the call site instead of implicit in the component.
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
 * The `agent` object for `<AgentAvatar>`.
 *
 * A node that isn't in the payload (a dangling edge) maps to
 * `name: null` rather than a placeholder string, so `useInitials`
 * returns `'?'` — the same fallback the panel's previous
 * `initialsFor()` helper produced for a missing node.
 */
export function avatarSubject(node: GraphNode | undefined): AgentAvatarSubject {
    return {
        name: node?.name ?? null,
        profile_picture: toProfilePicture(node),
    }
}

/**
 * Tint strength (percent white) mixed into `statusColor()` for the
 * five wire statuses the shared `STATUS_PALETTE` does not cover:
 * `APPROVED`, `AWAITING_INPUT`, `AWAITING_FINAL_APPROVAL`,
 * `CANCELLED` and `QUEUED`.
 *
 * `APPROVED` / `AWAITING_INPUT` / `AWAITING_FINAL_APPROVAL` are
 * siblings of the covered `AWAITING_SUB_AGENTS`; `CANCELLED` and
 * `QUEUED` are siblings of the covered `COMPLETED`.
 * `statusDisplay()` would collapse all five onto the neutral
 * `COMPLETED` entry, repainting them as idle — so this module checks
 * palette membership *before* asking the package, and derives a tint
 * from the plugin's own `statusColor()` when the answer is no.
 *
 * Note that the team-graph endpoint today only ever emits
 * `RUNNING` / `AWAITING_SUB_AGENTS` / `PENDING_APPROVAL` /
 * `COMPLETED` (see `NodeResolver::resolveNodes`'s `status IN (…)`
 * sub-select), so all four are covered by the package and the
 * fallback is defensive against schema drift — which is exactly what
 * `WireStatus` was widened to tolerate.
 */
const UNPACKAGED_TINT_MIX = 60

/**
 * The neutral status a nullish wire value resolves to, named so the
 * default parameter and the `null` fold in `statusRingColor` cannot
 * drift apart.
 */
const NEUTRAL_STATUS = 'COMPLETED'

/**
 * Ring colour for an avatar tile, painted by the panel's
 * `.tg-agent-tile` wrapper (see `AgentDetailPanel.vue`).
 *
 * Package-covered statuses return the package's own `ringColor`
 * verbatim, so the sidebar's swatches cannot drift from the
 * dashboard's avatar status dots. Everything else falls back to a
 * 60 %-white tint of the plugin's `statusColor()` — the same
 * `color-mix` idiom `Avatar` uses for its archetype gradient, and the
 * same lightness band the package's own `ringColor` values occupy
 * (e.g. emerald-100 `#d1fae5` against emerald-500 `#10b981`).
 *
 * **A nullish status resolves to the packaged `COMPLETED` swatch**
 * rather than to `statusColor(null)`'s `default` arm, so the packaged
 * and unpackaged paths agree on the same neutral swatch. The two
 * halves of that are deliberately separate: the default parameter
 * covers a *missing* / `undefined` argument, and the `??` in the body
 * covers the wire's own `null`, which a default parameter does not
 * catch (it only fires for `undefined`).
 */
export function statusRingColor(status: WireStatus = NEUTRAL_STATUS): string {
    const key: Exclude<WireStatus, null | undefined> = status ?? NEUTRAL_STATUS
    if (Object.hasOwn(STATUS_PALETTE, key)) {
        const display = statusDisplay(key)
        if (display !== null) return display.ringColor
    }
    return `color-mix(in srgb, ${statusColor(key)} ${UNPACKAGED_TINT_MIX}%, white)`
}

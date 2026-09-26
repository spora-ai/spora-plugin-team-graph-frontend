/**
 * Real principal list — drives the left-column PrincipalListSidebar.
 *
 * Replaces the previous dual-mode selector (fixtures vs real principals).
 * The plugin always talks to the live `/principals/me` endpoint now,
 * so the canvas renders real data the moment auth succeeds.
 *
 * `/principals/me` mirrors the host SPA's
 * `spora-frontend/src/api/principals.ts`; it's the only endpoint that
 * scopes principals to the **current caller** (one user-principal +
 * every group the user is a member of), which is exactly what the
 * sidebar needs.
 *
 * The wire shape carries everything the sidebar needs:
 *   - `id`             — used as the foreign key for the graph endpoint
 *   - `type`           — `user` vs `group`; the sidebar labels the user's
 *                        own principal as "My Agents" (matches the
 *                        convention used in Notion / Linear / similar
 *                        agentic tools)
 *   - `name`           — group display name (e.g. "Marketing")
 *   - `is_current_user_owned` — used to (a) drive the "My Agents" rename
 *                        and (b) highlight the user's own principal
 *                        in the sidebar so it's always obvious which
 *                        entry is "you"
 */
import { getApi } from './client'

export interface PrincipalSummary {
    id: number
    type: 'user' | 'group'
    name: string
    is_current_user_owned: boolean
}

interface PrincipalsWire {
    principals: PrincipalSummary[]
}

export async function fetchPrincipals(): Promise<PrincipalSummary[]> {
    const result = await getApi().get<PrincipalsWire>('/principals/me')
    return result.principals ?? []
}

/**
 * Stable, user-facing label for a principal entry. The user's own
 * user-principal is always rendered as "My Agents" regardless of what
 * the wire says, because the underlying `name` is usually the user's
 * email or username which reads as personal identity in a sidebar full
 * of group names.
 */
export function principalLabel(principal: PrincipalSummary): string {
    if (principal.type === 'user' && principal.is_current_user_owned) {
        return 'My Agents'
    }
    return principal.name
}

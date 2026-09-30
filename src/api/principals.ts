/**
 * Principal list for the left-column sidebar.
 *
 * `/principals/me` mirrors the host SPA's
 * `spora-frontend/src/api/principals.ts`; it is the only endpoint that
 * scopes principals to the *current caller* (the user-principal plus every
 * group they belong to), which is what the sidebar needs.
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
 * user-principal always reads as "My Agents" regardless of the wire, because
 * its `name` is usually an email or username — personal identity, in a
 * sidebar full of group names.
 */
export function principalLabel(principal: PrincipalSummary): string {
    if (principal.type === 'user' && principal.is_current_user_owned) {
        return 'My Agents'
    }
    return principal.name
}

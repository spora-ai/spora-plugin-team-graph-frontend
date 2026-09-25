/**
 * Fetch the principal list (the user's own user-principal plus every
 * group they belong to) once on mount.
 *
 * `selectedPrincipalId` defaults to the user's own user-principal so
 * the canvas opens against the operator's own team (the convention in
 * Notion / Linear / similar agentic tools); the page falls back to
 * the first entry on the list when no user-principal is on file
 * (rare; can happen if the account was created outside the standard
 * bootstrap).
 *
 * The state is owned per-page-mount rather than cached in Pinia
 * because every TeamGraphPage instance has exactly one principal
 * selection — sharing a Pinia store would couple two unrelated
 * tabs without buying anything.
 */
import { ref, type Ref } from 'vue'
import { fetchPrincipals, type PrincipalSummary } from '../api/principals'

export interface UsePrincipalList {
    principals: Ref<PrincipalSummary[]>
    selectedPrincipalId: Ref<number | null>
    loading: Ref<boolean>
    error: Ref<string | null>
    select: (id: number) => void
    reload: () => Promise<void>
}

export function usePrincipalList(): UsePrincipalList {
    const principals = ref<PrincipalSummary[]>([])
    const selectedPrincipalId = ref<number | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function load(): Promise<void> {
        loading.value = true
        try {
            const list = await fetchPrincipals()
            principals.value = list
            if (selectedPrincipalId.value === null) {
                const own = list.find((p) => p.type === 'user' && p.is_current_user_owned)
                selectedPrincipalId.value = own !== undefined ? own.id : (list[0]?.id ?? null)
            }
            error.value = null
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'failed to load principals'
            principals.value = []
        } finally {
            loading.value = false
        }
    }

    function select(id: number): void {
        selectedPrincipalId.value = id
    }

    /* Auto-load on mount. Mirrors `useTeamGraph`'s immediate-fetch
     * pattern (the principal list is a one-shot — no polling) so the
     * page's setup is symmetric: every fetch loads as soon as the
     * composable wires up. */
    void load()

    return {
        principals,
        selectedPrincipalId,
        loading,
        error,
        select,
        reload: load,
    }
}

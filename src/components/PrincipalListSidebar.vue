<script setup lang="ts">
/**
 * Left-column principal list.
 *
 * One graph per principal: the operator's own user-principal ("My Agents")
 * plus every group principal they're a member of. Clicking a row
 * switches the main canvas to render that principal's directed graph;
 * the previously-selected agent's detail panel stays put if the new
 * principal still owns the same agent id — but in practice selection
 * clears on principal switch because the agent ids aren't shared
 * between principals.
 *
 * Order is owned by the host's `/api/v1/principals` response (which
 * returns the user's own user-principal first, then group principals),
 * so this sidebar sorts nothing — just renders the wire order. Empty
 * lists (no principals) get a single muted row explaining the situation
 * so the layout doesn't collapse.
 */
import { computed } from 'vue'
import { principalLabel, type PrincipalSummary } from '../api/principals'

const props = defineProps<{
    principals: PrincipalSummary[]
    selectedId: number | null
    loading: boolean
}>()

const emit = defineEmits<{
    select: [id: number]
}>()

interface Row {
    id: number
    label: string
    badge: 'MY' | 'GROUP'
    isSelected: boolean
    isDisabled: boolean
}

const rows = computed<Row[]>(() => {
    return props.principals.map((p) => ({
        id: p.id,
        label: principalLabel(p),
        badge: p.type === 'user' && p.is_current_user_owned ? 'MY' : 'GROUP',
        isSelected: p.id === props.selectedId,
        isDisabled: false,
    }))
})

function onClick(row: Row): void {
    if (row.isDisabled) return
    emit('select', row.id)
}
</script>

<template>
    <nav
        data-testid="tg-principal-sidebar"
        aria-label="Principals"
        class="surface-card border border-border rounded-xl bg-card text-card-foreground overflow-hidden"
    >
        <header class="px-4 py-3 border-b border-border">
            <h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Teams
            </h2>
            <p class="text-xs text-muted-foreground mt-0.5">
                One graph per principal.
            </p>
        </header>
        <ul class="py-1">
            <li v-if="loading && rows.length === 0" class="px-4 py-3 text-xs text-muted-foreground">
                Loading principals…
            </li>
            <li
                v-else-if="!loading && rows.length === 0"
                class="px-4 py-3 text-xs text-muted-foreground"
            >
                No principals available for this user.
            </li>
            <li v-for="row in rows" :key="row.id">
                <button
                    type="button"
                    :data-testid="`tg-principal-row-${row.id}`"
                    :aria-current="row.isSelected ? 'page' : undefined"
                    class="tg-principal-row w-full text-left"
                    :class="row.isSelected ? 'is-selected' : ''"
                    :disabled="row.isDisabled"
                    @click="onClick(row)"
                >
                    <div class="flex items-center gap-3 min-w-0">
                        <span
                            class="tg-principal-row__badge shrink-0"
                            :class="row.badge === 'MY' ? 'tg-principal-row__badge--my' : 'tg-principal-row__badge--group'"
                            aria-hidden="true"
                        >
                            {{ row.badge === 'MY' ? 'MY' : 'G' }}
                        </span>
                        <span class="min-w-0 truncate text-sm font-medium">
                            {{ row.label }}
                        </span>
                    </div>
                    <svg
                        v-if="row.isSelected"
                        class="w-3.5 h-3.5 text-foreground shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </button>
            </li>
        </ul>
    </nav>
</template>

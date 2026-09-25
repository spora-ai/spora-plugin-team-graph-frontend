<script setup lang="ts">
/**
 * Principal selector dropdown.
 *
 * Two modes:
 *  - **Fixture mode** — when the API response's `fixtures: [...]`
 *    is non-empty, the dropdown lists demo principals (Tiny Startup
 *    / Marketing / Solo) and selection emits a `fixtureKey`.
 *  - **Real-principal mode** — when `fixtures` is absent, the
 *    dropdown is fed by `GET /api/v1/principals` and selection
 *    emits a numeric `principalId`.
 *
 * `v-model` carries either `{ kind: 'fixture', key }` or
 * `{ kind: 'real', id }`. The page wires both events.
 */
import { computed, ref, watch } from 'vue'
import type { FixtureSummary } from '../types'

export interface PrincipalOption {
    key: string
    label: string
}

const props = defineProps<{
    fixtures: FixtureSummary[]
    /** Real principals (only used when `fixtures` is empty). */
    principals?: { id: number; name: string }[]
}>()

const emit = defineEmits<{
    'update:fixtureKey': [key: string]
    'update:principalId': [id: number]
}>()

interface Mode {
    kind: 'fixture' | 'real'
    options: PrincipalOption[]
    selected: string
}

const mode = computed<Mode>(() => {
    if (props.fixtures.length > 0) {
        const first = props.fixtures[0]
        return {
            kind: 'fixture',
            options: props.fixtures.map((f) => ({ key: f.key, label: f.label })),
            selected: first?.key ?? '',
        }
    }
    const ps = props.principals ?? []
    const first = ps[0]
    return {
        kind: 'real',
        options: ps.map((p) => ({ key: String(p.id), label: p.name })),
        selected: first !== undefined ? String(first.id) : '',
    }
})

const selectedKey = ref(mode.value.selected)
watch(mode, (next) => {
    selectedKey.value = next.selected
})

const handleChange = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement)) return
    const value = target.value
    selectedKey.value = value
    if (mode.value.kind === 'fixture') {
        emit('update:fixtureKey', value)
    } else {
        emit('update:principalId', Number(value))
    }
}
</script>

<template>
    <label class="flex items-center gap-2">
        <span class="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Principal</span>
        <select
            data-testid="tg-principal-select"
            class="tg-select"
            :value="selectedKey"
            :disabled="mode.options.length === 0"
            @change="handleChange"
        >
            <option
                v-for="option in mode.options"
                :key="option.key"
                :value="option.key"
            >
                {{ option.label }}
            </option>
            <option
                v-if="mode.options.length === 0"
                value=""
                disabled
            >
                No principals available
            </option>
        </select>
    </label>
</template>
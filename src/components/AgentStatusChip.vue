<script setup lang="ts">
/**
 * Status pill for the agent-detail header.
 *
 * **Why a separate component?** The detail panel's header re-renders as a
 * unit when `selectedNode` changes — which happens on every 30-second poll
 * even when only the agent's status flipped (e.g. RUNNING → COMPLETED).
 * Keeping the pill in its own component means Vue can patch just the pill
 * when only `:status` changed, and leave the header's static name line
 * alone.
 */
import { statusPillClass, statusLabel } from '../lib/nodeStatus'
import type { WireStatus } from '../types'

defineProps<{
    status: WireStatus
}>()
</script>

<template>
    <span
        class="tg-status-pill"
        :class="statusPillClass(status)"
        data-testid="tg-status-chip"
    >
        <span class="dot" />
        {{ statusLabel(status) }}
    </span>
</template>

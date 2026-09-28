<script setup lang="ts">
/**
 * Status pill for the agent-detail header.
 *
 * **Why a separate component?** The detail panel's header currently
 * re-renders as a unit when `selectedNode` changes — which happens
 * on every 30-second poll even when only the agent's status
 * flipped (e.g. RUNNING → COMPLETED). That cascades into a layout
 * shift on the name + ID line, which is unrelated to the status.
 *
 * Extracting the chip into its own component means Vue tracks the
 * `:status` prop reactively: when the parent re-evaluates, only
 * this child re-renders. The header's static text (name + #ID)
 * stays untouched.
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

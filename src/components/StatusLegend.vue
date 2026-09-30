<script setup lang="ts">
/**
 * Status colour legend + edge direction legend.
 *
 * Static, no props. Sits between the toolbar and the canvas so the
 * operator can decode the colour palette without opening the host's
 * docs.
 *
 * Colours and labels come from the shared `@spora-ai/components`
 * `STATUS_PALETTE` so the swatches can't drift from the dashboard's
 * avatar status dots. Only the six statuses the canvas actually
 * paints are listed; the other five wire statuses collapse onto one
 * of these six slugs (see `lib/nodeStatus.ts`).
 *
 * The component is deliberately NOT named `Legend`: Sonar's web
 * analyser matches Vue tag names case-insensitively against the HTML
 * `<legend>` element and files an accessibility finding (Web:S8732)
 * for a `<legend />` that sits outside any `<fieldset>`.
 */
import { STATUS_PALETTE } from '@spora-ai/components/avatar'

const LEGEND_STATUSES = [
    'RUNNING',
    'PENDING_APPROVAL',
    'AWAITING_SUB_AGENTS',
    'FAILED',
    'ABORTED',
    'COMPLETED',
] as const
</script>

<template>
    <div
        data-testid="tg-legend"
        class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3"
    >
        <span
            v-for="status in LEGEND_STATUSES"
            :key="status"
            class="flex items-center gap-1"
        >
            <span
                class="w-2 h-2 rounded-full"
                :style="{ background: STATUS_PALETTE[status].color }"
            />
            {{ STATUS_PALETTE[status].label }}
        </span>
        <span class="mx-2 text-muted-foreground/50">·</span>
        <span class="flex items-center gap-1">
            <span class="w-3 h-0.5" style="background: #059669" />
            you spawned them
        </span>
        <span class="flex items-center gap-1">
            <span class="w-3 h-0.5" style="background: #4f46e5" />
            they spawned you
        </span>
    </div>
</template>

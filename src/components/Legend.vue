<script setup lang="ts">
/**
 * Status colour legend + edge direction legend.
 *
 * Static, no props. Sits between the toolbar and the canvas so the
 * operator can decode the colour palette without opening the host's
 * docs.
 */
const STATUS_LEGEND = [
    { key: 'running', label: 'running', color: '#10b981' },
    { key: 'pending', label: 'awaiting approval', color: '#6366f1' },
    { key: 'awaiting', label: 'awaiting sub-agent', color: '#f59e0b' },
    { key: 'failed', label: 'failed', color: '#ef4444' },
    { key: 'aborted', label: 'aborted', color: '#d946ef' },
    { key: 'completed', label: 'idle', color: '#94a3b8' },
] as const
</script>

<template>
    <div
        data-testid="tg-legend"
        class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3"
    >
        <span
            v-for="item in STATUS_LEGEND"
            :key="item.key"
            class="flex items-center gap-1"
        >
            <span
                class="w-2 h-2 rounded-full"
                :style="{ background: item.color }"
            />
            {{ item.label }}
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
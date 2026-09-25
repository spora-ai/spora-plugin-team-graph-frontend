<script setup lang="ts">
/**
 * Static fallback shown when the graph endpoint returns an error
 * (network failure, 403 because the operator lost access, 422
 * because the principal id is missing). Renders inside the
 * canvas slot so the toolbar stays usable — the operator can
 * still pick a different principal or hit Refresh.
 */
defineProps<{
    message: string
}>()
</script>

<template>
    <div
        data-testid="tg-error-fallback"
        class="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-6"
    >
        <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5" />
                <circle cx="12" cy="16" r="0.5" />
            </svg>
        </div>
        <p class="text-sm font-medium text-foreground">Failed to load team graph</p>
        <p class="text-xs text-muted-foreground mt-1 max-w-[360px]">
            {{ message }}
        </p>
        <slot />
    </div>
</template>
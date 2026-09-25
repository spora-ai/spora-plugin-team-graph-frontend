<script setup lang="ts">
/**
 * App.vue — single-page admin UI. The plugin mounts this under a
 * slot owned by the host's `PluginAppPage.vue`; `TeamGraphPage.vue`
 * carries the actual toolbar + canvas + sidebar/modal layout.
 *
 * The `<div id="spora-plugin-team-graph">` root wrapper matches
 * `tailwind.config.ts → important: '#spora-plugin-team-graph'`, scoping
 * every Tailwind utility to this subtree so plugin classes can't
 * leak into the host SPA or sibling plugins. Mirrors the
 * memories/typst `id="spora-plugin-<slug>"` wrapper (the host SPA's
 * `PluginAppPage.vue` slot is just a plain `<div ref="slotRef">` —
 * no id — so the plugin owns the scope boundary itself).
 */
import TeamGraphPage from './components/TeamGraphPage.vue'
import './style.css'

defineProps<{
    hostContext: import('./shims').PluginHostContext
}>()
</script>

<template>
    <div id="spora-plugin-team-graph">
        <TeamGraphPage :host-context="hostContext" />
    </div>
</template>
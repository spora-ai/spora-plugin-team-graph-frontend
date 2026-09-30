/**
 * Tailwind v4 config shim — the *only* thing left in JS.
 *
 * Everything else moved to CSS: the theme tokens now live in the
 * `@theme` block in `src/style.css`, dark mode is a `@custom-variant`
 * there, and source detection is driven by explicit `@source`
 * directives there. That's the v4 direction, and it matches
 * `spora-frontend/src/style.css`.
 *
 * `important` has no CSS-native equivalent in v4, and it is the one
 * option that MUST NOT be dropped, so it stays here (v4 reads it
 * through the `@config` directive in `style.css`).
 *
 * **Why selector-scoped `important` matters.** v3's
 * `important: '#spora-plugin-team-graph'` rewrote every generated
 * selector to `#spora-plugin-team-graph .w-4` — prefixing the
 * selector, *not* adding `!important` to the declarations (verified
 * against a 3.4.19 build). v4 supports the exact same rewrite via
 * `@config`, so the emitted CSS is byte-for-byte equivalent.
 *
 * The two obvious v4 alternatives are both wrong here:
 *  - `@import "tailwindcss/utilities.css" layer(utilities) important`
 *    marks every utility `!important` but emits it **unscoped**, so
 *    `.flex` / `.w-4` / `.grid` would leak into the host SPA and any
 *    sibling plugin slot.
 *  - `prefix(tw)` renames the *class names* (`.tw-flex`), which the
 *    plugin's markup doesn't use.
 *
 * The ID prefix also does real work beyond containment: `#spora-plugin-team-graph .w-4`
 * is (1,1,0) and so outranks the host SPA's own unprefixed rules.
 *
 * The scope boundary is the `<div id="spora-plugin-team-graph">` that
 * `App.vue` renders — the host's `PluginAppPage.vue` slot is a plain
 * `<div ref>`, so the plugin owns the boundary itself.
 */
export default {
    important: '#spora-plugin-team-graph',
}

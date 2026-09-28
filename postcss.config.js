/**
 * PostCSS config — runs Tailwind through PostCSS for the plugin's
 * own utility classes. Mirrors `spora-plugin-typst-frontend/postcss.config.js`,
 * plus one pre-plugin (see below).
 *
 * **Why the pre-plugin exists.** As of `@spora-ai/components@0.1.1`
 * the package's `spora-components.css` wraps every rule in
 * `@layer components { … }`. Vite runs PostCSS per file rather than
 * on the concatenated bundle, so that stylesheet is always its own
 * PostCSS root — and it contains no `@tailwind` directives at all.
 * Tailwind's `normalizeTailwindDirectives` guard then throws:
 *
 *   `[vite:css] [postcss] …/spora-components.css:1:1: '@layer
 *    components' is used but no matching '@tailwind components'
 *    directive is present.`
 *
 * Import order cannot fix it (the two files never share a root), and
 * neither can adding the missing `@tailwind` directives: this plugin
 * runs with `corePlugins.preflight: false`, so it never emits
 * `@tailwind base`, and the guard requires all three. Folding the
 * package CSS into ours with an `@import` "works" but is a trap —
 * when Tailwind sees a hand-written `@layer` next to a `@tailwind`
 * directive it discards the manual block, so the build succeeds
 * while silently dropping `.avatar--sm`, `.avatar--initials` and
 * `.spora-icon` and rendering unsized, uncoloured avatars. Verified;
 * don't "fix" it that way.
 *
 * So the pre-plugin renames the *managed* layer names (`base`,
 * `components`, `utilities`) inside vendor stylesheets to
 * `vendor-<name>`. Tailwind ignores layer names it doesn't own, so
 * the build passes and every rule survives. The cascade is also
 * preserved rather than lost: `App.vue` imports the package CSS
 * first, so `vendor-components` is declared before Tailwind's own
 * `components` / `utilities` layers and therefore ranks below them —
 * which is exactly the override-ability the package's `Avatar.vue`
 * documents it wants (consumer utilities beat vendor rules).
 */
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const TAILWIND_MANAGED_LAYERS = new Set(['base', 'components', 'utilities'])

/** Rewrites managed `@layer` names inside `@spora-ai/components`' CSS. */
const scopeVendorLayers = {
    postcssPlugin: 'tg-scope-vendor-layers',
    Once(root, { result }) {
        const from = String(result.opts.from ?? '')
        if (!from.includes('@spora-ai/components')) return
        root.walkAtRules('layer', (atRule) => {
            if (TAILWIND_MANAGED_LAYERS.has(atRule.params)) {
                atRule.params = `vendor-${atRule.params}`
            }
        })
    },
}

export default {
    plugins: [scopeVendorLayers, tailwindcss(), autoprefixer()],
}

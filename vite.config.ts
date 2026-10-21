import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * Vite config for the Team Graph IIFE bundle.
 *
 * Mirrors `spora-plugin-typst-frontend/vite.config.ts` byte-for-byte
 * for the shape (lib.formats/name/fileName/external/output.globals/
 * assetFileNames, server.port, test block); only the slug, lib.name
 * (must match `apps/registry.ts → globalFor('team-graph')` →
 * `SporaAppTeamGraph`), the dev port and the `tailwindcss()` plugin
 * differ.
 *
 * Tailwind runs as a **Vite** plugin, not through PostCSS — v4 has no
 * `normalizeTailwindDirectives` and therefore none of the
 * `@layer components`-without-`@tailwind components` breakage that
 * forced the old `scopeVendorLayers` pre-plugin in `postcss.config.js`.
 * That file is gone; there is no PostCSS in the pipeline. All Tailwind
 * configuration lives in `src/style.css` (with `important` shimmed
 * through `tailwind.config.ts` via `@config`); see that file for the
 * no-preflight and layer-ordering rationale.
 *
 * Mermaid 10 is bundled inside the IIFE — it's ~600 KB gz and only
 * loaded when the operator opens `/apps/team-graph`. CI size budget
 * is 800 KB pre-gzip (see `.github/workflows/ci.yml`). The host
 * publishes Vue / Pinia on `window.*` via `publishPluginGlobals()`
 * so they stay external; everything else (Mermaid, and
 * `@spora-ai/components`) is bundled.
 */
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    define: {
        // `process.env.NODE_ENV` has to be replaced at build time.
        //
        // Vite replaces it for an *app* build, but not for a **library**
        // build — and this is a library build (`build.lib.formats: ['iife']`).
        // So the `process.env.NODE_ENV` inside vue-i18n survives into the
        // bundle, where `process` does not exist: the panel dies on load with
        // "process is not defined" before it renders a single string.
        //
        // vue-i18n only uses it to decide whether to *warn* — every use is a
        // `!== 'production'` guard — so replacing it with the real build mode
        // removes the development warnings and changes nothing else. The host
        // SPA gets the same replacement for free, which is why only a plugin
        // bundle hits it.
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),

        // `__INTLIFY_DROP_MESSAGE_COMPILER__` is deliberately NOT set: the
        // message compiler is what turns `{name}` into a parameter lookup,
        // and dropping it would make every interpolated message render its
        // own source.
    },
    // Must match the host's SPORA_PLUGIN_DEV_PORTS=team-graph:5180 for dev-proxy.
    base: '/plugins/team-graph/',
    build: {
        outDir: 'frontend',
        emptyOutDir: false,
        lib: {
            entry: 'src/main.ts',
            formats: ['iife'],
            name: 'SporaAppTeamGraph',
            fileName: () => 'main.js',
        },
        rollupOptions: {
            external: ['vue', 'pinia'],
            output: {
                globals: {
                    vue: 'window.Vue',
                    pinia: 'window.Pinia',
                },
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                        return 'style.css'
                    }
                    return assetInfo.name ?? 'asset'
                },
            },
        },
    },
    server: {
        port: 5180,
        strictPort: true,
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['tests/**/*.{test,spec}.{js,ts}'],
        // Installs the i18n instance on every mounted component — the
        // components translate their copy through `t()`.
        setupFiles: ['tests/setup.ts'],
        reporters: process.env.CI
            ? [
                ['default'],
                [
                    'junit',
                    {
                        outputFile: './coverage/test-report.xml',
                    },
                ],
            ]
            : ['default'],
        coverage: {
            // lcov for SonarCloud; html for the PR comment.
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            reportsDirectory: './coverage',
            // Mirrors sonar.coverage.exclusions — excludes Vue SFCs / type-only files
            // so the coverage number reflects exercised code, not an inflated denominator.
            include: ['src/api/**/*.ts', 'src/stores/**/*.ts', 'src/composables/**/*.ts', 'src/i18n/**/*.ts', 'src/lib/**/*.ts'],
            exclude: ['src/main.ts', 'src/dev-main.ts', 'src/shims.d.ts', 'src/types.ts', 'src/**/*.{vue,css}'],
        },
    },
})
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Vite config for the Team Graph IIFE bundle.
 *
 * Mirrors `spora-plugin-typst-frontend/vite.config.ts` byte-for-byte
 * for the shape (lib.formats/name/fileName/external/output.globals/
 * assetFileNames, server.port, test block); only the slug, lib.name
 * (must match `apps/registry.ts → globalFor('team-graph')` →
 * `SporaAppTeamGraph`) and the dev port differ.
 *
 * Mermaid 10 is bundled inside the IIFE — it's ~600 KB gz and only
 * loaded when the operator opens `/apps/team-graph`. CI size budget
 * is 800 KB pre-gzip (see `.github/workflows/ci.yml`). The host
 * publishes Vue / Pinia / vue-router on `window.*` via
 * `publishPluginGlobals()` so they stay external.
 */
export default defineConfig({
    plugins: [vue()],
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
            external: ['vue', 'pinia', 'vue-router'],
            output: {
                globals: {
                    vue: 'window.Vue',
                    pinia: 'window.Pinia',
                    'vue-router': 'window.VueRouter',
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
            include: ['src/api/**/*.ts', 'src/stores/**/*.ts', 'src/composables/**/*.ts', 'src/lib/**/*.ts'],
            exclude: ['src/main.ts', 'src/dev-main.ts', 'src/shims.d.ts', 'src/types.ts', 'src/**/*.{vue,css}'],
        },
    },
})
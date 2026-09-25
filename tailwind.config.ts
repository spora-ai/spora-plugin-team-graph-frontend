import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

/**
 * Tailwind config for the Team Graph plugin frontend.
 *
 * Mirrors `spora-plugin-typst-frontend/tailwind.config.ts` so the
 * plugin boundary is identical to its sibling plugins:
 *  - `corePlugins.preflight: false` — the host owns document-level
 *    resets; the plugin bundle omits them.
 *  - `important: '#spora-plugin-team-graph'` — every generated utility
 *    gets scoped beneath this selector so plugin classes can't leak
 *    into the host SPA or another plugin slot. The host SPA's
 *    PluginAppPage wraps the slot in `<div id="spora-plugin-team-graph">`
 *    on mount (see `App.vue`).
 *
 * Theme tokens reference the host SPA's CSS variables (border, input,
 * ring, background, foreground, primary, secondary, destructive, muted,
 * accent) so plugins render with the same design language as the
 * gallery, memories, typst, and other admin surfaces — no per-plugin
 * palette to keep in sync with the host.
 */
export default {
    content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
    corePlugins: { preflight: false },
    important: '#spora-plugin-team-graph',
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Barlow', ...fontFamily.sans],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
            },
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [],
} satisfies Config
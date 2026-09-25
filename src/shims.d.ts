/**
 * Plugin-host bridge contract.
 *
 * Mirrors `spora-plugin-typst-frontend/src/shims.d.ts` byte-for-byte
 * (minus the `SporaApp<Name>` window binding name). The host passes:
 *
 *   - `api`     — typed REST client (CSRF tokens, `/api/v1` base,
 *                `{ data: T }` envelope unwrap) we route through
 *                `api/client.ts → getApi()`.
 *   - `pinia`   — the host's Pinia instance (we install a local Pinia
 *                for plugin-only state; we do NOT call
 *                `setActivePinia(host.pinia)` because that would
 *                collide with the host's stores).
 *   - `theme`   — `'light' | 'dark'` snapshot at mount.
 *   - `route`   — current host route, used by back-links.
 *   - `router`  — host's Vue Router. We re-declare a local one for
 *                plugin-internal navigation but expose `push` so the
 *                host router is reachable.
 */
export interface PluginHostContext {
    api: {
        get: <T = unknown>(path: string) => Promise<T>
        post: <T = unknown>(path: string, body: unknown) => Promise<T>
        put: <T = unknown>(path: string, body: unknown) => Promise<T>
        patch: <T = unknown>(path: string, body: unknown) => Promise<T>
        delete: <T = unknown>(path: string) => Promise<T>
    }
    pinia: unknown
    theme: 'light' | 'dark'
    route: { path: string; params: Record<string, unknown>; query: Record<string, unknown> } | null
    router: {
        push: (to: string) => Promise<unknown>
        currentRoute: { value: { path: string; params?: Record<string, unknown>; query?: Record<string, unknown> } }
    } | null
}

declare global {
    interface Window {
        SporaAppTeamGraph?: {
            mount: (target: HTMLElement, ctx: PluginHostContext) => void | Promise<void>
            unmount?: (target: HTMLElement) => void
        }
    }
}

export {}
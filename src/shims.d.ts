/**
 * Plugin-host bridge contract.
 *
 * Mirrors `spora-plugin-typst-frontend/src/shims.d.ts`, modulo the
 * `SporaApp<Name>` window binding name and the `router` member, which is
 * declared structurally here rather than imported from `vue-router`. The
 * host passes a typed REST client (`api`, routed through
 * `api/client.ts → getApi()`), its Pinia instance (`pinia`), a `theme`
 * snapshot at mount, and the current `route` for back-links.
 *
 * `router` is load-bearing and must not be dropped: the detail panel's chat
 * rows call `router.push()` to leave for a task chat. What is absent is the
 * `vue-router` *dependency* — it is never imported, because the structural
 * type below is all the plugin needs (see `lib/hostNavigation.ts`).
 */
export interface PluginHostContext {
    api: {
        get: <T = unknown>(path: string) => Promise<T>
        post: <T = unknown>(path: string, body: unknown) => Promise<T>
        put: <T = unknown>(path: string, body: unknown) => Promise<T>
        patch: <T = unknown>(path: string, body: unknown) => Promise<T>
        delete: <T = unknown>(path: string) => Promise<T>
    }
    /**
     * The host's Pinia. We install a *local* Pinia for plugin-only state
     * and deliberately do not call `setActivePinia(host.pinia)`, which
     * would collide with the host's stores.
     */
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

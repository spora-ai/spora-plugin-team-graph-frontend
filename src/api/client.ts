/**
 * Plugin-local bridge to the host's typed REST client.
 *
 * Mirrors `spora-plugin-typst-frontend/src/api/client.ts`. The
 * bundle is mounted by `spora-frontend`'s `apps/registry.ts` which
 * passes a `PluginHostContext` to `mount()`. The host's API client
 * knows about CSRF tokens, the `/api/v1` base, and the
 * `{ data: T }` envelope unwrap — we don't recreate any of that here,
 * we just hand the passed-in instance back to the rest of the plugin.
 *
 * `setApi()` is called once per `mount()`; `getApi()` is then used by
 * `api/{teamGraph,agentDetail,fixtures}.ts` and any plugin-local fetch
 * helper. Tests can either `vi.mock()` this module directly or
 * re-`setApi()` with a stub.
 *
 * `ApiError` mirrors the host's `spora-frontend/src/api/client.ts →
 * ApiError` shape: `{ message, code, status }`. Plugin code only
 * reads `message` (for surfacing errors in the canvas's
 * `GraphErrorFallback.vue`).
 */
import type { PluginHostContext } from '../shims'

let _api: PluginHostContext['api'] | null = null

export function setApi(api: PluginHostContext['api']): void {
    _api = api
}

export function getApi(): PluginHostContext['api'] {
    if (_api === null) {
        throw new Error('Plugin API not initialized — call setApi() in main.ts before mounting the plugin.')
    }
    return _api
}

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly status: number,
    ) {
        super(message)
        this.name = 'ApiError'
    }
}
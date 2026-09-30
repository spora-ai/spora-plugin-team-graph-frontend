/**
 * Navigating the host SPA from inside the plugin.
 *
 * The plugin has no `vue-router` dependency: it calls the host's router
 * structurally through `PluginHostContext.router`. This module is the one
 * place that decision lives, so the route string, the null-router policy
 * and the "did it navigate" decision are unit-testable without mounting.
 *
 * A path string, not the dashboard's named route: `router.push` is typed
 * `(to: string) => Promise<unknown>`, which exposes no `RouteLocationRaw`
 * overload, so `{ name: 'task', params: { id } }` is not expressible.
 */

/**
 * The host's task-chat route as a path prefix; the id is appended with no
 * separator because the host route is `/tasks/:id` (see the module header).
 *
 * No `/spora/` prefix: the host's SPA base is prepended by vue-router.
 */
export const TASK_CHAT_PATH_PREFIX = '/tasks/'

/** Destination for a task's chat in the host SPA. */
export function taskChatPath(taskId: number): string {
    return `${TASK_CHAT_PATH_PREFIX}${String(taskId)}`
}

/**
 * What the panel should do with a chat row, given the router the host
 * handed us.
 *
 * A null router is a legitimate state, not an error to recover from: the
 * plugin's own dev entry passes `router: null` because a standalone page
 * has no host SPA to navigate inside.
 *
 * We render a *disabled* row rather than an `<a href>`: an href written by
 * the plugin is relative to wherever it is mounted, so it cannot be correct
 * in both the standalone and hosted cases without hard-coding the host's
 * base — the coupling this boundary exists to avoid — and it would cost a
 * full page load for a route the host owns. A disabled row also keeps the
 * layout identical to the enabled case and stays out of the tab order.
 */
export type ChatRowAction =
    | { readonly kind: 'push'; readonly to: string }
    | { readonly kind: 'disabled' }

/**
 * Resolve the click action for a chat row. Returning a *description*
 * instead of navigating keeps the null check and the path construction in
 * one pure function; the component only calls `router.push`.
 */
export function chatRowAction(router: PluginRouter | null, taskId: number): ChatRowAction {
    if (router === null || typeof router.push !== 'function') return { kind: 'disabled' }
    return { kind: 'push', to: taskChatPath(taskId) }
}

/**
 * The slice of `PluginHostContext['router']` this module needs, re-declared
 * structurally so `lib/` never imports the ambient `shims.d.ts` and a test
 * can pass a two-field stub.
 */
export interface PluginRouter {
    push: (to: string) => Promise<unknown>
}

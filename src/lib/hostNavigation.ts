/**
 * Navigating the host SPA from inside the plugin.
 *
 * The plugin has no `vue-router` dependency and never had one: it is
 * handed the host's router instance on `PluginHostContext.router` and
 * is expected to call it structurally. This module is the one place
 * that decision is expressed, so the route string, the null-router
 * policy and the "did it actually navigate" bookkeeping each have a
 * single home and are unit-testable without mounting a component.
 *
 * **Why a path string and not the Dashboard's named route.** The
 * dashboard's chat row uses
 * `<router-link :to="{ name: 'task', params: { id } }">`
 * (`spora-frontend/src/components/dashboard/DashboardAgentCard.vue`
 * ~line 356). `PluginHostContext.router.push` is typed
 * `(to: string) => Promise<unknown>` — the structural contract
 * deliberately exposes no `RouteLocationRaw` overload, so a named
 * route is not expressible through it. We therefore build the same
 * destination as a path.
 *
 * **The path is the host's `authRoute('/tasks/:id', 'task', …)`
 * from `spora-frontend/src/router/index.ts`.** That was verified
 * against the router source on all 194 local branches and against
 * the shipped bundle in `spora-fgrassl/public/spora/assets`, which
 * all declare the task-chat route as `/tasks/:id` with the name
 * `task`. The name is the stable part; the path is what
 * `router.push(string)` needs, and the host's SPA base is `/spora/`
 * (`createWebHistory('/spora/')`), which vue-router prepends for
 * us — pushing `/tasks/7` resolves to `/spora/tasks/7`, so the
 * string below carries **no** base prefix.
 *
 * The brief for this change named the route `/n{id}`. No such route
 * exists in the host router: a path of `/n/7` would miss the
 * `task` record entirely and land on the catch-all
 * `/:pathMatch(.*)*` → redirect `/`, dropping the operator on the
 * dashboard instead of the chat. The route name `task` was
 * accurate; the path was not. `TASK_CHAT_PATH_PREFIX` is a single
 * constant so this is a one-line change if the host ever does
 * shorten the URL.
 */

/**
 * The host's task-chat route, as a path prefix. The task id is
 * appended directly (`/tasks/` + `7` → `/tasks/7`) — no separator,
 * because the host route is `/tasks/:id`.
 *
 * Mirrors `authRoute('/tasks/:id', 'task', …)` in
 * `spora-frontend/src/router/index.ts`. See the module header for
 * the verification.
 */
export const TASK_CHAT_PATH_PREFIX = '/tasks/'

/**
 * Destination for a task's chat in the host SPA.
 *
 * `String(id)` rather than template interpolation on a number:
 * `router.push` takes a string, and this keeps the returned type
 * exactly `string` for the call site instead of relying on
 * `String.prototype` coercion being inferred the same way by every
 * consumer.
 */
export function taskChatPath(taskId: number): string {
    return `${TASK_CHAT_PATH_PREFIX}${String(taskId)}`
}

/**
 * What the panel should do with a chat row, given the router the
 * host handed us.
 *
 * **The null case is "no router", not "broken router".**
 * `PluginHostContext.router` is nullable in the contract, and the
 * plugin's own dev entry (`dev-main.ts`) passes `router: null` on
 * purpose — there is no host SPA to navigate inside when the page
 * is served standalone. So a null router is a *known, legitimate*
 * state, not an error to recover from.
 *
 * We render a **disabled row** rather than an `<a href>`:
 *
 *  - A plain `<a href="/tasks/7">` would be a *relative* URL
 *    resolved against wherever the plugin happens to be mounted
 *    (inside the host it is `/spora/apps/team-graph`, and the host
 *    base is `/spora/`), so an href written by the plugin cannot be
 *    correct in both the standalone-dev and hosted cases without
 *    hard-coding the host's base into the plugin — a coupling the
 *    `PluginHostContext` boundary exists to avoid. It would also
 *    trigger a full page load, losing SPA state and re-running
 *    auth/bootstrap, for a route the host owns.
 *  - A disabled `<button>` keeps the element, its label, its status
 *    pill and its layout identical to the enabled case, so the
 *    panel does not reflow when the host withholds a router, and it
 *    tells the operator the row is inert instead of silently
 *    swallowing the click. `aria-disabled` mirrors the visual state
 *    to assistive tech, and the native `disabled` attribute keeps it
 *    out of the tab order so a keyboard user is not offered a
 *    control that does nothing.
 */
export type ChatRowAction =
    | { readonly kind: 'push'; readonly to: string }
    | { readonly kind: 'disabled' }

/**
 * Resolve the click action for a chat row.
 *
 * Returning a *description* rather than performing the navigation
 * keeps the null check and the path construction in one pure,
 * testable function; the component stays responsible only for
 * calling `router.push` when the action says it can.
 */
export function chatRowAction(router: PluginRouter | null, taskId: number): ChatRowAction {
    if (router === null || typeof router.push !== 'function') return { kind: 'disabled' }
    return { kind: 'push', to: taskChatPath(taskId) }
}

/**
 * The slice of `PluginHostContext['router']` this module needs,
 * re-declared structurally so `lib/` never imports from `shims.d.ts`
 * (which is ambient and has no runtime module) and so a test can
 * pass a two-field stub.
 */
export interface PluginRouter {
    push: (to: string) => Promise<unknown>
}

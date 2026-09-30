import { describe, it, expect, vi } from 'vitest'
import { taskChatPath, chatRowAction, TASK_CHAT_PATH_PREFIX } from '../../src/lib/hostNavigation'

/**
 * `lib/hostNavigation.ts` — the plugin's one door into the host SPA.
 *
 * Two things are worth pinning here, and both are invisible in the
 * component because they are *decisions* rather than markup:
 *
 *  1. **The route string.** The panel's chat rows push a path, so if
 *     this drifts from the host router the rows keep working and keep
 *     landing the operator in the wrong place — a silently broken
 *     deep-link, not a crash. The exact expected string is asserted
 *     rather than "starts with /tasks" so a change of segment, a
 *     missing slash or a stray base prefix all fail here.
 *  2. **The null-router policy.** `PluginHostContext.router` is
 *     nullable by contract, and the plugin's own dev entry passes
 *     `null`. Both branches must be reachable and must not overlap.
 */

describe('taskChatPath', () => {
    it('builds the host task-chat path for a task id', () => {
        // The host route is `authRoute('/tasks/:id', 'task', …)` in
        // spora-frontend/src/router/index.ts, under a `/spora/`
        // history base that vue-router prepends itself — so the string
        // the plugin pushes must carry NO base prefix.
        expect(taskChatPath(7)).toBe('/tasks/7')
    })

    it('uses the single prefix constant, with no base and no trailing slash', () => {
        // Guards the two ways this could silently break: someone
        // prepending the host's `/spora/` base (vue-router already
        // does it, so the operator would end up at `/spora/spora/…`),
        // and someone reformatting the segment as `/n/{id}` for a
        // route the host does not declare.
        expect(TASK_CHAT_PATH_PREFIX).toBe('/tasks/')
        expect(TASK_CHAT_PATH_PREFIX.endsWith('/')).toBe(true)
        expect(TASK_CHAT_PATH_PREFIX).not.toContain('spora')
    })

    it('keeps distinct ids on distinct paths', () => {
        expect(taskChatPath(1)).not.toBe(taskChatPath(2))
        // A non-string id must not produce `/tasks/[object Object]`.
        expect(taskChatPath(0)).toBe('/tasks/0')
    })
})

describe('chatRowAction', () => {
    it('returns a push action with the task path when a router is present', () => {
        const router = { push: vi.fn() }
        expect(chatRowAction(router, 42)).toEqual({ kind: 'push', to: '/tasks/42' })
    })

    it('returns a disabled action when the host handed us no router', () => {
        // Not an error path: `dev-main.ts` mounts the plugin
        // standalone with `router: null`, and there is no host SPA to
        // navigate inside. The row must degrade to inert rather than
        // throw on click.
        expect(chatRowAction(null, 42)).toEqual({ kind: 'disabled' })
    })

    it('degrades to disabled when the router is present but has no push', () => {
        // A partially-populated host context (an older host, or a
        // hand-built stub) must not produce a row that throws on
        // click. Typed as the full interface, so the cast is the
        // point of the test.
        const broken = {} as unknown as { push: (to: string) => Promise<unknown> }
        expect(chatRowAction(broken, 42)).toEqual({ kind: 'disabled' })
    })

    it('never leaks the task id into the disabled branch', () => {
        // The disabled action carries no destination at all — there
        // is nothing to navigate to, and a stale `to` would be a
        // route that a later refactor could start honouring.
        const action = chatRowAction(null, 42)
        expect(Object.keys(action)).toEqual(['kind'])
    })
})

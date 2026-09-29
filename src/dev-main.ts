import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setApi } from './api/client'
import type { GraphNode, GraphPayload, GraphEdge } from './types'

/**
 * Dev-mode entry. The production mount/unmount contract lives in
 * `main.ts` (which the host's registry consumes via
 * `window.SporaAppTeamGraph`). For `npm run dev` we mount directly
 * under `#app` and stub `hostContext.api` so the page renders the
 * chrome without a backend.
 *
 * The stub returns realistic-shaped payloads:
 *  - `/principals/me` → a user-principal plus two groups (mirrors the
 *    fixtures used in the E prototype; lets us validate the sidebar
 *    + three-column layout in the browser).
 *  - `/plugins/team-graph/graph?...&principal_id=N` → a small graph
 *    per principal id.
 *
 * To exercise the real wire surface, run the host SPA's plugin
 * dev-proxy (`SPORA_PLUGIN_DEV_PORTS=team-graph:5180 npm run dev` in
 * `spora-frontend`) and visit `/apps/team-graph`.
 *
 * **Two things the stub has to get right, because the whole point of
 * `npm run dev` is to be representative.**
 *
 * 1. **`setApi()`.** `api/client.ts` keeps a module-level handle that
 *    only `main.ts`'s `mount()` installs. Without the call below every
 *    `getApi()` throws "Plugin API not initialized", `usePrincipalList`
 *    swallows it into an error state, and the dev server renders a
 *    permanently empty canvas — silently hiding every visual defect
 *    the dev loop is supposed to catch.
 * 2. **The unwrapped envelope.** The host's typed client already
 *    unwraps `{ data: T }` (see `api/teamGraph.ts`), so the stub
 *    returns the payload *directly*. Returning `{ data: … }` here made
 *    every `fetchGraph()` hand the page a payload with no `nodes`.
 *
 * **`profile_picture` carries all eight fields `NodeResolver.php`
 * emits**, not just the three palette keys. The `kind` discriminant is
 * what the shared `Avatar` branches on: an agent with an
 * `archetype` + `variant_key` renders the archetype tile, and an
 * agent without them falls back to initials — and the fallback used to
 * drop the palette entirely, which is invisible unless the stub has a
 * node in *both* branches. `DEV_NODES` below deliberately contains
 * one of each, plus a green-palette archetype-less node.
 */

/**
 * `Spora\Services\AgentPictures\Palette` — the same table the backend
 * resolves `bg_color` / `fg_color` from. The plugin has no palette map
 * of its own (see `AgentNodeCard.vue` → `avatarPaletteStyle`), so the
 * stub hard-codes the server's hexes to keep the two in step.
 */
const PALETTES: Record<string, { bg_color: string; fg_color: string }> = {
    slate: { bg_color: '#475569', fg_color: '#F8FAFC' },
    teal: { bg_color: '#0F766E', fg_color: '#F0FDFA' },
    green: { bg_color: '#15803D', fg_color: '#F0FDF4' },
    indigo: { bg_color: '#4338CA', fg_color: '#EEF2FF' },
    amber: { bg_color: '#D97706', fg_color: '#FFFBEB' },
}

/**
 * Build a `profile_picture` in the exact shape `NodeResolver::resolveNodes`
 * emits: eight keys, with the three picture-specific ones (`archetype`,
 * `variant_key`, `image_url`) set to `null` when the agent has none.
 */
function picture(
    paletteKey: string,
    archetype: string | null,
    variantKey: string | null,
): GraphNode['profile_picture'] {
    const palette = PALETTES[paletteKey] ?? PALETTES.slate!
    return {
        kind: 'avatar',
        archetype,
        variant_key: variantKey,
        palette_key: paletteKey,
        bg_color: palette.bg_color,
        fg_color: palette.fg_color,
        image_url: null,
        image_updated_at: null,
    }
}

function node(
    id: number,
    name: string,
    role: string,
    status: GraphNode['status'],
    pictureValue: GraphNode['profile_picture'],
    activeChats: number,
    recentChats: number,
): GraphNode {
    return {
        id,
        name,
        role,
        picture_url: null,
        status,
        active_chats: activeChats,
        recent_chats_24h: recentChats,
        profile_picture: pictureValue,
    }
}

/**
 * Four nodes, chosen to cover every branch the card can take:
 *
 *  - `Spora Core Agent` — archetype tile (teal), the branch that
 *    already worked.
 *  - `Research Agent` — archetype tile (indigo), the selected-node
 *    look.
 *  - **`Writer Agent` — NO archetype, green palette.** This is the
 *    case that regressed: the package's `isAvatar` guard needs
 *    `archetype` *and* `variant_key` to be strings, so the node drops
 *    to the initials branch and lost the green. A dev stub that only
 *    ships archetype nodes can never reproduce it.
 *  - `Helper Agent` — NO archetype, amber palette, so a
 *    palette-on-initials node next to a default-slate one is visible
 *    side by side.
 */
const DEV_NODES: GraphNode[] = [
    node(11, 'Spora Core Agent', 'Lead', 'RUNNING', picture('teal', 'assistant', 'v0'), 1, 4),
    node(12, 'Research Agent', 'Researcher', 'PENDING_APPROVAL', picture('indigo', 'researcher', 'v1'), 0, 2),
    node(13, 'Writer Agent', 'Writer', 'COMPLETED', picture('green', null, null), 0, 1),
    node(14, 'Helper Agent', 'Helper', 'AWAITING_SUB_AGENTS', picture('amber', null, null), 1, 3),
]

const DEV_EDGES: GraphEdge[] = [
    { id: '11->12', source: 11, target: 12, op: 'sub_agent', configured: true, count_24h: 3, last_invoked_at: '2026-09-25T08:14:00Z' },
    { id: '11->13', source: 11, target: 13, op: 'sub_agent', configured: true, count_24h: 1, last_invoked_at: '2026-09-25T07:02:00Z' },
    { id: '12->14', source: 12, target: 14, op: 'sub_agent', configured: true, count_24h: 0, last_invoked_at: null },
    { id: '13->14', source: 13, target: 14, op: 'handover', configured: true, count_24h: 2, last_invoked_at: '2026-09-24T18:40:00Z' },
]

const DEV_PRINCIPALS = [
    { id: 1, type: 'user', name: 'local-dev@spora.local', is_current_user_owned: true },
    { id: 2, type: 'group', name: 'Marketing', is_current_user_owned: false },
    { id: 3, type: 'group', name: 'Engineering', is_current_user_owned: false },
]

function devGraph(principalId: number): GraphPayload {
    const names: Record<number, string> = {
        1: 'local-dev@spora.local',
        2: 'Marketing',
        3: 'Engineering',
    }
    return {
        principal: {
            id: principalId,
            type: principalId === 1 ? 'user' : 'group',
            name: names[principalId] ?? 'Unknown',
            is_current_user_owned: principalId === 1,
        },
        nodes: DEV_NODES,
        edges: DEV_EDGES,
        generated_at: '2026-09-25T08:14:00Z',
    }
}

/**
 * Generically typed to match `PluginHostContext['api']`: the stub is
 * installed through `setApi()`, which takes the real client type, so a
 * `Promise<unknown>`-returning stub would not be assignable (and would
 * also hide the payload types from every `fetch*()` call site).
 */
const devApi = {
    get: async <T>(path: string): Promise<T> => {
        if (path.startsWith('/principals/me')) {
            return { principals: DEV_PRINCIPALS } as T
        }
        if (path.startsWith('/plugins/team-graph/graph')) {
            const match = /principal_id=(\d+)/.exec(path)
            const id = match !== null ? Number(match[1]) : 1
            return devGraph(id) as T
        }
        if (path.startsWith('/tasks')) {
            return { tasks: [] } as T
        }
        return {} as T
    },
    post: async <T>(): Promise<T> => ({} as T),
    put: async <T>(): Promise<T> => ({} as T),
    patch: async <T>(): Promise<T> => ({} as T),
    delete: async <T>(): Promise<T> => undefined as T,
}

const hostContext = {
    api: devApi,
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: null,
}

setApi(hostContext.api)

const app = createApp(App, { hostContext })
app.use(createPinia())
app.mount('#app')

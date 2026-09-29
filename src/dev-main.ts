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
 * **The dev page has no host CSS variables.** The plugin resolves
 * every colour through the host's tokens (`--foreground`,
 * `--muted`, `--border`, …), and nothing in this repo declares them
 * — the host does, in `spora-frontend/src/style.css`. So a bare
 * `npm run dev` renders with every `hsl(var(--token))` falling back
 * to inherited black-on-white, and the panel's dark theme cannot be
 * inspected at all. Paste the host's `@layer base :root` / `.dark`
 * blocks into the devtools (or load the host SPA through the
 * dev-proxy, which is the better option) before judging any colour
 * here.
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

/**
 * A group with no agents at all. Without it the empty state is
 * unreachable in a browser: every principal in the stub above
 * returns `DEV_NODES`, so a dev session can only ever see a
 * populated diagram and a bug in the empty branch would look
 * identical to a bug in the populated one.
 */
const DEV_PRINCIPALS = [
    { id: 1, type: 'user', name: 'local-dev@spora.local', is_current_user_owned: true },
    { id: 2, type: 'group', name: 'Marketing', is_current_user_owned: false },
    { id: 3, type: 'group', name: 'Engineering', is_current_user_owned: false },
    { id: 4, type: 'group', name: 'Research (no agents yet)', is_current_user_owned: false },
]

/**
 * `/tasks` rows for the selected agent, in the raw wire shape
 * `taskToChatSummary()` maps from.
 *
 * **Why the stub bothers.** The panel's chat sections are the part
 * of the sidebar with the most new surface in this change (the
 * navigable rows, the status pill, the overflow note), and an empty
 * `/tasks` response renders them as a single "No recent chats." line —
 * so a dev server with an empty stub cannot show whether any of it
 * works. Six completed rows against a cap of four also exercises the
 * overflow note, and one running row exercises the in-flight section,
 * so both chat sections and the "+N more" line are visible at once.
 *
 * Statuses are spread across the wire enum on purpose: two of them
 * (`COMPLETED`, `CANCELLED`) collapse onto the *same* status slug, so
 * only their labels tell them apart in the rendered pill.
 *
 * Five completed rows against a cap of four, so the overflow note is
 * on screen in every dev session rather than only in a test.
 */
const DEV_TASKS: Array<Record<string, unknown>> = [
    {
        id: 501,
        agent_id: 11,
        status: 'RUNNING',
        user_prompt: 'Draft the Q3 investor update from the analytics export',
        final_response: null,
        created_at: '2026-09-28T11:52:00Z',
    },
    {
        id: 502,
        agent_id: 11,
        status: 'AWAITING_SUB_AGENTS',
        user_prompt: 'Compare the three competitor pricing pages and summarise the differences',
        final_response: null,
        created_at: '2026-09-28T11:10:00Z',
    },
    {
        id: 503,
        agent_id: 11,
        status: 'COMPLETED',
        user_prompt: 'Summarise the Q3 report',
        final_response: 'Three regions, two risks, one recommendation to hold pricing until November.',
        created_at: '2026-09-28T10:00:00Z',
    },
    {
        id: 504,
        agent_id: 11,
        status: 'COMPLETED',
        user_prompt: 'Rewrite the onboarding email to be shorter and warmer',
        final_response: 'Here is a 90-word version that keeps the same three-step structure…',
        created_at: '2026-09-27T16:40:00Z',
    },
    {
        id: 505,
        agent_id: 11,
        status: 'CANCELLED',
        user_prompt: 'Pull every metric for the churned cohort since January',
        final_response: null,
        created_at: '2026-09-27T09:05:00Z',
    },
    {
        id: 506,
        agent_id: 11,
        status: 'COMPLETED',
        user_prompt: 'Explain the difference between the two rate-limit implementations we shipped last quarter, and which one the edge fleet is actually running now given the April migration',
        final_response: 'The fleet is on the token-bucket implementation as of the April migration…',
        created_at: '2026-09-26T13:22:00Z',
    },
    {
        id: 507,
        agent_id: 11,
        status: 'COMPLETED',
        user_prompt: 'Find every place the old pricing tier names still appear',
        final_response: 'Nine: four in the marketing site, three in the API docs, two in emails.',
        created_at: '2026-09-25T15:11:00Z',
    },
    {
        id: 508,
        agent_id: 11,
        status: 'COMPLETED',
        user_prompt: 'Draft the weekly ops digest',
        final_response: 'Section headings drafted; the incident paragraph still needs a number.',
        created_at: '2026-09-25T08:02:00Z',
    },
]

function devGraph(principalId: number): GraphPayload {
    const names: Record<number, string> = {
        1: 'local-dev@spora.local',
        2: 'Marketing',
        3: 'Engineering',
        4: 'Research (no agents yet)',
    }
    /*
     * Principal 4 answers with a real envelope that happens to carry
     * no nodes — the shape the endpoint returns for a team nobody has
     * added an agent to. Deliberately *not* a throw or a 404: an
     * error payload exercises `GraphErrorFallback`, a different
     * branch of the same slot, and conflating the two in the stub is
     * what made the empty state untestable by hand.
     */
    const empty = principalId === 4
    return {
        principal: {
            id: principalId,
            type: principalId === 1 ? 'user' : 'group',
            name: names[principalId] ?? 'Unknown',
            is_current_user_owned: principalId === 1,
        },
        nodes: empty ? [] : DEV_NODES,
        edges: empty ? [] : DEV_EDGES,
        generated_at: '2026-09-25T08:14:00Z',
    }
}

/**
 * Resolve one dev-harness `GET` to its stub payload.
 *
 * Separate from `devApi.get` so this stays a plain synchronous function:
 * the real client is `Promise`-returning, and an `async` wrapper over a
 * body that never awaits would be `await`ing nothing while implying the
 * resolution is deferred. `get` wraps the result once, below.
 */
function devApiGet<T>(path: string): T {
    if (path.startsWith('/principals/me')) {
        return { principals: DEV_PRINCIPALS } as T
    }
    if (path.startsWith('/plugins/team-graph/graph')) {
        const match = /principal_id=(\d+)/.exec(path)
        const id = match !== null ? Number(match[1]) : 1
        return devGraph(id) as T
    }
    if (path.startsWith('/tasks')) {
        // `status=` narrows to the in-flight statuses the panel
        // asks for; everything else (COMPLETED) is the recent list.
        const status = /status=([A-Z_]+)/.exec(path)?.[1] ?? 'COMPLETED'
        const inFlight = ['RUNNING', 'AWAITING_SUB_AGENTS', 'PENDING_APPROVAL'].includes(status)
        return {
            tasks: DEV_TASKS.filter((t) => (inFlight ? t.status === status : t.status === 'COMPLETED')),
        } as T
    }
    if (/^\/agents\/\d+$/.test(path)) {
        return {
            agent: {
                id: Number(path.split('/').pop()),
                name: 'Spora Core Agent',
                description:
                    'Coordinates the team: breaks goals into delegated tasks, merges the results, and escalates anything that needs a human decision.',
                llm_driver_config_id: 1,
                max_steps: 25,
                is_active: true,
                is_pinned: false,
                principal_id: 1,
                tools: [],
                created_at: '2026-09-01T00:00:00Z',
            },
        } as T
    }
    return {} as T
}

/**
 * Generically typed to match `PluginHostContext['api']`: the stub is
 * installed through `setApi()`, which takes the real client type, so a
 * `Promise<unknown>`-returning stub would not be assignable (and would
 * also hide the payload types from every `fetch*()` call site).
 */
const devApi = {
    get: <T>(path: string): Promise<T> => Promise.resolve(devApiGet<T>(path)),
    post: <T>(): Promise<T> => Promise.resolve({} as T),
    put: <T>(): Promise<T> => Promise.resolve({} as T),
    patch: <T>(): Promise<T> => Promise.resolve({} as T),
    delete: <T>(): Promise<T> => Promise.resolve(undefined as T),
}

/**
 * A stand-in for the host's router.
 *
 * The real host passes its `vue-router` instance (see
 * `spora-frontend/src/apps/registry.ts → buildHostContext`), and the
 * panel's chat rows call `router.push('/tasks/{id}')` on it. Under
 * `npm run dev` there is no host SPA, so this records each push on
 * `window.__tgRouterPushes` and paints the destination into a fixed
 * toast — which is what makes the deep-link *verifiable* in a browser
 * rather than only in a unit test.
 *
 * `?router=off` on the dev URL hands over `null` instead, so the
 * panel's disabled-row fallback can be inspected in the same session
 * without editing this file.
 */
const devRouterPushes: string[] = []
declare global {
    interface Window {
        __tgRouterPushes?: string[]
    }
}
window.__tgRouterPushes = devRouterPushes

const devRouter = {
    push: (to: string): Promise<unknown> => {
        devRouterPushes.push(to)
        const toast = document.createElement('div')
        toast.id = 'tg-dev-router-toast'
        toast.textContent = `router.push(${to})`
        toast.setAttribute(
            'style',
            'position:fixed;z-index:99999;left:12px;bottom:12px;padding:8px 12px;border-radius:8px;' +
                'background:#0f172a;color:#f8fafc;font:600 13px ui-monospace,monospace;',
        )
        document.body.appendChild(toast)
        return Promise.resolve(undefined)
    },
    currentRoute: { value: { path: '/apps/team-graph', params: {}, query: {} } },
}

const routerDisabled = new URLSearchParams(window.location.search).get('router') === 'off'

const hostContext = {
    api: devApi,
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: routerDisabled ? null : devRouter,
}

setApi(hostContext.api)

const app = createApp(App, { hostContext })
app.use(createPinia())
/*
 * Mount into the plugin's own scope id rather than a generic `#app`.
 * `App.vue` renders `<div id="spora-plugin-team-graph">` as its root
 * and every stylesheet rule — the generated Tailwind utilities via
 * `tailwind.config.ts → important:`, and the hand-written `.tg-*`
 * chrome — is scoped to that id. Mounting into a differently-named
 * element gave `npm run dev` a different CSS scope from the hosted
 * page, so dev could render correctly while production did not (or
 * the reverse). `index.html` carries the same id.
 */
app.mount('#spora-plugin-team-graph')

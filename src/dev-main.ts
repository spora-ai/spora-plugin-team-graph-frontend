import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

/**
 * Dev-mode entry. The production mount/unmount contract lives in
 * `main.ts` (which the host's registry consumes via
 * `window.SporaAppTeamGraph`). For `npm run dev` we mount directly
 * under `#app` and stub `hostContext.api` so the page renders the
 * chrome without a backend.
 *
 * The stub returns realistic-shaped payloads:
 *  - `/principals` → a user-principal plus two groups (mirrors the
 *    fixtures used in the E prototype; lets us validate the sidebar
 *    + three-column layout in the browser).
 *  - `/plugins/team-graph/graph?...&principal_id=N` → a small graph
 *    per principal id.
 *
 * To exercise the real wire surface, run the host SPA's plugin
 * dev-proxy (`SPORA_PLUGIN_DEV_PORTS=team-graph:5180 npm run dev` in
 * `spora-frontend`) and visit `/apps/team-graph`.
 */
const DEV_PRINCIPALS = [
    { id: 1, type: 'user', name: 'local-dev@spora.local', is_current_user_owned: true },
    { id: 2, type: 'group', name: 'Marketing', is_current_user_owned: false },
    { id: 3, type: 'group', name: 'Engineering', is_current_user_owned: false },
]

function devGraph(principalId: number): unknown {
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
        nodes: [
            { id: 11, name: 'Lead', role: 'Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4, profile_picture: { bg_color: '#4338CA', fg_color: '#EEF2FF' } },
            { id: 12, name: 'Helper', role: 'Helper', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 2, profile_picture: { bg_color: '#D97706', fg_color: '#FFFBEB' } },
        ],
        edges: [
            { id: '11->12', source: 11, target: 12, op: 'sub_agent', configured: true, count_24h: 1, last_invoked_at: '2026-09-25T08:14:00Z' },
        ],
        generated_at: '2026-09-25T08:14:00Z',
    }
}

const devApi = {
    get: async (path: string): Promise<unknown> => {
        if (path.startsWith('/principals/me')) {
            return { data: { principals: DEV_PRINCIPALS } }
        }
        if (path.startsWith('/plugins/team-graph/graph')) {
            const match = /principal_id=(\d+)/.exec(path)
            const id = match !== null ? Number(match[1]) : 1
            return { data: devGraph(id) }
        }
        return { data: {} }
    },
    post: async (): Promise<unknown> => ({ data: {} }),
    put: async (): Promise<unknown> => ({ data: {} }),
    patch: async (): Promise<unknown> => ({ data: {} }),
    delete: async (): Promise<unknown> => undefined,
}

const hostContext = {
    api: devApi,
    pinia: null,
    theme: 'light' as const,
    route: null,
    router: null,
}

const app = createApp(App, { hostContext })
app.use(createPinia())
app.mount('#app')

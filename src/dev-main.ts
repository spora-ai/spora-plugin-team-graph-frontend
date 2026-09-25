import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { FIXTURE_KEYS, fixtureByKey } from './api/fixtures'

/**
 * Dev-mode entry. The production mount/unmount contract lives in
 * `main.ts` (which the host's registry consumes via
 * `window.SporaAppTeamGraph`). For `npm run dev` we mount directly
 * under `#app` and stub `hostContext.api` so the page renders the
 * chrome and falls back to the `tinyStartup` fixture when no
 * principal id is supplied.
 *
 * To exercise the real wire surface, run the host SPA's plugin
 * dev-proxy (`SPORA_PLUGIN_DEV_PORTS=team-graph:5180 npm run dev` in
 * `spora-frontend`) and visit `/apps/team-graph`.
 */
const defaultFixtureKey = FIXTURE_KEYS[0]
const defaultFixture = fixtureByKey(defaultFixtureKey)

const devApi = {
    get: async (path: string): Promise<unknown> => {
        if (path.startsWith('/plugins/team-graph/graph')) {
            return {
                data: {
                    ...defaultFixture,
                    fixtures: [],
                },
            }
        }
        if (path.startsWith('/principals')) {
            return { data: { principals: [] } }
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
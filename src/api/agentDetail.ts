/**
 * Per-agent detail fetchers.
 *
 * The graph endpoint returns node metadata + edge statistics only
 * — the right sidebar (lg+) / centred modal (<lg) also wants the
 * agent's currently-running and recently-finished chats. Those
 * live on the existing `TaskController` endpoints; we just shape
 * the requests here so the rest of the plugin doesn't have to
 * know the URL grammar.
 *
 * Active chats = `status IN (running, awaiting_sub_agents, pending_approval)`
 * Recent chats = `status = completed LIMIT 5` ordered by completed_at desc
 */
import { getApi } from './client'
import type { ChatSummary } from '../types'

export interface AgentMeta {
    id: number
    name: string
    role: string | null
    picture_url: string | null
}

/**
 * `GET /api/v1/agents/{id}` — full agent record. Used by the
 * detail panel's avatar / role sub-header. Returns null when the
 * agent was archived after the graph endpoint was last polled
 * (a 404 leaves the panel showing the cached graph node instead
 * of throwing).
 */
export async function fetchAgentMeta(agentId: number): Promise<AgentMeta | null> {
    try {
        const meta = await getApi().get<AgentMeta>(`/agents/${agentId}`)
        return meta
    } catch {
        return null
    }
}

/**
 * `GET /api/v1/tasks?agent_id={id}` — the agent's currently in-flight chats.
 *
 * `TaskController::index` accepts a single `?status=` filter, not a list,
 * so we fan out three parallel requests (the three "still working"
 * statuses) and merge the results. Limit per status is intentionally
 * small (10) — anything more means the principal is overwhelmed and
 * the operator needs to triage via the full Tasks page, not the graph.
 *
 * Active statuses mapped to `TaskController::index` values:
 *   `RUNNING`, `AWAITING_SUB_AGENTS`, `PENDING_APPROVAL`.
 */
export async function fetchActiveChats(agentId: number): Promise<ChatSummary[]> {
    const STATUSES = ['RUNNING', 'AWAITING_SUB_AGENTS', 'PENDING_APPROVAL'] as const
    const results = await Promise.all(
        STATUSES.map((status) =>
            getApi()
                .get<{ tasks: ChatSummary[] }>(
                    `/tasks?agent_id=${agentId}&status=${status}&limit=10`,
                )
                .then((r) => r.tasks ?? [])
                .catch(() => []),
        ),
    )
    const merged = results.flat()
    /* De-dup by task id (a task in transition could appear in two lists
       between polls — the server is the source of truth on next refresh). */
    const seen = new Set<number>()
    return merged.filter((task) => (seen.has(task.id) ? false : (seen.add(task.id), true)))
}

/**
 * `GET /api/v1/tasks?agent_id={id}&status=COMPLETED&limit=5` —
 * the agent's most recently finished chats. Ordered by
 * `updated_at DESC` server-side (TaskController default).
 */
export async function fetchRecentChats(agentId: number): Promise<ChatSummary[]> {
    try {
        const result = await getApi().get<{ tasks: ChatSummary[] }>(
            `/tasks?agent_id=${agentId}&status=COMPLETED&limit=5`,
        )
        return result.tasks ?? []
    } catch {
        return []
    }
}
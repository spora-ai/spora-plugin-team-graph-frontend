/**
 * Per-agent detail fetchers.
 *
 * Active / recent chats come from the live `/tasks` endpoint.
 * The full agent record (`/agents/{id}`) supplies everything the
 * detail panel wants beyond the graph payload: description, tools
 * (with server-resolved icons), the owning principal, the LLM
 * driver FK, etc. The agent resource shape is locked in
 * `Spora\Services\AgentResource::toArray()`; we mirror only the
 * fields the plugin's right sidebar actually consumes.
 */

import { getApi } from './client'
import type { ChatSummary } from '../types'

/* Active-chats enum mirrors the agent-detail sidebar's filters. The
 * status values match the live `tasks.status` column; the plugin
 * doesn't translate them into the Mermaid palette slugs at this
 * layer — that's `lib/nodeStatus.ts`. */
const ACTIVE_STATUSES = ['RUNNING', 'AWAITING_SUB_AGENTS', 'PENDING_APPROVAL'] as const

/**
 * `GET /api/v1/tasks?agent_id={id}&status=…&limit=10`
 *
 * The host's TaskController accepts a single `status` per request
 * (no comma-separated list, no `status[]` array), so we fan out
 * one request per active status in parallel and merge the
 * results with a `seen` set to drop duplicates if a task in
 * transition happens to show up under two statuses between polls.
 */
export async function fetchActiveChats(agentId: number): Promise<ChatSummary[]> {
    const results = await Promise.all(
        ACTIVE_STATUSES.map((status) =>
            getApi()
                .get<{ tasks: ChatSummary[] }>(
                    `/tasks?agent_id=${agentId}&status=${status}&limit=10`,
                )
                .then((r) => r.tasks ?? [])
                .catch(() => []),
        ),
    )
    const merged = results.flat()
    const seen = new Set<number>()
    return merged.filter((task) => (seen.has(task.id) ? false : (seen.add(task.id), true)))
}

/**
 * `GET /api/v1/tasks?agent_id={id}&status=COMPLETED&limit=5`
 * — the agent's most recently finished chats.
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

/**
 * Tool metadata on the wire. Mirrors the AgentTool shape from
 * `Spora\Services\AgentResource::toArray()`'s `tools[]` block.
 */
export interface AgentToolEntry {
    tool_class: string
    tool_name: string
    /** Resolved by the host's icon-resolver cascade (per-tool → plugin → puzzle). */
    icon?: string | null
}

/**
 * Owning principal as exposed by `AgentResource::toArray()`. The
 * team-graph payload's `principal` block only describes the
 * principal whose graph we're rendering; this block describes
 * the agent's OWN owner (one-to-one: every agent has exactly one
 * owning principal since migration 0067).
 */
export interface AgentPrincipalBlock {
    id: number
    type: 'user' | 'group'
    name: string
}

/**
 * AgentResource-shaped payload. We carry the full set of fields
 * the host serializes so the panel can read description / tools /
 * principal_id / llm FK without a second round-trip; we just
 * accept `null` on optional fields for fixtures and migrations.
 */
export interface AgentMeta {
    id: number
    name: string
    description: string | null
    llm_driver_config_id: number | null
    max_steps: number
    is_active: boolean
    is_pinned: boolean
    principal_id: number
    principal: AgentPrincipalBlock | null
    tools: AgentToolEntry[]
    created_at: string | null
}

/**
 * `GET /api/v1/agents/{id}` — full agent record. Used by the right
 * sidebar to render description / tools / owning principal, none
 * of which live on the team's `GraphPayload` (which only carries
 * the bare-minimum fields the Mermaid node template needs).
 */
export async function fetchAgentMeta(agentId: number): Promise<AgentMeta | null> {
    try {
        const response = await getApi().get<{ agent: AgentMeta }>(`/agents/${agentId}`)
        return response.agent ?? null
    } catch {
        return null
    }
}

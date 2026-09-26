/**
 * Wire shape for the team-graph plugin.
 *
 * Mirrors the response shape of `GET /api/v1/plugins/team-graph/graph`.
 * Status enum mirrors the host's `app/Enums/AgentStatus.php` — the
 * frontend is the only surface where `AWAITING_INPUT`,
 * `AWAITING_FINAL_APPROVAL`, `APPROVED`, `CANCELLED`, and `QUEUED`
 * are collapsed into a smaller set of class names (see
 * `lib/nodeStatus.ts → statusSlug`); the wire layer still carries
 * the full enum so the panel can show the precise label.
 */

export type AgentStatus =
    | 'RUNNING'
    | 'PENDING_APPROVAL'
    | 'AWAITING_SUB_AGENTS'
    | 'AWAITING_INPUT'
    | 'AWAITING_FINAL_APPROVAL'
    | 'APPROVED'
    | 'FAILED'
    | 'ABORTED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'QUEUED'

export interface GraphNode {
    id: number
    name: string
    role: string | null
    picture_url: string | null
    /** Node status may be null when no in-flight task exists for the
     *  agent — the frontend treats that as `COMPLETED` ("idle") via
     *  the lib/nodeStatus defensive defaults. The backend COALESCE'd
     * the value to COMPLETED in v0.1.2 — the runtime tolerance is
     * belt-and-braces for older envelopes and any future schema drift. */
    status: AgentStatus | string | null
    active_chats: number
    recent_chats_24h: number
}

export interface GraphEdge {
    id: string
    source: number
    target: number
    op: 'sub_agent' | 'handover'
    /**
     * True when the edge comes from the source agent's
     * `agent_tool_overrides.allowed_target_agents` allowlist (the
     * configuration the runtime SubAgentTool would let through).
     * False (or undefined, for legacy fixtures) when the edge was
     * derived purely from historical tool_calls. Today every wire
     * edge is `configured: true` — the flag is kept so the canvas
     * can distinguish "configured but never used" from "configured
     * and actively firing".
     */
    configured: true
    /**
     * Last-24h invocation count from `tool_calls.proposed_arguments`.
     * 0 when the edge is configured but has not been fired in the
     * last 24 hours — the canvas shows this as a dashed line so
     * operators can spot dead-on-arrival configurations.
     */
    count_24h: number
    /**
     * ISO-8601 timestamp of the most recent invocation within the
     * 7-day enrichment window. Null when the edge has never been
     * fired (purely configured).
     */
    last_invoked_at: string | null
}

export interface PrincipalSummary {
    id: number
    type: 'user' | 'group'
    name: string
    is_current_user_owned: boolean
}

export interface GraphPayload {
    principal: PrincipalSummary
    nodes: GraphNode[]
    edges: GraphEdge[]
    generated_at: string
}

/**
 * Agent detail panel — the data the right sidebar / centred modal
 * renders for the currently selected agent. The active-chats list
 * is fetched lazily from `/tasks?agent_id=N&status=…` so the panel
 * stays responsive when the graph endpoint returns a 100-node
 * principal (and so the same panel can be re-opened with the
 * detail already cached).
 */
export interface AgentDetailPanel {
    node: GraphNode
    active_chats: ChatSummary[]
    recent_chats: ChatSummary[]
    outbound: GraphEdge[]
    inbound: GraphEdge[]
    principal: PrincipalSummary
}

export interface ChatSummary {
    id: number
    title: string
    status: AgentStatus
    started_at: string
    preview: string | null
}
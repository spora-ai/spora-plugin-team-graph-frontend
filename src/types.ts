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
    count_24h: number
    last_invoked_at: string
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
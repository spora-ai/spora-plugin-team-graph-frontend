/**
 * Wire shape for the team-graph plugin.
 *
 * Mirrors the response shape of `GET /api/v1/plugins/team-graph/graph`
 * (see `spora-plugin-team-graph` backend plan, "GET /api/v1/plugins/
 * team-graph/graph"). The plugin-local fixtures in `api/fixtures.ts`
 * produce payloads of this shape verbatim so the Mermaid source
 * builder can render the wire response and the fixture response
 * without branching.
 *
 * Status enum mirrors the host's `app/Enums/AgentStatus.php` —
 * the frontend is the only surface where `AWAITING_INPUT`,
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
    status: AgentStatus
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

export interface FixtureSummary {
    key: string
    label: string
}

export interface PrincipalSummary {
    id: number
    type: string
    name: string
    is_current_user_owned: boolean
}

export interface GraphPayload {
    principal: PrincipalSummary
    nodes: GraphNode[]
    edges: GraphEdge[]
    fixtures: FixtureSummary[]
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
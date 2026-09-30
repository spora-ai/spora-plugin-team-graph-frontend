/**
 * Wire shape for the team-graph plugin.
 *
 * Mirrors `GET /api/v1/plugins/team-graph/graph`. The status union mirrors
 * the host's `app/Enums/AgentStatus.php`; the frontend is the only surface
 * that collapses five of those cases into fewer class names (see
 * `lib/nodeStatus.ts → statusSlug`), so the wire layer still carries the
 * full enum and the panel can show the precise label.
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

/**
 * A status as it arrives on the wire: a known case, any other string (the
 * backend can add one before this plugin redeploys — `lib/nodeStatus.ts`
 * falls back to the neutral bucket rather than throwing), or nullish (no
 * in-flight task, an older envelope, or schema drift).
 *
 * `(string & {})` rather than a bare `string` so the editor still offers
 * the `AgentStatus` literals at every call site.
 */
export type WireStatus = AgentStatus | (string & {}) | null | undefined

/** The `kind` discriminant the shared `Avatar` branches on. */
export type ProfilePictureKind = 'avatar' | 'image'

export interface GraphNode {
    id: number
    name: string
    role: string | null
    picture_url: string | null
    /**
     * Server-resolved picture: `bg_color` / `fg_color` paint the node's
     * avatar tile so agents are tellable apart at a glance, matching the
     * dashboard avatar. `variant_key` arrives already derived — the
     * endpoint runs the host's FNV-1a derivation rather than forwarding
     * null, so it must never be re-derived here (see
     * `lib/agentAvatar.ts → toProfilePicture`).
     */
    profile_picture: {
        palette_key: string
        bg_color: string
        fg_color: string
        /**
         * Optional because the canvas only reads the palette keys above:
         * an older envelope or a hand-written fixture without them still
         * has to typecheck and render.
         */
        kind?: ProfilePictureKind
        archetype?: string | null
        variant_key?: string | null
        image_url?: string | null
        image_updated_at?: string | null
    }
    /**
     * Null when the agent has no in-flight task. The backend COALESCEs it
     * to `COMPLETED` since v0.1.2, so the tolerance is belt-and-braces for
     * older envelopes; `lib/nodeStatus.ts` treats it as "idle".
     */
    status: WireStatus
    active_chats: number
    recent_chats_24h: number
}

export interface GraphEdge {
    id: string
    source: number
    target: number
    op: 'sub_agent' | 'handover'
    /**
     * Set when the edge comes from the source agent's
     * `agent_tool_overrides.allowed_target_agents` allowlist rather than
     * from historical tool calls. Every wire edge is `true` today; the flag
     * is kept so the canvas can tell "configured but never used" from
     * "configured and firing".
     */
    configured: true
    /** 24h invocation count; 0 lets the canvas spot dead configurations. */
    count_24h: number
    /** Most recent invocation in the 7-day window, or null if never fired. */
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
 * Agent detail panel — the data the right sidebar / centred modal renders
 * for the selected agent. The active-chats list is fetched lazily from
 * `/tasks?agent_id=N&status=…` so the panel stays responsive on a 100-node
 * principal and can be re-opened with the detail already cached.
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

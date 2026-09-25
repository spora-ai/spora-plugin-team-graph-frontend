/**
 * Plugin-local fixture data.
 *
 * Three principals (Tiny Startup / Marketing / Solo) lifted
 * verbatim from Prototype E
 * (`spora-workspace/prototypes/prototype-e-mermaid.html → FIXTURES`).
 * The principal selector shows them when the graph response
 * carries a `fixtures` array; the canvas renders them through
 * the same `buildMermaidSource()` path the real wire response
 * uses so the two surfaces stay visually identical.
 *
 * Chats live alongside each fixture so the detail panel can
 * show the same "active chats" / "recent chats" sections in
 * fixture mode that it shows against the live `/tasks` endpoint.
 * The keys are fixture-local (101, 102, …) — they don't have to
 * map onto real task ids because the panel only reads them
 * when the panel is built from the in-memory fixture map.
 */
import type { ChatSummary, GraphPayload } from '../types'

interface FixtureChats {
    [agentId: number]: ChatSummary[]
}

interface FixturePayload {
    graph: GraphPayload
    chats: FixtureChats
}

const TINY_STARTUP: FixturePayload = {
    graph: {
        principal: { id: -1, type: 'group', name: 'Tiny Startup', is_current_user_owned: true },
        nodes: [
            { id: 1, name: 'Alex', role: 'Marketing Lead', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 4 },
            { id: 2, name: 'Blake', role: 'Content Writer', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3 },
            { id: 3, name: 'Casey', role: 'Translator', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 1 },
            { id: 4, name: 'Dakota', role: 'Designer', picture_url: null, status: 'AWAITING_SUB_AGENTS', active_chats: 1, recent_chats_24h: 2 },
            { id: 5, name: 'Ellis', role: 'Developer', picture_url: null, status: 'PENDING_APPROVAL', active_chats: 1, recent_chats_24h: 2 },
        ],
        edges: [
            { id: '1->2', source: 1, target: 2, op: 'sub_agent', count_24h: 3, last_invoked_at: '2026-09-23T10:14:00Z' },
            { id: '1->4', source: 1, target: 4, op: 'sub_agent', count_24h: 2, last_invoked_at: '2026-09-23T09:48:00Z' },
            { id: '1->5', source: 1, target: 5, op: 'sub_agent', count_24h: 2, last_invoked_at: '2026-09-23T08:32:00Z' },
            { id: '2->3', source: 2, target: 3, op: 'sub_agent', count_24h: 1, last_invoked_at: '2026-09-23T07:11:00Z' },
            { id: '2->1', source: 2, target: 1, op: 'sub_agent', count_24h: 1, last_invoked_at: '2026-09-23T09:22:00Z' },
        ],
        fixtures: [
            { key: 'tinyStartup', label: 'Tiny Startup' },
            { key: 'marketing', label: 'Marketing Team' },
            { key: 'solo', label: 'Solo Workspace' },
        ],
        generated_at: '2026-09-25T08:14:00Z',
    },
    chats: {
        1: [
            { id: 101, title: 'Q4 launch — kickoff', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Plan the announcement…' },
            { id: 98, title: 'Newsletter draft review', status: 'PENDING_APPROVAL', started_at: '2026-09-25T08:10:00Z', preview: 'Ready for sign-off' },
        ],
        2: [
            { id: 103, title: 'Blog: Why we chose Spora', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Drafting intro…' },
        ],
        3: [
            { id: 95, title: 'DE translation — homepage', status: 'COMPLETED', started_at: '2026-09-25T06:14:00Z', preview: 'Translated + signed off' },
        ],
        4: [
            { id: 102, title: 'Homepage mockup v2', status: 'AWAITING_SUB_AGENTS', started_at: '2026-09-25T08:12:00Z', preview: 'Awaiting design sub' },
        ],
        5: [
            { id: 99, title: 'Login page implementation', status: 'PENDING_APPROVAL', started_at: '2026-09-25T08:09:00Z', preview: 'PR ready for review' },
        ],
    },
}

const MARKETING: FixturePayload = {
    graph: {
        principal: { id: -2, type: 'group', name: 'Marketing Team', is_current_user_owned: true },
        nodes: [
            { id: 11, name: 'Maya', role: 'Strategy Lead', picture_url: null, status: 'RUNNING', active_chats: 3, recent_chats_24h: 9 },
            { id: 12, name: 'Max', role: 'Content Writer', picture_url: null, status: 'RUNNING', active_chats: 2, recent_chats_24h: 6 },
            { id: 13, name: 'Mira', role: 'Designer', picture_url: null, status: 'AWAITING_SUB_AGENTS', active_chats: 1, recent_chats_24h: 4 },
            { id: 14, name: 'Marc', role: 'Developer', picture_url: null, status: 'PENDING_APPROVAL', active_chats: 1, recent_chats_24h: 3 },
            { id: 15, name: 'Mona', role: 'SEO Specialist', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 5 },
            { id: 16, name: 'Mike', role: 'Analytics', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 2 },
            { id: 17, name: 'Mia', role: 'Office Manager', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 1 },
            { id: 18, name: 'Mark', role: 'Legal', picture_url: null, status: 'COMPLETED', active_chats: 0, recent_chats_24h: 1 },
        ],
        edges: [
            { id: '11->12', source: 11, target: 12, op: 'sub_agent', count_24h: 5, last_invoked_at: '2026-09-23T10:14:00Z' },
            { id: '11->13', source: 11, target: 13, op: 'sub_agent', count_24h: 4, last_invoked_at: '2026-09-23T09:48:00Z' },
            { id: '11->14', source: 11, target: 14, op: 'sub_agent', count_24h: 3, last_invoked_at: '2026-09-23T08:32:00Z' },
            { id: '11->15', source: 11, target: 15, op: 'sub_agent', count_24h: 6, last_invoked_at: '2026-09-23T07:11:00Z' },
            { id: '12->16', source: 12, target: 16, op: 'sub_agent', count_24h: 2, last_invoked_at: '2026-09-23T09:22:00Z' },
            { id: '13->14', source: 13, target: 14, op: 'sub_agent', count_24h: 1, last_invoked_at: '2026-09-23T08:00:00Z' },
            { id: '14->13', source: 14, target: 13, op: 'sub_agent', count_24h: 1, last_invoked_at: '2026-09-23T08:00:00Z' },
        ],
        fixtures: [
            { key: 'tinyStartup', label: 'Tiny Startup' },
            { key: 'marketing', label: 'Marketing Team' },
            { key: 'solo', label: 'Solo Workspace' },
        ],
        generated_at: '2026-09-25T08:14:00Z',
    },
    chats: {
        11: [
            { id: 201, title: 'Q4 campaign plan', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Drafting themes…' },
        ],
        12: [
            { id: 203, title: 'Blog post: Spora vs DIY', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Outlining…' },
        ],
        13: [
            { id: 202, title: 'Homepage hero v3', status: 'AWAITING_SUB_AGENTS', started_at: '2026-09-25T08:12:00Z', preview: 'Pending copy' },
        ],
        14: [
            { id: 199, title: 'Tracking pixel integration', status: 'PENDING_APPROVAL', started_at: '2026-09-25T08:09:00Z', preview: 'PR ready' },
        ],
        15: [
            { id: 200, title: 'Keyword audit', status: 'RUNNING', started_at: '2026-09-25T08:04:00Z', preview: 'Reviewing terms' },
        ],
        16: [
            { id: 194, title: 'September report', status: 'COMPLETED', started_at: '2026-09-25T06:14:00Z', preview: 'Sent to Maya' },
        ],
        17: [
            { id: 188, title: 'Office supplies', status: 'COMPLETED', started_at: '2026-09-24T08:14:00Z', preview: 'Ordered' },
        ],
        18: [
            { id: 189, title: 'NDA review', status: 'COMPLETED', started_at: '2026-09-24T08:14:00Z', preview: 'Signed off' },
        ],
    },
}

const SOLO: FixturePayload = {
    graph: {
        principal: { id: -3, type: 'user', name: 'Solo Workspace', is_current_user_owned: true },
        nodes: [
            { id: 21, name: 'Sam', role: 'Personal Assistant', picture_url: null, status: 'RUNNING', active_chats: 2, recent_chats_24h: 7 },
            { id: 22, name: 'Sara', role: 'Calendar Manager', picture_url: null, status: 'PENDING_APPROVAL', active_chats: 1, recent_chats_24h: 4 },
            { id: 23, name: 'Sven', role: 'Note Taker', picture_url: null, status: 'RUNNING', active_chats: 1, recent_chats_24h: 3 },
            { id: 24, name: 'Skye', role: 'Travel Planner', picture_url: null, status: 'FAILED', active_chats: 0, recent_chats_24h: 1 },
        ],
        edges: [
            { id: '21->22', source: 21, target: 22, op: 'sub_agent', count_24h: 4, last_invoked_at: '2026-09-23T10:14:00Z' },
            { id: '21->23', source: 21, target: 23, op: 'sub_agent', count_24h: 3, last_invoked_at: '2026-09-23T09:48:00Z' },
            { id: '22->21', source: 22, target: 21, op: 'sub_agent', count_24h: 2, last_invoked_at: '2026-09-23T09:22:00Z' },
        ],
        fixtures: [
            { key: 'tinyStartup', label: 'Tiny Startup' },
            { key: 'marketing', label: 'Marketing Team' },
            { key: 'solo', label: 'Solo Workspace' },
        ],
        generated_at: '2026-09-25T08:14:00Z',
    },
    chats: {
        21: [
            { id: 301, title: 'Morning briefing', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Compiling…' },
        ],
        22: [
            { id: 303, title: 'Reschedule Friday standup', status: 'PENDING_APPROVAL', started_at: '2026-09-25T08:09:00Z', preview: 'Need your OK' },
        ],
        23: [
            { id: 302, title: 'Capture call notes', status: 'RUNNING', started_at: '2026-09-25T08:14:00Z', preview: 'Listening…' },
        ],
        24: [
            { id: 295, title: 'Book Berlin trip', status: 'FAILED', started_at: '2026-09-25T07:44:00Z', preview: 'API timeout' },
        ],
    },
}

const FIXTURES: Record<string, FixturePayload> = {
    tinyStartup: TINY_STARTUP,
    marketing: MARKETING,
    solo: SOLO,
}

export const FIXTURE_KEYS = ['tinyStartup', 'marketing', 'solo'] as const
export type FixtureKey = (typeof FIXTURE_KEYS)[number]

export interface FixtureBundle {
    graph: GraphPayload
    chats: FixtureChats
}

export function fixtureByKey(key: string): FixtureBundle | null {
    const payload = FIXTURES[key]
    return payload === undefined ? null : { graph: payload.graph, chats: payload.chats }
}

export function fixtureListFromKeys(): { key: string; label: string }[] {
    return FIXTURE_KEYS.map((k) => ({ key: k, label: FIXTURES[k]!.graph.principal.name }))
}
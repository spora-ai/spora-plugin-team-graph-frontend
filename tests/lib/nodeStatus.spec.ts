import { describe, it, expect } from 'vitest'
import { statusSlug, statusPillClass, statusLabel, statusColor } from '../../src/lib/nodeStatus'
import type { AgentStatus } from '../../src/types'

/**
 * Status enum → display slug mapping.
 *
 * The full `AgentStatus` enum (11 values) is collapsed onto the
 * 6-slot Mermaid classDef palette. Every status must produce a
 * slug; a missing branch would surface as the Mermaid fallback
 * (no colour), silently demoting the node.
 */
describe('statusSlug', () => {
    const cases: Array<[AgentStatus, string]> = [
        ['RUNNING', 'running'],
        ['PENDING_APPROVAL', 'pending'],
        ['AWAITING_SUB_AGENTS', 'awaiting'],
        ['AWAITING_INPUT', 'awaiting'],
        ['AWAITING_FINAL_APPROVAL', 'awaiting'],
        ['APPROVED', 'running'],
        ['FAILED', 'failed'],
        ['ABORTED', 'aborted'],
        ['COMPLETED', 'completed'],
        ['CANCELLED', 'completed'],
        ['QUEUED', 'completed'],
    ]
    for (const [input, expected] of cases) {
        it(`maps ${input} → ${expected}`, () => {
            expect(statusSlug(input)).toBe(expected)
        })
    }
})

describe('statusPillClass', () => {
    it('produces the tg-status- prefixed class name', () => {
        expect(statusPillClass('RUNNING')).toBe('tg-status-running')
        expect(statusPillClass('PENDING_APPROVAL')).toBe('tg-status-pending')
    })
})

describe('statusLabel', () => {
    it('returns a non-empty human label for every status', () => {
        const statuses: AgentStatus[] = [
            'RUNNING', 'PENDING_APPROVAL', 'AWAITING_SUB_AGENTS',
            'AWAITING_INPUT', 'AWAITING_FINAL_APPROVAL', 'APPROVED',
            'FAILED', 'ABORTED', 'COMPLETED', 'CANCELLED', 'QUEUED',
        ]
        for (const s of statuses) {
            expect(statusLabel(s).length).toBeGreaterThan(0)
        }
    })
})

describe('statusColor', () => {
    it('returns a hex colour for every status', () => {
        const statuses: AgentStatus[] = [
            'RUNNING', 'PENDING_APPROVAL', 'AWAITING_SUB_AGENTS',
            'AWAITING_INPUT', 'AWAITING_FINAL_APPROVAL', 'APPROVED',
            'FAILED', 'ABORTED', 'COMPLETED', 'CANCELLED', 'QUEUED',
        ]
        for (const s of statuses) {
            expect(statusColor(s)).toMatch(/^#[0-9a-f]{6}$/i)
        }
    })
})
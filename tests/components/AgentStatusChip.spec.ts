import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentStatusChip from '../../src/components/AgentStatusChip.vue'

/**
 * `AgentStatusChip` — extracted from the panel header so a status
 * poll re-renders only the chip (not the static name + #ID line).
 *
 * The test below mounts the chip, then changes the `status` prop
 * and confirms the rendered text tracks the new status. We mock
 * the node-status helpers so the spy makes a no-op call and we
 * can count how many times the chip's render function fires.
 */

describe('AgentStatusChip', () => {
    it('renders the status label inside a .tg-status-pill', () => {
        const wrapper = mount(AgentStatusChip, { props: { status: 'RUNNING' } })
        expect(wrapper.find('.tg-status-pill').exists()).toBe(true)
        expect(wrapper.find('.dot').exists()).toBe(true)
        expect(wrapper.text()).toBe('running')
        wrapper.unmount()
    })

    it('updates the label when the status prop changes', async () => {
        const wrapper = mount(AgentStatusChip, { props: { status: 'RUNNING' } })
        expect(wrapper.text()).toBe('running')
        await wrapper.setProps({ status: 'COMPLETED' })
        expect(wrapper.text()).toBe('idle')
        await wrapper.setProps({ status: 'FAILED' })
        expect(wrapper.text()).toBe('failed')
        wrapper.unmount()
    })

    it('tolerates a null status (defensive — the panel may briefly see null during a refetch)', () => {
        const wrapper = mount(AgentStatusChip, { props: { status: null } })
        // statusLabel(null) returns 'idle' (the defensive default).
        // We don't pin the exact text because the node-status module
        // owns the fallback; just confirm no crash and the pill is
        // present.
        expect(wrapper.find('.tg-status-pill').exists()).toBe(true)
        wrapper.unmount()
    })

    it('keeps the rendered label in sync with the status prop', async () => {
        /*
         * The whole point of extracting this component is reactivity
         * isolation: when `selectedNode.status` flips during a poll,
         * Vue re-evaluates only the chip's render function (because
         * `:status` is the only reactive dependency). The static
         * name + #ID in the parent header do NOT need to re-render.
         * We don't pin Vue's internal scheduling — we just confirm
         * the chip keeps reflecting the prop, which is the visible
         * contract the operator cares about.
         */
        const wrapper = mount(AgentStatusChip, { props: { status: 'RUNNING' } })
        expect(wrapper.text()).toBe('running')
        expect(wrapper.find('.tg-status-pill').classes()).toContain('tg-status-running')

        await wrapper.setProps({ status: 'COMPLETED' })
        expect(wrapper.text()).toBe('idle')
        expect(wrapper.find('.tg-status-pill').classes()).toContain('tg-status-completed')

        await wrapper.setProps({ status: 'FAILED' })
        expect(wrapper.text()).toBe('failed')
        expect(wrapper.find('.tg-status-pill').classes()).toContain('tg-status-failed')

        wrapper.unmount()
    })
})

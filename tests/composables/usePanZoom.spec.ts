import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { usePanZoom } from '../../src/composables/usePanZoom'

/**
 * `usePanZoom` — the imperative transform on `.tg-canvas-content`.
 *
 * Everything the node-card overlay depends on flows through this
 * composable: the cards are absolutely positioned inside the *same*
 * element the transform is written to, so `applyView()` moving that
 * one element is what keeps the cards and the Mermaid edges locked
 * together. These tests therefore pin the exact `transform` string,
 * not just "it changed".
 *
 * The wrap catches `pointerdown/move/up/cancel` and `wheel`; the
 * diagram is a stand-in `<svg width=… height=…>` inside the content
 * layer so `readSvgSize()` has something to measure. happy-dom has
 * no layout engine, so the viewport box is stubbed.
 */

interface Harness {
    wrapRef: Ref<HTMLElement | null>
    contentRef: Ref<HTMLElement | null>
    fit: () => void
    zoomIn: () => void
    zoomOut: () => void
}

interface Box {
    w: number
    h: number
}

const SVG: Box = { w: 400, h: 200 }
const VIEWPORT: Box = { w: 800, h: 600 }

/** Minimal happy-dom stand-in for a layout engine. */
function stubLayout(el: Element, width: number, height: number): void {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: height, configurable: true })
    el.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect
}

/**
 * Build the wrap → content → svg structure, hand the composable refs
 * that start empty and are filled afterwards, so the internal
 * `watch(wrapRef, …)` actually fires and attaches the listeners.
 * The returned harness is only usable after the caller's first
 * `await nextTick()`.
 */
async function mountHarness(svg: Box = SVG, viewport: Box = VIEWPORT): Promise<Harness> {
    const wrap = document.createElement('div')
    wrap.setAttribute('data-testid', 'wrap')
    const content = document.createElement('div')
    content.setAttribute('data-testid', 'content')
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    if (svg.w > 0) svgEl.setAttribute('width', String(svg.w))
    if (svg.h > 0) svgEl.setAttribute('height', String(svg.h))
    content.appendChild(svgEl)
    wrap.appendChild(content)
    document.body.appendChild(wrap)
    stubLayout(wrap, viewport.w, viewport.h)

    const wrapRef = ref<HTMLElement | null>(null)
    const contentRef = ref<HTMLElement | null>(null)
    const api = usePanZoom({ wrapRef, contentRef })
    wrapRef.value = wrap
    contentRef.value = content
    await nextTick()
    return { wrapRef, contentRef, ...api }
}

/**
 * A pointer/wheel event shaped like the real thing. happy-dom's
 * `PointerEvent` constructor does not populate every field the
 * composable reads, so the properties are assigned directly.
 */
function gesture(type: string, init: Record<string, unknown> = {}): Event {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    for (const [k, v] of Object.entries(init)) {
        if (k === 'target') continue
        ;(ev as unknown as Record<string, unknown>)[k] = v
    }
    if (init.target !== undefined) Object.defineProperty(ev, 'target', { value: init.target })
    return ev
}

function down(target: Element, x: number, y: number, pointerId = 1): Event {
    return gesture('pointerdown', { button: 0, clientX: x, clientY: y, pointerId, target })
}

function move(target: Element, x: number, y: number, pointerId = 1): Event {
    return gesture('pointermove', { clientX: x, clientY: y, pointerId, target })
}

function up(target: Element, pointerId = 1): Event {
    return gesture('pointerup', { pointerId, target })
}

function transformOf(h: Harness): string {
    return (h.contentRef.value as HTMLElement).style.transform
}

beforeEach(() => {
    document.body.innerHTML = ''
})

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('usePanZoom — fit()', () => {
    it('centres a diagram smaller than the viewport without upscaling it', async () => {
        const h = await mountHarness()
        h.fit()
        // k = min(784/400, 584/200, 1) = 1 (never above 1).
        expect(transformOf(h)).toBe('translate(200px, 200px) scale(1)')
    })

    it('scales a diagram larger than the viewport down to fit, centred', async () => {
        const h = await mountHarness({ w: 1600, h: 1200 })
        h.fit()
        const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(transformOf(h))
        expect(m).not.toBeNull()
        const [, x, y, k] = m as RegExpExecArray
        // k = min(784/1600, 584/1200, 1) = 0.48666…
        expect(Number(k)).toBeCloseTo(0.4867, 3)
        // x / y centre the scaled 1600 × 1200 box in 800 × 600.
        expect(Number(x)).toBeCloseTo((800 - 1600 * Number(k)) / 2, 1)
        expect(Number(y)).toBeCloseTo((600 - 1200 * Number(k)) / 2, 1)
    })

    it('falls back to clientWidth/clientHeight when the SVG has no size attributes', async () => {
        const h = await mountHarness({ w: 0, h: 0 })
        const svgEl = h.wrapRef.value?.querySelector('svg') as SVGElement
        stubLayout(svgEl, 400, 200)
        expect(() => h.fit()).not.toThrow()
        expect(transformOf(h)).toBe('translate(200px, 200px) scale(1)')
    })

    it('no-ops when the SVG reports a zero size', async () => {
        const h = await mountHarness()
        const svgEl = h.wrapRef.value?.querySelector('svg') as SVGElement
        svgEl.setAttribute('width', '0')
        svgEl.setAttribute('height', '0')
        stubLayout(svgEl, 0, 0)
        h.fit()
        expect(transformOf(h)).toBe('')
    })

    it('no-ops before the wrap is mounted (first render lands late)', () => {
        const api = usePanZoom({ wrapRef: ref(null), contentRef: ref(null) })
        expect(() => api.fit()).not.toThrow()
        expect(() => api.zoomIn()).not.toThrow()
        expect(() => api.zoomOut()).not.toThrow()
    })

    it('no-ops when the wrap is mounted but the SVG is not rendered yet', async () => {
        const wrap = document.createElement('div')
        stubLayout(wrap, 800, 600)
        document.body.appendChild(wrap)
        const wrapRef = ref<HTMLElement | null>(null)
        const contentRef = ref<HTMLElement | null>(null)
        const api = usePanZoom({ wrapRef, contentRef })
        wrapRef.value = wrap
        await nextTick()
        expect(() => api.fit()).not.toThrow()
    })
})

describe('usePanZoom — zoom buttons', () => {
    it('zooms around the viewport centre', async () => {
        const h = await mountHarness()
        h.zoomIn()
        // x' = 400 - (400 - 0) * 1.25 = -100 ; y' = 300 - 300 * 1.25 = -75
        expect(transformOf(h)).toBe('translate(-100px, -75px) scale(1.25)')
    })

    it('zooms back out to exactly 1 rather than past it', async () => {
        const h = await mountHarness()
        h.zoomIn()
        h.zoomOut()
        expect(transformOf(h)).toBe('translate(0px, 0px) scale(1)')
    })

    it('clamps the scale at MIN_SCALE and MAX_SCALE', async () => {
        const h = await mountHarness()
        for (let i = 0; i < 40; i++) h.zoomOut()
        expect(transformOf(h)).toContain('scale(0.2)')
        for (let i = 0; i < 80; i++) h.zoomIn()
        expect(transformOf(h)).toContain('scale(3)')
    })
})

describe('usePanZoom — wheel zoom', () => {
    it('zooms around the cursor so the content under it stays put', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        // x' = 200 - (200 - 0) * 1.1 = -20 ; y' = 100 - 100 * 1.1 = -10
        wrap.dispatchEvent(gesture('wheel', { clientX: 200, clientY: 100, deltaY: -10 }))
        const [, x, y, k] = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(
            transformOf(h),
        ) as RegExpExecArray
        expect(Number(x)).toBeCloseTo(-20, 6)
        expect(Number(y)).toBeCloseTo(-10, 6)
        expect(Number(k)).toBeCloseTo(1.1, 6)
    })

    it('zooms out on a positive wheel delta and suppresses the page scroll', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        const ev = gesture('wheel', { clientX: 0, clientY: 0, deltaY: 120 })
        wrap.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
        expect(transformOf(h)).toContain('scale(')
    })
})

describe('usePanZoom — pointer panning', () => {
    it('pans by the pointer delta and flags the gesture as moved', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.dispatchEvent(down(wrap, 10, 20))
        expect(wrap.classList.contains('panning')).toBe(true)
        wrap.dispatchEvent(move(wrap, 60, 50))
        expect(transformOf(h)).toBe('translate(50px, 30px) scale(1)')
        wrap.dispatchEvent(up(wrap))
        expect(wrap.classList.contains('panning')).toBe(false)
    })

    it('dispatches tg-canvas-tap for an empty tap so the page can clear the selection', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        const onTap = vi.fn()
        wrap.addEventListener('tg-canvas-tap', onTap)
        wrap.dispatchEvent(down(wrap, 10, 20))
        wrap.dispatchEvent(up(wrap))
        expect(onTap).toHaveBeenCalledTimes(1)
    })

    it('does not dispatch tg-canvas-tap after a real drag', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        const onTap = vi.fn()
        wrap.addEventListener('tg-canvas-tap', onTap)
        wrap.dispatchEvent(down(wrap, 10, 20))
        wrap.dispatchEvent(move(wrap, 90, 20))
        wrap.dispatchEvent(up(wrap))
        expect(onTap).not.toHaveBeenCalled()
    })

    it('ignores non-primary buttons', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.dispatchEvent(gesture('pointerdown', { button: 2, clientX: 10, clientY: 20, pointerId: 4, target: wrap }))
        expect(wrap.classList.contains('panning')).toBe(false)
    })

    it('ignores pointerup / pointermove with no gesture in flight', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.dispatchEvent(move(wrap, 50, 50))
        wrap.dispatchEvent(up(wrap))
        expect(transformOf(h)).toBe('')
    })

    it('does not start a pan when the pointer lands on interactive chrome', async () => {
        // `g.node` (Mermaid's own boxes), `button` (the zoom toolbar)
        // and `[data-tg-no-pan]` (the Vue node cards) all opt out —
        // without the guard the wrap's setPointerCapture would hold the
        // pointer and the element's own click would never fire.
        for (const [tag, attrs] of [
            ['g', { class: 'node' }],
            ['button', {}],
            ['div', { 'data-tg-no-pan': '' }],
        ] as const) {
            const h = await mountHarness()
            const wrap = h.wrapRef.value as HTMLElement
            const decoy = document.createElement(tag)
            for (const [k, v] of Object.entries(attrs)) decoy.setAttribute(k, v)
            wrap.appendChild(decoy)
            wrap.dispatchEvent(down(decoy, 1, 1, 9))
            expect(wrap.classList.contains('panning')).toBe(false)
            wrap.dispatchEvent(move(wrap, 80, 80, 9))
            expect(transformOf(h)).toBe('')
        }
    })

    it('still pans when the gesture started on the content layer itself', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.dispatchEvent(down(wrap, 5, 5))
        wrap.dispatchEvent(move(wrap, 35, 15))
        expect(transformOf(h)).toBe('translate(30px, 10px) scale(1)')
    })

    it('survives a browser that refuses setPointerCapture / releasePointerCapture', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.setPointerCapture = () => {
            throw new Error('NotSupportedError')
        }
        wrap.hasPointerCapture = () => true
        wrap.releasePointerCapture = () => {
            throw new Error('InvalidPointerId')
        }
        expect(() => wrap.dispatchEvent(down(wrap, 5, 5, 7))).not.toThrow()
        wrap.dispatchEvent(move(wrap, 35, 15, 7))
        expect(transformOf(h)).toBe('translate(30px, 10px) scale(1)')
        expect(() => wrap.dispatchEvent(up(wrap, 7))).not.toThrow()
    })

    it('treats pointercancel like pointerup', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        const onTap = vi.fn()
        wrap.addEventListener('tg-canvas-tap', onTap)
        wrap.dispatchEvent(down(wrap, 1, 1, 8))
        wrap.dispatchEvent(gesture('pointercancel', { pointerId: 8, target: wrap }))
        expect(wrap.classList.contains('panning')).toBe(false)
        expect(onTap).toHaveBeenCalledTimes(1)
    })
})

describe('usePanZoom — window resize', () => {
    it('clamps a view that has panned off-canvas back into the viewport', async () => {
        const h = await mountHarness()
        const wrap = h.wrapRef.value as HTMLElement
        h.fit()
        wrap.dispatchEvent(down(wrap, 0, 0, 11))
        wrap.dispatchEvent(move(wrap, 5000, 5000, 11))
        expect(transformOf(h)).toBe('translate(5200px, 5200px) scale(1)')
        window.dispatchEvent(new Event('resize'))
        expect(transformOf(h)).toBe('translate(16px, 16px) scale(1)')
    })

    it('leaves a view that is already inside the clamp window untouched', async () => {
        // A diagram wider than the viewport is the case where fit()
        // lands *between* `minX` and 16, so the clamp is a no-op.
        const h = await mountHarness({ w: 1600, h: 1200 })
        h.fit()
        const before = transformOf(h)
        window.dispatchEvent(new Event('resize'))
        expect(transformOf(h)).toBe(before)
    })

    it('is a no-op when the wrap is not mounted or the SVG is not rendered yet', () => {
        const api = usePanZoom({ wrapRef: ref(null), contentRef: ref(null) })
        expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
        expect(api.fit).toBeTypeOf('function')
    })

    it('detaches every listener on unmount', async () => {
        const wrapper = mount(
            {
                template: '<div ref="wrapRef" data-testid="wrap"><div ref="contentRef" data-testid="content"><svg width="400" height="200" /></div></div>',
                setup() {
                    const wrapRef = ref<HTMLElement | null>(null)
                    const contentRef = ref<HTMLElement | null>(null)
                    const api = usePanZoom({ wrapRef, contentRef })
                    return { wrapRef, contentRef, api }
                },
            },
            { attachTo: document.body },
        )
        // `usePanZoom` attaches its listeners from a `watch(wrapRef)`,
        // which is a pre-flush watcher: one tick after the template
        // refs bind.
        await nextTick()
        const wrap = wrapper.find('[data-testid="wrap"]').element as HTMLElement
        const content = wrapper.find('[data-testid="content"]').element as HTMLElement
        stubLayout(wrap, 800, 600)
        wrap.dispatchEvent(down(wrap, 0, 0, 21))
        wrap.dispatchEvent(move(wrap, 40, 25, 21))
        expect(content.style.transform).toBe('translate(40px, 25px) scale(1)')

        wrapper.unmount()
        // Post-unmount the transform must be frozen: a stale
        // pointermove listener would still be writing to it.
        const frozen = content.style.transform
        wrap.dispatchEvent(move(wrap, 900, 900, 21))
        expect(content.style.transform).toBe(frozen)
    })
})

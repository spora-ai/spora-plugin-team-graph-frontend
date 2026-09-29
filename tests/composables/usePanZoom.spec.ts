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
    hostRef: Ref<HTMLElement | null>
    fit: () => boolean
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
 * Build the wrap → content → host → svg structure, hand the composable
 * refs that start empty and are filled afterwards, so the internal
 * `watch(wrapRef, …)` actually fires and attaches the listeners.
 *
 * The zoom toolbar's `Icon` components are stubbed in too: each is a
 * real `<svg>`, and the harness used to leave the wrap holding only
 * those, so a wrap-scoped `querySelector('svg')` found a 14 × 14
 * toolbar icon instead of the diagram. That is the bug the `hostRef`
 * requirement exists to make unrepresentable, so the decoys stay.
 */
async function mountHarness(svg: Box = SVG, viewport: Box = VIEWPORT): Promise<Harness> {
    const wrap = document.createElement('div')
    wrap.setAttribute('data-testid', 'wrap')
    const content = document.createElement('div')
    content.setAttribute('data-testid', 'content')
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'host')
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    if (svg.w > 0) svgEl.setAttribute('width', String(svg.w))
    if (svg.h > 0) svgEl.setAttribute('height', String(svg.h))
    host.appendChild(svgEl)
    content.appendChild(host)
    wrap.appendChild(content)
    const toolbar = document.createElement('div')
    for (const name of ['zoom-in', 'zoom-out', 'zoom-fit']) {
        const btn = document.createElement('button')
        btn.setAttribute('data-testid', name)
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('class', 'spora-icon')
        stubLayout(icon, 14, 14)
        btn.appendChild(icon)
        toolbar.appendChild(btn)
    }
    wrap.appendChild(toolbar)
    document.body.appendChild(wrap)
    stubLayout(wrap, viewport.w, viewport.h)

    const wrapRef = ref<HTMLElement | null>(null)
    const contentRef = ref<HTMLElement | null>(null)
    const hostRef = ref<HTMLElement | null>(null)
    const api = usePanZoom({ wrapRef, contentRef, hostRef })
    wrapRef.value = wrap
    contentRef.value = content
    hostRef.value = host
    await nextTick()
    return { wrapRef, contentRef, hostRef, ...api }
}

/**
 * Capture the `ResizeObserver` callbacks the composable registers.
 *
 * happy-dom ships a `ResizeObserver`, but with no layout engine it never
 * fires on its own, so the "the canvas grew and the diagram re-framed"
 * path would be silently untested. This installs a recording stub
 * *before* the composable runs, so the tests can resize the wrap and
 * deliver the notification the browser would.
 */
interface ObserverStub {
    callbacks: Array<() => void>
    targets: Element[]
    disconnected: number
    restore: () => void
}

function installResizeObserverStub(): ObserverStub {
    const stub: ObserverStub = { callbacks: [], targets: [], disconnected: 0, restore: () => {} }
    const original = globalThis.ResizeObserver
    class RecordingResizeObserver {
        constructor(private readonly callback: () => void) {}
        observe(target: Element): void {
            stub.callbacks.push(this.callback)
            stub.targets.push(target)
        }
        unobserve(): void {}
        disconnect(): void {
            stub.disconnected += 1
        }
    }
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver
    stub.restore = () => {
        globalThis.ResizeObserver = original
    }
    return stub
}

/** Read `k` out of the composable's `transform` string. */
function scaleOf(h: Harness): number {
    const m = /scale\((-?[\d.]+)\)/.exec(transformOf(h))
    if (m === null) throw new Error(`no scale in "${transformOf(h)}"`)
    return Number(m[1])
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
    it('enlarges a diagram smaller than the viewport so it fills the canvas', async () => {
        const h = await mountHarness()
        expect(h.fit()).toBe(true)
        // k = min(784/400, 584/200, 1.5) = 1.5 — the enlargement cap.
        // Both axes stay constrained and the slack is split evenly, so
        // the 400 × 200 diagram becomes 600 × 300 centred in 800 × 600.
        expect(transformOf(h)).toBe('translate(100px, 150px) scale(1.5)')
    })

    it('fills the tighter axis and centres the slack on the other one', async () => {
        // A 4-node graph is wider than it is tall (667 × 401 in a
        // 722 × 618 canvas): the width binds, and the leftover height
        // is split above and below the diagram.
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 722, h: 618 })
        expect(h.fit()).toBe(true)
        const [, x, y, k] = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(
            transformOf(h),
        ) as RegExpExecArray
        // k = min(706/666.75, 602/401, 1.5) = 1.0588…
        expect(Number(k)).toBeCloseTo(1.0588, 3)
        expect(Number(x)).toBeCloseTo(8, 1)
        expect(Number(y)).toBeCloseTo((618 - 401 * Number(k)) / 2, 1)
    })

    it("ignores the zoom toolbar's icon SVGs and measures the diagram", async () => {
        /*
         * The regression: `readSvgSize()` used to run
         * `wrap.querySelector('svg')`, which returns the *first* svg in
         * document order — and the wrap's own zoom toolbar renders
         * three `Icon` components, each a 14 × 14 `<svg>`, long before
         * Mermaid commits the diagram. Measured live, that made `fit()`
         * compute `translate(373px, 301px) scale(1.5)` from a 12 × 12
         * "diagram" and threw the real graph off the canvas. The
         * harness keeps the toolbar icons in the wrap on purpose.
         */
        const h = await mountHarness()
        expect(h.wrapRef.value?.querySelector('svg.spora-icon')).not.toBeNull()
        expect(transformOf(h)).toBe('')
        h.fit()
        // 400 × 200, not 14 × 14: 784/400 = 1.96, 584/200 = 2.92.
        expect(transformOf(h)).toBe('translate(100px, 150px) scale(1.5)')
    })

    it('reports "did not fit" and leaves the view alone when no diagram is committed yet', async () => {
        /*
         * The other half of the first-load bug: the pending fit was
         * cleared *before* `fit()` ran, so a fit that fired before
         * Mermaid resolved was consumed by a no-op and the graph was
         * never framed. `fit()` now returns false so the caller keeps
         * its request pending for the render that can satisfy it.
         */
        const h = await mountHarness()
        ;(h.hostRef.value as HTMLElement).innerHTML = ''
        expect(h.fit()).toBe(false)
        expect(transformOf(h)).toBe('')
    })

    it('scales a diagram larger than the viewport down to fit, centred', async () => {
        const h = await mountHarness({ w: 1600, h: 1200 })
        expect(h.fit()).toBe(true)
        const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(transformOf(h))
        expect(m).not.toBeNull()
        const [, x, y, k] = m as RegExpExecArray
        // k = min(784/1600, 584/1200, 1.5) = 0.48666…
        expect(Number(k)).toBeCloseTo(0.4867, 3)
        // x / y centre the scaled 1600 × 1200 box in 800 × 600.
        expect(Number(x)).toBeCloseTo((800 - 1600 * Number(k)) / 2, 1)
        expect(Number(y)).toBeCloseTo((600 - 1200 * Number(k)) / 2, 1)
    })

    it('falls back to clientWidth/clientHeight when the SVG has no size attributes', async () => {
        const h = await mountHarness({ w: 0, h: 0 })
        const svgEl = h.hostRef.value?.querySelector('svg') as SVGElement
        stubLayout(svgEl, 400, 200)
        expect(h.fit()).toBe(true)
        expect(transformOf(h)).toBe('translate(100px, 150px) scale(1.5)')
    })

    it('no-ops when the SVG reports a zero size', async () => {
        const h = await mountHarness()
        const svgEl = h.hostRef.value?.querySelector('svg') as SVGElement
        svgEl.setAttribute('width', '0')
        svgEl.setAttribute('height', '0')
        stubLayout(svgEl, 0, 0)
        expect(h.fit()).toBe(false)
        expect(transformOf(h)).toBe('')
    })

    it('no-ops before the wrap is mounted (first render lands late)', () => {
        const api = usePanZoom({ wrapRef: ref(null), contentRef: ref(null), hostRef: ref(null) })
        expect(api.fit()).toBe(false)
        expect(() => api.zoomIn()).not.toThrow()
        expect(() => api.zoomOut()).not.toThrow()
    })

    it('no-ops when the wrap is mounted but the SVG is not rendered yet', async () => {
        const wrap = document.createElement('div')
        stubLayout(wrap, 800, 600)
        document.body.appendChild(wrap)
        const wrapRef = ref<HTMLElement | null>(null)
        const contentRef = ref<HTMLElement | null>(null)
        const hostRef = ref<HTMLElement | null>(null)
        const api = usePanZoom({ wrapRef, contentRef, hostRef })
        wrapRef.value = wrap
        await nextTick()
        expect(api.fit()).toBe(false)
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
        // fit() enlarges to the FIT_MAX_SCALE cap, so the drag starts
        // from translate(100px, 150px) scale(1.5) — what this is about
        // is the pan delta and the resize clamp, not the scale.
        expect(transformOf(h)).toBe('translate(100px, 150px) scale(1.5)')
        wrap.dispatchEvent(down(wrap, 0, 0, 11))
        wrap.dispatchEvent(move(wrap, 5000, 5000, 11))
        expect(transformOf(h)).toBe('translate(5100px, 5150px) scale(1.5)')
        window.dispatchEvent(new Event('resize'))
        expect(transformOf(h)).toBe('translate(16px, 16px) scale(1.5)')
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

    /*
     * The regression this whole branch exists for. `TeamGraphPage` no
     * longer caps the page at a fixed width, so the graph column (and
     * with it the canvas) can grow from 766 px to ~1516 px on a wide
     * monitor. The old handler only clamped x/y, so a view that was
     * `fit()`'d for the narrow canvas kept the *old* scale and sat in
     * the left half of the new, much wider one. `reflow()` re-fits
     * instead — but only while nobody has taken the view over.
     */
    it('re-fits an untouched view so the diagram grows into a wider canvas', async () => {
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
        h.fit()
        // Width binds: k = min(750/666.75, 604/401, 1.5) = 1.125.
        expect(scaleOf(h)).toBeCloseTo(1.125, 3)

        // The canvas doubles in width (the real 1920-vs-1440 case).
        stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
        window.dispatchEvent(new Event('resize'))

        // Now k = min(1500/666.75, 604/401, 1.5) = 1.5 — the
        // FIT_MAX_SCALE cap, i.e. the enlargement limit, not the old
        // scale. The diagram is visibly bigger, not stranded.
        expect(scaleOf(h)).toBeCloseTo(1.5, 3)
        // …and it is re-centred in the new box, not left at the old x.
        const [, x] = /^translate\((-?[\d.]+)px,/.exec(transformOf(h)) as RegExpExecArray
        expect(Number(x)).toBeCloseTo((1516 - 666.75 * 1.5) / 2, 1)
    })

    it('preserves a scale the operator chose by zooming, across a resize', async () => {
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
        h.fit()
        h.zoomIn() // k = 1.125 * 1.25
        const chosen = scaleOf(h)

        stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
        window.dispatchEvent(new Event('resize'))

        // The operator asked for this scale; a resize must not overrule it.
        expect(scaleOf(h)).toBeCloseTo(chosen, 6)
    })

    it('preserves a pan the operator made, across a resize', async () => {
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 1516, h: 620 })
        h.fit()
        const wrap = h.wrapRef.value as HTMLElement
        wrap.dispatchEvent(down(wrap, 100, 100, 31))
        wrap.dispatchEvent(move(wrap, 160, 100, 31))
        wrap.dispatchEvent(up(wrap))
        const chosen = scaleOf(h)
        expect(chosen).toBeCloseTo(1.5, 3)

        window.dispatchEvent(new Event('resize'))

        expect(scaleOf(h)).toBeCloseTo(chosen, 6)
    })

    it('hands the framing back to the automatic behaviour after an explicit fit()', async () => {
        // fit() is the "reset the view" button and the principal-switch
        // path, so it must clear the manual-override flag — otherwise a
        // stale zoom would suppress re-framing forever.
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
        h.fit()
        h.zoomOut()
        const manual = scaleOf(h)
        expect(manual).toBeCloseTo(0.9, 3)

        stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
        h.fit()
        window.dispatchEvent(new Event('resize'))

        expect(scaleOf(h)).toBeCloseTo(1.5, 3)
    })

    it('is a no-op when the wrap is not mounted or the SVG is not rendered yet', () => {
        const api = usePanZoom({ wrapRef: ref(null), contentRef: ref(null), hostRef: ref(null) })
        expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
        expect(api.fit).toBeTypeOf('function')
    })

    it('detaches every listener on unmount', async () => {
        const wrapper = mount(
            {
                template: '<div ref="wrapRef" data-testid="wrap"><div ref="contentRef" data-testid="content"><div ref="hostRef" data-testid="host"><svg width="400" height="200" /></div></div></div>',
                setup() {
                    const wrapRef = ref<HTMLElement | null>(null)
                    const contentRef = ref<HTMLElement | null>(null)
                    const hostRef = ref<HTMLElement | null>(null)
                    const api = usePanZoom({ wrapRef, contentRef, hostRef })
                    return { wrapRef, contentRef, hostRef, api }
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

/**
 * The canvas can change size without any `resize` event — the host SPA
 * collapsing its own sidebar, a browser zoom, a root font-size change
 * all resize `.tg-canvas-wrap` alone. That is why the wrap is observed
 * directly instead of only listening to the window, and it is the case
 * that actually matters now the graph column is no longer width-capped.
 */
describe('usePanZoom — ResizeObserver on the wrap', () => {
    let stub: ObserverStub

    beforeEach(() => {
        stub = installResizeObserverStub()
    })

    afterEach(() => {
        stub.restore()
    })

    it('observes the wrap as soon as it mounts', async () => {
        const h = await mountHarness()
        expect(stub.targets).toContain(h.wrapRef.value)
    })

    it('re-fits the diagram when the observed wrap grows, with no window resize', async () => {
        /*
         * The exact regression the uncapped layout introduces. No
         * `resize` event is dispatched here — the only signal is the
         * observer — so the pre-fix code (which only listened to
         * `window`) leaves the diagram at the old scale in a canvas
         * twice as wide.
         */
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
        h.fit()
        expect(scaleOf(h)).toBeCloseTo(1.125, 3)

        stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
        for (const cb of stub.callbacks) cb()

        expect(scaleOf(h)).toBeCloseTo(1.5, 3)
        const [, x, y] = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transformOf(h)) as RegExpExecArray
        expect(Number(x)).toBeCloseTo((1516 - 666.75 * 1.5) / 2, 1)
        expect(Number(y)).toBeCloseTo((620 - 401 * 1.5) / 2, 1)
    })

    it('keeps a manually-chosen scale across an observed resize', async () => {
        const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
        h.fit()
        h.zoomIn()
        const chosen = scaleOf(h)

        stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
        for (const cb of stub.callbacks) cb()

        expect(scaleOf(h)).toBeCloseTo(chosen, 6)
    })

    it('re-binds when the wrap is replaced, dropping the old observation', async () => {
        /*
         * `TeamGraphCanvas` keeps the same wrap element for its lifetime,
         * so this is belt-and-braces — but a stale observer on a
         * detached wrap would keep re-framing a canvas nobody is looking
         * at, and a *second* observer would double the work.
         */
        const h = await mountHarness()
        expect(stub.targets).toHaveLength(1)
        const first = h.wrapRef.value

        h.wrapRef.value = null
        await nextTick()
        expect(stub.disconnected).toBe(1)

        h.wrapRef.value = first
        await nextTick()
        expect(stub.targets).toHaveLength(2)
        // The replacement is observed exactly once — no double-binding.
        expect(stub.targets[1]).toBe(first)
    })

    it('disconnects the observer on unmount', async () => {
        const wrapper = mount(
            {
                template: '<div ref="wrapRef" data-testid="wrap"><div ref="contentRef" data-testid="content"><div ref="hostRef" data-testid="host"><svg width="400" height="200" /></div></div></div>',
                setup() {
                    const wrapRef = ref<HTMLElement | null>(null)
                    const contentRef = ref<HTMLElement | null>(null)
                    const hostRef = ref<HTMLElement | null>(null)
                    const api = usePanZoom({ wrapRef, contentRef, hostRef })
                    return { wrapRef, contentRef, hostRef, api }
                },
            },
            { attachTo: document.body },
        )
        await nextTick()
        expect(stub.targets).toHaveLength(1)
        wrapper.unmount()
        // A leaked observer keeps re-framing a torn-down canvas.
        expect(stub.disconnected).toBe(1)
    })

    it('survives an environment with no ResizeObserver at all', async () => {
        // Older/embedded webviews and non-DOM test environments may not
        // expose it; the window `resize` listener is the fallback and
        // the composable must not throw on the way there.
        const original = globalThis.ResizeObserver
        // @ts-expect-error — deliberately removing a global to simulate the absence.
        delete globalThis.ResizeObserver
        try {
            const h = await mountHarness({ w: 666.75, h: 401 }, { w: 766, h: 620 })
            h.fit()
            expect(scaleOf(h)).toBeCloseTo(1.125, 3)
            stubLayout(h.wrapRef.value as HTMLElement, 1516, 620)
            expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
            // The window listener alone still re-frames the diagram.
            expect(scaleOf(h)).toBeCloseTo(1.5, 3)
        } finally {
            globalThis.ResizeObserver = original
        }
    })
})

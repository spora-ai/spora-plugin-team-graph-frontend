/**
 * Pan + zoom driver for the canvas content layer.
 *
 * The SVG Mermaid emits sits inside `<div ref="canvas-content">`
 * which we transform with `translate(x, y) scale(k)`. The viewport
 * `<div ref="canvas-wrap">` catches wheel (zoom around cursor) and
 * pointer events (drag = pan, click = deselect).
 *
 * The trick to make `click` still fire on the underlying SVG node
 * is `setPointerCapture`: the pointer is re-routed to the wrap
 * element, so we have to handle all pointer semantics in
 * `pointerup`. A `moved` flag distinguishes a real drag from a
 * tap-on-empty-canvas (which clears the selection).
 *
 * **`fit()` scales up as well as down.** The SVG is sized from its own
 * content (`viewBox` + matching `width`/`height`, see
 * `composables/useMermaidRender.ts`), so a small graph is a small
 * element and used to sit unscaled in the middle of the canvas. The
 * scale is now whatever makes the diagram fill the viewport on its
 * tighter axis, capped at `FIT_MAX_SCALE` so a two-node graph is not
 * blown up to fill a 700 px canvas.
 *
 * **A viewport change re-fits unless the operator has taken over.**
 * The graph column is no longer capped at a fixed page width, so the
 * canvas can grow by several hundred pixels without any window resize
 * happening at all (the host SPA collapsing its own sidebar, a browser
 * zoom change, a font-size change). A view framed for the *old* box
 * then sits small in a large canvas. So the wrap is observed with a
 * `ResizeObserver` in addition to the `resize` window event, and both
 * funnel into `reflow()`:
 *
 *   - the view is still `fit()`'s own framing → **re-fit** it, so the
 *     diagram grows into the space it now has;
 *   - the operator has panned or zoomed since the last `fit()` → they
 *     framed something deliberately, so keep their scale and only pull
 *     the view back inside the new viewport box.
 *
 * `userAdjusted` is therefore the whole policy in one bit, and it is
 * cleared by every `fit()` — so the principal-switch and Refresh paths
 * hand the framing back to the automatic behaviour for free.
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export interface UsePanZoomOptions {
    wrapRef: Ref<HTMLElement | null>
    contentRef: Ref<HTMLElement | null>
    /**
     * The element Mermaid's diagram SVG is committed into (the
     * `tg-mermaid-host` div). Required rather than searched for: see
     * `readSvgSize` for why an unscoped `querySelector('svg')` on the
     * wrap measures the wrong element.
     */
    hostRef: Ref<HTMLElement | null>
}

export interface UsePanZoomReturn {
    /**
     * Frame the diagram in the viewport. Returns `false` when there was
     * nothing to frame (no diagram SVG committed yet) so the caller can
     * keep its "please fit" request pending instead of consuming it
     * against a no-op.
     */
    fit: () => boolean
    zoomIn: () => void
    zoomOut: () => void
}

interface View {
    x: number
    y: number
    k: number
}

const MIN_SCALE = 0.2
const MAX_SCALE = 3

/**
 * Breathing room `fit()` keeps between the scaled diagram and the
 * viewport edge, in CSS pixels. Mirrored by the resize clamp below.
 */
const FIT_MARGIN = 16

/**
 * How far `fit()` may **enlarge** a diagram.
 *
 * `fit()` has no upper cap of its own any more: a graph whose natural
 * size is smaller than the viewport used to be pinned at `scale(1)`,
 * which left a small diagram marooned in the middle of a large empty
 * canvas (measured on the 4-node dev fixture: a 666 × 401 diagram in
 * a 764 × 620 viewport stayed at 100 % and wasted 219 px of height).
 * Letting `fit()` scale up fills the space, but a two-node graph is
 * only 280 × 116 px and would balloon to ~2.7×, so the enlargement is
 * capped here instead. `MIN_SCALE` / `MAX_SCALE` are deliberately not
 * applied to the lower end: fitting a 100-node principal *has* to go
 * below 0.2, and clamping it there would stop `fit()` from fitting.
 */
const FIT_MAX_SCALE = 1.5

export function usePanZoom({ wrapRef, contentRef, hostRef }: UsePanZoomOptions): UsePanZoomReturn {
    const view = ref<View>({ x: 0, y: 0, k: 1 })
    const panning = ref<{
        startX: number
        startY: number
        origX: number
        origY: number
        moved: boolean
        pointerId: number
    } | null>(null)
    /*
     * Has the operator taken manual control of the view since the last
     * `fit()`? Set by a pan drag and by any zoom, cleared by `fit()`.
     * `reflow()` reads it to decide between re-framing and preserving
     * — see the module header for why the distinction is needed at all.
     */
    let userAdjusted = false

    /**
     * Observer on the wrap, created once the wrap is mounted and torn
     * down on unmount / re-mount. A local rather than a ref: nothing
     * renders from it, and `disconnect()` is the only thing that has
     * to see it.
     */
    let observer: ResizeObserver | null = null

    function applyView(): void {
        const content = contentRef.value
        if (content === null) return
        content.style.transform = `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.k})`
    }

    /**
     * The diagram's own intrinsic size, in content-layer pixels.
     *
     * Scoped to the Mermaid host on purpose. An unscoped
     * `wrap.querySelector('svg')` returns the **first** `<svg>` in
     * document order, and the wrap's own zoom toolbar renders three
     * `Icon` components — each one a `<svg class="spora-icon">`, in the
     * DOM long before Mermaid commits the diagram. Instrumented on the
     * dev server: `fit()` ran at t = 61 ms with the Mermaid host still
     * empty, read the "zoom out" icon (no `width` attribute, so it fell
     * through to `clientWidth` = 12) and computed a transform for a
     * 12 × 12 "diagram" — `translate(376px, 304px) scale(1)` at the
     * time, throwing the real 667 × 401 graph off the bottom-right of
     * the canvas. Which of the two `<svg>`s wins is a race against
     * Mermaid's async render, so the mis-measurement is intermittent
     * rather than constant — but it is reachable, and requiring the host
     * ref makes it unrepresentable.
     *
     * Returning `null` until the diagram exists is the other half of
     * the fix: it lets the caller's pending fit survive to the render
     * that can actually satisfy it (see `TeamGraphCanvas.vue →
     * consumeFit`).
     */
    function readSvgSize(): { w: number; h: number } | null {
        const host = hostRef.value
        if (host === null) return null
        const svgEl = host.querySelector('svg')
        if (svgEl === null) return null
        const w = Number(svgEl.getAttribute('width')) || svgEl.clientWidth
        const h = Number(svgEl.getAttribute('height')) || svgEl.clientHeight
        if (!w || !h) return null
        return { w, h }
    }

    function fit(): boolean {
        const wrap = wrapRef.value
        const size = readSvgSize()
        if (wrap === null || size === null) return false
        // An explicit fit is the view handing control back to us.
        userAdjusted = false
        const vw = wrap.clientWidth
        const vh = wrap.clientHeight
        /*
         * Both axes are constrained, so a graph that is wider than it
         * is tall lands on the horizontal limit and is centred
         * vertically (and vice versa) — the diagram always fits, and
         * the axis it does not fill just gets symmetric slack. Capped
         * at FIT_MAX_SCALE so a small diagram is enlarged to fill the
         * canvas without being blown up out of proportion.
         */
        const k = Math.min((vw - FIT_MARGIN) / size.w, (vh - FIT_MARGIN) / size.h, FIT_MAX_SCALE)
        view.value = {
            k,
            x: (vw - size.w * k) / 2,
            y: (vh - size.h * k) / 2,
        }
        applyView()
        return true
    }

    function zoomBy(factor: number, cx: number, cy: number): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.value.k * factor))
        if (next === view.value.k) return
        // A button / wheel zoom is the operator choosing a scale, so the
        // automatic re-fit must not undo it on the next resize.
        userAdjusted = true
        view.value = {
            x: cx - (cx - view.value.x) * (next / view.value.k),
            y: cy - (cy - view.value.y) * (next / view.value.k),
            k: next,
        }
        applyView()
    }

    function zoomIn(): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        const r = wrap.getBoundingClientRect()
        zoomBy(1.25, r.width / 2, r.height / 2)
    }

    function zoomOut(): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        const r = wrap.getBoundingClientRect()
        zoomBy(1 / 1.25, r.width / 2, r.height / 2)
    }

    function onPointerDown(ev: PointerEvent): void {
        if (ev.button !== 0) return
        const wrap = wrapRef.value
        if (wrap === null) return
        const target = ev.target
        if (target instanceof Element) {
            /* Skip panning when the user is interacting with the chrome:
             *  - `g.node` is a Mermaid card (its own click handler does
             *    selection via stopPropagation),
             *  - `button` is the zoom / fit toolbar,
             *  - `[data-tg-no-pan]` is the opt-out marker for any future
             *    overlay.
             * Without this guard the wrap's `setPointerCapture` holds
             * the pointer so the button never receives its `click`
             * event. */
            if (target.closest('g.node, button, [data-tg-no-pan]') !== null) return
        }
        panning.value = {
            startX: ev.clientX,
            startY: ev.clientY,
            origX: view.value.x,
            origY: view.value.y,
            moved: false,
            pointerId: ev.pointerId,
        }
        wrap.classList.add('panning')
        try {
            wrap.setPointerCapture(ev.pointerId)
        } catch {
            // some browsers refuse setPointerCapture on the wrap; the
            // pointermove listener still fires so the gesture works.
        }
    }

    function onPointerMove(ev: PointerEvent): void {
        const p = panning.value
        if (p === null) return
        p.moved = true
        userAdjusted = true
        view.value = {
            ...view.value,
            x: p.origX + (ev.clientX - p.startX),
            y: p.origY + (ev.clientY - p.startY),
        }
        applyView()
    }

    function onPointerUp(_ev: PointerEvent): void {
        const wrap = wrapRef.value
        const p = panning.value
        if (p === null) return
        wrap?.classList.remove('panning')
        if (!p.moved) {
            wrap?.dispatchEvent(new CustomEvent('tg-canvas-tap'))
        }
        panning.value = null
        if (wrap !== null && wrap.hasPointerCapture?.(p.pointerId)) {
            try {
                wrap.releasePointerCapture(p.pointerId)
            } catch {
                // release may fail if the pointer was already released by the browser
            }
        }
    }

    function onWheel(ev: WheelEvent): void {
        ev.preventDefault()
        const wrap = wrapRef.value
        if (wrap === null) return
        const r = wrap.getBoundingClientRect()
        const cx = ev.clientX - r.left
        const cy = ev.clientY - r.top
        const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
        zoomBy(factor, cx, cy)
    }

    function attach(): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        wrap.addEventListener('pointerdown', onPointerDown)
        wrap.addEventListener('pointermove', onPointerMove)
        wrap.addEventListener('pointerup', onPointerUp)
        wrap.addEventListener('pointercancel', onPointerUp)
        wrap.addEventListener('wheel', onWheel, { passive: false })
    }

    function detach(): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        wrap.removeEventListener('pointerdown', onPointerDown)
        wrap.removeEventListener('pointermove', onPointerMove)
        wrap.removeEventListener('pointerup', onPointerUp)
        wrap.removeEventListener('pointercancel', onPointerUp)
        wrap.removeEventListener('wheel', onWheel)
    }

    /**
     * Pull a manually-framed view back inside the *current* viewport.
     *
     * The original resize behaviour, kept verbatim for the case where
     * the operator owns the view: the scale is untouched, and x / y are
     * clamped so the diagram can never be dragged entirely off-canvas.
     */
    function clampIntoViewport(): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        const size = readSvgSize()
        if (size === null) return
        const vw = wrap.clientWidth
        const vh = wrap.clientHeight
        const minX = vw - size.w * view.value.k - FIT_MARGIN
        const minY = vh - size.h * view.value.k - FIT_MARGIN
        const nextX = Math.min(FIT_MARGIN, Math.max(minX, view.value.x))
        const nextY = Math.min(FIT_MARGIN, Math.max(minY, view.value.y))
        view.value = { ...view.value, x: nextX, y: nextY }
        applyView()
    }

    /**
     * The canvas box changed shape (viewport resize, host sidebar
     * collapse, browser zoom) — re-frame the diagram against the new
     * box.
     *
     * Two branches, because the two cases want opposite things:
     *
     *   - **Nobody has touched the view** since the last `fit()`. Its
     *     scale was computed for a canvas that no longer exists, so
     *     `fit()` again — this is what makes a graph whose canvas grew
     *     from 766 px to 1516 px wide actually fill the space instead
     *     of sitting at the old scale. `fit()` no-ops (returns
     *     `false`) while no diagram is committed, so there is nothing
     *     to re-frame and nothing to preserve.
     *   - **The operator has panned or zoomed.** They framed something
     *     deliberately; keep the scale and only stop the view from
     *     escaping the new viewport.
     */
    function reflow(): void {
        if (wrapRef.value === null) return
        if (!userAdjusted && fit()) return
        clampIntoViewport()
    }

    /**
     * Observe the wrap's own box, not just the window.
     *
     * The graph column is no longer capped at a fixed page width, so
     * the canvas can change size with **no** `resize` event: the host
     * SPA collapsing its own sidebar, a browser zoom, or a root
     * font-size change all resize this element alone. Listening to the
     * element is the only way to see them, and the `resize` event still
     * fires alongside it — `reflow()` is idempotent, so the overlap is
     * harmless.
     *
     * Observing the element also means the first `ResizeObserver`
     * callback (fired on `observe()` with the element's current box)
     * frames the diagram as soon as the wrap is measurable, which is
     * exactly when it should be.
     */
    function observeWrap(): void {
        const wrap = wrapRef.value
        if (wrap === null || typeof ResizeObserver === 'undefined') return
        observer = new ResizeObserver(() => {
            reflow()
        })
        observer.observe(wrap)
    }

    function unobserveWrap(): void {
        if (observer === null) return
        observer.disconnect()
        observer = null
    }

    watch(wrapRef, (next) => {
        unobserveWrap()
        if (next === null) return
        attach()
        observeWrap()
    })
    window.addEventListener('resize', reflow)

    onBeforeUnmount(() => {
        detach()
        unobserveWrap()
        window.removeEventListener('resize', reflow)
    })

    return { fit, zoomIn, zoomOut }
}
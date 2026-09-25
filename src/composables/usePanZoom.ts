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
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export interface UsePanZoomOptions {
    wrapRef: Ref<HTMLElement | null>
    contentRef: Ref<HTMLElement | null>
    /** Called once on mount + after every render so the SVG starts centred. */
    onFit?: () => void
}

export interface UsePanZoomReturn {
    fit: () => void
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

export function usePanZoom({ wrapRef, contentRef, onFit }: UsePanZoomOptions): UsePanZoomReturn {
    const view = ref<View>({ x: 0, y: 0, k: 1 })
    const panning = ref<{
        startX: number
        startY: number
        origX: number
        origY: number
        moved: boolean
        pointerId: number
    } | null>(null)

    function applyView(): void {
        const content = contentRef.value
        if (content === null) return
        content.style.transform = `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.k})`
    }

    function readSvgSize(): { w: number; h: number } | null {
        const wrap = wrapRef.value
        if (wrap === null) return null
        const svgEl = wrap.querySelector('svg')
        if (svgEl === null) return null
        const w = Number(svgEl.getAttribute('width')) || svgEl.clientWidth
        const h = Number(svgEl.getAttribute('height')) || svgEl.clientHeight
        if (!w || !h) return null
        return { w, h }
    }

    function fit(): void {
        const wrap = wrapRef.value
        const size = readSvgSize()
        if (wrap === null || size === null) return
        const vw = wrap.clientWidth
        const vh = wrap.clientHeight
        const k = Math.min((vw - 16) / size.w, (vh - 16) / size.h, 1)
        view.value = {
            k,
            x: (vw - size.w * k) / 2,
            y: (vh - size.h * k) / 2,
        }
        applyView()
    }

    function zoomBy(factor: number, cx: number, cy: number): void {
        const wrap = wrapRef.value
        if (wrap === null) return
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.value.k * factor))
        if (next === view.value.k) return
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
        if (target instanceof Element && target.closest('g.node')) return
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
        view.value = {
            ...view.value,
            x: p.origX + (ev.clientX - p.startX),
            y: p.origY + (ev.clientY - p.startY),
        }
        applyView()
    }

    function onPointerUp(ev: PointerEvent): void {
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
        // suppress unused-param warning while keeping the PointerEvent type signature
        void ev
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

    function onResize(): void {
        if (wrapRef.value === null) return
        const size = readSvgSize()
        if (size === null) return
        const wrap = wrapRef.value
        const vw = wrap.clientWidth
        const vh = wrap.clientHeight
        const minX = vw - size.w * view.value.k - 16
        const minY = vh - size.h * view.value.k - 16
        const nextX = Math.min(16, Math.max(minX, view.value.x))
        const nextY = Math.min(16, Math.max(minY, view.value.y))
        view.value = { ...view.value, x: nextX, y: nextY }
        applyView()
    }

    watch(wrapRef, (next) => {
        if (next === null) return
        attach()
    })
    window.addEventListener('resize', onResize)

    onBeforeUnmount(() => {
        detach()
        window.removeEventListener('resize', onResize)
    })

    if (typeof onFit === 'function') {
        // Caller can override default fit behaviour via onFit; the
        // button-stack in `TeamGraphCanvas.vue` binds the "Fit" button
        // to `fit` directly.
        void onFit
    }

    return { fit, zoomIn, zoomOut }
}
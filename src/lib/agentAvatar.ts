/**
 * `agentAvatarHtml` — inline the dashboard's `Avatar.vue` into a
 * plain HTML string.
 *
 * Mermaid's HTML label (the foreignObject content) cannot host Vue
 * components, so the canvas node can't import and mount the host's
 * `<Avatar>` directly. Instead, we re-implement Avatar's three
 * branches (image / archetype / initials fallback) as plain string
 * emission. The string is what Mermaid renders inside the
 * foreignObject; CSS in `style.css` styles each branch.
 *
 * **Plugin mirror.** This mirrors `spora-frontend/src/components/ui/
 * Avatar.vue` + `ArchetypeIcon.vue`. Plugins can't import host source
 * files (`publishPluginGlobals` only exposes Vue / Pinia / VueRouter
 * / VueDraggablePlus / MdEditorV3), so the plugin bundles a
 * private copy. The archetype SVG primitives come from
 * `./archetypeSvgs` (also mirrored).
 *
 * The visual output matches the dashboard Avatar:
 *   - `kind === 'image'` → rounded `<img>` from the media archive
 *   - `kind === 'avatar'` → palette-coloured tile with the
 *     archetype's SVG primitives on top
 *   - otherwise → uppercase initials in a slate-muted tile
 *
 * Cache-busting on the image URL matches the host:
 * `image_updated_at` is appended as a query string so a re-upload
 * re-fetches instead of serving the browser cache.
 */

import { archetypeElements } from './archetypeSvgs'
import type { ProfilePicture } from '../types'

const SAFE_HEX = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?:[0-9A-Fa-f]{2})?$/

/**
 * Render the agent's profile picture as an inline HTML string suitable
 * for embedding inside Mermaid's `<foreignObject>` label.
 *
 * Returns a `<span class="tg-node-avatar">` that matches the host
 * Avatar's `sm` size (h-8 w-8) so it sits cleanly inside the
 * compact two-row node layout.
 */
export function agentAvatarHtml(pp: ProfilePicture | null | undefined, initials: string): string {
    const safeInitials = escapeHtml(initials)
    const dataTestid = 'data-testid="tg-node-avatar"'

    // Image branch — uploaded picture from the media archive.
    if (pp?.kind === 'image' && typeof pp.image_url === 'string' && pp.image_url !== '') {
        const cb = pp.image_updated_at ?? ''
        const sep = pp.image_url.includes('?') ? '&' : '?'
        const src = cb === '' ? pp.image_url : `${pp.image_url}${sep}v=${encodeURIComponent(cb)}`
        return (
            `<span class="tg-node-avatar tg-node-avatar--image" ${dataTestid}>` +
            `<img src="${escapeAttr(src)}" alt="${escapeAttr(safeInitials)}" loading="lazy" ` +
            `data-image-updated-at="${escapeAttr(cb)}" />` +
            `</span>`
        )
    }

    // Avatar branch — operator-picked archetype with a palette colour.
    if (
        pp?.kind === 'avatar'
        && pp.archetype !== null
        && pp.variant_key !== null
        && typeof pp.bg_color === 'string'
        && SAFE_HEX.test(pp.bg_color)
        && typeof pp.fg_color === 'string'
        && SAFE_HEX.test(pp.fg_color)
    ) {
        const elements = archetypeElements(pp.archetype, pp.variant_key)
        const inner = elements.map(el => primitiveToHtml(el)).join('')
        // Same gradient pattern as the host Avatar:
        //   linear-gradient(135deg, color-mix(bg 60%, white), bg)
        const bg = pp.bg_color
        const fg = pp.fg_color
        const style = `background-color: ${bg}; background-image: linear-gradient(135deg, color-mix(in srgb, ${bg} 60%, white), ${bg}); color: ${fg};`
        return (
            `<span class="tg-node-avatar tg-node-avatar--archetype" ${dataTestid} style="${style}">` +
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>` +
            `</span>`
        )
    }

    // Initials fallback — no profile picture row.
    return (
        `<span class="tg-node-avatar tg-node-avatar--initials" ${dataTestid}>` +
        safeInitials +
        `</span>`
    )
}

/**
 * Render one archetype primitive (`path`, `circle`, `rect`, `line`,
 * `polyline`, `polygon`) as a self-closing SVG element string. The
 * default fill/stroke comes from the host archetype map's
 * `fill = 'currentColor'`, `stroke = 'currentColor'` constants; the
 * outer `<span>` sets `color: <fg>` so the icon picks up the right
 * shade via `currentColor`.
 */
function primitiveToHtml(el: ReturnType<typeof archetypeElements>[number]): string {
    switch (el.tag) {
        case 'path': {
            const fill = el.fill ?? 'none'
            const stroke = el.stroke ?? 'currentColor'
            const opacityAttr = el.opacity !== undefined ? ` opacity="${escapeAttr(el.opacity)}"` : ''
            return `<path d="${escapeAttr(el.d)}" fill="${fill}" stroke="${stroke}"${opacityAttr}/>`
        }
        case 'circle': {
            const fill = el.fill ?? 'none'
            const stroke = el.stroke ?? 'currentColor'
            const opacityAttr = el.opacity !== undefined ? ` opacity="${escapeAttr(el.opacity)}"` : ''
            return `<circle cx="${escapeAttr(el.cx)}" cy="${escapeAttr(el.cy)}" r="${escapeAttr(el.r)}" fill="${fill}" stroke="${stroke}"${opacityAttr}/>`
        }
        case 'rect': {
            const fill = el.fill ?? 'none'
            const stroke = el.stroke ?? 'currentColor'
            const rxAttr = el.rx !== undefined ? ` rx="${escapeAttr(el.rx)}"` : ''
            return `<rect x="${escapeAttr(el.x)}" y="${escapeAttr(el.y)}" width="${escapeAttr(el.width)}" height="${escapeAttr(el.height)}"${rxAttr} fill="${fill}" stroke="${stroke}"/>`
        }
        case 'line': {
            const stroke = el.stroke ?? 'currentColor'
            return `<line x1="${escapeAttr(el.x1)}" y1="${escapeAttr(el.y1)}" x2="${escapeAttr(el.x2)}" y2="${escapeAttr(el.y2)}" stroke="${stroke}"/>`
        }
        case 'polyline': {
            const fill = el.fill ?? 'none'
            const stroke = el.stroke ?? 'currentColor'
            return `<polyline points="${escapeAttr(el.points)}" fill="${fill}" stroke="${stroke}"/>`
        }
        case 'polygon': {
            const fill = el.fill ?? 'none'
            const stroke = el.stroke ?? 'currentColor'
            return `<polygon points="${escapeAttr(el.points)}" fill="${fill}" stroke="${stroke}"/>`
        }
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
        switch (c) {
            case '&': return '&amp;'
            case '<': return '&lt;'
            case '>': return '&gt;'
            case '"': return '&quot;'
            case "'": return '&#39;'
            default: return c
        }
    })
}

function escapeAttr(s: unknown): string {
    if (typeof s !== 'string') return ''
    return escapeHtml(s)
}

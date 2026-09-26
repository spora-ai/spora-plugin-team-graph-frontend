import { describe, it, expect } from 'vitest'
import { agentAvatarHtml } from '../../src/lib/agentAvatar'
import { archetypeElements } from '../../src/lib/archetypeSvgs'
import type { ProfilePicture } from '../../src/types'

/**
 * `agentAvatarHtml` — inline mirror of the host's `Avatar.vue`.
 *
 * Three branches:
 *   1. `kind === 'image'`  → rounded `<img>` from `image_url`,
 *                              with `image_updated_at` cache-buster.
 *   2. `kind === 'avatar'` → palette-tile + archetype SVG primitives
 *                              (mirrors the host's gradient + fill).
 *   3. otherwise           → uppercase initials in a slate-muted tile.
 *
 * The canvas-rendering constraint is that Mermaid's `<foreignObject>`
 * content can't host Vue components — `agentAvatarHtml` returns a
 * plain HTML string that goes straight into Mermaid's label syntax.
 */

function imagePp(over: Partial<ProfilePicture> = {}): ProfilePicture {
    return {
        kind: 'image',
        archetype: null,
        variant_key: null,
        palette_key: null,
        bg_color: null,
        fg_color: null,
        image_url: '/api/v1/assets/test.jpg',
        image_updated_at: '2026-09-26T10:00:00+00:00',
        ...over,
    }
}

function avatarPp(over: Partial<ProfilePicture> = {}): ProfilePicture {
    return {
        kind: 'avatar',
        archetype: 'assistant',
        variant_key: 'v0',
        palette_key: 'indigo',
        bg_color: '#4338CA',
        fg_color: '#EEF2FF',
        image_url: null,
        image_updated_at: null,
        ...over,
    }
}

describe('agentAvatarHtml', () => {
    describe('initials fallback', () => {
        it('renders uppercase initials in a slate-muted tile when no profile_picture', () => {
            const html = agentAvatarHtml(null, 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
            expect(html).toContain('>TA</span>')
            // No image, no SVG primitives
            expect(html).not.toContain('<img')
            expect(html).not.toContain('<svg')
        })

        it('renders the caller-supplied initials verbatim (up to 2 chars)', () => {
            // The caller pre-computes initials from the agent name
            // (mirroring the host Avatar.vue contract: `initials: string`
            // is a prop, not derived inside the component). agentAvatarHtml
            // just renders what it's given.
            expect(agentAvatarHtml(null, 'SC').slice(-30)).toContain('>SC</span>')
            expect(agentAvatarHtml(null, 'MI').slice(-30)).toContain('>MI</span>')
            expect(agentAvatarHtml(null, 'B').slice(-20)).toContain('>B</span>')
        })

        it('escapes HTML in the initials string', () => {
            // Defence: a malformed initials string (e.g. an upstream
            // bug that lets raw HTML through) must never render as
            // HTML in the canvas.
            const html = agentAvatarHtml(null, '<script>alert("xss")</script>')
            expect(html).toContain('&lt;script&gt;')
            expect(html).not.toContain('<script>alert')
        })

        it('renders the avatar branch when archetype is missing', () => {
            const html = agentAvatarHtml(avatarPp({ archetype: null }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })

        it('renders the initials branch when bg_color is missing', () => {
            const html = agentAvatarHtml(avatarPp({ bg_color: null }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })

        it('rejects hex strings that fail the safe-hex regex (CSS-injection defence)', () => {
            // backdoor attempt: an attacker hand-patches agent_pictures
            // with a CSS string. The validator must reject it and fall
            // back to initials so the canvas never renders a foreign
            // stylesheet.
            const html = agentAvatarHtml(avatarPp({ bg_color: 'red; background: url(javascript:1)' }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })
    })

    describe('image branch', () => {
        it('renders an <img> with cache-buster when image_url is set', () => {
            const html = agentAvatarHtml(imagePp(), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--image"')
            expect(html).toContain('<img')
            expect(html).toContain('src="/api/v1/assets/test.jpg?v=2026-09-26T10%3A00%3A00%2B00%3A00"')
            expect(html).toContain('data-image-updated-at="2026-09-26T10:00:00+00:00"')
            expect(html).toContain('alt="TA"')
            expect(html).toContain('loading="lazy"')
        })

        it('omits the cache-buster query string when image_updated_at is null', () => {
            const html = agentAvatarHtml(imagePp({ image_updated_at: null }), 'TA')
            expect(html).toContain('src="/api/v1/assets/test.jpg"')
            expect(html).not.toContain('?v=')
        })

        it('preserves an existing query string on the image URL', () => {
            // The `&` between `x=1` and `v=…` is HTML-escaped to
            // `&amp;` for safe attribute emission; the browser will
            // decode it back when parsing the src attribute.
            const html = agentAvatarHtml(imagePp({ image_url: '/a/b.jpg?x=1' }), 'TA')
            expect(html).toContain('src="/a/b.jpg?x=1&amp;v=')
        })

        it('falls back to initials when image_url is empty', () => {
            const html = agentAvatarHtml(imagePp({ image_url: '' }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })

        it('falls back to initials when kind is image but image_url is null', () => {
            const html = agentAvatarHtml(imagePp({ image_url: null }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })
    })

    describe('avatar / archetype branch', () => {
        it('emits the palette gradient + archetype SVG primitives', () => {
            const html = agentAvatarHtml(avatarPp(), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--archetype"')
            expect(html).toContain('background-color: #4338CA')
            expect(html).toContain('color-mix(in srgb, #4338CA 60%, white)')
            expect(html).toContain('color: #EEF2FF')
            // Assistant v0 = a circle (head) + a path (shoulders).
            const elements = archetypeElements('assistant', 'v0')
            for (const el of elements) {
                if (el.tag === 'circle') {
                    expect(html).toContain(`<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}"`)
                }
                if (el.tag === 'path') {
                    expect(html).toContain(`<path d="${el.d}"`)
                }
            }
        })

        it('renders different primitives for different archetype/variant combos', () => {
            const html = agentAvatarHtml(avatarPp({ archetype: 'researcher', variant_key: 'v0' }), 'R')
            // Researcher v0 = magnifying glass.
            expect(html).toContain('cx="11" cy="11" r="5.5"')  // lens
            expect(html).toContain('x1="15" y1="15"')  // handle
        })

        it('uses the same SVG attributes the host Avatar uses (stroke=currentColor, viewBox=0 0 24 24)', () => {
            const html = agentAvatarHtml(avatarPp(), 'T')
            expect(html).toContain('viewBox="0 0 24 24"')
            expect(html).toContain('fill="none"')
            expect(html).toContain('stroke="currentColor"')
            expect(html).toContain('stroke-width="1.6"')
        })

        it('falls back to initials when archetype is missing on an avatar-kind row', () => {
            const html = agentAvatarHtml(avatarPp({ archetype: null }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })

        it('falls back to initials when variant_key is missing on an avatar-kind row', () => {
            const html = agentAvatarHtml(avatarPp({ variant_key: null }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--initials"')
        })

        it('falls back to assistant/v0 when archetype/variant keys are unknown', () => {
            // Drift resilience — the host Avatar does the same fallback.
            const html = agentAvatarHtml(avatarPp({ archetype: 'mauve-from-old-version' }), 'TA')
            expect(html).toContain('class="tg-node-avatar tg-node-avatar--archetype"')
            // assistant v0 = the head-and-shoulders primitive
            expect(html).toContain('cx="12" cy="8" r="3.5"')
        })
    })
})

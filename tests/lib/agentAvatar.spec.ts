import { describe, it, expect } from 'vitest'
import { STATUS_PALETTE } from '@spora-ai/components/avatar'
import { avatarSubject, statusRingColor, toProfilePicture } from '../../src/lib/agentAvatar'
import { statusColor } from '../../src/lib/nodeStatus'
import type { GraphNode } from '../../src/types'

/**
 * `lib/agentAvatar.ts` — the plugin-side mapping between the
 * team-graph wire shape and the shared `@spora-ai/components` avatar
 * primitives.
 *
 * The package owns its own component tests; what is pinned here is
 * the plugin's half of the contract:
 *
 *  - the snake_case `profile_picture` is widened to the package's
 *    `ProfilePicture`, and refused outright when the `kind`
 *    discriminant is missing;
 *  - `statusRingColor` prefers the package's `STATUS_PALETTE` and
 *    falls back to the plugin's own `statusColor()` for the five
 *    statuses the palette does not carry.
 */

/** The statuses the team-graph endpoint can actually emit. */
const PACKAGED = ['RUNNING', 'AWAITING_SUB_AGENTS', 'PENDING_APPROVAL', 'COMPLETED'] as const
/**
 * The five statuses in the 11-value `AgentStatus` union that the
 * package's palette does NOT carry — the ones that would collapse
 * onto the neutral `COMPLETED` entry without a local fallback.
 */
const UNPACKAGED = [
    'AWAITING_INPUT',
    'AWAITING_FINAL_APPROVAL',
    'APPROVED',
    'CANCELLED',
    'QUEUED',
] as const
/** `STATUS_PALETTE` entries the endpoint does not emit but the union allows. */
const PACKAGED_NOT_YET_EMITTED = ['FAILED', 'ABORTED'] as const

function node(picture: GraphNode['profile_picture']): GraphNode {
    return {
        id: 1,
        name: 'Blake',
        role: null,
        picture_url: null,
        status: 'RUNNING',
        active_chats: 0,
        recent_chats_24h: 0,
        profile_picture: picture,
    }
}

describe('toProfilePicture', () => {
    it('passes a complete avatar picture through to the package shape', () => {
        const picture = toProfilePicture(
            node({
                palette_key: 'indigo',
                bg_color: '#4338CA',
                fg_color: '#EEF2FF',
                kind: 'avatar',
                archetype: 'assistant',
                variant_key: 'v1',
                image_url: null,
                image_updated_at: null,
            }),
        )
        expect(picture).toEqual({
            kind: 'avatar',
            archetype: 'assistant',
            variant_key: 'v1',
            palette_key: 'indigo',
            bg_color: '#4338CA',
            fg_color: '#EEF2FF',
            image_url: null,
            image_updated_at: null,
        })
    })

    it('keeps the image branch intact', () => {
        const picture = toProfilePicture(
            node({
                palette_key: '',
                bg_color: '',
                fg_color: '',
                kind: 'image',
                archetype: null,
                variant_key: null,
                image_url: 'https://cdn.example/a.png',
                image_updated_at: '2026-09-28T09:00:00Z',
            }),
        )
        expect(picture?.kind).toBe('image')
        expect(picture?.image_url).toBe('https://cdn.example/a.png')
    })

    it('refuses a picture with no `kind` discriminant', () => {
        // `Avatar` branches on `kind`; handing it an unlabelled object
        // would silently degrade to initials while looking configured.
        expect(toProfilePicture(node({ palette_key: 'indigo', bg_color: '#4338CA', fg_color: '#EEF2FF' }))).toBeNull()
    })

    it('refuses an unknown `kind` (schema drift)', () => {
        expect(
            toProfilePicture(
                node({
                    palette_key: 'indigo',
                    bg_color: '#4338CA',
                    fg_color: '#EEF2FF',
                    // A backend that adds a third branch must not make
                    // the panel throw.
                    kind: 'hologram' as unknown as 'avatar',
                }),
            ),
        ).toBeNull()
    })

    it('refuses a missing node', () => {
        expect(toProfilePicture(undefined)).toBeNull()
    })
})

describe('avatarSubject', () => {
    it('forwards the node name and the mapped picture', () => {
        const subject = avatarSubject(
            node({
                palette_key: 'teal',
                bg_color: '#0F766E',
                fg_color: '#F0FDFA',
                kind: 'avatar',
                archetype: 'analyst',
                variant_key: 'v0',
            }),
        )
        expect(subject.name).toBe('Blake')
        expect(subject.profile_picture?.archetype).toBe('analyst')
    })

    it('sends name: null for a dangling edge so useInitials yields "?"', () => {
        // This is the fallback the deleted `initialsFor()` helper
        // produced for an edge whose far end is not in the payload.
        const subject = avatarSubject(undefined)
        expect(subject.name).toBeNull()
        expect(subject.profile_picture).toBeNull()
    })
})

describe('statusRingColor', () => {
    it('returns the package ring colour verbatim for a covered status', () => {
        for (const status of [...PACKAGED, ...PACKAGED_NOT_YET_EMITTED]) {
            expect(statusRingColor(status)).toBe(STATUS_PALETTE[status].ringColor)
        }
    })

    it('tints the plugin colour for every status the palette lacks', () => {
        // These are the statuses `statusDisplay()` would collapse onto
        // the neutral `COMPLETED` entry. Pinning them all is the
        // regression guard for the whole point of the fallback.
        const neutral = STATUS_PALETTE.COMPLETED.ringColor
        for (const status of UNPACKAGED) {
            const ring = statusRingColor(status)
            expect(ring).not.toBe(neutral)
            expect(ring).toBe(`color-mix(in srgb, ${statusColor(status)} 60%, white)`)
        }
    })

    it('covers exactly the statuses the palette is missing', () => {
        // Guards the drift risk: if the package adds one of the five,
        // this fails and the local tint is no longer needed.
        const all = [...PACKAGED, ...PACKAGED_NOT_YET_EMITTED, ...UNPACKAGED]
        expect(all.filter((status) => !Object.hasOwn(STATUS_PALETTE, status))).toEqual([
            ...UNPACKAGED,
        ])
        // …and the two lists together are the whole `AgentStatus` union.
        expect(all).toHaveLength(11)
    })

    it('falls back to a tint for an unknown status string', () => {
        const ring = statusRingColor('SOMETHING_NEW')
        expect(ring).toBe(`color-mix(in srgb, ${statusColor('SOMETHING_NEW')} 60%, white)`)
    })

    it('does not let an inherited Object key read as a palette entry', () => {
        // `WireStatus` admits any string, so a status literally named
        // "toString" must not resolve to a function via the prototype.
        const ring = statusRingColor('toString')
        expect(ring).toBe(`color-mix(in srgb, ${statusColor('toString')} 60%, white)`)
    })

    it('resolves a nullish status to the packaged COMPLETED swatch', () => {
        expect(statusRingColor(null)).toBe(STATUS_PALETTE.COMPLETED.ringColor)
        expect(statusRingColor(undefined)).toBe(STATUS_PALETTE.COMPLETED.ringColor)
    })

    it('treats a missing argument and an explicit null the same, via the default parameter', () => {
        /*
         * `statusRingColor` takes a default parameter for `undefined`
         * and folds `null` in the body — a default parameter does NOT
         * fire for `null`, and the wire sends `null` for "no
         * in-flight task". Both must reach the *packaged* COMPLETED
         * swatch, not the unpackaged `color-mix` tint that the `null`
         * would otherwise fall through to.
         */
        const neutral = STATUS_PALETTE.COMPLETED.ringColor
        const explicit = statusRingColor('COMPLETED')
        expect(statusRingColor()).toBe(neutral)
        expect(statusRingColor(undefined)).toBe(neutral)
        expect(statusRingColor(null)).toBe(neutral)
        // …and all four agree, i.e. no arm leaks to the tint fallback.
        for (const ring of [explicit, statusRingColor(), statusRingColor(undefined), statusRingColor(null)]) {
            expect(ring).toBe(neutral)
            expect(ring).not.toContain('color-mix')
        }
    })
})

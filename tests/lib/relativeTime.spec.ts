import { describe, it, expect, beforeEach } from 'vitest'
import { formatRelativeTime } from '../../src/lib/relativeTime'
import { createPluginI18n } from '../../src/i18n'

/**
 * Relative time, in the interface's language.
 *
 * The shared `@spora-ai/components` package exports an English-only
 * `formatRelativeTime`, so the plugin keeps a local copy that reads
 * the locale off the i18n instance: the compact English form the
 * dashboard has always shipped for `en`, and `Intl.RelativeTimeFormat`
 * for every other language.
 */
const NOW = Date.parse('2026-09-28T12:00:00Z')

/** An ISO timestamp `offsetMs` before `NOW`. */
function at(offsetMs: number): string {
    return new Date(NOW - offsetMs).toISOString()
}

/** An ISO timestamp `offsetMs` after `NOW`. */
function after(offsetMs: number): string {
    return new Date(NOW + offsetMs).toISOString()
}

describe('formatRelativeTime', () => {
    beforeEach(() => {
        createPluginI18n('en')
    })

    it('renders the compact English form', () => {
        expect(formatRelativeTime(at(5 * 60_000), NOW)).toBe('5m ago')
        expect(formatRelativeTime(at(3 * 3_600_000), NOW)).toBe('3h ago')
    })

    it('walks the whole ladder', () => {
        const day = 24 * 3_600_000
        expect(formatRelativeTime(at(2 * day), NOW)).toBe('2d ago')
        expect(formatRelativeTime(at(10 * day), NOW)).toBe('1w ago')
        expect(formatRelativeTime(at(40 * day), NOW)).toBe('1mo ago')
        expect(formatRelativeTime(at(400 * day), NOW)).toBe('1y ago')
    })

    it('renders "just now" below a minute', () => {
        expect(formatRelativeTime(at(5_000), NOW)).toBe('just now')
    })

    it('keeps the sign in the sub-minute bucket', () => {
        // The compact English form carries the sign in its own wording.
        expect(formatRelativeTime(at(30_000), NOW)).toBe('just now')
        expect(formatRelativeTime(after(10_000), NOW)).toBe('in a moment')
    })

    it('keeps the sign for the locales that go through Intl', () => {
        // `Intl` can only say "vor" or "in" if the renderer hands the
        // signed value over: a sub-minute bucket that dropped the sign
        // called a timestamp in the future "jetzt".
        createPluginI18n('de')
        expect(formatRelativeTime(at(30_000), NOW)).toBe('vor 30 Sekunden')
        expect(formatRelativeTime(after(10_000), NOW)).toBe('in 10 Sekunden')
    })

    it('renders the German plural forms', () => {
        createPluginI18n('de')
        expect(formatRelativeTime(at(5 * 60_000), NOW)).toBe('vor 5 Minuten')
        expect(formatRelativeTime(at(3 * 3_600_000), NOW)).toBe('vor 3 Stunden')
    })

    it('returns an empty string for a missing timestamp', () => {
        expect(formatRelativeTime(null, NOW)).toBe('')
        expect(formatRelativeTime(undefined, NOW)).toBe('')
    })

    it('returns the raw value for an unparsable timestamp', () => {
        expect(formatRelativeTime('not-a-date', NOW)).toBe('not-a-date')
    })
})

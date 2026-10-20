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

describe('formatRelativeTime', () => {
    beforeEach(() => {
        createPluginI18n('en')
    })

    it('renders the compact English form', () => {
        expect(formatRelativeTime(at(5 * 60_000), NOW)).toBe('5m ago')
        expect(formatRelativeTime(at(3 * 3_600_000), NOW)).toBe('3h ago')
    })

    it('renders "just now" below a minute', () => {
        expect(formatRelativeTime(at(5_000), NOW)).toBe('just now')
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

/**
 * Relative time, in the interface's language.
 *
 * The shared `@spora-ai/components` package exports a `formatRelativeTime`
 * that only knows the compact English form (`5m ago`) — its locale-aware
 * version is not in a published release yet, so this is a local copy of
 * the host's `spora-frontend/src/composables/useRelativeTime.ts` until the
 * package ships one.
 *
 * The English branch keeps the compact form the dashboard has always
 * shipped; every other locale goes through `Intl.RelativeTimeFormat` for
 * its plural forms.
 */
import { activeLocale } from '../i18n'

/**
 * `diff` is positive for the past and negative for the future, because it
 * is `now - then`. `Intl.RelativeTimeFormat` uses the opposite convention,
 * so the value is negated on the way in.
 */
function relative(locale: string, diff: number, unit: Intl.RelativeTimeFormatUnit): string {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-diff, unit)
}

const COMPACT_ENGLISH = /^en\b/i

/**
 * One relative time, rendered.
 *
 * `compact` is the English form the dashboard has always shipped and
 * `diff` / `unit` are what `Intl` formats; the two never both apply.
 */
function render(
    locale: string,
    diff: number,
    unit: Intl.RelativeTimeFormatUnit,
    compact: string,
): string {
    return COMPACT_ENGLISH.test(locale) ? compact : relative(locale, diff, unit)
}

/**
 * A timestamp as a relative string, in the panel's locale.
 *
 * `now` is a parameter rather than a call to `Date.now()` so a caller that
 * ticks on its own schedule can decide when the label is stale.
 *
 * The sub-minute bucket is "essentially now" on purpose: English says
 * `just now` rather than `30 seconds ago` to keep list rows quiet, so the
 * other locales get the same treatment instead of the literal value.
 */
export function formatRelativeTime(
    iso: string | null | undefined,
    now: number = Date.now(),
): string {
    if (typeof iso !== 'string' || iso === '') return ''

    const then = new Date(iso).getTime()
    if (!Number.isFinite(then)) return iso

    const locale = activeLocale()
    const diffSec = Math.round((now - then) / 1000)

    if (Math.abs(diffSec) < 60) {
        const compact = diffSec >= 0 ? 'just now' : 'in a moment'
        return render(locale, 0, 'second', compact)
    }

    const minutes = Math.round(diffSec / 60)
    if (Math.abs(minutes) < 60) {
        return render(locale, minutes, 'minute', `${minutes}m ago`)
    }

    const hours = Math.round(minutes / 60)
    if (Math.abs(hours) < 24) {
        return render(locale, hours, 'hour', `${hours}h ago`)
    }

    const days = Math.round(hours / 24)
    if (Math.abs(days) < 7) {
        return render(locale, days, 'day', `${days}d ago`)
    }

    const weeks = Math.round(days / 7)
    if (Math.abs(weeks) < 5) {
        return render(locale, weeks, 'week', `${weeks}w ago`)
    }

    const months = Math.round(days / 30)
    if (Math.abs(months) < 12) {
        return render(locale, months, 'month', `${months}mo ago`)
    }

    const years = Math.round(days / 365)
    return render(locale, years, 'year', `${years}y ago`)
}

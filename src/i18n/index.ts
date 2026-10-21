/**
 * The plugin's own i18n instance.
 *
 * Every plugin frontend ships its own `vue-i18n` instance built from its
 * own catalogue — the host does not publish its instance, because that
 * would couple every plugin to the host's catalogue lifetime and to a
 * version-skewed peer range.
 *
 * The locale comes from the host's context (`PluginHostContext.locale`),
 * which the host's `apps/registry.ts` fills from the active user's language
 * setting. `en` is the fallback: `en.json` is a generated identity map, so
 * a key the German catalogue has not caught up with renders as its English
 * source rather than as a raw key.
 */
import { createI18n, type Composer } from 'vue-i18n'

export const FALLBACK_LOCALE = 'en'

const catalogues = import.meta.glob<Record<string, string>>('../locales/*.json', {
    eager: true,
    import: 'default',
})

export const messages: Record<string, Record<string, string>> = Object.fromEntries(
    Object.entries(catalogues).map(
        ([path, catalogue]): [string, Record<string, string>] => [
            path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
            catalogue,
        ],
    ),
)

/**
 * The composer the panel is currently running with.
 *
 * `createPluginI18n` is the only thing that sets it, so the stores, the
 * composables and the plain modules — which run outside a component's
 * setup and therefore cannot call `useI18n()` — translate through the same
 * catalogue the components do.
 */
let active: Composer | null = null

export function createPluginI18n(locale: string) {
    const instance = createI18n({
        // Composition API only — the Legacy API is not supported here.
        legacy: false,
        locale,
        fallbackLocale: FALLBACK_LOCALE,
        messages,
    })
    active = instance.global
    return instance
}

/**
 * The locale the panel is running in.
 *
 * `Intl` formatters need it, and they run outside a component's setup:
 * see `lib/relativeTime.ts`.
 */
export function activeLocale(): string {
    return active?.locale.value ?? FALLBACK_LOCALE
}

/**
 * Translate a message outside a component.
 *
 * The stores, the composables and the plain modules run outside a
 * component's setup, so `useI18n()` is not available to them; this reaches
 * the same catalogue through the instance `createPluginI18n` installed.
 *
 * Named `t` on purpose: the extractor harvests the catalogue from literal
 * `t('…')` calls, and a helper under any other name would take its
 * arguments out of the catalogue.
 *
 * Before `createPluginI18n` has run there is no instance to ask, and the
 * English source is the right answer: `en.json` is an identity map, so the
 * message renders exactly as written.
 */
export function t(message: string): string {
    if (active === null) return message
    // The composer's own `t`, read through an alias: the extractor treats
    // every call named `t` as a catalogue lookup, and a call with a
    // runtime key would be reported as a dynamic key it cannot harvest.
    const translate = active.t
    return translate(message)
}

/**
 * Vitest global setup.
 *
 * The components translate their copy through `t()`, so every mounted
 * component needs the plugin's i18n instance. It is installed globally
 * here rather than per test: the English assertions in the suite are
 * spread over a dozen component specs, and a per-mount plugin is one
 * line nobody remembers to add.
 *
 * The locale is pinned to `en` — `en.json` is a generated identity map,
 * so the English assertions keep asserting English.
 */
import { config } from '@vue/test-utils'
import { createPluginI18n } from '../src/i18n'

config.global.plugins = [createPluginI18n('en')]

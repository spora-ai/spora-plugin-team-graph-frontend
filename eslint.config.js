import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

/**
 * Minimal flat-config ESLint setup mirroring
 * `spora-plugin-typst-frontend/eslint.config.js`. TS strict, no
 * unused, vue parser; `*.vue` files use vue-eslint-parser; TS files
 * use typescript-eslint.
 */
export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tseslint.parser,
                ecmaVersion: 'latest',
                sourceType: 'module',
                extraFileExtensions: ['.vue'],
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                Event: 'readonly',
                HTMLElement: 'readonly',
                SVGElement: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLDivElement: 'readonly',
                SVGSVGElement: 'readonly',
                Element: 'readonly',
                Node: 'readonly',
                PointerEvent: 'readonly',
                WheelEvent: 'readonly',
                MouseEvent: 'readonly',
                KeyboardEvent: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'off',
            'vue/multi-word-component-names': 'off',
        },
    },
    {
        files: ['tests/**/*', '**/*.test.ts', '**/*.spec.ts'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                vi: 'readonly',
            },
        },
    },
    {
        ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'main.js', 'style.css', 'frontend/**'],
    },
]
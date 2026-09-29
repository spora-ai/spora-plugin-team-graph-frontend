import { describe, it, expect } from 'vitest'
import {
    HOST_DOC_LEAK_BODIES,
    IS_FUNCTION_ARGUMENT,
    ORIGINAL_HOST_DOC_LEAKS,
    ORIGINAL_IS_FUNCTION_ARGUMENT,
    RULE_START,
    firstHostDocLeak,
} from '../../scripts/cssGuards'

/**
 * The stylesheet guards in `scripts/smoke.js`, as a differential test.
 *
 * Both patterns were rewritten to remove the nested quantifier that made
 * the engine backtrack quadratically (Sonar S5852, "super-linear runtime
 * due to backtracking"). A faster pattern that quietly stopped catching
 * the thing it exists for would be worse than the finding, so each is
 * pinned here against the pattern it replaced — first on the real cases,
 * then differentially, over exhaustive and random strings.
 *
 * The originals are kept in `cssGuards.js` **only** as the oracle for this
 * file. They are not guards and nothing in `smoke.js` uses them.
 */

/** The two ends of every question the `var(` probe is asked. */
const NOT_A_FUNCTION = [
    'background: ',
    'color: ',
    'border: 1px solid ',
    '',
    'grid-template-columns: repeat(2, ',
    'box-shadow: 0 0 0 ',
]

const IS_A_FUNCTION = [
    'background: hsl(',
    'color: hsl(',
    'border: 1px solid hsl(',
    'color: color-mix(in srgb, hsl(',
    'background: hsl(',
    'color: rgb(',
    'color: oklch(',
    'color: lab(',
    'color: -webkit-calc(',
    // A function name is any run of name characters before the paren, so a
    // pseudo-class and a vendor prefix read the same way here. The guard
    // only asks "is there a function call in front of this `var(`", and both
    // are one — which is why the original behaved identically.
    'color: :hover(',
]

describe('the bare-var() guard', () => {
    it('accepts every function form the plugin is allowed to use', () => {
        for (const lead of IS_A_FUNCTION) {
            expect(IS_FUNCTION_ARGUMENT.test(lead), lead).toBe(true)
        }
    })

    it('rejects every declaration a bare var() would appear in', () => {
        for (const lead of NOT_A_FUNCTION) {
            expect(IS_FUNCTION_ARGUMENT.test(lead), JSON.stringify(lead)).toBe(false)
        }
    })

    it('is the case-insensitive match it always was, and tolerates whitespace after the paren', () => {
        // The `s*` is *after* the `(`, not before: the pattern asks what
        // follows the captured window, which begins at the `var(`. A space
        // between the function name and its paren has never been accepted,
        // and the rewrite does not change that.
        expect(IS_FUNCTION_ARGUMENT.test('background: HSL(')).toBe(true)
        expect(IS_FUNCTION_ARGUMENT.test('background: HsL(')).toBe(true)
        expect(IS_FUNCTION_ARGUMENT.test('background: hsl(\t')).toBe(true)
        expect(IS_FUNCTION_ARGUMENT.test('background: hsl (')).toBe(false)
    })

    it('rejects a `(` that is not a function call at all', () => {
        // No name character in front: a grouping paren. Neither the original
        // nor the rewrite reads it as a function, so the `var(` after it is
        // still reported.
        expect(IS_FUNCTION_ARGUMENT.test('background: (')).toBe(false)
        expect(IS_FUNCTION_ARGUMENT.test('background: (((')).toBe(false)
    })

    it('matches the original pattern on every case the guard is for', () => {
        const cases = [...IS_A_FUNCTION, ...NOT_A_FUNCTION, '(', '((', ':hover(', 'HSL(', 'hsl (', 'hsl(\t', 'a-b-c(']
        for (const lead of cases) {
            expect(IS_FUNCTION_ARGUMENT.test(lead), lead).toBe(ORIGINAL_IS_FUNCTION_ARGUMENT.test(lead))
        }
    })

    it('agrees with the original pattern over exhaustive and random strings', () => {
        const alphabet = ['a', 'z', '-', '(', ')', ' ', '\t', 'H', 'S', 'L', '1', ':', '.', '\n']
        let checked = 0
        // Exhaustive over every string of length 1..4.
        const walk = (prefix: string): void => {
            if (prefix.length > 0) {
                expect(IS_FUNCTION_ARGUMENT.test(prefix), prefix).toBe(ORIGINAL_IS_FUNCTION_ARGUMENT.test(prefix))
                checked++
            }
            if (prefix.length === 4) return
            for (const c of alphabet) walk(prefix + c)
        }
        walk('')
        // Plus random longer strings, where a backtracking pattern would
        // behave worst.
        let seed = 987654321
        const random = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648
            return seed / 2147483648
        }
        for (let i = 0; i < 20000; i++) {
            const n = 5 + Math.floor(random() * 40)
            let s = ''
            for (let k = 0; k < n; k++) s += alphabet[Math.floor(random() * alphabet.length)]
            expect(IS_FUNCTION_ARGUMENT.test(s), s).toBe(ORIGINAL_IS_FUNCTION_ARGUMENT.test(s))
            checked++
        }
        // 14⁴ − 1 = 38 359 exhaustive, plus 20 000 random. The point is the
        // count, not a round number: it is what stops this being a
        // differential test over a handful of hand-picked strings.
        expect(checked).toBeGreaterThan(58000)
    })
})

/** Sheets that must be reported, and the wording each one earns. */
const LEAKY: Array<{ css: string; what: string }> = [
    { css: 'html, body, #app { color: #1f2937; }', what: 'an unscoped `html, body, #app` rule' },
    { css: '} html,body,#app{color:red}', what: 'an unscoped `html, body, #app` rule' },
    { css: 'html , body , #app { color: red }', what: 'an unscoped `html, body, #app` rule' },
    { css: '\n\nhtml,\nbody,\n#app\n{ color: red }', what: 'an unscoped `html, body, #app` rule' },
    { css: 'body { background: #f9fafb; }', what: 'an unscoped `body` rule with a hard-coded colour' },
    { css: 'body{color:#1f2937}', what: 'an unscoped `body` rule with a hard-coded colour' },
    { css: 'a{}body{background:#fff}', what: 'an unscoped `body` rule with a hard-coded colour' },
    { css: ':root { color-scheme: light; }', what: 'a `:root` rule setting `color-scheme` (belongs on the plugin root)' },
    { css: 'x{}:root{color-scheme:dark}', what: 'a `:root` rule setting `color-scheme` (belongs on the plugin root)' },
]

/** Sheets that must pass — the plugin's own, and the near misses. */
const CLEAN = [
    '#spora-plugin-team-graph { font-family: system-ui }',
    '#spora-plugin-team-graph html, body, #app { color: red }',
    // The selector text appears, but not as a rule of its own.
    '.x { content: "html, body, #app {" }',
    '.y { color: red }\nbody { color: var(--foreground) }',
    // A hard-coded colour on a *scoped* rule is the plugin's own business.
    '#spora-plugin-team-graph .tg-node-card { background: #0f172a }',
    '.tg-node-card { background: #0f172a }',
    // `color-scheme` on a scoped root is correct, not a leak.
    '#spora-plugin-team-graph { color-scheme: light }',
    '.surface-card { background: var(--card) }',
]

describe('the host-document leak guard', () => {
    it('reports every rule the guard exists for, with the same wording', () => {
        for (const { css, what } of LEAKY) {
            expect(firstHostDocLeak(css), css).toBe(what)
        }
    })

    it('passes the sheets that must pass', () => {
        for (const css of CLEAN) {
            expect(firstHostDocLeak(css), css).toBeNull()
        }
    })

    it('agrees with the original single pattern on every case the guard is for', () => {
        const all: string[] = [...LEAKY.map((row) => row.css), ...CLEAN]
        for (const css of all) {
            const original = ORIGINAL_HOST_DOC_LEAKS.findIndex((re: RegExp) => re.test(css))
            const current = HOST_DOC_LEAK_BODIES.findIndex(({ body }: { body: RegExp }) => {
                const found = body.exec(css)
                return found !== null && RULE_START.test(css.slice(0, found.index))
            })
            expect(current, css).toBe(original)
        }
    })

    it('agrees with the original patterns over random sheets', () => {
        // Dense over the characters that decide a match: the selector
        // keywords, the rule delimiters, and the hex colours.
        const pieces = [
            'html', 'body', '#app', '{', '}', ';', ' ', '\n', ':', 'root', 'color-scheme',
            'background', 'color', '#1f2937', '#fff', 'light', 'x', '.a', ',', '[', ']',
        ]
        let seed = 13579246
        const random = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648
            return seed / 2147483648
        }
        for (let i = 0; i < 20000; i++) {
            const n = 2 + Math.floor(random() * 12)
            let css = ''
            for (let k = 0; k < n; k++) css += pieces[Math.floor(random() * pieces.length)]
            const original = ORIGINAL_HOST_DOC_LEAKS.some((re: RegExp) => re.test(css))
            const current = firstHostDocLeak(css) !== null
            expect(current, JSON.stringify(css)).toBe(original)
        }
    })
})

/**
 * The two stylesheet guards in `smoke.js` whose patterns had to be
 * rewritten, separated out so a test can assert they still accept and
 * reject exactly what the originals did.
 *
 * Both rewrites are equivalence-preserving and were checked that way
 * before landing — see `tests/scripts/cssGuards.spec.ts`, which holds the
 * differential harness. `ORIGINAL_*` are the superseded patterns, kept
 * only so that test can compare against them; nothing in `smoke.js` uses
 * them, and they are not guards themselves.
 */

/**
 * Does the `var(` the scan stopped at belong to a colour function?
 *
 * `hsl(var(--muted))`, `hsl(var(--primary) / 0.45)` and
 * `color-mix(in srgb, hsl(var(--muted)) 14%, white)` are correct; a
 * `var(` with no function in front of it is an invalid value against the
 * host's HSL channel triples and is dropped at computed-value time.
 *
 * Exactly one name character is required, not one or more: a `(` behind a
 * single name character is still a function call, so nothing legitimate is
 * lost, and the unbounded `[a-z-]+` this replaced let the engine
 * backtrack quadratically over a long declaration value.
 */
export const IS_FUNCTION_ARGUMENT = /[a-z-]\(\s*$/i

/**
 * The superseded pattern, kept only so the test can compare against it.
 *
 * NOSONAR: the unbounded `[a-z-]+` *is* the S8786 backtracking this
 * rewrite set out to remove, and simplifying it would delete the
 * property the differential test depends on — it exists to be the
 * slow, wrong-side-of-the-substitution oracle that
 * `IS_FUNCTION_ARGUMENT` is proven against. Never used by `smoke.js`.
 */
export const ORIGINAL_IS_FUNCTION_ARGUMENT = /[a-z-]+\(\s*$/i // NOSONAR

/**
 * Does `selector` open a rule — the start of the sheet, or straight after
 * the previous rule's closing brace?
 *
 * Every host-document leak below is a *whole rule*, so a declaration that
 * merely sits inside one is a different thing. Folding the `^` / `[};]`
 * alternation and the whitespace after it into this one cheap test keeps
 * the individual patterns single-purpose and free of the nested
 * quantifier that made them backtrack.
 */
export const RULE_START = /(^|[};])\s*$/

/** The three host-document leaks, as the selector body each one looks for. */
export const HOST_DOC_LEAK_BODIES = [
    { body: /html\s*,\s*body\s*,\s*#app\s*\{/, what: 'an unscoped `html, body, #app` rule' },
    { body: /body\s*\{[^}]*\b(background|color)\s*:\s*#[0-9a-f]{3,8}\b/i, what: 'an unscoped `body` rule with a hard-coded colour' },
    { body: /:root\s*\{[^}]*\bcolor-scheme\b/i, what: 'a `:root` rule setting `color-scheme` (belongs on the plugin root)' },
]

/**
 * The superseded single patterns, kept only so the test can compare
 * against them.
 *
 * NOSONAR on the first entry: the leading `(^|[};])\s*` is exactly the
 * S8786 backtracking the `RULE_START` split removed, and it has to stay
 * verbatim for the same reason as `ORIGINAL_IS_FUNCTION_ARGUMENT` — it
 * is the oracle, not a guard. The other two are not themselves
 * super-linear, so they are left analysable. Never used by `smoke.js`.
 */
export const ORIGINAL_HOST_DOC_LEAKS = [ // NOSONAR
    /(^|[};])\s*html\s*,\s*body\s*,\s*#app\s*\{/m,
    /(^|[};])\s*body\s*\{[^}]*\b(background|color)\s*:\s*#[0-9a-f]{3,8}\b/i,
    /(^|[};])\s*:root\s*\{[^}]*\bcolor-scheme\b/i,
]

/**
 * The first leak the sheet contains, or `null`. The rule body is matched
 * first and its position is then checked against `RULE_START`, which is
 * what the leading `(^|[};])` in the original pattern did.
 */
export function firstHostDocLeak(css) {
    for (const { body, what } of HOST_DOC_LEAK_BODIES) {
        const found = body.exec(css)
        if (found !== null && RULE_START.test(css.slice(0, found.index))) {
            return what
        }
    }
    return null
}

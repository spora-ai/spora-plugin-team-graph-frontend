/**
 * Types for `scripts/cssGuards.js`, which the smoke check and its test
 * share. The module is plain JS so `node scripts/smoke.js` needs no build
 * step; this keeps `vue-tsc` from inferring `any` at the import.
 */

/**
 * Does the `var(` the scan stopped at belong to a colour function?
 *
 * `hsl(var(--muted))`, `hsl(var(--primary) / 0.45)` and
 * `color-mix(in srgb, hsl(var(--muted)) 14%, white)` are correct; a `var(`
 * with no function in front of it is an invalid value against the host's
 * HSL channel triples and is dropped at computed-value time.
 *
 * Exactly one name character is required, not one or more: a `(` behind a
 * single name character is still a function call, so nothing legitimate is
 * lost, and the unbounded `[a-z-]+` this replaced let the engine backtrack
 * quadratically over a long declaration value.
 */
export declare const IS_FUNCTION_ARGUMENT: RegExp

/**
 * The superseded pattern, kept only so the test can compare against it.
 * Not a guard.
 */
export declare const ORIGINAL_IS_FUNCTION_ARGUMENT: RegExp

/**
 * Does `selector` open a rule — the start of the sheet, or straight after
 * the previous rule's closing brace?
 *
 * Every host-document leak is a *whole rule*, so a declaration that merely
 * sits inside one is a different thing. Folding the `^` / `[};]`
 * alternation and the whitespace after it into this one cheap test keeps
 * the individual patterns single-purpose and free of the nested quantifier
 * that made them backtrack.
 */
export declare const RULE_START: RegExp

/** One host-document leak: the selector body to look for, and how to name it. */
export interface HostDocLeak {
    body: RegExp
    what: string
}

/** The three host-document leaks, as the selector body each one looks for. */
export declare const HOST_DOC_LEAK_BODIES: HostDocLeak[]

/**
 * The superseded single patterns, kept only so the test can compare
 * against them. Not guards.
 */
export declare const ORIGINAL_HOST_DOC_LEAKS: RegExp[]

/**
 * The first leak the sheet contains, or `null`. The rule body is matched
 * first and its position is then checked against `RULE_START`, which is
 * what the leading `(^|[};])` in the original pattern did.
 */
export declare function firstHostDocLeak(css: string): string | null

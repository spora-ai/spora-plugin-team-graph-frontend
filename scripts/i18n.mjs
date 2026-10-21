#!/usr/bin/env node
/**
 * i18n extractor — generates `src/locales/en.json` from the source and
 * enforces the catalogue contract.
 *
 *   node scripts/i18n.mjs            regenerate en.json, report gaps
 *   node scripts/i18n.mjs --check    enforce the five CI rules, no writes
 *   node scripts/i18n.mjs --root DIR scan a fixture tree instead of this repo
 *
 * Built on the two parsers already in the tree (`vue-eslint-parser` and
 * `@typescript-eslint/typescript-estree`) rather than
 * `@intlify/unplugin-vue-i18n`, because the failure output has to name
 * `file:line` and the catalogue is generated from literals rather than from
 * `<i18n>` blocks.
 *
 * Two things come out of a scan and they are not the same thing:
 *
 *   keys       literal `$t('…')` / `t('…')` arguments. These are the
 *              catalogue. en.json is their identity map.
 *   candidates  operator-facing literals that are NOT yet wrapped in `t()`.
 *              In this plugin they are **fatal**: the panel ships one
 *              language and an unwrapped string is a string the operator
 *              reads in English, so the migration is finished and the
 *              worklist has to stay empty.
 *
 * Two deliberate differences from the host's copy of this script, both
 * documented at the point of use:
 *
 *   - rule 0 accepts a well-formed `{name}` placeholder. The host's
 *     implementation rejects every brace, which also rejects the
 *     interpolation syntax the project-wide i18n contract calls valid
 *     and expected. Rule 0 is "a key vue-i18n cannot compile", and
 *     vue-i18n compiles `{name}`.
 *   - `EXCLUDED_TERMS` — product names that read the same in every
 *     language are not copy, so they are not candidates.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseForESLint as parseVueForESLint } from 'vue-eslint-parser'
// The namespace, not the bare `parse` function: vue-eslint-parser looks for
// a `parse` / `parseForESLint` *property* and falls back to espree when it is
// handed a bare function.
import * as tsEstree from '@typescript-eslint/typescript-estree'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const verbose = args.includes('--verbose')

/**
 * `--root` points the scan at a different tree. It exists so the CI rules
 * can be exercised against a fixture — the rules only fail on *absence*, so
 * testing them against the real `src/` (which is clean) proves nothing.
 */
const rootFlag = args.indexOf('--root')
const ROOT = rootFlag === -1
    ? fileURLToPath(new URL('..', import.meta.url))
    : resolve(process.cwd(), args[rootFlag + 1])
const SOURCE_DIR = join(ROOT, 'src')
const CATALOGUE_DIR = join(SOURCE_DIR, 'locales')
const SOURCE_LOCALE = 'en'
const TARGET_LOCALES = ['de']

/**
 * Files that never reach an operator.
 *
 * The dev sandbox (`dev-main.ts`) is not part of the shipped panel:
 * the production bundle's entry is `src/main.ts`, and `vite.config.ts`
 * already excludes `src/dev-main.ts` from coverage for the same reason.
 *
 * Its strings are mock *server* payloads — the stubbed REST responses
 * the sandbox renders — so putting them in a German catalogue would be
 * wrong twice over: it would translate data that stands in for server
 * payloads, and it would translate a fixture that exists to look like
 * English server data.
 */
const EXCLUDED_FILES = new Set(['dev-main.ts'])

/**
 * Terms that are not copy, so they stay in the template as raw text.
 *
 * The contract draws the line the same way: a string that is *only* a
 * proper noun, a technical identifier or a layout-bound code is excluded
 * from the catalogue rather than given an invented translation.
 * Leaving one out of the catalogue means it stays in the template as raw
 * text, so the scanner has to know that it is not copy.
 *
 * The match is exact, so a phrase that merely contains one of these
 * terms ("Open the Principal list") is still reported.
 */
const EXCLUDED_TERMS = new Set([
    /*
     * The house term for a Spora principal. The host's own German
     * catalogue keeps it untranslated — "Ziel-Principal", "einen anderen
     * Principal" — so a German operator reads "Principal" here too, and
     * translating it would put two words for one concept on the same
     * screen.
     */
    'Principal',
    'Principals',

    /*
     * The pill badge on each principal tab: "MY" for the operator's own
     * user-principal, "G" for a group. They are `aria-hidden` two-letter
     * codes inside a 20 px circle, so there is no room for a translated
     * word, and the label next to them ("My Agents" / the group's own
     * name) already carries the meaning.
     */
    'MY',
    'G',

    /*
     * The wire's edge-operation slug (`op: 'sub_agent' | 'handover'`).
     * It names the tool that produced the edge, and the host's task chat
     * uses the same identifier for it — translating it here would break
     * the link between the graph and the tool it draws.
     */
    'sub_agent',
])

/** Attribute names whose literal value is operator-facing copy. */
const LITERAL_ATTRIBUTES = new Set([
    'placeholder',
    'title',
    'aria-label',
    'label',
    'alt',
])

/**
 * Object properties whose literal string value is operator-facing copy in a
 * `.ts` module. This is the rule that catches the surfaces a `.vue`-only
 * extractor cannot see: the composables' toolbar labels, the constants'
 * option lists.
 */
const COPY_PROPERTIES = new Set([
    'label',
    'title',
    'placeholder',
    'aria-label',
    'alt',
    'description',
    'message',
    'text',
    'displayName',
    'category',
    'confirmLabel',
    'cancelLabel',
    'confirmText',
    'cancelText',
])

/**
 * Functions that put a literal string straight into the DOM.
 */
const DOM_TEXT_FUNCTIONS = new Set(['createTextNode'])

/**
 * Variables a store assigns its failure message to.
 *
 * The object-property rule cannot see these: `error.value = '…'` is an
 * *assignment*, not a property, so a store's untranslated failure
 * message used to reach the operator in English without the
 * extractor noticing. The base identifier is what the rule keys on —
 * `error.value` and `error.message` both qualify.
 */
const COPY_VARS = new Set(['error', 'message'])

const SCAN_EXTENSIONS = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx'])

// ---------------------------------------------------------------------------
// Syntax rejection
// ---------------------------------------------------------------------------

/**
 * vue-i18n's message syntax, verified against
 * `@intlify/message-compiler`'s `TEXT_ESCAPES` (`/\\([\\@{}|])/g`):
 *
 *   `{` / `}`  named interpolation      `t('Hi {name}')`
 *   `|`        plural separator         `t('{n} item | {n} items', { n })`
 *   `\{` `}` `\|` `\\` `\@`  escapes that render the character literally
 *
 * So the extractor strips the escapes and rejects whatever is left. A key
 * carrying a raw `{` is not a lint nit: it is a key that either throws at
 * render or, once the message compiler is dropped from the build, silently
 * prints its own source — and the usual source of one is a JSON or CSS
 * snippet pasted into help text.
 */
const TEXT_ESCAPES = /\\([\\@{}|])/g

/**
 * A named or list placeholder — `{name}`, `{0}`.
 *
 * vue-i18n's message compiler turns these into parameter lookups, so
 * they are *not* a syntax error: a message that interpolates a
 * filename or a count is the normal case, and the project-wide
 * i18n contract calls it out by name.
 */
const PLACEHOLDER = /\{\s*[\w.-]+\s*\}/g

function syntaxProblem(key) {
    // Escapes are *consumed* by the compiler and rendered literally, so they
    // are removed rather than unwrapped: `Use \{braces\}` compiles to the
    // literal text `Use {braces}`, and unwrapping it would leave exactly the
    // braces this rule exists to reject.
    const stripped = key.replace(TEXT_ESCAPES, '')
    // The well-formed placeholders go too: they are the interpolation
    // syntax, and what is left over is a brace vue-i18n cannot compile.
    const withoutPlaceholders = stripped.replace(PLACEHOLDER, '')
    const found = ['{', '}', '|'].filter((ch) => withoutPlaceholders.includes(ch))
    return found.length > 0 ? found : null
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function listSourceFiles(dir) {
    const found = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            found.push(...listSourceFiles(full))
        } else if (
            SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.'))) &&
            !entry.name.endsWith('.d.ts') &&
            !EXCLUDED_FILES.has(entry.name)
        ) {
            found.push(full)
        }
    }
    return found.sort(compareStrings)
}

/**
 * Codepoint order — `Array.prototype.sort()`'s default, spelled out.
 *
 * `localeCompare` would be locale-dependent, and the catalogue's order
 * has to be the same on every machine: the CI gate compares the
 * generated file with the committed one byte for byte.
 */
function compareStrings(a, b) {
    if (a < b) return -1
    if (a > b) return 1
    return 0
}

const rel = (file) => relative(ROOT, file).split(sep).join('/')

/** Generic ESTree walk — no visitor-key table needed for literal harvesting. */
function walk(node, visit) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
        for (const child of node) walk(child, visit)
        return
    }
    if (typeof node.type === 'string') visit(node)
    for (const key of Object.keys(node)) {
        if (key === 'parent') continue
        const child = node[key]
        if (child !== null && typeof child === 'object') walk(child, visit)
    }
}

/**
 * The name a call was made on, for both `t('…')` and `i18n.global.t('…')`.
 * Returns null for anything whose name cannot be read statically — a
 * computed member or a call result, where guessing would produce keys the
 * source does not contain.
 */
function calleeName(node) {
    if (node.type !== 'CallExpression') return null
    const callee = node.callee
    if (callee.type === 'Identifier') return callee.name
    if (
        callee.type === 'MemberExpression' &&
        callee.computed !== true &&
        callee.property.type === 'Identifier'
    ) {
        return callee.property.name
    }
    return null
}

/** The string a call was passed at argument 0, if it was passed a literal one. */
function stringArgument(args) {
    const first = args[0]
    if (first?.type === 'Literal' && typeof first.value === 'string') return first.value
    if (first?.type === 'TemplateLiteral' && first.expressions.length === 0) {
        return first.quasis[0].value.cooked ?? first.quasis[0].value.raw
    }
    return null
}

function propertyName(node) {
    if (node.computed === true) return null
    if (node.key.type === 'Identifier') return node.key.name
    if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value
    return null
}

/** A candidate is only worth reporting if it reads as prose. */
function looksLikeCopy(value) {
    if (value.trim() === '') return false
    if (EXCLUDED_TERMS.has(value.trim())) return false
    return /\p{L}/u.test(value)
}

/**
 * The string literal an assignment hands to a copy variable, if any.
 *
 * Two shapes reach the operator: the literal itself
 * (`error.value = '…'`) and the fallback branch of a conditional
 * (`error.value = e instanceof ApiError ? e.message : '…'`) — the
 * second is the shape every store's failure message takes.
 */
function assignedLiteral(node) {
    if (node?.type === 'Literal') {
        return typeof node.value === 'string' ? node.value : null
    }
    if (node?.type === 'ConditionalExpression') {
        return assignedLiteral(node.alternate) ?? assignedLiteral(node.consequent)
    }
    return null
}

/**
 * Walk a Vue template for the strings the operator reads.
 *
 * The template is not part of the `<script>` AST, so it needs its own
 * walk: raw text, literal attributes and bound literal attributes are
 * all copy, and the expression containers hold the `{{ t('…') }}` calls
 * the script walk cannot see.
 */
function walkTemplate(node, ctx) {
    if (node.type === 'VDocumentFragment') {
        node.children.forEach((child) => walkTemplate(child, ctx))
        return
    }
    if (node.type !== 'VElement') return

    for (const attribute of node.startTag.attributes) {
        const literal = attribute.directive === false
            ? literalAttribute(attribute)
            : boundAttributeLiteral(attribute)
        if (literal !== null) {
            ctx.addCandidate(literal.value, ctx.file, literal.line, literal.kind)
        }
    }

    for (const child of node.children) {
        walkTemplateChild(child, ctx)
    }
}

/**
 * A plain literal attribute — `placeholder="…"`.
 */
function literalAttribute(attribute) {
    const name = attribute.key.name
    if (name === undefined) return null
    if (!LITERAL_ATTRIBUTES.has(name)) return null
    const value = attribute.value
    if (value?.type !== 'VLiteral') return null
    if (typeof value.value !== 'string') return null
    return { value: value.value, line: attribute.loc.start.line, kind: name }
}

/**
 * A bound literal attribute — `:placeholder="'…'"`.
 *
 * The binding is still a literal, so it is still copy.
 */
function boundAttributeLiteral(attribute) {
    const argName = attribute.key.name?.name === 'bind' ? attribute.key.argument?.name : null
    if (argName === null) return null
    if (!LITERAL_ATTRIBUTES.has(argName)) return null
    const value = attribute.value
    if (value?.type !== 'VExpressionContainer') return null
    if (value.expression?.type !== 'Literal') return null
    if (typeof value.expression.value !== 'string') return null
    return {
        value: value.expression.value,
        line: value.loc.start.line,
        kind: `:${argName}`,
    }
}

/**
 * One child node of a template element.
 */
function walkTemplateChild(child, ctx) {
    if (child.type === 'VText') {
        ctx.addCandidate(child.value, ctx.file, child.loc.start.line, 'raw text')
        return
    }
    if (child.type === 'VExpressionContainer' && child.expression) {
        // Template expressions are ESTree and are not part of the
        // `<script>` AST, so they need the same walk to find
        // `{{ $t('…') }}` and `{{ t('…') }}`.
        ctx.visitAst(child.expression, ctx.file)
        return
    }
    walkTemplate(child, ctx)
}

/**
 * A `t('…')` / `$t('…')` call.
 *
 * A literal argument is a catalogue key. A non-literal one is a key
 * computed at runtime, which the extractor cannot harvest — it is
 * reported rather than guessed at.
 */
function visitTranslationCall(node, file, harvest) {
    const key = stringArgument(node.arguments)
    if (key !== null) {
        harvest.addKey(key, file, node.loc.start.line)
        return
    }
    // A spread is a helper forwarding another call's arguments, not a
    // key computed at runtime, so it is not worth reporting.
    if (node.arguments[0]?.type !== 'SpreadElement') {
        harvest.dynamic.push({ file, line: node.loc.start.line })
    }
}

/**
 * A call that puts a literal string straight into the DOM.
 */
function visitDomTextCall(node, file, harvest) {
    const text = stringArgument(node.arguments)
    if (text === null) return
    harvest.addCandidate(text, file, node.loc.start.line, 'DOM text')
}

/**
 * A call expression: either a catalogue key or copy the operator reads.
 */
function visitCallExpression(node, file, harvest) {
    if (node.type !== 'CallExpression') return
    const name = calleeName(node)
    if (name === 't' || name === '$t') {
        visitTranslationCall(node, file, harvest)
        return
    }
    if (DOM_TEXT_FUNCTIONS.has(name)) visitDomTextCall(node, file, harvest)
}

/**
 * An object property whose literal value is operator-facing copy.
 */
function visitCopyProperty(node, file, harvest) {
    if (node.type !== 'Property' && node.type !== 'PropertyDefinition') return
    if (!COPY_PROPERTIES.has(propertyName(node) ?? '')) return
    if (node.value?.type !== 'Literal' || typeof node.value.value !== 'string') return
    harvest.addCandidate(node.value.value, file, node.loc.start.line, 'literal')
}

/**
 * An assignment to a copy variable — `error.value = '…'`.
 */
function visitCopyAssignment(node, file, harvest) {
    if (node.type !== 'AssignmentExpression') return
    if (node.left?.type !== 'MemberExpression') return
    if (node.left.object?.type !== 'Identifier') return
    if (!COPY_VARS.has(node.left.object.name)) return
    const literal = assignedLiteral(node.right)
    if (literal === null) return
    harvest.addCandidate(literal, file, node.loc.start.line, 'assignment')
}

function scan() {
    const keys = new Map()
    const candidates = []
    const dynamic = []

    const harvest = {
        addKey: (key, file, line) => {
            const existing = keys.get(key)
            if (existing === undefined) keys.set(key, [{ file, line }])
            else existing.push({ file, line })
        },
        addCandidate: (value, file, line, kind) => {
            if (looksLikeCopy(value)) candidates.push({ value: value.trim(), file, line, kind })
        },
        dynamic,
    }

    const visitAst = (node, file) => {
        walk(node, (child) => {
            visitCallExpression(child, file, harvest)
            visitCopyProperty(child, file, harvest)
            visitCopyAssignment(child, file, harvest)
        })
    }

    for (const file of listSourceFiles(SOURCE_DIR)) {
        const code = readFileSync(file, 'utf8')
        const name = rel(file)

        if (file.endsWith('.vue')) {
            // `parseForESLint`, not `parse`: the latter returns the Program node
            // itself, so reading `.ast` off it yields `undefined` and the script
            // block is walked as if it were empty — no error, zero keys.
            const { ast } = parseVueForESLint(code, {
                filePath: file,
                ecmaVersion: 2022,
                sourceType: 'module',
                loc: true,
                range: true,
                comment: true,
                // vue-eslint-parser reaches the `<script lang="ts">` body through its
                // `parser` option; without it the default espree chokes on the first
                // type annotation in the file.
                parser: tsEstree,
            })

            visitAst(ast, name)

            if (ast.templateBody != null) {
                walkTemplate(ast.templateBody, { file: name, addCandidate: harvest.addCandidate, visitAst })
            }
        } else {
            const ast = tsEstree.parse(code, {
                filePath: file,
                ecmaVersion: 2022,
                sourceType: 'module',
                loc: true,
                range: true,
                comment: true,
            })
            visitAst(ast, name)
        }
    }

    return { keys, candidates, dynamic }
}

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

function readCatalogue(locale) {
    const file = join(CATALOGUE_DIR, `${locale}.json`)
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${rel(file)} must be a flat JSON object of string values`)
    }
    return parsed
}

/** Deterministic: codepoint order, so a regenerated file diffs cleanly. */
function renderCatalogue(entries) {
    const ordered = [...entries].sort(compareStrings)
    const flat = {}
    for (const key of ordered) flat[key] = key
    return JSON.stringify(flat, null, 2) + '\n'
}

const firstLocation = (keys, key) => (keys.has(key) ? keys.get(key)[0] : null)
const show = (key) => JSON.stringify(key)

/** Where a key was found, or a placeholder when the source no longer has it. */
const location = (at) => (at === null ? '(no location)' : `${at.file}:${at.line}`)

/** The catalogue file's path, relative to the repo root. */
const cataloguePath = (locale) => rel(join(CATALOGUE_DIR, `${locale}.json`))

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const failures = []
/**
 * Hard in both modes. Reserved for a key vue-i18n cannot compile, which the
 * contract calls a hard error: it throws at render, so it is a defect in the
 * source rather than an unfinished catalogue.
 */
const fail = (rule, message) => failures.push({ rule, message })
/**
 * A contract rule. Reported in both modes, fatal only under `--check`,
 * because extract's job is "regenerate en.json + report" — failing it
 * because de.json is unfinished would make the first-ever extract
 * impossible, since the first extract is what creates en.json.
 */
const enforce = (rule, message) => {
    if (checkOnly) fail(rule, message)
}

function reportCandidates(all) {
    if (all.length === 0) return
    const byFile = new Map()
    for (const candidate of all) {
        if (!byFile.has(candidate.file)) byFile.set(candidate.file, [])
        byFile.get(candidate.file).push(candidate)
    }
    const perFileLimit = verbose ? Infinity : 12
    console.log(`\n  Untranslated copy (${all.length} in ${byFile.size} files)`)
    console.log('  Every operator-facing string must go through t().\n')
    for (const [file, list] of byFile) {
        console.log(`  ${file}  (${list.length})`)
        for (const candidate of list.slice(0, perFileLimit)) {
            console.log(`    ${candidate.file}:${candidate.line}  [${candidate.kind}] ${show(candidate.value)}`)
        }
        if (list.length > perFileLimit) {
            console.log(`    … ${list.length - perFileLimit} more (--verbose)`)
        }
    }
}

function reportGaps(keys, catalogues) {
    console.log(`\n  Translation gaps`)
    for (const [locale, catalogue] of catalogues) {
        // `Object.hasOwn`, not `key in catalogue`: `in` walks the prototype
        // chain, so a key named `constructor`, `toString` or `__proto__` reads
        // as translated when the catalogue does not contain it at all. Those are
        // plausible English UI strings, and the failure is silent — the catalogue
        // is reported complete while shipping the English key untranslated.
        const missing = [...keys.keys()].filter((key) => !Object.hasOwn(catalogue, key))
        // Same predicate as rule 3, so a malformed value cannot throw here
        // before the rule gets to report it properly.
        const placeholders = Object.entries(catalogue).filter(
            ([key, value]) => typeof value !== 'string' || value.trim() === '' || value === key,
        )
        if (missing.length === 0 && placeholders.length === 0) {
            console.log(`\n  ${locale}: complete`)
            continue
        }
        console.log(`\n  ${locale} — ${missing.length} missing, ${placeholders.length} untranslated`)
        for (const key of missing) {
            const at = firstLocation(keys, key)
            console.log(`\n  ${location(at)}`)
            console.log(`    ${show(key)}`)
        }
        for (const [key, value] of placeholders) {
            console.log(`\n  ${cataloguePath(locale)}`)
            console.log(`    ${show(key)} → ${describePlaceholder(value)}`)
        }
    }
}

function describePlaceholder(value) {
    if (typeof value !== 'string') return `${show(value)} is not a string`
    if (value.trim() === '') return '(empty)'
    return 'identical to English'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(
    checkOnly ? 'i18n:check' : 'i18n:extract',
    `— scanning src/**/*.{${[...SCAN_EXTENSIONS].join(',')}}`,
)

const { keys, candidates, dynamic } = scan()

console.log(`\n  ${keys.size} keys, ${candidates.length} untranslated strings`)

// Rule 0 — a key vue-i18n cannot compile is a hard error in both modes.
// It fails at render (or, with the message compiler dropped, prints its own
// source), so nothing downstream of it is worth reporting.
for (const [key, locations] of keys) {
    const bad = syntaxProblem(key)
    if (bad !== null) {
        for (const { file, line } of locations) {
            fail('syntax', `${file}:${line}\n    ${show(key)}\n    unescaped ${bad.map(show).join(' ')} — vue-i18n reads these as interpolation / plural syntax`)
        }
    }
}

if (dynamic.length > 0) {
    console.log(`\n  Dynamic keys (${dynamic.length}) — not harvestable, check they are intentional:`)
    for (const { file, line } of dynamic) console.log(`    ${file}:${line}`)
}

const generated = renderCatalogue(keys.keys())
const enFile = join(CATALOGUE_DIR, `${SOURCE_LOCALE}.json`)
const onDisk = existsSync(enFile) ? readFileSync(enFile, 'utf8') : null

const catalogues = new Map()
for (const locale of TARGET_LOCALES) {
    const catalogue = readCatalogue(locale)
    if (catalogue === null) {
        enforce('missing-catalogue', `${cataloguePath(locale)} does not exist`)
    } else {
        catalogues.set(locale, catalogue)
    }
}

// Rule 1 — en.json drift. Compared as text, not as a parsed object, so
// reordering and reformatting are drift too.
if (onDisk !== generated) {
    const message =
        onDisk === null
            ? `${rel(enFile)} does not exist`
            : `${rel(enFile)} is out of date with the source`
    enforce('drift', `${message} — ${keys.size} keys harvested, run: npm run i18n:extract`)
}

// Rule 2 — en \ <lang>, plus the reverse. The reverse matters: it is the
// whole enforcement mechanism, because the key IS the English literal, so a
// copy edit orphans the translation it was paired with.
for (const [locale, catalogue] of catalogues) {
    for (const key of keys.keys()) {
        // See the note in reportGaps — `in` would treat an inherited property
        // name as a present translation.
        if (!Object.hasOwn(catalogue, key)) {
            const at = firstLocation(keys, key)
            enforce('missing', `${locale} is missing a translation\n\n  ${location(at)}\n    ${show(key)}`)
        }
    }
    for (const key of Object.keys(catalogue)) {
        if (!keys.has(key)) {
            enforce(
                'orphan',
                `${locale} has a key the source no longer contains — the English text was edited\n\n  ${cataloguePath(locale)}\n    ${show(key)}`,
            )
        }
    }
}

// Rule 3 — an empty or English-identical value is an untranslated
// placeholder that reads as translated until a German user hits it.
for (const [locale, catalogue] of catalogues) {
    for (const [key, value] of Object.entries(catalogue)) {
        if (typeof value !== 'string' || value.trim() === '') {
            enforce('placeholder', `${locale} has an empty translation\n\n  ${cataloguePath(locale)}\n    ${show(key)}`)
        } else if (value === key) {
            enforce('placeholder', `${locale} has an English-identical value — untranslated placeholder\n\n  ${cataloguePath(locale)}\n    ${show(key)}`)
        }
        const bad = syntaxProblem(String(value))
        if (bad !== null) {
            fail(
                'syntax',
                `${locale} value has unescaped ${bad.map(show).join(' ')}\n\n  ${cataloguePath(locale)}\n    ${show(key)} → ${show(String(value))}`,
            )
        }
    }
}

// Rule 4 — raw text outside t(). Fatal in this plugin: the panel is the
// operator's whole surface, so a string that missed the catalogue is a
// string the operator reads in English.
reportCandidates(candidates)
for (const candidate of candidates) {
    enforce(
        'raw-text',
        `${candidate.file}:${candidate.line}\n    [${candidate.kind}] ${show(candidate.value)}\n    operator-facing copy must go through t()`,
    )
}

// Writing happens even when the translations are incomplete: en.json is the
// *generated* half of the contract and is never hand-edited, so regenerating
// it must not be gated on the hand-edited half being finished.
if (!checkOnly) {
    // The catalogue directory is part of the repository, but a fresh
    // checkout of a branch that has none yet would otherwise crash the
    // write with ENOENT.
    mkdirSync(CATALOGUE_DIR, { recursive: true })
    writeFileSync(enFile, generated)
    console.log(`\n  wrote ${rel(enFile)} (${keys.size} keys)`)
}

if (failures.length === 0) {
    reportGaps(keys, catalogues)
    console.log(`\n  ok — ${keys.size} keys, ${catalogues.size} catalogue(s) complete`)
    process.exit(0)
}

console.error(`\n  ${failures.length} problem(s)\n`)
for (const { rule, message } of failures) {
    console.error(`  [${rule}]\n  ${message}\n`)
}
if (!checkOnly) {
    console.error('  extract reports but does not enforce; the same problems fail under: npm run i18n:check')
}
process.exit(1)

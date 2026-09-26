/**
 * Client-side mirror of `Spora\Services\AgentPictures\Palette`.
 *
 * The 10 palette hex pairs are duplicated here (instead of fetched
 * from the host) because the Mermaid source is generated on the
 * frontend and needs the hex strings synchronously to emit one
 * `classDef` per palette. The host's Palette enum is the source of
 * truth — if a palette is renamed or its hex shifts upstream,
 * update the matching entry here and bump the plugin version.
 *
 * Each pair must match the host exactly. The Plugin color visual
 * contract is "the team-graph node tile uses the same colour as the
 * dashboard Avatar tile for the same agent" — a drift here breaks
 * that contract silently (the operator sees the dashboard Avatar in
 * colour X but the canvas in colour Y for the same agent).
 *
 * `className` mirrors the host's enum-case value (lowercase string)
 * so the wire `palette_key` round-trips into the Mermaid class name
 * without translation.
 */
export interface PaletteEntry {
    className: string
    bg: string
    fg: string
}

export const PALETTES: ReadonlyArray<PaletteEntry> = [
    { className: 'slate',   bg: '#475569', fg: '#F8FAFC' },
    { className: 'red',     bg: '#DC2626', fg: '#FEF2F2' },
    { className: 'orange',  bg: '#EA580C', fg: '#FFF7ED' },
    { className: 'amber',   bg: '#D97706', fg: '#FFFBEB' },
    { className: 'green',   bg: '#15803D', fg: '#F0FDF4' },
    { className: 'teal',    bg: '#0F766E', fg: '#F0FDFA' },
    { className: 'blue',    bg: '#1D4ED8', fg: '#EFF6FF' },
    { className: 'indigo',  bg: '#4338CA', fg: '#EEF2FF' },
    { className: 'violet',  bg: '#6D28D9', fg: '#F5F3FF' },
    { className: 'pink',    bg: '#BE185D', fg: '#FDF2F8' },
]

/** Resolve a wire `palette_key` string to its entry, defaulting to Slate. */
export function paletteByKey(key: string | null | undefined): PaletteEntry {
    if (key === null || key === undefined) return slateFallback()
    const match = PALETTES.find((p) => p.className === key)
    return match ?? slateFallback()
}

function slateFallback(): PaletteEntry {
    const slate = PALETTES.find((p) => p.className === 'slate')
    if (slate === undefined) {
        throw new Error('palette.ts invariant: slate is missing from PALETTES')
    }
    return slate
}

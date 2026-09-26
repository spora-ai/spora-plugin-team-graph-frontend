/**
 * Archetype iconography — 12 archetypes × 3 variants = 36 icons.
 *
 * 8 agent archetypes (assistant, researcher, analyst, writer, coder,
 * explorer, advisor, creative) + 4 group archetypes (collaborative,
 * ensemble, project, community). Both pipelines share the same enum
 * server-side so the picker renders one grid for either subject.
 *
 * Each archetype ships as an array of basic SVG primitives
 * (`path` / `circle` / `rect` / etc.) matching the shape used by
 * `Icon.vue`. The `archetypeElements` helper returns the primitives
 * so callers can render them inside an `<svg>` element via Vue's
 * template syntax (no `v-html` is needed and SonarCloud's
 * HTML-injection rules don't fire). All primitives use `currentColor`
 * for stroke / fill so the server-resolved `fg_color` flows through a
 * `color: <fg>` style binding; the tile background is a separate
 * `bg_color` div behind the SVG.
 *
 * **Plugin mirror.** This file is a self-contained copy of
 * `spora-frontend/src/lib/archetypeSvgs.ts`. Plugins cannot import
 * host source files (`publishPluginGlobals` only exposes Vue,
 * Pinia, VueRouter, VueDraggablePlus, MdEditorV3 — see
 * `spora-frontend/src/utils/publishPluginGlobals.ts`), so the plugin
 * bundles a private copy. Keep in sync with the host on each
 * Composer release.
 *
 * The viewBox is `0 0 24 24`. Stroke-width is `1.6`; shapes are inset
 * 2px from the edges so the silhouette does not touch the rounded
 * square. The icons are exposed as a single lookup function so
 * callers do not have to import the map directly.
 */

export type ArchetypeKey =
  | 'assistant'
  | 'researcher'
  | 'analyst'
  | 'writer'
  | 'coder'
  | 'explorer'
  | 'advisor'
  | 'creative'
  | 'collaborative'
  | 'ensemble'
  | 'project'
  | 'community'

export type VariantKey = 'v0' | 'v1' | 'v2'

/** Ordered list of all archetypes — used by the picker. */
export const ARCHETYPES: readonly ArchetypeKey[] = [
  'assistant',
  'researcher',
  'analyst',
  'writer',
  'coder',
  'explorer',
  'advisor',
  'creative',
  'collaborative',
  'ensemble',
  'project',
  'community',
] as const

/** Ordered list of all variants — used by the variant cycler. */
export const VARIANTS: readonly VariantKey[] = ['v0', 'v1', 'v2'] as const

export type ArchetypeElement =
  | { tag: 'path'; d: string; fill?: string; stroke?: string; opacity?: number }
  | { tag: 'circle'; cx: string; cy: string; r: string; fill?: string; stroke?: string; opacity?: number }
  | { tag: 'rect'; x: string; y: string; width: string; height: string; rx?: string; fill?: string; stroke?: string }
  | { tag: 'line'; x1: string; y1: string; x2: string; y2: string; stroke?: string }
  | { tag: 'polyline'; points: string; fill?: string; stroke?: string }
  | { tag: 'polygon'; points: string; fill?: string; stroke?: string }

type ArchetypeMap = Record<ArchetypeKey, Record<VariantKey, ArchetypeElement[]>>

const stroke = 'currentColor'
const fill = 'currentColor'

const ARCHETYPES_MAP: ArchetypeMap = {
  assistant: {
    v0: [
      { tag: 'circle', cx: '12', cy: '8', r: '3.5', fill: 'none', stroke },
      { tag: 'path', d: 'M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'circle', cx: '12', cy: '12', r: '7', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '3', fill },
    ],
    v2: [
      { tag: 'rect', x: '5', y: '5', width: '14', height: '14', rx: '2', fill: 'none', stroke },
      { tag: 'circle', cx: '9.5', cy: '10', r: '1.4', fill },
      { tag: 'circle', cx: '14.5', cy: '10', r: '1.4', fill },
      { tag: 'path', d: 'M9 14.5c1 .8 4 1 6 0', fill: 'none', stroke },
    ],
  },
  researcher: {
    v0: [
      { tag: 'circle', cx: '11', cy: '11', r: '5.5', fill: 'none', stroke },
      { tag: 'line', x1: '15', y1: '15', x2: '19', y2: '19', stroke },
    ],
    v1: [
      { tag: 'circle', cx: '12', cy: '12', r: '7', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '3.5', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '1.2', fill },
    ],
    v2: [
      { tag: 'circle', cx: '11', cy: '11', r: '5.5', fill: 'none', stroke },
      { tag: 'circle', cx: '11', cy: '11', r: '1.6', fill },
      { tag: 'line', x1: '15', y1: '15', x2: '19', y2: '19', stroke },
    ],
  },
  analyst: {
    v0: [
      { tag: 'rect', x: '4', y: '14', width: '3', height: '6', fill },
      { tag: 'rect', x: '10.5', y: '9', width: '3', height: '11', fill },
      { tag: 'rect', x: '17', y: '4', width: '3', height: '16', fill },
    ],
    v1: [
      { tag: 'polyline', points: '4,17 9,12 13,14 20,6', fill: 'none', stroke },
    ],
    v2: [
      { tag: 'circle', cx: '7', cy: '7', r: '3', fill },
      { tag: 'circle', cx: '17', cy: '7', r: '3', fill: 'none', stroke },
      { tag: 'circle', cx: '7', cy: '17', r: '3', fill: 'none', stroke },
      { tag: 'circle', cx: '17', cy: '17', r: '3', fill },
    ],
  },
  writer: {
    v0: [
      { tag: 'path', d: 'M5 19l3-1 11-11-2-2L6 16l-1 3z', fill: 'none', stroke },
      { tag: 'line', x1: '14', y1: '7', x2: '17', y2: '10', stroke },
    ],
    v1: [
      { tag: 'path', d: 'M5 5h10l4 4v10H5z', fill: 'none', stroke },
      { tag: 'line', x1: '8', y1: '12', x2: '16', y2: '12', stroke },
      { tag: 'line', x1: '8', y1: '15', x2: '14', y2: '15', stroke },
    ],
    v2: [
      { tag: 'path', d: 'M5 5h14M5 9h14M5 13h10M5 17h7', stroke },
    ],
  },
  coder: {
    v0: [
      { tag: 'polyline', points: '8,8 4,12 8,16', fill: 'none', stroke },
      { tag: 'polyline', points: '16,8 20,12 16,16', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'polyline', points: '8,8 4,12 8,16', fill: 'none', stroke },
      { tag: 'polyline', points: '16,8 20,12 16,16', fill: 'none', stroke },
      { tag: 'line', x1: '14', y1: '6', x2: '10', y2: '18', stroke },
    ],
    v2: [
      { tag: 'rect', x: '3', y: '6', width: '18', height: '12', rx: '1.5', fill: 'none', stroke },
      { tag: 'polyline', points: '9,10 6,12 9,14', fill: 'none', stroke },
      { tag: 'polyline', points: '15,10 18,12 15,14', fill: 'none', stroke },
    ],
  },
  explorer: {
    v0: [
      { tag: 'circle', cx: '12', cy: '12', r: '8', fill: 'none', stroke },
      { tag: 'line', x1: '4', y1: '12', x2: '20', y2: '12', stroke },
      { tag: 'path', d: 'M12 4c2.5 3 2.5 13 0 16', fill: 'none', stroke },
      { tag: 'path', d: 'M12 4c-2.5 3-2.5 13 0 16', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'polygon', points: '12,3 21,20 3,20', fill: 'none', stroke },
    ],
    v2: [
      { tag: 'circle', cx: '12', cy: '12', r: '8', fill: 'none', stroke },
      { tag: 'polygon', points: '12,6 14.2,12 12,18 9.8,12', fill },
    ],
  },
  advisor: {
    v0: [
      { tag: 'path', d: 'M9 18h6', stroke },
      { tag: 'path', d: 'M10 21h4', stroke },
      { tag: 'path', d: 'M12 3a6 6 0 0 1 4 10.5c-.7.7-1 1.5-1 2.5h-6c0-1-.3-1.8-1-2.5A6 6 0 0 1 12 3z', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'path', d: 'M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7z', fill: 'none', stroke },
      { tag: 'polyline', points: '9,12 11,14 15,10', fill: 'none', stroke },
    ],
    v2: [
      { tag: 'path', d: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-4 3v-3H6a2 2 0 0 1-2-2V7z', fill: 'none', stroke },
      { tag: 'circle', cx: '8.5', cy: '10', r: '0.8', fill },
      { tag: 'circle', cx: '12', cy: '10', r: '0.8', fill },
      { tag: 'circle', cx: '15.5', cy: '10', r: '0.8', fill },
    ],
  },
  creative: {
    v0: [
      { tag: 'path', d: 'M12 4l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'circle', cx: '8', cy: '9', r: '3', fill },
      { tag: 'circle', cx: '16', cy: '9', r: '3', fill, opacity: 0.7 },
      { tag: 'circle', cx: '6', cy: '16', r: '2.5', fill, opacity: 0.5 },
      { tag: 'circle', cx: '18', cy: '16', r: '2.5', fill, opacity: 0.85 },
      { tag: 'circle', cx: '12', cy: '14', r: '2', fill },
    ],
    v2: [
      { tag: 'rect', x: '3', y: '5', width: '18', height: '14', rx: '2', fill: 'none', stroke },
      { tag: 'circle', cx: '8', cy: '10', r: '1.5', fill },
      { tag: 'path', d: 'M5 17l4-4 4 4 4-4', fill: 'none', stroke },
    ],
  },
  collaborative: {
    v0: [
      { tag: 'circle', cx: '8', cy: '9', r: '3', fill: 'none', stroke },
      { tag: 'circle', cx: '16', cy: '9', r: '3', fill: 'none', stroke },
      { tag: 'path', d: 'M3 19c1-2.5 3-4 5-4s4 1.5 5 4', fill: 'none', stroke },
      { tag: 'path', d: 'M11 19c1-2.5 3-4 5-4s4 1.5 5 4', fill: 'none', stroke },
    ],
    v1: [
      { tag: 'circle', cx: '12', cy: '12', r: '8', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '3', fill },
    ],
    v2: [
      { tag: 'rect', x: '4', y: '4', width: '16', height: '16', rx: '2', fill: 'none', stroke },
      { tag: 'line', x1: '12', y1: '8', x2: '12', y2: '16', stroke },
      { tag: 'line', x1: '8', y1: '12', x2: '16', y2: '12', stroke },
    ],
  },
  ensemble: {
    v0: [
      { tag: 'circle', cx: '6', cy: '7', r: '2', fill: 'none', stroke },
      { tag: 'circle', cx: '18', cy: '7', r: '2', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '17', r: '2', fill: 'none', stroke },
      { tag: 'line', x1: '8', y1: '7', x2: '16', y2: '7', stroke },
      { tag: 'line', x1: '7.5', y1: '9', x2: '11', y2: '15', stroke },
      { tag: 'line', x1: '16.5', y1: '9', x2: '13', y2: '15', stroke },
    ],
    v1: [
      { tag: 'circle', cx: '12', cy: '12', r: '7', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '3.5', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '1', fill },
    ],
    v2: [
      { tag: 'path', d: 'M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z', fill: 'none', stroke },
    ],
  },
  project: {
    v0: [
      { tag: 'rect', x: '4', y: '6', width: '16', height: '12', rx: '1', fill: 'none', stroke },
      { tag: 'line', x1: '4', y1: '10', x2: '20', y2: '10', stroke },
      { tag: 'line', x1: '8', y1: '6', x2: '8', y2: '4', stroke },
      { tag: 'line', x1: '16', y1: '6', x2: '16', y2: '4', stroke },
      { tag: 'line', x1: '8', y1: '18', x2: '8', y2: '20', stroke },
      { tag: 'line', x1: '16', y1: '18', x2: '16', y2: '20', stroke },
    ],
    v1: [
      { tag: 'rect', x: '3', y: '6', width: '18', height: '12', rx: '1.5', fill: 'none', stroke },
      { tag: 'line', x1: '3', y1: '12', x2: '21', y2: '12', stroke },
      { tag: 'circle', cx: '7', cy: '12', r: '1', fill },
      { tag: 'circle', cx: '12', cy: '12', r: '1', fill },
      { tag: 'circle', cx: '17', cy: '12', r: '1', fill },
    ],
    v2: [
      { tag: 'rect', x: '4', y: '4', width: '16', height: '3', rx: '1', fill },
      { tag: 'rect', x: '4', y: '10.5', width: '16', height: '3', rx: '1', fill },
      { tag: 'rect', x: '4', y: '17', width: '16', height: '3', rx: '1', fill },
    ],
  },
  community: {
    v0: [
      { tag: 'circle', cx: '12', cy: '12', r: '8', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '8', r: '2', fill },
      { tag: 'circle', cx: '8', cy: '14', r: '1.6', fill },
      { tag: 'circle', cx: '16', cy: '14', r: '1.6', fill },
    ],
    v1: [
      { tag: 'circle', cx: '12', cy: '12', r: '8', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '4', fill: 'none', stroke },
      { tag: 'circle', cx: '12', cy: '12', r: '1.4', fill },
    ],
    v2: [
      { tag: 'path', d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', fill: 'none', stroke },
      { tag: 'path', d: 'M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18', fill: 'none', stroke },
    ],
  },
}

/**
 * Look up the icon elements for a given archetype + variant. Unknown
 * values fall back to `assistant / v0` so the operator never sees a
 * blank tile (e.g. on a stale enum shipped before this release).
 */
export function archetypeElements(archetype: string, variant: string): ArchetypeElement[] {
  const archetypeKey = (ARCHETYPES as readonly string[]).includes(archetype)
    ? (archetype as ArchetypeKey)
    : 'assistant'
  const variantKey = (VARIANTS as readonly string[]).includes(variant)
    ? (variant as VariantKey)
    : 'v0'
  return ARCHETYPES_MAP[archetypeKey][variantKey]
}

/** Public lookup for the picker (test seam). */
export const archetypeSvgMap: ArchetypeMap = ARCHETYPES_MAP

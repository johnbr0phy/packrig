/**
 * The icon set.
 *
 * The build this replaces shipped a wind emoji (💨) and two text glyphs (⟳, ⌂)
 * in the top-right tool cluster. An emoji is a different typeface rendered by
 * the operating system at a size and weight nobody chose, sitting beside two
 * characters from a symbol block that were never drawn to be icons. Three
 * different drawing systems in one 96px-wide control — that is most of what
 * "cheap" means when someone says a site feels cheap.
 *
 * So: one system. Every icon is a 20x20 inline SVG on a 20-unit grid, stroked
 * at 1.5, round caps and joins, no fills, `currentColor`. They inherit ink from
 * whatever they sit in, which means a single colour rule keeps the whole set in
 * step, and they scale to any size without a second asset.
 *
 *   icon('wind')            -> <svg>
 *   icon('wind', { size })  -> the same at another size
 */

const NS = 'http://www.w3.org/2000/svg';

/* Paths only — the wrapper below owns every shared attribute so no icon can
   drift off the grid or the stroke weight. */
const PATHS = {
  // ← → for the gallery and any back step
  left:      ['M12.5 4L7 10l5.5 6'],
  right:     ['M7.5 4L13 10l-5.5 6'],
  up:        ['M4 12.5L10 7l6 5.5'],
  down:      ['M4 7.5L10 13l6-5.5'],
  close:     ['M5 5l10 10', 'M15 5L5 15'],

  // The camera tools. `orbit` replaces ⟳, `reframe` replaces ⌂, `wind`
  // replaces 💨 — a real airflow mark rather than a cartoon gust.
  orbit:     ['M10 3.5a6.5 6.5 0 1 1-6.19 4.5', 'M3.2 3.4v4h4'],
  reframe:   ['M3.5 7V4.5a1 1 0 0 1 1-1H7', 'M13 3.5h2.5a1 1 0 0 1 1 1V7',
              'M16.5 13v2.5a1 1 0 0 1-1 1H13', 'M7 16.5H4.5a1 1 0 0 1-1-1V13'],
  wind:      ['M2.5 7h8.2a2.2 2.2 0 1 0-2.2-2.2', 'M2.5 10.5h11a2.2 2.2 0 1 1-2.2 2.2',
              'M2.5 14h6'],

  // Navigation and objects
  bike:      ['M5.5 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M14.5 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
              'M5.5 12.5h4l3.5-6', 'M8 6.5h3', 'M11.5 6.5l3 6'],
  layers:    ['M10 3l6.5 3.5L10 10 3.5 6.5 10 3Z', 'M3.5 10.5 10 14l6.5-3.5', 'M3.5 13.5 10 17l6.5-3.5'],
  grid:      ['M3.5 3.5h5v5h-5z', 'M11.5 3.5h5v5h-5z', 'M3.5 11.5h5v5h-5z', 'M11.5 11.5h5v5h-5z'],
  plus:      ['M10 4.5v11', 'M4.5 10h11'],
  check:     ['M4.5 10.5l3.5 3.5 7.5-8'],
  share:     ['M10 13V3.5', 'M6.5 6.5L10 3l3.5 3.5', 'M4.5 12v3a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-3'],
  user:      ['M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M4 16.5c.9-2.6 3.1-4 6-4s5.1 1.4 6 4'],
  search:    ['M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M13.5 13.5 17 17'],
};

export function icon(name, { size = 20, cls = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (cls) svg.setAttribute('class', cls);
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);

// Weight units. Grams are the only stored unit; ounces and pounds are derived
// at the edge, so a round trip through the owner's sheet (ounces to one
// decimal) never drifts.

export const G_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;

export const gToOz = (g) => g / G_PER_OZ;
export const ozToG = (oz) => oz * G_PER_OZ;

/** Round to one decimal without the 0.1 + 0.2 garbage. */
export const r1 = (x) => Math.round(x * 10) / 10;
export const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Format a weight for display. `unit` is 'metric' | 'imperial'.
 * Small things read in the small unit, big things in the big one: a spork is
 * 28 g, a loaded bike is 28.4 kg. Never "0.03 kg".
 */
export function fmtWeight(g, unit = 'metric', { big = null } = {}) {
  if (!Number.isFinite(g)) return '–';
  if (unit === 'imperial') {
    const oz = gToOz(g);
    const useLb = big ?? oz >= 32;
    if (useLb) return `${r2(oz / OZ_PER_LB).toFixed(1)} lb`;
    return `${oz >= 10 ? Math.round(oz * 10) / 10 : r1(oz)} oz`;
  }
  const useKg = big ?? g >= 1000;
  if (useKg) return `${(g / 1000).toFixed(g >= 10000 ? 1 : 2)} kg`;
  return `${Math.round(g)} g`;
}

/** Just the number and unit split, for typesetting the unit one ink down. */
export function weightParts(g, unit = 'metric', opts) {
  const s = fmtWeight(g, unit, opts);
  const i = s.lastIndexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

export const fmtLitres = (l) => (Number.isFinite(l) ? `${l >= 10 ? Math.round(l) : r1(l)} L` : '–');

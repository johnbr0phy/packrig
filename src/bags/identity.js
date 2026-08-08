// Per-product identity: the deterministic seed/jitter source, the normalised
// feature block, and colourway resolution.

// ---- per-product identity ------------------------------------------------
// Two bags from the same catalogue slot should never be mistaken for each
// other. Everything that varies — noise, taper, strap spacing, patch placement
// — is driven off a hash of the product's identity, so it is stable across
// reloads but different for every model and size.

export function productSeed(brand, p) {
  const s = `${brand?.name || ''}|${p?.line || ''}|${p?.name || ''}|${p?.size || ''}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic per-product jitter source. */
export function variantOf(brand, p) {
  const seed = productSeed(brand, p);
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    rnd,
    /** symmetric jitter in ±m */
    j: (m) => (rnd() * 2 - 1) * m,
    /** value in [lo, hi] */
    range: (lo, hi) => lo + rnd() * (hi - lo),
    pick: (arr) => arr[Math.floor(rnd() * arr.length) % arr.length],
  };
}

/** Normalised feature block; every field is safe to read before the data lands. */
export function featuresOf(p) {
  const f = (p && p.features) || {};
  return {
    closure: f.closure || null,
    pockets: Array.isArray(f.pockets) ? f.pockets : [],
    daisyChains: !!f.daisyChains,
    compressionStraps: Number.isFinite(f.compressionStraps) ? Math.max(0, Math.min(6, f.compressionStraps)) : null,
    cord: !!f.cord,
    reflective: !!f.reflective,
    valve: !!f.valve,
    shape: f.shape || null,
    colorways: Array.isArray(f.colorways) && f.colorways.length ? f.colorways : null,
  };
}

/**
 * Normalised measured-geometry block; every field is safe to read before the
 * data lands, and every field is `null` when the record says nothing.
 *
 * This is the half of `data/models/*.json` the builders were missing. 697 of
 * 702 products carry a `geometry` block written from product photos — the
 * silhouette family, the cross-section, whether the shoulder is squared or
 * rounded, and a measured nose→tail taper — and until `apply-models.mjs`
 * started merging it, every builder invented all of it with `vr.range()`.
 * BUILDER-BRIEF §4: variation must be driven by the data.
 *
 * **A null is not a licence to guess wildly.** Fall back to the same narrow
 * `vr.range()` you would have used, so an unmeasured product still varies
 * deterministically — but where `taperRatio` exists, use it.
 */
export function geomOf(p) {
  const g = (p && p.geometry) || {};
  const t = g.taper && typeof g.taper === 'object' ? g.taper : null;
  const nose = Number.isFinite(t?.nose) && t.nose > 0 ? t.nose : null;
  const tail = Number.isFinite(t?.tail) && t.tail > 0 ? t.tail : null;
  return {
    form: g.form || null,
    crossSection: g.crossSection || null,
    shoulder: g.shoulder || null,
    profile: t?.profile || null,
    /**
     * Tail extent as a fraction of the nose along the tapering axis, or null.
     * Ratio, never absolute: it survives a dimension correction underneath it.
     * 1 means no taper — a barrel — which is a real answer, not a missing one.
     */
    taperRatio: nose !== null && tail !== null ? Math.min(tail / nose, 1) : null,
  };
}

/**
 * `soft` | `semi` | `rigid` — how much the shell should deform.
 *
 * Ortlieb's stiffened back plate, Tailfin's carbon space frame and Topeak's
 * moulded shells are not sacks, and rendering them with the same pillow bulge
 * as a Cordura drybag is the difference BUILDER-BRIEF §4 calls "structure".
 * Absent means soft, which is what every builder assumed before this existed.
 */
export function stiffnessOf(p) {
  const s = p && p.structure;
  return s === 'rigid' || s === 'semi' ? s : 'soft';
}

/** Resolve body/accent colours: colorways win, product.colors is the fallback. */
const hexToInt = (h) => (typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16));

export function colorwayFor(brand, product, index = 0) {
  const ways = product?.features?.colorways;
  if (Array.isArray(ways) && ways.length) {
    const cw = ways[((index % ways.length) + ways.length) % ways.length];
    if (cw && cw.main != null) return { main: cw.main, accent: cw.accent ?? cw.main, name: cw.name };
    // verification records use { name, hex } — without this the ~1800 colourways
    // scraped from the makers' own pages are silently ignored
    if (cw && cw.hex != null) {
      const main = hexToInt(cw.hex);
      if (Number.isFinite(main)) {
        return { main, accent: cw.accentHex != null ? hexToInt(cw.accentHex) : main, name: cw.name };
      }
    }
    if (typeof cw === 'string') {
      const main = hexToInt(cw);
      if (Number.isFinite(main)) return { main, accent: main, name: null };
    }
  }
  return {
    main: product?.colors?.[0] ?? brand?.palette?.[0] ?? 0x3b3f45,
    accent: product?.colors?.[1] ?? brand?.palette?.[1] ?? product?.colors?.[0] ?? 0x2a2d31,
    name: null,
  };
}

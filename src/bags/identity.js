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

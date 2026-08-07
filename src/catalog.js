/** Loads the researched brand catalog and normalizes it for the bag system. */

// Short display names for patches / compact UI
const SHORT = {
  'Revelate Designs': 'Revelate',
  'Salsa (EXP Series)': 'Salsa EXP',
  'Blackburn Design': 'Blackburn',
  'Swift Industries': 'Swift',
  'Road Runner Bags': 'Road Runner',
  'Outer Shell Adventure': 'Outer Shell',
  'Brooks England': 'Brooks',
  'Chrome Industries': 'Chrome',
  'Specialized x Fjällräven': 'Spec/Fjällräven',
  'Straight Cut Design': 'Straight Cut',
  'Rogue Panda Designs': 'Rogue Panda',
  'Buckhorn Bags': 'Buckhorn',
  'Bags by Bird': 'Bags by Bird',
  'Wizard Works': 'Wizard Works',
  'Oveja Negra': 'Oveja Negra',
  'Miss Grape': 'Miss Grape',
};

const FABRIC_KEY = (s = '') => {
  const t = s.toLowerCase();
  if (t.includes('x-pac') || t.includes('xpac') || t.includes('ecopak')) return 'xpac';
  if (t.includes('tpu') || t.includes('welded') || t.includes('tarp')) return 'tpu';
  if (t.includes('wax') || t.includes('canvas') || t.includes('leather') || t.includes('vinylon')) return 'waxed';
  return 'cordura';
};

export async function loadCatalog() {
  const res = await fetch('./data/brands.json');
  const brands = await res.json();
  brands.forEach((b, bi) => {
    b.index = bi;
    b.short = SHORT[b.name] || b.name;
    b.fabricKey = FABRIC_KEY(b.fabric);
    b.products.forEach((p, pi) => {
      p.index = pi;
      p.brandIndex = bi;
      if (!p.slot) p.slot = 'seatpack';
      // ensure sane dims in mm
      const d = p.dims_cm || {};
      p.mm = {
        len: (d.len || 25) * 10,
        wid: (d.wid || d.dia || 12) * 10,
        hgt: (d.hgt || d.dia || 12) * 10,
        dia: (d.dia || Math.min(d.wid || 14, d.hgt || 14)) * 10,
      };
    });
  });
  return brands;
}

/**
 * Some bags only fit a specific platform — the Wizard Works x Brompton Leyline
 * bolts to Brompton's proprietary front carrier block and cannot mount on a
 * drop-bar gravel frame at all. Offering it here is simply wrong.
 */
const fitsThisBike = (p) => !p.fits || p.fits === 'universal';

export function productsForSlot(catalog, slot) {
  const out = [];
  for (const b of catalog) {
    for (const p of b.products) {
      if (!fitsThisBike(p)) continue;
      // barbag products can mount to the barroll slot; trunk covers rack top
      if (p.slot === slot) out.push({ brand: b, product: p });
    }
  }
  return out;
}

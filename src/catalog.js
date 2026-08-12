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
  // Was 'Specialized x Fjällräven' → 'Spec/Fjällräven'. Renamed to Fjällräven
  // on 8 Aug: all six products are Fjällräven's own Hoja line, sold on
  // fjallraven.com, and the reviewer found no Specialized text, logo or S-mark
  // in any of the ~16 product photos or in the copy on any of the six pages.
  'Fjällräven': 'Fjällräven',
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

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadCatalog() {
  const res = await fetch('./data/brands.json');
  const brands = await res.json();
  // Silhouettes measured off the maker's own photographs by tools/silhouette.mjs.
  // Optional: a product with no measured profile falls back to the builder's
  // parametric curve, so this file can be built up a slot at a time.
  const profiles = await fetch('./data/profiles.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  // Outlines measured off the maker's own DIMENSIONED ENGINEERING DRAWING by
  // tools/diagram-outline.mjs, and preferred over the photo-traced ones above
  // wherever both exist. A photograph is a lit object at an unknown angle in
  // perspective; the drawing is orthographic, unlit and dimensioned, and it
  // also yields the plan-view width profile, which photographs almost never do.
  const diagrams = await fetch('./data/diagram-profiles.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  /*
   * A render of every bag that ships no photograph.
   *
   * 201 of 702 products have no image at all — small makers, discontinued
   * models, and a long tail nobody photographed — and everywhere the app showed
   * a bag it had to show a coloured plate instead. tools/bag-portraits.mjs
   * renders each of them from its own measured record, in the app's own
   * lighting, and this folds the result into `images` so every call site that
   * already reads a photograph picks it up without knowing the difference.
   *
   * It goes in LAST and never overwrites: a real photograph of the real product
   * always beats a render of our model of it.
   */
  const portraits = await fetch('./data/portraits.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const portraitKey = (brandName, p) => [brandName, p.line, p.name, p.size]
    .filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  brands.forEach((b, bi) => {
    b.index = bi;
    b.short = SHORT[b.name] || b.name;
    b.fabricKey = FABRIC_KEY(b.fabric);
    b.products.forEach((p, pi) => {
      p.index = pi;
      p.brandIndex = bi;
      if (!p.slot) p.slot = 'seatpack';
      if (!p.images?.length) {
        const shot = portraits[portraitKey(b.short, p)] || portraits[portraitKey(b.name, p)];
        // `rendered` so the UI can be honest about what it is showing when it
        // matters — a spec sheet should not imply a photograph exists.
        if (shot) { p.images = [shot]; p.rendered = true; }
      }
      // ensure sane dims in mm
      const d = p.dims_cm || {};
      // `dims_cm` is the honest published record and is what the spec table
      // shows. It is not always what should be DRAWN: Tailfin publish only a
      // 42cm unrolled height for the CargoPack, but in every on-bike photo the
      // roll is turned down three times and it stands ~23cm. Where a reviewer
      // has established the drawn height it lands in `render.hgt_cm`, and that
      // is what the geometry gets. See data/models/MODEL-SPEC.md.
      // Any axis can be the variable one. `render.hgt_cm` covered roll-tops that
      // roll vertically, but a bar bag whose side-rolls open along the bar, or a
      // seat pack that rolls along its length, has the same problem on a
      // different axis — and with nowhere to put the drawn figure, reviewers were
      // overwriting dims_cm and losing the published record. All three now.
      const drawLen = p.render?.len_cm ?? d.len;
      const drawWid = p.render?.wid_cm ?? d.wid;
      const drawHgt = p.render?.hgt_cm ?? d.hgt;
      p.mm = {
        len: (drawLen || 25) * 10,
        wid: (drawWid || d.dia || 12) * 10,
        hgt: (drawHgt || d.dia || 12) * 10,
        dia: (d.dia || Math.min(drawWid || 14, drawHgt || 14)) * 10,
      };
      // Measured shape, published scale. The profile is peak-normalised, so it
      // says nothing about size — the builder still takes every dimension from
      // the catalogue and uses this only for the curve between them.
      const key = slugify([b.name, p.line, p.name, p.size].filter(Boolean).join(' '));
      const prof = diagrams[key] || profiles[key];
      if (prof?.profile?.length) p.profile = prof;
    });
  });
  return brands;
}

/**
 * Some bags only fit a specific platform — the Wizard Works x Brompton Leyline
 * bolts to Brompton's proprietary front carrier block and cannot mount on a
 * drop-bar gravel frame at all. Offering it here is simply wrong.
 */
// `fits` records what a bag needs in order to mount, and most values describe
// hardware this frame HAS — `rack_only` is simply a pannier, and we draw a rack.
// The old rule was "anything not 'universal' cannot fit", which was safe while
// exactly one product carried the field; the moment tools/apply-models.mjs
// merged the reviewers' notes it silently hid 37 products instead of 1, 30 of
// them wrongly. Only these values mean the bag genuinely cannot go on this bike.
const CANNOT_FIT = new Set([
  'brompton',   // proprietary front carrier block
  'basket',     // needs a wire front basket we do not model (see HANDOVER.md)
  'none',       // an insert or an add-on that mounts to another bag, not the bike
]);
const fitsThisBike = (p) => !p.fits || !CANNOT_FIT.has(String(p.fits).trim().toLowerCase());

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

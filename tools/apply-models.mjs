/**
 * Merges the per-brand fidelity records in data/models/*.json into the
 * catalogue the app actually reads, data/brands.json.
 *
 * Why this exists: the brand review agents write dimension corrections and a
 * `render` block into data/models/. Nothing in src/ reads data/models/, so
 * until this runs, none of that work reaches the screen. As of writing, 113
 * products carried a corrected dims_cm the app had never seen and 110 carried a
 * render.hgt_cm that nothing applied.
 *
 * What it merges, per product matched on (line, name, size):
 *   dims_cm   — the reviewer's corrected published dimensions
 *   render    — the height the bag should be DRAWN at, where that differs
 *   fits      — platform restriction, so the resolver can filter it
 *   geometry  — form / crossSection / taper / shoulder: the measured shape.
 *               Carried since 8 Aug; before that the builders guessed all of it
 *               with `vr.range()` while 702 records sat on disk holding the
 *               measured values. `geometry.notes` is NOT carried — it is prose
 *               for a human, and it would add ~180 KB to a file the browser
 *               downloads.
 *   axes      — mount.axes: which world direction each of len/wid/hgt points.
 *               697 of 702 records carry it and BUILDER-BRIEF Rule 2 calls it
 *               the block that "decides orientation", yet every builder was
 *               hard-coding one mapping for its whole slot. That is a 90-degree
 *               transposition for any product that disagrees, which is the
 *               documented buildSaddlebag "suitcase" bug.
 *   structure — soft | semi | rigid, derived by tools/lib/stiffness.mjs from
 *               what the records say in prose. Only `semi` and `rigid` are
 *               written; absent means soft, which is what the renderer has
 *               always assumed.
 * What it only REPORTS, never applies:
 *   slot_should_be — reslotting moves a bag to a different anchor entirely.
 *                    That is a decision, not a merge.
 *
 *   node tools/apply-models.mjs --dry        # show what would change
 *   node tools/apply-models.mjs              # write it, after a backup
 *   node tools/apply-models.mjs --stiffness  # every non-soft call and its evidence
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './lib/stiffness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const STIFF_REPORT = process.argv.includes('--stiffness');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
// The joiner is a NUL so a size of 'A B' can never collide with a name of
// 'A' plus size 'B'. Written as an escape rather than as the literal byte:
// a literal NUL makes this whole file read as binary, and `grep` then skips
// it in SILENCE. Three separate searches for merge fields in here came back
// empty for that reason and not because the fields were missing.
const key = (p) => [p.line, p.name, p.size].map((x) => String(x ?? '').trim()).join('\u0000');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const brands = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));

let matched = 0, dimsChanged = 0, renderSet = 0, fitsSet = 0, attachSet = 0, unmatched = 0, looseJoins = 0;
let geomSet = 0, taperSet = 0, axesSet = 0, closureSet = 0;
const unmatchedNames = [];
const reslot = [];
const changes = [];
const stiff = [];
const stiffCounts = { soft: 0, semi: 0, rigid: 0 };

// Geometry vocabulary, from data/models/MODEL-SPEC.md. A term outside it is a
// reviewer typo or an invention, and a builder switching on it would silently
// fall through to its default — so drop it loudly instead of carrying it.
const FORMS = new Set(['tapered_wedge', 'horseshoe', 'cylinder', 'truncated_cylinder', 'box',
  'rounded_box', 'halfmoon', 'teardrop', 'trapezoid_panel', 'triangle_panel', 'slab', 'holster',
  'cage_pack', 'barrel', 'saddlebag_flap', 'basket_box', 'bucket']);
const SECTIONS = new Set(['round', 'oval', 'rounded_rect', 'd_shape', 'flat_bottom', 'flat_back', 'teardrop']);
const SHOULDERS = new Set(['squared', 'rounded', 'none', 'pointed', 'chamfered']);
const PROFILES = new Set(['linear', 'concave', 'convex', 'curved']);
// geometry.topLine — deliberately NOT reusing PROFILES, which describes the
// curve of a taper between two ends. This names which shape family the top
// edge belongs to, which is a different question with a different answer.
const TOP_LINES = new Set(['stepped', 'continuous']);
// mount.axes vocabulary, MODEL-SPEC "Axis convention". The `along_*` values name
// a tube rather than a world direction; they are carried through verbatim and it
// is the builder's job to resolve them against the bike.
const CLOSURES = new Set(['rolltop', 'zip_horseshoe', 'zip_straight', 'zip_dual_slider',
  'zip_two_way', 'flap_buckle', 'flap_strap', 'drawcord', 'magnetic', 'velcro',
  'hook_and_loop_flap', 'clamshell']);
const AXES = new Set(['x', '+x', '-x', 'y', '+y', '-y', 'z', '+z', '-z',
  'along_downtube', 'along_toptube', 'along_seattube', 'along_forkleg', 'along_bar',
  // The axis standing OFF a tube. Without these a bag on a raked tube has no
  // honest label for its depth and the record has to lie with `y` — see
  // MODEL-SPEC "mount.axes" for what that cost.
  'perp_downtube', 'perp_toptube', 'perp_seattube', 'perp_forkleg']);
const offVocab = [];

/** The axis mapping, validated. Any of len/wid/hgt may be absent. */
function axesFor(mp, label) {
  const a = mp.mount && mp.mount.axes;
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const k of ['len', 'wid', 'hgt']) {
    const v = a[k];
    if (v == null) continue;
    if (!AXES.has(String(v))) { offVocab.push(`${label}: mount.axes.${k} = "${v}"`); continue; }
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The machine-readable part of a `geometry` block, validated. `notes` is
 * deliberately dropped: it is the field the Apidura seat pack got backwards
 * (it calls the bag deepest at the saddle; it is deepest at the raised tail),
 * so it is a thing for a human to read against a photo, not a thing to ship.
 */
function geometryFor(mp, label) {
  const g = mp.geometry;
  if (!g || typeof g !== 'object') return null;
  const out = {};
  const take = (key, set, val) => {
    if (val == null) return;
    if (!set.has(val)) { offVocab.push(`${label}: geometry.${key} = "${val}"`); return; }
    out[key] = val;
  };
  take('form', FORMS, g.form);
  take('crossSection', SECTIONS, g.crossSection);
  take('shoulder', SHOULDERS, g.shoulder);
  // Construction flags: booleans, so they carry no vocabulary to validate.
  // `sleeve` means a Hypalon sleeve wraps the lower body with the roll section
  // above it in the other colour. It exists so a builder can ask the RECORD
  // about construction instead of matching on a maker's line name — downtube.js
  // used to test `/backcountry/i.test(p.line)`, which handed one brand's
  // construction to any other brand using that word and withheld it from every
  // brand that builds the same way.
  //
  // Note for the next person adding a field: this whitelist is why writing a
  // new key into data/models/*.json is not enough. Anything not taken here is
  // dropped silently, the builder reads undefined, and the feature simply does
  // not appear — with no error anywhere. That cost two attempts to notice.
  if (typeof g.sleeve === 'boolean') out.sleeve = g.sleeve;
  // WHERE ALONG ITS LENGTH the bag is deepest, as a fraction from the mounting
  // end — 0.5 is mid-length. Added 12 Aug for framebag_half, where it decides
  // the whole silhouette and nothing could say it.
  //
  // framehalf.js derives the belly from the bike: the lower-front edge lies on
  // the down tube, so the deepest point is wherever that edge has got `hgt`
  // deep. That is measurably true of Apidura, whose six drawings it reproduces
  // to within 5%. It is false of Tailfin, whose frame packs stand clear of the
  // down tube along all but the forward 15-20% and are deepest at 0.82 — and
  // the builder's own header says the belly "is not in the records and must
  // not be". That was right while one family was the only evidence and is
  // wrong now, which is what a second well-documented brand is for.
  //
  // Absent means "derive it", so no existing product changes.
  // How the top line runs, for a slot whose builder has more than one profile
  // family. Same reasoning as `belly`: absent means the builder's own default.
  take('topLine', TOP_LINES, g.topLine);
  const belly = num(g.belly);
  if (belly !== null) {
    if (belly > 0.05 && belly < 0.95) out.belly = belly;
    else offVocab.push(`${label}: geometry.belly = ${g.belly} (want a fraction in (0.05, 0.95))`);
  }
  const t = g.taper;
  if (t && typeof t === 'object') {
    const nose = num(t.nose), tail = num(t.tail);
    // A taper is a ratio pair. Anything outside (0,1] is not one, and a tail
    // WIDER than the nose on a bag whose record also says `tapered_wedge` is a
    // transposition — report it rather than drawing a bag that grows rearward.
    if (nose !== null && tail !== null && nose > 0 && tail > 0 && nose <= 1.001 && tail <= 1.001) {
      out.taper = { nose, tail };
      if (PROFILES.has(t.profile)) out.taper.profile = t.profile;
      else if (t.profile != null) offVocab.push(`${label}: geometry.taper.profile = "${t.profile}"`);
    } else if (t.nose != null || t.tail != null) {
      offVocab.push(`${label}: geometry.taper = ${JSON.stringify(t)} (not a ratio pair in (0,1])`);
    }
  }
  return Object.keys(out).length ? out : null;
}

for (const b of brands) {
  const f = join(root, 'data/models', `${slug(b.name)}.json`);
  if (!existsSync(f)) continue;
  const model = JSON.parse(readFileSync(f, 'utf8'));
  const byKey = new Map((model.products || []).map((p) => [key(p), p]));
  // Fallback join on (line, name) without `size`. Reviewers tidy the size string
  // — "(3.4L)" for the catalogue's "(3.5L)", adding "(0.9L)" where there was no
  // suffix, dropping "(sold as a pair)" — and an exact-key join then drops the
  // record silently. Only used where the normalised key identifies exactly ONE
  // on each side, so a genuine multi-size line can never be mis-joined.
  // Progressively looser join keys, each used only where it identifies exactly
  // ONE product on each side. Reviewers routinely enrich fields the catalogue
  // leaves blank — VAUDE's records add a `line` and a `size` where brands.json
  // has neither, and others tidy "(3.4L)" to "(3.5L)" — so an exact
  // (line,name,size) join drops them, silently, which is how three records were
  // lost in apply-verified.mjs.
  const norm = (x) => String(x ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  // Reviewers also add or strip the brand prefix on `name` — Cedaero's catalogue
  // says "Cedaero Fork Lift Pack" and its records say "Fork Lift Pack"; EVOC's
  // records do the opposite. Comparing with the brand stripped from both sides
  // catches either direction.
  const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Strip any leading run of words that belong to the brand name. A fixed
  // prefix is not enough: the brand is "Salsa (EXP Series)" while its catalogue
  // products are named "EXP Series Saguaro Seat Bag" — the shared part is a
  // SUBSET of the brand's words, not a prefix of them. Keep the parenthesised
  // words here (norm() drops them elsewhere) or "EXP"/"Series" are invisible.
  const brandWordSet = new Set(
    String(b.name).toLowerCase().replace(/[()]/g, ' ').split(/[^a-z0-9]+/).filter(Boolean));
  const stripBrand = (x) => {
    const w = norm(x).split(' ');
    let i = 0;
    while (i < w.length - 1 && brandWordSet.has(w[i].toLowerCase())) i++;
    return w.slice(i).join(' ').trim();
  };
  const TIERS = [
    (p) => [norm(p.line), norm(p.name), norm(p.size)].join(' ').trim(),
    // The catalogue often keeps the product line inside `name` while records
    // split it into `line` — "EXP-R Series Trillium Top Tube Bag" vs
    // line "EXP-R Series" + name "Trillium Top Tube Bag".
    (p) => [norm(p.line), norm(p.name)].join(' ').trim(),
    (p) => [norm(p.name), norm(p.size)].join(' ').trim(),
    (p) => norm(p.name),
    (p) => [stripBrand(p.name), norm(p.size)].join(' ').trim(),
    (p) => stripBrand(p.name),
  ];
  const countBy = (arr, fn) => arr.reduce((m, x) => m.set(fn(x), (m.get(fn(x)) || 0) + 1), new Map());
  const tierMaps = TIERS.map((fn) => {
    const mc = countBy(model.products || [], fn);
    const cc = countBy(b.products, fn);
    const map = new Map();
    for (const mp of model.products || []) {
      if (mc.get(fn(mp)) === 1 && cc.get(fn(mp)) === 1) map.set(fn(mp), mp);
    }
    return { fn, map };
  });
  const used = new Set();

  for (const p of b.products) {
    let mp = byKey.get(key(p));
    if (!mp) {
      for (const t of tierMaps) {
        const cand = t.map.get(t.fn(p));
        if (cand) { mp = cand; looseJoins++; break; }
      }
    }
    if (!mp) continue;
    used.add(key(mp));
    matched++;

    // ---- dims_cm ---------------------------------------------------------
    // Rewrite the triple WHOLE. Two axis-transposition bugs in this project
    // came from updating two of three values and leaving the third.
    if (mp.dims_cm && typeof mp.dims_cm === 'object') {
      const before = { ...(p.dims_cm || {}) };
      const after = {};
      for (const k of ['len', 'wid', 'hgt', 'dia']) {
        const v = num(mp.dims_cm[k]);
        if (v !== null) after[k] = v;
      }
      if (Object.keys(after).length >= 2) {          // a usable triple, not a fragment
        const differs = ['len', 'wid', 'hgt', 'dia'].some(
          (k) => (num(before[k]) ?? null) !== (num(after[k]) ?? null));
        if (differs) {
          dimsChanged++;
          changes.push({ brand: b.name, product: [p.line, p.name, p.size].filter(Boolean).join(' '), before, after });
          if (!DRY) p.dims_cm = after;
        }
      }
    }

    // ---- render ----------------------------------------------------------
    // Any axis can be the variable one, not just height — see catalog.js.
    if (mp.render) {
      const r = {};
      for (const k of ['len_cm', 'wid_cm', 'hgt_cm']) {
        const v = num(mp.render[k]);
        if (v !== null) r[k] = v;
      }
      if (Object.keys(r).length) {
        renderSet++;
        if (mp.render.rolls) r.rolls = mp.render.rolls;
        if (mp.render.basis) r.basis = mp.render.basis;
        if (mp.render.conflict) r.conflict = mp.render.conflict;
        if (!DRY) p.render = r;
      }
    }

    // ---- fits ------------------------------------------------------------
    if (mp.fits && mp.fits !== p.fits) {
      fitsSet++;
      if (!DRY) p.fits = mp.fits;
    }

    // ---- features.attachment, from mount.requires -------------------------
    // What hardware a bag needs in order to hang, in the maker's own words.
    // `barroll.js` decides between a strapped pack and one held off the bar by
    // a rigid module by testing this string, and `saddlebag.js` reads it for
    // strap and seatpost cues — so a product whose catalogue entry is silent is
    // drawn strapped whatever its record says.
    //
    // All seven Tailfin bar bags were in exactly that state. Their records say
    // "the Tailfin bar harness (included in the System)" and "the Tailfin Bar
    // Cage plus its handlebar clamp bracket", and `features.attachment` was
    // null on every one, so all seven were drawn cinched around the handlebar —
    // which is the fault the owner named when he said the other brands' bags do
    // not look like the brand's products. The knowledge was in the record and
    // nothing carried it to the screen.
    //
    // ONLY written where the catalogue is silent. 114 products already carry a
    // hand-written `attachment` and those are the more specific text; this is a
    // backfill, not an overwrite.
    if (Array.isArray(mp.mount?.requires) && mp.mount.requires.length
        && !String(p.features?.attachment || '').trim()) {
      attachSet++;
      if (!DRY) {
        p.features = p.features || {};
        p.features.attachment = mp.mount.requires.join('; ');
      }
    }

    // ---- geometry --------------------------------------------------------
    const label = `${b.name} | ${[p.line, p.name, p.size].filter(Boolean).join(' ')}`;
    const geom = geometryFor(mp, label);
    if (geom) {
      geomSet++;
      if (geom.taper) taperSet++;
      if (!DRY) p.geometry = geom;
    }

    // ---- closure ---------------------------------------------------------
    // Only the type and the roll count. brands.json already has a free-text
    // `features.closure` ("rolltop with quick-release buckle") which no builder
    // can switch on; this is the controlled-vocabulary twin.
    if (mp.closure && CLOSURES.has(mp.closure.type)) {
      closureSet++;
      if (!DRY) {
        p.closure = { type: mp.closure.type };
        if (num(mp.closure.rolls) !== null) p.closure.rolls = num(mp.closure.rolls);
      }
    } else if (mp.closure && mp.closure.type != null) {
      offVocab.push(`${label}: closure.type = "${mp.closure.type}"`);
    }

    // ---- mount.axes ------------------------------------------------------
    const ax = axesFor(mp, label);
    if (ax) {
      axesSet++;
      if (!DRY) p.axes = ax;
    }

    // ---- structure -------------------------------------------------------
    const st = classify(mp);
    stiffCounts[st.structure]++;
    if (st.structure !== 'soft') {
      stiff.push({ label, slot: p.slot, ...st });
      if (!DRY) p.structure = st.structure;
    } else if (!DRY) {
      delete p.structure;   // a record downgraded to soft must not leave a stale flag
    }

    if (mp.slot_should_be && mp.slot_should_be !== p.slot) {
      reslot.push(`${b.name} | ${[p.line, p.name, p.size].filter(Boolean).join(' ')}: ${p.slot} -> ${mp.slot_should_be}`);
    }
  }
  for (const k of byKey.keys()) if (!used.has(k)) { unmatched++; unmatchedNames.push(`${b.name} | ${k}`); }
}

console.log(`matched            ${matched}`);
console.log(`dims_cm rewritten  ${dimsChanged}`);
console.log(`render.hgt_cm set  ${renderSet}`);
console.log(`fits set           ${fitsSet}`);
console.log(`attachment set     ${attachSet}  (backfilled from mount.requires where the catalogue was silent)`);
console.log(`geometry merged    ${geomSet}   (of which ${taperSet} carry a taper)`);
console.log(`mount.axes merged  ${axesSet}`);
console.log(`closure merged     ${closureSet}`);
console.log(`structure          ${stiffCounts.rigid} rigid · ${stiffCounts.semi} semi · ${stiffCounts.soft} soft`);
console.log(`joined on (line,name) after size mismatch  ${looseJoins}`);
console.log(`model records with no catalogue match  ${unmatched}`);
// Never let these vanish silently -- three data losses in apply-verified.mjs
// happened exactly this way.
for (const n of unmatchedNames) console.log(`   UNMATCHED  ${n}`);

if (changes.length) {
  console.log('\n-- dimension changes (first 20) --');
  for (const c of changes.slice(0, 20)) {
    const fmt = (o) => ['len', 'wid', 'hgt', 'dia'].filter((k) => o[k] != null).map((k) => `${k} ${o[k]}`).join('  ');
    console.log(`  ${c.brand} | ${c.product}\n     was  ${fmt(c.before)}\n     now  ${fmt(c.after)}`);
  }
  if (changes.length > 20) console.log(`  … and ${changes.length - 20} more`);
}

if (offVocab.length) {
  console.log(`\n-- geometry terms outside MODEL-SPEC's vocabulary, dropped (${offVocab.length}) --`);
  for (const o of offVocab) console.log(`  ${o}`);
}

if (STIFF_REPORT) {
  console.log(`\n-- structure, every non-soft call with the sentence that decided it (${stiff.length}) --`);
  for (const s of stiff.sort((a, b) => a.label.localeCompare(b.label))) {
    console.log(`  ${s.structure.toUpperCase().padEnd(5)} ${s.slot.padEnd(14)} ${s.label}`);
    console.log(`        ${s.source}: ${String(s.why || '').slice(0, 140)}`);
  }
} else if (stiff.length) {
  console.log(`\n${stiff.length} products classified semi/rigid — 'node tools/apply-models.mjs --stiffness' for the evidence behind each.`);
}

if (reslot.length) {
  console.log(`\n-- slot_should_be, NOT applied (${reslot.length}) — decide these deliberately --`);
  for (const r of reslot) console.log(`  ${r}`);
}

if (DRY) {
  console.log('\n--dry: nothing written.');
} else {
  const backup = join(root, 'data/brands.beforemodels.json');
  if (!existsSync(backup)) {
    copyFileSync(join(root, 'data/brands.json'), backup);
    console.log(`\nbackup -> ${backup}`);
  } else {
    console.log(`\nbackup already exists, left alone -> ${backup}`);
  }
  writeFileSync(join(root, 'data/brands.json'), JSON.stringify(brands, null, 1));
  console.log('data/brands.json written. Re-run the clearance audits: dimensions moved.');
}

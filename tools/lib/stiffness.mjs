/**
 * Derive a machine-readable structure class — soft | semi | rigid — from a
 * model record.
 *
 * WHY THIS IS A CLASSIFIER AND NOT A FIELD READ. `MODEL-SPEC.md` never gave
 * reviewers a place to record rigidity, so they wrote it in prose, in whichever
 * key seemed apt: `details.rigid_structure`, `details.stiffener`,
 * `details.structure`, `details.backPlate`, `geometry.notes`, `mount.notes`.
 * 131 products say something about it. Nothing can read prose, so nothing did.
 *
 * The reason this is not a keyword grep: the single most common thing these
 * records say about rigidity is that the *hardware* is rigid and the *bag* is
 * not. Thule's Shield pannier — "This rail/clip assembly is RIGID and must not
 * be run through the soft-bag deform pass, even though the bag body it's bonded
 * to is soft" — would be classified backwards by any grep for /rigid/, and
 * Thule's Shield bags are exactly the drybag-limp panniers that most need the
 * deform pass.
 *
 * So: work sentence by sentence, require a claim about the BODY's shape rather
 * than the mere word "rigid", and let a negative in the same sentence veto a
 * positive in it. Default is `soft` — the state the renderer has always
 * assumed — so a record that says nothing changes nothing.
 *
 * This is a bootstrap, not the destination. The destination is
 * `details.structure_class` written deliberately by a reviewer; where that
 * field exists it is used verbatim and none of the prose matching runs.
 */

export const RANK = { soft: 0, semi: 1, rigid: 2 };
const VALID = new Set(['soft', 'semi', 'rigid']);

// Sentences whose subject is bolt-on hardware, not the bag. Tailfin's
// `rigid_structure` field is largely about racks, harnesses and cages, which
// are genuinely rigid and genuinely not the fabric body.
const HARDWARE_SUBJECT = [
  /\b(the )?(rack|harness|holster|yoke|cargo cage|bar cage|cage|bracket|rail|clip assembly|mount|mounting (plate|rail|hardware|bracket)|cradle|clamp|dock|arm|x-clamp|v-mount)\b[^.;]{0,40}\b(is|are) (an? )?(rigid|hard|moulded|molded|hard-shell)/i,
  /\brail\/clip assembly\b/i,
];

// The regex above needs the adjective to follow the noun closely. Restrap's
// "The holster is an OPEN horseshoe - a hard-shell X-Pac/TPX yoke that clamps
// to the saddle rails" slips past it and reads as a hard-shell bag, when the
// bag is the soft drybag that drops into that holster. So also test the
// sentence's opening clause: if what it is ABOUT is bolt-on hardware and the
// fabric is not mentioned, nothing in it describes the body.
const HW_NOUN = /\b(holster|harness|rack|cradle|yoke|bracket|cage|clamp|rail|mount|dock|arm|batten|rod|x-clamp|v-mount|boa)\b/i;
const BODY_NOUN = /\b(bag|body|shell|pack|panel|pouch|tube|drybag|sack|fabric|wedge|box)\b/i;
const hardwareSubject = (s) => {
  if (HARDWARE_SUBJECT.some((r) => r.test(s))) return true;
  const lead = s.split(/\s+/).slice(0, 8).join(' ');
  return HW_NOUN.test(lead) && !BODY_NOUN.test(lead);
};

// A same-sentence veto. Deliberately whole phrases: a bare /soft/ or /floppy/
// would veto Cedaero's "should render close to rigid, not deformed like a
// floppy pouch", which is a positive.
const NEGATIVE = [
  /\bbag body (itself )?is (a |an )?(soft|pliable|deformable)/i,
  /\bbody it'?s bonded to is soft/i,
  /\bonly the (mounting )?hardware\b/i,
  /\b(is|are) the (one|only) genuinely (soft|floppy|non-structured|unstructured)/i,
  /\bthe only genuinely (soft|floppy|non-structured|unstructured)/i,
  /\bthe rigidity is concentrated in the mounting hardware/i,
  /\bshould (go|be run) through the (geometry layer'?s )?soft-bag (pass|deform pass)/i,
  /\bdeformable\b/i,
];

// A sentence that says something structural about the body but also says the
// body is fabric. Caps at `semi` rather than vetoing: "semi-structured (holds
// its cylindrical shape well even unpacked) but soft-sided" is a real
// description of a real bag, and `semi` is what it means.
const SOFT_SIDED = [
  /\bsoft[- ]sided\b/i,
  /\bsoft drybag\b/i,
  /\brigid[- ]adjacent\b/i,
];

// Full rigidity. Only a renderer-facing directive or an unqualified whole-body
// claim gets here. `no sag` deliberately is NOT in this list — in these records
// it almost always describes how the MOUNT holds the bag still, not whether the
// fabric deforms, and it fired on a Blackburn top tube bag that "straps down
// flush with no sag" and on every Tailfin bag whose rack simply doesn't move.
const RIGID = [
  /\b(should |must )?not be (run )?through the soft-bag deform pass/i,
  /\bdo not run this product through the soft-bag deform pass/i,
  /\brender (close to |as |it )?rigid\b/i,
  /\brigid structured (box|shell)\b/i,
  /\bgenuinely rigid\b/i,
  /\bhard[- ]shell (construction|design|lid|body|shell)?\b/i,
  /\bhard shell\b/i,
];

// Structured but still fabric: holds a shape, with some give.
const SEMI = [
  /\bsemi[- ]rigid\b/i,
  /\bsemi[- ]structured\b/i,
  /\bself[- ]supporting\b/i,
  /\bholds? (its|a|the) (own )?(shape|silhouette|form|profile)\b/i,
  /\bholds? shape\b/i,
  /\bdoes ?n[o']?t (sag|collapse|flop|balloon)\b/i,
  /\bwill not (sag|wag|collapse|flop)\b/i,
  /\bstop(s)? (it )?(flopping|bulging)\b/i,
  /\bkeeps? (its|the) shape\b/i,
  /\bminimal sag\b/i,
  /\bno sag\b/i,
  /\bdo ?n[o']?t (deform|sag)\b/i,
  /\b(internal|integral) (carbon|alloy|aluminium|aluminum) (space ?frame|frame|rod)/i,
  /\bstructured shell\b/i,
];

/** Every string a rigidity claim has ever been written into, flattened. */
function claimText(p) {
  const out = [];
  const push = (v) => { if (typeof v === 'string' && v.length > 3) out.push(v); };
  push(p?.geometry?.notes);
  for (const v of Object.values(p?.details || {})) {
    if (typeof v === 'string') push(v);
    else if (v && typeof v === 'object') for (const w of Object.values(v)) push(w);
  }
  push(p?.mount?.notes);
  push(p?.closure?.hardware);
  return out;
}

const sentences = (s) => s.split(/(?<=[.;])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * @returns {{ structure: 'soft'|'semi'|'rigid', why: string|null, source: string }}
 *   `why` is the sentence that decided it, so every classification is
 *   traceable back to a line a human wrote.
 */
export function classify(p) {
  const explicit = p?.details?.structure_class;
  if (typeof explicit === 'string' && VALID.has(explicit)) {
    return { structure: explicit, why: 'details.structure_class', source: 'declared' };
  }
  let best = { structure: 'soft', why: null, source: 'default' };
  for (const block of claimText(p)) {
    for (const s of sentences(block)) {
      if (NEGATIVE.some((r) => r.test(s))) continue;
      if (hardwareSubject(s)) continue;
      const capped = SOFT_SIDED.some((r) => r.test(s));
      const hit = !capped && RIGID.some((r) => r.test(s)) ? 'rigid'
        : SEMI.some((r) => r.test(s)) || (capped && RIGID.some((r) => r.test(s))) ? 'semi' : null;
      if (hit && RANK[hit] > RANK[best.structure]) best = { structure: hit, why: s, source: 'prose' };
    }
  }
  return best;
}

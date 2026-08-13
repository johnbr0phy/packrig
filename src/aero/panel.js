// The wind-tunnel HUD: a glass panel on the right that reports what the
// measurement engine found. Built against CONTRACT.md — see AeroResult there.
//
// index.js pre-computes `grade` and `totalW` and folds them into the
// `comparison` object passed to update(), so this module only reads them.
// The one thing it still derives itself is the per-part watts breakdown for
// the waterfall — index.js has no reason to compute that, only the panel
// needs it — via model.js's `power()`. `ASSUMPTIONS` is also pulled straight
// from model.js since it's a static list nothing else needs to touch.
import { power, ASSUMPTIONS } from './model.js';
import { icon } from '../ui/v2/icons.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** Same as el() but sets textContent — use for anything numeric or catalog-derived. */
const elt = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// keys that are the bike itself, not something you can leave at home
const RESERVED = new Set(['bike', 'wheels', 'rider']);

const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Tweens the text of a node from its last committed value to `to`, formatting
 * with `fmt(v)` on every frame. State lives on the node itself (this module
 * owns these nodes exclusively) so no external bookkeeping is needed.
 */
function tweenText(node, to, fmt) {
  if (node._raf) cancelAnimationFrame(node._raf);
  const from = node._val ?? to;
  node._val = to;
  if (REDUCE_MOTION.matches || from === to) {
    node.textContent = fmt(to);
    return;
  }
  const dur = 420;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - t) ** 3; // ease-out cubic
    node.textContent = fmt(from + (to - from) * e);
    node._raf = t < 1 ? requestAnimationFrame(step) : null;
    if (t >= 1) node.textContent = fmt(to);
  };
  node._raf = requestAnimationFrame(step);
}

/**
 * Sign a number from the number itself — never a hardcoded glyph, which
 * double-signs the moment the value can go negative (a kit that measures as
 * reducing drag, e.g. a lone frame bag near zero). Rounds before deciding the
 * sign so 0 (and -0) always render as a plain "0" / "0.0", never "-0"/"+0",
 * and `negative` is decided off that same rounded value so a number that
 * displays as "0.0" never claims a negative-only label alongside it.
 */
function signInfo(v, decimals = 0) {
  const rounded = Number((Number.isFinite(v) ? v : 0).toFixed(decimals));
  if (rounded === 0) return { text: (0).toFixed(decimals), negative: false };
  return { text: `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(decimals)}`, negative: rounded < 0 };
}

/**
 * A tweenText formatter for a delta-item: writes the signed number and, as a
 * side effect, flips the item's label to match — every frame, same as the
 * number, so a value crossing zero mid-tween never leaves a stale label
 * ("less power" sitting under a number that already ticked back positive).
 */
function signedFmt(item, decimals) {
  return (v) => {
    const { text, negative } = signInfo(v, decimals);
    item.labelEl.textContent = negative ? item.negLabel : item.posLabel;
    return text;
  };
}

/** Linear-interpolate CdA at an arbitrary yaw from the pre-computed sweep. */
function cdaAtYaw(byYaw, deg) {
  if (!byYaw?.length) return null;
  if (deg <= byYaw[0].deg) return byYaw[0].cda;
  const last = byYaw[byYaw.length - 1];
  if (deg >= last.deg) return last.cda;
  for (let i = 0; i < byYaw.length - 1; i++) {
    const a = byYaw[i], b = byYaw[i + 1];
    if (deg >= a.deg && deg <= b.deg) {
      const t = (deg - a.deg) / (b.deg - a.deg || 1);
      return a.cda + (b.cda - a.cda) * t;
    }
  }
  return last.cda;
}

export function createAeroPanel({ onSpeedChange, onYawChange, onExit, onHoverPart } = {}) {
  const root = el('div', 'aero-panel');

  // Same exit as the menu: a labelled Close, not a bare ✕. The tunnel is a
  // level of the app, not a dialog, and a glyph that means "dismiss this
  // card" is the wrong verb for leaving a room.
  const head = el('header', 'aero-head');
  head.append(elt('span', 'aero-title', 'Wind tunnel'));
  const closeBtn = el('button', 'aero-close');
  closeBtn.type = 'button';
  closeBtn.append(el('span', null, 'Close'), icon('close', { size: 18 }));
  closeBtn.title = 'Back to the bike (Esc)';
  closeBtn.setAttribute('aria-label', 'Close wind tunnel');
  closeBtn.onclick = () => onExit?.();
  const minBtn = el('button', 'aero-min nav-min');
  minBtn.type = 'button';
  minBtn.title = 'Show the numbers';
  minBtn.setAttribute('aria-label', 'Show the numbers');
  minBtn.setAttribute('aria-expanded', 'false');
  minBtn.append(
    icon('down', { size: 18, cls: 'nav-min-dn' }),
    icon('up', { size: 18, cls: 'nav-min-up' }),
  );
  head.append(closeBtn, minBtn);
  root.append(head);

  // ---- mobile peek summary --------------------------------------------
  // Phone bottom sheet opens collapsed to just this row — the two things
  // that matter at a glance: the kit's watts cost and the single biggest
  // offender you could actually leave at home. Everything else (the full
  // CdA readout, waterfall, yaw slider, assumptions) is a tap away. This
  // module doesn't know the viewport width — aero.css hides the whole bar
  // outside the phone/coarse-pointer breakpoint, so it's built unconditionally.
  const peekBar = el('div', 'aero-peek');
  peekBar.setAttribute('role', 'button');
  peekBar.tabIndex = 0;
  peekBar.setAttribute('aria-label', 'Expand wind tunnel details');
  peekBar.setAttribute('aria-expanded', 'false');
  const peekHandle = el('div', 'peek-handle');
  const peekGrade = el('div', 'peek-grade');
  const peekLetter = elt('span', 'peek-grade-letter', '—');
  const peekName = elt('span', 'peek-grade-name', '');
  peekGrade.append(peekLetter, peekName);
  const peekBlurb = elt('p', 'peek-grade-blurb', '');
  const peekRow = el('div', 'peek-row');
  const peekCostValue = elt('span', 'peek-cost-value', '0');
  const peekCostLabel = elt('span', 'peek-cost-label', 'more power, same speed');
  const peekCost = el('div', 'peek-cost');
  peekCost.append(peekCostValue, elt('span', 'peek-cost-unit', 'W'), peekCostLabel);
  const peekOffenderName = elt('span', 'peek-offender-name', '');
  const peekOffenderWatts = elt('span', 'peek-offender-watts', '');
  const peekOffender = el('div', 'peek-offender');
  peekOffender.append(peekOffenderName, peekOffenderWatts);
  const peekChevron = elt('span', 'peek-chevron', '⌄');
  peekRow.append(peekCost, peekOffender, peekChevron);
  peekBar.append(peekHandle, peekGrade, peekBlurb, peekRow);
  root.append(peekBar);

  function setExpanded(v) {
    root.classList.toggle('expanded', !!v);
    peekBar.setAttribute('aria-expanded', String(!!v));
    minBtn.setAttribute('aria-expanded', String(!!v));
    minBtn.title = v ? 'Show less' : 'Show the numbers';
    minBtn.setAttribute('aria-label', v ? 'Show less' : 'Show the numbers');
  }
  function setMinimized(next) {
    // Peek is the compact state. A third "tucked" state hid the numbers
    // behind a chevron that people tap to open the metrics.
    if (next) setExpanded(false);
  }
  minBtn.onclick = (e) => {
    e.stopPropagation();
    setExpanded(!root.classList.contains('expanded'));
  };
  peekBar.onclick = () => setExpanded(!root.classList.contains('expanded'));
  peekBar.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!root.classList.contains('expanded')); }
  };

  const body = el('div', 'aero-body');
  root.append(body);

  // ---- 0. the grade, up top ----------------------------------------------
  // This is the headline: every other figure here moves when you change speed,
  // and the letter does not — `grade()` normalises to a reference speed, so it
  // describes the RIG. That makes it the one line worth reading first.
  const gradeSec = el('section', 'aero-sec aero-grade');
  const gradeBadge = el('div', 'grade-badge');
  const gradeLetter = elt('span', 'grade-letter', '—');
  gradeBadge.append(gradeLetter);
  const gradeCopy = el('div', 'grade-copy');
  const gradeName = elt('div', 'grade-name', '');
  const gradeBlurb = elt('div', 'grade-blurb', '');
  gradeCopy.append(gradeName, gradeBlurb);
  gradeSec.append(gradeBadge, gradeCopy);
  body.append(gradeSec);

  // ---- 1. CdA headline -------------------------------------------------
  const cdaSec = el('section', 'aero-sec aero-cda');
  const cdaRow = el('div', 'cda-row');
  const cdaPrimary = el('div', 'cda-primary');
  const cdaValue = elt('span', 'cda-value', '0.000');
  cdaPrimary.append(cdaValue, elt('span', 'cda-unit', 'm²'));
  const cdaSecondary = el('div', 'cda-secondary');
  const cdaYawValue = elt('span', 'cda-yaw-value', '0.000');
  const cdaYawWrap = el('div');
  cdaYawWrap.append(cdaYawValue, elt('span', 'cda-yaw-unit', 'm²'));
  cdaSecondary.append(cdaYawWrap, elt('span', 'cda-yaw-tag', 'yaw-weighted'));
  cdaRow.append(cdaPrimary, cdaSecondary);
  cdaSec.append(
    cdaRow,
    elt('p', 'cda-explainer',
      'CdA — drag area. The size of a flat wall of still air that would take the same power to push through. Smaller is faster.'),
  );
  body.append(cdaSec);

  // ---- 2. watts at speed -------------------------------------------------
  const wattsSec = el('section', 'aero-sec aero-watts');
  const wattsRow = el('div', 'watts-row');
  const wattsValue = elt('span', 'watts-value', '0');
  const wattsSpeedEcho = elt('span', 'watts-speed-echo', '28');
  const wattsCaption = el('span', 'watts-caption');
  wattsCaption.append(document.createTextNode('to hold '), wattsSpeedEcho, document.createTextNode(' km/h'));
  wattsRow.append(wattsValue, elt('span', 'watts-unit', 'W'), wattsCaption);

  const speedSliderRow = el('div', 'aero-slider-row');
  const speedSlider = el('input', 'aero-slider speed-slider');
  speedSlider.type = 'range';
  speedSlider.min = '15';
  speedSlider.max = '45';
  speedSlider.step = '1';
  speedSlider.value = '28';
  speedSlider.setAttribute('aria-label', 'Speed, kilometres per hour');
  // The sentence above the slider already reads "180 W to hold 28 km/h", so a
  // live echo of the same figure beside the track is the same number twice on
  // one line of sight. The track's own label is the range it covers, which is
  // the thing the sentence does not say.
  const speedReadout = elt('span', 'slider-readout speed-readout', '');
  speedSliderRow.append(speedSlider, speedReadout);
  wattsSec.append(wattsRow, speedSliderRow);
  body.append(wattsSec);

  let speedDragging = false;
  const onSpeedDown = () => { speedDragging = true; };
  const onSpeedUp = () => { speedDragging = false; };
  const onSpeedInput = () => {
    const kph = Number(speedSlider.value);
    speedReadout.textContent = '';
    wattsSpeedEcho.textContent = String(kph);
    onSpeedChange?.(kph);
  };
  speedSlider.addEventListener('pointerdown', onSpeedDown);
  speedSlider.addEventListener('pointerup', onSpeedUp);
  speedSlider.addEventListener('input', onSpeedInput);

  // ---- 3. delta vs. bare bike --------------------------------------------
  const deltaSec = el('section', 'aero-sec aero-delta');
  deltaSec.append(elt('h3', 'aero-sec-label', 'Cost of the bags'));
  const deltaGrid = el('div', 'delta-grid');
  // label flips with the value's sign — "less power" reads as self-contradictory
  // sitting under a positive number, and after the occlusion fix lands a lone
  // frame bag can still legitimately land a hair either side of zero
  function deltaItem(unit, posLabel, negLabel) {
    const item = el('div', 'delta-item');
    const value = elt('span', 'delta-value', '0');
    const labelEl = elt('span', 'delta-label', posLabel);
    item.append(value, elt('span', 'delta-unit', unit), labelEl);
    return { item, value, labelEl, posLabel, negLabel };
  }
  const dW = deltaItem('W', 'more power, same speed', 'less power, same speed');
  const dKph = deltaItem('km/h', 'slower, same effort', 'faster, same effort');
  const dMin = deltaItem('min', 'more per 100 km', 'less per 100 km');
  deltaGrid.append(dW.item, dKph.item, dMin.item);
  deltaSec.append(deltaGrid);
  body.append(deltaSec);

  // ---- 4. waterfall -------------------------------------------------------
  const wfSec = el('section', 'aero-sec aero-waterfall');
  wfSec.append(elt('h3', 'aero-sec-label', 'Where the watts go'));
  const wfList = el('div', 'wf-list');
  // shown only when result.fairingCredit is present — explained where it's set
  const wfFairingNote = elt('p', 'wf-fairing-note', '');
  wfFairingNote.hidden = true;
  wfSec.append(wfList, wfFairingNote);
  body.append(wfSec);

  const wfRows = new Map(); // key -> { row, labelEl, fill, valueEl }
  let highlightedKey = null;

  // Label + value share the top line (label wraps to 2 lines rather than
  // truncating — the bag's name is the whole point of this chart, so it
  // cannot be the thing that loses the fight for space); the bar runs the
  // full row width underneath.
  function buildWfRow(key) {
    const row = el('div', 'wf-row');
    row.dataset.key = key;
    const top = el('div', 'wf-top');
    const labelWrap = el('div', 'wf-label-wrap');
    const labelEl = elt('span', 'wf-label', '');
    // 'fixed' for the reserved bodies, 'sheltered' for a bag hidden in
    // another part's wake — mutually exclusive, so one span does both
    const tagEl = elt('span', 'wf-tag', '');
    labelWrap.append(labelEl, tagEl);
    const valueEl = elt('span', 'wf-value', '0 W');
    top.append(labelWrap, valueEl);
    const track = el('div', 'wf-track');
    const fill = el('div', 'wf-fill');
    track.append(fill);
    // explains a near-zero reading that is a real wake-shielding result, not
    // a bug — see shieldingNote()
    const noteEl = elt('p', 'wf-row-note', '');
    noteEl.hidden = true;
    row.append(top, track, noteEl);
    row.addEventListener('mouseenter', () => onHoverPart?.(key));
    row.addEventListener('mouseleave', () => onHoverPart?.(null));
    const rec = { row, labelEl, tagEl, fill, valueEl, noteEl };
    wfRows.set(key, rec);
    return rec;
  }

  /**
   * A bag whose silhouette sits almost entirely inside another part's wake
   * measures near zero — a real result of the shielding rule, not a bug, but
   * indistinguishable from one unless it says so.
   *
   * This deliberately does NOT try to name which part is doing the
   * shielding. The obvious approach — take result.parts' order and pick the
   * largest-frontalArea part ahead of this one — was tried and empirically
   * fails on the exact case in the report: it names the rider or the bare
   * frame (both large silhouettes, both often listed first) instead of the
   * actual bar roll sitting directly in front of the bag, because aggregate
   * frontal area has no notion of local adjacency. There is no field on
   * AeroResult that says WHICH part contributed to another part's wakeArea,
   * so any name picked from what IS here would be a guess dressed as a fact
   * — exactly the "confident but wrong" failure mode to avoid. If measure.js
   * starts publishing a per-part shadowedBy/occludedBy key, this can name
   * names; until then it says only what's actually known to be true.
   */
  function shieldingNote(part) {
    const frontal = part.frontalArea || 0;
    const wakeFrac = frontal > 0 ? (part.wakeArea || 0) / frontal : 0;
    const nearZero = Math.abs(part.cda) < 0.0005;
    if (wakeFrac < 0.9 && !nearZero) return null;
    return 'Sheltered by the bag ahead of it on the rig — a real result, not a bug.';
  }

  function renderWaterfall(result, ride) {
    const parts = result?.parts || [];
    // ranked on the head-on CdA, the same basis as the headline number and
    // the one CONTRACT.md guarantees parts actually sum to
    const ranked = parts
      .map((p) => ({ ...p, watts: power({ ...ride, cda: p.cda }).aeroW }))
      .sort((a, b) => b.watts - a.watts);
    const maxW = ranked.length ? ranked[0].watts : 1;
    // the "biggest offender" callout should point at something removable —
    // the frame is often the single largest bar, but you can't leave it home
    const topPart = ranked.find((p) => !RESERVED.has(p.key));
    const topKey = topPart?.key;
    const seen = new Set();

    // Mirrors the same callout into the phone peek row (see aero.css) — an
    // empty kit has no removable part at all, which is a real state (nothing
    // fitted yet), not a bug, so it reads as an empty dash rather than a
    // stale or misleading name.
    if (topPart) {
      peekOffenderName.textContent = topPart.label;
      tweenText(peekOffenderWatts, topPart.watts, (v) => `${Math.round(v)} W`);
    } else {
      peekOffenderName.textContent = 'Nothing fitted';
      peekOffenderWatts.textContent = '';
    }

    ranked.forEach((p) => {
      seen.add(p.key);
      const row = wfRows.get(p.key) || buildWfRow(p.key);
      row.labelEl.textContent = p.label;
      const isBaseline = RESERVED.has(p.key);
      // bodies (wakeArea always 0 for them) are never "sheltered" — only a
      // bag can be hidden in another part's wake
      const note = isBaseline ? null : shieldingNote(p);
      row.row.classList.toggle('baseline', isBaseline);
      row.row.classList.toggle('sheltered', !!note);
      row.row.classList.toggle('top', p.key === topKey);
      row.row.classList.toggle('hl', p.key === highlightedKey);
      row.tagEl.textContent = isBaseline ? 'fixed' : (note ? 'sheltered' : '');
      row.noteEl.textContent = note || '';
      row.noteEl.hidden = !note;
      const pct = maxW > 0 ? Math.max(2, (p.watts / maxW) * 100) : 0;
      row.fill.style.width = `${pct}%`;
      tweenText(row.valueEl, p.watts, (v) => `${Math.round(v)} W`);
      wfList.append(row.row); // re-establish rank order without rebuilding
    });

    for (const [key, row] of wfRows) {
      if (!seen.has(key)) { row.row.remove(); wfRows.delete(key); }
    }

    // The frame-bag fairing credit already lives inside `bike`'s cda by the
    // time it reaches us (index.js applies it once, upstream) — so the bike's
    // bar is already honestly smaller. All we add is the explanation, or a
    // near-zero-cost frame bag reads as a bug rather than as the nicest
    // result the whole feature produces.
    if (typeof result.fairingCredit === 'number' && result.fairingCredit !== 0) {
      const creditW = power({ ...ride, cda: Math.abs(result.fairingCredit) }).aeroW;
      wfFairingNote.textContent =
        `Closing off the frame's open triangle claws back about ${Math.round(creditW)} W from the frame's own figure above — a full frame bag rarely costs what its size suggests.`;
      wfFairingNote.hidden = false;
    } else {
      wfFairingNote.hidden = true;
    }
  }


  // ---- 6. yaw -----------------------------------------------------------
  const yawSec = el('section', 'aero-sec aero-yaw');
  const yawHead = el('div', 'aero-sec-row');
  yawHead.append(elt('h3', 'aero-sec-label', 'Crosswind yaw'));
  const yawReadout = elt('span', 'slider-readout yaw-readout', '0°');
  yawHead.append(yawReadout);
  const yawSlider = el('input', 'aero-slider yaw-slider');
  yawSlider.type = 'range';
  yawSlider.min = '0';
  yawSlider.max = '20';
  yawSlider.step = '1';
  yawSlider.value = '0';
  yawSlider.setAttribute('aria-label', 'Wind yaw angle, degrees');
  const yawCdaRow = el('div', 'yaw-cda-row');
  yawCdaRow.append(elt('span', 'yaw-cda-label', 'CdA at this yaw'), elt('span', 'yaw-cda-value', '0.000 m²'));
  yawSec.append(
    yawHead, yawSlider, yawCdaRow,
    elt('p', 'yaw-hint', 'Panniers and other boxy bags lose the most as the wind comes from the side.'),
  );
  body.append(yawSec);
  const yawCdaValueEl = yawCdaRow.querySelector('.yaw-cda-value');

  let lastResult = null;
  let yawDragging = false;
  const onYawDown = () => { yawDragging = true; };
  const onYawUp = () => { yawDragging = false; };
  const onYawInput = () => {
    const deg = Number(yawSlider.value);
    yawReadout.textContent = `${deg}°`;
    const c = cdaAtYaw(lastResult?.byYaw, deg);
    if (c != null) yawCdaValueEl.textContent = `${c.toFixed(3)} m²`;
    onYawChange?.(deg);
  };
  yawSlider.addEventListener('pointerdown', onYawDown);
  yawSlider.addEventListener('pointerup', onYawUp);
  yawSlider.addEventListener('input', onYawInput);

  // ---- 7. how this is calculated -----------------------------------------
  const assum = el('details', 'aero-sec aero-assum');
  const summary = el('summary');
  summary.append(elt('span', null, 'How this is calculated'), elt('span', 'assum-chevron', '⌄'));
  const assumList = el('ul', 'assum-list');
  assum.append(
    summary,
    elt('p', 'assum-disclaimer',
      'These Cd values come from a calibrated model tuned against reference shapes, not a physical wind-tunnel measurement.'),
    assumList,
  );
  for (const a of ASSUMPTIONS || []) {
    const li = el('li', 'assum-item');
    li.append(elt('span', 'a-label', a.label), elt('span', 'a-value', String(a.value)));
    if (a.note) li.append(elt('span', 'a-note', a.note));
    assumList.append(li);
  }
  body.append(assum);

  // ---- 8. exit ------------------------------------------------------------
  /*
   * One way out, not two.
   *
   * The panel carried a bare ✕ at the top AND a full-width "Exit wind tunnel"
   * button at the bottom, plus the toolbar toggle that opened it — three
   * exits for one state, and the full-width one was the largest control in a
   * panel whose subject is a number. The ✕ is labelled now (builder.css gives
   * `.sheet-close` and this one the menu's grammar), so the button has nothing
   * left to add.
   */
  const foot = el('div', 'aero-foot');
  const exitBtn = elt('button', 'aero-exit-btn', 'Exit wind tunnel');
  exitBtn.onclick = () => onExit?.();
  exitBtn.hidden = true;
  foot.hidden = true;
  foot.append(exitBtn);
  root.append(foot);

  // ---- update / highlight / dispose ---------------------------------------
  function update(result, ride, comparison) {
    lastResult = result;

    tweenText(cdaValue, result.cdaHeadOn, (v) => v.toFixed(3));
    tweenText(cdaYawValue, result.cdaWeighted, (v) => v.toFixed(3));

    tweenText(wattsValue, comparison.totalW ?? 0, (v) => String(Math.round(v)));
    if (!speedDragging && document.activeElement !== speedSlider) {
      speedSlider.value = String(ride.speedKph);
    }
    speedReadout.textContent = '';
    wattsSpeedEcho.textContent = String(Math.round(ride.speedKph));

    tweenText(dW.value, comparison.addedW, signedFmt(dW, 0));
    tweenText(peekCostValue, comparison.addedW,
      signedFmt({ labelEl: peekCostLabel, posLabel: 'more power, same speed', negLabel: 'less power, same speed' }, 0));
    tweenText(dKph.value, comparison.kphLost, signedFmt(dKph, 1));
    tweenText(dMin.value, comparison.minutesPer100km, signedFmt(dMin, 1));

    renderWaterfall(result, ride);

    const g = comparison.grade || { letter: '—', name: '', blurb: '' };
    gradeLetter.textContent = g.letter;
    gradeName.textContent = g.name;
    gradeBlurb.textContent = g.blurb;
    peekLetter.textContent = g.letter;
    peekName.textContent = g.name;
    const cut = String(g.blurb || '').match(/^[^.!?]+[.!?]/);
    peekBlurb.textContent = (cut ? cut[0] : g.blurb || '').trim();

    // ride.yawDeg is the tunnel's live yaw state (index.js includes it); sync
    // the slider to it the same way the speed slider syncs, then refresh the
    // interpolated readout from whatever the slider ends up showing.
    if (ride.yawDeg != null && !yawDragging && document.activeElement !== yawSlider) {
      yawSlider.value = String(ride.yawDeg);
      yawReadout.textContent = `${Math.round(ride.yawDeg)}°`;
    }
    if (!yawDragging && document.activeElement !== yawSlider) {
      const c = cdaAtYaw(result.byYaw, Number(yawSlider.value));
      if (c != null) yawCdaValueEl.textContent = `${c.toFixed(3)} m²`;
    }
  }

  function setHighlight(key) {
    highlightedKey = key || null;
    for (const [k, row] of wfRows) row.row.classList.toggle('hl', k === highlightedKey);
  }

  function dispose() {
    speedSlider.removeEventListener('pointerdown', onSpeedDown);
    speedSlider.removeEventListener('pointerup', onSpeedUp);
    speedSlider.removeEventListener('input', onSpeedInput);
    yawSlider.removeEventListener('pointerdown', onYawDown);
    yawSlider.removeEventListener('pointerup', onYawUp);
    yawSlider.removeEventListener('input', onYawInput);
    for (const [, row] of wfRows) row.row.remove();
    wfRows.clear();
    closeBtn.onclick = null;
    exitBtn.onclick = null;
    peekBar.onclick = null;
    peekBar.onkeydown = null;
    root.remove();
  }

  // Not in CONTRACT.md's Panel shape — added for the mobile bottom-sheet:
  // forces the phone sheet back to its collapsed peek row (kit cost + biggest
  // offender only). A no-op on desktop, where `.expanded` has no CSS effect.
  // Exposed so the lead can reset this panel to its quiet state from outside
  // (e.g. re-collapsing on re-entry) without reaching into this module's
  // internals — see report for why nothing here calls it itself.
  function collapse() {
    setExpanded(false);
  }

  return { el: root, update, setHighlight, collapse, setMinimized, dispose };
}

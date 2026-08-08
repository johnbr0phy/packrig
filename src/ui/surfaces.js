/**
 * Scrim wells for the surfaces that already exist — DESIGN-SYSTEM.md §3.3.
 *
 * WHY THIS IS NOT JUST A CHILD ELEMENT. §3.3's snippet puts `.scrim-well`
 * inside the panel at `z-index: -1`. That works only for a parent that does
 * not create a stacking context, and every glass surface here carries
 * `backdrop-filter`, which creates one. Inside such a parent the well is
 * clamped to its parent's stacking context and paints ABOVE the panel's own
 * background — so it tints the glass instead of darkening the scene, which is
 * the exact failure the section is written to avoid. Worse, the panel's blur
 * would never sample it.
 *
 * So the wells live in one fixed layer painted BEHIND all chrome, each mirror-
 * ing its surface's rect. The panel's `backdrop-filter` then samples a
 * substrate that has already been darkened, which is what §3.3 actually asks
 * for: "darken the scene behind the panel, not the panel itself".
 *
 * Registration also tells `scrim.js` which screen regions to sample: a surface
 * with a well is by definition a surface whose legibility depends on what is
 * behind it. One list, two consumers, no way for them to disagree.
 */

const LAYER_ID = 'scrim-layer';

/** Selectors for every surface that needs a well, with its well flavour. */
const SURFACES = [
  ['.panel', false],
  ['.dock', false],
  ['.bottom-bar', false],
  ['.viewtools', false],   // ui.js calls it `viewtools`, not `tools`
  ['.sheet', false],
  // §3.3's last line: text floating on the canvas with no panel uses the same
  // mechanism at 0.6 strength and a wider radius. This is what replaces the
  // 400x190 `.top-scrim` blob that §10.1 deletes — same job, but it follows the
  // wordmark's real shape instead of being a fixed radial smudge.
  ['.wordmark', true],
];

export function initSurfaces(root = document.getElementById('ui-root')) {
  if (!root) return null;

  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.setAttribute('aria-hidden', 'true');
    // Behind every surface in #ui-root, in front of the canvas.
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '0',
    });
    root.prepend(layer);
  }

  const tracked = [];   // { node, well, free }

  const place = ({ node, well }) => {
    // offsetParent is null for display:none; a zero rect means collapsed.
    const r = node.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || node.offsetParent === null) {
      well.style.opacity = '0';
      return;
    }
    well.style.opacity = '1';
    well.style.left = `${r.left}px`;
    well.style.top = `${r.top}px`;
    well.style.width = `${r.width}px`;
    well.style.height = `${r.height}px`;
    well.style.borderRadius = getComputedStyle(node).borderRadius || '0';
  };

  const placeAll = () => { for (const t of tracked) place(t); };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(placeAll) : null;

  for (const [sel, free] of SURFACES) {
    for (const node of root.querySelectorAll(sel)) {
      const well = document.createElement('div');
      well.className = free ? 'scrim-well free' : 'scrim-well';
      // The shared class positions relative to a parent; here the well is
      // absolutely placed in a fixed layer, so override the two that differ.
      well.style.position = 'fixed';
      well.style.inset = 'auto';
      well.style.zIndex = '0';
      well.style.transition = 'opacity var(--d-sheet) var(--ease-out)';
      layer.append(well);
      const t = { node, well, free };
      tracked.push(t);
      place(t);
      ro?.observe(node);
      // scrim.js samples the framebuffer under exactly these rects.
      node.classList.add('scrim-sampled');
    }
  }

  window.addEventListener('resize', placeAll);
  // A sheet opening changes three rects at once and none of them fire a
  // ResizeObserver for the whole 320ms of the transition.
  const onTransition = (e) => { if (e.propertyName === 'width' || e.propertyName === 'transform') placeAll(); };
  root.addEventListener('transitionrun', onTransition, true);
  root.addEventListener('transitionend', onTransition, true);

  let raf = 0;
  const follow = () => { placeAll(); raf = requestAnimationFrame(follow); };

  return {
    /** Re-measure now. Cheap; call it after any layout change. */
    sync: placeAll,
    /** Track every frame for the duration of a transition, then stop. */
    followFor(ms = 400) {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(follow);
      setTimeout(() => { cancelAnimationFrame(raf); raf = 0; placeAll(); }, ms);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', placeAll);
      root.removeEventListener('transitionrun', onTransition, true);
      root.removeEventListener('transitionend', onTransition, true);
      layer.remove();
    },
  };
}

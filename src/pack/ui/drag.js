/**
 * Drag an item onto a bag. Desktop pointers only — on a phone the same act is
 * two taps (item → where it goes), which is the keyboard path too.
 *
 * A row becomes draggable after 6 px of travel with the mouse, so a click is
 * still a click. While dragging, a chip follows the pointer, the bag under it
 * in the scene lights up (the same hover tint the canvas uses), and dropping
 * puts the item in and opens the bag so you watch it go in.
 */
import * as THREE from 'three';
import { el } from './labels.js';
import { SLOT_WORD } from './labels.js';

export function initDrag(app, { notify } = {}) {
  const fine = matchMedia('(pointer: fine)');
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;
  const targets = new Map();          // element → slot

  function pickBag(x, y) {
    const cv = app.renderer.domElement;
    const r = cv.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    // the panel and sheets sit over the canvas: only a pointer over the scene counts
    const top = document.elementFromPoint(x, y);
    if (top && top !== cv) return null;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, app.camera);
    const roots = Object.entries(app.bags.equipped).map(([slot, e]) => ({ slot, mesh: e.mesh }));
    const hits = ray.intersectObjects(roots.map((o) => o.mesh), true);
    for (const h of hits) {
      for (let o = h.object; o; o = o.parent) {
        const f = roots.find((x2) => x2.mesh === o);
        if (f) return f.slot;
      }
    }
    return null;
  }

  function source(node, uid) {
    if (!fine.matches || !app.pack?.state?.mine) return;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType !== 'mouse') return;
      drag = { uid, x: e.clientX, y: e.clientY, live: false, node };
    });
  }

  function dropTarget(node, slot) { targets.set(node, slot); }

  addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.live) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.live = true;
      const r = app.pack.state.resolved.get(drag.uid);
      drag.ghost = el('div', 'pkg-ghost', r?.name || 'Item');
      document.body.append(drag.ghost);
      document.body.classList.add('pkg-dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
    let slot = pickBag(e.clientX, e.clientY);
    if (!slot) {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      for (const [n, s] of targets) if (n.isConnected && n.contains(under)) { slot = s; break; }
    }
    if (slot !== drag.over) {
      drag.over = slot;
      app.focus?.setHovered?.(slot);
      drag.ghost.dataset.to = slot ? `→ ${SLOT_WORD[slot]}` : '';
    }
    e.preventDefault();
  }, { passive: false });

  addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (!d?.live) return;
    d.ghost.remove();
    document.body.classList.remove('pkg-dragging');
    app.focus?.setHovered?.(null);
    // swallow the click the row would otherwise receive
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); removeEventListener('click', stop, true); };
    addEventListener('click', stop, true);
    setTimeout(() => removeEventListener('click', stop, true), 0);
    if (!d.over) return;
    app.pack.place(d.uid, d.over);
    app.pack.openBag(d.over);
    const st = app.pack.state;
    const over = st.results[d.over]?.overflow.find((o) => o.uid === d.uid);
    const name = st.resolved.get(d.uid)?.name;
    if (over) {
      const alt = app.pack.alternativeFor(d.uid);
      notify?.(`${name} won’t fit in the ${SLOT_WORD[d.over].toLowerCase()}${alt ? '' : ' — nor anywhere else right now'}.`, null,
        alt ? { label: 'Put it where it fits', run: () => app.pack.place(d.uid, alt) } : null);
    }
  });

  return { source, dropTarget };
}

// Words for places, in the voice of the rest of the app: short, plain, no jargon.
import { parsePlace } from '../model.js';

export const SLOT_WORD = {
  seatpack: 'Seat pack', saddlebag: 'Saddle bag', barroll: 'Bar roll', barbag: 'Bar bag',
  barpocket: 'Front pocket', randobag: 'Rando bag', framebag_full: 'Frame bag', framebag_half: 'Half frame bag',
  toptube: 'Top tube bag', toptube_rear: 'Rear top tube bag', stemL: 'Stem bag, left', stemR: 'Stem bag, right',
  forkL: 'Fork, left', forkR: 'Fork, right', downtube: 'Down tube bag', pannierL: 'Pannier, left',
  pannierR: 'Pannier, right', trunk: 'Trunk bag',
};

/** Order the panel lists places in: front to back, then off the bike. */
export const SLOT_ORDER = ['barroll', 'barbag', 'barpocket', 'randobag', 'stemL', 'stemR', 'toptube', 'framebag_full', 'framebag_half', 'toptube_rear', 'downtube', 'forkL', 'forkR', 'seatpack', 'saddlebag', 'trunk', 'pannierL', 'pannierR'];

export function placeWords(code) {
  const p = parsePlace(code);
  switch (p.loc) {
    case 'home': return 'Staying home';
    case 'frame': return p.mount === 'bottle' ? 'In a bottle cage' : p.mount === 'bar' ? 'On the bars' : 'On the frame';
    case 'body': return p.in === 'hip' ? 'In your hip pack' : p.in === 'pocket' ? 'In a pocket' : p.in === 'pack' ? 'In your backpack' : 'On you';
    case 'lashed': return `Strapped on the ${lc(SLOT_WORD[p.slot])}`;
    case 'dangle': return `Hanging off the ${lc(SLOT_WORD[p.slot])}`;
    case 'bag': return p.side ? `${SLOT_WORD[p.slot]}, ${p.side === 'L' ? 'left' : 'right'} side` : SLOT_WORD[p.slot];
    default: return '';
  }
}
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : '');

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function btn(cls, text, onClick, { label = null } = {}) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  if (onClick) b.onclick = onClick;
  return b;
}

/**
 * The step between "Build a rig" and the bag list.
 *
 * Name, frame colour, bidon colour — chosen while the bike is still the
 * homepage's bike, then the builder opens already looking like yours.
 * Live: a swatch press paints the 3D bike immediately.
 *
 *   renderSetup(app, { name, onDone }) -> HTMLElement
 */

import { PAINTS, FRAME_SIZES } from '../../bike.js';
import { icon } from './icons.js';
import { randomRigName } from './rignames.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export const PAINT_LABEL = {
  Slate: 'Slate Grey',
  Forest: 'Forest Green',
  Oxblood: 'Oxblood',
  Midnight: 'Midnight Blue',
  Sand: 'Desert Sand',
  Violet: 'Deep Violet',
};

export const BIDONS = [
  { hex: '#6fa892', n: 0x6fa892, label: 'Mint' },
  { hex: '#c2601f', n: 0xc2601f, label: 'Burnt orange' },
  { hex: '#e8e6e1', n: 0xe8e6e1, label: 'Chalk' },
  { hex: '#1d1f22', n: 0x1d1f22, label: 'Black' },
  { hex: '#c9483a', n: 0xc9483a, label: 'Red' },
  { hex: '#3f6ea8', n: 0x3f6ea8, label: 'Blue' },
];

let seq = 0;
const staged = (node) => {
  node.classList.add('pr-st');
  node.style.setProperty('--i', String(seq++));
  return node;
};

export function renderSetup(app, { name = '', onDone } = {}) {
  seq = 0;
  const wrap = el('div', 'pr-start pr-setup');

  wrap.append(staged(el('p', 'pr-eyebrow', 'New rig')));
  wrap.append(staged(el('h1', 'pr-title', 'Set up this rig')));
  wrap.append(staged(el('p', 'pr-lede',
    'A name, a size, two colours. Then the bags.')));

  const form = el('form', 'pr-setup-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish();
  });

  const nameField = el('label', 'pr-field');
  nameField.append(el('span', 'pr-field-k', 'Name'));
  const nameIn = document.createElement('input');
  nameIn.className = 'pr-name';
  nameIn.type = 'text';
  nameIn.name = 'name';
  nameIn.maxLength = 48;
  nameIn.autocomplete = 'off';
  nameIn.placeholder = randomRigName();
  nameIn.value = name || randomRigName();
  nameIn.setAttribute('aria-label', 'Rig name');
  nameField.append(nameIn);
  form.append(staged(nameField));

  let size = FRAME_SIZES[app.state?.size] ? app.state.size : 'M';
  const sizeField = el('div', 'pr-field');
  sizeField.append(el('span', 'pr-field-k', 'Frame size'));
  const sizeRow = el('div', 'pr-sizes');
  const sizeBtns = [];
  for (const spec of Object.values(FRAME_SIZES)) {
    const b = el('button', 'pr-size');
    b.type = 'button';
    b.append(el('span', 'pr-size-id', spec.label));
    b.append(el('span', 'pr-size-r', spec.rider));
    b.classList.toggle('on', spec.id === size);
    b.onclick = () => {
      size = spec.id;
      app.setSize?.(size);
      sizeBtns.forEach((x) => x.classList.toggle('on', x === b));
    };
    sizeBtns.push(b);
    sizeRow.append(b);
  }
  sizeField.append(sizeRow);
  form.append(staged(sizeField));
  if (app.bike?.size !== size) app.setSize?.(size);

  let paint = app.state?.paint && PAINTS[app.state.paint] ? app.state.paint : 'Slate';
  const paintField = el('div', 'pr-field');
  paintField.append(el('span', 'pr-field-k', 'Frame'));
  const paintRow = el('div', 'pr-swatches');
  const paintBtns = [];
  for (const [key, def] of Object.entries(PAINTS)) {
    const b = el('button', 'pr-swatch');
    b.type = 'button';
    b.style.background = '#' + def.color.toString(16).padStart(6, '0');
    b.title = PAINT_LABEL[key] || key;
    b.setAttribute('aria-label', `Frame colour: ${PAINT_LABEL[key] || key}`);
    b.classList.toggle('on', key === paint);
    b.onclick = () => {
      paint = key;
      app.setPaint?.(key);
      paintBtns.forEach((x) => x.classList.toggle('on', x === b));
    };
    paintBtns.push(b);
    paintRow.append(b);
  }
  paintField.append(paintRow);
  form.append(staged(paintField));
  if (app.state?.paint !== paint) app.setPaint?.(paint);

  const currentBottle = app.bike?.bottleColor?.('st');
  let bidon = BIDONS.find((c) => c.n === currentBottle)?.n ?? BIDONS[0].n;
  const bidonField = el('div', 'pr-field');
  bidonField.append(el('span', 'pr-field-k', 'Bidons'));
  const bidonRow = el('div', 'pr-swatches');
  const bidonBtns = [];
  for (const c of BIDONS) {
    const b = el('button', 'pr-swatch');
    b.type = 'button';
    b.style.background = c.hex;
    b.title = c.label;
    b.setAttribute('aria-label', `Bidon colour: ${c.label}`);
    b.classList.toggle('on', c.n === bidon);
    b.onclick = () => {
      bidon = c.n;
      app.bike?.setBottleColor?.('st', bidon);
      app.bike?.setBottleColor?.('dt', bidon);
      bidonBtns.forEach((x) => x.classList.toggle('on', x === b));
    };
    bidonBtns.push(b);
    bidonRow.append(b);
  }
  bidonField.append(bidonRow);
  form.append(staged(bidonField));
  app.bike?.setBottleColor?.('st', bidon);
  app.bike?.setBottleColor?.('dt', bidon);

  const go = el('button', 'pr-btn is-primary pr-setup-go');
  go.type = 'submit';
  go.append(el('span', null, 'Start building'), icon('right', { size: 18 }));
  form.append(staged(go));
  wrap.append(form);

  function finish() {
    const trimmed = nameIn.value.trim();
    onDone?.({
      name: trimmed || randomRigName(),
      size,
      paint,
      bidon,
    });
  }

  queueMicrotask(() => nameIn.focus());
  return wrap;
}

export function bidonLabel(n) {
  return BIDONS.find((c) => c.n === n)?.label || 'Bidons';
}

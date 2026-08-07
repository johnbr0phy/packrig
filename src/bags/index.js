// Public API of the bag system. src/bags.js re-exports this wholesale, so
// src/main.js, src/ui.js and src/focus.js keep importing from './bags.js'.

export { SLOTS, productSlotFor } from './slots.js';
export { colorwayFor } from './identity.js';
export { BagSystem } from './system.js';

// Mount slots: the table of bag positions on the bike, each with its bike
// anchor, label, exclusions and requirements, plus the ui-slot -> catalogue-slot
// mapping.

/** Mount slots. Each maps to a bike anchor and knows what it conflicts with. */
export const SLOTS = {
  seatpack:      { anchor: 'seatpack',  label: 'Seat pack',        excludes: ['saddlebag'] },
  saddlebag:     { anchor: 'seatpack',  label: 'Saddle bag',       excludes: ['seatpack'] },
  barroll:       { anchor: 'barroll',   label: 'Handlebar roll',   excludes: ['barbag', 'randobag'] },
  barbag:        { anchor: 'barroll',   label: 'Handlebar bag',    excludes: ['barroll', 'randobag'] },
  randobag:      { anchor: 'basket',    label: 'Rando / basket',   excludes: ['barroll', 'barbag'], needs: 'frontRack' },
  framebag_full: { anchor: 'framebag',  label: 'Full frame bag',   excludes: ['framebag_half'], hidesBottles: true },
  framebag_half: { anchor: 'framebag',  label: 'Half frame bag',   excludes: ['framebag_full'] },
  toptube:       { anchor: 'toptube',   label: 'Top tube bag',     excludes: [] },
  toptube_rear:  { anchor: 'toptubeRear', label: 'Rear top tube bag', excludes: [], products: 'toptube_rear' },
  stemL:         { anchor: 'stemL',     label: 'Stem bag (L)',     excludes: [], products: 'stembag' },
  stemR:         { anchor: 'stemR',     label: 'Stem bag (R)',     excludes: [], products: 'stembag' },
  forkL:         { anchor: 'forkL',     label: 'Fork bag (L)',     excludes: [], products: 'forkbag' },
  forkR:         { anchor: 'forkR',     label: 'Fork bag (R)',     excludes: [], products: 'forkbag' },
  downtube:      { anchor: 'downtube',  label: 'Downtube bag',     excludes: [] },
  pannierL:      { anchor: 'pannierL',  label: 'Pannier (L)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  pannierR:      { anchor: 'pannierR',  label: 'Pannier (R)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  trunk:         { anchor: 'rackTop',   label: 'Rack trunk bag',   excludes: [], needs: 'rearRack' },
};

export function productSlotFor(uiSlot) {
  return SLOTS[uiSlot].products || uiSlot;
}

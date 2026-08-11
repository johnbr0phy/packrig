// Mount slots: the table of bag positions on the bike, each with its bike
// anchor, label, exclusions and requirements, plus the ui-slot -> catalogue-slot
// mapping.

/** Mount slots. Each maps to a bike anchor and knows what it conflicts with. */
export const SLOTS = {
  // A seat pack hangs off the rails and extends back OVER the rack deck, which
  // is exactly where a trunk bag sits — the two occupy the same volume and no
  // one runs both. `trunk` carries the mirror of this.
  seatpack:      { anchor: 'seatpack',  label: 'Seat pack',        excludes: ['saddlebag', 'trunk'] },
  saddlebag:     { anchor: 'seatpack',  label: 'Saddle bag',       excludes: ['seatpack', 'trunk'] },
  barroll:       { anchor: 'barroll',   label: 'Handlebar roll',   excludes: ['barbag', 'randobag'] },
  barbag:        { anchor: 'barroll',   label: 'Handlebar bag',    excludes: ['barroll', 'randobag'] },
  randobag:      { anchor: 'basket',    label: 'Rando / basket',   excludes: ['barroll', 'barbag'], needs: 'frontRack' },
  framebag_full: { anchor: 'framebag',  label: 'Full frame bag',   excludes: ['framebag_half'], hidesBottles: true },
  framebag_half: { anchor: 'framebag',  label: 'Half frame bag',   excludes: ['framebag_full'] },
  // A front pocket does NOT mount to the bike. It clips onto the FRONT FACE of
  // whatever handlebar bag is already fitted — Revelate's Scrambler Pocket
  // buckles to the roll's own straps, Apidura's Front Accessory Pack to the
  // Expedition Handlebar Pack. Every other slot in this file names a bike
  // anchor; this one names a HOST SLOT, and BagSystem parents it to that bag's
  // mesh instead. Without it the pocket gets strapped to the handlebar as if it
  // were a bar bag, which is how it has been drawn until now: floating in front
  // of the bars, attached to nothing, with an invented mounting story.
  //
  // `anchor` is still declared as a fallback so nothing that indexes
  // bike.anchors by slot throws; it is not used while a host is present.
  barpocket:     { anchor: 'barroll',   label: 'Front pocket',     excludes: [], products: 'barpocket',
                   mountsTo: ['barroll', 'barbag'] },
  toptube:       { anchor: 'toptube',   label: 'Top tube bag',     excludes: [] },
  toptube_rear:  { anchor: 'toptubeRear', label: 'Rear top tube bag', excludes: [], products: 'toptube_rear' },
  stemL:         { anchor: 'stemL',     label: 'Stem bag (L)',     excludes: [], products: 'stembag' },
  stemR:         { anchor: 'stemR',     label: 'Stem bag (R)',     excludes: [], products: 'stembag' },
  forkL:         { anchor: 'forkL',     label: 'Fork bag (L)',     excludes: [], products: 'forkbag' },
  forkR:         { anchor: 'forkR',     label: 'Fork bag (R)',     excludes: [], products: 'forkbag' },
  downtube:      { anchor: 'downtube',  label: 'Downtube bag',     excludes: [] },
  pannierL:      { anchor: 'pannierL',  label: 'Pannier (L)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  pannierR:      { anchor: 'pannierR',  label: 'Pannier (R)',      excludes: [], products: 'pannier', needs: 'rearRack' },
  trunk:         { anchor: 'rackTop',   label: 'Rack trunk bag',   excludes: ['seatpack', 'saddlebag'], needs: 'rearRack' },
};

export function productSlotFor(uiSlot) {
  return SLOTS[uiSlot].products || uiSlot;
}

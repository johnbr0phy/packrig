// The catalogue-slot -> builder map. Imports every builder; nothing else may
// import builders directly.

import { buildBarbag } from './builders/barbag.js';
import { buildBarroll } from './builders/barroll.js';
import { buildDowntube } from './builders/downtube.js';
import { buildForkbag } from './builders/forkbag.js';
import { buildFrameFull } from './builders/framefull.js';
import { buildFrameHalf } from './builders/framehalf.js';
import { buildPannier } from './builders/pannier.js';
import { buildRandobag } from './builders/randobag.js';
import { buildSaddlebag } from './builders/saddlebag.js';
import { buildSeatpack } from './builders/seatpack.js';
import { buildStembag } from './builders/stembag.js';
import { buildToptube, buildToptubeRear } from './builders/toptube.js';
import { buildTrunk } from './builders/trunk.js';

// ---- builders (mm-local, parented to bike anchors) ----------------------

export const BUILDERS = {
  seatpack: buildSeatpack,
  saddlebag: buildSaddlebag,
  barroll: buildBarroll,
  barbag: buildBarbag,
  randobag: buildRandobag,
  framebag_full: buildFrameFull,
  framebag_half: buildFrameHalf,
  toptube: buildToptube,
  toptube_rear: buildToptubeRear,
  stembag: buildStembag,
  forkbag: buildForkbag,
  downtube: buildDowntube,
  pannier: buildPannier,
  trunk: buildTrunk,
};

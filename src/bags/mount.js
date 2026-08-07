// Handlebar mounting geometry, shared by the bar roll and bar bag builders.

/**
 * Handlebar bags mount just clear of the bar tops. Keeping the body inboard of
 * the hoods (|z| < barWidth/2 − 26) is what lets it sit tight to the bars
 * instead of floating out past the levers.
 */
export function barMount(ctx, r) {
  const bc = ctx.points.barCenter;
  const anchor = ctx.anchors.barroll.position;
  const barR = 16;                 // drop-bar tube radius as drawn in bike.js
  const gap = 26;                  // spacer standoff between bar and pack
  return {
    maxHalfLen: Math.max(ctx.geo.barWidth / 2 - 26, 120),
    x: bc.x + barR + gap + r - anchor.x,   // pack rear face sits `gap` off the bar
    y: bc.y - 4 - anchor.y,
    barR,
    gap,
  };
}

/** BWF court dimensions in metres, shared by the renderer and game rules. */
export const COURT_METERS = Object.freeze({
  length: 13.4,
  width: 6.1,
  singlesWidth: 5.18,
  shortService: 1.98,
  longServiceInset: 0.76,
  lineWidth: 0.04,
});

const LEFT = 62;
const RIGHT = 1038;
const SCALE = (RIGHT - LEFT) / COURT_METERS.length;

/** Longitudinal metres from the left baseline to the players' world plane. */
export const courtWorldX = (meters) => LEFT + meters * SCALE;

export const COURT_WORLD = Object.freeze({
  left: LEFT,
  right: RIGHT,
  netX: courtWorldX(COURT_METERS.length / 2),
  floorY: 500,
  scale: SCALE,
  serviceLineLeft: courtWorldX(COURT_METERS.length / 2 - COURT_METERS.shortService),
  serviceLineRight: courtWorldX(COURT_METERS.length / 2 + COURT_METERS.shortService),
});

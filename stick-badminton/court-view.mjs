import { COURT_METERS, COURT_WORLD, courtWorldX } from './court.mjs?v=low-wall-save-1';

// Metres stay physical; only the camera foreshortens the court's depth.
const depthScale = COURT_WORLD.scale * 0.46;
const farY = 365;
export const COURT_VIEW = Object.freeze({
  farY, depthScale, nearY: farY + COURT_METERS.width * depthScale,
  playDepth: (COURT_WORLD.floorY - farY) / depthScale,
  perspective: 0.00075,
});

export function projectCourtPoint(lengthMeters, depthMeters) {
  const y = COURT_WORLD.floorY + (depthMeters - COURT_VIEW.playDepth) * depthScale;
  const perspective = 1 + (y - COURT_WORLD.floorY) * COURT_VIEW.perspective;
  return [COURT_WORLD.netX + (courtWorldX(lengthMeters) - COURT_WORLD.netX) * perspective, y];
}

export function courtLineWidth(depthMeters = COURT_METERS.width / 2) {
  const [, y] = projectCourtPoint(0, depthMeters);
  return COURT_METERS.lineWidth * COURT_WORLD.scale * (1 + (y - COURT_WORLD.floorY) * COURT_VIEW.perspective);
}

const { length, width, singlesWidth, shortService, longServiceInset } = COURT_METERS;
const sideInset = (width - singlesWidth) / 2;
const shortLeft = length / 2 - shortService, shortRight = length / 2 + shortService;
const marking = (id, kind, points) => Object.freeze({ id, kind, points: Object.freeze(points.map(point => Object.freeze(point))) });

export const COURT_OUTLINE = Object.freeze([[0, 0], [length, 0], [length, width], [0, width]].map(point => Object.freeze(point)));
export const COURT_MARKINGS = Object.freeze([
  marking('perimeter', 'boundary', [...COURT_OUTLINE, COURT_OUTLINE[0]]),
  marking('singles-far', 'singles', [[0, sideInset], [length, sideInset]]),
  marking('singles-near', 'singles', [[0, width - sideInset], [length, width - sideInset]]),
  marking('long-service-left', 'long-service', [[longServiceInset, 0], [longServiceInset, width]]),
  marking('long-service-right', 'long-service', [[length - longServiceInset, 0], [length - longServiceInset, width]]),
  marking('short-service-left', 'short-service', [[shortLeft, 0], [shortLeft, width]]),
  marking('short-service-right', 'short-service', [[shortRight, 0], [shortRight, width]]),
  marking('center-left', 'center', [[0, width / 2], [shortLeft, width / 2]]),
  marking('center-right', 'center', [[shortRight, width / 2], [length, width / 2]]),
]);

export function projectCourtMarking(marking) {
  return marking.points.map(([x, z]) => projectCourtPoint(x, z));
}

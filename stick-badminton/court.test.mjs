import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from './engine.mjs';
import { COURT_MARKINGS, COURT_OUTLINE, projectCourtMarking } from './court-view.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
const marking = (id) => COURT_MARKINGS.find((line) => line.id === id);

test('the painted service lines meet the live rule boundaries at the players feet', () => {
  for (const [id, boundary] of [['short-service-left', WORLD.serviceLineLeft], ['short-service-right', WORLD.serviceLineRight]]) {
    const [[x1, y1], [x2, y2]] = projectCourtMarking(marking(id));
    assert.ok(y1 < WORLD.floorY && y2 > WORLD.floorY);
    close(x1 + (x2 - x1) * (WORLD.floorY - y1) / (y2 - y1), boundary);
  }
  close(WORLD.serviceLineLeft + WORLD.serviceLineRight, 2 * WORLD.netX);
});

test('court markings follow standard badminton dimensions without a line across the forecourt', () => {
  assert.deepEqual(COURT_OUTLINE, [[0, 0], [13.4, 0], [13.4, 6.1], [0, 6.1]]);
  close(marking('singles-near').points[0][1] - marking('singles-far').points[0][1], 5.18);
  close(6.7 - marking('short-service-left').points[0][0], 1.98);
  close(marking('short-service-right').points[0][0] - 6.7, 1.98);
  close(marking('long-service-left').points[0][0], 0.76);
  close(13.4 - marking('long-service-right').points[0][0], 0.76);
  assert.deepEqual(marking('center-left').points, [[0, 3.05], [6.7 - 1.98, 3.05]]);
  assert.deepEqual(marking('center-right').points, [[6.7 + 1.98, 3.05], [13.4, 3.05]]);
  assert.equal(COURT_MARKINGS.some((line) => line.points.every(([x]) => x === 6.7)), false, 'No painted net line');
});

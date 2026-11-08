import test from 'node:test';
import assert from 'node:assert/strict';
import { quizXp, medalFor, levelFor, streakNext, quizBadges, dailyIndex } from '../js/game/rules.js';

test('quiz XP', () => {
  assert.equal(quizXp(0, 5), 30);
  assert.equal(quizXp(3, 5), 60);
  assert.equal(quizXp(5, 5), 100);
});
test('medal thresholds', () => {
  assert.equal(medalFor(5, 5), 3);
  assert.equal(medalFor(4, 5), 2);
  assert.equal(medalFor(2, 5), 1);
  assert.equal(medalFor(1, 5), 0);
});
test('levels and titles', () => {
  assert.deepEqual([levelFor(0).n, levelFor(0).title], [1, 'Newbie']);
  assert.equal(levelFor(300).title, 'Packet Pro');
  assert.equal(levelFor(900).title, 'Network Wizard');
  assert.equal(levelFor(160).into, 10);
});
test('streak rules', () => {
  assert.equal(streakNext(0, 10, 0), 1);
  assert.equal(streakNext(10, 10, 4), 4);
  assert.equal(streakNext(10, 11, 4), 5);
  assert.equal(streakNext(10, 13, 4), 1);
});
test('special badges', () => {
  assert.deepEqual(quizBadges({ correct: 5, total: 5, secs: 20, hour: 12 }), ['zero', 'speed']);
  assert.deepEqual(quizBadges({ correct: 2, total: 5, secs: 99, hour: 23 }), ['night']);
  assert.deepEqual(quizBadges({ correct: 4, total: 5, secs: 99, hour: 12 }), []);
});
test('daily index stays in range', () => {
  for (let d = -3; d < 50; d++) assert.ok(dailyIndex(d, 7) >= 0 && dailyIndex(d, 7) < 7);
});

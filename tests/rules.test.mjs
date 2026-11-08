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

import { LEAGUE_SIZE, LEAGUES, weekId, rankMembers, nextLeague, dailyQuizXp, dailyQuestionSet } from '../js/game/leagues.js';

test('weekly league batches hold 20 learners', () => {
  assert.equal(LEAGUE_SIZE, 20);
  assert.equal(LEAGUES.length, 5);
});

test('week id is stable for dates within the same UTC week', () => {
  assert.equal(weekId(new Date('2026-11-02T01:00:00Z')), '2026-11-02');
  assert.equal(weekId(new Date('2026-11-08T23:59:00Z')), '2026-11-02');
  assert.equal(weekId(new Date('2026-11-09T00:00:00Z')), '2026-11-09');
});

test('league ranking sorts by XP and resolves ties deterministically', () => {
  const ranked = rankMembers({
    c: { weeklyXp: 100, joinedAt: 3 },
    b: { weeklyXp: 100, joinedAt: 2 },
    a: { weeklyXp: 200, joinedAt: 1 },
  });
  assert.deepEqual(ranked.map(x => x.uid), ['a', 'b', 'c']);
  assert.deepEqual(ranked.map(x => x.rank), [1, 2, 3]);
});

test('top five promote and bottom five demote within tier limits', () => {
  assert.equal(nextLeague('bronze', 1), 'silver');
  assert.equal(nextLeague('silver', 5), 'gold');
  assert.equal(nextLeague('gold', 10), 'gold');
  assert.equal(nextLeague('gold', 16), 'silver');
  assert.equal(nextLeague('diamond', 1), 'diamond');
  assert.equal(nextLeague('bronze', 20), 'bronze');
});

test('daily quiz reward is bounded by quiz size and perfect-score bonus', () => {
  assert.equal(dailyQuizXp(0, 5), 10);
  assert.equal(dailyQuizXp(4, 5), 50);
  assert.equal(dailyQuizXp(5, 5), 70);
  assert.equal(dailyQuizXp(99, 5), 70);
});

test('daily quiz chooses five stable consecutive questions', () => {
  const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(dailyQuestionSet(questions, 0, 5), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(dailyQuestionSet(questions, 1, 5), ['b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(dailyQuestionSet(questions, 6, 5), ['g', 'a', 'b', 'c', 'd']);
});

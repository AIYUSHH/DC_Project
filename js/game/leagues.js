/** Pure weekly-league rules. No Firebase or DOM dependencies. */
export const LEAGUE_SIZE = 20;
export const PROMOTION_SLOTS = 5;
export const DEMOTION_START = 16;
export const LEAGUES = [
  { id: 'bronze', name: 'Bronze League', icon: '🥉', order: 0 },
  { id: 'silver', name: 'Silver League', icon: '🥈', order: 1 },
  { id: 'gold', name: 'Gold League', icon: '🥇', order: 2 },
  { id: 'platinum', name: 'Platinum League', icon: '💠', order: 3 },
  { id: 'diamond', name: 'Diamond League', icon: '💎', order: 4 },
];

export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - weekday + 1);
  return d.toISOString().slice(0, 10);
}

export function previousWeekId(date = new Date()) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekId(d);
}

export function rankMembers(members = {}) {
  return Object.entries(members)
    .map(([uid, member]) => ({ uid, ...member }))
    .sort((a, b) => (Number(b.weeklyXp) || 0) - (Number(a.weeklyXp) || 0)
      || (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0)
      || a.uid.localeCompare(b.uid))
    .map((member, index) => ({ ...member, rank: index + 1 }));
}

export function nextLeague(currentId, rank, size = LEAGUE_SIZE) {
  const current = LEAGUES.findIndex(x => x.id === currentId);
  const safe = current < 0 ? 0 : current;
  if (rank > 0 && rank <= PROMOTION_SLOTS && safe < LEAGUES.length - 1) return LEAGUES[safe + 1].id;
  if (rank >= DEMOTION_START && rank <= size && safe > 0) return LEAGUES[safe - 1].id;
  return LEAGUES[safe].id;
}

export function dailyQuizXp(correct, total) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1) return 0;
  return Math.max(0, Math.min(total, correct)) * 10 + 10 + (correct === total ? 10 : 0);
}

export function dailyQuestionSet(questions, day, count = 5) {
  if (!Array.isArray(questions) || !questions.length) return [];
  const start = ((day % questions.length) + questions.length) % questions.length;
  const size = Math.min(count, questions.length);
  return Array.from({ length: size }, (_, i) => questions[(start + i) % questions.length]);
}

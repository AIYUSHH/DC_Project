/** Weekly competition screen: one Firestore-backed batch of up to 20 learners per league. */
import { $, esc } from '../core/utils.js';
import { ensureLeagueMembership, getLeagueSnapshot } from './league-service.js';
import { LEAGUE_SIZE } from './leagues.js';

const nextMonday = () => {
  const d = new Date();
  const days = (8 - (d.getDay() || 7)) % 7 || 7;
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function renderLeague() {
  const root = $('#dash');
  root.innerHTML = `<div class="ghome"><a class="gback" href="#/">‹ Map</a>
    <h2 class="gh">🏆 Weekly competition</h2>
    <div class="gstage"><p>Finding your exclusive batch…</p></div></div>`;
  try {
    await ensureLeagueMembership();
    const state = await getLeagueSnapshot();
    if (!state) throw new Error('Your league could not be loaded. Please refresh.');
    const promotion = state.rank <= 5 && state.league.order < 4;
    const demotion = state.rank >= 16 && state.league.order > 0;
    const reset = nextMonday().toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    root.innerHTML = `<div class="ghome"><a class="gback" href="#/">‹ Map</a>
      <div class="gcard static league-hero">
        <span class="ge">${state.league.icon}</span><small>YOUR CURRENT LEAGUE</small>
        <b>${esc(state.league.name)}</b><div class="league-stats">
          <span><strong>#${state.rank}</strong><small>Your rank</small></span>
          <span><strong>${state.weeklyXp} XP</strong><small>This week</small></span>
          <span><strong>${state.memberCount}/${LEAGUE_SIZE}</strong><small>Learners</small></span>
        </div>
        <p>${promotion ? '🚀 Finish in the top 5 to move up next week.' : demotion ? '⚠️ You are in the demotion zone. Keep earning XP to stay.' : '✨ Stay active and aim for the top 5 to advance.'}</p>
        <small>Weekly reset: ${esc(reset)}</small>
      </div>
      <div class="league-zones"><span class="league-promo">▲ Ranks 1–5 · Promotion</span><span class="league-safe">Ranks 6–15 · Stay</span><span class="league-demo">▼ Ranks 16–20 · Demotion</span></div>
      <h3 class="gh">Your batch · ${state.memberCount} of ${LEAGUE_SIZE} learners</h3>
      <div class="gcard static league-board"><ol>${state.leaderboard.map(member => `<li class="${member.uid === state.uid ? 'is-you' : ''}">
        <span class="league-rank">#${member.rank}</span><b>${esc(member.name || 'Learner')}${member.uid === state.uid ? ' (You)' : ''}</b><span>${Number(member.weeklyXp) || 0} XP</span>
      </li>`).join('')}</ol></div>
      <p class="gfoot">Each batch has up to 20 learners. Your weekly league score is separate from lifetime XP.</p>
      <div class="gactions"><a class="btn" href="#/daily">Take daily quiz</a><a class="btn ghost" href="#/profile">View profile decorations</a></div>
    </div>`;
  } catch (error) {
    root.innerHTML = `<div class="ghome"><a class="gback" href="#/">‹ Map</a><h2 class="gh">🏆 Weekly competition</h2>
      <div class="gcard static"><b>Unable to load your league</b><small>${esc(error.message || 'Check your connection and try again.')}</small>
      <button class="btn" id="leagueRetry" type="button">Try again</button></div></div>`;
    $('#leagueRetry')?.addEventListener('click', renderLeague);
  }
}

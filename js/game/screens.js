/** game screens: home, zone, profile and daily challenge. All render into #dash. */
import { DC } from '../core/state.js';
import { P } from '../core/storage.js';
import { $, esc } from '../core/utils.js';
import { ACH } from '../app/progress.js';
import { ZONES, META, TOOLS, LAB, FACTS } from './data.js';
import { dailyIndex, dayNum, levelFor } from './rules.js';
import { dailyQuestionSet, dailyQuizXp } from './leagues.js';
import { awardLeagueXp, getLeagueDecorations } from './league-service.js';
import { BADGES, MEDALS, addXp, hasBadge, isDone, medal, quizIds, streak, xp, checkMeta } from './store.js';
import { LEVEL_LABELS, runQuiz } from './flow.js';
import { boom } from './ui.js';

const mods = () => DC.mods;
const byId = id => mods().find(m => m.id === id);
const zoneMods = z => Object.keys(META).filter(id => META[id].z === z && byId(id));
const zoneOf = id => ZONES.find(z => z.id === META[id].z);
const tone = z => (z ? `--l:${z.l};--d:${z.d}` : '--l:#fff3c4;--d:#f2b705');
const bar = pct => `<div class="gprog"><i style="width:${pct}%"></i></div>`;

const card = (href, e, title, sub, z, extra = '') =>
  `<a class="gcard" href="${href}" style="${tone(z)}"><span class="ge">${e}</span><b>${title}</b><small>${sub}</small>${extra}</a>`;

/** The module the learner should do next: the last one opened if unfinished, else the first unfinished quiz module. */
function nextUp() {
  const last = byId(P.last);
  if (last && META[last.id] && META[last.id].q && !isDone(last.id)) return last;
  const id = ZONES.flatMap(z => zoneMods(z.id)).find(i => META[i].q && !isDone(i));
  return byId(id) || byId('framing') || mods()[0];
}

export function renderHome() {
  const root = $('#dash'), l = levelFor(xp()), q = quizIds(), done = q.filter(isDone).length;
  const nu = nextUp(), nz = zoneOf(nu.id), dayDone = P.stats.dailyDay === dayNum();
  const medals = q.reduce((s, id) => s + (medal(id) ? 1 : 0), 0);
  const badgeIds = Object.keys(BADGES);
  root.innerHTML = `<div class="ghome">
    <div class="ghero">
      <a class="gcard big-card" href="#/m/${nu.id}" style="${tone(nz)}"><span class="ge">${META[nu.id].e}</span><small>▶ Continue</small><b>${nu.title}</b>
        <small>${META[nu.id].d} · Watch → Play → Quiz → Badge</small>${bar((done / q.length) * 100)}<small>${done} of ${q.length} quiz modules finished</small><span class="btn">PLAY</span></a>
      <a class="gcard" href="#/daily" style="--l:#ffe9a8;--d:#8a5cff"><span class="ge">⭐</span><small>Daily quiz</small><b>${dayDone ? 'Done today ✅' : '5 questions · earn XP'}</b><small>${dayDone ? 'A new quiz arrives tomorrow.' : 'A fresh networking quiz every day.'}</small><span class="btn ghost sm">${dayDone ? 'VIEW' : 'START'}</span></a>
      <a class="gcard" href="#/league" style="--l:#d9ccff;--d:#7047cf"><span class="ge">🏆</span><small>Weekly competition</small><b>Join your batch</b><small>Compete with 19 other learners.</small><span class="btn ghost sm">VIEW LEAGUE</span></a>
      <div class="gcard static" style="--l:#fff;--d:#ffffff22"><small>Your level</small><b>Lv ${l.n} · ${l.title}</b>${bar((l.into / l.size) * 100)}
        <div class="gstats"><span>🔥 <b>${streak()}</b> day streak</span><span>⭐ <b>${xp()}</b> XP</span><span>🏅 <b>${medals}</b> medals</span></div></div>
    </div>
    <h3 class="gh">Zones</h3>
    <div class="ggrid">${ZONES.map(z => {
      const ids = zoneMods(z.id).filter(i => META[i].q), n = ids.filter(isDone).length;
      return card('#/zone/' + z.id, z.e, z.name, z.blurb, z, `${bar(ids.length ? (n / ids.length) * 100 : 0)}<small>${n}/${ids.length} modules</small>`);
    }).join('')}${card('#/profile', '🏅', 'Badges', `${Object.keys(BADGES).filter(hasBadge).length} of ${badgeIds.length} unlocked`, null)}</div>
    <h3 class="gh">Core lab · follow one message end to end</h3>
    <div class="ggrid four">${LAB.map((s, i) => card('#/lab/' + i, s[0], `${i + 1}. ${s[1]}`, s[2], null, P.visited['lab' + i] ? '<small>✅ visited</small>' : '')).join('')}</div>
    <h3 class="gh">Toolbox · free play</h3>
    <div class="ggrid">${TOOLS.filter(byId).map(id => card('#/m/' + id, META[id].e, byId(id).title, byId(id).desc.split('.')[0] + '.', null, P.visited[id] ? '<small>✅ opened</small>' : '')).join('')}</div>
    <div class="gcols">
      <div class="gcard static" style="--l:#ffe9a8;--d:#8a5cff"><small>💡 Did you know?</small><b>${esc(FACTS[dailyIndex(dayNum(), FACTS.length)])}</b></div>
      <div class="gcard static" style="--l:#fff;--d:#ffffff22"><small>🏅 Recent badges</small><div class="gbadges">${badgeIds.slice(0, 8).map(b => `<span class="gbadge ${hasBadge(b) ? '' : 'lock'}" title="${esc(BADGES[b][0])}">${hasBadge(b) ? BADGES[b][1] : '?'}</span>`).join('')}</div>
        <a class="btn ghost sm" href="#/profile">See all →</a></div>
    </div>
    <p class="gfoot">Tap an underlined word anywhere to see what it means. Simulations run in your browser and never touch your real network.</p></div>`;
}

export function renderZone(id) {
  const z = ZONES.find(x => x.id === id);
  if (!z) return renderHome();
  const ids = zoneMods(id), q = ids.filter(i => META[i].q), n = q.filter(isDone).length;
  const nextZ = ZONES[(ZONES.indexOf(z) + 1) % ZONES.length];
  $('#dash').innerHTML = `<div class="ghome" style="${tone(z)}">
    <a class="gback" href="#/">‹ Map</a>
    <div class="gcard static zhead"><span class="ge">${z.e}</span><div><h2>${z.name} zone</h2><small>${z.blurb}</small>${bar(q.length ? (n / q.length) * 100 : 0)}<small>${n}/${q.length} modules finished${hasBadge('z_' + id) ? ' · 🏆 Zone master' : ''}</small></div></div>
    <div class="ggrid wide">${ids.map(mid => {
      const m = byId(mid), mt = META[mid];
      return `<div class="gcard mod" style="${tone(z)}"><span class="ge">${mt.e}</span><b>${m.title}</b>
        <div class="gmeta"><span class="gchip">${mt.d}</span><span>${MEDALS[medal(mid)]}</span></div><small>${esc(m.desc)}</small>
        <div class="gactions"><a class="btn sm" href="#/m/${mid}">${medal(mid) ? 'Play again' : 'Start'}</a><a class="btn ghost sm" href="#/m/${mid}/play">🧪 Free play</a></div></div>`;
    }).join('')}</div>
    <div class="gcols"><a class="gcard" href="#/zone/${nextZ.id}" style="--l:${nextZ.l};--d:${nextZ.d}"><span class="ge">${nextZ.e}</span><small>Next zone</small><b>${nextZ.name}</b><small>${nextZ.blurb}</small></a>
      <a class="gcard" href="#/profile" style="--l:#fff3c4;--d:#f2b705"><span class="ge">🏅</span><small>Your badges</small><b>${Object.keys(BADGES).filter(hasBadge).length} unlocked</b></a></div></div>`;
}

export function renderProfile() {
  const l = levelFor(xp()), q = quizIds();
  const tile = (e, t, sub, on) => `<div class="gcard static badge ${on ? '' : 'lock'}" style="--l:#fff3c4;--d:#f2b705"><span class="ge">${on ? e : '🔒'}</span><b>${esc(t)}</b><small>${esc(sub)}</small></div>`;
  $('#dash').innerHTML = `<div class="ghome"><a class="gback" href="#/">‹ Map</a>
    <div class="ghero"><div class="gcard static" style="--l:#d9ccff;--d:#8a5cff"><small>Level</small><b>Lv ${l.n} · ${l.title}</b>${bar((l.into / l.size) * 100)}<small>${l.into}/${l.size} XP to Lv ${l.n + 1}</small></div>
      <div class="gcard static" style="--l:#ffe9a8;--d:#f2a30a"><small>Streak</small><b>🔥 ${streak()} days</b><small>Learn a little every day to keep it.</small></div>
      <div class="gcard static" style="--l:#d4f5cf;--d:#21b573"><small>Total XP</small><b>⭐ ${xp()}</b><small>${q.filter(isDone).length}/${q.length} quiz modules finished</small></div></div>
    <h3 class="gh">Exclusive profile decorations</h3><div class="ggrid" id="leagueDecorations"><div class="gcard static"><b>League rewards</b><small>Loading your earned decorations…</small></div></div>
    <h3 class="gh">Special badges</h3><div class="ggrid">${Object.keys(BADGES).map(b => tile(BADGES[b][1], b === 'egg' && !hasBadge(b) ? '???' : BADGES[b][0], BADGES[b][2], hasBadge(b))).join('')}</div>
    <h3 class="gh">Module medals</h3><div class="ggrid">${q.filter(byId).map(id => { const m = medal(id); return tile(MEDALS[m], byId(id).title, ['Not earned yet', 'Bronze', 'Silver', 'Gold'][m], m > 0); }).join('')}</div>
    <h3 class="gh">Lab achievements</h3><div class="ggrid">${ACH.map(a => tile(a.icon, a.name, a.desc, !!P.ach[a.id])).join('')}</div>
    <h3 class="gh">Recent core-lab runs</h3>${P.runs.length ? `<div class="gcard static" style="--l:#fff;--d:#ffffff22"><table class="gruns"><tbody>${P.runs.slice(0, 5).map(r => `<tr><td>${new Date(r.ts || 0).toLocaleString()}</td><td>${r.packets} packets</td><td>${r.loss}% loss</td><td>${r.retries} retries</td><td>${r.ok ? '✅ delivered' : '⚠️ incomplete'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="gfoot">No runs yet. Try the core lab!</p>'}
    <div class="gcols"><a class="gcard" href="#/m/challenges" style="--l:#ffd1e1;--d:#ec4f9c"><span class="ge">🎯</span><b>Challenges and checks</b><small>Extra practice with levels 1 to 5.</small></a>
      <a class="gcard" href="#/m/glossary" style="--l:#bfe3ff;--d:#2f8cff"><span class="ge">📖</span><b>Glossary</b><small>Every term, searchable.</small></a></div></div>`;
  getLeagueDecorations().then(items => {
    const target = $('#leagueDecorations');
    if (!target) return;
    target.innerHTML = items.length ? items.map(item => `<div class="gcard static league-decoration"><span class="ge">${item.includes('diamond') ? '💎' : item.includes('platinum') ? '💠' : item.includes('gold') ? '🥇' : '🏅'}</span><b>${esc(item.replaceAll('-', ' ').replace('weekly top5 ', 'Weekly top 5 · '))}</b><small>Earned by finishing in the top 5 of a weekly batch.</small></div>`).join('') : '<div class="gcard static"><span class="ge">🎖️</span><b>No league decorations yet</b><small>Finish in the weekly top 5 to unlock an exclusive profile decoration.</small></div>';
  }).catch(() => {});
}

export function renderDaily() {
  const all = Object.keys(META).filter(i => META[i].q && byId(i)).flatMap(i => META[i].q), day = dayNum();
  const questions = dailyQuestionSet(all, day, 5);
  $('#dash').innerHTML = `<div class="ghome"><a class="gback" href="#/">‹ Map</a><h2 class="gh">⭐ Daily networking quiz</h2>
    <p class="gfoot">Five questions · one attempt per day · earn lifetime XP and weekly league points.</p>
    <div class="gstage" id="gstage"></div><div class="gbar"><button class="btn big" id="gnext" type="button" hidden></button></div></div>`;
  const stage = $('#gstage'), next = $('#gnext');
  if (P.stats.dailyDay === day) {
    stage.innerHTML = '<div class="greward"><div class="gmedal">✅</div><h3>Daily quiz completed</h3><p>Come back tomorrow for a new set of questions.</p></div>';
    next.hidden = false; next.textContent = 'Back to map ▸'; next.onclick = () => (location.hash = '#/');
    return;
  }
  runQuiz(stage, questions, questions.map((_, i) => 'Daily · ' + (i + 1) + '/' + questions.length), async right => {
    const gained = dailyQuizXp(right, questions.length);
    try {
      const awarded = await awardLeagueXp(gained, 'daily:' + day);
      if (!awarded) {
        stage.innerHTML = '<div class="greward"><div class="gmedal">✅</div><h3>Daily quiz already recorded</h3><p>Your score has already been counted for today.</p></div>';
        next.textContent = 'Back to map ▸'; next.hidden = false; next.onclick = () => (location.hash = '#/');
        return;
      }
      P.stats.dailyDay = day;
      addXp(gained);
      checkMeta();
      if (right === questions.length) boom();
      stage.innerHTML = `<div class="greward"><div class="gmedal">${right === questions.length ? '🌟' : '💪'}</div><h3>${right}/${questions.length} correct · +${gained} XP</h3><p>Your daily reward has been added to lifetime XP and this week's league score.</p></div>`;
      next.textContent = 'View weekly competition ▸'; next.hidden = false; next.onclick = () => (location.hash = '#/league');
    } catch (error) {
      stage.innerHTML = `<div class="greward"><div class="gmedal">⚠️</div><h3>Quiz completed, score not synced</h3><p>${esc(error.message || 'Check your connection and try again.')}</p></div>`;
      next.textContent = 'Retry score sync'; next.hidden = false;
      next.onclick = () => (location.hash = '#/daily');
    }
  });
}

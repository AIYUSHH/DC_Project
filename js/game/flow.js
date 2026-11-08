/**
 * module flow: Watch -> Play -> Quiz -> Reward around any registered module.
 * "Play" is the module's own mount(root), so every simulator keeps working unchanged.
 * Tools (journey, glossary, ...) and free play skip straight to Play with no quiz and no XP.
 */
import { $, esc } from '../core/utils.js';
import { DC } from '../core/state.js';
import { GROUPS } from '../modules/registry.js';
import { ZONES, META } from './data.js';
import { levelFor, medalFor, quizBadges, quizXp } from './rules.js';
import { MEDALS, addXp, checkMeta, grant, setMedal, visitXp, xp, BADGES, updatePill } from './store.js';
import { boom, gl } from './ui.js';
import { awardLeagueXp } from './league-service.js';
import { weekId } from './leagues.js';

const pos = (i, n) => 8 + (i * 84) / (n - 1);
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

/** Quiz runner shared by module quizzes and the daily challenge. `qs` = pipe strings, `labels` = tag per question. */
export function runQuiz(stage, qs, labels, onDone) {
  const items = qs.map(s => { const p = s.split('|'); return { q: p[0], a: p[1], o: shuffle(p.slice(1)) }; });
  const next = $('#gnext');
  let i = 0, right = 0;
  const t0 = Date.now();
  const show = () => {
    const it = items[i];
    next.hidden = true;
    stage.innerHTML = `<div class="gdots">${items.map((_, j) => `<i class="${j < i ? 'on' : j === i ? 'cur' : ''}"></i>`).join('')}</div>
      <span class="gchip">${labels[i]}</span><h3 class="gq">${esc(it.q)}</h3>
      <div class="gopts">${it.o.map(o => `<button class="gopt" type="button">${esc(o)}</button>`).join('')}</div><p class="gfb" aria-live="polite"></p>`;
    stage.querySelectorAll('.gopt').forEach(b => b.addEventListener('click', () => {
      const ok = b.textContent === it.a;
      if (ok) right++;
      stage.querySelectorAll('.gopt').forEach(x => {
        x.disabled = true;
        if (x.textContent === it.a) x.classList.add('good');
        else if (x === b) x.classList.add('bad');
      });
      stage.querySelector('.gfb').textContent = ok ? '🎉 Correct!' : 'Not quite. The answer is: ' + it.a;
      next.textContent = i < items.length - 1 ? 'Next question ▸' : 'Finish ▸';
      next.hidden = false;
      next.onclick = () => (++i < items.length ? show() : onDone(right, (Date.now() - t0) / 1000));
    }));
  };
  show();
}

export const LEVEL_LABELS = ['Easy', 'Easy', 'Medium', 'Medium', 'Hard'];

/** Applies the result of a finished module quiz to XP, medals and badges. Returns what to show. */
function applyResult(id, right, total, secs) {
  const gained = quizXp(right, total), m = medalFor(right, total);
  const before = levelFor(xp()).n;
  setMedal(id, m);
  addXp(gained);
  // League points are awarded once per module per competition week; lifetime XP remains unchanged.
  void awardLeagueXp(gained, 'module:' + weekId() + ':' + id).catch(error => console.warn('League score was not updated:', error));
  const fresh = quizBadges({ correct: right, total, secs, hour: new Date().getHours() }).filter(b => grant(b));
  fresh.push(...checkMeta());
  updatePill();
  return { gained, m, fresh, levelUp: levelFor(xp()).n > before };
}

export function renderFlow(mod, root, freePlay) {
  const meta = META[mod.id] || { z: 'tools', d: 'Easy', e: '🧩' };
  const zone = ZONES.find(z => z.id === meta.z);
  const hasFlow = !!(meta.q && meta.w) && !freePlay;
  const g = GROUPS.find(x => x.id === mod.group);
  const back = zone ? `#/zone/${zone.id}` : '#/';
  const order = [...Object.keys(META).filter(id => META[id].z === meta.z && DC.mods.some(m => m.id === id))];
  const nextMod = DC.mods.find(m => m.id === order[order.indexOf(mod.id) + 1]);
  const style = zone ? `--l:${zone.l};--d:${zone.d}` : '--l:#fff3c4;--d:#f2b705';
  let phase = hasFlow ? 'watch' : 'play', timer = 0, inner = null;

  root.innerHTML = `<div class="gflow" style="${style}">
    <div class="gtop"><a class="gback" href="${back}">‹ ${zone ? zone.name : 'Toolbox'}</a>
      <h2><span class="ge">${meta.e}</span> ${mod.title}</h2>
      <span class="gchip">${meta.q ? meta.d : 'Free play'}</span></div>
    <div class="gsteps" id="gsteps"></div>
    <div class="gstage" id="gstage"></div>
    <div class="gbar"><button class="btn big" id="gnext" type="button" hidden></button></div>
    <div class="gcols">
      <details class="gwhy" open><summary>Why does this matter?</summary><p>${gl(mod.desc)}</p>
        ${mod.obj ? `<ul>${mod.obj.map(o => `<li>${gl(o)}</li>`).join('')}</ul>` : ''}</details>
      <div class="gcard static"><b>${g ? g.name : ''}</b><small>${meta.q ? 'Flow: Watch, Play, Quiz, Badge. Your best medal is kept.' : 'A reference tool. Explore as long as you like.'}</small>
        ${nextMod ? `<a class="btn ghost sm" href="#/m/${nextMod.id}">Up next: ${nextMod.title} →</a>` : `<a class="btn ghost sm" href="${back}">Back to ${zone ? zone.name : 'toolbox'} →</a>`}</div>
    </div></div>`;
  const stage = $('#gstage'), next = $('#gnext');

  const pills = () => {
    const names = { watch: '👀 Watch', play: '🎮 Play', quiz: '❓ Quiz', reward: '🏅 Reward' };
    $('#gsteps').innerHTML = hasFlow ? Object.keys(names).map(k => `<span class="gpill2 ${k === phase ? 'on' : ''}">${names[k]}</span>`).join('') : '';
  };
  const go = p => { clearTimeout(timer); if (inner) { try { inner(); } catch (e) { console.error(e); } inner = null; } phase = p; pills(); ({ watch, play, quiz, reward })[p](); window.scrollTo(0, 0); };
  const setNext = (label, fn) => { next.textContent = label; next.hidden = false; next.onclick = fn; };

  function watch() {
    const w = meta.w, n = w.n.length;
    stage.className = 'gstage';
    stage.innerHTML = `<div class="glane">${w.n.map((x, i) => { const [e, t] = x.split('|'); return `<div class="gnode" style="left:${pos(i, n)}%"><b>${e}</b>${t}</div>`; }).join('')}
      <div class="gpkt" id="gpkt" style="left:${pos(0, n)}%">📦</div></div><p class="gcap" id="gcap">Watch the packet travel…</p>`;
    setNext('Skip ▸', () => go('play'));
    let k = 0;
    const tick = () => {
      if (k >= w.s.length) { setNext('Play ▸', () => go('play')); return; }
      const [to, msg, cap] = w.s[k++];
      const p = $('#gpkt'); if (!p) return;
      p.style.left = pos(to, n) + '%'; p.textContent = msg; $('#gcap').innerHTML = gl(cap);
      timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 600);
  }
  function play() {
    stage.className = 'gstage play';
    stage.innerHTML = '';
    try { inner = mod.mount(stage) || null; } catch (e) { console.error(e); stage.innerHTML = `<p class="gfb">This module failed to load: ${esc(e.message)}</p>`; }
    if (meta.q && !freePlay) setNext('Ready for the quiz ▸', () => go('quiz'));
    else if (!meta.q) { visitXp(mod.id); setNext(nextMod ? 'Next: ' + nextMod.title + ' ▸' : 'Done ▸', () => (location.hash = nextMod ? '#/m/' + nextMod.id : back)); }
    else setNext('Back to ' + zone.name + ' ▸', () => (location.hash = back));
  }
  let res = null;
  function quiz() {
    stage.className = 'gstage';
    runQuiz(stage, meta.q, LEVEL_LABELS, (r, secs) => { res = applyResult(mod.id, r, meta.q.length, secs); res.right = r; if (res.m > 0) boom(); go('reward'); });
  }
  function reward() {
    stage.className = 'gstage';
    const l = levelFor(xp());
    stage.innerHTML = `<div class="greward"><div class="gmedal">${MEDALS[res.m]}</div><h3>${res.right}/${meta.q.length} correct · +${res.gained} XP</h3>
      <p>${['No medal this time. Watch again and retry!', 'Bronze medal. Nice start!', 'Silver medal. Almost perfect!', 'Gold medal. Perfect score!'][res.m]}</p>
      ${res.levelUp ? `<p class="gup">🎉 Level up! You are now Lv ${l.n} · ${l.title}</p>` : ''}
      ${res.fresh.map(b => `<p class="gnew">${BADGES[b][1]} New badge: <b>${BADGES[b][0]}</b></p>`).join('')}
      <div class="gprog"><i style="width:${(l.into / l.size) * 100}%"></i></div><small>Lv ${l.n} · ${l.title} · ${l.into}/${l.size} XP to next level</small>
      <div class="gactions"><button class="btn ghost" id="gretry" type="button">↻ Retry quiz</button><button class="btn ghost" id="gwatch" type="button">👀 Watch again</button></div></div>`;
    $('#gretry').onclick = () => go('quiz');
    $('#gwatch').onclick = () => go('watch');
    setNext(nextMod ? 'Next: ' + nextMod.title + ' ▸' : 'Back to ' + zone.name + ' ▸', () => (location.hash = nextMod ? '#/m/' + nextMod.id : back));
  }
  pills();
  go(phase);
  return () => { clearTimeout(timer); if (inner) inner(); };
}


/** Shared weekly league batches stored in Firestore.
 *
 * Scores are client-submitted and therefore provisional. Before treating rankings or rewards as
 * tamper-resistant, route awardLeagueXp through a trusted Firebase/Azure function that validates
 * quiz attempts server-side. Never use these client writes as proof of achievement or entitlement.
 */
import { auth } from '../auth/firebase-client.js';
import { db } from '../auth/firebase-client.js';
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { LEAGUES, LEAGUE_SIZE, nextLeague, rankMembers, weekId, previousWeekId } from './leagues.js';

const profileRef = uid => doc(db, 'users', uid, 'league', 'profile');
const batchesRef = week => collection(db, 'leagueWeeks', week, 'batches');
const batchRef = (week, id) => doc(db, 'leagueWeeks', week, 'batches', id);
const safeName = user => (user.displayName || user.email?.split('@')[0] || 'Learner').slice(0, 32);

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to join the weekly competition.');
  return user;
}

export async function ensureLeagueMembership() {
  const user = requireUser();
  const currentWeek = weekId();
  const pRef = profileRef(user.uid);
  const newBatchRef = doc(batchesRef(currentWeek));

  await runTransaction(db, async tx => {
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists() ? pSnap.data() : {};
    if (profile.weekId === currentWeek && profile.batchId) return;

    let tier = profile.tier || 'bronze';
    if (profile.weekId && profile.batchId) {
      const oldSnap = await tx.get(batchRef(profile.weekId, profile.batchId));
      if (oldSnap.exists()) {
        const oldMembers = oldSnap.data().members || {};
        const ranked = rankMembers(oldMembers);
        const oldRank = ranked.find(x => x.uid === user.uid)?.rank || 0;
        if (oldRank) tier = nextLeague(tier, oldRank, ranked.length);
        if (oldRank > 0 && oldRank <= 5) {
          const decorations = Array.isArray(profile.decorations) ? profile.decorations : [];
          const reward = `weekly-top5-${tier}`;
          if (!decorations.includes(reward)) profile.decorations = [...decorations, reward];
        }
      }
    }

    const openQuery = query(batchesRef(currentWeek), where('tier', '==', tier), where('memberCount', '<', LEAGUE_SIZE), orderBy('memberCount'), limit(1));
    const openSnap = await tx.get(openQuery);
    const chosen = openSnap.docs[0];
    const targetRef = chosen ? chosen.ref : newBatchRef;
    const target = chosen?.data() || { tier, memberCount: 0, members: {} };
    const members = { ...(target.members || {}) };
    if (!members[user.uid] && target.memberCount >= LEAGUE_SIZE) throw new Error('This batch is full. Please retry.');
    members[user.uid] = members[user.uid] || {
      name: safeName(user), weeklyXp: 0, joinedAt: Date.now(), eventIds: []
    };

    tx.set(targetRef, {
      tier, memberCount: Object.keys(members).length, members, updatedAt: serverTimestamp()
    }, { merge: true });
    tx.set(pRef, {
      tier, weekId: currentWeek, batchId: targetRef.id,
      decorations: profile.decorations || [], updatedAt: serverTimestamp()
    }, { merge: true });
  });

  return getLeagueSnapshot();
}

export async function awardLeagueXp(amount, eventId) {
  const user = requireUser();
  const points = Math.max(0, Math.min(100, Math.floor(Number(amount) || 0)));
  if (!points || !eventId) return false;
  const profile = await ensureLeagueMembership();
  const ref = batchRef(profile.weekId, profile.batchId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Your weekly batch could not be found.');
    const data = snap.data(), members = { ...(data.members || {}) };
    const member = { ...(members[user.uid] || {}) };
    const events = Array.isArray(member.eventIds) ? member.eventIds : [];
    if (events.includes(eventId)) return false;
    member.weeklyXp = (Number(member.weeklyXp) || 0) + points;
    member.eventIds = [...events.slice(-99), eventId];
    members[user.uid] = member;
    tx.update(ref, { members, updatedAt: serverTimestamp() });
    return true;
  });
}

export async function getLeagueSnapshot() {
  const user = requireUser();
  const pSnap = await getDoc(profileRef(user.uid));
  if (!pSnap.exists()) return null;
  const profile = pSnap.data();
  if (profile.weekId !== weekId() || !profile.batchId) return null;
  const bSnap = await getDoc(batchRef(profile.weekId, profile.batchId));
  if (!bSnap.exists()) return null;
  const data = bSnap.data();
  const leaderboard = rankMembers(data.members || {});
  return {
    ...profile,
    league: LEAGUES.find(x => x.id === profile.tier) || LEAGUES[0],
    leaderboard,
    rank: leaderboard.find(x => x.uid === user.uid)?.rank || leaderboard.length,
    weeklyXp: leaderboard.find(x => x.uid === user.uid)?.weeklyXp || 0,
    memberCount: Number(data.memberCount) || leaderboard.length,
    weekId: profile.weekId,
  };
}

export async function getLeagueDecorations() {
  const user = requireUser();
  const snap = await getDoc(profileRef(user.uid));
  return snap.exists() ? (snap.data().decorations || []) : [];
}

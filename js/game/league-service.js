/** Shared weekly league batches stored in Firestore.
 *
 * Scores are client-submitted and therefore provisional. Users can only write their own member
 * document, not another learner's score. A trusted Firebase/Azure function is still required to
 * validate quiz attempts and prevent a user awarding themselves arbitrary XP.
 */
import { auth, db } from '../auth/firebase-client.js';
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { LEAGUES, LEAGUE_SIZE, nextLeague, rankMembers, weekId } from './leagues.js';

const profileRef = uid => doc(db, 'users', uid, 'league', 'profile');
const batchesRef = week => collection(db, 'leagueWeeks', week, 'batches');
const batchRef = (week, id) => doc(db, 'leagueWeeks', week, 'batches', id);
const membersRef = (week, id) => collection(db, 'leagueWeeks', week, 'batches', id, 'members');
const memberRef = (week, id, uid) => doc(db, 'leagueWeeks', week, 'batches', id, 'members', uid);
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

  // Once UTC weekId changes, the previous batch is frozen: compute this learner's final
  // rank from its member documents before entering the membership transaction.
  let previousRank = 0;
  const previousProfile = await getDoc(pRef);
  if (previousProfile.exists()) {
    const old = previousProfile.data();
    if (old.weekId && old.weekId !== currentWeek && old.batchId) {
      const oldMembers = await getDocs(query(membersRef(old.weekId, old.batchId), orderBy('weeklyXp', 'desc'), limit(LEAGUE_SIZE)));
      const ranked = rankMembers(Object.fromEntries(oldMembers.docs.map(item => [item.id, item.data()])));
      previousRank = ranked.find(item => item.uid === user.uid)?.rank || 0;
    }
  }

  // Find a candidate outside the transaction, then re-read it inside the transaction to handle
  // concurrent joins safely. Member scores live in separate per-user documents.
  await runTransaction(db, async tx => {
    const pSnap = await tx.get(pRef);
    const profile = pSnap.exists() ? pSnap.data() : {};
    if (profile.weekId === currentWeek && profile.batchId) return;

    let tier = profile.tier || 'bronze';
    if (profile.weekId && profile.weekId !== currentWeek && previousRank) {
      tier = nextLeague(tier, previousRank, LEAGUE_SIZE);
      if (previousRank <= 5) {
        const decorations = Array.isArray(profile.decorations) ? profile.decorations : [];
        const reward = `weekly-top5-${tier}`;
        if (!decorations.includes(reward)) profile.decorations = [...decorations, reward];
      }
    }

    const openQuery = query(batchesRef(currentWeek), where('tier', '==', tier), where('memberCount', '<', LEAGUE_SIZE), limit(10));
    const openSnap = await getDocs(openQuery);
    const chosen = openSnap.docs.find(item => Number(item.data().memberCount) < LEAGUE_SIZE);
    const targetRef = chosen ? chosen.ref : newBatchRef;
    const targetSnap = chosen ? await tx.get(targetRef) : null;
    const target = targetSnap?.exists() ? targetSnap.data() : { tier, memberCount: 0 };
    const ownMemberRef = memberRef(currentWeek, targetRef.id, user.uid);
    const ownMemberSnap = await tx.get(ownMemberRef);
    if (!ownMemberSnap.exists() && Number(target.memberCount) >= LEAGUE_SIZE) {
      throw new Error('This batch is full. Please retry.');
    }

    if (!ownMemberSnap.exists()) {
      tx.set(ownMemberRef, {
        name: safeName(user), weeklyXp: 0, joinedAt: Date.now(), eventIds: []
      });
      tx.set(targetRef, {
        tier, memberCount: Number(target.memberCount) + 1, updatedAt: serverTimestamp()
      }, { merge: true });
    }
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
  const ref = memberRef(profile.weekId, profile.batchId, user.uid);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Your league membership could not be found.');
    const member = snap.data();
    const events = Array.isArray(member.eventIds) ? member.eventIds : [];
    if (events.includes(eventId)) return false;
    tx.update(ref, {
      weeklyXp: (Number(member.weeklyXp) || 0) + points,
      eventIds: [...events.slice(-99), eventId],
      updatedAt: serverTimestamp()
    });
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
  const membersSnap = await getDocs(query(membersRef(profile.weekId, profile.batchId), orderBy('weeklyXp', 'desc'), limit(LEAGUE_SIZE)));
  const leaderboard = rankMembers(Object.fromEntries(membersSnap.docs.map(item => [item.id, item.data()])));
  const current = leaderboard.find(x => x.uid === user.uid);
  return {
    ...profile,
    league: LEAGUES.find(x => x.id === profile.tier) || LEAGUES[0],
    leaderboard,
    rank: current?.rank || leaderboard.length,
    weeklyXp: current?.weeklyXp || 0,
    memberCount: Number(bSnap.data().memberCount) || leaderboard.length,
    weekId: profile.weekId,
    uid: user.uid,
  };
}

export async function getLeagueDecorations() {
  const user = requireUser();
  const snap = await getDoc(profileRef(user.uid));
  return snap.exists() ? (snap.data().decorations || []) : [];
}

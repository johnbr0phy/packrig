/**
 * The locker and its loadouts, following a signed-in person between devices.
 *
 * One document per person, `lockers/{uid}`: { lib, updated_at }. The whole
 * library in one place because it is small (a few hundred items and a dozen
 * loadouts is ~40 KB, well under Firestore's 1 MB) and because it is only ever
 * read or written by its owner. The rule is three lines, see FIREBASE.md.
 *
 * Signed out nothing here runs: the locker lives in localStorage, exactly as
 * rigs did before accounts. On first sign-in the local library is merged
 * into the remote one (items by uid, loadouts by id) so nothing made before
 * signing in is lost.
 */
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { backend } from '../config.js';

export function attachLockerSync(app) {
  if (!backend() || !app.auth?.enabled || !app.pack) return;
  let db = null;
  try { db = getFirestore(getApp()); } catch { return; }
  let uid = null;
  let timer = null;

  const merge = (a, b) => {
    const items = new Map(a.locker.items.map((i) => [i.uid, i]));
    for (const i of b.locker.items) if (!items.has(i.uid)) items.set(i.uid, i);
    const los = new Map(a.loadouts.map((l) => [l.id, l]));
    for (const l of b.loadouts) {
      const cur = los.get(l.id);
      if (!cur || (l.updated || 0) > (cur.updated || 0)) los.set(l.id, l);
    }
    return { ...a, locker: { v: 1, items: [...items.values()] }, loadouts: [...los.values()], active: a.active || b.active };
  };

  async function pull() {
    uid = app.auth.user?.id || null;
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'lockers', uid));
      const remoteLib = snap.exists() ? snap.data().lib : null;
      const local = app.pack.lib;
      const next = remoteLib ? merge(remoteLib, local) : local;
      app.pack.replaceLib(next);
    } catch (e) {
      console.warn('[packrig] locker sync unavailable:', e?.code || e?.message || e);
    }
  }

  app.pack.attachRemote({
    push(lib) {
      if (!uid) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setDoc(doc(db, 'lockers', uid), { lib: JSON.parse(JSON.stringify(lib)), updated_at: new Date().toISOString() })
          .catch((e) => console.warn('[packrig] could not save the locker:', e?.code || e));
      }, 1500);
    },
  });
  app.auth.onChange(() => { if (app.auth.user?.id !== uid) pull(); });
  pull();
}

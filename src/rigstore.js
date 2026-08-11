/**
 * Saved rigs: on this device when signed out, in Firestore when signed in.
 *
 * THE LOCAL PATH IS NOT A FALLBACK, it is the default. Packrig with no backend
 * configured saves rigs to localStorage and shares them as self-contained
 * links, and that is a complete product. Everything Firestore adds is: your
 * rigs follow you to another device, and they survive clearing your browser.
 * So every method below has two arms, and the local one is never worse than it
 * was before accounts existed.
 *
 * SHAPE, one document per rig in the `rigs` collection:
 *   uid           the owner. Every rule in FIREBASE.md keys off this.
 *   name          what the person called it
 *   rig           the whole captured rig, as one nested object
 *   updated_at    ISO string, so local and remote rows sort together
 *   published     bool, and `author` + `published_at` once it is
 *
 * WHY A FLAT COLLECTION rather than `users/{uid}/rigs`: the gallery has to read
 * across everybody, and a collection-group query would need its own index and
 * its own rule anyway. One collection with a `uid` field keeps the rules
 * readable, which matters more than the nesting — see FIREBASE.md, where the
 * whole policy is nine lines.
 *
 * The exported surface is unchanged from the Supabase store this replaces, so
 * `rigsui.js` did not have to move.
 */

import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore,
  limit as fsLimit, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';

import { captureRig } from './rig.js';
import { backend } from './config.js';

const LOCAL_KEY = 'packrig_rigs';
const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const readLocal = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};
const writeLocal = (rows) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); return true; }
  catch { return false; }
};

export function createRigStore(app, auth) {
  const cfg = backend();
  let db = null;
  if (cfg) {
    try { db = getFirestore(getApp()); }
    catch (e) { console.warn('[packrig] rig sync disabled:', e.message); }
  }

  const remote = () => !!db && auth.enabled && auth.signedIn;
  const rigs = () => collection(db, 'rigs');
  const me = () => auth.user?.id;

  /** A Firestore snapshot in the shape the UI already expects. */
  const row = (d) => {
    const v = d.data();
    return {
      id: d.id,
      name: v.name,
      rig: v.rig,
      updated_at: v.updated_at || '',
      published: !!v.published,
      author: v.author || '',
      published_at: v.published_at || null,
      local: false,
    };
  };

  const api = {
    get remote() { return remote(); },

    /**
     * Whether a gallery is possible at all. rigsui.js hides every publish and
     * browse control when this is false, so on a local-only build the app never
     * offers something it cannot do. Absent, it reads as `undefined` and the
     * gallery quietly disappears with no error — which is how a feature gets
     * built, shipped and never seen.
     */
    get galleryEnabled() { return !!db; },

    /** Newest first. Shape: { id, name, rig, updated_at, local } */
    async list() {
      if (!remote()) {
        return readLocal()
          .slice()
          .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
          .map((r) => ({ ...r, local: true }));
      }
      const snap = await getDocs(query(rigs(), where('uid', '==', me()), orderBy('updated_at', 'desc')));
      return snap.docs.map(row);
    },

    /** Save the bike as it stands. */
    async save(name) {
      const rig = captureRig(app, { name });
      const now = new Date().toISOString();
      if (!remote()) {
        const rows = readLocal();
        const r = { id: uid(), name, rig, updated_at: now };
        rows.push(r);
        if (!writeLocal(rows)) throw new Error('This browser will not let the app store anything — private mode?');
        return { ...r, local: true };
      }
      const ref = await addDoc(rigs(), {
        uid: me(), name, rig, updated_at: now, created_at: serverTimestamp(), published: false,
      });
      return { id: ref.id, name, rig, updated_at: now, local: false };
    },

    async update(id, { name } = {}) {
      const rig = captureRig(app, { name });
      const now = new Date().toISOString();
      if (!remote()) {
        const rows = readLocal();
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) throw new Error('That rig is no longer here');
        rows[i] = { ...rows[i], name: name ?? rows[i].name, rig, updated_at: now };
        writeLocal(rows);
        return { ...rows[i], local: true };
      }
      const ref = doc(db, 'rigs', id);
      const patch = { rig, updated_at: now };
      if (name != null) patch.name = name;
      await updateDoc(ref, patch);
      const after = await getDoc(ref);
      return row(after);
    },

    async rename(id, name) {
      if (!remote()) {
        const rows = readLocal();
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) return null;
        rows[i] = { ...rows[i], name, updated_at: new Date().toISOString() };
        writeLocal(rows);
        return { ...rows[i], local: true };
      }
      const ref = doc(db, 'rigs', id);
      await updateDoc(ref, { name, updated_at: new Date().toISOString() });
      return row(await getDoc(ref));
    },

    async remove(id) {
      if (!remote()) {
        writeLocal(readLocal().filter((r) => r.id !== id));
        return;
      }
      await deleteDoc(doc(db, 'rigs', id));
    },

    /**
     * Send this device's rigs up to the account, once each. Called after a
     * successful sign-in. Failures are swallowed on purpose — a sync problem
     * must not stop somebody signing in, and the local copy is still there.
     */
    async migrateLocal() {
      if (!remote()) return { pushed: 0 };
      const rows = readLocal();
      const todo = rows.filter((r) => !r.pushed);
      if (!todo.length) return { pushed: 0 };
      let pushed = 0;
      for (const r of todo) {
        try {
          await addDoc(rigs(), {
            uid: me(),
            name: r.name || 'Untitled',
            rig: r.rig,
            updated_at: r.updated_at || new Date().toISOString(),
            created_at: serverTimestamp(),
            published: false,
          });
          r.pushed = true;
          pushed++;
        } catch { /* leave it unpushed; it will try again next sign-in */ }
      }
      writeLocal(rows);
      return { pushed };
    },

    /**
     * Publish to the gallery, or take it back down.
     *
     * A local rig cannot be published: it exists only in this browser, so there
     * is nothing for anyone else to read.
     */
    async setPublished(id, published, author) {
      if (!remote()) throw new Error('Publishing needs an account — sign in first');
      const patch = {
        published: !!published,
        published_at: published ? new Date().toISOString() : null,
      };
      if (published) patch.author = String(author || '').trim().slice(0, 40) || 'Anonymous';
      const ref = doc(db, 'rigs', id);
      await updateDoc(ref, patch);
      return row(await getDoc(ref));
    },

    /**
     * Everything anyone has published, newest first. Works signed out — that is
     * the whole point of a gallery.
     *
     * The rules in FIREBASE.md allow reading a document only when
     * `published == true`, so a stranger's query can never return a private
     * rig. The `uid` field rides along in the document; it is a Firebase user
     * id, which is opaque and not an email address, and the gallery UI does not
     * display it.
     */
    async gallery({ limit = 60 } = {}) {
      if (!db) return [];
      try {
        const snap = await getDocs(query(
          rigs(),
          where('published', '==', true),
          orderBy('published_at', 'desc'),
          fsLimit(limit),
        ));
        return snap.docs.map(row);
      } catch (e) {
        // A missing composite index is the one failure here that is a setup
        // problem rather than a bug, and Firebase puts a create-it link in the
        // message. Surfacing it beats an empty gallery with no explanation.
        console.warn('[packrig] gallery query failed:', e.message);
        return [];
      }
    },

    /** Only meaningful signed out — signed in, the account is the count. */
    localCount: () => readLocal().length,
  };
  return api;
}

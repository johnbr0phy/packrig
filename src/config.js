/**
 * Backend configuration.
 *
 * Packrig runs perfectly well with these blank: rigs save to this browser and
 * sharing is a self-contained link. Filling them in adds accounts, so a rig
 * follows you between devices and survives clearing your browser.
 *
 * EVERY VALUE HERE IS PUBLIC. A Firebase web config is designed to ship in a
 * client bundle — it names the project, it does not grant access to it. What
 * actually protects anyone's data is the Firestore security rules in
 * `FIREBASE.md`, which are not optional: with the default open rules, this
 * config would let anyone read and write every rig. There is no private key in
 * a web app, so never paste a service-account JSON here; that one does bypass
 * the rules.
 *
 * Fill these in from Firebase console → Project settings → General → Your apps
 * → SDK setup and configuration → Config.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAsfc-J1aZO0bkbin7pH39ic497mWwRBxA',
  authDomain: 'packrig.firebaseapp.com',
  projectId: 'packrig',
  appId: '1:718050135146:web:505c1929a788d0bda84e13',
  // storageBucket and messagingSenderId are in the console's snippet too. They
  // are only needed for Cloud Storage and Cloud Messaging, neither of which
  // this app uses, so they are deliberately omitted rather than carried as
  // dead config.
};

/**
 * A local override, so the config can be tried on a deployed build without a
 * rebuild — paste into the console and reload:
 *   localStorage.packrig_firebase = JSON.stringify({apiKey:'…', authDomain:'…', projectId:'…', appId:'…'})
 */
function override() {
  try {
    const raw = localStorage.getItem('packrig_firebase');
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o?.apiKey && o?.projectId ? o : null;
  } catch {
    return null;
  }
}

/**
 * The active config, or null when accounts are switched off.
 *
 * Returning null rather than a half-filled object is deliberate: every caller
 * checks `auth.enabled` once, and a project id with no api key would otherwise
 * fail later, deeper, with a worse message.
 */
export function backend() {
  const o = override();
  if (o) return { ...FIREBASE_CONFIG, ...o };
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId ? FIREBASE_CONFIG : null;
}

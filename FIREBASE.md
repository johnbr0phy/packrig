# Accounts for Packrig, with Firebase

Packrig works without any of this. With no backend configured, rigs save to
this browser and a share link carries the whole bike inside it, which is what
ships today and is fully usable. Everything below adds one thing: **your rigs
follow you between devices, and survive clearing your browser.**

Sign-in is **Google** and **email + password**.

Setting it up is five things in the Firebase console and one paste into
`src/config.js`. Twenty minutes, and steps 3 and 5 are the ones that actually
matter.

---

## 1. Make the project

console.firebase.google.com → **Add project**. Call it whatever you like;
analytics is not needed and can be switched off.

Then **Project settings → General → Your apps → Web (`</>`)** and register an
app. Firebase shows you a config object. That is what goes in step 5.

## 2. Turn on the two sign-in methods

**Authentication → Get started → Sign-in method.**

- **Email/Password** → enable. Leave "Email link (passwordless)" off.
- **Google** → enable, pick a support email, save.

If either is off, the app reports it in plain words rather than failing
mysteriously — `auth/operation-not-allowed` is mapped to a sentence in
`src/auth.js`.

## 3. Authorise the domains you will actually use

**Authentication → Settings → Authorised domains.** `localhost` is there by
default. Add:

```
johnbr0phy.github.io
```

**This is the step people miss.** Without it, Google sign-in fails on the live
site while working perfectly on your laptop, which is a confusing hour. The app
names this specific cause when it sees `auth/unauthorized-domain`.

## 4. Create the database, then lock it down

**Firestore Database → Create database → Production mode.** Pick a region near
you; it cannot be changed later.

Then **Rules**, and replace what is there with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rigs/{rigId} {
      // Anyone may read a rig that has been published to the gallery.
      // Otherwise only the owner may read it.
      allow read: if resource.data.published == true
                  || (request.auth != null && request.auth.uid == resource.data.uid);

      // You may only create a rig that says it is yours.
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;

      // You may only change or delete your own, and you may not hand it to
      // somebody else by rewriting uid.
      allow update: if request.auth != null
                    && request.auth.uid == resource.data.uid
                    && request.resource.data.uid == resource.data.uid;
      allow delete: if request.auth != null && request.auth.uid == resource.data.uid;
    }
  }
}
```

**Do not skip this and do not leave the database in test mode.** Test mode
allows the world to read and write every document, and it expires after 30 days
into allowing nobody, so the app appears to work and then silently stops. The
rules above are the whole security model: the config in the bundle is public and
is *supposed* to be, and these nine lines are what actually protect anyone's
rigs.

### The one index you need

The gallery sorts published rigs by date, which is a composite query. Firestore
will refuse it once and put a **create the index** link in the browser console —
open that link, click create, wait a minute. Alternatively, **Firestore →
Indexes → Composite → Add**: collection `rigs`, fields `published` (Ascending)
then `published_at` (Descending).

The app logs this specific failure rather than showing an empty gallery with no
explanation.

## 5. Paste the config

Into `src/config.js`:

```js
export const FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  appId: '1:…:web:…',
};
```

Then rebuild and deploy:

```
node tools/build-pages.mjs
```

**Every value there is public.** A Firebase web config identifies the project;
it does not grant access to it. There is no private key in a web app — never
paste a service-account JSON into this repo.

### Trying it without a rebuild

To test against the deployed site before committing keys, paste into the browser
console and reload:

```js
localStorage.packrig_firebase = JSON.stringify({
  apiKey: '…', authDomain: '…', projectId: '…', appId: '…',
});
```

---

## What you get

| | Signed out | Signed in |
|---|---|---|
| Save a rig | this browser | your account |
| Open it on your phone | no | yes |
| Survives clearing the browser | no | yes |
| Share a link | yes | yes |
| Publish to the gallery | no | yes |

Rigs saved on a device before you sign in are **moved up to the account on your
first sign-in**, once each, and the local copy is left alone. If that sync
fails it is swallowed deliberately: a sync problem must not stop you signing in,
and nothing is lost.

## If something does not work

| What you see | Almost always |
|---|---|
| Google sign-in works locally, fails on the live site | domain not in step 3 |
| "That sign-in method is switched off" | step 2 |
| Gallery is empty but you published something | the composite index, step 4 |
| "Missing or insufficient permissions" | rules not applied, or `uid` missing on old documents |
| Nothing account-related appears at all | `src/config.js` is still blank — this is the intended off state |

## Cost

Firestore's free tier is 50,000 document reads and 20,000 writes a day. A rig is
one document. Opening the app reads only your own rigs, and the gallery is
capped at 60. This will not approach the free tier without thousands of daily
users.

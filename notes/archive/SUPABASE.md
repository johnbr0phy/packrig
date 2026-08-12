# Turning on accounts

> **Archived 12 Aug 2026.** This backend was never wired. Firebase is
> what `src/config.js` and `FIREBASE.md` describe. Kept as the rejected
> alternative.

Packrig works without any of this. With no backend configured, rigs save to the
browser and sharing is a self-contained link — that is the state the app ships
in today, and it is fully usable. Everything below adds one thing: **your rigs
follow you between devices and survive clearing your browser.**

Three steps, about ten minutes.

---

## 1. Make the project

1. <https://supabase.com> → new project. Any region near you; the free tier is
   more than enough for this.
2. **Project Settings → API.** Copy two values:
   - `Project URL` — looks like `https://abcdefgh.supabase.co`
   - `anon` `public` key — a long JWT

**Do not copy the `service_role` key.** It bypasses every access rule below.
The `anon` key is designed to ship in a browser bundle; it identifies the
project and grants nothing on its own.

---

## 2. Create the table and lock it down

**SQL Editor → New query**, paste this whole block, run it.

```sql
create table if not exists public.rigs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Untitled rig',
  rig         jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The list is always "my rigs, newest first".
create index if not exists rigs_user_updated_idx
  on public.rigs (user_id, updated_at desc);

-- Row-level security is what actually protects the data. Without it the anon
-- key would let anyone read every row in this table. It is not optional.
alter table public.rigs enable row level security;

create policy "read own rigs"   on public.rigs for select using (auth.uid() = user_id);
create policy "insert own rigs" on public.rigs for insert with check (auth.uid() = user_id);
create policy "update own rigs" on public.rigs for update using (auth.uid() = user_id);
create policy "delete own rigs" on public.rigs for delete using (auth.uid() = user_id);

-- The client never sends user_id, so the row is stamped with whoever is
-- signed in. A client that tried to send someone else's id would be refused
-- by the insert policy anyway; this means it never has to.
alter table public.rigs alter column user_id set default auth.uid();

-- ---- the public gallery -------------------------------------------------
-- Publishing is a flag on your own rig, plus a display name you choose. The
-- account email is deliberately not part of this: it is the one thing an
-- account holder never opted to make public.
alter table public.rigs add column if not exists published    boolean not null default false;
alter table public.rigs add column if not exists published_at timestamptz;
alter table public.rigs add column if not exists author       text;

create index if not exists rigs_published_idx
  on public.rigs (published_at desc) where published;

-- A second SELECT policy. Postgres ORs permissive policies together, so this
-- adds "anyone may read published rigs" WITHOUT widening access to private
-- ones — those are still owner-only via the policy above.
drop policy if exists "read published rigs" on public.rigs;
create policy "read published rigs" on public.rigs for select using (published);

-- The gallery reads this VIEW, never the table, so a query cannot accidentally
-- return user_id next to somebody's bike.
--
-- `security_invoker = true` is doing real work here: without it a view runs
-- with its OWNER's rights and BYPASSES row-level security entirely, which
-- would publish every private rig in the table. Do not remove it.
create or replace view public.public_rigs
  with (security_invoker = true) as
  select id, name, author, rig, published_at
  from public.rigs
  where published;

grant select on public.public_rigs to anon, authenticated;

-- Keep updated_at honest even if a client forgets to send it.
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists rigs_touch on public.rigs;
create trigger rigs_touch before update on public.rigs
  for each row execute function public.touch_updated_at();
```

Check it took: **Table Editor → rigs** should show the table with a green
*RLS enabled* badge. If that badge says RLS is disabled, stop and fix it — the
table is world-readable until it is on.

---

## 3. Point the app at it

Edit `src/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi…';
```

Then rebuild and ship as usual:

```bash
node tools/build-pages.mjs
```

**To try it before committing the keys**, paste this in the browser console on
the live site and reload — no rebuild needed:

```js
localStorage.packrig_supabase = JSON.stringify({ url: 'https://…', key: 'eyJ…' })
```

---

## What you get, and what to expect

- **My rigs** in the kit panel: name and save the current bike, load any saved
  one back, update one in place, delete, and copy a share link for it.
- **Sign in** appears only once the keys are set. Before that the panel says
  "Saved on this device" and never mentions accounts.
- **Signing in moves this device's rigs onto the account**, once each. They are
  not deleted locally — a shared computer should not eat the rigs of whoever
  used it before you.

### Email confirmation is on by default

A new account gets a confirmation email before it can sign in, and the app says
so rather than pretending you are in. Supabase's built-in mailer is rate
limited to a handful an hour, which is fine for you and not for real users — if
this ever goes wider, set a proper SMTP sender under
**Authentication → Emails**. You can switch confirmation off entirely under
**Authentication → Providers → Email** while testing.

### The gallery is public, and that has consequences

Two free-text fields become visible to strangers: the rig's name and the
display name of whoever published it. They are capped at 60 and 40 characters
and are always rendered with `textContent`, so nothing anyone types can inject
markup — but nothing stops someone publishing a rude name.

There is no reporting or moderation queue, deliberately: building one before a
single rig has been published would be inventing a problem. What you have
instead is the dashboard. To take anything down:

```sql
update public.rigs set published = false where id = '…';
```

If the gallery ever gets real traffic, the things to add first are a report
button and a rate limit on publishing — say, five per account per day.

### Password reset needs a redirect URL

**Authentication → URL Configuration** → add `https://johnbr0phy.github.io/packrig/`
to *Redirect URLs*, or the reset link will bounce.

---

## What is deliberately not here

- **No password is ever stored, hashed or handled by this app.** Supabase does
  that. `src/auth.js` posts the password to their endpoint and forgets it.
- **Sessions live in `localStorage`**, which is the normal trade for a static
  site with no server to set an httpOnly cookie. It means a successful XSS
  could steal a session. The mitigation is that the app injects no untrusted
  HTML — every user-supplied string goes through `textContent`. If that ever
  stops being true, revisit this.
- **Sharing needs none of the above.** A share link carries the whole rig, so
  it works signed out, works for someone with no account, and cannot change
  after you send it.

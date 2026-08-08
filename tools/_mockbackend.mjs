/**
 * A stand-in for Supabase, so the account and gallery code can be tested
 * without a real project — and so a regression in it is caught here rather
 * than by a person discovering their rigs will not load.
 *
 * It implements only what src/auth.js and src/rigstore.js actually call, with
 * the same shapes and the same error envelope. It is NOT a security model:
 * tokens are opaque strings and there is no hashing. The real protection is
 * the row-level security policy in SUPABASE.md; what this proves is that the
 * CLIENT asks the right questions and handles the answers.
 *
 *   node tools/_mockbackend.mjs [port]      # default 8799
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || 8799);
const users = new Map();      // email -> { id, email, password }
const tokens = new Map();     // access token -> user id
const rows = [];              // rigs

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const send = (res, code, body) => {
  const s = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': '*',
  });
  res.end(s);
};

const body = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});

/** Whoever the bearer token belongs to, or null for the anon key. */
const userOf = (req) => {
  const h = req.headers.authorization || '';
  const t = h.replace(/^Bearer\s+/i, '');
  const id = tokens.get(t);
  return id ? [...users.values()].find((u) => u.id === id) : null;
};

const session = (u) => {
  const access = 'at_' + uuid();
  tokens.set(access, u.id);
  return {
    access_token: access,
    refresh_token: 'rt_' + u.id,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: u.id, email: u.email },
  };
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- auth ---------------------------------------------------------------
  if (p === '/auth/v1/signup') {
    const { email, password } = await body(req);
    if (!email || !password) return send(res, 400, { msg: 'Email and password required' });
    if (users.has(email)) return send(res, 400, { msg: 'User already registered' });
    const u = { id: uuid(), email, password };
    users.set(email, u);
    // Mirrors a project with email confirmation OFF, so the test can go
    // straight on. The confirmation path is exercised by signup_confirm below.
    return send(res, 200, session(u));
  }
  if (p === '/auth/v1/signup_confirm') {           // test hook, not a real endpoint
    const { email, password } = await body(req);
    users.set(email, { id: uuid(), email, password });
    return send(res, 200, { user: { email } });    // no session -> "check your email"
  }
  if (p === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    const b = await body(req);
    if (grant === 'password') {
      const u = users.get(b.email);
      if (!u || u.password !== b.password) {
        return send(res, 400, { error_description: 'Invalid login credentials' });
      }
      return send(res, 200, session(u));
    }
    if (grant === 'refresh_token') {
      const id = String(b.refresh_token || '').replace(/^rt_/, '');
      const u = [...users.values()].find((x) => x.id === id);
      if (!u) return send(res, 400, { error_description: 'Invalid refresh token' });
      return send(res, 200, session(u));
    }
    return send(res, 400, { msg: 'Unsupported grant' });
  }
  if (p === '/auth/v1/user') {
    const u = userOf(req);
    if (!u) return send(res, 401, { msg: 'Not signed in' });
    return send(res, 200, { id: u.id, email: u.email });
  }
  if (p === '/auth/v1/logout') { return send(res, 204); }
  if (p === '/auth/v1/recover') { return send(res, 200, {}); }

  // ---- rest ---------------------------------------------------------------
  const idEq = (url.searchParams.get('id') || '').replace(/^eq\./, '');

  if (p === '/rest/v1/rigs') {
    const u = userOf(req);
    if (!u) return send(res, 401, { message: 'Not signed in' });   // stands in for RLS
    if (req.method === 'GET') {
      return send(res, 200, rows.filter((r) => r.user_id === u.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    }
    if (req.method === 'POST') {
      const b = await body(req);
      const now = new Date().toISOString();
      const row = {
        id: uuid(), user_id: u.id, name: b.name || 'Untitled rig', rig: b.rig,
        published: false, author: null, published_at: null,
        created_at: now, updated_at: now,
      };
      rows.push(row);
      return send(res, 201, [row]);
    }
    if (req.method === 'PATCH') {
      const b = await body(req);
      const row = rows.find((r) => r.id === idEq && r.user_id === u.id);
      if (!row) return send(res, 404, { message: 'Not found' });
      Object.assign(row, b, { updated_at: new Date().toISOString() });
      return send(res, 200, [row]);
    }
    if (req.method === 'DELETE') {
      const i = rows.findIndex((r) => r.id === idEq && r.user_id === u.id);
      if (i >= 0) rows.splice(i, 1);
      return send(res, 204);
    }
  }

  // The public view: readable with the anon key, and it exposes NO user_id.
  if (p === '/rest/v1/public_rigs' && req.method === 'GET') {
    const out = rows.filter((r) => r.published)
      .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
      .map(({ id, name, author, rig, published_at }) => ({ id, name, author, rig, published_at }));
    return send(res, 200, out);
  }

  send(res, 404, { message: `No route for ${req.method} ${p}` });
}).listen(PORT, () => console.log(`mock supabase on http://localhost:${PORT}`));

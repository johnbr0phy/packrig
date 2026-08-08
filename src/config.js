/**
 * Backend configuration.
 *
 * Packrig runs perfectly well with these blank: rigs save to this browser and
 * sharing is a self-contained link. Filling them in adds accounts, so a rig
 * follows you between devices and survives clearing your browser.
 *
 * BOTH VALUES ARE PUBLIC. The anon key is designed to ship in a client bundle —
 * it identifies the project, it does not grant access. What actually protects
 * anyone's data is the row-level security policy in `SUPABASE.md`, which
 * is not optional: without RLS the anon key would let anyone read every row.
 * Never put the `service_role` key here; that one does bypass RLS.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

/**
 * A local override, so the keys can be tried on a deployed build without a
 * rebuild — paste them into the console and reload:
 *   localStorage.packrig_supabase = JSON.stringify({url:'…', key:'…'})
 */
function override() {
  try {
    const raw = localStorage.getItem('packrig_supabase');
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o?.url && o?.key ? { url: String(o.url), key: String(o.key) } : null;
  } catch { return null; }
}

export function backend() {
  const o = override();
  const url = (o?.url || SUPABASE_URL).replace(/\/+$/, '');
  const key = o?.key || SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/** True when accounts are available at all. Everything else degrades quietly. */
export const hasBackend = () => !!backend();

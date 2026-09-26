/**
 * Remove rules from the legacy stylesheets, surface by surface.
 *
 *   node tools/css-strip.mjs <regex> [--files a.css,b.css] [--dry]
 *
 * Every selector in every rule (including inside @media / @supports) is
 * tested against <regex>. Selectors that match are removed from their rule;
 * a rule left with no selectors is removed; an at-rule left empty is removed.
 * Comments directly above a removed rule go with it. Used while the eight
 * re-skin layers were absorbed into one stylesheet per surface: each surface
 * got its new rules, then its old ones were stripped by class prefix.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const argv = process.argv.slice(2);
const re = new RegExp(argv[0]);
const dry = argv.includes('--dry');
const files = argv.includes('--files') ? argv[argv.indexOf('--files') + 1].split(',')
  : ['src/ui.css', 'src/ui/theme.css', 'src/ui/sheet.css', 'src/ui/v2/builder.css', 'src/ui/v2/menu.css', 'src/pack/pack.css', 'src/aero/aero.css'];

/** Parse a block of CSS into [{type:'rule'|'at'|'other', text, sel?, body?, children?, lead}] */
function parse(css) {
  const out = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    // leading whitespace + comments belong to the next node
    let lead = '';
    for (;;) {
      const m = /^\s+/.exec(css.slice(i));
      if (m) { lead += m[0]; i += m[0].length; }
      if (css.startsWith('/*', i)) {
        const e = css.indexOf('*/', i + 2);
        const end = e < 0 ? n : e + 2;
        lead += css.slice(i, end);
        i = end;
        continue;
      }
      break;
    }
    if (i >= n) { out.push({ type: 'other', text: '', lead }); break; }
    // read the prelude up to { or ;
    let j = i, depth = 0;
    while (j < n && css[j] !== '{' && css[j] !== ';') {
      if (css[j] === '(') depth++;
      if (css[j] === ')') depth--;
      if (css.startsWith('/*', j)) { j = css.indexOf('*/', j + 2) + 2; continue; }
      if (css[j] === '"' || css[j] === "'") { const q = css[j]; j = css.indexOf(q, j + 1) + 1; continue; }
      j++;
    }
    const prelude = css.slice(i, j);
    if (css[j] === ';') { out.push({ type: 'other', text: prelude + ';', lead }); i = j + 1; continue; }
    // find the matching }
    let k = j + 1, d = 1;
    while (k < n && d > 0) {
      if (css.startsWith('/*', k)) { k = css.indexOf('*/', k + 2) + 2; continue; }
      if (css[k] === '"' || css[k] === "'") { const q = css[k]; k = css.indexOf(q, k + 1) + 1; continue; }
      if (css[k] === '{') d++;
      else if (css[k] === '}') d--;
      k++;
    }
    const body = css.slice(j + 1, k - 1);
    if (prelude.trim().startsWith('@')) {
      const nested = /^@(media|supports|container|layer)/.test(prelude.trim());
      out.push(nested ? { type: 'at', prelude, children: parse(body), lead } : { type: 'other', text: `${prelude}{${body}}`, lead });
    } else {
      out.push({ type: 'rule', sel: prelude, body, lead });
    }
    i = k;
  }
  return out;
}

function splitSel(s) {
  const parts = [];
  let d = 0, cur = '';
  for (const c of s) {
    if (c === '(' || c === '[') d++;
    if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

let removed = 0, trimmed = 0;
function filter(nodes) {
  const out = [];
  for (const nd of nodes) {
    if (nd.type === 'rule') {
      const sels = splitSel(nd.sel);
      const keep = sels.filter((s) => !re.test(s));
      if (!keep.length) { removed++; continue; }
      if (keep.length < sels.length) { trimmed++; nd.sel = keep.join(',\n') + ' '; }
      out.push(nd);
    } else if (nd.type === 'at') {
      nd.children = filter(nd.children);
      if (!nd.children.some((c) => c.type !== 'other' || c.text.trim())) { removed++; continue; }
      out.push(nd);
    } else out.push(nd);
  }
  return out;
}
function print(nodes) {
  return nodes.map((nd) => {
    if (nd.type === 'rule') return `${nd.lead}${nd.sel}{${nd.body}}`;
    if (nd.type === 'at') return `${nd.lead}${nd.prelude}{${print(nd.children)}\n}`;
    return `${nd.lead}${nd.text}`;
  }).join('');
}

for (const f of files) {
  let css;
  try { css = readFileSync(root + f, 'utf8'); } catch { continue; }
  removed = 0; trimmed = 0;
  const next = print(filter(parse(css))).replace(/\n{3,}/g, '\n\n');
  console.log(`${f}: ${removed} rules removed, ${trimmed} trimmed, ${css.split('\n').length} -> ${next.split('\n').length} lines`);
  if (!dry) writeFileSync(root + f, next);
}
